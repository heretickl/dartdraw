// In-memory stand-in for api/_lib/db.js `sql`, for the live-scoring code: api/_lib/live.js, the handlers in api/_routes/live/
// and api/_lib/throttle.js (the login limit). Dev tooling in the style of fake-score-db.js; later tasks extend it with the
// statements their code issues.
//
//   const db = createFakeLiveDb({ tournaments });   // tournaments: { id: { data, updated_at, created_by } } (shared ok)
//   db.logins: [{ tournament_id, username, password_hash, password_shown, session_nonce, created_at }]
//   db.devices: [{ id, tournament_id, board, session_nonce, last_seen_at, logged_out_at, unsent, created_at }]
//   db.matches: [{ tournament_id, pos, state, device_id, board, played_on_board, paper, retired_side, started_at, ended_at, summary, changed_by_organiser }]
//   db.turns: [{ id, tournament_id, pos, leg, side, player, entered, device_id, supersedes, ignored, ignored_reason, created_at }]
//   db.lends: [{ id, tournament_id, from_board, to_board, started_at, ended_at }]
//   db.takeovers: [{ id, tournament_id, pos, from_device, to_device, decided_by, answer, created_at, decided_at }]
//   db.calls: [{ text, vals }]; db.before = (text, vals) => {} runs before each statement; db.failWith = (text) => code|null
//   db.setNow(ms) / db.advance(ms): the database clock (now()), for throttle windows
//
// It recognises ONLY the statements the code issues (by the normalised text) and throws for anything else, so a changed
// query fails loudly. JavaScript stands in for the SQL.
function createFakeLiveDb(opts) {
  opts = opts || {};
  let now = opts.now || Date.parse('2026-11-05T02:00:00.000Z');
  const db = { tournaments: opts.tournaments || {}, logins: [], devices: [], matches: [], turns: [], lends: [], takeovers: [], throttle: {}, calls: [], before: null, failWith: null };
  db.setNow = (ms) => { now = ms; };
  db.advance = (ms) => { now += ms; };
  db.now = () => now;
  const iso = () => new Date(now).toISOString();
  const copy = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
  const tOf = (id) => db.tournaments[id];
  const matchRow = (m) => ({ pos: m.pos, state: m.state, device_id: m.device_id, board: m.board, played_on_board: m.played_on_board, paper: m.paper, retired_side: m.retired_side, summary: copy(m.summary || {}) });
  const dup = () => Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' });

  db.sql = async (strings, ...vals) => {
    const text = strings.join('?').replace(/\s+/g, ' ').trim();
    db.calls.push({ text, vals });
    if (db.before) db.before(text, vals);
    const fail = db.failWith && db.failWith(text);
    if (fail) throw Object.assign(new Error('simulated ' + fail), { code: fail });
    // tournaments
    if (text === 'SELECT id, data, created_by FROM tournaments WHERE id = ?') { const t = tOf(vals[0]); return t ? [{ id: vals[0], data: copy(t.data), created_by: t.created_by }] : []; }
    if (text === 'SELECT id, data, created_by FROM tournaments WHERE id = ? AND created_by = ?') { const t = tOf(vals[0]); return t && t.created_by === vals[1] ? [{ id: vals[0], data: copy(t.data), created_by: t.created_by }] : []; }
    // live_logins
    if (text === 'SELECT tournament_id, username, password_shown FROM live_logins WHERE tournament_id = ?') {
      return db.logins.filter((l) => l.tournament_id === vals[0]).map((l) => ({ tournament_id: l.tournament_id, username: l.username, password_shown: l.password_shown }));
    }
    if (text.startsWith('INSERT INTO live_logins (tournament_id, username, password_hash, password_shown, session_nonce) VALUES (?, ?, ?, ?, ?) ON CONFLICT (tournament_id) DO NOTHING RETURNING username, password_shown')) {
      const [tid, username, hash, shown, nonce] = vals;
      if (db.logins.some((l) => l.tournament_id === tid)) return [];
      if (db.logins.some((l) => l.username === username)) throw dup();
      db.logins.push({ tournament_id: tid, username, password_hash: hash, password_shown: shown, session_nonce: nonce, created_at: iso() });
      return [{ username, password_shown: shown }];
    }
    if (text.startsWith('UPDATE live_logins SET password_hash = ?, password_shown = ?, session_nonce = ? WHERE tournament_id = ? RETURNING username, password_shown')) {
      const l = db.logins.find((x) => x.tournament_id === vals[3]); if (!l) return [];
      Object.assign(l, { password_hash: vals[0], password_shown: vals[1], session_nonce: vals[2] });
      return [{ username: l.username, password_shown: l.password_shown }];
    }
    if (text.startsWith('SELECT l.tournament_id, l.password_hash, l.session_nonce, t.data AS t_data FROM live_logins l JOIN tournaments t ON t.id = l.tournament_id WHERE l.username = ?')) {
      const l = db.logins.find((x) => x.username === vals[0]); if (!l) return [];
      const t = tOf(l.tournament_id); if (!t) return [];
      return [{ tournament_id: l.tournament_id, password_hash: l.password_hash, session_nonce: l.session_nonce, t_data: copy(t.data) }];
    }
    // live_devices
    if (text.startsWith('INSERT INTO live_devices (id, tournament_id, session_nonce, last_seen_at) VALUES (?, ?, ?, now())')) {
      const [id, tid, nonce] = vals;
      if (db.devices.some((d) => d.id === id)) throw dup();
      db.devices.push({ id, tournament_id: tid, board: null, session_nonce: nonce, last_seen_at: iso(), logged_out_at: null, unsent: 0, created_at: iso() });
      return [];
    }
    if (text.startsWith('SELECT d.id, d.tournament_id, d.board, d.session_nonce, d.logged_out_at, d.unsent, l.session_nonce AS login_nonce, t.data AS t_data, t.updated_at AS t_updated_at FROM live_devices d JOIN tournaments t ON t.id = d.tournament_id LEFT JOIN live_logins l ON l.tournament_id = d.tournament_id WHERE d.id = ?')) {
      const d = db.devices.find((x) => x.id === vals[0]); if (!d) return [];
      const t = tOf(d.tournament_id); if (!t) return [];
      const l = db.logins.find((x) => x.tournament_id === d.tournament_id);
      return [{ id: d.id, tournament_id: d.tournament_id, board: d.board, session_nonce: d.session_nonce, logged_out_at: d.logged_out_at, unsent: d.unsent,
        login_nonce: l ? l.session_nonce : null, t_data: copy(t.data), t_updated_at: t.updated_at }];
    }
    if (text === 'UPDATE live_devices SET last_seen_at = now() WHERE id = ?') { const d = db.devices.find((x) => x.id === vals[0]); if (d) d.last_seen_at = iso(); return []; }
    // live_matches / live_lends / board holders (api/_lib/live.js: the device's boards and matches)
    if (text === 'SELECT pos, state, device_id, board, played_on_board, paper, retired_side, summary FROM live_matches WHERE tournament_id = ?') {
      return db.matches.filter((m) => m.tournament_id === vals[0]).map(matchRow);
    }
    if (text === 'SELECT pos, state, device_id, board, played_on_board, paper, retired_side, summary FROM live_matches WHERE tournament_id = ? AND pos = ?') {
      return db.matches.filter((m) => m.tournament_id === vals[0] && m.pos === vals[1]).map(matchRow);
    }
    if (text === 'SELECT from_board, to_board FROM live_lends WHERE tournament_id = ? AND ended_at IS NULL') {
      return db.lends.filter((l) => l.tournament_id === vals[0] && l.ended_at == null).map((l) => ({ from_board: l.from_board, to_board: l.to_board }));
    }
    if (text === 'SELECT id, board FROM live_devices WHERE tournament_id = ? AND logged_out_at IS NULL AND board IS NOT NULL') {
      return db.devices.filter((d) => d.tournament_id === vals[0] && !d.logged_out_at && d.board != null).map((d) => ({ id: d.id, board: d.board }));
    }
    if (text === 'UPDATE live_devices SET board = ? WHERE id = ? AND tournament_id = ? AND board IS NULL AND logged_out_at IS NULL AND (NOT EXISTS (SELECT 1 FROM live_devices o WHERE o.tournament_id = ? AND o.board = ? AND o.logged_out_at IS NULL AND o.id <> ?) OR EXISTS (SELECT 1 FROM live_lends l WHERE l.tournament_id = ? AND l.from_board = ? AND l.ended_at IS NULL)) RETURNING board') {
      const [n, id, tid] = vals;
      const d = db.devices.find((x) => x.id === id && x.tournament_id === tid && x.board == null && !x.logged_out_at); if (!d) return [];
      const shared = db.devices.some((o) => o.tournament_id === tid && o.board === n && !o.logged_out_at && o.id !== id);
      const lent = db.lends.some((l) => l.tournament_id === tid && l.from_board === n && l.ended_at == null);
      if (shared && !lent) return [];
      d.board = n; return [{ board: n }];
    }
    if (text === "INSERT INTO live_matches (tournament_id, pos, state, device_id, board, played_on_board) VALUES (?, ?, 'waiting', ?, ?, ?) ON CONFLICT (tournament_id, pos) DO NOTHING RETURNING pos") {
      const [tid, pos, did, board, playedOn] = vals;
      if (db.matches.some((m) => m.tournament_id === tid && m.pos === pos)) return [];
      db.matches.push({ tournament_id: tid, pos, state: 'waiting', device_id: did, board, played_on_board: playedOn, paper: false, retired_side: null, started_at: null, ended_at: null, summary: {}, changed_by_organiser: false });
      return [{ pos }];
    }
    if (text === "UPDATE live_matches SET device_id = ?, board = ?, played_on_board = ? WHERE tournament_id = ? AND pos = ? AND device_id IS NULL AND paper = false AND state NOT IN ('confirmed', 'retired', 'voided') RETURNING pos") {
      const [did, board, playedOn, tid, pos] = vals;
      const m = db.matches.find((x) => x.tournament_id === tid && x.pos === pos && x.device_id == null && !x.paper && ['confirmed', 'retired', 'voided'].indexOf(x.state) < 0); if (!m) return [];
      Object.assign(m, { device_id: did, board, played_on_board: playedOn }); return [{ pos }];
    }
    // tournaments: reading an event and the compare-and-set write the floor officials' code also uses (api/_routes/score/common.js)
    if (text === 'SELECT id, data, updated_at FROM tournaments WHERE id = ?') { const t = tOf(vals[0]); return t ? [{ id: vals[0], data: copy(t.data), updated_at: t.updated_at }] : []; }
    if (text.startsWith('UPDATE tournaments SET data = ?::jsonb, updated_at = now() WHERE id = ? AND abs(')) {
      const [data, id, readIso] = vals; const t = tOf(id);
      if (!t || Math.abs(Date.parse(t.updated_at) - Date.parse(readIso)) >= 1 || (t.data && t.data.finalized)) return [];
      t.data = JSON.parse(data); db.advance(1); t.updated_at = iso();
      return [{ updated_at: t.updated_at }];
    }
    // turns, summaries and state changes (api/_lib/live.js: turns, state, confirm, retire)
    if (text === 'SELECT pos, state, device_id, board, played_on_board, paper, retired_side, changed_by_organiser, summary FROM live_matches WHERE tournament_id = ? AND pos = ?') {
      return db.matches.filter((m) => m.tournament_id === vals[0] && m.pos === vals[1]).map((m) => Object.assign(matchRow(m), { changed_by_organiser: m.changed_by_organiser, summary: copy(m.summary || {}) }));
    }
    if (text === 'INSERT INTO live_turns (id, tournament_id, pos, leg, side, player, entered, device_id, supersedes, ignored, ignored_reason) VALUES (?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?, ?) ON CONFLICT (tournament_id, id) DO NOTHING RETURNING id') {
      const [id, tid, pos, leg, side, player, entered, did, supersedes, ignored, reason] = vals;
      if (db.turns.some((x) => x.tournament_id === tid && x.id === id)) return [];
      db.advance(1);   // created_at is distinct per turn, as now() is across requests
      db.turns.push({ id, tournament_id: tid, pos, leg, side, player, entered: JSON.parse(entered), device_id: did, supersedes, ignored, ignored_reason: reason, created_at: iso() });
      return [{ id }];
    }
    if (text === 'SELECT pos, device_id, ignored, ignored_reason FROM live_turns WHERE tournament_id = ? AND id = ?') {
      return db.turns.filter((x) => x.tournament_id === vals[0] && x.id === vals[1]).map((x) => ({ pos: x.pos, device_id: x.device_id, ignored: x.ignored, ignored_reason: x.ignored_reason }));
    }
    if (text === 'SELECT id, leg, side, player, entered, supersedes FROM live_turns WHERE tournament_id = ? AND pos = ? AND ignored = false ORDER BY created_at, id') {
      return db.turns.filter((x) => x.tournament_id === vals[0] && x.pos === vals[1] && !x.ignored)
        .sort((x, y) => (x.created_at < y.created_at ? -1 : x.created_at > y.created_at ? 1 : x.id < y.id ? -1 : 1))
        .map((x) => ({ id: x.id, leg: x.leg, side: x.side, player: x.player, entered: copy(x.entered), supersedes: x.supersedes }));
    }
    const mOf = (tid, pos) => db.matches.find((x) => x.tournament_id === tid && x.pos === pos);
    if (text === 'UPDATE live_matches SET summary = ?::jsonb WHERE tournament_id = ? AND pos = ?') { const m = mOf(vals[1], vals[2]); if (m) m.summary = JSON.parse(vals[0]); return []; }
    if (text === 'UPDATE live_devices SET unsent = ?, last_seen_at = now() WHERE id = ? AND tournament_id = ?') {
      const d = db.devices.find((x) => x.id === vals[1] && x.tournament_id === vals[2]); if (d) { d.unsent = vals[0]; d.last_seen_at = iso(); } return [];
    }
    if (text === "UPDATE live_matches SET state = 'playing', started_at = COALESCE(started_at, now()), summary = summary || ?::jsonb WHERE tournament_id = ? AND pos = ? AND device_id = ? AND changed_by_organiser = false AND state IN ('waiting', 'checkedIn', 'awaitingConfirm') RETURNING pos") {
      const m = mOf(vals[1], vals[2]); if (!m || m.device_id !== vals[3] || m.changed_by_organiser || ['waiting', 'checkedIn', 'awaitingConfirm'].indexOf(m.state) < 0) return [];
      m.state = 'playing'; m.started_at = m.started_at || iso(); m.summary = Object.assign({}, m.summary, JSON.parse(vals[0])); return [{ pos: m.pos }];
    }
    if (text === "UPDATE live_matches SET state = 'awaitingConfirm' WHERE tournament_id = ? AND pos = ? AND device_id = ? AND changed_by_organiser = false AND state = 'playing' RETURNING pos") {
      const m = mOf(vals[0], vals[1]); if (!m || m.device_id !== vals[2] || m.changed_by_organiser || m.state !== 'playing') return [];
      m.state = 'awaitingConfirm'; return [{ pos: m.pos }];
    }
    if (text === "UPDATE live_matches SET state = 'confirmed', ended_at = now() WHERE tournament_id = ? AND pos = ? AND device_id = ? AND changed_by_organiser = false AND state IN ('waiting', 'checkedIn', 'playing', 'awaitingConfirm') RETURNING pos") {
      const m = mOf(vals[0], vals[1]); if (!m || m.device_id !== vals[2] || m.changed_by_organiser || ['waiting', 'checkedIn', 'playing', 'awaitingConfirm'].indexOf(m.state) < 0) return [];
      m.state = 'confirmed'; m.ended_at = iso(); return [{ pos: m.pos }];
    }
    if (text === "UPDATE live_matches SET state = 'retired', retired_side = ?, ended_at = now() WHERE tournament_id = ? AND pos = ? AND device_id = ? AND changed_by_organiser = false AND state IN ('waiting', 'checkedIn', 'playing', 'awaitingConfirm') RETURNING pos") {
      const m = mOf(vals[1], vals[2]); if (!m || m.device_id !== vals[3] || m.changed_by_organiser || ['waiting', 'checkedIn', 'playing', 'awaitingConfirm'].indexOf(m.state) < 0) return [];
      m.state = 'retired'; m.retired_side = vals[0]; m.ended_at = iso(); return [{ pos: m.pos }];
    }
    if (text === 'UPDATE live_matches SET changed_by_organiser = true WHERE tournament_id = ? AND pos = ?') { const m = mOf(vals[0], vals[1]); if (m) m.changed_by_organiser = true; return []; }
    // the organiser's Boards panel (api/_lib/live.js: panelDevices, logoutDevice, logoutAllDevices, lends; route panel)
    if (text === 'SELECT id, board, last_seen_at, unsent, logged_out_at FROM live_devices WHERE tournament_id = ? ORDER BY created_at, id') {
      return db.devices.filter((d) => d.tournament_id === vals[0]).slice()
        .sort((x, y) => (x.created_at < y.created_at ? -1 : x.created_at > y.created_at ? 1 : x.id < y.id ? -1 : 1))
        .map((d) => ({ id: d.id, board: d.board, last_seen_at: d.last_seen_at, unsent: d.unsent, logged_out_at: d.logged_out_at }));
    }
    if (text === 'UPDATE live_devices SET logged_out_at = now() WHERE id = ? AND tournament_id = ? AND logged_out_at IS NULL RETURNING id, board') {
      const d = db.devices.find((x) => x.id === vals[0] && x.tournament_id === vals[1] && !x.logged_out_at); if (!d) return [];
      d.logged_out_at = iso(); return [{ id: d.id, board: d.board }];
    }
    if (text === 'UPDATE live_devices SET logged_out_at = now() WHERE tournament_id = ? AND logged_out_at IS NULL') {
      db.devices.forEach((d) => { if (d.tournament_id === vals[0] && !d.logged_out_at) d.logged_out_at = iso(); }); return [];
    }
    if (text === "UPDATE live_matches SET device_id = NULL WHERE tournament_id = ? AND state = 'waiting' AND device_id IN (SELECT id FROM live_devices WHERE tournament_id = ? AND logged_out_at IS NOT NULL)") {
      db.matches.forEach((m) => {
        if (m.tournament_id === vals[0] && m.state === 'waiting' && m.device_id != null && db.devices.some((d) => d.id === m.device_id && d.tournament_id === vals[1] && d.logged_out_at)) m.device_id = null;
      });
      return [];
    }
    if (text === 'SELECT id, from_board, to_board, started_at FROM live_lends WHERE tournament_id = ? AND ended_at IS NULL ORDER BY started_at, id') {
      return db.lends.filter((l) => l.tournament_id === vals[0] && l.ended_at == null).slice()
        .sort((x, y) => (x.started_at < y.started_at ? -1 : x.started_at > y.started_at ? 1 : x.id < y.id ? -1 : 1))
        .map((l) => ({ id: l.id, from_board: l.from_board, to_board: l.to_board, started_at: l.started_at }));
    }
    if (text === 'INSERT INTO live_lends (id, tournament_id, from_board, to_board) SELECT ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM live_lends WHERE tournament_id = ? AND from_board = ? AND ended_at IS NULL) RETURNING id') {
      const [id, tid, from, to] = vals;
      if (db.lends.some((l) => l.tournament_id === tid && l.from_board === from && l.ended_at == null)) return [];
      db.lends.push({ id, tournament_id: tid, from_board: from, to_board: to, started_at: iso(), ended_at: null }); return [{ id }];
    }
    if (text === 'UPDATE live_lends SET ended_at = now() WHERE id = ? AND tournament_id = ? AND ended_at IS NULL RETURNING id') {
      const l = db.lends.find((x) => x.id === vals[0] && x.tournament_id === vals[1] && x.ended_at == null); if (!l) return [];
      l.ended_at = iso(); return [{ id: l.id }];
    }
    if (text === 'UPDATE live_lends SET ended_at = now() WHERE tournament_id = ? AND to_board = ? AND ended_at IS NULL RETURNING id') {
      const hit = db.lends.filter((x) => x.tournament_id === vals[0] && x.to_board === vals[1] && x.ended_at == null);
      hit.forEach((l) => { l.ended_at = iso(); }); return hit.map((l) => ({ id: l.id }));
    }
    if (text === 'UPDATE live_lends SET ended_at = now() WHERE tournament_id = ? AND from_board = ? AND ended_at IS NULL') {
      db.lends.forEach((l) => { if (l.tournament_id === vals[0] && l.from_board === vals[1] && l.ended_at == null) l.ended_at = iso(); }); return [];
    }
    if (text === 'UPDATE live_lends SET ended_at = now() WHERE tournament_id = ? AND ended_at IS NULL') {
      db.lends.forEach((l) => { if (l.tournament_id === vals[0] && l.ended_at == null) l.ended_at = iso(); }); return [];
    }
    // take-over requests (api/_lib/live.js: requestTakeover, takeoverById, answerTakeover, voidAllowed, moveHolder, openTakeovers)
    if (text === 'INSERT INTO live_takeovers (id, tournament_id, pos, from_device, to_device) SELECT ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM live_takeovers WHERE tournament_id = ? AND pos = ? AND answer IS NULL) RETURNING id') {
      const [id, tid, pos, from, to] = vals;
      if (db.takeovers.some((x) => x.tournament_id === tid && x.pos === pos && x.answer == null)) return [];
      db.advance(1);
      db.takeovers.push({ id, tournament_id: tid, pos, from_device: from, to_device: to, decided_by: null, answer: null, created_at: iso(), decided_at: null });
      return [{ id }];
    }
    if (text === 'SELECT id, pos, from_device, to_device, answer, decided_by, created_at FROM live_takeovers WHERE tournament_id = ? AND id = ?') {
      return db.takeovers.filter((x) => x.tournament_id === vals[0] && x.id === vals[1]).map((x) => ({ id: x.id, pos: x.pos, from_device: x.from_device, to_device: x.to_device, answer: x.answer, decided_by: x.decided_by, created_at: x.created_at }));
    }
    if (text === 'UPDATE live_takeovers SET answer = ?, decided_by = ?, decided_at = now() WHERE tournament_id = ? AND id = ? AND answer IS NULL RETURNING id, pos, from_device, to_device') {
      const x = db.takeovers.find((y) => y.tournament_id === vals[2] && y.id === vals[3] && y.answer == null); if (!x) return [];
      Object.assign(x, { answer: vals[0], decided_by: vals[1], decided_at: iso() });
      return [{ id: x.id, pos: x.pos, from_device: x.from_device, to_device: x.to_device }];
    }
    if (text === "UPDATE live_takeovers SET answer = 'void' WHERE tournament_id = ? AND id = ? AND answer = 'allow'") {
      const x = db.takeovers.find((y) => y.tournament_id === vals[0] && y.id === vals[1] && y.answer === 'allow'); if (x) x.answer = 'void'; return [];
    }
    if (text === "UPDATE live_matches SET device_id = ? WHERE tournament_id = ? AND pos = ? AND device_id = ? AND paper = false AND changed_by_organiser = false AND state IN ('checkedIn', 'playing', 'awaitingConfirm') AND EXISTS (SELECT 1 FROM live_devices WHERE id = ? AND tournament_id = ? AND logged_out_at IS NULL) RETURNING pos") {
      const [to, tid, pos, from] = vals;
      const m = db.matches.find((x) => x.tournament_id === tid && x.pos === pos && x.device_id === from && !x.paper && !x.changed_by_organiser && ['checkedIn', 'playing', 'awaitingConfirm'].indexOf(x.state) >= 0);
      if (!m || !db.devices.some((d) => d.id === vals[4] && d.tournament_id === vals[5] && !d.logged_out_at)) return [];
      m.device_id = to; return [{ pos: m.pos }];
    }
    if (text === 'SELECT id, pos, from_device, to_device, created_at FROM live_takeovers WHERE tournament_id = ? AND answer IS NULL ORDER BY created_at, id') {
      return db.takeovers.filter((x) => x.tournament_id === vals[0] && x.answer == null).slice()
        .sort((x, y) => (x.created_at < y.created_at ? -1 : x.created_at > y.created_at ? 1 : x.id < y.id ? -1 : 1))
        .map((x) => ({ id: x.id, pos: x.pos, from_device: x.from_device, to_device: x.to_device, created_at: x.created_at }));
    }
    // auth_throttle (api/_lib/throttle.js)
    if (text.startsWith('INSERT INTO auth_throttle')) {
      const [key, windowMs] = [vals[0], Number(vals[vals.length - 1])];
      const r = db.throttle[key];
      if (!r || r.start <= now - windowMs) db.throttle[key] = { count: 1, start: now }; else r.count++;
      return [{ count: db.throttle[key].count }];
    }
    if (text.startsWith('SELECT count FROM auth_throttle WHERE key = ? AND window_start > now()')) {
      const r = db.throttle[vals[0]];
      return r && r.start > now - Number(vals[1]) ? [{ count: r.count }] : [];
    }
    if (text === 'DELETE FROM auth_throttle WHERE key = ?') { delete db.throttle[vals[0]]; return []; }
    if (text.startsWith('DELETE FROM auth_throttle WHERE window_start <')) return [];
    if (text.startsWith('UPDATE auth_throttle SET count = GREATEST(count - 1, 0)')) { const r = db.throttle[vals[0]]; if (r) r.count = Math.max(0, r.count - 1); return []; }
    throw new Error('fake live db: unrecognised SQL: ' + text);
  };
  return db;
}

module.exports = { createFakeLiveDb };

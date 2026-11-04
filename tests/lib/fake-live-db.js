// In-memory stand-in for api/_lib/db.js `sql`, for the live-scoring code: api/_lib/live.js, the handlers in api/_routes/live/
// and api/_lib/throttle.js (the login limit). Dev tooling in the style of fake-score-db.js; later tasks extend it with the
// statements their code issues.
//
//   const db = createFakeLiveDb({ tournaments });   // tournaments: { id: { data, updated_at, created_by } } (shared ok)
//   db.logins: [{ tournament_id, username, password_hash, password_shown, session_nonce, created_at }]
//   db.devices: [{ id, tournament_id, board, session_nonce, last_seen_at, logged_out_at, unsent, created_at }]
//   db.calls: [{ text, vals }]; db.before = (text, vals) => {} runs before each statement; db.failWith = (text) => code|null
//   db.setNow(ms) / db.advance(ms): the database clock (now()), for throttle windows
//
// It recognises ONLY the statements the code issues (by the normalised text) and throws for anything else, so a changed
// query fails loudly. JavaScript stands in for the SQL.
function createFakeLiveDb(opts) {
  opts = opts || {};
  let now = opts.now || Date.parse('2026-11-05T02:00:00.000Z');
  const db = { tournaments: opts.tournaments || {}, logins: [], devices: [], throttle: {}, calls: [], before: null, failWith: null };
  db.setNow = (ms) => { now = ms; };
  db.advance = (ms) => { now += ms; };
  db.now = () => now;
  const iso = () => new Date(now).toISOString();
  const copy = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
  const tOf = (id) => db.tournaments[id];
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

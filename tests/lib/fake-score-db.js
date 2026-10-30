// In-memory stand-in for api/_lib/db.js `sql`, for the floor officials code: api/_lib/officials.js, the handlers in
// api/_routes/score/ and api/_lib/throttle.js (the PIN limit). Used by tests/score-api.test.js and by the local
// organiser (tests/dev/mock-organiser.js), whose own in-memory events it can share.
//
//   const db = createFakeScoreDb({ tournaments });   // tournaments: { id: { data, updated_at, created_by } } (shared ok)
//   db.officials: [{ id, tournament_id, organizer_id, name, boards, token_hash, link_nonce, pin, ends_at, stopped_at, ... }]
//   db.calls: [{ text, vals }]; db.before = (text, vals) => {} runs before each statement (simulate another writer)
//   db.setNow(ms) / db.advance(ms): the database clock (now()), for throttle windows and stamps
//
// It recognises ONLY the statements the code issues (by distinctive fragments of the normalised text) and throws for
// anything else, so a changed query fails loudly. JavaScript stands in for the SQL.
function createFakeScoreDb(opts) {
  opts = opts || {};
  let now = opts.now || Date.parse('2026-10-30T02:00:00.000Z');
  const db = { tournaments: opts.tournaments || {}, officials: [], throttle: {}, calls: [], before: null };
  db.setNow = (ms) => { now = ms; };
  db.advance = (ms) => { now += ms; };
  db.now = () => now;
  const iso = () => new Date(now).toISOString();
  const copy = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
  const tOf = (id) => db.tournaments[id];
  const orow = (o) => copy(o);
  const finalized = (d) => !!(d && typeof d === 'object' && d.finalized);

  db.sql = async (strings, ...vals) => {
    const text = strings.join('?').replace(/\s+/g, ' ').trim();
    db.calls.push({ text, vals });
    if (db.before) db.before(text, vals);
    const has = (f) => text.includes(f);
    // tournaments
    if (text === 'SELECT id, data, created_by FROM tournaments WHERE id = ?') { const t = tOf(vals[0]); return t ? [{ id: vals[0], data: copy(t.data), created_by: t.created_by }] : []; }
    if (text === 'SELECT id, data, created_by FROM tournaments WHERE id = ? AND created_by = ?') { const t = tOf(vals[0]); return t && t.created_by === vals[1] ? [{ id: vals[0], data: copy(t.data), created_by: t.created_by }] : []; }
    if (text === 'SELECT id, data, updated_at FROM tournaments WHERE id = ?') { const t = tOf(vals[0]); return t ? [{ id: vals[0], data: copy(t.data), updated_at: t.updated_at }] : []; }
    if (text.startsWith('UPDATE tournaments SET data = ?::jsonb, updated_at = now() WHERE id = ? AND abs(')) {
      const [data, id, readIso] = vals; const t = tOf(id);
      if (!t || Math.abs(Date.parse(t.updated_at) - Date.parse(readIso)) >= 1 || finalized(t.data)) return [];
      t.data = JSON.parse(data); db.advance(1); t.updated_at = iso();
      return [{ updated_at: t.updated_at }];
    }
    // event_officials
    if (text === 'SELECT * FROM event_officials WHERE tournament_id = ? ORDER BY created_at, id') return db.officials.filter((o) => o.tournament_id === vals[0]).map(orow);
    if (text === 'SELECT count(*)::int AS n FROM event_officials WHERE tournament_id = ?') return [{ n: db.officials.filter((o) => o.tournament_id === vals[0]).length }];
    if (text.startsWith('INSERT INTO event_officials (id, tournament_id, organizer_id, name, boards, token_hash, link_nonce, pin, ends_at)')) {
      const [id, tid, org, name, boards, th, nonce, pin, ends] = vals;
      if (db.officials.some((o) => o.token_hash === th)) throw Object.assign(new Error('duplicate'), { code: '23505' });
      const row = { id, tournament_id: tid, organizer_id: org, name, boards: boards.slice(), token_hash: th, link_nonce: nonce, pin, ends_at: ends, stopped_at: null, last_seen_at: null, results: 0, refused: [], created_at: iso() };
      db.officials.push(row); return [orow(row)];
    }
    if (text === 'SELECT o.*, t.created_by AS owner FROM event_officials o JOIN tournaments t ON t.id = o.tournament_id WHERE o.id = ?') {
      const o = db.officials.find((x) => x.id === vals[0]); if (!o) return [];
      return [Object.assign(orow(o), { owner: (tOf(o.tournament_id) || {}).created_by })];
    }
    const one = (id) => db.officials.find((x) => x.id === id);
    if (text === 'UPDATE event_officials SET name = ?, boards = ?::int[] WHERE id = ? RETURNING *') { const o = one(vals[2]); if (!o) return []; o.name = vals[0]; o.boards = vals[1].slice(); return [orow(o)]; }
    if (text === 'UPDATE event_officials SET stopped_at = COALESCE(stopped_at, now()) WHERE id = ? RETURNING *') { const o = one(vals[0]); if (!o) return []; o.stopped_at = o.stopped_at || iso(); return [orow(o)]; }
    if (text === 'UPDATE event_officials SET pin = ? WHERE id = ? RETURNING *') { const o = one(vals[1]); if (!o) return []; o.pin = vals[0]; return [orow(o)]; }
    if (text.startsWith('UPDATE event_officials SET token_hash = ?, link_nonce = ?, pin = ?, stopped_at = NULL, ends_at = ?::timestamptz WHERE id = ?')) {
      const o = one(vals[4]); if (!o) return []; Object.assign(o, { token_hash: vals[0], link_nonce: vals[1], pin: vals[2], stopped_at: null, ends_at: vals[3] }); return [orow(o)];
    }
    if (has('FROM event_officials o JOIN tournaments t ON t.id = o.tournament_id WHERE o.token_hash = ?') || has('FROM event_officials o JOIN tournaments t ON t.id = o.tournament_id WHERE o.id = ?')) {
      const byHash = has('o.token_hash = ?');
      const o = db.officials.find((x) => (byHash ? x.token_hash : x.id) === vals[0]); if (!o) return [];
      const t = tOf(o.tournament_id) || {};
      return [Object.assign(orow(o), { t_data: copy(t.data), t_updated_at: t.updated_at })];
    }
    if (text.startsWith('UPDATE event_officials SET refused = ( SELECT COALESCE(jsonb_agg(x ORDER BY n)')) {
      const [entry, limit, id] = vals; const o = one(id); if (!o) return [];
      o.refused = o.refused.concat(JSON.parse(entry)).slice(-limit); return [];
    }
    if (text === "UPDATE event_officials SET refused = '[]'::jsonb WHERE id = ? RETURNING *") { const o = one(vals[0]); if (!o) return []; o.refused = []; return [orow(o)]; }
    if (text === 'UPDATE event_officials SET last_seen_at = now(), results = results + ? WHERE id = ?') { const o = one(vals[1]); if (o){ o.last_seen_at = iso(); o.results += Number(vals[0]) || 0; } return []; }
    if (text === 'SELECT id, name FROM event_officials WHERE tournament_id = ?') return db.officials.filter((o) => o.tournament_id === vals[0]).map((o) => ({ id: o.id, name: o.name }));
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
    throw new Error('fake score db: unrecognised SQL: ' + text);
  };
  return db;
}

module.exports = { createFakeScoreDb };

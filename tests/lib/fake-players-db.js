// In-memory stand-in for api/_lib/db.js `sql`, for the player library (api/_lib/players.js).
//
//   const db = createFakePlayersDb();
//   db.players: [{ id, organizer_id, name, club, aliases, created_at, updated_at, removed_at }]
//   db.tournaments: [{ id, created_by, updated_at, data }]     (for "events played" / "last played")
//   db.organizers: [{ id, name, email }]                        (for the Admin list's owner)
//   db.calls: [{ text, vals }]                                  (every statement, text with ? for each value)
//   db.failNext(err)                                            (the next statement throws err, e.g. { code: '42P01' })
//   db.before = (text, vals) => {}                              (runs before each statement: simulate another writer)
//
// It recognises ONLY the statements players.js issues (by distinctive fragments of the normalised text) and throws for
// anything else, so a changed query fails loudly. It acts out what Postgres would do, including the partial unique
// index players_org_name_club (organizer_id, lower(name), lower(club)) WHERE removed_at IS NULL: a write that would
// break it throws { code: '23505' }. JavaScript stands in for the SQL, so these tests check players.js's logic, not
// the SQL text itself.

function createFakePlayersDb() {
  let now = Date.parse('2026-10-29T10:00:00.000Z');
  const db = { players: [], tournaments: [], organizers: [], calls: [], before: null };
  let pending = null;
  db.failNext = (err) => { pending = err; };
  db.tick = (ms) => { now += ms || 1000; };
  const stamp = () => new Date(now);
  const live = (p) => !p.removed_at;
  const lc = (s) => String(s || '').toLowerCase();
  const uniqueBroken = (org, name, club, exceptId) => db.players.some((p) => live(p) && p.organizer_id === org && p.id !== exceptId && lc(p.name) === lc(name) && lc(p.club) === lc(club));
  const dup = () => Object.assign(new Error('duplicate key value violates unique constraint "players_org_name_club"'), { code: '23505' });
  const byName = (a, b) => lc(a.name).localeCompare(lc(b.name)) || lc(a.club).localeCompare(lc(b.club)) || (a.id < b.id ? -1 : 1);
  const pick = (p, keys) => { const o = {}; keys.forEach((k) => { o[k] = Array.isArray(p[k]) ? p[k].slice() : p[k]; }); return o; };

  // events played / last played for a player: the organiser's events with a member whose playerId is the id or an alias
  function usage(p) {
    const ids = new Set((p.aliases || []).concat(p.id));
    let n = 0, last = null;
    db.tournaments.forEach((t) => {
      if (t.created_by !== p.organizer_id) return;
      const list = t.data && Array.isArray(t.data.entriesList) ? t.data.entriesList : [];
      const hit = list.some((e) => e && Array.isArray(e.members) && e.members.some((m) => m && m.playerId != null && ids.has(String(m.playerId))));
      if (hit) { n++; if (!last || t.updated_at > last) last = t.updated_at; }
    });
    return { events_played: n, last_played: last };
  }
  // ILIKE with the \ escapes players.js writes for % _ and \
  function ilike(s, pattern) {
    let re = '';
    for (let i = 0; i < pattern.length; i++) {
      const c = pattern[i];
      if (c === '\\') { i++; re += pattern[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
      else if (c === '%') re += '[\\s\\S]*';
      else if (c === '_') re += '[\\s\\S]';
      else re += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    return new RegExp('^' + re + '$', 'i').test(String(s || ''));
  }

  db.sql = async (strings, ...vals) => {
    const text = strings.join('?').replace(/\s+/g, ' ').trim();
    db.calls.push({ text, vals });
    if (db.before) db.before(text, vals);
    if (pending) { const e = pending; pending = null; throw Object.assign(new Error(e.message || 'failed'), e); }
    const has = (frag) => text.includes(frag);

    // ensurePlayers: everything of this organiser
    if (text === 'SELECT id, name, club, aliases, removed_at FROM players WHERE organizer_id = ?::uuid') {
      return db.players.filter((p) => p.organizer_id === vals[0]).map((p) => pick(p, ['id', 'name', 'club', 'aliases', 'removed_at']));
    }
    // ensurePlayers: bring removed players back
    if (text.startsWith('UPDATE players p SET name = v.name, club = v.club, removed_at = NULL')) {
      const [ids, names, clubs, org] = vals;
      const todo = ids.map((id, i) => ({ p: db.players.find((x) => x.id === id && x.organizer_id === org && !live(x)), name: names[i], club: clubs[i] })).filter((x) => x.p);
      todo.forEach((x) => { if (uniqueBroken(org, x.name, x.club, x.p.id)) throw dup(); });
      return todo.map((x) => { Object.assign(x.p, { name: x.name, club: x.club, removed_at: null, updated_at: stamp() }); return pick(x.p, ['id', 'name', 'club']); });
    }
    // ensurePlayers: add new ones (ON CONFLICT DO NOTHING)
    if (text.startsWith('INSERT INTO players (id, organizer_id, name, club)')) {
      const [org, ids, names, clubs] = vals;
      const out = [];
      ids.forEach((id, i) => {
        if (db.players.some((x) => x.id === id) || uniqueBroken(org, names[i], clubs[i])) return;
        const row = { id, organizer_id: org, name: names[i], club: clubs[i], aliases: [], created_at: stamp(), updated_at: stamp(), removed_at: null };
        db.players.push(row); out.push(pick(row, ['id', 'name', 'club']));
      });
      return out;
    }
    if (text === 'SELECT id, name, club FROM players WHERE organizer_id = ?::uuid AND removed_at IS NULL') {
      return db.players.filter((p) => p.organizer_id === vals[0] && live(p)).map((p) => pick(p, ['id', 'name', 'club']));
    }
    if (has('AND removed_at IS NULL AND lower(name) = lower(?) AND lower(club) = lower(?)')) {
      const [org, name, club] = vals;
      return db.players.filter((p) => p.organizer_id === org && live(p) && lc(p.name) === lc(name) && lc(p.club) === lc(club)).map((p) => pick(p, ['id', 'name', 'club']));
    }
    // listPlayers
    if (text.startsWith('WITH uses AS (')) {
      const org = vals[1];
      return db.players.filter((p) => p.organizer_id === org && live(p)).sort(byName)
        .map((p) => Object.assign(pick(p, ['id', 'name', 'club', 'created_at']), usage(p)));
    }
    // updatePlayer
    if (text.startsWith('UPDATE players SET name = ?, club = ?, updated_at = now() WHERE id = ? AND organizer_id = ?::uuid AND removed_at IS NULL')) {
      const [name, club, id, org] = vals;
      const p = db.players.find((x) => x.id === id && x.organizer_id === org && live(x));
      if (!p) return [];
      if (uniqueBroken(org, name, club, id)) throw dup();
      Object.assign(p, { name, club, updated_at: stamp() });
      return [pick(p, ['id', 'name', 'club', 'created_at'])];
    }
    // removePlayer
    if (text.startsWith('UPDATE players SET removed_at = now(), updated_at = now() WHERE id = ? AND')) {
      const [id, org] = vals;
      const p = db.players.find((x) => x.id === id && x.organizer_id === org && live(x));
      if (!p) return [];
      p.removed_at = stamp(); p.updated_at = stamp();
      return [{ id }];
    }
    // mergePlayers: the players named, then hide the others, keep one, or put the others back
    if (text.startsWith('SELECT id, aliases FROM players WHERE id = ANY(?::text[]) AND organizer_id = ?::uuid AND removed_at IS NULL')) {
      const [ids, org] = vals;
      return db.players.filter((p) => ids.includes(p.id) && p.organizer_id === org && live(p)).map((p) => pick(p, ['id', 'aliases']));
    }
    if (text.startsWith('UPDATE players SET removed_at = now(), updated_at = now() WHERE id = ANY(?::text[])')) {
      const [ids, org] = vals;
      db.players.filter((p) => ids.includes(p.id) && p.organizer_id === org && live(p)).forEach((p) => { p.removed_at = stamp(); p.updated_at = stamp(); });
      return [];
    }
    if (text.startsWith('UPDATE players SET name = ?, club = ?, aliases = ?::text[], updated_at = now() WHERE id = ? AND organizer_id = ?::uuid')) {
      const [name, club, aliases, id, org] = vals;
      const p = db.players.find((x) => x.id === id && x.organizer_id === org);
      if (!p) return [];
      if (live(p) && uniqueBroken(org, name, club, id)) throw dup();
      Object.assign(p, { name, club, aliases: aliases.slice(), updated_at: stamp() });
      return [pick(p, ['id', 'name', 'club', 'created_at'])];
    }
    if (text.startsWith('UPDATE players SET removed_at = NULL WHERE id = ANY(?::text[]) AND organizer_id = ?::uuid')) {
      const [ids, org] = vals;
      db.players.filter((p) => ids.includes(p.id) && p.organizer_id === org).forEach((p) => { p.removed_at = null; });
      return [];
    }
    if (text === 'SELECT organizer_id FROM players WHERE id = ? AND removed_at IS NULL') {
      const p = db.players.find((x) => x.id === vals[0] && live(x));
      return p ? [{ organizer_id: p.organizer_id }] : [];
    }
    // adminListPlayers
    if (text.startsWith('WITH page AS (')) {
      const [owner, owner2, pattern, pattern2, pattern3, limit, offset] = vals;
      void owner2; void pattern2; void pattern3;
      const all = db.players.filter((p) => live(p) && (owner == null || p.organizer_id === owner) && (pattern == null || ilike(p.name, pattern) || ilike(p.club, pattern))).sort(byName);
      return all.slice(offset, offset + limit).map((p) => {
        const o = db.organizers.find((x) => x.id === p.organizer_id) || {};
        return Object.assign(pick(p, ['id', 'name', 'club', 'created_at']), usage(p), { total: all.length, owner_id: p.organizer_id, owner_name: o.name, owner_email: o.email });
      });
    }
    throw new Error('fake players db: unrecognised SQL: ' + text);
  };
  return db;
}

module.exports = { createFakePlayersDb };

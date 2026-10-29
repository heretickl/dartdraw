// In-memory player library for tests/dev/mock-organiser.js: /api/players/<action> and /api/admin/players[/:id[/merge]],
// with the same shapes and error codes as api/_routes/players/* (see api/_lib/players.js). MOCK_NO_LIBRARY=1 answers
// every call with 503 library_not_set_up, as if the owner had not run migrations/2026-10-29-players.sql yet.
// Players belong to the mock organiser 'u1' unless the Admin adds one for another id.
const players = [];   // { id, org, name, club, aliases, removed }
let seq = 0;
const clean = (s) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, 80).trim() : '');
const key = (n, c) => n.toLowerCase() + '\u0000' + c.toLowerCase();
const NOT_SET_UP = { code: 'library_not_set_up', error: 'The player library is not set up yet.' };
const ERR = {
  invalid_name: [400, { code: 'invalid_player_name', error: 'Enter a name (up to 80 characters).' }],
  limit: [409, { code: 'player_limit', error: 'You can keep up to 5,000 players.' }],
  duplicate: [409, { code: 'player_exists', error: 'A player with that name and club is already in the list.' }],
  not_found: [404, { code: 'player_not_found', error: 'Player not found.' }]
};

function uses(db, org, p) {
  const ids = new Set([p.id].concat(p.aliases));
  let n = 0, last = null;
  Object.keys(db).forEach((tid) => {
    const d = db[tid].data || {};
    if ((d.ownerId || 'u1') !== org) return;
    const hit = (d.entriesList || []).some((e) => (e.members || []).some((m) => m && ids.has(m.playerId)));
    if (hit) { n++; if (!last || db[tid].updated_at > last) last = db[tid].updated_at; }
  });
  return { eventsPlayed: n, lastPlayed: last };
}
const view = (db, p) => Object.assign({ id: p.id, name: p.name, club: p.club, createdAt: null }, uses(db, p.org, p));
const live = (org) => players.filter((p) => p.org === org && !p.removed);
const sortByName = (a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.club.toLowerCase().localeCompare(b.club.toLowerCase());

function ensure(org, items) {
  if (!Array.isArray(items) || !items.length || items.length > 200) throw 'invalid_name';
  const wanted = items.map((it) => ({ name: clean(it && it.name), club: clean(it && it.club) }));
  if (wanted.some((w) => !w.name)) throw 'invalid_name';
  return wanted.map((w) => {
    const k = key(w.name, w.club);
    let p = live(org).find((x) => key(x.name, x.club) === k);
    if (p) return { id: p.id, name: p.name, club: p.club, created: false };
    const merged = players.find((x) => x.org === org && x.removed && key(x.name, x.club) === k && live(org).some((y) => y.aliases.includes(x.id)));
    if (merged) { const keeper = live(org).find((y) => y.aliases.includes(merged.id)); return { id: keeper.id, name: keeper.name, club: keeper.club, created: false }; }
    if (live(org).length >= 5000) throw 'limit';
    p = players.find((x) => x.org === org && x.removed && key(x.name, x.club) === k);
    if (p) { p.removed = false; p.name = w.name; p.club = w.club; }
    else { p = { id: 'p_mock' + (++seq), org, name: w.name, club: w.club, aliases: [], removed: false }; players.push(p); }
    return { id: p.id, name: p.name, club: p.club, created: true };
  });
}
function update(org, id, b) {
  const name = clean(b.name), club = clean(b.club);
  if (!name) throw 'invalid_name';
  const p = live(org).find((x) => x.id === id);
  if (!p) throw 'not_found';
  if (live(org).some((x) => x !== p && key(x.name, x.club) === key(name, club))) throw 'duplicate';
  p.name = name; p.club = club;
  return p;
}
function merge(org, keepId, ids, b) {
  const name = clean(b.name), club = clean(b.club);
  if (!name) throw 'invalid_name';
  const keep = live(org).find((x) => x.id === keepId);
  const others = [...new Set(ids || [])].filter((x) => x !== keepId).map((id) => live(org).find((x) => x.id === id));
  if (!keep || !others.length || others.some((x) => !x)) throw 'not_found';
  if (live(org).some((x) => x !== keep && !others.includes(x) && key(x.name, x.club) === key(name, club))) throw 'duplicate';
  others.forEach((o) => { o.removed = true; keep.aliases.push(o.id, ...o.aliases); });
  keep.name = name; keep.club = club;
  return keep;
}

// -> true when the request was answered here.
async function handle(req, url, send, readBody, db) {
  const p = url.pathname;
  if (!p.startsWith('/api/players/') && !p.startsWith('/api/admin/players')) return false;
  if (process.env.MOCK_NO_LIBRARY === '1') { send(503, NOT_SET_UP); return true; }
  const b = req.method === 'GET' || req.method === 'DELETE' ? {} : await readBody(req);
  try {
    if (p === '/api/players/list') send(200, { players: live('u1').sort(sortByName).map((x) => view(db, x)) });
    else if (p === '/api/players/ensure') send(200, { players: ensure('u1', b.players) });
    else if (p === '/api/players/update') send(200, { player: view(db, update('u1', b.id, b)) });
    else if (p === '/api/players/remove') { const x = live('u1').find((y) => y.id === b.id); if (!x) throw 'not_found'; x.removed = true; send(200, { ok: true }); }
    else if (p === '/api/players/merge') send(200, { player: view(db, merge('u1', b.keepId, b.ids, b)) });
    else if (p === '/api/admin/players' && req.method === 'GET') {
      const q = (url.searchParams.get('q') || '').toLowerCase(), owner = url.searchParams.get('owner') || '';
      const limit = Math.min(100, parseInt(url.searchParams.get('limit'), 10) || 50), offset = parseInt(url.searchParams.get('offset'), 10) || 0;
      const all = players.filter((x) => !x.removed && (!owner || x.org === owner) && (!q || x.name.toLowerCase().includes(q) || x.club.toLowerCase().includes(q))).sort(sortByName);
      send(200, { total: all.length, players: all.slice(offset, offset + limit).map((x) => Object.assign(view(db, x), { owner: { id: x.org, name: x.org === 'u1' ? 'Test organiser' : 'Other organiser', email: x.org === 'u1' ? 'test@example.com' : 'other@example.com' } })) });
    } else if (p === '/api/admin/players' && req.method === 'POST') send(201, { player: ensure(String(b.organizerId || ''), [b])[0] });
    else {
      const m = /^\/api\/admin\/players\/([^/]+)(\/merge)?$/.exec(p);
      const x = m && players.find((y) => y.id === decodeURIComponent(m[1]) && !y.removed);
      if (!x) throw 'not_found';
      if (m[2]) send(200, { player: view(db, merge(x.org, x.id, b.ids, b)) });
      else if (req.method === 'PATCH') send(200, { player: view(db, update(x.org, x.id, b)) });
      else if (req.method === 'DELETE') { x.removed = true; send(200, { ok: true }); }
      else send(405, { code: 'method_not_allowed', error: 'Method not allowed' });
    }
  } catch (e) {
    const hit = typeof e === 'string' && ERR[e];
    if (hit) send(hit[0], hit[1]); else send(500, { code: 'request_failed', error: String(e && e.message || e) });
  }
  return true;
}

module.exports = { handle };

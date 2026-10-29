const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createFakePlayersDb } = require('./lib/fake-players-db');
const { callHandler } = require('./lib/call-handler');

// The player library on the server: api/_lib/players.js against an in-memory players table (tests/lib/fake-players-db.js),
// and its endpoints (api/players/[action].js -> api/_routes/players/*, api/_routes/admin/players/*). Sign-in itself is
// tested elsewhere: here requireAuth / requireAdmin are replaced by a stand-in that answers for `who`.
let db;
const dbPath = require.resolve('../api/_lib/db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { sql: (...a) => db.sql(...a) } };
let who = null;
const authPath = require.resolve('../api/_lib/auth');
require.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports: {
  requireAuth: async (req, res) => { if (!who) { res.status(401).json({ code: 'not_authenticated', error: 'Not authenticated' }); return null; } return who; },
  requireAdmin: async (req, res) => {
    if (!who) { res.status(401).json({ code: 'not_authenticated', error: 'Not authenticated' }); return null; }
    if (who.role !== 'admin') { res.status(403).json({ code: 'admin_only', error: 'Admin only.' }); return null; }
    return who;
  }
} };
const accountsPath = require.resolve('../api/_lib/accounts');
require.cache[accountsPath] = { id: accountsPath, filename: accountsPath, loaded: true, exports: {
  findById: async (id) => db.organizers.find((o) => o.id === id)
} };

const P = require('../api/_lib/players');
const playersRouter = require('../api/players/[action]');
const adminRouter = require('../api/_routes/adminRouter');

const A = 'aaaaaaaa-0000-4000-8000-000000000001';   // organisers (uuids, as the Admin endpoints check)
const B = 'bbbbbbbb-0000-4000-8000-000000000002';
const ADMIN = 'cccccccc-0000-4000-8000-000000000003';
const orgA = { id: A, email: 'a@example.com', name: 'Aina', role: 'organizer', tier: 'basic' };
const orgB = { id: B, email: 'b@example.com', name: 'Badrul', role: 'organizer', tier: 'basic' };
const admin = { id: ADMIN, email: 'admin@example.com', name: 'Admin', role: 'admin', tier: 'pro' };

beforeEach(() => {
  db = createFakePlayersDb();
  db.organizers.push({ id: A, name: 'Aina', email: 'a@example.com' }, { id: B, name: 'Badrul', email: 'b@example.com' }, { id: ADMIN, name: 'Admin', email: 'admin@example.com' });
  who = orgA;
});
const codeOf = async (p) => { try { await p; return null; } catch (e) { assert.ok(e instanceof P.LibraryError, 'a LibraryError, not ' + e); return e.code; } };
const liveOf = (org) => db.players.filter((p) => p.organizer_id === org && !p.removed_at);
const event = (id, owner, members, updated) => db.tournaments.push({ id, created_by: owner, updated_at: new Date(updated || '2026-10-20T12:00:00Z'), data: { entriesList: [{ id: 'e1', name: 'x', members }] } });
const api = (action, body, method) => callHandler(playersRouter, { method: method || (action === 'list' ? 'GET' : 'POST'), url: '/api/players/' + action, query: { action }, body });
const adminApi = (path, method, body, query) => callHandler(adminRouter, { method, url: '/api/admin/' + path, query: query || {}, body });

/* ---------- api/_lib/players.js ---------- */

test('names and clubs are cleaned: trimmed, inner spaces collapsed, control characters dropped, at most 80 characters', () => {
  assert.equal(P.cleanPlayerName('  Ahmad   bin\tAli \n'), 'Ahmad bin Ali');
  assert.equal(P.cleanPlayerName('A\u0000B\u007fC'), 'A B C');
  assert.equal(P.cleanPlayerName('x'.repeat(100)).length, 80);
  assert.equal(P.cleanPlayerName(('y'.repeat(79)) + ' z'), 'y'.repeat(79));   // cut at 80, then trimmed
  assert.equal(P.cleanPlayerName(42), '');
  assert.equal(P.cleanClub(undefined), '');
});

test('ensure adds new players in the order sent; the same name and club again (any letter case) is found, not added', async () => {
  const first = await P.ensurePlayers(A, [{ name: 'Ahmad', club: 'Kelab A' }, { name: '  Hakim  ', club: '' }]);
  assert.deepEqual(first.map((p) => [p.name, p.club, p.created]), [['Ahmad', 'Kelab A', true], ['Hakim', '', true]]);
  assert.match(first[0].id, /^p_[0-9a-f-]{36}$/);
  const again = await P.ensurePlayers(A, [{ name: 'HAKIM' }, { name: 'ahmad', club: 'kelab a' }]);
  assert.deepEqual(again.map((p) => [p.id, p.name, p.created]), [[first[1].id, 'Hakim', false], [first[0].id, 'Ahmad', false]], 'the stored spelling comes back');
  assert.equal(liveOf(A).length, 2);
});

test('ensure: one name twice in a request is one player; the same name in another club is another player', async () => {
  const r = await P.ensurePlayers(A, [{ name: 'Siti', club: 'X' }, { name: 'siti', club: 'x' }, { name: 'Siti', club: 'Y' }]);
  assert.equal(r[0].id, r[1].id);
  assert.notEqual(r[0].id, r[2].id);
  assert.equal(liveOf(A).length, 2);
});

test('ensure: a removed player comes back with the same id (and the spelling sent), and counts as created', async () => {
  const [p] = await P.ensurePlayers(A, [{ name: 'Zul', club: 'K' }]);
  assert.equal(await P.removePlayer(A, p.id), true);
  const [back] = await P.ensurePlayers(A, [{ name: 'ZUL', club: 'k' }]);
  assert.equal(back.id, p.id);
  assert.equal(back.created, true);
  assert.deepEqual([liveOf(A)[0].name, liveOf(A)[0].club], ['ZUL', 'k']);
});

test('ensure: a name merged into another player gives the kept player (a merge is never undone), unless a live player has that name', async () => {
  const [keep, gone] = await P.ensurePlayers(A, [{ name: 'Mohd Faiz' }, { name: 'M. Faiz' }]);
  await P.mergePlayers(A, keep.id, [gone.id], { name: 'Mohd Faiz' });
  const [r] = await P.ensurePlayers(A, [{ name: 'm. faiz' }]);
  assert.equal(r.id, keep.id);
  assert.equal(r.created, false);
  assert.equal(liveOf(A).length, 1);
});

test('ensure refuses an empty list, more than 200 names, or a blank name, before touching the database', async () => {
  assert.equal(await codeOf(P.ensurePlayers(A, [])), 'invalid_name');
  assert.equal(await codeOf(P.ensurePlayers(A, 'Ahmad')), 'invalid_name');
  assert.equal(await codeOf(P.ensurePlayers(A, Array.from({ length: 201 }, (_, i) => ({ name: 'P' + i })))), 'invalid_name');
  assert.equal(await codeOf(P.ensurePlayers(A, [{ name: 'Ok' }, { name: '   ' }])), 'invalid_name');
  assert.equal(db.calls.length, 0);
  assert.equal((await P.ensurePlayers(A, Array.from({ length: 200 }, (_, i) => ({ name: 'P' + i })))).length, 200, '200 is allowed');
});

test('ensure keeps a library at 5,000 live players: one more is refused and nothing is added; removed players do not count', async () => {
  for (let i = 0; i < 4999; i++) db.players.push({ id: 'p' + i, organizer_id: A, name: 'Player ' + i, club: '', aliases: [], removed_at: null });
  db.players.push({ id: 'gone', organizer_id: A, name: 'Gone', club: '', aliases: [], removed_at: new Date() });
  assert.equal(await codeOf(P.ensurePlayers(A, [{ name: 'New 1' }, { name: 'New 2' }])), 'limit');
  assert.equal(liveOf(A).length, 4999);
  assert.equal((await P.ensurePlayers(A, [{ name: 'New 1' }, { name: 'Player 7' }]))[0].created, true, 'the 5,000th, plus one already there');
  assert.equal(liveOf(A).length, 5000);
  assert.equal(await codeOf(P.ensurePlayers(A, [{ name: 'Gone' }])), 'limit', 'bringing one back counts too');
  assert.equal((await P.ensurePlayers(A, [{ name: 'Player 1' }]))[0].created, false, 'a full library still finds its players');
  assert.equal(await codeOf(P.ensurePlayers(B, Array.from({ length: 1 }, () => ({ name: 'Other organiser' })))), null, 'the limit is per organiser');
});

test('ensure: when someone else adds the same name at the same moment, their row is used (no error, no second player)', async () => {
  db.before = (text) => {
    if (text.startsWith('INSERT INTO players')) { db.before = null; db.players.push({ id: 'p_theirs', organizer_id: A, name: 'Iskandar', club: '', aliases: [], removed_at: null }); }
  };
  const [r] = await P.ensurePlayers(A, [{ name: 'iskandar' }]);
  assert.equal(r.id, 'p_theirs');
  assert.equal(r.created, false);
  assert.equal(liveOf(A).length, 1);
});

test('every function answers not_set_up while the players table does not exist (migration not run)', async () => {
  const calls = [() => P.listPlayers(A), () => P.ensurePlayers(A, [{ name: 'X' }]), () => P.updatePlayer(A, 'p1', { name: 'X' }), () => P.removePlayer(A, 'p1'),
    () => P.mergePlayers(A, 'p1', ['p2'], { name: 'X' }), () => P.playerOwner('p1'), () => P.adminListPlayers({})];
  for (const c of calls) { db.failNext({ code: '42P01', message: 'relation "players" does not exist' }); assert.equal(await codeOf(c()), 'not_set_up'); }
  db.failNext({ code: '57P01', message: 'terminating connection' });
  await assert.rejects(P.listPlayers(A), (e) => !(e instanceof P.LibraryError) && e.code === '57P01', 'other database errors are not dressed up');
});

test('the list: live players only, sorted by name then club, with events played and last played from the organiser\'s own events', async () => {
  const [z, a, a2] = await P.ensurePlayers(A, [{ name: 'zainal' }, { name: 'Ahmad', club: 'B' }, { name: 'ahmad', club: 'A' }]);
  const [gone] = await P.ensurePlayers(A, [{ name: 'Removed' }]);
  await P.removePlayer(A, gone.id);
  event('t1', A, [{ playerId: a.id, name: 'Ahmad' }, { playerId: z.id, name: 'zainal' }], '2026-10-01T10:00:00Z');
  event('t2', A, [{ playerId: a.id, name: 'Ahmad' }], '2026-10-15T10:00:00Z');
  event('t3', B, [{ playerId: a.id, name: 'Ahmad' }], '2026-10-28T10:00:00Z');   // another organiser's event never counts
  const list = await P.listPlayers(A);
  assert.deepEqual(list.map((p) => [p.name, p.club, p.eventsPlayed]), [['ahmad', 'A', 0], ['Ahmad', 'B', 2], ['zainal', '', 1]]);
  assert.equal(list[1].lastPlayed, '2026-10-15T10:00:00.000Z');
  assert.equal(list[0].lastPlayed, null);
  assert.equal(typeof list[0].createdAt, 'string');
  assert.equal(list.find((p) => p.id === a2.id).eventsPlayed, 0);
  assert.deepEqual(await P.listPlayers(B), []);
});

test('update renames or changes the club; a name and club another player has is refused; blank is refused; another organiser\'s player is not found', async () => {
  const [p, q] = await P.ensurePlayers(A, [{ name: 'Faiz' }, { name: 'Amran', club: 'K' }]);
  const r = await P.updatePlayer(A, p.id, { name: ' Faiz  Hakimi ', club: 'Kelab Z' });
  assert.deepEqual([r.id, r.name, r.club], [p.id, 'Faiz Hakimi', 'Kelab Z']);
  assert.equal(await codeOf(P.updatePlayer(A, p.id, { name: 'amran', club: 'k' })), 'duplicate');
  assert.equal(await codeOf(P.updatePlayer(A, p.id, { name: '  ' })), 'invalid_name');
  assert.equal(await P.updatePlayer(B, p.id, { name: 'Taken over' }), null);
  assert.equal(await P.updatePlayer(A, 'p_nope', { name: 'X' }), null);
  assert.equal(db.players.find((x) => x.id === p.id).name, 'Faiz Hakimi');
  void q;
});

test('remove hides the player (the row stays for past events); twice, or another organiser\'s, is false', async () => {
  const [p] = await P.ensurePlayers(A, [{ name: 'Akup' }]);
  assert.equal(await P.removePlayer(B, p.id), false);
  assert.equal(await P.removePlayer(A, p.id), true);
  assert.equal(await P.removePlayer(A, p.id), false);
  assert.ok(db.players.find((x) => x.id === p.id).removed_at, 'kept, marked removed');
  assert.deepEqual(await P.listPlayers(A), []);
});

test('merge keeps one player with the chosen name, hides the others and counts all their events; aliases carry through a second merge', async () => {
  const [a, b, c] = await P.ensurePlayers(A, [{ name: 'Jsham' }, { name: 'J Sham' }, { name: 'Jisham' }]);
  event('t1', A, [{ playerId: b.id, name: 'J Sham' }], '2026-10-02T10:00:00Z');
  event('t2', A, [{ playerId: c.id, name: 'Jisham' }], '2026-10-09T10:00:00Z');
  event('t3', A, [{ playerId: a.id, name: 'Jsham' }], '2026-10-05T10:00:00Z');
  const one = await P.mergePlayers(A, b.id, [c.id, b.id, c.id], { name: 'J Sham', club: 'Kelab M' });   // the keeper and repeats are ignored in the list
  assert.deepEqual([one.id, one.name, one.club, one.eventsPlayed], [b.id, 'J Sham', 'Kelab M', 2]);
  const two = await P.mergePlayers(A, a.id, [b.id], { name: 'Jsham' });
  assert.deepEqual([two.id, two.eventsPlayed, two.lastPlayed], [a.id, 3, '2026-10-09T10:00:00.000Z']);
  assert.deepEqual(db.players.find((x) => x.id === a.id).aliases.sort(), [b.id, c.id].sort());
  assert.deepEqual((await P.listPlayers(A)).map((p) => p.id), [a.id]);
  assert.equal(db.tournaments[0].data.entriesList[0].members[0].playerId, b.id, 'no event is changed');
});

test('merge refuses: nothing to fold in, an unknown or another organiser\'s id (nothing changes), a blank name', async () => {
  const [a, b] = await P.ensurePlayers(A, [{ name: 'One' }, { name: 'Two' }]);
  const [x] = await P.ensurePlayers(B, [{ name: 'Theirs' }]);
  assert.equal(await codeOf(P.mergePlayers(A, a.id, [], { name: 'One' })), 'not_found');
  assert.equal(await codeOf(P.mergePlayers(A, a.id, [a.id], { name: 'One' })), 'not_found');
  assert.equal(await codeOf(P.mergePlayers(A, a.id, [b.id, x.id], { name: 'One' })), 'not_found');
  assert.equal(await codeOf(P.mergePlayers(A, a.id, [b.id], { name: ' ' })), 'invalid_name');
  assert.equal(liveOf(A).length, 2);
  assert.equal(liveOf(B).length, 1);
});

test('merge onto a name and club a third player has is refused, and the others are put back', async () => {
  const [a, b] = await P.ensurePlayers(A, [{ name: 'One' }, { name: 'Two' }, { name: 'Three' }]);
  assert.equal(await codeOf(P.mergePlayers(A, a.id, [b.id], { name: 'three' })), 'duplicate');
  assert.deepEqual(liveOf(A).map((p) => p.name).sort(), ['One', 'Three', 'Two']);
  assert.deepEqual(db.players.find((p) => p.id === a.id).aliases, []);
});

test('the organiser id and the names are always bound values, never part of the SQL text', async () => {
  const [p, q] = await P.ensurePlayers(A, [{ name: 'One' }, { name: 'Two' }]);
  await P.listPlayers(A); await P.updatePlayer(A, p.id, { name: 'Uno' }); await P.mergePlayers(A, p.id, [q.id], { name: 'Uno' });
  await P.removePlayer(A, p.id); await P.playerOwner(p.id); await P.adminListPlayers({ owner: A, q: 'x' });
  assert.ok(db.calls.length >= 8);
  db.calls.forEach((c) => { for (const v of [A, 'One', 'Two', 'Uno']) assert.ok(!c.text.includes(v), v + ' in ' + c.text); });
});

test('playerOwner: the organiser of a live player, else null', async () => {
  const [p] = await P.ensurePlayers(B, [{ name: 'Kamil' }]);
  assert.equal(await P.playerOwner(p.id), B);
  await P.removePlayer(B, p.id);
  assert.equal(await P.playerOwner(p.id), null);
  assert.equal(await P.playerOwner('p_nope'), null);
});

test('Admin list: every organiser, searched by name or club (% and _ are plain letters), filtered by owner, paged, with the owner', async () => {
  await P.ensurePlayers(A, [{ name: 'Ahmad', club: 'Novus' }, { name: 'Hakim', club: '' }, { name: '100% Arrows', club: '' }]);
  await P.ensurePlayers(B, [{ name: 'Nazir', club: 'NOVUS Sports' }, { name: 'A_B', club: '' }]);
  let r = await P.adminListPlayers({ q: 'novus' });
  assert.deepEqual(r.players.map((p) => [p.name, p.owner.email]), [['Ahmad', 'a@example.com'], ['Nazir', 'b@example.com']]);
  assert.equal(r.total, 2);
  assert.deepEqual((await P.adminListPlayers({ q: '%' })).players.map((p) => p.name), ['100% Arrows']);
  assert.deepEqual((await P.adminListPlayers({ q: '_' })).players.map((p) => p.name), ['A_B']);
  assert.deepEqual((await P.adminListPlayers({ owner: B })).players.map((p) => p.name), ['A_B', 'Nazir']);
  const before = db.calls.length;
  assert.deepEqual(await P.adminListPlayers({ owner: 'not-a-uuid' }), { players: [], total: 0 });
  assert.equal(db.calls.length, before, 'a bad owner id is answered without a query');
  r = await P.adminListPlayers({ limit: 2, offset: 1 });
  assert.deepEqual([r.players.map((p) => p.name), r.total], [['A_B', 'Ahmad'], 5]);
  const q = db.calls[db.calls.length - 1].vals;
  assert.deepEqual(q.slice(-2), [2, 1]);
  await P.adminListPlayers({ limit: 1000, offset: -5 }); assert.deepEqual(db.calls[db.calls.length - 1].vals.slice(-2), [100, 0]);
  await P.adminListPlayers({ limit: 'x', offset: 1e12 }); assert.deepEqual(db.calls[db.calls.length - 1].vals.slice(-2), [50, 1000000]);
  assert.deepEqual(await P.adminListPlayers({ q: 'nobody' }), { players: [], total: 0 });
});

/* ---------- the endpoints ---------- */

test('/api/players/<action>: only the five actions; each needs sign-in and its own method', async () => {
  assert.equal((await api('drop', {})).statusCode, 404);
  assert.equal((await api('drop', {})).body.code, 'not_found');
  for (const a of ['list', 'ensure', 'update', 'remove', 'merge']) {
    assert.equal((await api(a, {}, a === 'list' ? 'POST' : 'GET')).statusCode, 405, a);
    who = null;
    const r = await api(a, {});
    assert.deepEqual([r.statusCode, r.body.code], [401, 'not_authenticated'], a);
    who = orgA;
  }
});

test('ensure and list endpoints: the signed-in organiser\'s own players only', async () => {
  let r = await api('ensure', { players: [{ name: 'Ahmad', club: 'K' }] });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.body.players.map((p) => [p.name, p.club, p.created]), [['Ahmad', 'K', true]]);
  who = orgB;
  assert.deepEqual((await api('list')).body, { players: [] });
  who = orgA;
  r = await api('list');
  assert.deepEqual(r.body.players.map((p) => p.name), ['Ahmad']);
  assert.deepEqual(Object.keys(r.body.players[0]).sort(), ['club', 'createdAt', 'eventsPlayed', 'id', 'lastPlayed', 'name']);
});

test('endpoint errors carry their code and status: invalid name 400, full 409, already there 409, not found 404, not set up 503, other 500', async () => {
  const expect = async (r, status, code) => { const x = await r; assert.deepEqual([x.statusCode, x.body.code], [status, code]); assert.equal(typeof x.body.error, 'string'); };
  await expect(api('ensure', { players: [{ name: '' }] }), 400, 'invalid_player_name');
  await expect(api('ensure', {}), 400, 'invalid_player_name');
  await expect(api('ensure', [1, 2]), 400, 'invalid_player_name');
  for (let i = 0; i < 5000; i++) db.players.push({ id: 'p' + i, organizer_id: A, name: 'P' + i, club: '', aliases: [], removed_at: null });
  await expect(api('ensure', { players: [{ name: 'One more' }] }), 409, 'player_limit');
  const [x, y] = await P.ensurePlayers(B, [{ name: 'X' }, { name: 'Y' }]);
  who = orgB;
  await expect(api('update', { id: x.id, name: 'y' }), 409, 'player_exists');
  await expect(api('update', { id: 'p_nope', name: 'Z' }), 404, 'player_not_found');
  await expect(api('remove', { id: 'p_nope' }), 404, 'player_not_found');
  await expect(api('merge', { keepId: x.id, ids: ['p0'], name: 'X' }), 404, 'player_not_found');   // p0 is organiser A's
  db.failNext({ code: '42P01' });
  await expect(api('list'), 503, 'library_not_set_up');
  db.failNext({ code: 'XX000', message: 'secret internal detail' });
  const r = await api('list');
  assert.deepEqual([r.statusCode, r.body], [500, { code: 'request_failed', error: 'Could not complete that request.' }], 'no database detail leaks out');
  void y;
});

test('update, remove and merge endpoints act on the organiser\'s own players', async () => {
  const [a, b] = await P.ensurePlayers(A, [{ name: 'Amran' }, { name: 'Akup' }]);
  let r = await api('update', { id: a.id, name: 'Amran Ali', club: 'K' });
  assert.deepEqual([r.statusCode, r.body.player.name, r.body.player.club], [200, 'Amran Ali', 'K']);
  r = await api('merge', { keepId: a.id, ids: [b.id], name: 'Amran Ali', club: 'K' });
  assert.deepEqual([r.statusCode, r.body.player.id], [200, a.id]);
  r = await api('remove', { id: a.id });
  assert.deepEqual([r.statusCode, r.body], [200, { ok: true }]);
  assert.deepEqual(await P.listPlayers(A), []);
});

test('Admin endpoints: Admin only; list every organiser\'s players; add to a named organiser; edit, remove and merge for the player\'s owner', async () => {
  const [a1, a2] = await P.ensurePlayers(A, [{ name: 'Ahmad' }, { name: 'Ahmd' }]);
  const [b1] = await P.ensurePlayers(B, [{ name: 'Badrul' }]);
  who = orgA;
  assert.equal((await adminApi('players', 'GET')).statusCode, 403);
  who = null;
  assert.equal((await adminApi('players', 'GET')).statusCode, 401);
  who = admin;
  let r = await adminApi('players', 'GET', null, { q: 'ah' });
  assert.deepEqual([r.statusCode, r.body.total, r.body.players.map((p) => p.owner.id)], [200, 2, [A, A]]);
  r = await adminApi('players', 'POST', { organizerId: B, name: 'New One', club: 'K' });
  assert.deepEqual([r.statusCode, r.body.player.name, r.body.player.created], [201, 'New One', true]);
  assert.equal(liveOf(B).length, 2);
  r = await adminApi('players', 'POST', { organizerId: B, name: 'new one', club: 'k' });
  assert.equal(r.body.player.created, false);
  for (const id of ['dddddddd-0000-4000-8000-000000000009', 'not-a-uuid', undefined]) {
    r = await adminApi('players', 'POST', { organizerId: id, name: 'X' });
    assert.deepEqual([r.statusCode, r.body.code], [404, 'organiser_not_found']);
  }
  r = await adminApi('players/' + b1.id, 'PATCH', { name: 'Badrul Hisham', club: '' });
  assert.deepEqual([r.statusCode, r.body.player.name], [200, 'Badrul Hisham']);
  assert.equal(db.players.find((p) => p.id === b1.id).organizer_id, B, 'still organiser B\'s');
  r = await adminApi('players/' + a1.id + '/merge', 'POST', { ids: [b1.id], name: 'Ahmad' });
  assert.deepEqual([r.statusCode, r.body.code], [404, 'player_not_found'], 'never across organisers');
  assert.equal(liveOf(B).length, 2);
  r = await adminApi('players/' + a1.id + '/merge', 'POST', { ids: [a2.id], name: 'Ahmad' });
  assert.deepEqual([r.statusCode, r.body.player.id], [200, a1.id]);
  r = await adminApi('players/' + a1.id, 'DELETE');
  assert.deepEqual([r.statusCode, r.body], [200, { ok: true }]);
  assert.deepEqual([(await adminApi('players/' + a1.id, 'DELETE')).statusCode, (await adminApi('players/p_nope', 'PATCH', { name: 'X' })).statusCode], [404, 404]);
  assert.equal((await adminApi('players/' + b1.id, 'PUT', {})).statusCode, 405);
  assert.equal((await adminApi('players/' + b1.id + '/merge', 'GET')).statusCode, 405);
});

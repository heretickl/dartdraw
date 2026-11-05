const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { createFakePlayerDb } = require('./lib/fake-player-db');
const { callHandler } = require('./lib/call-handler');

// Saving casual games to an account and reading them back (scoring_app/api/_lib/games.js through the games router).
const dbPath = require.resolve('../scoring_app/api/_lib/db');
let db;
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { sql: (...a) => db.sql(...a) } };

const router = require('../scoring_app/api/games/[action].js');
const session = require('../scoring_app/api/_lib/session');
const S = require('../scoring_app/scoring-model.js');
const { gameStats } = require('../player-stats.js');

const ENV_KEYS = ['PLAYER_SESSION_SECRET'];
let savedEnv;
const acct = (id, email, first, last) => ({ id, email, first_name: first, last_name: last, password_hash: 'x',
  email_verified_at: new Date(Date.now() - 864e5), must_change_password: false, token_version: 0 });
const ME = acct('11111111-1111-4111-8111-111111111111', 'ana@example.com', 'Ana', 'Lee');
const FR = acct('22222222-2222-4222-8222-222222222222', 'bo@example.com', 'Bo', 'Tan');
const fs = (id, status, friendId, over) => Object.assign({ id, owner_id: ME.id, email: 'bo@example.com', first_name: 'Bo', last_name: 'Tan',
  nickname: '', friend_id: friendId, status, requested_at: status === 'waiting' ? new Date() : null }, over);

beforeEach(() => {
  savedEnv = {}; ENV_KEYS.forEach((k) => { savedEnv[k] = process.env[k]; });
  process.env.PLAYER_SESSION_SECRET = 'test-secret-for-player-games';
  db = createFakePlayerDb({
    player_accounts: [ME, FR],
    friendships: [
      fs('f-linked', 'linked', FR.id, { nickname: 'Bobo' }),
      fs('f-waiting', 'waiting', FR.id, { email: 'bo2@example.com' }),
      fs('f-none', 'none', null, { email: 'cy@example.com', first_name: 'Cy', last_name: 'Ng' }),
    ],
  });
});
afterEach(() => { ENV_KEYS.forEach((k) => { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; }); });

const cookieOf = (p) => ({ [session.COOKIE_NAME]: session.signPlayer(db.rows.player_accounts.find((a) => a.id === p.id)) });
const save = (body, who) => callHandler(router, { method: 'POST', url: '/api/games/save', body, cookies: cookieOf(who || ME) });
const get = (action, query, who) => callHandler(router, { method: 'GET', url: '/api/games/' + action, query, cookies: cookieOf(who || ME) });
const uid = () => crypto.randomUUID();
const rowsFor = (gameId) => db.rows.player_games.filter((p) => p.game_id === gameId);

// A best-of-1 501 the way casual play makes it: Ana (side a) wins with a 141 checkout on the 3rd dart.
function finished501(opts) {
  opts = opts || {};
  const m = S.create({ format: S.formatFor({ game: '501', bestOf: 1 }), names: { a: 'Ana', b: 'Bo' } });
  m.bull('a');
  [[100, 60], [140, 45], [120, 81]].forEach(([x, y]) => { m.total(x); m.total(y); });
  if (opts.finish !== false) { m.total(141); m.finishDart(3); }
  return { format: m.format(), events: m.events() };
}
const body = (sideB, over) => { const g = finished501(); return Object.assign({ id: uid(), format: g.format, events: g.events, playedAt: new Date().toISOString(), sideA: { me: true }, sideB }, over); };

test('saving the same game id twice stores it once', async () => {
  const b = body({ guest: 'Bo' });
  const r1 = await save(b);
  const r2 = await save(b);
  assert.equal(r1.statusCode, 200);
  assert.deepEqual(r1.body, { saved: { me: 'saved', friend: null } });
  assert.deepEqual(r2.body, r1.body, 'the retry gets the same answer');
  assert.equal(db.rows.casual_games.length, 1);
  assert.equal(rowsFor(b.id).length, 1);
});

test('saving a linked friend game twice stores it once and sends one notice', async () => {
  const b = body({ friendshipId: 'f-linked' });
  await save(b);
  const r2 = await save(b);
  assert.deepEqual(r2.body, { saved: { me: 'saved', friend: 'saved' } });
  assert.equal(rowsFor(b.id).length, 2);
  assert.equal(db.rows.player_notices.length, 1);
});

test('a game id recorded by someone else is refused without saying whose', async () => {
  const b = body({ guest: 'Ana' });
  await save(b, FR);
  const r = await save(b, ME);
  assert.equal(r.statusCode, 400);
  assert.equal(r.body.code, 'bad_id');
  assert.equal(rowsFor(b.id).length, 1);
});

test('unfinished game → 400 game_not_finished, nothing stored', async () => {
  const g = finished501({ finish: false });
  const r = await save({ id: uid(), format: g.format, events: g.events, sideA: { me: true }, sideB: { guest: 'Bo' } });
  assert.equal(r.statusCode, 400);
  assert.equal(r.body.code, 'game_not_finished');
  assert.equal(db.rows.casual_games.length, 0);
});

test('a game with a turn the engine refuses → 400 bad_game', async () => {
  const b = body({ guest: 'Bo' });
  // a turn after the winning one
  const late = b.events.concat([{ type: 'turn', id: 'tx', leg: 0, side: 'b', player: 'Bo', mode: 'total', score: 60, seq: 999 }]);
  assert.equal((await save(Object.assign({}, b, { events: late }))).body.code, 'bad_game');
  // a made-up score no three darts can make
  const madeUp = b.events.map((e) => (e.type === 'turn' && e.score === 140 ? Object.assign({}, e, { score: 179 }) : e));
  assert.equal((await save(Object.assign({}, b, { id: uid(), events: madeUp }))).body.code, 'bad_game');
  // a checkout that does not add up (the last turn claims 140 from 141)
  const short = b.events.map((e) => (e.type === 'turn' && e.score === 141 ? Object.assign({}, e, { score: 140 }) : e));
  const r = await save(Object.assign({}, b, { id: uid(), events: short }));
  assert.equal(r.statusCode, 400);
  assert.ok(['bad_game', 'game_not_finished'].includes(r.body.code), r.body.code);
  assert.equal(db.rows.casual_games.length, 0);
});

test('a format casual play cannot make, a bad id or too many events is refused', async () => {
  assert.equal((await save(body({ guest: 'Bo' }, { format: { game: 'x01', start: 301, bestOf: 1, bullFirst: 'first' } }))).body.code, 'bad_game');
  assert.equal((await save(body({ guest: 'Bo' }, { id: 'nope' }))).body.code, 'bad_id');
  // strict lowercase uuid ids (ledger ruling)
  assert.equal((await save(body({ guest: 'Bo' }, { id: uid().toUpperCase() }))).body.code, 'bad_id');
  assert.equal((await save(body({ guest: 'Bo' }, { id: '------------------------------------' }))).body.code, 'bad_id');
  const big = await save(body({ guest: 'Bo' }, { events: new Array(5001).fill({ type: 'x' }) }));
  assert.equal(big.statusCode, 413);
  assert.equal(db.rows.casual_games.length, 0);
});

test('guest opponent: one player_games row', async () => {
  const b = body({ guest: '  Bo  ' });
  const r = await save(b);
  assert.deepEqual(r.body, { saved: { me: 'saved', friend: null } });
  const rows = rowsFor(b.id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].player_id, ME.id);
  assert.equal(rows[0].won, true);
  const g = db.rows.casual_games[0];
  assert.equal(g.side_b.name, 'Bo');
  assert.equal(g.side_b.guest, true);
  assert.equal(g.side_a.player_id, ME.id);
  assert.equal(g.winner, 'a');
});

test('linked friend: two saved rows and a notice', async () => {
  const b = body({ friendshipId: 'f-linked' });
  const r = await save(b);
  assert.deepEqual(r.body, { saved: { me: 'saved', friend: 'saved' } });
  const rows = rowsFor(b.id);
  assert.equal(rows.length, 2);
  const theirs = rows.find((p) => p.player_id === FR.id);
  assert.equal(theirs.status, 'saved');
  assert.equal(theirs.side, 'b');
  assert.equal(theirs.won, false);
  assert.ok(theirs.stats.x01.darts > 0);
  const n = db.rows.player_notices;
  assert.equal(n.length, 1);
  assert.equal(n[0].player_id, FR.id);
  assert.equal(n[0].kind, 'casual_game');
  assert.equal(n[0].data.gameId, b.id);
  assert.equal(n[0].data.by, 'Ana');
  assert.equal(n[0].data.won, false);
  assert.equal(n[0].data.score, '0-1');
  assert.equal(typeof n[0].data.avg3, 'number');
});

test('waiting friend: their row is held, no notice', async () => {
  const b = body({ friendshipId: 'f-waiting' });
  const r = await save(b);
  assert.deepEqual(r.body, { saved: { me: 'saved', friend: 'held' } });
  assert.equal(rowsFor(b.id).find((p) => p.player_id === FR.id).status, 'held');
  assert.equal(db.rows.player_notices.length, 0);
});

test('no-account friend: nothing stored for them', async () => {
  const b = body({ friendshipId: 'f-none' });
  const r = await save(b);
  assert.deepEqual(r.body, { saved: { me: 'saved', friend: 'none' } });
  assert.equal(rowsFor(b.id).length, 1);
  assert.equal(db.rows.casual_games[0].side_b.player_id, null);
  assert.equal(db.rows.casual_games[0].side_b.friendship_id, 'f-none');
});

test('a blocked pair saves nothing for the friend (ledger ruling)', async () => {
  db.rows.friend_blocks.push({ blocker_id: FR.id, blocked_id: ME.id });
  const b = body({ friendshipId: 'f-linked' });
  const r = await save(b);
  assert.deepEqual(r.body, { saved: { me: 'saved', friend: 'none' } });
  assert.equal(rowsFor(b.id).length, 1);
  assert.equal(db.rows.player_notices.length, 0);
});

test('a friendshipId that is not on the caller\'s own list is refused', async () => {
  db.rows.friendships.push(fs('f-theirs', 'linked', ME.id, { owner_id: FR.id, email: 'ana@example.com' }));
  assert.equal((await save(body({ friendshipId: 'f-theirs' }))).body.code, 'bad_opponent');
  assert.equal((await save(body({ friendshipId: 'f-unknown' }))).body.code, 'bad_opponent');
  assert.equal((await save(body({}))).body.code, 'bad_opponent');
  assert.equal(db.rows.casual_games.length, 0);
});

test('stats come from the replay even if the body carries a stats field', async () => {
  const b = body({ friendshipId: 'f-linked' }, { stats: { x01: { darts: 3, points: 501 } }, winner: 'b', statsA: { fake: 1 } });
  await save(b);
  const players = { a: ['Ana'], b: ['Bo'] };
  const want = gameStats(b.format, players, b.events, 'Ana');
  const mine = rowsFor(b.id).find((p) => p.player_id === ME.id);
  assert.deepEqual(mine.stats, JSON.parse(JSON.stringify(want)));
  assert.equal(mine.stats.x01.darts, 12);
  assert.equal(mine.stats.x01.points, 501);
  assert.equal(db.rows.casual_games[0].winner, 'a');
});

test('a playedAt in the future or over 30 days ago falls back to now', async () => {
  const t0 = Date.now();
  const b1 = body({ guest: 'Bo' }, { playedAt: '2099-01-01T00:00:00Z' });
  await save(b1);
  const stored = db.rows.casual_games.find((g) => g.id === b1.id).played_at.getTime();
  assert.ok(stored >= t0 && stored <= Date.now());
  const twoDays = new Date(t0 - 2 * 864e5).toISOString();
  const b2 = body({ guest: 'Bo' }, { playedAt: twoDays });
  await save(b2);
  assert.equal(db.rows.casual_games.find((g) => g.id === b2.id).played_at.toISOString(), twoDays);
});

test('list: the caller\'s saved games, newest first, with paging', async () => {
  const ids = [];
  for (let i = 0; i < 3; i++) {
    const b = body({ friendshipId: 'f-linked' }, { playedAt: new Date(Date.now() - (3 - i) * 3600e3).toISOString() });
    await save(b); ids.push(b.id);
  }
  const held = body({ friendshipId: 'f-waiting' });
  await save(held);
  const p1 = await get('list', { limit: '2' });
  assert.equal(p1.statusCode, 200);
  assert.deepEqual(p1.body.games.map((g) => g.id), [held.id, ids[2]]);
  const item = p1.body.games[1];
  assert.equal(item.game, '501');
  assert.equal(item.won, true);
  assert.equal(item.score, '1-0');
  assert.deepEqual(item.opponent, { name: 'Bobo', guest: false });   // the nickname the caller gave
  assert.equal(typeof item.headline.avg3, 'number');
  const p2 = await get('list', { limit: '2', before: p1.body.nextBefore });
  assert.deepEqual(p2.body.games.map((g) => g.id), [ids[1], ids[0]]);
  // the friend sees only the linked games (the held one is not theirs yet)
  const theirs = await get('list', {}, FR);
  assert.deepEqual(theirs.body.games.map((g) => g.id).sort(), ids.slice().sort());
  assert.equal(theirs.body.games[0].won, false);
  assert.equal(theirs.body.nextBefore, null);
});

test('one: both players\' stats for a linked friend or a guest; a held friend gets 404', async () => {
  const linked = body({ friendshipId: 'f-linked' });
  const guest = body({ guest: 'Bo' });
  const waiting = body({ friendshipId: 'f-waiting' });
  const none = body({ friendshipId: 'f-none' });
  for (const b of [linked, guest, waiting, none]) await save(b);

  const r1 = await get('one', { id: linked.id });
  assert.equal(r1.statusCode, 200);
  assert.ok(r1.body.game.me.stats.x01);
  assert.ok(r1.body.game.opponent.stats.x01);
  const r2 = await get('one', { id: guest.id });
  assert.equal(r2.body.game.opponent.guest, true);
  assert.ok(r2.body.game.opponent.stats.x01, 'a guest\'s numbers are worked out from the events');
  assert.equal((await get('one', { id: waiting.id })).body.game.opponent.stats, null);
  assert.equal((await get('one', { id: none.id })).body.game.opponent.stats, null);

  const friendSaved = await get('one', { id: linked.id }, FR);
  assert.equal(friendSaved.statusCode, 200);
  assert.equal(friendSaved.body.game.won, false);
  const friendHeld = await get('one', { id: waiting.id }, FR);
  assert.equal(friendHeld.statusCode, 404, 'a held game stays private until accepted');
  assert.equal(friendHeld.body.code, 'not_found');
  assert.equal((await get('one', { id: uid() })).statusCode, 404);
  assert.equal((await get('one', { id: linked.id.toUpperCase() })).statusCode, 400);
});

test('saving needs a signed-in player', async () => {
  const r = await callHandler(router, { method: 'POST', url: '/api/games/save', body: body({ guest: 'Bo' }) });
  assert.equal(r.statusCode, 401);
  assert.equal(db.rows.casual_games.length, 0);
});

// ---- final review fixes (I1, I2) ----

test('a game against a removed entry saves for the caller only', async () => {
  // Bo removed or blocked Ana (or Ana removed the entry herself) after the game was set up: Ana's own result still counts.
  db.rows.friendships.find((f) => f.id === 'f-linked').removed_at = new Date();
  const b = body({ friendshipId: 'f-linked' });
  const r = await save(b);
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.body, { saved: { me: 'saved', friend: 'none' } });
  const rows = rowsFor(b.id);
  assert.equal(rows.length, 1, 'no row for the other player');
  assert.equal(rows[0].player_id, ME.id);
  const g = db.rows.casual_games.find((x) => x.id === b.id);
  assert.equal(g.side_b.friendship_id, 'f-linked', 'head-to-head stays keyed to the entry');
  assert.equal(g.side_b.player_id, null);
  assert.equal(g.side_b.name, 'Bo Tan');
  assert.equal(g.side_b.nickname, 'Bobo');
  assert.equal(g.side_b.guest, false);
  assert.equal(db.rows.player_notices.length, 0, 'no notice for them');
  // saving it again answers the same
  assert.deepEqual((await save(b)).body, r.body);
});

test('an id never on my list is still bad_opponent', async () => {
  // someone else's entry, live or removed, and an id that never existed
  db.rows.friendships.push(fs('f-theirs', 'linked', ME.id, { owner_id: FR.id, email: 'ana@example.com' }));
  db.rows.friendships.push(fs('f-theirs-gone', 'linked', ME.id, { owner_id: FR.id, email: 'ana2@example.com', removed_at: new Date() }));
  for (const id of ['f-theirs', 'f-theirs-gone', 'f-unknown']) {
    const r = await save(body({ friendshipId: id }));
    assert.equal(r.statusCode, 400, id);
    assert.equal(r.body.code, 'bad_opponent', id);
  }
  assert.equal(db.rows.casual_games.length, 0);
});

test('extra fields on events are not stored', async () => {
  const b = body({ guest: 'Bo' });
  const clean = b.events.map((e) => Object.assign({}, e));
  // a big made-up field on every event, and entries that are not events at all: replay ignores both
  b.events = b.events.map((e) => Object.assign({}, e, { pad: 'x'.repeat(500), nested: { deep: [1, 2, 3] } })).concat([42, 'junk', null, [1]]);
  const r = await save(b);
  assert.equal(r.statusCode, 200);
  const stored = db.rows.casual_games.find((g) => g.id === b.id).events;
  assert.equal(stored.length, clean.length, 'only real events are stored');
  stored.forEach((e) => { assert.ok(!('pad' in e) && !('nested' in e), 'no extra fields'); });
  assert.deepEqual(stored, JSON.parse(JSON.stringify(clean)), 'the fields the engine reads are kept as they were');
  const mine = rowsFor(b.id)[0];
  assert.deepEqual(mine.stats, JSON.parse(JSON.stringify(gameStats(b.format, { a: ['Ana'], b: ['Bo'] }, clean, 'Ana'))));
});

test('events over 256 KB → 400 bad_game', async () => {
  const b = body({ guest: 'Bo' });
  b.events = b.events.map((e, i) => (i === 0 ? Object.assign({}, e, { pad: 'x'.repeat(256 * 1024) }) : e));
  const r = await save(b);
  assert.equal(r.statusCode, 400);
  assert.equal(r.body.code, 'bad_game');
  assert.equal(db.rows.casual_games.length, 0);
});

test('61st save in an hour → 429', async () => {
  const first = body({ guest: 'Bo' });
  assert.equal((await save(first)).statusCode, 200);
  // a retry of the same game counts too
  assert.equal((await save(first)).statusCode, 200);
  for (let i = 0; i < 58; i++) assert.equal((await save(body({ guest: 'Bo' }))).statusCode, 200, 'save ' + (i + 3));
  const late = body({ guest: 'Bo' });
  const r = await save(late);
  assert.equal(r.statusCode, 429);
  assert.equal(r.body.code, 'too_many');
  assert.ok(!db.rows.casual_games.some((g) => g.id === late.id), 'nothing stored');
  // another player has their own allowance
  assert.equal((await save(body({ guest: 'Ana' }), FR)).statusCode, 200);
  // an hour later it opens again
  db.advance(60 * 60 * 1000 + 1);
  assert.equal((await save(late)).statusCode, 200);
});

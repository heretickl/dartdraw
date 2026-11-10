const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { createFakePlayerDb } = require('./lib/fake-player-db');
const { callHandler } = require('./lib/call-handler');

// Friends lists and friend requests (scoring_app/api/_lib/friends.js through the friends and games routers).
const dbPath = require.resolve('../scoring_app/api/_lib/db');
let db;
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { sql: (...a) => db.sql(...a) } };

const friendsRouter = require('../scoring_app/api/friends/[action].js');
const gamesRouter = require('../scoring_app/api/games/[action].js');
const session = require('../scoring_app/api/_lib/session');
const mail = require('../scoring_app/api/_lib/mail');
const S = require('../scoring_app/scoring-model.js');

const DAY = 24 * 60 * 60 * 1000;
const ENV_KEYS = ['PLAYER_SESSION_SECRET', 'MAIL_PROVIDER', 'RESEND_API_KEY', 'MAIL_FROM', 'APP_URL', 'PLAYER_ACCOUNTS'];
let savedEnv;
const acct = (n, email, first, last, confirmed) => ({ id: String(n).repeat(8) + '-1111-4111-8111-111111111111', email, first_name: first,
  last_name: last, password_hash: 'x', email_verified_at: confirmed ? new Date(Date.now() - DAY) : null, must_change_password: false, token_version: 0 });
let A, B, C, D;

beforeEach(() => {
  savedEnv = {}; ENV_KEYS.forEach((k) => { savedEnv[k] = process.env[k]; delete process.env[k]; });
  process.env.PLAYER_SESSION_SECRET = 'test-secret-for-player-friends';
  process.env.PLAYER_ACCOUNTS = 'on';
  process.env.MAIL_PROVIDER = 'console';
  process.env.APP_URL = 'https://scoring.example.test';
  db = createFakePlayerDb({ player_accounts: [
    acct('a', 'ana@example.com', 'Ana', 'Lee', true),
    acct('b', 'bo@example.com', 'Bo', 'Tan', true),
    acct('c', 'cy@example.com', 'Cy', 'Ng', false),   // an unconfirmed sign-up
    acct('d', 'dee@example.com', 'Dee', 'Ong', true),
  ] });
  [A, B, C, D] = db.rows.player_accounts;
  mail.sendMail.outbox.length = 0;
  console._log = console._log || console.log;
  console.log = () => {};
});
afterEach(() => {
  console.log = console._log;
  ENV_KEYS.forEach((k) => { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; });
});

const cookieOf = (p) => ({ [session.COOKIE_NAME]: session.signPlayer(p) });
const F = (who, action, body) => callHandler(friendsRouter, { method: action === 'list' ? 'GET' : 'POST', url: '/api/friends/' + action, body, cookies: cookieOf(who) });
const G = (who, action, body, query) => callHandler(gamesRouter, { method: action === 'save' ? 'POST' : 'GET', url: '/api/games/' + action, body, query, cookies: cookieOf(who) });
const noticesOf = (p, kind) => db.rows.player_notices.filter((n) => n.player_id === p.id && (!kind || n.kind === kind));
const rowsOf = (p) => db.rows.player_games.filter((x) => x.player_id === p.id);
const entry = (id) => db.rows.friendships.find((f) => f.id === id);

// The recorder (side a, the caller) wins a best-of-1 501 against `oppName`.
async function play(who, friendshipId, oppName) {
  const m = S.create({ format: S.formatFor({ game: '501', bestOf: 1 }), names: { a: who.first_name, b: oppName || 'Opp' } });
  m.bull('a');
  [[100, 60], [140, 45], [120, 81]].forEach(([x, y]) => { m.total(x); m.total(y); });
  m.total(141); m.finishDart(3);
  const r = await G(who, 'save', { id: crypto.randomUUID(), format: m.format(), events: m.events(), playedAt: new Date().toISOString(), sideA: { me: true }, sideB: { friendshipId } });
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  return r.body.saved.friend;
}
async function addOk(who, body) {
  const r = await F(who, 'add', body);
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  return r.body.friend;
}
async function linkedPair() {
  const f = await addOk(A, { email: 'bo@example.com' });
  assert.equal((await F(B, 'accept', { friendshipId: f.id })).statusCode, 200);
  return f.id;
}

test('blocked or self email looks like no account', async () => {
  const no = { account: false };
  assert.deepEqual((await F(A, 'check', { email: 'ANA@example.com' })).body, no, 'own email');
  assert.deepEqual((await F(A, 'check', { email: 'cy@example.com' })).body, no, 'unconfirmed sign-up');
  assert.deepEqual((await F(A, 'check', { email: 'zed@example.com' })).body, no, 'nobody');
  assert.deepEqual((await F(A, 'check', { email: 'bo@example.com' })).body, { account: true, firstName: 'Bo', lastName: 'Tan' });
  db.rows.friend_blocks.push({ blocker_id: B.id, blocked_id: A.id });
  assert.deepEqual((await F(A, 'check', { email: 'bo@example.com' })).body, no, 'blocked by them');
  assert.deepEqual((await F(B, 'check', { email: 'ana@example.com' })).body, no, 'blocked by you');
  // adding a blocked email gives an ordinary no-account entry, and nothing reaches them
  const f = await addOk(A, { email: 'bo@example.com', firstName: 'Bo', lastName: 'T' });
  assert.equal(f.badge, 'none');
  assert.equal(noticesOf(B).length, 0);
  assert.equal(await play(A, f.id, 'Bo'), 'none');
  assert.equal(rowsOf(B).length, 0);
  // adding one's own email is refused
  assert.equal((await F(A, 'add', { email: 'ana@example.com', firstName: 'A', lastName: 'L' })).body.code, 'own_email');
});

test('add on an unconfirmed account\'s email → none, and no request reaches it', async () => {
  const f = await addOk(A, { email: 'cy@example.com', firstName: 'Cyrus', lastName: 'Ng', nickname: 'Cyclone Cyrus!!' });
  assert.equal(f.badge, 'none');
  assert.equal(f.nickname, 'Cyclone Cyru', 'cut at 12');
  assert.equal(noticesOf(C).length, 0);
  assert.equal(await play(A, f.id, 'Cyrus'), 'none');
  assert.equal(rowsOf(C).length, 0, 'no game is held for an unconfirmed sign-up');
  // A's list reads: still nothing for C (lazy confirm only matches confirmed accounts)
  const list = await F(A, 'list');
  assert.equal(list.body.friends.find((x) => x.id === f.id).badge, 'none');
  assert.equal(noticesOf(C).length, 0);
  // whoever signed up with the address cannot read anything either: an unconfirmed session is refused
  assert.equal((await F(C, 'list')).statusCode, 401);
});

test('once the email is confirmed, the next read turns the entry into a request (lazy confirm), with no back-fill', async () => {
  const f = await addOk(A, { email: 'cy@example.com', firstName: 'Cyrus', lastName: 'Ng' });
  await play(A, f.id, 'Cyrus');
  C.email_verified_at = new Date();
  const list = await F(A, 'list');
  const e = list.body.friends.find((x) => x.id === f.id);
  assert.equal(e.badge, 'waiting');
  assert.equal(e.firstName, 'Cy', 'names now come from the account');
  assert.equal(noticesOf(C, 'friend_request').length, 1);
  const cl = await F(C, 'list');
  assert.deepEqual(cl.body.requests.map((r) => r.id), [f.id]);
  assert.equal(rowsOf(C).length, 0, 'games played before are not given to them');
});

test('add: duplicate → 409 already_friends; an account gets a waiting entry and a request notice', async () => {
  const f = await addOk(A, { email: 'bo@example.com', firstName: 'Typed', lastName: 'Name', nickname: 'Bobo' });
  assert.equal(f.badge, 'waiting');
  assert.equal(f.firstName, 'Bo');
  const n = noticesOf(B, 'friend_request');
  assert.equal(n.length, 1);
  assert.deepEqual(n[0].data, { friendshipId: f.id, by: 'Ana' });
  const again = await F(A, 'add', { email: 'BO@example.com' });
  assert.equal(again.statusCode, 409);
  assert.equal(again.body.code, 'already_friends');
});

test('accept turns held games into saved', async () => {
  const f = await addOk(A, { email: 'bo@example.com' });
  assert.equal(await play(A, f.id, 'Bo'), 'held');
  assert.equal(await play(A, f.id, 'Bo'), 'held');
  assert.deepEqual(rowsOf(B).map((r) => r.status), ['held', 'held']);
  assert.equal((await G(B, 'list')).body.games.length, 0, 'held games are not on their scorecard yet');
  const bl = await F(B, 'list');
  assert.deepEqual(bl.body.requests.map((r) => [r.id, r.firstName]), [[f.id, 'Ana']]);

  const r = await F(B, 'accept', { friendshipId: f.id });
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.friend.badge, 'linked');
  assert.deepEqual(rowsOf(B).map((x) => x.status), ['saved', 'saved']);
  assert.equal(entry(f.id).status, 'linked');
  const mine = db.rows.friendships.find((x) => x.owner_id === B.id && x.removed_at == null);
  assert.equal(mine.status, 'linked');
  assert.equal(mine.friend_id, A.id);
  assert.equal(noticesOf(A, 'friend_accepted').length, 1);
  assert.ok(noticesOf(B, 'friend_request')[0].read_at, 'the request notice is marked read');
  assert.equal((await G(B, 'list')).body.games.length, 2);
  // head-to-head and the comparison on both sides
  const al = (await F(A, 'list')).body.friends.find((x) => x.id === f.id);
  assert.deepEqual(al.headToHead, { won: 2, lost: 0 });
  assert.equal(al.compare.games, 2);
  const bf = (await F(B, 'list')).body.friends[0];
  assert.deepEqual(bf.headToHead, { won: 0, lost: 2 });
  assert.equal((await F(B, 'accept', { friendshipId: f.id })).statusCode, 404, 'a request is accepted once');
  assert.equal(await play(A, f.id, 'Bo'), 'saved');
});

test('decline deletes held games silently', async () => {
  const f = await addOk(A, { email: 'bo@example.com' });
  await play(A, f.id, 'Bo');
  const aNotices = noticesOf(A).length;
  const r = await F(B, 'decline', { friendshipId: f.id });
  assert.deepEqual(r.body, { ok: true });
  assert.equal(rowsOf(B).length, 0);
  assert.equal(noticesOf(A).length, aNotices, 'nobody is told');
  assert.equal(noticesOf(B, 'friend_request').length, 0, 'their unread request notice goes too');
  assert.equal((await F(B, 'list')).body.requests.length, 0);
  // ledger: the requester's entry becomes a 'none' entry; their own games keep saving
  const e = (await F(A, 'list')).body.friends.find((x) => x.id === f.id);
  assert.equal(e.badge, 'none');
  assert.equal(e.asked, true);
  assert.equal(rowsOf(A).length, 1);
  assert.equal(await play(A, f.id, 'Bo'), 'none');
  assert.equal(rowsOf(B).length, 0);
  assert.equal((await F(A, 'list')).body.friends.find((x) => x.id === f.id).badge, 'none', 'a declined person is not asked again by itself');
  assert.equal((await F(A, 'resend', { friendshipId: f.id })).body.code, 'too_soon');
});

test('request older than 30 days reads as declined', async () => {
  const f = await addOk(A, { email: 'bo@example.com' });
  await play(A, f.id, 'Bo');
  assert.equal(rowsOf(B).length, 1);
  entry(f.id).requested_at = new Date(Date.now() - 31 * DAY);
  const bl = await F(B, 'list');
  assert.equal(bl.body.requests.length, 0);
  assert.equal(rowsOf(B).length, 0, 'the held game is dropped');
  assert.equal(entry(f.id).status, 'none');
  assert.equal((await F(A, 'list')).body.friends.find((x) => x.id === f.id).badge, 'none');
  assert.equal((await F(B, 'accept', { friendshipId: f.id })).statusCode, 404);
});

test('a request past 30 days but not yet tidied is not accepted and stores nothing new', async () => {
  const f = await addOk(A, { email: 'bo@example.com' });
  entry(f.id).requested_at = new Date(Date.now() - 30 * DAY - 1000);
  assert.equal(await play(A, f.id, 'Bo'), 'none');
  assert.equal(rowsOf(B).length, 0);
  assert.equal((await F(B, 'accept', { friendshipId: f.id })).statusCode, 404);
});

test('resend: at most once every 7 days', async () => {
  const f = await addOk(A, { email: 'bo@example.com' });
  const soon = await F(A, 'resend', { friendshipId: f.id });
  assert.equal(soon.statusCode, 409);
  assert.equal(soon.body.code, 'too_soon');
  assert.equal(soon.body.nextAt, new Date(entry(f.id).requested_at.getTime() + 7 * DAY).toISOString());
  entry(f.id).requested_at = new Date(Date.now() - 7 * DAY);
  const ok = await F(A, 'resend', { friendshipId: f.id });
  assert.equal(ok.statusCode, 200);
  assert.equal(noticesOf(B, 'friend_request').length, 1, 'the old notice is replaced, not doubled');
});

test('remove keeps games on both scorecards', async () => {
  const fid = await linkedPair();
  await play(A, fid, 'Bo');
  await play(A, fid, 'Bo');
  assert.deepEqual(rowsOf(B).map((r) => r.status), ['saved', 'saved']);
  const r = await F(A, 'remove', { friendshipId: fid });
  assert.deepEqual(r.body, { ok: true });
  const liveBetween = db.rows.friendships.filter((f) => f.removed_at == null && ((f.owner_id === A.id && f.friend_id === B.id) || (f.owner_id === B.id && f.friend_id === A.id)));
  assert.equal(liveBetween.length, 0, 'off both lists');
  assert.equal(rowsOf(A).length, 2);
  assert.equal(rowsOf(B).length, 2);
  assert.equal((await G(A, 'list')).body.games.length, 2);
  assert.equal((await G(B, 'list')).body.games.length, 2);
  assert.equal((await F(B, 'list')).body.friends.length, 0);
  assert.equal(noticesOf(B).filter((n) => n.kind !== 'casual_game' && n.kind !== 'friend_request').length, 0, 'nobody is told');
  assert.equal((await F(A, 'remove', { friendshipId: fid })).statusCode, 404);
});

test('block: removes both entries and stops further requests both ways', async () => {
  const bToA = await addOk(B, { email: 'ana@example.com' });
  const r = await F(A, 'block', { friendshipId: bToA.id });   // blocked from the request itself
  assert.deepEqual(r.body, { ok: true });
  assert.ok(entry(bToA.id).removed_at);
  assert.deepEqual(db.rows.friend_blocks.map((b) => [b.blocker_id, b.blocked_id]), [[A.id, B.id]]);
  assert.equal((await F(A, 'list')).body.requests.length, 0);
  const again = await addOk(B, { email: 'ana@example.com', firstName: 'Ana', lastName: 'L' });
  assert.equal(again.badge, 'none', 'looks like no account');
  assert.equal(noticesOf(A, 'friend_request').filter((n) => n.read_at == null && n.data.friendshipId === again.id).length, 0);
});

test('invite twice inside 7 days → 409', async () => {
  const f = await addOk(A, { email: 'dan@example.com', firstName: 'Dan', lastName: 'Ho' });
  const r1 = await F(A, 'invite', { friendshipId: f.id, lang: 'ms' });
  assert.equal(r1.statusCode, 200);
  assert.equal(r1.body.sent, 'invite');
  assert.equal(mail.sendMail.outbox.length, 1);
  assert.equal(mail.sendMail.outbox[0].to, 'dan@example.com');
  const r2 = await F(A, 'invite', { friendshipId: f.id });
  assert.equal(r2.statusCode, 409);
  assert.equal(r2.body.code, 'too_soon');
  assert.equal(r2.body.nextAt, new Date(entry(f.id).invited_at.getTime() + 7 * DAY).toISOString());
  assert.equal(mail.sendMail.outbox.length, 1);
  entry(f.id).invited_at = new Date(Date.now() - 7 * DAY);
  assert.equal((await F(A, 'invite', { friendshipId: f.id })).statusCode, 200);
  assert.equal(mail.sendMail.outbox.length, 2);
  // a waiting (account) entry cannot be invited
  const w = await addOk(A, { email: 'bo@example.com' });
  assert.equal((await F(A, 'invite', { friendshipId: w.id })).body.code, 'not_invitable');
});

test('linked names come from the friend\'s account at read time; none rows keep the typed names', async () => {
  const fid = await linkedPair();
  const n = await addOk(A, { email: 'dan@example.com', firstName: 'Dan', lastName: 'Ho', nickname: 'Danny' });
  B.first_name = 'Bobby';
  const list = (await F(A, 'list')).body.friends;
  assert.equal(list.find((x) => x.id === fid).firstName, 'Bobby');
  const dan = list.find((x) => x.id === n.id);
  assert.deepEqual([dan.firstName, dan.lastName, dan.nickname, dan.email], ['Dan', 'Ho', 'Danny', 'dan@example.com']);
});

test('update: nickname on any entry, names and email only on a none entry; a matching email sends a request', async () => {
  const fid = await linkedPair();
  assert.equal((await F(A, 'update', { friendshipId: fid, nickname: 'Bob the Builder' })).body.friend.nickname, 'Bob the Buil');
  assert.equal((await F(A, 'update', { friendshipId: fid, firstName: 'X' })).body.code, 'not_editable');
  const n = await addOk(A, { email: 'dee-old@example.com', firstName: 'Dee', lastName: 'O' });
  const u = await F(A, 'update', { friendshipId: n.id, email: 'dee@example.com' });
  assert.equal(u.body.friend.badge, 'waiting');
  assert.equal(u.body.friend.lastName, 'Ong');
  assert.equal(noticesOf(D, 'friend_request').length, 1);
});

test('add with mergeFrom moves the old entry\'s games to the new entry', async () => {
  const old = await addOk(A, { email: 'dan.old@example.com', firstName: 'Dan', lastName: 'Ho' });
  await play(A, old.id, 'Dan');
  await play(A, old.id, 'Dan');
  const merged = await addOk(A, { email: 'dan@example.com', firstName: 'Dan', lastName: 'Ho', mergeFrom: old.id });
  const list = (await F(A, 'list')).body.friends;
  assert.equal(list.some((x) => x.id === old.id), false);
  assert.equal(list.find((x) => x.id === merged.id).games, 2);
  assert.equal((await F(A, 'add', { email: 'eve@example.com', firstName: 'E', lastName: 'V', mergeFrom: 'nope' })).body.code, 'bad_merge');
});

test('check is limited to 30 answers per player per hour', async () => {
  let last;
  for (let i = 0; i < 31; i++) last = await F(A, 'check', { email: 'q' + i + '@example.com' });
  assert.equal(last.statusCode, 429);
  assert.equal(last.body.code, 'too_many');
  assert.equal((await F(B, 'check', { email: 'q@example.com' })).statusCode, 200, 'counted per player');
});

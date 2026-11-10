const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { createFakePlayerDb } = require('./lib/fake-player-db');
const { callHandler } = require('./lib/call-handler');

// The scoring app's player accounts: sign up, confirm (link + password), log in, reset, change password, profile name.
// Real handlers through the real router, against an in-memory database.
const dbPath = require.resolve('../scoring_app/api/_lib/db');
let db;
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { sql: (...a) => db.sql(...a) } };

const accountRouter = require('../scoring_app/api/account/[action].js');
const gamesRouter = require('../scoring_app/api/games/[action].js');
const mail = require('../scoring_app/api/_lib/mail');
const session = require('../scoring_app/api/_lib/session');

const COOKIE = '__Host-dd-player';
const ENV_KEYS = ['PLAYER_SESSION_SECRET', 'MAIL_PROVIDER', 'RESEND_API_KEY', 'MAIL_FROM', 'APP_URL', 'AUTH_MIN_RESPONSE_MS', 'PLAYER_ACCOUNTS'];
const DAY = 24 * 60 * 60 * 1000;
let savedEnv;

beforeEach(() => {
  savedEnv = {}; ENV_KEYS.forEach((k) => { savedEnv[k] = process.env[k]; delete process.env[k]; });
  process.env.PLAYER_SESSION_SECRET = 'test-secret-for-player-auth';
  process.env.PLAYER_ACCOUNTS = 'on';
  process.env.MAIL_PROVIDER = 'console';
  process.env.APP_URL = 'https://scoring.example.test/';
  process.env.AUTH_MIN_RESPONSE_MS = '0';
  db = createFakePlayerDb();
  mail.sendMail.outbox.length = 0;
  console._log = console._log || console.log;
  console.log = () => {};   // console mail logs every message
});
afterEach(() => {
  console.log = console._log;
  ENV_KEYS.forEach((k) => { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; });
});

const call = (action, body, cookie, method) => callHandler(accountRouter, {
  method: method || (action === 'me' ? 'GET' : 'POST'), url: '/api/account/' + action, body,
  cookies: cookie ? { [COOKIE]: cookie } : {},
});
const cookieOf = (r) => {
  const set = r.headers['set-cookie'];
  const m = typeof set === 'string' && set.match(new RegExp('^' + COOKIE + '=([^;]*)'));
  return m ? m[1] : null;
};
const lastMailTo = (to) => mail.sendMail.outbox.filter((m) => m.to === to).pop();
const tokenIn = (msg, kind) => (msg.text.match(new RegExp('#' + kind + '=([0-9a-f]+)')) || [])[1];
const byEmail = (email) => db.rows.player_accounts.find((a) => a.email === email);
const reg = (over) => Object.assign({ email: 'mei@example.com', password: 'longenough1', firstName: 'Mei Ling', lastName: 'Soo' }, over);

async function confirmedPlayer(over) {
  const row = Object.assign({
    email: 'ana@example.com', password_hash: bcrypt.hashSync('anapass123', 4), first_name: 'Ana', last_name: 'Lee',
    email_verified_at: new Date(Date.now() - DAY),
  }, over);
  db.rows.player_accounts.push(Object.assign({ id: require('crypto').randomUUID(), must_change_password: false, token_version: 0, name_changed_at: null, created_at: new Date() }, row));
  return byEmail(row.email);
}

test('register then verify then login sets __Host-dd-player', async () => {
  const r1 = await call('register', reg({ email: 'Mei@Example.com' }));
  assert.equal(r1.statusCode, 200);
  assert.equal(r1.body.ok, true);
  const row = byEmail('mei@example.com');
  assert.ok(row, 'stored lower-cased');
  assert.equal(row.email_verified_at, null);
  assert.notEqual(row.password_hash, 'longenough1');

  const msg = lastMailTo('mei@example.com');
  assert.ok(msg, 'a confirm mail was sent');
  assert.ok(!/Mei Ling/.test(msg.text), 'the confirm mail carries no typed name');
  const token = tokenIn(msg, 'verify');
  assert.ok(token);

  const v = await call('verify', { token, password: 'longenough1' });
  assert.equal(v.statusCode, 200);
  assert.equal(v.body.player.email, 'mei@example.com');
  assert.ok(cookieOf(v), 'verify signs in');
  assert.ok(byEmail('mei@example.com').email_verified_at);

  const l = await call('login', { email: 'MEI@example.com', password: 'longenough1' });
  assert.equal(l.statusCode, 200);
  assert.match(l.headers['set-cookie'], /^__Host-dd-player=[^;]+;.*HttpOnly.*Secure/i);
  assert.deepEqual(Object.keys(l.body.player).sort(), ['createdAt', 'email', 'firstName', 'id', 'lastName', 'mustChange', 'nameChangedAt']);
  const me = await call('me', undefined, cookieOf(l));
  assert.equal(me.statusCode, 200);
  assert.equal(me.body.player.firstName, 'Mei Ling');
});

test('verify needs the account password: a wrong one neither confirms nor spends the link', async () => {
  await call('register', reg());
  const token = tokenIn(lastMailTo('mei@example.com'), 'verify');
  const bad = await call('verify', { token, password: 'wrong-password' });
  assert.equal(bad.statusCode, 400);
  assert.equal(bad.body.code, 'invalid_link_or_password');
  assert.equal(byEmail('mei@example.com').email_verified_at, null);
  const noPw = await call('verify', { token });
  assert.equal(noPw.body.code, 'invalid_link_or_password');
  const good = await call('verify', { token, password: 'longenough1' });
  assert.equal(good.statusCode, 200);
  const again = await call('verify', { token, password: 'longenough1' });
  assert.equal(again.statusCode, 400, 'a link works once');
});

test('login before confirming → 403 unverified only with the right password', async () => {
  await call('register', reg());
  const wrong = await call('login', { email: 'mei@example.com', password: 'not-the-password' });
  assert.equal(wrong.statusCode, 401);
  assert.equal(wrong.body.code, 'bad_credentials');
  const right = await call('login', { email: 'mei@example.com', password: 'longenough1' });
  assert.equal(right.statusCode, 403);
  assert.equal(right.body.code, 'unverified');
  assert.equal(cookieOf(right), null);
});

test('unconfirmed email is replaceable and receives nothing', async () => {
  // A stranger signs up first with someone else's address.
  await call('register', reg({ password: 'strangers-pass', firstName: 'Stranger', lastName: 'Danger' }));
  const firstToken = tokenIn(lastMailTo('mei@example.com'), 'verify');
  // The real owner signs up with the same address: their names and password replace the stranger's.
  await call('register', reg());
  const row = byEmail('mei@example.com');
  assert.equal(db.rows.player_accounts.filter((a) => a.email === 'mei@example.com').length, 1);
  assert.equal(row.first_name, 'Mei Ling');
  assert.equal(row.last_name, 'Soo');
  assert.ok(await bcrypt.compare('longenough1', row.password_hash));
  // The stranger's link is dead, and their password no longer confirms the newest one either.
  assert.equal((await call('verify', { token: firstToken, password: 'strangers-pass' })).statusCode, 400);
  const newToken = tokenIn(lastMailTo('mei@example.com'), 'verify');
  assert.equal((await call('verify', { token: newToken, password: 'strangers-pass' })).statusCode, 400);
  assert.equal(byEmail('mei@example.com').email_verified_at, null);
  // Nothing but confirm mails ever went to the address.
  assert.ok(mail.sendMail.outbox.every((m) => m.to !== 'mei@example.com' || /#verify=/.test(m.text)));
  assert.equal(db.rows.player_notices.length, 0);
});

test('register on a confirmed email changes nothing and sends nothing', async () => {
  const ana = await confirmedPlayer();
  const before = Object.assign({}, ana);
  const r = await call('register', reg({ email: 'ana@example.com', firstName: 'Evil', lastName: 'Twin' }));
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.body, (await call('register', reg({ email: 'nobody-yet@example.com' }))).body, 'the same answer either way');
  assert.equal(byEmail('ana@example.com').first_name, before.first_name);
  assert.equal(byEmail('ana@example.com').password_hash, before.password_hash);
  assert.equal(lastMailTo('ana@example.com'), undefined);
});

test('reset bumps token_version and old cookie stops working', async () => {
  const tvBefore = (await confirmedPlayer()).token_version;
  const l = await call('login', { email: 'ana@example.com', password: 'anapass123' });
  const oldCookie = cookieOf(l);
  assert.equal((await call('me', undefined, oldCookie)).statusCode, 200);

  const f = await call('forgot', { email: 'ana@example.com' });
  assert.equal(f.statusCode, 200);
  const token = tokenIn(lastMailTo('ana@example.com'), 'reset');
  assert.ok(token);
  const r = await call('reset', { token, password: 'brand-new-pass' });
  assert.equal(r.statusCode, 200);
  assert.equal(byEmail('ana@example.com').token_version, tvBefore + 1);

  const me = await call('me', undefined, oldCookie);
  assert.equal(me.statusCode, 401);
  assert.equal(me.body.code, 'not_authenticated');
  assert.equal((await call('login', { email: 'ana@example.com', password: 'anapass123' })).statusCode, 401);
  assert.equal((await call('login', { email: 'ana@example.com', password: 'brand-new-pass' })).statusCode, 200);
  assert.equal((await call('reset', { token, password: 'another-pass-1' })).statusCode, 400, 'a reset link works once');
});

test('forgot and resend give the same answer for unknown emails and send nothing', async () => {
  const f = await call('forgot', { email: 'ghost@example.com' });
  assert.equal(f.statusCode, 200);
  const r = await call('resend', { email: 'ghost@example.com' });
  assert.equal(r.statusCode, 200);
  assert.equal(mail.sendMail.outbox.length, 0);
});

test('must_change_password: me works, other endpoints 403 until change-password', async () => {
  await confirmedPlayer({ email: 'temp@example.com', password_hash: bcrypt.hashSync('TEMPPASS23', 4), must_change_password: true });
  const l = await call('login', { email: 'temp@example.com', password: 'TEMPPASS23' });
  assert.equal(l.statusCode, 200);
  assert.equal(l.body.player.mustChange, true);
  const c = cookieOf(l);

  const me = await call('me', undefined, c);
  assert.equal(me.statusCode, 200);
  assert.equal(me.body.player.mustChange, true);
  const prof = await call('profile', { firstName: 'New', lastName: 'Name' }, c);
  assert.equal(prof.statusCode, 403);
  assert.equal(prof.body.code, 'must_change_password');
  const games = await callHandler(gamesRouter, { method: 'GET', url: '/api/games/list', cookies: { [COOKIE]: c } });
  assert.equal(games.statusCode, 403);
  assert.equal(games.body.code, 'must_change_password');

  // The temporary password itself is not accepted as the new one; no current password is needed.
  assert.equal((await call('change-password', { password: 'TEMPPASS23' }, c)).body.code, 'new_password_same');
  const ch = await call('change-password', { password: 'my-own-password' }, c);
  assert.equal(ch.statusCode, 200);
  assert.equal(ch.body.player.mustChange, false);
  const c2 = cookieOf(ch);
  assert.ok(c2, 'a fresh cookie');
  assert.equal((await call('me', undefined, c)).statusCode, 401, 'the old cookie is signed out');
  assert.equal((await call('profile', { firstName: 'New', lastName: 'Name' }, c2)).statusCode, 200);
});

test('change-password needs the current password once the flag is clear', async () => {
  await confirmedPlayer();
  const c = cookieOf(await call('login', { email: 'ana@example.com', password: 'anapass123' }));
  assert.equal((await call('change-password', { password: 'something-new' }, c)).body.code, 'current_password_required');
  assert.equal((await call('change-password', { current: 'wrong-one-x', password: 'something-new' }, c)).body.code, 'current_password_incorrect');
  assert.equal((await call('change-password', { current: 'anapass123', password: 'something-new' }, c)).statusCode, 200);
});

test('profile: second change inside 30 days → 409 with nextAt = first change + 30 days', async () => {
  await confirmedPlayer();
  const c = cookieOf(await call('login', { email: 'ana@example.com', password: 'anapass123' }));
  const first = await call('profile', { firstName: 'Anna', lastName: 'Lee' }, c);
  assert.equal(first.statusCode, 200);
  assert.equal(first.body.player.firstName, 'Anna');
  const changedAt = byEmail('ana@example.com').name_changed_at.getTime();

  const second = await call('profile', { firstName: 'Annie', lastName: 'Lee' }, c);
  assert.equal(second.statusCode, 409);
  assert.equal(second.body.code, 'name_change_too_soon');
  assert.equal(second.body.nextAt, new Date(changedAt + 30 * DAY).toISOString());
  assert.equal(byEmail('ana@example.com').first_name, 'Anna');

  // Saving the same name again is not a change.
  assert.equal((await call('profile', { firstName: 'Anna', lastName: 'Lee' }, c)).statusCode, 200);
  // 30 days later it is allowed again.
  byEmail('ana@example.com').name_changed_at = new Date(Date.now() - 30 * DAY - 1000);
  assert.equal((await call('profile', { firstName: 'Annie', lastName: 'Lee' }, c)).statusCode, 200);
});

// Brief: "organiser email gets hint organiser". Ledger ruling (Task 3): no per-email hint, because it would reveal
// which emails belong to organisers; bad_credentials is always the same and the login screen shows a fixed line.
test('a failed login says the same for every email (no organiser hint)', async () => {
  await confirmedPlayer();
  const unknown = await call('login', { email: 'organiser@example.com', password: 'whatever-1' });
  const wrongPw = await call('login', { email: 'ana@example.com', password: 'whatever-1' });
  assert.equal(unknown.statusCode, 401);
  assert.deepEqual(unknown.body, wrongPw.body);
  assert.deepEqual(unknown.body, { code: 'bad_credentials', error: 'Incorrect email or password.' });
  assert.equal(unknown.body.hint, undefined);
});

test('login is limited to 10 tries per email in 15 minutes', async () => {
  await confirmedPlayer();
  for (let i = 0; i < 10; i++) assert.equal((await call('login', { email: 'ana@example.com', password: 'nope-nope' })).statusCode, 401);
  const r = await call('login', { email: 'ana@example.com', password: 'anapass123' });
  assert.equal(r.statusCode, 429);
  assert.equal(r.body.code, 'rate_limited');
  db.advance(15 * 60 * 1000 + 1);
  assert.equal((await call('login', { email: 'ana@example.com', password: 'anapass123' })).statusCode, 200);
});

test('a forged, foreign or unconfirmed session is not signed in; logout clears the cookie', async () => {
  const ana = await confirmedPlayer();
  const jwt = require('jsonwebtoken');
  const forged = jwt.sign({ sub: ana.id, tv: 0, kind: 'player' }, 'some-other-secret');
  assert.equal((await call('me', undefined, forged)).statusCode, 401);
  const organiserKind = jwt.sign({ sub: ana.id, tv: 0 }, process.env.PLAYER_SESSION_SECRET);
  assert.equal((await call('me', undefined, organiserKind)).statusCode, 401);
  ana.email_verified_at = null;
  assert.equal((await call('me', undefined, session.signPlayer(ana))).statusCode, 401);
  const out = await call('logout', {});
  assert.equal(out.statusCode, 200);
  assert.match(out.headers['set-cookie'], /^__Host-dd-player=;.*Max-Age=0/i);
});

test('register is closed while mail is not set up', async () => {
  process.env.MAIL_PROVIDER = 'resend';
  const r = await call('register', reg());
  assert.equal(r.statusCode, 403);
  assert.equal(r.body.code, 'signup_closed');
  assert.equal(db.rows.player_accounts.length, 0);
});

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const cookie = require('cookie');
const bcrypt = require('bcryptjs');
const { createFakeDb } = require('./lib/fake-db');
const { callHandler } = require('./lib/call-handler');

// POST /api/auth/change-password (api/_routes/auth/change-password.js): a signed-in organiser changes their own
// password. Route api/_lib/db.js to a per-test fake database.
const dbPath = require.resolve('../api/_lib/db');
let db;
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
  sql: (...args) => db.sql(...args),
} };

const auth = require('../api/_lib/auth');
const handler = require('../api/_routes/auth/change-password');
const loginHandler = require('../api/_routes/auth/login');
const authRouter = require('../api/auth/[action]');

const SECRET = 'test-secret-for-change-password';
const COOKIE = '__Host-session';
const ENV_KEYS = ['SESSION_SECRET', 'REQUIRE_LOGIN'];
const OLD = 'old password 1';
const NEW = 'brand new password 2';
const WRONG_MSG = { error: 'The current password is incorrect.' };
let savedEnv;
let HASH;

const row = (over) => Object.assign({
  id: 'org1', email: 'a@example.com', name: 'Alice', password_hash: HASH,
  role: 'organizer', tier: 'basic', suspended: false,
  email_verified_at: new Date('2026-01-01T00:00:00Z'), token_version: 0,
}, over);

beforeEach(() => {
  HASH = HASH || bcrypt.hashSync(OLD, 4);
  savedEnv = {}; ENV_KEYS.forEach((k) => { savedEnv[k] = process.env[k]; delete process.env[k]; });
  process.env.SESSION_SECRET = SECRET;
  process.env.REQUIRE_LOGIN = 'true';
  db = createFakeDb({ organizers: [row()] });
  auth._resetPublicOrganizerCache();
});
afterEach(() => {
  ENV_KEYS.forEach((k) => { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; });
});

const sessionCookie = (o, tv) => ({ [COOKIE]: jwt.sign({ sub: o.id, email: o.email, name: o.name, tv: tv === undefined ? o.token_version : tv }, SECRET, { expiresIn: 600 }) });
const stored = (id) => db.tables.organizers.find((o) => o.id === (id || 'org1'));
const throttleRow = (key) => db.tables.auth_throttle.find((r) => r.key === key);
const change = (body, opts) => callHandler(handler, Object.assign({ method: 'POST', body }, opts && opts.cookies ? {} : { cookies: sessionCookie(stored()) }, opts));
const good = (over) => Object.assign({ currentPassword: OLD, newPassword: NEW }, over);
const tokenFrom = (r) => cookie.parse(String(r.headers['set-cookie']))[COOKIE];
const requireAs = async (cookies) => {
  const out = await callHandler(async (req, res) => { const o = await auth.requireAuth(req, res); if (o) res.status(200).json({ id: o.id }); }, { cookies });
  return out.statusCode;
};
const login = (email, password) => callHandler(loginHandler, { method: 'POST', body: { email, password } });
const noPasswordsIn = (r, ...secrets) => {
  const text = JSON.stringify(r.body) + JSON.stringify(r.headers);
  for (const s of secrets) assert.ok(!text.includes(s), 'response leaked a password');
  assert.ok(!/\$2[aby]\$/.test(text), 'response leaked a hash');
};

test('success: ok, new password works, old does not, the hash is a fresh bcrypt hash and token_version moved by one', async () => {
  const r = await change(good());
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.body, { ok: true });
  assert.notEqual(stored().password_hash, HASH);
  assert.ok(/^\$2[aby]\$10\$/.test(stored().password_hash), 'bcrypt at the shared cost');
  assert.equal(stored().token_version, 1);
  noPasswordsIn(r, OLD, NEW);
  assert.equal((await login('a@example.com', NEW)).statusCode, 200);
  assert.equal((await login('a@example.com', OLD)).statusCode, 401);
});

test('success: the response carries a fresh session cookie with the new token_version and the same identity', async () => {
  const r = await change(good());
  const header = String(r.headers['set-cookie']);
  assert.match(header, /^__Host-session=/);
  assert.match(header, /HttpOnly/i);
  assert.match(header, /Secure/i);
  assert.match(header, /SameSite=Lax/i);
  assert.match(header, /Path=\//);
  const p = jwt.verify(tokenFrom(r), SECRET);
  assert.equal(p.sub, 'org1');
  assert.equal(p.email, 'a@example.com');
  assert.equal(p.name, 'Alice');
  assert.equal(p.tv, 1);
});

test('success: the old session is rejected afterwards, the refreshed cookie is accepted', async () => {
  const oldCookies = sessionCookie(stored());           // a second device, signed with tv 0
  assert.equal(await requireAs(oldCookies), 200);
  const r = await change(good(), { cookies: sessionCookie(stored()) });
  assert.equal(r.statusCode, 200);
  assert.equal(await requireAs(oldCookies), 401);
  assert.equal(await requireAs({ [COOKIE]: tokenFrom(r) }), 200);
});

test('success: a second change using the refreshed cookie works, and the first cookie is then stale', async () => {
  const first = await change(good());
  const cookies = { [COOKIE]: tokenFrom(first) };
  const second = await change({ currentPassword: NEW, newPassword: 'yet another one 3' }, { cookies });
  assert.equal(second.statusCode, 200);
  assert.equal(stored().token_version, 2);
  assert.equal(await requireAs(cookies), 401);
  assert.equal(await requireAs({ [COOKIE]: tokenFrom(second) }), 200);
});

test('success: only the changing account is touched', async () => {
  db.tables.organizers.push(row({ id: 'org2', email: 'b@example.com', name: 'Bob' }));
  const r = await change(good());
  assert.equal(r.statusCode, 200);
  assert.equal(stored('org2').password_hash, HASH);
  assert.equal(stored('org2').token_version, 0);
  assert.equal(await requireAs(sessionCookie(stored('org2'))), 200);
});

test('an admin can change their own password too', async () => {
  db = createFakeDb({ organizers: [row({ id: 'adm1', email: 'boss@example.com', name: 'Boss', role: 'admin', tier: 'pro' })] });
  const r = await change(good(), { cookies: sessionCookie(stored('adm1')) });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.body, { ok: true });
  assert.equal(jwt.verify(tokenFrom(r), SECRET).tv, 1);
});

test('wrong current password: 400, nothing changes, no cookie, and it counts toward the limit', async () => {
  const r = await change(good({ currentPassword: 'not the password' }));
  assert.equal(r.statusCode, 400);
  assert.deepEqual(r.body, WRONG_MSG);
  assert.equal(r.headers['set-cookie'], undefined);
  assert.equal(stored().password_hash, HASH);
  assert.equal(stored().token_version, 0);
  assert.equal(throttleRow('chpw:org:org1').count, 1);
  noPasswordsIn(r, 'not the password', NEW);
});

test('new password too short: 400 with the message, nothing changes', async () => {
  for (const pw of ['', 'short', '1234567']) {
    const r = await change(good({ newPassword: pw }));
    assert.equal(r.statusCode, 400, JSON.stringify(pw));
    assert.deepEqual(r.body, { error: 'The new password must be at least 8 characters.' });
  }
  assert.equal((await change(good({ newPassword: '12345678' }))).statusCode, 200);   // exactly 8 is fine
  assert.equal(stored().token_version, 1);
});

test('new password too long: 400 above 200 characters, exactly 200 is accepted', async () => {
  const tooLong = await change(good({ newPassword: 'x'.repeat(201) }));
  assert.equal(tooLong.statusCode, 400);
  assert.deepEqual(tooLong.body, { error: 'The new password must be at most 200 characters.' });
  assert.equal(stored().token_version, 0);
  assert.equal((await change(good({ newPassword: 'y'.repeat(200) }))).statusCode, 200);
});

test('new password the same as the current one: 400, nothing changes', async () => {
  const r = await change(good({ newPassword: OLD }));
  assert.equal(r.statusCode, 400);
  assert.deepEqual(r.body, { error: 'Choose a new password that is different from the current one.' });
  assert.equal(stored().password_hash, HASH);
  assert.equal(stored().token_version, 0);
});

test('non-string or missing fields: 400, nothing changes', async () => {
  const bad = [
    undefined, null, 'text', [], {},
    { currentPassword: OLD }, { newPassword: NEW }, { currentPassword: '', newPassword: NEW },
    { currentPassword: 123, newPassword: NEW }, { currentPassword: OLD, newPassword: 12345678 },
    { currentPassword: ['a'], newPassword: NEW }, { currentPassword: OLD, newPassword: { a: 1 } },
    { currentPassword: null, newPassword: null }, { currentPassword: true, newPassword: true },
  ];
  for (const body of bad) {
    db.tables.auth_throttle = [];   // 14 bodies: keep them under the attempt limit
    const r = await change(body);
    assert.equal(r.statusCode, 400, JSON.stringify(body));
    assert.equal(typeof r.body.error, 'string');
  }
  assert.equal(stored().password_hash, HASH);
  assert.equal(stored().token_version, 0);
});

test('unauthenticated: 401, nothing changes', async () => {
  const none = await callHandler(handler, { method: 'POST', body: good() });
  assert.equal(none.statusCode, 401);
  assert.deepEqual(none.body, { error: 'Not authenticated' });
  const forged = await callHandler(handler, { method: 'POST', body: good(), cookies: { [COOKIE]: jwt.sign({ sub: 'org1', tv: 0 }, 'some other secret') } });
  assert.equal(forged.statusCode, 401);
  const stale = await callHandler(handler, { method: 'POST', body: good(), cookies: sessionCookie(stored(), 7) });
  assert.equal(stale.statusCode, 401);
  assert.equal(stored().password_hash, HASH);
  assert.equal(db.tables.auth_throttle.length, 0);   // an unauthenticated caller does not touch the counters
});

test('suspended or unverified accounts cannot change a password (401 like every protected call)', async () => {
  stored().suspended = true;
  assert.equal((await change(good())).statusCode, 401);
  stored().suspended = false; stored().email_verified_at = null;
  assert.equal((await change(good())).statusCode, 401);
  assert.equal(stored().password_hash, HASH);
});

test('only POST is accepted', async () => {
  for (const method of ['GET', 'PUT', 'DELETE']) {
    const r = await callHandler(handler, { method, body: good(), cookies: sessionCookie(stored()) });
    assert.equal(r.statusCode, 405, method);
  }
  assert.equal(stored().token_version, 0);
});

test('Public fallback (REQUIRE_LOGIN not true): 403, nothing is written', async () => {
  for (const value of [undefined, 'false', '']) {
    if (value === undefined) delete process.env.REQUIRE_LOGIN; else process.env.REQUIRE_LOGIN = value;
    auth._resetPublicOrganizerCache();
    const r = await callHandler(handler, { method: 'POST', body: good() });
    assert.equal(r.statusCode, 403, String(value));
    assert.deepEqual(r.body, { error: 'Changing the password is not available for this account.' });
    assert.equal(r.headers['set-cookie'], undefined);
  }
  const pub = db.tables.organizers.find((o) => o.email === 'public@dartdraw.local');
  assert.equal(pub.password_hash, 'disabled');
  assert.equal(pub.token_version, 0);
});

test('an account whose stored password is "disabled": 403, nothing is written', async () => {
  stored().password_hash = 'disabled';
  const r = await change(good());
  assert.equal(r.statusCode, 403);
  assert.deepEqual(r.body, { error: 'Changing the password is not available for this account.' });
  assert.equal(r.headers['set-cookie'], undefined);
  assert.equal(stored().password_hash, 'disabled');
  assert.equal(stored().token_version, 0);
});

test('throttle: five wrong attempts are answered 400, the sixth is 429 even with the right password', async () => {
  for (let i = 0; i < 5; i++) {
    const r = await change(good({ currentPassword: 'wrong guess ' + i }));
    assert.equal(r.statusCode, 400, 'attempt ' + (i + 1));
    assert.deepEqual(r.body, WRONG_MSG);
  }
  assert.equal(throttleRow('chpw:org:org1').count, 5);
  const blocked = await change(good());
  assert.equal(blocked.statusCode, 429);
  assert.deepEqual(blocked.body, { error: 'Too many attempts. Try again later.' });
  assert.equal(blocked.headers['set-cookie'], undefined);
  assert.equal(stored().password_hash, HASH);
  assert.equal(stored().token_version, 0);
  // after the window the right password works again
  db.advance(15 * 60 * 1000 + 1);
  assert.equal((await change(good())).statusCode, 200);
});

test('throttle: validation failures count too, and the check happens before anything else is looked at', async () => {
  for (let i = 0; i < 5; i++) await change(good({ newPassword: 'short' }));
  const blocked = await change(good({ newPassword: 'short' }));   // would be a 400 if it got that far
  assert.equal(blocked.statusCode, 429);
});

test('throttle: per client address, 20 per window across different accounts', async () => {
  for (let i = 1; i <= 20; i++) {
    db.tables.organizers.push(row({ id: 'u' + i, email: 'u' + i + '@example.com' }));
    const r = await change(good({ currentPassword: 'nope nope nope' }), { cookies: sessionCookie(stored('u' + i)), ip: '9.9.9.9' });
    assert.equal(r.statusCode, 400, 'attempt ' + i);
  }
  assert.equal(throttleRow('chpw:ip:9.9.9.9').count, 20);
  db.tables.organizers.push(row({ id: 'u21', email: 'u21@example.com' }));
  const blocked = await change(good(), { cookies: sessionCookie(stored('u21')), ip: '9.9.9.9' });
  assert.equal(blocked.statusCode, 429);
  // another address is unaffected
  const other = await change(good(), { cookies: sessionCookie(stored('u21')), ip: '8.8.8.8' });
  assert.equal(other.statusCode, 200);
});

test('throttle: the address comes from X-Forwarded-For when present', async () => {
  await change(good({ currentPassword: 'nope nope nope' }), { headers: { 'X-Forwarded-For': '5.6.7.8, 10.0.0.1' } });
  assert.equal(throttleRow('chpw:ip:5.6.7.8').count, 1);
  assert.ok(throttleRow('chpw:org:org1'));
});

test('throttle: a success clears the account key (the address key stays)', async () => {
  await change(good({ currentPassword: 'wrong guess' }));
  await change(good({ currentPassword: 'wrong guess' }));
  assert.equal(throttleRow('chpw:org:org1').count, 2);
  const r = await change(good());
  assert.equal(r.statusCode, 200);
  assert.equal(throttleRow('chpw:org:org1'), undefined);
  assert.ok(throttleRow('chpw:ip:127.0.0.1'));
});

test('passwords and hashes never appear in any response', async () => {
  const secrets = [OLD, NEW, 'wrong guess here'];
  const replies = [
    await change(good({ currentPassword: 'wrong guess here' })),
    await change(good({ newPassword: 'short' })),
    await change(good({ newPassword: OLD })),
    await change(good()),
    await callHandler(handler, { method: 'POST', body: good() }),
  ];
  for (const r of replies) noPasswordsIn(r, ...secrets);
  assert.ok(!JSON.stringify(replies[3].body).includes(stored().password_hash));
});

test('two overlapping changes against the old password: only one wins, the other is told to retry', async () => {
  // Both requests pass the bcrypt check against the old hash; the UPDATE is guarded by that hash, so only one lands.
  const a = change(good({ newPassword: 'first new password' }));
  const b = change(good({ newPassword: 'second new password' }));
  const [ra, rb] = await Promise.all([a, b]);
  const codes = [ra.statusCode, rb.statusCode].sort();
  assert.deepEqual(codes, [200, 409]);
  assert.equal(stored().token_version, 1);
  const loser = ra.statusCode === 409 ? ra : rb;
  assert.equal(loser.headers['set-cookie'], undefined);
});

test('the router reaches the real handler at /api/auth/change-password', async () => {
  const r = await callHandler(authRouter, { method: 'POST', url: '/api/auth/change-password', body: good(), cookies: sessionCookie(stored()) });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.body, { ok: true });
  assert.equal(stored().token_version, 1);
  const unauth = await callHandler(authRouter, { method: 'POST', url: '/api/auth/change-password?x=1', body: good() });
  assert.equal(unauth.statusCode, 401);
});

test('no new deployable function: the handler lives under api/_routes and only the routers are deployed', () => {
  const deployed = [];
  (function walk(dir, rel) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('_')) continue;
      const p = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) walk(path.join(dir, e.name), p); else if (e.name.endsWith('.js')) deployed.push(p);
    }
  })(path.join(__dirname, '..', 'api'), '');
  assert.ok(deployed.length <= 8, deployed.join(', '));
  assert.ok(!deployed.some((p) => /change-password/.test(p)), 'change-password must not be its own function');
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'api', '_routes', 'auth', 'change-password.js')));
});

test('the fake db still fails loudly on unknown SQL', async () => {
  await assert.rejects(() => db.sql`UPDATE organizers SET password_hash = ${'x'} WHERE id = ${'org1'}`, /unrecognised SQL/);
});

test('throttle: a success gives the address its count back, a failure does not', async () => {
  await change(good({ currentPassword: 'wrong guess' }));
  assert.equal(throttleRow('chpw:ip:127.0.0.1').count, 1);
  const ok = await change(good());
  assert.equal(ok.statusCode, 200);
  assert.equal(throttleRow('chpw:ip:127.0.0.1').count, 1, 'the successful change was counted and given back');
  // validation failures and wrong passwords keep counting
  await change(good({ newPassword: 'x' }));
  assert.equal(throttleRow('chpw:ip:127.0.0.1').count, 2);
});

test('throttle: successful changes by many accounts behind one address never trip the address limit', async () => {
  for (let i = 0; i < 30; i++) {
    db.tables.organizers.push(row({ id: 'c' + i, email: 'c' + i + '@example.com' }));
    const r = await change(good(), { cookies: sessionCookie(stored('c' + i)), ip: '7.7.7.7' });
    assert.equal(r.statusCode, 200, 'account ' + i);
  }
  assert.equal(throttleRow('chpw:ip:7.7.7.7').count, 0);
});

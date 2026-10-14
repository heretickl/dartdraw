const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const cookie = require('cookie');
const bcrypt = require('bcryptjs');
const { createFakeDb } = require('./lib/fake-db');
const { callHandler } = require('./lib/call-handler');

// Route api/_lib/db.js to a per-test fake database.
const dbPath = require.resolve('../api/_lib/db');
let db;
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
  sql: (...args) => db.sql(...args),
} };

const auth = require('../api/_lib/auth');
const loginHandler = require('../api/auth/login');
const meHandler = require('../api/auth/me');
const configHandler = require('../api/auth/config');

const SECRET = 'test-secret-for-auth-core';
const COOKIE = '__Host-session';
const ENV_KEYS = ['SESSION_SECRET', 'REQUIRE_LOGIN', 'SIGNUP_OPEN', 'MAIL_PROVIDER', 'RESEND_API_KEY', 'MAIL_FROM', 'APP_URL', 'VIEWER_URL'];
let savedEnv;

const PASSWORD = 'correct horse battery';
let HASH;

function row(over) {
  return Object.assign({
    id: 'org1', email: 'a@example.com', name: 'Alice', password_hash: HASH,
    role: 'organizer', tier: 'basic', suspended: false,
    email_verified_at: new Date('2026-01-01T00:00:00Z'), token_version: 0,
  }, over);
}

beforeEach(() => {
  HASH = HASH || bcrypt.hashSync(PASSWORD, 4);
  savedEnv = {}; ENV_KEYS.forEach((k) => { savedEnv[k] = process.env[k]; delete process.env[k]; });
  process.env.SESSION_SECRET = SECRET;
  process.env.REQUIRE_LOGIN = 'true';
  db = createFakeDb({ organizers: [row()] });
  auth._resetPublicOrganizerCache();
});
afterEach(() => {
  ENV_KEYS.forEach((k) => { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; });
});

const login = (body, opts) => callHandler(loginHandler, Object.assign({ method: 'POST', body }, opts));
const sessionCookie = (organizer, extra) => ({ [COOKIE]: jwt.sign(Object.assign({ sub: organizer.id, email: organizer.email, name: organizer.name, tv: organizer.token_version }, extra || {}), SECRET, { expiresIn: 600 }) });
const throttleRow = (key) => db.tables.auth_throttle.find((r) => r.key === key);

// ---- signSession ----

test('signSession payload carries sub, email, name and tv', () => {
  const token = auth.signSession(row({ token_version: 3 }));
  const p = jwt.verify(token, SECRET);
  assert.equal(p.sub, 'org1');
  assert.equal(p.email, 'a@example.com');
  assert.equal(p.name, 'Alice');
  assert.equal(p.tv, 3);
});

// ---- login ----

test('login success: cookie set, body shape, email throttle key cleared, ip key kept', async () => {
  await login({ email: 'a@example.com', password: 'wrong' });   // one failure recorded
  assert.ok(throttleRow('login:email:a@example.com'));
  const r = await login({ email: '  A@Example.com ', password: PASSWORD });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.body, { id: 'org1', email: 'a@example.com', name: 'Alice', role: 'organizer', tier: 'basic' });
  const setCookie = r.headers['set-cookie'];
  const parsed = cookie.parse(setCookie);
  const payload = jwt.verify(parsed[COOKIE], SECRET);
  assert.equal(payload.sub, 'org1');
  assert.equal(payload.tv, 0);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /Secure/);
  assert.equal(throttleRow('login:email:a@example.com'), undefined);
  assert.ok(throttleRow('login:ip:127.0.0.1'), 'the address counter is not cleared by a success');
  assert.equal(JSON.stringify(r.body).includes('password'), false);
});

test('login: wrong password and unknown email give byte-identical 401s and both record a failure', async () => {
  const a = await login({ email: 'a@example.com', password: 'nope-nope' });
  const b = await login({ email: 'nobody@example.com', password: 'nope-nope' });
  assert.equal(a.statusCode, 401);
  assert.equal(b.statusCode, 401);
  assert.equal(JSON.stringify(a.body), JSON.stringify(b.body));
  assert.deepEqual(a.body, { error: 'Incorrect email or password.' });
  assert.equal(a.headers['set-cookie'], undefined);
  assert.equal(b.headers['set-cookie'], undefined);
  assert.equal(throttleRow('login:email:a@example.com').count, 1);
  assert.equal(throttleRow('login:email:nobody@example.com').count, 1);
  assert.equal(throttleRow('login:ip:127.0.0.1').count, 2);
});

test('login: unverified and suspended are revealed only after the correct password', async () => {
  db.tables.organizers.push(row({ id: 'u1', email: 'u@example.com', email_verified_at: null }));
  db.tables.organizers.push(row({ id: 's1', email: 's@example.com', suspended: true }));
  const wrongU = await login({ email: 'u@example.com', password: 'wrong-password' });
  const wrongS = await login({ email: 's@example.com', password: 'wrong-password' });
  assert.equal(wrongU.statusCode, 401);
  assert.equal(wrongS.statusCode, 401);
  assert.deepEqual(wrongU.body, { error: 'Incorrect email or password.' });

  const u = await login({ email: 'u@example.com', password: PASSWORD });
  assert.equal(u.statusCode, 403);
  assert.deepEqual(u.body, { code: 'unverified', error: 'Please verify your email first.' });
  assert.equal(u.headers['set-cookie'], undefined);

  const s = await login({ email: 's@example.com', password: PASSWORD });
  assert.equal(s.statusCode, 403);
  assert.deepEqual(s.body, { code: 'suspended', error: 'This account has been suspended.' });
  assert.equal(s.headers['set-cookie'], undefined);
});

test('login: every attempt is counted when it starts, including one refused as unverified/suspended; only a success clears the email key', async () => {
  db.tables.organizers.push(row({ id: 'u1', email: 'u@example.com', email_verified_at: null }));
  await login({ email: 'u@example.com', password: PASSWORD });
  assert.equal(throttleRow('login:email:u@example.com').count, 1);
  assert.equal(throttleRow('login:ip:127.0.0.1').count, 1);
  await login({ email: 'u@example.com', password: PASSWORD });
  assert.equal(throttleRow('login:email:u@example.com').count, 2);
});

test('login: 429 after 10 failures for an email, success does not record, and the lock holds even for the right password', async () => {
  for (let i = 0; i < 10; i++) {
    const r = await login({ email: 'a@example.com', password: 'wrong-' + i });
    assert.equal(r.statusCode, 401, 'attempt ' + (i + 1));
  }
  assert.equal(throttleRow('login:email:a@example.com').count, 10);
  const blocked = await login({ email: 'a@example.com', password: PASSWORD });
  assert.equal(blocked.statusCode, 429);
  assert.deepEqual(blocked.body, { error: 'Too many attempts. Try again later.' });
  assert.equal(blocked.headers['set-cookie'], undefined);
  // the counter moves first (atomically), so the refused request is counted too
  assert.equal(throttleRow('login:email:a@example.com').count, 11);
  // an unknown email is throttled the same way (no enumeration through the limit)
  for (let i = 0; i < 10; i++) await login({ email: 'ghost@example.com', password: 'x' + i + 'xxxxxxx' });
  const ghost = await login({ email: 'ghost@example.com', password: 'x' });
  assert.equal(ghost.statusCode, 429);
  // after the window passes the account works again
  db.advance(15 * 60 * 1000 + 1);
  const again = await login({ email: 'a@example.com', password: PASSWORD });
  assert.equal(again.statusCode, 200);
});

test('login: 429 after 40 failures from one address across different emails', async () => {
  for (let i = 0; i < 40; i++) {
    const r = await login({ email: 'e' + i + '@example.com', password: 'wrong-password' });
    assert.equal(r.statusCode, 401, 'attempt ' + (i + 1));
  }
  const r = await login({ email: 'a@example.com', password: PASSWORD });
  assert.equal(r.statusCode, 429);
  // another address is unaffected
  const other = await login({ email: 'a@example.com', password: PASSWORD }, { headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' } });
  assert.equal(other.statusCode, 200);
  assert.equal(throttleRow('login:ip:203.0.113.9').count, 1, 'a success is counted against the address and not cleared');
});

test('login: 30 concurrent attempts against one email - at most 10 reach the password check, the rest are 429', async () => {
  const realCompare = bcrypt.compare;
  let compares = 0;
  bcrypt.compare = (...a) => { compares++; return realCompare.apply(bcrypt, a); };
  let results;
  try {
    results = await Promise.all(Array.from({ length: 30 }, (_, i) => login({ email: 'a@example.com', password: 'wrong-' + i + '-pass' })));
  } finally { bcrypt.compare = realCompare; }
  assert.equal(compares, 10, 'bcrypt.compare calls');
  assert.equal(results.filter((r) => r.statusCode === 401).length, 10);
  assert.equal(results.filter((r) => r.statusCode === 429).length, 20);
  assert.equal(results.some((r) => r.headers['set-cookie']), false);
  // even the right password is refused once the lock has tripped
  const right = await login({ email: 'a@example.com', password: PASSWORD });
  assert.equal(right.statusCode, 429);
});

test('login: 60 concurrent attempts from one address across many emails - at most 40 are evaluated', async () => {
  const realCompare = bcrypt.compare;
  let compares = 0;
  bcrypt.compare = (...a) => { compares++; return realCompare.apply(bcrypt, a); };
  let results;
  try {
    results = await Promise.all(Array.from({ length: 60 }, (_, i) => login({ email: 'e' + i + '@example.com', password: 'wrong-password' })));
  } finally { bcrypt.compare = realCompare; }
  assert.equal(compares, 40);
  assert.equal(results.filter((r) => r.statusCode === 429).length, 20);
});

test('login: the Public row (password_hash disabled) can never sign in', async () => {
  db.tables.organizers.push(row({ id: 'pub', email: 'public@dartdraw.local', name: 'Public', password_hash: 'disabled', email_verified_at: new Date() }));
  for (const pw of ['disabled', '', 'password', PASSWORD]) {
    if (!pw) continue;
    const r = await login({ email: 'public@dartdraw.local', password: pw });
    assert.equal(r.statusCode, 401);
    assert.deepEqual(r.body, { error: 'Incorrect email or password.' });
    assert.equal(r.headers['set-cookie'], undefined);
  }
});

test('login: validation, method and server errors', async () => {
  assert.equal((await callHandler(loginHandler, { method: 'GET' })).statusCode, 405);
  const missing = await login({ email: 'a@example.com' });
  assert.equal(missing.statusCode, 400);
  assert.equal((await login({})).statusCode, 400);
  assert.equal((await callHandler(loginHandler, { method: 'POST' })).statusCode, 400);
  // a non-string password must not crash bcrypt
  const odd = await login({ email: 'a@example.com', password: { $ne: 1 } });
  assert.ok([400, 401].includes(odd.statusCode));
  // database failure -> 500 with a generic message
  const realSql = db.sql;
  db.sql = async () => { throw new Error('boom'); };
  const failed = await login({ email: 'a@example.com', password: PASSWORD });
  db.sql = realSql;
  assert.equal(failed.statusCode, 500);
  assert.deepEqual(failed.body, { error: 'Could not sign in.' });
});

// ---- requireAuth ----

async function runRequireAuth(cookies) {
  const holder = {};
  const r = await callHandler(async (req, res) => { holder.result = await auth.requireAuth(req, res); }, { cookies });
  return { result: holder.result, status: r.statusCode, body: r.body };
}

test('requireAuth success returns id, email, name, role, tier and nothing else', async () => {
  db.tables.organizers[0].role = 'admin';
  db.tables.organizers[0].tier = 'pro';
  const r = await runRequireAuth(sessionCookie(db.tables.organizers[0]));
  assert.deepEqual(r.result, { id: 'org1', email: 'a@example.com', name: 'Alice', role: 'admin', tier: 'pro' });
});

test('requireAuth rejects: no cookie, garbage, wrong secret, expired', async () => {
  const expected = { error: 'Not authenticated' };
  let r = await runRequireAuth({});
  assert.equal(r.result, null); assert.equal(r.status, 401); assert.deepEqual(r.body, expected);
  r = await runRequireAuth({ [COOKIE]: 'garbage' });
  assert.equal(r.result, null); assert.equal(r.status, 401);
  r = await runRequireAuth({ [COOKIE]: jwt.sign({ sub: 'org1', tv: 0 }, 'other-secret') });
  assert.equal(r.result, null); assert.equal(r.status, 401);
  r = await runRequireAuth({ [COOKIE]: jwt.sign({ sub: 'org1', tv: 0 }, SECRET, { expiresIn: -10 }) });
  assert.equal(r.result, null); assert.equal(r.status, 401);
});

test('requireAuth rejects a missing row, a suspended account and an unverified account immediately', async () => {
  const good = sessionCookie(db.tables.organizers[0]);
  assert.ok((await runRequireAuth(good)).result);

  db.tables.organizers[0].suspended = true;
  let r = await runRequireAuth(good);
  assert.equal(r.result, null); assert.equal(r.status, 401); assert.deepEqual(r.body, { error: 'Not authenticated' });
  db.tables.organizers[0].suspended = false;
  assert.ok((await runRequireAuth(good)).result);

  db.tables.organizers[0].email_verified_at = null;
  r = await runRequireAuth(good);
  assert.equal(r.result, null); assert.equal(r.status, 401);
  db.tables.organizers[0].email_verified_at = new Date();

  db.tables.organizers.length = 0;
  r = await runRequireAuth(good);
  assert.equal(r.result, null); assert.equal(r.status, 401);
});

test('requireAuth rejects a session whose tv does not match token_version (stale or absent)', async () => {
  const old = sessionCookie(db.tables.organizers[0]);   // tv 0
  assert.ok((await runRequireAuth(old)).result);
  db.tables.organizers[0].token_version = 1;            // password reset / suspension bumped it
  let r = await runRequireAuth(old);
  assert.equal(r.result, null); assert.equal(r.status, 401);
  // a new session at the new version works
  assert.ok((await runRequireAuth(sessionCookie(db.tables.organizers[0]))).result);
  // a token with no tv at all (issued before this change) is refused
  r = await runRequireAuth({ [COOKIE]: jwt.sign({ sub: 'org1', email: 'a@example.com', name: 'Alice' }, SECRET) });
  assert.equal(r.result, null); assert.equal(r.status, 401);
  // a string tv is not accepted as equal
  r = await runRequireAuth({ [COOKIE]: jwt.sign({ sub: 'org1', tv: '1' }, SECRET) });
  assert.equal(r.result, null);
});

test('requireAuth takes role and tier from the database row, not from the token', async () => {
  const forged = { [COOKIE]: jwt.sign({ sub: 'org1', tv: 0, role: 'admin', tier: 'pro' }, SECRET) };
  const r = await runRequireAuth(forged);
  assert.equal(r.result.role, 'organizer');
  assert.equal(r.result.tier, 'basic');
});

test('requireAuth: database failure gives a 500, not a pass', async () => {
  const cookies = sessionCookie(db.tables.organizers[0]);
  db.sql = async () => { throw new Error('boom'); };
  const r = await runRequireAuth(cookies);
  assert.equal(r.result, null);
  assert.equal(r.status, 500);
});

test('requireAuth with REQUIRE_LOGIN unset keeps the shared Public organiser fallback (tier pro, role organizer)', async () => {
  delete process.env.REQUIRE_LOGIN;
  const first = await runRequireAuth({});
  assert.equal(first.status, 200);
  assert.equal(first.result.email, 'public@dartdraw.local');
  assert.equal(first.result.name, 'Public');
  assert.equal(first.result.role, 'organizer');
  assert.equal(first.result.tier, 'pro');
  assert.ok(first.result.id);
  // created once, reused
  const second = await runRequireAuth({ [COOKIE]: 'ignored' });
  assert.equal(second.result.id, first.result.id);
  assert.equal(db.tables.organizers.filter((o) => o.email === 'public@dartdraw.local').length, 1);
  // an existing Public row is found rather than duplicated
  auth._resetPublicOrganizerCache();
  const third = await runRequireAuth({});
  assert.equal(third.result.id, first.result.id);
  assert.equal(third.result.tier, 'pro');
  // REQUIRE_LOGIN other than the exact string 'true' also falls back
  process.env.REQUIRE_LOGIN = 'yes';
  assert.equal((await runRequireAuth({})).result.email, 'public@dartdraw.local');
});

test('getOrganizerFromRequest stays exported and returns the payload with tv', () => {
  assert.equal(typeof auth.getOrganizerFromRequest, 'function');
  const o = auth.getOrganizerFromRequest({ cookies: sessionCookie(row({ token_version: 2 })) });
  assert.deepEqual(o, { id: 'org1', email: 'a@example.com', name: 'Alice', tv: 2 });
  assert.equal(auth.getOrganizerFromRequest({ cookies: {} }), null);
  assert.equal(auth.getOrganizerFromRequest({ cookies: { [COOKIE]: 'bad' } }), null);
  assert.equal(auth.getOrganizerFromRequest({}), null);
});

// ---- me ----

test('me returns role, tier and entryLimit (number for basic, null for pro)', async () => {
  process.env.VIEWER_URL = 'https://viewer.example.com/';
  let r = await callHandler(meHandler, { cookies: sessionCookie(db.tables.organizers[0]) });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.body, {
    id: 'org1', email: 'a@example.com', name: 'Alice', role: 'organizer', tier: 'basic',
    entryLimit: 64, publicMode: false, viewerUrl: 'https://viewer.example.com',
  });
  db.tables.organizers[0].tier = 'pro';
  db.tables.organizers[0].role = 'admin';
  r = await callHandler(meHandler, { cookies: sessionCookie(db.tables.organizers[0]) });
  assert.equal(r.body.tier, 'pro');
  assert.equal(r.body.role, 'admin');
  assert.strictEqual(r.body.entryLimit, null);
  assert.equal('password_hash' in r.body, false);
});

test('me: unauthenticated is 401; public mode reports publicMode and no limit', async () => {
  let r = await callHandler(meHandler, {});
  assert.equal(r.statusCode, 401);
  delete process.env.REQUIRE_LOGIN;
  r = await callHandler(meHandler, {});
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.publicMode, true);
  assert.equal(r.body.tier, 'pro');
  assert.strictEqual(r.body.entryLimit, null);
});

// ---- config ----

test('config: signupOpen only when SIGNUP_OPEN is "true" and mail is configured', async () => {
  const get = () => callHandler(configHandler, { method: 'GET' });
  let r = await get();
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.body, { signupOpen: false });

  process.env.SIGNUP_OPEN = 'true';                       // flag on, mail not configured
  assert.deepEqual((await get()).body, { signupOpen: false });

  process.env.MAIL_PROVIDER = 'console';                   // both
  assert.deepEqual((await get()).body, { signupOpen: true });

  process.env.SIGNUP_OPEN = 'false';                       // mail ok, flag off
  assert.deepEqual((await get()).body, { signupOpen: false });
  process.env.SIGNUP_OPEN = '1';
  assert.deepEqual((await get()).body, { signupOpen: false });

  process.env.SIGNUP_OPEN = 'true';
  process.env.MAIL_PROVIDER = 'resend';                    // resend without key/from
  assert.deepEqual((await get()).body, { signupOpen: false });
  process.env.RESEND_API_KEY = 'k'; process.env.MAIL_FROM = 'DartDraw <no-reply@example.com>';
  assert.deepEqual((await get()).body, { signupOpen: false });   // still no APP_URL
  process.env.APP_URL = 'https://app.example.com';
  assert.deepEqual((await get()).body, { signupOpen: true });
});

test('config needs no login and is GET only', async () => {
  delete process.env.SESSION_SECRET;
  const r = await callHandler(configHandler, { method: 'GET' });
  assert.equal(r.statusCode, 200);
  assert.equal(typeof r.body.signupOpen, 'boolean');
  assert.equal((await callHandler(configHandler, { method: 'POST' })).statusCode, 405);
});

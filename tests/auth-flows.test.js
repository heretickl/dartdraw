const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
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
const mail = require('../api/_lib/mail');
const tokens = require('../api/_lib/tokens');
const registerHandler = require('../api/_routes/auth/register');
const verifyHandler = require('../api/_routes/auth/verify');
const resendHandler = require('../api/_routes/auth/resend-verification');
const forgotHandler = require('../api/_routes/auth/forgot');
const resetHandler = require('../api/_routes/auth/reset');

const SECRET = 'test-secret-for-auth-flows';
const COOKIE = '__Host-session';
const ENV_KEYS = ['SESSION_SECRET', 'REQUIRE_LOGIN', 'SIGNUP_OPEN', 'MAIL_PROVIDER', 'RESEND_API_KEY', 'MAIL_FROM', 'APP_URL', 'AUTH_MIN_RESPONSE_MS'];
let savedEnv;

const REGISTER_MSG = { ok: true, message: 'If that email can be registered, we have sent a link to verify it.' };
const FORGOT_MSG = { ok: true, message: 'If an account exists for that email, we have sent a link to reset your password.' };
const RESEND_MSG = { ok: true, message: 'If that account can be verified, we have sent a new verification link.' };
const VERIFY_FAILED = { error: 'This link is invalid, has expired, or the password is incorrect.' };
const INVALID_LINK = { error: 'This link is invalid or has expired.' };
const HOUR = 60 * 60 * 1000;

let HASH;
const OLD_PASSWORD = 'old-password-1';

function row(over) {
  return Object.assign({
    id: 'org1', email: 'a@example.com', name: 'Alice', password_hash: HASH,
    role: 'organizer', tier: 'basic', suspended: false,
    email_verified_at: new Date('2026-01-01T00:00:00Z'), token_version: 0,
  }, over);
}

beforeEach(() => {
  HASH = HASH || bcrypt.hashSync(OLD_PASSWORD, 4);
  savedEnv = {}; ENV_KEYS.forEach((k) => { savedEnv[k] = process.env[k]; delete process.env[k]; });
  process.env.SESSION_SECRET = SECRET;
  process.env.MAIL_PROVIDER = 'console';
  process.env.SIGNUP_OPEN = 'true';
  process.env.APP_URL = 'https://app.example.test/';
  process.env.AUTH_MIN_RESPONSE_MS = '0';
  db = createFakeDb({ organizers: [row()] });
  auth._resetPublicOrganizerCache();
  mail.sendMail.outbox.length = 0;
  // keep test output quiet: console mail logs every message
  console._log = console._log || console.log;
  console.log = () => {};
});
afterEach(() => {
  console.log = console._log;
  ENV_KEYS.forEach((k) => { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; });
});

const post = (handler, body, opts) => callHandler(handler, Object.assign({ method: 'POST', body }, opts));
const register = (body, opts) => post(registerHandler, body, opts);
const outbox = () => mail.sendMail.outbox;
const linkIn = (msg) => (msg.text.match(/https?:\/\/\S+/) || [])[0];
const tokenIn = (msg) => (linkIn(msg).match(/token=([0-9a-f]+)/) || [])[1];
const byEmail = (email) => db.tables.organizers.find((o) => o.email === email);
const verify = (token, password) => post(verifyHandler, { token, password: password === undefined ? 'longenough' : password });
const goodReg = (over) => Object.assign({ name: 'Bob', email: 'bob@example.com', password: 'longenough' }, over);

// ---- register ----

test('register: method other than POST is 405', async () => {
  const r = await callHandler(registerHandler, { method: 'GET' });
  assert.equal(r.statusCode, 405);
});

test('register is closed (403) when the flag is off, mail is unconfigured, or both', async () => {
  const closed = { error: 'Sign-up is not open yet.' };
  process.env.SIGNUP_OPEN = 'false';
  let r = await register(goodReg());
  assert.equal(r.statusCode, 403);
  assert.deepEqual(r.body, closed);

  process.env.SIGNUP_OPEN = 'true';
  process.env.MAIL_PROVIDER = 'resend';          // no key / from
  r = await register(goodReg());
  assert.equal(r.statusCode, 403);
  assert.deepEqual(r.body, closed);

  process.env.SIGNUP_OPEN = 'false';
  r = await register(goodReg());
  assert.equal(r.statusCode, 403);
  assert.deepEqual(r.body, closed);

  delete process.env.SIGNUP_OPEN;
  r = await register(goodReg());
  assert.equal(r.statusCode, 403);

  assert.equal(byEmail('bob@example.com'), undefined);
  assert.equal(outbox().length, 0);
  assert.equal(db.tables.auth_throttle.length, 0, 'a closed sign-up does no database work');
});

test('register validates name, email and password', async () => {
  const cases = [
    [goodReg({ name: '' }), /name/i],
    [goodReg({ name: '   ' }), /name/i],
    [goodReg({ name: 'x'.repeat(81) }), /name/i],
    [goodReg({ name: 5 }), /required|name/i],
    [goodReg({ email: 'not-an-email' }), /email/i],
    [goodReg({ email: 'a'.repeat(250) + '@example.com' }), /email/i],
    [goodReg({ email: undefined }), /email|required/i],
    [goodReg({ password: 'short' }), /at least 8/],
    [goodReg({ password: undefined }), /password|required/i],
    [goodReg({ password: { $ne: 1 } }), /password|required/i],
  ];
  for (const [body, re] of cases) {
    const r = await register(body);
    assert.equal(r.statusCode, 400, JSON.stringify(body).slice(0, 60));
    assert.match(r.body.error, re);
  }
  const noBody = await callHandler(registerHandler, { method: 'POST' });
  assert.equal(noBody.statusCode, 400);
  assert.equal(db.tables.organizers.length, 1);
  assert.equal(outbox().length, 0);
  assert.equal((await register(goodReg({ name: 'x'.repeat(80) }))).statusCode, 200);
});

test('register: new email creates an unverified Basic organizer and mails a verify link with a hashed token', async () => {
  const r = await register(goodReg({ email: '  Bob@Example.COM ', name: ' Bob ' }));
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.body, REGISTER_MSG);
  const o = byEmail('bob@example.com');
  assert.ok(o, 'row created with a normalised email');
  assert.equal(o.name, 'Bob');
  assert.equal(o.tier, 'basic');
  assert.equal(o.role, 'organizer');
  assert.equal(o.email_verified_at, null);
  assert.notEqual(o.password_hash, 'longenough');
  assert.ok(bcrypt.compareSync('longenough', o.password_hash));

  assert.equal(outbox().length, 1);
  const msg = outbox()[0];
  assert.equal(msg.to, 'bob@example.com');
  assert.equal(msg.subject, 'Verify your DartDraw email');
  assert.match(linkIn(msg), /^https:\/\/app\.example\.test\/verify\.html\?token=[0-9a-f]{64}$/);
  assert.match(msg.text, /ignore/i);

  const raw = tokenIn(msg);
  assert.equal(db.tables.auth_tokens.length, 1);
  const t = db.tables.auth_tokens[0];
  assert.equal(t.kind, 'verify');
  assert.equal(t.organizer_id, o.id);
  assert.equal(t.token_hash, tokens.hashToken(raw));
  assert.notEqual(t.token_hash, raw);
  assert.equal(JSON.stringify(db.tables).includes(raw), false, 'the raw token is not stored anywhere');
  assert.equal(t.expires_at.getTime() - db.now().getTime(), 24 * HOUR);
});

test('register: existing unverified email takes the new name and password, gets a fresh link, the old link dies', async () => {
  await register(goodReg());
  const first = tokenIn(outbox()[0]);
  const hashBefore = byEmail('bob@example.com').password_hash;

  const r = await register(goodReg({ name: ' Other ', password: 'a-different-password' }));
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.body, REGISTER_MSG);
  assert.equal(outbox().length, 2);
  assert.equal(outbox()[1].subject, 'Verify your DartDraw email');
  const o = byEmail('bob@example.com');
  assert.notEqual(o.password_hash, hashBefore);
  assert.ok(bcrypt.compareSync('a-different-password', o.password_hash));
  assert.equal(bcrypt.compareSync('longenough', o.password_hash), false);
  assert.equal(o.name, 'Other');
  assert.equal(o.email_verified_at, null);
  assert.equal(db.tables.organizers.length, 2);

  const second = tokenIn(outbox()[1]);
  assert.notEqual(first, second);
  assert.equal((await verify(first, 'a-different-password')).statusCode, 400, 'the older link is dead');
  assert.equal((await verify(second, 'longenough')).statusCode, 400, 'the old password no longer works');
  assert.equal((await verify(second, 'a-different-password')).statusCode, 200);
});

test('pre-account hijacking: a stranger who pre-registered an email cannot be verified by the owner without their password', async () => {
  // attacker signs up with the victim's address and a password they know
  await register(goodReg({ email: 'victim@example.com', name: 'Mallory', password: 'attacker-secret' }));
  const attackerLink = tokenIn(outbox()[0]);
  // the victim gets that email, opens the link and has no way to guess the attacker's password
  const guess = await verify(attackerLink, 'victim-password');
  assert.equal(guess.statusCode, 400);
  assert.deepEqual(guess.body, VERIFY_FAILED);
  assert.equal(byEmail('victim@example.com').email_verified_at, null);
  // the victim signs up themselves: their submission replaces the attacker's password and name ...
  await register(goodReg({ email: 'victim@example.com', name: 'Victim', password: 'victim-password' }));
  const victimLink = tokenIn(outbox()[1]);
  assert.equal(byEmail('victim@example.com').name, 'Victim');
  // ... the attacker's link is dead and the attacker's password no longer opens anything
  assert.equal((await verify(attackerLink, 'attacker-secret')).statusCode, 400);
  assert.equal((await verify(victimLink, 'attacker-secret')).statusCode, 400);
  assert.equal(byEmail('victim@example.com').email_verified_at, null);
  assert.equal((await verify(victimLink, 'victim-password')).statusCode, 200);
  assert.ok(byEmail('victim@example.com').email_verified_at);
});

test('register: a verified account is never overwritten by a later sign-up', async () => {
  await register(goodReg({ email: 'a@example.com', name: 'Evil', password: 'attacker-secret' }));
  const o = byEmail('a@example.com');
  assert.equal(o.name, 'Alice');
  assert.equal(o.password_hash, HASH);
});

test('register: existing verified email gets an "already have an account" mail and no token, same answer', async () => {
  const r = await register(goodReg({ email: 'a@example.com' }));
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.body, REGISTER_MSG);
  assert.equal(outbox().length, 1);
  const msg = outbox()[0];
  assert.equal(msg.to, 'a@example.com');
  assert.equal(msg.subject, 'Your DartDraw account');
  assert.match(msg.text, /already have an account/i);
  assert.match(msg.text, /forgot password/i);
  assert.match(linkIn(msg), /^https:\/\/app\.example\.test\/forgot\.html$/);
  assert.equal(db.tables.auth_tokens.length, 0);
  assert.equal(db.tables.organizers.length, 1);
  assert.equal(byEmail('a@example.com').password_hash, HASH, 'existing account untouched');
});

test('register: answers are byte-identical for unknown, unverified and verified emails', async () => {
  db.tables.organizers.push(row({ id: 'u1', email: 'u@example.com', email_verified_at: null }));
  const a = await register(goodReg({ email: 'new@example.com' }));
  const b = await register(goodReg({ email: 'u@example.com' }));
  const c = await register(goodReg({ email: 'a@example.com' }));
  for (const x of [b, c]) {
    assert.equal(x.statusCode, a.statusCode);
    assert.equal(JSON.stringify(x.body), JSON.stringify(a.body));
    assert.deepEqual(x.headers, a.headers);
  }
  assert.equal(outbox().length, 3);
});

test('register: suspended and Public rows get no email but the same answer', async () => {
  db.tables.organizers.push(row({ id: 's1', email: 's@example.com', suspended: true }));
  db.tables.organizers.push(row({ id: 'su1', email: 'su@example.com', suspended: true, email_verified_at: null }));
  db.tables.organizers.push(row({ id: 'pub', email: 'public@dartdraw.local', name: 'Public', password_hash: 'disabled', email_verified_at: null }));
  for (const email of ['s@example.com', 'su@example.com', 'public@dartdraw.local']) {
    const r = await register(goodReg({ email }));
    assert.equal(r.statusCode, 200);
    assert.deepEqual(r.body, REGISTER_MSG);
  }
  assert.equal(outbox().length, 0);
  assert.equal(db.tables.auth_tokens.length, 0);
});

test('register: a duplicate-key race on insert still answers the generic message', async () => {
  const realSql = db.sql;
  let injected = false;
  db.sql = async (strings, ...vals) => {
    const text = strings.join('?');
    if (!injected && /^\s*SELECT .* FROM organizers WHERE email/i.test(text.replace(/\s+/g, ' '))) {
      injected = true;
      const empty = await realSql(strings, ...vals);
      // someone else creates the account right after our lookup found nothing
      db.tables.organizers.push(row({ id: 'race', email: 'bob@example.com', email_verified_at: null }));
      return empty;
    }
    return realSql(strings, ...vals);
  };
  const r = await register(goodReg());
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.body, REGISTER_MSG);
  assert.equal(db.tables.organizers.filter((o) => o.email === 'bob@example.com').length, 1);
});

test('register: a failed mail send does not change the answer', async () => {
  process.env.MAIL_PROVIDER = 'console';
  const realPush = outbox().push;
  outbox().push = () => { throw new Error('mail down'); };
  const r = await register(goodReg());
  outbox().push = realPush;
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.body, REGISTER_MSG);
});

test('register: throttled at 5 per hour per address and per email (429), then the window resets', async () => {
  for (let i = 0; i < 5; i++) {
    const r = await register(goodReg({ email: 'p' + i + '@example.com' }));
    assert.equal(r.statusCode, 200, 'request ' + (i + 1));
  }
  const blocked = await register(goodReg({ email: 'p9@example.com' }));
  assert.equal(blocked.statusCode, 429);
  assert.deepEqual(blocked.body, { error: 'Too many attempts. Try again later.' });
  assert.equal(byEmail('p9@example.com'), undefined);
  // another address is fine
  const other = await register(goodReg({ email: 'p9@example.com' }), { headers: { 'x-forwarded-for': '203.0.113.7' } });
  assert.equal(other.statusCode, 200);

  // per email, from different addresses
  for (let i = 0; i < 4; i++) {
    const r = await register(goodReg({ email: 'same@example.com' }), { headers: { 'x-forwarded-for': '198.51.100.' + i } });
    assert.equal(r.statusCode, 200);
  }
  const fifth = await register(goodReg({ email: 'same@example.com' }), { headers: { 'x-forwarded-for': '198.51.100.99' } });
  assert.equal(fifth.statusCode, 200);
  const sixth = await register(goodReg({ email: 'same@example.com' }), { headers: { 'x-forwarded-for': '198.51.100.100' } });
  assert.equal(sixth.statusCode, 429);

  db.advance(HOUR + 1);
  assert.equal((await register(goodReg({ email: 'p9@example.com' }))).statusCode, 200);
});

// ---- verify ----

async function newUnverified() {
  await register(goodReg());
  return tokenIn(outbox()[outbox().length - 1]);
}

test('verify: marks the account verified, token is single use, no session cookie', async () => {
  const raw = await newUnverified();
  assert.equal(byEmail('bob@example.com').email_verified_at, null);
  const r = await verify(raw);
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.body, { ok: true });
  assert.ok(byEmail('bob@example.com').email_verified_at);
  assert.equal(r.headers['set-cookie'], undefined);
  const again = await verify(raw);
  assert.equal(again.statusCode, 400);
  assert.deepEqual(again.body, VERIFY_FAILED);
});

test('verify: unknown, malformed, expired, and wrong-kind tokens are rejected', async () => {
  const raw = await newUnverified();
  for (const bad of ['0'.repeat(64), '', undefined, null, 12, { a: 1 }, ['x']]) {
    const r = await verify(bad);
    assert.equal(r.statusCode, 400);
    assert.deepEqual(r.body, VERIFY_FAILED);
  }
  assert.equal((await callHandler(verifyHandler, { method: 'POST' })).statusCode, 400);
  const resetTok = await tokens.issueToken('org1', 'reset');
  const wrong = await verify(resetTok);
  assert.equal(wrong.statusCode, 400);
  assert.equal(db.tables.auth_tokens.find((t) => t.kind === 'reset').used_at, null, 'a refused kind does not burn the token');
  db.advance(24 * HOUR + 1);
  const expired = await verify(raw);
  assert.equal(expired.statusCode, 400);
  assert.deepEqual(expired.body, VERIFY_FAILED);
  assert.equal(byEmail('bob@example.com').email_verified_at, null);
});

test('verify: does not overwrite an existing verified time, and 405 for non-POST', async () => {
  const before = byEmail('a@example.com').email_verified_at;
  const raw = await tokens.issueToken('org1', 'verify');
  const r = await verify(raw, OLD_PASSWORD);
  assert.equal(r.statusCode, 200);
  assert.equal(byEmail('a@example.com').email_verified_at, before);
  assert.equal((await callHandler(verifyHandler, { method: 'GET' })).statusCode, 405);
});

test('verify: two concurrent requests with the same token - only one succeeds', async () => {
  const raw = await newUnverified();
  const [a, b] = await Promise.all([verify(raw), verify(raw)]);
  assert.deepEqual([a.statusCode, b.statusCode].sort(), [200, 400]);
});

test('a verified account can then sign in (end to end with login)', async () => {
  const raw = await newUnverified();
  const loginHandler = require('../api/_routes/auth/login');
  const before = await post(loginHandler, { email: 'bob@example.com', password: 'longenough' });
  assert.equal(before.statusCode, 403);
  assert.equal(before.body.code, 'unverified');
  await verify(raw);
  const after = await post(loginHandler, { email: 'bob@example.com', password: 'longenough' });
  assert.equal(after.statusCode, 200);
});

test('verify: a wrong or missing password is refused with the same message and does NOT burn the token', async () => {
  const raw = await newUnverified();
  for (const bad of ['wrong-password', '', undefined, null, 12345678, { a: 1 }]) {
    const r = await post(verifyHandler, { token: raw, password: bad });
    assert.equal(r.statusCode, 400);
    assert.deepEqual(r.body, VERIFY_FAILED);
    assert.equal(r.headers['set-cookie'], undefined);
  }
  const noPassword = await post(verifyHandler, { token: raw });   // what a link scanner / prefetch would send
  assert.equal(noPassword.statusCode, 400);
  assert.deepEqual(noPassword.body, VERIFY_FAILED);
  assert.equal(byEmail('bob@example.com').email_verified_at, null);
  assert.equal(db.tables.auth_tokens.find((t) => t.kind === 'verify').used_at, null, 'the token is still usable');
  assert.equal((await verify(raw, 'longenough')).statusCode, 200);
});

test('verify: a GET (scanner, prefetch) never verifies and never consumes the token', async () => {
  const raw = await newUnverified();
  const r = await callHandler(verifyHandler, { method: 'GET', query: { token: raw } });
  assert.equal(r.statusCode, 405);
  assert.equal(byEmail('bob@example.com').email_verified_at, null);
  assert.equal(db.tables.auth_tokens.find((t) => t.kind === 'verify').used_at, null);
});

test('verify: unknown tokens still pay for a bcrypt compare, so the answer time does not reveal the token', async () => {
  const raw = await newUnverified();
  const realCompare = bcrypt.compare;
  let compares = 0;
  bcrypt.compare = (...a) => { compares++; return realCompare.apply(bcrypt, a); };
  try {
    await verify('0'.repeat(64));                 // unknown token
    await verify(raw, 'wrong-password');          // known token, wrong password
    await verify(undefined);                      // malformed
    await verify(raw, 'longenough');              // success
  } finally { bcrypt.compare = realCompare; }
  assert.equal(compares, 4);
  const rounds = bcrypt.getRounds(require('../api/_lib/accounts').DUMMY_HASH);
  assert.equal(rounds, require('../api/_lib/accounts').BCRYPT_COST);
});

test('verify: a suspended or Public row cannot be verified through an unusable password', async () => {
  db.tables.organizers.push(row({ id: 'pub', email: 'public@dartdraw.local', password_hash: 'disabled', email_verified_at: null }));
  const raw = await tokens.issueToken('pub', 'verify');
  const r = await verify(raw, 'disabled');
  assert.equal(r.statusCode, 400);
  assert.equal(byEmail('public@dartdraw.local').email_verified_at, null);
});

test('verify: throttled at 10 attempts per 15 minutes per address (429), atomically', async () => {
  const raw = await newUnverified();
  for (let i = 0; i < 10; i++) assert.equal((await verify(raw, 'wrong-' + i + '-password')).statusCode, 400, 'attempt ' + (i + 1));
  const blocked = await verify(raw, 'longenough');
  assert.equal(blocked.statusCode, 429);
  assert.deepEqual(blocked.body, { error: 'Too many attempts. Try again later.' });
  assert.equal(byEmail('bob@example.com').email_verified_at, null);
  // another address is unaffected, and the window resets
  assert.equal((await post(verifyHandler, { token: raw, password: 'longenough' }, { headers: { 'x-forwarded-for': '203.0.113.77' } })).statusCode, 200);
  db.advance(15 * 60 * 1000 + 1);
  assert.equal((await verify('0'.repeat(64))).statusCode, 400);
});

test('verify: 30 concurrent attempts - at most 10 are evaluated, the rest are 429', async () => {
  const raw = await newUnverified();
  const realCompare = bcrypt.compare;
  let compares = 0;
  bcrypt.compare = (...a) => { compares++; return realCompare.apply(bcrypt, a); };
  let results;
  try {
    results = await Promise.all(Array.from({ length: 30 }, (_, i) => verify(raw, 'wrong-' + i + '-password')));
  } finally { bcrypt.compare = realCompare; }
  assert.equal(results.filter((r) => r.statusCode === 429).length, 20);
  assert.equal(results.filter((r) => r.statusCode === 400).length, 10);
  assert.equal(compares, 10);
});

// ---- resend-verification ----

test('resend-verification: unverified account gets a new link; old one dies', async () => {
  const first = await newUnverified();
  const r = await post(resendHandler, { email: ' BOB@example.com' });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.body, RESEND_MSG);
  assert.equal(outbox().length, 2);
  assert.equal(outbox()[1].subject, 'Verify your DartDraw email');
  assert.equal(outbox()[1].to, 'bob@example.com');
  const second = tokenIn(outbox()[1]);
  assert.notEqual(first, second);
  assert.equal((await verify(first)).statusCode, 400);
  assert.equal((await verify(second)).statusCode, 200);
});

test('resend-verification: same answer and no email for unknown, verified, suspended and Public accounts', async () => {
  db.tables.organizers.push(row({ id: 'u1', email: 'u@example.com', email_verified_at: null }));
  db.tables.organizers.push(row({ id: 'su1', email: 'su@example.com', suspended: true, email_verified_at: null }));
  db.tables.organizers.push(row({ id: 'pub', email: 'public@dartdraw.local', name: 'Public', password_hash: 'disabled', email_verified_at: null }));
  const known = await post(resendHandler, { email: 'u@example.com' });
  assert.equal(outbox().length, 1);
  outbox().length = 0;
  for (const email of ['nobody@example.com', 'a@example.com', 'su@example.com', 'public@dartdraw.local']) {
    const r = await post(resendHandler, { email });
    assert.equal(r.statusCode, known.statusCode);
    assert.equal(JSON.stringify(r.body), JSON.stringify(known.body));
    assert.deepEqual(r.headers, known.headers);
  }
  assert.equal(outbox().length, 0);
  assert.equal(db.tables.auth_tokens.filter((t) => t.organizer_id !== 'u1').length, 0);
});

test('resend-verification: validation, 405 and throttle (5 per hour)', async () => {
  assert.equal((await callHandler(resendHandler, { method: 'GET' })).statusCode, 405);
  assert.equal((await post(resendHandler, {})).statusCode, 400);
  assert.equal((await post(resendHandler, { email: 'nope' })).statusCode, 400);
  assert.equal((await post(resendHandler, { email: ['a@example.com'] })).statusCode, 400);
  for (let i = 0; i < 5; i++) assert.equal((await post(resendHandler, { email: 'x' + i + '@example.com' })).statusCode, 200);
  const blocked = await post(resendHandler, { email: 'x9@example.com' });
  assert.equal(blocked.statusCode, 429);
  assert.deepEqual(blocked.body, { error: 'Too many attempts. Try again later.' });
  // per email
  const other = { headers: { 'x-forwarded-for': '203.0.113.50' } };
  for (let i = 0; i < 5; i++) assert.equal((await post(resendHandler, { email: 'same@example.com' }, { headers: { 'x-forwarded-for': '203.0.113.' + (60 + i) } })).statusCode, 200);
  assert.equal((await post(resendHandler, { email: 'same@example.com' }, other)).statusCode, 429);
});

test('resend-verification still works while sign-up is closed (existing unverified accounts)', async () => {
  db.tables.organizers.push(row({ id: 'u1', email: 'u@example.com', email_verified_at: null }));
  process.env.SIGNUP_OPEN = 'false';
  const r = await post(resendHandler, { email: 'u@example.com' });
  assert.equal(r.statusCode, 200);
  assert.equal(outbox().length, 1);
});

// ---- forgot ----

test('forgot: existing account gets a reset link (hashed, 1 hour), generic answer', async () => {
  const r = await post(forgotHandler, { email: ' A@Example.com ' });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.body, FORGOT_MSG);
  assert.equal(outbox().length, 1);
  const msg = outbox()[0];
  assert.equal(msg.to, 'a@example.com');
  assert.equal(msg.subject, 'Reset your DartDraw password');
  assert.match(linkIn(msg), /^https:\/\/app\.example\.test\/reset\.html\?token=[0-9a-f]{64}$/);
  assert.match(msg.text, /ignore/i);
  const t = db.tables.auth_tokens[0];
  assert.equal(t.kind, 'reset');
  assert.equal(t.token_hash, tokens.hashToken(tokenIn(msg)));
  assert.equal(t.expires_at.getTime() - db.now().getTime(), HOUR);
});

test('forgot: byte-identical answers; no email for unknown, suspended, Public; unverified accounts still get one', async () => {
  db.tables.organizers.push(row({ id: 'u1', email: 'u@example.com', email_verified_at: null }));
  db.tables.organizers.push(row({ id: 's1', email: 's@example.com', suspended: true }));
  db.tables.organizers.push(row({ id: 'pub', email: 'public@dartdraw.local', name: 'Public', password_hash: 'disabled' }));
  const known = await post(forgotHandler, { email: 'a@example.com' });
  assert.equal(outbox().length, 1);
  const unverified = await post(forgotHandler, { email: 'u@example.com' });
  assert.equal(outbox().length, 2, 'resetting proves email ownership, so an unverified account may reset');
  outbox().length = 0;
  for (const email of ['nobody@example.com', 's@example.com', 'public@dartdraw.local']) {
    const r = await post(forgotHandler, { email });
    assert.equal(r.statusCode, known.statusCode);
    assert.equal(JSON.stringify(r.body), JSON.stringify(known.body));
    assert.deepEqual(r.headers, known.headers);
  }
  assert.equal(JSON.stringify(unverified.body), JSON.stringify(known.body));
  assert.equal(outbox().length, 0);
});

test('forgot: a new request invalidates the earlier reset link', async () => {
  await post(forgotHandler, { email: 'a@example.com' });
  await post(forgotHandler, { email: 'a@example.com' });
  const [first, second] = outbox().map(tokenIn);
  assert.equal((await post(resetHandler, { token: first, password: 'brand-new-pass' })).statusCode, 400);
  assert.equal((await post(resetHandler, { token: second, password: 'brand-new-pass' })).statusCode, 200);
});

test('forgot: validation, 405, works while sign-up is closed, throttle 429', async () => {
  assert.equal((await callHandler(forgotHandler, { method: 'GET' })).statusCode, 405);
  assert.equal((await post(forgotHandler, {})).statusCode, 400);
  assert.equal((await post(forgotHandler, { email: 'nope' })).statusCode, 400);
  process.env.SIGNUP_OPEN = 'false';
  assert.equal((await post(forgotHandler, { email: 'a@example.com' })).statusCode, 200);
  assert.equal(outbox().length, 1);
  for (let i = 0; i < 4; i++) assert.equal((await post(forgotHandler, { email: 'a@example.com' })).statusCode, 200);
  const blocked = await post(forgotHandler, { email: 'a@example.com' });
  assert.equal(blocked.statusCode, 429);
  assert.deepEqual(blocked.body, { error: 'Too many attempts. Try again later.' });
});

test('forgot: does nothing when mail is not configured, still the same answer', async () => {
  process.env.MAIL_PROVIDER = 'resend';
  const r = await post(forgotHandler, { email: 'a@example.com' });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.body, FORGOT_MSG);
  assert.equal(outbox().length, 0);
});

// ---- reset ----

const sessionCookieFor = (o) => ({ [COOKIE]: jwt.sign({ sub: o.id, email: o.email, name: o.name, tv: o.token_version }, SECRET, { expiresIn: 600 }) });
async function requireAuthWith(cookies) {
  const holder = {};
  const r = await callHandler(async (req, res) => { holder.result = await auth.requireAuth(req, res); }, { cookies });
  return { result: holder.result, status: r.statusCode };
}

test('reset: changes the password, bumps token_version, kills old sessions, single use', async () => {
  process.env.REQUIRE_LOGIN = 'true';
  const oldCookie = sessionCookieFor(byEmail('a@example.com'));
  assert.ok((await requireAuthWith(oldCookie)).result, 'session valid before the reset');

  await post(forgotHandler, { email: 'a@example.com' });
  const raw = tokenIn(outbox()[0]);
  const r = await post(resetHandler, { token: raw, password: 'brand-new-pass' });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.body, { ok: true });
  assert.equal(r.headers['set-cookie'], undefined);

  const o = byEmail('a@example.com');
  assert.ok(bcrypt.compareSync('brand-new-pass', o.password_hash));
  assert.equal(bcrypt.compareSync(OLD_PASSWORD, o.password_hash), false);
  assert.notEqual(o.password_hash, 'brand-new-pass');
  assert.equal(o.token_version, 1);
  const stale = await requireAuthWith(oldCookie);
  assert.equal(stale.result, null);
  assert.equal(stale.status, 401);
  assert.ok((await requireAuthWith(sessionCookieFor(o))).result, 'a fresh session works');

  const again = await post(resetHandler, { token: raw, password: 'another-new-pass' });
  assert.equal(again.statusCode, 400);
  assert.deepEqual(again.body, INVALID_LINK);
  assert.ok(bcrypt.compareSync('brand-new-pass', byEmail('a@example.com').password_hash));
  assert.equal(byEmail('a@example.com').token_version, 1);
});

test('reset: marks an unverified account verified, keeps an existing verified time', async () => {
  db.tables.organizers.push(row({ id: 'u1', email: 'u@example.com', email_verified_at: null }));
  const raw = await tokens.issueToken('u1', 'reset');
  assert.equal((await post(resetHandler, { token: raw, password: 'brand-new-pass' })).statusCode, 200);
  assert.ok(byEmail('u@example.com').email_verified_at);

  const before = byEmail('a@example.com').email_verified_at;
  const raw2 = await tokens.issueToken('org1', 'reset');
  await post(resetHandler, { token: raw2, password: 'brand-new-pass' });
  assert.equal(byEmail('a@example.com').email_verified_at, before);
});

test('reset: an invite token is accepted (7 day lifetime); verify tokens are not accepted', async () => {
  db.tables.organizers.push(row({ id: 'inv', email: 'inv@example.com', name: 'Invited', password_hash: 'x-placeholder', email_verified_at: null }));
  const invite = await tokens.issueToken('inv', 'invite');
  db.advance(6 * 24 * HOUR);
  const r = await post(resetHandler, { token: invite, password: 'brand-new-pass' });
  assert.equal(r.statusCode, 200);
  assert.ok(byEmail('inv@example.com').email_verified_at);
  assert.ok(bcrypt.compareSync('brand-new-pass', byEmail('inv@example.com').password_hash));

  const verifyTok = await tokens.issueToken('org1', 'verify');
  const bad = await post(resetHandler, { token: verifyTok, password: 'brand-new-pass' });
  assert.equal(bad.statusCode, 400);
  assert.deepEqual(bad.body, INVALID_LINK);
  assert.ok(bcrypt.compareSync(OLD_PASSWORD, byEmail('a@example.com').password_hash));
  // and the verify token is still usable on the verify endpoint
  assert.equal((await verify(verifyTok, OLD_PASSWORD)).statusCode, 200);
});

test('reset: a reset token is not accepted by verify (and does not verify the account)', async () => {
  db.tables.organizers.push(row({ id: 'u1', email: 'u@example.com', email_verified_at: null }));
  const raw = await tokens.issueToken('u1', 'reset');
  assert.equal((await verify(raw)).statusCode, 400);
  assert.equal(byEmail('u@example.com').email_verified_at, null);
});

test('reset: short or missing password is 400 and does not burn the token', async () => {
  const raw = await tokens.issueToken('org1', 'reset');
  for (const password of ['short', '', undefined, 12345678, { a: 1 }]) {
    const r = await post(resetHandler, { token: raw, password });
    assert.equal(r.statusCode, 400);
    assert.match(r.body.error, /at least 8|password/i);
  }
  assert.equal((await post(resetHandler, { token: raw, password: 'long-enough-pass' })).statusCode, 200);
});

test('reset: expired, unknown and malformed tokens answer the invalid-link message', async () => {
  const raw = await tokens.issueToken('org1', 'reset');
  for (const bad of ['f'.repeat(64), '', undefined, 42, null]) {
    const r = await post(resetHandler, { token: bad, password: 'brand-new-pass' });
    assert.equal(r.statusCode, 400);
    assert.deepEqual(r.body, INVALID_LINK);
  }
  db.advance(HOUR + 1);
  const expired = await post(resetHandler, { token: raw, password: 'brand-new-pass' });
  assert.equal(expired.statusCode, 400);
  assert.deepEqual(expired.body, INVALID_LINK);
  assert.ok(bcrypt.compareSync(OLD_PASSWORD, byEmail('a@example.com').password_hash));
  assert.equal((await callHandler(resetHandler, { method: 'GET' })).statusCode, 405);
});

test('reset: a suspended account changes nothing and gets the invalid-link answer', async () => {
  db.tables.organizers.push(row({ id: 's1', email: 's@example.com', suspended: true }));
  const raw = await tokens.issueToken('s1', 'reset');
  const r = await post(resetHandler, { token: raw, password: 'brand-new-pass' });
  assert.equal(r.statusCode, 400);
  assert.deepEqual(r.body, INVALID_LINK);
  const o = byEmail('s@example.com');
  assert.equal(o.password_hash, HASH);
  assert.equal(o.token_version, 0);
  assert.equal(o.suspended, true);
  // the same answer an unknown token gets
  const unknown = await post(resetHandler, { token: 'f'.repeat(64), password: 'brand-new-pass' });
  assert.equal(JSON.stringify(r.body), JSON.stringify(unknown.body));
});

test('reset: two concurrent requests with the same token - only one succeeds', async () => {
  const raw = await tokens.issueToken('org1', 'reset');
  const [a, b] = await Promise.all([
    post(resetHandler, { token: raw, password: 'first-new-pass' }),
    post(resetHandler, { token: raw, password: 'second-new-pass' }),
  ]);
  assert.deepEqual([a.statusCode, b.statusCode].sort(), [200, 400]);
  assert.equal(byEmail('a@example.com').token_version, 1);
});

test('reset then login with the new password works end to end', async () => {
  const loginHandler = require('../api/_routes/auth/login');
  await post(forgotHandler, { email: 'a@example.com' });
  await post(resetHandler, { token: tokenIn(outbox()[0]), password: 'brand-new-pass' });
  assert.equal((await post(loginHandler, { email: 'a@example.com', password: OLD_PASSWORD })).statusCode, 401);
  const ok = await post(loginHandler, { email: 'a@example.com', password: 'brand-new-pass' });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.body.email, 'a@example.com');
});

test('database failures answer 500 with a generic message on each endpoint', async () => {
  db.sql = async () => { throw new Error('boom'); };
  const cases = [
    [registerHandler, goodReg()],
    [verifyHandler, { token: 'f'.repeat(64), password: 'longenough' }],
    [resendHandler, { email: 'a@example.com' }],
    [forgotHandler, { email: 'a@example.com' }],
    [resetHandler, { token: 'f'.repeat(64), password: 'brand-new-pass' }],
  ];
  for (const [handler, body] of cases) {
    const r = await post(handler, body);
    assert.equal(r.statusCode, 500);
    assert.equal(typeof r.body.error, 'string');
    assert.equal(r.body.error.includes('boom'), false);
  }
});

// ---- response-time padding ----

const authflow = require('../api/_lib/authflow');
const timed = async (fn) => { const t0 = Date.now(); const r = await fn(); return { r, ms: Date.now() - t0 }; };

test('padTo / minResponseMs: waits out the remainder, never longer than needed, env override and default', async () => {
  delete process.env.AUTH_MIN_RESPONSE_MS;
  assert.equal(authflow.minResponseMs(), 1500);
  process.env.AUTH_MIN_RESPONSE_MS = '0';
  assert.equal(authflow.minResponseMs(), 0);
  process.env.AUTH_MIN_RESPONSE_MS = 'junk';
  assert.equal(authflow.minResponseMs(), 1500);
  process.env.AUTH_MIN_RESPONSE_MS = '-5';
  assert.equal(authflow.minResponseMs(), 1500);
  const a = await timed(() => authflow.padTo(Date.now(), 80));
  assert.ok(a.ms >= 80, 'waited ' + a.ms);
  const b = await timed(() => authflow.padTo(Date.now() - 1000, 80));   // already past
  assert.ok(b.ms < 40, 'did not wait: ' + b.ms);
});

test('forgot, resend and register take at least the minimum for known, unknown and failing requests alike', async () => {
  process.env.AUTH_MIN_RESPONSE_MS = '120';
  db.tables.organizers.push(row({ id: 'u1', email: 'u@example.com', email_verified_at: null }));
  const cases = [
    ['forgot known', () => post(forgotHandler, { email: 'a@example.com' }, { ip: '10.0.0.1' }), 200],
    ['forgot unknown', () => post(forgotHandler, { email: 'nobody@example.com' }, { ip: '10.0.0.2' }), 200],
    ['resend known', () => post(resendHandler, { email: 'u@example.com' }, { ip: '10.0.0.3' }), 200],
    ['resend unknown', () => post(resendHandler, { email: 'nobody@example.com' }, { ip: '10.0.0.4' }), 200],
    ['register new', () => register(goodReg({ email: 'n1@example.com' }), { ip: '10.0.0.5' }), 200],
    ['register unverified', () => register(goodReg({ email: 'u@example.com' }), { ip: '10.0.0.6' }), 200],
    ['register verified', () => register(goodReg({ email: 'a@example.com' }), { ip: '10.0.0.7' }), 200],
  ];
  for (const [label, run, status] of cases) {
    const { r, ms } = await timed(run);
    assert.equal(r.statusCode, status, label);
    assert.ok(ms >= 120, label + ' answered after only ' + ms + ' ms');
  }
  // the mail provider failing (not configured / throwing) does not make it quicker or slower
  process.env.MAIL_PROVIDER = 'resend';
  const failed = await timed(() => post(forgotHandler, { email: 'a@example.com' }, { ip: '10.0.0.8' }));
  assert.equal(failed.r.statusCode, 200);
  assert.ok(failed.ms >= 120, 'mail failure answered after only ' + failed.ms + ' ms');
  // and so does a server error
  process.env.MAIL_PROVIDER = 'console';
  const realSql = db.sql;
  db.sql = async () => { throw new Error('boom'); };
  for (const [handler, body] of [[forgotHandler, { email: 'a@example.com' }], [resendHandler, { email: 'a@example.com' }], [registerHandler, goodReg()]]) {
    const { r, ms } = await timed(() => post(handler, body));
    assert.equal(r.statusCode, 500);
    assert.ok(ms >= 120, 'error answered after only ' + ms + ' ms');
  }
  db.sql = realSql;
});

test('known and unknown emails take comparable time (both padded to the same floor)', async () => {
  process.env.AUTH_MIN_RESPONSE_MS = '150';
  const known = await timed(() => post(forgotHandler, { email: 'a@example.com' }, { ip: '10.1.0.1' }));
  const unknown = await timed(() => post(forgotHandler, { email: 'nobody@example.com' }, { ip: '10.1.0.2' }));
  assert.ok(known.ms >= 150 && unknown.ms >= 150, known.ms + ' / ' + unknown.ms);
  assert.ok(Math.abs(known.ms - unknown.ms) < 100, 'known ' + known.ms + ' ms vs unknown ' + unknown.ms + ' ms');
});

test('validation errors and 405 are not padded (they reveal nothing about accounts)', async () => {
  process.env.AUTH_MIN_RESPONSE_MS = '300';
  const { r, ms } = await timed(() => post(forgotHandler, { email: 'nope' }));
  assert.equal(r.statusCode, 400);
  assert.ok(ms < 150, 'took ' + ms);
});

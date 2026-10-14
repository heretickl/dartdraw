const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createFakeDb } = require('./lib/fake-db');
const { callHandler } = require('./lib/call-handler');

// Route api/_lib/db.js to a per-test fake database.
const dbPath = require.resolve('../api/_lib/db');
let db;
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
  sql: (...args) => db.sql(...args),
} };

const tiers = require('../api/_lib/tiers');
const tokens = require('../api/_lib/tokens');
const throttle = require('../api/_lib/throttle');
const mail = require('../api/_lib/mail');
const accounts = require('../api/_lib/accounts');

const ENV_KEYS = ['APP_URL', 'SIGNUP_OPEN', 'MAIL_PROVIDER', 'RESEND_API_KEY', 'MAIL_FROM'];
let savedEnv, realFetch, realLog;
beforeEach(() => {
  db = createFakeDb({ organizers: [{ id: 'org1', email: 'a@example.com', name: 'A', password_hash: 'x', role: 'organizer', tier: 'basic', suspended: false, email_verified_at: null, token_version: 0 }] });
  savedEnv = {}; ENV_KEYS.forEach((k) => { savedEnv[k] = process.env[k]; delete process.env[k]; });
  realFetch = global.fetch; realLog = console.log;
  mail.sendMail.outbox.length = 0;
});
afterEach(() => {
  ENV_KEYS.forEach((k) => { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; });
  global.fetch = realFetch; console.log = realLog;
});

// ---- tiers ----

const entries = (n, withdrawn) => Array.from({ length: n }, (_, i) => ({ id: 'e' + i, name: 'E' + i, withdrawn: !!withdrawn }));
const evt = (active, withdrawn) => ({ entriesList: entries(active).concat(entries(withdrawn || 0, true).map((e, i) => Object.assign(e, { id: 'w' + i }))) });

test('ENTRY_LIMITS and entryLimitFor', () => {
  assert.deepEqual(tiers.ENTRY_LIMITS, { basic: 64, pro: null });
  assert.equal(tiers.entryLimitFor('basic'), 64);
  assert.equal(tiers.entryLimitFor('pro'), null);
  assert.equal(tiers.entryLimitFor('mystery'), 64);
  assert.equal(tiers.entryLimitFor(undefined), 64);
  assert.equal(tiers.entryLimitFor(null), 64);
  assert.equal(tiers.entryLimitFor('constructor'), 64);   // not an inherited property lookup
});

test('countActiveEntries excludes withdrawn and tolerates junk', () => {
  assert.equal(tiers.countActiveEntries(evt(5, 3)), 5);
  assert.equal(tiers.countActiveEntries({ entriesList: [{ id: 1 }, null, 7, 'x', undefined, [], { id: 2, withdrawn: true }, { id: 3 }] }), 2);
  assert.equal(tiers.countActiveEntries({}), 0);
  assert.equal(tiers.countActiveEntries(undefined), 0);
  assert.equal(tiers.countActiveEntries(null), 0);
  assert.equal(tiers.countActiveEntries('junk'), 0);
  assert.equal(tiers.countActiveEntries({ entriesList: 'nope' }), 0);
  assert.equal(tiers.countActiveEntries({ entriesList: { length: 99 } }), 0);
});

test('checkEntryLimit: new event of 65 as basic is a violation, 64 is fine', () => {
  assert.deepEqual(tiers.checkEntryLimit('basic', evt(65), undefined), { limit: 64, count: 65 });
  assert.equal(tiers.checkEntryLimit('basic', evt(64), undefined), null);
  assert.equal(tiers.checkEntryLimit('basic', evt(10, 80), undefined), null);   // withdrawn do not count
});

test('checkEntryLimit: an existing over-limit event may be edited but not grown', () => {
  assert.equal(tiers.checkEntryLimit('basic', evt(70), evt(70)), null);
  assert.equal(tiers.checkEntryLimit('basic', evt(65), evt(70)), null);   // shrinking is fine
  assert.deepEqual(tiers.checkEntryLimit('basic', evt(71), evt(70)), { limit: 64, count: 71 });
  assert.deepEqual(tiers.checkEntryLimit('basic', evt(65), evt(64)), { limit: 64, count: 65 });
  // withdrawing someone then adding two others in the same save still counts only active ones
  assert.equal(tiers.checkEntryLimit('basic', evt(70, 1), evt(70)), null);
});

test('checkEntryLimit: pro is never limited; unknown tier is treated as basic', () => {
  assert.equal(tiers.checkEntryLimit('pro', evt(500), undefined), null);
  assert.equal(tiers.checkEntryLimit('pro', evt(500), evt(3)), null);
  assert.deepEqual(tiers.checkEntryLimit('mystery', evt(65), undefined), { limit: 64, count: 65 });
  assert.deepEqual(tiers.checkEntryLimit(undefined, evt(65), undefined), { limit: 64, count: 65 });
});

// ---- tokens ----

test('hashToken is a deterministic SHA-256 hex that differs from the input', () => {
  const h = tokens.hashToken('abc');
  assert.equal(h, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(tokens.hashToken('abc'), h);
  assert.notEqual(tokens.hashToken('abd'), h);
  assert.match(h, /^[0-9a-f]{64}$/);
});

test('LIFETIMES_MS', () => {
  assert.deepEqual(tokens.LIFETIMES_MS, { verify: 24 * 3600e3, reset: 3600e3, invite: 7 * 24 * 3600e3 });
});

test('issueToken returns a 64-hex raw token and stores only its hash', async () => {
  const raw = await tokens.issueToken('org1', 'verify');
  assert.match(raw, /^[0-9a-f]{64}$/);
  assert.equal(db.tables.auth_tokens.length, 1);
  const row = db.tables.auth_tokens[0];
  assert.equal(row.token_hash, tokens.hashToken(raw));
  assert.notEqual(row.token_hash, raw);
  assert.equal(row.organizer_id, 'org1');
  assert.equal(row.kind, 'verify');
  assert.equal(row.used_at, null);
  assert.equal(row.expires_at.getTime(), db.now().getTime() + 24 * 3600e3);
  assert.ok(!JSON.stringify(db.tables.auth_tokens).includes(raw));
  assert.notEqual(await tokens.issueToken('org1', 'reset'), raw);
});

test('issueToken rejects an unknown kind', async () => {
  await assert.rejects(() => tokens.issueToken('org1', 'bogus'));
  assert.equal(db.tables.auth_tokens.length, 0);
});

test('consumeToken: valid token works once', async () => {
  const raw = await tokens.issueToken('org1', 'verify');
  assert.deepEqual(await tokens.consumeToken(raw, ['verify']), { organizerId: 'org1', kind: 'verify' });
  assert.equal(await tokens.consumeToken(raw, ['verify']), null);
});

test('consumeToken: kind must be in the allowed list', async () => {
  const raw = await tokens.issueToken('org1', 'verify');
  assert.equal(await tokens.consumeToken(raw, ['reset', 'invite']), null);
  // a refused attempt must not burn the token
  assert.deepEqual(await tokens.consumeToken(raw, ['verify']), { organizerId: 'org1', kind: 'verify' });
  const inv = await tokens.issueToken('org1', 'invite');
  assert.deepEqual(await tokens.consumeToken(inv, ['reset', 'invite']), { organizerId: 'org1', kind: 'invite' });
});

test('consumeToken: expired token is rejected, one just inside its life is accepted', async () => {
  const raw = await tokens.issueToken('org1', 'reset');
  db.advance(3600e3 - 1);
  const raw2 = raw;
  assert.deepEqual(await tokens.consumeToken(raw2, ['reset']), { organizerId: 'org1', kind: 'reset' });
  const r3 = await tokens.issueToken('org1', 'reset');
  db.advance(3600e3);
  assert.equal(await tokens.consumeToken(r3, ['reset']), null);
});

test('consumeToken: a newer token of the same kind invalidates older ones, other kinds and organisers are left alone', async () => {
  db.tables.organizers.push({ id: 'org2', email: 'b@example.com' });
  const old = await tokens.issueToken('org1', 'verify');
  const other = await tokens.issueToken('org1', 'reset');
  const stranger = await tokens.issueToken('org2', 'verify');
  const fresh = await tokens.issueToken('org1', 'verify');
  assert.equal(await tokens.consumeToken(old, ['verify']), null);
  assert.deepEqual(await tokens.consumeToken(fresh, ['verify']), { organizerId: 'org1', kind: 'verify' });
  assert.deepEqual(await tokens.consumeToken(other, ['reset']), { organizerId: 'org1', kind: 'reset' });
  assert.deepEqual(await tokens.consumeToken(stranger, ['verify']), { organizerId: 'org2', kind: 'verify' });
});

test('consumeToken: unknown or junk tokens are null', async () => {
  assert.equal(await tokens.consumeToken('f'.repeat(64), ['verify']), null);
  assert.equal(await tokens.consumeToken('', ['verify']), null);
  assert.equal(await tokens.consumeToken(undefined, ['verify']), null);
  assert.equal(await tokens.consumeToken(12345, ['verify']), null);
  assert.equal(await tokens.consumeToken({ $ne: 1 }, ['verify']), null);
});

test('consumeToken claims atomically: concurrent consumers get exactly one success', async () => {
  const raw = await tokens.issueToken('org1', 'reset');
  const results = await Promise.all([1, 2, 3, 4].map(() => tokens.consumeToken(raw, ['reset'])));
  assert.equal(results.filter(Boolean).length, 1);
  const claim = db.calls.filter((c) => /^UPDATE auth_tokens/i.test(c.text) && /token_hash/.test(c.text));
  claim.forEach((c) => {
    assert.match(c.text, /used_at IS NULL/);
    assert.match(c.text, /expires_at > now\(\)/);
    assert.match(c.text, /RETURNING/);
  });
});

// ---- throttle ----

test('clientIp', () => {
  assert.equal(throttle.clientIp({ headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }, socket: { remoteAddress: '9.9.9.9' } }), '1.2.3.4');
  assert.equal(throttle.clientIp({ headers: { 'x-forwarded-for': ' 1.2.3.4 ' } }), '1.2.3.4');
  assert.equal(throttle.clientIp({ headers: {}, socket: { remoteAddress: '9.9.9.9' } }), '9.9.9.9');
  assert.equal(throttle.clientIp({ headers: {} }), 'unknown');
  assert.equal(throttle.clientIp({}), 'unknown');
});

test('throttle: blocked only once the limit is reached within the window', async () => {
  const W = 15 * 60e3;
  assert.equal(await throttle.isBlocked('k', 3, W), false);
  await throttle.record('k', W);
  await throttle.record('k', W);
  assert.equal(await throttle.isBlocked('k', 3, W), false);
  await throttle.record('k', W);
  assert.equal(await throttle.isBlocked('k', 3, W), true);
  assert.equal(await throttle.isBlocked('other', 3, W), false);
});

test('throttle: the window restarts after it has passed', async () => {
  const W = 1000;
  await throttle.record('k', W); await throttle.record('k', W);
  assert.equal(await throttle.isBlocked('k', 2, W), true);
  db.advance(W - 1);
  assert.equal(await throttle.isBlocked('k', 2, W), true);
  db.advance(1);
  assert.equal(await throttle.isBlocked('k', 2, W), false);   // expired window no longer blocks
  await throttle.record('k', W);                              // restarts at 1
  assert.equal(db.tables.auth_throttle.find((r) => r.key === 'k').count, 1);
  assert.equal(await throttle.isBlocked('k', 2, W), false);
  await throttle.record('k', W);
  assert.equal(await throttle.isBlocked('k', 2, W), true);
});

test('throttle: clear removes the counter', async () => {
  await throttle.record('k', 1000); await throttle.record('k', 1000);
  assert.equal(await throttle.isBlocked('k', 2, 1000), true);
  await throttle.clear('k');
  assert.equal(await throttle.isBlocked('k', 2, 1000), false);
  assert.equal(db.tables.auth_throttle.length, 0);
  await throttle.clear('never-existed');
});

// ---- mail ----

test('isMailConfigured for each env combination', () => {
  assert.equal(mail.isMailConfigured(), false);                       // default provider resend, nothing set
  process.env.RESEND_API_KEY = 'k';
  assert.equal(mail.isMailConfigured(), false);                       // missing MAIL_FROM
  process.env.MAIL_FROM = 'DartDraw <noreply@example.com>';
  assert.equal(mail.isMailConfigured(), false);                       // missing APP_URL: links would use the Host header
  process.env.APP_URL = 'https://app.example.com';
  assert.equal(mail.isMailConfigured(), true);
  delete process.env.RESEND_API_KEY;
  assert.equal(mail.isMailConfigured(), false);                       // missing key
  process.env.MAIL_PROVIDER = 'resend';
  process.env.RESEND_API_KEY = 'k';
  assert.equal(mail.isMailConfigured(), true);
  delete process.env.APP_URL;
  assert.equal(mail.isMailConfigured(), false);                       // key and from alone are not enough
  process.env.APP_URL = 'https://app.example.com';
  process.env.MAIL_PROVIDER = 'console';
  delete process.env.RESEND_API_KEY; delete process.env.MAIL_FROM; delete process.env.APP_URL;
  assert.equal(mail.isMailConfigured(), true);                        // console needs nothing (not even APP_URL)
  process.env.MAIL_PROVIDER = 'carrier-pigeon';
  assert.equal(mail.isMailConfigured(), false);                       // unknown provider
});

test('sendMail with the console provider logs the link and records the message', async () => {
  process.env.MAIL_PROVIDER = 'console';
  const logged = []; console.log = (...a) => logged.push(a.join(' '));
  const r = await mail.sendMail({ to: 'x@example.com', subject: 'Hi', text: 'Click https://app.example/verify.html?token=abc' });
  assert.deepEqual(r, { ok: true });
  assert.equal(mail.sendMail.outbox.length, 1);
  assert.deepEqual(mail.sendMail.outbox[0], { to: 'x@example.com', subject: 'Hi', text: 'Click https://app.example/verify.html?token=abc' });
  assert.ok(logged.join('\n').includes('https://app.example/verify.html?token=abc'));
});

test('sendMail with Resend posts to the API with a Bearer key', async () => {
  process.env.RESEND_API_KEY = 'rk_test'; process.env.MAIL_FROM = 'DartDraw <noreply@example.com>'; process.env.APP_URL = 'https://app.example.com';
  let seen;
  global.fetch = async (url, init) => { seen = { url, init }; return { ok: true, status: 200 }; };
  const r = await mail.sendMail({ to: 'x@example.com', subject: 'S', text: 'T' });
  assert.deepEqual(r, { ok: true });
  assert.equal(seen.url, 'https://api.resend.com/emails');
  assert.equal(seen.init.method, 'POST');
  assert.equal(seen.init.headers.Authorization, 'Bearer rk_test');
  assert.equal(seen.init.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(seen.init.body), { from: 'DartDraw <noreply@example.com>', to: ['x@example.com'], subject: 'S', text: 'T' });
  assert.equal(mail.sendMail.outbox.length, 0);
});

test('sendMail never throws: failures give { ok: false }', async () => {
  process.env.RESEND_API_KEY = 'rk_test'; process.env.MAIL_FROM = 'a@example.com'; process.env.APP_URL = 'https://app.example.com';
  global.fetch = async () => ({ ok: false, status: 403 });
  assert.deepEqual(await mail.sendMail({ to: 'x@example.com', subject: 'S', text: 'T' }), { ok: false });
  global.fetch = async () => { throw new Error('network down'); };
  assert.deepEqual(await mail.sendMail({ to: 'x@example.com', subject: 'S', text: 'T' }), { ok: false });
  delete process.env.MAIL_FROM;                                       // not configured: no fetch at all
  let called = false; global.fetch = async () => { called = true; return { ok: true }; };
  assert.deepEqual(await mail.sendMail({ to: 'x@example.com', subject: 'S', text: 'T' }), { ok: false });
  assert.equal(called, false);
});

test('appUrl uses APP_URL without trailing slashes, else the request host', () => {
  process.env.APP_URL = 'https://dartdraw.example.com///';
  assert.equal(mail.appUrl({ headers: { host: 'ignored.example' } }), 'https://dartdraw.example.com');
  delete process.env.APP_URL;
  assert.equal(mail.appUrl({ headers: { host: 'my-app.vercel.app' } }), 'https://my-app.vercel.app');
});

// ---- accounts ----

test('normalizeEmail trims and lower-cases', () => {
  assert.equal(accounts.normalizeEmail('  Bob@Example.COM '), 'bob@example.com');
  assert.equal(accounts.normalizeEmail(undefined), '');
  assert.equal(accounts.normalizeEmail(null), '');
});

test('createOrganizer applies defaults and leaves the email unverified', async () => {
  const o = await accounts.createOrganizer({ email: ' New@Example.com ', name: 'New', passwordHash: 'hash' });
  assert.deepEqual(Object.keys(o).sort(), ['email', 'id', 'name', 'role', 'tier']);
  assert.equal(o.email, 'new@example.com'); assert.equal(o.role, 'organizer'); assert.equal(o.tier, 'basic');
  const row = db.tables.organizers.find((r) => r.id === o.id);
  assert.equal(row.email_verified_at, null);
  assert.equal(row.password_hash, 'hash');
});

test('createOrganizer with verified, role and tier', async () => {
  const o = await accounts.createOrganizer({ email: 'adm@example.com', name: 'Adm', passwordHash: 'h', role: 'admin', tier: 'pro', verified: true });
  assert.equal(o.role, 'admin'); assert.equal(o.tier, 'pro');
  assert.ok(db.tables.organizers.find((r) => r.id === o.id).email_verified_at);
});

test('findByEmail normalises and returns the full row; findById; misses are undefined', async () => {
  const byMail = await accounts.findByEmail('  A@EXAMPLE.com');
  assert.equal(byMail.id, 'org1'); assert.equal(byMail.password_hash, 'x');
  assert.equal(await accounts.findByEmail('nobody@example.com'), undefined);
  assert.equal((await accounts.findById('org1')).email, 'a@example.com');
  assert.equal(await accounts.findById('nope'), undefined);
});

test('toSessionUser exposes only the public fields', () => {
  const u = accounts.toSessionUser({ id: 'i', email: 'e', name: 'n', role: 'admin', tier: 'pro', password_hash: 'secret', token_version: 3 });
  assert.deepEqual(u, { id: 'i', email: 'e', name: 'n', role: 'admin', tier: 'pro' });
});

// ---- test harness sanity ----

test('callHandler builds req/res doubles', async () => {
  let seenReq;
  const r = await callHandler(async (req, res) => {
    seenReq = req;
    res.setHeader('Set-Cookie', 'a=b');
    res.status(201).json({ ok: true });
  }, { method: 'POST', body: { x: 1 }, query: { q: '1' }, headers: { 'X-Forwarded-For': '1.1.1.1' }, cookies: { c: 'd' } });
  assert.equal(r.statusCode, 201);
  assert.deepEqual(r.body, { ok: true });
  assert.equal(r.headers['set-cookie'], 'a=b');
  assert.equal(seenReq.method, 'POST'); assert.deepEqual(seenReq.body, { x: 1 });
  assert.deepEqual(seenReq.cookies, { c: 'd' }); assert.equal(seenReq.headers['x-forwarded-for'], '1.1.1.1');
  const e = await callHandler(async (req, res) => { res.status(204).end(); });
  assert.equal(e.statusCode, 204); assert.ok(e.ended);
});

test('the fake db fails loudly on a statement it does not know', async () => {
  await assert.rejects(() => db.sql`SELECT 1 FROM somewhere_else`, /unrecognised SQL/);
});

// ---- fix round: peekToken, hit, replaceUnverifiedCredentials ----

test('peekToken reports whose token it is without consuming it; same validity rules as consumeToken', async () => {
  const raw = await tokens.issueToken('org1', 'verify');
  assert.deepEqual(await tokens.peekToken(raw, ['verify']), { organizerId: 'org1', kind: 'verify' });
  assert.deepEqual(await tokens.peekToken(raw, ['verify']), { organizerId: 'org1', kind: 'verify' }, 'still there');
  assert.equal(db.tables.auth_tokens[0].used_at, null);
  assert.equal(await tokens.peekToken(raw, ['reset']), null, 'wrong kind');
  assert.equal(await tokens.peekToken('0'.repeat(64), ['verify']), null);
  assert.equal(await tokens.peekToken(undefined, ['verify']), null);
  assert.equal(await tokens.peekToken({ $ne: 1 }, ['verify']), null);
  assert.deepEqual(await tokens.consumeToken(raw, ['verify']), { organizerId: 'org1', kind: 'verify' });
  assert.equal(await tokens.peekToken(raw, ['verify']), null, 'used');
  const raw2 = await tokens.issueToken('org1', 'verify');
  db.advance(tokens.LIFETIMES_MS.verify + 1);
  assert.equal(await tokens.peekToken(raw2, ['verify']), null, 'expired');
  assert.ok(db.calls.filter((c) => /^SELECT organizer_id, kind FROM auth_tokens/i.test(c.text)).length > 0);
});

test('throttle.hit counts first and says "over" only past the limit; concurrent callers cannot all slip under', async () => {
  const W = 1000;
  assert.equal(await throttle.hit('h', 3, W), false);   // 1
  assert.equal(await throttle.hit('h', 3, W), false);   // 2
  assert.equal(await throttle.hit('h', 3, W), false);   // 3 = at the limit, still allowed
  assert.equal(await throttle.hit('h', 3, W), true);    // 4 = over
  db.advance(W + 1);
  assert.equal(await throttle.hit('h', 3, W), false);   // new window
  const results = await Promise.all(Array.from({ length: 12 }, () => throttle.hit('c', 5, W)));
  assert.equal(results.filter((over) => !over).length, 5);
});

test('replaceUnverifiedCredentials changes name and password only while the email is unverified', async () => {
  db.tables.organizers.push({ id: 'u1', email: 'u@example.com', name: 'Old', password_hash: 'h1', email_verified_at: null });
  db.tables.organizers.push({ id: 'v1', email: 'v@example.com', name: 'Vee', password_hash: 'hv', email_verified_at: new Date() });
  assert.equal(await accounts.replaceUnverifiedCredentials('u1', 'New', 'h2'), true);
  assert.equal(db.tables.organizers.find((o) => o.id === 'u1').name, 'New');
  assert.equal(db.tables.organizers.find((o) => o.id === 'u1').password_hash, 'h2');
  assert.equal(await accounts.replaceUnverifiedCredentials('v1', 'Evil', 'hx'), false);
  assert.equal(db.tables.organizers.find((o) => o.id === 'v1').password_hash, 'hv');
  assert.equal(db.tables.organizers.find((o) => o.id === 'v1').name, 'Vee');
});

test('BCRYPT_COST is 10 and DUMMY_HASH is a real hash at that cost', () => {
  const bcrypt = require('bcryptjs');
  assert.equal(accounts.BCRYPT_COST, 10);
  assert.equal(bcrypt.getRounds(accounts.DUMMY_HASH), accounts.BCRYPT_COST);
});

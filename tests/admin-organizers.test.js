const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { createFakeDb } = require('./lib/fake-db');
const { callHandler } = require('./lib/call-handler');

// Route api/_lib/db.js to a per-test fake database (the real auth, accounts and token code run against it).
const dbPath = require.resolve('../api/_lib/db');
let db;
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
  sql: (...args) => db.sql(...args),
} };

const auth = require('../api/_lib/auth');
const accounts = require('../api/_lib/accounts');
const mail = require('../api/_lib/mail');
const listHandler = require('../api/_routes/admin/organizers/index');
const itemHandler = require('../api/_routes/admin/organizers/[id]');
const resetLinkHandler = require('../api/_routes/admin/organizers/[id]/reset-link');
const transferHandler = require('../api/_routes/admin/organizers/[id]/transfer');
const resetHandler = require('../api/_routes/auth/reset');
const loginHandler = require('../api/_routes/auth/login');

const SECRET = 'test-secret-for-admin-organizers';
const COOKIE = '__Host-session';
const ENV_KEYS = ['SESSION_SECRET', 'REQUIRE_LOGIN', 'MAIL_PROVIDER', 'RESEND_API_KEY', 'MAIL_FROM', 'APP_URL', 'AUTH_MIN_RESPONSE_MS'];
let savedEnv;
let savedFetch;

const STAMP = new Date('2026-10-10T09:00:00.000Z');
const FINAL = { at: '2026-10-11T09:00:00.000Z' };
const PUBLIC_EMAIL = 'public@dartdraw.local';

function row(over) {
  return Object.assign({
    id: 'org1', email: 'a@example.com', name: 'Alice', password_hash: 'x',
    role: 'organizer', tier: 'basic', suspended: false,
    email_verified_at: new Date('2026-01-01T00:00:00Z'), token_version: 0,
    created_at: new Date('2026-02-01T00:00:00Z'),
  }, over);
}
const tournament = (id, owner, data) => ({ id, created_by: owner, data: data || { name: id }, updated_at: STAMP });
const cookieFor = (o) => ({ [COOKIE]: jwt.sign({ sub: o.id, email: o.email, name: o.name, tv: o.token_version }, SECRET, { expiresIn: 600 }) });
const byId = (id) => db.tables.organizers.find((o) => o.id === id);
const asAdmin = () => cookieFor(byId('adm1'));

beforeEach(() => {
  savedEnv = {}; ENV_KEYS.forEach((k) => { savedEnv[k] = process.env[k]; delete process.env[k]; });
  savedFetch = global.fetch;
  process.env.SESSION_SECRET = SECRET;
  process.env.REQUIRE_LOGIN = 'true';
  process.env.MAIL_PROVIDER = 'console';
  process.env.APP_URL = 'https://app.example.test/';
  process.env.AUTH_MIN_RESPONSE_MS = '0';
  db = createFakeDb({
    organizers: [
      row({ id: 'pub', email: PUBLIC_EMAIL, name: 'Public', password_hash: 'disabled', created_at: new Date('2026-01-01T00:00:00Z') }),
      row({ id: 'adm1', email: 'root@example.com', name: 'Root', role: 'admin', tier: 'basic', created_at: new Date('2026-01-02T00:00:00Z') }),
      row({ id: 'adm2', email: 'second@example.com', name: 'Second', role: 'admin', tier: 'pro', created_at: new Date('2026-01-03T00:00:00Z') }),
      row({ id: 'org1', created_at: new Date('2026-02-01T00:00:00Z') }),
      row({ id: 'org2', email: 'b@example.com', name: 'Bob', tier: 'pro', created_at: new Date('2026-03-01T00:00:00Z') }),
      row({ id: 'orgU', email: 'u@example.com', name: 'Una', email_verified_at: null, created_at: new Date('2026-04-01T00:00:00Z') }),
      row({ id: 'orgS', email: 's@example.com', name: 'Sam', suspended: true, created_at: new Date('2026-05-01T00:00:00Z') }),
    ],
    tournaments: [
      tournament('t1', 'org1', { name: 'One', entriesList: [{ id: 'e1' }] }),
      tournament('t2', 'org1', { name: 'Closed', finalized: FINAL, published: true }),
      tournament('t3', 'org2', { name: 'Three' }),
    ],
  });
  auth._resetPublicOrganizerCache();
  mail.sendMail.outbox.length = 0;
  console._log = console._log || console.log;
  console.log = () => {};
});
afterEach(() => {
  console.log = console._log;
  global.fetch = savedFetch;
  ENV_KEYS.forEach((k) => { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; });
});

const get = (handler, opts) => callHandler(handler, Object.assign({ method: 'GET' }, opts));
const post = (handler, body, opts) => callHandler(handler, Object.assign({ method: 'POST', body }, opts));
const patch = (id, body, opts) => callHandler(itemHandler, Object.assign({ method: 'PATCH', body, query: { id }, cookies: asAdmin() }, opts));
const del = (id, opts) => callHandler(itemHandler, Object.assign({ method: 'DELETE', query: { id }, cookies: asAdmin() }, opts));
const create = (body, opts) => post(listHandler, body, Object.assign({ cookies: asAdmin() }, opts));
const resetLink = (id, opts) => post(resetLinkHandler, undefined, Object.assign({ query: { id }, cookies: asAdmin() }, opts));
const transfer = (id, body, opts) => post(transferHandler, body, Object.assign({ query: { id }, cookies: asAdmin() }, opts));
const tokenOf = (link) => (link.match(/token=([0-9a-f]+)/) || [])[1];
const goodNew = (over) => Object.assign({ name: 'Newbie', email: 'new@example.com', tier: 'basic' }, over);

// ---- access control on every route ----

const ROUTES = [
  ['GET /api/admin/organizers', (o) => callHandler(listHandler, Object.assign({ method: 'GET' }, o))],
  ['POST /api/admin/organizers', (o) => callHandler(listHandler, Object.assign({ method: 'POST', body: goodNew() }, o))],
  ['PATCH /api/admin/organizers/:id', (o) => callHandler(itemHandler, Object.assign({ method: 'PATCH', query: { id: 'org1' }, body: { tier: 'pro' } }, o))],
  ['DELETE /api/admin/organizers/:id', (o) => callHandler(itemHandler, Object.assign({ method: 'DELETE', query: { id: 'orgU' } }, o))],
  ['POST .../reset-link', (o) => callHandler(resetLinkHandler, Object.assign({ method: 'POST', query: { id: 'org1' } }, o))],
  ['POST .../transfer', (o) => callHandler(transferHandler, Object.assign({ method: 'POST', query: { id: 'org1' }, body: { toOrganizerId: 'org2' } }, o))],
];

for (const [name, call] of ROUTES) {
  test(name + ': 401 without a session, 403 for an organiser, nothing changes', async () => {
    const before = JSON.stringify(db.tables);
    const none = await call({});
    assert.equal(none.statusCode, 401);
    assert.deepEqual(none.body, { error: 'Not authenticated' });
    const org = await call({ cookies: cookieFor(byId('org1')) });
    assert.equal(org.statusCode, 403);
    assert.deepEqual(org.body, { error: 'Admin only.' });
    assert.equal(JSON.stringify(db.tables), before);
  });

  test(name + ': a suspended admin, an unverified admin and a stale-session admin are rejected', async () => {
    const cookies = cookieFor(byId('adm1'));
    byId('adm1').suspended = true;
    assert.equal((await call({ cookies })).statusCode, 401);
    byId('adm1').suspended = false;
    byId('adm1').email_verified_at = null;
    assert.equal((await call({ cookies })).statusCode, 401);
    byId('adm1').email_verified_at = new Date('2026-01-01T00:00:00Z');
    byId('adm1').token_version = 5;
    assert.equal((await call({ cookies })).statusCode, 401);
  });

  test(name + ': in the shared-Public fallback (REQUIRE_LOGIN not true) it answers 403', async () => {
    delete process.env.REQUIRE_LOGIN;
    const r = await call({ cookies: asAdmin() });
    assert.equal(r.statusCode, 403);
    assert.deepEqual(r.body, { error: 'Admin only.' });
  });
}

test('other methods are 405 on every route (after the admin check)', async () => {
  const c = { cookies: asAdmin() };
  assert.equal((await callHandler(listHandler, Object.assign({ method: 'PUT' }, c))).statusCode, 405);
  assert.equal((await callHandler(listHandler, Object.assign({ method: 'DELETE' }, c))).statusCode, 405);
  assert.equal((await callHandler(itemHandler, Object.assign({ method: 'GET', query: { id: 'org1' } }, c))).statusCode, 405);
  assert.equal((await callHandler(itemHandler, Object.assign({ method: 'POST', query: { id: 'org1' } }, c))).statusCode, 405);
  assert.equal((await callHandler(resetLinkHandler, Object.assign({ method: 'GET', query: { id: 'org1' } }, c))).statusCode, 405);
  assert.equal((await callHandler(transferHandler, Object.assign({ method: 'PATCH', query: { id: 'org1' } }, c))).statusCode, 405);
  assert.equal((await callHandler(transferHandler, Object.assign({ method: 'GET', query: { id: 'org1' } }, c))).statusCode, 405);
});

// ---- tier shown to the browser ----

test('toSessionUser, createOrganizer and the login response all show the effective tier (an admin is pro)', async () => {
  assert.equal(accounts.toSessionUser({ id: 'i', email: 'e', name: 'n', role: 'admin', tier: 'basic' }).tier, 'pro');
  assert.equal(accounts.toSessionUser({ id: 'i', email: 'e', name: 'n', role: 'organizer', tier: 'basic' }).tier, 'basic');
  assert.equal(accounts.toSessionUser({ id: 'i', email: 'e', name: 'n', role: 'organizer', tier: 'pro' }).tier, 'pro');
  const made = await accounts.createOrganizer({ email: 'x@example.com', name: 'X', passwordHash: 'h', role: 'admin', tier: 'basic', verified: true });
  assert.equal(made.tier, 'pro');
  byId('adm1').password_hash = bcrypt.hashSync('correct-horse', 4);
  const r = await post(loginHandler, { email: 'root@example.com', password: 'correct-horse' });
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.tier, 'pro');
  assert.equal(r.body.role, 'admin');
});

// ---- GET list ----

test('GET lists every organiser except the Public row, newest first, with the contract shape', async () => {
  const r = await get(listHandler, { cookies: asAdmin() });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.body.organizers.map((o) => o.id), ['orgS', 'orgU', 'org2', 'org1', 'adm2', 'adm1']);
  assert.ok(!JSON.stringify(r.body).includes(PUBLIC_EMAIL));
  const alice = r.body.organizers.find((o) => o.id === 'org1');
  assert.deepEqual(alice, {
    id: 'org1', email: 'a@example.com', name: 'Alice', role: 'organizer', tier: 'basic', effectiveTier: 'basic',
    suspended: false, verified: true, createdAt: '2026-02-01T00:00:00.000Z', eventCount: 2,
  });
});

test('GET: event counts, suspended and verified flags, effective tier of an admin, no secrets', async () => {
  const list = (await get(listHandler, { cookies: asAdmin() })).body.organizers;
  const of = (id) => list.find((o) => o.id === id);
  assert.equal(of('org2').eventCount, 1);
  assert.equal(of('adm1').eventCount, 0);
  assert.equal(of('orgS').suspended, true);
  assert.equal(of('orgU').verified, false);
  assert.equal(of('adm1').tier, 'basic');
  assert.equal(of('adm1').effectiveTier, 'pro');
  assert.equal(of('adm1').role, 'admin');
  assert.equal(of('org2').effectiveTier, 'pro');
  const text = JSON.stringify(list);
  assert.ok(!/password|token_version|hash/i.test(text));
  list.forEach((o) => assert.deepEqual(Object.keys(o).sort(), ['createdAt', 'effectiveTier', 'email', 'eventCount', 'id', 'name', 'role', 'suspended', 'tier', 'verified']));
});

// ---- POST create ----

test('POST creates a verified account with an unusable password, an invite token and a 7-day link', async () => {
  const r = await create(goodNew({ name: '  Newbie  ', email: '  New@Example.com ', tier: 'pro' }));
  assert.equal(r.statusCode, 201);
  assert.equal(r.body.organizer.email, 'new@example.com');
  assert.equal(r.body.organizer.name, 'Newbie');
  assert.equal(r.body.organizer.tier, 'pro');
  assert.equal(r.body.organizer.role, 'organizer');
  assert.equal(r.body.organizer.verified, true);
  assert.equal(r.body.organizer.eventCount, 0);
  assert.equal(r.body.organizer.suspended, false);
  assert.match(r.body.link, /^https:\/\/app\.example\.test\/reset\.html\?token=[0-9a-f]{64}$/);
  const stored = db.tables.organizers.find((o) => o.email === 'new@example.com');
  assert.equal(stored.password_hash, 'disabled');
  assert.ok(stored.email_verified_at);
  const tok = db.tables.auth_tokens.find((t) => t.organizer_id === stored.id);
  assert.equal(tok.kind, 'invite');
  assert.equal(tok.token_hash, require('../api/_lib/tokens').hashToken(tokenOf(r.body.link)));
  assert.equal(tok.expires_at.getTime() - db.now().getTime(), 7 * 24 * 60 * 60 * 1000);
});

test('POST emails the link when mail is configured', async () => {
  const r = await create(goodNew());
  assert.equal(mail.sendMail.outbox.length, 1);
  assert.equal(mail.sendMail.outbox[0].to, 'new@example.com');
  assert.ok(mail.sendMail.outbox[0].text.includes(r.body.link));
});

test('POST sends no email when mail is not configured, but still answers with the link', async () => {
  process.env.MAIL_PROVIDER = 'resend'; // no key, from or app url set -> not configured
  delete process.env.APP_URL;
  const r = await create(goodNew(), { headers: { host: 'dart.example.test' } });
  assert.equal(r.statusCode, 201);
  assert.equal(mail.sendMail.outbox.length, 0);
  assert.match(r.body.link, /^https:\/\/dart\.example\.test\/reset\.html\?token=[0-9a-f]{64}$/);
});

test('POST still answers 201 when the mail provider fails', async () => {
  process.env.MAIL_PROVIDER = 'resend';
  process.env.RESEND_API_KEY = 'k'; process.env.MAIL_FROM = 'DartDraw <no-reply@example.test>';
  global.fetch = async () => { throw new Error('network down'); };
  const r = await create(goodNew());
  assert.equal(r.statusCode, 201);
  assert.ok(r.body.link);
  assert.ok(db.tables.organizers.find((o) => o.email === 'new@example.com'));
  global.fetch = async () => ({ ok: false, status: 500 });
  const r2 = await create(goodNew({ email: 'second-new@example.com' }));
  assert.equal(r2.statusCode, 201);
});

test('POST: an existing email (any case or spacing, the Public address included) is 409', async () => {
  const msg = { error: 'An account with that email already exists.' };
  for (const email of ['a@example.com', ' A@EXAMPLE.COM ', 'root@example.com', PUBLIC_EMAIL, 's@example.com']) {
    const r = await create(goodNew({ email }));
    assert.equal(r.statusCode, 409, email);
    assert.deepEqual(r.body, msg);
  }
  assert.equal(db.tables.organizers.length, 7);
});

test('POST: a unique-violation raised by the database (a race) is also 409', async () => {
  const real = db.sql;
  db.sql = (strings, ...vals) => {
    if (/^\s*INSERT INTO organizers \(email, password_hash, name, role, tier/.test(strings.join('?'))) {
      const err = new Error('duplicate key value violates unique constraint "organizers_email_key"');
      err.code = '23505';
      return Promise.reject(err);
    }
    return real(strings, ...vals);
  };
  const r = await create(goodNew());
  assert.equal(r.statusCode, 409);
  assert.deepEqual(r.body, { error: 'An account with that email already exists.' });
});

test('POST validation: name 1-80, email shape <= 254, tier basic|pro, a body is required', async () => {
  const bad = [
    goodNew({ name: '' }), goodNew({ name: '   ' }), goodNew({ name: 'x'.repeat(81) }), goodNew({ name: 7 }), goodNew({ name: undefined }),
    goodNew({ email: 'nope' }), goodNew({ email: 'a@b' }), goodNew({ email: '' }), goodNew({ email: undefined }), goodNew({ email: 5 }),
    goodNew({ email: 'a'.repeat(250) + '@x.io' }),
    goodNew({ tier: 'platinum' }), goodNew({ tier: undefined }), goodNew({ tier: 'admin' }), goodNew({ tier: null }),
    undefined, null, 'string', [],
  ];
  for (const body of bad) {
    const r = await create(body);
    assert.equal(r.statusCode, 400, JSON.stringify(body));
    assert.equal(typeof r.body.error, 'string');
  }
  assert.equal(db.tables.organizers.length, 7);
  assert.equal(db.tables.auth_tokens.length, 0);
  assert.equal((await create(goodNew({ name: 'x'.repeat(80), email: 'ok@example.com' }))).statusCode, 201);
});

test('POST: the invite link works through the existing reset endpoint to set a password, then the new organiser signs in', async () => {
  const r = await create(goodNew());
  const token = tokenOf(r.body.link);
  const before = await post(loginHandler, { email: 'new@example.com', password: 'disabled' });
  assert.equal(before.statusCode, 401);
  const set = await post(resetHandler, { token, password: 'brand-new-pass' });
  assert.equal(set.statusCode, 200);
  const login = await post(loginHandler, { email: 'new@example.com', password: 'brand-new-pass' });
  assert.equal(login.statusCode, 200);
  assert.equal(login.body.tier, 'basic');
  assert.equal((await post(resetHandler, { token, password: 'another-pass-1' })).statusCode, 400, 'single use');
});

// ---- PATCH ----

test('PATCH changes the tier and returns the organiser', async () => {
  const r = await patch('org1', { tier: 'pro' });
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.organizer.id, 'org1');
  assert.equal(r.body.organizer.tier, 'pro');
  assert.equal(r.body.organizer.effectiveTier, 'pro');
  assert.equal(r.body.organizer.eventCount, 2);
  assert.equal(byId('org1').tier, 'pro');
  assert.equal(byId('org1').token_version, 0, 'a tier change does not sign anyone out');
  assert.equal((await patch('org2', { tier: 'basic' })).body.organizer.effectiveTier, 'basic');
});

test('PATCH: an admin can change their own tier, and another admin\'s tier (no effect while they are an admin)', async () => {
  const self = await patch('adm1', { tier: 'pro' });
  assert.equal(self.statusCode, 200);
  assert.equal(byId('adm1').tier, 'pro');
  const other = await patch('adm2', { tier: 'basic' });
  assert.equal(other.statusCode, 200);
  assert.equal(other.body.organizer.tier, 'basic');
  assert.equal(other.body.organizer.effectiveTier, 'pro');
});

test('PATCH suspend: signs the organiser out at once (token_version bumped), reactivate lets them back', async () => {
  const cookies = cookieFor(byId('org2'));
  const ok = await callHandler(async (req, res) => { await auth.requireAuth(req, res); }, { cookies });
  assert.equal(ok.statusCode, 200);
  const r = await patch('org2', { suspended: true });
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.organizer.suspended, true);
  assert.equal(byId('org2').suspended, true);
  assert.equal(byId('org2').token_version, 1);
  const holder = {};
  const after = await callHandler(async (req, res) => { holder.who = await auth.requireAuth(req, res); }, { cookies });
  assert.equal(after.statusCode, 401);
  assert.equal(holder.who, null);
  const back = await patch('org2', { suspended: false });
  assert.equal(back.statusCode, 200);
  assert.equal(back.body.organizer.suspended, false);
  assert.equal(byId('org2').token_version, 1, 'reactivating does not need another bump');
  const stale = await callHandler(async (req, res) => { await auth.requireAuth(req, res); }, { cookies });
  assert.equal(stale.statusCode, 401, 'the old session stays dead after reactivation');
});

test('PATCH role: promote a verified organiser to admin, demote another admin (sessions die)', async () => {
  const up = await patch('org2', { role: 'admin' });
  assert.equal(up.statusCode, 200);
  assert.equal(up.body.organizer.role, 'admin');
  assert.equal(up.body.organizer.effectiveTier, 'pro');
  assert.equal(byId('org2').token_version, 0, 'promotion does not sign anyone out');
  const cookies = cookieFor(byId('adm2'));
  const down = await patch('adm2', { role: 'organizer' });
  assert.equal(down.statusCode, 200);
  assert.equal(down.body.organizer.role, 'organizer');
  assert.equal(down.body.organizer.effectiveTier, 'pro', 'stored pro tier applies again');
  assert.equal(byId('adm2').token_version, 1);
  const holder = {};
  const r = await callHandler(async (req, res) => { holder.who = await auth.requireAuth(req, res); }, { cookies });
  assert.equal(r.statusCode, 401);
});

test('PATCH several fields at once', async () => {
  const r = await patch('org1', { tier: 'pro', suspended: true });
  assert.equal(r.statusCode, 200);
  assert.equal(byId('org1').tier, 'pro');
  assert.equal(byId('org1').suspended, true);
  assert.equal(byId('org1').token_version, 1);
});

test('PATCH guard: nobody can change their own role or suspend themselves', async () => {
  const role = await patch('adm1', { role: 'organizer' });
  assert.equal(role.statusCode, 409);
  assert.equal(typeof role.body.error, 'string');
  const susp = await patch('adm1', { suspended: true });
  assert.equal(susp.statusCode, 409);
  assert.equal(typeof susp.body.error, 'string');
  const both = await patch('adm1', { tier: 'pro', role: 'organizer' });
  assert.equal(both.statusCode, 409);
  assert.equal(byId('adm1').role, 'admin');
  assert.equal(byId('adm1').suspended, false);
  assert.equal(byId('adm1').tier, 'basic', 'a refused request changes nothing at all');
  assert.equal(byId('adm1').token_version, 0);
});

test('PATCH guard: the last active admin cannot be demoted or suspended (even if another admin is still being counted)', async () => {
  // The caller is always an active admin themselves, so this can only be reached by a race;
  // simulate the other admin having just gone away by making the count see a single admin.
  const real = db.sql;
  db.sql = (strings, ...vals) => (/SELECT count\(\*\)::int AS n FROM organizers/.test(strings.join('?')) ? Promise.resolve([{ n: 1 }]) : real(strings, ...vals));
  const demote = await patch('adm2', { role: 'organizer' });
  assert.equal(demote.statusCode, 409);
  assert.match(demote.body.error, /at least one/i);
  const suspend = await patch('adm2', { suspended: true });
  assert.equal(suspend.statusCode, 409);
  assert.equal(byId('adm2').role, 'admin');
  assert.equal(byId('adm2').suspended, false);
  assert.equal(byId('adm2').token_version, 0);
  // Not an active admin (or not touching adminship): the count does not matter.
  assert.equal((await patch('org1', { suspended: true })).statusCode, 200);
  assert.equal((await patch('adm2', { tier: 'basic' })).statusCode, 200);
});

test('PATCH guard: only a verified account can be made an admin', async () => {
  const r = await patch('orgU', { role: 'admin' });
  assert.equal(r.statusCode, 409);
  assert.equal(typeof r.body.error, 'string');
  assert.equal(byId('orgU').role, 'organizer');
  assert.equal((await patch('orgU', { tier: 'pro' })).statusCode, 200, 'other changes to an unverified account are fine');
});

test('PATCH validation: at least one field, valid values only', async () => {
  const bad = [undefined, null, {}, [], { other: 1 }, { tier: 'platinum' }, { tier: 5 }, { tier: null }, { role: 'owner' }, { role: 'Admin' },
    { role: 1 }, { suspended: 'true' }, { suspended: 1 }, { suspended: null }, { tier: 'pro', role: 'god' }];
  for (const body of bad) {
    const r = await patch('org1', body);
    assert.equal(r.statusCode, 400, JSON.stringify(body));
    assert.equal(typeof r.body.error, 'string');
  }
  assert.equal(byId('org1').tier, 'basic');
  assert.equal(byId('org1').token_version, 0);
});

test('PATCH: an unknown id, the Public row and a malformed id are 404', async () => {
  for (const id of ['nope', 'pub', undefined, '']) {
    const r = await patch(id, { tier: 'pro' });
    assert.equal(r.statusCode, 404, String(id));
  }
  const real = db.sql;
  db.sql = (strings, ...vals) => {
    if (vals[0] === 'not-a-uuid') { const e = new Error('invalid input syntax for type uuid'); e.code = '22P02'; return Promise.reject(e); }
    return real(strings, ...vals);
  };
  assert.equal((await patch('not-a-uuid', { tier: 'pro' })).statusCode, 404);
  assert.equal(byId('pub').tier, 'basic');
});

// ---- POST reset-link ----

test('reset-link issues a reset token, answers with the link and emails it', async () => {
  const r = await resetLink('org1');
  assert.equal(r.statusCode, 200);
  assert.match(r.body.link, /^https:\/\/app\.example\.test\/reset\.html\?token=[0-9a-f]{64}$/);
  assert.deepEqual(Object.keys(r.body), ['link']);
  const tok = db.tables.auth_tokens.find((t) => t.organizer_id === 'org1');
  assert.equal(tok.kind, 'reset');
  assert.equal(tok.expires_at.getTime() - db.now().getTime(), 60 * 60 * 1000);
  assert.equal(mail.sendMail.outbox.length, 1);
  assert.equal(mail.sendMail.outbox[0].to, 'a@example.com');
  assert.ok(mail.sendMail.outbox[0].text.includes(r.body.link));
});

test('reset-link works through the reset endpoint (new password, sessions invalidated) and is single-use', async () => {
  const cookies = cookieFor(byId('org1'));
  const r = await resetLink('org1');
  const token = tokenOf(r.body.link);
  const set = await post(resetHandler, { token, password: 'fresh-password-1' });
  assert.equal(set.statusCode, 200);
  assert.equal(byId('org1').token_version, 1);
  const old = await callHandler(async (req, res) => { await auth.requireAuth(req, res); }, { cookies });
  assert.equal(old.statusCode, 401);
  assert.equal((await post(resetHandler, { token, password: 'fresh-password-2' })).statusCode, 400);
});

test('reset-link also works for an unverified account and sends no mail without mail configured', async () => {
  process.env.MAIL_PROVIDER = 'resend';
  delete process.env.APP_URL;
  const r = await resetLink('orgU');
  assert.equal(r.statusCode, 200);
  assert.equal(mail.sendMail.outbox.length, 0);
  assert.ok(tokenOf(r.body.link));
});

test('reset-link: still 200 when the mail provider fails', async () => {
  process.env.MAIL_PROVIDER = 'resend';
  process.env.RESEND_API_KEY = 'k'; process.env.MAIL_FROM = 'x@example.test';
  global.fetch = async () => { throw new Error('boom'); };
  const r = await resetLink('org1');
  assert.equal(r.statusCode, 200);
  assert.ok(r.body.link);
});

test('reset-link: the Public row and unknown ids are 404 and no token is issued', async () => {
  for (const id of ['pub', 'nope', undefined]) {
    const r = await resetLink(id);
    assert.equal(r.statusCode, 404, String(id));
  }
  assert.equal(db.tables.auth_tokens.length, 0);
});

test('reset-link: a suspended account is refused (the link would not work)', async () => {
  const r = await resetLink('orgS');
  assert.equal(r.statusCode, 409);
  assert.equal(typeof r.body.error, 'string');
  assert.equal(db.tables.auth_tokens.length, 0);
});

// ---- POST transfer ----

test('transfer moves exactly the source\'s events (a finalized one included) in one statement and touches nothing else', async () => {
  const before = JSON.parse(JSON.stringify(db.tables.tournaments));
  db.calls.length = 0;
  const r = await transfer('org1', { toOrganizerId: 'org2' });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.body, { moved: 2 });
  const after = db.tables.tournaments;
  assert.equal(after.find((t) => t.id === 't1').created_by, 'org2');
  assert.equal(after.find((t) => t.id === 't2').created_by, 'org2');
  assert.equal(after.find((t) => t.id === 't3').created_by, 'org2');
  assert.deepEqual(after.find((t) => t.id === 't2').data, { name: 'Closed', finalized: FINAL, published: true });
  after.forEach((t, i) => {
    assert.deepEqual(t.data, before[i].data);
    assert.equal(new Date(t.updated_at).getTime(), STAMP.getTime(), 'updated_at untouched');
    assert.equal(t.id, before[i].id);
  });
  assert.equal(db.calls.filter((c) => /^UPDATE tournaments SET created_by/.test(c.text)).length, 1);
  assert.equal(db.calls.filter((c) => /^UPDATE tournaments/.test(c.text) && /updated_at/.test(c.text)).length, 0);
});

test('transfer leaves other organisers\' events alone', async () => {
  const r = await transfer('org2', { toOrganizerId: 'org1' });
  assert.deepEqual(r.body, { moved: 1 });
  assert.equal(db.tables.tournaments.find((t) => t.id === 't1').created_by, 'org1');
  assert.equal(db.tables.tournaments.find((t) => t.id === 't3').created_by, 'org1');
});

test('transfer from an organiser with no events moves nothing; a suspended or unverified source is fine', async () => {
  assert.deepEqual((await transfer('adm1', { toOrganizerId: 'org1' })).body, { moved: 0 });
  assert.equal((await transfer('orgS', { toOrganizerId: 'org1' })).statusCode, 200);
  assert.equal((await transfer('orgU', { toOrganizerId: 'org1' })).statusCode, 200);
});

test('transfer to the same organiser is 400; a missing or non-string target is 400', async () => {
  assert.equal((await transfer('org1', { toOrganizerId: 'org1' })).statusCode, 400);
  for (const body of [undefined, null, {}, { toOrganizerId: '' }, { toOrganizerId: 7 }, { toOrganizerId: ['org2'] }, { toOrganizerId: null }]) {
    const r = await transfer('org1', body);
    assert.equal(r.statusCode, 400, JSON.stringify(body));
  }
  assert.ok(db.tables.tournaments.filter((t) => t.created_by === 'org1').length === 2);
});

test('transfer target rules: unknown or Public is 404, suspended is 409', async () => {
  assert.equal((await transfer('org1', { toOrganizerId: 'nope' })).statusCode, 404);
  assert.equal((await transfer('org1', { toOrganizerId: 'pub' })).statusCode, 404);
  const susp = await transfer('org1', { toOrganizerId: 'orgS' });
  assert.equal(susp.statusCode, 409);
  assert.equal(typeof susp.body.error, 'string');
  assert.equal(db.tables.tournaments.filter((t) => t.created_by === 'org1').length, 2);
});

test('transfer source rules: unknown id and the Public row are 404 and nothing moves', async () => {
  db.tables.tournaments.push(tournament('tp', 'pub'));
  assert.equal((await transfer('nope', { toOrganizerId: 'org1' })).statusCode, 404);
  assert.equal((await transfer('pub', { toOrganizerId: 'org1' })).statusCode, 404);
  assert.equal(db.tables.tournaments.find((t) => t.id === 'tp').created_by, 'pub');
});

test('transfer: a malformed target id is 404, a target removed during the request is 409', async () => {
  const real = db.sql;
  db.sql = (strings, ...vals) => {
    if (vals[0] === 'not-a-uuid') { const e = new Error('invalid input syntax for type uuid'); e.code = '22P02'; return Promise.reject(e); }
    if (/^\s*UPDATE tournaments SET created_by/.test(strings.join('?'))) { const e = new Error('violates foreign key constraint'); e.code = '23503'; return Promise.reject(e); }
    return real(strings, ...vals);
  };
  assert.equal((await transfer('org1', { toOrganizerId: 'not-a-uuid' })).statusCode, 404);
  assert.equal((await transfer('org1', { toOrganizerId: 'org2' })).statusCode, 409);
});

// ---- DELETE ----

test('DELETE removes an organiser who owns no events (204) along with their tokens', async () => {
  db.tables.auth_tokens.push({ id: 'tk', organizer_id: 'orgU', kind: 'verify', token_hash: 'h', expires_at: new Date(db.now().getTime() + 1000), used_at: null });
  const r = await del('orgU');
  assert.equal(r.statusCode, 204);
  assert.equal(r.body, undefined);
  assert.equal(byId('orgU'), undefined);
  assert.equal(db.tables.auth_tokens.length, 0);
  assert.equal(db.tables.organizers.length, 6);
});

test('DELETE is refused with 409 and the event count while they own events; nothing is lost', async () => {
  const r = await del('org1');
  assert.equal(r.statusCode, 409);
  assert.deepEqual(r.body, { error: 'Transfer or delete their events first.', eventCount: 2 });
  assert.ok(byId('org1'));
  assert.equal(db.tables.tournaments.length, 3);
  const r2 = await del('org2');
  assert.equal(r2.body.eventCount, 1);
});

test('DELETE after transferring their events works', async () => {
  assert.equal((await transfer('org1', { toOrganizerId: 'org2' })).statusCode, 200);
  assert.equal((await del('org1')).statusCode, 204);
  assert.equal(db.tables.tournaments.length, 3);
  assert.equal(byId('org1'), undefined);
});

test('DELETE: an event created during the request makes the database refuse, and the answer is the same 409', async () => {
  const real = db.sql;
  db.sql = (strings, ...vals) => {
    if (/DELETE FROM organizers/.test(strings.join('?'))) db.tables.tournaments.push(tournament('late', 'orgU'));
    return real(strings, ...vals);
  };
  const r = await del('orgU');
  assert.equal(r.statusCode, 409);
  assert.deepEqual(r.body, { error: 'Transfer or delete their events first.', eventCount: 1 });
  assert.ok(byId('orgU'));
});

test('DELETE guard: never the caller', async () => {
  const r = await del('adm1');
  assert.equal(r.statusCode, 409);
  assert.equal(typeof r.body.error, 'string');
  assert.ok(byId('adm1'));
});

test('DELETE guard: another admin can be deleted while two are active; the last active admin cannot', async () => {
  const real = db.sql;
  db.sql = (strings, ...vals) => (/SELECT count\(\*\)::int AS n FROM organizers/.test(strings.join('?')) ? Promise.resolve([{ n: 1 }]) : real(strings, ...vals));
  const blocked = await del('adm2');
  assert.equal(blocked.statusCode, 409);
  assert.match(blocked.body.error, /at least one/i);
  assert.ok(byId('adm2'));
  db.sql = real;
  const ok = await del('adm2');
  assert.equal(ok.statusCode, 204);
  assert.equal(byId('adm2'), undefined);
});

test('DELETE: the Public row and unknown ids are 404', async () => {
  for (const id of ['pub', 'nope', undefined]) {
    assert.equal((await del(id)).statusCode, 404, String(id));
  }
  assert.ok(byId('pub'));
});

test('a database failure is a 500 JSON error, not a crash', async () => {
  const real = db.sql;
  db.sql = (strings, ...vals) => (/FROM organizers o/.test(strings.join('?')) ? Promise.reject(new Error('db down')) : real(strings, ...vals));
  const r = await get(listHandler, { cookies: asAdmin() });
  assert.equal(r.statusCode, 500);
  assert.equal(typeof r.body.error, 'string');
});

// ---- the last-admin guard is part of the write statement (two requests racing each other) ----

const cookieOf = (id) => cookieFor(byId(id));
const activeAdmins = () => db.tables.organizers.filter((o) => o.role === 'admin' && !o.suspended && o.email_verified_at && o.password_hash !== 'disabled');

test('race: two admins demoting each other at the same moment leave exactly one admin', async () => {
  const [a, b] = await Promise.all([
    patch('adm2', { role: 'organizer' }, { cookies: cookieOf('adm1') }),
    patch('adm1', { role: 'organizer' }, { cookies: cookieOf('adm2') }),
  ]);
  assert.deepEqual([a.statusCode, b.statusCode].sort(), [200, 409]);
  const refused = a.statusCode === 409 ? a : b;
  assert.deepEqual(refused.body, { error: 'There must always be at least one active admin.' });
  assert.equal(activeAdmins().length, 1);
});

test('race: two admins suspending each other leave exactly one active admin', async () => {
  const [a, b] = await Promise.all([
    patch('adm2', { suspended: true }, { cookies: cookieOf('adm1') }),
    patch('adm1', { suspended: true }, { cookies: cookieOf('adm2') }),
  ]);
  assert.deepEqual([a.statusCode, b.statusCode].sort(), [200, 409]);
  assert.equal(activeAdmins().length, 1);
});

test('race: one admin suspending the other while the other demotes the first leaves exactly one active admin', async () => {
  const [a, b] = await Promise.all([
    patch('adm2', { suspended: true }, { cookies: cookieOf('adm1') }),
    patch('adm1', { role: 'organizer' }, { cookies: cookieOf('adm2') }),
  ]);
  assert.deepEqual([a.statusCode, b.statusCode].sort(), [200, 409]);
  assert.equal(activeAdmins().length, 1);
});

test('race: two admins deleting each other leave exactly one admin; the refused one is a 409 and the account stays', async () => {
  db.tables.tournaments.length = 0;
  const [a, b] = await Promise.all([
    del('adm2', { cookies: cookieOf('adm1') }),
    del('adm1', { cookies: cookieOf('adm2') }),
  ]);
  assert.deepEqual([a.statusCode, b.statusCode].sort(), [204, 409]);
  assert.equal(db.tables.organizers.filter((o) => o.role === 'admin').length, 1);
});

test('the guard in the statement does not get in the way: demoting one of three admins, tier changes, and non-admin targets all work', async () => {
  db.tables.organizers.push(row({ id: 'adm3', email: 'third@example.com', name: 'Third', role: 'admin' }));
  const [a, b, c] = await Promise.all([
    patch('adm2', { role: 'organizer' }, { cookies: cookieOf('adm1') }),
    patch('org1', { suspended: true }),
    patch('adm3', { tier: 'pro' }),
  ]);
  assert.deepEqual([a.statusCode, b.statusCode, c.statusCode], [200, 200, 200]);
  assert.equal(byId('adm2').role, 'organizer');
});

test('an admin whose account has no usable password (invite not accepted yet) does not count as an active admin', async () => {
  const { activeAdminCount, isActiveAdmin } = require('../api/_lib/adminOrganizers');
  assert.equal(await activeAdminCount(), 2);
  byId('adm2').password_hash = 'disabled';
  assert.equal(await activeAdminCount(), 1);
  assert.equal(isActiveAdmin(byId('adm2')), false);
  assert.equal(isActiveAdmin(byId('adm1')), true);
  // with only one real admin left, the disabled one does not count as "another admin", so adm1 cannot be suspended
  const r = await patch('adm1', { suspended: true }, { cookies: cookieOf('adm2') });
  assert.equal(r.statusCode, 409);
  assert.equal(byId('adm1').suspended, false);
});

test('transfer: the source id in another letter case is still "the same organiser"', async () => {
  const r = await transfer('org1', { toOrganizerId: 'ORG1' });
  assert.equal(r.statusCode, 400);
  assert.equal(db.tables.tournaments.filter((t) => t.created_by === 'org1').length, 2);
});

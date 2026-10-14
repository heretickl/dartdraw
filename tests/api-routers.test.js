const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { createFakeDb } = require('./lib/fake-db');
const { callHandler } = require('./lib/call-handler');

// Route api/_lib/db.js to a per-test fake database (used by the real-handler tests at the end).
const dbPath = require.resolve('../api/_lib/db');
let db;
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
  sql: (...args) => db.sql(...args),
} };

const authRouter = require('../api/auth/[action]');
const adminRouter = require('../api/admin/[...route]');
const auth = require('../api/_lib/auth');

const UUID = '3f2b8c1e-5a4d-4e7b-9c6a-1d2e3f4a5b6c';
const AUTH_ACTIONS = ['login', 'logout', 'me', 'config', 'register', 'verify', 'resend-verification', 'forgot', 'reset', 'change-password'];
const ADMIN_FILES = ['organizers/index', 'organizers/[id]', 'organizers/[id]/reset-link', 'organizers/[id]/transfer', 'events/index', 'events/[id]', 'settings'];

// ---- stubbed handlers: which handler does each URL reach, and with what req.query ----

let calls;
const stubbed = [];
function stub(rel) {
  const file = require.resolve('../api/_routes/' + rel);
  stubbed.push({ file, previous: require.cache[file] });
  const fn = async (req, res) => { calls.push({ handler: rel, query: Object.assign({}, req.query), method: req.method }); res.status(200).json({ reached: rel }); };
  require.cache[file] = { id: file, filename: file, loaded: true, exports: fn };
}
function unstub() {
  while (stubbed.length) {
    const { file, previous } = stubbed.pop();
    if (previous) require.cache[file] = previous; else delete require.cache[file];
  }
}
const withStubs = () => { calls = []; AUTH_ACTIONS.forEach((a) => stub('auth/' + a)); ADMIN_FILES.forEach((f) => stub('admin/' + f)); };

const viaAuth = (url, o) => callHandler(authRouter, Object.assign({ method: 'GET', url }, o));
const viaAdmin = (url, o) => callHandler(adminRouter, Object.assign({ method: 'GET', url }, o));

test('auth router: each of the ten actions reaches its own handler', async () => {
  withStubs();
  try {
    for (const action of AUTH_ACTIONS) {
      const r = await viaAuth('/api/auth/' + action, { method: 'POST' });
      assert.equal(r.statusCode, 200, action);
      assert.deepEqual(r.body, { reached: 'auth/' + action }, action);
    }
    assert.equal(calls.length, AUTH_ACTIONS.length);
    assert.deepEqual(calls.map((c) => c.method), AUTH_ACTIONS.map(() => 'POST'));
  } finally { unstub(); }
});

test('auth router: query string and trailing slash do not matter; the action is read from the URL, not req.query', async () => {
  withStubs();
  try {
    let r = await viaAuth('/api/auth/verify?token=abc&x=1', { query: { token: 'abc', x: '1' } });
    assert.deepEqual(r.body, { reached: 'auth/verify' });
    assert.deepEqual(calls[0].query, { token: 'abc', x: '1' });
    r = await viaAuth('/api/auth/me/');
    assert.deepEqual(r.body, { reached: 'auth/me' });
    // A misleading req.query.action is ignored; the URL decides.
    r = await viaAuth('/api/auth/config', { query: { action: 'login' } });
    assert.deepEqual(r.body, { reached: 'auth/config' });
    // The platform's own query.action (the matched segment) is not passed on; the handlers never saw it before.
    r = await viaAuth('/api/auth/login', { query: { action: 'login' } });
    assert.deepEqual(r.body, { reached: 'auth/login' });
    assert.deepEqual(calls[calls.length - 1].query, {});
  } finally { unstub(); }
});

test('auth router: a request with no query object still gives the handler one', async () => {
  withStubs();
  try {
    const file = require.resolve('../api/_routes/auth/me');
    let seen;
    require.cache[file].exports = async (rq, rs) => { seen = rq.query; rs.status(200).json({}); };
    await authRouter({ method: 'GET', url: '/api/auth/me', headers: {} }, { status() { return { json() {} }; } });
    assert.deepEqual(seen, {});
  } finally { unstub(); }
});

test('auth router: unknown actions answer 404 { error: "Not found." } and reach no handler', async () => {
  withStubs();
  try {
    for (const url of ['/api/auth/nope', '/api/auth/', '/api/auth', '/api/auth/constructor', '/api/auth/__proto__', '/api/auth/LOGIN', '/api/auth/login%20', '/api/auth/toString']) {
      const r = await viaAuth(url);
      assert.equal(r.statusCode, 404, url);
      assert.deepEqual(r.body, { error: 'Not found.' }, url);
    }
    assert.equal((await callHandler(authRouter, { method: 'GET' })).statusCode, 404);   // no URL at all
    assert.equal(calls.length, 0);
  } finally { unstub(); }
});

test('admin router: every admin route reaches the right handler with the right req.query', async () => {
  withStubs();
  try {
    const cases = [
      ['/api/admin/organizers', 'admin/organizers/index', {}],
      ['/api/admin/organizers/', 'admin/organizers/index', {}],
      ['/api/admin/organizers/' + UUID, 'admin/organizers/[id]', { id: UUID }],
      ['/api/admin/organizers/' + UUID + '/reset-link', 'admin/organizers/[id]/reset-link', { id: UUID }],
      ['/api/admin/organizers/' + UUID + '/transfer', 'admin/organizers/[id]/transfer', { id: UUID }],
      ['/api/admin/events', 'admin/events/index', {}],
      ['/api/admin/events/t_abc123', 'admin/events/[id]', { id: 't_abc123' }],
      ['/api/admin/settings', 'admin/settings', {}],
    ];
    for (const [url, handler, query] of cases) {
      calls.length = 0;
      const r = await viaAdmin(url, { method: 'POST' });
      assert.equal(r.statusCode, 200, url);
      assert.deepEqual(r.body, { reached: handler }, url);
      assert.deepEqual(calls[0].query, query, url);
      assert.equal(calls[0].method, 'POST');
    }
  } finally { unstub(); }
});

test('admin router: query-string params are copied into req.query, never over the route id; the platform route key is dropped', async () => {
  withStubs();
  try {
    await viaAdmin('/api/admin/events?q=a%26b%20c&owner=o2&limit=50&offset=0');
    assert.deepEqual(calls[0].query, { q: 'a&b c', owner: 'o2', limit: '50', offset: '0' });

    await viaAdmin('/api/admin/events?q=x', { query: { route: ['events'], q: 'x' } });
    assert.deepEqual(calls[1].query, { q: 'x' });

    await viaAdmin('/api/admin/events/t_1?id=evil&foo=1');
    assert.deepEqual(calls[2].query, { foo: '1', id: 't_1' });
    assert.equal(calls[2].handler, 'admin/events/[id]');

    await viaAdmin('/api/admin/organizers/' + UUID + '?id=evil', { query: { id: 'evil' } });
    assert.deepEqual(calls[3].query, { id: UUID });

    await viaAdmin('/api/admin/events?owner=a&owner=b');
    assert.deepEqual(calls[4].query, { owner: ['a', 'b'] });
  } finally { unstub(); }
});

test('admin router: the id is decoded; a bad escape or an empty id is a 404', async () => {
  withStubs();
  try {
    await viaAdmin('/api/admin/events/t%5F1%20x');
    assert.equal(calls[0].query.id, 't_1 x');
    await viaAdmin('/api/admin/organizers/a%2Fb/transfer');
    assert.equal(calls[1].query.id, 'a/b');
    assert.equal(calls[1].handler, 'admin/organizers/[id]/transfer');
    const n = calls.length;
    for (const url of ['/api/admin/events/%E0%A4%A', '/api/admin/organizers/%zz', '/api/admin/organizers/%/reset-link']) {
      const r = await viaAdmin(url);
      assert.equal(r.statusCode, 404, url);
      assert.deepEqual(r.body, { error: 'Not found.' }, url);
    }
    assert.equal(calls.length, n);
  } finally { unstub(); }
});

test('admin router: unknown routes answer 404 { error: "Not found." } and reach no handler', async () => {
  withStubs();
  try {
    const urls = [
      '/api/admin', '/api/admin/', '/api/admin/nope', '/api/admin/organizers//', '/api/admin//organizers',
      '/api/admin/organizers/' + UUID + '/nope', '/api/admin/organizers/' + UUID + '/transfer/extra',
      '/api/admin/events/t_1/extra', '/api/admin/settings/extra', '/api/admin/constructor', '/api/admin/__proto__',
      '/api/auth/login', '/other', 'organizers',
    ];
    for (const url of urls) {
      const r = await viaAdmin(url);
      assert.equal(r.statusCode, 404, url);
      assert.deepEqual(r.body, { error: 'Not found.' }, url);
    }
    assert.equal((await callHandler(adminRouter, { method: 'GET' })).statusCode, 404);   // no URL at all
    assert.equal(calls.length, 0);
  } finally { unstub(); }
});

// ---- the real handlers behind the routers ----

const SECRET = 'test-secret-for-routers';
const COOKIE = '__Host-session';
const ENV_KEYS = ['SESSION_SECRET', 'REQUIRE_LOGIN'];
let savedEnv;
function row(over) {
  return Object.assign({
    id: 'org1', email: 'a@example.com', name: 'Alice', password_hash: 'x',
    role: 'organizer', tier: 'basic', suspended: false,
    email_verified_at: new Date('2026-01-01T00:00:00Z'), token_version: 0,
    created_at: new Date('2026-02-01T00:00:00Z'),
  }, over);
}
const cookieFor = (o) => ({ [COOKIE]: jwt.sign({ sub: o.id, email: o.email, name: o.name, tv: o.token_version }, SECRET, { expiresIn: 600 }) });
const byId = (id) => db.tables.organizers.find((o) => o.id === id);

beforeEach(() => {
  savedEnv = {}; ENV_KEYS.forEach((k) => { savedEnv[k] = process.env[k]; delete process.env[k]; });
  process.env.SESSION_SECRET = SECRET;
  process.env.REQUIRE_LOGIN = 'true';
  db = createFakeDb({ organizers: [row({ id: 'adm1', email: 'root@example.com', name: 'Root', role: 'admin' }), row({ id: 'org1' })] });
  auth._resetPublicOrganizerCache();
});
afterEach(() => {
  ENV_KEYS.forEach((k) => { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; });
});

const ADMIN_URLS = [
  ['GET', '/api/admin/organizers'],
  ['POST', '/api/admin/organizers'],
  ['PATCH', '/api/admin/organizers/' + UUID],
  ['DELETE', '/api/admin/organizers/' + UUID],
  ['POST', '/api/admin/organizers/' + UUID + '/reset-link'],
  ['POST', '/api/admin/organizers/' + UUID + '/transfer'],
  ['GET', '/api/admin/events?q=x'],
  ['POST', '/api/admin/events/t_1'],
  ['GET', '/api/admin/settings'],
  ['PUT', '/api/admin/settings'],
];

test('admin router: with the real handlers, no session is 401 and an organiser is 403 on every admin route', async () => {
  for (const [method, url] of ADMIN_URLS) {
    const none = await viaAdmin(url, { method, body: {} });
    assert.equal(none.statusCode, 401, method + ' ' + url);
    const org = await viaAdmin(url, { method, body: {}, cookies: cookieFor(byId('org1')) });
    assert.equal(org.statusCode, 403, method + ' ' + url);
    assert.deepEqual(org.body, { error: 'Admin only.' }, method + ' ' + url);
  }
});

test('admin router: with the real handlers an admin gets through, and the method check stays in the handler', async () => {
  const cookies = cookieFor(byId('adm1'));
  const settings = await viaAdmin('/api/admin/settings', { method: 'GET', cookies });
  assert.equal(settings.statusCode, 200);
  assert.deepEqual(settings.body.limits, { resultsDays: [1, 90], liveHours: [1, 168] });
  assert.equal((await viaAdmin('/api/admin/settings', { method: 'POST', cookies })).statusCode, 405);

  const list = await viaAdmin('/api/admin/organizers', { method: 'GET', cookies });
  assert.equal(list.statusCode, 200);
  assert.ok(list.body.organizers.some((o) => o.id === 'org1'));

  const events = await viaAdmin('/api/admin/events?q=x&limit=5', { method: 'GET', cookies });
  assert.equal(events.statusCode, 200);
  assert.deepEqual(events.body.events, []);
  assert.equal((await viaAdmin('/api/admin/events', { method: 'DELETE', cookies })).statusCode, 405);
});

test('auth router: with the real handlers, /api/auth/me needs a session and /api/auth/config answers', async () => {
  const none = await viaAuth('/api/auth/me');
  assert.equal(none.statusCode, 401);
  const me = await viaAuth('/api/auth/me', { cookies: cookieFor(byId('org1')) });
  assert.equal(me.statusCode, 200);
  assert.equal(me.body.id, 'org1');
  const cfg = await viaAuth('/api/auth/config');
  assert.equal(cfg.statusCode, 200);
  assert.equal((await viaAuth('/api/auth/login', { method: 'GET' })).statusCode, 405);
});

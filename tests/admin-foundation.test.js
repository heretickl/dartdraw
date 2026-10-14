const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { createFakeDb } = require('./lib/fake-db');
const { callHandler } = require('./lib/call-handler');

// Route api/_lib/db.js to a per-test fake database (real auth.js runs against it).
const dbPath = require.resolve('../api/_lib/db');
let db;
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
  sql: (...args) => db.sql(...args),
} };

const auth = require('../api/_lib/auth');
const { effectiveTier, entryLimitFor } = require('../api/_lib/tiers');
const meHandler = require('../api/_routes/auth/me');
const tournamentHandler = require('../api/tournaments/[id]');

const SECRET = 'test-secret-for-admin-foundation';
const COOKIE = '__Host-session';
const ENV_KEYS = ['SESSION_SECRET', 'REQUIRE_LOGIN', 'VIEWER_URL'];
let savedEnv;

const STAMP = '2026-10-10T09:00:00.000Z';
const FINAL = { at: '2026-10-11T09:00:00.000Z' };

function row(over) {
  return Object.assign({
    id: 'org1', email: 'a@example.com', name: 'Alice', password_hash: 'x',
    role: 'organizer', tier: 'basic', suspended: false,
    email_verified_at: new Date('2026-01-01T00:00:00Z'), token_version: 0,
  }, over);
}
const adminRow = (over) => row(Object.assign({ id: 'adm1', email: 'root@example.com', name: 'Root', role: 'admin', tier: 'basic' }, over));
const cookieFor = (o) => ({ [COOKIE]: jwt.sign({ sub: o.id, email: o.email, name: o.name, tv: o.token_version }, SECRET, { expiresIn: 600 }) });
const tournament = (id, owner, data) => ({ id, created_by: owner, data: data || { name: id }, updated_at: new Date(STAMP) });
const entries = (n) => Array.from({ length: n }, (_, i) => ({ id: 'e' + i, name: 'E' + i }));

beforeEach(() => {
  savedEnv = {}; ENV_KEYS.forEach((k) => { savedEnv[k] = process.env[k]; delete process.env[k]; });
  process.env.SESSION_SECRET = SECRET;
  process.env.REQUIRE_LOGIN = 'true';
  db = createFakeDb({
    organizers: [row(), adminRow()],
    tournaments: [
      tournament('t-alice', 'org1', { name: 'Alice cup', entriesList: entries(3) }),
      tournament('t-final', 'org1', { name: 'Closed', finalized: FINAL }),
    ],
  });
  auth._resetPublicOrganizerCache();
});
afterEach(() => {
  ENV_KEYS.forEach((k) => { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; });
});

// ---- effectiveTier ----

test('effectiveTier: admin is always pro; others keep a known stored tier; missing or unknown is basic', () => {
  assert.equal(effectiveTier({ role: 'admin', tier: 'basic' }), 'pro');
  assert.equal(effectiveTier({ role: 'admin', tier: 'pro' }), 'pro');
  assert.equal(effectiveTier({ role: 'admin' }), 'pro');
  assert.equal(effectiveTier({ role: 'organizer', tier: 'basic' }), 'basic');
  assert.equal(effectiveTier({ role: 'organizer', tier: 'pro' }), 'pro');
  assert.equal(effectiveTier({ tier: 'pro' }), 'pro');
  assert.equal(effectiveTier({ role: 'organizer' }), 'basic');
  assert.equal(effectiveTier({ role: 'organizer', tier: 'platinum' }), 'basic');
  assert.equal(effectiveTier({}), 'basic');
  assert.equal(effectiveTier(null), 'basic');
  assert.equal(effectiveTier(undefined), 'basic');
  assert.equal(effectiveTier({ role: 'Admin', tier: 'basic' }), 'basic', 'only the exact role admin counts');
});

test('entryLimitFor keeps its signature', () => {
  assert.equal(entryLimitFor('basic'), 64);
  assert.strictEqual(entryLimitFor('pro'), null);
  assert.equal(entryLimitFor(undefined), 64);
});

// ---- requireAuth / requireAdmin ----

async function run(fn, opts) {
  const holder = {};
  const r = await callHandler(async (req, res) => { holder.result = await fn(req, res); }, opts || {});
  return { result: holder.result, status: r.statusCode, body: r.body };
}

test('requireAuth returns tier pro and role admin for an admin whose stored tier is basic', async () => {
  const r = await run(auth.requireAuth, { cookies: cookieFor(db.tables.organizers[1]) });
  assert.deepEqual(r.result, { id: 'adm1', email: 'root@example.com', name: 'Root', role: 'admin', tier: 'pro' });
});

test('requireAuth leaves a normal organiser on the stored tier', async () => {
  const r = await run(auth.requireAuth, { cookies: cookieFor(db.tables.organizers[0]) });
  assert.equal(r.result.role, 'organizer');
  assert.equal(r.result.tier, 'basic');
});

test('requireAdmin: 401 with no cookie, nothing returned', async () => {
  const r = await run(auth.requireAdmin, {});
  assert.equal(r.result, null);
  assert.equal(r.status, 401);
  assert.deepEqual(r.body, { error: 'Not authenticated' });
});

test('requireAdmin: 403 for a signed-in organiser', async () => {
  const r = await run(auth.requireAdmin, { cookies: cookieFor(db.tables.organizers[0]) });
  assert.equal(r.result, null);
  assert.equal(r.status, 403);
  assert.deepEqual(r.body, { error: 'Admin only.' });
});

test('requireAdmin: returns the organiser object for an admin', async () => {
  const r = await run(auth.requireAdmin, { cookies: cookieFor(db.tables.organizers[1]) });
  assert.equal(r.status, 200);
  assert.deepEqual(r.result, { id: 'adm1', email: 'root@example.com', name: 'Root', role: 'admin', tier: 'pro' });
});

test('requireAdmin: role comes from the database, not from the token', async () => {
  const forged = { [COOKIE]: jwt.sign({ sub: 'org1', tv: 0, role: 'admin' }, SECRET) };
  const r = await run(auth.requireAdmin, { cookies: forged });
  assert.equal(r.result, null);
  assert.equal(r.status, 403);
});

test('requireAdmin: with REQUIRE_LOGIN unset nobody is an admin (403)', async () => {
  delete process.env.REQUIRE_LOGIN;
  const r = await run(auth.requireAdmin, { cookies: cookieFor(db.tables.organizers[1]) });
  assert.equal(r.result, null);
  assert.equal(r.status, 403);
  assert.deepEqual(r.body, { error: 'Admin only.' });
});

test('requireAdmin rejects a suspended admin, an unverified admin and a stale-session admin (401)', async () => {
  const cookies = cookieFor(db.tables.organizers[1]);
  assert.ok((await run(auth.requireAdmin, { cookies })).result);

  db.tables.organizers[1].suspended = true;
  let r = await run(auth.requireAdmin, { cookies });
  assert.equal(r.result, null); assert.equal(r.status, 401);
  db.tables.organizers[1].suspended = false;

  db.tables.organizers[1].email_verified_at = null;
  r = await run(auth.requireAdmin, { cookies });
  assert.equal(r.result, null); assert.equal(r.status, 401);
  db.tables.organizers[1].email_verified_at = new Date();

  db.tables.organizers[1].token_version = 1;   // sessions issued before were invalidated
  r = await run(auth.requireAdmin, { cookies });
  assert.equal(r.result, null); assert.equal(r.status, 401);
  assert.ok((await run(auth.requireAdmin, { cookies: cookieFor(db.tables.organizers[1]) })).result);
});

test('requireAdmin: a database failure is a 500, not a pass', async () => {
  const cookies = cookieFor(db.tables.organizers[1]);
  db.sql = async () => { throw new Error('boom'); };
  const r = await run(auth.requireAdmin, { cookies });
  assert.equal(r.result, null);
  assert.equal(r.status, 500);
});

// ---- /api/auth/me ----

test('me reports tier pro, entryLimit null and role admin for an admin with a stored basic tier', async () => {
  const r = await callHandler(meHandler, { cookies: cookieFor(db.tables.organizers[1]) });
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.role, 'admin');
  assert.equal(r.body.tier, 'pro');
  assert.strictEqual(r.body.entryLimit, null);
  assert.equal(db.tables.organizers[1].tier, 'basic', 'the stored column is untouched');
});

// ---- api/tournaments/[id].js for an admin ----

const call = (method, id, who, extra) => callHandler(tournamentHandler, Object.assign({
  method, query: { id }, cookies: cookieFor(who),
}, extra || {}));
const putBody = (data, stamp) => ({ body: { data, expectedUpdatedAt: stamp || STAMP } });
const alice = () => db.tables.organizers[0];
const admin = () => db.tables.organizers[1];
const stored = (id) => db.tables.tournaments.find((t) => t.id === id);

test('admin GET opens another organiser\'s event', async () => {
  const r = await call('GET', 't-alice', admin());
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.id, 't-alice');
  assert.equal(r.body.data.name, 'Alice cup');
});

test('admin GET of an unknown id is 404', async () => {
  assert.equal((await call('GET', 'nope', admin())).statusCode, 404);
});

test('non-admin GET of someone else\'s event is still 404; own event works', async () => {
  const bob = row({ id: 'org2', email: 'b@example.com', name: 'Bob' });
  db.tables.organizers.push(bob);
  assert.equal((await call('GET', 't-alice', bob)).statusCode, 404);
  assert.equal((await call('GET', 't-alice', alice())).statusCode, 200);
});

test('admin PUT updates another organiser\'s event and keeps the owner', async () => {
  const r = await call('PUT', 't-alice', admin(), putBody({ name: 'Edited by admin', entriesList: entries(3) }));
  assert.equal(r.statusCode, 200);
  assert.equal(stored('t-alice').data.name, 'Edited by admin');
  assert.equal(stored('t-alice').created_by, 'org1');
});

test('admin PUT with a stale stamp is 409 with the current row, nothing written', async () => {
  const r = await call('PUT', 't-alice', admin(), putBody({ name: 'Late' }, '2026-10-09T00:00:00.000Z'));
  assert.equal(r.statusCode, 409);
  assert.equal(r.body.current.id, 't-alice');
  assert.equal(stored('t-alice').data.name, 'Alice cup');
});

test('admin PUT with 65 active entries is allowed whatever the stored tier says', async () => {
  const r = await call('PUT', 't-alice', admin(), putBody({ name: 'Big', entriesList: entries(65) }));
  assert.equal(r.statusCode, 200);
  assert.equal(stored('t-alice').data.entriesList.length, 65);
  assert.equal(admin().tier, 'basic');
});

test('non-admin PUT on someone else\'s event is 404 and changes nothing', async () => {
  const bob = row({ id: 'org2', email: 'b@example.com', name: 'Bob' });
  db.tables.organizers.push(bob);
  const r = await call('PUT', 't-alice', bob, putBody({ name: 'Hijack' }));
  assert.equal(r.statusCode, 404);
  assert.equal(stored('t-alice').data.name, 'Alice cup');
  assert.equal(stored('t-alice').created_by, 'org1');
});

test('non-admin Basic organiser is still limited to 64 entries', async () => {
  const r = await call('PUT', 't-alice', alice(), putBody({ name: 'Big', entriesList: entries(65) }));
  assert.equal(r.statusCode, 403);
  assert.equal(r.body.code, 'entry_limit');
});

test('admin PUT for an unknown id inserts a row owned by the admin', async () => {
  const r = await call('PUT', 'fresh', admin(), { body: { data: { name: 'Mine' } } });
  assert.equal(r.statusCode, 201);
  assert.equal(stored('fresh').created_by, 'adm1');
});

test('admin PUT on a finalized event is refused with the existing 403 and nothing is written', async () => {
  const r = await call('PUT', 't-final', admin(), putBody({ name: 'Nope' }));
  assert.equal(r.statusCode, 403);
  assert.deepEqual(r.body, { error: 'This event is finalized. Only an Admin can change it.', finalized: true });
  assert.equal(stored('t-final').data.name, 'Closed');
});

test('admin PUT after the event is reopened (finalized removed) works again', async () => {
  delete stored('t-final').data.finalized;
  const r = await call('PUT', 't-final', admin(), putBody({ name: 'Reopened edit' }));
  assert.equal(r.statusCode, 200);
  assert.equal(stored('t-final').data.name, 'Reopened edit');
  assert.equal(stored('t-final').created_by, 'org1');
});

test('admin DELETE of a non-finalized foreign event works', async () => {
  const r = await call('DELETE', 't-alice', admin());
  assert.equal(r.statusCode, 204);
  assert.equal(stored('t-alice'), undefined);
  assert.ok(stored('t-final'));
});

test('admin DELETE of a finalized event is refused with the existing 403', async () => {
  const r = await call('DELETE', 't-final', admin());
  assert.equal(r.statusCode, 403);
  assert.deepEqual(r.body, { error: 'This event is finalized. Only an Admin can change it.', finalized: true });
  assert.ok(stored('t-final'));
});

test('non-admin DELETE of someone else\'s event removes nothing (204, as before)', async () => {
  const bob = row({ id: 'org2', email: 'b@example.com', name: 'Bob' });
  db.tables.organizers.push(bob);
  const r = await call('DELETE', 't-alice', bob);
  assert.equal(r.statusCode, 204);
  assert.ok(stored('t-alice'));
});

test('owner PUT/DELETE keep working through the same fake (regression)', async () => {
  assert.equal((await call('PUT', 't-alice', alice(), putBody({ name: 'Own edit' }))).statusCode, 200);
  assert.equal(stored('t-alice').data.name, 'Own edit');
  assert.equal((await call('DELETE', 't-alice', alice())).statusCode, 204);
  assert.equal(stored('t-alice'), undefined);
});

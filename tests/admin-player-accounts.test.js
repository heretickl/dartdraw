const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { createFakeDb } = require('./lib/fake-db');
const { createFakePlayerDb } = require('./lib/fake-player-db');
const { callHandler } = require('./lib/call-handler');

// Admin "Player accounts" (organiser app): list, create with a temporary password, reset it. The organiser side
// (requireAdmin) runs on fake-db; statements on player_accounts go to fake-player-db.
const dbPath = require.resolve('../api/_lib/db');
let orgDb, playerDb;
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
  sql: (strings, ...vals) => (/\bplayer_accounts\b/.test(strings.join('?')) ? playerDb.sql(strings, ...vals) : orgDb.sql(strings, ...vals)),
} };

const router = require('../api/_routes/adminRouter');
const indexHandler = require('../api/_routes/admin/player-accounts/index');
const resetHandler = require('../api/_routes/admin/player-accounts/[id]/reset');
const { TEMP_ALPHABET } = require('../api/_lib/playerAccounts');

const SECRET = 'test-secret-for-admin-player-accounts';
const COOKIE = '__Host-session';
const ENV_KEYS = ['SESSION_SECRET', 'REQUIRE_LOGIN', 'MAIL_PROVIDER', 'APP_URL', 'AUTH_MIN_RESPONSE_MS'];
const TEMP_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{10}$/;
let savedEnv;

const org = (over) => Object.assign({
  id: 'org1', email: 'org@example.com', name: 'Olive', password_hash: 'x', role: 'organizer', tier: 'basic',
  suspended: false, email_verified_at: new Date('2026-01-01T00:00:00Z'), token_version: 0,
}, over);
const cookieFor = (o) => ({ [COOKIE]: jwt.sign({ sub: o.id, email: o.email, name: o.name, tv: o.token_version }, SECRET, { expiresIn: 600 }) });
const asAdmin = () => cookieFor(orgDb.tables.organizers.find((o) => o.id === 'adm1'));
const asOrganiser = () => cookieFor(orgDb.tables.organizers.find((o) => o.id === 'org1'));
const byEmail = (email) => playerDb.rows.player_accounts.find((a) => a.email === email);

beforeEach(() => {
  savedEnv = {}; ENV_KEYS.forEach((k) => { savedEnv[k] = process.env[k]; delete process.env[k]; });
  process.env.SESSION_SECRET = SECRET;
  process.env.REQUIRE_LOGIN = 'true';
  process.env.MAIL_PROVIDER = 'console';
  process.env.AUTH_MIN_RESPONSE_MS = '0';
  orgDb = createFakeDb({ organizers: [org(), org({ id: 'adm1', email: 'root@example.com', name: 'Root', role: 'admin' })] });
  playerDb = createFakePlayerDb();
});
afterEach(() => {
  ENV_KEYS.forEach((k) => { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; });
});

const create = (body, cookies) => callHandler(indexHandler, { method: 'POST', body, cookies: cookies || asAdmin() });

test('the alphabet has no look-alike characters', () => {
  assert.equal(TEMP_ALPHABET, 'ABCDEFGHJKMNPQRSTUVWXYZ23456789');
});

test('non-admin → 403 (list, create and reset); signed out → 401', async () => {
  const list = await callHandler(indexHandler, { method: 'GET', cookies: asOrganiser() });
  assert.equal(list.statusCode, 403);
  assert.equal(list.body.code, 'admin_only');
  const made = await create({ email: 'p@example.com', firstName: 'P', lastName: 'Q' }, asOrganiser());
  assert.equal(made.statusCode, 403);
  assert.equal(playerDb.rows.player_accounts.length, 0);
  const reset = await callHandler(resetHandler, { method: 'POST', query: { id: crypto.randomUUID() }, cookies: asOrganiser() });
  assert.equal(reset.statusCode, 403);
  const anon = await callHandler(indexHandler, { method: 'GET' });
  assert.equal(anon.statusCode, 401);
});

test('create → 201 and the row is confirmed with must_change_password; the temporary password is shown once', async () => {
  const r = await create({ email: ' Kai@Example.com ', firstName: '  Kai ', lastName: 'Wong' });
  assert.equal(r.statusCode, 201);
  assert.match(r.body.tempPassword, TEMP_RE);
  assert.equal(r.body.account.email, 'kai@example.com');
  assert.equal(r.body.account.firstName, 'Kai');
  assert.equal(r.body.account.confirmed, true);
  assert.equal(r.body.account.createdByAdmin, 'adm1');
  const row = byEmail('kai@example.com');
  assert.ok(row.email_verified_at);
  assert.equal(row.must_change_password, true);
  assert.equal(row.created_by_admin, 'adm1');
  assert.notEqual(row.password_hash, r.body.tempPassword, 'only the hash is stored');
  assert.ok(await bcrypt.compare(r.body.tempPassword, row.password_hash));
});

test('temporary passwords use only the safe alphabet, 10 characters', async () => {
  for (let i = 0; i < 5; i++) {
    const r = await create({ email: 'p' + i + '@example.com', firstName: 'P', lastName: String(i) });
    assert.match(r.body.tempPassword, TEMP_RE);
  }
});

test('duplicate confirmed email → 409 email_taken and nothing changes', async () => {
  await create({ email: 'kai@example.com', firstName: 'Kai', lastName: 'Wong' });
  const before = Object.assign({}, byEmail('kai@example.com'));
  const r = await create({ email: 'KAI@example.com', firstName: 'Other', lastName: 'Person' });
  assert.equal(r.statusCode, 409);
  assert.equal(r.body.code, 'email_taken');
  assert.deepEqual(byEmail('kai@example.com'), before);
});

test('an existing unconfirmed sign-up is taken over: replaced, confirmed, older sessions out', async () => {
  playerDb.rows.player_accounts.push({ id: crypto.randomUUID(), email: 'kai@example.com', password_hash: 'strangers', first_name: 'Stranger',
    last_name: 'X', email_verified_at: null, must_change_password: false, token_version: 3, created_at: new Date() });
  const r = await create({ email: 'kai@example.com', firstName: 'Kai', lastName: 'Wong' });
  assert.equal(r.statusCode, 201);
  const row = byEmail('kai@example.com');
  assert.equal(playerDb.rows.player_accounts.length, 1);
  assert.equal(row.first_name, 'Kai');
  assert.ok(row.email_verified_at);
  assert.equal(row.must_change_password, true);
  assert.equal(row.token_version, 4);
  assert.ok(await bcrypt.compare(r.body.tempPassword, row.password_hash));
});

test('create checks the email and names', async () => {
  assert.equal((await create({ email: 'nope', firstName: 'A', lastName: 'B' })).body.code, 'invalid_email');
  assert.equal((await create({ email: 'a@example.com', firstName: ' ', lastName: 'B' })).body.code, 'invalid_first_name');
  assert.equal((await create({ email: 'a@example.com', firstName: 'A', lastName: 'B'.repeat(41) })).body.code, 'invalid_last_name');
  assert.equal(playerDb.rows.player_accounts.length, 0);
});

test('reset bumps token_version and sets a new temporary password', async () => {
  const made = await create({ email: 'kai@example.com', firstName: 'Kai', lastName: 'Wong' });
  const row = byEmail('kai@example.com');
  row.must_change_password = false;   // the player had chosen their own
  const tv = row.token_version;
  const r = await callHandler(router, { method: 'POST', url: '/api/admin/player-accounts/' + row.id + '/reset', cookies: asAdmin() });
  assert.equal(r.statusCode, 200);
  assert.match(r.body.tempPassword, TEMP_RE);
  assert.notEqual(r.body.tempPassword, made.body.tempPassword);
  assert.equal(row.token_version, tv + 1);
  assert.equal(row.must_change_password, true);
  assert.ok(await bcrypt.compare(r.body.tempPassword, row.password_hash));
});

test('reset of an unknown or malformed id → 404', async () => {
  const unknown = await callHandler(resetHandler, { method: 'POST', query: { id: crypto.randomUUID() }, cookies: asAdmin() });
  assert.equal(unknown.statusCode, 404);
  assert.equal(unknown.body.code, 'player_account_not_found');
  const bad = await callHandler(resetHandler, { method: 'POST', query: { id: 'not-a-uuid' }, cookies: asAdmin() });
  assert.equal(bad.statusCode, 404);
});

test('list: newest first, search by name or email, total', async () => {
  await create({ email: 'kai@example.com', firstName: 'Kai', lastName: 'Wong' });
  playerDb.advance(1000);
  await create({ email: 'mei@example.com', firstName: 'Mei Ling', lastName: 'Soo' });
  const all = await callHandler(router, { method: 'GET', url: '/api/admin/player-accounts', cookies: asAdmin() });
  assert.equal(all.statusCode, 200);
  assert.equal(all.body.total, 2);
  assert.deepEqual(all.body.items.map((i) => i.email), ['mei@example.com', 'kai@example.com']);
  assert.deepEqual(Object.keys(all.body.items[0]).sort(), ['confirmed', 'createdAt', 'createdByAdmin', 'email', 'firstName', 'id', 'lastName']);
  const q = await callHandler(router, { method: 'GET', url: '/api/admin/player-accounts?q=ling%20soo', cookies: asAdmin() });
  assert.deepEqual(q.body.items.map((i) => i.email), ['mei@example.com']);
  const byMail = await callHandler(router, { method: 'GET', url: '/api/admin/player-accounts?q=KAI@', cookies: asAdmin() });
  assert.deepEqual(byMail.body.items.map((i) => i.email), ['kai@example.com']);
  const none = await callHandler(router, { method: 'GET', url: '/api/admin/player-accounts?q=100%25', cookies: asAdmin() });
  assert.deepEqual(none.body, { items: [], total: 0 });
});

test('before the migration has run: 503 not_set_up', async () => {
  playerDb.failNext(Object.assign(new Error('relation "player_accounts" does not exist'), { code: '42P01' }));
  const r = await callHandler(indexHandler, { method: 'GET', cookies: asAdmin() });
  assert.equal(r.statusCode, 503);
  assert.equal(r.body.code, 'not_set_up');
});

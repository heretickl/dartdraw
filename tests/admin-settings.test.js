const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { createFakeDb } = require('./lib/fake-db');
const { callHandler } = require('./lib/call-handler');

// Route api/_lib/db.js to a per-test fake database (the real auth code runs against it).
const dbPath = require.resolve('../api/_lib/db');
let db;
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
  sql: (...args) => db.sql(...args),
} };

const auth = require('../api/_lib/auth');
const settings = require('../api/_lib/settings');
const handler = require('../api/_routes/admin/settings');

const SECRET = 'test-secret-for-admin-settings';
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
const asAdmin = () => cookieFor(byId('adm1'));
const stored = () => Object.fromEntries(db.tables.site_settings.map((r) => [r.key, r.value]));

beforeEach(() => {
  savedEnv = {}; ENV_KEYS.forEach((k) => { savedEnv[k] = process.env[k]; delete process.env[k]; });
  process.env.SESSION_SECRET = SECRET;
  process.env.REQUIRE_LOGIN = 'true';
  db = createFakeDb({
    organizers: [
      row({ id: 'adm1', email: 'root@example.com', name: 'Root', role: 'admin' }),
      row({ id: 'org1' }),
    ],
  });
  auth._resetPublicOrganizerCache();
});
afterEach(() => {
  ENV_KEYS.forEach((k) => { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; });
});

const get = (opts) => callHandler(handler, Object.assign({ method: 'GET', cookies: asAdmin() }, opts));
const put = (body, opts) => callHandler(handler, Object.assign({ method: 'PUT', body, cookies: asAdmin() }, opts));

// ---- constants and validateSettings ----

test('constants: defaults and limits are exactly the contract', () => {
  assert.deepEqual(settings.DEFAULT_SETTINGS, { resultsDays: 14, liveHours: 48 });
  assert.deepEqual(settings.SETTING_LIMITS, { resultsDays: [1, 90], liveHours: [1, 168] });
});

test('validateSettings: accepts integers inside the limits (inclusive)', () => {
  assert.deepEqual(settings.validateSettings({ resultsDays: 14, liveHours: 48 }), { ok: true, value: { resultsDays: 14, liveHours: 48 } });
  assert.deepEqual(settings.validateSettings({ resultsDays: 1, liveHours: 1 }).value, { resultsDays: 1, liveHours: 1 });
  assert.deepEqual(settings.validateSettings({ resultsDays: 90, liveHours: 168 }).value, { resultsDays: 90, liveHours: 168 });
});

test('validateSettings: rejects non-integers, out of range, missing and non-numbers, with a message naming the field', () => {
  const bad = (body, field) => {
    const r = settings.validateSettings(body);
    assert.equal(r.ok, false, JSON.stringify(body));
    assert.equal(typeof r.error, 'string');
    if (field) assert.ok(r.error.includes(field), r.error);
  };
  const okLive = { liveHours: 48 };
  const okDays = { resultsDays: 14 };
  bad(Object.assign({ resultsDays: 0 }, okLive), 'resultsDays');
  bad(Object.assign({ resultsDays: 91 }, okLive), 'resultsDays');
  bad(Object.assign({ resultsDays: -3 }, okLive), 'resultsDays');
  bad(Object.assign({ resultsDays: 1.5 }, okLive), 'resultsDays');
  bad(Object.assign({ resultsDays: '14' }, okLive), 'resultsDays');
  bad(Object.assign({ resultsDays: null }, okLive), 'resultsDays');
  bad(Object.assign({ resultsDays: NaN }, okLive), 'resultsDays');
  bad(Object.assign({ resultsDays: Infinity }, okLive), 'resultsDays');
  bad(Object.assign({ resultsDays: true }, okLive), 'resultsDays');
  bad(okLive, 'resultsDays');
  bad(Object.assign({ liveHours: 0 }, okDays), 'liveHours');
  bad(Object.assign({ liveHours: 169 }, okDays), 'liveHours');
  bad(Object.assign({ liveHours: 2.5 }, okDays), 'liveHours');
  bad(Object.assign({ liveHours: '48' }, okDays), 'liveHours');
  bad(okDays, 'liveHours');
  bad({}, null);
  bad(null, null);
  bad(undefined, null);
  bad('x', null);
  bad([1, 2], null);
});

test('validateSettings: only the two known fields are returned', () => {
  const r = settings.validateSettings({ resultsDays: 10, liveHours: 20, evil: 1, __proto__: { x: 1 } });
  assert.deepEqual(r.value, { resultsDays: 10, liveHours: 20 });
});

// ---- getSettings ----

test('getSettings: no rows -> defaults', async () => {
  assert.deepEqual(await settings.getSettings(), { resultsDays: 14, liveHours: 48 });
});

test('getSettings: stored rows are used', async () => {
  db.tables.site_settings.push({ key: 'resultsDays', value: 30 }, { key: 'liveHours', value: 72 });
  assert.deepEqual(await settings.getSettings(), { resultsDays: 30, liveHours: 72 });
});

test('getSettings: one row missing falls back for that key only', async () => {
  db.tables.site_settings.push({ key: 'liveHours', value: 6 });
  assert.deepEqual(await settings.getSettings(), { resultsDays: 14, liveHours: 6 });
});

test('getSettings: junk, out-of-range and non-integer values fall back to the defaults', async () => {
  const junk = [null, 'abc', '30', 0, -1, 1000, 2.5, NaN, true, [], {}, { a: 1 }];
  for (const v of junk) {
    db.tables.site_settings = [{ key: 'resultsDays', value: v }, { key: 'liveHours', value: v }];
    assert.deepEqual(await settings.getSettings(), { resultsDays: 14, liveHours: 48 }, JSON.stringify(v));
  }
  db.tables.site_settings = [{ key: 'resultsDays', value: 91 }, { key: 'liveHours', value: 169 }];
  assert.deepEqual(await settings.getSettings(), { resultsDays: 14, liveHours: 48 });
});

test('getSettings: unknown keys are ignored', async () => {
  db.tables.site_settings.push({ key: 'other', value: 5 }, { key: 'resultsDays', value: 20 });
  assert.deepEqual(await settings.getSettings(), { resultsDays: 20, liveHours: 48 });
});

test('getSettings: a missing table answers the defaults', async () => {
  db.dropTable('site_settings');
  assert.deepEqual(await settings.getSettings(), { resultsDays: 14, liveHours: 48 });
});

test('getSettings: a thrown database error answers the defaults and never throws', async () => {
  db = { sql: async () => { throw new Error('connection reset'); } };
  assert.deepEqual(await settings.getSettings(), { resultsDays: 14, liveHours: 48 });
  db = { sql: async () => { throw null; } };
  assert.deepEqual(await settings.getSettings(), { resultsDays: 14, liveHours: 48 });
  db = { sql: async () => 'not rows' };
  assert.deepEqual(await settings.getSettings(), { resultsDays: 14, liveHours: 48 });
  db = { sql: async () => [null, { key: 'resultsDays' }, 5] };
  assert.deepEqual(await settings.getSettings(), { resultsDays: 14, liveHours: 48 });
});

test('getSettings: returns a fresh object (callers cannot change the defaults)', async () => {
  const a = await settings.getSettings();
  a.resultsDays = 99;
  assert.equal((await settings.getSettings()).resultsDays, 14);
  assert.equal(settings.DEFAULT_SETTINGS.resultsDays, 14);
});

// ---- endpoint: access ----

for (const method of ['GET', 'PUT']) {
  const call = (o) => callHandler(handler, Object.assign({ method, body: { resultsDays: 20, liveHours: 20 } }, o));

  test(method + ' /api/admin/settings: 401 without a session, 403 for an organiser, nothing stored', async () => {
    const none = await call({});
    assert.equal(none.statusCode, 401);
    const org = await call({ cookies: cookieFor(byId('org1')) });
    assert.equal(org.statusCode, 403);
    assert.deepEqual(org.body, { error: 'Admin only.' });
    assert.equal(db.tables.site_settings.length, 0);
  });

  test(method + ' /api/admin/settings: suspended, unverified and stale-session admins are rejected', async () => {
    const cookies = cookieFor(byId('adm1'));
    byId('adm1').suspended = true;
    assert.equal((await call({ cookies })).statusCode, 401);
    byId('adm1').suspended = false;
    byId('adm1').email_verified_at = null;
    assert.equal((await call({ cookies })).statusCode, 401);
    byId('adm1').email_verified_at = new Date('2026-01-01T00:00:00Z');
    byId('adm1').token_version = 2;
    assert.equal((await call({ cookies })).statusCode, 401);
    assert.equal(db.tables.site_settings.length, 0);
  });

  test(method + ' /api/admin/settings: in the shared-Public fallback it answers 403', async () => {
    delete process.env.REQUIRE_LOGIN;
    const r = await call({ cookies: asAdmin() });
    assert.equal(r.statusCode, 403);
    assert.equal(db.tables.site_settings.length, 0);
  });
}

test('POST and DELETE are 405', async () => {
  assert.equal((await callHandler(handler, { method: 'POST', cookies: asAdmin() })).statusCode, 405);
  assert.equal((await callHandler(handler, { method: 'DELETE', cookies: asAdmin() })).statusCode, 405);
});

// ---- endpoint: behaviour ----

test('GET: defaults with the limits when nothing is stored', async () => {
  const r = await get();
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.body, {
    resultsDays: 14, liveHours: 48, adminContact: '',
    limits: { resultsDays: [1, 90], liveHours: [1, 168] }, contactMaxLength: 200,
  });
});

test('GET: reflects stored values; works even when the table does not exist yet', async () => {
  db.tables.site_settings.push({ key: 'resultsDays', value: 21 }, { key: 'liveHours', value: 12 });
  const r = await get();
  assert.equal(r.body.resultsDays, 21);
  assert.equal(r.body.liveHours, 12);
  db.dropTable('site_settings');
  const d = await get();
  assert.equal(d.statusCode, 200);
  assert.equal(d.body.resultsDays, 14);
});

test('PUT: stores both values and answers the same shape as GET', async () => {
  const r = await put({ resultsDays: 30, liveHours: 72 });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.body, { resultsDays: 30, liveHours: 72, adminContact: '', limits: { resultsDays: [1, 90], liveHours: [1, 168] }, contactMaxLength: 200 });
  assert.deepEqual(stored(), { resultsDays: 30, liveHours: 72 });
  assert.deepEqual((await get()).body.resultsDays, 30);
  assert.deepEqual(await settings.getSettings(), { resultsDays: 30, liveHours: 72 });
});

test('PUT: a second save updates the same two rows (upsert), no duplicates', async () => {
  await put({ resultsDays: 30, liveHours: 72 });
  db.advance(5000);
  const r = await put({ resultsDays: 3, liveHours: 6 });
  assert.equal(r.statusCode, 200);
  assert.equal(db.tables.site_settings.length, 2);
  assert.deepEqual(stored(), { resultsDays: 3, liveHours: 6 });
  assert.equal(db.tables.site_settings[0].updated_at.getTime(), db.now().getTime());
});

test('PUT: the boundary values are accepted', async () => {
  assert.equal((await put({ resultsDays: 1, liveHours: 1 })).statusCode, 200);
  assert.equal((await put({ resultsDays: 90, liveHours: 168 })).statusCode, 200);
  assert.deepEqual(stored(), { resultsDays: 90, liveHours: 168 });
});

test('PUT: invalid bodies are 400 and store nothing (the earlier value survives)', async () => {
  await put({ resultsDays: 30, liveHours: 72 });
  const bads = [
    { resultsDays: 0, liveHours: 72 }, { resultsDays: 91, liveHours: 72 }, { resultsDays: 30, liveHours: 0 },
    { resultsDays: 30, liveHours: 169 }, { resultsDays: 1.5, liveHours: 72 }, { resultsDays: '30', liveHours: 72 },
    { resultsDays: 30 }, { liveHours: 72 }, {}, undefined, null, 'x', [30, 72],
  ];
  for (const b of bads) {
    const r = await put(b);
    assert.equal(r.statusCode, 400, JSON.stringify(b));
    assert.equal(typeof r.body.error, 'string');
  }
  assert.deepEqual(stored(), { resultsDays: 30, liveHours: 72 });
});

test('PUT: the upsert is parameterised and is one INSERT ... ON CONFLICT statement', async () => {
  await put({ resultsDays: 30, liveHours: 72 });
  const ups = db.calls.filter((c) => /^INSERT INTO site_settings/.test(c.text));
  assert.equal(ups.length, 1);
  assert.ok(/ON CONFLICT \(key\) DO UPDATE/.test(ups[0].text));
  assert.deepEqual(ups[0].vals, ['30', '72']);
});

test('PUT: if the settings table does not exist yet, the answer is a clear 500 and not a crash', async () => {
  db.dropTable('site_settings');
  const r = await put({ resultsDays: 30, liveHours: 72 });
  assert.equal(r.statusCode, 500);
  assert.ok(/migration/i.test(r.body.error), r.body.error);
});

test('PUT: other database failures are a generic 500 without detail', async () => {
  const real = db;
  const cookies = asAdmin();
  db = {
    sql: async (strings, ...vals) => {
      if (/INSERT INTO site_settings/.test(strings.join('?'))) throw new Error('secret detail');
      return real.sql(strings, ...vals);
    },
  };
  const r = await callHandler(handler, { method: 'PUT', body: { resultsDays: 30, liveHours: 72 }, cookies });
  assert.equal(r.statusCode, 500);
  assert.ok(!JSON.stringify(r.body).includes('secret'));
});

// ---- the sign-in page contact line (adminContact) ----

const NUMS = { resultsDays: 14, liveHours: 48 };
const withContact = (c) => Object.assign({}, NUMS, { adminContact: c });

test('contact line: constants and cleaning (controls, direction marks and line breaks become one space; trimmed)', () => {
  assert.equal(settings.CONTACT_MAX_LENGTH, 200);
  assert.equal(settings.cleanContactLine('  Ask   Sam\tat the bar\r\n or phone 012  '), 'Ask Sam at the bar or phone 012');
  assert.equal(settings.cleanContactLine('a\u202Eb\u200Bc\u2028d\u0000e\uFEFFf\u0085g'), 'a b c d e f g');
  assert.equal(settings.cleanContactLine(5), null);
  assert.equal(settings.cleanContactLine(null), null);
});

test('contact line: validateContactLine accepts plain text up to 200 characters, and empty or null to clear it', () => {
  assert.deepEqual(settings.validateContactLine('Ask the club secretary at the bar.'), { ok: true, value: 'Ask the club secretary at the bar.' });
  assert.deepEqual(settings.validateContactLine(''), { ok: true, value: '' });
  assert.deepEqual(settings.validateContactLine('   '), { ok: true, value: '' });
  assert.deepEqual(settings.validateContactLine(null), { ok: true, value: '' });
  assert.equal(settings.validateContactLine('x'.repeat(200)).value.length, 200);
  assert.equal(settings.validateContactLine(' ' + 'x'.repeat(200) + '  ').ok, true, 'length counts after trimming');
  assert.equal(settings.validateContactLine("Sam's club & bar: 012-345 6789 (evenings) \"ask\"").ok, true, 'quotes, & and brackets are fine as text');
});

test('contact line: validateContactLine refuses more than 200 characters, < or >, and anything that is not text', () => {
  const bad = (v, re) => { const r = settings.validateContactLine(v); assert.equal(r.ok, false, JSON.stringify(v)); assert.match(r.error, re); };
  bad('x'.repeat(201), /200 characters/);
  bad('<b>hi</b>', /plain text/);
  bad('<script>alert(1)</script>', /plain text/);
  bad('a > b', /plain text/);
  bad('<img src=x onerror=alert(1)>', /plain text/);
  bad(5, /text/); bad(true, /text/); bad({}, /text/); bad(['a'], /text/);
});

test('validateSettings: adminContact is optional; when sent it is validated and returned cleaned', () => {
  assert.deepEqual(settings.validateSettings(NUMS).value, NUMS, 'left out: not in the value');
  assert.deepEqual(settings.validateSettings(Object.assign({ adminContact: undefined }, NUMS)).value, NUMS);
  assert.deepEqual(settings.validateSettings(withContact('  Ask  Sam ')).value, withContact('Ask Sam'));
  assert.deepEqual(settings.validateSettings(withContact(null)).value, withContact(''));
  assert.equal(settings.validateSettings(withContact('x'.repeat(201))).ok, false);
  assert.equal(settings.validateSettings(withContact('<b>')).ok, false);
  assert.equal(settings.validateSettings(withContact(7)).ok, false);
  assert.equal(settings.validateSettings({ resultsDays: 0, liveHours: 48, adminContact: 'ok' }).ok, false, 'the numbers are still checked');
});

test('getContactLine: the stored line; "" when missing, not text, invalid, or the database fails (never throws)', async () => {
  assert.equal(await settings.getContactLine(), '');
  db.tables.site_settings.push({ key: 'adminContact', value: 'Ask the club secretary.' });
  assert.equal(await settings.getContactLine(), 'Ask the club secretary.');
  for (const v of [5, null, true, {}, ['x'], '<b>x</b>', 'x'.repeat(201)]) {
    db.tables.site_settings = [{ key: 'adminContact', value: v }];
    assert.equal(await settings.getContactLine(), '', JSON.stringify(v));
  }
  db.tables.site_settings = [{ key: 'adminContact', value: ' two\nlines\u202E ' }];
  assert.equal(await settings.getContactLine(), 'two lines', 'a row written another way is cleaned on the way out');
  db.dropTable('site_settings');
  assert.equal(await settings.getContactLine(), '');
  db = { sql: async () => { throw new Error('connection reset'); } };
  assert.equal(await settings.getContactLine(), '');
  db = { sql: () => { throw new Error('DATABASE_URL is not set'); } };
  assert.equal(await settings.getContactLine(), '');
});

test('getSettings never returns the contact line (the viewer numbers stay as they were)', async () => {
  db.tables.site_settings.push({ key: 'adminContact', value: 'Ask Sam.' }, { key: 'resultsDays', value: 20 });
  assert.deepEqual(await settings.getSettings(), { resultsDays: 20, liveHours: 48 });
});

test('GET: includes the stored contact line', async () => {
  db.tables.site_settings.push({ key: 'adminContact', value: 'Ask the club secretary.' });
  const r = await get();
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.adminContact, 'Ask the club secretary.');
  assert.equal(r.body.contactMaxLength, 200);
});

test('PUT: stores the contact line with the numbers in one parameterised statement, cleaned', async () => {
  const r = await put(withContact('  Ask Sam at the bar,\n or phone 012-345 6789. '));
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.adminContact, 'Ask Sam at the bar, or phone 012-345 6789.');
  assert.deepEqual(stored(), { resultsDays: 14, liveHours: 48, adminContact: 'Ask Sam at the bar, or phone 012-345 6789.' });
  const ups = db.calls.filter((c) => /^INSERT INTO site_settings/.test(c.text));
  assert.equal(ups.length, 1);
  assert.match(ups[0].text, /\('adminContact', \?::jsonb, now\(\)\)/);
  assert.deepEqual(ups[0].vals, ['14', '48', JSON.stringify('Ask Sam at the bar, or phone 012-345 6789.')]);
  assert.equal((await get()).body.adminContact, 'Ask Sam at the bar, or phone 012-345 6789.');
});

test('PUT: an empty line clears it; leaving adminContact out keeps the stored line', async () => {
  await put(withContact('Ask Sam.'));
  const kept = await put({ resultsDays: 20, liveHours: 30 });
  assert.equal(kept.statusCode, 200);
  assert.equal(kept.body.adminContact, 'Ask Sam.', 'the answer still shows the stored line');
  assert.equal(stored().adminContact, 'Ask Sam.');
  assert.equal(stored().resultsDays, 20);
  const cleared = await put(withContact(''));
  assert.equal(cleared.body.adminContact, '');
  assert.equal(stored().adminContact, '');
  assert.equal(db.tables.site_settings.length, 3, 'upserts, no duplicate rows');
});

test('PUT: a contact line that is too long, has < or >, or is not text is 400 and nothing is stored', async () => {
  await put(withContact('Ask Sam.'));
  for (const c of ['x'.repeat(201), '<script>alert(1)</script>', 'a<b', 'a>b', 42, { a: 1 }, ['x']]) {
    const r = await put({ resultsDays: 30, liveHours: 72, adminContact: c });
    assert.equal(r.statusCode, 400, JSON.stringify(c));
    assert.equal(typeof r.body.error, 'string');
  }
  assert.deepEqual(stored(), { resultsDays: 14, liveHours: 48, adminContact: 'Ask Sam.' });
});

test('PUT with a contact line: only a signed-in admin may write it (401 / 403, nothing stored)', async () => {
  const body = withContact('Ask Sam.');
  assert.equal((await callHandler(handler, { method: 'PUT', body })).statusCode, 401);
  const org = await callHandler(handler, { method: 'PUT', body, cookies: cookieFor(byId('org1')) });
  assert.equal(org.statusCode, 403);
  delete process.env.REQUIRE_LOGIN;
  assert.equal((await callHandler(handler, { method: 'PUT', body, cookies: asAdmin() })).statusCode, 403);
  assert.equal(db.tables.site_settings.length, 0);
});
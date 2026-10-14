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
const listHandler = require('../api/_routes/admin/events/index');
const itemHandler = require('../api/_routes/admin/events/[id]');
const tournamentHandler = require('../api/tournaments/[id]');
const organizersTransfer = require('../api/_routes/admin/organizers/[id]/transfer');

const SECRET = 'test-secret-for-admin-events';
const COOKIE = '__Host-session';
const ENV_KEYS = ['SESSION_SECRET', 'REQUIRE_LOGIN'];
let savedEnv;

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
// An event row. `n` orders updated_at (higher = newer).
function ev(id, owner, n, data) {
  return { id, created_by: owner, updated_at: new Date(Date.UTC(2026, 9, 1, 0, n, 0)), data };
}
const cookieFor = (o) => ({ [COOKIE]: jwt.sign({ sub: o.id, email: o.email, name: o.name, tv: o.token_version }, SECRET, { expiresIn: 600 }) });
const byId = (id) => db.tables.organizers.find((o) => o.id === id);
const tById = (id) => db.tables.tournaments.find((t) => t.id === id);
const asAdmin = () => cookieFor(byId('adm1'));
const BIG = Array.from({ length: 5 }, (_, i) => ({ id: 'e' + i, name: 'Entry ' + i }));

beforeEach(() => {
  savedEnv = {}; ENV_KEYS.forEach((k) => { savedEnv[k] = process.env[k]; delete process.env[k]; });
  process.env.SESSION_SECRET = SECRET;
  process.env.REQUIRE_LOGIN = 'true';
  db = createFakeDb({
    now: '2026-10-14T12:00:00Z',
    organizers: [
      row({ id: 'pub', email: PUBLIC_EMAIL, name: 'Public', password_hash: 'disabled', email_verified_at: null }),
      row({ id: 'adm1', email: 'root@example.com', name: 'Root', role: 'admin' }),
      row({ id: 'org1' }),
      row({ id: 'org2', email: 'b@example.com', name: 'Bob', tier: 'pro' }),
      row({ id: 'orgS', email: 's@example.com', name: 'Sam', suspended: true }),
    ],
    tournaments: [
      ev('t1', 'org1', 1, {
        eventCreation: { tournamentName: 'Spring Open', eventName: 'Singles', date: '2026-10-01' },
        format: { formatType: 'knockout' }, entriesList: BIG, published: true, publicSlug: 'abc', listed: true,
      }),
      ev('t2', 'org1', 2, {
        eventCreation: { tournamentName: 'Autumn Cup', eventName: 'Pairs', date: '2026-09-20' },
        format: { formatType: 'pods' }, entriesList: BIG, published: true, publicSlug: 'def', listed: true, finalized: FINAL,
      }),
      ev('t3', 'org2', 3, {
        eventCreation: { tournamentName: '100% Wet_Night', eventName: 'Open', date: '2026-10-05' },
        format: { formatType: 'knockout' }, entriesList: BIG,
      }),
      ev('t4', 'pub', 4, { eventCreation: { tournamentName: 'Shared Event', eventName: 'Fun', date: '2026-10-07' } }),
      ev('t5', 'org2', 5, { eventCreation: { tournamentName: 'Late Draw', eventName: 'Mixed' }, finalized: true, published: true, listed: false }),
    ],
  });
  auth._resetPublicOrganizerCache();
});
afterEach(() => {
  ENV_KEYS.forEach((k) => { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; });
});

const get = (query, opts) => callHandler(listHandler, Object.assign({ method: 'GET', query: query || {}, cookies: asAdmin() }, opts));
const act = (id, body, opts) => callHandler(itemHandler, Object.assign({ method: 'POST', query: { id }, body, cookies: asAdmin() }, opts));
const ids = (r) => r.body.events.map((e) => e.id);

// ---- access control ----

const ROUTES = [
  ['GET /api/admin/events', (o) => callHandler(listHandler, Object.assign({ method: 'GET' }, o))],
  ['POST /api/admin/events/:id', (o) => callHandler(itemHandler, Object.assign({ method: 'POST', query: { id: 't1' }, body: { action: 'delete' } }, o))],
];

for (const [name, call] of ROUTES) {
  test(name + ': 401 without a session, 403 for an organiser, nothing changes', async () => {
    const before = JSON.stringify(db.tables);
    const none = await call({});
    assert.equal(none.statusCode, 401);
    const org = await call({ cookies: cookieFor(byId('org1')) });
    assert.equal(org.statusCode, 403);
    assert.deepEqual(org.body, { error: 'Admin only.' });
    assert.equal(JSON.stringify(db.tables), before);
  });

  test(name + ': suspended, unverified and stale-session admins are rejected', async () => {
    const cookies = cookieFor(byId('adm1'));
    byId('adm1').suspended = true;
    assert.equal((await call({ cookies })).statusCode, 401);
    byId('adm1').suspended = false;
    byId('adm1').email_verified_at = null;
    assert.equal((await call({ cookies })).statusCode, 401);
    byId('adm1').email_verified_at = new Date('2026-01-01T00:00:00Z');
    byId('adm1').token_version = 3;
    assert.equal((await call({ cookies })).statusCode, 401);
  });

  test(name + ': in the shared-Public fallback (REQUIRE_LOGIN not true) it answers 403', async () => {
    delete process.env.REQUIRE_LOGIN;
    const before = JSON.stringify(db.tables);
    const r = await call({ cookies: asAdmin() });
    assert.equal(r.statusCode, 403);
    assert.deepEqual(r.body, { error: 'Admin only.' });
    assert.equal(JSON.stringify(db.tables), before);
  });
}

test('wrong methods are 405 (after the admin check)', async () => {
  const c = { cookies: asAdmin() };
  assert.equal((await callHandler(listHandler, Object.assign({ method: 'POST' }, c))).statusCode, 405);
  assert.equal((await callHandler(listHandler, Object.assign({ method: 'DELETE' }, c))).statusCode, 405);
  assert.equal((await callHandler(itemHandler, Object.assign({ method: 'GET', query: { id: 't1' } }, c))).statusCode, 405);
  assert.equal((await callHandler(itemHandler, Object.assign({ method: 'PUT', query: { id: 't1' } }, c))).statusCode, 405);
  assert.equal((await callHandler(itemHandler, Object.assign({ method: 'DELETE', query: { id: 't1' } }, c))).statusCode, 405);
});

// ---- list ----

test('list: shape, newest first, every organiser incl. the shared Public row', async () => {
  const r = await get();
  assert.equal(r.statusCode, 200);
  assert.deepEqual(ids(r), ['t5', 't4', 't3', 't2', 't1']);
  assert.equal(r.body.total, 5);
  assert.deepEqual(r.body.events.find((e) => e.id === 't1'), {
    id: 't1', tournamentName: 'Spring Open', eventName: 'Singles',
    owner: { id: 'org1', name: 'Alice', email: 'a@example.com' },
    format: 'knockout', date: '2026-10-01', published: true, listed: true, finalizedAt: null,
    updatedAt: '2026-10-01T00:01:00.000Z',
  });
  const t2 = r.body.events.find((e) => e.id === 't2');
  assert.equal(t2.finalizedAt, FINAL.at);
  assert.equal(t2.format, 'pods');
  const t4 = r.body.events.find((e) => e.id === 't4');
  assert.deepEqual(t4.owner, { id: 'pub', name: 'Public', email: PUBLIC_EMAIL });
  assert.equal(t4.published, false);
  assert.equal(t4.listed, false);
  assert.equal(t4.format, null);
});

test('list: a finalized event stored without an "at" still reports a finalizedAt (so Reopen is offered)', async () => {
  const t5 = (await get()).body.events.find((e) => e.id === 't5');
  assert.equal(t5.finalizedAt, t5.updatedAt);
  assert.equal(t5.date, null);
});

test('list: never returns the data blob, and the SQL never selects the whole data column', async () => {
  const r = await get();
  const text = JSON.stringify(r.body);
  assert.ok(!text.includes('entriesList'));
  assert.ok(!text.includes('Entry 0'));
  assert.ok(!text.includes('publicSlug'));
  r.body.events.forEach((e) => assert.deepEqual(Object.keys(e).sort(),
    ['date', 'eventName', 'finalizedAt', 'format', 'id', 'listed', 'owner', 'published', 'tournamentName', 'updatedAt']));
  const selects = db.calls.filter((c) => /FROM tournaments t JOIN organizers o/.test(c.text));
  assert.ok(selects.length >= 2);   // the page and the count
  selects.forEach((c) => {
    assert.ok(!/\bt\.data(?!\s*->)/.test(c.text), 'whole data column referenced: ' + c.text);
    assert.ok(!/\*/.test(c.text.replace(/count\(\*\)/g, '')), 'select * used: ' + c.text);
  });
});

test('list: q matches tournament name, event name, owner name and owner email, case-insensitively', async () => {
  assert.deepEqual(ids(await get({ q: 'spring' })), ['t1']);
  assert.deepEqual(ids(await get({ q: 'PAIRS' })), ['t2']);
  assert.deepEqual(ids(await get({ q: 'bob' })), ['t5', 't3']);
  assert.deepEqual(ids(await get({ q: 'A@EXAMPLE' })), ['t2', 't1']);
  assert.deepEqual(ids(await get({ q: 'nothing like this' })), []);
  const none = await get({ q: 'nothing like this' });
  assert.equal(none.body.total, 0);
});

test('list: LIKE wildcards in q are literal', async () => {
  assert.deepEqual(ids(await get({ q: '%' })), ['t3']);       // only "100% Wet_Night"
  assert.deepEqual(ids(await get({ q: '_' })), ['t3']);
  assert.deepEqual(ids(await get({ q: 'S_ring' })), []);
  assert.deepEqual(ids(await get({ q: '100% wet_night' })), ['t3']);
});

test('list: q is passed as a parameter, never concatenated into the SQL', async () => {
  const evil = "x'; DROP TABLE tournaments; --";
  const r = await get({ q: evil, owner: "o'1" });
  assert.equal(r.statusCode, 200);
  assert.equal(db.tables.tournaments.length, 5);
  db.calls.forEach((c) => {
    assert.ok(!c.text.includes('DROP TABLE'), c.text);
    assert.ok(!c.text.includes("o'1"), c.text);
  });
  assert.ok(db.calls.some((c) => c.vals.some((v) => typeof v === 'string' && v.includes('DROP TABLE'))));
});

test('list: owner filter, combined with q', async () => {
  assert.deepEqual(ids(await get({ owner: 'org1' })), ['t2', 't1']);
  assert.deepEqual(ids(await get({ owner: 'org2' })), ['t5', 't3']);
  assert.deepEqual(ids(await get({ owner: 'org2', q: 'late' })), ['t5']);
  assert.deepEqual(ids(await get({ owner: 'org1', q: 'late' })), []);
  assert.deepEqual(ids(await get({ owner: 'nobody' })), []);
  assert.equal((await get({ owner: 'org1' })).body.total, 2);
});

test('list: blank q and owner mean no filter; non-string query values are ignored', async () => {
  assert.equal((await get({ q: '', owner: '' })).body.total, 5);
  assert.equal((await get({ q: '   ' })).body.total, 5);
  assert.equal((await get({ q: ['a', 'b'], owner: ['org1'] })).body.total, 5);
});

test('list: pagination with limit/offset, total is the full match count', async () => {
  const p1 = await get({ limit: '2', offset: '0' });
  assert.deepEqual(ids(p1), ['t5', 't4']);
  assert.equal(p1.body.total, 5);
  const p2 = await get({ limit: '2', offset: '2' });
  assert.deepEqual(ids(p2), ['t3', 't2']);
  const p3 = await get({ limit: '2', offset: '4' });
  assert.deepEqual(ids(p3), ['t1']);
  const past = await get({ limit: '2', offset: '10' });
  assert.deepEqual(ids(past), []);
  assert.equal(past.body.total, 5);
});

test('list: limit defaults to 50, is clamped to 1..100, and junk falls back', async () => {
  const lim = async (q) => db.calls.filter((c) => /LIMIT/.test(c.text)).pop().vals.slice(-2);
  await get();
  assert.deepEqual(await lim(), [50, 0]);
  await get({ limit: '1000' });
  assert.deepEqual(await lim(), [100, 0]);
  await get({ limit: '0' });
  assert.deepEqual(await lim(), [1, 0]);
  await get({ limit: '-5' });
  assert.deepEqual(await lim(), [1, 0]);
  await get({ limit: 'abc', offset: 'abc' });
  assert.deepEqual(await lim(), [50, 0]);
  await get({ limit: '7.9', offset: '-3' });
  assert.deepEqual(await lim(), [7, 0]);
  await get({ limit: '10', offset: '40' });
  assert.deepEqual(await lim(), [10, 40]);
});

test('list: a very long q is cut, not rejected', async () => {
  const r = await get({ q: 'x'.repeat(5000) });
  assert.equal(r.statusCode, 200);
  const used = db.calls.filter((c) => /ILIKE/.test(c.text)).pop().vals.find((v) => typeof v === 'string' && v.includes('xxx'));
  assert.ok(used.length <= 120);
});

test('list: a database failure answers 500 without leaking details', async () => {
  const cookies = asAdmin();
  db = { sql: async () => { throw new Error('secret db detail'); } };   // requireAuth also uses the database, so it fails first with its own 500
  const r = await callHandler(listHandler, { method: 'GET', query: {}, cookies });
  assert.equal(r.statusCode, 500);
  assert.ok(!JSON.stringify(r.body).includes('secret'));
});

// ---- actions ----

test('action: unknown id 404, unknown / missing action 400, bad body 400 (nothing changes)', async () => {
  const before = JSON.stringify(db.tables);
  assert.equal((await act('nope', { action: 'delete' })).statusCode, 404);
  assert.equal((await act('nope', { action: 'bogus' })).statusCode, 404);   // existence is checked first
  const bad = await act('t1', { action: 'bogus' });
  assert.equal(bad.statusCode, 400);
  assert.deepEqual(bad.body, { error: 'Unknown action.' });
  assert.equal((await act('t1', {})).statusCode, 400);
  assert.equal((await act('t1', undefined)).statusCode, 400);
  assert.equal((await act('t1', 'reopen')).statusCode, 400);
  assert.equal((await act('t1', { action: 5 })).statusCode, 400);
  assert.equal((await act('t1', { action: 'constructor' })).statusCode, 400);
  assert.equal(JSON.stringify(db.tables), before);
});

test('reopen: removes finalized, bumps updated_at, touches nothing else', async () => {
  const dataBefore = JSON.parse(JSON.stringify(tById('t2').data));
  const stampBefore = tById('t2').updated_at.getTime();
  db.advance(60000);
  const r = await act('t2', { action: 'reopen' });
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.event.id, 't2');
  assert.equal(r.body.event.finalizedAt, null);
  assert.equal(r.body.event.owner.id, 'org1');
  assert.ok(!('finalized' in tById('t2').data));
  const expected = Object.assign({}, dataBefore); delete expected.finalized;
  assert.deepEqual(tById('t2').data, expected);
  assert.equal(tById('t2').created_by, 'org1');
  assert.equal(tById('t2').updated_at.getTime(), db.now().getTime());
  assert.ok(tById('t2').updated_at.getTime() > stampBefore);
  assert.equal(r.body.event.updatedAt, db.now().toISOString());
});

test('reopen: also works when finalized is a bare true', async () => {
  const r = await act('t5', { action: 'reopen' });
  assert.equal(r.statusCode, 200);
  assert.ok(!('finalized' in tById('t5').data));
});

test('reopen: a non-finalized event is 409 and unchanged', async () => {
  const before = JSON.stringify(tById('t1'));
  const r = await act('t1', { action: 'reopen' });
  assert.equal(r.statusCode, 409);
  assert.deepEqual(r.body, { error: 'Event is not finalized.' });
  assert.equal(JSON.stringify(tById('t1')), before);
  tById('t1').data.finalized = false;
  const again = await act('t1', { action: 'reopen' });
  assert.equal(again.statusCode, 409);
});

test('reopen: then the owner can save it through the tournaments API, and finalizing locks it again', async () => {
  const owner = cookieFor(byId('org1'));
  const PUT = (data, stamp) => callHandler(tournamentHandler, {
    method: 'PUT', query: { id: 't2' }, cookies: owner, body: { data, expectedUpdatedAt: stamp },
  });
  const locked = await PUT({ name: 'x' }, tById('t2').updated_at.toISOString());
  assert.equal(locked.statusCode, 403);
  assert.equal(locked.body.finalized, true);

  db.advance(1000);
  await act('t2', { action: 'reopen' });
  const stale = await PUT({ name: 'x' }, '2026-10-01T00:02:00.000Z');   // the stamp the owner's open tab still has
  assert.equal(stale.statusCode, 409);                                   // the normal stale-tab answer, no corruption
  const fresh = await PUT(Object.assign({}, tById('t2').data, { note: 'edited' }), tById('t2').updated_at.toISOString());
  assert.equal(fresh.statusCode, 200);
  assert.equal(tById('t2').data.note, 'edited');

  db.advance(1000);
  const fin = await PUT(Object.assign({}, tById('t2').data, { finalized: { at: '2026-10-14T12:00:00.000Z' } }), tById('t2').updated_at.toISOString());
  assert.equal(fin.statusCode, 200);
  const again = await PUT({ name: 'y' }, tById('t2').updated_at.toISOString());
  assert.equal(again.statusCode, 403);
});

test('unpublish: published and listed both false, everything else (slug, finalized) kept, updated_at bumped', async () => {
  const dataBefore = JSON.parse(JSON.stringify(tById('t2').data));
  db.advance(60000);
  const r = await act('t2', { action: 'unpublish' });
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.event.published, false);
  assert.equal(r.body.event.listed, false);
  assert.equal(r.body.event.finalizedAt, FINAL.at);
  assert.deepEqual(tById('t2').data, Object.assign({}, dataBefore, { published: false, listed: false }));
  assert.equal(tById('t2').data.publicSlug, 'def');
  assert.equal(tById('t2').updated_at.getTime(), db.now().getTime());
  assert.equal(tById('t2').created_by, 'org1');
});

test('unpublish: works on an event that was never published or listed', async () => {
  const r = await act('t3', { action: 'unpublish' });
  assert.equal(r.statusCode, 200);
  assert.equal(tById('t3').data.published, false);
  assert.equal(tById('t3').data.listed, false);
});

test('unlist: only listed becomes false, published stays true, updated_at bumped', async () => {
  const dataBefore = JSON.parse(JSON.stringify(tById('t1').data));
  db.advance(60000);
  const r = await act('t1', { action: 'unlist' });
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.event.published, true);
  assert.equal(r.body.event.listed, false);
  assert.deepEqual(tById('t1').data, Object.assign({}, dataBefore, { listed: false }));
  assert.equal(tById('t1').updated_at.getTime(), db.now().getTime());
});

test('unpublish / unlist make the owner\'s open tab fail with the normal 409, not a silent overwrite', async () => {
  const stamp = tById('t1').updated_at.toISOString();
  db.advance(1000);
  await act('t1', { action: 'unlist' });
  const r = await callHandler(tournamentHandler, {
    method: 'PUT', query: { id: 't1' }, cookies: cookieFor(byId('org1')),
    body: { data: { name: 'stale' }, expectedUpdatedAt: stamp },
  });
  assert.equal(r.statusCode, 409);
  assert.equal(tById('t1').data.listed, false);
});

test('transfer: moves just this event, keeps finalized and every other field, does not bump updated_at', async () => {
  const before = JSON.parse(JSON.stringify(tById('t2')));
  const stamp = tById('t2').updated_at.getTime();
  db.advance(60000);
  const r = await act('t2', { action: 'transfer', toOrganizerId: 'org2' });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.body.event.owner, { id: 'org2', name: 'Bob', email: 'b@example.com' });
  assert.equal(r.body.event.finalizedAt, FINAL.at);
  assert.equal(tById('t2').created_by, 'org2');
  assert.deepEqual(tById('t2').data, before.data);
  assert.equal(tById('t2').updated_at.getTime(), stamp);
  assert.equal(tById('t1').created_by, 'org1');     // the owner's other event stays
});

test('transfer: target rules (missing 400, same owner 400, unknown or Public 404, suspended 409), nothing moves', async () => {
  const before = JSON.stringify(db.tables.tournaments);
  const missing = await act('t1', { action: 'transfer' });
  assert.equal(missing.statusCode, 400);
  assert.equal((await act('t1', { action: 'transfer', toOrganizerId: '' })).statusCode, 400);
  assert.equal((await act('t1', { action: 'transfer', toOrganizerId: 42 })).statusCode, 400);
  const same = await act('t1', { action: 'transfer', toOrganizerId: 'org1' });
  assert.equal(same.statusCode, 400);
  assert.equal((await act('t1', { action: 'transfer', toOrganizerId: 'ghost' })).statusCode, 404);
  assert.equal((await act('t1', { action: 'transfer', toOrganizerId: 'pub' })).statusCode, 404);
  const susp = await act('t1', { action: 'transfer', toOrganizerId: 'orgS' });
  assert.equal(susp.statusCode, 409);
  assert.equal(JSON.stringify(db.tables.tournaments), before);
});

test('transfer: uses the same rules and messages as the organisers transfer (shared helper)', async () => {
  const cases = [{}, { toOrganizerId: 'org1' }, { toOrganizerId: 'ghost' }, { toOrganizerId: 'pub' }, { toOrganizerId: 'orgS' }];
  for (const body of cases) {
    const a = await act('t1', Object.assign({ action: 'transfer' }, body));
    const b = await callHandler(organizersTransfer, { method: 'POST', query: { id: 'org1' }, body, cookies: asAdmin() });
    assert.equal(a.statusCode, b.statusCode, JSON.stringify(body));
    assert.deepEqual(a.body, b.body, JSON.stringify(body));
  }
});

test('transfer to an organiser who is unverified is allowed (same as Task 2)', async () => {
  byId('org2').email_verified_at = null;
  const r = await act('t1', { action: 'transfer', toOrganizerId: 'org2' });
  assert.equal(r.statusCode, 200);
});

test('delete: removes the event permanently, even a finalized one; others untouched', async () => {
  const r = await act('t2', { action: 'delete' });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.body, { ok: true });
  assert.equal(tById('t2'), undefined);
  assert.equal(db.tables.tournaments.length, 4);
  const again = await act('t2', { action: 'delete' });
  assert.equal(again.statusCode, 404);
  const plain = await act('t1', { action: 'delete' });
  assert.equal(plain.statusCode, 200);
  assert.equal(db.tables.tournaments.length, 3);
});

test('the tournaments API still refuses to delete a finalized event, even for an admin', async () => {
  // the tournaments handler still refuses a finalized delete, even for an admin
  const r = await callHandler(tournamentHandler, { method: 'DELETE', query: { id: 't2' }, cookies: asAdmin() });
  assert.equal(r.statusCode, 403);
  assert.ok(tById('t2'));
});

test('action responses carry the event summary shape (and no data blob)', async () => {
  const r = await act('t1', { action: 'unlist' });
  assert.deepEqual(Object.keys(r.body), ['event']);
  assert.deepEqual(Object.keys(r.body.event).sort(),
    ['date', 'eventName', 'finalizedAt', 'format', 'id', 'listed', 'owner', 'published', 'tournamentName', 'updatedAt']);
});

test('an admin action on a malformed id just 404s', async () => {
  assert.equal((await act('', { action: 'delete' })).statusCode, 400);
  assert.equal((await act(undefined, { action: 'delete' })).statusCode, 400);
  assert.equal((await act("t1' OR '1'='1", { action: 'delete' })).statusCode, 404);
  assert.equal(db.tables.tournaments.length, 5);
});

test('the fake db still fails loudly on unknown SQL', async () => {
  await assert.rejects(() => db.sql`SELECT data FROM tournaments`, /unrecognised SQL/);
});

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { createFakeDb } = require('./lib/fake-db');
const { callHandler } = require('./lib/call-handler');

const dbPath = require.resolve('../api/_lib/db');
let db;
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { sql: (...args) => db.sql(...args) } };

const auth = require('../api/_lib/auth');
const handler = require('../api/tournaments/[id]');
const { sanitizeTournamentData, isImage, isRouteId } = require('../tournament-sanitize');

const SECRET = 'test-secret-for-sanitize';
const COOKIE = '__Host-session';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';
const HOSTILE = ['x" onerror="alert(1)', 'javascript:alert(1)', 'data:text/html;base64,PHNjcmlwdD4=', 'data:image/svg+xml;base64,PHN2Zz4=', 'https://evil.test/a.png', PNG + '" onerror="alert(1)', PNG + '\n', ''];

let saved;
const owner = { id: 'org1', email: 'a@example.com', name: 'Alice', password_hash: 'x', role: 'organizer', tier: 'pro', suspended: false, email_verified_at: new Date('2026-01-01T00:00:00Z'), token_version: 0 };
const admin = Object.assign({}, owner, { id: 'adm1', email: 'root@example.com', name: 'Root', role: 'admin' });
const cookieFor = (o) => ({ [COOKIE]: jwt.sign({ sub: o.id, email: o.email, name: o.name, tv: o.token_version }, SECRET, { expiresIn: 600 }) });
const put = (id, data, who, stamp) => callHandler(handler, { method: 'PUT', query: { id }, cookies: cookieFor(who || owner), body: { data, expectedUpdatedAt: stamp || null } });
const stored = (id) => db.tables.tournaments.find((t) => t.id === id);

beforeEach(() => {
  saved = { SESSION_SECRET: process.env.SESSION_SECRET, REQUIRE_LOGIN: process.env.REQUIRE_LOGIN };
  process.env.SESSION_SECRET = SECRET; process.env.REQUIRE_LOGIN = 'true';
  db = createFakeDb({ organizers: [Object.assign({}, owner), Object.assign({}, admin)], tournaments: [] });
  auth._resetPublicOrganizerCache();
});
afterEach(() => { Object.keys(saved).forEach((k) => { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }); });

/* ---------- the pure sanitizer ---------- */
test('isImage accepts only base64 png, jpeg, gif and webp data URIs', () => {
  for (const t of ['png', 'jpeg', 'gif', 'webp']) assert.equal(isImage('data:image/' + t + ';base64,AAAA'), true);
  HOSTILE.forEach((h) => assert.equal(isImage(h), false, h));
  [null, undefined, 5, {}, ['data:image/png;base64,AAAA']].forEach((h) => assert.equal(isImage(h), false));
});

test('isRouteId: letters, digits, _ and - up to 80', () => {
  ['t_abc123', 'a-b', 'A', 'x'.repeat(80)].forEach((id) => assert.equal(isRouteId(id), true, id));
  ['', 'x'.repeat(81), "a'b", 'a"b', 'a b', 'a/b', 'a.b', '<x>', null, undefined, ['t_a'], 5].forEach((id) => assert.equal(isRouteId(id), false, String(id)));
});

test('a hostile logo is removed; legitimate logos survive', () => {
  HOSTILE.forEach((h) => { const d = sanitizeTournamentData({ format: { logo: h, logoAspect: 1 } }); assert.equal('logo' in d.format, false, h); assert.equal(d.format.logoAspect, 1); });
  assert.equal(sanitizeTournamentData({ format: { logo: PNG } }).format.logo, PNG);
  assert.equal(sanitizeTournamentData({ format: { logo: null } }).format.logo, null);
  assert.deepEqual(sanitizeTournamentData({ format: { name: 'x' } }).format, { name: 'x' });
});

test('hostile sponsors are dropped, good ones (string or {src}) kept in order', () => {
  const d = sanitizeTournamentData({ format: { sponsors: [PNG, { src: JPG, shape: 'square' }, 'javascript:1', { src: HOSTILE[0] }, { src: PNG + '" onerror="x' }, null, 5, { shape: 'rect' }, { src: PNG, shape: 'rect' }] } });
  assert.deepEqual(JSON.parse(JSON.stringify(d.format.sponsors)), [PNG, { src: JPG, shape: 'square' }, { src: PNG, shape: 'rect' }]);
  assert.deepEqual(JSON.parse(JSON.stringify(sanitizeTournamentData({ format: { sponsors: 'nope' } }).format.sponsors)), []);
});

test('ids are reduced to a safe alphabet wherever they are stored; legitimate ids are untouched', () => {
  const d = sanitizeTournamentData({
    entriesList: [{ id: "e_1'x", name: "O'Brien <b>" }, { id: 'e_abc123xy', name: 'Fine' }],
    groups: [{ id: 'g"1', entryIds: ['e_1', "e'2", 'e_ok|x'], scores: { 'a|b': 1 } }],
    knockout: { rounds: [[{ aEntryId: "a');alert(1);('", bEntryId: 'b', winnerId: null }]] },
  });
  assert.equal(d.entriesList[0].id, 'e_1_x');
  assert.equal(d.entriesList[1].id, 'e_abc123xy');
  assert.equal(d.entriesList[0].name, "O'Brien <b>");              // names are not touched on the server side
  assert.equal(d.groups[0].id, 'g_1');
  assert.deepEqual(Array.from(d.groups[0].entryIds), ['e_1', 'e_2', 'e_ok|x']);
  assert.equal(d.knockout.rounds[0][0].aEntryId, 'a___alert_1____');
  assert.equal(d.knockout.rounds[0][0].winnerId, null);
  assert.deepEqual(JSON.parse(JSON.stringify(d.groups[0].scores)), { 'a|b': 1 });
});

test('publicSlug must be a plain token', () => {
  assert.equal(sanitizeTournamentData({ publicSlug: 'abc123xyz' }).publicSlug, 'abc123xyz');
  for (const bad of ['a b', '"><x>', '', 'x'.repeat(65), 5]) assert.equal('publicSlug' in sanitizeTournamentData({ publicSlug: bad }), false);
});

test('text is never rewritten: names with quotes and angle brackets round-trip byte for byte', () => {
  const src = () => ({ name: 'a<b>"c', list: ['<i>', { n: '"x"' }], eventCreation: { tournamentName: 'Cup "Open" <1>', entries: 8 }, entriesList: [{ id: 'e_1', name: 'It\'s "me" <b>', org: '"><x>' }], format: { footerText: '</script>' } });
  const before = JSON.stringify(src());
  assert.equal(JSON.stringify(sanitizeTournamentData(src())), before);
  for (const junk of [null, undefined, 5, 'x', [], {}, { format: null }, { format: [] }, { format: { logo: 5, sponsors: null } }, { eventCreation: 5 }, { format: { knockoutLegs: 5, breaks: [], mixedRubbers: 'x' } }]) assert.doesNotThrow(() => sanitizeTournamentData(junk));
});

test('number fields holding text that is not a number are replaced by a default; real numbers and numeric strings stay', () => {
  const evil = '"><img src=x onerror=alert(1)>';
  const d = sanitizeTournamentData({
    eventCreation: { entries: evil, boards: evil },
    format: { bestOfLegs: evil, podLegs: evil, maxPerGroup: evil, numSeeds: evil, podCount: evil, teamSize: evil, qualifiersPerGroup: evil, plateQualifiersPerGroup: evil,
      knockoutLegs: { main: { early: evil, quarterfinal: evil, semifinal: evil, final: evil }, plate: { flatLegs: evil, early: 3 } },
      mixedRubbers: [{ name: 'S', startingScore: evil, legs: evil }], breaks: { roundRobin: { minutes: evil, time: '12:00' } } },
    groups: [{ id: 'g', boards: evil }, { id: 'h', boards: [1, evil, '2'] }],
  });
  assert.deepEqual(JSON.parse(JSON.stringify(d.eventCreation)), { entries: 8, boards: 4 });
  const f = d.format;
  assert.equal(f.bestOfLegs, 5); assert.equal(f.podLegs, 5); assert.equal(f.maxPerGroup, 4); assert.equal(f.numSeeds, 8); assert.equal(f.podCount, 8);
  assert.equal(f.teamSize, 4); assert.equal(f.qualifiersPerGroup, 2); assert.equal('plateQualifiersPerGroup' in f, false);
  assert.deepEqual(JSON.parse(JSON.stringify(f.knockoutLegs)), { main: { early: 5, quarterfinal: 5, semifinal: 5, final: 5 }, plate: { flatLegs: 5, early: 3 } });
  assert.deepEqual(JSON.parse(JSON.stringify(f.mixedRubbers)), [{ name: 'S', startingScore: 501, legs: 3 }]);
  assert.deepEqual(JSON.parse(JSON.stringify(f.breaks)), { roundRobin: { minutes: 30, time: '12:00' } });
  assert.equal('boards' in d.groups[0], false);
  assert.deepEqual(Array.from(d.groups[1].boards), [1, 2]);
  const ok = { eventCreation: { entries: 12, boards: 6 }, format: { bestOfLegs: '5', maxPerGroup: 4, plateQualifiersPerGroup: '', numSeeds: 0, knockoutLegs: { main: { early: 3, final: '7' } } }, groups: [{ id: 'g', boards: [1, 2] }] };
  const before = JSON.stringify(ok);
  assert.equal(JSON.stringify(sanitizeTournamentData(JSON.parse(before))), before);   // legitimate values are untouched
});

test('time fields must look like a time', () => {
  const d = sanitizeTournamentData({ format: { anticipatedStartTime: '"><x>', breaks: { roundRobin: { time: 'javascript:1' }, knockout: { time: '15:30' } } } });
  assert.equal(d.format.anticipatedStartTime, '');
  assert.equal(d.format.breaks.roundRobin.time, '');
  assert.equal(d.format.breaks.knockout.time, '15:30');
  assert.equal(sanitizeTournamentData({ format: { anticipatedStartTime: '09:05' } }).format.anticipatedStartTime, '09:05');
  assert.equal(sanitizeTournamentData({ format: { anticipatedStartTime: '' } }).format.anticipatedStartTime, '');
});

/* ---------- the PUT handler ---------- */
test('PUT with a bad route id is 400 and writes nothing', async () => {
  for (const id of ["t'1", 't"1', 't 1', 't/1', '<x>', 'x'.repeat(81), '']) {
    const r = await put(id, { name: 'x' });
    assert.equal(r.statusCode, 400, id);
  }
  assert.equal(db.tables.tournaments.length, 0);
  assert.equal((await put('t_ok-1', { name: 'x' })).statusCode, 201);
});

test('PUT strips a hostile logo and sponsors before storing (insert and update, owner and admin)', async () => {
  const body = () => ({ name: 'x', format: { logo: HOSTILE[0], sponsors: [PNG, HOSTILE[1], { src: HOSTILE[0] }, { src: JPG, shape: 'square' }] }, entriesList: [{ id: "e'1", name: 'N' }] });
  let r = await put('t_new', body());
  assert.equal(r.statusCode, 201);
  const s = stored('t_new').data;
  assert.equal('logo' in s.format, false);
  assert.deepEqual(JSON.parse(JSON.stringify(s.format.sponsors)), [PNG, { src: JPG, shape: 'square' }]);
  assert.equal(s.entriesList[0].id, 'e_1');
  const st = () => new Date(stored('t_new').updated_at || r.body.updated_at).toISOString();
  r = await put('t_new', body(), owner, st());
  assert.equal(r.statusCode, 200);
  assert.equal('logo' in stored('t_new').data.format, false);
  r = await put('t_new', body(), admin, st());
  assert.equal(r.statusCode, 200);
  assert.equal('logo' in stored('t_new').data.format, false);
  assert.equal(stored('t_new').created_by, 'org1');
});

test('PUT keeps legitimate data exactly: data-URI logo and sponsors, names with quotes, normal ids', async () => {
  const data = { name: 'Cup "The Big" <1>', format: { logo: PNG, sponsors: [{ src: PNG, shape: 'rect' }, { src: JPG, shape: 'square' }] },
    entriesList: [{ id: 'e_k3j2h1g0', name: 'Mick "Bull" O\'Hara' }], groups: [{ id: 'g_a1b2c3d4', entryIds: ['e_k3j2h1g0'], scores: { 'e_k3j2h1g0|e_x': { legs1: 3, legs2: 1 } } }], publicSlug: 'abc123def456' };
  const r = await put('t_keep', JSON.parse(JSON.stringify(data)));
  assert.equal(r.statusCode, 201);
  assert.deepEqual(JSON.parse(JSON.stringify(stored('t_keep').data)), data);
});

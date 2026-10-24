const { test } = require('node:test');
const assert = require('node:assert/strict');

// Server side of the Basic entry limit: PUT /api/tournaments/:id. Fakes in place of db.js and auth.js (as in tournament-lock.test.js).
const dbPath = require.resolve('../api/_lib/db');
const authPath = require.resolve('../api/_lib/auth');
let store = {}, calls = [], organizer = { id: 'org1', tier: 'basic' };
const UPDATED = '2026-10-13T10:00:00.000Z';
const FINAL_MSG = 'This event is finalized. Only an Admin can change it.';

require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
  sql: async (strings, ...vals) => {
    const text = strings.join('?').replace(/\s+/g, ' ');
    calls.push({ text, vals });
    if (/^\s*SELECT/i.test(text)) {
      const row = store[vals[0]];
      if (!row) return [];
      if (/created_by = \?/.test(text) && row.created_by !== vals[1]) return [];
      return [row];
    }
    if (/^\s*UPDATE/i.test(text)) {
      const row = store[vals[1]];
      if (!row) return [];
      row.updated_at = '2026-10-13T12:00:00.000Z';
      return [{ id: vals[1], updated_at: row.updated_at }];
    }
    if (/^\s*INSERT/i.test(text)) return [{ id: vals[0], updated_at: '2026-10-13T12:00:00.000Z' }];
    return [];
  },
} };
require.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports: {
  requireAuth: async () => organizer,
} };

const handler = require('../api/tournaments/[id]');

const entries = (n, withdrawn) => Array.from({ length: n }, (_, i) => ({ id: 'e' + i, name: 'E' + i, withdrawn: !!(withdrawn && i < withdrawn) }));
function seed(id, data) {
  store = {}; calls = [];
  if (data) store[id] = { id, data, updated_at: UPDATED, created_by: 'org1' };
}
function put(id, data) {
  const res = { statusCode: 0, body: undefined };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { res.body = o; return res; };
  res.end = () => res;
  return handler({ method: 'PUT', query: { id }, body: { data, expectedUpdatedAt: store[id] ? UPDATED : null } }, res).then(() => res);
}
const writes = () => calls.filter((c) => /^\s*(UPDATE|INSERT)/i.test(c.text)).length;
const tier = (t) => { organizer = { id: 'org1', tier: t }; };

test('new event: Basic with 65 active entries is refused with entry_limit and nothing is written', async () => {
  tier('basic'); seed('n1');
  const res = await put('n1', { name: 'N', entriesList: entries(65) });
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { code: 'entry_limit', limit: 64, error: 'Basic accounts allow up to 64 entries per event.' });
  assert.equal(writes(), 0);
});

test('new event: Basic with exactly 64 entries is created', async () => {
  tier('basic'); seed('n1');
  const res = await put('n1', { name: 'N', entriesList: entries(64) });
  assert.equal(res.statusCode, 201);
  assert.equal(writes(), 1);
});

test('withdrawn entries are not counted', async () => {
  tier('basic'); seed('n1');
  const res = await put('n1', { name: 'N', entriesList: entries(70, 6) });   // 70 in the list, 64 active
  assert.equal(res.statusCode, 201);
});

test('Pro is unlimited, on insert and on update', async () => {
  tier('pro'); seed('n1');
  assert.equal((await put('n1', { entriesList: entries(200) })).statusCode, 201);
  seed('t1', { entriesList: entries(10) });
  assert.equal((await put('t1', { entriesList: entries(300) })).statusCode, 200);
});

test('the Public fallback organiser (pro) is never limited', async () => {
  organizer = { id: 'org1', role: 'organizer', tier: 'pro' }; seed('n1');
  assert.equal((await put('n1', { entriesList: entries(100) })).statusCode, 201);
});

test('an unknown or missing tier is limited like Basic', async () => {
  organizer = { id: 'org1' }; seed('n1');
  assert.equal((await put('n1', { entriesList: entries(65) })).statusCode, 403);
  organizer = { id: 'org1', tier: 'platinum' }; seed('n2');
  assert.equal((await put('n2', { entriesList: entries(65) })).statusCode, 403);
});

test('update: growing a stored event past 64 is refused', async () => {
  tier('basic'); seed('t1', { entriesList: entries(64) });
  const res = await put('t1', { entriesList: entries(65) });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'entry_limit');
  assert.equal(writes(), 0);
});

test('downgrade: an existing 70-entry event can be saved at 70 or fewer, but not grown to 71', async () => {
  tier('basic');
  seed('t1', { entriesList: entries(70) });
  assert.equal((await put('t1', { name: 'renamed', entriesList: entries(70) })).statusCode, 200);
  seed('t1', { entriesList: entries(70) });
  assert.equal((await put('t1', { entriesList: entries(66) })).statusCode, 200);
  seed('t1', { entriesList: entries(70) });
  const res = await put('t1', { entriesList: entries(71) });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'entry_limit');
});

test('finalized lock still wins first: a finalized row plus an over-limit save answers finalized', async () => {
  tier('basic'); seed('t1', { entriesList: entries(10), finalized: { at: '2026-10-13T09:00:00.000Z' } });
  const res = await put('t1', { entriesList: entries(200) });
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { code: 'finalized', error: FINAL_MSG, finalized: true });
});

test('the list endpoint only reads (no write path there)', async () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'api', 'tournaments', 'index.js'), 'utf8');
  assert.doesNotMatch(src, /\b(INSERT|UPDATE|DELETE)\b/);
});

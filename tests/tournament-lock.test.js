const { test } = require('node:test');
const assert = require('node:assert/strict');

// Fakes in place of api/_lib/db.js and api/_lib/auth.js, so the handler runs without Neon or a session.
const dbPath = require.resolve('../api/_lib/db');
const authPath = require.resolve('../api/_lib/auth');
let store = {}, calls = [], beforeWrite = null;   // beforeWrite: simulates another request landing between the handler's SELECT and its write
const FINAL_MSG = 'This event is finalized. Only an Admin can change it.';

require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
  sql: async (strings, ...vals) => {
    const text = strings.join('?').replace(/\s+/g, ' ');
    calls.push({ text, vals });
    if (/^\s*SELECT/i.test(text)) {
      const row = store[vals[0]];
      if (!row) return [];
      // Queries that filter on created_by only see the caller's own rows.
      if (/created_by = \?/.test(text) && row.created_by !== vals[1]) return [];
      return [row];
    }
    if (/^\s*UPDATE/i.test(text)) {
      if (beforeWrite) { const h = beforeWrite; beforeWrite = null; h(); }
      const row = store[vals[1]];
      if (!row) return [];
      // The write must be conditional on the stamp the handler read (to the millisecond).
      if (/updated_at/.test(text.split('WHERE')[1] || '') && !(Math.abs(new Date(row.updated_at) - new Date(vals[3])) < 1)) return [];
      row.updated_at = '2026-10-13T12:00:00.000Z';
      return [{ id: vals[1], updated_at: row.updated_at }];
    }
    if (/^\s*DELETE/i.test(text)) {
      if (beforeWrite) { const h = beforeWrite; beforeWrite = null; h(); }
      const row = store[vals[0]];
      if (!row || row.created_by !== vals[1]) return [];
      // Mirrors the SQL guard: only rows whose data->>'finalized' is NULL or 'false' / '0' / '' may be deleted.
      if (/data->>'finalized'/.test(text)) {
        const f = row.data && row.data.finalized;
        const asText = f === undefined || f === null ? null : (typeof f === 'object' ? JSON.stringify(f) : String(f));
        if (!(asText === null || ['false', '0', ''].includes(asText))) return [];
      }
      delete store[vals[0]];
      return [{ id: vals[0] }];
    }
    if (/^\s*INSERT/i.test(text)) return [{ id: vals[0], updated_at: '2026-10-13T12:00:00.000Z' }];
    return [];
  },
} };
require.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports: {
  requireAuth: async () => ({ id: 'org1' }),
} };

const handler = require('../api/tournaments/[id]');

const UPDATED = '2026-10-13T10:00:00.000Z';
function seed(id, data, owner) {
  store = {}; calls = []; beforeWrite = null;
  store[id] = { id, data, updated_at: UPDATED, created_by: owner || 'org1' };
}
function call(method, id, body) {
  const res = { statusCode: 0, body: undefined, ended: false };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { res.body = o; return res; };
  res.end = () => { res.ended = true; return res; };
  return handler({ method, query: { id }, body }, res).then(() => res);
}
const issued = (re) => calls.filter((c) => re.test(c.text));
const putBody = (data) => ({ data, expectedUpdatedAt: UPDATED });

test('PUT on a finalized row is refused with 403 and nothing is written', async () => {
  seed('t1', { name: 'X', finalized: { at: '2026-10-13T09:00:00.000Z' } });
  const res = await call('PUT', 't1', putBody({ name: 'Edited' }));
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { code: 'finalized', error: FINAL_MSG, finalized: true });
  assert.equal(issued(/^\s*UPDATE/i).length, 0);
  assert.equal(issued(/^\s*INSERT/i).length, 0);
});

test('PUT is refused even when the incoming data drops the finalized field', async () => {
  seed('t1', { name: 'X', finalized: { at: '2026-10-13T09:00:00.000Z' } });
  const res = await call('PUT', 't1', putBody({ name: 'X' }));
  assert.equal(res.statusCode, 403);
  assert.equal(issued(/^\s*UPDATE/i).length, 0);
});

test('DELETE on a finalized row is refused with 403 and nothing is deleted', async () => {
  seed('t1', { name: 'X', finalized: { at: '2026-10-13T09:00:00.000Z' } });
  const res = await call('DELETE', 't1');
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { code: 'finalized', error: FINAL_MSG, finalized: true });
  assert.equal(issued(/^\s*DELETE/i).length, 0);
});

test('PUT that first sets finalized on a non-finalized row is saved (finalizing works)', async () => {
  seed('t1', { name: 'X' });
  const res = await call('PUT', 't1', putBody({ name: 'X', finalized: { at: '2026-10-13T11:00:00.000Z' } }));
  assert.equal(res.statusCode, 200);
  assert.equal(issued(/^\s*UPDATE/i).length, 1);
});

test('a non-finalized row is saved and deleted as before', async () => {
  seed('t1', { name: 'X' });
  const put = await call('PUT', 't1', putBody({ name: 'Y' }));
  assert.equal(put.statusCode, 200);
  assert.equal(issued(/^\s*UPDATE/i).length, 1);
  const del = await call('DELETE', 't1');
  assert.equal(del.statusCode, 204);
  assert.ok(del.ended);
  assert.equal(issued(/^\s*DELETE/i).length, 1);
});

test('a stale expectedUpdatedAt on a non-finalized row is still a 409', async () => {
  seed('t1', { name: 'X' });
  const res = await call('PUT', 't1', { data: { name: 'Y' }, expectedUpdatedAt: '2020-01-01T00:00:00.000Z' });
  assert.equal(res.statusCode, 409);
  assert.equal(issued(/^\s*UPDATE/i).length, 0);
});

test('PUT creates a new row as before', async () => {
  seed('t1', { name: 'X' });
  const res = await call('PUT', 'brandnew', { data: { name: 'N' } });
  assert.equal(res.statusCode, 201);
  assert.equal(issued(/^\s*INSERT/i).length, 1);
});

test('DELETE of a missing row stays a 204', async () => {
  seed('t1', { name: 'X' });
  const res = await call('DELETE', 'nothere');
  assert.equal(res.statusCode, 204);
  assert.ok(res.ended);
});

test('any truthy finalized value locks the row, including true and {}', async () => {
  for (const f of [true, {}, 'yes', { at: 5 }]) {
    seed('t1', { name: 'X', finalized: f });
    const put = await call('PUT', 't1', putBody({ name: 'Y' }));
    assert.equal(put.statusCode, 403, 'PUT ' + JSON.stringify(f));
    const del = await call('DELETE', 't1');
    assert.equal(del.statusCode, 403, 'DELETE ' + JSON.stringify(f));
    assert.equal(issued(/^\s*(UPDATE|DELETE)/i).length, 0);
  }
});

test('falsy finalized values do not lock the row', async () => {
  for (const f of [null, false, 0, '']) {
    seed('t1', { name: 'X', finalized: f });
    const put = await call('PUT', 't1', putBody({ name: 'Y' }));
    assert.equal(put.statusCode, 200, JSON.stringify(f));
  }
});

test('GET on a finalized row is unchanged', async () => {
  seed('t1', { name: 'X', finalized: { at: '2026-10-13T09:00:00.000Z' } });
  const res = await call('GET', 't1');
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.id, 't1');
  assert.ok(res.body.data.finalized);
});

test('a finalized row owned by another organiser is a 404 on PUT, and untouched by DELETE', async () => {
  seed('t1', { name: 'X', finalized: { at: '2026-10-13T09:00:00.000Z' } }, 'someoneelse');
  const put = await call('PUT', 't1', putBody({ name: 'Y' }));
  assert.equal(put.statusCode, 404);
  assert.deepEqual(put.body, { code: 'not_found', error: 'Not found.' });
  const del = await call('DELETE', 't1');
  assert.notEqual(del.statusCode, 403);
  // Any DELETE issued is scoped to the caller's own rows, so it cannot touch this one.
  issued(/^\s*DELETE/i).forEach((c) => assert.match(c.text, /created_by = \?/));
  const get = await call('GET', 't1');
  assert.equal(get.statusCode, 404);
});

test('PUT: another save landing after the SELECT makes the conditional UPDATE match nothing, so the answer is 409 with the current row', async () => {
  seed('t1', { name: 'X' });
  beforeWrite = () => { store.t1.data = { name: 'Other tab' }; store.t1.updated_at = '2026-10-13T10:30:00.000Z'; };
  const res = await call('PUT', 't1', putBody({ name: 'Mine' }));
  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body.current.data, { name: 'Other tab' });
  assert.equal(store.t1.data.name, 'Other tab');          // nothing overwritten
});

test('PUT: the row being finalized between the SELECT and the UPDATE is refused with 403, not silently overwritten', async () => {
  seed('t1', { name: 'X' });
  beforeWrite = () => { store.t1.data = { name: 'X', finalized: { at: '2026-10-13T10:30:00.000Z' } }; store.t1.updated_at = '2026-10-13T10:30:00.000Z'; };
  const res = await call('PUT', 't1', putBody({ name: 'Mine' }));
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { code: 'finalized', error: FINAL_MSG, finalized: true });
  assert.equal(store.t1.data.name, 'X'); assert.ok(store.t1.data.finalized);
});

test('PUT: the UPDATE is conditional on the stored stamp, and a normal save still goes through', async () => {
  seed('t1', { name: 'X' });
  const res = await call('PUT', 't1', putBody({ name: 'Y' }));
  assert.equal(res.statusCode, 200);
  assert.match(issued(/^\s*UPDATE/i)[0].text, /WHERE id = \? AND created_by = \? AND .*updated_at/);
});

test('DELETE: the row being finalized between the SELECT and the DELETE is refused by the SQL itself and answers 403', async () => {
  seed('t1', { name: 'X' });
  beforeWrite = () => { store.t1.data = { name: 'X', finalized: { at: '2026-10-13T10:30:00.000Z' } }; };
  const res = await call('DELETE', 't1');
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { code: 'finalized', error: FINAL_MSG, finalized: true });
  assert.ok(store.t1, 'the row must still exist');
});

test('DELETE: the SQL carries the finalized guard, and falsy stored values are still deletable', async () => {
  seed('t1', { name: 'X', finalized: false });
  const res = await call('DELETE', 't1');
  assert.equal(res.statusCode, 204);
  assert.match(issued(/^\s*DELETE/i)[0].text, /data->>'finalized' IS NULL/);
  assert.equal(store.t1, undefined);
});

/* ---------- the finalized time comes from the server clock ---------- */
const writtenData = () => {
  const u = issued(/^\s*UPDATE/i)[0], i = issued(/^\s*INSERT/i)[0];
  return JSON.parse(u ? u.vals[0] : i.vals[1]);
};
const nearNow = (iso, before, after) => { const ms = new Date(iso).getTime(); return ms >= before && ms <= after; };

test('finalizing: the server stamps its own time, whatever the client sent (future, past, junk)', async () => {
  const sent = [
    { at: '2999-01-01T00:00:00.000Z' }, { at: '1999-01-01T00:00:00.000Z' }, { at: 'not a date', extra: 1, more: [1] },
    true, {}, 'yes', 7, [], { at: 12345 },
  ];
  for (const f of sent) {
    seed('t1', { name: 'X' });
    const before = Date.now();
    const res = await call('PUT', 't1', putBody({ name: 'X', finalized: f }));
    const after = Date.now();
    assert.equal(res.statusCode, 200, JSON.stringify(f));
    const w = writtenData();
    assert.deepEqual(Object.keys(w.finalized), ['at'], 'only the one key survives: ' + JSON.stringify(f));
    assert.equal(new Date(w.finalized.at).toISOString(), w.finalized.at);
    assert.ok(nearNow(w.finalized.at, before, after), 'server time, not ' + JSON.stringify(f));
    assert.deepEqual(res.body.finalized, w.finalized, 'the response carries what was saved');
    assert.equal(res.body.id, 't1');
    assert.equal(res.body.updated_at, '2026-10-13T12:00:00.000Z');
  }
});

test('finalizing a row that does not exist yet (201) is stamped by the server too and returns finalized', async () => {
  seed('t1', { name: 'X' });
  const before = Date.now();
  const res = await call('PUT', 'brandnew', { data: { name: 'N', finalized: { at: '2999-01-01T00:00:00.000Z' } } });
  const after = Date.now();
  assert.equal(res.statusCode, 201);
  const w = writtenData();
  assert.ok(nearNow(w.finalized.at, before, after));
  assert.deepEqual(res.body.finalized, w.finalized);
  assert.equal(res.body.id, 'brandnew');
});

test('a second finalize attempt on an already finalized row is still 403 and writes nothing', async () => {
  seed('t1', { name: 'X' });
  assert.equal((await call('PUT', 't1', putBody({ name: 'X', finalized: { at: '2000-01-01T00:00:00.000Z' } }))).statusCode, 200);
  seed('t1', { name: 'X', finalized: { at: '2026-10-13T09:00:00.000Z' } });
  const again = await call('PUT', 't1', putBody({ name: 'X', finalized: { at: '2999-01-01T00:00:00.000Z' } }));
  assert.equal(again.statusCode, 403);
  assert.deepEqual(again.body, { code: 'finalized', error: FINAL_MSG, finalized: true });
  assert.equal(issued(/^\s*UPDATE/i).length, 0);
  assert.equal(store.t1.data.finalized.at, '2026-10-13T09:00:00.000Z');
});

test('saves without finalized are unchanged: the data is written as sent (plus settingsRev) and the response has no finalized key', async () => {
  seed('t1', { name: 'X' });
  const res = await call('PUT', 't1', putBody({ name: 'Y' }));
  assert.equal(res.statusCode, 200);
  /* written as sent, plus the settings counter the server keeps (floor officials, 2026-10-30): a change to anything but
     results bumps it, and the answer says what it is now */
  assert.deepEqual(writtenData(), { name: 'Y', settingsRev: 1 });
  assert.deepEqual(res.body, { id: 't1', updated_at: '2026-10-13T12:00:00.000Z', settingsRev: 1 });
  const created = await call('PUT', 'brandnew', { data: { name: 'N' } });
  assert.equal(created.statusCode, 201);
  assert.equal('finalized' in created.body, false);
  // a falsy finalized is not a finalize: left alone, not stamped, not returned
  seed('t1', { name: 'X' });
  const falsy = await call('PUT', 't1', putBody({ name: 'Y', finalized: false }));
  assert.equal(falsy.statusCode, 200);
  assert.equal(writtenData().finalized, false);
  assert.equal('finalized' in falsy.body, false);
});

test('a save that carries a stamp for a row that no longer exists (deleted or moved elsewhere) is 404 and never re-creates it', async () => {
  seed('t1', { name: 'X' });
  delete store.t1;                                         // deleted by another window
  const res = await call('PUT', 't1', { data: { name: 'from a window that still had it' }, expectedUpdatedAt: UPDATED });
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { code: 'not_found', error: 'Not found.' });
  assert.equal(issued(/^\s*INSERT/i).length, 0);
  assert.equal(store.t1, undefined);
});

test('a new event’s first save (no stamp) is still created', async () => {
  seed('t1', { name: 'X' }); delete store.t1;
  const res = await call('PUT', 'tnew', { data: { name: 'New' }, expectedUpdatedAt: null });
  assert.equal(res.statusCode, 201);
  assert.equal(issued(/^\s*INSERT/i).length, 1);
});

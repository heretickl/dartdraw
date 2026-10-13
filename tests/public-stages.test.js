const { test } = require('node:test');
const assert = require('node:assert/strict');

// A fake database in place of viewer/api/_lib/db.js, so the handler can be run without Neon.
const dbPath = require.resolve('../viewer/api/_lib/db');
let rows = [];
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { sql: async () => rows } };
const handler = require('../viewer/api/public/[slug]');

function call(slug) {
  const res = { statusCode: 0, headers: {}, body: undefined };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { res.body = o; return res; };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  return handler({ method: 'GET', query: { slug } }, res).then(() => res);
}
const data = (over) => Object.assign({
  published: true, eventCreation: { eventName: 'E', competitionUnit: 'Singles' },
  format: { formatType: 'rrknockout', qualifiersPerGroup: 2 },
  entriesList: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
  groups: [{ id: 'g', label: 'A', entryIds: ['a', 'b'], confirmed: true, gameStarted: true, scores: { 'a|b': { legs1: 2, legs2: 0 } } }],
}, over || {});

test('the public answer carries the per-stage status next to the view', async () => {
  rows = [{ data: data(), updated_at: new Date().toISOString() }];
  const res = await call('abcdefgh1234');
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.view && res.body.updatedAt);
  assert.deepEqual(res.body.stages.map((s) => [s.key, s.state]), [['groups', 'done'], ['knockout', 'next']]);
});

test('if working out the stages fails the page still gets its view, with no stages', async () => {
  const lv = require('../viewer/api/_lib/listView'), real = lv.stagesOf;
  lv.stagesOf = () => { throw new Error('boom'); };
  try {
    rows = [{ data: data(), updated_at: new Date().toISOString() }];
    const res = await call('abcdefgh1234');
    assert.equal(res.statusCode, 200);
    assert.ok(res.body.view);
    assert.deepEqual(res.body.stages, []);
  } finally { lv.stagesOf = real; }
});

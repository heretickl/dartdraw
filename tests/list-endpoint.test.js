const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

// A fake database in place of viewer/api/_lib/db.js, so the handler can be run without Neon.
const dbPath = require.resolve('../viewer/api/_lib/db');
let calls = [], rows = [], failWith = null;
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
  sql: async (strings, ...vals) => { calls.push({ text: strings.join('?'), vals }); if (failWith) throw failWith; return rows; },
} };
const handler = require('../viewer/api/events');
const cfg = require('../viewer/api/_lib/listConfig');

function call(method) {
  const res = { statusCode: 0, headers: {}, body: undefined };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { res.body = o; return res; };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  return handler({ method: method || 'GET' }, res).then(() => res);
}
const sample = (over) => ({ slug: 'abcdefgh1234', updated_at: new Date().toISOString(), data: Object.assign({
  listed: true, published: true,
  eventCreation: { tournamentName: 'Sample Open', eventName: 'Sample Singles', date: '2999-01-01', competitionUnit: 'Singles' },
  format: { formatType: 'knockout' }, entriesList: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
  knockout: { rounds: [[{ aEntryId: 'a', bEntryId: 'b', winnerId: null }]] },
}, over || {}) });

test('answers GET with the classified list and a 30 second shared cache, nothing stale', async () => {
  calls = []; rows = [sample()]; failWith = null;
  const res = await call('GET');
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['Cache-Control'], 'public, s-maxage=30');
  assert.deepEqual(Object.keys(res.body).sort(), ['generatedAt', 'live', 'results', 'upcoming']);
  assert.equal(res.body.upcoming.length, 1); assert.equal(res.body.upcoming[0].slug, 'abcdefgh1234');
});

test('answers only GET', async () => {
  for (const m of ['POST', 'PUT', 'DELETE', 'PATCH']) { const res = await call(m); assert.equal(res.statusCode, 405, m); }
});

test('reads only the public view, only listed rows, with bounded windows and a row cap', async () => {
  calls = []; rows = []; failWith = null;
  await call('GET');
  assert.equal(calls.length, 2);                          // the retention settings, then the events
  assert.match(calls[0].text, /FROM public_settings/);
  const q = calls[1].text.replace(/\s+/g, ' ');
  assert.match(q, /FROM public_tournaments/);
  assert.doesNotMatch(q, /FROM tournaments/i); assert.doesNotMatch(q, /organizers/i);
  assert.match(q, /data->>'listed' = 'true'/);
  assert.match(q, /ORDER BY updated_at DESC/); assert.match(q, /LIMIT/);
  const vals = calls[1].vals;
  assert.ok(vals.includes(cfg.MAX_ROWS), 'row cap passed as a value');
  const iso = vals.filter((v) => typeof v === 'string');
  assert.ok(iso.some((v) => /^\d{4}-\d{2}-\d{2}$/.test(v)), 'yesterday as a date');
  assert.ok(iso.some((v) => /^\d{4}-\d{2}-\d{2}T/.test(v)), 'the saved-since cutoff as a timestamp');
});

test('a database error is a 500 with a plain message, and nothing is cached', async () => {
  failWith = new Error('connection refused: postgres://secret'); rows = [];
  const res = await call('GET');
  failWith = null;
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Could not load events.' });
  assert.ok(!JSON.stringify(res.body).includes('secret'));
  assert.equal(res.headers['Cache-Control'], undefined);
});

test('an unlisted row that somehow came back is dropped, and nothing outside the allow-list is returned', async () => {
  failWith = null;
  rows = [sample({ listed: false }), sample({ eventCreation: { tournamentName: 'T', eventName: 'E', date: '2999-01-01', contact: 'SECRET CONTACT' }, incidents: [{ description: 'SECRET INCIDENT' }] })];
  const res = await call('GET');
  assert.equal(res.body.upcoming.length, 1);
  assert.ok(!JSON.stringify(res.body).includes('SECRET'));
});

test('the query selects only a small built object, never the whole data column or the large parts of a tournament', async () => {
  calls = []; rows = []; failWith = null;
  await call('GET');
  const q = calls[1].text.replace(/\s+/g, ' ');
  assert.doesNotMatch(q, /SELECT slug, data/i);
  assert.doesNotMatch(q, /SELECT\s+\*/i);
  assert.match(q, /jsonb_build_object\(/);
  assert.match(q, /\) AS data FROM public_tournaments/);
  assert.match(q, /SELECT slug, updated_at, jsonb_build_object/);
  ['logo', 'sponsors', 'incidents', 'boardPlan'].forEach((k) => assert.ok(!q.toLowerCase().includes(k.toLowerCase()), k));
  // and every key the list logic reads is in the object
  ['listed', 'eventCreation', 'format', 'formatType', 'anticipatedStartTime', 'entriesList', 'groups', 'pods', 'knockout', 'finalized'].forEach((k) => assert.ok(q.includes("'" + k + "'"), k));
});

test('rows shaped like the narrowed SELECT (only those keys) are classified correctly', async () => {
  failWith = null;
  const now = Date.now();
  const narrow = (slug, over) => ({ slug, updated_at: new Date(now - 60000).toISOString(), data: Object.assign({
    listed: true, eventCreation: { tournamentName: 'Riverside Open', eventName: 'Open Singles', date: '2999-01-01', competitionUnit: 'Singles' },
    format: { formatType: 'knockout', anticipatedStartTime: '19:00' }, entriesList: [{ id: 'a', name: 'Alex Doe' }, { id: 'b', name: 'Sam Roe' }, { id: 'c', name: 'Kim Poe' }, { id: 'd', name: 'Lee Zoe' }],
    groups: null, pods: null, knockout: null,
  }, over || {}) });
  const semi = (w1, w2) => ({ rounds: [[{ aEntryId: 'a', bEntryId: 'b', winnerId: w1 }, { aEntryId: 'c', bEntryId: 'd', winnerId: w2 }], [{ aEntryId: 'a', bEntryId: 'c', winnerId: null }]] });
  rows = [
    narrow('upcoming11111', {}),
    narrow('liveevent1111', { knockout: semi('a', null) }),
    narrow('doneevent1111', { finalized: { at: new Date(now - 3600000).toISOString() }, knockout: { rounds: [[{ aEntryId: 'a', bEntryId: 'b', winnerId: 'a' }, { aEntryId: 'c', bEntryId: 'd', winnerId: 'c' }], [{ aEntryId: 'a', bEntryId: 'c', winnerId: 'a' }]] } }),
  ];
  const res = await call('GET');
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.upcoming.map((i) => i.slug), ['upcoming11111']);
  assert.equal(res.body.upcoming[0].start, '19:00'); assert.equal(res.body.upcoming[0].entries, 4); assert.equal(res.body.upcoming[0].format, 'knockout');
  assert.deepEqual(res.body.live.map((i) => i.slug), ['liveevent1111']);
  assert.equal(res.body.live[0].progress.stage, 'knockout'); assert.equal(res.body.live[0].progress.round, 'semifinals'); assert.equal(res.body.live[0].progress.done, 1); assert.equal(res.body.live[0].progress.total, 2);
  assert.deepEqual(res.body.results.map((i) => i.slug), ['doneevent1111']);
  assert.equal(res.body.results[0].winner, 'Alex Doe');
});

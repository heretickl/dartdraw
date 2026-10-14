const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadApp, run, plain, useState, playOut } = require('./lib/helpers');

// A fake database in place of viewer/api/_lib/db.js, so the endpoint can run without Neon.
// Each call is answered by `answer(text, vals)`; a test sets it to say what the settings and event queries return.
const dbPath = require.resolve('../viewer/api/_lib/db');
let calls = [], answer = () => [];
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
  sql: async (strings, ...vals) => { const text = strings.join('?').replace(/\s+/g, ' '); calls.push({ text, vals }); return answer(text, vals); },
} };
const handler = require('../viewer/api/events');
const { loadSettings } = require('../viewer/api/_lib/siteSettings');
const cfg = require('../viewer/api/_lib/listConfig');
const lv = require('../viewer/api/_lib/listView');

const fakeSql = (rows) => async () => rows;
const throwingSql = async () => { throw new Error('relation "public_settings" does not exist'); };
const DEFAULTS = { resultsDays: cfg.RESULTS_DAYS, liveHours: cfg.LIVE_STALE_HOURS };

test('the viewer default retention is 14 days / 48 hours, with the admin limits', () => {
  assert.equal(cfg.RESULTS_DAYS, 14);
  assert.equal(cfg.LIVE_STALE_HOURS, 48);
  assert.deepEqual(plain(cfg.LIMITS), { resultsDays: [1, 90], liveHours: [1, 168] });
});

test('loadSettings reads both numbers from public_settings', async () => {
  const seen = [];
  const sql = async (strings) => { seen.push(strings.join('?').replace(/\s+/g, ' ')); return [{ key: 'resultsDays', value: 30 }, { key: 'liveHours', value: 72 }]; };
  assert.deepEqual(await loadSettings(sql), { resultsDays: 30, liveHours: 72 });
  assert.equal(seen.length, 1);
  assert.match(seen[0], /FROM public_settings/);
  assert.doesNotMatch(seen[0], /site_settings/);
});

test('loadSettings gives the defaults when the view is missing (the query throws)', async () => {
  assert.deepEqual(await loadSettings(throwingSql), DEFAULTS);
});

test('loadSettings gives the defaults for no rows, rows that are not an array, or a sql function that throws synchronously', async () => {
  assert.deepEqual(await loadSettings(fakeSql([])), DEFAULTS);
  assert.deepEqual(await loadSettings(fakeSql(null)), DEFAULTS);
  assert.deepEqual(await loadSettings(fakeSql({ key: 'resultsDays', value: 3 })), DEFAULTS);
  assert.deepEqual(await loadSettings(() => { throw new Error('DATABASE_URL is not set'); }), DEFAULTS);
});

test('a missing key keeps its own default while the other is used', async () => {
  assert.deepEqual(await loadSettings(fakeSql([{ key: 'resultsDays', value: 20 }])), { resultsDays: 20, liveHours: 48 });
  assert.deepEqual(await loadSettings(fakeSql([{ key: 'liveHours', value: 6 }])), { resultsDays: 14, liveHours: 6 });
});

test('junk values fall back to the default for that setting', async () => {
  const junk = [null, undefined, 'abc', '14', 14.5, NaN, Infinity, true, [], {}, [14]];
  for (const v of junk) {
    assert.deepEqual(await loadSettings(fakeSql([{ key: 'resultsDays', value: v }, { key: 'liveHours', value: v }])), DEFAULTS, String(JSON.stringify(v)));
  }
});

test('junk rows (null, wrong shapes, other keys) are ignored', async () => {
  const rows = [null, 7, 'x', {}, { key: 5, value: 3 }, { key: 'other', value: 3 }, { key: 'constructor', value: 3 }, { key: '__proto__', value: 3 }, { key: 'liveHours', value: 10 }];
  assert.deepEqual(await loadSettings(fakeSql(rows)), { resultsDays: 14, liveHours: 10 });
});

test('whole numbers outside the range are clamped to the limits', async () => {
  assert.deepEqual(await loadSettings(fakeSql([{ key: 'resultsDays', value: 0 }, { key: 'liveHours', value: -5 }])), { resultsDays: 1, liveHours: 1 });
  assert.deepEqual(await loadSettings(fakeSql([{ key: 'resultsDays', value: 5000 }, { key: 'liveHours', value: 99999 }])), { resultsDays: 90, liveHours: 168 });
  assert.deepEqual(await loadSettings(fakeSql([{ key: 'resultsDays', value: 90 }, { key: 'liveHours', value: 168 }])), { resultsDays: 90, liveHours: 168 });
  assert.deepEqual(await loadSettings(fakeSql([{ key: 'resultsDays', value: 1 }, { key: 'liveHours', value: 1 }])), { resultsDays: 1, liveHours: 1 });
});

// ---- the view's SQL file ----
test('viewer/sql/settings.sql exposes only the two keys through public_settings and grants it to viewer_ro', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'sql', 'settings.sql'), 'utf8').replace(/--.*$/gm, '').replace(/\s+/g, ' ');
  assert.match(s, /CREATE OR REPLACE VIEW public_settings AS SELECT key, value FROM site_settings WHERE key IN \('resultsDays', ?'liveHours'\)/);
  assert.match(s, /GRANT SELECT ON public_settings TO viewer_ro;/);
  assert.doesNotMatch(s, /DROP|INSERT|UPDATE|DELETE/i);
});

// ---- the list logic with custom settings ----
const app = loadApp(); app.persist = () => {}; app.render = () => {};
const NOW = Date.UTC(2026, 9, 13, 12, 0, 0), HOUR = 3600000, DAY = 86400000;
const row = (t, ageMs) => ({ slug: 'abcdefgh1234', data: plain(t), updated_at: new Date(NOW - (ageMs || 0)).toISOString() });
function knockoutEvent(n) {
  const t = run(app, 'blankTournament')(); useState(app, t);
  t.format.formatType = 'knockout'; t.format.bestOfLegs = 5;
  t.entriesList = Array.from({ length: n }, (_, i) => ({ id: 'e' + i, name: 'Player ' + (i + 1), org: '', players: [], withdrawn: false }));
  t.published = true; t.listed = true; t.publicSlug = 'abcdefgh1234';
  t.eventCreation.tournamentName = 'Sample Open'; t.eventCreation.eventName = 'Sample Singles'; t.eventCreation.date = '2026-10-13'; t.eventCreation.competitionUnit = 'Singles';
  t.knockout = run(app, 'generateBracket')(t.entriesList.map((e) => ({ entryId: e.id, org: '' })), 'Bracket');
  return t;
}
const finishedAgo = (days) => { const t = knockoutEvent(8); playOut(app, t.knockout, () => 'a'); t.finalized = { at: new Date(NOW - days * DAY).toISOString() }; return t; };
const liveEvent = () => { const t = knockoutEvent(8); const m = t.knockout.rounds[0][0]; m.winnerId = m.aEntryId; return t; };

test('describe: a result finalized 10 days ago shows with the 14 day default but not with a 7 day setting', () => {
  const t = finishedAgo(10);
  assert.equal(lv.describe(row(t), NOW).status, 'results');
  assert.equal(lv.describe(row(t), NOW, { resultsDays: 7, liveHours: 48 }).status, null);
  assert.equal(lv.describe(row(t), NOW, { resultsDays: 10, liveHours: 48 }).status, 'results');
  assert.equal(lv.describe(row(finishedAgo(20)), NOW, { resultsDays: 30, liveHours: 48 }).status, 'results');
  assert.equal(lv.describe(row(finishedAgo(20)), NOW).status, null);
});

test('describe: liveHours from the settings replaces the 48 hour default', () => {
  const t = liveEvent();
  assert.equal(lv.describe(row(t, 60 * HOUR), NOW).status, null);
  assert.equal(lv.describe(row(t, 60 * HOUR), NOW, { resultsDays: 14, liveHours: 72 }).status, 'live');
  assert.equal(lv.describe(row(t, 10 * HOUR), NOW, { resultsDays: 14, liveHours: 6 }).status, null);
  assert.equal(lv.describe(row(t, 5 * HOUR), NOW, { resultsDays: 14, liveHours: 6 }).status, 'live');
});

test('describe: a partial or empty settings object falls back per field', () => {
  assert.equal(lv.describe(row(finishedAgo(10)), NOW, {}).status, 'results');
  assert.equal(lv.describe(row(liveEvent(), 60 * HOUR), NOW, { resultsDays: 3 }).status, null);
  assert.equal(lv.describe(row(finishedAgo(10)), NOW, { liveHours: 5 }).status, 'results');
});

test('buildList passes the settings through to every row', () => {
  const rows = [row(finishedAgo(10)), row(liveEvent(), 60 * HOUR)];
  const base = lv.buildList(rows, NOW);
  assert.equal(base.results.length, 1); assert.equal(base.live.length, 0);
  const custom = lv.buildList(rows, NOW, { resultsDays: 7, liveHours: 72 });
  assert.equal(custom.results.length, 0); assert.equal(custom.live.length, 1);
});

// ---- the endpoint ----
function call() {
  const res = { statusCode: 0, headers: {}, body: undefined };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { res.body = o; return res; };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  return handler({ method: 'GET' }, res).then(() => res);
}
const isSettingsQuery = (text) => /FROM public_settings/.test(text);
const eventsCall = () => calls.filter((c) => /FROM public_tournaments/.test(c.text))[0];
const sinceOf = (c) => c.vals.filter((v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v))[0];
const daysAgo = (iso) => (Date.now() - Date.parse(iso)) / DAY;

test('endpoint: with the default settings the row window is the default resultsDays + 1 days', async () => {
  calls = []; answer = () => [];
  const res = await call();
  assert.equal(res.statusCode, 200);
  assert.equal(calls.length, 2);
  assert.ok(isSettingsQuery(calls[0].text), 'settings are read first');
  assert.ok(Math.abs(daysAgo(sinceOf(eventsCall())) - (cfg.RESULTS_DAYS + 1)) < 0.01);
});

test('endpoint: a longer resultsDays widens the window to resultsDays + 1 days', async () => {
  calls = []; answer = (text) => (isSettingsQuery(text) ? [{ key: 'resultsDays', value: 30 }, { key: 'liveHours', value: 48 }] : []);
  await call();
  assert.ok(Math.abs(daysAgo(sinceOf(eventsCall())) - 31) < 0.01);
});

test('endpoint: a long liveHours widens the window to ceil(liveHours / 24) + 1 days', async () => {
  calls = []; answer = (text) => (isSettingsQuery(text) ? [{ key: 'resultsDays', value: 1 }, { key: 'liveHours', value: 168 }] : []);
  await call();
  assert.ok(Math.abs(daysAgo(sinceOf(eventsCall())) - 8) < 0.01);       // ceil(168 / 24) + 1 = 8, equal to QUERY_DAYS
  calls = []; answer = (text) => (isSettingsQuery(text) ? [{ key: 'resultsDays', value: 1 }, { key: 'liveHours', value: 170 }] : []);
  await call();
  assert.ok(Math.abs(daysAgo(sinceOf(eventsCall())) - 8) < 0.01);       // 170 is clamped to 168 -> still 8
});

test('endpoint: an extreme stored value is clamped before it sizes the window', async () => {
  calls = []; answer = (text) => (isSettingsQuery(text) ? [{ key: 'resultsDays', value: 100000 }, { key: 'liveHours', value: 100000 }] : []);
  const res = await call();
  assert.equal(res.statusCode, 200);
  assert.ok(Math.abs(daysAgo(sinceOf(eventsCall())) - 91) < 0.01);      // resultsDays clamped to 90
  assert.ok(eventsCall().vals.includes(cfg.MAX_ROWS), 'the row cap still applies');
});

test('endpoint: a shorter setting never narrows the window below QUERY_DAYS', async () => {
  calls = []; answer = (text) => (isSettingsQuery(text) ? [{ key: 'resultsDays', value: 1 }, { key: 'liveHours', value: 1 }] : []);
  await call();
  assert.ok(Math.abs(daysAgo(sinceOf(eventsCall())) - cfg.QUERY_DAYS) < 0.01);
});

test('endpoint: the settings query failing still answers 200 with the default behaviour', async () => {
  calls = [];
  answer = (text) => { if (isSettingsQuery(text)) throw new Error('relation "public_settings" does not exist'); return []; };
  const res = await call();
  assert.equal(res.statusCode, 200);
  assert.deepEqual(Object.keys(res.body).sort(), ['generatedAt', 'live', 'results', 'upcoming']);
  assert.ok(Math.abs(daysAgo(sinceOf(eventsCall())) - (cfg.RESULTS_DAYS + 1)) < 0.01);
});

test('endpoint: the settings are applied to the list (a 10 day old result appears; with 7 days it does not)', async () => {
  const slim = (t) => ({ slug: 'abcdefgh1234', updated_at: new Date(Date.now() - 10 * DAY).toISOString(), data: plain(t) });
  const t = finishedAgo(0);
  t.finalized = { at: new Date(Date.now() - 10 * DAY).toISOString() };
  calls = []; answer = (text) => (isSettingsQuery(text) ? [] : [slim(t)]);
  let res = await call();
  assert.equal(res.body.results.length, 1);
  calls = []; answer = (text) => (isSettingsQuery(text) ? [{ key: 'resultsDays', value: 7 }] : [slim(t)]);
  res = await call();
  assert.equal(res.body.results.length, 0);
});

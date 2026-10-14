// A finalized event (data.finalized.at, set by the organiser's "Accept results & finalize") is what decides
// "Final results" on the event page and the Results list on the home page. A finished-looking event that was never
// finalized stays Live. Junk in `finalized` is never trusted.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, plain, useState, playOut } = require('./lib/helpers');
const { loadViewer, runViewer: rv } = require('./lib/load-viewer');
const lv = require('../viewer/api/_lib/listView');
const cfg = require('../viewer/api/_lib/listConfig');
const { toPublicView } = require('../viewer/api/_lib/publicView');

const app = loadApp(); app.persist = () => {}; app.render = () => {};
const viewer = loadViewer();
const NOW = Date.UTC(2026, 9, 13, 12, 0, 0), HOUR = 3600000, DAY = 86400000;
const iso = (ms) => new Date(ms).toISOString();

function knockoutEvent(n) {
  const t = run(app, 'blankTournament')(); useState(app, t);
  t.format.formatType = 'knockout'; t.format.bestOfLegs = 5;
  t.entriesList = Array.from({ length: n }, (_, i) => ({ id: 'e' + i, name: 'Player ' + (i + 1), org: '', players: [], withdrawn: false }));
  t.published = true; t.listed = true; t.publicSlug = 'abcdefgh1234';
  t.eventCreation.eventName = 'Sample Singles'; t.eventCreation.date = '2026-10-13'; t.eventCreation.competitionUnit = 'Singles';
  t.knockout = run(app, 'generateBracket')(t.entriesList.map((e) => ({ entryId: e.id, org: '' })), 'Bracket');
  return t;
}
const row = (t, ageMs) => ({ slug: 'abcdefgh1234', data: plain(t), updated_at: iso(NOW - (ageMs || 0)) });
const complete = () => { const t = knockoutEvent(8); playOut(app, t.knockout, () => 'a'); return t; };
const GOOD = '2026-10-13T09:30:00.000Z';

// ---- toPublicView ----
test('toPublicView publishes finalizedAt only for a valid date-time string, and nothing else from finalized', () => {
  const t = plain(knockoutEvent(8));
  assert.ok(!('finalizedAt' in toPublicView(t)));
  t.finalized = { at: GOOD, by: 'SECRET ORGANISER', note: 'SECRET NOTE' };
  const v = toPublicView(t);
  assert.equal(v.finalizedAt, GOOD);
  assert.ok(!JSON.stringify(v).includes('SECRET'));
  assert.ok(!('finalized' in v));
});

test('toPublicView drops junk finalized values', () => {
  const t = plain(knockoutEvent(8));
  [true, 'yes', 5, null, [], {}, { at: 5 }, { at: null }, { at: 'nope' }, { at: '' }, { at: 'x'.repeat(500) },
    { at: GOOD + ' '.repeat(40) }].forEach((junk) => {
    t.finalized = junk;
    assert.ok(!('finalizedAt' in toPublicView(t)), 'junk: ' + JSON.stringify(junk).slice(0, 40));
  });
});

// ---- listView.finalizedAt / describe ----
test('listView.finalizedAt returns epoch ms for a valid finalized.at and null otherwise', () => {
  assert.equal(lv.finalizedAt({ finalized: { at: GOOD } }), Date.UTC(2026, 9, 13, 9, 30));
  [undefined, null, {}, { finalized: true }, { finalized: {} }, { finalized: { at: 7 } }, { finalized: { at: 'nope' } },
    { finalized: { at: 'x'.repeat(60) } }].forEach((d) => assert.equal(lv.finalizedAt(d), null));
});

test('a finalized event is a result with its winner, whatever its last save time', () => {
  const t = complete(); t.finalized = { at: iso(NOW - 2 * HOUR) };
  const r = lv.describe(row(t, 30 * DAY), NOW);   // updated_at long ago: finalized.at decides
  assert.equal(r.status, 'results');
  const last = t.knockout.rounds[t.knockout.rounds.length - 1][0];
  assert.equal(r.item.winner, t.entriesList.find((e) => e.id === last.winnerId).name);
});

test('results stay for 14 days (the default) after finalizing, then drop off', () => {
  const t = complete();
  t.finalized = { at: iso(NOW - cfg.RESULTS_DAYS * DAY) }; assert.equal(lv.describe(row(t), NOW).status, 'results');
  t.finalized = { at: iso(NOW - cfg.RESULTS_DAYS * DAY - 1000) }; assert.equal(lv.describe(row(t), NOW).status, null);
  assert.equal(lv.describe(row(t, 1000), NOW).status, null);   // a fresh save does not bring it back
});

test('a complete event that was never finalized stays live while recently saved, then drops off', () => {
  const t = complete();
  const fresh = lv.describe(row(t, HOUR), NOW);
  assert.equal(fresh.status, 'live');
  assert.equal(fresh.item.winner, undefined);                 // no winner line outside Results
  assert.equal(lv.describe(row(t, cfg.LIVE_STALE_HOURS * HOUR), NOW).status, 'live');
  assert.equal(lv.describe(row(t, cfg.LIVE_STALE_HOURS * HOUR + 1000), NOW).status, null);
});

test('a complete but unfinalized event carries whatever progress the stage logic gives it (unchanged)', () => {
  const t = complete();
  const item = lv.describe(row(t, HOUR), NOW).item, p = lv.progressOf(plain(t));
  if (p) assert.deepEqual(plain(item.progress), plain(p)); else assert.ok(!('progress' in item));
});

test('an unstarted event stays upcoming; junk finalized never makes a result', () => {
  assert.equal(lv.describe(row(knockoutEvent(8)), NOW).status, 'upcoming');
  const done = complete();
  [true, 'yes', {}, { at: 5 }, { at: 'nope' }, { at: 'x'.repeat(100) }].forEach((junk) => {
    done.finalized = junk;
    assert.equal(lv.describe(row(done, HOUR), NOW).status, 'live', JSON.stringify(junk));
    assert.equal(lv.describe(row(done, 3 * DAY), NOW).status, null);
  });
});

// ---- the event page ----
test('the event page pill: state.finalizedAt alone decides Final results', () => {
  assert.equal(rv(viewer, 'typeof eventFinished'), 'undefined');   // the stage-derived rule is gone
  rv(viewer, 'var __hs = {}; el = function(){ return __hs; }');
  const pillFor = (view, stages) => {
    viewer.__v = view; viewer.__st = stages || [];
    rv(viewer, 'state = __v; evStages = __st; lastOkAt = Date.now(); setStatus()');
    return rv(viewer, '__hs.innerHTML');
  };
  const done = complete();
  const view = (extra) => Object.assign(JSON.parse(JSON.stringify(toPublicView(plain(done)))), { tieBreakOrder: [], groups: [], entriesList: [], format: {} }, extra);
  assert.match(pillFor(view({ finalizedAt: GOOD })), /live-pill done">Final results</);
  assert.match(pillFor(view()), /<i><\/i>Live</);              // complete but not finalized: still the red Live pill
  // stage cards no longer decide anything: every stage done, still Live without finalizedAt
  assert.match(pillFor(view(), [{ key: 'knockout', state: 'done', done: 7, total: 7 }]), /<i><\/i>Live</);
  // stale still wins
  viewer.__v = view({ finalizedAt: GOOD });
  rv(viewer, 'state = __v; lastOkAt = Date.now() - POLL_MS * 10; setStatus()');
  assert.match(rv(viewer, '__hs.innerHTML'), /live-pill off">Offline</);
});

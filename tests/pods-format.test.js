const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, plain, useState, seededRng, makeTournament } = require('./lib/helpers');

const app = loadApp();
const f = (name) => run(app, name);

test('a new tournament has defaults for Group Boards', () => {
  const t = f('blankTournament')();
  assert.equal(t.format.podCount, 8); assert.equal(t.format.podLegs, null);
  assert.ok(Array.isArray(t.pods) && t.pods.length === 0);
});

test('stage routing: no groups -> chart details, drawn -> confirm, Finals built -> manage', () => {
  const t = makeTournament(app, 12, { pods: 3 });
  assert.equal(f('computeStageFor')(t), 3);
  f('generatePods')(t, seededRng(1));
  assert.equal(f('computeStageFor')(t), 4);
  f('podsConfirmAll')(t);
  assert.equal(f('computeStageFor')(t), 5);
});

test('the format summary, rules text and context mention Group Boards', () => {
  const t = makeTournament(app, 12, { pods: 3 }); useState(app, t);
  assert.match(f('formatSummaryCard')(), /Group Boards/);
  assert.match(f('formatSummaryCard')(), /3/);
  const lines = f('formatDescriptionLines')(t).join(' ');
  assert.match(lines, /Group Boards/); assert.match(lines, /3 groups/);
  assert.match(f('schedulingContextHTML')(), /3<\/b> groups/);
});

test('the duration estimate for Group Boards comes from the groups-then-Finals model', () => {
  const t = makeTournament(app, 32, { pods: 8, boards: 8 }); useState(app, t);
  const est = f('estimateTotalMinutes')(t);
  assert.equal(est.minutes, f('roundUpTo5')(f('podsEstimateMinutes')(t, 8)));
  assert.ok(est.minutes > 0);
  assert.match(f('competitionDurationSummaryHTML')(t), /Estimated duration/);
});

test('the settings form lists the fields and a live summary', () => {
  const t = makeTournament(app, 40, { pods: 8 }); useState(app, t);
  const html = f('podsFormatFieldsHTML')();
  assert.match(html, /id="f_podcount"/); assert.match(html, /id="f_podlegs"/); assert.match(html, /id="f_bestof"/);
  assert.match(f('podsSummaryHTML')(40, 8), /8 groups of 5 players/);
  assert.match(f('podsSummaryHTML')(43, 8), /5 to 6 players/);
  assert.match(f('podsSummaryHTML')(40, 6), /6-slot|8-slot/);   // Finals size for 6 group winners is 8
  assert.match(f('podsSummaryHTML')(7, 4), /at most 3 groups/);
  assert.match(f('podsSummaryHTML')(40, 0), /Choose how many groups/);
});

test('reading the settings form keeps the number typed, so a bad count is reported on save, and keeps the group best-of', () => {
  const realDocument = app.document;
  const values = { f_podcount: '500', f_podlegs: '' };
  app.document = { getElementById: (id) => (id in values ? { value: values[id] } : null) };
  try {
    const fmt = { bestOfLegs: 5 };
    f('podsReadFormat')(fmt);
    assert.equal(fmt.podCount, 500); assert.equal(fmt.podLegs, 5);
    assert.match(f('podsValidateCount')(300, fmt.podCount).message, /at most 128 groups/);
    values.f_podcount = '1'; values.f_podlegs = '3';
    f('podsReadFormat')(fmt);
    assert.equal(fmt.podCount, 1); assert.equal(fmt.podLegs, 3);
    values.f_podcount = ''; f('podsReadFormat')(fmt); assert.equal(fmt.podCount, 0);
  } finally { app.document = realDocument; }
});

test('opening a tournament saved before Group Boards fills in the new fields', async () => {
  const old = f('blankTournament')();
  delete old.pods; delete old.format.podCount; delete old.format.podLegs;
  app.fetch = async () => ({ ok: true, status: 200, json: async () => ({ data: old, updated_at: '2026-01-01T00:00:00Z' }) });
  app.render = () => {};
  await f('openTournament')('t_old');
  const s = run(app, 'state');
  assert.deepEqual(plain(s.pods), []);
  assert.equal(s.format.podCount, 8); assert.equal(s.format.podLegs, null);
});

test('switching an old tournament (no pods field) to Group Boards does not throw', () => {
  const t = f('blankTournament')();
  delete t.pods; t.eventCreation.saved = true; t.format.saved = true;
  t.entriesList = Array.from({ length: 12 }, (_, i) => ({ id: 'e' + i, name: 'P' + i, org: '', players: [], withdrawn: false }));
  useState(app, t);
  app.render = () => {};   // only the state change matters here; the screens are checked below
  assert.doesNotThrow(() => f('setFormatType')('podknockout'));
  assert.equal(t.format.formatType, 'podknockout');
  assert.doesNotThrow(() => f('formatSummaryCard')());
  assert.doesNotThrow(() => f('podsFormatFieldsHTML')());
});

test('the sidebar names the Group Boards format, not Round Robin', () => {
  const t = makeTournament(app, 12, { pods: 3 }); useState(app, t);
  const els = {};
  const element = () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, textContent: '', innerHTML: '' });
  app.document = { getElementById: (id) => (els[id] = els[id] || element()) };
  f('renderSavedList')();
  assert.match(els.cwSub.textContent, /Group Boards/);
  assert.doesNotMatch(els.cwSub.textContent, /Round Robin/);
});

test('the Finals size reads naturally: "an 8-slot", "a 16-slot"', () => {
  const t = makeTournament(app, 40, { pods: 8 }); useState(app, t);
  assert.match(f('podsSummaryHTML')(40, 8), /an 8-slot chart/);
  assert.match(f('podsSummaryHTML')(80, 16), /a 16-slot chart/);
  assert.match(f('podsSummaryHTML')(40, 6), /an 8-slot chart/);
});

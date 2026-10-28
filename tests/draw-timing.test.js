// Draw before or after check-in (drawTimingGate), the group count after "Max per group" changes (buildGroups), and the
// "Save your changes?" prompt when leaving step 1 or 2 (goStage).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, useState, makeTournament } = require('./lib/helpers');

const app = loadApp({ askDrawTiming: true });   // the real question, not the test loader's "Draw now"
const f = (name) => run(app, name);
function fresh(n, formatType, extra) {
  const t = makeTournament(app, n, { pods: 2 });
  t.format.formatType = formatType; t.format.maxPerGroup = 4;
  Object.assign(t, extra || {});
  t.entriesList.forEach((e) => { e.checkedIn = false; });
  useState(app, t);
  app.persist = () => {}; app.render = () => {};
  return t;
}
function captureModal() { const box = { modal: null }; app.openModal = (o) => { box.modal = o; }; return box; }
// The gate runs the draw after the box has closed (setTimeout 0): wait for it.
const tick = () => new Promise((r) => setTimeout(r, 5));

test('the first draw asks when to draw; "Draw after check-in" draws nothing and saves the choice', () => {
  for (const [ft, press] of [['roundrobin', 'confirmShuffleGroups'], ['knockout', 'regenerateKnockoutBracket'], ['podknockout', 'podsDrawClick']]) {
    const t = fresh(8, ft); const box = captureModal();
    f(press)();
    assert.equal(box.modal && box.modal.title, 'When do you want to draw?', ft);
    box.modal.onSecondary();
    assert.equal(t.drawAfterCheckIn, true, ft);
    assert.equal(t.groups.length, 0, ft); assert.ok(!t.knockout, ft); assert.equal((t.pods || []).length, 0, ft);
  }
});

test('"Draw now" draws at once and never asks again; a re-draw never asks', async () => {
  const t = fresh(8, 'roundrobin'); const box = captureModal();
  f('confirmShuffleGroups')();
  box.modal.onConfirm(); await tick();
  assert.equal(t.drawAfterCheckIn, false);
  assert.equal(t.groups.length, 2);
  box.modal = null;
  const t2 = fresh(8, 'roundrobin', { drawAfterCheckIn: false });
  f('confirmShuffleGroups')();
  assert.equal(box.modal, null, 'no question once "Draw now" was chosen');
  assert.equal(t2.groups.length, 2);
});

test('after check-in: the draw waits until everyone is checked in or absent; absent entries are left out', () => {
  const t = fresh(8, 'roundrobin', { drawAfterCheckIn: true }); const box = captureModal();
  assert.match(f('drawCheckInPanelHTML')(false), /0 of 8 ready/);
  assert.match(f('entriesPanel')(), /disabled onclick="confirmShuffleGroups\(\)"/);
  f('confirmShuffleGroups')();
  assert.equal(box.modal.title, 'Waiting for check-in');
  assert.equal(t.groups.length, 0);
  t.entriesList.slice(0, 6).forEach((e) => f('toggleCheckedIn')(e.id, true));
  f('markAbsent')('e6'); f('markAbsent')('e7'); f('undoAbsent')('e7'); f('markAbsent')('e7');
  assert.match(f('drawCheckInPanelHTML')(false), /6 of 6 ready/);
  assert.doesNotMatch(f('entriesPanel')(), /disabled onclick="confirmShuffleGroups\(\)"/);
  f('confirmShuffleGroups')();
  const placed = t.groups.flatMap((g) => g.entryIds);
  assert.equal(placed.length, 6);
  assert.ok(!placed.includes('e6') && !placed.includes('e7'), 'absent entries are not drawn');
  assert.equal(f('drawCheckInPanelHTML')(true), '', 'no panel once drawn');
});

test('after check-in, knockout and Group Boards: Generate bracket and the draw unlock only when everyone is ready', () => {
  const k = fresh(8, 'knockout', { drawAfterCheckIn: true });
  assert.match(f('stage4Knockout')(), /disabled onclick="regenerateKnockoutBracket\(\)"/);
  k.entriesList.forEach((e) => { e.checkedIn = true; });
  assert.doesNotMatch(f('stage4Knockout')(), /disabled onclick="regenerateKnockoutBracket\(\)"/);
  f('regenerateKnockoutBracket')();
  assert.ok(k.knockout, 'bracket generated with no question');
  const p = fresh(8, 'podknockout', { drawAfterCheckIn: true });
  assert.match(f('podsStage3')(), /disabled onclick="podsDrawClick\(\)"/);
  p.entriesList.forEach((e) => { e.checkedIn = true; });
  f('podsDrawClick')();
  assert.equal(p.pods.length, 2);
});

test('lowering "Max per group" after the draw never leaves empty groups; started groups keep their entries', () => {
  const sizes = (t) => Array.from(t.groups, (g) => g.entryIds.length);
  // all started at 5, maximum lowered to 4 (the Kejohanan Novus case: 82 entries)
  let t = fresh(82, 'roundrobin'); t.format.maxPerGroup = 5; f('buildGroups')(t);
  t.groups.forEach((g) => { g.gameStarted = true; });
  t.format.maxPerGroup = 4; f('buildGroups')(t);
  assert.equal(t.groups.length, 17); assert.ok(sizes(t).every((n) => n > 0));
  // nothing started: re-split at the new maximum
  t = fresh(82, 'roundrobin'); t.format.maxPerGroup = 5; f('buildGroups')(t);
  t.format.maxPerGroup = 4; f('buildGroups')(t);
  assert.ok(sizes(t).every((n) => n > 0 && n <= 4)); assert.equal(sizes(t).reduce((a, b) => a + b), 82);
  // some started: those keep 5, the rest re-split, nothing empty, every entry placed once
  t = fresh(82, 'roundrobin'); t.format.maxPerGroup = 5; f('buildGroups')(t);
  t.groups.slice(0, 5).forEach((g) => { g.gameStarted = true; });
  t.format.maxPerGroup = 4; f('buildGroups')(t);
  assert.deepEqual(sizes(t).slice(0, 5), [5, 5, 5, 5, 5]);
  assert.ok(sizes(t).slice(5).every((n) => n > 0 && n <= 4));
  assert.equal(new Set(t.groups.flatMap((g) => g.entryIds)).size, 82);
});

test('leaving step 2 with a changed format card asks; "Leave without saving" puts the format back', async () => {
  const t = fresh(8, 'roundrobin'); const box = captureModal();
  run(app, 'currentStage = 2'); f('stage2')();
  t.format.formatType = 'knockout';
  f('goStage')(3);
  assert.equal(box.modal && box.modal.title, 'Save your changes?');
  box.modal.onSecondary(); await tick();
  assert.equal(t.format.formatType, 'roundrobin');
  assert.equal(run(app, 'currentStage'), 3);
  box.modal = null;
  run(app, 'currentStage = 2'); f('stage2')();
  f('goStage')(3);
  assert.equal(box.modal, null, 'nothing changed: no question');
});

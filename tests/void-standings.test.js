const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, useState, seededRng, makeTournament, play, playOut } = require('./lib/helpers');

const app = loadApp();
const f = (n) => run(app, n);
function ready(n, pods) {
  const t = makeTournament(app, n, { pods, boards: pods }); useState(app, t);
  app.persist = () => {}; app.render = () => {};
  f('generatePods')(t, seededRng(3)); f('podsConfirmAll')(t);
  return t;
}
function voidIt(t, pod, ri, mi) {
  const m = pod.bracket.rounds[ri][mi];
  return f('podsApplyResult')(t, pod, () => { m.void = true; m.aLegs = null; m.bLegs = null; m.winnerId = null; m.wo = false; });
}

test('a group with no winner reads "No winner" in the Manage grid status', () => {
  const t = ready(16, 4); const p = t.pods[0];
  voidIt(t, p, 0, 0); voidIt(t, p, 0, 1);
  const st = f('podStatusText')(p);
  assert.equal(st.text, 'No winner');
  assert.match(f('podsGridHTML')(t.pods), /No winner/);
});

test('the Stage 6 group winners table shows "No winner" for that group and a dash is kept for unfinished groups', () => {
  const t = ready(16, 4);
  voidIt(t, t.pods[0], 0, 0); voidIt(t, t.pods[0], 0, 1);
  const html = f('podsStage6')();
  const row = html.split('<tr>').find((r) => r.includes('<td class="l">' + t.pods[0].label + '</td>'));
  assert.match(row, /No winner/);
  const other = html.split('<tr>').find((r) => r.includes('<td class="l">' + t.pods[1].label + '</td>'));
  assert.doesNotMatch(other, /No winner/);
});

test('a Finals whose final was marked "neither showed" says there is no champion', () => {
  const t = ready(16, 4);
  t.pods.forEach((g) => playOut(app, g.bracket, () => 'a')); f('podsApplyResult')(t, t.pods[0], () => {});
  t.knockout.rounds[0].forEach((m) => { if (m.aEntryId && m.bEntryId && !m.winnerId) play(m, 'a'); });
  f('propagateByes')(t.knockout.rounds);
  const final = t.knockout.rounds[1][0];
  assert.ok(final.aEntryId && final.bEntryId);
  final.void = true; final.winnerId = null;
  const html = f('knockoutPlacementsCard')(t.knockout, 'Finals');
  assert.match(html, /No champion/); assert.doesNotMatch(html, /Not complete yet/);
  delete final.void;
  assert.match(f('knockoutPlacementsCard')(t.knockout, 'Finals'), /Not complete yet/);
});

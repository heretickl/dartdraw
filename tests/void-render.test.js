const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, useState, seededRng, makeTournament, playOut, play } = require('./lib/helpers');

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

test('a void match shows both players dimmed with a NO-SHOW label and no winner styling', () => {
  const t = ready(16, 4); const p = t.pods[0];
  voidIt(t, p, 0, 0);
  const html = f('mirroredChartHTML')(p.bracket, t, { interactive: false });
  assert.equal((html.match(/NO-SHOW/g) || []).length, 2);
  const before = f('mirroredChartHTML')(ready(16, 4).pods[0].bracket, app.__t, { interactive: false });
  assert.doesNotMatch(before, /NO-SHOW/);
});

test('an interactive chart offers no single no-show link on a void match, but the match stays clickable to reverse it', () => {
  const t = ready(16, 4); const p = t.pods[0];
  const plainHtml = f('mirroredChartHTML')(p.bracket, t, { interactive: true, bracketKey: 'pod:' + p.id });
  const linksBefore = (plainHtml.match(/Mark no-show/g) || []).length;
  voidIt(t, p, 0, 0);
  const html = f('mirroredChartHTML')(p.bracket, t, { interactive: true, bracketKey: 'pod:' + p.id });
  assert.equal((html.match(/Mark no-show/g) || []).length, linksBefore - 1);
  assert.match(html, new RegExp("koMatchScoreModal\\('pod:" + p.id + "',0,0\\)"));
});

test('a Finals slot fed by a group with no winner reads "Group N: no winner"', () => {
  const t = ready(16, 4); const p = t.pods[0];
  voidIt(t, p, 0, 0); voidIt(t, p, 0, 1);
  const html = f('mirroredChartHTML')(t.knockout, t, { interactive: false });
  assert.match(html, new RegExp('Group ' + p.label + ': no winner'));
  const other = t.pods[1];
  assert.doesNotMatch(html, new RegExp('Group ' + other.label + ': no winner'));
});

function groupFinalReady() {
  const t = ready(16, 4); const p = t.pods[0];
  p.bracket.rounds[0].forEach((m) => play(m, 'a'));
  f('podsApplyResult')(t, p, () => {});
  return { t, p };
}

test('the centre Final of a void group final shows NO-SHOW on both players', () => {
  const { t, p } = groupFinalReady();
  const plain = f('mirroredChartHTML')(p.bracket, t, { interactive: false });
  assert.doesNotMatch(plain, /NO-SHOW/);
  voidIt(t, p, 1, 0);
  const html = f('mirroredChartHTML')(p.bracket, t, { interactive: false });
  assert.equal((html.match(/NO-SHOW/g) || []).length, 2);
});

test('a void group final has no single no-show link in the centre but stays clickable', () => {
  const { t, p } = groupFinalReady();
  const opts = { interactive: true, bracketKey: 'pod:' + p.id };
  const before = (f('mirroredChartHTML')(p.bracket, t, opts).match(/Mark no-show/g) || []).length;
  voidIt(t, p, 1, 0);
  const html = f('mirroredChartHTML')(p.bracket, t, opts);
  assert.equal((html.match(/Mark no-show/g) || []).length, before - 1);
  assert.match(html, new RegExp("koMatchScoreModal\\('pod:" + p.id + "',1,0\\)"));
});

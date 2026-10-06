const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, useState, seededRng, makeTournament, play, playOut } = require('./lib/helpers');

const app = loadApp();
const f = (name) => run(app, name);
function ready(n, pods, opts) {
  const t = makeTournament(app, n, Object.assign({ pods }, opts || {}));
  f('generatePods')(t, seededRng(5)); f('podsConfirmAll')(t); useState(app, t);
  return t;
}
// Opens the score modal, "types" a and b, and returns whatever pressing Save returns.
function saveScore(key, ri, mi, a, b) {
  let opts = null;
  app.openModal = (o) => { opts = o; };
  app.persist = () => {}; app.render = () => {};
  app.document = { getElementById: (id) => ({ value: id === 'scA' ? String(a) : String(b) }) };
  f('koMatchScoreModal')(key, ri, mi);
  return opts ? opts.onConfirm() : undefined;
}
const firstReal = (bracket) => bracket.rounds[0].findIndex((m) => m.aEntryId && m.bEntryId && !m.bye);

test('the Finals chart shows "Winner of Group N" for groups that have not finished', () => {
  const t = ready(20, 5);
  const html = f('mirroredChartHTML')(t.knockout, t, { interactive: false });
  assert.match(html, /Winner of Group \d+/);
  assert.doesNotMatch(html, /undefined|NaN/);
});

test('group match tags carry the group number', () => {
  const t = ready(12, 3);
  assert.equal(f('koMatchTag')(t.pods[1].bracket, t, 0, 0), 'G2·1-1');
  assert.equal(f('koMatchTag')(t.knockout, t, 0, 0), '1-1');
});

test('legs: groups use podLegs, the Finals keeps its own setting', () => {
  const t = ready(12, 3);
  t.format.podLegs = 3; t.format.bestOfLegs = 7;
  assert.equal(f('legsForKnockoutRound')(t, 'pod:' + t.pods[0].id, 3, 0), 3);
  assert.equal(f('legsForKnockoutRound')(t, 'knockout', 3, 0), 7);
  t.format.podLegs = null;
  assert.equal(f('legsForKnockoutRound')(t, 'pod:' + t.pods[0].id, 3, 0), 7);
});

test('saving a score in a group updates that group', () => {
  const t = ready(12, 3);
  t.format.podLegs = 3;                    // first to 2
  const pod = t.pods[0], mi = firstReal(pod.bracket), m = pod.bracket.rounds[0][mi];
  assert.equal(saveScore('pod:' + pod.id, 0, mi, 2, 0), undefined);
  assert.equal(m.winnerId, m.aEntryId); assert.equal(m.aLegs, 2);
});

test('a score that is not a finished best-of result is refused', () => {
  const t = ready(12, 3);
  t.format.podLegs = 3;
  const pod = t.pods[0], mi = firstReal(pod.bracket);
  const r = saveScore('pod:' + pod.id, 0, mi, 1, 1);
  assert.ok(r && r.error);
});

test('a group result that would change a scored Finals match is refused and nothing changes', () => {
  const t = ready(16, 4);
  t.pods.forEach((p) => { playOut(app, p.bracket, () => 'a'); f('syncFinalsFromPods')(t); });
  const m0 = t.knockout.rounds[0][0]; play(m0, 'a');
  const pod = t.pods.find((p) => p.id === (m0.aFromPod || m0.bFromPod));
  const lastRi = pod.bracket.rounds.length - 1, final = pod.bracket.rounds[lastRi][0], before = final.winnerId;
  const r = saveScore('pod:' + pod.id, lastRi, 0, final.winnerId === final.aEntryId ? 0 : 3, final.winnerId === final.aEntryId ? 3 : 0);
  assert.ok(r && r.error);
  assert.equal(pod.bracket.rounds[lastRi][0].winnerId, before);
});

test('a no-show in a group is a walkover for the opponent', () => {
  const t = ready(12, 3);
  const pod = t.pods[0], mi = firstReal(pod.bracket), m = pod.bracket.rounds[0][mi];
  app.persist = () => {}; app.render = () => {};
  f('markKnockoutNoShow')('pod:' + pod.id, 0, mi, 'a');
  assert.equal(m.winnerId, m.bEntryId); assert.equal(m.wo, true);
});

test('group sheets use the group best-of and a custom stage label; normal sheets are unchanged', () => {
  const t = ready(12, 3);
  t.format.podLegs = 3; t.format.bestOfLegs = 7;
  const sheet = f('knockoutBracketSheetHTML')(t.pods[0].bracket, { podLegs: true, stage: 'Group 1 · Board 1' });
  assert.match(sheet, /Group 1 · Board 1/); assert.match(sheet, /Best of 3 Legs/);
  const plain = f('knockoutBracketSheetHTML')(t.knockout);
  assert.match(plain, /Knockout Stage/); assert.match(plain, /Best of 7 Legs/);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, plain, seededRng, makeTournament, play, playOut } = require('./lib/helpers');

const app = loadApp();
const f = (name) => run(app, name);
function drawn(n, pods) { const t = makeTournament(app, n, { pods }); f('generatePods')(t, seededRng(6)); return t; }

test('the Finals appears only when the last group is confirmed', () => {
  const t = drawn(12, 3);
  f('podsConfirm')(t, t.pods[0].id); f('podsConfirm')(t, t.pods[1].id);
  assert.equal(t.knockout, null);
  f('podsConfirm')(t, t.pods[2].id);
  assert.ok(t.knockout && t.knockout.podFinals);
});

test('a group can finish before the others are confirmed; its winner appears once the Finals exists', () => {
  const t = drawn(12, 3);
  f('podsConfirm')(t, t.pods[0].id);
  playOut(app, t.pods[0].bracket, () => 'a');
  assert.equal(f('podIsFinished')(t.pods[0]), true);
  f('podsConfirm')(t, t.pods[1].id); f('podsConfirm')(t, t.pods[2].id);
  const slot = t.knockout.rounds[0].flatMap((m) => [m.aEntryId, m.bEntryId]);
  assert.ok(slot.includes(f('podChampion')(t.pods[0])));
});

test('confirm all, then unconfirm one: the Finals is discarded', () => {
  const t = drawn(12, 3);
  f('podsConfirmAll')(t);
  assert.ok(t.knockout);
  assert.equal(f('podsUnconfirm')(t, t.pods[0].id).ok, true);
  assert.equal(t.knockout, null); assert.equal(t.pods[0].confirmed, false);
});

test('unconfirm is refused once the group or the Finals has a score', () => {
  const t = drawn(12, 3);
  f('podsConfirmAll')(t);
  play(t.pods[0].bracket.rounds[0].find((m) => m.aEntryId && m.bEntryId), 'a');
  assert.equal(f('podsUnconfirm')(t, t.pods[0].id).ok, false);
  const t2 = drawn(12, 3);
  f('podsConfirmAll')(t2);
  t2.pods.forEach((p) => { playOut(app, p.bracket, () => 'a'); f('syncFinalsFromPods')(t2); });
  play(t2.knockout.rounds[0][0], 'a');
  const r = f('podsUnconfirm')(t2, t2.pods[0].id);
  assert.equal(r.ok, false);
  assert.match(r.message, /scores/);
});

test('progress counts confirmed, scored and finished groups', () => {
  const t = drawn(12, 3);
  assert.deepEqual(plain(f('podsProgress')(t)), { total: 3, finished: 0, scored: 0, confirmed: 0 });
  f('podsConfirmAll')(t);
  playOut(app, t.pods[0].bracket, () => 'a');
  const p = f('podsProgress')(t);
  assert.equal(p.confirmed, 3); assert.equal(p.finished, 1); assert.equal(p.scored, 1);
});

test('match counts ignore byes', () => {
  const t = drawn(10, 4);
  const sizes = plain(t.pods.map((p) => p.entryIds.length));
  t.pods.forEach((p) => assert.equal(f('podMatchCounts')(p).total, p.entryIds.length - 1));
  assert.deepEqual(sizes.slice().sort(), [2, 2, 3, 3]);
  playOut(app, t.pods[0].bracket, () => 'a');
  assert.equal(f('podMatchCounts')(t.pods[0]).done, t.pods[0].entryIds.length - 1);
});

test('time estimate: groups run side by side on their boards, then the Finals', () => {
  const t = makeTournament(app, 32, { pods: 8, boards: 8 });
  const per = f('matchDurationMinutes')(t, { isKnockout: true, legs: 5 });
  const est = f('podsEstimateMinutes')(t, 8);
  const groups = 3 * per;           // 4 players = 3 matches, one board each
  const finals = f('simulateKnockoutMinutes')(t, 8, 'knockout', 8);
  assert.equal(est, groups + finals);
  const fewer = f('podsEstimateMinutes')(t, 4);   // two groups per board
  assert.equal(fewer, 2 * groups + f('simulateKnockoutMinutes')(t, 8, 'knockout', 4));
  assert.equal(f('podsEstimateMinutes')(makeTournament(app, 5, { pods: 4 }), 4), null);
});

test('time estimate after the draw follows the boards actually given to each group', () => {
  const t = makeTournament(app, 32, { pods: 8, boards: 8 });
  const per = f('matchDurationMinutes')(t, { isKnockout: true, legs: 5 });
  const finals = f('simulateKnockoutMinutes')(t, 8, 'knockout', 8);
  f('generatePods')(t, seededRng(3));
  assert.equal(f('podsEstimateMinutes')(t, 8), 3 * per + finals);          // one group per board, as the draw sets them up
  t.pods[1].boards = [t.pods[0].boards[0]];                                // two groups now queue on one board
  assert.equal(f('podsEstimateMinutes')(t, 8), 6 * per + finals);
  t.pods[0].boards = [1, 2];                                               // a group on two boards plays its two first matches together
  assert.equal(f('podMinutes')(t.pods[0], per), 2 * per);
  t.pods[0].boards = [1];
  assert.equal(f('podMinutes')(t.pods[0], per), 3 * per);
});

test('time estimate after the draw uses the groups as drawn, including players moved between them', () => {
  const t = makeTournament(app, 12, { pods: 3, boards: 3 });
  f('generatePods')(t, seededRng(3));
  const per = f('matchDurationMinutes')(t, { isKnockout: true, legs: 5 });
  const finals = f('simulateKnockoutMinutes')(t, 3, 'knockout', 3);
  assert.equal(f('podsEstimateMinutes')(t, 3), 3 * per + finals);          // 4 players per group = 3 matches
  f('podsMovePlayer')(t, t.pods[0].entryIds[0], t.pods[1].id);              // groups of 3, 5, 4
  assert.equal(f('podsEstimateMinutes')(t, 3), 4 * per + finals);          // the group of 5 has 4 matches
});

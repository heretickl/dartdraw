const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, seededRng, makeTournament, play } = require('./lib/helpers');

const app = loadApp();
const f = (name) => run(app, name);
function drawn(n, pods, seed) { const t = makeTournament(app, n, { pods }); f('generatePods')(t, seededRng(seed || 2)); return t; }

test('bracket keys resolve to a group bracket or to a normal bracket', () => {
  const t = drawn(12, 3);
  const pod = t.pods[1];
  assert.equal(f('podBracketKey')(pod), 'pod:' + pod.id);
  assert.equal(f('podByKey')(t, 'pod:' + pod.id), pod);
  assert.equal(f('bracketByKey')(t, 'pod:' + pod.id), pod.bracket);
  assert.equal(f('podByKey')(t, 'knockout'), null);
  t.knockout = { rounds: [] };
  assert.equal(f('bracketByKey')(t, 'knockout'), t.knockout);
  assert.equal(f('podByKey')(t, 'pod:nope'), null);
});

test('a group is editable only while unconfirmed and unscored', () => {
  const t = drawn(12, 3);
  const pod = t.pods[0];
  assert.equal(f('podsCanEdit')(pod), true);
  pod.confirmed = true; assert.equal(f('podsCanEdit')(pod), false);
  pod.confirmed = false;
  const m = pod.bracket.rounds[0].find((x) => x.aEntryId && x.bEntryId);
  play(m, 'a');
  assert.equal(f('podHasScores')(pod), true);
  assert.equal(f('podsCanEdit')(pod), false);
  assert.equal(f('podsAnyScores')(t), true);
});

test('swapping two players between groups keeps sizes and rebuilds both brackets', () => {
  const t = drawn(12, 3);
  const a = t.pods[0], b = t.pods[1], x = a.entryIds[0], y = b.entryIds[0];
  assert.equal(f('podsSwapPlayers')(t, x, y).ok, true);
  assert.ok(b.entryIds.includes(x) && a.entryIds.includes(y));
  assert.equal(a.entryIds.length, 4); assert.equal(b.entryIds.length, 4);
  const inBracket = (p) => p.bracket.rounds[0].flatMap((m) => [m.aEntryId, m.bEntryId]).filter(Boolean);
  assert.ok(inBracket(a).includes(y) && !inBracket(a).includes(x));
});

test('moving a player changes both group sizes, and refuses a locked group', () => {
  const t = drawn(12, 3);
  const a = t.pods[0], b = t.pods[1], x = a.entryIds[0];
  assert.equal(f('podsMovePlayer')(t, x, b.id).ok, true);
  assert.equal(a.entryIds.length, 3); assert.equal(b.entryIds.length, 5);
  b.confirmed = true;
  const r = f('podsMovePlayer')(t, a.entryIds[0], b.id);
  assert.equal(r.ok, false); assert.match(r.message, /unconfirmed/);
});

test('a group may not drop below 2 players, and moving to the same group is refused', () => {
  const t = drawn(6, 3);
  const a = t.pods[0], b = t.pods[1];
  assert.equal(f('podsMovePlayer')(t, a.entryIds[0], b.id).ok, false);
  assert.equal(f('podsMovePlayer')(t, a.entryIds[0], a.id).ok, false);
  assert.equal(f('podsSwapPlayers')(t, a.entryIds[0], a.entryIds[1]).ok, false);
});

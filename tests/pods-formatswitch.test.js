const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, useState, seededRng, makeTournament, play } = require('./lib/helpers');
const { toPublicView } = require('../viewer/api/_lib/publicView');

const app = loadApp();
const f = (name) => run(app, name);
// A bracket the plain Knockout format would have built before the organiser switched to Group Boards.
function plainBracket(t) {
  app.__o = t.entriesList.slice(0, 8).map((e) => ({ entryId: e.id, org: '' }));
  return run(app, 'generateBracket(__o, "Bracket")');
}
function copy(t) { return JSON.parse(JSON.stringify(t)); }

test('groups are published only while the format is Group Boards', () => {
  const t = makeTournament(app, 12, { pods: 3 });
  f('generatePods')(t, seededRng(1)); f('podsConfirmAll')(t);
  assert.equal(toPublicView(copy(t)).pods.length, 3);
  const switched = copy(t); switched.format.formatType = 'knockout';
  assert.deepEqual(toPublicView(switched).pods, []);
});

test('a plain bracket is not published as the Finals of a Group Boards event', () => {
  const t = makeTournament(app, 16, { pods: 4 });
  t.knockout = plainBracket(t);
  assert.equal(toPublicView(copy(t)).knockout, null);
  f('generatePods')(t, seededRng(1)); f('podsConfirmAll')(t);
  assert.ok(toPublicView(copy(t)).knockout.podFinals);
});

test('a plain bracket does not count as the Finals: stage routing and screens', () => {
  const t = makeTournament(app, 16, { pods: 4 }); useState(app, t);
  t.knockout = plainBracket(t);
  assert.equal(f('computeStageFor')(t), 3);                       // no groups drawn yet, so back to chart details
  assert.match(f('podsStage7')(), /Not built yet/);
  assert.doesNotMatch(f('podsStage5')(), /Finals<\/button>/);
});

test('scores in a plain bracket do not lock the groups', () => {
  const t = makeTournament(app, 16, { pods: 4 });
  t.knockout = plainBracket(t);
  play(t.knockout.rounds[0].find((m) => m.aEntryId && m.bEntryId), 'a');
  assert.equal(f('podsAnyScores')(t), false);
});

test('drawing groups leaves a plain bracket alone, and confirming the last group builds the real Finals', () => {
  const t = makeTournament(app, 16, { pods: 4 });
  const stale = plainBracket(t);
  t.knockout = stale;
  f('generatePods')(t, seededRng(1));
  assert.equal(t.knockout, stale);
  f('podsConfirm')(t, t.pods[0].id); f('podsConfirm')(t, t.pods[1].id); f('podsConfirm')(t, t.pods[2].id);
  assert.equal(t.knockout, stale);
  f('podsConfirm')(t, t.pods[3].id);
  assert.ok(t.knockout.podFinals); assert.notEqual(t.knockout, stale);
});

test('a real Finals still behaves as before (routing and unconfirm)', () => {
  const t = makeTournament(app, 12, { pods: 3 });
  f('generatePods')(t, seededRng(1)); f('podsConfirmAll')(t);
  assert.equal(f('computeStageFor')(t), 5);
  assert.equal(f('podsUnconfirm')(t, t.pods[0].id).ok, true);
  assert.equal(t.knockout, null);
});

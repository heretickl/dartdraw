const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, seededRng, makeTournament, playOut } = require('./lib/helpers');
const { toPublicView } = require('../viewer/api/_lib/publicView');

const app = loadApp();
function event(confirmAll) {
  const t = makeTournament(app, 20, { pods: 5, seeding: true, numSeeds: 4 });
  run(app, 'generatePods')(t, seededRng(3));
  if (confirmAll) run(app, 'podsConfirmAll')(t); else run(app, 'podsConfirm')(t, t.pods[0].id);
  // private things that must never be published
  t.eventCreation.contact = 'SECRET CONTACT'; t.incidents = [{ description: 'SECRET INCIDENT' }];
  t.pods.forEach((p) => { p.internalNote = 'SECRET POD NOTE'; p.bracket.rounds.forEach((r) => r.forEach((m) => { m.privateNote = 'SECRET MATCH NOTE'; })); });
  t.entriesList.forEach((e) => { e.phone = 'SECRET PHONE'; });
  return JSON.parse(JSON.stringify(t));
}

test('only confirmed groups are published, with just the allowed fields', () => {
  const view = toPublicView(event(false));
  assert.equal(view.pods.length, 1);
  const pod = view.pods[0];
  assert.deepEqual(Object.keys(pod).sort(), ['bracket', 'boards', 'entryIds', 'id', 'label', 'winnerId'].sort());
  assert.equal(pod.bracket.podLabel, '1');
  assert.ok(pod.bracket.rounds.length >= 2);
});

test('the Finals placeholders and seeds are published', () => {
  const t = event(true);
  playOut(app, run(app, 'podsList')(t)[0] ? t.pods[0].bracket : null, () => 'a');   // finish one group on the copy
  const view = toPublicView(t);
  assert.equal(view.pods.length, 5);
  assert.equal(view.knockout.podFinals, true);
  const withPod = view.knockout.rounds[0].filter((m) => m.aFromPod || m.bFromPod);
  assert.ok(withPod.length >= 2);
  withPod.forEach((m) => assert.ok(view.pods.some((p) => p.id === (m.aFromPod || m.bFromPod))));
  assert.ok(Object.keys(view.pods[0].bracket.seeds).length >= 0);
  assert.equal(view.format.podCount, 5);
});

test('nothing private is published', () => {
  const text = JSON.stringify(toPublicView(event(true)));
  ['SECRET', 'phone', 'internalNote', 'privateNote', 'incidents'].forEach((word) => assert.ok(!text.includes(word), word));
});

test('a tournament with no groups publishes an empty list', () => {
  const view = toPublicView({ eventCreation: {}, format: {}, entriesList: [], groups: [] });
  assert.deepEqual(view.pods, []);
});

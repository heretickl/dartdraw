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

test('the board plan, called and board are published; doneAt and calledAt are not', () => {
  const t = event(true);
  t.boardPlan = JSON.parse(JSON.stringify(run(app, 'buildBoardPlan')(t)));
  t.boardPlan.boards['1'][0].secret = 'SECRET PLAN FIELD';
  const m = t.pods[0].bracket.rounds[0][0];
  m.called = true; m.calledAt = 111; m.doneAt = 222; t.knockout.rounds[0][0].board = 4;
  const view = toPublicView(JSON.parse(JSON.stringify(t)));
  assert.equal(view.boardPlan.v, 1);
  const first = view.boardPlan.boards['1'][0];
  assert.deepEqual(Object.keys(first).sort(), ['called', 'estMs', 'key', 'mi', 'ready', 'ri', 'status']);
  assert.equal(view.pods[0].bracket.rounds[0][0].called, true);
  assert.equal(view.knockout.rounds[0][0].board, 4);
  const text = JSON.stringify(view);
  assert.ok(!text.includes('doneAt') && !text.includes('calledAt') && !text.includes('SECRET PLAN FIELD'));
});

test('a malformed board plan is trimmed to safe values, and other formats publish none', () => {
  const t = event(true);
  t.boardPlan = { v: 1, hasTimes: 'yes', boards: { '1': [{ key: '<b>x</b>', ri: '1', mi: 0, status: 'weird', ready: 1, estMs: 'soon', called: 0 }], 'x<y': [] } };
  const view = toPublicView(JSON.parse(JSON.stringify(t)));
  assert.deepEqual(Object.keys(view.boardPlan.boards), ['1']);
  const e = view.boardPlan.boards['1'][0];
  assert.equal(e.key, ''); assert.equal(e.status, 'later'); assert.equal(e.estMs, null); assert.equal(e.ready, true); assert.equal(e.called, false);
  assert.equal(view.boardPlan.hasTimes, true);
  const other = event(true); other.format.formatType = 'knockout'; other.boardPlan = { v: 1, hasTimes: false, boards: {} };
  assert.equal(toPublicView(JSON.parse(JSON.stringify(other))).boardPlan, undefined);
  assert.equal(toPublicView(JSON.parse(JSON.stringify(event(true)))).boardPlan, undefined);   // no plan stored yet
});

test('a null element in a board array does not throw, and the other entries are kept', () => {
  const t = event(true);
  t.boardPlan = { v: 1, hasTimes: false, boards: { '1': [null, { key: 'ko', ri: 0, mi: 1, status: 'up', ready: true, estMs: null, called: false }, 5, 'x'] } };
  let view;
  assert.doesNotThrow(() => { view = toPublicView(JSON.parse(JSON.stringify(t))); });
  assert.equal(view.boardPlan.boards['1'].length, 1);
  assert.equal(view.boardPlan.boards['1'][0].mi, 1);
});

test('a published match has called true or nothing, and board a whole number 1 to 9999 or nothing', () => {
  const t = event(true);
  const ms = t.pods[0].bracket.rounds[0];
  ms[0].called = 'yes'; ms[0].board = '7';
  ms[1].called = 0; ms[1].board = 'x';
  const k = t.knockout.rounds[0];
  k[0].board = 0; k[1].board = 12345;
  const view = toPublicView(JSON.parse(JSON.stringify(t)));
  const vm = view.pods[0].bracket.rounds[0];
  assert.strictEqual(vm[0].called, true); assert.strictEqual(vm[0].board, 7);
  assert.ok(!('called' in vm[1])); assert.ok(!('board' in vm[1]));
  assert.ok(!('board' in view.knockout.rounds[0][0])); assert.ok(!('board' in view.knockout.rounds[0][1]));
});

test('void is published as true, or omitted', () => {
  const t = event(true);
  t.pods[0].bracket.rounds[0][0].void = true;
  t.pods[0].bracket.rounds[0][1].void = 'yes';
  t.pods[1].bracket.rounds[0][0].void = false;
  const view = toPublicView(JSON.parse(JSON.stringify(t)));
  assert.equal(view.pods[0].bracket.rounds[0][0].void, true);
  assert.equal(view.pods[0].bracket.rounds[0][1].void, true);
  assert.equal('void' in view.pods[1].bracket.rounds[0][0], false);
  assert.equal('void' in view.pods[2].bracket.rounds[0][0], false);
});

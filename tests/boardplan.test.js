const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, plain, useState, seededRng, makeTournament, play, playOut } = require('./lib/helpers');

const app = loadApp();
const f = (name) => run(app, name);
const FIXED = Date.UTC(2026, 9, 6, 9, 0, 0);
const r5 = (ms) => Math.round(ms / 300000) * 300000;
function ready(n, pods, opts) {
  const t = makeTournament(app, n, Object.assign({ pods, boards: pods }, opts || {})); useState(app, t);
  t.format.anticipatedStartTime = '10:00';
  app.persist = () => {}; app.render = () => {};
  f('generatePods')(t, seededRng(3)); f('podsConfirmAll')(t);
  return t;
}
const start = (t) => f('anticipatedStartEpoch')(t);
const per = (t) => f('matchDurationMinutes')(t, { isKnockout: true, legs: 5 });
const plan = (t, o) => plain(f('buildBoardPlan')(t, o));
const groupEntries = (p, board) => p.boards[board].filter((e) => e.key.startsWith('pod:'));

test('one group per board: the first match is up, the second next, the rest later, with estimates', () => {
  const t = ready(12, 3);
  const p = plan(t), q = groupEntries(p, '1');
  assert.deepEqual(q.map((e) => e.status), ['up', 'next', 'later']);
  assert.equal(q[0].estMs, null);
  assert.equal(q[1].estMs, r5(start(t) + per(t) * 60000));
  assert.equal(q[2].estMs, r5(start(t) + 2 * per(t) * 60000));   // the group final waits for both first-round matches
  assert.equal(p.hasTimes, true); assert.equal(p.v, 1);
});

test('two groups sharing a board queue one after the other', () => {
  const t = ready(12, 3);
  t.pods[1].boards = [t.pods[0].boards[0]];
  const p = plan(t), q = groupEntries(p, String(t.pods[0].boards[0]));
  assert.equal(q.length, 6);
  assert.deepEqual(q.map((e) => e.key), [].concat(Array(3).fill('pod:' + t.pods[0].id), Array(3).fill('pod:' + t.pods[1].id)));
  assert.equal(q[3].estMs, r5(start(t) + 3 * per(t) * 60000));
  assert.ok(!p.boards['2'] || groupEntries(p, '2').length === 0);
});

test('a group on two boards plays its first-round matches together', () => {
  const t = ready(12, 3);
  t.pods[0].boards = [1, 2];
  const p = plan(t);
  assert.equal(p.boards['1'][0].status, 'up'); assert.equal(p.boards['2'][0].status, 'up');
  assert.equal(p.boards['1'][0].key, 'pod:' + t.pods[0].id); assert.equal(p.boards['2'][0].key, 'pod:' + t.pods[0].id);
  assert.equal(p.boards['1'][1].status, 'next');
  assert.equal(p.boards['1'][1].estMs, r5(start(t) + per(t) * 60000));
});

test('byes never appear in the queue', () => {
  const t = ready(14, 4);
  const small = t.pods.find((p) => p.entryIds.length === 3);
  const p = plan(t);
  const mine = [].concat(...Object.values(p.boards)).filter((e) => e.key === 'pod:' + small.id);
  assert.equal(mine.length, 2);   // one first-round match and the group final
  mine.forEach((e) => assert.ok(!small.bracket.rounds[e.ri][e.mi].bye));
});

test('only confirmed groups are planned, and there is no Finals until it is built', () => {
  const t = makeTournament(app, 12, { pods: 3, boards: 3 }); useState(app, t);
  app.persist = () => {}; app.render = () => {};
  f('generatePods')(t, seededRng(3)); f('podsConfirm')(t, t.pods[0].id);
  const p = plan(t);
  const entries = [].concat(...Object.values(p.boards));
  assert.ok(entries.length > 0);
  entries.forEach((e) => assert.equal(e.key, 'pod:' + t.pods[0].id));
});

test('the Finals starts after the groups end and its entries are not ready until the groups are done', () => {
  const t = ready(12, 3);
  const p = plan(t), ko = p.boards['1'].filter((e) => e.key === 'ko');
  assert.ok(ko.length >= 2);
  assert.equal(ko[0].estMs, r5(start(t) + 3 * per(t) * 60000));
  assert.equal(ko[1].estMs, r5(start(t) + 4 * per(t) * 60000));
  assert.equal(ko[0].ready, false);
  t.pods.forEach((g) => playOut(app, g.bracket, () => 'a')); f('syncFinalsFromPods')(t);
  const after = plan(t).boards['1'].filter((e) => e.key === 'ko');
  assert.equal(after[0].ready, true);
});

test('Finals matches spread over the boards the groups used, lowest first', () => {
  const t = ready(32, 8);
  const p = plan(t);
  ['1', '2', '3', '4'].forEach((b) => assert.ok(p.boards[b].some((e) => e.key === 'ko' && e.ri === 0), 'board ' + b));
  assert.ok(!p.boards['5'].some((e) => e.key === 'ko' && e.ri === 0));
});

test('a Finals board override puts that match on the chosen board, even one no group uses', () => {
  const t = ready(32, 8);
  t.knockout.rounds[0][0].board = 5;
  assert.ok(plan(t).boards['5'].some((e) => e.key === 'ko' && e.ri === 0 && e.mi === 0));
  t.knockout.rounds[0][0].board = 9;
  const p = plan(t);
  assert.ok(p.boards['9'].some((e) => e.key === 'ko' && e.ri === 0 && e.mi === 0));
  assert.ok(!p.boards['1'].some((e) => e.key === 'ko' && e.ri === 0 && e.mi === 0));
});

test('with no anticipated start time there are no estimates, only statuses', () => {
  const t = ready(12, 3);
  t.format.anticipatedStartTime = '';
  const p = plan(t);
  assert.equal(p.hasTimes, false);
  [].concat(...Object.values(p.boards)).forEach((e) => assert.equal(e.estMs, null));
  assert.deepEqual(p.boards['1'].slice(0, 3).map((e) => e.status), ['up', 'next', 'later']);
});

test('a late result pushes the estimates behind it back, and undoing it puts them back', () => {
  const t = ready(12, 3);
  const before = plan(t);
  const m = t.pods[0].bracket.rounds[0][0];
  play(m, 'a'); m.doneAt = start(t) + 60 * 60000;
  const late = plan(t), q = late.boards[String(t.pods[0].boards[0])];
  assert.deepEqual(q.slice(0, 3).map((e) => e.status), ['done', 'up', 'next']);
  assert.equal(q[2].estMs, r5(start(t) + 60 * 60000 + per(t) * 60000));
  delete m.winnerId; delete m.aLegs; delete m.bLegs; delete m.doneAt;
  assert.deepEqual(plan(t), before);
});

test('the same state always gives the same plan, and a called match is flagged', () => {
  const t = ready(12, 3);
  const m = t.pods[0].bracket.rounds[0][0]; m.called = true;
  assert.deepEqual(plan(t), plan(t));
  const q = plan(t).boards[String(t.pods[0].boards[0])];
  assert.equal(q[0].called, true); assert.equal(q[1].called, false);
});

test('starts: true adds a rounded start time to every entry, including the one that is up', () => {
  const t = ready(12, 3);
  const q = plan(t, { starts: true }).boards['1'];
  assert.equal(q[0].startMs, r5(start(t)));
  assert.equal(q[1].startMs, r5(start(t) + per(t) * 60000));
  t.format.anticipatedStartTime = '';
  assert.equal(plan(t, { starts: true }).boards['1'][0].startMs, null);
});

test('stampDoneTimes stamps results, clears the stamp on undo, clears calls, and ignores byes', () => {
  const t = ready(14, 4);
  const m = t.pods[0].bracket.rounds[0].find((x) => x.aEntryId && x.bEntryId);
  play(m, 'a'); m.called = true; m.calledAt = 1;
  f('stampDoneTimes')(t);
  assert.equal(m.doneAt, FIXED); assert.equal(m.called, undefined); assert.equal(m.calledAt, undefined);
  m.doneAt = 5; f('stampDoneTimes')(t);
  assert.equal(m.doneAt, 5);                                   // not re-stamped
  delete m.winnerId; f('stampDoneTimes')(t);
  assert.equal(m.doneAt, undefined);                           // result undone
  t.pods.forEach((p) => p.bracket.rounds.forEach((r) => r.forEach((x) => { if (x.bye) assert.equal(x.doneAt, undefined); })));
});

test('estimates stay on the event day when the clock passes midnight', () => {
  const t = ready(12, 3);
  const A = start(t), board = String(t.pods[0].boards[0]);
  const m = t.pods[0].bracket.rounds[0][0];
  play(m, 'a'); m.doneAt = A - 24 * 3600000 + 30 * 60000;          // entered yesterday morning, so "today" is the next day
  const next = plan(t).boards[board].find((e) => e.status === 'next');
  assert.equal(next.estMs, r5(A - 24 * 3600000 + 30 * 60000 + per(t) * 60000));
  m.doneAt = A + 30 * 60000;                                         // a result from today leaves the anchor alone
  assert.equal(plan(t).boards[board].find((e) => e.status === 'next').estMs, r5(A + 30 * 60000 + per(t) * 60000));
  m.doneAt = A - 60 * 60000;                                         // so does one from before the start time
  assert.equal(plan(t).boards[board].find((e) => e.status === 'next').estMs, r5(A + per(t) * 60000));
});

test('stampDoneTimes clears a call on a match that has lost a player', () => {
  const t = ready(12, 3);
  const fin = t.knockout.rounds[0].find((x) => !x.bye);
  fin.called = true; fin.calledAt = 1; delete fin.aEntryId;
  const g = t.pods[0].bracket.rounds[0].find((x) => x.aEntryId && x.bEntryId);
  g.called = true; g.calledAt = 2; g.bEntryId = null;
  f('stampDoneTimes')(t);
  assert.equal(fin.called, undefined); assert.equal(fin.calledAt, undefined);
  assert.equal(g.called, undefined); assert.equal(g.calledAt, undefined);
  const ok = t.pods[1].bracket.rounds[0].find((x) => x.aEntryId && x.bEntryId);
  ok.called = true; f('stampDoneTimes')(t);
  assert.equal(ok.called, true);                                      // a complete, unplayed match keeps its call
});

test('a call is cleared when a different player takes the place of the one it was made for', () => {
  const t = ready(12, 3);
  t.pods.forEach((g) => playOut(app, g.bracket, () => 'a')); f('syncFinalsFromPods')(t);
  const m = t.knockout.rounds[0].find((x) => x.aEntryId && x.bEntryId);
  m.called = true; m.calledAt = 1;
  f('stampDoneTimes')(t);
  assert.equal(m.called, true);                                  // same two players: the call stands
  const other = t.entriesList.find((e) => e.id !== m.aEntryId && e.id !== m.bEntryId).id;
  m.aEntryId = other;                                            // a correction put someone else in
  f('stampDoneTimes')(t);
  assert.equal(m.called, undefined); assert.equal(m.calledAt, undefined); assert.equal(m.calledPair, undefined);
});

test('a call made with the Call button remembers the pair it was made for', () => {
  const t = ready(12, 3);
  const m = t.pods[0].bracket.rounds[0][0];
  f('bpToggleCall')('pod:' + t.pods[0].id, 0, 0);
  assert.equal(m.called, true); assert.equal(m.calledPair, m.aEntryId + '|' + m.bEntryId);
  f('bpToggleCall')('pod:' + t.pods[0].id, 0, 0);
  assert.equal(m.calledPair, undefined);
});

test('the anticipated start stays on the event first day for any format once play has begun', () => {
  const t = f('blankTournament')();
  t.format.anticipatedStartTime = '10:00';
  const A = f('anticipatedStartEpoch')(t);
  t.groups = [{ id: 'g1', startedAt: A - 24 * 3600000 + 30 * 60000, entryIds: [] }];   // started yesterday morning
  assert.equal(f('anticipatedStartEpoch')(t), A - 24 * 3600000);
  t.groups = [{ id: 'g1', startedAt: A + 30 * 60000, entryIds: [] }];                  // started today: unchanged
  assert.equal(f('anticipatedStartEpoch')(t), A);
  t.groups = [];
  assert.equal(f('anticipatedStartEpoch')(t), A);
  t.format.anticipatedStartTime = '';
  assert.equal(f('anticipatedStartEpoch')(t), null);
});

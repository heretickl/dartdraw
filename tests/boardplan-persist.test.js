const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, plain, useState, seededRng, makeTournament, play } = require('./lib/helpers');

const app = loadApp();
const f = (name) => run(app, name);
app.setTimeout = () => 0; app.clearTimeout = () => {};   // persist schedules a save; never run it here
app.render = () => {};
const FIXED = Date.UTC(2026, 9, 6, 9, 0, 0);
function ready(n, pods) {
  const t = makeTournament(app, n, { pods, boards: pods }); useState(app, t);
  t.format.anticipatedStartTime = '10:00';
  f('generatePods')(t, seededRng(3)); f('podsConfirmAll')(t);
  return t;
}

test('saving a Group Boards tournament stores a board plan and stamps results', () => {
  const t = ready(12, 3);
  f('persist')();
  assert.equal(t.boardPlan.v, 1);
  assert.ok(Object.keys(t.boardPlan.boards).length >= 3);
  const m = t.pods[0].bracket.rounds[0][0];
  play(m, 'a');
  f('persist')();
  assert.equal(m.doneAt, FIXED);
  assert.equal(t.boardPlan.boards[String(t.pods[0].boards[0])][0].status, 'done');
  assert.deepEqual(plain(t.boardPlan), plain(f('buildBoardPlan')(t)));
});

test('a no-show is stamped like a played result and moves the queue on', () => {
  const t = ready(12, 3);
  f('persist')();
  const m = t.pods[0].bracket.rounds[0][0];
  f('markKnockoutNoShow')('pod:' + t.pods[0].id, 0, 0, 'a');
  assert.equal(m.wo, true);
  assert.equal(m.doneAt, FIXED);
  assert.equal(t.boardPlan.boards[String(t.pods[0].boards[0])][0].status, 'done');
});

test('other formats never get a board plan, and a leftover one is dropped', () => {
  const t = f('blankTournament')();
  t.format.formatType = 'knockout'; useState(app, t);
  f('persist')();
  assert.equal('boardPlan' in t, false);
  t.boardPlan = { v: 1, hasTimes: false, boards: {} };
  f('persist')();
  assert.equal('boardPlan' in t, false);
});

test('the two new print sheets are on by default, for new and for older tournaments', async () => {
  const fresh = f('blankTournament')();
  assert.equal(fresh.printSettings.playersSheetEnabled, true);
  assert.equal(fresh.printSettings.boardsSheetEnabled, true);
  const old = f('blankTournament')();
  delete old.printSettings.playersSheetEnabled; delete old.printSettings.boardsSheetEnabled;
  app.fetch = async () => ({ ok: true, status: 200, json: async () => ({ data: old, updated_at: '2026-01-01T00:00:00Z' }) });
  await f('openTournament')('t_old');
  const s = run(app, 'state');
  assert.equal(s.printSettings.playersSheetEnabled, true);
  assert.equal(s.printSettings.boardsSheetEnabled, true);
});

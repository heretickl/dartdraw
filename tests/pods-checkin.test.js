const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, useState, seededRng, makeTournament } = require('./lib/helpers');

const app = loadApp();
const f = (name) => run(app, name);
function fresh(n, pods) {
  const t = makeTournament(app, n, { pods }); useState(app, t);
  app.persist = () => {}; app.render = () => {};
  return t;
}
const checkIn = (t, count) => t.entriesList.slice(0, count).forEach((e) => { e.checkedIn = true; });
function captureModal() { const box = { modal: null }; app.openModal = (o) => { box.modal = o; }; return box; }

test('the draw screen shows who has not checked in once check-in is in use, with a way to withdraw them', () => {
  const t = fresh(12, 3); checkIn(t, 9);
  const html = f('podsStage3')();
  assert.match(html, /9 of 12 checked in/);
  assert.match(html, /Not everyone is checked in/); assert.ok(html.includes('Player 10')); assert.ok(html.includes('Player 12'));
  assert.match(html, /podsWithdrawUncheckedClick\(\)/);
});

test('a tournament that never uses check-in is not nagged, and neither is one where everyone is in', () => {
  const t = fresh(12, 3);
  assert.doesNotMatch(f('podsStage3')(), /checked in/);
  checkIn(t, 12);
  assert.doesNotMatch(f('podsStage3')(), /Not everyone is checked in/);
});

test('once the groups are drawn the draw screen no longer shows the check-in box', () => {
  const t = fresh(12, 3); checkIn(t, 9);
  f('generatePods')(t, seededRng(2));
  assert.doesNotMatch(f('podsStage3')(), /Not everyone is checked in/);
});

test('drawing asks first when someone has not checked in, and draws only after the organiser agrees', () => {
  const t = fresh(12, 3); checkIn(t, 9);
  const box = captureModal();
  f('podsDrawClick')();
  assert.equal(box.modal.title, 'Draw without everyone?');
  assert.match(box.modal.bodyHTML, /Not everyone is checked in/);
  assert.equal(t.pods.length, 0);
  box.modal.onConfirm();
  assert.equal(t.pods.length, 3);
});

test('drawing goes straight through when nobody uses check-in or everyone is in', () => {
  const t = fresh(12, 3);
  const box = captureModal();
  f('podsDrawClick')();
  assert.equal(box.modal, null); assert.equal(t.pods.length, 3);
});

test('withdrawing the players who have not checked in removes only them, before the draw', () => {
  const t = fresh(12, 3); checkIn(t, 9);
  const box = captureModal();
  f('podsWithdrawUncheckedClick')();
  assert.match(box.modal.title, /Withdraw 3 players\?/);
  assert.ok(box.modal.bodyHTML.includes('Player 10'));
  box.modal.onConfirm();
  assert.deepEqual(t.entriesList.filter((e) => e.withdrawn).map((e) => e.name), ['Player 10', 'Player 11', 'Player 12']);
  assert.equal(f('podsPlayerCount')(t), 9);
  assert.doesNotMatch(f('podsStage3')(), /Not everyone is checked in/);
});

test('withdrawing does nothing once the groups are drawn', () => {
  const t = fresh(12, 3); checkIn(t, 9);
  f('generatePods')(t, seededRng(2));
  const box = captureModal();
  f('podsWithdrawUncheckedClick')();
  assert.equal(box.modal, null);
  assert.equal(t.entriesList.filter((e) => e.withdrawn).length, 0);
});

test('confirming a group with someone not checked in asks first; groups with everyone in confirm straight away', () => {
  const t = fresh(12, 3); f('generatePods')(t, seededRng(2));
  const absent = t.pods[0].entryIds[0];
  t.entriesList.forEach((e) => { e.checkedIn = e.id !== absent; });
  const box = captureModal();
  f('podsConfirmClick')(t.pods[1].id);
  assert.equal(box.modal, null); assert.equal(t.pods[1].confirmed, true);
  f('podsConfirmClick')(t.pods[0].id);
  assert.equal(box.modal.title, 'Confirm without everyone?');
  assert.equal(t.pods[0].confirmed, false);
  box.modal.onConfirm();
  assert.equal(t.pods[0].confirmed, true);
});

test('confirm all asks once about everyone missing, and does nothing different when check-in is unused', () => {
  const t = fresh(12, 3); f('generatePods')(t, seededRng(2));
  let box = captureModal();
  f('podsConfirmAllClick')();
  assert.equal(box.modal, null); assert.ok(t.pods.every((p) => p.confirmed));
  const u = fresh(12, 3); f('generatePods')(u, seededRng(2)); checkIn(u, 10);
  box = captureModal();
  f('podsConfirmAllClick')();
  assert.equal(box.modal.title, 'Confirm without everyone?');
  assert.ok(u.pods.every((p) => !p.confirmed));
  box.modal.onConfirm();
  assert.ok(u.pods.every((p) => p.confirmed));
});

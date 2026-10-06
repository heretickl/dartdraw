const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, useState, seededRng, makeTournament, play, playOut } = require('./lib/helpers');

const app = loadApp();
const f = (name) => run(app, name);
function drawn(n, pods) {
  const t = makeTournament(app, n, { pods }); useState(app, t);
  app.persist = () => {}; app.render = () => {};
  f('generatePods')(t, seededRng(2));
  return t;
}

test('confirm screen before any draw points back to chart details', () => {
  const t = makeTournament(app, 12, { pods: 3 }); useState(app, t);
  assert.match(f('podsStage4')(), /Draw the groups in Chart details first/);
});

test('confirm screen lists each group with Confirm links, and builds the Finals when all are confirmed', () => {
  const t = drawn(12, 3);
  let html = f('podsStage4')();
  assert.match(html, /0 of 3/); assert.match(html, /Not built yet/);
  assert.equal((html.match(/podsConfirmClick\(/g) || []).length, 3);
  f('podsConfirmClick')(t.pods[0].id);
  assert.equal(t.pods[0].confirmed, true); assert.equal(t.knockout, null);
  f('podsConfirmAllClick')();
  assert.ok(t.knockout);
  html = f('podsStage4')();
  assert.match(html, /3 of 3/); assert.match(html, /slot chart built/);
  assert.match(html, /Winner of Group/);
});

test('unconfirming is refused with a message once a group has scores', () => {
  const t = drawn(12, 3);
  f('podsConfirmAllClick')();
  play(t.pods[0].bracket.rounds[0].find((m) => m.aEntryId && m.bEntryId), 'a');
  let modal = null; app.openModal = (o) => { modal = o; };
  f('podsUnconfirmClick')(t.pods[0].id);
  assert.match(modal.body, /already has scores/);
  assert.equal(t.pods[0].confirmed, true);
});

test('manage screen needs at least one confirmed group', () => {
  drawn(12, 3);
  assert.match(f('podsStage5')(), /Confirm the groups in Confirm/);
});

test('manage grid shows every group with its status and progress', () => {
  const t = drawn(12, 3);
  f('podsConfirmAllClick')();
  let html = f('podsStage5')();
  assert.match(html, /0 of 3<\/b> groups finished/);
  assert.match(html, /Group 1/); assert.match(html, /Not started/);
  playOut(app, t.pods[0].bracket, () => 'a'); f('syncFinalsFromPods')(t);
  html = f('podsStage5')();
  assert.match(html, /1 of 3<\/b> groups finished/); assert.match(html, /Winner: /);
});

test('the filter shows only finished or unfinished groups', () => {
  const t = drawn(12, 3);
  f('podsConfirmAllClick')();
  playOut(app, t.pods[0].bracket, () => 'a'); f('syncFinalsFromPods')(t);
  f('podsSetFilter')('done');
  let html = f('podsStage5')();
  assert.match(html, /podsSelect\('/); assert.equal((html.match(/Winner: /g) || []).length, 1);
  f('podsSetFilter')('open');
  html = f('podsStage5')();
  assert.doesNotMatch(html, /Winner: /);
  f('podsSetFilter')('all');
});

test('opening a group shows its chart; scoring is available only for confirmed groups', () => {
  const t = drawn(12, 3);
  f('podsConfirmClick')(t.pods[1].id);   // the screen needs at least one confirmed group
  f('podsSelect')(t.pods[0].id);
  let html = f('podsStage5')();
  assert.match(html, /Confirm this group/);
  f('podsConfirmClick')(t.pods[0].id);
  html = f('podsStage5')();
  assert.match(html, /koMatchScoreModal\('pod:/);
  assert.doesNotMatch(html, /Confirm this group/);
  f('podsSelect')('grid');
});

test('the Finals tab appears once built, and its matches become clickable as groups finish', () => {
  const t = drawn(12, 3);
  f('podsConfirmAllClick')();
  f('podsSelect')('finals');
  let html = f('podsStage5')();
  assert.match(html, /Winner of Group/);
  assert.doesNotMatch(html, /koMatchScoreModal\('knockout'/);
  t.pods.forEach((p) => { playOut(app, p.bracket, () => 'a'); f('syncFinalsFromPods')(t); });
  html = f('podsStage5')();
  assert.match(html, /koMatchScoreModal\('knockout'/);
  f('podsSelect')('grid');
});

test('stages 4 and 5 route to the Group Boards screens', () => {
  const t = drawn(12, 3);
  f('podsConfirmAllClick')();
  assert.match(f('stage4')(), /Confirm groups/);
  assert.match(f('stage5')(), /Manage tournament/);
  assert.match(f('stage5')(), /groups finished/);
});

test('a group opened on the manage screen has a boards box, so a broken board can be swapped mid-event', () => {
  const t = drawn(12, 3);
  f('podsConfirmAllClick')();
  f('podsSelect')(t.pods[0].id);
  const html = f('podsStage5')();
  assert.match(html, /onchange="setPodBoards\('/);
  assert.match(html, /Board/);
  f('podsSelect')('grid');
});

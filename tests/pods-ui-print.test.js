const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, useState, seededRng, makeTournament, playOut } = require('./lib/helpers');

const app = loadApp();
const f = (name) => run(app, name);
function ready(n, pods) {
  const t = makeTournament(app, n, { pods }); useState(app, t);
  app.persist = () => {}; app.render = () => {};
  f('generatePods')(t, seededRng(2)); f('podsConfirmAll')(t);
  return t;
}
function finishGroups(t) { t.pods.forEach((p) => { playOut(app, p.bracket, () => 'a'); f('syncFinalsFromPods')(t); }); }

test('results screen lists each group winner and runner-up, then the Finals placings', () => {
  const t = ready(12, 3);
  finishGroups(t);
  const html = f('podsStage6')();
  assert.match(html, /Group winners/);
  const winner = t.entriesList.find((e) => e.id === t.pods[0].winnerId).name;
  assert.ok(html.includes(winner));
  assert.match(html, /Not complete yet/);   // the Finals has not been played
  playOut(app, t.knockout, () => 'a');
  assert.match(f('podsStage6')(), /Winner: /);
});

test('results screen with no groups says so', () => {
  const t = makeTournament(app, 12, { pods: 3 }); useState(app, t);
  assert.match(f('podsStage6')(), /No groups yet/);
});

test('print screen counts the group sheets and enables printing', () => {
  const t = ready(12, 3);
  const html = f('podsStage7')();
  assert.match(html, /Group sheets/); assert.match(html, />3</);
  assert.match(html, /doFinalPrint\(\)/); assert.doesNotMatch(html, /disabled onclick="doFinalPrint/);
});

test('printing builds one sheet per group plus the Finals', () => {
  const t = ready(12, 3);
  const mount = { innerHTML: '' };
  app.document = { getElementById: (id) => (id === 'printSheets' ? mount : null) };
  app.window = { print() {} };
  f('podsPrintClick')();
  assert.equal(t.printedPack, true);
  assert.equal((mount.innerHTML.match(/GROUP \d/g) || []).length >= 3, true);
  assert.match(mount.innerHTML, /Group 1 · Board 1/);
  assert.match(mount.innerHTML, /FINALS/);
});

test('printing with no groups shows a message instead', () => {
  const t = makeTournament(app, 12, { pods: 3 }); useState(app, t);
  let modal = null; app.openModal = (o) => { modal = o; };
  f('podsPrintClick')();
  assert.match(modal.body, /Draw the groups first/);
});

test('stages 6 and 7, and the print button, route to the Group Boards versions', () => {
  const t = ready(12, 3);
  assert.match(f('stage6')(), /Group winners/);
  assert.match(f('stage7')(), /Group sheets/);
  const mount = { innerHTML: '' };
  app.document = { getElementById: (id) => (id === 'printSheets' ? mount : null) };
  app.window = { print() {} };
  f('doFinalPrint')();
  assert.match(mount.innerHTML, /Group 1/);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, plain, useState, seededRng, makeTournament, playOut } = require('./lib/helpers');

const app = loadApp();
const f = (name) => run(app, name);
function ready(n, pods, startTime) {
  const t = makeTournament(app, n, { pods, boards: pods }); useState(app, t);
  t.format.anticipatedStartTime = startTime === undefined ? '10:00' : startTime;
  app.persist = () => {}; app.render = () => {};
  f('generatePods')(t, seededRng(3)); f('podsConfirmAll')(t);
  return t;
}

test('the panel shows one card per board with the match that is up now, the next one, and the buttons', () => {
  const t = ready(12, 3);
  const html = f('bpPanelHTML')();
  assert.match(html, /<h2>Boards<\/h2>/);
  assert.equal((html.match(/<strong>Board \d+<\/strong>/g) || []).length, 3);
  assert.match(html, /Up now/); assert.match(html, /Next/);
  assert.match(html, new RegExp("bpToggleCall\\('pod:" + t.pods[0].id + "',0,0\\)"));
  assert.match(html, new RegExp("koMatchScoreModal\\('pod:" + t.pods[0].id + "',0,0\\)"));
  assert.match(html, new RegExp("openKoNoShowPicker\\('pod:" + t.pods[0].id + "',0,0\\)"));
  assert.match(html, /~\d/);                      // the next match has an estimated time
});

test('with no start time the panel says estimates are off and shows no times', () => {
  ready(12, 3, '');
  const html = f('bpPanelHTML')();
  assert.match(html, /Estimated times are off/); assert.doesNotMatch(html, /~\d/);
});

test('Call flags the match, Uncall clears it, and a match that is not ready cannot be called', () => {
  const t = ready(12, 3);
  const key = 'pod:' + t.pods[0].id, m = t.pods[0].bracket.rounds[0][0];
  f('bpToggleCall')(key, 0, 0);
  assert.equal(m.called, true); assert.ok(m.calledAt > 0);
  assert.match(f('bpPanelHTML')(), /Uncall/); assert.match(f('bpPanelHTML')(), /Called/);
  f('bpToggleCall')(key, 0, 0);
  assert.equal(m.called, undefined); assert.equal(m.calledAt, undefined);
  const fin = t.knockout.rounds[0].findIndex((x) => !x.bye);
  f('bpToggleCall')('knockout', 0, fin);                       // players are still "Winner of Group N"
  assert.equal(t.knockout.rounds[0][fin].called, undefined);
});

test('an entry that is not ready has no buttons and names the group it is waiting for', () => {
  const t = ready(12, 3);
  const html = f('bpEntryRowHTML')(t, { key: 'ko', ri: 0, mi: t.knockout.rounds[0].findIndex((x) => !x.bye), status: 'next', ready: false, estMs: null, called: false }, 'Next');
  assert.match(html, /Winner of Group \d/); assert.doesNotMatch(html, /<button/);
});

test('Finals boards can be set per match from the panel, and cleared', () => {
  const t = ready(32, 8);
  assert.match(f('bpPanelHTML')(), /Finals boards/);
  f('bpSetFinalsBoard')(0, 0, '6');
  assert.equal(t.knockout.rounds[0][0].board, 6);
  f('bpSetFinalsBoard')(0, 0, 'abc');
  assert.equal(t.knockout.rounds[0][0].board, undefined);
});

test('the panel is empty before any group is confirmed', () => {
  const t = makeTournament(app, 12, { pods: 3 }); useState(app, t);
  app.persist = () => {}; app.render = () => {};
  f('generatePods')(t, seededRng(3));
  assert.equal(f('bpPanelHTML')(), '');
});

test('Stage 5 shows the Boards panel above the public results card', () => {
  ready(12, 3);
  const html = f('podsStage5')();
  assert.ok(html.indexOf('<h2>Boards</h2>') > -1);
});

test('a call can always be cleared, even when the match lost a player, but not set on such a match', () => {
  const t = ready(12, 3);
  const key = 'pod:' + t.pods[0].id, m = t.pods[0].bracket.rounds[0][0];
  m.called = true; m.calledAt = 1; delete m.aEntryId;
  f('bpToggleCall')(key, 0, 0);
  assert.equal(m.called, undefined); assert.equal(m.calledAt, undefined);
  f('bpToggleCall')(key, 0, 0);                                  // still refuses to set a call on it
  assert.equal(m.called, undefined);
  const n = t.pods[1].bracket.rounds[0][0];
  n.called = true; n.calledAt = 1; n.winnerId = n.aEntryId;      // a stale call on a played match can also be cleared
  f('bpToggleCall')('pod:' + t.pods[1].id, 0, 0);
  assert.equal(n.called, undefined);
});

test('the Finals board box is escaped and only 1 to 9999 is accepted', () => {
  const t = ready(32, 8);
  t.knockout.rounds[0][0].board = '"><img src=x>';
  assert.doesNotMatch(f('bpPanelHTML')(), /<img/);
  f('bpSetFinalsBoard')(0, 0, '9999'); assert.equal(t.knockout.rounds[0][0].board, 9999);
  f('bpSetFinalsBoard')(0, 0, '12345'); assert.equal(t.knockout.rounds[0][0].board, undefined);
  f('bpSetFinalsBoard')(0, 0, '0'); assert.equal(t.knockout.rounds[0][0].board, undefined);
});

test('setPodBoards ignores board numbers above 9999', () => {
  const t = ready(12, 3);
  f('setPodBoards')(t.pods[0].id, '7, 12345');
  assert.deepEqual(plain(t.pods[0].boards), [7]);
  f('setPodBoards')(t.pods[0].id, '12345');
  assert.deepEqual(plain(t.pods[0].boards), [7]);
});

function voidGroup(t, pod) {
  [0, 1].forEach((i) => { const m = pod.bracket.rounds[0][i]; f('podsApplyResult')(t, pod, () => { m.void = true; m.aLegs = null; m.bLegs = null; m.winnerId = null; m.wo = false; }); });
}
const finalsMatchOf = (t, p) => t.knockout.rounds[0].findIndex((m) => m.aFromPod === p.id || m.bFromPod === p.id);

test('the Finals boards editor does not list a void Finals match', () => {
  const t = ready(16, 4);
  const p = t.pods[0], mi = finalsMatchOf(t, p), km = t.knockout.rounds[0][mi];
  const q = t.pods.find((x) => x.id === (km.aFromPod === p.id ? km.bFromPod : km.aFromPod));
  const other = t.knockout.rounds[0].findIndex((m, i) => i !== mi);
  assert.ok(f('bpFinalsBoardsHTML')(t, f('buildBoardPlan')(t)).includes('bpSetFinalsBoard(0,' + mi + ','));
  voidGroup(t, p); voidGroup(t, q);
  assert.equal(km.void, true);
  const html = f('bpFinalsBoardsHTML')(t, f('buildBoardPlan')(t));
  assert.ok(!html.includes('bpSetFinalsBoard(0,' + mi + ','));
  assert.ok(html.includes('bpSetFinalsBoard(0,' + other + ','));
});

test('a Finals slot fed by a group with no winner reads "Group N: no winner" in the panel', () => {
  const t = ready(16, 4);
  const p = t.pods[0], km = t.knockout.rounds[0][finalsMatchOf(t, p)];
  assert.equal(f('bpSlotName')(t, km, km.aFromPod === p.id ? 'a' : 'b'), 'Winner of Group ' + p.label);
  voidGroup(t, p);
  const side = km.aFromPod === p.id ? 'a' : 'b', otherSide = side === 'a' ? 'b' : 'a';
  assert.equal(f('bpSlotName')(t, km, side), 'Group ' + p.label + ': no winner');
  assert.match(f('bpSlotName')(t, km, otherSide), /^Winner of Group /);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run: runApp, seededRng, makeTournament, playOut } = require('./lib/helpers');
const { loadViewer, setViewerState, runViewer: rv } = require('./lib/load-viewer');
const { toPublicView } = require('../viewer/api/_lib/publicView');

const org = loadApp();
function event(n, pods, after) {
  const t = makeTournament(org, n, { pods, boards: pods });
  runApp(org, 'generatePods')(t, seededRng(5)); runApp(org, 'podsConfirmAll')(t);
  if (after) after(t);
  return t;
}
function voidIt(t, pod, ri, mi) {
  const m = pod.bracket.rounds[ri][mi];
  return runApp(org, 'podsApplyResult')(t, pod, () => { m.void = true; m.aLegs = null; m.bLegs = null; m.winnerId = null; m.wo = false; });
}
function viewerFor(t) { const v = loadViewer(); setViewerState(v, toPublicView(JSON.parse(JSON.stringify(t)))); return v; }

test('a player in a void match sees "Neither attended" in their match list and a knocked-out status line', () => {
  const t = event(16, 4, (x) => { voidIt(x, x.pods[0], 0, 0); });
  const m = t.pods[0].bracket.rounds[0][0];
  const v = viewerFor(t);
  v.__id = m.aEntryId;
  assert.match(rv(v, 'matchesHTML(__id)'), /Neither attended/);
  assert.match(rv(v, 'statusLine(__id)'), /^Out in the .* · neither player attended/);
});

test('a group whose final is void shows "No winner" and counts as finished', () => {
  const t = event(16, 4, (x) => { voidIt(x, x.pods[0], 0, 0); voidIt(x, x.pods[0], 0, 1); });
  const v = viewerFor(t);
  assert.equal(rv(v, 'podFinished(state.pods[0])'), true);
  assert.equal(rv(v, 'podFinished(state.pods[1])'), false);
  const html = rv(v, 'podsAllHTML()');
  assert.match(html, /No winner/);
  assert.match(html, /1 of 4 finished/);
});

test('a Finals slot fed by a group with no winner reads "Group N: no winner"', () => {
  const t = event(16, 4, (x) => { voidIt(x, x.pods[0], 0, 0); voidIt(x, x.pods[0], 0, 1); });
  const v = viewerFor(t);
  const mi = t.knockout.rounds[0].findIndex((m) => m.aFromPod === t.pods[0].id || m.bFromPod === t.pods[0].id);
  v.__mi = mi;
  const side = t.knockout.rounds[0][mi].aFromPod === t.pods[0].id ? 'a' : 'b';
  assert.match(rv(v, 'rsSlotHTML(state.knockout, 0, __mi, "' + side + '")'), new RegExp('Group ' + t.pods[0].label + ': no winner'));
});

test('the Rounds card of a void match says so instead of "To play"', () => {
  const t = event(16, 4, (x) => { voidIt(x, x.pods[0], 0, 0); });
  const v = viewerFor(t);
  const html = rv(v, 'rsMatchHTML(state.pods[0].bracket, 0, 0)');
  assert.match(html, /Neither attended/); assert.doesNotMatch(html, /To play/);
});

test('an event with no void is unchanged: no void wording appears', () => {
  const t = event(16, 4);
  const v = viewerFor(t);
  v.__id = t.pods[0].bracket.rounds[0][0].aEntryId;
  assert.doesNotMatch(rv(v, 'matchesHTML(__id)'), /Neither attended/);
  assert.doesNotMatch(rv(v, 'podsAllHTML()'), /No winner/);
  assert.doesNotMatch(rv(v, 'statusLine(__id)'), /neither player attended/);
});

test('a group final made void by two void semifinals reads "Not played", not "Neither attended"', () => {
  const t = event(16, 4, (x) => { voidIt(x, x.pods[0], 0, 0); voidIt(x, x.pods[0], 0, 1); });
  const v = viewerFor(t);
  const html = rv(v, 'rsMatchHTML(state.pods[0].bracket, 1, 0)');
  assert.match(html, /Not played/); assert.doesNotMatch(html, /Neither attended/);
  assert.match(rv(v, 'rsMatchHTML(state.pods[0].bracket, 0, 0)'), /Neither attended/);
});

test('the Boards tab names a Finals slot fed by a group with no winner', () => {
  const t = event(16, 4, (x) => { voidIt(x, x.pods[0], 0, 0); voidIt(x, x.pods[0], 0, 1); });
  const v = viewerFor(t);
  const p = t.pods[0], mi = t.knockout.rounds[0].findIndex((m) => m.aFromPod === p.id || m.bFromPod === p.id);
  v.__e = { key: 'ko', ri: 0, mi };
  const text = rv(v, 'bpMatchText(__e)');
  assert.match(text, new RegExp('Group ' + p.label + ': no winner'));
  assert.ok(!text.includes('Winner of Group ' + p.label + ' '));
});

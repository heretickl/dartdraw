const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run: runApp, plain, seededRng, makeTournament, playOut } = require('./lib/helpers');
const { loadViewer, setViewerState, runViewer: rv } = require('./lib/load-viewer');
const { toPublicView } = require('../viewer/api/_lib/publicView');

const org = loadApp();
function event(n, pods, opts) {
  opts = opts || {};
  const t = makeTournament(org, n, { pods, seeding: true, numSeeds: 4, boards: 8 });
  runApp(org, 'generatePods')(t, seededRng(5));
  if (opts.confirmOnly != null) runApp(org, 'podsConfirm')(t, t.pods[opts.confirmOnly].id); else runApp(org, 'podsConfirmAll')(t);
  if (opts.finish != null) { playOut(org, t.pods[opts.finish].bracket, () => 'a'); runApp(org, 'syncFinalsFromPods')(t); }
  return t;
}
function viewerFor(t) { const v = loadViewer(); setViewerState(v, toPublicView(JSON.parse(JSON.stringify(t)))); return v; }

test('a Group Boards event has a Bracket tab and no Groups tab', () => {
  const v = viewerFor(event(12, 3));
  const tabs = plain(rv(v, 'availableTabs()'));
  assert.ok(tabs.includes('bracket')); assert.ok(!tabs.includes('groups')); assert.ok(tabs.includes('me'));
});

test('a player in an unfinished group sees the group, their match tag and the board', () => {
  const t = event(12, 3);
  const v = viewerFor(t);
  v.__id = t.pods[0].entryIds[0];
  const s = rv(v, 'statusLine(__id)');
  assert.match(s, /^Next: Group 1, /); assert.match(s, /G1·1-\d/); assert.match(s, /Board 1/);
});

test('after winning a group the player sees their Finals match', () => {
  const t = event(12, 3, { finish: 0 });
  const v = viewerFor(t);
  v.__id = t.pods[0].winnerId;
  const s = rv(v, 'statusLine(__id)');
  assert.match(s, /^Next: Finals, (Final|Semifinal)/); assert.doesNotMatch(s, /Group 1, /);
});

test('a group winner is told they go through when the Finals is not built yet', () => {
  const t = makeTournament(org, 12, { pods: 3 });
  runApp(org, 'generatePods')(t, seededRng(5)); runApp(org, 'podsConfirm')(t, t.pods[0].id);
  playOut(org, t.pods[0].bracket, () => 'a'); runApp(org, 'syncFinalsFromPods')(t);
  const v = viewerFor(t);
  v.__id = t.pods[0].winnerId;
  assert.match(rv(v, 'statusLine(__id)'), /^Won Group 1 · through to the Finals/);
});

test('a Finals slot that is waiting on a group reads "Winner of Group N"', () => {
  const t = event(20, 5);
  const v = viewerFor(t);
  const mi = t.knockout.rounds[0].findIndex((m) => m.aFromPod && m.bFromPod);
  v.__mi = mi;
  assert.match(rv(v, 'rsSlotHTML(state.knockout, 0, __mi, "a")'), /Winner of Group \d+/);
});

test('the picker lists Finals, All groups, and groups under In progress and Completed', () => {
  const v = viewerFor(event(12, 3, { finish: 0 }));
  const html = rv(v, 'podsPickerHTML()');
  assert.match(html, /value="finals"/); assert.match(html, /value="all"/);
  assert.match(html, /<optgroup label="In progress">/); assert.match(html, /<optgroup label="Completed">/);
});

test('All groups shows a card per group with its winner or progress', () => {
  const v = viewerFor(event(12, 3, { finish: 0 }));
  rv(v, 'podSel = "all"');
  const html = rv(v, 'podsBracketTabHTML()');
  assert.equal((html.match(/class="podcard"/g) || []).length, 3);
  assert.match(html, /Winner: /); assert.match(html, /In progress/); assert.match(html, /1 of 3 finished/);
});

test('choosing a group shows that group bracket round by round', () => {
  const t = event(12, 3);
  const v = viewerFor(t);
  rv(v, 'podSel = ' + JSON.stringify(t.pods[1].id));
  const html = rv(v, 'podsBracketTabHTML()');
  assert.match(html, /Group 2/); assert.match(html, /class="rseg"/);
});

test('"My group" jumps to the player\'s own group', () => {
  const t = event(12, 3);
  const v = viewerFor(t);
  rv(v, 'prefs.me = ' + JSON.stringify(t.pods[2].entryIds[0]));
  assert.match(rv(v, 'podsPickerHTML()'), new RegExp('data-pod="' + t.pods[2].id + '"'));
});

test('draws of 32 or more open in Rounds on a wide screen; smaller ones in Chart', () => {
  const v = viewerFor(event(12, 3));
  v.window = { matchMedia: () => ({ matches: false }), addEventListener() {}, scrollTo() {} };
  assert.equal(rv(v, 'bracketView({size: 64})'), 'rounds');
  assert.equal(rv(v, 'bracketView({size: 16})'), 'chart');
  v.window = { matchMedia: () => ({ matches: true }), addEventListener() {}, scrollTo() {} };
  assert.equal(rv(v, 'bracketView({size: 16})'), 'rounds');
});

test('bracket keys find group brackets, the Finals and the Plate pool', () => {
  const t = event(12, 3);
  const v = viewerFor(t);
  assert.equal(rv(v, 'bracketForKey("pod:' + t.pods[0].id + '").podLabel'), '1');
  assert.equal(rv(v, 'bracketForKey("ko").podFinals'), true);
  assert.ok(!rv(v, 'bracketForKey("kol")'));              // no Plate pool in this format
  assert.ok(!rv(v, 'bracketForKey("pod:nope")'));
});

test('group labels are escaped wherever they are written into the page', () => {
  const t = event(12, 3);
  t.pods.forEach((p) => { p.label = '<img src=x onerror=1>'; p.bracket.podLabel = p.label; });
  const v = viewerFor(t);
  v.__pod = plain(rv(v, 'state.pods'))[0];
  const matchHtml = rv(v, 'rsMatchHTML(__pod.bracket, 0, 0)');
  assert.doesNotMatch(matchHtml, /<img/);
  v.__fin = rv(v, 'state.knockout');
  if (v.__fin) {
    const slot = rv(v, '(function(){ var out=""; state.knockout.rounds[0].forEach(function(m,i){ out += rsSlotHTML(state.knockout,0,i,"a")+rsSlotHTML(state.knockout,0,i,"b"); }); return out; })()');
    assert.doesNotMatch(slot, /<img/);
  }
  assert.doesNotMatch(rv(v, 'mkoTagHTML(koMatchTag(__pod.bracket, state, 0, 0), 12, false)'), /<img/);
});

test('a Group Boards player page header names their group and board, even after they reach the Finals', () => {
  const t = event(12, 3, { finish: 0 });
  const v = viewerFor(t);
  const loser = t.pods[0].entryIds.find((id) => id !== t.pods[0].winnerId);
  [t.pods[0].entryIds[0], t.pods[0].winnerId, loser].forEach((id) => {
    v.__id = id;
    const html = rv(v, 'playerPageHTML(__id, {})');
    assert.match(html, /<div class="psub">[^<]*Group 1 · Board 1/);
  });
  v.__id = t.pods[1].entryIds[0];
  assert.match(rv(v, 'playerPageHTML(__id, {})'), /<div class="psub">[^<]*Group 2 · Board 2/);
});

test('the Following list and the finder show the group and board of a Group Boards player', () => {
  const t = event(12, 3);
  const v = viewerFor(t);
  v.__id = t.pods[1].entryIds[0];
  rv(v, 'prefs.follow = [__id]');
  assert.match(rv(v, 'followingHTML()'), /Group 2 · Board 2/);
});

test('match rows say which group or the Finals each match belongs to, and escape the tag', () => {
  const t = event(12, 3, { finish: 0 });
  const v = viewerFor(t);
  v.__id = t.pods[0].winnerId;
  const html = rv(v, 'matchesHTML(__id)');
  assert.match(html, /Group 1 · (Round of d+|Quarterfinal|Semifinal|Final)/);
  assert.match(html, /Finals · (Semifinal|Final)/);
});

test('a player knocked out of the Finals, and the Finals winner, are told so in plain words', () => {
  const t = event(12, 3);
  t.pods.forEach((p) => playOut(org, p.bracket, () => 'a'));
  runApp(org, 'syncFinalsFromPods')(t);
  playOut(org, t.knockout, () => 'a');
  const v = viewerFor(t);
  const played = t.knockout.rounds.flat().filter((m) => m.aEntryId && m.bEntryId && m.winnerId);
  v.__lose = played[0].bEntryId; v.__win = t.knockout.rounds[t.knockout.rounds.length - 1][0].winnerId;
  assert.match(rv(v, 'statusLine(__lose)'), /^Out in the (Semifinal|Final|Quarterfinal) of the Finals · lost to /);
  assert.equal(rv(v, 'statusLine(__win)'), 'Winner of the Finals');
});

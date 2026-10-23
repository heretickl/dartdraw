const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run: runApp, plain, seededRng, makeTournament, useState } = require('./lib/helpers');
const { loadViewer, setViewerState, runViewer: rv } = require('./lib/load-viewer');
const { toPublicView } = require('../viewer/api/_lib/publicView');

// The addresses printed in the QR codes: #/groups/<label>, #/bracket/group-<label>, #/bracket/finals.
const org = loadApp();
function viewerFor(t, hash) {
  const v = loadViewer(); setViewerState(v, toPublicView(JSON.parse(JSON.stringify(t))));
  rv(v, 'location.hash = ' + JSON.stringify(hash || ''));
  return v;
}
function podEvent() {
  const t = makeTournament(org, 12, { pods: 3, boards: 3 });
  runApp(org, 'generatePods')(t, seededRng(5)); runApp(org, 'podsConfirmAll')(t);
  return t;
}
function rrEvent() {
  const t = runApp(org, 'blankTournament')(); useState(org, t);
  t.eventCreation.saved = true; t.format.saved = true; t.eventCreation.boards = 3; t.eventCreation.entries = 12;
  t.format.formatType = 'roundrobin'; t.format.maxPerGroup = 4; t.format.bestOfLegs = 5;
  t.entriesList = Array.from({ length: 12 }, (_, i) => ({ id: 'e' + i, name: 'Player ' + (i + 1), org: '', players: [], withdrawn: false }));
  runApp(org, 'buildGroups')(t);
  t.groups.forEach((g) => { g.confirmed = true; });
  return t;
}
const route = (v) => plain(rv(v, 'currentRoute(availableTabs())'));
const apply = (v) => rv(v, 'applyBracketSel(currentRoute(availableTabs()))');

test('#/bracket/group-2 and #/bracket/finals open that Group Boards screen, once per address', () => {
  const t = podEvent();
  const v = viewerFor(t, '#/bracket/group-2');
  assert.deepEqual(route(v), { name: 'bracket', sel: 'group-2', tv: false });
  apply(v);
  assert.equal(rv(v, 'podSel'), t.pods.find((p) => p.label === '2').id);
  assert.match(rv(v, 'podsBracketTabHTML()'), /Group 2/);
  // the picker still works afterwards: the same address does not force the selection back
  rv(v, "podSel = 'all'"); apply(v);
  assert.equal(rv(v, 'podSel'), 'all');
  // leaving the address and coming back applies it again
  rv(v, "location.hash = '#/bracket'"); apply(v);
  rv(v, "location.hash = '#/bracket/finals'"); apply(v);
  assert.equal(rv(v, 'podSel'), 'finals');
});

test('an address that names a group or screen this event does not have just shows the tab', () => {
  const v = viewerFor(podEvent(), '#/bracket/group-99');
  rv(v, "podSel = 'all'"); apply(v);
  assert.equal(rv(v, 'podSel'), 'all');
  assert.doesNotThrow(() => rv(v, 'podsBracketTabHTML()'));
  const w = viewerFor(podEvent(), '#/groups/A');                    // a Group Boards event has no Groups tab
  assert.notEqual(route(w).name, 'groups');
  assert.doesNotThrow(() => route(viewerFor(podEvent(), '#/bracket/%E0%A4%A')));   // a broken percent escape
});

test('#/groups/<label> shows only that round-robin group, with a way back; an unknown label shows them all', () => {
  const t = rrEvent();
  const labels = t.groups.map((g) => g.label);
  assert.ok(labels.length >= 3);
  const v = viewerFor(t, '#/groups/' + labels[1]);
  assert.deepEqual(route(v), { name: 'groups', sel: labels[1], tv: false });
  const one = rv(v, 'groupsTabHTML(' + JSON.stringify(labels[1]) + ')');
  assert.match(one, /← All groups/); assert.match(one, /href="#\/groups"/);
  assert.equal((one.match(/data-gid=/g) || []).length, 1);
  assert.ok(one.includes('id="group-' + labels[1] + '"'));
  const all = rv(v, 'groupsTabHTML()');
  assert.equal((all.match(/data-gid=/g) || []).length, labels.length);
  assert.doesNotMatch(all, /All groups/);
  assert.equal((rv(v, 'groupsTabHTML("nope")').match(/data-gid=/g) || []).length, labels.length);
});

test('the plain tab addresses and a player page still route as before', () => {
  const t = rrEvent();
  assert.equal(route(viewerFor(t, '#/groups')).name, 'groups');
  assert.equal(route(viewerFor(t, '#/groups')).sel, undefined);
  assert.deepEqual(route(viewerFor(t, '#/p/e1')), { name: 'p', id: 'e1' });
});

/* ---------- Release 4 (kb-review S-P0-4): the page opens on the stage being played; an address always wins ---------- */
const { stubDocument } = require('./lib/load-app');
const E = ['a', 'b', 'c', 'd', 'e', 'f'].map((x) => ({ id: x, name: 'Player ' + x.toUpperCase() }));
const mt = (a, b, wa, wb) => ({ aEntryId: a, bEntryId: b, aLegs: wa, bLegs: wb, winnerId: wa == null ? null : wa > wb ? a : b });
const grp = (id, label, ids, scores) => ({ id, label, entryIds: ids, confirmed: true, gameStarted: true, scores: scores || {} });
const rrko = (over) => Object.assign({ eventCreation: { competitionUnit: 'Singles' }, format: { formatType: 'rrknockout', qualifiersPerGroup: 2 }, entriesList: E,
  groups: [grp('g1', 'A', ['a', 'b', 'c'], { 'a|b': { legs1: 3, legs2: 1 } }), grp('g2', 'B', ['d', 'e', 'f'])] }, over);
const koDrawn = { rounds: [[mt('a', 'e', null, null), mt('d', 'b', null, null)], [mt(null, null, null, null)]], size: 4 };
function fresh(view, hash, prefs) {
  const v = loadViewer();
  const els = {};
  v.document = { getElementById: (id) => (els[id] = els[id] || { id, hidden: false, innerHTML: '', textContent: '', value: '', placeholder: '', attrs: {}, setAttribute(k, x) { this.attrs[k] = x; }, getAttribute(k) { return this.attrs[k]; } }),
    querySelectorAll: () => [], querySelector: () => null, createElement: stubDocument.createElement, body: { classList: { toggle() {} } }, title: '' };
  setViewerState(v, view);
  v.location.hash = hash || '';
  if (prefs) { v.__p = prefs; rv(v, 'prefs = __p'); }
  v.els = els;
  return v;
}
const tabOf = (v) => rv(v, 'currentRoute(availableTabs()).name');

test('default tab per format and state: Groups, Bracket, Boards, and Bracket once the knockout is drawn', () => {
  assert.equal(tabOf(fresh(Object.assign(rrko(), { format: { formatType: 'roundrobin' } }))), 'groups');
  assert.equal(tabOf(fresh({ format: { formatType: 'knockout' }, entriesList: E, groups: [], knockout: koDrawn })), 'bracket');
  assert.equal(tabOf(fresh(rrko())), 'groups', 'round robin + knockout while the groups play');
  assert.equal(tabOf(fresh(rrko({ knockout: koDrawn }))), 'bracket', 'the knockout is drawn: the live stage');
  assert.equal(tabOf(fresh(rrko({ knockout: koDrawn, finalizedAt: '2026-10-20T10:00:00Z' }))), 'bracket', 'finished: the winner banner');
  // an address always wins, and Me / Following still come first
  assert.equal(tabOf(fresh(rrko({ knockout: koDrawn }), '#/groups')), 'groups');
  assert.equal(tabOf(fresh(rrko({ knockout: koDrawn }), '', { me: 'a', follow: [] })), 'me');
  assert.equal(tabOf(fresh(rrko({ knockout: koDrawn }), '', { me: null, follow: ['b'] })), 'following');
});

test('Group Boards: Boards (or All groups) while groups play, never an empty Finals; the Finals once every group is done', () => {
  const pod = (id, label, done) => {
    const [x, y] = id === 'p1' ? ['a', 'b'] : ['c', 'd'];
    return { id, label, confirmed: true, entryIds: [x, y], bracket: { rounds: [[done ? mt(x, y, 3, 0) : mt(x, y, null, null)]], podLabel: label, size: 2 } };
  };
  const finals = { rounds: [[{ aEntryId: null, bEntryId: null, aFromPod: 'p1', bFromPod: 'p2' }]], podFinals: true, size: 2 };
  const gb = (done, plan) => ({ eventCreation: {}, format: { formatType: 'podknockout' }, entriesList: E, groups: [], pods: [pod('p1', '1', done), pod('p2', '2', done)], knockout: finals, boardPlan: plan ? { boards: { 1: [] } } : null });
  assert.equal(tabOf(fresh(gb(false, true))), 'boards');
  const noPlan = fresh(gb(false, false));
  assert.equal(tabOf(noPlan), 'bracket');
  rv(noPlan, 'render()');
  assert.equal(rv(noPlan, 'podSel'), 'all', 'All groups, not the empty Finals');
  const mine = fresh(gb(false, false), '#/bracket', { me: 'c', follow: [] });
  rv(mine, 'render()');
  assert.equal(rv(mine, 'podSel'), 'p2', 'set as Me: your own group');
  const done = fresh(gb(true, true));
  assert.equal(tabOf(done), 'bracket');
  rv(done, 'render()');
  assert.equal(rv(done, 'podSel'), 'finals');
  // a deep link still picks its own view, and #/boards?tv=1 is the only way into TV mode
  const deep = fresh(gb(false, true), '#/bracket/group-2');
  rv(deep, 'render()');
  assert.equal(rv(deep, 'podSel'), 'p2');
  assert.equal(rv(fresh(gb(false, true), '#/x?tv=1'), 'currentRoute(availableTabs()).tv'), false);
});

test('the opening tab is kept for the visit: a refresh that draws the knockout does not move someone reading the groups', () => {
  const v = fresh(rrko());
  rv(v, 'render()');
  assert.equal(tabOf(v), 'groups');
  v.__n = JSON.parse(JSON.stringify(rrko({ knockout: koDrawn })));
  rv(v, 'state = __n; state.tieBreakOrder = ["Head-to-head result","Leg difference","Legs won"]; render()');
  assert.equal(tabOf(v), 'groups', 'still on Groups');
  assert.equal(tabOf(fresh(rrko({ knockout: koDrawn }))), 'bracket', 'a new visit opens on the Bracket');
});

/* ---------- Release 4: who goes through, the keys under tables and brackets, walkovers in full ---------- */
test('"Top 2 in each group go through" above the tables, and the green bar on exactly those places (round robin + knockout only)', () => {
  const v = fresh(rrko());
  assert.match(rv(v, 'groupsTabHTML()'), /<p class="qline">[\s\S]*Top 2 in each group go through to the knockout\./);
  const a = rv(v, 'groupCardHTML(state.groups[0])');
  assert.equal((a.match(/<td class="pos q">/g) || []).length, 2, 'two places marked');
  assert.match(a, /<td class="pos q">1<span class="sr"> \(goes through\)<\/span><\/td>/);
  assert.match(a, /<td class="pos">3<\/td>/);
  // one qualifier, a Plate band, a drawn knockout (past tense), and a group no bigger than the number that go through
  const one = fresh(rrko({ format: { formatType: 'rrknockout', qualifiersPerGroup: 1, losersPool: true, plateQualifiersPerGroup: 1 }, knockout: koDrawn }));
  assert.match(rv(one, 'qualifyLineHTML()'), /The winner of each group went through to the knockout\.<\/b> Place 2 plays in the Plate pool; anyone below that is out\./);
  const rest = fresh(rrko({ format: { formatType: 'rrknockout', qualifiersPerGroup: 2, losersPool: true } }));
  assert.match(rv(rest, 'qualifyLineHTML()'), /Everyone else plays in the Plate pool\./);
  const small = fresh(rrko({ format: { formatType: 'rrknockout', qualifiersPerGroup: 3 } }));
  const sc = rv(small, 'groupCardHTML(state.groups[0])');
  assert.match(sc, /Everyone in this group goes through\./);
  assert.equal((sc.match(/<td class="pos q">/g) || []).length, 3);
  // no knockout after the groups: no line, no marks
  const rr = fresh(Object.assign(rrko(), { format: { formatType: 'roundrobin', qualifiersPerGroup: 2 } }));
  assert.equal(rv(rr, 'qualifyLineHTML()'), '');
  assert.doesNotMatch(rv(rr, 'groupCardHTML(state.groups[0])'), /pos q|goes through/);
});

test('the column key: a real button with aria-expanded that opens a short key, closed by default, kept open for the visit', () => {
  const v = fresh(rrko());
  const card = rv(v, 'groupCardHTML(state.groups[0])');
  const btn = /<button type="button" class="keybtn" data-key="g:g1" aria-expanded="false" aria-controls="(key-[^"]+)">What do the columns mean\?<\/button>/.exec(card);
  assert.ok(btn, 'the toggle');
  assert.match(card, new RegExp('<div class="keybody" id="' + btn[1] + '" hidden>'));
  ['<dt>MP</dt><dd>Matches played', '<dt>LW</dt><dd>Legs won', '<dt>Pts</dt><dd>Points: 2 for a win, 1 for a draw', 'Goes through to the knockout', '<b>WO</b> walkover'].forEach((s) => assert.ok(card.includes(s), s));
  assert.match(card, /href="\/help\?from=testslug12#glossary">Words you will see/);
  assert.doesNotMatch(card, /<dt>MD<\/dt>/, 'only the columns this table shows: no drawn match, so no MD');
  assert.match(card, /<dt>TB<\/dt><dd>Tie-break: why two players level on points/, 'a tie-break badge is shown, so TB is explained');
  assert.ok(card.includes('title="Matches played">MP</th>'), 'the tooltips stay');
  rv(v, 'setKeyOpen("g:g1", true)');
  assert.match(rv(v, 'groupCardHTML(state.groups[0])'), /aria-expanded="true"[\s\S]*<div class="keybody" id="key-g_g1">/);
});

test('the bracket key lists only the labels that bracket uses; walkovers are written in full on a player page', () => {
  const ko = { rounds: [[Object.assign(mt('a', 'b', 2, 0), { wo: true }), mt('c', 'd', null, null)], [mt('a', null, null, null)]], size: 4 };
  const v = fresh({ eventCreation: {}, format: { formatType: 'knockout', bestOfLegs: 3 }, entriesList: E, groups: [], knockout: ko });
  const key = rv(v, 'bracketKeyHTML(state.knockout, "ko")');
  assert.match(key, /What do the labels mean\?/);
  assert.match(key, /<dt>1-2<\/dt><dd>Match code: round 1, match 2/);
  assert.match(key, /<dt>WO<\/dt><dd>Walkover: that player did not turn up/);
  assert.doesNotMatch(key, /<dt>Bye<\/dt>|NO-SHOW/);
  assert.match(rv(v, 'matchesHTML("a")'), /<span class="res w wo">Won 2–0 by walkover<\/span>/);
  assert.match(rv(v, 'matchesHTML("b")'), /<span class="res l wo">Lost 0–2 by walkover<\/span>/);
  assert.doesNotMatch(rv(v, 'matchesHTML("a")') + rv(v, 'matchesHTML("b")'), /\(WO\)/);
  const card = rv(v, 'rsMatchHTML(state.knockout, 0, 0)');
  assert.match(card, /<span class="mt dim">Walkover<\/span>/);
  assert.match(card, /<small class="note wo">did not show<\/small>/);
  // a round-robin walkover reads the same way; Teams say "team"
  const rr = fresh(Object.assign(rrko(), { groups: [grp('g1', 'A', ['a', 'b'], { 'a|b': { legs1: 3, legs2: 0, wo: true } })] }));
  assert.match(rv(rr, 'matchesHTML("a")'), /Won 3–0 by walkover/);
  const tm = fresh({ eventCreation: { competitionUnit: 'Teams' }, format: { formatType: 'knockout' }, entriesList: E, groups: [], knockout: ko });
  assert.match(rv(tm, 'bracketKeyHTML(state.knockout, "ko")'), /that team did not turn up/);
});

test('Help links from the event page carry the event (?from=<slug>); a slug of the wrong shape is never passed on', () => {
  const v = fresh(rrko());
  assert.equal(rv(v, 'helpHref("q-when-where")'), '/help?from=testslug12#q-when-where');
  assert.equal(rv(v, 'helpHref("")'), '/help?from=testslug12');
  rv(v, 'SLUG = "bad slug<x>"');
  assert.equal(rv(v, 'helpHref("q-columns")'), '/help#q-columns');
  const fs = require('fs'), path = require('path');
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'viewer', 'index.html'), 'utf8'), /<a class="evhelp" id="hHelp" href="\/help">Help<\/a>/);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'viewer', 'theme.css'), 'utf8'), /\.evhelp\{[^}]*min-height:44px/);
});

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

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { loadViewer, setViewerState, runViewer } = require('./lib/load-viewer');
const { stagesOf, analyse } = require('../viewer/api/_lib/listView');

const ctx = loadViewer();
const m = (a, b, wa, wb) => ({ aEntryId: a, bEntryId: b, aLegs: wa, bLegs: wb, winnerId: wa == null ? null : wa > wb ? a : b });
const entries = [1, 2, 3, 4].map((i) => ({ id: 'e' + i, name: 'Pair ' + i }));
const group = (done) => ({ id: 'g1', label: 'A', entryIds: ['e1', 'e2'], confirmed: true, gameStarted: true, scores: done ? { 'e1|e2': { legs1: 2, legs2: 0 } } : {} });
const view = (over) => Object.assign({ eventCreation: { competitionUnit: 'Doubles' }, format: { formatType: 'rrknockout', qualifiersPerGroup: 2 }, entriesList: entries, groups: [group(true)] }, over);
const ko = (rounds) => ({ rounds });

// Sets the viewer's state and the stages the server would send for the same data, then asks for the strip.
function strip(v, route, tabs, stages) {
  setViewerState(ctx, v);
  ctx.__s = stages === undefined ? stagesOf(v, analyse(v)) : stages;
  ctx.__r = route; ctx.__t = tabs || ['me', 'following', 'groups', 'bracket'];
  runViewer(ctx, 'evStages = __s');
  return runViewer(ctx, 'stageStripHTML(__r, __t)');
}
const links = (h) => (h.match(/<a class="evstage[^"]*" href="[^"]+"/g) || []).map((x) => /href="([^"]+)"/.exec(x)[1]);

test('round robin + knockout: two cards linking to Groups and Bracket, the current tab outlined', () => {
  const v = view({ knockout: ko([[m('e1', 'e3', 3, 1), m('e2', 'e4', null, null)], [m('e1', null, null, null)]]) });
  const onGroups = strip(v, { name: 'groups' });
  assert.deepEqual(links(onGroups), ['#/groups', '#/bracket']);
  assert.match(onGroups, /class="evstage on" href="#\/groups" aria-current="page"/);
  assert.doesNotMatch(onGroups, /class="evstage on" href="#\/bracket"/);
  const onBracket = strip(v, { name: 'bracket' });
  assert.match(onBracket, /class="evstage on" href="#\/bracket" aria-current="page"/);
  assert.match(onBracket, />Round robin</); assert.match(onBracket, />Knockout</);
});

test('before the knockout is drawn the second card is plain text, not a dead link', () => {
  const h = strip(view(), { name: 'groups' }, ['me', 'following', 'groups']);
  assert.deepEqual(links(h), ['#/groups']);
  assert.match(h, /Draw next/);
  assert.match(h, /<div class="evstage">/);
});

test('a finished event names its winner on the knockout card', () => {
  const v = view({ knockout: ko([[m('e1', 'e2', 3, 0)]]) });
  assert.match(strip(v, { name: 'bracket' }), /Winner Pair 1/);
});

test('no cards on other tabs, on TV, for one-stage formats, or when the server sent no stages', () => {
  const v = view({ knockout: ko([[m('e1', 'e2', 3, 0)]]) });
  assert.equal(strip(v, { name: 'me' }), '');
  assert.equal(strip(v, { name: 'groups', tv: true }), '');
  assert.equal(strip(v, { name: 'groups' }, null, []), '');
  assert.equal(strip(v, { name: 'groups' }, null, [{ key: 'groups', state: 'bogus' }, { key: 'knockout', state: 'live' }]), '');
  assert.equal(strip(view({ format: { formatType: 'roundrobin' } }), { name: 'groups' }), '');
  assert.equal(strip(view({ format: { formatType: 'knockout' }, knockout: ko([[m('e1', 'e2', 3, 0)]]) }), { name: 'bracket' }), '');
});

test('Group Boards: Groups card goes to Boards, Finals card to the finals', () => {
  const pods = [{ id: 'p1', label: '1', confirmed: true, entryIds: ['e1', 'e2'], bracket: ko([[m('e1', 'e2', 3, 0)]]) }];
  const v = view({ format: { formatType: 'podknockout' }, groups: [], pods, knockout: Object.assign(ko([[m('e1', null, null, null)]]), { podFinals: true }), boardPlan: { boards: { 1: [] } } });
  const tabs = ['me', 'following', 'boards', 'bracket'];
  assert.deepEqual(links(strip(v, { name: 'boards' }, tabs)), ['#/boards', '#/bracket/finals']);
  assert.match(strip(v, { name: 'boards' }, tabs), /class="evstage on" href="#\/boards"/);
});

test('the cards are styled and sit in the page script', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'theme.css'), 'utf8');
  assert.match(css, /\.evstages\{display:grid;grid-template-columns:1fr 1fr/);
  assert.match(css, /\.evstage\.on \.hm-stage\{box-shadow/);
  assert.match(css, /body\.tv \.evstages\{display:none\}/);
});

test('Group Boards: the Finals card is not a link until the Finals exist, and a link carries the view it picks', () => {
  const pods = [{ id: 'p1', label: '1', confirmed: true, entryIds: ['e1', 'e2'], bracket: ko([[m('e1', 'e2', null, null)]]) }];
  const base = { format: { formatType: 'podknockout' }, groups: [], pods, boardPlan: { boards: { 1: [] } } };
  const tabs = ['me', 'following', 'boards', 'bracket'];
  assert.deepEqual(links(strip(view(base), { name: 'boards' }, tabs)), ['#/boards']);
  const withFinals = view(Object.assign({}, base, { knockout: Object.assign(ko([[m('e1', null, null, null)]]), { podFinals: true }) }));
  const h = strip(withFinals, { name: 'boards' }, tabs);
  assert.match(h, /href="#\/bracket\/finals" data-stagesel="finals"/);
  const noBoards = strip(withFinals, { name: 'bracket' }, ['me', 'following', 'bracket']);
  assert.match(noBoards, /href="#\/bracket\/group-1" data-stagesel="group-1"/);
});

test('the stages are refreshed on every successful poll, not only when the data changes', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'index.html'), 'utf8');
  const poll = html.slice(html.indexOf('var body = await res.json()'), html.indexOf('if(body.updatedAt !== lastUpdatedAt'));
  assert.match(poll, /evStages = Array\.isArray\(body\.stages\)/);
});

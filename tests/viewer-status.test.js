const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { loadApp, run: runApp, seededRng, makeTournament, play } = require('./lib/helpers');
const { loadViewer, runViewer: rv } = require('./lib/load-viewer');
const { toPublicView } = require('../viewer/api/_lib/publicView');

const THEME = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'theme.css'), 'utf8');
const org = loadApp();
const viewer = loadViewer();
const started = (s) => { viewer.__s = s; return rv(viewer, 'eventStarted(__s)'); };
const pill = (...args) => { viewer.__a = args; return rv(viewer, 'statusPillHTML(...__a)'); };

const match = (o) => Object.assign({ aEntryId: 'e0', bEntryId: 'e1', winnerId: null }, o);
const bracket = (...rounds) => ({ rounds });

test('eventStarted: a round robin is started once any group has a score', () => {
  assert.equal(started({ groups: [{ entryIds: ['a', 'b'], scores: {} }, { entryIds: ['c', 'd'], scores: {} }] }), false);
  assert.equal(started({ groups: [{ entryIds: ['a', 'b'], scores: {} }, { entryIds: ['c', 'd'], scores: { 'c|d': { legs1: 3, legs2: 1 } } }] }), true);
});

test('eventStarted: a knockout is started once a real match has a winner; a bye winner alone is not play', () => {
  assert.equal(started({ groups: [], knockout: bracket([match(), match()], [match({ aEntryId: null, bEntryId: null })]) }), false);
  assert.equal(started({ groups: [], knockout: bracket([match({ winnerId: 'e0' }), match()]) }), true);
  assert.equal(started({ groups: [], knockout: bracket([match({ bye: true, winnerId: 'e0' }), match()]) }), false);
  assert.equal(started({ groups: [], knockout: bracket([match({ bye: true, winnerId: 'e0' }), match({ winnerId: 'e2' })]) }), true);
  assert.equal(started({ groups: [], knockoutLosers: bracket([match({ winnerId: 'e3' })]) }), true);
});

test('eventStarted: a void match counts as started', () => {
  assert.equal(started({ groups: [], knockout: bracket([match({ void: true })]) }), true);
  assert.equal(started({ groups: [], pods: [{ bracket: bracket([match({ void: true })]) }] }), true);
});

test('eventStarted: a Group Boards event is started once a group match has a result', () => {
  const t = makeTournament(org, 12, { pods: 3, boards: 3 });
  runApp(org, 'generatePods')(t, seededRng(5)); runApp(org, 'podsConfirmAll')(t);
  const view = () => toPublicView(JSON.parse(JSON.stringify(t)));
  assert.equal(started(view()), false);
  play(t.pods[0].bracket.rounds[0][0], 'a');
  assert.equal(started(view()), true);
});

test('eventStarted: null, empty and partial states are not started and never throw', () => {
  assert.equal(started(null), false);
  assert.equal(started({}), false);
  assert.equal(started({ groups: [], pods: [], knockout: null }), false);
  assert.equal(started({ groups: [null, {}], pods: [{}, null], knockout: bracket([null, match()]) }), false);
});

test('statusPillHTML: not started says Starting soon, started keeps the red Live pill, stale wins over both', () => {
  const at = Date.UTC(2026, 9, 13, 12, 0, 0);
  const soon = pill(false, false, at), live = pill(true, false, at);
  assert.match(soon, /^<span class="live-pill soon">Starting soon<\/span> Updated \S/);
  assert.ok(!soon.includes('<i>')); assert.ok(!soon.includes('Live'));
  assert.match(live, /^<span class="live-pill"><i><\/i>Live<\/span> Updated \S/);
  const off = '<span class="live-pill off">Offline</span> Reconnecting…';
  assert.equal(pill(true, true, at), off); assert.equal(pill(false, true, at), off);
  assert.match(pill(false, false, 0), /Starting soon<\/span> Updated $/);
});

test('phone-width standings: long names may break, and a narrow-screen block tightens the table', () => {
  assert.match(THEME, /\.std-table td\.l\s*\{[^}]*overflow-wrap:\s*anywhere/);
  const m = /@media \(max-width:\s*420px\)\s*\{([\s\S]*?)\n\}/.exec(THEME);
  assert.ok(m, 'a max-width: 420px block exists');
  assert.match(m[1], /\.std-table/);
});

test('the Starting soon pill has a blue style', () => {
  assert.match(THEME, /\.live-pill\.soon\s*\{[^}]*background:\s*var\(--blue-tint\)[^}]*color:\s*var\(--on-blue\)/);
});

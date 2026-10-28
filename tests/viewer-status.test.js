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

// statusPillHTML(started, stale, updatedAt, finished, lastOkAt, now): updatedAt is the server's last save, lastOkAt is the phone's last fetch
const AT = Date.UTC(2026, 9, 13, 12, 0, 0), IN3 = AT + 3 * 60000;
const iso = (ms) => new Date(ms).toISOString();

test('statusPillHTML: not started says Starting soon, started keeps the red Live pill, stale wins over both', () => {
  const soon = pill(false, false, iso(AT), false, 0, IN3), live = pill(true, false, iso(AT), false, 0, IN3);
  assert.match(soon, /^<span class="live-pill soon">Starting soon<\/span> Scores last changed \S+.*\(3 min ago\)$/);
  assert.ok(!soon.includes('<i>')); assert.ok(!soon.includes('>Live<'));
  assert.match(live, /^<span class="live-pill"><i><\/i>Live<\/span> Scores last changed \S/);
  assert.ok(!soon.includes('Updated') && !live.includes('Updated'));
  assert.match(pill(true, true, iso(AT), false, IN3, IN3), /^<span class="live-pill off">Offline<\/span>/);
  assert.match(pill(false, true, iso(AT), false, IN3, IN3), /^<span class="live-pill off">Offline<\/span>/);
});

test('statusPillHTML: the time shown is the last save on the server, not the last fetch by the phone', () => {
  const a = pill(true, false, iso(AT), false, IN3, IN3), b = pill(true, false, iso(AT), false, IN3 + 600000, IN3 + 600000);
  assert.match(a, /\(3 min ago\)/); assert.match(b, /\(13 min ago\)/);   // the phone fetched again: the changed time did not move
  assert.equal(a.replace(/\(.*\)/, ''), b.replace(/\(.*\)/, ''));
  assert.match(pill(true, false, iso(AT), false, 0, AT + 5 * 3600000), /Scores last changed [^(]*$/);   // an hour or more ago: just the time
  assert.match(pill(true, false, iso(AT), false, 0, AT + 2 * 86400000), /Scores last changed \d{1,2} Oct, /);   // not today: the date too
});

test('statusPillHTML: offline keeps the changed time and adds when the phone last got through; a bad or missing time never prints NaN', () => {
  const off = pill(true, true, iso(AT), false, IN3, IN3 + 90000);
  assert.match(off, /Can.t refresh right now/); assert.match(off, /Scores last changed/); assert.match(off, /<span class="chk">Last checked \S+/);
  assert.ok(!off.includes('Reconnecting'));
  [null, undefined, '', 'garbage', NaN, {}].forEach((bad) => {
    for (const out of [pill(true, false, bad, false, 0, IN3), pill(false, true, bad, false, 0, IN3), pill(true, false, bad, true, 0, IN3)]) {
      assert.ok(!/NaN|Invalid|undefined|null/.test(out), String(bad) + ' -> ' + out);
      assert.ok(!out.includes('Scores last changed'));
    }
  });
  assert.ok(!/Last checked/.test(pill(true, true, iso(AT), false, 0, IN3)));
});

const venue = (s) => { viewer.__s = s; return rv(viewer, 'venueNoteNeeded(__s)'); };
test('the venue line: only for an event with a draw that is not Group Boards and not over', () => {
  const ko = (winner) => ({ format: { formatType: 'knockout' }, groups: [], knockout: bracket([match()], [match({ winnerId: winner })]) });
  assert.equal(venue(ko(null)), true);
  assert.equal(venue(ko('e0')), false, 'knockout complete');
  assert.equal(venue(Object.assign(ko(null), { finalizedAt: '2026-10-13' })), false, 'finalized');
  assert.equal(venue({ format: { formatType: 'knockout' }, groups: [], knockout: null }), false, 'before the draw');
  assert.equal(venue({ format: { formatType: 'rrknockout' }, groups: [], knockout: null }), false, 'before the draw');
  assert.equal(venue({ format: { formatType: 'roundrobin' }, groups: [{ entryIds: ['a', 'b'], scores: {}, gameStarted: true }] }), true, 'groups in play');
  assert.equal(venue({ format: { formatType: 'podknockout' }, groups: [], pods: [{ bracket: bracket([match()]) }], knockout: bracket([match()]) }), false, 'Group Boards shows its boards itself');
  assert.equal(venue(null), false); assert.equal(venue({}), false);
  assert.equal(venue({ format: { formatType: 'knockout' }, knockout: { rounds: [] } }), false, 'odd data: no guess');
});

test('phone-width standings: names stay on one line, columns are ruled, MW and ML hide on an upright phone, and a narrow-screen block tightens the table', () => {
  assert.match(THEME, /\.std-table td\.l\s*\{[^}]*white-space:\s*nowrap/);
  assert.match(THEME, /\.std-table th\+th,\.std-table td\+td\{border-left:1px solid var\(--line\)\}/);
  assert.match(THEME, /@media \(max-width: 600px\) and \(orientation: portrait\)\{[\s\S]*?td:nth-child\(4\),#app \.scroll > \.std-table td:nth-child\(5\)\{display:none\}/);
  const m = /@media \(max-width:\s*420px\)\s*\{([\s\S]*?)\n\}/.exec(THEME);
  assert.ok(m, 'a max-width: 420px block exists');
  assert.match(m[1], /\.std-table/);
});

test('the Starting soon pill has a blue style', () => {
  assert.match(THEME, /\.live-pill\.soon\s*\{[^}]*background:\s*var\(--blue-tint\)[^}]*color:\s*var\(--on-blue\)/);
});

test('statusPillHTML: a finalized event says Final results, in green, instead of the red Live pill', () => {
  const at = Date.UTC(2026, 9, 13, 12, 0, 0);
  const done = pill(true, false, new Date(at).toISOString(), true, 0, at + 60000);
  assert.match(done, /^<span class="live-pill done">Final results<\/span> Scores last changed \S/);
  assert.ok(!done.includes('<i>')); assert.ok(!done.includes('>Live<'));
  assert.match(pill(true, true, at, true), /^<span class="live-pill off">Offline<\/span>/);   // stale still wins
  assert.match(pill(true, false, at, false), /<i><\/i>Live</);
  assert.match(THEME, /\.live-pill\.done\{background:var\(--green-tint\);color:var\(--green\)\}/);
});

test('eventFinished is gone: Final results is driven by state.finalizedAt (see finalized-public.test.js), not by stage cards', () => {
  assert.equal(rv(viewer, 'typeof eventFinished'), 'undefined');
  assert.ok(fs.readFileSync(path.join(__dirname, '..', 'viewer', 'index.html'), 'utf8').includes('statusPillHTML(started, stale, lastUpdatedAt, !!(state && state.finalizedAt), lastOkAt)'));
});

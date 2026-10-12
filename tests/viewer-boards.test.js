const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run: runApp, plain, seededRng, makeTournament, playOut } = require('./lib/helpers');
const { loadViewer, setViewerState, runViewer: rv } = require('./lib/load-viewer');
const { toPublicView } = require('../viewer/api/_lib/publicView');

const org = loadApp();
function event(n, pods, opts) {
  opts = opts || {};
  const t = makeTournament(org, n, { pods, boards: opts.boards || pods });
  t.format.anticipatedStartTime = opts.start === undefined ? '10:00' : opts.start;
  runApp(org, 'generatePods')(t, seededRng(5)); runApp(org, 'podsConfirmAll')(t);
  if (opts.after) opts.after(t);
  if (opts.plan !== false) t.boardPlan = JSON.parse(JSON.stringify(runApp(org, 'buildBoardPlan')(t)));
  return t;
}
function viewerFor(t) { const v = loadViewer(); setViewerState(v, toPublicView(JSON.parse(JSON.stringify(t)))); return v; }

test('the Boards tab exists for a Group Boards event with a plan, and not without one', () => {
  assert.ok(plain(rv(viewerFor(event(12, 3)), 'availableTabs()')).includes('boards'));
  assert.ok(!plain(rv(viewerFor(event(12, 3, { plan: false })), 'availableTabs()')).includes('boards'));
});

test('no plan, no Boards tab: the other screens still render without throwing', () => {
  const v = viewerFor(event(12, 3, { plan: false }));
  assert.doesNotThrow(() => { rv(v, 'podsBracketTabHTML()'); rv(v, 'followingHTML()'); rv(v, 'boardLineHTML(state.entriesList[0].id)'); });
  assert.equal(rv(v, 'boardLineHTML(state.entriesList[0].id)'), '');
});

test('a board card shows who is up now, the next matches with times, and how many more', () => {
  const v = viewerFor(event(12, 3, { boards: 1 }));
  const html = rv(v, 'boardsTabHTML(false)');
  assert.match(html, /Board 1/); assert.match(html, /Up now/); assert.match(html, /Next/);
  assert.match(html, /~\d/);
  assert.match(html, /more/);                       // one board runs every group, so the queue is long
});

test('a called match reads "Called — go to Board N" and a match waiting on a feeder says so', () => {
  const t = event(12, 3, { after: (x) => { x.pods[0].bracket.rounds[0][0].called = true; } });
  const v = viewerFor(t);
  const html = rv(v, 'boardsTabHTML(false)');
  assert.match(html, new RegExp('Called — go to Board ' + t.pods[0].boards[0]));
  const v2 = viewerFor(event(12, 3, { after: (x) => { x.pods.forEach((p) => playOut(org, p.bracket, () => 'a')); } }));
  assert.match(rv(v2, 'boardsTabHTML(false)'), /Waiting for/);   // the Finals depends on a Finals match that is not played yet
});

test('with no start time the cards show queue order but no times', () => {
  const html = rv(viewerFor(event(12, 3, { start: '' })), 'boardsTabHTML(false)');
  assert.match(html, /Up now/); assert.doesNotMatch(html, /~\d/);
});

test('player names and group labels in the Boards tab are escaped', () => {
  const t = event(12, 3);
  t.entriesList[0].name = '<img src=x onerror=1>';
  const v = viewerFor(t);
  assert.doesNotMatch(rv(v, 'boardsTabHTML(false)'), /<img/);
});

test('TV mode shows six boards a page and pages through them', () => {
  const v = viewerFor(event(64, 16, { boards: 16 }));
  rv(v, 'tvPage = 0');
  const p1 = rv(v, 'boardsTabHTML(true)');
  assert.equal((p1.match(/class="card bcard/g) || []).length, 6);
  assert.match(p1, /Page 1 of 3/);
  rv(v, 'tvPage = 2');
  const p3 = rv(v, 'boardsTabHTML(true)');
  assert.equal((p3.match(/class="card bcard/g) || []).length, 4);
  assert.match(p3, /Page 3 of 3/);
  rv(v, 'tvPage = 3');
  assert.match(rv(v, 'boardsTabHTML(true)'), /Page 1 of 3/);     // wraps
});

test('the address #/boards?tv=1 is TV mode; #/boards is not; unknown tabs fall back', () => {
  const v = viewerFor(event(12, 3));
  v.location.hash = '#/boards?tv=1';
  assert.deepEqual(plain(rv(v, 'currentRoute(availableTabs())')), { name: 'boards', tv: true });
  v.location.hash = '#/boards';
  assert.deepEqual(plain(rv(v, 'currentRoute(availableTabs())')), { name: 'boards', tv: false });
  v.location.hash = '#/nope?tv=1';
  assert.equal(rv(v, 'currentRoute(availableTabs()).tv'), false);
});

test('a player page shows their board, matches ahead and estimated time; a called match shows the call', () => {
  const t = event(12, 3, { boards: 1 });
  const v = viewerFor(t);
  const first = t.pods[0].entryIds.find((id) => { const m = t.pods[0].bracket.rounds[0].find((x) => x.aEntryId === id || x.bEntryId === id); return m; });
  v.__id = first;
  const line = rv(v, 'boardLineHTML(__id)');
  assert.match(line, /Board 1/);
  assert.match(rv(v, 'playerPageHTML(__id, {})'), /class="pboard/);
  // the player in the last first-round match of the third group has matches ahead and a time
  const last = t.pods[2].bracket.rounds[0].find((x) => x.aEntryId && x.bEntryId);
  v.__id = last.aEntryId;
  assert.match(rv(v, 'boardLineHTML(__id)'), /\d+ matches? ahead · ~\d/);
  const t2 = event(12, 3, { after: (x) => { x.pods[0].bracket.rounds[0][0].called = true; } });
  const v2 = viewerFor(t2); v2.__id = t2.pods[0].bracket.rounds[0][0].aEntryId;
  const called = rv(v2, 'boardLineHTML(__id)');
  assert.match(called, /Called — go to Board \d/); assert.match(called, /class="pboard called"/);
});

test('the first player up reads "Up now on Board N"; a player waiting on the other match reads so', () => {
  const t = event(12, 3);
  const v = viewerFor(t);
  v.__id = t.pods[0].bracket.rounds[0][0].aEntryId;
  assert.match(rv(v, 'boardLineHTML(__id)'), /Up now on Board \d/);
});

test('a player with no match left, or an unknown player, gets no board line', () => {
  const t = event(12, 3, { after: (x) => x.pods.forEach((p) => playOut(org, p.bracket, () => 'a')) });
  const v = viewerFor(t);
  v.__id = t.pods[0].entryIds.find((id) => id !== t.pods[0].winnerId && !t.knockout.rounds.flat().some((m) => m.aEntryId === id || m.bEntryId === id));
  assert.equal(rv(v, 'boardLineHTML(__id)'), '');
  assert.equal(rv(v, 'boardLineHTML("nobody")'), '');
});

test('a group shows when it is expected to start, until it has begun', () => {
  const t = event(12, 3, { boards: 1 });
  const v = viewerFor(t);
  v.__p = plain(rv(v, 'state.pods'))[2];
  assert.match(rv(v, 'podStartLine(__p)'), /^starts ~\d/);
  assert.equal(rv(v, 'podStartLine(state.pods[0])'), '');                     // up now: nothing to estimate
  assert.match(rv(v, 'podsAllHTML()'), /starts ~\d/);
  const none = viewerFor(event(12, 3, { start: '' }));
  assert.equal(rv(none, 'podStartLine(state.pods[2])'), '');
});

test('match rows and Rounds cards name the board, including Finals matches', () => {
  const t = event(12, 3, { after: (x) => { x.pods.forEach((p) => playOut(org, p.bracket, () => 'a')); runApp(org, 'syncFinalsFromPods')(x); } });
  const v = viewerFor(t);
  v.__id = t.knockout.rounds[0].find((m) => m.aEntryId && m.bEntryId).aEntryId;
  assert.match(rv(v, 'matchesHTML(__id)'), /Finals · [^<]*<span class="note">[^<]*<\/span> · Board \d/);
  assert.match(rv(v, 'rsMatchHTML(state.knockout, 0, state.knockout.rounds[0].findIndex(function(m){ return m.aEntryId && m.bEntryId; }))'), /class="mbd">Board \d/);
});

test('a called match that is not first on its board shows the call on its Next row', () => {
  const t = event(12, 3, { boards: 1, after: (x) => { x.pods[0].bracket.rounds[0][1].called = true; } });
  const html = rv(viewerFor(t), 'boardsTabHTML(false)');
  assert.match(html, /<div class="bnext"><span><b class="calledtag">Called — go to Board 1<\/b>/);
});

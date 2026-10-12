# Board Schedule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show Group Boards players, spectators and the front desk which board each match is on, how many matches are ahead, and an estimated time, with a one-tap Call for the organiser, Finals boards, a Boards tab and TV mode in the viewer, and two printable wall sheets.

**Architecture:** A new pure file `boardplan.js` builds each board's match queue (groups in order, then the Finals) with a status per entry and optional estimated start times. `persist()` stamps result times and stores the plan with the tournament. The public view publishes the plan through an allow-list, and the viewer only displays it. The organiser's Boards panel and the print sheets live in a second new file, `boardplan-ui.js`.

**Tech Stack:** Plain browser JavaScript in single HTML files (no build step), Node's built-in `node:test` runner (`npm test`), Vercel + Neon Postgres.

**Spec:** `docs/superpowers/specs/2026-10-07-board-schedule-design.md` (read it first; it builds on `2026-10-06-group-boards-design.md`).

## Global Constraints

- Group Boards events only (`state.format.formatType === 'podknockout'`). The other three formats must not change: `tests/golden.test.js` must keep passing, and a non-Group-Boards tournament must never get a `boardPlan` property.
- Internal name is `pods` (`state.pods`, `podsList`, `podsFinals`, `podByKey`, `bracketByKey`); the screens say "Group". Round-robin groups stay in `state.groups`.
- Plan entry keys: `'pod:<podId>'` for a group and `'ko'` for the Finals. The organiser's own bracket key for the Finals is `'knockout'` (use `bpBracket(t, key)` and `bpOrgKey(key)` to translate).
- `estMs` is `null` for `done` and `up` entries and when no anticipated start time is set. Estimates are rounded to the nearest 5 minutes and shown with a "~" in the viewer. A plan never depends on the current clock: the same state always gives the same plan.
- Never publish `doneAt` or `calledAt`. Publish `boardPlan` (re-built through an allow-list), `called` and `board` only.
- Scripts are classic scripts: `boardplan.js` and `boardplan-ui.js` are loaded after `pods-ui.js` and before the main script. No ES modules. Match the surrounding code style (`var`, function declarations, string-built HTML, every dynamic value through `escapeHtml`).
- Test runner: `npm test` (`node --test`). The whole suite must pass after every task. `npm run check-viewer` must stay `ok` (this plan does not touch `render.js`).
- **Do not commit or push unless the user asks.** The steps below end with a checkpoint (full suite), not a commit. If the user asks for commits, use two: organiser side (everything except `viewer/` and the viewer tests) and viewer side, trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Real DartConnect player names must never appear in the repo.

## Review Focus

1. **Boards changed after the draw or after scores exist.** The plan must follow `pod.boards` the moment it changes, including a group moved onto another group's board. (Task 1 test "two groups sharing a board queue".)
2. **A walkover or no-show result.** It must be stamped and must move the queue on, like a played result. (Task 2 test "a no-show is stamped like a played result".)
3. **A Finals board override for a board no group uses** (for example board 9 at a 3-board event). The match must appear on that board. (Task 1 test "a Finals board override".)
4. **A tournament with no `boardPlan`** (saved before this feature, or just opened). The viewer must show no Boards tab and no board lines, and must not throw. (Task 6 test "no plan, no Boards tab".)
5. **A very large event.** 540 players, 64 groups: building the plan must be fast and the TV page count must be right. (Task 8 scale test, Task 6 TV paging test.)
6. **A format other than Group Boards.** No `boardPlan` is stored and nothing is published. (Task 2 and Task 3 tests.)

---

## File Structure

| File | Responsibility |
|---|---|
| `boardplan.js` (new) | Pure logic: `stampDoneTimes(t)`, `buildBoardPlan(t, opts)`, `bpBracket`, `bpRound5`. No DOM. |
| `boardplan-ui.js` (new) | Organiser screens: Boards panel (`bpPanelHTML`), Call and Finals-board handlers, the Players A–Z and Boards print sheets, the two Stage 7 toggles. |
| `index.html` | Script tags; `persist()` stamps and stores the plan; `blankTournament` and `openTournament` defaults for the two print toggles. |
| `pods-ui.js` | Mount the panel in Stage 5; the two toggles and sheets in Stage 7 / `podsPrintClick`. |
| `viewer/api/_lib/publicView.js` | Publish `boardPlan` (allow-listed), `called`, `board`. |
| `viewer/index.html`, `viewer/theme.css` | Boards tab, TV mode, Me and player lines, group start times, Finals boards. |
| `tests/lib/load-app.js` | Load the two new files in the test sandbox. |
| `tests/boardplan.test.js`, `tests/boardplan-persist.test.js`, `tests/boardplan-ui.test.js`, `tests/boardplan-print.test.js`, `tests/viewer-boards.test.js`, plus additions to `tests/public-view.test.js` and `tests/scale.test.js` | Tests. |

---

### Task 1: The board plan (pure logic)

**Files:**
- Create: `boardplan.js`
- Modify: `tests/lib/load-app.js` (load the new files), `index.html:356-357` (script tags)
- Test: `tests/boardplan.test.js`

**Interfaces:**
- Consumes: `podsList(t)`, `podsFinals(t)`, `bracketByKey(t, key)` (pods.js); `anticipatedStartEpoch(t)`, `matchDurationMinutes(t, {isKnockout, legs})`, `legsForKnockoutRound(t, bracketKey, totalRounds, idx)` (index.html).
- Produces:
  - `stampDoneTimes(t)` — mutates matches.
  - `buildBoardPlan(t, opts)` → `{ v:1, hasTimes:boolean, boards:{ "<n>": [ { key, ri, mi, status, ready, estMs, called } ] } }`. With `opts.starts` truthy, each entry also has `startMs` (rounded ms, or `null` when there is no start time) and the plan has no other change.
  - `bpBracket(t, key)` → the bracket for `'ko'` or `'pod:<id>'`.
  - `bpRound5(ms)` → ms rounded to the nearest 5 minutes.

- [ ] **Step 1: Add the new files to the test loader and the page**

In `tests/lib/load-app.js`, change the `files` line so the new scripts load when they exist:

```js
  const files = ['render.js'].concat(['pods.js', 'pods-ui.js', 'boardplan.js', 'boardplan-ui.js'].filter((f) => fs.existsSync(path.join(ROOT, f)))).concat(extraFiles || []);
```

In `index.html`, after the `pods-ui.js` script tag:

```html
<script src="pods.js"></script>
<script src="pods-ui.js"></script>
<script src="boardplan.js"></script>
<script src="boardplan-ui.js"></script>
```

(`boardplan-ui.js` is created in Task 4. Until then, create it now as an empty placeholder file containing only the header comment `/* Board schedule screens for Group Boards (see boardplan.js). */` so the page does not 404.)

- [ ] **Step 2: Write the failing tests**

Create `tests/boardplan.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, plain, useState, seededRng, makeTournament, play, playOut } = require('./lib/helpers');

const app = loadApp();
const f = (name) => run(app, name);
const FIXED = Date.UTC(2026, 9, 6, 9, 0, 0);
const r5 = (ms) => Math.round(ms / 300000) * 300000;
function ready(n, pods, opts) {
  const t = makeTournament(app, n, Object.assign({ pods, boards: pods }, opts || {})); useState(app, t);
  t.format.anticipatedStartTime = '10:00';
  app.persist = () => {}; app.render = () => {};
  f('generatePods')(t, seededRng(3)); f('podsConfirmAll')(t);
  return t;
}
const start = (t) => f('anticipatedStartEpoch')(t);
const per = (t) => f('matchDurationMinutes')(t, { isKnockout: true, legs: 5 });
const plan = (t, o) => plain(f('buildBoardPlan')(t, o));
const groupEntries = (p, board) => p.boards[board].filter((e) => e.key.startsWith('pod:'));

test('one group per board: the first match is up, the second next, the rest later, with estimates', () => {
  const t = ready(12, 3);
  const p = plan(t), q = groupEntries(p, '1');
  assert.deepEqual(q.map((e) => e.status), ['up', 'next', 'later']);
  assert.equal(q[0].estMs, null);
  assert.equal(q[1].estMs, r5(start(t) + per(t) * 60000));
  assert.equal(q[2].estMs, r5(start(t) + 2 * per(t) * 60000));   // the group final waits for both first-round matches
  assert.equal(p.hasTimes, true); assert.equal(p.v, 1);
});

test('two groups sharing a board queue one after the other', () => {
  const t = ready(12, 3);
  t.pods[1].boards = [t.pods[0].boards[0]];
  const p = plan(t), q = groupEntries(p, String(t.pods[0].boards[0]));
  assert.equal(q.length, 6);
  assert.deepEqual(q.map((e) => e.key), [].concat(Array(3).fill('pod:' + t.pods[0].id), Array(3).fill('pod:' + t.pods[1].id)));
  assert.equal(q[3].estMs, r5(start(t) + 3 * per(t) * 60000));
  assert.ok(!p.boards['2'] || groupEntries(p, '2').length === 0);
});

test('a group on two boards plays its first-round matches together', () => {
  const t = ready(12, 3);
  t.pods[0].boards = [1, 2];
  const p = plan(t);
  assert.equal(p.boards['1'][0].status, 'up'); assert.equal(p.boards['2'][0].status, 'up');
  assert.equal(p.boards['1'][0].key, 'pod:' + t.pods[0].id); assert.equal(p.boards['2'][0].key, 'pod:' + t.pods[0].id);
  assert.equal(p.boards['1'][1].status, 'next');
  assert.equal(p.boards['1'][1].estMs, r5(start(t) + per(t) * 60000));
});

test('byes never appear in the queue', () => {
  const t = ready(14, 4);
  const small = t.pods.find((p) => p.entryIds.length === 3);
  const p = plan(t);
  const mine = [].concat(...Object.values(p.boards)).filter((e) => e.key === 'pod:' + small.id);
  assert.equal(mine.length, 2);   // one first-round match and the group final
  mine.forEach((e) => assert.ok(!small.bracket.rounds[e.ri][e.mi].bye));
});

test('only confirmed groups are planned, and there is no Finals until it is built', () => {
  const t = makeTournament(app, 12, { pods: 3, boards: 3 }); useState(app, t);
  app.persist = () => {}; app.render = () => {};
  f('generatePods')(t, seededRng(3)); f('podsConfirm')(t, t.pods[0].id);
  const p = plan(t);
  const entries = [].concat(...Object.values(p.boards));
  assert.ok(entries.length > 0);
  entries.forEach((e) => assert.equal(e.key, 'pod:' + t.pods[0].id));
});

test('the Finals starts after the groups end and its entries are not ready until the groups are done', () => {
  const t = ready(12, 3);
  const p = plan(t), ko = p.boards['1'].filter((e) => e.key === 'ko');
  assert.ok(ko.length >= 2);
  assert.equal(ko[0].estMs, r5(start(t) + 3 * per(t) * 60000));
  assert.equal(ko[1].estMs, r5(start(t) + 4 * per(t) * 60000));
  assert.equal(ko[0].ready, false);
  t.pods.forEach((g) => playOut(app, g.bracket, () => 'a')); f('syncFinalsFromPods')(t);
  const after = plan(t).boards['1'].filter((e) => e.key === 'ko');
  assert.equal(after[0].ready, true);
});

test('Finals matches spread over the boards the groups used, lowest first', () => {
  const t = ready(32, 8);
  const p = plan(t);
  ['1', '2', '3', '4'].forEach((b) => assert.ok(p.boards[b].some((e) => e.key === 'ko' && e.ri === 0), 'board ' + b));
  assert.ok(!p.boards['5'].some((e) => e.key === 'ko' && e.ri === 0));
});

test('a Finals board override puts that match on the chosen board, even one no group uses', () => {
  const t = ready(32, 8);
  t.knockout.rounds[0][0].board = 5;
  assert.ok(plan(t).boards['5'].some((e) => e.key === 'ko' && e.ri === 0 && e.mi === 0));
  t.knockout.rounds[0][0].board = 9;
  const p = plan(t);
  assert.ok(p.boards['9'].some((e) => e.key === 'ko' && e.ri === 0 && e.mi === 0));
  assert.ok(!p.boards['1'].some((e) => e.key === 'ko' && e.ri === 0 && e.mi === 0));
});

test('with no anticipated start time there are no estimates, only statuses', () => {
  const t = ready(12, 3);
  t.format.anticipatedStartTime = '';
  const p = plan(t);
  assert.equal(p.hasTimes, false);
  [].concat(...Object.values(p.boards)).forEach((e) => assert.equal(e.estMs, null));
  assert.deepEqual(p.boards['1'].slice(0, 3).map((e) => e.status), ['up', 'next', 'later']);
});

test('a late result pushes the estimates behind it back, and undoing it puts them back', () => {
  const t = ready(12, 3);
  const before = plan(t);
  const m = t.pods[0].bracket.rounds[0][0];
  play(m, 'a'); m.doneAt = start(t) + 60 * 60000;
  const late = plan(t), q = late.boards[String(t.pods[0].boards[0])];
  assert.deepEqual(q.slice(0, 3).map((e) => e.status), ['done', 'up', 'next']);
  assert.equal(q[2].estMs, r5(start(t) + 60 * 60000 + per(t) * 60000));
  delete m.winnerId; delete m.aLegs; delete m.bLegs; delete m.doneAt;
  assert.deepEqual(plan(t), before);
});

test('the same state always gives the same plan, and a called match is flagged', () => {
  const t = ready(12, 3);
  const m = t.pods[0].bracket.rounds[0][0]; m.called = true;
  assert.deepEqual(plan(t), plan(t));
  const q = plan(t).boards[String(t.pods[0].boards[0])];
  assert.equal(q[0].called, true); assert.equal(q[1].called, false);
});

test('starts: true adds a rounded start time to every entry, including the one that is up', () => {
  const t = ready(12, 3);
  const q = plan(t, { starts: true }).boards['1'];
  assert.equal(q[0].startMs, r5(start(t)));
  assert.equal(q[1].startMs, r5(start(t) + per(t) * 60000));
  t.format.anticipatedStartTime = '';
  assert.equal(plan(t, { starts: true }).boards['1'][0].startMs, null);
});

test('stampDoneTimes stamps results, clears the stamp on undo, clears calls, and ignores byes', () => {
  const t = ready(14, 4);
  const m = t.pods[0].bracket.rounds[0].find((x) => x.aEntryId && x.bEntryId);
  play(m, 'a'); m.called = true; m.calledAt = 1;
  f('stampDoneTimes')(t);
  assert.equal(m.doneAt, FIXED); assert.equal(m.called, undefined); assert.equal(m.calledAt, undefined);
  m.doneAt = 5; f('stampDoneTimes')(t);
  assert.equal(m.doneAt, 5);                                   // not re-stamped
  delete m.winnerId; f('stampDoneTimes')(t);
  assert.equal(m.doneAt, undefined);                           // result undone
  t.pods.forEach((p) => p.bracket.rounds.forEach((r) => r.forEach((x) => { if (x.bye) assert.equal(x.doneAt, undefined); })));
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test tests/boardplan.test.js`
Expected: FAIL, every test with `ReferenceError: buildBoardPlan is not defined` (or `stampDoneTimes`).

- [ ] **Step 4: Write `boardplan.js`**

```js
/* Board schedule for Group Boards: pure logic, no DOM. Loaded after pods.js and before the main script in index.html.
   Builds each board's queue of matches (groups in order, then the Finals), with a status per match and, when an
   anticipated start time is set, an estimated start time. Needs globals from index.html (anticipatedStartEpoch,
   matchDurationMinutes, legsForKnockoutRound) and pods.js (podsList, podsFinals, bracketByKey). */

/* Stamps the time a result was entered, and clears the stamp when a result is undone. Entering a result also
   clears any call. Run on every save, so every way of entering or undoing a result is covered. */
function stampDoneTimes(t){
  function visit(b){
    if(!b || !b.rounds) return;
    b.rounds.forEach(function(round){ round.forEach(function(m){
      if(m.winnerId && !m.bye){ if(!m.doneAt) m.doneAt = Date.now(); delete m.called; delete m.calledAt; }
      else if(!m.winnerId && m.doneAt){ delete m.doneAt; }
    }); });
  }
  podsList(t).forEach(function(p){ visit(p.bracket); });
  visit(podsFinals(t));
}

function bpRound5(ms){ return Math.round(ms / 300000) * 300000; }

/* The bracket behind a plan entry key: 'ko' is the Finals, 'pod:<id>' is a group. */
function bpBracket(t, key){ return key === 'ko' ? podsFinals(t) : bracketByKey(t, key); }

/* The board plan: { v, hasTimes, boards: { "<board>": [ { key, ri, mi, status, ready, estMs, called } ] } }.
   status: done | up (first not done on its board) | next (second) | later. ready: both players are known.
   estMs: estimated start (rounded to 5 minutes), null for done and up entries or when no start time is set.
   opts.starts also adds startMs, the rounded start for every entry (used by the print sheets). */
function buildBoardPlan(t, opts){
  var anchor = anticipatedStartEpoch(t), hasTimes = anchor != null, base = hasTimes ? anchor : 0;
  var queues = {}, cursor = {}, groupPhaseEnd = base, usedBoards = {};
  function cur(b){ return cursor[b] == null ? base : cursor[b]; }
  function place(key, orgKey, bracket, ri, mi, board, roundStart, ends){
    var m = bracket.rounds[ri][mi];
    var mins = matchDurationMinutes(t, { isKnockout:true, legs:legsForKnockoutRound(t, orgKey, bracket.rounds.length, ri) });
    var start = Math.max(cur(board), roundStart), end = start + mins * 60000;
    var done = !!m.winnerId;
    if(done && hasTimes && m.doneAt){ end = Math.max(cur(board), m.doneAt); start = end; }   // real finish time re-bases the board
    cursor[board] = end; ends.push(end);
    (queues[board] = queues[board] || []).push({ key:key, ri:ri, mi:mi, done:done, ready:!!(m.aEntryId && m.bEntryId), startMs:start, called:!!m.called });
  }
  /* Deals a bracket's real (non-bye) matches round by round onto boards; a round starts when the one before ends. */
  function bracketRounds(key, orgKey, bracket, boardFor, firstStart){
    var prevEnd = firstStart, all = [];
    bracket.rounds.forEach(function(round, ri){
      var ends = [], k = 0;
      round.forEach(function(m, mi){
        if(m.bye) return;
        place(key, orgKey, bracket, ri, mi, boardFor(m, k), prevEnd, ends);
        k++;
      });
      if(ends.length) prevEnd = Math.max.apply(null, ends);
      all = all.concat(ends);
    });
    return all;
  }
  podsList(t).filter(function(p){ return p.confirmed && p.bracket; }).forEach(function(p){
    var boards = (p.boards && p.boards.length) ? p.boards : [1];
    boards.forEach(function(b){ usedBoards[b] = true; });
    var ends = bracketRounds('pod:' + p.id, 'pod:' + p.id, p.bracket, function(m, k){ return boards[k % boards.length]; }, base);
    if(ends.length) groupPhaseEnd = Math.max(groupPhaseEnd, Math.max.apply(null, ends));
  });
  var fin = podsFinals(t);
  if(fin){
    var list = Object.keys(usedBoards).map(Number).sort(function(a, b){ return a - b; });
    if(!list.length) list = [1];
    var brk = (t.format.breaks || {}).knockout, brkMs = (brk && brk.enabled ? parseInt(brk.minutes) || 0 : 0) * 60000;
    bracketRounds('ko', 'knockout', fin, function(m, k){ var b = parseInt(m.board); return b > 0 ? b : list[k % list.length]; }, groupPhaseEnd + brkMs);
  }
  var out = { v:1, hasTimes:hasTimes, boards:{} };
  Object.keys(queues).forEach(function(b){
    var undone = 0;
    out.boards[b] = queues[b].map(function(e){
      var status = 'done';
      if(!e.done){ undone++; status = undone === 1 ? 'up' : undone === 2 ? 'next' : 'later'; }
      var entry = { key:e.key, ri:e.ri, mi:e.mi, status:status, ready:e.ready,
                    estMs:(hasTimes && status !== 'done' && status !== 'up') ? bpRound5(e.startMs) : null, called:e.called };
      if(opts && opts.starts) entry.startMs = hasTimes ? bpRound5(e.startMs) : null;
      return entry;
    });
  });
  return out;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test tests/boardplan.test.js`
Expected: PASS, 12 tests.

- [ ] **Step 6: Checkpoint**

Run: `npm test`
Expected: everything passes (the existing 122 tests plus the 12 new ones).

---

### Task 2: Stamp and store the plan on every save

**Files:**
- Modify: `index.html` — `persist()` (~line 1937), `blankTournament` `printSettings` (~line 446), `openTournament` defaults (~line 2100)
- Test: `tests/boardplan-persist.test.js`

**Interfaces:**
- Consumes: `stampDoneTimes(t)`, `buildBoardPlan(t)` (Task 1).
- Produces: `state.boardPlan` (the stored, published plan), `state.printSettings.playersSheetEnabled` and `boardsSheetEnabled` (both default `true`).

- [ ] **Step 1: Write the failing tests**

Create `tests/boardplan-persist.test.js`. It must not stub `persist`, so it has its own app instance:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, plain, useState, seededRng, makeTournament, play } = require('./lib/helpers');

const app = loadApp();
const f = (name) => run(app, name);
app.setTimeout = () => 0; app.clearTimeout = () => {};   // persist schedules a save; never run it here
app.render = () => {};
const FIXED = Date.UTC(2026, 9, 6, 9, 0, 0);
function ready(n, pods) {
  const t = makeTournament(app, n, { pods, boards: pods }); useState(app, t);
  t.format.anticipatedStartTime = '10:00';
  f('generatePods')(t, seededRng(3)); f('podsConfirmAll')(t);
  return t;
}

test('saving a Group Boards tournament stores a board plan and stamps results', () => {
  const t = ready(12, 3);
  f('persist')();
  assert.equal(t.boardPlan.v, 1);
  assert.ok(Object.keys(t.boardPlan.boards).length >= 3);
  const m = t.pods[0].bracket.rounds[0][0];
  play(m, 'a');
  f('persist')();
  assert.equal(m.doneAt, FIXED);
  assert.equal(t.boardPlan.boards[String(t.pods[0].boards[0])][0].status, 'done');
  assert.deepEqual(plain(t.boardPlan), plain(f('buildBoardPlan')(t)));
});

test('a no-show is stamped like a played result and moves the queue on', () => {
  const t = ready(12, 3);
  f('persist')();
  const m = t.pods[0].bracket.rounds[0][0];
  f('markKnockoutNoShow')('pod:' + t.pods[0].id, 0, 0, 'a');
  assert.equal(m.wo, true);
  assert.equal(m.doneAt, FIXED);
  assert.equal(t.boardPlan.boards[String(t.pods[0].boards[0])][0].status, 'done');
});

test('other formats never get a board plan, and a leftover one is dropped', () => {
  const t = f('blankTournament')();
  t.format.formatType = 'knockout'; useState(app, t);
  f('persist')();
  assert.equal('boardPlan' in t, false);
  t.boardPlan = { v: 1, hasTimes: false, boards: {} };
  f('persist')();
  assert.equal('boardPlan' in t, false);
});

test('the two new print sheets are on by default, for new and for older tournaments', async () => {
  const fresh = f('blankTournament')();
  assert.equal(fresh.printSettings.playersSheetEnabled, true);
  assert.equal(fresh.printSettings.boardsSheetEnabled, true);
  const old = f('blankTournament')();
  delete old.printSettings.playersSheetEnabled; delete old.printSettings.boardsSheetEnabled;
  app.fetch = async () => ({ ok: true, status: 200, json: async () => ({ data: old, updated_at: '2026-01-01T00:00:00Z' }) });
  await f('openTournament')('t_old');
  const s = run(app, 'state');
  assert.equal(s.printSettings.playersSheetEnabled, true);
  assert.equal(s.printSettings.boardsSheetEnabled, true);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/boardplan-persist.test.js`
Expected: FAIL (`boardPlan` undefined, print flags undefined).

- [ ] **Step 3: Implement**

In `index.html`, `persist()`:

```js
function persist(){
  if(!state) return;
  /* Group Boards: stamp result times, then keep the board plan (what the public page shows) in step with the data. */
  if(state.format && state.format.formatType==='podknockout'){
    stampDoneTimes(state);
    state.boardPlan = buildBoardPlan(state);
  } else if('boardPlan' in state){
    delete state.boardPlan;
  }
  state.updatedAt = Date.now();
  tournamentsCache[state.id] = state;
  renderSavedList();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 500);
}
```

In `blankTournament`, extend the `printSettings` literal:

```js
    printSettings: { sponsorFooterEnabled:true, teamHandoutEnabled:false, rulesSheetEnabled:true, lineupSheetEnabled:false, koPaperSize:'A4', playersSheetEnabled:true, boardsSheetEnabled:true },
```

In `openTournament`, after the `koPaperSize` default line:

```js
    if(state.printSettings.playersSheetEnabled===undefined) state.printSettings.playersSheetEnabled = true;
    if(state.printSettings.boardsSheetEnabled===undefined) state.printSettings.boardsSheetEnabled = true;
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/boardplan-persist.test.js`
Expected: PASS, 4 tests.

- [ ] **Step 5: Checkpoint**

Run: `npm test`
Expected: everything passes, including `tests/golden.test.js` (the three existing formats are unchanged).

---

### Task 3: Publish the plan, `called` and `board`

**Files:**
- Modify: `viewer/api/_lib/publicView.js`
- Test: `tests/public-view.test.js` (append)

**Interfaces:**
- Consumes: `t.boardPlan` (Task 2), `m.called`, `m.board`.
- Produces: `view.boardPlan` (allow-listed copy, only for Group Boards), `called` and `board` on every published match.

- [ ] **Step 1: Write the failing tests**

Append to `tests/public-view.test.js`:

```js
test('the board plan, called and board are published; doneAt and calledAt are not', () => {
  const t = event(true);
  t.boardPlan = JSON.parse(JSON.stringify(run(app, 'buildBoardPlan')(t)));
  t.boardPlan.boards['1'][0].secret = 'SECRET PLAN FIELD';
  const m = t.pods[0].bracket.rounds[0][0];
  m.called = true; m.calledAt = 111; m.doneAt = 222; t.knockout.rounds[0][0].board = 4;
  const view = toPublicView(JSON.parse(JSON.stringify(t)));
  assert.equal(view.boardPlan.v, 1);
  const first = view.boardPlan.boards['1'][0];
  assert.deepEqual(Object.keys(first).sort(), ['called', 'estMs', 'key', 'mi', 'ready', 'ri', 'status']);
  assert.equal(view.pods[0].bracket.rounds[0][0].called, true);
  assert.equal(view.knockout.rounds[0][0].board, 4);
  const text = JSON.stringify(view);
  assert.ok(!text.includes('doneAt') && !text.includes('calledAt') && !text.includes('SECRET PLAN FIELD'));
});

test('a malformed board plan is trimmed to safe values, and other formats publish none', () => {
  const t = event(true);
  t.boardPlan = { v: 1, hasTimes: 'yes', boards: { '1': [{ key: '<b>x</b>', ri: '1', mi: 0, status: 'weird', ready: 1, estMs: 'soon', called: 0 }], 'x<y': [] } };
  const view = toPublicView(JSON.parse(JSON.stringify(t)));
  assert.deepEqual(Object.keys(view.boardPlan.boards), ['1']);
  const e = view.boardPlan.boards['1'][0];
  assert.equal(e.key, ''); assert.equal(e.status, 'later'); assert.equal(e.estMs, null); assert.equal(e.ready, true); assert.equal(e.called, false);
  assert.equal(view.boardPlan.hasTimes, true);
  const other = event(true); other.format.formatType = 'knockout'; other.boardPlan = { v: 1, hasTimes: false, boards: {} };
  assert.equal(toPublicView(JSON.parse(JSON.stringify(other))).boardPlan, undefined);
  assert.equal(toPublicView(JSON.parse(JSON.stringify(event(true)))).boardPlan, undefined);   // no plan stored yet
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/public-view.test.js`
Expected: FAIL (`view.boardPlan` is undefined).

- [ ] **Step 3: Implement**

In `viewer/api/_lib/publicView.js`, add `'called', 'board'` to `publicMatch`:

```js
function publicMatch(m) {
  return pick(m, ['id', 'aEntryId', 'bEntryId', 'aLegs', 'bLegs', 'winnerId', 'bye', 'wo', 'aFromPod', 'bFromPod', 'called', 'board']);
}
```

Add the plan copier above `toPublicView`:

```js
// The board plan is rebuilt field by field, so only values of the expected kinds are published.
const PLAN_STATUS = ['done', 'up', 'next', 'later'];
function publicBoardPlan(bp) {
  if (!bp || typeof bp !== 'object' || !bp.boards || typeof bp.boards !== 'object') return undefined;
  const boards = {};
  Object.keys(bp.boards).forEach((b) => {
    if (!/^\d{1,4}$/.test(b) || !Array.isArray(bp.boards[b])) return;
    boards[b] = bp.boards[b].map((e) => ({
      key: typeof e.key === 'string' && /^(ko|pod:[A-Za-z0-9_-]+)$/.test(e.key) ? e.key : '',
      ri: parseInt(e.ri, 10) || 0,
      mi: parseInt(e.mi, 10) || 0,
      status: PLAN_STATUS.indexOf(e.status) !== -1 ? e.status : 'later',
      ready: !!e.ready,
      estMs: typeof e.estMs === 'number' && isFinite(e.estMs) ? e.estMs : null,
      called: !!e.called,
    }));
  });
  return { v: 1, hasTimes: !!bp.hasTimes, boards };
}
```

In the object returned by `toPublicView`, after `pods:`:

```js
    boardPlan: isGroupBoards ? publicBoardPlan(d.boardPlan) : undefined,
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/public-view.test.js`
Expected: PASS (existing and new tests). Note the first new test's `first` entry has exactly the 7 keys listed, in any order.

- [ ] **Step 5: Checkpoint**

Run: `npm test`
Expected: everything passes.

---

### Task 4: Organiser Boards panel, Call and Finals boards

**Files:**
- Modify: `boardplan-ui.js` (placeholder from Task 1), `pods-ui.js` (`podsStage5`)
- Test: `tests/boardplan-ui.test.js`

**Interfaces:**
- Consumes: `buildBoardPlan`, `bpBracket` (Task 1); `koMatchScoreModal(bracketKey, ri, mi)`, `openKoNoShowPicker(bracketKey, ri, mi)`, `koRoundName(bracket, ri)`, `epochClockLabel(ms)`, `podByKey(t, key)`, `bracketByKey(t, key)`, `podsFinals(t)`, `podsList(t)`, `persist`, `render`, `escapeHtml`, `goStage`.
- Produces: `bpOrgKey(key)`, `bpMatchOf(t, e)`, `bpSlotName(t, m, side)`, `bpWhere(t, e)`, `bpEntryRowHTML(t, e, label)`, `bpPanelHTML()`, `bpFinalsBoardsHTML(t, plan)`, `bpToggleCall(bracketKey, ri, mi)`, `bpSetFinalsBoard(ri, mi, text)`.

- [ ] **Step 1: Write the failing tests**

Create `tests/boardplan-ui.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, useState, seededRng, makeTournament, playOut } = require('./lib/helpers');

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
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/boardplan-ui.test.js`
Expected: FAIL (`bpPanelHTML is not defined`).

- [ ] **Step 3: Write `boardplan-ui.js`** (replace the placeholder)

```js
/* Board schedule screens for Group Boards: the organiser's Boards panel and the two print sheets. The plan itself
   comes from boardplan.js. Needs globals from index.html (state, persist, render, escapeHtml, goStage, koRoundName,
   epochClockLabel, koMatchScoreModal, openKoNoShowPicker, ...). Only called while rendering or on a click. */

/* ---------- Boards panel (Stage 5) ---------- */
/* Plan entries call the Finals 'ko'; the organiser's own bracket key for it is 'knockout'. */
function bpOrgKey(key){ return key === 'ko' ? 'knockout' : key; }
function bpMatchOf(t, e){ var b = bpBracket(t, e.key); return b && b.rounds[e.ri] ? b.rounds[e.ri][e.mi] : null; }
function bpSlotName(t, m, side){
  var id = m[side+'EntryId'], from = m[side+'FromPod'];
  if(id) return (t.entriesList.find(function(e){ return e.id === id; }) || {}).name || 'Unknown';
  if(from){ var p = podsList(t).find(function(x){ return x.id === from; }); return 'Winner of Group '+(p ? p.label : '?'); }
  return 'To be decided';
}
function bpWhere(t, e){
  var b = bpBracket(t, e.key), round = b ? koRoundName(b, e.ri) : '';
  if(e.key === 'ko') return 'Finals · '+round;
  var p = podByKey(t, e.key);
  return 'Group '+(p ? p.label : '?')+' · '+round;
}
function bpEntryRowHTML(t, e, label){
  var m = bpMatchOf(t, e);
  if(!m) return '';
  var args = "'"+bpOrgKey(e.key)+"',"+e.ri+','+e.mi, btn = 'style="padding:3px 9px;font-size:11px"';
  var buttons = e.ready
    ? '<button class="btn ghost" '+btn+' onclick="bpToggleCall('+args+')">'+(m.called ? 'Uncall' : 'Call')+'</button>'+
      '<button class="btn ghost" '+btn+' onclick="koMatchScoreModal('+args+')">Enter result</button>'+
      '<button class="btn ghost" '+btn+' onclick="openKoNoShowPicker('+args+')">No-show</button>'
    : '';
  return '<div style="padding:8px 0;border-top:1px solid var(--line)">'+
    '<div style="font-size:12px"><b>'+(m.called ? 'Called' : label)+'</b> · '+escapeHtml(bpWhere(t, e))+(e.estMs != null ? ' · ~'+escapeHtml(epochClockLabel(e.estMs)) : '')+'</div>'+
    '<div style="font-size:13px;margin:2px 0 6px">'+escapeHtml(bpSlotName(t, m, 'a'))+' v '+escapeHtml(bpSlotName(t, m, 'b'))+(e.ready ? '' : ' <span class="hint" style="margin:0">· waiting for an earlier match</span>')+'</div>'+
    (buttons ? '<div class="buttonrow" style="margin:0">'+buttons+'</div>' : '')+'</div>';
}
function bpPanelHTML(){
  var t = state, plan = buildBoardPlan(t);
  var boards = Object.keys(plan.boards).sort(function(a, b){ return a - b; });
  if(!boards.length) return '';
  var cards = boards.map(function(b){
    var pending = plan.boards[b].filter(function(e){ return e.status !== 'done'; });
    var shown = pending.slice(0, 2), more = pending.length - shown.length;
    return '<div style="border:1px solid var(--line);border-radius:10px;padding:10px 12px">'+
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px"><strong>Board '+b+'</strong><span class="hint" style="margin:0">'+(pending.length ? pending.length+' to play' : 'Finished')+'</span></div>'+
      shown.map(function(e){ return bpEntryRowHTML(t, e, e.status === 'up' ? 'Up now' : 'Next'); }).join('')+
      (more > 0 ? '<div class="hint" style="margin:6px 0 0">'+more+' more after these</div>' : '')+'</div>';
  }).join('');
  return '<div class="card"><h2>Boards</h2><p class="intro">What is on each board now and next. Call a match to tell the players, on the public results page, to go to their board.</p>'+
    (plan.hasTimes ? '' : '<div class="hint" style="margin-bottom:8px">Estimated times are off. Set an anticipated start time in <a href="javascript:void(0)" onclick="goStage(2)">Format &amp; branding</a> to switch them on.</div>')+
    '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;margin-top:10px">'+cards+'</div>'+
    bpFinalsBoardsHTML(t, plan)+'</div>';
}
/* Every Finals match with a board box, so the final can be moved to a feature board. Blank means automatic. */
function bpFinalsBoardsHTML(t, plan){
  var fin = podsFinals(t);
  if(!fin) return '';
  var auto = {};
  Object.keys(plan.boards).forEach(function(b){ plan.boards[b].forEach(function(e){ if(e.key === 'ko') auto[e.ri+'|'+e.mi] = b; }); });
  var rows = '';
  fin.rounds.forEach(function(round, ri){ round.forEach(function(m, mi){
    if(m.bye) return;
    rows += '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:5px 0;font-size:12px"><span>'+
      escapeHtml(koRoundName(fin, ri))+' · '+escapeHtml(bpSlotName(t, m, 'a'))+' v '+escapeHtml(bpSlotName(t, m, 'b'))+'</span>'+
      '<span>Board <input type="text" inputmode="numeric" style="width:54px;height:26px;font-size:12px" value="'+(m.board || '')+'" placeholder="'+(auto[ri+'|'+mi] || '')+'" onchange="bpSetFinalsBoard('+ri+','+mi+',this.value)"></span></div>';
  }); });
  return '<details style="margin-top:12px"><summary style="cursor:pointer;font-weight:600">Finals boards</summary>'+
    '<p class="hint" style="margin:6px 0">Leave a box blank to let the app choose. A number puts that match on that board.</p>'+rows+'</details>';
}
function bpToggleCall(bracketKey, ri, mi){
  var b = bracketByKey(state, bracketKey), m = b && b.rounds[ri] && b.rounds[ri][mi];
  if(!m || m.winnerId || m.bye || !m.aEntryId || !m.bEntryId) return;
  if(m.called){ delete m.called; delete m.calledAt; } else { m.called = true; m.calledAt = Date.now(); }
  persist(); render();
}
function bpSetFinalsBoard(ri, mi, text){
  var fin = podsFinals(state), m = fin && fin.rounds[ri] && fin.rounds[ri][mi];
  if(!m) return;
  var n = parseInt(text);
  if(n > 0) m.board = n; else delete m.board;
  persist(); render();
}
```

- [ ] **Step 4: Mount the panel in Stage 5**

In `pods-ui.js`, `podsStage5`, replace:

```js
  html += '</div>';
  html += publicResultsCardHTML();
```

with:

```js
  html += '</div>';
  html += bpPanelHTML();
  html += publicResultsCardHTML();
```

- [ ] **Step 5: Run to verify it passes**

Run: `node --test tests/boardplan-ui.test.js`
Expected: PASS, 7 tests.

- [ ] **Step 6: Checkpoint**

Run: `npm test`
Expected: everything passes.

---

### Task 5: The two print sheets

**Files:**
- Modify: `boardplan-ui.js` (append), `pods-ui.js` (`podsStage7`, `podsPrintClick`), `index.html` (toggle handlers are in `boardplan-ui.js`; nothing else)
- Test: `tests/boardplan-print.test.js`

**Interfaces:**
- Consumes: `buildBoardPlan(t, {starts:true})` (Task 1), `mainLogoBoxHTML()`, `DD_CREDIT_HTML`, `epochClockLabel`, `podsList`.
- Produces: `bpPlayerRows(t)` → `[{ name, org, group, boards, startMs }]` sorted by name; `bpSheetShell(t, title, subtitle, inner)`; `bpPlayersSheetsHTML(t)`; `bpBoardsSheetHTML(t)`; `playersSheetToggleHTML()`, `boardsSheetToggleHTML()`, `togglePlayersSheet(v)`, `toggleBoardsSheet(v)`.

- [ ] **Step 1: Write the failing tests**

Create `tests/boardplan-print.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, plain, useState, seededRng, makeTournament } = require('./lib/helpers');

const app = loadApp();
const f = (name) => run(app, name);
function ready(n, pods) {
  const t = makeTournament(app, n, { pods, boards: pods }); useState(app, t);
  t.format.anticipatedStartTime = '10:00';
  app.persist = () => {}; app.render = () => {};
  f('generatePods')(t, seededRng(3)); f('podsConfirmAll')(t);
  return t;
}
function printed() {
  const mount = { innerHTML: '' };
  app.document = { getElementById: (id) => (id === 'printSheets' ? mount : null) };
  app.window = { print() {} };
  f('podsPrintClick')();
  return mount.innerHTML;
}

test('player rows are alphabetical, ignore case, skip withdrawn players, and carry group, board and start', () => {
  const t = ready(12, 3);
  t.entriesList[0].name = 'zed'; t.entriesList[1].name = 'Alma'; t.entriesList[2].withdrawn = true;
  const rows = plain(f('bpPlayerRows')(t));
  assert.equal(rows.length, 11);
  assert.deepEqual(rows.map((r) => r.name), rows.map((r) => r.name).slice().sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())));
  assert.equal(rows[0].name, 'Alma'); assert.equal(rows[rows.length - 1].name, 'zed');
  const g = t.pods.find((p) => p.entryIds.includes('e0'));
  const row = rows.find((r) => r.name === 'zed');
  assert.equal(row.group, g.label); assert.equal(row.boards, g.boards.join(', '));
  assert.equal(row.startMs, f('bpRound5')(f('anticipatedStartEpoch')(t)));
});

test('the Players A–Z sheet lists every player once with group and board, and splits long lists over sheets', () => {
  const t = ready(12, 3);
  const html = f('bpPlayersSheetsHTML')(t);
  assert.match(html, /PLAYERS A–Z/);
  t.entriesList.forEach((e) => assert.ok(html.includes(e.name + '<'), e.name));
  assert.match(html, /Group \d · Board \d/);
  const big = ready(120, 16);
  assert.equal((f('bpPlayersSheetsHTML')(big).match(/class="print-sheet/g) || []).length, 3);   // 50 per sheet
});

test('the Boards sheet lists each board with its groups in play order and the Finals matches on it', () => {
  const t = ready(12, 3);
  t.pods[1].boards = [t.pods[0].boards[0]];
  const html = f('bpBoardsSheetHTML')(t);
  assert.match(html, /BOARDS/);
  const row = html.split('Board ' + t.pods[0].boards[0])[1];
  assert.ok(row.indexOf('Group ' + t.pods[0].label) < row.indexOf('Group ' + t.pods[1].label));
  assert.match(html, /Finals/);
});

test('the sheets are escaped', () => {
  const t = ready(12, 3);
  t.entriesList[0].name = '<img src=x onerror=1>'; t.entriesList[0].org = '<b>club</b>';
  const html = f('bpPlayersSheetsHTML')(t);
  assert.doesNotMatch(html, /<img/); assert.doesNotMatch(html, /<b>club/);
});

test('printing includes both sheets by default and honours the two toggles', () => {
  const t = ready(12, 3);
  let html = printed();
  assert.match(html, /PLAYERS A–Z/); assert.match(html, /BOARDS/);
  t.printSettings.playersSheetEnabled = false;
  html = printed(); assert.doesNotMatch(html, /PLAYERS A–Z/); assert.match(html, /BOARDS/);
  t.printSettings.boardsSheetEnabled = false;
  html = printed(); assert.doesNotMatch(html, /BOARDS/);
});

test('Stage 7 shows the two toggles and they save', () => {
  const t = ready(12, 3);
  const html = f('podsStage7')();
  assert.match(html, /id="playersSheetToggle"/); assert.match(html, /id="boardsSheetToggle"/);
  f('togglePlayersSheet')(false); f('toggleBoardsSheet')(false);
  assert.equal(t.printSettings.playersSheetEnabled, false); assert.equal(t.printSettings.boardsSheetEnabled, false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/boardplan-print.test.js`
Expected: FAIL (`bpPlayerRows is not defined`).

- [ ] **Step 3: Append the sheets to `boardplan-ui.js`**

```js
/* ---------- Print sheets (Stage 7) ---------- */
function bpClock(ms){ return ms == null ? '' : '~'+epochClockLabel(ms); }

/* One row per active player who is in a confirmed group, alphabetical (ignoring case). startMs is when the
   player's group is expected to start (null when no start time is set). */
function bpPlayerRows(t){
  var plan = buildBoardPlan(t, { starts:true }), first = {};
  Object.keys(plan.boards).forEach(function(b){ plan.boards[b].forEach(function(e){
    if(e.key === 'ko' || e.startMs == null) return;
    if(first[e.key] == null || e.startMs < first[e.key]) first[e.key] = e.startMs;
  }); });
  var active = {};
  t.entriesList.forEach(function(e){ if(!e.withdrawn) active[e.id] = e; });
  var rows = [];
  podsList(t).filter(function(p){ return p.confirmed; }).forEach(function(p){
    p.entryIds.forEach(function(id){
      var e = active[id];
      if(!e) return;
      rows.push({ name:e.name || '', org:e.org || '', group:p.label, boards:p.boards.join(', '), startMs:first['pod:'+p.id] == null ? null : first['pod:'+p.id] });
    });
  });
  rows.sort(function(a, b){ return a.name.toLowerCase().localeCompare(b.name.toLowerCase()); });
  return rows;
}
/* The header and footer every sheet in the pack shares (same pattern as the rules sheet). */
function bpSheetShell(t, title, subtitle, inner){
  return '<div class="print-sheet ro-sheet">'+
    '<div class="sheet-top">'+mainLogoBoxHTML()+
      '<div><div class="title-overline">'+escapeHtml(t.eventCreation.tournamentName)+'</div><div class="sheet-title">'+escapeHtml(t.eventCreation.eventName)+'</div>'+
      '<div class="sheet-sub">'+escapeHtml(t.eventCreation.eventType)+' '+escapeHtml(t.eventCreation.competitionUnit)+' · '+escapeHtml(t.eventCreation.date||'')+'</div></div>'+
      '<div class="group-label"><strong>'+escapeHtml(title)+'</strong><span>'+escapeHtml(subtitle)+'</span></div>'+
    '</div>'+inner+
    '<div class="footer" style="margin-top:14px"><small>'+(t.format.footerText ? escapeHtml(t.format.footerText) : '')+'</small><div class="footer-right">'+DD_CREDIT_HTML+'</div></div>'+
  '</div>';
}
var BP_ROWS_PER_SHEET = 50;
function bpPlayersSheetsHTML(t){
  var rows = bpPlayerRows(t);
  if(!rows.length) return '';
  var sheets = Math.ceil(rows.length / BP_ROWS_PER_SHEET), html = '';
  for(var s = 0; s < sheets; s++){
    var chunk = rows.slice(s * BP_ROWS_PER_SHEET, (s + 1) * BP_ROWS_PER_SHEET);
    var body = '<div style="column-count:2;column-gap:28px;margin-top:10px">'+chunk.map(function(r){
      return '<div style="break-inside:avoid;display:flex;justify-content:space-between;gap:8px;padding:5px 0;border-bottom:1px solid #d7dce1;font-size:12px">'+
        '<span><b>'+escapeHtml(r.name)+'</b>'+(r.org ? ' <small style="color:#6f7c8b">'+escapeHtml(r.org)+'</small>' : '')+'</span>'+
        '<span style="white-space:nowrap">Group '+escapeHtml(r.group)+' · Board '+escapeHtml(r.boards)+(r.startMs != null ? ' · '+escapeHtml(bpClock(r.startMs)) : '')+'</span></div>';
    }).join('')+'</div>';
    html += bpSheetShell(t, 'PLAYERS A–Z', 'Find your group and board'+(sheets > 1 ? ' · Sheet '+(s + 1)+' of '+sheets : ''), body);
  }
  return html;
}
function bpBoardsSheetHTML(t){
  var plan = buildBoardPlan(t, { starts:true });
  var boards = Object.keys(plan.boards).sort(function(a, b){ return a - b; });
  if(!boards.length) return '';
  var rows = boards.map(function(b){
    var seen = {}, parts = [], finals = 0;
    plan.boards[b].forEach(function(e){
      if(e.key === 'ko'){ finals++; return; }
      if(seen[e.key]) return;
      seen[e.key] = true;
      var p = podByKey(t, e.key);
      parts.push('Group '+escapeHtml(p ? p.label : '?')+(e.startMs != null ? ' <small>('+escapeHtml(bpClock(e.startMs))+')</small>' : ''));
    });
    if(finals) parts.push('Finals ('+finals+' match'+(finals === 1 ? '' : 'es')+')');
    return '<div style="display:flex;gap:14px;padding:8px 0;border-bottom:1px solid #d7dce1;font-size:13px"><b style="min-width:70px">Board '+escapeHtml(b)+'</b><span>'+parts.join(' → ')+'</span></div>';
  }).join('');
  return bpSheetShell(t, 'BOARDS', 'Groups in the order they play', '<div style="margin-top:10px">'+rows+'</div>');
}
function playersSheetToggleHTML(){
  return '<div class="toggle-row"><input type="checkbox" id="playersSheetToggle" '+(state.printSettings.playersSheetEnabled !== false ? 'checked' : '')+' onchange="togglePlayersSheet(this.checked)"> <label for="playersSheetToggle">Include the Players A–Z sheet (name, group and board, for the wall)</label></div>';
}
function boardsSheetToggleHTML(){
  return '<div class="toggle-row"><input type="checkbox" id="boardsSheetToggle" '+(state.printSettings.boardsSheetEnabled !== false ? 'checked' : '')+' onchange="toggleBoardsSheet(this.checked)"> <label for="boardsSheetToggle">Include the Boards sheet (which groups play on each board)</label></div>';
}
function togglePlayersSheet(v){ state.printSettings.playersSheetEnabled = v; persist(); render(); }
function toggleBoardsSheet(v){ state.printSettings.boardsSheetEnabled = v; persist(); render(); }
```

- [ ] **Step 4: Wire into Stage 7 and printing**

In `pods-ui.js` `podsStage7`, change:

```js
    rulesSheetToggleHTML()+(built ? koPaperSizeSelectHTML() : '')+
```

to:

```js
    rulesSheetToggleHTML()+playersSheetToggleHTML()+boardsSheetToggleHTML()+(built ? koPaperSizeSelectHTML() : '')+
```

In `podsPrintClick`, after the rules sheet line:

```js
  if(t.printSettings.rulesSheetEnabled) html += rulesSheetHTML();
  if(t.printSettings.playersSheetEnabled !== false) html += bpPlayersSheetsHTML(t);
  if(t.printSettings.boardsSheetEnabled !== false) html += bpBoardsSheetHTML(t);
```

- [ ] **Step 5: Run to verify it passes**

Run: `node --test tests/boardplan-print.test.js`
Expected: PASS, 6 tests. If the 120-player test shows a different sheet count, check that `makeTournament(app, 120, ...)` gave 120 active players with 16 confirmed groups (120 rows / 50 per sheet = 3 sheets).

- [ ] **Step 6: Checkpoint**

Run: `npm test`
Expected: everything passes, including the existing `tests/pods-ui-print.test.js` (it only checks that group sheets and the Finals are present, so the two extra sheets do not disturb it).

---

### Task 6: Viewer — Boards tab and TV mode

**Files:**
- Modify: `viewer/index.html` (tabs, routing, render, new functions), `viewer/theme.css`
- Test: `tests/viewer-boards.test.js`

**Interfaces:**
- Consumes: `state.boardPlan` (published, Task 3); existing viewer helpers `bracketForKey(key)`, `entryName(id)`, `koRoundName(b, ri)`, `escapeHtml`, `el`, `clockLabel`.
- Produces: `bpIndex()`, `bpMatchInfo(key, ri, mi)`, `bpKeyOf(bracket)`, `estLabel(ms)`, `bpMatchText(e)`, `bpWhereText(e)`, `boardCardHTML(b, entries)`, `boardsTabHTML(tv)`, `TV_PER_PAGE = 6`, `tvPage`; `availableTabs()` includes `'boards'`; `currentRoute()` returns `{name, tv}`.

- [ ] **Step 1: Write the failing tests**

Create `tests/viewer-boards.test.js`:

```js
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/viewer-boards.test.js`
Expected: FAIL (`boardsTabHTML is not defined`, tabs missing).

- [ ] **Step 3: Add the board-schedule functions to `viewer/index.html`**

Insert after the `bracketForKey` function:

```js
/* ---------- Board schedule (Group Boards): the plan comes ready-made from the organiser in state.boardPlan ---------- */
var _bpIdxFor = null, _bpIdx = null;
/* "key|round|match" -> { board, e (the plan entry), ahead (not-done entries before it on its board) } */
function bpIndex(){
  var bp = state.boardPlan;
  if(!bp || !bp.boards) return {};
  if(_bpIdxFor === bp) return _bpIdx;
  var idx = {};
  Object.keys(bp.boards).forEach(function(b){
    var ahead = 0;
    bp.boards[b].forEach(function(e){
      idx[e.key+'|'+e.ri+'|'+e.mi] = { board:b, e:e, ahead:(e.status === 'done' ? 0 : ahead) };
      if(e.status !== 'done') ahead++;
    });
  });
  _bpIdxFor = bp; _bpIdx = idx;
  return idx;
}
function bpMatchInfo(key, ri, mi){ return bpIndex()[key+'|'+ri+'|'+mi] || null; }
/* The plan key of a bracket object: 'ko' for the Finals, 'pod:<id>' for a group. */
function bpKeyOf(b){
  if(!b) return null;
  if(b === state.knockout) return 'ko';
  var p = (state.pods||[]).find(function(x){ return x.bracket === b; });
  return p ? 'pod:'+p.id : null;
}
function estLabel(ms){ return '~'+new Date(ms).toLocaleTimeString([], {hour:'numeric', minute:'2-digit'}); }
function bpMatchOfEntry(e){ var b = bracketForKey(e.key); return b && b.rounds[e.ri] ? b.rounds[e.ri][e.mi] : null; }
function bpSideText(m, side){
  var id = m[side+'EntryId'], from = m[side+'FromPod'];
  if(id) return entryName(id);
  if(from){ var p = (state.pods||[]).find(function(x){ return x.id===from; }); return 'Winner of Group '+(p ? p.label : '?'); }
  return 'To be decided';
}
function bpMatchText(e){ var m = bpMatchOfEntry(e); return m ? bpSideText(m, 'a')+' v '+bpSideText(m, 'b') : ''; }
function bpWhereText(e){
  var b = bracketForKey(e.key), round = b ? koRoundName(b, e.ri) : '';
  if(e.key==='ko') return 'Finals · '+round;
  var p = (state.pods||[]).find(function(x){ return 'pod:'+x.id===e.key; });
  return 'Group '+(p ? p.label : '?')+' · '+round;
}
function boardCardHTML(b, entries){
  var pending = entries.filter(function(e){ return e.status !== 'done'; });
  var up = pending[0], more = pending.slice(1, 3), rest = pending.length - 1 - more.length;
  var html = '<section class="card bcard"><h2>Board '+escapeHtml(b)+' <span class="sub">'+(pending.length ? pending.length+' to play' : 'Finished')+'</span></h2>';
  if(!up) return html+'<p class="empty">All matches on this board are finished.</p></section>';
  var head = up.called ? 'Called — go to Board '+b : (up.ready ? 'Up now' : 'Waiting for an earlier match');
  html += '<div class="bup'+(up.called ? ' called' : '')+'"><b>'+escapeHtml(head)+'</b>'+
    '<div class="bm">'+escapeHtml(bpMatchText(up))+'</div><div class="note">'+escapeHtml(bpWhereText(up))+'</div></div>';
  more.forEach(function(e){
    html += '<div class="bnext"><span><b>Next</b> '+escapeHtml(bpMatchText(e))+'<span class="note"> · '+escapeHtml(bpWhereText(e))+'</span></span>'+
      '<span class="bt">'+(e.estMs != null ? escapeHtml(estLabel(e.estMs)) : '')+'</span></div>';
  });
  if(rest > 0) html += '<p class="note" style="margin:8px 0 0">'+rest+' more after these</p>';
  return html+'</section>';
}
var TV_PER_PAGE = 6, tvPage = 0, tvTimer = null;
function boardsTabHTML(tv){
  var bp = state.boardPlan;
  var nums = Object.keys((bp && bp.boards) || {}).sort(function(a, b){ return a - b; });
  if(!nums.length) return '<section class="card"><p class="empty">The board schedule isn\'t available yet.</p></section>';
  var pages = 1, list = nums;
  if(tv){
    pages = Math.max(1, Math.ceil(nums.length / TV_PER_PAGE));
    var page = tvPage % pages;
    list = nums.slice(page * TV_PER_PAGE, (page + 1) * TV_PER_PAGE);
  }
  var head = tv && pages > 1 ? '<p class="note tvpage">Page '+((tvPage % pages) + 1)+' of '+pages+'</p>' : '';
  return head+'<div class="bgrid">'+list.map(function(b){ return boardCardHTML(b, bp.boards[b]); }).join('')+'</div>';
}
```

- [ ] **Step 4: Tabs, routing and rendering**

Replace `availableTabs`, `currentRoute` and `TAB_LABEL` in `viewer/index.html`:

```js
function availableTabs(){
  var t = [], hasGroups = state.format.formatType!=='knockout' && (state.groups||[]).length, hasKo = !!(state.knockout || state.knockoutLosers || (state.pods||[]).length);
  if(!hasGroups && !hasKo) return t;
  if(state.entriesList.length){ t.push('me'); t.push('following'); }
  if(hasGroups) t.push('groups');
  if(state.format.formatType==='podknockout' && state.boardPlan && Object.keys(state.boardPlan.boards||{}).length) t.push('boards');
  if(hasKo) t.push('bracket');
  return t;
}
```

```js
function currentRoute(tabs){
  var raw = (location.hash||'').replace(/^#\/?/, ''), tv = /[?&]tv=1(&|$)/.test(raw), h = raw.split('?')[0], m = /^p\/(.+)$/.exec(h);
  if(m){ var pid; try{ pid = decodeURIComponent(m[1]); }catch(e){ pid = m[1]; } return {name:'p', id:pid}; }
  var name = tabs.indexOf(h)!==-1 ? h : defaultTab(tabs);
  return {name:name, tv:(tv && name==='boards')};
}
var TAB_LABEL = {me:'Me', following:'Following', groups:'Groups', boards:'Boards', bracket:'Bracket'};
```

In `render()`, add the Boards body and TV handling. After `else if(r.name==='groups') ...`:

```js
  else if(r.name==='boards') body = boardsTabHTML(!!r.tv);
```

and after `el('nav').hidden = false; el('finderWrap').hidden = !state.entriesList.length;` replace those two statements with:

```js
  document.body.classList.toggle('tv', !!r.tv);
  el('nav').hidden = !!r.tv; el('finderWrap').hidden = !!r.tv || !state.entriesList.length;
  if(typeof setInterval === 'function'){
    if(r.tv && !tvTimer) tvTimer = setInterval(function(){ tvPage++; if(state) render(); }, 12000);
    if(!r.tv && tvTimer){ clearInterval(tvTimer); tvTimer = null; }
  }
```

- [ ] **Step 5: Styles**

Append to `viewer/theme.css`:

```css
/* Boards tab and TV mode */
.bgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}
.bgrid .bcard{margin:0}
.bcard h2 .sub{font-size:13px;font-weight:600;color:var(--muted);margin-left:6px}
.bup{padding:12px;border-radius:12px;background:var(--paper2);border:1px solid var(--line);border-left:3px solid var(--blue)}
.bup.called{background:var(--gold-tint);border-color:var(--gold-line);border-left-color:var(--gold)}
.bup .bm{font-size:16px;margin-top:4px}
.bnext{display:flex;justify-content:space-between;gap:10px;padding:9px 0;border-top:1px solid var(--line);font-size:14px}
.bnext .bt{white-space:nowrap;color:var(--muted)}
.tvpage{text-align:right;margin:0 0 6px}
body.tv .bgrid{grid-template-columns:repeat(3,1fr);gap:18px}
body.tv .bcard{font-size:22px}
body.tv .bup .bm{font-size:26px}
body.tv .bnext{font-size:20px}
@media (max-width:900px){body.tv .bgrid{grid-template-columns:repeat(2,1fr)}}
```

- [ ] **Step 6: Run to verify it passes**

Run: `node --test tests/viewer-boards.test.js`
Expected: PASS, 8 tests. The test for the 64-player TV page expects 16 boards and `class="card bcard` to appear once per board card (`<section class="card bcard">`).

- [ ] **Step 7: Checkpoint**

Run: `npm test`
Expected: everything passes.

---

### Task 7: Viewer — player lines, group start times, Finals boards

**Files:**
- Modify: `viewer/index.html`, `viewer/theme.css`
- Test: `tests/viewer-boards.test.js` (append)

**Interfaces:**
- Consumes: Task 6 functions (`bpIndex`, `bpMatchInfo`, `bpKeyOf`, `estLabel`), `koLines(id)`, `playerPageHTML`, `matchesHTML`, `rsMatchHTML`, `podsAllHTML`, `podsBracketTabHTML`.
- Produces: `bpPlayerNext(id)`, `boardLineHTML(id)`, `podStartLine(p)`.

- [ ] **Step 1: Write the failing tests** (append to `tests/viewer-boards.test.js`)

```js
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/viewer-boards.test.js`
Expected: FAIL (`boardLineHTML is not defined`).

- [ ] **Step 3: Implement in `viewer/index.html`**

Add after `boardsTabHTML`:

```js
/* The player's next not-done match on any board: { board, ahead, e }, or null. */
function bpPlayerNext(id){
  var bp = state.boardPlan, best = null;
  if(!bp || !bp.boards) return null;
  Object.keys(bp.boards).forEach(function(b){
    var ahead = 0;
    bp.boards[b].forEach(function(e){
      if(e.status === 'done') return;
      var m = bpMatchOfEntry(e);
      if(m && (m.aEntryId === id || m.bEntryId === id) && (!best || ahead < best.ahead)) best = { board:b, ahead:ahead, e:e };
      ahead++;
    });
  });
  return best;
}
function boardLineHTML(id){
  var n = bpPlayerNext(id);
  if(!n) return '';
  var text;
  if(n.e.called) text = 'Called — go to Board '+n.board;
  else if(n.e.status === 'up') text = n.e.ready ? 'Up now on Board '+n.board : 'Board '+n.board+' · waiting for an earlier match';
  else text = 'Board '+n.board+' · '+n.ahead+(n.ahead === 1 ? ' match' : ' matches')+' ahead'+(n.e.estMs != null ? ' · '+estLabel(n.e.estMs) : '');
  return '<div class="pboard'+(n.e.called ? ' called' : '')+'">'+escapeHtml(text)+'</div>';
}
/* "starts ~7:10 pm" for a group that has not begun and has an estimate; empty otherwise. */
function podStartLine(p){
  var bp = state.boardPlan;
  if(!bp || !bp.boards) return '';
  var key = 'pod:'+p.id, est = null, started = false;
  Object.keys(bp.boards).forEach(function(b){ bp.boards[b].forEach(function(e){
    if(e.key !== key) return;
    if(e.status === 'done' || e.status === 'up') started = true;
    if(e.estMs != null && (est == null || e.estMs < est)) est = e.estMs;
  }); });
  return (!started && est != null) ? 'starts '+estLabel(est) : '';
}
```

Player page: in `playerPageHTML`, after the `'<div class="pstatus">'+escapeHtml(statusLine(id))+'</div>'+` line add `boardLineHTML(id)+`.

Group start times: in `podsAllHTML`, change the `note` span to:

```js
      '<span class="note">'+(p.boards && p.boards.length ? 'Board '+p.boards.join(', ')+' · ' : '')+p.entryIds.length+' players'+(podStartLine(p) ? ' · '+escapeHtml(podStartLine(p)) : '')+'</span>'+
```

In `podsBracketTabHTML`, change the group card title to:

```js
  else html += bracketCardHTML(sel.bracket, 'pod:'+sel.id, 'Group '+sel.label+(sel.boards && sel.boards.length ? ' · Board '+sel.boards.join(', ') : '')+(podStartLine(sel) ? ' · '+podStartLine(sel) : ''));
```

Finals boards in match rows: in `matchesHTML`, replace the row line that builds `'<div class="mrow"><span>'+escapeHtml(l.round)+...` so the round and note are followed by the board. Change:

```js
    rows.push('<div class="mrow"><span>'+escapeHtml((state.format.formatType==='podknockout' ? l.title+' · ' : '')+l.round)+' <span class="note">'+escapeHtml(l.tag)+'</span>'+
```

to:

```js
    var info = bpMatchInfo(bpKeyOf(l.b), l.ri, l.mi);
    rows.push('<div class="mrow"><span>'+escapeHtml((state.format.formatType==='podknockout' ? l.title+' · ' : '')+l.round)+' <span class="note">'+escapeHtml(l.tag)+'</span>'+(info ? ' · Board '+escapeHtml(info.board) : '')+
```

In `rsMatchHTML`, replace the header span line:

```js
  return '<div class="rm'+(mine ? ' me' : fol ? ' fol' : '')+'"><div class="rmh"><span class="mtag">'+escapeHtml(tag)+'</span>'+status+'</div>'+
```

with:

```js
  var info = bpMatchInfo(bpKeyOf(b), ri, mi);
  return '<div class="rm'+(mine ? ' me' : fol ? ' fol' : '')+'"><div class="rmh"><span class="mtag">'+escapeHtml(tag)+'</span>'+(info ? '<span class="mbd">Board '+escapeHtml(info.board)+'</span>' : '')+status+'</div>'+
```

(`var info` goes immediately before the `return` in `rsMatchHTML`.)

Styles, appended to `viewer/theme.css`:

```css
.pboard{margin:8px 0 0;padding:10px 14px;border-radius:12px;background:var(--blue-tint);border:1px solid var(--line);font-size:15px;font-weight:600}
.pboard.called{background:var(--gold-tint);border-color:var(--gold-line);color:var(--gold-text)}
.mbd{font-size:12px;color:var(--muted);margin-left:8px}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/viewer-boards.test.js`
Expected: PASS (all tests in the file). If the `matchesHTML` regex does not match, print the row HTML and confirm the order: round, note tag, then ` · Board N`.

- [ ] **Step 5: Checkpoint**

Run: `npm test` and `npm run check-viewer`
Expected: everything passes; `check-viewer` prints `ok` for both files.

---

### Task 8: Scale, regression, documentation

**Files:**
- Modify: `tests/scale.test.js` (append), `README.md`
- Test: the full suite

**Interfaces:**
- Consumes: everything above.
- Produces: README section and the scale guarantee.

- [ ] **Step 1: Add the scale test** (append to `tests/scale.test.js`; reuse its existing imports and helpers: read the file's top first and follow its pattern for building the 540-player, 64-group event)

```js
test('building the board plan for 540 players in 64 groups is fast and stays small', () => {
  const t = makeTournament(app, 540, { pods: 64, boards: 32 }); useState(app, t);
  t.format.anticipatedStartTime = '10:00';
  app.persist = () => {}; app.render = () => {};
  run(app, 'generatePods')(t, seededRng(9)); run(app, 'podsConfirmAll')(t);
  const t0 = Date.now();
  const plan = run(app, 'buildBoardPlan')(t);
  const ms = Date.now() - t0;
  assert.ok(ms < 1000, 'took ' + ms + ' ms');
  assert.equal(Object.keys(plan.boards).length, 32);
  const size = JSON.stringify(plan).length;
  assert.ok(size < 400000, 'plan is ' + size + ' bytes');
  run(app, 'stampDoneTimes')(t);                         // also fast on a big event
});
```

(If `scale.test.js` does not already import `useState`, `seededRng` and `makeTournament`, add them to its `require('./lib/helpers')` line.)

- [ ] **Step 2: Run the whole suite and the viewer check**

Run: `npm test` then `npm run check-viewer`
Expected: all tests pass (the original 122, plus the new ones from Tasks 1 to 8); both viewer files `ok`.

- [ ] **Step 3: Add the README section**

In `README.md`, under the Group Boards section, add:

```markdown
### Board schedule

For Group Boards events the organiser keeps a board plan (`boardplan.js`): each board's
queue of matches, groups in order and then the Finals, with who is **up now** and **next**.
Set an **anticipated start time** in Format & branding to add estimated times; they are
labelled "~", rounded to 5 minutes, and re-based on when results were really entered.

- **Manage tournament → Boards:** per-board cards with **Call**, **Enter result** and
  **No-show**, and a Finals boards box so the final can go on a feature board.
- **Public results:** a **Boards** tab (and a TV view at `<viewer>/live/<code>#/boards?tv=1`
  that pages through six boards at a time), a "Board 3 · 2 matches ahead · ~7:40 pm" line on
  player pages, and a start time on each group.
- **Print:** optional **Players A–Z** and **Boards** sheets for the wall (toggles in Print).

The plan is rebuilt on every save and stored with the tournament; the viewer only displays it.
Deploy the organiser first, then the viewer (each deploys from `main`). An older tournament
gets its plan on its next save, and the viewer hides the Boards tab until then.
```

- [ ] **Step 4: Manual check in the browser (organiser and viewer)**

Run the existing mock tools in `tests/dev/` (they build a sample event without a database): `node tests/dev/mock-organiser.js` and `node tests/dev/mock-viewer.js` (read each file's header for how it starts and which port it prints). Then, in the browser pane, check:
1. Organiser: a Group Boards event with a start time shows the Boards panel in Manage; Call turns the entry into "Called" and Uncall reverses it; the Finals boards box accepts a number.
2. Print: both new sheets appear in the print preview, and unticking a toggle removes its sheet.
3. Viewer: the Boards tab shows cards; `#/boards?tv=1` hides the tabs and search and enlarges the cards; a player page shows the board line; a called match shows the gold "Called" line.
Fix anything that looks wrong test-first, then re-run `npm test`.

- [ ] **Step 5: Checkpoint**

Run: `npm test` and `npm run check-viewer`
Expected: all green. Report the final test count, anything left over, and ask the user whether to commit (two commits: organiser side and viewer side) and push.

---

## Self-review

**Spec coverage**

| Spec section | Task |
|---|---|
| Data (`doneAt`, `called`, `calledAt`, `board`, `boardPlan`, print settings) | 1, 2, 4, 5 |
| Building the plan, statuses, `ready`, re-basing, Finals boards, no start time | 1 |
| Stamping results | 1 (function), 2 (on every save, including no-show) |
| Organiser Boards panel, Call, Finals board field, "times are off" note | 4 |
| Viewer Boards tab, TV mode, `?tv=1` | 6 |
| Viewer Me and player lines, group start times, Finals boards | 7 |
| Print: Players A–Z, Boards, toggles | 5 |
| Public view whitelist (`boardPlan`, `called`, `board`; no `doneAt`/`calledAt`) | 3 |
| Backward compatibility (no plan, old viewer, old tournaments, deploy order) | 2, 3, 6 (no-plan test), 8 (README) |
| Testing list (plan, re-basing, statuses, stamping, public view, viewer, print, scale, golden) | 1–8; golden runs in every checkpoint |
| Risks (estimates, "Up now" wording, stored derived data) | 4, 6, 7 wording; panel rebuilds the plan live so it never shows a stale copy |

**Deviations from the spec, all small:** the panel and print sheets call `buildBoardPlan` live rather than reading the stored copy, so they cannot show stale data (the stored copy exists for publishing); the `starts` option on `buildBoardPlan` is added to the spec's print section.

**Placeholder scan:** no TBD, TODO or "similar to" steps; every code step has the code.

**Type consistency:** plan entry fields `key, ri, mi, status, ready, estMs, called` (and `startMs` with `{starts:true}`) are the same in Tasks 1, 3, 4, 5, 6 and 7. The Finals key is `'ko'` in plan entries and `'knockout'` for organiser calls, translated by `bpOrgKey` (Task 4) and `bpBracket` (Task 1). `buildBoardPlan`, `stampDoneTimes`, `bpRound5` and `bpBracket` are defined in Task 1 and used by name later.

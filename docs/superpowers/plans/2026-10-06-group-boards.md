# Group Boards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fourth tournament format, "Group Boards": the event is dealt into many small knockout groups, each on its own board, and the group winners feed one Finals bracket.

**Architecture:** New pure logic in `pods.js` (internal name `pods`; organisers and spectators see "Groups") and new screens in `pods-ui.js`, each loaded as a classic script before the main script in `index.html`, with thin `if(formatType==='podknockout')` branches in the existing stage functions. A group's bracket reuses the existing knockout match shape, engine and chart drawing; the Finals is the existing `state.knockout` whose first-round slots carry `aFromPod`/`bFromPod` placeholders. The public API and viewer gain an allow-listed `pods` list.

**Tech Stack:** Plain HTML/JS (no build step), Node 20+ built-in `node:test` for tests, Vercel serverless API (viewer), existing Neon-backed organiser API (unchanged).

**Spec:** `docs/superpowers/specs/2026-10-06-group-boards-design.md`. Read it first; this plan implements it.

## Global Constraints

- **Names.** Anything an organiser or spectator reads says **Group** ("Group 1", "Draw groups", "Winner of Group 5"). Code uses `pods`: `state.pods`, `generatePods`, `podCount`, `podLegs`, `aFromPod`, `bFromPod`, bracket key `pod:<id>`. Never put new groups into `state.groups`; that holds round-robin groups (lettered).
- **Format value:** `format.formatType === 'podknockout'`, label **Group Boards**.
- **Limits:** `podCount` between 2 and 128 (`PODS_MAX`, the existing chart limit); at least 2 players per group (players >= 2 x `podCount`).
- **Advancing:** the group winner only. Finals size is the next power of two at or above `podCount`.
- **Finals timing:** the Finals is generated when the last group is confirmed; groups may start before that.
- **Pod match tags:** `G<group number>·<round>-<match>` (for example `G5·2-1`). Finals and existing brackets keep today's tags.
- **Existing formats must not change.** Round robin, Knockout and Round robin then knockout must render identically. The snapshot test from Task 1 must pass after every task.
- **Shared drawing code.** `render.js` and `render.css` are copied to `viewer/`. After editing either, run `npm run sync-viewer`. Edits to them must keep default output identical when the new fields are absent.
- **Viewer privacy.** The public view stays an allow-list (`viewer/api/_lib/publicView.js`). Only fields named there are published.
- **Draws of 32+ players** open in the Rounds view on every screen size in the viewer.
- **No commits unless the user asks.** The user commits and pushes only on request. Each task ends with a "Checkpoint" step (run `npm test`, show `git status`) instead of a commit. When the user does ask, commit with the trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- **Style.** Match the surrounding code: classic scripts, `function` declarations, `var`/`const` as the neighbouring file does, no build tooling, no new dependencies.

## Review Focus

Inputs and conditions the spec implies that a person using this will hit, most likely first. Each has a test in the task that owns the code.

1. **A group count that is not a power of two** (for example 5 or 40 groups): Finals byes must go to the strongest groups and every placeholder must read "Winner of Group N" (Task 4 test).
2. **Too few players, or withdrawn players** (for example 7 players for 4 groups; withdrawn entries): validation message, and withdrawn entries are never drawn (Task 2 tests).
3. **Correcting a group result after the Finals has started**: refused with a clear message and the result is left unchanged; allowed when nothing downstream is scored (Task 4 tests).
4. **Tournaments saved before this feature, and switching format back and forth**: a tournament with no `pods` field must open and render in every existing format, and switching to Group Boards on it must not throw (Task 1 snapshot, Task 7 test).
5. **A 540-player event with 64 groups**: the draw must finish in well under a second and the 64-group manage screen must stay usable (Task 13 test).

## File Structure

| File | Responsibility |
|---|---|
| `pods.js` (new) | Pure Group Boards logic: validation, draw, hand moves, Finals build, result flow, confirm, progress, estimate. No DOM. Fully unit-tested. |
| `pods-ui.js` (new) | Organiser screens and click handlers for stages 2 to 7 (HTML-string builders and handlers). No game logic. |
| `index.html` (modify) | `<script>` tags; defaults in `blankTournament`; thin branches in `stage2`...`stage7`, `computeStageFor`, `formatSummaryCard`, `formatDescriptionLines`, `schedulingContextHTML`, `estimateTotalMinutes`, `competitionDurationSummaryHTML`, `blockForUnresolvedTies`, `doFinalPrint`, `legsForKnockoutRound`, score entry and no-show functions, `knockoutBracketSheetHTML`. |
| `render.js` (modify) + `viewer/render.js` (synced copy) | "Winner of Group N" placeholder slots and `G<n>·` match tags. |
| `viewer/api/_lib/publicView.js` (modify) | Publish `pods` and the placeholder fields. |
| `viewer/index.html`, `viewer/theme.css` (modify) | Group picker, group cards, status lines, Rounds default for big draws. |
| `tests/lib/load-app.js`, `tests/lib/helpers.js` (new) | Load the whole app into Node with a stubbed browser; shared test builders. |
| `tests/*.test.js` (new) | One test file per area. |
| `tests/dev/mock-organiser.js`, `tests/dev/mock-viewer.js` (new, Task 13) | Local servers for checking screens in a browser without Neon or Vercel. |
| `package.json` (modify) | `"test": "node --test"`. |

---

### Task 1: Test harness and a snapshot of the existing formats

**Files:**
- Create: `tests/lib/load-app.js`
- Create: `tests/golden.test.js`
- Create: `tests/golden/existing-formats.json` (generated)
- Modify: `package.json` (add `scripts.test`)

**Interfaces:**
- Produces: `loadApp(extraFiles?: string[]) -> ctx` loads `render.js`, then each existing file in `['pods.js','pods-ui.js']`, then every inline `<script>` of `index.html`, into a Node `vm` context with a stubbed browser, a seeded `Math.random` and a frozen `Date`. All top-level `function` declarations are available as `ctx.<name>`; top-level `let`/`const` (such as `state`) are reached with `run(ctx, 'state')`.
- Produces: `run(ctx, code: string) -> any` evaluates `code` in the context. Also exports `anything()`, `stubDocument` and `seededMath(seed)` for the viewer loader (Task 12). `hash(str) -> 12-hex string` after replacing random ids with `ID`. `ROOT` repo path.

- [ ] **Step 1: Create the loader**

Write `tests/lib/load-app.js`:

```js
// Loads the organiser app (render.js, optional pods files, then index.html's inline scripts) into a
// Node vm context with a stubbed browser, so the real functions can be tested.
const fs = require('fs'), vm = require('vm'), path = require('path'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..', '..');

// A stand-in that accepts any property read or call (document, window, ...).
function anything() {
  const fn = function () { return anything(); };
  return new Proxy(fn, {
    get: (t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'length' ? 0 : k === 'then' ? undefined : anything()),
    apply: () => anything(), construct: () => anything(), set: () => true,
  });
}
// document: any property works, and canvas text measuring returns a fixed width per character.
const stubDocument = new Proxy(function () {}, {
  get: (t, k) => (k === 'createElement'
    ? (tag) => (tag === 'canvas' ? { getContext: () => ({ font: '', measureText: (s) => ({ width: String(s).length * 7 }) }) } : anything())
    : k === Symbol.toPrimitive ? () => '' : k === 'length' ? 0 : k === 'then' ? undefined : anything()),
  apply: () => anything(), set: () => true,
});
function seededMath(seed) {
  let s = seed >>> 0;
  const m = Object.create(Math);
  m.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  return m;
}
const FIXED = Date.UTC(2026, 9, 6, 9, 0, 0);
class FixedDate extends Date {
  constructor(...a) { if (a.length) super(...a); else super(FIXED); }
  static now() { return FIXED; }
}

function loadApp(extraFiles) {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const ctx = {
    console, Math: seededMath(12345), JSON, Date: FixedDate, Array, Object, String, Number, Set, Map, Intl,
    parseInt, parseFloat, isNaN, setTimeout, clearTimeout, crypto: crypto.webcrypto,
    document: stubDocument, window: anything(), navigator: anything(), localStorage: anything(),
    location: anything(), fetch: async () => ({}),
  };
  vm.createContext(ctx);
  const files = ['render.js'].concat(['pods.js', 'pods-ui.js'].filter((f) => fs.existsSync(path.join(ROOT, f)))).concat(extraFiles || []);
  files.forEach((f) => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f }));
  scripts.forEach((s, i) => vm.runInContext(s, ctx, { filename: 'index.html#' + i }));
  return ctx;
}
const run = (ctx, code) => vm.runInContext(code, ctx);
const norm = (s) => String(s).replace(/\b(?:t|kb|km|g|pod|e|inc)_[a-z0-9]{5,}\b/g, 'ID');
const hash = (s) => crypto.createHash('md5').update(norm(s)).digest('hex').slice(0, 12);

module.exports = { loadApp, run, hash, norm, ROOT, anything, stubDocument, seededMath };
```

- [ ] **Step 2: Write the failing snapshot test**

Write `tests/golden.test.js`. It builds one tournament per existing format, renders the screens and format helpers that exist today, and compares their hashes to a stored file. Run with `UPDATE_GOLDEN=1` to (re)write the file.

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { loadApp, run, hash, ROOT } = require('./lib/load-app');

const GOLDEN = path.join(__dirname, 'golden', 'existing-formats.json');

function people(n) {
  return Array.from({ length: n }, (_, i) => ({ id: 'e' + i, name: 'Player ' + (i + 1), org: i % 3 ? 'KLDA' : 'PDA', players: [], withdrawn: false }));
}
function build(app, kind) {
  const t = run(app, 'blankTournament')();
  t.eventCreation.saved = true; t.eventCreation.tournamentName = 'Test Open'; t.eventCreation.eventName = 'Singles';
  t.eventCreation.entries = kind === 'ko' ? 11 : 12;
  t.format.saved = true; t.format.formatType = kind === 'rr' ? 'roundrobin' : kind === 'ko' ? 'knockout' : 'rrknockout';
  t.entriesList = people(t.eventCreation.entries);
  app.__t = t;
  if (kind === 'ko') {
    t.format.seedingEnabled = true; t.format.numSeeds = 8;
    run(app, 'ensureSeedOrder(__t)');
    app.__o = t.seedOrder.map((id) => ({ entryId: id, org: t.entriesList.find((e) => e.id === id).org }));
    t.knockout = run(app, 'generateBracket(__o, "Bracket")');
  } else {
    run(app, 'buildGroups(__t)');
    t.groups.forEach((g) => { g.confirmed = true; });
  }
  return t;
}
function snapshot() {
  const out = {};
  ['rr', 'ko', 'rrko'].forEach((kind) => {
    const app = loadApp(); const t = build(app, kind); run(app, 'state = __t');
    const parts = {};
    [3, 4, 6, 7].forEach((n) => { app.__n = n; run(app, 'currentStage = __n'); parts['stage' + n] = hash(run(app, 'stage' + n + '()')); });
    ['formatSummaryCard()', 'JSON.stringify(formatDescriptionLines(state))', 'schedulingContextHTML()', 'competitionDurationSummaryHTML(state)', 'String(estimateTotalMinutes(state))']
      .forEach((c, i) => { parts['helper' + i] = hash(run(app, c)); });
    if (kind === 'ko') {
      app.__k = t.knockout;
      parts.chart = hash(run(app, 'mirroredChartHTML(__k, __t, {interactive:false})'));
      parts.sheet = hash(run(app, 'knockoutBracketSheetHTML(__k)'));
    }
    else parts.standings = hash(t.groups.map((g) => { app.__g = g; return run(app, 'standingsTableHTML(__g, computeStandings(__g))'); }).join(''));
    out[kind] = parts;
  });
  return out;
}

test('existing formats render exactly as the stored snapshot', () => {
  const now = snapshot();
  if (process.env.UPDATE_GOLDEN || !fs.existsSync(GOLDEN)) {
    fs.mkdirSync(path.dirname(GOLDEN), { recursive: true });
    fs.writeFileSync(GOLDEN, JSON.stringify(now, null, 2) + '\n');
  }
  assert.deepEqual(now, JSON.parse(fs.readFileSync(GOLDEN, 'utf8')));
});
test('the snapshot is deterministic', () => { assert.deepEqual(snapshot(), snapshot()); });
test('a tournament saved before Group Boards (no pods field) still renders in every existing format', () => {
  const app = loadApp();
  ['roundrobin', 'knockout', 'rrknockout'].forEach((f) => {
    const t = run(app, 'blankTournament')();
    delete t.pods; t.format.formatType = f; t.eventCreation.saved = true; t.format.saved = true; t.entriesList = people(8);
    app.__t = t; run(app, 'state = __t');
    [3, 4, 5, 6, 7].forEach((n) => { app.__n = n; run(app, 'currentStage = __n'); assert.doesNotThrow(() => run(app, 'stage' + n + '()'), f + ' stage ' + n); });
  });
});
```

- [ ] **Step 3: Add the npm script and run to see the tests fail then create the snapshot**

In `package.json`, add `"test": "node --test"` inside `"scripts"` (the object already has `sync-viewer` and `check-viewer`).

Run: `npm test`
Expected: the first test writes `tests/golden/existing-formats.json` (it is created when missing) and passes; the other two pass. If any of the `stageN()` calls throws `Cannot read properties of undefined`, the existing function needs a browser feature the stub does not give: add the missing name to the stubbed context in `load-app.js` (for example another global) and re-run.

- [ ] **Step 4: Prove it catches a change**

Temporarily edit `index.html`: in `formatSummaryCard`, change the text `Best of` to `Best off`. Run `npm test`. Expected: the snapshot test FAILS. Revert the edit and run `npm test` again; expected: all pass.

- [ ] **Step 5: Checkpoint**

Run: `npm test` (all pass) and `git status --short` (new: `tests/`, `package.json` modified).

---

### Task 2: Group draw logic (`pods.js`, part 1)

**Files:**
- Create: `pods.js`
- Create: `tests/lib/helpers.js`
- Create: `tests/pods-draw.test.js`
- Modify: `index.html` (add `<script src="pods.js"></script>` right after the existing `<script src="render.js"></script>` line)

**Interfaces:**
- Consumes (from `index.html`/`render.js`, called at run time): `ensureSeedOrder(t)`, `generateBracket(orderedEntries, label)`, `uid(prefix)`.
- Produces in `pods.js`:
  - `PODS_MAX = 128`
  - `podsList(t) -> pod[]` (creates `t.pods = []` when missing)
  - `podsPlayerCount(t) -> number`
  - `podsValidate(t) -> {ok, message}`
  - `podSizes(n, p) -> number[]`
  - `podsSeededCount(t) -> number`, `podsOverallSeeds(t) -> {entryId: seedNumber}`
  - `podsShuffle(arr, rng) -> arr`
  - `podsDeal(t, rng?) -> string[][]` (entry ids per group)
  - `podsOrgOf(t, id)`, `podsClashPairs(t, ids)`, `podsSeparateClubs(t, groups)`
  - `podsBuildBracket(t, pod)` (sets `pod.entryIds` order, `pod.bracket`, `pod.winnerId = null`)
  - `generatePods(t, rng?) -> {ok, message}` (sets `t.pods`, `t.knockout = null`)
  - `podBoardLabel(pod) -> 'Board 3' | 'Boards 3, 4'`
- A pod is `{ id, label, entryIds, boards, confirmed, bracket, winnerId }`.

- [ ] **Step 1: Write the shared test helpers**

Write `tests/lib/helpers.js`:

```js
const { loadApp, run } = require('./load-app');

function seededRng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

function makeTournament(app, n, opts) {
  opts = opts || {};
  const t = run(app, 'blankTournament')();
  t.eventCreation.saved = true; t.format.saved = true;
  t.format.formatType = 'podknockout'; t.format.podCount = opts.pods || 4; t.format.bestOfLegs = 5;
  t.format.seedingEnabled = !!opts.seeding; t.format.numSeeds = opts.numSeeds || 8; t.format.orgSplit = !!opts.orgSplit;
  t.eventCreation.boards = opts.boards || 64; t.eventCreation.entries = n;
  t.entriesList = Array.from({ length: n }, (_, i) => ({ id: 'e' + i, name: 'Player ' + (i + 1), org: opts.orgOf ? opts.orgOf(i) : '', players: [], withdrawn: false }));
  return t;
}
// Best of 5 means first to 3 legs.
function play(m, side) {
  m.aLegs = side === 'a' ? 3 : 1; m.bLegs = side === 'a' ? 1 : 3; m.winnerId = side === 'a' ? m.aEntryId : m.bEntryId;
}
// Plays every playable match round by round, pushing winners forward.
function playOut(app, bracket, pick) {
  const propagate = run(app, 'propagateByes');
  bracket.rounds.forEach((round) => {
    round.forEach((m) => { if (m.aEntryId && m.bEntryId && !m.winnerId) play(m, pick ? pick(m) : 'a'); });
    propagate(bracket.rounds);
  });
}
// Objects built inside the sandbox have different prototypes, so strict deep-equality needs plain copies.
const plain = (x) => JSON.parse(JSON.stringify(x));
// Makes `t` the app's current tournament (the global `state`).
function useState(app, t) { app.__t = t; run(app, 'state = __t'); }
module.exports = { loadApp, run, plain, useState, seededRng, makeTournament, play, playOut };
```

- [ ] **Step 2: Write the failing draw tests**

Write `tests/pods-draw.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, plain, seededRng, makeTournament } = require('./lib/helpers');

const app = loadApp();
const f = (name) => run(app, name);

test('podSizes splits n players into p groups, sizes differ by at most 1, larger first', () => {
  const s = f('podSizes')(540, 64);
  assert.equal(s.reduce((a, b) => a + b, 0), 540);
  assert.equal(s[0], 9); assert.equal(s[63], 8);
  assert.ok(Math.max(...s) - Math.min(...s) <= 1);
  assert.deepEqual(plain(f('podSizes')(10, 4)), [3, 3, 2, 2]);
});

test('validation: needs 2+ groups, at most 128, and 2+ players per group', () => {
  const v = f('podsValidate');
  assert.equal(v(makeTournament(app, 7, { pods: 4 })).ok, false);
  assert.match(v(makeTournament(app, 7, { pods: 4 })).message, /at most 3 groups/);
  assert.equal(v(makeTournament(app, 300, { pods: 129 })).ok, false);
  assert.equal(v(makeTournament(app, 20, { pods: 1 })).ok, false);
  assert.equal(v(makeTournament(app, 8, { pods: 4 })).ok, true);
  assert.equal(v(makeTournament(app, 8, { pods: 9 }), 4).ok, true);   // a live value overrides the saved one
  assert.equal(v(makeTournament(app, 8, { pods: 4 }), 5).ok, false);
  assert.equal(f('podsValidateCount')(7, 4).ok, false);
  assert.equal(f('podsValidateCount')(8, 4).ok, true);
});

test('withdrawn players are not counted and never drawn', () => {
  const t = makeTournament(app, 10, { pods: 4 });
  t.entriesList[0].withdrawn = true; t.entriesList[1].withdrawn = true;
  assert.equal(f('podsPlayerCount')(t), 8);
  assert.equal(f('generatePods')(t, seededRng(1)).ok, true);
  const drawn = t.pods.flatMap((p) => p.entryIds);
  assert.equal(drawn.length, 8);
  assert.ok(!drawn.includes('e0') && !drawn.includes('e1'));
});

test('540 players into 64 groups: balanced, every top-64 seed in a different group', () => {
  const t = makeTournament(app, 540, { pods: 64, seeding: true, numSeeds: 64 });
  assert.equal(f('generatePods')(t, seededRng(1)).ok, true);
  const sizes = t.pods.map((p) => p.entryIds.length);
  assert.equal(sizes.reduce((a, b) => a + b, 0), 540);
  assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1);
  const groupOfSeed = new Set();
  for (let i = 0; i < 64; i++) groupOfSeed.add(f('podsFindOf')(t, t.seedOrder[i]).id);
  assert.equal(groupOfSeed.size, 64);
});

test('seeds are dealt in a snake so group strength stays balanced', () => {
  const t = makeTournament(app, 16, { pods: 4, seeding: true, numSeeds: 8 });
  f('generatePods')(t, seededRng(2));
  const gIdx = (seed) => t.pods.findIndex((p) => p.entryIds.includes(t.seedOrder[seed - 1]));
  assert.deepEqual([1, 2, 3, 4].map(gIdx), [0, 1, 2, 3]);
  assert.deepEqual([5, 6, 7, 8].map(gIdx), [3, 2, 1, 0]);
});

test('club clash fixing never moves a seeded player and never makes clashes worse', () => {
  const orgOf = (i) => 'club' + (i % 3);
  const split = makeTournament(app, 24, { pods: 4, seeding: true, numSeeds: 4, orgSplit: true, orgOf });
  const plain = makeTournament(app, 24, { pods: 4, seeding: true, numSeeds: 4, orgSplit: false, orgOf });
  f('generatePods')(split, seededRng(7)); f('generatePods')(plain, seededRng(7));
  const clashes = (t) => t.pods.reduce((s, p) => s + f('podsClashPairs')(t, p.entryIds), 0);
  assert.ok(clashes(split) <= clashes(plain));
  for (let i = 0; i < 4; i++) {
    assert.equal(f('podsFindOf')(split, split.seedOrder[i]).label, f('podsFindOf')(plain, plain.seedOrder[i]).label);
  }
  assert.equal(split.pods.reduce((s, p) => s + p.entryIds.length, 0), 24);
});

test('a group of 2 or 3 players still gets a valid bracket', () => {
  const t = makeTournament(app, 10, { pods: 4 });
  f('generatePods')(t, seededRng(4));
  t.pods.forEach((p) => { assert.ok(p.bracket.rounds.length >= 2); assert.equal(p.bracket.podLabel, p.label); });
});

test('boards default to one per group, wrapping when boards are fewer than groups', () => {
  const t = makeTournament(app, 12, { pods: 6, boards: 4 });
  f('generatePods')(t, seededRng(3));
  assert.deepEqual(plain(t.pods.map((p) => p.boards[0])), [1, 2, 3, 4, 1, 2]);
  assert.equal(f('podBoardLabel')(t.pods[0]), 'Board 1');
  assert.equal(f('podBoardLabel')({ boards: [3, 4] }), 'Boards 3, 4');
});

test('only seeded players show a seed number in a group bracket', () => {
  const t = makeTournament(app, 16, { pods: 4, seeding: true, numSeeds: 4 });
  f('generatePods')(t, seededRng(5));
  const all = Object.assign({}, ...t.pods.map((p) => p.bracket.seeds));
  assert.equal(Object.keys(all).length, 4);
  assert.deepEqual(plain(Object.values(all)).sort(), [1, 2, 3, 4]);
});

test('a tournament without a pods field is handled', () => {
  const t = makeTournament(app, 8, { pods: 2 });
  delete t.pods;
  assert.deepEqual(plain(f('podsList')(t)), []);
  assert.ok(Array.isArray(t.pods));
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test tests/pods-draw.test.js`
Expected: FAIL (`podSizes is not defined` or similar, because `pods.js` does not exist).

- [ ] **Step 4: Write `pods.js` (part 1)**

Create `pods.js`:

```js
/* Group Boards: pure logic, no DOM. Loaded after render.js and before the main script in index.html.
   It calls engine functions defined in index.html (ensureSeedOrder, generateBracket, uid, nearestBracket,
   seedSlotOrder, propagateByes, matchDurationMinutes, simulateKnockoutMinutes) and render.js
   (bracketChampion) at call time. Organisers and spectators see these as "Groups"; the internal name is
   "pods" so they never clash with state.groups (round robin). */
var PODS_MAX = 128;

function podsList(t){ if(!t.pods) t.pods = []; return t.pods; }

function podsPlayerCount(t){
  var active = t.entriesList.filter(function(e){ return !e.withdrawn; }).length;
  return t.entriesList.length ? active : (parseInt(t.eventCreation.entries) || 0);
}

/* n players into p groups: is that allowed? (pure, so a number typed on screen can be checked before it is saved) */
function podsValidateCount(n, p){
  if(p < 2) return { ok:false, message:'Choose at least 2 groups.' };
  if(p > PODS_MAX) return { ok:false, message:'Choose at most '+PODS_MAX+' groups.' };
  if(n < p*2) return { ok:false, message:'Each group needs at least 2 players. '+n+' players can fill at most '+Math.floor(n/2)+' groups.' };
  return { ok:true, message:'' };
}
/* pOverride: check a number typed on screen instead of the saved one. */
function podsValidate(t, pOverride){
  return podsValidateCount(podsPlayerCount(t), pOverride != null ? (parseInt(pOverride) || 0) : (parseInt(t.format.podCount) || 0));
}

/* n players into p groups, as even as possible: sizes differ by at most 1, larger groups first. */
function podSizes(n, p){
  var base = Math.floor(n/p), extra = n % p, out = [];
  for(var i=0;i<p;i++) out.push(base + (i < extra ? 1 : 0));
  return out;
}

function podsSeededCount(t){
  if(!t.seedOrder) ensureSeedOrder(t);
  if(!t.format.seedingEnabled) return 0;
  return Math.min(parseInt(t.format.numSeeds) || 0, t.seedOrder.length);
}
/* entry id -> overall seed number (1 = best), seeded players only */
function podsOverallSeeds(t){
  var out = {}, k = podsSeededCount(t);
  for(var i=0;i<k;i++) out[t.seedOrder[i]] = i+1;
  return out;
}
function podsShuffle(arr, rng){
  var a = arr.slice();
  for(var i=a.length-1;i>0;i--){ var j = Math.floor(rng()*(i+1)); var tmp = a[i]; a[i] = a[j]; a[j] = tmp; }
  return a;
}

/* Deals every active entry into p groups. Seeded players go one per group in a snake order
   (1..p, then p..1, ...); everyone else is dealt to a smallest group, ties broken by rng. */
function podsDeal(t, rng){
  rng = rng || Math.random;
  var p = parseInt(t.format.podCount);
  ensureSeedOrder(t);
  var order = t.seedOrder.slice(), k = podsSeededCount(t);
  var groups = []; for(var i=0;i<p;i++) groups.push([]);
  order.slice(0, k).forEach(function(id, i){
    var pass = Math.floor(i/p), pos = i % p;
    groups[pass % 2 === 0 ? pos : p-1-pos].push(id);
  });
  podsShuffle(order.slice(k), rng).forEach(function(id){
    var min = Math.min.apply(null, groups.map(function(g){ return g.length; }));
    var smallest = []; groups.forEach(function(g, gi){ if(g.length === min) smallest.push(gi); });
    groups[smallest[Math.floor(rng()*smallest.length)]].push(id);
  });
  return groups;
}

function podsOrgOf(t, id){
  var e = t.entriesList.find(function(x){ return x.id === id; });
  return e && e.org ? e.org.trim().toLowerCase() : '';
}
/* Number of same-club pairs inside one group. */
function podsClashPairs(t, ids){
  var count = {}, pairs = 0;
  ids.forEach(function(id){ var o = podsOrgOf(t, id); if(!o) return; pairs += count[o] || 0; count[o] = (count[o] || 0) + 1; });
  return pairs;
}
/* Best effort: swap UNSEEDED players between groups while that reduces same-club pairs inside groups.
   Seeded players never move and group sizes never change. */
function podsSeparateClubs(t, groups){
  var seeded = podsOverallSeeds(t);
  for(var pass=0; pass<30; pass++){
    var improved = false;
    for(var a=0; a<groups.length && !improved; a++){
      for(var xi=0; xi<groups[a].length && !improved; xi++){
        var x = groups[a][xi];
        if(seeded[x] || !podsOrgOf(t, x)) continue;
        for(var b=0; b<groups.length && !improved; b++){
          if(b === a) continue;
          for(var yi=0; yi<groups[b].length && !improved; yi++){
            var y = groups[b][yi];
            if(seeded[y]) continue;
            var before = podsClashPairs(t, groups[a]) + podsClashPairs(t, groups[b]);
            var ga = groups[a].slice(), gb = groups[b].slice();
            ga[xi] = y; gb[yi] = x;
            if(podsClashPairs(t, ga) + podsClashPairs(t, gb) < before){ groups[a] = ga; groups[b] = gb; improved = true; }
          }
        }
      }
    }
    if(!improved) break;
  }
}

/* (Re)builds one group's bracket from its entryIds: best seed first, so the best seed gets any bye.
   Only seeded players carry a (overall) seed number in the bracket. */
function podsBuildBracket(t, pod){
  var rank = {}; t.seedOrder.forEach(function(id, i){ rank[id] = i+1; });
  pod.entryIds.sort(function(a, b){ return rank[a] - rank[b]; });
  var ordered = pod.entryIds.map(function(id){ var e = t.entriesList.find(function(x){ return x.id === id; }); return { entryId:id, org:e ? e.org : '' }; });
  var bracket = generateBracket(ordered, 'Group '+pod.label);
  var overall = podsOverallSeeds(t), seeds = {};
  pod.entryIds.forEach(function(id){ if(overall[id]) seeds[id] = overall[id]; });
  bracket.seeds = seeds; bracket.seedLabels = {};
  bracket.podLabel = pod.label;
  pod.bracket = bracket; pod.winnerId = null;
}

function generatePods(t, rng){
  var v = podsValidate(t);
  if(!v.ok) return v;
  var groups = podsDeal(t, rng);
  if(t.format.orgSplit) podsSeparateClubs(t, groups);
  var boards = Math.max(1, parseInt(t.eventCreation.boards) || 1);
  t.pods = groups.map(function(ids, i){
    var pod = { id: uid('pod'), label: String(i+1), entryIds: ids.slice(), boards: [(i % boards) + 1], confirmed:false, bracket:null, winnerId:null };
    podsBuildBracket(t, pod);
    return pod;
  });
  t.knockout = null;
  return { ok:true, message:'' };
}

function podBoardLabel(pod){ return (pod.boards.length === 1 ? 'Board ' : 'Boards ') + pod.boards.join(', '); }
```

`podsFindOf` is used by the tests but is defined in Task 3. To keep this task's tests green, add it now at the end of `pods.js`:

```js
function podsFindOf(t, entryId){ return podsList(t).find(function(p){ return p.entryIds.indexOf(entryId) !== -1; }) || null; }
```

**Edit `index.html`** — find:

```html
<script src="render.js"></script>
```

replace with:

```html
<script src="render.js"></script>
<script src="pods.js"></script>
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test tests/pods-draw.test.js` then `npm test`
Expected: all pass, and the Task 1 snapshot still passes (nothing existing changed).

- [ ] **Step 6: Checkpoint**

Run: `npm test` and `git status --short`.

---

### Task 3: Bracket keys, locks and hand moves (`pods.js`, part 2)

**Files:**
- Modify: `pods.js` (append)
- Create: `tests/pods-moves.test.js`

**Interfaces:**
- Consumes: Task 2 (`podsList`, `podsFindOf`, `podsBuildBracket`).
- Produces:
  - `podBracketKey(pod) -> 'pod:<id>'`
  - `podByKey(t, key) -> pod | null` (null for anything not starting `pod:`)
  - `bracketByKey(t, key) -> bracket` (a group's bracket for `pod:` keys, else `t[key]`)
  - `podHasScores(pod) -> bool`, `podsAnyScores(t) -> bool` (any group or Finals match has legs)
  - `podsCanEdit(pod) -> bool` (unconfirmed and unscored)
  - `podsMovePlayer(t, entryId, toPodId) -> {ok, message}`
  - `podsSwapPlayers(t, entryA, entryB) -> {ok, message}`

- [ ] **Step 1: Write the failing tests**

Write `tests/pods-moves.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, seededRng, makeTournament, play } = require('./lib/helpers');

const app = loadApp();
const f = (name) => run(app, name);
function drawn(n, pods, seed) { const t = makeTournament(app, n, { pods }); f('generatePods')(t, seededRng(seed || 2)); return t; }

test('bracket keys resolve to a group bracket or to a normal bracket', () => {
  const t = drawn(12, 3);
  const pod = t.pods[1];
  assert.equal(f('podBracketKey')(pod), 'pod:' + pod.id);
  assert.equal(f('podByKey')(t, 'pod:' + pod.id), pod);
  assert.equal(f('bracketByKey')(t, 'pod:' + pod.id), pod.bracket);
  assert.equal(f('podByKey')(t, 'knockout'), null);
  t.knockout = { rounds: [] };
  assert.equal(f('bracketByKey')(t, 'knockout'), t.knockout);
  assert.equal(f('podByKey')(t, 'pod:nope'), null);
});

test('a group is editable only while unconfirmed and unscored', () => {
  const t = drawn(12, 3);
  const pod = t.pods[0];
  assert.equal(f('podsCanEdit')(pod), true);
  pod.confirmed = true; assert.equal(f('podsCanEdit')(pod), false);
  pod.confirmed = false;
  const m = pod.bracket.rounds[0].find((x) => x.aEntryId && x.bEntryId);
  play(m, 'a');
  assert.equal(f('podHasScores')(pod), true);
  assert.equal(f('podsCanEdit')(pod), false);
  assert.equal(f('podsAnyScores')(t), true);
});

test('swapping two players between groups keeps sizes and rebuilds both brackets', () => {
  const t = drawn(12, 3);
  const a = t.pods[0], b = t.pods[1], x = a.entryIds[0], y = b.entryIds[0];
  assert.equal(f('podsSwapPlayers')(t, x, y).ok, true);
  assert.ok(b.entryIds.includes(x) && a.entryIds.includes(y));
  assert.equal(a.entryIds.length, 4); assert.equal(b.entryIds.length, 4);
  const inBracket = (p) => p.bracket.rounds[0].flatMap((m) => [m.aEntryId, m.bEntryId]).filter(Boolean);
  assert.ok(inBracket(a).includes(y) && !inBracket(a).includes(x));
});

test('moving a player changes both group sizes, and refuses a locked group', () => {
  const t = drawn(12, 3);
  const a = t.pods[0], b = t.pods[1], x = a.entryIds[0];
  assert.equal(f('podsMovePlayer')(t, x, b.id).ok, true);
  assert.equal(a.entryIds.length, 3); assert.equal(b.entryIds.length, 5);
  b.confirmed = true;
  const r = f('podsMovePlayer')(t, a.entryIds[0], b.id);
  assert.equal(r.ok, false); assert.match(r.message, /unconfirmed/);
});

test('a group may not drop below 2 players, and moving to the same group is refused', () => {
  const t = drawn(6, 3);
  const a = t.pods[0], b = t.pods[1];
  assert.equal(f('podsMovePlayer')(t, a.entryIds[0], b.id).ok, false);
  assert.equal(f('podsMovePlayer')(t, a.entryIds[0], a.id).ok, false);
  assert.equal(f('podsSwapPlayers')(t, a.entryIds[0], a.entryIds[1]).ok, false);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/pods-moves.test.js`
Expected: FAIL (`podBracketKey is not defined`).

- [ ] **Step 3: Append to `pods.js`**

(`podsFindOf` already exists from Task 2.)

```js
/* ---- bracket keys: 'pod:<id>' for a group's bracket, 'knockout' / 'knockoutLosers' as before ---- */
function podBracketKey(pod){ return 'pod:' + pod.id; }
function podByKey(t, key){
  var m = /^pod:(.+)$/.exec(key || '');
  return m ? podsList(t).find(function(p){ return p.id === m[1]; }) || null : null;
}
function bracketByKey(t, key){
  var pod = podByKey(t, key);
  return pod ? pod.bracket : t[key];
}
function podBracketHasLegs(bracket){ return bracket.rounds.some(function(r){ return r.some(function(m){ return m.aLegs != null; }); }); }
function podHasScores(pod){ return podBracketHasLegs(pod.bracket); }
function podsAnyScores(t){ return podsList(t).some(podHasScores) || !!(t.knockout && podBracketHasLegs(t.knockout)); }

/* ---- hand moves: only between unconfirmed, unscored groups; every group keeps at least 2 players ---- */
function podsCanEdit(pod){ return !pod.confirmed && !podHasScores(pod); }
function podsMovePlayer(t, entryId, toPodId){
  var from = podsFindOf(t, entryId), to = podsList(t).find(function(p){ return p.id === toPodId; });
  if(!from || !to || from === to) return { ok:false, message:'Pick a different group.' };
  if(!podsCanEdit(from) || !podsCanEdit(to)) return { ok:false, message:'Both groups must be unconfirmed with no scores.' };
  if(from.entryIds.length <= 2) return { ok:false, message:'A group needs at least 2 players.' };
  from.entryIds = from.entryIds.filter(function(id){ return id !== entryId; });
  to.entryIds.push(entryId);
  podsBuildBracket(t, from); podsBuildBracket(t, to);
  return { ok:true, message:'' };
}
function podsSwapPlayers(t, entryA, entryB){
  var pa = podsFindOf(t, entryA), pb = podsFindOf(t, entryB);
  if(!pa || !pb || pa === pb) return { ok:false, message:'Pick players from two different groups.' };
  if(!podsCanEdit(pa) || !podsCanEdit(pb)) return { ok:false, message:'Both groups must be unconfirmed with no scores.' };
  pa.entryIds = pa.entryIds.map(function(id){ return id === entryA ? entryB : id; });
  pb.entryIds = pb.entryIds.map(function(id){ return id === entryB ? entryA : id; });
  podsBuildBracket(t, pa); podsBuildBracket(t, pb);
  return { ok:true, message:'' };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/pods-moves.test.js` then `npm test`
Expected: all pass.

- [ ] **Step 5: Checkpoint**

Run: `npm test` and `git status --short`.

---

### Task 4: The Finals and the result flow (`pods.js`, part 3)

**Files:**
- Modify: `pods.js` (append)
- Create: `tests/pods-finals.test.js`

**Interfaces:**
- Consumes: Tasks 2 and 3, plus `nearestBracket(n) -> {size, byes}`, `seedSlotOrder(size) -> seedNumberPerSlot[]`, `propagateByes(rounds)`, `bracketChampion(bracket)` (render.js).
- Produces:
  - `podBestSeed(t, pod) -> number` (lowest overall seed in the group; `Infinity` if none)
  - `podsRankedForFinals(t) -> pod[]` (strongest first)
  - `generateFinalsFromPods(t) -> bracket` (sets `t.knockout`; first-round matches carry `aFromPod`/`bFromPod`; lone-group matches have `bye: true`)
  - `podChampion(pod) -> entryId | null`, `podIsFinished(pod) -> bool`
  - `syncFinalsFromPods(t) -> {changed, blocked: podId[]}`
  - `podsApplyResult(t, pod, apply) -> {ok, message}` (runs `apply()`, re-syncs the Finals, undoes the edit if it is refused)

- [ ] **Step 1: Write the failing tests**

Write `tests/pods-finals.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, seededRng, makeTournament, play, playOut } = require('./lib/helpers');

const app = loadApp();
const f = (name) => run(app, name);
function ready(n, pods, opts, seed) {
  const t = makeTournament(app, n, Object.assign({ pods }, opts || {}));
  f('generatePods')(t, seededRng(seed || 5));
  t.pods.forEach((p) => { p.confirmed = true; });
  f('generateFinalsFromPods')(t);
  return t;
}
function finishAllGroups(t) { t.pods.forEach((p) => { playOut(app, p.bracket, () => 'a'); f('syncFinalsFromPods')(t); }); }

test('5 groups: an 8-slot Finals, byes for the 3 strongest groups, placeholders for the rest', () => {
  const t = ready(20, 5, { seeding: true, numSeeds: 8 }, 3);
  const fin = t.knockout;
  assert.equal(fin.size, 8); assert.equal(fin.rounds.length, 3); assert.equal(fin.podFinals, true);
  const byes = fin.rounds[0].filter((m) => m.bye);
  assert.equal(byes.length, 3);
  const strongest = new Set(f('podsRankedForFinals')(t).slice(0, 3).map((p) => p.id));
  byes.forEach((m) => assert.ok(strongest.has(m.aFromPod || m.bFromPod)));
  fin.rounds[0].filter((m) => !m.bye).forEach((m) => assert.ok(m.aFromPod && m.bFromPod));
  fin.rounds[0].forEach((m) => { assert.equal(m.aEntryId, null); assert.equal(m.bEntryId, null); });
});

test('group strength is the best seed it holds; unseeded groups follow in group-number order', () => {
  const t = makeTournament(app, 12, { pods: 4, seeding: true, numSeeds: 2 });
  f('generatePods')(t, seededRng(1));
  const ranked = f('podsRankedForFinals')(t);
  assert.ok(f('podBestSeed')(t, ranked[0]) === 1 && f('podBestSeed')(t, ranked[1]) === 2);
  assert.equal(f('podBestSeed')(t, ranked[2]), Infinity);
  assert.ok(parseInt(ranked[2].label) < parseInt(ranked[3].label));
});

test('64 groups: strongest two groups sit in opposite halves of the Finals', () => {
  const t = ready(540, 64, { seeding: true, numSeeds: 64 }, 1);
  const fin = t.knockout; assert.equal(fin.size, 64);
  const slotOf = (podId) => fin.rounds[0].findIndex((m) => m.aFromPod === podId || m.bFromPod === podId);
  const g1 = slotOf(f('podsFindOf')(t, t.seedOrder[0]).id), g2 = slotOf(f('podsFindOf')(t, t.seedOrder[1]).id);
  assert.notEqual(g1 < 16, g2 < 16);
});

test('a finished group fills its Finals slot; a bye group advances on its own', () => {
  const t = ready(20, 5, {}, 8);
  const byeMatch = t.knockout.rounds[0].find((m) => m.bye);
  const podId = byeMatch.aFromPod || byeMatch.bFromPod;
  const pod = t.pods.find((p) => p.id === podId);
  playOut(app, pod.bracket, () => 'a');
  const r = f('syncFinalsFromPods')(t);
  assert.equal(r.changed, true);
  const side = byeMatch.aFromPod ? 'aEntryId' : 'bEntryId';
  assert.equal(byeMatch[side], f('podChampion')(pod));
  assert.equal(byeMatch.winnerId, f('podChampion')(pod));
  const next = t.knockout.rounds[1][Math.floor(t.knockout.rounds[0].indexOf(byeMatch) / 2)];
  assert.ok([next.aEntryId, next.bEntryId].includes(f('podChampion')(pod)));
});

test('full run: every group, then the Finals, produces a champion', () => {
  const t = ready(40, 6, { seeding: true, numSeeds: 8 }, 5);
  finishAllGroups(t);
  t.pods.forEach((p) => assert.ok(p.winnerId));
  t.knockout.rounds[0].forEach((m) => { if (m.aFromPod) assert.ok(m.aEntryId); if (m.bFromPod) assert.ok(m.bEntryId); });
  playOut(app, t.knockout, () => 'a');
  assert.ok(f('bracketChampion')(t.knockout));
});

test('correcting a group result is refused, and undone, once a dependent Finals match is scored', () => {
  const t = ready(16, 4, {}, 9);
  finishAllGroups(t);
  const m0 = t.knockout.rounds[0][0];
  play(m0, 'a');
  const pod = t.pods.find((p) => p.id === m0.aFromPod);
  const final = pod.bracket.rounds[pod.bracket.rounds.length - 1][0];
  const before = pod.winnerId;
  const r = f('podsApplyResult')(t, pod, () => { play(final, final.winnerId === final.aEntryId ? 'b' : 'a'); });
  assert.equal(r.ok, false); assert.match(r.message, /Finals/);
  assert.equal(pod.winnerId, before); assert.equal(m0.aEntryId, before);
  assert.equal(pod.bracket.rounds[pod.bracket.rounds.length - 1][0].winnerId, before);
});

test('correcting a group result updates the Finals slot while nothing downstream is scored', () => {
  const t = ready(16, 4, {}, 9);
  finishAllGroups(t);
  const m0 = t.knockout.rounds[0][0];
  const podId = m0.aFromPod || m0.bFromPod, side = m0.aFromPod === podId ? 'aEntryId' : 'bEntryId';
  const pod = t.pods.find((p) => p.id === podId);
  const final = pod.bracket.rounds[pod.bracket.rounds.length - 1][0], old = pod.winnerId;
  const r = f('podsApplyResult')(t, pod, () => { play(final, final.winnerId === final.aEntryId ? 'b' : 'a'); });
  assert.equal(r.ok, true);
  assert.notEqual(pod.winnerId, old); assert.equal(m0[side], pod.winnerId);
});

test('a Finals with 2 groups is a single match', () => {
  const t = ready(8, 2, {}, 1);
  assert.equal(t.knockout.size, 4);
  finishAllGroups(t);
  playOut(app, t.knockout, () => 'a');
  assert.ok(f('bracketChampion')(t.knockout));
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/pods-finals.test.js`
Expected: FAIL (`generateFinalsFromPods is not defined`).

- [ ] **Step 3: Append to `pods.js`**

```js
/* ---- Finals ---- */
/* Lower is stronger: a group's best (lowest) overall seed. Unseeded groups rank after seeded ones, by number. */
function podBestSeed(t, pod){
  var overall = podsOverallSeeds(t), best = Infinity;
  pod.entryIds.forEach(function(id){ if(overall[id] && overall[id] < best) best = overall[id]; });
  return best;
}
function podsRankedForFinals(t){
  return podsList(t).slice().sort(function(a, b){
    var sa = podBestSeed(t, a), sb = podBestSeed(t, b);
    if(sa !== sb) return sa < sb ? -1 : 1;
    return parseInt(a.label) - parseInt(b.label);
  });
}
function podsEmptyMatch(){ return { id: uid('km'), aEntryId:null, bEntryId:null, aLegs:null, bLegs:null, winnerId:null, bye:false }; }

/* Builds t.knockout (the Finals) with "Winner of Group N" placeholders. Slots come from seedSlotOrder with
   group strength as the seed, so the strongest groups sit in opposite halves and get any byes. */
function generateFinalsFromPods(t){
  var ranked = podsRankedForFinals(t);
  var size = nearestBracket(Math.max(ranked.length, 2)).size;
  var slotOrder = seedSlotOrder(size), podBySeed = {};
  ranked.forEach(function(pod, i){ podBySeed[i+1] = pod; });
  var slots = slotOrder.map(function(s){ return podBySeed[s] || null; });
  var round1 = [];
  for(var i=0;i<size;i+=2){
    var a = slots[i], b = slots[i+1], m = podsEmptyMatch();
    if(a) m.aFromPod = a.id;
    if(b) m.bFromPod = b.id;
    if((a && !b) || (!a && b)) m.bye = true;   // a lone group's winner advances when it is known
    round1.push(m);
  }
  var rounds = [round1], count = round1.length;
  while(count > 1){ count = count/2; var r = []; for(var j=0;j<count;j++) r.push(podsEmptyMatch()); rounds.push(r); }
  t.knockout = { id: uid('kb'), label:'Finals', size: size, rounds: rounds, roundStartedAt: rounds.map(function(){ return null; }),
    seeds: podsOverallSeeds(t), seedLabels:{}, podFinals:true };
  syncFinalsFromPods(t);
  return t.knockout;
}

function podChampion(pod){ return bracketChampion(pod.bracket) || null; }
function podIsFinished(pod){ return !!podChampion(pod); }
/* True when the Finals match at (ri, mi), or any later match that depends on it, already has a score. */
function podsFinalsFeedScored(fin, ri, mi){
  for(var r=ri, idx=mi; r<fin.rounds.length; r++, idx=Math.floor(idx/2)){
    if(fin.rounds[r][idx].aLegs != null || fin.rounds[r][idx].bLegs != null) return true;
  }
  return false;
}
/* Copies finished groups' winners into the Finals first round. A slot that would change is left alone (and
   reported in `blocked`) when the Finals match it feeds, or a later one depending on it, already has a score. */
function syncFinalsFromPods(t){
  var fin = t.knockout, result = { changed:false, blocked:[] };
  podsList(t).forEach(function(pod){ pod.winnerId = podChampion(pod); });
  if(!fin || !fin.podFinals) return result;
  fin.rounds[0].forEach(function(m, mi){
    ['a', 'b'].forEach(function(side){
      var podId = m[side+'FromPod'];
      if(!podId) return;
      var pod = podsList(t).find(function(p){ return p.id === podId; });
      var winner = pod ? pod.winnerId : null;
      if(m[side+'EntryId'] === winner) return;
      if(podsFinalsFeedScored(fin, 0, mi)){ result.blocked.push(podId); return; }
      m[side+'EntryId'] = winner;
      if(m.bye) m.winnerId = winner;
      result.changed = true;
    });
  });
  if(result.changed) propagateByes(fin.rounds);
  return result;
}
/* Applies an edit to a group's bracket (apply() mutates pod.bracket.rounds), then re-syncs the Finals. If the
   Finals refuses because a dependent Finals match is scored, the edit is undone. */
function podsApplyResult(t, pod, apply){
  var snapshot = JSON.stringify(pod.bracket.rounds);
  apply();
  propagateByes(pod.bracket.rounds);
  var r = syncFinalsFromPods(t);
  if(r.blocked.length){
    pod.bracket.rounds = JSON.parse(snapshot);
    syncFinalsFromPods(t);
    return { ok:false, message:'This result would change who reaches the Finals, but a Finals match that depends on it already has a score.' };
  }
  return { ok:true, message:'' };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/pods-finals.test.js` then `npm test`
Expected: all pass.

- [ ] **Step 5: Checkpoint**

Run: `npm test` and `git status --short`.

---

### Task 5: Confirming, progress and the time estimate (`pods.js`, part 4)

**Files:**
- Modify: `pods.js` (append)
- Create: `tests/pods-confirm.test.js`

**Interfaces:**
- Consumes: Tasks 2 to 4, plus `matchDurationMinutes(t, {isKnockout, legs}) -> minutes`, `simulateKnockoutMinutes(t, entryCount, bracketKey, boards) -> minutes`.
- Produces:
  - `podsConfirm(t, podId)`, `podsConfirmAll(t)` (build the Finals once every group is confirmed)
  - `podsUnconfirm(t, podId) -> {ok, message}` (refused if the group or the Finals has scores; clears `t.knockout` when it succeeds)
  - `podMatchCounts(pod) -> {done, total}` (real matches, byes excluded)
  - `podsProgress(t) -> {total, finished, scored, confirmed}`
  - `podsEstimateMinutes(t, boards) -> minutes | null`

- [ ] **Step 1: Write the failing tests**

Write `tests/pods-confirm.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, plain, seededRng, makeTournament, play, playOut } = require('./lib/helpers');

const app = loadApp();
const f = (name) => run(app, name);
function drawn(n, pods) { const t = makeTournament(app, n, { pods }); f('generatePods')(t, seededRng(6)); return t; }

test('the Finals appears only when the last group is confirmed', () => {
  const t = drawn(12, 3);
  f('podsConfirm')(t, t.pods[0].id); f('podsConfirm')(t, t.pods[1].id);
  assert.equal(t.knockout, null);
  f('podsConfirm')(t, t.pods[2].id);
  assert.ok(t.knockout && t.knockout.podFinals);
});

test('a group can finish before the others are confirmed; its winner appears once the Finals exists', () => {
  const t = drawn(12, 3);
  f('podsConfirm')(t, t.pods[0].id);
  playOut(app, t.pods[0].bracket, () => 'a');
  assert.equal(f('podIsFinished')(t.pods[0]), true);
  f('podsConfirm')(t, t.pods[1].id); f('podsConfirm')(t, t.pods[2].id);
  const slot = t.knockout.rounds[0].flatMap((m) => [m.aEntryId, m.bEntryId]);
  assert.ok(slot.includes(f('podChampion')(t.pods[0])));
});

test('confirm all, then unconfirm one: the Finals is discarded', () => {
  const t = drawn(12, 3);
  f('podsConfirmAll')(t);
  assert.ok(t.knockout);
  assert.equal(f('podsUnconfirm')(t, t.pods[0].id).ok, true);
  assert.equal(t.knockout, null); assert.equal(t.pods[0].confirmed, false);
});

test('unconfirm is refused once the group or the Finals has a score', () => {
  const t = drawn(12, 3);
  f('podsConfirmAll')(t);
  play(t.pods[0].bracket.rounds[0].find((m) => m.aEntryId && m.bEntryId), 'a');
  assert.equal(f('podsUnconfirm')(t, t.pods[0].id).ok, false);
  const t2 = drawn(12, 3);
  f('podsConfirmAll')(t2);
  t2.pods.forEach((p) => { playOut(app, p.bracket, () => 'a'); f('syncFinalsFromPods')(t2); });
  play(t2.knockout.rounds[0][0], 'a');
  const r = f('podsUnconfirm')(t2, t2.pods[0].id);
  assert.equal(r.ok, false);
  assert.match(r.message, /scores/);
});

test('progress counts confirmed, scored and finished groups', () => {
  const t = drawn(12, 3);
  assert.deepEqual(plain(f('podsProgress')(t)), { total: 3, finished: 0, scored: 0, confirmed: 0 });
  f('podsConfirmAll')(t);
  playOut(app, t.pods[0].bracket, () => 'a');
  const p = f('podsProgress')(t);
  assert.equal(p.confirmed, 3); assert.equal(p.finished, 1); assert.equal(p.scored, 1);
});

test('match counts ignore byes', () => {
  const t = drawn(10, 4);
  const sizes = plain(t.pods.map((p) => p.entryIds.length));
  t.pods.forEach((p) => assert.equal(f('podMatchCounts')(p).total, p.entryIds.length - 1));
  assert.deepEqual(sizes.slice().sort(), [2, 2, 3, 3]);
  playOut(app, t.pods[0].bracket, () => 'a');
  assert.equal(f('podMatchCounts')(t.pods[0]).done, t.pods[0].entryIds.length - 1);
});

test('time estimate: groups run side by side on their boards, then the Finals', () => {
  const t = makeTournament(app, 32, { pods: 8, boards: 8 });
  const per = f('matchDurationMinutes')(t, { isKnockout: true, legs: 5 });
  const est = f('podsEstimateMinutes')(t, 8);
  const groups = 3 * per;           // 4 players = 3 matches, one board each
  const finals = f('simulateKnockoutMinutes')(t, 8, 'knockout', 8);
  assert.equal(est, groups + finals);
  const fewer = f('podsEstimateMinutes')(t, 4);   // two groups per board
  assert.equal(fewer, 2 * groups + f('simulateKnockoutMinutes')(t, 8, 'knockout', 4));
  assert.equal(f('podsEstimateMinutes')(makeTournament(app, 5, { pods: 4 }), 4), null);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/pods-confirm.test.js`
Expected: FAIL (`podsConfirm is not defined`).

- [ ] **Step 3: Append to `pods.js`**

```js
/* ---- confirming and progress ---- */
function podsConfirm(t, podId){
  var pod = podsList(t).find(function(p){ return p.id === podId; });
  if(!pod) return;
  pod.confirmed = true;
  if(podsList(t).every(function(p){ return p.confirmed; }) && !t.knockout) generateFinalsFromPods(t);
}
function podsConfirmAll(t){
  podsList(t).forEach(function(p){ p.confirmed = true; });
  if(!t.knockout) generateFinalsFromPods(t);
}
function podsUnconfirm(t, podId){
  var pod = podsList(t).find(function(p){ return p.id === podId; });
  if(!pod) return { ok:false, message:'Unknown group.' };
  if(podHasScores(pod)) return { ok:false, message:'This group already has scores.' };
  if(t.knockout && podBracketHasLegs(t.knockout)) return { ok:false, message:'The Finals already has scores.' };
  pod.confirmed = false; t.knockout = null;
  return { ok:true, message:'' };
}
/* Real matches in a group (byes excluded) and how many have a winner. */
function podMatchCounts(pod){
  var done = 0, total = 0;
  pod.bracket.rounds.forEach(function(r){ r.forEach(function(m){ if(m.bye) return; total++; if(m.winnerId) done++; }); });
  return { done:done, total:total };
}
function podsProgress(t){
  var pods = podsList(t);
  return { total: pods.length, finished: pods.filter(podIsFinished).length, scored: pods.filter(podHasScores).length,
    confirmed: pods.filter(function(p){ return p.confirmed; }).length };
}

/* ---- time estimate: groups run at the same time on their own boards (groups sharing a board queue), then the Finals ---- */
function podsEstimateMinutes(t, boards){
  if(!podsValidate(t).ok) return null;
  boards = Math.max(1, parseInt(boards) || 1);
  var legs = parseInt(t.format.podLegs) || parseInt(t.format.bestOfLegs) || 5;
  var perMatch = matchDurationMinutes(t, { isKnockout:true, legs:legs });
  var perBoard = {};
  podSizes(podsPlayerCount(t), parseInt(t.format.podCount)).forEach(function(size, i){
    var b = (i % boards) + 1;
    perBoard[b] = (perBoard[b] || 0) + (size - 1) * perMatch;
  });
  var groupsPhase = Math.max.apply(null, Object.keys(perBoard).map(function(k){ return perBoard[k]; }));
  var brk = t.format.breaks || {};
  return groupsPhase + simulateKnockoutMinutes(t, parseInt(t.format.podCount), 'knockout', boards)
    + (brk.knockout && brk.knockout.enabled ? parseInt(brk.knockout.minutes) || 0 : 0);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/pods-confirm.test.js` then `npm test`
Expected: all pass. If the time-estimate test fails only on the `fewer` line, check `perBoard` wrapping: with 8 groups and 4 boards, groups 1 and 5 share board 1 (`(i % boards) + 1`).

- [ ] **Step 5: Checkpoint**

Run: `npm test` and `git status --short`. `pods.js` is now complete; every later task is screens, drawing hooks and the viewer.

---

### Task 6: Drawing, tags, legs and score entry for group brackets

**Files:**
- Modify: `render.js` (`mkoSlot`, `koMatchTag`), `viewer/render.js` (via `npm run sync-viewer`)
- Modify: `index.html` (`legsForKnockoutRound`, `koMatchScoreModal`, `markKnockoutNoShow`, `openKoNoShowPicker`, `knockoutBracketSheetHTML`)
- Create: `tests/pods-render.test.js`

**Interfaces:**
- Consumes: Tasks 3 and 4 (`podByKey`, `bracketByKey`, `podsApplyResult`).
- Produces (behaviour later tasks rely on):
  - A Finals first-round side with `aFromPod`/`bFromPod` and no entry draws as "Winner of Group N".
  - `koMatchTag(bracket, t, ri, mi)` returns `G<label>·<round>-<match>` when `bracket.podLabel` is set.
  - `legsForKnockoutRound(t, 'pod:<id>', ...)` returns the group best-of (`podLegs`, falling back to `bestOfLegs`).
  - `koMatchScoreModal`, `markKnockoutNoShow`, `openKoNoShowPicker` accept `'pod:<id>'` keys; a refused edit shows an error and changes nothing.
  - `knockoutBracketSheetHTML(bracket, opts?)` where `opts = { podLegs?: bool, stage?: string }`; with no `opts` the output is unchanged.

- [ ] **Step 1: Write the failing tests**

Write `tests/pods-render.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, useState, seededRng, makeTournament, play, playOut } = require('./lib/helpers');

const app = loadApp();
const f = (name) => run(app, name);
function ready(n, pods, opts) {
  const t = makeTournament(app, n, Object.assign({ pods }, opts || {}));
  f('generatePods')(t, seededRng(5)); f('podsConfirmAll')(t); useState(app, t);
  return t;
}
// Opens the score modal, "types" a and b, and returns whatever pressing Save returns.
function saveScore(key, ri, mi, a, b) {
  let opts = null;
  app.openModal = (o) => { opts = o; };
  app.persist = () => {}; app.render = () => {};
  app.document = { getElementById: (id) => ({ value: id === 'scA' ? String(a) : String(b) }) };
  f('koMatchScoreModal')(key, ri, mi);
  return opts ? opts.onConfirm() : undefined;
}
const firstReal = (bracket) => bracket.rounds[0].findIndex((m) => m.aEntryId && m.bEntryId && !m.bye);

test('the Finals chart shows "Winner of Group N" for groups that have not finished', () => {
  const t = ready(20, 5);
  const html = f('mirroredChartHTML')(t.knockout, t, { interactive: false });
  assert.match(html, /Winner of Group \d+/);
  assert.doesNotMatch(html, /undefined|NaN/);
});

test('group match tags carry the group number', () => {
  const t = ready(12, 3);
  assert.equal(f('koMatchTag')(t.pods[1].bracket, t, 0, 0), 'G2·1-1');
  assert.equal(f('koMatchTag')(t.knockout, t, 0, 0), '1-1');
});

test('legs: groups use podLegs, the Finals keeps its own setting', () => {
  const t = ready(12, 3);
  t.format.podLegs = 3; t.format.bestOfLegs = 7;
  assert.equal(f('legsForKnockoutRound')(t, 'pod:' + t.pods[0].id, 3, 0), 3);
  assert.equal(f('legsForKnockoutRound')(t, 'knockout', 3, 0), 7);
  t.format.podLegs = null;
  assert.equal(f('legsForKnockoutRound')(t, 'pod:' + t.pods[0].id, 3, 0), 7);
});

test('saving a score in a group updates that group', () => {
  const t = ready(12, 3);
  t.format.podLegs = 3;                    // first to 2
  const pod = t.pods[0], mi = firstReal(pod.bracket), m = pod.bracket.rounds[0][mi];
  assert.equal(saveScore('pod:' + pod.id, 0, mi, 2, 0), undefined);
  assert.equal(m.winnerId, m.aEntryId); assert.equal(m.aLegs, 2);
});

test('a score that is not a finished best-of result is refused', () => {
  const t = ready(12, 3);
  t.format.podLegs = 3;
  const pod = t.pods[0], mi = firstReal(pod.bracket);
  const r = saveScore('pod:' + pod.id, 0, mi, 1, 1);
  assert.ok(r && r.error);
});

test('a group result that would change a scored Finals match is refused and nothing changes', () => {
  const t = ready(16, 4);
  t.pods.forEach((p) => { playOut(app, p.bracket, () => 'a'); f('syncFinalsFromPods')(t); });
  const m0 = t.knockout.rounds[0][0]; play(m0, 'a');
  const pod = t.pods.find((p) => p.id === (m0.aFromPod || m0.bFromPod));
  const lastRi = pod.bracket.rounds.length - 1, final = pod.bracket.rounds[lastRi][0], before = final.winnerId;
  const r = saveScore('pod:' + pod.id, lastRi, 0, final.winnerId === final.aEntryId ? 0 : 3, final.winnerId === final.aEntryId ? 3 : 0);
  assert.ok(r && r.error);
  assert.equal(pod.bracket.rounds[lastRi][0].winnerId, before);
});

test('a no-show in a group is a walkover for the opponent', () => {
  const t = ready(12, 3);
  const pod = t.pods[0], mi = firstReal(pod.bracket), m = pod.bracket.rounds[0][mi];
  app.persist = () => {}; app.render = () => {};
  f('markKnockoutNoShow')('pod:' + pod.id, 0, mi, 'a');
  assert.equal(m.winnerId, m.bEntryId); assert.equal(m.wo, true);
});

test('group sheets use the group best-of and a custom stage label; normal sheets are unchanged', () => {
  const t = ready(12, 3);
  t.format.podLegs = 3; t.format.bestOfLegs = 7;
  const sheet = f('knockoutBracketSheetHTML')(t.pods[0].bracket, { podLegs: true, stage: 'Group 1 · Board 1' });
  assert.match(sheet, /Group 1 · Board 1/); assert.match(sheet, /Best of 3 Legs/);
  const plain = f('knockoutBracketSheetHTML')(t.knockout);
  assert.match(plain, /Knockout Stage/); assert.match(plain, /Best of 7 Legs/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/pods-render.test.js`
Expected: FAIL (placeholder text missing, tag `1-1`, and so on).

- [ ] **Step 3: Edit `render.js`**

**Edit `render.js`** — find:

```js
  if(!id){
    if(m.bye) return { text:'BYE',
```

replace with:

```js
  if(!id){
    const fromPod = m[side+'FromPod'];
    if(fromPod){
      const pod = (t.pods||[]).find(p=>p.id===fromPod);
      return { text:'Winner of Group '+escapeHtml(pod ? pod.label : '?'), seed:'', legs:'', fw:400, color:tokens.muted, bg:(tokens.boxBg||'#fff'), border:'1px solid '+tokens.line, wo:false };
    }
    if(m.bye) return { text:'BYE',
```

**Edit `render.js`** — find:

```js
  return (bracket===t.knockoutLosers ? 'P' : '') + (ri+1) + '-' + (mi+1);
```

replace with:

```js
  if(bracket.podLabel) return 'G'+bracket.podLabel+'·'+(ri+1)+'-'+(mi+1);
  return (bracket===t.knockoutLosers ? 'P' : '') + (ri+1) + '-' + (mi+1);
```

- [ ] **Step 4: Edit `index.html` (legs, score entry, no-show, sheet)**

**Edit `index.html`** — find:

```js
function legsForKnockoutRound(t, bracketKey, totalRounds, idx){
  const isPlate = bracketKey==='knockoutLosers';
```

replace with:

```js
function legsForKnockoutRound(t, bracketKey, totalRounds, idx){
  if(podByKey(t, bracketKey)) return parseInt(t.format.podLegs)||parseInt(t.format.bestOfLegs)||5;
  const isPlate = bracketKey==='knockoutLosers';
```

**Edit `index.html`** — find:

```js
function koMatchScoreModal(bracketKey, roundIdx, matchIdx){
  const bracket = state[bracketKey];
```

replace with:

```js
function koMatchScoreModal(bracketKey, roundIdx, matchIdx){
  const bracket = bracketByKey(state, bracketKey);
```

**Edit `index.html`** — find:

```js
      m.aLegs = la; m.bLegs = lb; m.winnerId = winnerIsA ? m.aEntryId : m.bEntryId; m.wo = false;
      propagateByes(bracket.rounds);
      persist(); render();
```

replace with:

```js
      const apply = ()=>{ m.aLegs = la; m.bLegs = lb; m.winnerId = winnerIsA ? m.aEntryId : m.bEntryId; m.wo = false; };
      const podHit = podByKey(state, bracketKey);
      if(podHit){
        const res = podsApplyResult(state, podHit, apply);
        if(!res.ok) return { error: res.message };
      } else { apply(); propagateByes(bracket.rounds); }
      persist(); render();
```

**Edit `index.html`** — find:

```js
function markKnockoutNoShow(bracketKey, roundIdx, matchIdx, side){
  const bracket = state[bracketKey];
```

replace with:

```js
function markKnockoutNoShow(bracketKey, roundIdx, matchIdx, side){
  const bracket = bracketByKey(state, bracketKey);
```

**Edit `index.html`** — find:

```js
  m.aLegs = side==='a' ? 0 : majority;
  m.bLegs = side==='a' ? majority : 0;
  m.winnerId = winnerId;
  m.wo = true;
  const ent = state.entriesList.find(e=>e.id===loserId);
  if(ent) ent.noShow = true;
  propagateByes(bracket.rounds);
```

replace with:

```js
  const apply = ()=>{ m.aLegs = side==='a' ? 0 : majority; m.bLegs = side==='a' ? majority : 0; m.winnerId = winnerId; m.wo = true; };
  const podHit = podByKey(state, bracketKey);
  if(podHit){
    const res = podsApplyResult(state, podHit, apply);
    if(!res.ok){ openModal({title:'Can\'t change this result', body: res.message, confirmLabel:'OK', confirmClass:'primary', onConfirm:()=>{}}); return; }
  } else { apply(); propagateByes(bracket.rounds); }
  const ent = state.entriesList.find(e=>e.id===loserId);
  if(ent) ent.noShow = true;
```

**Edit `index.html`** — find:

```js
function openKoNoShowPicker(bracketKey, roundIdx, matchIdx){
  const bracket = state[bracketKey];
```

replace with:

```js
function openKoNoShowPicker(bracketKey, roundIdx, matchIdx){
  const bracket = bracketByKey(state, bracketKey);
```

**Edit `index.html`** — find:

```js
function knockoutBracketSheetHTML(bracket){
  const t = state;
  const bracketKey = bracket===t.knockoutLosers ? 'knockoutLosers' : 'knockout';
  const legsCfg = (t.format.knockoutLegs||{})[bracketKey==='knockoutLosers'?'plate':'main'];
  const variableLegs = legsCfg && legsCfg.variable;
  const legsSub = variableLegs ? '' : ' · Best of '+t.format.bestOfLegs+' Legs';
  const legsFooter = variableLegs
    ? 'Legs per match increase by knockout stage — see each round\'s heading above.'
    : 'Best of '+t.format.bestOfLegs+' legs per match — no draws, the winner needs '+(Math.floor((parseInt(t.format.bestOfLegs)||5)/2)+1)+' legs.';
```

replace with:

```js
function knockoutBracketSheetHTML(bracket, opts){
  const t = state;
  const bracketKey = bracket===t.knockoutLosers ? 'knockoutLosers' : 'knockout';
  const legsCfg = (t.format.knockoutLegs||{})[bracketKey==='knockoutLosers'?'plate':'main'];
  const isPodSheet = !!(opts && opts.podLegs);
  const variableLegs = !isPodSheet && legsCfg && legsCfg.variable;
  const sheetBestOf = isPodSheet ? (parseInt(t.format.podLegs)||parseInt(t.format.bestOfLegs)||5) : t.format.bestOfLegs;
  const legsSub = variableLegs ? '' : ' · Best of '+sheetBestOf+' Legs';
  const legsFooter = variableLegs
    ? 'Legs per match increase by knockout stage — see each round\'s heading above.'
    : 'Best of '+sheetBestOf+' legs per match — no draws, the winner needs '+(Math.floor((parseInt(sheetBestOf)||5)/2)+1)+' legs.';
```

**Edit `index.html`** — find:

```js
 · Knockout Stage'+legsSub+(totalSheets>1
```

replace with:

```js
 · '+(opts && opts.stage ? escapeHtml(opts.stage) : 'Knockout Stage')+legsSub+(totalSheets>1
```

- [ ] **Step 5: Keep the viewer's copy of the shared drawing code in step**

Run: `npm run sync-viewer`
Expected: `copied  render.js -> viewer/render.js`.

- [ ] **Step 6: Run to verify pass**

Run: `node --test tests/pods-render.test.js` then `npm test`
Expected: all pass, including the Task 1 snapshot (existing output unchanged: the `opts` parameter and the new branches do not alter anything when the new fields are absent).

- [ ] **Step 7: Checkpoint**

Run: `npm test`, `npm run check-viewer` (must print `ok` for both files) and `git status --short`.

---

### Task 7: The Format screen and routing for Group Boards

**Files:**
- Create: `pods-ui.js` (stage 2 part)
- Modify: `index.html` (script tag; `blankTournament`; `computeStageFor`; `formatSummaryCard`; `formatDescriptionLines`; `schedulingContextHTML`; `estimateTotalMinutes`; `competitionDurationSummaryHTML`; `stage2`; `saveStage2`; `blockForUnresolvedTies`)
- Create: `tests/pods-format.test.js`

**Interfaces:**
- Consumes: Tasks 2 to 5 (`podsValidate`, `podSizes`, `podsEstimateMinutes`, `PODS_MAX`, `podsPlayerCount`), existing `nearestBracket`, `knockoutLegsFieldsHTML`.
- Produces in `pods-ui.js`:
  - `podsSummaryHTML(n, p) -> html` (live summary line for the settings form)
  - `podsFormatFieldsHTML() -> html` (fields for Stage 2: `f_bestof`, `f_podcount`, `f_podlegs`)
  - `podsPreviewSettings()` (updates `#podsSummary` as the number is typed)
  - `podsReadFormat(f)` (reads `f_podcount` and `f_podlegs` from the page into `f`)
- New saved fields: `format.podCount` (default 8), `format.podLegs` (default null = same as `bestOfLegs`), top-level `pods` (default `[]`).

- [ ] **Step 1: Write the failing tests**

Write `tests/pods-format.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, plain, useState, seededRng, makeTournament } = require('./lib/helpers');

const app = loadApp();
const f = (name) => run(app, name);

test('a new tournament has defaults for Group Boards', () => {
  const t = f('blankTournament')();
  assert.equal(t.format.podCount, 8); assert.equal(t.format.podLegs, null);
  assert.ok(Array.isArray(t.pods) && t.pods.length === 0);
});

test('stage routing: no groups -> chart details, drawn -> confirm, Finals built -> manage', () => {
  const t = makeTournament(app, 12, { pods: 3 });
  assert.equal(f('computeStageFor')(t), 3);
  f('generatePods')(t, seededRng(1));
  assert.equal(f('computeStageFor')(t), 4);
  f('podsConfirmAll')(t);
  assert.equal(f('computeStageFor')(t), 5);
});

test('the format summary, rules text and context mention Group Boards', () => {
  const t = makeTournament(app, 12, { pods: 3 }); useState(app, t);
  assert.match(f('formatSummaryCard')(), /Group Boards/);
  assert.match(f('formatSummaryCard')(), /3/);
  const lines = f('formatDescriptionLines')(t).join(' ');
  assert.match(lines, /Group Boards/); assert.match(lines, /3 groups/);
  assert.match(f('schedulingContextHTML')(), /3<\/b> groups/);
});

test('the duration estimate for Group Boards comes from the groups-then-Finals model', () => {
  const t = makeTournament(app, 32, { pods: 8, boards: 8 }); useState(app, t);
  const est = f('estimateTotalMinutes')(t);
  assert.equal(est.minutes, f('roundUpTo5')(f('podsEstimateMinutes')(t, 8)));
  assert.ok(est.minutes > 0);
  assert.match(f('competitionDurationSummaryHTML')(t), /Estimated duration/);
});

test('the settings form lists the fields and a live summary', () => {
  const t = makeTournament(app, 40, { pods: 8 }); useState(app, t);
  const html = f('podsFormatFieldsHTML')();
  assert.match(html, /id="f_podcount"/); assert.match(html, /id="f_podlegs"/); assert.match(html, /id="f_bestof"/);
  assert.match(f('podsSummaryHTML')(40, 8), /8 groups of 5 players/);
  assert.match(f('podsSummaryHTML')(43, 8), /5 to 6 players/);
  assert.match(f('podsSummaryHTML')(40, 6), /6-slot|8-slot/);   // Finals size for 6 group winners is 8
  assert.match(f('podsSummaryHTML')(7, 4), /at most 3 groups/);
  assert.match(f('podsSummaryHTML')(40, 0), /Choose how many groups/);
});

test('reading the settings form clamps the number of groups and keeps the group best-of', () => {
  const realDocument = app.document;
  const values = { f_podcount: '500', f_podlegs: '' };
  app.document = { getElementById: (id) => (id in values ? { value: values[id] } : null) };
  try {
    const fmt = { bestOfLegs: 5 };
    f('podsReadFormat')(fmt);
    assert.equal(fmt.podCount, 128); assert.equal(fmt.podLegs, 5);
    values.f_podcount = '1'; values.f_podlegs = '3';
    f('podsReadFormat')(fmt);
    assert.equal(fmt.podCount, 2); assert.equal(fmt.podLegs, 3);
  } finally { app.document = realDocument; }
});

test('opening a tournament saved before Group Boards fills in the new fields', async () => {
  const old = f('blankTournament')();
  delete old.pods; delete old.format.podCount; delete old.format.podLegs;
  app.fetch = async () => ({ ok: true, status: 200, json: async () => ({ data: old, updated_at: '2026-01-01T00:00:00Z' }) });
  app.render = () => {};
  await f('openTournament')('t_old');
  const s = run(app, 'state');
  assert.deepEqual(plain(s.pods), []);
  assert.equal(s.format.podCount, 8); assert.equal(s.format.podLegs, null);
});

test('switching an old tournament (no pods field) to Group Boards does not throw', () => {
  const t = f('blankTournament')();
  delete t.pods; t.eventCreation.saved = true; t.format.saved = true;
  t.entriesList = Array.from({ length: 12 }, (_, i) => ({ id: 'e' + i, name: 'P' + i, org: '', players: [], withdrawn: false }));
  useState(app, t);
  app.render = () => {};   // only the state change matters here; the screens are checked below
  assert.doesNotThrow(() => f('setFormatType')('podknockout'));
  assert.equal(t.format.formatType, 'podknockout');
  assert.doesNotThrow(() => f('formatSummaryCard')());
  assert.doesNotThrow(() => f('podsFormatFieldsHTML')());
});
```

`setFormatType` calls `render()`; the test harness's `render` runs against stubs and a tournament with entries, so it should not throw. If it does, add `app.render = () => {};` before the call and note why.

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/pods-format.test.js`
Expected: FAIL (`podCount` undefined, `podsFormatFieldsHTML is not defined`, ...).

- [ ] **Step 3: Create `pods-ui.js` (stage 2 part)**

Create `pods-ui.js`:

```js
/* Group Boards screens: builds HTML strings and handles clicks for stages 2 to 7. All game logic lives in
   pods.js. Organisers see "Group"; the internal name is "pods" (state.pods) so it never clashes with the
   round-robin state.groups. Needs globals from index.html (state, persist, render, openModal, escapeHtml,
   nearestBracket, knockoutLegsFieldsHTML, ...). Only called while rendering or on a click. */

/* ---------- Stage 2: format settings ---------- */
function podsSummaryHTML(n, p){
  var v = podsValidateCount(n, p);
  if(!p) return '<b>Choose how many groups.</b> Players are dealt into this many small knockouts, and each group winner goes through to the Finals.';
  if(!v.ok) return '<b style="color:#c0392b">'+escapeHtml(v.message)+'</b>';
  var sizes = podSizes(n, p), min = sizes[sizes.length-1], max = sizes[0], fin = nearestBracket(p);
  return '<b>'+p+' groups of '+(min===max ? min : min+' to '+max)+' players.</b> Finals: a '+fin.size+'-slot chart for '+p+' group winners'+
    (fin.byes ? ' ('+fin.byes+' bye'+(fin.byes===1?'':'s')+' for the strongest groups)' : '')+'.';
}
function podsFormatFieldsHTML(){
  var f = state.format, n = podsPlayerCount(state), p = parseInt(f.podCount) || 0, advanced = !!state.eventCreation.advancedMode;
  return '<div class="grid2">'+
      '<div class="field"><label>Best of legs (the Finals, and groups unless set below)</label><input id="f_bestof" type="number" min="1" step="2" value="'+f.bestOfLegs+'" oninput="warnBestOf(this);updateStage2Timing()"><div class="hint" id="bestOfHint"></div></div>'+
      '<div class="field"><label>Number of groups</label><input id="f_podcount" type="number" min="2" max="'+PODS_MAX+'" value="'+(p || '')+'" oninput="podsPreviewSettings()"></div>'+
    '</div>'+
    '<div class="grid2"><div class="field"><label>Best of legs inside each group</label><input id="f_podlegs" type="number" min="1" step="2" value="'+(parseInt(f.podLegs) || parseInt(f.bestOfLegs) || 5)+'"></div><div></div></div>'+
    '<div class="recommend" id="podsSummary">'+podsSummaryHTML(n, p)+'</div>'+
    (advanced ? knockoutLegsFieldsHTML('main', f.knockoutLegs.main, 'Finals: increase legs at each stage (early rounds, quarterfinal, semifinal, final)') : '');
}
function podsPreviewSettings(){
  var el = document.getElementById('f_podcount'), box = document.getElementById('podsSummary');
  if(!el || !box) return;
  box.innerHTML = podsSummaryHTML(podsPlayerCount(state), parseInt(el.value) || 0);
}
/* Reads the Stage 2 fields (each only if it is on the page) into the format object. */
function podsReadFormat(f){
  var pc = document.getElementById('f_podcount');
  if(pc) f.podCount = Math.max(2, Math.min(PODS_MAX, parseInt(pc.value) || 2));
  var pl = document.getElementById('f_podlegs');
  if(pl) f.podLegs = Math.max(1, parseInt(pl.value) || parseInt(f.bestOfLegs) || 5);
}
```

- [ ] **Step 4: Edit `index.html` (script tag and defaults)**

**Edit `index.html`** — find:

```html
<script src="pods.js"></script>
```

replace with:

```html
<script src="pods.js"></script>
<script src="pods-ui.js"></script>
```

**Edit `index.html`** — find:

```js
      orgSplit:false,
      /* Free-text walkover / conduct / other rules, printed on the auto-generated rules & format sheet */
```

replace with:

```js
      orgSplit:false,
      /* Group Boards (formatType:'podknockout'): how many small knockout groups, and their best-of
         (null = same as bestOfLegs). The Finals uses bestOfLegs / knockoutLegs.main like any knockout. */
      podCount:8, podLegs:null,
      /* Free-text walkover / conduct / other rules, printed on the auto-generated rules & format sheet */
```

**Edit `index.html`** — find:

```js
    entriesList: [],
    groups: [],
    knockout: null,
```

replace with:

```js
    entriesList: [],
    groups: [],
    /* Group Boards: the small knockout groups (see pods.js). Round-robin groups stay in `groups`. */
    pods: [],
    knockout: null,
```

- [ ] **Step 5: Edit `index.html` (routing, summaries, estimates, opening old tournaments)**

**Edit `index.html`** — find:

```js
    if(state.incidents===undefined) state.incidents = [];
```

replace with:

```js
    if(state.incidents===undefined) state.incidents = [];
    if(state.pods===undefined) state.pods = [];
    if(state.format.podCount===undefined) state.format.podCount = 8;
    if(state.format.podLegs===undefined) state.format.podLegs = null;
```

**Edit `index.html`** — find:

```js
    : t.format.formatType==='knockout' ? (t.knockout ? 5 : 4)
```

replace with:

```js
    : t.format.formatType==='podknockout' ? (t.knockout ? 5 : (t.pods && t.pods.length ? 4 : 3))
    : t.format.formatType==='knockout' ? (t.knockout ? 5 : 4)
```

**Edit `index.html`** — find:

```js
    '<div><label>Format</label><strong>'+({knockout:'Knockout', rrknockout:'Round Robin → Knockout'}[f.formatType]||'Round Robin')+'</strong></div>'+
```

replace with:

```js
    '<div><label>Format</label><strong>'+({knockout:'Knockout', rrknockout:'Round Robin → Knockout', podknockout:'Group Boards'}[f.formatType]||'Round Robin')+'</strong></div>'+
```

**Edit `index.html`** — find:

```js
    '<div><label>Max/group</label><strong>'+(f.formatType!=='knockout'?f.maxPerGroup:'—')+'</strong></div>'+
```

replace with:

```js
    (f.formatType==='podknockout'
      ? '<div><label>Groups</label><strong>'+f.podCount+'</strong></div>'
      : '<div><label>Max/group</label><strong>'+(f.formatType!=='knockout'?f.maxPerGroup:'—')+'</strong></div>')+
```

**Edit `index.html`** — find:

```js
  } else if(f.formatType==='rrknockout'){
    lines.push('Format: Round robin group stage, followed by a knockout bracket.');
```

replace with:

```js
  } else if(f.formatType==='podknockout'){
    const podBestOf = parseInt(f.podLegs)||bestOf;
    lines.push('Format: Group Boards — players are drawn into '+f.podCount+' groups. Each group is a small knockout on its own board, and every group winner goes through to a Finals bracket.');
    lines.push('Group matches are best of '+podBestOf+' legs (first to '+(Math.floor(podBestOf/2)+1)+'). Finals matches are best of '+bestOf+' legs (first to '+majority+') unless legs increase by stage. Knockout matches cannot end in a draw.');
  } else if(f.formatType==='rrknockout'){
    lines.push('Format: Round robin group stage, followed by a knockout bracket.');
```

**Edit `index.html`** — find:

```js
  } else {
    const maxPer = Math.max(2, parseInt(f.maxPerGroup)||4);
```

replace with:

```js
  } else if(f.formatType==='podknockout'){
    const pc = parseInt(f.podCount)||0;
    parts.splice(1, 0, '<b>'+pc+'</b> groups, then a <b>'+nearestBracket(Math.max(pc,2)).size+'</b>-slot Finals');
  } else {
    const maxPer = Math.max(2, parseInt(f.maxPerGroup)||4);
```

**Edit `index.html`** — find:

```js
  let minutes;
  if(t.format.formatType==='knockout'){
```

replace with:

```js
  let minutes;
  if(t.format.formatType==='podknockout'){
    minutes = podsEstimateMinutes(t, boards) || 0;
  } else if(t.format.formatType==='knockout'){
```

**Edit `index.html`** — find:

```js
  if(formatType==='knockout'){
    const startMs = anticipatedStartEpoch(tt);
```

replace with:

```js
  if(formatType==='podknockout'){
    const podMinutes = podsEstimateMinutes(t, boards);
    const podStartMs = anticipatedStartEpoch(tt);
    return '<div class="recommend">'+(line('Estimated duration:', podMinutes, podStartMs!=null && podMinutes!=null ? podStartMs+podMinutes*60000 : null) || '<div>Choose a valid number of groups to estimate duration.</div>')+'</div>';
  }

  if(formatType==='knockout'){
    const startMs = anticipatedStartEpoch(tt);
```

**Edit `index.html`** — find:

```js
  if(!t || t.format.formatType==='knockout') return false;
```

replace with:

```js
  if(!t || t.format.formatType==='knockout' || t.format.formatType==='podknockout') return false;
```

- [ ] **Step 6: Edit `index.html` (Stage 2 screen and save)**

**Edit `index.html`** — find:

```js
      '<div class="choice'+(f.formatType==='rrknockout'?' selected':'')+'" onclick="setFormatType(\'rrknockout\')"><strong>Round robin → Knockout</strong><small>Group stage, then top finishers go to a bracket</small></div>'+
```

replace with:

```js
      '<div class="choice'+(f.formatType==='rrknockout'?' selected':'')+'" onclick="setFormatType(\'rrknockout\')"><strong>Round robin → Knockout</strong><small>Group stage, then top finishers go to a bracket</small></div>'+
      '<div class="choice'+(f.formatType==='podknockout'?' selected':'')+'" onclick="setFormatType(\'podknockout\')"><strong>Group Boards</strong><small>Small knockout groups on their own boards, winners go to a Finals bracket</small></div>'+
```

**Edit `index.html`** — find:

```js
  let formatSectionHTML;
  if(f.formatType==='rrknockout'){
```

replace with:

```js
  let formatSectionHTML;
  if(f.formatType==='podknockout'){
    formatSectionHTML = formatPickerHTML + podsFormatFieldsHTML() + teamSectionHTML;
  } else if(f.formatType==='rrknockout'){
```

**Edit `index.html`** — find:

```js
  if(isTeamUnit(state) && state.eventCreation.competitionUnit==='Teams'){
    const sizeEl = document.getElementById('f_teamsize');
```

replace with:

```js
  if(f.formatType==='podknockout') podsReadFormat(f);
  if(isTeamUnit(state) && state.eventCreation.competitionUnit==='Teams'){
    const sizeEl = document.getElementById('f_teamsize');
```

**Edit `index.html`** — find:

```js
  if(advanced && (f.formatType==='knockout' || f.formatType==='rrknockout')) readKnockoutLegs('main');
```

replace with:

```js
  if(advanced && (f.formatType==='knockout' || f.formatType==='rrknockout' || f.formatType==='podknockout')) readKnockoutLegs('main');
  if(f.formatType==='podknockout' && !podsValidate(state).ok){
    persist();
    openModal({title:'Check the number of groups', body:podsValidate(state).message, confirmLabel:'OK', confirmClass:'primary', onConfirm:()=>{}});
    render();
    return;
  }
```

- [ ] **Step 7: Run to verify pass**

Run: `node --test tests/pods-format.test.js` then `npm test`
Expected: all pass (the snapshot is unchanged).

- [ ] **Step 8: Checkpoint**

Run: `npm test` and `git status --short`.

---

### Task 8: The Draw screen (Stage 3)

**Files:**
- Modify: `pods-ui.js` (append)
- Modify: `index.html` (`stage3` dispatch)
- Create: `tests/pods-ui-draw.test.js`

**Interfaces:**
- Consumes: Tasks 2 to 7, plus existing `stage3Knockout()` (the Participants and Seeding panel), `competitionDurationSummaryHTML(t)`, `openModal`, `persist`, `render`, `goStage`.
- Produces in `pods-ui.js`:
  - `podsStage3() -> html`
  - `podsCardsHTML(pods) -> html`
  - `podsDrawNow()`, `podsDrawClick()`
  - `setPodBoards(podId, text)` (comma or space separated board numbers)
  - `podsMoveModal(entryId)`, `podsMoveFillSwap()`

- [ ] **Step 1: Write the failing tests**

Write `tests/pods-ui-draw.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, plain, useState, seededRng, makeTournament, play } = require('./lib/helpers');

const app = loadApp();
const f = (name) => run(app, name);
function fresh(n, pods, opts) { const t = makeTournament(app, n, Object.assign({ pods }, opts || {})); useState(app, t); app.persist = () => {}; app.render = () => {}; return t; }
function drawn(n, pods, opts) { const t = fresh(n, pods, opts); f('generatePods')(t, seededRng(2)); return t; }

test('before the draw: participants panel, a Draw groups button and no cards', () => {
  fresh(12, 3);
  const html = f('podsStage3')();
  assert.match(html, /Participants/); assert.match(html, /Draw groups/);
  assert.doesNotMatch(html, /Group 1/);
});

test('after the draw: a card per group with players, a boards field and Move buttons', () => {
  const t = drawn(12, 3);
  const html = f('podsStage3')();
  assert.match(html, /Redraw groups/); assert.match(html, /Group 1/); assert.match(html, /Group 3/);
  assert.equal((html.match(/podsMoveModal\(/g) || []).length, 12);
  assert.match(html, /setPodBoards\(/);
  assert.match(html, new RegExp(t.pods[0].entryIds[0] ? 'Player ' : 'x'));
});

test('an invalid number of groups explains the problem and disables the draw', () => {
  fresh(7, 4);
  const html = f('podsStage3')();
  assert.match(html, /Check the number of groups/);
  assert.match(html, /disabled onclick="podsDrawClick\(\)"/);
});

test('once scores exist the groups cannot be redrawn or moved', () => {
  const t = drawn(12, 3);
  play(t.pods[0].bracket.rounds[0].find((m) => m.aEntryId && m.bEntryId), 'a');
  const html = f('podsStage3')();
  assert.match(html, /can't be redrawn/);
  assert.match(html, /disabled onclick="podsDrawClick\(\)"/);
  const firstCard = html.split('Group 2')[0];
  assert.doesNotMatch(firstCard, /podsMoveModal\(/);
});

test('drawing groups from the screen builds them; a bad setting shows a message instead', () => {
  const t = fresh(12, 3);
  f('podsDrawNow')();
  assert.equal(t.pods.length, 3);
  let modal = null; app.openModal = (o) => { modal = o; };
  const bad = fresh(7, 4);
  f('podsDrawNow')();
  assert.equal(bad.pods.length, 0); assert.match(modal.body, /at most 3 groups/);
});

test('redrawing asks first, and does nothing once scores exist', () => {
  const t = drawn(12, 3);
  let modal = null; app.openModal = (o) => { modal = o; };
  f('podsDrawClick')();
  assert.equal(modal.title, 'Redraw groups?');
  const before = plain(t.pods.map((p) => p.id));
  modal.onConfirm();
  assert.notDeepEqual(plain(t.pods.map((p) => p.id)), before);
  modal = null;
  play(t.pods[0].bracket.rounds[0].find((m) => m.aEntryId && m.bEntryId), 'a');
  f('podsDrawClick')();
  assert.equal(modal, null);
});

test('board numbers can be typed per group; blanks and locked groups are ignored', () => {
  const t = drawn(12, 3);
  const pod = t.pods[0];
  f('setPodBoards')(pod.id, '4, 2 2');
  assert.deepEqual(plain(pod.boards), [2, 4]);
  f('setPodBoards')(pod.id, '');
  assert.deepEqual(plain(pod.boards), [2, 4]);
  pod.confirmed = true;
  f('setPodBoards')(pod.id, '9');
  assert.deepEqual(plain(pod.boards), [2, 4]);
});

test('Move… moves a player, or swaps with the chosen player', () => {
  const t = drawn(12, 3);
  const els = { mvTo: { value: '', innerHTML: '' }, mvSwap: { value: '', innerHTML: '' } };
  let modal = null;
  app.openModal = (o) => { modal = o; };
  app.document = { getElementById: (id) => els[id] || null };
  const mover = t.pods[0].entryIds[0], target = t.pods[1];
  f('podsMoveModal')(mover);
  assert.match(modal.bodyHTML, /Group 2/); assert.doesNotMatch(modal.bodyHTML, /Group 1 \(/);
  els.mvTo.value = target.id; els.mvSwap.value = '';
  assert.equal(modal.onConfirm(), undefined);
  assert.ok(target.entryIds.includes(mover));
  const other = t.pods[2].entryIds[0];
  f('podsMoveModal')(mover);
  els.mvTo.value = t.pods[2].id; els.mvSwap.value = other;
  assert.equal(modal.onConfirm(), undefined);
  assert.ok(t.pods[2].entryIds.includes(mover) && target.entryIds.includes(other));
  els.mvTo.value = target.id; els.mvSwap.value = '';
  t.pods[2].confirmed = true;
  const r = modal.onConfirm();
  assert.ok(r && r.error);
});

test('stage 3 for Group Boards shows the groups screen, not the round-robin one', () => {
  fresh(12, 3);
  const html = f('stage3')();
  assert.match(html, /Draw groups/);
  assert.match(html, /Estimated duration/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/pods-ui-draw.test.js`
Expected: FAIL (`podsStage3 is not defined`).

- [ ] **Step 3: Append to `pods-ui.js`**

```js
/* ---------- Stage 3: chart details (participants, seeding, drawing the groups) ---------- */
function podsSeedBadge(id, seeds){ return seeds[id] ? '<span class="num" style="margin-right:6px">'+seeds[id]+'</span>' : ''; }

function podsCardsHTML(pods){
  var seeds = podsOverallSeeds(state);
  return '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;margin-top:14px">'+
    pods.map(function(p){
      var editable = podsCanEdit(p);
      var rows = p.entryIds.map(function(id){
        var e = state.entriesList.find(function(x){ return x.id === id; }) || {};
        return '<div style="display:flex;justify-content:space-between;align-items:center;gap:6px;padding:3px 0;font-size:13px">'+
          '<span>'+podsSeedBadge(id, seeds)+escapeHtml(e.name || '')+(e.org ? ' <small style="color:var(--muted)">'+escapeHtml(e.org)+'</small>' : '')+'</span>'+
          (editable ? '<button class="btn ghost" style="padding:2px 8px;font-size:11px" onclick="podsMoveModal(\''+id+'\')">Move…</button>' : '')+'</div>';
      }).join('');
      return '<div style="border:1px solid var(--line);border-radius:10px;padding:10px 12px">'+
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px"><strong>Group '+escapeHtml(p.label)+'</strong>'+
          '<span class="hint" style="margin:0">'+p.entryIds.length+' players</span></div>'+
        '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;font-size:12px"><label style="margin:0">Board'+(p.boards.length === 1 ? '' : 's')+'</label>'+
          '<input type="text" style="width:90px;height:28px;font-size:12px" value="'+p.boards.join(', ')+'" '+(editable ? '' : 'disabled ')+'onchange="setPodBoards(\''+p.id+'\',this.value)"></div>'+
        rows+'</div>';
    }).join('')+'</div>';
}

function podsStage3(){
  var t = state, pods = podsList(t), v = podsValidate(t), scored = podsAnyScores(t);
  var html = stage3Knockout();   // the Participants & Seeding panel, same as the knockout format
  html += '<div class="card"><h2>Groups</h2><p class="intro">'+
    (pods.length ? 'Check the draw below. Use Move… to move or swap a player before you confirm the groups.'
                 : 'Deals every player into '+(parseInt(t.format.podCount) || 0)+' groups, one board each. Seeded players are spread across the groups, one per group.')+'</p>'+
    (!v.ok ? '<div class="confirm-box" style="background:#fff8e5;border-color:#e8c86e;color:#65501d"><b>Check the number of groups</b>'+escapeHtml(v.message)+' <span style="text-decoration:underline;cursor:pointer" onclick="goStage(2)">Change it in Format &amp; branding</span></div>' : '')+
    '<div class="buttonrow"><button class="btn primary" '+(v.ok && !scored ? '' : 'disabled ')+'onclick="podsDrawClick()">'+(pods.length ? 'Redraw groups' : 'Draw groups')+'</button>'+
      (pods.length ? '<button class="btn secondary" onclick="goStage(4)">Continue to confirm →</button>' : '')+'</div>'+
    (scored ? '<div class="hint">Groups can\'t be redrawn once scores have been entered.</div>' : '')+
    (pods.length ? podsCardsHTML(pods) : '')+'</div>';
  return html;
}

function podsDrawNow(){
  var r = generatePods(state);
  if(!r.ok){ openModal({ title:'Can\'t draw the groups', body:r.message, confirmLabel:'OK', confirmClass:'primary', onConfirm:function(){} }); return; }
  persist(); render();
}
function podsDrawClick(){
  if(podsAnyScores(state)) return;
  if(!podsList(state).length){ podsDrawNow(); return; }
  openModal({ title:'Redraw groups?', body:'Everyone is dealt again from the current seed order. Moves you made by hand, and any confirmed groups, are discarded.',
    confirmLabel:'Redraw', confirmClass:'danger', onConfirm:function(){ podsDrawNow(); } });
}

/* Board numbers typed as "2, 4" or "2 4". Blank or invalid input leaves the boards as they were. */
function setPodBoards(podId, text){
  var pod = podsList(state).find(function(p){ return p.id === podId; });
  if(!pod || !podsCanEdit(pod)) return;
  var nums = String(text).split(/[\s,]+/).map(function(x){ return parseInt(x); }).filter(function(n){ return n > 0; });
  if(!nums.length){ render(); return; }
  pod.boards = nums.filter(function(n, i){ return nums.indexOf(n) === i; }).sort(function(a, b){ return a - b; });
  persist(); render();
}

function podsMoveFillSwap(){
  var to = document.getElementById('mvTo'), sw = document.getElementById('mvSwap');
  if(!to || !sw) return;
  var pod = podsList(state).find(function(p){ return p.id === to.value; });
  sw.innerHTML = '<option value="">No swap</option>'+(pod ? pod.entryIds.map(function(id){
    return '<option value="'+id+'">'+escapeHtml((state.entriesList.find(function(e){ return e.id === id; }) || {}).name || '')+'</option>';
  }).join('') : '');
}
function podsMoveModal(entryId){
  var from = podsFindOf(state, entryId);
  if(!from) return;
  var name = (state.entriesList.find(function(e){ return e.id === entryId; }) || {}).name || '';
  var opts = podsList(state).filter(function(p){ return p.id !== from.id && podsCanEdit(p); }).map(function(p){
    return '<option value="'+p.id+'">Group '+escapeHtml(p.label)+' ('+p.entryIds.length+' players)</option>';
  }).join('');
  openModal({
    title:'Move '+name,
    bodyHTML: opts
      ? '<div class="field"><label>To group</label><select id="mvTo" onchange="podsMoveFillSwap()">'+opts+'</select></div>'+
        '<div class="field"><label>Swap with (optional)</label><select id="mvSwap"></select></div>'+
        '<div class="hint">Leave "No swap" to just move the player. The other group then has one more player.</div>'
      : '<p>There is no other group that can be changed. Unconfirm a group first.</p>',
    confirmLabel:'Move', confirmClass:'primary',
    onConfirm:function(){
      var to = document.getElementById('mvTo'), sw = document.getElementById('mvSwap');
      if(!to) return;
      var r = sw && sw.value ? podsSwapPlayers(state, entryId, sw.value) : podsMovePlayer(state, entryId, to.value);
      if(!r.ok) return { error: r.message };
      persist(); render();
    }
  });
  podsMoveFillSwap();
}
```

- [ ] **Step 4: Edit `index.html` (dispatch)**

**Edit `index.html`** — find:

```js
function stage3(){
  if(state.format.formatType==='knockout'){
```

replace with:

```js
function stage3(){
  if(state.format.formatType==='podknockout') return competitionDurationSummaryHTML(state) + podsStage3();
  if(state.format.formatType==='knockout'){
```

- [ ] **Step 5: Run to verify pass**

Run: `node --test tests/pods-ui-draw.test.js` then `npm test`
Expected: all pass.

- [ ] **Step 6: Checkpoint**

Run: `npm test` and `git status --short`.

---

### Task 9: The Confirm and Manage screens (Stages 4 and 5)

**Files:**
- Modify: `pods-ui.js` (append)
- Modify: `index.html` (`stage4`, `stage5` dispatch)
- Create: `tests/pods-ui-manage.test.js`

**Interfaces:**
- Consumes: Tasks 2 to 8, plus existing `checkInCardHTML()`, `mirroredChartHTML` (render.js), `publicResultsCardHTML()`, `incidentLogCardHTML()`.
- Produces in `pods-ui.js`:
  - `podsStage4() -> html`; `podsConfirmClick(id)`, `podsConfirmAllClick()`, `podsUnconfirmClick(id)`
  - `podsStage5() -> html`; `podsSelect(v)`, `podsSetFilter(v)`; module state `podsManageSel` (`'grid' | 'finals' | <group id>`), `podsManageFilter` (`'all' | 'open' | 'done'`)
  - `podStatusText(pod) -> {text, color}`

- [ ] **Step 1: Write the failing tests**

Write `tests/pods-ui-manage.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, useState, seededRng, makeTournament, play, playOut } = require('./lib/helpers');

const app = loadApp();
const f = (name) => run(app, name);
function drawn(n, pods) {
  const t = makeTournament(app, n, { pods }); useState(app, t);
  app.persist = () => {}; app.render = () => {};
  f('generatePods')(t, seededRng(2));
  return t;
}

test('confirm screen before any draw points back to chart details', () => {
  const t = makeTournament(app, 12, { pods: 3 }); useState(app, t);
  assert.match(f('podsStage4')(), /Draw the groups in Chart details first/);
});

test('confirm screen lists each group with Confirm links, and builds the Finals when all are confirmed', () => {
  const t = drawn(12, 3);
  let html = f('podsStage4')();
  assert.match(html, /0 of 3/); assert.match(html, /Not built yet/);
  assert.equal((html.match(/podsConfirmClick\(/g) || []).length, 3);
  f('podsConfirmClick')(t.pods[0].id);
  assert.equal(t.pods[0].confirmed, true); assert.equal(t.knockout, null);
  f('podsConfirmAllClick')();
  assert.ok(t.knockout);
  html = f('podsStage4')();
  assert.match(html, /3 of 3/); assert.match(html, /slot chart built/);
  assert.match(html, /Winner of Group/);
});

test('unconfirming is refused with a message once a group has scores', () => {
  const t = drawn(12, 3);
  f('podsConfirmAllClick')();
  play(t.pods[0].bracket.rounds[0].find((m) => m.aEntryId && m.bEntryId), 'a');
  let modal = null; app.openModal = (o) => { modal = o; };
  f('podsUnconfirmClick')(t.pods[0].id);
  assert.match(modal.body, /already has scores/);
  assert.equal(t.pods[0].confirmed, true);
});

test('manage screen needs at least one confirmed group', () => {
  drawn(12, 3);
  assert.match(f('podsStage5')(), /Confirm the groups in Confirm/);
});

test('manage grid shows every group with its status and progress', () => {
  const t = drawn(12, 3);
  f('podsConfirmAllClick')();
  let html = f('podsStage5')();
  assert.match(html, /0 of 3<\/b> groups finished/);
  assert.match(html, /Group 1/); assert.match(html, /Not started/);
  playOut(app, t.pods[0].bracket, () => 'a'); f('syncFinalsFromPods')(t);
  html = f('podsStage5')();
  assert.match(html, /1 of 3<\/b> groups finished/); assert.match(html, /Winner: /);
});

test('the filter shows only finished or unfinished groups', () => {
  const t = drawn(12, 3);
  f('podsConfirmAllClick')();
  playOut(app, t.pods[0].bracket, () => 'a'); f('syncFinalsFromPods')(t);
  f('podsSetFilter')('done');
  let html = f('podsStage5')();
  assert.match(html, /podsSelect\('/); assert.equal((html.match(/Winner: /g) || []).length, 1);
  f('podsSetFilter')('open');
  html = f('podsStage5')();
  assert.doesNotMatch(html, /Winner: /);
  f('podsSetFilter')('all');
});

test('opening a group shows its chart; scoring is available only for confirmed groups', () => {
  const t = drawn(12, 3);
  f('podsConfirmClick')(t.pods[1].id);   // the screen needs at least one confirmed group
  f('podsSelect')(t.pods[0].id);
  let html = f('podsStage5')();
  assert.match(html, /Confirm this group/);
  f('podsConfirmClick')(t.pods[0].id);
  html = f('podsStage5')();
  assert.match(html, /koMatchScoreModal\('pod:/);
  assert.doesNotMatch(html, /Confirm this group/);
  f('podsSelect')('grid');
});

test('the Finals tab appears once built, and its matches become clickable as groups finish', () => {
  const t = drawn(12, 3);
  f('podsConfirmAllClick')();
  f('podsSelect')('finals');
  let html = f('podsStage5')();
  assert.match(html, /Winner of Group/);
  assert.doesNotMatch(html, /koMatchScoreModal\('knockout'/);
  t.pods.forEach((p) => { playOut(app, p.bracket, () => 'a'); f('syncFinalsFromPods')(t); });
  html = f('podsStage5')();
  assert.match(html, /koMatchScoreModal\('knockout'/);
  f('podsSelect')('grid');
});

test('stages 4 and 5 route to the Group Boards screens', () => {
  const t = drawn(12, 3);
  f('podsConfirmAllClick')();
  assert.match(f('stage4')(), /Confirm groups/);
  assert.match(f('stage5')(), /Manage tournament/);
  assert.match(f('stage5')(), /groups finished/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/pods-ui-manage.test.js`
Expected: FAIL (`podsStage4 is not defined`).

- [ ] **Step 3: Append to `pods-ui.js`**

```js
/* ---------- Stage 4: confirm the groups, build the Finals ---------- */
function podsStage4(){
  var t = state, pods = podsList(t), prog = podsProgress(t);
  var html = competitionDurationSummaryHTML(t) + checkInCardHTML();
  if(!pods.length){
    return html + '<div class="card"><h2>Confirm groups</h2><p class="intro">Draw the groups in Chart details first.</p><div class="buttonrow"><button class="btn primary" onclick="goStage(3)">Go to chart details</button></div></div>';
  }
  html += '<div class="card"><h2>Confirm groups &amp; build the Finals</h2>'+
    '<p class="intro">Confirm each group once its draw is right. When the last group is confirmed, the Finals chart is built with "Winner of Group N" placeholders. A group with scores can\'t be unconfirmed.</p>'+
    '<div class="summary-grid" style="margin-bottom:12px"><div><label>Groups confirmed</label><strong>'+prog.confirmed+' of '+prog.total+'</strong></div>'+
      '<div><label>Finals</label><strong>'+(t.knockout ? t.knockout.size+'-slot chart built' : 'Not built yet')+'</strong></div></div>'+
    '<div class="buttonrow"><button class="btn primary" '+(prog.confirmed === prog.total ? 'disabled ' : '')+'onclick="podsConfirmAllClick()">Confirm all groups</button>'+
      (t.knockout ? '<button class="btn secondary" onclick="doFinalPrint()">Print bracket pack</button><button class="btn primary" onclick="goStage(5)">Continue to manage tournament →</button>' : '')+'</div>'+
    '<div class="printlist">'+pods.map(function(p){
      return '<div><span>Group '+escapeHtml(p.label)+' — '+p.entryIds.length+' players · '+podBoardLabel(p)+'</span><span>'+
        (p.confirmed
          ? '<b style="color:#1d8a4a">Confirmed</b> <a href="javascript:void(0)" style="font-size:11px" onclick="podsUnconfirmClick(\''+p.id+'\')">Unconfirm</a>'
          : '<b style="color:#c0392b">Not confirmed</b> <a href="javascript:void(0)" style="font-size:11px" onclick="podsConfirmClick(\''+p.id+'\')">Confirm</a>')+'</span></div>';
    }).join('')+'</div></div>';
  if(t.knockout) html += '<div class="card"><h3 style="margin:0 0 10px">Finals</h3><div class="mko-artboard-scroll">'+mirroredChartHTML(t.knockout, t, {interactive:false})+'</div></div>';
  return html;
}
function podsConfirmClick(id){ podsConfirm(state, id); persist(); render(); }
function podsConfirmAllClick(){ podsConfirmAll(state); persist(); render(); }
function podsUnconfirmClick(id){
  var r = podsUnconfirm(state, id);
  if(!r.ok){ openModal({ title:'Can\'t unconfirm', body:r.message, confirmLabel:'OK', confirmClass:'primary', onConfirm:function(){} }); return; }
  persist(); render();
}

/* ---------- Stage 5: manage the tournament ---------- */
var podsManageSel = 'grid';     // 'grid' | 'finals' | a group id
var podsManageFilter = 'all';   // 'all' | 'open' | 'done'
function podsSelect(v){ podsManageSel = v; render(); }
function podsSetFilter(v){ podsManageFilter = v; render(); }

function podStatusText(p){
  if(!p.confirmed) return { text:'Not confirmed', color:'#c0392b' };
  var c = podMatchCounts(p), w = podChampion(p);
  if(w) return { text:'Winner: '+((state.entriesList.find(function(e){ return e.id === w; }) || {}).name || ''), color:'#1d8a4a' };
  if(!c.done) return { text:'Not started', color:'var(--muted)' };
  return { text:'In progress · '+c.done+' of '+c.total+' matches', color:'#b7791f' };
}
function podsFilterBarHTML(){
  function b(v, label){ return '<button class="btn '+(podsManageFilter === v ? 'primary' : 'ghost')+'" style="padding:6px 12px;font-size:12px" onclick="podsSetFilter(\''+v+'\')">'+label+'</button>'; }
  return '<div class="buttonrow" style="margin:0 0 10px">'+b('all', 'All')+b('open', 'Unfinished')+b('done', 'Finished')+'</div>';
}
function podsGridHTML(pods){
  var list = pods.filter(function(p){ return podsManageFilter === 'all' || (podsManageFilter === 'done') === podIsFinished(p); });
  if(!list.length) return '<p class="intro">No groups to show.</p>';
  return '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px">'+list.map(function(p){
    var st = podStatusText(p);
    return '<div onclick="podsSelect(\''+p.id+'\')" style="cursor:pointer;border:1px solid var(--line);border-radius:10px;padding:10px 12px">'+
      '<div style="display:flex;justify-content:space-between"><strong>Group '+escapeHtml(p.label)+'</strong><span class="hint" style="margin:0">'+podBoardLabel(p)+'</span></div>'+
      '<div style="font-size:12px;color:'+st.color+';margin-top:4px">'+escapeHtml(st.text)+'</div></div>';
  }).join('')+'</div>';
}
function podsStage5(){
  var t = state, pods = podsList(t);
  if(!pods.some(function(p){ return p.confirmed; })){
    return '<div class="card"><h2>Manage tournament</h2>'+competitionDurationSummaryHTML(t)+'<p class="intro">Confirm the groups in Confirm &amp; Print Bracket before you can enter results here.</p><div class="buttonrow"><button class="btn primary" onclick="goStage(4)">Confirm groups</button></div></div>';
  }
  var prog = podsProgress(t), sel = podsManageSel;
  var selPod = pods.find(function(p){ return p.id === sel; });
  if(sel !== 'grid' && sel !== 'finals' && !selPod) sel = podsManageSel = 'grid';
  if(sel === 'finals' && !t.knockout) sel = podsManageSel = 'grid';
  var html = '<div class="card"><div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap"><h2 style="margin:0">Manage tournament</h2>'+
    '<span class="hint" style="margin:0"><b>'+prog.finished+' of '+prog.total+'</b> groups finished</span></div>'+
    '<p class="intro">Open a group to enter its results. Each group winner moves into the Finals automatically.</p>'+competitionDurationSummaryHTML(t)+
    '<div class="buttonrow" style="margin-bottom:10px">'+
      '<button class="btn '+(sel === 'grid' ? 'primary' : 'secondary')+'" onclick="podsSelect(\'grid\')">All groups</button>'+
      (t.knockout ? '<button class="btn '+(sel === 'finals' ? 'primary' : 'secondary')+'" onclick="podsSelect(\'finals\')">Finals</button>'
                  : '<span class="hint" style="margin:0 0 0 6px">The Finals is built once every group is confirmed.</span>')+
    '</div>';
  if(sel === 'grid'){
    html += podsFilterBarHTML() + podsGridHTML(pods);
  } else if(sel === 'finals'){
    html += '<div class="mko-artboard-scroll">'+mirroredChartHTML(t.knockout, t, {interactive:true, bracketKey:'knockout'})+'</div>';
  } else {
    html += '<div class="buttonrow" style="margin-bottom:10px"><button class="btn ghost" onclick="podsSelect(\'grid\')">← All groups</button></div>'+
      '<h3 style="margin:0 0 8px">Group '+escapeHtml(selPod.label)+' · '+podBoardLabel(selPod)+'</h3>'+
      (selPod.confirmed ? '' : '<div class="confirm-box">Confirm this group in Confirm &amp; Print Bracket before entering results.</div>')+
      '<div class="mko-artboard-scroll">'+mirroredChartHTML(selPod.bracket, t, {interactive:selPod.confirmed, bracketKey:podBracketKey(selPod)})+'</div>';
  }
  html += '</div>';
  html += publicResultsCardHTML();
  html += incidentLogCardHTML();
  return html;
}
```

- [ ] **Step 4: Edit `index.html` (dispatch)**

**Edit `index.html`** — find:

```js
function stage4(){
  if(state.format.formatType==='knockout') return stage4Knockout();
```

replace with:

```js
function stage4(){
  if(state.format.formatType==='podknockout') return podsStage4();
  if(state.format.formatType==='knockout') return stage4Knockout();
```

**Edit `index.html`** — find:

```js
function stage5(){
  if(state.format.formatType==='knockout') return stage5Knockout();
```

replace with:

```js
function stage5(){
  if(state.format.formatType==='podknockout') return podsStage5();
  if(state.format.formatType==='knockout') return stage5Knockout();
```

- [ ] **Step 5: Run to verify pass**

Run: `node --test tests/pods-ui-manage.test.js` then `npm test`
Expected: all pass.

- [ ] **Step 6: Checkpoint**

Run: `npm test` and `git status --short`.

---

### Task 10: Results and Print screens (Stages 6 and 7)

**Files:**
- Modify: `pods-ui.js` (append)
- Modify: `index.html` (`stage6`, `stage7`, `doFinalPrint` dispatch)
- Create: `tests/pods-ui-print.test.js`

**Interfaces:**
- Consumes: Tasks 2 to 9, plus existing `knockoutPlacementsCard(bracket, title)`, `bracketRunnerUp` (render.js), `rulesSheetHTML()`, `rulesSheetToggleHTML()`, `koPaperSizeSelectHTML()`, `toggleSponsorFooter`, `knockoutBracketSheetHTML(bracket, opts)` (Task 6).
- Produces in `pods-ui.js`: `podsStage6() -> html`, `podsStage7() -> html`, `podsPrintClick()`.

- [ ] **Step 1: Write the failing tests**

Write `tests/pods-ui-print.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, useState, seededRng, makeTournament, playOut } = require('./lib/helpers');

const app = loadApp();
const f = (name) => run(app, name);
function ready(n, pods) {
  const t = makeTournament(app, n, { pods }); useState(app, t);
  app.persist = () => {}; app.render = () => {};
  f('generatePods')(t, seededRng(2)); f('podsConfirmAll')(t);
  return t;
}
function finishGroups(t) { t.pods.forEach((p) => { playOut(app, p.bracket, () => 'a'); f('syncFinalsFromPods')(t); }); }

test('results screen lists each group winner and runner-up, then the Finals placings', () => {
  const t = ready(12, 3);
  finishGroups(t);
  const html = f('podsStage6')();
  assert.match(html, /Group winners/);
  const winner = t.entriesList.find((e) => e.id === t.pods[0].winnerId).name;
  assert.ok(html.includes(winner));
  assert.match(html, /Not complete yet/);   // the Finals has not been played
  playOut(app, t.knockout, () => 'a');
  assert.match(f('podsStage6')(), /Winner: /);
});

test('results screen with no groups says so', () => {
  const t = makeTournament(app, 12, { pods: 3 }); useState(app, t);
  assert.match(f('podsStage6')(), /No groups yet/);
});

test('print screen counts the group sheets and enables printing', () => {
  const t = ready(12, 3);
  const html = f('podsStage7')();
  assert.match(html, /Group sheets/); assert.match(html, />3</);
  assert.match(html, /doFinalPrint\(\)/); assert.doesNotMatch(html, /disabled onclick="doFinalPrint/);
});

test('printing builds one sheet per group plus the Finals', () => {
  const t = ready(12, 3);
  const mount = { innerHTML: '' };
  app.document = { getElementById: (id) => (id === 'printSheets' ? mount : null) };
  app.window = { print() {} };
  f('podsPrintClick')();
  assert.equal(t.printedPack, true);
  assert.equal((mount.innerHTML.match(/GROUP \d/g) || []).length >= 3, true);
  assert.match(mount.innerHTML, /Group 1 · Board 1/);
  assert.match(mount.innerHTML, /FINALS/);
});

test('printing with no groups shows a message instead', () => {
  const t = makeTournament(app, 12, { pods: 3 }); useState(app, t);
  let modal = null; app.openModal = (o) => { modal = o; };
  f('podsPrintClick')();
  assert.match(modal.body, /Draw the groups first/);
});

test('stages 6 and 7, and the print button, route to the Group Boards versions', () => {
  const t = ready(12, 3);
  assert.match(f('stage6')(), /Group winners/);
  assert.match(f('stage7')(), /Group sheets/);
  const mount = { innerHTML: '' };
  app.document = { getElementById: (id) => (id === 'printSheets' ? mount : null) };
  app.window = { print() {} };
  f('doFinalPrint')();
  assert.match(mount.innerHTML, /Group 1/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/pods-ui-print.test.js`
Expected: FAIL (`podsStage6 is not defined`).

- [ ] **Step 3: Append to `pods-ui.js`**

```js
/* ---------- Stage 6: results ---------- */
function podsStage6(){
  var t = state, pods = podsList(t);
  if(!pods.length) return '<div class="card"><p class="intro" style="margin:0">No groups yet. Draw them in Chart details.</p></div>';
  function name(id){ return id ? ((t.entriesList.find(function(e){ return e.id === id; }) || {}).name || '—') : '—'; }
  var rows = pods.map(function(p){
    var w = podChampion(p), r = w ? bracketRunnerUp(p.bracket) : null;
    return '<tr><td class="l">'+escapeHtml(p.label)+'</td><td class="l">'+escapeHtml(name(w))+'</td><td class="l">'+escapeHtml(name(r))+'</td><td class="dim">'+podBoardLabel(p)+'</td></tr>';
  }).join('');
  var html = '<div class="card"><h2>Finalize standings</h2><p class="intro">Group winners and Finals placings. Read-only: fix a result in Manage Tournament if needed.</p></div>'+
    '<div class="card"><h3 style="margin:0 0 10px;font-size:15px">Group winners</h3><div style="overflow-x:auto"><table class="std-table"><thead><tr><th class="l">Group</th><th class="l">Winner</th><th class="l">Runner-up</th><th>Board</th></tr></thead><tbody>'+rows+'</tbody></table></div></div>';
  if(t.knockout) html += knockoutPlacementsCard(t.knockout, 'Finals');
  html += '<div class="print-controls"><button class="btn secondary" onclick="goStage(5)">Back to manage tournament</button><button class="btn primary" onclick="goStage(7)">Continue to print →</button></div>';
  return html;
}

/* ---------- Stage 7: print ---------- */
function podsStage7(){
  var t = state, pods = podsList(t), built = !!t.knockout;
  return '<div class="card"><h2>Print final chart</h2><p class="intro">Prints one sheet per group, then the Finals, with results filled in, as a high-resolution A4 landscape PDF.</p>'+
    '<div class="summary-grid" style="margin-bottom:12px"><div><label>Group sheets</label><strong>'+pods.length+'</strong></div>'+
      '<div><label>Finals</label><strong>'+(built ? 'Included' : 'Not built yet')+'</strong></div></div>'+
    '<div class="toggle-row"><input type="checkbox" id="sponsorToggle" '+(t.printSettings.sponsorFooterEnabled ? 'checked' : '')+' onchange="toggleSponsorFooter(this.checked)"> <label for="sponsorToggle">Include sponsor footer on printed charts</label></div>'+
    rulesSheetToggleHTML()+(built ? koPaperSizeSelectHTML() : '')+
    '<div class="buttonrow"><button class="btn secondary" onclick="goStage(6)">Back to standings</button>'+
      '<button class="btn '+(pods.length ? 'primary' : 'secondary')+'" '+(pods.length ? '' : 'disabled ')+'onclick="doFinalPrint()">Print final chart — Save high-res A4 PDF</button></div></div>';
}
function podsPrintClick(){
  var t = state, pods = podsList(t);
  if(!pods.length){ openModal({ title:'No groups yet', body:'Draw the groups first.', confirmLabel:'OK', confirmClass:'primary', onConfirm:function(){} }); return; }
  t.printedPack = true; persist();
  var html = '';
  if(t.printSettings.rulesSheetEnabled) html += rulesSheetHTML();
  pods.forEach(function(p){ html += knockoutBracketSheetHTML(p.bracket, { podLegs:true, stage:'Group '+p.label+' · '+podBoardLabel(p) }); });
  if(t.knockout) html += knockoutBracketSheetHTML(t.knockout);
  document.getElementById('printSheets').innerHTML = html;
  setTimeout(function(){ window.print(); }, 60);
}
```

- [ ] **Step 4: Edit `index.html` (dispatch)**

**Edit `index.html`** — find:

```js
function stage6(){
  if(state.format.formatType==='knockout') return stage6Knockout();
```

replace with:

```js
function stage6(){
  if(state.format.formatType==='podknockout') return podsStage6();
  if(state.format.formatType==='knockout') return stage6Knockout();
```

**Edit `index.html`** — find:

```js
function stage7(){
  if(state.format.formatType==='knockout') return stage7Knockout();
```

replace with:

```js
function stage7(){
  if(state.format.formatType==='podknockout') return podsStage7();
  if(state.format.formatType==='knockout') return stage7Knockout();
```

**Edit `index.html`** — find:

```js
  if(blockForUnresolvedTies()) return;
  if(state.format.formatType==='knockout'){
```

replace with:

```js
  if(blockForUnresolvedTies()) return;
  if(state.format.formatType==='podknockout'){ podsPrintClick(); return; }
  if(state.format.formatType==='knockout'){
```

- [ ] **Step 5: Run to verify pass**

Run: `node --test tests/pods-ui-print.test.js` then `npm test`
Expected: all pass.

- [ ] **Step 6: Checkpoint**

Run: `npm test` and `git status --short`. The organiser side is now complete and every stage works for Group Boards.

---

### Task 11: Publish groups in the public view

**Files:**
- Modify: `viewer/api/_lib/publicView.js`
- Create: `tests/public-view.test.js`

**Interfaces:**
- Consumes: the tournament shape from Tasks 2 to 5.
- Produces: `toPublicView(data)` now also returns `pods: [{ id, label, boards, entryIds, winnerId, bracket }]` (confirmed groups only; `bracket` goes through `publicBracket`), brackets keep `podLabel` and `podFinals`, matches keep `aFromPod` and `bFromPod`, and `format` keeps `podCount` and `podLegs`. Nothing else about a group is published.

- [ ] **Step 1: Write the failing tests**

Write `tests/public-view.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, seededRng, makeTournament, playOut } = require('./lib/helpers');
const { toPublicView } = require('../viewer/api/_lib/publicView');

const app = loadApp();
function event(confirmAll) {
  const t = makeTournament(app, 20, { pods: 5, seeding: true, numSeeds: 4 });
  run(app, 'generatePods')(t, seededRng(3));
  if (confirmAll) run(app, 'podsConfirmAll')(t); else run(app, 'podsConfirm')(t, t.pods[0].id);
  // private things that must never be published
  t.eventCreation.contact = 'SECRET CONTACT'; t.incidents = [{ description: 'SECRET INCIDENT' }];
  t.pods.forEach((p) => { p.internalNote = 'SECRET POD NOTE'; p.bracket.rounds.forEach((r) => r.forEach((m) => { m.privateNote = 'SECRET MATCH NOTE'; })); });
  t.entriesList.forEach((e) => { e.phone = 'SECRET PHONE'; });
  return JSON.parse(JSON.stringify(t));
}

test('only confirmed groups are published, with just the allowed fields', () => {
  const view = toPublicView(event(false));
  assert.equal(view.pods.length, 1);
  const pod = view.pods[0];
  assert.deepEqual(Object.keys(pod).sort(), ['bracket', 'boards', 'entryIds', 'id', 'label', 'winnerId'].sort());
  assert.equal(pod.bracket.podLabel, '1');
  assert.ok(pod.bracket.rounds.length >= 2);
});

test('the Finals placeholders and seeds are published', () => {
  const t = event(true);
  playOut(app, run(app, 'podsList')(t)[0] ? t.pods[0].bracket : null, () => 'a');   // finish one group on the copy
  const view = toPublicView(t);
  assert.equal(view.pods.length, 5);
  assert.equal(view.knockout.podFinals, true);
  const withPod = view.knockout.rounds[0].filter((m) => m.aFromPod || m.bFromPod);
  assert.ok(withPod.length >= 2);
  withPod.forEach((m) => assert.ok(view.pods.some((p) => p.id === (m.aFromPod || m.bFromPod))));
  assert.ok(Object.keys(view.pods[0].bracket.seeds).length >= 0);
  assert.equal(view.format.podCount, 5);
});

test('nothing private is published', () => {
  const text = JSON.stringify(toPublicView(event(true)));
  ['SECRET', 'phone', 'internalNote', 'privateNote', 'incidents'].forEach((word) => assert.ok(!text.includes(word), word));
});

test('a tournament with no groups publishes an empty list', () => {
  const view = toPublicView({ eventCreation: {}, format: {}, entriesList: [], groups: [] });
  assert.deepEqual(view.pods, []);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/public-view.test.js`
Expected: FAIL (`view.pods` is undefined).

- [ ] **Step 3: Edit `viewer/api/_lib/publicView.js`**

**Edit `viewer/api/_lib/publicView.js`** — find:

```js
  return pick(m, ['id', 'aEntryId', 'bEntryId', 'aLegs', 'bLegs', 'winnerId', 'bye', 'wo']);
```

replace with:

```js
  return pick(m, ['id', 'aEntryId', 'bEntryId', 'aLegs', 'bLegs', 'winnerId', 'bye', 'wo', 'aFromPod', 'bFromPod']);
```

**Edit `viewer/api/_lib/publicView.js`** — find:

```js
    ...pick(b, ['id', 'label', 'size', 'seeds', 'seedLabels']),
```

replace with:

```js
    ...pick(b, ['id', 'label', 'size', 'seeds', 'seedLabels', 'podLabel', 'podFinals']),
```

**Edit `viewer/api/_lib/publicView.js`** — find:

```js
function toPublicView(data) {
```

replace with:

```js
// A Group Boards group (shown to spectators as "Group N"): who is in it, its boards, and its bracket.
function publicPod(p) {
  return {
    ...pick(p, ['id', 'label', 'boards', 'entryIds', 'winnerId']),
    bracket: publicBracket(p.bracket),
  };
}

function toPublicView(data) {
```

**Edit `viewer/api/_lib/publicView.js`** — find:

```js
      'losersPool', 'advanceMode', 'knockoutLegs', 'seedingEnabled', 'numSeeds']),
```

replace with:

```js
      'losersPool', 'advanceMode', 'knockoutLegs', 'seedingEnabled', 'numSeeds', 'podCount', 'podLegs']),
```

**Edit `viewer/api/_lib/publicView.js`** — find:

```js
    groups: (d.groups || []).filter((g) => g && g.confirmed).map(publicGroup),
```

replace with:

```js
    groups: (d.groups || []).filter((g) => g && g.confirmed).map(publicGroup),
    pods: (d.pods || []).filter((p) => p && p.confirmed && p.bracket).map(publicPod),
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/public-view.test.js` then `npm test`
Expected: all pass.

- [ ] **Step 5: Checkpoint**

Run: `npm test` and `git status --short`.

---

### Task 12: The viewer: group picker, group cards, status lines

**Files:**
- Create: `tests/lib/load-viewer.js`
- Modify: `viewer/index.html`
- Modify: `viewer/theme.css` (append)
- Create: `tests/viewer-pods.test.js`

**Interfaces:**
- Consumes: Task 11 (`pods` in the public view), Task 6 (`viewer/render.js` placeholders and `G<n>·` tags, already synced).
- Produces in `viewer/index.html`:
  - `podSel` (`'finals' | 'all' | <group id>`), `podFinished(p)`, `podsPickerHTML()`, `podsAllHTML()`, `podsBracketTabHTML()`, `bracketForKey(key)`
  - `bracketView(b)` (now takes the bracket: Rounds on phones, and Rounds on every screen for brackets of 32 or more)
  - `koLines(id)` includes the player's group bracket first (`title: 'Group N'`, `pod`), then the Finals
  - `statusLine(id)` covers groups and the Finals
- Produces in `tests/lib/load-viewer.js`: `loadViewer() -> ctx`, `setViewerState(ctx, view)`, `runViewer(ctx, code)`.

- [ ] **Step 1: Write the viewer loader**

Write `tests/lib/load-viewer.js`:

```js
// Loads the public viewer page (viewer/render.js plus viewer/index.html's inline scripts) into a Node vm
// context with a stubbed browser. fetch never resolves, so nothing loads on its own; tests set `state`.
const fs = require('fs'), vm = require('vm'), path = require('path');
const { ROOT, stubDocument, seededMath } = require('./load-app');

function loadViewer() {
  const html = fs.readFileSync(path.join(ROOT, 'viewer', 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const ctx = {
    console, Math: seededMath(1), JSON, Date, Array, Object, String, Number, Set, Map, Intl, URLSearchParams,
    parseInt, parseFloat, isNaN, setTimeout: () => 0, clearTimeout: () => {},
    document: stubDocument,
    window: { matchMedia: () => ({ matches: true }), addEventListener() {}, scrollTo() {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { search: '', pathname: '/live/testslug12', hash: '' }, history: { length: 1 },
    fetch: () => new Promise(() => {}),
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'viewer', 'render.js'), 'utf8'), ctx, { filename: 'viewer/render.js' });
  scripts.forEach((s, i) => vm.runInContext(s, ctx, { filename: 'viewer/index.html#' + i }));
  return ctx;
}
// Sets the viewer's current tournament the way its own load() does.
function setViewerState(ctx, view) {
  const v = JSON.parse(JSON.stringify(view));
  v.tieBreakOrder = v.tieBreakOrder || ['Head-to-head result', 'Leg difference', 'Legs won', 'Organiser decision / playoff'];
  v.entriesList = v.entriesList || []; v.groups = v.groups || []; v.format = v.format || {};
  ctx.__v = v; vm.runInContext('state = __v', ctx);
}
const runViewer = (ctx, code) => vm.runInContext(code, ctx);

module.exports = { loadViewer, setViewerState, runViewer };
```

- [ ] **Step 2: Write the failing tests**

Write `tests/viewer-pods.test.js`:

```js
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
  assert.match(s, /^Next: (Final|Semifinal)/); assert.doesNotMatch(s, /Group 1, /);
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
```

- [ ] **Step 3: Run to verify failure**

Run: `node --test tests/viewer-pods.test.js`
Expected: FAIL (`podsPickerHTML is not defined`, `Next: Round...` text, and so on).

- [ ] **Step 4: Edit `viewer/index.html`**

**Edit `viewer/index.html`** — find:

```js
  var t = [], hasGroups = state.format.formatType!=='knockout' && (state.groups||[]).length, hasKo = !!(state.knockout || state.knockoutLosers);
```

replace with:

```js
  var t = [], hasGroups = state.format.formatType!=='knockout' && (state.groups||[]).length, hasKo = !!(state.knockout || state.knockoutLosers || (state.pods||[]).length);
```

**Edit `viewer/index.html`** — find:

```js
  var out = [], multi = state.format.formatType==='rrknockout';
  [[state.knockout, multi ? 'Main bracket' : 'Bracket'], [state.knockoutLosers, 'Plate pool']].forEach(function(pair){
    var b = pair[0];
    if(!b || !b.rounds) return;
    b.rounds.forEach(function(round, ri){
      round.forEach(function(m, mi){
        if(m.aEntryId===id || m.bEntryId===id) out.push({b:b, title:pair[1], ri:ri, mi:mi, m:m, round:koRoundName(b, ri), tag:koMatchTag(b, state, ri, mi)});
```

replace with:

```js
  var out = [], multi = state.format.formatType==='rrknockout', brackets = [];
  (state.pods||[]).forEach(function(p){ if(p.bracket && p.entryIds.indexOf(id)!==-1) brackets.push([p.bracket, 'Group '+p.label, p]); });
  brackets.push([state.knockout, state.format.formatType==='podknockout' ? 'Finals' : (multi ? 'Main bracket' : 'Bracket')]);
  brackets.push([state.knockoutLosers, 'Plate pool']);
  brackets.forEach(function(pair){
    var b = pair[0];
    if(!b || !b.rounds) return;
    b.rounds.forEach(function(round, ri){
      round.forEach(function(m, mi){
        if(m.aEntryId===id || m.bEntryId===id) out.push({b:b, title:pair[1], pod:pair[2]||null, ri:ri, mi:mi, m:m, round:koRoundName(b, ri), tag:koMatchTag(b, state, ri, mi)});
```

**Edit `viewer/index.html`** — find:

```js
    if(m.winnerId){
      if(m.winnerId===id) return inFinal ? 'Winner of the '+l.title : (m.bye ? 'Bye in the '+l.round : 'Won the '+l.round)+' · waiting for the next round';
      return 'Out in the '+l.round+' · lost to '+entryName(opp);
    }
    return 'Next: '+l.round+' ('+l.tag+')'+(opp ? ' vs '+entryName(opp) : ' · opponent not decided yet');
```

replace with:

```js
    if(m.winnerId){
      if(m.winnerId===id){
        if(l.b.podLabel && inFinal) return 'Won '+l.title+' · through to the Finals';
        return inFinal ? 'Winner of the '+l.title : (m.bye ? 'Bye in the '+l.round : 'Won the '+l.round)+' · waiting for the next round';
      }
      return 'Out in the '+l.round+(l.b.podLabel ? ' of '+l.title : '')+' · lost to '+entryName(opp);
    }
    return 'Next: '+(l.b.podLabel ? l.title+', ' : '')+l.round+' ('+l.tag+')'+(opp ? ' vs '+entryName(opp) : ' · opponent not decided yet')+
      (l.pod && l.pod.boards && l.pod.boards.length ? ' · Board '+l.pod.boards.join(', ') : '');
```

**Edit `viewer/index.html`** — find:

```js
function bracketView(){ return bracketPref==='auto' ? (isNarrow() ? 'rounds' : 'chart') : bracketPref; }
```

replace with:

```js
function bracketView(b){
  if(bracketPref!=='auto') return bracketPref;
  return (isNarrow() || (b && b.size>=32)) ? 'rounds' : 'chart';   // a 32+ draw is unreadable as a chart, even on a laptop
}
```

**Edit `viewer/index.html`** — find:

```js
function bracketToolsHTML(key){
  var rounds = bracketView()==='rounds';
```

replace with:

```js
function bracketToolsHTML(key, view){
  var rounds = view==='rounds';
```

**Edit `viewer/index.html`** — find:

```js
    bracketToolsHTML(key)+
    (bracketView()==='rounds' ? roundsViewHTML(bracket, key)
```

replace with:

```js
    bracketToolsHTML(key, bracketView(bracket))+
    (bracketView(bracket)==='rounds' ? roundsViewHTML(bracket, key)
```

**Edit `viewer/index.html`** — find:

```js
  if(!id){
    var txt = 'To be decided';
    if(m.bye) txt = 'Bye';
```

replace with:

```js
  if(!id){
    var txt = 'To be decided', fromPod = m[side+'FromPod'];
    if(fromPod){ var pp = (state.pods||[]).find(function(p){ return p.id===fromPod; }); txt = 'Winner of Group '+(pp ? pp.label : '?'); }
    else if(m.bye) txt = 'Bye';
```

**Edit `viewer/index.html`** — find:

```js
function bracketCardHTML(bracket, key, title){
```

replace with:

```js
/* ---------- Group Boards: pick Finals, all groups, or one group ---------- */
var podSel = 'finals';   // 'finals' | 'all' | a group id
function podFinished(p){ return !!(p.bracket && bracketIsComplete(p.bracket)); }
function podsPickerHTML(){
  var pods = state.pods||[], open = pods.filter(function(p){ return !podFinished(p); }), done = pods.filter(podFinished);
  var mine = myId() ? pods.find(function(p){ return p.entryIds.indexOf(myId())!==-1; }) : null;
  function opt(p){ return '<option value="'+escapeHtml(p.id)+'"'+(podSel===p.id ? ' selected' : '')+'>Group '+escapeHtml(p.label)+'</option>'; }
  return '<section class="card"><div class="podpick"><select id="podSelect" aria-label="Show">'+
    (state.knockout ? '<option value="finals"'+(podSel==='finals' ? ' selected' : '')+'>Finals</option>' : '')+
    '<option value="all"'+(podSel==='all' ? ' selected' : '')+'>All groups</option>'+
    (open.length ? '<optgroup label="In progress">'+open.map(opt).join('')+'</optgroup>' : '')+
    (done.length ? '<optgroup label="Completed">'+done.map(opt).join('')+'</optgroup>' : '')+'</select>'+
    (mine ? '<button type="button" class="chipbtn" data-pod="'+escapeHtml(mine.id)+'">My group</button>' : '')+'</div></section>';
}
function podsAllHTML(){
  var pods = state.pods||[];
  return '<section class="card"><h2>All groups <span class="sub">'+pods.filter(podFinished).length+' of '+pods.length+' finished</span></h2><div class="podgrid">'+pods.map(function(p){
    var w = podFinished(p) ? bracketChampion(p.bracket) : null;
    return '<button type="button" class="podcard" data-pod="'+escapeHtml(p.id)+'"><b>Group '+escapeHtml(p.label)+'</b>'+
      '<span class="note">'+(p.boards && p.boards.length ? 'Board '+p.boards.join(', ')+' · ' : '')+p.entryIds.length+' players</span>'+
      '<span class="'+(w ? 'pw' : 'pp')+'">'+(w ? 'Winner: '+escapeHtml(entryName(w)) : 'In progress')+'</span></button>';
  }).join('')+'</div></section>';
}
function podsBracketTabHTML(){
  var pods = state.pods||[], sel = pods.find(function(p){ return p.id===podSel; });
  if(podSel==='finals' && !state.knockout) podSel = 'all';
  if(podSel!=='finals' && podSel!=='all' && !sel) podSel = state.knockout ? 'finals' : 'all';
  var html = podsPickerHTML();
  if(podSel==='all') html += podsAllHTML();
  else if(podSel==='finals') html += bracketCardHTML(state.knockout, 'ko', 'Finals');
  else html += bracketCardHTML(sel.bracket, 'pod:'+sel.id, 'Group '+sel.label+(sel.boards && sel.boards.length ? ' · Board '+sel.boards.join(', ') : ''));
  return html;
}
function bracketForKey(key){
  if(key==='kol') return state.knockoutLosers;
  if(key==='ko') return state.knockout;
  var m = /^pod:(.+)$/.exec(key||''), p = m ? (state.pods||[]).find(function(x){ return x.id===m[1]; }) : null;
  return p ? p.bracket : null;
}

function bracketCardHTML(bracket, key, title){
```

**Edit `viewer/index.html`** — find:

```js
  else if(r.name==='bracket'){
    if(state.knockout) body += bracketCardHTML(state.knockout, 'ko', type==='rrknockout' ? 'Main bracket' : 'Bracket');
    if(state.knockoutLosers) body += bracketCardHTML(state.knockoutLosers, 'kol', 'Plate pool');
  }
```

replace with:

```js
  else if(r.name==='bracket'){
    if((state.pods||[]).length) body += podsBracketTabHTML();
    else {
      if(state.knockout) body += bracketCardHTML(state.knockout, 'ko', type==='rrknockout' ? 'Main bracket' : 'Bracket');
      if(state.knockoutLosers) body += bracketCardHTML(state.knockoutLosers, 'kol', 'Plate pool');
    }
  }
```

**Edit `viewer/index.html`** — find:

```js
    var b = box.getAttribute('data-bracket')==='kol' ? state.knockoutLosers : state.knockout;
```

replace with:

```js
    var b = bracketForKey(box.getAttribute('data-bracket'));
```

**Edit `viewer/index.html`** — find:

```js
  var bv = t.closest('[data-bview]');
```

replace with:

```js
  var pd = t.closest('[data-pod]');
  if(pd){ podSel = pd.getAttribute('data-pod'); render(); window.scrollTo(0, 0); return; }
  var bv = t.closest('[data-bview]');
```

**Edit `viewer/index.html`** — find:

```js
window.addEventListener('hashchange', function(){ if(state){ render(); window.scrollTo(0, 0); } });
```

replace with:

```js
window.addEventListener('hashchange', function(){ if(state){ render(); window.scrollTo(0, 0); } });
document.addEventListener('change', function(e){ if(e.target && e.target.id==='podSelect'){ podSel = e.target.value; render(); } });
```

- [ ] **Step 5: Append the styles to `viewer/theme.css`**

Append to `viewer/theme.css`:

```css
/* Group Boards: group picker and group cards */
.podpick{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.podpick select{flex:1;min-width:160px;font:inherit;font-size:16px;padding:10px 14px;border:1px solid var(--line-strong);border-radius:14px;background:var(--paper2);color:var(--ink)}
.chipbtn{font-family:var(--display);font-weight:600;font-size:15px;letter-spacing:.06em;text-transform:uppercase;min-height:44px;padding:8px 16px;border:1px solid var(--blue);border-radius:99px;background:var(--blue-tint);color:var(--on-blue);cursor:pointer}
.podgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px}
.podcard{display:flex;flex-direction:column;gap:2px;text-align:left;font:inherit;padding:12px;border:1px solid var(--line);border-radius:14px;background:var(--paper2);color:var(--ink);cursor:pointer}
.podcard b{font-family:var(--display);font-size:20px;text-transform:uppercase;letter-spacing:.04em}
.podcard .pw{color:var(--green);font-weight:600;font-size:13px}
.podcard .pp{color:var(--muted);font-size:13px}
```

- [ ] **Step 6: Run to verify pass**

Run: `node --test tests/viewer-pods.test.js` then `npm test`
Expected: all pass. (`npm run check-viewer` is unaffected: `viewer/render.js` was synced in Task 6.)

- [ ] **Step 7: Checkpoint**

Run: `npm test`, `npm run check-viewer` and `git status --short`.

---

### Task 13: Scale test, local dev servers, README and the final sweep

**Files:**
- Create: `tests/scale.test.js`
- Create: `tests/dev/mock-organiser.js`, `tests/dev/make-sample-view.js`, `tests/dev/mock-viewer.js`
- Modify: `.gitignore`, `README.md`

**Interfaces:**
- Consumes: everything above.
- Produces: `node tests/dev/mock-organiser.js` (organiser on `http://localhost:5393`, in-memory storage), `node tests/dev/make-sample-view.js [players] [groups] [finishedGroups]` (writes `tests/dev/out/view.json`), `node tests/dev/mock-viewer.js [view.json]` (viewer on `http://localhost:5392/live/testslug12`).

- [ ] **Step 1: Write the scale test**

Write `tests/scale.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, useState, seededRng, makeTournament, playOut } = require('./lib/helpers');
const { toPublicView } = require('../viewer/api/_lib/publicView');

const app = loadApp();
const f = (name) => run(app, name);
const ms = (fn) => { const t0 = Date.now(); const r = fn(); return { r, took: Date.now() - t0 }; };

test('a 540-player, 64-group event: draw, confirm, play everything, and every screen builds quickly', () => {
  const t = makeTournament(app, 540, { pods: 64, seeding: true, numSeeds: 64, orgSplit: true, orgOf: (i) => 'club' + (i % 40), boards: 64 });
  useState(app, t); app.persist = () => {}; app.render = () => {};

  const draw = ms(() => f('generatePods')(t, seededRng(11)));
  assert.equal(draw.r.ok, true); assert.ok(draw.took < 3000, 'draw took ' + draw.took + 'ms');
  assert.equal(t.pods.length, 64);

  f('podsConfirmAll')(t);
  assert.equal(t.knockout.size, 64);

  const s3 = ms(() => f('podsStage3')()), s5 = ms(() => f('podsStage5')());
  assert.ok(s3.took < 2000, 'stage 3 took ' + s3.took + 'ms');
  assert.ok(s5.took < 1000, 'stage 5 took ' + s5.took + 'ms');
  assert.equal((s5.r.match(/podsSelect\('/g) || []).length >= 64, true);

  t.pods.forEach((p) => { playOut(app, p.bracket, () => 'a'); f('syncFinalsFromPods')(t); });
  playOut(app, t.knockout, () => 'a');
  assert.ok(f('bracketChampion')(t.knockout));

  let real = 0;
  t.pods.forEach((p) => p.bracket.rounds.forEach((r) => r.forEach((m) => { if (!m.bye && m.winnerId) real++; })));
  t.knockout.rounds.forEach((r) => r.forEach((m) => { if (!m.bye && m.winnerId) real++; }));
  assert.equal(real, 539);   // 540 players: 476 group matches + 63 Finals matches

  const view = JSON.stringify(toPublicView(JSON.parse(JSON.stringify(t))));
  assert.ok(view.length < 400 * 1024, 'public view is ' + Math.round(view.length / 1024) + ' KB');
  assert.doesNotThrow(() => { f('podsStage6')(); f('podsStage7')(); });
});
```

- [ ] **Step 2: Run it**

Run: `node --test tests/scale.test.js`
Expected: PASS. If a time limit fails, print the measured time (it is in the failure message) and check whether the cost is in `podsSeparateClubs` (the club clash search is the only quadratic part); if so reduce its pass limit from 30 to 10 in `pods.js` and re-run `npm test`.

- [ ] **Step 3: Write the local organiser server**

Write `tests/dev/mock-organiser.js`:

```js
// Local organiser for checking screens in a browser without Neon or login:  node tests/dev/mock-organiser.js
// then open http://localhost:5393 . Tournaments live in memory and are lost when the server stops.
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const db = {};   // id -> { data, updated_at }
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const readBody = (req) => new Promise((resolve) => { let s = ''; req.on('data', (c) => { s += c; }); req.on('end', () => resolve(s ? JSON.parse(s) : {})); });

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const send = (code, obj) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); };
  if (url.pathname === '/api/auth/me') return send(200, { id: 'u1', name: 'Test organiser', email: 'test@example.com', publicMode: true, viewerUrl: '' });
  if (url.pathname === '/api/tournaments') return send(200, Object.keys(db).map((id) => ({ id, data: db[id].data, updated_at: db[id].updated_at })));
  const m = /^\/api\/tournaments\/([^/]+)$/.exec(url.pathname);
  if (m) {
    const id = decodeURIComponent(m[1]);
    if (req.method === 'GET') return db[id] ? send(200, { id, data: db[id].data, updated_at: db[id].updated_at }) : send(404, { error: 'Not found.' });
    if (req.method === 'PUT') { const b = await readBody(req); const updated_at = new Date().toISOString(); db[id] = { data: b.data, updated_at }; return send(200, { id, updated_at }); }
    if (req.method === 'DELETE') { delete db[id]; res.statusCode = 204; return res.end(); }
  }
  const file = path.join(ROOT, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; return res.end('not found'); }
  res.setHeader('Content-Type', MIME[path.extname(file)] || 'text/plain');
  res.end(fs.readFileSync(file));
}).listen(5393, () => console.log('mock organiser on http://localhost:5393'));
```

- [ ] **Step 4: Write the sample public-view generator and the local viewer server**

Write `tests/dev/make-sample-view.js`:

```js
// Builds a Group Boards event with the real organiser code and writes its public view for the local viewer:
//   node tests/dev/make-sample-view.js [players=40] [groups=8] [finishedGroups=3]
const fs = require('fs'), path = require('path');
const { loadApp, run } = require('../lib/load-app');
const { toPublicView } = require('../../viewer/api/_lib/publicView');

const players = parseInt(process.argv[2]) || 40, groups = parseInt(process.argv[3]) || 8, finished = parseInt(process.argv[4]);
const app = loadApp();
const t = run(app, 'blankTournament')();
t.eventCreation.tournamentName = 'Sample Open'; t.eventCreation.eventName = 'Group Boards sample'; t.eventCreation.boards = Math.max(groups, 8);
t.format.formatType = 'podknockout'; t.format.podCount = groups; t.format.bestOfLegs = 5; t.format.seedingEnabled = true; t.format.numSeeds = Math.min(16, groups);
t.entriesList = Array.from({ length: players }, (_, i) => ({ id: 'e' + i, name: 'Player ' + (i + 1), org: 'Club ' + (i % 6), players: [], withdrawn: false }));
run(app, 'generatePods')(t); run(app, 'podsConfirmAll')(t);
const propagate = run(app, 'propagateByes');
t.pods.slice(0, Number.isNaN(finished) ? 3 : finished).forEach((p) => {
  p.bracket.rounds.forEach((r) => { r.forEach((m) => { if (m.aEntryId && m.bEntryId && !m.winnerId) { m.aLegs = 3; m.bLegs = 1; m.winnerId = m.aEntryId; } }); propagate(p.bracket.rounds); });
  run(app, 'syncFinalsFromPods')(t);
});
t.publicSlug = 'testslug12'; t.published = true;
const out = path.join(__dirname, 'out');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'view.json'), JSON.stringify(toPublicView(JSON.parse(JSON.stringify(t)))));
console.log('wrote tests/dev/out/view.json for', players, 'players in', groups, 'groups');
```

Write `tests/dev/mock-viewer.js`:

```js
// Local public viewer: node tests/dev/mock-viewer.js [view.json]  ->  http://localhost:5392/live/testslug12
// Serves viewer/ and answers /api/public/testslug12 from a public-view JSON file (default tests/dev/out/view.json).
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', 'viewer');
const VIEW = path.resolve(process.argv[2] || path.join(__dirname, 'out', 'view.json'));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/public/testslug12') {
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ updatedAt: fs.statSync(VIEW).mtime.toISOString(), view: JSON.parse(fs.readFileSync(VIEW, 'utf8')) }));
  }
  let file = url.pathname;
  if (/^\/live\/[^/]+$/.test(file)) file = '/index.html';
  const full = path.join(ROOT, file === '/' ? 'index.html' : file);
  if (!full.startsWith(ROOT) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) { res.statusCode = 404; return res.end('not found'); }
  res.setHeader('Content-Type', MIME[path.extname(full)] || 'text/plain');
  res.end(fs.readFileSync(full));
}).listen(5392, () => console.log('mock viewer on http://localhost:5392/live/testslug12'));
```

**Edit `.gitignore`** — find:

```
.env*.local
```

replace with:

```
.env*.local
tests/dev/out/
```

- [ ] **Step 5: Document it in the README**

**Edit `README.md`** — find:

```
## Features
```

replace with:

```
## Group Boards format

For big fields, choose **Group Boards** at Format & branding. Players are dealt into a chosen number of
**groups** (for example 64 groups for 540 players). Each group is a small knockout on its own board, and every
group winner goes through to a **Finals** bracket whose chart exists, with "Winner of Group N" slots, before any
group finishes. Seeds are spread one per group, club-mates are kept apart where possible, and players can be
moved between groups by hand until the groups are confirmed. The public results page gets a group picker (Finals,
all groups, or one group).

The logic is in `pods.js` (internally "pods", so it never clashes with the round-robin `state.groups`) and the
screens in `pods-ui.js`. Spec: `docs/superpowers/specs/2026-10-06-group-boards-design.md`.

### Tests and local servers

- `npm test` runs every test (Node's built-in runner, no dependencies). `tests/golden/existing-formats.json`
  snapshots how the three older formats render; if you change them on purpose, regenerate it with
  `UPDATE_GOLDEN=1 npm test`.
- `node tests/dev/mock-organiser.js` serves the organiser at http://localhost:5393 with in-memory storage and no
  login, for trying the screens in a browser.
- `node tests/dev/make-sample-view.js 40 8 3` then `node tests/dev/mock-viewer.js` serves the public page for a
  sample Group Boards event at http://localhost:5392/live/testslug12.

## Features
```

- [ ] **Step 6: Run the whole suite**

Run: `npm test`
Expected: every test passes (golden snapshot, draw, moves, Finals, confirm, render hooks, format, the three screen files, public view, viewer, scale).

- [ ] **Step 7: Check it in a browser**

Run `node tests/dev/mock-organiser.js`, open `http://localhost:5393` and walk through once:
1. New tournament, 40 entries, Format & branding: choose **Group Boards**, 8 groups, Save.
2. Chart details: tick Seed this bracket, Draw groups; check 8 cards of 5, a board box per card, Move… works.
3. Confirm: Confirm all groups; the Finals appears with "Winner of Group N".
4. Manage: open Group 1, enter results until it finishes; its winner appears in the Finals; open the Finals tab.
5. Try correcting a finished group's result after a Finals match is scored: it must be refused with a message.
6. Results and Print: groups table, then Print (one sheet per group plus the Finals).

Then run `node tests/dev/make-sample-view.js 40 8 3` and `node tests/dev/mock-viewer.js`, open `http://localhost:5392/live/testslug12` on a phone-sized window and check: Bracket tab, the group picker (Finals, All groups, In progress, Completed), a group in Rounds view, "Winner of Group N" in the Finals, and Me and Following with a player from a finished group.

- [ ] **Step 8: Final checks and handoff**

Run: `npm test`, `npm run check-viewer`, and `git status --short`. Tell the user what changed (new files: `pods.js`, `pods-ui.js`, `tests/`, `docs/superpowers/`; modified: `index.html`, `render.js`, `render.css`, `viewer/*`, `README.md`, `.gitignore`, `package.json`) and that nothing is committed. When the user asks, commit in two commits: the organiser side (everything except `viewer/`) and the viewer side (`viewer/`, `tests/viewer-pods.test.js`, `tests/public-view.test.js`, `tests/lib/load-viewer.js`).

---

## Spec coverage notes

Where the plan interprets or narrows the spec, so the reviewer can confirm each call:

- **Redraw (spec section 8, stage 3).** The spec says each card has "a redraw control". The plan implements one **Redraw groups** button for the whole draw (spec section 6: redraw "deals everyone again"). Redrawing a single group alone is not built; moving or swapping players covers fixing one group.
- **DartConnect replay (spec section 11, test 4).** The plan covers this with the 540-player, 64-group scale test (the same size and shape as the Malaysia Open: 64 groups, 539 real matches, a 64-slot Finals) and the earlier viewer simulation. An exact-score replay of the real Group 1 and Finals needs the real player names, which are kept out of the repository. If an anonymised fixture is wanted, it can be added as a small follow-up task.
- **Per-match boards and markers, bulk entry, pop-out windows.** Out of scope per the spec. The Manage screen for Group Boards has no "open in new window" button in this version.
- **Spec requirement to task map.** Format and settings: Task 7. Data model: Tasks 2 to 5. Draw: Task 2 (moves: Task 3). Finals and result flow: Task 4, with confirm and progress in Task 5. Screens for stages 2 to 7: Tasks 7 to 10. Boards and schedule estimate: Tasks 5, 7 and 8. Public view: Task 11. Viewer: Task 12. Testing, scale and rollout notes: Tasks 1, 13 and the Global Constraints.

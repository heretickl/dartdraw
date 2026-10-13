# Double No-Show ("Neither showed") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the organiser mark a bracket match as "neither showed" (void), so nobody advances, the next opponent gets a bye, and a Group Boards group can finish with no winner, in every bracket format.

**Architecture:** A match gets an optional `void` flag. A new `settleVoids(rounds, force)` in `index.html` resolves each next-round match from its two feeders (void/void: void; void/won: bye; void/open: waits) and also pushes winners forward and clears stale slots. `propagateByes` runs it (only when the bracket already holds void state), `podsPropagate` and the Group Boards Finals sync run it forced. Everything else (organiser actions, standings, board plan, chart, viewer, public view) reads the flag.

**Tech Stack:** Plain browser JavaScript in single HTML files (no build step), Node's built-in `node:test` runner (`npm test`), the shared `render.js` mirrored into `viewer/` by `npm run sync-viewer`.

**Spec:** `docs/superpowers/specs/2026-10-13-double-no-show-design.md` (read it first). Earlier specs it builds on: `2026-10-06-group-boards-design.md`, `2026-10-07-board-schedule-design.md`.

## Global Constraints

- Every bracket format gets it: plain knockout, the main bracket and Plate of round-robin-then-knockout, Group Boards group brackets, and the Group Boards Finals.
- The engine change is additive: a bracket with no void match and no bye made by one behaves exactly as before. `tests/golden.test.js` (the three existing formats) must keep passing, and the existing suite (189 tests) must keep passing after every task.
- A void match has `winnerId: null`, no legs, `bye: false`, `wo: false`. Both players stay in `aEntryId`/`bEntryId` when the organiser voided it directly. A match made void by its feeders has no players (`aEntryId`, `bEntryId` null).
- A bye made by a void feeder looks like any bye: `bye: true`, the lone player in `winnerId`. Such byes only exist in rounds after the first.
- `delete next.void`, never `next.void = false`, in resets, so no new property appears on existing matches.
- A void match is never called, never scored through the normal path, and never appears in the board plan. Reversing it is the way back.
- Classic scripts, `var`/`const`/function declarations as the surrounding code does, string-built HTML, every dynamic value through `escapeHtml`. No ES modules.
- Run `npm run sync-viewer` after any change to the root `render.js`; `npm run check-viewer` must print ok twice.
- **Do not commit or push unless the user asks.** The steps below end with a checkpoint (full suite), not a commit. If the user asks for commits, use two: organiser side (everything except `viewer/` and the viewer tests) and viewer side, trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Real DartConnect player names must never appear in the repo.

## Review Focus

1. **A group of two** (two byes, then one real match: the group final). Voiding it leaves the group with no winner. (Task 1 test "a group of two".)
2. **Correcting the other feeder after a void.** The bye winner must change with it and the slot downstream must follow. (Task 1 test "correcting the other feeder".)
3. **A void that would change who reaches a Finals match that is already scored.** The edit must be refused and undone, leaving the group as it was. (Task 1 test "refused when a dependent Finals match is scored".)
4. **A Finals first-round match the organiser voided directly** (both groups' winners known). A later sync must not clear it. (Task 1 test "a Finals match voided directly survives a sync".)
5. **A bracket with no void anywhere.** Nothing changes, including after a normal correction. (Task 1 test "settleVoids is a no-op"; the golden snapshot.)
6. **The board plan and the viewer after a void.** No queue entry for a void match; no "Up now" for a player who was knocked out by one. (Tasks 4 and 6.)

---

## File Structure

| File | Responsibility |
|---|---|
| `index.html` | `settleVoids`, the `propagateByes` wrapper, `markKnockoutVoid`, `reverseKnockoutVoid`, the picker's third row, the score dialog's void handling, the list-style chart's tag |
| `pods.js` | `podNoWinner`, `podIsFinished`, `podMatchCounts`, `podsPropagate`, `podsSettleDeadSlots`, `syncFinalsFromPods` |
| `pods-ui.js` | `podStatusText`, the Stage 6 group winners table |
| `boardplan.js`, `boardplan-ui.js` | skip void matches, clear calls on void matches, call guard |
| `render.js` (+ `viewer/render.js` by sync) | `bracketIsVoidFinal`, `mkoSlot`/`mkoBoxHTML` void and dead-slot display |
| `viewer/index.html`, `viewer/theme.css` | match rows, status line, group cards, Finals slot text |
| `viewer/api/_lib/publicView.js` | publish `void` |
| `tests/void-engine.test.js`, `tests/void-ui.test.js`, `tests/void-standings.test.js`, `tests/void-render.test.js`, `tests/void-viewer.test.js`, additions to `tests/boardplan.test.js`, `tests/public-view.test.js` | tests |

---

### Task 1: The engine — `settleVoids`, groups with no winner, the Finals

**Files:**
- Modify: `index.html` (`propagateByes` ~line 1274), `pods.js` (`podChampion`/`podIsFinished` ~242, `syncFinalsFromPods` ~255, `podsPropagate` ~284, `podMatchCounts` ~331), `render.js` (add `bracketIsVoidFinal`)
- Test: `tests/void-engine.test.js` (create)

**Interfaces:**
- Consumes: `podsList(t)`, `podsFinalsFeedScored(fin, ri, mi)`, `podsApplyResult(t, pod, apply)` (pods.js); `generateBracket(orderedEntries, label)` (index.html).
- Produces:
  - `settleVoids(rounds, force)` — mutates `rounds` (index.html).
  - `propagateByes(rounds)` — same signature, now also settles voids.
  - `podNoWinner(pod)` → boolean; `podIsFinished(pod)` — true for a winner or a void final (pods.js).
  - `podsSettleDeadSlots(t, fin, result)` (pods.js).
  - `bracketIsVoidFinal(bracket)` → boolean (render.js, shared with the viewer).

- [ ] **Step 1: Write the failing tests**

Create `tests/void-engine.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, useState, seededRng, makeTournament, play, playOut } = require('./lib/helpers');

const app = loadApp();
const f = (n) => run(app, n);
function ready(n, pods) {
  const t = makeTournament(app, n, { pods, boards: pods }); useState(app, t);
  app.persist = () => {}; app.render = () => {};
  f('generatePods')(t, seededRng(3)); f('podsConfirmAll')(t);
  return t;
}
// What markKnockoutVoid does to a match, through the same path a group edit takes.
function voidIt(t, pod, ri, mi) {
  const m = pod.bracket.rounds[ri][mi];
  return f('podsApplyResult')(t, pod, () => { m.void = true; m.aLegs = null; m.bLegs = null; m.winnerId = null; m.wo = false; });
}
const voidDirect = (m) => { m.void = true; m.aLegs = null; m.bLegs = null; m.winnerId = null; m.wo = false; };
const matchOf = (t, p) => t.knockout.rounds[0].find((m) => m.aFromPod === p.id || m.bFromPod === p.id);
const partnerOf = (t, p) => { const m = matchOf(t, p); return t.pods.find((x) => x.id === (m.aFromPod === p.id ? m.bFromPod : m.aFromPod)); };
function plainKo(n) {
  const t = f('blankTournament')(); useState(app, t); app.persist = () => {}; app.render = () => {};
  t.format.formatType = 'knockout';
  t.entriesList = Array.from({ length: n }, (_, i) => ({ id: 'e' + i, name: 'P' + (i + 1), org: '', players: [], withdrawn: false }));
  t.knockout = f('generateBracket')(t.entriesList.map((e) => ({ entryId: e.id, org: '' })), 'Bracket');
  return t;
}

test('one void semifinal: the other semifinal winner gets a bye into the group final and wins the group', () => {
  const t = ready(8, 2); const p = t.pods[0];
  assert.equal(voidIt(t, p, 0, 0).ok, true);
  assert.equal(p.bracket.rounds[1][0].bye, false);                 // waiting for the other semifinal
  play(p.bracket.rounds[0][1], 'a');
  f('podsApplyResult')(t, p, () => {});
  const fin = p.bracket.rounds[1][0];
  assert.equal(fin.bye, true); assert.equal(fin.winnerId, p.bracket.rounds[0][1].winnerId);
  assert.equal(f('podChampion')(p), p.bracket.rounds[0][1].winnerId);
  assert.equal(p.winnerId, p.bracket.rounds[0][1].winnerId);
});

test('two void semifinals: the final is void, the group has no winner and is finished, the Finals slot is dead', () => {
  const t = ready(16, 4); const p = t.pods[0], other = partnerOf(t, p);
  voidIt(t, p, 0, 0); voidIt(t, p, 0, 1);
  const fin = p.bracket.rounds[1][0];
  assert.equal(fin.void, true); assert.equal(fin.aEntryId, null);
  assert.equal(f('podNoWinner')(p), true); assert.equal(f('podIsFinished')(p), true);
  assert.equal(p.winnerId, null);
  assert.equal(!!matchOf(t, p).bye, false);                         // the partner group is still open, so the Finals match waits
  playOut(app, other.bracket, () => 'a'); f('podsApplyResult')(t, other, () => {});
  const km = matchOf(t, p);
  assert.equal(km.bye, true); assert.equal(km.winnerId, other.winnerId);
  assert.equal(t.knockout.rounds[1][0][t.knockout.rounds[0].indexOf(km) === 0 ? 'aEntryId' : 'bEntryId'], other.winnerId);   // through to the Finals final
});

test('both groups of a Finals match without a winner make that match void, and the next round gets a bye', () => {
  const t = ready(16, 4); const p = t.pods[0], other = partnerOf(t, p);
  [p, other].forEach((g) => { voidIt(t, g, 0, 0); voidIt(t, g, 0, 1); });
  assert.equal(matchOf(t, p).void, true);
  const rest = t.pods.filter((g) => g !== p && g !== other);
  rest.forEach((g) => playOut(app, g.bracket, () => 'a')); f('podsApplyResult')(t, rest[0], () => {});
  const km2 = matchOf(t, rest[0]); play(km2, 'a'); f('propagateByes')(t.knockout.rounds);   // the other Finals match is played
  const final = t.knockout.rounds[1][0];
  assert.equal(final.bye, true); assert.equal(final.winnerId, km2.winnerId);
});

test('reversing a void clears the byes and voids it caused, up to the Finals', () => {
  const t = ready(16, 4); const p = t.pods[0], other = partnerOf(t, p);
  playOut(app, other.bracket, () => 'a'); f('podsApplyResult')(t, other, () => {});
  voidIt(t, p, 0, 0); voidIt(t, p, 0, 1);
  assert.equal(matchOf(t, p).bye, true);
  const a = p.bracket.rounds[0][0], b = p.bracket.rounds[0][1];
  f('podsApplyResult')(t, p, () => { delete a.void; });
  f('podsApplyResult')(t, p, () => { delete b.void; });
  assert.equal(!!p.bracket.rounds[1][0].void, false); assert.equal(!!p.bracket.rounds[1][0].bye, false);
  assert.equal(f('podNoWinner')(p), false);
  const km = matchOf(t, p);
  assert.equal(!!km.bye, false); assert.equal(km.winnerId, null);
  assert.equal(t.knockout.rounds[1][0].aEntryId || t.knockout.rounds[1][0].bEntryId || null, null);   // nothing left in the Finals final
});

test('a group of two: voiding its only real match leaves the group with no winner', () => {
  const t = ready(8, 4); const p = t.pods[0];                        // 8 players in 4 groups: two byes, then one real match (the group final)
  assert.equal(voidIt(t, p, 1, 0).ok, true);
  assert.equal(f('podNoWinner')(p), true); assert.equal(f('podIsFinished')(p), true); assert.equal(p.winnerId, null);
});

test('a group of three: the only first-round match void makes the bye player the group winner', () => {
  const t = ready(12, 4); const p = t.pods[0];                       // 12 players in 4 groups of three: one match, one bye
  const real = p.bracket.rounds[0].findIndex((m) => !m.bye);
  const byePlayer = p.bracket.rounds[0].find((m) => m.bye).winnerId;
  assert.equal(voidIt(t, p, 0, real).ok, true);
  assert.equal(p.bracket.rounds[1][0].bye, true); assert.equal(p.bracket.rounds[1][0].winnerId, byePlayer);
  assert.equal(f('podChampion')(p), byePlayer);
});

test('correcting the other feeder after a void changes the bye winner and the slot it fed', () => {
  const t = ready(16, 4); const p = t.pods[0];
  voidIt(t, p, 0, 0);
  const other = p.bracket.rounds[0][1];
  play(other, 'a'); f('podsApplyResult')(t, p, () => {});
  const first = other.winnerId;
  assert.equal(p.bracket.rounds[1][0].winnerId, first);
  f('podsApplyResult')(t, p, () => { play(other, 'b'); });             // corrected: the other player won
  assert.notEqual(other.winnerId, first);
  assert.equal(p.bracket.rounds[1][0].winnerId, other.winnerId);
  assert.equal(p.winnerId, other.winnerId);
});

test('an edit is refused and undone when a dependent Finals match is scored', () => {
  const t = ready(16, 4); const p = t.pods[0], other = partnerOf(t, p);
  playOut(app, p.bracket, () => 'a'); playOut(app, other.bracket, () => 'a');
  f('podsApplyResult')(t, p, () => {});
  const km = matchOf(t, p); play(km, 'a');                           // the Finals match is scored
  const final = p.bracket.rounds[p.bracket.rounds.length - 1][0];
  const winner = final.winnerId;
  const r = f('podsApplyResult')(t, p, () => { final.void = true; final.winnerId = null; final.aLegs = null; final.bLegs = null; });
  assert.equal(r.ok, false);
  assert.equal(!!p.bracket.rounds[p.bracket.rounds.length - 1][0].void, false);
  assert.equal(p.bracket.rounds[p.bracket.rounds.length - 1][0].winnerId, winner);
});

test('a Finals match the organiser voided directly survives later syncs', () => {
  const t = ready(16, 4);
  t.pods.forEach((g) => playOut(app, g.bracket, () => 'a')); f('podsApplyResult')(t, t.pods[0], () => {});
  const km = t.knockout.rounds[0].find((m) => m.aFromPod && m.bFromPod && m.aEntryId && m.bEntryId);
  assert.ok(km);
  voidDirect(km);
  f('syncFinalsFromPods')(t);
  assert.equal(km.void, true); assert.ok(km.aEntryId && km.bEntryId);
});

test('settleVoids is a no-op for a bracket with no void', () => {
  const t = ready(8, 2); const p = t.pods[0];
  playOut(app, p.bracket, () => 'a');
  const before = JSON.stringify(p.bracket.rounds);
  f('settleVoids')(p.bracket.rounds);
  assert.equal(JSON.stringify(p.bracket.rounds), before);
});

test('plain knockout: a void first-round match gives the next opponent a bye, cascading into the next round', () => {
  const t = plainKo(8); const R = t.knockout.rounds;
  voidDirect(R[0][0]); f('propagateByes')(R);
  assert.equal(!!R[1][0].bye, false); assert.equal(R[1][0].winnerId, null);        // waits for the other first-round match
  play(R[0][1], 'a'); f('propagateByes')(R);
  assert.equal(R[1][0].bye, true); assert.equal(R[1][0].winnerId, R[0][1].winnerId);
  assert.equal(R[2][0].aEntryId, R[0][1].winnerId);                                // the bye winner reached the next round
});

test('plain knockout: two void feeders make the next match void; reversing clears everything it caused', () => {
  const t = plainKo(8); const R = t.knockout.rounds;
  voidDirect(R[0][0]); voidDirect(R[0][1]); f('propagateByes')(R);
  assert.equal(R[1][0].void, true); assert.equal(R[1][0].aEntryId, null);
  delete R[0][0].void; delete R[0][1].void; f('propagateByes')(R);                 // both reversed, no result yet
  assert.equal(!!R[1][0].void, false); assert.equal(!!R[1][0].bye, false);
});

test('plain knockout: reversing one void whose partner already won clears the bye and the slot it fed', () => {
  const t = plainKo(8); const R = t.knockout.rounds;
  voidDirect(R[0][0]); play(R[0][1], 'a'); f('propagateByes')(R);
  assert.equal(R[1][0].bye, true); assert.equal(R[2][0].aEntryId, R[0][1].winnerId);
  delete R[0][0].void; f('settleVoids')(R, true);
  assert.equal(!!R[1][0].bye, false); assert.equal(R[1][0].winnerId, null);
  assert.equal(R[2][0].aEntryId, null);
});

test('bracketIsVoidFinal reads the last match of the last round', () => {
  const t = plainKo(4);
  assert.equal(f('bracketIsVoidFinal')(t.knockout), false);
  t.knockout.rounds[t.knockout.rounds.length - 1][0].void = true;
  assert.equal(f('bracketIsVoidFinal')(t.knockout), true);
  assert.equal(f('bracketIsVoidFinal')(null), false);
});

test('group progress counts a void match as done and ignores a match made void by its feeders', () => {
  const t = ready(16, 4); const p = t.pods[0];
  const before = f('podMatchCounts')(p);
  voidIt(t, p, 0, 0); voidIt(t, p, 0, 1);                          // the final becomes void too (no players)
  const after = f('podMatchCounts')(p);
  assert.equal(after.total, before.total - 1);                      // the derived void final is not a real match
  assert.equal(after.done, 2);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/void-engine.test.js`
Expected: FAIL (`podNoWinner is not defined`, `settleVoids is not defined`, `bracketIsVoidFinal is not defined`).

- [ ] **Step 3: `index.html` — settle voids**

Make three edits.

(a) Rename the existing function and add a wrapper. Replace the line `function propagateByes(rounds){` with:

```js
function propagateByes(rounds){
  propagateByesCore(rounds);
  settleVoids(rounds);
}
function propagateByesCore(rounds){
```

(b) In `propagateByesCore`, in the reset line, add `delete nextMatch.void;`. Replace:

```js
        nextMatch.winnerId = null; nextMatch.aLegs=null; nextMatch.bLegs=null; nextMatch.bye=false;
      }
```

with:

```js
        nextMatch.winnerId = null; nextMatch.aLegs=null; nextMatch.bLegs=null; nextMatch.bye=false; delete nextMatch.void;
      }
```

(c) Insert this function immediately before the comment that begins `/* Ranked list of qualifiers (or non-qualifiers, for the losers' pool) taken`:

```js
/* "Neither showed": a void match has no winner and nobody advances from it. The next-round match is resolved from its
   two feeders — both void: void too; one void and the other won: a bye for that winner; one void and the other still
   open: it waits. Runs on its own only when the bracket already holds a void or a bye made by one (so ordinary
   brackets are untouched); `force` runs it regardless (group brackets, the Finals, and the void handlers).
   It also pushes winners forward and clears a slot whose feeder no longer has that winner, round by round. */
function settleVoids(rounds, force){
  const hasVoidState = rounds.some((round, r)=> round.some(m=> m.void || (r>0 && m.bye)));
  if(!force && !hasVoidState) return;
  for(let r=0; r<rounds.length-1; r++){
    const nextRound = rounds[r+1];
    rounds[r].forEach((m, i)=>{
      const next = nextRound[Math.floor(i/2)], slot = i%2===0 ? 'aEntryId' : 'bEntryId', want = m.winnerId || null;
      if(next[slot] === want) return;
      next[slot] = want;
      next.winnerId = null; next.aLegs = null; next.bLegs = null; next.wo = false; next.bye = false; delete next.void;
    });
    nextRound.forEach((n, i)=>{
      const f0 = rounds[r][2*i], f1 = rounds[r][2*i+1];
      if(f0.void && f1.void){
        n.void = true; n.aEntryId = null; n.bEntryId = null; n.winnerId = null; n.aLegs = null; n.bLegs = null; n.wo = false; n.bye = false;
      } else if(f0.void || f1.void){
        const other = f0.void ? f1 : f0;
        delete n.void;
        if(other.winnerId){ n.bye = true; n.winnerId = other.winnerId; n.aLegs = null; n.bLegs = null; n.wo = false; }
        else { n.bye = false; n.winnerId = null; }
      } else {
        if(n.void && !n.aEntryId && !n.bEntryId) delete n.void;      // a void made by feeders that are no longer void
        if(n.bye){ n.bye = false; n.winnerId = null; n.aLegs = null; n.bLegs = null; }   // a bye made by a void feeder (rounds after the first only)
      }
    });
  }
}
```

- [ ] **Step 4: `pods.js` — groups with no winner and the Finals**

Make four edits.

(a) Replace

```js
function podChampion(pod){ return bracketChampion(pod.bracket) || null; }
function podIsFinished(pod){ return !!podChampion(pod); }
```

with

```js
function podChampion(pod){ return bracketChampion(pod.bracket) || null; }
/* A group whose final was marked "neither showed" has no winner. */
function podNoWinner(pod){ var last = pod.bracket.rounds[pod.bracket.rounds.length - 1][0]; return !!(last && last.void); }
function podIsFinished(pod){ return !!podChampion(pod) || podNoWinner(pod); }
```

(b) In `syncFinalsFromPods`, replace the end of the function

```js
  if(result.changed) propagateByes(fin.rounds);
  return result;
}
```

with

```js
  podsSettleDeadSlots(t, fin, result);
  if(result.changed) propagateByes(fin.rounds);
  settleVoids(fin.rounds, true);
  return result;
}
/* A Finals first-round match fed by two groups: when a group finished with no winner its slot is dead, so the other
   group's winner gets a bye (both dead: the match is void). When no slot is dead, any bye or void made that way is
   cleared. A match fed by a single group keeps its seeded bye. Refused (reported in `blocked`) when a Finals match
   that depends on this one already has a score. */
function podsSettleDeadSlots(t, fin, result){
  fin.rounds[0].forEach(function(m, mi){
    if(!m.aFromPod || !m.bFromPod) return;
    var pa = podsList(t).find(function(p){ return p.id === m.aFromPod; }), pb = podsList(t).find(function(p){ return p.id === m.bFromPod; });
    var da = !!pa && podNoWinner(pa), db = !!pb && podNoWinner(pb);
    var wantBye = false, wantVoid = false, wantWinner = null;
    if(da && db) wantVoid = true;
    else if(da || db){ var other = da ? pb : pa; if(other && other.winnerId){ wantBye = true; wantWinner = other.winnerId; } }
    else if(!(m.bye || (m.void && !m.aEntryId && !m.bEntryId))) return;   // nothing dead, and no bye or void made by a dead slot to clear
    if(!!m.bye === wantBye && !!m.void === wantVoid && (m.winnerId || null) === wantWinner) return;
    if((da || db || m.bye || m.void) && podsFinalsFeedScored(fin, 0, mi)){ result.blocked.push(da ? m.aFromPod : m.bFromPod); return; }
    m.bye = wantBye; m.winnerId = wantWinner; m.aLegs = null; m.bLegs = null; m.wo = false;
    if(wantVoid) m.void = true; else delete m.void;
    result.changed = true;
  });
}
```

(c) In `podsPropagate`, replace

```js
      next.winnerId = null; next.aLegs = null; next.bLegs = null; next.wo = false; next.bye = false;
    });
  }
}
```

with

```js
      next.winnerId = null; next.aLegs = null; next.bLegs = null; next.wo = false; next.bye = false; delete next.void;
    });
  }
  settleVoids(rounds, true);   // resolves matches fed by a void match
}
```

(d) In `podMatchCounts`, replace

```js
  pod.bracket.rounds.forEach(function(r){ r.forEach(function(m){ if(m.bye) return; total++; if(m.winnerId) done++; }); });
```

with

```js
  pod.bracket.rounds.forEach(function(r){ r.forEach(function(m){
    if(m.bye || (m.void && !m.aEntryId && !m.bEntryId)) return;     // not a real match: a bye, or a match made void by its feeders
    total++; if(m.winnerId || m.void) done++;
  }); });
```

- [ ] **Step 5: `render.js` — shared helper, then sync**

Add this function directly after `bracketRunnerUp` in `render.js`:

```js
/* True when the last match of the last round was marked "neither showed": the bracket has no champion. */
function bracketIsVoidFinal(bracket){
  if(!bracket || !bracket.rounds || !bracket.rounds.length) return false;
  const last = bracket.rounds[bracket.rounds.length-1][0];
  return !!(last && last.void);
}
```

Then run `npm run sync-viewer`.

- [ ] **Step 6: Run to verify it passes**

Run: `node --test tests/void-engine.test.js`
Expected: PASS, 15 tests.

- [ ] **Step 7: Checkpoint**

Run: `npm test` and `npm run check-viewer`
Expected: everything passes (the existing 189 plus the 15 new), including `tests/golden.test.js`; both viewer files `ok`.

---

### Task 2: Organiser actions — "Neither showed", Reverse, and the score dialog

**Files:**
- Modify: `index.html` (`koMatchScoreModal` ~1392, `markKnockoutNoShow` ~1447, `openKoNoShowPicker` ~1474, the list-style bracket renderer ~1396)
- Test: `tests/void-ui.test.js` (create)

**Interfaces:**
- Consumes: `settleVoids(rounds, force)` (Task 1); `podByKey`, `podsApplyResult`, `bracketByKey`, `openModal`, `closeModal`, `persist`, `render`.
- Produces: `markKnockoutVoid(bracketKey, roundIdx, matchIdx)`; `reverseKnockoutVoid(bracketKey, roundIdx, matchIdx)`.

- [ ] **Step 1: Write the failing tests**

Create `tests/void-ui.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, useState, seededRng, makeTournament, play, playOut } = require('./lib/helpers');

const app = loadApp();
const f = (n) => run(app, n);
function ready(n, pods) {
  const t = makeTournament(app, n, { pods, boards: pods }); useState(app, t);
  app.persist = () => {}; app.render = () => {};
  f('generatePods')(t, seededRng(3)); f('podsConfirmAll')(t);
  return t;
}
function plainKo(n) {
  const t = f('blankTournament')(); useState(app, t); app.persist = () => {}; app.render = () => {};
  t.format.formatType = 'knockout';
  t.entriesList = Array.from({ length: n }, (_, i) => ({ id: 'e' + i, name: 'P' + (i + 1), org: '', players: [], withdrawn: false }));
  t.knockout = f('generateBracket')(t.entriesList.map((e) => ({ entryId: e.id, org: '' })), 'Bracket');
  return t;
}
function captureModal() { const box = { modal: null }; app.openModal = (o) => { box.modal = o; }; return box; }

test('the no-show picker offers "Neither showed" as a third choice', () => {
  const t = ready(16, 4);
  const box = captureModal();
  f('openKoNoShowPicker')('pod:' + t.pods[0].id, 0, 0);
  assert.match(box.modal.bodyHTML, /Neither showed/);
  assert.match(box.modal.bodyHTML, new RegExp("markKnockoutVoid\\('pod:" + t.pods[0].id + "',0,0\\)"));
  assert.equal((box.modal.bodyHTML.match(/class="picker-row"/g) || []).length, 3);
});

test('neither showed in a group: the match is void, both players are flagged, and the cascade follows', () => {
  const t = ready(16, 4); const p = t.pods[0], m = p.bracket.rounds[0][0];
  const ids = [m.aEntryId, m.bEntryId];
  f('markKnockoutVoid')('pod:' + p.id, 0, 0);
  assert.equal(m.void, true); assert.equal(m.winnerId, null);
  ids.forEach((id) => assert.equal(t.entriesList.find((e) => e.id === id).noShow, true));
  play(p.bracket.rounds[0][1], 'a'); f('podsApplyResult')(t, p, () => {});
  assert.equal(p.bracket.rounds[1][0].bye, true);
});

test('neither showed in a plain knockout bracket', () => {
  const t = plainKo(8); const R = t.knockout.rounds;
  f('markKnockoutVoid')('knockout', 0, 0);
  assert.equal(R[0][0].void, true);
  play(R[0][1], 'a'); f('propagateByes')(R);
  assert.equal(R[1][0].bye, true);
});

test('a void is refused on a match that is played, a bye, or missing a player; and a called match loses its call', () => {
  const t = ready(16, 4); const p = t.pods[0];
  const played = p.bracket.rounds[0][0]; play(played, 'a'); f('podsApplyResult')(t, p, () => {});
  f('markKnockoutVoid')('pod:' + p.id, 0, 0);
  assert.equal(!!played.void, false);
  f('markKnockoutVoid')('pod:' + p.id, 1, 0);                        // the group final: a player is still missing
  assert.equal(!!p.bracket.rounds[1][0].void, false);
  const q = t.pods[1], m = q.bracket.rounds[0][1]; m.called = true; m.calledAt = 1; m.calledPair = 'x|y';
  f('markKnockoutVoid')('pod:' + q.id, 0, 1);
  assert.equal(m.void, true); assert.equal(m.called, undefined); assert.equal(m.calledAt, undefined); assert.equal(m.calledPair, undefined);
});

test('a single no-show cannot be recorded on a match that is already void', () => {
  const t = ready(16, 4); const p = t.pods[0], m = p.bracket.rounds[0][0];
  f('markKnockoutVoid')('pod:' + p.id, 0, 0);
  f('markKnockoutNoShow')('pod:' + p.id, 0, 0, 'a');
  assert.equal(m.void, true); assert.equal(m.winnerId, null); assert.equal(!!m.wo, false);
  const box = captureModal();
  f('openKoNoShowPicker')('pod:' + p.id, 0, 0);
  assert.equal(box.modal, null);
});

test('reversing a void clears it and what it caused', () => {
  const t = ready(16, 4); const p = t.pods[0], m = p.bracket.rounds[0][0];
  f('markKnockoutVoid')('pod:' + p.id, 0, 0);
  play(p.bracket.rounds[0][1], 'a'); f('podsApplyResult')(t, p, () => {});
  assert.equal(p.bracket.rounds[1][0].bye, true);
  f('reverseKnockoutVoid')('pod:' + p.id, 0, 0);
  assert.equal(m.void, undefined);
  assert.equal(!!p.bracket.rounds[1][0].bye, false); assert.equal(p.bracket.rounds[1][0].winnerId, null);
  const t2 = plainKo(8); const R = t2.knockout.rounds;
  f('markKnockoutVoid')('knockout', 0, 0);
  f('reverseKnockoutVoid')('knockout', 0, 0);
  assert.equal(R[0][0].void, undefined);
});

test('the score dialog on a void match says so, offers Reverse, and a saved score clears the void', () => {
  const t = ready(16, 4); const p = t.pods[0], m = p.bracket.rounds[0][0];
  f('markKnockoutVoid')('pod:' + p.id, 0, 0);
  const box = captureModal();
  f('koMatchScoreModal')('pod:' + p.id, 0, 0);
  assert.match(box.modal.bodyHTML, /Neither player attended/);
  assert.match(box.modal.bodyHTML, /reverseKnockoutVoid\(/);
  assert.match(box.modal.bodyHTML, /id="scA"/);
  const els = { scA: { value: '3' }, scB: { value: '1' } };
  const realDocument = app.document;
  app.document = { getElementById: (id) => els[id] || null };
  try { assert.equal(box.modal.onConfirm(), undefined); } finally { app.document = realDocument; }
  assert.equal(m.void, undefined); assert.equal(m.winnerId, m.aEntryId);
});

test('the list-style bracket tags a void match and offers no single no-show link on it', () => {
  const t = plainKo(8);
  f('markKnockoutVoid')('knockout', 0, 0);
  const html = f('bracketColumnsHTML')(t.knockout, t, { interactive: true, bracketKey: 'knockout' });
  assert.match(html, /NO-SHOW/);
  const slots = html.split('bracket-slot');
  const voidSlot = slots.find((s) => s.includes('NO-SHOW'));
  assert.doesNotMatch(voidSlot, /Mark no-show/);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/void-ui.test.js`
Expected: FAIL (`markKnockoutVoid is not defined`). Note the name of the list-style renderer: the test calls `bracketColumnsHTML(bracket, t, opts)`; the function containing `class="bracket-cols"` in `index.html` (~line 1376) is that renderer. If its name or signature differs, use the real one in the test.

- [ ] **Step 3: `index.html` — handlers, picker, dialog, tag**

(a) In `markKnockoutNoShow`, extend the guard. Replace

```js
  if(!m || !m.aEntryId || !m.bEntryId || m.winnerId || m.bye) return;
  const majority = Math.floor(legsForKnockoutRound(state, bracketKey, bracket.rounds.length, roundIdx)/2)+1;
  const loserId = side==='a' ? m.aEntryId : m.bEntryId;
```

with

```js
  if(!m || !m.aEntryId || !m.bEntryId || m.winnerId || m.bye || m.void) return;
  const majority = Math.floor(legsForKnockoutRound(state, bracketKey, bracket.rounds.length, roundIdx)/2)+1;
  const loserId = side==='a' ? m.aEntryId : m.bEntryId;
```

(b) Add the two handlers immediately after `markKnockoutNoShow` (before `function openKoNoShowPicker`):

```js
/* "Neither showed": nobody advances. The next opponent gets a bye (see settleVoids); a group whose final is void has
   no winner and leaves a dead Finals slot. Both players are flagged no-show, as a single no-show flags one. */
function markKnockoutVoid(bracketKey, roundIdx, matchIdx){
  const bracket = bracketByKey(state, bracketKey);
  if(!bracket) return;
  const m = bracket.rounds[roundIdx][matchIdx];
  if(!m || !m.aEntryId || !m.bEntryId || m.winnerId || m.bye || m.void) return;
  const ids = [m.aEntryId, m.bEntryId];
  const apply = ()=>{ m.void = true; m.aLegs = null; m.bLegs = null; m.winnerId = null; m.wo = false; delete m.called; delete m.calledAt; delete m.calledPair; };
  const podHit = podByKey(state, bracketKey);
  if(podHit){
    const res = podsApplyResult(state, podHit, apply);
    if(!res.ok){ openModal({title:'Can\'t change this result', body: res.message, confirmLabel:'OK', confirmClass:'primary', onConfirm:()=>{}}); return; }
  } else { apply(); propagateByes(bracket.rounds); settleVoids(bracket.rounds, true); }
  ids.forEach(id=>{ const ent = state.entriesList.find(e=>e.id===id); if(ent) ent.noShow = true; });
  persist(); render();
}
/* Undoes "neither showed": the match goes back to being played. The no-show flags stay, as they do after any no-show correction. */
function reverseKnockoutVoid(bracketKey, roundIdx, matchIdx){
  const bracket = bracketByKey(state, bracketKey);
  if(!bracket) return;
  const m = bracket.rounds[roundIdx][matchIdx];
  if(!m || !m.void || !m.aEntryId || !m.bEntryId) return;
  const apply = ()=>{ delete m.void; };
  const podHit = podByKey(state, bracketKey);
  if(podHit){
    const res = podsApplyResult(state, podHit, apply);
    if(!res.ok){ openModal({title:'Can\'t change this result', body: res.message, confirmLabel:'OK', confirmClass:'primary', onConfirm:()=>{}}); return; }
  } else { apply(); propagateByes(bracket.rounds); settleVoids(bracket.rounds, true); }
  persist(); render();
}
```

(c) In `openKoNoShowPicker`, replace the guard and the rows. Replace

```js
  if(!m || !m.aEntryId || !m.bEntryId || m.winnerId) return;
  const aName = bracketEntryName(state, m.aEntryId), bName = bracketEntryName(state, m.bEntryId);
```

with

```js
  if(!m || !m.aEntryId || !m.bEntryId || m.winnerId || m.void) return;
  const aName = bracketEntryName(state, m.aEntryId), bName = bracketEntryName(state, m.bEntryId);
```

Replace

```js
    '<div class="picker-row" onclick="markKnockoutNoShow(\''+bracketKey+'\','+roundIdx+','+matchIdx+',\'b\');closeModal();">'+escapeHtml(bName)+'</div>';
```

with

```js
    '<div class="picker-row" onclick="markKnockoutNoShow(\''+bracketKey+'\','+roundIdx+','+matchIdx+',\'b\');closeModal();">'+escapeHtml(bName)+'</div>'+
    '<div class="picker-row" onclick="markKnockoutVoid(\''+bracketKey+'\','+roundIdx+','+matchIdx+');closeModal();">Neither showed</div>';
```

Replace

```js
    bodyHTML: '<p style="margin-top:-4px">Choose who didn\'t show up. The other side is advanced as a '+majority+'–0 walkover win, tagged WO.</p><div class="picker-list">'+rows+'</div>',
```

with

```js
    bodyHTML: '<p style="margin-top:-4px">Choose who didn\'t show up. The other side is advanced as a '+majority+'–0 walkover win, tagged WO. If neither showed, nobody advances and the next opponent gets a bye.</p><div class="picker-list">'+rows+'</div>',
```

(d) In `koMatchScoreModal`, show the void state and let a saved score clear it. Replace

```js
    bodyHTML: '<p style="margin:-4px 0 10px;font-size:11px;color:var(--muted)">Match '+escapeHtml(koMatchTag(bracket, state, roundIdx, matchIdx))+' · '+escapeHtml(koRoundName(bracket, roundIdx))+'</p>'+
```

with

```js
    bodyHTML: (m.void ? '<div class="confirm-box" style="margin:0 0 10px"><b>Neither player attended</b>This match was marked as not played. Enter a score to play it instead, or <button type="button" class="btn secondary" style="padding:3px 9px;font-size:11px" onclick="reverseKnockoutVoid(\''+bracketKey+'\','+roundIdx+','+matchIdx+');closeModal();">Reverse it</button></div>' : '')+
      '<p style="margin:-4px 0 10px;font-size:11px;color:var(--muted)">Match '+escapeHtml(koMatchTag(bracket, state, roundIdx, matchIdx))+' · '+escapeHtml(koRoundName(bracket, roundIdx))+'</p>'+
```

Replace

```js
      const apply = ()=>{ m.aLegs = la; m.bLegs = lb; m.winnerId = winnerIsA ? m.aEntryId : m.bEntryId; m.wo = false; };
```

with

```js
      const apply = ()=>{ m.aLegs = la; m.bLegs = lb; m.winnerId = winnerIsA ? m.aEntryId : m.bEntryId; m.wo = false; delete m.void; };
```

(e) In the list-style bracket renderer, tag a void match and hide the single no-show link on it. Replace

```js
              (m.bye?'<div class="bracket-bye-tag">BYE</div>':'')+
              (m.wo && !m.bye?'<div class="bracket-bye-tag">WO</div>':'')+
              (clickable?'<div class="bracket-wo-action"
```

with

```js
              (m.bye?'<div class="bracket-bye-tag">BYE</div>':'')+
              (m.void?'<div class="bracket-bye-tag">NO-SHOW</div>':'')+
              (m.wo && !m.bye?'<div class="bracket-bye-tag">WO</div>':'')+
              (clickable && !m.void?'<div class="bracket-wo-action"
```

(the rest of that line is unchanged: it continues with ` onclick="event.stopPropagation();openKoNoShowPicker(...`.)

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/void-ui.test.js`
Expected: PASS, 8 tests.

- [ ] **Step 5: Checkpoint**

Run: `npm test` and `npm run check-viewer`
Expected: everything passes.

---

### Task 3: Standings, status and the Finals placings

**Files:**
- Modify: `pods-ui.js` (`podStatusText` ~262, the Stage 6 table ~320), `index.html` (`knockoutPlacementsCard` ~4622)
- Test: `tests/void-standings.test.js` (create)

**Interfaces:**
- Consumes: `podNoWinner(pod)`, `bracketIsVoidFinal(bracket)` (Task 1).
- Produces: nothing new by name; changes what `podStatusText`, `podsStage6`, `knockoutPlacementsCard` return.

- [ ] **Step 1: Write the failing tests**

Create `tests/void-standings.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, useState, seededRng, makeTournament, play, playOut } = require('./lib/helpers');

const app = loadApp();
const f = (n) => run(app, n);
function ready(n, pods) {
  const t = makeTournament(app, n, { pods, boards: pods }); useState(app, t);
  app.persist = () => {}; app.render = () => {};
  f('generatePods')(t, seededRng(3)); f('podsConfirmAll')(t);
  return t;
}
function voidIt(t, pod, ri, mi) {
  const m = pod.bracket.rounds[ri][mi];
  return f('podsApplyResult')(t, pod, () => { m.void = true; m.aLegs = null; m.bLegs = null; m.winnerId = null; m.wo = false; });
}

test('a group with no winner reads "No winner" in the Manage grid status', () => {
  const t = ready(16, 4); const p = t.pods[0];
  voidIt(t, p, 0, 0); voidIt(t, p, 0, 1);
  const st = f('podStatusText')(p);
  assert.equal(st.text, 'No winner');
  assert.match(f('podsGridHTML')(t.pods), /No winner/);
});

test('the Stage 6 group winners table shows "No winner" for that group and a dash is kept for unfinished groups', () => {
  const t = ready(16, 4);
  voidIt(t, t.pods[0], 0, 0); voidIt(t, t.pods[0], 0, 1);
  const html = f('podsStage6')();
  const row = html.split('<tr>').find((r) => r.includes('<td class="l">' + t.pods[0].label + '</td>'));
  assert.match(row, /No winner/);
  const other = html.split('<tr>').find((r) => r.includes('<td class="l">' + t.pods[1].label + '</td>'));
  assert.doesNotMatch(other, /No winner/);
});

test('a Finals whose final was marked "neither showed" says there is no champion', () => {
  const t = ready(16, 4);
  t.pods.forEach((g) => playOut(app, g.bracket, () => 'a')); f('podsApplyResult')(t, t.pods[0], () => {});
  t.knockout.rounds[0].forEach((m) => { if (m.aEntryId && m.bEntryId && !m.winnerId) play(m, 'a'); });
  f('propagateByes')(t.knockout.rounds);
  const final = t.knockout.rounds[1][0];
  assert.ok(final.aEntryId && final.bEntryId);
  final.void = true; final.winnerId = null;
  const html = f('knockoutPlacementsCard')(t.knockout, 'Finals');
  assert.match(html, /No champion/); assert.doesNotMatch(html, /Not complete yet/);
  delete final.void;
  assert.match(f('knockoutPlacementsCard')(t.knockout, 'Finals'), /Not complete yet/);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/void-standings.test.js`
Expected: FAIL (`podStatusText` returns "In progress", the table shows a dash, the card says "Not complete yet").

- [ ] **Step 3: `pods-ui.js`**

In `podStatusText`, replace

```js
  var c = podMatchCounts(p), w = podChampion(p);
  if(w) return { text:'Winner: '+((state.entriesList.find(function(e){ return e.id === w; }) || {}).name || ''), color:'#1d8a4a' };
```

with

```js
  var c = podMatchCounts(p), w = podChampion(p);
  if(w) return { text:'Winner: '+((state.entriesList.find(function(e){ return e.id === w; }) || {}).name || ''), color:'#1d8a4a' };
  if(podNoWinner(p)) return { text:'No winner', color:'#b7791f' };
```

In `podsStage6`, in the rows builder, replace

```js
+escapeHtml(name(w))+
```

with

```js
+escapeHtml(w ? name(w) : (podNoWinner(p) ? 'No winner' : '—'))+
```

(`name(null)` already returns the dash, so only the no-winner case changes.)

- [ ] **Step 4: `index.html` — placings card**

In `knockoutPlacementsCard`, replace

```js
 : '<div class="confirm-box" style="margin:0 0 14px">Not complete yet.</div>')+
```

with

```js
 : (bracketIsVoidFinal(bracket)
      ? '<div class="confirm-box" style="margin:0 0 14px"><b>No champion</b>The final was marked "neither showed".</div>'
      : '<div class="confirm-box" style="margin:0 0 14px">Not complete yet.</div>'))+
```

- [ ] **Step 5: Run to verify it passes**

Run: `node --test tests/void-standings.test.js`
Expected: PASS, 3 tests.

- [ ] **Step 6: Checkpoint**

Run: `npm test`
Expected: everything passes.

---

### Task 4: Board plan and calls

**Files:**
- Modify: `boardplan.js` (`stampDoneTimes`, `bracketRounds`), `boardplan-ui.js` (`bpToggleCall`)
- Test: `tests/boardplan.test.js` (append)

**Interfaces:**
- Consumes: `buildBoardPlan`, `stampDoneTimes`, `bpToggleCall` (existing); `m.void` (Task 1).
- Produces: nothing new by name.

- [ ] **Step 1: Write the failing tests** (append to `tests/boardplan.test.js`; it already has `ready`, `plan`, `f`, `play`, `playOut`)

```js
test('a void match never appears in the board plan, and the match behind it moves up', () => {
  const t = ready(12, 3);
  const key = 'pod:' + t.pods[0].id, board = String(t.pods[0].boards[0]);
  const before = plan(t).boards[board].filter((e) => e.key === key).length;
  const m = t.pods[0].bracket.rounds[0][0];
  f('podsApplyResult')(t, t.pods[0], () => { m.void = true; m.aLegs = null; m.bLegs = null; m.winnerId = null; });
  const after = plan(t).boards[board].filter((e) => e.key === key);
  assert.equal(after.length, before - 1);
  assert.ok(!after.some((e) => e.ri === 0 && e.mi === 0));
  assert.equal(plan(t).boards[board][0].status, 'up');
});

test('stampDoneTimes clears a call on a void match, and a void match cannot be called', () => {
  const t = ready(12, 3);
  const m = t.pods[0].bracket.rounds[0][0];
  m.called = true; m.calledAt = 1; m.calledPair = m.aEntryId + '|' + m.bEntryId;
  m.void = true; m.winnerId = null;
  f('stampDoneTimes')(t);
  assert.equal(m.called, undefined); assert.equal(m.calledAt, undefined); assert.equal(m.calledPair, undefined);
  assert.equal(m.doneAt, undefined);
  f('bpToggleCall')('pod:' + t.pods[0].id, 0, 0);
  assert.equal(m.called, undefined);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/boardplan.test.js`
Expected: FAIL on the two new tests (the void match is still queued; the call is not cleared or is set).

- [ ] **Step 3: `boardplan.js` and `boardplan-ui.js`**

In `boardplan.js` `stampDoneTimes`, replace

```js
      if(m.bye || (!m.winnerId && (!m.aEntryId || !m.bEntryId))){ delete m.called; delete m.calledAt; }
```

with

```js
      if(m.bye || m.void || (!m.winnerId && (!m.aEntryId || !m.bEntryId))){ delete m.called; delete m.calledAt; }
```

In `buildBoardPlan`'s inner `bracketRounds`, replace `if(m.bye) return;` with:

```js
        if(m.bye || m.void) return;
```

In `boardplan-ui.js` `bpToggleCall`, replace

```js
  else if(m.winnerId || m.bye || !m.aEntryId || !m.bEntryId) return;       // but only a playable match can be called
```

with

```js
  else if(m.winnerId || m.bye || m.void || !m.aEntryId || !m.bEntryId) return;       // but only a playable match can be called
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/boardplan.test.js`
Expected: PASS (the existing tests and the two new ones).

- [ ] **Step 5: Checkpoint**

Run: `npm test`
Expected: everything passes.

---

### Task 5: The chart — void matches and dead Finals slots

**Files:**
- Modify: `render.js` (`mkoSlot` ~167, `mkoBoxHTML` ~213, the no-show links in `mkoSideHTML` ~286 and `mkoCentreHTML` ~347); then `npm run sync-viewer`
- Test: `tests/void-render.test.js` (create)

**Interfaces:**
- Consumes: `bracketIsVoidFinal(bracket)` (Task 1).
- Produces: slots with an `ns` flag; no new function names.

- [ ] **Step 1: Write the failing tests**

Create `tests/void-render.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, useState, seededRng, makeTournament, playOut } = require('./lib/helpers');

const app = loadApp();
const f = (n) => run(app, n);
function ready(n, pods) {
  const t = makeTournament(app, n, { pods, boards: pods }); useState(app, t);
  app.persist = () => {}; app.render = () => {};
  f('generatePods')(t, seededRng(3)); f('podsConfirmAll')(t);
  return t;
}
function voidIt(t, pod, ri, mi) {
  const m = pod.bracket.rounds[ri][mi];
  return f('podsApplyResult')(t, pod, () => { m.void = true; m.aLegs = null; m.bLegs = null; m.winnerId = null; m.wo = false; });
}

test('a void match shows both players dimmed with a NO-SHOW label and no winner styling', () => {
  const t = ready(16, 4); const p = t.pods[0];
  voidIt(t, p, 0, 0);
  const html = f('mirroredChartHTML')(p.bracket, t, { interactive: false });
  assert.equal((html.match(/NO-SHOW/g) || []).length, 2);
  const before = f('mirroredChartHTML')(ready(16, 4).pods[0].bracket, app.__t, { interactive: false });
  assert.doesNotMatch(before, /NO-SHOW/);
});

test('an interactive chart offers no single no-show link on a void match, but the match stays clickable to reverse it', () => {
  const t = ready(16, 4); const p = t.pods[0];
  const plainHtml = f('mirroredChartHTML')(p.bracket, t, { interactive: true, bracketKey: 'pod:' + p.id });
  const linksBefore = (plainHtml.match(/Mark no-show/g) || []).length;
  voidIt(t, p, 0, 0);
  const html = f('mirroredChartHTML')(p.bracket, t, { interactive: true, bracketKey: 'pod:' + p.id });
  assert.equal((html.match(/Mark no-show/g) || []).length, linksBefore - 1);
  assert.match(html, new RegExp("koMatchScoreModal\\('pod:" + p.id + "',0,0\\)"));
});

test('a Finals slot fed by a group with no winner reads "Group N: no winner"', () => {
  const t = ready(16, 4); const p = t.pods[0];
  voidIt(t, p, 0, 0); voidIt(t, p, 0, 1);
  const html = f('mirroredChartHTML')(t.knockout, t, { interactive: false });
  assert.match(html, new RegExp('Group ' + p.label + ': no winner'));
  const other = t.pods[1];
  assert.doesNotMatch(html, new RegExp('Group ' + other.label + ': no winner'));
});
```

Note on the first test: it builds a second tournament only to compare against a chart with no void; if that makes the test awkward, replace the last two lines with a chart of an untouched group (`t.pods[1].bracket`) from the same tournament and assert it has no `NO-SHOW`.

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/void-render.test.js`
Expected: FAIL (no `NO-SHOW`, the link count is unchanged, the slot still reads "Winner of Group N").

- [ ] **Step 3: `render.js`**

(a) In `mkoSlot`, replace the Group Boards placeholder

```js
      return { text:'Winner of Group '+escapeHtml(pod ? pod.label : '?'), seed:'', legs:'', fw:400, color:tokens.muted, bg:(tokens.boxBg||'#fff'), border:'1px solid '+tokens.line, wo:false };
```

with

```js
      const noWinner = !!(pod && bracketIsVoidFinal(pod.bracket));
      return { text:(noWinner ? 'Group '+escapeHtml(pod.label)+': no winner' : 'Winner of Group '+escapeHtml(pod ? pod.label : '?')), seed:'', legs:'', fw:400, color:tokens.muted, bg:(tokens.boxBg||'#fff'), border:'1px solid '+tokens.line, wo:false };
```

(b) In `mkoSlot`, in the final `return {` for a player slot, add `ns` (the object currently ends with `wo: !!(m.wo && m.winnerId && !isWin) // this side is the one who no-showed`). Replace

```js
    wo: !!(m.wo && m.winnerId && !isWin) // this side is the one who no-showed
  };
```

with

```js
    wo: !!(m.wo && m.winnerId && !isWin), // this side is the one who no-showed
    ns: !!m.void                          // neither player attended this match
  };
```

and, in the same return object, make a void match's names dim: replace `fw: isWin ? 800 : 400, color: tokens.ink,` with `fw: isWin ? 800 : 400, color: m.void ? tokens.muted : tokens.ink,`.

(c) In `mkoBoxHTML`, add the label next to the WO label. Replace

```js
    (slot.wo ? '<span style="flex:0 0 auto;font-size:'+(fontSize*0.68).toFixed(1)+'px;font-weight:700;color:var(--muted);">WO</span>' : '')+
    '<span style="flex:0 0 auto;font-size:'+fontSize+'px;color:'+slot.color+';font-weight:'+slot.fw+';">'+slot.legs+'</span>'+
```

with

```js
    (slot.wo ? '<span style="flex:0 0 auto;font-size:'+(fontSize*0.68).toFixed(1)+'px;font-weight:700;color:var(--muted);">WO</span>' : '')+
    (slot.ns ? '<span style="flex:0 0 auto;font-size:'+(fontSize*0.68).toFixed(1)+'px;font-weight:700;color:var(--muted);">NO-SHOW</span>' : '')+
    '<span style="flex:0 0 auto;font-size:'+fontSize+'px;color:'+slot.color+';font-weight:'+slot.fw+';">'+slot.legs+'</span>'+
```

(d) Hide the single no-show link on a void match. In `mkoSideHTML`, replace `const woLink = clickable ? '<div style=` with `const woLink = clickable && !m.void ? '<div style=`. In `mkoCentreHTML`, replace `(clickable ? '<div style="font-size:11px;color:var(--blue);text-decoration:underline;cursor:pointer;margin-top:4px;" onclick="event.stopPropagation();openKoNoShowPicker(` with `(clickable && !finalMatch.void ? '<div style="font-size:11px;color:var(--blue);text-decoration:underline;cursor:pointer;margin-top:4px;" onclick="event.stopPropagation();openKoNoShowPicker(`.

- [ ] **Step 4: Sync and run**

Run: `npm run sync-viewer`, then `node --test tests/void-render.test.js`
Expected: PASS, 3 tests; `npm run check-viewer` prints ok twice.

- [ ] **Step 5: Checkpoint**

Run: `npm test`
Expected: everything passes, including the golden snapshot (a chart with no void is unchanged).

---

### Task 6: Public view and the viewer

**Files:**
- Modify: `viewer/api/_lib/publicView.js` (`publicMatch`), `viewer/index.html` (`koResultText`, `statusLine`, `podFinished`, `podsAllHTML`, `rsSlotHTML`, `rsMatchHTML`), `viewer/theme.css` (none unless noted)
- Test: `tests/public-view.test.js` (append), `tests/void-viewer.test.js` (create)

**Interfaces:**
- Consumes: `bracketIsVoidFinal(bracket)` (render.js, already in the viewer after Task 1's sync); `m.void`.
- Produces: `void` on published matches.

- [ ] **Step 1: Write the failing tests**

Append to `tests/public-view.test.js`:

```js
test('void is published as true, or omitted', () => {
  const t = event(true);
  t.pods[0].bracket.rounds[0][0].void = true;
  t.pods[0].bracket.rounds[0][1].void = 'yes';
  t.pods[1].bracket.rounds[0][0].void = false;
  const view = toPublicView(JSON.parse(JSON.stringify(t)));
  assert.equal(view.pods[0].bracket.rounds[0][0].void, true);
  assert.equal(view.pods[0].bracket.rounds[0][1].void, true);
  assert.equal('void' in view.pods[1].bracket.rounds[0][0], false);
  assert.equal('void' in view.pods[2].bracket.rounds[0][0], false);
});
```

Create `tests/void-viewer.test.js`:

```js
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/public-view.test.js tests/void-viewer.test.js`
Expected: FAIL (`void` not published; no void wording in the viewer).

- [ ] **Step 3: `publicView.js`**

In `publicMatch`, add `'void'` to the picked keys and coerce it the way `called` is coerced. Replace

```js
'aFromPod', 'bFromPod', 'called', 'board']);
  if (out.called) out.called = true; else delete out.called;
```

with

```js
'aFromPod', 'bFromPod', 'called', 'board', 'void']);
  if (out.called) out.called = true; else delete out.called;
  if (out.void) out.void = true; else delete out.void;     // neither player attended: true or omitted
```

- [ ] **Step 4: `viewer/index.html`**

(a) `koResultText`: after `if(m.bye) return 'Bye';` add `if(m.void) return 'Neither attended';`.

(b) `statusLine`: inside `if(ko.length){ var l = ..., m = l.m, ...` immediately before `if(m.winnerId){`, add:

```js
    if(m.void) return 'Out in the '+l.round+(l.b.podLabel ? ' of '+l.title : l.b.podFinals ? ' of the Finals' : '')+' · neither player attended';
```

(c) `podFinished`: replace `function podFinished(p){ return !!(p.bracket && bracketIsComplete(p.bracket)); }` with:

```js
function podFinished(p){ return !!(p.bracket && (bracketIsComplete(p.bracket) || bracketIsVoidFinal(p.bracket))); }
```

(d) `podsAllHTML`: replace

```js
    var w = podFinished(p) ? bracketChampion(p.bracket) : null;
```

with

```js
    var done = podFinished(p), w = done ? bracketChampion(p.bracket) : null;
```

and replace

```js
      '<span class="'+(w ? 'pw' : 'pp')+'">'+(w ? 'Winner: '+escapeHtml(entryName(w)) : 'In progress')+'</span></button>';
```

with

```js
      '<span class="'+(w ? 'pw' : 'pp')+'">'+(w ? 'Winner: '+escapeHtml(entryName(w)) : done ? 'No winner' : 'In progress')+'</span></button>';
```

(e) `rsSlotHTML`: replace

```js
    if(fromPod){ var pp = (state.pods||[]).find(function(p){ return p.id===fromPod; }); txt = 'Winner of Group '+(pp ? pp.label : '?'); }
```

with

```js
    if(fromPod){ var pp = (state.pods||[]).find(function(p){ return p.id===fromPod; }); txt = (pp && bracketIsVoidFinal(pp.bracket)) ? 'Group '+pp.label+': no winner' : 'Winner of Group '+(pp ? pp.label : '?'); }
```

(f) `rsMatchHTML`: replace

```js
  var status = m.bye ? '<span class="mt dim">Bye</span>'
```

with

```js
  var status = m.void ? '<span class="mt dim">Neither attended</span>'
    : m.bye ? '<span class="mt dim">Bye</span>'
```

- [ ] **Step 5: Run to verify it passes**

Run: `node --test tests/public-view.test.js tests/void-viewer.test.js`
Expected: PASS.

- [ ] **Step 6: Checkpoint**

Run: `npm test` and `npm run check-viewer`
Expected: everything passes.

---

### Task 7: Regression, scale and documentation

**Files:**
- Modify: `README.md`, `tests/scale.test.js` (append)
- Test: the full suite

**Interfaces:** none new.

- [ ] **Step 1: Add a scale/regression test** (append to `tests/scale.test.js`; reuse its imports and helpers)

```js
test('voiding matches across a 540-player, 64-group event stays fast and keeps the plan consistent', () => {
  const t = makeTournament(app, 540, { pods: 64, boards: 32 }); useState(app, t);
  t.format.anticipatedStartTime = '10:00';
  app.persist = () => {}; app.render = () => {};
  f('generatePods')(t, seededRng(9)); f('podsConfirmAll')(t);
  const t0 = Date.now();
  t.pods.slice(0, 20).forEach((p) => {
    const m = p.bracket.rounds[0].find((x) => !x.bye);
    f('podsApplyResult')(t, p, () => { m.void = true; m.aLegs = null; m.bLegs = null; m.winnerId = null; m.wo = false; });
  });
  const plan = f('buildBoardPlan')(t);
  const took = Date.now() - t0;
  assert.ok(took < 1500, 'took ' + took + ' ms');
  const queued = [].concat(...Object.values(plan.boards));
  t.pods.slice(0, 20).forEach((p) => {
    const m = p.bracket.rounds[0].find((x) => x.void);
    const mi = p.bracket.rounds[0].indexOf(m);
    assert.ok(!queued.some((e) => e.key === 'pod:' + p.id && e.ri === 0 && e.mi === mi));
  });
});
```

- [ ] **Step 2: README note**

In `README.md`, under the Group Boards section (after the "Board schedule" section), add:

```markdown
### Neither showed

If both players in a match fail to turn up, open the no-show picker on that match (or its
score dialog) and choose **Neither showed**. Nobody advances; the next opponent gets a bye. A
group whose final is void finishes with no winner, and its Finals slot reads "Group N: no
winner" and becomes a bye for the opponent. It works in every bracket (plain knockout, the
Plate, group brackets and the Finals) and can be reversed from the match's score dialog. Both
players are flagged as no-shows; reversing leaves those flags, as a corrected single no-show
does. The public results page shows "Neither attended" for such a match.
```

- [ ] **Step 3: Run the whole suite and the viewer check**

Run: `npm test`, then `npm run check-viewer`
Expected: all green (the existing 189 plus every new test); both files `ok`.

- [ ] **Step 4: Manual check in the browser (organiser and viewer)**

Run `node tests/dev/mock-organiser.js` (port 5393) and, with a sample view built the way `tests/dev/make-sample-view.js` does plus a few void matches (write a scratch script outside the repo), `node tests/dev/mock-viewer.js` (port 5392). Check:
1. Organiser, Stage 5: open a group's chart, choose **Mark no-show…** on a match; the picker shows three rows. Choose **Neither showed**; the match shows NO-SHOW on both names and the next-round opponent shows BYE once their match is decided.
2. Open the void match's score dialog: it says "Neither player attended" and has **Reverse it**; reversing restores the match.
3. Void both semifinals of one group: the group reads "No winner" in the grid, the Finals chart shows "Group N: no winner", and the opposing group's winner gets a bye.
4. Viewer: the same group card says "No winner"; a knocked-out player's page shows "Out … neither player attended"; the Boards tab has no entry for the void match.
Fix anything wrong test-first, then re-run `npm test`.

- [ ] **Step 5: Checkpoint**

Run: `npm test` and `npm run check-viewer`
Expected: all green. Report the final test count and anything left over, and ask the user whether to commit (two commits: organiser side and viewer side) and push.

---

## Self-review

**Spec coverage**

| Spec section | Task |
|---|---|
| Data (`void`) | 1, 2 |
| `settleVoids` rules 1 to 4, `propagateByes` and `podsPropagate` calls, resets | 1 |
| A group with no winner (`podIsFinished`, `podChampion`) | 1 |
| The Finals: dead slots, bye, void, `podsFinalsFeedScored` guard, settle every sync | 1 |
| Organiser: picker third row, `markKnockoutVoid`, Reverse, score dialog, apply deletes `void`, chart click, group progress | 2 (actions, dialog, picker), 1 (`podMatchCounts`) |
| Standings (Stage 6) and status | 3 |
| Board plan skips void, `stampDoneTimes` clears calls, `bpToggleCall` guard | 4 |
| Display: chart (`mkoSlot`, tag), list-style chart tag, viewer rows/status/group card/Finals slot, public view `void` | 2 (list tag), 5, 6 |
| Known limits (void final, flags kept, void cannot be called) | 3 (placings text), 2 (flags kept), 4 |
| Backward compatibility (no void: unchanged; deploy order; sync) | 1 (no-op test, golden), 5 and 6 (sync, viewer) |
| Testing list | 1 to 7 |

**Deviation from the spec, recorded:** the spec says `propagateByes` calls `settleVoids` and that rule 4 clears stale state on its own. The plan splits that: `propagateByes` calls it unforced (it runs only when the bracket already holds a void or a bye made by one), and the group cascade, the Finals sync and the void/reverse handlers call it with `force`. This was needed because reversing a void that left the bracket with no void state would otherwise leave stale downstream slots. Behaviour for brackets that never held a void is unchanged.

**Placeholder scan:** no TBD or TODO. One place tells the implementer to confirm a name before using it (the list-style renderer in Task 2's last test); it gives the exact signature to look for.

**Type consistency:** `settleVoids(rounds, force)`, `podNoWinner(pod)`, `podsSettleDeadSlots(t, fin, result)`, `bracketIsVoidFinal(bracket)`, `markKnockoutVoid(bracketKey, roundIdx, matchIdx)` and `reverseKnockoutVoid(bracketKey, roundIdx, matchIdx)` are defined once and used by the same names later. `void` is the only new match field; `ns` is the chart slot flag.

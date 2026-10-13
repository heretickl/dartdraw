# Double no-show ("Neither showed") — design

Date: 2026-10-13
Status: draft for review
Builds on: `2026-10-06-group-boards-design.md`, `2026-10-07-board-schedule-design.md`

## Purpose

When both players in a bracket match fail to turn up, the organiser must be able to say so. Today the no-show picker makes them name one absent player; the other is advanced as a 3–0 walkover. If both are absent, the advancing player is absent too. The result is wrong on the chart (a walkover "win" for someone who never came), and it misleads the board features: the absent player stays in the board queue as "Up now" and on the viewer, and can even become the group champion.

### Success looks like

- The organiser can mark a match as "neither showed" in any bracket, in one step.
- Nobody advances from that match. The next-round opponent gets a bye. If both feeder matches are void, the next match is void too.
- In Group Boards, a group whose final is void has no winner. The Finals slot it feeds becomes a bye for the opponent.
- The chart, the viewer, the board plan and the standings all tell the truth: no walkover "win" for an absent player, no queue entry for a match that will never be played.
- It can be reversed, and tournaments that never use it behave exactly as before.

### Not in this spec

Clearing the no-show flags when a void is reversed (the existing no-show has the same limitation). A champion for a Finals whose final match is void. Any change to how a single no-show is recorded.

## Decisions already made

- Real "void match" model, not a chain of single no-shows (the chain still records a walkover win for an absent player and leaves them on the chart).
- Every bracket format gets it: plain knockout, the main bracket and Plate of round-robin-then-knockout, Group Boards group brackets and the Group Boards Finals. They share the picker and the cascade.
- The engine change is additive: nothing happens in a bracket that has no void match, so existing results and the golden snapshot are unchanged.

## Data

All new fields are optional.

| Where | Field | Meaning |
|---|---|---|
| a match | `void` | `true` when neither player attended. A void match has `winnerId: null`, no legs, `bye: false`, `wo: false`. |

A match that is resolved as a bye because one of its feeders is void looks like any other bye: `bye: true` and the lone player in `winnerId`.

A void match always keeps its two players in `aEntryId` and `bEntryId`, so the chart can show who did not attend. A match made void by its feeders has no players.

## Settling voids: `settleVoids(rounds)`

New function in `index.html`, next to `propagateByes`, which calls it as its last step (so every existing caller gets it). It is a no-op for a bracket with no void match and no stale void state.

It walks the rounds in order and resolves each next-round match from its two feeder matches. A feeder is in one of three states:

| Feeder state | When |
|---|---|
| void | `m.void` is true |
| won | `m.winnerId` is set (this includes byes) |
| open | neither |

Rules for the match `n` fed by `f0` (slot a) and `f1` (slot b):

1. Both feeders void: `n` becomes void: `void = true`, no players, no winner, no legs.
2. One feeder void, the other won: `n` becomes a bye. The winner goes into its slot, the void side's slot is empty, `bye = true`, `winnerId = that winner`, no legs.
3. One feeder void, the other open: `n` waits. The void side's slot is empty; `bye` and `void` are false. When the other feeder finishes, rule 2 applies.
4. No void feeder: `n` is left to the existing code, except that a `void` flag, or a `bye`, is cleared on any match after the first round, so a reversed void leaves no stale state. (Only voids ever set `bye` after the first round, and a first-round bye has no feeder, so genuine byes are never touched.)

The function pushes a resolved bye's winner into the slot of the following round and continues, so a chain of voids resolves in one pass.

`podsPropagate` (the group-bracket cascade in `pods.js`) calls `settleVoids` at its end, and its reset of a changed next-round match also does `delete next.void`. `propagateByes` does the same in its reset (`delete nextMatch.void`, never `void = false`, so no new property appears on existing matches).

## Group Boards

### A group with no winner

`podIsFinished(pod)` becomes true when the group's final has a winner or is void. `podChampion(pod)` stays the winner, or null. A group whose final is void has `winnerId: null` and is finished.

### The Finals

`syncFinalsFromPods` classifies each Finals first-round slot that is fed by a group:

- the group's winner is known: the slot gets it (existing behaviour);
- the group is finished with no winner: the slot is **dead**;
- otherwise: open.

For a first-round match it then applies the same rules as above:

- both slots dead: the match is void;
- one dead and the other's group has a winner: the match is a bye for that winner;
- one dead and the other open: the match waits.

A first-round Finals match whose two slots are both fed by groups is only a bye or void while a slot is dead. When no slot is dead, its `bye` and `void` are cleared, so reversing the void that made a group "no winner" restores the match. A first-round Finals match fed by a single group (a seeded bye) becomes void when that group finished with no winner, and returns to a bye if the group gets a winner again.

Later Finals rounds are settled by `propagateByes` and `settleVoids` as in any bracket. The existing guard stays: if a slot's entry would change and the Finals match it feeds, or a later one that depends on it, already has a score, the sync reports it as blocked and `podsApplyResult` undoes the edit.

`syncFinalsFromPods` runs the settle step every time, not only when a slot changed, because a group becoming "no winner" does not change an empty slot's value.

## Organiser

- **Picker.** `openKoNoShowPicker` gets a third row, **Neither showed**, below the two player names. The explanation line says what each choice does.
- **Handler.** New `markKnockoutVoid(bracketKey, roundIdx, matchIdx)`, guarded like `markKnockoutNoShow` (both players known, no winner, not a bye). It marks the match void, flags both players with `noShow = true`, and then follows the same two paths as `markKnockoutNoShow`: a group bracket goes through `podsApplyResult` (reversible, Finals-aware), any other bracket calls `propagateByes`. It then saves and re-renders.
- **Reversing.** Opening a void match's score dialog (`koMatchScoreModal`) shows "Neither player attended" and a **Reverse** button that clears the void through the same two paths. Entering a score in the dialog also clears it (the `apply` function deletes `m.void`). `koMatchScoreModal`'s early return for a match without both players is unchanged.
- **Chart click.** A void match stays clickable on a chart that is interactive, so it can be reversed.
- **Group progress.** `podMatchCounts` counts a void match as done, so a group with a void match can reach "finished". `podStatusText` says "No winner" for a finished group without one.
- **Standings (Stage 6).** The group winners table shows "No winner" for a group with no winner. The Finals placings card says there is no champion when the final match is void.
- **No clock work.** A void match has no `doneAt` and no result time.

## Board plan

- `buildBoardPlan` skips void matches, like byes, so they never enter a queue and never block a board.
- `stampDoneTimes` clears `called`, `calledAt` and `calledPair` on a void match, and never stamps `doneAt` on one.
- `bpToggleCall` cannot set a call on a void match.
- `ready` and the statuses are computed on the remaining entries as before.

## Display

### Shared chart code (`render.js`, synced to `viewer/render.js`)

- `mkoSlot`: for a void match both players are shown dimmed with a "No-show" tag and no winner styling. A slot fed by a group that finished with no winner reads "Group N: no winner" instead of "Winner of Group N". A lone-player bye resolved through a void feeder shows as an ordinary bye.
- The list-style bracket renderer in `index.html` (the one with `bracket-side` rows) shows a "NO-SHOW" tag on a void match, next to the existing "WO" and "BYE" tags.

### Viewer

- Match rows and the status line: a void match reads "Neither player attended"; a player who is knocked out because of one is told so.
- The group card and the groups overview show "No winner" for a finished group without a champion. `podFinished` in the viewer counts a void final as finished.
- A Finals slot fed by a no-winner group reads "Group N: no winner".

### Public view

`publicMatch` publishes `void` (coerced to `true` or omitted).

## Known limits

- If the final match of the Finals is void there is no champion. The standings screen says so. Reversing the void restores the normal flow.
- Reversing a void leaves the two players' `noShow` flags set, as a corrected single no-show does today.
- A void match cannot be called or scored until it is reversed.

## Backward compatibility

- Tournaments saved before this have no `void` field and behave exactly as before. `settleVoids` and the new branches do nothing without one.
- An older viewer ignores `void`; a void group would show as in progress there until the viewer is redeployed. Deploy order: organiser first, then viewer (each deploys from `main`).
- `render.js` changes are mirrored with `npm run sync-viewer`; `npm run check-viewer` must pass.

## Files

| File | Change |
|---|---|
| `index.html` | `settleVoids`, called from `propagateByes`; `delete nextMatch.void` in its reset; `markKnockoutVoid`; the third picker row; the score dialog's void display and **Reverse**; `apply` deletes `void`; the list-style bracket renderer's tag |
| `pods.js` | `podsPropagate` calls `settleVoids` and resets `void`; `podIsFinished`; `syncFinalsFromPods` dead-slot handling; `podMatchCounts` |
| `pods-ui.js` | `podStatusText` and the Stage 6 table for a group with no winner |
| `boardplan.js`, `boardplan-ui.js` | skip void matches; `stampDoneTimes`; `bpToggleCall` guard |
| `render.js` and `viewer/render.js` | `mkoSlot` void and dead-slot text and styling |
| `viewer/index.html`, `viewer/theme.css` | match rows, status line, group card, `podFinished`, Finals slot text |
| `viewer/api/_lib/publicView.js` | publish `void` |
| `tests/` | see below |

## Testing

The same approach as before: Node's built-in runner with the whole app in a stubbed browser.

- **settleVoids:** one void feeder (the other already won, and the other still open), two void feeders, a chain of voids across three rounds, no void anywhere (the bracket is untouched), reversing a void clears the dependent byes and voids.
- **Group brackets:** a group of 4 with a void semifinal, a group of 3 where the only first-round match is void (the bye player becomes champion), a group of 2 whose single match is void, a void group final (no winner, group finished).
- **Finals:** a no-winner group's slot is dead, its opponent gets a bye, two dead slots make a void Finals match, a bye group whose winner is later lost, the guard that refuses an edit when a dependent Finals match is scored (and undoes it).
- **Other formats:** a plain knockout and the Plate bracket.
- **Organiser:** the picker lists the third row, `markKnockoutVoid` flags both players and saves, **Reverse** and entering a score clear the void, guards (no void on a played, bye or incomplete match).
- **Board plan:** void matches are skipped and cannot be called; a call is cleared when a match becomes void.
- **Standings and status:** group status, the Stage 6 table, group progress counts.
- **Display:** chart HTML for a void match and a dead slot, the viewer's match row, status line, group card and Finals slot, the public view publishes `void`.
- **Regression:** the golden snapshot for the three existing formats is unchanged, and the existing suite passes.

## Risks

- **The cascade is shared code.** A bug in `settleVoids` could affect ordinary brackets. It is guarded by being a no-op without a void and by the golden snapshot; the tests include brackets with no void that are compared before and after.
- **Stale void state.** Reversing or correcting a void must clear every `bye` and `void` it caused. Rule 4 and the reverse tests exist for this.
- **Old viewer.** Until the viewer is redeployed, a no-winner group looks unfinished there. The deploy order covers it.

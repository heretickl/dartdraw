# Board schedule for Group Boards — design

Date: 2026-10-07
Status: draft for review
Builds on: `2026-10-06-group-boards-design.md`

## Purpose

At a Group Boards event, a player, a spectator or the front desk should be able to tell where a match is and roughly when it will happen, without asking anyone. DartConnect solves this with its board viewer, scrolling board displays and a "when do I play" progress bar. Our viewer is organised by group only and shows no clock times, and Finals matches have no board.

### Success looks like

- A player opens the viewer and sees their board, how many matches are ahead of theirs, and an estimated start time.
- A phone or venue TV shows what is on each board now and what is next.
- The organiser can print a wall list of every player with their group and board.
- Every Finals match has a board.
- The organiser can mark a match as called, and the player sees it straight away.

### Not in this spec

QR codes on printed sheets, push or fan alerts, results export, double no-show handling, check-in warnings at the draw, live scoring, scorekeeper assignment, player statistics. These came up in the gap review and are separate pieces of work.

## Decisions already made

- Group Boards events only. The other three formats are unchanged.
- "Now playing" cannot be known without live scoring. The board queue gives a best guess ("up now"), and a one-tap **Call** by the organiser confirms it.
- Estimated times are shown only when the organiser has set an anticipated start time. They are labelled as estimates and re-based on real progress. Without a start time, only queue positions are shown.
- The organiser computes the board plan on every save and stores it with the tournament. The viewer only displays it. The scheduling rules exist in one place and need no new copy in `viewer/`.

## Data

All new fields are optional, so existing tournaments and old viewers keep working.

| Where | Field | Meaning |
|---|---|---|
| each match (group or Finals) | `doneAt` | epoch ms when the result was entered. Set and cleared automatically (see Stamping). |
| each match | `called`, `calledAt` | the organiser has called this match to its board |
| each Finals match | `board` | optional board override for that match |
| tournament | `boardPlan` | derived board queues, rebuilt on every save (see below) |
| `printSettings` | `playersSheetEnabled`, `boardsSheetEnabled` | print toggles, default on for Group Boards |

### `boardPlan` shape

```
boardPlan = {
  v: 1,
  hasTimes: boolean,                 // true only if an anticipated start time is set
  boards: {                          // key = board number as a string
    "3": [ { key, ri, mi, status, ready, estMs, called }, ... ]   // in play order
  }
}
```

- `key` is the bracket key (`pod:<id>` or `ko`), and `ri`/`mi` are the round and match index. The viewer looks up the players and result from the bracket, so names are never copied into the plan.
- `status` is `done`, `up`, `next` or `later`. `up` is the first not-done entry on the board and `next` is the one after it. Everything further down is `later`.
- `ready` is true when both players are known. A match that is `up` but not `ready` is waiting for an earlier match, and the viewer says so.
- `estMs` is the estimated start as epoch ms, or `null` when `hasTimes` is false or the match is `up` or `done`.
- `called` is copied from the match.
- Only confirmed groups appear, plus the Finals once it is built. Byes never appear.

## Building the plan: `buildBoardPlan(t)`

A pure function in a new file `boardplan.js` (classic script, loaded after `pods.js`). It returns a `boardPlan` and changes nothing.

1. Per-match length comes from the existing `matchDurationMinutes`. Group matches use the group best-of (`podLegs`). Finals matches use the round's legs from `legsForKnockoutRound`.
2. Each board has a cursor that starts at the anticipated start time. If there is no start time, cursors are null and times are skipped.
3. Groups are processed in order. Within a group, round by round, its non-bye matches are dealt across the group's boards in order (match i goes to board `i mod boards`).
4. A match starts when its board is free and the group's previous round has finished. A group on several boards therefore plays its first-round matches together.
5. A finished match moves the board cursor to `max(cursor, doneAt)`. This is the re-basing rule. Estimates for the rest of the queue start from when the last result was actually entered, not from a plan made in the morning.
6. Finals start only after every group's estimated end, plus the knockout break if one is set. Each Finals match goes to `m.board` if set. Otherwise round 1 spreads across the boards used by the groups, lowest number first, and later rounds reuse them from the lowest number up.
7. Statuses and `ready` are set per board as described above.
8. Estimates are rounded to the nearest 5 minutes. They never depend on the current clock, so the same state always gives the same plan.

### Finals default boards

The default board list is every board number used by a confirmed group, sorted. Finals round 1 uses as many of them as it has matches, and each later round uses the lowest of those boards. The organiser can override a single match, for example to move the final to a feature board.

## Stamping results

`stampDoneTimes(t)` runs at the start of every save, before the plan is built:

- A match with a `winnerId`, no `bye`, and no `doneAt` gets `doneAt = Date.now()`.
- A match with a `doneAt` but no `winnerId` (the result was undone or cleared) loses `doneAt`.
- A match with a result loses `called`.

Doing this once at save time covers every way of entering a result: the score modal, no-show, undo and the correction cascade, without changing each of them.

## Organiser: Boards panel (Manage tournament)

A new panel for Group Boards, above the group list:

- One card per board, listing its `up` and `next` entries and the count still to play. Each entry shows the players, the group or Finals round, and the estimated time if there is one.
- Buttons per entry: **Call**, **Enter result** (opens the existing score modal), **No-show** (opens the existing no-show picker).
- **Call** sets `called` and `calledAt`; a called entry shows **Uncalled** to undo it. It is offered only when both players are known and there is no result.
- Finals entries have a small board field. Typing a board saves `m.board`. Clearing it goes back to the default.
- If no start time is set, the panel says that times are off and links to Format & branding.

## Viewer

### Boards tab

Added to the tabs for Group Boards events only, and only when the published data contains a `boardPlan`. One card per board, in board-number order:

- The board number, then **Up now** with the players. A called match reads **Called — go to Board 7**.
- The next two matches with their estimated times.
- "N more" for the rest of the queue.
- A match that is `up` but not `ready` reads "Waiting for Group 3 semifinal" or similar.

The tab refreshes with the rest of the page every 20 seconds.

### TV mode

`#/boards?tv=1` shows the Boards tab with large type, no tabs or search, and pages through the boards by itself (as many cards as fit, switching every 12 seconds). It follows the light and dark theme.

### Player and group pages

- **Me** and player pages show one line under the status: "Board 3 · 2 matches ahead · ~7:40 pm". If the player's match is called it shows a highlighted "Called — go to Board 3" instead.
- A group's header and card show its board and when it is expected to start, for example "Board 3 · starts ~7:10 pm".
- Finals matches show their board on the bracket tab and in the player's match list.
- Time text uses the viewer's local time zone. Times always carry a "~".

## Print

Two new sheets in the Stage 7 print pack, each with a toggle, both on by default for Group Boards:

- **Players A–Z.** Name, club, group, board and estimated first-match time (when there is one), sorted alphabetically, in two columns on A4, for sticking on the wall.
- **Boards.** One row per board listing the groups on it in play order, and the Finals matches once the Finals is built.

## Backward compatibility

- A tournament saved before this change has no `boardPlan`. The organiser builds one on the next save, and the viewer hides the Boards tab until then.
- The old viewer ignores `boardPlan`, `called`, `board` and the new print settings.
- The public view whitelist gains `boardPlan`, `called` and `board`. It does not publish `doneAt` or `calledAt`.
- Deploy order: organiser first, viewer second (both deploy from `main`).

## Files

| File | Change |
|---|---|
| `boardplan.js` (new) | `buildBoardPlan`, `stampDoneTimes`, helpers for the print lists |
| `boardplan-ui.js` (new) | the Boards panel, Call handler, Finals board field, the two print sheets |
| `index.html` | script tags, call `stampDoneTimes` and `buildBoardPlan` in `persist`, mount the panel in Stage 5, print toggles in Stage 7, migration defaults |
| `viewer/index.html`, `viewer/theme.css` | Boards tab, TV mode, Me, group and Finals lines |
| `viewer/api/_lib/publicView.js` | publish `boardPlan`, `called`, `board` |
| `tests/` | see below |

## Testing

The same approach as Group Boards: Node's built-in test runner with the whole app loaded into a stubbed browser.

- **Plan building:** one group per board, two groups queued on a board, a group on two boards, byes skipped, unconfirmed groups left out, the Finals starting only after the groups end, a Finals `board` override, no start time (no times, positions only).
- **Re-basing:** a late result moves the estimates behind it, and undoing the result puts them back. The same state always gives the same plan.
- **Statuses:** `up`, `next` and `later` after each result, `ready` false while a feeder match is open, and a called match clearing when its result is entered.
- **Stamping:** `doneAt` set on a result, cleared on undo, and left alone on byes.
- **Public view:** `boardPlan`, `called` and `board` are published; `doneAt` and `calledAt` are not.
- **Viewer:** Boards tab present only with a plan and only for Group Boards, TV mode paging, the Me line (queue position, called, no times), group and Finals lines.
- **Print:** both sheets sort and group correctly and respect their toggles.
- **Scale:** the 540-player, 64-group event builds a plan in well under a second and the plan stays a reasonable size.
- **Regression:** the golden snapshot for the three existing formats is unchanged.

## Risks

- **Estimates can be wrong.** They are labelled "~", rounded to 5 minutes, re-based on real results, and hidden when no start time is set. The queue position ("2 matches ahead") is the dependable part.
- **"Up now" is a guess.** The first unfinished match on a board may not have started. Call is the confirmation, and the wording on the viewer is "Up now", not "Playing".
- **Stored derived data.** `boardPlan` is a copy that can go stale between saves. Every result and board edit goes through a save, so it is rebuilt whenever the inputs change, and nothing else reads it as a source of truth.

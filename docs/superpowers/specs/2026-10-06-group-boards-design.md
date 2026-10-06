# Group Boards (groups feeding a Finals bracket): design

Status: draft for review. Date: 2026-10-06.

## 1. Goal

Let an organiser run one event as many small knockout **groups**. Each group runs on its own board (or a few boards) and its winner goes through to a single **Finals** bracket. This is DartConnect's "Group Boards" format, seen in the Malaysia Open 2025 Open Singles: 540 players, 64 groups, a Top 64 Finals.

**Terminology.** In the organiser app, the viewer and the print sheets, these small knockouts are called **Groups** and numbered (Group 1, Group 2, ...), as DartConnect does. DartDraw's existing round-robin groups are lettered (Group A, Group B). The two kinds never appear in the same tournament, because Group Boards is its own format. In this spec "round-robin group" means the existing kind. In code the new ones are named `pods` (`state.pods`, `generatePods`) so they never clash with `state.groups`, which holds the round-robin groups.

It must work for a 40-player club event and a 500-player open, so group count and group size are settings, not fixed numbers.

The organiser app is built first. The public viewer follows once the data exists. The scoring app is out of scope.

## 2. Decisions already made

| Topic | Decision |
|---|---|
| Event size | One feature that scales from club events to 500+ player opens |
| Advancing | Group winner only goes to the Finals |
| Group setup | The organiser chooses the **number of groups**. Group sizes are derived and differ by at most 1 |
| Draw features (all in v1) | Seeds spread across groups; avoid same club in a group; move a player between groups by hand; fully random draw (no seeding) |
| Finals draw | Fixed in advance by group position. The Finals chart exists, with placeholders, before any group finishes |
| Boards | Groups get boards. Per-match boards and markers for knockout matches are a later feature |
| Bulk entry of players | Separate later feature, not part of this one |
| Data model | A new `pods` list, each with its own bracket (approach A) |

## 3. Out of scope (later)

- Pasting or importing a list of entries (bulk entry).
- Board numbers and markers on individual knockout matches.
- Two qualifiers per group, and a Plate or consolation bracket for non-winners.
- Printing several groups on one page.
- Several people entering scores at the same time (per-match saving). That belongs to the scoring app.
- Viewer extras: TV rotator mode, push alerts, a page listing several events.

## 4. Format and settings

- New `format.formatType` value: `podknockout`, shown to organisers as **Group Boards** next to Round robin, Knockout, and Round robin then knockout.
- New format fields:
  - `podCount` (integer, at least 2, at most 128).
  - `podLegs` (best-of for group matches, defaults to `bestOfLegs`).
- Reused as they are: `seedingEnabled`, `numSeeds`, `orgSplit`, `seedOrder` (the Participants and Seeding panel), and `knockoutLegs.main` (per-round legs for the Finals).
- Validation at Stage 2: at least 2 players per group (entries >= 2 x `podCount`), and `podCount` <= 128, the existing chart limit. The existing format-check warning pattern shows the message.

## 5. Data model

```
state.pods = [{
  id, label,            // label is the group number as text: "1", "2", ...
  entryIds: [],         // the players drawn into this group
  boards: [n, ...],     // default [group number], wrapped if boards < groups
  confirmed: bool,
  bracket: { id, label: "Group N", size, seeds, rounds: [[match, ...], ...] },
  winnerId              // set when the group's final has a winner
}]
state.knockout = the Finals bracket (existing field)
```

- A group's `bracket` uses the same match shape as today (`aEntryId`, `bEntryId`, `aLegs`, `bLegs`, `winnerId`, `bye`, `wo`), so the bracket drawing, bye handling, no-show handling and score-entry screen are reused. The score-entry screen's bracket key is extended from `knockout` or `knockoutLosers` to also accept a group, for example `pod:<id>`.
- Finals first-round matches may carry `aFromPod` and `bFromPod` (a group id). While that group is unfinished, the slot's `aEntryId` or `bEntryId` is null and the placeholder is "Winner of Group N".
- Existing tournaments have no `pods` field and are never read as groups.

## 6. The draw

`generatePods(t)` does the following:

1. Take the entries in `seedOrder` (active entries only). If seeding is on, the first `min(numSeeds, entries)` are the seeded players.
2. Deal the seeded players across groups 1..P in a snake order (1..P, then P..1, and so on). Each of the first P seeds lands in a different group, and group strength stays balanced.
3. Shuffle the unseeded players and deal each to the group with the fewest players so far (ties broken randomly). Final sizes differ by at most 1.
4. If seeding is off, shuffle everyone and deal them the same way.
5. If `orgSplit` is on, run the existing same-organisation clash fixing across groups, moving or swapping **unseeded players only**. Seeded players never move. This is best effort, like the existing round-robin behaviour.
6. Build each group's bracket with `generateBracket`, ordering the group's players by seed number, so the best seed gets a bye when the group is not a power of two.
7. Assign boards: group _i_ gets board _i_, wrapping when there are fewer boards than groups.

**Moving a player by hand:** the organiser moves or swaps a player between two groups. Both groups' brackets are rebuilt. This is allowed only while both groups are unconfirmed and unscored.

**Redraw:** deals everyone again. It is disabled once any group has a score.

## 7. The Finals bracket

- Group strength is the lowest seed number among the group's players. Unseeded groups rank after seeded groups, in group-number order.
- Finals size is the next power of two at or above `podCount`. Slots come from the existing `seedSlotOrder`, with group strength as the seed. The strongest groups therefore sit in opposite halves, and any byes go to the strongest groups.
- The Finals is generated when the **last group is confirmed**, so slot positions are fixed before play. Until then Stage 4 shows "Confirm all groups to build the Finals".
- A confirmed group can start and finish before the other groups are confirmed. Its winner is stored on the group and written into the Finals slot as soon as the Finals exists.
- When a group's final gets a winner (and the Finals exists), the winner is written into the matching Finals slot and byes propagate with the existing `propagateByes`.
- **Editing a group result later:**
  - If the group's winner would change and the Finals first-round match that depends on it has no score, the slot is updated.
  - If that match, or any later match depending on it, has a score, the edit is blocked with a message. This mirrors how brackets already protect scored matches.
- **Withdrawals:** before confirming, a withdrawn player is left out of the draw. After confirming, the existing no-show handling decides the match, and the group still finishes.

## 8. Organiser screens (the 7 stages)

1. **Event:** unchanged.
2. **Format:** the Group Boards choice with the number of groups and the group best-of, plus the validation above.
3. **Draw:** the Participants and Seeding panel as for knockout, then **Draw groups**. Groups appear as cards listing players and boards. Each card has a boards control, a move or swap control, and a redraw control.
4. **Confirm:** confirm groups one at a time or all at once. When the last group is confirmed, the Finals is generated. A schedule estimate is shown.
5. **Manage:** a compact grid of group cards (progress, boards, winner) with a filter for finished and unfinished groups, plus a Finals card. Opening a group shows its bracket, using the existing score-entry and no-show screens. The header shows "N of P groups finished".
6. **Results:** group winners, then Finals placings.
7. **Print:** the Finals chart (existing), and one sheet per group (the existing bracket sheet, titled "Group N, Board X").

## 9. Boards and schedule

- `pod.boards` is editable per group using the same board toggle round-robin groups use.
- The existing schedule estimate is reused. Groups run concurrently on their own boards, and groups sharing a board queue behind each other. The Finals starts after the last group. Match duration comes from the existing per-match time setting, using `podLegs` for groups and `legsForKnockoutRound` for the Finals.

## 10. Public view and the viewer

- `toPublicView` gains an allow-listed `pods` list: `id`, `label`, `boards`, `entryIds`, `bracket` (through the existing `publicBracket`), and `winnerId`. The Finals first-round match fields `aFromPod` and `bFromPod` are added to the allowed match fields.
- The viewer's Bracket tab gets a picker: Finals, All groups, or Group 1..N. Finished groups are listed under "Completed", and Me or Following can jump to the player's own group.
- A player's status line covers groups and the Finals, for example "Group 5, next: vs Lee, Board 5" and "Finals: next, Round of 16 vs ...".
- Draws of 32 or more players open in the Rounds view on every screen size, because the full chart shrinks to unreadable text.
- Group match tags are `G<group number>·<round>-<match>` (for example `G5·2-1`) so they never collide across groups. Finals tags are unchanged.
- Payload size for a 540-player event is about 100 KB, which is fine with the existing 10-second cache.

## 11. Testing

1. **Draw checks:** build groups from 540 synthetic entries and from small cases (for example 12 players, 5 groups). Assert sizes differ by at most 1, the top P seeds are in different groups, no seeded player moves during club clash fixing, and byes land with the best seeds.
2. **Finals mapping:** assert slot order, the placeholder text, byes for non-power-of-two group counts, and that strongest groups sit in opposite halves.
3. **Full-run simulation:** play every group and Finals match with random scores, and check that winners flow into the Finals, placings are produced, and an edit that would invalidate scored Finals matches is refused.
4. **DartConnect replay:** load Malaysia Open Group 1 (8 players) and the Finals (64) through the new model and compare the viewer output against the earlier simulation.
5. **No change to existing formats:** the same before-and-after identical-output check on the standings table and bracket chart used earlier, plus a manual walk through the three existing formats.

## 12. Rollout and risks

- Rollout order: organiser side first (only tournaments that choose Group Boards are affected), then the viewer.
- Risk: `index.html` is about 4,800 lines and every stage function branches on format. Group Boards code should live in clearly separated functions (`pods*`) with thin branches in the stage functions, to keep the change reviewable.
- Known limit: the whole tournament is saved as one record, so one operator at a time is fine. A 540-player tournament is a large record (several hundred KB per save). Several people scoring at once will conflict. Per-match saving is the scoring app's job.

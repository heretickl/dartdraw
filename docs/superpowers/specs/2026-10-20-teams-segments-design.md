# Teams: segments, no roster (design)

Approved by the owner in chat on 2026-10-20. Organiser app only (`app.html`, print/format helpers at repo root, help/landing content). The public viewer is not changed.

## Goal
Bring **Teams** back as a third competition type for new events (Singles, Doubles, Teams). A team match is defined by **segments**; the organiser records **one plain result per team match: the total legs each team won across all its segments**. There is **no roster** anywhere.

## Rules (all decided)
1. **No roster, no player names** for any competition type. Remove the per-entry player boxes, the "Players per team" field, the team handout sheet (toggle, sheets, wording) and the Foursome-vs-Rubber "Team format" choice. Existing stored `players` arrays stay in the data, untouched, never shown or used (`ensureEntries` must stop padding/trimming/clearing them). A Doubles pair or a Teams entry is just its name.
2. **Competition types offered for a new event:** Singles, Doubles, Teams. Triples is still selectable only for an existing Triples event (as today for existing events). A Triples event is a plain-legs event with a named entry (no roster).
3. **Team match = segments** (Format & branding, shown for Teams in both Basic and Advanced setup):
   - The organiser chooses the number of segments (add / remove rows; at least 1; move up/down is fine).
   - Each segment has: a **type** dropdown (Singles, Doubles, Trios, Foursome; "Trios" is the new label for the old "triples"), a **starting score** dropdown (301, 501, 701, 1001) and a **best of** number of legs (odd numbers preferred; reuse the existing odd-number warning).
   - A checkbox **"A tie-breaker might be needed"**. Ticking it adds one more segment at the end, which is its own segment with its own type, starting score and best-of. It is played only if total legs are level after the main segments.
   - Wording in the UI is **"segment"** (never "rubber").
   - **Defaults for a new Teams event:** Foursome 1001 x 1; Singles 501 x 3; Doubles 501 x 3; Singles 501 x 3; Doubles 501 x 3; tie-breaker ticked: Foursome 1001 x 1. ("x N" = best of N legs.)
4. **Result entry (round robin, knockout, Group Boards): one plain result.** Two number boxes, the legs each team won in total across all segments (including the tie-breaker's leg(s) if it was played). No per-segment result entry (remove `promptScoreMixed` and the rubber-winner storage use). Standings use the totals exactly like legs today.
   - **Cap:** each team's total is limited to the most it could win: sum over the main segments of (floor(bestOf/2)+1), plus the tie-breaker's (floor(bestOf/2)+1) if the tie-breaker is ticked. With the defaults: 1+2+2+2+2 = 9, or 10 with the tie-breaker. Entering above the cap is refused with a clear message.
   - **Level totals:** allowed in **round robin only**; refused in knockout and in Group Boards (a knockout-style format), as a level result is refused in knockout today.
   - The winner is the team with more total legs.
5. **Knockout / Group Boards for Teams:** every round uses the same segments (one setup per event). Hide the Stage 2 "Best of legs" field and the knockout leg-progression options for Teams (each segment sets its own legs).
6. **Time estimate** for a Teams match: the sum of the legs of all segments **including the tie-breaker** when ticked (as the existing rubber estimate sums legs), at the existing minutes-per-leg setting.
7. **Lineup sheet:** keep the existing lineup sheet (toggle, round robin and knockout fixtures, `lineupCardHTML`) working from the new segments: one dark bar per segment showing a label, "<start> x <N> Leg(s)" and the Points box, numbered blank lines per type (Singles 1, Doubles 2, Trios 3, Foursome 4), a TOTAL POINTS bar, tie-breaker bar labelled TIE-BREAKER, signature line. Segment label = "<Type> <n>" (e.g. "Singles 1"; the organiser may rename nothing in this pass). The toggle is offered for every Teams event (no longer only for the old rubber format). The sheet's final design comes later; only keep it working.
8. **Rules/format description sheet** (`formatDescriptionLines`): describe the segments (e.g. "Each match has 5 segments: Foursome (1001, best of 1), ... Tie-breaker if the totals are level: Foursome (1001, best of 1). The team with more total legs wins.").
9. **Existing events:** one model only. On load, migrate a legacy Teams event: `mixedRubbers` -> segments (type `triples` -> `trios`; the rubber flagged tie-breaker -> the tie-breaker); a legacy `foursome`-format event -> one Foursome segment with its `bestOfLegs`. Existing scores stay as numbers. Never delete old fields' data. Existing Singles/Doubles/Triples events are unaffected.
10. **Viewer unchanged** (it keeps showing the team result as legs). Check `viewer/api/_lib/publicView.js` does not publish segment/roster internals beyond what it already allows; do not edit `viewer/`.
11. **Public site / help:** Teams is a competition type again. Update the landing/features/how-it-works copy ("Singles · Doubles" -> "Singles · Doubles · Teams", the "Singles and doubles" feature card) and the help guide (new Teams section: segments, tie-breaker, result entry, cap, level rule; no roster; no handout). Update tests that forbid the word "Teams".
12. **Not in scope:** viewer wording, lineup sheet redesign, per-round segment setups, roster in any form.

## Tests
New `tests/teams-segments.test.js` plus updates to `tests/competition-types.test.js`, `tests/help-site.test.js`, `tests/landing-site.test.js`: type picker offers Singles, Doubles, Teams (and Triples only for an existing Triples event); defaults; segment add/remove/type/start/best-of/tie-breaker checkbox; migration of legacy events; the result modal/cap (cap values with defaults 9 and 10, level rule per format); standings use totals; time estimate; no roster boxes/handout anywhere; lineup sheet from segments; stages 1-7 render for Teams in all three formats; Singles/Doubles unchanged.

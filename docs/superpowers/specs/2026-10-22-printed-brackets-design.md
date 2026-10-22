# Printed brackets, paper-size rule, Teams lineup printing (design)

Approved by the owner in chat on 2026-10-22. Organiser app only (`app.html` and the print helpers; public pages/help text). The public viewer (`viewer/`, `render.js`, `render.css`) is NOT changed.

The binding visual design is the set of mockups in `docs/design/bracket-redesign/` (index.html, a-128-a3.html, a-128-a4-shrunk.html, b-16-32-a4.html, c-projected-34.html, d-paper-dialog.html, e-running-order-17.html, f-group-boards-finals.html) with their shared engine `engine.js`, `mock.css`, `data.js`. Reproduce those layouts in the app's real print code. Where the mockup and this document differ, this document wins.

## 1. Two-sided bracket sheets
- Every knockout bracket EXCEPT Group Boards prints two-sided: left half and right half flow to the centre, with the Final in the middle (finalists stacked in the centre column, Champion box below, header block above the Final, sponsors below the Champion, a 7 mm footer with legend and credit). Applies to: the main bracket, the Plate pool bracket and the projected (pre-round-robin) bracket, for Singles, Doubles and Teams. Group Boards keeps its current layout.
- One bracket = ONE sheet at ONE uniform scale s = min(fit width, fit height, 2). Boxes, text, gaps scale together; aspect ratio is never distorted.
- Byes are collapsed: a bye does not take a box row; an entry with a bye starts in round 2 with a small grey BYE tag and its seed beside it. Placeholders never touch: match numbers sit on the bracket joints, seeds print outside the box, spare height goes into gaps.
- Box width comes from the widest name, measured at bold weight. Names up to 24 characters print in full; longer ones get an ellipsis, a footnote number, and the full name in the footer. Two-line names when the sheet is short of width but has spare height.
- Darker print lines: boxes #aab6c3, connectors #8e9db0. The Champion box is GOLD (replaces green).
- The results (legs) cell is at least 4.2 x 4.8 mm and grows when the sheet has spare space (small brackets on A4/A3); big draws stay at the minimum.
- Print font for bracket names: Barlow Semi Condensed, embedded in the app (base64 woff2, subset to Latin) and used only for the printed bracket sheets; keep Inter elsewhere. Measure text with the same font so fit calculations match the print.

## 2. Legibility rule and paper-size rule
- HARD floor (7 pt names; Final 7.6 pt): names at least 7 pt, boxes at least 4.8 mm (7.4 mm for two lines), gap at least 1.6 mm inside a match and 3.0 mm between matches; secondary text 4.6-5.5 pt. A chart is "legible" when s >= 1 at these floors.
- SOFT recommendation (8 pt): when names would print between 7 pt and 8 pt, show a non-blocking suggestion ("Names print at 7.2 pt; 8 pt or more is easier to read. A3 would give that.") with a button to switch; never block.
- Recommended paper = the smallest of A4, A3, A2, A1 where every bracket sheet of the event is legible (s >= 1). Byes collapse, so partial draws need less (67 entries in 128 slots: A3; 34 projected qualifiers: A4).
- When the chosen paper is not legible, the print action opens a dialog (see d-paper-dialog.html) with THREE options: "Use <recommended> (recommended)"; "Split over N A4 sheets" (only when splitting is possible: the chart is cut into wing sections at the legible scale, each on an A4 sheet with alignment marks and section labels, plus a Finals sheet; this is where the old wing-sheet approach survives); "Keep <current size>" which shrinks the whole chart to fit ONE sheet keeping its ratio. Keep shows a clear warning: "The names may be too small to read when printed. Recommended: A3." The warning is also shown as a small note on the print stage (never printed on the sheet). The chosen option is remembered for the event (koPaperSize / a new setting) and re-asked only if the draw changes so the answer no longer fits.
- The dialog must also be used for the projected bracket in the print pack and for the Plate pool.

## 3. Other overflowing sheets (fix, per mockups e and f)
- Round robin RUNNING ORDER sheet: one column per board, up to 8 per A4 sheet, groups in playing order, matches with tick boxes; never splits a group; no overflow with 17 groups (and 24 groups on 4 boards).
- Group Boards Finals placeholders before the groups are played: show "Winner of" over "Group 3" in full (no 'Winner of Gr...' truncation), fallback "Gp 3 winner" for short boxes.

## 4. Teams
- **No markers in Team round robin:** the group chart match lines must not show "Marker: n" (and no marker assignment is computed or printed) when the competition type is Teams. Singles/Doubles unchanged.
- **Ready-to-print lineup sheets in the knockout:** during the knockout, as soon as BOTH teams of a match are known (including after a team advances), that match's lineup sheet is available: on the Manage Tournament knockout view each such match shows a "Print lineup" action, there is a "Print all ready lineup sheets" action that prints every match whose two teams are known and whose sheet has not been printed yet, and printed state is remembered per match (reprint allowed). Use the tie-breaker bar per the knockout stage flag. Round robin keeps the existing per-fixture sheets in the print pack. Also available in the popout window.
- **Empty emergency lineup sheet:** a "Print empty lineup sheet" action on the print stage (and in Manage Tournament) for Teams events prints a blank lineup sheet (both sides: Group, Board, Fixture, Game No., Team Name left blank, the event's segments and tie-breaker bar per setup, Total Points, signature area, logo and event header) with a count option (1-10 copies). It must work with no fixtures.

## 5. Tests, help, docs
- Behavioural tests for: the layout engine (no overlaps/touching, gap/box/font floors, one sheet, uniform scale, byes collapsed, two-sided, champion gold, results cell growth), the recommendation table, the dialog logic incl. split option and Keep-shrink warning, remembering the choice, soft 8 pt suggestion, running order and Group Boards finals fixes, Teams markers removed, ready lineup sheets (appear when both teams known, printed state, print-all), the empty emergency sheet. Update tests that pinned the old wing layout.
- Update the help guide (printing section) and README; regenerate pages (`npm run build-landing`).
- Re-run the 67-entry simulation (`node scripts/sim/run-simulation.js`) and refresh `docs/design/simulation/` so the owner sees the final printouts before the games and when completed (also confirm the audit now reports no overlaps/overflow, and add Teams knockout lineup-ready output and the empty sheet).
- Not in scope: viewer changes (the owner declined; leave a note only if useful), Group Boards bracket layout.

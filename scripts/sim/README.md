# Simulation and printout harness

Plays 12 whole events (Singles, Doubles and Teams, each as Knockout, Round robin to Knockout, Knockout with Group Boards, and Round robin only; 67 entries each) through the organiser app's real functions, and writes the printed packs before and after play as standalone HTML pages. It is read-only with respect to the app: `app.html` is loaded into a Node `vm` exactly as `tests/lib/load-app.js` does and only its own functions are called. Nothing in `app.html`, `viewer/` or the tests is changed.

Since i18n step 4 the run is made twice: once with English printed sheets (`docs/design/simulation/`, exactly as before) and
once with every event's **Printed sheets language** set to Bahasa Malaysia (`docs/design/simulation-ms/`, the screens stay
English), each with its own audit and index. `--lang en` or `--lang ms` runs one of them.

```
node scripts/sim/run-simulation.js                 # everything, English and BM sheets (about 3 minutes, most of it the browser audit)
node scripts/sim/run-simulation.js --lang ms       # BM sheets only
node scripts/sim/run-event.js Teams knockout docs/design/simulation-ms ms   # one event with BM sheets
node scripts/sim/run-simulation.js --skip-audit    # the 12 events only (about 3 seconds)
node scripts/sim/run-simulation.js --only teams-knockout,singles-group-boards
node scripts/sim/run-event.js Teams knockout       # one event (Singles|Doubles|Teams + knockout|rrknockout|podknockout|roundrobin)
node scripts/sim/build-index.js                    # rebuild index.html and FINDINGS.md from the facts and audit already on disk
node scripts/sim/serve.js [port]                   # static server for docs/design/simulation (prints its port; Ctrl+C stops it)
```

Output goes to `docs/design/simulation/`: `index.html`, `FINDINGS.md`, `audit.json`, and per event a folder `<type>-<format>/` with `pre-game.html`, `completed.html`, `facts.json` (and `paper-sizes.html` for the three single-bracket events: the same bracket kept on A4 and shrunk, split over A4 sheets, and on A3, A2 and A1; for the three Round robin to Knockout events it holds the projected brackets of a 200-entry event on the recommended paper). Runs are deterministic: the app's `Math.random` is seeded by `tests/lib/load-app.js` and the match results come from a generator seeded by the event name.

## What one event does (scripts/sim/run-event.js)

1. Step 1 (`saveStage1`), the Scheduling box (`saveSchedulingModal`, 4 boards; 8 for Group Boards, one per group), step 2 (`setFormatType`, `saveStage2`: groups of up to 4, top 2 qualify, seeded; 8 groups for Group Boards; Plate pool off), entry names through `renameEntry` ("Singles 01", "Pair 01", "Team 01"), seeding on for the knockout and Group Boards, Public results on (so the QR code prints), the lineup-sheet tick for Teams.
2. Check-in (`checkInAll`), then the draw: `regenerateKnockoutBracket`, or `confirmShuffleGroups` + `confirmAllCharts`, or `podsDrawClick` + `podsConfirmAllClick`.
3. Pre-game pack: the real `doFinalPrint()` (so `runPrintPack` or `podsPrintClick`), captured from `#printSheets`. When a bracket is not legible on A4 the paper dialog opens; the harness records its title and options in `facts.json` and answers with the default, the recommended size. Teams events also print the empty lineup sheet (`printEmptyLineups`), and in a knockout the lineup sheets that are ready (`printLineupFor`, then `printReadyLineups` after every round).
4. Start the games (`startAllGames`, or `startKnockoutRound` as each round becomes eligible; Group Boards has no start button).
5. Play every match through the real result boxes: `promptScore` (round robin), `koMatchScoreModal` (knockout, Group Boards groups and Finals). A result the app refuses stops the event with an error. Teams results are segment by segment totals, with the tie-breaker or a deciding leg for a level knockout total, so the cap and level rules are checked by `teamResultError`. Unresolved round robin ties are settled through the real Adjust positions dialog. After the round robin, `confirmGenerateKnockoutFromRR` draws the knockout.
6. Verify: `eventComplete`, the champion, the number of results. Then the completed pack through `doFinalPrint()` again.

Each event runs in its own node process with a 120 s kill limit (`run-simulation.js`), and `facts.json` records the run time and a flag when it passes 60 s.

## The pages

`lib/pack.js` splits the pack into its sheets (sibling `div`s), names each sheet type (rules, running order, players, boards, chart, bracket, projected, lineup), and writes a page with `render.css` and the `app.html` stylesheet inlined. The app's `@media print` sheet sizes are applied as plain rules, so each sheet has the box it prints at: bracket sheets 281 x 194 mm (A4 default; A3, A2 and A1 follow the paper-size setting), other sheets 277 x 190 mm, lineup sheets 190 x 277 mm portrait. The screen zoom is a wrapper (`zoom` on a `div` around the sheets) with a slider; printing resets it.

Teams lineup sheets are shown as captioned samples (the first round robin fixture, the first knockout fixture that is ready, the final, the empty sheet, and a knockout sheet printed as it became ready); the real count is in each page's header and in `facts.json`.

## The layout audit

`audit-client.js` is embedded in every page. It switches the zoom to 100%, measures each sheet, and shows a summary at the top of the page. For the two-sided bracket sheets (bracket-print.js) it checks, in mm, every printed item against every other (overlap), the boxes of a column against the gap floors (1.6 mm inside a match, 3.0 mm between matches, times the scale on a sheet shrunk on purpose), items off the sheet, clipped text, the 7 pt name floor on legible sheets, one box height and the shape (two-sided, or one half on a split section sheet). For the Group Boards charts it reports overlapping and touching (gap under 4 px) name boxes, clipped names and the frame. The running order is checked for columns and groups past the sheet. Every other sheet is checked for text cut by its box
(an element with its own text, `overflow:hidden` or an ellipsis, whose text is wider or taller than the box: the lineup
header bars and segment titles, the running order heads, footers, captions), added for the longer BM words (i18n step 4). `run-audit.js` runs it for all pages in a headless Chrome or Edge (`SIM_BROWSER=<exe>` to choose one; no browser means the audit is skipped and the pages still run it live) by loading each page with `?audit=1` and reading the report back from the dumped DOM. `build-index.js` turns facts and audit into `index.html` and `FINDINGS.md`; the reviewer notes at the top of `FINDINGS.md` live in `findings-notes.js` and are edited by hand.

Text widths in Node: the bracket sheets measure with the print font's own advance widths stored in `bracket-print.js`; the Group Boards charts with a stand-in for the canvas (`lib/appvm.js`, characters x font size x 0.55 or 0.60). The audit measures the real thing in the browser.

## Files

- `run-simulation.js` orchestrator; `run-event.js` one event; `run-audit.js` headless audit; `build-index.js` index and findings; `serve.js` static server
- `lib/appvm.js` loads the app and the drive helpers; `lib/play.js` seeded results; `lib/pack.js` sheets to pages
- `audit-client.js` the in-page measurement; `findings-notes.js` the hand-written notes

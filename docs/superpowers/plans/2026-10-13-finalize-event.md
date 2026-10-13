# Accept results & finalize (closed events) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** An organiser can "Accept results & finalize" a completed event. A finalized event is closed: the organiser cannot reopen or edit it (only an Admin can, via the database for now), the public viewer shows "Final results", and the home page lists it under Results only once finalized.

**Architecture:** One new field on the tournament JSON, `finalized: { at: '<ISO date-time>' }`. The server (`api/tournaments/[id].js`) refuses PUT and DELETE for a row whose stored data has `finalized`. The organiser (`index.html`) shows a Stage 5 card to finalize (only when the event is complete), then locks its own UI. The viewer project (`viewer/`) receives only `finalizedAt` through the allow-list and uses it for the pill and the home page lists.

**Tech Stack:** Vanilla JS single-file organiser, Vercel serverless functions, Neon Postgres, Node `node --test`.

## Global Constraints

- Real DartConnect player names must never enter the repo.
- Tests: `npm test` (all must pass; currently 448 before this work), `npm run check-viewer` must stay ok (it compares `render.js`/`render.css` with their copies under `viewer/`; run `npm run sync-viewer` only if you change `render.js`/`render.css`, which this plan should not need).
- Do NOT run `git commit`, `git add`, `git push`, `git stash` or any git write command. The controller reviews the working tree and commits. Leave `.claude/` and `docs/superpowers/specs/2026-10-13-csv-export-design.md` alone.
- Viewer files are pure ASCII where they already are (use `\u` escapes in `viewer/home.js`/`home.css`); keep the existing comment density and style (`var`, ES5-style in `viewer/index.html` inline script; modern JS in `index.html` organiser and `viewer/api`).
- Rules agreed with the user (2026-10-13): the organiser can NOT reopen or edit a finalized event; there is NO Reopen button. Publishing/listing toggles, rename, delete, scores, draws, entries, settings are all locked. Allowed on a finalized event: viewing, navigating stages, printing/exporting, copying/opening the public link, Duplicate (the copy starts un-finalized), opening other tournaments, creating new ones. Existing complete events stay Live until their organiser finalizes them.
- `finalized.at` is an ISO 8601 string produced by `new Date().toISOString()`.

## Review Focus

- A finalized event whose browser tab is stale (loaded before finalizing, or another tab/device): its save must be refused by the server and the tab must show the finalized state, not a silent "Saved".
- The finalize step itself must still be saveable (the lock must not trigger on the PUT that sets `finalized`).
- Event is complete except a Plate pool match / one Group Boards group: the finalize card must not offer finalizing.
- A tournament whose data has `finalized` set to junk (`true`, a string, `{}` without `at`): the organiser treats any truthy `finalized` as locked; the viewer/public API only accepts a valid ISO `at` and otherwise treats the event as NOT finalized (never shows Results from junk).
- Duplicating a finalized event must produce an editable, un-finalized, unpublished copy.

---

### Task 1: Server lock on the organiser API

**Files:**
- Modify: `api/tournaments/[id].js`
- Test: `tests/tournament-lock.test.js` (new)

**Interfaces:**
- Produces: for a stored row whose `data.finalized` is truthy, `PUT /api/tournaments/:id` and `DELETE /api/tournaments/:id` respond `403` with JSON `{ error: 'This event is finalized. Only an Admin can change it.', finalized: true }`. GET is unchanged. A row without `data.finalized` behaves exactly as today (including the PUT that first sets `finalized`).
- Consumed by Task 2 (the organiser reads `res.status===403 && body.finalized`).

- [ ] **Step 1: Write failing tests** in `tests/tournament-lock.test.js`, following the fake-database pattern of `tests/list-endpoint.test.js` (replace `viewer`-style `db` module via `require.cache`; here the module is `api/_lib/db` and `api/_lib/auth` — fake `requireAuth` to return `{ id: 'org1' }` the same way, by pre-populating `require.cache` for `../api/_lib/auth`). The fake `sql` tagged template must answer by inspecting the SQL text: `SELECT ... FROM tournaments WHERE id` -> the stored row; `UPDATE`/`DELETE`/`INSERT` -> record the call and return rows. Cases: (a) PUT on a finalized row -> 403, body as above, no UPDATE issued; (b) DELETE on a finalized row -> 403, no DELETE issued; (c) PUT on a non-finalized row where the incoming data sets `finalized` -> 200 and UPDATE issued (finalizing works); (d) PUT/DELETE on a non-finalized row as today; (e) `finalized: true` and `finalized: {}` count as finalized (locked); (f) GET on a finalized row still 200; (g) a row owned by another organiser is still 404 (not 403) even if finalized.
- [ ] **Step 2: Run** `node --test tests/tournament-lock.test.js` — expect FAIL.
- [ ] **Step 3: Implement** in `api/tournaments/[id].js`: add a helper `isFinalized(data)` (`!!(data && typeof data === 'object' && data.finalized)`); in DELETE first `SELECT data FROM tournaments WHERE id = ${id} AND created_by = ${organizer.id}`, return 404 when absent (keep the existing 204 for a missing id? — keep today's behaviour: DELETE of a missing row stays 204), 403 when finalized, else delete as today; in PUT, after the "belongs to someone else" check and before the insert/409 logic, `if (existing && isFinalized(existing.data)) return 403`. Update the header comment block to document the 403.
- [ ] **Step 4: Run** the new tests and the full suite — expect all pass.

---

### Task 2: Organiser — finalize card, completeness, and the lock

**Files:**
- Modify: `index.html`
- Test: `tests/finalize-event.test.js` (new; uses `tests/lib/load-app.js` + `helpers.js` like `tests/organiser-listed.test.js`)

**Interfaces:**
- Consumes: Task 1's 403 `{ finalized: true }`.
- Produces (names used by the tests):
  - `eventComplete(t)` -> boolean. Complete means: `roundrobin`: at least one confirmed group and every confirmed group `groupIsComplete`; `knockout`: `t.knockout` exists and `bracketIsComplete(t.knockout) || bracketIsVoidFinal(t.knockout)`; `rrknockout`: every confirmed group complete (and at least one), the main bracket complete-or-void-final, AND if `t.knockoutLosers` (Plate pool) exists it is complete-or-void-final too; `podknockout`: at least one confirmed pod, every confirmed pod finished (`podFinished`), and the Finals (`t.knockout` with `podFinals`) complete-or-void-final. Anything else/null -> false. Never throws on partial data.
  - `finalizeResults()` — opens a confirm modal (title "Accept results as final?", body "The public page will show Final results and the event moves to Results. After this only an Admin can change or reopen it.", confirm label "Accept & finalize"); on confirm, if `eventComplete(state)` still holds, sets `state.finalized = { at: new Date().toISOString() }`, persists immediately (calls `persist()` then `flushSave()`), and only after the PUT succeeds adds the id to `lockedIds` and re-renders. If the PUT fails, removes `state.finalized` again and shows the save error status.
  - `isLocked(t)` -> `!!(t && t.finalized)`.
  - `finalizeCardHTML()` — the Stage 5 card (see below).
  - a `lockedIds` set of tournament ids known to be finalized on the server (filled in `openTournament` and when the saved list loads, and after a successful finalize).

- [ ] **Step 1: Write failing tests** (`tests/finalize-event.test.js`) for: `eventComplete` across all four formats (incomplete -> false; complete -> true; rrknockout with an unfinished Plate pool -> false; podknockout with one unfinished pod -> false; junk/empty -> false); `isLocked`; `finalizeCardHTML()` content for: incomplete event (no Accept button, shows a short "Available once every match is played" note), complete event (Accept & finalize button, `onclick="finalizeResults()"`), finalized event (text "Results finalized", the date, and NO button that reopens/edits; text "Only an Admin can reopen or edit this event."); `duplicateTournament` copy has no `finalized` (extend the existing duplicate test style in `tests/organiser-listed.test.js`); `persist()` on a locked state does not schedule a save (spy `flushSave`/`saveTimer`) and triggers the reload described below.
- [ ] **Step 2: Run** the new tests — expect FAIL.
- [ ] **Step 3: Implement** in `index.html`:
  1. `eventComplete`, `isLocked`, `lockedIds`, `finalizeResults`, `finalizeCardHTML` (card titled "Accept results & finalize" using the existing `.card` / `.intro` / `.buttonrow` / `.confirm-box` styling; finalized state: green "Results finalized" line with `new Date(finalized.at).toLocaleString()` and the Admin sentence). Render the card at the end of `stage5()` output for all formats (read `stage5()` and the format-specific stage-5 builders to find the single place every format passes through; the card shows for all four formats). Hide nothing else.
  2. **Lock layer** (defence in depth — all three layers are required):
     - `persist()`: at the very top, `if(state && lockedIds.has(state.id)){ reloadLockedTournament(); return; }`. `reloadLockedTournament()` shows the status "This event is finalized — only an Admin can change it" via `setSaveStatus` (add a `'locked'` status text) and re-fetches the saved copy with the same GET `openTournament` uses, replacing `state`/`tournamentsCache`, then `render()`. It must not loop (guard with a flag) and must not PUT.
     - `flushSaveOnce()` and `flushSaveNow()`: handle `403` with body `finalized:true` -> add id to `lockedIds`, call `reloadLockedTournament()`; never leave "Saved" showing. `flushSaveNow()` must skip entirely for locked ids.
     - UI: after `area.innerHTML = html` in `render()` (and in `renderPopoutManage()`), when `isLocked(state)`: add a banner card at the top of the stage area ("Results finalized on <date>. Only an Admin can change or reopen this event."), add class `finalized` to `document.body` (remove it otherwise), disable every `input, select, textarea, button` inside the stage area except elements whose `onclick` attribute calls only functions in an explicit allow-list (`goStage`, the print/export functions, `copyPublicLink`, `doFinalPrint`, `duplicate...`, opening popout windows is view-only — verify by reading the handlers; keep the allow-list in one named constant `FINALIZED_ALLOWED_ACTIONS`), and mark any other element with an `onclick` attribute `class fin-locked` (CSS: `pointer-events:none;opacity:.55`). Print/export buttons and plain `<a href>` links stay usable. Read how Stage 5 score entry, draw buttons and settings are wired to be sure none can be used.
     - `openTournament`: after loading, `if(isLocked(state)) lockedIds.add(id); else lockedIds.delete(id);`. Do the same where the saved list populates `tournamentsCache`.
  3. `deleteTournament(id)`: if the cached tournament is finalized (`lockedIds.has(id)` or `isLocked(tournamentsCache[id])`) open an info modal "Finalized events can only be deleted by an Admin." (no delete call); also await the DELETE response and, on 403, restore the item locally and show the same modal instead of the current fire-and-forget removal for that case. `renameTournament`: same block for finalized. `duplicateTournament`: `delete copy.finalized;` next to the existing `copy.listed = false` (and the copy is unpublished already).
  4. A short note on the saved-list row for finalized events is optional; do it only if the row builder makes it a one-liner (a small "Finalized" tag).
- [ ] **Step 4: Run** the new tests and the full suite — expect all pass. Verify in a browser pane is NOT required for you; the controller will do it.

---

### Task 3: Viewer and public data

**Files:**
- Modify: `viewer/api/_lib/publicView.js`, `viewer/api/_lib/listView.js`, `viewer/index.html`, `viewer/theme.css` (only if needed), `README.md`
- Modify tests: `tests/viewer-status.test.js`, `tests/public-view.test.js` (and `tests/list-view.test.js` where behaviour changes)
- Test: extend the files above (and add `tests/finalized-public.test.js` if cleaner)

**Interfaces:**
- Consumes: `data.finalized.at` (ISO string) on stored tournaments.
- Produces:
  - `toPublicView(data)` output gains `finalizedAt` (a string, exactly `data.finalized.at`) ONLY when it is a string that parses to a valid date and is at most 40 chars; otherwise the key is absent. Nothing else from `finalized`.
  - `listView.describe(row, now)`: a tournament with a valid `finalized.at` (same validity rule) is status `results` when `now - finalizedAt <= RESULTS_DAYS` (7 days) and not listed (`null`) after that, regardless of `updated_at`; `item.winner` as today. A tournament WITHOUT a valid `finalized.at` is never `results`: if it has started and `updated_at` is within `LIVE_STALE_HOURS` it is `live` (even when every match is played), else not listed (an unstarted one stays `upcoming` as today). `progress` for a complete-but-unfinalized event keeps its last-round numbers.
  - Event page (`viewer/index.html`): the pill shows green "Final results" iff `state.finalizedAt` is present (replace the earlier stage-derived `eventFinished(evStages)` with `!!(state && state.finalizedAt)`; remove `eventFinished` and its test; keep `statusPillHTML(started, stale, lastOkAt, finished)` and `.live-pill.done`). A complete but unfinalized event keeps showing the red Live pill. Stale/Offline still wins.
  - `README.md`: a short section "Reopening a finalized event (until the Admin panel exists)" with the SQL `UPDATE tournaments SET data = data - 'finalized', updated_at = now() WHERE id = '<tournament id>';` and the note that this is the only way until the Admin panel is built.

- [ ] **Step 1: Write failing tests**: `toPublicView` with valid / missing / junk (`true`, `{}`, `{at: 5}`, `{at: 'nope'}`, very long string) `finalized` -> `finalizedAt` present only for valid; `describe` cases: finalized recent -> results with winner; finalized 8 days ago -> null; complete but not finalized and fresh -> live; complete not finalized stale (>48h) -> null; junk `finalized` -> not results; `statusPillHTML` with `finalized` true -> "Final results", viewer `state.finalizedAt` drives it (test through the viewer loader like `tests/viewer-status.test.js` does, including an update to the old `eventFinished` test which is replaced).
- [ ] **Step 2: Run** them — expect FAIL.
- [ ] **Step 3: Implement** the changes described in Interfaces. In `listView.js` add `finalizedAt(d)` (returns epoch ms or null with the same validity rule) next to `analyse`; keep the exported names that existing tests import and add it to the exports.
- [ ] **Step 4: Run** the full suite and `npm run check-viewer` — expect all pass.

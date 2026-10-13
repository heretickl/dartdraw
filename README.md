# DartDraw

Web app for creating, managing, and printing darts tournament charts — built for the Kuala Lumpur Darts Association (KLDA). Tournaments are stored centrally (Neon Postgres), so a tournament is accessible from any device.

## Usage

Open the deployed URL and use the app as normal — the print-ready chart still updates as you work, exactly as before. By default no login is required (see below).

## Deployment

Hosted on Vercel with a Neon Postgres database.

1. **Neon**: create a project, open the SQL Editor and run `schema.sql` once to
   create the `organizers` and `tournaments` tables. Copy the **pooled**
   connection string.
2. **Vercel**: import this repo as a new project (Framework Preset "Other" —
   zero config, no build step). Add two Environment Variables:
   - `DATABASE_URL` — the Neon pooled connection string from step 1.
   - `SESSION_SECRET` — a long random string (see `.env.example` for how to
     generate one).
3. Deploy.

Local development: copy `.env.example` to `.env` (or `.env.local`), fill in
the values, and run `vercel dev`.

### Requiring organizer login

By default the app is open to anyone with the URL — every visitor shares one
implicit "Public" account. To require sign-in instead (each organizer then
only sees their own tournaments), set two more Environment Variables and
redeploy:

- `REQUIRE_LOGIN` = `true`
- `SIGNUP_CODE` — a code of your choosing; anyone signing up at
  `/register.html` must enter it, so only share it with people who should
  get an account.

Set `REQUIRE_LOGIN` back to `false` (or remove it) and redeploy to re-open
the app to the public; existing accounts and their tournaments are
unaffected either way.

## Public results site (separate Vercel project)

Turn on **Public results** in Manage Tournament to get a read-only link
(`<viewer site>/live/<code>`) that shows live group standings, results and the
bracket. It's meant for players and spectators: no editing, saving or login, and
it refreshes itself every 20 seconds.

The public site lives in the `viewer/` folder and is deployed as its **own
Vercel project** — separate URL, separate deployment, separate environment
variables, and its own **read-only** database login. The organiser app never
serves it, and the viewer has no way to reach organiser accounts or unpublished
tournaments. The two only meet through the database: the organiser app sets
`published` and a random `publicSlug` on a tournament; the viewer reads
published ones.

### Setting it up (once)

1. **Neon** — open the SQL Editor and run `viewer/sql/readonly.sql` (change the
   password first). This creates a `public_tournaments` view (published
   tournaments only) and a `viewer_ro` login that can read nothing but that view.
2. **Vercel** — *Add New → Project*, import this same repo again, and set
   **Root Directory** to `viewer`. Framework Preset "Other", no build step.
   Add one Environment Variable: `DATABASE_URL` = the Neon pooled connection
   string with the `viewer_ro` user and password (see `viewer/.env.example`).
   Give it its own name/domain, e.g. `dartdraw-results`.
3. **Organiser project** — add `VIEWER_URL` = the viewer's address (e.g.
   `https://dartdraw-results.vercel.app`, no trailing slash) and redeploy. The
   Public results card uses it to show the shareable link.

### Keeping the shared display code in step

The standings and bracket drawing (`render.js`, `render.css`) are used by both
sites. The copies in the repo root are the source of truth. After changing
them, run `npm run sync-viewer` to copy them into `viewer/`, and commit both.
`npm run check-viewer` fails if the copies differ. Keep that code display-only.

### What the public site can see

`viewer/api/public/[slug].js` answers GET only, for published tournaments only,
with an allow-listed copy of the data — entry names, scores, standings and
brackets. Notes, the incident log, rosters, check-in details, logos and
sponsors are never included. To share more, add the field in
`viewer/api/_lib/publicView.js`. An unpublished or unknown code returns 404.

### Public home page

The viewer's bare address (for example `https://dartdraw-viewer.vercel.app/`) is a branded home page with a list of events, in three tabs: **Live**, **Upcoming** and **Results**, with a search box that also takes an event code or link.

- **Opt-in.** An event appears only when its organiser ticks **List on the public page** on the Public results card (it is off by default, and turning Public results off turns it off too). Events that are only published keep working through their private link and are never listed. A duplicated tournament starts unlisted, and turning Public results on never brings back an old listed flag.
- **What it shows.** Event and tournament name, date, start time, format, number of entries, a progress ring while live, and the winner once finished. Scores, other players, clubs and notes are never part of the list (`viewer/api/_lib/listView.js` is the allow-list).
- **Rules.** Live means play has started, the organiser has not finalized the event, and it was saved within 48 hours (an event with every match played stays Live until it is finalized). Upcoming means not started and dated yesterday or later. Results are events the organiser has finalized with **Accept results & finalize**, and stay for 7 days after finalizing. The event page shows **Final results** only for a finalized event. An unstarted event with no date is upcoming while it was saved within 8 days. A round robin shows no winner line.
- **Where the limits live.** `viewer/api/_lib/listConfig.js`. They are plain constants for now; an admin setting could replace them later.
- **How it is served.** `GET /api/events` reads the existing `public_tournaments` view through the existing read-only role (no migration, no new grant) and is cached for 30 seconds, so an unlisted or unpublished event disappears within about half a minute. The page itself is `viewer/home.js` and `viewer/home.css`, in the viewer project.

### Reopening a finalized event (until the Admin panel exists)

Once an organiser accepts the results, the event is closed: the organiser app refuses every save and delete for it, and the public pages show **Final results**. There is no Reopen button. Until the Admin panel is built, an Admin can reopen an event by removing the `finalized` marker in the Neon SQL Editor:

```sql
UPDATE tournaments SET data = data - 'finalized', updated_at = now() WHERE id = '<tournament id>';
```

This is the only way to reopen a finalized event for now. The organiser needs to reload the event afterwards.

## Group Boards format

For big fields, choose **Group Boards** at Format & branding. Players are dealt into a chosen number of
**groups** (for example 64 groups for 540 players). Each group is a small knockout on its own board, and every
group winner goes through to a **Finals** bracket whose chart exists, with "Winner of Group N" slots, before any
group finishes. Seeds are spread one per group, club-mates are kept apart where possible, and players can be
moved between groups by hand until the groups are confirmed. The public results page gets a group picker (Finals,
all groups, or one group).

The logic is in `pods.js` (internally "pods", so it never clashes with the round-robin `state.groups`) and the
screens in `pods-ui.js`. Spec: `docs/superpowers/specs/2026-10-06-group-boards-design.md`.

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
  While **Public results** is on (and the viewer address is set), both sheets carry a QR code and the
  link to the live results page in their header, so players can scan it and follow their own board.
  Every sheet in the pack and every group and knockout chart sheet carries one, and each code opens that sheet's own
  screen: a round-robin group sheet opens that group, a Group Boards group sheet opens that group's bracket, the Finals
  sheet opens the Finals, the Boards sheet opens the Boards tab, and the Players sheet opens the event. The address
  printed beside the code is always the short event link.
  The code is made by `qr.js`, a small built-in generator, so printing needs no internet connection.

The plan is rebuilt on every save and stored with the tournament; the viewer only displays it.
Deploy the organiser first, then the viewer (each deploys from `main`). An older tournament
gets its plan on its next save, and the viewer hides the Boards tab until then.

### Neither showed

If both players in a match fail to turn up, open the no-show picker on that match (or its
score dialog) and choose **Neither showed**. Nobody advances; the next opponent gets a bye. A
group whose final is void finishes with no winner, and its Finals slot reads "Group N: no
winner" and becomes a bye for the opponent. It works in every bracket (plain knockout, the
Plate, group brackets and the Finals) and can be reversed from the match's score dialog. Both
players are flagged as no-shows; reversing leaves those flags, as a corrected single no-show
does. The public results page shows "Neither attended" for such a match.

### Tests and local servers

- `npm test` runs every test (Node's built-in runner, no dependencies). `tests/golden/existing-formats.json`
  snapshots how the three older formats render; if you change them on purpose, regenerate it with
  `UPDATE_GOLDEN=1 npm test`.
- `node tests/dev/mock-organiser.js` serves the organiser at http://localhost:5393 with in-memory storage and no
  login, for trying the screens in a browser.
- `node tests/dev/make-sample-view.js 40 8 3` then `node tests/dev/mock-viewer.js` serves the public page for a
  sample Group Boards event at http://localhost:5392/live/testslug12.

## Features

- Round robin, knockout, and round robin → knockout tournament formats
- Winner pool / plate pool with configurable qualifier and plate cutoffs
- Team events with configurable rubber lineups (singles, doubles, triples, custom)
- Check-in tracking and no-show / walkover handling
- Disciplinary / incident log
- Printable draw sheets, chart sheets, team handouts, rules sheets, and lineup/scorecard sheets

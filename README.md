# DartDraw

Web app for creating, managing, and printing darts tournament charts — built for the Kuala Lumpur Darts Association (KLDA). Tournaments are stored centrally (Neon Postgres), so a tournament is accessible from any device.

## Usage

Open the deployed URL and use the app as normal — the print-ready chart still updates as you work, exactly as before. Login is off until you switch it on (see "Organiser accounts and login" below).

## Deployment

Hosted on Vercel with a Neon Postgres database.

1. **Neon**: create a project, open the SQL Editor and run `schema.sql` once to
   create the `organizers`, `tournaments` and sign-in tables (a database that already exists is upgraded with `migrations/2026-10-13-accounts.sql`, see below). Copy the **pooled**
   connection string.
2. **Vercel**: import this repo as a new project (Framework Preset "Other" —
   zero config, no build step). Add two Environment Variables:
   - `DATABASE_URL` — the Neon pooled connection string from step 1.
   - `SESSION_SECRET` — a long random string (see `.env.example` for how to
     generate one).
3. Deploy.

Local development: copy `.env.example` to `.env` (or `.env.local`), fill in
the values, and run `vercel dev`.

### Organiser accounts and login

Each organiser has their own account and sees only their own tournaments. Two
access levels exist, and they differ in one thing only:

| Level | Entries per event |
|-------|-------------------|
| **Basic** (the default for new sign-ups) | up to 64 |
| **Pro** | unlimited |

Entries are counted without withdrawn ones, and a doubles pair counts as one.
The server enforces the limit, so it cannot be bypassed from the browser. A
Basic organiser whose event is already larger than 64 (for example after being
moved down from Pro) can keep editing it but cannot add entries. One account is
the **Admin** (the project owner). Only `scripts/create-admin.js` can create an
admin; sign-up never can. The Admin tab itself is a later project.

Login stays **off** until you switch it on, so nothing changes for a running
site until step 3 below. Use these steps in this order:

1. **Run the migration (once).** Open the Neon SQL Editor and run
   `migrations/2026-10-13-accounts.sql`. It adds the account columns and the
   `auth_tokens` and `auth_throttle` tables, marks every existing real account as
   verified and Pro, and is safe to run again. (A fresh install already gets all
   of this from `schema.sql`.)
2. **Create the Admin and adopt the existing tournaments.** On your own computer,
   with the Neon **pooled** connection string:

   ```
   DATABASE_URL="postgresql://..." node scripts/create-admin.js --email you@example.com --name "Your Name" --adopt-public
   ```

   It asks for a password (at least 8 characters, not shown as you type). To avoid
   the prompt you can set `ADMIN_PASSWORD` in the environment instead; the password
   is never accepted as a command-line argument and never printed. The script
   creates the account, or if that email already exists, promotes it to Admin /
   Pro / verified, sets the new password and signs out its old sessions.
   `--adopt-public` moves every tournament of the old shared "Public" account
   (finalized ones included) to your account in a single database statement, so it
   either all happens or none of it does, and prints how many were moved. Running
   it again moves nothing. Tournaments owned by other accounts are never touched,
   and the Public account itself can never sign in.
3. **Switch login on.** In Vercel set `REQUIRE_LOGIN` = `true` and `APP_URL` = the
   app's public address (no trailing slash), then redeploy. Sign in as the Admin;
   your existing tournaments are there. Setting `REQUIRE_LOGIN` back to `false`
   (or removing it) is an emergency fallback that re-opens the shared Public
   account, which after the move shows an empty list.
4. **Later, when you have a domain: open sign-up.** Verify the domain with
   [Resend](https://resend.com), then set `RESEND_API_KEY`, `MAIL_FROM` (for
   example `DartDraw <noreply@your-domain>`), keep `APP_URL`, set
   `SIGNUP_OPEN` = `true`, and redeploy. Sign-up opens, and the login page shows
   the Sign up link. People verify their email by opening a link and entering the password they chose at sign-up, and Forgot password
   works. Until then sign-up stays closed (the endpoint answers 403 and the link
   is hidden) and no email is sent.
5. **The old `SIGNUP_CODE` setting is retired.** Sign-up no longer reads it; you
   can delete it from Vercel.

Environment variables (see `.env.example`):

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Neon pooled connection string. |
| `SESSION_SECRET` | Long random string that signs session cookies. |
| `REQUIRE_LOGIN` | `true` to require sign-in. Anything else keeps the shared Public account. |
| `APP_URL` | Public address of the app, no trailing slash. Used for the links in emails. Required in production. |
| `SIGNUP_OPEN` | `true` to allow open sign-up. It only opens if email is also configured. |
| `MAIL_PROVIDER` | `resend` (default) or `console`. `console` writes each message and its link to the server log, for development only. |
| `RESEND_API_KEY` | Resend API key (needed for `resend`). |
| `MAIL_FROM` | Sender address on a domain verified in Resend (needed for `resend`). |
| `VIEWER_URL` | Address of the public results site. |

Without a domain the Admin can still sign in (step 2 needs no email), but
sign-up, email verification and Forgot password are unavailable. When the Admin
tab arrives, accounts the Admin creates before email exists will be handed over
as a one-time link to share by hand.
Sign-up and password reset links are single use and expire (verify 24 hours,
reset 1 hour, invite 7 days). A password reset, or suspending an account, signs
that account out everywhere immediately. Sign-in, sign-up, forgot and resend are
rate limited.

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

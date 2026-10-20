# DartDraw

Web app for creating, managing, and printing darts tournament charts — built for the Kuala Lumpur Darts Association (KLDA). Tournaments are stored centrally (Neon Postgres), so a tournament is accessible from any device.

## Usage

Open the deployed URL for the public site, then log in (or go straight to `/app`) and use the app as normal — the print-ready chart still updates as you work, exactly as before. Login is off until you switch it on (see "Organiser accounts and login" below).

### Site structure

| Address | File | What it is |
| --- | --- | --- |
| `/` | `index.html` | Public landing page. A visitor who is already signed in is sent on to `/app`. |
| `/features` | `features.html` | Public features page. |
| `/how-it-works` | `how-it-works.html` | Public how-it-works page. |
| `/help` | `help.html` | Public Help page for organisers: a step-by-step guide and an FAQ, with search. The public results site has its own, separate help for spectators at its `/help`. |
| `/app` | `app.html` | The organiser app (the tournament editor). Signed-out visitors are sent to `/?login=1`. |
| (pop-up) | `login.html` | The sign-in form. The public pages show it in a pop-up (`login.html?embed=1` in an iframe); `/?login=1` or `/#login` opens that pop-up. `login.html` may only be framed by this site. |

The clean URLs are rewrites in `vercel.json`. The four public pages are **generated** by `scripts/build-landing.js`
(shared styles, header, footer links, closing band and login pop-up live there). Do not edit `index.html`, `features.html`,
`how-it-works.html` or `help.html` by hand: change the script (or, for Help, the content file below) and regenerate with
`npm run build-landing`. The pages are committed, so Vercel still has no build step, and `npm test` fails if they are out of
step with their sources. The register, verify, forgot and reset pages link back to the pop-up with `/?login=1`.

The header and footer of every public page link to `/help`, and the organiser app has a **Help** link in its top bar that opens
`/help` in a new tab.

#### Editing the Help page

The words of the Help page are **data** in `scripts/help-content.js`: sections (`guide` and `faq`), each with items that have an
`id` (the `#anchor`; do not change one that is already linked), a `title` (the heading or the question), a `body` (HTML) and, for
guide items, a `summary`. `scripts/build-landing.js` lays them out (search box, contents list, accordions) and writes
`help.html`. To change the Help page: edit `scripts/help-content.js`, run `npm run build-landing`, then `npm test`.
`tests/help-site.test.js` checks, among other things, that every anchor resolves, that there are at least 15 questions, that the
guide quotes the app's real button and message names (a quoted name that no longer exists in `app.html` fails the test, so update
the guide when you rename a button), and that the page says nothing about plans or tiers, other competition types or contact
emails. The link to the spectators' help is built from `VIEWER_URL` at the top of `scripts/help-content.js`.

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
admin; sign-up never can. The Admin runs the service from the Admin tab (see "Admin tab" below).

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
sign-up, email verification and Forgot password are unavailable. The Admin tab
covers that gap: accounts the Admin creates, and password resets, are handed over
as a one-time link to share by hand (see "Admin tab" below).
Sign-up and password reset links are single use and expire (verify 24 hours,
reset 1 hour, invite 7 days). A password reset, or suspending an account, signs
that account out everywhere immediately. Sign-in, sign-up, forgot and resend are
rate limited.

**Change password.** Anyone signed in (organisers and the Admin) can change their own
password with the **Change password** button next to **Log out** in the account bar. It asks for
the current password, the new one (8 to 200 characters, different from the current one) and the
new one again. A change signs out every other device and browser on that account; the one you
changed it in stays signed in. It does not need email, so it works without a domain. The server
limits it to 5 attempts per account and 20 per address every 15 minutes (a wrong current
password counts), and it is not offered in public mode (`REQUIRE_LOGIN` not `true`). The button stays usable on a finalized event.

### Admin tab

The Admin account sees an **Admin** entry (gold) in the organiser sidebar, below the account bar; **Back to my events** returns to the normal screens. The server checks the Admin role on every Admin call, so the entry being hidden for other people is a convenience, not the protection. An Admin has **Pro access** whatever tier is stored on the account (no entry limit), plus the Admin tab. It has three views:

- **Organisers.** List everyone with tier, role, status (Active, Suspended, Unverified) and event count. Add an organiser (name, email, tier), change a tier, suspend or reactivate, make or remove an Admin, copy a password reset link, transfer all of someone's events to another organiser, and delete an organiser. Guards: you cannot change your own role, suspend yourself or delete yourself; the last active Admin cannot be demoted, suspended or deleted; an organiser who still owns events cannot be deleted (transfer the events first); suspending or demoting someone signs them out everywhere.
- **Events.** Search every organiser's events and filter by owner. **Open** loads an event in the normal editor with an "Editing ...'s event as Admin" banner, and saving keeps the original owner. Per event: **Reopen** (finalized events only), **Unpublish** (turns off Public results and the public listing), **Unlist** (removes it from the public home page but keeps its private link), **Transfer** to another organiser, and **Delete**. A finalized event stays locked, even for the Admin, until it is reopened; an Admin who opens one gets a **Reopen to edit** button.
- **Settings.** How long events stay on the public home page: Results days (1 to 90, default 14) and Live hours (1 to 168, default 48). See "Retention" under "Public home page".

An Admin changes their own password like anyone else, with **Change password** in the account bar; there is no Admin-tab action for your own account.

**Rolling it out.** Do these in order:

1. In the Neon SQL Editor run `migrations/2026-10-14-admin.sql` (creates the `site_settings` table; safe to run again).
2. In the Neon SQL Editor run `viewer/sql/settings.sql` (creates the `public_settings` view the public site reads, and grants it to `viewer_ro`).
3. Deploy the organiser project and the viewer project (each deploys from `main`).

Until step 2 is done the public site simply uses 14 days and 48 hours, so deploying first does not break anything; the Settings numbers just have no effect on the public site until the view exists.

**Reopening a finalized event.** Once an organiser accepts the results the event is closed: the organiser app refuses every save and delete for it, and the public pages show **Final results**. The Admin reopens it with the **Reopen** button on the Events view (or **Reopen to edit** on the event itself). That removes the finalized marker, so the event goes back to Live (or wherever its progress puts it) and the organiser can edit again; an organiser who still has the event open gets the normal "changed elsewhere" message and needs to reload it. This replaces the old manual step. If the Admin tab is ever unavailable, the same thing can be done in the Neon SQL Editor:

```sql
UPDATE tournaments SET data = data - 'finalized', updated_at = now() WHERE id = '<tournament id>';
```

**Handing over links without an email domain.** Until Resend is set up (step 4 above) no email is sent, so the Admin passes links on by hand:

- **New organiser.** Add organiser shows an invite link with a Copy button. Send it to them yourself (WhatsApp, text, anything). The link works once and for 7 days, and opens the page where they choose their password. The account is already verified.
- **Forgotten password.** Open the organiser's row and use the reset link action, copy the link and send it to them. It works once and for 1 hour. Using it signs them out everywhere. Never ask an organiser to tell you their password.
- Treat these links like passwords: anyone holding an unused link can set the password for that account. Issuing a new reset link cancels the previous unused reset link, so if one went to the wrong place, make a new one. An unused invite link is a separate kind and is not cancelled by a reset link; if an invite went astray, delete the new account (allowed while it owns no events) and add the organiser again.

Once email is configured, the same actions also email the link, and the link is still shown to the Admin.

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
- **Rules.** Live means play has started, the organiser has not finalized the event, and it was saved within 48 hours (the default; see "Retention" below; an event with every match played stays Live until it is finalized). Upcoming means not started and dated yesterday or later. Results are events the organiser has finalized with **Accept results & finalize**, and stay for 14 days after finalizing (the default; see "Retention" below). The event page shows **Final results** only for a finalized event. An unstarted event with no date is upcoming while it was saved within 8 days. A round robin shows no winner line.
- **Retention.** How long a finalized event stays under Results (1 to 90 days, default 14) and how long an unfinished event stays under Live now (1 to 168 hours, default 48) are set by the Admin in the Admin tab, Settings. To let the public site read them, run `viewer/sql/settings.sql` once in the Neon SQL Editor (after `migrations/2026-10-14-admin.sql`, which creates the `site_settings` table). It creates the `public_settings` view, which exposes only those two values, and grants it to `viewer_ro`. Until that is run, or if the view is missing or holds a bad value, the public site uses the defaults (14 days, 48 hours); out-of-range numbers are clamped. The built-in defaults and ranges live in `viewer/api/_lib/listConfig.js`.
- **How it is served.** `GET /api/events` reads the `public_tournaments` view and the `public_settings` view through the read-only role and is cached for 30 seconds, so an unlisted or unpublished event disappears within about half a minute. The page itself is `viewer/home.js` and `viewer/home.css`, in the viewer project.

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
- `node tests/dev/mock-organiser.js` serves the organiser app (`app.html`) at http://localhost:5393 (or `/app`) with
  in-memory storage and no login, for trying the screens in a browser.
- `npm run build-landing` regenerates the public pages (`index.html`, `features.html`, `how-it-works.html`, `help.html`).
- `node tests/dev/make-sample-view.js 40 8 3` then `node tests/dev/mock-viewer.js` serves the public page for a
  sample Group Boards event at http://localhost:5392/live/testslug12.

## Features

- Round robin, knockout, and round robin → knockout tournament formats
- Winner pool / plate pool with configurable qualifier and plate cutoffs
- Team events with configurable rubber lineups (singles, doubles, triples, custom)
- Check-in tracking and no-show / walkover handling
- Disciplinary / incident log
- Printable draw sheets, chart sheets, team handouts, rules sheets, and lineup/scorecard sheets

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

## Features

- Round robin, knockout, and round robin → knockout tournament formats
- Winner pool / plate pool with configurable qualifier and plate cutoffs
- Team events with configurable rubber lineups (singles, doubles, triples, custom)
- Check-in tracking and no-show / walkover handling
- Disciplinary / incident log
- Printable draw sheets, chart sheets, team handouts, rules sheets, and lineup/scorecard sheets

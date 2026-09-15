# DartDraw

Web app for creating, managing, and printing darts tournament charts — built for the Kuala Lumpur Darts Association (KLDA). Organizers sign in and their tournaments are stored centrally (Neon Postgres), so a tournament is accessible from any device.

## Usage

Sign in (or create an account) at the deployed URL, then use the app as normal — the print-ready chart still updates as you work, exactly as before.

## Deployment

Hosted on Vercel with a Neon Postgres database.

1. **Neon**: create a project, open the SQL Editor and run `schema.sql` once to
   create the `organizers` and `tournaments` tables. Copy the **pooled**
   connection string.
2. **Vercel**: import this repo as a new project (Framework Preset "Other" —
   zero config, no build step). Add three Environment Variables:
   - `DATABASE_URL` — the Neon pooled connection string from step 1.
   - `SESSION_SECRET` — a long random string (see `.env.example` for how to
     generate one).
   - `SIGNUP_CODE` — a code of your choosing; anyone signing up at
     `/register.html` must enter it, so only share it with people who should
     get an account.
3. Deploy, then visit `/register.html` to create the first organizer account.

Each organizer only sees their own tournaments. Local development: copy
`.env.example` to `.env` (or `.env.local`), fill in the values, and run
`vercel dev`.

## Features

- Round robin, knockout, and round robin → knockout tournament formats
- Winner pool / plate pool with configurable qualifier and plate cutoffs
- Team events with configurable rubber lineups (singles, doubles, triples, custom)
- Check-in tracking and no-show / walkover handling
- Disciplinary / incident log
- Printable draw sheets, chart sheets, team handouts, rules sheets, and lineup/scorecard sheets

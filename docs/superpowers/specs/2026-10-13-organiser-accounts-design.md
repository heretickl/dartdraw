# Organiser accounts and login (sub-project 1 of 2) - design

Status: draft for review, 2026-10-13. Sub-project 2 (the Admin tab) is a separate spec built after this one.

## Purpose

Today the login system in the organiser app exists but is switched off (`REQUIRE_LOGIN` is not `true`): every visitor shares one auto-created "Public" organiser, so every tournament is visible and editable by anyone with the site address. This project switches on real per-organiser accounts:

- Anyone can sign up (open sign-up) and must verify their email by a link before using the app.
- An Admin can also create accounts (the Admin tab itself is sub-project 2).
- Every account has an access level: **Organizer - Basic** (at most 64 entries per event) or **Organizer - Pro** (unlimited). Everything else is identical.
- One account is the **Admin** (the project owner); the Admin role is only used by sub-project 2 and is checked by the server.

Success: each organiser sees only their own tournaments; a Basic organiser cannot exceed 64 entries; the owner's existing tournaments are intact under their own admin account; nothing in the public viewer changes.

## Decisions already made with the user

- Sign-up: open to anyone, verified by an emailed link. Admin can also create accounts.
- Two levels, Basic (64 entries per event) and Pro (unlimited). Nothing else differs.
- Extend the existing email + password system (no hosted login vendor). Email via Resend by default.
- **There is no domain yet**, and Resend only sends to arbitrary people from a verified domain. So: build now, launch when a domain exists. Until the mail service is configured, **open sign-up is switched off** (the Sign up link and endpoint are closed) and Admin-created accounts work by handing the Admin a one-time link to share by hand.

## Data model (one SQL migration, run once in the Neon SQL editor, like `schema.sql`)

File: `migrations/2026-10-13-accounts.sql` (also reflected in `schema.sql` for fresh installs).

`organizers` gains:
- `role text NOT NULL DEFAULT 'organizer' CHECK (role IN ('organizer','admin'))`
- `tier text NOT NULL DEFAULT 'basic' CHECK (tier IN ('basic','pro'))`
- `suspended boolean NOT NULL DEFAULT false`
- `email_verified_at timestamptz` (NULL = not verified)
- `token_version integer NOT NULL DEFAULT 0` (bumped on password reset and suspension; invalidates old sessions)

Existing real accounts (every row except `public@dartdraw.local`) are grandfathered: `email_verified_at = now()`, `tier = 'pro'`. The "Public" row keeps `password_hash = 'disabled'` and can never sign in.

New table `auth_tokens`: `id uuid PK default gen_random_uuid()`, `organizer_id uuid NOT NULL REFERENCES organizers(id) ON DELETE CASCADE`, `kind text NOT NULL CHECK (kind IN ('verify','reset','invite'))`, `token_hash text NOT NULL UNIQUE`, `expires_at timestamptz NOT NULL`, `used_at timestamptz`, `created_at timestamptz NOT NULL DEFAULT now()`.

New table `auth_throttle`: `key text PRIMARY KEY`, `window_start timestamptz NOT NULL`, `count integer NOT NULL`. Used for rate limiting (serverless memory cannot).

## Tokens

32 random bytes, hex encoded, in the emailed link. Only the SHA-256 hash is stored. Single use (`used_at`). Lifetimes: verify 24 h, reset 1 h, invite 7 d. Issuing a new token of a kind invalidates earlier unused ones of that kind for that organiser.

## Server (api/)

New helper modules in `api/_lib/`: `mail.js` (sendMail, isMailConfigured), `tokens.js` (issue/consume), `throttle.js`, `tiers.js` (`ENTRY_LIMITS = { basic: 64, pro: null }`, `entryLimitFor(tier)`, `countActiveEntries(data)`), `accounts.js` (create/find helpers shared with sub-project 2).

`requireAuth` (api/_lib/auth.js), when `REQUIRE_LOGIN === 'true'`: verify the cookie JWT (payload now includes `tv` = token_version), then load the organizer row; reject (401) if the row is missing, `suspended`, `email_verified_at` is NULL, or `tv` does not match `token_version`. Returns `{ id, email, name, role, tier }`. When `REQUIRE_LOGIN` is not `true` the shared Public organiser behaviour stays as an emergency fallback (documented; it shows an empty list after migration).

Endpoints under `api/auth/`:
- `POST register` `{ name, email, password }`: closed (403 `{error:'Sign-up is not open yet.'}`) unless `SIGNUP_OPEN === 'true'` AND mail is configured. Password >= 8 chars. Always answers the same success message whether or not the email exists (no account enumeration); a new row is created unverified and a verify email sent; an existing unverified account gets a fresh verify email; an existing verified account gets a short "you already have an account, use Forgot password" email. Throttled.
- `POST verify` `{ token }`: marks verified, consumes the token. No automatic sign-in; the page links to Sign in.
- `POST resend-verification` `{ email }`: generic answer; throttled.
- `POST login` `{ email, password }`: throttled per email and per address; checks password; then, with the correct password only, answers 403 `{ code:'unverified' }` or 403 `{ code:'suspended' }`; otherwise sets the session cookie. Wrong password or unknown email: the same 401 message.
- `POST forgot` `{ email }`: generic answer, sends a reset link if the account exists and is not suspended; throttled.
- `POST reset` `{ token, password }`: used for both reset and invite tokens; sets the password, marks the email verified, bumps `token_version`, consumes the token.
- `GET config` (public): `{ signupOpen }` so the login page can show or hide the Sign up link.
- `GET me`: adds `role`, `tier`, `entryLimit` (number or null) next to today's fields.
- `logout` unchanged.

Throttles (via `auth_throttle`): login 10 failed attempts per 15 minutes per email and 40 per 15 minutes per client address; register / forgot / resend 5 per hour per client address and per email. Over the limit answers 429.

Mail (`api/_lib/mail.js`): `sendMail({ to, subject, text, html })`. Providers by `MAIL_PROVIDER`: `resend` (default, uses `fetch` to the Resend HTTP API with `RESEND_API_KEY` and `MAIL_FROM`; no new npm dependency) and `console` (writes the message, including the link, to the server log, for development and tests). `isMailConfigured()` is true only for a complete Resend config (or `console`). Links use `APP_URL` (required in production). Email text is plain and short; subjects: "Verify your DartDraw email", "Reset your DartDraw password", "Your DartDraw account".

Basic entry limit: `api/tournaments/[id].js` PUT (and the insert) counts active (non-withdrawn) entries in the incoming `data.entriesList`. For an organiser whose tier has a limit: reject with 403 `{ code:'entry_limit', limit, error:'Basic accounts allow up to 64 entries per event.' }` when the new count exceeds the limit AND exceeds the count already stored. So switching someone to Basic never locks them out of an existing larger event; it just cannot grow. Counting is by entries (a doubles pair is one). The finalized lock check still comes first.

## Bootstrapping the Admin and moving existing data

`scripts/create-admin.js` (run locally with `DATABASE_URL`; prompts for the password): creates or updates the account for `--email` as `role='admin'`, `tier='pro'`, verified, with a bcrypt-hashed password; with `--adopt-public` it also moves every tournament owned by `public@dartdraw.local` to that account in one transaction and prints the count. Because it runs with direct database access, it works before any email service exists. `ADMIN_EMAIL` is not needed. Only accounts created by this script (or later by an existing admin in sub-project 2) have `role='admin'`; sign-up can never produce an admin.

## Screens

- `login.html`: adds "Forgot password?" and shows the "Sign up" link only when `signupOpen`. Shows clear messages for `unverified` (with "Resend verification email") and `suspended`.
- `register.html`: no access code; name, email, password; after submit shows "Check your email to verify your account." Shows "Sign-up is not open yet" when closed.
- New `verify.html` (reads `?token=`), `forgot.html`, `reset.html` (reads `?token=`). Same card styling as `login.html`. Pages that carry tokens send `Referrer-Policy: no-referrer` (via `vercel.json` headers).
- Organiser top bar: name, a small "Basic" / "Pro" badge, Log out. For Basic, a note near the entries step: "Basic: up to 64 entries per event."
- Entry limit in the organiser UI: the "number of entries" field in Event creation and every way of adding entries (add, paste, import) stop at the limit with "Basic accounts allow up to 64 entries per event." The server rule above is the real enforcement.

## Rollout

1. Run the migration in Neon.
2. Run `scripts/create-admin.js --email <you> --adopt-public` locally.
3. Set `REQUIRE_LOGIN=true` (and `APP_URL`) in Vercel and redeploy. Sign in as the Admin; the existing tournaments are there.
4. Later, when a domain exists: verify it with Resend, set `RESEND_API_KEY`, `MAIL_FROM`, `SIGNUP_OPEN=true`, redeploy. Sign-up opens.
5. The old `SIGNUP_CODE` setting is retired; `register` no longer reads it.

## Not in this sub-project

The Admin tab and its endpoints (manage organisers, see/open all events, reopen finalized events, unpublish/unlist, retention) - sub-project 2. Also out: payments for Pro, two-factor, social login, changing an email address, deleting your own account.

## Testing

Node tests with fake `sql` and `console` mail (patterns as in `tests/tournament-lock.test.js`): every endpoint above including each rejection path (closed sign-up, wrong password vs unverified vs suspended, expired / used / unknown tokens, throttle 429, same response for existing and unknown emails, reset bumps `token_version` and old sessions fail `requireAuth`, suspended account fails `requireAuth`); entry-limit rule including the downgrade case; tokens stored hashed; `create-admin` logic on a fake db. Pages are checked in the browser pane with a scratch server and the `console` mail provider.

## Review focus

- Enumeration: register, forgot and login must not reveal whether an email has an account (except unverified/suspended, only after a correct password).
- A suspended or password-reset account's old cookie must stop working immediately.
- The migration and `create-admin --adopt-public` must not lose or double-assign tournaments (including finalized ones) and must be safe to run twice.
- The finalized lock, the viewer's public data and the home list must be unaffected.

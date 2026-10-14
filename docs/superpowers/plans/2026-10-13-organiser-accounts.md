# Organiser accounts and login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Switch on real per-organiser accounts: open sign-up with emailed verification (closed until email is configured), password reset, Basic (64 entries per event) and Pro (unlimited) levels, an Admin role bootstrapped by a local script, and a safe migration of today's shared "Public" account data.

**Architecture:** Extend the existing email + password system (bcryptjs, JWT in the `__Host-session` cookie, Neon via `api/_lib/db.js`). New columns on `organizers`, two new tables (`auth_tokens`, `auth_throttle`), small helper modules in `api/_lib/`, new endpoints under `api/auth/`, new static pages, an entry limit enforced on the server (`api/tournaments/[id].js`) and in the organiser UI (`index.html`). The Admin tab is a separate later project; this plan only creates the Admin role and data it needs.

**Tech Stack:** Vercel serverless functions (CommonJS), Neon Postgres via tagged-template `sql`, bcryptjs, jsonwebtoken, cookie, Node `node --test`. No new npm dependencies (email goes through `fetch` to the Resend HTTP API).

**Spec:** `docs/superpowers/specs/2026-10-13-organiser-accounts-design.md` (read it first; it is the binding authority, this plan argues from it).

## Global Constraints

- Real DartConnect player names must never enter the repo.
- Do NOT run `git add`, `git commit`, `git push`, `git stash`, `git checkout` or any git write command. The controller reviews the working tree and commits. Leave `.claude/` and `docs/superpowers/specs/2026-10-13-csv-export-design.md` alone. Other uncommitted files may exist that are not yours: never revert them.
- Tests: `npm test` must keep passing (519 before this work); `npm run check-viewer` must stay ok (you should not need to touch `render.js`/`render.css`).
- No new npm dependencies. CommonJS in `api/`. Match the surrounding style (2-space indent, single quotes, `sql\`...\`` tagged templates, early `return` after `res.status(...).json(...)`).
- Files keep their existing line endings (CRLF warnings from git are normal); use the Edit tool for existing files.
- Error messages for auth must not reveal whether an email has an account, except `unverified` / `suspended` which are only revealed after a correct password.
- Tier names are exactly `'basic'` and `'pro'`; roles exactly `'organizer'` and `'admin'`; token kinds exactly `'verify'`, `'reset'`, `'invite'`.
- Lifetimes: verify 24 h, reset 1 h, invite 7 d. Password minimum 8 characters. Basic limit 64 (`ENTRY_LIMITS = { basic: 64, pro: null }`).
- The finalized-event lock in `api/tournaments/[id].js` (403 `{ finalized: true }`) stays first; the entry limit check comes after it.
- The public viewer (`viewer/`) is not touched by this plan.

## Review Focus

- Enumeration: register, forgot and resend answer identically for known and unknown emails; login answers the same 401 for unknown email and wrong password.
- A suspended account, an unverified account, or a session issued before a password reset must be rejected by `requireAuth` immediately (every protected endpoint goes through it).
- Token handling: only hashes stored; single use under concurrency (`UPDATE ... WHERE used_at IS NULL ... RETURNING`); expired / used / wrong-kind tokens are rejected; a newer token of the same kind invalidates older ones.
- Entry limit: Basic cannot grow an event past 64, but an existing event already over 64 stays editable without growing (downgrade case); withdrawn entries are not counted; Pro and unknown-tier handling.
- Migration and `create-admin --adopt-public`: safe to run twice, move every tournament (finalized ones included) exactly once, never touch tournaments owned by other organisers, never let the Public row sign in.
- Sign-up while mail is not configured is closed (403) and the login page hides the Sign up link.

---

### Task 1: Foundations (migration, helper modules, test harness)

**Files:**
- Create: `migrations/2026-10-13-accounts.sql`, `api/_lib/tiers.js`, `api/_lib/tokens.js`, `api/_lib/throttle.js`, `api/_lib/mail.js`, `api/_lib/accounts.js`, `tests/lib/fake-db.js`, `tests/lib/call-handler.js`
- Modify: `schema.sql` (fresh installs get the new columns and tables), `.env.example` (document `APP_URL`, `SIGNUP_OPEN`, `MAIL_PROVIDER`, `RESEND_API_KEY`, `MAIL_FROM`; remove `SIGNUP_CODE` if present)
- Test: `tests/accounts-lib.test.js` (new)

**Interfaces (produces; later tasks consume these exact names and signatures):**
- `api/_lib/tiers.js`: `ENTRY_LIMITS`; `entryLimitFor(tier)` -> number or `null` (unknown/missing tier is treated as `'basic'`); `countActiveEntries(data)` -> integer (items of `data.entriesList` that are objects and not `withdrawn`; tolerant of junk/missing); `checkEntryLimit(tier, newData, oldData)` -> `null` when allowed, else `{ limit, count }` when the tier has a limit AND `count(newData) > limit` AND `count(newData) > count(oldData)` (`oldData` may be undefined for a new tournament, counting as 0).
- `api/_lib/tokens.js`: `hashToken(raw)` (SHA-256 hex); `LIFETIMES_MS = { verify, reset, invite }`; `async issueToken(organizerId, kind)` -> raw token (32 random bytes, hex), stores only the hash, and first marks earlier unused tokens of that kind for that organiser as used; `async consumeToken(raw, kinds)` -> `{ organizerId, kind }` or `null`, valid only if the hash exists, kind is in `kinds`, `used_at IS NULL`, `expires_at > now()`, claimed atomically with one `UPDATE ... WHERE used_at IS NULL AND expires_at > now() ... RETURNING`.
- `api/_lib/throttle.js`: `clientIp(req)` (first entry of `x-forwarded-for`, else `req.socket.remoteAddress`, else `'unknown'`); `async isBlocked(key, limit, windowMs)` -> boolean; `async record(key, windowMs)` (count within the window, restarting the window when it has passed); `async clear(key)`.
- `api/_lib/mail.js`: `isMailConfigured()` (true when `MAIL_PROVIDER === 'console'`, or provider `resend` (the default) with both `RESEND_API_KEY` and `MAIL_FROM` set); `async sendMail({ to, subject, text })` -> `{ ok: boolean }` (Resend: `fetch('https://api.resend.com/emails', ...)` with a Bearer key, never throws, returns `{ ok:false }` on failure; console: logs the message including the link to `console.log` and records it in `sendMail.outbox` array for tests); `appUrl(req)` -> `APP_URL` (trailing slashes removed) or `https://<host header>`.
- `api/_lib/accounts.js`: `normalizeEmail(s)`; `async findByEmail(email)` -> full row or `undefined`; `async findById(id)`; `async createOrganizer({ email, name, passwordHash, role, tier, verified })` -> `{ id, email, name, role, tier }` (role default `'organizer'`, tier default `'basic'`, `verified` sets `email_verified_at = now()`); `toSessionUser(row)` -> `{ id, email, name, role, tier }`.
- `tests/lib/fake-db.js`: `createFakeDb(seed)` returning `{ sql, tables }` where `sql` is a tagged-template function interpreting the specific statements used by tasks 1-6 by matching distinctive fragments of the normalised SQL text (organizers, auth_tokens, auth_throttle, tournaments), with `tables.organizers`, `tables.auth_tokens`, `tables.auth_throttle`, `tables.tournaments` arrays that tests can seed and inspect; it throws a clear error for any statement it does not recognise so tests fail loudly. Extend it in later tasks as new statements are added.
- `tests/lib/call-handler.js`: `callHandler(handler, { method, body, query, headers, cookies })` -> `{ statusCode, body, headers }` building the `req`/`res` doubles used by the existing endpoint tests (`res.status().json()`, `setHeader`, `end`); `req.cookies` carries `cookies`.
- `migrations/2026-10-13-accounts.sql`: idempotent (`IF NOT EXISTS` / guarded) and exactly as the spec's Data model section, including grandfathering existing real accounts (`email_verified_at = now()`, `tier = 'pro'`) except `public@dartdraw.local`.

- [ ] **Step 1: Write failing tests** in `tests/accounts-lib.test.js`: `entryLimitFor` (basic 64, pro null, unknown -> 64), `countActiveEntries` (withdrawn excluded, junk tolerated), `checkEntryLimit` (new event of 65 as basic -> violation; 64 ok; existing 70 edited without growth ok; existing 70 growing to 71 violation; pro never), `hashToken` deterministic and not equal to input, `issueToken`/`consumeToken` against the fake db (stores hash only; single use; wrong kind null; expired null; newer token invalidates older; unknown token null), `isBlocked`/`record`/`clear` window behaviour (use a controllable clock or small `windowMs`), `sendMail` console outbox, `isMailConfigured` for each env combination, `appUrl`, `normalizeEmail`, `createOrganizer` defaults and `verified`.
- [ ] **Step 2: Run** `node --test tests/accounts-lib.test.js` — expect FAIL.
- [ ] **Step 3: Implement** everything listed above, plus the migration SQL, `schema.sql` and `.env.example` updates. The migration must also be safe to re-run.
- [ ] **Step 4: Run** the new tests and the full suite — expect all pass.

---

### Task 2: Authentication core (requireAuth, login, me, config)

**Files:**
- Modify: `api/_lib/auth.js`, `api/auth/login.js`, `api/auth/me.js`
- Create: `api/auth/config.js`
- Test: `tests/auth-core.test.js` (new; extends `tests/lib/fake-db.js` if needed)

**Interfaces:**
- Consumes: Task 1 modules.
- Produces:
  - `signSession(organizer)` payload now `{ sub, email, name, tv }` where `tv` is the organizer's `token_version`.
  - `requireAuth(req, res)` (when `REQUIRE_LOGIN === 'true'`): verifies the JWT, loads the organizer row by id, and returns `{ id, email, name, role, tier }`; writes 401 `{ error: 'Not authenticated' }` and returns `null` if the row is missing, `suspended`, `email_verified_at` is NULL, or `tv !== token_version`. When `REQUIRE_LOGIN` is not `'true'` it behaves exactly as today (shared Public organiser), returning the row with `role: 'organizer', tier: 'pro'` added so downstream code never sees undefined.
  - `POST /api/auth/login`: per the spec (throttle first: 10 failed attempts / 15 min per email key `login:email:<normalised>` and 40 / 15 min per `login:ip:<ip>` -> 429 `{ error: 'Too many attempts. Try again later.' }`; unknown email and wrong password -> identical 401 `Incorrect email or password.` (run a dummy bcrypt compare for unknown emails to keep timing similar); correct password then `email_verified_at` NULL -> 403 `{ code: 'unverified', error: 'Please verify your email first.' }`; `suspended` -> 403 `{ code: 'suspended', error: 'This account has been suspended.' }`; success clears the email key, sets the cookie, answers `{ id, email, name, role, tier }`). A failed attempt calls `record` on both keys. The `Public` row (`password_hash = 'disabled'`) can never succeed.
  - `GET /api/auth/me`: existing fields plus `role`, `tier`, `entryLimit` (`entryLimitFor(tier)`, number or null).
  - `GET /api/auth/config` (no auth): `{ signupOpen }` where `signupOpen` is `process.env.SIGNUP_OPEN === 'true' && isMailConfigured()`.

- [ ] **Step 1: Write failing tests** (`tests/auth-core.test.js`) for: login success (cookie set, body shape, throttle key cleared); wrong password and unknown email give byte-identical 401 bodies; unverified and suspended only after the correct password; 429 after the limit and the counter recorded only on failures; Public row cannot log in; `requireAuth` rejections (suspended, unverified, stale `tv`, missing row, no cookie) and success returning role/tier; `requireAuth` with `REQUIRE_LOGIN` unset keeps the Public fallback; `me` includes role/tier/entryLimit; `config` true only when both env conditions hold. Use real `jsonwebtoken` signing with a test `SESSION_SECRET`.
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement.** Keep `getOrganizerFromRequest` exported (other code uses it) but have it return the JWT payload plus `tv`; the row check lives in `requireAuth`.
- [ ] **Step 4: Run** the new tests and the full suite — expect all pass.

---

### Task 3: Sign-up, verification, resend, forgot and reset endpoints

**Files:**
- Create: `api/auth/register.js` (replace the existing file), `api/auth/verify.js`, `api/auth/resend-verification.js`, `api/auth/forgot.js`, `api/auth/reset.js`
- Test: `tests/auth-flows.test.js` (new)

**Interfaces:**
- Consumes: Tasks 1-2.
- Produces (all `POST`, JSON, 405 otherwise):
  - `register` `{ name, email, password }`: if `process.env.SIGNUP_OPEN !== 'true' || !isMailConfigured()` -> 403 `{ error: 'Sign-up is not open yet.' }`. Validates name (non-empty, <= 80 chars), email (basic shape, <= 254), password >= 8 (400 with a clear message). Throttle: 5 per hour per `register:ip:<ip>` and per `register:email:<email>` (record every request) -> 429. New email: create unverified organizer (`bcrypt.hash(password, 10)`, tier `'basic'`, role `'organizer'`), issue a `verify` token, send the email with link `<appUrl>/verify.html?token=<raw>`. Existing unverified email: issue a fresh verify token and resend (do NOT change the stored password). Existing verified email: send a short "you already have an account; use Forgot password" email. In every case answer `200 { ok: true, message: 'If that email can be registered, we have sent a link to verify it.' }`.
  - `verify` `{ token }`: `consumeToken(token, ['verify'])`; on success set `email_verified_at = now()` (only if NULL) and answer `{ ok: true }`; invalid/expired/used -> 400 `{ error: 'This link is invalid or has expired.' }`.
  - `resend-verification` `{ email }`: throttled like register; if the account exists and is unverified and not suspended, issue and send a new verify token; always the same generic `200 { ok: true, message }`.
  - `forgot` `{ email }`: throttled (5 / hour per ip and per email); if the account exists, is not suspended, has a real password (not `'disabled'`) send a `reset` token link `<appUrl>/reset.html?token=<raw>`; always the same generic `200`.
  - `reset` `{ token, password }`: password >= 8 (400); `consumeToken(token, ['reset','invite'])`; on success: set `password_hash`, set `email_verified_at` if NULL, `token_version = token_version + 1`, answer `{ ok: true }`; invalid -> 400 same message as verify. A suspended account's reset succeeds in changing nothing and answers the invalid-link message (do not let a suspended account regain access by reset).
  - Email wording: plain text, short, subjects "Verify your DartDraw email", "Reset your DartDraw password", "Your DartDraw account", each with one link and one sentence on ignoring the message if unexpected.

- [ ] **Step 1: Write failing tests** (`tests/auth-flows.test.js`, console mail provider, fake db) for every rule above, including: closed sign-up in all three ways (flag off, mail unconfigured, both); generic answers byte-identical for known/unknown emails on register, forgot, resend; the verification email exists in `sendMail.outbox` only when expected (new, existing-unverified, existing-verified variants); stored token is hashed; verify marks verified; token single use (second use 400); expired token 400; reset changes the password (bcrypt compare), bumps `token_version`, so a cookie signed before the reset fails `requireAuth` afterwards; invite token accepted by `reset`; verify token NOT accepted by `reset` and vice versa; suspended account cannot reset; throttle 429.
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the new tests and the full suite — expect all pass.

---

### Task 4: Basic entry limit (server and organiser UI) and top-bar badge

**Files:**
- Modify: `api/tournaments/[id].js`, `api/tournaments/index.js` only if it creates rows (check), `index.html`
- Test: `tests/entry-limit.test.js` (new; server side, extend `tests/tournament-lock.test.js`'s fake-db style or use `tests/lib/fake-db.js`), `tests/entry-limit-ui.test.js` (new; organiser UI via `tests/lib/load-app.js`)

**Interfaces:**
- Consumes: `checkEntryLimit` and `entryLimitFor` (Task 1); `organizer.tier` from `requireAuth` (Task 2); `currentOrganizer.entryLimit` from `/api/auth/me` (Task 2).
- Produces:
  - Server: in `PUT /api/tournaments/:id`, after the finalized check (and for the insert path, with `oldData` undefined), `const v = checkEntryLimit(organizer.tier, data, existing && existing.data)`; if `v` -> 403 `{ code: 'entry_limit', limit: v.limit, error: 'Basic accounts allow up to ' + v.limit + ' entries per event.' }`. The Public fallback organiser (`tier: 'pro'`) is never limited.
  - Organiser: `entryLimit()` -> `currentOrganizer && currentOrganizer.entryLimit` (number or null/undefined meaning none). `saveStage1` caps `e.entries` input: if over the limit show the existing inline error style (`alert`-free; use `openModal` with an info message "Basic accounts allow up to 64 entries per event. Ask the Admin to upgrade you to Pro.") and do not save. Every other way entries can be added to an event (find them: `grep -n "entriesList.push"` and the add-entry / paste / import handlers) must refuse when the active count would exceed the limit, with the same message; reducing or editing is always allowed; an event already over the limit can be edited but not grown (same rule as the server). A 403 `entry_limit` from a save shows the same message and reloads the saved copy (reuse the reload approach used for the finalized 403 in `flushSaveOnce`).
  - Top bar (`renderOrganizerBar`): next to the name, a small badge "Basic" or "Pro" (class names of your choice, styled inline or in the existing `<style>`; in publicMode no badge). For Basic, add the text "Up to 64 entries per event" as the badge's `title` and, in Stage 1 under the entries field, a one-line hint "Basic: up to 64 entries per event." (hidden for Pro and publicMode).

- [ ] **Step 1: Write failing tests**: server — new tournament with 65 active entries as basic -> 403 `entry_limit`; 64 ok; withdrawn entries excluded; pro unlimited; existing 70-entry event saved as basic with 70 or fewer -> ok, growing -> 403; finalized check still wins first (finalized row + over limit -> 403 `finalized: true`). UI — `saveStage1` blocked at 65 with a modal and no save; each add path blocked at the limit; unlimited when `entryLimit` is null; badge text for basic/pro/publicMode.
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement** server and UI.
- [ ] **Step 4: Run** the new tests and the full suite — expect all pass.

---

### Task 5: Pages (login, register, verify, forgot, reset) and headers

**Files:**
- Modify: `login.html`, `register.html`, `vercel.json`
- Create: `verify.html`, `forgot.html`, `reset.html`
- Test: `tests/auth-pages.test.js` (new: static checks on the HTML/JSON: endpoints called, form fields, token handling, header rule)

**Interfaces:**
- Consumes: the endpoints from Tasks 2-3 (exact names, bodies and error `code`s).
- Produces:
  - `login.html`: adds "Forgot password?" (`/forgot.html`); fetches `/api/auth/config` and shows the "Sign up" link only when `signupOpen`; on 403 `unverified` shows "Please verify your email first." with a "Resend verification email" button that calls `POST /api/auth/resend-verification` and shows the generic answer; on 403 `suspended` shows the message; 429 shows the message.
  - `register.html`: fields name, email, password (min 8, `autocomplete="new-password"`), no access code; on success replaces the form with "Check your email to verify your account."; on 403 "Sign-up is not open yet." shows that message and no form; on `config.signupOpen === false` shows "Sign-up is not open yet." immediately.
  - `verify.html`: reads `?token=`, `POST /api/auth/verify`, shows success with a "Sign in" link or the error message; never puts the token anywhere but the request body.
  - `forgot.html`: email field, `POST /api/auth/forgot`, always shows the generic confirmation.
  - `reset.html`: reads `?token=`, new password + confirm (client checks equality and >= 8), `POST /api/auth/reset`, success links to Sign in.
  - All five share the visual style of the current `login.html` card (copy the CSS; plain HTML + inline script, no libraries, no external requests), are keyboard accessible (labels, `autocomplete`, focus states, `aria-live` on the message area), and work at 375 px.
  - `vercel.json`: add a `headers` rule setting `Referrer-Policy: no-referrer` for `/verify.html` and `/reset.html` (keep the existing `redirects`).

- [ ] **Step 1: Write failing static tests** (`tests/auth-pages.test.js`) for the contents listed above (e.g. each page calls its endpoint with POST and JSON, `register.html` has no access-code field, `login.html` fetches `/api/auth/config` and handles `unverified`/`suspended`/429, `vercel.json` still has the redirect and now has the header rule, no page references an external host).
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement** the pages and the header rule. After the tests pass, load each page once in the Browser pane against a scratch server only if you can do so without touching the repo; otherwise leave browser verification to the controller.
- [ ] **Step 4: Run** the new tests and the full suite — expect all pass.

---

### Task 6: create-admin script, rollout docs

**Files:**
- Create: `scripts/create-admin.js`, `tests/create-admin.test.js`
- Modify: `README.md` (replace "Requiring organizer login" with the new accounts setup and rollout; document each environment variable; document the Basic/Pro levels; keep the finalized-event reopening section)
- Test: `tests/create-admin.test.js`

**Interfaces:**
- Consumes: `api/_lib/accounts.js` and `bcryptjs`; the migration from Task 1.
- Produces: `scripts/create-admin.js` exporting `async function createAdmin({ sql, email, name, passwordHash, adoptPublic })` (pure logic, testable with the fake db) and, when run directly (`require.main === module`), a CLI: `node scripts/create-admin.js --email you@example.com [--name "Your Name"] [--adopt-public]`; reads `DATABASE_URL` from the environment; reads the password from the `ADMIN_PASSWORD` environment variable or, if unset, prompts on stdin without echo; refuses passwords shorter than 8; never prints the password or hash. Behaviour: creates the account or, if the email exists, updates it to `role='admin'`, `tier='pro'`, verified, new password, `suspended=false`, `token_version + 1`; with `adoptPublic`, in one transaction moves every tournament whose `created_by` is the `public@dartdraw.local` organiser to the admin and returns `{ adminId, moved }`; running it twice moves nothing the second time; it never touches tournaments of other organisers and never modifies the Public organiser row except that it keeps `password_hash = 'disabled'`.

- [ ] **Step 1: Write failing tests** for `createAdmin` with the fake db: new account created as verified admin/pro; existing account promoted; adopt moves exactly the Public rows (including a finalized one) and not others; second run moves 0; password is hashed (bcrypt) and never stored plain; short password rejected.
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement** the script and the README rewrite (rollout steps exactly as the spec's Rollout section, plus how to open sign-up later: domain verified with Resend, `RESEND_API_KEY`, `MAIL_FROM`, `APP_URL`, `SIGNUP_OPEN=true`).
- [ ] **Step 4: Run** the new tests and the full suite and `npm run check-viewer` — expect all pass.

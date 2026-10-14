# Admin tab (sub-project 2 of 2) - design

Status: draft for review, 2026-10-14. Builds on organiser accounts (commit 881b81b: roles, tiers, suspension, `requireAuth` returning `{ id, email, name, role, tier }`) and the finalize feature (a finalized event is closed to organisers; only an Admin can reopen it).

## Purpose

Give the project owner (the single account with `role = 'admin'`) an **Admin tab inside the organiser app** to run the service: manage organiser accounts, see and edit any organiser's events, reopen finalized events, control what is public, and set how long events stay on the public home page.

## Decisions already made with the user

- The Admin tab lives in the organiser app (not a separate site); only admin accounts see it; the server checks the role on every Admin call.
- Admin scope: **manage organisers**, **see and open all events**, **reopen a finalized event**, **public page controls** (unpublish / unlist any event, plus the retention setting).
- Opening another organiser's event gives the Admin **full edit**, as if they were its owner.
- Deleting an organiser who still has events is **blocked**: suspend them, or transfer their events to another organiser first.
- Retention setting controls **two numbers**: how many days a finalized event stays under Results (**default 14**, changed from today's 7 at the user's request) and how many hours a started but unfinished event stays under Live now (default 48).
- **No audit log** (the user chose none).
- No domain yet, so no email is relied on: when an Admin creates an organiser or issues a reset, the Admin is shown a one-time link to hand over by hand (and the email is also sent if mail is configured).

## Server

New `requireAdmin(req, res)` in `api/_lib/auth.js`: runs `requireAuth`, then requires `organizer.role === 'admin'`; answers 401 when not signed in and 403 `{ error: 'Admin only.' }` otherwise, returning `null` so handlers can `if (!admin) return;`. In the shared-Public fallback (`REQUIRE_LOGIN` not `true`) nobody is an admin, so every Admin endpoint answers 403.

New endpoints under `api/admin/` (all JSON, all behind `requireAdmin`, 405 for other methods):

**Organisers**
- `GET /api/admin/organizers`: every organiser except the shared Public row: `{ id, email, name, role, tier, suspended, verified (bool), createdAt, eventCount }`, newest first.
- `POST /api/admin/organizers` `{ name, email, tier }`: creates a verified account with no password and an `invite` token (7 days); answers `{ organizer, link }` where `link` is `<APP_URL or host>/reset.html?token=<raw>`; if mail is configured the same link is emailed. 409 when the email exists.
- `PATCH /api/admin/organizers/:id` with any of `{ tier, role, suspended }`: tier `basic|pro`; role `organizer|admin`; suspended boolean. Suspending bumps `token_version` (signs them out at once). Guards: an admin cannot change their own role, suspend themselves, or be the last admin (409 with a clear message).
- `POST /api/admin/organizers/:id/reset-link`: issues a `reset` token and answers `{ link }` (and emails it when mail is configured). Not for the Public row.
- `POST /api/admin/organizers/:id/transfer` `{ toOrganizerId }`: moves every event owned by `:id` to the target in one statement; answers `{ moved }`. Target must exist, be active, and differ from the source.
- `DELETE /api/admin/organizers/:id`: only when the organiser owns no events (409 `{ error: 'Transfer or delete their events first.', eventCount }` otherwise); never the caller, never the last admin, never the Public row.

**Events**
- `GET /api/admin/events?q=&owner=&limit=&offset=`: events across all organisers: `{ id, name (tournament + event), owner: { id, name, email }, format, date, published, listed, finalizedAt, updatedAt }`, newest first, searchable by text and filterable by owner; max 100 per page.
- `POST /api/admin/events/:id` `{ action }` with `action` one of: `reopen` (removes `finalized` from the stored data and bumps `updated_at`; 409 if not finalized), `unpublish` (sets `published=false`, `listed=false`), `unlist` (sets `listed=false`), `transfer` `{ toOrganizerId }` (moves this one event), `delete` (permanent). Each answers the updated summary (or `{ ok: true }` for delete).

**Opening and editing any event**
`api/tournaments/[id].js`: for an admin caller, GET, PUT and DELETE are not scoped to `created_by = organizer.id`; the row's owner is kept unchanged on update; the 409 stamp rule, the finalized lock and the entry-limit rule keep working. The finalized lock is not bypassed: to edit a finalized event the Admin first uses **Reopen**. (An Admin never hits the Basic entry limit: see "Admin inherits Pro" below.)

**Admin inherits Pro**
An account with `role = 'admin'` has every Pro-level access whatever its stored `tier` says, in addition to the Admin tab. Implemented once, centrally: `tiers.js` gains `effectiveTier(organizer)` (`'pro'` for an admin, otherwise the stored tier), `requireAuth` returns that effective tier, so the entry limit in `api/tournaments/[id].js`, `entryLimit` in `/api/auth/me` and the organiser UI (limit, hint, top-bar badge) all follow it with no other change; the top bar shows an "Admin" badge for admins. Any future Pro-only feature must read the effective tier, never the raw column. In the Organisers view an admin row shows "Pro (via Admin)"; changing the tier of an admin account is allowed but has no effect until they are no longer an admin.

**Retention settings**
New table `site_settings (key text PRIMARY KEY, value jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())` and, for the public site, a view `public_settings` exposing only the two retention values, granted to `viewer_ro` (new file `viewer/sql/settings.sql`, run once in Neon, like `readonly.sql`).
- `GET /api/admin/settings` -> `{ resultsDays, liveHours }` (defaults 14 and 48 when unset).
- `PUT /api/admin/settings` `{ resultsDays, liveHours }`: integers, `resultsDays` 1-90, `liveHours` 1-168; 400 otherwise.
- The viewer (`viewer/api/events.js`, `listView.js`, `listConfig.js`) reads the two values from `public_settings` on each list request, falls back to the defaults (14 days, 48 hours) when the view or rows are missing, so the public site keeps working before the SQL is run (`RESULTS_DAYS` in `listConfig.js` changes from 7 to 14 so it already behaves this way), clamps to the same ranges, and widens its row query window to `max(QUERY_DAYS, resultsDays + 1, ceil(liveHours / 24) + 1)` days so longer retention actually shows.

## Screens (organiser app)

- Sidebar: an **Admin** entry (gold, below the account bar) shown only when `currentOrganizer.role === 'admin'`. It switches the main area to the Admin views; the normal stage navigation is hidden while in Admin and a "Back to my events" link returns.
- New classic script `admin-ui.js` (like `pods-ui.js`) holds the Admin views so `index.html` does not grow much; they render into `#stageArea` and use the existing card, table and modal styles. All text from the server is escaped.
- **Organisers** view: table (name, email, tier badge, role, status Active/Suspended/Unverified, events, created) with row actions: change tier, suspend/reactivate, make/remove admin, copy reset link, transfer events, delete. "Add organiser" opens a modal (name, email, tier) and then shows the invite link with a Copy button and the text "Send this link to the organiser. It works for 7 days."
- **Events** view: search box and owner filter; table (event, owner, format, date, status chips Published / Listed / Finalized, last saved) with **Open** (loads the event in the normal editor), and actions Reopen (finalized only), Unpublish, Unlist, Transfer, Delete (confirm modal naming the event).
- **Settings** view: the two retention numbers with the allowed ranges and a Save button.
- While an Admin is editing an event owned by someone else, a banner at the top reads "Editing <owner name>'s event as Admin" and the page title keeps the event name. An Admin who opens a finalized event sees the locked view with a **Reopen to edit** button (admin only).

## Out of scope

Audit log, impersonating an organiser's login, bulk actions, organiser notification emails, self-service password change and profile pages, billing for Pro.

## Testing

Node tests with the fake database from `tests/lib/fake-db.js` (extended as needed) and `callHandler`: every Admin endpoint rejects unauthenticated (401), non-admin (403), suspended admin and stale-session admin; each action and each guard (self-role, self-suspend, last admin, delete with events, transfer target rules, reopen of a non-finalized event, settings ranges); invite and reset links work through the existing `reset` endpoint; admin GET/PUT of another organiser's event works and keeps the owner; non-admin still gets 404; finalized lock still refuses until Reopen; viewer settings fallback and clamping and the widened query window; `admin-ui.js` view builders (escaping, buttons shown/hidden by role and state) via the organiser's vm loader. The screens are checked in the browser pane with a scratch server.

## Review focus

- Every `/api/admin/*` route enforces admin server-side; nothing relies on the hidden sidebar entry.
- An admin can never lock the service out of administrators (last admin, self-demotion, self-suspension, self-delete).
- Transfers and deletes never orphan or lose events, and finalized events keep `finalized` through a transfer.
- Reopen, unpublish and unlist change exactly what they say and take effect on the public site (Live/Results lists) without other side effects.
- The viewer keeps working with the new settings missing, malformed or extreme.
- Text from other organisers (names, emails, event names) is escaped everywhere in the Admin views.

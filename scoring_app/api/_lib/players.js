// Player accounts (the player_accounts table). Copied in spirit from the organiser app's api/_lib/accounts.js: the
// scoring app is its own Vercel project and cannot load files from outside scoring_app/ at deploy time.
const { sql } = require('./db');

// Same cost as the organiser app, and the dummy compare below uses it too, so the time a password check takes does not
// say whether the account exists.
const BCRYPT_COST = 10;

// A real bcrypt hash (at BCRYPT_COST) of a throwaway value, compared against when there is no real hash to check.
const DUMMY_HASH = '$2a$10$EnM2xp.ZkwrbcwQndIVB5O90vkiQGZczDDGJpNwEx3QrwFwweEJoW';

// The profile name may change at most once in this long (spec section 6).
const NAME_CHANGE_DAYS = 30;
const NAME_CHANGE_MS = NAME_CHANGE_DAYS * 24 * 60 * 60 * 1000;

function normalizeEmail(s) {
  return String(s == null ? '' : s).trim().toLowerCase();
}

// Full row (including password_hash and token_version) or undefined.
async function findByEmail(email) {
  const rows = await sql`SELECT * FROM player_accounts WHERE email = ${normalizeEmail(email)}`;
  return rows[0];
}

async function findById(id) {
  const rows = await sql`SELECT * FROM player_accounts WHERE id = ${id}`;
  return rows[0];
}

// A duplicate email throws (the database's unique constraint, code 23505). Returns the full new row.
async function createPlayer({ email, passwordHash, firstName, lastName, verified, mustChange, createdByAdmin }) {
  const rows = await sql`
    INSERT INTO player_accounts (email, password_hash, first_name, last_name, email_verified_at, must_change_password, created_by_admin)
    VALUES (${normalizeEmail(email)}, ${passwordHash}, ${firstName}, ${lastName},
            CASE WHEN ${!!verified}::boolean THEN now() ELSE NULL END, ${!!mustChange}, ${createdByAdmin || null})
    RETURNING *
  `;
  return rows[0];
}

// Signing up again with an email that is still unconfirmed: the new submission replaces the stored names and password,
// so whoever signed up first with someone else's address cannot keep a password on it. Does nothing once the email is
// confirmed. True when a row was changed.
async function replaceUnconfirmed(id, { passwordHash, firstName, lastName }) {
  const rows = await sql`
    UPDATE player_accounts SET first_name = ${firstName}, last_name = ${lastName}, password_hash = ${passwordHash}
    WHERE id = ${id} AND email_verified_at IS NULL
    RETURNING id
  `;
  return rows.length > 0;
}

async function confirm(id) {
  await sql`UPDATE player_accounts SET email_verified_at = now() WHERE id = ${id} AND email_verified_at IS NULL`;
}

// Sets a new password the player chose themselves (reset link or change-password): clears must_change_password,
// confirms the email (a reset link proves the address; a signed-in player is already confirmed) and bumps
// token_version, so every older session stops working. opts.expectHash guards the update with the hash the caller just
// checked, so two overlapping changes cannot both succeed against the old password. Returns the new token_version, or
// null when no row was changed.
async function setPassword(id, hash, opts) {
  const expectHash = (opts && opts.expectHash) || null;
  const rows = await sql`
    UPDATE player_accounts SET password_hash = ${hash}, must_change_password = false,
      email_verified_at = COALESCE(email_verified_at, now()),
      token_version = token_version + 1
    WHERE id = ${id} AND (${expectHash}::text IS NULL OR password_hash = ${expectHash})
    RETURNING token_version
  `;
  return rows.length ? Number(rows[0].token_version) : null;
}

function toTime(v) {
  if (v == null) return null;
  const t = v instanceof Date ? v.getTime() : new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}

// Changes the profile name, at most once per NAME_CHANGE_DAYS. `now` is a Date (or ms) from the caller so the 30 days
// are counted from one clock. The check and the change are one statement, so two quick changes cannot both pass.
// Returns { ok: true } or { code: 'name_change_too_soon', nextAt } (ISO string).
async function changeName(id, first, last, now) {
  const nowMs = toTime(now == null ? Date.now() : now);
  const nowIso = new Date(nowMs).toISOString();
  const cutoffIso = new Date(nowMs - NAME_CHANGE_MS).toISOString();
  const rows = await sql`
    UPDATE player_accounts SET first_name = ${first}, last_name = ${last}, name_changed_at = ${nowIso}::timestamptz
    WHERE id = ${id} AND (name_changed_at IS NULL OR name_changed_at <= ${cutoffIso}::timestamptz)
    RETURNING id
  `;
  if (rows.length) return { ok: true };
  const row = await findById(id);
  const changedMs = row ? toTime(row.name_changed_at) : null;
  const nextAt = new Date((changedMs == null ? nowMs : changedMs) + NAME_CHANGE_MS).toISOString();
  return { code: 'name_change_too_soon', nextAt };
}

// The fields safe to hand to the browser.
function toPublic(row) {
  const changed = toTime(row.name_changed_at);
  return {
    id: row.id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    mustChange: !!row.must_change_password,
    nameChangedAt: changed == null ? null : new Date(changed).toISOString(),
    createdAt: toTime(row.created_at) == null ? null : new Date(toTime(row.created_at)).toISOString()
  };
}

module.exports = {
  BCRYPT_COST, DUMMY_HASH, NAME_CHANGE_DAYS, NAME_CHANGE_MS,
  normalizeEmail, findByEmail, findById, createPlayer, replaceUnconfirmed, confirm, setPassword, changeName, toPublic
};

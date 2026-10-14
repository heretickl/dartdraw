const { sql } = require('./db');
const { effectiveTier } = require('./tiers');

// One bcrypt cost for every password hash the app makes (sign-up, reset, the
// create-admin script) and for the dummy compare below, so the time to check a
// password does not reveal which kind of account it belongs to.
const BCRYPT_COST = 10;

// A real bcrypt hash (at BCRYPT_COST) of a throwaway value. Compared against
// when there is no real hash to check, so an unknown account costs the same.
const DUMMY_HASH = '$2a$10$EnM2xp.ZkwrbcwQndIVB5O90vkiQGZczDDGJpNwEx3QrwFwweEJoW';

function normalizeEmail(s) {
  return String(s == null ? '' : s).trim().toLowerCase();
}

// Full organizers row (including password_hash, role, tier, suspended,
// email_verified_at, token_version) or undefined.
async function findByEmail(email) {
  const rows = await sql`SELECT * FROM organizers WHERE email = ${normalizeEmail(email)}`;
  return rows[0];
}

async function findById(id) {
  const rows = await sql`SELECT * FROM organizers WHERE id = ${id}`;
  return rows[0];
}

// A duplicate email throws (the database's unique constraint).
async function createOrganizer({ email, name, passwordHash, role, tier, verified }) {
  const rows = await sql`
    INSERT INTO organizers (email, password_hash, name, role, tier, email_verified_at)
    VALUES (${normalizeEmail(email)}, ${passwordHash}, ${name}, ${role || 'organizer'}, ${tier || 'basic'},
            CASE WHEN ${!!verified}::boolean THEN now() ELSE NULL END)
    RETURNING id, email, name, role, tier
  `;
  return toSessionUser(rows[0]);
}

// The fields safe to hand to the browser. tier is the effective one (an Admin is Pro whatever is stored), so the
// login response, createOrganizer and requireAuth / /api/auth/me all agree.
function toSessionUser(row) {
  return { id: row.id, email: row.email, name: row.name, role: row.role, tier: effectiveTier(row) };
}

// Signing up again with an email whose account is still unverified: the new
// submission replaces the stored name and password, so whoever pre-registered
// an address cannot keep a password on it. Does nothing once the email is
// verified. Returns true when a row was changed.
async function replaceUnverifiedCredentials(id, name, passwordHash) {
  const rows = await sql`
    UPDATE organizers SET name = ${name}, password_hash = ${passwordHash}
    WHERE id = ${id} AND email_verified_at IS NULL
    RETURNING id
  `;
  return rows.length > 0;
}

module.exports = { BCRYPT_COST, DUMMY_HASH, replaceUnverifiedCredentials, normalizeEmail, findByEmail, findById, createOrganizer, toSessionUser };

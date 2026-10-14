// Shared pieces of the Admin organisers endpoints (api/_routes/admin/organizers/*).
const { sql } = require('./db');
const { PUBLIC_ORGANIZER_EMAIL } = require('./auth');
const { effectiveTier } = require('./tiers');
const { findById } = require('./accounts');
const { sendMail, appUrl } = require('./mail');

const TIERS = ['basic', 'pro'];
const ROLES = ['organizer', 'admin'];

// The shape the Admin screens get for an organiser. `tier` is the stored value;
// `effectiveTier` is what the account actually gets (an Admin is Pro).
function toSummary(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    tier: row.tier,
    effectiveTier: effectiveTier(row),
    suspended: !!row.suspended,
    verified: !!row.email_verified_at,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    eventCount: Number(row.event_count) || 0
  };
}

// Every organiser except the shared Public row, newest first.
async function listSummaries() {
  const rows = await sql`
    SELECT o.id, o.email, o.name, o.role, o.tier, o.suspended, o.email_verified_at, o.created_at,
      (SELECT count(*)::int FROM tournaments t WHERE t.created_by = o.id) AS event_count
    FROM organizers o
    WHERE o.email <> 'public@dartdraw.local'
    ORDER BY o.created_at DESC, o.id
  `;
  return rows.map(toSummary);
}

// One organiser's summary, or null (unknown id or the Public row).
async function getSummary(id) {
  const rows = await sql`
    SELECT o.id, o.email, o.name, o.role, o.tier, o.suspended, o.email_verified_at, o.created_at,
      (SELECT count(*)::int FROM tournaments t WHERE t.created_by = o.id) AS event_count
    FROM organizers o
    WHERE o.email <> 'public@dartdraw.local' AND o.id = ${id}
  `;
  return rows.length ? toSummary(rows[0]) : null;
}

// An "active admin" is someone who can actually sign in as an admin right now: role admin, not suspended, email verified,
// and a real password (an invited account has the unusable hash 'disabled' until the invite link sets one).
// The last-admin guard in the PATCH and DELETE statements (api/_routes/admin/organizers/[id].js) uses the same definition in SQL.
async function activeAdminCount() {
  const rows = await sql`
    SELECT count(*)::int AS n FROM organizers
    WHERE role = 'admin' AND suspended = false AND email_verified_at IS NOT NULL AND password_hash <> 'disabled'
  `;
  return Number(rows[0].n) || 0;
}

function isActiveAdmin(row) {
  return !!row && row.role === 'admin' && !row.suspended && !!row.email_verified_at && row.password_hash !== 'disabled';
}

// The full organizers row for a route/body id, or null when the id is not a
// usable id, unknown, or the shared Public row (which Admin can never target).
async function lookupTarget(id) {
  if (typeof id !== 'string' || !id) return null;
  let row;
  try {
    row = await findById(id);
  } catch (e) {
    if (e && e.code === '22P02') return null; // not a valid uuid
    throw e;
  }
  if (!row || row.email === PUBLIC_ORGANIZER_EMAIL) return null;
  return row;
}

// Checks the organiser who would receive transferred events. On a problem it writes the error response itself and
// returns null; otherwise it returns the target's organizers row. Used both for moving all of an organiser's events
// (sourceId = that organiser) and for moving a single event (sourceId = the event's current owner).
async function transferTarget(res, toId, sourceId) {
  if (typeof toId !== 'string' || !toId) {
    res.status(400).json({ error: 'Choose an organiser to receive the events.' });
    return null;
  }
  if (String(toId).toLowerCase() === String(sourceId == null ? '' : sourceId).toLowerCase()) {   // ids are uuids: compare without case
    res.status(400).json({ error: 'Choose a different organiser to receive the events.' });
    return null;
  }
  const target = await lookupTarget(toId);
  if (!target) {
    res.status(404).json({ error: 'The organiser to receive the events was not found.' });
    return null;
  }
  if (target.suspended) {
    res.status(409).json({ error: 'That organiser is suspended. Choose an active organiser.' });
    return null;
  }
  return target;
}

function bodyObject(req) {
  const b = req.body;
  return b && typeof b === 'object' && !Array.isArray(b) ? b : {};
}

// Link an organiser opens to choose a password (invite and reset tokens both end up on reset.html).
function linkFor(req, raw) {
  return appUrl(req) + '/reset.html?token=' + raw;
}

// Emails the link when mail is configured. Never throws and never fails the request.
async function mailLink(to, subject, text) {
  try {
    await sendMail({ to, subject, text });
  } catch (e) { /* the Admin still has the link on screen */ }
}

module.exports = {
  TIERS, ROLES, toSummary, listSummaries, getSummary, activeAdminCount, isActiveAdmin,
  lookupTarget, transferTarget, bodyObject, linkFor, mailLink
};

const { requireAdmin } = require('../../../_lib/auth');
const { sql } = require('../../../_lib/db');
const { TIERS, ROLES, getSummary, activeAdminCount, isActiveAdmin, lookupTarget, bodyObject } = require('../../../_lib/adminOrganizers');

// Admin only.
// PATCH  /api/admin/organizers/:id { tier?, role?, suspended? } -> { organizer }
//   At least one field. Suspending or demoting an admin bumps token_version, which signs them out at once.
//   409 when: the caller changes their own role or suspends themselves; the change would leave no active admin;
//   the account is not verified yet and is being made an admin.
// DELETE /api/admin/organizers/:id -> 204
//   409 { error, eventCount } while they own events (transfer or delete those first); 409 for the caller
//   and for the last active admin. The shared Public row is never reachable (404).
// The last-admin guard lives in the write statements themselves (PATCH and DELETE below), so two requests racing each
// other cannot both succeed; the JS checks before them only give a friendly early answer. Each statement starts with a
// CTE that locks every active admin row (FOR UPDATE, in id order) and counts them, so a second statement waits for the
// first, re-reads the rows the first one changed, and counts one fewer. "Active admin" = role admin, not suspended, email
// verified, and not the unusable password hash 'disabled' (someone who can actually sign in). The statement changes
// nothing when its target is an active admin and not more than one active admin exists.
const NOT_FOUND = { error: 'Organiser not found.' };
const LAST_ADMIN = { error: 'There must always be at least one active admin.' };
const HAS_EVENTS = 'Transfer or delete their events first.';

module.exports = async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    if (req.method === 'PATCH') {
      const body = bodyObject(req);
      const { tier, role, suspended } = body;
      if (tier === undefined && role === undefined && suspended === undefined) {
        res.status(400).json({ error: 'Nothing to change.' });
        return;
      }
      if (tier !== undefined && !TIERS.includes(tier)) {
        res.status(400).json({ error: 'Tier must be basic or pro.' });
        return;
      }
      if (role !== undefined && !ROLES.includes(role)) {
        res.status(400).json({ error: 'Role must be organizer or admin.' });
        return;
      }
      if (suspended !== undefined && typeof suspended !== 'boolean') {
        res.status(400).json({ error: 'Suspended must be true or false.' });
        return;
      }

      const target = await lookupTarget(req.query && req.query.id);
      if (!target) { res.status(404).json(NOT_FOUND); return; }

      const self = target.id === admin.id;
      if (self && role !== undefined && role !== target.role) {
        res.status(409).json({ error: 'You cannot change your own role.' });
        return;
      }
      if (self && suspended === true) {
        res.status(409).json({ error: 'You cannot suspend yourself.' });
        return;
      }
      const losesAdmin = isActiveAdmin(target) && (role === 'organizer' || suspended === true);
      if (losesAdmin && await activeAdminCount() <= 1) {
        res.status(409).json(LAST_ADMIN);
        return;
      }
      if (role === 'admin' && target.role !== 'admin' && !target.email_verified_at) {
        res.status(409).json({ error: 'Only a verified account can be made an admin.' });
        return;
      }

      // Suspending or demoting ends their current sessions.
      const bump = (suspended === true || (role === 'organizer' && target.role === 'admin')) ? 1 : 0;
      const removesAdmin = role === 'organizer' || suspended === true;   // from the request alone; the statement checks the row itself
      const rows = await sql`
        WITH admins AS MATERIALIZED (
          SELECT id FROM organizers
          WHERE role = 'admin' AND suspended = false AND email_verified_at IS NOT NULL AND password_hash <> 'disabled'
          ORDER BY id FOR UPDATE
        )
        UPDATE organizers SET
          tier = COALESCE(${tier === undefined ? null : tier}::text, tier),
          role = COALESCE(${role === undefined ? null : role}::text, role),
          suspended = COALESCE(${suspended === undefined ? null : suspended}::boolean, suspended),
          token_version = token_version + ${bump}::int
        WHERE id = ${target.id}
          AND (NOT ${removesAdmin}::boolean
            OR NOT (role = 'admin' AND suspended = false AND email_verified_at IS NOT NULL AND password_hash <> 'disabled')
            OR (SELECT count(*) FROM admins) > 1)
        RETURNING id
      `;
      if (!rows.length) {
        // Nothing matched: the account vanished, or the guard held (a concurrent change left no other active admin).
        if (removesAdmin && await lookupTarget(target.id)) { res.status(409).json(LAST_ADMIN); return; }
        res.status(404).json(NOT_FOUND);
        return;
      }
      res.status(200).json({ organizer: await getSummary(target.id) });
      return;
    }

    if (req.method === 'DELETE') {
      const target = await lookupTarget(req.query && req.query.id);
      if (!target) { res.status(404).json(NOT_FOUND); return; }
      if (target.id === admin.id) {
        res.status(409).json({ error: 'You cannot delete your own account.' });
        return;
      }
      if (isActiveAdmin(target) && await activeAdminCount() <= 1) {
        res.status(409).json(LAST_ADMIN);
        return;
      }
      const summary = await getSummary(target.id);
      if (summary && summary.eventCount > 0) {
        res.status(409).json({ error: HAS_EVENTS, eventCount: summary.eventCount });
        return;
      }
      try {
        const deleted = await sql`
          WITH admins AS MATERIALIZED (
            SELECT id FROM organizers
            WHERE role = 'admin' AND suspended = false AND email_verified_at IS NOT NULL AND password_hash <> 'disabled'
            ORDER BY id FOR UPDATE
          )
          DELETE FROM organizers
          WHERE id = ${target.id}
            AND (NOT (role = 'admin' AND suspended = false AND email_verified_at IS NOT NULL AND password_hash <> 'disabled')
              OR (SELECT count(*) FROM admins) > 1)
          RETURNING id
        `;
        if (!deleted.length && await lookupTarget(target.id)) { res.status(409).json(LAST_ADMIN); return; }
      } catch (e) {
        if (e && e.code === '23503') {
          // An event was created for them after the check above; the database refuses to orphan it.
          const now = await getSummary(target.id);
          res.status(409).json({ error: HAS_EVENTS, eventCount: now ? now.eventCount : 1 });
          return;
        }
        throw e;
      }
      res.status(204).end();
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    res.status(500).json({ error: 'Could not complete that request.' });
  }
};

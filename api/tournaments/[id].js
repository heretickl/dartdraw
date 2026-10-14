const { sql } = require('../_lib/db');
const { requireAuth } = require('../_lib/auth');
const { checkEntryLimit } = require('../_lib/tiers');
const { sanitizeTournamentData, isRouteId } = require('../../tournament-sanitize');

// GET /api/tournaments/:id     -> { id, data, updated_at }
// PUT /api/tournaments/:id     -> body { data, expectedUpdatedAt }, upserts.
//   Creates the row if it doesn't exist yet (expectedUpdatedAt is ignored on
//   insert). If it exists, expectedUpdatedAt must match the stored
//   updated_at or the write is rejected with 409 + the current row, so a
//   stale client never silently clobbers a newer save.
//   A finalized event (stored data.finalized is truthy) is closed: PUT is
//   refused with 403 { error, finalized: true }, whatever the incoming data
//   says. The PUT that first sets `finalized` is on a row that does not have
//   it yet, so it is saved normally. The UPDATE itself is conditional on the
//   stamp that was checked, so a save/finalize landing in between is answered
//   with 409 (or 403 if the row became finalized) instead of being overwritten.
//   After that check, a Basic organiser (see api/_lib/tiers.js) is refused with 403
//   { code: 'entry_limit', limit, error } when the save would hold more active entries
//   than the limit AND more than the stored copy does (insert included). This is the only
//   place tournament rows are created or changed (api/tournaments/index.js is read-only).
// DELETE /api/tournaments/:id
//   Also refused with 403 { error, finalized: true } for a finalized event.
//   Only an Admin can change or remove one, and only after the Admin tab's Reopen. The
//   DELETE statement itself skips finalized rows, so it cannot race a finalize.
// An Admin caller (organizer.role === 'admin') is not scoped to created_by on GET, PUT and DELETE; an update never changes
//   created_by, and a PUT for an unknown id inserts a row owned by the Admin. Every other rule above applies to Admins too.
const FINALIZED_BODY = { error: 'This event is finalized. Only an Admin can change it.', finalized: true };

function isFinalized(data) {
  return !!(data && typeof data === 'object' && data.finalized);
}

module.exports = async (req, res) => {
  const organizer = await requireAuth(req, res);
  if (!organizer) return;

  const { id } = req.query;
  if (!id) { res.status(400).json({ error: 'Missing id.' }); return; }

  // An Admin works on any organiser's event: the same statements without the owner filter, and an update never changes the owner.
  const isAdmin = organizer.role === 'admin';

  if (req.method === 'GET') {
    const rows = isAdmin
      ? await sql`SELECT id, data, updated_at FROM tournaments WHERE id = ${id}`
      : await sql`
        SELECT id, data, updated_at FROM tournaments
        WHERE id = ${id} AND created_by = ${organizer.id}
      `;
    if (!rows.length) { res.status(404).json({ error: 'Not found.' }); return; }
    res.status(200).json(rows[0]);
    return;
  }

  if (req.method === 'DELETE') {
    const found = isAdmin
      ? await sql`SELECT data FROM tournaments WHERE id = ${id}`
      : await sql`SELECT data FROM tournaments WHERE id = ${id} AND created_by = ${organizer.id}`;
    if (found.length && isFinalized(found[0].data)) {
      res.status(403).json(FINALIZED_BODY);
      return;
    }
    // The SQL refuses finalized rows itself, so a finalize landing between the SELECT above and this DELETE still wins.
    // (data->>'finalized' is NULL when absent or JSON null; 'false', '0' and '' are the falsy stored values.)
    const deleted = isAdmin
      ? await sql`
        DELETE FROM tournaments
        WHERE id = ${id}
          AND (data->>'finalized' IS NULL OR data->>'finalized' IN ('false', '0', ''))
        RETURNING id
      `
      : await sql`
        DELETE FROM tournaments
        WHERE id = ${id} AND created_by = ${organizer.id}
          AND (data->>'finalized' IS NULL OR data->>'finalized' IN ('false', '0', ''))
        RETURNING id
      `;
    if (!deleted.length) {
      const again = isAdmin
        ? await sql`SELECT data FROM tournaments WHERE id = ${id}`
        : await sql`SELECT data FROM tournaments WHERE id = ${id} AND created_by = ${organizer.id}`;
      if (again.length && isFinalized(again[0].data)) {
        res.status(403).json(FINALIZED_BODY);
        return;
      }
    }
    res.status(204).end();
    return;
  }

  if (req.method === 'PUT') {
    // The id becomes a primary key and is later put into onclick handlers: plain letters, digits, _ and - only.
    if (!isRouteId(id)) {
      res.status(400).json({ error: 'Invalid tournament id.' });
      return;
    }
    const { data, expectedUpdatedAt } = req.body || {};
    if (!data || typeof data !== 'object') {
      res.status(400).json({ error: 'Missing tournament data.' });
      return;
    }
    // Strip anything that could become script in the organiser app (see tournament-sanitize.js). Strips, never rejects.
    sanitizeTournamentData(data);
    try {
      const existingRows = await sql`SELECT id, data, updated_at, created_by FROM tournaments WHERE id = ${id}`;
      const existing = existingRows[0];

      if (existing && !isAdmin && existing.created_by !== organizer.id) {
        // Belongs to someone else - treat like it doesn't exist.
        res.status(404).json({ error: 'Not found.' });
        return;
      }

      if (existing && isFinalized(existing.data)) {
        res.status(403).json(FINALIZED_BODY);
        return;
      }

      // Basic accounts cannot grow an event past the limit. An event already over it (e.g. after a downgrade) can still be
      // edited and shrunk, just not grown. Checked after the finalized lock, and before any write.
      const over = checkEntryLimit(organizer.tier, data, existing && existing.data);
      if (over) {
        res.status(403).json({ code: 'entry_limit', limit: over.limit, error: 'Basic accounts allow up to ' + over.limit + ' entries per event.' });
        return;
      }

      if (!existing) {
        const inserted = await sql`
          INSERT INTO tournaments (id, data, created_by)
          VALUES (${id}, ${JSON.stringify(data)}::jsonb, ${organizer.id})
          RETURNING id, updated_at
        `;
        res.status(201).json(inserted[0]);
        return;
      }

      const existingIso = new Date(existing.updated_at).toISOString();
      const expectedIso = expectedUpdatedAt ? new Date(expectedUpdatedAt).toISOString() : null;
      if (expectedIso !== existingIso) {
        res.status(409).json({
          error: 'Tournament changed elsewhere.',
          current: { id: existing.id, data: existing.data, updated_at: existing.updated_at }
        });
        return;
      }

      // Conditional on the stamp we just checked (to the millisecond, the precision of the JS value), so a save or a
      // finalize that lands between the SELECT above and this write is not overwritten.
      const updated = isAdmin
        ? await sql`
          UPDATE tournaments SET data = ${JSON.stringify(data)}::jsonb, updated_at = now()
          WHERE id = ${id}
            AND abs(extract(epoch FROM updated_at) - extract(epoch FROM ${existingIso}::timestamptz)) < 0.001
          RETURNING id, updated_at
        `
        : await sql`
          UPDATE tournaments SET data = ${JSON.stringify(data)}::jsonb, updated_at = now()
          WHERE id = ${id} AND created_by = ${organizer.id}
            AND abs(extract(epoch FROM updated_at) - extract(epoch FROM ${existingIso}::timestamptz)) < 0.001
          RETURNING id, updated_at
        `;
      if (!updated.length) {
        const nowRows = isAdmin
          ? await sql`SELECT id, data, updated_at, created_by FROM tournaments WHERE id = ${id}`
          : await sql`SELECT id, data, updated_at, created_by FROM tournaments WHERE id = ${id} AND created_by = ${organizer.id}`;
        const current = nowRows[0];
        if (!current) { res.status(404).json({ error: 'Not found.' }); return; }
        if (isFinalized(current.data)) { res.status(403).json(FINALIZED_BODY); return; }
        res.status(409).json({
          error: 'Tournament changed elsewhere.',
          current: { id: current.id, data: current.data, updated_at: current.updated_at }
        });
        return;
      }
      res.status(200).json(updated[0]);
    } catch (e) {
      res.status(500).json({ error: 'Could not save tournament.' });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};

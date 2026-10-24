const { requireAdmin } = require('../../../_lib/auth');
const { sql } = require('../../../_lib/db');
const { getEventSummary } = require('../../../_lib/adminEvents');
const { bodyObject, transferTarget } = require('../../../_lib/adminOrganizers');

const ACTIONS = ['reopen', 'unpublish', 'unlist', 'transfer', 'delete'];

// Admin only. POST /api/admin/events/:id { action, toOrganizerId? } -> { event } (or { ok: true } for delete)
//   reopen     removes `finalized` (409 when the event is not finalized) and bumps updated_at
//   unpublish  published = false and listed = false, bumps updated_at
//   unlist     listed = false, bumps updated_at
//   transfer   gives this one event to another organiser (same target rules as moving all of an organiser's events);
//              updated_at is not touched
//   delete     removes the event permanently, even a finalized one
// Nothing else in the event's data is changed. A bumped updated_at means the owner's open tab gets the normal
// "updated elsewhere" 409 on its next save instead of overwriting the change.
module.exports = async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    if (req.method !== 'POST') { res.status(405).json({ code: 'method_not_allowed', error: 'Method not allowed' }); return; }

    const id = req.query && req.query.id;
    if (typeof id !== 'string' || !id) { res.status(400).json({ code: 'missing_id', error: 'Missing id.' }); return; }

    const event = await getEventSummary(id);
    if (!event) { res.status(404).json({ code: 'event_not_found', error: 'Event not found.' }); return; }

    const body = bodyObject(req);
    const action = body.action;
    if (typeof action !== 'string' || !ACTIONS.includes(action)) { res.status(400).json({ code: 'unknown_action', error: 'Unknown action.' }); return; }

    let rows;
    if (action === 'reopen') {
      if (!event.finalizedAt) { res.status(409).json({ code: 'not_finalized', error: 'Event is not finalized.' }); return; }
      // The WHERE repeats the finalized test, so an event reopened a moment ago by someone else is a 409, not a second bump.
      rows = await sql`
        UPDATE tournaments SET data = data - 'finalized', updated_at = now()
        WHERE id = ${id}
          AND data->>'finalized' IS NOT NULL AND data->>'finalized' NOT IN ('false', '0', '')
        RETURNING id
      `;
      if (!rows.length) { res.status(409).json({ code: 'not_finalized', error: 'Event is not finalized.' }); return; }
    } else if (action === 'unpublish') {
      rows = await sql`
        UPDATE tournaments SET data = data || '{"published": false, "listed": false}'::jsonb, updated_at = now()
        WHERE id = ${id}
        RETURNING id
      `;
    } else if (action === 'unlist') {
      rows = await sql`
        UPDATE tournaments SET data = data || '{"listed": false}'::jsonb, updated_at = now()
        WHERE id = ${id}
        RETURNING id
      `;
    } else if (action === 'transfer') {
      const target = await transferTarget(res, body.toOrganizerId, event.owner.id);
      if (!target) return;
      try {
        rows = await sql`UPDATE tournaments SET created_by = ${target.id} WHERE id = ${id} RETURNING id`;
      } catch (e) {
        if (e && e.code === '23503') {
          res.status(409).json({ code: 'transfer_target_gone', error: 'That organiser no longer exists. Nothing was moved.' });
          return;
        }
        throw e;
      }
    } else {
      rows = await sql`DELETE FROM tournaments WHERE id = ${id} RETURNING id`;
    }

    // The event vanished between the lookup and the write (someone deleted it).
    if (!rows.length) { res.status(404).json({ code: 'event_not_found', error: 'Event not found.' }); return; }

    if (action === 'delete') { res.status(200).json({ ok: true }); return; }
    const updated = await getEventSummary(id);
    if (!updated) { res.status(404).json({ code: 'event_not_found', error: 'Event not found.' }); return; }
    res.status(200).json({ event: updated });
  } catch (e) {
    res.status(500).json({ code: 'request_failed', error: 'Could not complete that request.' });
  }
};

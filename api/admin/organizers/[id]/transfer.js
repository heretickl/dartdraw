const { requireAdmin } = require('../../../_lib/auth');
const { sql } = require('../../../_lib/db');
const { lookupTarget, transferTarget, bodyObject } = require('../../../_lib/adminOrganizers');

// Admin only. POST /api/admin/organizers/:id/transfer { toOrganizerId } -> { moved }
// Moves every event owned by :id to the target in a single UPDATE of created_by. Nothing else about the events
// changes (finalized stays, updated_at is not touched). The target must exist, not be the Public row, not be
// suspended, and differ from the source.
module.exports = async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

    const source = await lookupTarget(req.query && req.query.id);
    if (!source) { res.status(404).json({ error: 'Organiser not found.' }); return; }

    const target = await transferTarget(res, bodyObject(req).toOrganizerId, source.id);
    if (!target) return;

    let rows;
    try {
      rows = await sql`UPDATE tournaments SET created_by = ${target.id} WHERE created_by = ${source.id} RETURNING id`;
    } catch (e) {
      if (e && e.code === '23503') {
        res.status(409).json({ error: 'That organiser no longer exists. Nothing was moved.' });
        return;
      }
      throw e;
    }
    res.status(200).json({ moved: rows.length });
  } catch (e) {
    res.status(500).json({ error: 'Could not complete that request.' });
  }
};

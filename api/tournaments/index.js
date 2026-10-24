const { sql } = require('../_lib/db');
const { requireAuth } = require('../_lib/auth');

// GET /api/tournaments - list of this organizer's tournaments (for the sidebar).
module.exports = async (req, res) => {
  const organizer = await requireAuth(req, res);
  if (!organizer) return;
  if (req.method !== 'GET') { res.status(405).json({ code: 'method_not_allowed', error: 'Method not allowed' }); return; }

  try {
    const rows = await sql`
      SELECT id, data, updated_at FROM tournaments
      WHERE created_by = ${organizer.id}
      ORDER BY updated_at DESC
    `;
    res.status(200).json(rows);
  } catch (e) {
    res.status(500).json({ code: 'load_list_failed', error: 'Could not load tournaments.' });
  }
};

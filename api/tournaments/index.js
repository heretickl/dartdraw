const { sql } = require('../_lib/db');
const { requireAuth } = require('../_lib/auth');

// GET /api/tournaments - list of this organizer's tournaments (for the sidebar).
module.exports = async (req, res) => {
  const organizer = requireAuth(req, res);
  if (!organizer) return;
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }

  try {
    const rows = await sql`
      SELECT id, data, updated_at FROM tournaments
      WHERE created_by = ${organizer.id}
      ORDER BY updated_at DESC
    `;
    res.status(200).json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Could not load tournaments.' });
  }
};

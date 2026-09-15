const { sql } = require('../_lib/db');
const { requireAuth } = require('../_lib/auth');

// GET /api/tournaments/:id     -> { id, data, updated_at }
// PUT /api/tournaments/:id     -> body { data, expectedUpdatedAt }, upserts.
//   Creates the row if it doesn't exist yet (expectedUpdatedAt is ignored on
//   insert). If it exists, expectedUpdatedAt must match the stored
//   updated_at or the write is rejected with 409 + the current row, so a
//   stale client never silently clobbers a newer save.
// DELETE /api/tournaments/:id
module.exports = async (req, res) => {
  const organizer = requireAuth(req, res);
  if (!organizer) return;

  const { id } = req.query;
  if (!id) { res.status(400).json({ error: 'Missing id.' }); return; }

  if (req.method === 'GET') {
    const rows = await sql`
      SELECT id, data, updated_at FROM tournaments
      WHERE id = ${id} AND created_by = ${organizer.id}
    `;
    if (!rows.length) { res.status(404).json({ error: 'Not found.' }); return; }
    res.status(200).json(rows[0]);
    return;
  }

  if (req.method === 'DELETE') {
    await sql`DELETE FROM tournaments WHERE id = ${id} AND created_by = ${organizer.id}`;
    res.status(204).end();
    return;
  }

  if (req.method === 'PUT') {
    const { data, expectedUpdatedAt } = req.body || {};
    if (!data || typeof data !== 'object') {
      res.status(400).json({ error: 'Missing tournament data.' });
      return;
    }
    try {
      const existingRows = await sql`SELECT id, data, updated_at, created_by FROM tournaments WHERE id = ${id}`;
      const existing = existingRows[0];

      if (existing && existing.created_by !== organizer.id) {
        // Belongs to someone else - treat like it doesn't exist.
        res.status(404).json({ error: 'Not found.' });
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

      const updated = await sql`
        UPDATE tournaments SET data = ${JSON.stringify(data)}::jsonb, updated_at = now()
        WHERE id = ${id} AND created_by = ${organizer.id}
        RETURNING id, updated_at
      `;
      res.status(200).json(updated[0]);
    } catch (e) {
      res.status(500).json({ error: 'Could not save tournament.' });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};

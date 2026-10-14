const { requireAdmin } = require('../../_lib/auth');
const { sql } = require('../../_lib/db');
const { SETTING_LIMITS, getSettings, validateSettings } = require('../../_lib/settings');

// Admin only. The public home page retention numbers.
//   GET /api/admin/settings -> { resultsDays, liveHours, limits }
//   PUT /api/admin/settings { resultsDays, liveHours } -> the same shape. Whole numbers inside the limits, else 400.
module.exports = async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    if (req.method === 'GET') {
      const current = await getSettings();
      res.status(200).json(Object.assign({}, current, { limits: SETTING_LIMITS }));
      return;
    }

    if (req.method === 'PUT') {
      const checked = validateSettings(req.body);
      if (!checked.ok) { res.status(400).json({ error: checked.error }); return; }
      const v = checked.value;
      try {
        await sql`
          INSERT INTO site_settings (key, value, updated_at)
          VALUES ('resultsDays', ${JSON.stringify(v.resultsDays)}::jsonb, now()),
                 ('liveHours', ${JSON.stringify(v.liveHours)}::jsonb, now())
          ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
        `;
      } catch (e) {
        if (e && e.code === '42P01') {
          res.status(500).json({ error: 'The settings table does not exist yet. Run migrations/2026-10-14-admin.sql in Neon, then try again.' });
          return;
        }
        throw e;
      }
      res.status(200).json(Object.assign({}, v, { limits: SETTING_LIMITS }));
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    res.status(500).json({ error: 'Could not complete that request.' });
  }
};

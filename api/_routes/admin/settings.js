const { requireAdmin } = require('../../_lib/auth');
const { sql } = require('../../_lib/db');
const { SETTING_LIMITS, CONTACT_MAX_LENGTH, getSettings, getContactLine, validateSettings } = require('../../_lib/settings');

// Admin only. The public home page retention numbers, and the contact line on the sign-in page.
//   GET /api/admin/settings -> { resultsDays, liveHours, adminContact, limits, contactMaxLength }
//   PUT /api/admin/settings { resultsDays, liveHours[, adminContact] } -> the same shape. Whole numbers inside the limits,
//       and (when sent) plain text of at most contactMaxLength characters, else 400. Leaving adminContact out keeps the stored line.
const shape = (v, adminContact) => Object.assign({}, v, { adminContact, limits: SETTING_LIMITS, contactMaxLength: CONTACT_MAX_LENGTH });

module.exports = async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    if (req.method === 'GET') {
      const current = await getSettings();
      res.status(200).json(shape(current, await getContactLine()));
      return;
    }

    if (req.method === 'PUT') {
      const checked = validateSettings(req.body);
      if (!checked.ok) { res.status(400).json({ error: checked.error }); return; }
      const v = checked.value;
      const withContact = typeof v.adminContact === 'string';
      try {
        if (withContact) {
          await sql`
            INSERT INTO site_settings (key, value, updated_at)
            VALUES ('resultsDays', ${JSON.stringify(v.resultsDays)}::jsonb, now()),
                   ('liveHours', ${JSON.stringify(v.liveHours)}::jsonb, now()),
                   ('adminContact', ${JSON.stringify(v.adminContact)}::jsonb, now())
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
          `;
        } else {
          await sql`
            INSERT INTO site_settings (key, value, updated_at)
            VALUES ('resultsDays', ${JSON.stringify(v.resultsDays)}::jsonb, now()),
                   ('liveHours', ${JSON.stringify(v.liveHours)}::jsonb, now())
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
          `;
        }
      } catch (e) {
        if (e && e.code === '42P01') {
          res.status(500).json({ error: 'The settings table does not exist yet. Run migrations/2026-10-14-admin.sql in Neon, then try again.' });
          return;
        }
        throw e;
      }
      const numbers = { resultsDays: v.resultsDays, liveHours: v.liveHours };
      res.status(200).json(shape(numbers, withContact ? v.adminContact : await getContactLine()));
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    res.status(500).json({ error: 'Could not complete that request.' });
  }
};

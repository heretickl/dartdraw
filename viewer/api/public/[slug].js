const { sql } = require('../_lib/db');
const { toPublicView, SLUG_RE } = require('../_lib/publicView');

// GET /api/public/:slug -> { updatedAt, view }
// Read-only: it answers GET and nothing else, and queries the
// public_tournaments view (see sql/readonly.sql), which only contains
// tournaments the organiser has switched "Publish results" on for. What it
// returns is the allow-listed copy from toPublicView. An unknown slug and an
// unpublished tournament look identical (404), so a slug can't be used to
// probe for tournaments that aren't public.
module.exports = async (req, res) => {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const slug = String(req.query.slug || '');
  if (!SLUG_RE.test(slug)) { res.status(404).json({ error: 'Not found.' }); return; }

  try {
    const rows = await sql`
      SELECT data, updated_at FROM public_tournaments
      WHERE slug = ${slug}
      LIMIT 1
    `;
    if (!rows.length) { res.status(404).json({ error: 'Not found.' }); return; }
    // Short shared cache: many spectators polling cost about one query per window.
    res.setHeader('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=30');
    res.status(200).json({ updatedAt: rows[0].updated_at, view: toPublicView(rows[0].data) });
  } catch (e) {
    res.status(500).json({ error: 'Could not load results.' });
  }
};

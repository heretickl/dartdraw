const { sql } = require('../_lib/db');
const { toPublicView, isLiveEvent, SLUG_RE } = require('../_lib/publicView');
const listView = require('../_lib/listView');

// The live picture of a Live event's matches (the live_public view, see sql/live.sql). Never throws: a view that is not there
// yet (Postgres 42P01, sql/live.sql not run), a database error or anything else means "no live data", and the page still loads.
async function liveRowsOf(slug) {
  try {
    const rows = await sql`
      SELECT pos, state, board, played_on_board, summary FROM live_public
      WHERE slug = ${slug}
    `;
    return Array.isArray(rows) ? rows : [];
  } catch (e) {
    return [];
  }
}

// GET /api/public/:slug -> { updatedAt, view, stages }
// `stages` is the same small per-stage status the home page cards use (see stagesOf); the event page draws its stage cards from it.
// Read-only: it answers GET and nothing else, and queries the
// public_tournaments view (see sql/readonly.sql), which only contains
// tournaments the organiser has switched "Publish results" on for. What it
// returns is the allow-listed copy from toPublicView. An unknown slug and an
// unpublished tournament look identical (404), so a slug can't be used to
// probe for tournaments that aren't public.
// A Live event (scores keyed on tablets) also gets the live picture of its running matches from live_public; a Manual event
// never causes that query.
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
    // No stale-while-revalidate: an unpublished tournament must disappear promptly.
    res.setHeader('Cache-Control', 'public, s-maxage=10');
    let stages = [];
    try { stages = listView.stagesOf(rows[0].data, listView.analyse(rows[0].data)); } catch (e) { stages = []; }   // the page works without them
    const live = isLiveEvent(rows[0].data) ? await liveRowsOf(slug) : [];
    res.status(200).json({ updatedAt: rows[0].updated_at, view: toPublicView(rows[0].data, live), stages });
  } catch (e) {
    res.status(500).json({ error: 'Could not load results.' });
  }
};

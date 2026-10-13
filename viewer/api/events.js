const { sql } = require('./_lib/db');
const { buildList } = require('./_lib/listView');
const cfg = require('./_lib/listConfig');

// GET /api/events -> { generatedAt, live, upcoming, results }
// Read-only: it answers GET and nothing else, and queries the public_tournaments view (see sql/readonly.sql), which only
// holds tournaments the organiser has published. Of those it reads only the ones the organiser also chose to list, and
// only rows that could still appear (saved recently, or dated yesterday or later). What it returns is the allow-listed
// summary from listView.js; scores, players and notes are never part of it.
// The query builds a small JSON object in SQL holding only the top-level keys listView.js reads (none of the large
// images or plans), so a cache miss does not pull whole tournaments out of the database. If listView.js starts reading
// another key, add it to that object. (In WHERE, `data` is still the table column; the alias only names the output.)
const DAY = 86400000;

module.exports = async (req, res) => {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
  try {
    const now = Date.now();
    const yesterday = new Date(now - cfg.UPCOMING_GRACE_DAYS * DAY).toISOString().slice(0, 10);
    const since = new Date(now - cfg.QUERY_DAYS * DAY).toISOString();
    const rows = await sql`
      SELECT slug, updated_at, jsonb_build_object(
          'listed', data->'listed',
          'eventCreation', data->'eventCreation',
          'format', jsonb_build_object('formatType', data->'format'->'formatType', 'anticipatedStartTime', data->'format'->'anticipatedStartTime'),
          'entriesList', data->'entriesList', 'groups', data->'groups', 'pods', data->'pods', 'knockout', data->'knockout',
          'finalized', jsonb_build_object('at', data->'finalized'->'at')
        ) AS data
      FROM public_tournaments
      WHERE data->>'listed' = 'true'
        AND (updated_at > ${since}::timestamptz OR data->'eventCreation'->>'date' >= ${yesterday})
      ORDER BY updated_at DESC
      LIMIT ${cfg.MAX_ROWS}
    `;
    // Short shared cache: many visitors cost about one query per window.
    // No stale-while-revalidate: an event that is unpublished or unlisted must disappear promptly.
    res.setHeader('Cache-Control', 'public, s-maxage=30');
    res.status(200).json(buildList(rows, now));
  } catch (e) {
    res.status(500).json({ error: 'Could not load events.' });
  }
};

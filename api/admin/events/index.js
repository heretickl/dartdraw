const { requireAdmin } = require('../../_lib/auth');
const { parseListQuery, listEvents } = require('../../_lib/adminEvents');

// Admin only. GET /api/admin/events?q=&owner=&limit=&offset=
//   -> { events: [{ id, tournamentName, eventName, owner: { id, name, email }, format, date, published, listed,
//                   finalizedAt, updatedAt }], total }
// Every organiser's events, newest saved first. q matches tournament name, event name, owner name or owner email
// (case-insensitive, literal text); owner is an organiser id. limit defaults to 50 (1-100). Only those fields are read
// from the database, never the whole event.
module.exports = async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
    res.status(200).json(await listEvents(parseListQuery(req.query)));
  } catch (e) {
    res.status(500).json({ error: 'Could not load events.' });
  }
};

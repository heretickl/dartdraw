const { requireAuth } = require('../../_lib/auth');
const { listPlayers } = require('../../_lib/players');
const { sendError, methodNotAllowed } = require('./common');

// GET /api/players/list -> { players: [{ id, name, club, createdAt, eventsPlayed, lastPlayed }] } (this organiser's own)
module.exports = async (req, res) => {
  const organizer = await requireAuth(req, res);
  if (!organizer) return;
  if (req.method !== 'GET') { methodNotAllowed(res); return; }
  try {
    res.status(200).json({ players: await listPlayers(organizer.id) });
  } catch (e) { sendError(res, e); }
};

const { requireAuth } = require('../../_lib/auth');
const { ensurePlayers } = require('../../_lib/players');
const { bodyObject, sendError, methodNotAllowed } = require('./common');

// POST /api/players/ensure { players: [{ name, club }] } (1..200) -> { players: [{ id, name, club, created }] }
//   Same order as sent. A name and club already in the library is returned as it is (created: false).
module.exports = async (req, res) => {
  const organizer = await requireAuth(req, res);
  if (!organizer) return;
  if (req.method !== 'POST') { methodNotAllowed(res); return; }
  try {
    res.status(200).json({ players: await ensurePlayers(organizer.id, bodyObject(req).players) });
  } catch (e) { sendError(res, e); }
};

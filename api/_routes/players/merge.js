const { requireAuth } = require('../../_lib/auth');
const { mergePlayers } = require('../../_lib/players');
const { bodyObject, sendError, methodNotAllowed } = require('./common');

// POST /api/players/merge { keepId, ids: [...], name, club } -> { player }. The others are folded into keepId.
module.exports = async (req, res) => {
  const organizer = await requireAuth(req, res);
  if (!organizer) return;
  if (req.method !== 'POST') { methodNotAllowed(res); return; }
  try {
    const b = bodyObject(req);
    res.status(200).json({ player: await mergePlayers(organizer.id, b.keepId, b.ids, b) });
  } catch (e) { sendError(res, e); }
};

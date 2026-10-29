const { requireAuth } = require('../../_lib/auth');
const { updatePlayer, LibraryError } = require('../../_lib/players');
const { bodyObject, sendError, methodNotAllowed } = require('./common');

// POST /api/players/update { id, name, club } -> { player }. Past events keep the names they used.
module.exports = async (req, res) => {
  const organizer = await requireAuth(req, res);
  if (!organizer) return;
  if (req.method !== 'POST') { methodNotAllowed(res); return; }
  try {
    const b = bodyObject(req);
    const player = await updatePlayer(organizer.id, b.id, b);
    if (!player) throw new LibraryError('not_found');
    res.status(200).json({ player });
  } catch (e) { sendError(res, e); }
};

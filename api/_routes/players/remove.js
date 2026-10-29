const { requireAuth } = require('../../_lib/auth');
const { removePlayer, LibraryError } = require('../../_lib/players');
const { bodyObject, sendError, methodNotAllowed } = require('./common');

// POST /api/players/remove { id } -> { ok: true }. From the library only: past events keep showing the player.
module.exports = async (req, res) => {
  const organizer = await requireAuth(req, res);
  if (!organizer) return;
  if (req.method !== 'POST') { methodNotAllowed(res); return; }
  try {
    if (!(await removePlayer(organizer.id, bodyObject(req).id))) throw new LibraryError('not_found');
    res.status(200).json({ ok: true });
  } catch (e) { sendError(res, e); }
};

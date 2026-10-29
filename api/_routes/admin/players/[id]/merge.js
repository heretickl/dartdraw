const { requireAdmin } = require('../../../../_lib/auth');
const { playerOwner, mergePlayers, LibraryError } = require('../../../../_lib/players');
const { bodyObject, sendError, methodNotAllowed } = require('../../../players/common');

// Admin only.
// POST /api/admin/players/:id/merge { ids: [...], name, club } -> { player }
//   Folds ids into :id, within the organiser :id belongs to: an id of another organiser's player is a 404 and nothing changes.
module.exports = async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  if (req.method !== 'POST') { methodNotAllowed(res); return; }
  try {
    const id = String((req.query || {}).id || '');
    const owner = await playerOwner(id);
    if (!owner) throw new LibraryError('not_found');
    const b = bodyObject(req);
    res.status(200).json({ player: await mergePlayers(owner, id, b.ids, b) });
  } catch (e) { sendError(res, e); }
};

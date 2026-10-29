const { requireAdmin } = require('../../../_lib/auth');
const { playerOwner, updatePlayer, removePlayer, LibraryError } = require('../../../_lib/players');
const { bodyObject, sendError, methodNotAllowed } = require('../../players/common');

// Admin only. Acts on behalf of the organiser the player belongs to.
// PATCH  /api/admin/players/:id { name, club } -> { player }
// DELETE /api/admin/players/:id -> { ok: true }   (from the library only; past events keep showing the player)
module.exports = async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  try {
    if (req.method !== 'PATCH' && req.method !== 'DELETE') { methodNotAllowed(res); return; }
    const id = String((req.query || {}).id || '');
    const owner = await playerOwner(id);
    if (!owner) throw new LibraryError('not_found');
    if (req.method === 'PATCH') {
      const player = await updatePlayer(owner, id, bodyObject(req));
      if (!player) throw new LibraryError('not_found');
      res.status(200).json({ player });
      return;
    }
    if (!(await removePlayer(owner, id))) throw new LibraryError('not_found');
    res.status(200).json({ ok: true });
  } catch (e) { sendError(res, e); }
};

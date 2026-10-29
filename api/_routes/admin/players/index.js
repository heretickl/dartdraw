const { requireAdmin } = require('../../../_lib/auth');
const { adminListPlayers, ensurePlayers, UUID_RE, LibraryError } = require('../../../_lib/players');
const { findById } = require('../../../_lib/accounts');
const { bodyObject, sendError, methodNotAllowed } = require('../../players/common');

// Admin only.
// GET  /api/admin/players?q=&owner=&limit=&offset= -> { players: [{ id, name, club, eventsPlayed, lastPlayed, owner }], total }
//   Every organiser's players; q searches player name or club, owner filters by organiser id; 50 a page (at most 100).
// POST /api/admin/players { organizerId, name, club } -> 201 { player } (added to that organiser's library;
//   created: false when the same name and club was already there).
module.exports = async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  try {
    if (req.method === 'GET') {
      const q = req.query || {};
      res.status(200).json(await adminListPlayers({ q: q.q, owner: q.owner, limit: q.limit, offset: q.offset }));
      return;
    }
    if (req.method === 'POST') {
      const b = bodyObject(req);
      const orgId = typeof b.organizerId === 'string' && UUID_RE.test(b.organizerId) ? b.organizerId : null;
      if (!orgId || !(await findById(orgId))) {
        res.status(404).json({ code: 'organiser_not_found', error: 'Organiser not found.' });
        return;
      }
      const [player] = await ensurePlayers(orgId, [{ name: b.name, club: b.club }]);
      res.status(201).json({ player });
      return;
    }
    methodNotAllowed(res);
  } catch (e) {
    if (!(e instanceof LibraryError)) { res.status(500).json({ code: 'request_failed', error: 'Could not complete that request.' }); return; }
    sendError(res, e);
  }
};

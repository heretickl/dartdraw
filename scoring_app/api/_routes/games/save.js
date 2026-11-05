const { requirePlayer } = require('../../_lib/session');
const { saveGame } = require('../../_lib/games');

// POST { id, format, events, playedAt, sideA: { me: true }, sideB: { friendshipId } | { guest: name } }: saves a
// finished casual game to the caller's account (side A is always the caller). The winner and the stats come from
// replaying the events here, never from the request. Saving the same id again answers the same and writes nothing.
// 200 { saved: { me: 'saved', friend: 'saved'|'held'|'none'|null } }.
module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ code: 'method_not_allowed', error: 'Method not allowed' }); return; }

  const row = await requirePlayer(req, res);
  if (!row) return;

  try {
    const out = await saveGame(row, req.body, Date.now());
    if (out.code) { res.status(out.status).json({ code: out.code, error: out.error }); return; }
    res.status(out.status).json(out.body);
  } catch (e) {
    res.status(500).json({ code: 'save_failed', error: 'Could not save this game.' });
  }
};

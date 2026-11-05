const { requirePlayer } = require('../../_lib/session');
const { oneGame } = require('../../_lib/games');

// GET ?id=: one game the caller played in, with their stats and the opponent's when the opponent is a linked friend
// or a guest. 404 not_found for a game the caller was not in, so ids of other players' games say nothing.
module.exports = async (req, res) => {
  if (req.method !== 'GET') { res.status(405).json({ code: 'method_not_allowed', error: 'Method not allowed' }); return; }

  const row = await requirePlayer(req, res);
  if (!row) return;

  try {
    const out = await oneGame(row, req.query);
    if (out.code) { res.status(out.status).json({ code: out.code, error: out.error }); return; }
    res.status(out.status).json(out.body);
  } catch (e) {
    res.status(500).json({ code: 'game_failed', error: 'Could not load this game.' });
  }
};

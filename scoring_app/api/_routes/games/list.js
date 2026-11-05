const { requirePlayer } = require('../../_lib/session');
const { listGames } = require('../../_lib/games');

// GET ?limit=&before=: the caller's saved games, newest first (20 a page, at most 50), each with the opponent, the
// score in legs, the game and its headline number. 200 { games, nextBefore } - nextBefore is null on the last page.
module.exports = async (req, res) => {
  if (req.method !== 'GET') { res.status(405).json({ code: 'method_not_allowed', error: 'Method not allowed' }); return; }

  const row = await requirePlayer(req, res);
  if (!row) return;

  try {
    const out = await listGames(row, req.query);
    if (out.code) { res.status(out.status).json({ code: out.code, error: out.error }); return; }
    res.status(out.status).json(out.body);
  } catch (e) {
    res.status(500).json({ code: 'list_failed', error: 'Could not load your games.' });
  }
};

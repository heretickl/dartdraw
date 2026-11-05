const { requirePlayer } = require('../../_lib/session');
const friends = require('../../_lib/friends');

// POST { friendshipId } (the request's entry): both become linked and the held games are saved. 200 { friend };
// 404 not_found when the request is no longer open.
module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ code: 'method_not_allowed', error: 'Method not allowed' }); return; }

  const row = await requirePlayer(req, res);
  if (!row) return;

  try {
    friends.reply(res, await friends.accept(row, req.body, Date.now()));
  } catch (e) {
    res.status(500).json({ code: 'friends_failed', error: 'Could not update your friends. Try again.' });
  }
};

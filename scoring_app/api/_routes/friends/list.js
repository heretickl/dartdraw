const { requirePlayer } = require('../../_lib/session');
const friends = require('../../_lib/friends');

// GET: the caller's friends (badge, names, games together, head-to-head, last results, comparison) and the
// requests sent to them. 200 { friends, requests }.
module.exports = async (req, res) => {
  if (req.method !== 'GET') { res.status(405).json({ code: 'method_not_allowed', error: 'Method not allowed' }); return; }

  const row = await requirePlayer(req, res);
  if (!row) return;

  try {
    friends.reply(res, await friends.list(row, Date.now()));
  } catch (e) {
    res.status(500).json({ code: 'friends_failed', error: 'Could not update your friends. Try again.' });
  }
};

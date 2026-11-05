const { requirePlayer } = require('../../_lib/session');
const friends = require('../../_lib/friends');

// POST { friendshipId }: takes back a request the caller sent; the entry stays as a no-account one. 200 { friend }.
module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ code: 'method_not_allowed', error: 'Method not allowed' }); return; }

  const row = await requirePlayer(req, res);
  if (!row) return;

  try {
    friends.reply(res, await friends.cancel(row, req.body, Date.now()));
  } catch (e) {
    res.status(500).json({ code: 'friends_failed', error: 'Could not update your friends. Try again.' });
  }
};

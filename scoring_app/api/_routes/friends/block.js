const { requirePlayer } = require('../../_lib/session');
const friends = require('../../_lib/friends');

// POST { friendshipId } (an entry or a request sent to the caller): removes and blocks further requests both ways.
// 200 { ok: true }.
module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ code: 'method_not_allowed', error: 'Method not allowed' }); return; }

  const row = await requirePlayer(req, res);
  if (!row) return;

  try {
    friends.reply(res, await friends.block(row, req.body, Date.now()));
  } catch (e) {
    res.status(500).json({ code: 'friends_failed', error: 'Could not update your friends. Try again.' });
  }
};

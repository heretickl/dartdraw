const { requirePlayer } = require('../../_lib/session');
const friends = require('../../_lib/friends');

// POST { friendshipId }: asks again, at most once every 7 days. 200 { friend, nextAt }; 409 too_soon { nextAt }.
module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ code: 'method_not_allowed', error: 'Method not allowed' }); return; }

  const row = await requirePlayer(req, res);
  if (!row) return;

  try {
    friends.reply(res, await friends.resend(row, req.body, Date.now()));
  } catch (e) {
    res.status(500).json({ code: 'friends_failed', error: 'Could not update your friends. Try again.' });
  }
};

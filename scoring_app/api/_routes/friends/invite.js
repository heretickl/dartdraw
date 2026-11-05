const { requirePlayer } = require('../../_lib/session');
const friends = require('../../_lib/friends');

// POST { friendshipId, lang? }: an "Invite to DartDraw" email to a no-account entry, at most once every 7 days.
// 200 { sent, nextAt }; 409 too_soon { nextAt }; 503 mail_failed.
module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ code: 'method_not_allowed', error: 'Method not allowed' }); return; }

  const row = await requirePlayer(req, res);
  if (!row) return;

  try {
    friends.reply(res, await friends.invite(req, row, req.body, Date.now()));
  } catch (e) {
    res.status(500).json({ code: 'friends_failed', error: 'Could not update your friends. Try again.' });
  }
};

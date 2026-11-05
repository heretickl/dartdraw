const { requirePlayer } = require('../../_lib/session');
const friends = require('../../_lib/friends');

// POST { email }: whether that email belongs to someone the caller can send a friend request to.
// 200 { account: true, firstName, lastName } | { account: false } (also for the caller's own email, a blocked pair and
// an unconfirmed sign-up). 30 answers per player per hour, shared with add and update, then 429 too_many.
module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ code: 'method_not_allowed', error: 'Method not allowed' }); return; }

  const row = await requirePlayer(req, res);
  if (!row) return;

  try {
    friends.reply(res, await friends.check(row, req.body, Date.now()));
  } catch (e) {
    res.status(500).json({ code: 'friends_failed', error: 'Could not update your friends. Try again.' });
  }
};

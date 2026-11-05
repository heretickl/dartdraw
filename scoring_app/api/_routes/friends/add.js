const { requirePlayer } = require('../../_lib/session');
const friends = require('../../_lib/friends');

// POST { email, firstName, lastName, nickname, mergeFrom? }: adds an entry to the caller's friends list (a request
// when the email belongs to someone they can ask, else a no-account entry). 200 { friend }; 409 already_friends.
module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ code: 'method_not_allowed', error: 'Method not allowed' }); return; }

  const row = await requirePlayer(req, res);
  if (!row) return;

  try {
    friends.reply(res, await friends.add(row, req.body, Date.now()));
  } catch (e) {
    res.status(500).json({ code: 'friends_failed', error: 'Could not update your friends. Try again.' });
  }
};

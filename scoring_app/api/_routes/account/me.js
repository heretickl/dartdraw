const { requirePlayer } = require('../../_lib/session');
const { toPublic } = require('../../_lib/players');

// GET: who is signed in. Lets a must-change-password account through, so the page can see mustChange and ask for a
// new password.
module.exports = async (req, res) => {
  if (req.method !== 'GET') { res.status(405).json({ code: 'method_not_allowed', error: 'Method not allowed' }); return; }
  const row = await requirePlayer(req, res, { allowMustChange: true });
  if (!row) return;
  res.status(200).json({ player: toPublic(row) });
};

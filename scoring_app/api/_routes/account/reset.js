const bcrypt = require('bcryptjs');
const { BCRYPT_COST, setPassword } = require('../../_lib/players');
const { consumeToken } = require('../../_lib/ptokens');
const { INVALID_LINK, checkNewPassword } = require('../../_lib/pflow');

// POST { token, password }: sets a new password from a reset link. setPassword also confirms the email (the link proved
// ownership), clears must_change_password and bumps token_version, so every earlier session stops working. No
// automatic sign-in: the player logs in with the new password.
module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ code: 'method_not_allowed', error: 'Method not allowed' }); return; }

  const { token, password } = req.body || {};
  const bad = checkNewPassword(password);
  if (bad) { res.status(400).json(bad); return; }

  try {
    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    const consumed = await consumeToken(token, ['reset']);
    if (!consumed) {
      res.status(400).json({ code: 'invalid_link', error: INVALID_LINK });
      return;
    }
    const tv = await setPassword(consumed.playerId, passwordHash);
    if (tv == null) {
      res.status(400).json({ code: 'invalid_link', error: INVALID_LINK });
      return;
    }
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ code: 'reset_failed', error: 'Could not reset your password.' });
  }
};

const bcrypt = require('bcryptjs');
const { sql } = require('../../_lib/db');
const { consumeToken } = require('../../_lib/tokens');
const { BCRYPT_COST } = require('../../_lib/accounts');
const { INVALID_LINK, MIN_PASSWORD } = require('../../_lib/authflow');

// POST { token, password }: sets a new password using a reset or invite link.
// Also marks the email verified (the link proved ownership) and bumps
// token_version so every earlier session stops working. A suspended account
// changes nothing and gets the same answer as a bad link.
module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ code: 'method_not_allowed', error: 'Method not allowed' }); return; }

  const { token, password } = req.body || {};
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
    res.status(400).json({ code: 'password_too_short', error: 'Password must be at least ' + MIN_PASSWORD + ' characters.' });
    return;
  }

  try {
    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    const consumed = await consumeToken(token, ['reset', 'invite']);
    if (!consumed) {
      res.status(400).json({ code: 'invalid_link', error: INVALID_LINK });
      return;
    }
    const rows = await sql`
      UPDATE organizers SET password_hash = ${passwordHash},
        email_verified_at = COALESCE(email_verified_at, now()),
        token_version = token_version + 1
      WHERE id = ${consumed.organizerId} AND suspended = false
      RETURNING id
    `;
    if (!rows.length) {
      res.status(400).json({ code: 'invalid_link', error: INVALID_LINK });
      return;
    }
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ code: 'reset_failed', error: 'Could not reset your password.' });
  }
};

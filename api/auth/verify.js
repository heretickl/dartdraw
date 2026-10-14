const bcrypt = require('bcryptjs');
const { sql } = require('../_lib/db');
const { findById, DUMMY_HASH } = require('../_lib/accounts');
const { peekToken, consumeToken } = require('../_lib/tokens');
const { VERIFY_FAILED, TOO_MANY, verifyThrottled } = require('../_lib/authflow');

// POST { token, password }: marks the email verified. No automatic sign-in.
//
// The password chosen at sign-up is required, so that only the person who knows
// it (not just whoever can open the emailed link, or a stranger who signed up
// with someone else's address) can finish verification. It is checked against
// the stored hash BEFORE the token is consumed, so a wrong password neither
// verifies nor spends the link; the consume itself is still one atomic
// statement, so concurrent requests cannot double-spend a link.
//
// Every failure (unknown / expired / used token, wrong or missing password)
// gets the same 400, and every attempt that gets past the rate limit pays for
// exactly one bcrypt comparison, so neither the message nor the time says which
// part was wrong.
module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const body = req.body || {};
  const token = body.token;
  const password = typeof body.password === 'string' ? body.password : '';

  try {
    if (await verifyThrottled(req)) {
      res.status(429).json({ error: TOO_MANY });
      return;
    }

    const peeked = await peekToken(token, ['verify']);
    const account = peeked ? await findById(peeked.organizerId) : null;
    const realHash = account && account.password_hash && account.password_hash !== 'disabled'
      ? account.password_hash : null;
    const matched = await bcrypt.compare(password, realHash || DUMMY_HASH);
    if (!(realHash && matched && password)) {
      res.status(400).json({ error: VERIFY_FAILED });
      return;
    }

    const consumed = await consumeToken(token, ['verify']);
    if (!consumed || consumed.organizerId !== account.id) {
      res.status(400).json({ error: VERIFY_FAILED });
      return;
    }
    await sql`UPDATE organizers SET email_verified_at = now() WHERE id = ${consumed.organizerId} AND email_verified_at IS NULL`;
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Could not verify your email.' });
  }
};

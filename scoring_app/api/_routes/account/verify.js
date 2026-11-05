const bcrypt = require('bcryptjs');
const { signPlayer, setPlayerCookie } = require('../../_lib/session');
const { confirm, findById, toPublic, DUMMY_HASH } = require('../../_lib/players');
const { peekToken, consumeToken } = require('../../_lib/ptokens');
const { VERIFY_FAILED, TOO_MANY, verifyThrottled } = require('../../_lib/pflow');

// POST { token, password }: confirms the player's email from the e-mailed link and signs them in.
// Same pattern as the organiser app's api/_routes/auth/verify.js.
//
// The account's current password is required, so that only the person who knows it (not just whoever can open the
// link) can finish confirming. Without it, someone who signs up again with another person's address (replacing the
// password) would get a confirmed account on that address as soon as the real owner clicked the newest link. The
// password is checked BEFORE the token is consumed, so a wrong password neither confirms nor spends the link; the
// consume itself is one atomic statement, so concurrent requests cannot double-spend it.
//
// Every failure (unknown / expired / used token, wrong or missing password) gets the same 400, and every attempt that
// gets past the rate limit pays for exactly one bcrypt compare, so neither the message nor the time says which part
// was wrong.
module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ code: 'method_not_allowed', error: 'Method not allowed' }); return; }

  const body = req.body || {};
  const token = body.token;
  const password = typeof body.password === 'string' ? body.password : '';

  try {
    if (await verifyThrottled(req)) {
      res.status(429).json({ code: 'rate_limited', error: TOO_MANY });
      return;
    }

    const peeked = await peekToken(token, ['verify']);
    const account = peeked ? await findById(peeked.playerId) : null;
    const realHash = account && account.password_hash ? account.password_hash : null;
    const matched = await bcrypt.compare(password, realHash || DUMMY_HASH);
    if (!(realHash && matched && password)) {
      res.status(400).json({ code: 'invalid_link_or_password', error: VERIFY_FAILED });
      return;
    }

    const consumed = await consumeToken(token, ['verify']);
    if (!consumed || consumed.playerId !== account.id) {
      res.status(400).json({ code: 'invalid_link_or_password', error: VERIFY_FAILED });
      return;
    }
    await confirm(consumed.playerId);

    // Sign in straight away (the password was just checked), from the row as it now stands.
    const row = await findById(consumed.playerId);
    if (!row || !row.email_verified_at) {
      res.status(400).json({ code: 'invalid_link_or_password', error: VERIFY_FAILED });
      return;
    }
    setPlayerCookie(res, signPlayer(row));
    res.status(200).json({ ok: true, player: toPublic(row) });
  } catch (e) {
    res.status(500).json({ code: 'verify_failed', error: 'Could not confirm your email.' });
  }
};

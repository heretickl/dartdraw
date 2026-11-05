const bcrypt = require('bcryptjs');
const { isMailConfigured } = require('../../_lib/mail');
const { BCRYPT_COST, normalizeEmail, findByEmail, createPlayer, replaceUnconfirmed } = require('../../_lib/players');
const {
  REGISTER_MESSAGE, TOO_MANY,
  isValidEmail, checkNames, checkNewPassword, throttled, minResponseMs, padTo, sendVerifyEmail
} = require('../../_lib/pflow');

// POST { email, password, firstName, lastName, lang }: player sign-up. Same pattern as the organiser app's
// api/_routes/auth/register.js. Every well-formed request gets the same answer, in the same minimum time, whether or
// not the email already has an account:
//   new email          -> create an unconfirmed account, send a confirm link
//   unconfirmed email  -> the new names and password replace the stored ones (so a stranger's earlier sign-up with
//                         this address is wiped), a fresh link is sent, older links die
//   confirmed email    -> nothing changes and nothing is sent
// Closed (403) while e-mail is not set up, since nobody could confirm their address.
module.exports = async (req, res) => {
  const startedAt = Date.now();
  if (req.method !== 'POST') { res.status(405).json({ code: 'method_not_allowed', error: 'Method not allowed' }); return; }

  if (!isMailConfigured()) {
    res.status(403).json({ code: 'signup_closed', error: 'Sign-up is not open yet.' });
    return;
  }

  const body = req.body || {};
  const email = normalizeEmail(typeof body.email === 'string' ? body.email : '');
  const names = checkNames(body);
  if (names.code) { res.status(names.status).json({ code: names.code, error: names.error }); return; }
  if (!isValidEmail(email)) {
    res.status(400).json({ code: 'invalid_email', error: 'Please enter a valid email address.' });
    return;
  }
  const bad = checkNewPassword(body.password);
  if (bad) { res.status(400).json(bad); return; }

  let status = 200;
  let result = { ok: true, message: REGISTER_MESSAGE };
  try {
    if (await throttled('register', req, email)) {
      res.status(429).json({ code: 'rate_limited', error: TOO_MANY });
      return;
    }

    // Hash for every request so that known and unknown emails cost the same.
    const passwordHash = await bcrypt.hash(body.password, BCRYPT_COST);

    let existing = await findByEmail(email);
    if (!existing) {
      try {
        const created = await createPlayer({
          email, passwordHash, firstName: names.firstName, lastName: names.lastName, verified: false, mustChange: false
        });
        await sendVerifyEmail(req, created.id, email, body.lang);
      } catch (e) {
        // Someone created this email between our lookup and the insert: carry on as for an existing account.
        if (!e || e.code !== '23505') throw e;
        existing = await findByEmail(email);
      }
    }
    if (existing && !existing.email_verified_at) {
      if (await replaceUnconfirmed(existing.id, { passwordHash, firstName: names.firstName, lastName: names.lastName })) {
        await sendVerifyEmail(req, existing.id, email, body.lang);
      }
    }
  } catch (e) {
    // Logged so a failed sign-up can be traced in the Vercel logs; the player still sees the plain message.
    console.error('[register] failed:', e && (e.code || ''), e && e.message);
    status = 500;
    result = { code: 'register_failed', error: 'Could not create account.' };
  }
  await padTo(startedAt, minResponseMs());
  res.status(status).json(result);
};

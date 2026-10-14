const bcrypt = require('bcryptjs');
const { isMailConfigured } = require('../../_lib/mail');
const { BCRYPT_COST, normalizeEmail, findByEmail, createOrganizer, replaceUnverifiedCredentials } = require('../../_lib/accounts');
const {
  REGISTER_MESSAGE, TOO_MANY, MIN_PASSWORD,
  isValidEmail, throttled, minResponseMs, padTo, canMail, sendVerifyEmail, sendAlreadyRegisteredEmail
} = require('../../_lib/authflow');

// Open sign-up. Closed (403) unless SIGNUP_OPEN=true and email is configured.
// Every well-formed request gets the same answer, in the same minimum time,
// whether or not the email already has an account; what differs is only which
// email is sent.
//   new email         -> create an unverified account, send a verify link
//   unverified email  -> the new name and password replace the stored ones
//                        (so a stranger's earlier pre-registration is wiped),
//                        a fresh verify link is sent, older links die
//   verified email    -> "you already have an account" mail; nothing changes
module.exports = async (req, res) => {
  const startedAt = Date.now();
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  if (process.env.SIGNUP_OPEN !== 'true' || !isMailConfigured()) {
    res.status(403).json({ error: 'Sign-up is not open yet.' });
    return;
  }

  const body = req.body || {};
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = normalizeEmail(typeof body.email === 'string' ? body.email : '');
  const password = body.password;
  if (typeof body.name !== 'string' || !name) {
    res.status(400).json({ error: 'Please enter your name.' });
    return;
  }
  if (name.length > 80) {
    res.status(400).json({ error: 'Name must be 80 characters or fewer.' });
    return;
  }
  if (!isValidEmail(email)) {
    res.status(400).json({ error: 'Please enter a valid email address.' });
    return;
  }
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
    res.status(400).json({ error: 'Password must be at least ' + MIN_PASSWORD + ' characters.' });
    return;
  }

  let status = 200;
  let result = { ok: true, message: REGISTER_MESSAGE };
  try {
    if (await throttled('register', req, email)) {
      res.status(429).json({ error: TOO_MANY });
      return;
    }

    // Hash for every request so that known and unknown emails cost the same.
    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

    let existing = await findByEmail(email);
    if (!existing) {
      try {
        const created = await createOrganizer({ email, name, passwordHash, role: 'organizer', tier: 'basic', verified: false });
        await sendVerifyEmail(req, created.id, email);
      } catch (e) {
        // Someone created this email between our lookup and the insert: carry on as for an existing account.
        if (!e || e.code !== '23505') throw e;
        existing = await findByEmail(email);
      }
    }
    if (existing && canMail(existing)) {
      if (existing.email_verified_at) {
        await sendAlreadyRegisteredEmail(req, email);
      } else if (await replaceUnverifiedCredentials(existing.id, name, passwordHash)) {
        await sendVerifyEmail(req, existing.id, email);
      }
    }
  } catch (e) {
    status = 500;
    result = { error: 'Could not create account.' };
  }
  await padTo(startedAt, minResponseMs());
  res.status(status).json(result);
};

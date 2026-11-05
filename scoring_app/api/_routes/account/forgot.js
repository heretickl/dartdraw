const { normalizeEmail, findByEmail } = require('../../_lib/players');
const {
  FORGOT_MESSAGE, TOO_MANY,
  isValidEmail, throttled, minResponseMs, padTo, sendResetEmail
} = require('../../_lib/pflow');

// POST { email, lang }: e-mails a password-reset link if a player account exists for the email. Always the same
// generic answer, after the same minimum time. The greeting uses the stored first name only once the address is
// confirmed (before that, the name was typed by whoever signed up).
module.exports = async (req, res) => {
  const startedAt = Date.now();
  if (req.method !== 'POST') { res.status(405).json({ code: 'method_not_allowed', error: 'Method not allowed' }); return; }

  const body = req.body || {};
  const email = normalizeEmail(typeof body.email === 'string' ? body.email : '');
  if (!isValidEmail(email)) {
    res.status(400).json({ code: 'invalid_email', error: 'Please enter a valid email address.' });
    return;
  }

  let status = 200;
  let result = { ok: true, message: FORGOT_MESSAGE };
  try {
    if (await throttled('forgot', req, email)) {
      res.status(429).json({ code: 'rate_limited', error: TOO_MANY });
      return;
    }
    const account = await findByEmail(email);
    if (account) {
      await sendResetEmail(req, account.id, email, body.lang, account.email_verified_at ? account.first_name : '');
    }
  } catch (e) {
    status = 500;
    result = { code: 'mail_failed', error: 'Could not send the email.' };
  }
  await padTo(startedAt, minResponseMs());
  res.status(status).json(result);
};

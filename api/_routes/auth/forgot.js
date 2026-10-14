const { normalizeEmail, findByEmail } = require('../../_lib/accounts');
const {
  FORGOT_MESSAGE, TOO_MANY,
  isValidEmail, throttled, minResponseMs, padTo, canMail, sendResetEmail
} = require('../../_lib/authflow');

// POST { email }: emails a password-reset link if the account exists, is not
// suspended and has a real password. Always the same generic answer, after the
// same minimum time.
module.exports = async (req, res) => {
  const startedAt = Date.now();
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const body = req.body || {};
  const email = normalizeEmail(typeof body.email === 'string' ? body.email : '');
  if (!isValidEmail(email)) {
    res.status(400).json({ error: 'Please enter a valid email address.' });
    return;
  }

  let status = 200;
  let result = { ok: true, message: FORGOT_MESSAGE };
  try {
    if (await throttled('forgot', req, email)) {
      res.status(429).json({ error: TOO_MANY });
      return;
    }
    const account = await findByEmail(email);
    if (account && canMail(account)) {
      await sendResetEmail(req, account.id, email);
    }
  } catch (e) {
    status = 500;
    result = { error: 'Could not send the email.' };
  }
  await padTo(startedAt, minResponseMs());
  res.status(status).json(result);
};

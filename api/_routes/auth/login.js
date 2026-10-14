const bcrypt = require('bcryptjs');
const { signSession, setSessionCookie } = require('../../_lib/auth');
const { normalizeEmail, findByEmail, toSessionUser, DUMMY_HASH } = require('../../_lib/accounts');
const { clientIp, hit, clear } = require('../../_lib/throttle');

const WINDOW_MS = 15 * 60 * 1000;
const EMAIL_LIMIT = 10;
const IP_LIMIT = 40;

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const { email, password } = req.body || {};
  if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  const normalizedEmail = normalizeEmail(email);
  const emailKey = 'login:email:' + normalizedEmail;
  const ipKey = 'login:ip:' + clientIp(req);

  try {
    // Count this attempt first, atomically, and refuse when it is over the
    // limit. Doing it before the (slow) password check means a burst of
    // parallel requests cannot all get past a check that has not yet seen the
    // others. A correct login clears the email counter again below.
    const emailOver = await hit(emailKey, EMAIL_LIMIT, WINDOW_MS);
    const ipOver = await hit(ipKey, IP_LIMIT, WINDOW_MS);
    if (emailOver || ipOver) {
      res.status(429).json({ error: 'Too many attempts. Try again later.' });
      return;
    }

    const organizer = await findByEmail(normalizedEmail);
    // The Public row ('disabled') and unknown emails never match; both still pay for a bcrypt compare.
    const realHash = organizer && organizer.password_hash && organizer.password_hash !== 'disabled'
      ? organizer.password_hash : null;
    const matched = await bcrypt.compare(password, realHash || DUMMY_HASH);
    const ok = !!(realHash && matched);

    if (!ok) {
      res.status(401).json({ error: 'Incorrect email or password.' });
      return;
    }

    // Only after the correct password do we say why an account cannot sign in.
    if (!organizer.email_verified_at) {
      res.status(403).json({ code: 'unverified', error: 'Please verify your email first.' });
      return;
    }
    if (organizer.suspended) {
      res.status(403).json({ code: 'suspended', error: 'This account has been suspended.' });
      return;
    }

    await clear(emailKey);
    setSessionCookie(res, signSession(organizer));
    res.status(200).json(toSessionUser(organizer));
  } catch (e) {
    res.status(500).json({ error: 'Could not sign in.' });
  }
};

const bcrypt = require('bcryptjs');
const { signPlayer, setPlayerCookie } = require('../../_lib/session');
const { normalizeEmail, findByEmail, toPublic, DUMMY_HASH } = require('../../_lib/players');
const { clientIp, hit, clear, release } = require('../../_lib/throttle');

const WINDOW_MS = 15 * 60 * 1000;
const EMAIL_LIMIT = 10;
const IP_LIMIT = 40;

// POST { email, password }: a player signs in. Same pattern as the organiser app's api/_routes/auth/login.js.
// An account that must still choose its own password signs in normally; player.mustChange tells the page to ask for it
// (the other endpoints answer 403 must_change_password until then).
module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ code: 'method_not_allowed', error: 'Method not allowed' }); return; }

  const { email, password } = req.body || {};
  if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
    res.status(400).json({ code: 'email_password_required', error: 'Email and password are required.' });
    return;
  }

  const normalizedEmail = normalizeEmail(email);
  const emailKey = 'p:login:email:' + normalizedEmail;
  const ipKey = 'p:login:ip:' + clientIp(req);

  try {
    // Count this attempt first, atomically, and refuse when it is over the limit, before the slow password check, so a
    // burst of parallel requests cannot all get past a check that has not yet seen the others.
    const emailOver = await hit(emailKey, EMAIL_LIMIT, WINDOW_MS);
    const ipOver = await hit(ipKey, IP_LIMIT, WINDOW_MS);
    if (emailOver || ipOver) {
      res.status(429).json({ code: 'rate_limited', error: 'Too many attempts. Try again later.' });
      return;
    }

    const player = await findByEmail(normalizedEmail);
    // Unknown emails still pay for a bcrypt compare, so the time does not say whether the account exists.
    const realHash = player && player.password_hash ? player.password_hash : null;
    const matched = await bcrypt.compare(password, realHash || DUMMY_HASH);
    const ok = !!(realHash && matched);

    // The same answer for every email, so nothing here says whether an address belongs to a player or an organiser
    // (the login screen always shows "Organisers: use the organiser app" instead).
    if (!ok) {
      res.status(401).json({ code: 'bad_credentials', error: 'Incorrect email or password.' });
      return;
    }

    // Only after the correct password do we say why the account cannot sign in yet.
    if (!player.email_verified_at) {
      res.status(403).json({ code: 'unverified', error: 'Please confirm your email first.' });
      return;
    }

    await clear(emailKey);
    // A sign-in that worked gives the address its count back, so a busy shared network cannot lock itself out.
    await release(ipKey, WINDOW_MS);
    setPlayerCookie(res, signPlayer(player));
    res.status(200).json({ player: toPublic(player) });
  } catch (e) {
    // Logged so a failed sign-in can be traced in the Vercel logs; the player still sees the plain message.
    console.error('[login] failed:', e && (e.code || ''), e && e.message);
    res.status(500).json({ code: 'login_failed', error: 'Could not sign in.' });
  }
};

const bcrypt = require('bcryptjs');
const { requirePlayer, signPlayer, setPlayerCookie } = require('../../_lib/session');
const { BCRYPT_COST, setPassword, toPublic } = require('../../_lib/players');
const { clientIp, hit, clear, release } = require('../../_lib/throttle');
const { TOO_MANY, checkNewPassword } = require('../../_lib/pflow');

const WINDOW_MS = 15 * 60 * 1000;
const ACCOUNT_LIMIT = 5;    // per account
const IP_LIMIT = 20;        // per client address
const MAX_CURRENT_PASSWORD = 1000;   // anything longer cannot be a password we stored; skip the slow compare

// POST { current?, password }: a signed-in player changes their own password. Same pattern as the organiser app's
// api/_routes/auth/change-password.js. `current` is required unless the account must change its password (an admin
// set a temporary one; the player has just signed in with it). The one UPDATE sets the new hash, clears
// must_change_password and bumps token_version, so every other session stops working; this browser gets a fresh cookie
// carrying the new token_version and stays signed in.
module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ code: 'method_not_allowed', error: 'Method not allowed' }); return; }

  const row = await requirePlayer(req, res, { allowMustChange: true });
  if (!row) return;

  const accountKey = 'p:chpw:player:' + row.id;
  const ipKey = 'p:chpw:ip:' + clientIp(req);

  try {
    // Count this attempt first, atomically (as login), so a burst of parallel guesses cannot all get past the check.
    const accountOver = await hit(accountKey, ACCOUNT_LIMIT, WINDOW_MS);
    const ipOver = await hit(ipKey, IP_LIMIT, WINDOW_MS);
    if (accountOver || ipOver) {
      res.status(429).json({ code: 'rate_limited', error: TOO_MANY });
      return;
    }

    const { current, password } = req.body || {};
    const needsCurrent = !row.must_change_password;
    if (needsCurrent && (typeof current !== 'string' || !current)) {
      res.status(400).json({ code: 'current_password_required', error: 'Enter your current password.' });
      return;
    }
    const bad = checkNewPassword(password);
    if (bad) { res.status(400).json(bad); return; }
    if (needsCurrent && password === current) {
      res.status(400).json({ code: 'new_password_same', error: 'Choose a new password that is different from the current one.' });
      return;
    }

    if (needsCurrent) {
      const matched = current.length <= MAX_CURRENT_PASSWORD && await bcrypt.compare(current, row.password_hash);
      if (!matched) {
        res.status(400).json({ code: 'current_password_incorrect', error: 'The current password is incorrect.' });
        return;
      }
    } else if (await bcrypt.compare(password, row.password_hash)) {
      // The temporary password must really be replaced.
      res.status(400).json({ code: 'new_password_same', error: 'Choose a new password that is different from the current one.' });
      return;
    }

    const newHash = await bcrypt.hash(password, BCRYPT_COST);
    // Guarded by the hash just checked, so two overlapping changes cannot both succeed against the old password.
    const tv = await setPassword(row.id, newHash, { expectHash: row.password_hash });
    if (tv == null) {
      res.status(409).json({ code: 'password_changed_elsewhere', error: 'Your password was changed just now from somewhere else. Please try again.' });
      return;
    }

    await clear(accountKey);
    await release(ipKey, WINDOW_MS);   // a successful change gives the address its count back; failures keep counting
    const updated = Object.assign({}, row, { password_hash: newHash, must_change_password: false, token_version: tv });
    setPlayerCookie(res, signPlayer(updated));
    res.status(200).json({ ok: true, player: toPublic(updated) });
  } catch (e) {
    res.status(500).json({ code: 'password_change_failed', error: 'Could not change your password.' });
  }
};

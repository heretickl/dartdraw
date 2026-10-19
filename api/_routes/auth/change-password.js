const bcrypt = require('bcryptjs');
const { sql } = require('../../_lib/db');
const { requireAuth, signSession, setSessionCookie } = require('../../_lib/auth');
const { BCRYPT_COST, findById } = require('../../_lib/accounts');
const { clientIp, hit, clear, release } = require('../../_lib/throttle');
const { MIN_PASSWORD, TOO_MANY } = require('../../_lib/authflow');

const WINDOW_MS = 15 * 60 * 1000;
const ACCOUNT_LIMIT = 5;    // per account
const IP_LIMIT = 20;        // per client address
const MAX_NEW_PASSWORD = 200;    // bcrypt-safe upper bound for what we accept as a new password
const MAX_CURRENT_PASSWORD = 1000;   // anything longer cannot be a password we stored; skip the slow compare
const NOT_AVAILABLE = 'Changing the password is not available for this account.';

// POST { currentPassword, newPassword }: a signed-in organiser changes their own password.
// The one UPDATE sets the new hash and bumps token_version, so every other session of the account stops working
// (requireAuth compares the token's tv); this browser gets a fresh cookie carrying the new tv and stays signed in.
// Passwords and hashes are never logged or returned.
module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const organizer = await requireAuth(req, res);
  if (!organizer) return;
  // In the shared Public fallback everyone is the one disabled-password row: nothing to change.
  if (process.env.REQUIRE_LOGIN !== 'true') { res.status(403).json({ error: NOT_AVAILABLE }); return; }

  const accountKey = 'chpw:org:' + organizer.id;
  const ipKey = 'chpw:ip:' + clientIp(req);

  try {
    // Count this attempt first, atomically (same pattern as login), so a burst of parallel guesses cannot all get
    // past a check that has not seen the others. A successful change clears the account counter below.
    const accountOver = await hit(accountKey, ACCOUNT_LIMIT, WINDOW_MS);
    const ipOver = await hit(ipKey, IP_LIMIT, WINDOW_MS);
    if (accountOver || ipOver) {
      res.status(429).json({ error: TOO_MANY });
      return;
    }

    const { currentPassword, newPassword } = req.body || {};
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || !currentPassword) {
      res.status(400).json({ error: 'Enter your current password and a new password.' });
      return;
    }
    if (newPassword.length < MIN_PASSWORD) {
      res.status(400).json({ error: 'The new password must be at least ' + MIN_PASSWORD + ' characters.' });
      return;
    }
    if (newPassword.length > MAX_NEW_PASSWORD) {
      res.status(400).json({ error: 'The new password must be at most ' + MAX_NEW_PASSWORD + ' characters.' });
      return;
    }
    if (newPassword === currentPassword) {
      res.status(400).json({ error: 'Choose a new password that is different from the current one.' });
      return;
    }

    const row = await findById(organizer.id);
    if (!row || !row.password_hash || row.password_hash === 'disabled') {
      res.status(403).json({ error: NOT_AVAILABLE });
      return;
    }
    const matched = currentPassword.length <= MAX_CURRENT_PASSWORD
      && await bcrypt.compare(currentPassword, row.password_hash);
    if (!matched) {
      res.status(400).json({ error: 'The current password is incorrect.' });
      return;
    }

    const newHash = await bcrypt.hash(newPassword, BCRYPT_COST);
    // Guarded by the hash we just verified, so two overlapping changes cannot both succeed against the old password.
    const rows = await sql`
      UPDATE organizers SET password_hash = ${newHash}, token_version = token_version + 1
      WHERE id = ${row.id} AND password_hash = ${row.password_hash}
      RETURNING token_version
    `;
    if (!rows.length) {
      res.status(409).json({ error: 'Your password was changed just now from somewhere else. Please try again.' });
      return;
    }

    await clear(accountKey);
    await release(ipKey, WINDOW_MS);   // a successful change gives the address its count back; failures keep counting
    setSessionCookie(res, signSession({
      id: row.id, email: row.email, name: row.name, token_version: Number(rows[0].token_version)
    }));
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Could not change your password.' });
  }
};

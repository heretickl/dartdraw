const bcrypt = require('bcryptjs');
const { requireAdmin } = require('../../../../_lib/auth');
const { sql } = require('../../../../_lib/db');
const { BCRYPT_COST } = require('../../../../_lib/accounts');
const { makeTempPassword } = require('../../../../_lib/playerAccounts');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Admin only. POST /api/admin/player-accounts/:id/reset -> { tempPassword }
// Gives the player a new temporary password (shown once, only its hash is stored, never logged). They must choose
// their own at the next sign-in, and every earlier session is signed out (token_version + 1). 404 for an unknown id.
module.exports = async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    if (req.method !== 'POST') { res.status(405).json({ code: 'method_not_allowed', error: 'Method not allowed' }); return; }
    const id = req.query && req.query.id;
    if (typeof id !== 'string' || !UUID_RE.test(id)) {
      res.status(404).json({ code: 'player_account_not_found', error: 'Player account not found.' });
      return;
    }
    const tempPassword = makeTempPassword();
    const hash = await bcrypt.hash(tempPassword, BCRYPT_COST);
    const rows = await sql`
      UPDATE player_accounts SET password_hash = ${hash}, must_change_password = true, token_version = token_version + 1
      WHERE id = ${id}
      RETURNING id
    `;
    if (!rows.length) {
      res.status(404).json({ code: 'player_account_not_found', error: 'Player account not found.' });
      return;
    }
    res.status(200).json({ tempPassword });
  } catch (e) {
    if (e && e.code === '42P01') {
      res.status(503).json({ code: 'not_set_up', error: 'Player accounts are not set up yet. Run migrations/2026-11-05-player-accounts.sql first.' });
      return;
    }
    res.status(500).json({ code: 'request_failed', error: 'Could not complete that request.' });
  }
};

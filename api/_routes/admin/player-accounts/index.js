const bcrypt = require('bcryptjs');
const { requireAdmin } = require('../../../_lib/auth');
const { sql } = require('../../../_lib/db');
const { BCRYPT_COST, normalizeEmail } = require('../../../_lib/accounts');
const { isValidEmail } = require('../../../_lib/authflow');
const { bodyObject } = require('../../../_lib/adminOrganizers');
const { NAME_MAX, makeTempPassword, cleanName, toAccount } = require('../../../_lib/playerAccounts');

// Admin only. These are the players' accounts for casual play (table player_accounts), not the organisers' player
// library (that is /api/admin/players).
// GET  /api/admin/player-accounts?q=&limit=&offset= -> { items: [{ id, email, firstName, lastName, confirmed, createdByAdmin, createdAt }], total }
//   q matches first name, last name or email; newest first; 50 a page (at most 100).
// POST /api/admin/player-accounts { email, firstName, lastName } -> 201 { account, tempPassword }
//   A confirmed account that must choose its own password at first sign-in. An email that already has a CONFIRMED
//   account is 409 email_taken; one that is still unconfirmed is taken over (names and password replaced, confirmed,
//   older sessions signed out), so nobody keeps a password on an address they never proved. The temporary password
//   is returned once and only its hash is stored; it is never logged.
module.exports = async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    if (req.method === 'GET') {
      const q = req.query || {};
      const text = cleanName(typeof q.q === 'string' ? q.q : '').slice(0, 80);
      const pattern = text ? '%' + text.replace(/[\\%_]/g, (c) => '\\' + c) + '%' : null;
      const limit = Math.min(100, Math.max(1, parseInt(q.limit, 10) || 50));
      const offset = Math.min(1000000, Math.max(0, parseInt(q.offset, 10) || 0));
      const rows = await sql`
        SELECT id, email, first_name, last_name, email_verified_at, created_by_admin, created_at, count(*) OVER () AS total
        FROM player_accounts
        WHERE (${pattern}::text IS NULL OR email ILIKE ${pattern} OR first_name ILIKE ${pattern} OR last_name ILIKE ${pattern}
               OR (first_name || ' ' || last_name) ILIKE ${pattern})
        ORDER BY created_at DESC, id
        LIMIT ${limit} OFFSET ${offset}
      `;
      res.status(200).json({ items: rows.map(toAccount), total: rows.length ? Number(rows[0].total) || 0 : 0 });
      return;
    }

    if (req.method === 'POST') {
      const body = bodyObject(req);
      const email = typeof body.email === 'string' ? normalizeEmail(body.email) : '';
      const firstName = cleanName(body.firstName);
      const lastName = cleanName(body.lastName);
      if (!isValidEmail(email)) {
        res.status(400).json({ code: 'invalid_email', error: 'Enter a valid email address.' });
        return;
      }
      if (firstName.length < 1 || firstName.length > NAME_MAX) {
        res.status(400).json({ code: 'invalid_first_name', error: 'First name must be 1 to ' + NAME_MAX + ' characters.' });
        return;
      }
      if (lastName.length < 1 || lastName.length > NAME_MAX) {
        res.status(400).json({ code: 'invalid_last_name', error: 'Last name must be 1 to ' + NAME_MAX + ' characters.' });
        return;
      }
      const tempPassword = makeTempPassword();
      const hash = await bcrypt.hash(tempPassword, BCRYPT_COST);
      // One statement, so two requests at once cannot both win: a new row is inserted, an UNCONFIRMED one is taken
      // over, and a confirmed one fails the WHERE and returns nothing (409).
      const rows = await sql`
        INSERT INTO player_accounts (email, password_hash, first_name, last_name, email_verified_at, must_change_password, created_by_admin)
        VALUES (${email}, ${hash}, ${firstName}, ${lastName}, now(), true, ${admin.id})
        ON CONFLICT (email) DO UPDATE SET
          password_hash = EXCLUDED.password_hash, first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name,
          email_verified_at = now(), must_change_password = true, created_by_admin = EXCLUDED.created_by_admin,
          token_version = player_accounts.token_version + 1
        WHERE player_accounts.email_verified_at IS NULL
        RETURNING id, email, first_name, last_name, email_verified_at, created_by_admin, created_at
      `;
      if (!rows.length) {
        res.status(409).json({ code: 'email_taken', error: 'A player account with that email already exists.' });
        return;
      }
      res.status(201).json({ account: toAccount(rows[0]), tempPassword });
      return;
    }

    res.status(405).json({ code: 'method_not_allowed', error: 'Method not allowed' });
  } catch (e) {
    if (e && e.code === '42P01') {
      res.status(503).json({ code: 'not_set_up', error: 'Player accounts are not set up yet. Run migrations/2026-11-05-player-accounts.sql first.' });
      return;
    }
    res.status(500).json({ code: 'request_failed', error: 'Could not complete that request.' });
  }
};

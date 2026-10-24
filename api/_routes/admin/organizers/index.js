const { requireAdmin, PUBLIC_ORGANIZER_EMAIL } = require('../../../_lib/auth');
const { normalizeEmail, findByEmail, createOrganizer } = require('../../../_lib/accounts');
const { isValidEmail } = require('../../../_lib/authflow');
const { issueToken } = require('../../../_lib/tokens');
const { TIERS, listSummaries, getSummary, bodyObject, linkFor, mailLink } = require('../../../_lib/adminOrganizers');

// Admin only (every handler under api/_routes/admin starts with requireAdmin).
// GET  /api/admin/organizers -> { organizers: [{ id, email, name, role, tier, effectiveTier, suspended, verified, createdAt, eventCount }] }
//   Every organiser except the shared Public row, newest first.
// POST /api/admin/organizers { name, email, tier } -> 201 { organizer, link }
//   Creates a verified account with an unusable password and a 7-day invite token. `link` opens reset.html to
//   choose a password; it is also emailed when mail is configured (a mail failure never fails the request).
const EXISTS = { code: 'email_exists', error: 'An account with that email already exists.' };

module.exports = async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    if (req.method === 'GET') {
      res.status(200).json({ organizers: await listSummaries() });
      return;
    }

    if (req.method === 'POST') {
      const body = bodyObject(req);
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const email = typeof body.email === 'string' ? normalizeEmail(body.email) : '';
      if (name.length < 1 || name.length > 80) {
        res.status(400).json({ code: 'invalid_name', error: 'Name must be 1 to 80 characters.' });
        return;
      }
      if (!isValidEmail(email)) {
        res.status(400).json({ code: 'invalid_email', error: 'Enter a valid email address.' });
        return;
      }
      if (!TIERS.includes(body.tier)) {
        res.status(400).json({ code: 'invalid_tier', error: 'Tier must be basic or pro.' });
        return;
      }
      if (email === PUBLIC_ORGANIZER_EMAIL || await findByEmail(email)) {
        res.status(409).json(EXISTS);
        return;
      }

      let created;
      try {
        // 'disabled' is never a valid hash: the account cannot sign in until the invite link sets a password.
        created = await createOrganizer({ email, name, passwordHash: 'disabled', role: 'organizer', tier: body.tier, verified: true });
      } catch (e) {
        if (e && e.code === '23505') { res.status(409).json(EXISTS); return; }
        throw e;
      }
      const raw = await issueToken(created.id, 'invite');
      const link = linkFor(req, raw);
      await mailLink(created.email, 'invite', { link, name: created.name });
      res.status(201).json({ organizer: await getSummary(created.id), link });
      return;
    }

    res.status(405).json({ code: 'method_not_allowed', error: 'Method not allowed' });
  } catch (e) {
    res.status(500).json({ code: 'request_failed', error: 'Could not complete that request.' });
  }
};

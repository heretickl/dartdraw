const { requireAdmin } = require('../../../_lib/auth');
const { issueToken } = require('../../../_lib/tokens');
const { lookupTarget, linkFor, mailLink } = require('../../../_lib/adminOrganizers');

// Admin only. POST /api/admin/organizers/:id/reset-link -> { link }
// Issues a 1-hour reset token for the organiser (earlier unused reset tokens stop working) and answers with the
// reset.html link to hand over; it is also emailed when mail is configured. 404 for the Public row or an
// unknown id; 409 for a suspended account (the reset endpoint would refuse the link).
module.exports = async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

    const target = await lookupTarget(req.query && req.query.id);
    if (!target) { res.status(404).json({ error: 'Organiser not found.' }); return; }
    if (target.suspended) {
      res.status(409).json({ error: 'This account is suspended. Reactivate it first.' });
      return;
    }

    const raw = await issueToken(target.id, 'reset');
    const link = linkFor(req, raw);
    await mailLink(
      target.email,
      'Reset your DartDraw password',
      'An administrator has issued a link for you to choose a new DartDraw password (it works for 1 hour):\n\n'
        + link + '\n'
    );
    res.status(200).json({ link });
  } catch (e) {
    res.status(500).json({ error: 'Could not complete that request.' });
  }
};

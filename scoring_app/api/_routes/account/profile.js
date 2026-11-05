const { requirePlayer } = require('../../_lib/session');
const { changeName, findById, toPublic } = require('../../_lib/players');
const { checkNames } = require('../../_lib/pflow');

// POST { firstName, lastName }: changes the profile name, at most once every 30 days (spec section 6). Saving the name
// it already has changes nothing and does not start the 30 days. Within the 30 days: 409 name_change_too_soon with
// nextAt, the first moment another change is allowed.
module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ code: 'method_not_allowed', error: 'Method not allowed' }); return; }

  const row = await requirePlayer(req, res);
  if (!row) return;

  const names = checkNames(req.body || {});
  if (names.code) { res.status(names.status).json({ code: names.code, error: names.error }); return; }

  try {
    if (names.firstName === row.first_name && names.lastName === row.last_name) {
      res.status(200).json({ ok: true, player: toPublic(row) });
      return;
    }
    const result = await changeName(row.id, names.firstName, names.lastName, new Date());
    if (result.code) {
      res.status(409).json({ code: result.code, error: 'You can change your name once every 30 days.', nextAt: result.nextAt });
      return;
    }
    const updated = await findById(row.id);
    res.status(200).json({ ok: true, player: toPublic(updated) });
  } catch (e) {
    res.status(500).json({ code: 'profile_failed', error: 'Could not save your name.' });
  }
};

const { requirePlayer } = require('../../_lib/session');
const { markNoticesRead } = require('../../_lib/scorecard');

// POST { ids }: marks the caller's own notices read once the scorecard has shown them. 200 { ok: true }.
module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ code: 'method_not_allowed', error: 'Method not allowed' }); return; }

  const row = await requirePlayer(req, res);
  if (!row) return;

  try {
    const out = await markNoticesRead(row, req.body);
    if (out.code) { res.status(out.status).json({ code: out.code, error: out.error }); return; }
    res.status(out.status).json(out.body);
  } catch (e) {
    res.status(500).json({ code: 'notices_failed', error: 'Could not update your notices.' });
  }
};

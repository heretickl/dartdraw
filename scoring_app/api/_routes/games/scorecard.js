const { requirePlayer } = require('../../_lib/session');
const { scorecard } = require('../../_lib/scorecard');

// GET ?filter=all|tournament|casual&period=30d|year|all: the numbers on the caller's scorecard (headline averages and
// their trend, chart points, totals, casual summary, the latest games and unread notices). 400 bad_filter / bad_period.
module.exports = async (req, res) => {
  if (req.method !== 'GET') { res.status(405).json({ code: 'method_not_allowed', error: 'Method not allowed' }); return; }

  const row = await requirePlayer(req, res);
  if (!row) return;

  try {
    const out = await scorecard(row, req.query, Date.now());
    if (out.code) { res.status(out.status).json({ code: out.code, error: out.error }); return; }
    res.status(out.status).json(out.body);
  } catch (e) {
    res.status(500).json({ code: 'scorecard_failed', error: 'Could not load your scorecard.' });
  }
};

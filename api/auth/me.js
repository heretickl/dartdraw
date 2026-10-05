const { requireAuth } = require('../_lib/auth');

module.exports = async (req, res) => {
  const organizer = await requireAuth(req, res);
  if (!organizer) return;
  // viewerUrl: base address of the separate public results site (its own Vercel project), if configured.
  const viewerUrl = String(process.env.VIEWER_URL || '').trim().replace(/\/+$/, '');
  res.status(200).json(Object.assign({}, organizer, { publicMode: process.env.REQUIRE_LOGIN !== 'true', viewerUrl }));
};

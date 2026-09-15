const { requireAuth } = require('../_lib/auth');

module.exports = async (req, res) => {
  const organizer = await requireAuth(req, res);
  if (!organizer) return;
  res.status(200).json(Object.assign({}, organizer, { publicMode: process.env.AUTH_DISABLED === 'true' }));
};

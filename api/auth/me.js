const { requireAuth } = require('../_lib/auth');

module.exports = async (req, res) => {
  const organizer = requireAuth(req, res);
  if (!organizer) return;
  res.status(200).json(organizer);
};

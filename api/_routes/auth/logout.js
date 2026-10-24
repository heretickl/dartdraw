const { clearSessionCookie } = require('../../_lib/auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ code: 'method_not_allowed', error: 'Method not allowed' }); return; }
  clearSessionCookie(res);
  res.status(200).json({ ok: true });
};

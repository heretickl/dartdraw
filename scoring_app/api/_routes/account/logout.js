const { clearPlayerCookie } = require('../../_lib/session');

// POST: signs this browser out. Works for any cookie (or none), including an account that must still change its password.
module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ code: 'method_not_allowed', error: 'Method not allowed' }); return; }
  clearPlayerCookie(res);
  res.status(200).json({ ok: true });
};

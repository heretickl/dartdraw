const { isMailConfigured } = require('../_lib/mail');

// Public (no login): lets the login page show or hide its Sign up link.
module.exports = async (req, res) => {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ signupOpen: process.env.SIGNUP_OPEN === 'true' && isMailConfigured() });
};

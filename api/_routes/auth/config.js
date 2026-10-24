const { isMailConfigured } = require('../../_lib/mail');
const { getContactLine } = require('../../_lib/settings');

// Public (no login): lets the sign-in page show or hide its Sign up link, and show the Admin's contact line under
// "No account yet?". The contact line is the only stored setting exposed here: plain text, at most 200 characters,
// '' when none is set or the database cannot be read (getContactLine never throws). The page renders it with textContent.
module.exports = async (req, res) => {
  if (req.method !== 'GET') { res.status(405).json({ code: 'method_not_allowed', error: 'Method not allowed' }); return; }
  res.setHeader('Cache-Control', 'no-store');
  const adminContact = await getContactLine();
  res.status(200).json({ signupOpen: process.env.SIGNUP_OPEN === 'true' && isMailConfigured(), adminContact });
};

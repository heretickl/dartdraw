const bcrypt = require('bcryptjs');
const { sql } = require('../_lib/db');
const { signSession, setSessionCookie } = require('../_lib/auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const { email, password } = req.body || {};
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  try {
    const rows = await sql`SELECT id, email, name, password_hash FROM organizers WHERE email = ${normalizedEmail}`;
    const organizer = rows[0];
    if (!organizer) { res.status(401).json({ error: 'Incorrect email or password.' }); return; }

    const ok = await bcrypt.compare(password, organizer.password_hash);
    if (!ok) { res.status(401).json({ error: 'Incorrect email or password.' }); return; }

    setSessionCookie(res, signSession(organizer));
    res.status(200).json({ id: organizer.id, email: organizer.email, name: organizer.name });
  } catch (e) {
    res.status(500).json({ error: 'Could not sign in.' });
  }
};

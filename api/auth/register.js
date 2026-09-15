const bcrypt = require('bcryptjs');
const { sql } = require('../_lib/db');
const { signSession, setSessionCookie } = require('../_lib/auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const { email, password, name, accessCode } = req.body || {};
  if (!email || !password || !name || !accessCode) {
    res.status(400).json({ error: 'Email, password, name and access code are all required.' });
    return;
  }
  if (accessCode !== process.env.SIGNUP_CODE) {
    res.status(403).json({ error: 'Access code is incorrect.' });
    return;
  }
  if (String(password).length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters.' });
    return;
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  try {
    const existing = await sql`SELECT id FROM organizers WHERE email = ${normalizedEmail}`;
    if (existing.length) {
      res.status(409).json({ error: 'An account with that email already exists.' });
      return;
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const rows = await sql`
      INSERT INTO organizers (email, password_hash, name)
      VALUES (${normalizedEmail}, ${passwordHash}, ${String(name).trim()})
      RETURNING id, email, name
    `;
    const organizer = rows[0];
    setSessionCookie(res, signSession(organizer));
    res.status(201).json({ id: organizer.id, email: organizer.email, name: organizer.name });
  } catch (e) {
    res.status(500).json({ error: 'Could not create account.' });
  }
};

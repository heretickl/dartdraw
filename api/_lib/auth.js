const jwt = require('jsonwebtoken');
const cookie = require('cookie');
const { sql } = require('./db');

const COOKIE_NAME = '__Host-session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days
const PUBLIC_ORGANIZER_EMAIL = 'public@dartdraw.local';

function requireSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is not set');
  return secret;
}

function signSession(organizer) {
  return jwt.sign(
    { sub: organizer.id, email: organizer.email, name: organizer.name },
    requireSecret(),
    { expiresIn: MAX_AGE_SECONDS }
  );
}

function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie', cookie.serialize(COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE_SECONDS
  }));
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', cookie.serialize(COOKIE_NAME, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0
  }));
}

function getOrganizerFromRequest(req) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token) return null;
  try {
    const payload = jwt.verify(token, requireSecret());
    return { id: payload.sub, email: payload.email, name: payload.name };
  } catch (e) {
    return null;
  }
}

// When AUTH_DISABLED=true every visitor shares this one organizer row (lazily
// created) instead of signing in - a reversible way to open the app to the
// public without ripping out the login system. Flip AUTH_DISABLED back to
// false/unset and redeploy to require login again.
let publicOrganizerPromise = null;
async function getOrCreatePublicOrganizer() {
  if (!publicOrganizerPromise) {
    publicOrganizerPromise = (async () => {
      const rows = await sql`SELECT id, email, name FROM organizers WHERE email = ${PUBLIC_ORGANIZER_EMAIL}`;
      if (rows.length) return rows[0];
      const inserted = await sql`
        INSERT INTO organizers (email, password_hash, name)
        VALUES (${PUBLIC_ORGANIZER_EMAIL}, 'disabled', 'Public')
        ON CONFLICT (email) DO NOTHING
        RETURNING id, email, name
      `;
      if (inserted.length) return inserted[0];
      const retry = await sql`SELECT id, email, name FROM organizers WHERE email = ${PUBLIC_ORGANIZER_EMAIL}`;
      return retry[0];
    })();
  }
  return publicOrganizerPromise;
}

// Call at the top of a protected handler. Writes the 401 itself and returns
// null when unauthenticated, so callers can just `if (!organizer) return;`.
async function requireAuth(req, res) {
  if (process.env.AUTH_DISABLED === 'true') {
    try {
      return await getOrCreatePublicOrganizer();
    } catch (e) {
      res.status(500).json({ error: 'Could not resolve public account.' });
      return null;
    }
  }
  const organizer = getOrganizerFromRequest(req);
  if (!organizer) {
    res.status(401).json({ error: 'Not authenticated' });
    return null;
  }
  return organizer;
}

module.exports = {
  signSession,
  setSessionCookie,
  clearSessionCookie,
  getOrganizerFromRequest,
  requireAuth
};

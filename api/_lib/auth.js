const jwt = require('jsonwebtoken');
const cookie = require('cookie');

const COOKIE_NAME = '__Host-session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

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

// Call at the top of a protected handler. Writes the 401 itself and returns
// null when unauthenticated, so callers can just `if (!organizer) return;`.
function requireAuth(req, res) {
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

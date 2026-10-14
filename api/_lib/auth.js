const jwt = require('jsonwebtoken');
const cookie = require('cookie');
const { sql } = require('./db');
const { findById, toSessionUser } = require('./accounts');

const COOKIE_NAME = '__Host-session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days
const PUBLIC_ORGANIZER_EMAIL = 'public@dartdraw.local';

function requireSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is not set');
  return secret;
}

// tv = the organizer's token_version. Bumping it (password reset, suspension)
// makes every session issued before that fail requireAuth.
function signSession(organizer) {
  return jwt.sign(
    { sub: organizer.id, email: organizer.email, name: organizer.name, tv: organizer.token_version },
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
    const payload = jwt.verify(token, requireSecret(), { algorithms: ['HS256'] });
    return { id: payload.sub, email: payload.email, name: payload.name, tv: payload.tv };
  } catch (e) {
    return null;
  }
}

// Login is OFF by default (every visitor shares this one lazily-created
// organizer row) unless REQUIRE_LOGIN=true is set - a reversible way to open
// the app to the public without ripping out the login system. Set
// REQUIRE_LOGIN=true and redeploy to require organizer login again.
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

// For tests: forget the cached shared Public organiser.
function _resetPublicOrganizerCache() {
  publicOrganizerPromise = null;
}

// Call at the top of a protected handler. Writes the 401 itself and returns
// null when unauthenticated, so callers can just `if (!organizer) return;`.
// Returns { id, email, name, role, tier } taken from the database row (never
// from the token).
async function requireAuth(req, res) {
  if (process.env.REQUIRE_LOGIN !== 'true') {
    try {
      const pub = await getOrCreatePublicOrganizer();
      // The shared Public organiser is never limited: role/tier added so
      // downstream code never sees undefined.
      return Object.assign({}, pub, { role: 'organizer', tier: 'pro' });
    } catch (e) {
      res.status(500).json({ error: 'Could not resolve public account.' });
      return null;
    }
  }
  const session = getOrganizerFromRequest(req);
  if (!session) {
    res.status(401).json({ error: 'Not authenticated' });
    return null;
  }
  let row;
  try {
    row = await findById(session.id);
  } catch (e) {
    res.status(500).json({ error: 'Could not verify your session.' });
    return null;
  }
  if (!row || row.suspended || !row.email_verified_at
      || typeof session.tv !== 'number' || session.tv !== Number(row.token_version)) {
    res.status(401).json({ error: 'Not authenticated' });
    return null;
  }
  return toSessionUser(row);
}

module.exports = {
  signSession,
  setSessionCookie,
  clearSessionCookie,
  getOrganizerFromRequest,
  requireAuth,
  _resetPublicOrganizerCache
};

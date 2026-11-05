// Player sign-in for the scoring app: a signed cookie that says which player account this is.
// Same pattern as the organiser app's api/_lib/auth.js, but its own cookie and secret so a player
// session can never be mistaken for an organiser one.
const jwt = require('jsonwebtoken');
const cookie = require('cookie');
const { sql } = require('./db');

const COOKIE_NAME = '__Host-dd-player';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 180; // 180 days

function requireSecret() {
  const secret = process.env.PLAYER_SESSION_SECRET;
  if (!secret) throw new Error('PLAYER_SESSION_SECRET is not set');
  return secret;
}

// tv = the account's token_version. Bumping it (password reset, change) signs out every older session.
function signPlayer(row) {
  return jwt.sign(
    { sub: row.id, tv: row.token_version, kind: 'player' },
    requireSecret(),
    { expiresIn: MAX_AGE_SECONDS }
  );
}

function setPlayerCookie(res, token) {
  res.setHeader('Set-Cookie', cookie.serialize(COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE_SECONDS
  }));
}

function clearPlayerCookie(res) {
  res.setHeader('Set-Cookie', cookie.serialize(COOKIE_NAME, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0
  }));
}

// Reads the cookie without touching the database. Null when missing, forged, expired or not a player token.
function readPlayer(req) {
  let token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token && req.headers && req.headers.cookie) {
    try { token = cookie.parse(req.headers.cookie)[COOKIE_NAME]; } catch (e) { token = null; }
  }
  if (!token) return null;
  try {
    const payload = jwt.verify(token, requireSecret(), { algorithms: ['HS256'] });
    if (payload.kind !== 'player') return null;
    return { id: payload.sub, tv: payload.tv };
  } catch (e) {
    return null;
  }
}

// Call at the top of a protected handler. Writes the 401/403 itself and returns null, so callers can just
// `if (!row) return;`. Returns the full player_accounts row, taken from the database (never from the token).
// opts.allowMustChange lets an account that must still choose a new password through (only change-password needs that).
async function requirePlayer(req, res, opts) {
  const session = readPlayer(req);
  if (!session) {
    res.status(401).json({ code: 'not_authenticated', error: 'Not authenticated' });
    return null;
  }
  let row;
  try {
    const rows = await sql`SELECT * FROM player_accounts WHERE id = ${session.id}`;
    row = rows[0];
  } catch (e) {
    res.status(500).json({ code: 'session_check_failed', error: 'Could not verify your session.' });
    return null;
  }
  if (!row || !row.email_verified_at
      || typeof session.tv !== 'number' || session.tv !== Number(row.token_version)) {
    res.status(401).json({ code: 'not_authenticated', error: 'Not authenticated' });
    return null;
  }
  if (row.must_change_password && !(opts && opts.allowMustChange)) {
    res.status(403).json({ code: 'must_change_password', error: 'Choose a new password first.' });
    return null;
  }
  return row;
}

module.exports = {
  COOKIE_NAME,
  signPlayer,
  setPlayerCookie,
  clearPlayerCookie,
  readPlayer,
  requirePlayer
};

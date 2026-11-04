// CORS for the live-scoring DEVICE routes (api/live/[action].js). The scoring app is served from another web address than this
// server and calls /api/live/* with the header X-Live-Session (never cookies), so a browser needs these answers or it blocks the call.
// Only the device routes use this: the organiser's panel (cookie session) and /api/score/* stay same-origin and get nothing from here.
//
// Allowed origins: env LIVE_ALLOWED_ORIGINS (comma-separated, exact origins, e.g. https://a.example,https://b.example), or, when it is
// not set, https://dartdraw-scoring.vercel.app. Besides those, http://localhost:<port> and http://127.0.0.1:<port> are allowed unless
// this is a production deployment (VERCEL_ENV === 'production').
// An allowed origin is answered with exactly that origin in Access-Control-Allow-Origin (never *) and no credentials header.
// No dependencies.

const DEFAULT_ORIGINS = ['https://dartdraw-scoring.vercel.app'];
const LOCAL = /^http:\/\/(?:localhost|127\.0\.0\.1):[0-9]{1,5}$/;

function allowedList() {
  const raw = typeof process.env.LIVE_ALLOWED_ORIGINS === 'string' ? process.env.LIVE_ALLOWED_ORIGINS : '';
  const list = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return list.length ? list : DEFAULT_ORIGINS;
}

/* Is this Origin header value one of the allowed origins? (Read from the environment on every call, so a change needs no restart.) */
function originAllowed(origin) {
  if (typeof origin !== 'string' || !origin || origin === 'null') return false;
  if (allowedList().indexOf(origin) >= 0) return true;
  return process.env.VERCEL_ENV !== 'production' && LOCAL.test(origin);
}

/* The one place a device route is let through CORS. Returns true when it has already answered the request (a preflight);
   false when the route handler should go on. A request without an Origin header (same-origin, curl, a native app) is left alone. */
function handleDeviceCors(req, res) {
  const origin = req.headers && req.headers.origin;
  if (typeof origin !== 'string' || !origin) return false;
  res.setHeader('Vary', 'Origin');
  const allowed = originAllowed(origin);
  if (allowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Live-Session');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '600');
  }
  if (req.method === 'OPTIONS') {
    if (allowed) { res.status(204).end(); return true; }
    res.status(403).json({ code: 'origin_not_allowed', error: 'This address is not allowed.' });
    return true;
  }
  return false;
}

module.exports = { handleDeviceCors, originAllowed };

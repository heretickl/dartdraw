// Shared pieces of the live-scoring device endpoints (api/live/[action].js).
// A device's session is a signed token (not a cookie, so one tablet can hold logins for several events) sent back in the
// X-Live-Session header. It names the device, the event and the login's nonce; every request looks them up again
// (live.sessionFor), so New password, a logged-out device or an event switched back to Manual ends it. A finalized event does
// NOT end a session (spec 7.6): requireSession refuses it with 410 unless the route passes { allowFinalized: true }.
const live = require('../../_lib/live');

const ERRORS = {
  not_set_up: [503, { code: 'live_not_set_up', error: 'Live scoring is not set up yet.' }],
  not_found: [404, { code: 'not_found', error: 'Not found.' }],
  no_login: [404, { code: 'not_found', error: 'Not found.' }],
  login_required: [400, { code: 'login_required', error: 'Enter the username and password.' }],
  bad_login: [401, { code: 'bad_login', error: 'That username or password is not right.' }],
  rate_limited: [429, { code: 'rate_limited', error: 'Too many attempts. Try again later.' }],
  live_off: [403, { code: 'live_off', error: 'Live scoring is not switched on for this event.' }],
  finalized: [403, { code: 'finalized', error: 'This event is finalized. Only an Admin can change it.', finalized: true }]
};
function sendError(res, e) {
  if (e && e.code === 'link_ended') { sendRefused(res, e.reason || 'finalized'); return; }
  const hit = e && e.code && ERRORS[e.code];
  if (hit) { res.status(hit[0]).json(hit[1]); return; }
  console.error('live endpoint failed: ' + (e && e.message ? e.message : e));
  res.status(500).json({ code: 'request_failed', error: 'Could not complete that request.' });
}
function bodyObject(req) {
  const b = req.body;
  return b && typeof b === 'object' && !Array.isArray(b) ? b : {};
}
function methodNotAllowed(res) { res.status(405).json({ code: 'method_not_allowed', error: 'Method not allowed' }); }

/* The device behind the request's session: { device, tournament } when it works ({ ..., finalized: true } when the event is
   finalized), { refused } when it ended ('closed' -> 410, 'live_off' -> 403), null when there is no valid session at all. */
async function liveSession(req) {
  const raw = req.headers && (req.headers['x-live-session'] || req.headers['X-Live-Session']);
  return live.sessionFor(live.verifySession(raw));
}
/* A session that no longer works: why, as its own answer. */
function sendRefused(res, reason) {
  if (reason === 'live_off') { res.status(403).json({ code: 'live_off', error: 'Live scoring is not switched on for this event.' }); return; }
  res.status(410).json({ reason, code: 'link_ended', error: 'This scoring link no longer works.' });
}
function sendNoSession(res) { res.status(401).json({ code: 'no_session', error: 'Open your scoring link again.' }); }
/* For the routes that need a working session: the { device, tournament }, or null after the refusal has been sent. A finalized
   event is refused (410 link_ended, reason 'finalized') unless the route passes { allowFinalized: true } (only turn and
   confirm do): then the session is returned with finalized: true and the route must not apply anything. */
async function requireSession(req, res, opts) {
  const found = await liveSession(req);
  if (!found) { sendNoSession(res); return null; }
  if (found.refused) { sendRefused(res, found.refused); return null; }
  if (found.finalized && !(opts && opts.allowFinalized)) { sendRefused(res, 'finalized'); return null; }
  return found;
}

module.exports = { sendError, bodyObject, methodNotAllowed, liveSession, sendRefused, sendNoSession, requireSession, live };

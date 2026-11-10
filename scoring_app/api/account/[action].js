// One serverless function for every /api/account/<action> endpoint (Vercel's Hobby plan allows 12 functions per
// deployment, so the handlers live in api/_routes/account/ - folders starting with "_" are not deployed as functions -
// and this router picks one by the last path segment of the URL). Same pattern as the organiser app's api/auth/[action].js.
//
// The action is read from req.url, not from req.query.action. Anything else answers 404
// { code: 'not_found', error: 'Not found.' }. Handlers are added here as `name: () => require('../_routes/account/name')`
// (literal paths, so the file tracer bundles them) and loaded lazily, on first use.
const { accountsOn, refuseWhenOff } = require('../_lib/accounts');

const ROUTES = {
  register: () => require('../_routes/account/register'),
  login: () => require('../_routes/account/login'),
  logout: () => require('../_routes/account/logout'),
  me: () => require('../_routes/account/me'),
  verify: () => require('../_routes/account/verify'),
  resend: () => require('../_routes/account/resend'),
  forgot: () => require('../_routes/account/forgot'),
  reset: () => require('../_routes/account/reset'),
  'change-password': () => require('../_routes/account/change-password'),
  profile: () => require('../_routes/account/profile')
};

function lastSegment(url) {
  let pathname;
  try { pathname = new URL(String(url || ''), 'http://x').pathname; } catch (e) { return ''; }
  const parts = pathname.split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}

module.exports = async (req, res) => {
  const action = lastSegment(req.url);
  // Whether this site has player accounts at all; the page asks before it shows a login.
  if (action === 'config') { res.status(200).json({ accounts: accountsOn() }); return; }
  if (!Object.prototype.hasOwnProperty.call(ROUTES, action)) {
    res.status(404).json({ code: 'not_found', error: 'Not found.' });
    return;
  }
  if (refuseWhenOff(res)) return;
  if (!req.query) req.query = {};
  if (req.query.action === action) delete req.query.action;
  return ROUTES[action]()(req, res);
};

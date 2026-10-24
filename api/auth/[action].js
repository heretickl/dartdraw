// One serverless function for every /api/auth/<action> endpoint (Vercel's Hobby plan allows 12 functions per
// deployment, so the handlers live in api/_routes/auth/ - folders starting with "_" are not deployed as functions -
// and this router picks one by the last path segment of the URL). Each handler is called unchanged with (req, res);
// method checks, cookies and error bodies stay inside the handlers.
//
//   /api/auth/login | logout | me | config | register | verify | resend-verification | forgot | reset | change-password
//
// The action is read from req.url, not from req.query.action, so it does not depend on how the platform shapes the
// query. Anything else answers 404 { code: 'not_found', error: 'Not found.' }. The literal require() paths keep the file tracer bundling
// every handler; they are loaded lazily, on first use.
const ROUTES = {
  login: () => require('../_routes/auth/login'),
  logout: () => require('../_routes/auth/logout'),
  me: () => require('../_routes/auth/me'),
  config: () => require('../_routes/auth/config'),
  register: () => require('../_routes/auth/register'),
  verify: () => require('../_routes/auth/verify'),
  'resend-verification': () => require('../_routes/auth/resend-verification'),
  forgot: () => require('../_routes/auth/forgot'),
  reset: () => require('../_routes/auth/reset'),
  'change-password': () => require('../_routes/auth/change-password')
};

function lastSegment(url) {
  let pathname;
  try { pathname = new URL(String(url || ''), 'http://x').pathname; } catch (e) { return ''; }
  const parts = pathname.split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}

module.exports = async (req, res) => {
  const action = lastSegment(req.url);
  if (!Object.prototype.hasOwnProperty.call(ROUTES, action)) {
    res.status(404).json({ code: 'not_found', error: 'Not found.' });
    return;
  }
  if (!req.query) req.query = {};
  // The platform adds the matched segment as query.action; the handlers never saw it before.
  if (req.query.action === action) delete req.query.action;
  return ROUTES[action]()(req, res);
};

// One serverless function for every /api/players/<action> endpoint, routed like api/auth/[action].js (the handlers
// live in api/_routes/players/, which is not deployed as functions, to stay within Vercel Hobby's 12 functions).
// Each handler is called unchanged with (req, res); sign-in checks, methods and error bodies stay inside them.
//
//   /api/players/list | ensure | update | remove | merge
//
// The action is read from req.url. Anything else answers 404 { code: 'not_found', error: 'Not found.' }.
const ROUTES = {
  list: () => require('../_routes/players/list'),
  ensure: () => require('../_routes/players/ensure'),
  update: () => require('../_routes/players/update'),
  remove: () => require('../_routes/players/remove'),
  merge: () => require('../_routes/players/merge')
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
  if (req.query.action === action) delete req.query.action;
  return ROUTES[action]()(req, res);
};

// One serverless function for every /api/friends/<action> endpoint (Vercel's Hobby plan allows 12 functions per
// deployment, so the handlers live in api/_routes/friends/ - folders starting with "_" are not deployed as functions -
// and this router picks one by the last path segment of the URL). Same pattern as the organiser app's api/auth/[action].js.
//
// The action is read from req.url, not from req.query.action. Anything else answers 404
// { code: 'not_found', error: 'Not found.' }. Handlers are added here as `name: () => require('../_routes/friends/name')`
// (literal paths, so the file tracer bundles them) and loaded lazily, on first use.
const ROUTES = {
  check: () => require('../_routes/friends/check'),
  add: () => require('../_routes/friends/add'),
  list: () => require('../_routes/friends/list'),
  accept: () => require('../_routes/friends/accept'),
  decline: () => require('../_routes/friends/decline'),
  cancel: () => require('../_routes/friends/cancel'),
  resend: () => require('../_routes/friends/resend'),
  update: () => require('../_routes/friends/update'),
  remove: () => require('../_routes/friends/remove'),
  block: () => require('../_routes/friends/block'),
  invite: () => require('../_routes/friends/invite')
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

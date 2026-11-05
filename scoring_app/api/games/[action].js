// One serverless function for every /api/games/<action> endpoint (Vercel's Hobby plan allows 12 functions per
// deployment, so the handlers live in api/_routes/games/ - folders starting with "_" are not deployed as functions -
// and this router picks one by the last path segment of the URL). Same pattern as the organiser app's api/auth/[action].js.
//
// The action is read from req.url, not from req.query.action. Anything else answers 404
// { code: 'not_found', error: 'Not found.' }. Handlers are added here as `name: () => require('../_routes/games/name')`
// (literal paths, so the file tracer bundles them) and loaded lazily, on first use.
const ROUTES = {
  save: () => require('../_routes/games/save'),
  list: () => require('../_routes/games/list'),
  one: () => require('../_routes/games/one'),
  scorecard: () => require('../_routes/games/scorecard'),
  'notices-read': () => require('../_routes/games/notices-read')
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

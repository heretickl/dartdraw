// One serverless function for every /api/live/<action> endpoint (live scoring), routed like api/score/[action].js
// (the handlers live in api/_routes/live/, which is not deployed as functions, to stay within Vercel Hobby's limit).
//
//   /api/live/login   a tablet or phone signs in with the event's scoring login -> a session (X-Live-Session)
//
// The action is read from req.url. Anything else answers 404 { code: 'not_found', error: 'Not found.' }.
const ROUTES = {
  login: () => require('../_routes/live/login')
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

// One serverless function for every /api/score/<action> endpoint (floor officials), routed like api/players/[action].js
// (the handlers live in api/_routes/score/, which is not deployed as functions, to stay within Vercel Hobby's limit).
//
//   /api/score/officials   the organiser's Floor officials panel (signed in): list, add, change, stop, new PIN, new link
//   /api/score/open        a floor official opens their link: link + PIN -> a session for that link
//   /api/score/matches     the official's matches (their boards only)
//   /api/score/result      one result (or no-show, "Neither showed", call) for one match
//
// The action is read from req.url. Anything else answers 404 { code: 'not_found', error: 'Not found.' }.
const ROUTES = {
  officials: () => require('../_routes/score/officials'),
  open: () => require('../_routes/score/open'),
  matches: () => require('../_routes/score/matches'),
  result: () => require('../_routes/score/result')
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

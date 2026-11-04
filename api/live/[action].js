// One serverless function for every /api/live/<action> endpoint (live scoring), routed like api/score/[action].js
// (the handlers live in api/_routes/live/, which is not deployed as functions, to stay within Vercel Hobby's limit).
//
//   /api/live/login   a tablet or phone signs in with the event's scoring login -> a session (X-Live-Session)
//   /api/live/boards  the boards a device can pick (and which are taken)
//   /api/live/matches the matches of the device's board (and of a board lent to it)
//   /api/live/pick    the device picks its board ({ board }) or claims a match ({ pos })
//   /api/live/turn    one turn the device keyed (idempotent on its id; kept, never applied, after finalise)
//   /api/live/state   the device moves its match to playing / awaitingConfirm
//   /api/live/confirm the device sends the match's final legs (applied through the rule engine, by 'dev')
//   /api/live/retire  a side retires: the existing no-show walkover
//   /api/live/panel   the organiser's Boards panel (organiser session, not a device): login, devices, boards, lend, log out
//
// The action is read from req.url. Anything else answers 404 { code: 'not_found', error: 'Not found.' }.
const ROUTES = {
  login: () => require('../_routes/live/login'),
  boards: () => require('../_routes/live/boards'),
  matches: () => require('../_routes/live/matches'),
  pick: () => require('../_routes/live/pick'),
  turn: () => require('../_routes/live/turn'),
  state: () => require('../_routes/live/state'),
  confirm: () => require('../_routes/live/confirm'),
  retire: () => require('../_routes/live/retire'),
  panel: () => require('../_routes/live/panel')
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

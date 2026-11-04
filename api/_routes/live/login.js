// /api/live/login: a tablet or phone signs in to an event's live scoring. POST { username, password }.
//   200 { token, device: { id }, tournament: { name, eventName } }   (token goes in X-Live-Session on every later call)
//   400 login_required · 401 bad_login · 403 live_off · 410 link_ended · 429 rate_limited · 503 live_not_set_up
// Wrong attempts are counted per address and username (api/_lib/live.js deviceLogin); the event's state is only told to
// someone who has the right password.
const { clientIp } = require('../../_lib/throttle');
const { sendError, bodyObject, methodNotAllowed, live } = require('./common');

module.exports = async (req, res) => {
  if (req.method !== 'POST') { methodNotAllowed(res); return; }
  const { username, password } = bodyObject(req);
  try {
    res.status(200).json(await live.deviceLogin(username, password, clientIp(req)));
  } catch (e) { sendError(res, e); }
};

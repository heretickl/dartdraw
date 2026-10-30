// /api/score/open: a floor official opens their link. POST { token, pin }.
//   200 { session, event: { name, date }, official: { name, boards }, endsAt }   (session goes in X-Score-Session)
//   401 bad_pin · 404 link_unknown · 410 link_* (stopped, replaced, finalized, ended) · 429 rate_limited
// Wrong PINs are counted per link and address: 5 in a minute block that pair for the rest of the minute (never longer:
// a volunteer must not be locked out on match day). A good PIN clears the count.
const crypto = require('crypto');
const { clientIp, hit, clear, isBlocked } = require('../../_lib/throttle');
const { sendError, bodyObject, methodNotAllowed, signScoreSession, sendRefused, officials } = require('./common');

const WINDOW_MS = 60 * 1000;
const PIN_LIMIT = 5;
/* and per link from any address (someone holding a forwarded link who changes address): 20 wrong in 10 minutes */
const LINK_WINDOW_MS = 10 * 60 * 1000;
const LINK_LIMIT = 20;
/* links that do not exist, per address */
const UNKNOWN_LIMIT = 30;

function samePin(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { methodNotAllowed(res); return; }
  const { token, pin } = bodyObject(req);
  if (typeof token !== 'string' || typeof pin !== 'string') { res.status(400).json({ code: 'pin_required', error: 'Enter the PIN.' }); return; }
  try {
    const ip = clientIp(req), th = officials.hashToken(token).slice(0, 16);
    const key = 'score-pin:' + th + ':' + ip, linkKey = 'score-pin-link:' + th;
    const found = await officials.findLive(token);
    if (found.refused === 'unknown') {
      if (await hit('score-link-unknown:' + ip, UNKNOWN_LIMIT, LINK_WINDOW_MS)) { res.status(429).json({ code: 'rate_limited', error: 'Too many attempts. Try again later.' }); return; }
      res.status(404).json({ code: 'link_unknown', error: 'This scoring link does not exist.' }); return;
    }
    if (found.refused) { sendRefused(res, found.refused); return; }
    if (await isBlocked(linkKey, LINK_LIMIT, LINK_WINDOW_MS) || await hit(key, PIN_LIMIT, WINDOW_MS)) { res.status(429).json({ code: 'rate_limited', error: 'Too many attempts. Try again later.' }); return; }
    if (!samePin(pin.trim(), found.official.pin)) { await hit(linkKey, LINK_LIMIT, LINK_WINDOW_MS); res.status(401).json({ code: 'bad_pin', error: 'That PIN is not right.' }); return; }
    await clear(key);
    await officials.touch(found.official.id, false);
    const ev = (found.tournament.data && found.tournament.data.eventCreation) || {};
    res.status(200).json({
      session: signScoreSession(found.official),
      event: { name: ev.tournamentName || '', eventName: ev.eventName || '', date: ev.date || '' },
      official: { name: found.official.name, boards: found.official.boards },
      endsAt: found.official.endsAt
    });
  } catch (e) { sendError(res, e); }
};

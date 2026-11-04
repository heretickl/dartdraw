// /api/live/turns: the history of one match, for the device that holds it NOW. GET ?pos=<pos> with X-Live-Session. After a take-over
// (takeover.js) the new device calls this to open the match exactly where it stopped: the same leg, scores and thrower, with the
// full history and undo (the scoring spec 8.2).
//   200 { ok, pos, state, summary: { legs, remaining, thrower, starter? },
//         turns: [{ id, leg, side, player, entered, supersedes }] }     the turns that count (never an ignored one), oldest first
//   400 invalid · 409 not_your_match (this device does not hold the match) · 409 match_paper · 409 match_over
//   401 no_session · 403 live_off · 410 link_ended · 503 live_not_set_up
// Nothing else about the match leaves here: no device ids, no ignored turns, nothing of the event.
const { sendError, methodNotAllowed, requireSession, refuse, refusePaper, live } = require('./common');

const OVER = ['confirmed', 'retired', 'voided'];

module.exports = async (req, res) => {
  if (req.method !== 'GET') { methodNotAllowed(res); return; }
  const pos = req.query && req.query.pos;
  if (typeof pos !== 'string' || !pos || pos.length > 200) { refuse(res, 400, 'invalid', 'Not a valid request.'); return; }
  try {
    const found = await requireSession(req, res);
    if (!found) return;
    const me = found.device.id, id = found.tournament.id;
    const row = await live.matchFull(id, pos);
    if (row && row.paper) { refusePaper(res); return; }
    if (!row || row.device_id !== me) { refuse(res, 409, 'not_your_match', 'This match is not on this device any more.'); return; }
    if (OVER.indexOf(row.state) >= 0) { refuse(res, 409, 'match_over', 'This match is over.'); return; }
    const turns = await live.matchTurns(id, pos);
    const sm = row.summary || {};
    const summary = {};
    ['legs', 'remaining', 'thrower', 'starter'].forEach((k) => { if (sm[k] !== undefined) summary[k] = sm[k]; });
    res.status(200).json({ ok: true, pos, state: row.state, summary, turns });
  } catch (e) { sendError(res, e); }
};

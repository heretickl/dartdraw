// /api/score/takeover: a floor official answers a waiting take-over request on one of their boards. POST { id, answer:'allow'|'deny' }
// with X-Score-Session. Allowed ONLY when the event's Live scoring settings let officials approve (officialsApprove) AND the
// request's match is on one of this official's boards. The same answer, with the same rules, as the organiser's (api/_routes/live/takeover.js
// decide): one answer wins, an allow moves the match to the asking device, the log keeps decided_by 'off:<official id>'.
//   200 { ok:true }
//   403 not_allowed (the event does not let officials answer) · 403 not_your_board · 403 live_off (not a Live event)
//   404 not_found · 400 invalid
//   409 takeover_answered · match_over (the request is void) · takeover_stale (the match moved: void)
//   410 link_* · 401 no_session · 503 officials / live not set up
const { bodyObject, methodNotAllowed, scoreSession, sendRefused, sendError } = require('./common');
const LiveSettings = require('../../../live-settings');

module.exports = async (req, res) => {
  if (req.method !== 'POST') { methodNotAllowed(res); return; }
  const b = bodyObject(req);
  if (typeof b.id !== 'string' || !b.id || b.id.length > 100 || (b.answer !== 'allow' && b.answer !== 'deny')) { res.status(400).json({ ok: false, code: 'invalid', error: 'Not a valid result.' }); return; }
  try {
    const found = await scoreSession(req);
    if (!found) { res.status(401).json({ ok: false, code: 'no_session', error: 'Open your scoring link again.' }); return; }
    if (found.refused) { sendRefused(res, found.refused); return; }
    const data = found.tournament.data;
    if (!LiveSettings.isLive(data)) { res.status(403).json({ ok: false, code: 'live_off', error: 'Live scoring is not switched on for this event.' }); return; }
    if (!LiveSettings.scoringOf(data).officialsApprove) { res.status(403).json({ ok: false, code: 'not_allowed', error: 'The organiser has not allowed floor officials to answer take-over requests.' }); return; }
    const live = require('../../_lib/live');
    const { load } = require('../live/view');
    const { decide } = require('../live/takeover');
    const tk = await live.takeoverById(found.tournament.id, b.id);
    if (!tk) { res.status(404).json({ ok: false, code: 'not_found', error: 'Not found.' }); return; }
    const ctx = load({ tournament: found.tournament });
    const slot = ctx.slotsByPos[tk.pos], boards = found.official.boards;
    if (!slot || !(slot.boards || []).some((x) => boards.indexOf(Number(x)) >= 0)) { res.status(403).json({ ok: false, code: 'not_your_board', error: 'This match is not on your boards any more.' }); return; }
    const out = await decide(found.tournament, b.id, b.answer, 'off:' + found.official.id, ctx);
    if (!out.ok) { res.status(out.status).json(Object.assign({ ok: false }, out.body)); return; }
    res.status(200).json({ ok: true });
  } catch (err) {
    if (err && err.code === 'not_set_up') { res.status(503).json({ ok: false, code: 'live_not_set_up', error: 'Live scoring is not set up yet.' }); return; }
    sendError(res, err);
  }
};

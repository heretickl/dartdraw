// /api/live/state: the device moves a match it holds along. POST with X-Live-Session { pos, to, starter? }
//   to 'playing'          check-in and the bull are done (from waiting / checkedIn), or "Fix a leg" (from awaitingConfirm).
//                         The first time sets started_at. starter ('a'|'b', who throws first) is kept in the match's summary.
//                         Re-checked here: 409 player_busy when either entrant is playing ANOTHER match.
//   to 'awaitingConfirm'  the match is won on the device (from playing).
//   200 { ok, slot }      (a state the match is in already answers 200 too; a starter sent is stored)
//   400 invalid · 409 not_your_match · 409 match_paper · 409 wrong_state · 409 match_over · 409 changed_by_organiser · 409 player_busy · 409 missing
//   410 link_ended (finalized events are refused) · 401 no_session · 403 live_off · 503 live_not_set_up
const { sendError, bodyObject, methodNotAllowed, requireSession, refuse, refusePaper, live } = require('./common');
const { load, matchView, heldPlace, busyEntries } = require('./view');
const LiveBoards = require('../../../live-boards');

module.exports = async (req, res) => {
  if (req.method !== 'POST') { methodNotAllowed(res); return; }
  const b = bodyObject(req);
  if (typeof b.pos !== 'string' || !b.pos || b.pos.length > 200 || (b.to !== 'playing' && b.to !== 'awaitingConfirm') ||
      (b.starter != null && b.starter !== 'a' && b.starter !== 'b')) { refuse(res, 400, 'invalid', 'Not a valid request.'); return; }
  try {
    const found = await requireSession(req, res);
    if (!found) return;
    const me = found.device.id, id = found.tournament.id, pos = b.pos, to = b.to;
    const row = await live.matchFull(id, pos);
    if (row && row.paper) { refusePaper(res); return; }
    if (!row || row.device_id !== me) { refuse(res, 409, 'not_your_match', 'This match is not on this device any more.'); return; }
    if (row.changed_by_organiser) { refuse(res, 409, 'changed_by_organiser', 'The organiser entered this result.'); return; }
    if (row.state === 'confirmed' || row.state === 'retired' || row.state === 'voided') { refuse(res, 409, 'match_over', 'This match is over.'); return; }
    const ctx = load(found), s = ctx.slotsByPos[pos];
    if (!s || !s.a || !s.b || (s.kind === 'ko' && s.m && s.m.bye)) { refuse(res, 409, 'missing', 'This match is not in the event.'); return; }
    const place = heldPlace(row, me, found.device.board) || { own: true, board: row.board != null ? row.board : found.device.board };
    const answer = (state) => res.status(200).json({ ok: true, slot: matchView(ctx, s, Object.assign({}, row, { state }), place, me, {}) });
    if (LiveBoards.slotDone(s)) {
      // the organiser's result is in the event already (D18): it stands
      await live.markChangedByOrganiser(id, pos);
      refuse(res, 409, 'changed_by_organiser', 'The organiser entered this result.'); return;
    }
    const patch = JSON.stringify(b.starter ? { starter: b.starter } : {});
    if (to === 'playing') {
      if (row.state === 'playing') { if (b.starter) await live.setPlaying(id, pos, me, patch); answer('playing'); return; }   // already playing (the starter may still be new)
      const others = (await live.liveRows(id)).filter((r) => r.pos !== pos);
      const busy = busyEntries(ctx.slotsByPos, others);
      if (busy[s.a] || busy[s.b]) { refuse(res, 409, 'player_busy', 'A player in this match is playing another match.'); return; }
      if (!(await live.setPlaying(id, pos, me, patch))) { refuse(res, 409, 'wrong_state', 'This match cannot be started now.'); return; }
      answer('playing'); return;
    }
    if (row.state === 'awaitingConfirm') { answer('awaitingConfirm'); return; }
    if (row.state !== 'playing' || !(await live.setAwaitingConfirm(id, pos, me))) { refuse(res, 409, 'wrong_state', 'This match is not being played.'); return; }
    answer('awaitingConfirm');
  } catch (e) { sendError(res, e); }
};

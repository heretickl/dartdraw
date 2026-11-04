// /api/live/confirm: the device sends the match's final legs. POST with X-Live-Session { pos, la, lb }
//   la = slot.a's legs, lb = slot.b's (the fields matchView calls a and b). The result goes in through the same rule engine as the
//   organiser's screens (applyResult 'score', by 'dev'); best-of / majority checks stay in resultError.
//   200 { ok, slot }                      saved (sent again after a lost answer, and the event still holds exactly this result: 200 with duplicate:true; a match already
//                                         confirmed never has anything applied again)
//   400 invalid                           not a valid score for this match: nothing changes
//   409 not_your_match                    this device does not hold the match
//   409 match_paper                       the match is scored on paper
//   409 wrong_state                       the match has not started (state waiting / checkedIn)
//   409 changed_by_organiser              the organiser (or a cleared result: nothing is put back)'s result stands over this device's match (D18); the match row is marked
//   409 match_over · not_open · missing · blocked · 503 busy
//   410 link_ended (reason finalized)     the event is finalized: this route opts in to the session only to answer that itself
//   401 no_session · 403 live_off · 503 live_not_set_up
const { sendError, bodyObject, methodNotAllowed, requireSession, sendRefused, refuse, refusePaper, live } = require('./common');
const { applyForDevice, slotAnswer } = require('./apply');
const { load, startForOf } = require('./view');
const { x01Totals } = require('../../_lib/live-summary');

const legsOk = (v) => Number.isInteger(v) && v >= 0 && v <= 99;

module.exports = async (req, res) => {
  if (req.method !== 'POST') { methodNotAllowed(res); return; }
  const b = bodyObject(req);
  if (typeof b.pos !== 'string' || !b.pos || b.pos.length > 200 || !legsOk(b.la) || !legsOk(b.lb)) { refuse(res, 400, 'invalid', 'Not a valid result.'); return; }
  try {
    const found = await requireSession(req, res, { allowFinalized: true });
    if (!found) return;
    if (found.finalized) { sendRefused(res, 'finalized'); return; }
    const me = found.device.id, id = found.tournament.id, pos = b.pos;
    const row = await live.matchFull(id, pos);
    if (row && row.paper) { refusePaper(res); return; }
    if (!row || row.device_id !== me) { refuse(res, 409, 'not_your_match', 'This match is not on this device any more.'); return; }
    if (row.changed_by_organiser) { refuse(res, 409, 'changed_by_organiser', 'The organiser entered this result.'); return; }
    if (row.state === 'retired' || row.state === 'voided') { refuse(res, 409, 'match_over', 'This match is over.'); return; }
    if (row.state !== 'playing' && row.state !== 'awaitingConfirm' && row.state !== 'confirmed') { refuse(res, 409, 'wrong_state', 'This match has not started.'); return; }
    // The match's x01 points and darts (for the 3-dart average), written onto the result in the same write as the result.
    let x01 = null;
    if (row.state !== 'confirmed') {
      const turns = await live.matchTurns(id, pos);   // a failed read stops the confirm: the device sends it again
      let startFor;
      try { startFor = startForOf(load(found), pos); } catch (e) { startFor = undefined; }
      x01 = x01Totals(turns, startFor);
    }
    const out = await applyForDevice(found, pos, 'score', { la: b.la, lb: b.lb }, { settled: row.state === 'confirmed', x01 });
    if (out.refused) { sendRefused(res, out.refused); return; }
    if (out.organiser) {
      await live.markChangedByOrganiser(id, pos);
      refuse(res, 409, 'changed_by_organiser', 'The organiser entered this result.'); return;
    }
    if (out.fail) { refuse(res, out.fail[0], out.fail[1], out.fail[2]); return; }
    await live.setConfirmed(id, pos, me);
    res.status(200).json(Object.assign({ ok: true }, out.duplicate ? { duplicate: true } : {}, { slot: slotAnswer(found, out.data, pos, row, 'confirmed') }));
  } catch (e) { sendError(res, e); }
};

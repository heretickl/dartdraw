// /api/live/retire: the device's match is over because a side retires. POST with X-Live-Session { pos, side:'a'|'b' }
//   side = the retiring side (a = slot.a). Retirement keeps today's no-show behaviour (owner ruling, 2026-11-04): the existing
//   applyResult 'noShow' op, by 'dev' (the opponent is given the walkover legs, Teams: teamWalkoverLegs; in a group the retiring
//   entry's other unplayed group matches are walkover losses too and the entry is flagged noShow). The turns stay as they are.
//   200 { ok, slot }                      saved (sent again after a lost answer: the same 200)
//   400 invalid · 409 not_your_match · 409 changed_by_organiser (the organiser's result stands; the row is marked) · 409 match_over ·
//   409 not_open · missing · blocked · 503 busy
//   410 link_ended (the event is finalized: no opt-in) · 401 no_session · 403 live_off · 503 live_not_set_up
const { sendError, bodyObject, methodNotAllowed, requireSession, sendRefused, refuse, live } = require('./common');
const { applyForDevice, slotAnswer } = require('./apply');

module.exports = async (req, res) => {
  if (req.method !== 'POST') { methodNotAllowed(res); return; }
  const b = bodyObject(req);
  if (typeof b.pos !== 'string' || !b.pos || b.pos.length > 200 || (b.side !== 'a' && b.side !== 'b')) { refuse(res, 400, 'invalid', 'Not a valid request.'); return; }
  try {
    const found = await requireSession(req, res);
    if (!found) return;
    const me = found.device.id, id = found.tournament.id, pos = b.pos, side = b.side;
    const row = await live.matchFull(id, pos);
    if (!row || row.device_id !== me || row.paper) { refuse(res, 409, 'not_your_match', 'This match is not on this device any more.'); return; }
    if (row.changed_by_organiser) { refuse(res, 409, 'changed_by_organiser', 'The organiser entered this result.'); return; }
    if (row.state === 'confirmed' || row.state === 'voided' || (row.state === 'retired' && row.retired_side !== side)) { refuse(res, 409, 'match_over', 'This match is over.'); return; }
    const out = await applyForDevice(found, pos, 'noShow', { side }, { settled: row.state === 'retired' });
    if (out.refused) { sendRefused(res, out.refused); return; }
    if (out.organiser) {
      await live.markChangedByOrganiser(id, pos);
      refuse(res, 409, 'changed_by_organiser', 'The organiser entered this result.'); return;
    }
    if (out.fail) { refuse(res, out.fail[0], out.fail[1], out.fail[2]); return; }
    await live.setRetired(id, pos, me, side);
    res.status(200).json(Object.assign({ ok: true }, out.duplicate ? { duplicate: true } : {}, { slot: slotAnswer(found, out.data, pos, row, 'retired') }));
  } catch (e) { sendError(res, e); }
};

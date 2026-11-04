// /api/live/takeover: a device asks to take a match over from the device that is scoring it (spec 7.4, decision D4, the scoring spec
// 8.2 "the device dies mid-match"). With X-Live-Session (a device of the event; a finalized event is refused as everywhere else):
//   POST { pos }       the device asks for a match another device holds and has started (checked in, playing, awaiting confirmation)
//                      200 { ok, id, state: 'pending' } (also when THIS device's own request is the one waiting: its id again)
//                      400 invalid · 404 missing · 409 not_takeoverable (the device holds it itself, nobody holds it, it has not started: a
//                      match in 'waiting' state is picked, not taken over) · 409 match_over · 409 takeover_pending (a request for this match
//                      is waiting already, and it is another device's: one per match)
//   GET  ?id=<id>      the asking device polls its own request: 200 { ok, state: 'pending' | 'allowed' | 'denied' | 'void' }
//                      404 not_found (not a request of this device)
//   401 no_session · 403 live_off · 410 link_ended · 503 live_not_set_up
// Answering is NOT here: the organiser answers through the panel route (op 'takeover') and a floor official through
// /api/score/takeover (only when the event lets officials approve, and only for their boards). Both use `decide` below.
// An allowed request moves the match to the asking device in one compare-and-set on the current holder; nothing else about the
// match changes, so the new device opens it where it stopped (GET /api/live/turns). The old device's later turns are kept as
// ignored ('not_holder'), never applied.
const { sendError, bodyObject, methodNotAllowed, requireSession, refuse, live } = require('./common');
const { load } = require('./view');
const LiveBoards = require('../../../live-boards');

const ID = /^[A-Za-z0-9_.:-]{1,100}$/;
const OVER = ['confirmed', 'retired', 'voided'];
const STATE_OF = { allow: 'allowed', deny: 'denied', void: 'void' };

async function request(req, res) {
  const b = bodyObject(req);
  if (typeof b.pos !== 'string' || !b.pos || b.pos.length > 200) { refuse(res, 400, 'invalid', 'Not a valid request.'); return; }
  const found = await requireSession(req, res);
  if (!found) return;
  const me = found.device.id, id = found.tournament.id, pos = b.pos;
  const s = load(found).slotsByPos[pos];
  if (!s || !s.a || !s.b || (s.kind === 'ko' && s.m && s.m.bye)) { refuse(res, 404, 'missing', 'This match is not in the event.'); return; }
  const row = await live.matchFull(id, pos);
  if (LiveBoards.slotDone(s) || (row && OVER.indexOf(row.state) >= 0)) { refuse(res, 409, 'match_over', 'This match is over.'); return; }
  const held = LiveBoards.heldBy(row);
  if (!held || held === me || row.changed_by_organiser || ['checkedIn', 'playing', 'awaitingConfirm'].indexOf(row.state) < 0) { refuse(res, 409, 'not_takeoverable', 'This match cannot be taken over.'); return; }
  const made = await live.requestTakeover(id, pos, held, me);
  if (!made) {
    // this device's own request is the one waiting (it lost its id): hand the id back instead of refusing
    const mine = (await live.matchTakeovers(id, pos)).filter((k) => k.answer == null && k.to_device === me)[0];
    if (mine) { res.status(200).json({ ok: true, id: mine.id, state: 'pending' }); return; }
    refuse(res, 409, 'takeover_pending', 'A request to take over this match is waiting already.'); return; }
  res.status(200).json({ ok: true, id: made, state: 'pending' });
}

async function status(req, res) {
  const tid = req.query && req.query.id;
  if (typeof tid !== 'string' || !ID.test(tid)) { refuse(res, 404, 'not_found', 'Not found.'); return; }
  const found = await requireSession(req, res);
  if (!found) return;
  const me = found.device.id, id = found.tournament.id;
  const tk = await live.takeoverById(id, tid);
  if (!tk || tk.to_device !== me) { refuse(res, 404, 'not_found', 'Not found.'); return; }
  if (tk.answer) { res.status(200).json({ ok: true, state: STATE_OF[tk.answer] || 'void' }); return; }
  // still waiting: it is void once the match is no longer held by the device it names (ended, or moved)
  const row = await live.matchFull(id, tk.pos);
  if (!row || LiveBoards.heldBy(row) !== tk.from_device) {
    const won = await live.answerTakeover(id, tid, 'void', 'system');
    if (won) { res.status(200).json({ ok: true, state: 'void' }); return; }
    const now = await live.takeoverById(id, tid);   // somebody answered at the same moment: say what they said
    res.status(200).json({ ok: true, state: now && now.answer ? (STATE_OF[now.answer] || 'void') : 'pending' });
    return;
  }
  res.status(200).json({ ok: true, state: 'pending' });
}

/* The organiser's or a floor official's answer to a waiting request. ev: the event ({ id, data }); id: the request; answer:
   'allow' | 'deny'; decidedBy: 'org:<id>' | 'off:<id>'; ctx: view.load(...) when the caller has it. Exactly one of any number of
   simultaneous answers wins (answerTakeover compares-and-sets on "not answered yet"). Resolves { ok: true } or { status, body }
   (the refusal to send). A request for a match that is over becomes void (match_over); an allow whose match moved on meanwhile
   becomes void (takeover_stale) and the match stays where it is (allow is ONE statement: the answer and the move cannot part). */
async function decide(ev, id, answer, decidedBy, ctx) {
  const tid = ev.id;
  const tk = await live.takeoverById(tid, id);
  if (!tk) return { status: 404, body: { code: 'not_found', error: 'Not found.' } };
  const answered = { status: 409, body: { code: 'takeover_answered', error: 'That request has already been answered.' } };
  if (tk.answer) return answered;
  const c = ctx || load({ tournament: ev });
  const row = await live.matchFull(tid, tk.pos), slot = c.slotsByPos[tk.pos];
  if (!row || !slot || row.paper || row.changed_by_organiser || OVER.indexOf(row.state) >= 0 || LiveBoards.slotDone(slot)) {
    if (!(await live.answerTakeover(tid, id, 'void', decidedBy))) return answered;
    return { status: 409, body: { code: 'match_over', error: 'This match is over.' } };
  }
  if (answer === 'allow') {
    // one statement: the answer and the move of the match happen together (live.allowTakeover)
    const final = await live.allowTakeover(tid, id, decidedBy);
    if (!final) return answered;
    if (final === 'void') return { status: 409, body: { code: 'takeover_stale', error: 'That match has moved on, so the request was cancelled.' } };
    return { ok: true };
  }
  if (!(await live.answerTakeover(tid, id, answer, decidedBy))) return answered;
  return { ok: true };
}

module.exports = async (req, res) => {
  try {
    if (req.method === 'POST') await request(req, res);
    else if (req.method === 'GET') await status(req, res);
    else methodNotAllowed(res);
  } catch (e) { sendError(res, e); }
};
module.exports.decide = decide;

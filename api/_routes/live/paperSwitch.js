// The "Scored on paper" switch (spec 10.5, D16), shared by /api/live/panel (the organiser, op 'paper') and /api/score/result (a floor
// official, op 'paper'). Not a route. A match scored on paper is on no tablet's list, is held by no device and takes no turn: the live
// row says paper (state 'paper'), and a device that held the match is let go (its next turn, state, confirm or retire is refused with
// 409 match_paper; the turn is kept as ignored 'paper'). Turning it off sends the match back to the tablets (state 'waiting'), but only
// while the event holds no result for it.
//   switchPaper(tournamentId, slot, on, confirm) -> { ok: true, row }                  done (or already so); row: the live row now
//                                                 | { status, body }                    a refusal, nothing changed:
//     404 not_found          the event has no such match
//     409 match_over         switching ON for a match that already has a result
//     409 needs_confirm      switching ON for a match a device holds, confirm not given ({ code, held: true })
//     409 paper_has_result   switching OFF for a match that has a result (it stays on paper)
// slot: the match as results-engine resultSlots has it. confirm: the person said yes to taking the match off the tablet.
const LiveBoards = require('../../../live-boards');
const live = require('../../_lib/live');

const OVER = ['confirmed', 'retired', 'voided'];
const NEEDS_CONFIRM = () => ({ status: 409, body: { code: 'needs_confirm', error: 'A tablet is scoring this match.', held: true } });
const MATCH_OVER = () => ({ status: 409, body: { code: 'match_over', error: 'This match is over.' } });
const HAS_RESULT = () => ({ status: 409, body: { code: 'paper_has_result', error: 'This match already has a result, so it cannot go back to the tablets.' } });

async function switchPaper(tournamentId, slot, on, confirm) {
  if (!slot) return { status: 404, body: { code: 'not_found', error: 'Not found.' } };
  const pos = slot.pos;
  const row = await live.liveRow(tournamentId, pos);
  const over = !!row && OVER.indexOf(row.state) >= 0;
  const done = LiveBoards.slotDone(slot);
  if (on) {
    if (row && row.paper) return { ok: true, row };
    if (done || over) return MATCH_OVER();
    if (LiveBoards.heldBy(row) && confirm !== true) return NEEDS_CONFIRM();
    const own = row && row.board != null ? row.board : ((slot.boards || [])[0] != null ? Number(slot.boards[0]) : null);
    if (!(await live.setPaperOn(tournamentId, pos, Number.isInteger(own) ? own : null, confirm === true))) {
      const now = await live.liveRow(tournamentId, pos);   // changed meanwhile: a device took the match, or it ended
      if (now && now.paper) return { ok: true, row: now };
      if (now && OVER.indexOf(now.state) >= 0) return MATCH_OVER();
      return NEEDS_CONFIRM();
    }
    return { ok: true, row: await live.liveRow(tournamentId, pos) };
  }
  if (!row || !row.paper) return { ok: true, row };
  if (done || over) return HAS_RESULT();
  if (!(await live.setPaperOff(tournamentId, pos))) return HAS_RESULT();
  return { ok: true, row: await live.liveRow(tournamentId, pos) };
}

module.exports = { switchPaper };

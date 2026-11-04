// /api/live/pick: a device picks its board, or claims a match. POST with X-Live-Session, one of
//   { board }  the device's board, once                    200 { ok, board }
//              400 invalid_board · 409 board_set (it has another board already) · 409 board_taken (another signed-in device holds
//              it and no running lend lends it)
//   { pos }    the device claims a match to score          200 { ok, match }   (a claim already made by this device answers 200 again)
//              409 no_board · 404 missing · 403 not_your_board (not on this device's board or a board lent to it; a knockout match
//              with no board is on none) · 409 paper · 409 done · 409 not_open (its players or its group are not ready) ·
//              409 taken (another device holds it, or won the same moment) · 409 player_busy (a player is playing another match)
//   401 no_session · 403 live_off · 410 link_ended · 503 live_not_set_up
// The claim is one compare-and-set (api/_lib/live.js claimMatch): of any number of simultaneous callers exactly one wins.
const { sendError, bodyObject, methodNotAllowed, requireSession, live } = require('./common');
const { boardCountOf, load, matchView, placeFor, heldPlace, busyEntries } = require('./view');
const LiveBoards = require('../../../live-boards');

const refuse = (res, status, code, error) => res.status(status).json({ ok: false, code: code, error });

async function pickBoard(found, res, raw) {
  const n = typeof raw === 'number' ? raw : (typeof raw === 'string' && /^\d{1,4}$/.test(raw.trim()) ? Number(raw) : NaN);
  if (!Number.isInteger(n) || n < 1 || n > boardCountOf(found.tournament.data)) { refuse(res, 400, 'invalid_board', 'That is not one of this event\'s boards.'); return; }
  if (found.device.board != null) {
    if (found.device.board === n) { res.status(200).json({ ok: true, board: n }); return; }
    refuse(res, 409, 'board_set', 'This device already has a board.'); return;
  }
  if (!(await live.setBoard(found.device.id, found.tournament.id, n))) { refuse(res, 409, 'board_taken', 'Another device is on that board.'); return; }
  res.status(200).json({ ok: true, board: n });
}

async function claim(found, res, pos) {
  const me = found.device.id, id = found.tournament.id, myBoard = found.device.board;
  if (myBoard == null) { refuse(res, 409, 'no_board', 'Pick a board first.'); return; }
  const ctx = load(found);
  const s = ctx.slotsByPos[pos];
  if (!s || !s.a || !s.b || (s.kind === 'ko' && s.m && s.m.bye)) { refuse(res, 404, 'missing', 'This match is not in the event.'); return; }
  const [rows, lends] = await Promise.all([live.liveRows(id), live.liveLends(id)]);
  const row = rows.find((r) => r.pos === pos) || null;
  const place = heldPlace(row, me, myBoard) || placeFor(s, myBoard, lends);   // a match this device already holds never depends on a lend
  if (!place) { refuse(res, 403, 'not_your_board', 'This match is not on your board.'); return; }
  if (row && row.paper) { refuse(res, 409, 'paper', 'This match is scored on paper.'); return; }
  if (LiveBoards.slotDone(s)) { refuse(res, 409, 'done', 'This match is already finished.'); return; }
  if (!s.open) { refuse(res, 409, 'not_open', 'This match is not ready to play.'); return; }
  const busy = busyEntries(ctx.slotsByPos, rows);
  const answer = (r) => res.status(200).json({ ok: true, match: matchView(ctx, s, r, place, me, busy) });
  const held = LiveBoards.heldBy(row);
  if (held === me) { answer(row); return; }
  if (held) { refuse(res, 409, 'taken', 'Another device has this match.'); return; }
  if (busy[s.a] || busy[s.b]) { refuse(res, 409, 'player_busy', 'A player in this match is playing another match.'); return; }
  const board = place.forBoard || myBoard;   // a lent match stays in its own board group
  if (!(await live.claimMatch(id, pos, me, board, myBoard))) {
    const now = await live.liveRow(id, pos);   // the same device sending twice at once: the first one won, so this is still a yes
    if (now && now.device_id === me) { answer(now); return; }
    refuse(res, 409, 'taken', 'Another device has this match.'); return;
  }
  if (lends.length) {   // this may have been the last waiting match of a lent board: the lend ends by itself (spec 7.3); the claim stands whatever happens here
    try { await live.endIdleLends(id, found.tournament); } catch (e) { console.error('live endIdleLends failed: ' + (e && e.message ? e.message : e)); }
  }
  answer(Object.assign({}, row || { pos, state: 'waiting', paper: false, retired_side: null }, { device_id: me, board, played_on_board: myBoard }));
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { methodNotAllowed(res); return; }
  const b = bodyObject(req);
  const hasBoard = b.board !== undefined, hasPos = b.pos !== undefined;
  if (hasBoard === hasPos || (hasPos && (typeof b.pos !== 'string' || !b.pos || b.pos.length > 200))) { refuse(res, 400, 'invalid', 'Send a board or a match.'); return; }
  try {
    const found = await requireSession(req, res);
    if (!found) return;
    if (hasBoard) await pickBoard(found, res, b.board); else await claim(found, res, b.pos);
  } catch (e) { sendError(res, e); }
};

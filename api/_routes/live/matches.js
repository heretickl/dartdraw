// /api/live/matches: the matches a device can score. GET with X-Live-Session (the device has picked a board).
//   200 { board, matches: [{ pos, state, kind, group, round, bracket, legs, a: { name, members }, b: { name, members }, board,
//         info, game: { game, inOut, bull, decider, orderRule }, segments?, teamCap?, mine?, onAnother?, playerBusy?,
//         forBoard?, playedOn?, done?, result?, takeoverable?, inProgress?, pending? }] }
//   409 no_board (pick a board first) · 401 no_session · 403 live_off · 410 link_ended · 503 live_not_set_up
// The device's board's matches in play order (round robin: the group's own order; knockout: bracket order), then the matches of
// a board lent to it (forBoard = that board, playedOn = this device's board), then the matches in progress on another device on a
// board this device does not play (always onAnother + takeoverable: any signed-in device may ask to take them over), then the matches already done. A knockout match
// without a board and a match scored on paper are on no list. A match another device holds is listed with onAnother and cannot
// be picked; one in progress there (checked in, playing, awaiting confirmation) also has takeoverable, inProgress { legs, remaining,
// thrower } and pending ('mine' | 'other' | null: a waiting take-over request, see takeover.js). state is live-boards.js's (waiting, called, checkedIn, playing, awaitingConfirm, confirmed, voided ...).
const { sendError, methodNotAllowed, requireSession, live } = require('./common');
const { buildList } = require('./view');

module.exports = async (req, res) => {
  if (req.method !== 'GET') { methodNotAllowed(res); return; }
  try {
    const found = await requireSession(req, res);
    if (!found) return;
    if (found.device.board == null) { res.status(409).json({ code: 'no_board', error: 'Pick a board first.' }); return; }
    const id = found.tournament.id;
    const [rows, lends] = await Promise.all([live.liveRows(id), live.liveLends(id)]);
    const takeovers = await live.openTakeovers(id, { rows });
    res.status(200).json({ board: found.device.board, matches: buildList(found, rows, lends, takeovers) });
  } catch (e) { sendError(res, e); }
};

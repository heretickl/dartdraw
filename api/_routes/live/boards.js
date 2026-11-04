// /api/live/boards: the boards a device can pick. GET with X-Live-Session.
//   200 { boards: [{ n, taken }], mine }   n: 1..the event's boards; taken: another signed-in device holds it (and no running lend
//                                          lends it); mine: this device's own board, or null before it has picked
//   401 no_session · 403 live_off · 410 link_ended · 503 live_not_set_up
const { sendError, methodNotAllowed, requireSession, live } = require('./common');
const { boardCountOf } = require('./view');

module.exports = async (req, res) => {
  if (req.method !== 'GET') { methodNotAllowed(res); return; }
  try {
    const found = await requireSession(req, res);
    if (!found) return;
    const [holders, lends] = await Promise.all([live.boardHolders(found.tournament.id), live.liveLends(found.tournament.id)]);
    const n = boardCountOf(found.tournament.data), boards = [];
    for (let i = 1; i <= n; i++) {
      const held = holders.some((h) => h.id !== found.device.id && h.board === i);
      boards.push({ n: i, taken: held && !lends.some((l) => l.from === i) });
    }
    res.status(200).json({ boards, mine: found.device.board });
  } catch (e) { sendError(res, e); }
};

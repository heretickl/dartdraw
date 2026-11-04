// /api/live/panel: the organiser's Boards panel (spec 7.1 to 7.3). The organiser's own session (requireAuth, exactly like
// api/_routes/score/officials.js), not a device's; an organiser reaches their own events, an Admin any. Another organiser's event
// answers 404 not_found.
//   GET  ?t=<event id>            -> the panel (below). 403 live_off when the event is not a Live event. Reading it first ends the
//                                    lends whose board has no waiting match left.
//   POST { t, op, ... }           -> the panel again, after the op:
//     op 'enable'                 the event's scoring login (made once; the same one every time after)
//     op 'newPassword'            a new password: every device is logged out (their waiting matches go back to the pool)
//     op 'logout' { deviceId }    one device logged out (a match it is playing stays held, for a take-over: spec 7.4)
//     op 'lend' { from, to }      board `from` (free, with a device) lends its whole tablet to board `to` (which has waiting matches)
//     op 'endLend' { id }         a lend ends (a match the lent device already holds stays its own)
//   The ops of later tasks (close event, take-over answers, knockout board suggestions, the paper switch) are added to OPS below.
//   { login: {username, password} | null, devices: [{ id, board, lastSeenAt, unsent, loggedOut }],
//     boards: [{ n, group, ko, playing: {pos, state, info, a, b} | null, waiting, devices: [ids], lentTo?, lentFrom? }],
//     lends: [{ id, from, to, startedAt }], playingCount, now }
// group: the labels of the round robin groups and pods played on the board, joined by ", " ('' when none); ko: knockout matches are on
// it. playingCount: matches a device holds that are checked in, playing or awaiting confirmation (the Manual switch is refused while it is not 0).
// The password hash never leaves the server; the login's password is shown here, to the signed-in organiser only.
const { requireAuth } = require('../../_lib/auth');
const { sendError, bodyObject, methodNotAllowed, live } = require('./common');
const { boardCountOf, load, waitingOn, entryOf } = require('./view');
const LiveSettings = require('../../../live-settings');
const LiveBoards = require('../../../live-boards');

const ACTIVE = ['checkedIn', 'playing', 'awaitingConfirm'];
const isFinalized = (data) => !!(data && typeof data === 'object' && data.finalized);
const asBoard = (v) => (typeof v === 'number' ? v : (typeof v === 'string' && /^\d{1,4}$/.test(v.trim()) ? Number(v) : NaN));

/* The panel for an event the caller already owns (ev: { id, data }). */
async function panelOf(organizer, ev) {
  const t = ev.id;
  const login = await live.show(organizer, t);
  const now = Date.now();
  if (!login) return { login: null, devices: [], boards: [], lends: [], playingCount: 0, now };
  const ctx = load({ tournament: ev });
  const rows = await live.liveRows(t);
  await live.endIdleLends(t, ev, { ctx, rows });
  const [devices, lends] = await Promise.all([live.panelDevices(t), live.activeLends(t)]);
  const rowBy = {};
  rows.forEach((r) => { rowBy[r.pos] = r; });
  /* what is playing, per board (the match's own board group), and how many matches are in progress in all */
  const playingBy = {};
  let playingCount = 0;
  const seen = {};
  ctx.slots.forEach((s) => {
    seen[s.pos] = true;
    const row = rowBy[s.pos];
    if (!row || !LiveBoards.heldBy(row) || LiveBoards.slotDone(s)) return;
    const state = LiveBoards.stateOf(s, row, false);
    if (ACTIVE.indexOf(state) < 0) return;
    playingCount++;
    const board = row.board != null ? row.board : ((s.boards || [])[0] != null ? Number(s.boards[0]) : null);
    if (board == null || playingBy[board]) return;
    const ei = (id) => entryOf(ctx.byId, id).name;
    playingBy[board] = { pos: s.pos, state, info: ctx.e.plain(ctx.e.matchInfo(ctx.t, s)), a: ei(s.a), b: ei(s.b) };
  });
  rows.forEach((r) => { if (!seen[r.pos] && LiveBoards.heldBy(r) && ACTIVE.indexOf(r.state) >= 0) playingCount++; });   // a match the event no longer shows still counts
  const n = boardCountOf(ev.data), boards = [];
  for (let i = 1; i <= n; i++) {
    const labels = [];
    let ko = false;
    ctx.slots.forEach((s) => {
      if ((s.boards || []).map(Number).indexOf(i) < 0) return;
      const label = s.kind === 'rr' ? s.group.label : (s.pod ? s.pod.label : null);
      if (label) { if (labels.indexOf(label) < 0) labels.push(String(label)); } else ko = true;
    });
    const b = {
      n: i, group: labels.join(', '), ko, playing: playingBy[i] || null, waiting: waitingOn(ctx, rows, i).length,
      devices: devices.filter((d) => !d.loggedOut && d.board === i).map((d) => d.id)
    };
    const out = lends.find((l) => l.from === i), inn = lends.find((l) => l.to === i);
    if (out) b.lentTo = out.to;
    if (inn) b.lentFrom = inn.from;
    boards.push(b);
  }
  return { login, devices, boards, lends, playingCount, now };
}

/* The ops that change something. Each gets (organizer, ev, body, res) and returns true when it has sent its own refusal. */
const OPS = {
  async enable(organizer, ev) { await live.enable(organizer, ev.id); },
  async newPassword(organizer, ev) {
    await live.newPassword(organizer, ev.id);
    await live.logoutAllDevices(ev.id);
  },
  async logout(organizer, ev, b, res) {
    if (typeof b.deviceId !== 'string' || !b.deviceId || b.deviceId.length > 100) { res.status(404).json({ code: 'not_found', error: 'Not found.' }); return true; }
    if (!(await live.logoutDevice(ev.id, b.deviceId))) { res.status(404).json({ code: 'not_found', error: 'Not found.' }); return true; }
  },
  async lend(organizer, ev, b, res) {
    const from = asBoard(b.from), to = asBoard(b.to), count = boardCountOf(ev.data);
    if (!(from >= 1 && from <= count && to >= 1 && to <= count)) { res.status(409).json({ code: 'lend_invalid_board', error: 'That board is not part of this event.' }); return true; }
    if (from === to) { res.status(409).json({ code: 'lend_same_board', error: 'A board cannot lend to itself.' }); return true; }
    const [holders, lends] = await Promise.all([live.boardHolders(ev.id), live.activeLends(ev.id)]);
    if (!holders.some((h) => h.board === from)) { res.status(409).json({ code: 'lend_no_device', error: 'No device is signed in on that board.' }); return true; }
    if (lends.some((l) => l.from === from)) { res.status(409).json({ code: 'lend_active', error: 'That board is already lent out. End that lend first.' }); return true; }
    const rows = await live.liveRows(ev.id);
    if (!waitingOn(load({ tournament: ev }), rows, to).length) { res.status(409).json({ code: 'lend_nothing_waiting', error: 'That board has no waiting matches.' }); return true; }
    if (!(await live.addLend(ev.id, from, to))) { res.status(409).json({ code: 'lend_active', error: 'That board is already lent out. End that lend first.' }); return true; }
  },
  async endLend(organizer, ev, b, res) {
    if (typeof b.id !== 'string' || !b.id || b.id.length > 100 || !(await live.endLend(ev.id, b.id))) { res.status(404).json({ code: 'not_found', error: 'Not found.' }); return true; }
  }
};

module.exports = async (req, res) => {
  const organizer = await requireAuth(req, res);
  if (!organizer) return;
  try {
    if (req.method === 'GET') {
      const t = req.query && req.query.t;
      if (!t || typeof t !== 'string') { res.status(400).json({ code: 'missing_id', error: 'Missing id.' }); return; }
      const ev = await live.ownEvent(organizer, t);
      if (!LiveSettings.isLive(ev.data)) { res.status(403).json({ code: 'live_off', error: 'Live scoring is not switched on for this event.' }); return; }
      res.status(200).json(await panelOf(organizer, ev));
      return;
    }
    if (req.method !== 'POST') { methodNotAllowed(res); return; }
    const b = bodyObject(req);
    if (!b.t || typeof b.t !== 'string') { res.status(400).json({ code: 'missing_id', error: 'Missing id.' }); return; }
    if (typeof b.op !== 'string' || !Object.prototype.hasOwnProperty.call(OPS, b.op)) { res.status(400).json({ code: 'invalid_op', error: 'Unknown action.' }); return; }
    const ev = await live.ownEvent(organizer, b.t);
    if (isFinalized(ev.data)) { res.status(403).json({ code: 'finalized', error: 'This event is finalized. Only an Admin can change it.', finalized: true }); return; }
    if (!LiveSettings.isLive(ev.data)) { res.status(403).json({ code: 'live_off', error: 'Live scoring is not switched on for this event.' }); return; }
    if (b.op !== 'enable' && !(await live.show(organizer, b.t))) { res.status(404).json({ code: 'not_found', error: 'Not found.' }); return; }   // nothing to change before Live scoring is turned on
    if (await OPS[b.op](organizer, ev, b, res)) return;   // true: the op sent a refusal
    res.status(200).json(await panelOf(organizer, ev));
  } catch (e) { sendError(res, e); }
};

// /api/live/panel: the organiser's Boards panel (spec 7.1 to 7.3). The organiser's own session (requireAuth, exactly like
// api/_routes/score/officials.js), not a device's; an organiser reaches their own events, an Admin any. Another organiser's event
// answers 404 not_found.
//   GET  ?t=<event id>            -> the panel (below). 403 live_off when the event is not a Live event. Reading it first ends the
//                                    lends whose board has no waiting match left.
//   GET  ?t=<event id>&brief=1    -> { takeovers: n, now }: only how many take-over requests are waiting (the Stage 5 tab's badge,
//                                    polled while another step is open). Writes nothing and ends no lend.
//   POST { t, op, ... }           -> the panel again, after the op:
//     op 'enable'                 the event's scoring login (made once; the same one every time after)
//     op 'newPassword'            a new password: every device is logged out (their waiting matches go back to the pool)
//     op 'logout' { deviceId }    one device logged out (a match it is playing stays held, for a take-over: spec 7.4)
//     op 'lend' { from, to }      board `from` (free, with a device) lends its whole tablet to board `to` (which has waiting matches)
//     op 'endLend' { id }         a lend ends (a match the lent device already holds stays its own)
//     op 'takeover' { id, answer } answer a waiting take-over request: 'allow' (the match moves to the asking device) or 'deny'.
//                                 404 not_found · 409 takeover_answered (somebody answered first) · 409 match_over (the match ended:
//                                 the request is void) · 409 takeover_stale (the match moved meanwhile: void). Logged as decided_by 'org:<id>'.
//   GET  ?t=<event id>&blockers=1 -> { blockers }: what stands in the way of Close event (below). Writes nothing and ends no lend.
//   GET  ?t=<event id>&stats=1    -> { stats: { oneEighties: [{ player, count }], highCheckouts: [{ player, value, pos, info }],
//                                    avgLeaders: [{ player, avg, darts }], mprLeaders: [{ player, mpr, rounds }] } }: the organiser's Event stats
//                                    (spec 11), from the counting turns of the matches confirmed or retired, per `player` name; each list best
//                                    first, ties by name, 5 rows at most (live-summary.js eventStats has the rules). Writes nothing; works
//                                    on a finalised event.
//   GET  ?t=<event id>&history=<pos> -> one match's history (below). Writes nothing. 404 not_found when the event has no such match.
//     op 'restore' { pos, turnId } the turn is put back as the latest version of its chain: a NEW turn row is appended (copy of that
//                                 version; supersedes = the chain's latest counting turn; device 'organiser'), the match's picture is
//                                 rewritten. 404 not_found (no such turn in that match) · 409 match_confirmed (the match is over: a result
//                                 changes by normal result entry) · 409 turn_not_restorable (the turn is ignored, or already the latest).
//     op 'dispute' { pos, on }    flags / clears "disputed" on a match that has a live row (404 not_found otherwise).
//     op 'close' { force? }       Close event (spec 7.6). Blockers: a signed-in device with turns not sent, a match a device holds that is
//                                 checked in / playing / awaiting confirmation. With blockers and no force: 409 close_blocked { blockers },
//                                 nothing changed. Else the event is marked closed (live_logins.closed_at), every device is logged out
//                                 (as New password does) and the answer is { ok, closedAt, forced, blockers } (forced: it closed over
//                                 blockers). A closed event: no new sign-in (410 link_ended 'closed'); enable / newPassword / lend /
//                                 logout / close answer 409 event_closed. Finalising does NOT close (spec 7.6: devices stay in).
//   A FINALISED event (spec 7.6: finalising does not log devices out) can still be read (GET, history and blockers included, none of them writes:
//   the idle-lend clean-up is skipped) and CLOSED (op 'close'); every other op answers 403 finalized.
//     op 'paper' { pos, on, confirm? } "Scored on paper" (spec 10.5): on = true puts the match on paper (no tablet lists it, none holds it), false
//                                 sends it back to the tablets. A match a device holds needs confirm: true (409 needs_confirm { held: true }, nothing
//                                 changed, otherwise); the device is let go and its next call answers 409 match_paper. 404 not_found (no such match) ·
//                                 409 match_over (on, for a match that has a result) · 409 paper_has_result (off, for a match that has a result).
//                                 The organiser's own result entry works as always (the match stays on paper).
//   { login: {username, password} | null, closedAt: iso | null, devices: [{ id, board, lastSeenAt, unsent, loggedOut }],
//     boards: [{ n, group, ko, playing: {pos, state, info, a, b, disputed} | null, held, idleSince, waiting, devices: [ids], lentTo?, lentFrom? }],
//     lends: [{ id, from, to, startedAt }], takeovers: [{ id, pos, info, fromDevice, fromBoard, toDevice, toBoard, requestedAt }],
//     matches: [{ pos, info, a, b, state, disputed }], retired: [{ pos, side: 'a'|'b' }], playingCount, now }
// matches: the matches that have a history worth opening (in progress, over, or disputed), in the event's order.
// retired: the matches whose live row is 'retired' (a device recorded a side retiring; the opponent's walkover stands in the result):
// the organiser's score boxes say "Retired · walkover" for these instead of the plain walkover tag. A label only.
// blockers: [{ device: 'Device N', deviceNo: N|null, board, unsent, matches: [{ pos, info }] }], one per device, in the devices' order.
// history: { pos, info, a, b, state, board, disputed, summary, turns: [{ id, leg, side, player, entered, supersedes, ignored, ignoredReason,
//   device: 'Device N' | 'Organiser', deviceNo, byOrganiser?, at, left, current }], takeovers: [{ answer, decidedBy: 'organiser' | 'official' | 'system' | null,
//   requestedAt, decidedAt, from, to, fromNo, toNo }] } (every turn, ignored ones too, oldest first; left: the x01 score left after the turn,
//   null for Cricket and ignored turns; current: the latest version of its chain). board: the board the match is on (where it is played, else the
//   one it was claimed on), null when it has no live row. Device ids never leave the server in these.
// held: a device holds a match on the board (started or not; with playing it says the board is not free for the knockout board suggestions).
// idleSince: ms of the latest end of a match played on the board, null when none ended yet (read only: the suggestions are made in the browser).
// group: the labels of the round robin groups and pods played on the board, joined by ", " ('' when none); ko: knockout matches are on
// it. takeovers: the waiting requests, oldest first (live.openTakeovers: the match is still held by fromDevice, toDevice is signed in);
// info is the match as the paper numbers it (info.matchNo), the device ids are opaque. playingCount: matches a device holds that are checked in, playing or awaiting confirmation (the Manual switch is refused while it is not 0).
// The password hash never leaves the server; the login's password is shown here, to the signed-in organiser only.
const crypto = require('crypto');
const { requireAuth } = require('../../_lib/auth');
const { sendError, bodyObject, methodNotAllowed, live } = require('./common');
const { boardCountOf, load, waitingOn, entryOf, startForOf } = require('./view');
const { switchPaper } = require('./paperSwitch');
const takeoverRoute = require('./takeover');
const turnRoute = require('./turn');
const { chainHeadOf, annotateTurns, eventStats } = require('../../_lib/live-summary');
const LiveSettings = require('../../../live-settings');
const LiveBoards = require('../../../live-boards');

const ACTIVE = ['checkedIn', 'playing', 'awaitingConfirm'];
const OVER = ['confirmed', 'retired', 'voided'];
const CLOSED_REFUSES = ['enable', 'newPassword', 'lend', 'logout', 'close'];   // ops that answer 409 event_closed once the event is closed
const POS_OK = (v) => typeof v === 'string' && v.length > 0 && v.length <= 200;
const NOT_FOUND = { code: 'not_found', error: 'Not found.' };
const isFinalized = (data) => !!(data && typeof data === 'object' && data.finalized);
const asBoard = (v) => (typeof v === 'number' ? v : (typeof v === 'string' && /^\d{1,4}$/.test(v.trim()) ? Number(v) : NaN));

/* The panel for an event the caller already owns (ev: { id, data }). */
async function panelOf(organizer, ev) {
  const t = ev.id;
  const login = await live.show(organizer, t);
  const now = Date.now();
  if (!login) return { login: null, closedAt: null, devices: [], boards: [], lends: [], takeovers: [], matches: [], retired: [], playingCount: 0, now };
  const ctx = load({ tournament: ev });
  const rows = await live.liveRows(t);
  if (!isFinalized(ev.data)) {   // a finalised event is only read: this ends lends (a write). A failure must not take the whole card down (it runs on every poll)
    try { await live.endIdleLends(t, ev, { ctx, rows }); } catch (err) { console.error('live endIdleLends failed: ' + (err && err.message ? err.message : err)); }
  }
  const [devices, lends, closedAt, disputedList] = await Promise.all([live.panelDevices(t), live.activeLends(t), live.closedAt(t), live.disputedPositions(t)]);
  const disputed = {};
  disputedList.forEach((p) => { disputed[p] = true; });
  const takeovers = (await live.openTakeovers(t, { rows, devices })).map((p) => {
    const s = ctx.slotsByPos[p.pos];
    return Object.assign({}, p, { info: s ? ctx.e.plain(ctx.e.matchInfo(ctx.t, s)) : null });
  });
  const rowBy = {};
  rows.forEach((r) => { rowBy[r.pos] = r; });
  /* what is playing, per board (the match's own board group), and how many matches are in progress in all */
  const playingBy = {}, heldBy = {};
  let playingCount = 0;
  const seen = {};
  ctx.slots.forEach((s) => {
    seen[s.pos] = true;
    const row = rowBy[s.pos];
    if (!row || !LiveBoards.heldBy(row) || LiveBoards.slotDone(s)) return;
    const state = LiveBoards.stateOf(s, row, false);
    const board = row.board != null ? row.board : ((s.boards || [])[0] != null ? Number(s.boards[0]) : null);
    if (board != null) heldBy[board] = true;   // a device holds a match on this board, started or not
    if (ACTIVE.indexOf(state) < 0) return;
    playingCount++;
    if (board == null || playingBy[board]) return;
    const ei = (id) => entryOf(ctx.byId, id).name;
    playingBy[board] = { pos: s.pos, state, info: ctx.e.plain(ctx.e.matchInfo(ctx.t, s)), a: ei(s.a), b: ei(s.b), disputed: !!disputed[s.pos] };
  });
  rows.forEach((r) => { if (!seen[r.pos] && LiveBoards.heldBy(r) && ACTIVE.indexOf(r.state) >= 0) playingCount++; });   // a match the event no longer shows still counts
  const idle = await live.boardIdleSince(t);
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
      n: i, group: labels.join(', '), ko, playing: playingBy[i] || null, held: !!heldBy[i], idleSince: idle[i] != null ? idle[i] : null, waiting: waitingOn(ctx, rows, i).length,
      devices: devices.filter((d) => !d.loggedOut && d.board === i).map((d) => d.id)
    };
    const out = lends.find((l) => l.from === i), inn = lends.find((l) => l.to === i);
    if (out) b.lentTo = out.to;
    if (inn) b.lentFrom = inn.from;
    boards.push(b);
  }
  /* the matches worth a history: in progress, over, or flagged (a claimed match that has not started has nothing to show) */
  const matches = [];
  ctx.slots.forEach((s) => {
    const row = rowBy[s.pos];
    if (!row) return;
    const state = LiveBoards.stateOf(s, row, false);
    if (ACTIVE.indexOf(state) < 0 && OVER.indexOf(state) < 0 && !disputed[s.pos]) return;
    matches.push({ pos: s.pos, info: ctx.e.plain(ctx.e.matchInfo(ctx.t, s)), a: entryOf(ctx.byId, s.a).name, b: entryOf(ctx.byId, s.b).name, state, disputed: !!disputed[s.pos] });
  });
  /* the matches a side retired in (spec 10.4: the opponent got a walkover): the organiser's boxes label those "Retired" (a label only) */
  const retired = rows.filter((r) => r.state === 'retired' && (r.retired_side === 'a' || r.retired_side === 'b')).map((r) => ({ pos: r.pos, side: r.retired_side }));
  return { login, closedAt, devices, boards, lends, takeovers, matches, retired, playingCount, now };
}

/* The Event stats (spec 11): high checkouts, 180s, 3-dart average and MPR leaders from the counting turns of the matches a device
   confirmed or retired in. Reads only. */
async function statsOf(ev) {
  const ctx = load({ tournament: ev });
  const turns = await live.eventTurns(ev.id);
  const byPos = new Map();
  turns.forEach((x) => { if (!byPos.has(x.pos)) byPos.set(x.pos, []); byPos.get(x.pos).push(x); });
  const matches = [];
  byPos.forEach((list, pos) => {
    let startFor;
    try { startFor = startForOf(ctx, pos); } catch (e) { startFor = undefined; }   // as the confirm route: no scores left, the turn's own game decides
    const slot = ctx.slotsByPos[pos];
    matches.push({ pos, info: slot ? ctx.e.plain(ctx.e.matchInfo(ctx.t, slot)) : null, turns: list, startFor });
  });
  return eventStats(matches);
}

/* "Device N": the device's place in the event's list of devices (the same number the panel's own list and the Boards card use). */
function deviceLabels(devices) {
  const no = {};
  devices.forEach((d, i) => { no[d.id] = i + 1; });
  return (id) => (id === 'organiser' ? { device: 'Organiser', deviceNo: null, byOrganiser: true } : (no[id] ? { device: 'Device ' + no[id], deviceNo: no[id] } : { device: 'Device ?', deviceNo: null }));
}

/* What stands in the way of Close event: every signed-in device with turns it has not sent, and every match a device holds that is
   checked in, playing or awaiting confirmation (a device that was logged out still holds a match it was playing). One entry per
   device, in the devices' order: [{ device: 'Device N', deviceNo, board, unsent, matches: [{ pos, info }] }]. Reads only. */
async function blockersOf(ev) {
  const t = ev.id;
  const ctx = load({ tournament: ev });
  const [rows, devices] = await Promise.all([live.liveRows(t), live.panelDevices(t)]);
  const label = deviceLabels(devices);
  const out = {}, order = [];
  const entry = (id) => {
    if (!out[id]) {
      const d = devices.find((x) => x.id === id);
      out[id] = Object.assign(label(id), { board: d ? d.board : null, unsent: 0, matches: [] });
      order.push(id);
    }
    return out[id];
  };
  devices.forEach((d) => { if (!d.loggedOut && d.unsent > 0) entry(d.id).unsent = d.unsent; });
  rows.forEach((r) => {
    const holder = LiveBoards.heldBy(r);
    if (!holder || ACTIVE.indexOf(r.state) < 0) return;
    const s = ctx.slotsByPos[r.pos];
    if (s && LiveBoards.slotDone(s)) return;   // the event already holds its result
    entry(holder).matches.push({ pos: r.pos, info: s ? ctx.e.plain(ctx.e.matchInfo(ctx.t, s)) : null });
  });
  const place = (id) => { const i = devices.findIndex((x) => x.id === id); return i < 0 ? 1e9 : i; };
  return order.sort((a, b) => place(a) - place(b)).map((id) => out[id]);
}

/* One match's history, or null when the event has no such match. */
async function historyOf(ev, pos) {
  const t = ev.id;
  const ctx = load({ tournament: ev });
  const slot = ctx.slotsByPos[pos] || null;
  const [row, turns, devices, tks, disputedList] = await Promise.all([live.liveRow(t, pos), live.allTurns(t, pos), live.panelDevices(t), live.matchTakeovers(t, pos), live.disputedPositions(t)]);
  if (!slot && !row && !turns.length) return null;
  const label = deviceLabels(devices);
  let startFor = () => null;
  try { startFor = startForOf(ctx, pos); } catch (e) { /* no scores left, the turns still show */ }
  const shownTurns = annotateTurns(turns, startFor).map((x) => Object.assign({
    id: x.id, leg: x.leg, side: x.side, player: x.player, entered: x.entered, supersedes: x.supersedes,
    ignored: x.ignored, ignoredReason: x.ignoredReason
  }, label(x.deviceId), { at: x.createdAt, left: x.left, current: x.current }));
  const who = (kind) => (typeof kind === 'string' && kind.indexOf('org:') === 0 ? 'organiser' : typeof kind === 'string' && kind.indexOf('off:') === 0 ? 'official' : kind === 'system' ? 'system' : null);
  const log = tks.map((k) => ({
    answer: k.answer, decidedBy: who(k.decided_by), requestedAt: k.requestedAt, decidedAt: k.decidedAt,
    from: label(k.from_device).device, fromNo: label(k.from_device).deviceNo, to: label(k.to_device).device, toNo: label(k.to_device).deviceNo
  }));
  return {
    pos, info: slot ? ctx.e.plain(ctx.e.matchInfo(ctx.t, slot)) : null,
    a: slot ? entryOf(ctx.byId, slot.a).name : '', b: slot ? entryOf(ctx.byId, slot.b).name : '',
    state: slot ? LiveBoards.stateOf(slot, row, false) : (row ? row.state : 'waiting'),
    board: row ? (row.played_on_board != null ? row.played_on_board : (row.board != null ? row.board : null)) : null,
    disputed: disputedList.indexOf(pos) >= 0, summary: row ? row.summary : {}, turns: shownTurns, takeovers: log
  };
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
  },
  async takeover(organizer, ev, b, res) {
    if (typeof b.id !== 'string' || !b.id || b.id.length > 100) { res.status(404).json({ code: 'not_found', error: 'Not found.' }); return true; }
    if (b.answer !== 'allow' && b.answer !== 'deny') { res.status(400).json({ code: 'invalid_op', error: 'Unknown action.' }); return true; }
    const out = await takeoverRoute.decide(ev, b.id, b.answer, 'org:' + organizer.id);
    if (!out.ok) { res.status(out.status).json(out.body); return true; }
  },
  async restore(organizer, ev, b, res) {
    if (!POS_OK(b.pos) || typeof b.turnId !== 'string' || !b.turnId || b.turnId.length > 100) { res.status(404).json(NOT_FOUND); return true; }
    const turns = await live.allTurns(ev.id, b.pos);
    const chosen = turns.find((x) => x.id === b.turnId);
    if (!chosen) { res.status(404).json(NOT_FOUND); return true; }
    const row = await live.matchFull(ev.id, b.pos), slot = load({ tournament: ev }).slotsByPos[b.pos] || null;
    if (OVER.indexOf(slot ? LiveBoards.stateOf(slot, row, false) : (row ? row.state : '')) >= 0 || (row && OVER.indexOf(row.state) >= 0)) {
      res.status(409).json({ code: 'match_confirmed', error: 'This match is already confirmed. A result is changed by entering it again.' }); return true;
    }
    const head = chainHeadOf(turns, chosen.id);
    if (chosen.ignored || !head || head.id === chosen.id) { res.status(409).json({ code: 'turn_not_restorable', error: 'That version cannot be restored.' }); return true; }
    const id = 'org_' + crypto.randomBytes(9).toString('base64url').replace(/[^A-Za-z0-9]/g, 'x');
    await live.insertTurn(ev.id, { id, pos: b.pos, leg: chosen.leg, side: chosen.side, player: chosen.player, entered: chosen.entered, deviceId: 'organiser', supersedes: head.id, ignored: false, ignoredReason: null });
    await turnRoute.rewriteSummary({ tournament: ev }, row, { pos: b.pos, side: chosen.side, supersedes: head.id }, undefined);
  },
  async dispute(organizer, ev, b, res) {
    if (!POS_OK(b.pos)) { res.status(404).json(NOT_FOUND); return true; }
    if (typeof b.on !== 'boolean') { res.status(400).json({ code: 'invalid_op', error: 'Unknown action.' }); return true; }
    if (!(await live.setDisputed(ev.id, b.pos, b.on))) { res.status(404).json(NOT_FOUND); return true; }
  },
  async paper(organizer, ev, b, res) {
    if (!POS_OK(b.pos)) { res.status(404).json(NOT_FOUND); return true; }
    if (typeof b.on !== 'boolean') { res.status(400).json({ code: 'invalid_op', error: 'Unknown action.' }); return true; }
    const out = await switchPaper(ev.id, load({ tournament: ev }).slotsByPos[b.pos] || null, b.on, b.confirm === true);
    if (!out.ok) { res.status(out.status).json(out.body); return true; }
  },
  async close(organizer, ev, b, res) {
    const blockers = await blockersOf(ev);
    if (blockers.length && b.force !== true) {
      res.status(409).json({ code: 'close_blocked', error: 'Some devices still hold turns or matches that are not in yet.', blockers }); return true;
    }
    const closedAt = await live.closeLogin(ev.id);   // first, so nobody signs in between the log-outs and the mark
    if (!closedAt) { res.status(409).json({ code: 'event_closed', error: 'This event is closed.' }); return true; }
    await live.logoutAllDevices(ev.id);
    res.status(200).json({ ok: true, closedAt, forced: blockers.length > 0, blockers });
    return true;
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
      if (req.query.blockers === '1') { res.status(200).json({ blockers: await blockersOf(ev) }); return; }
      if (req.query.stats === '1') { res.status(200).json({ stats: await statsOf(ev) }); return; }
      if (req.query.history !== undefined) {
        const pos = req.query.history;
        const h = POS_OK(pos) ? await historyOf(ev, pos) : null;
        if (!h) { res.status(404).json(NOT_FOUND); return; }
        res.status(200).json(h); return;
      }
      if (req.query.brief === '1') { res.status(200).json({ takeovers: (await live.openTakeovers(t)).length, now: Date.now() }); return; }
      res.status(200).json(await panelOf(organizer, ev));
      return;
    }
    if (req.method !== 'POST') { methodNotAllowed(res); return; }
    const b = bodyObject(req);
    if (!b.t || typeof b.t !== 'string') { res.status(400).json({ code: 'missing_id', error: 'Missing id.' }); return; }
    if (typeof b.op !== 'string' || !Object.prototype.hasOwnProperty.call(OPS, b.op)) { res.status(400).json({ code: 'invalid_op', error: 'Unknown action.' }); return; }
    const ev = await live.ownEvent(organizer, b.t);
    if (isFinalized(ev.data) && b.op !== 'close') { res.status(403).json({ code: 'finalized', error: 'This event is finalized. Only an Admin can change it.', finalized: true }); return; }
    if (!LiveSettings.isLive(ev.data)) { res.status(403).json({ code: 'live_off', error: 'Live scoring is not switched on for this event.' }); return; }
    if (b.op !== 'enable' && !(await live.show(organizer, b.t))) { res.status(404).json({ code: 'not_found', error: 'Not found.' }); return; }   // nothing to change before Live scoring is turned on
    if (CLOSED_REFUSES.indexOf(b.op) >= 0 && await live.closedAt(b.t)) { res.status(409).json({ code: 'event_closed', error: 'This event is closed.' }); return; }
    if (await OPS[b.op](organizer, ev, b, res)) return;   // true: the op sent a refusal
    res.status(200).json(await panelOf(organizer, ev));
  } catch (e) { sendError(res, e); }
};

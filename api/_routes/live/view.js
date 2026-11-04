// What a scoring device sees of an event: its boards and its matches (spec sections 5, 7.3, 8 and 9). Shared by
// /api/live/boards, /matches and /pick. Built from the event's own result slots (results-engine.js resultSlots, run by the server
// engine) merged with the live_matches rows; nothing but what a scorer needs leaves here: names, the match's place on the paper,
// its game rules and board. Never the event's data, never another device's id.
const { engine } = require('../../_lib/engine');
const LiveSettings = require('../../../live-settings');
const LiveBoards = require('../../../live-boards');
const { slotView } = require('../score/common');

const MAX_BOARDS = 256;
const boardCountOf = (data) => Math.min(MAX_BOARDS, Math.max(1, parseInt(data && data.eventCreation && data.eventCreation.boards, 10) || 1));

/* The stage a match belongs to, as LiveSettings.gameOf names it (and the round index for a knockout bracket's by-round rules). */
function stageOf(t, s) {
  if (s.kind === 'rr') return { key: 'rr', ri: undefined };
  if (s.pod) return { key: 'pod', ri: undefined };
  if (s.bracketKey === 'knockoutLosers') return { key: 'knockout.plate', ri: s.ri };
  if (t.knockout && t.knockout.podFinals) return { key: 'finals', ri: undefined };
  return { key: 'knockout.main', ri: s.ri };
}
/* { game, inOut, bull, decider, orderRule } for a match. A Teams match plays its segments in order: `game` is the first segment's
   and `segments` lists every segment's. */
function gameFor(data, t, s) {
  const orderRule = LiveSettings.scoringOf(data).orderRule;
  const unit = (data.eventCreation && data.eventCreation.competitionUnit) || 'Singles';
  if (unit === 'Teams') {
    const segs = Array.isArray(data.format && data.format.teamSegments) ? data.format.teamSegments : [];
    const list = segs.map((_, i) => LiveSettings.gameOf(data, 'team:' + i));
    return { game: Object.assign({}, list[0] || LiveSettings.gameOf(data, 'team:0'), { orderRule }), segments: list };
  }
  const st = stageOf(t, s);
  return { game: Object.assign({}, LiveSettings.gameOf(data, st.key, st.ri), { orderRule }) };
}
/* The x01 start score of each leg of a match: startFor(leg) is 501 ... or null for Cricket / an unknown match. A mixed game plays
   its pattern in turn, leg by leg. (The match's public summary and the organiser's match history both read it.) */
function startForOf(ctx, pos) {
  const s = ctx.slotsByPos[pos];
  if (!s) return () => null;
  const g = gameFor(ctx.data, ctx.t, s).game.game;
  return (leg) => {
    const one = typeof g === 'string' ? g : (g && Array.isArray(g.pattern) && g.pattern.length ? g.pattern[(leg - 1) % g.pattern.length] : null);
    const n = one && one !== 'cricket' ? parseInt(one, 10) : NaN;
    return Number.isInteger(n) ? n : null;
  };
}
/* An entry as a scorer needs it: the display name and the players' names. */
function entryOf(byId, id) {
  const en = byId[id];
  if (!en) return { name: '', members: [] };
  return { name: String(en.name || ''), members: (en.members || []).map((m) => String((m && m.name) || '')).filter(Boolean) };
}
/* Where a match is played for a device on `myBoard`: null (not for this device), { own: true } (the match is on its board),
   or { forBoard, playedOn } (a running lend sends this device's board to that board's matches; the match stays in its own board group). */
function placeFor(s, myBoard, lends) {
  if (myBoard == null) return null;
  const boards = (s.boards || []).map(Number);
  if (boards.indexOf(myBoard) >= 0) return { own: true, board: myBoard };
  const lend = lends.find((l) => l.from === myBoard && boards.indexOf(l.to) >= 0);
  return lend ? { forBoard: lend.to, playedOn: myBoard } : null;
}
/* Where a match this device HOLDS is played, from the match's own row, never from a lend: a lend ends by itself when the lent board has
   no waiting matches, which is right after its last match is claimed, and the device must not lose its match mid-play. Null when the
   device does not hold it. */
function heldPlace(row, me, myBoard) {
  if (!row || LiveBoards.heldBy(row) !== me) return null;
  const board = row.board != null ? row.board : myBoard, playedOn = row.played_on_board != null ? row.played_on_board : board;
  return playedOn !== board ? { forBoard: board, playedOn } : { own: true, board };
}
/* Entries playing right now (a match whose live row says 'playing') on any board. */
function busyEntries(slotsByPos, rows) {
  const busy = {};
  rows.forEach((r) => {
    if (r.state !== 'playing') return;
    const s = slotsByPos[r.pos];
    if (s) { if (s.a) busy[s.a] = true; if (s.b) busy[s.b] = true; }
  });
  return busy;
}
/* The engine's copy of the event, its slots, and what a scorer needs of every entry. */
function load(found) {
  const e = engine();
  const t = e.inside(found.tournament.data);
  const slots = e.resultSlots(t);
  const slotsByPos = {};
  slots.forEach((s) => { slotsByPos[s.pos] = s; });
  const byId = {};
  (t.entriesList || []).forEach((en) => { if (en && en.id) byId[en.id] = en; });
  return { e, t, slots, slotsByPos, byId, data: found.tournament.data };
}
/* What a device that asks to take a match over is told of it: the score the match stands at (from the match's public summary). */
const IN_PROGRESS = ['checkedIn', 'playing', 'awaitingConfirm'];
const pairOf = (v) => (Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number' && Number.isFinite(n)) ? [v[0], v[1]] : null);
function inProgressOf(row) {
  const sm = row && row.summary && typeof row.summary === 'object' ? row.summary : {};
  return { legs: pairOf(sm.legs) || [0, 0], remaining: pairOf(sm.remaining), thrower: sm.thrower === 'a' || sm.thrower === 'b' ? sm.thrower : null };
}
/* One match as the device's list shows it. row: its live_matches row or null; place: from placeFor. takeovers: { pos: 'mine' | 'other' }
   (the waiting take-over requests: 'mine' = this device asked), left out when the caller has none to show. */
function matchView(ctx, s, row, place, me, busy, takeovers) {
  const v = slotView(ctx.e, ctx.t, s, null, Date.now());   // the same view the floor officials' page uses (match number, chart positions, legs)
  const state = LiveBoards.stateOf(s, row, s.kind === 'ko' ? !!(s.m && s.m.called) : false);
  const held = LiveBoards.heldBy(row);
  const g = gameFor(ctx.data, ctx.t, s);
  const out = {
    pos: s.pos, state, kind: s.kind, group: v.group, round: v.round, bracket: v.bracket, legs: v.legs,
    a: entryOf(ctx.byId, s.a), b: entryOf(ctx.byId, s.b),
    board: row && row.board != null ? row.board : (place && place.forBoard ? place.forBoard : (place ? place.board : null)),
    info: v.info, game: g.game
  };
  if (g.segments) out.segments = g.segments;
  if (v.teamCap != null) out.teamCap = v.teamCap;
  if (place && place.forBoard) { out.forBoard = place.forBoard; out.playedOn = place.playedOn; }   // played on the asking device's board; the match stays in its own board group
  if (held && held === me) out.mine = true;
  if (held && held !== me) {
    out.onAnother = true;
    if (IN_PROGRESS.indexOf(state) >= 0 && !LiveBoards.slotDone(s)) {   // being played on another device: this one may ask to take it over (spec 7.4)
      out.takeoverable = true;
      out.inProgress = inProgressOf(row);
      out.pending = (takeovers && takeovers[s.pos]) || null;
    }
  }
  if (LiveBoards.slotDone(s)) { out.done = true; out.result = v.result; }
  else if (!(row && row.state === 'playing') && (busy[s.a] || busy[s.b])) out.playerBusy = true;
  return out;
}
/* A match is WAITING when a device could pick it: both players there, not a bye, not on paper, not over, open to play and held by
   no device. This is the lent branch of buildList below (what a lent board lists), and what the organiser's panel counts. */
function isWaiting(s, row) {
  if (!s.a || !s.b) return false;
  if (s.kind === 'ko' && s.m && s.m.bye) return false;
  if (row && row.paper) return false;
  if (LiveBoards.slotDone(s) || !s.open) return false;
  return !LiveBoards.heldBy(row);
}
/* The waiting matches (result slots) whose own board group is `board`. rows: live.liveRows. */
function waitingOn(ctx, rows, board) {
  const rowBy = {};
  rows.forEach((r) => { rowBy[r.pos] = r; });
  return ctx.slots.filter((s) => (s.boards || []).map(Number).indexOf(board) >= 0 && isWaiting(s, rowBy[s.pos] || null));
}
/* The device's match list: its board's matches (round robin in the group's own order, knockout in bracket order), then the
   matches of a board lent to it, then the matches in progress on ANOTHER device elsewhere (checked in, playing or awaiting
   confirmation, held by another device, on a board this device does not play: any signed-in device may ask to take them over,
   spec 8.2), then the matches already done. Knockout matches without a board and paper matches are on no list. */
function buildList(found, rows, lends, takeovers) {
  const ctx = load(found), me = found.device.id, myBoard = found.device.board;
  const rowBy = {};
  rows.forEach((r) => { rowBy[r.pos] = r; });
  const busy = busyEntries(ctx.slotsByPos, rows);
  const asked = {};
  (takeovers || []).forEach((t) => { asked[t.pos] = t.toDevice === me ? 'mine' : 'other'; });
  const mineList = [], lentList = [], elseList = [], doneList = [];
  /* in progress on another device (the held-by-another test; a match that is over or whose result the event holds is never listed here) */
  const elsewhere = (s, row) => { const h = LiveBoards.heldBy(row); return !!h && h !== me && IN_PROGRESS.indexOf(row.state) >= 0 && !LiveBoards.slotDone(s); };
  const elsewhereView = (s, row) => elseList.push(matchView(ctx, s, row, { board: row.played_on_board != null ? row.played_on_board : row.board }, me, busy, asked));
  ctx.slots.forEach((s) => {
    if (!s.a || !s.b) return;                                  // a match needs both players
    if (s.kind === 'ko' && s.m && s.m.bye) return;             // a bye is not played
    const row = rowBy[s.pos] || null;
    if (row && row.paper) return;                              // scored on paper: on no device (D16)
    const mine = heldPlace(row, me, myBoard);                  // a match this device holds stays on its list, lend or no lend
    const place = mine || placeFor(s, myBoard, lends);
    if (!place) { if (elsewhere(s, row)) elsewhereView(s, row); return; }   // not on this board (a knockout match with no board is on none, D7), unless it is in progress on another device
    if (LiveBoards.slotDone(s)) { if (place.own) doneList.push(matchView(ctx, s, row, place, me, busy, asked)); return; }
    if (!s.open) return;                                       // waiting for its players, or its group has not started
    if (mine) { mineList.push(matchView(ctx, s, row, place, me, busy, asked)); return; }
    if (place.forBoard) {
      if (LiveBoards.heldBy(row)) { if (elsewhere(s, row)) elsewhereView(s, row); return; }   // a lent board lists only what is still waiting (a held match in progress is listed as elsewhere)
      lentList.push(matchView(ctx, s, row, place, me, busy, asked));
    } else mineList.push(matchView(ctx, s, row, place, me, busy, asked));
  });
  return mineList.concat(lentList, elseList, doneList);
}

module.exports = { boardCountOf, buildList, load, matchView, placeFor, heldPlace, busyEntries, stageOf, gameFor, startForOf, isWaiting, waitingOn, entryOf, MAX_BOARDS };

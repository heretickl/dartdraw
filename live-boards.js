/* DartDraw live-scoring match states: what state a match is in, from the event's own match (a result slot of
   results-engine.js resultSlots), the match's live_matches row and whether an official has called it. One pure function, no
   I/O, no clocks: the server (the device match list, the floor officials' page) and the organiser's Boards panel read a
   match's state through it, so they never disagree. (docs/superpowers/specs/2026-11-04-online-organizer-design.md, section 8.)

   States: waiting -> called -> checkedIn -> playing -> awaitingConfirm -> confirmed, and the side states paper, retired, voided.
   Order of reading, first hit wins:
     1. the live row says paper                      -> 'paper'
     2. the live row says retired / voided / confirmed (the match is over)  -> that state
     3. the event already holds the match's result   -> 'voided' (a knockout "Neither showed") or 'confirmed'
        (a result typed by the organiser or an official, or a device's result once it was sent)
     4. the live row says checkedIn / playing / awaitingConfirm  -> that state
     5. the match was called (knockout: the official's call flag, kept on the match in the event) -> 'called'
     6. otherwise                                    -> 'waiting'
   A match a device has claimed but not started yet has a live row whose state is still 'waiting' (it holds device_id): it reads
   as 'waiting' (or 'called') here, and `heldBy` below says it is taken.
   calledFlag: true/false; left out (undefined), a knockout match's own called flag is used. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LiveBoards = factory();
})(this, function () {
  var STATES = ['waiting', 'called', 'checkedIn', 'playing', 'awaitingConfirm', 'confirmed', 'paper', 'retired', 'voided'];
  var OVER = ['retired', 'voided', 'confirmed'];
  var ACTIVE = ['checkedIn', 'playing', 'awaitingConfirm'];

  function has(list, v) { return list.indexOf(v) !== -1; }
  /* does the event hold this match's result? (a knockout match: a winner, "Neither showed" or a bye; a round robin match: a stored score) */
  function slotDone(slot) {
    if (!slot) return false;
    if (slot.kind === 'ko') return !!(slot.m && (slot.m.winnerId || slot.m.void || slot.m.bye));
    return typeof slot.get === 'function' ? !!slot.get() : false;
  }
  function stateOf(slot, liveRow, calledFlag) {
    var row = liveRow && typeof liveRow === 'object' ? liveRow : null;
    if (row && row.paper) return 'paper';
    if (row && has(OVER, row.state)) return row.state;
    if (slotDone(slot)) return slot.kind === 'ko' && slot.m && slot.m.void ? 'voided' : 'confirmed';
    if (row && has(ACTIVE, row.state)) return row.state;
    var called = calledFlag === undefined ? !!(slot && slot.kind === 'ko' && slot.m && slot.m.called) : !!calledFlag;
    return called ? 'called' : 'waiting';
  }
  /* A match is held by a device from its claim until it is over: it is on that device's screen, and shows "on another tablet"
     on every other. */
  function heldBy(liveRow) {
    if (!liveRow || liveRow.paper || !liveRow.device_id) return null;
    return has(OVER, liveRow.state) ? null : liveRow.device_id;
  }

  /* ---------- knockout board suggestions (spec section 9, D7) ----------
     A knockout match has no board until the organiser gives it one (m.board). When a round's matches are ready (both entrants
     known, no result, not a bye, no board yet) the Boards panel suggests a board for each, in this order:
       1. 'feeder'  the board one of the match's feeders (the previous-round matches its players came from) was played on, when that
                    board is free and no earlier match of this round has been given it
       2. 'group'   the board of the match's Group Boards group (a pod's first board; a board group's board, inside its sections)
       3. 'idle'    the free board that has been idle longest (idleSince[board] = when its last match ended, in ms; a board that was
                    never used counts as idle longest)
     Each tier is applied to the whole round before the next one (feeder boards first, then group boards, then idle boards), so an idle pick
     for one match never takes the board another match of the round would have had as its feeder's board. With no free board left a match gets no suggestion. Pure: nothing in t is changed, nothing is written. round = { bracketKey, ri }
     (bracketKey: knockout, knockoutLosers or pod:<id>). lastBoardByMatch: { pos of a feeder: the board it was played on }, used
     before the feeder's own m.board. */
  function posInt(v) { var n = parseInt(v, 10); return n > 0 ? n : 0; }
  function bracketOf(t, key) {
    if (!t) return { bracket: null, pod: null };
    if (key === 'knockout' || key === 'knockoutLosers') return { bracket: t[key] || null, pod: null };
    var m = /^pod:(.+)$/.exec(String(key)), pods = Array.isArray(t.pods) ? t.pods : [];
    if (m) for (var i = 0; i < pods.length; i++) if (pods[i] && String(pods[i].id) === m[1]) return { bracket: pods[i].bracket || null, pod: pods[i] };
    return { bracket: null, pod: null };
  }
  /* The matches of one round that are ready and have no board yet: [{ pos, mi }] in bracket order. */
  function readyKnockoutMatches(t, round) {
    var key = round && round.bracketKey, ri = round && round.ri, b = bracketOf(t, key);
    var rounds = b.bracket && Array.isArray(b.bracket.rounds) ? b.bracket.rounds : null, list = rounds && rounds[ri];
    var out = [];
    if (!Array.isArray(list)) return out;
    list.forEach(function (m, mi) {
      if (!m || !m.aEntryId || !m.bEntryId || m.winnerId || m.bye || m.void || posInt(m.board)) return;
      out.push({ pos: 'ko:' + key + ':' + ri + ':' + mi, mi: mi });
    });
    return out;
  }
  /* The board of the match's Group Boards group, or 0. */
  function groupBoardOf(b, ri, mi) {
    if (b.pod) return posInt(b.pod.boards && b.pod.boards[0]);
    var g = b.bracket && b.bracket.boardGroups, rounds = b.bracket && b.bracket.rounds;
    if (!g || !Array.isArray(g.boards) || !(g.count > 0) || g.boards.length !== g.count || !rounds || !rounds[0] || !rounds[ri]) return 0;
    var sections = Math.round(Math.log(rounds[0].length * 2 / g.count) / Math.LN2);
    if (ri >= sections) return 0;
    return posInt(g.boards[Math.floor(mi / (rounds[ri].length / g.count))]);
  }
  function suggestKnockoutBoards(t, round, freeBoards, lastBoardByMatch, idleSince) {
    var key = round && round.bracketKey, ri = round && round.ri, b = bracketOf(t, key);
    var free = [], used = {}, out = [];
    (Array.isArray(freeBoards) ? freeBoards : []).forEach(function (n) { n = posInt(n); if (n && free.indexOf(n) < 0) free.push(n); });
    var last = lastBoardByMatch && typeof lastBoardByMatch === 'object' ? lastBoardByMatch : {};
    var idle = idleSince && typeof idleSince === 'object' ? idleSince : {};
    var avail = function (n) { return n > 0 && free.indexOf(n) >= 0 && !used[n]; };
    var idleKey = function (n) { var v = idle[n]; return v == null || isNaN(Number(v)) ? -Infinity : Number(v); };
    var rounds = b.bracket && b.bracket.rounds, ready = readyKnockoutMatches(t, round), got = {};
    var give = function (r, n, why) { used[n] = true; got[r.pos] = { pos: r.pos, board: n, why: why }; };
    /* The rule is applied tier by tier over the whole round, so a match that takes an idle board never takes the board that a later
       match of the round would have had as its feeder's board or its group's board. */
    ready.forEach(function (r) {   // 1. a feeder's board
      if (!(ri > 0 && rounds && rounds[ri - 1])) return;
      [2 * r.mi, 2 * r.mi + 1].forEach(function (fi) {
        var f = rounds[ri - 1][fi];
        if (got[r.pos] || !f || f.bye) return;
        var fb = posInt(last['ko:' + key + ':' + (ri - 1) + ':' + fi]) || posInt(f.board);
        if (avail(fb)) give(r, fb, 'feeder');
      });
    });
    ready.forEach(function (r) {   // 2. the group's board
      if (got[r.pos]) return;
      var gb = groupBoardOf(b, ri, r.mi);
      if (avail(gb)) give(r, gb, 'group');
    });
    ready.forEach(function (r) {   // 3. the free board idle longest
      if (got[r.pos]) return;
      var rest = free.filter(function (n) { return !used[n]; }).sort(function (x, y) { var kx = idleKey(x), ky = idleKey(y); return kx === ky ? x - y : (kx < ky ? -1 : 1); });
      if (rest.length) give(r, rest[0], 'idle');
    });
    ready.forEach(function (r) { if (got[r.pos]) out.push(got[r.pos]); });
    return out;
  }

  return { stateOf: stateOf, heldBy: heldBy, slotDone: slotDone, suggestKnockoutBoards: suggestKnockoutBoards, readyKnockoutMatches: readyKnockoutMatches, STATES: STATES.slice() };
});

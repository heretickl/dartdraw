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

  return { stateOf: stateOf, heldBy: heldBy, slotDone: slotDone, STATES: STATES.slice() };
});

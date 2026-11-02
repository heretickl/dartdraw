/* Board groups (docs/superpowers/specs/2026-11-02-board-groups-and-official-positions-design.md): a drawn knockout
   bracket (main or Plate) cut into equal sections from the top, each section played on one board down to its board
   champion. The draw is never touched: only the board of each section's matches (m.board) is written, and the split is
   kept on the bracket as boardGroups { count, boards:[board of group 1, of group 2, ...] }. Several groups may share a
   board. Pure functions, run by the organiser app and by the server (api/_lib/engine.js) alike. */
var BG_COUNTS = [2, 4, 8, 16];
var BG_MAX_ENTRIES = 16;   // at most 16 entries on one board sheet (owner, 2026-11-02): an A4 sheet stays readable

/* The stored split, when it is one this bracket can have (an edited or imported copy may hold another): else null. */
function bgValid(bracket){
  var g = bracket && bracket.boardGroups;
  return g && Array.isArray(g.boards) && g.boards.length === g.count && bgChoices(bracket).indexOf(g.count) >= 0 ? g : null;
}
function bgSlots(bracket){ return bracket && bracket.rounds && bracket.rounds[0] ? bracket.rounds[0].length * 2 : 0; }
/* The group counts a bracket can be split into: an even split, at least one match per section, at most 16 per group. */
function bgChoices(bracket){
  var n = bgSlots(bracket);
  return BG_COUNTS.filter(function(c){ return c <= n / 2 && n / c <= BG_MAX_ENTRIES; });
}
/* Rounds inside one section: a section of n/count entries plays down to one winner in log2(n/count) rounds. */
function bgSectionRounds(bracket, count){ return Math.round(Math.log(bgSlots(bracket) / count) / Math.LN2); }
/* The board group (1-based) a match belongs to, or 0 (no board groups, or a match after the sections). */
function bgGroupOf(bracket, ri, mi){
  var g = bgValid(bracket);
  if(!g) return 0;
  if(ri >= bgSectionRounds(bracket, g.count)) return 0;
  var perRound = bracket.rounds[ri].length / g.count;
  return Math.floor(mi / perRound) + 1;
}
/* The default boards: the groups go round the event's boards in turn. */
function bgDefaultBoards(count, eventBoards){
  var b = Math.max(1, parseInt(eventBoards, 10) || 1), out = [];
  for(var i = 0; i < count; i++) out.push((i % b) + 1);
  return out;
}
/* A match that has been played (its board is then left as it is). A bye is not played. */
function bgPlayed(m){ return !!m && !m.bye && (m.aLegs != null || m.bLegs != null || !!m.void || !!m.winnerId); }
/* Each section's matches without a result are put on that group's board. */
function bgWriteBoards(bracket){
  var g = bgValid(bracket); if(!g) return;
  var k = bgSectionRounds(bracket, g.count);
  for(var ri = 0; ri < k && ri < bracket.rounds.length; ri++){
    bracket.rounds[ri].forEach(function(m, mi){
      if(!m || m.bye || bgPlayed(m)) return;
      var b = parseInt(g.boards[bgGroupOf(bracket, ri, mi) - 1], 10);
      if(b > 0) m.board = b;
    });
  }
}
/* Sets (or changes) the split. Returns false when the count is not one this bracket offers. */
function bgSet(bracket, count, eventBoards){
  if(bgChoices(bracket).indexOf(count) < 0) return false;
  var old = bracket.boardGroups;
  if(old && old.count !== count) bgClearBoards(bracket);
  var boards = old && old.count === count ? old.boards.slice() : bgDefaultBoards(count, eventBoards);
  bracket.boardGroups = { count: count, boards: boards };
  bgWriteBoards(bracket);
  return true;
}
function bgSetBoard(bracket, group, board){
  var g = bracket.boardGroups, n = parseInt(board, 10);
  if(!g || !(group >= 1 && group <= g.count) || !(n > 0 && n <= 9999)) return false;
  g.boards[group - 1] = n;
  bgWriteBoards(bracket);
  return true;
}
/* The boards the split wrote, on matches still to play, are cleared (a played match keeps its board). */
function bgClearBoards(bracket){
  var g = bgValid(bracket); if(!g) return;
  var k = bgSectionRounds(bracket, g.count);
  for(var ri = 0; ri < k && ri < bracket.rounds.length; ri++) bracket.rounds[ri].forEach(function(m){ if(m && !bgPlayed(m)) delete m.board; });
}
function bgRemove(bracket){ bgClearBoards(bracket); delete bracket.boardGroups; }
/* One group's section as its own small bracket { rounds, first:{ri,mi} offsets } for the board sheet: the same match
   objects (not copies), round by round. */
function bgSection(bracket, group){
  var g = bracket.boardGroups, k = bgSectionRounds(bracket, g.count), rounds = [];
  for(var ri = 0; ri < k; ri++){
    var per = bracket.rounds[ri].length / g.count;
    rounds.push(bracket.rounds[ri].slice((group - 1) * per, group * per));
  }
  return { rounds: rounds, k: k, offset: function(ri){ return (group - 1) * bracket.rounds[ri].length / g.count; } };
}
/* The match the board champion goes on to, { ri, mi }, or null when the section's winner is the champion of the whole
   bracket (one group: never offered). */
function bgNextMatch(bracket, group){
  var g = bracket.boardGroups, k = bgSectionRounds(bracket, g.count);
  if(k >= bracket.rounds.length) return null;
  return { ri: k, mi: Math.floor((group - 1) / 2) };
}

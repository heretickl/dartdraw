/* Board schedule for Group Boards: pure logic, no DOM. Loaded after pods.js and before the main script in index.html.
   Builds each board's queue of matches (groups in order, then the Finals), with a status per match and, when an
   anticipated start time is set, an estimated start time. Needs globals from index.html (anticipatedStartEpoch,
   matchDurationMinutes, legsForKnockoutRound) and pods.js (podsList, podsFinals, bracketByKey). */

/* Stamps the time a result was entered, and clears the stamp when a result is undone. Entering a result also
   clears any call. Run on every save, so every way of entering or undoing a result is covered. */
function stampDoneTimes(t){
  function visit(b){
    if(!b || !b.rounds) return;
    b.rounds.forEach(function(round){ round.forEach(function(m){
      if(m.winnerId && !m.bye){ if(!m.doneAt) m.doneAt = Date.now(); delete m.called; delete m.calledAt; }
      else if(!m.winnerId && m.doneAt){ delete m.doneAt; }
      /* A call goes when the match can no longer be played as called: a bye, or a player has gone (a correction cleared a slot). */
      if(m.bye || m.void || (!m.winnerId && (!m.aEntryId || !m.bEntryId))){ delete m.called; delete m.calledAt; }
      /* A call is for the two players it was made for: if a correction put someone else in, it no longer applies. */
      if(m.called){
        var pair = m.aEntryId + '|' + m.bEntryId;
        if(!m.calledPair) m.calledPair = pair;
        else if(m.calledPair !== pair){ delete m.called; delete m.calledAt; }
      }
      if(!m.called) delete m.calledPair;
    }); });
  }
  podsList(t).forEach(function(p){ visit(p.bracket); });
  visit(podsFinals(t));
}

function bpRound5(ms){ return Math.round(ms / 300000) * 300000; }

/* The bracket behind a plan entry key: 'ko' is the Finals, 'pod:<id>' is a group. */
function bpBracket(t, key){ return key === 'ko' ? podsFinals(t) : bracketByKey(t, key); }

/* The board plan: { v, hasTimes, boards: { "<board>": [ { key, ri, mi, status, ready, estMs, called } ] } }.
   status: done | up (first not done on its board) | next (second) | later. ready: both players are known.
   estMs: estimated start (rounded to 5 minutes), null for done and up entries or when no start time is set.
   opts.starts also adds startMs, the rounded start for every entry (used by the print sheets). */
function buildBoardPlan(t, opts){
  var anchor = anticipatedStartEpoch(t), hasTimes = anchor != null, base = hasTimes ? anchor : 0;
  var queues = {}, cursor = {}, groupPhaseEnd = base, usedBoards = {};
  function cur(b){ return cursor[b] == null ? base : cursor[b]; }
  function place(key, orgKey, bracket, ri, mi, board, roundStart, ends){
    var m = bracket.rounds[ri][mi];
    var mins = matchDurationMinutes(t, { isKnockout:true, legs:legsForKnockoutRound(t, orgKey, bracket.rounds.length, ri) });
    var start = Math.max(cur(board), roundStart), end = start + mins * 60000;
    var done = !!m.winnerId;
    if(done && hasTimes && m.doneAt){ end = Math.max(cur(board), m.doneAt); start = end; }   // real finish time re-bases the board
    cursor[board] = end; ends.push(end);
    (queues[board] = queues[board] || []).push({ key:key, ri:ri, mi:mi, done:done, ready:!!(m.aEntryId && m.bEntryId), startMs:start, called:!!m.called });
  }
  /* Deals a bracket's real (non-bye) matches round by round onto boards; a round starts when the one before ends. */
  function bracketRounds(key, orgKey, bracket, boardFor, firstStart){
    var prevEnd = firstStart, all = [];
    bracket.rounds.forEach(function(round, ri){
      var ends = [], k = 0;
      round.forEach(function(m, mi){
        if(m.bye || m.void) return;
        if(ri > 0){   // a void feeder means this match will never be played (it becomes a bye or void)
          var fa = bracket.rounds[ri-1][2*mi], fb = bracket.rounds[ri-1][2*mi+1];
          if((fa && fa.void) || (fb && fb.void)) return;
        }
        place(key, orgKey, bracket, ri, mi, boardFor(m, k), prevEnd, ends);
        k++;
      });
      if(ends.length) prevEnd = Math.max.apply(null, ends);
      all = all.concat(ends);
    });
    return all;
  }
  podsList(t).filter(function(p){ return p.confirmed && p.bracket; }).forEach(function(p){
    var boards = (p.boards && p.boards.length) ? p.boards : [1];
    boards.forEach(function(b){ usedBoards[b] = true; });
    var ends = bracketRounds('pod:' + p.id, 'pod:' + p.id, p.bracket, function(m, k){ return boards[k % boards.length]; }, base);
    if(ends.length) groupPhaseEnd = Math.max(groupPhaseEnd, Math.max.apply(null, ends));
  });
  var fin = podsFinals(t);
  if(fin){
    var list = Object.keys(usedBoards).map(Number).sort(function(a, b){ return a - b; });
    if(!list.length) list = [1];
    var brk = (t.format.breaks || {}).knockout, brkMs = (brk && brk.enabled ? parseInt(brk.minutes) || 0 : 0) * 60000;
    bracketRounds('ko', 'knockout', fin, function(m, k){ var b = parseInt(m.board); return b > 0 ? b : list[k % list.length]; }, groupPhaseEnd + brkMs);
  }
  var out = { v:1, hasTimes:hasTimes, boards:{} };
  Object.keys(queues).forEach(function(b){
    var undone = 0;
    out.boards[b] = queues[b].map(function(e){
      var status = 'done';
      if(!e.done){ undone++; status = undone === 1 ? 'up' : undone === 2 ? 'next' : 'later'; }
      var entry = { key:e.key, ri:e.ri, mi:e.mi, status:status, ready:e.ready,
                    estMs:(hasTimes && status !== 'done' && status !== 'up') ? bpRound5(e.startMs) : null, called:e.called };
      if(opts && opts.starts) entry.startMs = hasTimes ? bpRound5(e.startMs) : null;
      return entry;
    });
  });
  return out;
}

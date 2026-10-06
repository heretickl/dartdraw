/* Group Boards: pure logic, no DOM. Loaded after render.js and before the main script in index.html.
   It calls engine functions defined in index.html (ensureSeedOrder, generateBracket, uid, nearestBracket,
   seedSlotOrder, propagateByes, matchDurationMinutes, simulateKnockoutMinutes) and render.js
   (bracketChampion) at call time. Organisers and spectators see these as "Groups"; the internal name is
   "pods" so they never clash with state.groups (round robin). */
var PODS_MAX = 128;

function podsList(t){ if(!t.pods) t.pods = []; return t.pods; }

/* The Finals, if it was built from the groups. A plain bracket left over from another format (the organiser switched
   to Group Boards after building one) is not a Finals: it is ignored, and replaced when the last group is confirmed. */
function podsFinals(t){ return t.knockout && t.knockout.podFinals ? t.knockout : null; }

function podsPlayerCount(t){
  var active = t.entriesList.filter(function(e){ return !e.withdrawn; }).length;
  return t.entriesList.length ? active : (parseInt(t.eventCreation.entries) || 0);
}

/* n players into p groups: is that allowed? (pure, so a number typed on screen can be checked before it is saved) */
function podsValidateCount(n, p){
  if(p < 2) return { ok:false, message:'Choose at least 2 groups.' };
  if(p > PODS_MAX) return { ok:false, message:'Choose at most '+PODS_MAX+' groups.' };
  if(n < p*2) return { ok:false, message:'Each group needs at least 2 players. '+n+' players can fill at most '+Math.floor(n/2)+' groups.' };
  return { ok:true, message:'' };
}
/* pOverride: check a number typed on screen instead of the saved one. */
function podsValidate(t, pOverride){
  return podsValidateCount(podsPlayerCount(t), pOverride != null ? (parseInt(pOverride) || 0) : (parseInt(t.format.podCount) || 0));
}

/* n players into p groups, as even as possible: sizes differ by at most 1, larger groups first. */
function podSizes(n, p){
  var base = Math.floor(n/p), extra = n % p, out = [];
  for(var i=0;i<p;i++) out.push(base + (i < extra ? 1 : 0));
  return out;
}

function podsSeededCount(t){
  if(!t.seedOrder) ensureSeedOrder(t);
  if(!t.format.seedingEnabled) return 0;
  return Math.min(parseInt(t.format.numSeeds) || 0, t.seedOrder.length);
}
/* entry id -> overall seed number (1 = best), seeded players only */
function podsOverallSeeds(t){
  var out = {}, k = podsSeededCount(t);
  for(var i=0;i<k;i++) out[t.seedOrder[i]] = i+1;
  return out;
}
function podsShuffle(arr, rng){
  var a = arr.slice();
  for(var i=a.length-1;i>0;i--){ var j = Math.floor(rng()*(i+1)); var tmp = a[i]; a[i] = a[j]; a[j] = tmp; }
  return a;
}

/* Deals every active entry into p groups. Seeded players go one per group in a snake order
   (1..p, then p..1, ...); everyone else is dealt to a smallest group, ties broken by rng. */
function podsDeal(t, rng){
  rng = rng || Math.random;
  var p = parseInt(t.format.podCount);
  ensureSeedOrder(t);
  var order = t.seedOrder.slice(), k = podsSeededCount(t);
  var groups = []; for(var i=0;i<p;i++) groups.push([]);
  order.slice(0, k).forEach(function(id, i){
    var pass = Math.floor(i/p), pos = i % p;
    groups[pass % 2 === 0 ? pos : p-1-pos].push(id);
  });
  podsShuffle(order.slice(k), rng).forEach(function(id){
    var min = Math.min.apply(null, groups.map(function(g){ return g.length; }));
    var smallest = []; groups.forEach(function(g, gi){ if(g.length === min) smallest.push(gi); });
    groups[smallest[Math.floor(rng()*smallest.length)]].push(id);
  });
  return groups;
}

function podsOrgOf(t, id){
  var e = t.entriesList.find(function(x){ return x.id === id; });
  return e && e.org ? e.org.trim().toLowerCase() : '';
}
/* Number of same-club pairs inside one group. */
function podsClashPairs(t, ids){
  var count = {}, pairs = 0;
  ids.forEach(function(id){ var o = podsOrgOf(t, id); if(!o) return; pairs += count[o] || 0; count[o] = (count[o] || 0) + 1; });
  return pairs;
}
/* Best effort: swap UNSEEDED players between groups while that lowers the number of same-club pairs inside
   groups. Seeded players never move and group sizes never change. Club counts are kept per group, so judging a
   swap takes constant time and the search carries on after each swap instead of starting over: a 540-player draw
   takes milliseconds. */
function podsSeparateClubs(t, groups){
  var seeded = podsOverallSeeds(t), clubOf = {}, counts = [];
  groups.forEach(function(ids, gi){
    counts[gi] = {};
    ids.forEach(function(id){
      var o = podsOrgOf(t, id);
      clubOf[id] = o;
      if(o) counts[gi][o] = (counts[gi][o] || 0) + 1;
    });
  });
  function lose(c, o){ return o ? (c[o] || 0) - 1 : 0; }   // pairs lost when one member of club o leaves a group
  function gain(c, o){ return o ? (c[o] || 0) : 0; }        // pairs gained when one member of club o joins a group
  function shift(c, from, to){ if(from) c[from]--; if(to) c[to] = (c[to] || 0) + 1; }
  for(var pass=0; pass<200; pass++){
    var improved = false;
    for(var a=0; a<groups.length; a++){
      for(var xi=0; xi<groups[a].length; xi++){
        var x = groups[a][xi], ox = clubOf[x];
        if(seeded[x] || !ox || counts[a][ox] < 2) continue;      // only a player who shares a group with a club-mate
        var swapped = false;
        for(var b=0; b<groups.length && !swapped; b++){
          if(b === a) continue;
          for(var yi=0; yi<groups[b].length; yi++){
            var y = groups[b][yi], oy = clubOf[y];
            if(seeded[y] || oy === ox) continue;
            // after the swap group a has lost x and gained y, and group b has lost y and gained x
            var delta = (gain(counts[a], oy) - lose(counts[a], ox)) + (gain(counts[b], ox) - lose(counts[b], oy));
            if(delta < 0){
              groups[a][xi] = y; groups[b][yi] = x;
              shift(counts[a], ox, oy); shift(counts[b], oy, ox);
              improved = swapped = true;
              break;
            }
          }
        }
      }
    }
    if(!improved) break;
  }
}

/* (Re)builds one group's bracket from its entryIds: best seed first, so the best seed gets any bye.
   Only seeded players carry a (overall) seed number in the bracket. */
function podsBuildBracket(t, pod){
  /* Seeded players first, best seed first (so they get any bye). Everyone else keeps the order they were dealt in,
     which is random, so with seeding off the byes are not simply given to the earliest registrants. */
  var overall = podsOverallSeeds(t);
  var seededIds = pod.entryIds.filter(function(id){ return overall[id]; }).sort(function(a, b){ return overall[a] - overall[b]; });
  pod.entryIds = seededIds.concat(pod.entryIds.filter(function(id){ return !overall[id]; }));
  var ordered = pod.entryIds.map(function(id){ var e = t.entriesList.find(function(x){ return x.id === id; }); return { entryId:id, org:e ? e.org : '' }; });
  var bracket = generateBracket(ordered, 'Group '+pod.label);
  var seeds = {};
  pod.entryIds.forEach(function(id){ if(overall[id]) seeds[id] = overall[id]; });
  bracket.seeds = seeds; bracket.seedLabels = {};
  bracket.podLabel = pod.label;
  pod.bracket = bracket; pod.winnerId = null;
}

function generatePods(t, rng){
  var v = podsValidate(t);
  if(!v.ok) return v;
  var groups = podsDeal(t, rng);
  if(t.format.orgSplit) podsSeparateClubs(t, groups);
  var boards = Math.max(1, parseInt(t.eventCreation.boards) || 1);
  t.pods = groups.map(function(ids, i){
    var pod = { id: uid('pod'), label: String(i+1), entryIds: ids.slice(), boards: [(i % boards) + 1], confirmed:false, bracket:null, winnerId:null };
    podsBuildBracket(t, pod);
    return pod;
  });
  if(podsFinals(t)) t.knockout = null;   // a redraw discards the old Finals; a plain bracket from another format is left alone
  return { ok:true, message:'' };
}

function podBoardLabel(pod){ return (pod.boards.length === 1 ? 'Board ' : 'Boards ') + pod.boards.join(', '); }

function podsFindOf(t, entryId){ return podsList(t).find(function(p){ return p.entryIds.indexOf(entryId) !== -1; }) || null; }

/* ---- bracket keys: 'pod:<id>' for a group's bracket, 'knockout' / 'knockoutLosers' as before ---- */
function podBracketKey(pod){ return 'pod:' + pod.id; }
function podByKey(t, key){
  var m = /^pod:(.+)$/.exec(key || '');
  return m ? podsList(t).find(function(p){ return p.id === m[1]; }) || null : null;
}
function bracketByKey(t, key){
  var pod = podByKey(t, key);
  return pod ? pod.bracket : t[key];
}
function podBracketHasLegs(bracket){ return bracket.rounds.some(function(r){ return r.some(function(m){ return m.aLegs != null; }); }); }
function podHasScores(pod){ return podBracketHasLegs(pod.bracket); }
function podsAnyScores(t){ return podsList(t).some(podHasScores) || !!(podsFinals(t) && podBracketHasLegs(podsFinals(t))); }

/* ---- hand moves: only between unconfirmed, unscored groups; every group keeps at least 2 players ---- */
function podsCanEdit(pod){ return !pod.confirmed && !podHasScores(pod); }
function podsMovePlayer(t, entryId, toPodId){
  var from = podsFindOf(t, entryId), to = podsList(t).find(function(p){ return p.id === toPodId; });
  if(!from || !to || from === to) return { ok:false, message:'Pick a different group.' };
  if(!podsCanEdit(from) || !podsCanEdit(to)) return { ok:false, message:'Both groups must be unconfirmed with no scores.' };
  if(from.entryIds.length <= 2) return { ok:false, message:'A group needs at least 2 players.' };
  from.entryIds = from.entryIds.filter(function(id){ return id !== entryId; });
  to.entryIds.push(entryId);
  podsBuildBracket(t, from); podsBuildBracket(t, to);
  return { ok:true, message:'' };
}
function podsSwapPlayers(t, entryA, entryB){
  var pa = podsFindOf(t, entryA), pb = podsFindOf(t, entryB);
  if(!pa || !pb || pa === pb) return { ok:false, message:'Pick players from two different groups.' };
  if(!podsCanEdit(pa) || !podsCanEdit(pb)) return { ok:false, message:'Both groups must be unconfirmed with no scores.' };
  pa.entryIds = pa.entryIds.map(function(id){ return id === entryA ? entryB : id; });
  pb.entryIds = pb.entryIds.map(function(id){ return id === entryB ? entryA : id; });
  podsBuildBracket(t, pa); podsBuildBracket(t, pb);
  return { ok:true, message:'' };
}

/* ---- Finals ---- */
/* Lower is stronger: a group's best (lowest) overall seed. Unseeded groups rank after seeded ones, by number. */
function podBestSeed(t, pod){
  var overall = podsOverallSeeds(t), best = Infinity;
  pod.entryIds.forEach(function(id){ if(overall[id] && overall[id] < best) best = overall[id]; });
  return best;
}
function podsRankedForFinals(t){
  return podsList(t).slice().sort(function(a, b){
    var sa = podBestSeed(t, a), sb = podBestSeed(t, b);
    if(sa !== sb) return sa < sb ? -1 : 1;
    return parseInt(a.label) - parseInt(b.label);
  });
}
function podsEmptyMatch(){ return { id: uid('km'), aEntryId:null, bEntryId:null, aLegs:null, bLegs:null, winnerId:null, bye:false }; }

/* Builds t.knockout (the Finals) with "Winner of Group N" placeholders. Slots come from seedSlotOrder with
   group strength as the seed, so the strongest groups sit in opposite halves and get any byes. */
function generateFinalsFromPods(t){
  var ranked = podsRankedForFinals(t);
  var size = nearestBracket(Math.max(ranked.length, 2)).size;
  var slotOrder = seedSlotOrder(size), podBySeed = {};
  ranked.forEach(function(pod, i){ podBySeed[i+1] = pod; });
  var slots = slotOrder.map(function(s){ return podBySeed[s] || null; });
  var round1 = [];
  for(var i=0;i<size;i+=2){
    var a = slots[i], b = slots[i+1], m = podsEmptyMatch();
    if(a) m.aFromPod = a.id;
    if(b) m.bFromPod = b.id;
    if((a && !b) || (!a && b)) m.bye = true;   // a lone group's winner advances when it is known
    round1.push(m);
  }
  var rounds = [round1], count = round1.length;
  while(count > 1){ count = count/2; var r = []; for(var j=0;j<count;j++) r.push(podsEmptyMatch()); rounds.push(r); }
  t.knockout = { id: uid('kb'), label:'Finals', size: size, rounds: rounds, roundStartedAt: rounds.map(function(){ return null; }),
    seeds: podsOverallSeeds(t), seedLabels:{}, podFinals:true };
  syncFinalsFromPods(t);
  return t.knockout;
}

function podChampion(pod){ return bracketChampion(pod.bracket) || null; }
function podIsFinished(pod){ return !!podChampion(pod); }
/* True when the Finals match at (ri, mi), or any later match that depends on it, already has a score. */
function podsFinalsFeedScored(fin, ri, mi){
  for(var r=ri, idx=mi; r<fin.rounds.length; r++, idx=Math.floor(idx/2)){
    if(fin.rounds[r][idx].aLegs != null || fin.rounds[r][idx].bLegs != null) return true;
  }
  return false;
}
/* Copies finished groups' winners into the Finals first round. A slot that would change is left alone (and
   reported in `blocked`) when the Finals match it feeds, or a later one depending on it, already has a score. */
function syncFinalsFromPods(t){
  var fin = t.knockout, result = { changed:false, blocked:[] };
  podsList(t).forEach(function(pod){ pod.winnerId = podChampion(pod); });
  if(!fin || !fin.podFinals) return result;
  fin.rounds[0].forEach(function(m, mi){
    ['a', 'b'].forEach(function(side){
      var podId = m[side+'FromPod'];
      if(!podId) return;
      var pod = podsList(t).find(function(p){ return p.id === podId; });
      var winner = pod ? pod.winnerId : null;
      if(m[side+'EntryId'] === winner) return;
      if(podsFinalsFeedScored(fin, 0, mi)){ result.blocked.push(podId); return; }
      m[side+'EntryId'] = winner;
      if(m.bye){
        m.winnerId = winner;
        /* A bye group that no longer has a winner must also leave the Finals match it had been pushed into
           (propagateByes only ever pushes winners forward). That match is unscored, or we would have returned above. */
        if(!winner && fin.rounds.length > 1){
          var nx = fin.rounds[1][Math.floor(mi/2)], ns = mi % 2 === 0 ? 'aEntryId' : 'bEntryId';
          if(nx[ns]){ nx[ns] = null; nx.winnerId = null; nx.aLegs = null; nx.bLegs = null; nx.wo = false; nx.bye = false; }
        }
      }
      result.changed = true;
    });
  });
  if(result.changed) propagateByes(fin.rounds);
  return result;
}
/* Pushes each match's winner into the next round and, round by round, clears a next-round slot (and that match's
   result) whose feeder no longer has that winner, so correcting an early result cannot leave a stale later one.
   (propagateByes only resets the very next match, and only when there is a winner.) */
function podsPropagate(rounds){
  for(var r=0; r<rounds.length-1; r++){
    rounds[r].forEach(function(m, i){
      var next = rounds[r+1][Math.floor(i/2)], slot = i % 2 === 0 ? 'aEntryId' : 'bEntryId', want = m.winnerId || null;
      if(next[slot] === want) return;
      next[slot] = want;
      next.winnerId = null; next.aLegs = null; next.bLegs = null; next.wo = false; next.bye = false;
    });
  }
}
/* Applies an edit to a group's bracket (apply() mutates pod.bracket.rounds), then re-syncs the Finals. If the
   Finals refuses because a dependent Finals match is scored, the edit is undone. */
function podsApplyResult(t, pod, apply){
  var snapshot = JSON.stringify(pod.bracket.rounds);
  apply();
  podsPropagate(pod.bracket.rounds);
  var r = syncFinalsFromPods(t);
  if(r.blocked.length){
    pod.bracket.rounds = JSON.parse(snapshot);
    syncFinalsFromPods(t);
    return { ok:false, message:'This result would change who reaches the Finals, but a Finals match that depends on it already has a score.' };
  }
  return { ok:true, message:'' };
}

/* ---- confirming and progress ---- */
function podsConfirm(t, podId){
  var pod = podsList(t).find(function(p){ return p.id === podId; });
  if(!pod) return;
  pod.confirmed = true;
  if(podsList(t).every(function(p){ return p.confirmed; }) && !podsFinals(t)) generateFinalsFromPods(t);
}
function podsConfirmAll(t){
  podsList(t).forEach(function(p){ p.confirmed = true; });
  if(!podsFinals(t)) generateFinalsFromPods(t);
}
function podsUnconfirm(t, podId){
  var pod = podsList(t).find(function(p){ return p.id === podId; });
  if(!pod) return { ok:false, message:'Unknown group.' };
  if(podHasScores(pod)) return { ok:false, message:'This group already has scores.' };
  var fin = podsFinals(t);
  if(fin && podBracketHasLegs(fin)) return { ok:false, message:'The Finals already has scores.' };
  pod.confirmed = false;
  if(fin) t.knockout = null;
  return { ok:true, message:'' };
}
/* Real matches in a group (byes excluded) and how many have a winner. */
function podMatchCounts(pod){
  var done = 0, total = 0;
  pod.bracket.rounds.forEach(function(r){ r.forEach(function(m){ if(m.bye) return; total++; if(m.winnerId) done++; }); });
  return { done:done, total:total };
}
function podsProgress(t){
  var pods = podsList(t);
  return { total: pods.length, finished: pods.filter(podIsFinished).length, scored: pods.filter(podHasScores).length,
    confirmed: pods.filter(function(p){ return p.confirmed; }).length };
}

/* ---- time estimate: groups run at the same time on their own boards (groups sharing a board queue), then the Finals ---- */
/* One group's own running time: its matches in rounds, each round taking as many waves as the group has boards allow. */
function podMinutes(pod, perMatch){
  var b = Math.max(1, (pod.boards || []).length), mins = 0;
  ((pod.bracket && pod.bracket.rounds) || []).forEach(function(round){
    var matches = round.filter(function(m){ return !m.bye; }).length;
    mins += Math.ceil(matches / b) * perMatch;
  });
  return mins;
}
/* Before the draw the groups are assumed to be dealt one per board in turn. Once drawn, the real groups are used:
   their sizes as they stand, and the boards the organiser gave them. A board's groups queue; boards run side by side. */
function podsEstimateMinutes(t, boards){
  if(!podsValidate(t).ok) return null;
  boards = Math.max(1, parseInt(boards) || 1);
  var legs = parseInt(t.format.podLegs) || parseInt(t.format.bestOfLegs) || 5;
  var perMatch = matchDurationMinutes(t, { isKnockout:true, legs:legs });
  var perBoard = {}, pods = podsList(t), groupCount = parseInt(t.format.podCount);
  if(pods.length){
    groupCount = pods.length;
    pods.forEach(function(p){
      var mins = podMinutes(p, perMatch);
      (p.boards && p.boards.length ? p.boards : [1]).forEach(function(b){ perBoard[b] = (perBoard[b] || 0) + mins; });
    });
  } else {
    podSizes(podsPlayerCount(t), groupCount).forEach(function(size, i){
      var b = (i % boards) + 1;
      perBoard[b] = (perBoard[b] || 0) + (size - 1) * perMatch;
    });
  }
  var groupsPhase = Math.max.apply(null, Object.keys(perBoard).map(function(k){ return perBoard[k]; }));
  var brk = t.format.breaks || {};
  return groupsPhase + simulateKnockoutMinutes(t, groupCount, 'knockout', boards)
    + (brk.knockout && brk.knockout.enabled ? parseInt(brk.knockout.minutes) || 0 : 0);
}

/* ---- the entry list changing after the draw (late entries, withdrawals) ---- */
/* Active players who are in no group, for example entered after the draw. */
function podsUnplaced(t){
  var inGroup = {};
  podsList(t).forEach(function(p){ p.entryIds.forEach(function(id){ inGroup[id] = true; }); });
  return t.entriesList.filter(function(e){ return !e.withdrawn && !inGroup[e.id]; }).map(function(e){ return e.id; });
}
/* Players still in a group who are no longer active entries (removed or withdrawn). */
function podsGone(t){
  var active = {}, out = [];
  t.entriesList.forEach(function(e){ if(!e.withdrawn) active[e.id] = true; });
  podsList(t).forEach(function(p){ p.entryIds.forEach(function(id){ if(!active[id]) out.push(id); }); });
  return out;
}
/* Puts an unplaced player into a group that can still be edited. */
function podsPlaceLate(t, entryId, toPodId){
  var pod = podsList(t).find(function(p){ return p.id === toPodId; });
  if(!pod) return { ok:false, message:'Pick a group.' };
  if(podsUnplaced(t).indexOf(entryId) === -1) return { ok:false, message:'That player is already in a group.' };
  if(!podsCanEdit(pod)) return { ok:false, message:'That group is confirmed or already has scores.' };
  pod.entryIds.push(entryId);
  podsBuildBracket(t, pod);
  return { ok:true, message:'' };
}
/* Drops removed or withdrawn players from groups that can still be edited. Returns the ids it could not remove
   (their group is confirmed, has scores, or would fall below 2 players). */
function podsRemoveGone(t){
  var gone = podsGone(t), stuck = [];
  podsList(t).forEach(function(p){
    var mine = p.entryIds.filter(function(id){ return gone.indexOf(id) !== -1; });
    if(!mine.length) return;
    if(!podsCanEdit(p) || p.entryIds.length - mine.length < 2){ stuck = stuck.concat(mine); return; }
    p.entryIds = p.entryIds.filter(function(id){ return gone.indexOf(id) === -1; });
    podsBuildBracket(t, p);
  });
  return { ok: !stuck.length, stuck: stuck,
    message: stuck.length ? 'Some players could not be removed: their group is confirmed, has scores, or would drop below 2 players.' : '' };
}

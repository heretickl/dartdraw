// The round robin -> knockout slot placement exactly as app.html had it at the end of round 6 (the incremental search and
// the group-separation step, before the round 7 search change). Used by tests/bracket-engine.test.js to check that round 7
// is never worse. Generated from app.html; do not edit by hand. Needs seedSlotOrder, nearestBracket and
// earliestMeetingRound from the app (passed in).
module.exports = function makeRound6(app){
  const seedSlotOrder = app.seedSlotOrder, nearestBracket = app.nearestBracket, earliestMeetingRound = app.earliestMeetingRound;
  const MEET_TABLES = {};
  function meetTable(size){
    if(!MEET_TABLES[size]){ const t = []; for(let i=0;i<size;i++){ const row = new Array(size); for(let j=0;j<size;j++) row[j] = i===j ? 0 : earliestMeetingRound(i, j); t.push(row); } MEET_TABLES[size] = t; }
    return MEET_TABLES[size];
  }
  return function round6Slots(orderedEntries, opts){
  const n = orderedEntries.length;
  const size = nearestBracket(Math.max(n,2)).size;
  const totalRounds = Math.log2(size);
  const slotOrder = seedSlotOrder(size); // seed number (1-indexed) per slot
  const bySeed = {};
  orderedEntries.forEach((e,i)=> bySeed[i+1] = e );
  /* When every entry here is a round-robin qualifier and every group
     contributes exactly two of them (the normal qualifiersPerGroup=2
     case), reassign seed NUMBERS within their existing rank block (all
     rank-1s keep seeds 1..k, all rank-2s keep k+1..2k — bye priority is
     untouched) so each group's two qualifiers land in opposite bracket
     halves by construction. Round 1 always pairs a top-half seed with a
     bottom-half one, so this simultaneously keeps every group's pair
     off round 1 (already true) AND guarantees they can only meet again
     at the very last round the bracket has — rather than leaving that
     to the best-effort swap search below, which (once it also has to
     dodge same-position round-1 pairings) doesn't always find it. */
  const byGroupForHalving = {};
  orderedEntries.forEach(e=>{ if(e.groupId!=null) (byGroupForHalving[e.groupId] = byGroupForHalving[e.groupId]||[]).push(e); });
  const pairedGroupIds = Object.keys(byGroupForHalving).filter(g=>byGroupForHalving[g].length===2);
  const distinctRanks = Array.from(new Set(orderedEntries.map(e=>e.rank))).filter(r=>r!=null).sort((a,b)=>a-b);
  const betterRank = distinctRanks[0];
  const rank1Count = orderedEntries.filter(e=>e.rank===betterRank).length;
  if(pairedGroupIds.length && distinctRanks.length===2 && orderedEntries.every(e=>e.groupId!=null && distinctRanks.includes(e.rank)) && rank1Count*2===orderedEntries.length){
    const halfLen = Math.floor(slotOrder.length/2);
    const topSeeds = slotOrder.slice(0, halfLen);
    const bottomSeeds = slotOrder.slice(halfLen);
    const pool = {
      top1: topSeeds.filter(s=>s<=rank1Count).sort((a,b)=>a-b),
      bot1: bottomSeeds.filter(s=>s<=rank1Count).sort((a,b)=>a-b),
      /* Only seed numbers that hold an entry (<= n): a higher one is a bye slot. Handing one out (an odd number of
         groups, e.g. 3 or 7 groups of 2) left the entry's old seed in place too, so it was listed twice and a bye lost. */
      top2: topSeeds.filter(s=>s>rank1Count && s<=n).sort((a,b)=>a-b),
      bot2: bottomSeeds.filter(s=>s>rank1Count && s<=n).sort((a,b)=>a-b)
    };
    const assigned = {};
    pairedGroupIds.forEach((g,idx)=>{
      const [t1, t2] = byGroupForHalving[g][0].rank===betterRank ? byGroupForHalving[g] : [byGroupForHalving[g][1], byGroupForHalving[g][0]];
      const flip = idx%2===0;
      const firstChoice = flip ? pool.top1 : pool.bot1, secondChoice = flip ? pool.bot2 : pool.top2;
      const fallback1 = flip ? pool.bot1 : pool.top1, fallback2 = flip ? pool.top2 : pool.bot2;
      const s1 = firstChoice.length ? firstChoice.shift() : fallback1.shift();
      const s2 = secondChoice.length ? secondChoice.shift() : fallback2.shift();
      assigned[t1.entryId] = s1; assigned[t2.entryId] = s2;
    });
    orderedEntries.forEach(e=>{ if(assigned[e.entryId]) bySeed[assigned[e.entryId]] = e; });
  }
  let slots = slotOrder.map(seed=> bySeed[seed] || null);

  /* Byes always go to the best-ranked entries under plain seeding — a low
     seed number is paired against the highest (often empty) slot, so
     seed 1 is the first to get a bye if any exist, then seed 2, and so
     on. Since round-robin qualifiers are numbered group-champions-first
     (see collectRankedEntries), this already means every group's winner
     is ahead of every group's runner-up for bye priority — no group-
     aware special-casing needed, just don't let the clash-avoidance pass
     below undo it by handing a bye to a worse seed instead. Snapshot
     which seed numbers are bye recipients here, before any swaps, and
     restrict every swap to stay within that same bye/real-match cohort. */
  const seedOfEntryId = {};
  Object.keys(bySeed).forEach(k=>{ seedOfEntryId[bySeed[k].entryId] = +k; });   // the seeds as finally assigned (after the halving above)
  const originalByeSeed = {};
  for(let i=0;i<slots.length;i+=2){
    if(slots[i] && !slots[i+1]) originalByeSeed[slotOrder[i]] = true;
    else if(slots[i+1] && !slots[i]) originalByeSeed[slotOrder[i+1]] = true;
  }
  const cohortOf = entry => entry ? (originalByeSeed[seedOfEntryId[entry.entryId]] ? 'bye' : 'real') : 'empty';

  /* Two different groups' same-position finishers (both group winners,
     or both runners-up, etc.) must never meet in round 1 either — a
     round-of-16 shouldn't pit one group's champion against another
     group's champion while a champion elsewhere gets an easier-looking
     runner-up. Standard seeding already guarantees this for free (seed i
     always faces seed size+1-i, and group-champions-first numbering
     means that's always a winner vs a runner-up) — this only needs
     active fixing on top of that when qualifier counts don't divide the
     bracket evenly (e.g. 9 groups into a 32-slot bracket can otherwise
     leave two runners-up paired together). Unlike the group/org clashes
     above, this only needs to clear round 1 — it doesn't chase the
     latest possible round beyond that. */
  const rankOfEntryId = {};
  orderedEntries.forEach(e=>{ if(e.rank!=null) rankOfEntryId[e.entryId] = e.rank; });
  function matchHasRankClash(evenSlot){
    const a = slots[evenSlot], b = slots[evenSlot+1];
    if(!a || !b) return false;
    const ra = rankOfEntryId[a.entryId], rb = rankOfEntryId[b.entryId];
    return ra!=null && rb!=null && ra===rb;
  }

  const infoByEntry = {};
  orderedEntries.forEach(e=>{ infoByEntry[e.entryId] = { org: e.org, groupId: e.groupId }; });
  /* Every pair of entries that share a non-blank org, or already played
     each other in the same round-robin group (possible whenever
     qualifiersPerGroup>1), needs separating — not just kept out of an
     immediate meeting, but pushed as late as the bracket allows, the same
     guarantee ordinary seeding already gives seed 1 vs seed 2. */
  const clashPairs = [];
  for(let i=0;i<orderedEntries.length;i++){
    for(let j=i+1;j<orderedEntries.length;j++){
      const a = infoByEntry[orderedEntries[i].entryId], b = infoByEntry[orderedEntries[j].entryId];
      if((a.org && a.org===b.org) || (a.groupId && a.groupId===b.groupId)){
        clashPairs.push([orderedEntries[i].entryId, orderedEntries[j].entryId]);
      }
    }
  }
  if(clashPairs.length){
    /* Greedy local search: repeatedly take whichever clash pair is
       currently worst-separated and try every alternative slot for its
       second entry, keeping the swap only if it pushes THIS pair later
       without ever letting any pair anywhere become worse-separated than
       the current global worst (never trade one pair's fairness for
       another's — but do grab a free improvement for a pair even when
       it isn't the current worst). Repeat full passes until nothing
       improves or the bound is hit — best-effort, same as before, it
       just aims for the latest possible round instead of merely
       not-immediate.
       Incremental (round 6): the same decisions in the same order as the earlier version (which recomputed every
       pair for every trial swap and took minutes for 64 entries), but each pair's separation is kept up to date and a
       trial swap only recomputes the pairs of the two entries it moves; the worst separation comes from a count of pairs
       per round. tests/bracket-engine.test.js checks the result is identical to the earlier version. */
    const pos = {};                                     // entryId -> slot
    slots.forEach((s,i)=>{ if(s) pos[s.entryId] = i; });
    const meet = meetTable(slots.length);
    const pairsOf = {};                                 // entryId -> indices of its clash pairs
    clashPairs.forEach(([a,b],pi)=>{ (pairsOf[a] = pairsOf[a]||[]).push(pi); (pairsOf[b] = pairsOf[b]||[]).push(pi); });
    const sep = clashPairs.map(([a,b])=> meet[pos[a]][pos[b]]);
    const cnt = new Array(totalRounds+1).fill(0);       // pairs per separation round
    sep.forEach(s=>{ cnt[s]++; });
    const floor = ()=>{ for(let r=0;r<cnt.length;r++) if(cnt[r]>0) return r; return Infinity; };
    const slotCohort = slots.map(cohortOf);             // each slot's bye/real/empty cohort, kept in step with the swaps
    const stamp = new Array(clashPairs.length).fill(-1);
    let stampNo = 0;
    /* The pairs touched by moving entries x and y (each pair once). */
    const touched = (x, y)=>{
      stampNo++;
      const out = [];
      [x, y].forEach(e=>{ if(e) (pairsOf[e.entryId]||[]).forEach(pi=>{ if(stamp[pi]!==stampNo){ stamp[pi] = stampNo; out.push(pi); } }); });
      return out;
    };
    const sepAfter = (pi, x, y, xTo, yTo)=>{
      const [a,b] = clashPairs[pi];
      const pa = (x && a===x.entryId) ? xTo : (y && a===y.entryId) ? yTo : pos[a];
      const pb = (x && b===x.entryId) ? xTo : (y && b===y.entryId) ? yTo : pos[b];
      return meet[pa][pb];
    };
    let pass = 0;
    const maxPasses = clashPairs.length * 2 + 4;
    let improvedThisPass = true;
    while(improvedThisPass && pass < maxPasses){
      pass++;
      improvedThisPass = false;
      const order = clashPairs.map((p,pi)=> pi).sort((p,q)=> sep[p]-sep[q]);
      for(const pi of order){
        const pair = clashPairs[pi];
        const oldSep = sep[pi];
        if(oldSep >= totalRounds-1) continue; // already final-only — can't do better
        const globalFloor = floor();
        const fromSlot = pos[pair[1]];
        const X = slots[fromSlot], cohortX = slotCohort[fromSlot];
        let bestJ = -1, bestPairSep = oldSep;
        for(let j=0;j<slots.length;j++){
          if(j===fromSlot) continue;
          if(slotCohort[j] !== cohortX) continue; // never trade a bye to/from a worse/better seed
          const Y = slots[j];
          /* This pair's own separation after the trial move, first: most trial slots fail here, cheaply. */
          const newPairSep = meet[j][(Y && Y.entryId===pair[0]) ? fromSlot : pos[pair[0]]];
          if(!(newPairSep > bestPairSep)) continue;
          slots[fromSlot]=Y; slots[j]=X;
          const fromMatchStart = fromSlot - (fromSlot%2), jMatchStart = j - (j%2);
          const rankClash = matchHasRankClash(fromMatchStart) || matchHasRankClash(jMatchStart);
          slots[j]=Y; slots[fromSlot]=X;
          if(rankClash) continue;
          const tp = touched(X, Y);
          const newSeps = tp.map(p=> sepAfter(p, X, Y, j, fromSlot));
          tp.forEach((p,k)=>{ cnt[sep[p]]--; cnt[newSeps[k]]++; });
          const newFloor = floor();
          tp.forEach((p,k)=>{ cnt[newSeps[k]]--; cnt[sep[p]]++; });
          if(newFloor >= globalFloor){ bestPairSep = newPairSep; bestJ = j; }
        }
        if(bestJ>=0){
          const Y = slots[bestJ];
          const tp = touched(X, Y);
          const newSeps = tp.map(p=> sepAfter(p, X, Y, bestJ, fromSlot));
          tp.forEach((p,k)=>{ cnt[sep[p]]--; cnt[newSeps[k]]++; sep[p] = newSeps[k]; });
          slots[fromSlot]=Y; slots[bestJ]=X;
          pos[X.entryId] = bestJ; if(Y) pos[Y.entryId] = fromSlot;
          const c = slotCohort[fromSlot]; slotCohort[fromSlot] = slotCohort[bestJ]; slotCohort[bestJ] = c;
          improvedThisPass = true;
        }
      }
    }
  }

  /* Clean up any round-1 same-position clash pure seeding itself left
     behind (only possible when qualifier counts don't split the bracket
     exactly in half — see the comment above). For each, pull in a
     same-cohort entry from elsewhere that doesn't itself clash (by
     group, org, or position) with either side of the swap, preferring
     one that doesn't disturb an already-resolved round-1 match. */
  for(let m=0; m<slots.length; m+=2){
    if(!matchHasRankClash(m)) continue;
    const victimSlot = m+1; // keep the earlier-seeded side in place, move the other
    const victim = slots[victimSlot];
    for(let j=0;j<slots.length;j++){
      if(j===victimSlot || j===m) continue;
      if(cohortOf(slots[j]) !== cohortOf(victim)) continue;
      const candidate = slots[j];
      if(!candidate) continue;
      const candStart = j - (j%2), candPartnerSlot = candStart===j ? j+1 : j-1;
      const candPartner = slots[candPartnerSlot];
      // The candidate must not clash (rank/org/group) with its new match's other side (slots[m]), and its old match's remaining side must not clash with the victim moving in.
      const infoM = infoByEntry[slots[m].entryId], infoCand = infoByEntry[candidate.entryId];
      const candClashesWithM = rankOfEntryId[candidate.entryId]===rankOfEntryId[slots[m].entryId] || (infoM.org && infoM.org===infoCand.org) || (infoM.groupId && infoM.groupId===infoCand.groupId);
      if(candClashesWithM) continue;
      if(candPartner){
        const infoPartner = infoByEntry[candPartner.entryId], infoVictim = infoByEntry[victim.entryId];
        const victimClashesWithPartner = rankOfEntryId[victim.entryId]===rankOfEntryId[candPartner.entryId] || (infoPartner.org && infoPartner.org===infoVictim.org) || (infoPartner.groupId && infoPartner.groupId===infoVictim.groupId);
        if(victimClashesWithPartner) continue;
      }
      slots[victimSlot] = candidate; slots[j] = victim;
      break;
    }
  }

  /* Round 6: the last possible stage for same-group entries. A group with k entries in this bracket can at best have
     its entries in k different sub-brackets of size/2^ceil(log2 k) slots, so its closest pair meets no earlier than
     round totalRounds-ceil(log2 k) (k=2: the final). The search above moves one entry at a time and can stop short of
     that (uneven groups, 3+ qualifiers). Only when some group is short, try swapping any two entries of the same
     bye/real cohort (byes stay with the same seeds), keeping a swap only if it brings the groups closer to the rule
     without making any clash pair (group or organisation) worse in the min-first order, and without adding a
     same-position round-1 meeting. Where the rule is already met nothing changes (tests/bracket-engine.test.js). */
  if(!(opts && opts.improve===false) && clashPairs.length) improveGroupSeparation();
  function improveGroupSeparation(){
    const size = slots.length;
    const pos = {};
    slots.forEach((s,i)=>{ if(s) pos[s.entryId] = i; });
    const groupOf = {}, members = {};
    orderedEntries.forEach(e=>{ if(e.groupId!=null){ groupOf[e.entryId] = e.groupId; (members[e.groupId] = members[e.groupId]||[]).push(e.entryId); } });
    const ideal = {};
    Object.keys(members).forEach(g=>{ const k = members[g].length; ideal[g] = k<2 ? 0 : totalRounds - Math.ceil(Math.log2(k)); });
    const pairsOf = {};
    clashPairs.forEach(([a,b],pi)=>{ (pairsOf[a] = pairsOf[a]||[]).push(pi); (pairsOf[b] = pairsOf[b]||[]).push(pi); });
    const pairIdeal = clashPairs.map(([a,b])=> (groupOf[a]!=null && groupOf[a]===groupOf[b]) ? ideal[groupOf[a]] : null);
    const meet = meetTable(size);
    const sep = clashPairs.map(([a,b])=> meet[pos[a]][pos[b]]);
    const shortOf = (pi, s)=> pairIdeal[pi]==null ? 0 : Math.max(0, pairIdeal[pi] - s);
    const cnt = new Array(totalRounds+1).fill(0);
    let short = 0;
    sep.forEach((s,pi)=>{ cnt[s]++; short += shortOf(pi, s); });
    // min-first order: fewer pairs at the lowest round where the two differ is better (1), worse (-1), same (0)
    const histCmp = (a, b)=>{ for(let r=0;r<a.length;r++) if(a[r]!==b[r]) return a[r]<b[r] ? 1 : -1; return 0; };
    const clashesIn = (m)=> matchHasRankClash(m) ? 1 : 0;
    const stamp = new Array(clashPairs.length).fill(-1);
    let stampNo = 0;
    for(let iter=0; iter<200 && short>0; iter++){
      let best = null;
      for(let i=0;i<size;i++){
        if(!slots[i]) continue;
        const ci = cohortOf(slots[i]);
        for(let j=i+1;j<size;j++){
          if(!slots[j] || cohortOf(slots[j])!==ci) continue;
          const A = slots[i], B = slots[j];
          stampNo++;
          const tp = [];
          [A, B].forEach(e=> (pairsOf[e.entryId]||[]).forEach(pi=>{ if(stamp[pi]!==stampNo){ stamp[pi] = stampNo; tp.push(pi); } }));
          if(!tp.length) continue;
          const mi = i-(i%2), mj = j-(j%2);
          const before = clashesIn(mi) + (mj!==mi ? clashesIn(mj) : 0);
          slots[i] = B; slots[j] = A;
          const after = clashesIn(mi) + (mj!==mi ? clashesIn(mj) : 0);
          slots[i] = A; slots[j] = B;
          if(after > before) continue;
          pos[A.entryId] = j; pos[B.entryId] = i;
          const newSeps = tp.map(pi=> meet[pos[clashPairs[pi][0]]][pos[clashPairs[pi][1]]]);
          pos[A.entryId] = i; pos[B.entryId] = j;
          const c2 = cnt.slice(); let s2 = short;
          tp.forEach((pi,k)=>{ c2[sep[pi]]--; c2[newSeps[k]]++; s2 += shortOf(pi, newSeps[k]) - shortOf(pi, sep[pi]); });
          const h = histCmp(c2, cnt);
          if(h < 0) continue;                                   // never worse for any clash pair, min first
          if(!(s2 < short || (s2===short && h > 0))) continue;
          const vsBest = best ? (s2!==best.short ? (s2 < best.short ? 1 : -1) : histCmp(c2, best.cnt)) : 1;
          if(vsBest > 0) best = { i, j, short:s2, cnt:c2, tp, newSeps };
        }
      }
      if(!best) break;
      const A = slots[best.i], B = slots[best.j];
      slots[best.i] = B; slots[best.j] = A; pos[A.entryId] = best.j; pos[B.entryId] = best.i;
      best.tp.forEach((pi,k)=>{ sep[pi] = best.newSeps[k]; });
      cnt.splice(0, cnt.length, ...best.cnt); short = best.short;
    }
  }

  return slots.map(s=> s ? s.entryId : null);
  };
};

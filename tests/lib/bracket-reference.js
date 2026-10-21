// The round-robin -> knockout slot placement exactly as app.html had it before the round 6 speed-up, with only the
// reviewed duplicate-entry fix (C1) applied. Used by tests/bracket-engine.test.js as the reference the fast search must
// match bit for bit. Generated from app.html; do not edit by hand.
// It needs seedSlotOrder, nearestBracket and earliestMeetingRound from the app (passed in).
module.exports = function makeReference(app){
  const seedSlotOrder = app.seedSlotOrder, nearestBracket = app.nearestBracket, earliestMeetingRound = app.earliestMeetingRound;
  return function referenceSlots(orderedEntries){
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
  Object.keys(bySeed).forEach(k=>{ seedOfEntryId[bySeed[k].entryId] = +k; });
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
    const slotOf = id => slots.findIndex(s=> s && s.entryId===id);
    const pairSeparation = ([a,b]) => earliestMeetingRound(slotOf(a), slotOf(b));
    const worstSeparation = () => clashPairs.reduce((w,p)=> Math.min(w, pairSeparation(p)), Infinity);
    /* Greedy local search: repeatedly take whichever clash pair is
       currently worst-separated and try every alternative slot for its
       second entry, keeping the swap only if it pushes THIS pair later
       without ever letting any pair anywhere become worse-separated than
       the current global worst (never trade one pair's fairness for
       another's — but do grab a free improvement for a pair even when
       it isn't the current worst). Repeat full passes until nothing
       improves or the bound is hit — best-effort, same as before, it
       just aims for the latest possible round instead of merely
       not-immediate. */
    let pass = 0;
    const maxPasses = clashPairs.length * 2 + 4;
    let improvedThisPass = true;
    while(improvedThisPass && pass < maxPasses){
      pass++;
      improvedThisPass = false;
      const order = clashPairs.slice().sort((p,q)=> pairSeparation(p)-pairSeparation(q));
      for(const pair of order){
        const oldSep = pairSeparation(pair);
        if(oldSep >= totalRounds-1) continue; // already final-only — can't do better
        const globalFloor = worstSeparation();
        const fromSlot = slotOf(pair[1]);
        let bestJ = -1, bestPairSep = oldSep;
        for(let j=0;j<slots.length;j++){
          if(j===fromSlot) continue;
          if(cohortOf(slots[j]) !== cohortOf(slots[fromSlot])) continue; // never trade a bye to/from a worse/better seed
          const tmp = slots[fromSlot]; slots[fromSlot]=slots[j]; slots[j]=tmp;
          const fromMatchStart = fromSlot - (fromSlot%2), jMatchStart = j - (j%2);
          const rankClash = matchHasRankClash(fromMatchStart) || matchHasRankClash(jMatchStart);
          const newPairSep = pairSeparation(pair);
          const newFloor = worstSeparation();
          slots[j]=slots[fromSlot]; slots[fromSlot]=tmp;
          if(!rankClash && newPairSep > bestPairSep && newFloor >= globalFloor){ bestPairSep = newPairSep; bestJ = j; }
        }
        if(bestJ>=0){
          const tmp = slots[fromSlot]; slots[fromSlot]=slots[bestJ]; slots[bestJ]=tmp;
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

  return slots.map(s=> s ? s.entryId : null);
  };
};

/* Deterministic random results. The simulation's own generator (never the app's Math.random), so a result depends only
   on the event's key and the order matches are played in. Results are typed through the app's real result boxes. */

function hashString(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function makePlayer(seedKey) {
  const rnd = mulberry32(hashString(seedKey));
  const ratings = {};
  /* A rating per entry id (roughly bell shaped), made on first use so ids that appear later still get one. */
  const rating = (id) => {
    if (ratings[id] == null) { const r = mulberry32(hashString(seedKey + '|' + id)); ratings[id] = (r() + r() + r() - 1.5) * 2.2; }
    return ratings[id];
  };
  /* True when side A wins a leg. */
  const legA = (ida, idb) => rnd() < 1 / (1 + Math.exp(-(rating(ida) - rating(idb))));
  /* Races to `need` legs. Returns [legsA, legsB]. */
  const race = (ida, idb, need) => { let a = 0, b = 0; while (a < need && b < need) { if (legA(ida, idb)) a++; else b++; } return [a, b]; };

  /* A singles or doubles match: best of N legs, the winner has exactly floor(N/2)+1. */
  const plain = (ida, idb, bestOf) => race(ida, idb, Math.floor(bestOf / 2) + 1);

  /* A Teams match of a stage ('rr' or 'ko'): each segment is raced in turn and the legs are added up. If the totals are level
     and the stage has a tie-breaker, it is played and its legs are added; a level knockout total without one gets one more
     deciding leg (the organiser's own way out); a level round robin total without a tie-breaker stays a draw. */
  const team = (ida, idb, segs, tieBreaker, stage) => {
    let a = 0, b = 0;
    segs.forEach((s) => { const r = race(ida, idb, Math.floor(s.legs / 2) + 1); a += r[0]; b += r[1]; });
    let usedTieBreaker = false;
    if (a === b) {
      if (tieBreaker) { const r = race(ida, idb, Math.floor(tieBreaker.legs / 2) + 1); a += r[0]; b += r[1]; usedTieBreaker = true; }
      else if (stage === 'ko') { if (legA(ida, idb)) a++; else b++; }
    }
    return { a, b, usedTieBreaker };
  };
  return { plain, team, rating };
}

module.exports = { makePlayer, hashString, mulberry32 };

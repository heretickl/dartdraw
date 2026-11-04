// What a live turn is allowed to look like, and the public one-line picture of a match built from its turns (spec section 8; the
// contract for live_turns.entered is in the header of api/_lib/live.js). Pure: no database, no clock.

const SEGMENT = /^(?:[SDT](?:[1-9]|1\d|20)|B|DB|M)$/;
const isInt = (v, lo, hi) => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;
const ENTERED_MAX_CHARS = 1000;

/* A clean copy of an `entered` object, or null when it is not a valid turn. Only the contract's keys survive.
   x01: score 0..60 per dart thrown (180 for three), bust = score 0, finish <= darts; cricket: score as points, marks 0..9. */
function cleanEntered(e) {
  if (!e || typeof e !== 'object' || Array.isArray(e)) return null;
  if (e.mode !== 'total' && e.mode !== 'darts') return null;
  if (e.game !== 'x01' && e.game !== 'cricket') return null;
  if (!isInt(e.darts, 1, 3)) return null;
  if (!isInt(e.score, 0, 60 * e.darts)) return null;
  const bust = e.bust === undefined ? false : e.bust;
  if (typeof bust !== 'boolean') return null;
  if (bust && (e.score !== 0 || e.game !== 'x01')) return null;
  const out = { mode: e.mode, game: e.game, score: e.score, darts: e.darts, bust };
  if (e.finish !== undefined) {
    if (!isInt(e.finish, 1, 3) || e.finish > e.darts || bust) return null;
    out.finish = e.finish;
  }
  if (e.segments !== undefined) {
    if (e.mode !== 'darts' || !Array.isArray(e.segments) || e.segments.length < 1 || e.segments.length > 3) return null;
    if (!e.segments.every((s) => typeof s === 'string' && SEGMENT.test(s))) return null;
    out.segments = e.segments.slice();
  }
  if (e.marks !== undefined) {
    if (e.game !== 'cricket' || !isInt(e.marks, 0, 9)) return null;
    out.marks = e.marks;
  }
  if (JSON.stringify(out).length > ENTERED_MAX_CHARS) return null;
  return out;
}

/* The turns that count: a turn another counting turn names in `supersedes` is replaced by it (a chain of corrections keeps the
   last one). Order is kept. */
function effectiveTurns(turns) {
  const replaced = {};
  turns.forEach((t) => { if (t.supersedes) replaced[t.supersedes] = true; });
  return turns.filter((t) => !replaced[t.id]);
}

/* { legs:[a,b], remaining:[a,b]|null, thrower:'a'|'b'|null } for the match.
   turns: the non-ignored turns, oldest first ({ id, leg, side, entered, supersedes }).
   startFor(leg): the x01 start score of that leg (501...), or null for Cricket / unknown.
   latest: { side, supersedes } of the turn just stored (the thrower is the other side), next: the device's own 'a'|'b' when sent,
   prevThrower: the summary's thrower before this turn (kept when the turn only corrected an older one). */
function summarize(turns, startFor, latest, next, prevThrower) {
  const eff = effectiveTurns(turns);
  const legs = [0, 0];
  let cur = 1;
  eff.forEach((t) => { if (t.leg > cur) cur = t.leg; });
  eff.forEach((t) => { if (t.entered && t.entered.finish) legs[t.side === 'b' ? 1 : 0] += 1; });
  // a leg that has a finishing turn is over: the picture is then the next leg's start
  if (eff.some((t) => t.leg === cur && t.entered && t.entered.finish)) cur += 1;
  const start = startFor(cur);
  let remaining = null;
  if (typeof start === 'number') {
    const left = [start, start];
    eff.forEach((t) => {
      if (t.leg !== cur || !t.entered || t.entered.game === 'cricket' || t.entered.bust) return;
      const i = t.side === 'b' ? 1 : 0;
      left[i] = Math.max(0, left[i] - (Number(t.entered.score) || 0));
    });
    remaining = left;
  }
  let thrower = null;
  if (next === 'a' || next === 'b') thrower = next;
  else if (latest && latest.supersedes && (prevThrower === 'a' || prevThrower === 'b')) thrower = prevThrower;
  else if (latest) thrower = latest.side === 'a' ? 'b' : 'a';
  return { legs, remaining, thrower };
}

/* What a match gives to a 3-dart average: { a:{s,d}, b:{s,d} } = the x01 points each side scored (s) and the darts it threw (d),
   or null when the match has no x01 turn. turns: the non-ignored turns, oldest first; a turn another counting turn corrects is
   replaced by the correction (effectiveTurns). A turn counts only in an x01 leg: the turn says x01 AND the leg's game (startFor,
   which follows the pattern of a mixed game) is an x01 too, so a Cricket leg never takes part. A turn's points are entered.score
   (0 for a bust) and its darts entered.darts (3 on a bust). startFor may be missing: then the turn's own game decides. */
function x01Totals(turns, startFor) {
  const tot = { a: { s: 0, d: 0 }, b: { s: 0, d: 0 } };
  let any = false;
  effectiveTurns(turns).forEach((t) => {
    const e = t.entered;
    if (!e || e.game !== 'x01') return;
    if (typeof startFor === 'function' && typeof startFor(t.leg) !== 'number') return;
    const side = t.side === 'b' ? tot.b : tot.a;
    side.s += e.bust ? 0 : (Number(e.score) || 0);
    side.d += Number(e.darts) || 0;
    any = true;
  });
  return any ? tot : null;
}

/* The chains of corrections among a match's turns (ALL of them, oldest first: { id, leg, side, entered, supersedes, ignored }).
   Only turns that are not ignored take part: an ignored turn is kept but never counts, so it is no link in a chain. A turn whose
   `supersedes` names no counting turn starts its own chain. Returns the pieces annotateTurns and chainHeadOf need:
   idx: id -> place among the counting turns; replaced: id -> true for a turn another counting turn names;
   root: id -> place of the first turn of its chain (a cycle, which no device produces, stops at the turn that closes it). */
function chainsOf(turns) {
  const counted = turns.filter((t) => !t.ignored);
  const idx = {}, replaced = {}, root = {};
  counted.forEach((t, i) => { idx[t.id] = i; });
  counted.forEach((t) => { if (t.supersedes && idx[t.supersedes] !== undefined) replaced[t.supersedes] = true; });
  counted.forEach((t) => {
    let cur = t, steps = 0;
    while (cur.supersedes && idx[cur.supersedes] !== undefined && steps++ < counted.length) cur = counted[idx[cur.supersedes]];
    root[t.id] = idx[cur.id];
  });
  return { counted, idx, replaced, root };
}

/* The latest counting turn of the chain the turn `id` belongs to (the one that counts now), or null when `id` is not a counting
   turn of the list. */
function chainHeadOf(turns, id) {
  const c = chainsOf(turns);
  if (c.idx[id] === undefined) return null;
  let head = null;
  c.counted.forEach((t) => { if (c.root[t.id] === c.root[id] && !c.replaced[t.id]) head = t; });
  return head || c.counted[c.idx[id]];
}

/* For the match history: every turn of the match (oldest first, ignored ones included) with `current` (the latest version of its
   chain: the turn that counts now) and `left` (the x01 score the thrower's side has left after that turn, in that turn's leg,
   worked out with the rules of `summarize`: a bust takes nothing off, Cricket has none; null for an ignored turn, for Cricket or
   when the leg's start score is unknown). A correction takes its chain's place in the leg, not the place of the time it was keyed:
   the turns after it show the score they now really leave. An OLDER version shows what the side would have had left with that
   version in the chain's place. Pure; returns new objects. */
function annotateTurns(turns, startFor) {
  const c = chainsOf(turns);
  const x01 = (t) => !!t.entered && t.entered.game !== 'cricket';
  const takes = (t) => (!t.entered || t.entered.bust ? 0 : Number(t.entered.score) || 0);
  const counting = c.counted.filter((t) => !c.replaced[t.id]);
  const leftOf = (t) => {
    if (t.ignored || !x01(t)) return null;
    const start = startFor(t.leg);
    if (typeof start !== 'number') return null;
    const side = t.side === 'b' ? 'b' : 'a', mine = c.root[t.id];
    let left = start;
    counting
      .filter((u) => u.leg === t.leg && (u.side === 'b' ? 'b' : 'a') === side && x01(u) && c.root[u.id] < mine)
      .sort((p, q) => (c.root[p.id] - c.root[q.id]) || (c.idx[p.id] - c.idx[q.id]))
      .forEach((u) => { left = Math.max(0, left - takes(u)); });
    return Math.max(0, left - takes(t));
  };
  return turns.map((t) => Object.assign({}, t, { current: !t.ignored && !c.replaced[t.id], left: leftOf(t) }));
}

module.exports = { cleanEntered, effectiveTurns, x01Totals, summarize, chainsOf, chainHeadOf, annotateTurns, ENTERED_MAX_CHARS };

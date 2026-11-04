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

module.exports = { cleanEntered, effectiveTurns, summarize, ENTERED_MAX_CHARS };

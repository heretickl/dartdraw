/* A player's darts stats for their scorecard: one replayed match turned into one player's numbers (gameStats), and many
   games added up (addUp). No DOM, no network: the scoring app's server runs it when a game is saved, and the browser can
   run it to show a game's line. Every number follows the match engine's own rules (match-engine.js stats()): a bust counts
   its darts and scores 0, a checkout counts up to its finishing dart, first 9 is the player's first three turns of each
   leg. Averages are left unrounded here; the screen rounds them. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./match-engine.js'));
  else root.DDPlayerStats = factory(root.DDMatch);
})(typeof self !== 'undefined' ? self : this, function (DDMatch) {
  var WHITE_HORSE_NUMBERS = [15, 16, 17, 18, 19, 20];

  function emptyX01() {
    return { darts: 0, points: 0, f9darts: 0, f9points: 0, checkoutTurns: 0, checkouts: 0, n180: 0, n140: 0, n100: 0,
      highFinish: null, bestLegDarts: null, legsPlayed: 0, legsWon: 0 };
  }
  function emptyCricket() {
    return { darts: 0, marks: 0, f9darts: 0, f9marks: 0, rounds5: 0, rounds9: 0, hatTricks: 0, whiteHorses: 0, bulls: 0,
      bestLegDarts: null, legsPlayed: 0, legsWon: 0 };
  }
  function lower(a, b) { return a === null ? b : b === null ? a : Math.min(a, b); }
  function higher(a, b) { return a === null ? b : b === null ? a : Math.max(a, b); }

  /* The darts actually thrown in a cricket turn: those after the winning dart never landed in the game. */
  function thrownDarts(t) { return Array.isArray(t.darts) ? t.darts.slice(0, t.dartsUsed) : []; }

  /* One x01 leg for the player: `turns` are only their own turns, in order. */
  function addX01Leg(o, leg, turns, side) {
    var legDarts = 0;
    turns.forEach(function (t, i) {
      legDarts += t.dartsUsed;
      o.darts += t.dartsUsed; o.points += t.scored;
      if (i < 3) { o.f9darts += t.dartsUsed; o.f9points += t.scored; }
      // What was left when the turn began: a bust leaves the score where it was, so leftAfter + scored covers every turn.
      var leftBefore = (t.leftAfter || 0) + t.scored;
      if (DDMatch.minDarts(leftBefore) > 0) o.checkoutTurns++;
      if (t.scored === 180) o.n180++;
      else if (t.scored >= 140) o.n140++;
      else if (t.scored >= 100) o.n100++;
      if (t.checkout && t.finishDart && leg.winner === side) { o.checkouts++; o.highFinish = higher(o.highFinish, t.scored); }
    });
    o.legsPlayed++;
    if (leg.winner === side) { o.legsWon++; o.bestLegDarts = lower(o.bestLegDarts, legDarts); }
  }

  /* One cricket leg. The board is replayed turn by turn with the engine's own cricketTurn, so a white horse can see which
     numbers this side had already closed when the round began (in doubles the side's marks are what close a number). */
  function addCricketLeg(o, leg, player, side) {
    var board = DDMatch.cricketStart(), legDarts = 0, n = 0;
    leg.turns.forEach(function (t) {
      var before = board;
      var r = DDMatch.cricketTurn(board, t.side, t.darts);
      if (r.ok) board = r.board;
      if (t.player !== player) return;
      var darts = thrownDarts(t), marks = t.marks || 0;
      legDarts += t.dartsUsed;
      o.darts += t.dartsUsed; o.marks += marks;
      if (n++ < 3) { o.f9darts += t.dartsUsed; o.f9marks += marks; }
      if (marks >= 5) o.rounds5++;
      if (marks === 9) o.rounds9++;
      o.bulls += darts.filter(function (d) { return d && d.n === 25; }).length;
      if (darts.length === 3 && darts.every(function (d) { return d && d.n === 25; })) o.hatTricks++;
      var nums = darts.map(function (d) { return d && d.m === 3 ? d.n : null; });
      if (darts.length === 3 && nums.every(function (x) { return WHITE_HORSE_NUMBERS.indexOf(x) >= 0 && before.marks[t.side][x] < 3; }) &&
          nums[0] !== nums[1] && nums[0] !== nums[2] && nums[1] !== nums[2]) o.whiteHorses++;
    });
    o.legsPlayed++;
    if (leg.winner === side) { o.legsWon++; o.bestLegDarts = lower(o.bestLegDarts, legDarts); }
  }

  /* One game's stats for one player. players is the engine's { a: [...], b: [...] } and playerKey one of those names.
     A Choice or mixed match feeds x01 from its 01 legs and cricket from its Cricket legs; the match is won once. A leg the
     player never threw in is not counted for them. */
  function gameStats(format, players, events, playerKey) {
    var st = DDMatch.replay(format, players, events);
    var side = (st.players.a || []).indexOf(playerKey) >= 0 ? 'a' : (st.players.b || []).indexOf(playerKey) >= 0 ? 'b' : null;
    var out = { won: !!side && st.winner === side, x01: null, cricket: null };
    if (!side) return out;
    st.legs.forEach(function (leg) {
      var mine = leg.turns.filter(function (t) { return t.player === playerKey; });
      if (!mine.length) return;
      if (leg.game === 'cricket') addCricketLeg(out.cricket = out.cricket || emptyCricket(), leg, playerKey, side);
      else addX01Leg(out.x01 = out.x01 || emptyX01(), leg, mine, side);
    });
    return out;
  }

  function per(a, b, k) { return b ? a / b * k : null; }

  /* Many games added up for a scorecard. Counts are summed, the high finish is the highest, the best leg the fewest
     darts; averages are worked out from the sums (never averaged averages) and are null, not NaN, when there are no darts. */
  function addUp(list) {
    var x = emptyX01(), c = emptyCricket(), played = 0, won = 0;
    (Array.isArray(list) ? list : []).forEach(function (g) {
      if (!g || typeof g !== 'object') return;
      played++;
      if (g.won) won++;
      if (g.x01) Object.keys(x).forEach(function (k) {
        if (k === 'highFinish') x[k] = higher(x[k], g.x01[k] == null ? null : g.x01[k]);
        else if (k === 'bestLegDarts') x[k] = lower(x[k], g.x01[k] == null ? null : g.x01[k]);
        else x[k] += Number(g.x01[k]) || 0;
      });
      if (g.cricket) Object.keys(c).forEach(function (k) {
        if (k === 'bestLegDarts') c[k] = lower(c[k], g.cricket[k] == null ? null : g.cricket[k]);
        else c[k] += Number(g.cricket[k]) || 0;
      });
    });
    x.avg3 = per(x.points, x.darts, 3);
    x.first9 = per(x.f9points, x.f9darts, 3);
    x.checkoutPct = per(x.checkouts, x.checkoutTurns, 100);
    c.mpr = per(c.marks, c.darts, 3);
    c.f9mpr = per(c.f9marks, c.f9darts, 3);
    return { played: played, won: won, wonPct: per(won, played, 100), x01: x, cricket: c };
  }

  return { gameStats: gameStats, addUp: addUp };
});

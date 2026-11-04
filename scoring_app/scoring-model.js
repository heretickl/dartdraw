/* A match being scored, in memory (spec docs/superpowers/specs/2026-11-03-casual-play-design.md; the scoring rules are
   match-engine.js's, unchanged). Shared by casual play and, later, the tournament scoring page: no DOM, no network, no
   storage. Taps come in as actions; each one either adds engine events or is refused with { ok:false, code }, so a
   wrong tap never changes the match. view() is everything the scoring screens show.

   Two things wait on the screen and are never events: a checkout keyed as a total waits for its finishing dart
   (pending), and a total that would bust waits for "Bust?" (askBust). Undo clears either before it takes back a turn. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./match-engine.js'));
  else root.DDScoring = factory(root.DDMatch);
})(typeof self !== 'undefined' ? self : this, function (M) {
  var CRICKET = [20, 19, 18, 17, 16, 15, 25];
  var BLOCKING = ['not_checkout', 'now_bust', 'after_win', 'not_reached'];
  var OK = { ok: true };
  function no(code) { return { ok: false, code: code }; }
  function other(s) { return s === 'a' ? 'b' : 'a'; }

  /* The picks on the setup screen as an engine format (spec 4.4). The opening bull has no coin flip: side 'a' is named as
     the first thrower, and the screen does not show who throws first. */
  function formatFor(picks) {
    var bestOf = Number(picks && picks.bestOf) || 5, game = picks && picks.game;
    if (game === 'cricket') return { game: 'cricket', bestOf: bestOf, bullFirst: 'first', decider: 'alternate' };
    if (game === 'choice') return { game: 'mixed', start: 501, inRule: 'SI', pattern: ['x01', 'cricket'], bestOf: bestOf, bullFirst: 'first', decider: 'choice' };
    return { game: 'x01', start: 501, inRule: 'SI', bestOf: bestOf, bullFirst: 'first', decider: 'alternate' };
  }

  /* A dart is { n: 1-20 or 25, m: 1-3 } (no treble bull), or { n:0, m:0 } for a miss: match-engine.js's rule. */
  function goodDart(d) {
    if (!d || typeof d !== 'object') return false;
    if (d.n === 0 && d.m === 0) return true;
    if (d.n === 25) return d.m === 1 || d.m === 2;
    return Math.floor(d.n) === d.n && d.n >= 1 && d.n <= 20 && (d.m === 1 || d.m === 2 || d.m === 3);
  }
  function goodDarts(list) { return Array.isArray(list) && list.length >= 1 && list.length <= 3 && list.every(goodDart); }
  function goodScore(s) { return M.totalCheck(1000, s, true, 'SI') !== 'invalid'; }

  /* The x01 score a side has left in a leg: the last turn's leftAfter, or the start. */
  function leftOf(leg, side) {
    if (!leg || leg.game !== 'x01') return null;
    var l = leg.start;
    leg.turns.forEach(function (t) { if (t.side === side && t.leftAfter !== null) l = t.leftAfter; });
    return l;
  }

  /* A cricket leg's board, folded from its turns. */
  function boardOf(leg) {
    var b = M.cricketStart();
    leg.turns.forEach(function (t) { var r = M.cricketTurn(b, t.side, t.darts); if (r.ok) b = r.board; });
    return b;
  }

  /* A leg's turns as rows by turn number: row n holds each side's nth turn (null until thrown). */
  function rowsOf(leg) {
    var rows = [], count = { a: 0, b: 0 };
    if (!leg) return rows;
    leg.turns.forEach(function (t) {
      var i = count[t.side]++;
      if (!rows[i]) rows[i] = { turn: i + 1, a: null, b: null };
      rows[i][t.side] = { turnId: t.id, scored: t.scored, left: t.leftAfter, bust: t.bust, darts: t.darts || null, marks: t.marks, finishDart: t.finishDart };
    });
    return rows;
  }

  function create(opts) {
    var format = opts.format, names = { a: opts.names.a, b: opts.names.b };
    var players = { a: [names.a], b: [names.b] };
    var now = opts.now || function () { return Date.now(); };
    var hints = !!opts.hints;
    var events = (opts.events || []).map(function (e) { var c = {}; for (var k in e) c[k] = e[k]; return c; });
    var seq = events.reduce(function (s, e) { return Math.max(s, Number(e.seq) || 0); }, 0);
    var pending = null, askBust = false, st = null;

    function state() { if (!st) st = M.replay(format, players, events); return st; }
    function add(e) { e.seq = ++seq; e.at = now(); events.push(e); st = null; pending = null; askBust = false; return OK; }
    function ask() { return state().next ? state().next.ask : null; }
    function curLeg() { var n = state().next; return n ? state().legs[n.leg] || null : null; }
    function turnAsk() { return ask() === 'turn' && !pending && !askBust; }
    function addTurn(fields) {
      var n = state().next, e = { type: 'turn', id: 't' + (seq + 1), leg: n.leg, side: n.side, player: n.player };
      for (var k in fields) e[k] = fields[k];
      return add(e);
    }

    function bull(side) {
      if (ask() !== 'bull') return no('nothing');
      if (side !== 'a' && side !== 'b') return no('invalid');
      return add({ type: 'bull', leg: state().next.leg, winner: side });
    }
    function choice(pick, game) {
      if (ask() !== 'choice') return no('nothing');
      if ((pick !== 'start' && pick !== 'game') || (game !== 'x01' && game !== 'cricket')) return no('invalid');
      return add({ type: 'choice', leg: state().next.leg, pick: pick, game: game });
    }
    function total(score) {
      if (!turnAsk() || curLeg().game !== 'x01') return no('nothing');
      var n = state().next, chk = M.totalCheck(n.left[n.side], score, n.opened[n.side], curLeg().inRule);
      if (chk === 'invalid') return no('invalid');
      if (chk === 'bust') { askBust = true; return no('ask_bust'); }
      if (chk === 'checkout') { pending = { score: score, choices: M.finishDartChoices(score) }; return OK; }
      return addTurn({ mode: 'total', score: score });
    }
    function confirmBust() { if (!askBust) return no('nothing'); return addTurn({ mode: 'total', score: 0, bust: true }); }
    function bust() {
      if (ask() !== 'turn' || pending || curLeg().game !== 'x01') return no('nothing');
      return addTurn({ mode: 'total', score: 0, bust: true });
    }
    function finishDart(k) {
      if (!pending) return no('nothing');
      if (pending.choices.indexOf(k) < 0) return no('invalid');
      return addTurn({ mode: 'total', score: pending.score, finishDart: k });
    }
    function cancelPending() { if (!pending && !askBust) return no('nothing'); pending = null; askBust = false; return OK; }
    function darts(list) {
      if (!turnAsk()) return no('nothing');
      if (!goodDarts(list)) return no('invalid');
      return addTurn({ mode: 'darts', darts: list.map(function (d) { return { n: d.n, m: d.m }; }) });
    }
    function lastTurnId() {
      var legs = state().legs;
      for (var i = legs.length - 1; i >= 0; i--) if (legs[i].turns.length) return legs[i].turns[legs[i].turns.length - 1].id;
      return null;
    }
    /* Undo takes back, in order: a waiting question, then a bull or Choice pick tapped before any turn of its leg (a
       mis-tapped bull is thrown again), then the last turn standing, across legs (a winning turn keyed by mistake is
       taken back even when the next leg's bull is already showing). A bull or choice is dropped from the events: casual
       play keeps no history, and the engine reads the latest one. */
    function undo() {
      if (pending || askBust) return cancelPending();
      var n = state().next, leg = curLeg();
      if (n && !(leg && leg.turns.length)) {
        for (var i = events.length - 1; i >= 0; i--) {
          var e = events[i];
          if (e.type !== 'bull' && e.type !== 'choice') continue;
          if (e.leg === n.leg) { events.splice(i, 1); st = null; return OK; }
          break;
        }
      }
      var id = lastTurnId();
      if (!id) return no('nothing');
      return add({ type: 'undo', turnId: id });
    }

    /* Change an earlier turn. Kept only if every leg before the one being played keeps its winner, and no turn becomes
       impossible (a new bust, a checkout that no longer adds up, turns after a new win, or a checkout with no finishing
       dart); otherwise refused and nothing changes (spec 4.3). */
    function editTurn(turnId, change) {
      var known = events.some(function (e) { return e.type === 'turn' && e.id === turnId; });
      if (!known) return no('no_turn');
      change = change || {};
      var e = { type: 'edit', turnId: turnId };
      if (change.darts !== undefined) { if (!goodDarts(change.darts)) return no('invalid'); e.darts = change.darts; }
      else if (change.bust === true) { e.score = 0; e.bust = true; }
      else if (change.score !== undefined) { if (!goodScore(change.score)) return no('invalid'); e.score = change.score; e.bust = false; }
      else return no('invalid');
      if (change.finishDart !== undefined) e.finishDart = change.finishDart;
      e.seq = seq + 1; e.at = now();
      var before = state(), after = M.replay(format, players, events.concat([e]));
      var upTo = before.next ? before.next.leg : before.legs.length;
      for (var i = 0; i < upTo && i < before.legs.length; i++) {
        if (!after.legs[i] || after.legs[i].winner !== before.legs[i].winner) return no('changes_winner');
      }
      var had = {};
      before.flags.forEach(function (f) { had[f.turnId + ':' + f.code] = true; });
      var broke = after.flags.some(function (f) { return BLOCKING.indexOf(f.code) >= 0 && !had[f.turnId + ':' + f.code]; });
      if (broke || (after.next && after.next.ask === 'finishDart')) return no('breaks_later');
      seq++; events.push(e); st = after; pending = null; askBust = false;
      return OK;
    }

    function legTurns(i) { return rowsOf(state().legs[i]); }

    function view() {
      var s = state(), n = s.next || {}, leg = s.legs[n.leg] || null, a = n.ask || null;
      var stats = M.stats(s).bySide;
      var sides = {};
      ['a', 'b'].forEach(function (k) {
        sides[k] = { name: names[k], left: leftOf(leg, k), avg3: stats[k].avg3, first9: stats[k].first9, mpr: stats[k].mpr };
      });
      var throwing = a === 'turn' ? n.side : null;
      var cricket = null;
      if (leg && leg.game === 'cricket') {
        var b = boardOf(leg);
        cricket = {
          numbers: CRICKET.map(function (x) { return { n: x, a: b.marks.a[x], b: b.marks.b[x], closedBoth: b.marks.a[x] >= 3 && b.marks.b[x] >= 3 }; }),
          points: { a: b.points.a, b: b.points.b }
        };
      }
      var last3 = rowsOf(leg).slice(-3).reverse().map(function (r) {
        return { n: r.turn, a: r.a ? r.a.scored : null, b: r.b ? r.b.scored : null };
      });
      var legs = [];
      s.legs.forEach(function (l, i) {
        if (!l.winner) return;
        var fin = null, dartsUsed = 0;
        l.turns.forEach(function (t) { if (t.side === l.winner) { dartsUsed += t.dartsUsed; if (t.checkout) fin = t; } });
        var fd = fin && fin.darts && fin.finishDart ? fin.darts[fin.finishDart - 1] : null;
        legs.push({ n: i + 1, winner: l.winner, game: l.game, finishDart: l.finishDart, finishScore: l.game === 'x01' && fin ? fin.scored : null,
          finishNumber: l.game === 'cricket' && fd ? fd.n : null, darts: dartsUsed, choice: l.choice });
      });
      return {
        ask: a, leg: n.leg !== undefined ? n.leg : null, game: leg ? leg.game : null, bestOf: M.normalizeFormat(format).bestOf,
        toWin: M.legsToWin(M.normalizeFormat(format)), legsWon: { a: s.legsWon.a, b: s.legsWon.b }, throwing: throwing, sides: sides,
        last3: last3, cricket: cricket,
        hint: hints && throwing && leg && leg.game === 'x01' ? M.checkoutHint(sides[throwing].left) : null,
        pending: pending ? { score: pending.score, choices: pending.choices.slice() } : null, askBust: askBust,
        bull: a === 'bull' ? { leg: n.leg, side: n.side } : null,
        choice: a === 'choice' ? { leg: n.leg, by: n.choiceBy, firstThrower: s.openingBullLoser } : null,
        winner: s.winner, legs: legs
      };
    }

    return {
      events: function () { return events.map(function (e) { var c = {}; for (var k in e) c[k] = e[k]; return c; }); },
      state: state, view: view, legTurns: legTurns, names: function () { return { a: names.a, b: names.b }; },
      format: function () { return format; }, setHints: function (on) { hints = !!on; },
      // the checkout route for what is left with the darts still in hand, for dart by dart (null when hints are off or
      // it cannot be done in those darts)
      hintFor: function (left, dartsLeft) {
        var r = hints ? M.checkoutHint(left) : null;
        return r && r.length <= dartsLeft ? r : null;
      },
      bull: bull, choice: choice, total: total, bust: bust, confirmBust: confirmBust, darts: darts,
      finishDart: finishDart, cancelPending: cancelPending, undo: undo, editTurn: editTurn
    };
  }

  return { create: create, formatFor: formatFor, other: other, CRICKET: CRICKET };
});

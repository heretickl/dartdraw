/* The darts rules of live scoring (spec docs/superpowers/specs/2026-11-02-tournament-scoring-design.md). One file, three users:
   the scoring page on the board's tablet or phone, the organiser app (a match's history, disputes) and the server (it
   recalculates a match before it accepts the result). No DOM, no network, no clock: every time comes in on an event.

   State is always replay(format, players, events); nothing is stored but events. An event is never changed or removed: a
   correction is a new event, so every version of every turn can be shown and restored (spec 8.1), and changing an older
   turn simply recalculates everything after it (spec 11). Bad input never throws: it is refused with { ok:false, code },
   or the turn is flagged for the organiser, so a device never crashes in the middle of a match. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DDMatch = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var X01_STARTS = [301, 501, 701, 1001];

  /* ---------- the format and the leg plan ---------- */

  /* A stage's settings as one clean format: unknown values fall back to the defaults (301 is Double-In, the rest Single-In;
     a mixed match plays the x01 and Cricket in turn). bestOf is odd, 1 to 99, as the organiser app's legs fields are. */
  function normalizeFormat(raw) {
    raw = raw || {};
    var game = raw.game === 'cricket' || raw.game === 'mixed' ? raw.game : 'x01';
    var start = X01_STARTS.indexOf(Number(raw.start)) >= 0 ? Number(raw.start) : 501;
    var inRule = raw.inRule === 'DI' || raw.inRule === 'SI' ? raw.inRule : (start === 301 ? 'DI' : 'SI');
    var bestOf = Math.floor(Number(raw.bestOf));
    if (!(bestOf >= 1)) bestOf = 5;
    bestOf = Math.min(99, bestOf % 2 ? bestOf : bestOf + 1);
    var pattern = Array.isArray(raw.pattern) ? raw.pattern.filter(function (g) { return g === 'x01' || g === 'cricket'; }) : [];
    if (!pattern.length) pattern = ['x01', 'cricket'];
    return {
      game: game, start: start, inRule: inRule, pattern: pattern, bestOf: bestOf,
      bullFirst: raw.bullFirst === 'first' ? 'first' : 'coin',
      decider: raw.decider === 'bull' || raw.decider === 'choice' ? raw.decider : 'alternate',
      orderAsk: raw.orderAsk === 'leg' ? 'leg' : 'match'
    };
  }

  /* First to a majority of the best-of, as results-engine.js counts legs. */
  function legsToWin(format) { return Math.floor(format.bestOf / 2) + 1; }

  /* The deciding leg: the one played when both sides are one leg from winning. */
  function isDecider(format, legsWon) {
    var half = Math.floor(format.bestOf / 2);
    return legsWon.a === half && legsWon.b === half;
  }

  /* The game of leg legIndex (0-based). A deciding leg set to Choice plays what was picked (null until then); a mixed
     match otherwise follows its pattern, repeated. */
  function legGame(format, legIndex, legsWon, choiceGame) {
    if (format.decider === 'choice' && isDecider(format, legsWon)) return choiceGame || null;
    if (format.game === 'mixed') return format.pattern[legIndex % format.pattern.length];
    return format.game;
  }

  /* The two games a Choice leg offers: the match's x01 (501 Single-In for a Cricket stage), or Cricket. */
  function choiceGames(format) {
    var x01 = format.game === 'cricket' ? { game: 'x01', start: 501, inRule: 'SI' } : { game: 'x01', start: format.start, inRule: format.inRule };
    return [x01, { game: 'cricket' }];
  }

  /* ---------- x01: checkouts ---------- */

  /* Every dart a board offers, by name: S1-S20, D1-D20, T1-T20, 25 and the bull (50, a double). */
  var DARTS = [];
  for (var n = 1; n <= 20; n++) {
    DARTS.push({ name: 'S' + n, v: n, dbl: false }, { name: 'D' + n, v: 2 * n, dbl: true }, { name: 'T' + n, v: 3 * n, dbl: false });
  }
  DARTS.push({ name: '25', v: 25, dbl: false }, { name: 'BULL', v: 50, dbl: true });
  var FINISHERS = DARTS.filter(function (d) { return d.dbl; });
  /* Totals no three darts can make. */
  var IMPOSSIBLE_TOTALS = [163, 166, 169, 172, 173, 175, 176, 178, 179];

  /* How much a route is liked (lower is better): the usual setup darts are the high trebles, a single when the double is
     close; the usual doubles are D20, D16 and D8. Only used to pick the one route the checkout hint shows. */
  var DBL_PREF = ['D20', 'D16', 'D8', 'D10', 'D12', 'D18', 'D4', 'D14', 'D6', 'D2', 'D19', 'D17', 'D15', 'D13', 'D11', 'D9', 'D7', 'D5', 'D3', 'D1', 'BULL'];
  function setupCost(d) {
    if (d.name === 'BULL') return 12;
    if (d.name === '25') return 14;
    var k = d.name.charAt(0), num = Number(d.name.slice(1));
    return k === 'T' ? 20 - num : k === 'S' ? 0.5 + 0.3 * (20 - num) : 15 + (20 - num);
  }
  function finishCost(d) { return 2 * DBL_PREF.indexOf(d.name); }

  /* The best route for each finish 2..170, worked out once: the fewest darts, then the most usual one. */
  var ROUTES = (function () {
    var best = {};
    function offer(route, cost) {
      var total = route.reduce(function (s, d) { return s + d.v; }, 0);
      var cur = best[total];
      if (!cur || route.length < cur.route.length || (route.length === cur.route.length && cost < cur.cost)) best[total] = { route: route, cost: cost };
    }
    FINISHERS.forEach(function (f) {
      var fc = finishCost(f);
      offer([f], fc);
      DARTS.forEach(function (a) {
        offer([a, f], setupCost(a) + fc);
        DARTS.forEach(function (b) {
          if (setupCost(b) < setupCost(a)) return;   // each pair once, the more usual dart first (T20 T19 D12, not T19 T20 D12)
          offer([a, b, f], setupCost(a) + setupCost(b) + fc);
        });
      });
    });
    return best;
  })();

  /* The fewest darts that can finish `left` on a double or the bull; 0 when three darts cannot: above 170, 1, and the
     scores left that no three darts check out (169, 168, 166, 165, 163, 162, 159). Those are not IMPOSSIBLE_TOTALS,
     which are turn totals no three darts can score. */
  function minDarts(left) {
    var r = ROUTES[left];
    return r ? r.route.length : 0;
  }

  /* One standard route for `left`, e.g. ['T20','T20','BULL'] for 170, or null when there is none. */
  function checkoutHint(left) {
    var r = ROUTES[left];
    return r ? r.route.map(function (d) { return d.name; }) : null;
  }

  /* The finishing-dart buttons worth showing after a checkout keyed as a total: a 141 can only be finished with the third
     dart, so 1st and 2nd are hidden. */
  function finishDartChoices(left) {
    var k = minDarts(left), out = [];
    if (!k) return out;
    for (var i = k; i <= 3; i++) out.push(i);
    return out;
  }

  /* A turn keyed as a total, checked against what is left. 'invalid' (below 0, above 180, or a total no three darts make)
     is refused; 'bust' scores nothing; 'checkout' ends the leg. Double-Out always. With Double-In and the player not yet
     in, the marker keys only the part of the turn that counted, so any total is fine and one above 0 opens the player. */
  function totalCheck(left, score, opened, inRule) {
    if (typeof score !== 'number' || !isFinite(score) || score < 0 || score > 180 || Math.floor(score) !== score || IMPOSSIBLE_TOTALS.indexOf(score) >= 0) return 'invalid';
    if (score > left || left - score === 1) return 'bust';
    if (score === left) return minDarts(left) > 0 ? 'checkout' : 'bust';
    return 'ok';
  }

  /* ---------- darts ---------- */

  /* A dart is { n: 1-20 or 25, m: 1 single, 2 double, 3 treble }, or { n: 0, m: 0 } for a miss. There is no treble bull. */
  function validDart(dt) {
    if (!dt || typeof dt !== 'object') return false;
    if (dt.n === 0 && dt.m === 0) return true;
    if (dt.n === 25) return dt.m === 1 || dt.m === 2;
    return Math.floor(dt.n) === dt.n && dt.n >= 1 && dt.n <= 20 && (dt.m === 1 || dt.m === 2 || dt.m === 3);
  }
  function dartValue(dt) { return validDart(dt) ? dt.n * dt.m : 0; }

  /* A turn keyed dart by dart. The darts count in order: with Double-In and the player not yet in, nothing scores until a
     double (the bull counts), which scores and opens the player. Going below 0, leaving 1, or reaching 0 without a double
     is a bust: the turn scores 0 and `used` is the darts up to the one that bust. Reaching 0 on a double is a checkout on
     that dart; any darts after it are ignored. */
  function dartsTurn(left, darts, opened, inRule) {
    if (!Array.isArray(darts) || darts.length > 3 || !darts.every(validDart)) return { ok: false, code: 'bad_dart' };
    var isIn = !!opened || inRule !== 'DI', rest = left;
    for (var i = 0; i < darts.length; i++) {
      var dt = darts[i], v = dartValue(dt);
      if (!isIn) {
        if (dt.m !== 2) continue;
        isIn = true;
      }
      var after = rest - v;
      if (after < 0 || after === 1 || (after === 0 && dt.m !== 2)) {
        return { ok: true, scored: 0, left: left, bust: true, checkout: false, opened: isIn, finishDart: null, used: i + 1 };
      }
      rest = after;
      if (rest === 0) return { ok: true, scored: left, left: 0, bust: false, checkout: true, opened: true, finishDart: i + 1, used: i + 1 };
    }
    return { ok: true, scored: left - rest, left: rest, bust: false, checkout: false, opened: isIn, finishDart: null, used: darts.length };
  }

  /* ---------- cricket ---------- */

  var CRICKET = [20, 19, 18, 17, 16, 15, 25];
  function emptyMarks() { var o = {}; CRICKET.forEach(function (n) { o[n] = 0; }); return o; }
  function cricketStart() { return { marks: { a: emptyMarks(), b: emptyMarks() }, points: { a: 0, b: 0 } }; }
  function copyBoard(b) {
    var a = {}, bb = {};
    CRICKET.forEach(function (n) { a[n] = b.marks.a[n] || 0; bb[n] = b.marks.b[n] || 0; });
    return { marks: { a: a, b: bb }, points: { a: b.points.a || 0, b: b.points.b || 0 } };
  }
  function allClosed(marks) { return CRICKET.every(function (n) { return marks[n] >= 3; }); }

  /* One cricket turn for `side`, on a copy of the board. Only 15-20 and the bull count; marks close a number at 3, and
     marks beyond that score the number (25 for the bull) while the opponent has it open. The leg is won when this side
     has closed every number and is not behind on points; darts after that are ignored. */
  function cricketTurn(board, side, darts) {
    if (!Array.isArray(darts) || darts.length > 3 || !darts.every(validDart)) return { ok: false, code: 'bad_dart' };
    var b = copyBoard(board), other = side === 'a' ? 'b' : 'a', marks = 0;
    for (var i = 0; i < darts.length; i++) {
      var dt = darts[i];
      if (CRICKET.indexOf(dt.n) < 0) continue;
      marks += dt.m;
      var had = b.marks[side][dt.n], now = had + dt.m;
      var extra = Math.max(0, now - Math.max(3, had));
      b.marks[side][dt.n] = Math.min(3, now);
      if (extra && b.marks[other][dt.n] < 3) b.points[side] += extra * dt.n;
      if (allClosed(b.marks[side]) && b.points[side] >= b.points[other]) {
        return { ok: true, board: b, marks: marks, won: true, finishDart: i + 1 };
      }
    }
    return { ok: true, board: b, marks: marks, won: false, finishDart: null };
  }

  /* Marks thrown in a turn (for marks per round): every mark on 15-20 and the bull, closed or not. */
  function cricketTurnMarks(darts) {
    return (darts || []).reduce(function (s, dt) { return s + (validDart(dt) && CRICKET.indexOf(dt.n) >= 0 ? dt.m : 0); }, 0);
  }

  /* ---------- a whole match, replayed from its events ---------- */

  function otherSide(s) { return s === 'a' ? 'b' : 'a'; }
  function copy(o) { var r = {}; for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) r[k] = o[k]; return r; }
  var TURN_FIELDS = ['score', 'bust', 'darts', 'finishDart'];

  /* Only plain event objects count, in seq order; anything else is dropped, so bad input never throws. */
  function cleanEvents(events) {
    if (!Array.isArray(events)) return [];
    return events.filter(function (e) { return e && typeof e === 'object' && !Array.isArray(e) && typeof e.type === 'string'; })
      .map(function (e, i) { return { e: e, i: i }; })
      .sort(function (x, y) { return ((Number(x.e.seq) || 0) - (Number(y.e.seq) || 0)) || (x.i - y.i); })
      .map(function (x) { return x.e; });
  }
  function cleanPlayers(players) {
    var out = { a: [], b: [] };
    ['a', 'b'].forEach(function (s) { if (players && Array.isArray(players[s])) out[s] = players[s].filter(function (p) { return typeof p === 'string' && p; }); });
    return out;
  }

  /* A keyed score or darts that could never be right (a total no three darts make, a dart that does not exist). An edit
     carrying one is refused, so the version before it stays in force. */
  function badValues(e) {
    if (e.score !== undefined && (typeof e.score !== 'number' || e.score < 0 || e.score > 180 || Math.floor(e.score) !== e.score || IMPOSSIBLE_TOTALS.indexOf(e.score) >= 0)) return true;
    if (e.darts !== undefined && (!Array.isArray(e.darts) || e.darts.length > 3 || !e.darts.every(validDart))) return true;
    return false;
  }

  /* The turns of a match, by id, each with every version it has had: version 0 is the turn as first keyed, each edit adds
     one, an undo adds one marked undone. `current` is the version in force; a restore moves it without adding a version.
     Only the last turn still standing can be undone. An edit to any other turn is an old edit, flagged for the organiser. */
  function collectTurns(events, ignored, flags, frozenAfter) {
    var turns = {}, order = [];
    function lastStanding() {
      for (var i = order.length - 1; i >= 0; i--) { var t = turns[order[i]]; if (!t.versions[t.current].undone) return t; }
      return null;
    }
    events.forEach(function (e) {
      var t = e.turnId !== undefined ? turns[e.turnId] : null;
      if ((e.type === 'edit' || e.type === 'restore' || e.type === 'undo') && frozenAfter !== undefined && Number(e.seq) > frozenAfter) {
        ignored.push(e.seq);
        if (flags) flags.push({ turnId: e.turnId, code: 'after_confirm' });
        return;
      }
      if (e.type === 'turn') {
        if (!e.id || turns[e.id]) { ignored.push(e.seq); return; }
        // A leg number sent as text ("1") still counts; one that is missing or could never be a leg is refused and
        // flagged, so the organiser sees the score instead of it vanishing.
        var leg = typeof e.leg === 'string' && /^\d+$/.test(e.leg) ? Number(e.leg) : e.leg;
        if (typeof leg !== 'number' || !(leg >= 0) || Math.floor(leg) !== leg) {
          ignored.push(e.seq);
          if (flags) flags.push({ turnId: e.id, code: 'bad_leg' });
          return;
        }
        var v = { at: e.at, dev: e.dev, mode: e.mode === 'darts' ? 'darts' : 'total' };
        TURN_FIELDS.forEach(function (k) { if (e[k] !== undefined) v[k] = e[k]; });
        turns[e.id] = { id: e.id, seq: e.seq, leg: leg, side: e.side, player: e.player, mode: e.mode === 'darts' ? 'darts' : 'total', versions: [v], current: 0 };
        order.push(e.id);
      } else if (e.type === 'edit') {
        if (!t || badValues(e)) { ignored.push(e.seq); return; }
        if (t !== lastStanding() && flags) flags.push({ turnId: t.id, code: 'old_edit' });
        var nv = copy(t.versions[t.current]);
        delete nv.undone;
        nv.at = e.at; nv.dev = e.dev;
        TURN_FIELDS.forEach(function (k) { if (e[k] !== undefined) nv[k] = e[k]; });
        // A score without darts makes the turn a total; darts make it dart by dart (the organiser may fix either way).
        if (e.darts !== undefined) { nv.mode = 'darts'; delete nv.score; }
        else if (e.score !== undefined) { nv.mode = 'total'; delete nv.darts; }
        t.versions.push(nv);
        t.current = t.versions.length - 1;
      } else if (e.type === 'restore') {
        if (!t || !(e.version >= 0 && e.version < t.versions.length)) { ignored.push(e.seq); return; }
        if (t !== lastStanding() && flags) flags.push({ turnId: t.id, code: 'old_edit' });
        t.current = e.version;
      } else if (e.type === 'undo') {
        if (!t || t !== lastStanding()) { ignored.push(e.seq); return; }
        var uv = copy(t.versions[t.current]);
        uv.at = e.at; uv.dev = e.dev; uv.undone = true;
        t.versions.push(uv);
        t.current = t.versions.length - 1;
      }
    });
    return { byId: turns, order: order };
  }

  /* Every version of one turn, oldest first, for the organiser's history line ("60 at 8:14:02 → 45 at 8:14:40 → 54 (now)").
     frozenAfter: the replayed state's frozenAfter, so changes refused after the confirm are not shown as versions. */
  function turnHistory(events, turnId, frozenAfter) {
    var t = collectTurns(cleanEvents(events), [], null, frozenAfter).byId[turnId];
    if (!t) return [];
    return t.versions.map(function (v, i) {
      var o = copy(v);
      o.version = i; o.current = i === t.current; o.undone = !!v.undone;
      return o;
    });
  }

  /* Flags that need the organiser before a result can be sent. An old edit and a turn keyed for the wrong player are only
     shown to the organiser; they do not block. */
  var BLOCKING = ['not_checkout', 'now_bust', 'after_win', 'not_reached'];
  function canConfirm(state) {
    return !!(state && state.winner && state.next && state.next.ask === 'confirm' &&
      !state.flags.some(function (f) { return BLOCKING.indexOf(f.code) >= 0; }));
  }

  /* The whole state of a match: its legs, the score, whose turn it is and what the screen must ask next. players is
     { a: [...], b: [...] } in draw order ('a' is the first-named side); a side of two or more needs its throwing order. */
  function replay(rawFormat, players, events) {
    var evs = cleanEvents(events), frozenAfter;
    var confirms = evs.filter(function (e) { return e.type === 'confirm'; });
    for (var ci = 0; ci < confirms.length; ci++) {
      var upTo = evs.filter(function (e) { return (Number(e.seq) || 0) <= (Number(confirms[ci].seq) || 0); });
      if (replayCore(rawFormat, players, upTo).winner) { frozenAfter = Number(confirms[ci].seq) || 0; break; }
    }
    var st = replayCore(rawFormat, players, evs, frozenAfter);
    st.frozenAfter = frozenAfter;
    return st;
  }

  /* One replay of clean events. frozenAfter: the seq of the confirm in force; edits, undos and restores after it are
     refused and flagged (a sent result is changed only by the organiser, as results are today). */
  function replayCore(rawFormat, players, evs, frozenAfter) {
    var format = normalizeFormat(rawFormat);
    players = cleanPlayers(players);
    var ignored = [], flags = [];
    var turns = collectTurns(evs, ignored, flags, frozenAfter);
    function lastOf(type, test) {
      var found = null;
      evs.forEach(function (e) { if (e.type === type && (!test || test(e))) found = e; });
      return found;
    }
    var confirmEv = frozenAfter !== undefined ? lastOf('confirm', function (e) { return Number(e.seq) === frozenAfter; }) : lastOf('confirm');
    var byLeg = {};
    turns.order.forEach(function (id) {
      var t = turns.byId[id];
      if (t.versions[t.current].undone) return;   // withdrawn: kept in its history, out of the match
      (byLeg[t.leg] = byLeg[t.leg] || []).push(t);
    });

    var st = { players: { a: (players.a || []).slice(), b: (players.b || []).slice() }, legs: [], legsWon: { a: 0, b: 0 }, winner: null, confirmed: false, next: null, openingBullLoser: null, flags: flags, ignored: ignored };
    var toWin = legsToWin(format), firstStarter = null, stopped = false;

    function ask(o) { st.next = o; stopped = true; }

    for (var li = 0; !stopped && !st.winner; li++) {
      var decider = isDecider(format, st.legsWon), starter = null, choice = null, game;
      var bullThrowsFirst = st.openingBullLoser || null;

      // Who starts: the opening bull, a deciding-leg bull, Choice, or alternation from leg 1's starter.
      var needsBull = li === 0 || (decider && (format.decider === 'bull' || format.decider === 'choice'));
      if (needsBull) {
        if (li === 0) {
          var bf = format.bullFirst === 'first' ? { side: 'a' } : lastOf('bullFirst');
          if (!bf) { ask({ ask: 'bullFirst', leg: 0 }); break; }
          bullThrowsFirst = bf.side === 'b' ? 'b' : 'a';
        }
        var bull = lastOf('bull', function (e) { return e.leg === li; });
        if (!bull) { ask({ ask: 'bull', leg: li, side: bullThrowsFirst }); break; }
        var bw = bull.winner === 'b' ? 'b' : 'a';
        if (li === 0) { firstStarter = bw; st.openingBullLoser = otherSide(bw); }
        starter = bw;
        if (decider && format.decider === 'choice') {
          var ch = lastOf('choice', function (e) { return e.leg === li; });
          if (!ch || (ch.pick !== 'start' && ch.pick !== 'game') || (ch.game !== 'x01' && ch.game !== 'cricket')) { ask({ ask: 'choice', leg: li, choiceBy: bw }); break; }
          choice = { by: bw, pick: ch.pick, game: ch.game };
          starter = ch.pick === 'start' ? bw : otherSide(bw);
        }
      } else {
        starter = li % 2 === 0 ? firstStarter : otherSide(firstStarter);
      }

      game = legGame(format, li, st.legsWon, choice && choice.game);
      var start = format.start, inRule = format.inRule;
      if (choice && game === 'x01') { var cx = choiceGames(format)[0]; start = cx.start; inRule = cx.inRule; }

      // Throwing order inside each side (doubles, trios, foursomes).
      var order = {};
      var orderLeg = format.orderAsk === 'leg' ? li : 0;
      var sidesInTurn = [starter, otherSide(starter)];
      for (var si = 0; si < 2; si++) {
        var side = sidesInTurn[si], list = (players[side] || []).slice();
        if (list.length > 1) {
          var oe = lastOf('order', function (e) { return e.leg === orderLeg && e.side === side && list.indexOf(e.first) >= 0; });
          if (!oe) { ask({ ask: 'order', leg: li, orderSide: side }); break; }
          var k = list.indexOf(oe.first);
          list = list.slice(k).concat(list.slice(0, k));
        }
        order[side] = list;
      }
      if (stopped) break;

      var leg = { game: game, start: game === 'x01' ? start : null, inRule: game === 'x01' ? inRule : null, starter: starter, order: order, turns: [], winner: null, finishDart: null, choice: choice };
      st.legs.push(leg);
      var left = { a: start, b: start }, opened = { a: inRule !== 'DI', b: inRule !== 'DI' };
      var board = cricketStart(), ptr = { a: 0, b: 0 }, nextSide = starter;

      var legTurns = byLeg[li] || [];
      for (var ti = 0; ti < legTurns.length; ti++) {
        var t = legTurns[ti], v = t.versions[t.current];
        if (leg.winner) { flags.push({ turnId: t.id, code: 'after_win' }); continue; }
        var side2 = t.side === 'b' ? 'b' : 'a';
        var expected = order[nextSide] && order[nextSide][ptr[nextSide] % order[nextSide].length];
        if (side2 !== nextSide || (expected !== undefined && t.player !== expected)) flags.push({ turnId: t.id, code: 'out_of_turn' });
        var view = { id: t.id, side: side2, player: t.player, mode: v.mode, scored: 0, leftAfter: null, bust: false, checkout: false, finishDart: null,
          darts: v.darts, marks: null, version: t.current, versions: t.versions.length, flagged: false, dartsUsed: 3 };
        if (game === 'x01') {
          if (v.mode === 'darts') {
            var r = dartsTurn(left[side2], v.darts, opened[side2], inRule);
            if (!r.ok) { ignored.push(t.seq); continue; }
            opened[side2] = r.opened;
            view.scored = r.scored; view.bust = r.bust; view.checkout = r.checkout; view.finishDart = r.finishDart;
            view.dartsUsed = r.checkout ? r.used : 3;   // a bust counts all three darts (spec 6.1)
            left[side2] = r.left;
          } else {
            if (v.bust === true) {   // keyed as a bust (No score / the Bust prompt): 0, whatever score came with it
              view.bust = true; view.leftAfter = left[side2]; leg.turns.push(view); ptr[side2]++; nextSide = otherSide(side2);
              continue;
            }
            var chk = totalCheck(left[side2], v.score, opened[side2], inRule);
            if (chk === 'invalid') { ignored.push(t.seq); continue; }
            if (v.finishDart !== undefined && v.finishDart !== null && chk !== 'checkout' && v.bust !== true) flags.push({ turnId: t.id, code: 'not_checkout' });
            if (chk === 'bust' && v.bust !== true) flags.push({ turnId: t.id, code: 'now_bust' });
            if (v.bust === true || chk === 'bust') { view.bust = true; }
            else {
              if (!opened[side2] && v.score > 0) opened[side2] = true;
              view.scored = v.score; left[side2] -= v.score;
              if (chk === 'checkout') {
                view.checkout = true;
                var fd = Number(v.finishDart);
                if (finishDartChoices(view.scored).indexOf(fd) >= 0) { view.finishDart = fd; view.dartsUsed = fd; }
              }
            }
          }
          view.leftAfter = left[side2];
        } else {
          var cr = cricketTurn(board, side2, v.darts);
          if (!cr.ok) { ignored.push(t.seq); continue; }
          view.scored = cr.board.points[side2] - board.points[side2];   // this turn's points; the board holds the total
          board = cr.board; view.marks = cricketTurnMarks(cr.won ? v.darts.slice(0, cr.finishDart) : v.darts);
          if (cr.won) { view.checkout = true; view.finishDart = cr.finishDart; view.dartsUsed = cr.finishDart; }
        }
        leg.turns.push(view);
        ptr[side2]++;
        nextSide = otherSide(side2);
        if (view.checkout) {
          if (!view.finishDart) {
            ask({ ask: 'finishDart', leg: li, turnId: t.id, side: side2, finishDartChoices: finishDartChoices(view.scored) });
            break;
          }
          leg.winner = side2; leg.finishDart = view.finishDart;
          st.legsWon[side2]++;
          if (st.legsWon[side2] >= toWin) st.winner = side2;
        }
      }
      if (stopped) break;
      if (!leg.winner) {
        var np = order[nextSide][ptr[nextSide] % order[nextSide].length];
        ask({ ask: 'turn', leg: li, side: nextSide, player: np, left: game === 'x01' ? { a: left.a, b: left.b } : null, opened: game === 'x01' ? { a: opened.a, b: opened.b } : null, board: game === 'cricket' ? board : null });
      }
    }

    // Turns in legs after the one the match ended in: kept, flagged, never applied.
    if (st.winner) {
      Object.keys(byLeg).forEach(function (l) { if (Number(l) >= st.legs.length) byLeg[l].forEach(function (t) { flags.push({ turnId: t.id, code: 'after_win' }); }); });
      st.confirmed = !!confirmEv;
      st.next = { ask: st.confirmed ? 'done' : 'confirm', leg: st.legs.length - 1 };
    } else {
      if (confirmEv) ignored.push(confirmEv.seq);
      // Turns of legs not reached yet (an earlier leg is no longer won): kept, waiting, flagged.
      Object.keys(byLeg).forEach(function (l) { if (Number(l) >= st.legs.length) byLeg[l].forEach(function (t) { flags.push({ turnId: t.id, code: 'not_reached' }); }); });
    }
    st.legs.forEach(function (l) { l.turns.forEach(function (tv) { tv.flagged = flags.some(function (f) { return f.turnId === tv.id; }); }); });
    return st;
  }

  /* ---------- stats ---------- */

  function round(x, dp) { var k = Math.pow(10, dp); return Math.round(x * k) / k; }
  function emptyStats() { return { darts: 0, scored: 0, avg3: null, f9darts: 0, f9scored: 0, first9: null, legsWon: 0, cricketDarts: 0, marks: 0, mpr: null, fromTotals: false }; }
  function finish(o) {
    o.avg3 = o.darts ? round(o.scored / o.darts * 3, 1) : null;
    o.first9 = o.f9darts ? round(o.f9scored / o.f9darts * 3, 1) : null;
    o.mpr = o.cricketDarts ? round(o.marks / o.cricketDarts * 3, 2) : null;
    delete o.f9darts; delete o.f9scored;
    return o;
  }

  /* A match's stats from its replayed state: per player (each turn counts to the player who threw it) and per side.
     A turn counts 3 darts, except a checkout (its finishing dart); a bust counts all 3 however it was keyed.
     First 9 is the first three turns of each x01 leg: each player's own for byPlayer, the side's (whoever threw them)
     for bySide. fromTotals says a player's average came from turn totals, so it has no per-dart detail. An average with
     no darts is null, never NaN. */
  function stats(state) {
    if (!state || !Array.isArray(state.legs)) state = { players: { a: [], b: [] }, legs: [] };
    var byPlayer = {}, sideStats = { a: emptyStats(), b: emptyStats() };
    ['a', 'b'].forEach(function (s) { (state.players && state.players[s] || []).forEach(function (p) { byPlayer[p] = emptyStats(); }); });
    function add(p, side, f) { if (!byPlayer[p]) byPlayer[p] = emptyStats(); f(byPlayer[p]); f(sideStats[side]); }
    state.legs.forEach(function (leg) {
      var seen = {};
      leg.turns.forEach(function (t) {
        add(t.player, t.side, function (o) {
          if (leg.game === 'cricket') { o.cricketDarts += t.dartsUsed; o.marks += t.marks || 0; return; }
          o.darts += t.dartsUsed; o.scored += t.scored;
          if (t.mode === 'total') o.fromTotals = true;
        });
        if (leg.game !== 'cricket') {
          var f9 = function (o) { o.f9darts += t.dartsUsed; o.f9scored += t.scored; };
          if ((seen['p:' + t.player] = (seen['p:' + t.player] || 0) + 1) <= 3) f9(byPlayer[t.player]);
          if ((seen['s:' + t.side] = (seen['s:' + t.side] || 0) + 1) <= 3) f9(sideStats[t.side]);
        }
        if (leg.winner && t.checkout && t.finishDart) add(t.player, t.side, function (o) { o.legsWon++; });
      });
    });
    Object.keys(byPlayer).forEach(function (p) { finish(byPlayer[p]); });
    return { byPlayer: byPlayer, bySide: { a: finish(sideStats.a), b: finish(sideStats.b) } };
  }

  return {
    replay: replay, stats: stats, turnHistory: turnHistory, canConfirm: canConfirm,
    normalizeFormat: normalizeFormat, legsToWin: legsToWin, isDecider: isDecider, legGame: legGame, choiceGames: choiceGames,
    minDarts: minDarts, checkoutHint: checkoutHint, finishDartChoices: finishDartChoices, totalCheck: totalCheck,
    dartValue: dartValue, dartsTurn: dartsTurn,
    cricketStart: cricketStart, cricketTurn: cricketTurn, cricketTurnMarks: cricketTurnMarks
  };
});

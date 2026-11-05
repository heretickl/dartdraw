/* The scoring screens, shared by casual play and (later) the tournament scoring page (spec
   docs/superpowers/specs/2026-11-03-casual-play-design.md; approved screens in docs/design/screens-yours/). Each screen is
   an HTML string built from the model's view() (scoring-model.js), so it is the same in a browser and in the tests. Every
   word comes in from the page (opts.words); every name is escaped. Taps are data-act="<action>" (+ data-v="<value>"),
   handled by one listener in mount().

   Screens are drawn at the approved 660px width; mount() scales them to the phone with CSS zoom. Side 'a' is blue, 'b'
   gold. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DDScreens = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var QUICK = [26, 41, 45, 60, 85, 100, 121, 140, 180];

  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  /* "LEG {n} WON" + {n:3} -> "LEG 3 WON". Values are put in as given: escape the result, not the values. */
  function fmt(s, o) { return String(s).replace(/\{(\w+)\}/g, function (m, k) { return o && o[k] !== undefined && o[k] !== null ? String(o[k]) : m; }); }
  function other(s) { return s === 'a' ? 'b' : 'a'; }
  function up(s) { return String(s || '').toUpperCase(); }
  function act(a, v) { return ' data-act="' + a + '"' + (v !== undefined ? ' data-v="' + esc(v) + '"' : ''); }

  var ICON = {
    back: '<svg viewBox="0 0 30 36" width="30" height="36" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 5L8 18l12 13"/></svg>',
    gear: '<svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    del: '<svg viewBox="0 0 32 24" width="34" height="26" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"><path d="M10 3h19v18H10L2 12z"/><path d="M15 8l8 8M23 8l-8 8"/></svg>',
    undo: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4v6h6"/><path d="M5 15a8 8 0 1 0 2-8.5L4 10"/></svg>',
    check: '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5 5L20 6.5"/></svg>',
    darts: '<svg viewBox="0 0 60 44" width="60" height="44" fill="currentColor" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><g><path d="M4 40L14 30" stroke-width="2.5"/><path d="M13 31L24 20" stroke-width="5.5"/><path d="M24 20L32 12" stroke-width="2.5"/><path d="M30 14l2-11 4 4zM30 14l11-2-4-4z"/></g><g transform="translate(16 2)"><path d="M4 40L14 30" stroke-width="2.5"/><path d="M13 31L24 20" stroke-width="5.5"/><path d="M24 20L32 12" stroke-width="2.5"/><path d="M30 14l2-11 4 4zM30 14l11-2-4-4z"/></g></svg>',
    shuffle: '<svg viewBox="0 0 24 20" width="46" height="38" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 5h3.5c4 0 6.5 10 11 10H21"/><path d="M2 15h3.5c1.7 0 3-1.7 4.2-4"/><path d="M12.3 9c1.2-2.3 2.5-4 4.2-4H21"/><path d="M18 2l3 3-3 3M18 12l3 3-3 3"/></svg>',
    target: '<svg viewBox="0 0 112 112" width="112" height="112" fill="none"><circle cx="50" cy="62" r="40" stroke="#ffc61a" stroke-width="11"/><circle cx="50" cy="62" r="20" stroke="#ffc61a" stroke-width="9"/><circle cx="50" cy="62" r="6" fill="#ffc61a"/><path d="M52 60L92 20" stroke="#ffc61a" stroke-width="6" stroke-linecap="round"/><path d="M86 12l14-2-2 14-8 2zM84 30l12 0" stroke="#ffc61a" stroke-width="5" stroke-linejoin="round"/></svg>'
  };

  /* ---------- pieces every screen uses ---------- */

  function header(o) {
    var h = o.header || {};
    return '<header class="dds-hd">'
      + '<button class="ic back"' + act('back') + ' aria-label="' + esc(o.words.back) + '">' + ICON.back + '</button>'
      + '<div class="ttl"><div class="t1">' + esc(h.title) + '</div><div class="t2">' + esc(h.line2) + '</div>'
      + (h.line3 ? '<div class="t3">' + esc(h.line3) + '</div>' : '') + '</div>'
      + '<div class="rt">' + (o.pill ? '<span class="pill">' + esc(o.pill) + '</span>' : '')
      + '<button class="ic gear"' + act('gear') + ' aria-label="' + esc(o.words.settings) + '">' + ICON.gear + '</button></div>'
      + '</header>';
  }

  function cardScore(v, s) {
    if (v.cricket) return v.cricket.points[s];
    var l = v.sides[s].left;
    return l === null ? '' : l;
  }
  function cards(v, o) {
    var dots = '';
    v.legs.forEach(function (l) { dots += '<i class="dot side-' + l.winner + '"></i>'; });
    if (!v.winner) dots += '<i class="dot now"></i>';
    function card(s) {
      return '<button class="card side-' + s + (v.throwing === s ? ' on' : '') + '"' + act('turns', s) + '>'
        + '<span class="nm">' + esc(up(v.sides[s].name)) + '</span><span class="sc">' + esc(cardScore(v, s)) + '</span></button>';
    }
    return '<section class="dds-cards">' + card('a')
      + '<div class="legs"><span class="lb">' + esc(o.words.legs) + '</span>'
      + '<span class="ls"><b class="la">' + v.legsWon.a + '</b>-<b class="lb2">' + v.legsWon.b + '</b></span>'
      + '<span class="dots">' + dots + '</span></div>'
      + card('b') + '</section>';
  }

  /* 01 only: Normal Mode (turn total) or Easy Mode (dart by dart), one tap away under the score cards (owner 2026-11-04) */
  function modeSwitch(v, o) {
    if (v.game !== 'x01') return '';
    var mode = o.mode || 'total';
    return '<section class="modesw">' + [['total', o.words.modeTotal], ['darts', o.words.modeDarts]].map(function (x) {
      return '<button class="' + (mode === x[0] ? 'on' : '') + '"' + act('mode', x[0]) + '>' + esc(x[1]) + '</button>';
    }).join('') + '</section>';
  }

  function pop(side, inner, cls) {
    return '<div class="veil"></div><div class="pop side-' + side + (cls ? ' ' + cls : '') + '" role="dialog">' + inner + '</div>';
  }

  /* ---------- x01, turn total ---------- */

  // six rows on a wide screen in turn total, where the left column has the room (owner 2026-11-04); three elsewhere
  function last3(v, o, six) {
    var list = six && v.last6 ? v.last6 : v.last3, size = six && v.last6 ? 6 : 3;
    var rows = list.map(function (r, i) {
      return '<div class="row' + (i === 0 ? ' new' : '') + '"><span>' + (r.a === null ? '' : r.a) + '</span><span>' + r.n + '</span><span>'
        + (r.b === null ? '' : r.b) + '</span></div>';
    }).join('');
    for (var k = list.length; k < size; k++) rows += '<div class="row blank"><span></span><span></span><span></span></div>';   // the panel keeps its size
    return '<section class="last3' + (size === 6 ? ' six' : '') + '"><div class="ttl">' + esc(size === 6 ? o.words.lastScores6 || o.words.lastScores : o.words.lastScores) + '</div>'
      + '<div class="hd"><span>' + esc(up(v.sides.a.name)) + '</span><span>#</span><span>' + esc(up(v.sides.b.name)) + '</span></div>'
      + rows + '</section>';
  }

  /* The checkout route for the thrower, when hints are on (view.hint). */
  function hintLine(v) { return v.hint && v.hint.length ? '<div class="hint">' + esc(v.hint.join(' • ')) + '</div>' : ''; }

  /* The score being typed, in a box above the keypad in the thrower's colour, with what it leaves (owner 2026-11-04,
     option C: not on the button). */
  function entryBox(v, o) {
    var s = v.throwing, typed = o.typed || '', left = v.sides[s].left, after = typed ? left - Number(typed) : null;
    return '<section class="entry side-' + s + '"><span class="who">' + esc(up(v.sides[s].name)) + '</span><span class="val">' + esc(typed) + '</span><span class="lv">'
      + (after !== null && after >= 0 ? esc(o.words.leaves) + ' <b>' + after + '</b>' : '') + '</span></section>';
  }

  function totalPad(v, o) {
    var q = QUICK.map(function (n) { return '<button class="q' + (n === 180 ? ' gold' : '') + '"' + act('quick', n) + '>' + n + '</button>'; });
    var digit = function (n) { return '<button class="k"' + act('digit', n) + '>' + n + '</button>'; };
    var typed = o.typed || '';
    return hintLine(v) + '<section class="quick"><div class="r1">' + q.slice(0, 5).join('') + '</div><div class="r2">' + q.slice(5).join('') + '</div></section>'
      + entryBox(v, o) + '<section class="pad">'
      + digit(1) + digit(2) + digit(3) + '<button class="k"' + act('del') + '>' + ICON.del + '</button>'
      + digit(4) + digit(5) + digit(6) + '<button class="k undo"' + act('undo') + '>' + ICON.undo + '<span>' + esc(o.words.undo) + '</span></button>'
      + digit(7) + digit(8) + digit(9) + '<button class="k bust"' + act('bust') + '>' + esc(o.words.bust) + '</button>'
      + '<button class="k zero"' + act('digit', 0) + '>0</button>'
      + '<button class="go"' + act('submit') + (typed ? '' : ' disabled') + '>' + ICON.check + '<span>' + esc(o.words.enter) + '</span></button>'
      + '</section>';
  }

  function whichDart(v, o) {
    var s = v.throwing, w = o.words, p = v.pending;
    var btns = [1, 2, 3].map(function (k) {
      var ok = p.choices.indexOf(k) >= 0;
      return '<button class="fd' + (ok ? '' : ' off') + '"' + (ok ? act('finish', k) : ' disabled') + '><b>' + esc(w['dart' + k]) + '</b><span>'
        + esc(ok ? w.dartWord : w.notPossible) + '</span></button>';
    }).join('');
    return pop(s, '<span class="pill won">' + esc(fmt(w.legWon, { n: v.leg + 1 })) + '</span>'
      + '<div class="who">' + esc(up(v.sides[s].name)) + '</div><div class="sub">' + esc(w.checkedOut) + '</div>'
      + '<div class="big">' + p.score + '</div><h2>' + esc(w.whichDart) + '</h2><div class="fds">' + btns + '</div>'
      + '<button class="ghost"' + act('cancel') + '>' + esc(w.notCheckout) + '</button>', 'finish');
  }

  function bustAsk(v, o) {
    var s = v.throwing, w = o.words;
    return pop(s, '<h2>' + esc(w.bustTitle) + '</h2><p>' + esc(fmt(w.bustText, { name: v.sides[s].name, left: v.sides[s].left, score: o.asked })) + '</p>'
      + '<div class="two"><button class="dk"' + act('cancel') + '>' + esc(w.cancel) + '</button>'
      + '<button class="red"' + act('confirmBust') + '>' + esc(w.bustYes) + '</button></div>', 'bustq');
  }

  /* ---------- darts ---------- */

  /* A dart's name: 20, D20, T20, 25, BULL, or – for a miss. */
  function dartName(d, w) {
    if (!d) return '–';
    if (d.n === 0) return '–';
    if (d.n === 25) return d.m === 2 ? w.bull : '25';
    return (d.m === 3 ? 'T' : d.m === 2 ? 'D' : '') + d.n;
  }
  function shown(cur, w) { return [0, 1, 2].map(function (i) { return dartName(cur[i], w); }).join(' • '); }
  function dartsBar(o) {
    var w = o.words, cur = o.cur || [];
    return '<section class="dbar"><button class="dk undo"' + act('undo') + '>' + ICON.undo + '<span>' + esc(w.undo) + '</span></button>'
      + '<div class="shown">' + esc(shown(cur, w)) + '</div>'
      + '<button class="red enter"' + act('enter') + (cur.length ? '' : ' disabled') + '>' + ICON.check + '<span>' + esc(w.enter) + '</span></button></section>';
  }

  function x01Darts(v, o) { return x01DartsParts(v, o).join(''); }
  /* [what this turn has scored, the keys]: one above the other on a phone, side by side on a wide screen */
  function x01DartsParts(v, o) {
    var w = o.words, cur = o.cur || [], s = v.throwing, mult = o.mult || 1;
    var scored = cur.reduce(function (t, d) { return t + d.n * d.m; }, 0), after = v.sides[s].left - scored;
    // below 0, 1 left, or 0 not on a double is a bust: say NO SCORE rather than a minus number (owner 2026-11-04)
    var busted = after < 0 || after === 1 || (after === 0 && cur[cur.length - 1].m !== 2);
    var slots = [0, 1, 2].map(function (i) {
      return '<div class="slot' + (i === cur.length ? ' now' : '') + '"><span>' + esc(fmt(w.dartN, { n: i + 1 })) + '</span><b>' + esc(dartName(cur[i], w)) + '</b></div>';
    }).join('');
    var mults = [[1, w.single], [2, w.double], [3, w.treble]].map(function (x) {
      return '<button class="' + (mult === x[0] ? 'on' : '') + '"' + act('mult', x[0]) + '>' + esc(x[1]) + '</button>';
    }).join('');
    var grid = '';
    for (var n = 1; n <= 20; n++) grid += '<button class="k"' + act('dart', n) + '>' + n + '</button>';
    grid += '<button class="k"' + act('dart', 25) + '>25</button><button class="k sm"' + act('dart', 'bull') + '>' + esc(w.bull) + '</button>'
      + '<button class="k sm"' + act('miss') + '>' + esc(w.miss) + '</button><button class="k"' + act('del') + '>' + ICON.del + '</button>'
      + '<button class="k bust"' + act('bust') + '>' + esc(w.bust) + '</button>';
    // the last 3 scores stay on screen, as in turn total (owner 2026-11-04), and the darts keyed so far add up as they go
    return [last3(v, o) + '<section class="panel turnp"><div class="ttl">' + esc(w.thisTurn) + '</div>'
      + '<div class="line"><span class="who">' + esc(fmt(w.toThrow, { name: up(v.sides[s].name) })) + '</span><span class="scored">' + esc(fmt(w.scoredSoFar, { n: scored })) + '</span><span class="after">' + (busted ? esc(w.bust) : esc(w.leftAfter) + ' ' + after) + '</span></div>'
      + '<div class="slots">' + slots + '</div>' + hintLine(cur.length && o.hintFor ? { hint: o.hintFor(after, 3 - cur.length) } : v) + '</section>',
      '<section class="mults">' + mults + '</section><section class="grid">' + grid + '</section>' + dartsBar(o)];
  }

  function cricketPad(v, o) { return cricketParts(v, o).join(''); }
  /* [the board, the darts bar] */
  function cricketParts(v, o) {
    var w = o.words, rows = '';
    function marks(n, side) {
      var k = Math.min(3, n), out = '';
      for (var i = 0; i < 3; i++) out += '<i class="mk' + (i < k ? ' on' : '') + '"></i>';
      return '<div class="m' + side + (n >= 3 ? ' closed' : '') + '">' + out + '</div>';
    }
    v.cricket.numbers.forEach(function (r) {
      var dead = r.closedBoth, label = r.n === 25 ? w.bull : String(r.n);
      var key = function (cls, m, text) {
        if (dead || (r.n === 25 && m === 3)) return '<span class="dt ' + cls + (r.n === 25 && m === 3 ? ' none' : '') + '">' + esc(text) + '</span>';
        return '<button class="dt ' + cls + '"' + act('dart', r.n + ':' + m) + '>' + esc(text) + '</button>';
      };
      rows += '<div class="crow' + (dead ? ' dead' : '') + '">' + marks(r.a, 'a') + key('d', 2, 'D')
        + (dead ? '<span class="num">' + esc(label) + '</span>' : '<button class="num"' + act('dart', r.n + ':1') + '>' + esc(label) + '</button>')
        + key('t', 3, 'T') + marks(r.b, 'b') + '</div>';
    });
    return ['<section class="panel cricket"><div class="chd"><span>' + esc(up(v.sides.a.name)) + '</span><span>' + esc(w.darts) + '</span><span>'
      + esc(up(v.sides.b.name)) + '</span></div>' + rows + '<button class="key miss"' + act('miss') + '>' + esc(w.miss) + '</button></section>', dartsBar(o)];
  }

  /* ---------- bulls and Choice ---------- */

  function bullButtons(v, o, sub) {
    return '<div class="closest">' + esc(o.words.whoClosest) + '</div><div class="bbtns">' + ['a', 'b'].map(function (s) {
      return '<button class="bb side-' + s + '"' + act('bull', s) + '><b>' + esc(v.sides[s].name) + '</b><span>' + esc(sub) + '</span></button>';
    }).join('') + '</div>';
  }
  function openingBull(v, o) {
    var w = o.words;
    return '<section class="panel bullp"><div class="tg">' + ICON.target + '</div><div class="bt"><h3>' + esc(w.bullThrow) + '</h3><h4>' + esc(w.bullOne) + '</h4><p>'
      + esc(w.closestStarts) + '</p></div></section>' + bullButtons(v, o, fmt(w.startsLeg, { n: 1 })) + '<p class="again">' + esc(w.throwAgain) + '</p>';
  }
  function legsBox(v, o) {
    return '<div class="legs lbox"><span class="lb">' + esc(o.words.legs) + '</span><span class="ls">' + v.legsWon.a + ' - ' + v.legsWon.b + '</span></div>';
  }
  function undoRow(o) { return '<div class="undorow"><button class="dk undob"' + act('undo') + '>' + ICON.undo + '<span>' + esc(o.words.undo) + '</span></button></div>'; }
  function decidingBull(v, o, choiceDecider) {
    var w = o.words, s = v.bull.side;
    return '<section class="decp"><div><span class="pill gold">' + esc(w.decidingLeg) + '</span><h2>' + esc(fmt(w.bullForLeg, { n: v.bull.leg + 1 })) + '</h2></div>' + legsBox(v, o) + '</section>'
      + '<section class="panel bullp"><div class="tg">' + ICON.target + '</div><div class="bt"><h3>' + esc(w.bullThrow) + '</h3><h4>'
      + esc(fmt(w.throwsFirst, { name: v.sides[s].name })) + '</h4><p>' + esc(w.lostOpening) + '</p></div></section>'
      + bullButtons(v, o, choiceDecider ? w.chooses : fmt(w.startsLeg, { n: v.bull.leg + 1 })) + undoRow(o);
  }
  /* The deciding leg set to Choice (approved 06c): three steps, then the closest picks "I'll start the leg" or "I'll pick
     the game", and the game is tapped below; the confirm pop-up (06d) comes up once both are picked. */
  function choiceScreen(v, o) {
    var w = o.words, by = v.choice.by, ot = other(by), pick = o.choicePick, game = o.choiceGame;
    var names = { by: v.sides[by].name, other: v.sides[ot].name }, first = v.choice.firstThrower || ot;
    var step = function (n, html) { return '<div class="step"><i>' + n + '</i><span>' + html + '</span></div>'; };
    var lit = by === 'a' ? 'blue' : 'goldb';
    var head = '<section class="decp"><div><span class="pill gold">' + esc(w.decidingLeg) + '</span><h2 class="huge">' + esc(w.choiceWord) + '</h2></div>' + legsBox(v, o) + '</section>'
      + '<section class="steps">' + step(1, esc(fmt(w.choiceStep1, { name: v.sides[first].name })))
      + step(2, esc(w.choiceStep2) + ' <b>' + esc(names.by) + '.</b>') + step(3, esc(fmt(w.choiceStep3, { name: names.by }))) + '</section>';
    var picks = '<section class="choicep"><div class="two big2">'
      + '<button class="' + (pick === 'start' ? lit : 'dk') + '"' + act('cpick', 'start') + '>' + ICON.darts + '<b>' + esc(w.illStart) + '</b><span>' + esc(fmt(w.illStartSub, { name: names.by, other: names.other })) + '</span></button>'
      + '<button class="' + (pick === 'game' ? lit : 'dk') + '"' + act('cpick', 'game') + '>' + ICON.shuffle + '<b>' + esc(w.illPick) + '</b><span>' + esc(fmt(w.illPickSub, { other: names.other })) + '</span></button></div>'
      + '<div class="two games2">'
      + '<button class="' + (game === 'x01' ? lit : 'dk') + '"' + act('cgame', 'x01') + '>' + esc(w.game501) + '</button>'
      + '<button class="' + (game === 'cricket' ? lit : 'dk') + '"' + act('cgame', 'cricket') + '>' + esc(w.gameNameCricket) + '</button></div></section>';
    picks += undoRow(o);
    if (!pick || !game) return head + picks;
    var picker = pick === 'start' ? ot : by, starter = pick === 'start' ? by : ot;
    return head + picks + pop(starter, '<span class="pill gold">' + esc(w.decidingLeg) + '</span>'
      + '<div class="sub">' + esc(fmt(w.legScore, { n: v.choice.leg + 1, a: v.legsWon.a, b: v.legsWon.b })) + '</div>'
      + '<div class="big">' + esc(game === 'x01' ? w.game501 : w.gameCricket) + '</div>'
      + '<h2>' + esc(fmt(w.startsFirst, { name: up(v.sides[starter].name) })) + '</h2>'
      + '<p>' + esc(fmt(w.choseLine, { starter: v.sides[starter].name, picker: v.sides[picker].name, game: game === 'x01' ? w.game501 : w.gameNameCricket })) + '</p>'
      + '<div class="two"><button class="dk"' + act('cchange') + '>' + esc(w.change) + '</button><button class="blue"' + act('cgo') + '>'
      + esc(fmt(w.startLeg, { n: v.choice.leg + 1 })) + '</button></div>', 'confirm');
  }

  /* ---------- a leg's turns, and changing one ---------- */

  function legGame(v, leg, rows) {
    var l = v.legs.filter(function (x) { return x.n === leg + 1; })[0];
    if (l) return l.game;
    var t = rows.length && (rows[0].a || rows[0].b);
    return t && t.marks !== null && t.marks !== undefined ? 'cricket' : (leg === v.leg ? v.game : 'x01');
  }
  function turnsScreen(v, o) {
    var w = o.words, leg = o.popup.leg, rows = o.turns || [], game = legGame(v, leg, rows);
    // o.lockTurns (casual.js, a logged-in game once saved or waiting to be): the result's turns are shown, not changed, so the
    // scorecard never keeps a result the screen no longer shows.
    var locked = !!(o.lockTurns && v.winner);
    var nLegs = v.winner ? v.legs.length : (v.leg !== null ? v.leg + 1 : v.legs.length);
    var tabs = '';
    for (var i = 0; i < nLegs; i++) tabs += '<button class="' + (i === leg ? 'on' : '') + '"' + act('turnsLeg', i) + '>' + esc(w.legCol) + ' ' + (i + 1) + '</button>';
    var first = rows.length ? (rows[0].a && rows[0].b ? (rows[0].a.turnId < rows[0].b.turnId ? 'a' : 'b') : (rows[0].a ? 'a' : 'b')) : null;
    if (rows.length && rows[0].a && rows[0].b) first = Number(rows[0].a.turnId.slice(1)) < Number(rows[0].b.turnId.slice(1)) ? 'a' : 'b';
    var cell = function (t) {
      if (!t) return '<span class="c dash">–</span><span class="c"></span>';
      var shownScore = game === 'cricket' ? (t.darts || []).map(function (d) { return dartName(d, w); }).join(' • ') : (t.bust ? w.bust : t.scored);
      var left = game === 'cricket' ? (t.scored ? '+' + t.scored : '') : (t.left === 0 ? w.out : t.left);
      if (locked) return '<span class="c sc">' + esc(shownScore) + '</span><span class="c lf">' + esc(left) + '</span>';
      return '<button class="c sc"' + act('edit', t.turnId) + '>' + esc(shownScore) + '</button><span class="c lf">' + esc(left) + '</span>';
    };
    var body = rows.map(function (r) { return '<div class="trow"><span class="c n">' + r.turn + '</span>' + cell(r.a) + cell(r.b) + '</div>'; }).join('');
    return '<section class="turnsp"><div class="tabs">' + tabs + '</div>'
      + '<h2>' + esc(fmt(w.turnsTitle, { n: leg + 1, game: game === 'cricket' ? up(w.gameNameCricket) : w.gameNameX01 })) + '</h2>'
      + (locked ? '<p class="subl locked">' + esc(w.turnsLocked) + '</p>'
        : first ? '<p class="subl">' + esc(fmt(game === 'cricket' ? w.turnsSubCricket : w.turnsSub, { name: v.sides[first].name })) + '</p>' : '')
      + '<div class="panel tbl' + (game === 'cricket' ? ' cr' : '') + '"><div class="thd"><span>' + esc(w.turnCol) + '</span><span class="side-a">' + esc(up(v.sides.a.name)) + '</span><span class="side-b">' + esc(up(v.sides.b.name)) + '</span></div>'
      + (game === 'cricket' ? '' : '<div class="tsub"><span></span><span>' + esc(w.scoredCol) + '</span><span>' + esc(w.leftCol) + '</span><span>' + esc(w.scoredCol) + '</span><span>' + esc(w.leftCol) + '</span></div>')
      + body + '</div><button class="dk wide"' + act('closePop') + '>' + esc(w.backToGame) + '</button></section>';
  }
  function findTurn(rows, id) {
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].a && rows[i].a.turnId === id) return { side: 'a', turn: rows[i].turn, t: rows[i].a };
      if (rows[i].b && rows[i].b.turnId === id) return { side: 'b', turn: rows[i].turn, t: rows[i].b };
    }
    return null;
  }
  function editPop(v, o) {
    var w = o.words, p = o.popup, rows = o.turns || [], f = findTurn(rows, p.turnId);
    if (!f) return '';
    var game = legGame(v, p.leg, rows), eyebrow = fmt(w.editEyebrow, { n: p.leg + 1, t: f.turn, name: up(v.sides[f.side].name) });
    var err = p.error ? '<p class="err">' + esc(w['err_' + p.error] || p.error) + '</p>' : '';
    var foot = '<p class="note">' + esc(w.editNote) + '</p>' + err;
    if (game === 'cricket') {
      var cur = o.cur || [];
      var slots = [0, 1, 2].map(function (i) {
        return '<div class="slot' + (i === cur.length ? ' now' : '') + '"><span>' + esc(fmt(w.dartN, { n: i + 1 })) + '</span><b>' + esc(dartName(cur[i], w)) + '</b></div>';
      }).join('');
      var keys = [20, 19, 18, 17, 16, 15, 25].map(function (n) {
        var label = n === 25 ? w.bull : String(n);
        return '<div class="erow"><button class="key"' + act('dart', n + ':2') + '>D</button><button class="key num"' + act('dart', n + ':1') + '>' + esc(label) + '</button>'
          + (n === 25 ? '<span class="key none"></span>' : '<button class="key"' + act('dart', n + ':3') + '>T</button>') + '</div>';
      }).join('');
      return pop(f.side, '<div class="eyebrow">' + esc(eyebrow) + '</div><h2>' + esc(w.editTitleDarts) + '</h2><div class="slots">' + slots + '</div>'
        + '<div class="ekeys">' + keys + '<button class="key miss"' + act('miss') + '>' + esc(w.miss) + '</button></div>' + foot
        + '<div class="two"><button class="dk"' + act('closeEdit') + '>' + esc(w.cancel) + '</button><button class="blue"' + act('editGo') + (cur.length ? '' : ' disabled') + '>' + esc(w.changeTurn) + '</button></div>', 'edit');
    }
    var typed = o.typed || '';
    var from = f.t.bust ? w.bust : f.t.scored;
    var digit = function (n) { return '<button class="k"' + act('digit', n) + '>' + n + '</button>'; };
    return pop(f.side, '<div class="eyebrow">' + esc(eyebrow) + '</div><h2>' + esc(fmt(w.editTitle, { from: from, to: typed || '…' })) + '</h2>'
      + '<div class="val">' + esc(typed || '–') + '</div>' + foot
      + '<div class="epad">' + [1, 2, 3, 4, 5, 6, 7, 8, 9].map(digit).join('') + '<button class="k"' + act('del') + '>' + ICON.del + '</button>' + digit(0)
      + '<button class="k bust"' + act('editBust') + '>' + esc(w.bust) + '</button></div>'
      + '<div class="two"><button class="dk"' + act('closeEdit') + '>' + esc(w.cancel) + '</button><button class="' + (f.side === 'a' ? 'blue' : 'goldb') + '"' + act('editGo') + (typed ? '' : ' disabled') + '>'
      + esc(fmt(w.changeTo, { v: typed || '' })) + '</button></div>', 'edit');
  }

  /* ---------- settings ---------- */

  function gearPop(v, o) {
    var w = o.words, mode = o.mode || 'total';
    return pop(v.throwing || 'a', '<h2>' + esc(w.gearTitle) + '</h2>'
      + '<div class="seg">' + [['total', w.modeTotal], ['darts', w.modeDarts]].map(function (x) {
        return '<button class="' + (mode === x[0] ? 'on' : '') + '"' + act('mode', x[0]) + '>' + esc(x[1]) + '</button>';
      }).join('') + '</div>'
      + '<div class="optrow"><span>' + esc(w.hints) + '</span><button class="tog' + (o.hints ? ' on' : '') + '"' + act('hints') + '>' + esc(o.hints ? w.on : w.off) + '</button></div>'
      + (o.gearButtons || []).map(function (b, i) { return '<button class="dk wide"' + act('gearBtn', i) + '>' + esc(b.label) + '</button>'; }).join('')
      + '<button class="blue wide"' + act('closePop') + '>' + esc(w.done) + '</button>', 'gearp');
  }

  /* ---------- the end of the match ---------- */

  function summary(v, o) {
    var w = o.words, win = v.winner, run = other(win);
    function best(s) {
      var d = v.legs.filter(function (l) { return l.winner === s; }).map(function (l) { return l.darts; });
      return d.length ? Math.min.apply(null, d) : null;
    }
    function card(s, cls, label) {
      var st = v.sides[s], lines = '';
      if (st.avg3 !== null) lines += '<p>' + esc(fmt(w.avgLine, { avg: st.avg3, f9: st.first9 === null ? '–' : st.first9 })) + '</p>';
      if (st.mpr !== null) lines += '<p>' + esc(fmt(w.mprLine, { mpr: st.mpr })) + '</p>';
      if (best(s) !== null) lines += '<p>' + esc(fmt(w.bestLeg, { n: best(s) })) + '</p>';
      return '<div class="sc2 ' + cls + ' side-' + s + '"><span class="lbl">' + esc(label) + '</span><span class="nm">' + esc(st.name) + '</span>' + lines + '</div>';
    }
    var rows = v.legs.map(function (l) {
      var nth = w['nth' + l.finishDart] || '';
      var fin = l.game === 'cricket' ? fmt(w.finishCricket, { nth: nth, number: l.finishNumber === 25 ? w.bullName : l.finishNumber })
        : fmt(w.finishX01, { nth: nth, score: l.finishScore });
      return '<div class="lrow"><span>' + l.n + '</span><span>' + esc(v.sides[l.winner].name) + '</span><span>' + esc(l.game === 'cricket' ? w.gameNameCricket : w.gameNameX01)
        + '</span><span>' + esc(fin) + '</span><span>' + l.darts + '</span></div>';
    }).join('');
    // o.savedLine: what happened to a logged-in player's game (casual.js): a line of text, or { text, label, act } with a
    // button (log in again). Guests have none.
    var sl = o.savedLine, saved = '';
    if (sl) {
      var slt = typeof sl === 'string' ? sl : sl.text;
      saved = '<div class="saved"><p>' + esc(slt) + '</p>' + (sl.act ? '<button class="dk"' + act(sl.act) + '>' + esc(sl.label) + '</button>' : '') + '</div>';
    }
    var btns = (o.summaryButtons || []).map(function (b) {
      return '<button class="' + (b.main ? 'red main' : 'dk') + '"' + act(b.act) + '>' + esc(b.label) + '</button>';
    }).join('');
    return '<section class="sum"><div class="top">' + card(win, 'win', w.winner)
      + '<div class="legs lbox"><span class="lb">' + esc(w.legs) + '</span><span class="ls side-' + win + '">' + v.legsWon[win] + '-' + v.legsWon[run] + '</span></div>'
      + card(run, 'run', w.runnerUp) + '</div>'
      + '<div class="panel ltab"><h3>' + esc(w.legs) + '</h3><div class="lhd"><span>' + esc(w.legCol) + '</span><span>' + esc(w.wonByCol) + '</span><span>' + esc(w.gameCol)
      + '</span><span>' + esc(w.finishCol) + '</span><span>' + esc(w.dartsCol) + '</span></div>' + rows + '</div>'
      + saved + '<div class="btns">' + btns + '</div></section>';
  }

  /* ---------- the whole screen ---------- */

  function render(v, o) {
    var body = '', pops = '', p = o.popup || null, hd = o, wide = false;
    if (p && (p.kind === 'turns' || p.kind === 'edit')) {
      body = turnsScreen(v, { words: o.words, popup: { leg: p.leg }, turns: o.turns, lockTurns: o.lockTurns });
      if (p.kind === 'edit' && !(o.lockTurns && v.winner)) pops = editPop(v, o);
    } else if (v.winner) {
      hd = Object.assign({}, o, { pill: null });
      body = summary(v, o);
    } else if (v.ask === 'bull') {
      body = v.bull.leg === 0 ? openingBull(v, o) : decidingBull(v, o, true);
    } else if (v.ask === 'choice') {
      body = choiceScreen(v, o);
    } else if (v.ask === 'turn') {
      // [left, right]: stacked on a phone; side by side on a wide screen (owner 2026-11-04), scores left, keys right
      var parts = v.game === 'cricket' ? cricketParts(v, o).reverse()
        : (o.mode || 'total') === 'darts' ? x01DartsParts(v, o) : [last3(v, o, !!o.wide), totalPad(v, o)];
      wide = !!o.wide;
      var top = cards(v, o) + modeSwitch(v, o);
      body = wide ? '<div class="wl">' + top + parts[0] + '</div><div class="wr">' + parts[1] + '</div>'
        : top + (v.game === 'cricket' ? parts[1] + parts[0] : parts[0] + parts[1]);
      if (v.pending) pops = whichDart(v, o);
      else if (v.askBust) pops = bustAsk(v, o);
    }
    if (p && p.kind === 'gear') pops = gearPop(v, o);
    if (p && p.kind === 'confirm') {
      var gb = (o.gearButtons || [])[p.i] || {}, c = gb.confirm || {};
      pops = pop(v.throwing || 'a', '<h2>' + esc(c.title) + '</h2><p>' + esc(c.text) + '</p><div class="two"><button class="dk"' + act('closePop') + '>' + esc(o.words.cancel) + '</button><button class="red"' + act('gearYes') + '>' + esc(c.yes) + '</button></div>', 'bustq');
    }
    var head = header(hd);
    if (v.winner && !(p && (p.kind === 'turns' || p.kind === 'edit'))) {
      head = head.replace(/<div class="rt">[\s\S]*?<\/div><\/header>$/, '<div class="rt"><span class="pill over">' + esc(o.words.matchOver) + '</span></div></header>');
    }
    var compact = !wide && v.ask === 'turn' && v.game === 'x01' && (o.mode || 'total') === 'darts' && !(p && (p.kind === 'turns' || p.kind === 'edit'));
    return '<div class="dds' + (v.throwing ? ' throw-' + v.throwing : '') + (v.game ? ' g-' + v.game : '') + (compact ? ' compact' : '') + (wide ? ' wide' : '') + '">' + head + body + pops + '</div>';
  }

  /* A screen clearly wider than tall (a tablet or phone on its side, a laptop) gets the side-by-side layout. */
  function isWide() {
    if (typeof document === 'undefined' || !document.documentElement || typeof window === 'undefined') return false;
    var w = document.documentElement.clientWidth || window.innerWidth, h = window.innerHeight;
    return !!(w && h && w >= h * 1.2);
  }

  /* Scale a 660 x 982 screen (1280 x 720 when wide) to fit the window both ways, and stretch it to the window's height
     (the keypads and cricket rows take the extra room), so a tall phone has no empty band at the bottom and a short or
     wide window needs no scrolling (owner 2026-11-04: every device). The width is the page's own (clientWidth): a page
     wider than the phone makes window.innerWidth grow with it. */
  function fit(el) {
    if (!el || !el.style || typeof document === 'undefined' || !document.documentElement) return;
    var w = document.documentElement.clientWidth || (typeof window !== 'undefined' && window.innerWidth);
    if (!w) return;
    var h = typeof window !== 'undefined' && window.innerHeight;
    var wide = el.classList && el.classList.contains('wide'), dw = wide ? 1280 : 660, dh = wide ? 720 : 982;
    var z = Math.min(wide ? 1.5 : 1.25, w / dw, h ? h / dh : Infinity);
    el.style.zoom = z;
    el.style.minHeight = Math.max(dh, h ? Math.round(h / z) : 0) + 'px';
    // Some screens need more than the design height (Easy Mode's keypad with This turn): measure what was drawn and,
    // if it still runs past the window, scale down once more so the bottom row is never cut off.
    var drawn = h && el.getBoundingClientRect ? el.getBoundingClientRect().height : 0;
    if (drawn > h + 1) {
      z = z * h / drawn;
      el.style.zoom = z;
      el.style.minHeight = Math.max(dh, Math.round(h / z)) + 'px';
    }
  }

  /* ---------- taps ---------- */

  /* Draws the match into root and keeps it in step with taps. Screen-only state (what is typed, the darts of this turn,
     which pop-up is open, the Choice picks) lives here; everything else is the match's. opts.onChange(match) runs after
     every tap that changed the match (the page saves it); opts.onAction(act) gets taps this file does not know (the
     page's summary buttons, back); opts.onPrefs({mode, hints}) when settings change. */
  function mount(root, match, opts) {
    var ui = { typed: '', cur: [], mult: 1, popup: null, asked: null, choicePick: null, choiceGame: null };
    var mode = opts.mode || 'total', hints = !!opts.hints, wideNow = false;
    match.setHints && match.setHints(hints);

    function refresh() {
      var v = match.view();
      wideNow = isWide();
      var o = Object.assign({}, opts, ui, { mode: mode, hints: hints, hintFor: match.hintFor, wide: wideNow });
      if (ui.popup && (ui.popup.kind === 'turns' || ui.popup.kind === 'edit')) o.turns = match.legTurns(ui.popup.leg);
      root.innerHTML = render(v, o);
      fit(root.firstChild);
    }
    function changed(before) {
      if (match.events().length !== before && opts.onChange) opts.onChange(match);
    }
    function dartFrom(val) {
      if (String(val).indexOf(':') > 0) { var p = String(val).split(':'); return { n: Number(p[0]), m: Number(p[1]) }; }
      if (val === 'bull') return { n: 25, m: 2 };
      var n = Number(val);
      if (n === 25) return { n: 25, m: ui.mult === 2 ? 2 : 1 };
      return { n: n, m: ui.mult };
    }
    function sendTotal(n) {
      var r = match.total(n);
      ui.asked = r.code === 'ask_bust' ? n : null;
      ui.typed = '';
    }

    function handle(a, val) {
      var before = match.events().length, v = match.view(), editing = ui.popup && ui.popup.kind === 'edit';
      switch (a) {
        case 'digit':
          if ((ui.typed + val).length <= 3 && Number(ui.typed + val) <= 180) ui.typed = ui.typed === '0' ? String(val) : ui.typed + val;
          break;
        case 'del': if (editing || mode === 'total' || v.game !== 'x01') ui.typed = ui.typed.slice(0, -1); if (!editing) ui.cur.pop(); break;
        case 'submit': if (ui.typed) sendTotal(Number(ui.typed)); break;
        case 'quick': sendTotal(Number(val)); break;
        case 'bust': ui.cur = []; ui.typed = ''; match.bust(); break;
        case 'confirmBust': match.confirmBust(); ui.asked = null; break;
        case 'cancel': match.cancelPending(); ui.asked = null; break;
        case 'finish': match.finishDart(Number(val)); break;
        case 'undo':
          if (ui.cur.length) ui.cur.pop();
          else if (ui.typed) ui.typed = '';
          else { match.undo(); ui.choicePick = null; ui.choiceGame = null; }
          break;
        case 'mult': ui.mult = Number(val); break;
        case 'dart': if (ui.cur.length < 3) { ui.cur.push(dartFrom(val)); ui.mult = 1; } break;
        case 'miss': if (ui.cur.length < 3) { ui.cur.push({ n: 0, m: 0 }); ui.mult = 1; } break;
        case 'enter': if (ui.cur.length && match.darts(ui.cur).ok) ui.cur = []; break;
        case 'bull': match.bull(val); break;
        case 'cpick': ui.choicePick = val; break;
        case 'cgame': ui.choiceGame = val; break;
        case 'cchange': ui.choicePick = null; ui.choiceGame = null; break;
        case 'cgo': if (match.choice(ui.choicePick, ui.choiceGame).ok) { ui.choicePick = null; ui.choiceGame = null; } break;
        case 'turns': ui.popup = { kind: 'turns', leg: v.leg !== null ? v.leg : Math.max(0, v.legs.length - 1) }; ui.typed = ''; ui.cur = []; break;
        case 'turnsLeg': ui.popup = { kind: 'turns', leg: Number(val) }; break;
        case 'edit': if (opts.lockTurns && v.winner) break; ui.popup = { kind: 'edit', leg: ui.popup ? ui.popup.leg : v.leg, turnId: val, error: null }; ui.typed = ''; ui.cur = []; break;
        case 'closeEdit': ui.popup = { kind: 'turns', leg: ui.popup.leg }; ui.typed = ''; ui.cur = []; break;
        case 'editBust':
        case 'editGo': {
          if (opts.lockTurns && v.winner) { ui.popup = { kind: 'turns', leg: ui.popup.leg }; ui.typed = ''; ui.cur = []; break; }
          var change = a === 'editBust' ? { bust: true } : (ui.cur.length ? { darts: ui.cur } : { score: Number(ui.typed) });
          var r = match.editTurn(ui.popup.turnId, change);
          if (r.ok) { ui.popup = { kind: 'turns', leg: ui.popup.leg }; ui.typed = ''; ui.cur = []; }
          else ui.popup.error = r.code;
          break;
        }
        case 'gear': ui.popup = { kind: 'gear' }; break;
        case 'gearBtn': ui.popup = { kind: 'confirm', i: Number(val) }; break;
        case 'gearYes': {
          var btn = (opts.gearButtons || [])[ui.popup && ui.popup.i];
          ui.popup = null;
          if (btn && opts.onAction) { opts.onAction(btn.act); return; }
          break;
        }
        case 'mode': mode = val === 'darts' ? 'darts' : 'total'; ui.cur = []; ui.typed = ''; if (opts.onPrefs) opts.onPrefs({ mode: mode, hints: hints }); break;
        case 'hints': hints = !hints; match.setHints && match.setHints(hints); if (opts.onPrefs) opts.onPrefs({ mode: mode, hints: hints }); break;
        case 'closePop': ui.popup = null; ui.typed = ''; ui.cur = []; break;
        case 'back':
          if (ui.popup) { ui.popup = null; ui.typed = ''; ui.cur = []; break; }
          if (opts.onAction) opts.onAction('back');
          break;
        default:
          if (opts.onAction) opts.onAction(a, val);
          return;
      }
      changed(before);
      refresh();
    }

    root.addEventListener('click', function (ev) {
      var el = ev.target && ev.target.closest ? ev.target.closest('[data-act]') : null;
      if (!el || el.hasAttribute('disabled')) return;
      handle(el.getAttribute('data-act'), el.getAttribute('data-v'));
    });
    // Turning the tablet or resizing the window redraws when it crosses between upright and wide; the listeners go
    // once this screen is no longer on the page (New game draws a fresh one).
    function gone() { return root.isConnected === false; }
    if (typeof window !== 'undefined' && window.addEventListener) {
      var onResize = function () {
        if (gone()) { window.removeEventListener('resize', onResize); window.removeEventListener('orientationchange', onResize); return; }
        if (isWide() !== wideNow) refresh(); else fit(root.firstChild);
      };
      window.addEventListener('resize', onResize);
      window.addEventListener('orientationchange', onResize);
    }
    // A keyboard (laptop, tablet keyboard): digits, Backspace and Enter key a turn total or a change; Escape closes a
    // pop-up. Not while typing in a box, nor on screens without the number pad.
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('keydown', function onKey(ev) {
        if (gone()) { document.removeEventListener('keydown', onKey); return; }
        var t = ev.target, tag = t && t.tagName ? String(t.tagName).toLowerCase() : '';
        if (tag === 'input' || tag === 'textarea' || ev.ctrlKey || ev.metaKey || ev.altKey) return;
        var a = keyAct(ev.key);
        if (!a) return;
        if (ev.preventDefault) ev.preventDefault();
        handle(a[0], a[1]);
      });
    }
    function keyAct(k) {
      var v = match.view(), p = ui.popup, editing = p && p.kind === 'edit';
      if (k === 'Escape') return editing ? ['closeEdit'] : p ? ['closePop'] : null;
      var x01Edit = editing && !ui.cur.length && match.legTurns && (function () {
        var rows = match.legTurns(p.leg), first = rows[0] && (rows[0].a || rows[0].b);
        return !(first && first.marks !== null && first.marks !== undefined);
      })();
      var typing = x01Edit || (!p && v.ask === 'turn' && v.game === 'x01' && mode === 'total' && !v.pending && !v.askBust);
      if (!typing) return null;
      if (/^[0-9]$/.test(k)) return ['digit', k];
      if (k === 'Backspace') return ['del'];
      if (k === 'Enter') return [editing ? 'editGo' : 'submit'];
      return null;
    }
    refresh();
    return { refresh: refresh, act: handle, setMatch: function (m) { match = m; ui = { typed: '', cur: [], mult: 1, popup: null, asked: null, choicePick: null, choiceGame: null }; match.setHints && match.setHints(hints); refresh(); } };
  }

  return { esc: esc, fmt: fmt, render: render, mount: mount, fit: fit, isWide: isWide, dartName: dartName, QUICK: QUICK, ICON: ICON, other: other };
});

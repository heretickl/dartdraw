/* Casual play (spec docs/superpowers/specs/2026-11-03-casual-play-design.md): two players, names typed in, the game
   picked by hand, no marker, nothing sent anywhere. The setup screen is drawn here; the bull, the scoring and the result
   are the shared scoring screens (scoring-screens.js) on a match from scoring-model.js.

   The game in progress is kept on the phone (key dd-casual-v1: the picks, the match's events, which screen), so a reload
   or a locked phone reopens it; New game clears it. Settings (turn total / dart by dart, checkout hints) are kept under
   dd-casual-prefs. Storage that throws (private mode) is ignored: the game still plays. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DDCasual = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var KEY = 'dd-casual-v1', PREFS = 'dd-casual-prefs';
  var GAMES = ['501', 'cricket', 'choice'], BESTS = [1, 3, 5, 7, 9];
  function g() { return typeof self !== 'undefined' ? self : global; }
  function Scoring() { return g().DDScoring; }
  function Screens() { return g().DDScreens; }

  /* null when both names are fine; trimmed, compared ignoring case. */
  function checkNames(a, b) {
    a = String(a || '').trim(); b = String(b || '').trim();
    if (!a || !b) return 'name_missing';
    if (a.toLowerCase() === b.toLowerCase()) return 'name_same';
    return null;
  }

  function cleanPicks(p) {
    p = p || {};
    // Choice: the game of each leg before the last (best of 9 has 8), 501 and Cricket in turn until changed
    var legs = [];
    for (var i = 0; i < 8; i++) legs.push(Array.isArray(p.legs) && (p.legs[i] === 'x01' || p.legs[i] === 'cricket') ? p.legs[i] : (i % 2 ? 'cricket' : 'x01'));
    return {
      a: typeof p.a === 'string' ? p.a.slice(0, 20) : '', b: typeof p.b === 'string' ? p.b.slice(0, 20) : '',
      game: GAMES.indexOf(p.game) >= 0 ? p.game : '501', bestOf: BESTS.indexOf(Number(p.bestOf)) >= 0 ? Number(p.bestOf) : 5,
      legs: legs
    };
  }
  function save(storage, data) { try { storage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* private mode: play on */ } }
  function load(storage) {
    var raw = null;
    try { raw = JSON.parse(storage.getItem(KEY)); } catch (e) { return null; }
    if (!raw || typeof raw !== 'object') return null;
    var picks = cleanPicks(raw.picks), game = raw.screen === 'game' && Array.isArray(raw.events) && !checkNames(picks.a, picks.b);
    return { picks: picks, events: game ? raw.events : null, screen: game ? 'game' : 'setup' };
  }
  function loadPrefs(storage) {
    try {
      var p = JSON.parse(storage.getItem(PREFS)) || {};
      return { mode: p.mode === 'darts' ? 'darts' : 'total', hints: p.hints === true };
    } catch (e) { return { mode: 'total', hints: false }; }
  }

  function names(picks) { return { a: picks.a.trim(), b: picks.b.trim() }; }
  function matchFrom(data, hints) {
    return Scoring().create({ format: Scoring().formatFor({ game: data.picks.game, bestOf: data.picks.bestOf, legs: data.picks.legs }), names: names(data.picks), events: data.events || [], hints: !!hints });
  }
  function headerFor(picks, w) {
    var key = 'line3' + (picks.game === '501' ? 'x01' : picks.game) + (picks.bestOf === 1 ? 'one' : '');
    return { title: w.appName, line2: w.casualPlay, line3: Screens().fmt(w[key], { n: picks.bestOf }) };
  }

  /* ---------- the setup screen (CSetup) ---------- */

  function renderSetup(picks, w) {
    var esc = Screens().esc, fmt = Screens().fmt;
    var games = [['501', w.setup501, w.setup501Sub], ['cricket', w.setupCricket, w.setupCricketSub], ['choice', w.setupChoice, w.setupChoiceSub]].map(function (x) {
      return '<button class="opt' + (picks.game === x[0] ? ' on' : '') + '" data-cs="game" data-v="' + x[0] + '"><b>' + esc(x[1]) + '</b><span>' + esc(x[2]) + '</span></button>';
    }).join('');
    var bests = BESTS.map(function (n) {
      return '<button class="opt' + (picks.bestOf === n ? ' on' : '') + '" data-cs="best" data-v="' + n + '"><b>' + n + '</b><span>' + esc(n === 1 ? w.leg1 : w.legsN) + '</span></button>';
    }).join('');
    // Choice: pick 501 or Cricket for every leg but the last, which is always the Choice leg (owner 2026-11-04)
    var legs = '';
    if (picks.game === 'choice') {
      for (var i = 0; i < picks.bestOf; i++) {
        var row = i < picks.bestOf - 1
          ? [['x01', w.game501], ['cricket', w.gameCricket]].map(function (x) {
            return '<button class="opt' + (picks.legs[i] === x[0] ? ' on' : '') + '" data-cs="leg" data-v="' + i + ':' + x[0] + '"><b>' + esc(x[1]) + '</b></button>';
          }).join('')
          : '<div class="lc">' + esc(w.legChoice) + '</div>';
        legs += '<div class="lrow"><span class="ln">' + esc(fmt(w.legN, { n: i + 1 })) + '</span>' + row + '</div>';
      }
      legs = '<div class="legs">' + legs + '</div>';
    }
    var name = function (id, side, val, label) {
      return '<label class="nm side-' + side + '"><input id="' + id + '" type="text" maxlength="20" autocomplete="off" autocapitalize="words" spellcheck="false" placeholder="'
        + esc(w.namePlaceholder) + '" value="' + esc(val) + '"><span>' + esc(label) + '</span></label>';
    };
    return '<div class="dds cs"><header class="dds-hd"><span></span><div class="ttl"><div class="t1">' + esc(w.appName) + '</div><div class="t2">' + esc(w.casualPlay)
      + '</div></div><span></span></header>'
      + '<h3>' + esc(w.players) + '</h3>' + name('csA', 'a', picks.a, w.player1) + name('csB', 'b', picks.b, w.player2)
      + '<h3>' + esc(w.game) + '</h3><div class="games">' + games + '</div>'
      + '<h3>' + esc(w.bestOf) + '</h3><div class="bests">' + bests + '</div>' + legs
      + '<p class="first">' + esc(picks.bestOf === 1 ? w.firstTo1 : fmt(w.firstTo, { n: Math.floor(picks.bestOf / 2) + 1 })) + '</p>'
      + '<p class="cserr"></p><p class="nextb">' + esc(w.nextBull) + '</p>'
      + '<button class="red go" data-cs="start">' + esc(w.startGame) + '</button></div>';
  }

  /* ---------- the page ---------- */

  function start(root, opts) {
    var storage = opts.storage, w = opts.words;
    var data = load(storage) || { picks: cleanPicks(null), events: null, screen: 'setup' };
    var prefs = loadPrefs(storage);
    var match = null, screen = null;

    function keep() { save(storage, data); }
    function setupState() {
      var err = checkNames(data.picks.a, data.picks.b), btn = root.querySelector('[data-cs="start"]'), msg = root.querySelector('.cserr');
      if (btn) { if (err) btn.setAttribute('disabled', ''); else btn.removeAttribute('disabled'); }
      if (msg) msg.textContent = err === 'name_same' ? w.err_name_same : '';
    }
    function showSetup() {
      screen = null; match = null;
      root.innerHTML = renderSetup(data.picks, w);
      zoom();
      setupState();
    }
    function zoom() { Screens().fit(root.firstChild); }
    function showGame() {
      match = matchFrom(data, prefs.hints);
      root.innerHTML = '<div class="cg"></div>';
      screen = Screens().mount(root.firstChild, match, {
        words: w, header: headerFor(data.picks, w), pill: null, mode: prefs.mode, hints: prefs.hints,
        summaryButtons: [{ label: w.newGame, act: 'newGame' }, { label: w.rematch, act: 'rematch', main: true }],
        gearButtons: [{ label: w.endGame, act: 'endGame', confirm: { title: w.endTitle, text: w.endText, yes: w.endYes } }],
        onChange: function (m) { data.events = m.events(); keep(); },
        onPrefs: function (p) { prefs = { mode: p.mode, hints: p.hints }; try { storage.setItem(PREFS, JSON.stringify(prefs)); } catch (e) { /* play on */ } },
        onAction: action
      });
    }
    function action(a) {
      var v = match.view();
      if (a === 'back') {
        // Before the first turn the back arrow returns to setup; once the game is on (and on the result), it opens
        // the leg's turns, so a mistake can be checked and fixed instead of losing the game.
        if (v.ask === 'bull' && v.bull.leg === 0) { data.screen = 'setup'; data.events = null; keep(); showSetup(); }
        else screen.act('turns');
      } else if (a === 'newGame' || a === 'endGame') {
        data.screen = 'setup'; data.events = null; keep(); showSetup();
      } else if (a === 'rematch') {
        data.screen = 'game'; data.events = []; keep(); showGame();
      }
    }

    root.addEventListener('input', function (ev) {
      var t = ev.target;
      if (!t || (t.id !== 'csA' && t.id !== 'csB')) return;
      data.picks[t.id === 'csA' ? 'a' : 'b'] = String(t.value).slice(0, 20);
      keep(); setupState();
    });
    root.addEventListener('click', function (ev) {
      var el = ev.target && ev.target.closest ? ev.target.closest('[data-cs]') : null;
      if (!el || el.hasAttribute('disabled')) return;
      var k = el.getAttribute('data-cs'), val = el.getAttribute('data-v');
      if (k === 'game') { data.picks.game = val; keep(); showSetup(); }
      else if (k === 'best') { data.picks.bestOf = Number(val); keep(); showSetup(); }
      else if (k === 'leg') { var p = String(val).split(':'); data.picks.legs[Number(p[0])] = p[1]; keep(); showSetup(); }
      else if (k === 'start' && !checkNames(data.picks.a, data.picks.b)) { data.screen = 'game'; data.events = []; keep(); showGame(); }
    });

    if (data.screen === 'game') showGame(); else showSetup();
    return { match: function () { return match; }, data: function () { return data; } };
  }

  return { start: start, checkNames: checkNames, save: save, load: load, matchFrom: matchFrom, headerFor: headerFor, renderSetup: renderSetup, KEY: KEY };
});

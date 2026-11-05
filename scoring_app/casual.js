/* Casual play (spec docs/superpowers/specs/2026-11-03-casual-play-design.md): two players, names typed in, the game
   picked by hand, no marker, nothing sent anywhere. The setup screen is drawn here; the bull, the scoring and the result
   are the shared scoring screens (scoring-screens.js) on a match from scoring-model.js.

   The game in progress is kept on the phone (key dd-casual-v1: the picks, the match's events, which screen), so a reload
   or a locked phone reopens it; New game clears it. Settings (turn total / dart by dart, checkout hints) are kept under
   dd-casual-prefs. Storage that throws (private mode) is ignored: the game still plays.

   Logged in (opts.player, spec docs/superpowers/specs/2026-11-04-accounts-scorecard-venue-design.md, approved mockup
   docs/design/friends-mockup.html screen 1): Player 1 is the player, locked; Player 2 is chosen from their friends, their
   recent opponents, or a guest (the Choose opponent panel, opponent.js). The game kept in dd-casual-v1 then also carries
   owner (the player's id), opp (Player 2), gameId (a lowercase uuid made at the start, so a reload keeps it and a game
   sent twice is stored once) and save (what happened to it). At match over it is sent to POST /api/games/save; with no
   signal (or the server failing, or the session gone) it waits in the phone's save queue (net.js) and a line under the
   result says so. Guests: none of this; their setup, screens and storage are exactly as before, and a logged-in game
   left on the phone is not theirs to reopen. */
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

  /* ---------- logged in ---------- */

  /* A new game's id: the server takes lowercase uuids only (8-4-4-4-12 hex). randomUUID is lowercase; without it (an
     older phone, a page not on https) a version-4 uuid of the same shape is made from random numbers. */
  function newId() {
    var c = g().crypto;
    if (c && typeof c.randomUUID === 'function') { try { return String(c.randomUUID()).toLowerCase(); } catch (e) { /* below */ } }
    var h = '', i;
    for (i = 0; i < 32; i++) h += Math.floor(Math.random() * 16).toString(16);
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-4' + h.slice(13, 16) + '-' + '89ab'.charAt(Math.floor(Math.random() * 4)) + h.slice(17, 20) + '-' + h.slice(20, 32);
  }
  function clip(s, n) { return Array.from(String(s == null ? '' : s).trim()).slice(0, n).join(''); }
  function initialsOf(full) {
    var p = String(full || '').trim().split(/\s+/);
    return ((p[0] || '').charAt(0) + (p.length > 1 ? p[p.length - 1].charAt(0) : '')).toUpperCase() || '?';
  }
  /* The name the player plays under (the scoring screens show it; the server reads side A's from the events). */
  function myName(player) { return clip(player.firstName || player.lastName || '', 20) || '?'; }
  /* Player 2's name in the game: what the player calls them, made different from Player 1's (the events must name the two
     sides differently): the full name, else a 2 on the end. */
  function oppName(opp, mine) {
    var same = function (x) { return x.toLowerCase() === mine.toLowerCase(); };
    var n = clip(opp.name, 20);
    if (same(n) && opp.full) n = clip(opp.full, 20);
    if (same(n)) n = clip(n, 18) + ' 2';
    return n;
  }
  /* The opponent as kept: a friend { id, name, full, badge } or a guest { guest: true, name }; anything else is none. */
  function cleanOpp(o) {
    if (!o || typeof o !== 'object' || typeof o.name !== 'string' || !o.name.trim()) return null;
    if (o.guest === true) return { guest: true, name: clip(o.name, 20) };
    if (typeof o.id !== 'string' || !o.id) return null;
    return { id: o.id, name: clip(o.name, 20), full: typeof o.full === 'string' ? o.full.slice(0, 100) : '', badge: ['linked', 'waiting', 'none'].indexOf(o.badge) >= 0 ? o.badge : 'none' };
  }
  var SAVES = ['saved', 'held', 'mine', 'queued', 'relogin', 'dropped'];
  /* The line under the result for what happened to the save (null: nothing to say). */
  function savedLine(state, opp, w) {
    var name = opp ? opp.name : '';
    if (state === 'saved') return Screens().fmt(w.savedBoth, { name: name });
    if (state === 'held') return Screens().fmt(w.savedHeld, { name: name });
    if (state === 'mine') return w.savedMine;
    if (state === 'queued') return w.savedLater;
    if (state === 'relogin') return { text: w.savedRelogin, label: w.savedLoginBtn, act: 'relogin' };
    // Refused for good: said plainly, so a game that did not count is never a silent loss.
    if (state === 'dropped') return w.saveDropped;
    return null;
  }
  var LOCK = '<svg class="lk" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
  /* Player 1 (the player, locked) and Player 2 (a button opening Choose opponent) on the logged-in setup screen. Player 2
     shows its badge, so the players know before they start whether the game counts for the friend too. */
  function renderPlayers(me, w) {
    var esc = Screens().esc, opp = me.opp;
    var a = '<div class="nm side-a me"><span class="ini">' + esc(initialsOf(me.full || me.name)) + '</span><b>' + esc(me.name) + '</b><span class="al">'
      + esc(w.alwaysCounts) + '</span>' + LOCK + '</div>';
    var b;
    if (!opp) b = '<button class="nm side-b pick" data-cs="opp">' + esc(w.chooseOpp) + '</button>';
    else {
      var k = opp.guest ? 'g' : opp.badge === 'linked' ? 'l' : opp.badge === 'waiting' ? 'w' : 'n';
      var tag = opp.guest ? '<span class="al">' + esc(w.guestNothing) + '</span>'
        : '<span class="bdg ' + k + '"><i></i>' + esc(k === 'l' ? w.frLinked : k === 'w' ? w.frWaiting : w.frNoAccount) + '</span>';
      b = '<button class="nm side-b chosen" data-cs="opp" aria-label="' + esc(w.changeOpp) + '"><span class="ini ' + k + '">' + esc(initialsOf(opp.full || opp.name))
        + '</span><b>' + esc(opp.name) + '</b>' + tag + '</button>';
    }
    return '<h3 class="pl">' + esc(w.player1You) + '</h3>' + a + '<h3 class="pl">' + esc(w.player2) + '</h3>' + b;
  }

  /* ---------- the setup screen (CSetup) ---------- */

  /* me (logged in only): { name, full, opp }: the two players are drawn by renderPlayers instead of the name boxes. */
  function renderSetup(picks, w, me) {
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
    return '<div class="dds cs' + (me ? ' acct' : '') + '"><header class="dds-hd"><span></span><div class="ttl"><div class="t1">' + esc(w.appName) + '</div><div class="t2">' + esc(w.casualPlay)
      + '</div></div><span></span></header>'
      + (me ? renderPlayers(me, w) : '<h3>' + esc(w.players) + '</h3>' + name('csA', 'a', picks.a, w.player1) + name('csB', 'b', picks.b, w.player2))
      + '<h3>' + esc(w.game) + '</h3><div class="games">' + games + '</div>'
      + '<h3>' + esc(w.bestOf) + '</h3><div class="bests">' + bests + '</div>' + legs
      + '<p class="first">' + esc(picks.bestOf === 1 ? w.firstTo1 : fmt(w.firstTo, { n: Math.floor(picks.bestOf / 2) + 1 })) + '</p>'
      + '<p class="cserr"></p><p class="nextb">' + esc(w.nextBull) + '</p>'
      + '<button class="red go" data-cs="start">' + esc(w.startGame) + '</button></div>';
  }

  /* ---------- the page ---------- */

  function readRaw(storage) {
    try { var raw = JSON.parse(storage.getItem(KEY)); return raw && typeof raw === 'object' ? raw : null; } catch (e) { return null; }
  }
  /* The kept game for a logged-in player: their own game as it was left (its names as played, so a name changed since
     does not split a side in two), or a fresh setup with the last game picks and no opponent. */
  function loadAcct(storage, player) {
    var raw = readRaw(storage), base = load(storage), me = myName(player);
    var picks = cleanPicks(base ? { game: base.picks.game, bestOf: base.picks.bestOf, legs: base.picks.legs } : null);
    picks.a = me;
    var data = { picks: picks, events: null, screen: 'setup', owner: player.id, opp: null, gameId: null, save: null, playedAt: null };
    if (!raw || !base || raw.owner !== player.id) return data;
    data.opp = cleanOpp(raw.opp);
    if (base.screen === 'game' && data.opp) {
      data.picks = base.picks; data.events = base.events; data.screen = 'game';
      data.gameId = typeof raw.gameId === 'string' && ID_RE.test(raw.gameId) ? raw.gameId : newId();
      data.save = SAVES.indexOf(raw.save) >= 0 ? raw.save : null;
      data.playedAt = typeof raw.playedAt === 'string' ? raw.playedAt : null;
    } else if (data.opp) data.picks.b = oppName(data.opp, me);
    return data;
  }
  var ID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

  /* opts: { storage, words, player?, ctx?, net?, playWith?, onRelogin? }. Logged in (player): ctx is the app's (the
     Choose opponent panel's api and words), net is DDNet (the save and its queue), playWith a friend from the friend card's
     "Play <nickname>" ({ friendshipId, nickname, name, badge }) to start with as Player 2, onRelogin() opens log in. */
  function start(root, opts) {
    var storage = opts.storage, w = opts.words, player = opts.player || null;
    var data;
    if (player) data = loadAcct(storage, player);
    else {
      data = load(storage) || { picks: cleanPicks(null), events: null, screen: 'setup' };
      // A logged-in player's game left on the phone is not a guest's to go on with: a fresh setup (the game picks kept).
      var raw = readRaw(storage);
      if (raw && raw.owner) data = { picks: cleanPicks({ game: data.picks.game, bestOf: data.picks.bestOf, legs: data.picks.legs }), events: null, screen: 'setup' };
    }
    var prefs = loadPrefs(storage);
    var match = null, screen = null, mopts = null, chooser = null, sendingId = null;   // sendingId: the game whose save is on its way
    var doc = root.ownerDocument || (typeof document !== 'undefined' ? document : null);
    var me = player ? { name: myName(player), full: (String(player.firstName || '') + ' ' + String(player.lastName || '')).trim() } : null;

    function keep() { save(storage, data); }
    function setupState() {
      var err = player && !data.opp ? 'name_missing' : checkNames(data.picks.a, data.picks.b), btn = root.querySelector('[data-cs="start"]'), msg = root.querySelector('.cserr');
      if (btn) { if (err) btn.setAttribute('disabled', ''); else btn.removeAttribute('disabled'); }
      if (msg) msg.textContent = err === 'name_same' ? w.err_name_same : '';
    }
    function showSetup() {
      screen = null; match = null; mopts = null; chooser = null;
      root.innerHTML = renderSetup(data.picks, w, me ? { name: me.name, full: me.full, opp: data.opp } : undefined);
      zoom();
      setupState();
    }
    function zoom() { Screens().fit(root.firstChild); }
    function showGame() {
      match = matchFrom(data, prefs.hints);
      root.innerHTML = '<div class="cg"></div>';
      mopts = {
        words: w, header: headerFor(data.picks, w), pill: null, mode: prefs.mode, hints: prefs.hints,
        summaryButtons: [{ label: w.newGame, act: 'newGame' }, { label: w.rematch, act: 'rematch', main: true }],
        gearButtons: [{ label: w.endGame, act: 'endGame', confirm: { title: w.endTitle, text: w.endText, yes: w.endYes } }],
        onChange: function (m) { data.events = m.events(); keep(); if (!data.save) over(); },
        onPrefs: function (p) { prefs = { mode: p.mode, hints: p.hints }; try { storage.setItem(PREFS, JSON.stringify(prefs)); } catch (e) { /* play on */ } },
        onAction: action
      };
      if (player) { mopts.savedLine = savedLine(data.save, data.opp, w); mopts.lockTurns = locked(); }
      screen = Screens().mount(root.firstChild, match, mopts);
      // Reopened at the result: a game not sent yet, or still waiting, is sent now (the server stores an id once).
      if (!data.save || data.save === 'queued' || data.save === 'relogin') over();
    }
    function action(a) {
      var v = match.view();
      if (a === 'back') {
        // Before the first turn the back arrow returns to setup; once the game is on (and on the result), it opens
        // the leg's turns, so a mistake can be checked and fixed instead of losing the game.
        if (v.ask === 'bull' && v.bull.leg === 0) { data.screen = 'setup'; data.events = null; fresh(null); keep(); showSetup(); }
        else screen.act('turns');
      } else if (a === 'newGame' || a === 'endGame') {
        // Ending early (or a new game from the result) sends nothing more: only a finished match is ever saved.
        data.screen = 'setup'; data.events = null; fresh(null); keep(); showSetup();
      } else if (a === 'rematch') {
        data.screen = 'game'; data.events = []; fresh(newId()); keep(); showGame();
      } else if (a === 'relogin' && opts.onRelogin) {
        opts.onRelogin();
      }
    }
    /* A logged-in game's id and save state, for a new game (id) or none yet (null). */
    function fresh(id) {
      if (!player) return;
      data.gameId = id; data.save = null; data.playedAt = null;
    }

    /* ---- logged in: saving the finished game ---- */

    /* The result's turns are locked once the game has gone to the server or the queue: a change after that would never
       reach the scorecard. Not for guests, nor for a game the server refused (nothing was saved). */
    function locked() { return !!(player && (sendingId === data.gameId || (data.save && data.save !== 'dropped'))); }
    function show(st) {
      if (!mopts || !screen) return;
      mopts.savedLine = savedLine(st, data.opp, w); mopts.lockTurns = locked(); screen.refresh();
    }
    function bodyFor(id) {
      return {
        id: id, format: Scoring().formatFor({ game: data.picks.game, bestOf: data.picks.bestOf, legs: data.picks.legs }), events: match.events(),
        playedAt: data.playedAt, sideA: { me: true }, sideB: data.opp.guest ? { guest: data.opp.name } : { friendshipId: data.opp.id }
      };
    }
    function over() {
      if (!player || !match || !match.view().winner || !data.opp || !data.gameId || !opts.net) return;
      var id = data.gameId, net = opts.net;
      if (sendingId === id) return;   // already on its way
      if (!data.playedAt) { data.playedAt = new Date().toISOString(); keep(); }
      var body = bodyFor(id);
      if (sendingId) {
        // The last game's save is still on its way (a quick rematch): this one waits in the queue, and is sent as soon
        // as that answer is back (below), or by the queue's own flush.
        net.queue.add({ id: id, player: player.id, game: body });
        data.save = 'queued'; keep(); show('queued');
        return;
      }
      sendingId = id;
      show(data.save);
      net.api('/api/games/save', { method: 'POST', body: body }).then(function (r) {
        sendingId = null;
        var st;
        if (r.ok && r.body && r.body.saved) {
          var f = r.body.saved.friend;
          st = f === 'saved' ? 'saved' : f === 'held' ? 'held' : 'mine';
          net.queue.remove(id);   // it may have waited there (offline earlier): saved now, so not sent again
        } else if (r.status === 0 || r.status >= 500 || r.status === 429) {
          // No signal, or the server failing: it waits on the phone and goes at start-up / back online (app.js).
          net.queue.add({ id: id, player: player.id, game: body }); st = 'queued';
        } else if (r.status === 401 || r.status === 403) {
          // The session ran out during the game: kept, and sent once the player has logged in again.
          net.queue.add({ id: id, player: player.id, game: body }); st = 'relogin';
        } else {
          // Refused for good (the server will never take this one): nothing to retry, nothing to show.
          if (typeof console !== 'undefined') console.warn('casual game not saved', r.status, r.body && r.body.code);
          net.queue.remove(id);
          st = 'dropped';
        }
        if (data.gameId !== id) {
          // A new game was started meanwhile: the answer belonged to the old one. A new game that finished and was queued
          // in the meantime goes now.
          if (data.save === 'queued' && st !== 'queued' && st !== 'relogin') over();
          return;
        }
        data.save = st; keep(); show(st);
      });
    }

    /* ---- logged in: Player 2 ---- */

    function pickOpp(o) {
      data.opp = cleanOpp(o);
      data.picks.b = data.opp ? oppName(data.opp, me.name) : '';
      keep(); showSetup();
    }
    /* A fresh friends list is in hand: a remembered friend whose entry is no longer on it (removed, merged, or the friend
       removed or blocked the player) is not kept as Player 2, so the setup goes back to Choose opponent instead of
       showing an old badge for a game that would not count for them. Only on the setup screen: a game already started
       is saved for the player alone by the server. Answers true when Player 2 was cleared. */
    function checkOpp(friends) {
      if (!Array.isArray(friends) || data.screen !== 'setup' || !data.opp || data.opp.guest) return false;
      var id = data.opp.id;
      if (friends.some(function (f) { return f && f.id === id; })) return false;
      data.opp = null; data.picks.b = ''; keep();
      return true;
    }
    function openChooser() {
      var O = g().DDOpponent;
      if (!O || !opts.ctx || !doc || chooser) return;
      chooser = doc.createElement('div');   // outside the zoomed setup screen: the panel is drawn at the phone's own size
      root.appendChild(chooser);
      var shown = data.opp;
      O.renderChoose(chooser, opts.ctx, { current: data.opp, onList: checkOpp }, function (o) {
        if (chooser && chooser.parentNode) chooser.parentNode.removeChild(chooser);
        chooser = null;
        if (o) pickOpp(o);
        // Closed without a choice after Player 2 was cleared while the panel was open: the setup now shows Choose opponent.
        else if (data.opp !== shown) showSetup();
      });
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
      else if (k === 'opp' && player) openChooser();
      else if (k === 'start' && !checkNames(data.picks.a, data.picks.b) && (!player || data.opp)) { data.screen = 'game'; data.events = []; fresh(newId()); keep(); showGame(); }
    });

    if (player) {
      // From a friend's card ("Play <nickname>"): that friend is Player 2, unless a game with them or another is already on.
      var pw = opts.playWith;
      if (pw && typeof pw.friendshipId === 'string' && (data.screen !== 'game' || !(data.events && data.events.length))) {
        data.screen = 'setup'; data.events = null; fresh(null);
        data.opp = cleanOpp({ id: pw.friendshipId, name: pw.nickname || pw.name || '', full: pw.name || '', badge: pw.badge });
        data.picks.b = data.opp ? oppName(data.opp, me.name) : '';
        keep();
      }
      // Back online with the result on screen and the game waiting: send it now, so the line changes.
      if (typeof window !== 'undefined' && window.addEventListener) {
        var onOnline = function () {
          if (root.isConnected === false) { window.removeEventListener('online', onOnline); return; }
          if (data.save === 'queued' && match && match.view().winner) over();
        };
        window.addEventListener('online', onOnline);
      }
    }
    if (data.screen === 'game') showGame(); else showSetup();
    // The setup opened with a friend remembered as Player 2: their entry is checked against a fresh list (no signal: kept
    // as it is). The setup is redrawn only while it is still on screen with no panel open over it.
    if (player && data.screen === 'setup' && data.opp && !data.opp.guest && opts.ctx && opts.ctx.api) {
      opts.ctx.api('/api/friends/list').then(function (r) {
        if (!(r && r.ok && r.body && Array.isArray(r.body.friends))) return;
        if (checkOpp(r.body.friends) && !screen && !chooser && root.isConnected !== false) showSetup();
      });
    }
    return { match: function () { return match; }, data: function () { return data; } };
  }

  return { start: start, checkNames: checkNames, save: save, load: load, matchFrom: matchFrom, headerFor: headerFor, renderSetup: renderSetup, newId: newId, KEY: KEY };
});

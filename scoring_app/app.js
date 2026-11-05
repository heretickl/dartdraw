/* The scoring app's start-up and its screens by address (spec docs/superpowers/specs/2026-11-04-accounts-scorecard-venue-design.md).
     ''              log in, or the scorecard (scorecard.js) when a player is logged in
     #guest          casual play as a guest: exactly the casual site as before, nothing sent anywhere, works offline
     #play           casual play logged in: Player 1 is the player, the finished game is saved (casual.js)
     #register  #forgot  #resend  #profile  #password
     #verify=<token> #reset=<token>   the links in the e-mails
   Who is logged in comes from GET /api/account/me. The last answer is kept on the phone (dd-player), so with no signal a
   logged-in player still gets their screens; a 401 forgets it. An account with a temporary password (mustChange) only
   gets the change-password screen until it has chosen its own.
   Language: dd-lang ('en' | 'ms', English unless chosen), switched by EN | BM on the account screens.
   Each screen is drawn into a fresh element, so the taps a screen listened for leave with it. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DDApp = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var LANG_KEY = 'dd-lang', PLAYER_KEY = 'dd-player', CASUAL_KEY = 'dd-casual-v1', LOGOUT_KEY = 'dd-logout-pending';
  var ACCOUNT = ['', 'register', 'forgot', 'resend', 'verify', 'reset', 'profile', 'password'];
  function g() { return typeof self !== 'undefined' ? self : global; }

  function wordsFor(lang) { return lang === 'ms' && g().DD_CASUAL_MS ? g().DD_CASUAL_MS : g().DD_CASUAL_EN; }
  function readLang(storage) { try { return storage.getItem(LANG_KEY) === 'ms' ? 'ms' : 'en'; } catch (e) { return 'en'; } }

  /* '#verify=abc' -> { name: 'verify', token: 'abc' }; anything unknown is the start screen. */
  function parseHash(h) {
    h = String(h || '').replace(/^#/, '');
    var m = /^(verify|reset)=(.+)$/.exec(h);
    if (m) { var t = m[2]; try { t = decodeURIComponent(t); } catch (e) { /* keep as typed */ } return { name: m[1], token: t }; }
    return { name: ['guest', 'play', 'register', 'forgot', 'resend', 'profile', 'password'].indexOf(h) >= 0 ? h : '' };
  }

  function readPlayer(storage) {
    try {
      var p = JSON.parse(storage.getItem(PLAYER_KEY));
      return p && typeof p === 'object' && p.id ? p : null;
    } catch (e) { return null; }
  }
  function keepPlayer(storage, p) {
    try { if (p) storage.setItem(PLAYER_KEY, JSON.stringify(p)); else storage.removeItem(PLAYER_KEY); } catch (e) { /* private mode */ }
  }
  /* A guest game left half-played (a reload on the old address, which had no #guest). A logged-in player's game (owner)
     is not a guest's. */
  function guestGameOn(storage) {
    try { var d = JSON.parse(storage.getItem(CASUAL_KEY)); return !!(d && d.screen === 'game' && !d.owner); } catch (e) { return false; }
  }

  /* The logged-in home is the scorecard (scorecard.js). */

  /* opts: { storage, words?, window?, onRoute? }. words fixes the language (tests); otherwise dd-lang picks it. window:
     the browser window for the address and resize (left out in Node: ctx.go then only routes). */
  function start(root, opts) {
    var storage = opts.storage, win = opts.window || null;
    var Net = g().DDNet, Account = g().DDAccount, Casual = g().DDCasual, Screens = g().DDScreens;
    var doc = root.ownerDocument || (typeof document !== 'undefined' ? document : null);
    var hash = win ? win.location.hash : '';
    var flash = null, lastAccount = false, view = null, first = true;
    var held = null;      // a #verify= / #reset= link's token, kept here once it is off the address bar
    var draws = 0, typed = false;   // screens drawn so far; whether anything was typed on this one
    var state = { player: readPlayer(storage) };

    var ctx = {
      lang: readLang(storage),
      words: null, player: state.player, intro: true, wide: false,
      api: Net.api,
      setLang: function (l) {
        ctx.lang = l === 'ms' ? 'ms' : 'en';
        try { storage.setItem(LANG_KEY, ctx.lang); } catch (e) { /* private mode */ }
        setWords();
        redraw();
      },
      setPlayer: function (p) {
        var before = state.player;
        state.player = p || null; ctx.player = state.player; keepPlayer(storage, state.player);
        // Logged in again: that login replaced the old cookie, so a logout still waiting must not end the new session.
        if (state.player) pendingLogout(false);
        // Just logged in (or as someone else): their games waiting on the phone are sent now.
        if (state.player && (!before || before.id !== state.player.id)) Net.queue.flush(state.player.id);
      },
      go: function (h, msg) {
        flash = msg || null;
        held = null;   // leaving the link's screen: the token goes too
        h = h ? (h.charAt(0) === '#' ? h : '#' + h) : '';
        if (win) {
          if (win.location.hash === h || (!h && (win.location.hash === '' || win.location.hash === '#'))) route();
          else win.location.hash = h;   // hashchange draws it, and Back returns here
        } else { hash = h; route(); }
      },
      /* Log out with no signal (account.js): remembered on the phone, sent when the signal is back. */
      logoutLater: function () { pendingLogout(true); }
    };

    /* A logout that could not reach the server (dd-logout-pending). The phone has already forgotten the player; the
       server's session cookie is still valid until this is sent: at start-up before asking who is logged in (else /me
       would log them back in), and when the phone is back online. Queued games stay in the queue meanwhile, and are only
       ever sent for the player logged in. */
    function pendingLogout(on) {
      try { if (on) storage.setItem(LOGOUT_KEY, '1'); else storage.removeItem(LOGOUT_KEY); } catch (e) { /* private mode */ }
    }
    function logoutWaiting() { try { return storage.getItem(LOGOUT_KEY) === '1'; } catch (e) { return false; } }
    var sendingLogout = null;
    function sendLogout() {
      if (sendingLogout) return sendingLogout;
      if (!logoutWaiting()) return Promise.resolve();
      if (state.player) { pendingLogout(false); return Promise.resolve(); }   // someone has logged in since
      sendingLogout = Net.api('/api/account/logout', { method: 'POST', body: {} }).then(function (r) {
        sendingLogout = null;
        if (r.status !== 0) pendingLogout(false);   // any answer: the server has heard it
      });
      return sendingLogout;
    }
    function setWords() {
      ctx.words = opts.words || wordsFor(ctx.lang);
      if (doc && doc.documentElement) { doc.documentElement.lang = ctx.lang; if (ctx.words.pageTitle) doc.title = ctx.words.pageTitle; }
    }
    setWords();

    function fresh() {
      root.innerHTML = '';
      view = doc.createElement('div');
      view.className = 'dd-view';
      root.appendChild(view);
      return view;
    }
    /* The address's screen. A verify / reset token is taken off the address at once (replaceState: no history entry
       keeps it either, and it is never in a Referer), and held in memory for redraws until another screen opens. */
    function current() {
      var r = parseHash(win ? win.location.hash : hash);
      if (r.token) {
        held = r;
        if (win && win.history && win.history.replaceState) win.history.replaceState(null, '', win.location.pathname + win.location.search);
        else hash = '';
        return r;
      }
      return held && !r.name ? held : r;
    }

    /* Draws the screen for the address. Account screens play the opening motion only when arriving from elsewhere. */
    function route() {
      var r = current(), p = state.player, el, opening = first;
      first = false; draws++; typed = false;
      var account = ACCOUNT.indexOf(r.name) >= 0;
      ctx.intro = account && !lastAccount;
      ctx.wide = !!(Screens && Screens.isWide());
      lastAccount = account;
      if (opts.onRoute) opts.onRoute(r.name);

      if (r.name === 'guest') { Casual.start(fresh(), { storage: storage, words: ctx.words }); return; }
      if (r.name === 'register') { Account.renderRegister(fresh(), ctx); }
      else if (r.name === 'forgot') { Account.renderForgot(fresh(), ctx); }
      else if (r.name === 'resend') { Account.renderResend(fresh(), ctx); }
      else if (r.name === 'verify') { Account.renderVerify(fresh(), ctx, r.token); }
      else if (r.name === 'reset') { Account.renderReset(fresh(), ctx, r.token); }
      else if (!p) {
        // Not logged in: '#play', '#profile' and '#password' fall back to log in. Opening the site with a guest game
        // left half-played goes straight back into it, as the site did before it had a login.
        if (opening && r.name === '' && guestGameOn(storage)) { ctx.go('#guest'); return; }
        Account.renderLogin(fresh(), ctx);
      }
      else if (p.mustChange) { Account.renderChangePassword(fresh(), ctx, true); }
      else if (r.name === 'play') {
        // A friend's card's "Play <nickname>" hands that friend over once.
        var pw = ctx.playWith || null;
        ctx.playWith = null;
        Casual.start(fresh(), { storage: storage, words: ctx.words, player: p, ctx: ctx, net: Net, playWith: pw,
          onRelogin: function () { ctx.setPlayer(null); ctx.go(''); } });
        return;
      }
      else if (r.name === 'profile') { Account.renderProfile(fresh(), ctx); }
      else if (r.name === 'password') { Account.renderChangePassword(fresh(), ctx, false); }
      else { g().DDScorecard.renderScorecard(fresh(), ctx); }
      el = view;
      if (flash) { Account.toast(el, flash); flash = null; }
    }

    /* EN | BM redraws the screen in the other language, keeping what was typed. */
    function redraw() {
      var kept = {}, wasTyped = typed, drawn = draws;   // the same screen: not a new one for check()
      if (view) view.querySelectorAll('input').forEach(function (i) { if (i.id && i.getAttribute('type') !== 'password') kept[i.id] = i.value; });
      lastAccount = true;   // the same screen again: no opening motion
      route();
      Object.keys(kept).forEach(function (id) { var i = view.querySelector('#' + id); if (i && kept[id]) i.value = kept[id]; });
      typed = wasTyped; draws = drawn;
    }

    /* Who is logged in, from the server. No answer (offline) or a server error keeps what the phone knew. */
    function check() {
      var drawsAtStart = draws;
      return sendLogout().then(function () {
        // Still not sent (no signal): nobody is logged in on this phone, whatever the cookie says.
        return logoutWaiting() ? { ok: false, status: 0 } : Net.api('/api/account/me');
      }).then(function (r) {
        var before = state.player;
        if (r.ok && r.body && r.body.player) ctx.setPlayer(r.body.player);
        else if (r.status === 401) ctx.setPlayer(null);
        else return;
        // Redraw only when it changes what the start-up screens show (the account links never need the session), and
        // never over a screen the player has moved on from or started filling in.
        if (draws !== drawsAtStart || typed || formBusy()) return;
        var name = current().name;
        var now = state.player;
        var changed = !!before !== !!now || (now && before && !!before.mustChange !== !!now.mustChange);
        // A session that ran out during casual play does not end the game (ruling 2026-11-05): the player plays on, and
        // the save at match over waits and asks them to log in again.
        if (name === 'play' && !now) return;
        if (changed && ['', 'play', 'profile', 'password'].indexOf(name) >= 0) route();
      });
    }
    function formBusy() { return !!(view && view.querySelector('.go.busy')); }
    root.addEventListener('input', function () { typed = true; });

    if (win) {
      win.addEventListener('hashchange', function () { held = null; route(); });
      win.addEventListener('online', function () { sendLogout(); });
      // The account screens follow the same upright / wide rule as the scoring screens.
      win.addEventListener('resize', function () {
        var acc = view && view.querySelector('.acc');
        if (acc && Screens) { if (Screens.isWide()) acc.classList.add('wide'); else acc.classList.remove('wide'); }
      });
    }
    route();
    var ready = check().then(function () {
      if (state.player) return Net.queue.flush(state.player.id);
    });
    return { ctx: ctx, route: route, ready: ready, view: function () { return view; } };
  }

  /* The page's start: storage that may throw (private mode), the app, the scoring screens' fit on resize, the offline
     copy (sw.js), and the saving of queued games when the signal comes back. */
  function boot(rootEl) {
    var storage = null;
    try { storage = window.localStorage; storage.getItem(LANG_KEY); }
    catch (e) { storage = { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} }; }
    g().DDNet.init({ storage: storage });
    var app = start(rootEl, { storage: storage, window: window });
    window.addEventListener('resize', function () { g().DDScreens.fit(rootEl.querySelector('.dds')); });
    window.addEventListener('online', function () { var p = app.ctx.player; if (p) g().DDNet.queue.flush(p.id); });
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(function () {});
    return app;
  }

  return { start: start, boot: boot, parseHash: parseHash, wordsFor: wordsFor, LANG_KEY: LANG_KEY, PLAYER_KEY: PLAYER_KEY };
});

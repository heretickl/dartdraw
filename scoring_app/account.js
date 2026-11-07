/* The player account screens of the scoring app: log in, create an account, confirm the email, forgot / new password,
   change password and the profile (spec docs/superpowers/specs/2026-11-04-accounts-scorecard-venue-design.md). The look
   and the motion are the approved login mockup (docs/design/login-mockup.html): the dartboard with the dart thrown in and
   its ripples, the shining logo, the moving card edge, floating labels, the error shake; a wide screen puts the board on
   the left and the form on the right. account.css holds the look; reduced motion switches the animations off there.

   Every screen is drawn into root (a fresh element each time, given by app.js) from ctx:
     ctx.words, ctx.lang ('en' | 'ms'), ctx.setLang(lang)   the words and the EN | BM switch
     ctx.go(hash, flash)        open another screen (flash: a short message shown there)
     ctx.api(path, { body })    DDNet.api: { ok, status, body }, never throws
     ctx.player, ctx.setPlayer(p | null)   who is logged in (app.js keeps it)
     ctx.intro, ctx.wide        play the opening motion; side-by-side layout
   Every word comes from the words file; server errors are shown by their code (err_<code>), never the server's English.
   Typed text is only ever put on the page escaped. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DDAccount = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var ORGANISER_APP = 'https://dartdraw.vercel.app/app';
  var MIN_PASSWORD = 8, MAX_NAME = 40;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function fmt(s, v) {
    return String(s == null ? '' : s).replace(/\{(\w+)\}/g, function (m, k) { return v && v[k] != null ? String(v[k]) : m; });
  }

  var SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
  var ICON = {
    user: SVG + ' class="ic"><path d="M3 21v-2a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    lock: SVG + ' class="ic"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    mail: SVG + ' class="ic"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
    eye: SVG + ' width="22" height="22"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    target: SVG + ' width="24" height="24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></svg>',
    arrow: '<svg class="ar" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'
  };

  /* The mockup's dartboard: 20 segments, the treble and double rings in blue and gold, bull in the middle; the dart
     flies in from the top right and its ripples spread from the bull. Built once: the same for every screen. */
  var board = null;
  function boardSvg() {
    if (board) return board;
    function arc(r1, r2, a0, a1) {
      var R = Math.PI / 180, c = Math.cos, n = Math.sin, f = function (x) { return Math.round(x * 100) / 100; };
      a0 *= R; a1 *= R;
      return 'M' + f(r1 * c(a0)) + ' ' + f(r1 * n(a0)) + 'L' + f(r2 * c(a0)) + ' ' + f(r2 * n(a0)) + 'A' + r2 + ' ' + r2 + ' 0 0 1 ' + f(r2 * c(a1)) + ' ' + f(r2 * n(a1))
        + 'L' + f(r1 * c(a1)) + ' ' + f(r1 * n(a1)) + 'A' + r1 + ' ' + r1 + ' 0 0 0 ' + f(r1 * c(a0)) + ' ' + f(r1 * n(a0)) + 'Z';
    }
    var s = '<circle r="196" fill="#0a0f15" stroke="rgba(255,255,255,.12)" stroke-width="2"/>';
    for (var i = 0; i < 20; i++) {
      var a = i * 18 - 99, b = a + 18, odd = i % 2, ring = odd ? 'rgba(34,180,255,.55)' : 'rgba(255,198,26,.55)';
      s += '<path d="' + arc(30, 150, a, b) + '" fill="' + (odd ? '#111922' : '#1a2430') + '"/>'
        + '<path d="' + arc(150, 170, a, b) + '" fill="' + ring + '"/>'
        + '<path d="' + arc(88, 102, a, b) + '" fill="' + ring + '"/>'
        + '<path d="' + arc(30, 170, a, a + 0.4) + '" fill="rgba(255,255,255,.18)"/>';
    }
    s += '<circle r="30" fill="#22b4ff" opacity=".8"/><circle r="13" fill="#ffc61a"/>';
    board = '<svg viewBox="-200 -200 400 400" aria-hidden="true"><g class="glow"><g class="spin">' + s + '</g></g>'
      + '<circle class="ripple" r="10"/><circle class="ripple r2" r="10"/>'
      + '<g class="dart"><g transform="rotate(-38)">'
      + '<line x1="0" y1="0" x2="26" y2="0" stroke="#cfd8e1" stroke-width="3" stroke-linecap="round"/>'
      + '<rect x="24" y="-6" width="58" height="12" rx="5" fill="#2a333d" stroke="#cfd8e1" stroke-width="1.5"/>'
      + '<path d="M30 -6v12M38 -6v12M46 -6v12M54 -6v12" stroke="#8c97a3" stroke-width="1.5"/>'
      + '<rect x="82" y="-2" width="34" height="4" fill="#cfd8e1"/>'
      + '<path d="M112 0 L150 -26 L146 0 Z" fill="#ffc61a"/><path d="M112 0 L150 26 L146 0 Z" fill="#e0a800"/>'
      + '</g></g></svg>';
    return board;
  }

  /* ---------- the parts every screen shares ---------- */

  function langSwitch(ctx) {
    var w = ctx.words;
    return '<div class="acc-lang" role="group" aria-label="' + esc(w.langGroup) + '">'
      + [['en', w.langEN], ['ms', w.langBM]].map(function (l) {
        return '<button type="button" data-lang="' + l[0] + '"' + (ctx.lang === l[0] ? ' class="on" aria-pressed="true"' : ' aria-pressed="false"') + '>' + esc(l[1]) + '</button>';
      }).join('') + '</div>';
  }

  /* The page around a card: background glow, EN | BM, the board and the logo, the card, the toast. o.compact: a smaller
     board above a long form on an upright phone. */
  function shell(ctx, card, o) {
    o = o || {};
    var w = ctx.words;
    return '<div class="acc' + (ctx.intro ? ' intro' : '') + (ctx.wide ? ' wide' : '') + (o.compact ? ' compact' : '') + '">'
      + '<div class="acc-bg"></div>'
      + '<div class="acc-top in" style="animation-delay:.1s">' + langSwitch(ctx) + '</div>'
      + '<div class="acc-main"><div class="acc-hero">'
      + '<div class="acc-board in" style="animation-delay:.05s">' + boardSvg() + '</div>'
      + '<div class="acc-logo in" style="animation-delay:.25s"><h1>' + esc(w.appName) + '</h1><p>' + esc(w.accTag) + '</p></div>'
      + '</div>' + card + '</div>'
      + '<div class="acc-toast" role="status" aria-live="polite"></div></div>';
  }

  function cardOpen(title, sub, tag) {
    return '<' + (tag || 'form') + ' class="acc-card in" style="animation-delay:.45s"' + (tag ? '' : ' novalidate') + '><h2>' + esc(title) + '</h2>'
      + (sub ? '<p class="sub">' + esc(sub) + '</p>' : '');
  }

  /* A box with a floating label. o: type, auto (autocomplete), value, max, eye (show-password button), mode (inputmode). */
  function field(ctx, id, label, icon, o) {
    o = o || {};
    var pw = o.type === 'password';
    return '<div class="fld"><input id="' + id + '" name="' + id + '" type="' + (o.type || 'text') + '" placeholder=" "'
      + (o.auto ? ' autocomplete="' + o.auto + '"' : '') + (o.mode ? ' inputmode="' + o.mode + '"' : '')
      + (o.max ? ' maxlength="' + o.max + '"' : '') + (pw || o.mode === 'email' ? ' autocapitalize="off" spellcheck="false"' : '')
      + (o.value ? ' value="' + esc(o.value) + '"' : '') + '>'
      + '<label for="' + id + '">' + esc(label) + '</label>' + ICON[icon]
      + (pw ? '<button type="button" class="eye" aria-label="' + esc(ctx.words.showPass) + '">' + ICON.eye + '</button>' : '') + '</div>';
  }
  function errLine() { return '<div class="err" role="alert"></div>'; }
  function goButton(label) { return '<button class="btn go" type="submit"><span class="t">' + esc(label) + '</span><span class="spinner"></span></button>'; }
  /* hash '' is the start screen (log in, or home when logged in). */
  function link(hash, label) { return '<a href="' + esc(hash || '#') + '" class="lnk" data-go="' + esc(hash) + '">' + esc(label) + '</a>'; }

  /* The words for a failed request: no answer -> offline; a known code -> its words; anything else -> try again. */
  function errorText(w, r, vars) {
    if (!r || r.status === 0) return w.err_offline;
    var code = r.body && typeof r.body.code === 'string' ? r.body.code : '';
    if (code === 'email_password_required') return w.err_login_empty;
    if (code && Object.prototype.hasOwnProperty.call(w, 'err_' + code)) return fmt(w['err_' + code], vars);
    // An answer we have no words for: its status and code follow, so what went wrong can be read off the screen.
    return w.err_server + ' (' + r.status + (/^[a-z_]{1,40}$/.test(code) ? ' ' + code : '') + ')';
  }

  /* A date in words in the screen's language, e.g. 7 December 2026 / 7 Disember 2026. */
  function dateWords(iso, lang) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso || '');
    try { return d.toLocaleDateString(lang === 'ms' ? 'ms-MY' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); }
    catch (e) { return d.toISOString().slice(0, 10); }
  }

  var toastTimer = null;
  function toast(root, msg) {
    var t = root && root.querySelector('.acc-toast');
    if (!t || !msg) return;
    t.textContent = msg;
    t.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); toastTimer = null; }, 2800);
  }

  /* The taps every screen shares: EN | BM, links to other screens, show password, Log out; typing hides the error. */
  function wire(root, ctx) {
    root.addEventListener('click', function (ev) {
      var t = ev.target;
      var el = t && t.closest ? t.closest('[data-lang],[data-go],.eye,[data-acc="logout"]') : null;
      if (!el) return;
      if (el.hasAttribute('data-lang')) { ctx.setLang(el.getAttribute('data-lang')); return; }
      if (el.hasAttribute('data-go')) { if (ev.preventDefault) ev.preventDefault(); ctx.go(el.getAttribute('data-go')); return; }
      if (el.getAttribute('data-acc') === 'logout') { logout(root, ctx); return; }
      var input = el.parentNode && el.parentNode.querySelector('input');
      if (input) input.setAttribute('type', input.getAttribute('type') === 'password' ? 'text' : 'password');
    });
    root.addEventListener('input', function () {
      var err = root.querySelector('.err');
      if (err) err.classList.remove('show');
    });
  }

  /* The form of the screen: read a box, show an error with the shake, the busy spinner on the main button. */
  function kit(root) {
    var card = root.querySelector('.acc-card'), err = root.querySelector('.err'), btn = root.querySelector('.go');
    var busy = false;
    return {
      val: function (id) { var el = root.querySelector('#' + id); return el ? String(el.value || '') : ''; },
      fail: function (msg) {
        if (err) { err.textContent = msg; err.classList.add('show'); }
        if (card) { card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake'); }
      },
      busy: function (on) {
        if (on === undefined) return busy;
        busy = on;
        if (!btn) return;
        if (on) { btn.classList.add('busy'); btn.setAttribute('aria-busy', 'true'); }
        else { btn.classList.remove('busy'); btn.removeAttribute('aria-busy'); }
      }
    };
  }
  /* Runs send() once per tap (a second tap while waiting does nothing). */
  function onSubmit(root, k, send) {
    var form = root.querySelector('form.acc-card');
    if (!form) return;
    form.addEventListener('submit', function (ev) {
      if (ev.preventDefault) ev.preventDefault();
      if (k.busy()) return;
      var p = send();
      if (p && p.then) { k.busy(true); p.then(function () { k.busy(false); }, function () { k.busy(false); }); }
    });
  }

  /* The card after a generic "we have sent a link" answer. */
  function sentCard(root, ctx, text) {
    var w = ctx.words;
    var card = root.querySelector('.acc-card');
    if (!card) return;
    card.innerHTML = '<h2>' + esc(w.sentTitle) + '</h2><p class="sub sent">' + esc(text) + '</p>'
      + '<a href="#" class="btn go" data-go=""><span class="t">' + esc(w.backToLogin) + '</span></a>';
  }

  function logout(root, ctx) {
    return ctx.api('/api/account/logout', { method: 'POST', body: {} }).then(function (r) {
      // Without an answer the session cookie is still valid on the server. The phone forgets the player anyway (the next
      // person must not play as them), and the app sends the logout once the signal is back (app.js logoutLater).
      if (r.status === 0 && ctx.logoutLater) ctx.logoutLater();
      ctx.setPlayer(null);
      ctx.go('');
    });
  }

  /* ---------- log in ---------- */

  function renderLogin(root, ctx) {
    var w = ctx.words;
    root.innerHTML = shell(ctx, cardOpen(w.loginTitle, w.loginSub)
      + field(ctx, 'accUser', w.userLabel, 'user', { auto: 'username', mode: 'email' })
      + field(ctx, 'accPass', w.passLabel, 'lock', { type: 'password', auto: 'current-password' })
      + '<div class="aux">' + errLine() + link('#forgot', w.forgotLink) + '</div>'
      + goButton(w.loginBtn)
      // After any failed login (ledger ruling): the server answers the same for every email, so organisers who typed
      // their organiser login here are pointed to their own app by this fixed line.
      + '<p class="acc-org" hidden>' + esc(w.orgLine) + ' <a class="lnk" href="' + ORGANISER_APP + '" target="_blank" rel="noopener">' + esc(w.orgLink) + '</a></p>'
      + '<p class="acc-resend" hidden><button type="button" class="lnk" data-acc="resend">' + esc(w.resendLink) + '</button></p>'
      + '<div class="or">' + esc(w.orWord) + '</div>'
      + '<a href="#guest" class="btn guest" data-go="#guest"><span class="gi">' + ICON.target + '</span><span><b>' + esc(w.guestBtn) + '</b><span>'
      + esc(w.guestSub) + '</span></span>' + ICON.arrow + '</a>'
      + '<p class="help">' + esc(w.newPlayer) + ' ' + link('#register', w.createAccount) + '</p></form>');
    wire(root, ctx);
    var k = kit(root);
    var org = root.querySelector('.acc-org'), again = root.querySelector('.acc-resend');
    onSubmit(root, k, function () {
      var email = k.val('accUser').trim(), password = k.val('accPass');
      again.hidden = true;
      if (!email || !password) { k.fail(w.err_login_empty); return null; }
      return ctx.api('/api/account/login', { body: { email: email, password: password } }).then(function (r) {
        if (r.ok && r.body && r.body.player) {
          var p = r.body.player;
          ctx.setPlayer(p);
          ctx.go(p.mustChange ? '#password' : '', p.mustChange ? null : fmt(w.welcome, { name: p.firstName }));
          return;
        }
        org.hidden = false;
        if (r.status === 403 && r.body && r.body.code === 'unverified') again.hidden = false;
        k.fail(errorText(w, r));
      });
    });
    again.querySelector('button').addEventListener('click', function () {
      var email = k.val('accUser').trim();
      ctx.api('/api/account/resend', { body: { email: email, lang: ctx.lang } }).then(function (r) {
        if (r.ok) { again.hidden = true; toast(root, w.resendSent); } else k.fail(errorText(w, r));
      });
    });
  }

  /* ---------- create an account ---------- */

  function renderRegister(root, ctx) {
    var w = ctx.words;
    root.innerHTML = shell(ctx, cardOpen(w.regTitle, w.regSub)
      + '<div class="two">' + field(ctx, 'accFirst', w.firstName, 'user', { auto: 'given-name', max: MAX_NAME })
      + field(ctx, 'accLast', w.lastName, 'user', { auto: 'family-name', max: MAX_NAME }) + '</div>'
      + field(ctx, 'accEmail', w.emailLabel, 'mail', { type: 'email', auto: 'email', mode: 'email' })
      + field(ctx, 'accPass', w.newPassLabel, 'lock', { type: 'password', auto: 'new-password' })
      + errLine() + goButton(w.regBtn)
      + '<p class="help">' + esc(w.haveAccount) + ' ' + link('', w.toLogin) + '</p></form>', { compact: true });
    wire(root, ctx);
    var k = kit(root);
    onSubmit(root, k, function () {
      var body = { firstName: k.val('accFirst').trim(), lastName: k.val('accLast').trim(), email: k.val('accEmail').trim(), password: k.val('accPass'), lang: ctx.lang };
      if (!body.firstName || !body.lastName || !body.email || !body.password) { k.fail(w.err_fill_all); return null; }
      if (body.password.length < MIN_PASSWORD) { k.fail(w.err_password_too_short); return null; }
      return ctx.api('/api/account/register', { body: body }).then(function (r) {
        if (r.ok) sentCard(root, ctx, w.regSent); else k.fail(errorText(w, r));
      });
    });
  }

  /* ---------- forgot password / a new confirm link: one email box, a generic answer ---------- */

  function emailOnly(root, ctx, title, sub, path, sent) {
    var w = ctx.words;
    root.innerHTML = shell(ctx, cardOpen(title, sub)
      + field(ctx, 'accEmail', w.emailLabel, 'mail', { type: 'email', auto: 'email', mode: 'email' })
      + errLine() + goButton(w.sendLinkBtn)
      + '<p class="help">' + link('', w.backLink) + '</p></form>');
    wire(root, ctx);
    var k = kit(root);
    onSubmit(root, k, function () {
      var email = k.val('accEmail').trim();
      if (!email) { k.fail(w.err_invalid_email); return null; }
      return ctx.api(path, { body: { email: email, lang: ctx.lang } }).then(function (r) {
        if (r.ok) sentCard(root, ctx, sent); else k.fail(errorText(w, r));
      });
    });
  }
  function renderForgot(root, ctx) { var w = ctx.words; emailOnly(root, ctx, w.forgotTitle, w.forgotSub, '/api/account/forgot', w.forgotSent); }
  function renderResend(root, ctx) { var w = ctx.words; emailOnly(root, ctx, w.resendTitle, w.resendSub, '/api/account/resend', w.resendSent); }

  /* ---------- confirm the email (link /#verify=<token>) ---------- */

  /* The password is asked for (security ruling): only whoever chose it can finish confirming, not just whoever opens
     the link. A wrong password and a dead link get the same words, as the server answers. */
  function renderVerify(root, ctx, token) {
    var w = ctx.words;
    root.innerHTML = shell(ctx, cardOpen(w.verifyTitle, w.verifySub)
      + field(ctx, 'accPass', w.passLabel, 'lock', { type: 'password', auto: 'current-password' })
      + errLine() + goButton(w.verifyBtn)
      + '<p class="help acc-newlink" hidden>' + link('#resend', w.newLinkLink) + '</p></form>');
    wire(root, ctx);
    var k = kit(root);
    onSubmit(root, k, function () {
      var password = k.val('accPass');
      if (!password) { k.fail(w.err_invalid_link_or_password); return null; }
      return ctx.api('/api/account/verify', { body: { token: token, password: password } }).then(function (r) {
        if (r.ok && r.body && r.body.player) {
          ctx.setPlayer(r.body.player);
          ctx.go('', fmt(w.verified, { name: r.body.player.firstName }));
          return;
        }
        if (r.status === 400) root.querySelector('.acc-newlink').hidden = false;
        k.fail(errorText(w, r));
      });
    });
  }

  /* ---------- a new password from the e-mailed link (/#reset=<token>) ---------- */

  function renderReset(root, ctx, token) {
    var w = ctx.words;
    root.innerHTML = shell(ctx, cardOpen(w.resetTitle, w.resetSub)
      + field(ctx, 'accPass', w.newPassOnly, 'lock', { type: 'password', auto: 'new-password' })
      + errLine() + goButton(w.savePassBtn)
      + '<p class="help acc-newlink" hidden>' + link('#forgot', w.newLinkLink) + '</p></form>');
    wire(root, ctx);
    var k = kit(root);
    onSubmit(root, k, function () {
      var password = k.val('accPass');
      if (password.length < MIN_PASSWORD) { k.fail(w.err_password_too_short); return null; }
      return ctx.api('/api/account/reset', { body: { token: token, password: password } }).then(function (r) {
        // The reset ends every session (token_version): log in again with the new password.
        if (r.ok) { ctx.setPlayer(null); ctx.go('', w.resetDone); return; }
        if (r.body && r.body.code === 'invalid_link') root.querySelector('.acc-newlink').hidden = false;
        k.fail(errorText(w, r));
      });
    });
  }

  /* ---------- change password (forced: an admin gave a temporary one) ---------- */

  function renderChangePassword(root, ctx, forced) {
    var w = ctx.words;
    root.innerHTML = shell(ctx, cardOpen(w.cpTitle, forced ? w.cpForcedSub : w.cpSub)
      + (forced ? '' : field(ctx, 'accCur', w.currentPassLabel, 'lock', { type: 'password', auto: 'current-password' }))
      + field(ctx, 'accPass', w.newPassOnly, 'lock', { type: 'password', auto: 'new-password' })
      + errLine() + goButton(w.savePassBtn)
      + '<p class="help">' + (forced ? '<button type="button" class="lnk" data-acc="logout">' + esc(w.logoutLink) + '</button>'
        : link('#profile', w.backLink)) + '</p></form>');
    wire(root, ctx);
    var k = kit(root);
    onSubmit(root, k, function () {
      var body = { password: k.val('accPass') };
      if (!forced) {
        body.current = k.val('accCur');
        if (!body.current) { k.fail(w.err_current_password_required); return null; }
      }
      if (body.password.length < MIN_PASSWORD) { k.fail(w.err_password_too_short); return null; }
      return ctx.api('/api/account/change-password', { body: body }).then(function (r) {
        if (r.ok && r.body && r.body.player) { ctx.setPlayer(r.body.player); ctx.go('', w.cpDone); return; }
        k.fail(errorText(w, r));
      });
    });
  }

  /* ---------- profile: the name (once every 30 days), change password, log out ---------- */

  function renderProfile(root, ctx) {
    var w = ctx.words, p = ctx.player || {};
    root.innerHTML = shell(ctx, cardOpen(w.profileTitle, w.profileSub)
      + '<p class="acc-email">' + esc(p.email || '') + '</p>'
      + '<div class="two">' + field(ctx, 'accFirst', w.firstName, 'user', { auto: 'given-name', max: MAX_NAME, value: p.firstName })
      + field(ctx, 'accLast', w.lastName, 'user', { auto: 'family-name', max: MAX_NAME, value: p.lastName }) + '</div>'
      + errLine() + goButton(w.saveNameBtn)
      + '<p class="help acc-links">' + link('#password', w.changePassLink) + ' · <button type="button" class="lnk" data-acc="logout">' + esc(w.logoutLink)
      + '</button> · ' + link('', w.backLink) + '</p></form>', { compact: true });
    wire(root, ctx);
    var k = kit(root);
    onSubmit(root, k, function () {
      var body = { firstName: k.val('accFirst').trim(), lastName: k.val('accLast').trim() };
      if (!body.firstName || !body.lastName) { k.fail(w.err_fill_all); return null; }
      return ctx.api('/api/account/profile', { body: body }).then(function (r) {
        if (r.ok && r.body && r.body.player) { ctx.setPlayer(r.body.player); toast(root, w.nameSaved); return; }
        k.fail(errorText(w, r, { date: r.body && r.body.nextAt ? dateWords(r.body.nextAt, ctx.lang) : '' }));
      });
    });
  }

  return {
    renderLogin: renderLogin, renderRegister: renderRegister, renderForgot: renderForgot, renderResend: renderResend,
    renderVerify: renderVerify, renderReset: renderReset, renderChangePassword: renderChangePassword, renderProfile: renderProfile,
    shell: shell, wire: wire, toast: toast, link: link, errorText: errorText, dateWords: dateWords, esc: esc, fmt: fmt,
    ORGANISER_APP: ORGANISER_APP
  };
});

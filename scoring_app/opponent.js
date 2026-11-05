/* The "Add a friend" form (approved mockup docs/design/friends-mockup.html, screen 2) and the casual setup's Choose opponent
   panel (screen 1, renderChoose below). The Friends tab (scorecard.js) shows the form from "+ Add a friend", and Choose
   opponent shows the same form from its own "+ Add a friend".
     DDOpponent.renderAddFriend(root, ctx, onDone[, opts])
       onDone(null)                        the player backed out
       onDone({ friend, mode, email })     the friend was added: friend is the server's row ({ id, badge, nickname, firstName,
                                           lastName }), mode 'account' (a request was sent) or 'none' / 'unknown' (kept without one)
       opts.friends                        the friends list rows, when the caller has them (else the form fetches the list once)
   Email comes first. Once it looks complete (and 500 ms of no typing) POST /api/friends/check says whether it belongs to a
   DartDraw account: the names then fill in and lock and the button reads "Send friend request"; with no account the names are
   typed, a note says their results won't be saved, and the button reads "Add friend". The nickname is the player's own and at
   most 12 characters. If the names match a friend who has no account (under another email), "Keep your games together" offers
   to move those games to the new entry (mergeFrom). Everything that came from the server is escaped before it is shown. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DDOpponent = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var NICK_MAX = 12, DELAY_MS = 500;
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  function g() { return typeof self !== 'undefined' ? self : global; }
  function esc(s) { return g().DDAccount.esc(s); }
  function fmt(s, v) { return String(s == null ? '' : s).replace(/\{(\w+)\}/g, function (m, k) { return v && v[k] != null ? String(v[k]) : ''; }); }
  function lower(s) { return String(s == null ? '' : s).trim().toLowerCase(); }
  /* At most 12 characters, counted as the eye sees them (an emoji is one), no control characters. */
  function clipNick(s) {
    return Array.from(String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ')).slice(0, NICK_MAX).join('');
  }

  /* The words for a failed friends request (add, check, update, ...). */
  function errText(w, r, vars) {
    if (!r || r.status === 0) return w.err_offline;
    var code = r.body && typeof r.body.code === 'string' ? r.body.code : '';
    if (r.status === 429 || code === 'too_many' || code === 'rate_limited') return w.err_rate_limited;
    if (code === 'bad_email') return w.frBadEmail;
    if (code === 'own_email') return w.frOwnEmail;
    if (code === 'already_friends') return w.frDup;
    if (code === 'first_name_required') return w.frNeedFirst;
    if (code === 'last_name_required') return w.frNeedLast;
    if (code === 'name_too_long') return w.err_name_too_long;
    if (code === 'too_soon') return fmt(w.frTooSoon, { date: r.body && r.body.nextAt && vars && vars.date ? vars.date(r.body.nextAt) : '' }) || w.err_server;
    if (code === 'not_on_dartdraw') return w.frNotOn;
    if (code === 'bad_merge' || code === 'not_found') return w.frGone;
    if (code === 'not_editable') return w.frNotEditable;
    if (code === 'mail_failed') return w.frMailFailed;
    return w.err_server;
  }

  var ICO = {
    lock: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    yes: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#3ee08a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>',
    no: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#9fb0c0" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.5"/></svg>'
  };

  function renderAddFriend(host, ctx, onDone, opts) {
    opts = opts || {};
    var w = ctx.words, A = g().DDAccount, doc = host.ownerDocument;
    var wrap = doc.createElement('div');   // the form's own element: its taps leave with it when the host is redrawn
    wrap.className = 'fx fx-add';
    wrap.innerHTML = '<h2 class="fx-h">' + esc(w.frAddTitle) + '</h2>'
      + '<form novalidate>'
      + '<div class="fx-fld fx-email"><input type="email" class="fx-in" data-in="email" placeholder=" " inputmode="email" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="254" id="fxEmail">'
      + '<label for="fxEmail">' + esc(w.frEmail) + '</label><span class="fx-st" aria-hidden="true"></span></div>'
      + '<div class="fx-res" role="status" aria-live="polite"></div>'
      + '<div class="fx-two"><div class="fx-fld"><input type="text" class="fx-in" data-in="first" placeholder=" " autocomplete="off" maxlength="40" id="fxFirst"><label for="fxFirst">' + esc(w.frFirst) + '</label></div>'
      + '<div class="fx-fld"><input type="text" class="fx-in" data-in="last" placeholder=" " autocomplete="off" maxlength="40" id="fxLast"><label for="fxLast">' + esc(w.frLast) + '</label></div></div>'
      + '<div class="fx-fld"><input type="text" class="fx-in" data-in="nick" placeholder=" " autocomplete="off" maxlength="' + NICK_MAX + '" id="fxNick"><label for="fxNick">' + esc(w.frNick) + '</label></div>'
      + '<label class="fx-merge" hidden><input type="checkbox" data-in="merge"><span><b>' + esc(w.frMerge) + '</b><small class="fx-mtxt"></small></span></label>'
      + '<div class="fx-err" role="alert"></div>'
      + '<button class="fx-btn go" type="submit"><span class="t"></span></button>'
      + '<p class="fx-note">' + esc(w.frNickNote) + '</p>'
      + '<button type="button" class="fx-cancel" data-cancel="1">' + esc(w.frCancel) + '</button></form>';
    host.innerHTML = '';
    host.appendChild(wrap);

    var q = function (s) { return wrap.querySelector(s); };
    var email = q('[data-in="email"]'), first = q('[data-in="first"]'), last = q('[data-in="last"]'), nick = q('[data-in="nick"]'), merge = q('[data-in="merge"]');
    var st = q('.fx-st'), res = q('.fx-res'), err = q('.fx-err'), btn = q('.fx-btn'), btnT = q('.fx-btn .t'), mergeBox = q('.fx-merge'), mtxt = q('.fx-mtxt');
    var S = { mode: 'idle', timer: null, token: 0, busy: false, list: Array.isArray(opts.friends) ? opts.friends : null, mergeId: null };

    function setAttr(el, k, on) { if (on) el.setAttribute(k, ''); else el.removeAttribute(k); }
    function setRes(kind, text) {
      res.className = 'fx-res' + (text ? ' show ' + kind : '');
      res.textContent = text || '';
    }
    function setStatus(kind) {
      st.className = 'fx-st' + (kind === 'checking' ? ' spin' : '');
      st.innerHTML = kind === 'yes' ? ICO.yes : kind === 'no' ? ICO.no : '';
    }
    function showErr(text) { err.textContent = text || ''; }
    function lockNames(on) {
      [first, last].forEach(function (i) {
        setAttr(i, 'readonly', on);
        i.setAttribute('aria-readonly', String(on));
        var f = i.parentNode;
        if (on) f.classList.add('locked'); else f.classList.remove('locked');
      });
    }
    function refreshButton() {
      btnT.textContent = S.mode === 'account' ? w.frBtnRequest : w.frBtnAdd;
      setAttr(btn, 'disabled', S.mode === 'checking' || S.busy);
    }
    function fullNames() { return { first: lower(first.value), last: lower(last.value) }; }

    /* A friend without an account whose names match what is typed (and whose email is another one): offered for merging. */
    function refreshMerge() {
      var n = fullNames(), found = null, em = lower(email.value);
      if (S.list && n.first && n.last) {
        S.list.forEach(function (f) {
          if (found || !f || f.badge !== 'none') return;
          if (lower(f.firstName) === n.first && lower(f.lastName) === n.last && lower(f.email) !== em) found = f;
        });
      }
      S.mergeId = found ? found.id : null;
      if (found) {
        mtxt.textContent = fmt(w.frMergeSub, { name: (found.nickname || found.firstName + ' ' + found.lastName).trim() });
        mergeBox.removeAttribute('hidden');
      } else {
        mergeBox.setAttribute('hidden', '');
        merge.checked = false;
      }
    }

    function setMode(mode, acct) {
      var was = S.mode;
      S.mode = mode;
      if (mode === 'account') {
        first.value = acct.firstName == null ? '' : String(acct.firstName);
        last.value = acct.lastName == null ? '' : String(acct.lastName);
        lockNames(true);
        setStatus('yes');
        setRes('ok', fmt(w.frCheckOk, { name: (String(acct.firstName || '') + ' ' + String(acct.lastName || '')).trim() }));
      } else {
        if (was === 'account') { first.value = ''; last.value = ''; }   // the account's names do not stay once the email changes
        lockNames(false);
        if (mode === 'none') { setStatus('no'); setRes('no', w.frCheckNo); }
        else if (mode === 'checking') { setStatus('checking'); setRes('', ''); }
        else { setStatus(''); }
      }
      refreshButton();
      refreshMerge();
    }

    function check(addr) {
      var my = ++S.token;
      setMode('checking');
      ctx.api('/api/friends/check', { method: 'POST', body: { email: addr } }).then(function (r) {
        if (my !== S.token) return;   // the email changed meanwhile
        if (r.status === 401) { ctx.setPlayer(null); ctx.go(''); return; }
        if (r.ok && r.body && r.body.account === true) { setMode('account', r.body); return; }
        if (r.ok && r.body && r.body.account === false) { setMode('none'); return; }
        // No answer (offline, too many checks): the form still works; the server decides when it is sent.
        setMode('unknown');
        setRes('no', errText(w, r));
      });
    }

    function onEmail() {
      if (S.timer) { clearTimeout(S.timer); S.timer = null; }
      S.token++;
      showErr('');
      var v = lower(email.value);
      if (S.mode !== 'idle') setMode('idle');
      setRes('', '');
      if (!EMAIL_RE.test(v)) return;   // not complete yet: nothing is said until it looks like an address
      if (ctx.player && lower(ctx.player.email) === v) { setRes('no', w.frOwnEmail); return; }
      S.mode = 'checking'; refreshButton(); setStatus('checking');
      S.timer = setTimeout(function () { S.timer = null; check(v); }, DELAY_MS);
    }

    wrap.addEventListener('input', function (ev) {
      var t = ev.target, k = t && t.getAttribute ? t.getAttribute('data-in') : '';
      if (k === 'email') onEmail();
      else if (k === 'nick') { var c = clipNick(nick.value); if (c !== nick.value) nick.value = c; }
      else if (k === 'first' || k === 'last') { showErr(''); refreshMerge(); }
    });
    wrap.addEventListener('click', function (ev) {
      var t = ev.target && ev.target.closest ? ev.target : null;
      if (t && t.closest('[data-cancel]')) { if (S.timer) clearTimeout(S.timer); S.token++; onDone(null); }
    });
    wrap.addEventListener('submit', function (ev) {
      if (ev && ev.preventDefault) ev.preventDefault();
      if (S.busy || S.mode === 'checking') return;
      var addr = lower(email.value);
      if (!EMAIL_RE.test(addr)) { showErr(w.frBadEmail); return; }
      if (ctx.player && lower(ctx.player.email) === addr) { showErr(w.frOwnEmail); return; }
      var fn = String(first.value || '').trim(), ln = String(last.value || '').trim();
      if (S.mode !== 'account') {
        if (!fn) { showErr(w.frNeedFirst); return; }
        if (!ln) { showErr(w.frNeedLast); return; }
      }
      var body = { email: addr, firstName: fn, lastName: ln, nickname: clipNick(nick.value).trim() };
      if (S.mergeId && merge.checked) body.mergeFrom = S.mergeId;
      S.busy = true; btn.classList.add('busy'); refreshButton(); showErr('');
      var sentMode = S.mode;
      ctx.api('/api/friends/add', { method: 'POST', body: body }).then(function (r) {
        S.busy = false; btn.classList.remove('busy'); refreshButton();
        if (r.status === 401) { ctx.setPlayer(null); ctx.go(''); return; }
        if (r.ok && r.body && r.body.friend) { onDone({ friend: r.body.friend, mode: sentMode, email: addr }); return; }
        showErr(errText(w, r));
      });
    });

    if (!S.list) {
      ctx.api('/api/friends/list').then(function (r) {
        if (r.ok && r.body && Array.isArray(r.body.friends)) { S.list = r.body.friends; refreshMerge(); }
      });
    }
    refreshButton();
    return { focus: function () { if (email && email.focus) email.focus(); } };
  }

  /* ---------- Choose opponent (approved mockup screen 1) ---------- */

  /* The casual setup's panel for Player 2 (casual.js, logged in), drawn into host (an element outside the zoomed setup
     screen) as a sheet from the bottom:
       DDOpponent.renderChoose(host, ctx, opts, onPick)
         onPick(null)                                   closed without a choice (the backdrop, the X, Escape)
         onPick({ id, name, full, badge })              a friend (id: the friendship's id; name: what the player calls them)
         onPick({ guest: true, name })                  a guest, by the first name typed (nothing saved for them)
       opts: { current (the Player 2 now chosen, marked in the list), onList(friends) (called once the list has loaded) }
     Recent opponents come from GET /api/games/list (the last games' opponents, newest first; a friend's game names them as
     the player does, so it is matched back to the friends list; a friend no longer on it is left out). Friends come from
     GET /api/friends/list, searched by name or nickname, each with its badge. "+ Add a friend" is the same form as the
     Friends tab (renderAddFriend): the friend added is the one picked. */
  var RECENT_MAX = 3, GUEST_MAX = 20;
  function fullOf(f) { return (String(f.firstName || '') + ' ' + String(f.lastName || '')).trim(); }
  function shownOf(f) { return String(f.nickname || '').trim() || fullOf(f) || '?'; }
  function iniOf(s) {
    var p = String(s || '').trim().split(/\s+/);
    return ((p[0] || '').charAt(0) + (p.length > 1 ? p[p.length - 1].charAt(0) : '')).toUpperCase() || '?';
  }
  function badgeKey(b) { return b === 'linked' ? 'l' : b === 'waiting' ? 'w' : 'n'; }
  function asOpp(f) { return { id: f.id, name: shownOf(f), full: fullOf(f), badge: f.badge === 'linked' || f.badge === 'waiting' ? f.badge : 'none' }; }

  function renderChoose(host, ctx, opts, onPick) {
    opts = opts || {};
    var w = ctx.words, doc = host.ownerDocument;
    var S = { view: 'list', friends: null, games: null, failed: 0, q: '', closed: false };
    host.className = 'fx co-ovl';
    host.innerHTML = '<div class="co-sheet" role="dialog" aria-modal="true" aria-label="' + esc(w.chooseTitle) + '"><div class="co-grab"></div><div class="co-body"></div></div>';
    var body = host.querySelector('.co-body');

    function done(o) {
      if (S.closed) return;
      S.closed = true;
      if (doc && doc.removeEventListener) doc.removeEventListener('keydown', onKey);
      onPick(o);
    }
    function onKey(ev) { if (ev && ev.key === 'Escape' && S.view !== 'add') done(null); }
    if (doc && doc.addEventListener) doc.addEventListener('keydown', onKey);

    /* The last games' opponents, each once, as something to pick (a guest by name, a friend by their entry). */
    function recents() {
      if (!S.games || !S.friends) return [];
      var seen = {}, out = [];
      S.games.forEach(function (gm) {
        var o = gm && gm.opponent;
        if (!o || typeof o.name !== 'string' || !o.name.trim() || out.length >= RECENT_MAX) return;
        var key = (o.guest ? 'g:' : 'f:') + lower(o.name);
        if (seen[key]) return;
        seen[key] = true;
        if (o.guest) { out.push({ guest: true, name: Array.from(o.name.trim()).slice(0, GUEST_MAX).join('') }); return; }
        var f = S.friends.filter(function (x) { return lower(x.nickname) === lower(o.name) || lower(fullOf(x)) === lower(o.name); })[0];
        if (f) out.push(asOpp(f));
      });
      return out;
    }
    function rowSub(f) {
      var parts = [];
      if (String(f.nickname || '').trim() && fullOf(f)) parts.push(fullOf(f));
      var n = Number(f.games) || 0;
      if (n > 0) {
        parts.push(n === 1 ? w.coGames1 : fmt(w.coGamesN, { n: n }));
        if (f.headToHead) parts.push((Number(f.headToHead.won) || 0) + '–' + (Number(f.headToHead.lost) || 0));
      } else parts.push(w.frNoGames);
      return parts.join(' · ');
    }
    function rowsHtml() {
      if (!S.friends) return '<p class="co-msg">' + esc(S.failed ? (S.failed === 2 ? w.err_offline : w.frLoadFailed) : w.frLoading) + '</p>';
      if (!S.friends.length) return '<p class="co-msg">' + esc(w.coNoFriends) + '</p>';
      var q = lower(S.q);
      var list = S.friends.filter(function (f) {
        return !q || [f.nickname, f.firstName, f.lastName, fullOf(f)].some(function (s) { return lower(s).indexOf(q) >= 0; });
      });
      if (!list.length) return '<p class="co-msg">' + esc(w.frNoMatch) + '</p>';
      return list.map(function (f) {
        var on = opts.current && !opts.current.guest && opts.current.id === f.id;
        return '<button type="button" class="fx-row' + (on ? ' on' : '') + '" data-fid="' + esc(f.id) + '"><span class="fx-ini ' + badgeKey(f.badge) + '">' + esc(iniOf(fullOf(f) || shownOf(f))) + '</span>'
          + '<span class="fx-who"><b>' + esc(shownOf(f)) + '</b><span>' + esc(rowSub(f)) + '</span></span>'
          + '<span class="fx-bdg ' + badgeKey(f.badge) + '"><i></i>' + esc(f.badge === 'linked' ? w.frLinked : f.badge === 'waiting' ? w.frWaiting : w.frNoAccount) + '</span></button>';
      }).join('');
    }
    function chipsHtml() {
      var r = recents();
      if (!r.length) return '';
      return '<div class="co-lbl">' + esc(w.coRecent) + '</div><div class="co-chips">' + r.map(function (o, i) {
        return '<button type="button" class="co-chip" data-ri="' + i + '"><span class="fx-ini ' + (o.guest ? 'n' : badgeKey(o.badge)) + '">' + esc(iniOf(o.full || o.name)) + '</span><b>' + esc(o.name) + '</b></button>';
      }).join('') + '</div>';
    }
    function head(title) {
      return '<div class="co-hd"><h2 class="co-t">' + esc(title) + '</h2><button type="button" class="co-x" data-close="1" aria-label="' + esc(w.coClose) + '">'
        + '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>';
    }
    function drawList() {
      S.view = 'list';
      body.innerHTML = head(w.chooseTitle) + '<div class="co-recent">' + chipsHtml() + '</div>'
        + '<input type="search" class="fx-search" data-co="q" placeholder="' + esc(w.frSearch) + '" aria-label="' + esc(w.frSearch) + '" value="' + esc(S.q) + '" autocomplete="off">'
        + '<div class="co-list">' + rowsHtml() + '</div>'
        + '<button type="button" class="fx-addbtn" data-co="add">' + esc(w.frAddBtn) + '</button>'
        + '<button type="button" class="co-guest" data-co="guest"><span>' + esc(w.coGuest) + '</span><small>' + esc(w.guestNothing) + '</small></button>';
    }
    function redrawLoaded() {
      if (S.view !== 'list') return;
      var r = body.querySelector('.co-recent'), l = body.querySelector('.co-list');
      if (r) r.innerHTML = chipsHtml();
      if (l) l.innerHTML = rowsHtml();
    }
    function drawGuest() {
      S.view = 'guest';
      body.innerHTML = head(w.coGuest) + '<form novalidate class="co-gform">'
        + '<div class="fx-fld"><input type="text" class="fx-in" data-co="gname" placeholder=" " autocomplete="off" autocapitalize="words" spellcheck="false" maxlength="' + GUEST_MAX + '" id="coGuest">'
        + '<label for="coGuest">' + esc(w.frFirst) + '</label></div>'
        + '<div class="fx-err" role="alert"></div>'
        + '<button class="fx-btn go" type="submit"><span class="t">' + esc(w.coPlay) + '</span></button>'
        + '<p class="fx-note">' + esc(w.guestNothing) + '</p>'
        + '<button type="button" class="fx-cancel" data-co="back">' + esc(w.frCancel) + '</button></form>';
      var i = body.querySelector('[data-co="gname"]');
      if (i && i.focus) i.focus();
    }
    function drawAdd() {
      S.view = 'add';
      renderAddFriend(body, ctx, function (r) {
        if (r && r.friend) { done(asOpp(r.friend)); return; }
        drawList();
      }, { friends: S.friends || undefined }).focus();
    }

    host.addEventListener('click', function (ev) {
      var t = ev.target;
      if (t === host) { done(null); return; }   // the backdrop
      if (!t || !t.closest || S.view === 'add') return;   // the form handles its own taps
      var el;
      if (t.closest('[data-close]')) { done(null); return; }
      if ((el = t.closest('[data-fid]'))) {
        var id = el.getAttribute('data-fid'), f = (S.friends || []).filter(function (x) { return x.id === id; })[0];
        if (f) done(asOpp(f));
        return;
      }
      if ((el = t.closest('[data-ri]'))) { var o = recents()[Number(el.getAttribute('data-ri'))]; if (o) done(o); return; }
      if ((el = t.closest('[data-co]'))) {
        var k = el.getAttribute('data-co');
        if (k === 'add') drawAdd();
        else if (k === 'guest') drawGuest();
        else if (k === 'back') drawList();
      }
    });
    host.addEventListener('input', function (ev) {
      var t = ev.target, k = t && t.getAttribute ? t.getAttribute('data-co') : '';
      if (k === 'q') { S.q = t.value; var l = body.querySelector('.co-list'); if (l) l.innerHTML = rowsHtml(); }
      else if (k === 'gname') { var e = body.querySelector('.fx-err'); if (e) e.textContent = ''; }
    });
    host.addEventListener('submit', function (ev) {
      if (S.view !== 'guest') return;   // the Add a friend form submits on its own
      if (ev && ev.preventDefault) ev.preventDefault();
      var i = body.querySelector('[data-co="gname"]'), n = Array.from(String(i ? i.value : '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim()).slice(0, GUEST_MAX).join('').trim();
      if (!n) { var e = body.querySelector('.fx-err'); if (e) e.textContent = w.frNeedFirst; return; }
      done({ guest: true, name: n });
    });

    drawList();
    ctx.api('/api/friends/list').then(function (r) {
      if (S.closed) return;
      if (r.status === 401) { done(null); ctx.setPlayer(null); ctx.go(''); return; }
      if (r.ok && r.body && Array.isArray(r.body.friends)) {
        S.friends = r.body.friends.filter(function (f) { return f && typeof f.id === 'string'; });
        // The caller checks its remembered Player 2 against the fresh list (casual.js: one no longer on it is cleared).
        if (opts.onList) opts.onList(S.friends);
      }
      else S.failed = r.status === 0 ? 2 : 1;
      redrawLoaded();
    });
    ctx.api('/api/games/list?limit=20').then(function (r) {
      if (S.closed) return;
      S.games = r.ok && r.body && Array.isArray(r.body.games) ? r.body.games : [];
      redrawLoaded();
    });
    return { close: function () { done(null); } };
  }

  return { renderAddFriend: renderAddFriend, renderChoose: renderChoose, errText: errText, clipNick: clipNick, NICK_MAX: NICK_MAX, DELAY_MS: DELAY_MS };
});

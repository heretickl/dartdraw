/* The logged-in home: the player's scorecard (approved mockup docs/design/scorecard-mockup.html; spec
   docs/superpowers/specs/2026-11-04-accounts-scorecard-venue-design.md). Two tabs, Scorecard and Friends.
   Scorecard: All | Tournaments | Casual and a period; the 3DA (01) and MPR (Cricket) cards with their trend, one chart
   (tap a card to switch it), the full breakdown drawer, the Tournaments and Casual summaries, the recent matches (tap one
   for its stats, fetched from /api/games/one) and "Play a casual game". The numbers all come from GET /api/games/scorecard;
   this file only lays them out. A number with nothing behind it shows a dash, never "NaN" or "null".
   Unread notices show once as a strip at the top and are then marked read (POST /api/games/notices-read).
   Friends: DDScorecard.renderFriends(host, ctx, hooks) draws the tab (list, a friend's card, the Add a friend form from
   opponent.js); the gold dot on the tab button shows while a friend request waits.
   Everything that came from the server goes through DDAccount.esc before it is put in the page.
   Which tab, filter and period were last used is kept in memory, so EN | BM (which redraws the screen) keeps them. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DDScorecard = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var DASH = '–';
  var mem = { tab: 'card', filter: 'all', period: '30d', pid: null, fview: 'list', fid: null, fq: '' };   // survives a redraw in the other language
  var seenNotices = {};                                                  // ids already shown (the read mark may still be on its way)
  var resizeHooked = false, onResize = null;                             // the window listener is added once; it calls the open screen's fit
  /* A different player (or a log out / lost session) starts from the defaults, so a shared phone never carries one
     player's filter or already-shown notices to the next. */
  function resetMem(pid) { mem.tab = 'card'; mem.filter = 'all'; mem.period = '30d'; mem.fview = 'list'; mem.fid = null; mem.fq = ''; mem.pid = pid == null ? null : pid; seenNotices = {}; }
  function g() { return typeof self !== 'undefined' ? self : global; }
  function esc(s) { return g().DDAccount.esc(s); }
  /* Words with {name}-style holes: a hole with no value drops the whole phrase (''), never a literal {n}. */
  function fmt(s, v) {
    var missing = false;
    var out = String(s == null ? '' : s).replace(/\{(\w+)\}/g, function (m, k) { if (v && v[k] != null) return String(v[k]); missing = true; return ''; });
    return missing ? '' : out;
  }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function num(v, dec) { return isNum(v) ? v.toFixed(dec) : DASH; }
  function pct(v) { return isNum(v) ? Math.round(v) + '%' : DASH; }
  function reduced() {
    try { return !!(g().matchMedia && g().matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
  }

  /* ---------- the tiles (the breakdown drawer and a match's stats) ---------- */

  function tile(label, value, sub) {
    return '<div class="sc-tile"><div class="sc-lbl">' + esc(label) + '</div><b>' + esc(value) + '</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div>';
  }
  function count(o, k) { return o && o.darts ? String(Number(o[k]) || 0) : DASH; }

  /* The eight 01 tiles from a player's 01 numbers (the sums of a period, or one game's). 140+ and 100+ include the
     higher scores, so the three read 180s <= 140+ <= 100+. */
  function xTiles(x, w) {
    x = x || {};
    var has = !!x.darts;
    var f9 = x.f9darts ? x.f9points / x.f9darts * 3 : null;
    var co = x.checkoutTurns ? x.checkouts / x.checkoutTurns * 100 : null;
    var n180 = Number(x.n180) || 0, n140 = n180 + (Number(x.n140) || 0), n100 = n140 + (Number(x.n100) || 0);
    return [
      tile(w.scTFirst9, num(f9, 1)),
      tile(w.scTCheckouts, pct(co), co === null ? '' : fmt(w.scTOf, { a: x.checkouts || 0, b: x.checkoutTurns })),
      tile(w.scT180, has ? String(n180) : DASH),
      tile(w.scT140, has ? String(n140) : DASH),
      tile(w.scT100, has ? String(n100) : DASH),
      tile(w.scTHighFin, isNum(x.highFinish) ? String(x.highFinish) : DASH),
      tile(w.scTBestLeg, isNum(x.bestLegDarts) ? String(x.bestLegDarts) : DASH, isNum(x.bestLegDarts) ? w.scTDarts : ''),
      tile(w.scTLegsWon, x.legsPlayed ? pct(x.legsWon / x.legsPlayed * 100) : DASH)
    ].join('');
  }
  function cTiles(c, w) {
    c = c || {};
    var f9 = c.f9darts ? c.f9marks / c.f9darts * 3 : null;
    return [
      tile(w.scTFirst9Mpr, num(f9, 1)),
      tile(w.scTBestLeg, isNum(c.bestLegDarts) ? String(c.bestLegDarts) : DASH, isNum(c.bestLegDarts) ? w.scTDarts : ''),
      tile(w.scT5, count(c, 'rounds5')),
      tile(w.scT9, count(c, 'rounds9')),
      tile(w.scTHat, count(c, 'hatTricks'), w.scTHatSub),
      tile(w.scTWhite, count(c, 'whiteHorses')),
      tile(w.scTLegsWon, c.legsPlayed ? pct(c.legsWon / c.legsPlayed * 100) : DASH),
      tile(w.scTBulls, c.legsPlayed ? num(c.bulls / c.legsPlayed, 1) : DASH)
    ].join('');
  }
  function statsTiles(stats, w) {
    var out = '';
    if (stats && stats.x01) out += '<div class="sc-tiles">' + xTiles(stats.x01, w) + '</div>';
    if (stats && stats.cricket) out += '<div class="sc-tiles">' + cTiles(stats.cricket, w) + '</div>';
    return out;
  }

  /* ---------- notices ---------- */

  /* The words for one notice, or '' for a kind this version does not know (skipped). */
  function noticeText(n, w) {
    var d = n && n.data && typeof n.data === 'object' ? n.data : {};
    var by = d.by == null ? '' : String(d.by);
    if (n.kind === 'friend_request') return fmt(w.scNoticeReq, { by: by });
    if (n.kind === 'friend_accepted') return fmt(w.scNoticeAcc, { by: by });
    if (n.kind === 'casual_game') {
      var extra = isNum(d.avg3) ? fmt(w.scNoticeAvg, { v: d.avg3.toFixed(1) }) : isNum(d.mpr) ? fmt(w.scNoticeMpr, { v: d.mpr.toFixed(1) }) : '';
      return fmt(d.won ? w.scNoticeGameWon : w.scNoticeGameLost, { by: by, score: String(d.score == null ? '' : d.score), extra: extra });
    }
    return '';
  }

  /* ---------- the screen ---------- */

  /* The month and year of the sign-up, in the chosen language: 'November 2026'. */
  function sinceWords(iso, lang) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    try { return d.toLocaleDateString(lang === 'ms' ? 'ms-MY' : 'en-GB', { month: 'long', year: 'numeric' }); } catch (e) { return String(d.getUTCFullYear()); }
  }
  function initials(p) {
    var a = String(p.firstName || '').trim().charAt(0), b = String(p.lastName || '').trim().charAt(0);
    return (a + b).toUpperCase() || '?';
  }
  function gameWord(game, w) { return game === 'cricket' ? w.scGameCricket : game === 'choice' ? w.scGameChoice : w.scGame501; }

  var CHEVRON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';

  /* ---------- the Friends tab ---------- */

  /* Friends tab (approved mockup docs/design/friends-mockup.html, screens 3 and 4). Three views drawn into the tab, kept in
     mem so EN | BM (which redraws the screen) returns to the same one: the list (requests strip, search, rows), one friend's
     card, and the Add a friend form (opponent.js). Everything comes from GET /api/friends/list; each action is one POST and
     then the list is read again. hooks.onData(requestCount) lets the tab button show its gold dot. */
  var FRIEND_NO = '–';
  function fullName(f) { return (String(f.firstName || '') + ' ' + String(f.lastName || '')).trim(); }
  function shownName(f) { return String(f.nickname || '').trim() || fullName(f) || FRIEND_NO; }
  function shortName(f) { return String(f.nickname || '').trim() || String(f.firstName || '').trim() || fullName(f) || FRIEND_NO; }
  function agoWords(iso, w, lang) {
    var t = new Date(iso).getTime();
    if (!isFinite(t)) return '';
    var d = Math.floor((Date.now() - t) / 86400000);
    if (d <= 0) return w.frToday;
    if (d === 1) return w.frYesterday;
    if (d < 30) return fmt(w.frDaysAgo, { n: d });
    return g().DDAccount.dateWords(iso, lang);
  }
  function badgeHtml(b, w) {
    var k = b === 'linked' ? ['l', w.frLinked] : b === 'waiting' ? ['w', w.frWaiting] : ['n', w.frNoAccount];
    return '<span class="fx-bdg ' + k[0] + '"><i></i>' + esc(k[1]) + '</span>';
  }
  function iniHtml(f, big) {
    return '<span class="fx-ini ' + (f.badge === 'linked' ? 'l' : f.badge === 'waiting' ? 'w' : 'n') + (big ? ' big' : '') + '">' + esc(initials(f)) + '</span>';
  }
  /* Two numbers as the two halves of one bar. lowerBetter: fewer darts is better, so the smaller number gets the longer half. */
  function splitBar(a, b, lowerBetter) {
    if (!isNum(a) || !isNum(b)) return [0, 0];
    var s = a + b;
    if (s <= 0) return [0, 0];
    var mine = lowerBetter ? b / s * 100 : a / s * 100;
    return [mine, 100 - mine];
  }
  function cmpRow(label, a, b, show, lowerBetter) {
    var p = splitBar(a, b, lowerBetter);
    return '<div class="fx-cr"><div class="k">' + esc(label) + '</div><div class="v1">' + esc(isNum(a) ? show(a) : DASH) + '</div>'
      + '<div class="fx-bars"><i class="b1" style="width:' + p[0].toFixed(1) + '%"></i><i class="b2" style="width:' + p[1].toFixed(1) + '%"></i></div>'
      + '<div class="v2">' + esc(isNum(b) ? show(b) : DASH) + '</div></div>';
  }
  function d1(v) { return v.toFixed(1); }
  function dInt(v) { return String(Math.round(v)); }
  function dPct(v) { return Math.round(v) + '%'; }

  function renderFriends(host, ctx, hooks) {
    var w = ctx.words, A = g().DDAccount, O = g().DDOpponent, doc = host.ownerDocument;
    var D = { friends: [], requests: [], loaded: false, token: 0, busy: false };
    var quiet = reduced();
    var box = doc.createElement('div');   // this tab's own element: its taps leave with it on a redraw
    box.className = 'fx';
    box.innerHTML = '<div class="fx-view"></div><div class="fx-dlgs"></div>';
    host.innerHTML = '';
    host.appendChild(box);
    var view = box.querySelector('.fx-view'), dlgs = box.querySelector('.fx-dlgs');
    var dlg = null;   // the open dialog

    function say(msg) { A.toast(host.closest ? (host.closest('.scp') || host) : host, msg); }
    function find(id) { for (var i = 0; i < D.friends.length; i++) if (D.friends[i].id === id) return D.friends[i]; return null; }
    function dateOf(iso) { return A.dateWords(iso, ctx.lang); }
    function lost() { resetMem(null); ctx.setPlayer(null); ctx.go(''); }
    function fail(r) { return O.errText(w, r, { date: dateOf }); }

    /* ---- loading ---- */

    function load(quietly) {
      var my = ++D.token;
      if (!D.loaded && !quietly) view.innerHTML = '<p class="sc-note">' + esc(w.frLoading) + '</p>';
      return ctx.api('/api/friends/list').then(function (r) {
        if (my !== D.token) return;
        if (r.status === 401) { lost(); return; }
        if (!r.ok || !r.body || !Array.isArray(r.body.friends)) {
          if (!D.loaded) view.innerHTML = '<div class="sc-empty sc-fail"><p>' + esc(r.status === 0 ? w.scOffline : w.frLoadFailed) + '</p><button type="button" data-retry="1">' + esc(w.scRetry) + '</button></div>';
          return;
        }
        D.friends = r.body.friends.filter(function (f) { return f && typeof f.id === 'string'; });
        D.requests = (Array.isArray(r.body.requests) ? r.body.requests : []).filter(function (q) { return q && typeof q.id === 'string'; });
        D.loaded = true;
        if (hooks && hooks.onData) hooks.onData(D.requests.length);
        if (mem.fview !== 'add' && !dlg) draw();   // an open form or dialog is not drawn over
      });
    }

    function draw() {
      closeDialog();
      if (mem.fview === 'add') { drawAdd(); return; }
      if (mem.fview === 'card') {
        var f = find(mem.fid);
        if (f) { drawCard(f); return; }
        mem.fview = 'list'; mem.fid = null;
      }
      drawList();
    }

    /* ---- the list ---- */

    function rowSub(f) {
      var parts = [];
      if (String(f.nickname || '').trim() && fullName(f)) parts.push(fullName(f));
      if (f.games > 0 && f.lastPlayed) parts.push(fmt(w.frLastPlayed, { when: agoWords(f.lastPlayed, w, ctx.lang) }));
      else if (f.badge === 'waiting' && f.requestedAt) parts.push(fmt(w.frRequestSent, { when: agoWords(f.requestedAt, w, ctx.lang) }));
      else if (f.badge === 'none' && f.asked) parts.push(w.frNotAccepted);
      else if (f.badge === 'none' && f.nextInviteAt) parts.push(w.frInviteSent);
      else parts.push(w.frNoGames);
      if (f.games > 0 && f.headToHead) parts.push((Number(f.headToHead.won) || 0) + '–' + (Number(f.headToHead.lost) || 0));
      return parts.join(' · ');
    }
    function rowsHtml() {
      var q = String(mem.fq || '').trim().toLowerCase();
      var list = D.friends.filter(function (f) {
        if (!q) return true;
        return [f.nickname, f.firstName, f.lastName, fullName(f)].some(function (s) { return String(s || '').toLowerCase().indexOf(q) >= 0; });
      });
      if (!D.friends.length) return '<div class="sc-empty"><h2>' + esc(w.frEmptyTitle) + '</h2><p>' + esc(w.frEmptySub) + '</p></div>';
      if (!list.length) return '<div class="sc-msg">' + esc(w.frNoMatch) + '</div>';
      return list.map(function (f) {
        return '<button type="button" class="fx-row" data-fid="' + esc(f.id) + '">' + iniHtml(f)
          + '<span class="fx-who"><b>' + esc(shownName(f)) + '</b><span>' + esc(rowSub(f)) + '</span></span>' + badgeHtml(f.badge, w) + '</button>';
      }).join('');
    }
    function requestsHtml() {
      if (!D.requests.length) return '';
      return '<div class="fx-req"><div class="t">' + esc(D.requests.length === 1 ? w.frReq1 : fmt(w.frReqN, { n: D.requests.length })) + '</div>'
        + D.requests.map(function (q) {
          var nm = (String(q.firstName || '') + ' ' + String(q.lastName || '')).trim() || FRIEND_NO;
          return '<div class="fx-rq" data-rid="' + esc(q.id) + '"><span class="fx-ini w">' + esc(initials(q)) + '</span>'
            + '<div class="fx-who"><b>' + esc(nm) + '</b><span>' + esc(w.frWants) + '</span></div>'
            + '<button type="button" class="fx-mini y" data-accept="' + esc(q.id) + '">' + esc(w.frAccept) + '</button>'
            + '<button type="button" class="fx-mini n" data-decline="' + esc(q.id) + '" aria-label="' + esc(w.frDeclineLbl) + '">✕</button></div>';
        }).join('') + '</div>';
    }
    function drawList() {
      mem.fview = 'list';
      view.innerHTML = '<div class="fx-reqs">' + requestsHtml() + '</div>'
        + '<input type="search" class="fx-search" placeholder="' + esc(w.frSearch) + '" aria-label="' + esc(w.frSearch) + '" value="' + esc(mem.fq || '') + '" autocomplete="off">'
        + '<div class="fx-list">' + rowsHtml() + '</div>'
        + '<button type="button" class="fx-addbtn" data-add="1">' + esc(w.frAddBtn) + '</button>';
    }
    function redrawRows() {
      var l = view.querySelector('.fx-list'), r = view.querySelector('.fx-reqs');
      if (l) l.innerHTML = rowsHtml();
      if (r) r.innerHTML = requestsHtml();
    }

    function answer(id, accept) {
      if (D.busy) { say(w.frBusy); return; }
      D.busy = true;
      ctx.api('/api/friends/' + (accept ? 'accept' : 'decline'), { method: 'POST', body: { friendshipId: id } }).then(function (r) {
        D.busy = false;
        if (r.status === 401) { lost(); return; }
        var q = null;
        D.requests = D.requests.filter(function (x) { if (x.id === id) q = x; return x.id !== id; });
        if (hooks && hooks.onData) hooks.onData(D.requests.length);
        if (!r.ok) { say(r.status === 404 ? w.frGone : fail(r)); redrawRows(); load(true); return; }
        if (accept && r.body && r.body.friend && r.body.friend.id) {
          // Shown at once as Linked at the top; the list is read again behind it for the real numbers.
          var nf = r.body.friend;
          D.friends = D.friends.filter(function (x) { return x.id !== nf.id; });
          D.friends.unshift({ id: nf.id, badge: 'linked', nickname: nf.nickname || '', firstName: nf.firstName || (q && q.firstName) || '', lastName: nf.lastName || (q && q.lastName) || '',
            games: 0, headToHead: { won: 0, lost: 0 }, lastPlayed: null, recent: [], compare: null });
          say(fmt(w.frNowFriend, { name: shownName(D.friends[0]) }));
        } else if (!accept) say(w.frDeclined);
        redrawRows();
        load(true);
      });
    }

    /* ---- the Add a friend form ---- */

    function drawAdd() {
      mem.fview = 'add';
      var form = O.renderAddFriend(view, ctx, function (done) {
        mem.fview = 'list';
        if (done && done.friend) {
          say(done.mode === 'account' ? fmt(w.frRequestSentTo, { name: shownName(done.friend) }) : fmt(w.frAdded, { name: shownName(done.friend) }));
        }
        draw();
        load(true);
      }, { friends: D.loaded ? D.friends : null });
      if (form && form.focus && !quiet) { try { form.focus(); } catch (e) { /* no focus here */ } }
    }

    /* ---- one friend's card ---- */

    function cmpHtml(f) {
      var c = f.compare;
      if (!c || !(c.games > 0) || !c.me) return '';
      var one = !c.them;   // no account / not linked yet: only the caller's own figures
      var mx = c.me.x01 || {}, tx = one ? {} : c.them.x01 || {}, mc = c.me.cricket || {}, tc = one ? {} : c.them.cricket || {};
      var top = '';
      if (isNum(mx.avg3) || isNum(tx.avg3)) top += cmpRow(w.frAvg3, mx.avg3, tx.avg3, d1);
      if (isNum(mc.mpr) || isNum(tc.mpr)) top += cmpRow(w.frMprK, mc.mpr, tc.mpr, d1);
      if (!top) return '';
      var out = '<div class="fx-cmp' + (one ? ' one' : '') + '">' + top + '</div>' + (one ? '<div class="fx-gt none">' + esc(w.frTheirsLater) + '</div>' : '');
      var drawer = '';
      if (mx.legsPlayed || tx.legsPlayed) {
        drawer += '<div class="fx-sub">' + esc(fmt(w.frX01Hdr, { n: Math.max(Number(mx.legsPlayed) || 0, Number(tx.legsPlayed) || 0) })) + '</div>'
          + cmpRow(w.frFirst9, mx.first9, tx.first9, d1) + cmpRow(w.frCheckouts, mx.checkoutPct, tx.checkoutPct, dPct)
          + cmpRow(w.frN180, mx.n180, tx.n180, dInt) + cmpRow(w.frHighFin, mx.highFinish, tx.highFinish, dInt)
          + cmpRow(w.frBestLeg, mx.bestLegDarts, tx.bestLegDarts, dInt, true);
      }
      if (mc.legsPlayed || tc.legsPlayed) {
        drawer += '<div class="fx-sub">' + esc(fmt(w.frCrHdr, { n: Math.max(Number(mc.legsPlayed) || 0, Number(tc.legsPlayed) || 0) })) + '</div>'
          + cmpRow(w.frFirst9Mpr, mc.f9mpr, tc.f9mpr, d1) + cmpRow(w.frRounds5, mc.rounds5, tc.rounds5, dInt)
          + cmpRow(w.frHat, mc.hatTricks, tc.hatTricks, dInt) + cmpRow(w.frBestLeg, mc.bestLegDarts, tc.bestLegDarts, dInt, true);
      }
      if (drawer) {
        out += '<button type="button" class="fx-h2hb" data-h2h="1" aria-expanded="false">' + esc(w.frFull) + ' <span>›</span></button>'
          + '<div class="fx-drw"><div>' + drawer + '</div></div>';
      }
      return out;
    }

    function stateHtml(f) {
      if (f.badge === 'linked') return '';
      var note = f.badge === 'waiting' ? w.frWaitNote : f.asked ? w.frAskedNote : w.frNoneNote;
      var out = '<div class="fx-state"><p>' + esc(note) + '</p>';
      if (f.badge === 'waiting' || f.asked) {
        var later = f.nextResendAt && new Date(f.nextResendAt).getTime() > Date.now();
        out += '<div class="fx-sbtns"><button type="button" data-resend="1"' + (later ? ' disabled' : '') + '>' + esc(w.frResend) + '</button>'
          + (f.badge === 'waiting' ? '<button type="button" data-cancelreq="1">' + esc(w.frCancelReq) + '</button>' : '') + '</div>'
          + (later ? '<small>' + esc(fmt(w.frAgainOn, { date: dateOf(f.nextResendAt) })) + '</small>' : '');
      } else {
        var wait = f.nextInviteAt && new Date(f.nextInviteAt).getTime() > Date.now();
        out += '<div class="fx-sbtns"><button type="button" data-invite="1"' + (wait ? ' disabled' : '') + '>' + esc(w.frInvite) + '</button></div>'
          + (wait ? '<small>' + esc(fmt(w.frAgainOn, { date: dateOf(f.nextInviteAt) })) + '</small>' : '');
      }
      return out + '</div>';
    }

    function drawCard(f) {
      mem.fview = 'card'; mem.fid = f.id;
      var hh = f.headToHead || {}, won = Number(hh.won) || 0, lostN = Number(hh.lost) || 0, n = Number(f.games) || 0;
      var short = shortName(f);
      var score = n > 0
        ? '<div class="fx-h2h"><div><div class="s me">' + won + '</div><small>' + esc(w.frYou) + '</small></div><div class="dash">–</div>'
          + '<div><div class="s th">' + lostN + '</div><small>' + esc(short) + '</small></div></div>'
          + '<div class="fx-gt">' + esc(n === 1 ? w.frGames1 : fmt(w.frGamesN, { n: n })) + '</div>'
        : '<div class="fx-gt none">' + esc(w.frNoGamesYet) + '</div>';
      var cmp = cmpHtml(f);
      if (!cmp && f.badge === 'linked' && n > 0) cmp = '<div class="fx-gt none">' + esc(w.frNoCompare) + '</div>';
      var last = Array.isArray(f.recent) && f.recent.length
        ? '<div class="fx-lbl">' + esc(w.frL5) + '</div><div class="fx-last">' + f.recent.slice(0, 5).map(function (g5, i) {
          return '<span class="' + (g5 && g5.won ? 'w' : 'l') + '" style="animation-delay:' + (0.3 + i * 0.08).toFixed(2) + 's">' + esc(g5 && g5.won ? w.scResW : w.scResL) + '</span>';
        }).join('') + '</div>' : '';
      var real = fullName(f);
      view.innerHTML = '<div class="fx-card"><button type="button" class="fx-back" data-back="1">← ' + esc(w.frBack) + '</button>'
        + iniHtml(f, true)
        + '<h2>' + esc(shownName(f)) + '</h2>'
        + '<div class="fx-real">' + (String(f.nickname || '').trim() && real ? esc(real) + ' · ' : '') + badgeHtml(f.badge, w) + '</div>'
        + score + cmp + last + stateHtml(f)
        + '<button type="button" class="fx-play" data-play="1">' + esc(fmt(w.frPlay, { name: short })) + '</button>'
        + '<div class="fx-acts"><button type="button" data-nick="1">' + esc(w.frEditNick) + '</button><button type="button" data-remove="1">' + esc(w.frRemove) + '</button>'
        + '<button type="button" data-more="1" aria-expanded="false" aria-label="' + esc(w.frMore) + '">•••</button></div>'
        + '<div class="fx-menu" hidden>' + (f.badge === 'none' ? '<button type="button" data-edit="1">' + esc(w.frEditDetails) + '</button>' : '')
        + '<button type="button" class="danger" data-block="1">' + esc(w.frBlock) + '</button></div></div>';
    }

    /* ---- dialogs ---- */

    function closeDialog() { dlg = null; dlgs.innerHTML = ''; }
    /* o: { title, text?, fields?: [{ key, label, value, max }], ok, danger?, run(values, done(errText|null)) } */
    function openDialog(o) {
      var fields = (o.fields || []).map(function (fl, i) {
        return '<div class="fx-fld"><input type="' + (fl.type || 'text') + '" class="fx-in" data-key="' + esc(fl.key) + '" id="fxD' + i + '" placeholder=" " value="' + esc(fl.value || '') + '"'
          + (fl.max ? ' maxlength="' + fl.max + '"' : '') + ' autocomplete="off"><label for="fxD' + i + '">' + esc(fl.label) + '</label></div>';
      }).join('');
      dlgs.innerHTML = '<div class="fx-ovl"><div class="fx-dlg" role="dialog" aria-modal="true" aria-labelledby="fxDt"><h3 id="fxDt">' + esc(o.title) + '</h3>'
        + (o.text ? '<p>' + esc(o.text) + '</p>' : '') + fields + '<div class="fx-err" role="alert"></div>'
        + '<div class="fx-dbtns"><button type="button" data-d="cancel">' + esc(w.frCancel) + '</button>'
        + '<button type="button" class="' + (o.danger ? 'danger' : 'go') + '" data-d="ok">' + esc(o.ok) + '</button></div></div></div>';
      dlg = o;
      var first = dlgs.querySelector('input') || dlgs.querySelector('[data-d="ok"]');
      if (first && first.focus && !quiet) { try { first.focus(); } catch (e) { /* no focus here */ } }
    }
    function runDialog() {
      if (!dlg) return;
      var o = dlg, values = {}, okb = dlgs.querySelector('[data-d="ok"]'), er = dlgs.querySelector('.fx-err');
      dlgs.querySelectorAll('[data-key]').forEach(function (i) { values[i.getAttribute('data-key')] = i.value; });
      if (okb.hasAttribute('disabled')) return;
      okb.setAttribute('disabled', ''); er.textContent = '';
      o.run(values, function (msg) {
        if (dlg !== o) return;
        if (msg) { okb.removeAttribute('disabled'); er.textContent = msg; return; }
        closeDialog();
        draw();   // the card again with what the list now says (or the list, after a removal)
      });
    }

    /* One POST for the open card's friend, then the list is read again (which redraws). after(r) runs on success. */
    function act(path, body, toastText, after) {
      return ctx.api('/api/friends/' + path, { method: 'POST', body: body }).then(function (r) {
        if (r.status === 401) { lost(); return { r: r, ok: false }; }
        if (r.ok) {
          if (toastText) say(toastText);
          if (after) after(r);
          return load(true).then(function () { return { r: r, ok: true }; });
        }
        return { r: r, ok: false };
      });
    }

    function onCard(t, f) {
      var el;
      if (t.closest('[data-back]')) { mem.fview = 'list'; mem.fid = null; draw(); return; }
      if (t.closest('[data-h2h]')) {
        var b = view.querySelector('[data-h2h]'), dr = view.querySelector('.fx-drw'), open = !dr.classList.contains('open');
        if (open) { dr.classList.add('open'); b.classList.add('open'); } else { dr.classList.remove('open'); b.classList.remove('open'); }
        b.setAttribute('aria-expanded', String(open)); return;
      }
      if (t.closest('[data-play]')) {
        // Casual setup (app.js #play -> casual.js) takes ctx.playWith once: this friend is Player 2 already.
        ctx.playWith = { friendshipId: f.id, nickname: shownName(f), name: fullName(f), badge: f.badge };
        ctx.go('#play'); return;
      }
      if (t.closest('[data-more]')) {
        var m = view.querySelector('.fx-menu'), mb = view.querySelector('[data-more]'), on = m.hasAttribute('hidden');
        if (on) m.removeAttribute('hidden'); else m.setAttribute('hidden', '');
        mb.setAttribute('aria-expanded', String(on)); return;
      }
      if (t.closest('[data-nick]')) {
        openDialog({ title: w.frEditNick, ok: w.frSave, fields: [{ key: 'nick', label: w.frNick, value: f.nickname || '', max: O.NICK_MAX }],
          run: function (v, done) { act('update', { friendshipId: f.id, nickname: O.clipNick(v.nick).trim() }, w.frSaved).then(function (x) { done(x.ok ? null : fail(x.r)); }); } });
        return;
      }
      if (t.closest('[data-edit]')) {
        openDialog({ title: w.frEditDetails, ok: w.frSave,
          fields: [{ key: 'first', label: w.frFirst, value: f.firstName, max: 40 }, { key: 'last', label: w.frLast, value: f.lastName, max: 40 },
            { key: 'email', label: w.frEmail, value: f.email || '', max: 254, type: 'email' }],
          run: function (v, done) {
            var body = { friendshipId: f.id, firstName: String(v.first || '').trim(), lastName: String(v.last || '').trim() };
            if (String(v.email || '').trim().toLowerCase() !== String(f.email || '').toLowerCase()) body.email = String(v.email || '').trim();
            act('update', body, w.frSaved).then(function (x) { done(x.ok ? null : fail(x.r)); });
          } });
        return;
      }
      if (t.closest('[data-remove]')) {
        openDialog({ title: fmt(w.frRemoveQ, { name: shownName(f) }), text: w.frRemoveSub, ok: w.frRemove, danger: true,
          run: function (v, done) {
            act('remove', { friendshipId: f.id }, fmt(w.frRemoved, { name: shownName(f) }), function () { mem.fview = 'list'; mem.fid = null; }).then(function (x) { done(x.ok ? null : fail(x.r)); });
          } });
        return;
      }
      if (t.closest('[data-block]')) {
        openDialog({ title: fmt(w.frBlockQ, { name: shownName(f) }), text: w.frBlockSub, ok: w.frBlock, danger: true,
          run: function (v, done) {
            act('block', { friendshipId: f.id }, fmt(w.frBlocked, { name: shownName(f) }), function () { mem.fview = 'list'; mem.fid = null; }).then(function (x) { done(x.ok ? null : fail(x.r)); });
          } });
        return;
      }
      if ((el = t.closest('[data-resend]')) && !el.hasAttribute('disabled')) {
        el.setAttribute('disabled', '');
        act('resend', { friendshipId: f.id }, w.frResent).then(function (x) { if (!x.ok) { say(fail(x.r)); draw(); } });
        return;
      }
      if ((el = t.closest('[data-invite]')) && !el.hasAttribute('disabled')) {
        el.setAttribute('disabled', '');
        act('invite', { friendshipId: f.id, lang: ctx.lang }, null, function (r) { say(r.body && r.body.sent === 'request' ? w.frInviteReq : w.frInvited); }).then(function (x) { if (!x.ok) { say(fail(x.r)); draw(); } });
        return;
      }
      if ((el = t.closest('[data-cancelreq]')) && !el.hasAttribute('disabled')) {
        openDialog({ title: fmt(w.frCancelQ, { name: shownName(f) }), text: w.frCancelSub, ok: w.frCancelReq, danger: true,
          run: function (v, done) { act('cancel', { friendshipId: f.id }, w.frCancelled).then(function (x) { done(x.ok ? null : fail(x.r)); }); } });
      }
    }

    /* ---- the taps ---- */

    box.addEventListener('click', function (ev) {
      var t = ev.target && ev.target.closest ? ev.target : null, el;
      if (!t) return;
      if (dlg) {
        var d = t.closest('[data-d]');
        if (d) { if (d.getAttribute('data-d') === 'ok') runDialog(); else closeDialog(); return; }
        if (t.classList && t.classList.contains('fx-ovl')) closeDialog();
        return;
      }
      if (t.closest('[data-retry]')) { load(); return; }
      if (mem.fview === 'card') { var f = find(mem.fid); if (f) onCard(t, f); return; }
      if (mem.fview === 'add') return;
      if ((el = t.closest('[data-accept]'))) { answer(el.getAttribute('data-accept'), true); return; }
      if ((el = t.closest('[data-decline]'))) { answer(el.getAttribute('data-decline'), false); return; }
      if (t.closest('[data-add]')) { drawAdd(); return; }
      if ((el = t.closest('[data-fid]'))) { var fr = find(el.getAttribute('data-fid')); if (fr) drawCard(fr); }
    });
    box.addEventListener('input', function (ev) {
      var t = ev.target;
      if (t && t.classList && t.classList.contains('fx-search')) { mem.fq = t.value; redrawRows(); }
      else if (dlg && t && t.getAttribute && t.getAttribute('data-key') === 'nick') { var c = O.clipNick(t.value); if (c !== t.value) t.value = c; }
    });
    box.addEventListener('keydown', function (ev) {
      if (dlg && ev.key === 'Escape') closeDialog();
      else if (dlg && ev.key === 'Enter' && ev.target && ev.target.getAttribute && ev.target.getAttribute('data-key')) { if (ev.preventDefault) ev.preventDefault(); runDialog(); }
    });

    if (mem.fview === 'add') drawAdd();
    load();
  }

  /* The gold dot on the Friends tab: asks how many requests wait (no answer: no dot). */
  function peekRequests(ctx, onData) {
    return ctx.api('/api/friends/list').then(function (r) {
      if (r.ok && r.body && Array.isArray(r.body.requests)) onData(r.body.requests.length);
    });
  }

  function render(root, ctx) {
    var A = g().DDAccount, w = ctx.words, p = ctx.player || {};
    var doc = root.ownerDocument;
    var S = { data: null, g: 'x', token: 0, loaded: false, drawn: false, details: {} };
    var name = (String(p.firstName || '') + ' ' + String(p.lastName || '')).trim();
    var quiet = reduced();
    if (mem.pid !== (p.id == null ? null : p.id)) resetMem(p.id);
    var since = p.createdAt ? sinceWords(p.createdAt, ctx.lang) : '';

    function seg(items, cur, key) {
      return items.map(function (it) {
        return '<button type="button" data-' + key + '="' + it[0] + '" class="' + (cur === it[0] ? 'on' : '') + '" aria-pressed="' + (cur === it[0]) + '">' + esc(it[1]) + '</button>';
      }).join('');
    }
    function langBtns() {
      return [['en', w.langEN], ['ms', w.langBM]].map(function (l) {
        return '<button type="button" data-lang="' + l[0] + '"' + (ctx.lang === l[0] ? ' class="on" aria-pressed="true"' : ' aria-pressed="false"') + '>' + esc(l[1]) + '</button>';
      }).join('');
    }

    root.innerHTML = '<div class="scp' + (ctx.wide ? ' wide' : '') + '"><div class="sc-bg"></div><div class="sc-wrap">'
      + '<div class="sc-bar sc-in"><span class="sc-brand">' + esc(w.appName) + '</span><span class="sc-sp"></span>'
      + '<div class="acc-lang" role="group" aria-label="' + esc(w.langGroup) + '">' + langBtns() + '</div>'
      + A.link('#profile', w.profileLink).replace('class="lnk"', 'class="sc-link"')
      + '<button type="button" class="sc-link" data-acc="logout">' + esc(w.logoutLink) + '</button></div>'
      + '<div class="sc-me sc-in" style="animation-delay:.06s"><div class="sc-av"><span>' + esc(initials(p)) + '</span></div>'
      + '<div><h1>' + esc(name) + '</h1><p>' + esc((p.email || '') + (since ? ' \u00B7 ' + fmt(w.scSince, { date: since }) : '')) + '</p></div></div>'
      + '<div class="sc-tabs sc-in" style="animation-delay:.09s" role="tablist">'
      + '<button type="button" role="tab" data-tab="card">' + esc(w.scTabCard) + '</button>'
      + '<button type="button" role="tab" data-tab="friends">' + esc(w.scTabFriends) + '<i class="fx-dot" hidden></i></button></div>'
      + '<div id="scCard"><div class="sc-notes" id="scNotes"></div>'
      + '<div class="sc-ctl sc-in" style="animation-delay:.12s"><div class="sc-seg" id="scSeg" role="group" aria-label="' + esc(w.scFilterLabel) + '"><span class="thumb"></span>'
      + seg([['all', w.scFilterAll], ['tournament', w.scFilterTour], ['casual', w.scFilterCas]], mem.filter, 'f') + '</div>'
      + '<select class="sc-per" id="scPer" aria-label="' + esc(w.scPeriodLabel) + '">'
      + [['30d', w.scPer30], ['year', w.scPerYear], ['all', w.scPerAll]].map(function (o) {
        return '<option value="' + o[0] + '"' + (mem.period === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
      }).join('') + '</select></div>'
      + '<div id="scData"></div></div>'
      + '<div id="scFriends" hidden></div>'
      + '</div><div class="acc-toast" role="status" aria-live="polite"></div></div>';
    A.wire(root, ctx);

    var $ = function (id) { return root.querySelector('#' + id); };
    var segEl = $('scSeg'), thumb = segEl.querySelector('.thumb');

    function moveThumb() {
      var b = segEl.querySelector('button.on');
      if (!b || !b.offsetWidth) { segEl.classList.add('nothumb'); return; }
      thumb.style.left = b.offsetLeft + 'px'; thumb.style.width = b.offsetWidth + 'px';
    }

    /* The gold dot on the Friends tab while a request waits for an answer. */
    function setDot(n) {
      var d = root.querySelector('.fx-dot');
      if (!d) return;
      if (n > 0) d.removeAttribute('hidden'); else d.setAttribute('hidden', '');
    }

    function showTab() {
      var card = mem.tab !== 'friends';
      root.querySelectorAll('.sc-tabs button').forEach(function (b) {
        var on = b.getAttribute('data-tab') === (card ? 'card' : 'friends');
        if (on) b.classList.add('on'); else b.classList.remove('on');
        b.setAttribute('aria-selected', String(on));
      });
      if (card) { $('scCard').removeAttribute('hidden'); $('scFriends').setAttribute('hidden', ''); }
      else { $('scCard').setAttribute('hidden', ''); $('scFriends').removeAttribute('hidden'); API.renderFriends($('scFriends'), ctx, { onData: setDot }); }
      if (card) moveThumb();
    }

    /* ---- the numbers part ---- */

    function trendHtml(v) {
      if (!isNum(v)) return '';
      var word = mem.period === 'year' ? w.scTrendYear : w.scTrend30;
      return '<span class="sc-trend ' + (v >= 0 ? 'up' : 'dn') + '">' + (v >= 0 ? '▲ +' : '▼ ') + Math.abs(v).toFixed(1) + ' ' + esc(word) + '</span>';
    }

    function headCards(d) {
      var hx = d.headline && d.headline.x01 || {}, hc = d.headline && d.headline.cricket || {};
      return '<div class="sc-heads sc-in" style="animation-delay:.18s">'
        + '<button type="button" class="sc-hd x' + (S.g === 'x' ? ' on' : '') + '" data-g="x" aria-pressed="' + (S.g === 'x') + '"><div class="sc-lbl">' + esc(w.scHeadXLabel) + '</div>'
        + '<div class="v" data-to="' + (isNum(hx.avg3) ? hx.avg3 : '') + '">' + esc(num(hx.avg3, 1)) + '</div><div class="g">' + esc(w.scHeadXGame) + '</div>' + trendHtml(hx.trend) + '</button>'
        + '<button type="button" class="sc-hd c' + (S.g === 'c' ? ' on' : '') + '" data-g="c" aria-pressed="' + (S.g === 'c') + '"><div class="sc-lbl">' + esc(w.scHeadCLabel) + '</div>'
        + '<div class="v" data-to="' + (isNum(hc.mpr) ? hc.mpr : '') + '">' + esc(num(hc.mpr, 1)) + '</div><div class="g">' + esc(w.scHeadCGame) + '</div>' + trendHtml(hc.trend) + '</button></div>';
    }

    function chartCard() {
      return '<div class="sc-card sc-in" style="animation-delay:.24s"><div class="sc-ct"><div class="sc-lbl" id="scChl"></div><div class="sc-rec2" id="scRec"></div></div>'
        + '<div class="sc-chart" id="scChart"></div>'
        + '<div class="sc-key"><span><i style="background:#ffc61a"></i>' + esc(w.scKeyTour) + '</span><span><i style="background:#22b4ff"></i>' + esc(w.scKeyCas) + '</span></div>'
        + '<button type="button" class="sc-more" id="scMore" aria-expanded="false"><span id="scMoreL"></span>' + CHEVRON + '</button>'
        + '<div class="sc-drawer" id="scDrawer"><div><div class="sc-tiles" id="scTiles"></div></div></div></div>';
    }

    function kindCards(d) {
      var t = d.summary && d.summary.tournament || {}, c = d.summary && d.summary.casual || {};
      var out = '';
      if (mem.filter !== 'casual') {
        out += '<div class="sc-kind t sc-in" style="animation-delay:.3s"><h3>' + esc(w.scTourTitle) + '</h3>'
          + kv(w.scTourEvents, isNum(t.events) ? String(t.events) : DASH) + kv(w.scTourTitles, isNum(t.titles) ? String(t.titles) : DASH)
          + kv(w.scTourBest, typeof t.bestFinish === 'string' && t.bestFinish ? t.bestFinish : DASH)
          + kv(w.scTourLatest, typeof t.latest === 'string' && t.latest ? t.latest : DASH) + '</div>';
      }
      if (mem.filter !== 'tournament') {
        var fav = c.favouriteGame ? gameWord(c.favouriteGame, w) : DASH;
        var mp = c.mostPlayedWith && c.mostPlayedWith.name ? (fmt(w.scWithGames, { name: c.mostPlayedWith.name, n: c.mostPlayedWith.games }) || String(c.mostPlayedWith.name)) : DASH;
        out += '<div class="sc-kind c sc-in" style="animation-delay:.36s"><h3>' + esc(w.scCasTitle) + '</h3>'
          + kv(w.scCasPlayed, isNum(c.played) ? String(c.played) : DASH) + kv(w.scCasWon, pct(c.wonPct)) + kv(w.scCasFav, fav) + kv(w.scCasWith, mp) + '</div>';
      }
      return '<div class="sc-two' + (mem.filter === 'all' ? '' : ' one') + '">' + out + '</div>';
    }
    function kv(k, v) { return '<div class="sc-kv"><span>' + esc(k) + '</span><b>' + esc(v) + '</b></div>'; }

    function recentCard(d) {
      var rows = (Array.isArray(d.recent) ? d.recent : []).filter(function (r) { return r && typeof r.id === 'string'; });
      if (!rows.length) return '';
      return '<div class="sc-card sc-recent sc-in" style="animation-delay:.42s"><h2>' + esc(w.scRecentTitle) + '</h2><div class="sc-hint">' + esc(w.scRecentHint) + '</div><div id="scRecent">'
        + rows.map(function (r) {
          var h = r.headline || {}, tag = r.kind === 'tournament' ? 't' : 'c';
          // 01 shows 3DA, Cricket MPR, Choice both
          var lab = (isNum(h.avg3) ? '<small>' + esc(fmt(w.scHeadlineX, { v: h.avg3.toFixed(1) })) + '</small>' : '')
            + (isNum(h.mpr) ? '<small class="k">' + esc(fmt(w.scHeadlineC, { v: h.mpr.toFixed(1) })) + '</small>' : '');
          var opp = r.opponent && r.opponent.name ? String(r.opponent.name) : '';
          var meta = gameWord(r.game, w) + (isNum(r.bestOf) ? ' · ' + fmt(w.scBestOf, { n: r.bestOf }) : '') + (r.playedAt ? ' · ' + A.dateWords(r.playedAt, ctx.lang) : '');
          return '<div class="sc-m" data-id="' + esc(r.id) + '"><button type="button" class="sc-row" aria-expanded="false">'
            + '<div class="sc-res ' + (r.won ? 'w' : 'l') + '">' + esc(r.won ? w.scResW : w.scResL) + '</div>'
            + '<div style="min-width:0"><div class="who">' + esc(fmt(w.scVs, { name: opp })) + '</div><div class="what"><span class="sc-tag ' + tag + '">' + esc(tag === 't' ? w.scTagTour : w.scTagCas) + '</span>' + esc(meta) + '</div></div>'
            + '<div class="scr">' + esc(r.score == null ? '' : r.score) + lab + '</div></button>'
            + '<div class="sc-drawer"><div><div class="pad"></div></div></div></div>';
        }).join('') + '</div></div>';
    }

    function ctaBlock() {
      return '<a href="#play" class="sc-cta sc-in" style="animation-delay:.5s" data-go="#play">' + esc(w.playCasualBtn) + '</a><p class="sc-note">' + esc(w.scNote) + '</p>';
    }

    function isEmpty(d) {
      var none = function (a) { return !Array.isArray(a) || !a.length; };
      return none(d.recent) && d.chart && none(d.chart.x01) && none(d.chart.cricket) && !(d.summary && d.summary.casual && d.summary.casual.played)
        && !(d.summary && d.summary.tournament && d.summary.tournament.events);
    }

    function drawData() {
      var d = S.data, host = $('scData');
      if (!d) return;
      var empty = isEmpty(d);
      var html;
      if (empty) {
        var tour = mem.filter === 'tournament';
        html = headCards(d) + '<div class="sc-empty sc-in" style="animation-delay:.24s"><h2>' + esc(tour ? w.scTourEmpty : w.scEmptyTitle) + '</h2>'
          + (tour ? '' : '<p>' + esc(w.scEmptySub) + '</p>') + '</div>' + ctaBlock();
        host.innerHTML = html;
      } else {
        host.innerHTML = '<div class="sc-grid"><div>' + headCards(d) + chartCard() + '</div><div>' + kindCards(d) + recentCard(d) + ctaBlock() + '</div></div>';
        drawChart(true);
      }
      S.drawn = true;
      animateNumbers(host);
    }

    function animateNumbers(host) {
      var raf = g().requestAnimationFrame;
      host.querySelectorAll('.sc-hd .v').forEach(function (el) {
        var to = parseFloat(el.getAttribute('data-to'));
        if (!isFinite(to) || quiet || !raf) return;
        var t0 = null;
        el.textContent = (0).toFixed(1);
        (function step(t) {
          if (t0 === null) t0 = t;
          var pr = Math.min(1, (t - t0) / 900), e = 1 - Math.pow(1 - pr, 3);
          el.textContent = (to * e).toFixed(1);
          if (pr < 1 && el.isConnected !== false) raf(step);
        })(0);
      });
    }

    /* The chart, the label over it and the drawer's tiles for the card that is on. animate: draw the line in. */
    function drawChart(animate) {
      var d = S.data, x = S.g === 'x';
      if (!d || !$('scChart')) return;
      var pts = d.chart && Array.isArray(d.chart[x ? 'x01' : 'cricket']) ? d.chart[x ? 'x01' : 'cricket'].filter(function (q) { return q && isNum(q.value); }) : [];
      $('scChl').textContent = x ? w.scChartX : w.scChartC;
      $('scRec').textContent = pts.length ? (pts.length === 1 ? w.scGames1 : fmt(w.scGamesN, { n: pts.length })) : '';
      $('scMoreL').textContent = x ? w.scMoreX : w.scMoreC;
      $('scTiles').innerHTML = x ? xTiles(d.breakdown && d.breakdown.x01, w) : cTiles(d.breakdown && d.breakdown.cricket, w);
      var host = $('scChart'), col = x ? '#ffc61a' : '#22b4ff';
      if (!pts.length) { host.innerHTML = '<div class="none">' + esc(w.scNoChart) + '</div>'; return; }
      var W = host.clientWidth || 600, H = 140, P = 14, n = pts.length;
      var lo = Math.min.apply(null, pts.map(function (q) { return q.value; })), hi = Math.max.apply(null, pts.map(function (q) { return q.value; }));
      if (hi - lo < 0.5) { lo -= 0.5; hi += 0.5; } else { var pad = (hi - lo) * 0.12; lo -= pad; hi += pad; }
      var xy = pts.map(function (q, i) {
        return [n === 1 ? W / 2 : P + i * (W - 2 * P) / (n - 1), H - P - (q.value - lo) / (hi - lo) * (H - 2 * P), q];
      });
      var path = xy.map(function (q, i) { return (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1); }).join('');
      var anim = animate && !quiet;
      host.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(x ? w.scChartX : w.scChartC) + '"><path class="ln" d="' + path + '" stroke="' + col + '"/>'
        + xy.map(function (q, i) {
          var fill = q[2].kind === 'tournament' ? '#ffc61a' : '#22b4ff';
          var tip = q[2].value.toFixed(1) + (q[2].at ? ' · ' + A.dateWords(q[2].at, ctx.lang) : '');
          return '<circle class="pt" cx="' + q[0].toFixed(1) + '" cy="' + q[1].toFixed(1) + '" r="' + (anim ? 0 : 6) + '" fill="' + fill + '"><title>' + esc(tip) + '</title>'
            + (anim ? '<animate attributeName="r" from="0" to="6" begin="' + (0.2 + i * 0.05).toFixed(2) + 's" dur=".3s" fill="freeze"/>' : '') + '</circle>';
        }).join('') + '</svg>';
      var ln = host.querySelector('.ln');
      if (anim && ln && ln.getTotalLength) {
        try {
          var len = ln.getTotalLength();
          ln.style.strokeDasharray = len; ln.style.strokeDashoffset = len;
          ln.getBoundingClientRect();
          ln.style.transition = 'stroke-dashoffset 1.1s cubic-bezier(.2,.8,.2,1)';
          ln.style.strokeDashoffset = 0;
        } catch (e) { /* no layout: the line just shows */ }
      }
    }

    /* ---- notices ---- */

    function showNotices(list) {
      var fresh = (Array.isArray(list) ? list : []).filter(function (n) { return n && typeof n.id === 'string' && !seenNotices[n.id]; });
      if (!fresh.length) return;
      var ids = fresh.map(function (n) { return n.id; });
      ids.forEach(function (id) { seenNotices[id] = true; });
      var shown = fresh.map(function (n) { return { id: n.id, text: noticeText(n, w) }; }).filter(function (n) { return n.text; });
      $('scNotes').innerHTML = shown.map(function (n) {
        return '<div class="sc-notice sc-in" role="status"><span>' + esc(n.text) + '</span><button type="button" data-dismiss="1">' + esc(w.scNoticeClose) + '</button></div>';
      }).join('');
      // Marked read as soon as they are on screen: unknown kinds too, so they do not come back every time.
      ctx.api('/api/games/notices-read', { method: 'POST', body: { ids: ids } });
    }

    /* ---- loading ---- */

    function load() {
      var my = ++S.token, host = $('scData');
      if (S.drawn) host.classList.add('sc-busy');
      else host.innerHTML = '<p class="sc-note">' + esc(w.scLoading) + '</p>';
      return ctx.api('/api/games/scorecard?filter=' + encodeURIComponent(mem.filter) + '&period=' + encodeURIComponent(mem.period)).then(function (r) {
        if (my !== S.token) return;   // a newer tap has taken over
        host.classList.remove('sc-busy');
        if (r.status === 401) { resetMem(null); ctx.setPlayer(null); ctx.go(''); return; }
        if (!r.ok || !r.body || !r.body.headline) {
          S.drawn = false;
          host.innerHTML = '<div class="sc-empty sc-fail"><p>' + esc(r.status === 0 ? w.scOffline : w.scLoadFailed) + '</p><button type="button" data-retry="1">' + esc(w.scRetry) + '</button></div>';
          return;
        }
        S.data = r.body; S.details = {};
        drawData();
        showNotices(r.body.notices);
      });
    }

    /* ---- the taps ---- */

    root.addEventListener('click', function (ev) {
      var t = ev.target && ev.target.closest ? ev.target : null;
      if (!t) return;
      var el;
      if (t.closest('[data-acc="logout"]')) resetMem(null);   // account.js does the log out itself
      if ((el = t.closest('[data-tab]'))) { mem.tab = el.getAttribute('data-tab') === 'friends' ? 'friends' : 'card'; showTab(); return; }
      if ((el = t.closest('[data-f]'))) {
        var f = el.getAttribute('data-f');
        if (f === mem.filter) return;
        mem.filter = f;
        segEl.querySelectorAll('button').forEach(function (b) {
          var on = b === el; if (on) b.classList.add('on'); else b.classList.remove('on'); b.setAttribute('aria-pressed', String(on));
        });
        moveThumb(); load(); return;
      }
      if ((el = t.closest('[data-g]'))) {
        S.g = el.getAttribute('data-g') === 'c' ? 'c' : 'x';
        root.querySelectorAll('.sc-hd').forEach(function (b) {
          var on = b === el; if (on) b.classList.add('on'); else b.classList.remove('on'); b.setAttribute('aria-pressed', String(on));
        });
        drawChart(true); return;
      }
      if (t.closest('#scMore')) {
        var more = $('scMore'), open = !more.classList.contains('open');
        if (open) { more.classList.add('open'); $('scDrawer').classList.add('open'); } else { more.classList.remove('open'); $('scDrawer').classList.remove('open'); }
        more.setAttribute('aria-expanded', String(open)); return;
      }
      if ((el = t.closest('[data-dismiss]'))) { var box = el.closest('.sc-notice'); if (box && box.parentNode) box.parentNode.removeChild(box); return; }
      if (t.closest('[data-retry]')) { load(); return; }
      if ((el = t.closest('.sc-row'))) { toggleMatch(el.parentNode); }
    });
    $('scPer').addEventListener('change', function () {
      var v = $('scPer').value;
      mem.period = v === 'year' || v === 'all' ? v : '30d';
      load();
    });
    onResize = moveThumb;
    if (!resizeHooked && typeof g().addEventListener === 'function') { resizeHooked = true; g().addEventListener('resize', function () { if (onResize) onResize(); }); }

    /* A recent match opens to its stats: both players' where the server allows (games/one), fetched once per match. */
    function toggleMatch(m) {
      var row = m.querySelector('.sc-row'), dr = m.querySelector('.sc-drawer'), pad = m.querySelector('.pad'), id = m.getAttribute('data-id');
      var open = !dr.classList.contains('open');
      if (open) dr.classList.add('open'); else dr.classList.remove('open');
      row.setAttribute('aria-expanded', String(open));
      if (!open || S.details[id] === 'done' || S.details[id] === 'loading') return;
      S.details[id] = 'loading';
      pad.innerHTML = '<div class="sc-msg">' + esc(w.scDetailLoading) + '</div>';
      ctx.api('/api/games/one?id=' + encodeURIComponent(id)).then(function (r) {
        if (r.status === 401) { resetMem(null); ctx.setPlayer(null); ctx.go(''); return; }
        var gm = r.ok && r.body && r.body.game;
        if (!gm) { S.details[id] = null; pad.innerHTML = '<div class="sc-msg">' + esc(w.scDetailFailed) + '</div>'; return; }
        S.details[id] = 'done';
        var out = '<div class="sc-who">' + esc(gm.me && gm.me.name ? gm.me.name : w.scYou) + '</div>' + (statsTiles(gm.me && gm.me.stats, w) || '<div class="sc-msg">' + esc(w.scNoStats) + '</div>');
        var on = gm.opponent && gm.opponent.name ? gm.opponent.name : '';
        out += '<div class="sc-who">' + esc(on) + '</div>' + (gm.opponent && gm.opponent.stats ? statsTiles(gm.opponent.stats, w) : '<div class="sc-msg">' + esc(w.scNoOppStats) + '</div>');
        pad.innerHTML = out;
      });
    }

    showTab();
    moveThumb();
    load();
    if (mem.tab !== 'friends') peekRequests(ctx, setDot);   // the Friends tab fetches its own list when it is opened
    return { reload: load };
  }

  var API = { render: render, renderFriends: renderFriends, peekRequests: peekRequests, noticeText: noticeText, xTiles: xTiles, cTiles: cTiles };
  /* app.js calls this to draw the logged-in home. */
  API.renderScorecard = render;
  return API;
});

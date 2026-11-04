/* The floor officials' scoring page (score.html at /score/<token>; spec docs/superpowers/specs/2026-10-30-floor-officials-design.md).
   An official opens the link the organiser sent, types the PIN once, and sees only the matches on their boards. A result
   is kept on the phone first (DDOffline, keyed by the link) and sent one by one to /api/score/result; with no signal
   it waits and is sent when there is a connection (tried every 5-30 s while the page is open). The page and the last
   list are kept on the phone (sw.js, scope /score/), so it also opens with no signal once it has been opened with
   signal. A result the server refuses (another official got there first, the organiser changed it, not your board any
   more, the link ended) is never sent again: it is listed as "Not sent — tell the organiser". Every text shown is
   escaped or set with textContent. */
(function(){
  var TOKEN = (location.pathname.match(/\/score\/([A-Za-z0-9_-]{20,100})/) || [])[1] || '';
  var ORG = 'score:' + TOKEN.slice(0, 12);          // this link's corner of the device store
  var LANG_KEY = 'dartdraw.lang';
  var FETCH_MS = 6000, POLL_MS = 15000, CORRECT_MS = 5 * 60 * 1000;
  var lang = 'en';
  var profile = null;      // { session, event, official, endsAt }
  var data = null;         // the last /api/score/matches answer
  var dataAt = null;       // when it was fetched
  var queue = [];          // [{ id, pos, op, la, lb, side, rv, at }] waiting to be sent
  var notSent = [];        // [{ pos, op, la, lb, side, reason, label }]
  var offline = false, sending = false, retryTimer = null, retryDelay = 5000, view = 'loading', endedReason = null;

  /* ---------- words ---------- */
  function T(k, vars){
    var tab = lang === 'ms' && typeof DD_SCORE_MS !== 'undefined' ? DD_SCORE_MS : DD_SCORE_EN;
    var s = (tab && tab[k] != null) ? tab[k] : (DD_SCORE_EN[k] != null ? DD_SCORE_EN[k] : k);
    return String(s).replace(/\{(\w+)\}/g, function(m, v){ return vars && vars[v] != null ? vars[v] : m; });
  }
  function esc(v){ return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
  function setLang(l){
    lang = l === 'ms' ? 'ms' : 'en';
    try{ localStorage.setItem(LANG_KEY, lang); }catch(e){}
    document.documentElement.lang = lang;
    document.title = T('title');
    Array.prototype.forEach.call(document.querySelectorAll('#langGroup button'), function(b){ b.setAttribute('aria-pressed', b.getAttribute('data-lang') === lang ? 'true' : 'false'); });
    render();
    var sh = document.getElementById('sheet');
    if(sh && !sh.hidden && formPos) openForm(formPos);   // an open result form follows the language too (from its first screen)
  }
  function startLang(){
    var q = (location.search.match(/[?&]lang=(ms|en)\b/) || [])[1];
    var saved = null; try{ saved = localStorage.getItem(LANG_KEY); }catch(e){}
    lang = q || (saved === 'ms' ? 'ms' : 'en');
    document.documentElement.lang = lang; document.title = T('title');
    Array.prototype.forEach.call(document.querySelectorAll('#langGroup button'), function(b){
      b.setAttribute('aria-pressed', b.getAttribute('data-lang') === lang ? 'true' : 'false');
      b.onclick = function(){ setLang(b.getAttribute('data-lang')); };
    });
  }

  /* ---------- network ---------- */
  function call(method, url, body){
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null, timer = null;
    var opts = { method: method, headers: {} };
    if(body){ opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    if(profile && profile.session) opts.headers['X-Score-Session'] = profile.session;
    if(ctrl) opts.signal = ctrl.signal;
    var late = new Promise(function(res, rej){ timer = setTimeout(function(){ try{ if(ctrl) ctrl.abort(); }catch(e){} rej(new Error('timeout')); }, FETCH_MS); });
    return Promise.race([fetch(url, opts), late]).then(function(r){
      clearTimeout(timer); offline = false;
      return r.json().catch(function(){ return {}; }).then(function(b){ return { status: r.status, ok: r.ok, body: b || {} }; });
    }, function(e){ clearTimeout(timer); offline = true; throw e; });
  }

  /* ---------- device store ---------- */
  function saveQueue(){ return DDOffline.putQueue(ORG, 'q', { items: queue, notSent: notSent }); }
  function saveProfile(){ return DDOffline.putProfile(ORG, profile); }
  function saveData(){ return DDOffline.putEvent(ORG, 'matches', { data: data, at: dataAt }); }

  /* ---------- the list, with this phone's waiting results put in ---------- */
  function names(id){ return (data && data.entries && data.entries[id]) || '?'; }
  function slotsView(){
    if(!data) return [];
    var pend = {}; queue.forEach(function(q){ pend[q.pos] = q; });
    return data.slots.map(function(s){
      var q = pend[s.pos];
      if(!q) return s;
      var v = JSON.parse(JSON.stringify(s));
      v.pending = true;
      if(q.op === 'call'){ v.state = 'called'; return v; }
      if(q.op === 'uncall'){ v.state = 'open'; return v; }
      v.state = 'done'; v.by = 'me'; v.at = q.at;
      if(q.op === 'score') v.result = s.kind === 'rr' ? { legs1: q.la, legs2: q.lb } : { aLegs: q.la, bLegs: q.lb };
      else if(q.op === 'win') v.result = { winnerId: q.side === 'b' ? s.b : s.a };
      else if(q.op === 'void') v.result = { void: true };
      else v.result = { wo: true, noShowSide: q.side };
      return v;
    });
  }
  /* The match as the paper at the board numbers it: round robin "Group A · Match 3 · 1 v 3" (the sheet's printed match
     order and chart positions), knockout "Quarter-final · Match 3-1" (+ "Board group 2"). */
  function where(s){
    var parts = [], info = s.info || {};
    if(s.kind === 'rr'){
      parts.push(T('group', { g: s.group }));
      if(info.matchNo > 0) parts.push(T('matchNo', { n: info.matchNo }));
      if(info.posA > 0 && info.posB > 0) parts.push(T('pos', { a: info.flip ? info.posB : info.posA, b: info.flip ? info.posA : info.posB }));
    } else {
      if(s.group) parts.push(T('group', { g: s.group }));
      else if(s.bracket === 'plate') parts.push(T('b.plate'));
      else if(s.bracket === 'finals') parts.push(T('b.finals'));
      if(info.boardGroup > 0) parts.push(T('boardGroup', { n: info.boardGroup }));
      if(s.round) parts.push(T('r.' + s.round.code, { n: s.round.n }));
      if(info.matchNo) parts.push(T('matchNo', { n: info.matchNo }));
    }
    return parts.join(' · ');
  }
  /* The side the paper names first: the sheet may print slot.b first (round robin). Names, results and leg boxes follow it. */
  function sides(s){ return s.info && s.info.flip ? ['b', 'a'] : ['a', 'b']; }
  function whoText(s, wrap){ var o = sides(s); return T('vs', { a: wrap(names(s[o[0]])), b: wrap(names(s[o[1]])) }); }
  function resultText(s){
    var r = s.result; if(!r) return '';
    if(r.void) return T('void');
    if(r.noShowSide) return T('wo');
    var a = s.kind === 'rr' ? r.legs1 : r.aLegs, b = s.kind === 'rr' ? r.legs2 : r.bLegs;
    if(sides(s)[0] === 'b'){ var x = a; a = b; b = x; }
    if(s.kind === 'ko' && a == null && b == null && r.winnerId) return T('won', { name: names(r.winnerId) });   // the winner picked, no legs
    return (a == null ? '-' : a) + '–' + (b == null ? '-' : b) + (r.wo ? ' (' + T('wo') + ')' : '');
  }
  function mmss(ms){ var s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

  /* ---------- screens ---------- */
  var main = function(){ return document.getElementById('main'); };
  /* The top bar (owner, 2026-11-02): the event on the first line, beside the language switch (always whole on screen);
     the official, their boards and the sending status under it, with when the list was last fetched. */
  function hhmm(t){ return new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
  function header(){
    var ev = profile && profile.event, of = profile && profile.official;
    var evEl = document.getElementById('evLine');
    evEl.textContent = ev ? (ev.eventName || ev.name || 'DartDraw') : 'DartDraw';
    evEl.title = ev ? [ev.name, ev.eventName].filter(Boolean).join(' — ') : '';
    var net = document.getElementById('netLine');
    var n = queue.length;
    net.className = 'net' + (offline || n ? ' warn' : '');
    var status = offline ? (n ? T('net.offline', { n: n }) : data && dataAt ? T('net.offlineList', { time: hhmm(dataAt) }) : T('net.offlineNone'))
      : sending || n ? T('net.sending') : (data ? T('net.ok') + (dataAt ? ' · ' + T('updated', { time: hhmm(dataAt) }) : '') : '');
    net.textContent = [of ? T('hello', { name: of.name, boards: (of.boards || []).join(', ') }) : '', status].filter(Boolean).join(' · ');
    try{ var bar = document.getElementById('topBar'); if(bar && document.documentElement.style) document.documentElement.style.setProperty('--hh', bar.offsetHeight + 'px'); }catch(e){}
  }
  function render(){
    header();
    var m = main(); if(!m) return;
    if(view === 'loading'){ m.innerHTML = ''; return; }
    if(view === 'pin'){
      m.innerHTML = '<div class="card"><h2>' + esc(T('pin.title')) + '</h2><p class="hint">' + esc(T('pin.sub')) + '</p>' +
        '<input class="pin" id="pin" inputmode="numeric" autocomplete="one-time-code" maxlength="4" pattern="[0-9]*">' +
        '<div class="err" id="pinErr"></div><button class="btn" style="width:100%" id="pinGo">' + esc(T('pin.go')) + '</button></div>';
      var go = function(){ openWithPin(document.getElementById('pin').value); };
      var pin = document.getElementById('pin');
      document.getElementById('pinGo').onclick = go;
      pin.onkeydown = function(e){ if(e.key === 'Enter') go(); };
      pin.oninput = function(){ pin.value = pin.value.replace(/\D/g, '').slice(0, 4); if(pin.value.length === 4) go(); };   // the 4th digit opens it
      try{ pin.focus(); }catch(e){}
      return;
    }
    if(view === 'first'){
      m.innerHTML = '<div class="card"><h2>' + esc(T('first.title')) + '</h2><p>' + esc(T('first.text')) + '</p><button class="btn" id="again">' + esc(T('first.retry')) + '</button></div>';
      document.getElementById('again').onclick = function(){ location.reload(); };
      return;
    }
    if(view === 'unknown'){ m.innerHTML = '<div class="card"><p>' + esc(T('pin.unknown')) + '</p></div>'; return; }
    var html = '';
    if(view === 'ended'){
      var key = { link_stopped: 'ended.stopped', stopped: 'ended.stopped', link_replaced: 'ended.replaced', new_link: 'ended.replaced', event_finalized: 'ended.finalized', finalized: 'ended.finalized' }[endedReason] || 'ended.ended';
      html += '<div class="card notsent"><h2>' + esc(T('ended.title')) + '</h2><p>' + esc(T(key, { date: profile && profile.event && profile.event.date || '' })) + '</p></div>';
    }
    html += takeoversHTML();
    html += notSentHTML();
    var list = slotsView();
    if(!list.length){ m.innerHTML = html + '<div class="card"><p class="hint">' + esc(T('none')) + '</p></div>'; return; }
    /* One board at a time (owner, 2026-11-02): a button per board, each with how many matches it has to play; only the
       chosen board's matches are shown. On it: "To play" (a called match first, then the rest in printed order: any of
       them can be scored at any time), then the matches still waiting for their players, then "Done". */
    var boards = [];
    list.forEach(function(s){ if(boards.indexOf(s.board) < 0) boards.push(s.board); });
    if(activeBoard == null || boards.map(String).indexOf(String(activeBoard)) < 0) activeBoard = String(boards[0]);
    var toPlayCount = function(b){ return list.filter(function(s){ return s.board === b && (s.state === 'open' || s.state === 'called'); }).length; };
    if(boards.length > 1) html += '<div class="tabs" id="tabs">' + boards.map(function(b){
      var n = toPlayCount(b), on = String(b) === activeBoard;
      return '<button type="button" class="tab" data-tab="' + esc(b) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + esc(T('board', { b: b })) + (n ? ' <span class="cnt">' + n + '</span>' : '') + '</button>';
    }).join('') + '</div>';
    boards.filter(function(b){ return boards.length < 2 || String(b) === activeBoard; }).forEach(function(b){
      var mine = list.filter(function(s){ return s.board === b; });
      var toPlay = mine.filter(function(s){ return s.state === 'called'; }).concat(mine.filter(function(s){ return s.state === 'open'; }));
      var sec = function(title, rows){ return rows.length ? '<div class="bh">' + esc(T('board', { b: b }) + ' · ' + title) + '</div>' + rows.map(rowHTML).join('') : ''; };
      var parts = [[T('sec.toPlay'), toPlay], [T('sec.waiting'), mine.filter(function(s){ return s.state === 'waiting'; })], [T('sec.done'), mine.filter(function(s){ return s.state === 'done'; })]].filter(function(p){ return p[1].length; });
      /* nothing called on this board: the first match to play is marked Next (a guide on this phone only; nothing is announced) */
      var playable = toPlay.filter(function(s){ return !s.onTablet; });   // a match a tablet is scoring is not "Next"
      nextPos = playable.length && playable[0].state !== 'called' ? playable[0].pos : null;
      html += parts.map(function(p){ return sec(p[0], p[1]); }).join('');
    });
    m.innerHTML = html;
    Array.prototype.forEach.call(m.querySelectorAll('[data-tk]'), function(btn){ btn.onclick = function(){ answerTakeover(btn.getAttribute('data-tk'), btn.getAttribute('data-ans')); }; });
    Array.prototype.forEach.call(m.querySelectorAll('[data-pos]'), function(btn){ btn.onclick = function(e){ if(e && e.stopPropagation) e.stopPropagation(); openForm(btn.getAttribute('data-pos')); }; });
    var tabs = document.getElementById('tabs');
    if(tabs){
      try{ document.documentElement.style.setProperty('--th', tabs.offsetHeight + 'px'); }catch(e){}
      Array.prototype.forEach.call(tabs.querySelectorAll('[data-tab]'), function(t){ t.onclick = function(){ showBoard(t.getAttribute('data-tab')); }; });
    } else { try{ document.documentElement.style.setProperty('--th', '0px'); }catch(e){} }
    var d = document.getElementById('dismissNotSent');
    if(d) d.onclick = function(){ notSent = []; saveQueue(); render(); };
  }
  /* One match: the paper's line as a tag, the two names stacked with "v" between (in the paper's order). A match to play
     is one big button; the called one is highlighted and the only blue "Enter". A done match says who won. */
  function rowHTML(s){
    var o = sides(s), tag = '<span class="ptag">' + esc(where(s)) + '</span>';
    var names2 = '<div class="nm">' + esc(names(s[o[0]])) + '</div><div class="vs">' + esc(T('v')) + '</div><div class="nm">' + esc(names(s[o[1]])) + '</div>';
    if(s.state === 'done'){
      var by = s.pending ? '<span class="pending">' + esc(T('pending')) + '</span>' : esc(T('by.' + (s.by || 'o')));
      if(s.playedOn) by += ' · ' + esc(T('live.playedOn', { b: s.playedOn }));   // a lent board's match, on a Live event
      var fix = view !== 'ended' && !s.pending && s.canCorrect && s.at && Date.now() - s.at < CORRECT_MS
        ? '<button class="btn ghost" data-pos="' + esc(s.pos) + '">' + esc(T('correct', { time: mmss(CORRECT_MS - (Date.now() - s.at)) })) + '</button>' : '';
      return '<div class="mrow done"><div class="tx">' + tag + names2 + '<div class="won">' + esc(doneText(s)) + '</div><div class="meta">' + by + '</div></div>' + (fix ? '<div class="side">' + fix + '</div>' : '') + '</div>';
    }
    /* Live event: a match a tablet is scoring takes no entry here (the paper switch comes later); it says where it is played */
    if(s.onTablet) return '<div class="mrow wait"><div class="tx">' + tag + names2 + '<div class="meta">' + esc(T('live.onTablet')) + (s.playedOn ? ' · ' + esc(T('live.playingOn', { b: s.playedOn })) : '') + '</div></div></div>';
    if(s.state === 'waiting' || view === 'ended') return '<div class="mrow wait"><div class="tx">' + tag + names2 + '</div></div>';
    var called = s.state === 'called', next = !called && s.pos === nextPos;
    return '<button type="button" class="mrow' + (called ? ' called' : next ? ' next' : '') + '" data-pos="' + esc(s.pos) + '"><span class="tx">' + tag + names2 +
      (called ? '<div class="callmark">' + esc(T('sec.called')) + '</div>' : next ? '<div class="nextmark">' + esc(T('sec.nextUp')) + '</div>' : '') + '</span>' +
      (called || next ? '<span class="go">' + esc(T('enterShort')) + '</span>' : '<span class="chev" aria-hidden="true">›</span>') + '</button>';
  }
  /* "XXX won 3–1" (the winner's legs first), "Ali won" (winner only), or as resultText for the rest */
  function doneText(s){
    var r = s.result; if(!r) return '';
    var a = s.kind === 'rr' ? r.legs1 : r.aLegs, b = s.kind === 'rr' ? r.legs2 : r.bLegs;
    if(r.void || r.noShowSide || a == null || b == null || Number(a) === Number(b)) return resultText(s);
    var w = Number(a) > Number(b) ? s.a : s.b;
    return T('wonScore', { name: names(w), w: Math.max(Number(a), Number(b)), l: Math.min(Number(a), Number(b)) }) + (r.wo ? ' (' + T('wo') + ')' : '');
  }
  /* a board button shows that board's matches only, from the top */
  function showBoard(b){
    activeBoard = String(b);
    render();
    try{ window.scrollTo(0, 0); }catch(e){}
  }
  /* Live event whose organiser lets floor officials approve: a tablet on another board asks to take over a match from the tablet
     scoring it, on one of this official's boards. The server sends the waiting requests (data.takeovers) only when the
     official may answer them; Allow / Deny go to /api/score/takeover and the row goes away at once (the next list confirms). */
  var tkBusy = false, tkMsg = '';
  function takeoversHTML(){
    var list = (data && data.takeovers) || [];
    if(view === 'ended' || !list.length) return '';
    return '<div class="card tk">' + list.map(function(x){
      var match = x.info && x.info.matchNo ? T('matchNo', { n: x.info.matchNo }) : T('tk.matchPlain');
      var from = x.fromBoard != null ? x.fromBoard : '?';
      var text = x.toBoard != null ? T('tk.text', { to: x.toBoard, match: match, from: from }) : T('tk.textNoBoard', { match: match, from: from });
      return '<div class="row"><div class="who">' + esc(text) + '</div><div class="side"><button type="button" class="btn" data-tk="' + esc(x.id) + '" data-ans="allow">' + esc(T('tk.allow')) + '</button> ' +
        '<button type="button" class="btn ghost" data-tk="' + esc(x.id) + '" data-ans="deny">' + esc(T('tk.deny')) + '</button></div></div>';
    }).join('') + (tkMsg ? '<div class="err">' + esc(tkMsg) + '</div>' : '') + '</div>';
  }
  function answerTakeover(id, answer){
    if(tkBusy) return;
    tkBusy = true;
    call('POST', '/api/score/takeover', { id: id, answer: answer }).then(function(r){
      tkBusy = false;
      if(r.status === 401){ view = 'pin'; render(); return; }
      if(r.status === 410){ view = 'ended'; endedReason = r.body.code || r.body.reason; render(); return; }
      tkMsg = r.ok && r.body.ok ? '' : T('tk.failed');
      if(r.ok && data && data.takeovers){ data.takeovers = data.takeovers.filter(function(x){ return x.id !== id; }); saveData(); }
      render();
      refresh();   // what the server now says: an answered or void request is gone
    }, function(){ tkBusy = false; tkMsg = T('tk.failed'); render(); });
  }
  function notSentHTML(){
    if(!notSent.length) return '';
    return '<div class="card notsent"><h2>' + esc(T('notSent.title')) + '</h2>' + notSent.map(function(x){
      return '<div class="row"><div><div class="who">' + esc(x.label || x.pos) + '</div><div class="meta">' + esc(T('reason.' + x.reason)) + '</div></div><div class="res">' + esc(x.result || '') + '</div></div>';
    }).join('') + '<button class="btn ghost" id="dismissNotSent">' + esc(T('dismiss')) + '</button></div>';
  }

  /* ---------- the score form ---------- */
  function slotOf(pos){ return slotsView().find(function(s){ return s.pos === pos; }) || null; }
  /* The sheet closes with its ✕, a tap outside it, Escape, or the phone's back gesture (opening it adds a step to the
     browser history, which Back takes away again). */
  var sheetInHistory = false, backPending = false, formPos = null;
  function closeSheet(fromBack){
    fromBack = fromBack === true;
    var sh = document.getElementById('sheet');
    if(sh) sh.hidden = true;
    formPos = null;
    if(sheetInHistory && !fromBack){ sheetInHistory = false; backPending = true; try{ history.back(); }catch(e){ backPending = false; } }
    else if(fromBack) sheetInHistory = false;
  }
  /* the Back step this page took away itself has arrived: a sheet opened meanwhile gets its own step now */
  function onPopState(){
    var x = document.getElementById('sheet');
    if(backPending){
      backPending = false;
      if(x && !x.hidden && !sheetInHistory){ try{ history.pushState({ ddSheet: 1 }, ''); sheetInHistory = true; }catch(e){} }
      return;
    }
    if(x && !x.hidden) closeSheet(true); else sheetInHistory = false;
  }
  function showSheet(){
    var sh = document.getElementById('sheet');
    if(!sh) return;
    if(sh.hidden && !sheetInHistory && !backPending){ try{ history.pushState({ ddSheet: 1 }, ''); sheetInHistory = true; }catch(e){} }
    sh.hidden = false;
  }
  /* The result form (owner, 2026-11-02): no keyboard. Every valid result is a big button under the player who won, in the
     paper's order (best of 5: 3–0, 3–1, 3–2; a knockout also "Winner only"); a tap opens a check screen that says the
     result in words, then Save result. Teams totals run up to the cap: a – / + counter per team, then the same check.
     Walkover, "Neither showed" and the call stay below, smaller. A saved result shows as its button, lit. */
  function openForm(pos){
    var s = slotOf(pos); if(!s) return;
    formPos = pos;
    var teams = data.format && data.format.competitionUnit === 'Teams';
    var bestOf = s.legs || 5, majority = Math.floor(bestOf / 2) + 1, cap = s.teamCap || majority;
    var cur = s.result || {}, ko = s.kind === 'ko', order = sides(s);
    var va = s.kind === 'rr' ? cur.legs1 : cur.aLegs, vb = s.kind === 'rr' ? cur.legs2 : cur.bLegs;
    va = va === '' || va == null ? null : Number(va); vb = vb === '' || vb == null ? null : Number(vb);
    var box = document.getElementById('sheetBox');
    var nm = function(sd){ return names(s[sd]); };
    var curKey = cur.wo ? '' : va != null && vb != null && va !== vb ? (va > vb ? 'a' : 'b') + ':' + Math.min(va, vb)
      : ko && cur.winnerId ? (cur.winnerId === s.a ? 'a' : 'b') + ':win' : '';
    var count = { a: va != null ? va : 0, b: vb != null ? vb : 0 };   // Teams counters
    var info = s.info || {}, chartPos = { a: info.posA, b: info.posB };   // not 'pos': that is the match
    /* the chart position, as on the paper; a knockout match has none: A and B, so the two rows never differ by colour alone */
    var badge = function(sd){ return '<span class="bd">' + (chartPos[sd] > 0 ? esc(chartPos[sd]) : (sd === order[0] ? 'A' : 'B')) + '</span>'; };
    var head = function(){ return '<div class="shead"><div class="tx"><span class="ptag">' + esc(where(s)) + '</span><h2>' + whoText(s, esc) + '</h2></div>' +
      '<button type="button" class="x" id="fClose" aria-label="' + esc(T('close')) + '">✕</button></div>'; };
    /* walkover, "Neither showed" and the call: folded under More options, so a score is not missed for one of them */
    var others = function(){
      if(s.state === 'done') return '';
      return '<button type="button" class="more" id="fMore" aria-expanded="false">' + esc(T('more')) + ' ▾</button><div class="stack" id="fMoreBox" hidden>' +
        '<button class="btn ghost" id="fNsA">' + esc(T('form.noShow', { name: nm(order[0]) })) + '</button>' +
        '<button class="btn ghost" id="fNsB">' + esc(T('form.noShow', { name: nm(order[1]) })) + '</button>' +
        (ko ? '<button class="btn ghost" id="fVoid">' + esc(T('form.void')) + '</button>' +
          '<button class="btn ghost" id="fCall">' + esc(T(s.state === 'called' ? 'form.uncall' : 'form.call')) + '</button>' : '') + '</div>';
    };
    var err = function(t){ var e = document.getElementById('formErr'); if(e) e.textContent = t; };
    function pickView(){
      var body;
      if(!teams){
        body = '<p class="hint">' + esc(T('form.pickHint')) + '</p>' + order.map(function(sd){
          var btns = '';
          for(var l = 0; l < majority; l++) btns += '<button class="btn ghost sc' + (curKey === sd + ':' + l ? ' on' : '') + '" data-k="' + sd + ':' + l + '">' + majority + '–' + l + '</button>';
          if(ko) btns += '<button class="btn ghost sc wo' + (curKey === sd + ':win' ? ' on' : '') + '" data-k="' + sd + ':win">' + esc(T('form.winOnly')) + '</button>';
          return '<div class="pick p' + (sd === order[0] ? 1 : 2) + '"><h3>' + badge(sd) + '<span>' + esc(T('won', { name: nm(sd) })) + '</span></h3><div class="scores"' + (majority > 3 ? ' style="grid-template-columns:repeat(' + majority + ',1fr)"' : '') + '>' + btns + '</div></div>';
        }).join('');
      } else {
        body = order.map(function(sd){
          return '<div class="ctr"><span class="ctr-n">' + badge(sd) + ' ' + esc(nm(sd)) + '</span><button class="btn ghost" data-c="' + sd + ':-1" aria-label="−1">−</button><b id="ct_' + sd + '">' + count[sd] + '</b><button class="btn ghost" data-c="' + sd + ':1" aria-label="+1">+</button></div>';
        }).join('') + '<p class="hint">' + esc(T('form.hintTeams', { cap: cap })) + '</p><div class="stack"><button class="btn" id="fNext">' + esc(T('form.next')) + '</button></div>';
      }
      box.innerHTML = head() + body + '<div class="err" id="formErr"></div>' + others();
      Array.prototype.forEach.call(box.querySelectorAll('[data-k]'), function(b){ b.onclick = function(){
        var k = b.getAttribute('data-k').split(':'), sd = k[0];
        if(k[1] === 'win') return check({ pos: pos, op: 'win', side: sd, rv: s.rv || 0 });
        var l = Number(k[1]);
        check({ pos: pos, op: 'score', la: sd === 'a' ? majority : l, lb: sd === 'a' ? l : majority, rv: s.rv || 0 });
      }; });
      Array.prototype.forEach.call(box.querySelectorAll('[data-c]'), function(b){ b.onclick = function(){
        var k = b.getAttribute('data-c').split(':'), sd = k[0];
        count[sd] = Math.max(0, Math.min(cap, count[sd] + Number(k[1])));
        document.getElementById('ct_' + sd).textContent = count[sd]; err('');
      }; });
      var nx = document.getElementById('fNext');
      if(nx) nx.onclick = function(){
        var la = count.a, lb = count.b;
        if(la > cap || lb > cap || (la === 0 && lb === 0) || (ko && la === lb)){ err(T('form.errTeams', { cap: cap })); return; }
        check({ pos: pos, op: 'score', la: la, lb: lb, rv: s.rv || 0 });
      };
      wireOthers();
    }
    /* the check screen: the result in words, big, then Save result or Change */
    function check(item){
      var line, sub = '';
      if(item.op === 'win') line = T('won', { name: nm(item.side) });
      else if(item.la === item.lb) line = T('form.level', { a: nm(order[0]), b: nm(order[1]), n: item.la });   // a Teams round robin draw
      else {
        var w = item.la > item.lb ? 'a' : 'b', l = w === 'a' ? 'b' : 'a';
        line = T('form.line', { name: nm(w), w: Math.max(item.la, item.lb), l: Math.min(item.la, item.lb) });
        sub = T('form.beat', { w: nm(w), l: nm(l) });
      }
      box.innerHTML = head() + '<div class="check"><p class="meta">' + esc(T('form.check')) + '</p><p class="big">' + esc(line) + '</p>' + (sub ? '<p class="hint">' + esc(sub) + '</p>' : '') + '</div>' +
        '<div class="stack"><button class="btn" id="cSave">' + esc(T('form.saveResult')) + '</button><button class="btn ghost" id="cBack">' + esc(T('form.change')) + '</button></div>';
      document.getElementById('cSave').onclick = function(){ add(item); closeSheet(); };
      document.getElementById('cBack').onclick = pickView;
      document.getElementById('fClose').onclick = function(){ closeSheet(); };
    }
    var confirmThen = function(text, item){
      box.innerHTML = '<h2>' + whoText(s, esc) + '</h2><p>' + esc(text) + '</p><div class="stack"><button class="btn" id="cYes">' + esc(T('confirm.yes')) + '</button><button class="btn ghost" id="cNo">' + esc(T('form.cancel')) + '</button></div>';
      document.getElementById('cYes').onclick = function(){ add(item); closeSheet(); };
      document.getElementById('cNo').onclick = function(){ closeSheet(); };   // not closeSheet itself: the click would arrive as fromBack
    };
    function wireOthers(){
      document.getElementById('fClose').onclick = function(){ closeSheet(); };
      var more = document.getElementById('fMore'), mb = document.getElementById('fMoreBox');
      if(more && mb) more.onclick = function(){ var open = mb.hidden; mb.hidden = !open; more.setAttribute('aria-expanded', open ? 'true' : 'false'); more.textContent = T('more') + (open ? ' ▴' : ' ▾'); };
      var nsA = document.getElementById('fNsA'), nsB = document.getElementById('fNsB'), vd = document.getElementById('fVoid'), cl = document.getElementById('fCall');
      if(nsA) nsA.onclick = function(){ confirmThen(T('confirm.noShow', { name: nm('a'), other: nm('b') }), { pos: pos, op: 'noShow', side: 'a', rv: s.rv || 0 }); };
      if(nsB) nsB.onclick = function(){ confirmThen(T('confirm.noShow', { name: nm('b'), other: nm('a') }), { pos: pos, op: 'noShow', side: 'b', rv: s.rv || 0 }); };
      if(vd) vd.onclick = function(){ confirmThen(T('confirm.void'), { pos: pos, op: 'void', rv: s.rv || 0 }); };
      if(cl) cl.onclick = function(){ add({ pos: pos, op: s.state === 'called' ? 'uncall' : 'call', rv: s.rv || 0 }); closeSheet(); };
    }
    pickView();
    showSheet();
  }

  /* ---------- queue and sending ---------- */
  function add(item){
    item.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    item.at = Date.now();
    queue = queue.filter(function(q){ return q.pos !== item.pos; }).concat(item);   // the latest action on a match replaces an unsent one
    saveQueue(); render(); flush();
  }
  function labelOf(pos){ var s = data && data.slots.find(function(x){ return x.pos === pos; }); return s ? whoText(s, function(x){ return x; }) + ' · ' + where(s) : pos; }
  function itemResult(q){
    var s = data && data.slots.find(function(x){ return x.pos === q.pos; });
    if(q.op === 'win') return T('won', { name: s ? names(q.side === 'b' ? s.b : s.a) : '?' });
    if(q.op === 'score' && s && sides(s)[0] === 'b') return q.lb + '–' + q.la;   // the paper's order, as the label beside it
    return q.op === 'score' ? q.la + '–' + q.lb : q.op === 'void' ? T('void') : q.op === 'noShow' ? T('wo') : ''; }
  function flush(){
    if(sending || !queue.length || view === 'pin') return;
    sending = true; render();
    var q = queue[0];
    call('POST', '/api/score/result', { pos: q.pos, op: q.op, la: q.la, lb: q.lb, side: q.side, rv: q.rv }).then(function(r){
      sending = false;
      if(r.status === 401){ view = 'pin'; render(); return; }
      if(r.ok && r.body.ok){
        queue.shift();
        replaceSlot(r.body.slot);
        retryDelay = 5000; saveQueue(); render();
        if(queue.length) flush(); else refresh();
        return;
      }
      if(r.status === 503 || r.status >= 500){ retryLater(); render(); return; }
      /* refused: never sent again, listed for the organiser */
      queue.shift();
      var reason = r.body.code === 'link_ended' || r.status === 410 ? 'link_ended' : (r.body.code || 'invalid');
      if(r.status === 410){ view = 'ended'; endedReason = r.body.code || r.body.reason; }
      notSent.push({ pos: q.pos, op: q.op, la: q.la, lb: q.lb, side: q.side, reason: reason, label: labelOf(q.pos), result: itemResult(q) });
      if(r.body.slot) replaceSlot(r.body.slot);
      saveQueue(); render();
      if(queue.length) flush();
    }, function(){ sending = false; retryLater(); render(); });
  }
  function retryLater(){
    clearTimeout(retryTimer);
    if(!queue.length || document.visibilityState === 'hidden') return;
    retryTimer = setTimeout(function(){ retryTimer = null; flush(); }, retryDelay);
    retryDelay = Math.min(retryDelay * 2, 30000);
  }
  function replaceSlot(slot){
    if(!data || !slot) return;
    var i = data.slots.findIndex(function(x){ return x.pos === slot.pos; });
    if(i >= 0){ slot.board = data.slots[i].board; data.slots[i] = slot; }
    saveData();
  }

  /* ---------- opening ---------- */
  function refresh(){
    if(!profile || !profile.session || view === 'pin') return Promise.resolve(false);
    return call('GET', '/api/score/matches').then(function(r){
      if(r.status === 401){ view = 'pin'; render(); return false; }
      if(r.status === 410){ view = 'ended'; endedReason = r.body.code || r.body.reason; render(); return false; }
      if(!r.ok) return false;
      data = r.body; dataAt = Date.now(); saveData();
      if(r.body.official){ profile.official = { name: r.body.official.name, boards: r.body.official.boards }; profile.endsAt = r.body.official.endsAt; }
      if(r.body.event) profile.event = r.body.event;
      saveProfile();
      if(view !== 'ended') view = 'list';
      render();
      if(queue.length) flush();
      return true;
    }, function(){ render(); return false; });
  }
  /* one PIN check at a time: the 4th digit, Go and Enter may all fire, and every check counts towards the lockout */
  var pinBusy = false;
  function openWithPin(pin){
    if(pinBusy) return;
    pinBusy = true;
    var e = document.getElementById('pinErr');
    call('POST', '/api/score/open', { token: TOKEN, pin: String(pin || '').trim() }).then(function(r){
      pinBusy = false;
      if(r.ok){ profile = { session: r.body.session, event: r.body.event, official: r.body.official, endsAt: r.body.endsAt }; saveProfile(); view = 'list'; refresh(); return; }
      if(r.status === 410){ view = 'ended'; endedReason = r.body.code || r.body.reason; render(); return; }
      if(r.status === 404){ view = 'unknown'; render(); return; }
      if(e) e.textContent = T(r.status === 429 ? 'pin.many' : 'pin.bad');
      var pb = document.getElementById('pin'); if(pb){ pb.value = ''; try{ pb.focus(); }catch(x){} }   // ready for the next try
    }, function(){ pinBusy = false; if(e) e.textContent = T('first.text'); render(); });
  }
  var activeBoard = null, nextPos = null;
  function boot(){
    startLang();
    var sh = document.getElementById('sheet');
    if(sh) sh.onclick = function(e){ if(e && e.target === sh) closeSheet(); };
    try{ window.addEventListener('popstate', onPopState); }catch(e){}
    /* reloaded while a result form was open: that Back step belongs to nothing now */
    try{ if(history.state && history.state.ddSheet) history.replaceState(null, ''); }catch(e){}
    try{ document.addEventListener('keydown', function(e){ if(e.key === 'Escape'){ var x = document.getElementById('sheet'); if(x && !x.hidden) closeSheet(); } }); }catch(e){}

    if(!TOKEN){ view = 'unknown'; render(); return; }
    try{ if(navigator.serviceWorker && navigator.serviceWorker.register) navigator.serviceWorker.register('/sw.js', { scope: '/score/' }).catch(function(){}); }catch(e){}
    try{ if(navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function(){}); }catch(e){}
    Promise.all([DDOffline.getProfile(ORG), DDOffline.getEvent(ORG, 'matches'), DDOffline.getQueue(ORG, 'q')]).then(function(got){
      profile = got[0]; var kept = got[1], q = got[2];
      if(q){ queue = q.items || []; notSent = q.notSent || []; }
      if(kept){ data = kept.data; dataAt = kept.at; }
      if(!profile || !profile.session){
        /* never opened here: the PIN, which needs signal */
        call('GET', '/sw.js').then(function(){ view = 'pin'; render(); }, function(){ view = 'first'; render(); });
        return;
      }
      view = data ? 'list' : 'loading';
      if(profile.endsAt && new Date(profile.endsAt).getTime() <= Date.now()){ view = 'ended'; endedReason = 'ended'; }
      render();
      refresh().then(function(ok){ if(!ok && !data){ view = offline ? 'first' : view; render(); } });
    });
    setInterval(function(){
      if(document.visibilityState === 'hidden' || view === 'pin') return;
      if(queue.length) flush(); else refresh();
      render();   // the correction countdowns
    }, POLL_MS);
    document.addEventListener('visibilitychange', function(){ if(document.visibilityState === 'visible'){ retryDelay = 5000; if(queue.length) flush(); else refresh(); } });
    window.addEventListener('online', function(){ retryDelay = 5000; if(queue.length) flush(); else refresh(); });
  }
  if(typeof window !== 'undefined' && !window.__DD_SCORE_NO_BOOT) boot();
  if(typeof window !== 'undefined') window.__ddScore = { T: T, slotsView: slotsView, state: function(){ return { view: view, queue: queue, notSent: notSent, data: data, profile: profile, offline: offline }; } };
})();

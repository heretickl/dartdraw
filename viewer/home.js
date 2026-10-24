/* The public home page: shown at the bare address (no event link). A branded list of the events organisers have chosen
   to list, fetched from /api/events. Read-only; nothing here can change a tournament. Everything that builds HTML is a
   plain function (hm...) so it can be tested without a browser; showHome() (further down) is the only part that touches
   the page. Everything shown is escaped with hmEsc. Every word comes from the string tables (i18n/en.js, i18n/ms.js) through
   T(); the data from the server is codes and numbers (format, unit, stage, round, next), turned into words here. */

var HM_FORMATS = ['roundrobin', 'knockout', 'rrknockout', 'podknockout'];
var HM_UNITS = ['Singles', 'Doubles', 'Triples', 'Teams'];
var HM_TABS = ['live', 'upcoming', 'results'];

function hmEsc(s){
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function hmHas(o, k){ return Object.prototype.hasOwnProperty.call(o, k); }   // own keys only: 'constructor' or '__proto__' are not formats or units
function hmFormatLabel(f){ return HM_FORMATS.indexOf(f) !== -1 ? T('fmt.' + f) : ''; }
function hmUnitKey(u){ return HM_UNITS.indexOf(u) !== -1 ? u : 'other'; }
function hmEntriesHTML(it){
  var n = (it.entries | 0);
  if(n <= 0) return '';
  return T('hm.entries.' + hmUnitKey(it.unit), { n: n });
}
/* The server's round code (listView.js: final, semifinals, quarterfinals, r<N>) as words; '' for anything else. */
function hmRoundLabel(code){
  var c = String(code == null ? '' : code), m = /^r(\d{1,4})$/.exec(c);
  if(m) return T('hm.round.of', { n: +m[1] });
  return c === 'final' || c === 'semifinals' || c === 'quarterfinals' ? T('hm.round.' + c) : '';
}
/* A live card's stage line from progress (stage: groups | knockout | finals, with the round while a knockout is live).
   A value that is not a code (an older server) is shown as it came. */
function hmProgressStage(p){
  var r = hmRoundLabel(p && p.round), s = p && p.stage;
  if(r) return s === 'finals' ? T('hm.prog.finalsRound', { round: r }) : r;
  return s === 'groups' || s === 'knockout' || s === 'finals' ? T('hm.prog.' + s) : String(s == null ? '' : s);
}
function hmNextLabel(next){
  return next === 'awaiting' || next === 'knockout' || next === 'finals' ? T('hm.next.' + next) : String(next == null ? '' : next);
}

/* A code or an event link typed or pasted into the search box. Only a lowercase code (8 to 40 letters and digits) and a
   hash made of safe characters get through, and the open address is built from those two parts alone. */
function hmCodeFrom(text){
  var t = String(text == null ? '' : text);
  if(t.length > 2000) return null;                  // a long paste could make the link match slow
  t = t.trim();
  var m = /^([a-z0-9]{8,40})$/i.exec(t);
  if(m) return { code: m[1].toLowerCase(), hash: '' };
  m = /\/live\/([a-z0-9]{8,40})\/?(?:\?[^#\s]*)?(#[A-Za-z0-9\/_.%~?=&-]*)?$/i.exec(t);
  if(m) return { code: m[1].toLowerCase(), hash: m[2] || '' };
  return null;
}
/* The address the Open button points to for what was typed, or null. Built from the validated code and hash only. */
function hmOpenHref(q){
  var c = hmCodeFrom(q);
  return c ? '/live/' + c.code + c.hash : null;
}
function hmOpenHTML(q){
  var c = hmCodeFrom(q), href = hmOpenHref(q);
  if(!c) return '';
  return '<a class="hm-open" href="' + hmEsc(href) + '"><span>' + T('hm.open', { code: hmEsc(c.code) }) + '</span><span aria-hidden="true">\u203A</span></a>';
}

function hmFilter(items, q){
  var s = String(q || '').trim().toLowerCase();
  if(!s) return items.slice();
  return items.filter(function(it){
    return [it.event, it.tournament, hmFormatLabel(it.format), it.winner].join(' ').toLowerCase().indexOf(s) !== -1;
  });
}
/* Events with the same tournament name (ignoring case) and the same date share a heading. */
function hmGroup(items){
  var out = [], index = {};
  items.forEach(function(it){
    var key = String(it.tournament || '').toLowerCase() + '|' + (it.date || '');
    if(!index[key]){ index[key] = { tournament: it.tournament || '', date: it.date || '', items: [] }; out.push(index[key]); }
    index[key].items.push(it);
  });
  return out;
}
function hmDefaultTab(data){
  if(data.live.length) return 'live';
  if(data.upcoming.length) return 'upcoming';
  if(data.results.length) return 'results';
  return 'live';
}
function hmTabFromHash(hash){
  var m = /^#\/?(live|upcoming|results)$/.exec(String(hash || ''));
  return m ? m[1] : null;
}

/* ---- dates and times (local, from the event's own YYYY-MM-DD) ---- */
function hmToday(d){
  d = d || new Date();
  function p(n){ return (n < 10 ? '0' : '') + n; }
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function hmParts(s){
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if(!m) return null;
  var y = +m[1], mo = +m[2], d = +m[3];
  if(mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y: y, m: mo, d: d, wd: new Date(y, mo - 1, d).getDay() };
}
function hmDateLabel(date, today){
  if(!date) return '';
  if(date === today) return T('hm.today');
  var p = hmParts(date);
  return p ? T('hm.dateLabel', { wd: ddWeekday(p.wd), d: p.d, mon: ddMonth(p.m - 1) }) : '';
}
/* An event's start time (HH:MM, local) as the clock the reader's language uses: 7:10 pm / 7:10 PTG (Intl en-GB / ms-MY). */
function hmTimeLabel(t){
  var m = /^(\d{2}):(\d{2})$/.exec(String(t || ''));
  if(!m) return '';
  var h = +m[1];
  if(h > 23 || +m[2] > 59) return '';
  return ddClock(new Date(2000, 0, 1, h, +m[2]));
}
function hmTile(date){
  var p = hmParts(date);
  if(!p) return '<div class="hm-tile hm-tba"><b>' + hmEsc(T('hm.tba')) + '</b></div>';
  return '<div class="hm-tile"><s>' + hmEsc(ddMonth(p.m - 1)) + '</s><b>' + p.d + '</b><s>' + hmEsc(ddWeekday(p.wd)) + '</s></div>';
}

/* ---- cards and lists ---- */
/* ---- stage subcards: one subcard per stage inside the one event card (the server sends it.stages) ---- */
var HM_STAGE_STATES = { groups:['notstarted', 'live', 'done'], knockout:['waiting', 'next', 'ready', 'live', 'done'], finals:['waiting', 'next', 'ready', 'live', 'done'] };
function hmInt(n){ n = n | 0; return n > 0 ? n : 0; }
function hmRingHTML(d, t){
  var pct = t > 0 ? Math.max(0, Math.min(99, Math.floor(100 * d / t))) : 0;   // the ring never shows 100%
  return '<div class="hm-ring" style="--p:' + pct + '" role="img" aria-label="' + hmEsc(T('hm.pct', { p: pct })) + '"><span>' + pct + '%</span></div>';
}
function hmPipHTML(kind, inner){
  return '<div class="hm-pip' + (kind ? ' ' + kind : '') + '"' + (kind ? ' aria-hidden="true"' : '') + '>' + inner + '</div>';
}
function hmStageLabel(it, key){
  return T(key === 'knockout' ? 'hm.stage.knockout' : key === 'finals' ? 'hm.stage.finals' : (it.format === 'podknockout' ? 'hm.stage.groups' : 'hm.stage.rr'));
}
function hmAdvanceText(it, n){
  return T('hm.advance.' + hmUnitKey(it.unit), { n: n });
}
/* One subcard. idx/count place it among the stages (the stage number on a waiting pip; a single stage has no number). */
function hmStageHTML(kind, it, s, idx, count){
  var st = s.state, isGroups = s.key === 'groups';
  var d = hmInt(s.done), t = hmInt(s.total), n = hmInt(s.groups);
  var num = count > 1 ? String(idx + 1) : '';
  var nGroups = n > 0 ? T('hm.groups', { n: n }) : '';
  var cls = '', lead, v, sub = '';
  var winner = kind === 'results' && typeof it.winner === 'string' && it.winner && idx === count - 1 && !isGroups;
  if(st === 'live'){
    cls = ' is-live'; lead = hmRingHTML(d, t);
    if(isGroups){ v = T('hm.inProgress'); sub = [T('hm.matchesOf', { done: d, n: t }), nGroups].filter(Boolean).join(' \u00B7 '); }
    else { v = hmRoundLabel(s.round) || (typeof s.round === 'string' && s.round && !/^[a-z0-9]+$/.test(s.round) ? s.round : T('hm.inProgress')); sub = T('hm.matchesPlayed', { done: d, n: t }); }
  } else if(st === 'done'){
    cls = ' is-done';
    var played = t > 0 ? T('hm.matchesOf', { done: isGroups ? d : t, n: t }) : '';   // no matches at all (a bracket of one): say nothing about them
    if(winner){ lead = hmPipHTML('trophy', '\uD83C\uDFC6'); v = T('hm.winner', { name: it.winner }); sub = [T('hm.complete'), played].filter(Boolean).join(' \u00B7 '); }
    else {
      // The last stage is over but the organiser has not accepted the results yet: the server says so in progress.next.
      var wait = kind === 'live' && idx === count - 1 && it.progress && typeof it.progress.next === 'string' && it.progress.next ? hmNextLabel(it.progress.next) : '';
      lead = hmPipHTML('done', '\u2713'); v = T('hm.complete'); sub = [played, isGroups ? nGroups : '', wait].filter(Boolean).join(' \u00B7 ');
    }
  } else if(st === 'next'){
    lead = hmPipHTML('draw', '\u2026'); v = T(s.key === 'finals' ? 'hm.upNext' : 'hm.drawNext');
    var adv = hmInt(s.advance); sub = adv > 0 ? hmAdvanceText(it, adv) : '';
  } else if(st === 'ready'){
    cls = ''; lead = hmPipHTML(num ? '' : 'dot', num); v = T('hm.drawMade'); sub = T('hm.notStartedYet');
  } else if(st === 'waiting'){
    cls = ' is-wait'; lead = hmPipHTML(num ? '' : 'dot', num); v = T('hm.waitGroups'); sub = T('hm.startsAfter');
  } else {   // groups, notstarted
    cls = ' is-wait'; lead = hmPipHTML(num ? '' : 'dot', num); v = T('hm.notStarted'); sub = nGroups;
  }
  return '<div class="hm-stage' + cls + '"><div class="hm-lead">' + lead + '</div><div><div class="k">' + hmEsc(hmStageLabel(it, s.key)) + '</div>' +
    '<div class="v">' + hmEsc(v) + '</div><div class="s">' + hmEsc(sub) + '</div></div></div>';
}
/* The stages the page knows how to show (the rest are skipped); an empty result means the old single card is used. */
function hmKnownStages(it){
  var out = [];
  if(!Array.isArray(it.stages)) return out;
  it.stages.forEach(function(s){
    if(s && typeof s === 'object' && hmHas(HM_STAGE_STATES, s.key) && HM_STAGE_STATES[s.key].indexOf(s.state) !== -1) out.push(s);
  });
  return out;
}
function hmMultiCardHTML(kind, it, stages){
  var href = '/live/' + encodeURIComponent(it.slug);
  var fmt = hmFormatLabel(it.format), tag = fmt ? '<span class="hm-fmt">' + hmEsc(fmt) + '</span>' : '';
  var ent = hmEntriesHTML(it), entHTML = ent ? '<span>' + ent + '</span>' : '';
  var time = kind === 'upcoming' ? hmTimeLabel(it.start) : '';
  return '<a class="hm-ev hm-multi' + (kind === 'live' ? ' hm-live' : '') + '" href="' + hmEsc(href) + '"><div class="hm-head">' +
    (kind === 'upcoming' ? '<div class="hm-lead">' + hmTile(it.date) + '</div>' : '') +
    '<div class="hm-main"><div class="hm-name">' + hmEsc(hmEventName(it)) + '</div><div class="hm-sub">' + (time ? '<b>' + hmEsc(time) + '</b>' : '') + tag + entHTML + '</div></div>' +
    '<span class="hm-chev" aria-hidden="true">\u203A</span></div>' +
    '<div class="hm-stages">' + stages.map(function(s, i){ return hmStageHTML(kind, it, s, i, stages.length); }).join('') + '</div></a>';
}

function hmCardHTML(kind, it){
  var stages = hmKnownStages(it);
  if(stages.length) return hmMultiCardHTML(kind, it, stages);   // otherwise (an older server) the single card below
  var href = '/live/' + encodeURIComponent(it.slug);
  var fmt = hmFormatLabel(it.format), tag = fmt ? '<span class="hm-fmt">' + hmEsc(fmt) + '</span>' : '';
  var ent = hmEntriesHTML(it), entHTML = ent ? '<span>' + ent + '</span>' : '';
  var lead = '', lines = '';
  if(kind === 'live'){
    var p = it.progress, pct = p && p.total > 0 ? Math.min(99, Math.floor(100 * p.done / p.total)) : null;
    var next = p && typeof p.next === 'string' ? p.next : '';   // between two stages: the stage is done and this says what comes next
    if(next){
      lead = '<div class="hm-ring" style="--p:100" role="img" aria-label="' + hmEsc(T('hm.stageDone')) + '"><span class="hm-tick">\u2713</span></div>';
      lines = '<div class="hm-sub">' + tag + entHTML + '</div>' + '<div class="hm-sub">' + T('hm.stageComplete', { stage: hmEsc(hmProgressStage(p)), next: hmEsc(hmNextLabel(next)) }) + '</div>';
    } else {
      lead = pct == null ? '<div class="hm-livedot" aria-hidden="true"></div>'
        : '<div class="hm-ring" style="--p:' + pct + '" role="img" aria-label="' + hmEsc(T('hm.pct', { p: pct })) + '"><span>' + pct + '%</span></div>';
      lines = '<div class="hm-sub">' + tag + entHTML + '</div>' +
        (p ? '<div class="hm-sub">' + T('hm.stageLine', { stage: hmEsc(hmProgressStage(p)), done: (p.done | 0), n: (p.total | 0) }) + '</div>' : '');
    }
  } else if(kind === 'upcoming'){
    var time = hmTimeLabel(it.start);
    lead = hmTile(it.date);
    lines = '<div class="hm-sub">' + (time ? '<b>' + hmEsc(time) + '</b>' : '') + tag + entHTML + '</div>';
  } else {
    lead = '<div class="hm-trophy" aria-hidden="true">\uD83C\uDFC6</div>';
    lines = (it.winner ? '<div class="hm-sub">' + T('hm.winnerB', { name: hmEsc(it.winner) }) + '</div>' : '') + '<div class="hm-sub">' + tag + entHTML + '</div>';
  }
  return '<a class="hm-ev' + (kind === 'live' ? ' hm-live' : '') + '" href="' + hmEsc(href) + '"><div class="hm-lead">' + lead + '</div>' +
    '<div class="hm-main"><div class="hm-name">' + hmEsc(hmEventName(it)) + '</div>' + lines + '</div><span class="hm-chev" aria-hidden="true">\u203A</span></a>';
}
/* The event's name; the server sends '' for an event with no name or tournament name. */
function hmEventName(it){ return it && it.event ? it.event : T('hm.untitled'); }
function hmListHTML(kind, items, q, today){
  if(!items.length){
    return '<p class="hm-none">' + hmEsc(T('hm.empty.' + kind)) + '</p>' +
      (kind === 'live' ? '<p class="hm-none"><button type="button" class="hm-btn" data-hm-tab="upcoming">' + hmEsc(T('hm.seeUpcoming')) + '</button></p>' : '');
  }
  var shown = hmFilter(items, q);
  if(!shown.length) return '<p class="hm-none">' + T('hm.noMatch', { q: hmEsc(q) }) + '</p>';
  return hmGroup(shown).map(function(g){
    return '<section class="hm-group"><h2>' + hmEsc(g.tournament || T('hm.otherEvents')) + '<span>' + hmEsc(hmDateLabel(g.date, today)) + '</span></h2>' +
      '<div class="hm-list">' + g.items.map(function(it){ return hmCardHTML(kind, it); }).join('') + '</div></section>';
  }).join('');
}
function hmTabsHTML(data, tab, noCounts){
  return HM_TABS.map(function(k){
    var n = data[k].length;
    return '<button type="button" role="tab" id="hm-t-' + k + '" data-hm-tab="' + k + '" aria-selected="' + (k === tab ? 'true' : 'false') + '" aria-controls="hmList" tabindex="' + (k === tab ? '0' : '-1') + '">' +
      (k === 'live' && n && !noCounts ? '<span class="hm-dot"></span>' : '') + hmEsc(T('hm.tab.' + k)) + (noCounts ? '' : '<span class="hm-c">' + n + '</span>') + '</button>';
  }).join('');
}
function hmUpdatedText(okAt, failed, now){
  if(failed) return T('hm.retrying');
  if(!okAt) return T('hm.loading');
  var mins = Math.floor((now - okAt) / 60000);
  return mins < 1 ? T('hm.updatedNow') : T('hm.updatedAgo', { n: mins });
}
/* The first load has failed and nothing has loaded yet: say so, instead of "Nothing is live right now" with zero counts. */
function hmLoadFailedHTML(){
  return '<div class="hm-none hm-fail"><p><b>' + hmEsc(T('hm.fail1')) + '</b></p><p>' + hmEsc(T('hm.fail2')) + '</p>' +
    '<p><button type="button" class="hm-btn" data-hm-retry>' + hmEsc(T('hm.retry')) + '</button></p></div>';
}
function hmHomeLinkHTML(){ return '<p><a class="hm-btn" href="/">' + hmEsc(T('hm.seeAll')) + '</a></p>'; }

/* ---- "New here?" tips for first-time visitors (a card on the home page; a slim bar on an event page opened straight from a QR code or a link) ----
   Shown until the visitor taps Got it (or the bar's close button), and never to someone who already set Me or follows a player in any event on this
   device. Remembered in localStorage only (nothing is sent anywhere); without storage it still works, for this page view. */
var HM_START_KEY = 'dartdraw.viewer.seenStart';
var HM_START = { done: false };
function hmStore(){ try{ return typeof localStorage !== 'undefined' ? localStorage : null; }catch(e){ return null; } }
function hmStartWanted(ls){
  if(HM_START.done) return false;
  try{
    if(!ls) return true;
    if(ls.getItem(HM_START_KEY)) return false;
    var n = ls.length | 0;
    for(var i = 0; i < n; i++){
      var k = ls.key(i);
      if(typeof k !== 'string' || k.indexOf('dartdraw.viewer.') !== 0 || k === HM_START_KEY) continue;
      try{
        var p = JSON.parse(ls.getItem(k));
        if(p && typeof p === 'object' && (typeof p.me === 'string' || (Array.isArray(p.follow) && p.follow.length))) return false;
      }catch(e){}   // the theme and bracket-view keys are plain words, not JSON
    }
  }catch(e){}
  return true;
}
function hmStartDismiss(ls){ HM_START.done = true; try{ if(ls) ls.setItem(HM_START_KEY, '1'); }catch(e){} }
/* The three points. kind: 'home' or 'event'. o.help: the Help address to use (the event page passes one that knows the
   event); o.team: a Teams event. */
function hmStartPoints(kind, o){
  o = o || {};
  var help = String(o.help || hmLangHref('/help')), base = help.split('#')[0], team = !!o.team;
  var words = '<a href="' + hmEsc(base + '#glossary') + '">' + hmEsc(T('hm.words')) + '</a>';
  var b = { follow: hmEsc(T('ev.fol.btn')), me: hmEsc(T('ev.me.btn')), cols: hmEsc(T('ev.key.columns')), words: words,
    live: hmEsc(T('hm.tab.live')), upcoming: hmEsc(T('hm.tab.upcoming')), results: hmEsc(T('hm.tab.results')) };
  return kind === 'event' ? [
    T('hm.tip.event1'),
    TU('hm.tip.event2', team, b),
    TU('hm.tip.event3', team, b)
  ] : [
    T('hm.tip.home1', b),
    T('hm.tip.home2', b),
    T('hm.tip.home3', b)
  ];
}
/* The home page's card. */
function hmStartHTML(kind, o){
  var help = String((o && o.help) || hmLangHref('/help'));
  return '<section class="hm-start" aria-labelledby="hmStartH"><h2 id="hmStartH">' + hmEsc(T('hm.start.title')) + '</h2><ol>' +
    hmStartPoints(kind, o).map(function(p){ return '<li>' + p + '</li>'; }).join('') + '</ol>' +
    '<div class="hm-startbtns"><button type="button" class="hm-btn" data-start-ok>' + hmEsc(T('hm.start.ok')) + '</button><a class="hm-startmore" href="' + hmEsc(help) + '">' + hmEsc(T('hm.start.more')) + '</a></div></section>';
}
/* An event page's slim bar: one line under the header, so the scores stay on a phone's first screen. The line is a
   button that opens the three points in place (aria-expanded); the \u00d7 closes it for good on this device (the same
   stored choice as Got it). o.open: drawn opened. */
function hmStartBarHTML(o){
  o = o || {};
  var help = String(o.help || hmLangHref('/help')), open = !!o.open;
  return '<section class="hm-sbar" aria-label="' + hmEsc(T('hm.sbar.label')) + '"><div class="hm-sbrow">' +
    '<button type="button" class="hm-sbtoggle" data-start-toggle aria-expanded="' + (open ? 'true' : 'false') + '" aria-controls="hmStartMore">' +
    '<span class="hm-sbtext">' + T('hm.sbar.text') + '</span><span class="hm-sbchev" aria-hidden="true">\u203a</span></button>' +
    '<button type="button" class="hm-sbx" data-start-ok aria-label="' + hmEsc(T('hm.sbar.close')) + '" title="' + hmEsc(T('hm.sbar.closeTitle')) + '">\u00d7</button></div>' +
    '<div class="hm-sbbody" id="hmStartMore"' + (open ? '' : ' hidden') + '><ol>' +
    hmStartPoints('event', o).map(function(p){ return '<li>' + p + '</li>'; }).join('') + '</ol>' +
    '<p class="hm-sbmore"><a href="' + hmEsc(help) + '">' + hmEsc(T('hm.start.more')) + '</a></p></div></section>';
}

/* The language of the Help pages: /ms/help in BM, /help in English. The viewer keeps its own choice (localStorage
   "dartdraw.lang", saved by the EN | BM switch here and on its Help page; the organiser site is another origin with its own). */
function hmHelpLang(){
  if(typeof ddLinkLang === 'function') return ddLinkLang();
  try{ return localStorage.getItem('dartdraw.lang') === 'ms' ? 'ms' : 'en'; }catch(e){ return 'en'; }
}
function hmLangHref(href){
  var h = String(href == null ? '' : href).replace(/^\/ms(?=\/help(?:[?#]|$))/, '');   // a link already made for BM is made again for the language now
  return hmHelpLang() === 'ms' && /^\/help(?=[?#]|$)/.test(h) ? '/ms' + h : h;
}
function hmLangHelpLinks(root){
  if(!root || !root.querySelectorAll) return;
  [].forEach.call(root.querySelectorAll('a[href^="/help"], a[href^="/ms/help"]'), function(a){ a.setAttribute('href', hmLangHref(a.getAttribute('href'))); });
}

/* ---------- The page itself (the only part that touches the document) ---------- */
var HM_THEME_KEY = 'dartdraw.viewer.theme';   // the same stored choice the event page uses
var HM_THEME_ICON = { auto:'\u25D0', light:'\u2600', dark:'\u263E' };
var HM = { shown:false, data:{ live:[], upcoming:[], results:[] }, tab:null, q:'', okAt:0, failed:false, theme:'auto', painted:{}, poll:null };

/* ---- refreshing: ONE chain of loads, never stopped by an error, never overwritten by an older answer ----
   A load takes a generation number. Only the newest generation may change anything (an older answer is dropped), so a
   visibility flip during a slow load simply supersedes it. Only the newest load schedules the next one, so there is
   exactly one timer, and none while the page is hidden (d.hidden()). Every step is guarded so a throw in the load or in the redraw cannot end the refreshing.
   d: fetch() -> Promise of the data, apply(data), fail(), render(), every (ms), setT(fn, ms), clearT(id), hidden() -> bool. */
function hmPoller(d){
  var P = { gen: 0, timer: null };
  P.start = async function(){
    var g = ++P.gen;
    try{ d.clearT(P.timer); }catch(e){}
    P.timer = null;
    try{ var data = await d.fetch(); if(g === P.gen) d.apply(data); }
    catch(e){ if(g === P.gen){ try{ d.fail(); }catch(e2){} } }
    if(g !== P.gen) return;
    try{ d.render(); }catch(e){}
    try{ d.clearT(P.timer); }catch(e){}
    P.timer = null;
    var hidden = false;
    try{ hidden = !!(d.hidden && d.hidden()); }catch(e){}
    if(hidden) return;                      // refresh only while the page is visible; coming back to the tab starts the chain again
    P.timer = d.setT(P.start, d.every);
  };
  return P;
}
/* A region is only rewritten when its HTML changed, so a refresh that changes nothing does not disturb keyboard focus. */
function hmShouldWrite(last, next){ return last !== next; }

/* The header. Its words carry data-i18n so a language switch rewrites them in place (the search box keeps what was typed).
   The EN | BM switch: the pair from 481 px, one toggle showing the other language on a phone (home.css). */
function hmHeaderHTML(){
  return '<header class="hm-top"><div class="hm-wrap">' +
    '<div class="hm-row1"><a class="hm-brand" href="/"><span class="hm-mark" aria-hidden="true">D</span><b>DartDraw</b><i>Live</i></a>' +
    '<div class="hm-tools">' + (typeof ddSwitchHTML === 'function' ? '<span class="hm-lang">' + ddSwitchHTML('pair') + ddSwitchHTML('toggle') + '</span>' : '') +
    '<a class="hm-help" href="/help" data-i18n="nav.help">' + hmEsc(T('nav.help')) + '</a>' +
    '<button class="hm-ibtn" id="hmTheme" type="button" aria-label="' + hmEsc(hmThemeLabel('auto')) + '">' + HM_THEME_ICON.auto + '</button></div></div>' +
    '<label class="hm-find"><svg viewBox="0 0 24 24" fill="none" stroke="#dbe5f1" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>' +
    '<input id="hmQ" type="search" placeholder="' + hmEsc(T('hm.search')) + '" aria-label="' + hmEsc(T('hm.searchLabel')) + '" data-i18n-attr="placeholder:hm.search;aria-label:hm.searchLabel" autocomplete="off" autocapitalize="off" spellcheck="false"></label>' +
    '<div id="hmOpen"></div>' +
    '<div class="hm-seg" role="tablist" aria-label="' + hmEsc(T('hm.tabsLabel')) + '" data-i18n-attr="aria-label:hm.tabsLabel" id="hmTabs"></div>' +
    '</div></header>';
}
function hmThemeLabel(t){ return T('hm.theme', { mode: T('hm.theme.' + t) }); }
function hmSavedTheme(){ try{ var t = localStorage.getItem(HM_THEME_KEY); return (t === 'light' || t === 'dark') ? t : 'auto'; }catch(e){ return 'auto'; } }
function hmApplyTheme(t){
  HM.theme = t;
  var root = document.documentElement;
  if(t === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', t);
  try{ if(t === 'auto') localStorage.removeItem(HM_THEME_KEY); else localStorage.setItem(HM_THEME_KEY, t); }catch(e){}
  var b = document.getElementById('hmTheme');
  if(b){ b.textContent = HM_THEME_ICON[t]; b.setAttribute('aria-label', hmThemeLabel(t)); }
}
/* Writes html into a region unless it is unchanged. If the keyboard focus is inside the region when it is rewritten, the focus
   goes back to the same control afterwards (a tab by its id, a link by its address). */
function hmPaint(id, html){
  var el = document.getElementById(id);
  if(!el || !hmShouldWrite(HM.painted[id], html)) return;
  var a = document.activeElement, key = null, href = null;
  if(a && a !== document.body && el.contains && el.contains(a)){
    if(a.id) key = a.id; else if(a.getAttribute) href = a.getAttribute('href');
  }
  HM.painted[id] = html;
  el.innerHTML = html;
  var back = null;
  if(key) back = document.getElementById(key);
  else if(href && el.querySelectorAll){
    var links = el.querySelectorAll('a');
    for(var i = 0; i < links.length; i++) if(links[i].getAttribute('href') === href){ back = links[i]; break; }
  }
  if(back && back.focus) back.focus();
}
/* Redraws what depends on the data or the tab. The search box itself is left alone so typing is never interrupted. */
function hmView(){
  var tab = HM.tab || hmDefaultTab(HM.data);
  var noData = !HM.okAt;   // nothing has loaded yet (still loading, or the first load failed): no counts, they would all read 0
  hmPaint('hmTabs', hmTabsHTML(HM.data, tab, noData));
  hmPaint('hmOpen', hmOpenHTML(HM.q));
  var loading = noData && !HM.failed;
  hmPaint('hmList', loading ? '<p class="hm-none">' + hmEsc(T('hm.loading')) + '</p>' : noData ? hmLoadFailedHTML() : hmListHTML(tab, HM.data[tab], HM.q, hmToday()));
  hmStatus();
}
/* What the status line should look like: its class, its HTML, and whether it announces itself. Only the failure message is
   announced to screen readers; the ticking "Updated n min ago" text is not. */
function hmStatusState(okAt, failed, now){
  return { cls: 'hm-upd' + (failed ? ' hm-bad' : ''),
    html: '<i></i>' + hmEsc(hmUpdatedText(okAt, failed, now)) + (failed ? '' : ' \u00B7 ' + hmEsc(T('hm.autoRefresh'))),
    live: failed ? 'polite' : null };
}
function hmStatus(){
  var u = document.getElementById('hmUpd');
  if(!u) return;
  var st = hmStatusState(HM.okAt, HM.failed, Date.now()), sig = st.cls + '|' + (st.live || '') + '|' + st.html;
  if(!hmShouldWrite(HM.painted.hmUpd, sig)) return;
  HM.painted.hmUpd = sig;
  u.className = st.cls;
  if(st.live) u.setAttribute('aria-live', st.live); else u.removeAttribute('aria-live');
  u.innerHTML = st.html;
}
async function hmFetch(){
  var opts = { cache:'no-store' };
  if(typeof AbortSignal !== 'undefined' && AbortSignal.timeout) opts.signal = AbortSignal.timeout(15000);   // a hung request cannot stall refreshing
  var res = await fetch('/api/events', opts);
  if(!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}
function hmApplyData(body){
  HM.data = { live: body.live || [], upcoming: body.upcoming || [], results: body.results || [] };
  HM.okAt = Date.now(); HM.failed = false;
  if(!HM.tab) HM.tab = hmTabFromHash(location.hash) || hmDefaultTab(HM.data);
}
function hmSetTab(tab){ HM.tab = tab; hmView(); }
/* After an EN | BM switch: everything is drawn again in the new language. The search box (and what is typed in it), the
   tab, the scroll position and the focus stay; the static words were already rewritten from their data-i18n keys. */
function hmRelang(root){
  document.title = T('hm.title');
  hmLangHelpLinks(root);
  hmApplyTheme(HM.theme);
  var sc = document.getElementById('hmStart');
  if(sc && sc.innerHTML) sc.innerHTML = hmStartHTML('home');
  HM.painted = {};
  hmView();
}

function showHome(){
  if(HM.shown) return;
  HM.shown = true;
  ['head', 'nav', 'finderWrap'].forEach(function(id){ var e = document.getElementById(id); if(e) e.hidden = true; });
  var main = document.querySelector('main'), foot = document.querySelector('footer');
  if(main) main.hidden = true;
  if(foot) foot.hidden = true;
  document.title = T('hm.title');
  var root = document.createElement('div');
  root.id = 'home'; root.className = 'hm';
  root.innerHTML = hmHeaderHTML() +
    '<main class="hm-body"><div class="hm-wrap"><div class="hm-upd" id="hmUpd"></div>' +
    '<div id="hmStart">' + (hmStartWanted(hmStore()) ? hmStartHTML('home') : '') + '</div>' +
    '<div id="hmList" role="tabpanel"></div>' +
    '<p class="hm-foot"><span data-i18n="foot.text">' + hmEsc(T('foot.text')) + '</span> \u00B7 <a href="/help" data-i18n="nav.help">' + hmEsc(T('nav.help')) + '</a></p></div></main>';
  document.body.insertBefore(root, document.body.firstChild);
  hmLangHelpLinks(root);
  var note = document.getElementById('langBar'); if(note) document.body.insertBefore(note, root);   // the "Bahasa Malaysia tersedia" note stays at the very top
  if(typeof ddOnLang === 'function') ddOnLang(function(){ hmRelang(root); });
  if(typeof ddNoteUpdate === 'function') ddNoteUpdate();
  hmApplyTheme(hmSavedTheme());
  HM.tab = hmTabFromHash(location.hash);
  hmView();

  root.addEventListener('click', function(e){
    var ok = e.target && e.target.closest ? e.target.closest('[data-start-ok]') : null;
    if(ok){
      hmStartDismiss(hmStore());
      var sc = document.getElementById('hmStart'); if(sc) sc.innerHTML = '';
      var on = document.querySelector('#hmTabs [aria-selected="true"]'); if(on && on.focus) on.focus();   // the keyboard focus goes on to the event tabs
      return;
    }
    var rt = e.target && e.target.closest ? e.target.closest('[data-hm-retry]') : null;
    if(rt){ HM.failed = false; hmView(); HM.poll.start(); try{ root.setAttribute('tabindex', '-1'); root.focus({ preventScroll: true }); }catch(err){} return; }   // shows "Loading events" again, then the result of a fresh try
    var t = e.target && e.target.closest ? e.target.closest('[data-hm-tab]') : null;
    if(t){ var k = t.getAttribute('data-hm-tab'); location.hash = '#/' + k; hmSetTab(k); }
  });
  root.addEventListener('keydown', function(e){
    if((e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') || !e.target || !e.target.closest || !e.target.closest('#hmTabs')) return;
    var i = HM_TABS.indexOf(HM.tab || hmDefaultTab(HM.data)), k = HM_TABS[(i + (e.key === 'ArrowRight' ? 1 : HM_TABS.length - 1)) % HM_TABS.length];
    location.hash = '#/' + k; hmSetTab(k);
    var b = document.getElementById('hm-t-' + k); if(b) b.focus();
  });
  document.getElementById('hmQ').addEventListener('input', function(e){ HM.q = e.target.value; hmView(); });
  document.getElementById('hmQ').addEventListener('keydown', function(e){
    if(e.key !== 'Enter') return;
    var href = hmOpenHref(HM.q);
    if(href) location.href = href;
  });
  document.getElementById('hmTheme').addEventListener('click', function(){ hmApplyTheme({ auto:'light', light:'dark', dark:'auto' }[HM.theme]); });
  window.addEventListener('hashchange', function(){ var k = hmTabFromHash(location.hash); if(k && k !== HM.tab) hmSetTab(k); });
  HM.poll = hmPoller({ fetch: hmFetch, apply: hmApplyData, fail: function(){ HM.failed = true; }, render: hmView, every: 30000, hidden: function(){ return !!document.hidden; },
    setT: function(f, ms){ return setTimeout(f, ms); }, clearT: function(t){ clearTimeout(t); } });
  document.addEventListener('visibilitychange', function(){ if(!document.hidden) HM.poll.start(); });   // supersedes a load in flight; still one chain
  setInterval(hmStatus, 15000);
  HM.poll.start();
}

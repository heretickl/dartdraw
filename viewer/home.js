/* The public home page: shown at the bare address (no event link). A branded list of the events organisers have chosen
   to list, fetched from /api/events. Read-only; nothing here can change a tournament. Everything that builds HTML is a
   plain function (hm...) so it can be tested without a browser; showHome() (further down) is the only part that touches
   the page. Everything shown is escaped with hmEsc. */

var HM_FORMAT = { roundrobin:'Round robin', knockout:'Knockout', rrknockout:'Round robin + knockout', podknockout:'Group Boards' };
var HM_NOUN = { Singles:['player','players'], Doubles:['pair','pairs'], Triples:['triple','triples'], Teams:['team','teams'] };
var HM_EMPTY = { live:'Nothing is live right now.', upcoming:'No upcoming events listed.', results:'No recent results.' };
var HM_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
var HM_DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
var HM_TABS = ['live', 'upcoming', 'results'];
var HM_TAB_LABEL = { live:'Live', upcoming:'Upcoming', results:'Results' };

function hmEsc(s){
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function hmHas(o, k){ return Object.prototype.hasOwnProperty.call(o, k); }   // own keys only: 'constructor' or '__proto__' are not formats or units
function hmFormatLabel(f){ return hmHas(HM_FORMAT, f) ? HM_FORMAT[f] : ''; }
function hmEntriesHTML(it){
  var n = (it.entries | 0);
  if(n <= 0) return '';
  var w = hmHas(HM_NOUN, it.unit) ? HM_NOUN[it.unit] : ['entry', 'entries'];
  return '<b>' + n + '</b> ' + (n === 1 ? w[0] : w[1]);
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
  return '<a class="hm-open" href="' + hmEsc(href) + '"><span>Open event <b>' + hmEsc(c.code) + '</b></span><span aria-hidden="true">\u203A</span></a>';
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
  if(date === today) return 'Today';
  var p = hmParts(date);
  return p ? HM_DAYS[p.wd] + ' ' + p.d + ' ' + HM_MONTHS[p.m - 1] : '';
}
function hmTimeLabel(t){
  var m = /^(\d{2}):(\d{2})$/.exec(String(t || ''));
  if(!m) return '';
  var h = +m[1], ap = h >= 12 ? 'pm' : 'am';
  if(h > 23 || +m[2] > 59) return '';
  h = h % 12; if(h === 0) h = 12;
  return h + ':' + m[2] + ' ' + ap;
}
function hmTile(date){
  var p = hmParts(date);
  if(!p) return '<div class="hm-tile hm-tba"><b>TBA</b></div>';
  return '<div class="hm-tile"><s>' + HM_MONTHS[p.m - 1] + '</s><b>' + p.d + '</b><s>' + HM_DAYS[p.wd] + '</s></div>';
}

/* ---- cards and lists ---- */
/* ---- stage subcards: one subcard per stage inside the one event card (the server sends it.stages) ---- */
var HM_STAGE_STATES = { groups:['notstarted', 'live', 'done'], knockout:['waiting', 'next', 'ready', 'live', 'done'], finals:['waiting', 'next', 'ready', 'live', 'done'] };
function hmInt(n){ n = n | 0; return n > 0 ? n : 0; }
function hmRingHTML(d, t){
  var pct = t > 0 ? Math.max(0, Math.min(99, Math.floor(100 * d / t))) : 0;   // the ring never shows 100%
  return '<div class="hm-ring" style="--p:' + pct + '" role="img" aria-label="' + pct + ' percent played"><span>' + pct + '%</span></div>';
}
function hmPipHTML(kind, inner){
  return '<div class="hm-pip' + (kind ? ' ' + kind : '') + '"' + (kind ? ' aria-hidden="true"' : '') + '>' + inner + '</div>';
}
function hmStageLabel(it, key){
  return key === 'knockout' ? 'Knockout' : key === 'finals' ? 'Finals' : (it.format === 'podknockout' ? 'Groups' : 'Round robin');
}
function hmAdvanceText(it, n){
  var w = hmHas(HM_NOUN, it.unit) ? HM_NOUN[it.unit] : ['entry', 'entries'];
  return n + ' ' + (n === 1 ? w[0] + ' advances' : w[1] + ' advance');
}
/* One subcard. idx/count place it among the stages (the stage number on a waiting pip; a single stage has no number). */
function hmStageHTML(kind, it, s, idx, count){
  var st = s.state, isGroups = s.key === 'groups';
  var d = hmInt(s.done), t = hmInt(s.total), n = hmInt(s.groups);
  var num = count > 1 ? String(idx + 1) : '';
  var nGroups = n > 0 ? n + (n === 1 ? ' group' : ' groups') : '';
  var cls = '', lead, v, sub = '';
  var winner = kind === 'results' && typeof it.winner === 'string' && it.winner && idx === count - 1 && !isGroups;
  if(st === 'live'){
    cls = ' is-live'; lead = hmRingHTML(d, t);
    if(isGroups){ v = 'In progress'; sub = d + ' of ' + t + ' matches' + (nGroups ? ' \u00B7 ' + nGroups : ''); }
    else { v = typeof s.round === 'string' && s.round ? s.round : 'In progress'; sub = d + ' of ' + t + ' matches played'; }
  } else if(st === 'done'){
    cls = ' is-done';
    var played = t > 0 ? (isGroups ? d : t) + ' of ' + t + ' matches' : '';   // no matches at all (a bracket of one): say nothing about them
    if(winner){ lead = hmPipHTML('trophy', '\uD83C\uDFC6'); v = 'Winner ' + it.winner; sub = played ? 'Complete \u00B7 ' + played : 'Complete'; }
    else {
      // The last stage is over but the organiser has not accepted the results yet: the server says so in progress.next.
      var wait = kind === 'live' && idx === count - 1 && it.progress && typeof it.progress.next === 'string' ? it.progress.next : '';
      lead = hmPipHTML('done', '\u2713'); v = 'Complete'; sub = [played, isGroups ? nGroups : '', wait].filter(Boolean).join(' \u00B7 ');
    }
  } else if(st === 'next'){
    lead = hmPipHTML('draw', '\u2026'); v = s.key === 'finals' ? 'Up next' : 'Draw next';
    var adv = hmInt(s.advance); sub = adv > 0 ? hmAdvanceText(it, adv) : '';
  } else if(st === 'ready'){
    cls = ''; lead = hmPipHTML(num ? '' : 'dot', num); v = 'Draw made'; sub = 'Not started yet';
  } else if(st === 'waiting'){
    cls = ' is-wait'; lead = hmPipHTML(num ? '' : 'dot', num); v = 'Waiting for groups'; sub = 'Starts when every group is done';
  } else {   // groups, notstarted
    cls = ' is-wait'; lead = hmPipHTML(num ? '' : 'dot', num); v = 'Not started'; sub = nGroups;
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
    '<div class="hm-main"><div class="hm-name">' + hmEsc(it.event) + '</div><div class="hm-sub">' + (time ? '<b>' + hmEsc(time) + '</b>' : '') + tag + entHTML + '</div></div>' +
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
      lead = '<div class="hm-ring" style="--p:100" role="img" aria-label="stage complete"><span class="hm-tick">\u2713</span></div>';
      lines = '<div class="hm-sub">' + tag + entHTML + '</div>' + '<div class="hm-sub">' + hmEsc(p.stage) + ' complete \u00B7 ' + hmEsc(next) + '</div>';
    } else {
      lead = pct == null ? '<div class="hm-livedot" aria-hidden="true"></div>'
        : '<div class="hm-ring" style="--p:' + pct + '" role="img" aria-label="' + pct + ' percent played"><span>' + pct + '%</span></div>';
      lines = '<div class="hm-sub">' + tag + entHTML + '</div>' +
        (p ? '<div class="hm-sub">' + hmEsc(p.stage) + ' \u00B7 ' + (p.done | 0) + ' of ' + (p.total | 0) + ' matches played</div>' : '');
    }
  } else if(kind === 'upcoming'){
    var time = hmTimeLabel(it.start);
    lead = hmTile(it.date);
    lines = '<div class="hm-sub">' + (time ? '<b>' + hmEsc(time) + '</b>' : '') + tag + entHTML + '</div>';
  } else {
    lead = '<div class="hm-trophy" aria-hidden="true">\uD83C\uDFC6</div>';
    lines = (it.winner ? '<div class="hm-sub">Winner <b>' + hmEsc(it.winner) + '</b></div>' : '') + '<div class="hm-sub">' + tag + entHTML + '</div>';
  }
  return '<a class="hm-ev' + (kind === 'live' ? ' hm-live' : '') + '" href="' + hmEsc(href) + '"><div class="hm-lead">' + lead + '</div>' +
    '<div class="hm-main"><div class="hm-name">' + hmEsc(it.event) + '</div>' + lines + '</div><span class="hm-chev" aria-hidden="true">\u203A</span></a>';
}
function hmListHTML(kind, items, q, today){
  if(!items.length){
    return '<p class="hm-none">' + HM_EMPTY[kind] + '</p>' +
      (kind === 'live' ? '<p class="hm-none"><button type="button" class="hm-btn" data-hm-tab="upcoming">See upcoming events</button></p>' : '');
  }
  var shown = hmFilter(items, q);
  if(!shown.length) return '<p class="hm-none">No events match \u201C' + hmEsc(q) + '\u201D.<br>Have a link or code? Paste it in the search box.</p>';
  return hmGroup(shown).map(function(g){
    return '<section class="hm-group"><h2>' + hmEsc(g.tournament || 'Other events') + '<span>' + hmEsc(hmDateLabel(g.date, today)) + '</span></h2>' +
      '<div class="hm-list">' + g.items.map(function(it){ return hmCardHTML(kind, it); }).join('') + '</div></section>';
  }).join('');
}
function hmTabsHTML(data, tab){
  return HM_TABS.map(function(k){
    var n = data[k].length;
    return '<button type="button" role="tab" id="hm-t-' + k + '" data-hm-tab="' + k + '" aria-selected="' + (k === tab ? 'true' : 'false') + '" aria-controls="hmList" tabindex="' + (k === tab ? '0' : '-1') + '">' +
      (k === 'live' && n ? '<span class="hm-dot"></span>' : '') + HM_TAB_LABEL[k] + '<span class="hm-c">' + n + '</span></button>';
  }).join('');
}
function hmUpdatedText(okAt, failed, now){
  if(failed) return 'Can\'t refresh right now. Retrying\u2026';
  if(!okAt) return 'Loading events\u2026';
  var mins = Math.floor((now - okAt) / 60000);
  return mins < 1 ? 'Updated just now' : 'Updated ' + mins + ' min ago';
}
function hmHomeLinkHTML(){ return '<p><a class="hm-btn" href="/">See all events</a></p>'; }

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

function hmHeaderHTML(){
  return '<header class="hm-top"><div class="hm-wrap">' +
    '<div class="hm-row1"><a class="hm-brand" href="/"><span class="hm-mark" aria-hidden="true">D</span><b>DartDraw</b><i>Live</i></a>' +
    '<div class="hm-tools"><a class="hm-help" href="/help">Help</a>' +
    '<button class="hm-ibtn" id="hmTheme" type="button" aria-label="Colour theme: auto. Tap to change">' + HM_THEME_ICON.auto + '</button></div></div>' +
    '<label class="hm-find"><svg viewBox="0 0 24 24" fill="none" stroke="#dbe5f1" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>' +
    '<input id="hmQ" type="search" placeholder="Search events or paste a code" aria-label="Search events, or paste an event link or code" autocomplete="off" autocapitalize="off" spellcheck="false"></label>' +
    '<div id="hmOpen"></div>' +
    '<div class="hm-seg" role="tablist" aria-label="Events" id="hmTabs"></div>' +
    '</div></header>';
}
function hmSavedTheme(){ try{ var t = localStorage.getItem(HM_THEME_KEY); return (t === 'light' || t === 'dark') ? t : 'auto'; }catch(e){ return 'auto'; } }
function hmApplyTheme(t){
  HM.theme = t;
  var root = document.documentElement;
  if(t === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', t);
  try{ if(t === 'auto') localStorage.removeItem(HM_THEME_KEY); else localStorage.setItem(HM_THEME_KEY, t); }catch(e){}
  var b = document.getElementById('hmTheme');
  if(b){ b.textContent = HM_THEME_ICON[t]; b.setAttribute('aria-label', 'Colour theme: ' + t + '. Tap to change'); }
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
  hmPaint('hmTabs', hmTabsHTML(HM.data, tab));
  hmPaint('hmOpen', hmOpenHTML(HM.q));
  var loading = !HM.okAt && !HM.failed;
  hmPaint('hmList', loading ? '<p class="hm-none">Loading events\u2026</p>' : hmListHTML(tab, HM.data[tab], HM.q, hmToday()));
  hmStatus();
}
/* What the status line should look like: its class, its HTML, and whether it announces itself. Only the failure message is
   announced to screen readers; the ticking "Updated n min ago" text is not. */
function hmStatusState(okAt, failed, now){
  return { cls: 'hm-upd' + (failed ? ' hm-bad' : ''),
    html: '<i></i>' + hmEsc(hmUpdatedText(okAt, failed, now)) + (failed ? '' : ' \u00B7 refreshes automatically'),
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

function showHome(){
  if(HM.shown) return;
  HM.shown = true;
  ['head', 'nav', 'finderWrap'].forEach(function(id){ var e = document.getElementById(id); if(e) e.hidden = true; });
  var main = document.querySelector('main'), foot = document.querySelector('footer');
  if(main) main.hidden = true;
  if(foot) foot.hidden = true;
  document.title = 'DartDraw Live';
  var root = document.createElement('div');
  root.id = 'home'; root.className = 'hm';
  root.innerHTML = hmHeaderHTML() +
    '<main class="hm-body"><div class="hm-wrap"><div class="hm-upd" id="hmUpd"></div>' +
    '<div id="hmList" role="tabpanel"></div>' +
    '<p class="hm-foot">Results update automatically \u00B7 Powered by DartDraw \u00B7 <a href="/help">Help</a></p></div></main>';
  document.body.insertBefore(root, document.body.firstChild);
  hmApplyTheme(hmSavedTheme());
  HM.tab = hmTabFromHash(location.hash);
  hmView();

  root.addEventListener('click', function(e){
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

/* The viewer's language (EN | BM): the choice, T(key, vars), the static markup, the EN | BM switch, the "Bahasa Malaysia
   tersedia" note, and dates and times. Loaded after render.js (DD_RENDER_EN, ddFormat), i18n/en.js and (only for BM, see
   "Page weight" below) i18n/render.ms.js and i18n/ms.js, and before home.js and the page's own script. Nothing here talks to the server.
   - The choice: ?lang=ms|en wins and is saved; then localStorage "dartdraw.lang" (the viewer's own site, so its own
     choice; the Help pages' switch saves the same key); otherwise English. Never chosen from the browser language: a
     Malay browser only gets the note offering BM.
   - A switch changes <html lang>, the title and every word on the page at once, with no reload: pages register a redraw
     with ddOnLang(fn); the address (#tab, group, player), the open keys, Me / Following and the scroll position stay.
   - T(key, vars) reads the current table and falls back to English (with one console warning per missing key).
   render.js asks DD_T(key, vars), which is T.
   - Page weight: the two BM tables (DD_MS_FILES, named by the small inline script in index.html just before this file) are
     downloaded only when needed. That script writes their <script> tags when BM is the language at start-up (?lang=ms,
     else the saved choice), so they run before this file. Otherwise ddLoadLang('ms') fetches them on a switch to BM: the
     page stays English until both are in, then changes at once. If they do not arrive (offline, blocked) the page stays
     English and the next switch tries again. */
var DD_LANG_KEY = 'dartdraw.lang', DD_NOTE_KEY = 'dartdraw.lang.note';
function ddMerge(a, b){ var o = {}, k; for(k in a) if(Object.prototype.hasOwnProperty.call(a, k)) o[k] = a[k]; for(k in b) if(Object.prototype.hasOwnProperty.call(b, k)) o[k] = b[k]; return o; }
/* true once both BM tables are on the page */
function ddMsLoaded(){ return typeof DD_RENDER_MS !== 'undefined' && typeof DD_VIEWER_MS !== 'undefined'; }
function ddMsTable(){ return ddMsLoaded() ? ddMerge(DD_RENDER_MS, DD_VIEWER_MS) : {}; }
var DD_TABLES = {
  en: ddMerge(typeof DD_RENDER_EN !== 'undefined' ? DD_RENDER_EN : {}, typeof DD_VIEWER_EN !== 'undefined' ? DD_VIEWER_EN : {}),
  ms: ddMsTable()
};
var DD_I18N = { lang: 'en', hooks: [], warned: {}, want: null };
/* Whether language l's words are on the page (English always is). */
function ddHasLang(l){ return l === 'en' || (l === 'ms' && ddMsLoaded()); }

/* ---- loading the BM tables on demand. done(ok) is called once every file has arrived or failed; ok: the tables are in.
   A file that fails is taken off the page so the next try asks for it again. ---- */
var DD_LOAD = { files: {}, waiting: [] };
function ddLoadLang(l, done){
  done = typeof done === 'function' ? done : function(){};
  if(ddHasLang(l)){ if(l === 'ms' && !DD_TABLES.ms['page.title']) DD_TABLES.ms = ddMsTable(); done(true); return; }
  if(l !== 'ms'){ done(false); return; }
  DD_LOAD.waiting.push(done);
  var files = typeof DD_MS_FILES !== 'undefined' && DD_MS_FILES && DD_MS_FILES.length ? DD_MS_FILES : [];
  var parent = null;
  try{ parent = document.head || document.documentElement; }catch(e){}
  if(!files.length || !parent || !document.createElement){ ddLoadDone(); return; }
  files.forEach(function(f){
    if(DD_LOAD.files[f]) return;   // already asked for
    DD_LOAD.files[f] = 'loading';
    var s = document.createElement('script');
    s.async = false;
    s.onload = function(){ DD_LOAD.files[f] = 'ok'; ddLoadDone(); };
    s.onerror = function(){ delete DD_LOAD.files[f]; try{ if(s.parentNode) s.parentNode.removeChild(s); }catch(e){} ddLoadDone(); };
    s.src = f;
    parent.appendChild(s);
  });
}
function ddLoadDone(){
  for(var f in DD_LOAD.files) if(Object.prototype.hasOwnProperty.call(DD_LOAD.files, f) && DD_LOAD.files[f] === 'loading') return;
  var ok = ddMsLoaded();
  if(ok) DD_TABLES.ms = ddMsTable();
  else DD_LOAD.files = {};   // a file arrived without its table (or none was asked for): all of them again next time
  var w = DD_LOAD.waiting; DD_LOAD.waiting = [];
  w.forEach(function(fn){ try{ fn(ok); }catch(e){ try{ console.error(e); }catch(e2){} } });
}

function ddValidLang(l){ return l === 'en' || l === 'ms'; }
function ddSaved(){ try{ var s = localStorage.getItem(DD_LANG_KEY); return ddValidLang(s) ? s : null; }catch(e){ return null; } }
function ddSave(l){ try{ localStorage.setItem(DD_LANG_KEY, l); }catch(e){} }
/* The language the page is drawn in. (A choice made in another tab arrives by the storage event below.) */
function ddLang(){ return DD_I18N.lang; }
/* The language for a link to the Help: the saved choice when there is one (the Help page reads the same key), else the page's. */
function ddLinkLang(){ return ddSaved() || DD_I18N.lang; }

/* Same rules as render.js's ddFormat (it is used when render.js is loaded; this is the fallback for a page without it). */
function ddFill(s, vars){
  if(typeof ddFormat === 'function') return ddFormat(s, vars);
  if(s && typeof s === 'object') s = (vars && Number(vars.n) === 1 && s.one != null) ? s.one : s.other;
  s = String(s == null ? '' : s);
  return vars ? s.replace(/\{(\w+)\}/g, function(m, k){ return Object.prototype.hasOwnProperty.call(vars, k) && vars[k] != null ? String(vars[k]) : m; }) : s;
}
function T(key, vars){
  var l = ddLang(), tab = DD_TABLES[l] || DD_TABLES.en, has = Object.prototype.hasOwnProperty;
  if(has.call(tab, key)) return ddFill(tab[key], vars);
  if(!DD_I18N.warned[l + ':' + key]){
    DD_I18N.warned[l + ':' + key] = true;
    try{ if(typeof console !== 'undefined' && console.warn) console.warn('[i18n] missing "' + key + '" in ' + l + (l !== 'en' && has.call(DD_TABLES.en, key) ? ' (English shown)' : '')); }catch(e){}
  }
  return has.call(DD_TABLES.en, key) ? ddFill(DD_TABLES.en[key], vars) : key;
}
function DD_T(key, vars){ return T(key, vars); }
/* A key with a twin for Teams events: key + '.team' or '.player'. */
function TU(key, team, vars){ return T(key + (team ? '.team' : '.player'), vars); }
/* "1st" / "ke-1": the English suffix decides which key; BM uses ke-N for every one. */
function ddOrdinal(n){
  var s = ['th','st','nd','rd'], v = n % 100;
  return T('ord.' + (s[(v - 20) % 10] || s[v] || s[0]), {n: n});
}

/* ---- dates and times: Intl ms-MY / en-GB (12-hour: 7:10 PTG, 7:10 pm) ---- */
function ddLocale(){ return ddLang() === 'ms' ? 'ms-MY' : 'en-GB'; }
function ddClock(d){
  try{ return new Intl.DateTimeFormat(ddLocale(), { hour: 'numeric', minute: '2-digit', hour12: true }).format(d); }
  catch(e){ var h = d.getHours(), m = d.getMinutes(); return ((h % 12) || 12) + ':' + (m < 10 ? '0' : '') + m + ' ' + (h < 12 ? (ddLang() === 'ms' ? 'PG' : 'am') : (ddLang() === 'ms' ? 'PTG' : 'pm')); }
}
/* A stored YYYY-MM-DD date as the page shows it: dd/mm/yyyy in BM; the English page keeps the date as stored. */
function ddDateNum(iso){
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if(!m || ddLang() !== 'ms') return String(iso == null ? '' : iso);
  try{ return new Intl.DateTimeFormat('ms-MY', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(+m[1], +m[2] - 1, +m[3])); }
  catch(e){ return m[3] + '/' + m[2] + '/' + m[1]; }
}
function ddMonth(i){ return T('date.mon.' + i); }
function ddWeekday(i){ return T('date.wd.' + i); }

/* ---- static markup: data-i18n="key" sets the text; data-i18n-attr="placeholder:key;aria-label:key" sets attributes ---- */
function ddApplyStatic(root){
  root = root || (typeof document !== 'undefined' ? document : null);
  if(!root || !root.querySelectorAll) return;
  [].forEach.call(root.querySelectorAll('[data-i18n]'), function(el){ el.textContent = T(el.getAttribute('data-i18n')); });
  [].forEach.call(root.querySelectorAll('[data-i18n-attr]'), function(el){
    String(el.getAttribute('data-i18n-attr')).split(';').forEach(function(pair){
      var i = pair.indexOf(':'); if(i > 0) el.setAttribute(pair.slice(0, i).trim(), T(pair.slice(i + 1).trim()));
    });
  });
}

/* ---- the EN | BM switch ----
   kind 'pair': two buttons, EN and BM, the current one pressed (event page, home from 481 px).
   kind 'toggle': one button that shows the other language (home on a phone). The words are the same in both languages. */
function ddSwitchHTML(kind){
  var l = ddLang();
  if(kind === 'toggle'){
    var o = l === 'ms' ? 'en' : 'ms';
    return '<button type="button" class="langtog" data-lang-set="' + o + '" lang="' + o + '" aria-label="' + (o === 'ms' ? 'Tukar ke Bahasa Malaysia' : 'Switch to English') + '">' + (o === 'ms' ? 'BM' : 'EN') + '</button>';
  }
  return '<div class="langsw" role="group" aria-label="Language / Bahasa">' +
    '<button type="button" lang="en" aria-label="English" data-lang-set="en" aria-pressed="' + (l === 'en') + '">EN</button>' +
    '<button type="button" lang="ms" aria-label="Bahasa Malaysia" data-lang-set="ms" aria-pressed="' + (l === 'ms') + '">BM</button></div>';
}
/* Brings every switch on the page up to date (the elements stay, so the keyboard focus stays on them). */
function ddSyncSwitches(){
  if(typeof document === 'undefined' || !document.querySelectorAll) return;
  var l = ddLang();
  [].forEach.call(document.querySelectorAll('.langsw [data-lang-set]'), function(b){ b.setAttribute('aria-pressed', b.getAttribute('data-lang-set') === l ? 'true' : 'false'); });
  [].forEach.call(document.querySelectorAll('.langtog'), function(b){
    var o = l === 'ms' ? 'en' : 'ms';
    b.setAttribute('data-lang-set', o); b.setAttribute('lang', o); b.textContent = o === 'ms' ? 'BM' : 'EN';
    b.setAttribute('aria-label', o === 'ms' ? 'Tukar ke Bahasa Malaysia' : 'Switch to English');
  });
}
function ddOnLang(fn){ DD_I18N.hooks.push(fn); }
/* Marks every switch busy while the BM tables load (the page stays in its language until they are in). */
function ddBusy(on){
  if(typeof document === 'undefined' || !document.querySelectorAll) return;
  [].forEach.call(document.querySelectorAll('.langsw, .langtog'), function(g){ if(on) g.setAttribute('aria-busy', 'true'); else g.removeAttribute('aria-busy'); });
}
/* Switches the page's language: saves it, sets <html lang>, redraws. BM not loaded yet: loads it first, the page staying
   as it is; the switch happens when the tables are in, unless another choice was made meanwhile. If they cannot be
   loaded, nothing changes (and nothing is saved). opts.after(ok): called once the switch is done or has failed. */
function ddSetLang(l, opts){
  if(!ddValidLang(l)) return;
  DD_I18N.want = l;
  if(!ddHasLang(l)){
    ddBusy(true);
    ddLoadLang(l, function(ok){
      ddBusy(false);
      if(DD_I18N.want !== l) return;
      DD_I18N.want = null;
      if(ok) ddSetLang(l, opts);
      else if(opts && opts.after) opts.after(false);
    });
    return;
  }
  DD_I18N.want = null;
  DD_I18N.lang = l; ddSave(l);
  ddApplyLang();
  if(!(opts && opts.quiet)) ddNoteUpdate();
  if(opts && opts.after) opts.after(true);
}
/* Another tab changed the choice: follow it (loading BM first when needed). */
function ddFollow(l){
  if(!ddValidLang(l)) return;
  if(l === DD_I18N.lang){ DD_I18N.want = null; return; }
  DD_I18N.want = l;
  ddLoadLang(l, function(ok){
    if(!ok || DD_I18N.want !== l) return;
    DD_I18N.want = null;
    DD_I18N.lang = l; ddApplyLang(); ddNoteUpdate();
  });
}
function ddApplyLang(){
  var l = ddLang();
  try{ if(typeof document !== 'undefined' && document.documentElement) document.documentElement.setAttribute('lang', l); }catch(e){}
  ddApplyStatic();
  ddSyncSwitches();
  DD_I18N.hooks.forEach(function(fn){ try{ fn(l); }catch(e){ try{ console.error(e); }catch(e2){} } });
}

/* ---- the "Bahasa Malaysia tersedia" note: an English page, nothing saved, a Malay first browser language, not closed ---- */
function ddNoteWanted(nav, saved, closed, lang){
  var n = String((nav && ((nav.languages && nav.languages[0]) || nav.language)) || '');
  return lang === 'en' && !saved && closed !== 'closed' && /^ms/i.test(n);
}
function ddNoteUpdate(){
  if(typeof document === 'undefined' || !document.getElementById) return;
  var bar = document.getElementById('langBar');
  if(!bar) return;
  var closed = null; try{ closed = localStorage.getItem(DD_NOTE_KEY); }catch(e){}
  bar.hidden = !ddNoteWanted(typeof navigator !== 'undefined' ? navigator : null, ddSaved(), closed, ddLang());
}

/* ---- start-up: ?lang wins (saved, then dropped from the address so a shared link does not carry it) ---- */
(function(){
  var q = '';
  try{ q = String(location.search || ''); }catch(e){}
  var m = /[?&]lang=(en|ms)(?=&|$)/.exec(q), saved = ddSaved();
  DD_I18N.lang = m ? m[1] : (saved || 'en');
  /* BM chosen but its tables did not arrive (offline, blocked): English, the choice kept; the switch tries again */
  if(!ddHasLang(DD_I18N.lang)) DD_I18N.lang = 'en';
  if(m){
    ddSave(m[1]);
    try{
      var rest = q.replace(/([?&])lang=(en|ms)(&|$)/, function(a, b, c, d){ return d ? b : ''; }).replace(/[?&]$/, '');
      if(typeof history !== 'undefined' && history.replaceState) history.replaceState(null, '', location.pathname + rest + (location.hash || ''));
    }catch(e){}
  }
  try{ if(typeof document !== 'undefined' && document.documentElement) document.documentElement.setAttribute('lang', ddLang()); }catch(e){}
})();

/* Clicks on any switch or the note; another tab changing the choice. Wired once the page is there. */
function ddWire(){
  if(typeof document === 'undefined' || !document.addEventListener) return;
  document.addEventListener('click', function(e){
    var t = e.target && e.target.closest ? e.target : null;
    if(!t) return;
    var x = t.closest('[data-langbar-close]');
    if(x){ try{ localStorage.setItem(DD_NOTE_KEY, 'closed'); }catch(err){} var bar = document.getElementById('langBar'); if(bar) bar.hidden = true; return; }
    var b = t.closest('[data-lang-set]');
    if(!b) return;
    if(e.preventDefault) e.preventDefault();
    var l = b.getAttribute('data-lang-set'), pair = !!t.closest('.langsw'), tog = !!t.closest('.langtog');
    var after = function(ok){
      var bar2 = document.getElementById('langBar'); if(ok && bar2 && l === 'ms') bar2.hidden = true;
      var back = (pair || tog) ? b : document.querySelector('.langsw [aria-pressed="true"]');   // the focus goes back to the switch
      if(back && back.focus) try{ back.focus({ preventScroll: true }); }catch(err){ back.focus(); }
    };
    if(l !== ddLang()) ddSetLang(l, { after: after });
    else { DD_I18N.want = null; after(true); }   // the language on screen: a BM load still under way no longer switches
  });
  if(typeof window !== 'undefined' && window.addEventListener) window.addEventListener('storage', function(e){
    if(e && e.key === DD_LANG_KEY && ddValidLang(e.newValue) && (e.newValue !== DD_I18N.lang || DD_I18N.want)) ddFollow(e.newValue);
  });
}
ddWire();

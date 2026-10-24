/* The organiser app's language (EN | BM): the choice, T(key, vars), the static markup, the EN | BM switch, the
   "Bahasa Malaysia tersedia" note, Help links by language, and dates, times and durations. Loaded after render.js
   (DD_RENDER_EN, ddFormat), i18n/render.ms.js, i18n/app.en.js, i18n/app.ms.js, the print tables and i18n/errors.en.js /
   errors.ms.js (the server error codes, see ddApiError), and before every other organiser
   script (they call T()). Nothing here saves an event or talks to the server.
   - The choice: ?lang=ms|en wins and is saved; then localStorage "dartdraw.lang" (the organiser app and the public site
     share this origin, so they share it); otherwise English. Never chosen from the browser language: a Malay browser
     only gets the note offering BM.
   - A switch changes <html lang>, the title and every word on the page at once, with no reload. The app registers what
     to redraw with ddOnLang(fn) (app.html: appRelang keeps the open event, step, scroll, typed fields and open box).
   - T(key, vars) reads the current table and falls back to English (with one console warning per missing key).
     render.js asks DD_T(key, vars), which is T.
   - Printed sheets: ddWithLang(ddPrintLang(), fn) draws fn's output in the print language, the event's own "Printed
     sheets language" setting (i18n step 4: printSettings.sheetLang; English when the event has none); the screens are in
     the UI language. The printed sheets' own words are in i18n/print.en.js / print.ms.js (merged into the same table).
   - Page weight: the four BM tables (DD_MS_FILES, named by the small inline script in app.html just before this file)
     are downloaded only when needed. That script writes their <script> tags when BM is the language at start-up (?lang=ms,
     else the saved choice), so they run before this file. Otherwise ddLoadLang('ms') fetches them on demand: on a switch
     to BM (the page stays English until every table is in, then changes at once), and for an event whose Printed sheets
     language is BM (its previews and sheets). A table that does not arrive (offline, blocked) leaves the page in English;
     the next switch tries again. */
var DD_LANG_KEY = 'dartdraw.lang', DD_NOTE_KEY = 'dartdraw.lang.note';
function ddMerge(){
  var o = {}, i, k, src;
  for(i = 0; i < arguments.length; i++){ src = arguments[i]; if(src) for(k in src) if(Object.prototype.hasOwnProperty.call(src, k)) o[k] = src[k]; }
  return o;
}
/* true once all four BM tables are on the page */
function ddMsLoaded(){ return typeof DD_RENDER_MS !== 'undefined' && typeof DD_APP_MS !== 'undefined' && typeof DD_PRINT_MS !== 'undefined' && typeof DD_ERR_MS !== 'undefined'; }
function ddMsTable(){ return ddMsLoaded() ? ddMerge(DD_RENDER_MS, DD_APP_MS, DD_PRINT_MS, DD_ERR_MS) : {}; }
var DD_TABLES = {
  en: ddMerge(typeof DD_RENDER_EN !== 'undefined' ? DD_RENDER_EN : null, typeof DD_APP_EN !== 'undefined' ? DD_APP_EN : null, typeof DD_PRINT_EN !== 'undefined' ? DD_PRINT_EN : null, typeof DD_ERR_EN !== 'undefined' ? DD_ERR_EN : null),
  ms: ddMsTable()
};
var DD_I18N = { lang: 'en', forced: null, hooks: [], warned: {}, want: null, held: null, hold: null };
/* Whether language l's words are on the page (English always is). */
function ddHasLang(l){ return l === 'en' || (l === 'ms' && ddMsLoaded()); }
/* The automatic entry names ("Pemain A1") in BM, needed even on an English page that has not loaded the BM tables:
   applyAutoNames keeps a name that is the slot's name in either language. Equal to app.ms.js (tests/app-i18n.test.js). */
var DD_AUTONAME_MS = { 'autoName.entry': 'Peserta {label}', 'autoName.player': 'Pemain {label}', 'autoName.pair': 'Pasangan {label}', 'autoName.triple': 'Trio {label}', 'autoName.team': 'Pasukan {label}' };

/* ---- loading the BM tables on demand. done(ok) is called once every file has arrived or failed; ok: the tables are in.
   A file that fails is taken off the page so the next try asks for it again. ---- */
var DD_LOAD = { files: {}, waiting: [] };
function ddLoadLang(l, done){
  done = typeof done === 'function' ? done : function(){};
  if(ddHasLang(l)){ if(l === 'ms' && !DD_TABLES.ms['app.title']) DD_TABLES.ms = ddMsTable(); done(true); return; }
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
/* The open event prints in BM but this page has no BM yet (an English screen): fetch the tables, then redraw (the
   previews and the sheet-language row). Nothing is saved; a failure leaves the previews in English. */
function ddNeedLang(l){
  if(ddHasLang(l) || DD_I18N.needing) return;
  DD_I18N.needing = true;
  ddLoadLang(l, function(ok){
    DD_I18N.needing = false;
    if(ok) DD_I18N.hooks.forEach(function(fn){ try{ fn(ddUiLang()); }catch(e){ try{ console.error(e); }catch(e2){} } });
  });
}

function ddValidLang(l){ return l === 'en' || l === 'ms'; }
function ddSaved(){ try{ var s = localStorage.getItem(DD_LANG_KEY); return ddValidLang(s) ? s : null; }catch(e){ return null; } }
function ddSave(l){ try{ localStorage.setItem(DD_LANG_KEY, l); }catch(e){} }
/* The language words are drawn in: the UI language, or the print language while a print builder runs. */
function ddLang(){ return DD_I18N.forced || DD_I18N.lang; }
/* The organiser's own choice (the switch), whatever is being drawn right now. */
function ddUiLang(){ return DD_I18N.lang; }
/* The language of printed sheets: a setting of each event (printSettings.sheetLang, 'en' | 'ms'), never the screen's
   language, so an event's paper does not change language because a different person prints it. An event saved before
   the setting existed (no field) prints in English, exactly as before. t: the event (default: the open one). */
function ddPrintLang(t){
  if(t === undefined){ try{ t = typeof state !== 'undefined' ? state : null; }catch(e){ t = null; } }
  var l = t && t.printSettings && t.printSettings.sheetLang;
  return ddValidLang(l) ? l : 'en';
}
/* Runs fn with every word drawn in language l (nested calls keep the outer language once they end). */
function ddWithLang(l, fn){
  var was = DD_I18N.forced;
  DD_I18N.forced = ddValidLang(l) ? l : was;
  try{ return fn(); } finally { DD_I18N.forced = was; }
}

/* Same rules as render.js's ddFormat (used when render.js is loaded; this is the fallback for a page without it). */
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
/* A server error answer ({ code, error }, i18n step 5: i18n/errors.en.js / errors.ms.js, keys "err.<code>") in the screen
   language: in BM the code's text, filled from the answer's own plain fields ({limit}); otherwise, or for a code with no BM
   (the Admin-only ones), the server's English error as sent; fallback when the answer has neither. */
function ddApiError(body, fallback){
  var has = Object.prototype.hasOwnProperty, code = body && typeof body.code === 'string' ? body.code : '';
  if(code && ddUiLang() !== 'en' && has.call(DD_TABLES[ddUiLang()] || {}, 'err.' + code)){
    var vars = {}, k;
    for(k in body) if(has.call(body, k) && (typeof body[k] === 'string' || typeof body[k] === 'number')) vars[k] = body[k];
    return T('err.' + code, vars);
  }
  return (body && typeof body.error === 'string' && body.error) ? body.error : fallback;
}
/* T() with a fallback for a stored value that has no key (an older or unusual code): the value itself. */
function TC(prefix, code){ var k = prefix + code; return Object.prototype.hasOwnProperty.call(DD_TABLES.en, k) ? T(k) : String(code == null ? '' : code); }
/* "1st" / "ke-1": the English suffix decides which key; BM uses ke-N for every one. */
function ddOrdinal(n){
  var s = ['th','st','nd','rd'], v = n % 100;
  return T('ord.' + (s[(v - 20) % 10] || s[v] || s[0]), {n: n});
}
/* "A, B and C" in the current language (the separator and the last joiner come from the table). */
function ddList(items){
  items = (items || []).map(String);
  if(items.length < 2) return items.join('');
  return items.slice(0, -1).join(T('list.sep')) + T('list.and', {last: items[items.length - 1]});
}

/* ---- dates and times: Intl ms-MY in BM (7:10 PTG, 23/10/2026); English keeps what the app always showed ---- */
function ddLocale(){ return ddLang() === 'ms' ? 'ms-MY' : 'en-GB'; }
/* A clock time from epoch ms. English: the device's own format, as before; BM: 12-hour ms-MY (7:10 PTG). */
function ddClockMs(ms){
  var d = new Date(ms);
  if(ddLang() !== 'ms') return d.toLocaleTimeString([], {hour:'numeric', minute:'2-digit'});
  try{ return new Intl.DateTimeFormat('ms-MY', { hour: 'numeric', minute: '2-digit', hour12: true }).format(d); }
  catch(e){ var h = d.getHours(), m = d.getMinutes(); return ((h % 12) || 12) + ':' + (m < 10 ? '0' : '') + m + ' ' + (h < 12 ? 'PG' : 'PTG'); }
}
/* A date and time (when an event was finalized). English: the device's own format, as before; BM: dd/mm/yyyy, 7:10 PTG. */
function ddDateTime(d){
  if(ddLang() !== 'ms') return d.toLocaleString();
  try{ return new Intl.DateTimeFormat('ms-MY', { day: '2-digit', month: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).format(d); }
  catch(e){ return d.toLocaleString(); }
}
/* A stored YYYY-MM-DD date as the screen shows it: dd/mm/yyyy in BM; English keeps the date as stored. */
function ddDateNum(iso){
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if(!m || ddLang() !== 'ms') return String(iso == null ? '' : iso);
  try{ return new Intl.DateTimeFormat('ms-MY', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(+m[1], +m[2] - 1, +m[3])); }
  catch(e){ return m[3] + '/' + m[2] + '/' + m[1]; }
}

/* ---- Help links: /help or /ms/help by the UI language, the anchor kept ---- */
function ddHelpPath(){ return ddUiLang() === 'ms' ? '/ms/help' : '/help'; }

/* ---- static markup: data-i18n="key" sets the text, data-i18n-html="key" the (trusted) markup,
   data-i18n-attr="aria-label:key;title:key" attributes, data-help="anchor" a Help link's href.
   DD_STATIC_SEL: elements whose markup is pinned by tests (no extra attribute wanted): [selector, key, 'text' | 'help']
   ('help' also points the link at the Help page in the UI language). ---- */
var DD_STATIC_SEL = [];
function ddApplyStatic(root){
  root = root || (typeof document !== 'undefined' ? document : null);
  if(!root || !root.querySelectorAll) return;
  [].forEach.call(root.querySelectorAll('[data-i18n]'), function(el){ el.textContent = T(el.getAttribute('data-i18n')); });
  [].forEach.call(root.querySelectorAll('[data-i18n-html]'), function(el){ el.innerHTML = T(el.getAttribute('data-i18n-html')); });
  [].forEach.call(root.querySelectorAll('[data-i18n-attr]'), function(el){
    String(el.getAttribute('data-i18n-attr')).split(';').forEach(function(pair){
      var i = pair.indexOf(':'); if(i > 0) el.setAttribute(pair.slice(0, i).trim(), T(pair.slice(i + 1).trim()));
    });
  });
  [].forEach.call(root.querySelectorAll('[data-help]'), function(el){
    var a = el.getAttribute('data-help');
    el.setAttribute('href', ddHelpPath() + (a ? '#' + a : ''));
  });
  DD_STATIC_SEL.forEach(function(x){
    [].forEach.call(root.querySelectorAll(x[0]), function(el){
      el.textContent = T(x[1]);
      if(x[2] === 'help') el.setAttribute('href', ddHelpPath());
    });
  });
}

/* ---- the EN | BM switch: two buttons in a labelled group, the current one pressed. kind 'row' adds the label
   "Bahasa:" in front (the compact menu's Account section on a narrow phone). The words are the same in both languages. ---- */
function ddSwitchHTML(kind){
  var l = ddUiLang();
  return (kind === 'row' ? '<div class="langsw-row"><span class="langsw-label" lang="ms">Bahasa:</span>' : '') +
    '<div class="langsw" role="group" aria-label="Language / Bahasa">' +
    '<button type="button" lang="en" aria-label="English" data-lang-set="en" aria-pressed="' + (l === 'en') + '">EN</button>' +
    '<button type="button" lang="ms" aria-label="Bahasa Malaysia" data-lang-set="ms" aria-pressed="' + (l === 'ms') + '">BM</button></div>' +
    (kind === 'row' ? '</div>' : '');
}
/* Brings every switch on the page up to date (the elements stay, so the keyboard focus stays on them). */
function ddSyncSwitches(){
  if(typeof document === 'undefined' || !document.querySelectorAll) return;
  var l = ddUiLang();
  [].forEach.call(document.querySelectorAll('.langsw [data-lang-set]'), function(b){ b.setAttribute('aria-pressed', b.getAttribute('data-lang-set') === l ? 'true' : 'false'); });
}
function ddOnLang(fn){ DD_I18N.hooks.push(fn); }
/* Marks every switch busy while the BM tables load (the page stays in its language until they are in). */
function ddBusy(on){
  if(typeof document === 'undefined' || !document.querySelectorAll) return;
  [].forEach.call(document.querySelectorAll('.langsw'), function(g){ if(on) g.setAttribute('aria-busy', 'true'); else g.removeAttribute('aria-busy'); });
}
/* Switches the app's language: saves it, sets <html lang> and the title, redraws (the hooks). Saves nothing else.
   BM not loaded yet: loads it first, the page staying as it is; the switch happens when the tables are in, unless another
   choice was made meanwhile. If they cannot be loaded, nothing changes (and nothing is saved). opts.after(ok): called
   once the switch is done or has failed. */
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
/* Another tab changed the choice: follow it (loading BM first when needed). While a box is open (DD_I18N.hold(), set by
   the app) the change waits until it closes (ddReleaseLang), so a box is never half in one language. */
function ddFollow(l){
  if(!ddValidLang(l)) return;
  if(DD_I18N.hold){ var busy = false; try{ busy = !!DD_I18N.hold(); }catch(e){} if(busy){ DD_I18N.held = l; return; } }
  DD_I18N.held = null;
  if(l === DD_I18N.lang){ DD_I18N.want = null; return; }
  DD_I18N.want = l;
  ddLoadLang(l, function(ok){
    if(!ok || DD_I18N.want !== l) return;
    DD_I18N.want = null;
    DD_I18N.lang = l; ddApplyLang(); ddNoteUpdate();
  });
}
function ddReleaseLang(){ if(DD_I18N.held){ var l = DD_I18N.held; DD_I18N.held = null; ddFollow(l); } }
function ddApplyLang(){
  var l = ddUiLang();
  try{ if(typeof document !== 'undefined' && document.documentElement) document.documentElement.setAttribute('lang', l); }catch(e){}
  try{ if(typeof document !== 'undefined') document.title = T('app.title'); }catch(e){}
  ddApplyStatic();
  ddSyncSwitches();
  DD_I18N.hooks.forEach(function(fn){ try{ fn(l); }catch(e){ try{ console.error(e); }catch(e2){} } });
}

/* ---- the "Bahasa Malaysia tersedia" note: English on screen, nothing saved, a Malay first browser language, not closed ---- */
function ddNoteWanted(nav, saved, closed, lang){
  var n = String((nav && ((nav.languages && nav.languages[0]) || nav.language)) || '');
  return lang === 'en' && !saved && closed !== 'closed' && /^ms/i.test(n);
}
function ddNoteUpdate(){
  if(typeof document === 'undefined' || !document.getElementById) return;
  var bar = document.getElementById('langBar');
  if(!bar) return;
  var closed = null; try{ closed = localStorage.getItem(DD_NOTE_KEY); }catch(e){}
  bar.hidden = !ddNoteWanted(typeof navigator !== 'undefined' ? navigator : null, ddSaved(), closed, ddUiLang());
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
      if(typeof history !== 'undefined' && history.replaceState) history.replaceState(history.state, '', location.pathname + rest + (location.hash || ''));
    }catch(e){}
  }
  try{ if(typeof document !== 'undefined' && document.documentElement && document.documentElement.setAttribute) document.documentElement.setAttribute('lang', ddUiLang()); }catch(e){}
})();

/* Clicks on any switch or the note; another tab changing the choice. Wired once the page is there. */
function ddWire(){
  if(typeof document === 'undefined' || !document.addEventListener) return;
  document.addEventListener('click', function(e){
    var t = e && e.target && e.target.closest ? e.target : null;
    if(!t) return;
    var x = t.closest('[data-langbar-close]');
    if(x){ try{ localStorage.setItem(DD_NOTE_KEY, 'closed'); }catch(err){} var bar = document.getElementById('langBar'); if(bar) bar.hidden = true; return; }
    var b = t.closest('[data-lang-set]');
    if(!b) return;
    if(e.preventDefault) e.preventDefault();
    var l = b.getAttribute('data-lang-set'), group = b.closest('.langsw');
    /* the focus goes back to the pressed button of the same switch (its element may have been redrawn) */
    var after = function(ok){
      var bar2 = document.getElementById('langBar'); if(ok && bar2 && l === 'ms') bar2.hidden = true;
      var back = null;
      if(group && group.isConnected !== false) back = group.querySelector('[aria-pressed="true"]');
      if(!back) back = [].filter.call(document.querySelectorAll('.langsw [aria-pressed="true"]'), function(x){ return x.offsetParent !== null; })[0] || document.querySelector('.langsw [aria-pressed="true"]');   // the visible one (the compact menu was redrawn)
      if(back && back.focus) try{ back.focus({ preventScroll: true }); }catch(err){ back.focus(); }
    };
    if(l !== ddUiLang()) ddSetLang(l, { after: after });
    else { DD_I18N.want = null; after(true); }   // the language on screen: a BM load still under way no longer switches
  });
  if(typeof window !== 'undefined' && window.addEventListener) window.addEventListener('storage', function(e){
    if(e && e.key === DD_LANG_KEY && ddValidLang(e.newValue) && (e.newValue !== DD_I18N.lang || DD_I18N.want)) ddFollow(e.newValue);
  });
}
try{ ddWire(); }catch(e){}

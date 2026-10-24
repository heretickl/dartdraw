/* The sign-in and account pages in English or Bahasa Malaysia (i18n step 5): login.html (also the pop-up on the public
   pages, login.html?embed=1), forgot.html, register.html, reset.html and verify.html. Each page loads, at the end of
   its body and before its own script: i18n/auth.en.js, a small inline script and this file. The inline script
   (data-dd-ms) writes the tags of the BM tables, errors.en.js, auth.ms.js and errors.ms.js (DD_MS_FILES), only when BM is the
   language at start-up, so English visitors never download them; a switch to BM fetches them first (the page stays
   English until both are in, then changes at once; offline or blocked: it stays English and the next switch tries again).
   - The choice: ?lang=ms|en wins, is saved and leaves the address; then localStorage "dartdraw.lang" (the public site
     and the organiser app share this origin, so all three share the choice); otherwise English. Never chosen from the
     browser language (as on the public site). Storage is only touched inside try/catch.
   - The pop-up (login.html?embed=1 inside the public page's dialog) follows the page around it: ?lang= when the BM
     public pages pass it (login.html?embed=1&lang=ms), else the parent page's <html lang>. It shows no switch of its
     own: the dialog's close button sits in the card corner where the switch goes (README, "Sign-in pages").
   - On its own each page has a compact EN | BM switch in the card's top row (two buttons, aria-pressed, lang and
     aria-label on each, the group labelled "Language / Bahasa"). A press changes <html lang>, the title and every
     word at once, with no reload, keeps what was typed, and keeps the focus on the pressed button.
   - Words: static markup carries data-i18n="key" (a few elements whose markup other tests pin are named in BIND).
     The page scripts keep their English texts and go through DDAuth.put(el, english, { code, vars, after }):
     English text -> its key in the English tables -> the current language. A server answer's `code` wins in BM
     (t('err.' + code), filled from the answer's own fields), with the English `error` as the fallback. `after` is
     appended as it is (the Admin's contact line: the Admin's own words, never translated). Everything is set with
     textContent, so no text here or from the server can become markup.
   - Links: in BM the "Sign in" links (/?login=1) go to /ms?login=1, and the links to the other account pages carry
     ?lang=ms, so the next page opens in BM even where storage is blocked. */
(function(){
  var KEY = 'dartdraw.lang';
  var has = function(o, k){ return !!o && Object.prototype.hasOwnProperty.call(o, k); };
  function merge(){ var o = {}; for(var i = 0; i < arguments.length; i++){ var src = arguments[i]; if(src) for(var k in src) if(has(src, k)) o[k] = src[k]; } return o; }
  /* errors.en.js (the server's English error texts) comes with the BM tables: an English page shows the server's own
     text, so only BM needs to find a text's key (REV) */
  function msLoaded(){ return typeof DD_AUTH_MS !== 'undefined' && typeof DD_ERR_MS !== 'undefined' && typeof DD_ERR_EN !== 'undefined'; }
  function msTable(){ return msLoaded() ? merge(DD_AUTH_MS, DD_ERR_MS) : {}; }
  var TABLES = {}, REV = Object.create(null);
  /* the tables, and English text -> key (the first key with that text; tests/auth-i18n.test.js checks equal English texts
     have equal BM) */
  function build(){
    TABLES.en = merge(typeof DD_AUTH_EN !== 'undefined' ? DD_AUTH_EN : null, typeof DD_ERR_EN !== 'undefined' ? DD_ERR_EN : null);
    TABLES.ms = msTable();
    REV = Object.create(null);
    Object.keys(TABLES.en).forEach(function(k){ if(!(TABLES.en[k] in REV)) REV[TABLES.en[k]] = k; });
  }
  build();
  var hasLang = function(l){ return l === 'en' || (l === 'ms' && msLoaded()); };
  /* fetches the BM tables (DD_MS_FILES); done(ok) once both have arrived or one failed (a failed one is asked for again next time) */
  var loading = {}, waiting = [];
  function loadMs(done){
    if(msLoaded()){ if(!has(TABLES.ms, 'auth.signIn')) build(); done(true); return; }
    waiting.push(done);
    var files = typeof DD_MS_FILES !== 'undefined' && DD_MS_FILES ? DD_MS_FILES : [], parent = document.head || document.documentElement;
    var finish = function(){
      for(var f in loading) if(has(loading, f) && loading[f] === 'loading') return;
      var ok = msLoaded(); if(ok) build(); else loading = {};
      var w = waiting; waiting = []; w.forEach(function(fn){ fn(ok); });
    };
    if(!files.length || !parent || !document.createElement){ finish(); return; }
    files.forEach(function(f){
      if(loading[f]) return;
      loading[f] = 'loading';
      var el = document.createElement('script');
      el.async = false;
      el.onload = function(){ loading[f] = 'ok'; finish(); };
      el.onerror = function(){ delete loading[f]; try{ if(el.parentNode) el.parentNode.removeChild(el); }catch(e){} finish(); };
      el.src = f;
      parent.appendChild(el);
    });
  }
  /* elements whose markup other tests pin exactly, so they cannot carry data-i18n */
  var BIND = [
    ['a[href]', 'login.forgot', function(a){ return baseHref(a) === '/forgot.html' && !a.hasAttribute('data-i18n'); }],   // tests/help-site.test.js: <a href="/forgot.html">Forgot password?</a>
    ['#intro', 'register.intro']                     // tests/auth-pages.test.js: <p class="sub" id="intro">
  ];
  /* a link's address as written in the page (apply() rewrites href by language and keeps the original in data-dd-href) */
  function baseHref(a){ var b = a.getAttribute('data-dd-href'); return b == null ? a.getAttribute('href') : b; }

  var valid = function(l){ return l === 'en' || l === 'ms'; };
  function saved(){ try{ var s = localStorage.getItem(KEY); return valid(s) ? s : null; }catch(e){ return null; } }
  function save(l){ try{ localStorage.setItem(KEY, l); }catch(e){} }

  var search = String(location.search || '');
  var embedded = /[?&]embed=1(&|$)/.test(search) && window.top !== window;
  function parentLang(){
    try{ var l = String(window.parent.document.documentElement.getAttribute('lang') || ''); return /^ms/i.test(l) ? 'ms' : /^en/i.test(l) ? 'en' : null; }
    catch(e){ return null; }
  }
  var lang = 'en';
  var m = /[?&]lang=(en|ms)(?=&|$)/.exec(search);
  if(m){
    lang = m[1];
    save(lang);
    var rest = search.replace(/([?&])lang=(en|ms)(&|$)/, function(a, b, c, d){ return d ? b : ''; }).replace(/[?&]$/, '');
    try{ history.replaceState(null, '', location.pathname + rest + String(location.hash || '')); }catch(e){}
  }else{
    lang = (embedded && parentLang()) || saved() || 'en';
  }
  /* BM chosen but its tables did not arrive (offline, blocked): English, the choice kept; the switch tries again */
  if(!hasLang(lang)) lang = 'en';

  function fill(s, vars){
    s = String(s == null ? '' : s);
    return vars ? s.replace(/\{(\w+)\}/g, function(x, k){ return has(vars, k) && vars[k] != null && typeof vars[k] !== 'object' ? String(vars[k]) : x; }) : s;
  }
  function t(key, vars){
    var tab = TABLES[lang] || TABLES.en;
    return fill(has(tab, key) ? tab[key] : has(TABLES.en, key) ? TABLES.en[key] : key, vars);
  }
  /* an English text from a page script (or an older server's English message) in the current language; unknown text as it is */
  function tr(s){ s = String(s == null ? '' : s); return s in REV ? t(REV[s]) : s; }
  function text(s, o){
    o = o || {};
    var out;
    if(o.code && lang !== 'en' && has(TABLES[lang], 'err.' + o.code)) out = t('err.' + o.code, o.vars);
    else out = tr(s);
    if(o.after) out = out ? out + ' ' + String(o.after) : String(o.after);
    return out;
  }
  var kept = [];   // elements whose words came from put(): redrawn from their English source on a switch
  function put(el, s, o){
    if(!el) return;
    el.__ddSrc = { s: s, o: o };
    if(kept.indexOf(el) < 0) kept.push(el);
    el.textContent = text(s, o);
  }

  function each(sel, fn){ var list = document.querySelectorAll(sel); for(var i = 0; i < list.length; i++) fn(list[i]); }
  function linkFor(base){
    if(lang !== 'ms') return base;
    if(/^\/\?/.test(base)) return '/ms' + base.slice(1);                          // /?login=1 -> /ms?login=1
    if(/^\/(login|forgot|register)\.html(\?|#|$)/.test(base)) return base.replace(/^([^?#]*)(\?[^#]*)?/, function(a, p, q){ return p + (q ? q + '&' : '?') + 'lang=ms'; });
    return base;
  }
  function apply(){
    var root = document.documentElement;
    if(root && root.setAttribute) root.setAttribute('lang', lang);
    each('[data-i18n]', function(el){
      if(el.__ddSrc) return;
      var v = t(el.getAttribute('data-i18n'));
      el.textContent = v;
      if(el.tagName === 'TITLE'){ try{ document.title = v; }catch(e){} }
    });
    each('[data-i18n-attr]', function(el){
      String(el.getAttribute('data-i18n-attr')).split(';').forEach(function(pair){
        var p = pair.split(':'); if(p.length === 2) el.setAttribute(p[0].trim(), t(p[1].trim()));
      });
    });
    BIND.forEach(function(b){ each(b[0], function(el){ if(!el.__ddSrc && (!b[2] || b[2](el))) el.textContent = t(b[1]); }); });
    /* "No account yet? Accounts are created by the site admin." (markup pinned by tests/landing-site.test.js): the bold
       question, then the text right after it; the Admin's contact line (span#adminContact) is left as it is */
    var na = document.getElementById('noAccountFoot');
    if(na){
      var b = na.querySelector('b');
      if(b){
        b.textContent = t('login.noAccount');
        var n = b.nextSibling;
        if(n && n.nodeType === 3) n.nodeValue = ' ' + t('login.adminCreates');
      }
    }
    kept.forEach(function(el){ el.textContent = text(el.__ddSrc.s, el.__ddSrc.o); });
    each('a[href]', function(a){
      var base = baseHref(a);
      a.setAttribute('data-dd-href', base);
      a.setAttribute('href', linkFor(base));
    });
    each('[data-lang-set]', function(btn){ btn.setAttribute('aria-pressed', btn.getAttribute('data-lang-set') === lang ? 'true' : 'false'); });
  }
  var want = null;
  /* done(ok): called once the language is on screen, or the BM tables could not be loaded (nothing changed or saved) */
  function setLang(l, done){
    if(!valid(l)) return;
    want = l;
    if(!hasLang(l)){
      each('[data-lang-switch]', function(sw){ sw.setAttribute('aria-busy', 'true'); });
      loadMs(function(ok){
        each('[data-lang-switch]', function(sw){ sw.removeAttribute('aria-busy'); });
        if(want !== l) return;
        if(ok) setLang(l, done); else { want = null; if(done) done(false); }
      });
      return;
    }
    want = null;
    lang = l;
    save(l);
    apply();
    if(done) done(true);
  }

  each('[data-lang-switch]', function(sw){
    if(embedded){ sw.hidden = true; return; }
    sw.hidden = false;
  });
  each('[data-lang-set]', function(btn){
    btn.addEventListener('click', function(){
      var l = btn.getAttribute('data-lang-set');
      if(l === lang){ want = null; if(btn.focus) btn.focus(); return; }   // the language on screen: a BM load under way no longer switches
      setLang(l, function(){ if(btn.focus) btn.focus(); });
    });
  });
  apply();

  window.DDAuth = {
    lang: function(){ return lang; },
    embedded: embedded,
    t: t, text: text, put: put, setLang: setLang
  };
})();

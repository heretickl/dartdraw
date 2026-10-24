const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { parse } = require('./lib/mini-dom');
const { msFiles } = require('./lib/load-app');

// i18n step 5: the sign-in and account pages in EN | BM (i18n/auth.*.js, i18n/errors.*.js, i18n/auth-i18n.js).
// Table parity, no English left in BM, the switch (saved choice, ?lang, the pop-up following its page), the links,
// server codes shown in BM with the English as fallback, and XSS-safe messages. The pages run in node's vm on the small
// DOM in tests/lib/mini-dom.js: the real markup, the real tables and runtime, and (for the flows) the page's own script.
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const PAGES = ['login.html', 'forgot.html', 'register.html', 'reset.html', 'verify.html'];
const RUNTIME = ['i18n/auth.en.js', 'i18n/auth.ms.js', 'i18n/errors.en.js', 'i18n/errors.ms.js', 'i18n/auth-i18n.js'];
const { DD_AUTH_EN } = require('../i18n/auth.en.js');
const { DD_AUTH_MS } = require('../i18n/auth.ms.js');
const { DD_ERR_EN, DD_ERR_ADMIN_ONLY } = require('../i18n/errors.en.js');
const { DD_ERR_MS } = require('../i18n/errors.ms.js');
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const ph = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join(',');
const inlineScript = (h) => h.match(/<script>([\s\S]*?)<\/script>/)[1];
const tick = () => new Promise((r) => setImmediate(r));
const settle = async () => { for (let i = 0; i < 6; i++) await tick(); };

function store(init, throws) {
  const data = Object.assign({}, init);
  if (throws) return { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); } };
}
// Loads a page: its markup, the tables and the runtime; with run: true also the page's own script (fetch stubbed).
function load(file, { search = '', saved, throws, framed = false, parentLang, run = false, fetchImpl, languages } = {}) {
  const doc = parse(read(file));
  doc.documentElement = doc.querySelector('html');
  const calls = { replaceState: [], fetch: [], top: [], own: [] };
  const ls = store(saved ? { 'dartdraw.lang': saved } : {}, throws);
  const ctx = {
    document: doc, localStorage: ls, URLSearchParams, JSON, Promise, console: { warn() {}, log() {} },
    navigator: { languages: languages || ['en-GB'], language: (languages || ['en-GB'])[0] },
    location: { search, hash: '', pathname: '/' + file, origin: 'http://localhost', replace: (u) => calls.own.push(u) },
    history: { replaceState: (a, b, u) => calls.replaceState.push(u) },
    fetch: (url, opts) => { calls.fetch.push(url); return (fetchImpl || (() => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) })))(url, opts); }
  };
  ctx.window = ctx;
  if (framed) {
    const parentDoc = parse('<html lang="' + (parentLang || '') + '"><body></body></html>');
    parentDoc.documentElement = parentDoc.querySelector('html');
    ctx.top = { location: { replace: (u) => calls.top.push(u) } };
    ctx.parent = { document: parentDoc, postMessage() {} };
  } else { ctx.top = ctx; ctx.parent = ctx; }
  vm.createContext(ctx);
  RUNTIME.forEach((f) => vm.runInContext(read(f), ctx, { filename: f }));
  if (run) vm.runInContext(inlineScript(read(file)), ctx, { filename: file });
  return { doc, ctx, calls, store: ls, $: (id) => doc.getElementById(id), I: ctx.DDAuth };
}
// The words a reader sees: the document text without scripts and styles, plus the title and the labels read aloud.
function visible(doc) {
  const out = [];
  (function walk(n) {
    n.childNodes.forEach((c) => {
      if (c.nodeType === 3) out.push(c.nodeValue);
      else if (c.nodeType === 1 && !/^(SCRIPT|STYLE)$/.test(c.tagName) && !c.hasAttribute('hidden')) {
        ['aria-label', 'title', 'placeholder'].forEach((a) => { if (c.hasAttribute(a)) out.push(c.getAttribute(a)); });
        walk(c);
      }
    });
  })(doc);
  return out.join(' ').replace(/\s+/g, ' ');
}
// English words that may stay in BM: the product name, the switch, and the Admin's contact line.
const SAME = new Set(['auth.switch.group', 'auth.switch.en', 'auth.switch.ms']);
const ENGLISH = Object.keys(DD_AUTH_EN).filter((k) => !SAME.has(k)).map((k) => DD_AUTH_EN[k])
  .concat(Object.keys(DD_ERR_MS).map((k) => DD_ERR_EN[k]));

// ---------- tables ----------
test('tables: auth.en and auth.ms have the same keys and {placeholders}, nothing empty, and only the switch words are the same', () => {
  assert.deepEqual(Object.keys(DD_AUTH_MS).sort(), Object.keys(DD_AUTH_EN).sort());
  Object.keys(DD_AUTH_EN).forEach((k) => {
    assert.ok(String(DD_AUTH_EN[k]).trim() && String(DD_AUTH_MS[k]).trim(), k + ' is empty');
    assert.equal(ph(DD_AUTH_MS[k]), ph(DD_AUTH_EN[k]), k);
    if (!SAME.has(k)) assert.notEqual(DD_AUTH_MS[k], DD_AUTH_EN[k], k + ' is not translated');
  });
  assert.equal(Object.keys(DD_AUTH_EN).length >= 47, true, 'about 47 strings on the five pages');
});

test('tables: one English text has one BM text across the page and error tables (the runtime maps English back to its key)', () => {
  const EN = Object.assign({}, DD_AUTH_EN, DD_ERR_EN), MS = Object.assign({}, DD_AUTH_MS, DD_ERR_MS);
  const seen = {};
  Object.keys(EN).forEach((k) => {
    if (!has(MS, k)) return;
    const e = EN[k];
    if (has(seen, e)) assert.equal(MS[k], MS[seen[e]], '"' + e + '" is ' + k + ' and ' + seen[e] + ' with different BM');
    else seen[e] = k;
  });
  assert.ok(DD_ERR_ADMIN_ONLY.length > 20);
});

test('tables: BM follows the glossary (e-mel, kata laluan, log masuk, "anda" lower case) and uses none of the banned words', () => {
  const all = Object.values(DD_AUTH_MS).concat(Object.values(DD_ERR_MS)).join(' \n ');
  assert.doesNotMatch(all, /\b(email|password|surel|kata sandi|unduh|melog|masuk log|kamu|awak)\b/i);
  assert.doesNotMatch(all, /[a-z,] Anda\b/, '"anda" is lower case inside a sentence');
  assert.equal(DD_AUTH_MS['auth.signIn'], 'Log masuk');
  assert.equal(DD_AUTH_MS['login.forgot'], 'Lupa kata laluan?');
  assert.equal(DD_AUTH_MS['login.signUp'], 'Daftar');
  assert.equal(DD_AUTH_MS['login.needAccount'], 'Belum ada akaun?');
  // the public pages say the same "No account yet?" sentence
  const landing = require('../scripts/i18n/ms/landing.js');
  assert.equal(DD_AUTH_MS['login.noAccount'] + ' ' + DD_AUTH_MS['login.adminCreates'], landing.landing.ctaNote);
});

// ---------- the pages ----------
test('every page loads the tables and the runtime before its own script, from this site, and has a hidden switch', () => {
  PAGES.forEach((p) => {
    const h = read(p);
    // the English tables as tags, the BM ones through the data-dd-ms loader (written only when BM is the language)
    const en = '<script src="/i18n/auth.en.js"></script>\n<script data-dd-ms>';
    assert.ok(h.includes(en), p + ' loads the English tables, then the BM loader');
    const loader = h.slice(h.indexOf('<script data-dd-ms>'), h.indexOf('</script>', h.indexOf('<script data-dd-ms>')) + 9);
    assert.ok(h.includes(loader + '\n<script src="/i18n/auth-i18n.js"></script>\n<script>'), p + ': the runtime right before its script');
    assert.deepEqual(msFiles(loader), ['/i18n/errors.en.js', '/i18n/auth.ms.js', '/i18n/errors.ms.js'], p);   // the English error texts only serve BM
    assert.equal(loader, read('login.html').match(/<script data-dd-ms>[\s\S]*?<\/script>/)[0], p + ': the same loader on every page');
    ['auth.ms.js', 'errors.ms.js', 'errors.en.js'].forEach((f) => assert.ok(!h.includes('<script src="/i18n/' + f + '">'), p + ' never loads ' + f + ' for English'));
    assert.match(h, /<div class="langsw" role="group" aria-label="Language \/ Bahasa" data-lang-switch hidden><button type="button" lang="en" aria-label="English" aria-pressed="true" data-lang-set="en">EN<\/button><button type="button" lang="ms" aria-label="Bahasa Malaysia" aria-pressed="false" data-lang-set="ms">BM<\/button><\/div>/, p);
    assert.match(h, /<title data-i18n="[a-z]+\.title">[^<]+ - DartDraw<\/title>/, p);
    assert.match(h, /\.langsw button\{[^}]*min-height:36px/, p + ' buttons at least 36px tall');
  });
});

test('every data-i18n key exists, and the English markup is exactly the English table (the pages read the same without JavaScript)', () => {
  PAGES.forEach((p) => {
    const doc = parse(read(p));
    doc.querySelectorAll('[data-i18n]').forEach((el) => {
      const k = el.getAttribute('data-i18n');
      assert.ok(has(DD_AUTH_EN, k), p + ': ' + k);
      assert.equal(el.textContent, DD_AUTH_EN[k], p + ': ' + k);
    });
  });
});

test('every English text the page scripts show is in the tables (so none stays English in BM)', () => {
  const EN = new Set(Object.values(DD_AUTH_EN).concat(Object.values(DD_ERR_EN)));
  PAGES.forEach((p) => {
    const js = inlineScript(read(p));
    // the texts handed to show / finish / closeForm / I18N.put
    const lits = [...js.matchAll(/(?:show|finish|closeForm|I18N\.put\([a-zA-Z]+,)\s*\(?\s*(?:body\.(?:error|message) \|\| )?'((?:[^'\\]|\\.)+)'/g)].map((m) => m[1]);
    assert.ok(lits.length >= 3, p + ' found ' + lits.length);
    lits.forEach((s) => assert.ok(EN.has(s), p + ': "' + s + '" is not in i18n/auth.en.js or errors.en.js'));
  });
});

test('no English left: each page in BM (?lang=ms) shows only BM words, the title and <html lang> included', () => {
  PAGES.forEach((p) => {
    const r = load(p, { search: '?lang=ms&token=abc' });
    assert.equal(r.doc.documentElement.getAttribute('lang'), 'ms', p);
    const text = visible(r.doc);
    ENGLISH.forEach((e) => assert.ok(!text.includes(e), p + ' still says "' + e + '"'));
    const titleKey = r.doc.querySelector('title').getAttribute('data-i18n');
    assert.equal(r.ctx.document.title, DD_AUTH_MS[titleKey], p);
  });
  const login = load('login.html', { search: '?lang=ms' });
  assert.equal(login.$('noAccountFoot').textContent, 'Belum ada akaun? Akaun dibuka oleh pentadbir laman.');
  assert.equal(login.doc.querySelector('a[data-dd-href="/forgot.html"]').textContent, 'Lupa kata laluan?');
  const reg = load('register.html', { search: '?lang=ms' });
  assert.equal(reg.$('intro').textContent, 'Buka akaun penganjur.');
});

test('English stays English: with no choice every page shows the same words as its markup', () => {
  PAGES.forEach((p) => {
    const before = visible(parse(read(p)));
    const r = load(p);
    r.doc.querySelector('[data-lang-switch]').hidden = true;   // the switch is the one addition (hidden without JavaScript)
    assert.equal(r.doc.documentElement.getAttribute('lang'), 'en');
    assert.equal(visible(r.doc), before, p);
  });
});

// ---------- the choice ----------
test('choice: English by default (also for a Malay browser), the saved choice is used, blocked storage gives English', () => {
  assert.equal(load('login.html').I.lang(), 'en');
  assert.equal(load('login.html', { languages: ['ms-MY', 'ms'] }).I.lang(), 'en', 'never from the browser language');
  assert.equal(load('forgot.html', { saved: 'ms' }).I.lang(), 'ms');
  assert.equal(load('forgot.html', { saved: 'xx' }).I.lang(), 'en');
  assert.equal(load('forgot.html', { throws: true }).I.lang(), 'en');
  assert.equal(load('forgot.html', { throws: true, search: '?lang=ms' }).I.lang(), 'ms', '?lang works without storage');
});

test('choice: ?lang= wins over the saved choice, is saved, and leaves the address (the token stays where it was)', () => {
  const r = load('reset.html', { saved: 'en', search: '?token=abc&lang=ms' });
  assert.equal(r.I.lang(), 'ms');
  assert.equal(r.store.data['dartdraw.lang'], 'ms');
  assert.deepEqual(r.calls.replaceState, ['/reset.html?token=abc']);
  const e = load('verify.html', { saved: 'ms', search: '?lang=en&token=abc' });
  assert.equal(e.I.lang(), 'en');
  assert.deepEqual(e.calls.replaceState, ['/verify.html?token=abc']);
  assert.deepEqual(load('login.html', { search: '?lang=ms' }).calls.replaceState, ['/login.html']);
});

test('switch: a press changes the words, <html lang>, title and pressed state at once, saves, keeps the focus and what was typed', () => {
  const r = load('login.html');
  const sw = r.doc.querySelector('[data-lang-switch]');
  assert.equal(sw.hidden, false, 'shown on its own page');
  r.$('email').value = 'aminah@example.com';
  const bm = r.doc.querySelector('[data-lang-set="ms"]');
  bm.dispatchEvent({ type: 'click', preventDefault() {} });
  assert.equal(r.doc.documentElement.getAttribute('lang'), 'ms');
  assert.equal(r.ctx.document.title, 'Log masuk - DartDraw');
  assert.equal(r.$('submitBtn').textContent, 'Log masuk');
  assert.equal(bm.getAttribute('aria-pressed'), 'true');
  assert.equal(r.doc.querySelector('[data-lang-set="en"]').getAttribute('aria-pressed'), 'false');
  assert.equal(r.doc.activeElement, bm);
  assert.equal(r.store.data['dartdraw.lang'], 'ms');
  assert.equal(r.$('email').value, 'aminah@example.com');
  r.doc.querySelector('[data-lang-set="en"]').dispatchEvent({ type: 'click', preventDefault() {} });
  assert.equal(r.$('submitBtn').textContent, 'Sign in');
  assert.equal(r.doc.querySelector('a[data-dd-href="/forgot.html"]').textContent, 'Forgot password?');
  assert.equal(r.store.data['dartdraw.lang'], 'en');
});

test('links: in BM "Sign in" goes to /ms?login=1 and the account pages carry ?lang=ms; in English they are as written', () => {
  const ms = load('reset.html', { search: '?lang=ms' });
  assert.equal(ms.$('signinLink').getAttribute('href'), '/ms?login=1');
  assert.equal(ms.doc.querySelector('#forgotFoot a').getAttribute('href'), '/forgot.html?lang=ms');
  const login = load('login.html', { saved: 'ms' });
  assert.deepEqual(login.doc.querySelectorAll('a').map((a) => a.getAttribute('href')), ['/forgot.html?lang=ms', '/register.html?lang=ms']);
  login.doc.querySelector('[data-lang-set="en"]').dispatchEvent({ type: 'click' });
  assert.deepEqual(login.doc.querySelectorAll('a').map((a) => a.getAttribute('href')), ['/forgot.html', '/register.html']);
  ['forgot.html', 'register.html', 'verify.html'].forEach((p) => {
    const en = load(p);
    assert.ok(en.doc.querySelectorAll('a').every((a) => a.getAttribute('href') === a.getAttribute('data-dd-href')), p);
  });
});

test('pop-up: no switch of its own; it follows ?lang (BM public pages) or the page around it, and only ?lang is saved', () => {
  const bm = load('login.html', { search: '?embed=1&lang=ms', framed: true, parentLang: 'ms' });
  assert.equal(bm.I.lang(), 'ms');
  assert.equal(bm.doc.querySelector('[data-lang-switch]').hidden, true);
  assert.equal(bm.store.data['dartdraw.lang'], 'ms');
  const follow = load('login.html', { search: '?embed=1', framed: true, parentLang: 'ms', saved: 'en' });
  assert.equal(follow.I.lang(), 'ms', 'the BM page around it wins over a saved English');
  assert.equal(follow.store.data['dartdraw.lang'], 'en', 'following the page saves nothing');
  const en = load('login.html', { search: '?embed=1', framed: true, parentLang: 'en', saved: 'ms' });
  assert.equal(en.I.lang(), 'en');
  const notFramed = load('login.html', { search: '?embed=1' });
  assert.equal(notFramed.doc.querySelector('[data-lang-switch]').hidden, false, 'not in a frame: a normal page');
});

test('the public pages pass their language to the pop-up: BM pages frame login.html?embed=1&lang=ms, English ones stay as before', () => {
  const { render } = require('../scripts/build-landing');
  const out = render();
  Object.keys(out).forEach((p) => {
    const m = out[p].match(/<iframe id="loginFrame"[^>]*data-src="([^"]+)"/);
    assert.ok(m, p);
    assert.equal(m[1], p.startsWith('ms/') ? '/login.html?embed=1&amp;lang=ms' : '/login.html?embed=1', p);
  });
});

// ---------- messages ----------
test('messages: a server code is shown in BM, the English error is the fallback, and English shows the server text as it is', () => {
  const r = load('login.html', { search: '?lang=ms' });
  const el = r.$('msg');
  r.I.put(el, 'Incorrect email or password.', { code: 'bad_credentials' });
  assert.equal(el.textContent, 'E-mel atau kata laluan tidak betul.');
  r.I.put(el, 'Some new server message.', { code: 'brand_new_code' });
  assert.equal(el.textContent, 'Some new server message.', 'unknown code: the English text');
  r.I.put(el, 'Too many attempts. Try again later.');
  assert.equal(el.textContent, 'Terlalu banyak percubaan. Sila cuba lagi kemudian.', 'no code: the English text is still known');
  r.I.put(el, 'Basic accounts allow up to 64 entries per event.', { code: 'entry_limit', vars: { limit: 64, error: 'x' } });
  assert.equal(el.textContent, 'Akaun Asas membenarkan sehingga 64 peserta bagi setiap acara.');
  r.I.put(el, 'Could not create account.', { code: 'request_failed' });
  assert.equal(el.textContent, 'Tidak dapat membuka akaun.', 'Admin-only code: no BM, so the English text (here a known one) is used');
  // a shown message follows the switch
  r.I.put(el, 'Incorrect email or password.', { code: 'bad_credentials' });
  r.I.setLang('en');
  assert.equal(el.textContent, 'Incorrect email or password.');
  r.I.put(el, 'Server says this in English.', { code: 'bad_credentials' });
  assert.equal(el.textContent, 'Server says this in English.', 'English shows the server text byte for byte');
});

test('messages: XSS-safe - values and server text are only ever text; the contact line is appended as the Admin wrote it', () => {
  const evil = '<img src=x onerror=alert(1)>';
  const r = load('register.html', { search: '?lang=ms' });
  const el = r.$('msg');
  r.I.put(el, evil + ' {limit}', { code: 'entry_limit', vars: { limit: evil } });
  assert.equal(el.textContent, 'Akaun Asas membenarkan sehingga ' + evil + ' peserta bagi setiap acara.');
  assert.equal(el.children.length, 0, 'no element was created');
  r.I.put(el, 'Sign-up is not open yet. Accounts are created by the site admin.', { after: evil });
  assert.equal(el.textContent, 'Pendaftaran masih ditutup. Akaun dibuka oleh pentadbir laman. ' + evil);
  r.I.put(el, 'x', { code: 'entry_limit', vars: { limit: { toString() { return '<b>'; } } } });
  assert.equal(el.textContent, 'Akaun Asas membenarkan sehingga {limit} peserta bagi setiap acara.', 'objects are never put in');
  const src = read('i18n/auth-i18n.js');
  assert.doesNotMatch(src, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/);
  PAGES.forEach((p) => assert.doesNotMatch(inlineScript(read(p)), /innerHTML|insertAdjacentHTML|outerHTML|document\.write/, p));
});

// ---------- the flows, with the page's own script ----------
test('flow: BM sign-in - wrong password, rate limit, unverified (with the resend button) and suspended, each in BM', async () => {
  const answers = {
    'wrong@x.co': [401, { code: 'bad_credentials', error: 'Incorrect email or password.' }],
    'locked@x.co': [429, { error: 'Too many attempts. Try again later.' }],          // an older server: no code
    'new@x.co': [403, { code: 'unverified', error: 'Please verify your email first.' }],
    'gone@x.co': [403, { code: 'suspended', error: 'This account has been suspended.' }]
  };
  const fetchImpl = (url, opts) => {
    if (url === '/api/auth/config') return Promise.resolve({ ok: true, json: () => Promise.resolve({ signupOpen: false, adminContact: 'Tanya Aminah.' }) });
    const [status, body] = answers[JSON.parse(opts.body).email];
    return Promise.resolve({ ok: false, status, json: () => Promise.resolve(body) });
  };
  const r = load('login.html', { search: '?lang=ms', run: true, fetchImpl });
  await settle();
  assert.equal(r.$('adminContact').textContent, 'Tanya Aminah.', 'the contact line is the Admin\'s own words');
  const expect = {
    'wrong@x.co': 'E-mel atau kata laluan tidak betul.', 'locked@x.co': 'Terlalu banyak percubaan. Sila cuba lagi kemudian.',
    'new@x.co': 'Sila sahkan e-mel anda dahulu.', 'gone@x.co': 'Akaun ini telah digantung.'
  };
  for (const email of Object.keys(expect)) {
    r.$('email').value = email; r.$('password').value = 'longenough';
    await r.$('loginForm').dispatchEvent({ type: 'submit', preventDefault() {} });
    await settle();
    assert.equal(r.$('msg').textContent, expect[email], email);
    assert.equal(r.$('submitBtn').textContent, 'Log masuk');
  }
  r.$('email').value = 'new@x.co';
  await r.$('loginForm').dispatchEvent({ type: 'submit', preventDefault() {} });
  await settle();
  assert.equal(r.$('resendBox').hidden, false);
  assert.equal(r.$('resendBtn').textContent, 'Hantar semula e-mel pengesahan');
});

test('flow: BM reset - no token, too short, not matching; verify - no token; register - closed with the contact line', async () => {
  const reset = load('reset.html', { search: '?lang=ms', run: true });
  assert.equal(reset.$('msg').textContent, 'Pautan ini tidak sah atau telah tamat tempoh.');
  assert.equal(reset.$('forgotFoot').hidden, false);
  const r2 = load('reset.html', { search: '?lang=ms&token=abc', run: true });
  r2.$('password').value = 'short'; r2.$('confirm').value = 'short';
  await r2.$('resetForm').dispatchEvent({ type: 'submit', preventDefault() {} });
  assert.equal(r2.$('msg').textContent, 'Kata laluan mesti sekurang-kurangnya 8 aksara.');
  r2.$('password').value = 'longenough1'; r2.$('confirm').value = 'longenough2';
  await r2.$('resetForm').dispatchEvent({ type: 'submit', preventDefault() {} });
  assert.equal(r2.$('msg').textContent, 'Kedua-dua kata laluan tidak sepadan.');
  r2.doc.querySelector('[data-lang-set="en"]').dispatchEvent({ type: 'click' });
  assert.equal(r2.$('msg').textContent, 'The two passwords do not match.', 'the message follows a switch');
  const verify = load('verify.html', { search: '?lang=ms', run: true });
  assert.equal(verify.$('msg').textContent, 'Pautan ini tidak sah atau telah tamat tempoh.');
  assert.equal(verify.$('signinLink').getAttribute('href'), '/ms?login=1');
  assert.equal(verify.calls.fetch.length, 0, 'opening the link sends nothing');
  const fetchImpl = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ signupOpen: false, adminContact: 'Ask Sam at the bar.' }) });
  const reg = load('register.html', { search: '?lang=ms', run: true, fetchImpl });
  await settle();
  assert.equal(reg.$('msg').textContent, 'Pendaftaran masih ditutup. Akaun dibuka oleh pentadbir laman. Ask Sam at the bar.');
  assert.equal(reg.$('registerForm').hidden, true);
});

test('flow: BM register and forgot success messages, and a reset link error by code', async () => {
  const ok = (body) => () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
  const reg = load('register.html', { search: '?lang=ms', run: true, fetchImpl: (url) => url === '/api/auth/config'
    ? Promise.resolve({ ok: true, json: () => Promise.resolve({ signupOpen: true }) }) : ok({ ok: true })() });
  await settle();
  reg.$('name').value = 'Aminah'; reg.$('email').value = 'a@x.co'; reg.$('password').value = 'longenough';
  await reg.$('registerForm').dispatchEvent({ type: 'submit', preventDefault() {} });
  await settle();
  assert.equal(reg.$('msg').textContent, 'Semak e-mel anda untuk mengesahkan akaun anda.');
  assert.equal(reg.$('intro').textContent, 'Hampir selesai.');
  const forgot = load('forgot.html', { search: '?lang=ms', run: true, fetchImpl: ok({ ok: true }) });
  forgot.$('email').value = 'a@x.co';
  await forgot.$('forgotForm').dispatchEvent({ type: 'submit', preventDefault() {} });
  await settle();
  assert.equal(forgot.$('msg').textContent, 'Jika akaun wujud untuk e-mel itu, kami telah menghantar pautan untuk menetapkan semula kata laluan anda.');
  const reset = load('reset.html', { search: '?lang=ms&token=abc', run: true, fetchImpl: () => Promise.resolve({ ok: false, status: 400, json: () => Promise.resolve({ code: 'invalid_link', error: 'This link is invalid or has expired.' }) }) });
  reset.$('password').value = 'longenough1'; reset.$('confirm').value = 'longenough1';
  await reset.$('resetForm').dispatchEvent({ type: 'submit', preventDefault() {} });
  await settle();
  assert.equal(reset.$('msg').textContent, 'Pautan ini tidak sah atau telah tamat tempoh.');
  assert.equal(reset.$('forgotFoot').hidden, false);
});

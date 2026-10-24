const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { parse } = require('./lib/mini-dom');
const build = require('../scripts/build-landing');

// The EN | BM switch, by behaviour. The two scripts every public page and both Help pages carry:
//   dd-lang (head): ?lang= wins and is saved; a saved choice sends a root page to its twin with location.replace, only
//                   without a #anchor, except /help -> /ms/help (the organiser app's "?" links); never the browser language.
//   dd-lang-ui (end of body): the other language's link keeps the query and #anchor; a click saves the choice and the
//                   focus comes back to the switch; the "Bahasa Malaysia tersedia" note on English pages.
// They run here against a stubbed browser; storage can be missing or throw, as in a private window.
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const scriptOf = (html, id) => html.match(new RegExp('<script id="' + id + '">([\\s\\S]*?)</script>'))[1];

function store(init, opts = {}) {
  const data = Object.assign({}, init);
  if (opts.throws) return { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, removeItem: (k) => { delete data[k]; } };
}
function runHead(file, { search = '', hash = '', saved, throws, languages } = {}) {
  const calls = { replace: [], replaceState: [] };
  const ls = store(saved ? { 'dartdraw.lang': saved } : {}, { throws });
  const pathname = '/' + file.replace(/(^|\/)index\.html$/, '').replace(/\.html$/, '').replace(/^viewer\//, '');
  const ctx = {
    location: { search, hash, pathname, replace: (u) => calls.replace.push(u) },
    history: { replaceState: (a, b, u) => calls.replaceState.push(u) },
    localStorage: ls, navigator: { languages: languages || ['en-GB'], language: (languages || ['en-GB'])[0] }
  };
  vm.createContext(ctx);
  vm.runInContext(scriptOf(read(file), 'dd-lang'), ctx);
  return { calls, store: ls };
}

test('head: no saved choice, no ?lang: every page stays where the link points, whatever the browser language', () => {
  ['index.html', 'features.html', 'how-it-works.html', 'help.html', 'ms/index.html', 'ms/help.html', 'viewer/help.html', 'viewer/ms/help.html'].forEach((f) => {
    assert.deepEqual(runHead(f).calls.replace, [], f);
    assert.deepEqual(runHead(f, { languages: ['ms-MY', 'en'] }).calls.replace, [], f + ' (a Malay browser is never redirected)');
  });
});

test('head: a saved "ms" sends the English root pages to their /ms twin (query kept), and a saved "en" brings the BM pages back', () => {
  assert.deepEqual(runHead('index.html', { saved: 'ms' }).calls.replace, ['/ms']);
  assert.deepEqual(runHead('index.html', { saved: 'ms', search: '?login=1' }).calls.replace, ['/ms?login=1'], 'the sign-in trigger survives');
  assert.deepEqual(runHead('features.html', { saved: 'ms' }).calls.replace, ['/ms/features']);
  assert.deepEqual(runHead('how-it-works.html', { saved: 'ms' }).calls.replace, ['/ms/how-it-works']);
  assert.deepEqual(runHead('help.html', { saved: 'ms' }).calls.replace, ['/ms/help']);
  assert.deepEqual(runHead('ms/index.html', { saved: 'en' }).calls.replace, ['/']);
  assert.deepEqual(runHead('ms/features.html', { saved: 'en' }).calls.replace, ['/features']);
  assert.deepEqual(runHead('ms/help.html', { saved: 'en', search: '?x=1' }).calls.replace, ['/help?x=1']);
  // the page already in the saved language, or an unknown saved value: nothing happens
  assert.deepEqual(runHead('ms/index.html', { saved: 'ms' }).calls.replace, []);
  assert.deepEqual(runHead('index.html', { saved: 'en' }).calls.replace, []);
  assert.deepEqual(runHead('index.html', { saved: 'fr' }).calls.replace, []);
});

test('head: an address with a #anchor is not redirected (shared links stay put), except the English Help with "ms" saved', () => {
  assert.deepEqual(runHead('features.html', { saved: 'ms', hash: '#moreH' }).calls.replace, []);
  assert.deepEqual(runHead('index.html', { saved: 'ms', hash: '#login' }).calls.replace, []);
  assert.deepEqual(runHead('ms/help.html', { saved: 'en', hash: '#faq-phone' }).calls.replace, [], 'BM Help with an anchor stays BM');
  // the organiser app's "?" links open /help#anchor in a new tab: with BM saved they land on the same anchor in BM
  assert.deepEqual(runHead('help.html', { saved: 'ms', hash: '#draw-the-groups' }).calls.replace, ['/ms/help#draw-the-groups']);
  assert.deepEqual(runHead('help.html', { saved: 'ms', hash: '#quick-start-step-3', search: '?from=app' }).calls.replace, ['/ms/help?from=app#quick-start-step-3']);
  // the spectator Help works the same on its own site: the event page's Help links keep ?from= and the anchor
  assert.deepEqual(runHead('viewer/help.html', { saved: 'ms', search: '?from=chrsopensing1', hash: '#q-when-where' }).calls.replace, ['/ms/help?from=chrsopensing1#q-when-where']);
  assert.deepEqual(runHead('viewer/ms/help.html', { saved: 'en', hash: '#q-ties' }).calls.replace, []);
});

test('head: ?lang=ms|en on any page sets the choice and goes to that language, dropping only the lang parameter', () => {
  let r = runHead('features.html', { search: '?lang=ms' });
  assert.equal(r.store.data['dartdraw.lang'], 'ms'); assert.deepEqual(r.calls.replace, ['/ms/features']);
  r = runHead('help.html', { search: '?lang=ms&from=abc', hash: '#faq-phone' });
  assert.deepEqual(r.calls.replace, ['/ms/help?from=abc#faq-phone']);
  r = runHead('index.html', { search: '?a=1&lang=ms&b=2' });
  assert.deepEqual(r.calls.replace, ['/ms?a=1&b=2']);
  // the parameter wins over a saved choice, and on the matching page it only tidies the address
  r = runHead('index.html', { search: '?lang=en', saved: 'ms' });
  assert.equal(r.store.data['dartdraw.lang'], 'en'); assert.deepEqual(r.calls.replace, []); assert.deepEqual(r.calls.replaceState, ['/']);
  r = runHead('ms/help.html', { search: '?from=x&lang=ms', hash: '#glossary' });
  assert.deepEqual(r.calls.replace, []); assert.deepEqual(r.calls.replaceState, ['/ms/help?from=x#glossary']);
  r = runHead('viewer/ms/help.html', { search: '?lang=en' });
  assert.deepEqual(r.calls.replace, ['/help']);
  // anything else is not a language: ignored
  assert.deepEqual(runHead('index.html', { search: '?lang=fr' }).calls.replace, []);
  assert.deepEqual(runHead('index.html', { search: '?language=ms' }).calls.replace, []);
});

test('head: with storage blocked nothing breaks: ?lang still navigates, nothing else happens', () => {
  assert.deepEqual(runHead('index.html', { throws: true }).calls.replace, []);
  assert.deepEqual(runHead('help.html', { throws: true, hash: '#x' }).calls.replace, []);
  assert.deepEqual(runHead('features.html', { throws: true, search: '?lang=ms' }).calls.replace, ['/ms/features']);
});

// ---------- the end-of-body script on the real page markup ----------
function runUi(file, { search = '', hash = '', saved, note, focusFlag, throws, languages = ['en-GB'] } = {}) {
  const html = read(file);
  const doc = parse(html.replace(/<script[\s\S]*?<\/script>/g, ''));
  const init = {}; if (saved) init['dartdraw.lang'] = saved; if (note) init['dartdraw.lang.note'] = note;
  const ls = store(init, { throws }), ss = store(focusFlag ? { 'dartdraw.lang.focus': '1' } : {}, { throws });
  const winL = {};
  const ctx = {
    document: doc, location: { search, hash }, localStorage: ls, sessionStorage: ss, navigator: { languages, language: languages[0] },
    window: { addEventListener: (t, fn) => { (winL[t] = winL[t] || []).push(fn); } }
  };
  vm.createContext(ctx);
  vm.runInContext(scriptOf(html, 'dd-lang-ui'), ctx);
  const link = (l) => doc.querySelector('.langsw [data-lang-set="' + l + '"]');
  const click = (el) => { const ev = { type: 'click', target: el, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } }; el.dispatchEvent(ev); return ev; };
  return { doc, ctx, ls, ss, link, click, fire: (t) => (winL[t] || []).forEach((fn) => fn({ type: t })), bar: doc.getElementById('langBar') };
}

test('ui: the other language link keeps the query (without ?lang) and the #anchor, and follows the anchor as it changes', () => {
  let u = runUi('help.html', { search: '?from=app&lang=en', hash: '#faq-phone' });
  assert.equal(u.link('ms').getAttribute('href'), '/ms/help?from=app#faq-phone');
  assert.equal(u.link('en').getAttribute('href'), '/help', 'the current language link is left alone');
  u.ctx.location.hash = '#glossary'; u.fire('hashchange');
  assert.equal(u.link('ms').getAttribute('href'), '/ms/help?from=app#glossary');
  u = runUi('ms/features.html');
  assert.equal(u.link('en').getAttribute('href'), '/features');
  u = runUi('viewer/ms/help.html', { search: '?from=chrsopensing1', hash: '#q-ties' });
  assert.equal(u.link('en').getAttribute('href'), '/help?from=chrsopensing1#q-ties');
  // without JavaScript the plain links already point at the twin page
  assert.match(read('index.html'), /<a href="\/ms" lang="ms" hreflang="ms" aria-label="Bahasa Malaysia" data-lang-set="ms">BM<\/a>/);
});

test('ui: a click saves the choice and marks the focus to come back to the switch; the current language does not reload', () => {
  const u = runUi('features.html');
  const ev = u.click(u.link('ms'));
  assert.equal(u.ls.data['dartdraw.lang'], 'ms'); assert.equal(u.ss.data['dartdraw.lang.focus'], '1'); assert.equal(ev.defaultPrevented, false, 'the link is followed');
  const cur = u.click(u.link('en'));
  assert.equal(u.ls.data['dartdraw.lang'], 'en'); assert.equal(cur.defaultPrevented, true);
  // on the page the click led to, the focus goes to the pressed language and the flag is used up
  const next = runUi('ms/features.html', { focusFlag: true });
  assert.equal(next.doc.activeElement, next.link('ms')); assert.equal(next.ss.data['dartdraw.lang.focus'], undefined);
  assert.equal(runUi('ms/features.html').doc.activeElement, null, 'no focus move on an ordinary visit');
  // storage blocked: the click still works as a link
  const b = runUi('features.html', { throws: true });
  assert.equal(b.click(b.link('ms')).defaultPrevented, false);
});

test('ui: the "Bahasa Malaysia tersedia" note shows only on English pages, with nothing saved and a Malay first language, until closed', () => {
  assert.equal(runUi('index.html', { languages: ['ms-MY', 'en'] }).bar.hidden, false);
  assert.equal(runUi('help.html', { languages: ['ms'] }).bar.hidden, false);
  assert.equal(runUi('viewer/help.html', { languages: ['ms-MY'] }).bar.hidden, false);
  assert.equal(runUi('index.html', { languages: ['en-MY', 'ms'] }).bar.hidden, true, 'only the first language counts');
  assert.equal(runUi('index.html', { languages: ['ms-MY'], saved: 'en' }).bar.hidden, true, 'a saved choice is respected');
  assert.equal(runUi('index.html', { languages: ['ms-MY'], note: 'closed' }).bar.hidden, true, 'closed before');
  assert.equal(runUi('ms/index.html', { languages: ['ms-MY'] }).bar, null, 'BM pages have no note');
  const u = runUi('features.html', { languages: ['ms-MY'] });
  const x = u.bar.querySelector('[data-langbar-close]');
  x.dispatchEvent({ type: 'click', target: x });
  assert.equal(u.bar.hidden, true); assert.equal(u.ls.data['dartdraw.lang.note'], 'closed');
  // its link is the twin page in BM, saves the choice like the switch, and says what it does in English too
  const a = u.bar.querySelector('a');
  assert.equal(a.getAttribute('href'), '/ms/features'); assert.equal(a.getAttribute('title'), 'Switch to Bahasa Malaysia');
  assert.match(a.textContent, /Tukar ke BM \(Switch to Bahasa Malaysia\)/);
  u.click(a); assert.equal(u.ls.data['dartdraw.lang'], 'ms');
  assert.equal(runUi('index.html', { languages: ['ms-MY'], throws: true }).bar.hidden, false, 'works without storage');
});

test('the viewer\'s own pages open the Help in the saved language: /ms/help when BM was chosen, /help otherwise', () => {
  const { loadViewer, loadHome } = require('./lib/load-viewer');
  const v = loadViewer();
  assert.equal(vm.runInContext('helpHref("q-when-where")', v), '/help?from=testslug12#q-when-where');
  v.localStorage.getItem = (k) => (k === 'dartdraw.lang' ? 'ms' : null);
  assert.equal(vm.runInContext('helpHref("q-when-where")', v), '/ms/help?from=testslug12#q-when-where');
  assert.equal(vm.runInContext('helpHref("")', v), '/ms/help?from=testslug12');
  const h = loadHome();
  assert.equal(vm.runInContext('hmLangHref("/help#glossary")', h), '/help#glossary');
  h.localStorage.getItem = () => 'ms';
  assert.equal(vm.runInContext('hmLangHref("/help#glossary")', h), '/ms/help#glossary');
  assert.equal(vm.runInContext('hmLangHref("/helpdesk")', h), '/helpdesk', 'only the Help address');
  assert.equal(vm.runInContext('hmLangHref("/live/abc")', h), '/live/abc');
  h.localStorage.getItem = () => { throw new Error('blocked'); };
  assert.equal(vm.runInContext('hmLangHref("/help")', h), '/help');
  // and the home page rewrites its Help links after drawing them
  const links = [{ href: '/help', getAttribute() { return this.href; }, setAttribute(k, x) { this.href = x; } }, { href: '/help#glossary', getAttribute() { return this.href; }, setAttribute(k, x) { this.href = x; } }];
  h.localStorage.getItem = () => 'ms';
  h.__root = { querySelectorAll: () => links };
  vm.runInContext('hmLangHelpLinks(__root)', h);
  assert.deepEqual(links.map((l) => l.href), ['/ms/help', '/ms/help#glossary']);
  assert.match(read('viewer/home.js'), /document\.body\.insertBefore\(root, document\.body\.firstChild\);\n  hmLangHelpLinks\(root\);/);
});

test('the scripts the generator writes are the ones on the pages (one behaviour everywhere)', () => {
  const R = build.ROUTES;
  ['landing', 'features', 'how', 'help'].forEach((k) => {
    ['en', 'ms'].forEach((l) => {
      const f = build.FILES[l][k], twin = R[l === 'en' ? 'ms' : 'en'][k];
      assert.equal('<script id="dd-lang">' + scriptOf(read(f), 'dd-lang') + '</script>', build.langHead({ lang: l, key: k, twin }).trim(), f);
      assert.equal('<script id="dd-lang-ui">' + scriptOf(read(f), 'dd-lang-ui') + '</script>', build.langUi({}).trim(), f);
    });
  });
});

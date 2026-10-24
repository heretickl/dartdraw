const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { run, msFiles, stubDocument } = require('./lib/load-app');
const { makeApp, buildStates } = require('./lib/app-screens');
const { loadViewer, runViewer, memoryStore } = require('./lib/load-viewer');
const { parse } = require('./lib/mini-dom');

// Page weight: English visitors never download the Bahasa Malaysia tables. Each page (the organiser app, the viewer
// page, the five sign-in pages) names its BM files in a small inline script (data-dd-ms, DD_MS_FILES) that writes their
// <script> tags only when BM is the language at start-up (?lang=ms, else the saved choice; the sign-in pop-up also
// follows the page around it). On a switch to BM the runtime fetches them (ddLoadLang): the page stays English until all
// are in, then changes at once; a file that fails leaves the page English, saves nothing, and the next switch asks again.
// The other tests load both languages (tests/lib/load-app.js, load-viewer.js), as the pages did before.
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const loaderOf = (html) => html.match(/<script data-dd-ms>([\s\S]*?)<\/script>/)[1];

// ---------- the inline loader on every page ----------
function runLoader(file, { search = '', saved = null, embed = false, parentLang = '', throws = false } = {}) {
  const written = [];
  const ctx = {
    location: { search }, document: { write: (s) => written.push(s) },
    localStorage: { getItem: (k) => { if (throws) throw new Error('blocked'); return k === 'dartdraw.lang' ? saved : null; } },
  };
  ctx.window = ctx;
  if (embed) { ctx.top = {}; ctx.parent = { document: { documentElement: { getAttribute: () => parentLang } } }; } else { ctx.top = ctx; ctx.parent = ctx; }
  vm.createContext(ctx);
  vm.runInContext(loaderOf(read(file)), ctx);
  return { written, files: ctx.DD_MS_FILES };
}
const PAGES = { 'app.html': ['i18n/render.ms.js', 'i18n/app.ms.js', 'i18n/print.ms.js', 'i18n/errors.ms.js'],
  'viewer/index.html': ['/i18n/render.ms.js', '/i18n/ms.js'] };
['login.html', 'forgot.html', 'register.html', 'reset.html', 'verify.html'].forEach((p) => { PAGES[p] = ['/i18n/errors.en.js', '/i18n/auth.ms.js', '/i18n/errors.ms.js']; });

test('loader: an English start writes no BM script; BM (?lang=ms or saved) writes every BM table, in order, before the runtime', () => {
  Object.keys(PAGES).forEach((p) => {
    const html = read(p), want = PAGES[p].map((f) => '<script src="' + f + '"></script>');
    assert.deepEqual(msFiles(loaderOf(html)), PAGES[p], p);
    PAGES[p].forEach((f) => assert.ok(!html.includes('<script src="' + f + '">'), p + ' has no plain tag for ' + f));
    assert.deepEqual(runLoader(p).written, [], p + ': nothing saved');
    assert.deepEqual(runLoader(p, { saved: 'en' }).written, [], p + ': English saved');
    assert.deepEqual(runLoader(p, { saved: 'ms' }).written, want, p + ': BM saved');
    assert.deepEqual(runLoader(p, { search: '?lang=ms' }).written, want, p + ': ?lang=ms');
    assert.deepEqual(runLoader(p, { search: '?a=1&lang=ms', saved: 'en' }).written, want, p + ': ?lang=ms wins');
    assert.deepEqual(runLoader(p, { search: '?lang=en', saved: 'ms' }).written, [], p + ': ?lang=en wins');
    assert.deepEqual(runLoader(p, { search: '?lang=MS' }).written, [], p + ': exact case only, as the runtime');
    assert.deepEqual(runLoader(p, { saved: 'xx' }).written, [], p);
    assert.deepEqual(runLoader(p, { throws: true }).written, [], p + ': blocked storage: English, no error');
    // the loader sits after the English tables and right before the runtime
    const at = html.indexOf('</script>', html.indexOf('<script data-dd-ms>')), rt = html.indexOf('<script', at);
    assert.match(html.slice(rt, rt + 60), /i18n\/(app-i18n|i18n|auth-i18n)\.js/, p);
  });
  // the sign-in pop-up follows the page around it, as auth-i18n.js does (an English page wins over a saved BM)
  assert.equal(runLoader('login.html', { search: '?embed=1', embed: true, parentLang: 'ms' }).written.length, 3);
  assert.equal(runLoader('login.html', { search: '?embed=1', embed: true, parentLang: 'en', saved: 'ms' }).written.length, 0);
  assert.equal(runLoader('login.html', { search: '?embed=1', embed: true, parentLang: '', saved: 'ms' }).written.length, 3);
  assert.equal(runLoader('login.html', { search: '?embed=1&lang=ms', embed: true, parentLang: 'en' }).written.length, 3);
});

// ---------- the organiser app ----------
// The app as an English browser has it (no BM tables), with a document that records the script tags it adds.
function lazyApp(lang) {
  const a = makeApp(lang, undefined, { ms: false });
  const added = [];
  const make = a.doc.createElement;
  a.doc.createElement = (t) => (t === 'script' ? { tagName: 'SCRIPT' } : make(t));
  a.doc.head = { appendChild: (el) => { added.push(el); el.parentNode = a.doc.head; }, removeChild: (el) => { el.parentNode = null; } };
  const toasts = [];
  a.app.showInfoToast = (m) => toasts.push(m);
  return Object.assign(a, { added, toasts });
}
// one requested file arrives (it runs, then its onload fires) or fails
const arrive = (ctx, el, base) => { vm.runInContext(fs.readFileSync(path.join(base || ROOT, el.src.replace(/^\//, '')), 'utf8'), ctx, { filename: el.src }); el.onload(); };
const saved = (app) => run(app, "localStorage.getItem('dartdraw.lang')");

test('app: an English page has no BM table; a switch to BM fetches all four, stays English until the last arrives, then switches at once', () => {
  const { app, doc, added } = lazyApp('en');
  assert.equal(run(app, 'ddHasLang("ms")'), false);
  assert.equal(run(app, 'Object.keys(DD_TABLES.ms).length'), 0);
  const st = buildStates().find((s) => s.id === 'Singles/rrknockout/live');
  app.__t = JSON.parse(JSON.stringify(st.data));
  run(app, 'state = __t; tournamentsCache = {}; tournamentsCache[state.id] = state; currentStage = 5; render();');
  const before = JSON.stringify(run(app, 'state'));
  let persisted = 0; app.persist = () => { persisted++; };
  assert.equal(added.length, 0, 'nothing fetched for an English event');
  run(app, "ddSetLang('ms')");
  assert.deepEqual(added.map((s) => s.src), PAGES['app.html']);
  assert.ok(added.every((s) => s.async === false));
  arrive(app, added[0]); arrive(app, added[1]); arrive(app, added[2]);
  assert.equal(run(app, 'ddUiLang()'), 'en', 'still English while a table is missing');
  assert.equal(doc.getElementById('pageTitle').textContent, 'Manage Tournament');
  assert.equal(saved(app), 'en', 'nothing saved yet');
  arrive(app, added[3]);
  assert.equal(run(app, 'ddUiLang()'), 'ms');
  assert.equal(doc.getElementById('pageTitle').textContent, 'Urus Kejohanan');
  assert.equal(doc.documentElement.getAttribute('lang'), 'ms');
  assert.equal(saved(app), 'ms');
  assert.equal(persisted, 0, 'no save'); assert.equal(run(app, 'savePending'), false, 'nothing marked unsaved');
  assert.equal(JSON.stringify(run(app, 'state')), before, 'the event is not changed');
  // back to English and BM again: nothing more to fetch
  run(app, "ddSetLang('en')"); run(app, "ddSetLang('ms')");
  assert.equal(added.length, 4); assert.equal(run(app, 'ddUiLang()'), 'ms');
});

test('app: a BM file that does not arrive leaves the page English with nothing saved; the next switch asks again and works', () => {
  const { app, doc, added } = lazyApp('en');
  run(app, "ddSetLang('ms')");
  arrive(app, added[0]); added[1].onerror(); arrive(app, added[2]); arrive(app, added[3]);
  assert.equal(run(app, 'ddUiLang()'), 'en'); assert.equal(saved(app), 'en');
  assert.equal(added[1].parentNode, null, 'the failed tag is taken off the page');
  assert.equal(run(app, "T('stage.5')"), 'Manage Tournament');
  run(app, "ddSetLang('ms')");
  assert.equal(added.length, 8, 'asked again');
  added.slice(4).forEach((s) => arrive(app, s));
  assert.equal(run(app, 'ddUiLang()'), 'ms'); assert.equal(saved(app), 'ms');
  assert.equal(run(app, "T('stage.5')"), 'Urus Kejohanan');
  void doc;
});

test('app: EN pressed while BM is still loading keeps English; a saved BM whose tables are missing starts in English', () => {
  const a = lazyApp('en');
  run(a.app, "ddSetLang('ms')");
  run(a.app, "ddSetLang('en')");   // the switch's EN button (also: clicking the language on screen clears the wait)
  a.added.forEach((s) => arrive(a.app, s));
  assert.equal(run(a.app, 'ddUiLang()'), 'en'); assert.equal(saved(a.app), 'en');
  assert.equal(run(a.app, 'ddHasLang("ms")'), true, 'the tables are in for next time');
  const b = lazyApp('ms');
  assert.equal(run(b.app, 'ddUiLang()'), 'en', 'offline or blocked BM file: English');
  assert.equal(saved(b.app), 'ms', 'the choice is kept');
});

test('app: an event printed in BM on an English page fetches the BM words; until they are in, Print waits (a note, no print, no save)', () => {
  const { app, added, toasts } = lazyApp('en');
  const st = buildStates().find((s) => s.id === 'Singles/rrknockout/drawn');
  app.__t = JSON.parse(JSON.stringify(st.data)); app.__t.printSettings.sheetLang = 'ms';
  let persisted = 0; app.persist = () => { persisted++; };
  run(app, 'state = __t; tournamentsCache = {}; tournamentsCache[state.id] = state; currentStage = 4; render();');
  assert.deepEqual(added.map((s) => s.src), PAGES['app.html'], 'render() asked for the BM words');
  assert.equal(run(app, 'sheetsLangReady()'), false);
  assert.equal(toasts.at(-1), run(app, "T('pr.set.wait')"));
  run(app, 'runPrintPack(true)');
  assert.equal(run(app, '!!state.printedPack'), false, 'nothing printed'); assert.equal(persisted, 0, 'nothing saved');
  added.forEach((s) => arrive(app, s));
  assert.equal(run(app, 'ddUiLang()'), 'en', 'the screen stays English');
  assert.equal(run(app, 'sheetsLangReady()'), true);
  assert.equal(run(app, "ddWithLang(ddPrintLang(), function(){ return T('pr.set.label'); })"), 'Bahasa helaian bercetak');
  // the automatic names are known in BM even before the BM tables arrive
  const c = lazyApp('en');
  c.app.__g = { label: 'A', entryIds: ['e1'] };
  run(c.app, "state = { eventCreation: { competitionUnit: 'Singles' }, entriesList: [{ id: 'e1', name: 'Pemain A1', autoName: true }], groups: [__g] }; applyAutoNames(state)");
  assert.equal(run(c.app, 'state.entriesList[0].name'), 'Pemain A1', 'kept, as with the tables loaded');
  assert.deepEqual(Object.keys(run(c.app, 'DD_AUTONAME_MS')).map((k) => [k, run(c.app, 'DD_AUTONAME_MS')[k]]),
    Object.keys(run(c.app, 'DD_AUTONAME_MS')).map((k) => [k, require('../i18n/app.ms.js')[k]]), 'the same words as app.ms.js');
  assert.deepEqual(Object.keys(require('../i18n/app.en.js')).filter((k) => /^autoName\./.test(k)).sort(), Object.keys(run(c.app, 'DD_AUTONAME_MS')).sort());
});

test('app: a language changed in another tab waits while a box is open, then follows when it closes (a box is never half in one language)', () => {
  const { app, doc } = makeApp('en');
  let open = true;
  run(app, 'DD_I18N').hold = () => open;
  run(app, "ddFollow('ms')");
  assert.equal(run(app, 'ddUiLang()'), 'en', 'the box stays as drawn');
  open = false;
  run(app, 'closeModal()');
  assert.equal(run(app, 'ddUiLang()'), 'ms');
  assert.equal(doc.documentElement.getAttribute('lang'), 'ms');
  // the app's own hold: the box backdrop is shown
  assert.match(read('app.html'), /DD_I18N\.hold = \(\)=>\{ const b = document\.getElementById\('modalBackdrop'\);[^\n]*classList\.contains\('show'\)/);
  assert.match(read('app.html'), /function closeModal\(\)\{ document\.getElementById\('modalBackdrop'\)\.classList\.remove\('show'\); ddReleaseLang\(\); \}/);
});

// ---------- the viewer ----------
test('viewer: an English page has no BM table; a switch fetches both, stays English until both are in, and a failure retries', () => {
  const added = [];
  const head = { appendChild: (el) => { added.push(el); el.parentNode = head; }, removeChild: (el) => { el.parentNode = null; } };
  const document = new Proxy(stubDocument, { get: (t, k) => (k === 'head' ? head : k === 'createElement' ? (tag) => (tag === 'script' ? { tagName: 'SCRIPT' } : t.createElement(tag)) : t[k]) });
  const store = memoryStore({});
  const v = loadViewer({ ms: false, document });
  v.localStorage = store;
  assert.equal(runViewer(v, 'ddHasLang("ms")'), false);
  runViewer(v, "ddSetLang('ms')");
  assert.deepEqual(added.map((s) => s.src), PAGES['viewer/index.html']);
  const VIEWER = path.join(ROOT, 'viewer');
  added[0].onerror(); arrive(v, added[1], VIEWER);
  assert.equal(runViewer(v, 'ddLang()'), 'en'); assert.equal(store.data['dartdraw.lang'], undefined, 'nothing saved');
  runViewer(v, "ddSetLang('ms')");
  assert.deepEqual(added.slice(2).map((s) => s.src), PAGES['viewer/index.html'], 'asked again');
  arrive(v, added[2], VIEWER);
  assert.equal(runViewer(v, 'ddLang()'), 'en');
  arrive(v, added[3], VIEWER);
  assert.equal(runViewer(v, 'ddLang()'), 'ms'); assert.equal(store.data['dartdraw.lang'], 'ms');
  assert.equal(runViewer(v, "T('page.title')"), 'Keputusan langsung');
  // a saved BM with the tables missing (offline): English
  const w = loadViewer({ ms: false, lang: 'ms' });
  assert.equal(runViewer(w, 'ddLang()'), 'en');
  // with the tables (as the loader writes them for BM): BM at once
  assert.equal(runViewer(loadViewer({ lang: 'ms' }), 'ddLang()'), 'ms');
});

// ---------- the sign-in pages ----------
function authPage(file, { search = '', saved: s } = {}) {
  const doc = parse(read(file));
  doc.documentElement = doc.querySelector('html');
  const data = s ? { 'dartdraw.lang': s } : {};
  const ctx = {
    document: doc, JSON, console: { warn() {}, log() {} }, URLSearchParams,
    localStorage: { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); } },
    location: { search, hash: '', pathname: '/' + file }, history: { replaceState() {} }, navigator: { languages: ['en-GB'] },
  };
  ctx.window = ctx; ctx.top = ctx; ctx.parent = ctx;
  vm.createContext(ctx);
  ['i18n/auth.en.js'].forEach((f) => vm.runInContext(read(f), ctx, { filename: f }));
  vm.runInContext(loaderOf(read(file)), ctx);   // no document.write here: like a browser that got no BM file
  vm.runInContext(read('i18n/auth-i18n.js'), ctx, { filename: 'auth-i18n.js' });
  const added = () => doc.documentElement.childNodes.filter((n) => n.tagName === 'SCRIPT' && n.src);
  return { doc, ctx, data, added };
}
test('sign-in pages: English has no BM table; BM is fetched on the switch, the page changing at once when all three are in', () => {
  ['login.html', 'register.html'].forEach((file) => {
    const p = authPage(file);
    const bm = p.doc.querySelector('[data-lang-set="ms"]');
    const title = p.doc.title || p.doc.querySelector('title').textContent;
    bm.dispatchEvent({ type: 'click', preventDefault() {} });
    const req = p.added();
    assert.deepEqual(req.map((s) => s.src), PAGES[file], file);
    req.slice(0, 2).forEach((s) => arrive(p.ctx, s));
    assert.equal(p.doc.documentElement.getAttribute('lang'), 'en', file + ': English until the last file');
    assert.equal(p.data['dartdraw.lang'], undefined);
    arrive(p.ctx, req[2]);
    assert.equal(p.doc.documentElement.getAttribute('lang'), 'ms', file);
    assert.equal(p.data['dartdraw.lang'], 'ms');
    assert.notEqual(p.doc.querySelector('title').textContent, title, file + ': the title is BM');
    assert.equal(bm.getAttribute('aria-pressed'), 'true');
    // a server's English error text is found again in BM (errors.en.js came with the BM tables)
    assert.equal(p.ctx.DDAuth.text('Too many attempts. Try again later.'), require('../i18n/errors.ms.js').DD_ERR_MS['err.rate_limited']);
  });
  // a failed file: English, nothing saved; the next press asks again
  const f = authPage('login.html');
  const bm = f.doc.querySelector('[data-lang-set="ms"]');
  bm.dispatchEvent({ type: 'click', preventDefault() {} });
  const first = f.added(); first[0].onerror(); arrive(f.ctx, first[1]); arrive(f.ctx, first[2]);
  assert.equal(f.doc.documentElement.getAttribute('lang'), 'en'); assert.equal(f.data['dartdraw.lang'], undefined);
  bm.dispatchEvent({ type: 'click', preventDefault() {} });
  const again = f.added().filter((s) => !first.includes(s));
  assert.equal(again.length, 3, 'asked again');
  again.forEach((s) => arrive(f.ctx, s));
  assert.equal(f.doc.documentElement.getAttribute('lang'), 'ms');
  // ?lang=ms whose files did not arrive: English, the choice saved for when they do
  const g = authPage('login.html', { search: '?lang=ms' });
  assert.equal(g.doc.documentElement.getAttribute('lang'), 'en'); assert.equal(g.data['dartdraw.lang'], 'ms');
});

// Loads the public viewer page (the scripts viewer/index.html names, in its order: render.js, the language tables and
// i18n.js, home.js, then its inline scripts) into a Node vm context with a stubbed browser. fetch never resolves, so
// nothing loads on its own; tests set `state`. opts.lang ('en' | 'ms'): the saved language choice the page starts with.
const fs = require('fs'), vm = require('vm'), path = require('path');
const { ROOT, stubDocument, seededMath, msFiles } = require('./load-app');

const VIEWER = path.join(ROOT, 'viewer');
// The local scripts a viewer page loads, in order: '/render.js' -> viewer/render.js. The BM tables: index.html's
// data-dd-ms script writes their tags only when BM is the language (DD_MS_FILES); here they follow it in both languages,
// as the page had them before, unless opts.ms === false (an English browser, before ddLoadLang fetches them).
function pageScripts(html, opts) {
  const out = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    const src = /\bsrc="([^"]+)"/.exec(m[1]);
    if (src) { out.push({ file: path.join(VIEWER, src[1].replace(/^\//, '')), name: 'viewer' + src[1] }); continue; }
    out.push({ code: m[2] });
    if (/\bdata-dd-ms\b/.test(m[1]) && !(opts && opts.ms === false)) msFiles(m[2]).forEach((f) => out.push({ file: path.join(VIEWER, f.replace(/^\//, '')), name: 'viewer' + f }));
  }
  return out;
}
function memoryStore(init) {
  const data = Object.assign({}, init);
  return { data, getItem: (k) => (Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, removeItem: (k) => { delete data[k]; } };
}

function loadViewer(opts) {
  opts = opts || {};
  const html = fs.readFileSync(path.join(VIEWER, 'index.html'), 'utf8');
  const ctx = {
    console, Math: seededMath(1), JSON, Date: opts.Date || Date, Array, Object, String, Number, Set, Map, Intl, URLSearchParams,
    parseInt, parseFloat, isNaN, setTimeout: () => 0, clearTimeout: () => {},
    document: opts.document || stubDocument,
    window: { matchMedia: () => ({ matches: opts.narrow !== false }), addEventListener() {}, scrollTo() {} },
    localStorage: opts.lang ? memoryStore({ 'dartdraw.lang': opts.lang }) : { getItem: () => null, setItem() {}, removeItem() {} },
    location: { search: opts.search || '', pathname: '/live/testslug12', hash: '' }, history: { length: 1, replaceState() {} },
    navigator: { languages: ['en-GB'], language: 'en-GB' },
    fetch: () => new Promise(() => {}),
  };
  vm.createContext(ctx);
  pageScripts(html, opts).forEach((s, i) => {
    if (s.file) vm.runInContext(fs.readFileSync(s.file, 'utf8'), ctx, { filename: s.name });
    else vm.runInContext(s.code, ctx, { filename: 'viewer/index.html#' + i });
  });
  return ctx;
}
// Sets the viewer's current tournament the way its own load() does.
function setViewerState(ctx, view) {
  const v = JSON.parse(JSON.stringify(view));
  v.tieBreakOrder = v.tieBreakOrder || ['Head-to-head result', 'Leg difference', 'Legs won', 'Organiser decision / playoff'];
  v.entriesList = v.entriesList || []; v.groups = v.groups || []; v.format = v.format || {};
  ctx.__v = v; vm.runInContext('state = __v', ctx);
}
const runViewer = (ctx, code) => vm.runInContext(code, ctx);

// The language tables and i18n.js, as the pages load them before home.js (render.js, which comes first on the page, is
// left out: home.js uses none of its words, and it needs a canvas).
const I18N_FILES = ['i18n/render.ms.js', 'i18n/en.js', 'i18n/ms.js', 'i18n/i18n.js'];
// Loads just the home page script (pure builders and state), after the language scripts, into a bare context.
// opts.lang ('en' | 'ms'): the saved language choice.
function loadHome(opts) {
  opts = opts || {};
  const ctx = { console, Math, JSON, Date, Array, Object, String, Number, Intl, parseInt, parseFloat, isNaN, encodeURIComponent, decodeURIComponent,
    setTimeout: () => 0, clearTimeout: () => {}, document: stubDocument, window: {}, location: { hash: '', search: '' },
    localStorage: opts.lang ? memoryStore({ 'dartdraw.lang': opts.lang }) : { getItem: () => null, setItem() {}, removeItem() {} } };
  vm.createContext(ctx);
  I18N_FILES.concat(['home.js']).forEach((f) => vm.runInContext(fs.readFileSync(path.join(VIEWER, f), 'utf8'), ctx, { filename: 'viewer/' + f }));
  return ctx;
}

module.exports = { loadViewer, loadHome, setViewerState, runViewer, pageScripts, memoryStore, I18N_FILES, VIEWER };

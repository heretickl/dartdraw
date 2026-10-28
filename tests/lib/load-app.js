// Loads the organiser app (the files of app.html's <script src> tags in their order, then its inline scripts) into a
// Node vm context with a stubbed browser, so the real functions can be tested.
//   loadApp()                              English, the app in this folder
//   loadApp({ lang: 'ms' })                the language the app starts in (as if saved in localStorage "dartdraw.lang")
//   loadApp({ dir, extraFiles: [...] })    another copy of the app (tests/golden), more files to run after the scripts
const fs = require('fs'), vm = require('vm'), path = require('path'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..', '..');

// A stand-in that accepts any property read or call (document, window, ...).
function anything() {
  const fn = function () { return anything(); };
  return new Proxy(fn, {
    get: (t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'length' ? 0 : k === 'then' ? undefined : anything()),
    apply: () => anything(), construct: () => anything(), set: () => true,
  });
}
// document: any property works, and canvas text measuring returns a fixed width per character.
const stubDocument = new Proxy(function () {}, {
  get: (t, k) => (k === 'createElement'
    ? (tag) => (tag === 'canvas' ? { getContext: () => ({ font: '', measureText: (s) => ({ width: String(s).length * 7 }) }) } : anything())
    : k === Symbol.toPrimitive ? () => '' : k === 'length' ? 0 : k === 'then' ? undefined : anything()),
  apply: () => anything(), set: () => true,
});
function seededMath(seed) {
  let s = seed >>> 0;
  const m = Object.create(Math);
  m.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  return m;
}
const FIXED = Date.UTC(2026, 9, 6, 9, 0, 0);
class FixedDate extends Date {
  constructor(...a) { if (a.length) super(...a); else super(FIXED); }
  static now() { return FIXED; }
}

function loadApp(opts) {
  opts = Array.isArray(opts) ? { extraFiles: opts } : (opts || {});
  const dir = opts.dir || ROOT;
  const html = fs.readFileSync(path.join(dir, 'app.html'), 'utf8');
  const body = html.slice(html.indexOf('<body'));
  const scripts = [...body.matchAll(/<script(?![^>]*(?:src|data-dd-ms))[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  /* the saved language choice (localStorage "dartdraw.lang"); without one, the old any-value stub (English) */
  const store = opts.lang ? { 'dartdraw.lang': opts.lang } : null;
  const localStorage = store ? { getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } } : anything();
  const ctx = {
    console, Math: seededMath(12345), JSON, Date: FixedDate, Array, Object, String, Number, Set, Map, Intl,
    parseInt, parseFloat, isNaN, setTimeout, clearTimeout, crypto: crypto.webcrypto,
    document: stubDocument, window: anything(), navigator: anything(), localStorage,
    location: anything(), fetch: async () => ({}),
  };
  Object.assign(ctx, opts.globals || {});   // e.g. { location, navigator, history } for the language start-up tests
  vm.createContext(ctx);
  /* the <script src> files in their order. The BM tables: app.html's data-dd-ms script writes their tags only when BM is
     the language (DD_MS_FILES); here they run right after it in both languages, as the app had them before, unless
     opts.ms === false (an English browser: the tables are not on the page until ddLoadLang fetches them). */
  const steps = [];
  for (const m of body.matchAll(/<script src="([^"]+)"><\/script>|<script data-dd-ms>([\s\S]*?)<\/script>/g)) {
    if (m[1]) { if (fs.existsSync(path.join(dir, m[1]))) steps.push({ file: m[1] }); continue; }
    steps.push({ code: m[2], name: 'app.html#dd-ms' });
    if (opts.ms !== false) msFiles(m[2]).forEach((f) => steps.push({ file: f }));
  }
  steps.forEach((s) => vm.runInContext(s.file ? fs.readFileSync(path.join(dir, s.file), 'utf8') : s.code, ctx, { filename: s.file || s.name }));
  (opts.extraFiles || []).forEach((f) => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f }));
  scripts.forEach((s, i) => vm.runInContext(s, ctx, { filename: 'app.html#' + i }));
  /* The first draw asks "draw before or after check-in?" (drawTimingGate). Tests that press a draw button get the
     answer "Draw now", as the app behaved before the question existed; opts.askDrawTiming keeps the real question. */
  if (!opts.askDrawTiming) vm.runInContext('if(typeof drawTimingGate === "function") drawTimingGate = function(go){ go(); };', ctx);
  return ctx;
}
/* The BM table files a page's data-dd-ms script names (var DD_MS_FILES = [...]), in order. */
function msFiles(code) { const m = /DD_MS_FILES = (\[[^\]]*\])/.exec(code); return m ? JSON.parse(m[1]) : []; }
const run = (ctx, code) => vm.runInContext(code, ctx);
const norm = (s) => String(s).replace(/\b(?:t|kb|km|g|pod|e|inc)_[a-z0-9]{5,}\b/g, 'ID');
const hash = (s) => crypto.createHash('md5').update(norm(s)).digest('hex').slice(0, 12);

module.exports = { loadApp, run, hash, norm, ROOT, anything, stubDocument, seededMath, msFiles };

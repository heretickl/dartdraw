// Loads the organiser app (render.js, optional pods files, then index.html's inline scripts) into a
// Node vm context with a stubbed browser, so the real functions can be tested.
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

function loadApp(extraFiles) {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const ctx = {
    console, Math: seededMath(12345), JSON, Date: FixedDate, Array, Object, String, Number, Set, Map, Intl,
    parseInt, parseFloat, isNaN, setTimeout, clearTimeout, crypto: crypto.webcrypto,
    document: stubDocument, window: anything(), navigator: anything(), localStorage: anything(),
    location: anything(), fetch: async () => ({}),
  };
  vm.createContext(ctx);
  const files = ['render.js'].concat(['pods.js', 'pods-ui.js'].filter((f) => fs.existsSync(path.join(ROOT, f)))).concat(extraFiles || []);
  files.forEach((f) => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f }));
  scripts.forEach((s, i) => vm.runInContext(s, ctx, { filename: 'index.html#' + i }));
  return ctx;
}
const run = (ctx, code) => vm.runInContext(code, ctx);
const norm = (s) => String(s).replace(/\b(?:t|kb|km|g|pod|e|inc)_[a-z0-9]{5,}\b/g, 'ID');
const hash = (s) => crypto.createHash('md5').update(norm(s)).digest('hex').slice(0, 12);

module.exports = { loadApp, run, hash, norm, ROOT, anything, stubDocument, seededMath };

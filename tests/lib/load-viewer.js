// Loads the public viewer page (viewer/render.js plus viewer/index.html's inline scripts) into a Node vm
// context with a stubbed browser. fetch never resolves, so nothing loads on its own; tests set `state`.
const fs = require('fs'), vm = require('vm'), path = require('path');
const { ROOT, stubDocument, seededMath } = require('./load-app');

function loadViewer() {
  const html = fs.readFileSync(path.join(ROOT, 'viewer', 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const ctx = {
    console, Math: seededMath(1), JSON, Date, Array, Object, String, Number, Set, Map, Intl, URLSearchParams,
    parseInt, parseFloat, isNaN, setTimeout: () => 0, clearTimeout: () => {},
    document: stubDocument,
    window: { matchMedia: () => ({ matches: true }), addEventListener() {}, scrollTo() {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { search: '', pathname: '/live/testslug12', hash: '' }, history: { length: 1 },
    fetch: () => new Promise(() => {}),
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'viewer', 'render.js'), 'utf8'), ctx, { filename: 'viewer/render.js' });
  scripts.forEach((s, i) => vm.runInContext(s, ctx, { filename: 'viewer/index.html#' + i }));
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

module.exports = { loadViewer, setViewerState, runViewer };

// The organiser app's own rules, on the server: app.html's scripts (results-engine.js, pods.js, boardplan.js and the
// rest, then its inline script) run once per cold start in a vm sandbox with a stand-in for the browser, the way
// tests/lib/load-app.js runs them. A floor official's result is then applied by exactly the code the organiser's
// screens use (results-engine.js applyResult), so the stored event looks as if the organiser had entered it.
// English only: the server never shows its words, it only needs the rules. vercel.json includeFiles ships the files.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
let ctx = null;

function anything() {
  const fn = function () { return anything(); };
  return new Proxy(fn, {
    get: (t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'length' ? 0 : k === 'then' ? undefined : anything()),
    apply: () => anything(), construct: () => anything(), set: () => true,
  });
}
const stubDocument = new Proxy(function () {}, {
  get: (t, k) => (k === 'createElement'
    ? (tag) => (tag === 'canvas' ? { getContext: () => ({ font: '', measureText: (s) => ({ width: String(s).length * 7 }) }) } : anything())
    : k === Symbol.toPrimitive ? () => '' : k === 'length' ? 0 : k === 'then' ? undefined : anything()),
  apply: () => anything(), set: () => true,
});

function load() {
  const html = fs.readFileSync(path.join(ROOT, 'app.html'), 'utf8');
  const body = html.slice(html.indexOf('<body'));
  const files = [...body.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]).filter((f) => fs.existsSync(path.join(ROOT, f)));
  const inline = [...body.matchAll(/<script(?![^>]*(?:src|data-dd-ms))[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const c = {
    console, Math, JSON, Date, Array, Object, String, Number, Set, Map, Intl, URL, URLSearchParams,
    parseInt, parseFloat, isNaN, setTimeout, clearTimeout,
    document: stubDocument, window: anything(), navigator: {}, localStorage: anything(), location: { search: '', protocol: 'https:' },
    fetch: async () => { throw new Error('no network in the server engine'); },
  };
  vm.createContext(c);
  files.forEach((f) => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), c, { filename: f }));
  inline.forEach((s, i) => vm.runInContext(s, c, { filename: 'app.html#' + i }));
  return c;
}

/* The rules: { resultSlots, settingsView, applyResult, rebuildDerived, propagateAll, plain }. Built once per instance. */
function engine() {
  if (!ctx) ctx = load();
  const run = (code) => vm.runInContext(code, ctx);
  const inside = (data) => { ctx.__x = JSON.stringify(data); return run('JSON.parse(__x)'); };
  const plain = (x) => JSON.parse(JSON.stringify(x));
  return {
    inside, plain,
    resultSlots: (t) => run('resultSlots')(t),
    settingsView: (t) => run('settingsView')(t),
    applyResult: (t, pos, op, args, meta) => run('applyResult')(t, pos, op, args, meta),
    rebuildDerived: (t) => run('rebuildDerived')(t),
    mergeResults: (stored, incoming, dirty, now) => run('mergeResults')(stored, incoming, dirty, now),
    stampOrganiserResults: (prev, next, now) => run('stampOrganiserResults')(prev, next, now),
    /* Winners moving on again in every bracket, after results were merged match by match. */
    propagateAll: (t) => run('(function(t){ (t.pods||[]).forEach(function(p){ if(p.bracket && p.bracket.rounds) podsPropagate(p.bracket.rounds); }); if(t.knockout && t.knockout.podFinals && typeof syncFinalsFromPods==="function") syncFinalsFromPods(t); ["knockout","knockoutLosers"].forEach(function(k){ if(t[k] && t[k].rounds) propagateByes(t[k].rounds); }); })')(t),
    legsFor: (t, slot) => run('(function(t, s){ return s.kind==="rr" ? (parseInt(t.format.bestOfLegs)||5) : legsForKnockoutRound(t, s.bracketKey, s.bracket.rounds.length, s.ri); })')(t, slot),
    roundInfo: (bracket, ri) => run('koRoundInfo')(bracket, ri),
    teamCap: (t, stage) => run('(function(t, st){ return isTeamsEvent(t) ? teamMatchCap(t, st) : null; })')(t, stage),
  };
}

module.exports = { engine };

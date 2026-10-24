// Renders every screen of the public viewer for the events in viewer-events.js, through the page's real code paths
// (render(), the tab routes, player pages, Me / Following, the finder, the status line, the home page builders), in a vm
// with a tiny fake document that keeps what the page writes. Used by tests/viewer-i18n.test.js for the no-English-left
// check (lang 'ms') and the English golden (lang 'en').
//   renderScreens({ lang, dir }) -> [{ id, html }]   dir: a folder with index.html, home.js, render.js (default viewer/)
//   visibleText(html) -> the words a reader sees or hears (text, plus title / aria-label / placeholder / label values)
const fs = require('fs'), vm = require('vm'), path = require('path');
const { seededMath } = require('./load-app');
const { pageScripts, memoryStore, VIEWER } = require('./load-viewer');
const { buildEvents } = require('./viewer-events');
const LIB = path.join(VIEWER, 'api', '_lib');

const NOW = Date.UTC(2026, 9, 22, 11, 0, 0);   // 22 Oct 2026, 7 pm in Kuala Lumpur
class FixedDate extends Date {
  constructor(...a) { if (a.length) super(...a); else super(NOW); }
  static now() { return NOW; }
}

function fakeElement(id) {
  return {
    id, innerHTML: '', textContent: '', hidden: true, placeholder: '', value: '', attrs: {}, style: {}, scrollLeft: 0,
    classList: { toggle() {}, add() {}, remove() {}, contains: () => false },
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
    removeAttribute(k) { delete this.attrs[k]; }, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, focus() {}, contains: () => false,
  };
}
function fakeDocument() {
  const els = {};
  return {
    els, title: '', referrer: '', hidden: false, activeElement: null,
    getElementById: (id) => els[id] || (els[id] = fakeElement(id)),
    querySelector: () => null, querySelectorAll: () => [],
    createElement: (tag) => (tag === 'canvas' ? { getContext: () => ({ font: '', measureText: (s) => ({ width: String(s).length * 7 }) }) } : fakeElement('')),
    addEventListener() {}, documentElement: fakeElement('html'),
    body: { classList: { toggle() {} }, insertBefore() {}, firstChild: null },
  };
}

function loadPage(dir, lang, doc) {
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  const ls = memoryStore(lang ? { 'dartdraw.lang': lang } : {});
  const ctx = {
    console, Math: seededMath(1), JSON, Date: FixedDate, Array, Object, String, Number, Set, Map, Intl, URLSearchParams,
    parseInt, parseFloat, isNaN, encodeURIComponent, decodeURIComponent, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    document: doc, window: { matchMedia: () => ({ matches: true }), addEventListener() {}, scrollTo() {}, scrollY: 0 },
    localStorage: ls, sessionStorage: memoryStore({}), location: { search: '', pathname: '/live/testslug12', hash: '', origin: 'https://x' },
    history: { length: 1, replaceState() {} }, navigator: { languages: ['en-GB'], language: 'en-GB' }, fetch: () => new Promise(() => {}),
  };
  vm.createContext(ctx);
  pageScripts(html).forEach((s, i) => {
    if (s.file) {
      const rel = path.relative(VIEWER, s.file), own = path.join(dir, rel);
      vm.runInContext(fs.readFileSync(fs.existsSync(own) ? own : s.file, 'utf8'), ctx, { filename: rel });
    } else vm.runInContext(s.code, ctx, { filename: 'index.html#' + i });
  });
  return ctx;
}

function renderScreens(opts) {
  opts = opts || {};
  const dir = opts.dir || VIEWER, lang = opts.lang || 'en';
  const lib = path.join(dir, 'api', '_lib'), from = fs.existsSync(path.join(lib, 'listView.js')) ? lib : LIB;   // the server code that goes with those pages
  const { toPublicView } = require(path.join(from, 'publicView')), listView = require(path.join(from, 'listView'));
  const events = buildEvents();
  const out = [];
  const push = (id, html) => out.push({ id, html: String(html == null ? '' : html) });
  events.forEach((ev) => {
    const doc = fakeDocument(), ctx = loadPage(dir, lang, doc);
    const R = (code) => vm.runInContext(code, ctx);
    const view = toPublicView(ev.data);
    ctx.__v = JSON.parse(JSON.stringify(view)); ctx.__stages = listView.stagesOf(ev.data, listView.analyse(ev.data));
    ctx.__upd = new Date(NOW - ev.ageMin * 60000).toISOString();
    R("state = __v; if(!state.tieBreakOrder) state.tieBreakOrder = ['Head-to-head result','Leg difference','Legs won','Organiser decision / playoff']; state.entriesList = state.entriesList || []; state.groups = state.groups || []; state.format = state.format || {}; evStages = __stages; lastUpdatedAt = __upd; lastOkAt = Date.now();");
    const el = (id) => doc.getElementById(id);
    const shot = (id) => {
      R('render()');
      push(ev.key + ':' + id, [doc.title, el('hOver').textContent, el('hTitle').textContent, el('hSub').textContent, el('hLegs').textContent, el('hProgress').textContent,
        el('finder').placeholder, el('finder').attrs['aria-label'] || '', el('hVenue').innerHTML, el('startCard').innerHTML, el('navLinks').innerHTML, el('app').innerHTML].join('\n'));
    };
    const route = (h) => { ctx.location.hash = h; };
    const tabs = R('availableTabs()');
    // the status line in each state the page can show
    ['true,false', 'false,false', 'true,true'].forEach((sf, i) => push(ev.key + ':status' + i, R('statusPillHTML(' + sf.split(',')[0] + ', ' + sf.split(',')[1] + ', lastUpdatedAt, !!state.finalizedAt, lastOkAt - 120000, Date.now())')));
    push(ev.key + ':status-final', R('statusPillHTML(true, false, lastUpdatedAt, true, lastOkAt, Date.now())'));
    push(ev.key + ':status-old', R("statusPillHTML(true, false, '2025-12-24T10:00:00.000Z', false, lastOkAt, Date.now()) + statusPillHTML(true, false, '2026-10-21T10:00:00.000Z', false, lastOkAt, Date.now())"));
    route(''); shot('landing');
    tabs.forEach((t) => {
      if (t === 'bracket') {
        ['rounds', 'chart'].forEach((v) => {
          R('setBracketView("' + v + '")');
          const pods = (view.pods || []);
          const sels = pods.length ? ['all'].concat(view.knockout ? ['finals'] : []).concat(pods.map((p) => p.id)) : [null];
          sels.forEach((sel) => {
            if (sel) R('podSel = ' + JSON.stringify(sel));
            route('#/bracket'); shot('bracket-' + v + (sel ? '-' + sel : ''));
            if (v === 'rounds') {
              const keys = R("Array.prototype.map.call(Object.keys({ko:state.knockout, kol:state.knockoutLosers}).filter(function(k){ return k==='ko' ? state.knockout : state.knockoutLosers; }), function(k){ return k; })");
              (sel && sel !== 'finals' && sel !== 'all' ? ['pod:' + sel] : keys).forEach((k) => {
                const b = R('bracketForKey(' + JSON.stringify(k) + ')');
                if (!b || !b.rounds) return;
                b.rounds.forEach((r, ri) => { R('roundSel[' + JSON.stringify(k) + '] = ' + ri); route('#/bracket'); shot('bracket-rounds-' + (sel || '') + '-' + k + '-r' + ri); });
              });
            }
          });
        });
        R('setBracketView("rounds")');
      } else if (t === 'boards') {
        route('#/boards'); shot('boards');
        route('#/boards?tv=1'); shot('boards-tv');
      } else if (t === 'groups') {
        route('#/groups'); shot('groups');
        (view.groups || []).slice(0, 1).forEach((g) => { route('#/groups/' + encodeURIComponent(g.label)); shot('groups-one'); });
      } else { route('#/' + t); shot(t + '-empty'); }
    });
    // every player's page
    (view.entriesList || []).forEach((e, i) => { route('#/p/' + encodeURIComponent(e.id)); shot('player-' + i); });
    route('#/p/nobody'); if (tabs.length) shot('player-missing');
    // Me and Following, set
    if (tabs.indexOf('me') !== -1) {
      const ids = (view.entriesList || []).map((e) => e.id);
      ctx.__ids = ids; R('prefs.me = __ids[0]; prefs.follow = __ids.slice(1, 4);');
      route('#/me'); shot('me'); route('#/following'); shot('following');
      route('#/bracket'); if (tabs.indexOf('bracket') !== -1) shot('bracket-with-me');
      R('prefs.me = null; prefs.follow = [];');
    }
    // the finder: a hit and a miss
    el('finder').value = 'a'; R('showFinderResults()'); push(ev.key + ':finder', el('finderResults').innerHTML);
    el('finder').value = 'zzzz'; R('showFinderResults()'); push(ev.key + ':finder-none', el('finderResults').innerHTML);
    // the "New here?" bar, opened
    push(ev.key + ':startbar', R("hmStartBarHTML({ help: helpHref(''), team: isTeamsEvent(), open: true })"));
    if (opts.messages) ['goneTitle,goneText,1', 'failTitle,failText,0', 'noLinkTitle,noLinkText,0'].forEach((m) => {
      const [a, b, h] = m.split(','); R("showMessage('ev.msg." + a + "', 'ev.msg." + b + "', " + (h === '1') + ')'); push(ev.key + ':msg-' + a, el('app').innerHTML);
    });
  });
  // the home page
  const doc = fakeDocument(), ctx = loadPage(dir, lang, doc);
  const R = (code) => vm.runInContext(code, ctx);
  ctx.__data = listView.buildList(events.map((e) => ({ slug: e.slug, data: e.data, updated_at: new Date(NOW - e.ageMin * 60000).toISOString() })), NOW);
  ctx.__data.upcoming.push({ slug: 'nodatenone01', event: 'Mystery Night', tournament: '', date: '', start: '', format: 'knockout', unit: 'Triples', entries: 1, updatedAt: new Date(NOW).toISOString(), stages: [] });
  const today = '2026-10-22';
  ['live', 'upcoming', 'results'].forEach((k) => {
    push('home:list-' + k, R('hmListHTML(' + JSON.stringify(k) + ', __data.' + k + ", '', " + JSON.stringify(today) + ')'));
    push('home:empty-' + k, R('hmListHTML(' + JSON.stringify(k) + ", [], '', " + JSON.stringify(today) + ')'));
    push('home:tabs-' + k, R('hmTabsHTML(__data, ' + JSON.stringify(k) + ')'));
  });
  push('home:nomatch', R("hmListHTML('live', __data.live, 'zzqq', '2026-10-22')"));
  push('home:tabs-nocounts', R("hmTabsHTML(__data, 'live', true)"));
  push('home:status', [R('hmStatusState(Date.now() - 20000, false, Date.now()).html'), R('hmStatusState(Date.now() - 300000, false, Date.now()).html'), R('hmStatusState(0, false, Date.now()).html'), R('hmStatusState(0, true, Date.now()).html')].join('\n'));
  push('home:start', R("hmStartHTML('home')"));
  push('home:failed', R('hmLoadFailedHTML()'));
  push('home:open', R("hmOpenHTML('abcdefgh12')"));
  push('home:homelink', R('hmHomeLinkHTML()'));
  if (opts.messages) push('home:untitled', R("hmCardHTML('results', { slug: 'untitled0001', event: '', tournament: '', format: 'roundrobin', unit: 'Doubles', entries: 4, winner: '' })"));
  push('home:header', R('hmHeaderHTML()').replace(/<span class="hm-lang">[\s\S]*?<\/span><a class="hm-help"/, '<a class="hm-help"'));
  push('home:theme', ['auto', 'light', 'dark'].map((t) => R('typeof hmThemeLabel === "function" ? hmThemeLabel(' + JSON.stringify(t) + ') : "Colour theme: ' + t + '. Tap to change"')).join('\n'));
  return out;
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—',
  hellip: '…', times: '×', middot: '·', lsaquo: '‹', rsaquo: '›', larr: '←', rarr: '→' };
function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : (ENT[e] != null ? ENT[e] : m)));
}
function visibleText(html) {
  const attrs = [];
  String(html).replace(/\s(title|aria-label|placeholder|label)="([^"]*)"/g, (m, k, v) => { attrs.push(decode(v)); return m; });
  const text = decode(String(html).replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ')).replace(/​/g, '');
  return (text + ' | ' + attrs.join(' | ')).replace(/\s+/g, ' ').trim();
}

module.exports = { renderScreens, visibleText, decode, NOW, FixedDate };

// Shared pieces of tests/xss-injection.test.js: a recording fake DOM, a small HTML parser that finds ACTIVE injected payloads
// (not merely escaped text), tournament builders for every format, and the payload injector.
const vm = require('vm');
const { loadApp, run } = require('./load-app');
const { seededRng, makeTournament, playOut, play } = require('./helpers');

/* ---------- recording DOM: everything the app writes as HTML lands in `captured` ---------- */
const state = { captured: [], curCall: '' };
const els = {};
function makeEl(id) {
  const store = { innerHTML: '', value: '', checked: false };
  const obj = {
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }, style: {}, dataset: {},
    querySelector() { return null; }, querySelectorAll() { return []; }, getBoundingClientRect() { return { width: 0, height: 0, top: 0, left: 0 }; },
    appendChild() {}, removeChild() {}, remove() {}, addEventListener() {}, removeEventListener() {}, focus() {}, select() {}, click() {}, setAttribute() {}, getAttribute() { return null; },
    insertAdjacentHTML(pos, h) { state.captured.push({ src: state.curCall + ' insertAdjacentHTML #' + id, html: String(h) }); },
    offsetWidth: 0, offsetHeight: 0, clientWidth: 0, clientHeight: 0, scrollWidth: 0, children: [], parentNode: null, files: [],
  };
  return new Proxy(obj, {
    get: (t, k) => (k in store ? store[k] : k in t ? t[k] : (k === Symbol.toPrimitive ? () => '' : undefined)),
    set: (t, k, v) => { if (k === 'innerHTML' || k === 'outerHTML' || k === 'srcdoc') state.captured.push({ src: state.curCall + ' ' + k + ' #' + id, html: String(v) }); store[k] = v; return true; },
  });
}
const canvasCtx = { font: '', measureText: (s) => ({ width: String(s).length * 7 }), fillText() {}, fillRect() {}, drawImage() {}, getImageData() { return { data: [] }; } };
const doc = {
  getElementById: (id) => (els[id] = els[id] || makeEl(id)),
  querySelector: () => null, querySelectorAll: () => [],
  createElement: (tag) => (tag === 'canvas' ? { getContext: () => canvasCtx, width: 0, height: 0 } : makeEl('new-' + tag)),
  body: makeEl('body'), documentElement: makeEl('html'), head: makeEl('head'),
  addEventListener() {}, removeEventListener() {}, title: '',
  write: (h) => state.captured.push({ src: state.curCall + ' document.write', html: String(h) }),
};
const win = {
  open: (url) => { state.captured.push({ src: state.curCall + ' window.open url', html: '<a href="' + String(url).replace(/"/g, '&quot;') + '">' }); return { document: { write: (h) => state.captured.push({ src: state.curCall + ' popup.write', html: String(h) }), close() {}, open() {} }, focus() {}, print() {}, close() {} }; },
  print() {}, addEventListener() {}, removeEventListener() {}, location: { href: '', origin: 'https://app.test', pathname: '/', search: '' }, innerWidth: 1200, innerHeight: 800, scrollTo() {}, matchMedia: () => ({ matches: false, addEventListener() {} }), prompt() { return null; }, confirm() { return false; },
};

/* ---------- payloads ---------- */
// One payload per injected field; it tries every way out of a text node, a quoted attribute, an unquoted attribute, a JS string,
// a URL and a <script>/<style>. alert(n) identifies the field in a leak report.
const payload = (n) => 'javascript:alert(' + n + ')//" onmouseover=alert(' + n + ') x="\' onmouseover=alert(' + n + ') x=\'><img src=x onerror=alert(' + n + ')>\');alert(' + n + ');//</script></style></textarea></title>';
const ID_KEY = (k) => k === 'id' || /Ids?$/.test(k);
const STRUCT = new Set(['formatType', 'competitionUnit', 'eventType', 'advanceMode', 'teamMatchFormat', 'koPaperSize', 'levelOfPlay', 'shape', 'type']);

/* ---------- HTML leak detector ---------- */
function decode(s) { return s.replace(/&#(\d+);/g, (m, d) => String.fromCharCode(+d)).replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCharCode(parseInt(h, 16))).replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'); }
// alert(N) calls that appear outside JS strings and comments, i.e. that would really run.
function jsCodeAlerts(code) {
  const out = []; let i = 0; const n = code.length;
  while (i < n) {
    const c = code[i];
    if (c === '"' || c === "'" || c === '`') { let j = i + 1; while (j < n && code[j] !== c) { if (code[j] === '\\') j++; j++; } i = j + 1; continue; }
    if (c === '/' && code[i + 1] === '/') { while (i < n && code[i] !== '\n') i++; continue; }
    if (c === '/' && code[i + 1] === '*') { const e = code.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
    const m = /^alert\((\d+)\)/.exec(code.slice(i, i + 20)); if (m) { out.push(+m[1]); i += m[0].length; continue; }
    i++;
  }
  return out;
}
function parseLeaks(html) {
  const leaks = []; let i = 0; const n = html.length;
  while (i < n) {
    const lt = html.indexOf('<', i); if (lt < 0) break;
    if (html.startsWith('<!--', lt)) { const e = html.indexOf('-->', lt); i = e < 0 ? n : e + 3; continue; }
    const m = /^<([a-zA-Z][a-zA-Z0-9-]*)/.exec(html.slice(lt, lt + 40));
    if (!m) { i = lt + 1; continue; }
    const tag = m[1].toLowerCase(); let j = lt + m[0].length; const attrs = [];
    while (j < n) {
      while (j < n && /[\s\/]/.test(html[j])) j++;
      if (html[j] === '>' || j >= n) break;
      let k = j; while (k < n && !/[\s\/>=]/.test(html[k])) k++;
      if (k === j) k = j + 1;
      const name = html.slice(j, k).toLowerCase(); j = k;
      while (j < n && /\s/.test(html[j])) j++;
      let val = '';
      if (html[j] === '=') {
        j++; while (j < n && /\s/.test(html[j])) j++;
        if (html[j] === '"' || html[j] === "'") { const q = html[j]; const e = html.indexOf(q, j + 1); val = html.slice(j + 1, e < 0 ? n : e); j = e < 0 ? n : e + 1; }
        else { let e = j; while (e < n && !/[\s>]/.test(html[e])) e++; val = html.slice(j, e); j = e; }
      }
      attrs.push([name, decode(val)]);
    }
    j++;
    for (const [name, val] of attrs) {
      const mk = (val.match(/alert\((\d+)\)/) || [])[1];
      if (name.startsWith('on')) {
        if (name === 'onerror' || name === 'onmouseover') leaks.push({ kind: 'attr-inject ' + tag + '[' + name + ']', n: mk });
        else jsCodeAlerts(val).forEach((x) => leaks.push({ kind: 'js-breakout ' + tag + '[' + name + ']', n: x }));
      } else if (/^(href|src|action|formaction|xlink:href|data|poster)$/.test(name) && /^\s*javascript:/i.test(val) && mk) leaks.push({ kind: 'js-url ' + tag + '[' + name + ']', n: mk });
      else if (name === 'style' && mk) leaks.push({ kind: 'css-inject ' + tag + '[style]', n: mk });
      else if (name === 'srcdoc') parseLeaks(val).forEach((l) => leaks.push(Object.assign({}, l, { kind: 'srcdoc>' + l.kind })));
      else if (name === 'x' || /^'$|alert/.test(name)) leaks.push({ kind: 'attr-break ' + tag + '[' + name + ']', n: mk });
    }
    if (tag === 'img' && attrs.some(([a, v]) => a === 'src' && v === 'x')) leaks.push({ kind: 'tag-inject <img>', n: (attrs.find(([a]) => a === 'onerror') || [, ''])[1].replace(/\D/g, '') });
    if (tag === 'script' || tag === 'style' || tag === 'textarea' || tag === 'title') {
      const e = html.toLowerCase().indexOf('</' + tag, j); const body = html.slice(j, e < 0 ? n : e);
      const mk = (body.match(/alert\((\d+)\)/) || [])[1];
      if (mk && (tag === 'script' || tag === 'style')) leaks.push({ kind: 'in-' + tag, n: mk });
      i = e < 0 ? n : e + 2; continue;
    }
    i = j;
  }
  return leaks;
}

/* ---------- apps and tournaments ---------- */
function freshApp() {
  const app = loadApp();
  app.document = doc; app.window = win; app.requestAnimationFrame = () => {}; app.setTimeout = () => 0; app.alert = () => {}; app.confirm = () => false; app.prompt = () => null;
  app.location = win.location; app.navigator = { clipboard: { writeText: () => ({ then() {} }) } };
  app.persist = () => {}; app.apiFetch = async () => ({ ok: true, status: 200, json: async () => ({}) });
  app.renderSavedList = () => {};
  app.openModal = (o) => { state.captured.push({ src: state.curCall + ' openModal', html: '<h3>' + o.title + '</h3>' + (o.bodyHTML ? o.bodyHTML : '<p>' + (o.body || '') + '</p>') }); };
  app.__u = { id: 'adm1', name: 'Boss', email: 'b@x.com', role: 'admin', tier: 'pro', entryLimit: null, viewerUrl: 'https://view.test' };
  run(app, 'currentOrganizer = __u');
  return app;
}
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
function decorate(t) {
  Object.assign(t.eventCreation, { tournamentName: 'T', eventName: 'E', date: '2026-10-14', saved: true });
  t.format.saved = true; t.format.footerText = 'F'; t.format.rulesNotes = 'R'; t.format.logo = PNG; t.format.sponsors = [{ src: PNG, shape: 'rect', name: 'S' }];
  t.format.anticipatedStartTime = '10:00'; t.format.breaks.roundRobin = { enabled: true, time: '12:00', minutes: 30 }; t.format.breaks.knockout = { enabled: true, time: '15:00', minutes: 20 };
  t.published = true; t.publicSlug = 'slug1'; t.listed = true;
  t.printSettings = { sponsorFooterEnabled: true, teamHandoutEnabled: true, rulesSheetEnabled: true, lineupSheetEnabled: true, koPaperSize: 'A4', playersSheetEnabled: true, boardsSheetEnabled: true };
  t.entriesList.forEach((e, k) => { e.org = 'Org' + (k % 3); e.players = ['P' + k + 'a', 'P' + k + 'b']; e.checkedIn = k % 2 === 0; e.notes = 'note'; });
  t.incidents = [{ id: 'inc1', entryId: t.entriesList[0].id, description: 'D', action: 'Other', at: Date.UTC(2026, 9, 6) }];
}
function scoreAll(app, t, drawTie) {
  t.groups.forEach((g) => {
    g.confirmed = true; g.gameStarted = true; g.startedAt = Date.UTC(2026, 9, 6, 9);
    app.__g = g; const ms = run(app, 'groupMatches(__g)');
    ms.forEach(([a, b], k) => { const key = run(app, 'scoreKey')(a, b); g.scores = g.scores || {}; g.scores[key] = drawTie ? (k % 2 ? { legs1: 3, legs2: 1 } : { legs1: 1, legs2: 3 }) : { legs1: 3, legs2: k % 3 }; });
  });
}
// kind: rr | rrtie (unresolved tie) | rrko (round robin + knockout with a Plate pool) | ko (knockout with seeds) | pods (Group Boards with
// finals and a board plan) | teams (segments + tie-breaker, with an older roster left in the data) | doubles
const KINDS = ['rr', 'rrtie', 'rrko', 'ko', 'pods', 'teams', 'doubles'];
function build(kind) {
  const app = freshApp();
  let t;
  if (kind === 'pods') {
    t = makeTournament(app, 12, { pods: 3, boards: 3, seeding: true, numSeeds: 4 });
    app.__t = t; run(app, 'state = __t');
    run(app, 'generatePods')(t, seededRng(2)); run(app, 'podsConfirmAll')(t);
    playOut(app, t.pods[0].bracket, () => 'a'); playOut(app, t.pods[1].bracket, () => 'b');
    run(app, 'syncFinalsFromPods')(t);
    decorate(t);
    if (t.knockout) { const m = t.knockout.rounds[0].find((x) => x.aEntryId && x.bEntryId); if (m) { m.board = 2; m.called = true; } }
    t.boardPlan = run(app, 'buildBoardPlan')(t);
  } else {
    t = run(app, 'blankTournament')();
    const n = kind === 'ko' ? 11 : 12;
    t.entriesList = Array.from({ length: n }, (_, i) => ({ id: 'e' + i, name: 'Player ' + (i + 1), org: '', players: [], withdrawn: false }));
    t.eventCreation.entries = n; t.eventCreation.boards = 6;
    decorate(t);
    if (kind === 'teams') {   // segments with every type and a tie-breaker; an older event's roster and rubber fields are still in the data
      t.eventCreation.competitionUnit = 'Teams'; t.format.teamMatchFormat = 'mixed'; t.format.teamSize = 2;
      t.format.teamSegments = [{ type: 'foursome', startingScore: 1001, legs: 1 }, { type: 'singles', startingScore: 501, legs: 3 }, { type: 'doubles', startingScore: 301, legs: 3 }, { type: 'trios', startingScore: 701, legs: 5 }];
      t.format.teamTieBreaker = { type: 'foursome', startingScore: 1001, legs: 1, inRoundRobin: true, inKnockout: false };
      t.format.mixedRubbers = [{ name: 'R1', type: 'triples', startingScore: 501, legs: 3, isTieBreaker: false }];
      t.entriesList.forEach((e, k) => { e.players = ['A' + k, 'B' + k]; e.captain = 'C'; });
    }
    if (kind === 'doubles') { t.eventCreation.competitionUnit = 'Doubles'; }
    t.format.formatType = kind === 'ko' ? 'knockout' : kind === 'rr' || kind === 'rrtie' ? 'roundrobin' : 'rrknockout';
    t.format.losersPool = true; t.format.knockoutLegs.main.variable = true;
    app.__t = t; run(app, 'state = __t');
    if (kind === 'ko') {
      t.format.seedingEnabled = true; t.format.numSeeds = 8; run(app, 'ensureSeedOrder(__t)');
      app.__o = t.seedOrder.map((id) => ({ entryId: id, org: '' }));
      t.knockout = run(app, 'generateBracket(__o, "Bracket")');
      playOut(app, t.knockout, () => 'a');
      t.knockout.rounds[0].forEach((m) => { if (m.aEntryId && m.bEntryId) m.wo = false; });
    } else {
      run(app, 'buildGroups(__t)');
      scoreAll(app, t, kind === 'rrtie');
      t.groups[0].positionOverrides = { [t.groups[0].entryIds[0]]: 1 };
      if (kind !== 'rr' && kind !== 'rrtie') {
        run(app, 'generateKnockoutFromRR()');
        if (t.knockout) { const r0 = t.knockout.rounds[0].find((m) => m.aEntryId && m.bEntryId); if (r0) play(r0, 'a'); t.knockout.seedLabels = {}; Object.keys(t.knockout.seeds || {}).forEach((k) => { t.knockout.seedLabels[k] = 'A1'; }); }
      }
    }
  }
  t.eventCreation.advancedMode = true;
  t.id = 't_' + kind;
  return { app, t };
}

/* ---------- injection ---------- */
// mode 'strings': every string field gets a payload appended (ids, images, the slug and structural enums excluded).
// mode 'numbers': every number/boolean/null field becomes a payload string (board lists and timestamps excluded).
// part/parts: only every parts-th eligible field is injected in one pass (several passes cover all fields; this keeps one hostile
// value from crashing a builder before the others were reached).
function makeInjector(part, parts) {
  const fieldOf = {}; let counter = 0, seen = 0;
  const mine = () => parts == null || (seen++ % parts) === part;
  function inject(node, path, mode, depth) {
    if (depth > 30 || !node || typeof node !== 'object') return;
    const keys = Array.isArray(node) ? node.map((_, i) => i) : Object.keys(node);
    keys.forEach((k) => {
      const v = node[k]; const p = path + (Array.isArray(node) ? '[]' : '.' + k);
      const parentKey = Array.isArray(node) ? path.split('.').pop().replace(/\[\]/g, '') : k;
      if (typeof v === 'string') {
        if (ID_KEY(String(parentKey)) || /^data:image/.test(v) || k === 'publicSlug' || k === 'key' || k === 'calledPair') return;   // cleaned by tournament-sanitize / escJs
        if (mode === 'strings' && STRUCT.has(String(parentKey))) return;
        if (mode === 'numbers') return;
        if (!mine()) return;
        const n = ++counter; fieldOf[n] = p; node[k] = v + payload(n);
      } else if ((typeof v === 'number' || typeof v === 'boolean' || v === null) && mode === 'numbers') {
        if (String(parentKey) === 'boards' || /At$|^at$|Ms$/.test(String(k))) return;   // board lists are cleaned to numbers on load; timestamps
        if (!mine()) return;
        const n = ++counter; fieldOf[n] = p; node[k] = payload(n);
      } else if (v && typeof v === 'object') inject(v, p, mode, depth + 1);
    });
  }
  return { inject, fieldOf };
}

/* ---------- calling the renderers ---------- */
function argsFor(app, t, params, variant) {
  const g = (t.groups || [])[0], pod = (t.pods || [])[0];
  const br = variant === 1 ? (t.knockoutLosers || t.knockout) : variant === 2 && pod ? pod.bracket : (t.knockout || (pod && pod.bracket));
  const bk = variant === 1 ? 'knockoutLosers' : variant === 2 && pod ? 'pod:' + pod.id : 'knockout';
  const e0 = t.entriesList[0], e1 = t.entriesList[1];
  return params.map((p) => {
    p = p.replace(/=.*$/, '').trim();
    if (/^(t|tour|tournament|data|st8)$/.test(p)) return t;
    if (/^(g|group|grp|x)$/.test(p)) return g;
    if (/^(confirmed|groups|list)$/.test(p)) return (t.groups || []).filter((x) => x.confirmed);
    if (/^(bracket|b|br|fin|bracketObj)$/.test(p)) return br;
    if (/^(bracketKey|key|bk|section)$/.test(p)) return bk;
    if (/^(p|pod|selPod)$/.test(p)) return pod;
    if (/^(pods)$/.test(p)) return t.pods;
    if (/^(podId)$/.test(p)) return pod && pod.id;
    if (/^(groupId|gid)$/.test(p)) return g && g.id;
    if (/^(e|ent|entry|entryA|rowEnt)$/.test(p)) return e0;
    if (/^(entryB|colEnt)$/.test(p)) return e1;
    if (/^(entryId|eid|aId|a|id)$/.test(p)) return e0 && e0.id;
    if (/^(bId|b2|oppId)$/.test(p)) return e1 && e1.id;
    if (/^(aName)$/.test(p)) return e0 && e0.name;
    if (/^(bName)$/.test(p)) return e1 && e1.name;
    if (/^(ri|mi|roundIdx|matchIdx|idx|i|s|ci)$/.test(p)) return 0;
    if (/^(n|count|size)$/.test(p)) return 8;
    if (/^(standings)$/.test(p)) { try { app.__g = g; return g ? run(app, 'computeStandings(__g)') : undefined; } catch (e) { return undefined; } }
    if (/^(m|match)$/.test(p)) return br && br.rounds[0][0];
    if (/^(opts|options|meta)$/.test(p)) return {};
    if (/^(forPrint|readable)$/.test(p)) return variant === 1;
    if (/^(plan)$/.test(p)) { try { return run(app, 'buildBoardPlan')(t); } catch (e) { return undefined; } }
    return undefined;
  });
}
// Functions that produce or open HTML. Their return value counts as HTML (other returns, e.g. names, are plain text).
const RETURNS_HTML = /(HTML|Html|Sheet|Sheets|Card)$|^stage\d|Stage\d?$/;
// Functions swept with guessed arguments: HTML builders and the openers/handlers that put HTML on the page.
const SWEEP = /(HTML|Html|Sheet|Sheets|Card|Modal|Picker|Summary|Preview|Print|Panel|Rows|Columns|Chart)\w*$|^(stage\d|open|confirm|block|generate|toggle|set|add|remove|move|swap|withdraw|reset|undo|mark|start|finalize|schedul)/;
const SKIP = /^(loadApp|fetch|apiFetch|logout|persist|init|boot|main|setTimeout|clearTimeout|startAutoSave|scheduleSave|flushSave|uid|newPublicSlug|shuffleArray|requestAnimationFrame|openModal|closeModal|alert|confirm|prompt|eval|Function|Proxy|Reflect|renderSavedList|reloadLockedTournament|openTournament|newTournament|deleteTournament|performDelete|duplicateTournament|renameTournament)$/;
const LIMIT = { timeout: 1500 };

// Runs every renderer against tournament `tTemplate` (already injected) and returns { captured, errors }.
function callAll(app, tTemplate, kind, opts) {
  opts = opts || {};
  state.captured = [];
  const errors = {};
  const tryCall = (label, fn) => {
    state.curCall = kind + ':' + label;
    try {
      const r = fn();
      if (r && typeof r.then === 'function') r.then(() => {}, () => {});
      else if (typeof r === 'string' && opts.htmlReturn && opts.htmlReturn(label)) state.captured.push({ src: state.curCall + ' return', html: r });
      else if (r && typeof r === 'object' && typeof r.html === 'string') state.captured.push({ src: state.curCall + ' return.html', html: r.html });
    } catch (e) { errors[label] = e.message; }   // a crash on hostile data is not a leak
  };
  const fresh = () => { app.__t = JSON.parse(JSON.stringify(tTemplate)); run(app, 'state = __t; lockedIds.clear(); foreignOpenIds.clear(); adminEditing = null; popoutMode = false;'); return app.__t; };
  const exec = (code) => vm.runInContext(code, app, LIMIT);
  // every screen: stages 1-7, the pop-out windows, the finalized (locked) view
  for (let st = 1; st <= 7; st++) tryCall('render@' + st, () => { fresh(); app.__n = st; exec('currentStage = __n; render()'); });
  ['rr', 'knockout', 'knockoutLosers'].forEach((sec) => tryCall('popout@' + sec, () => { fresh(); app.__s = sec; exec('popoutMode = true; popoutSection = __s; currentStage = 5; render(); popoutMode = false;'); }));
  tryCall('finalized-render', () => { const t = fresh(); t.finalized = { at: '2026-10-10T00:00:00.000Z' }; app.__n = 5; exec('lockedIds.add(state.id); currentStage = __n; render()'); });
  // printing: the final pack, the blank pack, the Group Boards pack, the readable chart
  tryCall('doFinalPrint', () => { fresh(); exec('doFinalPrint()'); });
  tryCall('runPrintPack', () => { fresh(); exec('runPrintPack(state.groups.filter(g=>g.confirmed))'); });
  tryCall('podsPrintClick', () => { fresh(); exec('typeof podsPrintClick==="function" ? podsPrintClick() : ""'); });
  // every knockout match: score modal and no-show picker, plus the board-plan call button; the readable chart of every bracket
  const tt = JSON.parse(JSON.stringify(tTemplate));
  const keys = [['knockout', tt.knockout], ['knockoutLosers', tt.knockoutLosers]].concat((tt.pods || []).map((p) => ['pod:' + p.id, p.bracket]));
  keys.forEach(([key, b]) => {
    if (!b || !b.rounds) return;
    b.rounds.forEach((r, ri) => r.forEach((m, mi) => {
      ['koMatchScoreModal', 'openKoNoShowPicker', 'bpToggleCall'].forEach((fn) => tryCall(fn + '@' + key + ri + '-' + mi + ' ', () => { fresh(); app.__a = [key, ri, mi]; return exec(fn + '.apply(null, __a)'); }));
    }));
    tryCall('readableChart@' + key + ' ', () => { fresh(); app.__k = key; return exec('mirroredChartHTML(bracketByKey(state, __k) || state.knockout, state, {readable:true, interactive:true, bracketKey:__k})'); });
  });
  // every group cell score prompt, the group pickers, the pod handlers and per-entry modals
  (tt.groups || []).forEach((g, gi) => {
    g.entryIds.forEach((a) => g.entryIds.forEach((b) => {
      if (a === b) return;
      tryCall('promptScore@' + gi + ' ', () => { const t = fresh(); const ea = t.entriesList.find((e) => e.id === a), eb = t.entriesList.find((e) => e.id === b); app.__a = [g.id, a, b, ea.name, eb.name]; return exec('promptScore.apply(null, __a)'); });
    }));
    ['openNoShowPicker', 'openSwapPicker', 'openPositionOverridePicker', 'openConfirmChartModal', 'openExpandedPreview', 'confirmGroupClick'].forEach((fn) => tryCall(fn + '@g' + gi + ' ', () => { fresh(); app.__a = [g.id]; return exec('typeof ' + fn + '==="function" ? ' + fn + '.apply(null, __a) : ""'); }));
  });
  (tt.pods || []).forEach((p, pi) => ['podsSelect', 'podsMoveModal', 'podsSwapModal', 'podsConfirmClick', 'podsUnconfirmClick'].forEach((fn) => tryCall(fn + '@p' + pi + ' ', () => { fresh(); app.__a = [p.id]; exec('typeof ' + fn + '==="function" ? ' + fn + '.apply(null, __a) : ""'); app.__n = 5; exec('currentStage = __n; render()'); })));
  tt.entriesList.forEach((e, ei) => ['podsPlaceModal', 'withdrawEntry', 'openEntryNotes', 'editEntry'].forEach((fn) => tryCall(fn + '@e' + ei + ' ', () => { fresh(); app.__a = [e.id]; return exec('typeof ' + fn + '==="function" ? ' + fn + '.apply(null, __a) : ""'); })));
  tryCall('openSchedulingModal', () => { fresh(); exec('openSchedulingModal()'); });
  tryCall('blockForUnresolvedTies', () => { fresh(); exec('blockForUnresolvedTies()'); });
  tryCall('generateKnockoutFromRRChecked', () => { fresh(); exec('generateKnockoutFromRRChecked()'); });
  // a sweep over every HTML-producing function with guessed arguments (three variants of the bracket arguments)
  const names = Object.getOwnPropertyNames(app).filter((k) => { try { return typeof app[k] === 'function' && !SKIP.test(k) && /^[a-z]/.test(k) && SWEEP.test(k); } catch (e) { return false; } });
  for (const fnName of names) {
    let params = [];
    try { const src = Function.prototype.toString.call(app[fnName]); const m = /^[^(]*\(([^)]*)\)/.exec(src); params = m && m[1].trim() ? m[1].split(',') : []; } catch (e) { /* no params */ }
    for (let variant = 0; variant < 3; variant++) {
      tryCall(fnName + '#' + variant, () => { const t = fresh(); app.__f = app[fnName]; app.__a = argsFor(app, t, params, variant); return exec('__f.apply(null, __a)'); });
      if (!params.length) break;
    }
  }
  return { captured: state.captured, errors, calls: names.length };
}

module.exports = { KINDS, build, makeInjector, callAll, parseLeaks, RETURNS_HTML, state };

/* Every organiser screen, dialog and message the vm can reach, in one language, for the events of app-states.js.
   Loads the app (tests/lib/load-app.js) with a recording document: every innerHTML / textContent written, every
   aria-label, title, placeholder and href set, and every toast, is kept with where it came from. Used by
   tests/app-i18n.test.js for "no English left" (BM) and "English unchanged" (the golden file tests/golden/app-en.json).
     renderAppScreens({ lang: 'en'|'ms', dir, sheetLang }) -> [{ id, html }]   (dir: another copy of the app, for the golden;
       sheetLang: 'en'|'ms' sets every event's Printed sheets language, i18n step 4; without it the events keep their own)
   An id is "<event id> | <what was called> | <where it was written>". The print sheets (#printSheets and the print
   builders) are recorded with "print" in the id: they are drawn in the event's print language, not the screen's. */
const vm = require('vm');
const { loadApp, run } = require('./load-app');
const { buildStates } = require('./app-states');

const escT = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function recordingDoc(rec) {
  const els = {};
  function makeEl(id) {
    const store = { innerHTML: '', textContent: '', value: '', checked: false, hidden: true, disabled: false, onclick: null };
    const attrs = {};
    const obj = {
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }, style: {}, dataset: {},
      querySelector() { return null; }, querySelectorAll() { return []; }, getBoundingClientRect() { return { width: 0, height: 0, top: 0, left: 0 }; },
      appendChild() {}, removeChild() {}, remove() {}, addEventListener() {}, removeEventListener() {}, focus() {}, select() {}, click() {}, scrollIntoView() {}, contains() { return false; },
      setAttribute(k, v) { attrs[k] = String(v); if (/^(aria-label|title|placeholder|href)$/.test(k)) rec.push(id, '@' + k, escT(v)); },
      getAttribute(k) { return Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null; }, removeAttribute(k) { delete attrs[k]; }, hasAttribute(k) { return Object.prototype.hasOwnProperty.call(attrs, k); },
      insertAdjacentHTML(pos, h) { rec.push(id, 'insertAdjacentHTML', String(h)); },
      offsetWidth: 0, offsetHeight: 0, clientWidth: 0, clientHeight: 0, scrollWidth: 0, scrollTop: 0, children: [], parentNode: null, files: [], tagName: 'DIV',
    };
    return new Proxy(obj, {
      get: (t, k) => (k in store ? store[k] : k in t ? t[k] : (k === Symbol.toPrimitive ? () => '' : undefined)),
      set: (t, k, v) => {
        if (k === 'innerHTML' || k === 'outerHTML') rec.push(id, k, String(v));
        else if (k === 'textContent') rec.push(id, 'text', escT(v));
        else if (k === 'placeholder' || k === 'title') rec.push(id, '@' + k, escT(v));
        store[k] = v; return true;
      },
    });
  }
  const canvasCtx = { font: '', measureText: (s) => ({ width: String(s).length * 7 }), fillText() {}, fillRect() {}, drawImage() {}, getImageData() { return { data: [] }; } };
  const doc = {
    els,
    getElementById: (id) => (els[id] = els[id] || makeEl(id)),
    querySelector: () => null, querySelectorAll: () => [],
    createElement: (tag) => (tag === 'canvas' ? { getContext: () => canvasCtx, width: 0, height: 0 } : makeEl('new-' + tag)),
    body: makeEl('body'), documentElement: makeEl('html'), head: makeEl('head'),
    addEventListener() {}, removeEventListener() {},
    write: (h) => rec.push('document', 'write', String(h)),
  };
  let title = '';
  Object.defineProperty(doc, 'title', { get: () => title, set: (v) => { title = String(v); rec.push('document', 'title', escT(v)); } });
  return doc;
}

const PRINT_TARGET = /^(printSheets)$/;
/* The functions that build only printed sheets (in the event's print language since i18n step 4). Their output is recorded as print. */
const PRINT_FUNCS = /^(rulesSheetHTML|runningOrderSheetHTML|knockoutBracketSheetHTML|groupBoardsBracketSheetHTML|projectedBracketSheetHTML|projectedTooBigSheetHTML|kbBracketSheetsHTML|kbSplitSheetsHTML|lineupSheetHTML|lineupCardHTML|lineupSegmentHTML|lineupMatchSheetHTML|emptyLineupSheetHTML|teamLineupSheetsHTML|knockoutLineupSheetsHTML|bpPlayersSheetsHTML|bpBoardsSheetHTML|bpSheetShell|popoutPrintSheetsHTML|formatDescriptionLines|teamsFormatDescriptionLines|rrAdvanceLine|koSheetChrome|mkoPageHTML|printQrBlockHTML)$/;

function makeApp(lang, dir, more) {
  const rec = { out: [], cur: '', push(id, how, html) { this.out.push({ id: this.cur + ' | ' + how + ' #' + id, html }); } };
  const app = loadApp(Object.assign({ lang, dir }, more));   // more: e.g. { ms: false } (an English browser: no BM tables yet)
  const doc = recordingDoc(rec);
  const win = {
    open: () => ({ document: { write: (h) => rec.push('popup', 'write', String(h)), close() {}, open() {} }, focus() {}, print() {}, close() {} }),
    print() {}, addEventListener() {}, removeEventListener() {}, location: { href: '', origin: 'https://app.test', pathname: '/app', search: '' },
    innerWidth: 1366, innerHeight: 768, scrollTo() {}, scrollY: 0, matchMedia: () => ({ matches: false, addEventListener() {} }), prompt() { return null; }, confirm() { return false; },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, screen: { width: 1366, height: 768 },
  };
  app.document = doc; app.window = win; app.requestAnimationFrame = () => {}; app.setTimeout = () => 0; app.clearTimeout = () => {};
  app.alert = () => {}; app.confirm = () => false; app.prompt = () => null;
  app.location = win.location; app.navigator = { clipboard: { writeText: () => ({ then() {} }) } };
  app.fetch = async () => ({ ok: true, status: 200, json: async () => ({}) });
  app.persist = () => {}; app.apiFetch = async () => ({ ok: true, status: 200, json: async () => ({}) });
  app.__org = { id: 'u1', name: 'Siti Aminah', email: 'siti@example.com', role: 'organizer', tier: 'basic', entryLimit: 64, viewerUrl: 'https://live.example.com' };
  run(app, 'currentOrganizer = __org');
  return { app, rec, doc };
}

const copy = (x) => JSON.parse(JSON.stringify(x));
const LIMIT = { timeout: 3000 };

/* The calls made for one event. Each is [label, code]; code runs with `state` set to a fresh copy of the event. */
function callsFor(st) {
  const t = st.data, calls = [];
  const add = (label, code) => calls.push([label, code]);
  for (let n = 1; n <= 7; n++) add('stage' + n, 'currentStage = ' + n + '; render(); renderSavedList(); renderOrganizerBar(); setCompactMenu(true); setCompactMenu(false)');
  if (st.phase === 'live' || st.phase === 'done') ['rr', 'knockout', 'knockoutLosers'].forEach((s) => add('popout ' + s, 'popoutMode = true; popoutSection = "' + s + '"; currentStage = 5; render(); popoutMode = false; document.body.classList.remove("mko-popout")'));
  /* round robin: the score box of the first and of a played match, no-show, positions, confirm, swap */
  (t.groups || []).slice(0, 1).forEach((g) => {
    const ms = [];
    g.entryIds.forEach((a, i) => g.entryIds.forEach((b, j) => { if (i < j) ms.push([a, b]); }));
    const played = ms.find(([a, b]) => g.scores && Object.keys(g.scores).some((k) => k.includes(a) && k.includes(b)));
    [ms[0], played].filter(Boolean).forEach(([a, b], k) => add('promptScore ' + k, 'promptScore(' + JSON.stringify(g.id) + ',' + JSON.stringify(a) + ',' + JSON.stringify(b) + ', "A", "B")'));
    if (played) add('clearGroupResult', 'clearGroupResult(' + JSON.stringify(g.id) + ',' + JSON.stringify(played[0]) + ',' + JSON.stringify(played[1]) + ', "A", "B")');
    ['openNoShowPicker', 'openPositionOverridePicker', 'openConfirmChartModal', 'lockedScoreClick', 'toggleConfirm', 'openExpandedPreview'].forEach((fn) => add(fn, fn + '(' + JSON.stringify(g.id) + ')'));
    add('openSwapPicker', 'openSwapPicker(' + JSON.stringify(g.entryIds[0]) + ')');
    add('markGroupNoShow', 'markGroupNoShow(' + JSON.stringify(g.id) + ',' + JSON.stringify(g.entryIds[1]) + '); currentStage = 5; render(); undoGroupNoShow(' + JSON.stringify(g.id) + ',' + JSON.stringify(g.entryIds[1]) + ')');
  });
  /* knockout brackets: the score box of the first open and the first played match, no-show, clear result, start round */
  const brs = [['knockout', t.knockout], ['knockoutLosers', t.knockoutLosers]].concat((t.pods || []).slice(0, 1).map((p) => ['pod:' + p.id, p.bracket]));
  brs.forEach(([key, b]) => {
    if (!b || !b.rounds) return;
    const find = (pred) => { for (let ri = 0; ri < b.rounds.length; ri++) for (let mi = 0; mi < b.rounds[ri].length; mi++) if (pred(b.rounds[ri][mi], ri)) return [ri, mi]; return null; };
    const open = find((m) => m.aEntryId && m.bEntryId && !m.winnerId && !m.bye && !m.void);
    const done = find((m, ri) => m.winnerId && !m.bye && ri < b.rounds.length - 1);
    const fin = find((m, ri) => m.winnerId && ri === b.rounds.length - 1);
    const voided = find((m) => m.void);
    const arg = (p) => JSON.stringify(key) + ',' + p[0] + ',' + p[1];
    if (open) { add('ko score open ' + key, 'koMatchScoreModal(' + arg(open) + ')'); add('ko no-show ' + key, 'openKoNoShowPicker(' + arg(open) + ')'); add('bpToggleCall ' + key, 'bpToggleCall(' + arg(open) + '); currentStage = 5; render()'); }
    if (done) { add('ko score played ' + key, 'koMatchScoreModal(' + arg(done) + ')'); add('ko clear ' + key, 'koClearResult(' + arg(done) + ')'); }
    if (fin) add('ko clear final ' + key, 'koClearResult(' + arg(fin) + ')');
    if (voided) { add('ko score void ' + key, 'koMatchScoreModal(' + arg(voided) + ')'); add('ko reverse void ' + key, 'reverseKnockoutVoid(' + arg(voided) + ')'); }
  });
  /* entries: withdraw (refused once playing), the entry-limit box, lowering the number of entries */
  const e0 = t.entriesList.find((e) => !e.withdrawn);
  if (e0) { add('withdrawEntry', 'withdrawEntry(' + JSON.stringify(e0.id) + ')'); add('withdrawEntryPreDraw', 'withdrawEntryPreDraw(' + JSON.stringify(e0.id) + ')'); add('podsMoveModal', 'typeof podsMoveModal==="function" && state.pods && state.pods.length ? podsMoveModal(' + JSON.stringify(e0.id) + ') : 0'); add('podsPlaceModal', 'podsPlaceModal(' + JSON.stringify(e0.id) + ')'); }
  add('entriesInPlayModal', 'entriesInPlayModal(state, 2, state.entriesList.filter(function(e){return !e.withdrawn;}).slice(2, 4).map(function(e){return e.id;}))');
  /* the common boxes */
  ['startAllGames()', 'openSchedulingModal()', 'openLogIncidentModal()', 'openChangePassword()', 'finalizeResults()', 'finalizedBlockModal("changed")', 'finalizedBlockModal("renamed")', 'finalizedBlockModal("deleted")',
    'staleBlockModal()', 'showEntryLimitModal()', 'popupBlockedModal()', 'openLineupSheetsModal()', 'blockForUnresolvedTies()', 'generateKnockoutFromRRChecked()', 'regenerateKnockoutFromRR()', 'confirmShuffleGroups()',
    'regenerateKnockoutBracket()', 'podsDrawClick()', 'podsConfirmAllClick()', 'podsWithdrawUncheckedClick()', 'podsRemoveGoneClick()', 'sampleBlockModal("publish it")', 'rosterLockedModal.length === 3 ? rosterLockedModal("The groups can no longer be redrawn", ["A","B"], "a new draw") : rosterLockedModal("redraw", ["A","B"])',
    'knockoutDrawBlockModal({groups:["A","B"]})', 'knockoutDrawBlockModal({none:true})', 'openInNewWindow("rr")', 'popoutPrint()', 'saveStage2()', 'bulkConfirmSelected()', 'confirmAllCharts()', 'printReadyLineups()',
    'renameTournament(state.id, {stopPropagation(){}})', 'deleteTournament(state.id, {stopPropagation(){}})', 'showLockedToast()', 'showInfoToast("x")', 'setPublished(true); currentStage = 5; render()', 'setPublished(false); currentStage = 4; render()',
    'teamSegDraft = null; currentStage = 2; formSectionCollapsed = {}; render(); formSectionCollapsed = { format:true, branding:true, rules:true }',
    'state.eventCreation.advancedMode = !state.eventCreation.advancedMode; currentStage = 2; formSectionCollapsed = {}; render(); formSectionCollapsed = { format:true, branding:true, rules:true }',
    'stage3ViewMode = "flat"; currentStage = 3; render(); stage3ViewMode = "grouped"',
    '["saving","error","failed","ok","locked","finalizing","gone",""].forEach(function(s){ setSaveStatus(s); })', 'markStale(state.id); render(); staleIds.clear()',
    'state.printSettings.koPaperSize = "A4"; var m = koPrintModels(state); var a = koPaperAdvice(m); if(!a.none && !a.legible){ openKoPaperDialog(a, function(){}); }',
    'state.printSettings.koPaperChoice = { mode: "split", paper: "A4", rec: koPaperAdvice(koPrintModels(state)).rec }; currentStage = 4; render()',
    'state.printSettings.koPaperChoice = { mode: "shrink", paper: "A4", rec: koPaperAdvice(koPrintModels(state)).rec }; currentStage = 7; render()',
  ].forEach((code) => add(code.replace(/\(.*$/s, '').slice(0, 40) + ' ' + code.length, code));
  /* printing (recorded as print) */
  add('print doFinalPrint', 'doFinalPrint()');
  return calls;
}

/* The screens without an open event: the welcome screen and Get started card, the sample event on each step. */
const GLOBAL_CALLS = [
  ['welcome getstarted', 'state = null; tournamentsCache = {}; currentStage = 1; render(); renderSavedList(); renderOrganizerBar()'],
  ['welcome hidden', 'state = null; tournamentsCache = {}; window.localStorage = { getItem: function(){ return "1"; }, setItem(){}, removeItem(){} }; render(); window.localStorage = { getItem: function(){ return null; }, setItem(){}, removeItem(){} }'],
  ['welcome saved', 'state = null; tournamentsCache = { a: __any }; render(); renderSavedList(); tournamentsCache = {}'],
  ['new tournament', 'tournamentsCache = {}; startNewTournament(); renderSavedList()'],
  ['sample', 'state = null; tournamentsCache = {}; openSampleEvent(); for (var n = 1; n <= 7; n++){ currentStage = n; render(); } publishResultsNow(); finalizeResults(); openInNewWindow("rr"); closeSample()'],
  ['public mode bar', 'currentOrganizer = { publicMode: true, name: "x" }; renderOrganizerBar(); currentOrganizer = __org'],
  ['pro bar', 'currentOrganizer = { name: "Siti", tier: "pro", role: "admin" }; renderOrganizerBar(); currentOrganizer = __org'],
  ['device gate', '["none","rotate-phone","rotate-tablet","phone-landscape"].forEach(function(s){ try{ applyDeviceGate(s); }catch(e){} })'],
];

let STATES = null;
function renderAppScreens(opts) {
  opts = opts || {};
  const { app, rec } = makeApp(opts.lang || 'en', opts.dir);
  STATES = STATES || buildStates();
  const exec = (code) => vm.runInContext(code, app, LIMIT);
  const one = (label, code) => {
    rec.cur = label;
    try { exec(code); } catch (e) { rec.push('error', 'throw', escT(e && e.message)); }
    try { exec('closeModal(); popoutMode = false; adminState.view = null; adminEditing = null;'); } catch (e) { /* nothing */ }
  };
  STATES.forEach((st) => {
    callsFor(st).forEach(([label, code]) => {
      app.__t = copy(st.data);
      if (opts.sheetLang) app.__t.printSettings.sheetLang = opts.sheetLang;   // i18n step 4: the event's Printed sheets language
      exec('state = __t; tournamentsCache = {}; tournamentsCache[state.id] = state; lockedIds.clear(); if(state.finalized) lockedIds.add(state.id); staleIds.clear(); popoutMode = false; teamSegDraft = null; currentStage = 1;');
      one(st.id + ' | ' + label, code);
    });
  });
  app.__any = copy(STATES[0].data);
  GLOBAL_CALLS.forEach(([label, code]) => one('global | ' + label, code));
  return rec.out;
}

/* The visible text of an HTML string (tags out, entities decoded), for the English scan. */
function visibleText(html) {
  return String(html).replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*\s(?:aria-label|title|placeholder)="([^"]*)"[^>]*>/g, (m, a) => ' ' + a + ' ' + m.replace(/"[^"]*"/g, '""'))
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&rsquo;|&lsquo;/g, '’').replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&hellip;/g, '…').replace(/&mdash;/g, '—').replace(/&ndash;/g, '–').replace(/&middot;/g, '·').replace(/&rarr;/g, '→').replace(/&times;/g, '×').replace(/&#\d+;|&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
/* The English output with the two documented step-3 additions taken out, for the comparison with the golden file made
   before step 3: the "Bahasa: EN | BM" row at the end of the compact menu, and the ?lang= the viewer links carry. */
function normalizeEnglish(html) {
  return String(html).replace(/<div class="compact-menu-lang">[\s\S]*?<\/div><\/div><\/div>/g, '').replace(/\?lang=en(?=")/g, '')
    .replace(/<div class="sheet-lang-row">[\s\S]*?<\/div>/g, '');   // i18n step 4: the "Printed sheets language" row of the print settings
}
const isPrint = (id) => /\| print |#printSheets$|#popup$/.test(id);

module.exports = { renderAppScreens, makeApp, visibleText, isPrint, normalizeEnglish, PRINT_FUNCS, buildStates };

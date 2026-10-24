/* Every printed sheet the organiser app makes, for the events of app-states.js, in one print language (i18n step 4).
     renderPrintSheets({ lang, sheetLang, dir, drop }) -> [{ id, html }]
       lang: the screen language; sheetLang: every event's Printed sheets language ('en' | 'ms'); drop: true removes the
       field instead (an event saved before step 4); dir: another copy of the app (tests/golden/print-en.json is made
       from the app at HEAD before step 4 with GOLDEN_PRINT_DIR).
   Each call either returns the sheets (recorded as "<event> | <label> | return") or prints them into #printSheets (the
   recording document of tests/lib/app-screens.js keeps those writes: "<event> | <label> | innerHTML #printSheets").
   The calls: the print pack (doFinalPrint), each print builder on its own (rules, running order, charts, brackets,
   projected brackets, the "too many" placeholder sheet, Group Boards charts, Players A-Z and Boards sheets, lineup
   sheets: per fixture, the ready ones, the empty emergency sheet), the full-page window's print, and the paper choices
   (a bracket split over A4 sheets, shrunk on A4). */
const vm = require('vm');
const { makeApp } = require('./app-screens');
const { buildStates } = require('./app-states');

const copy = (x) => JSON.parse(JSON.stringify(x));
/* in the print language when the app has one (before step 4 there is no ddWithLang: English) */
const inPrint = (expr) => '(typeof ddWithLang==="function" ? ddWithLang(ddPrintLang(), function(){ return ' + expr + '; }) : (' + expr + '))';

function callsFor(st) {
  const t = st.data, calls = [];
  const ret = (label, expr) => calls.push([label, expr, true]);
  const act = (label, code) => calls.push([label, code, false]);
  act('pack', 'doFinalPrint()');
  ret('rules', 'rulesSheetHTML()');
  ret('formatLines', 'JSON.stringify(' + inPrint('formatDescriptionLines(state)') + ')');
  if ((t.groups || []).some((g) => g.confirmed)) {
    ret('runningOrder', 'runningOrderSheetHTML(state.groups.filter(function(g){ return g.confirmed; }))');
    ret('charts', 'state.groups.filter(function(g){ return g.confirmed; }).map(function(g){ return chartSheetHTML(g, true); }).join("")');
    act('popout rr', 'popoutMode = true; popoutSection = "rr"; popoutPrint(); popoutMode = false');
  }
  if (t.knockout) {
    ret('bracket', 'knockoutBracketSheetHTML(state.knockout)');
    if (t.format.formatType !== 'podknockout') act('popout knockout', 'popoutMode = true; popoutSection = "knockout"; popoutPrint(); popoutMode = false');
  }
  if (t.knockoutLosers) { ret('plate', 'knockoutBracketSheetHTML(state.knockoutLosers)'); act('popout plate', 'popoutMode = true; popoutSection = "knockoutLosers"; popoutPrint(); popoutMode = false'); }
  if (t.format.formatType === 'rrknockout' && !t.knockout) {
    ret('projected', 'projectedPrintList(state).map(function(x){ return projectedBracketSheetHTML(x.entries, x.title); }).join("")');
    ret('tooBig', inPrint('projectedTooBigSheetHTML("Main bracket (projected)", tooManyForBracketMessage(200, typeof ddWithLang==="function" ? "main" : "the main bracket") + (state.format.losersPool ? (typeof T==="function" && T("pr.proj.plateToo")!=="pr.proj.plateToo" ? T("pr.proj.plateToo") : " The Plate pool is not projected either: the real draw makes neither bracket until this is fixed.") : ""), tooManyMainHint(state))'));
  }
  if (t.format.formatType === 'podknockout' && (t.pods || []).length) {
    ret('players', 'bpPlayersSheetsHTML(state)');
    ret('boards', 'bpBoardsSheetHTML(state)');
    ret('group0', inPrint('knockoutBracketSheetHTML(state.pods[0].bracket, { podLegs:true, stage: "x", qrPath:"bracket/group-A" })'));
  }
  if (t.eventCreation.competitionUnit === 'Teams') {
    ret('lineups', 'teamLineupSheetsHTML() + knockoutLineupSheetsHTML()');
    ret('emptyLineup', 'emptyLineupSheetHTML()');
    act('printEmpty', 'printEmptyLineups(2)');
    act('printReady', 'printReadyLineups()');
    act('printOne', 'var x = ' + inPrint('lineupReadyMatches(state, true)[0]') + '; if(x) printLineupFor(x.key)');
  }
  /* the paper choices of a bracket that is not legible on A4 */
  if (t.knockout && t.format.formatType !== 'podknockout' && st.id.indexOf('64') >= 0) {
    ['split', 'shrink'].forEach((mode) => ret('paper ' + mode, '(function(){ var a = koPaperAdvice(koPrintModels(state)); state.printSettings.koPaperChoice = { mode: "' + mode + '", paper: "A4", rec: a.rec }; return knockoutBracketSheetHTML(state.knockout); })()'));
    ret('paper A3', '(function(){ state.printSettings.koPaperSize = "A3"; delete state.printSettings.koPaperChoice; return knockoutBracketSheetHTML(state.knockout); })()');
  }
  return calls;
}

function renderPrintSheets(opts) {
  opts = opts || {};
  const { app, rec } = makeApp(opts.lang || 'en', opts.dir);
  const exec = (code) => vm.runInContext(code, app, { timeout: 5000 });
  const states = opts.states || buildStates();
  states.forEach((st) => {
    if (st.phase === 'setup') return;   // nothing is printed before the draw
    callsFor(st).forEach(([label, code, returns]) => {
      app.__t = copy(st.data);
      if (opts.drop) delete app.__t.printSettings.sheetLang;
      else if (opts.sheetLang) app.__t.printSettings.sheetLang = opts.sheetLang;
      exec('state = __t; tournamentsCache = {}; tournamentsCache[state.id] = state; lockedIds.clear(); if(state.finalized) lockedIds.add(state.id); staleIds.clear(); popoutMode = false; currentStage = 4;');
      rec.cur = st.id + ' | ' + label;
      try {
        const out = exec(code);
        if (returns) rec.push('return', 'value', String(out == null ? '' : out));
      } catch (e) { rec.push('error', 'throw', String(e && e.message)); }
      try { exec('closeModal(); popoutMode = false;'); } catch (e) { /* nothing */ }
    });
  });
  return rec.out;
}

module.exports = { renderPrintSheets, callsFor };

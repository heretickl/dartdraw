// i18n step 4: the language of PRINTED SHEETS (EN | BM), a setting of each event.
//   - the string tables: i18n/print.en.js and i18n/print.ms.js have the same keys and {placeholders}, nothing empty, BM one
//     form, and follow the glossary (the proofread lineup words, Bil., lwn, sama mata, no forbidden words)
//   - the setting: printSettings.sheetLang is sanitised ('en' | 'ms', anything else 'en', a missing one stays missing and
//     prints English), defaults to the organiser's screen language when an event is made, is kept by Duplicate, is locked
//     on a finalized event like the other print settings, and is shown in every print settings card (steps 4 and 7)
//   - independence: changing the screen language never changes the print language, and the sheets of an event print the
//     same whatever language the screen is in
//   - no English left: every printed sheet of every event (Singles, Doubles, Teams x Knockout, Round robin -> Knockout,
//     Group Boards, Round robin; drawn, live, done, finalized; lineup and empty sheets, projected brackets, Group Boards
//     charts, Players A-Z and Boards, split and shrunk brackets) printed in BM shows no English table word or phrase
//   - English unchanged: with English sheets (and for an event saved before step 4) every sheet is byte-identical to the
//     app at HEAD before step 4 (tests/golden/print-en.json; tests/golden/app-en.json and existing-formats.json cover the rest)
//   - bracket-print.js: BM round labels fit their box at A4 and A3 for 8 to 128 slots (shrunk, never under 4.6 pt, two lines
//     before any short form, no English short forms), the WO / NO-SHOW marks and exits never widen the layout, the paper
//     recommendation is the same in English and BM, the print font covers every BM character
//   - placeholders are escaped in BM sheets too (XSS harness)
// UPDATE_GOLDEN=1 GOLDEN_PRINT_DIR=<a copy of the app at HEAD before step 4> rewrites tests/golden/print-en.json.
process.env.TZ = 'Asia/Kuala_Lumpur';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), crypto = require('crypto'), vm = require('vm');
const { loadApp, run } = require('./lib/load-app');
const { makeApp, visibleText, buildStates } = require('./lib/app-screens');
const { renderPrintSheets } = require('./lib/print-sheets');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const PEN = require('../i18n/print.en.js'), PMS = require('../i18n/print.ms.js');
const AEN = require('../i18n/app.en.js'), AMS = require('../i18n/app.ms.js'), RMS = require('../i18n/render.ms.js');
const REN = (() => { const c = { document: { createElement: () => ({ getContext: () => ({}) }) } }; vm.createContext(c); vm.runInContext(read('render.js') + ';this.__t = DD_RENDER_EN;', c); return c.__t; })();
const forms = (v) => (v && typeof v === 'object' ? [v.one, v.other] : [v]);
const holes = (v) => [...new Set(forms(v).join(' ').match(/\{\w+\}/g) || [])].sort();

// ---------- the tables ----------
test('tables: print.en.js and print.ms.js have the same keys and {placeholders}, nothing empty, BM one form, the same markup', () => {
  assert.deepEqual(Object.keys(PMS).sort(), Object.keys(PEN).sort());
  Object.keys(PEN).forEach((k) => {
    forms(PEN[k]).forEach((s) => assert.ok(typeof s === 'string' && s.length, 'en ' + k));
    assert.ok(typeof PMS[k] === 'string' && PMS[k].trim().length, 'ms ' + k + ' is one non-empty string');
    assert.deepEqual(holes(PMS[k]), holes(PEN[k]), k + ': the same {placeholders}');
    const tags = (s) => (s.match(/<\/?[a-z]+\b|&(?:amp|ldquo|rdquo|nbsp|mdash);/g) || []).sort();
    assert.deepEqual(tags(PMS[k]), tags(forms(PEN[k])[0]), k + ': the same tags and entities');
    assert.ok(!(k in AEN) && !(k in REN), k + ' does not shadow a key of the app or render.js tables');
  });
  // deliberately the same in both: names of the languages, patterns and kept words
  const same = Object.keys(PEN).filter((k) => PMS[k] === forms(PEN[k]).slice(-1)[0]);
  assert.deepEqual(same.sort(), ['pr.count', 'pr.lu.board', 'pr.ro.board', 'pr.rules.format', 'pr.set.en', 'pr.set.ms', 'pr.sub'].sort());
});
test('tables: BM printed words follow the glossary and the proofread print captures', () => {
  const all = Object.values(PMS).join(' \n ');
  ['bagan', 'papan', 'mengundi', 'dua belah', 'kaki penaja', 'bersemuka', 'pemarkahan', 'kamu', 'awak', 'tidak pernah', 'penyertaan', 'S/Akhir', 'SA', 'SeA', 'QF', 'SF']
    .forEach((w) => assert.ok(!new RegExp('(^|[^\\w/])' + w.replace('/', '\\/') + '\\b', 'i').test(all), w));
  // the words the BM proofread decided for paper (docs/design/i18n-preview/src/strings-ms.js, layout-check #10)
  assert.equal(PMS['pr.lu.gameNo'], 'Bil.'); assert.equal(PMS['pr.lu.fixture'], 'Perlawanan'); assert.equal(PMS['pr.lu.group'], 'Kumpulan');
  assert.equal(PMS['pr.lu.total'], 'JUMLAH MATA'); assert.equal(PMS['pr.lu.sig'], 'Tandatangan Kapten/Pengurus'); assert.equal(PMS['pr.lu.team'], 'Nama Pasukan');
  assert.equal(PMS['pr.rules.title'], 'PERATURAN &amp; FORMAT'); assert.equal(PMS['pr.rules.read'], 'Sila baca sebelum bermain'); assert.equal(PMS['pr.rules.tb'], 'Susunan pemecah seri');
  assert.equal(PMS['pr.ro.title'], 'SUSUNAN PERLAWANAN'); assert.equal(PMS['pr.ko.stage'], 'Peringkat Kalah Mati'); assert.equal(PMS['pr.proj.stage'], undefined);   /* the printed sheets never say projected / unjuran (2026-10-29) */
  assert.equal(PMS['pr.lu.vs'], 'lwn {name}'); assert.equal(PMS['pr.kb.short.of'], 'P{n}', 'the approved short form (glossary: P16)');
  ['quarter', 'semi', 'final'].forEach((k) => assert.equal(PMS['pr.kb.short.' + k], RMS['r.round.' + k], 'no BM abbreviation for ' + k));
  assert.equal(AMS['seg.tbName'].toUpperCase(), 'PEMECAH SERI'); assert.equal(AMS['credit'], 'Dijana dengan DartDraw'); assert.equal(AMS['seg.numbered'].replace('{type}', AMS['seg.type.singles']).replace('{n}', 1), 'Perseorangan 1');
});

// ---------- the setting ----------
test('setting: printSettings.sheetLang is sanitised: en | ms kept, anything else en, a missing one stays missing (English)', () => {
  const { sanitizeTournamentData } = require('../tournament-sanitize.js');
  const ev = (v) => { const d = { printSettings: { koPaperSize: 'A4' } }; if (v !== undefined) d.printSettings.sheetLang = v; return sanitizeTournamentData(d).printSettings; };
  assert.equal(ev('ms').sheetLang, 'ms'); assert.equal(ev('en').sheetLang, 'en');
  ['MS', 'fr', '', null, 5, { x: 1 }, ['ms'], '<img src=x onerror=alert(1)>'].forEach((v) => assert.equal(ev(v).sheetLang, 'en', JSON.stringify(v)));
  assert.ok(!('sheetLang' in ev(undefined)));
  const app = loadApp();
  app.__d = { printSettings: { sheetLang: 'xx' } }; assert.equal(run(app, 'ddPrintLang(__d)'), 'en');
  app.__d = { printSettings: {} }; assert.equal(run(app, 'ddPrintLang(__d)'), 'en', 'an event saved before step 4 prints in English');
  app.__d = { printSettings: { sheetLang: 'ms' } }; assert.equal(run(app, 'ddPrintLang(__d)'), 'ms');
  assert.equal(run(app, 'state = null; ddPrintLang()'), 'en', 'no open event: English');
});
test('setting: a new event gets the screen language (also the sample event); Duplicate keeps it', async () => {
  assert.equal(run(loadApp(), 'blankTournament().printSettings.sheetLang'), 'en');
  assert.equal(run(loadApp({ lang: 'ms' }), 'blankTournament().printSettings.sheetLang'), 'ms');
  const { app } = makeApp('en');
  const puts = [];
  app.apiFetch = async (url, o) => { puts.push(JSON.parse(o.body)); return { ok: true, status: 200, json: async () => ({ updated_at: 'x' }) }; };
  app.openTournament = async () => {};
  app.__t = run(app, 'blankTournament()'); run(app, 'state = __t; state.printSettings.sheetLang = "ms"; tournamentsCache[state.id] = state');
  await run(app, 'duplicateTournament(state.id, {stopPropagation(){}})');
  assert.equal(puts.length, 1); assert.equal(puts[0].data.printSettings.sheetLang, 'ms');
});
test('setting: shown with the print settings of steps 4 and 7 in every format, changes the event and the print previews, locked once finalized', () => {
  const states = buildStates();
  const pick = (id) => states.find((s) => s.id === id);
  ['Singles/rrknockout/drawn', 'Doubles/knockout/drawn', 'Teams/podknockout/drawn', 'Singles/roundrobin/done', 'Teams/rrknockout/done', 'Doubles/podknockout/done'].forEach((id) => {
    const { app } = makeApp('en');
    app.__t = JSON.parse(JSON.stringify(pick(id).data));
    run(app, 'state = __t; lockedIds.clear()');
    [4, 7].forEach((n) => {
      const html = run(app, 'stage' + n + '()');
      const m = /<div class="sheet-lang-row"><label for="sheetLangSel">Printed sheets language<\/label><select id="sheetLangSel" onchange="setSheetLang\(this.value\)"><option value="en" lang="en" selected>English<\/option><option value="ms" lang="ms">Bahasa Malaysia<\/option><\/select><span class="hint">[^<]+<\/span><\/div>/.exec(html);
      assert.ok(m, id + ' step ' + n + ' shows the setting');
    });
  });
  // changing it: saved, and the step 4 print preview is redrawn in BM while the screen stays English
  const { app } = makeApp('en');
  let saved = 0; app.persist = () => { saved++; };
  app.__t = JSON.parse(JSON.stringify(pick('Singles/rrknockout/drawn').data));
  run(app, 'state = __t; lockedIds.clear(); currentStage = 4');
  assert.match(run(app, 'stage4()'), /ENTRY<\/div>/);
  run(app, 'setSheetLang("ms")');
  assert.equal(run(app, 'state.printSettings.sheetLang'), 'ms'); assert.equal(saved, 1);
  const s4 = run(app, 'stage4()');
  assert.match(s4, /PESERTA<\/div>/, 'the preview prints in BM'); assert.match(s4, /Confirm &amp; Print Bracket|Print bracket pack|Print pack|Print/, 'the screen stays English');
  assert.equal(run(app, 'ddUiLang()'), 'en');
  run(app, 'setSheetLang("de")'); assert.equal(run(app, 'state.printSettings.sheetLang'), 'ms', 'only en | ms');
  // a finalized event: the setting is refused and its box is locked like the other print settings
  run(app, 'state.finalized = { at: "2026-11-07T14:30:00.000Z", by: "org" }; lockedIds.add(state.id)');
  saved = 0; run(app, 'setSheetLang("en")');
  assert.equal(run(app, 'state.printSettings.sheetLang'), 'ms'); assert.equal(saved, 0);
  assert.equal(run(app, 'finalizedActionAllowed("setSheetLang(this.value)")'), false);
  assert.equal(run(app, 'finalizedActionAllowed("toggleRulesSheet(this.checked)")'), false, 'the same as the other print settings');
});
test('independence: switching the screen language never changes the print language, and the sheets do not depend on the screen', () => {
  const { app } = makeApp('ms');
  const st = buildStates().find((s) => s.id === 'Teams/rrknockout/done');
  app.__t = JSON.parse(JSON.stringify(st.data)); run(app, 'state = __t; state.printSettings.sheetLang = "en"');
  const before = run(app, 'rulesSheetHTML() + teamLineupSheetsHTML()');
  assert.match(before, /RULES &amp; FORMAT/); assert.match(before, /TOTAL POINTS/);
  run(app, 'ddSetLang("en", {quiet:true}); ddSetLang("ms", {quiet:true})');
  assert.equal(run(app, 'state.printSettings.sheetLang'), 'en');
  assert.equal(run(app, 'rulesSheetHTML() + teamLineupSheetsHTML()'), before);
  run(app, 'state.printSettings.sheetLang = "ms"');
  const bm = run(app, 'rulesSheetHTML()');
  run(app, 'ddSetLang("en", {quiet:true})');
  assert.equal(run(app, 'rulesSheetHTML()'), bm, 'BM sheets with English on screen');
  assert.match(bm, /PERATURAN &amp; FORMAT/);
  assert.equal(run(app, 'T("m.print")'), 'Print', 'and the screen is English again after printing');
});

// ---------- every printed sheet ----------
let BM = null, EN = null;
const bmOut = () => BM || (BM = renderPrintSheets({ lang: 'en', sheetLang: 'ms' }));   // English on screen, BM on paper
const enOut = () => EN || (EN = renderPrintSheets({ lang: 'ms', sheetLang: 'en' }));   // BM on screen, English on paper
const isSheet = (o) => /#return$|#printSheets$/.test(o.id);
function organiserText() {
  const out = new Set(['Kejohanan Dart Terbuka Selangor 2026', 'live.example.com']);
  buildStates().forEach((s) => { const d = s.data; out.add(d.eventCreation.tournamentName); out.add(d.eventCreation.eventName); d.entriesList.forEach((e) => { out.add(e.name); if (e.org) out.add(e.org); }); });
  return [...out].filter(Boolean).sort((a, b) => b.length - a.length);
}
/* darts words BM keeps in English (glossary 3), codes and names */
const KEPT = new Set('Group Boards bracket Bracket board Board leg legs Leg round Round robin Robin bye BYE seed Plate walkover DartDraw PDF QR TB H2H Format Edit Logo OK Kelab ABC Bd'.split(' '));
const wordsOf = (list) => new Set(list.join(' ').replace(/<[^>]+>|&\w+;|\{\w+\}/g, ' ').split(/[^A-Za-z]+/).filter((w) => w.length >= 3));
test('no English left: every printed sheet of every event, printed in BM (English on screen), shows no English table word or phrase', () => {
  const out = bmOut().filter(isSheet);
  assert.ok(out.length > 400, out.length + ' sheet outputs');
  assert.deepEqual(bmOut().filter((o) => /#error$/.test(o.id)).map((o) => o.id + ' ' + o.html).slice(0, 5), [], 'no call failed');
  const names = organiserText();
  const strip = (t) => names.reduce((s, n) => s.split(n).join(' • '), t);
  const enAll = Object.values(AEN).concat(Object.values(REN), Object.values(PEN)).flatMap(forms);
  const msVals = Object.values(AMS).concat(Object.values(RMS), Object.values(PMS));
  const msAll = msVals.join('\n'), msWords = wordsOf(msVals);
  const enWords = [...wordsOf(enAll)].filter((w) => !msWords.has(w) && !KEPT.has(w));
  const enPhrases = enAll.map((v) => v.replace(/<[^>]+>|&\w+;|\{\w+\}/g, ' ')).flatMap((v) => v.split(/\s{2,}|[.:;!?—]\s/)).map((s) => s.trim())
    .filter((s) => s.split(/\s+/).length >= 3 && s.split(/\s+/).some((w) => /[a-z]{3}/.test(w) && !KEPT.has(w))).filter((s) => !msAll.includes(s));
  const bad = [], seen = new Set();
  out.forEach((o) => {
    const t = strip(visibleText(o.html).replace(/\b[\w.-]+\.(?:com|my|app)(?:\/\S*)?/g, ' URL '));
    if (seen.has(t)) return; seen.add(t);
    enWords.forEach((w) => { const i = t.search(new RegExp('\\b' + w + '\\b')); if (i >= 0) bad.push(o.id + ': "' + w + '" in …' + t.slice(Math.max(0, i - 40), i + 40)); });
    enPhrases.forEach((p) => { if (t.includes(p)) bad.push(o.id + ': "' + p + '"'); });
    if (/\{\w+\}|undefined|NaN/.test(t)) bad.push(o.id + ': a placeholder or undefined left: ' + t.match(/.{0,30}(\{\w+\}|undefined|NaN).{0,30}/)[0]);
  });
  assert.deepEqual([...new Set(bad)].slice(0, 15), [], 'English on a BM sheet');
  // and the BM words are there, from every kind of sheet
  const all = out.map((o) => visibleText(o.html)).join('\n');
  ['PERATURAN & FORMAT', 'Sila baca sebelum bermain', 'Susunan pemecah seri', 'Keputusan pertemuan', 'SUSUNAN PERLAWANAN', 'Susunan induk perlawanan — mengikut board', '1 lwn 2',
    'Perseorangan Terbuka', 'Beregu Terbuka', 'Berpasukan Terbuka', 'Perseorangan Wanita', '07/11/2026', 'PESERTA', 'MATA', 'KED.', 'KUMPULAN A', 'Perlawanan 1', 'Marker', 'Mata: Menang 1 · Kalah 0',
    'Keputusan langsung', 'Imbas, atau layari', 'Dijana dengan DartDraw', 'Peringkat Kalah Mati', 'Undian 16 slot', 'Separuh akhir', 'Suku akhir', 'Akhir', 'JUARA', 'BRACKET', 'BRACKET UTAMA', 'SAINGAN PLATE',
    'tiada undian', 'Lakukan ini sebelum undian kalah mati dibuat.',
    'Bil.', 'Perlawanan', 'Nama Pasukan', 'JUMLAH MATA', 'PEMECAH SERI', 'Tandatangan Kapten/Pengurus', 'PERSEORANGAN 1', 'BEREGU 1', 'BEREMPAT 1', 'Mata', 'lwn ',
    'PEMAIN A–Z', 'Cari kumpulan dan board anda', 'Kumpulan mengikut susunan bermain', 'Bracket 4 slot', 'Pemenang', 'PERINGKAT AKHIR', 'Seksyen L1', 'Helaian Akhir', 'ke Akhir', 'Nombor pada sambungan bracket',
    'Sistem mata peringkat kumpulan', 'Mara ke kalah mati', 'diberi seed mengikut kedudukan akhir dalam kumpulan', 'Setiap perlawanan mempunyai', 'Format: Kalah mati — penyingkiran tunggal.'].forEach((w) => assert.ok(all.includes(w), 'printed in BM: ' + w));
});
test('the sheets do not depend on the screen language: BM sheets are byte-identical with English or BM on screen', () => {
  const sh = (out) => out.filter(isSheet);
  const a = sh(bmOut()), b = sh(renderPrintSheets({ lang: 'ms', sheetLang: 'ms' }));
  assert.deepEqual(b.map((o) => o.id), a.map((o) => o.id));
  const m = new Map(a.map((o) => [o.id, o.html]));
  assert.deepEqual(b.filter((o) => m.get(o.id) !== o.html).map((o) => o.id), []);
});

test('lineup sheets in BM: a long round name (Board box) and "lwn <team>" (Fixture box) wrap onto two lines instead of being cut; English unchanged', () => {
  const st = buildStates().find((s) => s.id === 'Teams/knockout/live');
  const html = (sheetLang) => { const { app } = makeApp('en'); app.__t = JSON.parse(JSON.stringify(st.data)); run(app, 'state = __t; state.printSettings.sheetLang = "' + sheetLang + '"'); return run(app, 'knockoutLineupSheetsHTML()'); };
  const bm = html('ms'), en = html('en');
  assert.match(bm, /<div class="bar">Board<\/div><div class="box two">Pusingan 16 terakhir<\/div>/);
  assert.match(bm, /<div class="bar">Perlawanan<\/div><div class="box two">lwn Ipoh Arrows \d+<\/div>/);
  assert.match(bm, /<div class="bar">Bil\.<\/div><div class="box">\d+<\/div>/);
  assert.ok(!/box two/.test(en), 'English: one line, as before');
  assert.match(en, /<div class="bar">Fixture<\/div><div class="box">vs Ipoh Arrows \d+<\/div>/);
});

// ---------- English unchanged ----------
const GOLDEN = path.join(__dirname, 'golden', 'print-en.json');
function goldenOf(out) {
  const g = {};
  out.forEach((o) => { (g[o.id] = g[o.id] || []).push(o.html); });
  const r = {};
  Object.keys(g).sort().forEach((k) => { r[k] = crypto.createHash('sha1').update(g[k].join('\n\u0000')).digest('hex').slice(0, 12); });
  return r;
}
test('English unchanged: with English sheets every printed sheet is byte-identical to the app before step 4 (and for an event saved before step 4)', () => {
  if (process.env.UPDATE_GOLDEN && process.env.GOLDEN_PRINT_DIR) {
    fs.writeFileSync(GOLDEN, JSON.stringify({ note: 'Printed sheets of the app before i18n step 4 (HEAD 4680ca9), English, per call: tests/lib/print-sheets.js.', calls: goldenOf(renderPrintSheets({ lang: 'en', dir: process.env.GOLDEN_PRINT_DIR }).filter(isSheet)) }, null, 0).replace(/,"/g, ',\n"') + '\n');
  }
  const want = JSON.parse(fs.readFileSync(GOLDEN, 'utf8')).calls;
  assert.ok(Object.keys(want).length > 400, Object.keys(want).length + ' calls');
  [enOut(), renderPrintSheets({ lang: 'en', drop: true })].forEach((out, i) => {
    const got = goldenOf(out.filter(isSheet));
    assert.deepEqual(Object.keys(got).filter((k) => !(k in want)), [], 'no call is new (' + i + ')');
    assert.deepEqual(Object.keys(want).filter((k) => got[k] !== want[k]), [], 'English print output changed (' + (i ? 'no sheetLang field' : 'sheetLang en, BM screen') + ')');
  });
});

// ---------- bracket-print.js ----------
function bracketApp(lang) {
  const app = loadApp({ lang });
  return app;
}
function koBracket(app, n, opts) {
  opts = opts || {};
  const t = run(app, 'blankTournament')();
  t.eventCreation.saved = true; t.eventCreation.competitionUnit = opts.unit || 'Singles'; t.format.formatType = 'knockout';
  t.entriesList = Array.from({ length: n }, (_, i) => ({ id: 'e' + i, name: (opts.long ? 'Muhammad Hafiz bin Abdullah ' : 'Pemain ') + (i + 1), org: '', withdrawn: false }));
  t.format.seedingEnabled = true; t.format.numSeeds = Math.min(8, n);
  app.__t = t; run(app, 'state = __t; ensureSeedOrder(__t)');
  app.__o = t.seedOrder.map((id) => ({ entryId: id, org: '' }));
  t.knockout = run(app, 'generateBracket(__o, "Bracket")');
  if (opts.noShow) { const m = t.knockout.rounds[0].find((x) => x.aEntryId && x.bEntryId); m.void = true; }
  if (opts.wo) { const m = t.knockout.rounds[0].filter((x) => x.aEntryId && x.bEntryId)[1]; if (m) { m.wo = true; m.winnerId = m.aEntryId; m.aLegs = 3; m.bLegs = 0; } }
  return t;
}
const SIZES = [8, 12, 16, 24, 32, 48, 64, 96, 128];
test('bracket-print.js: BM round labels fit their box at A4 and A3 for 8 to 128 slots: shrunk to fit, never under 4.6 pt, two lines before a short form, no English short form', () => {
  const app = bracketApp('en');
  let two = 0, checked = 0;
  SIZES.forEach((n) => ['A4', 'A3'].forEach((paper) => {
    const t = koBracket(app, n);
    run(app, 'state.printSettings.sheetLang = "ms"');
    app.__p = paper;
    const lay = run(app, 'ddWithLang("ms", function(){ var m = KBP.fromBracket(state.knockout, state); return KBP.layout(m, __p, { chrome: koSheetChrome(state, state.knockout, { stage:"x", legsSub:"", legend:"", label:"BRACKET", detail:"" }) }); })');
    const v = run(app, 'KBP.verify')(lay);
    assert.equal(v.clipped, 0, n + ' ' + paper + ' clipped'); assert.equal(v.overlaps, 0, n + ' ' + paper + ' overlaps'); assert.equal(v.overflow, 0, n + ' ' + paper + ' overflow');
    const floor = 4.6 * Math.min(1, lay.s) - 0.005;
    lay.items.filter((i) => i.k === 'rl').forEach((rl) => {
      checked++;
      assert.ok(rl.fs >= floor, n + ' ' + paper + ' "' + rl.txt + '" ' + rl.fs.toFixed(2) + ' pt');
      assert.ok(!/^(R\d+|QF|SF|F)$/.test(rl.txt), 'no English short form: ' + rl.txt);
      assert.ok(/^(Pusingan \d+ terakhir|Suku akhir|Separuh akhir|Akhir|P\d+)$/.test(rl.txt), rl.txt);
      if (rl.two) { two++; assert.ok(rl.lines[0].length && rl.lines[1].length && 2 * rl.fs * (25.4 / 72) * 1.08 <= rl.h + 0.01, 'two lines fit ' + rl.lines.join(' / ')); }
      else { const w = run(app, 'KBP.roundLabel')(rl.txt, lay.s, rl.w); assert.ok(w); }
    });
    // the HTML: the two-line labels print as two lines
    const html = run(app, 'KBP.sheetHTML')(lay);
    assert.ok(!/class="kb-ink kb-rl"[^>]*>(R\d+|QF|SF)</.test(html));
  }));
  assert.ok(checked > 60, checked + ' labels');
  // English keeps its established labels exactly (R128, QF, SF where they never fitted; nothing on two lines)
  SIZES.forEach((n) => { const t = koBracket(app, n); run(app, 'state.printSettings.sheetLang = "en"'); const lay = run(app, 'KBP.layout(KBP.fromBracket(state.knockout, state), "A4", {})'); assert.ok(lay.items.every((i) => i.k !== 'rl' || !i.two)); });
  // a narrow box: the long BM label goes onto two lines at or above the floor ("Pusingan 128 / terakhir"), never cut
  const r = run(app, 'KBP.roundLabel')('Pusingan 128 terakhir', 1, 16, 'P128', true, 4.3);
  assert.equal(r.two, true); assert.equal(JSON.stringify(r.lines), JSON.stringify(['Pusingan 128', 'terakhir'])); assert.ok(r.fs >= 4.6);
  const r2 = run(app, 'KBP.roundLabel')('Pusingan 128 terakhir', 1, 9, 'P128', true, 4.3);
  assert.equal(r2.txt, 'P128', 'only when two lines do not fit: the approved short form');
  assert.equal(run(app, 'KBP.roundLabel')('Round of 128', 1, 9, 'R128', false, 4.3).txt, 'R128', 'English: as before');
});
test('bracket-print.js: the paper recommendation is the same in English and BM for every event and size (marks, exits and labels never widen the layout)', () => {
  const app = bracketApp('en');
  const advice = (lang) => run(app, 'ddWithLang("' + lang + '", function(){ var a = koPaperAdvice(koPrintModels(state)); return JSON.stringify(a.none ? a : { rec: a.rec, legible: a.legible, noneFits: a.noneFits, minPt: a.minPt, soft: a.soft, split: a.split && a.split.sheets, plans: Object.keys(a.plans).map(function(p){ return a.plans[p].map(function(x){ return [x.s, x.W, x.Hn, x.mode]; }); }) }); })');
  let n = 0;
  SIZES.forEach((size) => [{}, { noShow: true, wo: true }, { long: true, unit: 'Doubles', noShow: true }].forEach((o) => {
    koBracket(app, size, o);
    assert.equal(advice('ms'), advice('en'), size + ' ' + JSON.stringify(o)); n++;
  }));
  buildStates().forEach((st) => {
    app.__t = JSON.parse(JSON.stringify(st.data)); run(app, 'state = __t');
    assert.equal(advice('ms'), advice('en'), st.id); n++;
    if (st.data.knockout && st.data.format.formatType !== 'podknockout') {
      app.__k = st.data.knockout;
      const sp = (lang) => run(app, 'ddWithLang("' + lang + '", function(){ var s = KBP.splitPlan(KBP.fromBracket(state.knockout, state)); return JSON.stringify(s && { c: s.c, total: s.total, s: s.s, wingW: s.wingW }); })');
      assert.equal(sp('ms'), sp('en'), st.id + ' split');
    }
  });
  assert.ok(n > 60);
  // the marks: TIDAK HADIR is stacked so it is never wider than NO-SHOW; WO stays one line
  const ml = run(app, 'KBP.markLines');
  const j = (x) => JSON.stringify(x);
  assert.equal(j(ml('NO-SHOW', { mark: { 'NO-SHOW': 'TIDAK HADIR' } })), j(['TIDAK', 'HADIR']));
  assert.equal(j(ml('WO', { mark: { 'WO': 'WO' } })), j(['WO']));
  assert.equal(j(ml('NO-SHOW', { mark: { 'NO-SHOW': 'NO-SHOW' } })), j(['NO-SHOW']));
});
test('bracket-print.js: a BM bracket with a no-show, a walkover, long names and byes prints clean (verify), with BM words and stacked marks', () => {
  const app = bracketApp('ms');
  [12, 24, 40].forEach((n) => {
    koBracket(app, n, { noShow: true, wo: true, long: n === 40 });
    run(app, 'state.printSettings.sheetLang = "ms"');
    const html = run(app, 'knockoutBracketSheetHTML(state.knockout)');
    assert.match(html, /<span class="kb-mk two"[^>]*>TIDAK<br>HADIR<\/span>/);
    assert.match(html, />JUARA</); assert.match(html, /kb-bye[^>]*>BYE</);
    if (n === 40) assert.match(html, /<b>Nama penuh:<\/b>/);
    assert.ok(!/NO-SHOW|CHAMPION|Full names|to Finals/.test(html));
    // on the recommended paper: clean; on A4 (shrunk for the long names): exactly as clean as the English sheet
    const check = (lang, paper) => run(app, 'ddWithLang("' + lang + '", function(){ var m = KBP.fromBracket(state.knockout, state); var v = KBP.verify(KBP.layout(m, ' + (paper ? '"' + paper + '"' : 'KBP.recommend([m]).rec') + ', {})); return JSON.stringify([v.overlaps, v.overflow, v.clipped, v.textUnderFloor, v.textList]); })');
    const bm = JSON.parse(check('ms'));
    assert.deepEqual([bm[0], bm[1], bm[3]], [0, 0, 0], n + ' BM on the recommended paper: no overlap, nothing off the sheet, no text under 4.6 pt');
    if (n < 40) assert.equal(bm[2], 0, n + ' nothing clipped');
    assert.equal(check('ms'), check('en'), n + ' BM exactly as clean as English on the recommended paper');
    assert.equal(check('ms', 'A4'), check('en', 'A4'), n + ' and on A4');
  });
});
test('bracket-print.js: the print font knows every character of the BM sheet words (no fallback boxes)', () => {
  const app = bracketApp('ms');
  const miss = run(app, 'KBP.missingGlyphs');
  const words = Object.values(PMS).concat(Object.values(RMS), ['Pusingan 128 terakhir', 'TIDAK HADIR', 'Hakim / Iskandar', 'Ipoh Arrows']).join(' ').replace(/<[^>]+>|&\w+;|\{\w+\}/g, ' ');
  assert.equal(JSON.stringify(miss(words)), '[]');
  assert.equal(JSON.stringify(miss('Łódź')), '[]', 'Latin with marks too');
  assert.equal(JSON.stringify(miss('名')), '["名"]', 'the check works');
});

// ---------- XSS ----------
test('XSS: placeholders are escaped on BM sheets (every text field of a round robin -> knockout, a Group Boards and a Teams event)', () => {
  const { build, makeInjector, callAll, parseLeaks } = require('./lib/xss-harness');
  ['rrko', 'pods', 'teams', 'ko'].forEach((kind) => {
    const { app, t } = build(kind, 'en');
    t.printSettings = t.printSettings || {}; t.printSettings.sheetLang = 'ms';
    const { inject } = makeInjector();
    inject(t, kind, 'strings', 0);
    t.printSettings.sheetLang = 'ms';
    const { captured } = callAll(app, t, kind, { htmlReturn: (label) => /Sheet|Sheets|print|Print/.test(label) });
    const sheets = captured.filter((c) => /Sheet|print|Print/.test(c.src));
    assert.ok(sheets.length > 5, kind + ' ' + sheets.length);
    assert.ok(sheets.some((c) => /Dijana dengan DartDraw|PESERTA|JUARA|Bil\./.test(c.html)), kind + ' really printed BM');
    const leaks = sheets.flatMap((c) => parseLeaks(c.html).map((l) => l.kind + ' in ' + c.src));
    assert.deepEqual(leaks.slice(0, 5), [], kind);
  });
});

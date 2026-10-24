// i18n step 3: the organiser app (app.html, pods-ui.js, boardplan-ui.js) in English and Bahasa Malaysia.
//   - the string tables: i18n/app.en.js and i18n/app.ms.js have the same keys and placeholders, nothing empty, and follow
//     the glossary; every key the static markup names exists
//   - no English left: every screen, box and message tests/lib/app-screens.js reaches (Singles, Doubles, Teams x Knockout,
//     Round robin -> Knockout, Group Boards, Round robin; set up, drawn, live, done, finalized; the paper dialog, ties,
//     no-shows, the sample event, Get started...) drawn in BM shows no English table text
//   - English unchanged: the English app writes exactly what it wrote before step 3 (tests/golden/app-en.json), apart from
//     the two documented additions (the language row of the compact menu, ?lang= on the viewer links)
//   - printed sheets follow the event's print language (i18n step 4: tests/print-i18n.test.js), whatever the screen language is
//   - the switch: start-up choice (?lang, saved, never the browser), the note, <html lang> and title, a switch redraws
//     without saving or marking anything unsaved and keeps the step and the open box; Help and viewer links by language
//   - the BM organiser Help quotes the BM app strings exactly; placeholders are escaped in BM too (XSS harness)
//   - coverage: no English literal is left in the organiser UI code outside the print builders and stored codes
// UPDATE_GOLDEN=1 GOLDEN_APP_DIR=<a copy of the app before step 3> rewrites tests/golden/app-en.json.
process.env.TZ = 'Asia/Kuala_Lumpur';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), crypto = require('crypto'), vm = require('vm');
const { loadApp, run, msFiles } = require('./lib/load-app');
const { renderAppScreens, makeApp, visibleText, isPrint, normalizeEnglish, buildStates } = require('./lib/app-screens');
const { scan } = require('../scripts/i18n/scan-strings');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const EN = require('../i18n/app.en.js'), MS = require('../i18n/app.ms.js'), RMS = require('../i18n/render.ms.js');
const REN = (() => { const c = { document: { createElement: () => ({ getContext: () => ({}) }) } }; vm.createContext(c); vm.runInContext(read('render.js') + ';this.__t = DD_RENDER_EN;', c); return c.__t; })();
const forms = (v) => (v && typeof v === 'object' ? [v.one, v.other] : [v]);
const holes = (v) => [...new Set(forms(v).join(' ').match(/\{\w+\}/g) || [])].sort();

/* Values that are deliberately the same in both languages: codes, symbols, kept darts words, names, numbers and patterns
   whose words are all kept (Round Robin, Group Boards, Board N, OK, Pro, Edit, Format, Logo). */
const SAME = new Set(['m.ok', 'list.sep', 'fmt.roundrobin', 'seg.numbered', 'ko.cl.score', 'ko.cl.scoreWo', 'ko.cl.line', 'dur.line', 'dur.rr', 'org.pro',
  'saved.line', 'cw.sub', 'sum.edit', 'sum.format', 'sum.logo', 'cc.board', 'boards.list', 'tooMany.withHint', 'sheet.tbItem', 'paper.fitItem', 'nw.rr', 'jump.rr',
  's2.rr', 's2.secFormat', 'pods.countOf', 'bp.board', 'br.bracket', 's1.basic' /* no: Asas */, 'pods.boardsLabel', 's3.boardsLabel', 'dur.rr']);
SAME.delete('s1.basic');

// ---------- the tables ----------
test('tables: app.en.js and app.ms.js have the same keys and {placeholders}, nothing empty, BM one form, the same markup', () => {
  assert.deepEqual(Object.keys(MS).sort(), Object.keys(EN).sort(), 'the same keys in both languages');
  const untranslated = [];
  Object.keys(EN).forEach((k) => {
    forms(EN[k]).forEach((s) => assert.ok(typeof s === 'string' && s.length, 'en ' + k + ' is a non-empty string'));
    assert.ok(typeof MS[k] === 'string' && MS[k].trim().length, 'ms ' + k + ' is one non-empty string (BM does not inflect)');
    assert.deepEqual(holes(MS[k]), holes(EN[k]), k + ': the same {placeholders}');
    if (EN[k] && typeof EN[k] === 'object') { assert.deepEqual(holes(EN[k].one), holes(EN[k].other), 'en ' + k + ': both plural forms take the same placeholders'); }
    const tags = (s) => (s.match(/<\/?[a-z]+\b|&(?:amp|hellip|larr|rarr|nbsp|mdash);/g) || []).sort();
    assert.deepEqual(tags(MS[k]), tags(forms(EN[k])[0]), k + ': the same tags and entities');
    if (!SAME.has(k) && MS[k] === forms(EN[k]).slice(-1)[0]) untranslated.push(k);
  });
  // what is the same in both is either kept-in-English darts words, symbols or a pattern (checked one by one above)
  const okSame = (k) => /^(Round Robin|Round robin|Format|Edit|Logo|OK|Pro|Board|Bracket|TB|H2H)\b/.test(MS[k]) || /^[{}\s\d·:()/→↗,.–-]*$/.test(MS[k].replace(/\{\w+\}/g, '').replace(/<\/?[a-z]+>/g, '')) || /^r\./.test(k);
  assert.deepEqual(untranslated.filter((k) => !okSame(k)), [], 'every value is translated (or kept on purpose)');
  assert.ok(Object.keys(EN).length > 900, Object.keys(EN).length + ' keys');
});

test('tables: BM follows the glossary (lwn, ke-N, sama mata, membuat undian, Keputusan muktamad, the step names, no forbidden words)', () => {
  const all = Object.values(MS).join(' \n ');
  ['bagan', 'papan', 'mengundi', 'undi kumpulan', 'dua belah','kaki penaja', 'bersemuka', 'melog keluar', 'kata sandi', 'unduh', 'surel', 'pemarkahan', 'kamu', 'awak', 'tidak pernah', 'senarai rata']
    .forEach((w) => assert.ok(!new RegExp('\\b' + w + '\\b', 'i').test(all), w));
  assert.equal(MS['ko.vs'], '{a} lwn {b}'); assert.equal(MS['ord.nd'], 'ke-{n}');
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map((n) => MS['stage.' + n]), ['Cipta acara', 'Format & penjenamaan', 'Butiran carta', 'Sahkan & Cetak Bracket', 'Urus Kejohanan', 'Muktamadkan Kedudukan', 'Cetak Carta Akhir']);
  assert.match(MS['ties.item'], /sama mata dengan \{pts\} mata/); assert.equal(MS['draw.confirm'], 'Buat undian'); assert.match(MS['fin.intro'], /Keputusan muktamad/);
  assert.equal(MS['unit.Singles'] + MS['unit.Doubles'] + MS['unit.Teams'], 'PerseoranganBereguBerpasukan');
  assert.equal(MS['catUnit'], '{unit} {cat}', 'Perseorangan Terbuka, not Terbuka Perseorangan');
  assert.equal(MS['score.legsOf'], 'Leg {name}', 'BM puts Leg first');
  assert.equal(MS['m.save'], 'Simpan'); assert.equal(MS['m.print'], 'Cetak'); assert.equal(MS['sum.bestOf'], 'Terbaik daripada');
  // the organiser and the viewer say the same words where they share them
  const VMS = require('../viewer/i18n/ms.js');
  ['cat.Open', 'cat.Women', 'cat.Youth', 'unit.Singles', 'unit.Doubles', 'unit.Teams', 'ord.st', 'ord.th'].forEach((k) => assert.equal(MS[k], VMS[k], k));
});

test('tables: every key the static markup and the code name exists (data-i18n, data-i18n-attr, T(\'...\'))', () => {
  const html = read('app.html');
  const keys = new Set();
  html.replace(/data-i18n(?:-html)?="([^"]+)"/g, (m, k) => keys.add(k));
  html.replace(/data-i18n-attr="([^"]+)"/g, (m, v) => v.split(';').forEach((p) => keys.add(p.split(':')[1].trim())));
  ['app.html', 'pods-ui.js', 'boardplan-ui.js', 'pods.js', 'qr.js', 'i18n/app-i18n.js'].forEach((f) => read(f).replace(/\bT\('([\w.]+)'\s*[,)]/g, (m, k) => keys.add(k)));
  const PEN = require('../i18n/print.en.js');   // i18n step 4: the printed sheets' words
  const missing = [...keys].filter((k) => !Object.prototype.hasOwnProperty.call(EN, k) && !Object.prototype.hasOwnProperty.call(REN, k) && !Object.prototype.hasOwnProperty.call(PEN, k));
  assert.deepEqual(missing, []);
});

// ---------- T(), dates, times ----------
test('T(): plurals by n in English, one BM form, placeholders filled once, English fallback with one warning, print language separate', () => {
  const en = loadApp(), ms = loadApp({ lang: 'ms' });
  assert.equal(run(en, "T('checkin.warn', {n:1, names:'A'})"), '1 entry not yet checked in: A. You can still proceed.');
  assert.equal(run(en, "T('checkin.warn', {n:2, names:'A, B'})"), '2 entries not yet checked in: A, B. You can still proceed.');
  assert.equal(run(ms, "T('checkin.warn', {n:1, names:'A'})"), '1 peserta belum daftar masuk: A. Anda masih boleh meneruskan.');
  assert.equal(run(ms, "T('ko.vs', {a:'{b}', b:'X'})"), '{b} lwn X', 'a name that looks like a placeholder is left alone');
  assert.equal(run(ms, 'ddOrdinal(1)+" "+ddOrdinal(22)'), 'ke-1 ke-22'); assert.equal(run(en, 'ddOrdinal(1)+" "+ddOrdinal(22)+" "+ddOrdinal(13)'), '1st 22nd 13th');
  const warn = []; ms.console = { warn: (x) => warn.push(x), error() {}, log() {} };
  run(ms, "DD_TABLES.en['zz.only'] = 'Only English'");
  assert.equal(run(ms, "T('zz.only') + T('zz.only')"), 'Only EnglishOnly English');
  assert.equal(warn.length, 1); assert.match(warn[0], /missing "zz\.only" in ms/);
  // render.js asks the app's DD_T
  ms.__b = { rounds: [[1, 2, 3, 4], [1, 2], [1]] };
  assert.equal(run(ms, '[0,1,2].map(function(i){ return koRoundName(__b, i); }).join("|")'), 'Suku akhir|Separuh akhir|Akhir');
  // the print language: the open event's setting (none open here: English), whatever the screen shows
  assert.equal(run(ms, 'ddPrintLang()'), 'en');
  assert.equal(run(ms, "ddWithLang(ddPrintLang(), function(){ return koRoundName(__b, 2) + ' / ' + T('sheet.entry'); }) + ' / ' + T('sheet.entry')"), 'Final / ENTRY / PESERTA');
  assert.equal(run(ms, 'ddLang()'), 'ms', 'and back to the screen language afterwards');
});

test('dates and times: BM shows dd/mm/yyyy and 12-hour ms-MY times (7:10 PTG); English keeps what it showed; durations ~3 jam 30 min', () => {
  const en = loadApp(), ms = loadApp({ lang: 'ms' });
  assert.equal(run(ms, "ddDateNum('2026-11-07')"), '07/11/2026'); assert.equal(run(en, "ddDateNum('2026-11-07')"), '2026-11-07');
  assert.equal(run(ms, 'epochClockLabel(new Date(2026, 10, 7, 19, 10).getTime())'), '7:10 PTG');
  assert.equal(run(ms, 'epochClockLabel(new Date(2026, 10, 7, 9, 5).getTime())'), '9:05 PG');
  assert.equal(run(en, 'epochClockLabel(new Date(2026, 10, 7, 19, 10).getTime())'), new Date(2026, 10, 7, 19, 10).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), 'English: the device format, as before');
  assert.equal(run(ms, 'formatDurationLabel(210) + " | " + formatDurationLabel(45) + " | " + formatDurationLabel(120)'), '3 jam 30 min | 45 min | 2 jam');
  assert.equal(run(en, 'formatDurationLabel(210) + " | " + formatDurationLabel(45)'), '3h 30m | 45m');
  assert.equal(run(ms, "finalizedWhenText({finalized:{at:'2026-11-07T11:30:00.000Z'}})"), '07/11/2026, 7:30 PTG');
});

// ---------- every screen in BM ----------
let MS_OUT = null, EN_OUT = null;
/* the BM organiser's events print in BM too (i18n step 4: an event made with BM on screen gets BM sheets) */
const msOut = () => MS_OUT || (MS_OUT = renderAppScreens({ lang: 'ms', sheetLang: 'ms' }));
const enOut = () => EN_OUT || (EN_OUT = renderAppScreens({ lang: 'en' }));
function organiserText() {   // the organiser's own words (names, events), never translated
  const out = new Set(['Kejohanan Dart Terbuka Selangor 2026', 'Siti Aminah']);
  buildStates().forEach((s) => { const d = s.data; out.add(d.eventCreation.tournamentName); out.add(d.eventCreation.eventName); d.entriesList.forEach((e) => { out.add(e.name); if (e.org) out.add(e.org); }); });
  return [...out].filter(Boolean).sort((a, b) => b.length - a.length);
}
const KEPT = new Set('Group Boards bracket Bracket board Board leg legs round Round robin Robin bye seed Plate walkover DartDraw Live PDF QR TB H2H Format Edit Logo Pro OK Kelab ABC VIEWER_URL README Bd'.split(' '));
const wordsOf = (list) => new Set(list.join(' ').replace(/<[^>]+>|&\w+;|\{\w+\}/g, ' ').split(/[^A-Za-z]+/).filter((w) => w.length >= 3));
/* what the vm shows: everything but the printed sheets (step 4), the Admin panel (English by decision), errors and the
   Help link addresses (their #anchors are the same English ids on /help and /ms/help) */
const shown = (o) => !isPrint(o.id) && !/#error$| throw #error|@href #|#adminNav$/.test(o.id);
test('no English left: every organiser screen, box and message of every event, drawn in BM, shows no English table word or phrase', () => {
  const out = msOut().filter(shown);
  assert.ok(out.length > 15000, out.length + ' outputs');
  const names = organiserText();
  const strip = (t) => names.reduce((s, n) => s.split(n).join(' • '), t);
  const msAll = Object.values(MS).concat(Object.values(RMS)).join('\n');
  const msWords = wordsOf(Object.values(MS).concat(Object.values(RMS)));
  const enWords = [...wordsOf(Object.values(EN).concat(Object.values(REN)).flatMap(forms))].filter((w) => !msWords.has(w) && !KEPT.has(w));
  const enPhrases = Object.values(EN).flatMap(forms).map((v) => v.replace(/<[^>]+>|&\w+;|\{\w+\}/g, ' ')).flatMap((v) => v.split(/\s{2,}|[.:;!?—]\s/)).map((s) => s.trim())
    .filter((s) => s.split(/\s+/).length >= 3 && s.split(/\s+/).some((w) => /[a-z]{3}/.test(w) && !KEPT.has(w)))
    .filter((s) => !msAll.includes(s));   // the same words in BM, e.g. "(minimum 7 pt)."
  const bad = [];
  const seen = new Set();
  out.forEach((o) => {
    const t = strip(visibleText(o.html)).replace(/\b[\w.-]+\.(?:com|my|app)(?:\/\S*)?/g, ' URL ');   // addresses
    if (seen.has(t)) return; seen.add(t);
    enWords.forEach((w) => { if (new RegExp('\\b' + w + '\\b').test(t)) bad.push(o.id + ': "' + w + '" in …' + t.slice(Math.max(0, t.search(new RegExp('\\b' + w + '\\b')) - 40), t.search(new RegExp('\\b' + w + '\\b')) + 40)); });
    enPhrases.forEach((p) => { if (t.includes(p)) bad.push(o.id + ': "' + p + '"'); });
  });
  assert.deepEqual([...new Set(bad)].slice(0, 15), [], 'English on a BM screen');
  // and the BM words really are there
  const all = out.map((o) => visibleText(o.html)).join('\n');
  ['Cipta acara', 'Sahkan & Cetak Bracket', 'Urus Kejohanan', 'Muktamadkan Kedudukan', 'Cetak Carta Akhir', 'Mulakan semua perlawanan?', 'Kosongkan keputusan ini?',
    'Tandakan tidak hadir', 'Kedua-dua tidak hadir', 'Terima & muktamadkan', 'Keputusan dimuktamadkan', 'Bracket ini memerlukan kertas A3', 'Pecahkan kepada', 'Guna A3 (disyorkan)', 'Bermula', 'Cuba acara contoh',
    'Ini acara contoh. Tiada apa-apa yang akan disimpan.', 'Perseorangan', 'Beregu', 'Berpasukan', 'Wanita', 'lwn', 'PTG', '07/11/2026', 'Perseorangan Terbuka', 'Leg (terbaik daripada)', 'Segmen perlawanan pasukan',
    'Pemecah seri', 'Kumpulan A', 'Board 1', 'Peringkat Akhir', 'Pemenang Kumpulan', 'sama', 'Selesaikan kedudukan sama mata sebelum meneruskan', 'Disimpan', 'Dikemas kini di tempat lain — klik untuk muat semula',
    'Had peserta dicapai','Ketahui lebih lanjut dalam Bantuan', 'Keputusan awam', 'Borang barisan', 'Undian rawak', 'Mod awam', 'Bahasa:'].forEach((w) => assert.ok(all.includes(w), 'shown in BM: ' + w));
});

test('printed sheets follow the event, not the screen: BM on screen with English sheets prints every sheet byte-identical to the English app', () => {
  const sheets = (out) => out.filter((o) => isPrint(o.id) && /#printSheets$/.test(o.id));
  const en = sheets(enOut()), ms = sheets(renderAppScreens({ lang: 'ms', sheetLang: 'en' }));
  assert.ok(en.length > 40, en.length + ' print outputs');
  assert.deepEqual(ms.map((o) => o.id), en.map((o) => o.id));
  const m = new Map(en.map((o) => [o.id, o.html]));
  assert.deepEqual(ms.filter((o) => m.get(o.id) !== o.html).map((o) => o.id), []);
});

// ---------- English unchanged ----------
const GOLDEN = path.join(__dirname, 'golden', 'app-en.json');
function goldenOf(out) {
  const g = {};
  out.forEach((o) => { const p = o.id.split(' | '); const k = p.slice(0, 2).join(' | '); (g[k] = g[k] || []).push(p.slice(2).join(' | ') + '\u0001' + normalizeEnglish(o.html)); });
  const r = {};
  Object.keys(g).sort().forEach((k) => { r[k] = crypto.createHash('sha1').update(g[k].join('\n\u0000')).digest('hex').slice(0, 12); });
  return r;
}
test('English unchanged: the English app writes exactly what it wrote before step 3 (every screen, box, message and print, per call)', () => {
  if (process.env.UPDATE_GOLDEN) fs.writeFileSync(GOLDEN, JSON.stringify({ note: JSON.parse(fs.readFileSync(GOLDEN, 'utf8')).note, calls: goldenOf(renderAppScreens({ lang: 'en', dir: process.env.GOLDEN_APP_DIR })) }, null, 0).replace(/,"/g, ',\n"') + '\n');
  const want = JSON.parse(fs.readFileSync(GOLDEN, 'utf8')).calls, got = goldenOf(enOut());
  assert.ok(Object.keys(want).length > 3000);
  assert.deepEqual(Object.keys(got).filter((k) => !(k in want)), [], 'no call is new');
  assert.deepEqual(Object.keys(want).filter((k) => got[k] !== want[k]), [], 'English output changed');
});
test('English unchanged: the two documented additions are really there (the compact menu language row, ?lang on the viewer links)', () => {
  const all = enOut().map((o) => o.html).join('\n');
  assert.match(all, /<div class="compact-menu-lang"><div class="langsw-row"><span class="langsw-label" lang="ms">Bahasa:<\/span><div class="langsw" role="group" aria-label="Language \/ Bahasa">/);
  assert.match(all, /href="https:\/\/live\.example\.com\/live\/[a-z0-9]+\?lang=en"[^>]*>Open ↗</);
  assert.match(msOut().map((o) => o.html).join('\n'), /href="https:\/\/live\.example\.com\?lang=ms"[^>]*>Semua acara ↗</);
});

// ---------- the switch ----------
function memoryStore(init) { const d = Object.assign({}, init); return { data: d, getItem: (k) => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); }, removeItem: (k) => { delete d[k]; } }; }
function startApp(o) {
  o = o || {};
  const ls = memoryStore(o.saved ? { 'dartdraw.lang': o.saved } : {});
  const calls = [];
  const app = loadApp({ globals: { localStorage: ls, location: { search: o.search || '', pathname: '/app', hash: o.hash || '' }, history: { state: null, replaceState: (s, t, u) => calls.push(u) }, navigator: { languages: o.languages || ['en-GB'], language: (o.languages || ['en-GB'])[0] } } });
  return { app, ls, calls, R: (c) => run(app, c) };
}
test('switch: English by default, also for a Malay browser; the saved choice is used; ?lang=ms|en wins, is saved and leaves the address', () => {
  assert.equal(startApp().R('ddUiLang()'), 'en');
  assert.equal(startApp({ languages: ['ms-MY', 'en'] }).R('ddUiLang()'), 'en', 'never chosen from the browser language');
  assert.equal(startApp({ saved: 'ms' }).R('ddUiLang()'), 'ms');
  const q = startApp({ search: '?lang=ms&t=abc', saved: 'en', hash: '#x' });
  assert.equal(q.R('ddUiLang()'), 'ms'); assert.equal(q.ls.data['dartdraw.lang'], 'ms');
  assert.deepEqual(q.calls, ['/app?t=abc#x'], 'the other parameters (the full-page window\'s t, stage, section) stay');
  const e = startApp({ search: '?lang=en', saved: 'ms' });
  assert.equal(e.R('ddUiLang()'), 'en'); assert.equal(e.ls.data['dartdraw.lang'], 'en');
  assert.equal(startApp({ search: '?lang=fr' }).R('ddUiLang()'), 'en');
  // the note offering BM: English on screen, a Malay first browser language, nothing saved, not closed
  const s = startApp();
  assert.equal(s.R("ddNoteWanted({languages:['ms-MY']}, null, null, 'en')"), true);
  assert.equal(s.R("ddNoteWanted({languages:['en-MY','ms']}, null, null, 'en')"), false);
  assert.equal(s.R("ddNoteWanted({languages:['ms']}, 'en', null, 'en')"), false);
  assert.equal(s.R("ddNoteWanted({languages:['ms']}, null, 'closed', 'en')"), false);
  assert.equal(s.R("ddNoteWanted({languages:['ms']}, null, null, 'ms')"), false);
  assert.match(read('app.html'), /<div class="langbar" id="langBar" lang="ms" hidden><p>Bahasa Malaysia tersedia &mdash; <a href="\?lang=ms" hreflang="ms" data-lang-set="ms"/);
});

test('switch: one press redraws every screen in the new language, keeps the event, step, typed fields and open box, and saves nothing', () => {
  const { app, doc } = makeApp('en');
  const st = buildStates().find((s) => s.id === 'Singles/rrknockout/live');
  app.__t = JSON.parse(JSON.stringify(st.data));
  run(app, 'state = __t; tournamentsCache = {}; tournamentsCache[state.id] = state; currentStage = 5; render();');
  const before = JSON.stringify(run(app, 'state'));
  let persisted = 0, closed = 0;
  app.persist = () => { persisted++; };
  const realClose = app.closeModal; app.closeModal = () => { closed++; realClose(); };
  run(app, 'startAllGames()');   // a box is open
  run(app, "ddSetLang('ms')");
  assert.equal(doc.getElementById('pageTitle').textContent, 'Urus Kejohanan');
  assert.match(doc.getElementById('stageArea').innerHTML, /Urus kejohanan/);
  assert.equal(run(app, 'currentStage'), 5); assert.equal(run(app, 'state.id'), st.data.id);
  assert.equal(JSON.stringify(run(app, 'state')), before, 'the event is not changed');
  assert.equal(persisted, 0, 'nothing is saved'); assert.equal(run(app, 'savePending'), false, 'nothing is marked unsaved');
  assert.equal(closed, 0, 'the open box stays open');
  assert.equal(doc.documentElement.getAttribute('lang'), 'ms'); assert.equal(doc.title, 'DartDraw Local - Pengurus Carta Kejohanan');
  run(app, "ddSetLang('en')");
  assert.equal(doc.getElementById('pageTitle').textContent, 'Manage Tournament');
  // typed but not saved: put back in place after the redraw (by id, or by its place on the page)
  const el = (id, value, def) => ({ id, tagName: 'INPUT', type: 'text', value, defaultValue: def });
  const area = (list) => ({ querySelectorAll: () => list, querySelector: (s) => list.find((x) => '#' + x.id === s) || null });
  const typed = run(app, 'typedFieldsOf')(area([el('f_bestof', '7', '5'), el('', 'Hakim', 'Entry 1'), el('f_tname', 'Same', 'Same')]));
  const fresh = [el('f_bestof', '5', '5'), el('', 'Entry 1', 'Entry 1'), el('f_tname', 'Same', 'Same')];
  run(app, 'restoreTypedFields')(area(fresh), typed);
  assert.deepEqual(fresh.map((x) => x.value), ['7', 'Hakim', 'Same']);
  // a language switch never renames the automatic entry names
  app.__g = { label: 'A', entryIds: ['e1'] };
  run(app, "state = { eventCreation: { competitionUnit: 'Singles' }, entriesList: [{ id: 'e1', name: 'Player A1', autoName: true }], groups: [__g] }; ddSetLang('ms'); applyAutoNames(state)");
  assert.equal(run(app, 'state.entriesList[0].name'), 'Player A1');
  run(app, "state.entriesList[0].name = 'Old'; applyAutoNames(state)");
  assert.equal(run(app, 'state.entriesList[0].name'), 'Pemain A1', 'a new automatic name is made in the screen language');
});

test('switch: the markup: an EN | BM pair before Help in the top bar and the compact bar, and "Bahasa: EN | BM" in the compact menu below 680px', () => {
  const html = read('app.html');
  const pair = '<div class="langsw" role="group" aria-label="Language / Bahasa"><button type="button" lang="en" aria-label="English" data-lang-set="en" aria-pressed="true">EN</button><button type="button" lang="ms" aria-label="Bahasa Malaysia" data-lang-set="ms" aria-pressed="false">BM</button></div>';
  assert.ok(html.includes('<span class="topbar-right">' + pair + '<a class="help-link"'), 'top bar: before Help');
  assert.ok(html.includes('<span class="compact-lang">' + pair + '</span>\n  <a class="compact-link" href="/help"'), 'compact bar: before Help');
  assert.match(html, /@media \(max-width:680px\)\{\s*\.compact-bar \.compact-lang\{display:none\}\s*\.compact-menu-lang\{display:block/);
  assert.match(html, /\.langsw button\{[^}]*min-width:44px;min-height:38px/); assert.match(html, /\.compact-bar \.langsw button\{min-width:34px;min-height:36px/);
  const { app } = makeApp('ms');
  assert.match(run(app, 'compactMenuHTML()'), /<div class="compact-menu-lang"><div class="langsw-row"><span class="langsw-label" lang="ms">Bahasa:<\/span><div class="langsw"[^>]*>.*aria-pressed="true">BM<\/button><\/div><\/div><\/div>$/);
  // the scripts load in order: render.js, the English tables, the BM loader (it writes the BM tables' tags only for BM),
  // the switch, then the organiser scripts; the BM tables are never plain script tags
  const tag = (s) => html.indexOf('<script src="' + s + '">');
  const order = [tag('render.js'), tag('i18n/app.en.js'), tag('i18n/print.en.js'), tag('i18n/errors.en.js'), html.indexOf('<script data-dd-ms>'), tag('i18n/app-i18n.js'), tag('bracket-print.js'), tag('pods.js'), tag('pods-ui.js')];
  assert.ok(order.every((x, i) => x > 0 && (i === 0 || x > order[i - 1])), 'script order ' + order);
  ['i18n/render.ms.js', 'i18n/app.ms.js', 'i18n/print.ms.js', 'i18n/errors.ms.js'].forEach((f) => assert.equal(tag(f), -1, f + ' is loaded only for BM'));
  assert.deepEqual(msFiles(html.slice(html.indexOf('<script data-dd-ms>'))), ['i18n/render.ms.js', 'i18n/app.ms.js', 'i18n/print.ms.js', 'i18n/errors.ms.js']);
});

test('Help links open /help or /ms/help by language with the anchor kept; the viewer links carry ?lang; the box Help links work in BM', () => {
  const en = loadApp(), ms = loadApp({ lang: 'ms' });
  assert.equal(run(en, "helpHref('accept')"), '/help#accept'); assert.equal(run(ms, "helpHref('accept')"), '/ms/help#accept');
  assert.match(run(ms, "helpQHTML('legs', 'leg')"), /href="\/ms\/help#legs"[^>]*aria-label="Bantuan: leg \(dibuka dalam tab baharu\)"/);
  // every Help link of a box is found from its BM title as well as its English one
  run(ms, 'void 0');
  const keys = run(ms, 'MODAL_HELP.map(function(x){ return x[0]; })');
  keys.forEach((k) => {
    assert.ok(Object.prototype.hasOwnProperty.call(EN, k), k);
    const bmTitle = MS[k].replace(/\{\w+\}/g, 'A'), enTitle = forms(EN[k])[0].replace(/\{\w+\}/g, 'A');
    assert.ok(run(ms, 'modalHelpFor(' + JSON.stringify(bmTitle) + ')'), 'BM title ' + bmTitle);
    assert.ok(run(en, 'modalHelpFor(' + JSON.stringify(enTitle) + ')'), 'EN title ' + enTitle);
  });
  // the static Help links follow the language too (data-help, and the pinned compact-bar link)
  assert.match(read('app.html'), /<a class="help-link" href="\/help" target="_blank" rel="noopener" data-help=""/);
  assert.match(read('i18n/app-i18n.js'), /function ddHelpPath\(\)\{ return ddUiLang\(\) === 'ms' \? '\/ms\/help' : '\/help'; \}/);
});

// ---------- the BM Help quotes the BM app ----------
test('the BM organiser Help quotes every button and label of the app exactly as the BM app says it', () => {
  const EN_HELP = require('../scripts/help-content'), MS_HELP = require('../scripts/i18n/ms/help-content');
  const ent = (s) => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&hellip;/g, '…').replace(/&rarr;/g, '→').replace(/&#8599;/g, '↗').replace(/&mdash;/g, '—').replace(/&ndash;/g, '–')
    .replace(/&rsquo;/g, '’').replace(/&lsquo;/g, '‘').replace(/&ldquo;|&rdquo;/g, '"').replace(/&middot;/g, '·').replace(/&larr;/g, '←').replace(/&#\d+;|&[a-z]+;/g, ' ');
  const plain = (s) => ent(String(s).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  const bolds = (h) => [...h.matchAll(/<b>([\s\S]*?)<\/b>/g)].map((m) => plain(m[1]));
  const byEn = {};
  Object.keys(EN).forEach((k) => { if (typeof EN[k] === 'string' && !/\{/.test(EN[k])) (byEn[plain(EN[k])] = byEn[plain(EN[k])] || []).push(k); });
  const bad = []; let checked = 0;
  EN_HELP.sections.forEach((s, si) => s.items.forEach((it, ii) => {
    const mb = bolds(MS_HELP.sections[si].items[ii].body).join(' | ');
    bolds(it.body).forEach((b) => {
      const keys = byEn[b] || byEn[b.replace(/ →$/, '')];
      if (!keys) return;
      checked++;
      if (!keys.some((k) => mb.includes(plain(MS[k])))) bad.push(it.id + ': "' + b + '" is ' + JSON.stringify(keys.map((k) => plain(MS[k]))) + ' in the BM app');
    });
  }));
  assert.deepEqual(bad, []);
  assert.ok(checked > 300, checked + ' quotes checked');
  // the labels coined for the Help in step 1 are the app's words now
  const UI = require('../docs/i18n/ui-strings-ms.js');
  [['Get started', 'gs.title'], ['Try a sample event', 'gs.trySample'], ['Save as my event', 'sample.keep'], ['Close sample', 'sample.close'], ['Clear result', 'ko.clear'], ['Change result', 'ko.change'],
    ['Mark no-show instead', 'wd.markBtn'], ['Go there', 'fin.goThere'], ['Publish results now', 'qr.publishNow'], ['Results finalized', 'fin.done'], ['These entries are already playing', 's1.inPlayTitle']]
    .forEach(([en, k]) => assert.equal(MS[k], UI.D[en], k));
});

// ---------- placeholders are escaped in BM too ----------
test('XSS: with BM on screen no injected payload becomes active HTML (every text field of a round robin -> knockout and a Group Boards event)', () => {
  const { build, makeInjector, callAll, parseLeaks, RETURNS_HTML } = require('./lib/xss-harness');
  ['rrko', 'pods', 'teams'].forEach((kind) => {
    const { app, t } = build(kind, 'ms');
    assert.equal(run(app, 'ddUiLang()'), 'ms');
    const { inject } = makeInjector();
    inject(t, kind, 'strings', 0);
    const { captured } = callAll(app, t, kind, { htmlReturn: (label) => RETURNS_HTML.test(label.replace(/#\d$/, '')) });
    assert.ok(captured.length > 100);
    const leaks = captured.flatMap((c) => parseLeaks(c.html).map((l) => l.kind + ' in ' + c.src));
    assert.deepEqual(leaks.slice(0, 5), [], kind);
    assert.ok(captured.some((c) => /Urus kejohanan|Butiran carta|Kumpulan/.test(c.html)), kind + ' really drew BM');
  });
});

// ---------- coverage ----------
/* The print builders were translated in i18n step 4 (i18n/print.en.js); only mkoPaginate keeps English, its internal
   reason text (never printed). The stored codes below stay English on purpose. PRINT_FNS: the print builders. */
const PLUMBING_FNS = new Set(['mkoPaginate']);
const PRINT_FNS = new Set(['runningOrderSheetHTML', 'rulesSheetHTML', 'formatDescriptionLines', 'teamsFormatDescriptionLines', 'rrAdvanceLine', 'koSheetChrome', 'kbSplitSheetsHTML', 'knockoutBracketSheetHTML',
  'knockoutLegsSummary', 'groupBoardsBracketSheetHTML', 'sheetShellHTML', 'scaledArtHTML', 'projectedTooBigSheetHTML', 'projectedBracketSheetHTML', 'gbPlaceholderHTML', 'gbFitFontSize', 'koUnitNoun', 'mkoPaginate', 'mkoPageHTML',
  'lineupSheetHTML', 'lineupCardHTML', 'lineupSegmentHTML', 'printPackNow', 'bpPlayersSheetsHTML', 'bpBoardsSheetHTML', 'bpSheetShell', 'bpPlayerRows', 'bpClock', 'podsPrintClick']);
const CODES = new Set(['Open', 'Women', 'Youth', 'Singles', 'Doubles', 'Triples', 'Teams', 'Trios', 'Foursome', 'Player', 'Pair', 'Triple', 'Team', 'Entry', 'Bracket', 'Main bracket', 'Plate pool', 'Finals',
  'Main bracket (projected)', 'Plate pool (projected)', 'Head-to-head result', 'Leg difference', 'Legs won', 'Organiser decision / playoff', 'Verbal warning', 'Formal warning', 'Disqualification', 'Other',
  'Event creation', 'Format & branding', 'Chart details', 'Confirm & Print Bracket', 'Manage Tournament', 'Finalize Standings', 'Print Final Chart', 'DartDraw', 'Content-Type', 'Not authenticated', 'Enter', 'Escape',
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'Mid', 'Byes', 'EntryId', 'FromPod', 'Group ', 'Plate', '#deviceGatePhone',
  'Un-confirmed automatically — this group\'s entries changed since it was confirmed. Please review and re-confirm.']);
test('coverage: every English-looking literal left in the organiser UI code, the print builders included (step 4), is a stored code or plumbing', () => {
  const left = [];
  ['app.html', 'pods-ui.js', 'boardplan-ui.js'].forEach((f) => scan(f).forEach((x) => {
    if (PLUMBING_FNS.has(x.fn) || CODES.has(x.str)) return;
    if (/onclick=|onchange=|oninput=|setActiveGroup|setFormatType\(|chooseKnockoutFormat\(|border-top:|for="koPaperOpt_|grid-template-columns/.test(x.str)) return;   // handler and style fragments
    left.push(f + ':' + x.line + ' [' + x.fn + '] ' + x.str.slice(0, 80));
  }));
  assert.deepEqual(left, []);
  // and the scanner does find English (mkoPaginate's internal reasons); every print builder it now covers is still there
  assert.ok(scan('app.html').filter((x) => PLUMBING_FNS.has(x.fn)).length >= 1);
  const src = ['app.html', 'pods-ui.js', 'boardplan-ui.js'].map(read).join('\n');
  PRINT_FNS.forEach((fn) => assert.ok(src.includes('function ' + fn + '(') || src.includes('function ' + fn + ' ('), fn));
});

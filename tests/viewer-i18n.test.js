// i18n step 2: the public viewer in English and Bahasa Malaysia.
//   - the string tables: same keys and placeholders in both languages, nothing empty (viewer/i18n/*.js, render.js + i18n/render.ms.js)
//   - no English left: every viewer screen of every mock event, rendered in BM, shows no English table text
//   - English unchanged: the English screens are the same as before the switch was added (tests/golden/viewer-en.json), and
//     render.js draws byte-identical English for the organiser (tests/golden/render-en.json)
//   - the switch: ?lang, the saved choice, the note for Malay browsers, a switch keeps the tab, Me / Following and the address
//   - the BM spectator Help quotes the BM screen labels exactly
//   - dates and times (Intl ms-MY / en-GB), plurals and placeholders
// UPDATE_GOLDEN=1 rewrites the two golden files from the current code (GOLDEN_VIEWER_DIR / GOLDEN_RENDER_JS: older copies).
process.env.TZ = 'Asia/Kuala_Lumpur';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), vm = require('vm'), path = require('path'), crypto = require('crypto');
const { renderScreens, visibleText, NOW, FixedDate } = require('./lib/viewer-screens');
const { buildEvents } = require('./lib/viewer-events');
const { loadViewer, loadHome, runViewer, memoryStore } = require('./lib/load-viewer');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const EN = require('../viewer/i18n/en.js'), MS = require('../viewer/i18n/ms.js'), RMS = require('../i18n/render.ms.js');
const REN = (() => { const c = { document: { createElement: () => ({ getContext: () => ({}) }) } }; vm.createContext(c); vm.runInContext(read('render.js') + ';this.__t = DD_RENDER_EN;', c); return c.__t; })();
const sha = (s) => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 16);

// Values deliberately the same in both languages (codes, names, darts words the glossary keeps in English).
const SAME = new Set(['r.bye', 'r.wo', 'r.th.diff', 'r.th.tb', 'r.badge.h2h', 'ev.tab.bracket', 'ev.br.bracket', 'ev.legs.lab.rr', 'ev.legs.labeled', 'ev.tab.count',
  'theme.auto', 'hm.theme.auto', 'fmt.roundrobin', 'fmt.podknockout', 'hm.title', 'hm.dateLabel', 'hm.tba', 'ev.key.grid', 'ev.key.bye', 'ev.res.bye', 'ev.mt.bye', 'ev.mt.wo',
  'ev.board', 'ev.chg.otherDay', 'ev.chg.otherYear', 'hm.stage.rr', 'date.mon.0', 'date.mon.1', 'date.mon.3', 'date.mon.5', 'date.mon.6', 'date.mon.8', 'date.mon.10']);

// ---------- the tables ----------
const forms = (v) => (v && typeof v === 'object' ? [v.one, v.other] : [v]);
const holes = (v) => [...new Set(forms(v).join(' ').match(/\{\w+\}/g) || [])].sort();
function parity(en, ms, label) {
  assert.deepEqual(Object.keys(ms).sort(), Object.keys(en).sort(), label + ': the same keys in both languages');
  Object.keys(en).forEach((k) => {
    forms(en[k]).forEach((s) => assert.ok(typeof s === 'string' && s.trim(), label + ' en ' + k + ' is a non-empty string'));
    assert.ok(typeof ms[k] === 'string' && ms[k].trim(), label + ' ms ' + k + ' is one non-empty string (BM does not inflect)');
    assert.deepEqual(holes(ms[k]), holes(en[k]), label + ' ' + k + ': the same {placeholders}');
    if (en[k] && typeof en[k] === 'object') assert.deepEqual(holes(en[k].one), holes(en[k].other), 'en ' + k + ': both plural forms take the same placeholders');
    if (!SAME.has(k)) assert.notEqual(ms[k], forms(en[k])[forms(en[k]).length - 1], label + ' ' + k + ' is translated (or listed as deliberately the same)');
    // markup in a value must be the same markup in both
    assert.deepEqual((ms[k].match(/<\/?\w+>|&\w+;/g) || []).filter((x) => !/&(rsquo|ldquo|rdquo)/.test(x)).sort(), (forms(en[k])[0].match(/<\/?\w+>|&\w+;/g) || []).filter((x) => !/&(rsquo|ldquo|rdquo)/.test(x)).sort(), k + ': same tags');
  });
}
test('tables: the viewer table has every key in English and BM, with the same placeholders and nothing empty', () => {
  parity(EN, MS, 'viewer');
  assert.ok(Object.keys(EN).length > 250, 'the whole viewer is in the table (' + Object.keys(EN).length + ' keys)');
});
test('tables: render.js has its English inside and its BM in i18n/render.ms.js, key for key; the viewer has a synced copy', () => {
  parity(REN, RMS, 'render');
  assert.equal(read('viewer/i18n/render.ms.js'), read('i18n/render.ms.js'), 'npm run sync-viewer copies it');
  assert.match(read('scripts/sync-viewer.js'), /'i18n\/render\.ms\.js'/);
  const shared = Object.keys(EN).filter((k) => Object.prototype.hasOwnProperty.call(REN, k));
  assert.deepEqual(shared, [], 'the viewer and render.js tables do not define the same key twice');
});
test('tables: BM follows the glossary decisions (no words the style rules forbid; lwn, ke-N, sama mata, Keputusan muktamad, Mendatang)', () => {
  const all = Object.values(MS).concat(Object.values(RMS)).join(' \n ');
  ['bagan', 'papan', 'mengundi', 'dua belah', 'keputusan seri', 'kaki penaja', 'bersemuka', 'melog keluar', 'kata sandi', 'unduh', 'surel', 'pemarkahan', 'kamu', 'awak'].forEach((w) => assert.ok(!new RegExp('\\b' + w + '\\b', 'i').test(all), w));
  assert.equal(MS['ev.match.v'], '{a} lwn {b}'); assert.equal(MS['ord.nd'], 'ke-{n}'); assert.equal(MS['hm.tab.upcoming'], 'Mendatang');
  assert.equal(MS['ev.pill.final'], 'Keputusan muktamad'); assert.match(RMS['r.tie.h2h'], /sama mata dengan \{pts\} mata/); assert.equal(RMS['r.round.of'], 'Pusingan {n} terakhir');
  assert.equal(MS['ev.rd.of'], 'P{n}'); assert.equal(MS['ev.res.wonWo'], 'Menang walkover {score}'); assert.equal(MS['ev.bd.ahead'], 'Board {b} · selepas {n} perlawanan');
});

// ---------- t(): plurals, placeholders, fallback ----------
test('T(): English plurals pick one/other by n, BM has one form; unknown placeholders stay; a missing BM key falls back to English with one warning', () => {
  const v = loadViewer({ lang: 'en' });
  assert.equal(runViewer(v, "T('ev.bd.ahead', {b:2, n:1})"), 'Board 2 · 1 match ahead');
  assert.equal(runViewer(v, "T('ev.bd.ahead', {b:2, n:3})"), 'Board 2 · 3 matches ahead');
  assert.equal(runViewer(v, "T('ev.count.team', {n:1})"), '1 team');
  assert.equal(runViewer(v, "T('ev.board', {})"), 'Board {b}');
  assert.equal(runViewer(v, "T('no.such.key')"), 'no.such.key');
  const m = loadViewer({ lang: 'ms' });
  assert.equal(runViewer(m, "T('ev.bd.ahead', {b:2, n:1})"), 'Board 2 · selepas 1 perlawanan');
  assert.equal(runViewer(m, "T('ev.count.team', {n:1})"), '1 pasukan');
  assert.equal(runViewer(m, 'ddOrdinal(1) + " " + ddOrdinal(22) + " " + ddOrdinal(113)'), 'ke-1 ke-22 ke-113');
  assert.equal(runViewer(v, 'ddOrdinal(1) + " " + ddOrdinal(22) + " " + ddOrdinal(113)'), '1st 22nd 113th');
  // a key only English has: English, and a single warning
  const warn = []; m.console = { warn: (x) => warn.push(x), error() {}, log() {} };
  runViewer(m, "DD_TABLES.en['zz.only'] = 'Only English'");
  assert.equal(runViewer(m, "T('zz.only') + T('zz.only')"), 'Only EnglishOnly English');
  assert.equal(warn.length, 1); assert.match(warn[0], /missing "zz\.only" in ms/);
  // a value is filled once: a name that looks like a placeholder is left alone
  assert.equal(runViewer(m, "T('ev.vs', {name:'{name} {b}'})"), 'lwn {name} {b}');
  // Teams twins
  assert.equal(runViewer(m, "TU('ev.find', true)"), 'Cari pasukan'); assert.equal(runViewer(m, "TU('ev.find', false)"), 'Cari pemain');
});

// ---------- dates and times ----------
test('dates and times: Intl ms-MY gives 7:10 PTG and 23/10/2026 in BM; English keeps 7:10 pm and the stored date; the month and day names match Intl', () => {
  const m = loadViewer({ lang: 'ms' }), e = loadViewer({ lang: 'en' });
  assert.equal(runViewer(m, 'ddClock(new Date(2026, 9, 23, 19, 10))'), '7:10 PTG');
  assert.equal(runViewer(m, 'ddClock(new Date(2026, 9, 23, 9, 5))'), '9:05 PG');
  assert.equal(runViewer(e, 'ddClock(new Date(2026, 9, 23, 19, 10))'), '7:10 pm');
  assert.equal(runViewer(e, 'ddClock(new Date(2026, 9, 23, 0, 5))'), '12:05 am');
  assert.equal(runViewer(m, "ddDateNum('2026-10-23')"), '23/10/2026');
  assert.equal(runViewer(e, "ddDateNum('2026-10-23')"), '2026-10-23');
  assert.equal(runViewer(m, "ddDateNum('junk')"), 'junk');
  for (let i = 0; i < 12; i++) assert.equal(MS['date.mon.' + i], new Intl.DateTimeFormat('ms-MY', { month: 'short' }).format(new Date(2026, i, 1)), 'month ' + i);
  for (let i = 0; i < 7; i++) assert.equal(MS['date.wd.' + i], new Intl.DateTimeFormat('ms-MY', { weekday: 'short' }).format(new Date(2026, 9, 18 + i)), 'weekday ' + i);
  // "Scores last changed": today with minutes ago, another day with the date, another year with the year
  m.__now = new Date(2026, 9, 23, 14, 36).getTime();
  assert.equal(runViewer(m, 'changedLabel(new Date(2026, 9, 23, 14, 32).toISOString(), __now)'), '2:32 PTG (4 min lalu)');
  assert.equal(runViewer(m, 'changedLabel(new Date(2026, 9, 23, 14, 36).toISOString(), __now)'), '2:36 PTG (sebentar tadi)');
  assert.equal(runViewer(m, 'changedLabel(new Date(2026, 9, 21, 9, 0).toISOString(), __now)'), '21 Okt, 9:00 PG');
  assert.equal(runViewer(m, 'changedLabel(new Date(2025, 11, 31, 20, 0).toISOString(), __now)'), '31 Dis 2025, 8:00 PTG');
  e.__now = m.__now;
  assert.equal(runViewer(e, 'changedLabel(new Date(2026, 9, 23, 14, 32).toISOString(), __now)'), '2:32 pm (4 min ago)');
  const h = loadHome({ lang: 'ms' });
  assert.equal(vm.runInContext("hmTimeLabel('19:00') + ' | ' + hmDateLabel('2026-10-23', '2026-10-22') + ' | ' + hmDateLabel('2026-10-22', '2026-10-22')", h), '7:00 PTG | Jum 23 Okt | Hari ini');
  assert.equal(vm.runInContext("hmTimeLabel('19:00') + ' | ' + hmDateLabel('2026-10-23', '2026-10-22')", loadHome()), '7:00 pm | Fri 23 Oct');
  assert.equal(vm.runInContext("hmTimeLabel('24:00') + hmTimeLabel('7:00')", h), '');
});

// ---------- every screen in BM: no English left ----------
let msScreens = null;
const bmScreens = () => msScreens || (msScreens = renderScreens({ lang: 'ms', messages: true }));
function organiserText() {   // the organiser's own words (names), never translated
  const out = new Set(['Mystery Night']);
  buildEvents().forEach((e) => { const d = e.data; [d.eventCreation.tournamentName, d.eventCreation.eventName].forEach((x) => x && out.add(x)); (d.entriesList || []).forEach((x) => { out.add(x.name); if (x.org) out.add(x.org); }); });
  return [...out].sort((a, b) => b.length - a.length);
}
const tableText = (o) => Object.values(o).flatMap(forms).map((v) => v.replace(/<[^>]+>|&\w+;|\{\w+\}/g, ' '));
test('no English left: every screen of every mock event (Singles, Doubles, Teams, Group Boards; live, finished, finalized, no draw, offline, messages) and the home page, in BM', () => {
  const screens = bmScreens();
  assert.ok(screens.length > 300, screens.length + ' screens');
  const names = organiserText();
  const strip = (t) => names.reduce((s, n) => s.split(n).join(' • '), t);
  const wordsOf = (list) => new Set(list.join(' ').split(/[^A-Za-z]+/).filter((w) => w.length >= 3));
  const msWords = wordsOf(tableText(MS).concat(tableText(RMS)));
  const enWords = [...wordsOf(tableText(EN).concat(tableText(REN)))].filter((w) => !msWords.has(w));
  // whole English sentences too (a phrase of 3+ words that BM never uses)
  const enPhrases = tableText(EN).concat(tableText(REN)).flatMap((v) => v.split(/\s{2,}|[.:;!?]\s/)).map((s) => s.trim()).filter((s) => s.split(/\s+/).length >= 3);
  const bad = [];
  screens.forEach((s) => {
    const t = strip(visibleText(s.html));
    enWords.forEach((w) => { if (new RegExp('\\b' + w + '\\b').test(t)) bad.push(s.id + ': "' + w + '"'); });
    enPhrases.forEach((p) => { if (t.includes(p)) bad.push(s.id + ': "' + p + '"'); });
  });
  assert.deepEqual([...new Set(bad)].slice(0, 20), [], 'English on a BM screen');
  // and the BM words really are there
  const all = screens.map((s) => visibleText(s.html)).join('\n');
  ['Keputusan langsung', 'Perubahan skor terakhir', 'Luar talian', 'Semakan terakhir', 'Akan bermula', 'Keputusan muktamad', 'Seterusnya: Separuh akhir', 'Menang walkover', 'Kalah walkover',
    'Pusingan 16 terakhir', 'P16', 'Suku akhir', 'TIDAK HADIR', 'Kedua-dua tidak hadir', 'Apakah maksud lajur?', 'Apakah maksud label?', 'Sementara', 'Ked. Peserta Main M K LM +/- Mata',
    'Dipanggil — pergi ke Board', 'selepas', 'Peringkat Akhir', 'Semua kumpulan', 'Mendatang', 'Menunggu keputusan muktamad', 'Perseorangan Terbuka', 'Berpasukan Wanita', 'Perseorangan Belia',
    'segmen + pemecah seri setiap perlawanan', 'Undian belum dibuat', 'Keputusan tidak tersedia', 'Gagal memuatkan keputusan', 'Tiada pemain dengan nama itu.', 'Tiada pasukan dengan nama itu.',
    'Acara tanpa nama', 'Baru di sini? Tiga perkara yang perlu diketahui', 'Kalah mati: suku akhir terbaik daripada 3, separuh akhir & perlawanan akhir terbaik daripada 5', '22/10/2026', 'PTG',
    'Saingan Plate', 'Naib juara:', 'JUARA', 'AKHIR', 'LWN', 'Bracket utama'].forEach((w) => assert.ok(all.includes(w), 'shown in BM: ' + w));
});

// ---------- English unchanged ----------
const GOLDEN_VIEWER = path.join(__dirname, 'golden', 'viewer-en.json');
const GOLDEN_RENDER = path.join(__dirname, 'golden', 'render-en.json');
const htmlKey = (h) => String(h).replace(/ data-i18n(?:-attr)?="[^"]*"/g, '');
function viewerSnapshot(dir) {
  const out = {};
  renderScreens({ lang: 'en', dir }).forEach((s) => { out[s.id] = sha(visibleText(s.html)) + ' ' + sha(htmlKey(s.html)); });
  return out;
}
test('English unchanged: every English viewer screen shows exactly what it showed before the language switch (text and markup)', () => {
  if (process.env.UPDATE_GOLDEN) fs.writeFileSync(GOLDEN_VIEWER, JSON.stringify({ note: 'sha1 of the visible text, then of the HTML (data-i18n attributes removed), per screen of tests/lib/viewer-screens.js in English. Made from the viewer as it was before i18n step 2.', screens: viewerSnapshot(process.env.GOLDEN_VIEWER_DIR) }, null, 1) + '\n');
  const want = JSON.parse(fs.readFileSync(GOLDEN_VIEWER, 'utf8')).screens, got = viewerSnapshot();
  assert.deepEqual(Object.keys(got).sort(), Object.keys(want).sort(), 'the same screens');
  const diff = Object.keys(want).filter((k) => got[k] !== want[k]);
  assert.deepEqual(diff, [], 'English screens changed');
});

function renderOutputs(file) {
  const ctx = { console, Math, JSON, Date, Array, Object, String, Number, Set, Map, parseInt, parseFloat, isNaN,
    document: { createElement: () => ({ getContext: () => ({ font: '', measureText: (s) => ({ width: String(s).length * 7 }) }) }) } };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx);
  const out = {};
  buildEvents().forEach((ev) => {
    const t = ev.data; ctx.state = t;
    const put = (k, f) => { out[ev.key + ':' + k] = sha(f()); };
    (t.groups || []).filter((g) => g.gameStarted).forEach((g, i) => {
      put('std' + i, () => ctx.standingsTableHTML(g));
      put('tie' + i, () => ctx.tieNotesHTML(g, null, { public: true }) + ctx.tieNotesHTML(g));
    });
    const brs = [['ko', t.knockout], ['kol', t.knockoutLosers]].concat((t.pods || []).map((p) => ['pod' + p.label, p.bracket]));
    brs.forEach(([k, b]) => {
      if (!b || !b.rounds) return;
      put(k + ':chart', () => ctx.mirroredChartHTML(b, t, {}));
      put(k + ':interactive', () => ctx.mirroredChartHTML(b, t, { interactive: true, bracketKey: k }));
      put(k + ':readable', () => ctx.mirroredChartHTML(b, t, { readable: true, showVs: false }));
      put(k + ':rounds', () => b.rounds.map((r, i) => ctx.koRoundName(b, i)).join('|'));
    });
  });
  out.size = sha(ctx.mkoValidateBracketSize(256).message + ctx.bracketEntryName({ entriesList: [] }, 'x'));
  return out;
}
test('English unchanged for the organiser: render.js without a language draws byte-identical tables, tie notes and charts', () => {
  if (process.env.UPDATE_GOLDEN) fs.writeFileSync(GOLDEN_RENDER, JSON.stringify({ note: 'sha1 of render.js output (standings, tie notes, the three chart modes, round names) for each mock event, made from render.js before i18n step 2.', outputs: renderOutputs(process.env.GOLDEN_RENDER_JS || path.join(ROOT, 'render.js')) }, null, 1) + '\n');
  const want = JSON.parse(fs.readFileSync(GOLDEN_RENDER, 'utf8')).outputs, got = renderOutputs(path.join(ROOT, 'render.js'));
  assert.ok(Object.keys(want).length > 40);
  assert.deepEqual(got, want);
  // i18n step 3: the organiser app loads the same BM table (when BM is the language: its data-dd-ms script) and defines
  // DD_T (i18n/app-i18n.js); its English is the one above
  assert.match(read('app.html'), /<script src="render\.js"><\/script>\n[\s\S]*?<script data-dd-ms>[^<]*var DD_MS_FILES = \["i18n\/render\.ms\.js"/);
  assert.match(read('i18n/app-i18n.js'), /function DD_T\(key, vars\)\{ return T\(key, vars\); \}/);
});
test('render.js in BM: the viewer gets BM round names, badges and tie notes through DD_T; English with DD_T missing', () => {
  const m = loadViewer({ lang: 'ms' });
  m.__b = { rounds: [[1, 2, 3, 4, 5, 6, 7, 8], [1, 2, 3, 4], [1, 2], [1]] };
  assert.equal(runViewer(m, '[0,1,2,3].map(function(i){ return koRoundName(__b, i); }).join("|")'), 'Pusingan 16 terakhir|Suku akhir|Separuh akhir|Akhir');
  assert.equal(runViewer(m, 'mkoLabelWrap("Pusingan 16 terakhir")'), 'white-space:normal;text-align:center;line-height:1.15;');
  assert.equal(runViewer(m, 'mkoLabelWrap("Round of 128")'), 'white-space:nowrap;', 'no English round name ever wraps');
});

// ---------- the BM Help quotes the BM screen words exactly ----------
test('the BM spectator Help quotes every on-screen label exactly as the BM viewer shows it', () => {
  const help = read('viewer/ms/help.html').replace(/<script[\s\S]*?<\/script>/g, '');
  const dec = (s) => require('./lib/viewer-screens').decode(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
  const quotes = new Set();
  help.replace(/<b>([\s\S]*?)<\/b>/g, (m, x) => { quotes.add(dec(x)); return m; });
  help.replace(/&ldquo;([\s\S]*?)&rdquo;/g, (m, x) => { quotes.add(dec(x)); return m; });
  // Help prose, examples and codes that are not screen labels
  const PROSE = new Set(['', 'tidak', 'pemain', 'pasukan', 'Hakim / Iskandar', 'mana anak saya', 'Kumpulan round robin', 'Acara kalah mati', 'Acara Group Boards', 'Di mana pemain saya?',
    'Adakah ia sedang berlangsung?', '2 mata', '1 mata', '0 mata', '1 Aiden Tan', 'A1', 'B2', '1-2', 'P2-1', 'G2·1-1', '×', '1-1', 'Pemecah seri', 'pemecah seri']);
  const KNOWN_GAP = new Set();
  const values = Object.values(MS).concat(Object.values(RMS)).map((v) => require('./lib/viewer-screens').decode(v.replace(/<[^>]+>/g, '')));
  const pattern = (v) => new RegExp('^' + v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{\w+\\\}/g, '.+?') + '$');
  const pats = values.map(pattern);
  const corpus = bmScreens().map((s) => visibleText(s.html)).join('\n').replace(/\d+/g, '#');
  const ok = (q) => {
    const forms2 = [q, q.charAt(0).toLowerCase() + q.slice(1)];
    if (forms2.some((f) => values.some((v) => v === f || v.includes(f)))) return true;     // a whole value, or inside one
    if (forms2.some((f) => pats.some((p) => p.test(f)))) return true;                      // a value with its placeholders filled
    if (corpus.includes(q.replace(/\d+/g, '#'))) return true;                              // on a rendered BM screen (numbers aside)
    return false;
  };
  const bad = [...quotes].filter((q) => !PROSE.has(q) && !KNOWN_GAP.has(q) && !ok(q) && !q.split(/ · | \/ /).every((p) => ok(p) || /^~\d{1,2}:\d{2} P(TG|G)$/.test(p)));
  assert.deepEqual(bad, [], 'BM Help quotes a label the BM viewer does not show');
  assert.ok(quotes.size > 60, quotes.size + ' quotes checked');
  // the Help no longer says the event pages are English only
  assert.ok(!/Halaman acara masih dalam bahasa Inggeris/.test(read('viewer/ms/help.html')));
  assert.ok(!/event pages are in English for now/.test(read('viewer/help.html')));
});

// ---------- the switch ----------
function page(opts) {
  opts = opts || {};
  const doc = fakeDoc();
  const ls = opts.throws ? { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } } : memoryStore(opts.saved ? { 'dartdraw.lang': opts.saved } : {});
  if (opts.note && !opts.throws) ls.setItem('dartdraw.lang.note', opts.note);
  const calls = { replaceState: [] }, listeners = {};
  const html = read('viewer/index.html');
  const ctx = {
    console, Math, JSON, Date: FixedDate, Array, Object, String, Number, Set, Map, Intl, URLSearchParams, parseInt, parseFloat, isNaN, encodeURIComponent, decodeURIComponent,
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, document: doc,
    window: { matchMedia: () => ({ matches: true }), addEventListener(t, f) { (listeners[t] = listeners[t] || []).push(f); }, scrollTo(x, y) { calls.scrolled = y; }, scrollY: opts.scrollY || 0 },
    localStorage: ls, sessionStorage: memoryStore({}), location: { search: opts.search || '', pathname: '/live/' + (opts.slug == null ? 'chrsopensing1' : opts.slug), hash: opts.hash || '' },
    history: { length: 1, replaceState: (a, b, u) => calls.replaceState.push(u) }, navigator: { languages: opts.languages || ['en-GB'], language: (opts.languages || ['en-GB'])[0] },
    fetch: () => new Promise(() => {}),
  };
  vm.createContext(ctx);
  require('./lib/load-viewer').pageScripts(html).forEach((s, i) => vm.runInContext(s.file ? fs.readFileSync(s.file, 'utf8') : s.code, ctx, { filename: 'p' + i }));
  return { ctx, doc, ls, calls, listeners, R: (c) => vm.runInContext(c, ctx), el: (id) => doc.getElementById(id) };
}
function fakeDoc() {
  const els = {}, docL = {};
  const mk = (id) => ({ id, innerHTML: '', textContent: '', hidden: true, placeholder: '', value: '', attrs: {}, style: {}, classList: { toggle() {}, add() {}, remove() {} },
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; }, removeAttribute(k) { delete this.attrs[k]; },
    querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, focus() {}, contains: () => false });
  return { els, title: '', referrer: '', hidden: false, getElementById: (id) => els[id] || (els[id] = mk(id)), querySelector: () => null, querySelectorAll: () => [],
    createElement: (t) => (t === 'canvas' ? { getContext: () => ({ measureText: (s) => ({ width: String(s).length * 7 }) }) } : mk('')),
    addEventListener(t, f) { (docL[t] = docL[t] || []).push(f); }, docL, documentElement: mk('html'), body: { classList: { toggle() {} }, insertBefore() {}, firstChild: null } };
}
test('switch: English by default, also for a Malay browser; a saved choice is used; ?lang=ms|en wins, is saved and leaves the address', () => {
  assert.equal(page().R('ddLang()'), 'en');
  const malay = page({ languages: ['ms-MY', 'en'] });
  assert.equal(malay.R('ddLang()'), 'en', 'never chosen from the browser language');
  assert.equal(malay.doc.documentElement.attrs.lang, 'en');
  const saved = page({ saved: 'ms' });
  assert.equal(saved.R('ddLang()'), 'ms'); assert.equal(saved.doc.documentElement.attrs.lang, 'ms');
  assert.equal(saved.doc.title, 'Keputusan langsung');
  const q = page({ search: '?lang=ms&x=1', hash: '#/groups', saved: 'en' });
  assert.equal(q.R('ddLang()'), 'ms'); assert.equal(q.ls.data['dartdraw.lang'], 'ms');
  assert.deepEqual(q.calls.replaceState, ['/live/chrsopensing1?x=1#/groups'], 'the address keeps the rest of its query and its #route');
  const qe = page({ search: '?lang=en', saved: 'ms' });
  assert.equal(qe.R('ddLang()'), 'en'); assert.equal(qe.ls.data['dartdraw.lang'], 'en');
  assert.equal(page({ search: '?lang=fr' }).R('ddLang()'), 'en');
  const blocked = page({ throws: true, search: '?lang=ms' });
  assert.equal(blocked.R('ddLang()'), 'ms', 'storage blocked: ?lang still works for this page view');
  assert.equal(page({ throws: true }).R('ddLang()'), 'en');
});
test('switch: the "Bahasa Malaysia tersedia" note shows on an English page for a Malay first browser language with nothing saved, until closed', () => {
  const wanted = (o) => { const p = page(o); p.R('ddNoteUpdate()'); return p.el('langBar').hidden === false; };
  assert.equal(wanted({ languages: ['ms-MY', 'en'] }), true);
  assert.equal(wanted({ languages: ['ms'] }), true);
  assert.equal(wanted({ languages: ['en-MY', 'ms'] }), false, 'only the first language counts');
  assert.equal(wanted({ languages: ['ms-MY'], saved: 'en' }), false, 'a saved choice is respected');
  assert.equal(wanted({ languages: ['ms-MY'], saved: 'ms' }), false, 'already in BM');
  assert.equal(wanted({ languages: ['ms-MY'], note: 'closed' }), false, 'closed before');
  assert.equal(wanted({ languages: ['ms-MY'], throws: true }), true, 'works without storage');
  // the event page and the home page both carry it
  assert.match(read('viewer/index.html'), /<div class="langbar" id="langBar" lang="ms" hidden>[\s\S]*?Bahasa Malaysia tersedia[\s\S]*?data-lang-set="ms"[\s\S]*?data-langbar-close/);
  assert.match(read('viewer/home.js'), /getElementById\('langBar'\); if\(note\) document\.body\.insertBefore\(note, root\)/);
  // a click on its link switches to BM and hides it; the x closes it for good
  const p = page({ languages: ['ms-MY'] }); p.R('ddNoteUpdate()');
  const click = (target) => p.doc.docL.click.forEach((f) => f({ target, preventDefault() {} }));
  const link = { closest: (s) => (s === '[data-lang-set]' ? link : null), getAttribute: () => 'ms', focus() {} };
  click(link);
  assert.equal(p.R('ddLang()'), 'ms'); assert.equal(p.ls.data['dartdraw.lang'], 'ms'); assert.equal(p.el('langBar').hidden, true);
  const x = { closest: (s) => (s === '[data-langbar-close]' ? x : null) };
  const p2 = page({ languages: ['ms-MY'] }); p2.R('ddNoteUpdate()');
  p2.doc.docL.click.forEach((f) => f({ target: x, preventDefault() {} }));
  assert.equal(p2.el('langBar').hidden, true); assert.equal(p2.ls.data['dartdraw.lang.note'], 'closed');
});
test('switch: changing language redraws the page in place and keeps the tab, the route, Me / Following, the open keys and the scroll position', () => {
  const ev = buildEvents().find((e) => e.key === 'A');
  const p = page({ hash: '#/groups', scrollY: 640 });
  p.ctx.__v = require('../viewer/api/_lib/publicView').toPublicView(ev.data);
  p.R("state = __v; state.tieBreakOrder = state.tieBreakOrder || ['Head-to-head result','Leg difference','Legs won','Organiser decision / playoff']; state.entriesList = state.entriesList || []; lastUpdatedAt = new Date().toISOString(); lastOkAt = Date.now();");
  const ids = ev.data.entriesList.map((e) => e.id); p.ctx.__ids = ids;
  p.R("setMe(__ids[0]); toggleFollow(__ids[1]); setKeyOpen('g:' + state.groups[0].id, true); render(); setStatus();");
  const before = { app: p.el('app').innerHTML, nav: p.el('navLinks').innerHTML };
  assert.match(before.app, /Top 2 in each group went through to the knockout/); assert.match(before.nav, />Groups</);
  p.R("ddSetLang('ms')");
  assert.equal(p.ctx.location.hash, '#/groups', 'the route stays');
  assert.match(p.el('app').innerHTML, /2 teratas setiap kumpulan telah mara ke peringkat kalah mati/);
  assert.match(p.el('navLinks').innerHTML, /class="on" aria-current="page">Kumpulan</); assert.match(p.el('navLinks').innerHTML, />Diikuti \(1\)</);
  assert.match(p.el('app').innerHTML, /aria-expanded="true"[^>]*>Apakah maksud lajur\?/, 'the open key stays open');
  assert.match(p.el('hStatus').innerHTML, /Langsung/); assert.equal(p.doc.title, "Men's Singles · Keputusan langsung");
  assert.equal(p.calls.scrolled, 640, 'the scroll position is put back');
  assert.equal(p.R('myId()'), ids[0]); assert.deepEqual([...p.R('followIds()')], [ids[1]]);
  assert.equal(p.doc.documentElement.attrs.lang, 'ms'); assert.equal(p.ls.data['dartdraw.lang'], 'ms');
  assert.equal(p.el('hHelp').attrs.href, '/ms/help?from=chrsopensing1', 'Help in BM, still knowing the event');
  assert.match(p.el('app').innerHTML, /href="\/ms\/help\?from=chrsopensing1#q-columns"/);
  p.R("ddSetLang('en')");
  assert.equal(p.el('app').innerHTML, before.app, 'and back to exactly the English page');
  assert.equal(p.el('hHelp').attrs.href, '/help?from=chrsopensing1');
  // a whole-page message is shown again in the new language
  const gone = page({ slug: 'chrsopensing1' }); gone.R("showMessage('ev.msg.goneTitle', 'ev.msg.goneText', true); ddSetLang('ms')");
  assert.match(gone.el('app').innerHTML, /Keputusan tidak tersedia[\s\S]*Lihat semua acara/);
  // another tab's choice arrives by the storage event
  const other = page(); other.ls.setItem('dartdraw.lang', 'ms');
  other.listeners.storage.forEach((f) => f({ key: 'dartdraw.lang', newValue: 'ms' }));
  assert.equal(other.R('ddLang()'), 'ms');
});
test('switch: the markup: an EN | BM pair left of the theme pill on the event page; the home page has the pair and a one-button toggle for phones', () => {
  const idx = read('viewer/index.html');
  assert.match(idx, /<div class="hdr-tools">\s*<div class="langsw" role="group" aria-label="Language \/ Bahasa"><button type="button" lang="en" aria-label="English" data-lang-set="en" aria-pressed="true">EN<\/button><button type="button" lang="ms" aria-label="Bahasa Malaysia" data-lang-set="ms" aria-pressed="false">BM<\/button><\/div>\s*<div class="themesw"/);
  const h = loadHome({ lang: 'ms' });
  const hdr = vm.runInContext('hmHeaderHTML()', h);
  assert.match(hdr, /<span class="hm-lang"><div class="langsw" role="group" aria-label="Language \/ Bahasa">.*aria-pressed="true">BM<\/button><\/div><button type="button" class="langtog" data-lang-set="en" lang="en" aria-label="Switch to English">EN<\/button><\/span>/);
  assert.match(hdr, /placeholder="Cari acara atau tampal kod"/); assert.match(hdr, />Bantuan</);
  assert.match(vm.runInContext('hmHeaderHTML()', loadHome()), /class="langtog" data-lang-set="ms" lang="ms" aria-label="Tukar ke Bahasa Malaysia">BM</);
  const css = read('viewer/home.css') + read('viewer/theme.css');
  assert.match(css, /\.langtog\{display:none/); assert.match(css, /@media \(max-width:480px\)\{[^}]*\.hm-lang \.langsw\{display:none\}/);
  ['viewer/i18n/en.js', 'viewer/i18n/ms.js', 'viewer/i18n/i18n.js', 'viewer/i18n/render.ms.js'].forEach((f) => assert.ok(fs.existsSync(path.join(ROOT, f)), f));
  // the page loads the tables before home.js and its own script; the BM tables only through the data-dd-ms loader
  const tag = (s) => idx.indexOf('<script src="' + s + '">');
  const order = [tag('/render.js'), tag('/i18n/en.js'), idx.indexOf('<script data-dd-ms>'), tag('/i18n/i18n.js'), tag('/home.js')];
  assert.ok(order.every((x, i) => x > 0 && (i === 0 || x > order[i - 1])), 'script order ' + order);
  assert.equal(tag('/i18n/render.ms.js'), -1); assert.equal(tag('/i18n/ms.js'), -1);
  assert.deepEqual(require('./lib/load-app').msFiles(idx.slice(idx.indexOf('<script data-dd-ms>'))), ['/i18n/render.ms.js', '/i18n/ms.js']);
});

// ---------- the server sends codes and numbers ----------
test('publicView and listView send codes and numbers: no English table text leaves the server, only the organiser\'s own names', () => {
  const lv = require('../viewer/api/_lib/listView'), { toPublicView } = require('../viewer/api/_lib/publicView');
  const events = buildEvents();
  const names = new Set(organiserText());
  const CODE_FIELDS = new Set(['formatType', 'eventType', 'competitionUnit', 'tieBreakOrder', 'key', 'state', 'status', 'stage', 'round', 'next', 'format', 'unit', 'advanceMode', 'date', 'start', 'slug', 'updatedAt', 'generatedAt', 'finalizedAt', 'id', 'label', 'podLabel']);
  const enValues = new Set(tableText(EN).concat(tableText(REN)).map((s) => s.trim()).filter((s) => /[a-z]{3}/.test(s) && s.split(/\s+/).length >= 2));
  const strings = [];
  const walk = (o, k) => { if (typeof o === 'string') { if (!CODE_FIELDS.has(k) && !names.has(o) && !/^[a-z0-9_:-]+$/i.test(o)) strings.push(k + '=' + o); } else if (o && typeof o === 'object') Object.keys(o).forEach((x) => walk(o[x], Array.isArray(o) ? k : x)); };
  events.forEach((e) => { walk(toPublicView(e.data), ''); walk(lv.stagesOf(e.data), ''); });
  walk(lv.buildList(events.map((e) => ({ slug: e.slug, data: e.data, updated_at: new Date(NOW - e.ageMin * 60000).toISOString() })), NOW), '');
  assert.deepEqual(strings.filter((s) => [...enValues].some((v) => s.includes(v))), []);
  // the event's stage, round and next are codes from a short list
  const list = lv.buildList(events.map((e) => ({ slug: e.slug, data: e.data, updated_at: new Date(NOW - e.ageMin * 60000).toISOString() })), NOW);
  list.live.forEach((it) => { if (it.progress) { assert.match(it.progress.stage, /^(groups|knockout|finals)$/); if (it.progress.next) assert.match(it.progress.next, /^(awaiting|knockout|finals)$/); } });
});

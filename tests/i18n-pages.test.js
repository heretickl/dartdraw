const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// i18n step 1: the public pages and both Help pages in English and Bahasa Malaysia.
//   EN words: scripts/i18n/en/landing.js, scripts/help-content.js, viewer/help.html
//   BM words: scripts/i18n/ms/landing.js, scripts/i18n/ms/help-content.js, viewer/ms/help.html
// These tests keep the two languages in step (same ids, anchors, links and accessible structure), check the BM is really
// BM (no English paragraph left, no empty text, the glossary's forbidden words absent, quoted buttons as in the BM UI
// table) and check the routing and search-engine links. The switch's behaviour is in i18n-switch.test.js.
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const build = require('../scripts/build-landing');
const EN_HELP = require('../scripts/help-content'), MS_HELP = require('../scripts/i18n/ms/help-content');
const EN_W = require('../scripts/i18n/en/landing'), MS_W = require('../scripts/i18n/ms/landing');
const UI = require('../docs/i18n/ui-strings-ms.js');
const PAIRS = [['index.html', 'ms/index.html'], ['features.html', 'ms/features.html'], ['how-it-works.html', 'ms/how-it-works.html'], ['help.html', 'ms/help.html']];
const VIEWER = ['viewer/help.html', 'viewer/ms/help.html'];

const markup = (s) => s.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<!--[\s\S]*?-->/g, '');
const ent = (s) => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&hellip;/g, '…').replace(/&rarr;/g, '→').replace(/&#8599;/g, '↗').replace(/&mdash;/g, '—')
  .replace(/&ndash;/g, '–').replace(/&#9734;/g, '☆').replace(/&times;/g, '×').replace(/&#10005;/g, '✕').replace(/&rsquo;/g, '’').replace(/&lsquo;/g, '‘')
  .replace(/&ldquo;|&rdquo;/g, '"').replace(/&middot;/g, '·').replace(/&lsaquo;/g, '‹').replace(/&uarr;/g, '↑').replace(/&#\d+;|&[a-z]+;/g, ' ');
const plain = (s) => ent(String(s).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const ids = (s) => [...markup(s).matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
const hashLinks = (s) => [...markup(s).matchAll(/href="(#[^"]*)"/g)].map((m) => m[1]);
/* the accessible structure: landmarks, roles, aria attribute names, headings levels, form controls, details/summary */
const a11y = (s) => [...markup(s).matchAll(/<(h[1-6]|nav|main|header|footer|section|article|form|input|label|button|details|summary|dialog|iframe|ol|ul|dl)\b|\s(role|aria-[a-z]+)=/g)].map((m) => m[1] || m[2]).join(' ');
/* text blocks a reader sees */
const blocks = (s) => [...markup(s).matchAll(/<(p|li|dt|dd|h[1-6]|summary|figcaption|label|th|td|span class="see"|span class="eg")\b[^>]*>([\s\S]*?)(?=<\/?(?:p|li|dt|dd|h[1-6]|summary|ul|ol|dl|div|section|details|label|th|td)\b)/g)].map((m) => plain(m[2])).filter(Boolean);

// ---------- parity: the same ids, anchors, links and structure in both languages ----------
test('organiser Help content: the BM module has the same sections, items, aliases, claims, ids and #links, in the same order', () => {
  assert.equal(MS_HELP.sections.length, EN_HELP.sections.length);
  EN_HELP.sections.forEach((sec, si) => {
    const ms = MS_HELP.sections[si];
    assert.equal(ms.id, sec.id); assert.equal(ms.kind, sec.kind); assert.deepEqual(ms.aliases || [], sec.aliases || [], sec.id + ' aliases');
    assert.ok(String(ms.title).trim(), sec.id + ' title');
    assert.deepEqual(ms.items.map((i) => i.id), sec.items.map((i) => i.id), sec.id + ' items');
    sec.items.forEach((it, ii) => {
      const m = ms.items[ii];
      assert.deepEqual(m.aliases || [], it.aliases || [], it.id + ' aliases');
      assert.deepEqual(m.claims || [], it.claims || [], it.id + ' claims');
      assert.deepEqual(ids(m.body), ids(it.body), it.id + ' ids (h4 anchors, steps, glossary terms)');
      assert.deepEqual(hashLinks(m.body), hashLinks(it.body), it.id + ' #links');
      assert.deepEqual(a11y(m.body), a11y(it.body), it.id + ' structure');
      assert.equal(!!m.summary, !!it.summary, it.id + ' summary');
      assert.ok(m.keywords && it.keywords !== undefined, it.id + ' has BM search keywords');
    });
  });
  assert.equal(MS_HELP.search.popular.map((p) => p.id).join(), EN_HELP.search.popular.map((p) => p.id).join());
  assert.equal(MS_HELP.VIEWER_HELP_URL, EN_HELP.VIEWER_URL + '/ms/help', 'BM organiser Help links to the BM spectator Help');
});

test('public page words: the BM file has exactly the keys, list lengths and value types of the English file, none empty', () => {
  const shape = (a, b, at) => {
    if (/\.search\.(count|near)$/.test(at) && typeof b === 'string') { assert.ok(b.includes('{n}'), at); return; }   // BM has one form for every number
    assert.equal(typeof b, typeof a, at);
    if (Array.isArray(a)) { assert.ok(Array.isArray(b), at); assert.equal(b.length, a.length, at + ' length'); a.forEach((x, i) => shape(x, b[i], at + '[' + i + ']')); return; }
    if (a && typeof a === 'object') { assert.deepEqual(Object.keys(b).sort(), Object.keys(a).sort(), at + ' keys'); Object.keys(a).forEach((k) => shape(a[k], b[k], at + '.' + k)); return; }
    if (typeof a === 'string') {
      assert.ok(b.trim().length > 0, at + ' is empty');
      assert.deepEqual((b.match(/<[a-z]+/g) || []).sort(), (a.match(/<[a-z]+/g) || []).sort(), at + ' inline tags');
      assert.deepEqual((b.match(/href="[^"]*"/g) || []), (a.match(/href="[^"]*"/g) || []), at + ' links');
    }
  };
  shape(EN_W, MS_W, 'landing');
  assert.equal(EN_W.lang, 'en'); assert.equal(MS_W.lang, 'ms');
});

test('generated pages: each BM page has the ids, #links, accessible structure and (mapped) site links of its English twin', () => {
  // the switch and the note link to the other language on purpose; every other link maps /ms/x to /x
  const noSwitch = (h) => h.replace(/<div class="langsw"[\s\S]*?<\/div>/, '').replace(/<div class="langbar"[\s\S]*?<\/div><\/div>/, '');
  const toEn = (h) => h.replace(/href="\/ms"/g, 'href="/"').replace(/href="\/ms\//g, 'href="/').replace(/\/ms\/help"/g, '/help"');
  const links = (h) => [...markup(noSwitch(h)).matchAll(/<a [^>]*href="([^"#][^"]*)"/g)].map((m) => m[1]);
  PAIRS.forEach(([en, ms]) => {
    const E = read(en), M = read(ms);
    assert.deepEqual(ids(M), ids(E).filter((x) => x !== 'langBar'), ms + ' ids');
    assert.deepEqual(hashLinks(M), hashLinks(E), ms + ' #links');
    assert.equal(a11y(noSwitch(M)), a11y(noSwitch(E)), ms + ' structure');
    assert.deepEqual(links(toEn(M)), links(E), ms + ' site links');
    assert.ok(links(M).some((u) => u.startsWith('/ms')), ms + ' links stay in BM');
  });
  VIEWER.slice(0, 1).forEach(() => {
    const E = read(VIEWER[0]), M = read(VIEWER[1]);
    assert.deepEqual(ids(M), ids(E).filter((x) => x !== 'langBar'), 'viewer ids');
    assert.deepEqual(hashLinks(M), hashLinks(E), 'viewer #links');
    assert.equal(a11y(noSwitch(M)), a11y(noSwitch(E)), 'viewer structure');
    const kw = (h) => [...h.matchAll(/<details class="q" id="([^"]+)" data-keywords="([^"]*)">/g)];
    assert.equal(kw(M).length, kw(E).length);
    kw(M).forEach((m) => { assert.match(m[2], /^[a-z0-9 ]+$/, m[1] + ' keywords are plain words'); assert.ok(m[2].split(' ').length >= 5, m[1] + ' has BM keywords'); });
  });
});

test('every BM page is complete: lang ms, a BM title and description, the twin language links, canonical and x-default', () => {
  const site = build.SITE_URL, V = EN_HELP.VIEWER_URL;
  const pages = [
    ['index.html', 'en', site + '/', site + '/', site + '/ms'], ['ms/index.html', 'ms', site + '/ms', site + '/', site + '/ms'],
    ['features.html', 'en', site + '/features', site + '/features', site + '/ms/features'], ['ms/features.html', 'ms', site + '/ms/features', site + '/features', site + '/ms/features'],
    ['how-it-works.html', 'en', site + '/how-it-works', site + '/how-it-works', site + '/ms/how-it-works'], ['ms/how-it-works.html', 'ms', site + '/ms/how-it-works', site + '/how-it-works', site + '/ms/how-it-works'],
    ['help.html', 'en', site + '/help', site + '/help', site + '/ms/help'], ['ms/help.html', 'ms', site + '/ms/help', site + '/help', site + '/ms/help'],
    ['viewer/help.html', 'en', V + '/help', V + '/help', V + '/ms/help'], ['viewer/ms/help.html', 'ms', V + '/ms/help', V + '/help', V + '/ms/help']
  ];
  pages.forEach(([f, lang, canon, en, ms]) => {
    const h = read(f);
    assert.match(h, new RegExp('<html lang="' + lang + '">'), f);
    assert.ok(h.includes('<link rel="canonical" href="' + canon + '">'), f + ' canonical');
    assert.ok(h.includes('<link rel="alternate" hreflang="en" href="' + en + '">'), f + ' hreflang en');
    assert.ok(h.includes('<link rel="alternate" hreflang="ms" href="' + ms + '">'), f + ' hreflang ms');
    assert.ok(h.includes('<link rel="alternate" hreflang="x-default" href="' + en + '">'), f + ' x-default');
  });
  PAIRS.concat([VIEWER]).forEach(([en, ms]) => {
    const t = (h) => h.match(/<title>([^<]+)<\/title>/)[1], d = (h) => h.match(/<meta name="description" content="([^"]+)">/)[1];
    assert.notEqual(t(read(ms)), t(read(en)), ms + ' has its own title');
    assert.notEqual(d(read(ms)), d(read(en)), ms + ' has its own description');
    assert.match(t(read(ms)), /DartDraw/);
  });
  assert.match(read('ms/help.html'), /<h1 id="helpH">Bantuan untuk penganjur<\/h1>/);
  assert.match(read('viewer/ms/help.html'), /<h1>Bantuan<\/h1>/);
});

// ---------- the BM is BM ----------
const EN_STOP = new Set('the and of to is you your a in for with on it that this are be or not can if when then there they their what which who will was has have from by as at an'.split(' '));
const KEPT = new Set('bracket board boards bye byes seed seeds leg legs walkover wo round robin plate h2h tb group boards dartdraw live pdf qr wi-fi f5 f11 head-to-head lineup sheet marker feature finals oche tv'.split(' '));
function englishShare(text) {
  const w = text.toLowerCase().split(/[^a-z0-9À-ɏ-]+/).filter((x) => x && !KEPT.has(x));
  if (w.length < 8) return 0;
  return w.filter((x) => EN_STOP.has(x)).length / w.length;
}
test('no English paragraph is left on a BM page (share of English stop words in every text block), and none is empty', () => {
  const bad = [];
  ['ms/index.html', 'ms/features.html', 'ms/how-it-works.html', 'ms/help.html', 'viewer/ms/help.html'].forEach((f) => {
    const bs = blocks(read(f));
    assert.ok(bs.length > 20, f + ' blocks: ' + bs.length);
    bs.forEach((b) => { if (englishShare(b) > 0.12) bad.push(f + ': ' + b.slice(0, 120)); });
  });
  assert.deepEqual(bad, []);
  // the heuristic does catch English: every English page fails it many times
  assert.ok(blocks(read('help.html')).filter((b) => englishShare(b) > 0.12).length > 100);
  // no empty text in the BM Help content
  MS_HELP.sections.forEach((s) => s.items.forEach((it) => {
    [...it.body.matchAll(/<(p|li|dt|dd|h4)\b[^>]*>([\s\S]*?)<\/\1>/g)].forEach((m) => assert.ok(plain(m[2]).length > 0, it.id + ' has an empty ' + m[1]));
    assert.ok(plain(it.title).length > 3 && (!it.summary || plain(it.summary).length > 10), it.id);
  }));
});

test('glossary: the forbidden BM words are absent, a tie is "sama mata", the draw is "membuat undian", bracket is glossed in running text', () => {
  const texts = ['ms/index.html', 'ms/features.html', 'ms/how-it-works.html', 'ms/help.html', 'viewer/ms/help.html'].map((f) => [f, plain(markup(read(f)))]);
  const FORBIDDEN = [/\bbagan\b/i, /\bpapan\b/i, /\bmengundi(nya)?\b/i, /\bundi kumpulan\b/i, /\bdua belah\b/i, /\bkaki penaja\b/i, /\bbersemuka\b/i, /\bmelog keluar\b/i,
    /\bkata sandi\b/i, /\bunduh\b/i, /\bsurel\b/i, /\bpemarkahan\b/i, /\bsenarai rata\b/i, /\bjejak organisasi\b/i, /\btidak pernah\b/i, /\bnama keluarga\b/i];
  texts.forEach(([f, t]) => FORBIDDEN.forEach((re) => assert.doesNotMatch(t, re, f + ' ' + re)));
  // "keputusan seri" only for a drawn match: where there are none, or one was saved in an older event
  const seri = texts.reduce((a, [f, t]) => a.concat((t.match(/.{0,40}keputusan seri.{0,30}/gi) || []).map((x) => f + ': ' + x)), []);
  assert.ok(seri.every((x) => /Tiada keputusan seri[.:]|tiada keputusan seri disimpan|keputusan seri yang disimpan dalam acara|kini tiada keputusan seri/.test(x)), seri.join('\n'));
  const help = texts.find(([f]) => f === 'ms/help.html')[1];
  // "Marker" stays "Marker" in BM (owner, 2026-10-29)
  ['sama mata', 'kedudukan sama mata', 'membuat undian', 'carta dua bahagian', 'Keputusan muktamad', 'Marker', 'Mendatang', 'Group Boards', 'peserta'].forEach((w) => assert.ok(help.includes(w), 'uses ' + w));
  // the first running-text mention of bracket in an article (not a label in <b>) carries the gloss
  const missing = [];
  MS_HELP.sections.forEach((s) => s.items.forEach((it) => {
    const running = plain(it.body.replace(/<b>[\s\S]*?<\/b>/g, ' ').replace(/<h4[\s\S]*?<\/h4>/g, ' ').replace(/<dt[\s\S]*?<\/dt>/g, ' '));
    if (/\bbracket\b/i.test(running) && !/bracket \(carta kalah mati\)|carta kalah mati/.test(running)) missing.push(it.id);
  }));
  assert.deepEqual(missing, [], 'articles that mention bracket without "(carta kalah mati)"');
  ['ms/features.html', 'viewer/ms/help.html'].forEach((f) => assert.ok(texts.find(([g]) => g === f)[1].includes('bracket (carta kalah mati)'), f));
});

test('every button or label the English Help quotes in bold is quoted in the BM Help with the BM UI string (docs/i18n/ui-strings-ms.js)', () => {
  const norm = (s) => plain(s);
  const RXN = UI.RX.filter((r) => typeof r[1] === 'string' && /\\d/.test(r[0].source));
  const tr = (s) => { if (UI.D[s] != null) return UI.D[s]; for (const [re, rep] of RXN) if (re.test(s)) return s.replace(re, rep); return null; };
  const bolds = (h) => [...h.matchAll(/<b>([\s\S]*?)<\/b>/g)].map((m) => norm(m[1]));
  const wrong = [];
  let checked = 0;
  EN_HELP.sections.forEach((s, si) => s.items.forEach((it, ii) => {
    const mb = bolds(MS_HELP.sections[si].items[ii].body);
    bolds(it.body).forEach((b) => { const t = tr(b); if (t == null) return; checked++; if (!mb.includes(norm(t))) wrong.push(it.id + ': "' + b + '" should be "' + t + '"'); });
  }));
  assert.deepEqual(wrong, []);
  assert.ok(checked > 250, 'labels checked: ' + checked);
  // the labels coined for the Help are recorded for the app step
  const needed = read('docs/i18n/ui-strings-needed.md');
  ['Terbitkan keputusan sekarang', 'Kosongkan keputusan', 'Tandakan tidak hadir sebagai gantinya', 'Cuba acara contoh', 'Perubahan skor terakhir', 'Pergi ke sana'].forEach((w) => assert.ok(needed.includes(w) && JSON.stringify(UI.D).includes(w), w));
  // the stage names are the glossary's
  ['Cipta acara', 'Format &amp; penjenamaan', 'Butiran carta', 'Sahkan &amp; Cetak Bracket', 'Urus Kejohanan', 'Muktamadkan Kedudukan', 'Cetak Carta Akhir']
    .forEach((s) => assert.ok(read('ms/how-it-works.html').includes('<h3>' + s + '</h3>'), s));
});

// ---------- routing ----------
test('vercel.json serves /ms, /ms/features, /ms/how-it-works and /ms/help from the ms/ files, and keeps the English routes', () => {
  const cfg = JSON.parse(read('vercel.json'));
  const rw = (src) => (cfg.rewrites.find((r) => r.source === src) || {}).destination;
  assert.equal(rw('/ms'), '/ms/index.html'); assert.equal(rw('/ms/features'), '/ms/features.html');
  assert.equal(rw('/ms/how-it-works'), '/ms/how-it-works.html'); assert.equal(rw('/ms/help'), '/ms/help.html');
  ['/ms/index.html', '/ms/features.html', '/ms/how-it-works.html', '/ms/help.html'].forEach((f) => assert.ok(fs.existsSync(path.join(root, f))));
  assert.equal(rw('/features'), '/features.html'); assert.equal(rw('/help'), '/help.html'); assert.equal(rw('/app'), '/app.html');
  const v = JSON.parse(read('viewer/vercel.json'));
  assert.ok(v.rewrites.some((r) => r.source === '/ms/help' && r.destination === '/ms/help.html'));
  assert.ok(v.rewrites.some((r) => r.source === '/help' && r.destination === '/help.html'));
  assert.ok(v.rewrites.some((r) => r.source === '/live/:slug'));
  assert.ok(fs.existsSync(path.join(root, 'viewer/ms/help.html')));
});

test('the switch on every page: two links in a labelled group, lang and hreflang set, the current one marked, the other going to the twin', () => {
  const R = build.ROUTES, all = [];
  ['landing', 'features', 'how', 'help'].forEach((k) => { all.push([build.FILES.en[k], 'en', R.ms[k]]); all.push([build.FILES.ms[k], 'ms', R.en[k]]); });
  all.push(['viewer/help.html', 'en', '/ms/help'], ['viewer/ms/help.html', 'ms', '/help']);
  all.forEach(([f, lang, twin]) => {
    const h = markup(read(f));
    const sw = h.match(/<div class="langsw" role="group" aria-label="Language \/ Bahasa">([\s\S]*?)<\/div>/);
    assert.ok(sw, f + ' has the switch'); assert.equal((h.match(/class="langsw"/g) || []).length, 1, f);
    const a = [...sw[1].matchAll(/<a ([^>]*)>([^<]*)<\/a>/g)];
    assert.deepEqual(a.map((m) => m[2]), ['EN', 'BM'], f);
    const attr = (m, k) => (m[1].match(new RegExp('\\s?' + k + '="([^"]*)"')) || [])[1];
    assert.deepEqual(a.map((m) => [attr(m, 'lang'), attr(m, 'hreflang'), attr(m, 'aria-label'), attr(m, 'data-lang-set')]), [['en', 'en', 'English', 'en'], ['ms', 'ms', 'Bahasa Malaysia', 'ms']], f);
    const cur = a.find((m) => attr(m, 'aria-current') === 'true'), other = a.find((m) => attr(m, 'aria-current') !== 'true');
    assert.equal(attr(cur, 'lang'), lang, f + ' current language'); assert.equal(attr(other, 'href'), twin, f + ' twin link');
    assert.equal(/id="langBar"/.test(h), lang === 'en', f + ' the BM note is only on English pages');
  });
  // finger-sized: the CSS gives each link at least 34 x 36 px on phones (44 x 38 on desktop)
  assert.match(read('index.html'), /\.langsw a\{[^}]*min-width:44px;min-height:38px/);
  assert.match(read('index.html'), /@media \(max-width:480px\)\{\.nav \.langsw\{margin:0\}\.langsw a\{min-width:34px;min-height:36px/);
  assert.match(read('viewer/help.css'), /\.langsw a\{[^}]*min-width:40px;min-height:36px/);
  // the viewer header wrapper must not be ".tools": theme.css styles ".tools button" (dark text), which hid Light / Dark
  VIEWER.forEach((f) => { assert.match(read(f), /<div class="hdr-tools">\s*<div class="langsw"/, f); assert.doesNotMatch(read(f), /<div class="tools">/, f); });
});

test('the viewer Help pages carry the very same language scripts as the generator (one behaviour on both sites)', () => {
  const s = (f, id) => (read(f).match(new RegExp('<script id="' + id + '">[\\s\\S]*?</script>')) || [''])[0];
  assert.equal(s('viewer/help.html', 'dd-lang'), build.langHead({ lang: 'en', key: 'help', twin: '/ms/help' }).trim());
  assert.equal(s('viewer/ms/help.html', 'dd-lang'), build.langHead({ lang: 'ms', key: 'help', twin: '/help' }).trim());
  VIEWER.forEach((f) => assert.equal(s(f, 'dd-lang-ui'), build.langUi({}).trim(), f));
  // the BM spectator Help runs the same page scripts as the English one
  ['faq-search', 'faq-from', 'faq-theme'].forEach((id) => assert.equal(s(VIEWER[1], id), s(VIEWER[0], id), id));
  // the viewer's own pages send people to the Help in their saved language
  assert.match(read('viewer/home.js'), /function hmLangHref\(href\)/);
  assert.match(read('viewer/index.html'), /return typeof hmLangHref === 'function' \? hmLangHref\(h\) : h;/);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { parse } = require('./lib/mini-dom');
const { msFiles } = require('./lib/load-app');

// The static markup of the organiser app (app.html: banners, compact bar, sidebar, top bar) and of the viewer page
// (viewer/index.html: note, header, footer) in Bahasa Malaysia. The vm tests of app-i18n / viewer-i18n only see the words
// the scripts write; these words are in the HTML itself and reach BM only through data-i18n / data-i18n-html /
// data-i18n-attr (or the app's DD_STATIC_SEL list). Each page's real markup is parsed (tests/lib/mini-dom.js), the real
// runtime applies its BM tables to it, and then:
//   1. every English text and every aria-label / title / placeholder / alt of the markup has a key (or is on the short
//      list below: brand, symbols, the EN | BM switch and the bilingual "Bahasa Malaysia tersedia" note, and the few
//      elements a script fills before they are shown);
//   2. after the BM pass none of those English texts is left anywhere in the page (a key whose BM is still English, or a
//      key that was dropped, fails here).
// The sign-in pages have the same check in tests/auth-i18n.test.js ("no English left"); the public pages are generated
// in both languages (tests/i18n-pages.test.js).
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

// the same words in both languages, by design
const SAME = new Set(['D', 'DartDraw', 'EN', 'BM', '×', '?', '▾', '-', '‹', '·', 'Language / Bahasa', 'English', 'Bahasa Malaysia',
  'Auto']);   // the viewer's colour theme "Auto" is the same word in BM (viewer/i18n/ms.js theme.auto)
const ATTRS = ['aria-label', 'title', 'placeholder', 'alt'];

// mini-dom has no innerHTML: data-i18n-html needs it (trusted table markup)
function withInnerHTML(doc) {
  const proto = Object.getPrototypeOf(doc.createElement('x'));
  if (!Object.getOwnPropertyDescriptor(proto, 'innerHTML')) {
    Object.defineProperty(proto, 'innerHTML', {
      configurable: true,
      get() { return this.textContent; },
      set(html) { this.textContent = ''; const frag = parse(String(html)); frag.childNodes.slice().forEach((c) => this.appendChild(c)); },
    });
  }
  return doc;
}
// The page's markup as a document: the scripts' text is left out of the walk (not shown), <html> is documentElement.
function pageDoc(file) {
  const doc = withInnerHTML(parse(read(file)));
  doc.documentElement = doc.querySelector('html');
  doc.head = doc.querySelector('head');
  const make = doc.createElement.bind(doc);   // render.js measures text on a canvas when it loads
  doc.createElement = (t) => { const e = make(t); if (t === 'canvas') e.getContext = () => ({ font: '', measureText: (s) => ({ width: String(s).length * 7 }) }); return e; };
  return doc;
}
// every shown text of the body (text nodes and the read-aloud attributes), with the element it belongs to
function strings(doc, skip) {
  const out = [];
  (function walk(n) {
    n.childNodes.forEach((c) => {
      if (c.nodeType === 3) { const s = c.nodeValue.replace(/\s+/g, ' ').trim(); if (s) out.push({ s, el: n, kind: 'text' }); return; }
      if (c.nodeType !== 1 || /^(SCRIPT|STYLE|TEMPLATE)$/.test(c.tagName) || skip(c)) return;
      ATTRS.forEach((a) => { if (c.hasAttribute(a) && c.getAttribute(a).trim()) out.push({ s: c.getAttribute(a).trim(), el: c, kind: a }); });
      walk(c);
    });
  })(doc.body);
  return out.filter((x) => !SAME.has(x.s));
}
const keyed = (el, kind, staticSel) => {
  if (kind !== 'text') return String(el.getAttribute('data-i18n-attr') || '').split(';').some((p) => p.split(':')[0].trim() === kind);
  for (let n = el; n && n.nodeType === 1; n = n.parentNode) {
    if (n.hasAttribute('data-i18n') || n.hasAttribute('data-i18n-html')) return true;
    if (staticSel.some((sel) => n.matches(sel))) return true;
  }
  return false;
};
const where = (x) => x.el.tagName.toLowerCase() + (x.el.id ? '#' + x.el.id : '') + (x.el.className ? '.' + x.el.className.split(/\s+/).join('.') : '') + ' ' + x.kind + ' "' + x.s + '"';

// Runs a page's i18n runtime on its parsed markup with BM saved, the BM tables loaded as its data-dd-ms script names them.
function applyBM(file, base, english, runtime, after) {
  const html = read(file), doc = pageDoc(file);
  const store = { 'dartdraw.lang': 'ms' };
  const ctx = {
    document: doc, console: { warn() {}, error() {}, log() {} }, JSON, Object, Array, String, Number, Intl, Date, Math,
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem() {} },
    location: { search: '', pathname: '/', hash: '' }, history: { replaceState() {} },
    navigator: { languages: ['en-GB'], language: 'en-GB' },
  };
  ctx.window = { addEventListener() {} };
  vm.createContext(ctx);
  const loader = html.match(/<script data-dd-ms>[\s\S]*?<\/script>/)[0];
  english.concat(msFiles(loader), runtime).forEach((f) => vm.runInContext(fs.readFileSync(path.join(base, f.replace(/^\//, '')), 'utf8'), ctx, { filename: f }));
  if (after) vm.runInContext(after, ctx);
  vm.runInContext('ddApplyStatic()', ctx);
  assert.equal(vm.runInContext('ddLang()', ctx), 'ms', file + ' starts in BM');
  return doc;
}

function check(file, doc0, docMs, staticSel, skip) {
  const en = strings(doc0, skip);
  assert.ok(en.length >= 8, file + ': the markup has words (' + en.length + ')');
  const missing = en.filter((x) => !keyed(x.el, x.kind, staticSel)).map(where);
  assert.deepEqual(missing, [], file + ': English in the markup with no data-i18n key');
  const english = new Set(en.map((x) => x.s));
  const left = strings(docMs, skip).filter((x) => english.has(x.s)).map(where);
  assert.deepEqual(left, [], file + ': English left on the BM page');
}

test('organiser app: every word of the static markup (banners, compact bar, sidebar, top bar) has a key and is BM in BM', () => {
  const html = read('app.html');
  const staticSel = [];
  const push = /DD_STATIC_SEL\.push\(([\s\S]*?)\);/.exec(html);
  assert.ok(push, 'app.html adds its pinned elements to DD_STATIC_SEL');
  vm.runInNewContext('[' + push[1] + ']').forEach((x) => staticSel.push(x[0]));
  // filled by the app before they are shown: the open event's name and line (#cwName / #cwSub, "-" until then)
  const skip = (el) => el.id === 'langBar' || /\blangsw\b/.test(el.className);   // the bilingual note and the EN | BM switch
  const doc0 = pageDoc('app.html');
  const docMs = applyBM('app.html', ROOT, ['render.js', 'i18n/app.en.js', 'i18n/print.en.js', 'i18n/errors.en.js'], ['i18n/app-i18n.js'],
    'DD_STATIC_SEL.push(' + push[1] + ')');
  check('app.html', doc0, docMs, staticSel, skip);
  // spot checks: the sidebar steps, a banner and an aria-label really are BM
  assert.equal(docMs.querySelector('#navstep3 h3').textContent, 'Butiran carta'.replace(/^/, '3. '));
  assert.equal(docMs.getElementById('deviceGatePhone').textContent, require('../i18n/app.ms.js')['gate.phone']);
  assert.equal(docMs.querySelector('.phone-banner-close').getAttribute('aria-label'), require('../i18n/app.ms.js')['gate.dismiss']);
  assert.equal(docMs.querySelector('#compactBar > a.compact-link').getAttribute('href'), '/ms/help');
});

test('viewer page: every word of the static markup (header, footer, messages) has a key and is BM in BM', () => {
  // filled by the page script before they are shown: the finder box (hidden until an event loads; its words depend on
  // Teams or not) and the title (set from the event)
  const skip = (el) => el.id === 'langBar' || /\blangsw\b/.test(el.className) || el.id === 'finder';
  const doc0 = pageDoc('viewer/index.html');
  const docMs = applyBM('viewer/index.html', path.join(ROOT, 'viewer'), ['render.js', 'i18n/en.js'], ['i18n/i18n.js']);
  check('viewer/index.html', doc0, docMs, [], skip);
  assert.equal(docMs.querySelector('footer a').textContent, require('../viewer/i18n/ms.js')['nav.help']);
});

test('the check works: a sidebar step without its data-i18n, or a BM value left in English, is caught', () => {
  const html = read('app.html');
  const push = /DD_STATIC_SEL\.push\(([\s\S]*?)\);/.exec(html);
  const staticSel = vm.runInNewContext('[' + push[1] + ']').map((x) => x[0]);
  const skip = (el) => el.id === 'langBar' || /\blangsw\b/.test(el.className);
  // a copy of the markup without data-i18n="nav.3"
  const doc0 = withInnerHTML(parse(html.replace(' data-i18n="nav.3"', '')));
  assert.throws(() => check('app.html (mutant)', doc0, doc0, staticSel, skip), /no data-i18n key/);
  // the real markup, but the BM page still shows one English text
  const docMs = pageDoc('app.html');
  const docEn = pageDoc('app.html');
  assert.throws(() => check('app.html (untranslated)', docEn, docMs, staticSel, skip), /English left on the BM page/);
});

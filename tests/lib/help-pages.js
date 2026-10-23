// Loads a real Help page into tests/lib/mini-dom.js and runs its search exactly as the browser does: the shared module
// (help-search.js, or the viewer's copy) and the page's own inline script that calls HelpSearch.attach.
//   const page = loadHelp('organiser' | 'spectator', { hash: '#faq-no-show', desktop: true })
//   page.type('no show'); page.controller.search('typo'); page.key('Escape'); page.goTo('#q-ties')
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { parse } = require('./mini-dom');

const ROOT = path.join(__dirname, '..', '..');
const PAGES = {
  organiser: { html: 'help.html', module: 'help-search.js' },
  spectator: { html: 'viewer/help.html', module: 'viewer/help-search.js' }
};
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

function loadHelp(which, opts = {}) {
  const p = PAGES[which];
  const html = read(p.html);
  const doc = parse(html);
  const winL = {};
  let hash = opts.hash || '';
  const fire = (t) => (winL[t] || []).slice().forEach((fn) => fn({ type: t }));
  const location = {};
  Object.defineProperty(location, 'hash', { get: () => hash, set: (v) => { const h = String(v).charAt(0) === '#' ? String(v) : '#' + v; if (h !== hash) { hash = h; fire('hashchange'); } } });
  const mq = { matches: opts.desktop !== false, addEventListener() {}, addListener() {} };
  const window = { addEventListener: (t, fn) => { (winL[t] = winL[t] || []).push(fn); }, matchMedia: () => mq, location };
  const ctx = { document: doc, window, location, console, JSON, decodeURIComponent };
  vm.createContext(ctx);
  vm.runInContext(read(p.module), ctx, { filename: p.module });
  let controller = null;
  const real = ctx.HelpSearch.attach;
  ctx.HelpSearch.attach = (cfg) => (controller = real(cfg));
  const inline = doc.querySelectorAll('script').filter((s) => !s.hasAttribute('src') && !s.hasAttribute('type') && /HelpSearch/.test(s.textContent));
  inline.forEach((s, i) => vm.runInContext(s.textContent, ctx, { filename: p.html + '#inline' + i }));
  const input = doc.getElementById(which === 'organiser' ? 'helpQ' : 'faqSearch');
  const ev = (t, extra) => Object.assign({ type: t, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } }, extra);
  return {
    doc, ctx, html, input, controller, location, window,
    get hash() { return hash; },
    type(q) { input.value = q; input.dispatchEvent(ev('input')); doc.flush(); },
    key(k) { const e = ev('keydown', { key: k }); input.dispatchEvent(e); doc.flush(); return e; },
    goTo(h) { location.hash = h; doc.flush(); },
    click(el) { el.dispatchEvent(ev('click', { target: el })); doc.flush(); },
    byId: (id) => doc.getElementById(id)
  };
}

/* The page data the search uses (synonyms, noAnswer), parsed from the page. */
function pageData(which) {
  const html = read(PAGES[which].html);
  const m = html.match(/<script type="application\/json" id="helpSearchData">([\s\S]*?)<\/script>/);
  return m ? JSON.parse(m[1]) : null;
}

module.exports = { loadHelp, pageData, ROOT };

/* Loads the organiser app (app.html) into a Node vm exactly like the test-suite does (tests/lib/load-app.js) and gives
   the simulation a few small helpers for driving the app's own functions the way the screen does.
   Nothing here edits the app: it only calls the real functions in the sandbox. */
const path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const { loadApp, run } = require(path.join(ROOT, 'tests', 'lib', 'load-app.js'));

/* The tests' stub measures every string as 7px per character whatever the font. The bracket sheets size their font from a
   canvas measurement, so a font-aware stand-in (width = characters x font size x a typical average glyph width) gives
   a closer font size. Real fonts differ a little; the layout audit measures the real thing in a browser. */
function patchMeasure(app) {
  app.__mkoMeasureCtx = {
    font: '',
    measureText(s) {
      const m = /(?:(\d{3})\s+)?([\d.]+)px/.exec(this.font);
      const px = m ? parseFloat(m[2]) : 12, weight = m && m[1] ? parseInt(m[1], 10) : 400;
      return { width: String(s).length * px * (weight >= 700 ? 0.60 : 0.55) };
    },
  };
}

function createApp() {
  const app = loadApp();
  patchMeasure(app);
  const DOC = app.document;
  const sim = { app, DOC, modals: [], mount: null };
  /* Same stubs the tests use: saving and drawing the screen do nothing; a modal is remembered so its Save button can be pressed. */
  app.openModal = (m) => { sim.modals.push(m); };
  app.persist = () => { try { run(app, 'if(state) normalizeForSave()'); } catch (e) { /* no tournament yet */ } };
  app.render = () => {}; app.renderSavedList = () => {}; app.setSaveStatus = () => {};
  app.__org = { name: 'Sim Organiser', email: 'sim@example.com', tier: 'pro', entryLimit: null, viewerUrl: 'https://live.example.com' };
  run(app, 'currentOrganizer = __org; lockedIds.clear(); currentStage = 1; teamSegDraft = null');
  sim.f = (n) => run(app, n);
  sim.setState = (t) => { app.__t = t; run(app, 'state = __t'); };
  sim.state = () => run(app, 'state');
  /* Runs fn with a page whose elements are the given id -> value pairs (everything else is missing, like a box that is not on screen). */
  sim.withDoc = (values, fn) => {
    app.document = {
      getElementById: (id) => (id in values ? { value: values[id], checked: !!values[id], textContent: '', innerHTML: '' } : null),
      createElement: DOC.createElement, body: DOC.body,
    };
    try { return fn(); } finally { app.document = DOC; }
  };
  /* Presses Save in the open modal after typing the two totals into it; returns the error text, or null when it saved. */
  sim.enterScore = (modal, a, b) => {
    app.document = { getElementById: (id) => (id === 'scA' ? { value: String(a) } : id === 'scB' ? { value: String(b) } : null), createElement: DOC.createElement, body: DOC.body };
    try { const r = modal.onConfirm(); return r && r.error ? r.error : null; } finally { app.document = DOC; }
  };
  /* What the print buttons write into #printSheets: runs fn with that element and returns its HTML. */
  sim.capture = (fn) => {
    const mount = { innerHTML: '' };
    app.document = { getElementById: () => mount, createElement: DOC.createElement, body: DOC.body };
    try { fn(); } finally { app.document = DOC; }
    return mount.innerHTML;
  };
  sim.popModal = () => { const m = sim.modals.pop(); if (!m) throw new Error('expected a modal to open'); return m; };
  return sim;
}

module.exports = { createApp, run, ROOT };

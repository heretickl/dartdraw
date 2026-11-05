// Shared set-up for the scoring app's client tests (tests/scoring-app-*.test.js): loads the site's scripts as globals the
// way index.html does, and gives a memory storage, a fake server for fetch, and small helpers. Each test file runs in its
// own process, so the globals do not leak between files.
const path = require('path');
const { parse } = require('./mini-dom');
const SA = path.join(__dirname, '..', '..', 'scoring_app');

global.DD_CASUAL_EN = require(path.join(SA, 'i18n/casual.en.js'));
global.DD_CASUAL_MS = require(path.join(SA, 'i18n/casual.ms.js'));
global.DDMatch = require(path.join(SA, 'match-engine.js'));
global.DDScoring = require(path.join(SA, 'scoring-model.js'));
global.DDScreens = require(path.join(SA, 'scoring-screens.js'));
global.DDCasual = require(path.join(SA, 'casual.js'));
global.DDNet = require(path.join(SA, 'net.js'));
global.DDAccount = require(path.join(SA, 'account.js'));
global.DDOpponent = require(path.join(SA, 'opponent.js'));
global.DDScorecard = require(path.join(SA, 'scorecard.js'));
const DDApp = require(path.join(SA, 'app.js'));

const txt = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '(none)');
const tick = (n = 4) => new Promise((r) => { let i = 0; (function f() { if (++i > n) r(); else setTimeout(f, 0); })(); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function memStore(init) {
  const m = new Map(Object.entries(init || {}));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
}
const click = (el) => el.dispatchEvent({ type: 'click', bubbles: true, target: el });
const submit = (form) => form.dispatchEvent({ type: 'submit', bubbles: true, target: form, preventDefault() {} });
const typeInto = (el, v) => { el.value = v; el.dispatchEvent({ type: 'input', bubbles: true, target: el }); };
const newRoot = () => parse('<html><head><title></title></head><body><main id="app"></main></body></html>').getElementById('app');

/* A fake server: server.answers maps a path (without ?query) to [status, body], a function (body) -> [status, body],
   'offline' (fetch fails) or 'hold' (answers when server.held.shift()(status, body) is called). server.calls records
   [method, url, body]. No answer for a path = 404. */
function fakeServer() {
  const server = { answers: {}, calls: [], held: [] };
  server.fetch = (url, req) => {
    const body = req && req.body ? JSON.parse(req.body) : null;
    server.calls.push([(req && req.method) || 'GET', url, body]);
    const a = server.answers[url.split('?')[0]];
    if (a === 'offline') return Promise.reject(new TypeError('Failed to fetch'));
    if (a === 'hold') return new Promise((res) => server.held.push((st, b) => res({ ok: st < 300, status: st, text: () => Promise.resolve(JSON.stringify(b)) })));
    if (!a) return Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve('{}') });
    const [status, b] = typeof a === 'function' ? a(body) : a;
    return Promise.resolve({ ok: status >= 200 && status < 300, status, text: () => Promise.resolve(JSON.stringify(b)) });
  };
  server.to = (p) => server.calls.filter((c) => c[1].split('?')[0] === p);
  return server;
}

module.exports = { parse, DDApp, txt, tick, sleep, memStore, click, submit, typeInto, newRoot, fakeServer, SA };

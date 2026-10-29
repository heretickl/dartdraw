const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Offline scoring: sw.js, the service worker that keeps a copy of the organiser app on the device (scope /app).
const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

/* sw.js in a sandbox with a fake worker: caches in a Map, fetch answered by `net` (a function, or it throws). */
function worker(net) {
  const stores = new Map();
  const handlers = {};
  const cacheOf = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name);
    return { put: async (k, r) => { m.set(typeof k === 'string' ? k : new URL(k.url).pathname, r); }, match: async (k) => m.get(k) || undefined };
  };
  const self = {
    location: { origin: 'https://dd.test' },
    addEventListener: (type, fn) => { handlers[type] = fn; },
    skipWaiting: async () => {}, clients: { claim: async () => {} },
  };
  const ctx = {
    self, URL, Promise, setTimeout, clearTimeout,
    caches: { open: async (n) => cacheOf(n), keys: async () => [...stores.keys()], delete: async (n) => stores.delete(n) },
    fetch: async (req) => net(typeof req === 'string' ? req : req.url),
  };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return { ctx, handlers, stores, CACHE: vm.runInContext('CACHE', ctx), SHELL: vm.runInContext('SHELL', ctx) };
}
const res = (body) => ({ ok: true, status: 200, type: 'basic', body, clone() { return res(body); } });
function request(url, mode) { return { method: 'GET', url: 'https://dd.test' + url, mode: mode || 'no-cors' }; }
async function fetchVia(w, req, ids) {
  let answer = null;
  const e = Object.assign({ request: req, respondWith: (p) => { answer = p; } }, ids || {});
  w.handlers.fetch(e);
  return answer ? await answer : 'network';   // not answered by the worker: the browser goes to the network itself
}

test('SHELL lists exactly the app page, render.css, every <script src> of app.html and the BM tables (DD_MS_FILES)', () => {
  const html = fs.readFileSync(path.join(ROOT, 'app.html'), 'utf8');
  const srcs = [...html.matchAll(/<script src="([^"'+]+)"><\/script>/g)].map((m) => '/' + m[1]);
  const ms = JSON.parse(html.match(/var DD_MS_FILES = (\[[^\]]*\])/)[1]).map((x) => '/' + x);
  const want = ['/app', '/render.css'].concat(srcs, ms).sort();
  const { SHELL } = require(path.join(ROOT, 'sw.js'));
  assert.deepEqual(SHELL.slice().sort(), want);
  SHELL.forEach((u) => { if (u !== '/app') assert.ok(fs.existsSync(path.join(ROOT, u)), u + ' exists'); });
});

test('the app registers the worker for /app only, not in a full-page window; vercel.json does not cache sw.js', () => {
  const html = fs.readFileSync(path.join(ROOT, 'app.html'), 'utf8');
  assert.match(html, /navigator\.serviceWorker\.register\('\/sw\.js', \{ scope: '\/app' \}\)/);
  assert.match(html, /function registerAppWorker\(\)\{\s*try\{\s*if\(popoutMode \|\| new URLSearchParams\(location\.search\)\.get\('popout'\)==='1'\) return;/);
  const vj = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  const h = vj.headers.find((x) => x.source === '/sw.js');
  assert.deepEqual(h.headers, [{ key: 'Cache-Control', value: 'no-cache' }]);
});

test('/api/*, the landing site, Help, sign-in pages and other origins are never answered by the worker', async () => {
  const w = worker(() => { throw new Error('should not be fetched by the worker'); });
  for (const [u, mode] of [['/api/tournaments', 'cors'], ['/api/auth/me', 'cors'], ['/', 'navigate'], ['/features', 'navigate'], ['/help', 'navigate'], ['/login.html', 'navigate'], ['/help-search.js', 'no-cors']]) {
    assert.equal(await fetchVia(w, request(u, mode)), 'network', u);
  }
  assert.equal(await fetchVia(w, { method: 'GET', url: 'https://cdn.example/x.js', mode: 'no-cors' }), 'network');
  assert.equal(await fetchVia(w, { method: 'PUT', url: 'https://dd.test/render.js', mode: 'cors' }), 'network');
});

test('the app files: network first and the fresh copy kept; with no network the kept copy answers (the query string ignored)', async () => {
  let up = true, n = 0;
  const w = worker((url) => { if (!up) throw new TypeError('offline'); n++; return res('v' + n + ' ' + new URL(url).pathname); });
  const r1 = await fetchVia(w, request('/app?t=t_A&stage=5', 'navigate'));
  assert.match(r1.body, /^v1 \/app$/);
  const r2 = await fetchVia(w, request('/render.js'));
  assert.match(r2.body, /render\.js/);
  await new Promise((r) => setTimeout(r, 5));
  up = false;
  const off = await fetchVia(w, request('/app?t=t_B', 'navigate'));
  assert.equal(off.body, r1.body, 'the kept copy of /app');
  assert.equal((await fetchVia(w, request('/render.js'))).body, r2.body);
  // back online: a newer deploy is served straight away, not the kept copy
  up = true;
  const fresh = await fetchVia(w, request('/render.js'));
  assert.notEqual(fresh.body, r2.body);
});

test('activate removes older dd-app-* caches and keeps the current one and any unrelated cache', async () => {
  const w = worker(() => res('x'));
  for (const n of ['dd-app-old', 'dd-app-2026-01-01.1', w.CACHE, 'something-else']) await w.ctx.caches.open(n);
  let done = null;
  w.handlers.activate({ waitUntil: (p) => { done = p; } });
  await done;
  assert.deepEqual([...w.stores.keys()].sort(), [w.CACHE, 'something-else'].sort());
});

test('install keeps every SHELL file it can get, and a file that fails does not stop the install', async () => {
  const w = worker((url) => { if (url.endsWith('qr.js')) throw new TypeError('offline'); return res(url); });
  let done = null;
  w.handlers.install({ waitUntil: (p) => { done = p; } });
  await done;
  const kept = w.stores.get(w.CACHE);
  assert.equal(kept.size, w.SHELL.length - 1);
  assert.ok(!kept.has('/qr.js'));
});

test('review 3: online, the app files come from the network however slow (no timer); a page opened from the kept copy gets kept files (no mixing)', async () => {
  let up = true, delay = 0, n = 0;
  const w = worker((url) => new Promise((resolve, reject) => setTimeout(() => { if (!up) reject(new TypeError('offline')); else { n++; resolve(res('v' + n + ' ' + new URL(url).pathname)); } }, delay)));
  vm.runInContext('TIMEOUT_MS = 10', w.ctx);
  const nav = (id) => fetchVia(w, request('/app', 'navigate'), { resultingClientId: id });
  const sub = (id, u) => fetchVia(w, request(u), { clientId: id });
  await nav('c1'); const old = await sub('c1', '/offline.js');
  await new Promise((r) => setTimeout(r, 5));
  // a slow link: the network still wins for a page that loaded online
  delay = 40;
  const slow = await sub('c1', '/offline.js');
  assert.notEqual(slow.body, old.body, 'fresh, not the kept copy');
  await new Promise((r) => setTimeout(r, 5));
  // no network: the page comes from the kept copy, and so does every file it loads, even if the network comes back
  delay = 0; up = false;
  const offNav = await nav('c2');
  assert.match(offNav.body, /\/app/);
  up = true;
  const kept = await sub('c2', '/offline.js');
  assert.equal(kept.body, slow.body, 'the kept copy, matching the kept page');
});

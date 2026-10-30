// Local organiser for checking screens in a browser without Neon or login:  node tests/dev/mock-organiser.js
// then open http://localhost:5393/app (the organiser app is app.html, served at /app). Tournaments live in memory and are lost when the server stops.
// Flags: --admin (signed in as an Admin: MOCK_ADMIN=1), --no-library (player library not set up: MOCK_NO_LIBRARY=1).
if (process.argv.includes('--admin')) process.env.MOCK_ADMIN = '1';
if (process.argv.includes('--no-library')) process.env.MOCK_NO_LIBRARY = '1';
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const db = {};   // id -> { data, updated_at }
let mockOffline = 0;   // see /__offline
/* Floor officials (/api/score/*): the real handlers, on an in-memory database (tests/lib/fake-score-db.js) that shares
   the events above, signed in as the local organiser. Open an official's link (/score/<token>) on this server too. */
if (!process.env.SESSION_SECRET) process.env.SESSION_SECRET = 'local-mock-secret';
const scoreDb = require('../lib/fake-score-db').createFakeScoreDb({ tournaments: db });
setInterval(() => scoreDb.setNow(Date.now()), 1000).unref();
scoreDb.setNow(Date.now());
const dbModPath = require.resolve('../../api/_lib/db'), authModPath = require.resolve('../../api/_lib/auth');
require.cache[dbModPath] = { id: dbModPath, filename: dbModPath, loaded: true, exports: { sql: (...a) => scoreDb.sql(...a) } };
require.cache[authModPath] = { id: authModPath, filename: authModPath, loaded: true, exports: { requireAuth: async () => ({ id: 'u1', role: process.env.MOCK_ADMIN === '1' ? 'admin' : 'organizer' }) } };
const scoreRouter = require('../../api/score/[action].js');
async function vercelCall(handler, req, url, res) {
  const body = req.method === 'POST' ? await readBody(req) : undefined;
  const r = { method: req.method, url: req.url, headers: Object.assign({ host: req.headers.host }, req.headers), query: Object.fromEntries(url.searchParams), body, socket: req.socket };
  const out = { status(c) { res.statusCode = c; return out; }, json(o) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); return out; }, setHeader: (k, v) => res.setHeader(k, v), end: (x) => res.end(x) };
  try { await handler(r, out); } catch (e) { console.error(e); res.statusCode = 500; res.end('{}'); }
}
const mockPlayers = require('./mock-players');   // /api/players/* and /api/admin/players* (MOCK_NO_LIBRARY=1: not set up)
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const readBody = (req) => new Promise((resolve) => { let s = ''; req.on('data', (c) => { s += c; }); req.on('end', () => resolve(s ? JSON.parse(s) : {})); });

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const send = (code, obj) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); };
  /* Pretend the signal is gone (offline scoring): /__offline?on=1 drops every /api/* request unanswered, on=2 drops
     everything (the service worker's copy of the app must answer), on=0 is back to normal. */
  if (url.pathname === '/__offline') { mockOffline = Number(url.searchParams.get('on')) || 0; return send(200, { offline: mockOffline }); }
  if (mockOffline === 2 || (mockOffline === 1 && url.pathname.startsWith('/api/'))) { req.socket.destroy(); return; }
  if (url.pathname === '/api/auth/me') return send(200, { id: 'u1', name: 'Test organiser', email: 'test@example.com', publicMode: true, viewerUrl: '', role: process.env.MOCK_ADMIN === '1' ? 'admin' : 'organizer' });
  if (url.pathname === '/api/admin/organizers' && process.env.MOCK_ADMIN === '1') return send(200, { organizers: [{ id: 'u1', name: 'Test organiser', email: 'test@example.com', role: 'admin', tier: 'pro', verified: true, eventCount: Object.keys(db).length }, { id: 'u2', name: 'Other organiser', email: 'other@example.com', role: 'organizer', tier: 'basic', verified: true, eventCount: 0 }] });
  if (await mockPlayers.handle(req, url, send, readBody, db)) return;
  if (url.pathname.startsWith('/api/score/')) return vercelCall(scoreRouter, req, url, res);
  if (url.pathname === '/api/tournaments') return send(200, Object.keys(db).map((id) => ({ id, data: db[id].data, updated_at: db[id].updated_at })));
  const m = /^\/api\/tournaments\/([^/]+)$/.exec(url.pathname);
  if (m) {
    const id = decodeURIComponent(m[1]);
    if (req.method === 'GET') return db[id] ? send(200, { id, data: db[id].data, updated_at: db[id].updated_at }) : send(404, { error: 'Not found.' });
    if (req.method === 'PUT') { const b = await readBody(req); const updated_at = new Date().toISOString(); db[id] = { data: b.data, updated_at, created_by: 'u1' }; return send(200, { id, updated_at }); }
    if (req.method === 'DELETE') { delete db[id]; res.statusCode = 204; return res.end(); }
  }
  const file = path.join(ROOT, (url.pathname === '/' || url.pathname === '/app') ? 'app.html' : /^\/score\/[A-Za-z0-9_-]+\/?$/.test(url.pathname) ? 'score.html' : decodeURIComponent(url.pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; return res.end('not found'); }
  res.setHeader('Content-Type', MIME[path.extname(file)] || 'text/plain');
  res.end(fs.readFileSync(file));
}).listen(5393, () => console.log('mock organiser on http://localhost:5393'));

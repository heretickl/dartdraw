// Local organiser for checking screens in a browser without Neon or login:  node tests/dev/mock-organiser.js
// then open http://localhost:5393 . Tournaments live in memory and are lost when the server stops.
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const db = {};   // id -> { data, updated_at }
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const readBody = (req) => new Promise((resolve) => { let s = ''; req.on('data', (c) => { s += c; }); req.on('end', () => resolve(s ? JSON.parse(s) : {})); });

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const send = (code, obj) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); };
  if (url.pathname === '/api/auth/me') return send(200, { id: 'u1', name: 'Test organiser', email: 'test@example.com', publicMode: true, viewerUrl: '' });
  if (url.pathname === '/api/tournaments') return send(200, Object.keys(db).map((id) => ({ id, data: db[id].data, updated_at: db[id].updated_at })));
  const m = /^\/api\/tournaments\/([^/]+)$/.exec(url.pathname);
  if (m) {
    const id = decodeURIComponent(m[1]);
    if (req.method === 'GET') return db[id] ? send(200, { id, data: db[id].data, updated_at: db[id].updated_at }) : send(404, { error: 'Not found.' });
    if (req.method === 'PUT') { const b = await readBody(req); const updated_at = new Date().toISOString(); db[id] = { data: b.data, updated_at }; return send(200, { id, updated_at }); }
    if (req.method === 'DELETE') { delete db[id]; res.statusCode = 204; return res.end(); }
  }
  const file = path.join(ROOT, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; return res.end('not found'); }
  res.setHeader('Content-Type', MIME[path.extname(file)] || 'text/plain');
  res.end(fs.readFileSync(file));
}).listen(5393, () => console.log('mock organiser on http://localhost:5393'));

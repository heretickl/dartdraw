// Local public viewer: node tests/dev/mock-viewer.js [view.json]  ->  http://localhost:5392/live/testslug12
// Serves viewer/ and answers /api/public/testslug12 from a public-view JSON file (default tests/dev/out/view.json).
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', 'viewer');
const VIEW = path.resolve(process.argv[2] || path.join(__dirname, 'out', 'view.json'));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/public/testslug12') {
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ updatedAt: fs.statSync(VIEW).mtime.toISOString(), view: JSON.parse(fs.readFileSync(VIEW, 'utf8')) }));
  }
  let file = url.pathname;
  if (/^\/live\/[^/]+$/.test(file)) file = '/index.html';
  const full = path.join(ROOT, file === '/' ? 'index.html' : file);
  if (!full.startsWith(ROOT) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) { res.statusCode = 404; return res.end('not found'); }
  res.setHeader('Content-Type', MIME[path.extname(full)] || 'text/plain');
  res.end(fs.readFileSync(full));
}).listen(5392, () => console.log('mock viewer on http://localhost:5392/live/testslug12'));

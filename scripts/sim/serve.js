/* A tiny static file server for looking at docs/design/simulation in a browser (e.g. the Browser pane).
   usage: node scripts/sim/serve.js [port]   (no port: a free one is chosen and printed). Stop it with Ctrl+C. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', '..', 'docs', 'design', 'simulation');
const types = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.md': 'text/plain; charset=utf-8', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(root, p));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
server.listen(parseInt(process.argv[2], 10) || 0, '127.0.0.1', () => console.log('serving ' + root + ' on http://127.0.0.1:' + server.address().port + '/'));

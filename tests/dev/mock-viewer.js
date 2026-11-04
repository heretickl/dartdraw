// Local public viewer: node tests/dev/mock-viewer.js [view.json]  ->  http://localhost:5392/live/testslug12
// Serves viewer/ and answers /api/public/testslug12 from a public-view JSON file (default tests/dev/out/view.json).
//
// Live fixture: node tests/dev/mock-viewer.js --live  ->  http://localhost:5392/live/livetest01  (and /live/manualtst1, the same event as Manual)
// Runs the REAL handler (viewer/api/public/[slug].js, incl. ?live=1) against a fake database holding tests/dev/live-fixture.js, so the page
// gets what production would send. Controls (GET):  /__cfg?stats=1&hints=1&rule=1 (the event's switches; 0 turns one off),
// /__tick (the throwers score: remaining scores move, thrower swaps), /__finish?pos=<position> (that match becomes confirmed),
// /__clear (no live rows), /__reset, /__log (the requests the page has made, as JSON; /__log?clear=1 empties it).
// PORT=5393 and VIEWER_ROOT=<folder> (e.g. an old copy of viewer/) override the port and the folder served.
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = process.env.VIEWER_ROOT ? path.resolve(process.env.VIEWER_ROOT) : path.join(__dirname, '..', '..', 'viewer');
const PORT = parseInt(process.env.PORT, 10) || 5392;
const LIVE = process.argv.includes('--live');
const VIEW = path.resolve(process.argv.slice(2).filter((a) => !a.startsWith('--'))[0] || path.join(__dirname, 'out', 'view.json'));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

let liveHandler = null, cfg = null, rows = null;
const log = [];
if (LIVE) {
  const fx = require('./live-fixture');
  const dbPath = require.resolve('../../viewer/api/_lib/db');
  const reset = () => { cfg = { stats: false, hints: false, rule: false }; rows = fx.makeRows(); };
  reset();
  const known = { livetest01: () => fx.makeData({ live: true, stats: cfg.stats, hints: cfg.hints, rule: cfg.rule }), manualtst1: () => Object.assign(fx.makeData({ live: false, rule: cfg.rule }), { publicSlug: 'manualtst1' }) };
  const UPDATED = '2026-11-04T12:00:00.000Z';   // fixed: a live score never changes updated_at
  const fakeSql = async (strings, ...vals) => {
    const q = strings.join('?');
    const slug = vals[0];
    if (/live_public/.test(q)) return slug === 'livetest01' ? rows.map((r) => JSON.parse(JSON.stringify(r))) : [];
    if (/public_tournaments/.test(q)) {
      if (!known[slug]) return [];
      const data = JSON.parse(JSON.stringify(known[slug]()));
      return /SELECT data->'format'/.test(q) ? [{ scoring: data.format.scoring || null }] : [{ data, updated_at: UPDATED }];
    }
    return [];
  };
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { sql: fakeSql } };
  liveHandler = require('../../viewer/api/public/[slug].js');
  var control = (url, res) => {   // dev controls
    const p = url.pathname, q = url.searchParams, flag = (k) => (q.has(k) ? q.get(k) === '1' : undefined);
    if (p === '/__cfg') ['stats', 'hints', 'rule'].forEach((k) => { if (flag(k) !== undefined) cfg[k] = flag(k); });
    else if (p === '/__reset') reset();
    else if (p === '/__clear') rows = [];
    else if (p === '/__finish') rows.forEach((r) => { if (r.pos === q.get('pos')) r.state = 'confirmed'; });
    else if (p === '/__tick') {
      rows.forEach((r) => {
        const s = r.summary;
        if (r.state !== 'playing' || !s.remaining || !s.thrower) return;
        const i = s.thrower === 'a' ? 0 : 1, hit = [26, 41, 60, 81, 100, 45, 85][(log.length + i) % 7];
        const left = Math.max(2, s.remaining[i] - hit);
        const score = s.remaining[i] - left;
        s.last = (s.last || []).concat([{ leg: 2, side: s.thrower, score, left }]).slice(-6);
        s.remaining[i] = left;
        if (s.tot) { s.tot[s.thrower].s += score; s.tot[s.thrower].d += 3; }
        s.thrower = s.thrower === 'a' ? 'b' : 'a';
      });
    } else if (p === '/__log') { if (q.get('clear') === '1') log.length = 0; res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(log)); }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ cfg, rows: rows.length }));
  };
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (LIVE && url.pathname.startsWith('/__')) return control(url, res);
  if (LIVE && /^\/api\/public\/[^/]+$/.test(url.pathname)) {
    log.push({ t: new Date().toISOString().slice(11, 19), url: url.pathname + url.search });
    const out = { status: 200, headers: {}, body: null };
    const fake = { setHeader: (k, v) => { out.headers[k] = v; }, status(c) { out.status = c; return this; }, json(b) { out.body = b; } };
    return Promise.resolve(liveHandler({ method: req.method, query: Object.assign({ slug: url.pathname.split('/').pop() }, Object.fromEntries(url.searchParams)) }, fake)).then(() => {
      Object.keys(out.headers).forEach((k) => res.setHeader(k, out.headers[k]));
      res.statusCode = out.status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(out.body));
    });
  }
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
}).listen(PORT, () => console.log('mock viewer on http://localhost:' + PORT + '/live/' + (LIVE ? 'livetest01' : 'testslug12')));

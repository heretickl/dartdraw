const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// Casual play is its own Vercel project (scoring_app/), so it can't load the shared scoring files from the root. The root
// copies are the source of truth; scripts/sync-casual.js copies them in (npm run sync-casual / check-casual).
const ROOT = path.join(__dirname, '..');
const FILES = ['match-engine.js', 'scoring-model.js', 'scoring-screens.js', 'scoring.css'];

test('the casual copies are the root files, byte for byte', () => {
  FILES.forEach((f) => assert.ok(fs.readFileSync(path.join(ROOT, 'scoring_app', f)).equals(fs.readFileSync(path.join(ROOT, f))), f));
});

test('check-casual passes', () => {
  const out = execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'sync-casual.js'), '--check'], { encoding: 'utf8' });
  FILES.forEach((f) => assert.match(out, new RegExp('ok\\s+' + f.replace('.', '\\.'))));
});

test('npm scripts and deploy files', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['sync-casual'], 'node scripts/sync-casual.js');
  assert.equal(pkg.scripts['check-casual'], 'node scripts/sync-casual.js --check');
  const cv = JSON.parse(fs.readFileSync(path.join(ROOT, 'scoring_app', 'vercel.json'), 'utf8'));
  assert.deepEqual(cv.regions, ['sin1']);
  const sw = cv.headers.find((h) => h.source === '/sw.js');
  assert.ok(sw.headers.some((h) => h.key === 'Cache-Control' && h.value === 'no-cache'));
  const rv = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  assert.ok(rv.redirects.some((r) => r.source === '/scoring_app/:path*' && r.destination === '/'));
});

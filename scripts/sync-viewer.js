// The organiser app and the public viewer are separate Vercel projects, so the
// viewer can't load render.js / render.css from the app's folder. The root copies
// are the source of truth; this copies them into viewer/.
//   node scripts/sync-viewer.js          copy root -> viewer/
//   node scripts/sync-viewer.js --check  exit 1 if viewer/ is out of date
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const FILES = ['render.js', 'render.css'];
const check = process.argv.includes('--check');
let stale = 0;

for (const f of FILES) {
  const src = fs.readFileSync(path.join(root, f));
  const dstPath = path.join(root, 'viewer', f);
  const dst = fs.existsSync(dstPath) ? fs.readFileSync(dstPath) : null;
  const same = dst && src.equals(dst);
  if (same) { console.log('ok      ' + f); continue; }
  if (check) { console.log('STALE   viewer/' + f); stale++; continue; }
  fs.writeFileSync(dstPath, src);
  console.log('copied  ' + f + ' -> viewer/' + f);
}

if (check && stale) {
  console.error('\nviewer/ is out of date. Run: npm run sync-viewer');
  process.exit(1);
}

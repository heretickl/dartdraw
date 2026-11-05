// Casual play (scoring_app/) is its own Vercel project, so it can't load the scoring files from the app's folder.
// The root copies are the source of truth; this copies them into scoring_app/.
//   match-engine.js     the darts rules
//   player-stats.js     a player's scorecard numbers from their games
//   friend-rules.js     the friends-list rules (nickname length, resend and 30-day timings, badges)
//   scoring-model.js    a match in memory: taps in, what the screens show out
//   scoring-screens.js  the scoring screens and their taps
//   scoring.css         the look of the scoring screens
//   api/_lib/db.js, throttle.js, mail.js   the database, rate-limit and e-mail helpers the scoring app's own api/
//                       shares with the organiser app (same Neon database)
//   node scripts/sync-casual.js          copy root -> scoring_app/
//   node scripts/sync-casual.js --check  exit 1 if scoring_app/ is out of date
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const FILES = ['match-engine.js', 'player-stats.js', 'friend-rules.js', 'scoring-model.js', 'scoring-screens.js', 'scoring.css',
  'api/_lib/db.js', 'api/_lib/throttle.js', 'api/_lib/mail.js'];
const check = process.argv.includes('--check');
let stale = 0;

for (const f of FILES) {
  const src = fs.readFileSync(path.join(root, f));
  const dstPath = path.join(root, 'scoring_app', f);
  const dst = fs.existsSync(dstPath) ? fs.readFileSync(dstPath) : null;
  const same = dst && src.equals(dst);
  if (same) { console.log('ok      ' + f); continue; }
  if (check) { console.log('STALE   scoring_app/' + f); stale++; continue; }
  fs.mkdirSync(path.dirname(dstPath), { recursive: true });
  fs.writeFileSync(dstPath, src);
  console.log('copied  ' + f + ' -> scoring_app/' + f);
}

if (check && stale) {
  console.error('\ncasual/ is out of date. Run: npm run sync-casual');
  process.exit(1);
}

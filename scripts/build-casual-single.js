// Casual play in one file: scoring_app/index.html with every local stylesheet and script put inside it, so the game can be
// copied anywhere and opened without a website. The Google fonts stay a link (offline: a system font); the offline copy
// (sw.js) is left out, since a file opened from disk has no web address to keep.
// A file has no server either, so nobody can log in from it: the single file is guest casual play only. The account
// files (SITE_ONLY) are left out and the site's start line (DDApp.boot) becomes the guest start (GUEST_START), in English.
//   node scripts/build-casual-single.js          write scoring_app/casual-play.html
//   node scripts/build-casual-single.js --check  exit 1 if it is out of date
// Build from the synced scoring_app/ files: run npm run sync-casual first.
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'scoring_app');
const out = path.join(dir, 'casual-play.html');
const check = process.argv.includes('--check');
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8').trim();
const SITE_ONLY = ['account.css', 'i18n/casual.ms.js', 'net.js', 'account.js', 'scorecard.css', 'friends.css', 'opponent.js', 'scorecard.js', 'app.js'];
const BOOT = /<script>DDApp\.boot\([^\n]*<\/script>/;
const GUEST_START = `<script>
  (function () {
    var storage = null;
    try { storage = window.localStorage; storage.getItem('dd-casual-v1'); }
    catch (e) { storage = { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} }; }
    var app = document.getElementById('app');
    DDCasual.start(app, { storage: storage, words: DD_CASUAL_EN });
    window.addEventListener('resize', function () { DDScreens.fit(app.querySelector('.dds')); });
  })();
</script>`;

function build() {
  let html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8').replace(/\r\n/g, '\n');
  html = html.split('\n').filter((l) => !SITE_ONLY.some((f) => l.includes('"' + f + '"'))).join('\n');
  if (!BOOT.test(html)) throw new Error('scoring_app/index.html: the DDApp.boot(...) line is missing');
  html = html.replace(BOOT, () => GUEST_START);
  html = html.replace(/<link rel="stylesheet" href="([^":]+)">/g, (m, f) => '<style>\n' + read(f) + '\n</style>');
  // "</script" inside a script would end it early
  html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, f) => '<script>\n' + read(f).replace(/<\/script/gi, '<\\/script') + '\n</script>');
  html = html.split('\n').filter((l) => !/serviceWorker/.test(l)).join('\n');
  return html.replace('<title>', '<!-- Built by scripts/build-casual-single.js from scoring_app/. Do not edit: edit scoring_app/ and rebuild. -->\n<title>');
}

const html = build();
if (check) {
  const now = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : null;
  if (now !== html) { console.error('scoring_app/casual-play.html is out of date. Run: npm run build-casual-single'); process.exit(1); }
  console.log('scoring_app/casual-play.html is up to date');
} else {
  fs.writeFileSync(out, html);
  console.log('wrote scoring_app/casual-play.html (' + Math.round(html.length / 1024) + ' KB)');
}

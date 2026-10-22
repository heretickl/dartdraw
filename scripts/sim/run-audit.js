/* Runs the layout audit (scripts/sim/audit-client.js, embedded in every page) in a headless Chrome or Edge for each generated
   page and writes docs/design/simulation/audit.json. Needs Chrome or Edge installed; without one the audit is skipped (the
   pages still run it live when opened in any browser).
   usage: node scripts/sim/run-audit.js [outRoot] */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { pathToFileURL } = require('url');
const { ROOT } = require('./lib/appvm');

function findBrowser() {
  const cands = [
    process.env.SIM_BROWSER,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  return cands.find((p) => fs.existsSync(p)) || null;
}

function auditFile(browser, file) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sim-audit-'));
  try {
    const url = pathToFileURL(file).href + '?audit=1';
    const r = spawnSync(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--user-data-dir=' + profile,
      '--virtual-time-budget=30000', '--dump-dom', url], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, timeout: 180000 });
    if (r.error) return { error: String(r.error) };
    const m = /<pre id="audit-json">([^<]*)<\/pre>/.exec(r.stdout || '');
    if (!m) return { error: 'no audit output (exit ' + r.status + ')' };
    if (/^ERROR/.test(m[1])) return { error: m[1] };
    return JSON.parse(Buffer.from(m[1], 'base64').toString('utf8'));
  } finally { try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* ignore */ } }
}

function runAudit(outRoot, keys) {
  const browser = findBrowser();
  const prev = path.join(outRoot, 'audit.json');
  const out = { browser: browser ? path.basename(browser) : null, events: {} };
  try { const old = JSON.parse(fs.readFileSync(prev, 'utf8')); if (old && old.events) out.events = old.events; } catch (e) { /* first run */ }
  if (!browser) { out.skipped = 'No Chrome or Edge found (set SIM_BROWSER to a browser executable).'; }
  else keys.forEach((key) => {
    out.events[key] = {};
    ['pre-game', 'completed', 'paper-sizes'].forEach((stage) => {
      const file = path.join(outRoot, key, stage + '.html');
      if (!fs.existsSync(file)) { if (stage !== 'paper-sizes') out.events[key][stage] = { error: 'page missing' }; else delete out.events[key][stage]; return; }
      const t0 = Date.now(); out.events[key][stage] = auditFile(browser, file);
      const r = out.events[key][stage];
      console.log('audit ' + key + '/' + stage + ' ' + ((Date.now() - t0) / 1000).toFixed(1) + 's ' + (r.error ? 'ERROR ' + r.error : JSON.stringify(r.summary)));
    });
  });
  fs.writeFileSync(path.join(outRoot, 'audit.json'), JSON.stringify(out));
  return out;
}

if (require.main === module) {
  const outRoot = process.argv[2] || path.join(ROOT, 'docs', 'design', 'simulation');
  const keys = fs.readdirSync(outRoot).filter((d) => fs.existsSync(path.join(outRoot, d, 'facts.json')));
  runAudit(outRoot, keys);
}
module.exports = { runAudit, findBrowser, auditFile };

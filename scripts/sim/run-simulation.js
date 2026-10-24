/* Regenerates the whole simulation: 12 events (Singles, Doubles, Teams x 4 formats, 67 entries each), their pre-game and
   completed print pages, the layout audit, index.html and FINDINGS.md under docs/design/simulation/.
   Each event runs in its own node process with a time limit, so a hang can not stall the run.
   i18n step 4: the whole run is made twice, once with English sheets (docs/design/simulation/) and once with every event's
   Printed sheets language set to Bahasa Malaysia (docs/design/simulation-ms/), each with its own audit. --lang en|ms runs one.
   usage: node scripts/sim/run-simulation.js [--skip-audit] [--only singles-knockout,...] [--lang en|ms] */
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const { ROOT } = require('./lib/appvm');
const { runAudit } = require('./run-audit');
const { build } = require('./build-index');

const args = process.argv.slice(2);
const skipAudit = args.includes('--skip-audit');
const onlyArg = args.find((a) => a.startsWith('--only'));
const only = onlyArg ? (onlyArg.includes('=') ? onlyArg.split('=')[1] : args[args.indexOf(onlyArg) + 1]).split(',') : null;
const langArg = args.find((a) => a.startsWith('--lang'));
const langs = langArg ? [(langArg.includes('=') ? langArg.split('=')[1] : args[args.indexOf(langArg) + 1])] : ['en', 'ms'];
const EVENT_LIMIT_MS = 120000;     // each event must finish in 60 s; the process is killed at 120 s

const units = ['Singles', 'Doubles', 'Teams'];
const formats = [['knockout', 'knockout'], ['rrknockout', 'rr-knockout'], ['podknockout', 'group-boards'], ['roundrobin', 'round-robin']];
let failed = 0, ran = 0;
langs.forEach((lang) => {
const outRoot = path.join(ROOT, 'docs', 'design', lang === 'ms' ? 'simulation-ms' : 'simulation');
const keys = [];
fs.mkdirSync(outRoot, { recursive: true });
console.log('--- printed sheets in ' + (lang === 'ms' ? 'Bahasa Malaysia' : 'English') + ': ' + path.relative(ROOT, outRoot));
units.forEach((unit) => formats.forEach(([fmt, slug]) => {
  const key = unit.toLowerCase() + '-' + slug;
  if (only && !only.includes(key)) return;
  keys.push(key); ran++;
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(__dirname, 'run-event.js'), unit, fmt, outRoot].concat(lang === 'ms' ? ['ms'] : []), { encoding: 'utf8', timeout: EVENT_LIMIT_MS });
  const ms = Date.now() - t0;
  if (r.error || r.status !== 0) {
    failed++;
    console.log('FAIL ' + key + (r.error ? ' (' + r.error.code + ': killed after ' + ms + ' ms)' : '') + '\n' + (r.stderr || '').split('\n').slice(0, 6).join('\n'));
  } else console.log((r.stdout || '').trim() + ' [' + (ms / 1000).toFixed(1) + ' s wall]' + (ms > 60000 ? ' *** OVER 60 s ***' : ''));
}));

if (!skipAudit) runAudit(outRoot, keys.filter((k) => fs.existsSync(path.join(outRoot, k, 'facts.json'))));
build(outRoot);
});
console.log(failed ? failed + ' event(s) failed' : 'all ' + ran + ' events ran');
process.exit(failed ? 1 : 0);

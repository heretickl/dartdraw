const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// scoring_app/casual-play.html: the whole casual site in one file, to copy anywhere and open without a website
// (scripts/build-casual-single.js; npm run build-casual-single). Only the Google fonts stay outside: offline it falls back
// to a system font.
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'scoring_app', 'casual-play.html');
const LOCAL = ['scoring.css', 'casual.css', 'i18n/casual.en.js', 'match-engine.js', 'scoring-model.js', 'scoring-screens.js', 'casual.js'];

test('the single file is what the build makes from scoring_app/ (run npm run build-casual-single)', () => {
  const out = execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build-casual-single.js'), '--check'], { encoding: 'utf8' });
  assert.match(out, /up to date/);
});

test('the single file loads nothing local: every script and stylesheet is inside it', () => {
  const html = fs.readFileSync(OUT, 'utf8');
  assert.doesNotMatch(html, /<script src=/);
  assert.doesNotMatch(html, /<link rel="stylesheet" href="(?!https:)/);
  LOCAL.forEach((f) => {
    const body = fs.readFileSync(path.join(ROOT, 'scoring_app', f), 'utf8').replace(/<\/script/gi, '<\\/script').trim();
    assert.ok(html.includes(body), f + ' is inside');
  });
  assert.equal((html.match(/<\/script>/g) || []).length, LOCAL.filter((f) => f.endsWith('.js')).length + 1);
  assert.doesNotMatch(html, /serviceWorker/);
  assert.match(html, /DDCasual\.start\(/);
});

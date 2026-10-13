const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');

const THEME = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'theme.css'), 'utf8');
const winBgs = (block) => [...block.matchAll(/--win-bg:([^;}]+)/g)].map((m) => m[1]);

test('--win-bg: dark palette uses #133d32, both light palettes keep #e3f6ec', () => {
  const dark = THEME.match(/:root\{[\s\S]*?\n\}/);
  const light = THEME.match(/:root\[data-theme="light"\]\{[\s\S]*?\n\}/);
  const auto = THEME.match(/@media \(prefers-color-scheme:light\)\{[\s\S]*?\n\}\}/);
  assert.ok(dark && light && auto, 'all three palette blocks found');
  assert.deepEqual(winBgs(dark[0]), ['#133d32']);
  assert.deepEqual(winBgs(light[0]), ['#e3f6ec']);
  assert.deepEqual(winBgs(auto[0]), ['#e3f6ec']);
  assert.ok(!/--win-bg:#0e2a1e/i.test(THEME), 'old dark value is gone');
});

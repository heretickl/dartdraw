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

// ---- contrast of the small muted text inside a winner box ----
const hexLum = (h) => {
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const x = hexLum(a), y = hexLum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const blocks = () => ({
  dark: THEME.match(/:root\{[\s\S]*?\n\}/)[0],
  light: THEME.match(/:root\[data-theme="light"\]\{[\s\S]*?\n\}/)[0],
  auto: THEME.match(/@media \(prefers-color-scheme:light\)\{[\s\S]*?\n\}\}/)[0],
});
const varOf = (block, name) => { const m = block.match(new RegExp('--' + name + ':(#[0-9a-fA-F]{6})(?![0-9a-fA-F])')); return m ? m[1] : null; };

test('winner box: the muted text inside it (seed, WO) is at least 4.5:1 on the dark winner fill', () => {
  const dark = blocks().dark;
  const bg = varOf(dark, 'win-bg'), onWin = varOf(dark, 'muted-on-win'), muted = varOf(dark, 'muted');
  assert.equal(bg, '#133d32');
  assert.ok(onWin, '--muted-on-win is defined for dark');
  assert.ok(ratio(muted, bg) < 4.5, 'the plain muted colour is the one that was too faint');
  assert.ok(ratio(onWin, bg) >= 4.5, '--muted-on-win contrast ' + ratio(onWin, bg).toFixed(2));
  assert.ok(ratio(onWin, bg) < ratio(varOf(dark, 'ink'), bg), 'still quieter than the ink');
});

test('winner box: the light palettes keep their winner fill and the same muted colour as before', () => {
  const b = blocks();
  ['light', 'auto'].forEach((k) => {
    assert.equal(varOf(b[k], 'win-bg'), '#e3f6ec');
    assert.equal(varOf(b[k], 'muted-on-win'), varOf(b[k], 'muted'), k + ': --muted-on-win equals --muted');
    assert.ok(ratio(varOf(b[k], 'muted-on-win'), '#e3f6ec') >= 4.5);
  });
});

test('winner box: the rule reaches the muted spans in the winner boxes render.js makes, and only those', () => {
  const rule = THEME.match(/(\[style\*="[^\]]+"\]) span(\[style\*="[^\]]+"\])\{color:var\(--muted-on-win\)!important\}/);
  assert.ok(rule, 'rule found');
  const boxNeedle = rule[1].match(/"([^"]+)"/)[1], spanNeedle = rule[2].match(/"([^"]+)"/)[1];
  const RJS = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'render.js'), 'utf8');
  // the box background for a winner and the seed/WO spans use exactly these strings in render.js
  assert.ok(RJS.includes("winBg:'" + boxNeedle), 'winner background token starts with ' + boxNeedle);
  assert.ok(RJS.includes('font-weight:700;color:' + spanNeedle + ';">\'+slot.seed'), 'seed span uses ' + spanNeedle);
  assert.ok(RJS.includes("bg:(tokens.boxBg||'#fff')") && !RJS.includes("boxBg:'" + boxNeedle), 'non-winner boxes do not carry the winner background');
});

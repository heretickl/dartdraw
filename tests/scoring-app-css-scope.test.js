// The account, scorecard and friends pages load on the same page as the scoring screens, so a top-level selector
// that reuses a class name the scoring screens draw (".sc", ".card", ".nm" ...) restyles the game itself. That once
// hid the remaining score behind the scorecard's page background.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function screenClasses() {
  const src = fs.readFileSync(path.join(root, 'scoring-screens.js'), 'utf8');
  const out = new Set();
  for (const m of src.matchAll(/class="([^"']*)/g)) {
    for (const c of m[1].split(/\s+/)) if (/^[a-z0-9-]+$/.test(c)) out.add(c);
  }
  return out;
}

function leadingClasses(css) {
  const out = [];
  const body = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of body.matchAll(/([^{}]+)\{/g)) {
    const head = m[1].trim();
    if (head.startsWith('@')) continue;
    for (const sel of head.split(',')) {
      const first = sel.trim().match(/^\.([a-zA-Z0-9_-]+)/);
      if (first) out.push({ cls: first[1], sel: sel.trim() });
    }
  }
  return out;
}

for (const file of ['account.css', 'scorecard.css', 'friends.css']) {
  test(file + ' never starts a selector with a class the scoring screens use', () => {
    const used = screenClasses();
    assert.ok(used.has('sc') && used.has('card'), 'sanity: the screen class list was read');
    const css = fs.readFileSync(path.join(root, 'scoring_app', file), 'utf8');
    const clashes = leadingClasses(css).filter((x) => used.has(x.cls)).map((x) => x.sel);
    assert.deepStrictEqual([...new Set(clashes)], []);
  });
}

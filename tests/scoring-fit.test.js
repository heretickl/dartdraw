const { test } = require('node:test');
const assert = require('node:assert/strict');
const D = require('../scoring-screens.js');

// DDScreens.fit: a screen drawn 660px wide is scaled to the phone's width and stretched to the phone's height, so a tall
// phone (iPhone Air, about 420 x 800 in Safari) has no empty band under the keypad. Short screens keep the design height.
function withPage(w, h, fn) {
  const saved = { document: global.document, window: global.window };
  global.document = { documentElement: { clientWidth: w } };
  global.window = { innerWidth: w, innerHeight: h };
  try { fn(); } finally { global.document = saved.document; global.window = saved.window; }
}

test('a tall phone: the screen fills its height', () => {
  withPage(420, 800, () => {
    const el = { style: {} };
    D.fit(el);
    assert.equal(el.style.zoom, 420 / 660);
    assert.equal(el.style.minHeight, Math.round(800 / (420 / 660)) + 'px');
  });
});

test('a short screen: scaled down so the whole screen fits its height (owner 2026-11-04: every device)', () => {
  withPage(660, 600, () => {
    const el = { style: {} };
    D.fit(el);
    assert.equal(el.style.zoom, 600 / 982);
    assert.equal(el.style.minHeight, '982px');
  });
});

// Upright 01 is sized for Easy Mode (its taller layout, about 1231px) in both modes, so the Normal / Easy switch keeps
// the size on a short phone or an upright tablet; a tall phone is limited by its width and does not change.
test('upright 01: sized for Easy Mode in both modes', () => {
  withPage(820, 1181, () => {
    const el = { style: {}, classList: { contains: (c) => c === 'g-x01' || c === 'play' } };
    D.fit(el);
    assert.ok(Math.abs(Number(el.style.zoom) - 1181 / 1232) < 1e-9);
  });
  withPage(390, 844, () => {
    const el = { style: {}, classList: { contains: (c) => c === 'g-x01' || c === 'play' } };
    D.fit(el);
    assert.equal(el.style.zoom, 390 / 660);
  });
});

// The turns list is a one-column screen of its own: it keeps the usual 982px size, not the Easy Mode size of a 501 game.
test('the turns list of a 501 game keeps the usual upright size', () => {
  withPage(1000, 489, () => {
    const el = { style: {}, classList: { contains: (c) => c === 'g-x01' || c === 'turnsv' } };
    D.fit(el);
    assert.ok(Math.abs(Number(el.style.zoom) - 489 / 982) < 1e-9);
  });
});

test('the turns list marks its screen, and a NO SCORE cell is drawn smaller so it fits its box', () => {
  const css = require('fs').readFileSync(require('path').join(__dirname, '..', 'scoring.css'), 'utf8');
  assert.match(css, /\.dds \.trow \.c\.sc\.bust\{[^}]*font-size:2\dpx/);
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'scoring-screens.js'), 'utf8');
  assert.match(src, /' turnsv'/);
  assert.match(src, /c sc' \+ \(t\.bust/);
});

// A long turns list scrolls: it is never shrunk to fit the window, and the game screen after it keeps its own size.
test('a long turns list scrolls instead of shrinking, and does not shrink the game after it', () => {
  withPage(1000, 487, () => {
    const make = (classes, need) => ({
      style: {}, classList: { contains: (c) => classes.includes(c) },
      getBoundingClientRect() { return { height: Math.max(need, parseFloat(this.style.minHeight) || 0) * Number(this.style.zoom) }; }
    });
    const list = make(['g-x01', 'turnsv'], 3000);
    D.fit(list);
    assert.ok(Math.abs(Number(list.style.zoom) - 487 / 982) < 1e-9);
    const game = make(['wide', 'g-x01', 'play'], 900);
    D.fit(game);
    assert.ok(Math.abs(Number(game.style.zoom) - 487 / 930) < 1e-9);
  });
});

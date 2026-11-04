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

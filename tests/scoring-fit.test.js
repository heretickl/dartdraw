const { test } = require('node:test');
const assert = require('node:assert/strict');
const D = require('../scoring-screens.js');

// DDScreens.fit (owner 2026-11-07): one scale per window. The zoom comes from the window's size only, never from what
// was drawn, so every .dds screen (setup, bulls, Choice, 501, Cricket, the turns list, the summary) has the same size on
// one window, and the size changes only when the window does (a rotation, a resize). Taller screens scroll.
//   upright:                z = min(1.25, w/660, h/1232)   (1232: 501 Easy Mode, the tallest one-column screen)
//   wide, 560 tall or more: z = min(1.5, w/1280, h/930)
//   wide, under 560 tall:   z = min(h/620, w/1280)         (phones on their side: the compact layout)
// The screen is stretched to the window's height: min-height = max(design height, floor(h / z)).
function withPage(w, h, fn) {
  const saved = { document: global.document, window: global.window };
  global.document = { documentElement: { clientWidth: w } };
  global.window = { innerWidth: w, innerHeight: h };
  try { fn(); } finally { global.document = saved.document; global.window = saved.window; }
}
const el = (classes, need) => ({
  style: {}, classList: { contains: (c) => (classes || []).includes(c) },
  // what the screen would draw: fit must not look at it
  getBoundingClientRect() { return { height: (need || 0) * Number(this.style.zoom) }; }
});
const near = (a, b) => Math.abs(Number(a) - b) < 1e-9;

test('a tall phone: fitted to its width, and the screen fills its height', () => {
  withPage(420, 800, () => {
    const e = el();
    D.fit(e);
    assert.ok(near(e.style.zoom, 420 / 660));
    assert.equal(e.style.minHeight, Math.floor(800 / (420 / 660)) + 'px');
  });
});

test('a short upright window: fitted to the 1232 design height', () => {
  withPage(660, 600, () => {
    const e = el();
    D.fit(e);
    assert.ok(near(e.style.zoom, 600 / 1232));
    assert.equal(e.style.minHeight, '1232px');
  });
});

test('upright: 501, Cricket and the one-column screens share the scale', () => {
  for (const [w, h] of [[820, 1181], [390, 844], [375, 667]]) {
    withPage(w, h, () => {
      const z = Math.min(1.25, w / 660, h / 1232);
      for (const c of [['g-x01', 'play'], ['g-cricket', 'play'], ['g-x01', 'turnsv'], []]) {
        const e = el(c);
        D.fit(e);
        assert.ok(near(e.style.zoom, z), w + 'x' + h + ' ' + c.join(' ') + ': ' + e.style.zoom);
      }
    });
  }
});

test('the turns list of a 501 game has the game\'s own scale', () => {
  withPage(1000, 489, () => {
    const list = el(['g-x01', 'turnsv']), game = el(['wide', 'g-x01', 'play']);
    D.fit(list); D.fit(game);
    assert.ok(near(list.style.zoom, Math.min(489 / 620, 1000 / 1280)));
    assert.equal(list.style.zoom, game.style.zoom);
  });
});

test('the turns list marks its screen, and a NO SCORE cell is drawn smaller so it fits its box', () => {
  const css = require('fs').readFileSync(require('path').join(__dirname, '..', 'scoring.css'), 'utf8');
  assert.match(css, /\.dds \.trow \.c\.sc\.bust\{[^}]*font-size:2\dpx/);
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'scoring-screens.js'), 'utf8');
  assert.match(src, /' turnsv'/);
  assert.match(src, /c sc' \+ \(t\.bust/);
});

// A long turns list scrolls: the scale never depends on how much was drawn.
test('a long screen scrolls instead of shrinking, and does not change the game after it', () => {
  withPage(1000, 487, () => {
    const list = el(['g-x01', 'turnsv'], 3000), game = el(['wide', 'g-x01', 'play'], 900);
    D.fit(list); D.fit(game);
    assert.ok(near(list.style.zoom, Math.min(487 / 620, 1000 / 1280)));
    assert.equal(game.style.zoom, list.style.zoom);
  });
});

test('a short wide window: the one-column screens have the play screen\'s scale', () => {
  withPage(915, 413, () => {
    const one = el([]), play = el(['wide', 'g-x01', 'play']);
    D.fit(one); D.fit(play);
    assert.ok(near(one.style.zoom, Math.min(413 / 620, 915 / 1280)));
    assert.equal(one.style.zoom, play.style.zoom);
  });
  withPage(390, 845, () => { // an upright phone: fitted to its width
    const e = el([]);
    D.fit(e);
    assert.ok(near(e.style.zoom, 390 / 660));
  });
});

// A pop-up on the turns list stays in view when the list has been scrolled down.
test('turns list pop-ups are fixed to the window', () => {
  const css = require('fs').readFileSync(require('path').join(__dirname, '..', 'scoring.css'), 'utf8');
  assert.match(css, /\.dds\.turnsv \.pop,[^{]*\{[^}]*position:fixed/);
  assert.match(css, /\.dds\.turnsv \.veil\{[^}]*position:fixed/);
});

// Cricket's D and T keys are the most tapped keys in a Cricket game: at least 70px wide in the design (about 38px on a
// small phone), and the edit pop-up's keys at least 56px tall.
test('Cricket D / T keys and the edit pop-up keys are big enough to tap', () => {
  const css = require('fs').readFileSync(require('path').join(__dirname, '..', 'scoring.css'), 'utf8');
  const cols = css.match(/\.dds \.crow\{[^}]*grid-template-columns:([^;]+);/)[1].trim().split(/\s+/).map(parseFloat);
  assert.ok(cols[1] >= 70 && cols[3] >= 70, 'D/T columns ' + cols);
  assert.equal(cols.reduce((a, b) => a + b, 0), 570, 'the row keeps its overall width');
  const ek = css.match(/\.dds \.erow \.key\{height:(\d+)px/);
  assert.ok(Number(ek[1]) >= 56, 'edit keys ' + ek[1] + 'px');
});

// The turns list's pop-up is limited to the window's height in the screen's own pixels (--winh), so it uses the whole
// window and scrolls only when it truly does not fit.
test('fit gives the screen its window height in its own pixels', () => {
  for (const [w, h] of [[360, 641], [1180, 820], [852, 393]]) {
    withPage(w, h, () => {
      const vars = {};
      const e = { style: { setProperty: (k, v) => { vars[k] = v; } }, classList: { contains: (c) => c === 'turnsv' } };
      D.fit(e);
      assert.equal(vars['--winh'], Math.floor(h / Number(e.style.zoom)) + 'px');
    });
  }
});

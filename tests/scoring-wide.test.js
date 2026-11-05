const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parse } = require('./lib/mini-dom');
const S = require('../scoring-model.js');
const D = require('../scoring-screens.js');
const WORDS = require('../scoring_app/i18n/casual.en.js');

// Wide screens (owner 2026-11-04): a tablet turned sideways, a laptop or a phone on its side shows the scores on the left
// and the keypad on the right, filling the screen; upright screens keep the phone layout. A keyboard can type the score.

const HEADER = { title: 'DARTDRAW', line2: 'CASUAL PLAY', line3: 'BEST OF 5 LEGS • 501 • DOUBLE OUT' };
const match = (game) => S.create({ format: S.formatFor({ game, bestOf: 5 }), names: { a: 'Ahmad', b: 'Daniel' }, now: () => 1000 });
const opts = (o) => Object.assign({ words: WORDS, header: HEADER, pill: null, mode: 'total', typed: '' }, o || {});
const dom = (m, o) => parse(D.render(m.view(), opts(o)));
const has = (el, sel) => !!el.querySelector(sel);
function withPage(w, h, fn) {
  const saved = { document: global.document, window: global.window };
  global.document = { documentElement: { clientWidth: w } };
  global.window = { innerWidth: w, innerHeight: h };
  try { fn(); } finally { global.document = saved.document; global.window = saved.window; }
}

test('wide, turn total: scores and last 6 on the left; hint, quick scores, typed score and keypad on the right', () => {
  const m = match('501'); m.bull('a');
  const d = dom(m, { wide: true });
  assert.ok(d.querySelector('.dds').classList.contains('wide'));
  const l = d.querySelector('.wl'), r = d.querySelector('.wr');
  assert.ok(has(l, '.dds-cards') && has(l, '.last3'));
  assert.ok(has(r, '.quick') && has(r, '.entry') && has(r, '.pad'));
  assert.ok(!has(l, '.pad') && !has(r, '.dds-cards'));
});

// last 6 scores on a wide screen in turn total (owner 2026-11-04); 3 on a phone and in dart by dart
test('model: last6 holds the newest 6 turns, newest first, and last3 is its first 3', () => {
  const m = match('501'); m.bull('a');
  [26, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26].forEach((s) => m.total(s));
  assert.deepEqual(m.view().last6.map((r) => r.n), [7, 6, 5, 4, 3, 2]);
  assert.deepEqual(m.view().last3, m.view().last6.slice(0, 3));
});

test('wide, turn total: LAST 6 SCORES with 6 rows, blanks filling the rest, the newest highlighted', () => {
  const m = match('501'); m.bull('a');
  [60, 45, 100].forEach((s) => m.total(s));
  const s = dom(m, { wide: true }).querySelector('.wl .last3');
  assert.ok(s.classList.contains('six'));
  assert.equal(s.querySelector('.ttl').textContent.trim(), 'LAST 6 SCORES');
  assert.equal(s.querySelectorAll('.row').length, 6);
  assert.equal(s.querySelectorAll('.row.blank').length, 4);
  assert.ok(s.querySelectorAll('.row')[0].classList.contains('new'));
});

test('phone and dart by dart keep LAST 3 SCORES; wide cricket has no score table', () => {
  const m = match('501'); m.bull('a');
  const p = dom(m, {}).querySelector('.last3');
  assert.equal(p.querySelectorAll('.row').length, 3);
  assert.ok(!p.classList.contains('six'));
  const e = dom(m, { wide: true, mode: 'darts', cur: [], mult: 1 }).querySelector('.last3');
  assert.equal(e.querySelectorAll('.row').length, 3);
  assert.equal(e.querySelector('.ttl').textContent.trim(), 'LAST 3 SCORES');
  const c = match('cricket'); c.bull('a');
  assert.equal(dom(c, { wide: true }).querySelector('.last3'), null);
});

test('wide, dart by dart: scores, last 3 and this turn on the left; multipliers, numbers and ENTER bar on the right', () => {
  const m = match('501'); m.bull('a');
  const d = dom(m, { wide: true, mode: 'darts', cur: [], mult: 1 });
  const l = d.querySelector('.wl'), r = d.querySelector('.wr');
  assert.ok(has(l, '.dds-cards') && has(l, '.last3') && has(l, '.turnp'));
  assert.ok(has(r, '.mults') && has(r, '.grid') && has(r, '.dbar'));
});

test('wide, cricket: scores and the darts bar on the left; the cricket board on the right', () => {
  const m = match('cricket'); m.bull('a');
  const d = dom(m, { wide: true, cur: [] });
  const l = d.querySelector('.wl'), r = d.querySelector('.wr');
  assert.ok(has(l, '.dds-cards') && has(l, '.dbar'));
  assert.ok(has(r, '.cricket') && !has(r, '.dbar'));
});

test('wide: screens without a keypad (bull, a leg\'s turns) keep the one-column layout', () => {
  const m = match('501');
  assert.ok(!dom(m, { wide: true }).querySelector('.dds').classList.contains('wide'));
  m.bull('a');
  const t = dom(m, { wide: true, popup: { kind: 'turns', leg: 0 }, turns: [] });
  assert.ok(!t.querySelector('.dds').classList.contains('wide'));
  assert.equal(t.querySelector('.wl'), null);
});

test('not wide: the phone layout is unchanged', () => {
  const m = match('501'); m.bull('a');
  const d = dom(m, {});
  assert.ok(!d.querySelector('.dds').classList.contains('wide'));
  assert.equal(d.querySelector('.wl'), null);
});

test('isWide: a screen clearly wider than tall', () => {
  withPage(1180, 820, () => assert.equal(D.isWide(), true)); // iPad on its side
  withPage(844, 390, () => assert.equal(D.isWide(), true)); // phone on its side
  withPage(1440, 900, () => assert.equal(D.isWide(), true)); // laptop
  withPage(820, 1180, () => assert.equal(D.isWide(), false)); // iPad upright
  withPage(420, 800, () => assert.equal(D.isWide(), false)); // phone upright
  withPage(900, 850, () => assert.equal(D.isWide(), false)); // nearly square
});

test('fit, wide: the 1280 x 720 screen is scaled to fit both ways and stretched to the height', () => {
  withPage(1180, 820, () => {
    const el = { style: {}, classList: { contains: (c) => c === 'wide' } };
    D.fit(el);
    assert.equal(el.style.zoom, Math.min(1180 / 1280, 820 / 720));
    assert.equal(el.style.minHeight, Math.round(820 / el.style.zoom) + 'px');
  });
  withPage(844, 390, () => {
    const el = { style: {}, classList: { contains: (c) => c === 'wide' } };
    D.fit(el);
    assert.equal(el.style.zoom, 390 / 720);
  });
});

test('fit, one column on a wide window: scaled down so the whole screen fits the height', () => {
  withPage(1440, 900, () => {
    const el = { style: {}, classList: { contains: () => false } };
    D.fit(el);
    assert.equal(el.style.zoom, 900 / 982);
    assert.equal(el.style.minHeight, '982px');
  });
});

// The Normal / Easy switch on 01 screens (owner 2026-11-04): Normal Mode is the turn total, Easy Mode dart by dart
test('01: a NORMAL MODE | EASY MODE switch under the score cards, on both layouts; none for cricket', () => {
  const m = match('501'); m.bull('a');
  const sw = (o) => { const d = dom(m, o); return d.querySelector('.modesw'); };
  const n = sw({});
  assert.deepEqual(n.querySelectorAll('button').map((b) => [b.getAttribute('data-act'), b.getAttribute('data-v'), b.textContent.trim(), b.classList.contains('on')]),
    [['mode', 'total', 'NORMAL MODE', true], ['mode', 'darts', 'EASY MODE', false]]);
  const e = sw({ mode: 'darts', cur: [], mult: 1 });
  assert.deepEqual(e.querySelectorAll('button').map((b) => b.classList.contains('on')), [false, true]);
  const wd = dom(m, { wide: true });
  assert.ok(wd.querySelector('.wl .modesw'));
  const c = match('cricket'); c.bull('a');
  assert.equal(dom(c, {}).querySelector('.modesw'), null);
  assert.equal(dom(c, { wide: true }).querySelector('.modesw'), null);
});

test('01: tapping EASY MODE switches to dart by dart and keeps the choice', () => {
  const m = match('501'); m.bull('a');
  const seen = [];
  const root = parse('<main id="app"></main>').getElementById('app');
  const saved = { document: global.document, window: global.window };
  global.document = undefined; global.window = undefined;
  try {
    D.mount(root, m, Object.assign(opts(), { onPrefs: (p) => seen.push(p.mode) }));
    const tap = (sel) => { const el = root.querySelector(sel); el.dispatchEvent({ type: 'click', bubbles: true, target: el }); };
    tap('.modesw [data-v="darts"]');
    assert.ok(root.querySelector('.grid'));
    assert.ok(root.querySelector('.modesw [data-v="darts"]').classList.contains('on'));
    tap('.modesw [data-v="total"]');
    assert.ok(root.querySelector('.pad'));
    assert.deepEqual(seen, ['darts', 'total']);
  } finally { global.document = saved.document; global.window = saved.window; }
});

test('settings use the same names: NORMAL MODE and EASY MODE', () => {
  const m = match('501'); m.bull('a');
  const d = dom(m, { popup: { kind: 'gear' } });
  assert.deepEqual(d.querySelectorAll('.gearp .seg button').map((b) => b.textContent.trim()), ['NORMAL MODE', 'EASY MODE']);
});

// keyboard: digits, Backspace and Enter type a turn total; Escape closes a pop-up
function mounted(m, extra) {
  const listeners = {};
  const saved = { document: global.document, window: global.window };
  global.document = { documentElement: { clientWidth: 420 }, addEventListener: (t, f) => { listeners[t] = f; } };
  global.window = { innerWidth: 420, innerHeight: 800, addEventListener: () => {} };
  const root = parse('<main id="app"></main>').getElementById('app');
  root.isConnected = true;
  const h = D.mount(root, m, Object.assign(opts(), extra || {}));
  const key = (k) => { let stopped = false; listeners.keydown({ key: k, target: {}, preventDefault: () => { stopped = true; } }); return stopped; };
  return { root, h, key, done: () => { global.document = saved.document; global.window = saved.window; } };
}

test('keyboard: type 100 and press Enter scores it; Backspace takes off a digit', () => {
  const m = match('501'); m.bull('a');
  const p = mounted(m);
  try {
    ['1', '0', '0', '5'].forEach(p.key);
    assert.equal(p.root.querySelector('.entry .val').textContent, '100'); // 1005 is over 180
    assert.equal(p.key('Backspace'), true);
    p.key('0'); p.key('Enter');
    assert.equal(m.view().sides.a.left, 401);
    assert.equal(m.view().throwing, 'b');
  } finally { p.done(); }
});

test('keyboard: ignored while typing in a box, and on screens without the number pad', () => {
  const m = match('501');
  const p = mounted(m);
  try {
    assert.equal(p.key('1'), false); // the bull screen
    m.bull('a'); p.h.refresh();
    const listeners = global.document;
    assert.ok(listeners);
    assert.equal(p.key('Escape'), false); // nothing open
  } finally { p.done(); }
});

test('keyboard: Escape closes settings', () => {
  const m = match('501'); m.bull('a');
  const p = mounted(m);
  try {
    p.h.act('gear');
    assert.ok(p.root.querySelector('.gearp'));
    assert.equal(p.key('Escape'), true);
    assert.equal(p.root.querySelector('.gearp'), null);
  } finally { p.done(); }
});

// A long name must not widen its own score box: both boxes stay the same width and the name is cut with "...".
test('the two score boxes share the width equally whatever the names', () => {
  const css = require('fs').readFileSync(require('path').join(__dirname, '..', 'scoring.css'), 'utf8');
  const m = css.match(/\.dds-cards\{[^}]*grid-template-columns:([^;}]+)/);
  assert.ok(m, 'the score box row is a grid');
  assert.equal(m[1].trim(), 'minmax(0,1fr) 104px minmax(0,1fr)');
});

// The sideways header holds three lines (DARTDRAW, CASUAL PLAY, the game line): about 98px at its font sizes. A shorter
// header lets the game line run into the quick-score pills below it.
test('the sideways header is tall enough for its three lines', () => {
  const css = require('fs').readFileSync(require('path').join(__dirname, '..', 'scoring.css'), 'utf8');
  const m = css.match(/\.dds\.wide>\.dds-hd\{[^}]*height:(\d+)px/);
  assert.ok(m, 'the sideways header has a height');
  assert.ok(Number(m[1]) >= 104, 'header height ' + m[1] + 'px');
});

// Some screens need more than 720px (Easy Mode's keypad and This turn box): on a short window the bottom row was cut
// off. fit measures what was drawn and scales down again until the whole screen is in the window.
test('fit: a screen taller than its design height is scaled down until it all fits', () => {
  withPage(1000, 488, () => {
    const NEED = 790; // what the drawn screen really needs, in its own pixels
    const el = {
      style: {}, classList: { contains: (c) => c === 'wide' },
      getBoundingClientRect() {
        const z = Number(this.style.zoom), min = parseFloat(this.style.minHeight) || 0;
        return { height: Math.max(NEED, min) * z };
      }
    };
    D.fit(el);
    assert.ok(el.getBoundingClientRect().height <= 488 + 0.5, 'drawn height ' + el.getBoundingClientRect().height);
    assert.ok(Math.abs(Number(el.style.zoom) - 488 / NEED) < 1e-9);
  });
});

// Between turns the screen must not change size: once a screen on this window needed a smaller scale, later screens on
// the same window keep it, even if they are a little shorter.
test('fit: the scale stays put between turns on the same window', () => {
  withPage(1000, 489, () => {
    const make = (need) => ({
      style: {}, classList: { contains: (c) => c === 'wide' },
      getBoundingClientRect() { return { height: Math.max(need, parseFloat(this.style.minHeight) || 0) * Number(this.style.zoom) }; }
    });
    const tall = make(865), short = make(791);
    D.fit(tall);
    D.fit(short);
    assert.equal(short.style.zoom, tall.style.zoom);
  });
});

// A long name in "<NAME> TO THROW" stayed on two lines and made the screen taller; it is cut with "..." instead.
test('the This turn line never wraps a long name', () => {
  const css = require('fs').readFileSync(require('path').join(__dirname, '..', 'scoring.css'), 'utf8');
  const m = css.match(/\.dds \.turnp \.who\{([^}]*)\}/);
  assert.ok(m, 'a rule for the name on the This turn line');
  assert.match(m[1], /white-space:nowrap/);
  assert.match(m[1], /text-overflow:ellipsis/);
});

// Empty rows of the last-scores box keep their full height, so the box (and the screen) does not grow as scores arrive.
test('sideways: empty last-scores rows keep their height', () => {
  const css = require('fs').readFileSync(require('path').join(__dirname, '..', 'scoring.css'), 'utf8');
  const three = css.match(/\.dds\.wide \.wl \.last3 \.row\{([^}]*)\}/);
  const six = css.match(/\.dds\.wide \.wl \.last3\.six \.row\{([^}]*)\}/);
  assert.match(three[1], /min-height:4\dpx/);
  assert.match(six[1], /min-height:3\dpx/);
});

// 01 games are sized for Easy Mode (the taller of the two) from the start, so switching Normal / Easy keeps the size.
test('fit, sideways 01: sized for Easy Mode in both modes', () => {
  withPage(1000, 487, () => {
    const el = (easy) => ({ style: {}, classList: { contains: (c) => c === 'wide' || c === 'g-x01' } });
    const normal = el(false), easy = el(true);
    D.fit(normal);
    D.fit(easy);
    assert.equal(normal.style.zoom, easy.style.zoom);
    assert.ok(Math.abs(Number(normal.style.zoom) - 487 / 930) < 1e-9);
  });
});

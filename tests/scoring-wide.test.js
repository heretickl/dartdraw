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

test('fit, wide: the 1280 x 930 screen is scaled to fit both ways and stretched to the height', () => {
  withPage(1180, 820, () => {
    const el = { style: {}, classList: { contains: (c) => c === 'wide' } };
    D.fit(el);
    assert.equal(el.style.zoom, Math.min(1.5, 1180 / 1280, 820 / 930));
    assert.equal(el.style.minHeight, Math.max(930, Math.floor(820 / el.style.zoom)) + 'px');
  });
  withPage(844, 390, () => { // a phone on its side: the compact design height
    const el = { style: {}, classList: { contains: (c) => c === 'wide' } };
    D.fit(el);
    assert.equal(el.style.zoom, Math.min(390 / 620, 844 / 1280));
    assert.equal(el.style.minHeight, Math.max(620, Math.floor(390 / el.style.zoom)) + 'px');
  });
});

test('fit, one column on a wide window: the wide scale, centred, and it scrolls', () => {
  withPage(1440, 900, () => {
    const el = { style: {}, classList: { contains: () => false } };
    D.fit(el);
    assert.equal(el.style.zoom, Math.min(1.5, 1440 / 1280, 900 / 930));
    assert.equal(el.style.minHeight, '930px');
    assert.equal(el.style.width, '', 'the 660 column is not widened');
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

// The scale never comes from what was drawn (owner 2026-11-07): the design heights are ones the layouts really fit,
// so a screen that draws taller is not shrunk, and the size cannot jump from one tap to the next.
test('fit: the scale does not depend on what was drawn', () => {
  withPage(1000, 488, () => {
    const el = {
      style: {}, classList: { contains: (c) => c === 'wide' || c === 'play' },
      getBoundingClientRect() { return { height: 2000 * Number(this.style.zoom) }; }
    };
    D.fit(el);
    assert.ok(Math.abs(Number(el.style.zoom) - Math.min(488 / 620, 1000 / 1280)) < 1e-9);
  });
});

// Between turns the screen must not change size: once a screen on this window needed a smaller scale, later screens on
// the same window keep it, even if they are a little shorter.
test('fit: the scale stays put between turns on the same window', () => {
  withPage(1000, 489, () => {
    const make = (need) => ({
      style: {}, classList: { contains: (c) => c === 'wide' || c === 'play' },
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
    const el = (easy) => ({ style: {}, classList: { contains: (c) => c === 'wide' || c === 'g-x01' || c === 'play' } });
    const normal = el(false), easy = el(true);
    D.fit(normal);
    D.fit(easy);
    assert.equal(normal.style.zoom, easy.style.zoom);
    assert.ok(Math.abs(Number(normal.style.zoom) - Math.min(487 / 620, 1000 / 1280)) < 1e-9);
  });
});

// Paired boxes that show a player's name (score cards, the match summary cards, the bull "who was closest" buttons)
// share the width equally: a plain 1fr track grows to fit a long name, so they use minmax(0,1fr).
test('paired name boxes share the width equally whatever the names', () => {
  const css = require('fs').readFileSync(require('path').join(__dirname, '..', 'scoring.css'), 'utf8');
  const cols = (sel) => {
    const m = css.match(new RegExp(sel.replace(/[.]/g, '\.') + '\{[^}]*grid-template-columns:([^;}]+)'));
    assert.ok(m, sel + ' is a grid');
    return m[1].trim();
  };
  assert.equal(cols('.dds .sum .top'), 'minmax(0,1fr) 104px minmax(0,1fr)');
  assert.equal(cols('.dds .bbtns'), 'minmax(0,1fr) minmax(0,1fr)');
});

// A sideways screen wider than the 1280-wide design (a phone on its side, a laptop) widens its layout to use the room
// instead of leaving black bands at the sides, up to 1.4 times the design width.
test('fit, sideways: the layout widens to use a wide window', () => {
  withPage(915, 411, () => {
    const el = { style: {}, classList: { contains: (c) => c === 'wide' || c === 'g-x01' || c === 'play' } };
    D.fit(el);
    const z = Number(el.style.zoom);
    assert.equal(el.style.width, Math.min(Math.floor(915 / z), 1792) + 'px');
  });
  withPage(1180, 821, () => { // a tablet on its side fills its width too
    const el = { style: {}, classList: { contains: (c) => c === 'wide' || c === 'g-x01' || c === 'play' } };
    D.fit(el);
    assert.equal(el.style.width, Math.floor(1180 / Number(el.style.zoom)) + 'px');
  });
});

// A Cricket leg inside a Choice match is drawn at the same scale as the 501 legs (owner 2026-11-07: one scale).
test('fit: Cricket and 501 have the same scale on the same window', () => {
  for (const [w, h] of [[1000, 486], [1180, 820], [820, 1180]]) {
    withPage(w, h, () => {
      const make = (game, need) => ({
        style: {}, classList: { contains: (c) => (w >= h * 1.2 && c === 'wide') || c === 'play' || c === game },
        getBoundingClientRect() { return { height: need * Number(this.style.zoom) }; }
      });
      const x01 = make('g-x01', 990), cr = make('g-cricket', 700);
      D.fit(x01);
      D.fit(cr);
      assert.equal(cr.style.zoom, x01.style.zoom, w + 'x' + h);
    });
  }
});

// zoom x min-height never lands past the window (a fraction over showed a needless scrollbar).
test('fit: the stretched height never runs a fraction past the window', () => {
  for (const [w, h, dh] of [[820, 1179, 1232], [1000, 485, 620], [390, 843, 1232], [1180, 821, 930]]) {
    withPage(w, h, () => {
      const el = { style: {}, classList: { contains: () => false } };
      D.fit(el);
      const min = parseFloat(el.style.minHeight);
      assert.ok(min * Number(el.style.zoom) <= h + 1e-9 || min === dh, w + 'x' + h + ': ' + min);
    });
  }
});

// Only the live scoring screen is "play" (the 501 / Cricket keys). The bull and Choice screens are one-column
// screens: on a wide window they keep their 660 column at the play screen's scale and scroll.
test('the bull screen is not the play screen; the scoring screen is', () => {
  const m = match('501');
  assert.equal(dom(m, {}).querySelector('.dds').classList.contains('play'), false);
  m.bull('a');
  assert.equal(dom(m, {}).querySelector('.dds').classList.contains('play'), true);
});

// The edit pop-up on the turns list starts near the top of the window like the other turns-list pop-ups, so its
// Cancel / Change buttons are inside the window.
test('turns-list edit pop-up is fixed near the top of the window', () => {
  const css = require('fs').readFileSync(require('path').join(__dirname, '..', 'scoring.css'), 'utf8');
  assert.match(css, /\.dds\.turnsv \.pop,\.dds\.turnsv \.pop\.edit\{position:fixed;top:40px/);
});

/* ---------- one scale per window, and the compact sideways layout (owner 2026-11-07) ---------- */

// The class list of a screen as render() draws it, for fit (which reads only the classes and the window).
const drawnAs = (m, o) => {
  const c = D.render(m.view(), opts(o)).match(/^<div class="([^"]+)"/)[1].split(' ');
  return { style: {}, classList: { contains: (x) => c.includes(x) }, getBoundingClientRect() { return { height: 3000 * Number(this.style.zoom) }; } };
};
const acts = (d) => d.querySelectorAll('[data-act]').map((e) => e.getAttribute('data-act') + (e.hasAttribute('data-v') ? '=' + e.getAttribute('data-v') : '')).sort();

test('one scale: 501, Cricket, a turns list and a one-column screen share the zoom on one window', () => {
  for (const [w, h] of [[393, 852], [375, 667], [820, 1180], [1180, 820], [852, 393], [852, 320]]) {
    withPage(w, h, () => {
      const wide = D.isWide(), compactWide = D.isCompactWide();
      const x = match('501'); x.bull('a');
      const c = match('cricket'); c.bull('a');
      const bull = match('501');
      const els = [
        drawnAs(x, { wide, compactWide }), drawnAs(x, { wide, compactWide, mode: 'darts', cur: [], mult: 1 }),
        drawnAs(c, { wide, compactWide, cur: [] }), drawnAs(x, { wide, compactWide, popup: { kind: 'turns', leg: 0 }, turns: [] }),
        drawnAs(bull, { wide, compactWide })];
      assert.ok(els[0].classList.contains('play') && els[2].classList.contains('g-cricket') && els[3].classList.contains('turnsv'));
      els.forEach((e) => D.fit(e));
      els.forEach((e, i) => assert.equal(e.style.zoom, els[0].style.zoom, w + 'x' + h + ' screen ' + i));
    });
  }
});

test('isCompactWide: a wide window under 560 tall', () => {
  withPage(852, 393, () => assert.equal(D.isCompactWide(), true)); // iPhone on its side
  withPage(852, 320, () => assert.equal(D.isCompactWide(), true)); // with Safari's bars
  withPage(1000, 559, () => assert.equal(D.isCompactWide(), true)); // a short laptop window
  withPage(1000, 560, () => assert.equal(D.isCompactWide(), false));
  withPage(1180, 820, () => assert.equal(D.isCompactWide(), false)); // iPad on its side
  withPage(393, 852, () => assert.equal(D.isCompactWide(), false)); // upright phone
  withPage(500, 450, () => assert.equal(D.isCompactWide(), false)); // short but not wide
});

test('the compact class is set only on a wide screen with compactWide', () => {
  const m = match('501'); m.bull('a');
  const cls = (o) => dom(m, o).querySelector('.dds').classList;
  assert.ok(cls({ wide: true, compactWide: true }).contains('cw'));
  assert.ok(!cls({ wide: true }).contains('cw'));
  assert.ok(!cls({ compactWide: true }).contains('cw'));
  assert.ok(!cls({}).contains('cw'));
});

test('compact Normal Mode: header, cards, switch and typed score left; 9 pills in one row, a 5-wide keypad and one bottom row right', () => {
  const m = match('501'); m.bull('a');
  const d = dom(m, { wide: true, compactWide: true, typed: '6' });
  const l = d.querySelector('.wl'), r = d.querySelector('.wr');
  assert.ok(has(l, '.dds-hd') && has(l, '.dds-cards') && has(l, '.modesw') && has(l, '.entry'));
  assert.equal(d.querySelectorAll('.dds > .dds-hd').length, 0, 'the header sits in the left column');
  assert.equal(d.querySelector('.last3'), null, 'no Last 6 table');
  assert.equal(r.querySelectorAll('.quick > div').length, 1, 'one row of pills');
  assert.deepEqual(r.querySelectorAll('.quick > div > .q').map((e) => e.getAttribute('data-v')), ['26', '41', '45', '60', '85', '100', '121', '140', '180']);
  assert.deepEqual(r.querySelectorAll('.pad [data-act="digit"]').map((e) => e.getAttribute('data-v')), ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']);
  assert.deepEqual(r.querySelectorAll('.padb [data-act]').map((e) => e.getAttribute('data-act')), ['del', 'undo', 'bust', 'submit']);
  assert.equal(d.querySelector('.entry .val').textContent, '6');
});

test('compact Easy Mode: This turn left; S/D/T, numbers 1-20 and 25, and Bull Miss del No score Undo Enter right', () => {
  const m = match('501'); m.bull('a');
  const d = dom(m, { wide: true, compactWide: true, mode: 'darts', cur: [{ n: 20, m: 3 }], mult: 1 });
  const l = d.querySelector('.wl'), r = d.querySelector('.wr');
  assert.ok(has(l, '.dds-hd') && has(l, '.dds-cards') && has(l, '.modesw') && has(l, '.turnp .slots'));
  assert.equal(l.querySelectorAll('.slot').length, 3);
  assert.ok(l.querySelectorAll('.slot')[1].classList.contains('now'), 'the next slot is outlined');
  assert.ok(has(l, '.turnp .who') && has(l, '.turnp .scored') && has(l, '.turnp .after'));
  assert.equal(d.querySelector('.last3'), null, 'no Last 3 table');
  assert.deepEqual(r.querySelectorAll('.mults [data-act="mult"]').map((e) => e.getAttribute('data-v')), ['1', '2', '3']);
  const nums = r.querySelectorAll('.grid [data-act="dart"]').map((e) => e.getAttribute('data-v'));
  assert.deepEqual(nums, Array.from({ length: 20 }, (_, i) => String(i + 1)).concat(['25']));
  assert.deepEqual(r.querySelectorAll('.cwbar [data-act]').map((e) => e.getAttribute('data-act') + (e.hasAttribute('data-v') ? '=' + e.getAttribute('data-v') : '')),
    ['dart=bull', 'miss', 'del', 'bust', 'undo', 'enter']);
  assert.equal(d.querySelector('.dbar'), null);
});

test('compact: every tap of the sideways screen is still there, with the same action', () => {
  const m = match('501'); m.bull('a');
  assert.deepEqual(acts(dom(m, { wide: true, compactWide: true })), acts(dom(m, { wide: true })));
  const e = { mode: 'darts', cur: [], mult: 1 };
  assert.deepEqual(acts(dom(m, Object.assign({ wide: true, compactWide: true }, e))), acts(dom(m, Object.assign({ wide: true }, e))));
  const c = match('cricket'); c.bull('a');
  assert.deepEqual(acts(dom(c, { wide: true, compactWide: true, cur: [] })), acts(dom(c, { wide: true, cur: [] })));
});

// MISS moves above the darts bar so the 7 board rows have the right column's whole height (about 44px on the phone).
test('compact Cricket: the board on the right; the header, cards, MISS and darts bar on the left', () => {
  const c = match('cricket'); c.bull('a');
  const d = dom(c, { wide: true, compactWide: true, cur: [] });
  const l = d.querySelector('.wl'), r = d.querySelector('.wr');
  assert.ok(has(l, '.dds-hd') && has(l, '.dbar') && has(l, '[data-act="miss"]'));
  assert.ok(has(r, '.cricket') && !has(r, '[data-act="miss"]'));
  assert.ok(has(dom(c, { wide: true, cur: [] }).querySelector('.wr'), '.cricket [data-act="miss"]'), 'tablets keep MISS under the board');
});

test('mount redraws when the window turns between compact and tablet-sized sideways', () => {
  const m = match('501'); m.bull('a');
  const saved = { document: global.document, window: global.window };
  let onResize = null;
  global.document = { documentElement: { clientWidth: 1180 }, addEventListener: () => {} };
  global.window = { innerWidth: 1180, innerHeight: 820, addEventListener: (t, f) => { if (t === 'resize') onResize = f; } };
  try {
    const root = parse('<main id="app"></main>').getElementById('app');
    root.isConnected = true;
    D.mount(root, m, opts());
    assert.ok(root.querySelector('.dds').classList.contains('wide') && !root.querySelector('.dds').classList.contains('cw'));
    global.window.innerHeight = 500; // still wide (1180 >= 600), now under 560 tall
    onResize();
    assert.ok(root.querySelector('.dds').classList.contains('cw'));
    global.window.innerHeight = 820;
    onResize();
    assert.ok(!root.querySelector('.dds').classList.contains('cw'));
  } finally { global.document = saved.document; global.window = saved.window; }
});

// A missed dart reads "M" (owner 2026-11-07), so it is never confused with a dart not thrown yet ("–").
test('a missed dart is shown as M; a dart not thrown yet as a dash', () => {
  assert.equal(D.dartName({ n: 0, m: 1 }, WORDS), 'M');
  assert.equal(D.dartName(null, WORDS), '–');
  assert.equal(D.dartName({ n: 20, m: 3 }, WORDS), 'T20');
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parse } = require('./lib/mini-dom');

// Fixes from the final review of casual play (ledger .superpowers/sdd/2026-11-03-casual-play/progress.md, "Final:" lines).
global.DDMatch = require('../scoring_app/match-engine.js');
const S = global.DDScoring = require('../scoring-model.js');
const D = global.DDScreens = require('../scoring-screens.js');
const C = require('../scoring_app/casual.js');
const WORDS = require('../scoring_app/i18n/casual.en.js');

const T = (n, m) => ({ n, m });
const MISS = T(0, 0);
const txt = (el) => el.textContent.replace(/\s+/g, ' ').trim();
const make = (game, bestOf, extra) => S.create(Object.assign({ format: S.formatFor({ game, bestOf }), names: { a: 'Ahmad', b: 'Daniel' }, now: () => 1000 }, extra || {}));
const opts = (o) => Object.assign({ words: WORDS, header: { title: 'DARTDRAW', line2: 'CASUAL PLAY', line3: '' }, pill: null, mode: 'total', typed: '' }, o || {});
function winLeg(m, side) {
  const leg = m.view().leg; let mine = 0;
  while (m.view().ask === 'turn' && m.view().leg === leg && !m.view().winner) {
    const v = m.view();
    if (v.throwing !== side) { if (v.game === 'cricket') m.darts([MISS, MISS, MISS]); else m.total(0); continue; }
    if (v.game === 'cricket') m.darts([[T(20, 3), T(19, 3), T(18, 3)], [T(17, 3), T(16, 3), T(15, 3)], [T(25, 2), T(25, 1)]][mine]);
    else if (v.sides[side].left > 141) m.total(180);
    else { m.total(141); m.finishDart(3); }
    mine++;
  }
}
function mounted(m, extra) {
  const root = parse('<div id="r"></div>').getElementById('r');
  const seen = [];
  D.mount(root, m, Object.assign(opts(), { onChange() {}, onAction: (a) => seen.push(a) }, extra || {}));
  const tap = (sel) => { const el = root.querySelector(sel); assert.ok(el, sel); el.dispatchEvent({ type: 'click', bubbles: true, target: el }); };
  return { root, tap, seen };
}

test('Important 1: checkout hints are shown when switched on, in turn total and dart by dart', () => {
  const m = make('501', 3, { hints: true }); m.bull('a');
  [180, 0, 180, 0, 41, 0].forEach((s) => m.total(s));
  const hint = DDMatch.checkoutHint(100).join(' • ');
  let d = parse(D.render(m.view(), opts()));
  assert.equal(txt(d.querySelector('.hint')), hint);
  d = parse(D.render(m.view(), opts({ mode: 'darts' })));
  assert.equal(txt(d.querySelector('.hint')), hint);
  m.setHints(false);
  assert.equal(parse(D.render(m.view(), opts())).querySelector('.hint'), null);
});

test('Important 2: a winning turn keyed by mistake before a Choice deciding leg can be undone', () => {
  const m = make('choice', 3); m.bull('a');
  winLeg(m, 'a'); winLeg(m, 'b');
  assert.equal(m.view().ask, 'bull');
  const d = parse(D.render(m.view(), opts()));
  assert.ok(d.querySelector('[data-act="undo"]'), 'Undo on the deciding bull');
  assert.deepEqual(m.undo(), { ok: true });
  assert.equal(m.view().ask, 'turn'); assert.deepEqual(m.view().legsWon, { a: 1, b: 0 }); assert.equal(m.view().leg, 1);
  // and from the Choice screen: the bull is taken back first, then the turn
  winLeg(m, 'b'); m.bull('a');
  assert.equal(m.view().ask, 'choice');
  assert.ok(parse(D.render(m.view(), opts())).querySelector('[data-act="undo"]'), 'Undo on the Choice screen');
  m.undo(); assert.equal(m.view().ask, 'bull');
  m.undo(); assert.equal(m.view().ask, 'turn'); assert.deepEqual(m.view().legsWon, { a: 1, b: 0 });
});

test('Important 3: a mis-tapped bull is taken back by Undo, at the opening and the deciding leg', () => {
  const m = make('501', 3); m.bull('b');
  assert.deepEqual(m.undo(), { ok: true });
  assert.equal(m.view().ask, 'bull'); assert.equal(m.events().length, 0);
  m.bull('a'); m.total(60);
  m.undo();
  assert.equal(m.view().ask, 'turn'); assert.equal(m.view().throwing, 'a');
  m.undo();
  assert.equal(m.view().ask, 'bull');
  const c = make('choice', 3); c.bull('a'); winLeg(c, 'a'); winLeg(c, 'b'); c.bull('b'); c.choice('start', 'x01');
  assert.equal(c.view().throwing, 'b');
  c.undo(); assert.equal(c.view().ask, 'choice');
  c.undo(); assert.equal(c.view().ask, 'bull');
  c.bull('a'); assert.deepEqual(c.view().choice.by, 'a');
});

test('Important 4: a game in progress can be ended from the settings, after a confirm', () => {
  const store = new Map();
  const storage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const root = parse('<main id="app"></main>').getElementById('app');
  const h = C.start(root, { storage, words: WORDS });
  const tap = (sel) => { const el = root.querySelector(sel); assert.ok(el, sel); el.dispatchEvent({ type: 'click', bubbles: true, target: el }); };
  const type = (sel, v) => { const el = root.querySelector(sel); el.value = v; el.dispatchEvent({ type: 'input', bubbles: true, target: el }); };
  type('#csA', 'Ahmad'); type('#csB', 'Daniel'); tap('[data-cs="best"][data-v="9"]'); tap('[data-cs="start"]');
  tap('[data-act="bull"][data-v="a"]'); tap('[data-act="quick"][data-v="60"]');
  tap('[data-act="gear"]');
  tap('[data-act="gearBtn"][data-v="0"]');
  assert.equal(txt(root.querySelector('.pop h2')), 'END THIS GAME?');
  tap('[data-act="closePop"]');
  assert.equal(h.match().events().length, 2);
  tap('[data-act="gear"]'); tap('[data-act="gearBtn"][data-v="0"]'); tap('[data-act="gearYes"]');
  assert.equal(root.querySelector('#csA').value, 'Ahmad');
  assert.ok(root.querySelector('[data-cs="best"][data-v="9"]').classList.contains('on'));
  assert.equal(C.load(storage).events, null);
});

test('Important 5: BUST clears typed digits, so they never join the next score', () => {
  const m = make('501', 3); m.bull('a');
  const { root, tap } = mounted(m);
  tap('[data-act="digit"][data-v="6"]');
  tap('[data-act="bust"]');
  assert.equal(txt(root.querySelector('.entry .val')), '');
  tap('[data-act="digit"][data-v="4"]'); tap('[data-act="digit"][data-v="5"]'); tap('[data-act="submit"]');
  assert.equal(m.view().sides.b.left, 456);
});

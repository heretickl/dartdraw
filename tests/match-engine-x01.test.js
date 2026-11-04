const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../match-engine.js');

// Match engine: x01 turns keyed as totals or dart by dart, checkouts and the finishing dart.

test('min darts and bogey finishes', () => {
  assert.equal(M.minDarts(40), 1); assert.equal(M.minDarts(50), 1); assert.equal(M.minDarts(41), 2);
  assert.equal(M.minDarts(110), 2); assert.equal(M.minDarts(170), 3);
  [169, 168, 166, 165, 163, 162, 159, 171, 2000].forEach((n) => assert.equal(M.minDarts(n), 0, String(n)));
  assert.equal(M.minDarts(1), 0);
});

test('bogey finishes and impossible totals', () => {
  assert.equal(M.totalCheck(170, 170, true, 'SI'), 'checkout');
  assert.equal(M.totalCheck(159, 159, true, 'SI'), 'bust');
  assert.equal(M.totalCheck(170, 169, true, 'SI'), 'invalid');
  assert.equal(M.totalCheck(60, 59, true, 'SI'), 'bust');
  assert.equal(M.totalCheck(60, 61, true, 'SI'), 'bust');
  assert.equal(M.totalCheck(501, 181, true, 'SI'), 'invalid');
  assert.equal(M.totalCheck(501, -1, true, 'SI'), 'invalid');
  assert.equal(M.totalCheck(501, 140, true, 'SI'), 'ok');
});

test('double-in in total mode: 0 stays closed, any counting total is fine', () => {
  assert.equal(M.totalCheck(301, 0, false, 'DI'), 'ok');
  assert.equal(M.totalCheck(301, 57, false, 'DI'), 'ok');
});

test('finishing-dart buttons hide what cannot be right', () => {
  assert.deepEqual(M.finishDartChoices(110), [2, 3]);
  assert.deepEqual(M.finishDartChoices(40), [1, 2, 3]);
  assert.deepEqual(M.finishDartChoices(170), [3]);
  assert.deepEqual(M.finishDartChoices(169), []);
});

test('checkout hint: 170 is T20 T20 BULL, 2 is D1, 169 has none', () => {
  assert.deepEqual(M.checkoutHint(170), ['T20', 'T20', 'BULL']);
  assert.deepEqual(M.checkoutHint(2), ['D1']);
  assert.deepEqual(M.checkoutHint(40), ['D20']);
  assert.equal(M.checkoutHint(169), null);
});

const d = (s) => s === 'MISS' ? { n: 0, m: 0 } : s === 'BULL' ? { n: 25, m: 2 } : s === '25' ? { n: 25, m: 1 }
  : { m: { S: 1, D: 2, T: 3 }[s[0]], n: Number(s.slice(1)) };
const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k]]));

test('dart values: singles, doubles, trebles, 25, bull, miss', () => {
  assert.equal(M.dartValue(d('T20')), 60);
  assert.equal(M.dartValue(d('D16')), 32);
  assert.equal(M.dartValue(d('25')), 25);
  assert.equal(M.dartValue(d('BULL')), 50);
  assert.equal(M.dartValue(d('MISS')), 0);
  assert.equal(M.dartValue({ n: 25, m: 3 }), 0);
});

test('darts: ordinary turn, checkout on the 2nd dart, busts', () => {
  assert.deepEqual(pick(M.dartsTurn(501, ['T20', 'T20', 'T20'].map(d), true, 'SI'), ['scored', 'left', 'bust']), { scored: 180, left: 321, bust: false });
  const co = M.dartsTurn(40, ['S20', 'D10', 'T20'].map(d), true, 'SI');
  assert.equal(co.checkout, true); assert.equal(co.finishDart, 2); assert.equal(co.used, 2); assert.equal(co.left, 0);
  const zero = M.dartsTurn(40, ['S20', 'S20'].map(d), true, 'SI');
  assert.equal(zero.bust, true); assert.equal(zero.scored, 0); assert.equal(zero.left, 40); assert.equal(zero.used, 2);
  assert.equal(M.dartsTurn(40, ['S19', 'S20'].map(d), true, 'SI').bust, true);
  assert.equal(M.dartsTurn(50, ['BULL'].map(d), true, 'SI').finishDart, 1);
});

test('darts: double-in opens only on a double, and that double scores', () => {
  const r = M.dartsTurn(301, ['T20', 'D10', 'T20'].map(d), false, 'DI');
  assert.equal(r.opened, true); assert.equal(r.scored, 80);
  const closed = M.dartsTurn(301, ['T20', 'S5', 'MISS'].map(d), false, 'DI');
  assert.equal(closed.scored, 0); assert.equal(closed.opened, false); assert.equal(closed.bust, false);
});

test('darts: bad darts are refused, not thrown', () => {
  assert.equal(M.dartsTurn(501, [{ n: 25, m: 3 }], true, 'SI').code, 'bad_dart');
  assert.equal(M.dartsTurn(501, [{ n: 21, m: 1 }], true, 'SI').code, 'bad_dart');
  assert.equal(M.dartsTurn(501, ['S1', 'S1', 'S1', 'S1'].map(d), true, 'SI').ok, false);
});

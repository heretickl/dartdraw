const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../match-engine.js');

// Match engine: the stats of a match (3-dart average, first 9, marks per round), per player and per side.

const P1 = { a: ['p1'], b: ['p2'] };
const x01 = M.normalizeFormat({ game: 'x01', start: 501, bestOf: 3, bullFirst: 'first' });
const T = (n) => ({ n, m: 3 }), D = (n) => ({ n, m: 2 }), S = (n) => ({ n, m: 1 }), MISS = { n: 0, m: 0 };
function Log() {
  const evs = []; let tid = 0;
  const api = {
    evs,
    add(...list) { list.forEach((e) => evs.push(Object.assign({ seq: evs.length + 1, at: 'T' + evs.length, dev: 'tab1' }, e, e.type === 'turn' && !e.id ? { id: 't' + (++tid) } : {}))); return api; },
    total(leg, side, player, score, extra) { return api.add(Object.assign({ type: 'turn', leg, side, player, mode: 'total', score }, extra)); },
    darts(leg, side, player, darts) { return api.add({ type: 'turn', leg, side, player, mode: 'darts', darts }); }
  };
  return api;
}
// p1 throws `scores` (the last a checkout on finishDart), p2 throws 0 in between.
function stateOf(scores, finishDart) {
  const log = Log().add({ type: 'bull', leg: 0, winner: 'a' });
  scores.forEach((sc, i) => {
    log.total(0, 'a', 'p1', sc, i === scores.length - 1 ? { finishDart } : {});
    if (i < scores.length - 1) log.total(0, 'b', 'p2', 0);
  });
  return M.replay(x01, P1, log.evs);
}

test('3-dart average counts the finishing dart', () => {
  assert.equal(M.stats(stateOf([180, 180, 141], 3)).byPlayer.p1.avg3, 167.0);
  assert.equal(M.stats(stateOf([180, 180, 141], 1)).byPlayer.p1.avg3, 167.0, 'a finishing dart that cannot be right is not used: the turn counts 3 darts until it is given');
  const s = stateOf([100, 100, 100, 100, 101], 2);
  assert.equal(M.stats(s).byPlayer.p1.avg3, 107.4);   // 501 in 14 darts
  assert.equal(M.stats(s).byPlayer.p1.darts, 14);
  assert.equal(M.stats(s).byPlayer.p1.legsWon, 1);
});

test('first-9 uses the first three turns of each leg only', () => {
  const s = stateOf([60, 60, 60, 100, 100, 121], 3);
  const p1 = M.stats(s).byPlayer.p1;
  assert.equal(p1.first9, 60.0);
  assert.equal(p1.scored, 501);
});

test('bust turns count 3 darts and 0 points', () => {
  const log = Log().add({ type: 'bull', leg: 0, winner: 'a' });
  log.total(0, 'a', 'p1', 100); log.total(0, 'b', 'p2', 0, { bust: true }); log.total(0, 'a', 'p1', 50);
  const st = M.stats(M.replay(x01, P1, log.evs));
  assert.equal(st.byPlayer.p2.darts, 3); assert.equal(st.byPlayer.p2.scored, 0); assert.equal(st.byPlayer.p2.avg3, 0);
  assert.equal(st.byPlayer.p1.darts, 6); assert.equal(st.byPlayer.p1.avg3, 75.0);
});

test('a dart-by-dart bust counts three darts and scores nothing', () => {
  const log = Log().add({ type: 'bull', leg: 0, winner: 'a' });
  log.total(0, 'a', 'p1', 180); log.total(0, 'b', 'p2', 0); log.total(0, 'a', 'p1', 180); log.total(0, 'b', 'p2', 0);
  log.darts(0, 'a', 'p1', [T(20), T(20), MISS]);   // 141 left: 120 leaves 21, fine
  log.total(0, 'b', 'p2', 0);
  log.darts(0, 'a', 'p1', [S(20), S(1)]);           // 21 left: 20 leaves 1, a bust on dart 1
  const st = M.stats(M.replay(x01, P1, log.evs)).byPlayer.p1;
  assert.equal(st.darts, 12, 'a bust counts all three darts (spec 6.1)'); assert.equal(st.scored, 480);
  assert.equal(st.fromTotals, true);
});

test('doubles: per player and per side', () => {
  const P2 = { a: ['A1', 'A2'], b: ['B1', 'B2'] };
  const log = Log().add({ type: 'bull', leg: 0, winner: 'a' }, { type: 'order', leg: 0, side: 'a', first: 'A1' }, { type: 'order', leg: 0, side: 'b', first: 'B1' });
  log.total(0, 'a', 'A1', 100); log.total(0, 'b', 'B1', 60); log.total(0, 'a', 'A2', 40); log.total(0, 'b', 'B2', 80);
  const st = M.stats(M.replay(x01, P2, log.evs));
  assert.equal(st.byPlayer.A1.avg3, 100.0); assert.equal(st.byPlayer.A2.avg3, 40.0);
  assert.equal(st.bySide.a.avg3, 70.0); assert.equal(st.bySide.a.darts, 6);
  assert.equal(st.bySide.b.avg3, 70.0);
});

test('mpr and no NaN with no darts', () => {
  const cr = M.normalizeFormat({ game: 'cricket', bestOf: 1, bullFirst: 'first' });
  const log = Log().add({ type: 'bull', leg: 0, winner: 'a' });
  log.darts(0, 'a', 'p1', [T(20), D(19), S(3)]);
  const s = M.stats(M.replay(cr, P1, log.evs));
  assert.equal(s.byPlayer.p1.mpr, 5.00); assert.equal(s.byPlayer.p1.marks, 5); assert.equal(s.byPlayer.p1.cricketDarts, 3);
  assert.equal(s.byPlayer.p2.avg3, null); assert.equal(s.byPlayer.p2.mpr, null); assert.equal(s.byPlayer.p2.first9, null);
});

test('fromTotals is false for a player keyed only dart by dart', () => {
  const log = Log().add({ type: 'bull', leg: 0, winner: 'a' });
  log.darts(0, 'a', 'p1', [T(20), T(20), T(20)]);
  const st = M.stats(M.replay(x01, P1, log.evs)).byPlayer.p1;
  assert.equal(st.fromTotals, false); assert.equal(st.avg3, 180.0);
});

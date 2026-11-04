const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../match-engine.js');

// Match engine: the small items from the independent review, fixed 2026-11-03.

const fmt = M.normalizeFormat({ game: 'x01', start: 501, bestOf: 3, bullFirst: 'first' });
const P1 = { a: ['p1'], b: ['p2'] };
const T = (n) => ({ n, m: 3 }), S = (n) => ({ n, m: 1 }), MISS = { n: 0, m: 0 };
function Log() {
  const evs = []; let tid = 0;
  const api = {
    evs,
    add(...list) { list.forEach((e) => evs.push(Object.assign({ seq: evs.length + 1, at: 'T' + evs.length, dev: 'tab1' }, e, e.type === 'turn' && !e.id ? { id: 't' + (++tid) } : {}))); return api; },
    total(leg, side, score, extra) { return api.add(Object.assign({ type: 'turn', leg, side, player: side === 'a' ? 'p1' : 'p2', mode: 'total', score }, extra)); }
  };
  return api;
}

test('doubles: a side\'s first 9 is the side\'s first three turns, not each partner\'s first three', () => {
  const P2 = { a: ['A1', 'A2'], b: ['B1', 'B2'] };
  const log = Log().add({ type: 'bull', leg: 0, winner: 'a' }, { type: 'order', leg: 0, side: 'a', first: 'A1' }, { type: 'order', leg: 0, side: 'b', first: 'B1' });
  [['a', 'A1', 100], ['b', 'B1', 60], ['a', 'A2', 40], ['b', 'B2', 80], ['a', 'A1', 60], ['b', 'B1', 0], ['a', 'A2', 20], ['b', 'B2', 0]]
    .forEach(([side, player, score]) => log.add({ type: 'turn', leg: 0, side, player, mode: 'total', score }));
  const st = M.stats(M.replay(fmt, P2, log.evs));
  assert.equal(st.bySide.a.first9, 66.7, '100 + 40 + 60 in 9 darts');
  assert.equal(st.bySide.b.first9, 46.7, '60 + 80 + 0 in 9 darts');
  assert.equal(st.byPlayer.A1.first9, 80.0); assert.equal(st.byPlayer.A2.first9, 30.0);
});

test('restoring an older turn is flagged as an old edit; restoring the last turn is not', () => {
  const log = Log().add({ type: 'bull', leg: 0, winner: 'a' });
  log.total(0, 'a', 180); log.total(0, 'b', 0); log.total(0, 'a', 100);
  log.add({ type: 'edit', turnId: 't3', score: 60 }, { type: 'restore', turnId: 't3', version: 0 });
  assert.equal(M.replay(fmt, P1, log.evs).flags.length, 0, 'still the last turn: no flag');
  log.total(0, 'b', 60);
  log.add({ type: 'restore', turnId: 't3', version: 1 });
  const s = M.replay(fmt, P1, log.evs);
  assert.deepEqual(s.flags.filter((f) => f.code === 'old_edit').map((f) => f.turnId), ['t3']);
  assert.deepEqual(s.next.left, { a: 261, b: 441 });
});

test('cricket: a turn\'s score is the points that turn made, not the running total', () => {
  const cr = M.normalizeFormat({ game: 'cricket', bestOf: 1, bullFirst: 'first' });
  const log = Log().add({ type: 'bull', leg: 0, winner: 'a' });
  log.add({ type: 'turn', leg: 0, side: 'a', player: 'p1', mode: 'darts', darts: [T(20), T(20), T(20)] });
  log.add({ type: 'turn', leg: 0, side: 'b', player: 'p2', mode: 'darts', darts: [MISS, MISS, MISS] });
  log.add({ type: 'turn', leg: 0, side: 'a', player: 'p1', mode: 'darts', darts: [S(20), MISS, MISS] });
  const turns = M.replay(cr, P1, log.evs).legs[0].turns;
  assert.deepEqual(turns.map((t) => t.scored), [120, 0, 20]);
});

test('a turn with a missing or impossible leg number is refused and flagged, never silently lost', () => {
  const log = Log().add({ type: 'bull', leg: 0, winner: 'a' });
  log.total('0', 'a', 100);
  log.total(undefined, 'b', 60); log.total('x', 'b', 60); log.total(-1, 'b', 60); log.total(1.5, 'b', 60);
  const s = M.replay(fmt, P1, log.evs);
  assert.deepEqual(s.next.left, { a: 401, b: 501 }, 'a leg number sent as text still counts');
  assert.deepEqual(s.ignored, [3, 4, 5, 6]);
  assert.deepEqual(s.flags.filter((f) => f.code === 'bad_leg').map((f) => f.turnId), ['t2', 't3', 't4', 't5']);
  assert.equal(s.legs[0].turns.length, 1);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../match-engine.js');

// Match engine: standard cricket with points (15-20 and the bull).

const S = (n) => ({ n, m: 1 }), D = (n) => ({ n, m: 2 }), T = (n) => ({ n, m: 3 }), MISS = { n: 0, m: 0 };
// A board where `side` has closed every number except `open`, with the given points.
function closedExcept(side, open, points) {
  const b = M.cricketStart();
  [15, 16, 17, 18, 19, 20, 25].forEach((n) => { if (n !== open) b.marks[side][n] = 3; });
  b.points = { a: points.a, b: points.b };
  return b;
}

test('marks close a number at 3; extra marks score while the opponent is open', () => {
  let b = M.cricketStart();
  b = M.cricketTurn(b, 'a', [T(20), T(20), MISS]).board;
  assert.equal(b.marks.a[20], 3); assert.equal(b.points.a, 60);
  b = M.cricketTurn(b, 'b', [T(20), MISS, MISS]).board;
  b = M.cricketTurn(b, 'a', [T(20), MISS, MISS]).board;
  assert.equal(b.points.a, 60, 'no points once both have closed 20');
});

test('bull is 25 per mark, double bull is 2 marks; numbers below 15 are misses', () => {
  const r = M.cricketTurn(M.cricketStart(), 'a', [{ n: 25, m: 2 }, { n: 25, m: 2 }, S(14)]);
  assert.equal(r.board.marks.a[25], 3); assert.equal(r.board.points.a, 25);
});

test('the board passed in is never changed', () => {
  const b = M.cricketStart();
  M.cricketTurn(b, 'a', [T(20)]);
  assert.equal(b.marks.a[20], 0);
});

test('win needs every number closed and points not behind; finishDart is where it happened', () => {
  const r = M.cricketTurn(closedExcept('a', 15, { a: 0, b: 0 }), 'a', [S(15), S(15), S(15)]);
  assert.equal(r.won, true); assert.equal(r.finishDart, 3);
  assert.equal(M.cricketTurn(closedExcept('a', 15, { a: 0, b: 40 }), 'a', [T(15)]).won, false);
  const early = M.cricketTurn(closedExcept('a', 15, { a: 0, b: 0 }), 'a', [T(15), T(20), T(20)]);
  assert.equal(early.finishDart, 1); assert.equal(early.board.points.a, 0, 'darts after the win are ignored');
});

test('bad darts are refused', () => {
  assert.equal(M.cricketTurn(M.cricketStart(), 'a', [{ n: 25, m: 3 }]).code, 'bad_dart');
  assert.equal(M.cricketTurn(M.cricketStart(), 'a', [S(1), S(1), S(1), S(1)]).ok, false);
});

test('marks per round counts thrown marks on 15-20 and the bull', () => {
  assert.equal(M.cricketTurnMarks([T(20), D(19), S(3)]), 5);
  assert.equal(M.cricketTurnMarks([{ n: 25, m: 2 }, MISS]), 2);
});

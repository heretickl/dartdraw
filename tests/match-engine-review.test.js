const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../match-engine.js');

// Match engine: fixes from the independent review (2026-11-03).

const fmt = M.normalizeFormat({ game: 'x01', start: 501, bestOf: 3, bullFirst: 'first' });
const P1 = { a: ['p1'], b: ['p2'] };
const T = (n) => ({ n, m: 3 }), S = (n) => ({ n, m: 1 }), MISS = { n: 0, m: 0 };
function Log() {
  const evs = []; let tid = 0;
  const api = {
    evs,
    add(...list) { list.forEach((e) => evs.push(Object.assign({ seq: evs.length + 1, at: 'T' + evs.length, dev: 'tab1' }, e, e.type === 'turn' && !e.id ? { id: 't' + (++tid) } : {}))); return api; },
    total(leg, side, score, extra) { return api.add(Object.assign({ type: 'turn', leg, side, player: side === 'a' ? 'p1' : 'p2', mode: 'total', score }, extra)); },
    darts(leg, side, darts) { return api.add({ type: 'turn', leg, side, player: side === 'a' ? 'p1' : 'p2', mode: 'darts', darts }); }
  };
  return api;
}
function wonMatch() {
  const log = Log().add({ type: 'bull', leg: 0, winner: 'a' });
  [[0, 'a', 180], [0, 'b', 0], [0, 'a', 180], [0, 'b', 0], [0, 'a', 141, 3], [1, 'b', 0], [1, 'a', 180], [1, 'b', 0], [1, 'a', 180], [1, 'b', 0], [1, 'a', 141, 3]]
    .forEach(([l, s, sc, fd]) => log.total(l, s, sc, fd ? { finishDart: fd } : {}));
  return log;
}

test('a confirmed match cannot be changed by a later edit, undo or restore: they are refused and flagged', () => {
  const log = wonMatch().add({ type: 'confirm' });
  log.add({ type: 'edit', turnId: 't3', score: 100 }, { type: 'undo', turnId: 't11' }, { type: 'restore', turnId: 't1', version: 0 });
  const s = M.replay(fmt, P1, log.evs);
  assert.equal(s.winner, 'a'); assert.equal(s.confirmed, true); assert.equal(s.next.ask, 'done');
  assert.deepEqual(s.ignored, [14, 15, 16]);
  assert.equal(s.flags.filter((f) => f.code === 'after_confirm').length, 3);
  assert.equal(s.frozenAfter, 13, 'the confirm is event 13');
  assert.equal(M.turnHistory(log.evs, 't3', s.frozenAfter).length, 1, 'the refused edit is not a version');
});

test('a dart-by-dart bust counts three darts thrown', () => {
  const log = Log().add({ type: 'bull', leg: 0, winner: 'a' });
  log.total(0, 'a', 180); log.total(0, 'b', 0); log.total(0, 'a', 200 - 20);
  log.total(0, 'b', 0); log.darts(0, 'a', [T(20), T(20), S(20)]);   // 141 left: 120 leaves 21... then S20 leaves 1: bust on dart 3
  const st = M.replay(fmt, P1, log.evs);
  assert.equal(st.legs[0].turns[4].bust, true); assert.equal(st.legs[0].turns[4].dartsUsed, 3);
  const log2 = Log().add({ type: 'bull', leg: 0, winner: 'a' });
  log2.total(0, 'a', 180); log2.total(0, 'b', 0); log2.total(0, 'a', 180); log2.total(0, 'b', 0); log2.total(0, 'a', 20);
  log2.total(0, 'b', 0); log2.darts(0, 'a', [T(20), T(20), S(1)]);   // 121 left: T20 leaves 61, T20 leaves 1: bust on dart 2
  const st2 = M.replay(fmt, P1, log2.evs);
  assert.equal(st2.legs[0].turns[6].dartsUsed, 3);
  assert.equal(M.stats(st2).byPlayer.p1.darts, 12);
});

test('a bust keyed with no score is a bust worth 0, not a lost turn', () => {
  const log = Log().add({ type: 'bull', leg: 0, winner: 'a' });
  log.add({ type: 'turn', id: 'b1', leg: 0, side: 'a', player: 'p1', mode: 'total', bust: true });
  const s = M.replay(fmt, P1, log.evs);
  assert.equal(s.ignored.length, 0); assert.equal(s.legs[0].turns[0].bust, true); assert.equal(s.next.side, 'b');
});

test('bad input never throws', () => {
  assert.doesNotThrow(() => M.replay({}, P1, [null, 7, 'x', { type: 'turn' }]));
  assert.doesNotThrow(() => M.replay({}, P1, 'x'));
  assert.doesNotThrow(() => M.replay({}, { a: 5 }, []));
  assert.doesNotThrow(() => M.replay(null, null, null));
  assert.doesNotThrow(() => M.stats(null));
  assert.doesNotThrow(() => M.turnHistory(null, 't1'));
  assert.equal(M.replay({}, P1, 'x').next.ask, 'bullFirst');
});

test('an edit with a score turns a dart-by-dart turn into a total; an edit with darts turns it back', () => {
  const log = Log().add({ type: 'bull', leg: 0, winner: 'a' });
  log.darts(0, 'a', [T(20), T(20), T(20)]);
  log.add({ type: 'edit', turnId: 't1', score: 60 });
  let s = M.replay(fmt, P1, log.evs);
  assert.equal(s.legs[0].turns[0].scored, 60); assert.equal(s.legs[0].turns[0].mode, 'total');
  log.add({ type: 'edit', turnId: 't1', darts: [T(20), S(20), MISS] });
  s = M.replay(fmt, P1, log.evs);
  assert.equal(s.legs[0].turns[0].scored, 80); assert.equal(s.legs[0].turns[0].mode, 'darts');
});

test('cricket marks stop at the winning dart', () => {
  const cr = M.normalizeFormat({ game: 'cricket', bestOf: 1, bullFirst: 'first' });
  const log = Log().add({ type: 'bull', leg: 0, winner: 'a' });
  log.darts(0, 'a', [T(20), T(19), T(18)]); log.darts(0, 'b', [MISS, MISS, MISS]);
  log.darts(0, 'a', [T(17), T(16), T(15)]); log.darts(0, 'b', [MISS, MISS, MISS]);
  log.darts(0, 'a', [{ n: 25, m: 2 }, S(25), T(20)]);
  const s = M.replay(cr, P1, log.evs);
  assert.equal(s.legs[0].winner, 'a'); assert.equal(s.legs[0].turns[4].marks, 3, 'the T20 after the win does not count');
});

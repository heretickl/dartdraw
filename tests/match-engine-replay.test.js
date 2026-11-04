const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../match-engine.js');

// Match engine: a whole match replayed from its events (bull, starters, throwing order, legs, the match).

const F = (o) => M.normalizeFormat(Object.assign({ game: 'x01', start: 501, bestOf: 3, bullFirst: 'coin', decider: 'alternate' }, o));
const P1 = { a: ['p1'], b: ['p2'] };
const other = (s) => (s === 'a' ? 'b' : 'a');
const T = (n) => ({ n, m: 3 }), D = (n) => ({ n, m: 2 }), S = (n) => ({ n, m: 1 }), MISS = { n: 0, m: 0 };

// Events get seq, at and dev; turns get ids t1, t2, ...
function Log() {
  const evs = []; let tid = 0;
  const api = {
    evs,
    add(...list) { list.forEach((e) => evs.push(Object.assign({ seq: evs.length + 1, at: '2026-11-03T10:00:' + String(evs.length).padStart(2, '0') + 'Z', dev: 'tab1' }, e, e.type === 'turn' && !e.id ? { id: 't' + (++tid) } : {}))); return api; },
    total(leg, side, player, score, extra) { return api.add(Object.assign({ type: 'turn', leg, side, player, mode: 'total', score }, extra)); },
    darts(leg, side, player, darts) { return api.add({ type: 'turn', leg, side, player, mode: 'darts', darts }); },
    lastId() { return 't' + tid; }
  };
  return api;
}
// One 501 leg won by `winner` in 9 darts (180, 180, 141 on the 3rd dart); the loser scores 0 in between.
function x01Leg(log, leg, starter, winner, players) {
  players = players || { a: 'p1', b: 'p2' };
  const order = [starter, other(starter)];
  const wins = [180, 180, 141];
  let w = 0;
  for (let k = 0; w < 3; k++) {
    const side = order[k % 2];
    if (side === winner) { log.total(leg, side, players[side], wins[w], w === 2 ? { finishDart: 3 } : {}); w++; }
    else log.total(leg, side, players[side], 0);
  }
}
// One cricket leg won by `winner`: T20 T19 T18, T17 T16 T15, D-bull S-bull (won on the 2nd dart); the loser misses.
function cricketLeg(log, leg, starter, winner) {
  const wins = [[T(20), T(19), T(18)], [T(17), T(16), T(15)], [D(25), S(25), MISS]];
  const order = [starter, other(starter)];
  let w = 0;
  for (let k = 0; w < 3; k++) {
    const side = order[k % 2];
    log.darts(leg, side, side === 'a' ? 'p1' : 'p2', side === winner ? wins[w++] : [MISS, MISS, MISS]);
  }
}

test('coin, then bull: the bull winner starts leg 1 and starts alternate', () => {
  assert.equal(M.replay(F(), P1, []).next.ask, 'bullFirst');
  const log = Log().add({ type: 'bullFirst', side: 'b' });
  let s = M.replay(F(), P1, log.evs);
  assert.equal(s.next.ask, 'bull'); assert.equal(s.next.side, 'b');
  log.add({ type: 'bull', leg: 0, winner: 'b' });
  s = M.replay(F(), P1, log.evs);
  assert.equal(s.next.ask, 'turn'); assert.equal(s.next.side, 'b'); assert.equal(s.next.player, 'p2');
  assert.equal(s.openingBullLoser, 'a');
  assert.deepEqual(s.next.left, { a: 501, b: 501 });
});

test('first-named throws first: no bullFirst question, side a throws at the bull first', () => {
  const s = M.replay(F({ bullFirst: 'first' }), P1, []);
  assert.equal(s.next.ask, 'bull'); assert.equal(s.next.side, 'a');
});

test('a total over what is left is a bust; an impossible total is ignored', () => {
  const log = Log().add({ type: 'bull', leg: 0, winner: 'a' });
  log.total(0, 'a', 'p1', 169);
  let s = M.replay(F({ bullFirst: 'first' }), P1, log.evs);
  assert.equal(s.ignored.length, 1); assert.equal(s.next.side, 'a', 'still a to throw');
  log.total(0, 'a', 'p1', 100); log.total(0, 'b', 'p2', 60, { bust: true });
  s = M.replay(F({ bullFirst: 'first' }), P1, log.evs);
  assert.deepEqual(s.next.left, { a: 401, b: 501 });
  assert.equal(s.legs[0].turns[1].bust, true);
});

test('a checkout keyed as a total asks for the finishing dart, then the next leg starts with the other side', () => {
  const log = Log().add({ type: 'bull', leg: 0, winner: 'a' });
  log.total(0, 'a', 'p1', 180); log.total(0, 'b', 'p2', 0); log.total(0, 'a', 'p1', 180); log.total(0, 'b', 'p2', 0); log.total(0, 'a', 'p1', 141);
  let s = M.replay(F({ bullFirst: 'first' }), P1, log.evs);
  assert.equal(s.next.ask, 'finishDart'); assert.deepEqual(s.next.finishDartChoices, [3]);
  log.add({ type: 'edit', turnId: log.lastId(), finishDart: 3 });
  s = M.replay(F({ bullFirst: 'first' }), P1, log.evs);
  assert.equal(s.legs[0].winner, 'a'); assert.equal(s.legs[0].finishDart, 3);
  assert.equal(s.next.leg, 1); assert.equal(s.next.side, 'b');
  assert.deepEqual(s.legsWon, { a: 1, b: 0 });
});

test('choice decider: the opening bull loser throws first, the winner picks start or game', () => {
  const f = F({ bullFirst: 'first', decider: 'choice', bestOf: 3 });
  const log = Log().add({ type: 'bull', leg: 0, winner: 'a' });
  x01Leg(log, 0, 'a', 'a'); x01Leg(log, 1, 'b', 'b');
  let s = M.replay(f, P1, log.evs);
  assert.deepEqual(s.legsWon, { a: 1, b: 1 });
  assert.equal(s.next.ask, 'bull'); assert.equal(s.next.side, 'b', 'b lost the opening bull');
  log.add({ type: 'bull', leg: 2, winner: 'b' });
  s = M.replay(f, P1, log.evs);
  assert.equal(s.next.ask, 'choice'); assert.equal(s.next.choiceBy, 'b');
  log.add({ type: 'choice', leg: 2, pick: 'game', game: 'cricket' });
  s = M.replay(f, P1, log.evs);
  assert.equal(s.legs[2].game, 'cricket'); assert.equal(s.next.side, 'a');
  assert.deepEqual(s.legs[2].choice, { by: 'b', pick: 'game', game: 'cricket' });
});

test('choice decider: picking start makes the bull winner throw first, in the game the other side chose', () => {
  // A best-of-1 match: the opening leg is itself the deciding leg, so the opening bull is the Choice bull.
  const f = F({ bullFirst: 'first', decider: 'choice', bestOf: 1, start: 701 });
  const log = Log().add({ type: 'bull', leg: 0, winner: 'a' });
  let s = M.replay(f, P1, log.evs);
  assert.equal(s.next.ask, 'choice'); assert.equal(s.next.choiceBy, 'a');
  log.add({ type: 'choice', leg: 0, pick: 'start', game: 'x01' });
  s = M.replay(f, P1, log.evs);
  assert.equal(s.next.ask, 'turn'); assert.equal(s.next.side, 'a');
  assert.equal(s.legs[0].start, 701, 'the Choice x01 is the match x01');
});

test('rotation with 2 v 2, 3 v 3 and 1 v 1', () => {
  function throwers(players, firsts, n) {
    const f = F({ bullFirst: 'first' });
    const log = Log().add({ type: 'bull', leg: 0, winner: 'a' });
    Object.keys(firsts).forEach((side) => log.add({ type: 'order', leg: 0, side, first: firsts[side] }));
    const out = [];
    for (let i = 0; i < n; i++) {
      const s = M.replay(f, players, log.evs);
      out.push(s.next.player);
      log.total(0, s.next.side, s.next.player, 20);
    }
    return out;
  }
  assert.deepEqual(throwers({ a: ['A1', 'A2'], b: ['B1', 'B2'] }, { a: 'A2', b: 'B1' }, 6), ['A2', 'B1', 'A1', 'B2', 'A2', 'B1']);
  assert.deepEqual(throwers({ a: ['A1', 'A2', 'A3'], b: ['B1', 'B2', 'B3'] }, { a: 'A1', b: 'B1' }, 6), ['A1', 'B1', 'A2', 'B2', 'A3', 'B3']);
  assert.deepEqual(throwers(P1, {}, 4), ['p1', 'p2', 'p1', 'p2']);
});

test('doubles: the order is asked per side; orderAsk "leg" asks again every leg, "match" only once', () => {
  const P2 = { a: ['A1', 'A2'], b: ['B1', 'B2'] };
  const pl = { a: 'A1', b: 'B1' };
  for (const orderAsk of ['match', 'leg']) {
    const f = F({ bullFirst: 'first', orderAsk });
    const log = Log().add({ type: 'bull', leg: 0, winner: 'a' });
    let s = M.replay(f, P2, log.evs);
    assert.equal(s.next.ask, 'order'); assert.equal(s.next.orderSide, 'a');
    log.add({ type: 'order', leg: 0, side: 'a', first: 'A1' });
    assert.equal(M.replay(f, P2, log.evs).next.orderSide, 'b');
    log.add({ type: 'order', leg: 0, side: 'b', first: 'B1' });
    s = M.replay(f, P2, log.evs);
    assert.equal(s.next.ask, 'turn'); assert.equal(s.next.player, pl.a);
    const fresh = Log().add({ type: 'bull', leg: 0, winner: 'a' }, { type: 'order', leg: 0, side: 'a', first: 'A1' }, { type: 'order', leg: 0, side: 'b', first: 'B1' });
    const seq = [['a', 'A1', 180], ['b', 'B1', 0], ['a', 'A2', 180], ['b', 'B2', 0], ['a', 'A1', 141, 3]];
    seq.forEach(([side, p, sc, fd]) => fresh.total(0, side, p, sc, fd ? { finishDart: fd } : {}));
    s = M.replay(f, P2, fresh.evs);
    assert.equal(s.legs[0].winner, 'a');
    assert.equal(s.next.ask, orderAsk === 'leg' ? 'order' : 'turn', orderAsk);
  }
});

test('mixed match: leg games follow the pattern', () => {
  const f = F({ game: 'mixed', pattern: ['x01', 'cricket'], bullFirst: 'first', bestOf: 5 });
  const log = Log().add({ type: 'bull', leg: 0, winner: 'a' });
  x01Leg(log, 0, 'a', 'a');
  let s = M.replay(f, P1, log.evs);
  assert.equal(s.legs[1].game, 'cricket'); assert.equal(s.next.ask, 'turn'); assert.ok(s.next.board);
  cricketLeg(log, 1, 'b', 'b');
  s = M.replay(f, P1, log.evs);
  assert.equal(s.legs[1].winner, 'b'); assert.equal(s.legs[1].finishDart, 2);
  assert.equal(s.legs[2].game, 'x01');
});

test('match won → confirm → done', () => {
  const f = F({ bullFirst: 'first', bestOf: 3 });
  const log = Log().add({ type: 'bull', leg: 0, winner: 'a' });
  x01Leg(log, 0, 'a', 'a'); x01Leg(log, 1, 'b', 'a');
  let s = M.replay(f, P1, log.evs);
  assert.equal(s.winner, 'a'); assert.equal(s.next.ask, 'confirm'); assert.equal(s.confirmed, false);
  log.add({ type: 'confirm' });
  s = M.replay(f, P1, log.evs);
  assert.equal(s.confirmed, true); assert.equal(s.next.ask, 'done');
});

test('replay never changes the events it is given', () => {
  const log = Log().add({ type: 'bull', leg: 0, winner: 'a' });
  x01Leg(log, 0, 'a', 'a');
  const before = JSON.stringify(log.evs);
  M.replay(F({ bullFirst: 'first' }), P1, log.evs);
  assert.equal(JSON.stringify(log.evs), before);
});

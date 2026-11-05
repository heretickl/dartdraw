const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../match-engine.js');
const PS = require('../player-stats.js');

// player-stats.js: one player's numbers from one game (gameStats) and the sums over many (addUp). The events are built
// by hand in the engine's own shape: a bull for leg 0, then turns ('total' with a score, or 'darts' dart by dart).
const P1 = { a: ['p1'], b: ['p2'] };
const T = (n) => ({ n, m: 3 }), D = (n) => ({ n, m: 2 }), S = (n) => ({ n, m: 1 }), MISS = { n: 0, m: 0 };
function Log() {
  const evs = []; let tid = 0;
  const api = {
    evs,
    add(...list) { list.forEach((e) => evs.push(Object.assign({ seq: evs.length + 1, at: 'T' + evs.length, dev: 'tab1' }, e, e.type === 'turn' && !e.id ? { id: 't' + (++tid) } : {}))); return api; },
    total(leg, side, player, score, extra) { return api.add(Object.assign({ type: 'turn', leg, side, player, mode: 'total', score }, extra)); },
    darts(leg, side, player, darts) { return api.add({ type: 'turn', leg, side, player, mode: 'darts', darts }); },
  };
  return api;
}
const x01b1 = { game: 'x01', start: 501, bestOf: 1, bullFirst: 'first' };
const crk = { game: 'cricket', bestOf: 1, bullFirst: 'first' };

// The brief's "three 180s then a 141 finish" cannot happen on 501 (540 > 501): ruled as 180, 180, 0, 141 (ledger).
test('180, 180, 0 then a 141 finish on the 3rd dart: darts 12, points 501, avg3 125.25', () => {
  const log = Log().add({ type: 'bull', leg: 0, winner: 'a' });
  log.total(0, 'a', 'p1', 180); log.total(0, 'b', 'p2', 0);
  log.total(0, 'a', 'p1', 180); log.total(0, 'b', 'p2', 0);
  log.total(0, 'a', 'p1', 0); log.total(0, 'b', 'p2', 0);
  log.total(0, 'a', 'p1', 141, { finishDart: 3 });
  const g = PS.gameStats(x01b1, P1, log.evs, 'p1');
  assert.equal(g.won, true);
  assert.equal(g.x01.darts, 12);
  assert.equal(g.x01.points, 501);
  assert.equal(g.x01.n180, 2);
  assert.equal(g.x01.n140, 1);            // the checkout turn counts toward 140+ (ledger ruling)
  assert.equal(g.x01.checkouts, 1);
  assert.equal(g.x01.highFinish, 141);
  assert.equal(g.x01.checkoutTurns, 2);   // the 0 and the 141 both began on 141
  assert.equal(g.x01.bestLegDarts, 12);
  assert.equal(g.x01.legsWon, 1); assert.equal(g.x01.legsPlayed, 1);
  assert.equal(PS.addUp([g]).x01.avg3, 125.25);
});

test('three real 180s on 701 then a 161 finish dart by dart: 12 darts', () => {
  const log = Log().add({ type: 'bull', leg: 0, winner: 'a' });
  for (let i = 0; i < 3; i++) { log.darts(0, 'a', 'p1', [T(20), T(20), T(20)]); log.total(0, 'b', 'p2', 0); }
  log.darts(0, 'a', 'p1', [T(20), T(17), D(25)]);
  const g = PS.gameStats({ game: 'x01', start: 701, bestOf: 1, bullFirst: 'first' }, P1, log.evs, 'p1');
  assert.equal(g.x01.n180, 3); assert.equal(g.x01.n140, 1);
  assert.equal(g.x01.darts, 12); assert.equal(g.x01.highFinish, 161); assert.equal(g.x01.checkoutTurns, 1);
});

test('a bust counts 3 darts and 0 points', () => {
  const log = Log().add({ type: 'bull', leg: 0, winner: 'a' });
  log.total(0, 'a', 'p1', 180); log.total(0, 'b', 'p2', 0, { bust: true });
  log.total(0, 'a', 'p1', 180); log.darts(0, 'b', 'p2', [T(20), T(20), S(1)]);   // p2 121
  log.total(0, 'a', 'p1', 81); log.darts(0, 'b', 'p2', [T(20), T(20), T(20)]);   // 180
  log.total(0, 'a', 'p1', 0); log.darts(0, 'b', 'p2', [T(20), T(20), T(20)]);    // 180, 20 left
  log.total(0, 'a', 'p1', 0); log.darts(0, 'b', 'p2', [S(19), MISS, MISS]);      // 19 leaves 1: bust
  const g = PS.gameStats(x01b1, P1, log.evs, 'p2');
  assert.equal(g.x01.darts, 15);                 // 5 turns, two of them busts
  assert.equal(g.x01.points, 121 + 180 + 180);   // the busts score nothing
  assert.equal(g.x01.n180, 2); assert.equal(g.x01.n100, 1);
  assert.equal(g.won, false); assert.equal(g.x01.legsWon, 0); assert.equal(g.x01.bestLegDarts, null);
});

test('first 9 uses only the first three turns of each leg', () => {
  const log = Log().add({ type: 'bull', leg: 0, winner: 'a' });
  [60, 60, 60, 100, 100].forEach((s) => { log.total(0, 'a', 'p1', s); log.total(0, 'b', 'p2', 0); });
  log.total(0, 'a', 'p1', 121, { finishDart: 3 });
  [100, 100, 100, 0].forEach((s) => { log.total(1, 'b', 'p2', 0); log.total(1, 'a', 'p1', s); });
  const g = PS.gameStats({ game: 'x01', start: 501, bestOf: 3, bullFirst: 'first' }, P1, log.evs, 'p1');
  assert.equal(g.x01.f9darts, 18);
  assert.equal(g.x01.f9points, 180 + 300);
  assert.equal(PS.addUp([g]).x01.first9, 80);
  assert.equal(g.x01.legsPlayed, 2); assert.equal(g.x01.legsWon, 1);
});

test('checkoutTurns counts turns begun on 170 or below with a possible finish, not 169/168/166/165/163/162/159', () => {
  [170, 169, 168, 167, 166, 165, 164, 163, 162, 161, 160, 159, 158, 2].forEach((left) => {
    const log = Log().add({ type: 'bull', leg: 0, winner: 'a' });
    let rest = 501 - left;
    while (rest > 0) {
      const s = Math.min(180, rest);
      const sc = [163, 166, 169, 172, 173, 175, 176, 178, 179].includes(s) ? s - 3 : s;   // scores no 3 darts can make
      log.total(0, 'a', 'p1', sc); rest -= sc; log.total(0, 'b', 'p2', 0);
    }
    const base = PS.gameStats(x01b1, P1, log.evs, 'p1').x01.checkoutTurns;
    log.total(0, 'a', 'p1', 0);
    const g = PS.gameStats(x01b1, P1, log.evs, 'p1');
    const want = [169, 168, 166, 165, 163, 162, 159].includes(left) ? 0 : 1;
    assert.equal(g.x01.checkoutTurns - base, want, 'from ' + left);
  });
});

test('a turn begun on 171+ is no checkout chance; a bust from 40 is one', () => {
  const log = Log().add({ type: 'bull', leg: 0, winner: 'a' });
  log.total(0, 'a', 'p1', 180); log.total(0, 'b', 'p2', 0);
  log.total(0, 'a', 'p1', 140); log.total(0, 'b', 'p2', 0);   // 181 left
  log.total(0, 'a', 'p1', 141); log.total(0, 'b', 'p2', 0);   // 40 left
  log.total(0, 'a', 'p1', 0, { bust: true }); log.total(0, 'b', 'p2', 0);
  log.total(0, 'a', 'p1', 40, { finishDart: 1 });
  const g = PS.gameStats(x01b1, P1, log.evs, 'p1');
  assert.equal(g.x01.checkoutTurns, 2);
  assert.equal(g.x01.checkouts, 1);
  assert.equal(PS.addUp([g]).x01.checkoutPct, 50);
  assert.equal(g.x01.darts, 13);   // 4 full turns and 1 dart
});

test('white horse needs three different open numbers', () => {
  const log = Log().add({ type: 'bull', leg: 0, winner: 'a' });
  log.darts(0, 'a', 'p1', [T(20), T(19), T(18)]);   // white horse
  log.darts(0, 'b', 'p2', [T(20), T(19), T(18)]);   // white horse
  log.darts(0, 'a', 'p1', [T(20), T(17), T(16)]);   // 20 already closed by p1: no
  log.darts(0, 'b', 'p2', [T(17), T(17), T(16)]);   // the same number twice: no
  log.darts(0, 'a', 'p1', [T(15), T(15), MISS]);    // two darts: no
  log.darts(0, 'b', 'p2', [T(15), D(20), T(16)]);   // a double in it: no
  const g1 = PS.gameStats(crk, P1, log.evs, 'p1'), g2 = PS.gameStats(crk, P1, log.evs, 'p2');
  assert.equal(g1.cricket.whiteHorses, 1);
  assert.equal(g2.cricket.whiteHorses, 1);
  assert.equal(g1.cricket.rounds9, 2); assert.equal(g1.cricket.rounds5, 3);
  assert.equal(g1.cricket.marks, 9 + 9 + 6); assert.equal(g1.cricket.darts, 9);
});

test('hat trick is three darts on 25 (single or double bull)', () => {
  const log = Log().add({ type: 'bull', leg: 0, winner: 'a' });
  log.darts(0, 'a', 'p1', [S(25), D(25), S(25)]);   // hat trick
  log.darts(0, 'b', 'p2', [D(25), D(25), MISS]);    // two bulls: no
  log.darts(0, 'a', 'p1', [D(25), D(25), T(20)]);   // two bulls: no
  const g1 = PS.gameStats(crk, P1, log.evs, 'p1'), g2 = PS.gameStats(crk, P1, log.evs, 'p2');
  assert.equal(g1.cricket.hatTricks, 1); assert.equal(g1.cricket.bulls, 5);
  assert.equal(g2.cricket.hatTricks, 0); assert.equal(g2.cricket.bulls, 2);
});

test('choice game splits legs by game and counts the win once', () => {
  const close = [[T(20), T(19), T(18)], [T(17), T(16), T(15)], [D(25), S(25), MISS]];
  // mixed best of 3: leg 0 x01, leg 1 cricket, both won by p1
  const fmtM = { game: 'mixed', start: 301, inRule: 'SI', bestOf: 3, bullFirst: 'first', pattern: ['x01', 'cricket'] };
  const lm = Log().add({ type: 'bull', leg: 0, winner: 'a' });
  lm.total(0, 'a', 'p1', 180); lm.total(0, 'b', 'p2', 60); lm.total(0, 'a', 'p1', 121, { finishDart: 3 });
  close.forEach((d) => { lm.darts(1, 'b', 'p2', [MISS, MISS, MISS]); lm.darts(1, 'a', 'p1', d); });
  // 501 best of 3 with a Choice decider: one 01 leg each, then cricket picked for the decider
  const fmtC = { game: 'x01', start: 501, bestOf: 3, bullFirst: 'first', decider: 'choice' };
  const lc = Log().add({ type: 'bull', leg: 0, winner: 'a' });
  [180, 180].forEach((s) => { lc.total(0, 'a', 'p1', s); lc.total(0, 'b', 'p2', 0); });
  lc.total(0, 'a', 'p1', 141, { finishDart: 3 });
  [180, 180].forEach((s) => { lc.total(1, 'b', 'p2', s); lc.total(1, 'a', 'p1', 0); });
  lc.total(1, 'b', 'p2', 141, { finishDart: 3 });
  lc.add({ type: 'bull', leg: 2, winner: 'a' }, { type: 'choice', leg: 2, pick: 'start', game: 'cricket' });
  close.forEach((d) => { lc.darts(2, 'a', 'p1', d); if (d !== close[2]) lc.darts(2, 'b', 'p2', [MISS, MISS, MISS]); });

  [[fmtM, lm], [fmtC, lc]].forEach(([f, l]) => {
    assert.equal(M.replay(f, P1, l.evs).winner, 'a');
    const g = PS.gameStats(f, P1, l.evs, 'p1');
    assert.equal(g.won, true);
    assert.equal(g.cricket.legsPlayed, 1); assert.equal(g.cricket.legsWon, 1);
    assert.equal(g.cricket.bestLegDarts, 8);
    const t = PS.addUp([g, PS.gameStats(f, P1, l.evs, 'p2')]);
    assert.equal(t.played, 2); assert.equal(t.won, 1); assert.equal(t.wonPct, 50);   // one win per game, not per leg
  });
  const gC = PS.gameStats(fmtC, P1, lc.evs, 'p1');
  assert.equal(gC.x01.legsPlayed, 2); assert.equal(gC.x01.legsWon, 1); assert.equal(gC.x01.darts, 9 + 6);
  const gM = PS.gameStats(fmtM, P1, lm.evs, 'p1');
  assert.equal(gM.x01.legsPlayed, 1); assert.equal(gM.x01.darts, 6); assert.equal(gM.x01.points, 301);
  const t = PS.addUp([gM]);
  assert.equal(t.cricket.mpr, 21 / 8 * 3);
  assert.equal(t.x01.avg3, 301 / 6 * 3);
});

test('addUp gives null averages with no darts (no NaN)', () => {
  const t = PS.addUp([]);
  ['avg3', 'first9', 'checkoutPct'].forEach((k) => assert.strictEqual(t.x01[k], null, k));
  ['mpr', 'f9mpr'].forEach((k) => assert.strictEqual(t.cricket[k], null, k));
  assert.strictEqual(t.wonPct, null);
  assert.equal(t.played, 0);
  assert.ok(!/NaN|Infinity/.test(JSON.stringify(t)));
  const zero = { darts: 0, marks: 0, f9darts: 0, f9marks: 0, rounds5: 0, rounds9: 0, hatTricks: 0, whiteHorses: 0, bulls: 0, bestLegDarts: null, legsPlayed: 0, legsWon: 0 };
  const onlyCricket = PS.addUp([{ won: true, x01: null, cricket: zero }]);
  assert.strictEqual(onlyCricket.x01.avg3, null);
  assert.strictEqual(onlyCricket.cricket.mpr, null);
  assert.equal(onlyCricket.wonPct, 100);
  assert.deepEqual(PS.gameStats(x01b1, P1, [], 'nobody'), { won: false, x01: null, cricket: null });
});

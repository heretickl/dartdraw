const { test } = require('node:test');
const assert = require('node:assert/strict');
const S = require('../scoring-model.js');
const M = require('../match-engine.js');

// The scoring model (docs/superpowers/specs/2026-11-03-casual-play-design.md): a match in memory. Taps go in as actions,
// engine events come out, and view() is what the scoring screens show. The rules themselves are match-engine.js's.

const F = (game, bestOf) => S.formatFor({ game, bestOf });
const make = (game, bestOf, extra) => S.create(Object.assign({ format: F(game, bestOf), names: { a: 'Ahmad', b: 'Daniel' }, now: () => 1000 }, extra || {}));
const T = (n, m) => ({ n, m });
const MISS = T(0, 0);
const plain = (x) => JSON.parse(JSON.stringify(x));

// Win the leg being played for `side`: 180, 180, 141 (3rd dart) in 501; T20 T19 T18 / T17 T16 T15 / D-bull + 25 in cricket.
// The other side scores nothing.
function winLeg(m, side) {
  const leg = m.view().leg;
  let mine = 0;
  while (m.view().ask === 'turn' && m.view().leg === leg && !m.view().winner) {
    const v = m.view();
    if (v.throwing !== side) {
      if (v.game === 'cricket') m.darts([MISS, MISS, MISS]); else m.total(0);
      continue;
    }
    if (v.game === 'cricket') m.darts([[T(20, 3), T(19, 3), T(18, 3)], [T(17, 3), T(16, 3), T(15, 3)], [T(25, 2), T(25, 1)]][mine]);
    else if (v.sides[side].left > 141) m.total(180);
    else { m.total(141); m.finishDart(3); }
    mine++;
  }
}

test('formatFor maps the three games (spec 4.4)', () => {
  assert.deepEqual(F('501', 5), { game: 'x01', start: 501, inRule: 'SI', bestOf: 5, bullFirst: 'first', decider: 'alternate' });
  assert.deepEqual(F('cricket', 3), { game: 'cricket', bestOf: 3, bullFirst: 'first', decider: 'alternate' });
  assert.deepEqual(F('choice', 7), { game: 'mixed', start: 501, inRule: 'SI', pattern: ['x01', 'cricket'], bestOf: 7, bullFirst: 'first', decider: 'choice' });
});

test('a new match asks for the bull; the closest starts leg 1', () => {
  const m = make('501', 3);
  assert.equal(m.view().ask, 'bull');
  assert.deepEqual(m.view().bull, { leg: 0, side: 'a' });
  assert.deepEqual(m.bull('b'), { ok: true });
  const v = m.view();
  assert.equal(v.ask, 'turn'); assert.equal(v.throwing, 'b'); assert.equal(v.sides.b.left, 501); assert.equal(v.sides.a.name, 'Ahmad');
  assert.equal(v.toWin, 2); assert.equal(v.bestOf, 3); assert.equal(v.game, 'x01');
});

test('a total scores and passes the throw', () => {
  const m = make('501', 3); m.bull('a');
  assert.deepEqual(m.total(100), { ok: true });
  assert.equal(m.view().sides.a.left, 401); assert.equal(m.view().throwing, 'b');
});

test('a total above what is left, or leaving 1, asks Bust?; confirmBust sends a bust (Review Focus 3)', () => {
  const m = make('501', 3); m.bull('a');
  [180, 60, 180, 60, 101, 60].forEach((s) => m.total(s));
  assert.equal(m.view().sides.a.left, 40);
  const n = m.events().length;
  assert.deepEqual(m.total(60), { ok: false, code: 'ask_bust' });
  assert.equal(m.view().askBust, true);
  assert.deepEqual(m.total(39), { ok: false, code: 'nothing' });   // the Bust? question is answered first
  assert.deepEqual(m.cancelPending(), { ok: true });
  assert.deepEqual(m.total(39), { ok: false, code: 'ask_bust' });
  assert.equal(m.events().length, n);
  assert.deepEqual(m.confirmBust(), { ok: true });
  assert.equal(m.events().length, n + 1);
  assert.equal(m.events()[n].bust, true);
  assert.equal(m.view().sides.a.left, 40); assert.equal(m.view().throwing, 'b');
});

test('confirmBust with nothing waiting is refused', () => {
  const m = make('501', 3); m.bull('a');
  assert.deepEqual(m.confirmBust(), { ok: false, code: 'nothing' });
});

test('an impossible total is refused and adds nothing', () => {
  const m = make('501', 3); m.bull('a');
  assert.deepEqual(m.total(179), { ok: false, code: 'invalid' });
  assert.deepEqual(m.total(181), { ok: false, code: 'invalid' });
  assert.deepEqual(m.total(-1), { ok: false, code: 'invalid' });
  assert.equal(m.events().length, 1);
});

test('leaving 2 is fine', () => {
  const m = make('501', 3); m.bull('a');
  [180, 60, 180, 60, 101, 60].forEach((s) => m.total(s));
  assert.deepEqual(m.total(38), { ok: true });
  assert.equal(m.view().sides.a.left, 2);
});

test('a checkout keyed as a total waits for the finishing dart', () => {
  const m = make('501', 3); m.bull('a');
  [180, 60, 180, 60, 101, 60].forEach((s) => m.total(s));
  const n = m.events().length;
  assert.deepEqual(m.total(40), { ok: true });
  assert.deepEqual(m.view().pending, { score: 40, choices: [1, 2, 3] });
  assert.equal(m.events().length, n);
  assert.deepEqual(m.finishDart(2), { ok: true });
  assert.equal(m.events()[n].finishDart, 2);
  assert.equal(m.view().pending, null);
  assert.deepEqual(m.view().legsWon, { a: 1, b: 0 });
  assert.equal(m.view().legs[0].finishDart, 2); assert.equal(m.view().legs[0].winner, 'a');
});

test('a finishing dart that cannot be right is refused', () => {
  const m = make('501', 3); m.bull('a');
  [180, 60, 180, 60].forEach((s) => m.total(s));
  m.total(141);
  assert.deepEqual(m.view().pending, { score: 141, choices: [3] });
  assert.deepEqual(m.finishDart(1), { ok: false, code: 'invalid' });
  assert.deepEqual(m.cancelPending(), { ok: true });
  assert.equal(m.view().pending, null);
  assert.equal(m.events().length, 5);
  assert.deepEqual(m.finishDart(3), { ok: false, code: 'nothing' });
});

test('bust() sends a 0 bust turn at once', () => {
  const m = make('501', 3); m.bull('a'); m.total(100);
  m.bust();
  assert.equal(m.view().sides.b.left, 501); assert.equal(m.view().throwing, 'a');
  assert.equal(m.events()[2].bust, true);
});

test('undo takes back the last turn standing; nothing to undo is refused', () => {
  const m = make('501', 3); m.bull('a'); m.total(100);
  assert.deepEqual(m.undo(), { ok: true });
  assert.equal(m.view().sides.a.left, 501); assert.equal(m.view().throwing, 'a');
  assert.deepEqual(m.undo(), { ok: true });                     // then the bull itself (review fix, Important 3)
  assert.equal(m.view().ask, 'bull');
  assert.deepEqual(m.undo(), { ok: false, code: 'nothing' });
});

test('undo also clears a waiting finishing dart instead of a turn', () => {
  const m = make('501', 3); m.bull('a');
  [180, 60, 180, 60].forEach((s) => m.total(s));
  m.total(141);
  m.undo();
  assert.equal(m.view().pending, null);
  assert.equal(m.view().sides.a.left, 141);
});

test('darts: a 180 dart by dart, and a checkout by darts never waits', () => {
  const m = make('501', 3); m.bull('a');
  assert.deepEqual(m.darts([T(20, 3), T(20, 3), T(20, 3)]), { ok: true });
  assert.equal(m.view().sides.a.left, 321);
  [60, 180, 60, 101, 60].forEach((s) => m.total(s));
  assert.equal(m.view().sides.a.left, 40);
  m.darts([T(20, 2)]);
  assert.equal(m.view().pending, null);
  assert.deepEqual(m.view().legsWon, { a: 1, b: 0 });
  assert.equal(m.view().legs[0].finishDart, 1);
});

test('bad darts are refused', () => {
  const m = make('501', 3); m.bull('a');
  assert.deepEqual(m.darts([T(25, 3)]), { ok: false, code: 'invalid' });
  assert.deepEqual(m.darts([T(1, 1), T(1, 1), T(1, 1), T(1, 1)]), { ok: false, code: 'invalid' });
  assert.equal(m.events().length, 1);
});

test('cricket: marks per number, closed by both, and a leg won by darts', () => {
  const m = make('cricket', 1); m.bull('a');
  m.darts([T(20, 3), MISS, T(19, 1)]);
  let rows = m.view().cricket.numbers;
  assert.deepEqual(rows.map((r) => r.n), [20, 19, 18, 17, 16, 15, 25]);
  assert.equal(rows[0].a, 3); assert.equal(rows[1].a, 1); assert.equal(rows[0].closedBoth, false);
  m.darts([T(20, 3), MISS, MISS]);
  rows = m.view().cricket.numbers;
  assert.equal(rows[0].b, 3); assert.equal(rows[0].closedBoth, true);
  assert.deepEqual(m.view().cricket.points, { a: 0, b: 0 });
  assert.equal(m.view().sides.a.left, null);
});

test('cricket: a leg won on the second dart', () => {
  const m = make('cricket', 1); m.bull('a');
  winLeg(m, 'a');
  assert.equal(m.view().winner, 'a');
  assert.equal(m.view().legs[0].finishDart, 2);
  assert.equal(m.view().legs[0].game, 'cricket');
});

test('best of 3: the match ends at two legs; leg 2 starts with the bull loser', () => {
  const m = make('501', 3); m.bull('a');
  winLeg(m, 'a');
  assert.equal(m.view().leg, 1); assert.equal(m.view().throwing, 'b');
  winLeg(m, 'a');
  assert.equal(m.view().winner, 'a');
  assert.equal(m.view().ask, 'confirm');
  assert.deepEqual(m.view().legsWon, { a: 2, b: 0 });
  assert.deepEqual(m.view().legs.map((l) => [l.n, l.winner, l.game, l.finishDart, l.finishScore, l.darts]),
    [[1, 'a', 'x01', 3, 141, 9], [2, 'a', 'x01', 3, 141, 9]]);
});

test('Choice: 501 then Cricket; at 1-1 the bull loser throws first and the closest chooses', () => {
  const m = make('choice', 3); m.bull('a');
  assert.equal(m.view().game, 'x01');
  winLeg(m, 'a');
  assert.equal(m.view().game, 'cricket');
  winLeg(m, 'b');
  const v = m.view();
  assert.equal(v.ask, 'bull'); assert.deepEqual(v.bull, { leg: 2, side: 'b' });
  m.bull('a');
  assert.equal(m.view().ask, 'choice'); assert.deepEqual(m.view().choice, { leg: 2, by: 'a', firstThrower: 'b' });
  assert.deepEqual(m.choice('game', 'cricket'), { ok: true });
  assert.equal(m.view().ask, 'turn'); assert.equal(m.view().game, 'cricket'); assert.equal(m.view().throwing, 'b');
  assert.deepEqual(m.choice('start', 'x01'), { ok: false, code: 'nothing' });
});

test('Choice: a bad pick is refused', () => {
  const m = make('choice', 1); m.bull('a');
  assert.deepEqual(m.choice('maybe', 'x01'), { ok: false, code: 'invalid' });
  assert.deepEqual(m.choice('start', 'darts'), { ok: false, code: 'invalid' });
});

test('Choice best of 1: the closest at the opening bull goes straight to the choice (Review Focus 5)', () => {
  const m = make('choice', 1);
  m.bull('b');
  assert.equal(m.view().ask, 'choice'); assert.deepEqual(m.view().choice, { leg: 0, by: 'b', firstThrower: 'a' });
  m.choice('start', 'x01');
  assert.equal(m.view().throwing, 'b'); assert.equal(m.view().game, 'x01'); assert.equal(m.view().sides.b.left, 501);
});

test('actions out of turn are refused', () => {
  const m = make('501', 3);
  assert.deepEqual(m.total(60), { ok: false, code: 'nothing' });
  m.bull('a');
  assert.deepEqual(m.bull('b'), { ok: false, code: 'nothing' });
  assert.deepEqual(m.bull('x'), { ok: false, code: 'nothing' });
});

test('editTurn in the leg being played recalculates what is left', () => {
  const m = make('501', 3); m.bull('a');
  [60, 60, 60].forEach((s) => m.total(s));
  const id = m.legTurns(0)[0].a.turnId;
  assert.deepEqual(m.editTurn(id, { score: 85 }), { ok: true });
  assert.equal(m.view().sides.a.left, 356);
  assert.deepEqual(m.legTurns(0).map((r) => [r.turn, r.a && r.a.scored, r.a && r.a.left, r.b && r.b.scored]), [[1, 85, 416, 60], [2, 60, 356, null]]);
});

test('editTurn that makes a turn impossible is refused and changes nothing (Review Focus 4)', () => {
  const m = make('501', 3); m.bull('a');
  [180, 60, 180, 60, 100, 60, 39].forEach((s) => m.total(s));
  const before = plain(m.events());
  const id = m.legTurns(0)[2].a.turnId;   // the 100, on 141
  assert.deepEqual(m.editTurn(id, { score: 140 }), { ok: false, code: 'breaks_later' });
  assert.deepEqual(plain(m.events()), before);
});

test('editTurn in an earlier leg: kept if the winner stays, refused if the leg changes hands', () => {
  const m = make('501', 5); m.bull('a');
  [180, 60, 180, 60, 101, 60].forEach((s) => m.total(s));
  m.total(40); m.finishDart(1);
  m.total(100);
  const rows = m.legTurns(0);
  assert.deepEqual(m.editTurn(rows[0].b.turnId, { score: 45 }), { ok: true });
  assert.equal(m.legTurns(0)[0].b.scored, 45);
  const before = plain(m.events());
  assert.deepEqual(m.editTurn(rows[0].a.turnId, { score: 140 }), { ok: false, code: 'changes_winner' });
  assert.deepEqual(plain(m.events()), before);
});

test('editTurn: unknown turn, bad value', () => {
  const m = make('501', 3); m.bull('a'); m.total(60);
  assert.deepEqual(m.editTurn('t99', { score: 45 }), { ok: false, code: 'no_turn' });
  assert.deepEqual(m.editTurn(m.legTurns(0)[0].a.turnId, { score: 181 }), { ok: false, code: 'invalid' });
});

test('a match rebuilt from its events looks the same (reload)', () => {
  const m = make('choice', 3); m.bull('a');
  winLeg(m, 'a'); m.darts([T(20, 3), MISS, MISS]);
  const r = S.create({ format: F('choice', 3), names: { a: 'Ahmad', b: 'Daniel' }, events: m.events(), now: () => 1000 });
  assert.deepEqual(plain(r.view()), plain(m.view()));
  r.darts([MISS, MISS, MISS]);
  assert.equal(r.events().length, m.events().length + 1);
});

test('last3: the three latest turn numbers of this leg, newest first', () => {
  const m = make('501', 3); m.bull('a');
  [100, 60, 85].forEach((s) => m.total(s));
  assert.deepEqual(m.view().last3, [{ n: 2, a: 85, b: null }, { n: 1, a: 100, b: 60 }]);
  [41, 45, 57, 26].forEach((s) => m.total(s));
  assert.deepEqual(m.view().last3.map((r) => r.n), [4, 3, 2]);
});

test('averages come from the engine stats', () => {
  const m = make('501', 3); m.bull('a');
  [100, 60, 85, 41].forEach((s) => m.total(s));
  const st = M.stats(m.state()).bySide;
  assert.equal(m.view().sides.a.avg3, st.a.avg3); assert.equal(m.view().sides.b.first9, st.b.first9);
  assert.equal(m.view().sides.a.avg3, 92.5);
});

test('checkout hint only when switched on, for the thrower', () => {
  const off = make('501', 3); off.bull('a');
  [180, 0, 180, 0, 41, 0].forEach((s) => off.total(s));
  assert.equal(off.view().hint, null);
  const on = make('501', 3, { hints: true }); on.bull('a');
  [180, 0, 180, 0, 41, 0].forEach((s) => on.total(s));
  assert.equal(on.view().sides.a.left, 100);
  assert.deepEqual(on.view().hint, M.checkoutHint(100));
});

test('names are kept as typed (the screens escape them)', () => {
  const m = S.create({ format: F('501', 1), names: { a: '<b>Ali</b>', b: 'Tom & "Jerry"' } });
  assert.equal(m.view().sides.a.name, '<b>Ali</b>');
});

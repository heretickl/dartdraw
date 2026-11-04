const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../match-engine.js');

// Match engine: every version of every turn is kept; restore, undo, recalculation after an older edit, and the flags
// the organiser sees (spec 8.1 and 11).

const fmt = M.normalizeFormat({ game: 'x01', start: 501, bestOf: 3, bullFirst: 'first' });
const P1 = { a: ['p1'], b: ['p2'] };
function Log() {
  const evs = []; let tid = 0;
  const api = {
    evs,
    add(...list) { list.forEach((e) => evs.push(Object.assign({ seq: evs.length + 1, at: 'T' + evs.length, dev: 'tab1' }, e, e.type === 'turn' && !e.id ? { id: 't' + (++tid) } : {}))); return api; },
    total(leg, side, score, extra) { return api.add(Object.assign({ type: 'turn', leg, side, player: side === 'a' ? 'p1' : 'p2', mode: 'total', score }, extra)); }
  };
  return api;
}
// Leg 0 won by a: 180 (t1), 0 (t2), 180 (t3), 0 (t4), 141 finished on dart 3 (t5).
function legOne() {
  const log = Log().add({ type: 'bull', leg: 0, winner: 'a' });
  log.total(0, 'a', 180); log.total(0, 'b', 0); log.total(0, 'a', 180); log.total(0, 'b', 0); log.total(0, 'a', 141, { finishDart: 3 });
  return log;
}
// A whole match a wins 2-0: legOne, then leg 1 started by b, a again 180, 180, 141 (t6..t11).
function wonMatch() {
  const log = legOne();
  log.total(1, 'b', 0); log.total(1, 'a', 180); log.total(1, 'b', 0); log.total(1, 'a', 180); log.total(1, 'b', 0); log.total(1, 'a', 141, { finishDart: 3 });
  return log;
}

test('every version is kept; restore moves current without adding a version', () => {
  const log = legOne().add({ type: 'edit', turnId: 't3', score: 45 }, { type: 'edit', turnId: 't3', score: 54 }, { type: 'restore', turnId: 't3', version: 0 });
  const h = M.turnHistory(log.evs, 't3');
  assert.deepEqual(h.map((v) => v.score), [180, 45, 54]);
  assert.deepEqual(h.map((v) => v.current), [true, false, false]);
  assert.deepEqual(h.map((v) => v.at), ['T3', 'T6', 'T7']);
  assert.equal(M.replay(fmt, P1, log.evs).legs[0].winner, 'a', 'restored to 180, the leg stands');
});

test('restoring a version that does not exist is ignored', () => {
  const log = legOne().add({ type: 'restore', turnId: 't3', version: 4 });
  const s = M.replay(fmt, P1, log.evs);
  assert.deepEqual(s.ignored, [7]);
});

test('an edit that breaks a later checkout flags it, unwins the leg, and blocks confirm', () => {
  const log = wonMatch().add({ type: 'edit', turnId: 't1', score: 140 });
  const s = M.replay(fmt, P1, log.evs);
  assert.ok(s.flags.some((f) => f.turnId === 't5' && f.code === 'not_checkout'));
  assert.equal(s.legs[0].winner, null);
  assert.equal(s.winner, null);
  assert.equal(s.next.ask, 'turn'); assert.deepEqual(s.next.left, { a: 40, b: 501 });
  assert.ok(s.flags.some((f) => f.turnId === 't11' && f.code === 'not_reached'), 'leg 2 turns wait, flagged');
  assert.equal(M.canConfirm(s), false);
});

test('an edit that makes a later total too big flags it as a bust', () => {
  const log = legOne().add({ type: 'edit', turnId: 't1', score: 181 });
  const bad = M.replay(fmt, P1, log.evs);
  assert.deepEqual(bad.ignored, [7], 'an impossible edit does not apply');
  assert.equal(bad.legs[0].winner, 'a');
  assert.equal(M.turnHistory(log.evs, 't1').length, 1);
  const log2 = Log().add({ type: 'bull', leg: 0, winner: 'a' });
  // a: 100, 100, 140 leaves 161. Raising the first two to 180 leaves 141 before the 140, which would leave 1: a bust.
  log2.total(0, 'a', 100); log2.total(0, 'b', 0); log2.total(0, 'a', 100); log2.total(0, 'b', 0); log2.total(0, 'a', 140);
  assert.deepEqual(M.replay(fmt, P1, log2.evs).next.left, { a: 161, b: 501 });
  log2.add({ type: 'edit', turnId: 't1', score: 180 }, { type: 'edit', turnId: 't3', score: 180 });
  const s2 = M.replay(fmt, P1, log2.evs);
  assert.ok(s2.flags.some((f) => f.turnId === 't5' && f.code === 'now_bust'));
  assert.deepEqual(s2.next.left, { a: 141, b: 501 }, 'the flagged turn counts as a bust until someone fixes it');
});

test('a late offline turn after the match is won is kept, flagged, and changes nothing', () => {
  const log = wonMatch().total(1, 'b', 60, { id: 'late' });
  const s = M.replay(fmt, P1, log.evs);
  assert.ok(s.flags.some((f) => f.turnId === 'late' && f.code === 'after_win'));
  assert.equal(s.winner, 'a');
  assert.equal(M.canConfirm(s), false, 'a flagged late turn needs the organiser');
});

test('undo: only the last turn; it stays in history', () => {
  const log = legOne();
  log.total(1, 'b', 60);
  log.add({ type: 'undo', turnId: 't3' });
  let s = M.replay(fmt, P1, log.evs);
  assert.deepEqual(s.ignored, [8], 'undo of an older turn is ignored');
  log.add({ type: 'undo', turnId: 't6' });
  s = M.replay(fmt, P1, log.evs);
  assert.equal(s.next.side, 'b'); assert.deepEqual(s.next.left, { a: 501, b: 501 });
  const h = M.turnHistory(log.evs, 't6');
  assert.equal(h.length, 2); assert.equal(h[1].undone, true); assert.equal(h[1].current, true);
  log.add({ type: 'undo', turnId: 't5' });
  s = M.replay(fmt, P1, log.evs);
  assert.equal(s.legs[0].winner, null, 'after t6 is undone, t5 is the last turn and can be undone too');
});

test('old edits are flagged for the organiser but do not block confirm', () => {
  const log = wonMatch().add({ type: 'edit', turnId: 't2', score: 26 }, { type: 'confirm' });
  let s = M.replay(fmt, P1, log.evs);
  assert.ok(s.flags.some((f) => f.turnId === 't2' && f.code === 'old_edit'));
  const before = wonMatch().add({ type: 'edit', turnId: 't2', score: 26 });
  s = M.replay(fmt, P1, before.evs);
  assert.equal(M.canConfirm(s), true);
  assert.equal(s.legs[0].turns[1].flagged, true);
});

test('editing the last turn is not an old edit', () => {
  const log = legOne().add({ type: 'edit', turnId: 't5', finishDart: 3, score: 141 });
  assert.equal(M.replay(fmt, P1, log.evs).flags.length, 0);
});

test('out-of-turn turns are applied to the side they name and flagged, without blocking confirm', () => {
  const log = Log().add({ type: 'bull', leg: 0, winner: 'a' });
  log.total(0, 'b', 100);
  const s = M.replay(fmt, P1, log.evs);
  assert.ok(s.flags.some((f) => f.code === 'out_of_turn'));
  assert.deepEqual(s.next.left, { a: 501, b: 401 });
});

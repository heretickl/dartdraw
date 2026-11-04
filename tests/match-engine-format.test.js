const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../match-engine.js');

// Match engine (docs/superpowers/specs/2026-11-02-tournament-scoring-design.md): the format of a match and its leg plan.

test('defaults: 301 is DI, others SI; bad start → 501; mixed pattern defaults', () => {
  assert.equal(M.normalizeFormat({ game: 'x01', start: 301 }).inRule, 'DI');
  assert.equal(M.normalizeFormat({ game: 'x01', start: 701 }).inRule, 'SI');
  assert.equal(M.normalizeFormat({ game: 'x01', start: 999 }).start, 501);
  assert.deepEqual(M.normalizeFormat({ game: 'mixed' }).pattern, ['x01', 'cricket']);
  assert.equal(M.normalizeFormat({ game: 'x01', bestOf: 4 }).bestOf, 5);
});

test('legs to win and the deciding leg', () => {
  const f = M.normalizeFormat({ game: 'x01', bestOf: 5 });
  assert.equal(M.legsToWin(f), 3);
  assert.equal(M.isDecider(f, { a: 2, b: 2 }), true);
  assert.equal(M.isDecider(f, { a: 2, b: 1 }), false);
  assert.equal(M.isDecider(M.normalizeFormat({ bestOf: 1 }), { a: 0, b: 0 }), true);
});

test('mixed pattern repeats; choice only on the decider', () => {
  const f = M.normalizeFormat({ game: 'mixed', pattern: ['x01', 'cricket'], bestOf: 5, decider: 'choice' });
  assert.deepEqual([0, 1, 2, 3].map((i) => M.legGame(f, i, { a: i >> 1, b: (i + 1) >> 1 })), ['x01', 'cricket', 'x01', 'cricket']);
  assert.equal(M.legGame(f, 4, { a: 2, b: 2 }), null);
  assert.equal(M.legGame(f, 4, { a: 2, b: 2 }, 'cricket'), 'cricket');
});

test('choice games: the match x01, or 501 SI for a cricket stage', () => {
  assert.deepEqual(M.choiceGames(M.normalizeFormat({ game: 'x01', start: 701 })), [{ game: 'x01', start: 701, inRule: 'SI' }, { game: 'cricket' }]);
  assert.deepEqual(M.choiceGames(M.normalizeFormat({ game: 'cricket' }))[0], { game: 'x01', start: 501, inRule: 'SI' });
});

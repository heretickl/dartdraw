const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, plain, seededRng, makeTournament } = require('./lib/helpers');

const app = loadApp();
const f = (name) => run(app, name);

test('podSizes splits n players into p groups, sizes differ by at most 1, larger first', () => {
  const s = f('podSizes')(540, 64);
  assert.equal(s.reduce((a, b) => a + b, 0), 540);
  assert.equal(s[0], 9); assert.equal(s[63], 8);
  assert.ok(Math.max(...s) - Math.min(...s) <= 1);
  assert.deepEqual(plain(f('podSizes')(10, 4)), [3, 3, 2, 2]);
});

test('validation: needs 2+ groups, at most 128, and 2+ players per group', () => {
  const v = f('podsValidate');
  assert.equal(v(makeTournament(app, 7, { pods: 4 })).ok, false);
  assert.match(v(makeTournament(app, 7, { pods: 4 })).message, /at most 3 groups/);
  assert.equal(v(makeTournament(app, 300, { pods: 129 })).ok, false);
  assert.equal(v(makeTournament(app, 20, { pods: 1 })).ok, false);
  assert.equal(v(makeTournament(app, 8, { pods: 4 })).ok, true);
  assert.equal(v(makeTournament(app, 8, { pods: 9 }), 4).ok, true);   // a live value overrides the saved one
  assert.equal(v(makeTournament(app, 8, { pods: 4 }), 5).ok, false);
  assert.equal(f('podsValidateCount')(7, 4).ok, false);
  assert.equal(f('podsValidateCount')(8, 4).ok, true);
});

test('withdrawn players are not counted and never drawn', () => {
  const t = makeTournament(app, 10, { pods: 4 });
  t.entriesList[0].withdrawn = true; t.entriesList[1].withdrawn = true;
  assert.equal(f('podsPlayerCount')(t), 8);
  assert.equal(f('generatePods')(t, seededRng(1)).ok, true);
  const drawn = t.pods.flatMap((p) => p.entryIds);
  assert.equal(drawn.length, 8);
  assert.ok(!drawn.includes('e0') && !drawn.includes('e1'));
});

test('540 players into 64 groups: balanced, every top-64 seed in a different group', () => {
  const t = makeTournament(app, 540, { pods: 64, seeding: true, numSeeds: 64 });
  assert.equal(f('generatePods')(t, seededRng(1)).ok, true);
  const sizes = t.pods.map((p) => p.entryIds.length);
  assert.equal(sizes.reduce((a, b) => a + b, 0), 540);
  assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1);
  const groupOfSeed = new Set();
  for (let i = 0; i < 64; i++) groupOfSeed.add(f('podsFindOf')(t, t.seedOrder[i]).id);
  assert.equal(groupOfSeed.size, 64);
});

test('seeds are dealt in a snake so group strength stays balanced', () => {
  const t = makeTournament(app, 16, { pods: 4, seeding: true, numSeeds: 8 });
  f('generatePods')(t, seededRng(2));
  const gIdx = (seed) => t.pods.findIndex((p) => p.entryIds.includes(t.seedOrder[seed - 1]));
  assert.deepEqual([1, 2, 3, 4].map(gIdx), [0, 1, 2, 3]);
  assert.deepEqual([5, 6, 7, 8].map(gIdx), [3, 2, 1, 0]);
});

test('club clash fixing never moves a seeded player and never makes clashes worse', () => {
  const orgOf = (i) => 'club' + (i % 3);
  const split = makeTournament(app, 24, { pods: 4, seeding: true, numSeeds: 4, orgSplit: true, orgOf });
  const plain = makeTournament(app, 24, { pods: 4, seeding: true, numSeeds: 4, orgSplit: false, orgOf });
  f('generatePods')(split, seededRng(7)); f('generatePods')(plain, seededRng(7));
  const clashes = (t) => t.pods.reduce((s, p) => s + f('podsClashPairs')(t, p.entryIds), 0);
  assert.ok(clashes(split) <= clashes(plain));
  for (let i = 0; i < 4; i++) {
    assert.equal(f('podsFindOf')(split, split.seedOrder[i]).label, f('podsFindOf')(plain, plain.seedOrder[i]).label);
  }
  assert.equal(split.pods.reduce((s, p) => s + p.entryIds.length, 0), 24);
});

test('a group of 2 or 3 players still gets a valid bracket', () => {
  const t = makeTournament(app, 10, { pods: 4 });
  f('generatePods')(t, seededRng(4));
  t.pods.forEach((p) => { assert.ok(p.bracket.rounds.length >= 2); assert.equal(p.bracket.podLabel, p.label); });
});

test('boards default to one per group, wrapping when boards are fewer than groups', () => {
  const t = makeTournament(app, 12, { pods: 6, boards: 4 });
  f('generatePods')(t, seededRng(3));
  assert.deepEqual(plain(t.pods.map((p) => p.boards[0])), [1, 2, 3, 4, 1, 2]);
  assert.equal(f('podBoardLabel')(t.pods[0]), 'Board 1');
  assert.equal(f('podBoardLabel')({ boards: [3, 4] }), 'Boards 3, 4');
});

test('only seeded players show a seed number in a group bracket', () => {
  const t = makeTournament(app, 16, { pods: 4, seeding: true, numSeeds: 4 });
  f('generatePods')(t, seededRng(5));
  const all = Object.assign({}, ...t.pods.map((p) => p.bracket.seeds));
  assert.equal(Object.keys(all).length, 4);
  assert.deepEqual(plain(Object.values(all)).sort(), [1, 2, 3, 4]);
});

test('a tournament without a pods field is handled', () => {
  const t = makeTournament(app, 8, { pods: 2 });
  delete t.pods;
  assert.deepEqual(plain(f('podsList')(t)), []);
  assert.ok(Array.isArray(t.pods));
});

test('with seeding off, round-1 matches inside a group are not always the latest-registered players', () => {
  const t = makeTournament(app, 540, { pods: 64 });          // seeding off: a fully random draw
  f('generatePods')(t, seededRng(8));
  const num = (id) => parseInt(id.slice(1));
  let groupsOfNine = 0, alwaysLatest = 0;
  t.pods.forEach((p) => {
    if (p.entryIds.length !== 9) return;                     // 9 players: seven get a bye, one real round-1 match
    groupsOfNine++;
    const players = p.bracket.rounds[0].filter((m) => !m.bye && m.aEntryId && m.bEntryId).flatMap((m) => [num(m.aEntryId), num(m.bEntryId)]).sort((a, b) => a - b);
    const latest = p.entryIds.map(num).sort((a, b) => b - a).slice(0, players.length).sort((a, b) => a - b);
    if (players.join() === latest.join()) alwaysLatest++;
  });
  assert.ok(groupsOfNine > 20);
  assert.ok(alwaysLatest < groupsOfNine / 4, alwaysLatest + ' of ' + groupsOfNine + ' groups gave the round-1 match to the two latest registrants');
});

test('seeded players still get the byes first; unseeded players follow in the dealt order', () => {
  const t = makeTournament(app, 16, { pods: 4, seeding: true, numSeeds: 4 });
  f('generatePods')(t, seededRng(2));
  t.pods.forEach((p) => {
    const seeds = f('podsOverallSeeds')(t);
    const ids = plain(p.entryIds);
    assert.equal(seeds[ids[0]] > 0, true);                    // each group holds exactly one seed, listed first
    assert.ok(ids.slice(1).every((id) => !seeds[id]));
  });
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, seededRng, makeTournament, play, playOut } = require('./lib/helpers');

const app = loadApp();
const f = (name) => run(app, name);
function ready(n, pods, opts, seed) {
  const t = makeTournament(app, n, Object.assign({ pods }, opts || {}));
  f('generatePods')(t, seededRng(seed || 5));
  t.pods.forEach((p) => { p.confirmed = true; });
  f('generateFinalsFromPods')(t);
  return t;
}
function finishAllGroups(t) { t.pods.forEach((p) => { playOut(app, p.bracket, () => 'a'); f('syncFinalsFromPods')(t); }); }

test('5 groups: an 8-slot Finals, byes for the 3 strongest groups, placeholders for the rest', () => {
  const t = ready(20, 5, { seeding: true, numSeeds: 8 }, 3);
  const fin = t.knockout;
  assert.equal(fin.size, 8); assert.equal(fin.rounds.length, 3); assert.equal(fin.podFinals, true);
  const byes = fin.rounds[0].filter((m) => m.bye);
  assert.equal(byes.length, 3);
  const strongest = new Set(f('podsRankedForFinals')(t).slice(0, 3).map((p) => p.id));
  byes.forEach((m) => assert.ok(strongest.has(m.aFromPod || m.bFromPod)));
  fin.rounds[0].filter((m) => !m.bye).forEach((m) => assert.ok(m.aFromPod && m.bFromPod));
  fin.rounds[0].forEach((m) => { assert.equal(m.aEntryId, null); assert.equal(m.bEntryId, null); });
});

test('group strength is the best seed it holds; unseeded groups follow in group-number order', () => {
  const t = makeTournament(app, 12, { pods: 4, seeding: true, numSeeds: 2 });
  f('generatePods')(t, seededRng(1));
  const ranked = f('podsRankedForFinals')(t);
  assert.ok(f('podBestSeed')(t, ranked[0]) === 1 && f('podBestSeed')(t, ranked[1]) === 2);
  assert.equal(f('podBestSeed')(t, ranked[2]), Infinity);
  assert.ok(parseInt(ranked[2].label) < parseInt(ranked[3].label));
});

test('64 groups: strongest two groups sit in opposite halves of the Finals', () => {
  const t = ready(540, 64, { seeding: true, numSeeds: 64 }, 1);
  const fin = t.knockout; assert.equal(fin.size, 64);
  const slotOf = (podId) => fin.rounds[0].findIndex((m) => m.aFromPod === podId || m.bFromPod === podId);
  const g1 = slotOf(f('podsFindOf')(t, t.seedOrder[0]).id), g2 = slotOf(f('podsFindOf')(t, t.seedOrder[1]).id);
  assert.notEqual(g1 < 16, g2 < 16);
});

test('a finished group fills its Finals slot; a bye group advances on its own', () => {
  const t = ready(20, 5, {}, 8);
  const byeMatch = t.knockout.rounds[0].find((m) => m.bye);
  const podId = byeMatch.aFromPod || byeMatch.bFromPod;
  const pod = t.pods.find((p) => p.id === podId);
  playOut(app, pod.bracket, () => 'a');
  const r = f('syncFinalsFromPods')(t);
  assert.equal(r.changed, true);
  const side = byeMatch.aFromPod ? 'aEntryId' : 'bEntryId';
  assert.equal(byeMatch[side], f('podChampion')(pod));
  assert.equal(byeMatch.winnerId, f('podChampion')(pod));
  const next = t.knockout.rounds[1][Math.floor(t.knockout.rounds[0].indexOf(byeMatch) / 2)];
  assert.ok([next.aEntryId, next.bEntryId].includes(f('podChampion')(pod)));
});

test('full run: every group, then the Finals, produces a champion', () => {
  const t = ready(40, 6, { seeding: true, numSeeds: 8 }, 5);
  finishAllGroups(t);
  t.pods.forEach((p) => assert.ok(p.winnerId));
  t.knockout.rounds[0].forEach((m) => { if (m.aFromPod) assert.ok(m.aEntryId); if (m.bFromPod) assert.ok(m.bEntryId); });
  playOut(app, t.knockout, () => 'a');
  assert.ok(f('bracketChampion')(t.knockout));
});

test('correcting a group result is refused, and undone, once a dependent Finals match is scored', () => {
  const t = ready(16, 4, {}, 9);
  finishAllGroups(t);
  const m0 = t.knockout.rounds[0][0];
  play(m0, 'a');
  const pod = t.pods.find((p) => p.id === m0.aFromPod);
  const final = pod.bracket.rounds[pod.bracket.rounds.length - 1][0];
  const before = pod.winnerId;
  const r = f('podsApplyResult')(t, pod, () => { play(final, final.winnerId === final.aEntryId ? 'b' : 'a'); });
  assert.equal(r.ok, false); assert.match(r.message, /Finals/);
  assert.equal(pod.winnerId, before); assert.equal(m0.aEntryId, before);
  assert.equal(pod.bracket.rounds[pod.bracket.rounds.length - 1][0].winnerId, before);
});

test('correcting a group result updates the Finals slot while nothing downstream is scored', () => {
  const t = ready(16, 4, {}, 9);
  finishAllGroups(t);
  const m0 = t.knockout.rounds[0][0];
  const podId = m0.aFromPod || m0.bFromPod, side = m0.aFromPod === podId ? 'aEntryId' : 'bEntryId';
  const pod = t.pods.find((p) => p.id === podId);
  const final = pod.bracket.rounds[pod.bracket.rounds.length - 1][0], old = pod.winnerId;
  const r = f('podsApplyResult')(t, pod, () => { play(final, final.winnerId === final.aEntryId ? 'b' : 'a'); });
  assert.equal(r.ok, true);
  assert.notEqual(pod.winnerId, old); assert.equal(m0[side], pod.winnerId);
});

test('a Finals with 2 groups is a single match', () => {
  const t = ready(8, 2, {}, 1);
  assert.equal(t.knockout.size, 4);
  finishAllGroups(t);
  playOut(app, t.knockout, () => 'a');
  assert.ok(f('bracketChampion')(t.knockout));
});

// ---- review fixes: corrections must not leave stale players behind ----
test('a group with a Finals bye loses its place when a finished group is corrected so it has no winner', () => {
  const t = ready(20, 5, { seeding: true, numSeeds: 8 }, 3);          // 5 groups of 4: three groups have a Finals bye
  const byeMatch = t.knockout.rounds[0].find((m) => m.bye);
  const pod = t.pods.find((p) => p.id === (byeMatch.aFromPod || byeMatch.bFromPod));
  playOut(app, pod.bracket, () => 'a'); f('syncFinalsFromPods')(t);
  const champ = f('podChampion')(pod);
  const next = () => t.knockout.rounds[1][Math.floor(t.knockout.rounds[0].indexOf(byeMatch) / 2)];
  assert.ok([next().aEntryId, next().bEntryId].includes(champ));
  const semi = pod.bracket.rounds[0].find((m) => m.winnerId === champ && !m.bye);
  const r = f('podsApplyResult')(t, pod, () => { play(semi, semi.winnerId === semi.aEntryId ? 'b' : 'a'); });
  assert.equal(r.ok, true);
  assert.equal(pod.winnerId, null);
  assert.ok(![next().aEntryId, next().bEntryId].includes(champ));
});

test('correcting an early group match clears the later group matches it fed', () => {
  const t = ready(16, 2, {}, 4);                                       // two groups of 8
  playOut(app, t.pods[0].bracket, () => 'a'); f('syncFinalsFromPods')(t);
  const pod = t.pods[0], champ = pod.winnerId;
  const q = pod.bracket.rounds[0].find((m) => m.winnerId === champ && !m.bye);
  const r = f('podsApplyResult')(t, pod, () => { play(q, q.winnerId === q.aEntryId ? 'b' : 'a'); });
  assert.equal(r.ok, true);
  assert.equal(pod.winnerId, null);
  const later = pod.bracket.rounds.slice(1).flatMap((rd) => rd.flatMap((m) => [m.aEntryId, m.bEntryId, m.winnerId]));
  assert.ok(!later.includes(champ));
  t.knockout.rounds[0].forEach((m) => { assert.notEqual(m.aEntryId, champ); assert.notEqual(m.bEntryId, champ); });
});

test('a cascading correction is refused, and undone, when it would change who is in a scored Finals match', () => {
  const t = ready(16, 2, {}, 4);
  t.pods.forEach((p) => { playOut(app, p.bracket, () => 'a'); f('syncFinalsFromPods')(t); });
  playOut(app, t.knockout, () => 'a');                                  // the Finals is played
  const pod = t.pods[0], champ = pod.winnerId;
  const q = pod.bracket.rounds[0].find((m) => m.winnerId === champ && !m.bye);
  const before = JSON.stringify(pod.bracket.rounds);
  const r = f('podsApplyResult')(t, pod, () => { play(q, q.winnerId === q.aEntryId ? 'b' : 'a'); });
  assert.equal(r.ok, false);
  assert.equal(JSON.stringify(pod.bracket.rounds), before);
  assert.equal(pod.winnerId, champ);
});

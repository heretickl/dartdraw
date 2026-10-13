const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, useState, seededRng, makeTournament, play, playOut } = require('./lib/helpers');

const app = loadApp();
const f = (n) => run(app, n);
function ready(n, pods) {
  const t = makeTournament(app, n, { pods, boards: pods }); useState(app, t);
  app.persist = () => {}; app.render = () => {};
  f('generatePods')(t, seededRng(3)); f('podsConfirmAll')(t);
  return t;
}
// What markKnockoutVoid does to a match, through the same path a group edit takes.
function voidIt(t, pod, ri, mi) {
  const m = pod.bracket.rounds[ri][mi];
  return f('podsApplyResult')(t, pod, () => { m.void = true; m.aLegs = null; m.bLegs = null; m.winnerId = null; m.wo = false; });
}
const voidDirect = (m) => { m.void = true; m.aLegs = null; m.bLegs = null; m.winnerId = null; m.wo = false; };
const matchOf = (t, p) => t.knockout.rounds[0].find((m) => m.aFromPod === p.id || m.bFromPod === p.id);
const partnerOf = (t, p) => { const m = matchOf(t, p); return t.pods.find((x) => x.id === (m.aFromPod === p.id ? m.bFromPod : m.aFromPod)); };
function plainKo(n) {
  const t = f('blankTournament')(); useState(app, t); app.persist = () => {}; app.render = () => {};
  t.format.formatType = 'knockout';
  t.entriesList = Array.from({ length: n }, (_, i) => ({ id: 'e' + i, name: 'P' + (i + 1), org: '', players: [], withdrawn: false }));
  t.knockout = f('generateBracket')(t.entriesList.map((e) => ({ entryId: e.id, org: '' })), 'Bracket');
  return t;
}

test('one void semifinal: the other semifinal winner gets a bye into the group final and wins the group', () => {
  const t = ready(8, 2); const p = t.pods[0];
  assert.equal(voidIt(t, p, 0, 0).ok, true);
  assert.equal(p.bracket.rounds[1][0].bye, false);                 // waiting for the other semifinal
  play(p.bracket.rounds[0][1], 'a');
  f('podsApplyResult')(t, p, () => {});
  const fin = p.bracket.rounds[1][0];
  assert.equal(fin.bye, true); assert.equal(fin.winnerId, p.bracket.rounds[0][1].winnerId);
  assert.equal(f('podChampion')(p), p.bracket.rounds[0][1].winnerId);
  assert.equal(p.winnerId, p.bracket.rounds[0][1].winnerId);
});

test('two void semifinals: the final is void, the group has no winner and is finished, the Finals slot is dead', () => {
  const t = ready(16, 4); const p = t.pods[0], other = partnerOf(t, p);
  voidIt(t, p, 0, 0); voidIt(t, p, 0, 1);
  const fin = p.bracket.rounds[1][0];
  assert.equal(fin.void, true); assert.equal(fin.aEntryId, null);
  assert.equal(f('podNoWinner')(p), true); assert.equal(f('podIsFinished')(p), true);
  assert.equal(p.winnerId, null);
  assert.equal(!!matchOf(t, p).bye, false);                         // the partner group is still open, so the Finals match waits
  playOut(app, other.bracket, () => 'a'); f('podsApplyResult')(t, other, () => {});
  const km = matchOf(t, p);
  assert.equal(km.bye, true); assert.equal(km.winnerId, other.winnerId);
  assert.equal(t.knockout.rounds[1][0][t.knockout.rounds[0].indexOf(km) === 0 ? 'aEntryId' : 'bEntryId'], other.winnerId);   // through to the Finals final
});

test('both groups of a Finals match without a winner make that match void, and the next round gets a bye', () => {
  const t = ready(16, 4); const p = t.pods[0], other = partnerOf(t, p);
  [p, other].forEach((g) => { voidIt(t, g, 0, 0); voidIt(t, g, 0, 1); });
  assert.equal(matchOf(t, p).void, true);
  const rest = t.pods.filter((g) => g !== p && g !== other);
  rest.forEach((g) => playOut(app, g.bracket, () => 'a')); f('podsApplyResult')(t, rest[0], () => {});
  const km2 = matchOf(t, rest[0]); play(km2, 'a'); f('propagateByes')(t.knockout.rounds);   // the other Finals match is played
  const final = t.knockout.rounds[1][0];
  assert.equal(final.bye, true); assert.equal(final.winnerId, km2.winnerId);
});

test('reversing a void clears the byes and voids it caused, up to the Finals', () => {
  const t = ready(16, 4); const p = t.pods[0], other = partnerOf(t, p);
  playOut(app, other.bracket, () => 'a'); f('podsApplyResult')(t, other, () => {});
  voidIt(t, p, 0, 0); voidIt(t, p, 0, 1);
  assert.equal(matchOf(t, p).bye, true);
  const a = p.bracket.rounds[0][0], b = p.bracket.rounds[0][1];
  f('podsApplyResult')(t, p, () => { delete a.void; });
  f('podsApplyResult')(t, p, () => { delete b.void; });
  assert.equal(!!p.bracket.rounds[1][0].void, false); assert.equal(!!p.bracket.rounds[1][0].bye, false);
  assert.equal(f('podNoWinner')(p), false);
  const km = matchOf(t, p);
  assert.equal(!!km.bye, false); assert.equal(km.winnerId, null);
  assert.equal(t.knockout.rounds[1][0].aEntryId || t.knockout.rounds[1][0].bEntryId || null, null);   // nothing left in the Finals final
});

test('a group of two: voiding its only real match leaves the group with no winner', () => {
  const t = ready(8, 4); const p = t.pods[0];                        // 8 players in 4 groups: two byes, then one real match (the group final)
  assert.equal(voidIt(t, p, 1, 0).ok, true);
  assert.equal(f('podNoWinner')(p), true); assert.equal(f('podIsFinished')(p), true); assert.equal(p.winnerId, null);
});

test('a group of three: the only first-round match void makes the bye player the group winner', () => {
  const t = ready(12, 4); const p = t.pods[0];                       // 12 players in 4 groups of three: one match, one bye
  const real = p.bracket.rounds[0].findIndex((m) => !m.bye);
  const byePlayer = p.bracket.rounds[0].find((m) => m.bye).winnerId;
  assert.equal(voidIt(t, p, 0, real).ok, true);
  assert.equal(p.bracket.rounds[1][0].bye, true); assert.equal(p.bracket.rounds[1][0].winnerId, byePlayer);
  assert.equal(f('podChampion')(p), byePlayer);
});

test('correcting the other feeder after a void changes the bye winner and the slot it fed', () => {
  const t = ready(16, 4); const p = t.pods[0];
  voidIt(t, p, 0, 0);
  const other = p.bracket.rounds[0][1];
  play(other, 'a'); f('podsApplyResult')(t, p, () => {});
  const first = other.winnerId;
  assert.equal(p.bracket.rounds[1][0].winnerId, first);
  f('podsApplyResult')(t, p, () => { play(other, 'b'); });             // corrected: the other player won
  assert.notEqual(other.winnerId, first);
  assert.equal(p.bracket.rounds[1][0].winnerId, other.winnerId);
  assert.equal(p.winnerId, other.winnerId);
});

test('an edit is refused and undone when a dependent Finals match is scored', () => {
  const t = ready(16, 4); const p = t.pods[0], other = partnerOf(t, p);
  playOut(app, p.bracket, () => 'a'); playOut(app, other.bracket, () => 'a');
  f('podsApplyResult')(t, p, () => {});
  const km = matchOf(t, p); play(km, 'a');                           // the Finals match is scored
  const final = p.bracket.rounds[p.bracket.rounds.length - 1][0];
  const winner = final.winnerId;
  const r = f('podsApplyResult')(t, p, () => { final.void = true; final.winnerId = null; final.aLegs = null; final.bLegs = null; });
  assert.equal(r.ok, false);
  assert.equal(!!p.bracket.rounds[p.bracket.rounds.length - 1][0].void, false);
  assert.equal(p.bracket.rounds[p.bracket.rounds.length - 1][0].winnerId, winner);
});

test('a Finals match the organiser voided directly survives later syncs', () => {
  const t = ready(16, 4);
  t.pods.forEach((g) => playOut(app, g.bracket, () => 'a')); f('podsApplyResult')(t, t.pods[0], () => {});
  const km = t.knockout.rounds[0].find((m) => m.aFromPod && m.bFromPod && m.aEntryId && m.bEntryId);
  assert.ok(km);
  voidDirect(km);
  f('syncFinalsFromPods')(t);
  assert.equal(km.void, true); assert.ok(km.aEntryId && km.bEntryId);
});

test('settleVoids is a no-op for a bracket with no void', () => {
  const t = ready(8, 2); const p = t.pods[0];
  playOut(app, p.bracket, () => 'a');
  const before = JSON.stringify(p.bracket.rounds);
  f('settleVoids')(p.bracket.rounds);
  assert.equal(JSON.stringify(p.bracket.rounds), before);
});

test('plain knockout: a void first-round match gives the next opponent a bye, cascading into the next round', () => {
  const t = plainKo(8); const R = t.knockout.rounds;
  voidDirect(R[0][0]); f('propagateByes')(R);
  assert.equal(!!R[1][0].bye, false); assert.equal(R[1][0].winnerId, null);        // waits for the other first-round match
  play(R[0][1], 'a'); f('propagateByes')(R);
  assert.equal(R[1][0].bye, true); assert.equal(R[1][0].winnerId, R[0][1].winnerId);
  assert.equal(R[2][0].aEntryId, R[0][1].winnerId);                                // the bye winner reached the next round
});

test('plain knockout: two void feeders make the next match void; reversing clears everything it caused', () => {
  const t = plainKo(8); const R = t.knockout.rounds;
  voidDirect(R[0][0]); voidDirect(R[0][1]); f('propagateByes')(R);
  assert.equal(R[1][0].void, true); assert.equal(R[1][0].aEntryId, null);
  delete R[0][0].void; delete R[0][1].void; f('propagateByes')(R);                 // both reversed, no result yet
  assert.equal(!!R[1][0].void, false); assert.equal(!!R[1][0].bye, false);
});

test('plain knockout: reversing one void whose partner already won clears the bye and the slot it fed', () => {
  const t = plainKo(8); const R = t.knockout.rounds;
  voidDirect(R[0][0]); play(R[0][1], 'a'); f('propagateByes')(R);
  assert.equal(R[1][0].bye, true); assert.equal(R[2][0].aEntryId, R[0][1].winnerId);
  delete R[0][0].void; f('settleVoids')(R, true);
  assert.equal(!!R[1][0].bye, false); assert.equal(R[1][0].winnerId, null);
  assert.equal(R[2][0].aEntryId, null);
});

test('bracketIsVoidFinal reads the last match of the last round', () => {
  const t = plainKo(4);
  assert.equal(f('bracketIsVoidFinal')(t.knockout), false);
  t.knockout.rounds[t.knockout.rounds.length - 1][0].void = true;
  assert.equal(f('bracketIsVoidFinal')(t.knockout), true);
  assert.equal(f('bracketIsVoidFinal')(null), false);
});

test('group progress counts a void match as done and ignores a match made void by its feeders', () => {
  const t = ready(16, 4); const p = t.pods[0];
  const before = f('podMatchCounts')(p);
  voidIt(t, p, 0, 0); voidIt(t, p, 0, 1);                          // the final becomes void too (no players)
  const after = f('podMatchCounts')(p);
  assert.equal(after.total, before.total - 1);                      // the derived void final is not a real match
  assert.equal(after.done, 2);
});

test('a Finals bye whose group ends with no winner makes that Finals match void and lets the Finals finish', () => {
  const t = ready(12, 3);
  const km = t.knockout.rounds[0].find((m) => !!m.aFromPod !== !!m.bFromPod);
  assert.ok(km); assert.equal(km.bye, true);
  const byeGroup = t.pods.find((x) => x.id === (km.aFromPod || km.bFromPod));
  const others = t.pods.filter((x) => x !== byeGroup);
  voidIt(t, byeGroup, 0, 0); voidIt(t, byeGroup, 0, 1);
  assert.equal(f('podNoWinner')(byeGroup), true);
  assert.equal(km.void, true); assert.equal(!!km.bye, false); assert.equal(km.winnerId, null);
  const R = t.knockout.rounds;
  const kmi = R[0].indexOf(km), fin = R[R.length - 1][0];
  others.forEach((g) => playOut(app, g.bracket, () => 'a')); f('podsApplyResult')(t, others[0], () => {});
  const km2 = R[0].find((m) => m !== km && m.aFromPod && m.bFromPod);
  assert.ok(km2);
  play(km2, 'a'); f('propagateByes')(R);
  assert.equal(R.length, 2);
  assert.equal(fin.bye, true); assert.equal(fin.winnerId, km2.winnerId);
  assert.equal(f('bracketIsComplete')(t.knockout), true);
  assert.equal(f('bracketChampion')(t.knockout), km2.winnerId);
  assert.notEqual(kmi, -1);
});

test('a Finals match void for a group with no winner returns to a bye when the group gets a winner again', () => {
  const t = ready(12, 3);
  const km = t.knockout.rounds[0].find((m) => !!m.aFromPod !== !!m.bFromPod);
  const g = t.pods.find((x) => x.id === (km.aFromPod || km.bFromPod));
  voidIt(t, g, 0, 0); voidIt(t, g, 0, 1);
  assert.equal(km.void, true);
  const a = g.bracket.rounds[0][0], b = g.bracket.rounds[0][1];
  assert.equal(f('podsApplyResult')(t, g, () => { delete a.void; }).ok, true);
  assert.equal(f('podNoWinner')(g), false);
  assert.equal(!!km.void, false); assert.equal(km.bye, true); assert.equal(km.winnerId, null);
  playOut(app, g.bracket, () => 'a'); f('podsApplyResult')(t, g, () => {});
  assert.equal(km.bye, true); assert.equal(km.winnerId, g.winnerId); assert.ok(g.winnerId);
});

test('five groups: a bye group with no winner leaves no Finals match holding one player forever', () => {
  const t = ready(20, 5);
  const R = t.knockout.rounds;
  assert.equal(R.length, 3);
  const byes = R[0].filter((m) => !!m.aFromPod !== !!m.bFromPod);
  assert.ok(byes.length > 0);
  const km = byes[0];
  const g = t.pods.find((x) => x.id === (km.aFromPod || km.bFromPod));
  voidIt(t, g, 0, 0); voidIt(t, g, 0, 1);
  t.pods.filter((x) => x !== g).forEach((x) => playOut(app, x.bracket, () => 'a'));
  f('podsApplyResult')(t, t.pods.find((x) => x !== g), () => {});
  R[0].forEach((m) => { if(!m.bye && !m.void && m.aEntryId && m.bEntryId) play(m, 'a'); });
  f('propagateByes')(R);
  R[1].forEach((m) => {
    const players = (m.aEntryId ? 1 : 0) + (m.bEntryId ? 1 : 0);
    assert.ok(players === 2 || m.bye || m.void, 'stuck semifinal');
  });
});

test('scoring a group final that was marked void gives the group a winner again and restores the Finals bye', () => {
  const t = ready(12, 3);
  const km = t.knockout.rounds[0].find((m) => (m.aFromPod || m.bFromPod) && !(m.aFromPod && m.bFromPod));   // the Finals match on a seeded bye
  const g = t.pods.find((x) => x.id === (km.aFromPod || km.bFromPod));
  g.bracket.rounds[0].forEach((m) => { if (m.aEntryId && m.bEntryId && !m.winnerId) play(m, 'a'); });
  f('podsApplyResult')(t, g, () => {});
  const final = g.bracket.rounds[g.bracket.rounds.length - 1][0];
  assert.ok(final.aEntryId && final.bEntryId);
  assert.equal(voidIt(t, g, g.bracket.rounds.length - 1, 0).ok, true);
  assert.equal(km.void, true);                                       // the group has no winner, so its Finals match is void
  const r = f('podsApplyResult')(t, g, () => { play(final, 'a'); delete final.void; });   // what the score dialog does
  assert.equal(r.ok, true);
  assert.equal(!!km.void, false); assert.equal(km.bye, true); assert.equal(km.winnerId, final.winnerId);
  assert.equal(g.winnerId, final.winnerId);
});

test('a dead-slot bye already played past is refused when a void is reversed through the group', () => {
  const t = ready(16, 4); const p = t.pods[0], other = partnerOf(t, p);
  playOut(app, other.bracket, () => 'a'); f('podsApplyResult')(t, other, () => {});
  voidIt(t, p, 0, 0); voidIt(t, p, 0, 1);
  const km = matchOf(t, p); assert.equal(km.bye, true);
  const rest = t.pods.filter((g) => g !== p && g !== other);
  rest.forEach((g) => playOut(app, g.bracket, () => 'a')); f('podsApplyResult')(t, rest[0], () => {});
  const km2 = matchOf(t, rest[0]); play(km2, 'a'); f('propagateByes')(t.knockout.rounds);
  const fin = t.knockout.rounds[1][0];
  assert.ok(fin.aEntryId && fin.bEntryId); play(fin, 'a');
  const before = JSON.stringify(p.bracket.rounds);
  const a = p.bracket.rounds[0][0];
  const r = f('podsApplyResult')(t, p, () => { delete a.void; });
  assert.equal(r.ok, false);
  assert.equal(JSON.stringify(p.bracket.rounds), before);
  assert.equal(km.bye, true);
});

test('plain knockout: an unforced reversal of two voids leaves no stale void or bye', () => {
  const t = plainKo(8); const R = t.knockout.rounds;
  voidDirect(R[0][0]); voidDirect(R[0][1]); f('propagateByes')(R);
  assert.equal(R[1][0].void, true);
  delete R[0][0].void; delete R[0][1].void; f('propagateByes')(R);
  R.forEach((round) => round.forEach((m) => { assert.equal(!!m.void, false); assert.equal(!!m.bye, false); }));
});

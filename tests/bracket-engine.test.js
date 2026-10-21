const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, useState } = require('./lib/helpers');
const makeReference = require('./lib/bracket-reference');

/* The knockout engine (generateBracket) for round robin -> knockout qualifiers: integrity (every entry once, byes to the
   best ranks), speed, the same placement as the pre-speed-up search, and same-group entries kept apart until the last
   possible stage. Runs the real app functions. */
const app = loadApp();
const f = (n) => run(app, n);
app.persist = () => {}; app.render = () => {}; app.renderSavedList = () => {}; app.openModal = () => {};
run(app, 'currentOrganizer = { name: "S", email: "s@x.com", tier: "pro", entryLimit: null, viewerUrl: "" }');
const reference = makeReference({ seedSlotOrder: f('seedSlotOrder'), nearestBracket: f('nearestBracket'), earliestMeetingRound: f('earliestMeetingRound') });

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
// A round robin -> knockout event with groups of the given sizes (a size list, labels A, B, ...).
function event(sizes, q, opts) {
  opts = opts || {};
  const t = f('blankTournament')(); useState(app, t);
  const n = sizes.reduce((a, b) => a + b, 0);
  Object.assign(t.eventCreation, { saved: true, entries: n, competitionUnit: opts.unit || 'Singles' });
  Object.assign(t.format, { saved: true, formatType: 'rrknockout', qualifiersPerGroup: q, advanceMode: 'seeded', losersPool: !!opts.plate, plateQualifiersPerGroup: opts.plateCap || null });
  let k = 0;
  t.entriesList = []; t.groups = sizes.map((sz, gi) => {
    const ids = [];
    for (let i = 0; i < sz; i++) { const id = 'e' + String(k++).padStart(3, '0'); ids.push(id); t.entriesList.push({ id, name: 'Entry ' + k, org: opts.orgOf ? opts.orgOf(k) : '', withdrawn: false }); }
    return { id: 'g' + gi, label: String.fromCharCode(65 + (gi % 26)) + (gi >= 26 ? '2' : ''), entryIds: ids, boards: [1], confirmed: true, scores: {} };
  });
  return t;
}
// Every round-1 slot's entry id (null for an empty slot).
const slotsOf = (b) => Array.from(b.rounds[0]).flatMap((m) => [m.aEntryId, m.bEntryId]);
// Integrity: each entry exactly once, nobody plays themselves, size-n byes, and no bye goes to a worse rank than a playing entry.
function checkIntegrity(b, entries, label) {
  const slots = slotsOf(b);
  const ids = Array.from(entries, (e) => e.entryId).sort();
  assert.deepEqual(slots.filter(Boolean).sort(), ids, label + ': every entry exactly once in round 1');
  Array.from(b.rounds[0]).forEach((m, i) => assert.ok(!(m.aEntryId && m.aEntryId === m.bEntryId), label + ': match ' + i + ' plays itself'));
  const byes = Array.from(b.rounds[0]).filter((m) => m.bye);
  assert.equal(byes.length, b.size - entries.length, label + ': bye count');
  const rank = {}; entries.forEach((e) => { rank[e.entryId] = e.rank; });
  const byeRanks = byes.map((m) => rank[m.winnerId]);
  const playRanks = Array.from(b.rounds[0]).filter((m) => !m.bye).flatMap((m) => [rank[m.aEntryId], rank[m.bEntryId]]);
  if (byeRanks.length && playRanks.length) assert.ok(Math.max(...byeRanks) <= Math.min(...playRanks), label + ': a bye went to a worse rank than a playing entry');
  // every later slot is filled only by a bye winner coming through
  Array.from(b.rounds[1] || []).forEach((m, i) => {
    const feed = [b.rounds[0][2 * i], b.rounds[0][2 * i + 1]];
    assert.equal(m.aEntryId, feed[0].bye ? feed[0].winnerId : null, label + ' round 2 slot');
    assert.equal(m.bEntryId, feed[1].bye ? feed[1].winnerId : null, label + ' round 2 slot');
  });
}
function playAll(t) {
  t.groups.forEach((g) => {
    g.gameStarted = true;
    f('groupMatches')(g).forEach(([a, b]) => { const first = g.entryIds.indexOf(a) < g.entryIds.indexOf(b); f('setScore')(g, a, b, first ? 3 : 0, first ? 0 : 3); });
  });
}

test('integrity over many shapes: 1-32 groups, 1-4 qualifiers, uneven groups, with and without the Plate pool', () => {
  const r = rng(7);
  let checked = 0;
  for (const groups of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 19, 23, 24, 27, 31, 32]) {
    for (let q = 1; q <= 4; q++) {
      for (let variant = 0; variant < 2; variant++) {
        const sizes = Array.from({ length: groups }, () => (variant ? 2 + Math.floor(r() * 5) : 4));
        const t = event(sizes, q, { plate: variant === 1 });
        const main = f('projectedQualifierEntries')(t);
        if (main.length >= 2 && main.length <= 128) { checkIntegrity(f('generateBracket')(main, 'Main'), main, groups + 'x' + q + (variant ? ' uneven' : '')); checked++; }
        const plate = f('projectedNonQualifierEntries')(t);
        if (variant && plate.length >= 2 && plate.length <= 128) { checkIntegrity(f('generateBracket')(plate, 'Plate'), plate, groups + 'x' + q + ' plate'); checked++; }
      }
    }
  }
  assert.ok(checked > 200, checked + ' brackets checked');
});

test('the real draw after the round robin: 3 and 7 groups of 2 qualifiers list every entry once and give B1 its bye', () => {
  [[3, 4], [7, 4], [11, 3], [5, 4]].forEach(([groups, size]) => {
    const t = event(Array.from({ length: groups }, () => size), 2, { plate: true });
    playAll(t);
    f('generateKnockoutFromRR')();
    const q = f('collectQualifiers')(t);
    checkIntegrity(t.knockout, q, groups + ' groups (real draw)');
    if (t.knockoutLosers) checkIntegrity(t.knockoutLosers, f('collectNonQualifiers')(t), groups + ' groups Plate (real draw)');
  });
  // the reviewed case: 3 groups x 2 = 6 entries in 8 slots: the 2 byes go to A1 and B1 (it lost its bye before), B2 appears once
  const t = event([4, 4, 4], 2); playAll(t); f('generateKnockoutFromRR')();
  const lab = (id) => (id ? t.knockout.seedLabels[id] : '-');
  const r1 = Array.from(t.knockout.rounds[0], (m) => lab(m.aEntryId) + ' v ' + lab(m.bEntryId));
  assert.equal(r1.filter((p) => /B2/.test(p)).length, 1, r1.join(' | '));
  ['A1', 'B1'].forEach((x) => assert.ok(r1.includes(x + ' v -') || r1.includes('- v ' + x), x + ' has a bye: ' + r1.join(' | ')));
  assert.equal(r1.filter((p) => p.includes('-')).length, 2);
});

/* ---------- the incremental search makes exactly the same draw as the earlier, slow one ---------- */
// Random shapes small enough for the earlier search (its time grows steeply): groups of 1-8, 1-4 qualifiers, the Plate
// pool or not, some entries in organisations; the round-1 slots must be identical entry for entry.
function randomShapes(seed, count, maxEntries) {
  const r = rng(seed), out = [];
  while (out.length < count) {
    const groups = 1 + Math.floor(r() * 10), q = 1 + Math.floor(r() * 4);
    const sizes = Array.from({ length: groups }, () => 1 + Math.floor(r() * 8));
    const orgs = r() < 0.3 ? 2 + Math.floor(r() * 4) : 0;
    const plate = r() < 0.5;
    const t = event(sizes, q, { plate, orgOf: orgs ? (k) => (k % 3 ? 'Club ' + (k % orgs) : '') : null });
    // the organisation of each placeholder, as the real draw would carry it
    const withOrg = (list) => Array.from(list, (e, i) => Object.assign({}, e, { org: orgs ? ((i % 3) ? 'Club ' + (i % orgs) : '') : '' }));
    [withOrg(f('projectedQualifierEntries')(t)), plate ? withOrg(f('projectedNonQualifierEntries')(t)) : []].forEach((list) => {
      if (list.length >= 2 && list.length <= maxEntries) out.push({ label: sizes.join(',') + ' q' + q + (orgs ? ' orgs' : ''), list });
    });
  }
  return out;
}
const sameSlots = (a, b) => JSON.stringify(Array.from(a)) === JSON.stringify(Array.from(b));
// The shapes and the earlier search's slots, worked out once (the earlier search is slow) and shared by the tests below.
let SHAPES = null;
const shapes = () => SHAPES || (SHAPES = randomShapes(11, 160, 22).map((s) => Object.assign(s, { old: reference(s.list) })));
test('differential: the fast search gives the same round-1 slots as the earlier search, entry for entry (before the round 6 improvement)', () => {
  let n = 0, differ = 0;
  shapes().forEach(({ label, list, old }) => {
    const now = slotsOf(f('generateBracket')(list, 'x', { improve: false }));
    assert.ok(sameSlots(old, now), label + ': ' + JSON.stringify(old) + ' vs ' + JSON.stringify(now));
    n++;
    if (!sameSlots(old, slotsOf(f('generateBracket')(list, 'x')))) differ++;
  });
  assert.equal(n, 160);
  void differ;
});

/* ---------- same-group entries: the last possible stage (round 6 improvement) ---------- */
// For each group with k >= 2 entries in the bracket: its closest pair's meeting round, and the best possible
// (totalRounds - ceil(log2 k); the final for k = 2).
function groupSeparation(b, list) {
  const R = b.rounds.length, pos = {};
  Array.from(b.rounds[0]).forEach((m, i) => { if (m.aEntryId) pos[m.aEntryId] = 2 * i; if (m.bEntryId) pos[m.bEntryId] = 2 * i + 1; });
  const byG = {}; Array.from(list).forEach((e) => { (byG[e.groupId] = byG[e.groupId] || []).push(e); });
  const out = {};
  Object.values(byG).forEach((es) => {
    if (es.length < 2) return;
    let mn = 99;
    for (let i = 0; i < es.length; i++) for (let j = i + 1; j < es.length; j++) mn = Math.min(mn, f('earliestMeetingRound')(pos[es[i].entryId], pos[es[j].entryId]));
    out[es[0].seedLabel.replace(/\d+$/, '')] = { closest: mn, best: R - Math.ceil(Math.log2(es.length)) };
  });
  return out;
}
const shortGroups = (b, list) => Object.entries(groupSeparation(b, list)).filter(([, v]) => v.closest < v.best).map(([g]) => g);
test('where the earlier search already kept every group apart until the last possible stage, the draw is unchanged', () => {
  let ok = 0;
  shapes().forEach(({ label, list, old }) => {
    const oldBracket = f('generateBracket')(list, 'x', { improve: false });
    if (shortGroups(oldBracket, list).length) return;
    ok++;
    assert.ok(sameSlots(old, slotsOf(f('generateBracket')(list, 'x'))), label);
  });
  assert.ok(ok > 60, ok + ' shapes already at the rule');
});
test('uneven groups and 3 qualifiers: same-group entries now meet only at the last possible stage', () => {
  [[[2, 2, 1], 2], [Array(7).fill(4), 3], [[2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1], 2], [[5, 7, 4, 6], 3]].forEach(([sizes, q]) => {
    const t = event(sizes, q);
    const list = f('projectedQualifierEntries')(t);
    const before = f('generateBracket')(list, 'x', { improve: false }), after = f('generateBracket')(list, 'x');
    assert.ok(shortGroups(before, list).length > 0 || sizes.length === 4, sizes.join(',') + ': short before');
    assert.deepEqual(shortGroups(after, list), [], sizes.join(',') + ' q' + q + ': ' + JSON.stringify(groupSeparation(after, list)));
    checkIntegrity(after, list, sizes.join(','));
  });
  // (2,2,1): A1 and A2 can only meet in the final now (they met in the semi-final)
  const t = event([2, 2, 1], 2); const list = f('projectedQualifierEntries')(t);
  const sep = groupSeparation(f('generateBracket')(list, 'x'), list);
  assert.equal(sep.A.closest, 2); assert.equal(sep.B.closest, 2);
  // the real draw does the same after the round robin
  playAll(t); f('generateKnockoutFromRR')();
  assert.deepEqual(shortGroups(t.knockout, f('collectQualifiers')(t)), []);
});
test('the improvement never makes any clash pair worse (min-first), keeps the byes and adds no same-position round-1 meeting', () => {
  randomShapes(31, 120, 40).forEach(({ label, list }) => {
    const before = f('generateBracket')(list, 'x', { improve: false }), after = f('generateBracket')(list, 'x');
    checkIntegrity(after, list, label);
    const byesOf = (b) => Array.from(b.rounds[0]).filter((m) => m.bye).map((m) => m.winnerId).sort().join();
    assert.equal(byesOf(after), byesOf(before), label + ': the same entries have byes');
    const rank = {}; Array.from(list).forEach((e) => { rank[e.entryId] = e.rank; });
    const sameRank = (b) => Array.from(b.rounds[0]).filter((m) => m.aEntryId && m.bEntryId && rank[m.aEntryId] === rank[m.bEntryId]).length;
    assert.ok(sameRank(after) <= sameRank(before), label + ': same-position round-1 meetings');
    assert.ok(shortGroups(after, list).length <= shortGroups(before, list).length, label);
    // the meeting rounds of every clash pair (same group or same organisation), worst first, are never worse
    const seps = clashSeparations(before, list), sepsAfter = clashSeparations(after, list);
    assert.ok(lexCmp(sepsAfter, seps) >= 0, label + ': ' + seps.join('') + ' -> ' + sepsAfter.join(''));
    if (seps.length) assert.ok(sepsAfter[0] >= seps[0], label + ': the worst meeting round dropped');
  });
});
test('known limitation: a group pair meets earlier than the "last stage" bound when the byes leave no other way', () => {
  // groups of 1 and 5, top 2: A1 gets the only bye, so B1 and B2 are the one round-1 match (the bound says semi-final)
  const t = event([1, 5], 2); const list = f('projectedQualifierEntries')(t);
  const b = f('generateBracket')(list, 'x');
  const lab = (id) => (id ? b.seedLabels[id] : '-');
  assert.deepEqual(Array.from(b.rounds[0], (m) => lab(m.aEntryId) + ' v ' + lab(m.bEntryId)).sort(), ['A1 v -', 'B1 v B2']);
  assert.deepEqual(shortGroups(b, list), ['B']);
});

/* ---------- speed ---------- */
test('large events draw fast: 128 entries (16 groups of 8, Plate pool), 64 entries with 4 qualifiers', () => {
  [[Array(16).fill(8), 2, true], [Array(16).fill(4), 4, false], [Array(8).fill(8), 4, false], [Array(12).fill(4), 3, false]].forEach(([sizes, q, plate]) => {
    const t = event(sizes, q, { plate });
    const t0 = Date.now();
    const main = f('projectedQualifierEntries')(t); f('generateBracket')(main, 'Main');
    if (plate) f('generateBracket')(f('projectedNonQualifierEntries')(t), 'Plate');
    const ms = Date.now() - t0;
    assert.ok(ms < 3000, sizes.length + ' groups of ' + sizes[0] + ' q' + q + ': ' + ms + ' ms');
  });
});

/* ---------- round 7 ---------- */
// Every clash pair's (same group or same organisation) earliest meeting round, worst first.
function clashSeparations(b, list) {
  const pos = {};
  Array.from(b.rounds[0]).forEach((m, i) => { if (m.aEntryId) pos[m.aEntryId] = 2 * i; if (m.bEntryId) pos[m.bEntryId] = 2 * i + 1; });
  const out = [], L = Array.from(list);
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
    const a = L[i], c = L[j];
    if ((a.groupId != null && a.groupId === c.groupId) || (a.org && a.org === c.org)) out.push(f('earliestMeetingRound')(pos[a.entryId], pos[c.entryId]));
  }
  return out.sort((x, y) => x - y);
}
function lexCmp(a, b) { for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; }
const makeRound6 = require('./lib/bracket-round6');
const round6 = makeRound6({ seedSlotOrder: f('seedSlotOrder'), nearestBracket: f('nearestBracket'), earliestMeetingRound: f('earliestMeetingRound') });
// Random lists with clubs filled in (most entries in one of 1-5 clubs), small enough for the round 6 engine to finish.
function clubShapes(seed, count, maxEntries) {
  const r = rng(seed), out = [];
  while (out.length < count) {
    const groups = 1 + Math.floor(r() * 10), q = 1 + Math.floor(r() * 4), clubs = 1 + Math.floor(r() * 5);
    const sizes = Array.from({ length: groups }, () => 1 + Math.floor(r() * 8));
    const list = [];
    for (let rank = 1; rank <= q; rank++) sizes.forEach((sz, gi) => { if (sz >= rank) list.push({ entryId: 'p' + gi + '_' + rank, org: r() < 0.7 ? 'C' + Math.floor(r() * clubs) : '', groupId: 'g' + gi, rank, seedLabel: 'G' + gi + rank }); });
    if (list.length >= 2 && list.length <= maxEntries) out.push({ label: sizes.join(',') + ' q' + q + ' clubs ' + clubs, list });
  }
  return out;
}
test('with clubs filled in: the capped search draws exactly what the round 6 engine drew wherever that finished quickly', () => {
  clubShapes(41, 200, 20).forEach(({ label, list }) => {
    assert.ok(sameSlots(round6(list), slotsOf(f('generateBracket')(list, 'x'))), label);
  });
});
test('with clubs filled in, draws that used to take minutes take about a second at most (generous limits)', () => {
  const ko = (n, clubs) => Array.from({ length: n }, (_, i) => ({ entryId: 'k' + i, org: clubs ? 'Club ' + (i % clubs) : '', rank: 1 }));
  const timed = (label, list) => {
    const t0 = Date.now(); const b = f('generateBracket')(list, 'x'); const ms = Date.now() - t0;
    checkIntegrity(b, list, label);
    assert.ok(ms < 6000, label + ': ' + ms + ' ms');
  };
  timed('knockout, 64 entries, 2 clubs', ko(64, 2));
  timed('knockout, 64 entries, one club', ko(64, 1));
  timed('knockout, 128 entries, 4 clubs', ko(128, 4));
  const clubbed = (sizes, q, plate) => {
    const t = event(sizes, q, { plate });
    const lists = [f('projectedQualifierEntries')(t), plate ? f('projectedNonQualifierEntries')(t) : []];
    return lists.map((l) => Array.from(l, (e, i) => Object.assign({}, e, { org: 'Club ' + (i % 4) })));
  };
  timed('16 groups of 8, Plate pool of 96, 4 clubs', clubbed(Array(16).fill(8), 2, true)[1]);
  timed('32 groups of 4, top 4 (128), 4 clubs', clubbed(Array(32).fill(4), 4, false)[0]);
  timed('16 groups of 8, all 8 go through (128), 4 clubs', clubbed(Array(16).fill(8), 8, false)[0]);
});
test('19, 35 and 39 groups x 2 with clubs: the byes go to exactly the same seeds as without clubs (second half of the C1 fix)', () => {
  [19, 35, 39].forEach((g) => {
    const t = event(Array(g).fill(2), 2);
    const plainList = Array.from(f('projectedQualifierEntries')(t));
    const byes = (list) => Array.from(f('generateBracket')(list, 'x').rounds[0]).filter((m) => m.bye).map((m) => m.winnerId).sort().join();
    const want = byes(plainList);
    for (let s = 1; s <= 2; s++) {
      const r = rng(s * 101 + g);
      const clubbed = plainList.map((e) => Object.assign({}, e, { org: 'Club ' + Math.floor(r() * (2 + (s % 3))) }));
      assert.equal(byes(clubbed), want, g + ' groups, clubs #' + s);
    }
  });
});
test('more than 128 entries: generateBracket refuses, and the draws explain what to change (nothing is drawn)', () => {
  assert.throws(() => f('generateBracket')(Array.from({ length: 129 }, (_, i) => ({ entryId: 'x' + i, org: '' })), 'x'), /129 entries would go into one bracket, but the largest bracket holds 128./);
  const modals = []; app.openModal = (m) => modals.push(m);
  try {
    // 44 groups of 4, top 3 = 132 in the main bracket
    const a = event(Array(44).fill(4), 3); playAll(a); f('generateKnockoutFromRR')();
    assert.equal(a.knockout, null);
    assert.equal(modals.pop().body, '132 entries would go into the main bracket, but the largest bracket holds 128. Lower "Entries per group (advance to knockout)" in Format & branding.');
    // 22 groups of 8, top 2, the rest in the Plate pool = 132 in the Plate
    const b = event(Array(22).fill(8), 2, { plate: true }); playAll(b); f('generateKnockoutFromRR')();
    assert.equal(b.knockout, null); assert.ok(!b.knockoutLosers);
    assert.equal(modals.pop().body, '132 entries would go into the Plate pool, but the largest bracket holds 128. Set or lower "Plate entries per group" in Format & branding, or turn the Plate pool off.');
    // 130 groups of 2, only the winners go through: the cut-off can not go lower, so it says to use fewer groups
    const w = event(Array(130).fill(2), 1); playAll(w); f('generateKnockoutFromRR')();
    assert.equal(w.knockout, null);
    assert.equal(modals.pop().body, '130 entries would go into the main bracket, but the largest bracket holds 128. Use fewer groups (only each group winner goes through already).');
    // a pure knockout of 130
    const k = f('blankTournament')(); useState(app, k);
    Object.assign(k.format, { formatType: 'knockout' }); k.entriesList = Array.from({ length: 130 }, (_, i) => ({ id: 'k' + i, name: 'P' + i, org: '' }));
    f('regenerateKnockoutBracket')();
    assert.equal(k.knockout, null);
    assert.match(modals.pop().body, /^130 entries would go into this knockout, but the largest bracket holds 128\./);
    // Group Boards: a group is a bracket too
    assert.match(f('podsValidateCount')(300, 2).message, /A group can hold at most 128 players\. 300 players need at least 3 groups\./);
    assert.equal(f('podsValidateCount')(256, 2).ok, true);
  } finally { app.openModal = () => {}; }
});

/* ---------- round 8 ---------- */
const stats = () => JSON.parse(JSON.stringify(run(app, 'BRACKET_DRAW_STATS')));
// Groups with a same-group pair that meets before its last possible stage, by group id (any number of groups).
function groupsShort(b, list) {
  const R = b.rounds.length, pos = {};
  Array.from(b.rounds[0]).forEach((m, i) => { if (m.aEntryId) pos[m.aEntryId] = 2 * i; if (m.bEntryId) pos[m.bEntryId] = 2 * i + 1; });
  const byG = {}; Array.from(list).forEach((e) => { (byG[e.groupId] = byG[e.groupId] || []).push(e.entryId); });
  return Object.keys(byG).filter((g) => {
    const m = byG[g]; if (m.length < 2) return false;
    const best = R - Math.ceil(Math.log2(m.length));
    for (let i = 0; i < m.length; i++) for (let j = i + 1; j < m.length; j++) if (f('earliestMeetingRound')(pos[m[i]], pos[m[j]]) < best) return true;
    return false;
  });
}
// Same-organisation pairs by meeting round (index 0 = round 1).
function clubHistogram(b, list) {
  const pos = {};
  Array.from(b.rounds[0]).forEach((m, i) => { if (m.aEntryId) pos[m.aEntryId] = 2 * i; if (m.bEntryId) pos[m.bEntryId] = 2 * i + 1; });
  const h = new Array(b.rounds.length).fill(0), L = Array.from(list);
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) if (L[i].org && L[i].org === L[j].org) h[f('earliestMeetingRound')(pos[L[i].entryId], pos[L[j].entryId])]++;
  return h;
}
const rankOneList = (n, orgOf) => Array.from({ length: n }, (_, i) => ({ entryId: 'w' + i, org: orgOf(i), groupId: 'g' + i, rank: 1, seedLabel: 'G' + i + '-1' }));
test('every trial swap counts towards the cap: group winners all in one club draw in about a second, not 10 s to minutes (generous limits)', () => {
  const timed = (label, fn) => { const t0 = Date.now(); fn(); const ms = Date.now() - t0; assert.ok(ms < 4000, label + ': ' + ms + ' ms'); };
  // the real draw: 60 groups of 4, top 1, everyone in one club (11 s before)
  const a = event(Array(60).fill(4), 1, { orgOf: () => 'Club' }); playAll(a);
  timed('60 groups of 4, top 1, one club', () => f('generateKnockoutFromRR')());
  assert.equal(a.knockout.size, 64);
  checkIntegrity(a.knockout, f('collectQualifiers')(a), '60x4 top 1');
  // the same with the Plate pool capped at 1 place, 80% in one club (9 s before): two brackets
  const b = event(Array(60).fill(4), 1, { plate: true, plateCap: 1, orgOf: (k) => (k % 5 ? 'Big' : 'Other' + (k % 3)) }); playAll(b);
  timed('60 groups of 4, top 1, Plate capped at 1, 80% one club', () => f('generateKnockoutFromRR')());
  assert.equal(b.knockout.size, 64); assert.equal(b.knockoutLosers.size, 64);
  // all-same-rank lists of 117-125 (14 s to over 3 minutes before)
  [[124, () => 'C0'], [125, (i) => (i % 9 < 7 ? 'Big' : 'C' + (i % 4))], [117, (i) => 'C' + (i % 4)]].forEach(([n, orgOf]) => {
    const list = rankOneList(n, orgOf);
    let br; timed(n + ' group winners in clubs', () => { br = f('generateBracket')(list, 'x'); });
    checkIntegrity(br, list, n + ' rank 1');
  });
});
test('below the cap nothing changed: wherever the search finishes, the draw is the round 6 engine draw, entry for entry', () => {
  let compared = 0;
  clubShapes(43, 60, 32).forEach(({ label, list }) => {
    const now = slotsOf(f('generateBracket')(list, 'x'));
    if (stats().searchCapped) return;
    compared++;
    assert.ok(sameSlots(round6(list), now), label);
  });
  assert.ok(compared >= 50, compared + ' compared');
});
test('same group really comes first with whole clubs: big round-robin brackets end with no group short of its last possible stage', () => {
  [[Array(32).fill(4), 4, () => 'Club'], [Array(16).fill(8), 8, () => 'Club'], [Array(32).fill(4), 4, (k) => (k % 2 ? 'A' : 'B')], [Array(42).fill(3), 3, () => 'Club'], [Array(64).fill(2), 2, () => 'Club']].forEach(([sizes, q, orgOf]) => {
    const t = event(sizes, q);
    const list = Array.from(f('projectedQualifierEntries')(t), (e, i) => Object.assign({}, e, { org: orgOf(i) }));
    const t0 = Date.now(); const b = f('generateBracket')(list, 'x'); const ms = Date.now() - t0;
    const label = sizes.length + ' groups of ' + sizes[0] + ' top ' + q;
    checkIntegrity(b, list, label);
    assert.deepEqual(groupsShort(b, list), [], label);
    assert.equal(stats().improveCapped, false, label + ': the same-group step finished');
    assert.ok(ms < 5000, label + ': ' + ms + ' ms');
  });
});
test('at the cap the search keeps the best arrangement it has seen (pinned draws: any change to that keeping shows up here)', () => {
  /* Knockouts of 36-44 entries, about 80% in one club: the search stops at its cap. The histogram of same-club
     meetings (round 1 first) is pinned; restoring nothing, restoring the start, or keeping the worst arrangement
     seen all give a different (worse) one. */
  [[36, 1, [4, 14, 30, 60, 121, 246]], [40, 5, [5, 12, 33, 66, 136, 272]], [44, 6, [8, 11, 34, 71, 141, 278]]].forEach(([n, seed, want]) => {
    const r = rng(seed);
    const list = Array.from({ length: n }, (_, i) => ({ entryId: 'k' + i, org: r() < 0.8 ? 'A' : 'B', rank: 1 }));
    const b = f('generateBracket')(list, 'x');
    assert.equal(stats().searchCapped, true, n + ': the cap is reached');
    checkIntegrity(b, list, 'ko ' + n);
    assert.deepEqual(clubHistogram(b, list), want, 'ko ' + n + ' seed ' + seed);
    // never worse than where the search started (the seeding alone, as drawn without organisations)
    const start = f('generateBracket')(list.map((e) => Object.assign({}, e, { org: '' })), 'x');
    assert.ok(lexCmp(clubHistogram(b, list), clubHistogram(start, list)) <= 0, 'ko ' + n + ': not worse than the start');
  });
});
test('exactly 128 entries is drawn: a pure knockout and a round robin of 64 groups x 2, top 2', () => {
  const k = f('blankTournament')(); useState(app, k);
  Object.assign(k.format, { formatType: 'knockout' }); k.entriesList = Array.from({ length: 128 }, (_, i) => ({ id: 'k' + i, name: 'P' + i, org: '' }));
  app.openModal = (m) => { if (m.onConfirm) m.onConfirm(); };   // confirm the Generate pop-up, if one asks
  try { f('regenerateKnockoutBracket')(); } finally { app.openModal = () => {}; }
  assert.ok(k.knockout, 'drawn');
  assert.equal(k.knockout.size, 128);
  assert.equal(Array.from(k.knockout.rounds[0]).flatMap((m) => [m.aEntryId, m.bEntryId]).filter(Boolean).length, 128);
  const t = event(Array(64).fill(2), 2); playAll(t); f('generateKnockoutFromRR')();
  assert.equal(t.knockout.size, 128);
  checkIntegrity(t.knockout, f('collectQualifiers')(t), '64x2 top 2');
});

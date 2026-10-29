const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, plain, useState, seededRng, playOut, fillEntries } = require('./lib/helpers');
const { toPublicView } = require('../viewer/api/_lib/publicView');

/* Release 1 ("Make it true"): D1 correcting a knockout result clears every later match the old winner reached (and asks
   first), D2 Withdraw is refused once play has begun (Mark no-show instead), D3 Clear result. These drive the real
   handlers from app.html in the vm: the score dialogs' onConfirm / onSecondary, withdrawEntry, the no-show flows. */
const app = loadApp();
const f = (n) => run(app, n);
const DOC = app.document;
let modals, persists, inputs;
function reset() {
  modals = []; persists = 0; inputs = {};
  app.openModal = (m) => { modals.push(m); };
  app.persist = () => { persists++; };
  app.render = () => {}; app.renderSavedList = () => {}; app.setSaveStatus = () => {};
  app.document = DOC;
  app.__org = { name: 'Sam', email: 's@x.com', tier: 'pro', entryLimit: null, viewerUrl: 'https://live.example.com' };
  run(app, 'currentOrganizer = __org; lockedIds.clear(); popoutMode = false; popoutSection = "knockout"; currentStage = 5');
}
// The score boxes the dialogs read (#scA / #scB, #withdrawReplacement).
function typed(values, fn) {
  inputs = values;
  app.document = { getElementById: (id) => ({ value: inputs[id] !== undefined ? String(inputs[id]) : '', classList: { add() {}, remove() {} }, style: {} }), createElement: DOC.createElement, body: DOC.body };
  try { return fn(); } finally { app.document = DOC; }
}
const last = () => modals[modals.length - 1];
const text = (h) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&ndash;|–/g, '-').replace(/&rsquo;/g, "'").replace(/&hellip;/g, '...').replace(/\s+/g, ' ').trim();
// Opens the knockout score dialog and presses Save score with legs a-b. Returns what onConfirm returned.
function save(key, ri, mi, a, b) {
  f('koMatchScoreModal')(key, ri, mi);
  const dlg = modals.pop();
  return typed({ scA: a, scB: b }, () => dlg.onConfirm());
}
function koEvent(n, opts) {
  opts = opts || {};
  const t = f('blankTournament')(); useState(app, t);
  t.id = 't_r1_ko' + n;
  Object.assign(t.eventCreation, { saved: true, entries: n, competitionUnit: opts.unit || 'Singles' });
  Object.assign(t.format, { saved: true, formatType: 'knockout', bestOfLegs: 5 });
  t.entriesList = Array.from({ length: n }, (_, i) => ({ id: 'e' + String(i).padStart(2, '0'), name: 'Name' + String.fromCharCode(65 + (i % 26)) + (i >= 26 ? 'x' : ''), org: '', withdrawn: false }));
  app.__o = t.entriesList.map((e) => ({ entryId: e.id, org: '' }));
  t.knockout = run(app, 'generateBracket(__o, "Bracket")');
  return t;
}
const nameOf = (t, id) => (t.entriesList.find((e) => e.id === id) || {}).name;
const champion = (b) => f('bracketChampion')(b);
// Where an entry still appears after a given round: [{r, i, scored}]
function appearsAfter(b, id, r0) {
  const out = [];
  for (let r = r0 + 1; r < b.rounds.length; r++) b.rounds[r].forEach((m, i) => { if (m.aEntryId === id || m.bEntryId === id) out.push({ r, i, scored: m.aLegs != null }); });
  return out;
}
// The full path (round by round) an entry took through the bracket: the matches it is in.
const pathOf = (b, id) => b.rounds.map((round) => round.findIndex((m) => m.aEntryId === id || m.bEntryId === id));

/* ======================= D1: the knockout cascade ======================= */

test('D1 16 entries: correcting R1 match 1 asks first, then clears every later match the old winner reached and the champion', () => {
  reset(); const t = koEvent(16); const b = t.knockout;
  playOut(app, b, () => 'a');
  const m = b.rounds[0][0], oldW = m.winnerId, newW = m.bEntryId;
  assert.equal(champion(b), oldW);
  const before = plain(b.rounds);
  persists = 0;
  const r = save('knockout', 0, 0, 1, 3);
  assert.deepEqual(plain(r), { keepOpen: true }, 'the score box stays open for the question');
  assert.deepEqual(plain(b.rounds), before, 'nothing changes before the organiser answers');
  assert.equal(persists, 0);
  const q = last();
  assert.equal(q.title, 'This changes who goes through');
  assert.equal(q.confirmLabel, 'Change result');
  assert.equal(q.confirmClass, 'danger');
  const body = text(q.bodyHTML);
  assert.match(body, /^Changing this result will clear 3 later results, and you will need to enter them again:/);
  assert.match(body, /Quarterfinal 2-1: NameA 3-1 NameH/);
  assert.match(body, /Semifinal 3-1: NameA 3-1 NameD/);
  assert.match(body, /Final 4-1: NameA 3-1 NameB/);
  assert.match(body, /The champion \(NameA\) will be cleared too\. Continue\?$/);
  q.onConfirm();
  assert.equal(persists, 1);
  assert.equal(m.winnerId, newW); assert.equal(m.aLegs, 1); assert.equal(m.bLegs, 3);
  assert.deepEqual(appearsAfter(b, oldW, 0), [], 'the eliminated entry is in no later round');
  assert.equal(b.rounds[1][0].aEntryId, newW, 'the new winner moves on');
  assert.equal(b.rounds[1][0].winnerId, null); assert.equal(b.rounds[1][0].aLegs, null);
  assert.equal(b.rounds[2][0].aEntryId, null); assert.equal(b.rounds[2][0].winnerId, null); assert.equal(b.rounds[2][0].aLegs, null);
  assert.equal(b.rounds[3][0].aEntryId, null); assert.equal(b.rounds[3][0].winnerId, null);
  assert.equal(champion(b), null, 'no champion until the final is played again');
  // matches that did not depend on it are untouched
  assert.deepEqual(plain(b.rounds[1][1]), before[1][1]);
  assert.deepEqual(plain(b.rounds[2][1]), before[2][1]);
  assert.deepEqual(plain(b.rounds[0].slice(1)), before[0].slice(1));
});

test('D1 Cancel (the question is simply closed) leaves the bracket and the save untouched', () => {
  reset(); const t = koEvent(16); const b = t.knockout;
  playOut(app, b, () => 'a');
  const before = plain(b.rounds); persists = 0;
  save('knockout', 0, 3, 1, 3);
  assert.equal(last().title, 'This changes who goes through');
  // Cancel = closeModal(): onConfirm never runs.
  assert.deepEqual(plain(b.rounds), before);
  assert.equal(persists, 0);
});

test('D1 a score-only correction (same winner) asks nothing and leaves every later round as it was', () => {
  reset(); const t = koEvent(16); const b = t.knockout;
  playOut(app, b, () => 'a');
  const before = plain(b.rounds);
  const r = save('knockout', 0, 0, 3, 2);
  assert.equal(r, undefined, 'saved straight away');
  assert.equal(modals.length, 0, 'no question');
  assert.equal(b.rounds[0][0].bLegs, 2);
  assert.deepEqual(plain(b.rounds.slice(1)), before.slice(1));
  assert.equal(champion(b), before[3][0].winnerId);
});

test('D1 no later result to lose: a first result, or a change before the next match is played, saves without a question', () => {
  reset(); const t = koEvent(8); const b = t.knockout;
  assert.equal(save('knockout', 0, 0, 3, 0), undefined);
  assert.equal(b.rounds[1][0].aEntryId, b.rounds[0][0].aEntryId);
  assert.equal(save('knockout', 0, 0, 0, 3), undefined, 'the next match has no result yet');
  assert.equal(modals.length, 0);
  assert.equal(b.rounds[1][0].aEntryId, b.rounds[0][0].bEntryId, 'the slot follows the new winner');
});

test('D1 20 entries (byes): correcting a played match next to a bye clears the old winner everywhere; the byes stay', () => {
  reset(); const t = koEvent(20); const b = t.knockout;
  assert.equal(b.size, 32);
  const byes = plain(b.rounds[0].map((m, i) => (m.bye ? { i, w: m.winnerId } : null)).filter(Boolean));
  assert.equal(byes.length, 12);
  playOut(app, b, () => 'b');
  const champ = champion(b); assert.ok(champ);
  // the R1 match whose winner became champion
  const p = pathOf(b, champ);
  const firstReal = p.findIndex((mi, ri) => mi >= 0 && !b.rounds[ri][mi].bye);
  const ri = firstReal, mi = p[ri];
  const mm = b.rounds[ri][mi]; const oldW = mm.winnerId; assert.equal(oldW, champ);
  const loser = mm.aEntryId === oldW ? mm.bEntryId : mm.aEntryId;
  const res = save('knockout', ri, mi, mm.aEntryId === oldW ? 1 : 3, mm.aEntryId === oldW ? 3 : 1);
  assert.deepEqual(plain(res), { keepOpen: true });
  const n = b.rounds.length - 1 - ri;
  assert.match(text(last().bodyHTML), new RegExp('will clear ' + n + ' later result'));
  assert.match(text(last().bodyHTML), /The champion \(.+\) will be cleared too/);
  last().onConfirm();
  assert.deepEqual(appearsAfter(b, oldW, ri), []);
  assert.equal(b.rounds[ri + 1][Math.floor(mi / 2)][mi % 2 === 0 ? 'aEntryId' : 'bEntryId'], loser);
  assert.equal(champion(b), null);
  byes.forEach(({ i, w }) => { assert.equal(b.rounds[0][i].bye, true); assert.equal(b.rounds[0][i].winnerId, w); });
  // every bye winner still sits in round 2 unless the change itself was its own next match
  byes.forEach(({ i, w }) => { const nm = b.rounds[1][Math.floor(i / 2)]; assert.equal(nm[i % 2 === 0 ? 'aEntryId' : 'bEntryId'], w); });
});

test('D1 20 entries: correcting a round-2 match that a bye entry won also cascades to the final', () => {
  reset(); const t = koEvent(20); const b = t.knockout;
  playOut(app, b, () => 'a');
  const champ = champion(b);
  const p = pathOf(b, champ);
  assert.ok(b.rounds[0][p[0]].bye, 'the top seed has a bye in round 1');
  const m = b.rounds[1][p[1]];
  save('knockout', 1, p[1], m.aEntryId === champ ? 0 : 3, m.aEntryId === champ ? 3 : 0);
  last().onConfirm();
  assert.deepEqual(appearsAfter(b, champ, 1), []);
  assert.equal(champion(b), null);
});

test('D1 every later round is reset transitively, not only the next match (8 entries, flip R1 match 3)', () => {
  reset(); const t = koEvent(8); const b = t.knockout;
  playOut(app, b, () => 'a');
  const oldW = b.rounds[0][2].winnerId;
  save('knockout', 0, 2, 1, 3); last().onConfirm();
  assert.deepEqual(appearsAfter(b, oldW, 0), []);
  b.rounds.slice(1).forEach((round) => round.forEach((m) => { if (m.aEntryId === null || m.bEntryId === null) { assert.equal(m.winnerId, null); assert.equal(m.aLegs, null); } }));
});

test('D1 Round robin -> Knockout: the main bracket and the Plate pool cascade, each on its own', () => {
  reset(); const t = rrkoEvent({ plate: true }); f('generateKnockoutFromRR')();
  assert.ok(t.knockout && t.knockoutLosers);
  playOut(app, t.knockout, () => 'a'); playOut(app, t.knockoutLosers, () => 'a');
  const mainBefore = plain(t.knockout.rounds);
  const L = t.knockoutLosers; const oldW = L.rounds[0][0].winnerId;
  assert.equal(champion(L), oldW);
  assert.deepEqual(plain(save('knockoutLosers', 0, 0, 1, 3)), { keepOpen: true });
  assert.match(text(last().bodyHTML), /Final P3-1: /, 'Plate matches carry the P prefix');
  last().onConfirm();
  assert.deepEqual(appearsAfter(L, oldW, 0), []);
  assert.equal(champion(L), null);
  assert.deepEqual(plain(t.knockout.rounds), mainBefore, 'the main bracket is untouched');
  // and the main bracket itself
  const M = t.knockout; const mw = M.rounds[0][1].winnerId;
  save('knockout', 0, 1, 1, 3); last().onConfirm();
  assert.deepEqual(appearsAfter(M, mw, 0), []);
});

test('D1 Teams knockout: a corrected total that changes the winning team clears the later rounds', () => {
  reset(); const t = teamsKo(8);
  const b = t.knockout;
  b.rounds.forEach((round) => round.forEach((m, mi) => {
    if (m.aEntryId && m.bEntryId && !m.winnerId) { assert.equal(save('knockout', b.rounds.indexOf(round), mi, 6, 4), undefined); }
  }));
  const oldW = b.rounds[0][0].winnerId; assert.equal(champion(b), oldW);
  assert.deepEqual(plain(save('knockout', 0, 0, 4, 6)), { keepOpen: true });
  assert.match(text(last().bodyHTML), /will clear 2 later results/);
  last().onConfirm();
  assert.deepEqual(appearsAfter(b, oldW, 0), []);
  assert.equal(champion(b), null);
  // a total that keeps the same winner changes nothing later
  const before = plain(b.rounds.slice(1));
  assert.equal(save('knockout', 0, 1, 7, 2), undefined);
  assert.deepEqual(plain(b.rounds.slice(1)), before);
});

test('D1 the full-page (popout) window uses the same handler: its chart calls koMatchScoreModal and the cascade applies there', () => {
  reset(); const t = koEvent(16); const b = t.knockout;
  run(app, 'popoutMode = true; popoutSection = "knockout"');
  try {
    const chart = f('mirroredChartHTML')(b, t, { interactive: true, bracketKey: 'knockout' });
    assert.match(chart, /koMatchScoreModal\('knockout',0,0\)/);
    playOut(app, b, () => 'a');
    const oldW = b.rounds[0][0].winnerId;
    save('knockout', 0, 0, 1, 3);
    assert.equal(last().title, 'This changes who goes through');
    last().onConfirm();
    assert.deepEqual(appearsAfter(b, oldW, 0), []);
    assert.equal(champion(b), null);
    const after = f('mirroredChartHTML')(b, t, { interactive: true, bracketKey: 'knockout' });
    assert.doesNotMatch(after, /Champion:/);
  } finally { run(app, 'popoutMode = false'); }
});

test('D1 walkover path: a match won by a no-show walkover, corrected later, cascades the same way', () => {
  reset(); const t = koEvent(8); const b = t.knockout;
  f('markKnockoutNoShow')('knockout', 0, 0, 'a');      // NameA did not show: the other side goes through by WO
  const woW = b.rounds[0][0].winnerId; assert.equal(woW, b.rounds[0][0].bEntryId); assert.equal(b.rounds[0][0].wo, true);
  assert.equal(b.rounds[1][0].aEntryId, woW);
  playOut(app, b, () => 'a');
  assert.equal(champion(b), woW);
  // NameA turned up after all: enter the real result
  save('knockout', 0, 0, 3, 1);
  assert.match(text(last().bodyHTML), /will clear 2 later results/);
  last().onConfirm();
  assert.equal(b.rounds[0][0].wo, false);
  assert.deepEqual(appearsAfter(b, woW, 0), []);
  assert.equal(champion(b), null);
});

test('D1 neither showed, then Reverse it: the bye it gave goes, the later results it allowed are cleared after a question', () => {
  reset(); const t = koEvent(8); const b = t.knockout;
  f('markKnockoutVoid')('knockout', 0, 0);
  playOut(app, b, () => 'b');
  const byeW = b.rounds[1][0].winnerId; assert.equal(b.rounds[1][0].bye, true);
  assert.ok(appearsAfter(b, byeW, 1).some((x) => x.scored), 'the bye winner has since played');
  f('reverseKnockoutVoid')('knockout', 0, 0);
  const q = last();
  assert.equal(q.confirmLabel, 'Reverse it');
  assert.match(text(q.bodyHTML), /^Reversing this result will clear/);
  assert.equal(b.rounds[0][0].void, true, 'nothing changes before the answer');
  q.onConfirm();
  assert.equal(b.rounds[0][0].void, undefined);
  assert.equal(b.rounds[1][0].bye, false); assert.equal(b.rounds[1][0].winnerId, null);
  assert.deepEqual(appearsAfter(b, byeW, 1), []);
  assert.equal(champion(b), null);
});

test('D1 a later "neither showed" counts as a result too: it is listed (and cleared) when an earlier change removes a player from it', () => {
  reset(); const t = koEvent(8); const b = t.knockout;
  save('knockout', 0, 0, 3, 0); save('knockout', 0, 1, 3, 0);
  f('markKnockoutVoid')('knockout', 1, 0);                 // both semifinalists missing
  assert.equal(b.rounds[1][0].void, true);
  const r = save('knockout', 0, 0, 0, 3);                  // the first quarterfinal had the wrong winner
  assert.deepEqual(plain(r), { keepOpen: true });
  assert.match(text(last().bodyHTML), /will clear 1 later result, and you will need to enter it again: Semifinal 2-1: NameA v Name[A-Z] \(neither attended\)/);
  last().onConfirm();
  assert.equal(b.rounds[1][0].void, undefined);
  assert.equal(b.rounds[1][0].aEntryId, b.rounds[0][0].bEntryId);
});

test('D1 a cleared later round that has no result left gets its Start round stamp back; a round still in play keeps it', () => {
  reset(); const t = koEvent(8); const b = t.knockout;
  playOut(app, b, () => 'a');
  b.roundStartedAt = [1000, 2000, 3000];
  save('knockout', 0, 0, 1, 3); last().onConfirm();
  assert.equal(b.roundStartedAt[1], 2000, 'the semifinals still have a result (the other semi)');
  assert.equal(b.roundStartedAt[2], null, 'the final has no result and its semis are not decided');
  assert.equal(b.roundStartedAt[0], 1000);
});

test('D1 Group Boards Finals (a plain knockout bracket) cascades and asks; a Group Boards group keeps its own cascade, no question', () => {
  reset(); const t = podsEvent(16, 4);
  t.pods.forEach((p) => playOut(app, p.bracket, () => 'a'));
  f('syncFinalsFromPods')(t);
  const fin = t.knockout; assert.ok(fin);
  playOut(app, fin, () => 'a');
  const fw = fin.rounds[0][0].winnerId;
  save('knockout', 0, 0, 1, 3);
  assert.equal(last().title, 'This changes who goes through');
  last().onConfirm();
  assert.deepEqual(appearsAfter(fin, fw, 0), []);
  assert.equal(champion(fin), null);
  // inside a group: a winner change clears later matches in the group straight away, as before (Finals not yet scored here)
  reset(); const t2 = podsEvent(16, 2); const p = t2.pods[0]; const key = 'pod:' + p.id;
  playOut(app, p.bracket, () => 'a');
  const gw = p.bracket.rounds[0][0].winnerId;
  assert.equal(save(key, 0, 0, 1, 3), undefined);
  assert.equal(modals.length, 0);
  assert.deepEqual(appearsAfter(p.bracket, gw, 0), []);
});

test('D1 finalized events stay locked: no score box opens, and a change in flight is refused', () => {
  reset(); const t = koEvent(8); const b = t.knockout;
  playOut(app, b, () => 'a');
  const before = plain(b.rounds);
  // a question already on screen when the event gets finalized elsewhere
  save('knockout', 0, 0, 1, 3);
  const q = last();
  t.finalized = { at: '2026-10-23T10:00:00.000Z' };
  assert.match(q.onConfirm().error, /finalized/);
  modals = [];
  f('koMatchScoreModal')('knockout', 0, 0);
  assert.equal(modals.length, 1); assert.equal(modals[0].title, 'Event is finalized');
  modals = [];
  assert.match(f('koClearResult')('knockout', 0, 0).error, /finalized/);
  f('markKnockoutNoShow')('knockout', 0, 1, 'a'); f('markKnockoutVoid')('knockout', 0, 1); f('reverseKnockoutVoid')('knockout', 0, 1);
  assert.deepEqual(plain(b.rounds), before);
  assert.equal(persists, 0);
});

test('D1 the public view and the printed bracket show the cleared state', () => {
  reset(); const t = koEvent(16); const b = t.knockout;
  t.eventCreation.tournamentName = 'Open'; t.published = true; t.publicSlug = 'abcdefgh1234';
  const count = (s, w) => s.split(w).length - 1;
  const blank = f('knockoutBracketSheetHTML')(b);   // each entry once, in its round-1 box
  playOut(app, b, () => 'a');
  const oldW = b.rounds[0][0].winnerId, oldName = nameOf(t, oldW);
  const sheetBefore = f('knockoutBracketSheetHTML')(b);
  save('knockout', 0, 0, 1, 3); last().onConfirm();
  const pv = toPublicView(plain(t));
  pv.knockout.rounds.slice(1).forEach((round) => round.forEach((m) => { assert.notEqual(m.aEntryId, oldW); assert.notEqual(m.bEntryId, oldW); assert.notEqual(m.winnerId, oldW); }));
  assert.equal(pv.knockout.rounds[3][0].winnerId, null);
  const sheetAfter = f('knockoutBracketSheetHTML')(b);
  assert.ok(count(sheetBefore, oldName) > count(sheetAfter, oldName), 'fewer appearances on paper');
  assert.equal(count(sheetAfter, oldName), count(blank, oldName), 'only its round-1 box is left');
});

/* ======================= D2: Withdraw after the start ======================= */

function rrkoEvent(opts) {
  opts = opts || {};
  const t = f('blankTournament')(); useState(app, t);
  t.id = 't_r1_rrko';
  Object.assign(t.eventCreation, { saved: true, entries: 16, competitionUnit: opts.unit || 'Singles' });
  Object.assign(t.format, { saved: true, formatType: opts.rrOnly ? 'roundrobin' : 'rrknockout', qualifiersPerGroup: 2, advanceMode: 'seeded', bestOfLegs: 5, losersPool: !!opts.plate });
  let k = 0; t.entriesList = [];
  t.groups = [0, 1, 2, 3].map((gi) => {
    const ids = [];
    for (let i = 0; i < 4; i++) { const id = 'r' + String(k++).padStart(2, '0'); ids.push(id); t.entriesList.push({ id, name: 'Rr' + String.fromCharCode(65 + gi) + (i + 1), org: '', withdrawn: false }); }
    return { id: 'g' + gi, label: String.fromCharCode(65 + gi), entryIds: ids, boards: [gi + 1], confirmed: true, confirmedEntryIds: ids.slice(), scores: {}, gameStarted: !opts.notStarted };
  });
  if (!opts.notStarted && !opts.unplayed) t.groups.forEach(playGroup);
  return t;
}
function playGroup(g) {
  f('groupMatches')(g).forEach(([x, y]) => { const first = g.entryIds.indexOf(x) < g.entryIds.indexOf(y); f('setScore')(g, x, y, first ? 3 : 0, first ? 0 : 3); });
}
function teamsKo(n) {
  const t = f('blankTournament')(); useState(app, t);
  t.id = 't_r1_teams';
  Object.assign(t.eventCreation, { saved: true, competitionUnit: 'Teams', entries: n, boards: 4 });
  Object.assign(t.format, { saved: true, formatType: 'knockout' });
  fillEntries(app, t);
  t.entriesList.forEach((e, i) => { e.name = 'Team ' + String.fromCharCode(65 + i); e.autoName = false; e.checkedIn = true; });
  f('regenerateKnockoutBracket')();
  return t;
}
function podsEvent(n, pods) {
  const t = f('blankTournament')(); useState(app, t);
  t.id = 't_r1_pods';
  Object.assign(t.eventCreation, { saved: true, entries: n, boards: 64 });
  Object.assign(t.format, { saved: true, formatType: 'podknockout', podCount: pods, bestOfLegs: 5 });
  t.entriesList = Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'Pod' + i, org: '', withdrawn: false, checkedIn: true }));
  f('generatePods')(t, seededRng(7)); f('podsConfirmAll')(t);
  return t;
}

test('D2 before the games start, Withdraw works as today (replacement or bye)', () => {
  reset(); const t = rrkoEvent({ notStarted: true }); const g = t.groups[0]; const victim = g.entryIds[0];
  f('withdrawEntry')(victim);
  assert.equal(last().title, 'Withdraw RrA1?'); assert.equal(last().confirmLabel, 'Withdraw');
  typed({ withdrawReplacement: 'Sub' }, () => last().onConfirm());
  assert.equal(g.entryIds.includes(victim), false);
  assert.equal(t.entriesList.find((e) => e.id === victim).withdrawn, true);
  assert.ok(g.entryIds.some((id) => nameOf(t, id) === 'Sub'));
  // and the step 3 list offers the button
  const html = f('flatEntriesRowsHTML')(f('flatEntriesData')());
  assert.match(html, />Withdraw<\/button>/);
});

test('D2 after the group has started (no results yet): Withdraw is refused and Mark no-show instead fills walkovers', () => {
  reset(); const t = rrkoEvent({ unplayed: true }); const g = t.groups[1]; const victim = g.entryIds[2];
  f('withdrawEntry')(victim);
  const d = last();
  assert.equal(d.title, 'Games have started in Group B');
  assert.equal(d.confirmLabel, 'Mark no-show instead');
  assert.match(text(d.bodyHTML), /Withdrawing now would remove RrB3's played results from Group B and change the table\./);
  assert.match(text(d.bodyHTML), /use Mark no-show instead: RrB3's 3 remaining matches become walkover losses, so the opponents get the points\./);
  assert.equal(g.entryIds.includes(victim), true, 'nothing happens until the button');
  d.onConfirm();
  assert.equal(g.entryIds.includes(victim), true, 'still in the group');
  assert.equal(g.confirmed, true, 'the group stays confirmed');
  assert.equal(t.entriesList.find((e) => e.id === victim).noShow, true);
  const wo = f('groupMatches')(g).filter(([a, b]) => a === victim || b === victim).map(([a, b]) => f('getScore')(g, a, b));
  assert.equal(wo.length, 3); wo.forEach((s) => assert.equal(s.wo, true));
});

test('D2 after some results: the played results stay, only the unplayed ones become walkovers', () => {
  reset(); const t = rrkoEvent({ unplayed: true }); const g = t.groups[0]; const [v, o1] = g.entryIds;
  f('setScore')(g, v, o1, 3, 1);
  f('withdrawEntry')(v);
  assert.match(text(last().bodyHTML), /2 remaining matches/);
  last().onConfirm();
  const s = f('getScore')(g, v, o1); assert.equal(s.wo, undefined);
});

test('D2 the step 3 lists show no Withdraw once the group has started; they offer Mark no-show... (which explains) instead', () => {
  reset(); const t = rrkoEvent({ unplayed: true });
  const flat = f('flatEntriesRowsHTML')(f('flatEntriesData')());
  assert.doesNotMatch(flat, />Withdraw<\/button>/);
  assert.match(flat, /Mark no-show&hellip;<\/button>/);
  const grouped = f('groupedEntriesHTML')();
  assert.doesNotMatch(grouped, />Withdraw<\/button>/);
  // once marked, a tag instead of a button
  t.entriesList[0].noShow = true;
  assert.match(f('flatEntriesRowsHTML')(f('flatEntriesData')()), /No-show<\/span>/);
});

test('D2 knockout drawn from the round robin: Withdraw is refused and Mark no-show instead gives the opponent a walkover', () => {
  reset(); const t = rrkoEvent(); f('generateKnockoutFromRR')();
  const m = t.knockout.rounds[0].find((x) => x.aEntryId && x.bEntryId);
  const victim = m.aEntryId, opp = m.bEntryId, g = t.groups.find((x) => x.entryIds.includes(victim));
  const scores = plain(g.scores);
  f('withdrawEntry')(victim);
  const d = last();
  assert.equal(d.title, 'The knockout has been drawn');
  assert.equal(d.confirmLabel, 'Mark no-show instead');
  assert.match(text(d.bodyHTML), new RegExp(nameOf(t, victim) + ' loses Quarterfinal 1-\\d by a walkover, and ' + nameOf(t, opp) + ' goes through'));
  d.onConfirm();
  assert.equal(m.winnerId, opp); assert.equal(m.wo, true);
  assert.equal(t.knockout.rounds[1][Math.floor(t.knockout.rounds[0].indexOf(m) / 2)][t.knockout.rounds[0].indexOf(m) % 2 === 0 ? 'aEntryId' : 'bEntryId'], opp);
  assert.deepEqual(plain(g.scores), scores, 'the group results are untouched');
  assert.equal(g.entryIds.includes(victim), true);
});

test('D2 knockout drawn, entry did not qualify: refused, nothing left to mark (every group match played)', () => {
  reset(); const t = rrkoEvent(); f('generateKnockoutFromRR')();
  const g = t.groups[0]; const out = g.entryIds[3];
  assert.equal(f('bracketHoldsEntry')(t.knockout, out), false);
  f('withdrawEntry')(out);
  assert.equal(last().title, 'Games have started in Group A');
  assert.equal(last().confirmLabel, 'OK');
  assert.match(text(last().bodyHTML), /has played every match in the group, so there is nothing to mark/);
  last().onConfirm();
  assert.equal(g.entryIds.includes(out), true);
  assert.equal(f('withdrawButtonHTML')(t.entriesList.find((e) => e.id === out)), '', 'no button at all');
});

test('D2 knockout entry waiting for an opponent: refused, and told to use Mark no-show... on that match when it is ready', () => {
  reset(); const t = koEvent(8); const b = t.knockout;
  save('knockout', 0, 0, 3, 0);
  const w = b.rounds[0][0].winnerId;
  f('withdrawEntry')(w);
  assert.equal(last().title, 'The knockout has been drawn');
  assert.equal(last().confirmLabel, 'OK');
  assert.match(text(last().bodyHTML), /next match \(Semifinal 2-1\) has no opponent yet\. When it has, click Mark no-show\.\.\. on that match/);
});

test('D2 Teams and Doubles round robins follow the same rule', () => {
  ['Teams', 'Doubles'].forEach((unit) => {
    reset(); const t = rrkoEvent({ unit, rrOnly: true, unplayed: true });
    f('withdrawEntry')(t.groups[0].entryIds[0]);
    assert.equal(last().title, 'Games have started in Group A', unit);
    assert.equal(last().confirmLabel, 'Mark no-show instead', unit);
  });
});

test('D2 Group Boards: once the groups are drawn, Withdraw is refused (Mark no-show on the match instead)', () => {
  reset(); const t = podsEvent(8, 2); const p = t.pods[0];
  const m = p.bracket.rounds[0].find((x) => x.aEntryId && x.bEntryId);
  f('withdrawEntry')(m.aEntryId);
  assert.equal(last().title, 'The groups have been drawn');
  assert.equal(last().confirmLabel, 'Mark no-show instead');
  assert.equal(t.entriesList.find((e) => e.id === m.aEntryId).withdrawn, false);
});

test('D2 Withdraw is refused on a finalized event', () => {
  reset(); const t = rrkoEvent({ notStarted: true }); t.finalized = { at: '2026-10-23T10:00:00.000Z' };
  f('withdrawEntry')(t.groups[0].entryIds[0]);
  assert.equal(last().title, 'Event is finalized');
  assert.equal(t.entriesList[0].withdrawn, false);
});

/* ======================= D3: Clear result ======================= */

test('D3 round robin: Clear result asks, then the match goes back to not played and the standings are recomputed', () => {
  reset(); const t = rrkoEvent({ rrOnly: true, unplayed: true }); const g = t.groups[0]; const [a, b] = g.entryIds;
  f('promptScore')(g.id, a, b, 'RrA1', 'RrA2');
  assert.equal(modals.pop().secondaryLabel, '', 'nothing to clear on an unplayed match');
  f('setScore')(g, a, b, 3, 1);
  const st0 = f('computeStandings')(g).find((s) => s.id === a);
  f('promptScore')(g.id, a, b, 'RrA1', 'RrA2');
  const dlg = modals.pop();
  assert.equal(dlg.secondaryLabel, 'Clear result');
  assert.deepEqual(plain(dlg.onSecondary()), { keepOpen: true });
  const q = last();
  assert.equal(q.title, 'Clear this result?'); assert.equal(q.confirmLabel, 'Clear result');
  assert.match(text(q.bodyHTML), /RrA1 v RrA2 \(3-1\) goes back to not played\. The Group A standings are worked out again\./);
  assert.ok(f('getScore')(g, a, b), 'not cleared before the answer');
  persists = 0; q.onConfirm();
  assert.ok(!f('getScore')(g, a, b));
  assert.equal(persists, 1);
  const st1 = f('computeStandings')(g).find((s) => s.id === a);
  assert.ok(JSON.stringify(plain(st1)) !== JSON.stringify(plain(st0)), 'the standings changed');
  const pv = toPublicView(plain(t));
  assert.equal(pv.groups[0].scores[f('scoreKey')(a, b)], undefined, 'the public view has no result for it');
});

test('D3 round robin -> knockout: after the knockout is drawn, Clear result is refused with the reason (Save score still works)', () => {
  reset(); const t = rrkoEvent(); f('generateKnockoutFromRR')();
  const g = t.groups[0]; const [a, b] = g.entryIds;
  f('promptScore')(g.id, a, b, 'RrA1', 'RrA2');
  const dlg = modals.pop();
  const r = dlg.onSecondary();
  assert.match(r.error, /^The knockout has already been drawn from the group standings, so a result in Group A can no longer be cleared/);
  assert.match(r.error, /Regenerate from current standings/);
  assert.ok(f('getScore')(g, a, b));
  assert.equal(typed({ scA: 3, scB: 2 }, () => dlg.onConfirm()), undefined, 'a corrected score is still accepted');
  // before the draw, clearing is allowed
  reset(); const t2 = rrkoEvent(); const g2 = t2.groups[0];
  f('promptScore')(g2.id, g2.entryIds[0], g2.entryIds[1], 'x', 'y');
  assert.deepEqual(plain(modals.pop().onSecondary()), { keepOpen: true });
  last().onConfirm();
  assert.ok(!f('getScore')(g2, g2.entryIds[0], g2.entryIds[1]));
  assert.ok(f('knockoutDrawBlock')(t2), 'the group is unfinished again, so the knockout cannot be drawn yet');
});

test('D3 Teams round robin total: Clear result', () => {
  reset(); const t = rrkoEvent({ unit: 'Teams', rrOnly: true, unplayed: true }); const g = t.groups[0]; const [a, b] = g.entryIds;
  f('setScore')(g, a, b, 6, 3);
  f('promptScore')(g.id, a, b, 'A', 'B');
  const dlg = modals.pop(); assert.equal(dlg.secondaryLabel, 'Clear result');
  dlg.onSecondary(); last().onConfirm();
  assert.ok(!f('getScore')(g, a, b));
});

test('D3 knockout: Clear result with later results lists them, then clears the match and the cascade', () => {
  reset(); const t = koEvent(8); const b = t.knockout;
  playOut(app, b, () => 'a');
  f('koMatchScoreModal')('knockout', 0, 0);
  const dlg = modals.pop(); assert.equal(dlg.secondaryLabel, 'Clear result');
  const oldW = b.rounds[0][0].winnerId;
  assert.deepEqual(plain(dlg.onSecondary()), { keepOpen: true });
  const q = last();
  assert.equal(q.title, 'Clear this result?'); assert.equal(q.confirmLabel, 'Clear result');
  assert.match(text(q.bodyHTML), /^Clearing this result will clear 2 later results/);
  q.onConfirm();
  const m = b.rounds[0][0];
  assert.equal(m.winnerId, null); assert.equal(m.aLegs, null); assert.equal(m.bLegs, null);
  assert.equal(b.rounds[1][0].aEntryId, null);
  assert.deepEqual(appearsAfter(b, oldW, 0), []);
  assert.equal(champion(b), null);
  // the match can be played again
  assert.equal(save('knockout', 0, 0, 0, 3), undefined);
  assert.equal(b.rounds[1][0].aEntryId, m.bEntryId);
});

test('D3 knockout: Clear result on the final (nothing later) still asks, and clears the champion', () => {
  reset(); const t = koEvent(4); const b = t.knockout;
  playOut(app, b, () => 'a');
  assert.ok(champion(b));
  f('koMatchScoreModal')('knockout', 1, 0);
  modals.pop().onSecondary();
  assert.match(text(last().bodyHTML), /goes back to not played, and the champion is cleared\./);
  last().onConfirm();
  assert.equal(champion(b), null);
  f('koMatchScoreModal')('knockout', 1, 0);
  assert.equal(modals.pop().secondaryLabel, '', 'nothing to clear any more');
});

test('D3 a walkover can be cleared; a void match offers Reverse it, not Clear result', () => {
  reset(); const t = koEvent(8); const b = t.knockout;
  f('markKnockoutNoShow')('knockout', 0, 0, 'b');
  f('koMatchScoreModal')('knockout', 0, 0);
  modals.pop().onSecondary(); last().onConfirm();
  assert.equal(b.rounds[0][0].wo, false); assert.equal(b.rounds[0][0].winnerId, null);
  f('markKnockoutVoid')('knockout', 0, 1);
  f('koMatchScoreModal')('knockout', 0, 1);
  const d = modals.pop(); assert.equal(d.secondaryLabel, ''); assert.match(d.bodyHTML, /Reverse it/);
});

test('D3 Teams knockout and Group Boards: Clear result', () => {
  reset(); const t = teamsKo(4); const b = t.knockout;
  assert.equal(save('knockout', 0, 0, 6, 3), undefined);
  f('koMatchScoreModal')('knockout', 0, 0);
  modals.pop().onSecondary(); last().onConfirm();
  assert.equal(b.rounds[0][0].winnerId, null); assert.equal(b.rounds[1][0].aEntryId, null);
  // Group Boards group: always asks for a clear, then the group cascade runs
  reset(); const tp = podsEvent(16, 2); const p = tp.pods[0]; const key = 'pod:' + p.id;
  playOut(app, p.bracket, () => 'a');
  const gw = p.bracket.rounds[0][0].winnerId;
  f('koMatchScoreModal')(key, 0, 0);
  assert.deepEqual(plain(modals.pop().onSecondary()), { keepOpen: true });
  assert.match(text(last().bodyHTML), /^Clearing this result will clear \d later result/);
  last().onConfirm();
  assert.equal(p.bracket.rounds[0][0].winnerId, null);
  assert.deepEqual(appearsAfter(p.bracket, gw, 0), []);
});

test('D3 Group Boards: a clear that would change a scored Finals match is refused with the reason, and changes nothing', () => {
  reset(); const t = podsEvent(8, 2);
  t.pods.forEach((p) => playOut(app, p.bracket, () => 'a'));
  f('syncFinalsFromPods')(t); playOut(app, t.knockout, () => 'a');
  const p = t.pods[0], key = 'pod:' + p.id, before = plain(p.bracket.rounds);
  f('koMatchScoreModal')(key, 0, 0);
  modals.pop().onSecondary();
  const r = last().onConfirm();
  assert.match(r.error, /a Finals match that depends on it already has a score/);
  assert.deepEqual(plain(p.bracket.rounds), before);
});

test('D3 Clear result is refused on a finalized event', () => {
  reset(); const t = rrkoEvent({ rrOnly: true }); const g = t.groups[0]; const [a, b] = g.entryIds;
  f('promptScore')(g.id, a, b, 'x', 'y'); const dlg = modals.pop();
  t.finalized = { at: '2026-10-23T10:00:00.000Z' };
  assert.match(dlg.onSecondary().error, /finalized/);
  assert.ok(f('getScore')(g, a, b));
  modals = []; f('promptScore')(g.id, a, b, 'x', 'y');
  assert.equal(modals[0].title, 'Event is finalized');
});

test('the score box shows Cancel, Clear result and Save score; the second button runs onSecondary', () => {
  const els = {};
  const el = (id) => els[id] || (els[id] = { id, innerHTML: '', style: {}, classList: { add() {}, remove() {} }, onclick: null, textContent: '' });
  const real = loadApp();   // a fresh copy: this one's openModal is the app's own, not the test stub
  real.document = { getElementById: el, createElement: DOC.createElement, body: DOC.body };
  let ran = '';
  run(real, 'openModal')({ title: 'T', bodyHTML: '<p>b</p>', confirmLabel: 'Save score', onConfirm: () => { ran += 'save'; }, secondaryLabel: 'Clear result', onSecondary: () => { ran += 'clear'; return { keepOpen: true }; } });
  const box = els.modalBox.innerHTML;
  assert.ok(box.indexOf('>Cancel<') < box.indexOf('>Clear result<') && box.indexOf('>Clear result<') < box.indexOf('>Save score<'));
  let closed = 0;
  el('modalBackdrop').classList = { add() {}, remove() { closed++; } };
  els.modalSecondaryBtn.onclick(); assert.equal(ran, 'clear');
  assert.equal(closed, 0, '{ keepOpen:true } leaves the box (now the question) open');
  els.modalConfirmBtn.onclick(); assert.equal(ran, 'clearsave');
  assert.equal(closed, 1, 'a handler that returns nothing closes the box');
  // without a second label there is no second button
  run(real, 'openModal')({ title: 'T', body: 'b', confirmLabel: 'OK', onConfirm: () => {}, secondaryLabel: '', onSecondary: () => {} });
  assert.doesNotMatch(els.modalBox.innerHTML, /modalSecondaryBtn/);
});

/* ======================= Round 2 (independent review): roster changes after the start, stale brackets ======================= */

// A Knockout drawn first, then the event switched to another format: the old bracket stays in the data.
function staleKnockout(t) { app.__o = t.entriesList.map((e) => ({ entryId: e.id, org: '' })); t.knockout = run(app, 'generateBracket(__o, "Bracket")'); }

test('R2 M2 a bracket left from an earlier format does not block Withdraw before the start (Knockout -> Round robin)', () => {
  reset(); const t = rrkoEvent({ rrOnly: true, notStarted: true }); staleKnockout(t);
  f('withdrawEntry')(t.groups[0].entryIds[0]);
  assert.equal(last().title, 'Withdraw RrA1?');
  assert.match(f('flatEntriesRowsHTML')(f('flatEntriesData')()), />Withdraw<\/button>/);
});

test('R2 M2 the same stale bracket does not block Clear result (or undo no-show) in Round robin -> Knockout before the real draw', () => {
  reset(); const t = rrkoEvent(); staleKnockout(t);
  const g = t.groups[0]; const [a, b] = g.entryIds;
  f('promptScore')(g.id, a, b, 'x', 'y');
  assert.deepEqual(plain(modals.pop().onSecondary()), { keepOpen: true }, 'asked, not refused');
  const ng = t.groups[1]; const nv = ng.entryIds[3];
  Object.keys(ng.scores).forEach((k) => { if (k.includes(nv)) delete ng.scores[k]; });
  f('markGroupNoShow')(ng.id, nv);
  modals = []; f('undoGroupNoShow')(ng.id, nv);
  assert.equal(modals.length, 0); assert.equal(t.entriesList.find((e) => e.id === nv).noShow, false);
  // once really drawn from the groups it counts
  t.knockout = null; t.groups.forEach(playGroup); f('generateKnockoutFromRR')();
  f('promptScore')(g.id, a, b, 'x', 'y');
  assert.match(modals.pop().onSecondary().error, /already been drawn/);
});

test('R2 M2 Group Boards: a group that is drawn but still editable is the draw (Withdraw allowed); a confirmed one blocks it', () => {
  reset(); const t = podsEvent(8, 2); const p = t.pods[0];
  t.pods.forEach((x) => { x.confirmed = false; }); t.knockout = null;
  const id = p.entryIds[0];
  assert.equal(f('withdrawBlock')(t, id), null);
  p.confirmed = true;
  assert.equal(f('withdrawBlock')(t, id).reason, 'bracket');
});

/* R2 H1 since the player library (2026-10-29): step 1 has no number of entries, so saving it never removes anyone;
   entries are removed one at a time on step 3, and only before the draw (after it they are withdrawn). */
test('R2 H1 saving step 1 never adds or removes entries, before or after the draw', () => {
  reset(); const t = rrkoEvent(); f('generateKnockoutFromRR')();
  const before = plain({ list: t.entriesList.map((e) => [e.id, e.name, !!e.withdrawn]), groups: t.groups, ko: t.knockout });
  typed({ f_tname: 'A new name', f_ename: 'x', f_etype: 'Open', f_unit: 'Singles', f_date: '' }, () => f('saveStage1')());
  assert.deepEqual(plain({ list: t.entriesList.map((e) => [e.id, e.name, !!e.withdrawn]), groups: t.groups, ko: t.knockout }), before);
  assert.equal(t.eventCreation.tournamentName, 'A new name');
  reset(); const u = rrkoEvent({ notStarted: true }); const n = u.entriesList.length;
  typed({ f_tname: 'n', f_ename: 'e', f_etype: 'Open', f_unit: 'Singles', f_date: '' }, () => f('saveStage1')());
  assert.equal(u.entriesList.length, n); assert.equal(u.eventCreation.entries, n);
});

test('R2 H1 once the groups are drawn an entry cannot be removed (it is withdrawn instead)', () => {
  reset(); const t = rrkoEvent({ notStarted: true }); const n = t.entriesList.length;
  modals.length = 0;
  f('removeEntry')(t.entriesList[0].id);
  assert.equal(modals.length, 0, 'no remove box after the draw');
  assert.equal(t.entriesList.length, n);
});

test('R2 H2 Swap with... is refused once a group involved has started, and step 3 stops offering it', () => {
  reset(); const t = rrkoEvent(); const [g0, g1] = t.groups;
  const before = plain(t.groups);
  f('performSwap')(g0.entryIds[0], g1.id, 0);
  assert.equal(last().title, 'Entries can no longer be swapped');
  assert.match(text(last().bodyHTML), /Groups A, B have started, so swapping or moving an entry would leave results already played with entries who did not play them/);
  assert.deepEqual(plain(t.groups), before);
  modals = []; f('openSwapPicker')(g0.entryIds[0]);
  assert.equal(last().title, 'Entries can no longer be swapped');
  assert.doesNotMatch(f('flatEntriesRowsHTML')(f('flatEntriesData')()), /openSwapPicker/);
  assert.doesNotMatch(f('groupedEntriesHTML')(), /openSwapPicker/);
});

test('R2 H2 Swap with... before the start still works, but a started group is not offered as a target', () => {
  reset(); const t = rrkoEvent({ notStarted: true }); const [g0, g1] = t.groups;
  const a = g0.entryIds[0], b = g1.entryIds[0];
  f('performSwap')(a, g1.id, 0);
  assert.equal(g1.entryIds[0], a); assert.equal(g0.entryIds[0], b);
  g1.gameStarted = true;   // one group in play, the other not (a stored event)
  f('openSwapPicker')(g0.entryIds[1]);
  const html = last().bodyHTML;
  assert.doesNotMatch(html, new RegExp("performSwap\\('[^']+','" + g1.id + "'"), 'no row of the started group can be picked');
  assert.match(html, /this group has started/);
  modals = []; f('performSwap')(g0.entryIds[1], g1.id, 1);
  assert.equal(last().title, 'Entries can no longer be swapped');
});

test('R2 H2 Random draw is refused once any group has started, greyed out on step 3 with the reason; before the start unchanged', () => {
  reset(); const t = rrkoEvent();
  const before = plain(t.groups);
  f('confirmShuffleGroups')();
  assert.equal(last().title, 'The groups can no longer be redrawn');
  modals = []; f('shuffleGroups')();
  assert.equal(last().title, 'The groups can no longer be redrawn');
  assert.deepEqual(plain(t.groups), before);
  const panel = f('entriesPanel')();
  assert.match(panel, /<button class="btn ghost" disabled onclick="confirmShuffleGroups\(\)">Random draw<\/button>/);
  assert.match(text(panel), /Groups A, B, C, D have started, so the groups can no longer be redrawn/);
  reset(); rrkoEvent({ notStarted: true });
  f('confirmShuffleGroups')();
  assert.equal(last().title, 'Random draw?');
  assert.doesNotMatch(f('entriesPanel')(), /disabled onclick="confirmShuffleGroups/);
});

test('R2 H2 the same rule holds for Doubles and Teams round robins', () => {
  ['Doubles', 'Teams'].forEach((unit) => {
    reset(); const t = rrkoEvent({ unit, rrOnly: true, unplayed: true });
    f('performSwap')(t.groups[0].entryIds[0], t.groups[1].id, 0);
    assert.equal(last().title, 'Entries can no longer be swapped', unit);
    f('confirmShuffleGroups')();
    assert.equal(last().title, 'The groups can no longer be redrawn', unit);
  });
});

test('R2 M1 after the knockout is drawn, a round robin no-show can no longer be undone (it would leave the group unfinished)', () => {
  reset(); const t = rrkoEvent({ unplayed: true }); const g = t.groups[0]; const v = g.entryIds[3];
  f('markGroupNoShow')(g.id, v);
  t.groups.forEach((x) => f('groupMatches')(x).forEach(([a, b]) => { if (!f('getScore')(x, a, b)) f('setScore')(x, a, b, 3, 0); }));
  f('generateKnockoutFromRR')(); assert.ok(t.knockout);
  const scores = plain(g.scores);
  modals = []; f('undoGroupNoShow')(g.id, v);
  assert.equal(last().title, 'This no-show can no longer be undone');
  assert.match(last().body, /can no longer be undone: undoing it would remove its walkover results and leave the group unfinished/);
  assert.deepEqual(plain(g.scores), scores);
  assert.equal(t.entriesList.find((e) => e.id === v).noShow, true);
  assert.equal(f('knockoutDrawBlock')(t), null, 'Regenerate stays possible');
  f('openNoShowPicker')(g.id);
  assert.doesNotMatch(last().bodyHTML, /undoGroupNoShow/, 'no undo link');
  // before the draw it still works
  reset(); const t2 = rrkoEvent({ unplayed: true }); const g2 = t2.groups[0];
  f('markGroupNoShow')(g2.id, g2.entryIds[0]);
  f('openNoShowPicker')(g2.id); assert.match(last().bodyHTML, /undoGroupNoShow/);
  f('undoGroupNoShow')(g2.id, g2.entryIds[0]);
  assert.equal(Object.keys(g2.scores).length, 0);
});

test('R2 L1 the Withdraw box checks again when it is confirmed (play may have begun meanwhile)', () => {
  reset(); const t = rrkoEvent({ notStarted: true }); const g = t.groups[0]; const v = g.entryIds[0];
  f('withdrawEntry')(v); const box = last();
  g.gameStarted = true; f('setScore')(g, v, g.entryIds[1], 3, 1);
  const r = typed({ withdrawReplacement: '' }, () => box.onConfirm());
  assert.match(r.error, /Play has begun since this box opened, so Withdraw is no longer possible/);
  assert.equal(t.entriesList.find((e) => e.id === v).withdrawn, false); assert.ok(g.entryIds.includes(v));
  // the before-the-draw box too (a knockout drawn meanwhile)
  reset(); const k = koEvent(8); const saved = k.knockout; k.knockout = null;
  f('withdrawEntry')(k.entriesList[0].id); const pre = last(); assert.equal(pre.confirmLabel, 'Withdraw');
  k.knockout = saved;
  assert.match(pre.onConfirm().error, /no longer possible/);
  assert.equal(k.entriesList[0].withdrawn, false);
});

test('R2 L2 Clear result on a quarterfinal also gives the final its Start round back (a semifinal is now waiting)', () => {
  reset(); const t = koEvent(8); const b = t.knockout;
  playOut(app, b, () => 'a'); b.roundStartedAt = [1000, 2000, 3000];
  f('koMatchScoreModal')('knockout', 0, 0); modals.pop().onSecondary(); last().onConfirm();
  assert.deepEqual(plain(b.roundStartedAt), [1000, 2000, null]);
  assert.equal(f('nextEligibleKnockoutRound')(b), -1, 'the final cannot be started while a semifinal waits for a player');
});

test('R2 L3 Group Boards: clearing a group final names the group winner and their Finals place, not a champion', () => {
  reset(); const t = podsEvent(8, 2); const p = t.pods[0]; const key = 'pod:' + p.id;
  t.knockout = null;   // no Finals yet: the group final can be cleared
  playOut(app, p.bracket, () => 'a');
  const lastRound = p.bracket.rounds.length - 1;
  f('koMatchScoreModal')(key, lastRound, 0); modals.pop().onSecondary();
  assert.match(text(last().bodyHTML), /goes back to not played, and the group winner is cleared, with their place in the Finals\./);
  assert.doesNotMatch(text(last().bodyHTML), /champion/);
  modals = []; f('koMatchScoreModal')(key, 0, 0); modals.pop().onSecondary();
  assert.match(text(last().bodyHTML), /The group winner \(.+\) will be cleared too, and their place in the Finals with it\./);
});

test('R2 M8 a round robin Clear result question answered after the event was finalized changes nothing', () => {
  reset(); const t = rrkoEvent({ rrOnly: true }); const g = t.groups[0]; const [a, b] = g.entryIds;
  f('promptScore')(g.id, a, b, 'x', 'y'); modals.pop().onSecondary();
  const q = last(); t.finalized = { at: '2026-10-23T10:00:00.000Z' };
  persists = 0;
  assert.match(q.onConfirm().error, /finalized/);
  assert.ok(f('getScore')(g, a, b)); assert.equal(persists, 0);
});

test('R2 M20 Clear result works from either side of the chart (the larger id first)', () => {
  reset(); const t = rrkoEvent({ rrOnly: true, unplayed: true }); const g = t.groups[0]; const [a, b] = g.entryIds;
  assert.ok(a < b);
  f('setScore')(g, a, b, 3, 2);
  f('promptScore')(g.id, b, a, 'second', 'first');
  const dlg = modals.pop(); assert.equal(dlg.secondaryLabel, 'Clear result');
  dlg.onSecondary();
  assert.match(text(last().bodyHTML), /second v first \(2-3\) goes back to not played/);
  last().onConfirm();
  assert.ok(!f('getScore')(g, a, b)); assert.deepEqual(plain(g.scores), {});
});

test('R2 M6 a stored group with a result but not marked started still blocks Withdraw', () => {
  reset(); const t = rrkoEvent({ notStarted: true }); const g = t.groups[0];
  f('setScore')(g, g.entryIds[0], g.entryIds[1], 3, 0);
  f('withdrawEntry')(g.entryIds[0]);
  assert.equal(last().title, 'Games have started in Group A');
  f('withdrawEntry')(t.groups[1].entryIds[0]);
  assert.equal(last().title, 'Withdraw RrB1?', 'an entry with no result in an unstarted group can still go');
});

test('R2 a stored group with a result but not marked started is in play too: no swap, no redraw', () => {
  reset(); const t = rrkoEvent({ notStarted: true }); const g = t.groups[0];
  f('setScore')(g, g.entryIds[0], g.entryIds[1], 3, 0);
  f('performSwap')(g.entryIds[2], t.groups[1].id, 0);
  assert.equal(last().title, 'Entries can no longer be swapped');
  f('confirmShuffleGroups')();
  assert.equal(last().title, 'The groups can no longer be redrawn');
});

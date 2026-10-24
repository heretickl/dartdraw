// Realistic events for the viewer tests, built with the organiser app's own functions (vm), the way an organiser would:
// draw, play, mark no-shows, finalize. Deterministic (seeded draw, fixed clock). Used by tests/viewer-i18n.test.js.
//   const { buildEvents } = require('./lib/viewer-events');  buildEvents() -> [{ key, slug, data, ageMin }]
// A: Singles round robin -> knockout, knockout part played (a walkover, a called match)   B: Doubles knockout, drawn, nothing played
// C: Teams round robin -> knockout, knockout part played                                    D: Group Boards Singles, part played, board plan
// E: Singles knockout finished and finalized                                                F: Teams RR -> KO with a Plate pool, finished and finalized
// G: Singles RR -> KO finished, not finalized (awaiting)                                     H: Singles round robin, part played (a tie)
// I: Singles round robin finished long ago                                                   J: Singles knockout with a walkover and a "neither attended"
// K: Teams, no draw yet                                                                      L: Group Boards Teams, all groups done, Finals drawn
// M: Singles knockout of 16, first round part played
const assert = require('node:assert/strict');
const { loadApp, run, useState, seededRng } = require('./helpers');

const FINAL_AT = '2026-10-20T12:00:00.000Z';
const SING = ['Aiden Tan', 'Brandon Lee', 'Chloe Wong', 'Daniel Lim', 'Elena Cruz', 'Farid Hassan', 'Grace Ong', 'Hari Nair', 'Isla Chin', 'Jun Wei Ho', 'Kavita Rao', 'Leo Ahmad', 'Mei Ling Goh', 'Nadia Yusof', 'Omar Said', 'Priya Das'];
const ORGS = ['Cheras DC', 'Ampang DA', 'KL Eagles', 'Bangsar Arrows'];
const DBL = ['Tan / Lim', 'Wong / Ong', 'Rao / Nair', 'Hassan / Said', 'Chin / Ho', 'Cruz / Ahmad', 'Goh / Yusof', 'Das / Lee', 'Kumar / Singh', 'Ali / Zain'];
const TEAMS = ['Cheras Cobras', 'Ampang Arrows', 'KL Eagles', 'Bangsar Bulls', 'Petaling Pirates', 'Subang Sharks', 'Klang Kings', 'Setapak Stars', 'Wangsa Wolves'];

let cache = null;
function buildEvents() {
  if (cache) return JSON.parse(JSON.stringify(cache));
  const app = loadApp();
  const f = (n) => run(app, n);
  const DOC = app.document;
  const ORIG = {};
  ['persist', 'openModal', 'setSaveStatus', 'apiFetch'].forEach((n) => { ORIG[n] = run(app, n); });
  let modals;
  function reset() {
    Object.keys(ORIG).forEach((n) => { app[n] = ORIG[n]; });
    modals = [];
    app.openModal = (m) => { modals.push(m); };
    app.persist = () => {}; app.render = () => {}; app.renderSavedList = () => {}; app.setSaveStatus = () => {};
    app.document = DOC;
    app.__org = { name: 'Sam', email: 's@x.com', tier: 'pro', entryLimit: null, viewerUrl: 'https://live.example.com' };
    run(app, 'currentOrganizer = __org; lockedIds.clear(); currentStage = 1; teamSegDraft = null');
  }
  function enter(modal, a, b) {
    const els = { scA: { value: String(a) }, scB: { value: String(b) } };
    app.document = { getElementById: (id) => els[id] || { value: '', textContent: '', innerHTML: '' }, createElement: DOC.createElement, body: DOC.body };
    try { const r = modal.onConfirm(); return r && r.error ? r.error : null; } finally { app.document = DOC; }
  }
  function build(unit, ft, n, o) {
    const t = f('blankTournament')(); useState(app, t);
    t.id = 't_vi_' + o.slug;
    Object.assign(t.eventCreation, { saved: true, eventType: o.type || 'Open', competitionUnit: unit, entries: n, tournamentName: o.tournament, eventName: o.event, date: o.date, boards: o.boards || 4 });
    Object.assign(t.format, { saved: true, formatType: ft, maxPerGroup: 4, qualifiersPerGroup: 2, advanceMode: 'seeded', losersPool: !!o.plate, podCount: o.pods || 2, bestOfLegs: o.legs || 3, anticipatedStartTime: o.start || '' });
    if (o.seeding) { t.format.seedingEnabled = true; t.format.numSeeds = o.numSeeds || 4; }
    f('ensureEntries')(t);
    const names = unit === 'Teams' ? TEAMS : unit === 'Doubles' ? DBL : SING;
    t.entriesList.forEach((e, i) => { e.name = names[i]; e.autoName = false; e.org = unit === 'Singles' ? ORGS[i % 4] : ''; e.checkedIn = true; });
    t.publicSlug = o.slug; t.published = true; t.listed = true;
    return t;
  }
  function draw(t) {
    const ft = t.format.formatType;
    if (ft === 'roundrobin' || ft === 'rrknockout') { f('shuffleGroups')(); f('confirmAllCharts')(); }
    else if (ft === 'knockout') { f('checkInAll')(); f('regenerateKnockoutBracket')(); }
    else { f('generatePods')(t, seededRng(9)); f('podsConfirmAll')(t); }
  }
  function playGroups(t, limit) {
    const teamsEv = t.eventCreation.competitionUnit === 'Teams';
    let done = 0, k = 0;
    const legSets = [[3, 0], [3, 1], [3, 2], [3, 1], [3, 0], [3, 2]];
    const segSets = [[6, 4], [7, 3], [5, 4], [9, 7], [8, 2], [6, 5]];
    t.groups.forEach((g) => {
      g.gameStarted = true;
      f('groupMatches')(g).forEach(([a, b]) => {
        if (limit !== undefined && done >= limit) return;
        done++; k++;
        const first = (k % 3 !== 0);
        if (teamsEv) { const [hi, lo] = segSets[k % segSets.length]; f('promptScore')(g.id, a, b, 'a', 'b'); assert.equal(enter(modals.pop(), first ? hi : lo, first ? lo : hi), null); }
        else { const [hi, lo] = legSets[k % legSets.length]; f('setScore')(g, first ? a : b, first ? b : a, hi, lo); }
      });
    });
  }
  function playRound(t, key, ri, count, scores) {
    const br = f('bracketByKey')(t, key); let n = 0;
    br.rounds[ri].forEach((m, mi) => {
      if (count !== undefined && n >= count) return;
      if (!m.aEntryId || !m.bEntryId || m.bye || m.winnerId || m.void) return;
      let sc = scores[n % scores.length]; n++;
      if (t.eventCreation.competitionUnit !== 'Teams') { const bo = f('legsForKnockoutRound')(t, key, br.rounds.length, ri), w = Math.floor(bo / 2) + 1, l = (n * 7) % w; sc = n % 4 === 0 ? [l, w] : [w, l]; }
      f('koMatchScoreModal')(key, ri, mi); assert.equal(enter(modals.pop(), sc[0], sc[1]), null);
    });
  }
  function playKO(t, key, scores) {
    for (let r = 0; ; r++) { const br = f('bracketByKey')(t, key); if (r >= br.rounds.length) break; playRound(t, key, r, undefined, scores); }
  }
  function playPod(t, p, limit) {
    const key = 'pod:' + p.id;
    for (let r = 0; r < p.bracket.rounds.length; r++) {
      let n = 0;
      p.bracket.rounds[r].forEach((m, mi) => {
        if ((limit !== undefined && n >= limit) || !m.aEntryId || !m.bEntryId || m.bye || m.winnerId) return;
        n++; f('koMatchScoreModal')(key, r, mi); enter(modals.pop(), 2, n % 2);
      });
      if (limit !== undefined) break;
    }
  }
  const singleScores = [[3, 1], [3, 0], [3, 2], [2, 3]];
  const teamScores = [[7, 3], [6, 4], [8, 2], [4, 6], [9, 7]];
  const open = (br, ri) => br.rounds[ri].map((m, i) => ({ m, i })).filter((x) => x.m.aEntryId && x.m.bEntryId && !x.m.bye && !x.m.winnerId);
  const out = [];
  const add = (key, t, ageMin) => out.push({ key, slug: t.publicSlug, data: JSON.parse(JSON.stringify(t)), ageMin });

  reset();
  const A = build('Singles', 'rrknockout', 12, { slug: 'chrsopensing1', tournament: 'Cheras Darts Open 2026', event: "Men's Singles", date: '2026-10-22', start: '10:00', seeding: true, numSeeds: 4, legs: 3 });
  A.format.knockoutLegs = { main: { variable: true, early: 3, quarterfinal: 3, semifinal: 5, final: 5 }, plate: A.format.knockoutLegs.plate };
  draw(A); playGroups(A); f('generateKnockoutFromRR')();
  playRound(A, 'knockout', 0, 1, singleScores);
  { const br = f('bracketByKey')(A, 'knockout'), o = open(br, 0); if (o[0]) f('markKnockoutNoShow')('knockout', 0, o[0].i, 'b');
    playRound(A, 'knockout', 1, 1, singleScores); const o2 = open(f('bracketByKey')(A, 'knockout'), 1); if (o2[0]) { o2[0].m.called = true; o2[0].m.board = 2; } }
  add('A', A, 2);

  reset();
  const B = build('Doubles', 'knockout', 10, { slug: 'ampngdbls0001', tournament: 'Ampang Club Championships', event: 'Open Doubles', date: '2026-10-24', start: '19:00', seeding: true, numSeeds: 2, legs: 3 });
  draw(B); add('B', B, 300);

  reset();
  const C = build('Teams', 'rrknockout', 9, { slug: 'kltmsleague01', tournament: 'KL Mixed Teams League', event: 'Night 4 - Teams', date: '2026-10-22', start: '20:00', legs: 5, type: 'Women' });
  draw(C); playGroups(C); f('generateKnockoutFromRR')(); playRound(C, 'knockout', 0, 1, teamScores);
  { const o = open(f('bracketByKey')(C, 'knockout'), 0); if (o[0]) f('markKnockoutNoShow')('knockout', 0, o[0].i, 'a'); }
  add('C', C, 1);

  reset();
  const D = build('Singles', 'podknockout', 12, { slug: 'grpboards0001', tournament: 'Ampang Friday Night Darts', event: 'Group Boards Singles', date: '2026-10-22', start: '19:00', pods: 3, legs: 3, boards: 3, type: 'Youth' });
  draw(D); playPod(D, D.pods[0]); playPod(D, D.pods[1], 1);
  D.boardPlan = JSON.parse(JSON.stringify(f('buildBoardPlan')(D)));
  { // the organiser has called two matches: the one up now on the first board, and the second one waiting on another
    const pend = Object.keys(D.boardPlan.boards).map((b) => D.boardPlan.boards[b].filter((x) => x.status !== 'done'));
    if (pend[0] && pend[0][0]) pend[0][0].called = true;
    const more = pend.find((p, i) => i > 0 && p.length > 1); if (more) more[1].called = true; }
  add('D', D, 3);

  reset();
  const E = build('Singles', 'knockout', 8, { slug: 'bangsarcup001', tournament: 'Bangsar Summer Cup', event: 'Open Singles', date: '2026-10-21', start: '12:00', legs: 3 });
  draw(E); playKO(E, 'knockout', singleScores); E.finalized = { at: FINAL_AT };
  add('E', E, 1200);

  reset();
  const F = build('Teams', 'rrknockout', 9, { slug: 'teamsdone0001', tournament: 'Subang Teams Cup', event: 'Teams Final Night', date: '2026-10-18', legs: 5, plate: true });
  draw(F); playGroups(F); f('generateKnockoutFromRR')(); playKO(F, 'knockout', teamScores); playKO(F, 'knockoutLosers', teamScores);
  F.finalized = { at: FINAL_AT };
  add('F', F, 5760);

  reset();
  const G = build('Singles', 'rrknockout', 8, { slug: 'awaitfinal001', tournament: 'Klang Charity Day', event: 'Veterans Singles', date: '2026-10-22', start: '09:30', legs: 3, seeding: true, numSeeds: 2 });
  draw(G); playGroups(G); f('generateKnockoutFromRR')(); playKO(G, 'knockout', singleScores);
  add('G', G, 90);

  reset();
  const H = build('Singles', 'roundrobin', 8, { slug: 'rronlysing001', tournament: 'Cheras Darts Open 2026', event: "Women's Singles", date: '2026-10-22', start: '10:30', legs: 3, type: 'Women' });
  draw(H); playGroups(H, 7);
  add('H', H, 12);

  reset();
  const I = build('Singles', 'roundrobin', 8, { slug: 'oldleague0001', tournament: 'Setapak League', event: 'Week 2 Singles', date: '2026-10-11', legs: 3 });
  draw(I); playGroups(I); I.finalized = { at: FINAL_AT };
  add('I', I, 14400);

  reset();
  const J = build('Singles', 'knockout', 8, { slug: 'noshowtest001', tournament: 'Setapak Open Night', event: 'Knockout with no-shows', date: '2026-10-22', start: '19:30', legs: 3, seeding: true, numSeeds: 4 });
  draw(J);
  { const br = f('bracketByKey')(J, 'knockout'), idx = br.rounds[0].map((m, i) => i).filter((i) => br.rounds[0][i].aEntryId && br.rounds[0][i].bEntryId && !br.rounds[0][i].bye);
    playRound(J, 'knockout', 0, 1, singleScores); f('markKnockoutNoShow')('knockout', 0, idx[1], 'a'); f('markKnockoutVoid')('knockout', 0, idx[2]); }
  add('J', J, 4);

  reset();
  const K = build('Teams', 'rrknockout', 8, { slug: 'undrawteams01', tournament: 'Subang Teams Cup', event: 'Teams Open (draw not made)', date: '2026-10-26', start: '13:00', legs: 5 });
  add('K', K, 600);

  reset();
  const L = build('Teams', 'podknockout', 8, { slug: 'gbteamsfinal1', tournament: 'Klang Teams Night', event: 'Group Boards Teams', date: '2026-10-22', start: '20:00', pods: 2, legs: 3 });
  draw(L); L.pods.forEach((p) => playPod(L, p)); f('syncFinalsFromPods')(L);
  L.boardPlan = JSON.parse(JSON.stringify(f('buildBoardPlan')(L)));
  add('L', L, 5);

  reset();
  const M = build('Singles', 'knockout', 16, { slug: 'roundof16sing', tournament: 'Petaling Open', event: 'Open Singles 16', date: '2026-10-22', start: '18:00', legs: 3, seeding: true, numSeeds: 8 });
  draw(M); playRound(M, 'knockout', 0, 5, singleScores);
  add('M', M, 6);

  cache = out;
  return JSON.parse(JSON.stringify(out));
}

module.exports = { buildEvents, FINAL_AT };

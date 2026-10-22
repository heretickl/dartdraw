const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, plain, useState, seededRng, makeTournament } = require('./lib/helpers');
const { sanitizeTournamentData } = require('../tournament-sanitize');
const { toPublicView } = require('../viewer/api/_lib/publicView');

/* Teams: a team match is a list of segments (type, starting score, best of) plus an optional tie-breaker segment, and
   one plain result per match: the total legs each team won. No roster anywhere. These run the real app functions. */
const app = loadApp();
const f = (n) => run(app, n);
const DOC = app.document;
const ORIG = {};
['persist', 'openModal', 'setSaveStatus', 'apiFetch'].forEach((n) => { ORIG[n] = run(app, n); });
let modals, els;
function reset() {
  Object.keys(ORIG).forEach((n) => { app[n] = ORIG[n]; });
  modals = []; els = {};
  app.openModal = (m) => { modals.push(m); };
  app.persist = () => {}; app.render = () => {}; app.renderSavedList = () => {}; app.setSaveStatus = () => {};
  app.document = DOC;
  app.__org = { name: 'Sam', email: 's@x.com', tier: 'pro', entryLimit: null, viewerUrl: 'https://live.example.com' };
  run(app, 'currentOrganizer = __org; lockedIds.clear(); currentStage = 1; formSectionCollapsed.format = false; teamSegDraft = null');
}
// A document whose elements are plain objects remembered by id (so a handler that writes a hint can be read back).
function domStub(values) {
  els = {};
  Object.keys(values || {}).forEach((id) => { els[id] = { value: values[id], textContent: '', innerHTML: '', checked: false }; });
  app.document = { getElementById: (id) => els[id] || (els[id] = { value: '', textContent: '', innerHTML: '', checked: false, __new: true }), createElement: DOC.createElement, body: DOC.body };
}
// Types the two totals into the open result box and presses Save. Returns the error text, or null when it saved.
function enter(modal, a, b) {
  domStub({ scA: String(a), scB: String(b) });
  try { const r = modal.onConfirm(); return r && r.error ? r.error : null; } finally { app.document = DOC; }
}
function teamsEvent(ft, n, opts) {
  opts = opts || {};
  const t = f('blankTournament')(); useState(app, t);
  t.id = 't_teams_' + ft + (n || 8);
  Object.assign(t.eventCreation, { saved: true, competitionUnit: 'Teams', entries: n || 8, tournamentName: 'League', eventName: 'Team Night', date: '2026-10-25', advancedMode: !!opts.advanced, boards: 4 });
  Object.assign(t.format, { saved: true, formatType: ft, maxPerGroup: 4, qualifiersPerGroup: 2, advanceMode: 'seeded', losersPool: !!opts.plate, podCount: opts.pods || 2 });
  f('ensureEntries')(t);
  t.entriesList.forEach((e, i) => { e.name = 'Team ' + String.fromCharCode(65 + i); e.autoName = false; });
  return t;
}
const render = (n) => { app.__n = n; run(app, 'formSectionCollapsed.format = false; currentStage = __n'); return run(app, 'stage' + n + '()'); };
const allStages = (label) => [1, 2, 3, 4, 5, 6, 7].map((n) => { let h = ''; assert.doesNotThrow(() => { h = render(n); }, label + ' stage ' + n); return h; }).join('');
function printPack(t) {
  const mount = { innerHTML: '' };
  app.document = { getElementById: () => mount };
  try { if (t.format.formatType === 'podknockout') f('podsPrintClick')(); else f('runPrintPack')((t.groups || []).filter((g) => g.confirmed)); } finally { app.document = DOC; }
  return mount.innerHTML;
}
const DEFAULTS = [
  { type: 'foursome', startingScore: 1001, legs: 1 }, { type: 'singles', startingScore: 501, legs: 3 }, { type: 'doubles', startingScore: 501, legs: 3 },
  { type: 'singles', startingScore: 501, legs: 3 }, { type: 'doubles', startingScore: 501, legs: 3 }];

/* ---------- the type picker and the defaults ---------- */
const TB_DEFAULT = { type: 'foursome', startingScore: 1001, legs: 1, inRoundRobin: true, inKnockout: true };
test('Teams is offered for a new event, and a new event starts from the default segments and a tie-breaker in both stages', () => {
  reset(); const t = f('blankTournament')(); useState(app, t);
  assert.match(render(1), /<option value="Teams">Teams<\/option>/);
  assert.deepEqual(plain(t.format.teamSegments), DEFAULTS);
  assert.deepEqual(plain(t.format.teamTieBreaker), TB_DEFAULT);
  assert.equal('teamSize' in t.format || 'teamMatchFormat' in t.format || 'mixedRubbers' in t.format, false);
  assert.equal('teamHandoutEnabled' in t.printSettings, false);
});

test('the cap per stage: 9, or 10 in a stage that uses the tie-breaker; a walkover is every main segment', () => {
  reset(); const t = teamsEvent('rrknockout');
  assert.equal(f('teamMatchCap')(t, 'rr'), 10); assert.equal(f('teamMatchCap')(t, 'ko'), 10);
  t.format.teamTieBreaker.inRoundRobin = false;
  assert.equal(f('teamMatchCap')(t, 'rr'), 9); assert.equal(f('teamMatchCap')(t, 'ko'), 10);
  t.format.teamTieBreaker.inKnockout = false;
  assert.equal(f('teamMatchCap')(t, 'ko'), 9);
  assert.equal(f('teamWalkoverLegs')(t), 9);
  // a stage the format does not have never counts the tie-breaker
  const rr = teamsEvent('roundrobin'); assert.equal(f('teamTieBreakerFor')(rr, 'ko'), null);
  const ko = teamsEvent('podknockout'); assert.equal(f('teamTieBreakerFor')(ko, 'rr'), null); assert.ok(f('teamTieBreakerFor')(ko, 'ko'));
  t.format.teamTieBreaker = { type: 'singles', startingScore: 501, legs: 5, inRoundRobin: true, inKnockout: false };
  assert.equal(f('teamMatchCap')(t, 'rr'), 12);                                  // 9 + 3
  t.format.teamSegments = [{ type: 'singles', startingScore: 501, legs: 4 }];      // an even best-of: floor(4/2)+1
  assert.equal(f('teamMatchCap')(t, 'ko'), 3);
});

/* ---------- Format & branding: the format picker ---------- */
const mainCards = (html) => (html.match(/<label>Competition format<\/label><div class="options">([\s\S]*?)<\/div><\/div>/) || [])[1] || '';
const subCards = (html) => (html.match(/<label>Knockout type<\/label><div class="options">([\s\S]*?)<\/div><\/div>/) || [])[1] || null;
const titles = (cards) => [...cards.matchAll(/<strong>([^<]+)<\/strong>/g)].map((m) => m[1]);
const selected = (cards) => [...cards.matchAll(/<div class="choice selected"[^>]*><strong>([^<]+)<\/strong>/g)].map((m) => m[1]);
test('the format picker has exactly three formats; Group Boards is a Knockout option only, never under the round robin formats', () => {
  reset();
  ['Singles', 'Doubles', 'Teams'].forEach((unit) => {
    const t = teamsEvent('roundrobin'); t.eventCreation.competitionUnit = unit;
    const expect = { roundrobin: ['Round robin', null], knockout: ['Knockout', 'Single bracket'], rrknockout: ['Round robin → Knockout', null], podknockout: ['Knockout', 'Group Boards, then finals'] };
    Object.keys(expect).forEach((ft) => {
      t.format.formatType = ft;
      const html = render(2), label = unit + ' ' + ft;
      assert.deepEqual(titles(mainCards(html)), ['Round robin', 'Knockout', 'Round robin → Knockout'], label);
      assert.deepEqual(selected(mainCards(html)), [expect[ft][0]], label);
      const sub = subCards(html);
      if (expect[ft][1]) {
        assert.deepEqual(titles(sub), ['Single bracket', 'Group Boards, then finals'], label);
        assert.deepEqual(selected(sub), [expect[ft][1]], label);
      } else {
        assert.equal(sub, null, label + ': no Group Boards choice under a round robin format');
        assert.doesNotMatch(html, /setFormatType\('podknockout'\)|Group Boards, then finals/, label);
      }
    });
  });
  // the choices set the same internal formats as before
  const t = teamsEvent('roundrobin');
  f('chooseKnockoutFormat')(); assert.equal(t.format.formatType, 'knockout');
  f('setFormatType')('podknockout'); assert.equal(t.format.formatType, 'podknockout');
  f('chooseKnockoutFormat')(); assert.equal(t.format.formatType, 'podknockout', 'clicking Knockout keeps Group Boards');
  f('setFormatType')('knockout'); assert.equal(t.format.formatType, 'knockout');
  f('setFormatType')('rrknockout'); assert.equal(t.format.formatType, 'rrknockout');
});

/* ---------- Format & branding: the segment editor ---------- */
const tbTicks = (html) => [...html.matchAll(/id="f_team_tb_(rr|ko)"( checked)?/g)].map((m) => m[1] + (m[2] ? '+' : '-'));
test('stage 2 shows the segment editor for Teams in Basic and Advanced setup in every format, with only the tie-breaker ticks that apply', () => {
  reset();
  const ticks = { roundrobin: ['rr+'], knockout: ['ko+'], rrknockout: ['rr+', 'ko+'], podknockout: ['ko+'] };
  [false, true].forEach((advanced) => Object.keys(ticks).forEach((ft) => {
    const t = teamsEvent(ft, 8, { advanced, plate: true });
    t.format.knockoutLegs.main.variable = true; t.format.knockoutLegs.plate.variable = true;
    const html = render(2);
    const label = (advanced ? 'advanced ' : 'basic ') + ft;
    assert.match(html, /<div id="teamSegEditor">/, label);
    assert.match(html, /Team match segments \(played in order\)/, label);
    assert.equal((html.match(/class="team-seg-row"/g) || []).length, 6, label + ': 5 segments + the tie-breaker');
    assert.deepEqual(tbTicks(html), ticks[ft], label);
    assert.match(html, /A tie-breaker might be needed/, label);
    assert.match(html, /\+ Add segment/, label);
    assert.match(html, /Up to 8 segments, so the lineup sheet fits on one page\./, label);
    assert.match(html, /A team can win at most <b>10<\/b> legs in a match/, label);
    assert.doesNotMatch(html, /id="f_bestof"|id="f_podlegs"|f_kolegs_|Best of legs/, label);
    assert.doesNotMatch(html, /Players per team|Team format|Foursome \(quad\)|[Rr]ubber|handout/, label);
    ['Singles', 'Doubles', 'Trios', 'Foursome'].forEach((ty) => assert.match(html, new RegExp('<option value="' + ty.toLowerCase() + '"( selected)?>' + ty + '</option>'), label + ' ' + ty));
    [301, 501, 701, 1001].forEach((sc) => assert.match(html, new RegExp('<option value="' + sc + '"( selected)?>' + sc + '</option>'), label + ' ' + sc));
    // every row's controls have their own names
    ['Segment 1 type', 'Segment 5 starting score', 'Segment 3 legs (best of)', 'Move segment 2 up', 'Remove segment 4', 'Tie-breaker type', 'Tie-breaker legs (best of)'].forEach((a) => assert.ok(html.includes('aria-label="' + a + '"'), label + ' ' + a));
  }));
  // rrknockout with different caps per stage
  const t = teamsEvent('rrknockout'); t.format.teamTieBreaker.inRoundRobin = false; run(app, 'teamSegDraft = null');
  assert.match(render(2), /at most <b>9<\/b> legs in a round robin match and <b>10<\/b> in a knockout match/);
  assert.deepEqual(tbTicks(render(2)), ['rr-', 'ko+']);
  t.format.teamTieBreaker.inKnockout = false; run(app, 'teamSegDraft = null');
  assert.equal((render(2).match(/class="team-seg-row"/g) || []).length, 5, 'no tie-breaker row when no stage uses it');
  // Singles keeps its Best of legs field and has no segment editor
  const s = f('blankTournament')(); useState(app, s); s.eventCreation.saved = true;
  ['roundrobin', 'knockout', 'rrknockout', 'podknockout'].forEach((ft) => {
    s.format.formatType = ft;
    const h = render(2);
    assert.match(h, /id="f_bestof"/, ft); assert.doesNotMatch(h, /team-seg-row|tie-breaker might/, ft);
  });
  // touch screens get 40px buttons
  assert.equal(require('fs').readFileSync(require('path').join(__dirname, '..', 'app.html'), 'utf8').includes('@media (pointer: coarse){ .team-seg-btn{min-width:40px;min-height:40px} }'), true);
});

test('segment edits go into a draft: the event changes only on Save format & branding; leaving step 2 drops them', () => {
  reset(); const t = teamsEvent('rrknockout');
  let renders = 0; app.render = () => { renders++; };
  domStub({});
  f('addTeamSegment')();
  f('setTeamSegmentField')(5, 'type', 'trios');
  f('setTeamSegmentField')(5, 'startingScore', '701');
  f('setTeamSegmentField')(5, 'legs', '4');
  f('moveTeamSegment')(5, -1);
  f('setTeamTieBreakerStage')('rr', false);
  f('setTeamSegmentField')('tb', 'legs', '3');
  assert.equal(renders, 0, 'only the editor is redrawn, so other unsaved fields on step 2 are kept');
  assert.match(els.teamSegEditor.innerHTML, /class="team-seg-row"/);
  assert.match(els.teamSegSummary.innerHTML, /at most <b>12<\/b> legs in a round robin match and <b>14<\/b> in a knockout match/);
  assert.equal(els.segHint_5.textContent, 'Even numbers can end in a tie — an odd number is recommended.');
  f('setTeamSegmentField')(5, 'legs', '');                                         // a half-typed box changes nothing
  f('setTeamSegmentField')(5, 'type', '<b>x</b>');                                 // never an unknown type
  assert.equal(run(app, 'teamSegDraft').segments[5].type, 'singles');
  // the event itself is untouched
  assert.deepEqual(plain(t.format.teamSegments), DEFAULTS);
  assert.deepEqual(plain(t.format.teamTieBreaker), TB_DEFAULT);
  assert.equal(f('teamMatchCap')(t, 'rr'), 10);
  // leave without Save: the draft is gone, and step 2 shows the saved segments again
  app.document = DOC;
  f('goStage')(3);
  assert.equal(run(app, 'teamSegDraft'), null);
  assert.equal((render(2).match(/class="team-seg-row"/g) || []).length, 6);
  assert.deepEqual(plain(t.format.teamSegments), DEFAULTS);
  // edit again and Save: now it is applied
  domStub({});
  f('removeTeamSegment')(0); f('setTeamTieBreakerStage')('ko', false);
  app.document = { getElementById: () => null };
  f('saveStage2')();
  app.document = DOC;
  assert.deepEqual(plain(t.format.teamSegments), DEFAULTS.slice(1));
  assert.deepEqual(plain(t.format.teamTieBreaker), Object.assign({}, TB_DEFAULT, { inKnockout: false }));
  assert.equal(run(app, 'teamSegDraft'), null);
});

test('segments: at least one and at most 8; move and remove keep the order right', () => {
  reset(); teamsEvent('roundrobin');
  domStub({});
  const segs = () => plain(run(app, 'teamDraft()').segments.map((s) => s.type));
  f('moveTeamSegment')(0, -1);                                                     // nothing above the first
  f('moveTeamSegment')(0, 1);
  assert.deepEqual(segs(), ['singles', 'foursome', 'doubles', 'singles', 'doubles']);
  for (let i = 0; i < 6; i++) f('addTeamSegment')();
  assert.equal(segs().length, 8);
  assert.match(els.teamSegEditor.innerHTML, /<button type="button" class="btn ghost" disabled onclick="addTeamSegment\(\)">\+ Add segment<\/button>/);
  while (segs().length > 1) f('removeTeamSegment')(0);
  f('removeTeamSegment')(0);
  assert.equal(segs().length, 1, 'at least one segment stays');
  assert.match(els.teamSegEditor.innerHTML, /disabled onclick="removeTeamSegment\(0\)"/);
  app.document = DOC;
});

// Saves step 2 with only the editor's draft (no other field on the page). Returns the modal shown, if any.
function saveStep2() { modals = []; app.document = { getElementById: () => null }; try { f('saveStage2')(); } finally { app.document = DOC; } return modals.pop() || null; }
const tickHTML = (html, s) => (html.match(new RegExp('<input type="checkbox" id="f_team_tb_' + s + '"[^>]*>')) || [null])[0];
test('the segments lock once either stage has begun: read-only list, the handlers do nothing, Save keeps them', () => {
  reset();
  const t = teamsEvent('roundrobin', 4);
  f('buildGroups')(t); t.groups[0].confirmed = true;
  assert.equal(f('teamSegmentsLocked')(t), false);
  t.groups[0].gameStarted = true;
  assert.equal(f('teamSegmentsLocked')(t), true);
  const html = render(2);
  assert.doesNotMatch(html, /class="team-seg-row"|\+ Add segment/);
  assert.match(html, /Games have started, so the segments are locked/);
  assert.match(html, /<li>Foursome \(1001, best of 1\)<\/li>/);
  assert.match(html, /Round robin matches: tie-breaker Foursome \(1001, best of 1\) <span[^>]*>\(this stage has begun with it, so it stays on\)/);
  assert.equal(tickHTML(html, 'rr'), null, 'the round robin tick (on, stage begun) can not be switched off');
  domStub({});
  f('addTeamSegment')(); f('removeTeamSegment')(0); f('setTeamSegmentField')(0, 'legs', '7'); f('setTeamTieBreakerStage')('rr', false); f('setTeamSegmentField')('tb', 'legs', '3');
  app.document = DOC;
  assert.equal(saveStep2(), null);
  assert.deepEqual(plain(t.format.teamSegments), DEFAULTS);
  assert.deepEqual(plain(t.format.teamTieBreaker), Object.assign({}, TB_DEFAULT, { inKnockout: false }), 'kept, but the hidden knockout tick (a round robin has no knockout) is stored off');
  // a group that was un-started after scores went in still counts
  const u = teamsEvent('roundrobin', 4); f('buildGroups')(u);
  f('setScore')(u.groups[0], u.groups[0].entryIds[0], u.groups[0].entryIds[1], 6, 3);
  u.groups[0].gameStarted = false;
  assert.equal(f('teamSegmentsLocked')(u), true);
  // a draft made before games started is not applied by a Save after they started
  const late = teamsEvent('roundrobin', 4); f('buildGroups')(late);
  domStub({}); f('addTeamSegment')(); app.document = DOC;
  late.groups[0].gameStarted = true;
  saveStep2();
  assert.deepEqual(plain(late.format.teamSegments), DEFAULTS);
});

test('a knockout has begun with a started round, a called match or any result; byes alone do not count', () => {
  reset();
  const k = teamsEvent('knockout', 5); f('checkInAll')(); f('regenerateKnockoutBracket')();
  assert.ok(k.knockout.rounds[0].some((m) => m.bye), 'the draw has byes');
  assert.equal(f('teamSegmentsLocked')(k), false, 'byes after the draw are not a start');
  k.knockout.roundStartedAt = k.knockout.rounds.map(() => null); k.knockout.roundStartedAt[0] = Date.now();
  assert.equal(f('teamSegmentsLocked')(k), true, 'Start round');
  k.knockout.roundStartedAt[0] = null;
  const real = k.knockout.rounds[0].find((m) => m.aEntryId && m.bEntryId && !m.bye);
  real.called = true;
  assert.equal(f('teamSegmentsLocked')(k), true, 'a match called to its board');
  real.called = false; real.void = true;
  assert.equal(f('teamSegmentsLocked')(k), true, 'neither showed');
  // Group Boards: a called group match, or a group result
  const p = teamsEvent('podknockout', 8, { pods: 2 }); f('generatePods')(p, seededRng(2)); f('podsConfirmAll')(p);
  assert.equal(f('teamSegmentsLocked')(p), false);
  const pm = p.pods[0].bracket.rounds[0].find((x) => x.aEntryId && x.bEntryId && !x.bye);
  pm.called = true;
  assert.equal(f('teamSegmentsLocked')(p), true);
  pm.called = false; pm.aLegs = 6; pm.bLegs = 2;
  assert.equal(f('teamSegmentsLocked')(p), true);
  assert.match(render(2), /Knockout matches: tie-breaker Foursome/);
});

test('each stage\'s tick locks only when THAT stage begins; the knockout tick can be switched on later, never off', () => {
  reset();
  // round robin -> knockout: the round robin has begun, the knockout has not: the knockout tick is still free
  const t = teamsEvent('rrknockout', 8); t.format.teamTieBreaker.inKnockout = false;
  f('buildGroups')(t); t.groups.forEach((g) => { g.confirmed = true; g.gameStarted = true; });
  let html = render(2);
  assert.equal(tickHTML(html, 'rr'), null);
  assert.match(tickHTML(html, 'ko'), /onchange/);
  assert.doesNotMatch(html, /this stage has begun: it can be switched on/, 'the knockout tick is simply free');
  domStub({}); f('setTeamTieBreakerStage')('ko', true); f('setTeamTieBreakerStage')('rr', false); app.document = DOC;
  assert.equal(saveStep2(), null);
  assert.equal(t.format.teamTieBreaker.inKnockout, true);
  assert.equal(t.format.teamTieBreaker.inRoundRobin, true, 'the begun round robin keeps its tie-breaker');
  run(app, 'teamSegDraft = null');
  domStub({}); f('setTeamTieBreakerStage')('ko', false); app.document = DOC;
  saveStep2();
  assert.equal(t.format.teamTieBreaker.inKnockout, false, 'before the knockout begins it can be switched off again');
  // the knockout begins without a tie-breaker: switching it ON is still allowed, switching it OFF afterwards is not
  const k = teamsEvent('knockout', 4); k.format.teamTieBreaker.inKnockout = false;
  f('checkInAll')(); f('regenerateKnockoutBracket')();
  const m = k.knockout.rounds[0][0]; m.aLegs = 6; m.bLegs = 3; m.winnerId = m.aEntryId;
  html = render(2);
  assert.match(tickHTML(html, 'ko'), /onchange/);
  assert.match(html, /\(this stage has begun: it can be switched on, and once saved it stays on\)/);
  assert.doesNotMatch(html, /<span class="team-seg-num">Tie-breaker<\/span>/, 'no tie-breaker row while it is off');
  domStub({}); f('setTeamTieBreakerStage')('ko', true); app.document = DOC;
  assert.match(render(2), /<span class="team-seg-num">Tie-breaker<\/span>/, 'its settings can still be chosen: no begun stage uses it yet');
  domStub({}); f('setTeamSegmentField')('tb', 'type', 'doubles'); f('setTeamSegmentField')('tb', 'legs', '3'); app.document = DOC;
  assert.equal(saveStep2(), null);
  assert.deepEqual(plain(k.format.teamTieBreaker), { type: 'doubles', startingScore: 1001, legs: 3, inRoundRobin: false, inKnockout: true }, 'the round robin tick, hidden in a knockout, is stored off');
  assert.equal(f('teamMatchCap')(k, 'ko'), 11, 'the cap only rises (9 + 2); the stored 6-3 stays valid');
  assert.deepEqual(plain(k.format.teamSegments), DEFAULTS, 'the segments stay locked');
  html = render(2);
  assert.equal(tickHTML(html, 'ko'), null, 'now on and begun: it can not be switched off');
  assert.match(html, /Tie-breaker: Doubles \(1001, best of 3\) <span[^>]*>\(locked: matches were played with it\)/);
  domStub({}); f('setTeamTieBreakerStage')('ko', false); f('setTeamSegmentField')('tb', 'legs', '5'); app.document = DOC;
  saveStep2();
  assert.equal(k.format.teamTieBreaker.inKnockout, true); assert.equal(k.format.teamTieBreaker.legs, 3);
  // Save itself checks too: a draft that says otherwise (e.g. made in another way) can not switch it off or change it
  run(app, 'teamSegDraft = null; teamDraft().tieBreaker.inKnockout = false; teamDraft().tieBreaker.legs = 5; teamDraft().tieBreaker.type = "trios"');
  saveStep2();
  assert.deepEqual(plain(k.format.teamTieBreaker), { type: 'doubles', startingScore: 1001, legs: 3, inRoundRobin: false, inKnockout: true });
});

test('the round robin tick can be switched on after the start only while no drawn result is stored; the locked list says so', () => {
  reset();
  const t = teamsEvent('rrknockout', 4); t.format.teamTieBreaker.inRoundRobin = false;
  f('buildGroups')(t); const g = t.groups[0]; g.gameStarted = true;
  const [a, b, c] = g.entryIds;
  f('setScore')(g, a, b, 6, 3);
  assert.equal(f('teamTieBreakerTickChange')(t, 'rr').canTurnOn, true);
  assert.match(tickHTML(render(2), 'rr'), /onchange/);
  f('setScore')(g, a, c, 5, 5);                                                  // a draw
  assert.equal(f('teamTieBreakerTickChange')(t, 'rr').canTurnOn, false);
  run(app, 'teamSegDraft = null');
  const html = render(2);
  assert.equal(tickHTML(html, 'rr'), null);
  assert.match(html, /Round robin matches: no tie-breaker <span[^>]*>\(a drawn result is already saved, so it can't be switched on: level matches stay draws\)/);
  assert.match(tickHTML(html, 'ko'), /checked/, 'the knockout, not begun, is still free');
  domStub({}); f('setTeamTieBreakerStage')('rr', true); app.document = DOC;
  saveStep2();
  assert.equal(t.format.teamTieBreaker.inRoundRobin, false);
});

test('a knockout level total is refused with a way forward that always fits the cap', () => {
  reset(); const t = teamsEvent('knockout', 4); t.format.teamTieBreaker.inKnockout = false;
  f('checkInAll')(); f('regenerateKnockoutBracket')();
  f('koMatchScoreModal')('knockout', 0, 0);
  assert.match(enter(modals.pop(), 6, 6), /^This is a knockout match — it can't end level\. One team must have more legs: tick "Use a tie-breaker in knockout matches" in Format & branding to play the tie-breaker, or play one more deciding leg and include it in the totals\.$/);
  // every possible level total of the default segments leaves room for one more deciding leg within the cap
  const outcomes = (legs) => { const w = Math.floor(legs / 2) + 1, o = []; for (let l = 0; l < w; l++) { o.push([w, l]); o.push([l, w]); } return o; };
  let maxLevel = 0;
  const walk = (i, x, y) => { if (i === DEFAULTS.length) { if (x === y) maxLevel = Math.max(maxLevel, x); return; } outcomes(DEFAULTS[i].legs).forEach(([p, q]) => walk(i + 1, x + p, y + q)); };
  walk(0, 0, 0);
  assert.ok(maxLevel > 0 && maxLevel + 1 <= f('teamMatchCap')(t, 'ko'), 'level ' + maxLevel + ', cap ' + f('teamMatchCap')(t, 'ko'));
  // where the tick can not be switched on (a stage the format lacks), only the deciding leg is offered
  const rr = teamsEvent('roundrobin', 4);
  assert.match(f('teamResultError')(rr, '4', '4', 'ko', null), /One team must have more legs: play one more deciding leg and include it in the totals\.$/);
});

test('Teams: once games have started the format cards and the Knockout type can not be changed (other types unchanged)', () => {
  reset();
  const t = teamsEvent('podknockout', 8, { pods: 2 }); f('generatePods')(t, seededRng(2)); f('podsConfirmAll')(t);
  assert.match(render(2), /<div class="choice selected" onclick="chooseKnockoutFormat\(\)">/);
  t.pods[0].bracket.rounds[0].find((x) => x.aEntryId && x.bEntryId && !x.bye).called = true;
  const html = render(2);
  assert.doesNotMatch(html, /onclick="(setFormatType|chooseKnockoutFormat)\(/);
  assert.match(html, /<div class="choice selected disabled" aria-disabled="true"><strong>Knockout<\/strong>/);
  assert.match(html, /<div class="choice selected disabled" aria-disabled="true"><strong>Group Boards, then finals<\/strong>/);
  assert.match(html, /Games have started, so the format of this Teams event can't change\./);
  f('setFormatType')('roundrobin'); f('chooseKnockoutFormat')();
  assert.equal(t.format.formatType, 'podknockout');
  // Singles with results: as before
  t.eventCreation.competitionUnit = 'Singles';
  assert.match(render(2), /onclick="setFormatType\('knockout'\)"/);
  f('setFormatType')('knockout'); assert.equal(t.format.formatType, 'knockout');
});

test('Save refuses an even best of for any segment and for a tie-breaker in use, and saves nothing', () => {
  reset(); const t = teamsEvent('rrknockout', 8);
  domStub({}); f('setTeamSegmentField')(1, 'legs', '4'); app.document = DOC;
  t.format.saved = false;
  let m = saveStep2();
  assert.equal(m.title, 'Use an odd best of');
  assert.equal(m.body, 'Segment 2 is best of 4. Every segment needs an odd best of (1, 3, 5…), so it can\'t end level. Change it, then save.');
  assert.deepEqual(plain(t.format.teamSegments), DEFAULTS); assert.equal(t.format.saved, false, 'nothing saved');
  assert.ok(run(app, 'teamSegDraft'), 'the draft is kept to fix');
  domStub({}); f('setTeamSegmentField')(1, 'legs', '5'); f('setTeamSegmentField')('tb', 'legs', '2'); app.document = DOC;
  m = saveStep2();
  assert.equal(m.body, 'The tie-breaker is best of 2. It needs an odd best of (1, 3, 5…), so it can\'t end level and always settles the match. Change it, then save.');
  domStub({}); f('setTeamTieBreakerStage')('rr', false); f('setTeamTieBreakerStage')('ko', false); app.document = DOC;
  assert.equal(saveStep2(), null, 'an even tie-breaker no stage uses is fine');
  assert.equal(t.format.saved, true);
  assert.equal(t.format.teamSegments[1].legs, 5);
});

test('a stored result with a blank leg count is not a result: typed 0-0 or a level total get every check', () => {
  reset(); const t = teamsEvent('roundrobin', 4); t.format.teamTieBreaker.inRoundRobin = false;
  f('buildGroups')(t); const g = t.groups[0]; g.gameStarted = true;
  const [a, b] = g.entryIds;
  g.scores = {}; g.scores[f('scoreKey')(a, b)] = { legs1: '', legs2: '' };
  f('promptScore')(g.id, a, b, 'A', 'B');
  assert.match(enter(modals.pop(), 0, 0), /both totals can't be 0/);
  assert.equal(f('teamStoredResult')('', 3), null); assert.equal(f('teamStoredResult')(null, 3), null);
  assert.deepEqual(plain(f('teamStoredResult')('4', 2)), { a: 4, b: 2 });
});

test('a tie-breaker object with only one of the two ticks is read as it is, not as an older one-tick object', () => {
  reset(); const t = teamsEvent('rrknockout', 4);
  t.format.teamTieBreaker = { type: 'doubles', startingScore: 501, legs: 3, inKnockout: true, enabled: false };
  assert.deepEqual(plain(f('teamTieBreakerDef')(t)), { type: 'doubles', startingScore: 501, legs: 3, inRoundRobin: false, inKnockout: true });
  assert.deepEqual(sanitizeTournamentData({ format: { teamTieBreaker: { type: 'doubles', startingScore: 501, legs: 3, inRoundRobin: true, enabled: false } } }).format.teamTieBreaker,
    { type: 'doubles', startingScore: 501, legs: 3, inRoundRobin: true, inKnockout: false });
});

test('saving Format & branding for Teams leaves Best of legs and the knockout legs alone', () => {
  reset(); const t = teamsEvent('knockout', 8, { advanced: true });
  t.format.bestOfLegs = 7; t.format.knockoutLegs.main.early = 9; t.format.knockoutLegs.main.variable = true;
  // even if knockout-legs boxes were somehow on the page, a Teams event does not read them
  const page = { f_rulesnotes: 'Be nice', f_kolegs_main_early: '13', f_kolegs_main_final: '15' };
  app.document = { getElementById: (id) => (id in page ? { value: page[id] } : null) };
  f('saveStage2')();
  app.document = DOC;
  assert.equal(t.format.bestOfLegs, 7); assert.equal(t.format.knockoutLegs.main.early, 9); assert.equal(t.format.knockoutLegs.main.final, 5);
  assert.equal(t.format.saved, true); assert.equal(t.format.rulesNotes, 'Be nice');
  assert.deepEqual(plain(t.format.teamSegments), DEFAULTS);
});

/* ---------- round 4: the stuck-Save trap, hidden ticks, mutation gaps, the step 1 type lock ---------- */
test('the Scheduling box works for Group Boards (it used to fail: the estimate had no entries to count), Teams or not', () => {
  reset();
  ['Teams', 'Singles'].forEach((unit) => {
    const t = teamsEvent('podknockout', 8, { pods: 2 }); t.eventCreation.competitionUnit = unit;
    let html = '';
    app.document = { getElementById: () => null };   // the modal's own boxes are not on the page yet: the saved values are used
    assert.doesNotThrow(() => { html = f('schedulingModalTimingHTML')(); }, unit);
    assert.match(html, /Estimated duration:<\/b> ~\d+h/, unit + ': ' + html.slice(0, 60));
    f('generatePods')(t, seededRng(2));
    assert.doesNotThrow(() => f('schedulingModalTimingHTML')(), unit + ' after the draw');
    app.document = DOC;
  });
});
// One knockout result, so the knockout stage has begun.
function beginKnockout(k) { f('checkInAll')(); f('regenerateKnockoutBracket')(); const m = k.knockout.rounds[0].find((x) => x.aEntryId && x.bEntryId && !x.bye); m.aLegs = 6; m.bLegs = 3; m.winnerId = m.aEntryId; return m; }
test('an even tie-breaker that begun matches were played with never blocks Save; one whose settings can change is refused', () => {
  reset();
  // review 3, scenario A: an unused even tie-breaker, the format switched to Knockout, the knockout begins
  const t = teamsEvent('roundrobin', 4);
  domStub({}); f('setTeamTieBreakerStage')('rr', false); f('setTeamSegmentField')('tb', 'legs', '2'); app.document = DOC;
  assert.equal(saveStep2(), null, 'an even tie-breaker no stage uses can be saved');
  assert.deepEqual(plain(t.format.teamTieBreaker), { type: 'foursome', startingScore: 1001, legs: 2, inRoundRobin: false, inKnockout: false }, 'the hidden knockout tick is stored off');
  f('setFormatType')('knockout');
  assert.equal(f('teamTieBreakerFor')(t, 'ko'), null, 'switching to Knockout brings in no tie-breaker nobody saw');
  assert.doesNotMatch(tickHTML(render(2), 'ko'), /" checked onchange/, 'it shows unticked: the organiser chooses');
  beginKnockout(t);
  assert.equal(saveStep2(), null, 'step 2 can still be saved');
  // switching it on now: its settings are still free (no begun stage uses it), so the even best of is refused, then fixed
  domStub({}); f('setTeamTieBreakerStage')('ko', true); app.document = DOC;
  assert.match(saveStep2().body, /^The tie-breaker is best of 2\./);
  assert.equal(t.format.teamTieBreaker.inKnockout, false, 'nothing saved');
  domStub({}); f('setTeamSegmentField')('tb', 'legs', '3'); app.document = DOC;
  assert.equal(saveStep2(), null);
  assert.equal(t.format.teamTieBreaker.inKnockout, true); assert.equal(t.format.teamTieBreaker.legs, 3);
  // review 3, scenario B: an older event whose tie-breaker (used, best of 2) was played with: Save goes through, unchanged
  const old = teamsEvent('knockout', 4);
  old.format.teamTieBreaker = { type: 'foursome', startingScore: 1001, legs: 2, inRoundRobin: true, inKnockout: true };
  beginKnockout(old);
  domStub({ f_rulesnotes: 'x' }); run(app, 'teamDraft()'); app.document = DOC;
  assert.equal(saveStep2(), null);
  assert.equal(old.format.teamTieBreaker.legs, 2); assert.equal(old.format.teamTieBreaker.inKnockout, true);
});

test('an even tie-breaker used only in the knockout is refused before the start, and when switched on after it', () => {
  reset();
  const k = teamsEvent('knockout', 4);
  domStub({}); f('setTeamSegmentField')('tb', 'legs', '4'); app.document = DOC;
  assert.match(saveStep2().body, /^The tie-breaker is best of 4\./, 'a pure knockout (Group Boards alike) can not save an even tie-breaker');
  const g = teamsEvent('podknockout', 8, { pods: 2 });
  domStub({}); f('setTeamSegmentField')('tb', 'legs', '2'); app.document = DOC;
  assert.match(saveStep2().body, /^The tie-breaker is best of 2\./);
  void g;
  // after the start, the segments are locked but an unused tie-breaker's settings are not: still refused
  const late = teamsEvent('knockout', 4); late.format.teamTieBreaker.inKnockout = false; late.format.teamTieBreaker.legs = 2;
  beginKnockout(late);
  domStub({}); f('setTeamTieBreakerStage')('ko', true); app.document = DOC;
  assert.match(saveStep2().body, /^The tie-breaker is best of 2\./);
});

test('an unrelated Save after the knockout began never switches its tie-breaker on', () => {
  reset(); const k = teamsEvent('knockout', 4); k.format.teamTieBreaker.inKnockout = false;
  beginKnockout(k);
  assert.equal(f('teamTieBreakerTickChange')(k, 'ko').canTurnOn, true);
  domStub({ f_rulesnotes: 'New notes' }); run(app, 'teamDraft()'); app.document = DOC;
  assert.equal(saveStep2(), null);
  assert.equal(k.format.teamTieBreaker.inKnockout, false);
});

test('a stored round robin draw does not stop the knockout tie-breaker being switched on', () => {
  reset(); const t = teamsEvent('rrknockout', 4); t.format.teamTieBreaker.inRoundRobin = false; t.format.teamTieBreaker.inKnockout = false;
  f('buildGroups')(t); const g = t.groups[0]; g.gameStarted = true;
  f('setScore')(g, g.entryIds[0], g.entryIds[1], 5, 5);
  t.knockout = run(app, 'generateBracket')(g.entryIds.map((id) => ({ entryId: id, org: '' })), 'Bracket');
  t.knockout.rounds[0][0].called = true;
  assert.equal(f('teamStageStarted')(t, 'ko'), true);
  assert.equal(f('teamTieBreakerTickChange')(t, 'rr').canTurnOn, false);
  assert.equal(f('teamTieBreakerTickChange')(t, 'ko').canTurnOn, true);
  domStub({}); f('setTeamTieBreakerStage')('ko', true); app.document = DOC;
  saveStep2();
  assert.equal(t.format.teamTieBreaker.inKnockout, true);
});

test('a Plate pool result alone begins the knockout stage; a blank/blank record is not a draw', () => {
  reset(); const t = teamsEvent('rrknockout', 4, { plate: true });
  f('buildGroups')(t);
  t.knockoutLosers = run(app, 'generateBracket')(t.groups[0].entryIds.map((id) => ({ entryId: id, org: '' })), 'Plate pool');
  assert.equal(f('teamStageStarted')(t, 'ko'), false);
  const m = t.knockoutLosers.rounds[0].find((x) => x.aEntryId && x.bEntryId); m.aLegs = 6; m.bLegs = 2; m.winnerId = m.aEntryId;
  assert.equal(f('teamStageStarted')(t, 'ko'), true);
  // blank legs are not a stored draw: the round robin tick can still be switched on
  const r = teamsEvent('roundrobin', 4); r.format.teamTieBreaker.inRoundRobin = false;
  f('buildGroups')(r); const g = r.groups[0]; g.gameStarted = true;
  g.scores = {}; g.scores[f('scoreKey')(g.entryIds[0], g.entryIds[1])] = { legs1: '', legs2: '' };
  assert.equal(f('teamRoundRobinHasLevel')(r), false);
  assert.equal(f('teamTieBreakerTickChange')(r, 'rr').canTurnOn, true);
});

test('the tick and tie-breaker handlers refuse what Save would refuse, so the editor never shows a change that is not kept', () => {
  reset(); const t = teamsEvent('roundrobin', 4);
  f('buildGroups')(t); t.groups[0].gameStarted = true;                             // the round robin has begun with its tie-breaker
  domStub({}); f('setTeamTieBreakerStage')('rr', false); f('setTeamSegmentField')('tb', 'legs', '5'); app.document = DOC;
  const d = run(app, 'teamDraft()');
  assert.equal(d.tieBreaker.inRoundRobin, true); assert.equal(d.tieBreaker.legs, 1);
  const html = render(2);
  assert.equal(tickHTML(html, 'rr'), null);
  assert.match(html, /Tie-breaker: Foursome \(1001, best of 1\)/);
});

test('a started Teams event keeps its competition type on step 1; other types are unchanged', () => {
  reset(); const t = teamsEvent('roundrobin', 4);
  f('buildGroups')(t);
  const fields = { f_tname: 'L', f_ename: 'E', f_etype: 'Open', f_unit: 'Singles', f_date: '', f_entries: '4' };
  assert.match(render(1), /<select id="f_unit">/);
  t.groups[0].gameStarted = true;
  const html = render(1);
  assert.match(html, /<select id="f_unit" disabled>[\s\S]*<option value="Teams" selected>Teams<\/option>[\s\S]*Games have started, so a Teams event stays Teams\./);
  app.document = { getElementById: (id) => (id in fields ? { value: fields[id] } : null) };
  f('saveStage1')();
  app.document = DOC;
  assert.equal(t.eventCreation.competitionUnit, 'Teams');
  // a started Singles event: the type can change as before
  t.eventCreation.competitionUnit = 'Singles';
  assert.match(render(1), /<select id="f_unit">/);
  fields.f_unit = 'Doubles';
  app.document = { getElementById: (id) => (id in fields ? { value: fields[id] } : null) };
  f('saveStage1')();
  app.document = DOC;
  assert.equal(t.eventCreation.competitionUnit, 'Doubles');
});

/* ---------- older events ---------- */

function legacy(fmt, extra) {
  const t = f('blankTournament')();
  delete t.format.teamSegments; delete t.format.teamTieBreaker;
  t.eventCreation.competitionUnit = 'Teams';
  Object.assign(t.format, { teamSize: 4, teamMatchFormat: fmt, bestOfLegs: 7 }, extra || {});
  return t;
}
test('migration: a rubber-based Teams event becomes segments (triples -> trios, the flagged rubber -> the tie-breaker in both stages), keeping the old data', () => {
  reset();
  const rubbers = [{ name: 'S1', type: 'singles', startingScore: 501, legs: 3, isTieBreaker: false }, { name: 'T', type: 'triples', startingScore: 701, legs: 5 },
    { name: 'TB', type: 'foursome', startingScore: 1001, legs: 1, isTieBreaker: true }, { name: 'D', type: 'doubles' }];
  const t = legacy('mixed', { mixedRubbers: JSON.parse(JSON.stringify(rubbers)) });
  t.groups = [{ id: 'g1', label: 'A', entryIds: ['a', 'b'], boards: [1], scores: { 'a|b': { legs1: 3, legs2: 2 } } }];
  app.__t = t; run(app, 'migrateTeamSegments(__t)');
  assert.deepEqual(plain(t.format.teamSegments), [{ type: 'singles', startingScore: 501, legs: 3 }, { type: 'trios', startingScore: 701, legs: 5 }, { type: 'doubles', startingScore: 501, legs: 7 }]);
  assert.deepEqual(plain(t.format.teamTieBreaker), { type: 'foursome', startingScore: 1001, legs: 1, inRoundRobin: true, inKnockout: true });
  assert.deepEqual(plain(t.format.mixedRubbers), rubbers, 'the old rubbers are never changed');
  assert.equal(t.format.teamMatchFormat, 'mixed'); assert.equal(t.format.teamSize, 4);
  assert.deepEqual(plain(t.groups[0].scores), { 'a|b': { legs1: 3, legs2: 2 } }, 'scores stay as numbers');
  const once = JSON.stringify(t);
  run(app, 'migrateTeamSegments(__t)');
  assert.equal(JSON.stringify(t), once, 'it runs once only');
});

test('migration: a foursome Teams event becomes one Foursome segment with its best of; without a flagged rubber there is no tie-breaker', () => {
  reset();
  const t = legacy('foursome', { mixedRubbers: [{ name: 'x', type: 'singles' }] });
  app.__t = t; run(app, 'migrateTeamSegments(__t)');
  assert.deepEqual(plain(t.format.teamSegments), [{ type: 'foursome', startingScore: 501, legs: 7 }]);
  assert.deepEqual(plain(t.format.teamTieBreaker), Object.assign({}, TB_DEFAULT, { inRoundRobin: false, inKnockout: false }));
  assert.equal(f('teamMatchCap')(t, 'rr'), 4);
  const m = legacy('mixed', { mixedRubbers: [{ name: 'a', type: 'singles', legs: 3 }, { name: 'b', type: 'doubles', legs: 3 }] });
  app.__t = m; run(app, 'migrateTeamSegments(__t)');
  assert.equal(m.format.teamSegments.length, 2); assert.equal(m.format.teamTieBreaker.inRoundRobin, false); assert.equal(m.format.teamTieBreaker.inKnockout, false);
  const lone = legacy('mixed', { mixedRubbers: [{ name: 'only', type: 'foursome', legs: 3, isTieBreaker: true }] });
  app.__t = lone; run(app, 'migrateTeamSegments(__t)');
  assert.deepEqual(plain(lone.format.teamSegments), [{ type: 'foursome', startingScore: 501, legs: 3 }]);
  assert.equal(lone.format.teamTieBreaker.inKnockout, false);
  const veryOld = legacy(undefined); delete veryOld.format.qualifiersPerGroup;   // saved before the team format existed: it played the foursome
  app.__t = veryOld; run(app, 'migrateTeamSegments(__t)');
  assert.deepEqual(plain(veryOld.format.teamSegments), [{ type: 'foursome', startingScore: 501, legs: 7 }]);
  const noSetup = legacy(undefined);                                               // a Teams event with no stored setup at all (e.g. a corrupt list removed)
  app.__t = noSetup; run(app, 'migrateTeamSegments(__t)');
  assert.deepEqual(plain(noSetup.format.teamSegments), DEFAULTS);
  assert.deepEqual(plain(noSetup.format.teamTieBreaker), TB_DEFAULT);
});

test('migration: other events get the defaults; an event with segments keeps them, and a one-tick tie-breaker gets both stage ticks', () => {
  reset();
  ['Singles', 'Doubles', 'Triples'].forEach((unit) => {
    const t = legacy('mixed', { mixedRubbers: [{ name: 'S', type: 'singles', legs: 9 }] }); t.eventCreation.competitionUnit = unit;
    app.__t = t; run(app, 'migrateTeamSegments(__t)');
    assert.deepEqual(plain(t.format.teamSegments), DEFAULTS, unit);
    assert.deepEqual(plain(t.format.teamTieBreaker), TB_DEFAULT, unit);
  });
  const own = f('blankTournament')(); own.eventCreation.competitionUnit = 'Teams';
  own.format.teamSegments = [{ type: 'trios', startingScore: 301, legs: 5 }];
  own.format.teamTieBreaker = { enabled: true, type: 'doubles', startingScore: 501, legs: 3 };
  app.__t = own; run(app, 'migrateTeamSegments(__t)');
  assert.deepEqual(plain(own.format.teamSegments), [{ type: 'trios', startingScore: 301, legs: 5 }]);
  assert.deepEqual(plain(own.format.teamTieBreaker), { type: 'doubles', startingScore: 501, legs: 3, inRoundRobin: true, inKnockout: true });
  own.format.teamTieBreaker = { enabled: false, type: 'doubles', startingScore: 501, legs: 3 };
  run(app, 'migrateTeamSegments(__t)');
  assert.equal(own.format.teamTieBreaker.inRoundRobin, false);
});

test('opening an older Teams event through the real load migrates it, and stages 1 to 7 render', () => {
  reset();
  const t = legacy('mixed', { mixedRubbers: [{ name: 'S1', type: 'singles', startingScore: 501, legs: 3 }, { name: 'T', type: 'triples', startingScore: 501, legs: 3 }] });
  t.eventCreation.saved = true; t.eventCreation.entries = 4; t.format.saved = true;
  t.entriesList = ['A', 'B', 'C', 'D'].map((x, i) => ({ id: 'e' + i, name: 'Team ' + x, org: '', players: ['p' + i, '', ''], withdrawn: false }));
  app.paintSaveStatus = () => {}; app.migrateLogoIfNeeded = () => {};
  run(app, 'teamSegDraft = {id:"t_old", segments:[], tieBreaker:{}}');
  run(app, 'loadTournamentRow')('t_old', { data: JSON.parse(JSON.stringify(t)), updated_at: '2026-10-20T10:00:00.000Z' });
  assert.equal(run(app, 'teamSegDraft'), null, 'a load drops any unsaved segment draft');
  const s = run(app, 'state');
  assert.deepEqual(plain(s.format.teamSegments.map((x) => x.type)), ['singles', 'trios']);
  assert.deepEqual(plain(s.entriesList[0].players), ['p0', '', ''], 'the roster is left as stored');
  const html = allStages('loaded');
  assert.doesNotMatch(html, /p0|placeholder="Player/);
});

/* ---------- the sanitiser ---------- */
test('the sanitiser keeps good segments as they are and cleans bad ones (types, numbers, ticks, extra keys, a broken list)', () => {
  const good = { format: { teamSegments: DEFAULTS.map((s) => Object.assign({}, s)), teamTieBreaker: Object.assign({}, TB_DEFAULT) } };
  assert.deepEqual(sanitizeTournamentData(JSON.parse(JSON.stringify(good))), good);
  const evil = '"><img src=x onerror=alert(1)>';
  const bad = sanitizeTournamentData({ format: {
    teamSegments: [{ type: 'triples', startingScore: '701', legs: '5' }, { type: evil, startingScore: evil, legs: evil, name: evil }, null, 'x', [1], { type: 'doubles', legs: 400, startingScore: 99999 }],
    teamTieBreaker: { inRoundRobin: true, inKnockout: 'yes', type: 'TRIOS', startingScore: 0, legs: 2, extra: evil } } });
  assert.deepEqual(bad.format.teamSegments, [{ type: 'trios', startingScore: 701, legs: 5 }, { type: 'singles', startingScore: 501, legs: 3 }, { type: 'doubles', startingScore: 10000, legs: 99 }]);
  assert.deepEqual(bad.format.teamTieBreaker, { type: 'singles', startingScore: 501, legs: 2, inRoundRobin: true, inKnockout: false });
  assert.deepEqual(sanitizeTournamentData({ format: { teamTieBreaker: { enabled: true, type: 'doubles', startingScore: 501, legs: 3 } } }).format.teamTieBreaker,
    { type: 'doubles', startingScore: 501, legs: 3, inRoundRobin: true, inKnockout: true }, 'a one-tick tie-breaker');
  const gone = sanitizeTournamentData({ format: { teamSegments: 'abc', teamTieBreaker: 5 } });
  assert.equal('teamSegments' in gone.format, false); assert.equal('teamTieBreaker' in gone.format, false);
  assert.equal('teamSegments' in sanitizeTournamentData({ format: { teamSegments: [] } }).format, false);
  assert.equal(sanitizeTournamentData({ format: { teamSegments: Array.from({ length: 60 }, () => ({ type: 'singles' })) } }).format.teamSegments.length, 50);
  assert.doesNotThrow(() => sanitizeTournamentData({ format: { teamSegments: [{}], teamTieBreaker: {} } }));
  // the app reads stored data the same way: arrays are not segments, numbers are bounded alike
  reset(); const t = teamsEvent('roundrobin');
  t.format.teamSegments = [[1], { type: 'doubles', legs: 400, startingScore: 99999 }];
  assert.deepEqual(plain(f('teamSegmentsOf')(t)), [{ type: 'doubles', startingScore: 10000, legs: 99 }]);
});

/* ---------- result entry ---------- */
test('round robin with the tie-breaker (the default): capped at 10, a level total refused, nothing typed is changed to the cap', () => {
  reset(); const t = teamsEvent('roundrobin', 4);
  f('buildGroups')(t); const g = t.groups[0]; g.confirmed = true; g.gameStarted = true;
  const [a, b] = g.entryIds;
  f('promptScore')(g.id, a, b, 'Team A', 'Team B');
  const m = modals.pop();
  assert.match(m.bodyHTML, /max="10"/);
  assert.doesNotMatch(m.bodyHTML, /Math\.min/, 'the boxes do not change what is typed to the cap');
  assert.match(m.bodyHTML, /Enter the total legs each team won across all 5 segments, including the tie-breaker if it was played\. A team can win at most 10 legs\. The totals can't be level: if they are level after the main segments, play the tie-breaker and include its legs\./);
  assert.doesNotMatch(m.bodyHTML, /<select|rubber|Best of|draw/i, 'one plain result, no per-segment entry, no draw');
  assert.equal(m.confirmLabel, 'Save score');
  assert.match(enter(m, 12, 3), /^A team can win at most 10 legs in this match \(5 segments \+ tie-breaker\)\. Check the totals\.$/);
  assert.equal(f('getScore')(g, a, b), null, 'refused, not saved as 10');
  assert.match(enter(m, '', 3), /Enter the total legs each team won/);
  assert.match(enter(m, 0, 0), /both totals can't be 0/);
  assert.match(enter(m, 5, 5), /^The totals can't be level: this round robin match uses the tie-breaker\. Play it and include its legs in the totals\.$/);
  assert.equal(enter(m, 10, 4), null);
  assert.deepEqual(plain(f('getScore')(g, a, b)), a < b ? { legs1: 10, legs2: 4 } : { legs1: 4, legs2: 10 });
});

test('round robin without the tie-breaker: capped at 9, a level total is a draw; standings use the totals', () => {
  reset(); const t = teamsEvent('roundrobin', 4); t.format.teamTieBreaker.inRoundRobin = false;
  f('buildGroups')(t); const g = t.groups[0]; g.confirmed = true; g.gameStarted = true;
  const [a, b, c] = g.entryIds;
  f('promptScore')(g.id, a, b, 'Team A', 'Team B');
  const m = modals.pop();
  assert.match(m.bodyHTML, /max="9"/);
  assert.match(m.bodyHTML, /A team can win at most 9 legs\. Level totals are a draw \(1 point each\)\./);
  assert.doesNotMatch(m.bodyHTML, /tie-breaker/);
  assert.match(enter(m, 10, 2), /at most 9 legs/);
  assert.equal(enter(m, 7, 2), null);
  f('promptScore')(g.id, a, c, 'Team A', 'Team C');
  assert.equal(enter(modals.pop(), 5, 5), null, 'level is a draw here');
  f('promptScore')(g.id, a, b, 'Team A', 'Team B');
  assert.match(modals.pop().bodyHTML, /id="scA" type="number" min="0" max="9"[^>]*value="7"/, 'reopening shows the saved totals');
  const st = f('computeStandings')(g); const A = st.find((x) => x.id === a);
  assert.equal(A.pts, 3); assert.equal(A.legsFor, 12); assert.equal(A.legsAgainst, 7); assert.equal(A.wins, 1); assert.equal(A.draws, 1);
  // in round robin -> knockout the round robin follows its own tick, the knockout its own
  const rk = teamsEvent('rrknockout', 4); rk.format.teamTieBreaker.inRoundRobin = false;
  f('buildGroups')(rk); const rg = rk.groups[0]; rg.gameStarted = true;
  f('promptScore')(rg.id, rg.entryIds[0], rg.entryIds[1], 'x', 'y');
  assert.equal(enter(modals.pop(), 4, 4), null);
});

test('a stored result above the cap (an older event, or a lower cap) can be saved again unchanged, but not changed to another over-cap total', () => {
  reset(); const t = teamsEvent('roundrobin', 4); t.format.teamTieBreaker.inRoundRobin = false;
  f('buildGroups')(t); const g = t.groups[0]; g.gameStarted = true;
  const [a, b] = g.entryIds;
  f('setScore')(g, a, b, 12, 3);
  f('promptScore')(g.id, a, b, 'A', 'B');
  const m = modals.pop();
  assert.match(m.bodyHTML, /value="12"/);
  assert.equal(enter(m, 12, 3), null, 'unchanged: saved again');
  assert.match(enter(m, 12, 4), /at most 9 legs/);
  // knockout too
  const k = teamsEvent('knockout', 4); f('checkInAll')(); f('regenerateKnockoutBracket')();
  const km = k.knockout.rounds[0][0]; km.aLegs = 4; km.bLegs = 11; km.winnerId = km.bEntryId;
  f('koMatchScoreModal')('knockout', 0, 0);
  const kmod = modals.pop();
  assert.equal(enter(kmod, 4, 11), null);
  assert.match(enter(kmod, 4, 12), /at most 10 legs/);
});

test('knockout with the tie-breaker: cap 10, a level total refused (play the tie-breaker); the winner goes through', () => {
  reset(); const t = teamsEvent('knockout', 4);
  f('checkInAll')(); f('regenerateKnockoutBracket')();
  const m0 = t.knockout.rounds[0][0];
  f('koMatchScoreModal')('knockout', 0, 0);
  const m = modals.pop();
  assert.match(m.bodyHTML, /max="10"/); assert.doesNotMatch(m.bodyHTML, /Math\.min/);
  assert.match(m.bodyHTML, /The totals can't be level: if they are level after the main segments, play the tie-breaker and include its legs\./);
  assert.match(enter(m, 5, 5), /^The totals can't be level: this knockout match uses the tie-breaker\. Play it and include its legs in the totals\.$/);
  assert.match(enter(m, 3, 12), /at most 10 legs/);
  assert.equal(m0.winnerId, null);
  assert.equal(enter(m, 4, 6), null);
  assert.equal(m0.winnerId, m0.bEntryId); assert.equal(m0.aLegs, 4); assert.equal(m0.bLegs, 6);
  assert.equal(t.knockout.rounds[1][0].aEntryId, m0.bEntryId, 'the winner moves on');
});

test('knockout without the tie-breaker: cap 9, a level total still refused, and the message says how to add a knockout tie-breaker', () => {
  reset(); const t = teamsEvent('knockout', 4); t.format.teamTieBreaker.inKnockout = false;
  t.format.teamTieBreaker.inRoundRobin = true;                                      // has no effect: this format has no round robin
  f('checkInAll')(); f('regenerateKnockoutBracket')();
  f('koMatchScoreModal')('knockout', 0, 0);
  const m = modals.pop();
  assert.match(m.bodyHTML, /max="9"/);
  assert.match(m.bodyHTML, /A team can win at most 9 legs\. Knockout matches can't end level\.<\/p>/);
  assert.match(enter(m, 4, 4), /^This is a knockout match — it can't end level\. One team must have more legs: tick "Use a tie-breaker in knockout matches" in Format & branding to play the tie-breaker, or play one more deciding leg and include it in the totals\.$/);
  assert.match(enter(m, 10, 2), /at most 9 legs/);
  assert.equal(enter(m, 5, 4), null);
});

test('Group Boards follows the knockout tick, in the group brackets and the Finals', () => {
  reset();
  [true, false].forEach((tb) => {
    const t = teamsEvent('podknockout', 8, { pods: 2 }); t.format.teamTieBreaker.inKnockout = tb;
    f('generatePods')(t, seededRng(3)); f('podsConfirmAll')(t);
    const pod = t.pods[0]; const key = 'pod:' + pod.id;
    const mi = pod.bracket.rounds[0].findIndex((m) => m.aEntryId && m.bEntryId && !m.bye);
    f('koMatchScoreModal')(key, 0, mi);
    const m = modals.pop();
    assert.match(m.bodyHTML, new RegExp('max="' + (tb ? 10 : 9) + '"'));
    assert.match(enter(m, 6, 6), tb ? /uses the tie-breaker/ : /can't end level\. One team must have more legs/);
    assert.equal(enter(m, 7, 3), null);
    assert.ok(pod.bracket.rounds[0][mi].winnerId);
  });
});

test('walkovers for Teams give the winner every main segment (9-0 with the defaults), in round robin and knockout', () => {
  reset(); const t = teamsEvent('roundrobin', 4);
  f('buildGroups')(t); const g = t.groups[0]; g.confirmed = true; g.gameStarted = true;
  const a = g.entryIds[0];
  f('openNoShowPicker')(g.id);
  assert.match(modals.pop().bodyHTML, /filled in as a 9–0 walkover loss/);
  f('markGroupNoShow')(g.id, a);
  const sc = f('getScore')(g, a, g.entryIds[1]);
  assert.equal(sc.wo, true);
  assert.deepEqual([sc.legs1, sc.legs2].sort(), [0, 9]);
  const k = teamsEvent('knockout', 4); f('checkInAll')(); f('regenerateKnockoutBracket')();
  f('openKoNoShowPicker')('knockout', 0, 0);
  assert.match(modals.pop().bodyHTML, /advanced as a 9–0 walkover win/);
  f('markKnockoutNoShow')('knockout', 0, 0, 'a');
  const km = k.knockout.rounds[0][0];
  assert.equal(km.bLegs, 9); assert.equal(km.aLegs, 0); assert.equal(km.winnerId, km.bEntryId); assert.equal(km.wo, true);
  f('markKnockoutVoid')('knockout', 0, 1);
  f('koMatchScoreModal')('knockout', 0, 1);
  assert.match(modals.pop().bodyHTML, /Neither team attended/);
});

test('Singles and Doubles result entry is unchanged: best of, the majority rule, the clamp, no level results', () => {
  reset();
  ['Singles', 'Doubles'].forEach((unit) => {
    const t = teamsEvent('roundrobin', 4); t.eventCreation.competitionUnit = unit;
    f('buildGroups')(t); const g = t.groups[0]; g.confirmed = true; g.gameStarted = true;
    f('promptScore')(g.id, g.entryIds[0], g.entryIds[1], 'x', 'y');
    const m = modals.pop();
    assert.match(m.bodyHTML, /<p style="font-size:11px;color:#8a97a5">Best of 5 legs — a side can score at most 3\.<\/p>/);
    assert.match(m.bodyHTML, /max="3" step="1" oninput="this\.value=this\.value===''\?'':Math\.min\(Math\.max\(parseInt\(this\.value\)\|\|0,0\),3\)"/);
    assert.match(enter(m, 2, 2), /^Not a valid finished result for best of 5 legs — the winner must have exactly 3 legs, and the loser fewer\. \(e\.g\. 3–0 up to 3–2\)\.$/);
    assert.match(enter(m, 4, 0), /Not a valid finished result/);
    assert.equal(enter(m, 3, 2), null);
    const k = teamsEvent('knockout', 4); k.eventCreation.competitionUnit = unit; f('checkInAll')(); f('regenerateKnockoutBracket')();
    f('koMatchScoreModal')('knockout', 0, 0);
    const km = modals.pop();
    assert.match(km.bodyHTML, /Best of 5 legs — a side can score at most 3\. Knockout matches can\\?'t end in a draw\./);
    assert.match(km.bodyHTML, /Math\.min\(Math\.max\(parseInt\(this\.value\)\|\|0,0\),3\)/);
    assert.match(enter(km, 3, 3), /^This is a knockout match — it can't end in a draw\. One side must win\.$/);
    assert.equal(enter(km, 3, 1), null);
    f('openKoNoShowPicker')('knockout', 0, 1);
    assert.match(modals.pop().bodyHTML, /advanced as a 3–0 walkover win/);
  });
});

/* ---------- time estimate ---------- */
test('time estimate: a Teams match is every segment\'s legs, the tie-breaker\'s included only in a stage that uses it', () => {
  reset(); const t = teamsEvent('rrknockout', 8);
  assert.equal(f('teamMatchTotalLegs')(t, 'rr'), 14);                                     // 1+3+3+3+3 + 1
  assert.equal(f('matchDurationMinutes')(t, { isKnockout: false }), 100);                 // 14 legs x 7 min (amateur), to the next 5
  assert.equal(f('matchDurationMinutes')(t, { isKnockout: true, legs: 11 }), 100, 'a round\'s best-of does not apply');
  t.format.teamTieBreaker.inRoundRobin = false;
  assert.equal(f('matchDurationMinutes')(t, { isKnockout: false }), 95);                  // 13 x 7 = 91
  assert.equal(f('matchDurationMinutes')(t, { isKnockout: true }), 100, 'the knockout keeps its tie-breaker');
  t.format.teamTieBreaker.inKnockout = false;
  t.format.levelOfPlay = 'professional';
  assert.equal(f('matchDurationMinutes')(t, { isKnockout: true }), 65);                   // 13 x 5
  const s = teamsEvent('roundrobin', 8); s.eventCreation.competitionUnit = 'Singles';
  assert.equal(f('matchDurationMinutes')(s, { isKnockout: false }), 35, 'Singles: best of 5 x 7');
  ['roundrobin', 'knockout', 'rrknockout', 'podknockout'].forEach((ft) => {
    const x = teamsEvent(ft, 8, { pods: 2 });
    const before = f('estimateTotalMinutes')(x).minutes;
    x.format.teamSegments.push({ type: 'singles', startingScore: 501, legs: 9 });
    assert.ok(f('estimateTotalMinutes')(x).minutes > before, ft);
  });
  // the estimate on step 2 follows the unsaved draft
  const d = teamsEvent('roundrobin', 8);
  domStub({});
  const est = () => f('estimateTotalMinutes')(f('schedulingModalDraft')()).minutes;
  const before = est();
  f('addTeamSegment')();
  assert.ok(est() > before);
  app.document = DOC; void d;
});

/* ---------- printing ---------- */
// The blocks of a lineup card in order: [title, height px from the inline style or 'css', number of name lines].
function lineupBlocks(card) {
  return card.split(/(?=<div class="lineup-seg[ "])/).slice(1).map((s) => {
    const title = (s.match(/<div class="lineup-seg-title">([^<]*)/) || [])[1].trim();
    const h = (s.match(/^<div class="lineup-seg[^"]*" style="height:(\d+)px"/) || [])[1];
    return [title, h ? parseInt(h, 10) : 'css', (s.split('<div class="lineup-sig">')[0].match(/class="lineup-line"/g) || []).length];
  });
}
test('the lineup sheet: a bar per segment, TIE-BREAKER before the last block TOTAL POINTS, half-height Singles, a large signature area', () => {
  reset(); const t = teamsEvent('rrknockout', 4);
  t.format.teamSegments.push({ type: 'trios', startingScore: 701, legs: 3 });
  t.format.teamTieBreaker.inRoundRobin = false;
  const [a, b] = t.entriesList;
  const ko = f('lineupCardHTML')(a, b, { groupLabel: 'Bracket', board: 'Final', gameNo: 1, stage: 'ko' });
  const titles2 = [...ko.matchAll(/<div class="lineup-seg-title">([^<]*) <small>([^<]*)<\/small>/g)].map((m) => m[1] + ' | ' + m[2]);
  assert.deepEqual(titles2, ['FOURSOME 1 | 1001 x 1 Leg', 'SINGLES 1 | 501 x 3 Legs', 'DOUBLES 1 | 501 x 3 Legs', 'SINGLES 2 | 501 x 3 Legs', 'DOUBLES 2 | 501 x 3 Legs', 'TRIOS 1 | 701 x 3 Legs', 'TIE-BREAKER | 1001 x 1 Leg']);
  const blocks = lineupBlocks(ko);
  assert.deepEqual(blocks.map((x) => x[0].split(' ')[0]), ['FOURSOME', 'SINGLES', 'DOUBLES', 'SINGLES', 'DOUBLES', 'TRIOS', 'TIE-BREAKER', 'TOTAL'], 'TOTAL POINTS is last, after the tie-breaker');
  assert.deepEqual(blocks.map((x) => x[2]), [4, 1, 2, 1, 2, 3, 4, 0], 'numbered name lines per type');
  const H = blocks[0][1], h2 = Math.round(H / 2);
  assert.deepEqual(blocks.map((x) => x[1]), [H, h2, H, h2, H, H, H, 'css'], 'fixed heights: Singles half of the others; TOTAL POINTS a fixed CSS block');
  assert.ok(H < 120, 'six full segments shrink a little to keep the signature space');
  t.format.teamSegments = DEFAULTS.map((s) => Object.assign({}, s));
  assert.deepEqual(lineupBlocks(f('lineupCardHTML')(a, b, { groupLabel: 'A', board: 1, gameNo: 1, stage: 'ko' })).map((x) => x[1]), [120, 60, 120, 60, 120, 120, 'css'], 'the defaults: full size');
  t.format.teamSegments.push({ type: 'trios', startingScore: 701, legs: 3 });
  assert.equal((ko.match(/<div class="lineup-seg-pts">Points<\/div>/g) || []).length, 7);
  assert.match(ko, /TOTAL POINTS[\s\S]*<div class="lineup-sig"><div class="lineup-sig-space"><\/div><div class="lineup-sig-line">Captain\/Manager Signature<\/div><\/div>/, 'the signature area comes after TOTAL POINTS');
  assert.match(ko, /<div class="lineup-topline"><div class="logo-placeholder"[^>]*>[\s\S]*?<\/div><div class="lineup-teamname"><span class="tag">Team Name<\/span>Team A<\/div><\/div>/, 'the logo box beside the team name');
  assert.match(ko, /vs Team B/);
  // without the tie-breaker (this round robin does not use it): TOTAL POINTS follows the main segments
  const rr = f('lineupCardHTML')(a, b, { groupLabel: 'A', board: 2, gameNo: 1, stage: 'rr' });
  assert.doesNotMatch(rr, /TIE-BREAKER/);
  assert.deepEqual(lineupBlocks(rr).map((x) => x[0].split(' ')[0]).slice(-2), ['TRIOS', 'TOTAL']);
  assert.match(ko, /^<div class="lineup-card">/, 'the usual spacing');
  // the CSS that makes it work: fixed segments, a compact TOTAL POINTS (half the old ~128px), a flexible signature area
  const css = require('fs').readFileSync(require('path').join(__dirname, '..', 'app.html'), 'utf8');
  ['.lineup-seg{margin-bottom:5px;display:flex;flex-direction:column;flex:none;overflow:hidden}', '.lineup-seg.lineup-total{height:64px;flex:none}',
    '.lineup-sig{flex:1 1 auto;display:flex;flex-direction:column;min-height:98px;', '.lineup-sig-space{flex:1 1 auto;min-height:84px}', '.lineup-sig-line{border-top:1px solid #9aa5b1;']
    .forEach((rule) => assert.ok(css.includes(rule), rule));
  // the heights always leave the signature area its minimum in the smallest box (the 948px preview card), up to 8 segments + a tie-breaker
  const room = (list) => { const h = f('lineupSegmentHeight')(list); return list.reduce((n, s) => n + (s.type === 'singles' ? Math.round(h / 2) : h) + 5, 0); };
  const max = run(app, 'LINEUP_CARD_H - LINEUP_FIXED_H - LINEUP_SIG_MIN');
  [['foursome'], ['singles'], ['trios'], ['doubles']].forEach(([ty]) => {
    for (let n = 1; n <= 9; n++) {
      const list = Array.from({ length: n }, () => ({ type: ty, startingScore: 501, legs: 3 }));
      assert.ok(room(list) <= max, ty + ' x ' + n + ': ' + room(list) + ' > ' + max);
    }
  });
  // the most a sheet can hold (8 foursomes and a foursome tie-breaker) is smaller, with the tighter lines
  t.format.teamSegments = Array.from({ length: 8 }, () => ({ type: 'foursome', startingScore: 1001, legs: 1 }));
  const big = f('lineupCardHTML')(a, b, { groupLabel: 'B', board: 'F', gameNo: 1, stage: 'ko' });
  assert.match(big, /^<div class="lineup-card dense">/);
  assert.ok(lineupBlocks(big).slice(0, 9).every((x) => x[1] === 65), JSON.stringify(lineupBlocks(big)));
  // in the pack: round robin sheets without, knockout sheets with
  f('buildGroups')(t); t.groups.forEach((g) => { g.confirmed = true; });
  assert.doesNotMatch(f('teamLineupSheetsHTML')(), /TIE-BREAKER/);
});

test('the lineup tick box is offered for every Teams event (and no other type), and prints one sheet per fixture in each format', () => {
  reset();
  ['Singles', 'Doubles', 'Triples'].forEach((unit) => { const x = teamsEvent('roundrobin', 4); x.eventCreation.competitionUnit = unit; assert.equal(f('lineupSheetToggleHTML')(), '', unit); });
  const rr = teamsEvent('roundrobin', 8); f('buildGroups')(rr); rr.groups.forEach((g) => { g.confirmed = true; });
  assert.match(f('lineupSheetToggleHTML')(), /id="lineupToggle"/);
  assert.match(render(4), /id="lineupToggle"/); assert.match(render(7), /id="lineupToggle"/);
  rr.printSettings.lineupSheetEnabled = true;
  const fixtures = rr.groups.reduce((n, g) => n + f('groupMatches')(g).length, 0);
  assert.equal((printPack(rr).match(/class="print-sheet lineup-sheet"/g) || []).length, fixtures);
  rr.printSettings.lineupSheetEnabled = false;
  assert.doesNotMatch(printPack(rr), /lineup-sheet/);
  const ko = teamsEvent('knockout', 8); f('checkInAll')(); f('regenerateKnockoutBracket')();
  assert.match(render(4), /id="lineupToggle"/); assert.match(render(7), /id="lineupToggle"/);
  ko.printSettings.lineupSheetEnabled = true;
  assert.equal((printPack(ko).match(/class="print-sheet lineup-sheet"/g) || []).length, 4);
  const pb = teamsEvent('podknockout', 8, { pods: 2 }); f('generatePods')(pb, seededRng(4)); f('podsConfirmAll')(pb);
  assert.match(render(4), /id="lineupToggle"/); assert.match(render(7), /id="lineupToggle"/);
  pb.printSettings.lineupSheetEnabled = true;
  const pods = printPack(pb);
  const playable = pb.pods.reduce((n, p) => n + p.bracket.rounds[0].filter((m) => m.aEntryId && m.bEntryId && !m.bye).length, 0);
  assert.equal((pods.match(/class="print-sheet lineup-sheet"/g) || []).length, playable);
  assert.match(pods, /<div class="bar">Group<\/div><div class="box">Group \d+<\/div>/);
  // once the group winners are known, the Finals fixtures get their own sheets too
  pb.pods.forEach((p) => p.bracket.rounds.forEach((round, ri) => round.forEach((m, mi) => {
    if (!m.aEntryId || !m.bEntryId || m.bye || m.winnerId) return;
    f('koMatchScoreModal')('pod:' + p.id, ri, mi); assert.equal(enter(modals.pop(), 7, 2), null);
  })));
  const fin = f('podsFinals')(pb);
  const finReady = fin.rounds.reduce((n, r) => n + r.filter((m) => m.aEntryId && m.bEntryId && !m.bye).length, 0);
  assert.ok(finReady >= 1, 'a Finals fixture with both teams known');
  const finLabel = fin.label || 'Finals';
  const finSheets = (printPack(pb).match(new RegExp('<div class="bar">Group</div><div class="box">' + finLabel + '</div>', 'g')) || []).length;
  assert.equal(finSheets, finReady * 2, 'one sheet per Finals fixture (two cards each)');
  // Group Boards screens speak of teams (and pairs for Doubles), players for Singles
  assert.match(render(4), /— 4 teams · Board/);
  assert.match(f('podsSummaryHTML')(8, 2), /2 groups of 4 teams\./);
  pb.eventCreation.competitionUnit = 'Doubles'; assert.match(f('podsSummaryHTML')(8, 2), /4 pairs\./);
  pb.eventCreation.competitionUnit = 'Singles'; assert.match(f('podsSummaryHTML')(8, 2), /4 players\./);
});

test('the rules sheet follows the tie-breaker of each stage, with no contradiction; headers name the segments, never a best of', () => {
  reset();
  const SEGS = 'Each match has 5 segments: Foursome (1001, best of 1), Singles (501, best of 3), Doubles (501, best of 3), Singles (501, best of 3), Doubles (501, best of 3).';
  const lines = (t) => plain(f('formatDescriptionLines')(t)).join('\n');
  // round robin with the tie-breaker: no draws anywhere
  const rr = teamsEvent('roundrobin', 8);
  let L = lines(rr);
  assert.ok(L.includes(SEGS + ' Tie-breaker if the totals are level: Foursome (1001, best of 1). The team with more total legs wins.'), L);
  assert.match(L, /Scoring: Win = 2 points, Loss = 0 points\. .*level totals go to the tie-breaker, so there are no draws\./);
  assert.doesNotMatch(L, /[Dd]raw = 1|are a draw/);
  // round robin without: draws, and no tie-breaker named
  rr.format.teamTieBreaker.inRoundRobin = false;
  L = lines(rr);
  assert.match(L, /Win = 2 points, Draw = 1 point, Loss = 0 points\. .*level totals are a draw\./);
  assert.doesNotMatch(L, /[Tt]ie-breaker/);
  // round robin -> knockout, the knockout only
  const rk = teamsEvent('rrknockout', 8, { plate: true }); rk.format.teamTieBreaker.inRoundRobin = false;
  L = lines(rk);
  assert.match(L, /Group stage scoring: Win = 2 points, Draw = 1 point/);
  assert.match(L, /Knockout stage matches \(and the Plate pool\) use the same segments and cannot end level: level totals go to the tie-breaker\./);
  assert.ok(L.includes(SEGS + ' Tie-breaker in knockout matches if the totals are level: Foursome (1001, best of 1).'), L);
  rk.format.teamTieBreaker.inRoundRobin = true; rk.format.teamTieBreaker.inKnockout = false;
  assert.ok(lines(rk).includes(' Tie-breaker in round robin matches if the totals are level'));
  assert.match(lines(rk), /use the same segments and cannot end level\.\n/);
  // knockout and Group Boards
  const ko = teamsEvent('knockout', 8); ko.format.knockoutLegs.main.variable = true;
  assert.match(lines(ko), /Knockout matches cannot end level: level totals go to the tie-breaker\./);
  const gb = teamsEvent('podknockout', 8, { pods: 2 }); gb.format.teamTieBreaker.inKnockout = false;
  L = lines(gb);
  assert.match(L, /^Format: Knockout, Group Boards then finals — teams are drawn into 2 groups\./);
  assert.match(L, /in the groups and the Finals alike\. Knockout matches cannot end level\./);
  assert.doesNotMatch(L, /[Tt]ie-breaker/);
  [rr, rk, ko, gb].forEach((t) => assert.doesNotMatch(lines(t), /best of 5|first to|Legs increase|named players|rubber/i));
  const one = teamsEvent('roundrobin', 8); one.format.teamTieBreaker.inRoundRobin = false; one.format.teamSegments = [{ type: 'trios', startingScore: 701, legs: 5 }];
  assert.ok(plain(f('formatDescriptionLines')(one)).includes('Each match has 1 segment: Trios (701, best of 5). The team with more total legs wins.'));
  // headers
  f('buildGroups')(one); one.groups.forEach((g) => { g.confirmed = true; });
  assert.match(f('chartSheetHTML')(one.groups[0], true), /Team Night<\/div><div class="sheet-sub">Open Teams · Round Robin Stage · 1 segment · 2026-10-25/);
  const k = teamsEvent('knockout', 8); f('checkInAll')(); f('regenerateKnockoutBracket')();
  k.format.knockoutLegs.main.variable = true;
  const sheet = f('knockoutBracketSheetHTML')(k.knockout);
  assert.match(sheet, / · Knockout Stage · 5 segments \+ tie-breaker/);
  assert.match(sheet, /Each match: 5 segments \+ tie-breaker\. Write each team's total legs — no draws, the team with more legs wins\./);
  assert.doesNotMatch(sheet + f('bracketColumnsHTML')(k.knockout, k, { interactive: true }), /Best of/);
  assert.match(f('formatSummaryCard')(), /<label>Team match<\/label><strong>5 segments \+ tie-breaker<\/strong>/);
  assert.match(f('schedulingContextHTML')(), /<b>5 segments \+ tie-breaker<\/b> per match/);
  assert.doesNotMatch(f('formatSummaryCard')() + f('schedulingContextHTML')(), /Best of|best of/);
  const r2 = teamsEvent('rrknockout', 8); r2.format.teamTieBreaker.inRoundRobin = false;
  assert.match(f('formatSummaryCard')(), /5 segments \+ tie-breaker \(knockout\)/);
  // the format names: Group Boards is a knockout
  assert.match(f('formatSummaryCard')(), /<label>Format<\/label><strong>Round Robin → Knockout<\/strong>/);
  teamsEvent('podknockout', 8, { pods: 2 });
  assert.match(f('formatSummaryCard')(), /<label>Format<\/label><strong>Knockout · Group Boards<\/strong>/);
});

/* ---------- whole events ---------- */
// Plays every round robin match through the real result box: the earlier-listed team wins 6-4, and one level 5-5 when the
// round robin has no tie-breaker (a draw).
function playGroups(t) {
  t.groups.forEach((g) => {
    g.gameStarted = true;
    f('groupMatches')(g).forEach(([a, b], i) => {
      f('promptScore')(g.id, a, b, 'a', 'b');
      const level = i === 1 && g.entryIds.length > 3 && !f('teamTieBreakerFor')(t, 'rr');
      const pa = g.entryIds.indexOf(a) < g.entryIds.indexOf(b);
      assert.equal(enter(modals.pop(), level ? 5 : pa ? 6 : 4, level ? 5 : pa ? 4 : 6), null);
    });
  });
}
function playBracket(t, bracket, key) {
  bracket.rounds.forEach((round, ri) => round.forEach((m, mi) => {
    if (!m.aEntryId || !m.bEntryId || m.bye || m.winnerId) return;
    f('koMatchScoreModal')(key, ri, mi);
    assert.equal(enter(modals.pop(), 7, 3), null);
  }));
}
function playKnockout(t, key) {
  const br = () => f('bracketByKey')(t, key);
  for (let r = 0; r < br().rounds.length; r++) playBracket(t, br(), key);
}
const FORBIDDEN = /HANDOUT|[Rr]oster|[Rr]ubber|Players per team|placeholder="Player \d"|setEntryPlayer|Foursome \(quad\)/;
['roundrobin', 'knockout', 'rrknockout', 'podknockout'].forEach((ft) => {
  test('a Teams ' + ft + ' event runs from step 1 to finalize: results as totals, standings, the bracket, printing and the public view', () => {
    reset();
    const t = teamsEvent(ft, ft === 'podknockout' ? 8 : 9, { plate: ft === 'rrknockout', pods: 2, advanced: true });
    t.entriesList[0].players = ['Old', 'Roster', 'Names', 'Here'];                      // an older event's roster: never shown
    t.printSettings.teamHandoutEnabled = true; t.printSettings.lineupSheetEnabled = true;
    t.published = true; t.publicSlug = 'abcdefgh1234';
    if (ft === 'roundrobin') t.format.teamTieBreaker.inRoundRobin = false;   // so this one has draws
    let html = allStages(ft + ' fresh');
    if (ft === 'roundrobin' || ft === 'rrknockout') { f('shuffleGroups')(); f('confirmAllCharts')(); }
    else if (ft === 'knockout') { f('checkInAll')(); f('regenerateKnockoutBracket')(); }
    else { f('generatePods')(t, seededRng(9)); f('podsConfirmAll')(t); }
    html += allStages(ft + ' drawn') + printPack(t);
    assert.equal(f('eventComplete')(t), false);
    if (ft === 'roundrobin' || ft === 'rrknockout') playGroups(t);
    if (ft === 'rrknockout') {
      assert.equal(f('eventComplete')(t), false);
      f('generateKnockoutFromRR')();
      assert.ok(t.knockout); assert.ok(t.knockoutLosers, 'the Plate pool');
      playKnockout(t, 'knockout'); playKnockout(t, 'knockoutLosers');
    }
    if (ft === 'knockout') playKnockout(t, 'knockout');
    if (ft === 'podknockout') {
      t.pods.forEach((p) => { for (let r = 0; r < p.bracket.rounds.length; r++) playBracket(t, p.bracket, 'pod:' + p.id); });
      assert.ok(t.knockout && t.knockout.podFinals);
      playKnockout(t, 'knockout');
    }
    assert.equal(f('eventComplete')(t), true, ft + ' complete');
    if (ft !== 'roundrobin') assert.ok(t.knockout.rounds[t.knockout.rounds.length - 1][0].winnerId, 'a champion');
    html += allStages(ft + ' played');
    const pack = printPack(t);
    html += pack;
    assert.match(pack, /lineup-sheet/);
    if (ft !== 'podknockout') assert.match(pack, /RULES &amp; FORMAT/);
    assert.match(pack, /<svg/, 'QR codes on the sheets');
    assert.doesNotMatch(html, FORBIDDEN);
    assert.doesNotMatch(html, /Old|Roster/);
    assert.match(render(5), /finalizeResults\(\)/);
    modals = []; f('finalizeResults')();
    assert.match(modals[0].title, /Accept results as final/);
    // the public view: totals as legs, nothing about segments or rosters
    const view = toPublicView(JSON.parse(JSON.stringify(t)));
    assert.equal(view.eventCreation.competitionUnit, 'Teams');
    assert.doesNotMatch(JSON.stringify(view), /teamSegments|teamTieBreaker|players|Roster|mixedRubbers/);
    // the page header needs only how many segments a match has and where the tie-breaker is played (see tests/viewer-teams.test.js)
    assert.deepEqual(Object.keys(view.format).filter((k) => /^segment/.test(k)).sort(), ['segmentCount', 'segmentTieBreakerKO', 'segmentTieBreakerRR']);
    assert.equal(view.format.segmentCount, 5);
    if (ft === 'roundrobin') assert.ok(Object.values(view.groups[0].scores).some((s) => s.legs1 === 6 || s.legs2 === 6));
  });
});

test('a Teams event duplicates with its segments and tie-breaker', async () => {
  reset(); const t = teamsEvent('roundrobin', 4);
  t.format.teamSegments = [{ type: 'trios', startingScore: 701, legs: 5 }]; t.format.teamTieBreaker = { type: 'doubles', startingScore: 301, legs: 3, inRoundRobin: false, inKnockout: true };
  app.__t = t; run(app, 'teamSegDraft = { id: __t.id, segments: [{type:"singles",startingScore:301,legs:9}], tieBreaker: {} }');   // an unsaved edit on step 2: not copied
  run(app, 'tournamentsCache = {}; dbUpdatedAtCache = {}; staleIds.clear()');
  app.__t = t; run(app, 'tournamentsCache[__t.id] = __t');
  let stored = null;
  app.apiFetch = async (url, o) => {
    if (o && o.method === 'PUT') { stored = JSON.parse(o.body).data; return { ok: true, status: 200, json: async () => ({ updated_at: 'S1' }) }; }
    return { ok: true, status: 200, json: async () => ({ data: JSON.parse(JSON.stringify(stored)), updated_at: 'S1' }) };
  };
  app.paintSaveStatus = () => {}; app.migrateLogoIfNeeded = () => {};
  await run(app, 'duplicateTournament')(t.id, { stopPropagation() {} });
  const copy = run(app, 'state');
  assert.notEqual(copy.id, t.id);
  assert.deepEqual(plain(copy.format.teamSegments), [{ type: 'trios', startingScore: 701, legs: 5 }]);
  assert.deepEqual(plain(copy.format.teamTieBreaker), { type: 'doubles', startingScore: 301, legs: 3, inRoundRobin: false, inKnockout: true });
  assert.equal(run(app, 'teamSegDraft'), null);
});

/* ---------- scheduling: a team match is ONE match on ONE board ----------
   Its segments are played one after another on the same board and are never scheduled on their own: every scheduler
   (round robin boards and planned starts, the running order, the knockout schedule, the Group Boards board plan and the
   estimates) sees one fixture taking one board slot, as long as every segment's legs (the tie-breaker's included). */
const PER_MATCH = 100;   // defaults: 1+3+3+3+3 legs + the 1-leg tie-breaker = 14 legs x 7 minutes (amateur), rounded up to 5
test('scheduling, round robin: one fixture per team match, each on one board, the slot as long as all its segments', () => {
  reset(); const t = teamsEvent('roundrobin', 8);
  t.format.anticipatedStartTime = '10:00';
  f('buildGroups')(t); t.groups.forEach((g) => { g.confirmed = true; });
  const g = t.groups[0];
  assert.equal(g.entryIds.length, 4);
  const matches = f('groupMatches')(g);
  assert.equal(matches.length, 6, 'six team matches, not six times the five segments');
  g.boards = [1];
  const sch = f('computeRoundRobinSchedule')(t).schedule[g.id];
  assert.equal((sch.endMs - sch.startMs) / 60000, 6 * PER_MATCH);
  // a group on two boards: each match sits wholly on one board, and the boards together hold exactly the six matches
  g.boards = [1, 2];
  matches.forEach((m, i) => assert.ok([1, 2].includes(f('matchBoardFor')(g, i))));
  const counts = plain(f('groupBoardMatchCounts')(g));
  assert.equal(counts[1] + counts[2], 6);
  // the running order lists the six matches once each, and the printed chart's match list too
  const ro = f('runningOrderSheetHTML')([g]);
  assert.equal((ro.match(/<div class="ro-m"><i>\d+\.<\/i>\d+ v \d+/g) || []).length, 6);
  assert.equal((ro.match(/class="ro-col"/g) || []).length, 2, 'one column per board');
  assert.equal((f('chartSheetHTML')(g, true).match(/<div class="match"><strong>Match \d+<\/strong>/g) || []).length, 6);
  // the estimate on Format & branding: largest group's matches x one Teams match, groups queued per board
  t.eventCreation.boards = 2;
  assert.equal(f('estimateTotalMinutes')(t).minutes, 6 * PER_MATCH);
  t.eventCreation.boards = 1;
  assert.equal(f('estimateTotalMinutes')(t).minutes, 12 * PER_MATCH);
});

test('scheduling, knockout and round robin -> knockout: one board slot per team match, each round as long as one Teams match per wave', () => {
  reset(); const t = teamsEvent('knockout', 8);
  t.format.anticipatedStartTime = '10:00'; t.eventCreation.boards = 4;
  f('checkInAll')(); f('regenerateKnockoutBracket')();
  const sch = f('computeKnockoutSchedule')(t, t.knockout, 'knockout', f('anticipatedStartEpoch')(t));
  assert.deepEqual(plain(sch.rounds.map((r) => (r.endMs - r.startMs) / 60000)), [PER_MATCH, PER_MATCH, PER_MATCH]);   // 4 matches on 4 boards, then 2, then 1
  t.eventCreation.boards = 2;
  const two = f('computeKnockoutSchedule')(t, t.knockout, 'knockout', f('anticipatedStartEpoch')(t));
  assert.equal((two.rounds[0].endMs - two.rounds[0].startMs) / 60000, 2 * PER_MATCH, 'two waves of two matches');
  assert.equal(f('simulateKnockoutMinutes')(t, 8, 'knockout', 4), 3 * PER_MATCH);
  const rk = teamsEvent('rrknockout', 8, { plate: true }); rk.eventCreation.boards = 2;
  assert.equal(f('simulateKnockoutMinutes')(rk, 4, 'knockout', 2), 2 * PER_MATCH, 'semis on two boards, then the final');
});

test('scheduling, Group Boards: the board plan holds one entry per team match, back to back on its board, each as long as all its segments', () => {
  reset(); const t = teamsEvent('podknockout', 8, { pods: 2 });
  t.format.anticipatedStartTime = '10:00';
  f('generatePods')(t, seededRng(6)); f('podsConfirmAll')(t);
  t.pods.forEach((p, i) => { p.boards = [i + 1]; });
  const plan = f('buildBoardPlan')(t, { starts: true });
  const real = t.pods.reduce((n, p) => n + p.bracket.rounds.reduce((k, r) => k + r.filter((m) => !m.bye && !m.void).length, 0), 0)
    + t.knockout.rounds.reduce((k, r) => k + r.filter((m) => !m.bye && !m.void).length, 0);
  const entries = Object.values(plan.boards).reduce((n, list) => n + list.length, 0);
  assert.equal(entries, real, 'one board-plan entry per match, never one per segment');
  const board1 = plan.boards['1'].filter((e) => e.key === 'pod:' + t.pods[0].id);
  for (let i = 1; i < board1.length; i++) assert.equal((board1[i].startMs - board1[i - 1].startMs) / 60000, PER_MATCH);
  assert.equal(f('podsEstimateMinutes')(t, 2) % PER_MATCH, 0, 'the estimate is whole Teams matches');
});

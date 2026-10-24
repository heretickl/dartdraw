const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { loadApp, run, plain, useState, seededRng } = require('./lib/helpers');
const { loadViewer, loadHome, setViewerState, runViewer } = require('./lib/load-viewer');
const { stubDocument } = require('./lib/load-app');
const { toPublicView } = require('../viewer/api/_lib/publicView');

/* Teams on the public viewer. A Teams event is built with the real organiser app (as tests/teams-segments.test.js does),
   turned into the public copy with toPublicView, and drawn by the viewer's own page code in a vm.
   What is checked: the header says how many segments a match has (and where the tie-breaker is played) instead of "best of N
   legs"; a result is the plain total of legs (7-3); the page says "team" where Singles and Doubles say "player"; and the
   public copy publishes the segment count and the two tie-breaker ticks and nothing else about the segments. */
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
// Types the two totals into the open result box and presses Save (the page's own handler). Returns the error text, or null.
function enter(modal, a, b) {
  const els = { scA: { value: String(a) }, scB: { value: String(b) } };
  app.document = { getElementById: (id) => els[id] || { value: '', textContent: '', innerHTML: '' }, createElement: DOC.createElement, body: DOC.body };
  try { const r = modal.onConfirm(); return r && r.error ? r.error : null; } finally { app.document = DOC; }
}
function build(unit, ft, n, opts) {
  opts = opts || {};
  const t = f('blankTournament')(); useState(app, t);
  t.id = 't_vt_' + unit + ft + n;
  Object.assign(t.eventCreation, { saved: true, competitionUnit: unit, entries: n, tournamentName: 'League', eventName: unit + ' Night', date: '2026-10-25', boards: 4 });
  Object.assign(t.format, { saved: true, formatType: ft, maxPerGroup: 4, qualifiersPerGroup: 2, advanceMode: 'seeded', losersPool: !!opts.plate, podCount: opts.pods || 2, bestOfLegs: 5 });
  f('ensureEntries')(t);
  const nm = unit === 'Teams' ? (i) => 'Team ' + String.fromCharCode(65 + i) : unit === 'Doubles' ? (i) => 'Pair' + (i + 1) + ' Smith/Jones' : (i) => 'Player ' + (i + 1);
  t.entriesList.forEach((e, i) => { e.name = nm(i); e.autoName = false; });
  return t;
}
const teams = (ft, n, opts) => build('Teams', ft, n, opts);
// Starts the draw the way the organiser does.
function draw(t) {
  const ft = t.format.formatType;
  if (ft === 'roundrobin' || ft === 'rrknockout') { f('shuffleGroups')(); f('confirmAllCharts')(); }
  else if (ft === 'knockout') { f('checkInAll')(); f('regenerateKnockoutBracket')(); }
  else { f('generatePods')(t, seededRng(9)); f('podsConfirmAll')(t); }
}
// Plays round robin matches: the earlier-listed side wins (a team match: 6 legs to 4; a legs match: 3 to 1). `limit` stops early.
function playGroups(t, limit) {
  const teamsEv = t.eventCreation.competitionUnit === 'Teams';
  let done = 0;
  t.groups.forEach((g) => {
    g.gameStarted = true;
    f('groupMatches')(g).forEach(([a, b]) => {
      if (limit !== undefined && done >= limit) return;
      done++;
      const first = g.entryIds.indexOf(a) < g.entryIds.indexOf(b), hi = teamsEv ? 6 : 3, lo = teamsEv ? 4 : 1;
      if (teamsEv) { f('promptScore')(g.id, a, b, 'a', 'b'); assert.equal(enter(modals.pop(), first ? hi : lo, first ? lo : hi), null); }
      else f('setScore')(g, first ? a : b, first ? b : a, hi, lo);
    });
  });
}
function playBracket(t, bracket, key, rounds) {
  bracket.rounds.forEach((round, ri) => round.forEach((m, mi) => {
    if (rounds !== undefined && ri >= rounds) return;
    if (!m.aEntryId || !m.bEntryId || m.bye || m.winnerId) return;
    f('koMatchScoreModal')(key, ri, mi);
    assert.equal(enter(modals.pop(), 7, 3), null);
  }));
}
function playKnockout(t, key, rounds) {
  const br = () => f('bracketByKey')(t, key);
  for (let r = 0; r < br().rounds.length; r++) playBracket(t, br(), key, rounds);
}
const view = (t) => JSON.parse(JSON.stringify(toPublicView(JSON.parse(JSON.stringify(t)))));

/* ---------- the page, in a vm, with a document that remembers what render() writes ---------- */
const ctx = loadViewer();
const els = {};
const fakeEl = (id) => (els[id] = els[id] || { id, hidden: false, textContent: '', innerHTML: '', value: '', placeholder: '', attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; }, querySelector: () => null, addEventListener() {} });
ctx.document = { getElementById: fakeEl, querySelectorAll: () => [], createElement: stubDocument.createElement, body: { classList: { toggle() {} } }, title: '' };
function show(v, hash) {
  Object.keys(els).forEach((k) => delete els[k]);
  setViewerState(ctx, v);
  ctx.location.hash = hash || '';
  runViewer(ctx, 'prefs = { me: null, follow: [] }; podSel = "finals"; appliedSel = null; render()');
  return { head: els.hLegs.textContent, app: els.app.innerHTML, finder: els.finder, title: els.hTitle.textContent, sub: els.hSub.textContent };
}
const call = (code) => runViewer(ctx, code);
const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/* ---------- what is published ---------- */
const SEG_KEYS = ['segmentCount', 'segmentTieBreakerRR', 'segmentTieBreakerKO'];
const OLD_FORMAT_KEYS = ['advanceMode', 'bestOfLegs', 'formatType', 'losersPool', 'numSeeds', 'podCount', 'qualifiersPerGroup', 'seedingEnabled'];

test('publicView: a Teams event publishes the segment count and the two tie-breaker ticks, and nothing else about the segments', () => {
  reset(); const t = teams('rrknockout', 9);
  t.entriesList[0].players = ['Old', 'Roster', 'Names', 'Here'];
  t.format.mixedRubbers = [{ type: 'singles', startingScore: 501, legs: 3 }];
  const v = view(t);
  assert.equal(v.format.segmentCount, 5);
  assert.equal(v.format.segmentTieBreakerRR, true);
  assert.equal(v.format.segmentTieBreakerKO, true);
  const extra = Object.keys(v.format).filter((k) => OLD_FORMAT_KEYS.indexOf(k) === -1 && k !== 'knockoutLegs' && k !== 'podLegs' && k !== 'plateQualifiersPerGroup');
  assert.deepEqual(extra.sort(), SEG_KEYS.slice().sort(), 'the only new format keys');
  const all = JSON.stringify(v);
  assert.doesNotMatch(all, /teamSegments|teamTieBreaker|mixedRubbers|startingScore|foursome|trios|"players"|Roster|"type"/);
  assert.equal(typeof v.format.segmentCount, 'number');
  assert.equal(typeof v.format.segmentTieBreakerRR, 'boolean');
  assert.equal(typeof v.format.segmentTieBreakerKO, 'boolean');
});

test('publicView: the count follows the segments, the ticks follow the tie-breaker, per stage', () => {
  reset(); const t = teams('rrknockout', 9);
  t.format.teamSegments = [{ type: 'singles', startingScore: 501, legs: 3 }, { type: 'doubles', startingScore: 301, legs: 5 }, { type: 'trios', startingScore: 701, legs: 1 }];
  t.format.teamTieBreaker = { type: 'singles', startingScore: 501, legs: 1, inRoundRobin: false, inKnockout: true };
  let v = view(t);
  assert.deepEqual([v.format.segmentCount, v.format.segmentTieBreakerRR, v.format.segmentTieBreakerKO], [3, false, true]);
  t.format.teamTieBreaker.inRoundRobin = true; t.format.teamTieBreaker.inKnockout = false;
  v = view(t);
  assert.deepEqual([v.format.segmentCount, v.format.segmentTieBreakerRR, v.format.segmentTieBreakerKO], [3, true, false]);
});

test('publicView: Singles, Doubles and Triples publish none of it, even though a new event stores default segments', () => {
  reset();
  ['Singles', 'Doubles', 'Triples'].forEach((unit) => {
    const t = build(unit, 'roundrobin', 8);
    assert.ok(Array.isArray(t.format.teamSegments), 'the stored event still holds the default segments');
    const v = view(t);
    SEG_KEYS.forEach((k) => assert.equal(k in v.format, false, unit + ' ' + k));
    assert.deepEqual(Object.keys(v.format).sort(), Object.keys(view(build('Singles', 'roundrobin', 8)).format).sort());
    assert.doesNotMatch(JSON.stringify(v), /teamSegments|teamTieBreaker|segment/i);
  });
});

test('publicView: junk is clamped or dropped, never copied', () => {
  const mk = (format, unit) => toPublicView({ eventCreation: { competitionUnit: unit || 'Teams' }, format: Object.assign({ formatType: 'roundrobin' }, format), entriesList: [], groups: [] }).format;
  const seg = { type: 'x' };
  assert.equal(mk({ teamSegments: Array.from({ length: 80 }, () => seg) }).segmentCount, 50, 'at most 50, like the sanitizer keeps');
  assert.equal(mk({ teamSegments: [seg, null, 7, 'a', [1], seg] }).segmentCount, 2, 'only real segment objects count');
  ['x', 3, null, {}, [], [null, 1]].forEach((bad) => SEG_KEYS.forEach((k) => assert.equal(k in mk({ teamSegments: bad }), false, JSON.stringify(bad))));
  assert.equal('segmentCount' in mk({}), false);
  const tb = (o) => mk({ teamSegments: [seg], teamTieBreaker: o });
  const flags = (o) => [tb(o).segmentTieBreakerRR, tb(o).segmentTieBreakerKO];
  assert.deepEqual(flags({ inRoundRobin: 'yes', inKnockout: 1 }), [false, false], 'only a real true counts');
  assert.deepEqual(flags({ inRoundRobin: true, inKnockout: false }), [true, false]);
  assert.deepEqual(flags({ enabled: true }), [true, true], 'an older single tick counts for both stages');
  assert.deepEqual(flags({ enabled: 'true' }), [false, false]);
  assert.deepEqual(flags('junk'), [false, false]);
  assert.deepEqual(flags(undefined), [false, false]);
  assert.deepEqual(flags([true]), [false, false]);
  const clean = tb({ inRoundRobin: true, inKnockout: true, type: 'foursome', startingScore: 1001, legs: 9, secret: 'S' });
  assert.deepEqual(Object.keys(clean).sort(), ['formatType'].concat(SEG_KEYS).sort());
  assert.equal(mk({ teamSegments: [seg] }, 'Singles').segmentCount, undefined, 'not a Teams event');
  assert.equal(toPublicView({ format: { teamSegments: [seg] } }).format.segmentCount, undefined, 'no event type at all');
});

/* ---------- the header ---------- */
const lineOf = (v) => { ctx.__line = v; return call('legsLine(__line)'); };
const tbSet = (t, rr, ko) => { t.format.teamTieBreaker.inRoundRobin = rr; t.format.teamTieBreaker.inKnockout = ko; };

test('header: a Teams round robin says how many segments, with the tie-breaker only where it is selected', () => {
  reset(); const t = teams('roundrobin', 8);
  assert.equal(lineOf(view(t)), '5 segments + tie-breaker per match');
  tbSet(t, false, true);
  assert.equal(lineOf(view(t)), '5 segments per match', 'the knockout tick does nothing in a round robin');
  tbSet(t, true, false);
  assert.equal(lineOf(view(t)), '5 segments + tie-breaker per match');
});

test('header: a Teams knockout follows the knockout tick', () => {
  reset(); const t = teams('knockout', 8);
  assert.equal(lineOf(view(t)), '5 segments + tie-breaker per match');
  tbSet(t, true, false);
  assert.equal(lineOf(view(t)), '5 segments per match', 'the round robin tick does nothing in a knockout');
});

test('header: Group Boards follows the knockout tick, in one line, without Groups / Finals labels', () => {
  reset(); const t = teams('podknockout', 8);
  assert.equal(lineOf(view(t)), '5 segments + tie-breaker per match');
  tbSet(t, true, false);
  assert.equal(lineOf(view(t)), '5 segments per match');
  tbSet(t, false, true);
  assert.equal(lineOf(view(t)), '5 segments + tie-breaker per match');
  assert.deepEqual(plain(call('legsParts(__line)')).map((p) => p.label), ['']);
});

test('header: round robin then knockout says so per stage only when they differ', () => {
  reset(); const t = teams('rrknockout', 9, { plate: true });
  tbSet(t, true, true);
  assert.equal(lineOf(view(t)), '5 segments + tie-breaker per match');
  tbSet(t, false, false);
  assert.equal(lineOf(view(t)), '5 segments per match');
  tbSet(t, false, true);
  assert.equal(lineOf(view(t)), 'Round robin: 5 segments per match · Knockout: 5 segments + tie-breaker per match');
  tbSet(t, true, false);
  assert.equal(lineOf(view(t)), 'Round robin: 5 segments + tie-breaker per match · Knockout: 5 segments per match');
  assert.deepEqual(plain(call('legsParts(__line)')).map((p) => p.label), ['Round robin', 'Knockout'], 'the Plate pool follows the Knockout, so it has no part of its own');
});

test('header: the count is the number of main segments (the tie-breaker is not one of them), and one segment is singular', () => {
  reset(); const t = teams('roundrobin', 8);
  t.format.teamSegments = t.format.teamSegments.slice(0, 3);
  assert.equal(lineOf(view(t)), '3 segments + tie-breaker per match');
  t.format.teamSegments = t.format.teamSegments.slice(0, 1);
  assert.equal(lineOf(view(t)), '1 segment + tie-breaker per match');
  tbSet(t, false, false);
  assert.equal(lineOf(view(t)), '1 segment per match');
});

test('header: no "best of" text for a Teams event in any format and tie-breaker combination, whatever bestOfLegs says', () => {
  reset();
  ['roundrobin', 'knockout', 'rrknockout', 'podknockout'].forEach((ft) => [[true, true], [true, false], [false, true], [false, false]].forEach(([rr, ko]) => {
    const t = teams(ft, 8, { plate: ft === 'rrknockout' });
    t.format.bestOfLegs = 7; t.format.podLegs = 3; t.format.knockoutLegs = { main: { variable: true, early: 3, quarterfinal: 5, semifinal: 7, final: 9 } };
    tbSet(t, rr, ko);
    const l = lineOf(view(t));
    assert.match(l, /^(Round robin: |Knockout: )?\d+ segments?( \+ tie-breaker)? per match/, ft);
    assert.doesNotMatch(l, /best of|legs|early|final|Groups|Finals|Plate/i, ft + ' ' + l);
  }));
});

test('header: without a segment count (an older server, or a stored event with none) the line is empty, never "best of"', () => {
  assert.equal(lineOf({ eventCreation: { competitionUnit: 'Teams' }, format: { formatType: 'roundrobin', bestOfLegs: 5 } }), '');
  assert.equal(lineOf({ eventCreation: { competitionUnit: 'Teams' }, format: { formatType: 'rrknockout', bestOfLegs: 5, segmentCount: 'x' } }), '');
  assert.equal(lineOf({ eventCreation: { competitionUnit: 'Teams' }, format: { formatType: 'mystery', segmentCount: 5 } }), '');
  assert.equal(lineOf({ eventCreation: { competitionUnit: 'Teams' }, format: { formatType: 'roundrobin', segmentCount: 0 } }), '');
  ['', 'NaN', 'undefined', 'null', -3, 2.5, {}, [], true].forEach((x) => {
    const line = lineOf({ eventCreation: { competitionUnit: 'Teams' }, format: { formatType: 'knockout', segmentCount: x } });
    assert.ok(line === '' || !/NaN|undefined|null|\[object/.test(line), String(x) + ' -> ' + line);
  });
});

test('header, golden: Singles and Doubles keep "best of N legs" exactly as before', () => {
  reset();
  ['Singles', 'Doubles'].forEach((unit) => {
    const rr = build(unit, 'roundrobin', 8); rr.format.bestOfLegs = 3;
    assert.equal(lineOf(view(rr)), 'Best of 3 legs', unit);
    const rk = build(unit, 'rrknockout', 9); rk.format.bestOfLegs = 3; rk.format.knockoutLegs = { main: { variable: true, early: 5, quarterfinal: 5, semifinal: 5, final: 7 } };
    assert.equal(lineOf(view(rk)), 'Round robin: best of 3 legs · Knockout: best of 5 legs, final best of 7', unit);
    const gb = build(unit, 'podknockout', 8, { pods: 2 }); gb.format.bestOfLegs = 5; gb.format.podLegs = 3;
    assert.equal(lineOf(view(gb)), 'Groups: best of 3 legs · Finals: best of 5 legs', unit);
    SEG_KEYS.forEach((k) => assert.equal(k in view(rr).format, false));
  });
});

/* ---------- the whole page, for each Teams format ---------- */
function partPlayed(ft) {
  const t = teams(ft, ft === 'podknockout' ? 8 : 9, { pods: 2, plate: ft === 'rrknockout' });
  draw(t);
  if (ft === 'roundrobin') playGroups(t, 4);
  if (ft === 'rrknockout') { playGroups(t); f('generateKnockoutFromRR')(); playKnockout(t, 'knockout', 1); }
  if (ft === 'knockout') playKnockout(t, 'knockout', 1);
  if (ft === 'podknockout') t.pods.forEach((p) => playBracket(t, p.bracket, 'pod:' + p.id, 1));
  return t;
}
function completed(ft) {
  const t = teams(ft, ft === 'podknockout' ? 8 : 9, { pods: 2, plate: ft === 'rrknockout' });
  draw(t);
  if (ft === 'roundrobin' || ft === 'rrknockout') playGroups(t);
  if (ft === 'rrknockout') { f('generateKnockoutFromRR')(); playKnockout(t, 'knockout'); playKnockout(t, 'knockoutLosers'); }
  if (ft === 'knockout') playKnockout(t, 'knockout');
  if (ft === 'podknockout') {
    t.pods.forEach((p) => { for (let r = 0; r < p.bracket.rounds.length; r++) playBracket(t, p.bracket, 'pod:' + p.id); });
    playKnockout(t, 'knockout');
  }
  assert.equal(f('eventComplete')(t), true, ft + ' complete');
  return t;
}

['roundrobin', 'knockout', 'rrknockout', 'podknockout'].forEach((ft) => {
  test('the page for a Teams ' + ft + ' event, part-played and completed: segments line, team wording, totals as legs', () => {
    reset();
    [partPlayed(ft), completed(ft)].forEach((t, k) => {
      const v = view(t);
      const expected = '5 segments + tie-breaker per match';
      const tabNames = ft === 'roundrobin' ? [''] : ft === 'knockout' ? ['bracket'] : ft === 'rrknockout' ? ['groups', 'bracket'] : ['groups', 'boards', 'bracket'];
      let all = '';
      tabNames.forEach((tab) => {
        if (tab === 'groups' && ft === 'podknockout') return;      // Group Boards has no round robin groups
        const r = show(v, tab ? '#/' + tab : '');
        assert.equal(r.head, expected, ft + ' header (' + (k ? 'completed' : 'part-played') + ')');
        assert.doesNotMatch(r.head, /best of|legs/i);
        assert.equal(r.sub, 'Open · Teams · 2026-10-25', 'the unit is still named in the header');
        assert.equal(r.finder.placeholder, 'Find a team');
        assert.equal(r.finder.attrs['aria-label'], 'Find a team');
        all += r.app;
      });
      if (ft === 'podknockout') {
        show(v, '#/bracket'); call('podSel = "all"; render()');
        all += els.app.innerHTML;
        assert.match(els.app.innerHTML, /\b\d+ teams\b/, 'Group Boards cards count teams');
        assert.doesNotMatch(els.app.innerHTML, /\bplayers?\b/);
      }
      assert.doesNotMatch(all, /\bplayers?\b/i, ft + ': no "player" anywhere in the page');
    });
  });
});

test('results show as the plain total of legs: group grids, standings and bracket cards', () => {
  reset(); const t = completed('rrknockout');
  const v = view(t);
  const g = v.groups[0];
  const pairs = Object.values(g.scores);
  assert.ok(pairs.every((s) => (s.legs1 === 6 && s.legs2 === 4) || (s.legs1 === 4 && s.legs2 === 6)), 'stored as one plain number per team');
  const r = show(v, '#/groups');
  assert.match(r.app, /class="win">6–4</, 'the grid shows 6–4 like legs');
  assert.match(r.app, /class="loss">4–6</);
  assert.doesNotMatch(r.app, /class="[a-z]*">\s*\d+–\d+\s*<small>[^<]*(tie|segment)/i);
  // standings use the totals: legs for / against are sums of them
  ctx.__g = v.groups[0];
  const st = plain(call('computeStandings(__g)'));
  const size = g.entryIds.length;
  assert.equal(st[0].legsFor, 6 * (size - 1)); assert.equal(st[0].legsAgainst, 4 * (size - 1));
  assert.equal(st[0].pts, 2 * (size - 1));
  const bk = show(v, '#/bracket');
  assert.match(bk.app, /<b>7<\/b>/, 'a bracket card shows the winner\'s total');
  assert.match(bk.app, /<b>3<\/b>/);
  // a player page / Following line reads "Won 7–3"
  const m = v.knockout.rounds[0].find((x) => x.winnerId && !x.bye);
  ctx.__id = m.winnerId;
  const matches = call('matchesHTML(__id)');
  assert.match(matches, /Won 7–3/);
  assert.match(call('statusLine(__id)'), /^(Won the |Winner of|Bye|Out in the )/);
});

test('the tie-breaker is not marked anywhere on a result', () => {
  reset(); const t = completed('rrknockout');
  const v = view(t);
  const all = show(v, '#/groups').app + show(v, '#/bracket').app;
  assert.doesNotMatch(all, /tie-breaker/i);
  assert.doesNotMatch(all, /segment/i);
});

/* ---------- wording: team in Teams, player in Singles and Doubles ---------- */
function pieces(v) {
  setViewerState(ctx, v);
  const eid = v.entriesList[0].id;
  ctx.__eid = eid;
  call('prefs = { me: null, follow: [] }');
  const out = {};
  out.missing = text(call('playerPageHTML("nobody", {})'));
  out.me = text(call('meHTML()'));
  out.following = text(call('followingHTML()'));
  els.finder = fakeEl('finder'); els.finderResults = fakeEl('finderResults');
  els.finder.value = 'zzzz'; call('showFinderResults()'); out.none = text(els.finderResults.innerHTML);
  els.finder.value = ''; els.finderResults.innerHTML = '';
  return out;
}

test('wording: a Teams event says team / teams in the finder, the not-found lines, Me and Following', () => {
  reset(); const v = view(completed('rrknockout'));
  const r = show(v, '#/groups');
  assert.equal(r.finder.placeholder, 'Find a team');
  assert.equal(r.finder.attrs['aria-label'], 'Find a team');
  const p = pieces(v);
  assert.match(p.none, /^No team with that name\.$/);
  assert.match(p.missing, /We can't find that team\. They may have been taken out of the draw\./);
  assert.match(p.me, /Search for your team name above and tap This is me \./);
  assert.match(p.following, /Follow teams to keep them all in one place\. Search for a team name above/);
  [p.none, p.missing, p.me, p.following].forEach((s) => assert.doesNotMatch(s, /\bplayers?\b/i));
});

test('wording: "neither team attended" in a Teams knockout, and the Group Boards group cards count teams', () => {
  reset(); const t = partPlayed('knockout');
  const m = [].concat(...t.knockout.rounds).find((x) => x.aEntryId && x.bEntryId && !x.winnerId);
  m.void = true;
  const v = view(t);
  setViewerState(ctx, v);
  const lose = [].concat(...v.knockout.rounds).find((x) => x.void);
  ctx.__id = lose.aEntryId;
  const status = call('statusLine(__id)');
  assert.match(status, /neither team attended/);
  assert.doesNotMatch(status, /player/);
  const gb = view(partPlayed('podknockout'));
  show(gb, '#/bracket'); call('podSel = "all"; render()');
  assert.match(els.app.innerHTML, /<span class="note">[^<]*\b4 teams\b/);
});

test('wording, golden: Singles and Doubles keep "player" / "players" exactly as today', () => {
  reset();
  ['Singles', 'Doubles'].forEach((unit) => {
    const rr = build(unit, 'rrknockout', 9, { plate: true }); draw(rr); playGroups(rr);
    const v = view(rr);
    const r = show(v, '#/groups');
    assert.equal(r.finder.placeholder, 'Find a player', unit);
    assert.equal(r.finder.attrs['aria-label'], 'Find a player', unit);
    const p = pieces(v);
    assert.equal(p.none, 'No player with that name.');
    assert.match(p.missing, /We can't find that player\. They may have been taken out of the draw\./);
    assert.match(p.me, /Search for your name above and tap This is me \./);
    assert.match(p.following, /Follow players to keep them all in one place\. Search for a name above, or tap any name in a table/);
    assert.doesNotMatch(p.me + p.following, /team/i);
    const gb = build(unit, 'podknockout', 8, { pods: 2 }); draw(gb);
    const gv = view(gb);
    show(gv, '#/bracket'); call('podSel = "all"; render()');
    assert.match(els.app.innerHTML, /\b4 players\b/, unit);
    const voidKo = build(unit, 'knockout', 8); draw(voidKo);
    const vm0 = voidKo.knockout.rounds[0].find((x) => x.aEntryId && x.bEntryId); vm0.void = true;
    const vv = view(voidKo); setViewerState(ctx, vv);
    ctx.__id = vv.knockout.rounds[0].find((x) => x.void).aEntryId;
    assert.match(call('statusLine(__id)'), /neither player attended/);
  });
});

test('wording: the home page counts teams in a Teams event and keeps players / pairs for the others', () => {
  const home = loadHome();
  const html = (unit, n) => { home.__it = { unit, entries: n }; return runViewer(home, 'hmEntriesHTML(__it)'); };
  assert.equal(html('Teams', 8), '<b>8</b> teams');
  assert.equal(html('Teams', 1), '<b>1</b> team');
  assert.equal(html('Singles', 8), '<b>8</b> players');
  assert.equal(html('Doubles', 8), '<b>8</b> pairs');
});

/* ---------- the help page ---------- */
test('help: the Teams section answers how a match works, why a result is a total, how to find a team and what the header line means', () => {
  const HELP = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'help.html'), 'utf8');
  const sec = HELP.match(/<h3 class="help-sub" id="g-teams">[\s\S]*?(?=<h3 class="help-sub" id="g-plate">)/);   // Release 5: the Teams part of "Kinds of event"
  assert.ok(sec, 'a Teams section');
  const ids = [...sec[0].matchAll(/<details class="q" id="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids, ['q-teams-match', 'q-teams-total', 'q-teams-find', 'q-teams-header']);
  const t = sec[0].replace(/<[^>]+>/g, ' ').replace(/&rsquo;/g, "'").replace(/&ndash;/g, '-').replace(/&middot;/g, '·').replace(/&[lr]dquo;/g, '"').replace(/\s+/g, ' ');
  assert.match(t, /segments, one after another and in order/);
  assert.match(t, /more legs in total wins/);
  assert.match(t, /tie-breaker.*only in the stages where the organiser chose to use one/);
  assert.match(t, /Why is a result a total like 7-3\?/);
  assert.match(t, /total legs each team won across all its segments/);
  assert.match(t, /Find a team/);
  assert.match(t, /team name/);
  assert.match(t, /takes the place of .Best of 5 legs./);
  assert.match(t, /Round robin: 5 segments per match . Knockout: 5 segments \+ tie-breaker per match/);
  assert.match(t, /Group Boards events the groups and the Finals use the knockout setting/);
  // the same tone as the rest: no plan or tier wording, no email, no names
  assert.doesNotMatch(t, /\b(plan|tier|Basic|Pro|admin)\b|@|\bmailto\b/i);
  // what it promises matches the page: the header text is made by the code in index.html
  const INDEX = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'index.html'), 'utf8');
  // (the words are in the string table since i18n step 2)
  const EN = require('../viewer/i18n/en.js');
  assert.match(INDEX, /T\(tb \? 'ev\.seg\.tb' : 'ev\.seg\.plain', \{n:n\}\)/);
  assert.equal(EN['ev.seg.tb'].other, '{n} segments + tie-breaker per match'); assert.equal(EN['ev.seg.plain'].one, '{n} segment per match');
  assert.match(INDEX, /el\('finder'\)\.placeholder = TE\('ev\.find'\)/); assert.equal(EN['ev.find.team'], 'Find a team');
});

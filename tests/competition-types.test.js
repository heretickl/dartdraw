const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, plain, useState, seededRng, makeTournament } = require('./lib/helpers');
const { toPublicView } = require('../viewer/api/_lib/publicView');
const lv = require('../viewer/api/_lib/listView');

/* New events are Singles, Doubles or Teams. Triples is hidden, not removed: an existing Triples event keeps working; the
   competition format list (Group Boards included) is unchanged. No competition type has a roster: an entry is just its name,
   and an older event's stored `players` lists are kept untouched but never shown. Doubles is exercised here end to end;
   Teams (segments) has its own file, tests/teams-segments.test.js. */
const app = loadApp();
const f = (n) => run(app, n);
const DOC = app.document;
const ORIG = {};
['persist', 'openModal', 'setSaveStatus'].forEach((n) => { ORIG[n] = run(app, n); });
let modals, fields;
function reset() {
  Object.keys(ORIG).forEach((n) => { app[n] = ORIG[n]; });
  modals = []; fields = {};
  app.openModal = (m) => { modals.push(m); };
  app.persist = () => {}; app.render = () => {}; app.renderSavedList = () => {}; app.setSaveStatus = () => {};
  app.document = DOC;
  app.__org = { name: 'Sam', email: 's@x.com', tier: 'pro', entryLimit: null, viewerUrl: 'https://live.example.com' };
  run(app, 'currentOrganizer = __org; lockedIds.clear(); currentStage = 1');
}
const optionValues = (html, id) => {
  const m = html.match(new RegExp('<select id="' + id + '">([\\s\\S]*?)</select>'));
  return m ? [...m[1].matchAll(/<option value="([^"]*)"/g)].map((x) => x[1]) : null;
};
const formatChoices = (html) => [...html.matchAll(/setFormatType\('(\w+)'\)/g)].map((x) => x[1]);
function blank(unit, formatType, n) {
  const t = f('blankTournament')(); useState(app, t);
  t.eventCreation.saved = true; t.eventCreation.competitionUnit = unit; t.eventCreation.entries = n || 8;
  t.format.saved = true; t.format.formatType = formatType || 'roundrobin';
  f('ensureEntries')(t);
  return t;
}
const render = (n) => { run(app, 'formSectionCollapsed.format = false'); app.__n = n; run(app, 'currentStage = __n'); return run(app, 'stage' + n + '()'); };

/* ---------- stage 1: the competition type picker ---------- */
test('stage 1 offers exactly Singles, Doubles and Teams for a new event, Singles selected', () => {
  reset(); const t = f('blankTournament')(); useState(app, t);
  const html = render(1);
  assert.deepEqual(optionValues(html, 'f_unit'), ['Singles', 'Doubles', 'Teams']);
  assert.match(html, /<option value="Singles" selected>Singles<\/option>/);
  assert.doesNotMatch(html, /Triples|existing event/);
  assert.match(html, /For singles, doubles or teams events\./);
});

test('stage 1 keeps Triples selectable only for an event that already has it; Teams is a normal choice', () => {
  reset();
  const tr = blank('Triples'); const html = render(1);
  assert.deepEqual(optionValues(html, 'f_unit'), ['Singles', 'Doubles', 'Teams', 'Triples']);
  assert.match(html, /<option value="Triples" selected>Triples \(existing event\)<\/option>/);
  const tm = blank('Teams');
  assert.deepEqual(optionValues(render(1), 'f_unit'), ['Singles', 'Doubles', 'Teams']);
  assert.match(render(1), /<option value="Teams" selected>Teams<\/option>/);
  const d = blank('Doubles'); useState(app, d);
  assert.deepEqual(optionValues(render(1), 'f_unit'), ['Singles', 'Doubles', 'Teams']);
  assert.match(render(1), /<option value="Doubles" selected>/);
  void tr; void tm;
});

test('saving stage 1 on an existing Teams event keeps Teams, and leaves stored player lists exactly as they were', () => {
  reset(); const t = blank('Teams', 'roundrobin', 6);
  t.entriesList[0].players = ['A', 'B', 'C', 'D', 'E'];
  t.entriesList[1].players = ['X'];
  fields = { f_tname: 'Cup', f_ename: 'Teams', f_etype: 'Open', f_unit: 'Teams', f_date: '2026-10-20', f_entries: '6' };
  app.document = { getElementById: (id) => (id in fields ? { value: fields[id] } : null) };
  f('saveStage1')();
  assert.equal(t.eventCreation.competitionUnit, 'Teams');
  assert.deepEqual(plain(t.entriesList[0].players), ['A', 'B', 'C', 'D', 'E']);
  assert.deepEqual(plain(t.entriesList[1].players), ['X']);              // not padded, not trimmed
  assert.equal('players' in t.entriesList[2], false);                     // and nothing added
});

test('switching Singles to Doubles and back in stage 1 adds no player slots and never clears stored ones, keeping typed entry names', () => {
  reset(); const t = blank('Singles', 'roundrobin', 8);
  t.entriesList[0].name = 'Alex'; t.entriesList[0].autoName = false;
  fields = { f_tname: 'Cup', f_ename: 'Open', f_etype: 'Open', f_unit: 'Doubles', f_date: '2026-10-20', f_entries: '10' };
  app.document = { getElementById: (id) => (id in fields ? { value: fields[id] } : null) };
  f('saveStage1')();
  assert.equal(t.eventCreation.competitionUnit, 'Doubles');
  assert.equal(t.entriesList.length, 10);
  assert.equal(t.entriesList.some((e) => 'players' in e), false);
  assert.equal(t.entriesList[0].name, 'Alex');
  t.entriesList[0].players = ['Alex', 'Bo'];                             // an older event's roster
  fields.f_unit = 'Singles';
  f('saveStage1')();
  assert.equal(t.eventCreation.competitionUnit, 'Singles');
  assert.deepEqual(plain(t.entriesList[0].players), ['Alex', 'Bo']);      // kept in the data, untouched
  assert.equal(t.entriesList[0].name, 'Alex');
});

/* ---------- stage 2: three formats; Group Boards is a Knockout option ---------- */
// The main cards' handlers, then the Knockout sub-choice's (shown only for a knockout).
const mainChoices = (html) => [...((html.match(/<label>Competition format<\/label><div class="options">([\s\S]*?)<\/div><\/div>/) || [])[1] || '').matchAll(/onclick="(\w+)\('?(\w*)'?\)"/g)].map((x) => x[2] || x[1]);
const koChoices = (html) => [...((html.match(/<label>Knockout type<\/label><div class="options">([\s\S]*?)<\/div><\/div>/) || [])[1] || '').matchAll(/setFormatType\('(\w+)'\)/g)].map((x) => x[1]);
test('stage 2 offers three formats for a new Singles, Doubles or Teams event; Group Boards only under Knockout', () => {
  reset();
  ['Singles', 'Doubles', 'Teams'].forEach((unit) => ['roundrobin', 'knockout', 'rrknockout'].forEach((ft) => {
    blank(unit, ft);
    const html = render(2);
    assert.deepEqual(mainChoices(html), ['roundrobin', 'chooseKnockoutFormat', 'rrknockout'], unit + ' ' + ft);
    if (ft === 'knockout') {
      assert.deepEqual(koChoices(html), ['knockout', 'podknockout'], unit + ' ' + ft);
      assert.match(html, /<div class="choice selected" onclick="setFormatType\('knockout'\)"><strong>Single bracket<\/strong>/);
      assert.match(html, /<strong>Group Boards, then finals<\/strong>/);
    } else {
      assert.deepEqual(koChoices(html), [], unit + ' ' + ft + ': no Group Boards under a round robin format');
      assert.doesNotMatch(html, /Group Boards, then finals|podknockout|id="f_podcount"/, unit + ' ' + ft);
    }
    assert.deepEqual(formatChoices(html).filter((x) => x === 'podknockout').length, ft === 'knockout' ? 1 : 0);
  }));
});
test('an existing Group Boards event opens as Knockout with "Group Boards, then finals" selected, and switching works as before', () => {
  reset(); const t = makeTournament(app, 16, { pods: 4 }); useState(app, t);
  const html = render(2);
  assert.equal(t.format.formatType, 'podknockout', 'no migration');
  assert.match(html, /<div class="choice selected" onclick="chooseKnockoutFormat\(\)"><strong>Knockout<\/strong>/);
  assert.match(html, /<div class="choice selected" onclick="setFormatType\('podknockout'\)"><strong>Group Boards, then finals<\/strong>/);
  assert.doesNotMatch(html, /<div class="choice selected" onclick="setFormatType\('(roundrobin|rrknockout|knockout)'\)">/);
  assert.match(html, /id="f_podcount"/, 'the Group Boards fields are shown');
  f('chooseKnockoutFormat')();
  assert.equal(t.format.formatType, 'podknockout', 'clicking the Knockout card keeps the Group Boards choice');
  f('setFormatType')('knockout');
  assert.equal(t.format.formatType, 'knockout');
  assert.match(render(2), /<div class="choice selected" onclick="setFormatType\('knockout'\)"><strong>Single bracket<\/strong>/);
  f('setFormatType')('roundrobin');
  assert.deepEqual(koChoices(render(2)), []);
  f('chooseKnockoutFormat')();
  assert.equal(t.format.formatType, 'knockout', 'from a round robin, the Knockout card gives a single bracket');
  assert.match(f('formatSummaryCard')(), /<strong>Knockout<\/strong>/);
  f('setFormatType')('podknockout');
  assert.match(f('formatSummaryCard')(), /<strong>Knockout · Group Boards<\/strong>/);
});

/* ---------- existing Teams / Triples / Group Boards events still work ---------- */
function allStages(label) {
  [1, 2, 3, 4, 5, 6, 7].forEach((n) => assert.doesNotThrow(() => render(n), label + ' stage ' + n));
}
// An older Teams event as it was stored (foursome or rubbers, a roster, the handout tick), opened through the real load.
function legacyTeams(tmf, ft) {
  const t = blank('Teams', ft, 8);
  delete t.format.teamSegments; delete t.format.teamTieBreaker;
  t.format.teamMatchFormat = tmf; t.format.teamSize = 4;
  t.format.mixedRubbers = [{ name: 'Singles 1', type: 'singles', startingScore: 501, legs: 3 }, { name: 'Triples', type: 'triples', startingScore: 701, legs: 3 }, { name: 'Decider', type: 'foursome', startingScore: 1001, legs: 1, isTieBreaker: true }];
  t.entriesList.forEach((e, i) => { e.players = ['P' + i + 'a', 'P' + i + 'b', '', '']; });
  t.printSettings.teamHandoutEnabled = true;
  app.__t = t; run(app, 'migrateTeamSegments(__t)');
  return t;
}
test('an existing Teams event opens and renders stages 1 to 7 and its print sheets, with no handout and its roster left alone', () => {
  reset();
  ['foursome', 'mixed'].forEach((tmf) => ['roundrobin', 'knockout', 'rrknockout'].forEach((ft) => {
    const t = legacyTeams(tmf, ft);
    if (ft !== 'knockout') { f('buildGroups')(t); t.groups.forEach((g) => { g.confirmed = true; }); }
    if (ft === 'knockout') { f('ensureSeedOrder')(t); app.__o = t.seedOrder.map((id) => ({ entryId: id, org: '' })); t.knockout = run(app, 'generateBracket(__o, "Bracket")'); }
    allStages(ft + '/' + tmf);
    t.entriesList.forEach((e, i) => assert.deepEqual(plain(e.players), ['P' + i + 'a', 'P' + i + 'b', '', '']));
    t.printSettings.lineupSheetEnabled = true;
    const mount = { innerHTML: '' };
    app.document = { getElementById: () => mount };
    assert.doesNotThrow(() => f('runPrintPack')(t.groups.filter((g) => g.confirmed)));
    app.document = DOC;
    assert.doesNotMatch(mount.innerHTML, /HANDOUT|Roster|P0a/);
    assert.match(mount.innerHTML, /lineup-sheet/);
    assert.equal(t.format.teamMatchFormat, tmf);                           // the old fields stay in the data
    assert.equal(t.format.mixedRubbers.length, 3);
  }));
});

test('an existing Triples event opens and renders stages 1 to 7, as a named entry with no player boxes', () => {
  reset(); const t = blank('Triples', 'rrknockout', 9); f('buildGroups')(t); t.groups.forEach((g) => { g.confirmed = true; });
  t.entriesList[0].players = ['A', 'B', 'C'];
  allStages('triples');
  assert.doesNotMatch(render(3), /placeholder="Player \d"/);
  assert.deepEqual(plain(t.entriesList[0].players), ['A', 'B', 'C']);
  assert.match(plain(f('formatDescriptionLines')(t)).join('\n'), /Each entry is a team of 3 players\./);
  assert.doesNotMatch(plain(f('formatDescriptionLines')(t)).join('\n'), /segment/);
});

test('an existing Group Boards event opens and renders stages 1 to 7', () => {
  reset(); const t = makeTournament(app, 16, { pods: 4 }); useState(app, t);
  f('generatePods')(t, seededRng(2));
  allStages('group boards');
  f('podsConfirmAll')(t);
  allStages('group boards confirmed');
});

/* ---------- Doubles end to end ---------- */
const SIZES = []; for (let n = 8; n <= 24; n++) SIZES.push(n);
const FORMATS = ['roundrobin', 'knockout', 'rrknockout'];
const pairName = (i) => 'Pair' + (i + 1) + ' Smith/Jones';

// Stage 1 through the real save, then the format the organiser picked.
function doublesEvent(n, ft) {
  const t = f('blankTournament')(); useState(app, t);
  t.id = 't_dbl_' + ft + n;
  fields = { f_tname: 'Doubles Cup', f_ename: 'Open Doubles', f_etype: 'Open', f_unit: 'Doubles', f_date: '2026-10-20', f_entries: String(n) };
  app.document = { getElementById: (id) => (id in fields ? { value: fields[id] } : null) };
  f('saveStage1')();
  app.document = DOC;
  t.format.formatType = ft; t.format.bestOfLegs = 5; t.format.maxPerGroup = 4; t.format.qualifiersPerGroup = 2; t.format.advanceMode = 'seeded';
  t.format.saved = true;
  // pair names, through the same handler the page uses (a pair is just its name)
  t.entriesList.forEach((e, i) => { f('renameEntry')(e.id, pairName(i)); });
  return t;
}
const setAll = (g) => {   // the first-listed side always wins 3-0, so there are no ties
  g.gameStarted = true;
  const pos = (id) => g.entryIds.indexOf(id);
  f('groupMatches')(g).forEach(([a, b]) => { pos(a) < pos(b) ? f('setScore')(g, a, b, 3, 0) : f('setScore')(g, b, a, 3, 0); });
};
function playKo(bracket) {
  const propagate = run(app, 'propagateByes');
  bracket.rounds.forEach((round) => {
    round.forEach((m) => { if (m.aEntryId && m.bEntryId && !m.winnerId) { m.aLegs = 3; m.bLegs = 1; m.winnerId = m.aEntryId; } });
    propagate(bracket.rounds);
  });
}
function printAll(t) {
  const mount = { innerHTML: '' };
  app.document = { getElementById: () => mount };
  t.published = true; t.publicSlug = 'abcdefgh1234';
  t.printSettings.teamHandoutEnabled = true;   // an older event's tick: nothing prints for it any more
  t.printSettings.lineupSheetEnabled = true;   // lineup sheets are Teams only
  try { f('runPrintPack')(t.groups.filter((g) => g.confirmed)); } finally { app.document = DOC; }
  return mount.innerHTML;
}

SIZES.forEach((n) => FORMATS.forEach((ft) => {
  test('Doubles ' + ft + ' with ' + n + ' pairs: stages 1 to 7, prints, completion and finalize', () => {
    reset();
    const t = doublesEvent(n, ft);
    assert.equal(t.eventCreation.competitionUnit, 'Doubles');
    assert.equal(t.entriesList.length, n);
    assert.equal(t.entriesList.some((e) => 'players' in e), false);
    [1, 2, 3].forEach((s) => assert.doesNotThrow(() => render(s), 'stage ' + s));
    assert.doesNotMatch(render(3), /placeholder="Player \d"/);
    if (ft !== 'knockout') {
      f('shuffleGroups')();                                                  // the Random draw
      assert.ok(t.groups.length > 0);
      f('confirmAllCharts')();
    } else {
      f('checkInAll')();
      f('regenerateKnockoutBracket')();                                      // Generate bracket
      assert.ok(t.knockout);
    }
    [1, 2, 3, 4, 5, 6, 7].forEach((s) => assert.doesNotThrow(() => render(s), 'stage ' + s + ' drawn'));
    // wording: pairs, not players or teams
    assert.match(render(3), /Search pair name|Pair name|Pair/i);
    if (ft !== 'knockout') assert.match(render(4), /Tick off each pair/);
    else assert.match(render(4), /Tick off each pair/);
    assert.doesNotMatch(render(3) + render(4), /Team name|Tick off each player/);
    const pre = printAll(t);
    assert.doesNotMatch(pre, /HANDOUT|team captain|lineup-sheet/);          // no handout (gone for every type) and no lineup sheet (Teams only)
    assert.doesNotMatch(render(4) + render(7), /handoutToggle|lineupToggle/);  // and neither tick box is offered
    assert.equal(f('eventComplete')(t), false);

    if (ft !== 'knockout') {
      t.groups.forEach(setAll);
      assert.equal(f('eventComplete')(t), ft === 'roundrobin');
      if (ft === 'rrknockout') {
        f('generateKnockoutFromRR')();
        assert.ok(t.knockout);
        playKo(t.knockout);
        if (t.knockoutLosers) playKo(t.knockoutLosers);
      }
    } else { playKo(t.knockout); }
    assert.equal(f('eventComplete')(t), true);
    [1, 2, 3, 4, 5, 6, 7].forEach((s) => assert.doesNotThrow(() => render(s), 'stage ' + s + ' played'));
    assert.match(render(5), /finalizeResults\(\)/);

    // final chart print: pair names on the sheets, and the QR sheets
    const html = printAll(t);
    assert.match(html, /Pair1 Smith\/Jones/);
    assert.match(html, /Open Doubles/); assert.match(html, /<svg/);
    assert.doesNotThrow(() => { modals = []; f('finalizeResults')(); });
    assert.equal(modals.length, 1);
    assert.match(modals[0].title, /Accept results as final/);

    // public view: the unit round-trips, and the pair names are what is published (rosters are not)
    const view = toPublicView(JSON.parse(JSON.stringify(t)));
    assert.equal(view.eventCreation.competitionUnit, 'Doubles');
    assert.equal(view.entriesList.length, n);
    assert.deepEqual(view.entriesList.map((e) => e.name).sort(), plain(t.entriesList.map((e) => e.name).sort()));
    assert.equal('players' in view.entriesList[0], false);
    assert.doesNotMatch(JSON.stringify(view), /teamSegments|teamTieBreaker/);
    t.finalized = { at: '2026-10-20T10:00:00.000Z' };
    const d = lv.describe({ slug: 'abcdefgh1234', data: plain(Object.assign(t, { listed: true, published: true })), updated_at: '2026-10-20T11:00:00.000Z' }, Date.UTC(2026, 9, 21), undefined);
    if (d && d.item) assert.equal(d.item.unit, 'Doubles');
  });
}));

test('Doubles: withdrawals, no-shows, ties and the not-played modal speak of pairs', () => {
  reset(); const t = doublesEvent(8, 'roundrobin');
  f('shuffleGroups')(); f('confirmAllCharts')();
  modals = [];
  assert.doesNotThrow(() => f('withdrawEntry')(t.entriesList[0].id));
  assert.equal(modals.length, 1);
  assert.doesNotThrow(() => f('openNoShowPicker')(t.groups[0].id));
  const g = t.groups[0], [a, b] = [g.entryIds[0], g.entryIds[1]];
  f('markGroupNoShow')(g.id, a);
  assert.equal(t.entriesList.find((e) => e.id === a).noShow, true);
  assert.doesNotThrow(() => f('undoGroupNoShow')(g.id, a));
  assert.doesNotThrow(() => f('promptScore')(g.id, a, b, 'x', 'y'));
  // knockout: not-played modal
  const k = doublesEvent(8, 'knockout'); f('checkInAll')(); f('regenerateKnockoutBracket')();
  f('markKnockoutVoid')('knockout', 0, 0);
  modals = [];
  app.document = { getElementById: () => ({ value: '' }) };
  f('koMatchScoreModal')('knockout', 0, 0);
  app.document = DOC;
  assert.match(modals[0].bodyHTML, /Neither pair attended/);
  assert.doesNotMatch(modals[0].bodyHTML, /Neither player attended/);
  // an existing Singles event keeps the old wording
  const s = blank('Singles', 'knockout', 8); f('checkInAll')(); f('regenerateKnockoutBracket')();
  f('markKnockoutVoid')('knockout', 0, 0); modals = [];
  f('koMatchScoreModal')('knockout', 0, 0);
  assert.match(modals[0].bodyHTML, /Neither player attended/);
  void k; void s;
});

test('the entry editor names the unit and has no player boxes for any competition type', () => {
  reset(); const t = blank('Doubles', 'roundrobin', 8);
  t.entriesList[0].players = ['Old', 'Roster'];
  const html = f('entryFieldsHTML')(t.entriesList[0]);
  assert.match(html, /placeholder="Pair name"/);
  assert.doesNotMatch(html, /placeholder="Player \d"|Old|Roster|setEntryPlayer/);
  assert.equal(typeof app.setEntryPlayer, 'undefined');
  const teams = blank('Teams', 'roundrobin', 6);
  assert.match(f('entryFieldsHTML')(teams.entriesList[0]), /placeholder="Team name"/);
  assert.doesNotMatch(f('entryFieldsHTML')(teams.entriesList[0]), /Player \d/);
  const singles = blank('Singles', 'roundrobin', 6);
  const sh = f('entryFieldsHTML')(singles.entriesList[0]);
  assert.match(sh, /placeholder="Name"/); assert.doesNotMatch(sh, /Player 1/);
});

test('Doubles: the rules sheet describes pairs', () => {
  reset(); const t = blank('Doubles', 'roundrobin', 8);
  const lines = plain(f('formatDescriptionLines')(t)).join('\n');
  assert.match(lines, /Each entry is a pair of 2 players\./);
  assert.doesNotMatch(lines, /named players|segment/);
  assert.doesNotMatch(lines, /Doubles size/);
});

test('the public list names the Doubles unit', () => {
  const t = { eventCreation: { competitionUnit: 'Doubles', eventName: 'E', tournamentName: 'T', date: '2026-10-20' }, format: { formatType: 'roundrobin' }, entriesList: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], groups: [], published: true, listed: true };
  const out = lv.buildList([{ slug: 'abcdefgh1234', data: t, updated_at: '2026-10-19T10:00:00.000Z' }], Date.UTC(2026, 9, 19), undefined);
  const all = out.live.concat(out.upcoming, out.results);
  assert.equal(all.length, 1); assert.equal(all[0].unit, 'Doubles');
});

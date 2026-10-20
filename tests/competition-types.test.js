const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, plain, useState, seededRng, makeTournament } = require('./lib/helpers');
const { toPublicView } = require('../viewer/api/_lib/publicView');
const lv = require('../viewer/api/_lib/listView');

/* New events are Singles or Doubles only. Teams and Triples are hidden, not removed: an existing event that uses one keeps
   working; the competition format list (Group Boards included) is unchanged. Doubles is existing machinery that the UI never offered, so
   it is exercised here end to end. */
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
test('stage 1 offers exactly Singles and Doubles for a new event, Singles selected', () => {
  reset(); const t = f('blankTournament')(); useState(app, t);
  const html = render(1);
  assert.deepEqual(optionValues(html, 'f_unit'), ['Singles', 'Doubles']);
  assert.match(html, /<option value="Singles" selected>Singles<\/option>/);
  assert.doesNotMatch(html, /Teams|Triples/);
});

test('stage 1 keeps Teams or Triples selectable, only for an event that already has it', () => {
  reset();
  ['Teams', 'Triples'].forEach((unit) => {
    const t = blank(unit); const html = render(1);
    assert.deepEqual(optionValues(html, 'f_unit'), ['Singles', 'Doubles', unit]);
    assert.match(html, new RegExp('<option value="' + unit + '" selected>' + unit + ' \\(existing event\\)</option>'));
  });
  const d = blank('Doubles'); useState(app, d);
  assert.deepEqual(optionValues(render(1), 'f_unit'), ['Singles', 'Doubles']);
  assert.match(render(1), /<option value="Doubles" selected>/);
});

test('saving stage 1 on an existing Teams event keeps Teams, and its rosters', () => {
  reset(); const t = blank('Teams', 'roundrobin', 6); t.format.teamSize = 5;
  f('ensureEntries')(t);
  t.entriesList[0].players = ['A', 'B', 'C', 'D', 'E'];
  fields = { f_tname: 'Cup', f_ename: 'Teams', f_etype: 'Open', f_unit: 'Teams', f_date: '2026-10-20', f_entries: '6' };
  app.document = { getElementById: (id) => (id in fields ? { value: fields[id] } : null) };
  f('saveStage1')();
  assert.equal(t.eventCreation.competitionUnit, 'Teams');
  assert.deepEqual(plain(t.entriesList[0].players), ['A', 'B', 'C', 'D', 'E']);
  assert.equal(t.entriesList.every((e) => e.players.length === 5), true);
});

test('switching Singles to Doubles in stage 1 gives every entry two player slots, keeping typed entry names', () => {
  reset(); const t = blank('Singles', 'roundrobin', 8);
  t.entriesList[0].name = 'Alex'; t.entriesList[0].autoName = false;
  fields = { f_tname: 'Cup', f_ename: 'Open', f_etype: 'Open', f_unit: 'Doubles', f_date: '2026-10-20', f_entries: '10' };
  app.document = { getElementById: (id) => (id in fields ? { value: fields[id] } : null) };
  f('saveStage1')();
  assert.equal(t.eventCreation.competitionUnit, 'Doubles');
  assert.equal(t.entriesList.length, 10);
  assert.equal(t.entriesList.every((e) => Array.isArray(e.players) && e.players.length === 2), true);
  assert.equal(t.entriesList[0].name, 'Alex');
  t.entriesList[0].players = ['Alex', 'Bo'];
  // Doubles to Singles: the second slot goes (existing behaviour: the roster is dropped), the entry name stays
  fields.f_unit = 'Singles';
  f('saveStage1')();
  assert.equal(t.eventCreation.competitionUnit, 'Singles');
  assert.equal(t.entriesList.every((e) => e.players.length === 0), true);
  assert.equal(t.entriesList[0].name, 'Alex');
});

/* ---------- stage 2: the format picker is unchanged ---------- */
test('stage 2 still offers all four formats, Group Boards included, for a new Singles or Doubles event', () => {
  reset();
  ['Singles', 'Doubles'].forEach((unit) => ['roundrobin', 'knockout', 'rrknockout'].forEach((ft) => {
    blank(unit, ft);
    const html = render(2);
    assert.deepEqual(formatChoices(html), ['roundrobin', 'knockout', 'rrknockout', 'podknockout'], unit + ' ' + ft);
    assert.match(html, /Group Boards/);
  }));
});

test('stage 2 offers the same four formats for an existing Group Boards event, with Group Boards selected', () => {
  reset(); const t = makeTournament(app, 16, { pods: 4 }); useState(app, t);
  const html = render(2);
  assert.deepEqual(formatChoices(html), ['roundrobin', 'knockout', 'rrknockout', 'podknockout']);
  assert.ok(html.includes(`<div class="choice selected" onclick="setFormatType('podknockout')">`));
  f('setFormatType')('knockout');
  assert.equal(t.format.formatType, 'knockout');
  assert.deepEqual(formatChoices(render(2)), ['roundrobin', 'knockout', 'rrknockout', 'podknockout']);
});

/* ---------- existing Teams / Triples / Group Boards events still work ---------- */
function allStages(label) {
  [1, 2, 3, 4, 5, 6, 7].forEach((n) => assert.doesNotThrow(() => render(n), label + ' stage ' + n));
}
test('an existing Teams event opens and renders stages 1 to 7 and its print sheets', () => {
  reset();
  ['foursome', 'mixed'].forEach((tmf) => ['roundrobin', 'knockout', 'rrknockout'].forEach((ft) => {
    const t = blank('Teams', ft, 8); t.format.teamMatchFormat = tmf; t.format.teamSize = 4;
    f('ensureEntries')(t);
    if (ft !== 'knockout') { f('buildGroups')(t); t.groups.forEach((g) => { g.confirmed = true; }); }
    if (ft === 'knockout') { f('ensureSeedOrder')(t); app.__o = t.seedOrder.map((id) => ({ entryId: id, org: '' })); t.knockout = run(app, 'generateBracket(__o, "Bracket")'); }
    t.entriesList.forEach((e) => assert.equal(e.players.length, 4));
    allStages(ft + '/' + tmf);
    t.printSettings.teamHandoutEnabled = true; t.printSettings.lineupSheetEnabled = tmf === 'mixed';
    const mount = { innerHTML: '' };
    app.document = { getElementById: () => mount };
    assert.doesNotThrow(() => f('runPrintPack')(t.groups.filter((g) => g.confirmed)));
    app.document = DOC;
    assert.match(mount.innerHTML, /TEAM HANDOUT/);
  }));
});

test('an existing Triples event opens and renders stages 1 to 7', () => {
  reset(); const t = blank('Triples', 'rrknockout', 9); f('buildGroups')(t); t.groups.forEach((g) => { g.confirmed = true; });
  t.entriesList.forEach((e) => assert.equal(e.players.length, 3));
  allStages('triples');
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
  // names and players, through the same handlers the page uses
  t.entriesList.forEach((e, i) => {
    f('renameEntry')(e.id, pairName(i));
    f('setEntryPlayer')(e.id, 0, 'Alice' + i); f('setEntryPlayer')(e.id, 1, 'Bob' + i);
  });
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
  t.printSettings.teamHandoutEnabled = true;
  try { f('runPrintPack')(t.groups.filter((g) => g.confirmed)); } finally { app.document = DOC; }
  return mount.innerHTML;
}

SIZES.forEach((n) => FORMATS.forEach((ft) => {
  test('Doubles ' + ft + ' with ' + n + ' pairs: stages 1 to 7, prints, completion and finalize', () => {
    reset();
    const t = doublesEvent(n, ft);
    assert.equal(t.eventCreation.competitionUnit, 'Doubles');
    assert.equal(f('teamSizeFor')(t), 2);
    assert.equal(t.entriesList.length, n);
    t.entriesList.forEach((e) => assert.equal(e.players.length, 2));
    [1, 2, 3].forEach((s) => assert.doesNotThrow(() => render(s), 'stage ' + s));

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
    assert.doesNotMatch(pre, /HANDOUT|team captain/);                       // Doubles events print no handout sheets, even if the old setting is on
    assert.equal(f('teamHandoutToggleHTML')(), '');                         // and the tick box is not offered
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
    assert.doesNotMatch(JSON.stringify(view), /Alice/);
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

test('Doubles: the entry editor names the unit, with two player boxes per pair', () => {
  reset(); const t = blank('Doubles', 'roundrobin', 8);
  const html = f('entryFieldsHTML')(t.entriesList[0]);
  assert.match(html, /placeholder="Pair name"/);
  assert.equal((html.match(/placeholder="Player \d"/g) || []).length, 2);
  const teams = blank('Teams', 'roundrobin', 6);
  assert.match(f('entryFieldsHTML')(teams.entriesList[0]), /placeholder="Team name"/);
  const singles = blank('Singles', 'roundrobin', 6);
  const sh = f('entryFieldsHTML')(singles.entriesList[0]);
  assert.match(sh, /placeholder="Name"/); assert.doesNotMatch(sh, /Player 1/);
});

test('Doubles: the rules sheet describes pairs', () => {
  reset(); const t = blank('Doubles', 'roundrobin', 8);
  const lines = plain(f('formatDescriptionLines')(t)).join('\n');
  assert.match(lines, /pair of 2 named players|2 named players/);
  assert.doesNotMatch(lines, /Doubles size/);
});

test('the public list names the Doubles unit', () => {
  const t = { eventCreation: { competitionUnit: 'Doubles', eventName: 'E', tournamentName: 'T', date: '2026-10-20' }, format: { formatType: 'roundrobin' }, entriesList: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], groups: [], published: true, listed: true };
  const out = lv.buildList([{ slug: 'abcdefgh1234', data: t, updated_at: '2026-10-19T10:00:00.000Z' }], Date.UTC(2026, 9, 19), undefined);
  const all = out.live.concat(out.upcoming, out.results);
  assert.equal(all.length, 1); assert.equal(all[0].unit, 'Doubles');
});

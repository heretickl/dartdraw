const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { loadApp, run, hash, ROOT } = require('./lib/load-app');

const GOLDEN = path.join(__dirname, 'golden', 'existing-formats.json');

function people(n) {
  return Array.from({ length: n }, (_, i) => ({ id: 'e' + i, name: 'Player ' + (i + 1), org: i % 3 ? 'KLDA' : 'PDA', players: [], withdrawn: false }));
}
function build(app, kind) {
  const t = run(app, 'blankTournament')();
  t.eventCreation.saved = true; t.eventCreation.tournamentName = 'Test Open'; t.eventCreation.eventName = 'Singles';
  t.eventCreation.entries = kind === 'ko' ? 11 : 12;
  t.format.saved = true; t.format.formatType = kind === 'rr' ? 'roundrobin' : kind === 'ko' ? 'knockout' : 'rrknockout';
  t.entriesList = people(t.eventCreation.entries);
  app.__t = t;
  if (kind === 'ko') {
    t.format.seedingEnabled = true; t.format.numSeeds = 8;
    run(app, 'ensureSeedOrder(__t)');
    app.__o = t.seedOrder.map((id) => ({ entryId: id, org: t.entriesList.find((e) => e.id === id).org }));
    t.knockout = run(app, 'generateBracket(__o, "Bracket")');
  } else {
    run(app, 'buildGroups(__t)');
    t.groups.forEach((g) => { g.confirmed = true; });
  }
  return t;
}
function snapshot() {
  const out = {};
  ['rr', 'ko', 'rrko'].forEach((kind) => {
    const app = loadApp(); const t = build(app, kind); run(app, 'state = __t');
    const parts = {};
    [3, 4, 6, 7].forEach((n) => { app.__n = n; run(app, 'currentStage = __n'); parts['stage' + n] = hash(run(app, 'stage' + n + '()')); });
    ['formatSummaryCard()', 'JSON.stringify(formatDescriptionLines(state))', 'schedulingContextHTML()', 'competitionDurationSummaryHTML(state)', 'String(estimateTotalMinutes(state))']
      .forEach((c, i) => { parts['helper' + i] = hash(run(app, c)); });
    if (kind === 'ko') {
      app.__k = t.knockout;
      parts.chart = hash(run(app, 'mirroredChartHTML(__k, __t, {interactive:false})'));
      parts.sheet = hash(run(app, 'knockoutBracketSheetHTML(__k)'));
    }
    else parts.standings = hash(t.groups.map((g) => { app.__g = g; return run(app, 'standingsTableHTML(__g, computeStandings(__g))'); }).join(''));
    out[kind] = parts;
  });
  return out;
}

test('existing formats render exactly as the stored snapshot', () => {
  const now = snapshot();
  if (process.env.UPDATE_GOLDEN || !fs.existsSync(GOLDEN)) {
    fs.mkdirSync(path.dirname(GOLDEN), { recursive: true });
    fs.writeFileSync(GOLDEN, JSON.stringify(now, null, 2) + '\n');
  }
  assert.deepEqual(now, JSON.parse(fs.readFileSync(GOLDEN, 'utf8')));
});
test('the snapshot is deterministic', () => { assert.deepEqual(snapshot(), snapshot()); });
test('a tournament saved before Group Boards (no pods field) still renders in every existing format', () => {
  const app = loadApp();
  ['roundrobin', 'knockout', 'rrknockout'].forEach((f) => {
    const t = run(app, 'blankTournament')();
    delete t.pods; t.format.formatType = f; t.eventCreation.saved = true; t.format.saved = true; t.entriesList = people(8);
    app.__t = t; run(app, 'state = __t');
    [3, 4, 5, 6, 7].forEach((n) => { app.__n = n; run(app, 'currentStage = __n'); assert.doesNotThrow(() => run(app, 'stage' + n + '()'), f + ' stage ' + n); });
  });
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, useState, seededRng, makeTournament } = require('./lib/helpers');

// Each printed sheet's QR code opens that sheet's own screen in the viewer (the address after the #).
const app = loadApp();
const f = (name) => run(app, name);
const BASE = 'https://dartdraw-viewer.vercel.app';
const LIVE = BASE + '/live/mx24oh2j14ei';
function publish(t) {
  t.published = true; t.publicSlug = 'mx24oh2j14ei';
  app.__org = { viewerUrl: BASE };
  run(app, 'currentOrganizer = __org');
}
function ready(n, pods) {
  const t = makeTournament(app, n, { pods, boards: pods }); useState(app, t);
  t.format.anticipatedStartTime = '10:00';
  app.persist = () => {}; app.render = () => {};
  f('generatePods')(t, seededRng(3)); f('podsConfirmAll')(t);
  publish(t);
  return t;
}
function printed() {
  const mount = { innerHTML: '' };
  app.document = { getElementById: (id) => (id === 'printSheets' ? mount : null) };
  app.window = { print() {} };
  f('podsPrintClick')();
  return mount.innerHTML;
}
const svgOf = (html) => (html.match(/<svg [\s\S]*?<\/svg>/) || [''])[0];
const codeFor = (url) => f('qrSvg')(url, { size: '20mm' });

test('a Group Boards pack: each group sheet opens its own group, Finals the Finals, Boards the Boards tab, Players the event', () => {
  ready(12, 3);
  const sheets = printed().split('<div class="print-sheet').slice(1);
  const seen = {};
  sheets.forEach((sheet, i) => {
    if (sheet.includes('RULES &amp; FORMAT')) return;
    const grp = /sheet-sub">[^<]*Group (\d+) · /.exec(sheet);       // the Players sheet lists "Group N ·" in its rows too
    const want = sheet.includes('Groups in the order they play') ? LIVE + '#/boards'
      : sheet.includes('Find your group and board') ? LIVE
      : grp ? LIVE + '#/bracket/group-' + grp[1]
      : i === sheets.length - 1 ? LIVE + '#/bracket/finals' : null;
    assert.ok(want, 'unrecognised sheet ' + sheet.slice(0, 160));
    assert.equal(svgOf(sheet), codeFor(want), want);
    seen[want] = true;
  });
  assert.equal(Object.keys(seen).length, 6);            // players, boards, three groups, Finals
  assert.ok(seen[LIVE + '#/bracket/group-1'] && seen[LIVE + '#/bracket/group-3'] && seen[LIVE + '#/bracket/finals']);
});

test('the address printed beside a deep-link code stays the short event link, and the code differs from the plain event code', () => {
  ready(12, 3);
  const sheet = printed().split('<div class="print-sheet').find((s) => /sheet-sub">[^<]*Group 2 · /.test(s));
  assert.ok(sheet.includes('dartdraw-viewer.vercel.app/live/mx24oh2j14ei<'));
  assert.ok(!sheet.includes('#/'));
  assert.notEqual(svgOf(sheet), codeFor(LIVE));
});

test('round-robin group sheets open their group, knockout sheets open the bracket', () => {
  const rr = f('blankTournament')(); useState(app, rr);
  rr.format.formatType = 'roundrobin';
  rr.entriesList = Array.from({ length: 4 }, (_, i) => ({ id: 'r' + i, name: 'RR Player ' + (i + 1), org: '', players: [], withdrawn: false }));
  const g = { id: 'g1', label: 'C', boards: [1], startedAt: null, entryIds: rr.entriesList.map((e) => e.id), confirmed: true, gameStarted: false, scores: {}, positionOverrides: {} };
  rr.groups = [g];
  publish(rr);
  assert.equal(svgOf(f('chartSheetHTML')(g, true)), codeFor(LIVE + '#/groups/C'));

  const ko = f('blankTournament')(); useState(app, ko);
  ko.format.formatType = 'knockout';
  ko.entriesList = Array.from({ length: 8 }, (_, i) => ({ id: 'k' + i, name: 'KO Player ' + (i + 1), org: '', players: [], withdrawn: false }));
  ko.knockout = f('generateBracket')(ko.entriesList.map((e) => ({ entryId: e.id, org: '' })), 'Bracket');
  publish(ko);
  assert.equal(svgOf(f('knockoutBracketSheetHTML')(ko.knockout)), codeFor(LIVE + '#/bracket'));
});

test('a group label with unusual characters is escaped in the address, and the code is still produced', () => {
  const rr = f('blankTournament')(); useState(app, rr);
  rr.format.formatType = 'roundrobin';
  rr.entriesList = Array.from({ length: 4 }, (_, i) => ({ id: 'r' + i, name: 'P' + i, org: '', players: [], withdrawn: false }));
  const g = { id: 'g1', label: 'A B/C', boards: [1], startedAt: null, entryIds: rr.entriesList.map((e) => e.id), confirmed: true, gameStarted: false, scores: {}, positionOverrides: {} };
  rr.groups = [g];
  publish(rr);
  assert.equal(svgOf(f('chartSheetHTML')(g, true)), codeFor(LIVE + '#/groups/A%20B%2FC'));
});

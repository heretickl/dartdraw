const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, plain, useState, seededRng, makeTournament } = require('./lib/helpers');

const app = loadApp();
const f = (name) => run(app, name);
function ready(n, pods) {
  const t = makeTournament(app, n, { pods, boards: pods }); useState(app, t);
  t.format.anticipatedStartTime = '10:00';
  app.persist = () => {}; app.render = () => {};
  f('generatePods')(t, seededRng(3)); f('podsConfirmAll')(t);
  return t;
}
function printed() {
  const mount = { innerHTML: '' };
  app.document = { getElementById: (id) => (id === 'printSheets' ? mount : null) };
  app.window = { print() {} };
  f('podsPrintClick')();
  return mount.innerHTML;
}

test('player rows are alphabetical, ignore case, skip withdrawn players, and carry group, board and start', () => {
  const t = ready(12, 3);
  t.entriesList[0].name = 'zed'; t.entriesList[1].name = 'Alma'; t.entriesList[2].withdrawn = true;
  const rows = plain(f('bpPlayerRows')(t));
  assert.equal(rows.length, 11);
  assert.deepEqual(rows.map((r) => r.name), rows.map((r) => r.name).slice().sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())));
  assert.equal(rows[0].name, 'Alma'); assert.equal(rows[rows.length - 1].name, 'zed');
  const g = t.pods.find((p) => p.entryIds.includes('e0'));
  const row = rows.find((r) => r.name === 'zed');
  assert.equal(row.group, g.label); assert.equal(row.boards, g.boards.join(', '));
  assert.equal(row.startMs, f('bpRound5')(f('anticipatedStartEpoch')(t)));
});

test('the Players A–Z sheet lists every player once with group and board, and splits long lists over sheets', () => {
  const t = ready(12, 3);
  const html = f('bpPlayersSheetsHTML')(t);
  assert.match(html, /PLAYERS A–Z/);
  t.entriesList.forEach((e) => assert.ok(html.includes(e.name + '<'), e.name));
  assert.match(html, /Group \d · Board \d/);
  const big = ready(120, 16);
  assert.equal((f('bpPlayersSheetsHTML')(big).match(/class="print-sheet/g) || []).length, 4);   // 36 per sheet: ceil(120/36)
});

test('the Boards sheet lists each board with its groups in play order and the Finals matches on it', () => {
  const t = ready(12, 3);
  t.pods[1].boards = [t.pods[0].boards[0]];
  const html = f('bpBoardsSheetHTML')(t);
  assert.match(html, /BOARDS/);
  const row = html.split('Board ' + t.pods[0].boards[0])[1];
  assert.ok(row.indexOf('Group ' + t.pods[0].label) < row.indexOf('Group ' + t.pods[1].label));
  assert.match(html, /Finals/);
});

test('the Boards sheet splits over sheets so a long list of boards stays on the page', () => {
  const t = ready(64, 16);
  const html = f('bpBoardsSheetHTML')(t);
  assert.equal((html.match(/class="print-sheet/g) || []).length, 2);   // 14 boards per sheet: ceil(16/14)
  assert.match(html, /Sheet 1 of 2/);
});

test('the sheets are escaped', () => {
  const t = ready(12, 3);
  t.entriesList[0].name = '<img src=x onerror=1>'; t.entriesList[0].org = '<b>club</b>';
  const html = f('bpPlayersSheetsHTML')(t);
  assert.doesNotMatch(html, /<img/); assert.doesNotMatch(html, /<b>club/);
});

test('printing includes both sheets by default and honours the two toggles', () => {
  const t = ready(12, 3);
  let html = printed();
  assert.match(html, /PLAYERS A–Z/); assert.match(html, /BOARDS/);
  t.printSettings.playersSheetEnabled = false;
  html = printed(); assert.doesNotMatch(html, /PLAYERS A–Z/); assert.match(html, /BOARDS/);
  t.printSettings.boardsSheetEnabled = false;
  html = printed(); assert.doesNotMatch(html, /BOARDS/);
});

test('Stage 7 shows the two toggles and they save', () => {
  const t = ready(12, 3);
  const html = f('podsStage7')();
  assert.match(html, /id="playersSheetToggle"/); assert.match(html, /id="boardsSheetToggle"/);
  f('togglePlayersSheet')(false); f('toggleBoardsSheet')(false);
  assert.equal(t.printSettings.playersSheetEnabled, false); assert.equal(t.printSettings.boardsSheetEnabled, false);
});

// ---- the live-results QR code on the wall sheets ----
function publish(t, viewerUrl) {
  t.published = true; t.publicSlug = 'mx24oh2j14ei';
  app.__org = viewerUrl ? { viewerUrl } : null;
  run(app, 'currentOrganizer = __org');
}
test('the Players A–Z and Boards sheets carry a QR code and the link while public results are on', () => {
  const t = ready(12, 3);
  publish(t, 'https://dartdraw-viewer.vercel.app');
  [f('bpPlayersSheetsHTML')(t), f('bpBoardsSheetHTML')(t)].forEach((html) => {
    assert.match(html, /<svg [^>]*viewBox=/);
    assert.match(html, /Live results/);
    assert.ok(html.includes('dartdraw-viewer.vercel.app/live/mx24oh2j14ei'));
  });
});

test('no QR code is printed when public results are off, the slug is missing, or the viewer address is not set', () => {
  const t = ready(12, 3);
  publish(t, 'https://dartdraw-viewer.vercel.app');
  t.published = false;
  assert.doesNotMatch(f('bpPlayersSheetsHTML')(t), /<svg /);
  t.published = true; t.publicSlug = null;
  assert.doesNotMatch(f('bpBoardsSheetHTML')(t), /<svg /);
  publish(t, null);
  assert.doesNotMatch(f('bpPlayersSheetsHTML')(t), /<svg /);
  assert.doesNotMatch(f('bpPlayersSheetsHTML')(t), /Live results/);
});

test('every sheet in the printed pack carries the QR code except the rules sheet, and the wall sheets still list every player', () => {
  const t = ready(12, 3);
  publish(t, 'https://dartdraw-viewer.vercel.app');
  const html = printed();
  const sheets = html.split('<div class="print-sheet').slice(1);
  assert.ok(sheets.length >= 6);                                    // rules, players, boards, 3 groups, Finals
  sheets.forEach((sheet) => {
    const isRules = sheet.includes('RULES &amp; FORMAT');
    assert.equal(sheet.includes('aria-label="QR code for the live results link"'), !isRules, isRules ? 'rules sheet' : sheet.slice(0, 120));
  });
  t.entriesList.forEach((e) => assert.ok(html.includes(e.name + '<'), e.name));
  t.published = false;
  assert.doesNotMatch(printed(), /QR code for the live results link/);
});

test('a round-robin group sheet and a knockout chart sheet carry the QR code in the header, and none without a link', () => {
  const rr = f('blankTournament')(); useState(app, rr);
  rr.format.formatType = 'roundrobin';
  rr.entriesList = Array.from({ length: 4 }, (_, i) => ({ id: 'r' + i, name: 'RR Player ' + (i + 1), org: '', players: [], withdrawn: false }));
  const g = { id: 'g1', label: 'A', boards: [1], startedAt: null, entryIds: rr.entriesList.map((e) => e.id), confirmed: true, gameStarted: false, scores: {}, positionOverrides: {} };
  rr.groups = [g];
  publish(rr, 'https://dartdraw-viewer.vercel.app');
  const sheet = f('chartSheetHTML')(g, true);
  assert.match(sheet, /<div class="sheet-top" style="grid-template-columns:[^"]*auto auto">/);
  assert.match(sheet, /aria-label="QR code for the live results link"/);
  assert.ok(sheet.includes('dartdraw-viewer.vercel.app/live/mx24oh2j14ei'));
  rr.published = false;
  assert.doesNotMatch(f('chartSheetHTML')(g, true), /QR code/);

  const ko = f('blankTournament')(); useState(app, ko);
  ko.format.formatType = 'knockout';
  ko.entriesList = Array.from({ length: 8 }, (_, i) => ({ id: 'k' + i, name: 'KO Player ' + (i + 1), org: '', players: [], withdrawn: false }));
  ko.knockout = f('generateBracket')(ko.entriesList.map((e) => ({ entryId: e.id, org: '' })), 'Bracket');
  publish(ko, 'https://dartdraw-viewer.vercel.app');
  const kHtml = f('knockoutBracketSheetHTML')(ko.knockout);
  // the two-sided bracket sheet carries it under the Champion, in the centre column (with the sponsors)
  assert.match(kHtml, /<div class="kb-ink kb-zone"[^>]*><div class="kb-qr"/);
  assert.match(kHtml, /aria-label="QR code for the live results link"/);
  ko.published = false;
  assert.doesNotMatch(f('knockoutBracketSheetHTML')(ko.knockout), /QR code/);
});

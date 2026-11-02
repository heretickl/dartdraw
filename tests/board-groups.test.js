const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, plain, useState, play, playOut } = require('./lib/helpers');
const { sanitizeTournamentData } = require('../tournament-sanitize');

/* Board groups (docs/superpowers/specs/2026-11-02-board-groups-and-official-positions-design.md): a drawn bracket cut
   into equal sections, each on one board down to its board champion (boardgroups.js), the step-5 card, the A4 board
   sheets, and the match numbers in the organiser's Floor officials panel. The real app functions in the vm. */
const app = loadApp();
const f = (n) => run(app, n);
function koEvent(n, boards, opts) {
  opts = opts || {};
  const t = f('blankTournament')(); useState(app, t); app.persist = () => {}; app.render = () => {};
  t.eventCreation.tournamentName = 'Sample Open'; t.eventCreation.eventName = 'Men Singles'; t.eventCreation.boards = boards || 4;
  t.format.formatType = opts.format || 'knockout';
  t.entriesList = Array.from({ length: n }, (_, i) => ({ id: 'e' + String(i).padStart(3, '0'), name: 'P' + (i + 1), org: '', players: [], withdrawn: false }));
  t.knockout = f('generateBracket')(t.entriesList.map((e) => ({ entryId: e.id, org: '' })), 'Main bracket');
  return t;
}
const boardsOf = (b) => b.rounds.map((r) => Array.from(r).map((m) => m.board || 0));

test('the group counts offered: an even split, at least one match per group, at most 16 entries per group', () => {
  const choices = (n) => plain(f('bgChoices')(koEvent(n).knockout));
  assert.deepEqual(choices(4), [2]);
  assert.deepEqual(choices(8), [2, 4]);
  assert.deepEqual(choices(32), [2, 4, 8, 16]);
  assert.deepEqual(choices(64), [4, 8, 16]);
  assert.deepEqual(choices(128), [8, 16]);
  const t = koEvent(64);
  assert.equal(f('bgSet')(t.knockout, 2, 4), false, '32 per group is never set');
  assert.equal(t.knockout.boardGroups, undefined);
});

test('setting the split writes each group’s board on its matches up to the board champion; the groups go round the event’s boards', () => {
  const t = koEvent(32, 2), b = t.knockout;
  assert.equal(f('bgSet')(b, 4, 2), true);
  assert.deepEqual(plain(b.boardGroups), { count: 4, boards: [1, 2, 1, 2] });
  const got = boardsOf(b);
  assert.deepEqual(got[0], [1, 1, 1, 1, 2, 2, 2, 2, 1, 1, 1, 1, 2, 2, 2, 2]);
  assert.deepEqual(got[1], [1, 1, 2, 2, 1, 1, 2, 2]);
  assert.deepEqual(got[2], [1, 2, 1, 2]);
  assert.deepEqual(got[3], [0, 0], 'the semi-finals are not in any group');
  assert.deepEqual(got[4], [0]);
  assert.deepEqual([[0, 0], [0, 4], [1, 7], [2, 3], [3, 0]].map(([r, m]) => f('bgGroupOf')(b, r, m)), [1, 2, 4, 4, 0]);
  assert.deepEqual(plain(f('bgNextMatch')(b, 1)), { ri: 3, mi: 0 });
  assert.deepEqual(plain(f('bgNextMatch')(b, 4)), { ri: 3, mi: 1 });
});

test('a played match keeps its board, a bye gets none; changing a group’s board or removing the groups leaves played matches alone', () => {
  const t = koEvent(28, 4), b = t.knockout;   // 28 in a 32 bracket: four byes
  const played = Array.from(b.rounds[0]).find((m) => m.aEntryId && m.bEntryId && !m.bye);
  const pi = Array.from(b.rounds[0]).indexOf(played);
  played.board = 9; play(played, 'a'); f('propagateByes')(b.rounds);
  f('bgSet')(b, 4, 4);
  Array.from(b.rounds[0]).forEach((m) => { if (m.bye) assert.equal(m.board, undefined, 'a bye has no board'); });
  assert.equal(played.board, 9, 'the played match kept its board');
  const g = f('bgGroupOf')(b, 0, pi);
  assert.equal(f('bgSetBoard')(b, g, '7'), true);
  assert.equal(played.board, 9);
  Array.from(b.rounds[1]).forEach((m, mi) => { if (f('bgGroupOf')(b, 1, mi) === g) assert.equal(m.board, 7); });
  assert.equal(f('bgSetBoard')(b, g, 'x'), false, 'not a board number');
  f('bgRemove')(b);
  assert.equal(b.boardGroups, undefined);
  assert.equal(played.board, 9);
  assert.ok(boardsOf(b).flat().every((x) => x === 0 || x === 9), 'every board the split wrote is gone');
});

test('changing the number of groups clears the old boards before writing the new ones', () => {
  const t = koEvent(32, 4), b = t.knockout;
  f('bgSet')(b, 2, 4);
  assert.equal(b.rounds[3][0].board, 1, 'with 2 groups the semi-final is a group’s last match');
  f('bgSet')(b, 8, 4);
  assert.equal(b.rounds[3][0].board, undefined);
  assert.equal(b.rounds[2][0].board, undefined, 'with 8 groups the quarter-finals are after the groups');
  assert.deepEqual(boardsOf(b)[1], [1, 2, 3, 4, 1, 2, 3, 4]);
});

test('a save keeps a valid split and drops a broken one', () => {
  const keep = sanitizeTournamentData({ knockout: { rounds: [], boardGroups: { count: 4, boards: [1, '2', 3, 4] } } });
  assert.deepEqual(keep.knockout.boardGroups, { count: 4, boards: [1, 2, 3, 4] });
  [{ count: 3, boards: [1, 2, 3] }, { count: 4, boards: [1, 2] }, { count: 2, boards: [1, 0] }, { count: 2, boards: [1, '<b>'] }, 'x', null].forEach((g) => {
    const d = sanitizeTournamentData({ knockoutLosers: { rounds: [], boardGroups: g } });
    assert.equal('boardGroups' in d.knockoutLosers, false, JSON.stringify(g));
  });
});

test('the board sheets: one A4 landscape sheet per group, headed like the round robin sheet, ending in the board champion', () => {
  const t = koEvent(32, 4), b = t.knockout;
  f('bgSet')(b, 4, 4); f('bgSetBoard')(b, 1, 3);
  const html = f('boardGroupSheetsHTML')(b);
  assert.equal((html.match(/class="print-sheet bg-sheet"/g) || []).length, 4);
  assert.match(html, /class="sheet-top"/);
  assert.match(html, /BOARD 3/);
  assert.match(html, /Board group 1 of 4/);
  assert.match(html, /Main bracket · Board group 1 · Board 3/);
  assert.match(html, /BOARD CHAMPION/);
  assert.match(html, /The board champion goes on to the Semifinal \(match 4-1\)\./);
  assert.match(html, /data-kb="board"/);
  assert.equal((html.match(/mko-print-sheet/g) || []).length, 0, 'the chart is drawn inside the sheet, not as its own page');
});

test('the board sheet layout: only the group’s entries, the champion filled in once its last match is won, readable at 16 per group', () => {
  const t = koEvent(64, 4), b = t.knockout;
  f('bgSet')(b, 4, 4);
  const K = f('KBP'), model = K.fromBracket(b, t);
  const lay = K.boardLayout(model, { r: 3, m: 1 }, { w: 244, h: 122, champLabel: 'BOARD CHAMPION' });
  const names = Array.from(lay.items).filter((i) => i.k === 'box' && i.side && i.side.name).map((i) => i.side.name);
  const want = Array.from(b.rounds[0]).slice(8, 16).flatMap((m) => [m.aEntryId, m.bEntryId]).map((id) => t.entriesList.find((e) => e.id === id).name);
  assert.deepEqual(names.sort(), want.sort());
  assert.ok(lay.s >= 1, 'names at 7 pt or more: scale ' + lay.s);
  assert.equal(Array.from(lay.items).find((i) => i.k === 'champ').txt, '');
  playOut(app, b, () => 'a');   // every match: the 'a' side wins
  const lay2 = K.boardLayout(K.fromBracket(b, t), { r: 3, m: 1 }, { w: 244, h: 122 });
  assert.equal(Array.from(lay2.items).find((i) => i.k === 'champ').txt, t.entriesList.find((e) => e.id === b.rounds[3][1].winnerId).name);
});

test('the knockout print adds the board sheets after the brackets, only when set; Group Boards events never get them', () => {
  const t = koEvent(32, 4);
  const before = f('koPackSheetsHTML')();
  assert.doesNotMatch(before, /bg-sheet/);
  f('bgSet')(t.knockout, 2, 4);
  const after = f('koPackSheetsHTML')();
  assert.equal((after.match(/class="print-sheet bg-sheet"/g) || []).length, 2);
  assert.ok(after.indexOf('bg-sheet') > after.indexOf('kb-sheet'), 'after the bracket sheet');
  t.format.formatType = 'podknockout';
  assert.equal(f('bgBrackets')(t).length, 0);
  assert.equal(f('boardGroupsHTML')(), '');
});

test('the step-5 card: the choices with their group size, each group’s matches and board, print and remove; read-only once finalized', () => {
  const t = koEvent(32, 4);
  let html = f('boardGroupsHTML')();
  assert.match(html, /Board groups — Main bracket/);
  assert.match(html, /<option value="4">4 groups \(8 per group\)<\/option>/);
  assert.doesNotMatch(html, /Print board sheets/);
  f('bgUiSet')('knockout', '4');
  html = f('boardGroupsHTML')();
  assert.match(html, /Board group 4/);
  assert.match(html, /matches 1-13 to 3-4/);
  assert.match(html, /printBoardSheets\('knockout'\)/);
  assert.match(html, /Remove board groups/);
  f('bgUiBoard')('knockout', 2, '6');
  assert.deepEqual(plain(t.knockout.boardGroups.boards), [1, 6, 3, 4]);
  t.finalized = true;
  html = f('boardGroupsHTML')();
  assert.match(html, /<select disabled/);
  assert.doesNotMatch(html, /Remove board groups/);
  const box = { m: null }; app.finalizedBlockModal = () => { box.m = 'blocked'; };
  f('bgUiSet')('knockout', '');
  assert.equal(box.m, 'blocked');
  assert.ok(t.knockout.boardGroups, 'nothing changed');
});

test('the Plate gets its own card and sheets', () => {
  const t = koEvent(16, 4);
  t.knockoutLosers = f('generateBracket')(t.entriesList.slice(0, 8).map((e) => ({ entryId: e.id, org: '' })), 'Plate pool');
  f('bgUiSet')('knockoutLosers', '2');
  assert.equal(t.knockout.boardGroups, undefined);
  assert.match(f('boardGroupsHTML')(), /Board groups — Plate/);
  assert.match(f('boardGroupSheetsHTML')(t.knockoutLosers), /Plate · Board group 2/);
  assert.match(f('boardGroupSheetsHTML')(t.knockoutLosers), /match P3-1/);
});

test('a refused result in the Floor officials panel names the match as the paper does', () => {
  const t = koEvent(8, 2, { format: 'rrknockout' });
  t.groups = [{ id: 'gA', label: 'A', entryIds: ['e003', 'e000', 'e005', 'e001'], boards: [1], confirmed: true, gameStarted: true, scores: {} }];
  const line = f('refusedText')(t, { pos: 'rr:gA:e000|e001', op: 'score', la: 3, lb: 1, reason: 'not_your_board' });
  const ms = plain(f('groupMatches')(t.groups[0])), i = ms.findIndex((p) => p.includes('e000') && p.includes('e001'));
  const q1 = t.groups[0].entryIds.indexOf(ms[i][0]) + 1, q2 = t.groups[0].entryIds.indexOf(ms[i][1]) + 1, pa = Math.min(q1, q2), pb = Math.max(q1, q2);   // the lower position first
  assert.ok(line.startsWith('Group A Match ' + (i + 1) + ' (' + pa + ' v ' + pb + ') '), line);
  const ko = f('refusedText')(t, { pos: 'ko:knockout:0:1', op: 'win', side: 'a', reason: 'not_your_board' });
  assert.ok(ko.startsWith('Match 1-2 '), ko);
});

test('every new word is there in English and Bahasa Malaysia', () => {
  const fs = require('fs');
  const keys = ['bg.title', 'bg.intro', 'bg.main', 'bg.plate', 'bg.count', 'bg.none', 'bg.opt', 'bg.auto', 'bg.group', 'bg.groupOf', 'bg.matches', 'bg.board', 'bg.boardN', 'bg.sheetBoard', 'bg.print', 'bg.remove', 'bg.champion', 'bg.next', 'fo.paperRR', 'fo.paperKO'];
  const enTxt = fs.readFileSync(require.resolve('../i18n/app.en.js'), 'utf8'), msTxt = fs.readFileSync(require.resolve('../i18n/app.ms.js'), 'utf8');
  keys.forEach((k) => { assert.ok(enTxt.includes("'" + k + "'"), 'en ' + k); assert.ok(msTxt.includes("'" + k + "'"), 'ms ' + k); });
  const sEn = fs.readFileSync(require.resolve('../i18n/score.en.js'), 'utf8'), sMs = fs.readFileSync(require.resolve('../i18n/score.ms.js'), 'utf8');
  ['matchNo', 'pos', 'boardGroup'].forEach((k) => { assert.ok(sEn.includes("'" + k + "'"), 'score en ' + k); assert.ok(sMs.includes("'" + k + "'"), 'score ms ' + k); });
});

/* ---------- review fixes ---------- */
test('review: a group that is only a bye names its player as the board champion and draws no loose line', () => {
  const t = koEvent(6, 2), b = t.knockout;   // 6 in an 8 bracket: two first-round byes
  f('bgSet')(b, 4, 2);
  const byeAt = Array.from(b.rounds[0]).findIndex((m) => m.bye);
  assert.ok(byeAt >= 0);
  const M = b.rounds[0][byeAt], who = t.entriesList.find((e) => e.id === (M.aEntryId || M.bEntryId)).name;
  const K = f('KBP'), lay = K.boardLayout(K.fromBracket(b, t), { r: 0, m: byeAt }, { w: 244, h: 134 });
  assert.equal(Array.from(lay.items).find((i) => i.k === 'champ').txt, who);
  assert.equal(lay.paths.length, 0, 'no line to a box that is not there');
});

test('review: a stored group count the bracket cannot have is ignored (step 5 still draws, nothing is boarded)', () => {
  const t = koEvent(8, 2), b = t.knockout;
  b.boardGroups = { count: 16, boards: Array.from({ length: 16 }, () => 1) };
  assert.doesNotThrow(() => f('boardGroupsHTML')());
  assert.equal(f('bgGroupOf')(b, 0, 0), 0);
  assert.equal(f('boardGroupSheetsHTML')(b), '');
});

test('leftovers: a match already called to its board stays there when its group\u2019s board changes or the groups are removed', () => {
  const t = koEvent(32, 4), b = t.knockout;
  f('bgSet')(b, 4, 4);
  const m = b.rounds[0][1]; m.called = true; m.calledAt = 1; m.calledPair = m.aEntryId + '|' + m.bEntryId;
  f('bgSetBoard')(b, 1, 9);
  assert.equal(m.board, 1, 'still on the board it was called to');
  assert.equal(b.rounds[0][0].board, 9, 'the rest of the group moved');
  f('bgRemove')(b);
  assert.equal(m.board, 1);
  assert.equal(b.rounds[0][0].board, undefined);
});

test('leftovers: a "not sent" line names the players lower position first, like its numbers', () => {
  const t = koEvent(8, 2, { format: 'rrknockout' });
  t.entriesList[0].name = 'Ali'; t.entriesList[1].name = 'Hakim';
  t.groups = [{ id: 'gA', label: 'A', entryIds: ['e001', 'e002', 'e003', 'e000'], boards: [1], confirmed: true, gameStarted: true, scores: {} }];
  const line = f('refusedText')(t, { pos: 'rr:gA:e000|e001', op: 'score', la: 3, lb: 1, reason: 'not_your_board' });
  assert.match(line, /\(1 v 4\) Hakim v Ali/, line);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { loadApp, run, useState, playOut } = require('./lib/helpers');

/* Owner, 2026-11-02: (1) every printed sheet is headed by the tournament's name, with the event under it; (2) the board
   groups' Finals sheet has empty write-in boxes with "Board group N champion" over each, clear of the box; the board
   sheets print names in full; (3) on a phone the display view (pop-out) has a way back to Manage Tournament. */
const app = loadApp();
const f = (n) => run(app, n);
const PT = 25.4 / 72;
function event(n, opts) {
  opts = opts || {};
  const t = f('blankTournament')(); useState(app, t); app.persist = () => {}; app.render = () => {};
  Object.assign(t.eventCreation, { tournamentName: opts.tournament || 'Kejohanan Novus', eventName: opts.event || 'Men Singles', eventType: 'Open', competitionUnit: 'Singles', boards: 4, date: '2026-11-07' });
  t.format.formatType = opts.format || 'knockout';
  t.entriesList = Array.from({ length: n }, (_, i) => ({ id: 'e' + String(i).padStart(3, '0'), name: (opts.long ? 'A VERY LONG TEAM NAME NUMBER ' : 'P') + (i + 1), org: '', players: [], withdrawn: false }));
  t.knockout = f('generateBracket')(t.entriesList.map((e) => ({ entryId: e.id, org: '' })), 'Main bracket');
  t.groups = [{ id: 'gA', label: 'A', entryIds: t.entriesList.slice(0, 4).map((e) => e.id), boards: [1], confirmed: true, gameStarted: false, scores: {} }];
  return t;
}
/* positioned items of a printed bracket: { cls, x, y, w, h } in mm */
const items = (html) => [...html.matchAll(/class="kb-ink ([a-z-]+)[^"]*"[^>]*?style="left:(-?[\d.]+)mm;top:(-?[\d.]+)mm;width:([\d.]+)mm;height:([\d.]+)mm/g)]
  .map((m) => ({ cls: m[1], x: +m[2], y: +m[3], w: +m[4], h: +m[5] }));
const overlap = (a, b) => a.x < b.x + b.w - 0.01 && b.x < a.x + a.w - 0.01 && a.y < b.y + b.h - 0.01 && b.y < a.y + a.h - 0.01;

test('header: the round robin sheet leads with the tournament, the event under it; the category is not repeated when it is the event’s name', () => {
  event(8);
  const g = () => f('chartSheetHTML')(run(app, 'state.groups[0]'), true);
  assert.match(g(), /<div class="sheet-title">Kejohanan Novus<\/div><div class="sheet-event">Men Singles<\/div>/);
  assert.match(g(), /<div class="sheet-sub">Open Singles · Round Robin Stage/);
  event(8, { event: 'Open Singles' });
  assert.match(g(), /<div class="sheet-sub">Round Robin Stage/, 'not "Open Singles · " again');
  event(8, { tournament: 'Kejohanan Beregu Novus Sports x All Iin Semenyih' });
  assert.match(g(), /<div class="sheet-title long">Kejohanan Beregu Novus Sports x All Iin Semenyih<\/div>/, 'a long name: a smaller headline, never cut');
  assert.doesNotMatch(g(), /title-overline/);
});

test('header: the knockout sheet’s title block shows the tournament large and the event under it; a split sheet’s strip names both', () => {
  const t = event(16);
  const html = f('knockoutBracketSheetHTML')(t.knockout);
  assert.match(html, /<div class="kb-tt[^"]*"[^>]*>Kejohanan Novus<\/div><div class="kb-ev[^"]*"[^>]*>MEN SINGLES<\/div>/);
  assert.doesNotMatch(html, /class="kb-ov/);
  const K = f('KBP'), model = K.fromBracket(event(64).knockout, run(app, 'state'));
  const sp = K.splitPlan(model);
  assert.ok(sp, 'a 64 bracket can be split');
  const split = f('kbSplitSheetsHTML')(model, sp, f('koSheetChrome')(run(app, 'state'), run(app, 'state.knockout'), { stage: 'Knockout Stage', legsSub: '', legend: '', label: 'MAIN BRACKET', detail: '' }));
  assert.match(split, /<span><b>Kejohanan Novus<\/b> · Men Singles · MAIN BRACKET<\/span>/);
});

test('header: a sub line with no date leaves no separator hanging', () => {
  const t = event(8); t.eventCreation.date = '';
  assert.doesNotMatch(f('printSubHTML')(t), / · $/);
});

test('Finals sheet: empty write-in boxes, even once board champions are known, with "Board group N champion" above each, at least 2 pt clear of its box', () => {
  const t = event(64); f('bgSet')(t.knockout, 16, 4);
  playOut(app, t.knockout, () => 'a');
  const html = f('boardGroupFinalsSheetHTML')(t.knockout);
  assert.doesNotMatch(html, /P\d+</, 'no names in the boxes');
  const caps = [...html.matchAll(/class="kb-ink kb-cap[^"]*"[^>]*>([^<]*)</g)].map((m) => m[1]);
  assert.equal(caps.length, 16);
  assert.equal(caps.filter((c) => /^Board group \d+ champion( \(Board \d+\))?$/.test(c)).length, 16);
  assert.ok(caps.includes('Board group 1 champion') && caps.includes('Board group 5 champion (Board 1)'), 'a group on another board number says which');
  const it = items(html), boxes = it.filter((i) => i.cls === 'kb-bx'), capIt = it.filter((i) => i.cls === 'kb-cap');
  capIt.forEach((c) => {
    const own = boxes.filter((b) => Math.abs(b.x - c.x) < 0.01 && b.y >= c.y + c.h - 0.01).sort((p, q) => p.y - q.y)[0];
    assert.ok(own, 'a box under each caption');
    assert.ok((own.y - (c.y + c.h)) / PT >= 2, 'gap ' + ((own.y - (c.y + c.h)) / PT).toFixed(2) + ' pt');
    it.filter((o) => !['kb-cap', 'kb-crown', 'kb-zone'].includes(o.cls)).forEach((o) => assert.ok(!overlap(c, o), 'a caption touches a ' + o.cls));
    assert.ok(c.y >= 0 && c.x >= 0 && c.y + c.h <= 194.01 && c.x + c.w <= 281.01, 'inside the page');
  });
  assert.match(fs.readFileSync(require.resolve('../app.html'), 'utf8'), /\.kb-sheet \.kb-cap\{[^}]*line-height:1\.35/, 'a tall enough line for g and p');
});

test('Finals sheet: with 4 groups the Semifinal title clears the captions; with 2 groups the captions sit beside the finalists', () => {
  let t = event(32); f('bgSet')(t.knockout, 4, 4);
  let it = items(f('boardGroupFinalsSheetHTML')(t.knockout));
  const caps = it.filter((i) => i.cls === 'kb-cap');
  assert.equal(caps.length, 4);
  it.filter((i) => i.cls === 'kb-rl').forEach((r) => caps.forEach((c) => assert.ok(!overlap(c, r), 'a round title over a caption')));
  t = event(8); f('bgSet')(t.knockout, 2, 4);
  it = items(f('boardGroupFinalsSheetHTML')(t.knockout));
  const two = it.filter((i) => i.cls === 'kb-cap'), fin = it.filter((i) => i.cls === 'kb-bx');
  assert.equal(two.length, 2);
  two.forEach((c) => { assert.ok(c.x + c.w <= Math.min(...fin.map((b) => b.x)) + 0.01, 'left of the finalists'); fin.forEach((b) => assert.ok(!overlap(c, b))); });
});

test('board sheets print every name in full; the knockout sheet still shortens', () => {
  const t = event(16, { long: true }); f('bgSet')(t.knockout, 2, 4);
  const sheets = f('boardGroupSheetsHTML')(t.knockout);
  assert.doesNotMatch(sheets, /…/);
  assert.match(sheets, /A VERY LONG TEAM NAME NUMBER 1</);
  assert.match(f('knockoutBracketSheetHTML')(t.knockout), /…/, 'the knockout sheet is unchanged');
});

test('phone: the display view has a way back to Manage Tournament, shown on phones only; it closes the tab the app opened, else goes to step 5', () => {
  const src = fs.readFileSync(require.resolve('../app.html'), 'utf8');
  assert.match(src, /\.popout-back\{display:none;flex-shrink:0\}\nbody\.is-phone \.popout-back\{display:inline-flex\}/);
  assert.equal((src.match(/'<div class="mko-popout-header">'\+popoutBackHTML\(\)\+/g) || []).length, 2, 'both display views');
  assert.match(f('popoutBackHTML')(), /<button class="btn ghost popout-back" onclick="popoutBack\(\)">← Back to Manage Tournament<\/button>/);
  const t = event(8); t.id = 'ev 1';
  const later = [];
  app.setTimeout = (fn) => later.push(fn);
  app.location = { pathname: '/app', href: '' };
  app.window = { opener: null, closed: false, close() { this.closed = true; } };
  f('popoutBack')(); later.splice(0).forEach((fn) => fn());
  assert.equal(app.location.href, '/app?t=ev%201&stage=5', 'no opener: step 5 of the event');
  app.location.href = '';
  app.window = { opener: { closed: false }, closed: false, close() { this.closed = true; } };
  f('popoutBack')(); later.splice(0).forEach((fn) => fn());
  assert.equal(app.location.href, '', 'opened by the app: the tab closes, nothing else');
});

test('review: one very long name does not shrink the other board sheets; a sheet whose full name would print under 6 pt shortens it instead', () => {
  const t = event(64); f('bgSet')(t.knockout, 4, 4);
  const longId = t.knockout.rounds[0][0].aEntryId;
  t.entriesList.find((e) => e.id === longId).name = 'Muhammad Haziq Iskandar bin Ismail / Ahmad Faizal Hakimi bin Abdullah';
  const K = f('KBP'), model = K.fromBracket(t.knockout, t);
  const sizes = [0, 1, 2, 3].map((g) => {
    const lay = K.boardLayout(model, { r: 3, m: g }, { w: 244, h: 122 });
    return { pt: 7 * lay.s, notes: lay.notes.length };
  });
  sizes.slice(1).forEach((x, i) => assert.ok(x.pt >= 7, 'group ' + (i + 2) + ' names at ' + x.pt.toFixed(2) + ' pt'));
  assert.ok(sizes[0].pt >= 6, 'the long name’s own sheet at ' + sizes[0].pt.toFixed(2) + ' pt');
  assert.equal(sizes[0].notes, 1, 'there, the long name is shortened with its footnote');
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, useState } = require('./lib/helpers');

/* The projected bracket printed before the round robin (Round robin -> Knockout, seeded) must show the placement the
   real draw will make. Each case builds real groups, works out the projected bracket from group composition only,
   then plays every group (the earlier-listed entry always wins, so the finishing order is the listed order and every
   label stands for a known entry) and draws the real bracket with generateKnockoutFromRR: the round-1 pairings, by
   label, must be identical, for the main bracket and the Plate pool. */
const app = loadApp();
const f = (n) => run(app, n);
app.persist = () => {}; app.render = () => {}; app.renderSavedList = () => {}; app.openModal = () => {};
run(app, 'currentOrganizer = { name: "S", email: "s@x.com", tier: "pro", entryLimit: null, viewerUrl: "" }');

function event(n, maxPerGroup, qualifiers, opts) {
  opts = opts || {};
  const t = f('blankTournament')(); useState(app, t);
  Object.assign(t.eventCreation, { saved: true, entries: n, competitionUnit: opts.unit || 'Singles' });
  Object.assign(t.format, { saved: true, formatType: 'rrknockout', maxPerGroup, qualifiersPerGroup: qualifiers, advanceMode: 'seeded', losersPool: !!opts.plate, plateQualifiersPerGroup: opts.plateCap || null });
  t.entriesList = Array.from({ length: n }, (_, i) => ({ id: 'e' + String(i).padStart(3, '0'), name: 'Entry ' + (i + 1), org: '', withdrawn: false }));
  f('buildGroups')(t);
  t.groups.forEach((g) => { g.confirmed = true; });
  return t;
}
/* The name boxes of a printed two-sided bracket sheet: round, match, slot and the text shown. The projected (blank) sheet
   leaves its boxes empty for writing and prints the group label (A1) beside the box, right after it in the HTML: that
   label is the box's text here. */
const boxes = (sheet) => {
  const out = [];
  for (const m of sheet.matchAll(/data-r="(\d+)" data-m="(\d+)" data-s="([ab])" style="[^"]*"><span class="kb-nm"[^>]*>([^<]*)|class="kb-ink kb-seed [lr]"[^>]*>([^<]*)/g)) {
    if (m[1] != null) out.push({ r: +m[1], m: +m[2], s: m[3], text: m[4] });
    else if (out.length && !out[out.length - 1].text) out[out.length - 1].text = m[5];
  }
  return out;
};
// Round-1 pairings of a bracket, by seed label ('-' for a bye slot), in slot order.
const pairs = (b) => Array.from(b.rounds[0], (m) => [m.aEntryId ? b.seedLabels[m.aEntryId] : '-', m.bEntryId ? b.seedLabels[m.bEntryId] : '-'].join(' v '));
function playAll(t) {
  t.groups.forEach((g) => {
    g.gameStarted = true;
    f('groupMatches')(g).forEach(([a, b]) => { const first = g.entryIds.indexOf(a) < g.entryIds.indexOf(b); f('setScore')(g, a, b, first ? 3 : 0, first ? 0 : 3); });
  });
}
function compare(label, n, maxPerGroup, qualifiers, opts) {
  const t = event(n, maxPerGroup, qualifiers, opts);
  const projMain = f('generateBracket')(f('projectedQualifierEntries')(t), 'Main bracket (projected)');
  const projPlate = t.format.losersPool && f('projectedNonQualifierEntries')(t).length >= 2 ? f('generateBracket')(f('projectedNonQualifierEntries')(t), 'Plate pool (projected)') : null;
  playAll(t);
  f('generateKnockoutFromRR')();
  assert.ok(t.knockout, label + ': drawn');
  assert.deepEqual(pairs(projMain), pairs(t.knockout), label + ': main bracket round 1');
  if (projPlate || t.knockoutLosers) assert.deepEqual(pairs(projPlate), pairs(t.knockoutLosers), label + ': Plate pool round 1');
  return { t, projMain, projPlate };
}
// The round (0 = round 1, last = the final) where two labelled entries can first meet in a bracket.
function meetRound(b, la, lb) {
  const slotOf = (lab) => { const id = Object.keys(b.seedLabels).find((k) => b.seedLabels[k] === lab); let s = -1; b.rounds[0].forEach((m, i) => { if (m.aEntryId === id) s = 2 * i; if (m.bEntryId === id) s = 2 * i + 1; }); return s; };
  return f('earliestMeetingRound')(slotOf(la), slotOf(lb));
}

test('16 entries, 4 groups x 2: the projected sheet is the real draw, A1 v D2 | C1 v B2 | B1 v C2 | D1 v A2, groups meet only in the final', () => {
  const { projMain, t } = compare('4x2', 16, 4, 2);
  assert.deepEqual(pairs(projMain), ['A1 v D2', 'C1 v B2', 'B1 v C2', 'D1 v A2']);
  const last = projMain.rounds.length - 1;
  t.groups.forEach((g) => assert.equal(meetRound(projMain, g.label + '1', g.label + '2'), last, 'group ' + g.label));
  // and the printed pack uses it (before the round robin is played)
  const u = event(16, 4, 2);
  const mount = { innerHTML: '' };
  const DOC = app.document; app.document = { getElementById: () => mount };
  try { f('runPrintPack')(u.groups); } finally { app.document = DOC; }
  const sheet = mount.innerHTML.slice(mount.innerHTML.indexOf('MAIN BRACKET (PROJECTED)'));
  const r0 = boxes(sheet).filter((b) => b.r === 0).sort((a, b) => a.m - b.m || a.s.localeCompare(b.s));
  const printed = []; for (let i = 0; i < r0.length; i += 2) printed.push(r0[i].text + ' v ' + r0[i + 1].text);
  assert.deepEqual(printed, ['A1 v D2', 'C1 v B2', 'B1 v C2', 'D1 v A2']);
  assert.match(mount.innerHTML, /data-kb="two-sided" data-paper="A4"[^>]*data-label="MAIN BRACKET \(PROJECTED\)"/, 'the projected bracket is two-sided, like the real one');
  assert.ok(boxes(sheet).every((b) => !/kb-bx[^"]*"/.test(b.text)), 'parsed');
  assert.match(sheet, /class="kb-ink kb-bx lbl blank" data-r="0"/, 'the first-round boxes are left empty for writing the names in');
});

test('8 groups x 2 (32 entries): projected = real, and every group pair meets only in the final', () => {
  const { projMain, t } = compare('8x2', 32, 4, 2);
  const last = projMain.rounds.length - 1;
  t.groups.forEach((g) => assert.equal(meetRound(projMain, g.label + '1', g.label + '2'), last, 'group ' + g.label));
});

test('4 groups x 3 qualifiers, 6 groups x 2 with byes, and uneven groups: projected = real, separation as good as the real draw', () => {
  [['4x3', 16, 4, 3], ['6x2 byes', 24, 4, 2], ['uneven 14 (4,4,3,3)', 14, 4, 2], ['uneven 11 x3', 11, 4, 3], ['5x2 byes', 20, 4, 2], ['3x2', 9, 3, 2]].forEach(([label, n, max, q]) => {
    const { projMain, t } = compare(label, n, max, q);
    // same-group pairs are separated exactly as in the real bracket
    t.groups.forEach((g) => {
      for (let a = 1; a <= q; a++) for (let b = a + 1; b <= q; b++) {
        if (g.entryIds.length < b) continue;
        assert.equal(meetRound(projMain, g.label + a, g.label + b), meetRound(t.knockout, g.label + a, g.label + b), label + ' ' + g.label + a + '/' + g.label + b);
      }
    });
    if (label === '6x2 byes') assert.ok(projMain.rounds[0].some((m) => m.bye), 'byes in the projected bracket too');
  });
});

test('with the Plate pool on (all of the rest, or a capped band): the projected Plate pool is the real one', () => {
  compare('plate 4x2', 16, 4, 2, { plate: true });
  compare('plate 6 groups of 4, cap 1', 24, 4, 2, { plate: true, plateCap: 1 });
  compare('plate uneven', 14, 4, 1, { plate: true });
  compare('plate Teams', 16, 4, 2, { plate: true, unit: 'Teams' });
  compare('Doubles', 16, 4, 2, { unit: 'Doubles' });
});

test('the old plain layout is gone: the projected sheet never pairs a group\'s qualifiers in the same half when the real draw does not', () => {
  const t = event(16, 4, 2);
  const html = f('projectedBracketSheetHTML')(f('projectedQualifierEntries')(t), 'Main bracket (projected)');
  assert.doesNotMatch(html, /<span>A1<\/span><\/div><div class="bracket-side"><span>D2<\/span>[\s\S]*?<span>D1<\/span><\/div><div class="bracket-side"><span>A2<\/span>[\s\S]*?<span>B1<\/span>/, 'not A1 v D2 | D1 v A2 | B1 v C2 | C1 v B2');
  assert.match(html, /Projected Knockout Placement/);
  assert.match(html, /8-slot draw · 8 qualifiers/);
  // random placement is unknown until the draw: nothing is projected then
  t.format.advanceMode = 'random';
  const mount = { innerHTML: '' };
  const DOC = app.document; app.document = { getElementById: () => mount };
  try { f('runPrintPack')(t.groups); } finally { app.document = DOC; }
  assert.doesNotMatch(mount.innerHTML, /PROJECTED/);
});

/* ---------- round 6: what the printed projected sheets show ---------- */
/* Prints the pack; a bracket too big for the paper opens the paper dialog, answered with its default (the recommended size). */
function pack(t) {
  const mount = { innerHTML: '' };
  const DOC = app.document, MODAL = app.openModal; app.document = { getElementById: () => mount };
  app.openModal = (m) => { if (m.onConfirm) m.onConfirm(); };
  try { f('runPrintPack')(t.groups); } finally { app.document = DOC; app.openModal = MODAL; }
  return mount.innerHTML;
}
test('byes: the sheet shows the BYE tag and the bye winner already moved on, as in a fresh draw', () => {
  const t = event(20, 4, 2);                                       // 5 groups x 2 = 10 entries in a 16-slot bracket: 6 byes
  const sheet = f('projectedBracketSheetHTML')(f('projectedQualifierEntries')(t), 'Main bracket (projected)');
  assert.equal((sheet.match(/class="kb-ink kb-bye"/g) || []).length, 6);
  const b = f('generateBracket')(f('projectedQualifierEntries')(t), 'Main bracket (projected)');
  const byeLabels = b.rounds[0].filter((m) => m.bye).map((m) => b.seedLabels[m.aEntryId || m.bEntryId]);
  assert.equal(byeLabels.length, 6);
  const printed = boxes(sheet);
  // byes are collapsed: no first-round box for them, the qualifier starts in round 2
  assert.equal(printed.filter((x) => x.r === 0).length, 4, 'only the 2 real first-round matches use the first column');
  byeLabels.forEach((l) => { assert.ok(printed.some((x) => x.r === 1 && x.text === l), l + ' is shown in the next round'); assert.ok(!printed.some((x) => x.r === 0 && x.text === l)); });
  assert.ok(byeLabels.every((l) => /1$/.test(l) || l === 'A2'), 'byes go to the group winners first: ' + byeLabels.join());
});
test('the footer warns clearly when any entry has an organisation, and only then', () => {
  const t = event(16, 4, 2);
  const note = /Some entries have an organisation: the real draw also keeps entries from the same organisation apart, so the actual bracket will probably differ from this sheet\./;
  assert.doesNotMatch(f('projectedBracketSheetHTML')(f('projectedQualifierEntries')(t), 'M'), note);
  t.entriesList[5].org = 'Club';
  assert.match(f('projectedBracketSheetHTML')(f('projectedQualifierEntries')(t), 'M'), note);
  t.entriesList[5].withdrawn = true;
  assert.doesNotMatch(f('projectedBracketSheetHTML')(f('projectedQualifierEntries')(t), 'M'), note, 'a withdrawn entry does not count');
});
test('the printed pack: the Plate pool sheet with the Plate pool on, none without a main bracket, none above 128 entries', () => {
  const t = event(16, 4, 2, { plate: true });
  const html = pack(t);
  assert.match(html, /MAIN BRACKET \(PROJECTED\)/); assert.match(html, /PLATE POOL \(PROJECTED\)/);
  const plateSheet = html.slice(html.indexOf('PLATE POOL (PROJECTED)'));
  assert.deepEqual(boxes(plateSheet).filter((x) => x.r === 0).map((x) => x.text).sort(), ['A3', 'A4', 'B3', 'B4', 'C3', 'C4', 'D3', 'D4']);
  assert.match(plateSheet, />P1-1</, 'Plate pool match numbers carry the P');
  // 1 group, 1 qualifier: the real draw makes no knockout at all, so no Plate pool is projected either
  const one = event(4, 4, 1, { plate: true });
  const h1 = pack(one);
  assert.doesNotMatch(h1, /PROJECTED/);
  // more than 128 qualifiers: no bracket that big exists: one line says so instead (and printing never stalls)
  const huge = event(260, 4, 3);
  assert.equal(f('projectedQualifierEntries')(huge).length, 195);
  const t0 = Date.now();
  const hh = pack(huge);
  assert.ok(Date.now() - t0 < 3000);
  assert.match(hh, /MAIN BRACKET \(PROJECTED\)<\/strong><span>not projected<\/span>/);
  assert.match(hh, /195 entries would go into the main bracket, but the largest bracket holds 128\./);
  assert.doesNotMatch(hh, /bracket-col/);
  // exactly 128 (64 groups of 2, top 2) is projected; 130 (65 groups) is not
  const edge = event(128, 2, 2);
  assert.equal(f('projectedQualifierEntries')(edge).length, 128);
  assert.match(pack(edge), /data-label="MAIN BRACKET \(PROJECTED\)"[\s\S]*128-slot draw · 128 qualifiers/);
  assert.match(pack(event(130, 2, 2)), /130 entries would go into the main bracket, but the largest bracket holds 128\./);
  // a Plate pool over 128 (22 groups of 8, top 2, the rest in the Plate): the main bracket is projected, the Plate gets the line
  const ph = pack(event(176, 8, 2, { plate: true }));
  assert.match(ph, /data-label="MAIN BRACKET \(PROJECTED\)"[\s\S]*64-slot draw · 44 qualifiers/);
  assert.match(ph, /PLATE POOL \(PROJECTED\)<\/strong><span>not projected<\/span>/);
  assert.match(ph, /132 entries would go into the Plate pool, but the largest bracket holds 128\./);
  assert.match(ph, /Set or lower (&quot;|")Plate entries per group(&quot;|") in Format &amp; branding, or turn the Plate pool off\. Do this before the knockout is drawn\./);
  // the note says what to change: the cut-off for the main bracket, and only fewer groups when only the winners go through
  assert.match(hh, /Lower (&quot;|")Entries per group \(advance to knockout\)/);
  assert.doesNotMatch(hh, /Plate pool is not projected either/);
  assert.match(pack(event(260, 2, 1)), /130 entries would go into the main bracket, but the largest bracket holds 128\. Use fewer groups \(only each group winner goes through already\)\./);
  // main over 128 with the Plate pool on: the main note also says the Plate is not projected (the real draw makes neither)
  const both = pack(event(260, 4, 3, { plate: true }));
  assert.match(both, /195 entries would go into the main bracket.*The Plate pool is not projected either/);
  assert.doesNotMatch(both, /PLATE POOL \(PROJECTED\)/);
});

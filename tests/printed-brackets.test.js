const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadApp, run, plain, useState, seededRng, playOut, makeTournament } = require('./lib/helpers');
const { sanitizeTournamentData } = require('../tournament-sanitize');

/* Printed brackets (docs/superpowers/specs/2026-10-22-printed-brackets-design.md): one two-sided sheet per bracket at one
   scale, the paper rule and its three-option dialog, split sections, the running order and Group Boards Finals fixes,
   and the Teams lineup sheets. These run the real app functions in the vm; the vm has no real canvas, so text is measured
   with the print font's own advance widths (bracket-print.js), which the browser audit checks against the real page. */
const app = loadApp();
const f = (n) => run(app, n);
const K = run(app, 'KBP');
const DOC = app.document;
let modals = [], saves = 0;
function reset() {
  modals = []; saves = 0;
  app.openModal = (m) => { modals.push(m); };
  app.persist = () => { saves++; }; app.render = () => {}; app.renderSavedList = () => {}; app.setSaveStatus = () => {};
  app.document = DOC;
  app.__org = { name: 'Sam', email: 's@x.com', tier: 'pro', entryLimit: null, viewerUrl: 'https://live.example.com' };
  run(app, 'currentOrganizer = __org; lockedIds.clear(); popoutMode = false; popoutSection = "knockout"; emptyLineupCount = 1');
}
const pad = (n) => String(n).padStart(2, '0');
function names(prefix, n, longs) { const a = []; for (let i = 1; i <= n; i++) a.push(prefix + ' ' + pad(i)); Object.keys(longs || {}).forEach((k) => { a[+k - 1] = longs[k]; }); return a; }
// The 67-entry sample of the design mockups: five long names, the longest 17 characters.
const S67 = names('Singles', 67, { 3: 'Kieran McLaughlin', 12: 'Rhys Llewellyn', 29: "Mick O'Halloran", 44: 'Siobhan Doherty', 61: 'Wojciech Nowak' });
function koEvent(list, opts) {
  opts = opts || {};
  const t = f('blankTournament')(); useState(app, t);
  t.id = 't_print_' + list.length + (opts.unit || '');
  Object.assign(t.eventCreation, { saved: true, tournamentName: 'Riverside Darts Festival 2026', eventName: 'Open ' + (opts.unit || 'Singles'), eventType: 'Open', competitionUnit: opts.unit || 'Singles', entries: list.length });
  Object.assign(t.format, { saved: true, formatType: 'knockout', seedingEnabled: true, numSeeds: opts.seeds || 16, bestOfLegs: 5 });
  t.entriesList = list.map((nm, i) => ({ id: 'e' + i, name: nm, org: '', players: [], withdrawn: false }));
  f('ensureSeedOrder')(t);
  app.__o = t.seedOrder.map((id) => ({ entryId: id, org: '' }));
  t.knockout = run(app, 'generateBracket(__o, "Bracket")');
  if (opts.play) { const r = seededRng(5); playOut(app, t.knockout, () => (r() < 0.65 ? 'a' : 'b')); }
  return t;
}
const sheetsOf = (html) => (html.match(/<div class="print-sheet /g) || []).length;
const capture = (fn) => {
  const mount = { innerHTML: '' };
  app.document = { getElementById: (id) => (id === 'printSheets' ? mount : null), createElement: DOC.createElement, body: DOC.body };
  try { fn(); } finally { app.document = DOC; }
  return mount.innerHTML;
};
// What a check of one layout must say for a legible sheet.
function assertClean(v, label, legible) {
  assert.equal(v.overlaps, 0, label + ': overlapping items ' + v.overlapList.join(','));
  assert.equal(v.touching, 0, label + ': boxes under the gap floors');
  assert.equal(v.overflow, 0, label + ': items off the sheet');
  assert.equal(v.clipped, 0, label + ': clipped names');
  assert.equal(v.heights, 1, label + ': one box height (one uniform scale)');
  assert.equal(v.textUnderFloor, 0, label + ': text under the 4.6 pt floor: ' + v.textList.join(', '));
  if (legible !== false) {
    assert.ok(v.scale >= 0.999, label + ': legible scale ' + v.scale);
    assert.ok(v.minNamePt >= 7 - 1e-9, label + ': names ' + v.minNamePt + ' pt');
    assert.ok(v.minGapSameMatch >= 1.6 - 0.01 || v.minGapSameMatch === Infinity, label + ': gap in a match ' + v.minGapSameMatch);
    assert.ok(v.minGapBetween >= 3.0 - 0.01, label + ': gap between matches ' + v.minGapBetween);
    assert.ok(v.minBoxH >= 4.8 - 0.01, label + ': box height ' + v.minBoxH);
  }
}

/* ---------- the layout engine ---------- */
test('the font: Barlow Semi Condensed is embedded (woff2, weights 500 and 700, about 60 KB) and used only on the bracket sheets', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'app.html'), 'utf8');
  const faces = [...html.matchAll(/@font-face\{font-family:'Barlow Semi Condensed';font-style:normal;font-weight:(\d+);font-display:block;src:url\(data:font\/woff2;base64,([A-Za-z0-9+/=]+)\) format\('woff2'\)\}/g)];
  assert.deepEqual(faces.map((m) => m[1]), ['500', '700']);
  const bytes = faces.reduce((n, m) => n + m[2].length, 0);
  assert.ok(bytes <= 64000, 'base64 size ' + bytes);
  faces.forEach((m) => assert.equal(Buffer.from(m[2], 'base64').slice(0, 4).toString(), 'wOF2'));
  // every CSS rule that names the face is a bracket-sheet rule
  const rules = html.split('}').filter((r) => /font-family:'Barlow Semi Condensed'/.test(r) && !/@font-face/.test(r));
  assert.ok(rules.length > 3);
  rules.forEach((r) => assert.match(r.trim(), /^\.kb-/, r.trim().slice(0, 40)));
  // the vm measures with the same face as the browser: a 24-character name at 7 pt bold is about 26.7 mm (canvas: 26.6)
  const w = K.textMM('Christopher Vandenberghe', 7, 700);
  assert.ok(w > 26.3 && w < 27.1, String(w));
  assert.ok(K.textMM('Singles 01', 7, 500) < K.textMM('Singles 01', 7, 700));
});

test('67 entries in 128 slots, completed: two-sided, one sheet, byes collapsed, nothing touches, legible on A3, and A3 is recommended', () => {
  reset();
  const t = koEvent(S67, { play: true });
  const m = K.fromBracket(t.knockout, t);
  const rec = K.recommend([m]);
  assert.equal(rec.rec, 'A3');
  assert.ok(!rec.plans.A4[0].fits && rec.plans.A3[0].fits);
  const lay = K.layout(m, 'A3', { chrome: { title: 'Open Singles', label: 'MAIN BRACKET' } });
  const v = K.verify(lay);
  assertClean(v, '67 on A3');
  assert.ok(v.twoSided, 'boxes on both halves');
  const boxes = lay.items.filter((i) => i.k === 'box');
  // byes collapsed: only the 3 real first-round matches use the first column, the 61 bye entries start in round 2
  assert.equal(boxes.filter((b) => b.r === 0).length, 6);
  assert.equal(lay.items.filter((i) => i.k === 'bye').length, 61);
  // the Final in the centre, stacked, and the gold Champion box under it
  const fin = boxes.filter((b) => b.fin);
  assert.equal(fin.length, 2); assert.equal(fin[0].x, fin[1].x); assert.ok(fin[1].y > fin[0].y);
  const champ = lay.items.find((i) => i.k === 'champ');
  assert.ok(champ.y > fin[1].y && Math.abs(champ.x - fin[0].x) < 1e-9);
  assert.ok(champ.txt, 'the champion is named');
  // seeds print outside the boxes (in the gutter or beside the BYE tag)
  const seeds = lay.items.filter((i) => i.k === 'seed');
  assert.equal(seeds.length, 16);
  seeds.forEach((sd) => boxes.forEach((b) => assert.ok(sd.x + sd.w <= b.x + 0.01 || sd.x >= b.x + b.w - 0.01 || sd.y + sd.h <= b.y + 0.01 || sd.y >= b.y + b.h - 0.01)));
  // one sheet
  const html = f('knockoutBracketSheetHTML')(t.knockout);
  assert.equal(sheetsOf(html), 1);
  assert.match(html, /data-kb="two-sided"/);
  assert.match(html, /class="kb-ink kb-champ/);
});

test('the same chart kept on A4 is the identical chart shrunk to one sheet: same shape, proportional gaps, nothing overlaps', () => {
  reset();
  const t = koEvent(S67, { play: true });
  const m = K.fromBracket(t.knockout, t);
  const a3 = K.layout(m, 'A3'), a4 = K.layout(m, 'A4');
  const v = K.verify(a4);
  assertClean(v, '67 kept on A4', false);
  assert.ok(a4.s < 1 && a4.s > 0.6);
  assert.ok(v.minGapSameMatch >= 1.6 * a4.s - 0.01);
  assert.equal(a4.mode, a3.mode);
  assert.equal(a4.items.filter((i) => i.k === 'box').length, a3.items.filter((i) => i.k === 'box').length);
  // the box aspect ratio is kept (uniform scale)
  const b3 = a3.items.find((i) => i.k === 'box' && !i.fin), b4 = a4.items.find((i) => i.k === 'box' && !i.fin);
  assert.ok(Math.abs(b3.w / b3.h - b4.w / b4.h) < 1e-6);
});

test('16 and 32 slots on A4, the projected 34 and a full 4: legible, two-sided, and the results cell grows only on spare space', () => {
  reset();
  const d = koEvent(names('Pair', 12, { 2: "M. O'Brien / S. Lee", 7: 'Kowalski / Van der Berg', 10: 'Ann Ruiz / Bea Okafor' }), { unit: 'Doubles', seeds: 4 });
  const md = K.fromBracket(d.knockout, d);
  const ld = K.layout(md, 'A4'); assertClean(K.verify(ld), 'Doubles 12 in 16'); assert.ok(ld.s > 1);
  const tm = koEvent(names('Team', 29, { 1: 'The Treble Twenty Club', 6: 'Wolverhampton Arrows', 14: 'Bullseye Bandits of Leeds North', 22: 'Kings Head Darts Team' }), { unit: 'Teams', seeds: 8, play: true });
  const mt = K.fromBracket(tm.knockout, tm);
  const lt = K.layout(mt, 'A4');
  assertClean(K.verify(lt), 'Teams 29 in 32');
  assert.equal(lt.notes.length, 1, 'the name over 24 characters is cut, with a footnote');
  assert.equal(lt.notes[0].full, 'Bullseye Bandits of Leeds North');
  assert.match(K.sheetHTML(lt), /Full names:<\/b> <sup>1<\/sup> Bullseye Bandits of Leeds North/);
  // the results cell: the minimum 4.2 mm on a chart that is limited by the paper width (a big draw), wider where there is room
  const big = koEvent(names('Christopher Vandenberghe', 64).map((x, i) => x.slice(0, 21) + pad(i)), { play: false });
  const pb = K.plan(K.fromBracket(big.knockout, big), 'A2');
  assert.ok(pb.sw <= pb.sh, 'width-limited'); assert.equal(+pb.legs.toFixed(3), 4.2);
  [['A3', d], ['A4', tm]].forEach(([p, ev]) => { const x = K.plan(K.fromBracket(ev.knockout, ev), p); assert.ok(x.legs >= 4.2 - 1e-9); if (x.sw <= x.sh) assert.equal(+x.legs.toFixed(3), 4.2); });
  const four = koEvent(names('Singles', 4));
  const p4 = K.plan(K.fromBracket(four.knockout, four), 'A4');
  assert.ok(p4.legs > 4.2, 'legs cell ' + p4.legs);
  assertClean(K.verify(K.layout(K.fromBracket(four.knockout, four), 'A4')), '4 entries');
  // the projected bracket of 17 groups x 2 (34 qualifiers in 64 slots) fits A4 without a results cell
  const rr = rrEvent(67, 4, 2);
  const pm = f('koPrintModels')(rr)[0];
  assert.equal(pm.label, 'Main bracket (projected)');
  assert.ok(pm.model.noLegs);
  const lp = K.layout(pm.model, 'A4');
  assertClean(K.verify(lp), 'projected 34');
  assert.equal(lp.items.filter((i) => i.k === 'bye').length, 30);
});

test('the recommendation table: full draws with 24-character names need A4, A4, A4, A2 and A1; short names A3 for 64', () => {
  const draw = (size, nameFn) => {
    const order = f('seedSlotOrder')(size), R = Math.log2(size), side = (nm) => ({ name: nm, seed: '', legs: '', mark: '', ph: '' });
    const rounds = [Array.from({ length: size / 2 }, (_, i) => ({ a: side(nameFn(order[2 * i])), b: side(nameFn(order[2 * i + 1])), bye: false, decided: false, win: null, tag: '1-' + (i + 1) }))];
    for (let r = 1; r < R; r++) rounds.push(Array.from({ length: size / Math.pow(2, r + 1) }, (_, i) => ({ a: side(''), b: side(''), bye: false, decided: false, win: null, tag: (r + 1) + '-' + (i + 1) })));
    return { R, kind: 'main', noLegs: false, rounds, roundNames: rounds.map((x, i) => 'R' + i), champion: '' };
  };
  const recs = (fn) => [8, 16, 32, 64, 128].map((n) => K.recommend([draw(n, fn)]).rec);
  assert.deepEqual(recs(() => 'Christopher Vandenberghe'), ['A4', 'A4', 'A4', 'A2', 'A1']);
  assert.deepEqual(recs((i) => 'Singles ' + pad(i)), ['A4', 'A4', 'A4', 'A3', 'A1']);
  // a recommended size is always legible, every smaller size is not
  [8, 16, 32, 64, 128].forEach((n) => {
    const r = K.recommend([draw(n, () => 'Christopher Vandenberghe')]);
    const i = K.ORDER.indexOf(r.rec);
    assert.ok(r.plans[r.rec][0].fits);
    K.ORDER.slice(0, i).forEach((p) => assert.ok(!r.plans[p][0].fits, n + ' ' + p));
    assertClean(K.verify(K.layout(draw(n, () => 'Christopher Vandenberghe'), r.rec)), n + ' on ' + r.rec);
  });
});

/* ---------- the paper dialog ---------- */
function rrEvent(n, maxPer, q, opts) {
  opts = opts || {};
  const t = f('blankTournament')(); useState(app, t);
  t.id = 't_rr_' + n;
  Object.assign(t.eventCreation, { saved: true, entries: n, boards: opts.boards || 4, competitionUnit: opts.unit || 'Singles', tournamentName: 'Riverside', eventName: 'Open' });
  Object.assign(t.format, { saved: true, formatType: 'rrknockout', maxPerGroup: maxPer, qualifiersPerGroup: q, advanceMode: 'seeded', losersPool: !!opts.plate, bestOfLegs: 5 });
  t.entriesList = Array.from({ length: n }, (_, i) => ({ id: 'r' + pad(i) + 'x', name: 'Entry ' + (i + 1), org: '', withdrawn: false }));
  f('buildGroups')(t);
  t.groups.forEach((g) => { g.confirmed = true; });
  return t;
}
const pick = (modal, id) => {
  app.document = { getElementById: (x) => ({ checked: x === 'koPaperOpt_' + id }), createElement: DOC.createElement, body: DOC.body };
  try { return modal.onConfirm(); } finally { app.document = DOC; }
};
test('printing a chart that is not legible on the chosen paper asks first, with the three options, and the warning', () => {
  reset();
  const t = koEvent(S67, { play: true });
  let printed = 0;
  const html = capture(() => f('koPaperGate')(f('koPrintModels')(t), () => { printed++; }));
  assert.equal(html, ''); assert.equal(printed, 0, 'nothing prints until the organiser answers');
  assert.equal(modals.length, 1);
  const m = modals[0];
  assert.equal(m.title, 'This bracket needs A3 paper');
  assert.match(m.bodyHTML, /id="koPaperOpt_use" value="use" checked><span><strong>Use A3 \(recommended\)<\/strong>/);
  const sp = m.bodyHTML.match(/<strong>Split over (\d+) A4 sheets<\/strong>/);
  assert.ok(sp, 'split is offered'); assert.ok(+sp[1] >= 3);
  assert.match(m.bodyHTML, /<strong>Keep A4<\/strong><small>Shrinks the whole chart to fit one A4 sheet, keeping its shape \(names \d\.\d pt\)/);
  assert.match(m.bodyHTML, /The names may be too small to read when printed\. Recommended: A3\./);
  assert.match(m.bodyHTML, /class="kb-thumb rec"/);
  // "Use A3": the paper setting changes and the print goes on, legible
  pick(m, 'use');
  assert.equal(t.printSettings.koPaperSize, 'A3'); assert.equal(printed, 1); assert.ok(saves >= 1);
  assert.ok(!('koPaperChoice' in t.printSettings));
  f('koPaperGate')(f('koPrintModels')(t), () => { printed++; });
  assert.equal(printed, 2); assert.equal(modals.length, 1, 'legible now: no question');
});

test('"Keep A4" is remembered for the event and asked again only when it no longer fits; the stage note warns, the sheet does not', () => {
  reset();
  const t = koEvent(S67, { play: true });
  let printed = 0; const go = () => { printed++; };
  f('koPaperGate')(f('koPrintModels')(t), go);
  pick(modals.pop(), 'shrink');
  assert.deepEqual(plain(t.printSettings.koPaperChoice), { mode: 'shrink', paper: 'A4', rec: 'A3' });
  assert.equal(printed, 1);
  // remembered: the next print goes straight on
  f('koPaperGate')(f('koPrintModels')(t), go);
  assert.equal(printed, 2); assert.equal(modals.length, 0);
  // the print-stage note (screen only)
  const note = f('koPaperPanelHTML')();
  assert.match(note, /<b>Main bracket shrunk to fit A4 \(names \d\.\d pt\)\.<\/b> The names may be too small to read when printed\. Recommended: A3 \(the button changes this event&rsquo;s saved paper size\)\./);
  assert.match(note, /onclick="setKoPaperSize\('A3'\)">Switch this event to A3<\/button>/);
  assert.match(note, /Fit check: A4 \d\.\d pt · A3 \d\.\d pt · A2 \d+\.\d pt · A1 \d+\.\d pt \(minimum 7 pt\)/);
  const sheet = f('knockoutBracketSheetHTML')(t.knockout);
  assert.equal(sheetsOf(sheet), 1); assert.doesNotMatch(sheet, /too small to read/);
  assert.ok(+/data-scale="([\d.]+)"/.exec(sheet)[1] < 1, 'shrunk to fit');
  // another paper size clears the answer (owner ruling): back on A4 it is asked again
  f('setKoPaperSize')('A2');
  assert.ok(!('koPaperChoice' in t.printSettings));
  f('koPaperGate')(f('koPrintModels')(t), go);
  assert.equal(modals.length, 0, 'A2 is legible');
  f('setKoPaperSize')('A4');
  f('koPaperGate')(f('koPrintModels')(t), go);
  assert.equal(modals.length, 1, 'back on A4: asked again, the old answer is not applied silently');
  pick(modals.pop(), 'shrink');
  f('setKoPaperSize')('A4');   // the same size again keeps the answer
  assert.equal(t.printSettings.koPaperChoice.mode, 'shrink');
  // the draw changes so a bigger size is needed: asked again
  const big = koEvent(names('Christopher Vandenberghe', 0).concat(Array.from({ length: 100 }, (_, i) => 'Christopher Vandenbergh' + (i % 10))), {});
  big.printSettings.koPaperChoice = { mode: 'shrink', paper: 'A4', rec: 'A3' };
  f('koPaperGate')(f('koPrintModels')(big), go);
  assert.equal(modals.length, 1, 'recommended size changed: asked again');
  assert.match(modals[0].title, /needs A2 paper/);
});

test('"Split over N A4 sheets": wing sections at the legible scale with alignment marks and labels, then a Finals sheet', () => {
  reset();
  const t = koEvent(S67, { play: true });
  f('koPaperGate')(f('koPrintModels')(t), () => {});
  const n = +/Split over (\d+) A4 sheets/.exec(modals[0].bodyHTML)[1];
  pick(modals.pop(), 'split');
  assert.equal(t.printSettings.koPaperChoice.mode, 'split');
  const html = f('knockoutBracketSheetHTML')(t.knockout);
  assert.equal(sheetsOf(html), n);
  const secs = [...html.matchAll(/data-kb="(wing|two-sided)" data-paper="A4" data-scale="([\d.]+)"[^>]*data-section="([^"]+)"/g)];
  assert.equal(secs.length, n);
  assert.equal(secs.filter((s) => s[3] === 'finals').length, 1);
  assert.equal(secs[secs.length - 1][3], 'finals');
  secs.forEach((s) => assert.ok(+s[2] >= 1, s[3] + ' at scale ' + s[2]));
  assert.ok(secs.some((s) => /^L\d/.test(s[3])) && secs.some((s) => /^R\d/.test(s[3])));
  assert.equal((html.match(/class="kb-mark"/g) || []).length, n, 'every sheet, the Finals sheet too, carries + marks');
  assert.match(html, /Section L1 \(left half, 1 of \d\)/);
  assert.doesNotMatch(html, /Line the sheets up|cross marks/, 'no instruction that can not be followed');
  assert.match(html, /Sheets 1 to \d are the sections \(L1 to L\d on the left half, R1 to R\d on the right half; numbered top to bottom\), sheet \d is the Finals sheet\. Every sheet prints at the same scale\./);
  // one scale for every sheet
  assert.equal(new Set(secs.map((s) => s[2])).size, 1, 'sections and Finals at one scale: ' + secs.map((s) => s[2]).join(','));
  // every exit names its Finals match, and that Finals box names the section and the feeding match
  const full0 = K.fromBracket(t.knockout, t), sp = K.splitPlan(full0);
  sp.sheets.forEach((sh) => {
    const lay = K.wingLayout(full0, sp, sh);
    const exits = lay.items.filter((i) => i.k === 'exit');
    assert.equal(exits.length, sh.roots.length, sh.id + ': one exit per subtree');
    sh.roots.forEach((rt, i) => {
      const dest = full0.rounds[rt.r + 1][rt.m >> 1].tag, feed = full0.rounds[rt.r][rt.m].tag;
      assert.match(exits[i].txt, new RegExp('to Finals ' + dest.replace(/[-]/g, '\\-')), sh.id + ' exit ' + i);
      const fm = sp.sub.rounds[0][rt.m >> 1][rt.m % 2 ? 'b' : 'a'];
      assert.equal(fm.seed, sh.id + ' · ' + feed, 'the Finals box fed by ' + feed);
      assert.match(html, new RegExp('>' + sh.id + ' · ' + feed + '<'));
    });
    assertClean(K.verify(lay), 'section ' + sh.id);
  });
  assertClean(K.verify(K.layout(sp.sub, 'A4', { mode: 1, scale: sp.s, entryMarks: true })), 'finals sheet');
  // every entry is on exactly one section sheet (the Finals sheet starts where the sections stop)
  const full = K.fromBracket(t.knockout, t), shown = new Set();
  sp.sheets.forEach((sh) => K.layoutSide(full, sh.sd, 4.8, 1, 0, sh.roots).boxes.filter((b) => b.leaf).forEach((b) => shown.add(b.r + ':' + b.m + ':' + b.slot)));
  assert.equal(shown.size, 67);
});

test('the dialog is used for the projected bracket in the pack and for the Plate pool, and names the bracket that needs it', () => {
  reset();
  const rr = rrEvent(128, 4, 2, { plate: true });   // 32 groups: 64 projected qualifiers, 64 in the Plate pool: neither is legible on A4
  const models = f('koPrintModels')(rr);
  assert.deepEqual(plain(models.map((x) => x.label)), ['Main bracket (projected)', 'Plate pool (projected)']);
  const html = capture(() => f('runPrintPack')(rr.groups));
  assert.equal(html, '');
  assert.equal(modals.length, 1);
  assert.match(modals[0].bodyHTML, /the Main bracket \(projected\) only fits/);
  // a real knockout with a Plate pool: both are checked
  const t = koEvent(S67, { play: true });
  t.knockoutLosers = run(app, 'generateBracket(__o.slice(0, 8), "Plate pool")');
  assert.deepEqual(plain(f('koPrintModels')(t).map((x) => x.label)), ['Main bracket', 'Plate pool']);
  // Group Boards is never checked
  const gb = makeTournament(app, 40, { pods: 4, boards: 4 }); useState(app, gb);
  f('generatePods')(gb, seededRng(3)); f('podsConfirmAll')(gb);
  assert.deepEqual(plain(f('koPrintModels')(gb)), []);
});

test('soft 8 pt suggestion: names between 7 and 8 pt get a non-blocking note with a button to the bigger size', () => {
  reset();
  const rr = rrEvent(67, 4, 2);
  const adv = f('koPaperAdvice')(f('koPrintModels')(rr));
  assert.ok(adv.legible);
  const t = koEvent(names('Singles', 34), {});
  const a = f('koPaperAdvice')(f('koPrintModels')(t));
  assert.ok(a.legible && a.minPt >= 7 && a.minPt < 8, String(a.minPt));
  assert.equal(a.soft, 'A3');
  const note = f('koPaperPanelHTML')();
  assert.match(note, /Names print at 7\.\d pt; 8 pt or more is easier to read\. A3 would give that \(the button changes this event&rsquo;s saved paper size\)\./);
  assert.match(note, /setKoPaperSize\('A3'\)/);
  let printed = 0; f('koPaperGate')(f('koPrintModels')(t), () => { printed++; });
  assert.equal(printed, 1, 'never blocks'); assert.equal(modals.length, 0);
});

test('the paper answer and the printed lineups are saved and cleaned by tournament-sanitize', () => {
  const d = sanitizeTournamentData({ printSettings: { koPaperSize: 'B5', koPaperChoice: { mode: 'split', paper: 'A4', rec: 'A3', extra: '<x>' } }, lineupPrinted: { 'knockout:0-3': 'e1|e2', 'pod:pod_ab12:1-0': 'a|b', 'bad key': 'x', 'knockout:1-1': { a: 1 }, 'knockoutLosers:2-1': 'e<script>|e2' } });
  assert.equal(d.printSettings.koPaperSize, 'A4');
  assert.deepEqual(d.printSettings.koPaperChoice, { mode: 'split', paper: 'A4', rec: 'A3' });
  assert.deepEqual(d.lineupPrinted, { 'knockout:0-3': 'e1|e2', 'pod:pod_ab12:1-0': 'a|b', 'knockoutLosers:2-1': 'e_script_|e2' });
  assert.ok(!('koPaperChoice' in sanitizeTournamentData({ printSettings: { koPaperChoice: { mode: 'grow', paper: 'A4', rec: 'A3' } } }).printSettings));
  assert.deepEqual(sanitizeTournamentData({ lineupPrinted: 'x' }).lineupPrinted, {});
  assert.deepEqual(sanitizeTournamentData({ printSettings: { koPaperSize: 'A2' } }).printSettings, { koPaperSize: 'A2' });
});

/* ---------- the running order and the Group Boards Finals ---------- */
test('running order: one column per board, groups in playing order, every match once with a tick box, 17 and 24 groups on one A4 sheet', () => {
  reset();
  const t = rrEvent(67, 4, 2);
  assert.equal(t.groups.length, 17);
  const ro = f('runningOrderSheetHTML')(t.groups);
  assert.equal(sheetsOf(ro), 1);
  assert.equal((ro.match(/class="ro-col"/g) || []).length, 4);
  assert.equal((ro.match(/<div class="ro-m"><i>\d+\.<\/i>\d+ v \d+<span class="ro-tick"><\/span><\/div>/g) || []).length, t.groups.reduce((n, g) => n + f('groupMatches')(g).length, 0));
  const col1 = ro.split('class="ro-col"')[1];
  const order = [...col1.matchAll(/<b>Group ([A-Z])<\/b>/g)].map((m) => m[1]);
  assert.deepEqual(plain(order), plain(t.groups.filter((g) => g.boards[0] === 1).map((g) => g.label)), 'board 1 in playing order');
  const t24 = rrEvent(96, 4, 2);
  assert.equal(t24.groups.length, 24);
  assert.equal(sheetsOf(f('runningOrderSheetHTML')(t24.groups)), 1, '24 groups on 4 boards fit one sheet');
  // more: the boards continue on a second sheet and no group is split
  const t40 = rrEvent(160, 4, 2);
  const ro40 = f('runningOrderSheetHTML')(t40.groups);
  assert.equal(sheetsOf(ro40), 2);
  assert.match(ro40, /<b>Board 1, continued<\/b>/);
  assert.equal((ro40.match(/<b>Group [A-Z0-9]+<\/b>/g) || []).length, 40, 'each group once');
  // a group on two boards is listed under each, with only that board's matches
  const g = t.groups[0]; g.boards = [1, 2];
  const ro2 = f('runningOrderSheetHTML')([g]);
  assert.equal((ro2.match(/class="ro-col"/g) || []).length, 2);
  assert.equal((ro2.match(/class="ro-m"/g) || []).length, 6);
});

test('Group Boards Finals before play: "Winner of" over "Group N" in full, never "Winner of Gr…"; short boxes get "Gp N winner"', () => {
  reset();
  const gb = makeTournament(app, 67, { pods: 8, boards: 8 }); useState(app, gb);
  f('generatePods')(gb, seededRng(3)); f('podsConfirmAll')(gb);
  const sheet = f('knockoutBracketSheetHTML')(f('podsFinals')(gb), { qrPath: 'bracket/finals' });
  const ph = [...sheet.matchAll(/<span class="gb-ph"[^>]*><small[^>]*>Winner of<\/small><b[^>]*>Group (\d+)<\/b><\/span>/g)].map((m) => +m[1]).sort((a, b) => a - b);
  assert.deepEqual(ph, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.doesNotMatch(sheet, /text-overflow:ellipsis;font-weight:\d+;">Winner of Group/);
  assert.match(sheet, /mko-artboard/, 'Group Boards keeps its own chart layout');
  // a box too short for two lines: one line, in full
  const one = f('gbPlaceholderHTML')('<span style="flex:1;min-width:0;font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:400;">Winner of Group 12</span>', 20);
  assert.match(one, />Gp 12 winner<\/span>/);
});

/* ---------- Teams ---------- */
function teamsKo(n) {
  const t = koEvent(Array.from({ length: n }, (_, i) => 'Team ' + String.fromCharCode(65 + i)), { unit: 'Teams', seeds: 4 });
  return t;
}
test('Teams round robin: no markers are assigned or printed; Singles and Doubles keep them', () => {
  reset();
  const t = rrEvent(8, 4, 2, { unit: 'Teams' });
  const sheet = f('chartSheetHTML')(t.groups[0], true);
  assert.doesNotMatch(sheet, /Marker/);
  assert.match(sheet, /<strong>Match 1<\/strong><strong>:<\/strong><\/span><span>1 v 2<\/span>/);
  const s = rrEvent(8, 4, 2, { unit: 'Singles' });
  assert.match(f('chartSheetHTML')(s.groups[0], true), /<strong>Marker:<\/strong><\/span><span>\d/);
});

test('Teams knockout: a lineup sheet is ready once both teams are known, printed state is kept per match, print-all prints the rest', () => {
  reset();
  const t = teamsKo(8);
  let ready = f('lineupReadyMatches')(t);
  assert.deepEqual(plain(ready.map((x) => x.key)), ['knockout:0-0', 'knockout:0-1', 'knockout:0-2', 'knockout:0-3']);
  assert.ok(ready.every((x) => !x.printed));
  // the Manage Tournament card and the full-page window offer them
  const card = f('lineupReadyCardHTML')();
  assert.match(card, /onclick="printReadyLineups\(\)">Print all ready lineup sheets \(4\)<\/button>/);
  assert.equal((card.match(/onclick="printLineupFor\('knockout:0-\d'\)">Print lineup<\/button>/g) || []).length, 4);
  assert.match(card, /onclick="printEmptyLineups\(\)">Print empty lineup sheet<\/button>/);
  assert.match(f('stage5')(), /id="stage5-lineups"/);
  run(app, 'popoutMode = true; popoutSection = "knockout"');
  assert.match(f('popoutToolsHTML')(), /onclick="openLineupSheetsModal\(\)">Lineup sheets<\/button>/);
  run(app, 'popoutMode = false');
  // one match
  const one = capture(() => f('printLineupFor')('knockout:0-1'));
  assert.equal((one.match(/class="print-sheet lineup-sheet"/g) || []).length, 1);
  const m01 = t.knockout.rounds[0][1];
  assert.equal(t.lineupPrinted['knockout:0-1'], m01.aEntryId + '|' + m01.bEntryId);
  assert.ok(saves >= 1);
  // print all: the three not printed yet
  const all = capture(() => f('printReadyLineups')());
  assert.equal((all.match(/class="print-sheet lineup-sheet"/g) || []).length, 3);
  assert.ok(f('lineupReadyMatches')(t).every((x) => x.printed));
  // nothing left: a message, no print
  assert.equal(capture(() => f('printReadyLineups')()), '');
  assert.equal(modals[modals.length - 1].title, 'No lineup sheets waiting');
  // a reprint is allowed
  assert.match(capture(() => f('printLineupFor')('knockout:0-1')), /lineup-sheet/);
  // after both feeders are decided, the round-2 match is ready (with the knockout tie-breaker)
  const R = t.knockout.rounds;
  [0, 1].forEach((mi) => { const m = R[0][mi]; m.aLegs = 3; m.bLegs = 1; m.winnerId = m.aEntryId; });
  f('propagateByes')(R);
  ready = f('lineupReadyMatches')(t);
  assert.deepEqual(plain(ready.filter((x) => !x.printed).map((x) => x.key)), ['knockout:1-0']);
  assert.ok(!ready.some((x) => x.key === 'knockout:0-0'), 'a played match is no longer waiting');
  const r2 = capture(() => f('printReadyLineups')());
  assert.match(r2, /TIE-BREAKER/);
  assert.match(r2, /<div class="bar">Board<\/div><div class="box">Semifinal<\/div>/);
  // a result changed so another team goes through: that sheet counts as not printed again
  const m = R[0][0]; m.winnerId = m.bEntryId; m.aLegs = 1; m.bLegs = 3; f('propagateByes')(R);
  assert.ok(!f('lineupReadyMatches')(t).find((x) => x.key === 'knockout:1-0').printed);
  // not for Singles
  const s = koEvent(names('Singles', 8), {});
  assert.deepEqual(plain(f('lineupReadyMatches')(s)), []); assert.equal(f('lineupReadyCardHTML')(), '');
});

test('the empty emergency lineup sheet: every box blank, the segments and tie-breaker per setup, 1 to 10 copies, with no fixtures', () => {
  reset();
  const t = f('blankTournament')(); useState(app, t);
  Object.assign(t.eventCreation, { saved: true, competitionUnit: 'Teams', tournamentName: 'County League', eventName: 'Cup Night', entries: 8 });
  Object.assign(t.format, { saved: true, formatType: 'knockout' });
  const sheet = f('emptyLineupSheetHTML')();
  assert.match(sheet, /^<div class="print-sheet lineup-sheet lineup-blank">/);
  assert.equal((sheet.match(/<div class="lineup-event">County League · Cup Night<\/div>/g) || []).length, 2, 'both sides carry the event header');
  ['Group', 'Board', 'Fixture', 'Game No.'].forEach((l) => assert.equal((sheet.match(new RegExp('<div class="bar">' + l.replace('.', '\\.') + '</div><div class="box"></div>', 'g')) || []).length, 2, l + ' blank'));
  assert.equal((sheet.match(/<span class="tag">Team Name<\/span>&nbsp;<\/div>/g) || []).length, 2);
  const segs = f('teamSegmentsOf')(t);
  assert.equal((sheet.match(/class="lineup-seg lineup-seg-/g) || []).length, 2 * (segs.length + (f('teamTieBreakerFor')(t, 'ko') ? 1 : 0)));
  assert.match(sheet, /TIE-BREAKER/); assert.match(sheet, /TOTAL POINTS/); assert.match(sheet, /Captain\/Manager Signature/);
  t.format.teamTieBreaker.inKnockout = false;
  assert.doesNotMatch(f('emptyLineupSheetHTML')(), /TIE-BREAKER/);
  // copies
  assert.equal((capture(() => f('printEmptyLineups')(3)).match(/lineup-blank/g) || []).length, 3);
  assert.equal((capture(() => f('printEmptyLineups')(40)).match(/lineup-blank/g) || []).length, 10);
  f('setEmptyLineupCount')('4');
  assert.equal((capture(() => f('printEmptyLineups')()).match(/lineup-blank/g) || []).length, 4);
  // on the print stages and in Manage Tournament
  run(app, 'currentStage = 4'); assert.match(f('stage4')(), /Print empty lineup sheet/);
  run(app, 'currentStage = 7'); assert.match(f('stage7')(), /Print empty lineup sheet/);
  assert.match(f('lineupReadyCardHTML')(), /Print empty lineup sheet/);
  // printing never saves; on a finalized event the buttons stay usable
  saves = 0; capture(() => f('printEmptyLineups')(1)); assert.equal(saves, 0);
  ['printLineupFor', 'printReadyLineups', 'printEmptyLineups', 'setEmptyLineupCount', 'openLineupSheetsModal'].forEach((n) => assert.ok(f('FINALIZED_ALLOWED_ACTIONS').includes(n), n));
});

/* ---------- round 2 (independent review) ---------- */
test('every printed text keeps the 4.6 pt floor, round names shorten rather than shrink: projected 200 on its recommended paper', () => {
  reset();
  const rr = rrEvent(200, 4, 2, { plate: true });
  const models = f('koPrintModels')(rr);
  assert.equal(models.length, 2);
  const rec = K.recommend(models.map((x) => x.model)).rec;
  models.forEach((x) => {
    const lay = K.layout(x.model, rec, { chrome: { title: 'Open', label: x.label.toUpperCase(), detail: 'draw', legend: 'Labels show group + position.' } });
    const v = K.verify(lay);
    assertClean(v, x.label + ' on ' + rec);
    assert.ok(v.minTextPt >= 4.6, x.label + ': smallest text ' + v.minTextPt);
    lay.items.filter((i) => i.k === 'rl').forEach((i) => assert.ok(i.fs >= 4.6 && /^(Round of \d+|R\d+|Quarterfinal|QF|Semifinal|SF)$/.test(i.txt), i.txt + ' ' + i.fs));
  });
  // the narrow label boxes get the short names
  const lay = K.layout(models[0].model, rec);
  assert.ok(lay.items.some((i) => i.k === 'rl' && /^R\d+$/.test(i.txt)), 'short round names used');
  // on a sheet shrunk on purpose the chart's text shrinks with it, the title block and footer do not
  const kept = K.verify(K.layout(models[0].model, 'A4', { chrome: { title: 'Open', label: 'MAIN', legend: 'x' } }));
  assert.equal(kept.textUnderFloor, 0);
});

test('when no paper size fits (even A1 must shrink) the dialog says so, offers only Split and Shrink, and the answer is remembered', () => {
  reset();
  // 128 names cut at 24 characters of the widest letter, and a match neither side attended (its NO-SHOW mark widens every box)
  const t = koEvent(Array.from({ length: 128 }, (_, i) => 'W'.repeat(28) + pad(i)), { seeds: 4 });
  t.knockout.rounds[0][0].void = true;
  const adv = f('koPaperAdvice')(f('koPrintModels')(t));
  assert.ok(adv.noneFits && adv.rec === 'A1' && !adv.plans.A1[0].fits);
  let printed = 0; const go = () => { printed++; };
  f('koPaperGate')(f('koPrintModels')(t), go);
  assert.equal(modals.length, 1);
  const m = modals.pop();
  assert.equal(m.title, 'No paper size fits this bracket at 7 pt');
  assert.match(m.bodyHTML, /Even A1 needs to shrink the Main bracket: names would print at \d\.\d pt on A1/);
  assert.doesNotMatch(m.bodyHTML, /koPaperOpt_use|recommended/);
  assert.match(m.bodyHTML, /<strong>Shrink to fit A4<\/strong>/);
  if (adv.split) assert.match(m.bodyHTML, /id="koPaperOpt_split" value="split" checked>/);
  pick(m, adv.split ? 'split' : 'shrink');
  assert.equal(printed, 1);
  assert.equal(t.printSettings.koPaperChoice.rec, 'A1');
  f('koPaperGate')(f('koPrintModels')(t), go);
  assert.equal(printed, 2); assert.equal(modals.length, 0, 'not asked again for the same draw');
  // the same on A1 itself: no "Use A1"
  f('setKoPaperSize')('A1');
  f('koPaperGate')(f('koPrintModels')(t), go);
  assert.equal(modals.length, 1); assert.match(modals[0].bodyHTML, /<strong>Shrink to fit A1<\/strong>/); assert.doesNotMatch(modals[0].bodyHTML, /koPaperOpt_use/);
  assert.match(f('koPaperPanelHTML')(), /No paper size holds the Main bracket at 7 pt<\/b>: even A1 needs to shrink it/);
  assert.doesNotMatch(f('koPaperPanelHTML')(), /Switch this event to/);
});

test('the pack and a bracket\'s own window share one answer (no ping-pong between Main and Plate pool)', () => {
  reset();
  const t = koEvent(S67, { play: true });
  t.knockoutLosers = run(app, 'generateBracket(__o.slice(0, 8), "Plate pool")');
  let printed = 0; const go = () => { printed++; };
  f('koPaperGate')(f('koPrintModels')(t), go);       // the pack: Main and Plate pool
  pick(modals.pop(), 'shrink');
  f('koPaperGate')(f('koPrintModels')(t, 'knockout'), go);        // the Main bracket's window
  f('koPaperGate')(f('koPrintModels')(t, 'knockoutLosers'), go);  // the Plate pool's window (legible on A4: never asks)
  f('koPaperGate')(f('koPrintModels')(t), go);
  assert.equal(modals.length, 0); assert.equal(printed, 4);
});

test('the Champion box keeps the footnote number of a cut name; a 2-entry bracket has no BYE tags; the scale cap is 2', () => {
  reset();
  const long1 = 'Christopher Vandenberghe-Smith', long2 = 'Christopher Vandenberghe-Jones';
  const t = koEvent([long1, long2, 'A Short', 'B Short'], { seeds: 4 });
  const R = t.knockout.rounds;
  R[0].forEach((m) => { if (m.aEntryId && m.bEntryId) { const w = [m.aEntryId, m.bEntryId].find((id) => /Vanden/.test(t.entriesList.find((e) => e.id === id).name)) || m.aEntryId; m.winnerId = w; m.aLegs = w === m.aEntryId ? 3 : 1; m.bLegs = w === m.aEntryId ? 1 : 3; } });
  f('propagateByes')(R);
  const fin = R[R.length - 1][0]; fin.winnerId = fin.aEntryId; fin.aLegs = 3; fin.bLegs = 2;
  const m = K.fromBracket(t.knockout, t), lay = K.layout(m, 'A4');
  const champ = lay.items.find((i) => i.k === 'champ'), finA = lay.items.find((i) => i.k === 'box' && i.fin && i.slot === 'a');
  assert.ok(champ.note && champ.note === finA.disp.note, 'the Champion shows the same footnote number as the finalist');
  assert.match(K.sheetHTML(lay), /class="kb-ink kb-champ[^"]*"[^>]*><span class="kb-nm">Christopher Vandenbergh\S*<sup>\d<\/sup>/);
  // two entries: a 4-slot draw with two byes, the finalists alone, no BYE beside them
  const two = koEvent(['Alpha', 'Bravo'], { seeds: 2 });
  const l2 = K.layout(K.fromBracket(two.knockout, two), 'A4');
  assert.equal(l2.items.filter((i) => i.k === 'bye').length, 0);
  // the scale cap: names never grow past 14 pt
  const four = koEvent(names('Singles', 4), { seeds: 4 });
  const html = (four.printSettings.koPaperSize = 'A1', f('knockoutBracketSheetHTML')(four.knockout));
  assert.match(html, /data-paper="A1" data-scale="2\.0000"/);
  assert.match(html, /<span class="kb-nm" title="Singles 01" style="[^"]*font-size:14\.00pt">/);
});

test('names of 23 and 24 characters print in full; 25 are cut with a footnote', () => {
  reset();
  const n23 = 'Abcdefghij Klmnopqrstuv', n24 = 'Abcdefghij Klmnopqrstuvw', n25 = 'Abcdefghij Klmnopqrstuvwx';
  assert.deepEqual([n23.length, n24.length, n25.length], [23, 24, 25]);
  const t = koEvent([n23, n24, n25, 'Short'], { seeds: 4 });
  const lay = K.layout(K.fromBracket(t.knockout, t), 'A4');
  const shown = (nm) => lay.items.find((i) => i.k === 'box' && i.side && i.side.name === nm).disp;
  assert.deepEqual(plain(shown(n23)), { text: n23, note: null });
  assert.deepEqual(plain(shown(n24)), { text: n24, note: null });
  assert.equal(shown(n25).text, n25.slice(0, 23) + '…'); assert.equal(shown(n25).note, 1);
  assert.deepEqual(plain(lay.notes), [{ n: 1, full: n25 }]);
  assertClean(K.verify(lay), '23/24/25 characters');
});

test('the Champion box is gold, the print lines darker, and the font licence is in the repo', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'app.html'), 'utf8');
  assert.match(html, /\.kb-champ\{border:0\.6mm solid var\(--gold\)/);
  assert.match(html, /--gold:#d9ad45/);
  assert.match(html, /\.kb-bx\{border:0\.25mm solid #aab6c3/);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'bracket-print.js'), 'utf8'), /stroke="#8e9db0"/);
  const ofl = fs.readFileSync(path.join(__dirname, '..', 'docs', 'third-party', 'Barlow-OFL.txt'), 'utf8');
  assert.match(ofl, /Copyright 2017 The Barlow Project Authors/); assert.match(ofl, /SIL OPEN FONT LICENSE Version 1\.1/i);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8'), /docs\/third-party\/Barlow-OFL\.txt/);
  assert.match(html, /docs\/third-party\/Barlow-OFL\.txt/);
});

test('the sanitiser keeps at most 2000 printed lineup entries', () => {
  const lp = {}; for (let i = 0; i < 2500; i++) lp['knockout:' + Math.floor(i / 100) + '-' + (i % 100)] = 'a|b';
  assert.equal(Object.keys(sanitizeTournamentData({ lineupPrinted: lp }).lineupPrinted).length, 2000);
});

test('a finalized event: printing lineups and the pack changes nothing, and the paper answer is not saved', () => {
  reset();
  const t = teamsKo(8);
  t.printSettings.lineupSheetEnabled = true;
  t.finalized = { at: '2026-10-22T10:00:00Z' };
  saves = 0;
  assert.match(capture(() => f('printLineupFor')('knockout:0-0')), /lineup-sheet/);
  assert.match(capture(() => f('printReadyLineups')()), /lineup-sheet/);
  assert.ok(!t.lineupPrinted || !Object.keys(t.lineupPrinted).length, 'lineupPrinted unchanged');
  assert.match(capture(() => f('runPrintPack')([])), /kb-sheet/);
  assert.ok(!t.printedPack, 'printedPack unchanged');
  assert.equal(saves, 0, 'nothing saved');
  const big = koEvent(S67, { play: true }); big.finalized = { at: '2026-10-22T10:00:00Z' };
  saves = 0;
  f('koPaperGate')(f('koPrintModels')(big), () => {});
  pick(modals.pop(), 'shrink');
  assert.equal(saves, 0, 'the answer is used for this print only');
  assert.equal(f('koPaperApplyChoice')('use', f('koPaperAdvice')(f('koPrintModels')(big))), true); assert.equal(saves, 0);
});

test('running order: a group bigger than a column prints smaller and fits; no empty column except on a continuation sheet', () => {
  reset();
  const t = rrEvent(80, 10, 2, { boards: 8 });   // 8 groups of 10 on 8 boards
  t.groups.forEach((g, i) => { g.boards = [i + 1]; });
  const ro = f('runningOrderSheetHTML')(t.groups);
  assert.equal(sheetsOf(ro), 1);
  const sizes = [...ro.matchAll(/class="ro-ml" style="[^"]*font-size:([\d.]+)pt/g)].map((m) => +m[1]);
  assert.equal(sizes.length, 8, 'every group of 10 is scaled'); sizes.forEach((p) => assert.ok(p >= 4.6 && p < 8.5, String(p)));
  // 45 rows at that size fit the column: the height used for packing is within the column
  const k = sizes[0] / 8.5; assert.ok(f('RO_GROUP_MM') + 45 * (3.6 * k + 0.5) <= f('RO_COL_CAP_MM') - 3.5 + 0.1);
  assert.doesNotMatch(ro, /No more groups/);
  // 40 groups on 4 boards: the first sheet has no empty column; an empty one appears only on the continuation sheet
  const t40 = rrEvent(160, 4, 2);
  const sheets = f('runningOrderSheetHTML')(t40.groups).split('<div class="print-sheet ro-sheet">').slice(1);
  assert.equal(sheets.length, 2);
  assert.doesNotMatch(sheets[0], /No more groups/);
  sheets[0].split('class="ro-col"').slice(1).forEach((col) => assert.match(col, /<b>Group /));
});

test('Teams round robin: the Lineup sheets card offers the empty sheet and does not talk about a knockout', () => {
  reset();
  const t = rrEvent(8, 4, 2, { unit: 'Teams' });
  t.format.formatType = 'roundrobin';
  const card = f('lineupReadyCardHTML')();
  assert.doesNotMatch(card, /knockout/i);
  assert.match(card, /Round robin lineup sheets are in the print pack/);
  assert.match(card, /Print empty lineup sheet/);
});

test('the print font: printing waits for both weights, checks again, and measures with the face that will print', async () => {
  const vm = require('vm');
  let loaded = false, loads = 0, checks = [];
  const fonts = {
    check: (q) => { checks.push(q); return loaded; },
    load: (q) => { loads++; if (loads >= 8) loaded = true; return Promise.resolve([]); },   // the faces arrive only on the 4th pair of loads (at start-up, ready(), whenReady, whenReady again)
    ready: Promise.resolve(),
  };
  const fontsUsed = [];
  const ctx = { console, Promise, setTimeout, String, Math, Object, Array, Number,
    FontFace: function () {}, document: { fonts, createElement: () => ({ getContext: () => ({ set font(v) { fontsUsed.push(v); }, get font() { return ''; }, measureText: (s) => ({ width: s.length * 50 }) }) }) } };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'bracket-print.js'), 'utf8'), ctx);
  const KB = ctx.KBP;
  assert.equal(KB.ready(), false);
  await new Promise((resolve) => KB.whenReady(resolve));
  assert.ok(loaded, 'the faces were asked for again until both are there');
  assert.equal(KB.ready(), true);
  assert.ok(checks.some((q) => /^500 /.test(q)) && checks.some((q) => /^700 /.test(q)), 'both weights are checked');
  KB.textMM('Name', 7, 700);
  assert.match(fontsUsed[fontsUsed.length - 1], /^700 100px "Barlow Semi Condensed","Arial Narrow",Arial,sans-serif$/, 'the canvas uses the printed names\' own font stack');
});

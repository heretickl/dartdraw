const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { loadApp, run, useState, makeTournament, playOut } = require('./lib/helpers');

const app = loadApp();
const f = (n) => run(app, n);
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');

const LONG = ['Krishnasamy/Seema Raja', 'Wolfeschlegelstein/Hubert Bergdorf', 'Ann/Bo', 'Thorvaldsen/Ingrid Maelstrom'];
// A bracket of `size` slots filled with made-up doubles names (every entry present), as the real chart sees it.
function build(size, nameFor, played) {
  const t = makeTournament(app, size, {});
  t.entriesList.forEach((e, i) => { e.name = nameFor ? nameFor(i) : LONG[i % LONG.length] + ' ' + (i + 1); });
  useState(app, t);
  const slots = t.entriesList.map((e) => ({ entryId: e.id }));
  const rounds = f('bracketFromSlots')(slots, size);
  const bracket = { size, rounds, seeds: null };
  if (played) playOut(app, bracket);
  return { t, bracket };
}
const chart = (size, opts, nameFor, played) => { const { t, bracket } = build(size, nameFor, played); return f('mirroredChartHTML')(bracket, t, opts); };

// The name spans are the only ones that carry the flex:1;min-width:0 pair; read their font sizes.
function nameSpans(html) {
  html = html.split('CHAMPION')[0]; // the champion box is checked on its own
  return [...html.matchAll(/<span(?: title="[^"]*")? style="flex:1;min-width:0;[^"]*font-size:([\d.]+)px[^"]*"[^>]*>/g)].map((m) => ({ tag: m[0], fs: parseFloat(m[1]) }));
}

// md5s of the default (no `readable`) output, captured from the code as it was BEFORE the readable option existed.
const BASELINE = {"4":"16ae3ae58b79eea13f97d16204159316","8":"d9aece8105fd55818b83f3e28f87def4","16":"2711483cbf6e91b6d39725b6668fca7c","32":"d5fff13af98f692120fd293ba5d79588","64":"a8d3cc23376d27c203a41dd6d674642a","128":"bb857f313636dfef01b7c05f8bc2c04e"};

test('without opts.readable the chart output is byte-for-byte what it was before the option existed', () => {
  const got = {};
  [4, 8, 16, 32, 64, 128].forEach((n) => { got[n] = md5(chart(n, { interactive: false }, null, n <= 32)); });
  if (process.env.DUMP_BASELINE) console.log('BASELINE=' + JSON.stringify(got));
  assert.deepEqual(got, BASELINE);
});

test('default output carries none of the readable-mode markup', () => {
  const html = chart(32, { interactive: false });
  assert.doesNotMatch(html, /-webkit-line-clamp/);
  assert.doesNotMatch(html, /&#8203;/);
  assert.doesNotMatch(html, /title=/);
  assert.doesNotMatch(chart(32, { interactive: false, readable: false }), /-webkit-line-clamp|&#8203;|title=/);
});

test('readable 32-slot chart: names are at least 12px, wrap at the slash, clamp to 2 lines, and carry a title', () => {
  const html = chart(32, { interactive: false, readable: true });
  const spans = nameSpans(html);
  assert.ok(spans.length >= 32);
  spans.forEach((s) => assert.ok(s.fs >= 12, 'font-size ' + s.fs));
  assert.match(html, /Krishnasamy\/&#8203;Seema Raja/);
  assert.match(html, /-webkit-line-clamp:2/);
  assert.match(html, /white-space:normal/);
  assert.match(html, /title="Krishnasamy\/Seema Raja 1"/);
  // the title holds the full name, with no zero-width space
  assert.doesNotMatch(html, /title="[^"]*&#8203;/);
});

test('readable mode keeps the escaping: a hostile name makes no markup and only gets a zero-width space after the slash', () => {
  const html = chart(32, { interactive: false, readable: true }, (i) => (i === 0 ? '<img src=x onerror=1>/Zed' : 'Plain/Name ' + i));
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img src=x onerror=1&gt;\/&#8203;Zed/);
  assert.match(html, /title="&lt;img src=x onerror=1&gt;\/Zed"/);
  // a quote in a name cannot break out of the title attribute either
  const q = chart(32, { interactive: false, readable: true }, (i) => (i === 0 ? 'A"B onmouseover=1/C' : 'N' + i));
  assert.doesNotMatch(q, /title="A"/);
  assert.match(q, /title="A&quot;B onmouseover=1\/C"/);
});

test('a very dense bracket never goes below the fitted size and keeps names on one line', () => {
  [64, 128].forEach((n) => {
    const plain = nameSpans(chart(n, { interactive: false }));
    let html;
    assert.doesNotThrow(() => { html = chart(n, { interactive: false, readable: true }); });
    const readable = nameSpans(html);
    assert.equal(readable.length, plain.length);
    readable.forEach((s, i) => assert.ok(s.fs >= plain[i].fs, n + ': ' + s.fs + ' < ' + plain[i].fs));
    // the small round boxes stay single-line; only the taller centre Final boxes (at most 2, plus the champion box) may wrap
    assert.ok((html.match(/-webkit-line-clamp/g) || []).length <= 3);
    assert.ok((html.match(/text-overflow:ellipsis/g) || []).length >= n);
  });
});

test('4- and 8-slot brackets are not shrunk by the readable floor', () => {
  [4, 8].forEach((n) => {
    const plain = nameSpans(chart(n, { interactive: false }, (i) => 'Ann/Bo ' + i));
    const readable = nameSpans(chart(n, { interactive: false, readable: true }, (i) => 'Ann/Bo ' + i));
    readable.forEach((s, i) => assert.ok(s.fs >= plain[i].fs));
  });
});

test('readable mode with a finished bracket (champion shown) renders without error and still has no raw markup from names', () => {
  const html = chart(16, { interactive: false, readable: true }, (i) => '<b>x</b>/Q' + i, true);
  assert.doesNotMatch(html, /<b>/);
});

test('readable names have a line box tall enough for descenders, and the two-line condition uses the same numbers', () => {
  const html = chart(32, { interactive: false, readable: true });
  const two = html.match(/<span title="[^"]*" style="[^"]*-webkit-line-clamp:2[^"]*"/);
  assert.ok(two, 'a two-line name span exists');
  assert.match(two[0], /line-height:1.2;padding-bottom:1px;/);
  assert.doesNotMatch(html, /line-height:1.1/);
  // one-line readable names (dense bracket) get the same line box so ellipsis clipping keeps descenders
  const dense = chart(64, { interactive: false, readable: true });
  assert.match(dense, /white-space:nowrap;line-height:1.2;padding-bottom:1px;overflow:hidden;text-overflow:ellipsis/);
  // the two-line condition: 2 lines at 1.2 + 1px padding + 6px slack (borders) must fit the box
  const twoLines = f('mkoTwoLines');
  const need = (fs) => 2 * fs * 1.2 + 1 + 6;
  [10, 12, 15].forEach((fs) => {
    assert.equal(twoLines(Math.ceil(need(fs)), fs), true);
    assert.equal(twoLines(Math.ceil(need(fs)) - 1, fs), false);
  });
});

test('readable champion box clamps a very long name instead of spilling, with a title; default champion output is unchanged', () => {
  const long = 'Wolfeschlegelstein/Hubert Bergdorf-Mannheimer';
  const mk = (opts) => {
    const { t, bracket } = build(8, (i) => (i === 0 ? long : 'Ann/Bo ' + i), true);
    bracket.rounds.forEach((r) => r.forEach((m) => { if (m.aEntryId === 'e0' || m.bEntryId === 'e0') { m.winnerId = 'e0'; } }));
    return f('mirroredChartHTML')(bracket, t, opts);
  };
  const champ = (html) => html.match(/CHAMPION<\/div>(.*?)<\/div>/)[1];
  const r = champ(mk({ interactive: false, readable: true }));
  assert.match(r, /overflow:hidden;min-width:0;padding:0 6px;/);
  assert.match(r, /-webkit-line-clamp:2/);
  assert.match(r, /line-height:1\.2;padding-bottom:1px;/);
  assert.match(r, /title="Wolfeschlegelstein\/Hubert Bergdorf-Mannheimer"/);
  assert.match(r, /Wolfeschlegelstein\/&#8203;Hubert/);
  const d = champ(mk({ interactive: false }));
  assert.doesNotMatch(d, /-webkit-line-clamp|&#8203;|title=|overflow:hidden/);
  assert.match(d, /justify-content:center;font-size:\d+px;font-weight:800;color:var\(--ink\);">Wolfeschlegelstein\/Hubert Bergdorf-Mannheimer$/);
});

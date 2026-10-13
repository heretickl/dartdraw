const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { loadViewer, runViewer } = require('./lib/load-viewer');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'index.html'), 'utf8');
const THEME = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'theme.css'), 'utf8');

const ctx = loadViewer();
// Runs a viewer function on a plain state object; results are JSON round-tripped so deepEqual is realm-safe.
const call = (fn, s) => JSON.parse(runViewer(ctx, 'JSON.stringify(' + fn + '(' + (s === undefined ? 'undefined' : JSON.stringify(s)) + '))'));
const line = (s) => call('legsLine', s);
const parts = (s) => call('legsParts', s);

// A bracket with `n` rounds (round 1 has 2^(n-1) matches).
const bracket = (n) => ({ rounds: Array.from({ length: n }, (_, i) => Array.from({ length: Math.pow(2, n - 1 - i) }, () => ({}))) });
const variable = (early, quarterfinal, semifinal, final) => ({ variable: true, early, quarterfinal, semifinal, final });
const none = (s) => assert.ok(!/NaN|undefined|null|\[object/.test(s), 'no junk in: ' + s);

test('round robin prints the round robin legs', () => {
  const s = { format: { formatType: 'roundrobin', bestOfLegs: 3 } };
  assert.equal(line(s), 'Best of 3 legs');
  assert.deepEqual(parts(s), [{ label: '', text: 'Best of 3 legs' }]);
});

test('plain knockout with the flat setting', () => {
  const s = { format: { formatType: 'knockout', bestOfLegs: 5, knockoutLegs: { main: { variable: false } } }, knockout: bracket(4) };
  assert.equal(line(s), 'Best of 5 legs');
});

test('knockout where only the final differs', () => {
  const s = { format: { formatType: 'knockout', bestOfLegs: 5, knockoutLegs: { main: variable(5, 5, 5, 7) } }, knockout: bracket(4) };
  assert.equal(line(s), 'Best of 5 legs, final best of 7');
});

test('knockout 16-slot has early rounds, 8-slot does not', () => {
  const k = { main: variable(3, 5, 7, 9) };
  const mk = (n) => ({ format: { formatType: 'knockout', bestOfLegs: 3, knockoutLegs: k }, knockout: bracket(n) });
  assert.equal(line(mk(4)), 'Early rounds best of 3, quarterfinals best of 5, semifinals best of 7, final best of 9');
  const eight = line(mk(3));
  assert.equal(eight, 'Quarterfinals best of 5, semifinals best of 7, final best of 9');
  assert.ok(!/early/i.test(eight));
});

test('knockout merged names are joined with & and written in order', () => {
  const s = { format: { formatType: 'knockout', bestOfLegs: 3, knockoutLegs: { main: variable(3, 5, 5, 7) } }, knockout: bracket(4) };
  assert.equal(line(s), 'Early rounds best of 3, quarterfinals & semifinals best of 5, final best of 7');
});

test('a 4-slot bracket uses only the semifinal and final stages', () => {
  const same = { format: { formatType: 'knockout', bestOfLegs: 3, knockoutLegs: { main: variable(9, 9, 5, 5) } }, knockout: bracket(2) };
  assert.equal(line(same), 'Best of 5 legs');
  const diff = { format: { formatType: 'knockout', bestOfLegs: 3, knockoutLegs: { main: variable(9, 9, 5, 7) } }, knockout: bracket(2) };
  assert.equal(line(diff), 'Best of 5 legs, final best of 7');
});

test('round robin then knockout (3 / 5 / 7) matches the live event', () => {
  const s = { format: { formatType: 'rrknockout', bestOfLegs: 3, knockoutLegs: { main: variable(5, 5, 5, 7) } }, knockout: bracket(5) };
  assert.equal(line(s), 'Round robin: best of 3 legs · Knockout: best of 5 legs, final best of 7');
  assert.deepEqual(parts(s), [
    { label: 'Round robin', text: 'best of 3 legs' },
    { label: 'Knockout', text: 'best of 5 legs, final best of 7' },
  ]);
});

test('round robin then knockout before the bracket exists still shows the knockout', () => {
  const s = { format: { formatType: 'rrknockout', bestOfLegs: 3, knockoutLegs: { main: variable(5, 5, 5, 7) } } };
  assert.equal(line(s), 'Round robin: best of 3 legs · Knockout: best of 5 legs, final best of 7');
  const flat = { format: { formatType: 'rrknockout', bestOfLegs: 3 } };
  assert.equal(line(flat), 'Round robin: best of 3 legs · Knockout: best of 3 legs');
});

test('a Plate pool adds its own part, using its own flat legs', () => {
  const s = {
    format: { formatType: 'rrknockout', bestOfLegs: 3, knockoutLegs: { main: variable(5, 5, 5, 7), plate: { variable: false, flatLegs: 3 } } },
    knockout: bracket(5), knockoutLosers: bracket(3),
  };
  assert.equal(line(s), 'Round robin: best of 3 legs · Knockout: best of 5 legs, final best of 7 · Plate pool: best of 3 legs');
  assert.deepEqual(parts(s)[2], { label: 'Plate pool', text: 'best of 3 legs' });
});

test('Plate pool without flatLegs falls back to bestOfLegs, and can be variable', () => {
  const base = { formatType: 'rrknockout', bestOfLegs: 4 };
  assert.match(line({ format: Object.assign({}, base, { knockoutLegs: { plate: { variable: false } } }), knockoutLosers: bracket(2) }), /Plate pool: best of 4 legs$/);
  const v = { format: Object.assign({}, base, { knockoutLegs: { plate: { variable: true, flatLegs: 3, early: 1, quarterfinal: 1, semifinal: 3, final: 5 } } }), knockoutLosers: bracket(2) };
  assert.match(line(v), /Plate pool: best of 3 legs, final best of 5$/);
});

test('Group Boards: group legs from podLegs, Finals from the main knockout setting', () => {
  const s = { format: { formatType: 'podknockout', bestOfLegs: 5, podLegs: 3, knockoutLegs: { main: variable(5, 5, 5, 7) } }, knockout: bracket(3) };
  assert.equal(line(s), 'Groups: best of 3 legs · Finals: best of 5 legs, final best of 7');
  assert.deepEqual(parts(s).map((p) => p.label), ['Groups', 'Finals']);
});

test('Group Boards with no podLegs falls back to bestOfLegs; no Finals bracket yet still shows Finals', () => {
  const s = { format: { formatType: 'podknockout', bestOfLegs: 5, podLegs: null, knockoutLegs: { main: { variable: false } } } };
  assert.equal(line(s), 'Groups: best of 5 legs · Finals: best of 5 legs');
  const t = { format: { formatType: 'podknockout', bestOfLegs: 5, podLegs: 3, knockoutLegs: { main: variable(3, 3, 5, 7) } } };
  assert.equal(line(t), 'Groups: best of 3 legs · Finals: early rounds & quarterfinals best of 3, semifinals best of 5, final best of 7');
});

test('Group Boards Finals only use a knockout bracket flagged podFinals', () => {
  const f = { formatType: 'podknockout', bestOfLegs: 5, podLegs: 3, knockoutLegs: { main: variable(3, 5, 7, 9) } };
  const none_ = line({ format: f });
  assert.equal(none_, 'Groups: best of 3 legs · Finals: early rounds best of 3, quarterfinals best of 5, semifinals best of 7, final best of 9');
  assert.equal(line({ format: f, knockout: bracket(2) }), none_);
  assert.equal(line({ format: f, knockout: Object.assign(bracket(2), { podFinals: false }) }), none_);
  assert.equal(line({ format: f, knockout: Object.assign(bracket(2), { podFinals: true }) }), 'Groups: best of 3 legs · Finals: best of 7 legs, final best of 9');
});

test('missing or garbage values never print NaN, undefined or null', () => {
  assert.deepEqual(parts({}), []);
  assert.equal(line({}), '');
  assert.equal(line(undefined), '');
  assert.equal(line(null), '');
  assert.equal(line({ format: undefined }), '');
  assert.equal(line({ format: { formatType: 'mystery', bestOfLegs: 3 } }), '');
  const cases = [
    { format: { formatType: 'roundrobin', bestOfLegs: 'x' } },
    { format: { formatType: 'roundrobin' } },
    { format: { formatType: 'knockout', bestOfLegs: 'x', knockoutLegs: undefined } },
    { format: { formatType: 'knockout', bestOfLegs: null, knockoutLegs: { main: variable('a', null, undefined, {}) } }, knockout: {} },
    { format: { formatType: 'rrknockout', bestOfLegs: 'x', knockoutLegs: { main: null, plate: variable('z', 'z', 'z', 'z') } }, knockout: { rounds: 'no' }, knockoutLosers: { rounds: null } },
    { format: { formatType: 'podknockout', bestOfLegs: undefined, podLegs: 'q', knockoutLegs: {} } },
  ];
  for (const c of cases) { const out = line(c); none(out); assert.ok(out.length > 0); }
  assert.equal(line(cases[0]), 'Best of 5 legs');
  assert.equal(line({ format: { formatType: 'roundrobin', bestOfLegs: -2 } }), 'Best of 5 legs');
});

test('header markup: hLegs sits right after hSub, hSub no longer prints legs', () => {
  const h = HTML.match(/<header id="head"[^>]*>([\s\S]*?)<\/header>/)[1];
  assert.match(h, /<div class="sub" id="hSub"><\/div>\s*<div class="sub" id="hLegs"><\/div>/);
  const ids = ['hOver', 'id="hTitle"', 'id="hSub"', 'id="hLegs"', 'id="hStatus"', 'id="hProgress"'];
  let last = -1;
  for (const id of ids) { const i = h.indexOf(id); assert.ok(i > last, id + ' present and in order'); last = i; }
  const line = HTML.split('\n').find((l) => l.includes("el('hSub').textContent"));
  assert.ok(line && !/Best of/.test(line), 'hSub line has no "Best of"');
  assert.match(HTML, /el\('hLegs'\)\.textContent = legsLine\(state\)/);
});

test('theme.css hides an empty legs line', () => {
  assert.match(THEME, /#hLegs:empty\{display:none\}/);
});

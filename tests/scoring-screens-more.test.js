const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parse } = require('./lib/mini-dom');
const S = require('../scoring-model.js');
const D = require('../scoring-screens.js');
const WORDS = require('../scoring_app/i18n/casual.en.js');

// The rest of the shared scoring screens (plan Task 3): dart by dart, cricket, the bulls, Choice, a leg's turns and
// changing one, the summary, settings, and mount() turning taps into match actions.

const HEADER = { title: 'DARTDRAW', line2: 'CASUAL PLAY', line3: 'BEST OF 5 LEGS • 501 • DOUBLE OUT' };
const match = (game, bestOf, names) => S.create({ format: S.formatFor({ game, bestOf }), names: names || { a: 'Ahmad', b: 'Daniel' }, now: () => 1000 });
const opts = (o) => Object.assign({ words: WORDS, header: HEADER, pill: null, mode: 'total', typed: '' }, o || {});
const dom = (m, o) => parse(D.render(m.view(), opts(o)));
const txt = (el) => el.textContent.replace(/\s+/g, ' ').trim();
const all = (doc, sel) => doc.querySelectorAll(sel);
const T = (n, m) => ({ n, m });
const MISS = T(0, 0);
function winLeg(m, side) {
  const leg = m.view().leg; let mine = 0;
  while (m.view().ask === 'turn' && m.view().leg === leg && !m.view().winner) {
    const v = m.view();
    if (v.throwing !== side) { if (v.game === 'cricket') m.darts([MISS, MISS, MISS]); else m.total(0); continue; }
    if (v.game === 'cricket') m.darts([[T(20, 3), T(19, 3), T(18, 3)], [T(17, 3), T(16, 3), T(15, 3)], [T(25, 2), T(25, 1)]][mine]);
    else if (v.sides[side].left > 141) m.total(180);
    else { m.total(141); m.finishDart(3); }
    mine++;
  }
}

test('x01 dart by dart: this turn, three slots, S/D/T, 1-20, 25, BULL, MISS, ENTER', () => {
  const m = match('501', 5); m.bull('a'); m.total(60); m.total(60);
  const d = dom(m, { mode: 'darts', cur: [T(20, 3), T(19, 1)], mult: 1 });
  assert.equal(txt(d.querySelector('.turnp .who')), 'AHMAD TO THROW');
  assert.equal(txt(d.querySelector('.turnp .after')), 'LEFT AFTER: 362');
  assert.deepEqual(all(d, '.slot b').map(txt), ['T20', '19', '–']);
  assert.ok(all(d, '.slot')[2].classList.contains('now'));
  assert.deepEqual(all(d, '[data-act="mult"]').map(txt), ['SINGLE', 'DOUBLE', 'TREBLE']);
  assert.ok(all(d, '[data-act="mult"]')[0].classList.contains('on'));
  const nums = all(d, '.grid [data-act="dart"]').map((e) => e.getAttribute('data-v'));
  assert.equal(nums.length, 22); assert.equal(nums[0], '1'); assert.equal(nums[19], '20'); assert.equal(nums[20], '25'); assert.equal(nums[21], 'bull');
  ['miss', 'del', 'undo', 'enter'].forEach((a) => assert.ok(d.querySelector(`[data-act="${a}"]`), a));
  assert.equal(d.querySelector('[data-act="bust"]'), null, 'no No score key in Easy Mode (owner 2026-11-07)');
  assert.equal(txt(d.querySelector('.shown')), 'T20 • 19 • –');
});

test('x01 dart by dart also shows the last 3 scores and what this turn has scored so far (owner 2026-11-04)', () => {
  const m = match('501', 5); m.bull('a'); [100, 60, 85].forEach((s) => m.total(s));
  const d = dom(m, { mode: 'darts', cur: [T(20, 3), T(19, 1)], mult: 1 });
  assert.equal(txt(d.querySelector('.last3 .ttl')), 'LAST 3 SCORES');
  assert.deepEqual(all(d, '.last3 .row').filter((r) => !r.classList.contains('blank')).map((r) => all(r, 'span').map(txt)), [['85', '2', ''], ['100', '1', '60']]);
  assert.ok(d.querySelector('.dds').classList.contains('compact'));
  assert.equal(txt(d.querySelector('.turnp .who')), 'DANIEL TO THROW');
  assert.equal(txt(d.querySelector('.turnp .scored')), 'SCORED 79');
  assert.equal(txt(d.querySelector('.turnp .after')), 'LEFT AFTER: 362');
  const none = dom(m, { mode: 'darts', cur: [], mult: 1 });
  assert.equal(txt(none.querySelector('.turnp .scored')), 'SCORED 0');
});

test('x01 dart by dart: the checkout hint follows each dart keyed (owner 2026-11-04)', () => {
  const m = match('501', 5); m.bull('a'); m.setHints(true); [180, 0, 180, 0, 41, 0].forEach((s) => m.total(s));
  const hint = (cur) => { const h = dom(m, { mode: 'darts', cur, mult: 1, hintFor: m.hintFor }).querySelector('.turnp .hint'); return h ? txt(h) : null; };
  assert.equal(hint([]), 'T20 • D20');
  assert.equal(hint([T(20, 3)]), 'D20');
  assert.equal(hint([T(20, 3), T(20, 1)]), 'D10');
  assert.equal(hint([T(1, 1), T(1, 1)]), null); // 98 is not one dart
  assert.equal(hint([T(20, 3), T(20, 3)]), null); // bust
  m.setHints(false);
  assert.equal(hint([T(20, 3)]), null);
});

test('x01 dart by dart: a bust keyed reads NO SCORE where LEFT AFTER would go below 2 or miss the double (owner 2026-11-04)', () => {
  const m = match('501', 5); m.bull('a'); [180, 0, 180, 0, 41, 0].forEach((s) => m.total(s)); // Ahmad on 100
  const after = (cur) => txt(dom(m, { mode: 'darts', cur, mult: 1 }).querySelector('.turnp .after'));
  assert.equal(after([T(20, 3), T(20, 3)]), 'NO SCORE'); // -20
  assert.equal(after([T(20, 3), T(13, 3)]), 'NO SCORE'); // 1 left
  assert.equal(after([T(20, 3), T(20, 2)]), 'LEFT AFTER: 0'); // checked out on a double
  assert.equal(after([T(20, 3), T(20, 1), T(20, 1)]), 'NO SCORE'); // 0 but not on a double
  assert.equal(after([T(20, 3)]), 'LEFT AFTER: 40');
});

test('cricket: D left and T right of each number, no T for the bull, marks, closed lines, dead rows, MISS', () => {
  const m = match('cricket', 3); m.bull('a');
  m.darts([T(20, 3), T(19, 2), MISS]); m.darts([T(20, 3), MISS, MISS]);
  const d = dom(m, { cur: [T(18, 1)] });
  const rows = all(d, '.crow');
  assert.deepEqual(rows.map((r) => txt(r.querySelector('.num'))), ['20', '19', '18', '17', '16', '15', 'BULL']);
  const keys = (r) => all(r, '[data-act="dart"]').map((e) => e.getAttribute('data-v'));
  assert.deepEqual(keys(rows[1]), ['19:2', '19:1', '19:3']);
  assert.deepEqual(keys(rows[6]), ['25:2', '25:1']);
  assert.equal(all(rows[6], '.dt.none').length, 1);
  assert.ok(rows[0].classList.contains('dead'));
  assert.equal(all(rows[0], '[data-act="dart"]').length, 0);
  assert.equal(all(rows[1], '.ma .mk.on').length, 2); assert.equal(all(rows[1], '.mb .mk.on').length, 0);
  assert.ok(rows[0].querySelector('.ma').classList.contains('closed'));
  assert.ok(d.querySelector('[data-act="miss"]'));
  assert.equal(d.querySelector('.topill'), null);
  assert.equal(txt(d.querySelector('.shown')), '18 • – • –');
  assert.ok(d.querySelector('[data-act="enter"]'));
});

test('opening bull: one dart each, who was closest, a button per player', () => {
  const m = match('501', 5);
  const d = dom(m);
  assert.equal(txt(d.querySelector('.bullp h3')), 'BULL THROW');
  assert.match(txt(d.querySelector('.bullp')), /One dart each/);
  assert.equal(txt(d.querySelector('.closest')), 'WHO WAS CLOSEST?');
  const b = all(d, '[data-act="bull"]');
  assert.deepEqual(b.map((e) => e.getAttribute('data-v')), ['a', 'b']);
  assert.equal(txt(b[0].querySelector('b')), 'Ahmad'); assert.equal(txt(b[0].querySelector('span')), 'Starts Leg 1');
  assert.equal(txt(d.querySelector('.again')), 'Too close to call? Throw again.');
});

test('deciding leg: the bull loser throws first; the closest chooses', () => {
  const m = match('choice', 3); m.bull('a'); winLeg(m, 'a'); winLeg(m, 'b');
  let d = dom(m);
  assert.equal(txt(d.querySelector('.decp .pill')), 'DECIDING LEG');
  assert.equal(txt(d.querySelector('.decp h2')), 'BULL FOR LEG 3');
  assert.match(txt(d.querySelector('.bullp')), /Daniel throws first/);
  assert.equal(txt(all(d, '[data-act="bull"]')[0].querySelector('span')), 'Chooses');
  m.bull('a');
  d = dom(m);
  assert.equal(txt(d.querySelector('.decp h2')), 'CHOICE');
  assert.deepEqual(all(d, '.steps .step span').map(txt), ['Daniel lost the opening bull and threw first.', 'Closest to the bull: Ahmad.', 'Ahmad chooses: start the leg or pick the game.']);
  assert.deepEqual(all(d, '[data-act="cpick"]').map((e) => e.getAttribute('data-v')), ['start', 'game']);
  assert.match(txt(all(d, '[data-act="cpick"]')[0]), /I’ll start the leg/);
  assert.deepEqual(all(d, '[data-act="cgame"]').map((e) => [e.getAttribute('data-v'), txt(e)]), [['x01', '501'], ['cricket', 'Cricket']]);
  assert.equal(d.querySelector('.pop'), null);
  d = dom(m, { choicePick: 'start' });
  assert.ok(all(d, '[data-act="cpick"]')[0].classList.contains('blue'));
  assert.equal(d.querySelector('.pop'), null);
  d = dom(m, { choicePick: 'start', choiceGame: 'cricket' });
  const pop = d.querySelector('.pop.side-a');
  assert.equal(txt(pop.querySelector('.pill')), 'DECIDING LEG');
  assert.equal(txt(pop.querySelector('.big')), 'CRICKET');
  assert.equal(txt(pop.querySelector('h2')), 'AHMAD THROWS FIRST');
  assert.equal(txt(pop.querySelector('[data-act="cgo"]')), 'START LEG 3');
  assert.ok(pop.querySelector('[data-act="cchange"]'));
});

test('a leg\'s turns: tabs per leg, each score tappable; the change pop-up shows a refusal', () => {
  const m = match('501', 5); m.bull('a'); [100, 60, 85].forEach((s) => m.total(s));
  let d = dom(m, { popup: { kind: 'turns', leg: 0 }, turns: m.legTurns(0) });
  assert.equal(txt(d.querySelector('.turnsp h2')), 'LEG 1 • 501');
  assert.equal(txt(d.querySelector('.turnsp .subl')), 'Ahmad threw first. Tap a score to change it.');
  assert.deepEqual(all(d, '.turnsp .trow').map((r) => all(r, '.c').map(txt)), [['1', '100', '401', '60', '441'], ['2', '85', '316', '–', '']]);
  const ids = all(d, '[data-act="edit"]').map((e) => e.getAttribute('data-v'));
  assert.equal(ids.length, 3);
  assert.ok(d.querySelector('[data-act="closePop"]'));
  d = dom(m, { popup: { kind: 'edit', leg: 0, turnId: ids[1], error: 'breaks_later' }, turns: m.legTurns(0), typed: '58' });
  const pop = d.querySelector('.pop.side-b');
  assert.equal(txt(pop.querySelector('.eyebrow')), 'LEG 1 • TURN 1 • DANIEL');
  assert.equal(txt(pop.querySelector('h2')), 'CHANGE 60 TO 58?');
  assert.equal(txt(pop.querySelector('.err')), 'This makes a later score impossible.');
  assert.equal(txt(pop.querySelector('[data-act="editGo"]')), 'CHANGE TO 58');
});

test('summary: winner, runner-up, legs, the page\'s buttons', () => {
  const m = match('choice', 3); m.bull('a'); winLeg(m, 'a'); winLeg(m, 'a');
  const d = dom(m, { summaryButtons: [{ label: 'NEW GAME', act: 'newGame' }, { label: 'REMATCH', act: 'rematch', main: true }] });
  assert.equal(txt(d.querySelector('.sum .win .lbl')), 'WINNER');
  assert.equal(txt(d.querySelector('.sum .win .nm')), 'Ahmad');
  assert.equal(txt(d.querySelector('.sum .run .nm')), 'Daniel');
  assert.equal(txt(d.querySelector('.sum .ls')), '2-0');
  assert.deepEqual(all(d, '.sum .lrow').map((r) => all(r, 'span').map(txt)),
    [['1', 'Ahmad', '501', '3rd dart • 141', '9'], ['2', 'Ahmad', 'Cricket', '2nd dart • Bull', '8']]);
  assert.deepEqual(all(d, '.sum .btns button').map((b) => [b.getAttribute('data-act'), txt(b)]), [['newGame', 'NEW GAME'], ['rematch', 'REMATCH']]);
});

test('gear pop-up: turn total or dart by dart, checkout hints', () => {
  const m = match('501', 5); m.bull('a');
  const d = dom(m, { popup: { kind: 'gear' }, hints: true });
  assert.deepEqual(all(d, '.gearp [data-act="mode"]').map((e) => [e.getAttribute('data-v'), e.classList.contains('on')]), [['total', true], ['darts', false]]);
  assert.equal(txt(d.querySelector('[data-act="hints"]')), 'ON');
  assert.ok(d.querySelector('[data-act="closePop"]'));
});

/* mount: taps go to the match */
function mounted(m, extra) {
  const doc = parse('<div id="r"></div>'), root = doc.getElementById('r');
  const seen = { changes: 0, actions: [] };
  const h = D.mount(root, m, Object.assign(opts(), { onChange: () => { seen.changes++; }, onAction: (a) => seen.actions.push(a) }, extra || {}));
  const tap = (sel) => { const el = root.querySelector(sel); assert.ok(el, sel); el.dispatchEvent({ type: 'click', bubbles: true, target: el }); };
  return { root, seen, tap, h };
}

test('mount: typed digits then submit adds a turn; a quick score sends at once; undo takes it back', () => {
  const m = match('501', 5); m.bull('a');
  const { root, seen, tap } = mounted(m);
  tap('[data-act="digit"][data-v="1"]'); tap('[data-act="digit"][data-v="0"]'); tap('[data-act="digit"][data-v="0"]');
  assert.equal(txt(root.querySelector('.entry .val')), '100');
  tap('[data-act="submit"]');
  assert.equal(m.view().sides.a.left, 401); assert.equal(seen.changes, 1);
  tap('[data-act="quick"][data-v="60"]');
  assert.equal(m.view().sides.b.left, 441); assert.equal(seen.changes, 2);
  tap('[data-act="undo"]');
  assert.equal(m.view().sides.b.left, 501); assert.equal(seen.changes, 3);
});

test('mount: a bust total asks, then the which-dart pop-up finishes a leg', () => {
  const m = match('501', 3); m.bull('a');
  [180, 60, 180, 60, 101, 60].forEach((s) => m.total(s));
  const { root, tap } = mounted(m);
  tap('[data-act="quick"][data-v="60"]');
  assert.equal(txt(root.querySelector('.pop h2')), 'NO SCORE?');
  tap('[data-act="cancel"]');
  assert.equal(root.querySelector('.pop'), null);
  tap('[data-act="digit"][data-v="4"]'); tap('[data-act="digit"][data-v="0"]'); tap('[data-act="submit"]');
  tap('[data-act="finish"][data-v="2"]');
  assert.deepEqual(m.view().legsWon, { a: 1, b: 0 });
});

test('mount: cricket darts then ENTER; the back arrow and page buttons reach the page', () => {
  const m = match('cricket', 1); m.bull('a');
  const { seen, tap } = mounted(m);
  tap('[data-act="dart"][data-v="20:3"]'); tap('[data-act="miss"]');
  tap('[data-act="enter"]');
  assert.equal(m.view().cricket.numbers[0].a, 3); assert.equal(m.view().throwing, 'b');
  tap('[data-act="back"]');
  assert.deepEqual(seen.actions, ['back']);
});

test('mount: x01 dart by dart with S/D/T, then ENTER', () => {
  const m = match('501', 5); m.bull('a');
  const { tap } = mounted(m, { mode: 'darts' });
  tap('[data-act="mult"][data-v="3"]'); tap('[data-act="dart"][data-v="20"]');
  tap('[data-act="dart"][data-v="bull"]'); tap('[data-act="miss"]');
  tap('[data-act="enter"]');
  assert.equal(m.view().sides.a.left, 501 - 60 - 50);
});

test('mount: an edit that is refused keeps the pop-up open with the reason', () => {
  const m = match('501', 5); m.bull('a');
  [180, 60, 180, 60, 100, 60, 39].forEach((s) => m.total(s));
  const { root, tap } = mounted(m);
  tap('.card.side-a');
  const id = m.legTurns(0)[2].a.turnId;
  tap(`[data-act="edit"][data-v="${id}"]`);
  tap('.pop [data-act="digit"][data-v="1"]'); tap('.pop [data-act="digit"][data-v="4"]'); tap('.pop [data-act="digit"][data-v="0"]');
  tap('[data-act="editGo"]');
  assert.equal(txt(root.querySelector('.pop .err')), 'This makes a later score impossible.');
  assert.equal(m.legTurns(0)[2].a.scored, 100);
});

// 25, Bull and Miss take no Single / Double / Treble (owner 2026-11-07): 25 is always the outer bull, Bull always 50,
// Miss always nothing, whatever is selected; the selection goes back to Single after them.
test('mount: 25, Bull and Miss ignore Double and Treble', () => {
  const m = match('501', 5); m.bull('a');
  const { tap, root } = mounted(m, { mode: 'darts' });
  tap('[data-act="mult"][data-v="2"]'); tap('[data-act="dart"][data-v="25"]');
  tap('[data-act="mult"][data-v="3"]'); tap('[data-act="dart"][data-v="bull"]');
  tap('[data-act="mult"][data-v="3"]'); tap('[data-act="miss"]');
  assert.ok(root.querySelectorAll('[data-act="mult"]')[0].classList.contains('on'), 'back to Single');
  tap('[data-act="enter"]');
  assert.equal(m.view().sides.a.left, 501 - 25 - 50);
});

// A total no three darts make (179) is refused: the typed number stays, the box shakes and says why, until the next key
// (owner 2026-11-07). Before, the number just vanished.
test('mount: an impossible total stays typed and says it is not possible', () => {
  const m = match('501', 5); m.bull('a');
  const { tap, root } = mounted(m);
  tap('[data-act="digit"][data-v="1"]'); tap('[data-act="digit"][data-v="7"]'); tap('[data-act="digit"][data-v="9"]');
  tap('[data-act="submit"]');
  const box = root.querySelector('.entry');
  assert.ok(box.classList.contains('bad'), 'the box is marked');
  assert.equal(txt(root.querySelector('.entry .val')), '179', 'the typed number stays');
  assert.equal(txt(root.querySelector('.entry .lv')), WORDS.err_invalid);
  assert.equal(m.view().sides.a.left, 501, 'nothing scored');
  tap('[data-act="del"]');
  assert.ok(!root.querySelector('.entry').classList.contains('bad'), 'the next key clears it');
  assert.equal(txt(root.querySelector('.entry .val')), '17');
});

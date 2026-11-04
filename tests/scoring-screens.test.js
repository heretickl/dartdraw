const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parse } = require('./lib/mini-dom');
const S = require('../scoring-model.js');
const D = require('../scoring-screens.js');
const WORDS = require('../scoring_app/i18n/casual.en.js');

// The shared scoring screens (scoring-screens.js): HTML from the model's view(), laid out as the approved screens in
// docs/design/screens-yours/. Checked here as a parsed DOM; the look itself is checked in a browser (plan Task 6).

const HEADER = { title: 'DARTDRAW', line2: 'CASUAL PLAY', line3: 'BEST OF 5 LEGS • 501 • DOUBLE OUT' };
const match = (game, bestOf, names) => S.create({ format: S.formatFor({ game, bestOf }), names: names || { a: 'Ahmad', b: 'Daniel' }, now: () => 1000 });
const opts = (o) => Object.assign({ words: WORDS, header: HEADER, pill: null, mode: 'total', typed: '' }, o || {});
const dom = (m, o) => parse(D.render(m.view(), opts(o)));
const txt = (el) => el.textContent.replace(/\s+/g, ' ').trim();
const all = (doc, sel) => doc.querySelectorAll(sel);

test('esc escapes the five HTML characters', () => {
  assert.equal(D.esc(`<a href="x">Tom & 'Jerry'</a>`), '&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;');
  assert.equal(D.esc(null), '');
  assert.equal(D.esc(501), '501');
});

test('fmt fills {fields}', () => {
  assert.equal(D.fmt('LEG {n} WON', { n: 3 }), 'LEG 3 WON');
  assert.equal(D.fmt('{a}-{b}-{a}', { a: 1, b: 2 }), '1-2-1');
});

test('header: the page\'s three lines, a pill only when given, back and gear', () => {
  const m = match('501', 5); m.bull('a');
  let d = dom(m);
  assert.equal(txt(d.querySelector('.dds-hd .t1')), 'DARTDRAW');
  assert.equal(txt(d.querySelector('.dds-hd .t2')), 'CASUAL PLAY');
  assert.equal(txt(d.querySelector('.dds-hd .t3')), 'BEST OF 5 LEGS • 501 • DOUBLE OUT');
  assert.equal(d.querySelector('.dds-hd .pill'), null);
  assert.ok(d.querySelector('.dds-hd [data-act="back"]'));
  assert.ok(d.querySelector('.dds-hd [data-act="gear"]'));
  d = dom(m, { pill: 'BOARD 3' });
  assert.equal(txt(d.querySelector('.dds-hd .pill')), 'BOARD 3');
});

test('score cards: names upper-cased, what is left, the thrower lit up', () => {
  const m = match('501', 5); m.bull('a'); m.total(100);
  const d = dom(m);
  const a = d.querySelector('.card.side-a'), b = d.querySelector('.card.side-b');
  assert.equal(txt(a.querySelector('.nm')), 'AHMAD'); assert.equal(txt(a.querySelector('.sc')), '401');
  assert.equal(txt(b.querySelector('.nm')), 'DANIEL'); assert.equal(txt(b.querySelector('.sc')), '501');
  assert.ok(b.classList.contains('on')); assert.ok(!a.classList.contains('on'));
  assert.equal(a.getAttribute('data-act'), 'turns');
});

test('legs box: the score and a dot per finished leg plus the one being played', () => {
  const m = match('501', 5); m.bull('a');
  for (let leg = 0; leg < 2; leg++) {
    const winner = leg === 0 ? 'a' : 'b';
    while (m.view().leg === leg) {
      const v = m.view();
      if (v.throwing !== winner) m.total(0);
      else if (v.sides[winner].left > 141) m.total(180);
      else { m.total(141); m.finishDart(3); }
    }
  }
  const d = dom(m);
  assert.equal(txt(d.querySelector('.legs .ls')), '1-1');
  assert.deepEqual(all(d, '.legs .dot').map((e) => e.className), ['dot side-a', 'dot side-b', 'dot now']);
});

test('LAST 3 SCORES rows follow view.last3, newest first', () => {
  const m = match('501', 5); m.bull('a');
  [100, 60, 85, 41, 45].forEach((s) => m.total(s));
  const d = dom(m);
  assert.equal(txt(d.querySelector('.last3 .ttl')), 'LAST 3 SCORES');
  const rows = all(d, '.last3 .row').map((r) => all(r, 'span').map(txt));
  assert.deepEqual(rows, [['45', '3', ''], ['85', '2', '41'], ['100', '1', '60']]);
  assert.ok(all(d, '.last3 .row')[0].classList.contains('new'));
});

test('quick scores are the approved nine, 180 in gold', () => {
  const m = match('501', 5); m.bull('a');
  const d = dom(m);
  const q = all(d, '[data-act="quick"]');
  assert.deepEqual(q.map((e) => e.getAttribute('data-v')), ['26', '41', '45', '60', '85', '100', '121', '140', '180']);
  assert.deepEqual(q.map(txt), ['26', '41', '45', '60', '85', '100', '121', '140', '180']);
  assert.ok(q[8].classList.contains('gold'));
});

test('keypad: 1-9, 0, delete, undo, bust; submit shows what is typed', () => {
  const m = match('501', 5); m.bull('a');
  let d = dom(m, { typed: '100' });
  assert.deepEqual(all(d, '[data-act="digit"]').map((e) => e.getAttribute('data-v')).sort(), ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
  ['del', 'undo', 'bust'].forEach((a) => assert.ok(d.querySelector(`[data-act="${a}"]`), a));
  assert.equal(txt(d.querySelector('[data-act="undo"]')), 'UNDO');
  assert.equal(txt(d.querySelector('[data-act="bust"]')), 'NO SCORE');   // owner 2026-11-04: No score replaces Bust
  const sub = d.querySelector('[data-act="submit"]');
  assert.equal(txt(sub), 'ENTER'); assert.equal(sub.hasAttribute('disabled'), false);
  // the typed score shows in a box above the keypad (owner 2026-11-04, option C), with what it leaves
  const box = d.querySelector('.entry.side-a');
  assert.equal(txt(box.querySelector('.who')), 'AHMAD'); assert.equal(txt(box.querySelector('.val')), '100'); assert.equal(txt(box.querySelector('.lv')), 'leaves 401');
  d = dom(m, { typed: '' });
  assert.equal(txt(d.querySelector('[data-act="submit"]')), 'ENTER');
  assert.equal(txt(d.querySelector('.entry .val')), ''); assert.equal(txt(d.querySelector('.entry .lv')), '');
  assert.equal(txt(parse(D.render(m.view(), opts({ typed: '180' }))).querySelector('.entry .lv')), 'leaves 321');
  assert.equal(d.querySelector('[data-act="submit"]').hasAttribute('disabled'), true);
});

test('which dart: a pop-up in the winner\'s colour, the name as the headline; impossible darts greyed', () => {
  const m = match('501', 5); m.bull('a');
  [180, 60, 180, 60].forEach((s) => m.total(s));
  m.total(141);
  const d = dom(m);
  const pop = d.querySelector('.pop.side-a');
  assert.ok(pop);
  assert.equal(txt(pop.querySelector('.pill')), 'LEG 1 WON');
  assert.equal(txt(pop.querySelector('.who')), 'AHMAD');
  assert.equal(txt(pop.querySelector('.big')), '141');
  assert.equal(txt(pop.querySelector('h2')), 'WHICH DART FINISHED IT?');
  const btns = all(pop, '.fd');
  assert.equal(btns.length, 3);
  assert.deepEqual(btns.map((b) => b.getAttribute('data-act')), [null, null, 'finish']);
  assert.equal(btns[2].getAttribute('data-v'), '3');
  assert.equal(txt(btns[0].querySelector('b')), '1st'); assert.equal(txt(btns[0].querySelector('span')), 'Not possible');
  assert.equal(txt(pop.querySelector('[data-act="cancel"]')), 'NOT A CHECKOUT • UNDO');
});

test('which dart for side b uses b\'s colour; a 40 can be any dart', () => {
  const m = match('501', 5); m.bull('b');
  [180, 60, 180, 60, 101, 60].forEach((s) => m.total(s));
  m.total(40);
  const d = dom(m);
  assert.ok(d.querySelector('.pop.side-b'));
  assert.deepEqual(all(d, '.pop .fd').map((b) => b.getAttribute('data-act')), ['finish', 'finish', 'finish']);
});

test('Bust?: a pop-up with yes and cancel', () => {
  const m = match('501', 5); m.bull('a');
  [180, 60, 180, 60, 101, 60].forEach((s) => m.total(s));
  m.total(60);
  const d = dom(m, { asked: 60 });
  const pop = d.querySelector('.pop');
  assert.equal(txt(pop.querySelector('h2')), 'NO SCORE?');
  assert.equal(txt(pop.querySelector('p')), 'Ahmad has 40 left. 60 would be a bust.');
  assert.ok(pop.querySelector('[data-act="confirmBust"]')); assert.ok(pop.querySelector('[data-act="cancel"]'));
});

test('typed names are text, never HTML (Review Focus 1)', () => {
  const m = match('501', 5, { a: '<b>Ali</b>', b: 'Tom & "Jerry"' }); m.bull('a');
  [180, 60, 180, 60].forEach((s) => m.total(s));
  m.total(141);
  const html = D.render(m.view(), opts());
  assert.ok(!html.includes('<b>Ali'));
  assert.ok(html.includes('&lt;B&gt;ALI&lt;/B&gt;'));
  assert.ok(html.includes('TOM &amp; &quot;JERRY&quot;'));
  assert.equal(txt(parse(html).querySelector('.card.side-a .nm')), '<B>ALI</B>');
});

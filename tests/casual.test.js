const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { parse } = require('./lib/mini-dom');

// The casual play site (scoring_app/, spec docs/superpowers/specs/2026-11-03-casual-play-design.md): setup, the game on the
// shared scoring screens, the game kept on the phone, New game and Rematch. casual.js finds DDScoring and DDScreens as
// globals, as the page loads them.
const ROOT = path.join(__dirname, '..');
global.DDMatch = require('../scoring_app/match-engine.js');
global.DDScoring = require('../scoring_app/scoring-model.js');
global.DDScreens = require('../scoring_app/scoring-screens.js');
const C = require('../scoring_app/casual.js');
const WORDS = require('../scoring_app/i18n/casual.en.js');

const txt = (el) => el.textContent.replace(/\s+/g, ' ').trim();
const plain = (x) => JSON.parse(JSON.stringify(x));
function memStore() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; }
const badStore = { getItem() { throw new Error('private mode'); }, setItem() { throw new Error('private mode'); }, removeItem() { throw new Error('private mode'); } };
function site(storage, words) {
  const root = parse('<main id="app"></main>').getElementById('app');
  const h = C.start(root, { storage, words: words || WORDS });
  const q = (sel) => root.querySelector(sel);
  const tap = (sel) => { const el = q(sel); assert.ok(el, sel); el.dispatchEvent({ type: 'click', bubbles: true, target: el }); };
  const type = (sel, v) => { const el = q(sel); el.value = v; el.dispatchEvent({ type: 'input', bubbles: true, target: el }); };
  return { root, h, q, tap, type };
}
function ready(s, a, b, game, best) {
  s.type('#csA', a); s.type('#csB', b);
  if (game) s.tap(`[data-cs="game"][data-v="${game}"]`);
  if (best) s.tap(`[data-cs="best"][data-v="${best}"]`);
  s.tap('[data-cs="start"]');
}
function score(s, n) { if (n === 0) { s.tap('[data-act="digit"][data-v="0"]'); s.tap('[data-act="submit"]'); } else s.tap(`[data-act="quick"][data-v="${n}"]`); }

test('checkNames', () => {
  assert.equal(C.checkNames('Ahmad', 'Daniel'), null);
  assert.equal(C.checkNames(' ', 'Daniel'), 'name_missing');
  assert.equal(C.checkNames('Ahmad', ''), 'name_missing');
  assert.equal(C.checkNames('Ali', 'ali '), 'name_same');
});

test('setup: names, game, best of, start (CSetup)', () => {
  const s = site(memStore());
  assert.equal(txt(s.q('.t1')), 'DARTDRAW'); assert.equal(txt(s.q('.t2')), 'CASUAL PLAY');
  assert.equal(s.q('[data-act="back"]'), null);
  assert.equal(s.q('#csA').getAttribute('maxlength'), '20'); assert.equal(s.q('#csB').getAttribute('maxlength'), '20');
  const games = s.root.querySelectorAll('[data-cs="game"]');
  assert.deepEqual(games.map((g) => [g.getAttribute('data-v'), txt(g.querySelector('b')), txt(g.querySelector('span'))]),
    [['501', '501', 'Double out'], ['cricket', 'CRICKET', '20 to Bull'], ['choice', 'CHOICE', '501 and Cricket']]);
  assert.ok(games[0].classList.contains('on'));
  const best = s.root.querySelectorAll('[data-cs="best"]');
  assert.deepEqual(best.map((b) => txt(b.querySelector('b')) + ' ' + txt(b.querySelector('span'))), ['1 LEG', '3 LEGS', '5 LEGS', '7 LEGS', '9 LEGS']);
  assert.ok(best[2].classList.contains('on'));
  assert.equal(txt(s.q('.first')), 'First to 3 legs wins.');
  assert.equal(txt(s.q('.nextb')), 'Next: a bull throw to see who starts.');
  assert.ok(s.q('[data-cs="start"]').hasAttribute('disabled'));
  s.type('#csA', 'Ahmad'); s.type('#csB', 'ahmad');
  assert.ok(s.q('[data-cs="start"]').hasAttribute('disabled'));
  assert.equal(txt(s.q('.cserr')), 'The two names must be different.');
  s.type('#csB', 'Daniel');
  assert.ok(!s.q('[data-cs="start"]').hasAttribute('disabled'));
  s.tap('[data-cs="best"][data-v="7"]');
  assert.equal(txt(s.q('.first')), 'First to 4 legs wins.');
  assert.equal(s.q('#csA').value, 'Ahmad');
});

test('start: the opening bull, without check-in or coin flip (CBull)', () => {
  const s = site(memStore());
  ready(s, 'Ahmad', 'Daniel', 'choice', '5');
  assert.equal(txt(s.q('.t3')), 'BEST OF 5 LEGS • 501 / CRICKET');
  assert.equal(txt(s.q('.bullp h3')), 'BULL THROW');
  assert.match(txt(s.q('.bullp')), /One dart each/);
  assert.match(txt(s.q('.bullp')), /Closest to the bull starts leg 1\./);
  assert.equal(txt(s.q('.again')), 'Too close to call? Throw again.');
  assert.doesNotMatch(txt(s.root), /CHECK-IN|coin|organiser/i);
  assert.equal(s.q('.pill'), null);
});

test('the bull screen\'s back arrow returns to setup with the picks kept', () => {
  const s = site(memStore());
  ready(s, 'Ahmad', 'Daniel', 'cricket', '3');
  s.tap('[data-act="back"]');
  assert.equal(s.q('#csA').value, 'Ahmad');
  assert.ok(s.q('[data-cs="game"][data-v="cricket"]').classList.contains('on'));
  assert.ok(s.q('[data-cs="best"][data-v="3"]').classList.contains('on'));
});

test('the game is kept on the phone: a reload reopens it where it stopped (Review Focus 2)', () => {
  const store = memStore();
  const s = site(store);
  ready(s, 'Ahmad', 'Daniel', '501', '3');
  s.tap('[data-act="bull"][data-v="a"]');
  score(s, 100); score(s, 60);
  const before = plain(s.h.match().view());
  const again = site(store);
  assert.deepEqual(plain(again.h.match().view()), before);
  assert.equal(txt(again.q('.card.side-a .sc')), '401');
  assert.deepEqual(plain(C.matchFrom(C.load(store)).view()), before);
});

test('reload on the which-dart pop-up: the turn is not kept, the game is', () => {
  const store = memStore();
  const s = site(store);
  ready(s, 'Ahmad', 'Daniel', '501', '1');
  s.tap('[data-act="bull"][data-v="a"]');
  [180, 0, 180, 0].forEach((n) => score(s, n));
  s.tap('[data-act="digit"][data-v="1"]'); s.tap('[data-act="digit"][data-v="4"]'); s.tap('[data-act="digit"][data-v="1"]'); s.tap('[data-act="submit"]');
  assert.ok(s.q('.pop.finish'));
  const again = site(store);
  assert.equal(again.q('.pop'), null);
  assert.equal(txt(again.q('.card.side-a .sc')), '141');
});

test('storage that throws: setup still shows and a game can be played', () => {
  const s = site(badStore);
  ready(s, 'Ahmad', 'Daniel', '501', '1');
  s.tap('[data-act="bull"][data-v="b"]');
  score(s, 60);
  assert.equal(txt(s.q('.card.side-b .sc')), '441');
});

test('opening with saved picks and no game shows setup with them', () => {
  const store = memStore();
  C.save(store, { picks: { a: 'Ahmad', b: 'Daniel', game: 'cricket', bestOf: 7 }, events: null, screen: 'setup' });
  const s = site(store);
  assert.equal(s.q('#csA').value, 'Ahmad'); assert.equal(s.q('#csB').value, 'Daniel');
  assert.ok(s.q('[data-cs="game"][data-v="cricket"]').classList.contains('on'));
  assert.ok(!s.q('[data-cs="start"]').hasAttribute('disabled'));
});

function playToResult(s) {
  s.tap('[data-act="bull"][data-v="a"]');
  [180, 0, 180, 0].forEach((n) => score(s, n));
  s.tap('[data-act="digit"][data-v="1"]'); s.tap('[data-act="digit"][data-v="4"]'); s.tap('[data-act="digit"][data-v="1"]'); s.tap('[data-act="submit"]');
  s.tap('[data-act="finish"][data-v="3"]');
}

test('result: NEW GAME keeps the names; REMATCH keeps names, game and best of and asks for the bull (CResult)', () => {
  const store = memStore();
  const s = site(store);
  ready(s, 'Ahmad', 'Daniel', '501', '1');
  playToResult(s);
  assert.equal(txt(s.q('.sum .win .nm')), 'Ahmad');
  assert.deepEqual(s.root.querySelectorAll('.sum .btns button').map((b) => [b.getAttribute('data-act'), txt(b)]), [['newGame', 'NEW GAME'], ['rematch', 'REMATCH']]);
  s.tap('[data-act="rematch"]');
  assert.ok(s.q('.bullp'));
  assert.equal(s.h.match().events().length, 0);
  assert.equal(txt(s.q('.t3')), '1 LEG • 501 • DOUBLE OUT');
  playToResult(s);
  s.tap('[data-act="newGame"]');
  assert.equal(s.q('#csA').value, 'Ahmad'); assert.equal(s.q('#csB').value, 'Daniel');
  assert.equal(C.load(store).events, null);
});

test('the result screen\'s back arrow shows the last leg\'s turns', () => {
  const s = site(memStore());
  ready(s, 'Ahmad', 'Daniel', '501', '1');
  playToResult(s);
  s.tap('[data-act="back"]');
  assert.equal(txt(s.q('.turnsp h2')), 'LEG 1 • 501');
});

test('settings are kept on the phone', () => {
  const store = memStore();
  const s = site(store);
  ready(s, 'Ahmad', 'Daniel', '501', '3');
  s.tap('[data-act="bull"][data-v="a"]');
  s.tap('[data-act="gear"]'); s.tap('[data-act="mode"][data-v="darts"]'); s.tap('[data-act="hints"]'); s.tap('[data-act="closePop"]');
  assert.ok(s.q('.turnp'));
  const again = site(store);
  assert.ok(again.q('.turnp'));
  assert.deepEqual(JSON.parse(store.getItem('dd-casual-prefs')), { mode: 'darts', hints: true });
});

test('typed names are text on setup, bull and result (Review Focus 1)', () => {
  const evil = '<img src=x onload=f>';   // 20 characters, the most a name can have
  const s = site(memStore());
  ready(s, evil, 'Daniel', '501', '1');
  assert.ok(!s.root.querySelector('img'));
  playToResult(s);
  assert.ok(!s.root.querySelector('img'));
  assert.equal(txt(s.q('.sum .win .nm')), evil);
  s.tap('[data-act="newGame"]');
  assert.equal(s.q('#csA').value, evil);
  assert.ok(!s.root.querySelector('img'));
});

test('every word on setup comes from the words file', () => {
  const marked = {}; Object.keys(WORDS).forEach((k) => { marked[k] = '§' + k; });
  const s = site(memStore(), marked);
  const t = txt(s.root);
  ['DARTDRAW', 'CASUAL PLAY', 'PLAYERS', 'BEST OF', 'START GAME', 'Double out', '20 to Bull', 'First to', 'Next:'].forEach((w) => assert.ok(!t.includes(w), w));
});

test('the offline copy lists every file the page loads', () => {
  const html = fs.readFileSync(path.join(ROOT, 'scoring_app', 'index.html'), 'utf8');
  const files = [...html.matchAll(/<(?:script src|link rel="stylesheet" href)="([^"]+)"/g)].map((m) => m[1]).filter((u) => !/^https?:/.test(u)).map((u) => '/' + u.replace(/^\.?\//, ''));
  const { SHELL } = require('../scoring_app/sw.js');
  assert.deepEqual(SHELL.slice().sort(), ['/'].concat(files).sort());
  files.forEach((u) => assert.ok(fs.existsSync(path.join(ROOT, 'scoring_app', u)), u));
  assert.match(html, /fonts\.googleapis\.com\/css2\?family=Barlow\+Semi\+Condensed:wght@600;700&(amp;)?family=Manrope:wght@400;500;600;700/);
});

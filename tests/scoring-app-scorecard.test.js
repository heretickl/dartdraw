const { test } = require('node:test');
const assert = require('node:assert/strict');
const { txt, tick, click, newRoot } = require('./lib/scoring-app-client');

// The scorecard tab (scoring_app/scorecard.js): headline, the two cards and the chart, the breakdown drawer, recent matches.
const SC = global.DDScorecard, W = global.DD_CASUAL_EN;

const empty = { headline: { x01: { avg3: null, trend: null }, cricket: { mpr: null, trend: null } }, chart: { x01: [], cricket: [] },
  breakdown: { x01: {}, cricket: {} }, summary: { tournament: { events: 0, titles: 0, bestFinish: null, latest: null }, casual: { played: 0, wonPct: null, favouriteGame: null, mostPlayedWith: null } }, recent: [], notices: [] };
const x01 = { darts: 900, points: 6300, f9darts: 90, f9points: 700, checkoutTurns: 153, checkouts: 52, n180: 7, n140: 24, n100: 57, highFinish: 124, bestLegDarts: 15, legsPlayed: 60, legsWon: 35 };
const cr = { darts: 600, marks: 520, f9darts: 60, f9marks: 58, rounds5: 24, rounds9: 1, hatTricks: 3, whiteHorses: 2, bulls: 40, bestLegDarts: 17, legsPlayed: 28, legsWon: 16 };
const vals = [57, 59, 60.5, 58, 62, 61, 63.1, 66.7, 59.8, 64, 57.2, 61.9, 68.4];
const full = {
  headline: { x01: { avg3: 63.2, trend: 2.4 }, cricket: { mpr: 2.6, trend: -0.2 } },
  chart: { x01: vals.map((v, i) => ({ gameId: 'g' + i, at: '2026-10-' + String(10 + i).padStart(2, '0') + 'T10:00:00.000Z', value: v, kind: i % 3 ? 'casual' : 'tournament' })),
    cricket: [2.2, 2.4, 2.5, 2.3, 2.8].map((v, i) => ({ gameId: 'c' + i, at: '2026-10-20T10:00:00.000Z', value: v, kind: 'casual' })) },
  breakdown: { x01, cricket: cr },
  summary: { tournament: { events: 0, titles: 0, bestFinish: null, latest: null }, casual: { played: 38, wonPct: 57.89, favouriteGame: '501', mostPlayedWith: { name: 'Danny <b>', games: 14 } } },
  recent: [
    { id: '11111111-1111-4111-8111-111111111111', playedAt: '2026-11-03T12:00:00.000Z', game: '501', bestOf: 3, won: true, score: '2-1', opponent: { name: 'Danny <b>', guest: true }, headline: { avg3: 61.9 } },
    { id: '22222222-2222-4222-8222-222222222222', playedAt: '2026-11-02T12:00:00.000Z', game: 'cricket', bestOf: 5, won: false, score: '2-3', opponent: { name: 'Sara', guest: false }, headline: { mpr: 2.4 } }],
  notices: []
};
const one = { game: { id: '1', me: { name: 'Ahmad F', stats: { won: true, x01: { ...x01, darts: 90, points: 500 }, cricket: null } }, opponent: { name: 'Danny <b>', guest: true, stats: { won: false, x01: { ...x01, darts: 80, points: 400 }, cricket: null } } } };
const clone = (o) => JSON.parse(JSON.stringify(o));

function run(scorecard, over) {
  const calls = [];
  const ctx = Object.assign({ lang: 'en', words: W, wide: false, player: { id: 'p', firstName: 'Ahmad', lastName: 'Faizal', email: 'a@x.my' }, setPlayer() {}, go() {}, setLang() {},
    api: async (p, o) => {
      calls.push(p + (o && o.body ? ' ' + JSON.stringify(o.body) : ''));
      if (p.startsWith('/api/games/scorecard')) return { ok: true, status: 200, body: scorecard };
      if (p.startsWith('/api/games/one')) return { ok: true, status: 200, body: one };
      if (p.startsWith('/api/friends/list')) return { ok: true, status: 200, body: { friends: [], requests: [] } };
      return { ok: true, status: 200, body: { ok: true } };
    } }, over || {});
  const root = newRoot();
  SC.renderScorecard(root, ctx);
  const tap = (sel) => { const el = root.querySelector(sel); assert.ok(el, sel); click(el); };
  return { root, ctx, calls, tap };
}

test('no games: the headline shows a dash, never NaN, and invites a first game', async () => {
  const s = run(empty); await tick();
  const t = txt(s.root);
  assert.ok(!/NaN|undefined|null/.test(t), t);
  assert.equal(txt(s.root.querySelector('.sc-hd.x .v')), '–');
  assert.equal(txt(s.root.querySelector('.sc-hd.c .v')), '–');
  assert.ok(t.includes(W.scEmptyTitle) && t.includes(W.playCasualBtn));
});

test('the Tournaments filter asks the server for tournaments and says results will appear', async () => {
  const s = run(empty); await tick();
  s.tap('[data-f="tournament"]'); await tick();
  assert.ok(txt(s.root).includes(W.scTourEmpty));
  assert.ok(s.calls.some((c) => c.includes('filter=tournament')));
});

test('with games: both headline numbers and their trends show', async () => {
  const s = run(full); await tick();
  assert.equal(txt(s.root.querySelector('.sc-hd.x .v')), '63.2');
  assert.equal(txt(s.root.querySelector('.sc-hd.c .v')), '2.6');
  const t = txt(s.root);
  assert.ok(t.includes('▲ +2.4') && t.includes('▼ 0.2'), 'up and down trend chips');
  assert.ok(!/NaN|undefined|null/.test(t));
});

// "Played most with Danny · 1 games" read wrong: one game has its own words, in both languages.
test('played most with: 1 game, and 14 games', async () => {
  const once = clone(full); once.summary.casual.mostPlayedWith.games = 1;
  const s1 = run(once); await tick();
  s1.tap('[data-f="all"]'); await tick(); // the filter is remembered from the tests before
  const kinds = (s) => s.root.querySelectorAll('.sc-kind.c').map(txt).join(' ');
  assert.ok(kinds(s1).includes('Danny <b> · 1 game'), kinds(s1));
  assert.ok(!kinds(s1).includes('1 games'));
  const s = run(full); await tick();
  assert.ok(kinds(s).includes('Danny <b> · 14 games'), kinds(s));
  const MS = require('../scoring_app/i18n/casual.ms.js');
  assert.ok(W.scWithGames1 && MS.scWithGames1 && /\{name\}/.test(W.scWithGames1) && /\{name\}/.test(MS.scWithGames1));
});

test('tapping the MPR card switches the chart label and the breakdown button', async () => {
  const s = run(full); await tick();
  assert.equal(txt(s.root.querySelector('#scChl')), W.scChartX);
  s.tap('[data-g="c"]');
  assert.equal(txt(s.root.querySelector('#scChl')), W.scChartC);
  assert.equal(txt(s.root.querySelector('#scMoreL')), W.scMoreC);
  s.tap('[data-g="x"]');
  assert.equal(txt(s.root.querySelector('#scChl')), W.scChartX, 'and back');
});

test('the breakdown drawer lists the 8 01 tiles, then the 8 Cricket tiles', async () => {
  const s = run(full); await tick();
  s.tap('#scMore');
  assert.ok(s.root.querySelector('#scDrawer').classList.contains('open'));
  const tiles = s.root.querySelectorAll('#scTiles .sc-tile');
  assert.equal(tiles.length, 8);
  assert.deepEqual(s.root.querySelectorAll('#scTiles .sc-lbl').map(txt), ['FIRST 9 AVG', 'CHECKOUTS', '180s', '140+', '100+', 'HIGH FINISH', 'BEST LEG', 'LEGS WON']);
  assert.ok(txt(tiles[1]).includes('34%') && txt(tiles[1]).includes('52 of 153'), 'checkouts 52 of 153');
  s.tap('[data-g="c"]');
  assert.equal(s.root.querySelectorAll('#scTiles .sc-tile').length, 8, 'Cricket has 8 tiles too');
  assert.notDeepEqual(s.root.querySelectorAll('#scTiles .sc-lbl').map(txt), ['FIRST 9 AVG', 'CHECKOUTS', '180s', '140+', '100+', 'HIGH FINISH', 'BEST LEG', 'LEGS WON']);
});

test('a name from the server is shown as text, never as markup', async () => {
  const s = run(full); await tick();
  assert.ok(txt(s.root).includes('Danny <b>'));
  assert.ok(!s.root.querySelector('#scRecent b'));
});

test('a recent match opens its stats: asks the server once and shows both players\' tiles', async () => {
  const s = run(full); await tick();
  s.tap('.sc-m .sc-row'); await tick();
  assert.equal(s.calls.filter((c) => c.startsWith('/api/games/one?id=11111111')).length, 1);
  assert.equal(s.root.querySelector('.sc-m').querySelectorAll('.sc-tile').length, 16, 'both players, 8 tiles each');
  s.tap('.sc-m .sc-row'); s.tap('.sc-m .sc-row'); await tick();   // close and open again
  assert.equal(s.calls.filter((c) => c.startsWith('/api/games/one?id=11111111')).length, 1, 'not fetched again');
});

test('a Choice match row shows both 3DA and MPR', async () => {
  const ch = clone(full);
  ch.recent[0].game = 'choice'; ch.recent[0].headline = { avg3: 61.9, mpr: 2.4 };
  const s = run(ch); await tick();
  const row = txt(s.root.querySelector('.sc-m .sc-row'));
  assert.ok(row.includes('3DA 61.9') && row.includes('MPR 2.4'), row);
  assert.ok(!/\{\w+\}/.test(txt(s.root)), 'no literal {x}');
});

test('a 501 row shows only its 3DA, a Cricket row only its MPR', async () => {
  const s = run(full); await tick();
  const rows = s.root.querySelectorAll('.sc-m .sc-row').map(txt);
  assert.ok(rows[0].includes('3DA 61.9') && !rows[0].includes('MPR'), rows[0]);
  assert.ok(rows[1].includes('MPR 2.4') && !rows[1].includes('3DA'), rows[1]);
});

test('on a shared phone: the same player keeps the filter and tab, a different player starts clean', async () => {
  const s = run(full); await tick();
  s.tap('[data-f="casual"]'); await tick();
  s.tap('[data-tab="friends"]'); await tick();
  const again = (pid) => { const r = newRoot(); SC.renderScorecard(r, Object.assign({}, s.ctx, { player: Object.assign({}, s.ctx.player, { id: pid }) })); return r; };
  let r = again('p'); await tick();
  assert.ok(r.querySelector('[data-f="casual"]').classList.contains('on'), 'same player keeps the filter (EN | BM redraw)');
  r = again('other'); await tick();
  assert.ok(r.querySelector('[data-f="all"]').classList.contains('on'), 'other player starts at All');
  assert.ok(r.querySelector('#scFriends').hasAttribute('hidden'), 'and on the Scorecard tab, not Friends');
  assert.ok(!r.querySelector('#scCard').hasAttribute('hidden'));
});

test('the header says since when the player has played, in the chosen language', async () => {
  const player = { id: 'p', firstName: 'Ahmad', lastName: 'Faizal', email: 'a@x.my', createdAt: '2026-10-05T10:00:00.000Z' };
  let s = run(full, { player }); await tick();
  assert.match(txt(s.root.querySelector('.sc-me')), /a@x\.my · Player since October 2026/);
  s = run(full, { player, lang: 'ms', words: global.DD_CASUAL_MS }); await tick();
  assert.match(txt(s.root.querySelector('.sc-me')), /Pemain sejak Oktober 2026/);
});

test('a 401 from the server sends the player to log in', async () => {
  let went = null, forgot = false;
  const root = newRoot();
  SC.renderScorecard(root, { lang: 'en', words: W, wide: false, player: { id: 'p', firstName: 'A', lastName: 'B', email: 'a@b.c' },
    setPlayer(p) { if (!p) forgot = true; }, go(h) { went = h; }, setLang() {}, api: async () => ({ ok: false, status: 401, body: { code: 'not_authenticated' } }) });
  await tick();
  assert.ok(forgot && went === '', 'forgot the player and went to the start screen');
});

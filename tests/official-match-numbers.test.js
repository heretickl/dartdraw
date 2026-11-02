const { test } = require('node:test');
const assert = require('node:assert/strict');

/* The officials' phones name each match as the paper at the board does
   (docs/superpowers/specs/2026-11-02-board-groups-and-official-positions-design.md, part 2): round robin, the number in
   the group sheet's printed match order and the chart positions (swapped when the sheet prints the pair the other way
   round); knockout, the printed match number and the board group. Board groups put a section's matches on its board.
   The /api/score/* handlers against the in-memory database, as in floor-officials-api.test.js. */
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-match-numbers';
const { createFakeScoreDb } = require('./lib/fake-score-db');
const { loadApp, run, useState } = require('./lib/helpers');
const tournaments = {};
const db = createFakeScoreDb({ tournaments });
const dbPath = require.resolve('../api/_lib/db'), authPath = require.resolve('../api/_lib/auth');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { sql: (...a) => db.sql(...a) } };
require.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports: { requireAuth: async () => ({ id: 'org1', role: 'organizer' }) } };
const router = require('../api/score/[action].js');

const app = loadApp();
const f = (n) => run(app, n);
const T0 = Date.parse('2026-11-07T02:00:00.000Z');
const realNow = Date.now;
function at(ms) { Date.now = () => ms; db.setNow(ms); }
async function call(action, method, body, headers) {
  const res = { statusCode: 0, body: undefined, headers: {} };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.end = () => res;
  await router({ method, url: '/api/score/' + action, body, headers: Object.assign({ host: 'dd.test' }, headers || {}), query: {}, socket: { remoteAddress: '10.0.0.9' } }, res);
  return res;
}
function put(id, data) { data.id = id; data.eventCreation.date = '2026-11-07'; tournaments[id] = { data: JSON.parse(JSON.stringify(data)), updated_at: new Date(T0 - 60000).toISOString(), created_by: 'org1' }; }
async function official(t, boards) {
  const o = (await call('officials', 'POST', { op: 'create', t, name: 'Ref', boards })).body.official;
  const s = (await call('open', 'POST', { token: o.link.split('/score/')[1], pin: o.pin })).body.session;
  return { 'x-score-session': s };
}
/* Round robin -> knockout: group A (printed positions e3, e0, e5, e1) on board 1, and a drawn 8 bracket in 2 board groups. */
function event() {
  const t = f('blankTournament')(); useState(app, t); app.persist = () => {}; app.render = () => {};
  t.eventCreation.tournamentName = 'Sample Open'; t.eventCreation.eventName = 'Men Singles'; t.eventCreation.boards = 2;
  t.format.formatType = 'rrknockout';
  t.entriesList = ['Ali', 'Hakim', 'Siti', 'Abu', 'Faiz', 'Daniel', 'Ravi', 'Wong'].map((n, i) => ({ id: 'e' + i, name: n, org: '', players: [], withdrawn: false }));
  t.groups = [{ id: 'gA', label: 'A', entryIds: ['e3', 'e0', 'e5', 'e1'], boards: [1], confirmed: true, gameStarted: true, scores: {} },
    { id: 'gB', label: 'B', entryIds: ['e2', 'e4', 'e6', 'e7'], boards: [2], confirmed: true, gameStarted: true, scores: {} }];
  t.knockout = f('generateBracket')(t.entriesList.map((e) => ({ entryId: e.id, org: '' })), 'Main bracket');
  f('bgSet')(t.knockout, 2, 2);
  return JSON.parse(JSON.stringify(t));
}

test('round robin: each match carries its number in the printed match order and the chart positions, swapped as the sheet prints them', async () => {
  at(T0);
  const t = event(); put('mn1', t);
  const H = await official('mn1', [1]);
  const slots = (await call('matches', 'GET', null, H)).body.slots.filter((s) => s.kind === 'rr');
  const printed = JSON.parse(JSON.stringify(f('groupMatches')(t.groups[0])));
  const pos = (id) => t.groups[0].entryIds.indexOf(id) + 1;
  assert.equal(slots.length, printed.length);
  slots.forEach((s, i) => {
    assert.equal(s.info.matchNo, i + 1, 'listed in the printed order');
    const p = printed[i];
    assert.deepEqual([s.a, s.b].sort(), [p[0], p[1]].sort());
    assert.equal(s.info.flip, p[0] === s.b, 'flip when the sheet names slot.b first');
    const shown = s.info.flip ? [s.info.posB, s.info.posA] : [s.info.posA, s.info.posB];
    assert.deepEqual(shown, [pos(p[0]), pos(p[1])], 'positions in the order the sheet prints');
  });
  assert.ok(slots.some((s) => s.info.flip), 'this group has a pair printed the other way round');
  Date.now = realNow;
});

test('a result entered on a swapped pair is stored for the right player (the leg boxes follow slot.a and slot.b)', async () => {
  at(T0 + 1000);
  const t = event(); put('mn2', t);
  const H = await official('mn2', [1]);
  const s = (await call('matches', 'GET', null, H)).body.slots.find((x) => x.kind === 'rr' && x.info.flip);
  const first = s.b;   // the player the sheet (and the phone) names first
  const r = await call('result', 'POST', { pos: s.pos, op: 'score', la: 1, lb: 3, rv: 0 }, H);   // la = slot.a's legs: the first-named player won 3-1
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  const sc = tournaments.mn2.data.groups[0].scores[s.pos.split(':').slice(2).join(':')];
  const firstLegs = first < s.a ? sc.legs1 : sc.legs2;
  assert.equal(firstLegs, 3);
  Date.now = realNow;
});

test('knockout: the printed match number and the board group; a board holding a group sees that group’s matches', async () => {
  at(T0 + 2000);
  const t = event(); put('mn3', t);
  const H = await official('mn3', [2]);
  const ko = (await call('matches', 'GET', null, H)).body.slots.filter((s) => s.kind === 'ko');
  const b = t.knockout;
  const want = [];
  b.rounds.forEach((round, ri) => round.forEach((m, mi) => { if (m.board === 2 && (m.aEntryId || m.bEntryId)) want.push('ko:knockout:' + ri + ':' + mi); }));
  assert.ok(want.length >= 2);
  assert.deepEqual(ko.map((s) => s.pos).sort(), want.sort());
  ko.forEach((s) => {
    const [, , ri, mi] = s.pos.split(':').map(Number);
    assert.equal(s.info.matchNo, (ri + 1) + '-' + (mi + 1));
    assert.equal(s.info.boardGroup, 2);
  });
  Date.now = realNow;
});

test('the phone page shows the paper’s line: group, match number and positions, or board group, round and match', () => {
  const fs = require('fs'), vm = require('vm');
  const ctx = { window: { __DD_SCORE_NO_BOOT: true }, document: { documentElement: {} }, localStorage: { getItem: () => null }, location: { pathname: '/score/x', search: '' } };
  ctx.window.window = ctx.window; vm.createContext(ctx);
  ['i18n/score.en.js', 'score.js'].forEach((p) => vm.runInContext(fs.readFileSync(require.resolve('../' + p), 'utf8').replace(/\bwindow\.__DD_SCORE_NO_BOOT\b/, 'true'), ctx));
  const T = ctx.window.__ddScore.T;
  assert.equal(T('matchNo', { n: 3 }), 'Match 3');
  assert.equal(T('pos', { a: 4, b: 2 }), '4 v 2');
  assert.equal(T('boardGroup', { n: 2 }), 'Board group 2');
  const src = fs.readFileSync(require.resolve('../score.js'), 'utf8');
  assert.match(src, /info\.flip \? info\.posB : info\.posA/);
  assert.match(src, /order = sides\(s\)/, 'the result buttons follow the paper’s order (tests/score-buttons.test.js)');
});

test('review: a refused result on a swapped pair shows its score in the paper’s order in the Not sent list', () => {
  const fs = require('fs'), vm = require('vm');
  const ctx = { window: { __DD_SCORE_NO_BOOT: true }, document: { documentElement: {} }, localStorage: { getItem: () => null }, location: { pathname: '/score/x', search: '' } };
  ctx.window.window = ctx.window; vm.createContext(ctx);
  const src = fs.readFileSync(require.resolve('../score.js'), 'utf8').replace(/\bwindow\.__DD_SCORE_NO_BOOT\b/, 'true')
    .replace("if(typeof window !== 'undefined') window.__ddScore = {", "if(typeof window !== 'undefined') window.__ddScore = { itemResult: itemResult, setData: function(d){ data = d; },");
  vm.runInContext(fs.readFileSync(require.resolve('../i18n/score.en.js'), 'utf8'), ctx); vm.runInContext(src, ctx);
  const S = ctx.window.__ddScore;
  S.setData({ entries: { e0: 'Ali', e3: 'Abu' }, slots: [{ pos: 'rr:gA:e0|e3', kind: 'rr', a: 'e0', b: 'e3', info: { matchNo: 1, posA: 2, posB: 1, flip: true } }] });
  assert.equal(S.itemResult({ pos: 'rr:gA:e0|e3', op: 'score', la: 1, lb: 3 }), '3–1', 'Abu (named first) won 3-1');
});

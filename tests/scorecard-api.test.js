const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { createFakePlayerDb } = require('./lib/fake-player-db');
const { callHandler } = require('./lib/call-handler');

// The scorecard's numbers (scoring_app/api/_lib/scorecard.js through the games router): GET scorecard, POST notices-read.
const dbPath = require.resolve('../scoring_app/api/_lib/db');
let db;
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { sql: (...a) => db.sql(...a) } };

const router = require('../scoring_app/api/games/[action].js');
const session = require('../scoring_app/api/_lib/session');
const S = require('../scoring_app/scoring-model.js');
const { gameStats } = require('../player-stats.js');

const DAY = 24 * 60 * 60 * 1000;
let savedSecret;
const ME = { id: '11111111-1111-4111-8111-111111111111', email: 'ana@example.com', first_name: 'Ana', last_name: 'Lee', password_hash: 'x',
  email_verified_at: new Date(Date.now() - DAY), must_change_password: false, token_version: 0 };
const OTHER = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  savedSecret = process.env.PLAYER_SESSION_SECRET;
  process.env.PLAYER_SESSION_SECRET = 'test-secret-for-scorecard';
  process.env.PLAYER_ACCOUNTS = 'on';
  db = createFakePlayerDb({ player_accounts: [ME] });
});
afterEach(() => { if (savedSecret === undefined) delete process.env.PLAYER_SESSION_SECRET; else process.env.PLAYER_SESSION_SECRET = savedSecret; });

const card = (query) => callHandler(router, { method: 'GET', url: '/api/games/scorecard', query: query || {}, cookies: { [session.COOKIE_NAME]: session.signPlayer(ME) } });
const noBadNumbers = (body) => assert.ok(!/NaN|Infinity/.test(JSON.stringify(body)), 'no NaN / Infinity: ' + JSON.stringify(body));

// Real 501 stats from a real game (avg3 = 501 / 12 * 3 = 125.25), and scaled copies with other averages.
const x01 = (() => {
  const m = S.create({ format: S.formatFor({ game: '501', bestOf: 1 }), names: { a: 'Ana', b: 'Bo' } });
  m.bull('a');
  m.total(180); m.total(0); m.total(180); m.total(0); m.total(0); m.total(0); m.total(141); m.finishDart(3);
  return { format: m.format(), stats: gameStats(m.format(), { a: ['Ana'], b: ['Bo'] }, m.events(), 'Ana') };
})();
const withPoints = (points) => { const s = JSON.parse(JSON.stringify(x01.stats)); s.x01.points = points; return s; };   // avg3 = points / 4
const cricketStats = (marks, darts) => ({ won: true, x01: null, cricket: { darts, marks, f9darts: 9, f9marks: 9, rounds5: 1, rounds9: 0, hatTricks: 0,
  whiteHorses: 0, bulls: 0, bestLegDarts: darts, legsPlayed: 1, legsWon: 1 } });
const CRICKET = { game: 'cricket', bestOf: 1, bullFirst: 'first', decider: 'alternate' };

function addGame(daysAgo, stats, opts) {
  opts = opts || {};
  stats = Object.assign({}, stats, { won: opts.won !== false });   // a saved row's stats.won always matches its won
  const id = crypto.randomUUID();
  const at = new Date(Date.now() - daysAgo * DAY);
  db.rows.casual_games.push({ id, recorded_by: ME.id, format: opts.format || x01.format, events: [], winner: 'a', played_at: at,
    side_a: { name: 'Ana Lee', player_id: ME.id }, side_b: { name: opts.opp || 'Bo', nickname: '', guest: true } });
  db.rows.player_games.push({ game_id: id, player_id: ME.id, side: 'a', status: opts.status || 'saved', kind: opts.kind || 'casual',
    stats, won: opts.won !== false, played_at: at });
  return id;
}

test('no games: all nulls, empty arrays, no NaN', async () => {
  for (const period of ['30d', 'year', 'all']) {
    const r = await card({ period });
    assert.equal(r.statusCode, 200);
    const b = r.body;
    noBadNumbers(b);
    assert.deepEqual(b.headline, { x01: { avg3: null, trend: null }, cricket: { mpr: null, trend: null } });
    assert.deepEqual(b.chart, { x01: [], cricket: [] });
    assert.strictEqual(b.breakdown.x01.avg3, null);
    assert.strictEqual(b.breakdown.x01.first9, null);
    assert.strictEqual(b.breakdown.x01.checkoutPct, null);
    assert.strictEqual(b.breakdown.cricket.mpr, null);
    assert.deepEqual(b.summary.casual, { played: 0, wonPct: null, favouriteGame: null, mostPlayedWith: null });
    assert.deepEqual(b.summary.tournament, { events: 0, titles: 0, bestFinish: null, latest: null });
    assert.deepEqual(b.recent, []);
    assert.deepEqual(b.notices, []);
  }
});

test('filter casual excludes nothing in phase 1, tournament is empty', async () => {
  addGame(2, x01.stats);
  addGame(3, cricketStats(30, 30), { format: CRICKET, kind: 'venue', opp: 'Cy' });
  const all = (await card({ filter: 'all', period: 'all' })).body;
  const casual = (await card({ filter: 'casual', period: 'all' })).body;
  assert.deepEqual(casual, all);
  assert.equal(casual.summary.casual.played, 2);
  const t = await card({ filter: 'tournament', period: 'all' });
  assert.equal(t.statusCode, 200);
  noBadNumbers(t.body);
  assert.deepEqual(t.body.headline, { x01: { avg3: null, trend: null }, cricket: { mpr: null, trend: null } });
  assert.deepEqual(t.body.chart, { x01: [], cricket: [] });
  assert.deepEqual(t.body.recent, []);
  assert.equal(t.body.summary.casual.played, 0);
});

test('trend compares with the previous 30 days', async () => {
  addGame(2, withPoints(480));    // avg 120
  addGame(5, withPoints(440));    // avg 110   -> this period: 920 / 8 * 3 = 115
  addGame(40, withPoints(400));   // avg 100   -> previous 30 days: 100
  addGame(400, withPoints(200));  // far older: in neither window
  const r = (await card({ period: '30d' })).body;
  assert.equal(r.headline.x01.avg3, 115);
  assert.equal(r.headline.x01.trend, 15);
  assert.equal(r.summary.casual.played, 2);
  const all = (await card({ period: 'all' })).body;
  assert.equal(all.headline.x01.trend, null, 'no trend for all time');
  assert.equal(all.summary.casual.played, 4);
  // nothing in the previous window: no trend either
  db.rows.player_games = db.rows.player_games.filter((p) => new Date(p.played_at).getTime() > Date.now() - 30 * DAY);
  assert.equal((await card({ period: '30d' })).body.headline.x01.trend, null);
});

test('cricket and 01 never mixed in headline', async () => {
  addGame(1, x01.stats);                                           // 125.25 avg
  addGame(2, cricketStats(20, 15), { format: CRICKET });           // 4.00 mpr
  const choiceStats = JSON.parse(JSON.stringify(x01.stats));
  choiceStats.cricket = cricketStats(10, 15).cricket;              // a Choice game: both kinds of leg
  addGame(3, choiceStats, { format: { game: 'mixed', start: 501, inRule: 'SI', pattern: ['x01', 'cricket'], bestOf: 3, bullFirst: 'first', decider: 'choice' } });
  const r = (await card({ period: '30d' })).body;
  noBadNumbers(r);
  assert.equal(r.headline.x01.avg3, 125.25, 'only 01 darts and points');
  assert.equal(r.headline.cricket.mpr, 3, '30 marks over 30 cricket darts');
  assert.equal(r.chart.x01.length, 2);
  assert.equal(r.chart.cricket.length, 2);
  assert.ok(r.chart.x01.every((p) => p.value === 125.25));
  assert.deepEqual(r.chart.cricket.map((p) => p.value), [2, 4], 'oldest first');
});

test('the chart follows the selected period (ledger ruling), oldest first, at most 20 games', async () => {
  addGame(40, withPoints(400));
  addGame(2, withPoints(480));
  assert.equal((await card({ period: '30d' })).body.chart.x01.length, 1);
  const all = (await card({ period: 'all' })).body.chart.x01;
  assert.deepEqual(all.map((p) => p.value), [100, 120]);
  assert.deepEqual(Object.keys(all[0]).sort(), ['at', 'gameId', 'kind', 'value']);
  for (let i = 0; i < 25; i++) addGame(3 + i / 100, x01.stats);
  assert.equal((await card({ period: '30d' })).body.chart.x01.length, 20);
});

test('held games do not count anywhere', async () => {
  addGame(1, x01.stats, { status: 'held' });
  const r = (await card({ period: 'all' })).body;
  assert.equal(r.summary.casual.played, 0);
  assert.equal(r.headline.x01.avg3, null);
  assert.deepEqual(r.recent, []);
});

test('casual summary: played, won %, favourite game and most played with', async () => {
  addGame(1, x01.stats, { opp: 'Bo' });
  addGame(2, x01.stats, { opp: 'bo', won: false });
  addGame(3, cricketStats(30, 30), { format: CRICKET, opp: 'Cy' });
  const r = (await card({ period: '30d' })).body;
  assert.deepEqual(r.summary.casual, { played: 3, wonPct: 66.67, favouriteGame: '501', mostPlayedWith: { name: 'Bo', games: 2 } });
  assert.equal(r.recent.length, 3);
  assert.equal(r.recent[0].opponent.name, 'Bo');
});

test('bad filter or period → 400', async () => {
  assert.equal((await card({ filter: 'bogus' })).body.code, 'bad_filter');
  assert.equal((await card({ period: 'week' })).body.code, 'bad_period');
});

test('notices: unread ones, newest first; notices-read marks only the caller\'s own', async () => {
  const n = (id, player, kind, ago) => ({ id, player_id: player, kind, data: { by: 'Bo' }, created_at: new Date(Date.now() - ago), read_at: null });
  const id1 = crypto.randomUUID(), id2 = crypto.randomUUID(), id3 = crypto.randomUUID();
  db.rows.player_notices.push(n(id1, ME.id, 'casual_game', 3600e3), n(id2, ME.id, 'friend_accepted', 60e3), n(id3, OTHER, 'casual_game', 0));
  const r = (await card()).body;
  assert.deepEqual(r.notices.map((x) => [x.id, x.kind]), [[id2, 'friend_accepted'], [id1, 'casual_game']]);
  const read = await callHandler(router, { method: 'POST', url: '/api/games/notices-read', body: { ids: [id1, id3, 'junk'] },
    cookies: { [session.COOKIE_NAME]: session.signPlayer(ME) } });
  assert.deepEqual(read.body, { ok: true });
  assert.ok(db.rows.player_notices.find((x) => x.id === id1).read_at);
  assert.equal(db.rows.player_notices.find((x) => x.id === id3).read_at, null, 'another player\'s notice is untouched');
  assert.deepEqual((await card()).body.notices.map((x) => x.id), [id2]);
  const bad = await callHandler(router, { method: 'POST', url: '/api/games/notices-read', body: { ids: 'x' },
    cookies: { [session.COOKIE_NAME]: session.signPlayer(ME) } });
  assert.equal(bad.statusCode, 400);
});

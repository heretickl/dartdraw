// The numbers on a player's scorecard (spec docs/superpowers/specs/2026-11-04-accounts-scorecard-venue-design.md): the
// saved games added up with player-stats.js addUp, for a filter (all / tournament / casual) and a period (30 days /
// this year / all time). Only rows with status 'saved' count - a game held for a friend request is not theirs yet.
const { sql } = require('./db');
const { addUp } = require('../../player-stats.js');
const { listItem, opponentOf, gameName, round2, ID_RE } = require('./games');

const FILTERS = ['all', 'tournament', 'casual'];
const PERIODS = ['30d', 'year', 'all'];
const DAY_MS = 24 * 60 * 60 * 1000;
const CHART_GAMES = 20;
const RECENT_GAMES = 5;
const MAX_NOTICES = 20;
const MAX_READ_IDS = 100;

function fail(status, code, error) { return { status, code, error }; }

// Venue games count as casual (spec call 3); tournament games are another branch and never come from casual_games.
function kindMatches(filter, kind) {
  if (filter === 'all') return true;
  if (filter === 'casual') return kind === 'casual' || kind === 'venue';
  return kind === 'tournament';
}

// [from, to) of the period and of the one before it, in ms; null for 'all' (no previous period, no trend).
function windows(period, now) {
  if (period === '30d') return { cur: [now - 30 * DAY_MS, Infinity], prev: [now - 60 * DAY_MS, now - 30 * DAY_MS] };
  if (period === 'year') {
    const d = new Date(now), y = d.getUTCFullYear();
    const start = Date.UTC(y, 0, 1);
    // Same span of the previous year: 1 January to this day and time a year back.
    const prevEnd = Date.UTC(y - 1, d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds());
    return { cur: [start, Infinity], prev: [Date.UTC(y - 1, 0, 1), prevEnd] };
  }
  return { cur: [-Infinity, Infinity], prev: null };
}

function within(r, w) { const t = new Date(r.played_at).getTime(); return t >= w[0] && t < w[1]; }

// The 3-dart average and the marks per round of a set of games; null when none of that game was thrown.
function headlines(rows) {
  const t = addUp(rows.map(function (r) { return r.stats; }));
  return {
    avg3: t.x01.darts ? round2(t.x01.avg3) : null,
    mpr: t.cricket.darts ? round2(t.cricket.mpr) : null
  };
}

function diff(a, b) { return a === null || b === null ? null : round2(a - b); }

function breakdown(t) {
  const x = Object.assign({}, t.x01), c = Object.assign({}, t.cricket);
  ['avg3', 'first9', 'checkoutPct'].forEach(function (k) { x[k] = round2(x[k]); });
  ['mpr', 'f9mpr'].forEach(function (k) { c[k] = round2(c[k]); });
  return { x01: x, cricket: c };
}

// One chart point per game that has that game type's darts: its own 3-dart average (01) or marks per round (cricket).
function chartOf(rows, type) {
  const pts = [];
  rows.forEach(function (r) {
    const s = r.stats && r.stats[type];
    if (!s || !s.darts) return;
    const v = type === 'x01' ? s.points / s.darts * 3 : s.marks / s.darts * 3;
    if (!isFinite(v)) return;
    pts.push({ gameId: r.game_id, at: new Date(r.played_at).toISOString(), value: round2(v), kind: r.kind });
  });
  return pts.slice(-CHART_GAMES);
}

// Casual numbers: games played and won, the game played most (ties go to the one played last) and the opponent met most.
function casualSummary(rows) {
  const t = addUp(rows.map(function (r) { return r.stats; }));   // rows are newest first
  const games = {}, who = {};
  rows.forEach(function (r) {
    const g = gameName(r.format);
    if (!games[g]) games[g] = { n: 0, at: 0 };
    games[g].n++; games[g].at = Math.max(games[g].at, new Date(r.played_at).getTime());
    const name = opponentOf(r, r.side).name;
    if (name) {
      const k = name.toLowerCase();
      if (!who[k]) who[k] = { name, n: 0, at: 0 };
      who[k].n++; who[k].at = Math.max(who[k].at, new Date(r.played_at).getTime());
    }
  });
  function top(map) {
    let best = null;
    Object.keys(map).forEach(function (k) { const e = map[k]; if (!best || e.n > best.n || (e.n === best.n && e.at > best.at)) best = Object.assign({ key: k }, e); });
    return best;
  }
  const fav = top(games), mp = top(who);
  return { played: t.played, wonPct: t.played ? round2(t.wonPct) : null, favouriteGame: fav ? fav.key : null, mostPlayedWith: mp ? { name: mp.name, games: mp.n } : null };
}

/* GET /api/games/scorecard?filter=&period=. Returns { status, body } (or { status, code, error }). */
async function scorecard(me, query, now) {
  query = query || {};
  const filter = query.filter === undefined || query.filter === '' ? 'all' : query.filter;
  const period = query.period === undefined || query.period === '' ? '30d' : query.period;
  if (typeof filter !== 'string' || FILTERS.indexOf(filter) < 0) return fail(400, 'bad_filter', 'That filter is not one we have.');
  if (typeof period !== 'string' || PERIODS.indexOf(period) < 0) return fail(400, 'bad_period', 'That period is not one we have.');

  // Every saved game of the caller, newest first; the filter and the period are applied below. A game with no
  // casual_games row (a venue game, later) still counts for the numbers, with no opponent or game name to show.
  const all = await sql`
    SELECT pg.game_id, pg.kind, pg.stats, pg.won, pg.played_at, pg.side, g.id, g.format, g.side_a, g.side_b
    FROM player_games pg LEFT JOIN casual_games g ON g.id = pg.game_id
    WHERE pg.player_id = ${me.id} AND pg.status = 'saved'
    ORDER BY pg.played_at DESC, pg.game_id DESC
  `;
  const kept = all.filter(function (r) { return kindMatches(filter, r.kind); });
  const w = windows(period, now);
  const cur = kept.filter(function (r) { return within(r, w.cur); });
  const prev = w.prev ? kept.filter(function (r) { return within(r, w.prev); }) : null;

  const h = headlines(cur), hp = prev ? headlines(prev) : { avg3: null, mpr: null };
  const oldestFirst = cur.slice().reverse();

  const noticeRows = await sql`
    SELECT id, kind, data, created_at FROM player_notices
    WHERE player_id = ${me.id} AND read_at IS NULL
    ORDER BY created_at DESC LIMIT ${MAX_NOTICES}
  `;

  return {
    status: 200,
    body: {
      headline: {
        x01: { avg3: h.avg3, trend: prev ? diff(h.avg3, hp.avg3) : null },
        cricket: { mpr: h.mpr, trend: prev ? diff(h.mpr, hp.mpr) : null }
      },
      chart: { x01: chartOf(oldestFirst, 'x01'), cricket: chartOf(oldestFirst, 'cricket') },
      breakdown: breakdown(addUp(cur.map(function (r) { return r.stats; }))),
      summary: {
        tournament: { events: 0, titles: 0, bestFinish: null, latest: null },
        casual: casualSummary(cur.filter(function (r) { return r.kind === 'casual' || r.kind === 'venue'; }))
      },
      recent: kept.filter(function (r) { return r.id; }).slice(0, RECENT_GAMES).map(listItem),
      notices: noticeRows.map(function (n) { return { id: n.id, kind: n.kind, data: n.data || {}, createdAt: new Date(n.created_at).toISOString() }; })
    }
  };
}

/* POST /api/games/notices-read { ids }: marks the caller's own unread notices read. Ids that are not the caller's (or
   not ids at all) are ignored, so nothing here says whether someone else's notice exists. */
async function markNoticesRead(me, body) {
  const ids = body && Array.isArray(body.ids) ? body.ids : null;
  if (!ids || ids.length > MAX_READ_IDS) return fail(400, 'bad_ids', 'Those notices could not be read.');
  const mine = ids.filter(function (id) { return typeof id === 'string' && ID_RE.test(id); });
  if (mine.length) {
    await sql`UPDATE player_notices SET read_at = now() WHERE player_id = ${me.id} AND read_at IS NULL AND id = ANY(${mine}::uuid[])`;
  }
  return { status: 200, body: { ok: true } };
}

module.exports = { scorecard, markNoticesRead };

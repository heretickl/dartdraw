// Builds the read-only copy of a tournament that the public results viewer
// is allowed to see. This is an allow-list: only the fields named here are
// copied, so anything added to a tournament later (notes, incidents,
// rosters, check-in, contact details...) stays private until it is
// deliberately added below.

const SLUG_RE = /^[a-z0-9]{8,40}$/;

// ---- Live scoring (spec section 13, D13, D17) ----
// A Live event (format.scoring.mode === 'live') may publish more than a Manual one. Everything below is gated on that, so a Manual
// event's public copy stays exactly what it was. Which live facts ship:
//   always (Live events):  live: { state, legs, remaining, thrower, last, board, playedOn } on a match that has a live row
//   switch on (format.scoring.publicStats === true): live.tot and, on results, x01 and by 'dev'
//   '3-dart average' among the tie-break rules: on GROUP results, by 'dev' and x01 (the standings need them), and nothing else
// When neither holds, no x01, by, tot, avg, 180, checkout or mpr key appears anywhere in the public copy.
const AVG_RULE = '3-dart average';
const LIVE_STATES = ['playing', 'awaitingConfirm', 'confirmed', 'retired'];
const MAX_LIVE_ROWS = 5000, MAX_LAST = 6;

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const wholeIn = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.trunc(v))) : null);
const sideOf = (v) => (v === 'a' || v === 'b' ? v : null);
const pairIn = (v, lo, hi) => {
  if (!Array.isArray(v) || v.length !== 2) return null;
  const a = wholeIn(v[0], lo, hi), b = wholeIn(v[1], lo, hi);
  return a === null || b === null ? null : [a, b];
};
// { a:{s,d}, b:{s,d} }: x01 points (s) and darts (d) of each side; whole numbers, or null when it is not that shape.
function cleanX01(v) {
  if (!isObj(v) || !isObj(v.a) || !isObj(v.b)) return null;
  const as = wholeIn(v.a.s, 0, 99999), ad = wholeIn(v.a.d, 0, 9999), bs = wholeIn(v.b.s, 0, 99999), bd = wholeIn(v.b.d, 0, 9999);
  return [as, ad, bs, bd].some((n) => n === null) ? null : { a: { s: as, d: ad }, b: { s: bs, d: bd } };
}
// What a visitor may be told about a live match, rebuilt from a live_public row field by field (the row's own text is never copied).
// Returns null for a row that is not one of the public states. stats: the Live event's stats switch (adds tot).
function cleanLive(row, stats) {
  if (!isObj(row) || LIVE_STATES.indexOf(row.state) === -1) return null;
  const sm = isObj(row.summary) ? row.summary : {};
  const out = {
    state: row.state,
    legs: pairIn(sm.legs, 0, 99) || [0, 0],
    remaining: pairIn(sm.remaining, 0, 1001),
    thrower: sideOf(sm.thrower),
    last: [],
    board: wholeIn(row.board, 1, 9999),
    playedOn: wholeIn(row.played_on_board, 1, 9999),
  };
  if (Array.isArray(sm.last)) {
    sm.last.slice(-MAX_LAST).forEach((t) => {
      if (!isObj(t)) return;
      const leg = wholeIn(t.leg, 1, 99), side = sideOf(t.side), score = wholeIn(t.score, 0, 999);
      if (leg === null || side === null || score === null) return;
      out.last.push({ leg, side, score, left: t.left === null || t.left === undefined ? null : wholeIn(t.left, 0, 1001) });
    });
  }
  if (stats) { const tot = cleanX01(sm.tot); if (tot) out.tot = tot; }
  return out;
}
// The live rows of one event, by match position (pos), already cleaned. Anything else in `rows` is ignored.
function liveByPos(rows, stats) {
  const map = Object.create(null);
  if (!Array.isArray(rows)) return map;
  rows.slice(0, MAX_LIVE_ROWS).forEach((r) => {
    if (!isObj(r) || typeof r.pos !== 'string' || r.pos.length > 200) return;
    const live = cleanLive(r, stats);
    if (live) map[r.pos] = live;
  });
  return map;
}
// Does the event score live? (format.scoring.mode, read from the stored copy the way live-settings.js does.)
function isLiveEvent(data) {
  const f = data && typeof data === 'object' ? data.format : null;
  return isObj(f) && isObj(f.scoring) && f.scoring.mode === 'live';
}
// What the event's scoring settings allow. Everything is off for a Manual event.
function liveContext(d, rows) {
  if (!isLiveEvent(d)) return { live: false, stats: false, avg: false, hints: false, rows: Object.create(null) };
  const sc = d.format.scoring;
  const stats = sc.publicStats === true;
  return {
    live: true, stats, hints: sc.checkoutHints === true,
    avg: Array.isArray(d.tieBreakOrder) && d.tieBreakOrder.indexOf(AVG_RULE) !== -1,
    rows: liveByPos(rows, stats),
  };
}
// A result's device stamps for the public copy: by 'dev' (never any other value) and x01.
function resultStamps(r) {
  const out = {};
  if (!isObj(r)) return out;
  if (r.by === 'dev') out.by = 'dev';
  const x01 = cleanX01(r.x01);
  if (x01) out.x01 = x01;
  return out;
}

function pick(obj, keys) {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  keys.forEach((k) => { if (obj[k] !== undefined) out[k] = obj[k]; });
  return out;
}

// ctx (Live events only): see liveContext. pos: the match's place, to find its live row.
function publicMatch(m, ctx, pos) {
  const out = pick(m, ['id', 'aEntryId', 'bEntryId', 'aLegs', 'bLegs', 'winnerId', 'bye', 'wo', 'aFromPod', 'bFromPod', 'called', 'board', 'void']);
  if (out.called) out.called = true; else delete out.called;
  if (out.void) out.void = true; else delete out.void;     // neither player attended: true or omitted
  const board = parseInt(out.board, 10);
  if (board >= 1 && board <= 9999) out.board = board; else delete out.board;
  if (ctx && ctx.live) {
    if (ctx.stats) Object.assign(out, resultStamps(m));
    if (ctx.rows[pos]) out.live = ctx.rows[pos];
  }
  return out;
}

// bracketKey: where the bracket sits (knockout, knockoutLosers or pod:<id>); with ctx it names each match's live row (ko:<key>:<round>:<match>).
function publicBracket(b, ctx, bracketKey) {
  if (!b || !Array.isArray(b.rounds)) return null;
  return {
    ...pick(b, ['id', 'label', 'size', 'seeds', 'seedLabels', 'podLabel', 'podFinals']),
    rounds: b.rounds.map((round, ri) => round.map((m, mi) => publicMatch(m, ctx, 'ko:' + bracketKey + ':' + ri + ':' + mi))),
  };
}

function publicScores(scores, ctx) {
  const out = {};
  if (!scores || typeof scores !== 'object') return out;
  // by 'dev' and x01 on a group result: with the stats switch, or when the 3-dart average rule is in the tie-break order
  const ship = !!(ctx && ctx.live && (ctx.stats || ctx.avg));
  Object.keys(scores).forEach((k) => {
    out[k] = pick(scores[k], ['legs1', 'legs2', 'wo']);
    if (ship) Object.assign(out[k], resultStamps(scores[k]));
  });
  return out;
}

// A round robin match has no result yet while it is on a board, so its live picture hangs off the group, by the key of the pair
// (the scores key: the two entry ids, the smaller first). Side a of such a match is the first id of the key.
function groupLive(g, ctx) {
  const out = {};
  if (!ctx || !ctx.live) return out;
  const prefix = 'rr:' + g.id + ':';
  Object.keys(ctx.rows).forEach((pos) => { if (pos.indexOf(prefix) === 0) out[pos.slice(prefix.length)] = ctx.rows[pos]; });
  return out;
}

function publicGroup(g, ctx) {
  const out = {
    ...pick(g, ['id', 'label', 'entryIds', 'boards', 'confirmed', 'gameStarted', 'positionOverrides']),
    scores: publicScores(g.scores, ctx),
  };
  const live = groupLive(g, ctx);
  if (Object.keys(live).length) out.live = live;
  return out;
}

// A Group Boards group (shown to spectators as "Group N"): who is in it, its boards, and its bracket.
function publicPod(p, ctx) {
  return {
    ...pick(p, ['id', 'label', 'boards', 'entryIds', 'winnerId']),
    bracket: publicBracket(p.bracket, ctx, 'pod:' + p.id),
  };
}

// The board plan is rebuilt field by field, so only values of the expected kinds are published.
const PLAN_STATUS = ['done', 'up', 'next', 'later'];
function publicBoardPlan(bp) {
  if (!bp || typeof bp !== 'object' || !bp.boards || typeof bp.boards !== 'object') return undefined;
  const boards = {};
  Object.keys(bp.boards).forEach((b) => {
    if (!/^\d{1,4}$/.test(b) || !Array.isArray(bp.boards[b])) return;
    boards[b] = bp.boards[b].filter((e) => e && typeof e === 'object').map((e) => ({
      key: typeof e.key === 'string' && /^(ko|pod:[A-Za-z0-9_-]+)$/.test(e.key) ? e.key : '',
      ri: parseInt(e.ri, 10) || 0,
      mi: parseInt(e.mi, 10) || 0,
      status: PLAN_STATUS.indexOf(e.status) !== -1 ? e.status : 'later',
      ready: !!e.ready,
      estMs: typeof e.estMs === 'number' && isFinite(e.estMs) ? e.estMs : null,
      called: !!e.called,
    }));
  });
  return { v: 1, hasTimes: !!bp.hasTimes, boards };
}

// When the organiser finalized the event (data.finalized.at). Only a string of a sane length that parses to a real
// date counts; anything else (true, {}, a number, junk text) is "not finalized" and never shows Final results.
// Returns the string itself, or null. Nothing else from `finalized` is ever read.
function validFinalizedAt(data) {
  const f = data && typeof data === 'object' ? data.finalized : null;
  const at = f && typeof f === 'object' ? f.at : null;
  return typeof at === 'string' && at.length > 0 && at.length <= 40 && isFinite(Date.parse(at)) ? at : null;
}

// What the page header needs to describe a Teams match, and nothing else about the segments (no types, scores, legs or
// rosters): how many main segments a match has, and whether the tie-breaker segment is used in round robin matches and in
// knockout matches (Group Boards and the Plate pool follow the knockout tick). Only Teams events get these three, and each
// is rebuilt as a whole number (1 to 50, like the sanitizer keeps) or a real true/false. A tie-breaker saved with the older
// single `enabled` tick counts for both stages, as in the app. No usable segment list: nothing is published.
const isPlain = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
function publicTeamMatch(d) {
  const ec = d.eventCreation, f = d.format;
  if (!isPlain(ec) || ec.competitionUnit !== 'Teams' || !isPlain(f) || !Array.isArray(f.teamSegments)) return {};
  const count = Math.min(f.teamSegments.filter(isPlain).length, 50);
  if (count < 1) return {};
  const tb = isPlain(f.teamTieBreaker) ? f.teamTieBreaker : null;
  const legacy = !!tb && !('inRoundRobin' in tb) && !('inKnockout' in tb);
  const on = (k) => !!tb && (legacy ? tb.enabled === true : tb[k] === true);
  return { segmentCount: count, segmentTieBreakerRR: on('inRoundRobin'), segmentTieBreakerKO: on('inKnockout') };
}

// liveRows: the event's rows of the live_public view (see sql/live.sql), or nothing. They count for a Live event only.
function toPublicView(data, liveRows) {
  const d = data || {};
  const ctx = liveContext(d, liveRows);
  const finalizedAt = validFinalizedAt(d);
  // Groups belong to the Group Boards format only; a plain bracket left over from another format is not its Finals.
  const isGroupBoards = !!(d.format && d.format.formatType === 'podknockout');
  return {
    eventCreation: pick(d.eventCreation, ['tournamentName', 'eventName', 'eventType', 'competitionUnit', 'date']),
    format: { ...pick(d.format, ['formatType', 'bestOfLegs', 'qualifiersPerGroup', 'plateQualifiersPerGroup',
      'losersPool', 'advanceMode', 'knockoutLegs', 'seedingEnabled', 'numSeeds', 'podCount', 'podLegs']), ...publicTeamMatch(d) },
    tieBreakOrder: Array.isArray(d.tieBreakOrder) ? d.tieBreakOrder.slice() : undefined,
    entriesList: (d.entriesList || []).map((e) => pick(e, ['id', 'name', 'org', 'withdrawn'])),
    groups: (d.groups || []).filter((g) => g && g.confirmed).map((g) => publicGroup(g, ctx)),
    pods: isGroupBoards ? (d.pods || []).filter((p) => p && p.confirmed && p.bracket).map((p) => publicPod(p, ctx)) : [],
    boardPlan: isGroupBoards ? publicBoardPlan(d.boardPlan) : undefined,
    knockout: publicBracket(isGroupBoards && d.knockout && !d.knockout.podFinals ? null : d.knockout, ctx, 'knockout'),
    knockoutLosers: publicBracket(d.knockoutLosers, ctx, 'knockoutLosers'),
    ...(finalizedAt ? { finalizedAt } : {}),
    // the settings the viewer's page needs to know about, and no other (Live events only)
    ...(ctx.live ? { scoring: { live: true, stats: ctx.stats, hints: ctx.hints } } : {}),
  };
}

module.exports = { toPublicView, validFinalizedAt, isLiveEvent, SLUG_RE };

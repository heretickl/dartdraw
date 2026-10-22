// Builds the read-only copy of a tournament that the public results viewer
// is allowed to see. This is an allow-list: only the fields named here are
// copied, so anything added to a tournament later (notes, incidents,
// rosters, check-in, contact details...) stays private until it is
// deliberately added below.

const SLUG_RE = /^[a-z0-9]{8,40}$/;

function pick(obj, keys) {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  keys.forEach((k) => { if (obj[k] !== undefined) out[k] = obj[k]; });
  return out;
}

function publicMatch(m) {
  const out = pick(m, ['id', 'aEntryId', 'bEntryId', 'aLegs', 'bLegs', 'winnerId', 'bye', 'wo', 'aFromPod', 'bFromPod', 'called', 'board', 'void']);
  if (out.called) out.called = true; else delete out.called;
  if (out.void) out.void = true; else delete out.void;     // neither player attended: true or omitted
  const board = parseInt(out.board, 10);
  if (board >= 1 && board <= 9999) out.board = board; else delete out.board;
  return out;
}

function publicBracket(b) {
  if (!b || !Array.isArray(b.rounds)) return null;
  return {
    ...pick(b, ['id', 'label', 'size', 'seeds', 'seedLabels', 'podLabel', 'podFinals']),
    rounds: b.rounds.map((round) => round.map(publicMatch)),
  };
}

function publicScores(scores) {
  const out = {};
  if (!scores || typeof scores !== 'object') return out;
  Object.keys(scores).forEach((k) => { out[k] = pick(scores[k], ['legs1', 'legs2', 'wo']); });
  return out;
}

function publicGroup(g) {
  return {
    ...pick(g, ['id', 'label', 'entryIds', 'boards', 'confirmed', 'gameStarted', 'positionOverrides']),
    scores: publicScores(g.scores),
  };
}

// A Group Boards group (shown to spectators as "Group N"): who is in it, its boards, and its bracket.
function publicPod(p) {
  return {
    ...pick(p, ['id', 'label', 'boards', 'entryIds', 'winnerId']),
    bracket: publicBracket(p.bracket),
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

function toPublicView(data) {
  const d = data || {};
  const finalizedAt = validFinalizedAt(d);
  // Groups belong to the Group Boards format only; a plain bracket left over from another format is not its Finals.
  const isGroupBoards = !!(d.format && d.format.formatType === 'podknockout');
  return {
    eventCreation: pick(d.eventCreation, ['tournamentName', 'eventName', 'eventType', 'competitionUnit', 'date']),
    format: { ...pick(d.format, ['formatType', 'bestOfLegs', 'qualifiersPerGroup', 'plateQualifiersPerGroup',
      'losersPool', 'advanceMode', 'knockoutLegs', 'seedingEnabled', 'numSeeds', 'podCount', 'podLegs']), ...publicTeamMatch(d) },
    tieBreakOrder: Array.isArray(d.tieBreakOrder) ? d.tieBreakOrder.slice() : undefined,
    entriesList: (d.entriesList || []).map((e) => pick(e, ['id', 'name', 'org', 'withdrawn'])),
    groups: (d.groups || []).filter((g) => g && g.confirmed).map(publicGroup),
    pods: isGroupBoards ? (d.pods || []).filter((p) => p && p.confirmed && p.bracket).map(publicPod) : [],
    boardPlan: isGroupBoards ? publicBoardPlan(d.boardPlan) : undefined,
    knockout: publicBracket(isGroupBoards && d.knockout && !d.knockout.podFinals ? null : d.knockout),
    knockoutLosers: publicBracket(d.knockoutLosers),
    ...(finalizedAt ? { finalizedAt } : {}),
  };
}

module.exports = { toPublicView, validFinalizedAt, SLUG_RE };

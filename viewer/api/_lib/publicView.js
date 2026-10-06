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
  return pick(m, ['id', 'aEntryId', 'bEntryId', 'aLegs', 'bLegs', 'winnerId', 'bye', 'wo', 'aFromPod', 'bFromPod']);
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

function toPublicView(data) {
  const d = data || {};
  // Groups belong to the Group Boards format only; a plain bracket left over from another format is not its Finals.
  const isGroupBoards = !!(d.format && d.format.formatType === 'podknockout');
  return {
    eventCreation: pick(d.eventCreation, ['tournamentName', 'eventName', 'eventType', 'competitionUnit', 'date']),
    format: pick(d.format, ['formatType', 'bestOfLegs', 'qualifiersPerGroup', 'plateQualifiersPerGroup',
      'losersPool', 'advanceMode', 'knockoutLegs', 'seedingEnabled', 'numSeeds', 'podCount', 'podLegs']),
    tieBreakOrder: Array.isArray(d.tieBreakOrder) ? d.tieBreakOrder.slice() : undefined,
    entriesList: (d.entriesList || []).map((e) => pick(e, ['id', 'name', 'org', 'withdrawn'])),
    groups: (d.groups || []).filter((g) => g && g.confirmed).map(publicGroup),
    pods: isGroupBoards ? (d.pods || []).filter((p) => p && p.confirmed && p.bracket).map(publicPod) : [],
    knockout: publicBracket(isGroupBoards && d.knockout && !d.knockout.podFinals ? null : d.knockout),
    knockoutLosers: publicBracket(d.knockoutLosers),
  };
}

module.exports = { toPublicView, SLUG_RE };

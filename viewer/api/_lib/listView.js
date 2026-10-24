// Pure logic for the public event list: which events are live, upcoming or finished, and the small allow-listed
// summary of each. No database, no DOM. The endpoint (api/events.js) feeds it rows of the public_tournaments view.
// Only the fields copied in describe() ever leave this file; anything added to a tournament later stays private.
// Codes and numbers only, never words: the page turns them into English or BM (viewer/i18n/*.js, home.js). The only text
// sent is the organiser's own (event, tournament and winner names).

const cfg = require('./listConfig');
const { SLUG_RE, validFinalizedAt } = require('./publicView');

const DAY = 86400000, HOUR = 3600000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/, TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const FORMATS = ['roundrobin', 'knockout', 'rrknockout', 'podknockout'];
const UNITS = ['Singles', 'Doubles', 'Triples', 'Teams'];

const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

// ---- brackets ----
function roundsOf(b) { return b && Array.isArray(b.rounds) ? b.rounds.filter(Array.isArray) : []; }
const isReal = (m) => !!m && !m.bye && !m.void;
function champion(b) {
  const r = roundsOf(b);
  if (!r.length) return null;
  const last = r[r.length - 1], m = last[0];
  return last.length === 1 && m && m.winnerId && !m.void ? m.winnerId : null;
}
function voidFinal(b) {
  const r = roundsOf(b);
  if (!r.length) return false;
  const m = r[r.length - 1][0];
  return !!(m && m.void);
}
const finished = (b) => !!(champion(b) || voidFinal(b));
const started = (b) => roundsOf(b).some((round) => round.some((m) => m && ((m.winnerId && !m.bye) || m.void)));
function counts(b) {
  let done = 0, total = 0;
  roundsOf(b).forEach((round) => round.forEach((m) => { if (isReal(m)) { total++; if (m.winnerId) done++; } }));
  return { done, total };
}
// The round as a code: final | semifinals | quarterfinals | r<N> (the round of N).
function roundCode(b, idx) {
  const r = roundsOf(b), fromEnd = r.length - idx;
  if (fromEnd === 1) return 'final';
  if (fromEnd === 2) return 'semifinals';
  if (fromEnd === 3) return 'quarterfinals';
  return 'r' + r[idx].length * 2;
}
// The first round that still has a real match to play, with how many of that round's real matches are done.
function currentRound(b) {
  const r = roundsOf(b);
  for (let i = 0; i < r.length; i++) {
    const real = r[i].filter(isReal);
    if (real.some((m) => !m.winnerId)) return { round: roundCode(b, i), done: real.filter((m) => m.winnerId).length, total: real.length };
  }
  return null;
}

// ---- round-robin groups ----
const pairKey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
function groupCounts(g) {
  const ids = Array.isArray(g.entryIds) ? g.entryIds : [];
  const sc = g.scores && typeof g.scores === 'object' ? g.scores : {};
  let total = 0, done = 0;
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    total++;
    const s = sc[pairKey(ids[i], ids[j])];
    if (s && typeof s === 'object') done++;
  }
  return { done, total };
}

// What the event looks like: its format, whether play has started or finished, and the champion if there is one.
function analyse(d) {
  const type = d.format && d.format.formatType;
  const groups = (d.groups || []).filter((g) => g && g.confirmed).map(groupCounts);
  const groupsDone = groups.some((c) => c.total > 0) && groups.every((c) => c.done === c.total);
  const groupsStarted = groups.some((c) => c.done > 0);
  const pods = (d.pods || []).filter((p) => p && p.confirmed && p.bracket);
  const fin = d.knockout && d.knockout.podFinals ? d.knockout : null;
  const main = d.knockout || null;
  const out = { type, started: false, finished: false, winnerId: null, groups, groupsDone, pods, fin, main };
  if (type === 'roundrobin') { out.started = groupsStarted; out.finished = groupsDone; }
  else if (type === 'knockout') { out.started = started(main); out.finished = finished(main); out.winnerId = champion(main); }
  else if (type === 'rrknockout') { out.started = groupsStarted || started(main); out.finished = finished(main); out.winnerId = champion(main); }
  else if (type === 'podknockout') { out.started = pods.some((p) => started(p.bracket)) || started(fin); out.finished = finished(fin); out.winnerId = champion(fin); }
  return out;
}

// When the organiser finalized the event, as epoch ms; null when not finalized (or `finalized` is junk).
function finalizedAt(d) {
  const at = validFinalizedAt(d);
  return at === null ? null : Date.parse(at);
}

// The matches of the stage the event is in, so the ring never drops because a later stage is generated.
// stage: groups | knockout | finals; round: the current round's code (roundCode) while a knockout or the Finals is live.
// Between two stages (every group played, the next stage not built yet) the same counts carry `next`: knockout (the knockout
// draw is next) or finals. When the last stage of the format is finished but the organiser has not finalized the event, it
// is that stage, full, with next AWAITING.
const AWAITING = 'awaiting';
function progressOf(d, a) {
  d = d && typeof d === 'object' ? d : {};
  a = a || analyse(d);
  const sum = (list) => list.reduce((s, c) => ({ done: s.done + c.done, total: s.total + c.total }), { done: 0, total: 0 });
  const group = (c) => (c.total > 0 ? { stage: 'groups', done: c.done, total: c.total } : null);
  const between = (p, next) => (p ? { stage: p.stage, done: p.done, total: p.total, next } : null);
  const complete = (stage, c) => ({ stage, done: c.total, total: c.total, next: AWAITING });
  const unfinalized = finalizedAt(d) === null;
  const ko = (b, stage) => { const c = currentRound(b); return c ? { stage, round: c.round, done: c.done, total: c.total } : null; };
  if (a.type === 'roundrobin') return unfinalized && a.groupsDone ? complete('groups', sum(a.groups)) : group(sum(a.groups));
  if (a.type === 'knockout') return unfinalized && finished(a.main) ? complete('knockout', counts(a.main)) : ko(a.main, 'knockout');
  if (a.type === 'rrknockout') {
    if (unfinalized && finished(a.main)) return complete('knockout', counts(a.main));
    if (a.groupsDone && !a.main) return between(group(sum(a.groups)), 'knockout');
    return a.groupsDone && a.main ? (ko(a.main, 'knockout') || group(sum(a.groups))) : group(sum(a.groups));
  }
  if (a.type === 'podknockout') {
    const podsDone = a.pods.length > 0 && a.pods.every((p) => finished(p.bracket));
    if (unfinalized && podsDone && a.fin && finished(a.fin)) return complete('finals', counts(a.fin));
    if (a.fin && (podsDone || started(a.fin))) return ko(a.fin, 'finals');
    const g = group(sum(a.pods.map((p) => counts(p.bracket))));
    return podsDone && !a.fin ? between(g, 'finals') : g;
  }
  return null;
}

// ---- stages: one small status object per stage of the event, for the subcards on the home page ----
// Every value is a fixed enum string or an integer computed from counts; nothing is copied from tournament text.
// key: groups | knockout | finals. state: groups -> notstarted | live | done; knockout/finals -> waiting | next | ready | live | done.
// done/total: matches played / all matches (the current round while a knockout is live). groups: confirmed groups (groups stage only).
// round: the current round's code, final | semifinals | quarterfinals | r<N> (live knockout/finals only). advance: entries that go through (rrknockout, before the draw only).
function stagesOf(d, a, status) {   // status is the event's overall status; the stages themselves do not depend on it
  d = d && typeof d === 'object' ? d : {};
  a = a || analyse(d);
  const int = (n) => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);
  const sum = (list) => list.reduce((s, c) => ({ done: s.done + int(c.done), total: s.total + int(c.total) }), { done: 0, total: 0 });
  const groupsStage = (state, c, n) => ({ key: 'groups', state, done: c.done, total: c.total, groups: n });
  const hasBracket = (b) => roundsOf(b).length > 0;
  // A knockout (or the Finals) from its own bracket. With no result: `ready` (drawn, nothing played).
  const koStage = (key, b) => {
    if (finished(b)) { const c = counts(b); return { key, state: 'done', done: c.total, total: c.total }; }
    if (started(b)) {
      const cr = currentRound(b), c = cr || counts(b), s = { key, state: 'live', done: int(c.done), total: int(c.total) };
      if (cr) s.round = cr.round;
      return s;
    }
    return { key, state: 'ready', done: 0, total: 0 };
  };
  const idle = (key, state) => ({ key, state, done: 0, total: 0 });
  if (a.type === 'roundrobin' || a.type === 'rrknockout') {
    const c = sum(a.groups), n = a.groups.length;
    const g = groupsStage(a.groupsDone ? 'done' : a.groups.some((x) => x.done > 0) ? 'live' : 'notstarted', c, n);
    if (a.type === 'roundrobin') return [g];
    let k;
    if (hasBracket(a.main)) k = koStage('knockout', a.main);
    else {
      k = idle('knockout', a.groupsDone ? 'next' : 'waiting');
      const per = Math.max(1, parseInt((d.format || {}).qualifiersPerGroup, 10) || 2);
      const advance = (Array.isArray(d.groups) ? d.groups : []).filter((x) => x && x.confirmed)
        .reduce((s, x) => s + Math.min(Array.isArray(x.entryIds) ? x.entryIds.length : 0, per), 0);
      if (advance > 0) k.advance = advance;
    }
    if (k.state === 'live' || k.state === 'done') g.state = 'done';   // a knockout with results means the groups are over, whatever a missing score says (the counts stay honest)
    return [g, k];
  }
  if (a.type === 'knockout') return [hasBracket(a.main) ? koStage('knockout', a.main) : idle('knockout', 'next')];
  if (a.type === 'podknockout') {
    const podsDone = a.pods.length > 0 && a.pods.every((p) => finished(p.bracket));
    const c = sum(a.pods.map((p) => counts(p.bracket)));
    const g = groupsStage(podsDone ? 'done' : a.pods.some((p) => started(p.bracket)) ? 'live' : 'notstarted', c, a.pods.length);
    let f;
    // Only a real Finals result makes it live. A void in the skeleton (a group whose final was voided) is not a result: it appears while other groups are still playing.
    const finResult = roundsOf(a.fin).some((r) => r.some((m) => m && m.winnerId && !m.bye));
    if (finished(a.fin) || finResult) f = koStage('finals', a.fin);
    else f = idle('finals', podsDone ? 'next' : 'waiting');
    if (f.state === 'live' || f.state === 'done') g.state = 'done';   // same for the Finals: the groups are over once it has results
    return [g, f];
  }
  return [];
}

// The two retention numbers: from the settings object when it has a whole-number value, otherwise the listConfig default.
function retention(settings) {
  const s = settings && typeof settings === 'object' ? settings : {};
  const pick = (v, dflt) => (typeof v === 'number' && isFinite(v) && v > 0 ? v : dflt);
  return { resultsDays: pick(s.resultsDays, cfg.RESULTS_DAYS), liveHours: pick(s.liveHours, cfg.LIVE_STALE_HOURS) };
}

// One row of the public_tournaments view -> { status, item }. status is 'live', 'upcoming', 'results' or null (not listed now).
// settings is the optional { resultsDays, liveHours } from siteSettings.js; without it the listConfig defaults apply.
function describe(row, now, settings) {
  const none = { status: null, item: null };
  const d = row && row.data;
  if (!d || typeof d !== 'object' || typeof row.slug !== 'string' || !SLUG_RE.test(row.slug)) return none;
  if (String(d.listed) !== 'true') return none;
  const a = analyse(d);
  if (FORMATS.indexOf(a.type) === -1) return none;
  const updated = new Date(row.updated_at).getTime();
  if (!isFinite(updated)) return none;
  const ec = d.eventCreation || {}, fmt = d.format || {};
  const date = typeof ec.date === 'string' && DATE_RE.test(ec.date) ? ec.date : '';
  const age = now - updated;
  const fin = finalizedAt(d);
  const keep = retention(settings);
  let status = null;
  // Results only once the organiser has finalized the event, and for resultsDays after that. A finished-looking
  // event that was never finalized is just a started one: live while it is being saved, else not listed.
  if (fin !== null) { if (now - fin <= keep.resultsDays * DAY) status = 'results'; }
  else if (a.started) { if (age <= keep.liveHours * HOUR) status = 'live'; }
  else if (date) { if (date >= isoDay(now - cfg.UPCOMING_GRACE_DAYS * DAY)) status = 'upcoming'; }
  else if (age <= cfg.QUERY_DAYS * DAY) status = 'upcoming';
  if (!status) return none;
  const event = clean(ec.eventName, 120), tournament = clean(ec.tournamentName, 120);
  const item = {
    slug: row.slug,
    event: event || tournament,   // '' when the organiser named neither: the page says "Untitled event" in its language
    tournament,
    date,
    start: typeof fmt.anticipatedStartTime === 'string' && TIME_RE.test(fmt.anticipatedStartTime) ? fmt.anticipatedStartTime : '',
    format: a.type,
    unit: UNITS.indexOf(ec.competitionUnit) !== -1 ? ec.competitionUnit : 'Singles',
    entries: (d.entriesList || []).filter((e) => e && !e.withdrawn).length,
    updatedAt: new Date(updated).toISOString(),
    stages: stagesOf(d, a, status),
  };
  if (status === 'results') {
    const w = a.winnerId ? (d.entriesList || []).find((e) => e && e.id === a.winnerId) : null;
    item.winner = w ? clean(w.name, 120) : '';
  }
  if (status === 'live') {
    const p = progressOf(d, a);
    if (p) item.progress = p;
  }
  return { status, item };
}

function buildList(rows, now, settings) {
  const out = { live: [], upcoming: [], results: [] };
  (rows || []).forEach((row) => {
    let r;
    try { r = describe(row, now, settings); } catch (e) { return; }      // one malformed row must not break the list (and its data is never logged)
    if (r.status) out[r.status].push(r.item);
  });
  const newest = (x, y) => (x.updatedAt < y.updatedAt ? 1 : x.updatedAt > y.updatedAt ? -1 : 0);
  out.live.sort(newest); out.results.sort(newest);
  out.upcoming.sort((x, y) => (x.date || '9999').localeCompare(y.date || '9999') || (x.start || '99:99').localeCompare(y.start || '99:99') || x.event.localeCompare(y.event));
  return {
    generatedAt: new Date(now).toISOString(),
    live: out.live.slice(0, cfg.MAX_PER_LIST),
    upcoming: out.upcoming.slice(0, cfg.MAX_PER_LIST),
    results: out.results.slice(0, cfg.MAX_PER_LIST),
  };
}

module.exports = { analyse, finalizedAt, progressOf, stagesOf, describe, buildList, roundsOf, counts, currentRound, roundCode, finished, started };

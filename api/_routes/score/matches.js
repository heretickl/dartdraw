// /api/score/matches: a floor official's matches. GET with X-Score-Session.
//   200 { rev, event, official, entries: { id: name }, format: { formatType, competitionUnit, bestOfLegs }, slots: [...] }
//   401 no_session · 410 link_*
// Only matches on the official's boards, in playing order: board by board, then the board plan's queue (Group Boards)
// or the group's own match order, then knockout rounds in order.
const { methodNotAllowed, scoreSession, sendRefused, sendError, slotView, engine, officials } = require('./common');

function onBoards(slot, boards) { return slot.boards.some((b) => boards.indexOf(Number(b)) >= 0); }

module.exports = async (req, res) => {
  if (req.method !== 'GET') { methodNotAllowed(res); return; }
  try {
    const found = await scoreSession(req);
    if (!found) { res.status(401).json({ code: 'no_session', error: 'Open your scoring link again.' }); return; }
    if (found.refused) { sendRefused(res, found.refused); return; }
    const e = engine();
    const t = e.inside(found.tournament.data);
    const now = Date.now(), boards = found.official.boards;
    const groupIndex = {};
    (t.groups || []).forEach((g, i) => { groupIndex[g.id] = i; });
    (t.pods || []).forEach((p, i) => { groupIndex['pod:' + p.id] = i; });
    const planOrder = {};
    const plan = t.boardPlan && t.boardPlan.boards;
    if (plan) Object.keys(plan).forEach((b) => (plan[b] || []).forEach((x, i) => { planOrder[(x.key === 'ko' ? 'knockout' : x.key) + ':' + x.ri + ':' + x.mi] = i; }));
    const slots = e.resultSlots(t).filter((s) => onBoards(s, boards)).map((s, i) => {
      const order = s.kind === 'rr' ? [groupIndex[s.group.id] || 0, i] : (planOrder[s.bracketKey + ':' + s.ri + ':' + s.mi] != null ? [planOrder[s.bracketKey + ':' + s.ri + ':' + s.mi], 0] : [1000 + s.ri, s.mi]);
      return { v: slotView(e, t, s, found.official.id, now), board: Math.min(...s.boards.filter((b) => boards.indexOf(Number(b)) >= 0)), order };
    }).sort((x, y) => x.board - y.board || x.order[0] - y.order[0] || x.order[1] - y.order[1]).map((x) => Object.assign(x.v, { board: x.board }));
    const entries = {};
    (t.entriesList || []).forEach((en) => { if (en && en.id) entries[en.id] = en.name || ''; });
    await officials.touch(found.official.id, false);
    const ev = t.eventCreation || {};
    res.status(200).json({
      rev: found.tournament.updated_at,
      event: { name: ev.tournamentName || '', eventName: ev.eventName || '', date: ev.date || '' },
      official: { name: found.official.name, boards, endsAt: found.official.endsAt },
      entries,
      format: { formatType: t.format.formatType, competitionUnit: ev.competitionUnit || 'Singles', bestOfLegs: parseInt(t.format.bestOfLegs) || 5 },
      slots: e.plain(slots)
    });
  } catch (err) { sendError(res, err); }
};

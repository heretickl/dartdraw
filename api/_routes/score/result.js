// /api/score/result: one action on one match by a floor official. POST { pos, op, la?, lb?, side?, rv? } with
// X-Score-Session. op: 'score' (la = legs of slot.a, lb = of slot.b), 'noShow' (side 'a'|'b'), 'void' (knockout
// "Neither showed"), 'call' / 'uncall'.
//   200 { ok:true, slot }
//   409 { ok:false, code, slot }  taken (another official entered it) · changed_by_organiser · too_late (the 5 minutes
//                                 are over) · later_played (a correction would clear results already played further on)
//   403 not_your_board · 410 link_* · 400 invalid · 401 no_session · 503 busy
// The organiser's result always stands: a match the organiser has entered (by 'o') is never changed here. Refusals
// (not your board, link ended) are kept on the official's row for the organiser's panel ("Not sent").
const { CORRECT_MS, bodyObject, methodNotAllowed, scoreSession, sendRefused, sendError, writeIfUnchanged, readEvent, slotView, engine, officials } = require('./common');

const OPS = ['score', 'noShow', 'void', 'call', 'uncall'];

/* Would this request leave the match exactly as it is stored now? (the same request sent twice) */
function sameAsSent(e, t, slot, b) {
  if (b.op === 'call' || b.op === 'uncall') return false;
  const bare = (r) => { if (!r) return 'null'; const o = {}; Object.keys(r).sort().forEach((k) => { if (['rv', 'by', 'at', 'doneAt'].indexOf(k) < 0) o[k] = r[k]; }); return JSON.stringify(o); };
  const before = bare(slot.get());
  const trial = e.inside(e.plain(t));
  const out = e.applyResult(trial, slot.pos, b.op, { la: b.la, lb: b.lb, side: b.side === 'b' ? 'b' : 'a' }, { by: 'x', at: 0 });
  if (!out || !out.ok) return false;
  const after = e.resultSlots(trial).find((s) => s.pos === slot.pos);
  return !!after && bare(after.get()) === before;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { methodNotAllowed(res); return; }
  const b = bodyObject(req);
  if (typeof b.pos !== 'string' || OPS.indexOf(b.op) < 0) { res.status(400).json({ ok: false, code: 'invalid', error: 'Not a valid result.' }); return; }
  try {
    const found = await scoreSession(req);
    if (!found) { res.status(401).json({ ok: false, code: 'no_session', error: 'Open your scoring link again.' }); return; }
    /* kept small and clean for the organiser's panel, whatever was sent */
    const legs = (v) => { const n = Number(v); return Number.isInteger(n) && n >= 0 && n <= 999 ? n : null; };
    const refuse = async (reason) => { if (found.official) await officials.recordRefusal(found.official.id, { pos: String(b.pos).slice(0, 80), op: b.op, la: legs(b.la), lb: legs(b.lb), side: b.side === 'b' ? 'b' : 'a', reason }); };
    if (found.refused) { await refuse(found.refused); sendRefused(res, found.refused); return; }
    const e = engine(), me = found.official.id, boards = found.official.boards;
    let row = found.tournament;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        row = await readEvent(row.id);
        if (!row) { res.status(404).json({ ok: false, code: 'not_found' }); return; }
        if (row.data && row.data.finalized) { await refuse('finalized'); sendRefused(res, 'finalized'); return; }
      }
      const t = e.inside(row.data), now = Date.now();
      const slot = e.resultSlots(t).find((s) => s.pos === b.pos);
      if (!slot) { res.status(409).json({ ok: false, code: 'missing', error: 'This match is no longer in the event.' }); return; }
      if (!slot.boards.some((x) => boards.indexOf(Number(x)) >= 0)) {
        await refuse('not_your_board');
        res.status(403).json({ ok: false, code: 'not_your_board', error: 'This match is not on your boards any more.', slot: e.plain(slotView(e, t, slot, me, now)) });
        return;
      }
      const cur = slot.get();
      const decided = slot.kind === 'rr' ? !!cur : !!(slot.m.winnerId || slot.m.void || slot.m.bye);
      const answer = (code, status) => res.status(status || 409).json({ ok: false, code, slot: e.plain(slotView(e, t, slot, me, now)) });
      if (b.op === 'call' || b.op === 'uncall') {
        if (slot.kind !== 'ko' || decided || !slot.open) { answer(decided ? 'taken' : 'invalid', decided ? 409 : 400); return; }
      } else if (decided && cur && cur.by === me && sameAsSent(e, t, slot, b)) {
        /* Sent again after its answer was lost (it got through the first time): it is saved; say so. */
        res.status(200).json({ ok: true, rev: row.updated_at, slot: e.plain(slotView(e, t, slot, me, now)) });
        return;
      } else if (decided) {
        /* A correction: only the official's own result, within the 5 minutes, and only if nobody changed it since. */
        if (!cur || cur.by !== me) { answer(cur && cur.by && cur.by !== 'o' ? 'taken' : 'changed_by_organiser'); return; }
        if (!cur.at || now - cur.at >= CORRECT_MS) { answer('too_late'); return; }
        if (b.rv != null && Number(b.rv) !== Number(cur.rv || 0)) { answer('changed_by_organiser'); return; }
        /* A group result the knockout has already been drawn from: changing it is the organiser's call. */
        if (slot.kind === 'rr' && ((t.knockout && Array.isArray(t.knockout.rounds) && t.knockout.rounds.length) || (t.knockoutLosers && Array.isArray(t.knockoutLosers.rounds)))) { answer('later_played'); return; }
      } else if (!slot.open) { answer('invalid', 400); return; }
      const others = {};
      e.resultSlots(t).forEach((s) => { if (s.pos !== b.pos && s.get()) others[s.pos] = true; });
      const out = e.applyResult(t, b.pos, b.op, { la: b.la, lb: b.lb, side: b.side === 'b' ? 'b' : 'a' }, { by: me, at: now });
      if (!out.ok) { answer(out.code === 'invalid' ? 'invalid' : 'blocked', 400); return; }
      /* A correction that changes who goes through clears results already played further on: that is the organiser's call. */
      if (decided && slot.kind === 'ko' && out.changed.some((p) => p !== b.pos && others[p])) { answer('later_played'); return; }
      e.rebuildDerived(t);
      const stamp = await writeIfUnchanged(row.id, row.updated_at, e.plain(t));
      if (!stamp) continue;   // someone saved meanwhile: read again and re-check everything
      await officials.touch(me, true);
      const after = e.resultSlots(t).find((s) => s.pos === b.pos);
      res.status(200).json({ ok: true, rev: stamp, slot: e.plain(slotView(e, t, after, me, now)) });
      return;
    }
    res.status(503).json({ ok: false, code: 'busy', error: 'The event is busy. Trying again.' });
  } catch (err) { sendError(res, err); }
};

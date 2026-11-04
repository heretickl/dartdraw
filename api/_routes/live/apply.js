// Shared by /api/live/confirm and /api/live/retire (not a route): applies one device action to a match of the event with the same
// rule engine the organiser's screens and the floor officials use (results-engine.js applyResult, run by api/_lib/engine.js), so
// the stored event looks as if the organiser had typed it (the result's `by` is 'dev', and a version `rv` is stamped).
// The write is the floor officials' own: writeIfUnchanged on the stamp that was read; when someone saved meanwhile the event is
// read again and everything is checked again (3 attempts), exactly as api/_routes/score/result.js does.
const { engine } = require('../../_lib/engine');
const { writeIfUnchanged, readEvent } = require('../score/common');
const LiveBoards = require('../../../live-boards');
const { load, matchView, heldPlace } = require('./view');

const bare = (r) => { if (!r) return 'null'; const o = {}; Object.keys(r).sort().forEach((k) => { if (['rv', 'by', 'at', 'doneAt'].indexOf(k) < 0) o[k] = r[k]; }); return JSON.stringify(o); };

/* Would this action leave the match exactly as it is stored now? (the same action sent twice: the first answer was lost) */
function alreadyApplied(e, t, slot, op, args) {
  const cur = slot.get();
  if (!cur || cur.by !== 'dev' || (op === 'noShow' && !cur.wo)) return false;
  const before = bare(cur);
  const trial = e.inside(e.plain(t));
  const out = e.applyResult(trial, slot.pos, op, args, { by: 'x', at: 0 });
  if (!out || !out.ok) return false;
  const after = e.resultSlots(trial).find((s) => s.pos === slot.pos);
  return !!after && bare(after.get()) === before;
}

/* Applies op to pos (opts.settled: the live row is already confirmed / retired, so nothing is ever applied: the answer is only
   "already written, exactly this" or a refusal). Returns one of
     { ok: true, data, duplicate? }            written (data: the event as stored) or already written by this device
     { refused: 'finalized' }                  the event was finalized meanwhile
     { organiser: true }                       the organiser's result is there: it stands (D18)
     { fail: [status, code, text] }            anything else, nothing was changed */
async function applyForDevice(found, pos, op, args, opts) {
  const settled = !!(opts && opts.settled);   // the live row says the match is over: a resend may only be recognised, never applied
  const e = engine();
  let ev = found.tournament;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      ev = await readEvent(ev.id);
      if (!ev) return { fail: [404, 'not_found', 'Not found.'] };
    }
    if (ev.data && ev.data.finalized) return { refused: 'finalized' };
    const t = e.inside(ev.data), now = Date.now();
    const slot = e.resultSlots(t).find((s) => s.pos === pos);
    if (!slot || !slot.a || !slot.b || (slot.kind === 'ko' && slot.m && slot.m.bye)) return { fail: [409, 'missing', 'This match is no longer in the event.'] };
    if (settled && !LiveBoards.slotDone(slot)) return { organiser: true };   // the result is gone (the organiser cleared it): the device must not put it back
    if (LiveBoards.slotDone(slot)) {
      const cur = slot.get();
      if (alreadyApplied(e, t, slot, op, args)) return { ok: true, data: ev.data, duplicate: true };
      if (!cur || !cur.by || cur.by === 'o') return { organiser: true };   // typed by the organiser (or before devices existed): it stands
      return { fail: [409, 'match_over', 'This match already has a result.'] };
    }
    if (!slot.open) return { fail: [409, 'not_open', 'This match is not ready to play.'] };
    const out = e.applyResult(t, pos, op, args, { by: 'dev', at: now });
    if (!out.ok) return { fail: out.code === 'invalid' ? [400, 'invalid', 'Not a valid result.'] : [409, 'blocked', 'This result cannot be saved now.'] };
    e.rebuildDerived(t);
    const data = e.plain(t);
    const stamp = await writeIfUnchanged(ev.id, ev.updated_at, data);
    if (!stamp) continue;   // someone saved meanwhile: read again and re-check everything
    return { ok: true, data };
  }
  return { fail: [503, 'busy', 'The event is busy. Trying again.'] };
}

/* The match as the device's list shows it, for an answer: data = the event as stored, row = the match's row before the change,
   state = the state it now has. */
function slotAnswer(found, data, pos, row, state) {
  const me = found.device.id, ctx = load({ tournament: { data } }), s = ctx.slotsByPos[pos];
  if (!s) return null;
  const place = heldPlace(row, me, found.device.board) || { own: true, board: row.board != null ? row.board : found.device.board };
  return matchView(ctx, s, Object.assign({}, row, { state }), place, me, {});
}

module.exports = { applyForDevice, slotAnswer };

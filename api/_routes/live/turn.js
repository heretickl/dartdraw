// /api/live/turn: a device sends one turn it keyed. POST with X-Live-Session
//   { pos, id, leg, side:'a'|'b', player, entered, supersedes?, next?, unsent? }
//   id is the device's own and the idempotency key: a turn sent twice is stored once. entered: the contract in api/_lib/live.js.
//   200 { ok }                          stored and counted (live_matches.summary is rewritten from the match's turns)
//   200 { ok, duplicate }               that id was stored already (answers as it did the first time: see below)
//   200 { ok, ignored }                 the event is finalized: the turn is kept for the organiser and never applied (spec 7.6)
//   400 invalid_turn                    malformed: NOT stored
//   409 not_your_match                  this device does not hold the match (taken over, never claimed): stored, flagged ignored
//   409 changed_by_organiser / match_over   the organiser's result stands / the match is over: stored, flagged ignored
//   401 no_session · 403 live_off · 410 link_ended · 503 live_not_set_up
// live_turns is append-only: a correction is a new turn whose `supersedes` names the one it replaces. Turns kept as ignored are
// never counted in the match's summary.
const { sendError, bodyObject, methodNotAllowed, requireSession, refuse, live } = require('./common');
const { load, gameFor } = require('./view');
const { cleanEntered, summarize } = require('../../_lib/live-summary');

const ID = /^[A-Za-z0-9_.:-]{1,100}$/;
const isSide = (v) => v === 'a' || v === 'b';
const BAD = 'That turn is not valid.';

/* The turn as stored, or null when the request is malformed. */
function parseTurn(b, me) {
  if (typeof b.pos !== 'string' || !b.pos || b.pos.length > 200) return null;
  if (typeof b.id !== 'string' || !ID.test(b.id)) return null;
  if (!Number.isInteger(b.leg) || b.leg < 1 || b.leg > 99) return null;
  if (!isSide(b.side)) return null;
  if (b.player != null && (typeof b.player !== 'string' || b.player.length > 120)) return null;
  if (b.supersedes != null && (typeof b.supersedes !== 'string' || !ID.test(b.supersedes) || b.supersedes === b.id)) return null;
  if (b.next != null && !isSide(b.next)) return null;
  if (b.unsent != null && !(Number.isInteger(b.unsent) && b.unsent >= 0 && b.unsent <= 100000)) return null;
  const entered = cleanEntered(b.entered);
  if (!entered) return null;
  return { id: b.id, pos: b.pos, leg: b.leg, side: b.side, player: b.player == null ? null : b.player, entered, supersedes: b.supersedes == null ? null : b.supersedes, deviceId: me };
}

/* Why a turn is not counted (null = it counts). Order: finalized event, not the holder, the organiser's result, match over. */
function ignoreReason(found, row, me) {
  if (found.finalized) return 'finalised';
  if (!row || row.device_id !== me) return 'not_holder';
  if (row.changed_by_organiser) return 'changed_by_organiser';
  if (row.state === 'confirmed' || row.state === 'retired' || row.state === 'voided') return 'match_over';
  return null;
}
const ANSWERS = {
  not_holder: [409, 'not_your_match', 'This match is not on this device any more.'],
  changed_by_organiser: [409, 'changed_by_organiser', 'The organiser entered this result.'],
  match_over: [409, 'match_over', 'This match is over.']
};
function answerIgnored(res, reason, duplicate) {
  if (reason === 'finalised') { res.status(200).json(Object.assign({ ok: true, ignored: true }, duplicate ? { duplicate: true } : {})); return; }
  const a = ANSWERS[reason] || ANSWERS.match_over;
  refuse(res, a[0], a[1], a[2]);
}

/* The match's public picture, rewritten from its counting turns. A summary that cannot be built (the event no longer has the
   match) is left as it was: the turn itself is stored either way. */
async function rewriteSummary(found, row, turn, next) {
  const turns = await live.matchTurns(found.tournament.id, turn.pos);
  let startFor = () => null;
  try {
    const ctx = load(found);
    const s = ctx.slotsByPos[turn.pos];
    if (s) {
      const g = gameFor(ctx.data, ctx.t, s).game.game;
      startFor = (leg) => {
        const one = typeof g === 'string' ? g : (g && Array.isArray(g.pattern) && g.pattern.length ? g.pattern[(leg - 1) % g.pattern.length] : null);
        const n = one && one !== 'cricket' ? parseInt(one, 10) : NaN;
        return Number.isInteger(n) ? n : null;
      };
    }
  } catch (e) { /* the picture still has the legs and the thrower */ }
  const prev = row && row.summary ? row.summary : {};
  const picture = summarize(turns, startFor, { side: turn.side, supersedes: turn.supersedes }, next, prev.thrower);
  await live.setSummary(found.tournament.id, turn.pos, Object.assign({}, prev, picture));
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { methodNotAllowed(res); return; }
  const b = bodyObject(req);
  try {
    const found = await requireSession(req, res, { allowFinalized: true });
    if (!found) return;
    const me = found.device.id, id = found.tournament.id;
    const turn = parseTurn(b, me);
    if (!turn) { refuse(res, 400, 'invalid_turn', BAD); return; }
    const row = found.finalized ? null : await live.matchFull(id, turn.pos);
    const reason = ignoreReason(found, row, me);
    const stored = await live.insertTurn(id, Object.assign({}, turn, { ignored: !!reason, ignoredReason: reason }));
    if (b.unsent != null) await live.setUnsent(me, id, b.unsent);
    if (!stored) {
      // sent again: it is saved. A repeat of a turn that was kept as ignored is answered as its first send was.
      const was = await live.turnById(id, turn.id);
      if (was && was.ignored) { answerIgnored(res, was.ignored_reason, true); return; }
      res.status(200).json({ ok: true, duplicate: true }); return;
    }
    if (reason) { answerIgnored(res, reason, false); return; }
    await rewriteSummary(found, row, turn, b.next);
    res.status(200).json({ ok: true });
  } catch (e) { sendError(res, e); }
};

module.exports.parseTurn = parseTurn;

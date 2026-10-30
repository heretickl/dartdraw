// Shared pieces of the floor-official endpoints (api/score/[action].js).
// An official's session is a signed token (not a cookie, so one phone can hold links for several events) sent back in
// the X-Score-Session header. It names the official and the link it was opened with: a New link, Stop, finalize or the
// end time ends it, because every request looks the official up again (officials.findLiveById).
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { sql } = require('../../_lib/db');
const officials = require('../../_lib/officials');
const { engine } = require('../../_lib/engine');

const CORRECT_MS = 5 * 60 * 1000;   // an official may correct their own result for this long (owner: "briefly")

const ERRORS = {
  not_set_up: [503, { code: 'officials_not_set_up', error: 'Floor officials are not set up yet.' }],
  not_found: [404, { code: 'not_found', error: 'Not found.' }],
  invalid_name: [400, { code: 'official_invalid_name', error: 'Enter a name (up to 60 characters).' }],
  invalid_boards: [400, { code: 'official_invalid_boards', error: 'Tick at least one board.' }],
  too_many_officials: [409, { code: 'too_many_officials', error: 'An event can have up to 64 floor officials.' }],
  finalized: [403, { code: 'finalized', error: 'This event is finalized. Only an Admin can change it.', finalized: true }]
};
function sendError(res, e) {
  const hit = e && e.code && ERRORS[e.code];
  if (hit) { res.status(hit[0]).json(hit[1]); return; }
  console.error('score endpoint failed: ' + (e && e.message ? e.message : e));
  res.status(500).json({ code: 'request_failed', error: 'Could not complete that request.' });
}
function bodyObject(req) {
  const b = req.body;
  return b && typeof b === 'object' && !Array.isArray(b) ? b : {};
}
function methodNotAllowed(res) { res.status(405).json({ code: 'method_not_allowed', error: 'Method not allowed' }); }
function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('SESSION_SECRET is not set');
  return s;
}
/* tp: which PIN the link was opened with (a hash, never the PIN), so New PIN ends the sessions opened with the old one. */
function pinTag(official) { return crypto.createHash('sha256').update(String(official.tokenHash) + ':' + String(official.pin)).digest('hex').slice(0, 16); }
function signScoreSession(official) {
  const exp = Math.floor(new Date(official.endsAt).getTime() / 1000);
  return jwt.sign({ oid: official.id, th: String(official.tokenHash).slice(0, 16), tp: pinTag(official), exp }, secret(), { algorithm: 'HS256' });
}
/* The official behind the request's session: { official, tournament } when the link still works, { refused } when it
   ended (stopped, new link, finalized, end time), null when there is no valid session at all. */
async function scoreSession(req) {
  const raw = req.headers && (req.headers['x-score-session'] || req.headers['X-Score-Session']);
  if (!raw || typeof raw !== 'string') return null;
  let p;
  try { p = jwt.verify(raw, secret(), { algorithms: ['HS256'], ignoreExpiration: true }); } catch (e) { return null; }
  const found = await officials.findLiveById(p.oid);
  if (found.refused === 'unknown') return null;
  if (found.official && String(found.official.tokenHash).slice(0, 16) !== p.th) return { refused: 'new_link', official: found.official };
  if (found.official && !found.refused && pinTag(found.official) !== p.tp) return null;   // New PIN: open the link again with it
  return found;
}
/* A link that no longer works: why, as its own code (stopped, replaced by a new link, event finalized, end time passed). */
const REFUSED = {
  stopped: { code: 'link_stopped', error: 'This scoring link no longer works.' },
  new_link: { code: 'link_replaced', error: 'This scoring link no longer works.' },
  finalized: { code: 'event_finalized', error: 'This scoring link no longer works.' },
  ended: { code: 'link_ended', error: 'This scoring link no longer works.' }
};
function sendRefused(res, reason) {
  res.status(410).json(Object.assign({ reason }, REFUSED[reason] || REFUSED.ended));
}
/* Writes an event only if nobody saved it since it was read (the stamp, to the millisecond, as PUT does). */
async function writeIfUnchanged(id, readUpdatedAt, data) {
  const iso = new Date(readUpdatedAt).toISOString();
  const rows = await sql`
    UPDATE tournaments SET data = ${JSON.stringify(data)}::jsonb, updated_at = now()
    WHERE id = ${id} AND abs(extract(epoch FROM updated_at) - extract(epoch FROM ${iso}::timestamptz)) < 0.001
      AND (data->>'finalized' IS NULL OR data->>'finalized' IN ('false', '0', ''))
    RETURNING updated_at`;
  return rows.length ? rows[0].updated_at : null;
}
async function readEvent(id) {
  const rows = await sql`SELECT id, data, updated_at FROM tournaments WHERE id = ${id}`;
  return rows[0] || null;
}
/* What the official's page shows for one match. */
function slotView(e, t, s, officialId, now) {
  const r = s.get();
  const by = !r ? null : (r.by === officialId ? 'me' : (!r.by || r.by === 'o') ? 'o' : 'other');
  const done = s.kind === 'rr' ? !!r : !!(s.m.winnerId || s.m.void || s.m.bye);
  const round = s.kind === 'ko' ? e.plain(e.roundInfo(s.bracket, s.ri)) : null;   // {code, n}: the page names it in its own language
  return {
    pos: s.pos, kind: s.kind, stage: s.stage, boards: s.boards, a: s.a || null, b: s.b || null,
    group: s.kind === 'rr' ? s.group.label : (s.pod ? s.pod.label : null), round,
    bracket: s.kind === 'ko' ? (s.bracketKey === 'knockoutLosers' ? 'plate' : s.pod ? 'group' : (t.knockout && t.knockout.podFinals ? 'finals' : 'main')) : null,
    legs: e.legsFor(t, s), teamCap: e.teamCap(t, s.stage),
    state: done ? 'done' : (s.kind === 'ko' && s.m.called ? 'called' : s.open ? 'open' : 'waiting'),
    result: r ? (s.kind === 'rr' ? { legs1: r.legs1, legs2: r.legs2, wo: !!r.wo } : { aLegs: r.aLegs, bLegs: r.bLegs, winnerId: r.winnerId || null, void: !!r.void, wo: !!r.wo }) : null,
    by, at: r && r.at || null, rv: r && r.rv || 0,
    canCorrect: by === 'me' && !!r.at && now - r.at < CORRECT_MS
  };
}

module.exports = { CORRECT_MS, sendError, bodyObject, methodNotAllowed, signScoreSession, scoreSession, sendRefused, writeIfUnchanged, readEvent, slotView, officials, engine };

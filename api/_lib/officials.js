// Floor officials (spec: docs/superpowers/specs/2026-10-30-floor-officials-design.md): per-event scoring links.
// The event_officials table comes from migrations/2026-10-30-floor-officials.sql; until the owner has run it, every
// call throws OfficialsError('not_set_up') (Postgres 42P01). The link's token is random (32 bytes, base64url) and only
// its SHA-256 hash is stored. A link works until the earliest of: Stop, New link, the event being finalized, ends_at.
const crypto = require('crypto');
const { sql } = require('./db');

class OfficialsError extends Error {
  constructor(code) { super(code); this.code = code; }
}
const MAX_OFFICIALS = 64;        // per event
const MAX_REFUSED = 50;          // kept per official
const NAME_MAX = 60;

function hashToken(raw) { return crypto.createHash('sha256').update(String(raw)).digest('hex'); }
/* The link's token: HMAC(SESSION_SECRET, id:nonce). Rebuilt on demand (Copy link), never stored; a new nonce is a new link. */
function tokenFor(id, nonce) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is not set');
  return crypto.createHmac('sha256', secret).update('score-link:' + id + ':' + nonce).digest('base64url');
}
function newNonce() { return crypto.randomBytes(16).toString('base64url'); }
function newPin() { return String(crypto.randomInt(0, 10000)).padStart(4, '0'); }
function newId() { return 'off_' + crypto.randomBytes(9).toString('base64url').replace(/[^A-Za-z0-9]/g, 'x'); }
async function q(fn) {
  try { return await fn(); }
  catch (e) { if (e && e.code === '42P01') throw new OfficialsError('not_set_up'); throw e; }
}
function cleanName(v) {
  const s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  if (!s || s.length > NAME_MAX) throw new OfficialsError('invalid_name');
  return s;
}
function cleanBoards(v) {
  const list = Array.isArray(v) ? v : [];
  const out = [...new Set(list.map((n) => parseInt(n, 10)).filter((n) => n >= 1 && n <= 9999))].sort((a, b) => a - b);
  if (!out.length) throw new OfficialsError('invalid_boards');
  return out.slice(0, 64);
}
/* 00:00 on the day after the event date, Malaysia time (UTC+8); with no date, 00:00 Malaysia time on the day after `now`. */
function endsAtFor(eventDateIso, now) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(eventDateIso || ''));
  let y, mo, d;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else { const local = new Date((now == null ? Date.now() : +now) + 8 * 3600000); y = local.getUTCFullYear(); mo = local.getUTCMonth() + 1; d = local.getUTCDate(); }
  return new Date(Date.UTC(y, mo - 1, d + 1) - 8 * 3600000);
}
const isFinalized = (data) => !!(data && typeof data === 'object' && data.finalized);
function view(r) {
  return { id: r.id, token: tokenFor(r.id, r.link_nonce), name: r.name, boards: (r.boards || []).map(Number), pin: r.pin, endsAt: r.ends_at, stopped: !!r.stopped_at,
    lastSeenAt: r.last_seen_at || null, results: Number(r.results) || 0, refused: Array.isArray(r.refused) ? r.refused : [] };
}
/* The event, if this organiser may manage it (an Admin may manage any). */
async function ownEvent(organizer, tournamentId) {
  const rows = organizer.role === 'admin'
    ? await sql`SELECT id, data, created_by FROM tournaments WHERE id = ${tournamentId}`
    : await sql`SELECT id, data, created_by FROM tournaments WHERE id = ${tournamentId} AND created_by = ${organizer.id}`;
  if (!rows.length) throw new OfficialsError('not_found');
  return rows[0];
}
async function listOfficials(organizer, tournamentId) {
  return q(async () => {
    await ownEvent(organizer, tournamentId);
    const rows = await sql`SELECT * FROM event_officials WHERE tournament_id = ${tournamentId} ORDER BY created_at, id`;
    return rows.map(view);
  });
}
async function createOfficial(organizer, tournamentId, body) {
  return q(async () => {
    const ev = await ownEvent(organizer, tournamentId);
    if (isFinalized(ev.data)) throw new OfficialsError('finalized');
    const name = cleanName(body && body.name), boards = cleanBoards(body && body.boards);
    const count = await sql`SELECT count(*)::int AS n FROM event_officials WHERE tournament_id = ${tournamentId}`;
    if (count[0].n >= MAX_OFFICIALS) throw new OfficialsError('too_many_officials');
    const id = newId(), pin = newPin(), nonce = newNonce(), token = tokenFor(id, nonce);
    const ends = endsAtFor(ev.data && ev.data.eventCreation && ev.data.eventCreation.date);
    const rows = await sql`
      INSERT INTO event_officials (id, tournament_id, organizer_id, name, boards, token_hash, link_nonce, pin, ends_at)
      VALUES (${id}, ${tournamentId}, ${ev.created_by}, ${name}, ${boards}::int[], ${hashToken(token)}, ${nonce}, ${pin}, ${ends.toISOString()}::timestamptz)
      RETURNING *`;
    return { official: view(rows[0]), token };
  });
}
/* One official of an event this organiser manages. */
async function ownOfficial(organizer, id) {
  const rows = await sql`SELECT o.*, t.created_by AS owner FROM event_officials o JOIN tournaments t ON t.id = o.tournament_id WHERE o.id = ${id}`;
  if (!rows.length || (organizer.role !== 'admin' && rows[0].owner !== organizer.id)) throw new OfficialsError('not_found');
  return rows[0];
}
async function updateOfficial(organizer, id, body) {
  return q(async () => {
    const cur = await ownOfficial(organizer, id);
    const name = body && body.name != null ? cleanName(body.name) : cur.name;
    const boards = body && body.boards != null ? cleanBoards(body.boards) : cur.boards;
    const rows = await sql`UPDATE event_officials SET name = ${name}, boards = ${boards}::int[] WHERE id = ${id} RETURNING *`;
    return view(rows[0]);
  });
}
async function stopOfficial(organizer, id) {
  return q(async () => {
    await ownOfficial(organizer, id);
    const rows = await sql`UPDATE event_officials SET stopped_at = COALESCE(stopped_at, now()) WHERE id = ${id} RETURNING *`;
    return view(rows[0]);
  });
}
async function renewPin(organizer, id) {
  return q(async () => {
    await ownOfficial(organizer, id);
    const rows = await sql`UPDATE event_officials SET pin = ${newPin()} WHERE id = ${id} RETURNING *`;
    return view(rows[0]);
  });
}
/* A new link for the same official: the old one stops working at once. A stopped official is started again. */
async function renewLink(organizer, id) {
  return q(async () => {
    const cur = await ownOfficial(organizer, id);
    const ev = await ownEvent(organizer, cur.tournament_id);
    if (isFinalized(ev.data)) throw new OfficialsError('finalized');
    const nonce = newNonce(), token = tokenFor(id, nonce);
    const ends = endsAtFor(ev.data && ev.data.eventCreation && ev.data.eventCreation.date);
    const rows = await sql`UPDATE event_officials SET token_hash = ${hashToken(token)}, link_nonce = ${nonce}, pin = ${newPin()}, stopped_at = NULL, ends_at = ${ends.toISOString()}::timestamptz WHERE id = ${id} RETURNING *`;
    return { official: view(rows[0]), token };
  });
}
/* The official and their event behind a link (token), or why it does not work. Never throws for a bad token. */
async function findLive(token, now) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) return { refused: 'unknown' };
  return q(async () => {
    const rows = await sql`
      SELECT o.*, t.data AS t_data, t.updated_at AS t_updated_at FROM event_officials o JOIN tournaments t ON t.id = o.tournament_id
      WHERE o.token_hash = ${hashToken(token)}`;
    return liveRow(rows[0], now);
  });
}
/* The same, by the official's id (the signed session cookie). */
async function findLiveById(id, now) {
  if (typeof id !== 'string' || !id) return { refused: 'unknown' };
  return q(async () => {
    const rows = await sql`
      SELECT o.*, t.data AS t_data, t.updated_at AS t_updated_at FROM event_officials o JOIN tournaments t ON t.id = o.tournament_id
      WHERE o.id = ${id}`;
    return liveRow(rows[0], now);
  });
}
function liveRow(r, now) {
  if (!r) return { refused: 'unknown' };
  const official = Object.assign(view(r), { tournamentId: r.tournament_id, tokenHash: r.token_hash });
  const tournament = { id: r.tournament_id, data: r.t_data, updated_at: r.t_updated_at };
  if (r.stopped_at) return { refused: 'stopped', official, tournament };
  if (isFinalized(r.t_data)) return { refused: 'finalized', official, tournament };
  if (new Date(r.ends_at).getTime() <= (now == null ? Date.now() : +now)) return { refused: 'ended', official, tournament };
  return { official, tournament };
}
async function recordRefusal(officialId, item) {
  return q(async () => {
    const entry = JSON.stringify([Object.assign({ at: new Date().toISOString() }, item)]);
    await sql`
      UPDATE event_officials SET refused = (
        SELECT COALESCE(jsonb_agg(x ORDER BY n), '[]'::jsonb) FROM (
          SELECT x, n FROM jsonb_array_elements(refused || ${entry}::jsonb) WITH ORDINALITY AS e(x, n)
          ORDER BY n DESC LIMIT ${MAX_REFUSED}) last)
      WHERE id = ${officialId}`;
  });
}
async function dismissRefused(organizer, id) {
  return q(async () => {
    await ownOfficial(organizer, id);
    const rows = await sql`UPDATE event_officials SET refused = '[]'::jsonb WHERE id = ${id} RETURNING *`;
    return view(rows[0]);
  });
}
async function touch(officialId, addResults) {
  return q(async () => {
    await sql`UPDATE event_officials SET last_seen_at = now(), results = results + ${addResults ? 1 : 0} WHERE id = ${officialId}`;
  });
}
/* Names of the officials of an event, by id (for "Entered by" in the organiser app). */
async function officialNames(tournamentId) {
  return q(async () => {
    const rows = await sql`SELECT id, name FROM event_officials WHERE tournament_id = ${tournamentId}`;
    const out = {}; rows.forEach((r) => { out[r.id] = r.name; }); return out;
  });
}

module.exports = {
  OfficialsError, MAX_OFFICIALS, MAX_REFUSED, hashToken, endsAtFor,
  listOfficials, createOfficial, updateOfficial, stopOfficial, renewPin, renewLink, dismissRefused,
  findLive, findLiveById, recordRefusal, touch, officialNames,
};

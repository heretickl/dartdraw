// Live scoring (spec: docs/superpowers/specs/2026-11-04-online-organizer-design.md, sections 7.1 and 15): the event's one
// scoring login, and the tablets/phones signed in with it. Tables come from migrations/2026-11-05-live-scoring.sql; until the
// owner has run it, every call throws LiveError('not_set_up') (Postgres 42P01).
//
// The login (live_logins): generated username ('ev-' + 6 lowercase letters/digits, unique across the table) and a generated
// password (16 characters from an alphabet without look-alikes, capital letters and digits). bcryptjs hash (cost 10) is what the
// server checks; the plaintext is also kept in password_shown so the organiser can see it again (same precedent as the floor
// officials' PIN). Neither the hash nor the plaintext ever leaves this file except to the organiser's own panel.
// session_nonce: New password rotates it, which logs every device out (a device's token carries the nonce it signed in with).
//
// A device session is a signed token (HS256, SESSION_SECRET) { did, tid, nonce } sent in the X-Live-Session header. Every
// request re-reads the device row, its login and its event (sessionFor): a rotated nonce (New password) answers 401, a
// logged-out device (Close event) answers 410 and an event that is no longer Live answers 403. A FINALIZED event does NOT end
// a device's session (spec 7.6: finalising does not log devices out, and turns arriving afterwards are kept, never applied):
// sessionFor passes it through marked finalized:true, and a route only accepts that when it asks for it
// (requireSession(req, res, { allowFinalized: true }); only `turn` and `confirm` do; `confirm` then answers 410 itself). Every other route answers 410.
//
// THE CONTRACT FOR live_turns.entered (what the scoring app sends for one turn; Task 6 consumes it):
//   { mode: 'total' | 'darts',      how the turn was keyed: one total, or dart by dart
//     game: 'x01' | 'cricket',
//     score: int,                    points the turn scored (0 for a bust or no score)
//     darts: int 1-3,                darts thrown in the turn (3 on a bust)
//     bust: bool,
//     finish?: 1 | 2 | 3,            the dart (1st, 2nd or 3rd) the leg was finished with, when the turn won the leg
//     segments?: string[],           dart by dart only: one entry per dart, e.g. 'T20', 'D16', 'S5', 'B', 'DB', 'M'
//     marks?: int }                  Cricket only: marks the turn scored
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { sql } = require('./db');
const throttle = require('./throttle');
const LiveSettings = require('../../live-settings');
const LiveBoards = require('../../live-boards');

class LiveError extends Error {
  constructor(code, reason) { super(code); this.code = code; if (reason) this.reason = reason; }
}

const BCRYPT_COST = 10;
const PASSWORD_LENGTH = 16;
const PASSWORD_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';    // no 0 O 1 I L
const USERNAME_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const USERNAME_MAX = 40;
const PASSWORD_MAX = 100;
const SESSION_DAYS = 7;
const MAX_DEVICES = 64;                // devices of one event signed in at the same time (a logged-out device does not count)
/* Sign-in throttling counts WRONG passwords only; a correct sign-in never counts, so a venue's tablets (one shared public
   address, one shared username) can all sign in as often as they like. 5 wrong in a minute for one address+username block that
   pair until the minute is over; 20 wrong in 10 minutes from one address (any usernames, known or not) block that address until
   the 10 minutes are over. The address cap also bounds the bcrypt work a guesser can cause. There is no limit per username:
   it is shared by every tablet and not secret, so a per-username limit would let anyone lock the venue out. */
const WINDOW_MS = 60 * 1000;
const PAIR_LIMIT = 5;
const IP_WINDOW_MS = 10 * 60 * 1000;
const IP_LIMIT = 20;

function pick(alphabet, n) {
  let s = '';
  for (let i = 0; i < n; i++) s += alphabet[crypto.randomInt(0, alphabet.length)];
  return s;
}
const newUsername = () => 'ev-' + pick(USERNAME_ALPHABET, 6);
const newPassword = () => pick(PASSWORD_ALPHABET, PASSWORD_LENGTH);
const newNonce = () => crypto.randomBytes(16).toString('base64url');
const newDeviceId = () => 'dev_' + crypto.randomBytes(9).toString('base64url').replace(/[^A-Za-z0-9]/g, 'x');
/* What a person typed, made comparable: the username is lower case; the password is capitals and digits only, so spaces
   and the case a tablet keyboard starts with do not matter. */
const normUsername = (v) => String(v == null ? '' : v).trim().toLowerCase();
const normPassword = (v) => String(v == null ? '' : v).replace(/\s+/g, '').toUpperCase();
const isFinalized = (data) => !!(data && typeof data === 'object' && data.finalized);
async function q(fn) {
  try { return await fn(); }
  catch (e) { if (e && e.code === '42P01') throw new LiveError('not_set_up'); throw e; }
}
function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('SESSION_SECRET is not set');
  return s;
}

/* ---------- the organiser's side (called by the panel route) ---------- */

/* The event, if this organiser may manage it (an Admin may manage any). */
async function ownEvent(organizer, tournamentId) {
  const rows = organizer.role === 'admin'
    ? await sql`SELECT id, data, created_by FROM tournaments WHERE id = ${tournamentId}`
    : await sql`SELECT id, data, created_by FROM tournaments WHERE id = ${tournamentId} AND created_by = ${organizer.id}`;
  if (!rows.length) throw new LiveError('not_found');
  return rows[0];
}
const shown = (r) => ({ username: r.username, password: r.password_shown });

/* The event's login, made the first time (the event must be Live and not finalized), the same one every time after. */
async function enable(organizer, tournamentId) {
  return q(async () => {
    const ev = await ownEvent(organizer, tournamentId);
    if (isFinalized(ev.data)) throw new LiveError('finalized');
    if (!LiveSettings.isLive(ev.data)) throw new LiveError('live_off');
    for (let attempt = 0; attempt < 8; attempt++) {
      const have = await sql`SELECT tournament_id, username, password_shown FROM live_logins WHERE tournament_id = ${tournamentId}`;
      if (have.length) return shown(have[0]);
      const username = newUsername(), password = newPassword();
      const hash = await bcrypt.hash(password, BCRYPT_COST);
      try {
        const rows = await sql`
          INSERT INTO live_logins (tournament_id, username, password_hash, password_shown, session_nonce)
          VALUES (${tournamentId}, ${username}, ${hash}, ${password}, ${newNonce()})
          ON CONFLICT (tournament_id) DO NOTHING
          RETURNING username, password_shown`;
        if (rows.length) return shown(rows[0]);
      } catch (e) {
        if (!(e && e.code === '23505')) throw e;   // that username is taken: make another
      }
    }
    throw new Error('could not make a unique live username');
  });
}
/* The login as the organiser sees it, or null when Live scoring has not been enabled for the event. */
async function show(organizer, tournamentId) {
  return q(async () => {
    await ownEvent(organizer, tournamentId);
    const rows = await sql`SELECT tournament_id, username, password_shown FROM live_logins WHERE tournament_id = ${tournamentId}`;
    return rows.length ? shown(rows[0]) : null;
  });
}
/* A new password and a new session_nonce: every device signed in with the old one answers 401 from its next request. */
async function newPasswordFor(organizer, tournamentId) {
  return q(async () => {
    const ev = await ownEvent(organizer, tournamentId);
    if (isFinalized(ev.data)) throw new LiveError('finalized');
    const password = newPassword();
    const hash = await bcrypt.hash(password, BCRYPT_COST);
    const rows = await sql`
      UPDATE live_logins SET password_hash = ${hash}, password_shown = ${password}, session_nonce = ${newNonce()}
      WHERE tournament_id = ${tournamentId}
      RETURNING username, password_shown`;
    if (!rows.length) throw new LiveError('no_login');
    return shown(rows[0]);
  });
}

/* ---------- the organiser's Boards panel (spec 7.2, 7.3; route panel) ---------- */

const toIso = (v) => (v ? new Date(v).toISOString() : null);
/* Every device the event has seen, oldest first: [{ id, board, lastSeenAt, unsent, loggedOut }]. */
async function panelDevices(tournamentId) {
  return q(async () => {
    const rows = await sql`SELECT id, board, last_seen_at, unsent, logged_out_at FROM live_devices WHERE tournament_id = ${tournamentId} ORDER BY created_at, id`;
    return rows.map((r) => ({ id: r.id, board: r.board == null ? null : Number(r.board), lastSeenAt: toIso(r.last_seen_at), unsent: Number(r.unsent) || 0, loggedOut: !!r.logged_out_at }));
  });
}
/* The matches a logged-out device still holds but has not started ('waiting') go back to the pool (device_id empty); a match it
   is playing (playing / awaitingConfirm) stays held until the organiser takes it over (spec 7.4). */
async function releaseWaiting(tournamentId) {
  await sql`
    UPDATE live_matches SET device_id = NULL
    WHERE tournament_id = ${tournamentId} AND state = 'waiting'
      AND device_id IN (SELECT id FROM live_devices WHERE tournament_id = ${tournamentId} AND logged_out_at IS NOT NULL)`;
}
/* Logs one device out. false = no such device of this event, or it was out already. A lend FROM its board ends with it unless
   another signed-in device holds that board. */
async function logoutDevice(tournamentId, deviceId) {
  return q(async () => {
    const rows = await sql`UPDATE live_devices SET logged_out_at = now() WHERE id = ${deviceId} AND tournament_id = ${tournamentId} AND logged_out_at IS NULL RETURNING id, board`;
    if (!rows.length) return false;
    await releaseWaiting(tournamentId);
    // a take-over request this device was still waiting on can never be carried out: it is void (the log keeps it)
    await sql`UPDATE live_takeovers SET answer = 'void', decided_by = 'system', decided_at = now() WHERE tournament_id = ${tournamentId} AND answer IS NULL AND to_device = ${deviceId}`;
    const board = rows[0].board == null ? null : Number(rows[0].board);
    if (board != null && !(await boardHolders(tournamentId)).some((h) => h.board === board)) {
      await sql`UPDATE live_lends SET ended_at = now() WHERE tournament_id = ${tournamentId} AND from_board = ${board} AND ended_at IS NULL`;
    }
    return true;
  });
}
/* New password: the devices already answer 401 (the nonce moved); this also marks them out, frees their waiting matches and ends every lend. */
async function logoutAllDevices(tournamentId) {
  return q(async () => {
    await sql`UPDATE live_devices SET logged_out_at = now() WHERE tournament_id = ${tournamentId} AND logged_out_at IS NULL`;
    await releaseWaiting(tournamentId);
    await sql`UPDATE live_takeovers SET answer = 'void', decided_by = 'system', decided_at = now() WHERE tournament_id = ${tournamentId} AND answer IS NULL`;   // every asking device is out now
    await sql`UPDATE live_lends SET ended_at = now() WHERE tournament_id = ${tournamentId} AND ended_at IS NULL`;
  });
}
/* When the organiser closed the event (Close event), an ISO time, or null (open, or no login yet). */
async function closedAt(tournamentId) {
  return q(async () => {
    const rows = await sql`SELECT closed_at FROM live_logins WHERE tournament_id = ${tournamentId}`;
    return rows.length ? toIso(rows[0].closed_at) : null;
  });
}
/* Marks the event closed, once: the ISO time, or null when it was closed already. The caller logs the devices out
   (logoutAllDevices) right after; nobody can sign in again (deviceLogin). */
async function closeLogin(tournamentId) {
  return q(async () => {
    const rows = await sql`UPDATE live_logins SET closed_at = now() WHERE tournament_id = ${tournamentId} AND closed_at IS NULL RETURNING closed_at`;
    return rows.length ? toIso(rows[0].closed_at) : null;
  });
}
/* The matches the organiser flagged as disputed: the list of their pos. */
async function disputedPositions(tournamentId) {
  return q(async () => {
    const rows = await sql`SELECT pos FROM live_matches WHERE tournament_id = ${tournamentId} AND disputed = true`;
    return rows.map((r) => r.pos);
  });
}
/* Sets or clears the flag. false = the match has no live row. */
async function setDisputed(tournamentId, pos, on) {
  return q(async () => {
    const rows = await sql`UPDATE live_matches SET disputed = ${!!on} WHERE tournament_id = ${tournamentId} AND pos = ${pos} RETURNING pos`;
    return rows.length > 0;
  });
}
/* When each board last finished a match, for the knockout board suggestions: { board: ms }. A board whose matches never ended
   (nothing played, or only on paper) is not listed: it counts as idle longest. The board a match was PLAYED on (a lend sends a tablet
   to another board's group) is the one that was busy. */
async function boardIdleSince(tournamentId) {
  return q(async () => {
    const rows = await sql`SELECT COALESCE(played_on_board, board) AS board, max(ended_at) AS ended_at FROM live_matches WHERE tournament_id = ${tournamentId} AND ended_at IS NOT NULL AND COALESCE(played_on_board, board) IS NOT NULL GROUP BY COALESCE(played_on_board, board)`;
    const out = {};
    rows.forEach((r) => { const ms = r.ended_at ? new Date(r.ended_at).getTime() : NaN; if (r.board != null && !isNaN(ms)) out[Number(r.board)] = ms; });
    return out;
  });
}
/* Scored on paper, on (spec 10.5, D16): the match's row is made or updated (paper, state 'paper') and no device holds it any more, so the
   device's next call is refused. One statement, so a device that claims the match at the very same moment cannot slip through: a held match
   is taken off its device only with force (the organiser or official confirmed). A match that is over is never touched. false = nothing
   changed (the match is held and force is not set, or it is over). board: the match's own board, for a row made here. */
async function setPaperOn(tournamentId, pos, board, force) {
  return q(async () => {
    const rows = await sql`
      INSERT INTO live_matches (tournament_id, pos, state, device_id, board, paper)
      VALUES (${tournamentId}, ${pos}, 'paper', NULL, ${board}, true)
      ON CONFLICT (tournament_id, pos) DO UPDATE SET paper = true, state = 'paper', device_id = NULL
      WHERE live_matches.state NOT IN ('confirmed', 'retired', 'voided') AND (live_matches.device_id IS NULL OR ${!!force})
      RETURNING pos`;
    return rows.length > 0;
  });
}
/* Paper off: the match goes back to the tablets (waiting, nobody holds it). Only while it has no result in the row; the caller checks the
   event's own result. false = nothing changed (no paper row, or the match is over). */
async function setPaperOff(tournamentId, pos) {
  return q(async () => {
    const rows = await sql`
      UPDATE live_matches SET paper = false, state = 'waiting', device_id = NULL
      WHERE tournament_id = ${tournamentId} AND pos = ${pos} AND paper = true AND state NOT IN ('confirmed', 'retired', 'voided')
      RETURNING pos`;
    return rows.length > 0;
  });
}
/* The lends running now, with their ids: [{ id, from, to, startedAt }]. */
async function activeLends(tournamentId) {
  return q(async () => {
    const rows = await sql`SELECT id, from_board, to_board, started_at FROM live_lends WHERE tournament_id = ${tournamentId} AND ended_at IS NULL ORDER BY started_at, id`;
    return rows.map((r) => ({ id: r.id, from: Number(r.from_board), to: Number(r.to_board), startedAt: toIso(r.started_at) }));
  });
}
/* A free board lends its tablet to a busy board. One statement, so two lends from the same board cannot both start: false = a
   lend from that board is running already. */
async function addLend(tournamentId, from, to) {
  return q(async () => {
    const id = 'lend_' + crypto.randomBytes(9).toString('base64url').replace(/[^A-Za-z0-9]/g, 'x');
    const rows = await sql`
      INSERT INTO live_lends (id, tournament_id, from_board, to_board)
      SELECT ${id}, ${tournamentId}, ${from}, ${to}
      WHERE NOT EXISTS (SELECT 1 FROM live_lends WHERE tournament_id = ${tournamentId} AND from_board = ${from} AND ended_at IS NULL)
      RETURNING id`;
    return rows.length ? id : false;
  });
}
/* End lend. false = no running lend with that id in this event. A match the lent device already holds stays its own (heldPlace). */
async function endLend(tournamentId, id) {
  return q(async () => {
    const rows = await sql`UPDATE live_lends SET ended_at = now() WHERE id = ${id} AND tournament_id = ${tournamentId} AND ended_at IS NULL RETURNING id`;
    return rows.length > 0;
  });
}
/* A lend ends by itself when the board it helps has no waiting match left (spec 7.3). `event` is the event ({ data }); the same
   notion of "waiting" as the device's list (routes/live/view.js isWaiting). ctx and rows may be passed when the caller has them
   already. Returns the ids it ended. Called when the panel is read and right after a match is claimed. */
async function endIdleLends(tournamentId, event, pre) {
  const lends = await activeLends(tournamentId);
  if (!lends.length) return [];
  const view = require('../_routes/live/view');   // lazily: the view needs the engine, which the other organiser calls do not
  const ctx = (pre && pre.ctx) || view.load({ tournament: event });
  const rows = (pre && pre.rows) || await liveRows(tournamentId);
  const ended = [];
  for (const to of Array.from(new Set(lends.map((l) => l.to)))) {
    if (view.waitingOn(ctx, rows, to).length) continue;
    const done = await q(() => sql`UPDATE live_lends SET ended_at = now() WHERE tournament_id = ${tournamentId} AND to_board = ${to} AND ended_at IS NULL RETURNING id`);
    done.forEach((r) => ended.push(r.id));
  }
  return ended;
}

/* ---------- the device's side ---------- */

function signSession(device) {
  return jwt.sign({ did: device.id, tid: device.tournamentId, nonce: device.nonce }, secret(), { algorithm: 'HS256', expiresIn: SESSION_DAYS * 24 * 3600 });
}
/* The claims of a session token, or null when it is not one of ours. */
function verifySession(raw) {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const p = jwt.verify(raw, secret(), { algorithms: ['HS256'] });
    return p && typeof p.did === 'string' && typeof p.tid === 'string' && typeof p.nonce === 'string' ? p : null;
  } catch (e) { return null; }
}
const tournamentView = (data) => {
  const c = (data && data.eventCreation) || {};
  return { name: c.tournamentName || '', eventName: c.eventName || '' };
};

/* Signs a device in. Throws LiveError: login_required, rate_limited, bad_login, too_many_devices (64 devices are signed in already), link_ended (reason 'closed': the organiser closed
   the event; reason 'finalized': a NEW sign-in to a finalized event is refused; devices already signed in stay, see sessionFor), live_off. Returns
   { token, device: { id }, tournament: { name, eventName } }. Throttling: see IP_LIMIT above. */
async function deviceLogin(username, password, ip) {
  if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password.trim()) throw new LiveError('login_required');
  const user = normUsername(username), pass = normPassword(password);
  if (user.length > USERNAME_MAX || pass.length > PASSWORD_MAX) throw new LiveError('bad_login');
  return q(async () => {
    const pairKey = 'live-login:' + user + ':' + ip, ipKey = 'live-login-ip:' + ip;
    if (await throttle.isBlocked(pairKey, PAIR_LIMIT, WINDOW_MS) || await throttle.isBlocked(ipKey, IP_LIMIT, IP_WINDOW_MS)) throw new LiveError('rate_limited');
    const rows = await sql`
      SELECT l.tournament_id, l.password_hash, l.session_nonce, l.closed_at, t.data AS t_data
      FROM live_logins l JOIN tournaments t ON t.id = l.tournament_id WHERE l.username = ${user}`;
    const row = rows[0] || null;
    // an unknown username costs the same bcrypt work and the same database calls as a known one with a wrong password
    const ok = await bcrypt.compare(pass, row ? row.password_hash : DUMMY_HASH);
    if (!row || !ok) {
      await throttle.hit(pairKey, PAIR_LIMIT, WINDOW_MS);
      await throttle.hit(ipKey, IP_LIMIT, IP_WINDOW_MS);
      throw new LiveError('bad_login');
    }
    await throttle.clear(pairKey);
    // the password is right: now say what is wrong with the event (never before, so a guesser learns nothing)
    if (row.closed_at) throw new LiveError('link_ended', 'closed');   // Close event: the scoring is over, nobody signs in again
    if (isFinalized(row.t_data)) throw new LiveError('link_ended', 'finalized');
    if (!LiveSettings.isLive(row.t_data)) throw new LiveError('live_off');
    const id = newDeviceId();
    // at most MAX_DEVICES devices of an event signed in at once (a logged-out one does not count): the check and the insert are one statement
    const made = await sql`
      INSERT INTO live_devices (id, tournament_id, session_nonce, last_seen_at)
      SELECT ${id}, ${row.tournament_id}, ${row.session_nonce}, now()
      WHERE (SELECT count(*) FROM live_devices WHERE tournament_id = ${row.tournament_id} AND logged_out_at IS NULL) < ${MAX_DEVICES}
      RETURNING id`;
    if (!made.length) throw new LiveError('too_many_devices');
    return { token: signSession({ id, tournamentId: row.tournament_id, nonce: row.session_nonce }), device: { id }, tournament: tournamentView(row.t_data) };
  });
}
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(12).toString('hex'), BCRYPT_COST);

/* The device and event behind a session's claims, looked up again on every request. Checked in this order:
     null                          no valid session (never signed in, a New password, a device that is not there): 401 no_session
     { refused: 'closed' }         the device was logged out, or the event was closed (Close event): 410 link_ended
     { refused: 'live_off' }       the event is no longer Live: 403 live_off
     { device, tournament, finalized: true }   the event is finalized: the device stays signed in (spec 7.6), but only a route
                                   that opts in (requireSession allowFinalized) may use it; every other route answers 410 link_ended
     { device, tournament }        the session works */
async function sessionFor(claims) {
  if (!claims) return null;
  return q(async () => {
    const rows = await sql`
      SELECT d.id, d.tournament_id, d.board, d.session_nonce, d.logged_out_at, d.unsent, l.session_nonce AS login_nonce, l.closed_at, t.data AS t_data, t.updated_at AS t_updated_at
      FROM live_devices d JOIN tournaments t ON t.id = d.tournament_id LEFT JOIN live_logins l ON l.tournament_id = d.tournament_id
      WHERE d.id = ${claims.did}`;
    const r = rows[0];
    if (!r || r.tournament_id !== claims.tid || !r.login_nonce) return null;
    if (!sameText(r.session_nonce, claims.nonce) || !sameText(r.login_nonce, claims.nonce)) return null;
    if (r.logged_out_at || r.closed_at) return { refused: 'closed' };   // logged out, or the event was closed (a device that signed in while it was being closed)
    if (!LiveSettings.isLive(r.t_data)) return { refused: 'live_off' };
    await sql`UPDATE live_devices SET last_seen_at = now() WHERE id = ${r.id}`;
    const out = {
      device: { id: r.id, tournamentId: r.tournament_id, board: r.board == null ? null : Number(r.board), unsent: Number(r.unsent) || 0 },
      tournament: { id: r.tournament_id, data: r.t_data, updated_at: r.t_updated_at }
    };
    if (isFinalized(r.t_data)) out.finalized = true;
    return out;
  });
}
function sameText(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/* ---------- the device's boards and matches (spec sections 5, 7.3 and 8) ---------- */

const cleanRow = (r) => ({
  pos: r.pos, state: r.state, device_id: r.device_id || null, paper: !!r.paper, retired_side: r.retired_side || null,
  board: r.board == null ? null : Number(r.board), played_on_board: r.played_on_board == null ? null : Number(r.played_on_board),
  summary: r.summary && typeof r.summary === 'object' ? r.summary : {}
});
/* Every live_matches row of the event, as { pos, state, device_id, board, played_on_board, paper, retired_side, summary }. */
async function liveRows(tournamentId) {
  return q(async () => {
    const rows = await sql`SELECT pos, state, device_id, board, played_on_board, paper, retired_side, summary FROM live_matches WHERE tournament_id = ${tournamentId}`;
    return rows.map(cleanRow);
  });
}
/* One match's row, or null. */
async function liveRow(tournamentId, pos) {
  return q(async () => {
    const rows = await sql`SELECT pos, state, device_id, board, played_on_board, paper, retired_side, summary FROM live_matches WHERE tournament_id = ${tournamentId} AND pos = ${pos}`;
    return rows.length ? cleanRow(rows[0]) : null;
  });
}
/* The lends running now (ended_at empty): [{ from, to }]. */
async function liveLends(tournamentId) {
  return q(async () => {
    const rows = await sql`SELECT from_board, to_board FROM live_lends WHERE tournament_id = ${tournamentId} AND ended_at IS NULL`;
    return rows.map((r) => ({ from: Number(r.from_board), to: Number(r.to_board) }));
  });
}
/* The boards the event's signed-in devices hold: [{ id, board }] (a device that was logged out holds nothing). */
async function boardHolders(tournamentId) {
  return q(async () => {
    const rows = await sql`SELECT id, board FROM live_devices WHERE tournament_id = ${tournamentId} AND logged_out_at IS NULL AND board IS NOT NULL`;
    return rows.map((r) => ({ id: r.id, board: Number(r.board) }));
  });
}
/* A device takes its board, once. Refused (false) when the device has a board already, was logged out, or another signed-in device
   holds that board and no running lend lends it (two devices share a board only through a lend: spec 7.3). One statement, so
   the test and the write are not apart; two devices picking the same free board at the very same moment are the one case a
   single statement cannot fully separate (it would need a lock); the match claim below is exact. */
async function setBoard(deviceId, tournamentId, n) {
  return q(async () => {
    const rows = await sql`
      UPDATE live_devices SET board = ${n}
      WHERE id = ${deviceId} AND tournament_id = ${tournamentId} AND board IS NULL AND logged_out_at IS NULL
        AND (NOT EXISTS (SELECT 1 FROM live_devices o WHERE o.tournament_id = ${tournamentId} AND o.board = ${n} AND o.logged_out_at IS NULL AND o.id <> ${deviceId})
          OR EXISTS (SELECT 1 FROM live_lends l WHERE l.tournament_id = ${tournamentId} AND l.from_board = ${n} AND l.ended_at IS NULL))
      RETURNING board`;
    return rows.length > 0;
  });
}
/* A device claims a match: exactly one of any number of simultaneous callers wins. A match with no row gets one by INSERT ... ON
   CONFLICT DO NOTHING (a loser inserts nothing); a match whose row nobody holds (device_id empty, not paper, not over) is taken
   by UPDATE ... WHERE device_id IS NULL. true = this device now holds the match. board: the match's own board; playedOn: the
   board it is played on (the same, unless a lend sends the device to another board's group). A fresh claim is state 'waiting'
   (a held match that has not started: live-boards.js); the device moves it on to checkedIn / playing. */
async function claimMatch(tournamentId, pos, deviceId, board, playedOn) {
  return q(async () => {
    const ins = await sql`
      INSERT INTO live_matches (tournament_id, pos, state, device_id, board, played_on_board)
      VALUES (${tournamentId}, ${pos}, 'waiting', ${deviceId}, ${board}, ${playedOn})
      ON CONFLICT (tournament_id, pos) DO NOTHING
      RETURNING pos`;
    if (ins.length) return true;
    const upd = await sql`
      UPDATE live_matches SET device_id = ${deviceId}, board = ${board}, played_on_board = ${playedOn}
      WHERE tournament_id = ${tournamentId} AND pos = ${pos} AND device_id IS NULL AND paper = false AND state NOT IN ('confirmed', 'retired', 'voided')
      RETURNING pos`;
    return upd.length > 0;
  });
}

/* ---------- turns, state changes and the end of a match (spec sections 8 and 10; routes turn, state, confirm, retire) ---------- */

/* One match's whole live row (what the turn / confirm / retire / state routes decide on), or null. summary is the public picture. */
async function matchFull(tournamentId, pos) {
  return q(async () => {
    const rows = await sql`SELECT pos, state, device_id, board, played_on_board, paper, retired_side, changed_by_organiser, summary FROM live_matches WHERE tournament_id = ${tournamentId} AND pos = ${pos}`;
    if (!rows.length) return null;
    const r = rows[0];
    return Object.assign(cleanRow(r), { changed_by_organiser: !!r.changed_by_organiser, summary: r.summary && typeof r.summary === 'object' ? r.summary : {} });
  });
}
/* One turn row: APPEND-ONLY (INSERT only; the code never updates or deletes a live_turns row). The id is the device's own, so a
   second insert with the same id inserts nothing. false = it was already there. */
async function insertTurn(tournamentId, t) {
  return q(async () => {
    const rows = await sql`
      INSERT INTO live_turns (id, tournament_id, pos, leg, side, player, entered, device_id, supersedes, ignored, ignored_reason)
      VALUES (${t.id}, ${tournamentId}, ${t.pos}, ${t.leg}, ${t.side}, ${t.player}, ${JSON.stringify(t.entered)}::jsonb, ${t.deviceId}, ${t.supersedes}, ${!!t.ignored}, ${t.ignoredReason || null})
      ON CONFLICT (tournament_id, id) DO NOTHING
      RETURNING id`;
    return rows.length > 0;
  });
}
/* A turn that is already stored (for a repeat): { pos, device_id, ignored, ignored_reason } or null. */
async function turnById(tournamentId, id) {
  return q(async () => {
    const rows = await sql`SELECT pos, device_id, ignored, ignored_reason FROM live_turns WHERE tournament_id = ${tournamentId} AND id = ${id}`;
    return rows.length ? { pos: rows[0].pos, device_id: rows[0].device_id, ignored: !!rows[0].ignored, ignored_reason: rows[0].ignored_reason || null } : null;
  });
}
/* The turns of a match that count (not ignored, and not from before the match was restarted: the organiser cleared a finished result
   and the match started again, live_matches.restarted_at), oldest first: [{ id, leg, side, player, entered, supersedes }]. */
async function matchTurns(tournamentId, pos) {
  return q(async () => {
    const rows = await sql`SELECT t.id, t.leg, t.side, t.player, t.entered, t.supersedes FROM live_turns t LEFT JOIN live_matches m ON m.tournament_id = t.tournament_id AND m.pos = t.pos WHERE t.tournament_id = ${tournamentId} AND t.pos = ${pos} AND t.ignored = false AND (m.restarted_at IS NULL OR t.created_at >= m.restarted_at) ORDER BY t.created_at, t.id`;
    return rows.map((r) => ({ id: r.id, leg: Number(r.leg), side: r.side, player: r.player == null ? null : r.player, entered: r.entered, supersedes: r.supersedes || null }));
  });
}
/* The turns that count (not ignored) of every match of the event that is confirmed or retired, grouped match by match (oldest first within
   a match): [{ id, pos, leg, side, player, entered, supersedes }]. The organiser's Event stats read it; nothing is written. */
async function eventTurns(tournamentId) {
  return q(async () => {
    const rows = await sql`SELECT t.id, t.pos, t.leg, t.side, t.player, t.entered, t.supersedes FROM live_turns t JOIN live_matches m ON m.tournament_id = t.tournament_id AND m.pos = t.pos WHERE t.tournament_id = ${tournamentId} AND t.ignored = false AND m.state IN ('confirmed', 'retired') AND (m.restarted_at IS NULL OR t.created_at >= m.restarted_at) ORDER BY t.pos, t.created_at, t.id`;
    return rows.map((r) => ({ id: r.id, pos: r.pos, leg: Number(r.leg), side: r.side, player: r.player == null ? null : r.player, entered: r.entered, supersedes: r.supersedes || null }));
  });
}
/* EVERY turn of a match, ignored ones too and those from before a restart, oldest first (the organiser's match history). raw device id:
   the route turns it into "Device N". beforeRestart: the turn is older than the match's restarted_at (it never counts).
   [{ id, leg, side, player, entered, deviceId, supersedes, ignored, ignoredReason, createdAt, beforeRestart }] */
async function allTurns(tournamentId, pos) {
  return q(async () => {
    const rows = await sql`SELECT t.id, t.leg, t.side, t.player, t.entered, t.device_id, t.supersedes, t.ignored, t.ignored_reason, t.created_at, (m.restarted_at IS NOT NULL AND t.created_at < m.restarted_at) AS before_restart FROM live_turns t LEFT JOIN live_matches m ON m.tournament_id = t.tournament_id AND m.pos = t.pos WHERE t.tournament_id = ${tournamentId} AND t.pos = ${pos} ORDER BY t.created_at, t.id`;
    return rows.map((r) => ({
      id: r.id, leg: Number(r.leg), side: r.side, player: r.player == null ? null : r.player, entered: r.entered, deviceId: r.device_id,
      supersedes: r.supersedes || null, ignored: !!r.ignored, ignoredReason: r.ignored_reason || null, createdAt: toIso(r.created_at), beforeRestart: !!r.before_restart
    }));
  });
}
/* The public one-line picture of a match, rewritten after every accepted turn. */
async function setSummary(tournamentId, pos, summary) {
  return q(async () => { await sql`UPDATE live_matches SET summary = ${JSON.stringify(summary)}::jsonb WHERE tournament_id = ${tournamentId} AND pos = ${pos}`; });
}
/* What a device says about itself on a turn: how many turns it still holds unsent (and that it is alive). */
async function setUnsent(deviceId, tournamentId, n) {
  return q(async () => { await sql`UPDATE live_devices SET unsent = ${n}, last_seen_at = now() WHERE id = ${deviceId} AND tournament_id = ${tournamentId}`; });
}
/* The holder moves its match to 'playing' (first time: started_at is set; starterPatch is a JSON text merged into summary). Only
   from waiting / checkedIn / awaitingConfirm, only by the device that holds it, never over an organiser's change. */
async function setPlaying(tournamentId, pos, deviceId, starterPatch) {
  return q(async () => {
    const rows = await sql`
      UPDATE live_matches SET state = 'playing', started_at = COALESCE(started_at, now()), summary = summary || ${starterPatch}::jsonb
      WHERE tournament_id = ${tournamentId} AND pos = ${pos} AND device_id = ${deviceId} AND changed_by_organiser = false AND state IN ('waiting', 'checkedIn', 'awaitingConfirm')
      RETURNING pos`;
    return rows.length > 0;
  });
}
/* A starter sent for a match that is already 'playing' (held by the caller, not changed by the organiser): stored in the summary only. */
async function setStarter(tournamentId, pos, deviceId, starterPatch) {
  return q(async () => {
    const rows = await sql`
      UPDATE live_matches SET summary = summary || ${starterPatch}::jsonb
      WHERE tournament_id = ${tournamentId} AND pos = ${pos} AND device_id = ${deviceId} AND changed_by_organiser = false AND state = 'playing'
      RETURNING pos`;
    return rows.length > 0;
  });
}
/* playing -> awaitingConfirm (the match is won on the device). */
async function setAwaitingConfirm(tournamentId, pos, deviceId) {
  return q(async () => {
    const rows = await sql`
      UPDATE live_matches SET state = 'awaitingConfirm'
      WHERE tournament_id = ${tournamentId} AND pos = ${pos} AND device_id = ${deviceId} AND changed_by_organiser = false AND state = 'playing'
      RETURNING pos`;
    return rows.length > 0;
  });
}
/* The match is over by the device's confirmed result. */
async function setConfirmed(tournamentId, pos, deviceId) {
  return q(async () => {
    const rows = await sql`
      UPDATE live_matches SET state = 'confirmed', ended_at = now()
      WHERE tournament_id = ${tournamentId} AND pos = ${pos} AND device_id = ${deviceId} AND changed_by_organiser = false AND state IN ('waiting', 'checkedIn', 'playing', 'awaitingConfirm')
      RETURNING pos`;
    return rows.length > 0;
  });
}
/* The match is over by a retirement of `side` (the walkover itself is the event's noShow result). */
async function setRetired(tournamentId, pos, deviceId, side) {
  return q(async () => {
    const rows = await sql`
      UPDATE live_matches SET state = 'retired', retired_side = ${side}, ended_at = now()
      WHERE tournament_id = ${tournamentId} AND pos = ${pos} AND device_id = ${deviceId} AND changed_by_organiser = false AND state IN ('waiting', 'checkedIn', 'playing', 'awaitingConfirm')
      RETURNING pos`;
    return rows.length > 0;
  });
}
/* The organiser's result stood over this device's match (D18): the device's turns stay, nothing more is applied. */
async function markChangedByOrganiser(tournamentId, pos) {
  return q(async () => { await sql`UPDATE live_matches SET changed_by_organiser = true WHERE tournament_id = ${tournamentId} AND pos = ${pos}`; });
}
/* The organiser's whole-event save changed these results (D18): every live row for them records it (a device's next call answers
   409 changed_by_organiser). Only called after a SAVED change on a Live event; it never fails the save: a missing table (a Manual
   event, or before the live SQL was run) is ignored silently and any other trouble is only logged. No live row, nothing happens. */
async function markOrganiserResults(tournamentId, positions) {
  const list = Array.isArray(positions) ? positions.filter((p) => typeof p === 'string').slice(0, 5000) : [];
  if (!list.length) return;
  try {
    await sql`UPDATE live_matches SET changed_by_organiser = true WHERE tournament_id = ${tournamentId} AND pos = ANY(${list}::text[]) AND paper = false AND state NOT IN ('retired', 'voided')`;
  } catch (e) {
    if (!(e && e.code === '42P01')) console.error('markOrganiserResults failed: ' + (e && e.code ? '[' + e.code + '] ' : '') + (e && e.message ? e.message : e));
  }
}

/* The organiser CLEARED these results on a Live event (D18): a match a device had finished (confirmed / retired) is open again, so
   it goes back to the start: waiting, nobody holds it, not flagged (it can be picked, or typed by hand, again). The turns stay
   (live_turns is append-only) but are no longer counted: restarted_at marks the restart, the public summary and started_at are
   emptied and a retirement is forgotten, so the next play of the match starts from nothing. Never fails the save (same rule as markOrganiserResults). Paper matches are left alone. */
async function releaseClearedResults(tournamentId, positions) {
  const list = Array.isArray(positions) ? positions.filter((p) => typeof p === 'string').slice(0, 5000) : [];
  if (!list.length) return;
  try {
    await sql`UPDATE live_matches SET state = 'waiting', device_id = NULL, changed_by_organiser = false, ended_at = NULL, restarted_at = now(), summary = '{}'::jsonb, started_at = NULL, retired_side = NULL WHERE tournament_id = ${tournamentId} AND pos = ANY(${list}::text[]) AND paper = false AND state IN ('confirmed', 'retired')`;
  } catch (e) {
    if (!(e && e.code === '42P01')) console.error('releaseClearedResults failed: ' + (e && e.code ? '[' + e.code + '] ' : '') + (e && e.message ? e.message : e));
  }
}

/* ---------- take-over requests (spec 7.4; routes takeover, panel, score/takeover) ---------- */

/* A device asks for a match another device is scoring. At most ONE waiting request per match (the statement tests it, and a
   partial unique index backs it up): false = there is one already. Returns the new request's id. First, a waiting request for
   this match that can no longer be carried out (it names a device that is not the match's holder any more, or its asking
   device was logged out) is made void, so it cannot block every later request. */
async function requestTakeover(tournamentId, pos, fromDevice, toDevice) {
  return q(async () => {
    const id = 'tko_' + crypto.randomBytes(9).toString('base64url').replace(/[^A-Za-z0-9]/g, 'x');
    await sql`
      UPDATE live_takeovers SET answer = 'void', decided_by = 'system', decided_at = now()
      WHERE tournament_id = ${tournamentId} AND pos = ${pos} AND answer IS NULL
        AND (from_device IS DISTINCT FROM (SELECT device_id FROM live_matches WHERE tournament_id = ${tournamentId} AND pos = ${pos})
          OR to_device IN (SELECT id FROM live_devices WHERE tournament_id = ${tournamentId} AND logged_out_at IS NOT NULL))`;
    try {
      const rows = await sql`
        INSERT INTO live_takeovers (id, tournament_id, pos, from_device, to_device)
        SELECT ${id}, ${tournamentId}, ${pos}, ${fromDevice}, ${toDevice}
        WHERE NOT EXISTS (SELECT 1 FROM live_takeovers WHERE tournament_id = ${tournamentId} AND pos = ${pos} AND answer IS NULL)
        RETURNING id`;
      return rows.length ? id : false;
    } catch (e) {
      if (e && e.code === '23505') return false;   // another request got in at the same moment
      throw e;
    }
  });
}
/* One request of the event: { id, pos, from_device, to_device, answer, decided_by, created_at } or null. answer is null while waiting. */
async function takeoverById(tournamentId, id) {
  return q(async () => {
    const rows = await sql`SELECT id, pos, from_device, to_device, answer, decided_by, created_at FROM live_takeovers WHERE tournament_id = ${tournamentId} AND id = ${id}`;
    return rows.length ? rows[0] : null;
  });
}
/* The answer, once: of any number of simultaneous answers exactly one updates the row (answer IS NULL is the compare-and-set).
   answer: 'allow' | 'deny' | 'void'; decidedBy: 'org:<id>' | 'off:<id>' | 'system'. null = it was answered already. */
async function answerTakeover(tournamentId, id, answer, decidedBy) {
  return q(async () => {
    const rows = await sql`
      UPDATE live_takeovers SET answer = ${answer}, decided_by = ${decidedBy}, decided_at = now()
      WHERE tournament_id = ${tournamentId} AND id = ${id} AND answer IS NULL
      RETURNING id, pos, from_device, to_device`;
    return rows.length ? rows[0] : null;
  });
}
/* Allow, in ONE statement (each sql call is its own transaction, so the answer and the move happen together or not at all): the
   waiting request is locked (FOR UPDATE), the match goes to the asking device as a compare-and-set on the CURRENT holder (the match
   still in progress, not on paper, not changed by the organiser, the asking device still signed in; the only other change is
   played_on_board: always the asking device's board, so a match that goes back to its own board after a take-over no longer names the board it was lent to), and the request's answer becomes 'allow' when the match moved, else 'void' (it had moved on or ended). Returns
   the final answer ('allow' | 'void'), or null when the request was answered already (or is not there). */
async function allowTakeover(tournamentId, id, decidedBy) {
  return q(async () => {
    const rows = await sql`
      WITH tk AS (
        SELECT id, pos, from_device, to_device FROM live_takeovers WHERE tournament_id = ${tournamentId} AND id = ${id} AND answer IS NULL FOR UPDATE
      ), mv AS (
        UPDATE live_matches m SET device_id = tk.to_device,
          played_on_board = COALESCE((SELECT d2.board FROM live_devices d2 WHERE d2.id = tk.to_device AND d2.tournament_id = ${tournamentId} AND d2.board IS NOT NULL), m.played_on_board)
        FROM tk
        WHERE m.tournament_id = ${tournamentId} AND m.pos = tk.pos AND m.device_id = tk.from_device AND m.paper = false AND m.changed_by_organiser = false
          AND m.state IN ('checkedIn', 'playing', 'awaitingConfirm')
          AND EXISTS (SELECT 1 FROM live_devices d WHERE d.id = tk.to_device AND d.tournament_id = ${tournamentId} AND d.logged_out_at IS NULL)
        RETURNING m.pos
      )
      UPDATE live_takeovers k SET answer = CASE WHEN EXISTS (SELECT 1 FROM mv) THEN 'allow' ELSE 'void' END, decided_by = ${decidedBy}, decided_at = now()
      FROM tk WHERE k.tournament_id = ${tournamentId} AND k.id = tk.id AND k.answer IS NULL
      RETURNING k.id, k.answer`;
    return rows.length ? rows[0].answer : null;
  });
}
/* Every take-over request for one match, answered or not, oldest first (the match history's log):
   [{ id, from_device, to_device, answer, decided_by, requestedAt, decidedAt }] (answer and decided_by are null while waiting). */
async function matchTakeovers(tournamentId, pos) {
  return q(async () => {
    const rows = await sql`SELECT id, from_device, to_device, answer, decided_by, created_at, decided_at FROM live_takeovers WHERE tournament_id = ${tournamentId} AND pos = ${pos} ORDER BY created_at, id`;
    return rows.map((r) => ({ id: r.id, from_device: r.from_device, to_device: r.to_device, answer: r.answer || null, decided_by: r.decided_by || null, requestedAt: toIso(r.created_at), decidedAt: toIso(r.decided_at) }));
  });
}
/* The requests that still mean something: waiting, the match still held by the device the request names, the asking device still
   signed in. [{ id, pos, fromDevice, toDevice, fromBoard, toBoard, requestedAt }] oldest first. pre: { rows, devices } when the
   caller has them already (liveRows, panelDevices). */
async function openTakeovers(tournamentId, pre) {
  const [pending, rows, devices] = await Promise.all([
    q(() => sql`SELECT id, pos, from_device, to_device, created_at FROM live_takeovers WHERE tournament_id = ${tournamentId} AND answer IS NULL ORDER BY created_at, id`),
    (pre && pre.rows) || liveRows(tournamentId),
    (pre && pre.devices) || panelDevices(tournamentId)
  ]);
  const rowBy = {}, devBy = {};
  rows.forEach((r) => { rowBy[r.pos] = r; });
  devices.forEach((d) => { devBy[d.id] = d; });
  const out = [];
  pending.forEach((p) => {
    const r = rowBy[p.pos], to = devBy[p.to_device], from = devBy[p.from_device];
    if (!r || LiveBoards.heldBy(r) !== p.from_device || !to || to.loggedOut) return;
    const fromBoard = from && from.board != null ? from.board : (r.played_on_board != null ? r.played_on_board : r.board);
    out.push({ id: p.id, pos: p.pos, fromDevice: p.from_device, toDevice: p.to_device, fromBoard: fromBoard == null ? null : fromBoard, toBoard: to.board == null ? null : to.board, requestedAt: toIso(p.created_at) });
  });
  return out;
}

module.exports = {
  LiveError, PASSWORD_LENGTH, PASSWORD_ALPHABET,
  enable, show, newPassword: newPasswordFor,
  panelDevices, logoutDevice, logoutAllDevices, activeLends, addLend, endLend, endIdleLends, closedAt, closeLogin, disputedPositions, setDisputed, boardIdleSince, setPaperOn, setPaperOff,
  deviceLogin, sessionFor, signSession, verifySession, tournamentView, ownEvent,
  liveRows, liveRow, liveLends, boardHolders, setBoard, claimMatch,
  matchFull, insertTurn, turnById, matchTurns, eventTurns, allTurns, setSummary, setUnsent, setPlaying, setStarter, setAwaitingConfirm, setConfirmed, setRetired, markChangedByOrganiser, markOrganiserResults, releaseClearedResults,
  requestTakeover, takeoverById, answerTakeover, allowTakeover, openTakeovers, matchTakeovers
};

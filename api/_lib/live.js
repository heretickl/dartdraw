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
// (requireSession(req, res, { allowFinalized: true }); only `turn` and `confirm` do). Every other route answers 410.
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

/* Signs a device in. Throws LiveError: login_required, rate_limited, bad_login, link_ended (finalized: a NEW sign-in to a
   finalized event is refused; devices already signed in stay, see sessionFor), live_off. Returns
   { token, device: { id }, tournament: { name, eventName } }. Throttling: see IP_LIMIT above. */
async function deviceLogin(username, password, ip) {
  if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password.trim()) throw new LiveError('login_required');
  const user = normUsername(username), pass = normPassword(password);
  if (user.length > USERNAME_MAX || pass.length > PASSWORD_MAX) throw new LiveError('bad_login');
  return q(async () => {
    const pairKey = 'live-login:' + user + ':' + ip, ipKey = 'live-login-ip:' + ip;
    if (await throttle.isBlocked(pairKey, PAIR_LIMIT, WINDOW_MS) || await throttle.isBlocked(ipKey, IP_LIMIT, IP_WINDOW_MS)) throw new LiveError('rate_limited');
    const rows = await sql`
      SELECT l.tournament_id, l.password_hash, l.session_nonce, t.data AS t_data
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
    if (isFinalized(row.t_data)) throw new LiveError('link_ended', 'finalized');
    if (!LiveSettings.isLive(row.t_data)) throw new LiveError('live_off');
    const id = newDeviceId();
    await sql`INSERT INTO live_devices (id, tournament_id, session_nonce, last_seen_at) VALUES (${id}, ${row.tournament_id}, ${row.session_nonce}, now())`;
    return { token: signSession({ id, tournamentId: row.tournament_id, nonce: row.session_nonce }), device: { id }, tournament: tournamentView(row.t_data) };
  });
}
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(12).toString('hex'), BCRYPT_COST);

/* The device and event behind a session's claims, looked up again on every request. Checked in this order:
     null                          no valid session (never signed in, a New password, a device that is not there): 401 no_session
     { refused: 'closed' }         the device was logged out (Close event): 410 link_ended
     { refused: 'live_off' }       the event is no longer Live: 403 live_off
     { device, tournament, finalized: true }   the event is finalized: the device stays signed in (spec 7.6), but only a route
                                   that opts in (requireSession allowFinalized) may use it; every other route answers 410 link_ended
     { device, tournament }        the session works */
async function sessionFor(claims) {
  if (!claims) return null;
  return q(async () => {
    const rows = await sql`
      SELECT d.id, d.tournament_id, d.board, d.session_nonce, d.logged_out_at, d.unsent, l.session_nonce AS login_nonce, t.data AS t_data, t.updated_at AS t_updated_at
      FROM live_devices d JOIN tournaments t ON t.id = d.tournament_id LEFT JOIN live_logins l ON l.tournament_id = d.tournament_id
      WHERE d.id = ${claims.did}`;
    const r = rows[0];
    if (!r || r.tournament_id !== claims.tid || !r.login_nonce) return null;
    if (!sameText(r.session_nonce, claims.nonce) || !sameText(r.login_nonce, claims.nonce)) return null;
    if (r.logged_out_at) return { refused: 'closed' };
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

module.exports = {
  LiveError, PASSWORD_LENGTH, PASSWORD_ALPHABET,
  enable, show, newPassword: newPasswordFor,
  deviceLogin, sessionFor, signSession, verifySession, tournamentView, ownEvent
};

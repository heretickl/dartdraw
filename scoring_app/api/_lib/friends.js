// A player's friends list (the friendships table) and friend requests (spec section 8). One row per entry on an owner's
// list: 'linked' (their account, accepted), 'waiting' (their account, request not answered yet) or 'none' (no account,
// or a request that was declined, cancelled or not answered in 30 days: results save for the owner only).
//
// Consent is the point of most of what is here. Nobody gets a request, a held game or an invite email unless their
// address belongs to a CONFIRMED account they have not blocked (and that has not blocked the sender); and nothing the
// API answers says whether an email has an account beyond check/add's "is on DartDraw" (rate-limited per player). A
// blocked pair, the caller's own email and an unconfirmed sign-up all look exactly like "no account".
//
// There is no hook when an account is confirmed (the organiser app's admin route cannot load this file). Instead a 'none'
// entry is looked at again whenever friends code reads the list: once its email belongs to a confirmed, unblocked
// account it turns into a request then (lazy confirm). Likewise an unanswered request past its 30 days is treated as
// declined the next time either side reads, so no scheduled job is needed.
const crypto = require('crypto');
const { sql } = require('./db');
const { hit } = require('./throttle');
const { sendMail, appUrl } = require('./mail');
const { buildPlayerEmail } = require('./pmail');
const { normalizeEmail } = require('./players');
const { isValidEmail, pickLang } = require('./pflow');
const rules = require('../../friend-rules.js');
const { addUp } = require('../../player-stats.js');

const CHECK_LIMIT = 30;                  // "is this email on DartDraw?" answers per player per hour (check, add, update)
const CHECK_WINDOW_MS = 60 * 60 * 1000;
const MAX_NAME = 40;                     // the same limit as an account's own names
const MAX_ID = 100;

function fail(status, code, error, extra) { return { status, code, error, extra }; }
function ok(body) { return { status: 200, body }; }
function iso(ms) { return new Date(ms).toISOString(); }
function sameId(a, b) { return a != null && b != null && String(a) === String(b); }
function goodId(id) { return typeof id === 'string' && !!id && id.length <= MAX_ID; }

// Sends what a friends function returned. Error bodies are { code, error } plus any extra fields (nextAt).
function reply(res, out) {
  if (out.code) { res.status(out.status).json(Object.assign({ code: out.code, error: out.error }, out.extra || {})); return; }
  res.status(out.status).json(out.body);
}

// One line, no control characters, single spaces (as the account's own names).
function cleanPart(v) {
  if (typeof v !== 'string') return '';
  return v.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function checkFriendNames(first, last) {
  const firstName = cleanPart(first), lastName = cleanPart(last);
  if (!firstName) return fail(400, 'first_name_required', 'Type their first name.');
  if (!lastName) return fail(400, 'last_name_required', 'Type their last name.');
  if (firstName.length > MAX_NAME || lastName.length > MAX_NAME) return fail(400, 'name_too_long', 'Names must be ' + MAX_NAME + ' characters or fewer.');
  return { firstName, lastName };
}

// Counts one "does this email have an account?" answer for the player. True = refuse (429).
function overCheckLimit(me) { return hit('p:check:' + me.id, CHECK_LIMIT, CHECK_WINDOW_MS); }
const TOO_MANY = fail(429, 'too_many', 'Too many checks. Try again later.');

// ---- Used by games.js (same signatures as before) ----

// One live entry on the owner's own list, or null. Another player's entry, or a removed one, is never returned, so a
// friendshipId sent by the app can only ever name someone on the caller's own list.
async function entryFor(ownerId, friendshipId) {
  if (!goodId(friendshipId)) return null;
  const rows = await sql`
    SELECT id, status, friend_id, first_name, last_name, nickname, email, requested_at, invited_at FROM friendships
    WHERE owner_id = ${ownerId} AND id = ${friendshipId} AND removed_at IS NULL
  `;
  return rows[0] || null;
}

// One of the owner's own entries that has since been removed (by them, a merge, or the friend removing or blocking
// them), or null. A game set up against it before it went is still the owner's game to save (games.js), so only the
// names are read: nothing is ever stored for the friend from it.
async function removedEntryFor(ownerId, friendshipId) {
  if (!goodId(friendshipId)) return null;
  const rows = await sql`
    SELECT id, first_name, last_name, nickname FROM friendships
    WHERE owner_id = ${ownerId} AND id = ${friendshipId} AND removed_at IS NOT NULL
  `;
  return rows[0] || null;
}

// 'linked' | 'waiting' | 'none', or null when the entry is not on the owner's live list.
async function statusFor(ownerId, friendshipId) {
  const row = await entryFor(ownerId, friendshipId);
  return row ? row.status : null;
}

// The friend's player account id once the entry is linked to one, else null.
async function friendIdFor(ownerId, friendshipId) {
  const row = await entryFor(ownerId, friendshipId);
  return row && row.friend_id ? row.friend_id : null;
}

// True when either player has blocked the other.
async function blockedBetween(a, b) {
  if (!a || !b) return false;
  const rows = await sql`
    SELECT blocker_id FROM friend_blocks
    WHERE (blocker_id = ${a} AND blocked_id = ${b}) OR (blocker_id = ${b} AND blocked_id = ${a})
  `;
  return rows.length > 0;
}

// ---- Accounts as friends code may see them ----

// A CONFIRMED account with this (lower-cased) email, or null. An unconfirmed sign-up is never matched: whoever
// registered someone else's address must not receive their requests or games.
async function accountByEmail(email) {
  const rows = await sql`
    SELECT id, first_name, last_name FROM player_accounts WHERE email = ${email} AND email_verified_at IS NOT NULL
  `;
  return rows[0] || null;
}

// The account `me` may send a request to at this email, or null: no confirmed account, the caller's own, or blocked
// either way all answer null, so they look the same to the caller.
async function reachable(me, email) {
  const acct = await accountByEmail(email);
  if (!acct || sameId(acct.id, me.id)) return null;
  if (await blockedBetween(me.id, acct.id)) return null;
  return acct;
}

// The ids of everyone the player has blocked or been blocked by.
async function blockedIdsOf(playerId) {
  const rows = await sql`SELECT blocker_id, blocked_id FROM friend_blocks WHERE blocker_id = ${playerId} OR blocked_id = ${playerId}`;
  const out = new Set();
  rows.forEach(function (r) { out.add(String(sameId(r.blocker_id, playerId) ? r.blocked_id : r.blocker_id)); });
  return out;
}

// ---- Requests ----

async function requestNotice(toId, friendshipId, byFirstName) {
  await sql`
    INSERT INTO player_notices (player_id, kind, data)
    VALUES (${toId}, 'friend_request', ${JSON.stringify({ friendshipId, by: byFirstName })}::jsonb)
  `;
}

// The unread request notice for one entry goes away with the request (cancelled, declined, expired or removed).
async function dropRequestNotice(toId, friendshipId) {
  await sql`
    DELETE FROM player_notices
    WHERE player_id = ${toId} AND kind = 'friend_request' AND read_at IS NULL AND data->>'friendshipId' = ${friendshipId}
  `;
}

// A 'none' entry becomes a request to `acct`. Guarded on the row still being 'none', so two reads at once send one
// request. True when this call made the request.
async function promote(row, acct, byFirstName, now) {
  const done = await sql`
    UPDATE friendships SET status = 'waiting', friend_id = ${acct.id}, requested_at = ${iso(now)}::timestamptz
    WHERE id = ${row.id} AND status = 'none' AND removed_at IS NULL
    RETURNING id
  `;
  if (!done.length) return false;
  await requestNotice(acct.id, row.id, byFirstName);
  return true;
}

// Held games the recorder kept for `playerId` on one entry become saved (the request was accepted).
async function release(playerId, recorderId, friendshipId) {
  await sql`
    UPDATE player_games pg SET status = 'saved' FROM casual_games g
    WHERE pg.game_id = g.id AND pg.player_id = ${playerId} AND pg.status = 'held'
      AND g.recorded_by = ${recorderId} AND g.side_b->>'friendship_id' = ${friendshipId}
  `;
}

// A request ends without being accepted (declined, cancelled, or 30 days without an answer): the games held for the
// friend are deleted, their unread notice goes, and the sender's entry becomes a 'none' entry (their own results keep
// saving, nothing more goes to the friend). requested_at stays, which marks the entry as "was asked": the lazy confirm
// below only turns never-asked entries into requests, so a declined person is not asked again by itself. Nobody is told.
async function dropRequest(row) {
  const friendId = row.friend_id, ownerId = row.owner_id, rowId = row.id;
  const done = await sql`
    UPDATE friendships SET status = 'none', friend_id = NULL
    WHERE id = ${rowId} AND status = 'waiting'
    RETURNING id
  `;
  if (!done.length || !friendId) return;
  await sql`
    DELETE FROM player_games pg USING casual_games g
    WHERE pg.game_id = g.id AND pg.player_id = ${friendId} AND pg.status = 'held'
      AND g.recorded_by = ${ownerId} AND g.side_b->>'friendship_id' = ${rowId}
  `;
  await dropRequestNotice(friendId, rowId);
}

// What friends code does on every read for this player: requests past 30 days end (both the ones they sent and the
// ones sent to them), then never-asked 'none' entries whose email now belongs to a confirmed, unblocked account turn
// into requests - the caller's own entries, and other players' entries carrying the caller's email (so an account
// confirmed after someone added it sees those requests). Returns the caller's block set for reuse.
async function tidy(me, now) {
  const cutoff = iso(now - rules.HELD_MS);
  const expired = await sql`
    SELECT id, owner_id, friend_id FROM friendships
    WHERE (owner_id = ${me.id} OR friend_id = ${me.id}) AND status = 'waiting' AND removed_at IS NULL
      AND requested_at <= ${cutoff}::timestamptz
  `;
  for (const row of expired) await dropRequest(row);

  const blocks = await blockedIdsOf(me.id);
  const mine = await sql`
    SELECT id, email FROM friendships
    WHERE owner_id = ${me.id} AND status = 'none' AND friend_id IS NULL AND requested_at IS NULL AND removed_at IS NULL
  `;
  if (mine.length) {
    const accts = await sql`
      SELECT id, email, first_name, last_name FROM player_accounts
      WHERE email = ANY(${mine.map(function (r) { return r.email; })}) AND email_verified_at IS NOT NULL
    `;
    for (const row of mine) {
      const acct = accts.find(function (a) { return a.email === row.email; });
      if (acct && !sameId(acct.id, me.id) && !blocks.has(String(acct.id))) await promote(row, acct, me.first_name, now);
    }
  }
  const naming = await sql`
    SELECT f.id, f.owner_id, a.first_name FROM friendships f JOIN player_accounts a ON a.id = f.owner_id
    WHERE f.email = ${me.email} AND f.owner_id <> ${me.id} AND f.status = 'none' AND f.friend_id IS NULL
      AND f.requested_at IS NULL AND f.removed_at IS NULL
  `;
  for (const row of naming) {
    if (!blocks.has(String(row.owner_id))) await promote(row, me, row.first_name, now);
  }
  return blocks;
}

// ---- Endpoints ----

/* POST check { email }: whether the email belongs to someone the caller can send a request to. Only the first and last
   name are revealed. 30 answers per player per hour (shared with add and update), then 429. */
async function check(me, body, now) {
  const email = normalizeEmail(body && body.email);
  if (!isValidEmail(email)) return fail(400, 'bad_email', 'Enter a valid email address.');
  if (await overCheckLimit(me)) return TOO_MANY;
  const acct = await reachable(me, email);
  return ok(acct ? { account: true, firstName: acct.first_name, lastName: acct.last_name } : { account: false });
}

// The answer for one entry after a change (the full list has the rest).
function shapeOf(row, now) {
  return {
    id: row.id, badge: rules.badge(row, now), nickname: row.nickname || '',
    firstName: row.first_name, lastName: row.last_name
  };
}

/* POST add { email, firstName, lastName, nickname, mergeFrom? }: a new entry. An email the caller may send a request to
   becomes a 'waiting' entry with the names from that account and a request notice for them (or straight to 'linked'
   when they had already asked the caller); any other email a 'none' entry with the typed names. mergeFrom: a 'none'
   entry of the caller's whose games move to the new entry (the friend signed up with another address). */
async function add(me, body, now) {
  body = body || {};
  const email = normalizeEmail(body.email);
  if (!isValidEmail(email)) return fail(400, 'bad_email', 'Enter a valid email address.');
  if (email === normalizeEmail(me.email)) return fail(400, 'own_email', 'That is your own email.');
  const nickname = rules.cleanNickname(body.nickname);
  let old = null;
  if (body.mergeFrom !== undefined && body.mergeFrom !== null && body.mergeFrom !== '') {
    old = await entryFor(me.id, body.mergeFrom);
    if (!old || old.status !== 'none') return fail(400, 'bad_merge', 'That friend cannot be merged.');
  }
  const dup = await sql`SELECT id FROM friendships WHERE owner_id = ${me.id} AND email = ${email} AND removed_at IS NULL`;
  if (dup.length) return fail(409, 'already_friends', 'Already in your friends.');
  if (await overCheckLimit(me)) return TOO_MANY;

  const acct = await reachable(me, email);
  let names;
  if (acct) names = { firstName: acct.first_name, lastName: acct.last_name };
  else {
    names = checkFriendNames(body.firstName, body.lastName);
    if (names.code) return names;
  }
  const id = crypto.randomUUID();
  const status = acct ? 'waiting' : 'none';
  try {
    await sql`
      INSERT INTO friendships (id, owner_id, email, first_name, last_name, nickname, friend_id, status, requested_at)
      VALUES (${id}, ${me.id}, ${email}, ${names.firstName}, ${names.lastName}, ${nickname}, ${acct ? acct.id : null},
              ${status}, ${acct ? iso(now) : null}::timestamptz)
    `;
  } catch (e) {
    if (e && e.code === '23505') return fail(409, 'already_friends', 'Already in your friends.');
    throw e;
  }
  if (old) {
    // No back-fill: the moved games keep side_b.player_id null, so they stay on the caller's scorecard only.
    await sql`
      UPDATE casual_games SET side_b = jsonb_set(side_b, '{friendship_id}', to_jsonb(${id}::text))
      WHERE recorded_by = ${me.id} AND side_b->>'friendship_id' = ${old.id}
    `;
    await sql`UPDATE friendships SET removed_at = ${iso(now)}::timestamptz WHERE id = ${old.id} AND owner_id = ${me.id} AND removed_at IS NULL`;
  }
  const row = { id, status, first_name: names.firstName, last_name: names.lastName, nickname, requested_at: acct ? iso(now) : null };
  if (acct) {
    // They had already asked the caller: adding them back is the same as accepting.
    const asked = await sql`
      SELECT id FROM friendships
      WHERE owner_id = ${acct.id} AND friend_id = ${me.id} AND status = 'waiting' AND removed_at IS NULL
        AND requested_at > ${iso(now - rules.HELD_MS)}::timestamptz
    `;
    if (asked.length) {
      const out = await accept(me, { friendshipId: asked[0].id }, now);
      if (!out.code) return out;
    }
    await requestNotice(acct.id, id, me.first_name);
  }
  return ok({ friend: shapeOf(row, now) });
}

// The entry `me` has for another player's request, found by account or by email (one may exist from before they had
// an account), or null.
async function myEntryFor(me, playerId, email) {
  const rows = await sql`
    SELECT id, status FROM friendships
    WHERE owner_id = ${me.id} AND removed_at IS NULL AND (friend_id = ${playerId} OR email = ${email})
    ORDER BY (friend_id = ${playerId}) DESC NULLS LAST
  `;
  return rows[0] || null;
}

/* POST accept { friendshipId } (the request's entry, on the sender's list): both entries become 'linked' (the caller's
   is made when they have none, with the sender's account names), the caller's held games from the sender become
   saved, and the sender gets an "accepted" notice. */
async function accept(me, body, now) {
  const rid = body && body.friendshipId;
  if (!goodId(rid)) return fail(404, 'not_found', 'That request is no longer open.');
  const found = await sql`
    SELECT f.id, f.owner_id, f.requested_at, a.email, a.first_name, a.last_name
    FROM friendships f JOIN player_accounts a ON a.id = f.owner_id
    WHERE f.id = ${rid} AND f.friend_id = ${me.id} AND f.status = 'waiting' AND f.removed_at IS NULL
  `;
  const r = found[0];
  if (!r || rules.heldExpired(r.requested_at, now) || await blockedBetween(me.id, r.owner_id)) {
    return fail(404, 'not_found', 'That request is no longer open.');
  }
  const mine = await myEntryFor(me, r.owner_id, r.email);
  const myId = mine ? mine.id : crypto.randomUUID();
  const mutual = !!(mine && mine.status === 'waiting');
  // One statement, so both entries end linked and the held games are saved together, or nothing changes. Everything
  // hangs off r: when a cancel (or decline, or removal) got to the sender's entry first, r is empty and nothing else is
  // written. When both had asked each other, what the caller held for the sender is released too.
  const done = await sql`
    WITH r AS (
      UPDATE friendships SET status = 'linked'
      WHERE id = ${r.id} AND friend_id = ${me.id} AND status = 'waiting' AND removed_at IS NULL
      RETURNING id, owner_id
    ), mine AS (
      UPDATE friendships SET status = 'linked', friend_id = ${r.owner_id}, requested_at = NULL,
        first_name = ${r.first_name}, last_name = ${r.last_name}
      WHERE id = ${myId} AND ${!!mine}::boolean AND EXISTS (SELECT 1 FROM r)
      RETURNING id
    ), made AS (
      INSERT INTO friendships (id, owner_id, email, first_name, last_name, nickname, friend_id, status, requested_at)
      SELECT ${myId}, ${me.id}, ${r.email}, ${r.first_name}, ${r.last_name}, '', ${r.owner_id}, 'linked', NULL
      FROM r WHERE NOT ${!!mine}::boolean
      RETURNING id
    ), held AS (
      UPDATE player_games pg SET status = 'saved' FROM casual_games g, r
      WHERE pg.game_id = g.id AND pg.player_id = ${me.id} AND pg.status = 'held'
        AND g.recorded_by = r.owner_id AND g.side_b->>'friendship_id' = r.id
    ), back AS (
      UPDATE player_games pg SET status = 'saved' FROM casual_games g, r
      WHERE ${mutual}::boolean AND pg.game_id = g.id AND pg.player_id = r.owner_id AND pg.status = 'held'
        AND g.recorded_by = ${me.id} AND g.side_b->>'friendship_id' = ${myId}
    ), note AS (
      INSERT INTO player_notices (player_id, kind, data)
      SELECT owner_id, 'friend_accepted', ${JSON.stringify({ friendshipId: r.id, by: me.first_name })}::jsonb FROM r
    ), seen AS (
      UPDATE player_notices SET read_at = ${iso(now)}::timestamptz
      WHERE player_id = ${me.id} AND kind = 'friend_request' AND read_at IS NULL AND data->>'friendshipId' = ${r.id}
        AND EXISTS (SELECT 1 FROM r)
    )
    SELECT id FROM r
  `;
  if (!done.length) return fail(404, 'not_found', 'That request is no longer open.');
  if (mutual) await dropRequestNotice(r.owner_id, myId);
  return ok({ friend: { id: myId, badge: 'linked', nickname: '', firstName: r.first_name, lastName: r.last_name } });
}

/* POST decline { friendshipId } (the request's entry): silent. The games held for the caller are deleted; the sender
   only sees their entry turn into a 'none' one. Answers ok even when there is no such request. */
async function decline(me, body) {
  const rid = body && body.friendshipId;
  if (goodId(rid)) {
    const found = await sql`
      SELECT id, owner_id, friend_id FROM friendships
      WHERE id = ${rid} AND friend_id = ${me.id} AND status = 'waiting' AND removed_at IS NULL
    `;
    if (found.length) await dropRequest(found[0]);
  }
  return ok({ ok: true });
}

/* POST cancel { friendshipId }: the caller takes back a request they sent. Their entry stays, as a 'none' one. */
async function cancel(me, body, now) {
  const row = await entryFor(me.id, body && body.friendshipId);
  if (!row) return fail(404, 'not_found', 'That friend is not on your list.');
  if (row.status !== 'waiting') return fail(409, 'not_waiting', 'There is no request to cancel.');
  await dropRequest({ id: row.id, owner_id: me.id, friend_id: row.friend_id });
  return ok({ friend: shapeOf(Object.assign({}, row, { status: 'none' }), now) });
}

const NOT_ON = fail(409, 'not_on_dartdraw', 'They are not on DartDraw. You can invite them instead.');

/* POST resend { friendshipId }: asks again, at most once every 7 days (409 too_soon { nextAt }). Works on a waiting
   entry and on one whose request was declined, cancelled or ran out. */
async function resend(me, body, now) {
  const row = await entryFor(me.id, body && body.friendshipId);
  if (!row) return fail(404, 'not_found', 'That friend is not on your list.');
  if (row.status === 'linked') return fail(409, 'already_linked', 'You are already friends.');
  if (row.status === 'none' && !row.requested_at) return NOT_ON;
  if (!rules.canResend(row.requested_at, now)) {
    return fail(409, 'too_soon', 'You can ask again once a week.', { nextAt: rules.nextResendAt(row.requested_at, now) });
  }
  const success = ok({ friend: shapeOf(Object.assign({}, row, { status: 'waiting', requested_at: iso(now) }), now), nextAt: iso(now + rules.RESEND_MS) });
  const owner = await accountByEmail(row.email);
  if (!owner || sameId(owner.id, me.id)) return NOT_ON;
  if (await blockedBetween(me.id, owner.id)) {
    // Blocked (either way): it must look exactly like a request that is simply never answered. The entry reads
    // 'waiting' with no account behind it (games against it save for the caller only, games.js) and runs out after 30
    // days like any other; nothing reaches the other player.
    const quiet = await sql`
      UPDATE friendships SET status = 'waiting', friend_id = NULL, requested_at = ${iso(now)}::timestamptz
      WHERE id = ${row.id} AND removed_at IS NULL AND requested_at <= ${iso(now - rules.RESEND_MS)}::timestamptz
      RETURNING id
    `;
    if (!quiet.length) return fail(409, 'too_soon', 'You can ask again once a week.', { nextAt: iso(now + rules.RESEND_MS) });
    return success;
  }
  const acct = owner;
  if (row.status === 'waiting') {
    const done = await sql`
      UPDATE friendships SET requested_at = ${iso(now)}::timestamptz, friend_id = ${acct.id}
      WHERE id = ${row.id} AND status = 'waiting' AND requested_at <= ${iso(now - rules.RESEND_MS)}::timestamptz
      RETURNING id
    `;
    if (!done.length) return fail(409, 'too_soon', 'You can ask again once a week.', { nextAt: iso(now + rules.RESEND_MS) });
    await dropRequestNotice(acct.id, row.id);
    await requestNotice(acct.id, row.id, me.first_name);
  } else if (!await promote(row, acct, me.first_name, now)) {
    return fail(409, 'too_soon', 'You can ask again once a week.', { nextAt: iso(now + rules.RESEND_MS) });
  }
  return success;
}

/* POST update { friendshipId, nickname?, firstName?, lastName?, email? }: the nickname on any entry; names and email
   only on a 'none' entry. A new email that belongs to someone the caller can ask turns the entry into a request. */
async function update(me, body, now) {
  body = body || {};
  const row = await entryFor(me.id, body.friendshipId);
  if (!row) return fail(404, 'not_found', 'That friend is not on your list.');
  let nickname = row.nickname || '', first = row.first_name, last = row.last_name, email = row.email;
  if (body.nickname !== undefined) nickname = rules.cleanNickname(body.nickname);
  const editsNone = body.firstName !== undefined || body.lastName !== undefined || body.email !== undefined;
  if (editsNone && row.status !== 'none') return fail(400, 'not_editable', 'Only a friend without an account can be edited.');
  if (body.firstName !== undefined || body.lastName !== undefined) {
    const names = checkFriendNames(body.firstName !== undefined ? body.firstName : first, body.lastName !== undefined ? body.lastName : last);
    if (names.code) return names;
    first = names.firstName; last = names.lastName;
  }
  let emailChanged = false;
  if (body.email !== undefined) {
    const e = normalizeEmail(body.email);
    if (!isValidEmail(e)) return fail(400, 'bad_email', 'Enter a valid email address.');
    if (e === normalizeEmail(me.email)) return fail(400, 'own_email', 'That is your own email.');
    if (e !== row.email) {
      const dup = await sql`SELECT id FROM friendships WHERE owner_id = ${me.id} AND email = ${e} AND removed_at IS NULL`;
      if (dup.length) return fail(409, 'already_friends', 'Already in your friends.');
      if (await overCheckLimit(me)) return TOO_MANY;
      email = e; emailChanged = true;
    }
  }
  try {
    // A fixed email is a new person to ask: the "was asked" and "invited" marks of the old address are cleared.
    await sql`
      UPDATE friendships SET nickname = ${nickname}, first_name = ${first}, last_name = ${last}, email = ${email},
        requested_at = CASE WHEN ${emailChanged}::boolean THEN NULL ELSE requested_at END,
        invited_at = CASE WHEN ${emailChanged}::boolean THEN NULL ELSE invited_at END
      WHERE id = ${row.id} AND owner_id = ${me.id} AND removed_at IS NULL
    `;
  } catch (e) {
    if (e && e.code === '23505') return fail(409, 'already_friends', 'Already in your friends.');
    throw e;
  }
  let out = Object.assign({}, row, { nickname, first_name: first, last_name: last, email });
  if (emailChanged) {
    const acct = await reachable(me, email);
    if (acct && await promote({ id: row.id }, acct, me.first_name, now)) {
      // The account's own names replace the typed ones, as for add.
      await sql`UPDATE friendships SET first_name = ${acct.first_name}, last_name = ${acct.last_name} WHERE id = ${row.id}`;
      out = Object.assign(out, { status: 'waiting', requested_at: iso(now), first_name: acct.first_name, last_name: acct.last_name });
    } else {
      out.requested_at = null;
    }
  }
  return ok({ friend: shapeOf(out, now) });
}

// The account on the other side of one of the caller's entries ({ id, email } or null): by friend_id, else - for a
// 'none' entry, including one whose request was declined, cancelled or ran out (friend_id is cleared then) - the
// confirmed account with the entry's email.
async function otherAccountOf(me, row) {
  const rows = await sql`
    SELECT id, email FROM player_accounts
    WHERE (${row.friend_id || null}::uuid IS NOT NULL AND id = ${row.friend_id || null}::uuid)
       OR (${row.friend_id || null}::uuid IS NULL AND email = ${row.email} AND email_verified_at IS NOT NULL)
  `;
  const acct = rows[0];
  return acct && !sameId(acct.id, me.id) ? acct : null;
}

// Takes `rowId` (one of the caller's entries, or a request on someone else's list) off, and when there is an account
// on the other side also every live entry between the two players in both directions - found by account, and by email
// too, because an entry whose request ended keeps the email but no longer the account. Games stay, except held ones,
// which were never accepted.
async function removePair(me, rowId, other, now) {
  const otherId = other ? other.id : null, otherEmail = other ? normalizeEmail(other.email) : null;
  await sql`
    UPDATE friendships SET removed_at = ${iso(now)}::timestamptz
    WHERE removed_at IS NULL AND (id = ${rowId} OR (${otherId}::uuid IS NOT NULL AND (
      (owner_id = ${me.id} AND (friend_id = ${otherId} OR lower(email) = ${otherEmail}))
      OR (owner_id = ${otherId} AND (friend_id = ${me.id} OR lower(email) = ${normalizeEmail(me.email)})))))
  `;
  if (!otherId) return;
  const meId = me.id;
  await sql`
    DELETE FROM player_games pg USING casual_games g
    WHERE pg.game_id = g.id AND pg.status = 'held'
      AND ((pg.player_id = ${otherId} AND g.recorded_by = ${meId}) OR (pg.player_id = ${meId} AND g.recorded_by = ${otherId}))
  `;
  await sql`
    DELETE FROM player_notices
    WHERE kind = 'friend_request' AND read_at IS NULL
      AND ((player_id = ${otherId} AND data->>'friendshipId' = ${rowId})
        OR (player_id = ${meId} AND data->>'friendshipId' IN (SELECT id FROM friendships WHERE owner_id = ${otherId})))
  `;
}

/* POST remove { friendshipId }: off both lists, nobody told, past games kept on both scorecards. */
async function remove(me, body, now) {
  const row = await entryFor(me.id, body && body.friendshipId);
  if (!row) return fail(404, 'not_found', 'That friend is not on your list.');
  await removePair(me, row.id, await otherAccountOf(me, row), now);
  return ok({ ok: true });
}

/* POST block { friendshipId }: one of the caller's entries, or a request sent to them. Removes as remove does and
   stops further requests both ways (and makes each look like "no account" to the other). */
async function block(me, body, now) {
  const fid = body && body.friendshipId;
  if (!goodId(fid)) return fail(404, 'not_found', 'That friend is not on your list.');
  const row = await entryFor(me.id, fid);
  let other = null;
  if (row) {
    other = await otherAccountOf(me, row);
  } else {
    // A request sent to the caller - still open, or one they already declined (that entry keeps their email).
    const asked = await sql`
      SELECT a.id, a.email FROM friendships f JOIN player_accounts a ON a.id = f.owner_id
      WHERE f.id = ${fid} AND f.removed_at IS NULL AND (f.friend_id = ${me.id} OR lower(f.email) = ${normalizeEmail(me.email)})
    `;
    if (!asked.length || sameId(asked[0].id, me.id)) return fail(404, 'not_found', 'That friend is not on your list.');
    other = asked[0];
  }
  await removePair(me, fid, other, now);
  if (other) {
    await sql`INSERT INTO friend_blocks (blocker_id, blocked_id) VALUES (${me.id}, ${other.id}) ON CONFLICT DO NOTHING`;
  }
  return ok({ ok: true });
}

/* POST invite { friendshipId, lang? }: an "Invite to DartDraw" email to a never-asked 'none' entry, at most once every
   7 days (409 too_soon { nextAt }). If the email turns out to belong to someone the caller can ask, a request goes
   instead. Nothing is sent to an account on either side of a block, but the answer is the same. */
async function invite(req, me, body, now) {
  body = body || {};
  const row = await entryFor(me.id, body.friendshipId);
  if (!row) return fail(404, 'not_found', 'That friend is not on your list.');
  if (row.status !== 'none' || row.requested_at) return fail(409, 'not_invitable', 'They are already on DartDraw.');
  if (!rules.canResend(row.invited_at, now)) {
    return fail(409, 'too_soon', 'You can invite them once a week.', { nextAt: rules.nextResendAt(row.invited_at, now) });
  }
  const acct = await accountByEmail(row.email);
  if (acct && !sameId(acct.id, me.id) && !await blockedBetween(me.id, acct.id)) {
    await promote(row, acct, me.first_name, now);
    return ok({ sent: 'request', friend: shapeOf(Object.assign({}, row, { status: 'waiting', requested_at: iso(now) }), now) });
  }
  // Claimed in one statement, so a double tap sends one email.
  const claimed = await sql`
    UPDATE friendships SET invited_at = ${iso(now)}::timestamptz
    WHERE id = ${row.id} AND removed_at IS NULL AND (invited_at IS NULL OR invited_at <= ${iso(now - rules.RESEND_MS)}::timestamptz)
    RETURNING id
  `;
  if (!claimed.length) return fail(409, 'too_soon', 'You can invite them once a week.', { nextAt: iso(now + rules.RESEND_MS) });
  if (!acct) {
    const mail = buildPlayerEmail('invite', pickLang(body.lang), { link: appUrl(req) + '/', firstName: me.first_name });
    const sent = await sendMail(Object.assign({ to: row.email }, mail));
    if (!sent.ok) {
      // Not sent: the week does not start.
      await sql`UPDATE friendships SET invited_at = ${row.invited_at || null}::timestamptz WHERE id = ${row.id}`;
      return fail(503, 'mail_failed', 'The invite could not be sent. Try again later.');
    }
  }
  return ok({ sent: 'invite', nextAt: iso(now + rules.RESEND_MS) });
}

// ---- The list ----

function toIso(v) { return v ? new Date(v).toISOString() : null; }

/* GET list: the caller's entries, most recently played first, each with its badge, names, games together,
   head-to-head and last results, the 3DA/MPR comparison for a linked friend, plus the requests sent to the caller. */
async function list(me, now) {
  const blocks = await tidy(me, now);
  const rows = await sql`
    SELECT f.id, f.email, f.first_name, f.last_name, f.nickname, f.status, f.friend_id, f.requested_at, f.invited_at,
           f.created_at, a.first_name AS account_first_name, a.last_name AS account_last_name
    FROM friendships f LEFT JOIN player_accounts a ON a.id = f.friend_id
    WHERE f.owner_id = ${me.id} AND f.removed_at IS NULL
  `;
  const incoming = await sql`
    SELECT f.id, f.owner_id, f.requested_at, a.first_name, a.last_name
    FROM friendships f JOIN player_accounts a ON a.id = f.owner_id
    WHERE f.friend_id = ${me.id} AND f.status = 'waiting' AND f.removed_at IS NULL
      AND f.requested_at > ${iso(now - rules.HELD_MS)}::timestamptz
    ORDER BY f.requested_at DESC
  `;
  // Every entry ever made between the caller and others (removed ones too: removing keeps the games), to tell which
  // friend each shared game was with.
  const links = await sql`SELECT id, owner_id, friend_id FROM friendships WHERE owner_id = ${me.id} OR friend_id = ${me.id}`;
  const games = await sql`
    SELECT g.id, g.recorded_by, g.side_b->>'friendship_id' AS fid, pg.won, pg.stats, pg.played_at, o.stats AS their_stats
    FROM player_games pg JOIN casual_games g ON g.id = pg.game_id
      LEFT JOIN player_games o ON o.game_id = g.id AND o.player_id <> pg.player_id AND o.status = 'saved'
    WHERE pg.player_id = ${me.id} AND pg.status = 'saved' AND g.side_b->>'friendship_id' IS NOT NULL
    ORDER BY pg.played_at DESC
  `;

  // A friend is known by their account when there is one (so games from before a removal and re-add still count), else
  // by the entry itself.
  const keyOf = {};
  links.forEach(function (l) {
    if (sameId(l.owner_id, me.id)) keyOf['m:' + l.id] = l.friend_id ? 'p:' + l.friend_id : 'r:' + l.id;
    else keyOf['t:' + l.id] = 'p:' + l.owner_id;
  });
  const byKey = {};
  games.forEach(function (g) {
    const key = sameId(g.recorded_by, me.id) ? keyOf['m:' + g.fid] : keyOf['t:' + g.fid];
    if (!key || (key.indexOf('p:') === 0 && !sameId(g.recorded_by, me.id) && key !== 'p:' + g.recorded_by)) return;
    (byKey[key] = byKey[key] || []).push(g);
  });

  const friends = rows.map(function (r) {
    const badge = rules.badge(r, now);
    const mine = byKey[r.friend_id ? 'p:' + r.friend_id : 'r:' + r.id] || [];
    const won = mine.filter(function (g) { return g.won; }).length;
    const fromAccount = badge !== 'none' && r.account_first_name;
    const out = {
      id: r.id, badge, nickname: r.nickname || '',
      firstName: fromAccount ? r.account_first_name : r.first_name,
      lastName: fromAccount ? r.account_last_name : r.last_name,
      games: mine.length, headToHead: { won, lost: mine.length - won },
      lastPlayed: mine.length ? toIso(mine[0].played_at) : null,
      recent: mine.slice(0, 5).map(function (g) { return { gameId: g.id, playedAt: toIso(g.played_at), won: !!g.won }; }),
      // Waiting and no-account entries: only the caller's own figures, never the other account's until they are linked.
      compare: { games: mine.length, me: addUp(mine.map(function (g) { return Object.assign({}, g.stats, { won: !!g.won }); })), them: null }
    };
    if (badge === 'none') {
      out.email = r.email;
      out.asked = !!r.requested_at;      // declined, cancelled or never answered: "Request not accepted"
      out.nextInviteAt = r.requested_at ? null : rules.nextResendAt(r.invited_at, now);
    }
    if (badge !== 'linked') out.nextResendAt = r.requested_at ? rules.nextResendAt(r.requested_at, now) : null;
    if (badge === 'waiting') out.requestedAt = toIso(r.requested_at);
    if (badge === 'linked') {
      // Only games both players have saved are compared: a game held or never stored for them has no numbers of theirs.
      const both = mine.filter(function (g) { return g.their_stats; });
      out.compare = {
        games: both.length,
        me: addUp(both.map(function (g) { return Object.assign({}, g.stats, { won: !!g.won }); })),
        them: addUp(both.map(function (g) { return Object.assign({}, g.their_stats, { won: !g.won }); }))
      };
    }
    out._sort = [out.lastPlayed || '', toIso(r.created_at) || ''];
    return out;
  });
  friends.sort(function (a, b) {
    if (a._sort[0] !== b._sort[0]) return a._sort[0] < b._sort[0] ? 1 : -1;
    return a._sort[1] < b._sort[1] ? 1 : a._sort[1] > b._sort[1] ? -1 : 0;
  });
  friends.forEach(function (f) { delete f._sort; });

  const requests = incoming.filter(function (r) { return !blocks.has(String(r.owner_id)); }).map(function (r) {
    return { id: r.id, firstName: r.first_name, lastName: r.last_name, requestedAt: toIso(r.requested_at) };
  });
  return ok({ friends, requests });
}

module.exports = {
  CHECK_LIMIT, CHECK_WINDOW_MS,
  entryFor, removedEntryFor, statusFor, friendIdFor, blockedBetween, accountByEmail, reachable, release, tidy, reply,
  check, add, list, accept, decline, cancel, resend, update, remove, block, invite
};

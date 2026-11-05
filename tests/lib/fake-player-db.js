// In-memory stand-in for scoring_app/api/_lib/db.js `sql`, for the player-account code of the scoring app
// (scoring_app/api/_lib/*.js and its handlers) and the organiser app's Admin "Player accounts" routes.
//
//   const db = createFakePlayerDb({ player_accounts: [...], friendships: [...], ... });
//   require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { sql: (...a) => db.sql(...a) } };
//
//   db.rows.<table>           the tables: player_accounts, player_tokens, friendships, friend_blocks, casual_games,
//                             player_games, player_notices, auth_throttle (arrays of plain objects)
//   db.calls                  every statement as { text, vals } (text with ? for each value)
//   db.now() / db.advance(ms) / db.setNow(ms)
//                             the database clock used for now() in SQL. It starts at seed.now, else at the real
//                             Date.now() when the fake is made, so stamps written by the handlers (which take the time
//                             from Date.now()) and stamps written by now() agree.
//   db.failNext(err)          the next statement throws err (e.g. { code: '42P01' })
//
// `sql` is a tagged-template function. It recognises ONLY the statements the code issues (by distinctive prefixes of the
// whitespace-normalised text) and throws for anything else, so a changed query fails a test loudly instead of silently
// returning nothing. JavaScript stands in for the SQL, so these tests check the code's logic, not the SQL text itself.
// Constraints acted out: player_accounts.email UNIQUE, player_tokens.token_hash UNIQUE, the partial unique index
// friendships (owner_id, email) WHERE removed_at IS NULL (each throws { code: '23505' }), casual_games ON CONFLICT (id).
//
// Statements that are one big CTE are not parsed; their EFFECT is implemented by hand, with the value positions spelt
// out next to each (value order = order of ${...} in the template):
//   games.js saveGame        WITH g AS (INSERT INTO casual_games ...), mine, theirs, note SELECT id FROM g
//   friends.js accept        WITH r AS (UPDATE friendships SET status = 'linked' ...), mine, made, held, back, note, seen
//   admin create             INSERT INTO player_accounts ... ON CONFLICT (email) DO UPDATE ... WHERE email_verified_at IS NULL
// Timestamps are stored as Date objects (as the Neon driver returns timestamptz); jsonb values as parsed objects.
const crypto = require('crypto');

function createFakePlayerDb(seed) {
  seed = seed || {};
  const TABLES = ['player_accounts', 'player_tokens', 'friendships', 'friend_blocks', 'casual_games', 'player_games',
    'player_notices', 'auth_throttle'];
  const rows = {};
  let nowMs = seed.now != null ? new Date(seed.now).getTime() : Date.now();
  const api = {
    rows,
    calls: [],
    now: () => new Date(nowMs),
    advance: (ms) => { nowMs += ms; },
    setNow: (ms) => { nowMs = new Date(ms).getTime(); },
  };
  let pending = null;
  api.failNext = (err) => { pending = err; };

  const now = () => new Date(nowMs);
  const ms = (v) => (v == null ? null : v instanceof Date ? v.getTime() : new Date(v).getTime());
  const date = (v) => (v == null ? null : new Date(ms(v)));
  const json = (v) => (v == null ? null : typeof v === 'string' ? JSON.parse(v) : v);
  const live = (r) => r.removed_at == null;
  const copy = (r) => Object.assign({}, r);
  const dup = (name) => Object.assign(new Error('duplicate key value violates unique constraint "' + name + '"'), { code: '23505' });
  const eq = (a, b) => a != null && b != null && String(a) === String(b);
  const account = (id) => rows.player_accounts.find((a) => eq(a.id, id));
  const game = (id) => rows.casual_games.find((g) => eq(g.id, id));
  const fidOf = (g) => (g && g.side_b && g.side_b.friendship_id != null ? String(g.side_b.friendship_id) : null);

  function accountDefaults(r) {
    return Object.assign({
      id: crypto.randomUUID(), email_verified_at: null, must_change_password: false, token_version: 0,
      name_changed_at: null, created_by_admin: null, created_at: now(),
    }, r);
  }
  function friendshipDefaults(r) {
    return Object.assign({ nickname: '', friend_id: null, requested_at: null, removed_at: null, invited_at: null, created_at: now() }, r);
  }
  TABLES.forEach((t) => { rows[t] = (seed[t] || []).map(copy); });
  rows.player_accounts = rows.player_accounts.map(accountDefaults);
  rows.friendships = rows.friendships.map(friendshipDefaults);
  rows.player_notices = rows.player_notices.map((n) => Object.assign({ id: crypto.randomUUID(), data: {}, created_at: now(), read_at: null }, n));

  function insertFriendship(r) {
    if (rows.friendships.some((f) => live(f) && eq(f.owner_id, r.owner_id) && f.email === r.email)) throw dup('friendships_owner_email');
    rows.friendships.push(friendshipDefaults(r));
  }
  function addNotice(playerId, kind, data) {
    rows.player_notices.push({ id: crypto.randomUUID(), player_id: playerId, kind, data: json(data) || {}, created_at: now(), read_at: null });
  }
  // Postgres LIKE pattern (backslash escapes, % and _) as a case-insensitive RegExp.
  function like(pat) {
    let re = '';
    for (let i = 0; i < pat.length; i++) {
      const c = pat[i];
      if (c === '\\' && i + 1 < pat.length) re += pat[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      else if (c === '%') re += '[\\s\\S]*';
      else if (c === '_') re += '[\\s\\S]';
      else re += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    return new RegExp('^' + re + '$', 'i');
  }

  // [prefix of the normalised statement, (vals) => rows]. The first matching prefix wins, so longer ones come first
  // where two share a start.
  const H = [
    // ---- player_accounts (session.js, players.js, admin routes) ----
    ['SELECT * FROM player_accounts WHERE id = ?', (v) => rows.player_accounts.filter((a) => eq(a.id, v[0])).map(copy)],
    ['SELECT * FROM player_accounts WHERE email = ?', (v) => rows.player_accounts.filter((a) => a.email === v[0]).map(copy)],
    // admin create (vals: email, hash, first, last, adminId): a new row; an UNCONFIRMED row is taken over; a confirmed
    // one fails the DO UPDATE's WHERE and returns nothing.
    ['INSERT INTO player_accounts (email, password_hash, first_name, last_name, email_verified_at, must_change_password, created_by_admin) VALUES (?, ?, ?, ?, now(), true, ?) ON CONFLICT (email) DO UPDATE', (v) => {
      let a = rows.player_accounts.find((x) => x.email === v[0]);
      if (a) {
        if (a.email_verified_at != null) return [];
        Object.assign(a, { password_hash: v[1], first_name: v[2], last_name: v[3], email_verified_at: now(),
          must_change_password: true, created_by_admin: v[4], token_version: Number(a.token_version) + 1 });
      } else {
        a = accountDefaults({ email: v[0], password_hash: v[1], first_name: v[2], last_name: v[3], email_verified_at: now(),
          must_change_password: true, created_by_admin: v[4] });
        rows.player_accounts.push(a);
      }
      return [{ id: a.id, email: a.email, first_name: a.first_name, last_name: a.last_name, email_verified_at: a.email_verified_at,
        created_by_admin: a.created_by_admin, created_at: a.created_at }];
    }],
    // players.createPlayer (vals: email, hash, first, last, verified, mustChange, createdByAdmin)
    ['INSERT INTO player_accounts (email, password_hash, first_name, last_name, email_verified_at, must_change_password, created_by_admin) VALUES (?, ?, ?, ?, CASE WHEN ?::boolean THEN now() ELSE NULL END, ?, ?) RETURNING *', (v) => {
      if (rows.player_accounts.some((a) => a.email === v[0])) throw dup('player_accounts_email_key');
      const a = accountDefaults({ email: v[0], password_hash: v[1], first_name: v[2], last_name: v[3],
        email_verified_at: v[4] ? now() : null, must_change_password: !!v[5], created_by_admin: v[6] || null });
      rows.player_accounts.push(a);
      return [copy(a)];
    }],
    ['UPDATE player_accounts SET first_name = ?, last_name = ?, password_hash = ? WHERE id = ? AND email_verified_at IS NULL RETURNING id', (v) => {
      const hit = rows.player_accounts.filter((a) => eq(a.id, v[3]) && a.email_verified_at == null);
      hit.forEach((a) => Object.assign(a, { first_name: v[0], last_name: v[1], password_hash: v[2] }));
      return hit.map((a) => ({ id: a.id }));
    }],
    ['UPDATE player_accounts SET email_verified_at = now() WHERE id = ? AND email_verified_at IS NULL', (v) => {
      rows.player_accounts.filter((a) => eq(a.id, v[0]) && a.email_verified_at == null).forEach((a) => { a.email_verified_at = now(); });
      return [];
    }],
    // players.setPassword (vals: hash, id, expectHash, expectHash)
    ['UPDATE player_accounts SET password_hash = ?, must_change_password = false, email_verified_at = COALESCE(email_verified_at, now()), token_version = token_version + 1 WHERE id = ? AND (?::text IS NULL OR password_hash = ?) RETURNING token_version', (v) => {
      const hit = rows.player_accounts.filter((a) => eq(a.id, v[1]) && (v[2] == null || a.password_hash === v[3]));
      hit.forEach((a) => {
        a.password_hash = v[0]; a.must_change_password = false;
        if (a.email_verified_at == null) a.email_verified_at = now();
        a.token_version = Number(a.token_version) + 1;
      });
      return hit.map((a) => ({ token_version: a.token_version }));
    }],
    // players.changeName (vals: first, last, nowIso, id, cutoffIso)
    ['UPDATE player_accounts SET first_name = ?, last_name = ?, name_changed_at = ?::timestamptz WHERE id = ? AND (name_changed_at IS NULL OR name_changed_at <= ?::timestamptz) RETURNING id', (v) => {
      const hit = rows.player_accounts.filter((a) => eq(a.id, v[3]) && (a.name_changed_at == null || ms(a.name_changed_at) <= ms(v[4])));
      hit.forEach((a) => Object.assign(a, { first_name: v[0], last_name: v[1], name_changed_at: date(v[2]) }));
      return hit.map((a) => ({ id: a.id }));
    }],
    // admin list (vals: pat x5, limit, offset)
    ['SELECT id, email, first_name, last_name, email_verified_at, created_by_admin, created_at, count(*) OVER () AS total FROM player_accounts WHERE', (v) => {
      const re = v[0] == null ? null : like(String(v[0]));
      const hit = rows.player_accounts.filter((a) => !re || [a.email, a.first_name, a.last_name, a.first_name + ' ' + a.last_name].some((s) => re.test(s)))
        .sort((a, b) => (ms(b.created_at) - ms(a.created_at)) || (String(a.id) < String(b.id) ? -1 : 1));
      return hit.slice(Number(v[6]), Number(v[6]) + Number(v[5])).map((a) => ({
        id: a.id, email: a.email, first_name: a.first_name, last_name: a.last_name, email_verified_at: a.email_verified_at,
        created_by_admin: a.created_by_admin, created_at: a.created_at, total: String(hit.length),
      }));
    }],
    // admin reset (vals: hash, id)
    ['UPDATE player_accounts SET password_hash = ?, must_change_password = true, token_version = token_version + 1 WHERE id = ? RETURNING id', (v) => {
      const hit = rows.player_accounts.filter((a) => eq(a.id, v[1]));
      hit.forEach((a) => { a.password_hash = v[0]; a.must_change_password = true; a.token_version = Number(a.token_version) + 1; });
      return hit.map((a) => ({ id: a.id }));
    }],

    // ---- player_tokens (ptokens.js) ----
    ['UPDATE player_tokens SET used_at = now() WHERE player_id = ? AND kind = ? AND used_at IS NULL', (v) => {
      rows.player_tokens.filter((t) => eq(t.player_id, v[0]) && t.kind === v[1] && t.used_at == null).forEach((t) => { t.used_at = now(); });
      return [];
    }],
    ['INSERT INTO player_tokens (player_id, kind, token_hash, expires_at) VALUES', (v) => {
      if (rows.player_tokens.some((t) => t.token_hash === v[2])) throw dup('player_tokens_token_hash_key');
      rows.player_tokens.push({ id: crypto.randomUUID(), player_id: v[0], kind: v[1], token_hash: v[2],
        expires_at: new Date(nowMs + Number(v[3])), used_at: null, created_at: now() });
      return [];
    }],
    ['SELECT player_id, kind FROM player_tokens WHERE token_hash = ? AND kind = ANY(?::text[]) AND used_at IS NULL AND expires_at > now()', (v) =>
      rows.player_tokens.filter((t) => t.token_hash === v[0] && v[1].includes(t.kind) && t.used_at == null && ms(t.expires_at) > nowMs)
        .map((t) => ({ player_id: t.player_id, kind: t.kind }))],
    ['UPDATE player_tokens SET used_at = now() WHERE token_hash = ? AND kind = ANY(?::text[]) AND used_at IS NULL AND expires_at > now() RETURNING player_id, kind', (v) => {
      const t = rows.player_tokens.find((x) => x.token_hash === v[0] && v[1].includes(x.kind) && x.used_at == null && ms(x.expires_at) > nowMs);
      if (!t) return [];
      t.used_at = now();
      return [{ player_id: t.player_id, kind: t.kind }];
    }],

    // ---- auth_throttle (throttle.js; same statements as tests/lib/fake-db.js) ----
    ['INSERT INTO auth_throttle (key, window_start, count) VALUES (?, now(), 1) ON CONFLICT (key) DO UPDATE', (v) => {
      const windowMs = Number(v[1]);
      let r = rows.auth_throttle.find((x) => x.key === v[0]);
      if (!r) { r = { key: v[0], window_start: now(), count: 1 }; rows.auth_throttle.push(r); }
      else if (ms(r.window_start) <= nowMs - windowMs) { r.window_start = now(); r.count = 1; }
      else r.count += 1;
      return [{ count: r.count }];
    }],
    ['SELECT count FROM auth_throttle WHERE key = ? AND window_start > now() -', (v) =>
      rows.auth_throttle.filter((r) => r.key === v[0] && ms(r.window_start) > nowMs - Number(v[1])).map((r) => ({ count: r.count }))],
    ['DELETE FROM auth_throttle WHERE key = ?', (v) => { rows.auth_throttle = rows.auth_throttle.filter((r) => r.key !== v[0]); return []; }],
    ['UPDATE auth_throttle SET count = GREATEST(count - 1, 0) WHERE key = ? AND window_start > now() -', (v) => {
      rows.auth_throttle.filter((r) => r.key === v[0] && ms(r.window_start) > nowMs - Number(v[1])).forEach((r) => { r.count = Math.max(r.count - 1, 0); });
      return [];
    }],
    ["DELETE FROM auth_throttle WHERE window_start < now() - interval '1 day'", () => {
      rows.auth_throttle = rows.auth_throttle.filter((r) => ms(r.window_start) >= nowMs - 864e5);
      return [];
    }],

    // ---- casual games (games.js) ----
    ['SELECT recorded_by, side_b FROM casual_games WHERE id = ?', (v) => rows.casual_games.filter((g) => g.id === v[0]).map((g) => ({ recorded_by: g.recorded_by, side_b: g.side_b }))],
    ['SELECT status FROM player_games WHERE game_id = ? AND player_id = ?', (v) => rows.player_games.filter((p) => p.game_id === v[0] && eq(p.player_id, v[1])).map((p) => ({ status: p.status }))],
    // saveGame (vals 0-7: id, recorder, format, events, sideA, sideB, winner, playedAt; 8-10: me, statsA, wonA;
    // 11-15: oppId, oppStatus, statsB, wonB, oppId; 16-18: oppId, notice, notify). ON CONFLICT (id) DO NOTHING: an existing
    // id writes nothing at all and returns no row.
    ['WITH g AS ( INSERT INTO casual_games (id, recorded_by, format, events, side_a, side_b, winner, played_at)', (v) => {
      if (game(v[0])) return [];
      const at = date(v[7]);
      rows.casual_games.push({ id: v[0], recorded_by: v[1], format: json(v[2]), events: json(v[3]), side_a: json(v[4]),
        side_b: json(v[5]), winner: v[6], played_at: at, created_at: now() });
      rows.player_games.push({ game_id: v[0], player_id: v[8], side: 'a', status: 'saved', kind: 'casual', stats: json(v[9]), won: !!v[10], played_at: at });
      if (v[15] != null) {
        rows.player_games.push({ game_id: v[0], player_id: v[11], side: 'b', status: v[12], kind: 'casual', stats: json(v[13]), won: !!v[14], played_at: at });
      }
      if (v[18]) addNotice(v[16], 'casual_game', v[17]);
      return [{ id: v[0] }];
    }],
    // listGames (vals: me, before, before, beforeId, limit)
    ['SELECT g.id, g.format, g.side_a, g.side_b, pg.side, pg.won, pg.stats, pg.played_at FROM player_games pg JOIN casual_games g ON g.id = pg.game_id', (v) => {
      const before = v[1] == null ? null : ms(v[1]);
      return rows.player_games.filter((p) => eq(p.player_id, v[0]) && p.status === 'saved' && game(p.game_id)
          && (before == null || ms(p.played_at) < before || (ms(p.played_at) === before && p.game_id < v[3])))
        .sort((a, b) => (ms(b.played_at) - ms(a.played_at)) || (a.game_id < b.game_id ? 1 : -1))
        .slice(0, Number(v[4]))
        .map((p) => { const g = game(p.game_id); return { id: g.id, format: g.format, side_a: g.side_a, side_b: g.side_b, side: p.side, won: p.won, stats: p.stats, played_at: p.played_at }; });
    }],
    ['SELECT id, format, events, side_a, side_b, winner, played_at FROM casual_games WHERE id = ?', (v) => rows.casual_games.filter((g) => g.id === v[0]).map(copy)],
    ['SELECT player_id, side, status, stats, won FROM player_games WHERE game_id = ?', (v) => rows.player_games.filter((p) => p.game_id === v[0])
      .map((p) => ({ player_id: p.player_id, side: p.side, status: p.status, stats: p.stats, won: p.won }))],

    // ---- friends (friends.js) ----
    ['SELECT id, status, friend_id, first_name, last_name, nickname, email, requested_at, invited_at FROM friendships WHERE owner_id = ? AND id = ? AND removed_at IS NULL', (v) =>
      rows.friendships.filter((f) => eq(f.owner_id, v[0]) && f.id === v[1] && live(f)).map(copy)],
    // removedEntryFor (vals: owner, id): only the owner's own entry, and only once it is removed
    ['SELECT id, first_name, last_name, nickname FROM friendships WHERE owner_id = ? AND id = ? AND removed_at IS NOT NULL', (v) =>
      rows.friendships.filter((f) => eq(f.owner_id, v[0]) && f.id === v[1] && !live(f))
        .map((f) => ({ id: f.id, first_name: f.first_name, last_name: f.last_name, nickname: f.nickname }))],
    ['SELECT blocker_id FROM friend_blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)', (v) =>
      rows.friend_blocks.filter((b) => (eq(b.blocker_id, v[0]) && eq(b.blocked_id, v[1])) || (eq(b.blocker_id, v[2]) && eq(b.blocked_id, v[3]))).map(copy)],
    ['SELECT blocker_id, blocked_id FROM friend_blocks WHERE blocker_id = ? OR blocked_id = ?', (v) =>
      rows.friend_blocks.filter((b) => eq(b.blocker_id, v[0]) || eq(b.blocked_id, v[1])).map(copy)],
    ['SELECT id, first_name, last_name FROM player_accounts WHERE email = ? AND email_verified_at IS NOT NULL', (v) =>
      rows.player_accounts.filter((a) => a.email === v[0] && a.email_verified_at != null).map((a) => ({ id: a.id, first_name: a.first_name, last_name: a.last_name }))],
    ['SELECT id, email, first_name, last_name FROM player_accounts WHERE email = ANY(?) AND email_verified_at IS NOT NULL', (v) =>
      rows.player_accounts.filter((a) => v[0].includes(a.email) && a.email_verified_at != null).map((a) => ({ id: a.id, email: a.email, first_name: a.first_name, last_name: a.last_name }))],
    // otherAccountOf (vals: fid, fid, fid, email)
    ['SELECT id, email FROM player_accounts WHERE (?::uuid IS NOT NULL AND id = ?::uuid) OR (?::uuid IS NULL AND email = ? AND email_verified_at IS NOT NULL)', (v) =>
      rows.player_accounts.filter((a) => (v[0] != null && eq(a.id, v[1])) || (v[2] == null && a.email === v[3] && a.email_verified_at != null))
        .map((a) => ({ id: a.id, email: a.email }))],
    ["INSERT INTO player_notices (player_id, kind, data) VALUES (?, 'friend_request', ?::jsonb)", (v) => { addNotice(v[0], 'friend_request', v[1]); return []; }],
    ["DELETE FROM player_notices WHERE player_id = ? AND kind = 'friend_request' AND read_at IS NULL AND data->>'friendshipId' = ?", (v) => {
      rows.player_notices = rows.player_notices.filter((n) => !(eq(n.player_id, v[0]) && n.kind === 'friend_request' && n.read_at == null && String(n.data.friendshipId) === v[1]));
      return [];
    }],
    // removePair's notice clean-up (vals: otherId, rowId, me, otherId)
    ["DELETE FROM player_notices WHERE kind = 'friend_request' AND read_at IS NULL AND ((player_id = ? AND data->>'friendshipId' = ?) OR (player_id = ? AND data->>'friendshipId' IN (SELECT id FROM friendships WHERE owner_id = ?)))", (v) => {
      const theirs = rows.friendships.filter((f) => eq(f.owner_id, v[3])).map((f) => f.id);
      rows.player_notices = rows.player_notices.filter((n) => !(n.kind === 'friend_request' && n.read_at == null
        && ((eq(n.player_id, v[0]) && String(n.data.friendshipId) === v[1]) || (eq(n.player_id, v[2]) && theirs.includes(n.data.friendshipId)))));
      return [];
    }],
    // promote (vals: friendId, requestedAt, id)
    ["UPDATE friendships SET status = 'waiting', friend_id = ?, requested_at = ?::timestamptz WHERE id = ? AND status = 'none' AND removed_at IS NULL RETURNING id", (v) => {
      const f = rows.friendships.find((x) => x.id === v[2] && x.status === 'none' && live(x));
      if (!f) return [];
      Object.assign(f, { status: 'waiting', friend_id: v[0], requested_at: date(v[1]) });
      return [{ id: f.id }];
    }],
    // resend to a blocked pair (vals: now, id, cutoff)
    ["UPDATE friendships SET status = 'waiting', friend_id = NULL, requested_at = ?::timestamptz WHERE id = ? AND removed_at IS NULL AND requested_at <= ?::timestamptz RETURNING id", (v) => {
      const f = rows.friendships.find((x) => x.id === v[1] && live(x) && x.requested_at != null && ms(x.requested_at) <= ms(v[2]));
      if (!f) return [];
      Object.assign(f, { status: 'waiting', friend_id: null, requested_at: date(v[0]) });
      return [{ id: f.id }];
    }],
    // release (vals: player, recorder, friendshipId)
    ["UPDATE player_games pg SET status = 'saved' FROM casual_games g WHERE pg.game_id = g.id AND pg.player_id = ? AND pg.status = 'held'", (v) => {
      rows.player_games.forEach((p) => {
        const g = game(p.game_id);
        if (g && eq(p.player_id, v[0]) && p.status === 'held' && eq(g.recorded_by, v[1]) && fidOf(g) === v[2]) p.status = 'saved';
      });
      return [];
    }],
    ["UPDATE friendships SET status = 'none', friend_id = NULL WHERE id = ? AND status = 'waiting' RETURNING id", (v) => {
      const f = rows.friendships.find((x) => x.id === v[0] && x.status === 'waiting');
      if (!f) return [];
      Object.assign(f, { status: 'none', friend_id: null });
      return [{ id: f.id }];
    }],
    // dropRequest's held games (vals: friend, owner, friendshipId)
    ['DELETE FROM player_games pg USING casual_games g WHERE pg.game_id = g.id AND pg.player_id = ? AND pg.status = \'held\'', (v) => {
      rows.player_games = rows.player_games.filter((p) => {
        const g = game(p.game_id);
        return !(g && eq(p.player_id, v[0]) && p.status === 'held' && eq(g.recorded_by, v[1]) && fidOf(g) === v[2]);
      });
      return [];
    }],
    // removePair's held games (vals: other, me, me, other)
    ["DELETE FROM player_games pg USING casual_games g WHERE pg.game_id = g.id AND pg.status = 'held' AND ((pg.player_id = ? AND g.recorded_by = ?) OR (pg.player_id = ? AND g.recorded_by = ?))", (v) => {
      rows.player_games = rows.player_games.filter((p) => {
        const g = game(p.game_id);
        return !(g && p.status === 'held' && ((eq(p.player_id, v[0]) && eq(g.recorded_by, v[1])) || (eq(p.player_id, v[2]) && eq(g.recorded_by, v[3]))));
      });
      return [];
    }],
    // tidy (vals: me, me, cutoff)
    ["SELECT id, owner_id, friend_id FROM friendships WHERE (owner_id = ? OR friend_id = ?) AND status = 'waiting' AND removed_at IS NULL AND requested_at <= ?::timestamptz", (v) =>
      rows.friendships.filter((f) => (eq(f.owner_id, v[0]) || eq(f.friend_id, v[1])) && f.status === 'waiting' && live(f) && f.requested_at != null && ms(f.requested_at) <= ms(v[2]))
        .map((f) => ({ id: f.id, owner_id: f.owner_id, friend_id: f.friend_id }))],
    ["SELECT id, email FROM friendships WHERE owner_id = ? AND status = 'none' AND friend_id IS NULL AND requested_at IS NULL AND removed_at IS NULL", (v) =>
      rows.friendships.filter((f) => eq(f.owner_id, v[0]) && f.status === 'none' && f.friend_id == null && f.requested_at == null && live(f)).map((f) => ({ id: f.id, email: f.email }))],
    ['SELECT f.id, f.owner_id, a.first_name FROM friendships f JOIN player_accounts a ON a.id = f.owner_id WHERE f.email = ? AND f.owner_id <> ?', (v) =>
      rows.friendships.filter((f) => f.email === v[0] && !eq(f.owner_id, v[1]) && f.status === 'none' && f.friend_id == null && f.requested_at == null && live(f) && account(f.owner_id))
        .map((f) => ({ id: f.id, owner_id: f.owner_id, first_name: account(f.owner_id).first_name }))],
    ['SELECT id FROM friendships WHERE owner_id = ? AND email = ? AND removed_at IS NULL', (v) =>
      rows.friendships.filter((f) => eq(f.owner_id, v[0]) && f.email === v[1] && live(f)).map((f) => ({ id: f.id }))],
    // add (vals: id, owner, email, first, last, nickname, friendId, status, requestedAt)
    ['INSERT INTO friendships (id, owner_id, email, first_name, last_name, nickname, friend_id, status, requested_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?::timestamptz)', (v) => {
      insertFriendship({ id: v[0], owner_id: v[1], email: v[2], first_name: v[3], last_name: v[4], nickname: v[5], friend_id: v[6], status: v[7], requested_at: date(v[8]) });
      return [];
    }],
    // mergeFrom (vals: newId, me, oldId)
    ["UPDATE casual_games SET side_b = jsonb_set(side_b, '{friendship_id}', to_jsonb(?::text)) WHERE recorded_by = ? AND side_b->>'friendship_id' = ?", (v) => {
      rows.casual_games.forEach((g) => { if (eq(g.recorded_by, v[1]) && fidOf(g) === v[2]) g.side_b = Object.assign({}, g.side_b, { friendship_id: v[0] }); });
      return [];
    }],
    ['UPDATE friendships SET removed_at = ?::timestamptz WHERE id = ? AND owner_id = ? AND removed_at IS NULL', (v) => {
      rows.friendships.filter((f) => f.id === v[1] && eq(f.owner_id, v[2]) && live(f)).forEach((f) => { f.removed_at = date(v[0]); });
      return [];
    }],
    ["SELECT id FROM friendships WHERE owner_id = ? AND friend_id = ? AND status = 'waiting' AND removed_at IS NULL AND requested_at > ?::timestamptz", (v) =>
      rows.friendships.filter((f) => eq(f.owner_id, v[0]) && eq(f.friend_id, v[1]) && f.status === 'waiting' && live(f) && ms(f.requested_at) > ms(v[2])).map((f) => ({ id: f.id }))],
    // myEntryFor (vals: me, player, email, player): the entry matched by account first
    ['SELECT id, status FROM friendships WHERE owner_id = ? AND removed_at IS NULL AND (friend_id = ? OR email = ?)', (v) =>
      rows.friendships.filter((f) => eq(f.owner_id, v[0]) && live(f) && (eq(f.friend_id, v[1]) || f.email === v[2]))
        .sort((a, b) => Number(eq(b.friend_id, v[3])) - Number(eq(a.friend_id, v[3]))).map((f) => ({ id: f.id, status: f.status }))],
    ["SELECT f.id, f.owner_id, f.requested_at, a.email, a.first_name, a.last_name FROM friendships f JOIN player_accounts a ON a.id = f.owner_id WHERE f.id = ? AND f.friend_id = ? AND f.status = 'waiting' AND f.removed_at IS NULL", (v) =>
      rows.friendships.filter((f) => f.id === v[0] && eq(f.friend_id, v[1]) && f.status === 'waiting' && live(f) && account(f.owner_id))
        .map((f) => { const a = account(f.owner_id); return { id: f.id, owner_id: f.owner_id, requested_at: f.requested_at, email: a.email, first_name: a.first_name, last_name: a.last_name }; })],
    // accept (vals 0-1: rid, me | 2-6: owner, first, last, myId, hasMine | 7-13: myId, me, email, first, last, owner, hasMine
    // | 14: me | 15-17: mutual, me, myId | 18: notice data | 19-21: nowIso, me, rid). Every part hangs off r: when the
    // sender's entry is no longer waiting for the caller, nothing is written and no row comes back.
    ["WITH r AS ( UPDATE friendships SET status = 'linked' WHERE id = ? AND friend_id = ? AND status = 'waiting' AND removed_at IS NULL RETURNING id, owner_id )", (v) => {
      const r = rows.friendships.find((f) => f.id === v[0] && eq(f.friend_id, v[1]) && f.status === 'waiting' && live(f));
      if (!r) return [];
      const me = v[1], owner = r.owner_id, myId = v[5];
      if (v[6]) {
        const mine = rows.friendships.find((f) => f.id === myId);
        if (mine) Object.assign(mine, { status: 'linked', friend_id: v[2], requested_at: null, first_name: v[3], last_name: v[4] });
      } else {
        insertFriendship({ id: v[7], owner_id: v[8], email: v[9], first_name: v[10], last_name: v[11], nickname: '', friend_id: v[12], status: 'linked', requested_at: null });
      }
      r.status = 'linked';
      rows.player_games.forEach((p) => {
        const g = game(p.game_id);
        if (!g || p.status !== 'held') return;
        if (eq(p.player_id, me) && eq(g.recorded_by, owner) && fidOf(g) === r.id) p.status = 'saved';
        else if (v[15] && eq(p.player_id, owner) && eq(g.recorded_by, me) && fidOf(g) === v[17]) p.status = 'saved';
      });
      addNotice(owner, 'friend_accepted', v[18]);
      rows.player_notices.forEach((n) => {
        if (eq(n.player_id, me) && n.kind === 'friend_request' && n.read_at == null && String(n.data.friendshipId) === v[21]) n.read_at = date(v[19]);
      });
      return [{ id: r.id }];
    }],
    ["SELECT id, owner_id, friend_id FROM friendships WHERE id = ? AND friend_id = ? AND status = 'waiting' AND removed_at IS NULL", (v) =>
      rows.friendships.filter((f) => f.id === v[0] && eq(f.friend_id, v[1]) && f.status === 'waiting' && live(f)).map((f) => ({ id: f.id, owner_id: f.owner_id, friend_id: f.friend_id }))],
    // resend on a waiting entry (vals: now, friendId, id, cutoff)
    ["UPDATE friendships SET requested_at = ?::timestamptz, friend_id = ? WHERE id = ? AND status = 'waiting' AND requested_at <= ?::timestamptz RETURNING id", (v) => {
      const f = rows.friendships.find((x) => x.id === v[2] && x.status === 'waiting' && ms(x.requested_at) <= ms(v[3]));
      if (!f) return [];
      Object.assign(f, { requested_at: date(v[0]), friend_id: v[1] });
      return [{ id: f.id }];
    }],
    // update (vals: nickname, first, last, email, emailChanged, emailChanged, id, owner)
    ['UPDATE friendships SET nickname = ?, first_name = ?, last_name = ?, email = ?,', (v) => {
      const f = rows.friendships.find((x) => x.id === v[6] && eq(x.owner_id, v[7]) && live(x));
      if (!f) return [];
      if (v[3] !== f.email && rows.friendships.some((x) => x !== f && live(x) && eq(x.owner_id, v[7]) && x.email === v[3])) throw dup('friendships_owner_email');
      Object.assign(f, { nickname: v[0], first_name: v[1], last_name: v[2], email: v[3] });
      if (v[4]) f.requested_at = null;
      if (v[5]) f.invited_at = null;
      return [];
    }],
    ['UPDATE friendships SET first_name = ?, last_name = ? WHERE id = ?', (v) => {
      rows.friendships.filter((f) => f.id === v[2]).forEach((f) => Object.assign(f, { first_name: v[0], last_name: v[1] }));
      return [];
    }],
    // removePair (vals: now, rowId, otherId, me, otherId, otherEmail, otherId, me, myEmail)
    ['UPDATE friendships SET removed_at = ?::timestamptz WHERE removed_at IS NULL AND (id = ?', (v) => {
      rows.friendships.forEach((f) => {
        if (!live(f)) return;
        const e = String(f.email).toLowerCase();
        if (f.id === v[1] || (v[2] != null && ((eq(f.owner_id, v[3]) && (eq(f.friend_id, v[4]) || e === v[5]))
            || (eq(f.owner_id, v[6]) && (eq(f.friend_id, v[7]) || e === v[8]))))) f.removed_at = date(v[0]);
      });
      return [];
    }],
    ['SELECT a.id, a.email FROM friendships f JOIN player_accounts a ON a.id = f.owner_id WHERE f.id = ? AND f.removed_at IS NULL', (v) =>
      rows.friendships.filter((f) => f.id === v[0] && live(f) && (eq(f.friend_id, v[1]) || String(f.email).toLowerCase() === v[2]) && account(f.owner_id))
        .map((f) => { const a = account(f.owner_id); return { id: a.id, email: a.email }; })],
    ['INSERT INTO friend_blocks (blocker_id, blocked_id) VALUES (?, ?) ON CONFLICT DO NOTHING', (v) => {
      if (!rows.friend_blocks.some((b) => eq(b.blocker_id, v[0]) && eq(b.blocked_id, v[1]))) rows.friend_blocks.push({ blocker_id: v[0], blocked_id: v[1], created_at: now() });
      return [];
    }],
    // invite claim (vals: now, id, cutoff)
    ['UPDATE friendships SET invited_at = ?::timestamptz WHERE id = ? AND removed_at IS NULL AND (invited_at IS NULL OR invited_at <= ?::timestamptz) RETURNING id', (v) => {
      const f = rows.friendships.find((x) => x.id === v[1] && live(x) && (x.invited_at == null || ms(x.invited_at) <= ms(v[2])));
      if (!f) return [];
      f.invited_at = date(v[0]);
      return [{ id: f.id }];
    }],
    ['UPDATE friendships SET invited_at = ?::timestamptz WHERE id = ?', (v) => {
      rows.friendships.filter((f) => f.id === v[1]).forEach((f) => { f.invited_at = date(v[0]); });
      return [];
    }],
    // list
    ['SELECT f.id, f.email, f.first_name, f.last_name, f.nickname, f.status, f.friend_id, f.requested_at, f.invited_at, f.created_at, a.first_name AS account_first_name', (v) =>
      rows.friendships.filter((f) => eq(f.owner_id, v[0]) && live(f)).map((f) => {
        const a = f.friend_id != null ? account(f.friend_id) : null;
        return Object.assign(copy(f), { account_first_name: a ? a.first_name : null, account_last_name: a ? a.last_name : null });
      })],
    ["SELECT f.id, f.owner_id, f.requested_at, a.first_name, a.last_name FROM friendships f JOIN player_accounts a ON a.id = f.owner_id WHERE f.friend_id = ? AND f.status = 'waiting'", (v) =>
      rows.friendships.filter((f) => eq(f.friend_id, v[0]) && f.status === 'waiting' && live(f) && ms(f.requested_at) > ms(v[1]) && account(f.owner_id))
        .sort((a, b) => ms(b.requested_at) - ms(a.requested_at))
        .map((f) => { const a = account(f.owner_id); return { id: f.id, owner_id: f.owner_id, requested_at: f.requested_at, first_name: a.first_name, last_name: a.last_name }; })],
    ['SELECT id, owner_id, friend_id FROM friendships WHERE owner_id = ? OR friend_id = ?', (v) =>
      rows.friendships.filter((f) => eq(f.owner_id, v[0]) || eq(f.friend_id, v[1])).map((f) => ({ id: f.id, owner_id: f.owner_id, friend_id: f.friend_id }))],
    ["SELECT g.id, g.recorded_by, g.side_b->>'friendship_id' AS fid, pg.won, pg.stats, pg.played_at, o.stats AS their_stats", (v) =>
      rows.player_games.filter((p) => eq(p.player_id, v[0]) && p.status === 'saved' && fidOf(game(p.game_id)) != null)
        .sort((a, b) => ms(b.played_at) - ms(a.played_at))
        .map((p) => {
          const g = game(p.game_id);
          const o = rows.player_games.find((q) => q.game_id === g.id && !eq(q.player_id, p.player_id) && q.status === 'saved');
          return { id: g.id, recorded_by: g.recorded_by, fid: fidOf(g), won: p.won, stats: p.stats, played_at: p.played_at, their_stats: o ? o.stats : null };
        })],

    // ---- scorecard (scorecard.js) ----
    ['SELECT pg.game_id, pg.kind, pg.stats, pg.won, pg.played_at, pg.side, g.id, g.format, g.side_a, g.side_b FROM player_games pg LEFT JOIN casual_games g', (v) =>
      rows.player_games.filter((p) => eq(p.player_id, v[0]) && p.status === 'saved')
        .sort((a, b) => (ms(b.played_at) - ms(a.played_at)) || (a.game_id < b.game_id ? 1 : -1))
        .map((p) => {
          const g = game(p.game_id) || {};
          return { game_id: p.game_id, kind: p.kind, stats: p.stats, won: p.won, played_at: p.played_at, side: p.side,
            id: g.id == null ? null : g.id, format: g.format || null, side_a: g.side_a || null, side_b: g.side_b || null };
        })],
    ['SELECT id, kind, data, created_at FROM player_notices WHERE player_id = ? AND read_at IS NULL ORDER BY created_at DESC LIMIT ?', (v) =>
      rows.player_notices.filter((n) => eq(n.player_id, v[0]) && n.read_at == null).sort((a, b) => ms(b.created_at) - ms(a.created_at))
        .slice(0, Number(v[1])).map((n) => ({ id: n.id, kind: n.kind, data: n.data, created_at: n.created_at }))],
    ['UPDATE player_notices SET read_at = now() WHERE player_id = ? AND read_at IS NULL AND id = ANY(?::uuid[])', (v) => {
      rows.player_notices.filter((n) => eq(n.player_id, v[0]) && n.read_at == null && v[1].includes(n.id)).forEach((n) => { n.read_at = now(); });
      return [];
    }],
  ];

  api.sql = async (strings, ...vals) => {
    const text = strings.join('?').replace(/\s+/g, ' ').trim();
    api.calls.push({ text, vals });
    if (pending) { const e = pending; pending = null; throw e; }
    const h = H.find((x) => text.startsWith(x[0]));
    if (!h) throw new Error('fake-player-db: unrecognised SQL statement: ' + text);
    return h[1](vals);
  };
  return api;
}

module.exports = { createFakePlayerDb };

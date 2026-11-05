// Casual games a player saves to their account, and reading them back (spec
// docs/superpowers/specs/2026-11-04-accounts-scorecard-venue-design.md). The app sends the match's events; everything
// stored (the winner, each player's stats) comes from replaying them here with the same engine the phone used, so a
// changed or made-up number in the request never reaches anyone's scorecard.
const { sql } = require('./db');
const { hit } = require('./throttle');
const DDMatch = require('../../match-engine.js');
const { gameStats } = require('../../player-stats.js');
const friends = require('./friends');
const friendRules = require('../../friend-rules.js');

const ID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const MAX_EVENTS = 5000;
const CASUAL_BESTS = [1, 3, 5, 7, 9];
const MAX_NAME = 20;               // the casual setup screen's name box takes 20 characters
const MAX_PLAYED_AGO_MS = 30 * 24 * 60 * 60 * 1000;
// Flags that mean the events do not add up to a game the app could have made (match-engine.js canConfirm's list, plus
// a turn keyed for the wrong player, which casual play never does).
const BAD_FLAGS = ['not_checkout', 'now_bust', 'after_win', 'not_reached', 'out_of_turn'];
// The events go into the database the organiser app shares, so a request may not be larger than any real game (a best of
// 9 keyed dart by dart is far under this), and one player may not save faster than anyone plays.
const MAX_EVENTS_BYTES = 256 * 1024;
const SAVE_LIMIT = 60;                 // saves per player per hour (a retry of the same game counts too)
const SAVE_WINDOW_MS = 60 * 60 * 1000;
// Every field of an event that match-engine.js reads (collectTurns, replayCore): turns and their edits, undos, restores,
// the bulls, Choice, the throwing order and the confirm. Nothing else is stored, so extra fields cannot fill the database.
const EVENT_FIELDS = ['type', 'seq', 'id', 'turnId', 'leg', 'side', 'player', 'mode', 'score', 'bust', 'darts', 'finishDart',
  'version', 'winner', 'pick', 'game', 'first', 'at', 'dev'];

function fail(status, code, error) { return { status, code, error }; }
const TOO_MANY = fail(429, 'too_many', 'Too many games saved. Try again later.');

function plain(v) { return v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'; }
// The events as stored: only the engine's own events (plain objects with a type, as cleanEvents keeps), each rebuilt from
// EVENT_FIELDS with plain values only, and a dart as just { n, m }. The request's own objects are never stored.
function canonicalEvents(events) {
  return events.filter(function (e) { return e && typeof e === 'object' && !Array.isArray(e) && typeof e.type === 'string'; })
    .map(function (e) {
      const out = {};
      EVENT_FIELDS.forEach(function (k) {
        const v = e[k];
        if (k === 'darts' && Array.isArray(v)) {
          out.darts = v.map(function (d) {
            if (!d || typeof d !== 'object' || Array.isArray(d)) return plain(d) ? d : null;
            const dt = {};
            if (plain(d.n)) dt.n = d.n;
            if (plain(d.m)) dt.m = d.m;
            return dt;
          });
        } else if (v !== undefined && plain(v)) out[k] = v;
      });
      return out;
    });
}

// The format as the engine reads it, or null when it is not one the casual setup screen can make: 501 Single-In,
// Cricket or Choice (the mixed match from scoring-model.js formatFor), best of 1 to 9, side 'a' throwing the bull first.
// Compared after normalizing, so it is the rules that must match, not the exact spelling the app sent.
function casualFormat(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const f = DDMatch.normalizeFormat(raw);
  if (CASUAL_BESTS.indexOf(f.bestOf) < 0) return null;
  let made;
  if (f.game === 'x01') made = { game: 'x01', start: 501, inRule: 'SI', bestOf: f.bestOf, bullFirst: 'first', decider: 'alternate' };
  else if (f.game === 'cricket') made = { game: 'cricket', bestOf: f.bestOf, bullFirst: 'first', decider: 'alternate' };
  else {
    // formatFor: the legs before the Choice leg as picked, or 501 and Cricket in turn when they were not all picked
    const good = f.pattern.length === f.bestOf - 1 && f.pattern.length > 0;
    made = { game: 'mixed', start: 501, inRule: 'SI', pattern: good ? f.pattern : ['x01', 'cricket'], bestOf: f.bestOf, bullFirst: 'first', decider: 'choice' };
  }
  const m = DDMatch.normalizeFormat(made);
  return JSON.stringify(m) === JSON.stringify(f) ? f : null;
}

// The engine's players object, read from the turns. Casual play names each player by the name typed on the setup
// screen (scoring-model.js create(): players { a: [name a], b: [name b] }, and every turn carries that name), and the
// request does not repeat the names, so they are taken from the events: exactly one name per side, different from each
// other. Null when the turns do not look like that.
function playersFrom(events) {
  const keys = { a: [], b: [] };
  events.forEach(function (e) {
    if (!e || typeof e !== 'object' || e.type !== 'turn') return;
    const side = e.side === 'b' ? 'b' : e.side === 'a' ? 'a' : null;
    if (!side || typeof e.player !== 'string' || !e.player || e.player.length > 100) { keys.bad = true; return; }
    if (keys[side].indexOf(e.player) < 0) keys[side].push(e.player);
  });
  if (keys.bad || keys.a.length !== 1 || keys.b.length !== 1 || keys.a[0] === keys.b[0]) return null;
  return { a: keys.a, b: keys.b };
}

// Everything about a replayed game that reaches the database or a scorecard, as one string to compare.
function outcome(format, players, events) {
  const st = DDMatch.replay(format, players, events);
  return JSON.stringify({
    winner: st.winner, legsWon: st.legsWon, flags: st.flags, ignored: st.ignored,
    legs: st.legs.map(function (l) { return { winner: l.winner, game: l.game }; }),
    a: gameStats(format, players, events, players.a[0]), b: gameStats(format, players, events, players.b[0])
  });
}

function round2(x) { return typeof x === 'number' && isFinite(x) ? Math.round(x * 100) / 100 : null; }

// The numbers shown beside a game: the 3-dart average when the player threw any 01 leg, marks per round when any Cricket
// leg (a Choice game has both).
function headline(stats) {
  const h = {};
  if (stats && stats.x01 && stats.x01.darts) h.avg3 = round2(stats.x01.points / stats.x01.darts * 3);
  if (stats && stats.cricket && stats.cricket.darts) h.mpr = round2(stats.cricket.marks / stats.cricket.darts * 3);
  return h;
}

// Legs won and lost, from one player's stats (every leg of a casual game is thrown by both players).
function legsOf(stats) {
  let won = 0, played = 0;
  ['x01', 'cricket'].forEach(function (k) { if (stats && stats[k]) { won += Number(stats[k].legsWon) || 0; played += Number(stats[k].legsPlayed) || 0; } });
  return { won, lost: played - won };
}

// The time the game was played: the phone's own time when it is believable (within the last 30 days and not ahead of
// now), else now. A phone that saves a game later, offline in between, keeps the real date.
function playedAtFrom(raw, now) {
  const t = typeof raw === 'string' || typeof raw === 'number' ? new Date(raw).getTime() : NaN;
  if (!isFinite(t) || t > now || t < now - MAX_PLAYED_AGO_MS) return new Date(now);
  return new Date(t);
}

function gameName(format) { return format && format.game === 'cricket' ? 'cricket' : format && format.game === 'mixed' ? 'choice' : '501'; }
function fullName(first, last) { return (String(first || '') + ' ' + String(last || '')).trim(); }

// The answer to a save: what was stored for the caller ('saved') and for the opponent ('saved' | 'held' | 'none',
// or null for a guest).
function summary(friendStatus) { return { me: 'saved', friend: friendStatus === undefined ? null : friendStatus }; }

/* POST /api/games/save. Returns { status, body } for the handler to send. Side A is always the caller. */
async function saveGame(me, body, now) {
  body = body || {};
  // Counted before anything else, so neither a retry nor a refused request is free (the app's queue keeps a game that
  // gets 429 and tries again later).
  if (await hit('p:save:' + me.id, SAVE_LIMIT, SAVE_WINDOW_MS)) return TOO_MANY;
  const id = body.id;
  if (typeof id !== 'string' || !ID_RE.test(id)) return fail(400, 'bad_id', 'This game has no valid id.');
  if (!Array.isArray(body.events)) return fail(400, 'bad_game', 'This game could not be read.');
  if (body.events.length > MAX_EVENTS) return fail(413, 'too_many_events', 'This game is too long to save.');
  let rawSize;
  try { rawSize = Buffer.byteLength(JSON.stringify(body.events), 'utf8'); } catch (e) { rawSize = Infinity; }
  if (rawSize > MAX_EVENTS_BYTES) return fail(400, 'bad_game', 'This game could not be read.');

  // Already saved (the app retries after a dropped connection): answer as the first save did, write nothing.
  const existing = await existingSummary(me, id);
  if (existing) return existing;

  const format = casualFormat(body.format);
  const players = playersFrom(body.events);
  if (!format || !players) return fail(400, 'bad_game', 'This game could not be read.');
  let st;
  try { st = DDMatch.replay(format, players, body.events); } catch (e) { st = null; }
  if (!st || st.ignored.length || st.flags.some(function (f) { return BAD_FLAGS.indexOf(f.code) >= 0; })) {
    return fail(400, 'bad_game', 'This game could not be read.');
  }
  if (!st.winner) return fail(400, 'game_not_finished', 'This game is not finished yet.');
  // What is stored and counted from here on is the canonical copy. It must replay to the same game as the request did
  // (the same winner, legs, flags and both players' numbers); when it does not (a field the engine read that was not a
  // plain value), the game is refused rather than stored as something the phone never showed. The whole replayed state
  // is not compared: an edit's darts keep whatever extra fields they came with, which change nothing that counts.
  const events = canonicalEvents(body.events);
  let same = false;
  try { same = outcome(format, players, events) === outcome(format, players, body.events); } catch (e) { same = false; }
  if (!same) return fail(400, 'bad_game', 'This game could not be read.');
  const statsA = gameStats(format, players, events, players.a[0]);
  // A game with no throws for the caller would be an empty row on their scorecard: refused.
  if (!statsA.x01 && !statsA.cricket) return fail(400, 'bad_game', 'This game could not be read.');

  // The opponent: a guest (a name, nothing stored for them) or an entry on the caller's own friends list.
  const sideB = body.sideB || {};
  let opp;
  if (typeof sideB.friendshipId === 'string' && sideB.guest === undefined) {
    const entry = await friends.entryFor(me.id, sideB.friendshipId);
    if (entry) {
      // Linked: saved for them too. Waiting: kept for them, held until they accept. None: nothing for them.
      let status = entry.status === 'linked' ? 'saved' : entry.status === 'waiting' ? 'held' : 'none';
      if (status !== 'none' && !entry.friend_id) status = 'none';
      if (entry.friend_id && entry.friend_id === me.id) return fail(400, 'bad_opponent', 'That friend is not on your list.');
      // A blocked pair, or a request past its 30 days (declined by then, friends.js), stores nothing for the friend: the
      // same as a friend with no account.
      if (status !== 'none' && ((entry.status === 'waiting' && friendRules.heldExpired(entry.requested_at, now))
          || await friends.blockedBetween(me.id, entry.friend_id))) status = 'none';
      opp = {
        status, playerId: status === 'none' ? null : entry.friend_id,
        side: { name: fullName(entry.first_name, entry.last_name), nickname: entry.nickname || '', player_id: status === 'none' ? null : entry.friend_id, friendship_id: entry.id, guest: false }
      };
    } else {
      // Not on the live list any more, but it was the caller's own entry (removed by them or a merge, or the friend
      // removed or blocked them after the game was set up): the game is still the caller's, so it is saved for them
      // alone, under the same entry and name so the head-to-head stays together. Only an id that was never on the
      // caller's list (or is someone else's) is refused.
      const gone = await friends.removedEntryFor(me.id, sideB.friendshipId);
      if (!gone) return fail(400, 'bad_opponent', 'That friend is not on your list.');
      opp = {
        status: 'none', playerId: null,
        side: { name: fullName(gone.first_name, gone.last_name), nickname: gone.nickname || '', player_id: null, friendship_id: gone.id, guest: false }
      };
    }
  } else if (typeof sideB.guest === 'string' && sideB.friendshipId === undefined) {
    const name = sideB.guest.trim();
    if (!name || name.length > MAX_NAME) return fail(400, 'bad_opponent', 'Type the other player\'s name.');
    opp = { status: undefined, playerId: null, side: { name, nickname: '', player_id: null, friendship_id: null, guest: true } };
  } else {
    return fail(400, 'bad_opponent', 'Choose who you played.');
  }

  const sideA = { name: fullName(me.first_name, me.last_name), nickname: '', player_id: me.id, friendship_id: null, guest: false };
  const playedAt = playedAtFrom(body.playedAt, now).toISOString();
  const statsB = opp.playerId ? gameStats(format, players, events, players.b[0]) : null;
  const wonA = st.winner === 'a';
  // A linked friend hears about it: who recorded it, whether they won, the legs (theirs first) and their headline.
  let notice = null;
  if (opp.status === 'saved') {
    const lb = legsOf(statsB);
    notice = Object.assign({ gameId: id, by: me.first_name, won: !wonA, score: lb.won + '-' + lb.lost }, headline(statsB));
  }

  // One statement, so the game, both rows and the notice are written together or not at all. ON CONFLICT: two saves
  // racing each other store the game once; the loser writes nothing (every insert below reads from g).
  const rows = await sql`
    WITH g AS (
      INSERT INTO casual_games (id, recorded_by, format, events, side_a, side_b, winner, played_at)
      VALUES (${id}, ${me.id}, ${JSON.stringify(format)}::jsonb, ${JSON.stringify(events)}::jsonb,
              ${JSON.stringify(sideA)}::jsonb, ${JSON.stringify(opp.side)}::jsonb, ${st.winner}, ${playedAt}::timestamptz)
      ON CONFLICT (id) DO NOTHING
      RETURNING id, played_at
    ), mine AS (
      INSERT INTO player_games (game_id, player_id, side, status, kind, stats, won, played_at)
      SELECT id, ${me.id}, 'a', 'saved', 'casual', ${JSON.stringify(statsA)}::jsonb, ${wonA}, played_at FROM g
    ), theirs AS (
      INSERT INTO player_games (game_id, player_id, side, status, kind, stats, won, played_at)
      SELECT id, ${opp.playerId}::uuid, 'b', ${opp.status === 'held' ? 'held' : 'saved'}, 'casual',
             ${statsB ? JSON.stringify(statsB) : null}::jsonb, ${!wonA}, played_at
      FROM g WHERE ${opp.playerId}::uuid IS NOT NULL
    ), note AS (
      INSERT INTO player_notices (player_id, kind, data)
      SELECT ${opp.playerId}::uuid, 'casual_game', ${notice ? JSON.stringify(notice) : null}::jsonb
      FROM g WHERE ${!!notice}::boolean
    )
    SELECT id FROM g
  `;
  if (!rows.length) {
    const raced = await existingSummary(me, id);
    if (raced) return raced;
  }
  return { status: 200, body: { saved: summary(opp.status) } };
}

// The save answer for a game already stored, or null when there is none. A game id recorded by someone else is
// refused without saying whose it is.
async function existingSummary(me, id) {
  const rows = await sql`SELECT recorded_by, side_b FROM casual_games WHERE id = ${id}`;
  if (!rows.length) return null;
  const g = rows[0];
  if (String(g.recorded_by) !== String(me.id)) return fail(400, 'bad_id', 'This game has no valid id.');
  const side = g.side_b || {};
  if (side.guest) return { status: 200, body: { saved: summary(undefined) } };
  if (!side.player_id) return { status: 200, body: { saved: summary('none') } };
  const theirs = await sql`SELECT status FROM player_games WHERE game_id = ${id} AND player_id = ${side.player_id}`;
  return { status: 200, body: { saved: summary(theirs.length ? theirs[0].status : 'none') } };
}

// How the caller sees the other side of a game: the nickname they gave a friend, else the stored name.
function opponentOf(g, mySide) {
  const other = (mySide === 'a' ? g.side_b : g.side_a) || {};
  return { name: (mySide === 'a' && other.nickname) || other.name || '', guest: !!other.guest };
}

// One game as the list and the scorecard's recent strip show it (r: a player_games row joined with its casual_games row).
function listItem(r) {
  const legs = legsOf(r.stats);
  return {
    id: r.id, playedAt: new Date(r.played_at).toISOString(), game: gameName(r.format), bestOf: r.format && r.format.bestOf,
    won: !!r.won, score: legs.won + '-' + legs.lost, opponent: opponentOf(r, r.side), headline: headline(r.stats)
  };
}

/* GET /api/games/list?limit=&before=: the caller's saved games, newest first. before is the previous page's nextBefore:
   "<playedAt>,<game id>" of its last game. The id is part of it because games saved with the same time must not fall
   between two pages. A bare time is accepted too (everything strictly older). */
async function listGames(me, query) {
  query = query || {};
  let limit = Math.floor(Number(query.limit));
  if (!(limit >= 1)) limit = 20;
  limit = Math.min(limit, 50);
  let before = null, beforeId = '';
  if (query.before !== undefined && query.before !== '') {
    const parts = String(query.before).split(',');
    const t = new Date(parts[0]).getTime();
    if (!isFinite(t) || parts.length > 2 || (parts[1] !== undefined && !ID_RE.test(parts[1]))) return fail(400, 'bad_before', 'That page could not be found.');
    before = new Date(t).toISOString();
    beforeId = parts[1] || '';
  }
  const rows = await sql`
    SELECT g.id, g.format, g.side_a, g.side_b, pg.side, pg.won, pg.stats, pg.played_at
    FROM player_games pg JOIN casual_games g ON g.id = pg.game_id
    WHERE pg.player_id = ${me.id} AND pg.status = 'saved'
      AND (${before}::timestamptz IS NULL OR (pg.played_at, pg.game_id) < (${before}::timestamptz, ${beforeId}::text))
    ORDER BY pg.played_at DESC, pg.game_id DESC
    LIMIT ${limit}
  `;
  const games = rows.map(listItem);
  return { status: 200, body: { games, nextBefore: games.length === limit ? games[games.length - 1].playedAt + ',' + games[games.length - 1].id : null } };
}

/* GET /api/games/one?id=: one game the caller played in, with their stats and, when the opponent is a linked friend
   (their row is saved) or a guest, the opponent's too. A waiting friend's or an unlinked entry's numbers are not shown. */
async function oneGame(me, query) {
  const id = query && query.id;
  if (typeof id !== 'string' || !ID_RE.test(id)) return fail(400, 'bad_id', 'This game has no valid id.');
  const gs = await sql`SELECT id, format, events, side_a, side_b, winner, played_at FROM casual_games WHERE id = ${id}`;
  if (!gs.length) return fail(404, 'not_found', 'Game not found.');
  const g = gs[0];
  const pgs = await sql`SELECT player_id, side, status, stats, won FROM player_games WHERE game_id = ${id}`;
  const mine = pgs.find(function (r) { return String(r.player_id) === String(me.id); });
  // A held game is not on the caller's scorecard until they accept it, so it is not shown yet either (the recorder's
  // name and numbers stay private until then).
  if (!mine || mine.status !== 'saved') return fail(404, 'not_found', 'Game not found.');
  const otherSide = mine.side === 'a' ? 'b' : 'a';
  const otherRow = pgs.find(function (r) { return r.side === otherSide; });
  const opp = opponentOf(g, mine.side);
  let oppStats = null;
  if (otherRow && otherRow.status === 'saved') oppStats = otherRow.stats;
  else if (opp.guest) {
    const players = playersFrom(Array.isArray(g.events) ? g.events : []);
    if (players) oppStats = gameStats(g.format, players, g.events, players[otherSide][0]);
  }
  const legs = legsOf(mine.stats);
  return {
    status: 200,
    body: {
      game: {
        id: g.id, playedAt: new Date(g.played_at).toISOString(), game: gameName(g.format), bestOf: g.format && g.format.bestOf,
        status: mine.status, won: !!mine.won, score: legs.won + '-' + legs.lost,
        me: { name: (mine.side === 'a' ? g.side_a : g.side_b).name, stats: mine.stats },
        opponent: { name: opp.name, guest: opp.guest, stats: oppStats }
      }
    }
  };
}

module.exports = { saveGame, listGames, oneGame, listItem, opponentOf, gameName, round2, casualFormat, playersFrom, headline, legsOf, playedAtFrom, ID_RE, MAX_EVENTS };

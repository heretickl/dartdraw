// The player library (spec: docs/superpowers/specs/2026-10-29-player-library-design.md). Every database statement
// about players lives here; the organiser endpoints (api/_routes/players/*) and the Admin ones
// (api/_routes/admin/players/*) only check who is asking and pass the organiser id in.
//
// A player is { id, name, club } owned by one organiser. Events keep their own copies of the names: an entry's
// members carry { playerId, name, club }, and changing the library never changes an event. "Events played" and
// "Last played" are worked out from the organiser's own events (tournaments.data entriesList[].members[].playerId),
// matching the player's id or one of its aliases (ids merged into it), so they never drift.
//
// Statements (organiser id is always a bound value, never part of the SQL text):
//   SELECT id, name, club, removed_at FROM players WHERE organizer_id = ?                  (ensurePlayers)
//   UPDATE players ... FROM unnest(ids, names, clubs) ... SET removed_at = NULL             (ensurePlayers: bring back)
//   INSERT INTO players (id, organizer_id, name, club) SELECT ... FROM unnest(...) ON CONFLICT DO NOTHING
//   WITH uses AS (...) SELECT ... FROM players p ... GROUP BY p.id                          (listPlayers, adminListPlayers)
//   UPDATE players SET name, club WHERE id = ? AND organizer_id = ? AND removed_at IS NULL  (updatePlayer)
//   UPDATE players SET removed_at = now() WHERE ...                                         (removePlayer, mergePlayers)
//   SELECT id, organizer_id, aliases FROM players WHERE id = ANY(?) ...                    (mergePlayers, playerOwner)
// Postgres 42P01 (the table does not exist yet: the owner has not run migrations/2026-10-29-players.sql) becomes
// LibraryError('not_set_up') everywhere.
const crypto = require('crypto');
const { sql } = require('./db');

const PLAYER_LIMIT = 5000;
const NAME_MAX = 80;
const ENSURE_MAX = 200;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class LibraryError extends Error {
  constructor(code) { super(code); this.code = code; }
}

// Trimmed, inner spaces collapsed, control characters dropped, at most 80 characters. '' when nothing is left.
function cleanText(s) {
  if (typeof s !== 'string') return '';
  return s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX).trim();
}
const cleanPlayerName = cleanText;
const cleanClub = cleanText;
const keyOf = (name, club) => name.toLowerCase() + '\u0000' + club.toLowerCase();
const newId = () => 'p_' + crypto.randomUUID();

async function run(fn) {
  try { return await fn(); } catch (e) {
    if (e && e.code === '42P01') throw new LibraryError('not_set_up');
    throw e;
  }
}

function toPlayer(row) {
  return {
    id: row.id,
    name: row.name,
    club: row.club || '',
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    eventsPlayed: Number(row.events_played) || 0,
    lastPlayed: row.last_played ? new Date(row.last_played).toISOString() : null
  };
}

// The organiser's live players, sorted by name, with how many of their events each played in and when last.
async function listPlayers(orgId) {
  return run(async () => {
    const rows = await sql`
      WITH uses AS (
        SELECT DISTINCT t.id AS tid, t.updated_at, m->>'playerId' AS pid
        FROM tournaments t
        CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(t.data->'entriesList') = 'array' THEN t.data->'entriesList' ELSE '[]'::jsonb END) e
        CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(e->'members') = 'array' THEN e->'members' ELSE '[]'::jsonb END) m
        WHERE t.created_by = ${orgId}::uuid AND m->>'playerId' IS NOT NULL
      )
      SELECT p.id, p.name, p.club, p.created_at,
        count(DISTINCT u.tid)::int AS events_played, max(u.updated_at) AS last_played
      FROM players p
      LEFT JOIN LATERAL unnest(array_append(p.aliases, p.id)) AS k(pid) ON true
      LEFT JOIN uses u ON u.pid = k.pid
      WHERE p.organizer_id = ${orgId}::uuid AND p.removed_at IS NULL
      GROUP BY p.id
      ORDER BY lower(p.name), lower(p.club), p.id
    `;
    return rows.map(toPlayer);
  });
}

// items: [{ name, club }] (1..200). Each one matches a live player with the same name and club (letter case ignored),
// or a player merged into a live one (the live one is returned: a merge is never undone), else brings back a removed
// one, else is added. Returns [{ id, name, club, created }] in the order of items (created: false when it was already
// in the library). Throws invalid_name for an empty name, limit past 5,000.
async function ensurePlayers(orgId, items) {
  if (!Array.isArray(items) || items.length < 1 || items.length > ENSURE_MAX) throw new LibraryError('invalid_name');
  const wanted = items.map((it) => ({ name: cleanPlayerName(it && it.name), club: cleanClub(it && it.club) }));
  if (wanted.some((w) => !w.name)) throw new LibraryError('invalid_name');
  return run(async () => {
    const rows = await sql`SELECT id, name, club, aliases, removed_at FROM players WHERE organizer_id = ${orgId}::uuid`;
    const live = new Map(), removed = new Map(), keeperOf = new Map();
    let liveCount = 0;
    rows.forEach((r) => { if (!r.removed_at) { liveCount++; (r.aliases || []).forEach((a) => keeperOf.set(a, r)); } });
    rows.forEach((r) => {
      const k = keyOf(r.name, r.club || '');
      if (!r.removed_at) live.set(k, r);
      else if (keeperOf.has(r.id)) { if (!live.has(k)) live.set(k, keeperOf.get(r.id)); }   // merged away: its keeper
      else if (!removed.has(k)) removed.set(k, r);
    });
    rows.forEach((r) => { if (!r.removed_at) live.set(keyOf(r.name, r.club || ''), r); });   // a live player beats a merged name
    const revive = new Map(), insert = new Map();
    wanted.forEach((w) => {
      const k = keyOf(w.name, w.club);
      if (live.has(k) || revive.has(k) || insert.has(k)) return;
      if (removed.has(k)) revive.set(k, { id: removed.get(k).id, name: w.name, club: w.club });
      else insert.set(k, { id: newId(), name: w.name, club: w.club });
    });
    if (liveCount + revive.size + insert.size > PLAYER_LIMIT) throw new LibraryError('limit');
    const created = new Set();
    if (revive.size) {
      const v = [...revive.values()];
      let back = [];
      try {
        back = await sql`
          UPDATE players p SET name = v.name, club = v.club, removed_at = NULL, updated_at = now()
          FROM unnest(${v.map((x) => x.id)}::text[], ${v.map((x) => x.name)}::text[], ${v.map((x) => x.club)}::text[]) AS v(id, name, club)
          WHERE p.id = v.id AND p.organizer_id = ${orgId}::uuid AND p.removed_at IS NOT NULL
          RETURNING p.id, p.name, p.club
        `;
      } catch (e) {
        if (!e || e.code !== '23505') throw e;   // added by someone else at the same moment: found again below
      }
      back.forEach((r) => { live.set(keyOf(r.name, r.club || ''), r); created.add(r.id); });
      if (back.length < v.length) {
        const again = await sql`SELECT id, name, club FROM players WHERE organizer_id = ${orgId}::uuid AND removed_at IS NULL`;
        again.forEach((r) => { const k = keyOf(r.name, r.club || ''); if (!live.has(k)) live.set(k, r); });
      }
    }
    if (insert.size) {
      const v = [...insert.values()];
      const added = await sql`
        INSERT INTO players (id, organizer_id, name, club)
        SELECT v.id, ${orgId}::uuid, v.name, v.club
        FROM unnest(${v.map((x) => x.id)}::text[], ${v.map((x) => x.name)}::text[], ${v.map((x) => x.club)}::text[]) AS v(id, name, club)
        ON CONFLICT DO NOTHING
        RETURNING id, name, club
      `;
      added.forEach((r) => { live.set(keyOf(r.name, r.club || ''), r); created.add(r.id); });
      if (added.length < v.length) {
        // Someone else added the same name and club at the same moment: use their row.
        const again = await sql`SELECT id, name, club FROM players WHERE organizer_id = ${orgId}::uuid AND removed_at IS NULL`;
        again.forEach((r) => { const k = keyOf(r.name, r.club || ''); if (!live.has(k)) live.set(k, r); });
      }
    }
    // A name the database lower-cases differently from JavaScript (some non-English letters) can miss the lookups
    // above: find it the way the unique index compares names.
    for (const w of wanted) {
      const k = keyOf(w.name, w.club);
      if (live.has(k)) continue;
      const hit = await sql`
        SELECT id, name, club FROM players
        WHERE organizer_id = ${orgId}::uuid AND removed_at IS NULL AND lower(name) = lower(${w.name}) AND lower(club) = lower(${w.club})
      `;
      if (!hit.length) throw new LibraryError('duplicate');
      live.set(k, hit[0]);
    }
    return wanted.map((w) => {
      const r = live.get(keyOf(w.name, w.club));
      return { id: r.id, name: r.name, club: r.club || '', created: created.has(r.id) };
    });
  });
}

// Renames a live player or changes the club. null when it is not this organiser's live player.
async function updatePlayer(orgId, id, fields) {
  const name = cleanPlayerName(fields && fields.name);
  const club = cleanClub(fields && fields.club);
  if (!name) throw new LibraryError('invalid_name');
  return run(async () => {
    let rows;
    try {
      rows = await sql`
        UPDATE players SET name = ${name}, club = ${club}, updated_at = now()
        WHERE id = ${String(id)} AND organizer_id = ${orgId}::uuid AND removed_at IS NULL
        RETURNING id, name, club, created_at
      `;
    } catch (e) {
      if (e && e.code === '23505') throw new LibraryError('duplicate');
      throw e;
    }
    return rows.length ? toPlayer(rows[0]) : null;
  });
}

// Takes a player out of the library (the row stays, hidden). Past events keep showing the name. false when not found.
async function removePlayer(orgId, id) {
  return run(async () => {
    const rows = await sql`
      UPDATE players SET removed_at = now(), updated_at = now()
      WHERE id = ${String(id)} AND organizer_id = ${orgId}::uuid AND removed_at IS NULL
      RETURNING id
    `;
    return rows.length > 0;
  });
}

// Keeps keepId (with the chosen name and club) and folds otherIds into it: they are hidden and their ids (and
// aliases) become the keeper's aliases, so their events count for the keeper. Every id must be this organiser's
// live player (not_found otherwise). No events are changed.
async function mergePlayers(orgId, keepId, otherIds, fields) {
  const name = cleanPlayerName(fields && fields.name);
  const club = cleanClub(fields && fields.club);
  if (!name) throw new LibraryError('invalid_name');
  const keep = String(keepId || '');
  const others = [...new Set((Array.isArray(otherIds) ? otherIds : []).map(String))].filter((x) => x && x !== keep);
  if (!keep || !others.length || others.length > ENSURE_MAX) throw new LibraryError('not_found');
  return run(async () => {
    const all = [keep].concat(others);
    const rows = await sql`
      SELECT id, aliases FROM players
      WHERE id = ANY(${all}::text[]) AND organizer_id = ${orgId}::uuid AND removed_at IS NULL
    `;
    if (rows.length !== all.length) throw new LibraryError('not_found');
    const aliases = new Set();
    rows.forEach((r) => {
      (r.aliases || []).forEach((a) => aliases.add(a));
      if (r.id !== keep) aliases.add(r.id);
    });
    await sql`
      UPDATE players SET removed_at = now(), updated_at = now()
      WHERE id = ANY(${others}::text[]) AND organizer_id = ${orgId}::uuid AND removed_at IS NULL
    `;
    let kept;
    try {
      kept = await sql`
        UPDATE players SET name = ${name}, club = ${club}, aliases = ${[...aliases]}::text[], updated_at = now()
        WHERE id = ${keep} AND organizer_id = ${orgId}::uuid
        RETURNING id, name, club, created_at
      `;
    } catch (e) {
      // The chosen name and club belong to a third player: put the others back as they were.
      await sql`UPDATE players SET removed_at = NULL WHERE id = ANY(${others}::text[]) AND organizer_id = ${orgId}::uuid`;
      if (e && e.code === '23505') throw new LibraryError('duplicate');
      throw e;
    }
    const list = await listPlayers(orgId);
    return list.find((p) => p.id === keep) || toPlayer(kept[0]);
  });
}

// The organiser a live player belongs to, or null (Admin endpoints act on behalf of that organiser).
async function playerOwner(id) {
  return run(async () => {
    const rows = await sql`SELECT organizer_id FROM players WHERE id = ${String(id)} AND removed_at IS NULL`;
    return rows.length ? String(rows[0].organizer_id) : null;
  });
}

// Admin: every organiser's live players, searched by player or club (q) and filtered by organiser (owner),
// 1..100 per page. -> { players: [{ ...player, owner: { id, name, email } }], total }
async function adminListPlayers(opts) {
  const o = opts || {};
  const q = cleanText(o.q);
  const owner = typeof o.owner === 'string' && UUID_RE.test(o.owner) ? o.owner : null;
  if (o.owner && !owner) return { players: [], total: 0 };
  const limit = Math.min(100, Math.max(1, parseInt(o.limit, 10) || 50));
  const offset = Math.min(1000000, Math.max(0, parseInt(o.offset, 10) || 0));   // a huge offset would be out of range for Postgres
  const pattern = q ? '%' + q.replace(/[\\%_]/g, (c) => '\\' + c) + '%' : null;
  return run(async () => {
    const rows = await sql`
      WITH page AS (
        SELECT p.id, p.organizer_id, p.name, p.club, p.aliases, p.created_at, count(*) OVER () AS total
        FROM players p
        WHERE p.removed_at IS NULL
          AND (${owner}::uuid IS NULL OR p.organizer_id = ${owner}::uuid)
          AND (${pattern}::text IS NULL OR p.name ILIKE ${pattern} OR p.club ILIKE ${pattern})
        ORDER BY lower(p.name), lower(p.club), p.id
        LIMIT ${limit} OFFSET ${offset}
      ),
      uses AS (
        SELECT DISTINCT t.id AS tid, t.created_by, t.updated_at, m->>'playerId' AS pid
        FROM tournaments t
        CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(t.data->'entriesList') = 'array' THEN t.data->'entriesList' ELSE '[]'::jsonb END) e
        CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(e->'members') = 'array' THEN e->'members' ELSE '[]'::jsonb END) m
        WHERE t.created_by IN (SELECT organizer_id FROM page) AND m->>'playerId' IS NOT NULL
      )
      SELECT pg.id, pg.name, pg.club, pg.created_at, pg.total,
        o.id AS owner_id, o.name AS owner_name, o.email AS owner_email,
        count(DISTINCT u.tid)::int AS events_played, max(u.updated_at) AS last_played
      FROM page pg
      JOIN organizers o ON o.id = pg.organizer_id
      LEFT JOIN LATERAL unnest(array_append(pg.aliases, pg.id)) AS k(pid) ON true
      LEFT JOIN uses u ON u.pid = k.pid AND u.created_by = pg.organizer_id
      GROUP BY pg.id, pg.name, pg.club, pg.created_at, pg.total, o.id, o.name, o.email
      ORDER BY lower(pg.name), lower(pg.club), pg.id
    `;
    return {
      players: rows.map((r) => Object.assign(toPlayer(r), { owner: { id: String(r.owner_id), name: r.owner_name, email: r.owner_email } })),
      total: rows.length ? Number(rows[0].total) : 0
    };
  });
}

module.exports = {
  PLAYER_LIMIT, NAME_MAX, ENSURE_MAX, UUID_RE, LibraryError,
  cleanPlayerName, cleanClub,
  listPlayers, ensurePlayers, updatePlayer, removePlayer, mergePlayers, playerOwner, adminListPlayers
};

// Shared pieces of the Admin events endpoints (api/_routes/admin/events/*).
// Events are always read through jsonb path extraction (never the whole `data` column), so a list of
// events does not drag every entry list, board plan and logo image out of the database.
const { sql } = require('./db');

const MAX_Q_LENGTH = 100;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const MAX_OFFSET = 1000000000;

// What the Admin screens get for an event.
// finalizedAt: the finalize time; an event whose stored `finalized` is truthy but has no `at` reports its updatedAt, so it is still
// shown (and can be reopened) as finalized.
function toEventSummary(r) {
  const updatedAt = r.updated_at ? new Date(r.updated_at).toISOString() : null;
  return {
    id: r.id,
    tournamentName: r.tournament_name || '',
    eventName: r.event_name || '',
    owner: { id: r.owner_id, name: r.owner_name, email: r.owner_email },
    format: r.format_type || null,
    date: r.event_date || null,
    published: !!r.published,
    listed: !!r.listed,
    finalizedAt: r.finalized ? (r.finalized_at || updatedAt) : null,
    updatedAt
  };
}

// Text typed in the search box becomes an ILIKE pattern in which % and _ (and the escape character) are literal.
function likePattern(q) {
  return '%' + q.replace(/[\\%_]/g, '\\$&') + '%';
}

// Query-string values are strings or (repeated keys) arrays; anything else counts as absent.
function textParam(v, max) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
}

function intParam(v, fallback, min, max) {
  const n = typeof v === 'string' ? parseInt(v, 10) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

// { q, owner, limit, offset } from a request's query string, with defaults and clamps applied.
function parseListQuery(query) {
  query = query || {};
  return {
    q: textParam(query.q, MAX_Q_LENGTH),
    owner: textParam(query.owner, 64),
    limit: intParam(query.limit, DEFAULT_LIMIT, 1, MAX_LIMIT),
    offset: intParam(query.offset, 0, 0, MAX_OFFSET)
  };
}

// One page of events, newest first, plus the total number matching the filters.
// owner = organiser id (compared as text so a malformed id simply matches nothing); q = search text.
// Both are bound parameters; a null owner / q switches that filter off.
async function listEvents(params) {
  const owner = params.owner;
  const pat = params.q === null ? null : likePattern(params.q);
  const rows = await sql`
    SELECT t.id,
      t.data->'eventCreation'->>'tournamentName' AS tournament_name,
      t.data->'eventCreation'->>'eventName' AS event_name,
      t.data->'format'->>'formatType' AS format_type,
      t.data->'eventCreation'->>'date' AS event_date,
      COALESCE(t.data->>'published' = 'true', false) AS published,
      COALESCE(t.data->>'listed' = 'true', false) AS listed,
      COALESCE(t.data->>'finalized' NOT IN ('false', '0', ''), false) AS finalized,
      t.data->'finalized'->>'at' AS finalized_at,
      t.updated_at,
      o.id AS owner_id, o.name AS owner_name, o.email AS owner_email
    FROM tournaments t JOIN organizers o ON o.id = t.created_by
    WHERE (${owner}::text IS NULL OR t.created_by::text = ${owner})
      AND (${pat}::text IS NULL
        OR t.data->'eventCreation'->>'tournamentName' ILIKE ${pat}
        OR t.data->'eventCreation'->>'eventName' ILIKE ${pat}
        OR o.name ILIKE ${pat}
        OR o.email ILIKE ${pat})
    ORDER BY t.updated_at DESC, t.id
    LIMIT ${params.limit} OFFSET ${params.offset}
  `;
  const counted = await sql`
    SELECT count(*)::int AS n
    FROM tournaments t JOIN organizers o ON o.id = t.created_by
    WHERE (${owner}::text IS NULL OR t.created_by::text = ${owner})
      AND (${pat}::text IS NULL
        OR t.data->'eventCreation'->>'tournamentName' ILIKE ${pat}
        OR t.data->'eventCreation'->>'eventName' ILIKE ${pat}
        OR o.name ILIKE ${pat}
        OR o.email ILIKE ${pat})
  `;
  return { events: rows.map(toEventSummary), total: Number(counted[0] && counted[0].n) || 0 };
}

// One event's summary, or null when there is no event with that id.
async function getEventSummary(id) {
  const rows = await sql`
    SELECT t.id,
      t.data->'eventCreation'->>'tournamentName' AS tournament_name,
      t.data->'eventCreation'->>'eventName' AS event_name,
      t.data->'format'->>'formatType' AS format_type,
      t.data->'eventCreation'->>'date' AS event_date,
      COALESCE(t.data->>'published' = 'true', false) AS published,
      COALESCE(t.data->>'listed' = 'true', false) AS listed,
      COALESCE(t.data->>'finalized' NOT IN ('false', '0', ''), false) AS finalized,
      t.data->'finalized'->>'at' AS finalized_at,
      t.updated_at,
      o.id AS owner_id, o.name AS owner_name, o.email AS owner_email
    FROM tournaments t JOIN organizers o ON o.id = t.created_by
    WHERE t.id = ${id}
  `;
  return rows.length ? toEventSummary(rows[0]) : null;
}

module.exports = { toEventSummary, likePattern, parseListQuery, listEvents, getEventSummary };

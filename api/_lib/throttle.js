const { sql } = require('./db');

// Rate limiting backed by the auth_throttle table (serverless memory cannot
// be shared between requests). A key's counter lives for one window; once the
// window has passed the next record() starts a fresh one.

function clientIp(req) {
  const fwd = req && req.headers && req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) return fwd.split(',')[0].trim();
  const remote = req && req.socket && req.socket.remoteAddress;
  return remote || 'unknown';
}

// True once `limit` or more events have been recorded for `key` within the last `windowMs`.
async function isBlocked(key, limit, windowMs) {
  const rows = await sql`
    SELECT count FROM auth_throttle
    WHERE key = ${key} AND window_start > now() - (${windowMs}::double precision * interval '1 millisecond')
  `;
  return rows.length > 0 && Number(rows[0].count) >= limit;
}

// Counts one event for `key`; returns the count in the current window.
async function record(key, windowMs) {
  const rows = await sql`
    INSERT INTO auth_throttle (key, window_start, count) VALUES (${key}, now(), 1)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN auth_throttle.window_start <= now() - (${windowMs}::double precision * interval '1 millisecond')
                   THEN 1 ELSE auth_throttle.count + 1 END,
      window_start = CASE WHEN auth_throttle.window_start <= now() - (${windowMs}::double precision * interval '1 millisecond')
                          THEN now() ELSE auth_throttle.window_start END
    RETURNING count
  `;
  return rows.length ? Number(rows[0].count) : 1;
}

// Counts one event for `key` and says whether it went over `limit` (true =
// refuse). The count and the check are one atomic statement, so concurrent
// requests cannot all slip under the limit the way a separate read-then-write
// would allow. The event that reaches the limit is allowed; the next is not.
async function hit(key, limit, windowMs) {
  return (await record(key, windowMs)) > limit;
}

async function clear(key) {
  await sql`DELETE FROM auth_throttle WHERE key = ${key}`;
}

module.exports = { clientIp, isBlocked, record, hit, clear };

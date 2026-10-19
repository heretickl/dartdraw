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

// Cleanup runs on about 2% of record() calls. The random source is module-level so tests can replace it
// (throttle._random = () => 0.01).
const CLEANUP_CHANCE = 0.02;
// Deletes rows whose window started more than a day ago (every window is far shorter, so they can never count again).
async function cleanup() {
  await sql`DELETE FROM auth_throttle WHERE window_start < now() - interval '1 day'`;
}

// Counts one event for `key`; returns the count in the current window.
async function record(key, windowMs) {
  // Opportunistic housekeeping on about 2% of calls (one small DELETE of old rows). Awaited, so it finishes while the
  // serverless function is still running, but a failure of any kind is swallowed: record() must never fail because of it.
  try {
    if (module.exports._random() < CLEANUP_CHANCE) await cleanup();
  } catch (e) { /* ignore */ }
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

// Gives one counted event back (a sign-in that succeeded should not use up the shared address's allowance). One
// statement: never below 0, only inside the key's current window (an expired window is left for the next record() to
// restart), and nothing happens when there is no row.
async function release(key, windowMs) {
  await sql`
    UPDATE auth_throttle SET count = GREATEST(count - 1, 0)
    WHERE key = ${key} AND window_start > now() - (${windowMs}::double precision * interval '1 millisecond')
  `;
}

module.exports = { clientIp, isBlocked, record, hit, clear, release, cleanup, _random: Math.random };

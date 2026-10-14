// In-memory stand-in for api/_lib/db.js `sql`, for tests of the accounts code.
//
//   const db = createFakeDb({ organizers: [...] });
//   require.cache[require.resolve('../api/_lib/db')] = { id, filename, loaded: true, exports: { sql: db.sql } };
//
// `sql` is a tagged-template function. It recognises ONLY the statements the
// application code issues (matched by distinctive fragments of the normalised
// SQL text) and throws a clear error for anything else, so a changed query
// fails a test loudly instead of silently returning nothing. Extend it when a
// new statement is added to the code.
//
// Time is controlled: now() is a fixed instant until `db.advance(ms)` /
// `db.setNow(ms)` is called, so expiry and throttle windows are testable.
//
// Recognised statements (value order = order of ${...} in the template):
//
// organizers
//   SELECT ... FROM organizers WHERE email = ?                    (returns the full row)
//   SELECT ... FROM organizers WHERE id = ?                       (returns the full row)
//   INSERT INTO organizers (email, password_hash, name) VALUES (?, 'disabled', 'Public')
//        [ON CONFLICT (email) DO NOTHING] RETURNING ...           (the shared Public organiser)
//   INSERT INTO organizers (email, password_hash, name, role, tier, email_verified_at)
//        VALUES (?, ?, ?, ?, ?, ?::boolean-ish) RETURNING ...     (accounts.createOrganizer)
//   UPDATE organizers SET email_verified_at = now() WHERE id = ? AND email_verified_at IS NULL
//        (api/auth/verify; returns the updated ids)
//   UPDATE organizers SET password_hash = ?, email_verified_at = COALESCE(email_verified_at, now()),
//        token_version = token_version + 1 WHERE id = ? AND suspended = false RETURNING id
//        (api/auth/reset; vals: hash, id)
//   UPDATE organizers SET name = ?, password_hash = ? WHERE id = ? AND email_verified_at IS NULL RETURNING id
//        (accounts.replaceUnverifiedCredentials; register on an unverified email)
//
// (auth_tokens, further down: besides the claim/issue statements there is the non-consuming
//  SELECT organizer_id, kind FROM auth_tokens WHERE token_hash = ? AND kind = ANY(?) ... used by tokens.peekToken)
//
//   WITH acct AS (INSERT INTO organizers ... 'admin', 'pro' ... ON CONFLICT (email) DO UPDATE ...), moved AS
//        (UPDATE tournaments SET created_by = (SELECT id FROM acct) WHERE ?::boolean AND created_by = <Public id> ...)
//        SELECT admin_id, moved                                   (scripts/create-admin; vals: email, hash, name, hasName, adopt)
//
// auth_tokens
//   UPDATE auth_tokens SET used_at = now() WHERE organizer_id = ? AND kind = ? AND used_at IS NULL
//   INSERT INTO auth_tokens (organizer_id, kind, token_hash, expires_at) VALUES (?, ?, ?, now() + ms)
//   UPDATE auth_tokens SET used_at = now() WHERE token_hash = ? AND kind = ANY(?) AND used_at IS NULL
//        AND expires_at > now() RETURNING organizer_id, kind
//
// auth_throttle
//   INSERT INTO auth_throttle (key, window_start, count) VALUES (?, now(), 1) ON CONFLICT (key) DO UPDATE ... (key, windowMs, windowMs) [RETURNING count]
//   SELECT count FROM auth_throttle WHERE key = ? AND window_start > now() - windowMs
//   DELETE FROM auth_throttle WHERE key = ?
//
// tournaments
//   SELECT ... FROM tournaments WHERE id = ? AND created_by = ?
//   SELECT ... FROM tournaments WHERE id = ?

let nextId = 1;
function newId(prefix) { return prefix + '-' + (nextId++); }

function createFakeDb(seed) {
  seed = seed || {};
  const tables = {
    organizers: (seed.organizers || []).map((r) => Object.assign({}, r)),
    auth_tokens: (seed.auth_tokens || []).map((r) => Object.assign({}, r)),
    auth_throttle: (seed.auth_throttle || []).map((r) => Object.assign({}, r)),
    tournaments: (seed.tournaments || []).map((r) => Object.assign({}, r)),
  };
  let nowMs = seed.now != null ? new Date(seed.now).getTime() : Date.UTC(2026, 9, 13, 12, 0, 0);
  const calls = [];

  const api = {
    tables,
    calls,
    now: () => new Date(nowMs),
    advance: (ms) => { nowMs += ms; },
    setNow: (ms) => { nowMs = new Date(ms).getTime(); },
  };

  function organizerDefaults(row) {
    return Object.assign({
      id: newId('org'),
      role: 'organizer',
      tier: 'basic',
      suspended: false,
      email_verified_at: null,
      token_version: 0,
      created_at: api.now(),
    }, row);
  }

  api.sql = async (strings, ...vals) => {
    const text = strings.join('?').replace(/\s+/g, ' ').trim();
    calls.push({ text, vals });
    const has = (re) => re.test(text);

    // ---- organizers ----
    if (has(/^SELECT .* FROM organizers WHERE email = \?$/i)) {
      return tables.organizers.filter((r) => r.email === vals[0]).map((r) => Object.assign({}, r));
    }
    if (has(/^SELECT .* FROM organizers WHERE id = \?$/i)) {
      return tables.organizers.filter((r) => r.id === vals[0]).map((r) => Object.assign({}, r));
    }
    if (has(/^INSERT INTO organizers \(email, password_hash, name\) VALUES \(\?, 'disabled', 'Public'\)/i)) {
      if (tables.organizers.some((r) => r.email === vals[0])) {
        if (has(/ON CONFLICT \(email\) DO NOTHING/i)) return [];
        const err = new Error('duplicate key value violates unique constraint "organizers_email_key"');
        err.code = '23505';
        throw err;
      }
      const row = organizerDefaults({ email: vals[0], password_hash: 'disabled', name: 'Public' });
      tables.organizers.push(row);
      return [{ id: row.id, email: row.email, name: row.name }];
    }
    if (has(/^INSERT INTO organizers \(email, password_hash, name, role, tier, email_verified_at\) VALUES/i)) {
      if (tables.organizers.some((r) => r.email === vals[0])) {
        const err = new Error('duplicate key value violates unique constraint "organizers_email_key"');
        err.code = '23505';
        throw err;
      }
      const row = organizerDefaults({
        email: vals[0], password_hash: vals[1], name: vals[2], role: vals[3], tier: vals[4],
        email_verified_at: vals[5] ? api.now() : null,
      });
      tables.organizers.push(row);
      return [{ id: row.id, email: row.email, name: row.name, role: row.role, tier: row.tier }];
    }

    if (has(/^UPDATE organizers SET email_verified_at = now\(\) WHERE id = \? AND email_verified_at IS NULL$/i)) {
      const hit = tables.organizers.filter((r) => r.id === vals[0] && r.email_verified_at == null);
      hit.forEach((r) => { r.email_verified_at = api.now(); });
      return hit.map((r) => ({ id: r.id }));
    }
    if (has(/^UPDATE organizers SET password_hash = \?, email_verified_at = COALESCE\(email_verified_at, now\(\)\), token_version = token_version \+ 1 WHERE id = \? AND suspended = false RETURNING id$/i)) {
      const hit = tables.organizers.filter((r) => r.id === vals[1] && !r.suspended);
      hit.forEach((r) => {
        r.password_hash = vals[0];
        if (r.email_verified_at == null) r.email_verified_at = api.now();
        r.token_version = Number(r.token_version || 0) + 1;
      });
      return hit.map((r) => ({ id: r.id }));
    }

    if (has(/^UPDATE organizers SET name = \?, password_hash = \? WHERE id = \? AND email_verified_at IS NULL RETURNING id$/i)) {
      const hit = tables.organizers.filter((r) => r.id === vals[2] && r.email_verified_at == null);
      hit.forEach((r) => { r.name = vals[0]; r.password_hash = vals[1]; });
      return hit.map((r) => ({ id: r.id }));
    }

    // scripts/create-admin: upsert the admin and (optionally) adopt the Public tournaments, one statement.
    if (has(/^WITH acct AS \( INSERT INTO organizers \(email, password_hash, name, role, tier, email_verified_at\) VALUES \(\?, \?, \?, 'admin', 'pro', now\(\)\) ON CONFLICT \(email\) DO UPDATE SET password_hash = EXCLUDED\.password_hash, name = CASE WHEN \?::boolean THEN EXCLUDED\.name ELSE organizers\.name END, role = 'admin', tier = 'pro', suspended = false, email_verified_at = COALESCE\(organizers\.email_verified_at, now\(\)\), token_version = organizers\.token_version \+ 1 RETURNING id \), moved AS \( UPDATE tournaments SET created_by = \(SELECT id FROM acct\) WHERE \?::boolean AND created_by = \(SELECT id FROM organizers WHERE email = 'public@dartdraw\.local'\) RETURNING id \) SELECT \(SELECT id FROM acct\) AS admin_id, \(SELECT count\(\*\) FROM moved\)::int AS moved$/i)) {
      const email = vals[0];
      let acct = tables.organizers.find((r) => r.email === email);
      if (acct) {
        acct.password_hash = vals[1];
        if (vals[3]) acct.name = vals[2];
        acct.role = 'admin';
        acct.tier = 'pro';
        acct.suspended = false;
        if (acct.email_verified_at == null) acct.email_verified_at = api.now();
        acct.token_version = Number(acct.token_version || 0) + 1;
      } else {
        acct = organizerDefaults({
          email, password_hash: vals[1], name: vals[2], role: 'admin', tier: 'pro', email_verified_at: api.now(),
        });
        tables.organizers.push(acct);
      }
      // Evaluated against the state before the statement, like Postgres (the Public row is never the admin here).
      const pub = tables.organizers.find((r) => r.email === 'public@dartdraw.local');
      let moved = 0;
      if (vals[4] && pub) {
        tables.tournaments.forEach((t) => {
          if (t.created_by === pub.id) { t.created_by = acct.id; moved += 1; }
        });
      }
      return [{ admin_id: acct.id, moved }];
    }

    // ---- auth_tokens ----
    if (has(/^SELECT organizer_id, kind FROM auth_tokens WHERE token_hash = \? AND kind = ANY\(.*\) AND used_at IS NULL AND expires_at > now\(\)$/i)) {
      const kinds = Array.isArray(vals[1]) ? vals[1] : [vals[1]];
      return tables.auth_tokens
        .filter((t) => t.token_hash === vals[0] && kinds.includes(t.kind) && t.used_at == null && t.expires_at.getTime() > nowMs)
        .map((t) => ({ organizer_id: t.organizer_id, kind: t.kind }));
    }
    if (has(/^UPDATE auth_tokens SET used_at = now\(\) WHERE organizer_id = \? AND kind = \? AND used_at IS NULL/i)) {
      const hit = tables.auth_tokens.filter((t) => t.organizer_id === vals[0] && t.kind === vals[1] && t.used_at == null);
      hit.forEach((t) => { t.used_at = api.now(); });
      return hit.map((t) => ({ id: t.id }));
    }
    if (has(/^INSERT INTO auth_tokens \(organizer_id, kind, token_hash, expires_at\) VALUES/i)) {
      if (tables.auth_tokens.some((t) => t.token_hash === vals[2])) {
        const err = new Error('duplicate key value violates unique constraint "auth_tokens_token_hash_key"');
        err.code = '23505';
        throw err;
      }
      const row = {
        id: newId('tok'), organizer_id: vals[0], kind: vals[1], token_hash: vals[2],
        expires_at: new Date(nowMs + Number(vals[3])), used_at: null, created_at: api.now(),
      };
      tables.auth_tokens.push(row);
      return [{ id: row.id }];
    }
    if (has(/^UPDATE auth_tokens SET used_at = now\(\) WHERE token_hash = \? AND kind = ANY\(.*\) AND used_at IS NULL AND expires_at > now\(\) RETURNING/i)) {
      const kinds = Array.isArray(vals[1]) ? vals[1] : [vals[1]];
      const row = tables.auth_tokens.find((t) => t.token_hash === vals[0] && kinds.includes(t.kind)
        && t.used_at == null && t.expires_at.getTime() > nowMs);
      if (!row) return [];
      row.used_at = api.now();
      return [{ organizer_id: row.organizer_id, kind: row.kind }];
    }

    // ---- auth_throttle ----
    if (has(/^INSERT INTO auth_throttle \(key, window_start, count\) VALUES \(\?, now\(\), 1\) ON CONFLICT \(key\) DO UPDATE/i)) {
      const windowMs = Number(vals[1]);
      let row = tables.auth_throttle.find((r) => r.key === vals[0]);
      if (!row) {
        row = { key: vals[0], window_start: api.now(), count: 1 };
        tables.auth_throttle.push(row);
      } else if (row.window_start.getTime() <= nowMs - windowMs) {
        row.window_start = api.now();
        row.count = 1;
      } else {
        row.count += 1;
      }
      return has(/RETURNING count$/i) ? [{ count: row.count }] : [];
    }
    if (has(/^SELECT count FROM auth_throttle WHERE key = \? AND window_start > now\(\) - /i)) {
      const windowMs = Number(vals[1]);
      return tables.auth_throttle
        .filter((r) => r.key === vals[0] && r.window_start.getTime() > nowMs - windowMs)
        .map((r) => ({ count: r.count }));
    }
    if (has(/^DELETE FROM auth_throttle WHERE key = \?$/i)) {
      tables.auth_throttle = tables.auth_throttle.filter((r) => r.key !== vals[0]);
      return [];
    }

    // ---- tournaments ----
    if (has(/^SELECT .* FROM tournaments WHERE id = \? AND created_by = \?$/i)) {
      return tables.tournaments.filter((r) => r.id === vals[0] && r.created_by === vals[1]).map((r) => Object.assign({}, r));
    }
    if (has(/^SELECT .* FROM tournaments WHERE id = \?$/i)) {
      return tables.tournaments.filter((r) => r.id === vals[0]).map((r) => Object.assign({}, r));
    }

    throw new Error('fake-db: unrecognised SQL statement: ' + text);
  };

  return api;
}

module.exports = { createFakeDb };

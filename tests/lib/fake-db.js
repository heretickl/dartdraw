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
//        (api/_routes/auth/verify; returns the updated ids)
//   UPDATE organizers SET password_hash = ?, email_verified_at = COALESCE(email_verified_at, now()),
//        token_version = token_version + 1 WHERE id = ? AND suspended = false RETURNING id
//        (api/_routes/auth/reset; vals: hash, id)
//   UPDATE organizers SET password_hash = ?, token_version = token_version + 1 WHERE id = ? AND password_hash = ? RETURNING token_version
//        (api/_routes/auth/change-password; vals: new hash, id, old hash; returns the new token_version)
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
//   UPDATE auth_throttle SET count = GREATEST(count - 1, 0) WHERE key = ? AND window_start > now() - windowMs   (vals: key, windowMs; release)
//   DELETE FROM auth_throttle WHERE window_start < now() - interval '1 day'   (cleanup)
//
// tournaments
//   SELECT ... FROM tournaments WHERE id = ? AND created_by = ?
//   SELECT ... FROM tournaments WHERE id = ?
//   INSERT INTO tournaments (id, data, created_by) VALUES (?, ?::jsonb, ?) RETURNING id, updated_at   (vals: id, json, owner)
//   UPDATE tournaments SET data = ?::jsonb, updated_at = now() WHERE id = ? [AND created_by = ?]
//        AND abs(extract(epoch FROM updated_at) - extract(epoch FROM ?::timestamptz)) < 0.001 RETURNING id, updated_at
//        (vals: json, id, [owner,] stamp; created_by is never changed)
//   DELETE FROM tournaments WHERE id = ? [AND created_by = ?] AND (data->>'finalized' IS NULL OR data->>'finalized' IN ('false', '0', '')) RETURNING id
//
// admin organisers API (api/_lib/adminOrganizers.js and api/_routes/admin/organizers/*)
//   SELECT o.id, ..., (SELECT count(*)::int FROM tournaments t WHERE t.created_by = o.id) AS event_count
//        FROM organizers o WHERE o.email <> 'public@dartdraw.local' ORDER BY o.created_at DESC, o.id
//        (list; the By-id form has AND o.id = ? and no ORDER BY)
//   SELECT count(*)::int AS n FROM organizers WHERE role = 'admin' AND suspended = false AND email_verified_at IS NOT NULL AND password_hash <> 'disabled'
//   WITH admins AS MATERIALIZED (<active admin rows> FOR UPDATE) UPDATE organizers SET tier = COALESCE(?::text, tier), role = COALESCE(?::text, role),
//        suspended = COALESCE(?::boolean, suspended), token_version = token_version + ?::int WHERE id = ?
//        AND (NOT ?::boolean OR NOT <target is an active admin> OR (SELECT count(*) FROM admins) > 1) RETURNING id
//        (vals: tier, role, suspended, bump, id, removesAdmin; the guard is evaluated against the table as it is when the statement runs)
//        (vals: tier|null, role|null, suspended|null, bump, id)
//   WITH admins AS MATERIALIZED (<active admin rows> FOR UPDATE) DELETE FROM organizers WHERE id = ?
//        AND (NOT <target is an active admin> OR (SELECT count(*) FROM admins) > 1) RETURNING id   (refused with 23503 while tournaments reference it; cascades auth_tokens)
//   UPDATE tournaments SET created_by = ? WHERE created_by = ? RETURNING id   (vals: target, source; updated_at untouched)
//
// admin events API (api/_lib/adminEvents.js and api/_routes/admin/events/*); the summary SELECT list is the one in adminEvents.js
//   <summary select> FROM tournaments t JOIN organizers o ON o.id = t.created_by <owner/q filter> ORDER BY t.updated_at DESC, t.id LIMIT ? OFFSET ?
//        (vals: owner, owner, pat x5, limit, offset; pat is an ILIKE pattern with backslash escapes, null = no search)
//   SELECT count(*)::int AS n FROM tournaments t JOIN organizers o ON o.id = t.created_by <owner/q filter>   (vals: owner, owner, pat x5)
//   <summary select> ... WHERE t.id = ?
//   UPDATE tournaments SET data = data - 'finalized', updated_at = now() WHERE id = ? AND <finalized is truthy> RETURNING id   (reopen)
//   UPDATE tournaments SET data = data || '{"published": false, "listed": false}'::jsonb, updated_at = now() WHERE id = ? RETURNING id
//   UPDATE tournaments SET data = data || '{"listed": false}'::jsonb, updated_at = now() WHERE id = ? RETURNING id
//   UPDATE tournaments SET created_by = ? WHERE id = ? RETURNING id   (vals: target, id; data and updated_at untouched)
//   DELETE FROM tournaments WHERE id = ? RETURNING id
//
// site_settings (api/_lib/settings.js, api/_routes/admin/settings.js); db.dropTable('site_settings') makes every statement on it fail with 42P01
//   SELECT key, value FROM site_settings WHERE key IN ('resultsDays', 'liveHours')
//   INSERT INTO site_settings (key, value, updated_at) VALUES ('resultsDays', ?::jsonb, now()), ('liveHours', ?::jsonb, now())
//        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()   (vals: json, json)
//   the same INSERT with a third row ('adminContact', ?::jsonb, now())                  (vals: json, json, json)
//   SELECT value FROM site_settings WHERE key = 'adminContact'

let nextId = 1;
function newId(prefix) { return prefix + '-' + (nextId++); }

function createFakeDb(seed) {
  seed = seed || {};
  const tables = {
    organizers: (seed.organizers || []).map((r) => Object.assign({}, r)),
    auth_tokens: (seed.auth_tokens || []).map((r) => Object.assign({}, r)),
    auth_throttle: (seed.auth_throttle || []).map((r) => Object.assign({}, r)),
    tournaments: (seed.tournaments || []).map((r) => Object.assign({}, r)),
    site_settings: (seed.site_settings || []).map((r) => Object.assign({}, r)),
  };
  const dropped = new Set();
  let nowMs = seed.now != null ? new Date(seed.now).getTime() : Date.UTC(2026, 9, 13, 12, 0, 0);
  const calls = [];

  const api = {
    tables,
    calls,
    now: () => new Date(nowMs),
    advance: (ms) => { nowMs += ms; },
    setNow: (ms) => { nowMs = new Date(ms).getTime(); },
    // Simulates a table that has not been created yet (a migration not run): every statement on it fails like Postgres.
    dropTable: (name) => { dropped.add(name); },
  };

  // data->>'finalized' as Postgres gives it: NULL when absent or JSON null, else the text form of the value.
  const finalizedText = (d) => {
    const v = d && d.finalized;
    if (v == null) return null;
    return typeof v === 'object' ? JSON.stringify(v) : String(v);
  };
  const isFinalizedRow = (d) => {
    const t = finalizedText(d);
    return t !== null && !['false', '0', ''].includes(t);
  };
  // Postgres LIKE pattern (backslash escapes, % and _) as a case-insensitive RegExp.
  const likeToRegex = (pat) => {
    let re = '';
    for (let i = 0; i < pat.length; i++) {
      const c = pat[i];
      if (c === '\\' && i + 1 < pat.length) { re += pat[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
      else if (c === '%') re += '[\\s\\S]*';
      else if (c === '_') re += '[\\s\\S]';
      else re += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    return new RegExp('^' + re + '$', 'i');
  };
  const eventSummaryRow = (t) => {
    const d = t.data || {};
    const ec = d.eventCreation && typeof d.eventCreation === 'object' ? d.eventCreation : {};
    const fm = d.format && typeof d.format === 'object' ? d.format : {};
    const fin = d.finalized && typeof d.finalized === 'object' && !Array.isArray(d.finalized) ? d.finalized : {};
    const o = tables.organizers.find((x) => x.id === t.created_by);
    const txt = (v) => (v == null ? null : typeof v === 'object' ? JSON.stringify(v) : String(v));
    return {
      id: t.id,
      tournament_name: txt(ec.tournamentName), event_name: txt(ec.eventName),
      format_type: txt(fm.formatType), event_date: txt(ec.date),
      published: finalizedText({ finalized: d.published }) === 'true',
      listed: finalizedText({ finalized: d.listed }) === 'true',
      finalized: isFinalizedRow(d),
      finalized_at: txt(fin.at),
      updated_at: t.updated_at,
      owner_id: o.id, owner_name: o.name, owner_email: o.email,
    };
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

    if (has(/^UPDATE organizers SET password_hash = \?, token_version = token_version \+ 1 WHERE id = \? AND password_hash = \? RETURNING token_version$/i)) {
      const hit = tables.organizers.filter((r) => r.id === vals[1] && r.password_hash === vals[2]);
      hit.forEach((r) => {
        r.password_hash = vals[0];
        r.token_version = Number(r.token_version || 0) + 1;
      });
      return hit.map((r) => ({ token_version: r.token_version }));
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
    if (has(/^UPDATE auth_throttle SET count = GREATEST\(count - 1, 0\) WHERE key = \? AND window_start > now\(\) - /i)) {
      const windowMs = Number(vals[1]);
      tables.auth_throttle
        .filter((r) => r.key === vals[0] && r.window_start.getTime() > nowMs - windowMs)
        .forEach((r) => { r.count = Math.max(r.count - 1, 0); });
      return [];
    }
    if (has(/^DELETE FROM auth_throttle WHERE window_start < now\(\) - interval '1 day'$/i)) {
      tables.auth_throttle = tables.auth_throttle.filter((r) => r.window_start.getTime() >= nowMs - 24 * 60 * 60 * 1000);
      return [];
    }

    // ---- tournaments ----
    if (has(/^SELECT .* FROM tournaments WHERE id = \? AND created_by = \?$/i)) {
      return tables.tournaments.filter((r) => r.id === vals[0] && r.created_by === vals[1]).map((r) => Object.assign({}, r));
    }
    if (has(/^SELECT .* FROM tournaments WHERE id = \?$/i)) {
      return tables.tournaments.filter((r) => r.id === vals[0]).map((r) => Object.assign({}, r));
    }

    // api/tournaments/[id].js writes. Each exists in an owner-scoped and an Admin (unscoped) form.
    const sameStamp = (row, iso) => new Date(row.updated_at).getTime() === new Date(iso).getTime();
    if (has(/^INSERT INTO tournaments \(id, data, created_by\) VALUES \(\?, \?::jsonb, \?\) RETURNING id, updated_at$/i)) {
      if (tables.tournaments.some((r) => r.id === vals[0])) {
        const err = new Error('duplicate key value violates unique constraint "tournaments_pkey"');
        err.code = '23505';
        throw err;
      }
      const row = { id: vals[0], data: JSON.parse(vals[1]), created_by: vals[2], updated_at: api.now() };
      tables.tournaments.push(row);
      return [{ id: row.id, updated_at: row.updated_at }];
    }
    {
      const owned = has(/^UPDATE tournaments SET data = \?::jsonb, updated_at = now\(\) WHERE id = \? AND created_by = \? AND abs\(extract\(epoch FROM updated_at\) - extract\(epoch FROM \?::timestamptz\)\) < 0\.001 RETURNING id, updated_at$/i);
      const any = !owned && has(/^UPDATE tournaments SET data = \?::jsonb, updated_at = now\(\) WHERE id = \? AND abs\(extract\(epoch FROM updated_at\) - extract\(epoch FROM \?::timestamptz\)\) < 0\.001 RETURNING id, updated_at$/i);
      if (owned || any) {
        const owner = owned ? vals[2] : null;
        const iso = owned ? vals[3] : vals[2];
        const hit = tables.tournaments.filter((r) => r.id === vals[1] && (!owned || r.created_by === owner) && sameStamp(r, iso));
        hit.forEach((r) => { r.data = JSON.parse(vals[0]); r.updated_at = api.now(); });   // created_by is never touched
        return hit.map((r) => ({ id: r.id, updated_at: r.updated_at }));
      }
    }
    {
      const ownedDel = has(/^DELETE FROM tournaments WHERE id = \? AND created_by = \? AND \(data->>'finalized' IS NULL OR data->>'finalized' IN \('false', '0', ''\)\) RETURNING id$/i);
      const anyDel = !ownedDel && has(/^DELETE FROM tournaments WHERE id = \? AND \(data->>'finalized' IS NULL OR data->>'finalized' IN \('false', '0', ''\)\) RETURNING id$/i);
      if (ownedDel || anyDel) {
        // data->>'finalized': NULL when absent/JSON null, else the text form of the value.
        const notFinalized = (d) => {
          const v = d && d.finalized;
          if (v == null) return true;
          const t = typeof v === 'object' ? JSON.stringify(v) : String(v);
          return ['false', '0', ''].includes(t);
        };
        const hit = tables.tournaments.filter((r) => r.id === vals[0] && (!ownedDel || r.created_by === vals[1]) && notFinalized(r.data));
        tables.tournaments = tables.tournaments.filter((r) => !hit.includes(r));
        return hit.map((r) => ({ id: r.id }));
      }
    }

    // ---- admin organisers API ----
    {
      const summaryRe = /^SELECT o\.id, o\.email, o\.name, o\.role, o\.tier, o\.suspended, o\.email_verified_at, o\.created_at, \(SELECT count\(\*\)::int FROM tournaments t WHERE t\.created_by = o\.id\) AS event_count FROM organizers o WHERE o\.email <> 'public@dartdraw\.local'/i;
      if (summaryRe.test(text)) {
        const list = has(/ ORDER BY o\.created_at DESC, o\.id$/i);
        const byId = !list && has(/ AND o\.id = \?$/i);
        if (list || byId) {
          let rows = tables.organizers.filter((r) => r.email !== 'public@dartdraw.local' && (!byId || r.id === vals[0]));
          rows = rows.map((r) => ({
            id: r.id, email: r.email, name: r.name, role: r.role, tier: r.tier, suspended: r.suspended,
            email_verified_at: r.email_verified_at, created_at: r.created_at,
            event_count: tables.tournaments.filter((t) => t.created_by === r.id).length,
          }));
          if (list) {
            rows.sort((a, b) => (new Date(b.created_at) - new Date(a.created_at)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
          }
          return rows;
        }
      }
    }
    const activeAdmin = (r) => r.role === 'admin' && !r.suspended && r.email_verified_at != null && r.password_hash !== 'disabled';
    const ACTIVE_ADMIN_SQL = "role = 'admin' AND suspended = false AND email_verified_at IS NOT NULL AND password_hash <> 'disabled'";
    const LOCK_ADMINS_SQL = 'WITH admins AS MATERIALIZED ( SELECT id FROM organizers WHERE ' + ACTIVE_ADMIN_SQL + ' ORDER BY id FOR UPDATE ) ';
    if (text === 'SELECT count(*)::int AS n FROM organizers WHERE ' + ACTIVE_ADMIN_SQL) {
      return [{ n: tables.organizers.filter(activeAdmin).length }];
    }
    if (text === LOCK_ADMINS_SQL + 'UPDATE organizers SET tier = COALESCE(?::text, tier), role = COALESCE(?::text, role), suspended = COALESCE(?::boolean, suspended), token_version = token_version + ?::int WHERE id = ? AND (NOT ?::boolean OR NOT (' + ACTIVE_ADMIN_SQL + ') OR (SELECT count(*) FROM admins) > 1) RETURNING id') {
      // The guard is evaluated against the table as it is when the statement runs, like the locked CTE would see it.
      const activeNow = tables.organizers.filter(activeAdmin).length;
      const hit = tables.organizers.filter((r) => r.id === vals[4] && (!vals[5] || !activeAdmin(r) || activeNow > 1));
      hit.forEach((r) => {
        if (vals[0] != null) r.tier = vals[0];
        if (vals[1] != null) r.role = vals[1];
        if (vals[2] != null) r.suspended = vals[2];
        r.token_version = Number(r.token_version || 0) + Number(vals[3]);
      });
      return hit.map((r) => ({ id: r.id }));
    }
    if (text === LOCK_ADMINS_SQL + 'DELETE FROM organizers WHERE id = ? AND (NOT (' + ACTIVE_ADMIN_SQL + ') OR (SELECT count(*) FROM admins) > 1) RETURNING id') {
      const activeNow = tables.organizers.filter(activeAdmin).length;
      if (!tables.organizers.some((r) => r.id === vals[0] && (!activeAdmin(r) || activeNow > 1))) return [];
      if (tables.tournaments.some((t) => t.created_by === vals[0])) {
        const err = new Error('update or delete on table "organizers" violates foreign key constraint "tournaments_created_by_fkey" on table "tournaments"');
        err.code = '23503';
        throw err;
      }
      const hit = tables.organizers.filter((r) => r.id === vals[0]);
      tables.organizers = tables.organizers.filter((r) => !hit.includes(r));
      tables.auth_tokens = tables.auth_tokens.filter((t) => t.organizer_id !== vals[0]);   // ON DELETE CASCADE
      return hit.map((r) => ({ id: r.id }));
    }
    if (has(/^UPDATE tournaments SET created_by = \? WHERE created_by = \? RETURNING id$/i)) {
      const hit = tables.tournaments.filter((r) => r.created_by === vals[1]);
      hit.forEach((r) => { r.created_by = vals[0]; });   // data, updated_at and everything else untouched
      return hit.map((r) => ({ id: r.id }));
    }

    // ---- admin events API ----
    {
      const SELECT_LIST = "SELECT t.id, t.data->'eventCreation'->>'tournamentName' AS tournament_name, t.data->'eventCreation'->>'eventName' AS event_name, "
        + "t.data->'format'->>'formatType' AS format_type, t.data->'eventCreation'->>'date' AS event_date, "
        + "COALESCE(t.data->>'published' = 'true', false) AS published, COALESCE(t.data->>'listed' = 'true', false) AS listed, "
        + "COALESCE(t.data->>'finalized' NOT IN ('false', '0', ''), false) AS finalized, t.data->'finalized'->>'at' AS finalized_at, "
        + "t.updated_at, o.id AS owner_id, o.name AS owner_name, o.email AS owner_email "
        + "FROM tournaments t JOIN organizers o ON o.id = t.created_by";
      const FILTER = "WHERE (?::text IS NULL OR t.created_by::text = ?) AND (?::text IS NULL "
        + "OR t.data->'eventCreation'->>'tournamentName' ILIKE ? OR t.data->'eventCreation'->>'eventName' ILIKE ? "
        + "OR o.name ILIKE ? OR o.email ILIKE ?)";
      const matching = () => {
        // vals[0] = vals[1] = owner id (or null); vals[2..6] = the search pattern (or null)
        const owner = vals[0];
        const re = vals[2] == null ? null : likeToRegex(String(vals[2]));
        return tables.tournaments.filter((t) => {
          const o = tables.organizers.find((x) => x.id === t.created_by);
          if (!o) return false;   // INNER JOIN
          if (owner != null && String(t.created_by) !== String(owner)) return false;
          if (!re) return true;
          const ec = (t.data && t.data.eventCreation) || {};
          return [ec.tournamentName, ec.eventName, o.name, o.email].some((v) => v != null && re.test(String(v)));
        });
      };
      if (text === SELECT_LIST + ' ' + FILTER + ' ORDER BY t.updated_at DESC, t.id LIMIT ? OFFSET ?') {
        const limit = Number(vals[7]); const offset = Number(vals[8]);
        const rows = matching().slice().sort((a, b) =>
          (new Date(b.updated_at) - new Date(a.updated_at)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
        return rows.slice(offset, offset + limit).map(eventSummaryRow);
      }
      if (text === 'SELECT count(*)::int AS n FROM tournaments t JOIN organizers o ON o.id = t.created_by ' + FILTER) {
        return [{ n: matching().length }];
      }
      if (text === SELECT_LIST + ' WHERE t.id = ?') {
        return tables.tournaments.filter((t) => t.id === vals[0] && tables.organizers.some((x) => x.id === t.created_by)).map(eventSummaryRow);
      }
    }
    if (has(/^UPDATE tournaments SET data = data - 'finalized', updated_at = now\(\) WHERE id = \? AND data->>'finalized' IS NOT NULL AND data->>'finalized' NOT IN \('false', '0', ''\) RETURNING id$/i)) {
      const hit = tables.tournaments.filter((r) => r.id === vals[0] && isFinalizedRow(r.data));
      hit.forEach((r) => { const d = Object.assign({}, r.data); delete d.finalized; r.data = d; r.updated_at = api.now(); });
      return hit.map((r) => ({ id: r.id }));
    }
    if (text === `UPDATE tournaments SET data = data || '{"published": false, "listed": false}'::jsonb, updated_at = now() WHERE id = ? RETURNING id`) {
      const hit = tables.tournaments.filter((r) => r.id === vals[0]);
      hit.forEach((r) => { r.data = Object.assign({}, r.data, { published: false, listed: false }); r.updated_at = api.now(); });
      return hit.map((r) => ({ id: r.id }));
    }
    if (text === `UPDATE tournaments SET data = data || '{"listed": false}'::jsonb, updated_at = now() WHERE id = ? RETURNING id`) {
      const hit = tables.tournaments.filter((r) => r.id === vals[0]);
      hit.forEach((r) => { r.data = Object.assign({}, r.data, { listed: false }); r.updated_at = api.now(); });
      return hit.map((r) => ({ id: r.id }));
    }
    if (has(/^UPDATE tournaments SET created_by = \? WHERE id = \? RETURNING id$/i)) {
      if (!tables.organizers.some((o) => o.id === vals[0])) {
        const err = new Error('insert or update on table "tournaments" violates foreign key constraint "tournaments_created_by_fkey"');
        err.code = '23503';
        throw err;
      }
      const hit = tables.tournaments.filter((r) => r.id === vals[1]);
      hit.forEach((r) => { r.created_by = vals[0]; });   // data and updated_at untouched
      return hit.map((r) => ({ id: r.id }));
    }
    if (has(/^DELETE FROM tournaments WHERE id = \? RETURNING id$/i)) {
      const hit = tables.tournaments.filter((r) => r.id === vals[0]);
      tables.tournaments = tables.tournaments.filter((r) => !hit.includes(r));
      return hit.map((r) => ({ id: r.id }));
    }

    // ---- site_settings ----
    if (/\bsite_settings\b/i.test(text) && dropped.has('site_settings')) {
      const err = new Error('relation "site_settings" does not exist');
      err.code = '42P01';
      throw err;
    }
    if (has(/^SELECT key, value FROM site_settings WHERE key IN \('resultsDays', 'liveHours'\)$/i)) {
      return tables.site_settings.filter((r) => r.key === 'resultsDays' || r.key === 'liveHours').map((r) => Object.assign({}, r));
    }
    if (has(/^SELECT value FROM site_settings WHERE key = 'adminContact'$/i)) {
      return tables.site_settings.filter((r) => r.key === 'adminContact').map((r) => ({ value: r.value }));
    }
    const withContact = has(/^INSERT INTO site_settings \(key, value, updated_at\) VALUES \('resultsDays', \?::jsonb, now\(\)\), \('liveHours', \?::jsonb, now\(\)\), \('adminContact', \?::jsonb, now\(\)\) ON CONFLICT \(key\) DO UPDATE SET value = EXCLUDED\.value, updated_at = now\(\)$/i);
    if (withContact || has(/^INSERT INTO site_settings \(key, value, updated_at\) VALUES \('resultsDays', \?::jsonb, now\(\)\), \('liveHours', \?::jsonb, now\(\)\) ON CONFLICT \(key\) DO UPDATE SET value = EXCLUDED\.value, updated_at = now\(\)$/i)) {
      const pairs = [['resultsDays', vals[0]], ['liveHours', vals[1]]];
      if (withContact) pairs.push(['adminContact', vals[2]]);
      pairs.forEach(([key, json]) => {
        const value = JSON.parse(json);
        const existing = tables.site_settings.find((r) => r.key === key);
        if (existing) { existing.value = value; existing.updated_at = api.now(); }
        else tables.site_settings.push({ key, value, updated_at: api.now() });
      });
      return [];
    }

    throw new Error('fake-db: unrecognised SQL statement: ' + text);
  };

  return api;
}

module.exports = { createFakeDb };

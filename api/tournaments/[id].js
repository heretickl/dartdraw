const { sql } = require('../_lib/db');
const { requireAuth } = require('../_lib/auth');
const { checkEntryLimit } = require('../_lib/tiers');
const { sanitizeTournamentData, isRouteId } = require('../../tournament-sanitize');
const { engine } = require('../_lib/engine');

// GET /api/tournaments/:id     -> { id, data, updated_at }
// PUT /api/tournaments/:id     -> body { data, expectedUpdatedAt }, upserts.
//   Creates the row if it doesn't exist yet, but only for a save with no
//   expectedUpdatedAt (a new event's first save). A save that carries a stamp
//   for a row that does not exist (deleted elsewhere, or moved to another
//   organiser) is answered 404 { code: 'not_found', error: 'Not found.' } and never re-creates it. If it exists, expectedUpdatedAt must match the stored
//   updated_at or the write is rejected with 409 + the current row, so a
//   stale client never silently clobbers a newer save.
//   The success body (200 or 201) is { id, updated_at }, plus `finalized` only when the saved data has one. A save carrying a
//   truthy `finalized` for a row that is not finalized yet has it replaced by { at: <server clock, ISO> }: the browser's time
//   is never trusted for it and no other key survives.
//   A finalized event (stored data.finalized is truthy) is closed: PUT is
//   refused with 403 { error, finalized: true }, whatever the incoming data
//   says. The PUT that first sets `finalized` is on a row that does not have
//   it yet, so it is saved normally. The UPDATE itself is conditional on the
//   stamp that was checked, so a save/finalize landing in between is answered
//   with 409 (or 403 if the row became finalized) instead of being overwritten.
//   After that check, a Basic organiser (see api/_lib/tiers.js) is refused with 403
//   { code: 'entry_limit', limit, error } when the save would hold more active entries
//   than the limit AND more than the stored copy does (insert included). This is the only
//   place tournament rows are created or changed (api/tournaments/index.js is read-only).
// DELETE /api/tournaments/:id
//   Also refused with 403 { error, finalized: true } for a finalized event.
//   Only an Admin can change or remove one, and only after the Admin tab's Reopen. The
//   DELETE statement itself skips finalized rows, so it cannot race a finalize.
// An Admin caller (organizer.role === 'admin') is not scoped to created_by on GET, PUT and DELETE; an update never changes
//   created_by, and a PUT for an unknown id inserts a row owned by the Admin. Every other rule above applies to Admins too.
// Floor officials (docs/superpowers/specs/2026-10-30-floor-officials-design.md) save single results into the stored
//   copy meanwhile, so a stale stamp no longer always means a conflict. data.settingsRev counts changes to anything but
//   results (the server bumps it). A PUT whose stamp is old but whose settingsRev is the stored one, and which lists the
//   result slots it changed (body.dirty, positions from results-engine.js), is MERGED match by match: the organiser's
//   changed results win, every other result keeps what is stored (results-engine.js mergeResults). Without body.dirty
//   (an older copy of the app) or with another settingsRev it is a 409 as before. Every result that differs from the
//   stored one is stamped as the organiser's (by 'o', at, rv). The success body also carries settingsRev, and data
//   when the stored copy is not exactly what was sent (merged).
const FINALIZED_BODY = { code: 'finalized', error: 'This event is finalized. Only an Admin can change it.', finalized: true };

function isFinalized(data) {
  return !!(data && typeof data === 'object' && data.finalized);
}

module.exports = async (req, res) => {
  const organizer = await requireAuth(req, res);
  if (!organizer) return;

  const { id } = req.query;
  if (!id) { res.status(400).json({ code: 'missing_id', error: 'Missing id.' }); return; }

  // An Admin works on any organiser's event: the same statements without the owner filter, and an update never changes the owner.
  const isAdmin = organizer.role === 'admin';

  if (req.method === 'GET') {
    let rows;
    try {
      rows = isAdmin
      ? await sql`SELECT id, data, updated_at FROM tournaments WHERE id = ${id}`
      : await sql`
        SELECT id, data, updated_at FROM tournaments
        WHERE id = ${id} AND created_by = ${organizer.id}
      `;
    } catch (e) {
      console.error('GET /api/tournaments/' + id + ' failed: ' + (e && e.code ? '[' + e.code + '] ' : '') + (e && e.message ? e.message : e));
      res.status(500).json({ code: 'load_failed', error: 'Could not load tournament.' });
      return;
    }
    if (!rows.length) { res.status(404).json({ code: 'not_found', error: 'Not found.' }); return; }
    res.status(200).json(rows[0]);
    return;
  }

  if (req.method === 'DELETE') {
    const found = isAdmin
      ? await sql`SELECT data FROM tournaments WHERE id = ${id}`
      : await sql`SELECT data FROM tournaments WHERE id = ${id} AND created_by = ${organizer.id}`;
    if (found.length && isFinalized(found[0].data)) {
      res.status(403).json(FINALIZED_BODY);
      return;
    }
    // The SQL refuses finalized rows itself, so a finalize landing between the SELECT above and this DELETE still wins.
    // (data->>'finalized' is NULL when absent or JSON null; 'false', '0' and '' are the falsy stored values.)
    const deleted = isAdmin
      ? await sql`
        DELETE FROM tournaments
        WHERE id = ${id}
          AND (data->>'finalized' IS NULL OR data->>'finalized' IN ('false', '0', ''))
        RETURNING id
      `
      : await sql`
        DELETE FROM tournaments
        WHERE id = ${id} AND created_by = ${organizer.id}
          AND (data->>'finalized' IS NULL OR data->>'finalized' IN ('false', '0', ''))
        RETURNING id
      `;
    if (!deleted.length) {
      const again = isAdmin
        ? await sql`SELECT data FROM tournaments WHERE id = ${id}`
        : await sql`SELECT data FROM tournaments WHERE id = ${id} AND created_by = ${organizer.id}`;
      if (again.length && isFinalized(again[0].data)) {
        res.status(403).json(FINALIZED_BODY);
        return;
      }
    }
    res.status(204).end();
    return;
  }

  if (req.method === 'PUT') {
    // The id becomes a primary key and is later put into onclick handlers: plain letters, digits, _ and - only.
    if (!isRouteId(id)) {
      res.status(400).json({ code: 'invalid_id', error: 'Invalid tournament id.' });
      return;
    }
    const { expectedUpdatedAt, dirty } = req.body || {};
    let { data } = req.body || {};
    if (!data || typeof data !== 'object') {
      res.status(400).json({ code: 'missing_data', error: 'Missing tournament data.' });
      return;
    }
    // Strip anything that could become script in the organiser app (see tournament-sanitize.js). Strips, never rejects.
    try {
      sanitizeTournamentData(data);
      const existingRows = await sql`SELECT id, data, updated_at, created_by FROM tournaments WHERE id = ${id}`;
      const existing = existingRows[0];

      if (existing && !isAdmin && existing.created_by !== organizer.id) {
        // Belongs to someone else - treat like it doesn't exist.
        res.status(404).json({ code: 'not_found', error: 'Not found.' });
        return;
      }

      if (existing && isFinalized(existing.data)) {
        res.status(403).json(FINALIZED_BODY);
        return;
      }

      // The finalized time is the server's clock, never the browser's (a device with a wrong clock must not decide when the
      // event leaves the public Results window). Reached only when the stored row is not finalized, so this save is the one
      // that closes it: whatever the client sent as `finalized` is discarded and replaced by the one key the server owns.
      if (isFinalized(data)) data.finalized = { at: new Date().toISOString() };
      const savedFinalized = isFinalized(data) ? { finalized: data.finalized } : {};

      // Basic accounts cannot grow an event past the limit. An event already over it (e.g. after a downgrade) can still be
      // edited and shrunk, just not grown. Checked after the finalized lock, and before any write.
      const over = checkEntryLimit(organizer.tier, data, existing && existing.data);
      if (over) {
        res.status(403).json({ code: 'entry_limit', limit: over.limit, error: 'Basic accounts allow up to ' + over.limit + ' entries per event.' });
        return;
      }

      if (!existing && expectedUpdatedAt) {
        // The client had a copy of this event, so it existed: it was deleted (or moved) since. Never bring it back.
        res.status(404).json({ code: 'not_found', error: 'Not found.' });
        return;
      }

      if (!existing) {
        const inserted = await sql`
          INSERT INTO tournaments (id, data, created_by)
          VALUES (${id}, ${JSON.stringify(data)}::jsonb, ${organizer.id})
          RETURNING id, updated_at
        `;
        res.status(201).json(Object.assign({}, inserted[0], savedFinalized));
        return;
      }

      const existingIso = new Date(existing.updated_at).toISOString();
      const expectedIso = expectedUpdatedAt ? new Date(expectedUpdatedAt).toISOString() : null;
      /* Results: merge a stale save with the officials' results stored meanwhile, stamp the organiser's own, and keep
         settingsRev (see the header). A floor official's result can land between this read and the write below: then
         the stored copy is read again and the save merged again (a few times), as /api/score/result does, instead of
         answering "changed elsewhere" for a change that was only someone else's result. */
      const e = engine();
      const sent = JSON.stringify(data), dirtyList = Array.isArray(dirty) ? dirty.filter((p) => typeof p === 'string').slice(0, 5000) : null;
      let base = existing, baseIso = existingIso, merged = false, updated = [];
      for (let attempt = 0; attempt < 4; attempt++) {
        const inc = e.inside(JSON.parse(sent)), sto = e.inside(base.data), now = Date.now();
        const stale = attempt > 0 || expectedIso !== baseIso;
        const sameSettings = Number(inc.settingsRev || 0) === Number(sto.settingsRev || 0);
        merged = false;
        if (stale && dirtyList && sameSettings) { e.mergeResults(sto, inc, dirtyList, now); merged = true; }
        else if (!stale) e.stampOrganiserResults(sto, inc, now);
        if (stale && !merged) {
          res.status(409).json({
            code: 'changed_elsewhere', error: 'Tournament changed elsewhere.',
            current: { id: base.id, data: base.data, updated_at: base.updated_at }
          });
          return;
        }
        inc.settingsRev = (Number(sto.settingsRev) || 0) + (e.settingsView(inc) !== e.settingsView(sto) ? 1 : 0);
        data = e.plain(inc);
        // Conditional on the stamp just read (to the millisecond, the precision of the JS value), so a save or a
        // finalize that lands between the read and this write is not overwritten.
        updated = isAdmin
          ? await sql`
            UPDATE tournaments SET data = ${JSON.stringify(data)}::jsonb, updated_at = now()
            WHERE id = ${id}
              AND abs(extract(epoch FROM updated_at) - extract(epoch FROM ${baseIso}::timestamptz)) < 0.001
            RETURNING id, updated_at
          `
          : await sql`
            UPDATE tournaments SET data = ${JSON.stringify(data)}::jsonb, updated_at = now()
            WHERE id = ${id} AND created_by = ${organizer.id}
              AND abs(extract(epoch FROM updated_at) - extract(epoch FROM ${baseIso}::timestamptz)) < 0.001
            RETURNING id, updated_at
          `;
        if (updated.length) break;
        const nowRows = isAdmin
          ? await sql`SELECT id, data, updated_at, created_by FROM tournaments WHERE id = ${id}`
          : await sql`SELECT id, data, updated_at, created_by FROM tournaments WHERE id = ${id} AND created_by = ${organizer.id}`;
        const current = nowRows[0];
        if (!current) { res.status(404).json({ code: 'not_found', error: 'Not found.' }); return; }
        if (isFinalized(current.data)) { res.status(403).json(FINALIZED_BODY); return; }
        if (!dirtyList || attempt === 3) {
          res.status(409).json({
            code: 'changed_elsewhere', error: 'Tournament changed elsewhere.',
            current: { id: current.id, data: current.data, updated_at: current.updated_at }
          });
          return;
        }
        base = current; baseIso = new Date(current.updated_at).toISOString();
      }
      res.status(200).json(Object.assign({}, updated[0], savedFinalized, { settingsRev: data.settingsRev || 0 }, merged ? { data } : {}));
    } catch (e) {
      // The reason goes to the server log (Vercel > Logs), never to the browser.
      console.error('PUT /api/tournaments/' + id + ' failed: ' + (e && e.code ? '[' + e.code + '] ' : '') + (e && e.message ? e.message : e));
      res.status(500).json({ code: 'save_failed', error: 'Could not save tournament.' });
    }
    return;
  }

  res.status(405).json({ code: 'method_not_allowed', error: 'Method not allowed' });
};

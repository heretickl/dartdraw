const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, useState, plain } = require('./lib/helpers');

const app = loadApp();
const f = (n) => run(app, n);
const AT = '2026-10-13T09:30:00.000Z';

/* ---------- fixtures ---------- */
const br = (winner, isVoid) => ({ rounds: [[{ aEntryId: 'a', bEntryId: 'b', winnerId: winner || null, void: !!isVoid }]] });
const group = (id, done, confirmed, entryIds) => ({ id, label: id.toUpperCase(), confirmed: confirmed !== false, entryIds: entryIds || ['a', 'b'], boards: [1], gameStarted: true, startedAt: null, positionOverrides: {}, scores: done ? { 'a|b': { legs1: 3, legs2: 1 } } : {} });
const pod = (id, bracket, confirmed, entryIds) => ({ id, label: id, confirmed: confirmed !== false, entryIds: entryIds || ['a', 'b'], boards: [1], bracket });
function fresh(formatType, extra) {
  const t = f('blankTournament')(); useState(app, t);
  t.id = 't_fin1'; t.format.formatType = formatType; t.groups = []; t.pods = [];
  Object.assign(t, extra || {});
  return t;
}
const ORIG = {};
['persist', 'reloadLockedTournament', 'setSaveStatus', 'openModal', 'apiFetch', 'openTournament', 'fetch', 'showLockedToast', 'applyFinalizedLock'].forEach((n) => { ORIG[n] = run(app, n); });
function reset() {
  Object.keys(ORIG).forEach((n) => { app[n] = ORIG[n]; });
  app.render = () => {}; app.renderSavedList = () => {};
  run(app, 'lockedIds.clear(); tournamentsCache = {}; dbUpdatedAtCache = {}; saveTimer = null; saveInFlight = false; savePendingId = null; lockedReloading = false; finalizing = false; droppedWhileFinalizing = false; lastSaveStatus = ""; popoutMode = false');
}
const tick = () => new Promise((r) => setImmediate(r));

/* ---------- eventComplete ---------- */
test('eventComplete: round robin needs a confirmed group and every confirmed group played out', () => {
  reset();
  assert.equal(f('eventComplete')(fresh('roundrobin')), false);                                   // nothing confirmed
  assert.equal(f('eventComplete')(fresh('roundrobin', { groups: [group('g1', false)] })), false);
  assert.equal(f('eventComplete')(fresh('roundrobin', { groups: [group('g1', true), group('g2', false)] })), false);
  assert.equal(f('eventComplete')(fresh('roundrobin', { groups: [group('g1', true), group('g2', false, false)] })), false);   // a group with entries that was never confirmed still has to be played
  assert.equal(f('eventComplete')(fresh('roundrobin', { groups: [group('g1', true), group('g2', false, false, [])] })), true);   // an empty unconfirmed group is ignored
  assert.equal(f('eventComplete')(fresh('roundrobin', { groups: [group('g1', true), group('g2', true)] })), true);
});

// Three players, each beating the next 3-1: level on points, legs and head-to-head, so no tie-break rule separates them.
const cyclic = (extra) => Object.assign({ id: 'gt', label: 'T', confirmed: true, entryIds: ['a', 'b', 'c'], boards: [1], gameStarted: true, startedAt: null, positionOverrides: {},
  scores: { 'a|b': { legs1: 3, legs2: 1 }, 'b|c': { legs1: 3, legs2: 1 }, 'a|c': { legs1: 1, legs2: 3 } } }, extra || {});

test('eventComplete: an unresolved tie keeps round robin and round robin to knockout from being finalized', () => {
  reset();
  const a = fresh('roundrobin', { groups: [cyclic()] });
  assert.equal(f('unresolvedTieRuns')(a).length > 0, true);   // the fixture really is an unresolved tie
  assert.equal(f('eventComplete')(a), false);
  assert.equal(f('eventComplete')(fresh('rrknockout', { groups: [cyclic()], knockout: br('a') })), false);
  assert.equal(f('eventComplete')(fresh('rrknockout', { groups: [cyclic(), group('g2', true)], knockout: br('a') })), false);
});

test('eventComplete: a tie the organiser has settled with Adjust positions does not block', () => {
  reset();
  const t = fresh('roundrobin', { groups: [cyclic()] });
  const st = f('computeStandings')(t.groups[0]);
  const ov = {}; st.forEach((row, i) => { ov[row.id] = i + 1; });
  t.groups[0].positionOverrides = ov;
  assert.equal(f('unresolvedTieRuns')(t).length, 0);
  assert.equal(f('eventComplete')(t), true);
});

test('eventComplete: knockout needs a bracket with a champion or a voided final', () => {
  reset();
  assert.equal(f('eventComplete')(fresh('knockout', { knockout: null })), false);
  assert.equal(f('eventComplete')(fresh('knockout', { knockout: br(null) })), false);
  assert.equal(f('eventComplete')(fresh('knockout', { knockout: br('a') })), true);
  assert.equal(f('eventComplete')(fresh('knockout', { knockout: br(null, true) })), true);
});

test('eventComplete: round robin to knockout also needs the Plate pool finished when there is one', () => {
  reset();
  const gs = () => [group('g1', true), group('g2', true)];
  assert.equal(f('eventComplete')(fresh('rrknockout', { groups: gs(), knockout: null })), false);
  assert.equal(f('eventComplete')(fresh('rrknockout', { groups: gs(), knockout: br(null) })), false);
  assert.equal(f('eventComplete')(fresh('rrknockout', { groups: gs(), knockout: br('a') })), true);
  assert.equal(f('eventComplete')(fresh('rrknockout', { groups: gs(), knockout: br('a'), knockoutLosers: br(null) })), false);   // Plate pool unfinished
  assert.equal(f('eventComplete')(fresh('rrknockout', { groups: gs(), knockout: br('a'), knockoutLosers: br('b') })), true);
  assert.equal(f('eventComplete')(fresh('rrknockout', { groups: gs(), knockout: br('a'), knockoutLosers: br(null, true) })), true);
  assert.equal(f('eventComplete')(fresh('rrknockout', { groups: [group('g1', true), group('g2', false)], knockout: br('a') })), false);   // a group still playing
  assert.equal(f('eventComplete')(fresh('rrknockout', { groups: [], knockout: br('a') })), false);
  assert.equal(f('eventComplete')(fresh('rrknockout', { groups: [group('g1', true), group('g2', true, false)], knockout: br('a') })), false);   // a group with players that was never confirmed
});

test('eventComplete: group boards needs every confirmed group finished and the Finals complete', () => {
  reset();
  const fin = (w) => Object.assign(br(w), { podFinals: true });
  assert.equal(f('eventComplete')(fresh('podknockout', { pods: [], knockout: fin('a') })), false);
  assert.equal(f('eventComplete')(fresh('podknockout', { pods: [pod('p1', br('a')), pod('p2', br(null))], knockout: fin('a') })), false);   // one group unfinished
  assert.equal(f('eventComplete')(fresh('podknockout', { pods: [pod('p1', br('a')), pod('p2', br(null), false)], knockout: fin('a') })), false);   // an unconfirmed group with players is not finished
  assert.equal(f('eventComplete')(fresh('podknockout', { pods: [pod('p1', br('a')), pod('p2', br(null), false, [])], knockout: fin('a') })), true);   // an empty one is ignored
  assert.equal(f('eventComplete')(fresh('podknockout', { pods: [pod('p1', br('a')), pod('p2', br('b'))], knockout: fin(null) })), false);
  assert.equal(f('eventComplete')(fresh('podknockout', { pods: [pod('p1', br('a')), pod('p2', br(null, true))], knockout: fin('a') })), true);
  assert.equal(f('eventComplete')(fresh('podknockout', { pods: [pod('p1', br('a'))], knockout: br('a') })), false);   // a bracket that is not the Finals
});

test('eventComplete never throws on junk or partial data', () => {
  reset();
  for (const junk of [null, undefined, {}, { format: {} }, { format: { formatType: 'nope' } }, { format: { formatType: 'knockout' }, knockout: { rounds: [] } },
    { format: { formatType: 'roundrobin' }, groups: [{ confirmed: true }] }, { format: { formatType: 'podknockout' }, pods: [{ confirmed: true }], knockout: { podFinals: true } }]) {
    assert.equal(f('eventComplete')(junk), false);
  }
});

/* ---------- isLocked and the card ---------- */
test('isLocked is true for any truthy finalized value', () => {
  assert.equal(f('isLocked')({ finalized: { at: AT } }), true);
  assert.equal(f('isLocked')({ finalized: true }), true);
  assert.equal(f('isLocked')({ finalized: {} }), true);
  assert.equal(f('isLocked')({ finalized: 'yes' }), true);
  for (const v of [{}, { finalized: null }, { finalized: false }, null, undefined]) assert.equal(f('isLocked')(v), false);
});

test('finalize card: incomplete event offers nothing and says why', () => {
  reset(); fresh('knockout', { knockout: br(null) });
  const html = f('finalizeCardHTML')();
  assert.match(html, /Accept results (?:&|&amp;) finalize/);
  assert.match(html, /Available once every match is played/);
  assert.doesNotMatch(html, /finalizeResults\(\)/); assert.doesNotMatch(html, /<button/);
});

test('finalize card: complete event offers the Accept button', () => {
  reset(); fresh('knockout', { knockout: br('a') });
  const html = f('finalizeCardHTML')();
  assert.match(html, /onclick="finalizeResults\(\)"/); assert.match(html, /Accept (?:&|&amp;) finalize/);
  assert.doesNotMatch(html, /Available once every match is played/);
});

test('finalize card: a Plate pool or Group Boards group still unfinished does not offer it', () => {
  reset(); fresh('rrknockout', { groups: [group('g1', true)], knockout: br('a'), knockoutLosers: br(null) });
  assert.doesNotMatch(f('finalizeCardHTML')(), /finalizeResults\(\)/);
  fresh('podknockout', { pods: [pod('p1', br('a')), pod('p2', br(null))], knockout: Object.assign(br('a'), { podFinals: true }) });
  assert.doesNotMatch(f('finalizeCardHTML')(), /finalizeResults\(\)/);
});

test('finalize card: a finalized event shows the date and the Admin note, with no way to reopen or edit', () => {
  reset(); fresh('knockout', { knockout: br('a'), finalized: { at: AT } });
  const html = f('finalizeCardHTML')();
  assert.match(html, /Results finalized/);
  assert.ok(html.includes(new Date(AT).toLocaleString()));
  assert.match(html, /Only an Admin can reopen or edit this event\./);
  assert.doesNotMatch(html, /<button/); assert.doesNotMatch(html, /finalizeResults|reopen\(|Reopen<|onclick/i);
});

test('finalize card: junk finalized values are treated as locked, without a date', () => {
  reset(); fresh('knockout', { knockout: br('a'), finalized: true });
  const html = f('finalizeCardHTML')();
  assert.match(html, /Results finalized/); assert.doesNotMatch(html, /Invalid Date/); assert.doesNotMatch(html, /<button/);
});

test('the card is the last thing every format shows on Manage Tournament', () => {
  reset();
  fresh('knockout', { knockout: br('a') });
  assert.match(f('stage5')(), /Accept results (?:&|&amp;) finalize[\s\S]*$/);
  fresh('roundrobin', { groups: [group('g1', true)] });
  assert.match(f('stage5')(), /finalizeResults\(\)/);
  fresh('podknockout', { pods: [pod('p1', br('a'))], knockout: Object.assign(br('a'), { podFinals: true }) });
  assert.match(f('stage5')(), /finalizeResults\(\)/);
  fresh('rrknockout', { groups: [group('g1', true)], knockout: br('a') });
  assert.match(f('stage5')(), /finalizeResults\(\)/);
});

test('a finalized event shows the banner at the top of every stage', () => {
  reset(); fresh('knockout', { knockout: br('a'), finalized: { at: AT } });
  const html = f('finalizedBannerHTML')();
  assert.match(html, /Results finalized on /); assert.match(html, /Only an Admin can change or reopen this event\./);
  fresh('knockout', { knockout: br('a') });
  assert.equal(f('finalizedBannerHTML')(), '');
});

/* ---------- duplicate ---------- */
test('duplicating a finalized event gives an editable, unfinalized, unpublished copy', async () => {
  reset();
  const src = fresh('knockout', { knockout: br('a'), finalized: { at: AT }, published: true, publicSlug: 'abc', listed: true });
  src.id = 'src_fin'; src.eventCreation.tournamentName = 'Test Open';
  app.__src = src; run(app, 'tournamentsCache = { src_fin: __src }; dbUpdatedAtCache = {}');
  let sent = null, opened = null;
  const realFetch = app.apiFetch, realOpen = app.openTournament;
  app.apiFetch = async (url, opts) => { sent = JSON.parse(opts.body).data; return { ok: true, json: async () => ({ updated_at: 'x' }) }; };
  app.openTournament = async (id) => { opened = id; };
  try { await f('duplicateTournament')('src_fin', { stopPropagation() {} }); }
  finally { app.apiFetch = realFetch; app.openTournament = realOpen; }
  assert.ok(sent && opened === sent.id && sent.id !== 'src_fin');
  assert.equal('finalized' in sent, false); assert.equal(sent.published, false); assert.equal(sent.listed, false);
  assert.deepEqual(plain(src.finalized), { at: AT });   // the original is untouched
});

/* ---------- persist / save lock ---------- */
test('persist on a locked tournament does not schedule a save and reloads the saved copy instead', () => {
  reset();
  const t = fresh('knockout', { knockout: br('a'), finalized: { at: AT } });
  run(app, 'lockedIds.add("t_fin1")');
  let reloads = 0; app.reloadLockedTournament = () => { reloads++; };
  const before = t.updatedAt;
  f('persist')();
  assert.equal(reloads, 1);
  assert.equal(run(app, 'saveTimer'), null);
  assert.equal(t.updatedAt, before);
});

test('persist on an editable tournament still schedules a save', () => {
  reset();
  fresh('knockout', { knockout: br('a') });
  let reloads = 0; app.reloadLockedTournament = () => { reloads++; };
  f('persist')();
  assert.equal(reloads, 0);
  assert.notEqual(run(app, 'saveTimer'), null);
  run(app, 'clearTimeout(saveTimer); saveTimer = null');
});

test('reloadLockedTournament fetches the saved copy, never PUTs, and does not loop', async () => {
  reset();
  const saved = JSON.parse(JSON.stringify(f('blankTournament')()));
  saved.id = 't_fin1'; saved.finalized = { at: AT }; saved.eventCreation.tournamentName = 'Server copy';
  fresh('knockout', { knockout: br('a') }); run(app, 'lockedIds.add("t_fin1")');
  const calls = [];
  const realFetch = app.apiFetch;
  app.apiFetch = async (url, opts) => { calls.push({ url, method: (opts && opts.method) || 'GET' }); return { ok: true, status: 200, json: async () => ({ data: saved, updated_at: 'U9' }) }; };
  const statuses = []; app.setSaveStatus = (s) => statuses.push(s);
  try {
    f('reloadLockedTournament')(); f('reloadLockedTournament')();     // second call while the first is running is ignored
    await tick(); await tick(); await tick();
  } finally { app.apiFetch = realFetch; }
  assert.deepEqual(calls, [{ url: '/api/tournaments/t_fin1', method: 'GET' }]);
  assert.equal(run(app, 'state.eventCreation.tournamentName'), 'Server copy');
  assert.equal(run(app, 'tournamentsCache.t_fin1.eventCreation.tournamentName'), 'Server copy');
  assert.equal(run(app, 'dbUpdatedAtCache.t_fin1'), 'U9');
  assert.equal(run(app, 'lockedIds.has("t_fin1")'), true);
  assert.ok(statuses.includes('locked')); assert.ok(!statuses.includes('ok'));
  assert.equal(run(app, 'lockedReloading'), false);
});

test('a save refused with 403 finalized locks the id, reloads and never shows Saved', async () => {
  reset();
  fresh('knockout', { knockout: br('a') });
  const realFetch = app.apiFetch;
  app.apiFetch = async () => ({ ok: false, status: 403, json: async () => ({ error: 'x', finalized: true }) });
  const statuses = []; app.setSaveStatus = (s) => statuses.push(s);
  let reloads = 0; app.reloadLockedTournament = () => { reloads++; };
  try { await f('flushSaveOnce')(); } finally { app.apiFetch = realFetch; }
  assert.equal(run(app, 'lockedIds.has("t_fin1")'), true);
  assert.equal(reloads, 1);
  assert.ok(!statuses.includes('ok'));
  assert.notEqual(statuses[statuses.length - 1], 'saving');   // never left saying Saving... either
});

test('flushSaveOnce does not even send a request for a locked id', async () => {
  reset();
  fresh('knockout', { knockout: br('a'), finalized: { at: AT } }); run(app, 'lockedIds.add("t_fin1")');
  let sent = 0; const realFetch = app.apiFetch; app.apiFetch = async () => { sent++; return { ok: true, json: async () => ({}) }; };
  try { await f('flushSaveOnce')(); } finally { app.apiFetch = realFetch; }
  assert.equal(sent, 0);
});

test('flushSaveNow skips locked ids entirely', () => {
  reset();
  fresh('knockout', { knockout: br('a'), finalized: { at: AT } }); run(app, 'lockedIds.add("t_fin1")');
  let sent = 0; app.fetch = () => { sent++; return Promise.resolve({ ok: false }); };
  run(app, 'savePending = true');
  f('flushSaveNow')();
  assert.equal(sent, 0);
  run(app, 'lockedIds.clear()'); f('flushSaveNow')();
  assert.equal(sent, 1);                                  // an editable one with an unsaved edit still flushes
});

test('flushSave resolves only when the save that carries the latest change has finished', async () => {
  reset();
  fresh('knockout', { knockout: br('a') });
  const gates = []; const order = [];
  const realFetch = app.apiFetch;
  app.apiFetch = (url, opts) => new Promise((resolve) => { gates.push(() => { order.push('put'); resolve({ ok: true, status: 200, json: async () => ({ updated_at: 'u' + gates.length }) }); }); });
  let first = f('flushSave')(); first.then(() => order.push('first done'));
  let second = f('flushSave')(); second.then(() => order.push('second done'));   // arrives while the first is in flight
  await tick(); assert.equal(gates.length, 1);
  gates[0](); await tick(); await tick(); await tick();
  assert.equal(gates.length, 2);          // the follow-up save started
  assert.ok(!order.includes('second done'));
  gates[1](); await tick(); await tick(); await tick();
  app.apiFetch = realFetch;
  assert.deepEqual(order, ['put', 'first done', 'put', 'second done']);
});

/* ---------- finalizeResults ---------- */
function captureModal() { const m = { calls: [] }; app.openModal = (o) => { m.calls.push(o); }; return m; }

test('finalizeResults on an incomplete event does nothing', () => {
  reset(); fresh('knockout', { knockout: br(null) });
  const m = captureModal();
  f('finalizeResults')();
  assert.equal(m.calls.length, 0);
});

/* A fake server for the finalize flow: GET answers with `serverCopy()` (default: this tab's own state, unchanged) and `getStamp`;
   a PUT without `finalized` is the plain save before the check, a PUT with it is the finalize itself. */
function fakeServer(opts) {
  opts = opts || {};
  const s = { gets: 0, saves: [], finals: [], release: null };
  s.fn = (url, o) => {
    if (!o || !o.method || o.method === 'GET') {
      s.gets++;
      if (opts.getFails) return Promise.resolve({ ok: false, status: 500, json: async () => ({}) });
      const data = opts.serverCopy ? opts.serverCopy(s) : JSON.parse(JSON.stringify(run(app, 'state')));
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ data, updated_at: opts.getStamp || 'S1' }) });
    }
    const body = JSON.parse(o.body);
    if (!body.data.finalized) { s.saves.push(body); return Promise.resolve({ ok: true, status: 200, json: async () => ({ updated_at: 'S1' }) }); }
    s.finals.push(body);
    if (opts.finalPut) return Promise.resolve(opts.finalPut(body));
    return new Promise((res) => { s.release = () => res({ ok: true, status: 200, json: async () => ({ updated_at: 'S2' }) }); });
  };
  return s;
}
const notices = (m) => m.calls.slice(1);
const STALE = /This event was changed elsewhere\. It has been reloaded; check it and try again\./;
async function settle() { for (let i = 0; i < 8; i++) await tick(); }

test('finalizeResults confirms, saves with finalized set, and locks only after the save succeeds', async () => {
  reset(); const t = fresh('knockout', { knockout: br('a') });
  const m = captureModal();
  const srv = fakeServer(); app.apiFetch = srv.fn;
  f('finalizeResults')();
  assert.equal(m.calls.length, 1);
  assert.equal(m.calls[0].title, 'Accept results as final?');
  assert.match(m.calls[0].body, /Final results/); assert.match(m.calls[0].body, /only an Admin can change or reopen it/);
  assert.match(m.calls[0].body, /Publishing and listing settings can't be changed afterwards, so set them first\./);
  assert.equal(m.calls[0].confirmLabel, 'Accept & finalize');
  assert.equal(t.finalized, undefined);                 // nothing happens until confirmed
  const pending = m.calls[0].onConfirm();
  await settle();
  assert.equal(srv.finals.length, 1);
  assert.equal(typeof t.finalized.at, 'string'); assert.equal(new Date(t.finalized.at).toISOString(), t.finalized.at);
  assert.deepEqual(plain(srv.finals[0].data.finalized), plain(t.finalized));
  assert.equal(srv.finals[0].expectedUpdatedAt, 'S1');   // sent with the stamp we just verified
  assert.equal(run(app, 'lockedIds.has("t_fin1")'), false);   // not locked until the PUT has succeeded
  assert.equal(run(app, 'finalizing'), true);
  srv.release(); await pending;
  assert.equal(run(app, 'lockedIds.has("t_fin1")'), true);
  assert.equal(run(app, 'dbUpdatedAtCache.t_fin1'), 'S2');
  assert.equal(run(app, 'finalizing'), false);
  assert.equal(run(app, 'saveTimer'), null);            // no second, debounced save is left behind
  assert.equal(notices(m).length, 0);
});

test('finalizeResults: while the finalize PUT is in flight the tab says so and persist() drops edits, then reloads if any were dropped', async () => {
  reset(); fresh('knockout', { knockout: br('a') });
  const m = captureModal(); const statuses = []; app.setSaveStatus = (s) => statuses.push(s);
  const srv = fakeServer(); app.apiFetch = srv.fn;
  f('finalizeResults')(); const pending = m.calls[0].onConfirm(); await settle();
  assert.ok(statuses.includes('finalizing'));
  const puts = srv.saves.length + srv.finals.length;
  f('persist')();                                       // an edit sneaks in
  assert.equal(run(app, 'saveTimer'), null);
  let reloads = 0; app.reloadLockedTournament = () => { reloads++; };
  srv.release(); await pending;
  assert.equal(srv.saves.length + srv.finals.length, puts);   // nothing extra was sent
  assert.equal(reloads, 1);                             // the dropped edit is discarded in favour of the saved copy
  assert.equal(run(app, 'lockedIds.has("t_fin1")'), true);
});

test('finalizeResults: refuses while the last save is in the Updated elsewhere error state', async () => {
  reset(); const t = fresh('knockout', { knockout: br('a') });
  const m = captureModal(); const srv = fakeServer(); app.apiFetch = srv.fn;
  run(app, "lastSaveStatus = 'error'");
  f('finalizeResults')(); await m.calls[0].onConfirm();
  assert.equal(srv.finals.length, 0); assert.equal(srv.gets, 0);
  assert.equal(notices(m).length, 1); assert.equal('finalized' in t, false);
  assert.equal(run(app, 'finalizing'), false);
});

test('finalizeResults: a server copy with a different stamp is reloaded and nothing is finalized', async () => {
  reset(); const t = fresh('knockout', { knockout: br('a') });
  const m = captureModal(); const srv = fakeServer({ getStamp: 'S9' }); app.apiFetch = srv.fn;
  const opened = []; app.openTournament = async (id) => { opened.push(id); };
  f('finalizeResults')(); await m.calls[0].onConfirm();
  assert.equal(srv.finals.length, 0);
  assert.deepEqual(opened, ['t_fin1']);
  assert.match(notices(m)[0].body, STALE);
  assert.equal('finalized' in t, false); assert.equal(run(app, 'finalizing'), false);
});

test('finalizeResults: a server copy that is already finalized is reloaded and locked, not finalized again', async () => {
  reset(); fresh('knockout', { knockout: br('a') });
  const m = captureModal();
  const srv = fakeServer({ serverCopy: () => Object.assign(JSON.parse(JSON.stringify(run(app, 'state'))), { finalized: { at: '2026-10-12T08:00:00.000Z' } }) }); app.apiFetch = srv.fn;
  let opened = 0; app.openTournament = async () => { opened++; };
  f('finalizeResults')(); await m.calls[0].onConfirm();
  assert.equal(srv.finals.length, 0); assert.equal(opened, 1);
  assert.equal(run(app, 'lockedIds.has("t_fin1")'), true);
  assert.equal(notices(m).length, 1);
});

test('finalizeResults: a server copy that is not complete is reloaded and not finalized', async () => {
  reset(); fresh('knockout', { knockout: br('a') });
  const m = captureModal();
  const srv = fakeServer({ serverCopy: () => Object.assign(JSON.parse(JSON.stringify(run(app, 'state'))), { knockout: br(null) }) }); app.apiFetch = srv.fn;
  let opened = 0; app.openTournament = async () => { opened++; };
  f('finalizeResults')(); await m.calls[0].onConfirm();
  assert.equal(srv.finals.length, 0); assert.equal(opened, 1);
  assert.match(notices(m)[0].body, STALE);
});

test('finalizeResults: if the check cannot reach the server it says try again, with its own wording', async () => {
  reset(); const t = fresh('knockout', { knockout: br('a') });
  const m = captureModal(); const srv = fakeServer({ getFails: true }); app.apiFetch = srv.fn;
  f('finalizeResults')(); await m.calls[0].onConfirm();
  assert.equal(srv.finals.length, 0);
  assert.match(notices(m)[0].body, /Could not finalize: try again/);
  assert.doesNotMatch(notices(m)[0].body, /Updated elsewhere/);
  assert.equal('finalized' in t, false); assert.equal(run(app, 'finalizing'), false);
});

test('finalizeResults: if the finalize PUT fails the event is not finalized and the wording is distinct', async () => {
  reset(); const t = fresh('knockout', { knockout: br('a') });
  const m = captureModal(); const statuses = []; app.setSaveStatus = (s) => statuses.push(s);
  const srv = fakeServer({ finalPut: () => ({ ok: false, status: 500, json: async () => ({}) }) }); app.apiFetch = srv.fn;
  f('finalizeResults')(); await m.calls[0].onConfirm();
  assert.equal('finalized' in t, false);
  assert.equal(run(app, 'lockedIds.has("t_fin1")'), false); assert.equal(run(app, 'finalizing'), false);
  assert.match(notices(m)[0].body, /Could not finalize: try again/);
  assert.ok(!statuses.includes('error'));
});

test('finalizeResults: a 409 on the finalize PUT reloads the server copy and shows the stale message', async () => {
  reset(); const t = fresh('knockout', { knockout: br('a') });
  const m = captureModal();
  const srv = fakeServer({ finalPut: () => ({ ok: false, status: 409, json: async () => ({ current: { data: {}, updated_at: 'S7' } }) }) }); app.apiFetch = srv.fn;
  let opened = 0; app.openTournament = async () => { opened++; };
  f('finalizeResults')(); await m.calls[0].onConfirm();
  assert.equal(opened, 1); assert.match(notices(m)[0].body, STALE);
  assert.equal('finalized' in t, false); assert.equal(run(app, 'lockedIds.has("t_fin1")'), false);
});

test('finalizeResults: when the server says it was already finalized, the reloaded copy is left alone', async () => {
  reset(); fresh('knockout', { knockout: br('a') });
  const m = captureModal();
  const other = JSON.parse(JSON.stringify(f('blankTournament')())); other.id = 't_fin1'; other.finalized = { at: '2026-10-12T08:00:00.000Z' };
  // The pre-check GET sees our own copy; the GET after the refused finalize PUT sees the other tab's finalized copy.
  const srv = fakeServer({ finalPut: () => ({ ok: false, status: 403, json: async () => ({ finalized: true }) }), serverCopy: (s) => (s.finals.length ? other : JSON.parse(JSON.stringify(run(app, 'state')))) });
  app.apiFetch = srv.fn;
  f('finalizeResults')(); await m.calls[0].onConfirm(); await settle();
  assert.equal(run(app, 'state.finalized.at'), '2026-10-12T08:00:00.000Z');   // the other tab's finalization, not ours
  assert.equal(run(app, 'lockedIds.has("t_fin1")'), true); assert.equal(run(app, 'finalizing'), false);
});

/* ---------- delete / rename ---------- */
test('deleting a finalized event only explains that an Admin must do it', () => {
  reset();
  const t = fresh('knockout', { knockout: br('a'), finalized: { at: AT } }); app.__t = t;
  run(app, 'tournamentsCache = { t_fin1: __t }');
  const m = captureModal(); let sent = 0; const realFetch = app.apiFetch; app.apiFetch = async () => { sent++; return { ok: true }; };
  try { f('deleteTournament')('t_fin1', { stopPropagation() {} }); } finally { app.apiFetch = realFetch; }
  assert.equal(m.calls.length, 1); assert.match(m.calls[0].title + m.calls[0].body, /Finalized events can only be deleted by an Admin/);
  assert.equal(sent, 0); assert.equal(run(app, 'tournamentsCache.t_fin1') === t, true);
});

test('deleting an event the server says is finalized puts it back and explains', async () => {
  reset();
  const t = fresh('knockout', { knockout: br('a') }); app.__t = t;      // this tab does not know it is finalized
  run(app, 'tournamentsCache = { t_fin1: __t }; dbUpdatedAtCache = { t_fin1: "U0" }');
  const m = captureModal();
  const realFetch = app.apiFetch;
  const server = JSON.parse(JSON.stringify(f('blankTournament')())); server.id = 't_fin1'; server.finalized = { at: AT };
  app.apiFetch = async (url, opts) => (opts && opts.method === 'DELETE'
    ? { ok: false, status: 403, json: async () => ({ finalized: true }) }
    : { ok: true, status: 200, json: async () => ({ data: server, updated_at: 'U3' }) });
  app.openTournament = async () => {};
  try { f('deleteTournament')('t_fin1', { stopPropagation() {} }); await m.calls[0].onConfirm(); await tick(); await tick(); await tick(); } finally { app.apiFetch = realFetch; }
  assert.ok(run(app, 'tournamentsCache.t_fin1'));                       // restored
  assert.equal(run(app, 'lockedIds.has("t_fin1")'), true);
  assert.ok(m.calls.some((c) => /Finalized events can only be deleted by an Admin/.test(c.title + c.body)));
});

test('renaming a finalized event is blocked with the same explanation', () => {
  reset();
  const t = fresh('knockout', { knockout: br('a'), finalized: { at: AT } }); app.__t = t;
  run(app, 'tournamentsCache = { t_fin1: __t }');
  const m = captureModal();
  f('renameTournament')('t_fin1', { stopPropagation() {} });
  assert.equal(m.calls.length, 1); assert.match(m.calls[0].title + m.calls[0].body, /Finalized events can only be renamed by an Admin/);
  assert.equal(m.calls[0].bodyHTML, undefined);                         // no rename box
});

/* ---------- loading marks the lock ---------- */
test('openTournament records whether the loaded event is finalized', async () => {
  reset();
  const mk = (id, fin) => { const d = JSON.parse(JSON.stringify(f('blankTournament')())); d.id = id; if (fin) d.finalized = { at: AT }; return d; };
  const rows = { t_a: mk('t_a', true), t_b: mk('t_b', false) };
  const realFetch = app.apiFetch; app.apiFetch = async (url) => { const id = url.split('/').pop(); return { ok: true, status: 200, json: async () => ({ data: rows[id], updated_at: 'U' }) }; };
  try {
    await f('openTournament')('t_a'); assert.equal(run(app, 'lockedIds.has("t_a")'), true);
    await f('openTournament')('t_b'); assert.equal(run(app, 'lockedIds.has("t_b")'), false);
    run(app, 'lockedIds.add("t_b")'); await f('openTournament')('t_b'); assert.equal(run(app, 'lockedIds.has("t_b")'), false);   // reopened by an Admin
  } finally { app.apiFetch = realFetch; }
});

test('the saved list marks finalized tournaments as locked when it loads', async () => {
  reset();
  const mk = (id, fin) => { const d = JSON.parse(JSON.stringify(f('blankTournament')())); d.id = id; if (fin) d.finalized = { at: AT }; return d; };
  const realFetch = app.apiFetch; app.apiFetch = async () => ({ ok: true, status: 200, json: async () => ([{ id: 't_a', data: mk('t_a', true), updated_at: 'U' }, { id: 't_b', data: mk('t_b', false), updated_at: 'U' }]) });
  try { await f('fetchTournamentList')(); } finally { app.apiFetch = realFetch; }
  assert.equal(run(app, 'lockedIds.has("t_a")'), true); assert.equal(run(app, 'lockedIds.has("t_b")'), false);
});

/* ---------- the UI lock ---------- */
function el(tag, attrs) {
  const a = Object.assign({}, attrs), classes = new Set();
  return { tagName: tag.toUpperCase(), disabled: !!(attrs && attrs.disabled), attrs: a, classes,
    classList: { add: (c) => classes.add(c), contains: (c) => classes.has(c) },
    getAttribute: (n) => (n in a ? a[n] : null), hasAttribute: (n) => n in a, removeAttribute: (n) => { delete a[n]; } };
}
const container = (els) => ({ querySelectorAll: () => els });

test('the allow-list: only view-only actions pass', () => {
  const ok = f('finalizedActionAllowed');
  for (const code of ['goStage(5)', 'doFinalPrint()', 'copyPublicLink(this)', 'window.print()', "openInNewWindow('rr')", "openExpandedPreview('g1')", 'closeExpandedPreview();goStage(4)', "jumpToStage5Section('stage5-rr-section')", 'this.select()', "podsSelect('grid')", 'newTournament()']) {
    assert.equal(ok(code), true, code);
  }
  for (const code of ["koMatchScoreModal('knockout',0,0)", 'startAllGames()', "promptScore('g','a','b','A','B')", "event.stopPropagation();openKoNoShowPicker('x')", 'saveStage1()', 'goStage(5);startAllGames()', "document.getElementById('x').value=''", 'finalizeResults()', 'setPublished(true)', '', null, undefined, 'x=1']) {
    assert.equal(ok(code), false, String(code));
  }
});

test('the allow-list ignores call-like text inside quoted arguments', () => {
  assert.equal(f('finalizedActionAllowed')("openKoNoShowPicker('goStage(1)')"), false);
  assert.equal(f('finalizedActionAllowed')("goStage(1);evil('goStage(1)')"), false);
});

test('applyFinalizedLock disables controls, neutralises clickable elements and keeps view-only ones', () => {
  reset();
  const input = el('input', { type: 'number' }), select = el('select', { onchange: 'setX(this.value)' }), area = el('textarea');
  const readonly = el('input', { type: 'text', readonly: '', onclick: 'this.select()' });
  const nav = el('button', { onclick: 'goStage(4)' }), print = el('button', { onclick: 'doFinalPrint()' }), copy = el('button', { onclick: 'copyPublicLink(this)' });
  const start = el('button', { onclick: 'startAllGames()' }), noClick = el('button', {});
  const cell = el('div', { onclick: "koMatchScoreModal('knockout',0,0)" }), link = el('a', { onclick: "jumpToStage5Section('x')" });
  const del = el('a', { onclick: "deleteIncident('i1')", href: 'javascript:void(0)' });
  f('applyFinalizedLock')(container([input, select, area, readonly, nav, print, copy, start, noClick, cell, link, del]));
  for (const e of [input, select, area, start, noClick]) assert.equal(e.disabled, true, e.tagName);
  for (const e of [readonly, nav, print, copy]) assert.equal(e.disabled, false, e.tagName);
  assert.ok(nav.getAttribute('onclick') && print.getAttribute('onclick') && copy.getAttribute('onclick') && link.getAttribute('onclick') && readonly.getAttribute('onclick'));
  for (const e of [start, cell, del]) { assert.ok(e.classList.contains('fin-locked'), e.tagName); assert.equal(e.getAttribute('onclick'), null); }
  assert.ok(!link.classList.contains('fin-locked'));
});

test('the group picker select stays usable on a finalized event, other selects do not', () => {
  reset();
  const pick = el('select', { onchange: 'setActiveGroup(this.value)' }), other = el('select', { onchange: 'setPodBoards(this.value)' });
  const tail = el('input', { type: 'text' });
  f('applyFinalizedLock')(container([pick, other, tail]));
  assert.equal(pick.disabled, false); assert.equal(other.disabled, true); assert.equal(tail.disabled, true);
  assert.ok(pick.getAttribute('onchange'));
});

test('the expanded preview modal is locked too when the event is finalized', () => {
  reset();
  const t = fresh('roundrobin', { groups: [group('g1', true)], activeGroupId: 'g1', finalized: { at: AT } });
  const backdrop = { classList: { contains: () => true }, innerHTML: '' };
  app.document = { getElementById: (id) => (id === 'previewModalBackdrop' ? backdrop : null), createElement: () => ({}) };
  app.requestAnimationFrame = () => {};
  app.chartSheetHTML = () => '<div onclick="promptScore(1)"></div>';
  const locked = []; app.applyFinalizedLock = (el) => { locked.push(el); };
  try { f('renderExpandedPreview')(); } finally { delete app.chartSheetHTML; }
  assert.deepEqual(locked, [backdrop]);
  // ...and an editable event is left alone
  delete t.finalized; locked.length = 0;
  app.chartSheetHTML = () => ''; try { f('renderExpandedPreview')(); } finally { delete app.chartSheetHTML; }
  assert.deepEqual(locked, []);
});

test('in the pop-out window a refused save shows a visible message', () => {
  reset(); fresh('knockout', { knockout: br('a'), finalized: { at: AT } });
  let toasts = 0; app.showLockedToast = () => { toasts++; };
  run(app, 'lockedIds.add("t_fin1")'); app.openTournament = async () => {};
  f('persist')(); assert.equal(toasts, 0);                     // the main window has the save status and banner
  run(app, 'popoutMode = true'); run(app, 'lockedReloading = false');
  f('persist')(); assert.equal(toasts, 1);
});

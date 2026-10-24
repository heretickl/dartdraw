const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, useState } = require('./lib/helpers');

// A window whose copy is out of date ("Updated elsewhere", a 409 from the server) must never send that copy again:
// not on the next edit, not on a retry, not when the tab is hidden or closed, not by renaming. Only a reload (which
// loads the server's copy) ends that. Other events are not affected. The full-page window shows it on the page.
const app = loadApp();
const f = (n) => run(app, n);
const DOC = app.document;
const ORIG = {};
['apiFetch', 'openTournament', 'flushSave', 'render', 'renderSavedList', 'openModal', 'fetch'].forEach((n) => { ORIG[n] = run(app, n); });
const ORIG_EVENT_COMPLETE = run(app, 'eventComplete');
const tick = () => new Promise((r) => setImmediate(r));
const settle = async () => { for (let i = 0; i < 6; i++) await tick(); };

// Stand-ins for the elements the save status and the banner are painted into.
function makeEl() {
  const el = { textContent: '', onclick: null, hidden: true, classes: new Set(), classList: { toggle(name, on) { if (on) el.classes.add(name); else el.classes.delete(name); } } };
  return el;
}
let els;
function mountDom() {
  els = { saveStatus: makeEl(), saveStatusCompact: makeEl(), popoutSaveStatus: makeEl(), staleBanner: makeEl() };
  const body = makeEl();
  app.document = new Proxy(DOC, { get: (t, k) => (k === 'getElementById' ? (id) => els[id] || null : k === 'body' ? body : t[k]) });
  return body;
}
function tournament(id, name) {
  const t = f('blankTournament')(); t.id = id;
  t.eventCreation.saved = true; t.eventCreation.tournamentName = name || id;
  return t;
}
const copy = (x) => JSON.parse(JSON.stringify(x));

// A fake server: records every request; PUT answers come from `putReply`, GET answers from `rows`.
let calls, rows, putReply;
function setup(id) {
  Object.keys(ORIG).forEach((n) => { app[n] = ORIG[n]; });
  const t = tournament(id || 't_st1', 'Spring Open');
  useState(app, t);
  run(app, 'lockedIds.clear(); staleIds.clear(); staleCurrent = {}; pendingSaves.clear(); sentCopies.clear(); keepaliveSave = null; staleReloading = false; tournamentsCache = {}; dbUpdatedAtCache = {}; clearTimeout(saveTimer); saveTimer = null; saveInFlight = false; savePendingId = null; saveWaiters = []; savePending = false; saveRev = 0; finalizing = false; lastSaveStatus = ""; popoutMode = false; currentStage = 5');
  run(app, 'tournamentsCache[state.id] = state; dbUpdatedAtCache[state.id] = "S1"');
  app.render = () => {}; app.renderSavedList = () => {};
  app.openModal = (o) => { modals.push(o.title); };
  modals = [];
  mountDom();
  calls = []; rows = {}; putReply = () => ({ ok: true, status: 200, json: async () => ({ updated_at: 'S' + (calls.length + 1) }) });
  const handle = (url, o) => {
    const method = (o && o.method) || 'GET';
    const id = decodeURIComponent(String(url).split('/').pop());
    calls.push({ method, id, body: o && o.body ? JSON.parse(o.body) : null, keepalive: !!(o && o.keepalive) });
    if (method === 'PUT') return Promise.resolve(putReply(id));
    const row = rows[id];
    return Promise.resolve(row ? { ok: true, status: 200, json: async () => copy(row) } : { ok: false, status: 404, json: async () => ({}) });
  };
  app.apiFetch = handle; app.fetch = handle;
  return t;
}
let modals = [];
const puts = () => calls.filter((c) => c.method === 'PUT');
// The other window saved first: the server holds a newer copy, with a score this window does not have.
function newerServerCopy(t, stamp) {
  const data = copy(t); data.eventCreation.tournamentName = 'Spring Open (newer)'; data.serverMarker = 'other-window-score';
  return { id: t.id, data, updated_at: stamp || 'S9' };
}
function conflictOnce(current) {
  putReply = () => ({ ok: false, status: 409, json: async () => ({ error: 'Tournament changed elsewhere.', current: copy(current) }) });
}
const clearDebounce = () => run(app, 'clearTimeout(saveTimer); saveTimer = null');

test('after a 409 no later PUT is ever sent for that event: edits, retries, the debounced save, hide and close', async () => {
  const t = setup();
  const current = newerServerCopy(t);
  conflictOnce(current);
  f('persist')(); clearDebounce();
  assert.equal(await f('flushSave')(), false);
  assert.equal(puts().length, 1, 'the refused save');
  assert.equal(run(app, 'staleIds.has("t_st1")'), true);
  putReply = () => ({ ok: true, status: 200, json: async () => ({ updated_at: 'S10' }) });   // the server would now accept anything
  // more edits: nothing is scheduled or sent
  t.eventCreation.eventName = 'stale edit';
  f('persist')();
  assert.equal(run(app, 'saveTimer'), null, 'no debounced save is scheduled');
  assert.equal(await f('flushSave')(), false);
  assert.equal(await f('flushSaveOnce')(), false);
  // hiding or closing the tab sends nothing, even with an unsaved edit marked
  run(app, 'savePending = true');
  f('flushSaveNow')();
  await settle();
  assert.equal(puts().length, 1, 'no PUT after the 409');
  assert.equal(calls.filter((c) => c.keepalive).length, 0, 'the close/hide flush sent nothing');
  // the status stays "Updated elsewhere" and clicking it reloads (a GET), never retries a save
  assert.equal(els.saveStatus.textContent, 'Updated elsewhere — click to reload');
  rows.t_st1 = current;
  els.saveStatus.onclick(); await settle();
  assert.equal(puts().length, 1);
  assert.equal(calls.filter((c) => c.method === 'GET').length, 1);
});

test('the server’s newer stamp is not adopted, so even a stray save could not overwrite the newer copy', async () => {
  const t = setup();
  conflictOnce(newerServerCopy(t, 'S9'));
  f('persist')(); clearDebounce();
  await f('flushSave')();
  assert.equal(run(app, 'dbUpdatedAtCache["t_st1"]'), 'S1');
});

test('a follow-up save queued while the refused one was on its way is not sent either', async () => {
  const t = setup();
  let release; const gate = new Promise((r) => { release = r; });
  const current = newerServerCopy(t);
  putReply = () => gate.then(() => ({ ok: false, status: 409, json: async () => ({ current: copy(current) }) }));
  f('persist')(); clearDebounce();
  const first = f('flushSave')();
  f('persist')(); clearDebounce();
  const second = f('flushSave')();        // queued behind the first (savePendingId)
  release();
  assert.equal(await first, false);
  assert.equal(await second, false);
  assert.equal(puts().length, 1);
});

test('a hide-time save that is refused with 409 also locks the window', async () => {
  const t = setup();
  conflictOnce(newerServerCopy(t));
  run(app, 'savePending = true; saveRev = 1');
  f('flushSaveNow')();
  await settle();
  assert.equal(puts().length, 1);
  assert.equal(run(app, 'staleIds.has("t_st1")'), true);
  assert.equal(els.saveStatus.textContent, 'Updated elsewhere — click to reload');
  putReply = () => ({ ok: true, status: 200, json: async () => ({ updated_at: 'S10' }) });
  f('persist')(); clearDebounce();
  await f('flushSave')();
  f('flushSaveNow')(); await settle();
  assert.equal(puts().length, 1);
});

test('Reload applies the server’s copy (dropping this window’s change) and saving works again with the server’s stamp', async () => {
  const t = setup();
  const current = newerServerCopy(t, 'S9');
  conflictOnce(current);
  t.eventCreation.eventName = 'my stale change';
  f('persist')(); clearDebounce();
  await f('flushSave')();
  assert.equal(els.staleBanner.hidden, false, 'the banner shows');
  rows.t_st1 = current;
  putReply = () => ({ ok: true, status: 200, json: async () => ({ updated_at: 'S11' }) });
  await f('reloadStale')();
  assert.equal(run(app, 'state.serverMarker'), 'other-window-score', 'the server copy is on screen');
  assert.equal(run(app, 'state.eventCreation.eventName'), current.data.eventCreation.eventName, 'this window’s change is gone');
  assert.equal(run(app, 'staleIds.has("t_st1")'), false);
  assert.equal(run(app, 'savePending'), false);
  assert.equal(run(app, 'currentStage'), 5, 'the step is kept');
  assert.equal(run(app, 'dbUpdatedAtCache["t_st1"]'), 'S9');
  assert.equal(els.staleBanner.hidden, true, 'the banner goes');
  assert.notEqual(els.saveStatus.textContent, 'Updated elsewhere — click to reload');
  // the next edit is saved, carrying the stamp of the copy now on screen
  run(app, 'state.eventCreation.eventName = "after reload"');
  f('persist')(); clearDebounce();
  assert.equal(await f('flushSave')(), true);
  const last = puts()[puts().length - 1];
  assert.equal(last.body.expectedUpdatedAt, 'S9');
  assert.equal(last.body.data.serverMarker, 'other-window-score');
  assert.equal(els.saveStatus.textContent, 'Saved');
});

test('if the reload’s GET fails, Reload uses the copy the server sent with the 409', async () => {
  const t = setup();
  const current = newerServerCopy(t, 'S9');
  conflictOnce(current);
  f('persist')(); clearDebounce();
  await f('flushSave')();
  app.apiFetch = (url, o) => (o && o.method === 'PUT' ? ORIG.apiFetch(url, o) : Promise.reject(new Error('offline')));
  await f('reloadStale')();
  assert.equal(run(app, 'state.serverMarker'), 'other-window-score');
  assert.equal(run(app, 'staleIds.has("t_st1")'), false);
  assert.equal(run(app, 'dbUpdatedAtCache["t_st1"]'), 'S9');
});

test('a reload that cannot reach the server keeps the lock (and still sends nothing)', async () => {
  setup();
  putReply = () => ({ ok: false, status: 409, json: async () => ({}) });   // a 409 without a copy
  f('persist')(); clearDebounce();
  await f('flushSave')();
  app.apiFetch = () => Promise.reject(new Error('offline'));
  await f('reloadStale')();
  assert.equal(run(app, 'staleIds.has("t_st1")'), true);
  assert.equal(els.saveStatus.textContent, 'Updated elsewhere — click to reload');
  assert.equal(els.staleBanner.hidden, false);
});

test('opening the event again from the list also loads the server copy and ends the lock', async () => {
  const t = setup();
  const current = newerServerCopy(t, 'S9');
  conflictOnce(current);
  f('persist')(); clearDebounce();
  await f('flushSave')();
  rows.t_st1 = current;
  await f('openTournament')('t_st1');
  assert.equal(run(app, 'staleIds.has("t_st1")'), false);
  assert.equal(run(app, 'state.serverMarker'), 'other-window-score');
  assert.equal(run(app, 'lastSaveStatus'), '');
});

test('other events are not affected: a stale event does not stop another one saving', async () => {
  const a = setup('t_A');
  conflictOnce(newerServerCopy(a));
  f('persist')(); clearDebounce();
  await f('flushSave')();
  assert.equal(run(app, 'staleIds.has("t_A")'), true);
  // switch to another event
  const b = tournament('t_B', 'Autumn Cup');
  useState(app, b); run(app, 'tournamentsCache.t_B = state; dbUpdatedAtCache.t_B = "B1"');
  assert.equal(f('staleOpen')(), false);
  f('renderStaleBanner')();
  assert.equal(els.staleBanner.hidden, true, 'no banner for the other event');
  putReply = () => ({ ok: true, status: 200, json: async () => ({ updated_at: 'B2' }) });
  f('persist')(); clearDebounce();
  assert.equal(await f('flushSave')(), true);
  const last = puts()[puts().length - 1];
  assert.equal(last.id, 't_B');
  assert.equal(last.body.expectedUpdatedAt, 'B1');
  // and the close flush for the other event still works
  run(app, 'savePending = true; saveRev = 9');
  f('flushSaveNow')(); await settle();
  assert.equal(puts()[puts().length - 1].id, 't_B');
  assert.equal(puts().filter((c) => c.id === 't_A').length, 1, 'only the one refused PUT for the stale event');
});

test('renaming a stale event sends nothing and explains', async () => {
  const t = setup();
  conflictOnce(newerServerCopy(t));
  f('persist')(); clearDebounce();
  await f('flushSave')();
  f('renameTournament')('t_st1', { stopPropagation() {} });
  assert.deepEqual(modals, ['Updated elsewhere']);
  assert.equal(puts().length, 1);
});

test('finalizing a stale event is refused before anything is sent', async () => {
  const t = setup();
  conflictOnce(newerServerCopy(t));
  f('persist')(); clearDebounce();
  await f('flushSave')();
  run(app, 'lastSaveStatus = ""');   // even if the status was cleared somehow
  app.eventComplete = () => true;
  try { await f('runFinalize')(t); } finally { app.eventComplete = ORIG_EVENT_COMPLETE; }
  assert.deepEqual(modals, ['Not finalized']);
  assert.equal(puts().length, 1);
});

test('a plain network failure still says Couldn’t save, is not a lock, and the retry is sent', async () => {
  setup();
  app.apiFetch = () => Promise.reject(new Error('offline'));
  f('persist')(); clearDebounce();
  assert.equal(await f('flushSave')(), false);
  assert.equal(els.saveStatus.textContent, 'Couldn’t save — click to retry');
  assert.equal(run(app, 'staleIds.size'), 0);
  assert.equal(els.staleBanner.hidden, true);
  // back online: clicking the message retries the save
  app.apiFetch = (url, o) => { calls.push({ method: o.method, id: 't_st1', body: JSON.parse(o.body) }); return Promise.resolve({ ok: true, status: 200, json: async () => ({ updated_at: 'S2' }) }); };
  els.saveStatus.onclick(); await settle();
  assert.equal(puts().length, 1);
  assert.equal(els.saveStatus.textContent, 'Saved');
  // and a server error (500) is not a lock either
  app.apiFetch = () => Promise.resolve({ ok: false, status: 500, json: async () => ({}) });
  f('persist')(); clearDebounce();
  assert.equal(await f('flushSave')(), false);
  assert.equal(run(app, 'staleIds.size'), 0);
});

test('successful saves are unaffected: Saved, the new stamp kept, no banner', async () => {
  setup();
  f('persist')(); clearDebounce();
  assert.equal(await f('flushSave')(), true);
  assert.equal(els.saveStatus.textContent, 'Saved');
  assert.equal(run(app, 'dbUpdatedAtCache["t_st1"]'), 'S2');
  assert.equal(els.staleBanner.hidden, true);
  assert.equal(run(app, 'staleIds.size'), 0);
});

test('the full-page window shows the stale banner and its own save status (it has no sidebar)', async () => {
  const t = setup();
  run(app, 'popoutMode = true');
  delete els.saveStatus;                          // like the pop-out: only its header status is on the page
  conflictOnce(newerServerCopy(t));
  f('persist')(); clearDebounce();
  await f('flushSave')();
  assert.equal(els.staleBanner.hidden, false, 'banner on the page');
  assert.equal(els.popoutSaveStatus.textContent, 'Updated elsewhere — click to reload');
  assert.equal(els.popoutSaveStatus.classes.has('error'), true);
  // and the close flush from the pop-out sends nothing
  run(app, 'savePending = true');
  f('flushSaveNow')(); await settle();
  assert.equal(puts().length, 1);
  run(app, 'popoutMode = false');
});

test('the full-page window’s header has the save status element and its Print button uses the main print path', () => {
  const src = require('./lib/app-source').englishSource('app.html');   // the static markup's words without the i18n step 3 attributes
  const tools = f('popoutToolsHTML')();
  assert.match(tools, /id="popoutSaveStatus"/);
  assert.match(tools, /onclick="popoutPrint\(\)"/);
  assert.doesNotMatch(src, /onclick="window\.print\(\)"/, 'no bare window.print button is left (it printed a blank page)');
  assert.ok(f('FINALIZED_ALLOWED_ACTIONS').includes('popoutPrint'), 'Print still works on a finalized event');
  // the banner and its Reload button are in the page, outside the area a finalized event locks
  assert.match(src, /<div class="stale-banner" id="staleBanner" role="alert" hidden>[\s\S]*?Your last change here was not saved[\s\S]*?onclick="reloadStale\(\)">Reload<\/button>/);
  assert.ok(src.indexOf('id="staleBanner"') < src.indexOf('id="stageArea"'));
});

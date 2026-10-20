const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp, run, useState } = require('./lib/helpers');

// Round 3 of the save-path work (second review), against a fake server with real optimistic concurrency:
//   - a 409 counts as this window's own earlier save ONLY if the server copy is canonically equal to a copy this
//     window sent for that event; any other writer (an Admin's unpublish, an old app version...) locks the window
//   - a switch whose waiting edit cannot be delivered (offline, or refused) is blocked, never silent
//   - the quiet refresh never wipes typed-but-unsaved form values, and skips steps 1-3; it is throttled
//   - hide-time (keepalive) saves: no blank event after "+ New tournament", a timeout, big bodies, resend on return
//   - one entry-limit refusal is not repeated
const app = loadApp();
const f = (n) => run(app, n);
const DOC = app.document;
const tick = () => new Promise((r) => setImmediate(r));
const settle = async () => { for (let i = 0; i < 12; i++) await tick(); };
const copy = (x) => JSON.parse(JSON.stringify(x));
const SRC = fs.readFileSync(path.join(__dirname, '..', 'app.html'), 'utf8');
const ORIG = {};
['apiFetch', 'fetch', 'render', 'renderSavedList', 'openModal', 'showEntryLimitModal'].forEach((n) => { ORIG[n] = run(app, n); });

function makeEl(id) {
  const el = {
    id, textContent: '', innerHTML: '', onclick: null, hidden: true, style: {}, attrs: {}, classes: new Set(), children: [], parentNode: null,
    classList: { toggle(n, on) { if (on) el.classes.add(n); else el.classes.delete(n); }, contains(n) { return el.classes.has(n); }, add(n) { el.classes.add(n); }, remove(n) { el.classes.delete(n); } },
    setAttribute(k, v) { el.attrs[k] = String(v); }, removeAttribute(k) { delete el.attrs[k]; },
    appendChild(c) { el.children.push(c); c.parentNode = el; }, removeChild(c) { el.children = el.children.filter((x) => x !== c); },
    controls: [], querySelectorAll() { return el.controls; }, offsetHeight: 0,
  };
  return el;
}
let dom;
function mountDom() {
  dom = { els: {}, body: makeEl('body'), active: null, created: [] };
  ['saveStatus', 'saveStatusCompact', 'popoutSaveStatus', 'staleBanner', 'printSheets', 'modalBackdrop', 'previewModalBackdrop', 'stageArea'].forEach((id) => { dom.els[id] = makeEl(id); });
  app.document = new Proxy(DOC, {
    get: (t, k) => {
      if (k === 'getElementById') return (id) => dom.els[id] || null;
      if (k === 'body') return dom.body;
      if (k === 'activeElement') return dom.active;
      if (k === 'createElement') return (tag) => { const e = makeEl(tag); dom.created.push(e); return e; };
      return t[k];
    },
  });
}
function tournament(id, name) { const t = f('blankTournament')(); t.id = id; t.eventCreation.saved = true; t.eventCreation.tournamentName = name || id; return t; }

let server, calls, hold, modals, limitModals, offline;
function setup() {
  Object.keys(ORIG).forEach((n) => { app[n] = ORIG[n]; });
  const t = tournament('t_X', 'Spring');
  useState(app, t);
  run(app, 'lockedIds.clear(); staleIds.clear(); staleCurrent = {}; staleReloading = false; lockedReloading = false; tournamentsCache = {}; dbUpdatedAtCache = {}; clearTimeout(saveTimer); saveTimer = null; saveInFlight = false; savePendingId = null; saveWaiters = []; savePending = false; saveRev = 0; if(typeof pendingSaves!=="undefined") pendingSaves.clear(); if(typeof sentCopies!=="undefined") sentCopies.clear(); keepaliveSave = null; try{ KEEPALIVE_WAIT_MS = 8000; }catch(e){} silentRefreshBusy = false; silentRefreshAt = {}; finalizing = false; lastSaveStatus = ""; popoutMode = false; currentStage = 5; adminState.view = null; foreignOpenIds.clear()');
  server = { t_X: { data: copy(t), updated_at: 'S1', n: 1 } };
  run(app, 'tournamentsCache[state.id] = state; dbUpdatedAtCache[state.id] = "S1"');
  app.render = () => {}; app.renderSavedList = () => {};
  modals = []; app.openModal = (o) => { modals.push(o); };
  limitModals = 0; app.showEntryLimitModal = () => { limitModals++; };
  mountDom();
  calls = []; hold = {}; offline = false;
  const handle = async (url, o) => {
    const method = (o && o.method) || 'GET';
    const id = decodeURIComponent(String(url).split('/').pop());
    const body = o && o.body ? JSON.parse(o.body) : null;
    calls.push({ method, id, body, keepalive: !!(o && o.keepalive) });
    if (hold[method]) await hold[method];
    if (offline) throw new Error('offline');
    const row = server[id];
    if (method === 'GET') return row ? { ok: true, status: 200, json: async () => ({ id, data: copy(row.data), updated_at: row.updated_at }) } : { ok: false, status: 404, json: async () => ({}) };
    if (method === 'DELETE') { delete server[id]; return { ok: true, status: 204, json: async () => ({}) }; }
    if (method === 'PUT') {
      if (server.limit && body.data.entriesList && body.data.entriesList.length > server.limit) return { ok: false, status: 403, json: async () => ({ code: 'entry_limit', error: 'limit' }) };
      if (!row && body.expectedUpdatedAt) return { ok: false, status: 404, json: async () => ({ error: 'Not found.' }) };   // like the server: a stamped save never re-creates a deleted event
      if (row && body.expectedUpdatedAt !== row.updated_at) return { ok: false, status: 409, json: async () => ({ current: { id, data: copy(row.data), updated_at: row.updated_at } }) };
      const n = row ? row.n + 1 : 1;
      server[id] = { data: body.data, updated_at: 'S' + n, n };
      return { ok: true, status: 200, json: async () => ({ updated_at: 'S' + n }) };
    }
  };
  app.apiFetch = handle; app.fetch = handle;
  return t;
}
const puts = () => calls.filter((c) => c.method === 'PUT');
const gets = () => calls.filter((c) => c.method === 'GET');
const noDebounce = () => run(app, 'clearTimeout(saveTimer); saveTimer = null');
const bump = (id, change) => { const row = server[id]; const d = copy(row.data); change(d); server[id] = { data: d, updated_at: 'S' + (row.n + 1), n: row.n + 1 }; };
function addB() { const b = tournament('t_B', 'Bee'); server.t_B = { data: copy(b), updated_at: 'B1', n: 1 }; return b; }

/* ---------------- H1: only an exact copy of ours is "our own write" ---------------- */
test('H1: no save token anywhere: nothing extra is stored in the event', async () => {
  setup();
  assert.doesNotMatch(SRC, /saveToken|stampSaveToken|sentSaveTokens|WINDOW_SAVE_ID/);
  run(app, 'state.a = 1'); f('persist')(); noDebounce();
  await f('flushSave')();
  assert.deepEqual(Object.keys(server.t_X.data).filter((k) => /token/i.test(k)), []);
});

test('H1: an Admin unpublish that keeps everything else of this window’s last save (a merge) is a conflict: locked, never overwritten', async () => {
  const t = setup();
  run(app, 'state.published = true; state.listed = true; state.score = 1'); f('persist')(); noDebounce();
  assert.equal(await f('flushSave')(), true);
  // the Admin's action merges two fields into exactly what this window saved, and moves the stamp
  bump('t_X', (d) => { d.published = false; d.listed = false; });
  run(app, 'state.score = 2'); f('persist')(); noDebounce();
  assert.equal(await f('flushSave')(), false);
  assert.equal(run(app, 'staleIds.has("t_X")'), true);
  assert.equal(server.t_X.data.published, false, 'the unpublish survives');
  assert.equal(server.t_X.data.listed, false);
  assert.equal(dom.els.saveStatus.textContent, 'Updated elsewhere — click to reload');
  assert.equal(puts().length, 2, 'no resend');
  void t;
});

test('H1: another window writing an OLDER copy of ours (plus its rename) is a conflict, not "our own write"', async () => {
  setup();
  run(app, 'state.score = 1'); f('persist')(); noDebounce(); await f('flushSave')();      // V1 sent and stored
  const v1 = copy(server.t_X.data);
  run(app, 'state.score = 2'); f('persist')(); noDebounce(); await f('flushSave')();      // V2
  // another tab, still holding V1, renames it (the direct rename path) and saves V1 + the rename
  const n = server.t_X.n + 1; v1.eventCreation.tournamentName = 'Renamed elsewhere';
  server.t_X = { data: v1, updated_at: 'S' + n, n };
  run(app, 'state.score = 3'); f('persist')(); noDebounce();
  assert.equal(await f('flushSave')(), false);
  assert.equal(server.t_X.data.eventCreation.tournamentName, 'Renamed elsewhere', 'the rename survives');
  assert.equal(run(app, 'staleIds.has("t_X")'), true);
});

test('H1: the server copy being exactly one this window sent (its answer was lost) is still recognised: it resends, no lock', async () => {
  setup();
  run(app, 'state.a = 1'); f('persist')(); noDebounce();
  const real = app.apiFetch;
  app.apiFetch = async (url, o) => { await real(url, o); throw new Error('connection reset'); };
  assert.equal(await f('flushSave')(), false);
  app.apiFetch = real;
  run(app, 'state.b = 2'); f('persist')(); noDebounce();
  assert.equal(await f('flushSave')(), true);
  assert.equal(run(app, 'staleIds.has("t_X")'), false);
  assert.equal(server.t_X.data.b, 2);
  // key order on the server does not matter (Postgres jsonb reorders keys)
  const d = server.t_X.data; const reordered = {}; Object.keys(d).reverse().forEach((k) => { reordered[k] = d[k]; });
  assert.equal(f('canonJSON')(reordered), f('canonJSON')(d));
});

test('H1: a copy this window sent for ANOTHER event never counts as its own write for this one', async () => {
  setup();
  const b = addB();
  run(app, 'state.a = 1'); f('persist')(); noDebounce(); await f('flushSave')();
  app.__row = { id: 't_B', data: copy(server.t_X.data), updated_at: 'Z' };
  assert.equal(run(app, 'isOwnWrite("t_B", __row)'), false);
  app.__row = { id: 't_X', data: copy(server.t_X.data), updated_at: 'Z' };
  assert.equal(run(app, 'isOwnWrite("t_X", __row)'), true);
  app.__row = { id: 't_B', data: copy(server.t_X.data), updated_at: 'Z' };
  assert.equal(run(app, 'isOwnWrite("t_X", __row)'), false, 'the returned row names another event');
  void b;
});

/* ---------------- M1 / M2: a switch never silently drops an unsaved edit ---------------- */
test('M1: a waiting edit that cannot be sent (offline) blocks the switch: still on A, A’s edit kept, the status says so', async () => {
  setup(); addB();
  run(app, 'state.lastScore = "A-edit"'); f('persist')();
  offline = true;
  assert.equal(await f('openTournament')('t_B'), false);
  assert.equal(run(app, 'state.id'), 't_X', 'still on A');
  assert.equal(run(app, 'state.lastScore'), 'A-edit');
  assert.equal(gets().length, 0, 'B was not even fetched');
  assert.equal(modals[0].title, 'Last change not saved yet');
  assert.equal(dom.els.saveStatus.textContent, 'Couldn’t save — click to retry');
  // back online: the retry delivers it, and then the switch works
  offline = false;
  dom.els.saveStatus.onclick(); await settle();
  assert.equal(server.t_X.data.lastScore, 'A-edit');
  assert.equal(await f('openTournament')('t_B'), true);
  assert.equal(run(app, 'state.id'), 't_B');
});

test('M1: "Leave without saving" is the only way to drop it, and it really leaves', async () => {
  setup(); addB();
  run(app, 'state.lastScore = "A-edit"'); f('persist')();
  offline = true;
  await f('openTournament')('t_B');
  offline = false;
  assert.equal(modals[0].confirmLabel, 'Leave without saving');
  modals[0].onConfirm(); await settle();
  assert.equal(run(app, 'state.id'), 't_B');
  assert.equal(run(app, 'savePending'), false);
  assert.equal(server.t_X.data.lastScore, undefined);
});

test('M1: "+ New tournament" is blocked the same way while the edit cannot be sent', async () => {
  setup();
  run(app, 'state.lastScore = "A-edit"'); f('persist')();
  offline = true;
  await f('newTournament')();
  assert.equal(run(app, 'state.id'), 't_X');
  assert.equal(modals[0].title, 'Last change not saved yet');
});

test('M2: a waiting edit refused during the switch (changed elsewhere) keeps the window on A with the banner; B is not loaded', async () => {
  setup(); addB();
  bump('t_X', (d) => { d.other = 1; });
  run(app, 'state.lastScore = "A-edit"'); f('persist')();
  assert.equal(await f('openTournament')('t_B'), false);
  assert.equal(run(app, 'state.id'), 't_X');
  assert.equal(gets().length, 0);
  assert.equal(run(app, 'staleIds.has("t_X")'), true);
  assert.equal(dom.els.staleBanner.hidden, false, 'the banner is on A, where it belongs');
  assert.equal(modals[0].title, 'Updated elsewhere');
  // leaving anyway: B is healthy, with no leftover "Updated elsewhere"
  modals[0].onConfirm(); await settle();
  assert.equal(run(app, 'state.id'), 't_B');
  assert.notEqual(run(app, 'lastSaveStatus'), 'error');
  assert.equal(dom.els.staleBanner.hidden, true);
});

test('M1: the pending edit belongs to its event: a save sends THAT event even if another one is on screen', async () => {
  setup(); const b = addB();
  run(app, 'state.lastScore = "A-edit"'); f('persist')(); noDebounce();
  useState(app, b); run(app, 'tournamentsCache.t_B = state; dbUpdatedAtCache.t_B = "B1"');   // B on screen, A still waiting
  assert.equal(await f('flushSave')(), true);
  assert.deepEqual(puts().map((c) => c.id), ['t_X']);
  assert.equal(server.t_X.data.lastScore, 'A-edit');
  // an edit in B is kept separately and sent too
  run(app, 'state.bScore = 1'); f('persist')(); noDebounce();
  assert.equal(await f('flushSave')(), true);
  assert.equal(server.t_B.data.bScore, 1);
});

/* ---------------- M3 / L5: quiet refresh ---------------- */
function readyForRefresh() { setup(); bump('t_X', (d) => { d.other = 'newer'; }); }
test('M3: a box changed but not yet saved (even without focus) blocks the quiet refresh', async () => {
  for (const ctl of [
    { tagName: 'INPUT', type: 'text', value: 'Draft evnt typed', defaultValue: 'Draft event' },
    { tagName: 'TEXTAREA', value: 'new rules', defaultValue: '' },
    { tagName: 'INPUT', type: 'checkbox', checked: true, defaultChecked: false },
    { tagName: 'SELECT', options: [{ selected: false, defaultSelected: true }, { selected: true, defaultSelected: false }] },
  ]) {
    readyForRefresh();
    dom.els.stageArea.controls = [{ tagName: 'INPUT', type: 'text', value: 'same', defaultValue: 'same' }, ctl];
    assert.equal(await f('silentRefresh')(), false, ctl.tagName + ' ' + (ctl.type || ''));
    assert.equal(gets().length, 0);
  }
  // all boxes as drawn: the refresh runs
  readyForRefresh();
  dom.els.stageArea.controls = [{ tagName: 'INPUT', type: 'text', value: 'same', defaultValue: 'same' }, { tagName: 'INPUT', type: 'checkbox', checked: true, defaultChecked: true }];
  assert.equal(await f('silentRefresh')(), true);
  assert.equal(run(app, 'state.other'), 'newer');
});

test('M3: never on steps 1-3 (their forms keep typing until Save)', async () => {
  for (const s of [1, 2, 3]) {
    readyForRefresh(); run(app, 'currentStage = ' + s);
    assert.equal(await f('silentRefresh')(), false, 'step ' + s);
    assert.equal(gets().length, 0);
  }
  for (const s of [4, 5, 6, 7]) {
    readyForRefresh(); run(app, 'currentStage = ' + s);
    assert.equal(await f('silentRefresh')(), true, 'step ' + s);
  }
});

test('L5: the quiet refresh asks the server at most once every 20 seconds per event', async () => {
  readyForRefresh();
  assert.equal(await f('silentRefresh')(), true);
  bump('t_X', (d) => { d.other = 'newest'; });
  assert.equal(await f('silentRefresh')(), false);
  assert.equal(gets().length, 1, 'no second request');
  run(app, 'silentRefreshAt.t_X = Date.now() - 21000');
  assert.equal(await f('silentRefresh')(), true);
  assert.equal(run(app, 'state.other'), 'newest');
  // a refresh that is blocked does not use up the allowance
  readyForRefresh(); run(app, 'currentStage = 2');
  await f('silentRefresh')(); run(app, 'currentStage = 5');
  assert.equal(await f('silentRefresh')(), true);
});

/* ---------------- L1, L3, L4: hide-time saves ---------------- */
test('L1: a hide-time save still on its way, then "+ New tournament": the edit is delivered once and the blank event is never uploaded', async () => {
  setup();
  run(app, 'state.a = 1'); f('persist')(); noDebounce();
  let release; hold.PUT = new Promise((r) => { release = r; });
  f('flushSaveNow')();
  const p = f('newTournament')();
  await tick(); release(); hold.PUT = null;
  await p; await settle();
  f('flushSaveNow')(); await settle();
  assert.deepEqual(puts().map((c) => c.id + (c.keepalive ? '(ka)' : '')), ['t_X(ka)']);
  assert.equal(server.t_X.data.a, 1);
  assert.notEqual(run(app, 'state.id'), 't_X', 'the new event is open');
});

test('L3: a save waiting behind a hung hide-time save says "Saving…", gives up waiting after the timeout, and only says Saved when it worked', async () => {
  setup();
  run(app, 'KEEPALIVE_WAIT_MS = 40');
  run(app, 'state.a = 1'); f('persist')(); noDebounce();
  hold.PUT = new Promise(() => {});                 // the keepalive never answers
  f('flushSaveNow')();
  hold.PUT = null;
  run(app, 'state.b = 2'); f('persist')(); noDebounce();
  const p = f('flushSave')();
  await tick();
  assert.equal(dom.els.saveStatus.textContent, 'Saving…');
  // our hung keepalive actually reached the server: the normal save then sees our own copy there and resends
  server.t_X = { data: copy(calls[0].body.data), updated_at: 'S2', n: 2 };
  assert.equal(await p, true);
  assert.equal(server.t_X.data.b, 2);
  assert.equal(run(app, 'staleIds.has("t_X")'), false);
  assert.equal(dom.els.saveStatus.textContent, 'Saved');
});

test('L4: a copy too big for a keepalive request is sent as a normal save, and an edit left unsaved is sent again when the tab comes back', async () => {
  setup();
  run(app, 'state.logoish = "x".repeat(70000)'); f('persist')(); noDebounce();
  f('flushSaveNow')(); await settle();
  assert.equal(puts().length, 1);
  assert.equal(puts()[0].keepalive, false, 'not a keepalive (browsers refuse bodies over 64KB)');
  assert.equal(run(app, 'savePending'), false);
  // a hide-time save that failed (offline): back in the tab, it is sent again and the refresh is not stuck
  run(app, 'state.c = 3'); f('persist')(); noDebounce();
  run(app, 'state.logoish = ""');
  offline = true; f('flushSaveNow')(); await settle(); offline = false;
  assert.equal(run(app, 'savePending'), true);
  assert.equal(f('silentRefreshBlocked')(), 'saving');
  await f('resumeSaving')(); await settle();
  assert.equal(server.t_X.data.c, 3);
  assert.equal(run(app, 'savePending'), false);
  assert.equal(f('silentRefreshBlocked')(), '');
});

test('mutation guard: a second hide-time flush while the first is on its way sends nothing (hiding then closing fires both)', async () => {
  setup();
  run(app, 'state.a = 1'); f('persist')(); noDebounce();
  let release; hold.PUT = new Promise((r) => { release = r; });
  f('flushSaveNow')(); f('flushSaveNow')();
  release(); hold.PUT = null; await settle();
  assert.equal(puts().length, 1);
  assert.equal(run(app, 'staleIds.has("t_X")'), false);
});

test('mutation guard: deleting the open event discards its waiting edit before the delete is sent (a hide in between cannot re-create it)', async () => {
  setup(); addB();
  run(app, 'tournamentsCache.t_B = ' + JSON.stringify(server.t_B.data) + '; dbUpdatedAtCache.t_B = "B1"');
  run(app, 'state.x = 1'); f('persist')();
  let release; hold.DELETE = new Promise((r) => { release = r; });
  const p = f('performDelete')('t_X');
  await tick();
  f('flushSaveNow')();                      // the tab is hidden while the delete is on its way
  release(); hold.DELETE = null; await p; await settle();
  await new Promise((r) => setTimeout(r, 600)); await settle();
  assert.equal(puts().filter((c) => c.id === 't_X').length, 0);
  assert.equal(server.t_X, undefined);
});

/* ---------------- L2: entry limit ---------------- */
test('L2: one entry-limit refusal is one refused save and one message, not a loop', async () => {
  setup();
  server.limit = 2;
  run(app, 'state.entriesList = [{id:"e1",name:"a"},{id:"e2",name:"b"},{id:"e3",name:"c"}]'); f('persist')(); noDebounce();
  assert.equal(await f('flushSave')(), false);
  await settle(); await new Promise((r) => setTimeout(r, 600)); await settle();
  assert.equal(puts().length, 1);
  assert.equal(limitModals, 1);
  assert.equal(run(app, 'savePending'), false, 'not retried until the user changes something');
  assert.equal(run(app, 'state.entriesList.some(e=>e.id==="e3")'), false, 'the saved copy is back on screen');
});

test('L2: an edit over the entry limit made just before a switch is dropped with its own message, and the switch goes ahead', async () => {
  setup(); addB();
  server.limit = 2;
  run(app, 'state.entriesList = [{id:"e1",name:"a"},{id:"e2",name:"b"},{id:"e3",name:"c"}]'); f('persist')();
  assert.equal(await f('openTournament')('t_B'), true);
  await settle();
  assert.equal(limitModals, 1);
  assert.equal(modals.filter((m) => m.title === 'Last change not saved yet').length, 0, 'not mistaken for a connection problem');
  assert.equal(puts().length, 1);
});

test('defence: an event that is locked as stale is never the one a save picks, even if it is still listed as waiting', async () => {
  setup(); const b = addB();
  run(app, 'pendingSaves.set("t_X", 1); staleIds.add("t_X")');
  useState(app, b); run(app, 'tournamentsCache.t_B = state; dbUpdatedAtCache.t_B = "B1"; state.bScore = 1'); f('persist')(); noDebounce();
  assert.equal(await f('flushSave')(), true);
  assert.deepEqual(puts().map((c) => c.id), ['t_B']);
});

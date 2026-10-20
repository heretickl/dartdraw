const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp, run, useState } = require('./lib/helpers');

// Round 4 of the save-path work (third review): leaving the page / logging out / being signed out with an unsaved
// change, windows telling each other about saves, deleted-elsewhere events, and the remaining races. The harness is
// the same as tests/save-round3.test.js (a fake server with real optimistic concurrency).
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

// ---------------------------------------------------------------------------------------------------------------
// Round 4 (third review). Same harness as tests/save-round3.test.js.
const resetR4 = () => run(app, 'goneIds.clear(); lastSettleId = null; switchSettling = false; lastOpenBlocked = false; refreshClock = ()=>Date.now(); saveChannel = null');

/* ---------------- M1: leaving the page, logging out, being signed out ---------------- */
test('M1: leaving the page warns while a change is unsaved, failing or on its way; not when nothing (or only a stale change) is waiting', () => {
  setup(); resetR4();
  const ev = () => { const e = { prevented: false, returnValue: undefined, preventDefault() { this.prevented = true; } }; return e; };
  let e = ev(); f('onBeforeUnload')(e);
  assert.equal(e.prevented, false, 'nothing waiting: no warning');
  run(app, 'state.a = 1'); f('persist')();
  hold.PUT = new Promise(() => {});                              // the hide-time save will be on its way
  e = ev(); f('onBeforeUnload')(e);
  assert.equal(e.prevented, true); assert.equal(e.returnValue, '');
  assert.equal(puts().filter((c) => c.keepalive).length, 1, 'and the hide-time save was tried');
  // a change that can never be saved does not warn
  setup(); resetR4();
  run(app, 'state.a = 1'); f('persist')(); run(app, 'staleIds.add("t_X")');
  e = ev(); f('onBeforeUnload')(e);
  assert.equal(e.prevented, false);
});

test('M1: Log out first sends a waiting change; if it cannot be sent it asks (and stays signed in) until you choose to leave', async () => {
  setup(); resetR4();
  const replaced = []; const WIN = app.window;
  app.window = new Proxy(WIN, { get: (t, k) => (k === 'location' ? { replace: (u) => replaced.push(u) } : t[k]) });
  try {
    run(app, 'state.a = 1'); f('persist')();
    await f('logout')();
    assert.equal(server.t_X.data.a, 1, 'the change was saved before signing out');
    assert.deepEqual(replaced, ['/?login=1']);
    replaced.length = 0;
    run(app, 'state.b = 2'); f('persist')();
    offline = true;
    await f('logout')();
    assert.deepEqual(replaced, [], 'still signed in');
    assert.equal(calls.filter((c) => c.method === 'POST').length, 1, 'only the first logout reached the server');
    assert.equal(modals[modals.length - 1].title, 'Last change not saved yet');
    offline = false;
    modals[modals.length - 1].onConfirm(); await settle();
    assert.deepEqual(replaced, ['/?login=1'], 'Leave without saving logs out');
  } finally { app.window = WIN; }
});

function storageStub() { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; }, m }; }
test('M1: signed out mid-save (401): the unsent copy is kept, and after signing in again it is offered back and restored with its stamp', async () => {
  setup(); resetR4();
  const store = storageStub(); const replaced = []; const WIN = app.window;
  app.window = new Proxy(WIN, { get: (t, k) => (k === 'location' ? { replace: (u) => replaced.push(u) } : k === 'localStorage' ? store : t[k]) });
  try {
    run(app, 'currentOrganizer = { id: "org1", name: "O" }');
    app.apiFetch = ORIG.apiFetch;                                   // the real one: it handles the 401
    app.fetch = async (url, o) => { calls.push({ method: (o && o.method) || 'GET', id: 't_X' }); return { ok: false, status: 401, json: async () => ({}) }; };
    run(app, 'state.score = "typed before the session ended"'); f('persist')(); noDebounce();
    assert.equal(await f('flushSave')(), false);
    assert.deepEqual(replaced, ['/?login=1']);
    const kept = JSON.parse(store.m['dartdraw.unsavedChanges']);
    assert.equal(kept[0].id, 't_X'); assert.equal(kept[0].owner, 'org1'); assert.equal(kept[0].expectedUpdatedAt, 'S1');
    assert.equal(kept[0].data.score, 'typed before the session ended');
    // next page load, signed in again: the list is loaded from the server (which never got the change)
    setup(); resetR4();
    run(app, 'currentOrganizer = { id: "org1", name: "O" }; tournamentsCache.t_X = ' + JSON.stringify(server.t_X.data) + '; dbUpdatedAtCache.t_X = "S1"');
    assert.equal(await f('offerRecoveredChanges')(), 'offered');
    assert.equal(store.m['dartdraw.unsavedChanges'], undefined, 'offered once only');
    assert.equal(modals[0].title, 'Restore your unsaved change?');
    modals[0].onConfirm(); await settle();
    assert.equal(server.t_X.data.score, 'typed before the session ended');
    assert.equal(puts()[0].body.expectedUpdatedAt, 'S1', 'restored with the stamp it was based on');
  } finally { app.window = WIN; run(app, 'currentOrganizer = null'); }
});

test('M1: a kept copy is not restored when the event changed since, nor offered to another organiser, nor when it was saved after all', async () => {
  const WIN = app.window;
  const put = (store, data, stamp, owner) => store.setItem('dartdraw.unsavedChanges', JSON.stringify([{ owner: owner || 'org1', id: 't_X', name: 'Spring', data, expectedUpdatedAt: stamp }]));
  for (const c of ['changed', 'other organiser', 'already saved']) {
    setup(); resetR4();
    const store = storageStub();
    app.window = new Proxy(WIN, { get: (t, k) => (k === 'localStorage' ? store : t[k]) });
    try {
      run(app, 'currentOrganizer = { id: "org1" }; tournamentsCache.t_X = ' + JSON.stringify(server.t_X.data) + '; dbUpdatedAtCache.t_X = "S1"');
      const d = copy(server.t_X.data); d.score = 'kept';
      if (c === 'changed') put(store, d, 'S0');
      if (c === 'other organiser') put(store, d, 'S1', 'org2');
      if (c === 'already saved') put(store, copy(server.t_X.data), 'S0');
      const r = await f('offerRecoveredChanges')();
      assert.equal(r, c === 'changed' ? 'changed since' : c === 'other organiser' ? 'none' : 'already saved', c);
      assert.equal(puts().length, 0, c + ': nothing sent');
      if (c === 'changed') assert.equal(modals[0].title, 'Unsaved change not restored');
    } finally { app.window = WIN; run(app, 'currentOrganizer = null'); }
  }
});

/* ---------------- M2: windows tell each other; a short throttle ---------------- */
test('M2: a save is announced to the other windows; an announcement of a newer copy clears the throttle and refreshes the active window', async () => {
  setup(); resetR4();
  const posted = []; run(app, 'saveChannel = { postMessage: (m)=>__posted.push(m) }'); app.__posted = posted;
  run(app, 'state.a = 1'); f('persist')(); noDebounce(); await f('flushSave')();
  assert.deepEqual(copy(posted), [{ type: 'saved', id: 't_X', updated_at: 'S2' }]);
  // another window then saves; this window had checked a moment ago (throttled)
  bump('t_X', (d) => { d.other = 'from the full-page window'; });
  run(app, 'silentRefreshAt.t_X = refreshClock()');
  app.document = new Proxy(app.document, { get: (t, k) => (k === 'hasFocus' ? () => true : k === 'visibilityState' ? 'visible' : t[k]) });
  f('onOtherWindowSaved')({ type: 'saved', id: 't_X', updated_at: server.t_X.updated_at });
  await settle();
  assert.equal(run(app, 'state.other'), 'from the full-page window', 'refreshed straight away, despite the throttle');
  // an announcement of the copy this window already has does nothing
  const getsBefore = gets().length;
  f('onOtherWindowSaved')({ type: 'saved', id: 't_X', updated_at: run(app, 'dbUpdatedAtCache.t_X') });
  await settle();
  assert.equal(gets().length, getsBefore);
});

test('M2: a window that is not active only forgets its throttle, and refreshes on its next focus', async () => {
  setup(); resetR4();
  bump('t_X', (d) => { d.other = 'newer'; });
  run(app, 'silentRefreshAt.t_X = refreshClock()');
  app.document = new Proxy(app.document, { get: (t, k) => (k === 'hasFocus' ? () => false : t[k]) });
  f('onOtherWindowSaved')({ type: 'saved', id: 't_X', updated_at: 'S9' });
  await settle();
  assert.equal(gets().length, 0);
  assert.equal(run(app, '"t_X" in silentRefreshAt'), false);
  assert.equal(await f('silentRefresh')(), true);
});

test('M2: the plain throttle is 5 seconds (an injectable clock)', async () => {
  setup(); resetR4();
  let now = 1000000; app.__now = () => now; run(app, 'refreshClock = ()=>__now()');
  bump('t_X', (d) => { d.v = 1; });
  assert.equal(await f('silentRefresh')(), true);
  bump('t_X', (d) => { d.v = 2; });
  now += 4999;
  assert.equal(await f('silentRefresh')(), false, 'within 5s');
  now += 2;
  assert.equal(await f('silentRefresh')(), true, 'after 5s');
  assert.equal(run(app, 'SILENT_REFRESH_MIN_MS'), 5000);
});

/* ---------------- M3: no follow-up without an edit; deleted elsewhere ---------------- */
test('M3: a follow-up queued behind a save in flight is not sent once its edit is discarded (delete cannot be undone by it)', async () => {
  setup(); resetR4(); addB();
  run(app, 'tournamentsCache.t_B = ' + JSON.stringify(server.t_B.data) + '; dbUpdatedAtCache.t_B = "B1"');
  run(app, 'state.a = 1'); f('persist')(); noDebounce();
  let release; hold.PUT = new Promise((r) => { release = r; });
  const first = f('flushSave')();
  run(app, 'state.a = 2'); f('persist')(); noDebounce();
  const second = f('flushSave')();                 // queued behind the first
  await tick();
  hold.PUT = null;
  let releaseDel; hold.DELETE = new Promise((r) => { releaseDel = r; });
  const del = f('performDelete')('t_X');           // discards the waiting edit; the DELETE is on its way (event still open)
  await tick(); release();                         // the first save answers while the delete is still out
  await first; await second; await settle();
  assert.equal(puts().filter((c) => c.id === 't_X').length, 1, 'no follow-up for the discarded edit');
  hold.DELETE = null; releaseDel(); await del; await settle();
  assert.equal(server.t_X, undefined, 'still deleted');
  assert.equal(puts().filter((c) => c.id === 't_X').length, 1, 'only the save that was already on its way');
});

test('M3: a save answered 404 (deleted elsewhere) is never retried, says so, and does not block leaving', async () => {
  setup(); resetR4(); addB();
  delete server.t_X;
  const real = app.apiFetch;
  app.apiFetch = async (url, o) => { if (o && o.method === 'PUT' && /t_X$/.test(url)) { calls.push({ method: 'PUT', id: 't_X', body: JSON.parse(o.body) }); return { ok: false, status: 404, json: async () => ({ error: 'Not found.' }) }; } return real(url, o); };
  run(app, 'state.a = 1'); f('persist')(); noDebounce();
  assert.equal(await f('flushSave')(), false);
  assert.equal(dom.els.saveStatus.textContent, 'Deleted elsewhere — this event is no longer saved');
  run(app, 'state.a = 2'); f('persist')();
  assert.equal(run(app, 'saveTimer'), null, 'nothing scheduled');
  f('flushSaveNow')(); await settle();
  assert.equal(puts().length, 1);
  assert.equal(await f('openTournament')('t_B'), true, 'leaving is not blocked');
});

/* ---------------- L1: Admin opening another organiser's event while blocked ---------------- */
test('L1: an Admin opening an event while a change is waiting gets the right message, keeps the foreign marks, and Leave opens it properly', async () => {
  setup(); resetR4();
  const other = tournament('t_F', 'Their event'); server.t_F = { data: copy(other), updated_at: 'F1', n: 1 };
  run(app, 'currentOrganizer = { id: "adm", role: "admin" }; adminState.events = { events: [{ id: "t_F", tournamentName: "Their event", owner: { id: "o9", name: "Zed", email: "z@x" } }], total: 1 }');
  try {
    run(app, 'state.a = 1'); f('persist')();
    offline = true;
    assert.equal(await f('adminOpenEvent')('t_F'), false);
    assert.equal(modals.map((m) => m.title).join('|'), 'Last change not saved yet', 'not "Could not open that event"');
    assert.equal(run(app, 'foreignOpenIds.has("t_F")'), false, 'marks put back as they were');
    offline = false;
    modals[0].onConfirm(); await settle();
    assert.equal(run(app, 'state.id'), 't_F');
    assert.equal(run(app, 'foreignOpenIds.has("t_F")'), true, 'opened as someone else’s event');
  } finally { run(app, 'currentOrganizer = null; foreignOpenIds.clear(); adminEditing = null'); }
});

/* ---------------- L2: the message names the event whose change is waiting ---------------- */
test('L2: the blocked message names the event whose change is waiting, not the one on screen', async () => {
  setup(); resetR4(); const b = addB();
  run(app, 'state.a = 1'); f('persist')(); noDebounce();      // a change to Spring is waiting
  useState(app, b); run(app, 'tournamentsCache.t_B = state; dbUpdatedAtCache.t_B = "B1"');   // Bee on screen
  offline = true;
  await f('openTournament')('t_C');
  assert.match(modals[0].body, /Your last change to Spring has not been saved yet/);
  assert.doesNotMatch(modals[0].body, /Bee/);
});

/* ---------------- L3: a refusal during a switch does not reload the old event ---------------- */
test('L3: an entry-limit refusal while switching leaves you on the new event (the old one is only refreshed in the list)', async () => {
  setup(); resetR4(); addB();
  server.limit = 2;
  run(app, 'state.entriesList = [{id:"e1"},{id:"e2"},{id:"e3"}]'); f('persist')();
  const loaded = []; const orig = run(app, 'loadTournamentRow'); app.loadTournamentRow = (id, row) => { loaded.push(id); return orig(id, row); };
  try {
    assert.equal(await f('openTournament')('t_B'), true);
    await settle();
    assert.equal(run(app, 'state.id'), 't_B');
    assert.deepEqual(loaded, ['t_B'], 'the old event was never loaded back onto the screen');
  } finally { app.loadTournamentRow = orig; }
});

/* ---------------- L4: a hung hide-time save is waited for once ---------------- */
test('L4: after one timeout a hung hide-time save is given up on: later saves do not wait for it, and the refresh is not stuck', async () => {
  setup(); resetR4();
  run(app, 'KEEPALIVE_WAIT_MS = 40');
  run(app, 'state.a = 1'); f('persist')(); noDebounce();
  hold.PUT = new Promise(() => {});
  f('flushSaveNow')();
  hold.PUT = null;
  run(app, 'state.b = 2'); f('persist')(); noDebounce();
  assert.equal(await f('flushSave')(), true);
  assert.equal(run(app, 'keepaliveSave'), null);
  run(app, 'state.c = 3'); f('persist')(); noDebounce();
  const t0 = Date.now(); await f('flushSave')();
  assert.ok(Date.now() - t0 < 35, 'the next save did not wait again');
  assert.equal(f('silentRefreshBlocked')(), '');
});

/* ---------------- L5: rename racing an open ---------------- */
test('L5: renaming an event (not open) while it is being opened from an older copy: the rename survives the next save', async () => {
  setup(); resetR4(); addB();
  run(app, 'tournamentsCache.t_B = ' + JSON.stringify(server.t_B.data) + '; dbUpdatedAtCache.t_B = "B1"');
  app.document = new Proxy(app.document, { get: (tt, k) => (k === 'getElementById' ? (id) => (id === 'renameInput' ? { value: 'Bee renamed' } : dom.els[id] || null) : tt[k]) });
  let release; hold.PUT = new Promise((r) => { release = r; });
  f('renameTournament')('t_B', { stopPropagation() {} });
  modals[0].onConfirm(); await tick();
  hold.PUT = null;
  // the user opens B; its GET is answered before the rename PUT lands (old name, old stamp)
  const getRow = { id: 't_B', data: copy(server.t_B.data), updated_at: server.t_B.updated_at };
  run(app, 'loadTournamentRow')('t_B', copy(getRow));
  release(); await settle();
  assert.equal(server.t_B.data.eventCreation.tournamentName, 'Bee renamed');
  assert.equal(run(app, 'state.eventCreation.tournamentName'), 'Bee renamed', 'the open copy shows the rename');
  run(app, 'state.score = 1'); f('persist')(); noDebounce();
  assert.equal(await f('flushSave')(), true);
  assert.equal(server.t_B.data.eventCreation.tournamentName, 'Bee renamed', 'not written over');
  assert.equal(server.t_B.data.score, 1);
  assert.equal(run(app, 'staleIds.has("t_B")'), false);
});

/* ---------------- L7: the keepalive limit counts bytes ---------------- */
test('L7: the 60KB keepalive limit counts UTF-8 bytes (accented names count double), and stays under the browsers’ 64KB', () => {
  assert.equal(f('utf8Bytes')('abc'), 3);
  assert.equal(f('utf8Bytes')('é'), 2);
  assert.equal(f('utf8Bytes')('名'), 3);
  assert.equal(f('utf8Bytes')('🎯'), 4);
  for (const [label, filler] of [['accents', 'é'.repeat(32000)], ['ascii just over the limit', 'x'.repeat(61000)]]) {
    setup(); resetR4();
    app.__filler = filler; run(app, 'state.notes = __filler'); f('persist')(); noDebounce();
    f('flushSaveNow')();
    assert.equal(puts()[0].keepalive, false, label + ': sent as a normal save');
  }
  setup(); resetR4();
  run(app, 'state.notes = "x".repeat(50000)'); f('persist')(); noDebounce();
  f('flushSaveNow')();
  assert.equal(puts()[0].keepalive, true, 'a normal-sized copy is a keepalive');
});

/* ---------------- L9: the real mutation gaps ---------------- */
test('L9: each event keeps its own ring of sent copies (another event’s saves never push it out or count for it)', async () => {
  setup(); resetR4(); const b = addB();
  run(app, 'state.a = 1'); f('persist')(); noDebounce(); await f('flushSave')();
  const v1 = copy(server.t_X.data);
  useState(app, b); run(app, 'tournamentsCache.t_B = state; dbUpdatedAtCache.t_B = "B1"');
  for (let i = 0; i < 3; i++) { run(app, 'state.n = ' + i); f('persist')(); noDebounce(); await f('flushSave')(); }
  app.__row = { data: v1, updated_at: 'Z' };
  assert.equal(run(app, 'isOwnWrite("t_X", __row)'), true, 'A’s copy is still remembered');
  app.__row = { data: copy(server.t_B.data), updated_at: 'Z' };
  assert.equal(run(app, 'isOwnWrite("t_X", __row)'), false, 'B’s copy never counts for A');
});

test('L9: a hide-time save refused with 409 because this window’s own earlier save landed is recognised: no lock, stamp taken', async () => {
  setup(); resetR4();
  run(app, 'state.a = 1'); f('persist')(); noDebounce();
  const real = app.apiFetch;
  app.apiFetch = async (url, o) => { await real(url, o); throw new Error('answer lost'); };
  await f('flushSave')();                         // stored on the server, answer lost: stamp still S1
  app.apiFetch = real;
  run(app, 'state.b = 2'); f('persist')(); noDebounce();
  f('flushSaveNow')(); await settle();             // keepalive with S1: 409 with our own copy
  assert.equal(run(app, 'staleIds.has("t_X")'), false);
  assert.equal(run(app, 'dbUpdatedAtCache.t_X'), 'S2');
  assert.equal(run(app, 'savePending'), true, 'the edit is still marked unsaved, the next save sends it');
  assert.equal(await f('flushSave')(), true);
  assert.equal(server.t_X.data.b, 2);
});

test('L9: loading an event drops its own waiting edit (the server copy replaces it); another event’s stays', () => {
  setup(); resetR4(); const b = addB();
  run(app, 'state.a = 1'); f('persist')(); noDebounce();
  run(app, 'loadTournamentRow')('t_X', { data: copy(server.t_X.data), updated_at: 'S1' });
  assert.equal(run(app, 'pendingSaves.has("t_X")'), false);
  assert.equal(run(app, 'savePending'), false);
  run(app, 'state.a = 2'); f('persist')(); noDebounce();
  run(app, 'loadTournamentRow')('t_B', copy({ data: b, updated_at: 'B1' }));
  assert.equal(run(app, 'pendingSaves.has("t_X")'), true);
});

test('own-write resend is bounded: a server that keeps answering with our own copy gets exactly two PUTs, then the window locks', async () => {
  setup(); resetR4();
  run(app, 'state.a = 1'); f('persist')(); noDebounce();
  const real = app.apiFetch;
  app.apiFetch = async (url, o) => { await real(url, o); throw new Error('answer lost'); };
  await f('flushSave')();
  // from now on every PUT is refused with the copy stored above (it never accepts)
  const stored = copy(server.t_X.data);
  app.apiFetch = async (url, o) => { calls.push({ method: o.method, id: 't_X', body: JSON.parse(o.body) }); return { ok: false, status: 409, json: async () => ({ current: { id: 't_X', data: copy(stored), updated_at: 'S' + (calls.length + 5) } }) }; };
  const before = puts().length;
  run(app, 'state.b = 2'); f('persist')(); noDebounce();
  assert.equal(await f('flushSave')(), false);
  assert.equal(puts().length - before, 2);
  assert.equal(run(app, 'staleIds.has("t_X")'), true);
});

test('the quiet refresh treats a step area it cannot read as having unsaved typing', async () => {
  setup(); resetR4(); bump('t_X', (d) => { d.v = 1; });
  dom.els.stageArea.querySelectorAll = () => { throw new Error('cannot read'); };
  assert.equal(f('silentRefreshBlocked')(), 'unsaved typing');
});

test('the save timings are the documented ones (read from a freshly loaded app, before any test changes them)', () => {
  const fresh = loadApp();
  assert.equal(run(fresh, 'KEEPALIVE_WAIT_MS'), 8000);
  assert.equal(run(fresh, 'KEEPALIVE_MAX_BYTES'), 60000);
  assert.equal(run(fresh, 'SILENT_REFRESH_MIN_MS'), 5000);
  setup();
  assert.equal(run(app, 'KEEPALIVE_MAX_BYTES'), 60000);
  assert.equal(run(app, 'SILENT_REFRESH_MIN_MS'), 5000);
});

test('a hide-time save that carried one event’s change does not stop another event’s waiting change from being sent', async () => {
  setup(); resetR4(); const b = addB();
  run(app, 'state.a = 1'); f('persist')(); noDebounce();                       // A waiting
  useState(app, b); run(app, 'tournamentsCache.t_B = state; dbUpdatedAtCache.t_B = "B1"; state.bScore = 1'); f('persist')(); noDebounce();   // B waiting too
  let release; hold.PUT = new Promise((r) => { release = r; });
  f('flushSaveNow')();                                                        // carries A (the oldest)
  hold.PUT = null;
  const p = f('flushSave')();
  await tick(); release();
  assert.equal(await p, true);
  await settle();
  assert.equal(server.t_X.data.a, 1);
  assert.equal(server.t_B.data.bScore, 1, 'B was sent as well');
  assert.equal(run(app, 'savePending'), false);
});

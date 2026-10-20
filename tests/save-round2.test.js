const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, useState } = require('./lib/helpers');

// Round 2 of the stale-window work, against a fake server with real optimistic concurrency (a PUT whose
// expectedUpdatedAt is not the stored stamp gets 409 + the current row):
//   - renaming the open event goes through the guarded save path (never adopts a newer stamp for an open copy)
//   - a slow hide-time (keepalive) save and the next normal save do not make the window falsely "stale"
//   - switching events, or "+ New tournament", within the 500ms save delay sends the edit for ITS event,
//     and never uploads a blank event
//   - a 409 for an event already left does not flag the open one
//   - silent refresh when a window comes back into view
//   - the full-page window's Print, by behaviour
const app = loadApp();
const f = (n) => run(app, n);
const DOC = app.document;
const tick = () => new Promise((r) => setImmediate(r));
const settle = async () => { for (let i = 0; i < 10; i++) await tick(); };
const copy = (x) => JSON.parse(JSON.stringify(x));
const ORIG = {};
['apiFetch', 'fetch', 'render', 'renderSavedList', 'openModal', 'openTournament', 'renameTournament', 'duplicateTournament', 'deleteTournament', 'openChangePassword', 'goStage', 'setTimeout'].forEach((n) => { ORIG[n] = run(app, n); });

function makeEl(id) {
  const el = {
    id, textContent: '', innerHTML: '', onclick: null, hidden: true, style: {}, attrs: {}, classes: new Set(), children: [], parentNode: null, focused: 0,
    classList: { toggle(n, on) { if (on) el.classes.add(n); else el.classes.delete(n); }, contains(n) { return el.classes.has(n); }, add(n) { el.classes.add(n); }, remove(n) { el.classes.delete(n); } },
    setAttribute(k, v) { el.attrs[k] = String(v); }, removeAttribute(k) { delete el.attrs[k]; }, getAttribute(k) { return k in el.attrs ? el.attrs[k] : null; },
    appendChild(c) { el.children.push(c); c.parentNode = el; }, removeChild(c) { el.children = el.children.filter((x) => x !== c); c.parentNode = null; },
    focus() { el.focused++; dom.active = el; }, contains(x) { return x === el; },
    getBoundingClientRect() { return { top: el.top || 0, left: 0, width: 100, height: 40 }; },
    querySelector() { return el.first || null; }, offsetHeight: 0,
  };
  return el;
}
let dom;
function mountDom() {
  const ids = ['saveStatus', 'saveStatusCompact', 'popoutSaveStatus', 'staleBanner', 'printSheets', 'modalBackdrop', 'previewModalBackdrop', 'stageArea', 'compactMenu', 'compactStageBtn', 'compactBar', 'deviceGate', 'deviceGatePhone', 'phoneBanner', 'deviceGateLogout', 'pageTitle', 'compactStageName'];
  dom = { els: {}, body: makeEl('body'), app: makeEl('app'), active: null, created: [] };
  ids.forEach((id) => { dom.els[id] = makeEl(id); });
  app.document = new Proxy(DOC, {
    get: (t, k) => {
      if (k === 'getElementById') return (id) => dom.els[id] || null;
      if (k === 'body') return dom.body;
      if (k === 'activeElement') return dom.active;
      if (k === 'querySelector') return (s) => (s === '.app' ? dom.app : null);
      if (k === 'createElement') return (tag) => { const e = makeEl(tag); dom.created.push(e); return e; };
      return t[k];
    },
  });
}
function tournament(id, name) { const t = f('blankTournament')(); t.id = id; t.eventCreation.saved = true; t.eventCreation.tournamentName = name || id; return t; }

let server, calls, holdPut, modals;
function setup() {
  Object.keys(ORIG).forEach((n) => { app[n] = ORIG[n]; });
  const t = tournament('t_X', 'Spring');
  useState(app, t);
  run(app, 'lockedIds.clear(); staleIds.clear(); staleCurrent = {}; staleReloading = false; lockedReloading = false; tournamentsCache = {}; dbUpdatedAtCache = {}; clearTimeout(saveTimer); saveTimer = null; saveInFlight = false; savePendingId = null; saveWaiters = []; savePending = false; saveRev = 0; pendingSaves.clear(); sentCopies.clear(); keepaliveSave = null; silentRefreshBusy = false; silentRefreshAt = {}; finalizing = false; lastSaveStatus = ""; popoutMode = false; currentStage = 5; adminState.view = null');
  server = { t_X: { data: copy(t), updated_at: 'S1', n: 1 } };
  run(app, 'tournamentsCache[state.id] = state; dbUpdatedAtCache[state.id] = "S1"');
  app.render = () => {}; app.renderSavedList = () => {};
  modals = []; app.openModal = (o) => { modals.push(o); };
  mountDom();
  calls = []; holdPut = null;
  const handle = async (url, o) => {
    const method = (o && o.method) || 'GET';
    const id = decodeURIComponent(String(url).split('/').pop());
    const body = o && o.body ? JSON.parse(o.body) : null;
    calls.push({ method, id, body, keepalive: !!(o && o.keepalive) });
    if (holdPut && method === 'PUT') await holdPut;
    const row = server[id];
    if (method === 'GET') return row ? { ok: true, status: 200, json: async () => ({ id, data: copy(row.data), updated_at: row.updated_at }) } : { ok: false, status: 404, json: async () => ({}) };
    if (method === 'PUT') {
      if (row && body.expectedUpdatedAt !== row.updated_at) return { ok: false, status: 409, json: async () => ({ current: { id, data: copy(row.data), updated_at: row.updated_at } }) };
      const n = row ? row.n + 1 : 1;
      server[id] = { data: body.data, updated_at: 'S' + n, n };
      return { ok: true, status: 200, json: async () => ({ updated_at: 'S' + n }) };
    }
    return { ok: true, status: 204, json: async () => ({}) };
  };
  app.apiFetch = handle; app.fetch = handle;
  return t;
}
function otherWindowSaves(id, field) {
  const row = server[id]; const d = copy(row.data); d[field || 'otherScore'] = 'from-other-window';
  server[id] = { data: d, updated_at: 'S' + (row.n + 1), n: row.n + 1 };
}
const puts = () => calls.filter((c) => c.method === 'PUT');
const noDebounce = () => run(app, 'clearTimeout(saveTimer); saveTimer = null');

/* ---------------- H1: rename ---------------- */
test('H1: renaming the OPEN event after another window saved never adopts the newer stamp: the window locks and nothing overwrites', async () => {
  setup();
  otherWindowSaves('t_X');
  app.document = new Proxy(app.document, { get: (tt, k) => (k === 'getElementById' ? (id) => (id === 'renameInput' ? { value: 'Renamed' } : dom.els[id] || null) : tt[k]) });
  f('renameTournament')('t_X', { stopPropagation() {} });
  modals[0].onConfirm();
  assert.equal(run(app, 'state.eventCreation.tournamentName'), 'Renamed', 'the name is on screen');
  noDebounce();
  await f('flushSave')();                 // the rename's save (it goes through persist)
  await settle();
  assert.equal(run(app, 'staleIds.has("t_X")'), true, 'the rename was refused: the window is out of date');
  assert.equal(run(app, 'dbUpdatedAtCache.t_X'), 'S1', 'the newer stamp was not adopted');
  // the user enters a score in this window: it is never sent, the other window's score survives
  run(app, 'state.myScore = "this-window"'); f('persist')(); noDebounce();
  await f('flushSave')();
  run(app, 'savePending = true'); f('flushSaveNow')(); await settle();
  assert.equal(server.t_X.data.otherScore, 'from-other-window');
  assert.equal(server.t_X.data.myScore, undefined);
  assert.equal(puts().length, 1, 'only the refused rename');
  assert.equal(dom.els.saveStatus.textContent, 'Updated elsewhere — click to reload');
});

test('H1: renaming an event that is NOT open still saves directly; on 409 its list entry and stamp move together', async () => {
  setup();
  const b = tournament('t_B', 'Bee'); server.t_B = { data: copy(b), updated_at: 'B1', n: 1 };
  run(app, 'tournamentsCache.t_B = ' + JSON.stringify(b) + '; dbUpdatedAtCache.t_B = "B1"');
  app.document = new Proxy(app.document, { get: (tt, k) => (k === 'getElementById' ? (id) => (id === 'renameInput' ? { value: 'Bee 2' } : dom.els[id] || null) : tt[k]) });
  f('renameTournament')('t_B', { stopPropagation() {} });
  modals[0].onConfirm(); await settle();
  assert.equal(server.t_B.data.eventCreation.tournamentName, 'Bee 2');
  // another device renames it back meanwhile; renaming again gets 409 and takes the server copy for the list
  otherWindowSaves('t_B');
  modals.length = 0;
  f('renameTournament')('t_B', { stopPropagation() {} });
  modals[0].onConfirm(); await settle();
  assert.equal(run(app, 'dbUpdatedAtCache.t_B'), server.t_B.updated_at);
  assert.equal(run(app, 'tournamentsCache.t_B.otherScore'), 'from-other-window');
  assert.equal(run(app, 'staleIds.has("t_B")'), false, 'not open: nothing to lock');
});

/* ---------------- M1: keepalive vs the next save ---------------- */
test('M1: a slow hide-time save and the next save do not make the window falsely stale; both changes reach the server', async () => {
  setup();
  run(app, 'state.a = 1'); f('persist')(); noDebounce();
  let release; holdPut = new Promise((r) => { release = r; });
  f('flushSaveNow')();                     // the tab is hidden: keepalive PUT, slow
  await tick();
  holdPut = null;
  run(app, 'state.b = 2'); f('persist')(); noDebounce();
  const p = f('flushSave')();              // back in the tab: the next save starts before the keepalive answer
  await settle();
  assert.equal(puts().length, 1, 'the second save waits for the keepalive one');
  release(); await settle(); await p;
  assert.equal(run(app, 'staleIds.has("t_X")'), false, 'no false "Updated elsewhere"');
  assert.equal(server.t_X.data.a, 1);
  assert.equal(server.t_X.data.b, 2);
  assert.equal(dom.els.saveStatus.textContent, 'Saved');
  assert.equal(puts()[1].body.expectedUpdatedAt, puts()[0].keepalive ? 'S2' : 'S1');
});

test('M1: a 409 whose server copy is this window’s own earlier save (its answer was lost) is not a conflict: it resends', async () => {
  setup();
  run(app, 'state.a = 1'); f('persist')(); noDebounce();
  // the first PUT reaches the server but its answer is lost
  const real = app.apiFetch;
  app.apiFetch = async (url, o) => { await real(url, o); throw new Error('connection reset'); };
  assert.equal(await f('flushSave')(), false);
  assert.equal(dom.els.saveStatus.textContent, 'Couldn’t save — click to retry');
  app.apiFetch = real;
  run(app, 'state.b = 2'); f('persist')(); noDebounce();
  assert.equal(await f('flushSave')(), true, 'the retry is accepted after taking its own stamp');
  assert.equal(run(app, 'staleIds.has("t_X")'), false);
  assert.equal(server.t_X.data.b, 2);
  // but a copy written by someone else is still a conflict
  otherWindowSaves('t_X');
  run(app, 'state.c = 3'); f('persist')(); noDebounce();
  assert.equal(await f('flushSave')(), false);
  assert.equal(run(app, 'staleIds.has("t_X")'), true);
  assert.equal(server.t_X.data.c, undefined);
});

/* ---------------- M2: switching within the save delay ---------------- */
test('M2: switching to another event within the 500ms delay sends the edit for the event it was made in', async () => {
  setup();
  const b = tournament('t_B', 'B'); server.t_B = { data: copy(b), updated_at: 'B1', n: 1 };
  run(app, 'state.lastScore = "A-edit"'); f('persist')();
  await f('openTournament')('t_B');
  await settle();
  assert.equal(server.t_X.data.lastScore, 'A-edit', 'A’s edit reached A');
  assert.deepEqual(puts().map((c) => c.id), ['t_X'], 'B was not uploaded');
  assert.equal(run(app, 'state.id'), 't_B');
  assert.equal(run(app, 'savePending'), false);
  // nothing left over to send when the tab is hidden
  f('flushSaveNow')(); await settle();
  assert.equal(puts().length, 1);
});

test('M2: the compact menu switch does the same', async () => {
  setup();
  const b = tournament('t_B', 'B'); server.t_B = { data: copy(b), updated_at: 'B1', n: 1 };
  run(app, 'state.lastScore = "A-edit2"'); f('persist')();
  f('compactOpen')('t_B');
  await settle();
  assert.equal(server.t_X.data.lastScore, 'A-edit2');
  assert.deepEqual(puts().map((c) => c.id), ['t_X']);
});

test('M2: "+ New tournament" within the delay sends the edit for its event and never uploads the blank new one', async () => {
  setup();
  run(app, 'state.lastScore = "A-edit3"'); f('persist')();
  f('newTournament')();
  await settle();
  assert.equal(server.t_X.data.lastScore, 'A-edit3');
  f('flushSaveNow')(); await settle();
  assert.deepEqual(puts().map((c) => c.id), ['t_X'], 'no blank "Untitled tournament" was PUT');
});

test('M2: a stale event, then "+ New tournament", then the tab is hidden: nothing is PUT (no blank event)', async () => {
  setup();
  otherWindowSaves('t_X');
  run(app, 'state.myScore = 1'); f('persist')(); noDebounce();
  await f('flushSave')();
  assert.equal(run(app, 'staleIds.has("t_X")'), true);
  f('newTournament')();
  f('flushSaveNow')(); await settle();
  assert.equal(puts().length, 1, 'only the refused save');
  assert.equal(run(app, 'savePending'), false);
});

test('M2: deleting the open event with an edit waiting does not bring it back', async () => {
  setup();
  const b = tournament('t_B', 'B'); server.t_B = { data: copy(b), updated_at: 'B1', n: 1 };
  run(app, 'tournamentsCache.t_B = ' + JSON.stringify(b) + '; dbUpdatedAtCache.t_B = "B1"');
  run(app, 'state.x = 1'); f('persist')();
  await f('performDelete')('t_X');
  delete server.t_X;
  await new Promise((r) => setTimeout(r, 600)); await settle();
  assert.equal(server.t_X, undefined, 'no PUT re-created it');
});

/* ---------------- L1 ---------------- */
test('L1: a 409 for an event already left does not flag the healthy open event', async () => {
  setup();
  const b = tournament('t_B', 'B'); server.t_B = { data: copy(b), updated_at: 'B1', n: 1 };
  otherWindowSaves('t_X');
  run(app, 'state.myScore = 1'); f('persist')(); noDebounce();
  let release; holdPut = new Promise((r) => { release = r; });
  const p = f('flushSave')();
  await tick();
  // the user opens B while A's save is on its way (the GET is not held)
  useState(app, b); run(app, 'tournamentsCache.t_B = state; dbUpdatedAtCache.t_B = "B1"');
  release(); await p; holdPut = null;
  assert.equal(run(app, 'staleIds.has("t_X")'), true, 'A is locked');
  assert.notEqual(run(app, 'lastSaveStatus'), 'error', 'B is not flagged');
  assert.equal(dom.els.staleBanner.hidden, true);
  run(app, 'state.bScore = 1'); f('persist')(); noDebounce();
  assert.equal(await f('flushSave')(), true, 'B saves');
});

/* ---------------- M3: silent refresh ---------------- */
function refreshReady() {
  const t = setup();
  run(app, 'currentStage = 5; state.activeGroupId = null');
  return t;
}
test('M3: coming back to a window loads the newer copy quietly, keeping the step, and says so', async () => {
  refreshReady();
  run(app, 'currentStage = 6');
  otherWindowSaves('t_X');
  assert.equal(await f('silentRefresh')(), true);
  assert.equal(run(app, 'state.otherScore'), 'from-other-window');
  assert.equal(run(app, 'dbUpdatedAtCache.t_X'), 'S2');
  assert.equal(run(app, 'currentStage'), 6, 'the step is kept');
  const toast = dom.created.find((e) => /info-toast/.test(e.className || ''));
  assert.ok(toast, 'a toast');
  assert.equal(toast.textContent, 'Updated with the latest scores');
  // and the next score from this window is saved on top of the newer copy (no 409)
  run(app, 'state.mine = 1'); f('persist')(); noDebounce();
  assert.equal(await f('flushSave')(), true);
  assert.equal(server.t_X.data.otherScore, 'from-other-window');
  assert.equal(server.t_X.data.mine, 1);
});

test('M3: nothing changes when the server copy is the same one', async () => {
  refreshReady();
  const before = run(app, 'state');
  assert.equal(await f('silentRefresh')(), false);
  assert.equal(run(app, 'state'), before, 'the very same object is still on screen');
  assert.equal(calls.filter((c) => c.method === 'GET').length, 1);
  assert.equal(dom.created.length, 0, 'no toast');
});

test('M3: skipped (no GET at all) with an unsaved or in-flight edit, an open box, a focused text box, or a stale / finalized / unsaved event', async () => {
  const cases = {
    'pending edit': () => { run(app, 'state.x = 1'); f('persist')(); },
    'save in flight': () => run(app, 'saveInFlight = true'),
    'open modal': () => dom.els.modalBackdrop.classes.add('show'),
    'open preview': () => dom.els.previewModalBackdrop.classes.add('show'),
    'typing': () => { dom.active = { tagName: 'INPUT', type: 'text' }; },
    'typing in a textarea': () => { dom.active = { tagName: 'TEXTAREA' }; },
    'stale': () => run(app, 'staleIds.add("t_X")'),
    'finalized': () => run(app, 'lockedIds.add("t_X")'),
    'never saved': () => run(app, 'delete dbUpdatedAtCache.t_X'),
    'admin view': () => run(app, 'adminState.view = "organizers"; currentOrganizer = {role:"admin"}'),
  };
  for (const [name, arrange] of Object.entries(cases)) {
    refreshReady();
    otherWindowSaves('t_X');
    arrange();
    assert.equal(await f('silentRefresh')(), false, name);
    assert.equal(calls.filter((c) => c.method === 'GET').length, 0, name + ': no GET');
    assert.equal(run(app, 'state.otherScore'), undefined, name);
    run(app, 'clearTimeout(saveTimer); saveTimer = null; saveInFlight = false; adminState.view = null; currentOrganizer = null');
  }
  // a checkbox having focus is not typing
  refreshReady(); otherWindowSaves('t_X'); dom.active = { tagName: 'INPUT', type: 'checkbox' };
  assert.equal(await f('silentRefresh')(), true);
});

test('M3: an edit made while the refresh request was out wins: the refresh does not replace the screen', async () => {
  refreshReady();
  otherWindowSaves('t_X');
  const real = app.apiFetch;
  app.apiFetch = async (url, o) => { const r = await real(url, o); run(app, 'state.typed = 1'); f('persist')(); return r; };
  assert.equal(await f('silentRefresh')(), false);
  assert.equal(run(app, 'state.typed'), 1);
  assert.equal(run(app, 'state.otherScore'), undefined);
  app.apiFetch = real;
});

test('M3: it runs when the window becomes visible or gets focus', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'app.html'), 'utf8');
  assert.match(src, /visibilityState==='hidden'\) flushSaveNow\(\); else if\(document\.visibilityState==='visible'\) resumeSaving\(\);/);
  assert.match(src, /window\.addEventListener\('online', \(\)=>\{ resumeSaving\(\); \}\);/);
  assert.match(src, /function resumeSaving\(\)\{[\s\S]*?silentRefresh\(\);/);
  assert.match(src, /window\.addEventListener\('focus', \(\)=>\{ silentRefresh\(\); \}\);/);
});

/* ---------------- popout Print, by behaviour ---------------- */
test('the full-page window’s Print fills the print sheets with the chart it shows, prints once, and saves nothing', async () => {
  setup();
  const players = Array.from({ length: 6 }, (_, i) => ({ id: 'e' + i, name: 'P' + i, org: '', players: [], withdrawn: false }));
  run(app, 'state.format.formatType = "knockout"; state.format.saved = true; state.entriesList = ' + JSON.stringify(players));
  app.__o = players.map((p) => ({ entryId: p.id, org: '' }));
  run(app, 'state.knockout = generateBracket(__o, "Bracket")');
  run(app, 'popoutMode = true; popoutSection = "knockout"');
  let printed = 0; app.window = new Proxy(app.window, { get: (t, k) => (k === 'print' ? () => { printed++; } : t[k]) });
  const WIN = app.window;
  try {
    f('popoutPrint')();
    await new Promise((r) => setTimeout(r, 90));
    assert.match(dom.els.printSheets.innerHTML, /class="print-sheet mko-print-sheet/);
    assert.equal(printed, 1);
    assert.equal(puts().length, 0, 'printing saves nothing');
    // round robin window: one sheet per confirmed group
    run(app, 'state.format.formatType = "roundrobin"; buildGroups(state); state.groups.forEach(g=>{ g.confirmed = true; }); popoutSection = "rr"');
    const groups = run(app, 'state.groups.length');
    f('popoutPrint')();
    await new Promise((r) => setTimeout(r, 90));
    assert.equal((dom.els.printSheets.innerHTML.match(/class="print-sheet"/g) || []).length + (dom.els.printSheets.innerHTML.match(/class="print-sheet /g) || []).length, groups);
    assert.equal(printed, 2);
    // nothing to show: a message, no print
    run(app, 'state.groups.forEach(g=>{ g.confirmed = false; })');
    f('popoutPrint')(); await new Promise((r) => setTimeout(r, 90));
    assert.equal(printed, 2);
    assert.equal(modals[modals.length - 1].title, 'Nothing to print yet');
  } finally { app.window = WIN; run(app, 'popoutMode = false'); }
});

/* ---------------- L7 ---------------- */
test('L7: in a full-page window the stale banner pushes the content down by its height (it never covers the chart top)', async () => {
  setup();
  run(app, 'popoutMode = true');
  dom.els.staleBanner.offsetHeight = 96;
  otherWindowSaves('t_X');
  run(app, 'state.s = 1'); f('persist')(); noDebounce();
  await f('flushSave')();
  assert.equal(dom.els.staleBanner.hidden, false);
  assert.equal(dom.els.stageArea.style.paddingTop, '96px');
  // reloaded: the space goes
  await f('reloadStale')();
  assert.equal(dom.els.staleBanner.hidden, true);
  assert.equal(dom.els.stageArea.style.paddingTop, '');
  run(app, 'popoutMode = false');
});

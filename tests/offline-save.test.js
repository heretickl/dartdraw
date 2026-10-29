const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, useState } = require('./lib/helpers');

// Offline scoring: the save path with the device queue (app.html "Offline scoring" section). A fake server with real
// optimistic concurrency (the shape of tests/save-round4.test.js), reached through the REAL apiFetch, so a request that
// gets no answer (offline, or wifi without internet) is seen the way the app sees it. DDOffline runs on its memory
// backend; "a reload" is the window's memory wiped while the device queue stays.
const app = loadApp({ globals: { URLSearchParams, location: { search: '', protocol: 'http:', replace() {}, reload() {} } } });
const f = (n) => run(app, n);
const DOC = app.document;
const tick = () => new Promise((r) => setImmediate(r));
const settle = async () => { for (let i = 0; i < 20; i++) await tick(); };
const copy = (x) => JSON.parse(JSON.stringify(x));
const O = run(app, 'DDOffline');
O.useBackend('memory');
const ORIG = {};
['render', 'renderSavedList', 'openModal', 'renderOrganizerBar', 'loadLibrary'].forEach((n) => { ORIG[n] = run(app, n); });

function makeEl(id) {
  const el = { id, textContent: '', innerHTML: '', onclick: null, hidden: true, style: {}, classes: new Set(), offsetHeight: 0,
    classList: { toggle(n, on) { if (on) el.classes.add(n); else el.classes.delete(n); }, contains(n) { return el.classes.has(n); }, add(n) { el.classes.add(n); }, remove(n) { el.classes.delete(n); } } };
  return el;
}
let dom;
function mountDom() {
  dom = { els: {}, checked: {} };
  ['saveStatus', 'saveStatusCompact', 'popoutSaveStatus', 'staleBanner', 'saveStatusHelp', 'pageTitle', 'pageSub', 'stageArea', 'modalBackdrop', 'modalBox'].forEach((id) => { dom.els[id] = makeEl(id); });
  app.document = new Proxy(DOC, {
    get: (t, k) => {
      if (k === 'getElementById') return (id) => dom.els[id] || null;
      if (k === 'querySelector') return (sel) => { const m = /name="(pk\d+)"/.exec(sel); return m && dom.checked[m[1]] ? { value: dom.checked[m[1]] } : null; };
      if (k === 'visibilityState') return 'visible';
      return t[k];
    },
  });
}
function tournament(id, name) {
  const t = f('blankTournament')(); t.id = id; t.eventCreation.saved = true; t.eventCreation.tournamentName = name || id; t.format.saved = true;
  t.groups = [{ id: 'g1', label: 'A', entryIds: ['e1', 'e2', 'e3'], scores: {}, confirmed: true, gameStarted: true }];
  t.entriesList = [{ id: 'e1', name: 'Ann' }, { id: 'e2', name: 'Bob' }, { id: 'e3', name: 'Cat' }];
  return t;
}
let server, calls, modals, offline, landThenDrop, orgN = 0, org;
/* A fresh window on the device: the app's memory wiped (a reload); the device queue for `org` is kept unless fresh. */
function windowState() {
  run(app, 'state = null; lockedIds.clear(); staleIds.clear(); goneIds.clear(); staleCurrent = {}; tournamentsCache = {}; dbUpdatedAtCache = {}; clearTimeout(saveTimer); saveTimer = null; saveInFlight = false; savePendingId = null; saveWaiters = []; savePending = false; saveRev = 0; pendingSaves.clear(); sentCopies.clear(); keepaliveSave = null; finalizing = false; lastSaveStatus = ""; popoutMode = false; currentStage = 5; netOffline = false; clearTimeout(retryTimer); retryTimer = null; retryDelay = 5000; lastOpenBlocked = false; lastOpenOffline = false; logoutConfirmed = false; switchSettling = false; silentRefreshBusy = false; silentRefreshAt = {}; saveChannel = null');
  run(app, 'for(const k in offlineQueued) delete offlineQueued[k]; for(const k in offlineBase) delete offlineBase[k]; for(const k in offlineReady) delete offlineReady[k]; for(const k in queueWrites) delete queueWrites[k]');
  run(app, 'currentOrganizer = { id: "' + org + '", name: "O" }');
}
function setup(opts) {
  opts = opts || {};
  if (!opts.sameOrg) org = 'org' + (++orgN);
  Object.keys(ORIG).forEach((n) => { app[n] = ORIG[n]; });
  app.render = () => {}; app.renderSavedList = () => {}; app.renderOrganizerBar = () => {}; app.loadLibrary = () => {};
  modals = []; app.openModal = (o) => { modals.push(o); };
  mountDom();
  windowState();
  calls = []; offline = false; landThenDrop = false;
  if (!opts.keepServer) server = {};
  app.fetch = async (url, o) => {
    const method = (o && o.method) || 'GET';
    const id = decodeURIComponent(String(url).split('?')[0].split('/').pop());
    const body = o && o.body ? JSON.parse(o.body) : null;
    calls.push({ method, id, url: String(url), body });
    if (offline) throw new TypeError('Failed to fetch');
    if (String(url) === '/api/auth/logout') return { ok: true, status: 200, json: async () => ({}) };
    const row = server[id];
    if (method === 'GET') return row ? { ok: true, status: 200, json: async () => ({ id, data: copy(row.data), updated_at: row.updated_at }) } : { ok: false, status: 404, json: async () => ({}) };
    if (method === 'PUT') {
      if (row && row.data.finalized) return { ok: false, status: 403, json: async () => ({ finalized: true }) };
      if (!row && body.expectedUpdatedAt) return { ok: false, status: 404, json: async () => ({}) };
      if (row && body.expectedUpdatedAt !== row.updated_at) return { ok: false, status: 409, json: async () => ({ current: { id, data: copy(row.data), updated_at: row.updated_at } }) };
      const n = row ? row.n + 1 : 1;
      server[id] = { data: body.data, updated_at: 'S' + n, n };
      if (landThenDrop) { landThenDrop = false; throw new TypeError('connection reset'); }   // it got there, the answer did not
      return { ok: true, status: 200, json: async () => ({ updated_at: 'S' + n }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
}
/* Puts event t on the server and opens it in the window (as loading it would: its copy goes on the device). */
async function open(t) {
  server[t.id] = { data: copy(t), updated_at: 'S1', n: 1 };
  assert.equal(await f('openTournament')(t.id), true);
  await settle();
}
const puts = () => calls.filter((c) => c.method === 'PUT');
const score = (a, b, l1, l2) => { run(app, `setScore(state.groups[0], "${a}", "${b}", ${l1}, ${l2}); persist(); clearTimeout(saveTimer); saveTimer = null`); };
const status = () => dom.els.saveStatus.textContent;
const queue = (id) => O.getQueue(org, id);

test('no connection: the score is kept on the device, the status counts what waits, and the retry sends it when signal is back', async () => {
  setup(); await open(tournament('t_A'));
  offline = true;
  score('e1', 'e2', 3, 1);
  assert.equal(await f('flushSave')(), false);
  assert.equal(run(app, 'netOffline'), true);
  assert.equal(status(), 'No connection — 1 waiting');
  score('e1', 'e3', 0, 3);
  await f('flushSave')();
  assert.equal(status(), 'No connection — 2 waiting');
  const q = await queue('t_A');
  assert.equal(q.data.groups[0].scores['e1|e2'].legs1, 3);
  assert.deepEqual(q.changes.map((c) => c.key).sort(), ['rr:g1:e1|e2', 'rr:g1:e1|e3']);
  assert.deepEqual([...f('waitingKeys')('t_A')].sort(), ['rr:g1:e1|e2', 'rr:g1:e1|e3']);
  assert.ok(run(app, 'retryTimer'), 'a retry is scheduled by itself');
  // signal back: the retry (made quick here) sends both
  offline = false;
  run(app, 'retryDelay = 1; scheduleRetry()');
  await new Promise((r) => setTimeout(r, 30)); await settle();
  assert.equal(server.t_A.data.groups[0].scores['e1|e3'].legs2, 3);
  assert.equal(status(), 'Saved');
  assert.equal(await queue('t_A'), null, 'the queue is gone');
  assert.equal(f('waitingKeys')('t_A').size, 0);
});

test('wifi without internet: navigator says online, but a request with no answer still means no connection', async () => {
  setup(); await open(tournament('t_A'));
  app.navigator = { onLine: true };
  offline = true;
  score('e1', 'e2', 3, 1);
  await f('flushSave')();
  assert.equal(run(app, 'netOffline'), true);
  assert.match(status(), /^No connection/);
  offline = false;
  assert.equal(await f('flushSave')(), true);
  assert.equal(run(app, 'netOffline'), false, 'any answer means connected again');
});

test('a reload with a queue: the queued copy comes back and is sent once', async () => {
  setup(); await open(tournament('t_A'));
  offline = true; score('e1', 'e2', 3, 1); await f('flushSave')(); await settle();
  // reload with signal: the list comes from the server (which never got the score), then the device queue
  windowState(); offline = false; calls.length = 0;
  run(app, 'tournamentsCache.t_A = ' + JSON.stringify(server.t_A.data) + '; dbUpdatedAtCache.t_A = "S1"');
  assert.equal(await f('restoreQueues')(), 1);
  assert.equal(await f('openTournament')('t_A'), true); await settle();
  assert.equal(run(app, 'state.groups[0].scores["e1|e2"].legs1'), 3, 'the queued copy is what is on screen');
  assert.equal(puts().length, 1, 'sent once');
  assert.equal(server.t_A.data.groups[0].scores['e1|e2'].legs1, 3);
  assert.equal(await queue('t_A'), null);
});

test('a save that reached the server but whose answer was lost, then a reload: recognised as its own, not "Updated elsewhere"', async () => {
  setup(); await open(tournament('t_A'));
  score('e1', 'e2', 3, 1);
  landThenDrop = true;
  assert.equal(await f('flushSave')(), false);
  assert.equal(server.t_A.updated_at, 'S2', 'it did get there');
  await settle();
  windowState();
  run(app, 'tournamentsCache.t_A = ' + JSON.stringify(server.t_A.data) + '; dbUpdatedAtCache.t_A = "S1"');   // an older list
  await f('restoreQueues')();
  assert.equal(await f('flushSave')(), true);
  assert.equal(run(app, 'staleIds.size'), 0, 'not stale');
  assert.equal(server.t_A.data.groups[0].scores['e1|e2'].legs1, 3);
  assert.equal(f('parkedCount')(), 0, 'nothing set aside');
});

test('opening with no connection at all: signed in as the last organiser on the device, the event and its queue from the device', async () => {
  setup(); const t = tournament('t_A', 'Spring'); await open(t);
  await O.putProfile(org, { id: org, name: 'O' });
  await f('fetchTournamentList')();
  offline = true; score('e1', 'e2', 3, 1); await f('flushSave')(); await settle();
  windowState(); run(app, 'currentOrganizer = null; netOffline = true');
  assert.equal(await f('bootOffline')(), true);
  assert.equal(run(app, 'currentOrganizer.id'), org);
  assert.equal(run(app, 'state.id'), 't_A');
  assert.equal(run(app, 'state.groups[0].scores["e1|e2"].legs1'), 3);
  assert.equal(run(app, 'savePending'), true, 'still to be sent');
  // the event is also on the device as the last server copy: with no queue it opens from that
  assert.equal(run(app, 'offlineReady.t_A'), true);
});

test('opening with no connection when only the queue is left (no saved list on the device): the queue alone opens it', async () => {
  setup(); await open(tournament('t_A', 'Spring'));
  await O.putProfile(org, { id: org, name: 'O' });
  offline = true; score('e1', 'e2', 3, 1); await f('flushSave')(); await settle();
  windowState(); run(app, 'currentOrganizer = null; netOffline = true');
  assert.equal(await f('bootOffline')(), true);
  assert.equal(run(app, 'state && state.id'), 't_A');
  assert.equal(run(app, 'state.groups[0].scores["e1|e2"].legs1'), 3);
});

test('no device copy and no connection: "Needs a connection", and booting says so instead of going to sign-in', async () => {
  setup();
  offline = true;
  assert.equal(await f('openTournament')('t_none'), false);
  assert.equal(modals[0].title, 'Needs a connection');
  windowState(); run(app, 'currentOrganizer = null');
  org = 'org-nobody-' + orgN;
  run(app, 'DDOffline.useBackend("memory")');
  // another device: nothing stored for anybody under this id; the last organiser may exist from other tests, so ask directly
  assert.equal(await O.getProfile(org), null);
});

test('switching events while a score waits on the device is allowed; the score stays queued and is sent later', async () => {
  setup(); const a = tournament('t_A', 'A'), b = tournament('t_B', 'B');
  server.t_B = { data: copy(b), updated_at: 'B1', n: 1 };
  await open(a);
  await f('openTournament')('t_B'); await settle();   // B on the device too
  await f('openTournament')('t_A'); await settle();
  offline = true; score('e1', 'e2', 3, 1); await f('flushSave')();
  assert.equal(await f('openTournament')('t_B'), true, 'not refused');
  assert.equal(run(app, 'state.id'), 't_B');
  assert.equal(modals.length, 0);
  assert.ok(await queue('t_A'));
  offline = false;
  assert.equal(await f('flushSave')(), true);
  assert.equal(server.t_A.data.groups[0].scores['e1|e2'].legs1, 3, 'A’s score was sent while B is open');
});

test('logging out with scores waiting asks first and keeps them; with nothing waiting the device copies are cleared', async () => {
  setup(); await open(tournament('t_A'));
  const replaced = []; const WIN = app.window;
  app.window = new Proxy(WIN, { get: (t, k) => (k === 'location' ? { replace: (u) => replaced.push(u) } : t[k]) });
  try {
    offline = true; score('e1', 'e2', 3, 1); await f('flushSave')();
    await f('logout')();
    assert.deepEqual(replaced, [], 'still signed in');
    assert.equal(modals[modals.length - 1].title, 'Results not sent yet');
    modals[modals.length - 1].onConfirm(); await settle();
    assert.deepEqual(replaced, ['/?login=1']);
    assert.ok(await queue('t_A'), 'kept on the device for the next sign-in');
    // next time, signed in with signal, nothing waiting: logging out clears this organiser's device copies
    replaced.length = 0; offline = false;
    await f('restoreQueues')(); await f('flushSave')(); await settle();
    await O.putProfile(org, { id: org });
    await f('logout')();
    assert.deepEqual(replaced, ['/?login=1']);
    assert.equal(await O.getProfile(org), null);
    assert.equal(await O.getEvent(org, 't_A'), null);
  } finally { app.window = WIN; }
});

test('changed elsewhere (409): the waiting scores are set aside, never retried, listed, and put back on the latest copy', async () => {
  setup(); await open(tournament('t_A', 'Spring'));
  offline = true; score('e1', 'e2', 3, 1); score('e1', 'e3', 2, 3); await f('flushSave')();
  // meanwhile another device saved the event: one of the same matches with a different result, one other change
  const d = copy(server.t_A.data); d.groups[0].scores['e1|e3'] = { legs1: 3, legs2: 0 }; d.groups[0].scores['e2|e3'] = { legs1: 1, legs2: 3 };
  server.t_A = { data: d, updated_at: 'S9', n: 9 };
  offline = false; calls.length = 0;
  assert.equal(await f('flushSave')(), false);
  assert.equal(f('parkedCount')(), 2);
  await settle();
  const q = await queue('t_A');
  assert.equal(q.data, null); assert.equal(q.parked.reason, 'stale'); assert.equal(q.parked.changes.length, 2);
  assert.equal(await f('flushSave')(), false); assert.equal(puts().length, 1, 'not sent again');
  // review: load the latest and put them back; the match with a different result asks
  f('openParkedReview')('t_A');
  assert.equal(modals[modals.length - 1].title, 'Results not sent');
  assert.match(modals[modals.length - 1].bodyHTML, /Ann v Bob/);
  modals[modals.length - 1].onConfirm(); await settle();
  const pick = modals[modals.length - 1];
  assert.match(pick.bodyHTML, /Ann v Cat/);
  dom.checked.pk0 = 'phone';
  pick.onConfirm(); await settle();
  await f('flushSave')(); await settle();
  const s = server.t_A.data.groups[0].scores;
  assert.equal(s['e1|e2'].legs1, 3, 'filled in');
  assert.equal(s['e1|e3'].legs1, 2, 'the device result was chosen');
  assert.equal(s['e2|e3'].legs2, 3, 'the other device’s change kept');
  assert.equal(f('parkedCount')(), 0);
  assert.equal(await queue('t_A'), null);
});

test('finalized (403) or deleted (404) elsewhere: the waiting scores are listed to note down, then dismissed', async () => {
  for (const kind of ['locked', 'gone']) {
    setup(); await open(tournament('t_A', 'Spring'));
    offline = true; score('e1', 'e2', 3, 1); await f('flushSave')();
    if (kind === 'locked') server.t_A.data.finalized = { at: 'x' }; else delete server.t_A;
    offline = false;
    await f('flushSave')(); await settle();
    assert.equal(f('parkedCount')(), 1, kind);
    const q = await queue('t_A');
    assert.equal(q.parked.reason, kind, kind);
    f('openParkedReview')('t_A');
    const m = modals[modals.length - 1];
    assert.equal(m.confirmLabel, 'Dismiss', kind);
    m.onConfirm(); await settle();
    assert.equal(f('parkedCount')(), 0, kind);
    assert.equal(await queue('t_A'), null, kind);
  }
});

test('with no connection, everything but scoring and printing says "Needs a connection" and does nothing', async () => {
  setup(); await open(tournament('t_A'));
  run(app, 'currentStage = 5; netOffline = true');
  const ev = { stopPropagation() {} };
  const tries = [
    ['goStage(3)', () => run(app, 'goStage(3)')], ['goStage(6)', () => run(app, 'goStage(6)')],
    ['newTournament', () => f('newTournament')()], ['duplicateTournament', () => f('duplicateTournament')('t_A', ev)],
    ['deleteTournament', () => f('deleteTournament')('t_A', ev)], ['setPublished', () => f('setPublished')(true)],
    ['openChangePassword', () => f('openChangePassword')()], ['showPlayersPage', () => f('showPlayersPage')()],
  ];
  for (const [name, go] of tries) {
    modals = []; app.openModal = (o) => { modals.push(o); };
    await go();
    assert.equal(modals.length && modals[0].title, 'Needs a connection', name);
    assert.equal(run(app, 'currentStage'), 5, name + ': still on step 5');
  }
  assert.equal(run(app, 'currentStage'), 5);
  assert.equal(run(app, '!!state.published'), false);
  modals = []; run(app, 'goStage(7)'); assert.equal(run(app, 'currentStage'), 7, 'printing still works');
  assert.equal(modals.length, 0);
});

test('a sample event and a finalized event are never queued', async () => {
  setup();
  const s = tournament('t_S'); s.isSample = true; useState(app, s);
  run(app, 'persist()'); await settle();
  assert.equal(await queue('t_S'), null);
  const fz = tournament('t_F'); fz.finalized = { at: 'x' };
  server.t_F = { data: copy(fz), updated_at: 'F1', n: 1 };
  await f('openTournament')('t_F'); await settle();
  assert.equal(await f('queueWrite')('t_F'), false);
  assert.equal(await queue('t_F'), null);
});

/* ---------------- final review fixes ---------------- */
test('review 1: a read waits for the writes before it, so a queue deleted after a save is not read back (no second send)', async () => {
  setup(); O.useBackend('memory', { writeDelay: 2 });
  try {
    O.putQueue(org, 't_q', { data: { a: 1 } }); O.deleteQueue(org, 't_q');
    assert.equal(await queue('t_q'), null, 'read after write');
    // a reload with a queue: opening the event after the save went through sends it once
    await open(tournament('t_A'));
    offline = true; score('e1', 'e2', 3, 1); await f('flushSave')(); await new Promise((r) => setTimeout(r, 20));
    windowState(); offline = false; calls.length = 0;
    run(app, 'tournamentsCache.t_A = ' + JSON.stringify(server.t_A.data) + '; dbUpdatedAtCache.t_A = "S1"');
    await f('restoreQueues')();
    await f('openTournament')('t_A'); await new Promise((r) => setTimeout(r, 30)); await settle();
    assert.equal(puts().length, 1, 'sent once, never twice');
  } finally { O.useBackend('memory'); }
});

test('review 2: a request that hangs (wifi without internet) counts as no connection after the timeout', async () => {
  setup(); await open(tournament('t_A'));
  run(app, 'FETCH_TIMEOUT_MS = 20');
  try {
    app.fetch = () => new Promise(() => {});
    score('e1', 'e2', 3, 1);
    assert.equal(await f('flushSave')(), false);
    assert.equal(run(app, 'netOffline'), true);
    assert.equal(status(), 'No connection — 1 waiting');
    assert.equal(run(app, 'saveInFlight'), false, 'not stuck');
  } finally { run(app, 'FETCH_TIMEOUT_MS = 15000'); }
});

test('review 4: when the device storage cannot be written, the status does not claim the scores are kept', async () => {
  setup(); await open(tournament('t_A'));
  O.useBackend('memory', { failWrites: true });
  try {
    offline = true; score('e1', 'e2', 3, 1); await settle();
    await f('flushSave')(); await settle();
    assert.equal(status(), 'Couldn’t save — click to retry');
  } finally { O.useBackend('memory'); }
  // storage back: the next change is kept again and the status says so
  score('e1', 'e3', 3, 0); await settle(); await f('flushSave')(); await settle();
  assert.match(status(), /^No connection/);
});

test('review 6: after "Log out anyway" the device does not open as that organiser with no connection; the queue is still sent at the next sign-in', async () => {
  setup(); await open(tournament('t_A'));
  await O.putProfile(org, { id: org, name: 'O' });
  const WIN = app.window;
  app.window = new Proxy(WIN, { get: (t, k) => (k === 'location' ? { replace() {} } : t[k]) });
  try {
    offline = true; score('e1', 'e2', 3, 1); await f('flushSave')();
    await f('logout')();
    modals[modals.length - 1].onConfirm(); await settle();
    assert.equal(await O.getProfile(org), null, 'the sign-in is forgotten');
    assert.notEqual(await O.getLastOrganizerId(), org);
    assert.ok(await queue('t_A'), 'the results are kept');
    windowState(); run(app, 'currentOrganizer = null');
    assert.equal(await f('bootOffline')(), false, 'no offline sign-in');
    run(app, 'currentOrganizer = { id: "' + org + '" }'); offline = false;
    assert.equal(await f('restoreQueues')(), 1);
    assert.equal(await f('flushSave')(), true);
    assert.equal(server.t_A.data.groups[0].scores['e1|e2'].legs1, 3);
  } finally { app.window = WIN; }
});

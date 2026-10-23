const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, useState } = require('./lib/helpers');

// Release 5 (first run): the Get started card on an empty account, and the SAMPLE EVENT. A sample lives only in the
// window (state.isSample) and must never reach the server by any save path: the debounced save, flushSave, the
// close/hide keepalive save, retries, the quiet refresh, the sign-out stash, rename/duplicate/delete, publishing and
// finalizing. "Save as my event" sends exactly one create; closing it, switching events, a new event or logging out
// just drop it (no "unsaved" prompt). Runs the real app.html functions against a fake server that records requests.
const app = loadApp();
const f = (n) => run(app, n);
const DOC = app.document;
const WIN = app.window;
const tick = () => new Promise((r) => setImmediate(r));
const settle = async () => { for (let i = 0; i < 10; i++) await tick(); };
const copy = (x) => JSON.parse(JSON.stringify(x));
const ORIG = {};
['apiFetch', 'fetch', 'render', 'openModal', 'showInfoToast'].forEach((n) => { ORIG[n] = run(app, n); });

function makeEl(id) {
  const el = {
    id, textContent: '', innerHTML: '', onclick: null, hidden: true, style: {}, attrs: {}, classes: new Set(), children: [], parentNode: null,
    classList: { toggle(n, on) { if (on) el.classes.add(n); else el.classes.delete(n); }, contains(n) { return el.classes.has(n); }, add(n) { el.classes.add(n); }, remove(n) { el.classes.delete(n); } },
    setAttribute(k, v) { el.attrs[k] = String(v); }, removeAttribute(k) { delete el.attrs[k]; }, getAttribute(k) { return k in el.attrs ? el.attrs[k] : null; },
    appendChild(c) { el.children.push(c); c.parentNode = el; }, removeChild(c) { el.children = el.children.filter((x) => x !== c); c.parentNode = null; },
    focus() {}, contains(x) { return x === el; }, querySelector() { return null; }, querySelectorAll() { return []; }, offsetHeight: 0,
  };
  return el;
}
const IDS = ['saveStatus', 'saveStatusCompact', 'popoutSaveStatus', 'saveStatusHelp', 'staleBanner', 'printSheets', 'modalBackdrop', 'modalBox', 'previewModalBackdrop',
  'stageArea', 'compactMenu', 'compactStageBtn', 'compactBar', 'compactStageName', 'compactStageHelp', 'pageTitle', 'pageSub', 'pageHelp', 'savedList',
  'currentWorkspaceCard', 'cwName', 'cwSub', 'navstep1', 'navstep2', 'navstep3', 'navstep4', 'navstep5', 'navstep6', 'navstep7', 'phoneBanner', 'deviceGate'];
let dom, store, server, calls, modals, toasts;
function mount() {
  dom = { els: {}, body: makeEl('body') };
  IDS.forEach((id) => { dom.els[id] = makeEl(id); });
  app.document = new Proxy(DOC, {
    get: (t, k) => {
      if (k === 'getElementById') return (id) => dom.els[id] || null;
      if (k === 'body') return dom.body;
      if (k === 'activeElement') return null;
      if (k === 'querySelector') return () => null;
      if (k === 'createElement') return (tag) => makeEl(tag);
      if (k === 'visibilityState') return 'visible';
      if (k === 'hasFocus') return () => true;
      return t[k];
    },
  });
  // localStorage: a real map, so the test can see every key that is written
  store = { data: {}, writes: [], getItem(k) { return k in this.data ? this.data[k] : null; }, setItem(k, v) { this.writes.push(k); this.data[k] = String(v); }, removeItem(k) { this.writes.push(k); delete this.data[k]; } };
  app.window = new Proxy(WIN, { get: (t, k) => (k === 'localStorage' ? store : t[k]) });
}
function setup(opts) {
  opts = opts || {};
  Object.keys(ORIG).forEach((n) => { app[n] = ORIG[n]; });
  mount();
  run(app, 'state = null; currentStage = 1; lockedIds.clear(); staleIds.clear(); staleCurrent = {}; goneIds.clear(); tournamentsCache = {}; dbUpdatedAtCache = {}; foreignOpenIds.clear(); clearTimeout(saveTimer); saveTimer = null; saveInFlight = false; savePendingId = null; saveWaiters = []; savePending = false; saveRev = 0; pendingSaves.clear(); sentCopies.clear(); keepaliveSave = null; silentRefreshBusy = false; silentRefreshAt = {}; finalizing = false; lastSaveStatus = ""; popoutMode = false; adminState.view = null; adminEditing = null; sampleSaving = false');
  app.__org = { id: 'o1', name: 'Sam', tier: 'pro', entryLimit: null, viewerUrl: 'https://live.example.com' };
  run(app, 'currentOrganizer = __org');
  server = {};
  if (opts.withEvent) {
    const t = f('blankTournament')(); t.id = 't_real'; t.eventCreation.saved = true; t.eventCreation.tournamentName = 'Real one';
    server.t_real = { data: copy(t), updated_at: 'S1', n: 1 };
  }
  calls = []; modals = []; toasts = [];
  app.openModal = (o) => { modals.push(o); };
  app.showInfoToast = (m) => { toasts.push(m); };
  const handle = async (url, o) => {
    const method = (o && o.method) || 'GET';
    const id = decodeURIComponent(String(url).split('/').pop());
    const body = o && o.body ? JSON.parse(o.body) : null;
    calls.push({ method, url: String(url), id, body, keepalive: !!(o && o.keepalive) });
    const row = server[id];
    if (method === 'GET') return row ? { ok: true, status: 200, json: async () => ({ id, data: copy(row.data), updated_at: row.updated_at }) } : { ok: false, status: 404, json: async () => ({}) };
    if (method === 'PUT') {
      if (row && body.expectedUpdatedAt !== row.updated_at) return { ok: false, status: 409, json: async () => ({ current: { id, data: copy(row.data), updated_at: row.updated_at } }) };
      if (!row && body.expectedUpdatedAt !== null) return { ok: false, status: 404, json: async () => ({}) };
      const n = row ? row.n + 1 : 1;
      server[id] = { data: body.data, updated_at: 'S' + n, n };
      return { ok: true, status: 200, json: async () => ({ updated_at: 'S' + n }) };
    }
    return { ok: true, status: 204, json: async () => ({}) };
  };
  app.apiFetch = handle; app.fetch = handle;
  if (opts.withEvent) run(app, 'tournamentsCache.t_real = ' + JSON.stringify(server.t_real.data) + '; dbUpdatedAtCache.t_real = "S1"');
}
const puts = () => calls.filter((c) => c.method === 'PUT');
const sampleOn = () => run(app, 'isSampleOpen()');

/* ---------------- the Get started card ---------------- */
test('no saved events: the welcome screen shows the Get started card with the 7 Quick start steps, Try a sample event and Help links', () => {
  setup();
  f('render')();
  const html = dom.els.stageArea.innerHTML;
  assert.match(html, /id="getStartedCard"/);
  for (let i = 1; i <= 7; i++) assert.match(html, new RegExp('<a class="gs-how" href="/help#quick-start-step-' + i + '" target="_blank" rel="noopener" aria-label="How\\? Step ' + i + ' '));
  assert.equal((html.match(/<li>/g) || []).length, 7);
  assert.match(html, /<button class="btn secondary" onclick="openSampleEvent\(\)">Try a sample event<\/button>/);
  assert.match(html, /<button class="btn primary" onclick="newTournament\(\)">\+ New tournament<\/button>/);
  assert.match(html, /href="\/help#quick-start" target="_blank" rel="noopener">Read the Quick start/);
  assert.match(html, /Hide this card/);
  assert.equal(dom.els.pageTitle.textContent, 'Welcome to DartDraw');
  assert.equal(dom.els.pageHelp.hidden, true, 'no step: no step "?"');
  assert.equal(calls.length, 0, 'the card itself asks the server nothing');
});

test('Hide this card is remembered in this browser only (one localStorage key), and the card can be shown again', () => {
  setup();
  f('setGetStartedHidden')(true);
  assert.deepEqual(store.writes, ['dartdraw.getStartedHidden']);
  f('render')();
  assert.doesNotMatch(dom.els.stageArea.innerHTML, /getStartedCard/);
  assert.match(dom.els.stageArea.innerHTML, /No tournament open/);
  assert.match(dom.els.stageArea.innerHTML, /onclick="setGetStartedHidden\(false\)">Show the Get started steps/);
  f('setGetStartedHidden')(false);
  assert.match(dom.els.stageArea.innerHTML, /getStartedCard/);
  assert.equal(calls.length, 0);
  // storage that throws (private mode, blocked): the card still shows, nothing breaks
  app.window = new Proxy(WIN, { get: (t, k) => { if (k === 'localStorage') throw new Error('blocked'); return t[k]; } });
  assert.doesNotThrow(() => f('render')());
  assert.match(dom.els.stageArea.innerHTML, /getStartedCard/);
  assert.doesNotThrow(() => f('setGetStartedHidden')(true));
});

test('with a saved event the card is not shown (it is for an empty account only)', () => {
  setup({ withEvent: true });
  f('render')();
  assert.doesNotMatch(dom.els.stageArea.innerHTML, /getStartedCard|Try a sample event/);
  assert.match(dom.els.stageArea.innerHTML, /No tournament open/);
});

/* ---------------- the sample event ---------------- */
test('Try a sample event opens an editable 12-player round robin then knockout on step 3, flagged isSample, in this window only', () => {
  setup();
  f('openSampleEvent')();
  assert.equal(sampleOn(), true);
  const t = run(app, 'state');
  assert.equal(t.format.formatType, 'rrknockout');
  assert.equal(t.eventCreation.competitionUnit, 'Singles');
  assert.equal(t.entriesList.length, 12);
  assert.ok(t.entriesList.every((e, i) => e.name === 'Sample player ' + (i + 1) && e.autoName === false));
  assert.equal(run(app, 'currentStage'), 3);
  assert.equal(run(app, 'Object.keys(tournamentsCache).length'), 0, 'not in the saved list');
  // the banner, its two buttons, and the step "?" for step 3 of a round robin
  const html = dom.els.stageArea.innerHTML;
  assert.match(html, /This is a sample event\. Nothing is saved\./);
  assert.match(html, /onclick="saveSampleAsMine\(\)">Save as my event<\/button>/);
  assert.match(html, /onclick="closeSample\(\)">Close sample<\/button>/);
  assert.equal(dom.els.pageHelp.hidden, false);
  assert.equal(dom.els.pageHelp.getAttribute('href'), '/help#draw-the-groups');
  assert.equal(dom.els.compactStageHelp.getAttribute('href'), '/help#draw-the-groups');
  assert.doesNotMatch(dom.els.savedList.innerHTML, /Sample/, 'Saved tournaments does not list it');
  assert.doesNotMatch(f('compactMenuHTML')(), /Sample tournament|This event/, 'nor the phone menu (and no Rename / Duplicate / Delete for it)');
  assert.equal(calls.length, 0);
});

test('a sample event is never sent: edits, the debounced save, flushSave, retry, the close/hide keepalive save, resume, refresh, the sign-out stash', async () => {
  setup();
  f('openSampleEvent')();
  // real edits through the app's own handlers: draw the groups, confirm, start, rename the entry, re-format
  f('shuffleGroups')();
  assert.ok(run(app, 'state.groups.length') > 0, 'the draw worked');
  run(app, 'state.groups.forEach(g=>{ g.confirmed = true; g.confirmedEntryIds = g.entryIds.slice(); })'); f('persist')();
  run(app, 'state.entriesList[0].name = "Edited"'); f('persist')();
  assert.equal(run(app, 'saveTimer'), null, 'no save is even scheduled');
  assert.equal(run(app, 'savePending'), false);
  assert.equal(run(app, 'pendingSaves.size'), 0);
  assert.equal(await f('flushSave')(), false);
  f('flushSaveNow')();                                      // page hidden / closing
  assert.equal(f('onBeforeUnload')({ preventDefault() {} }), undefined, 'closing the page does not ask "Leave site?"');
  await f('resumeSaving')();
  assert.equal(await f('silentRefresh')(), false);
  assert.equal(f('silentRefreshBlocked')(), 'sample');
  assert.equal(await f('settlePendingSave')(), 'ok');
  f('stashUnsavedForSignIn')();
  run(app, 'savePending = true'); f('stashUnsavedForSignIn')(); f('flushSaveNow')(); assert.equal(await f('flushSave')(), false); run(app, 'savePending = false');
  await settle();
  assert.deepEqual(calls, [], 'not one request');
  assert.deepEqual(store.writes, [], 'nothing in localStorage');
  assert.equal(run(app, 'Object.keys(tournamentsCache).length'), 0);
});

test('a sample cannot be published, listed, finalized, opened in a full-page window, renamed, duplicated or deleted', async () => {
  setup();
  f('openSampleEvent')();
  const id = run(app, 'state.id');
  f('setPublished')(true);
  assert.ok(!run(app, 'state.published'));
  assert.equal(modals.pop().title, 'This is a sample event');
  f('publishResultsNow')(); assert.equal(modals.pop().title, 'This is a sample event');
  f('setListed')(true); assert.ok(!run(app, 'state.listed')); assert.equal(modals.pop().title, 'This is a sample event');
  f('finalizeResults')(); assert.equal(modals.pop().title, 'This is a sample event');
  assert.equal(run(app, 'state.finalized'), undefined);
  f('openInNewWindow')('rr'); assert.equal(modals.pop().title, 'This is a sample event');
  f('renameTournament')(id, { stopPropagation() {} });
  await f('duplicateTournament')(id, { stopPropagation() {} });
  assert.equal(modals.length, 0, 'rename and duplicate cannot reach it');
  assert.match(f('publicResultsCardHTML')(), /A sample event can&rsquo;t be published/);
  assert.doesNotMatch(f('publicResultsCardHTML')(), /publishToggle/);
  assert.match(f('publishForQrNoteHTML')(), /A sample event prints without QR codes/);
  f('deleteTournament')(id, { stopPropagation() {} });
  assert.equal(modals.length, 0, 'delete has nothing to delete on the server: it just closes the sample');
  assert.equal(run(app, 'state'), null);
  await settle();
  assert.deepEqual(calls, []);
});

test('Save as my event sends exactly one create (no stamp, no sample flag), then it is an ordinary saved event', async () => {
  setup();
  f('openSampleEvent')();
  f('shuffleGroups')();
  const id = run(app, 'state.id');
  assert.equal(await f('saveSampleAsMine')(), true);
  await settle();
  assert.equal(puts().length, 1, 'one PUT');
  const p = puts()[0];
  assert.equal(p.id, id);
  assert.equal(p.body.expectedUpdatedAt, null, 'a create: no stamp');
  assert.equal(p.body.data.isSample, undefined, 'the flag is never stored');
  assert.equal(p.keepalive, false);
  assert.equal(server[id].updated_at, 'S1');
  assert.equal(sampleOn(), false);
  assert.equal(run(app, 'dbUpdatedAtCache[state.id]'), 'S1');
  assert.ok(run(app, 'tournamentsCache[state.id] === state'), 'it is in Saved tournaments');
  assert.match(toasts.join(' '), /Saved as your event/);
  // a second click does nothing more
  assert.equal(await f('saveSampleAsMine')(), false);
  // from now on edits save normally, with the stamp
  run(app, 'state.entriesList[0].name = "Kept"'); f('persist')(); run(app, 'clearTimeout(saveTimer); saveTimer = null');
  assert.equal(await f('flushSave')(), true);
  assert.equal(puts().length, 2);
  assert.equal(puts()[1].body.expectedUpdatedAt, 'S1');
});

test('Save as my event from the refusal box (publishing) keeps it too', async () => {
  setup();
  f('openSampleEvent')();
  f('setPublished')(true);
  modals.pop().onConfirm();
  await settle();
  assert.equal(puts().length, 1);
  assert.equal(sampleOn(), false);
});

test('Close sample, a new event, opening another event and logging out drop the sample without a prompt or a save', async () => {
  // Close sample: back to the welcome card
  setup();
  f('openSampleEvent')(); f('shuffleGroups')();
  f('closeSample')();
  assert.equal(run(app, 'state'), null);
  assert.match(dom.els.stageArea.innerHTML, /getStartedCard/);
  // + New tournament
  f('openSampleEvent')(); f('shuffleGroups')();
  await f('newTournament')();
  assert.equal(sampleOn(), false);
  assert.equal(run(app, 'currentStage'), 1);
  // opening another event (an Admin may have one, or one saved meanwhile in another window)
  setup({ withEvent: true });
  run(app, 'state = tournamentsCache.t_real');
  f('openSampleEvent')();
  assert.equal(run(app, 'state.id'), 't_real', 'with a real event open, the sample never replaces it');
  run(app, 'state = null; tournamentsCache = {}');
  f('openSampleEvent')(); f('shuffleGroups')();
  assert.equal(await f('openTournament')('t_real'), true);
  assert.equal(run(app, 'state.id'), 't_real');
  // logging out
  run(app, 'state = null; tournamentsCache = {}'); f('openSampleEvent')(); assert.equal(sampleOn(), true);
  await f('logout')();
  assert.equal(modals.length, 0, 'no "unsaved" prompt anywhere');
  assert.equal(puts().length, 0, 'nothing was saved');
  assert.ok(calls.some((c) => c.method === 'POST' && /\/api\/auth\/logout$/.test(c.url)), 'logged out');
  assert.deepEqual(store.writes, []);
});

/* ---------------- contextual Help in the app ---------------- */
test('step "?" links follow the step (and the format on step 3), and boxes that explain a refusal link to Help', () => {
  setup({ withEvent: true });
  const t = run(app, 'tournamentsCache.t_real'); useState(app, t);
  const want = { 1: 'creating-an-event', 2: 'choosing-a-format', 4: 'draws-and-printing', 5: 'managing-the-tournament', 6: 'review', 7: 'review' };
  Object.keys(want).forEach((n) => {
    run(app, 'currentStage = ' + n); f('renderStageHelp')();
    assert.equal(dom.els.pageHelp.getAttribute('href'), '/help#' + want[n], 'step ' + n);
    assert.match(dom.els.pageHelp.getAttribute('aria-label'), new RegExp('^Help: step ' + n + ', '));
  });
  t.format.formatType = 'knockout'; run(app, 'currentStage = 3'); f('renderStageHelp')();
  assert.equal(dom.els.pageHelp.getAttribute('href'), '/help#entries-and-check-in');
  t.format.formatType = 'podknockout'; f('renderStageHelp')();
  assert.equal(dom.els.compactStageHelp.getAttribute('href'), '/help#group-boards');
  run(app, 'adminState.view = "organizers"'); f('renderStageHelp')(); run(app, 'adminState.view = null');
  // the modal: "Learn more in Help" from the title, an explicit one, or none
  app.openModal = ORIG.openModal;
  dom.els.modalBox = makeEl('modalBox');
  const btns = { modalConfirmBtn: makeEl('b1'), modalSecondaryBtn: makeEl('b2'), modalErr: makeEl('e') };
  Object.assign(dom.els, btns);
  f('openModal')({ title: 'Updated elsewhere', body: 'x', confirmLabel: 'OK', onConfirm: () => {} });
  assert.match(dom.els.modalBox.innerHTML, /<p class="modal-help"><a href="\/help#troubleshooting-save" target="_blank" rel="noopener">Learn more in Help<\/a><\/p>/);
  f('openModal')({ title: 'Games have started in Group A', body: 'x', confirmLabel: 'OK', onConfirm: () => {} });
  assert.match(dom.els.modalBox.innerHTML, /href="\/help#player-leaves"/);
  f('openModal')({ title: 'Delete tournament?', body: 'x', confirmLabel: 'OK', onConfirm: () => {} });
  assert.doesNotMatch(dom.els.modalBox.innerHTML, /modal-help/, 'an ordinary question has no link');
  f('openModal')({ title: 'Updated elsewhere', body: 'x', confirmLabel: 'OK', onConfirm: () => {}, help: false });
  assert.doesNotMatch(dom.els.modalBox.innerHTML, /modal-help/);
  // the save status: "What does this mean?" only while it reports a problem
  ['error', 'failed', 'gone'].forEach((s) => { f('setSaveStatus')(s); assert.equal(dom.els.saveStatusHelp.hidden, false, s); });
  f('setSaveStatus')('ok'); assert.equal(dom.els.saveStatusHelp.hidden, true);
});

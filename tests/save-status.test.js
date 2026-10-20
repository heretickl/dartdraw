const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, useState } = require('./lib/helpers');

const app = loadApp();
const f = (n) => run(app, n);
const DOC = app.document;
const ORIG = {};
['apiFetch', 'openTournament', 'flushSave'].forEach((n) => { ORIG[n] = run(app, n); });

// A stand-in for the #saveStatus element, wired in as the page's getElementById.
function statusEl() {
  const el = { textContent: '', onclick: null, errorClass: false, classList: { toggle(name, on) { if (name === 'error') el.errorClass = !!on; } } };
  app.document = new Proxy(DOC, { get: (t, k) => (k === 'getElementById' ? (id) => (id === 'saveStatus' ? el : null) : t[k]) });
  return el;
}
function setup() {
  Object.keys(ORIG).forEach((n) => { app[n] = ORIG[n]; });
  const t = f('blankTournament')(); useState(app, t); t.id = 't_ss1';
  run(app, 'lockedIds.clear(); staleIds.clear(); staleCurrent = {}; pendingSaves.clear(); sentCopies.clear(); keepaliveSave = null; staleReloading = false; tournamentsCache = {}; dbUpdatedAtCache = {}; saveTimer = null; saveInFlight = false; savePendingId = null; finalizing = false; lastSaveStatus = ""');
  app.render = () => {}; app.renderSavedList = () => {};
  return t;
}

test('a real conflict says Updated elsewhere and clicking reloads the saved copy', () => {
  setup(); const el = statusEl();
  const opened = []; app.openTournament = (id) => { opened.push(id); };
  f('setSaveStatus')('error');
  assert.equal(el.textContent, 'Updated elsewhere — click to reload');
  assert.equal(el.errorClass, true);
  el.onclick();
  assert.deepEqual(opened, ['t_ss1']);
});

test('a save that did not reach the server says Couldn’t save and clicking retries it', () => {
  setup(); const el = statusEl();
  let retries = 0; app.flushSave = () => { retries++; };
  f('setSaveStatus')('failed');
  assert.equal(el.textContent, 'Couldn’t save — click to retry');
  assert.equal(el.errorClass, true);
  el.onclick();
  assert.equal(retries, 1);
});

test('saving, saved and finalizing keep their wording and are not clickable', () => {
  setup(); const el = statusEl();
  f('setSaveStatus')('saving'); assert.equal(el.textContent, 'Saving…'); assert.equal(el.onclick, null); assert.equal(el.errorClass, false);
  f('setSaveStatus')('ok'); assert.equal(el.textContent, 'Saved'); assert.equal(el.onclick, null);
  f('setSaveStatus')('finalizing'); assert.equal(el.textContent, 'Finalizing…');
});

test('a server error, a network error and a 403 that is not a lock all show Couldn’t save, never Updated elsewhere', async () => {
  for (const kind of ['500', 'network', '403']) {
    setup(); const el = statusEl();
    app.apiFetch = kind === 'network' ? () => Promise.reject(new Error('offline'))
      : () => Promise.resolve({ ok: false, status: kind === '500' ? 500 : 403, json: async () => ({ error: 'nope' }) });
    const ok = await f('flushSaveOnce')();
    assert.equal(ok, false, kind);
    assert.equal(f('lastSaveStatus'), 'failed', kind);
    assert.equal(el.textContent, 'Couldn’t save — click to retry', kind);
  }
});

test('a 409 conflict still shows Updated elsewhere, and does not adopt the server’s stamp (this window’s copy is still the old one)', async () => {
  const t = setup(); const el = statusEl();
  const current = JSON.parse(JSON.stringify(t)); current.otherWindowScore = 1;   // the other window's change
  app.apiFetch = () => Promise.resolve({ ok: false, status: 409, json: async () => ({ error: 'Tournament changed elsewhere.', current: { id: 't_ss1', data: current, updated_at: 'NEWER' } }) });
  const ok = await f('flushSaveOnce')();
  assert.equal(ok, false);
  assert.equal(f('lastSaveStatus'), 'error');
  assert.equal(el.textContent, 'Updated elsewhere — click to reload');
  assert.equal(run(app, 'dbUpdatedAtCache["t_ss1"]'), undefined);
  assert.equal(run(app, 'staleIds.has("t_ss1")'), true);
});

test('a successful save shows Saved', async () => {
  setup(); const el = statusEl();
  app.apiFetch = () => Promise.resolve({ ok: true, status: 200, json: async () => ({ updated_at: 'S1' }) });
  assert.equal(await f('flushSaveOnce')(), true);
  assert.equal(el.textContent, 'Saved');
});

/* ---- leaving the tab must not make the tab's own next save a false conflict ---- */
const tick = () => new Promise((r) => setImmediate(r));

test('hiding the tab with nothing unsaved sends nothing (it would only change the stored version behind the tab’s back)', () => {
  setup(); run(app, 'savePending = false; saveInFlight = false');
  let sent = 0; app.fetch = () => { sent++; return Promise.resolve({ ok: true, json: async () => ({ updated_at: 'X' }) }); };
  f('flushSaveNow')();
  assert.equal(sent, 0);
});

test('hiding the tab with an unsaved edit saves it and remembers the new version stamp, so the next save is not refused', async () => {
  setup(); run(app, 'dbUpdatedAtCache["t_ss1"] = "S1"; savePending = true; saveRev = 3; saveInFlight = false');
  const sent = [];
  app.fetch = (url, o) => { sent.push(JSON.parse(o.body)); return Promise.resolve({ ok: true, json: async () => ({ updated_at: 'S2' }) }); };
  f('flushSaveNow')();
  await tick(); await tick();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].expectedUpdatedAt, 'S1');
  assert.equal(run(app, 'dbUpdatedAtCache["t_ss1"]'), 'S2');   // the tab now knows the stamp the server holds
  assert.equal(run(app, 'savePending'), false);
  // and a save right after (the tab was only hidden, not closed) carries the new stamp
  const bodies = [];
  app.apiFetch = (url, o) => { bodies.push(JSON.parse(o.body)); return Promise.resolve({ ok: true, status: 200, json: async () => ({ updated_at: 'S3' }) }); };
  assert.equal(await f('flushSaveOnce')(), true);
  assert.equal(bodies[0].expectedUpdatedAt, 'S2');
});

test('a failed hide-time save keeps the edit marked unsaved so it is tried again', async () => {
  setup(); run(app, 'savePending = true; saveRev = 1; saveInFlight = false');
  app.fetch = () => Promise.resolve({ ok: false, status: 500 });
  f('flushSaveNow')(); await tick(); await tick();
  assert.equal(run(app, 'savePending'), true);
});

test('a save already on its way is not duplicated by hiding the tab', () => {
  setup(); run(app, 'savePending = true; saveInFlight = true');
  let sent = 0; app.fetch = () => { sent++; return Promise.resolve({ ok: true, json: async () => ({}) }); };
  f('flushSaveNow')();
  assert.equal(sent, 0);
  run(app, 'saveInFlight = false');
});

test('an edit marks the tab as having an unsaved change, and a completed save clears it (unless a newer edit arrived)', async () => {
  setup(); statusEl();
  run(app, 'savePending = false; saveRev = 0');
  app.apiFetch = () => Promise.resolve({ ok: true, status: 200, json: async () => ({ updated_at: 'S9' }) });
  f('persist')();
  assert.equal(run(app, 'savePending'), true);
  clearTimeoutStub();
  assert.equal(await f('flushSaveOnce')(), true);
  assert.equal(run(app, 'savePending'), false);
  // an edit made while a save is in flight is not cleared by that save finishing
  let release; const gate = new Promise((r) => { release = r; });
  app.apiFetch = () => gate.then(() => ({ ok: true, status: 200, json: async () => ({ updated_at: 'S10' }) }));
  f('persist')(); clearTimeoutStub();
  const inflight = f('flushSaveOnce')();
  f('persist')(); clearTimeoutStub();                       // a second edit lands while the first save is out
  release(); await inflight;
  assert.equal(run(app, 'savePending'), true);
});
function clearTimeoutStub() { run(app, 'clearTimeout(saveTimer); saveTimer = null'); }

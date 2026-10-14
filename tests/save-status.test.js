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
  run(app, 'lockedIds.clear(); tournamentsCache = {}; dbUpdatedAtCache = {}; saveTimer = null; saveInFlight = false; savePendingId = null; finalizing = false; lastSaveStatus = ""');
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

test('a 409 conflict still shows Updated elsewhere and keeps the server’s stamp', async () => {
  const t = setup(); const el = statusEl();
  const current = JSON.parse(JSON.stringify(t));
  app.apiFetch = () => Promise.resolve({ ok: false, status: 409, json: async () => ({ error: 'Tournament changed elsewhere.', current: { id: 't_ss1', data: current, updated_at: 'NEWER' } }) });
  const ok = await f('flushSaveOnce')();
  assert.equal(ok, false);
  assert.equal(f('lastSaveStatus'), 'error');
  assert.equal(el.textContent, 'Updated elsewhere — click to reload');
  assert.equal(run(app, 'dbUpdatedAtCache["t_ss1"]'), 'NEWER');
});

test('a successful save shows Saved', async () => {
  setup(); const el = statusEl();
  app.apiFetch = () => Promise.resolve({ ok: true, status: 200, json: async () => ({ updated_at: 'S1' }) });
  assert.equal(await f('flushSaveOnce')(), true);
  assert.equal(el.textContent, 'Saved');
});

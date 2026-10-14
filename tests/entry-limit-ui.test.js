const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, useState } = require('./lib/helpers');

// The organiser UI side of the Basic entry limit (the server is the real enforcement; see entry-limit.test.js).
const app = loadApp();
const f = (n) => run(app, n);
const MSG = 'Basic accounts allow up to 64 entries per event. Ask the Admin to upgrade you to Pro.';

const ORIG = {};
['persist', 'openModal', 'apiFetch', 'openTournament', 'setSaveStatus', 'reloadServerCopy'].forEach((n) => { ORIG[n] = run(app, n); });
let modals, persisted, fields, bar;
function reset(organizer) {
  Object.keys(ORIG).forEach((n) => { app[n] = ORIG[n]; });
  modals = []; persisted = 0; bar = { innerHTML: '' };
  app.openModal = (m) => { modals.push(m); };
  app.persist = () => { persisted++; };
  app.render = () => {}; app.renderSavedList = () => {};
  app.setSaveStatus = () => {};
  app.__org = organizer === undefined ? { name: 'Sam', email: 's@x.com', tier: 'basic', entryLimit: 64 } : organizer;
  run(app, 'currentOrganizer = __org; lockedIds.clear(); tournamentsCache = {}; dbUpdatedAtCache = {}; saveInFlight = false; savePendingId = null; saveTimer = null; currentStage = 1');
  app.document = { getElementById: (id) => (id === 'organizerBar' ? bar : (id in fields ? { value: fields[id] } : null)) };
}
function event(active, withdrawn) {
  const t = f('blankTournament')(); useState(app, t);
  t.id = 't_lim1';
  t.eventCreation.saved = true; t.eventCreation.entries = active;
  t.entriesList = Array.from({ length: active + (withdrawn || 0) }, (_, i) => ({ id: 'e' + i, name: 'E' + i, org: '', players: [], withdrawn: i >= active }));
  return t;
}
const setForm = (n) => { fields = { f_tname: 'Cup', f_ename: 'Open', f_etype: 'Open', f_unit: 'Singles', f_date: '2026-10-20', f_entries: String(n) }; };
const activeCount = (t) => t.entriesList.filter((e) => !e.withdrawn).length;

test('entryLimit: the number from /api/auth/me, or none', () => {
  reset(); assert.equal(f('entryLimit')(), 64);
  reset({ name: 'P', tier: 'pro', entryLimit: null }); assert.equal(f('entryLimit')(), null);
  reset({ publicMode: true }); assert.equal(f('entryLimit')(), null);
  reset(null); assert.equal(f('entryLimit')(), null);
});

test('saveStage1 at 65 on Basic: info modal, nothing saved, nothing changed', () => {
  reset(); const t = event(8); setForm(65);
  f('saveStage1')();
  assert.equal(modals.length, 1);
  assert.equal(modals[0].body, MSG);
  assert.equal(persisted, 0);
  assert.equal(t.eventCreation.entries, 8);
  assert.equal(activeCount(t), 8);
  assert.equal(run(app, 'currentStage'), 1);
});

test('saveStage1 at 64 on Basic goes through and builds 64 entries', () => {
  reset(); const t = event(8); setForm(64);
  f('saveStage1')();
  assert.equal(modals.length, 0);
  assert.equal(persisted, 1);
  assert.equal(t.eventCreation.entries, 64);
  assert.equal(activeCount(t), 64);
});

test('saveStage1 is unlimited when entryLimit is null (Pro) or in public mode', () => {
  for (const org of [{ name: 'P', tier: 'pro', entryLimit: null }, { publicMode: true }]) {
    reset(org); const t = event(8); setForm(200);
    f('saveStage1')();
    assert.equal(modals.length, 0);
    assert.equal(activeCount(t), 200);
  }
});

test('saveStage1: an event already over the limit can be edited and shrunk but not grown', () => {
  reset(); let t = event(70); setForm(70);
  f('saveStage1')();
  assert.equal(modals.length, 0); assert.equal(activeCount(t), 70);          // unchanged size is fine
  reset(); t = event(70); setForm(66);
  f('saveStage1')();
  assert.equal(modals.length, 0); assert.equal(activeCount(t), 66);          // shrinking is fine
  reset(); t = event(70); setForm(71);
  f('saveStage1')();
  assert.equal(modals.length, 1); assert.equal(activeCount(t), 70);          // growing is not
});

test('saveStage1 counts only active entries: 64 active plus withdrawn ones cannot be grown past 64', () => {
  reset(); const t = event(64, 5); setForm(65);
  f('saveStage1')();
  assert.equal(modals.length, 1); assert.equal(activeCount(t), 64);
});

test('ensureEntries (run on open and on saving the format step) never grows a Basic event past the limit', () => {
  reset(); let t = event(70); t.entriesList[0].withdrawn = true;               // 69 active, stored entries says 70
  f('ensureEntries')(t);
  assert.equal(activeCount(t), 69);
  reset(); t = event(10); t.eventCreation.entries = 100;                       // a bad stored number on a small event: grows to the limit at most
  f('ensureEntries')(t);
  assert.equal(activeCount(t), 64);
  reset({ name: 'P', tier: 'pro', entryLimit: null }); t = event(10); t.eventCreation.entries = 100;
  f('ensureEntries')(t);
  assert.equal(activeCount(t), 100);
});

test('withdrawing with a named replacement keeps the active count (so it is allowed at the limit)', () => {
  reset(); const t = event(64); t.groups = [{ id: 'g1', label: 'A', entryIds: ['e0', 'e1'], confirmed: false }];
  f('withdrawEntry')('e0');
  assert.equal(modals.length, 1);
  app.document = { getElementById: (id) => (id === 'withdrawReplacement' ? { value: 'Sub Player' } : { value: '' }) };
  modals[0].onConfirm();
  assert.equal(activeCount(t), 64);
  assert.ok(t.entriesList.some((e) => e.name === 'Sub Player'));
});

test('a 403 entry_limit from a save shows the same message and reloads the saved copy', async () => {
  reset(); event(8);
  let opened = null;
  app.apiFetch = async () => ({ status: 403, ok: false, json: async () => ({ code: 'entry_limit', limit: 64, error: 'Basic accounts allow up to 64 entries per event.' }) });
  app.openTournament = async (id) => { opened = id; };
  const ok = await f('flushSaveOnce')();
  assert.equal(ok, false);
  assert.equal(modals.length, 1);
  assert.equal(modals[0].body, MSG);
  assert.equal(opened, 't_lim1');
  assert.equal(run(app, 'lockedIds.size'), 0);                                // not a finalized lock
});

test('a 403 finalized is still handled as before (lock, no entry-limit modal)', async () => {
  reset(); event(8);
  let reloaded = 0;
  app.apiFetch = async () => ({ status: 403, ok: false, json: async () => ({ finalized: true }) });
  app.reloadLockedTournament = async () => { reloaded++; };
  await f('flushSaveOnce')();
  assert.equal(modals.length, 0);
  assert.equal(reloaded, 1);
  assert.equal(run(app, 'lockedIds.has("t_lim1")'), true);
});

test('duplicating an event over the limit shows the message instead of failing silently', async () => {
  reset(); const t = event(70);
  app.__t = t; run(app, 'tournamentsCache = { t_lim1: __t }');
  app.apiFetch = async () => ({ status: 403, ok: false, json: async () => ({ code: 'entry_limit', limit: 64 }) });
  await f('duplicateTournament')('t_lim1', { stopPropagation() {} });
  assert.equal(modals.length, 1);
  assert.equal(modals[0].body, MSG);
});

test('top bar badge: Basic and Pro show a badge, Basic carries the limit as its title, public mode shows none', () => {
  reset(); f('renderOrganizerBar')();
  assert.match(bar.innerHTML, /<span[^>]*class="tier-badge basic"[^>]*title="Up to 64 entries per event"[^>]*>Basic<\/span>/);
  assert.match(bar.innerHTML, /Sam/);
  reset({ name: 'P', email: 'p@x.com', tier: 'pro', entryLimit: null }); f('renderOrganizerBar')();
  assert.match(bar.innerHTML, /class="tier-badge pro"[^>]*>Pro<\/span>/);
  assert.doesNotMatch(bar.innerHTML, /Up to/);
  reset({ publicMode: true }); f('renderOrganizerBar')();
  assert.doesNotMatch(bar.innerHTML, /tier-badge/);
});

test('Stage 1 hint: shown for Basic only', () => {
  reset(); event(8);
  assert.match(f('stage1')(), /Basic: up to 64 entries per event\./);
  reset({ name: 'P', tier: 'pro', entryLimit: null }); event(8);
  assert.doesNotMatch(f('stage1')(), /Basic: up to/);
  reset({ publicMode: true }); event(8);
  assert.doesNotMatch(f('stage1')(), /Basic: up to/);
});

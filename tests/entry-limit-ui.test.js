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
  modals = []; persisted = 0; bar = { innerHTML: '' }; fields = fields || {};
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
const activeCount = (t) => t.entriesList.filter((e) => !e.withdrawn).length;

test('entryLimit: the number from /api/auth/me, or none', () => {
  reset(); assert.equal(f('entryLimit')(), 64);
  reset({ name: 'P', tier: 'pro', entryLimit: null }); assert.equal(f('entryLimit')(), null);
  reset({ publicMode: true }); assert.equal(f('entryLimit')(), null);
  reset(null); assert.equal(f('entryLimit')(), null);
});

/* Since the player library (2026-10-29) entries are added one at a time on step 3 (players-ui.js addEntryFromMembers);
   step 1 has no number of entries. The limit is checked on each add. */
const add = (name) => run(app, 'addEntryFromMembers')('Singles', '', [{ name, eventOnly: true }]);

test('adding the 65th entry on Basic: info modal, nothing added, nothing saved', () => {
  reset(); const t = event(64);
  assert.equal(add('New one'), null);
  assert.equal(modals.length, 1);
  assert.equal(modals[0].body, MSG);
  assert.equal(persisted, 0);
  assert.equal(activeCount(t), 64);
});

test('adding the 64th entry on Basic goes through', () => {
  reset(); const t = event(63);
  assert.ok(add('New one'));
  assert.equal(modals.length, 0);
  assert.equal(persisted, 1);
  assert.equal(activeCount(t), 64);
});

test('adding is unlimited when entryLimit is null (Pro) or in public mode', () => {
  for (const org of [{ name: 'P', tier: 'pro', entryLimit: null }, { publicMode: true }]) {
    reset(org); const t = event(200);
    assert.ok(add('New one'));
    assert.equal(modals.length, 0);
    assert.equal(activeCount(t), 201);
  }
});

test('an event already over the limit keeps its entries but cannot grow', () => {
  reset(); const t = event(70);
  assert.equal(add('New one'), null);
  assert.equal(modals.length, 1); assert.equal(activeCount(t), 70);
});

test('only active entries count: 64 active plus withdrawn ones cannot grow past 64; 63 active plus withdrawn can', () => {
  reset(); let t = event(64, 5);
  assert.equal(add('New one'), null); assert.equal(activeCount(t), 64);
  reset(); t = event(63, 5);
  assert.ok(add('New one')); assert.equal(activeCount(t), 64);
});

test('ensureEntries (run on open and on saving the format step) never adds or removes entries; it only records the count', () => {
  reset(); let t = event(70); t.entriesList[0].withdrawn = true;               // 69 active, stored entries says 70
  f('ensureEntries')(t);
  assert.equal(activeCount(t), 69); assert.equal(t.eventCreation.entries, 69);
  reset(); t = event(10); t.eventCreation.entries = 100;                       // a bad stored number: nothing is filled in
  f('ensureEntries')(t);
  assert.equal(activeCount(t), 10); assert.equal(t.eventCreation.entries, 10);
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

test('the step 3 entry count shows the Basic limit, for Basic only', () => {
  reset(); event(8);
  assert.match(f('entryPickerHintHTML')(), /Basic: up to 64 entries per event\./);
  reset({ name: 'P', tier: 'pro', entryLimit: null }); event(8);
  assert.doesNotMatch(f('entryPickerHintHTML')(), /Basic: up to/);
  reset({ publicMode: true }); event(8);
  assert.doesNotMatch(f('entryPickerHintHTML')(), /Basic: up to/);
});

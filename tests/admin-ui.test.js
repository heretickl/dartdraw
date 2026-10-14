const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, useState } = require('./lib/helpers');

// The Admin screens (admin-ui.js) and their hooks in index.html. The server endpoints are tested elsewhere
// (admin-organizers, admin-events, admin-settings); here apiFetch is stubbed and the exact call is checked.
const app = loadApp();
const f = (n) => run(app, n);
const tick = () => new Promise((r) => setImmediate(r));

const ADMIN = { id: 'adm1', name: 'Boss', email: 'boss@x.com', role: 'admin', tier: 'pro', entryLimit: null };
const ORG = { id: 'org1', name: 'Sam', email: 's@x.com', role: 'organizer', tier: 'basic', entryLimit: 64 };
const EVIL = '<script>alert(1)</script>';

const ORIG = {};
['openModal', 'apiFetch', 'render', 'renderSavedList', 'openTournament', 'newTournament', 'document'].forEach((n) => { ORIG[n] = run(app, n); });
let modals, calls, replies, renders, els, toggled;
function setUser(u) { app.__u = u; run(app, 'currentOrganizer = __u'); }
function reset(user) {
  Object.keys(ORIG).forEach((n) => { app[n] = ORIG[n]; });
  modals = []; calls = []; replies = {}; renders = 0; els = {}; toggled = {};
  app.openModal = (m) => { modals.push(m); };
  app.render = () => { renders++; };
  app.renderSavedList = () => {};
  app.apiFetch = async (url, opts) => {
    const method = (opts && opts.method) || 'GET';
    calls.push({ url, method, body: opts && opts.body ? JSON.parse(opts.body) : undefined });
    const r = replies[method + ' ' + url] || { status: 200, body: {} };
    return { ok: r.status < 400, status: r.status, json: async () => { if (r.body === undefined) throw new Error('no body'); return r.body; } };
  };
  app.document = { getElementById: (id) => (id in els ? els[id] : null), body: { classList: { toggle: (c, on) => { toggled[c] = on; } } } };
  run(app, 'currentOrganizer = null; adminState.view = null; adminState.organizers = null; adminState.events = null; adminState.settings = null; adminState.error = ""; adminState.notice = ""; adminState.loading = false; adminState.filters = { q: "", owner: "", offset: 0, limit: 50 }; adminEditing = null; foreignOpenIds.clear(); state = null; lockedIds.clear(); tournamentsCache = {}; dbUpdatedAtCache = {}');
  setUser(user === undefined ? ADMIN : user);
}
const reply = (key, status, body) => { replies[key] = { status, body }; };

const org = (o) => Object.assign({ id: 'o1', email: 'a@x.com', name: 'Alex', role: 'organizer', tier: 'basic', effectiveTier: 'basic', suspended: false, verified: true, createdAt: '2026-10-01T10:00:00.000Z', eventCount: 0 }, o || {});
const ev = (o) => Object.assign({ id: 't_1', tournamentName: 'Cup', eventName: 'Open', owner: { id: 'o1', name: 'Alex', email: 'a@x.com' }, format: 'roundrobin', date: '2026-10-20', published: false, listed: false, finalizedAt: null, updatedAt: '2026-10-12T10:00:00.000Z' }, o || {});
const rowOf = (html, needle) => html.split('<tr').find((r) => r.includes(needle)) || '';

/* ---------- isAdminUser ---------- */
test('isAdminUser: only a signed-in admin', () => {
  reset(ADMIN); assert.equal(f('isAdminUser')(), true);
  reset(ORG); assert.equal(f('isAdminUser')(), false);
  reset(null); assert.equal(f('isAdminUser')(), false);
  reset({ publicMode: true }); assert.equal(f('isAdminUser')(), false);
  reset({ role: 'Admin' }); assert.equal(f('isAdminUser')(), false);
});

/* ---------- Organisers view ---------- */
test('adminOrganizersHTML escapes every server text', () => {
  reset();
  const html = f('adminOrganizersHTML')([org({ id: "o'1", name: EVIL, email: EVIL + '@x.com' })]);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /onclick="[^"]*'o'1'/);   // a quote in an id cannot break out of the handler
});

test('adminOrganizersHTML: columns, status words and the Pro (via Admin) label', () => {
  reset();
  const html = f('adminOrganizersHTML')([
    org({ id: 'p', name: 'Pat', tier: 'pro', effectiveTier: 'pro' }),
    org({ id: 'b', name: 'Bea', tier: 'basic' }),
    org({ id: 's', name: 'Sue', suspended: true }),
    org({ id: 'u', name: 'Uma', verified: false }),
    org({ id: 'adm2', name: 'Other Admin', role: 'admin', tier: 'basic', effectiveTier: 'pro' }),
  ]);
  assert.match(rowOf(html, 'Pat'), />Pro</);
  assert.match(rowOf(html, 'Bea'), />Basic</);
  assert.match(rowOf(html, 'Sue'), /Suspended/);
  assert.match(rowOf(html, 'Uma'), /Unverified/);
  assert.match(rowOf(html, 'Bea'), /Active/);
  assert.match(rowOf(html, 'Other Admin'), /Pro \(via Admin\)/);
  assert.match(html, /adminCreateOrganizer\(\)/);
});

test('adminOrganizersHTML: per-row controls follow role, status and event count', () => {
  reset();
  const html = f('adminOrganizersHTML')([
    org({ id: 'b', name: 'Bea', tier: 'basic', eventCount: 0 }),
    org({ id: 'p', name: 'Pat', tier: 'pro', eventCount: 3 }),
    org({ id: 's', name: 'Sue', suspended: true }),
    org({ id: 'u', name: 'Uma', verified: false }),
    org({ id: 'adm2', name: 'Other Admin', role: 'admin', tier: 'basic' }),
  ]);
  const bea = rowOf(html, 'Bea'), pat = rowOf(html, 'Pat'), sue = rowOf(html, 'Sue'), uma = rowOf(html, 'Uma'), adm = rowOf(html, 'Other Admin');
  assert.match(bea, /adminSetTier\('b','pro'\)/);
  assert.match(pat, /adminSetTier\('p','basic'\)/);
  assert.doesNotMatch(adm, /adminSetTier/);                       // an admin is Pro whatever the stored tier says
  assert.match(bea, /adminToggleSuspend\('b',true\)/);
  assert.match(sue, /adminToggleSuspend\('s',false\)/);
  assert.match(bea, /adminSetRole\('b','admin'\)/);
  assert.match(adm, /adminSetRole\('adm2','organizer'\)/);
  assert.match(bea, /adminResetLink\('b'\)/);
  assert.doesNotMatch(sue, /adminResetLink\('s'\)/);              // the server refuses a link for a suspended account
  assert.doesNotMatch(uma, /adminSetRole\('u','admin'\)/);        // an unverified account cannot be promoted
  assert.doesNotMatch(bea, /adminTransferOrganizer/);             // nothing to move
  assert.match(pat, /adminTransferOrganizer\('p'\)/);
  assert.match(bea, /adminDeleteOrganizer\('b'\)/);
  assert.doesNotMatch(pat, /adminDeleteOrganizer\('p'\)/);        // owns events: shown disabled
  assert.match(pat, /disabled[^>]*title="[^"]*Transfer or delete their events first/);
});

test('adminOrganizersHTML: no demote, suspend or delete controls on the caller\'s own row', () => {
  reset();
  const html = f('adminOrganizersHTML')([org({ id: 'adm1', name: 'Boss', email: 'boss@x.com', role: 'admin', tier: 'pro' }), org({ id: 'o2', name: 'Other' })]);
  const mine = rowOf(html, 'boss@x.com');
  assert.ok(mine.length > 0);
  assert.doesNotMatch(mine, /adminSetRole|adminToggleSuspend|adminDeleteOrganizer|adminSetTier/);
  assert.match(mine, /You/);
  assert.match(rowOf(html, 'Other'), /adminDeleteOrganizer\('o2'\)/);
});

test('adminOrganizersHTML: empty list says so', () => {
  reset();
  assert.match(f('adminOrganizersHTML')([]), /No organisers/);
  assert.doesNotThrow(() => f('adminOrganizersHTML')(null));
});

/* ---------- Events view ---------- */
test('adminEventsHTML escapes event names, owner names and emails, and the search text', () => {
  reset();
  const html = f('adminEventsHTML')(
    { events: [ev({ tournamentName: EVIL, eventName: EVIL, owner: { id: 'x', name: EVIL, email: EVIL + '@x.com' } })], total: 1 },
    { q: '"><script>alert(2)</script>', owner: '', offset: 0, limit: 50 },
    [org({ name: EVIL, email: EVIL + '@x.com' })]);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test('adminEventsHTML: Reopen only for a finalized event; status chips; Open always', () => {
  reset();
  const html = f('adminEventsHTML')({ events: [
    ev({ id: 't_a', tournamentName: 'Fin', finalizedAt: '2026-10-13T09:00:00.000Z', published: true, listed: true }),
    ev({ id: 't_b', tournamentName: 'Plain one' }),
    ev({ id: 't_c', tournamentName: 'Zebra', published: true }),
  ], total: 3 }, { q: '', owner: '', offset: 0, limit: 50 }, []);
  const a = rowOf(html, 'Fin'), b = rowOf(html, 'Plain one'), c = rowOf(html, 'Zebra');
  assert.match(a, /adminEventAction\('t_a','reopen'\)/);
  assert.doesNotMatch(b, /'reopen'/); assert.doesNotMatch(c, /'reopen'/);
  assert.match(a, /Finalized/); assert.match(a, /Published/); assert.match(a, /Listed/);
  assert.doesNotMatch(b, /Finalized|Published|Listed/);
  [a, b, c].forEach((r) => { assert.match(r, /adminOpenEvent\('t_/); assert.match(r, /adminEventTransfer\('t_/); assert.match(r, /adminEventDelete\('t_/); });
  assert.match(a, /'unpublish'/); assert.match(a, /'unlist'/);
  assert.match(c, /'unpublish'/); assert.doesNotMatch(c, /'unlist'/);   // not on the public list
  assert.doesNotMatch(b, /'unpublish'|'unlist'/);                       // nothing public to take down
});

test('adminEventsHTML: owner filter, search value and paging', () => {
  reset();
  const filters = { q: 'cup', owner: 'o2', offset: 50, limit: 50 };
  const html = f('adminEventsHTML')({ events: [ev()], total: 120 }, filters, [org({ id: 'o1', name: 'Alex' }), org({ id: 'o2', name: 'Bea', email: 'bea@x.com' })]);
  assert.match(html, /value="cup"/);
  assert.match(html, /<option value="o2" selected>/);
  assert.match(html, /51.{1,3}51 of 120/);
  assert.match(html, /adminEventsPage\(-1\)/); assert.match(html, /adminEventsPage\(1\)/);
  const first = f('adminEventsHTML')({ events: [ev()], total: 3 }, { q: '', owner: '', offset: 0, limit: 50 }, []);
  assert.match(first, /1.{1,3}1 of 3|1.{1,3}3 of 3/);
  assert.doesNotMatch(first, /onclick="adminEventsPage\(-1\)"/);    // no page before the first
  assert.doesNotMatch(first, /onclick="adminEventsPage\(1\)"/);
  assert.match(f('adminEventsHTML')({ events: [], total: 0 }, { q: 'zz', owner: '', offset: 0, limit: 50 }, []), /No events/);
});

/* ---------- Settings view and invite modal ---------- */
test('adminSettingsHTML shows both numbers and their allowed ranges', () => {
  reset();
  const html = f('adminSettingsHTML')({ resultsDays: 21, liveHours: 36, limits: { resultsDays: [1, 90], liveHours: [1, 168] } });
  assert.match(html, /id="adminSetResults"[^>]*value="21"/);
  assert.match(html, /id="adminSetLive"[^>]*value="36"/);
  assert.match(html, /1 to 90/); assert.match(html, /1 to 168/);
  assert.match(html, /adminSaveSettings\(\)/);
  assert.doesNotThrow(() => f('adminSettingsHTML')(null));
});

test('adminInviteLinkModalHTML: escaped link and email, Copy button, how long it works', () => {
  reset();
  const html = f('adminInviteLinkModalHTML')('https://x.test/reset.html?token="><script>1</script>', EVIL + '@x.com');
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /Send this link to the organiser\. It works for 7 days\./);
  assert.match(html, /adminCopyLink\(\)/);
  assert.match(f('adminInviteLinkModalHTML')('https://x.test/r', 'a@x.com', 'reset'), /works for 1 hour/);
});

/* ---------- Sidebar entry, banner, Reopen button ---------- */
test('the sidebar Admin entry exists only for an admin', () => {
  reset(ADMIN); assert.match(f('adminNavHTML')(), /adminShow\('organizers'\)/); assert.match(f('adminNavHTML')(), />Admin</);
  reset(ORG); assert.equal(f('adminNavHTML')(), '');
  reset(null); assert.equal(f('adminNavHTML')(), '');
  reset({ publicMode: true }); assert.equal(f('adminNavHTML')(), '');
});

test('renderOrganizerBar fills #adminNav for an admin and clears it for anyone else', () => {
  reset(ADMIN); els.organizerBar = { innerHTML: '' }; els.adminNav = { innerHTML: '' };
  f('renderOrganizerBar')();
  assert.match(els.adminNav.innerHTML, /adminShow/);
  assert.match(els.organizerBar.innerHTML, /Admin/);
  setUser(ORG); f('renderOrganizerBar')();
  assert.equal(els.adminNav.innerHTML, '');
});

function lockedEvent() {
  const t = f('blankTournament')(); t.id = 't_lk'; t.finalized = { at: '2026-10-13T09:30:00.000Z' };
  useState(app, t); return t;
}

test('finalized banner: Reopen to edit for an admin only, and it survives the finalized lock', () => {
  reset(ADMIN); lockedEvent();
  assert.match(f('finalizedBannerHTML')(), /Reopen to edit/);
  assert.match(f('finalizedBannerHTML')(), /adminReopenCurrent\(\)/);
  assert.equal(f('finalizedActionAllowed')('adminReopenCurrent()'), true);
  setUser(ORG); assert.doesNotMatch(f('finalizedBannerHTML')(), /Reopen/);
  setUser(null); assert.doesNotMatch(f('finalizedBannerHTML')(), /Reopen/);
  setUser(ADMIN); run(app, 'state = null'); assert.equal(f('finalizedBannerHTML')(), '');
  run(app, 'state = blankTournament()'); assert.equal(f('finalizedBannerHTML')(), '');   // an open event has no banner and no button
});

test('banner "Editing <owner>\'s event as Admin": whenever a foreign event is open, for an admin only, escaped', () => {
  reset(ADMIN);
  const t = f('blankTournament')(); t.id = 't_x'; useState(app, t);
  assert.equal(f('adminEditBannerHTML')(), '');                                   // nothing foreign open
  run(app, 'foreignOpenIds.set("t_x", { ownerId: "o9", ownerName: ' + JSON.stringify(EVIL) + ' })');
  const html = f('adminEditBannerHTML')();
  assert.match(html, /Editing .*&lt;script&gt;.*'s event as Admin/);
  assert.doesNotMatch(html, /<script>/);
  run(app, 'foreignOpenIds.set("t_x", { ownerId: null, ownerName: "" })');
  assert.match(f('adminEditBannerHTML')(), /Editing another organiser's event as Admin/);   // owner unknown
  run(app, 'foreignOpenIds.clear(); foreignOpenIds.set("t_other", { ownerId: "o9", ownerName: "Zed" })');
  assert.equal(f('adminEditBannerHTML')(), '');                                   // a different event is the foreign one
  run(app, 'foreignOpenIds.set("t_x", { ownerId: "o9", ownerName: "Zed" })');
  setUser(ORG); assert.equal(f('adminEditBannerHTML')(), '');
});

/* ---------- render() while an Admin view is showing ---------- */
test('render() draws the Admin view in #stageArea, hides the stage steps, and Back clears it', () => {
  reset(ADMIN); app.render = ORIG.render;
  els.pageTitle = { textContent: '' }; els.pageSub = { textContent: '' }; els.stageArea = { innerHTML: '' };
  app.__org = [org({ name: 'Zed' })];
  run(app, 'adminState.view = "organizers"; adminState.organizers = __org');
  f('render')();
  assert.match(els.stageArea.innerHTML, /Zed/);
  assert.match(els.stageArea.innerHTML, /Back to my events/);
  assert.equal(els.pageTitle.textContent, 'Admin');
  assert.equal(toggled['admin-mode'], true);
  f('adminBack')();
  assert.equal(run(app, 'adminState.view'), null);
  assert.equal(toggled['admin-mode'], false);
  assert.doesNotMatch(els.stageArea.innerHTML, /Back to my events/);
});

test('render(): a non-admin never gets the Admin view, even with adminState.view forced', () => {
  reset(ORG); app.render = ORIG.render;
  els.pageTitle = { textContent: '' }; els.pageSub = { textContent: '' }; els.stageArea = { innerHTML: '' };
  run(app, 'adminState.view = "organizers"; adminState.organizers = [{ id: "z", name: "Zed", email: "z@x.com", role: "organizer", tier: "basic" }]');
  f('render')();
  assert.doesNotMatch(els.stageArea.innerHTML, /Zed|Back to my events/);
  assert.equal(els.pageTitle.textContent, 'Welcome to DartDraw');
  assert.equal(toggled['admin-mode'], false);
});

test('opening or starting an event leaves the Admin view', () => {
  reset(ADMIN);
  run(app, 'adminState.view = "events"'); app.newTournament = ORIG.newTournament;
  f('newTournament')();
  assert.equal(run(app, 'adminState.view'), null);
});

/* ---------- Actions: endpoint, method, body ---------- */
async function adminUserLoads(view, replyMap) {
  Object.keys(replyMap || {}).forEach((k) => reply(k, 200, replyMap[k]));
  await f('adminShow')(view);
}

test('adminShow loads each view from its endpoint', async () => {
  reset(); reply('GET /api/admin/organizers', 200, { organizers: [org()] });
  await f('adminShow')('organizers');
  assert.deepEqual(calls.map((c) => c.method + ' ' + c.url), ['GET /api/admin/organizers']);
  assert.equal(run(app, 'adminState.view'), 'organizers');
  assert.equal(run(app, 'adminState.organizers.length'), 1);

  reset(); reply('GET /api/admin/organizers', 200, { organizers: [org()] });
  reply('GET /api/admin/events?limit=50&offset=0', 200, { events: [ev()], total: 1 });
  await f('adminShow')('events');
  assert.deepEqual(calls.map((c) => c.method + ' ' + c.url).sort(), ['GET /api/admin/events?limit=50&offset=0', 'GET /api/admin/organizers']);
  assert.equal(run(app, 'adminState.events.total'), 1);

  reset(); reply('GET /api/admin/settings', 200, { resultsDays: 14, liveHours: 48, limits: { resultsDays: [1, 90], liveHours: [1, 168] } });
  await f('adminShow')('settings');
  assert.deepEqual(calls.map((c) => c.method + ' ' + c.url), ['GET /api/admin/settings']);
  assert.equal(run(app, 'adminState.settings.resultsDays'), 14);
});

test('adminShow: a failed load shows the problem in the view and never throws', async () => {
  reset(); reply('GET /api/admin/organizers', 500, { error: 'Could not complete that request.' });
  await f('adminShow')('organizers');
  assert.match(run(app, 'adminState.error'), /Could not complete that request/);
  reset(); app.apiFetch = async () => { throw new Error('offline'); };
  await f('adminShow')('organizers');
  assert.notEqual(run(app, 'adminState.error'), '');
});

test('adminShow ignores unknown views', async () => {
  reset(); await f('adminShow')('nope');
  assert.equal(run(app, 'adminState.view'), null); assert.equal(calls.length, 0);
});

test('events search sends q, owner, limit and offset, URL-encoded; paging moves the offset', async () => {
  reset();
  reply('GET /api/admin/organizers', 200, { organizers: [] });
  reply('GET /api/admin/events?q=a%26b%20c&owner=o2&limit=50&offset=0', 200, { events: [], total: 120 });
  reply('GET /api/admin/events?q=a%26b%20c&owner=o2&limit=50&offset=50', 200, { events: [], total: 120 });
  run(app, 'adminState.view = "events"; adminState.organizers = []');
  els.adminEvQ = { value: ' a&b c ' }; els.adminEvOwner = { value: 'o2' };
  await f('adminEventsSearch')();
  assert.equal(calls[calls.length - 1].url, '/api/admin/events?q=a%26b%20c&owner=o2&limit=50&offset=0');
  await f('adminEventsPage')(1);
  assert.equal(calls[calls.length - 1].url, '/api/admin/events?q=a%26b%20c&owner=o2&limit=50&offset=50');
  await f('adminEventsPage')(-1);
  assert.equal(calls[calls.length - 1].url, '/api/admin/events?q=a%26b%20c&owner=o2&limit=50&offset=0');
  await f('adminEventsPage')(-1);                                           // already on the first page
  assert.equal(run(app, 'adminState.filters.offset'), 0);
});

test('adminSetTier / adminToggleSuspend / adminSetRole PATCH the organiser', async () => {
  reset(); reply('GET /api/admin/organizers', 200, { organizers: [org({ id: 'o1', name: 'Alex' })] });
  await f('adminShow')('organizers'); calls.length = 0;

  await f('adminSetTier')('o1', 'pro');
  assert.deepEqual(calls[0], { url: '/api/admin/organizers/o1', method: 'PATCH', body: { tier: 'pro' } });
  assert.equal(calls[1].method + ' ' + calls[1].url, 'GET /api/admin/organizers');   // refreshed

  calls.length = 0; modals.length = 0;
  await f('adminToggleSuspend')('o1', true);                                 // suspending asks first
  assert.equal(calls.length, 0); assert.equal(modals.length, 1); assert.match(modals[0].body, /Alex/);
  await modals[0].onConfirm(); await tick();
  assert.deepEqual(calls[0], { url: '/api/admin/organizers/o1', method: 'PATCH', body: { suspended: true } });

  calls.length = 0; modals.length = 0;
  await f('adminToggleSuspend')('o1', false);                                // reactivating does not
  assert.deepEqual(calls[0], { url: '/api/admin/organizers/o1', method: 'PATCH', body: { suspended: false } });

  calls.length = 0; modals.length = 0;
  await f('adminSetRole')('o1', 'admin');
  assert.equal(calls.length, 0); assert.equal(modals.length, 1);
  await modals[0].onConfirm(); await tick();
  assert.deepEqual(calls[0], { url: '/api/admin/organizers/o1', method: 'PATCH', body: { role: 'admin' } });
});

test('adminSetTier / adminToggleSuspend / adminSetRole refuse bad input and the caller\'s own row without calling the server', async () => {
  reset(); reply('GET /api/admin/organizers', 200, { organizers: [org({ id: 'o1' })] });
  await f('adminShow')('organizers'); calls.length = 0;
  await f('adminSetTier')('o1', 'gold');
  await f('adminSetRole')('o1', 'root');
  await f('adminSetRole')('adm1', 'organizer');
  await f('adminToggleSuspend')('adm1', true);
  await f('adminDeleteOrganizer')('adm1');
  assert.equal(calls.length, 0);
});

test('a server refusal on a PATCH is shown in an info modal with the server\'s words', async () => {
  reset(); reply('GET /api/admin/organizers', 200, { organizers: [org()] });
  await f('adminShow')('organizers'); calls.length = 0;
  reply('PATCH /api/admin/organizers/o1', 409, { error: 'You cannot suspend yourself.' });
  const ok = await f('adminSetTier')('o1', 'pro');
  assert.equal(ok, false);
  assert.equal(modals.length, 1);
  assert.match(modals[0].body, /You cannot suspend yourself\./);
  assert.equal(calls.filter((c) => c.method === 'GET').length, 0);          // no refresh after a failure
});

test('server text in an error modal is escaped', async () => {
  reset(); reply('GET /api/admin/organizers', 200, { organizers: [org()] });
  await f('adminShow')('organizers');
  reply('PATCH /api/admin/organizers/o1', 409, { error: EVIL });
  await f('adminSetTier')('o1', 'pro');
  assert.doesNotMatch(modals[0].body, /<script>/);
  assert.match(modals[0].body, /&lt;script&gt;/);
});

test('adminCreateOrganizer: modal, validation, POST, then the invite link modal', async () => {
  reset(); reply('GET /api/admin/organizers', 200, { organizers: [] });
  await f('adminCreateOrganizer')();
  assert.equal(modals.length, 1);
  assert.match(modals[0].bodyHTML, /adminNewName/); assert.match(modals[0].bodyHTML, /adminNewEmail/); assert.match(modals[0].bodyHTML, /adminNewTier/);
  els.adminNewName = { value: '  ' }; els.adminNewEmail = { value: 'pat@x.com' }; els.adminNewTier = { value: 'pro' };
  assert.ok(modals[0].onConfirm().error);                                    // a name is needed
  els.adminNewName = { value: 'Pat' }; els.adminNewEmail = { value: 'nope' };
  assert.ok(modals[0].onConfirm().error);                                    // an email shape is needed
  assert.equal(calls.length, 0);

  els.adminNewEmail = { value: ' Pat@X.com ' };
  reply('POST /api/admin/organizers', 201, { organizer: org({ id: 'n1', name: 'Pat' }), link: 'https://x.test/reset.html?token=abc' });
  const done = modals[0].onConfirm();
  await done; await tick();
  assert.deepEqual(calls[0], { url: '/api/admin/organizers', method: 'POST', body: { name: 'Pat', email: 'Pat@X.com', tier: 'pro' } });
  assert.equal(modals.length, 2);
  assert.match(modals[1].bodyHTML, /https:\/\/x\.test\/reset\.html\?token=abc/);
  assert.match(modals[1].bodyHTML, /7 days/);
});

test('adminCreateOrganizer: a duplicate email shows the server message', async () => {
  reset(); await f('adminCreateOrganizer')();
  els.adminNewName = { value: 'Pat' }; els.adminNewEmail = { value: 'pat@x.com' }; els.adminNewTier = { value: 'basic' };
  reply('POST /api/admin/organizers', 409, { error: 'An account with that email already exists.' });
  await modals[0].onConfirm(); await tick();
  assert.equal(modals.length, 2);
  assert.match(modals[1].body, /already exists/);
});

test('adminResetLink POSTs and shows the link (1 hour)', async () => {
  reset(); reply('GET /api/admin/organizers', 200, { organizers: [org({ id: 'o1', email: 'a@x.com' })] });
  await f('adminShow')('organizers'); calls.length = 0;
  reply('POST /api/admin/organizers/o1/reset-link', 200, { link: 'https://x.test/reset.html?token=zzz' });
  await f('adminResetLink')('o1');
  assert.deepEqual(calls[0], { url: '/api/admin/organizers/o1/reset-link', method: 'POST', body: undefined });
  assert.match(modals[0].bodyHTML, /token=zzz/); assert.match(modals[0].bodyHTML, /1 hour/);
  modals.length = 0; reply('POST /api/admin/organizers/o1/reset-link', 409, { error: 'This account is suspended. Reactivate it first.' });
  await f('adminResetLink')('o1');
  assert.match(modals[0].body, /suspended/);
});

test('adminTransferOrganizer: choose an active organiser, POST the transfer, report how many moved', async () => {
  reset(); reply('GET /api/admin/organizers', 200, { organizers: [
    org({ id: 'o1', name: 'From', eventCount: 4 }), org({ id: 'o2', name: 'To Pat', email: 'to@x.com' }), org({ id: 'o3', name: 'Susp', suspended: true }),
  ] });
  await f('adminShow')('organizers'); calls.length = 0;
  await f('adminTransferOrganizer')('o1');
  assert.equal(modals.length, 1);
  assert.match(modals[0].bodyHTML, /<option value="o2">/);
  assert.doesNotMatch(modals[0].bodyHTML, /<option value="o3">/);           // suspended: the server would refuse
  assert.doesNotMatch(modals[0].bodyHTML, /<option value="o1">/);           // not itself
  els.adminTransferTo = { value: '' };
  assert.ok(modals[0].onConfirm().error);
  els.adminTransferTo = { value: 'o2' };
  reply('POST /api/admin/organizers/o1/transfer', 200, { moved: 4 });
  await modals[0].onConfirm(); await tick();
  assert.deepEqual(calls[0], { url: '/api/admin/organizers/o1/transfer', method: 'POST', body: { toOrganizerId: 'o2' } });
  assert.match(modals[1].body, /Moved 4 events/);
});

test('adminDeleteOrganizer: confirm naming them, then DELETE; refused when they own events', async () => {
  reset(); reply('GET /api/admin/organizers', 200, { organizers: [org({ id: 'o1', name: 'Alex' }), org({ id: 'o2', name: 'Busy', eventCount: 2 })] });
  await f('adminShow')('organizers'); calls.length = 0;
  await f('adminDeleteOrganizer')('o2');
  assert.equal(calls.length, 0); assert.equal(modals.length, 1);
  assert.match(modals[0].body, /Transfer/);                                  // explains instead of offering Delete
  modals.length = 0;
  await f('adminDeleteOrganizer')('o1');
  assert.equal(modals.length, 1); assert.match(modals[0].body, /Alex/); assert.equal(modals[0].confirmClass, 'danger');
  reply('DELETE /api/admin/organizers/o1', 204, undefined);
  await modals[0].onConfirm(); await tick();
  assert.deepEqual(calls[0], { url: '/api/admin/organizers/o1', method: 'DELETE', body: undefined });
  assert.equal(calls[1].method + ' ' + calls[1].url, 'GET /api/admin/organizers');   // refreshed even though 204 has no body
});

test('adminEventAction POSTs the action and refreshes the Events view', async () => {
  reset(); reply('GET /api/admin/organizers', 200, { organizers: [] });
  reply('GET /api/admin/events?limit=50&offset=0', 200, { events: [ev({ id: 't_1' })], total: 1 });
  await f('adminShow')('events'); calls.length = 0;
  reply('POST /api/admin/events/t_1', 200, { event: ev() });
  assert.equal(await f('adminEventAction')('t_1', 'unpublish'), true);
  assert.deepEqual(calls[0], { url: '/api/admin/events/t_1', method: 'POST', body: { action: 'unpublish' } });
  assert.ok(calls.some((c) => c.url.startsWith('/api/admin/events?')));
  calls.length = 0;
  await f('adminEventAction')('t_1', 'unlist');
  assert.deepEqual(calls[0].body, { action: 'unlist' });
  calls.length = 0;
  await f('adminEventAction')('t_1', 'transfer', { toOrganizerId: 'o2' });
  assert.deepEqual(calls[0].body, { action: 'transfer', toOrganizerId: 'o2' });
  calls.length = 0; modals.length = 0;
  reply('POST /api/admin/events/t_1', 409, { error: 'Event is not finalized.' });
  assert.equal(await f('adminEventAction')('t_1', 'reopen'), false);
  assert.match(modals[0].body, /not finalized/);
  assert.equal(calls.length, 1);
});

test('adminEventDelete confirms naming the event, then POSTs delete', async () => {
  reset(); reply('GET /api/admin/organizers', 200, { organizers: [] });
  reply('GET /api/admin/events?limit=50&offset=0', 200, { events: [ev({ id: 't_1', tournamentName: EVIL, finalizedAt: '2026-10-13T00:00:00.000Z' })], total: 1 });
  await f('adminShow')('events'); calls.length = 0;
  await f('adminEventDelete')('t_1');
  assert.equal(calls.length, 0); assert.equal(modals.length, 1);
  assert.doesNotMatch(modals[0].body, /<script>/); assert.match(modals[0].body, /&lt;script&gt;/);
  assert.match(modals[0].body, /permanent/i); assert.equal(modals[0].confirmClass, 'danger');
  await modals[0].onConfirm(); await tick();
  assert.deepEqual(calls[0], { url: '/api/admin/events/t_1', method: 'POST', body: { action: 'delete' } });
});

test('deleting the event that is open in the editor closes it', async () => {
  reset(); reply('GET /api/admin/organizers', 200, { organizers: [] });
  reply('GET /api/admin/events?limit=50&offset=0', 200, { events: [], total: 0 });
  const t = f('blankTournament')(); t.id = 't_open'; useState(app, t); app.__t = t; run(app, 'tournamentsCache.t_open = __t; adminState.view = "events"; adminState.organizers = []');
  reply('POST /api/admin/events/t_open', 200, { ok: true });
  await f('adminEventAction')('t_open', 'delete');
  assert.equal(run(app, 'state'), null);
  assert.equal(run(app, 'tournamentsCache.t_open'), undefined);
});

test('adminEventTransfer picks an active organiser other than the owner', async () => {
  reset(); reply('GET /api/admin/organizers', 200, { organizers: [org({ id: 'o1', name: 'Alex' }), org({ id: 'o2', name: 'Bea' }), org({ id: 'o3', name: 'Susp', suspended: true })] });
  reply('GET /api/admin/events?limit=50&offset=0', 200, { events: [ev({ id: 't_1' })], total: 1 });
  await f('adminShow')('events'); calls.length = 0;
  await f('adminEventTransfer')('t_1');
  assert.match(modals[0].bodyHTML, /<option value="o2">/);
  assert.doesNotMatch(modals[0].bodyHTML, /<option value="o1">/);           // the current owner
  assert.doesNotMatch(modals[0].bodyHTML, /<option value="o3">/);
  els.adminTransferTo = { value: 'o2' };
  await modals[0].onConfirm(); await tick();
  assert.deepEqual(calls[0], { url: '/api/admin/events/t_1', method: 'POST', body: { action: 'transfer', toOrganizerId: 'o2' } });
});

test('adminSaveSettings validates the ranges, PUTs both numbers, and reports errors', async () => {
  reset();
  reply('GET /api/admin/settings', 200, { resultsDays: 14, liveHours: 48, limits: { resultsDays: [1, 90], liveHours: [1, 168] } });
  await f('adminShow')('settings'); calls.length = 0;
  for (const [r, l] of [['0', '48'], ['91', '48'], ['14', '0'], ['14', '169'], ['1.5', '48'], ['', '48'], ['abc', '48']]) {
    els.adminSetResults = { value: r }; els.adminSetLive = { value: l }; modals.length = 0;
    assert.equal(await f('adminSaveSettings')(), false);
    assert.equal(modals.length, 1, r + '/' + l);
  }
  assert.equal(calls.length, 0);
  els.adminSetResults = { value: '21' }; els.adminSetLive = { value: '72' }; modals.length = 0;
  reply('PUT /api/admin/settings', 200, { resultsDays: 21, liveHours: 72, limits: { resultsDays: [1, 90], liveHours: [1, 168] } });
  assert.equal(await f('adminSaveSettings')(), true);
  assert.deepEqual(calls[0], { url: '/api/admin/settings', method: 'PUT', body: { resultsDays: 21, liveHours: 72 } });
  assert.equal(run(app, 'adminState.settings.resultsDays'), 21);
  reply('PUT /api/admin/settings', 500, { error: 'The settings table does not exist yet.' });
  assert.equal(await f('adminSaveSettings')(), false);
  assert.match(modals[0].body, /settings table/);
});

/* ---------- Opening and reopening events ---------- */
function eventRow(id, extra) {
  const t = f('blankTournament')(); Object.assign(t, extra || {});
  return { id, data: JSON.parse(JSON.stringify(t)), updated_at: '2026-10-12T10:00:00.000Z' };
}

test('adminOpenEvent loads someone else\'s event with the normal GET and remembers the owner for the banner', async () => {
  reset(); reply('GET /api/admin/organizers', 200, { organizers: [] });
  reply('GET /api/admin/events?limit=50&offset=0', 200, { events: [ev({ id: 't_9', owner: { id: 'o9', name: 'Zed', email: 'z@x.com' } })], total: 1 });
  await f('adminShow')('events'); calls.length = 0;
  app.openTournament = ORIG.openTournament;
  reply('GET /api/tournaments/t_9', 200, eventRow('t_9'));
  assert.equal(await f('adminOpenEvent')('t_9'), true);
  assert.equal(calls[0].method + ' ' + calls[0].url, 'GET /api/tournaments/t_9');
  assert.equal(run(app, 'state.id'), 't_9');
  assert.equal(run(app, 'adminState.view'), null);                          // back in the editor
  assert.match(f('adminEditBannerHTML')(), /Editing Zed's event as Admin/);
});

test('adminOpenEvent: your own event gets no banner; a failed load says so and leaves the view alone', async () => {
  reset(); reply('GET /api/admin/organizers', 200, { organizers: [] });
  reply('GET /api/admin/events?limit=50&offset=0', 200, { events: [ev({ id: 't_m', owner: { id: 'adm1', name: 'Boss', email: 'boss@x.com' } }), ev({ id: 't_gone' })], total: 2 });
  await f('adminShow')('events');
  app.openTournament = ORIG.openTournament;
  reply('GET /api/tournaments/t_m', 200, eventRow('t_m'));
  assert.equal(await f('adminOpenEvent')('t_m'), true);
  assert.equal(f('adminEditBannerHTML')(), '');
  run(app, 'adminState.view = "events"'); modals.length = 0;
  reply('GET /api/tournaments/t_gone', 404, { error: 'Not found.' });
  assert.equal(await f('adminOpenEvent')('t_gone'), false);
  assert.equal(modals.length, 1);
  assert.equal(run(app, 'adminState.view'), 'events');
  assert.equal(run(app, 'adminEditing'), null);
});

test('adminReopenCurrent: POST reopen, then the event is reloaded unlocked', async () => {
  reset(); app.openTournament = ORIG.openTournament;
  const t = f('blankTournament')(); t.id = 't_lk'; t.finalized = { at: '2026-10-13T09:30:00.000Z' }; useState(app, t);
  run(app, 'lockedIds.add("t_lk")');
  reply('POST /api/admin/events/t_lk', 200, { event: ev({ id: 't_lk' }) });
  reply('GET /api/tournaments/t_lk', 200, eventRow('t_lk'));              // now without `finalized`
  assert.equal(await f('adminReopenCurrent')(), true);
  assert.deepEqual(calls[0], { url: '/api/admin/events/t_lk', method: 'POST', body: { action: 'reopen' } });
  assert.equal(calls[1].method + ' ' + calls[1].url, 'GET /api/tournaments/t_lk');
  assert.equal(run(app, 'isLocked(state)'), false);
  assert.equal(run(app, 'lockedIds.has("t_lk")'), false);
  assert.equal(run(app, 'dbUpdatedAtCache.t_lk'), '2026-10-12T10:00:00.000Z');
});

test('adminReopenCurrent: a refusal leaves the locked event as it was', async () => {
  reset(); app.openTournament = ORIG.openTournament;
  const t = f('blankTournament')(); t.id = 't_lk'; t.finalized = { at: '2026-10-13T09:30:00.000Z' }; useState(app, t);
  reply('POST /api/admin/events/t_lk', 409, { error: 'Event is not finalized.' });
  assert.equal(await f('adminReopenCurrent')(), false);
  assert.equal(calls.length, 1);
  assert.equal(run(app, 'isLocked(state)'), true);
  assert.equal(modals.length, 1);
});

test('reopening from the Events list keeps the Admin view when that event is also open in the editor', async () => {
  reset(); app.openTournament = ORIG.openTournament;
  reply('GET /api/admin/organizers', 200, { organizers: [] });
  reply('GET /api/admin/events?limit=50&offset=0', 200, { events: [ev({ id: 't_lk', finalizedAt: '2026-10-13T00:00:00.000Z' })], total: 1 });
  await f('adminShow')('events');
  const t = f('blankTournament')(); t.id = 't_lk'; t.finalized = { at: 'x' }; useState(app, t);
  reply('POST /api/admin/events/t_lk', 200, { event: ev({ id: 't_lk' }) });
  reply('GET /api/tournaments/t_lk', 200, eventRow('t_lk'));
  await f('adminEventAction')('t_lk', 'reopen');
  assert.equal(run(app, 'adminState.view'), 'events');
  assert.equal(run(app, 'isLocked(state)'), false);
});

/* ---------- Non-admins: nothing runs ---------- */
test('every admin action refuses to run for a non-admin and never touches the server', async () => {
  for (const user of [ORG, null, { publicMode: true }]) {
    reset(user);
    const t = f('blankTournament')(); t.id = 't_lk'; t.finalized = { at: 'x' }; useState(app, t);
    els.adminSetResults = { value: '14' }; els.adminSetLive = { value: '48' };
    await f('adminShow')('organizers');
    await f('adminCreateOrganizer')();
    await f('adminSetTier')('o1', 'pro');
    await f('adminToggleSuspend')('o1', true);
    await f('adminSetRole')('o1', 'admin');
    await f('adminResetLink')('o1');
    await f('adminTransferOrganizer')('o1');
    await f('adminDeleteOrganizer')('o1');
    await f('adminOpenEvent')('t_1');
    await f('adminEventAction')('t_1', 'unpublish');
    await f('adminEventDelete')('t_1');
    await f('adminEventTransfer')('t_1');
    await f('adminEventsSearch')();
    await f('adminEventsPage')(1);
    await f('adminSaveSettings')();
    await f('adminReopenCurrent')();
    await f('adminDoCreate')('A', 'a@x.com', 'basic');
    await f('adminDoTransfer')('o1', 'o2');
    await f('adminBack')();
    assert.equal(calls.length, 0);
    assert.equal(modals.length, 0);
    assert.equal(run(app, 'adminState.view'), null);
    assert.equal(run(app, 'isLocked(state)'), true);
  }
});

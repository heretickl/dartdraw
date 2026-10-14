const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, useState } = require('./lib/helpers');

// Stored event data is untrusted: an Admin opens other organisers' events in their own session (admin-ui.js adminOpenEvent).
// These tests build HTML from hostile data and check nothing can break out of an attribute or a handler, that a loaded
// foreign event is cleaned, that viewing never writes, and that a foreign event stays out of the Admin's own sidebar.
const app = loadApp();
const f = (n) => run(app, n);
const tick = () => new Promise((r) => setImmediate(r));

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const ADMIN = { id: 'adm1', name: 'Boss', email: 'boss@x.com', role: 'admin', tier: 'pro', entryLimit: null };
const LOGO = 'x" onerror="alert(1)';
const JS_BREAK = "');alert(1);('";

const ORIG = {};
['openModal', 'apiFetch', 'render', 'renderSavedList', 'persist', 'openTournament', 'detectContentBox', 'document', 'Image'].forEach((n) => { ORIG[n] = run(app, n === 'Image' ? 'typeof Image === "undefined" ? undefined : Image' : n); });
let calls, replies, persisted, savedListEl, workspace;
function reset(user) {
  Object.keys(ORIG).forEach((n) => { app[n] = ORIG[n]; });
  calls = []; replies = {}; persisted = 0; savedListEl = { innerHTML: '' }; workspace = { style: {} };
  app.openModal = () => {};
  app.render = () => {};
  app.persist = () => { persisted++; };
  app.apiFetch = async (url, opts) => {
    const method = (opts && opts.method) || 'GET';
    calls.push({ url, method });
    const r = replies[method + ' ' + url] || { status: 200, body: {} };
    return { ok: r.status < 400, status: r.status, json: async () => r.body };
  };
  const els = { savedList: savedListEl, currentWorkspaceCard: workspace, cwName: {}, cwSub: {} };
  app.document = { getElementById: (id) => els[id] || { classList: { remove() {}, add() {} } }, body: { classList: { toggle() {} } } };
  app.__u = user === undefined ? ADMIN : user;
  run(app, 'currentOrganizer = __u; foreignOpenIds.clear(); adminEditing = null; adminState.view = null; adminState.organizers = []; adminState.events = null; state = null; currentStage = 1; lockedIds.clear(); tournamentsCache = {}; dbUpdatedAtCache = {}');
}
const reply = (key, status, body) => { replies[key] = { status, body }; };
const noAttackSurface = (html) => {
  assert.doesNotMatch(html, /onerror\s*=/i);
  assert.doesNotMatch(html, /"\s*on[a-z]+\s*=\s*"alert/i);
  assert.doesNotMatch(html, /'\);\s*alert\(1\)/);
};

function eventWith(extra) {
  const t = f('blankTournament')();
  t.eventCreation.saved = true; t.format.saved = true; t.format.formatType = 'roundrobin';
  t.entriesList = [{ id: 'e1', name: JS_BREAK, org: '', players: [], withdrawn: false }, { id: 'e2', name: 'Bea', org: '', players: [], withdrawn: false }];
  t.groups = [{ id: 'g1', label: 'A', confirmed: true, entryIds: ['e1', 'e2'], boards: [1], gameStarted: true, startedAt: null, positionOverrides: {}, scores: {} }];
  return Object.assign(t, extra || {});
}

/* ---------- layer 1: escaping where the HTML is built ---------- */
test('escJs / escText / imgSrc: the helpers', () => {
  reset();
  assert.equal(f('escText')(5), '5'); assert.equal(f('escText')(0), '0'); assert.equal(f('escText')(null), '');
  const js = f('escJs')("a'b\\c\"d<e>\n");
  assert.doesNotMatch(js, /['"<>\n]/);                                // nothing that could end the string or the attribute
  assert.equal(f('escJs')('t_abc-1'), 't_abc-1');                      // ordinary ids come out unchanged
  assert.equal(f('imgSrc')(PNG), PNG);
  for (const bad of [LOGO, 'javascript:alert(1)', 'https://evil.test/x.png', PNG + '"', null, undefined, 5]) assert.equal(f('imgSrc')(bad), '');
});

test('a hostile logo cannot break out of the img src in any logo builder', () => {
  reset(); const t = eventWith(); t.format.logo = LOGO; useState(app, t);
  for (const html of [f('mainLogoBoxHTML')(), f('diagLogoBoxHTML')(), f('stage2')()]) noAttackSurface(html);
  assert.doesNotMatch(f('mainLogoBoxHTML')(), /alert/);
  t.format.logo = PNG;                                                // a real logo still renders
  assert.match(f('mainLogoBoxHTML')(), new RegExp('src="' + PNG.replace(/[+/]/g, '\\$&') + '"'));
  assert.match(f('diagLogoBoxHTML')(), /<img src="data:image\/png;base64,/);
});

test('hostile sponsor sources cannot break out in the setup screen or on the printed sheets', () => {
  reset(); const t = eventWith(); t.format.sponsors = [{ src: LOGO, shape: 'rect' }, { src: PNG, shape: 'square' }]; t.printSettings.sponsorFooterEnabled = true; useState(app, t);
  noAttackSurface(f('stage2')());
  noAttackSurface(f('chartSheetHTML')(t.groups[0], false));
  assert.match(f('chartSheetHTML')(t.groups[0], false), /data:image\/png;base64,/);
});

test('names and ids in score-cell handlers are JS-escaped, not just HTML-escaped', () => {
  reset(); const t = eventWith(); t.groups[0].id = "g'1"; t.entriesList[1].id = "e'2"; t.groups[0].entryIds = ['e1', "e'2"]; useState(app, t);
  const html = f('chartSheetHTML')(t.groups[0], false);
  noAttackSurface(html);
  assert.match(html, /promptScore\(/);
  const handler = html.match(/onclick="(promptScore\([^"]*)"/);
  assert.ok(handler, 'a score cell is clickable');
  const decoded = handler[1].replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  // Evaluate the handler text as the browser would: it must be exactly one call with five plain string arguments.
  const seen = [];
  new Function('promptScore', 'return ' + decoded.replace(/^promptScore/, 'promptScore'))((...a) => { seen.push(a); });
  assert.equal(seen.length, 1); assert.equal(seen[0].length, 5);
  assert.ok(seen[0].includes(JS_BREAK));                               // the name arrives intact as data
});

test('the saved list escapes tournament ids in its handlers', () => {
  reset();
  app.renderSavedList = ORIG.renderSavedList;
  const t = eventWith(); t.id = "t'1\"); alert(1); (\""; t.updatedAt = 1;
  app.__c = { [t.id]: t }; run(app, 'tournamentsCache = __c');
  f('renderSavedList')();
  noAttackSurface(savedListEl.innerHTML);
  const handlers = savedListEl.innerHTML.match(/onclick="[^"]*"/g);
  assert.equal(handlers.length, 4);
  handlers.forEach((h) => {
    const code = h.slice(9, -1).replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    const seen = [];
    new Function('openTournament', 'renameTournament', 'duplicateTournament', 'deleteTournament', 'event', code)((id) => seen.push(id), (id) => seen.push(id), (id) => seen.push(id), (id) => seen.push(id), {});
    assert.deepEqual(seen, [t.id]);
  });
});

/* ---------- layer 3: loading an event ---------- */
function rowOf(data) { return { id: 't_f1', data: JSON.parse(JSON.stringify(data)), updated_at: '2026-10-12T10:00:00.000Z' }; }

test('openTournament cleans what it loads: hostile logo and sponsors removed, ids made safe, good data kept', async () => {
  reset(null); app.openTournament = ORIG.openTournament;
  const t = eventWith(); t.format.logo = LOGO; t.format.sponsors = [{ src: LOGO }, { src: PNG, shape: 'rect' }];
  t.entriesList[0].id = "e'1"; t.groups[0].entryIds = ["e'1", 'e2'];
  reply('GET /api/tournaments/t_own', 200, rowOf(t));
  assert.equal(await f('openTournament')('t_own'), true);
  assert.equal(run(app, 'state.format.logo'), undefined);
  assert.equal(run(app, 'state.format.sponsors.length'), 1);
  assert.equal(run(app, 'state.entriesList[0].id'), 'e_1');
  assert.deepEqual(JSON.parse(JSON.stringify(run(app, 'state.groups[0].entryIds'))), ['e_1', 'e2']);
  assert.equal(run(app, 'state.entriesList[0].name'), JS_BREAK);       // an own event's text is not rewritten
});

test('an event with quotes and angle brackets in its names loads UNCHANGED, as your own or as someone else\'s, and still renders escaped', async () => {
  const t = eventWith();
  t.eventCreation.tournamentName = 'Cup "Open" <1> & Co'; t.entriesList[1].name = 'Mick "Bull" O\'Hara <b>'; t.entriesList[0].name = 'x" onfocus="alert(1)';
  const names = () => [run(app, 'state.eventCreation.tournamentName'), run(app, 'state.entriesList[0].name'), run(app, 'state.entriesList[1].name')];
  for (const foreign of [true, false]) {
    reset(); app.openTournament = ORIG.openTournament;
    reply('GET /api/tournaments/t_f1', 200, rowOf(t));
    if (foreign) run(app, 'foreignOpenIds.set("t_f1", { ownerId: "o9", ownerName: "Zed" })');
    await f('openTournament')('t_f1');
    assert.deepEqual(names(), ['Cup "Open" <1> & Co', 'x" onfocus="alert(1)', 'Mick "Bull" O\'Hara <b>']);
    // what the server would store if the Admin saved now: the names are byte-identical
    const saved = JSON.parse(JSON.stringify(run(app, 'state')));
    assert.equal(saved.entriesList[1].name, t.entriesList[1].name);
    assert.equal(JSON.stringify(saved.entriesList.slice(0, 2).map((e) => e.name)), JSON.stringify(t.entriesList.map((e) => e.name)));
    // and the screens built from it carry them escaped, never raw
    const html = f('chartSheetHTML')(run(app, 'state.groups[0]'), false) + f('stage3')();
    assert.doesNotMatch(html, /Hara <b>/); assert.doesNotMatch(html, /" onfocus="alert/);
    assert.match(html, /Mick &quot;Bull&quot; O&#39;Hara &lt;b&gt;/);
  }
});

test('the 409 "changed elsewhere" copy is cleaned too (it is stored for the sidebar)', async () => {
  reset(); app.openTournament = ORIG.openTournament;
  // renameTournament's 409 branch stores body.current.data; the fetch of the list does the same for every row.
  const t = eventWith(); t.format.logo = LOGO;
  reply('GET /api/tournaments', 200, [{ id: 't_l1', data: JSON.parse(JSON.stringify(t)), updated_at: '2026-10-12T10:00:00.000Z' }]);
  await f('fetchTournamentList')();
  assert.equal(run(app, 'tournamentsCache.t_l1.format.logo'), undefined);
});

/* ---------- I1: viewing never writes ---------- */
test('migrateLogoIfNeeded does nothing for an event the Admin opened for someone else, and never persists it', async () => {
  reset();
  let made = 0, img = null;
  app.Image = class { constructor() { made++; img = this; } set src(v) { this._src = v; } };
  app.detectContentBox = () => ({ x: 0, y: 0, w: 10, h: 10 });
  app.document = { createElement: () => ({ getContext: () => ({ drawImage() {} }), toDataURL: () => PNG }), getElementById: () => ({ classList: { remove() {}, add() {} }, style: {} }), body: { classList: { toggle() {} } } };
  const mk = (id) => { const t = eventWith(); t.id = id; t.format.logo = PNG; delete t.format.logoAspect; return t; };
  const foreign = mk('t_foreign'); useState(app, foreign);
  run(app, 'foreignOpenIds.set("t_foreign", { ownerId: "o9", ownerName: "Zed" })');
  f('migrateLogoIfNeeded')(foreign);
  assert.equal(made, 0); assert.equal(persisted, 0);
  const own = mk('t_own'); useState(app, own);
  f('migrateLogoIfNeeded')(own);
  assert.equal(made, 1);                                               // the own event still gets its migration
  img.onload();
  assert.equal(persisted, 1);
  // The event becomes foreign while the image is still decoding: the late callback must not write.
  const later = mk('t_later'); useState(app, later);
  f('migrateLogoIfNeeded')(later);
  run(app, 'foreignOpenIds.set("t_later", { ownerId: "o9", ownerName: "Zed" })');
  img.onload();
  assert.equal(persisted, 1);
});

/* ---------- I3: a foreign event is not the Admin's own ---------- */
function openForeign(extra) {
  const t = eventWith(extra); t.eventCreation.tournamentName = 'Zed cup'; t.updatedAt = 5;
  reply('GET /api/tournaments/t_f1', 200, rowOf(t));
}
async function adminOpens() {
  reset(); app.openTournament = ORIG.openTournament;
  app.renderSavedList = run(app, 'renderSavedList');
  openForeign();
  app.__ev = { events: [{ id: 't_f1', tournamentName: 'Zed cup', eventName: '', owner: { id: 'o9', name: 'Zed', email: 'z@x.com' }, finalizedAt: null }], total: 1 };
  run(app, 'adminState.events = __ev');
  assert.equal(await f('adminOpenEvent')('t_f1'), true);
}

test('a foreign event the Admin opened is not in the sidebar list and its Rename / Duplicate / Delete do nothing', async () => {
  await adminOpens();
  assert.equal(run(app, 'foreignOpenIds.has("t_f1")'), true);
  assert.equal(run(app, 'state.id'), 't_f1');
  f('renderSavedList')();
  assert.doesNotMatch(savedListEl.innerHTML, /t_f1|Zed cup/);
  assert.match(savedListEl.innerHTML, /No saved tournaments/);
  const before = calls.length;
  let modals = 0; app.openModal = () => { modals++; };
  const ev = { stopPropagation() {} };
  f('deleteTournament')('t_f1', ev); f('renameTournament')('t_f1', ev); await f('duplicateTournament')('t_f1', ev);
  assert.equal(modals, 0); assert.equal(calls.length, before);
  assert.equal(run(app, 'tournamentsCache.t_f1') !== undefined, true);   // still the open event's data, just hidden
});

test('the banner shows for a foreign event however it was reached, and goes when an own event or a new one is opened', async () => {
  await adminOpens();
  assert.match(f('adminEditBannerHTML')(), /Editing Zed's event as Admin/);
  // reached again by a plain reload (not through adminOpenEvent):
  run(app, 'adminEditing = null');
  await f('openTournament')('t_f1');
  assert.match(f('adminEditBannerHTML')(), /Editing Zed's event as Admin/);
  assert.equal(run(app, 'adminEditing'), null);
  // opening one of the Admin's own events clears the banner and the record
  run(app, 'adminEditing = { id: "t_f1", ownerId: "o9", ownerName: "Zed" }');
  const own = eventWith(); own.eventCreation.tournamentName = 'Mine';
  reply('GET /api/tournaments/t_mine', 200, rowOf(own));
  await f('openTournament')('t_mine');
  assert.equal(f('adminEditBannerHTML')(), '');
  assert.equal(run(app, 'adminEditing'), null);
  // starting a new tournament clears it as well
  run(app, 'adminEditing = { id: "t_f1", ownerId: "o9", ownerName: "Zed" }');
  app.newTournament = run(app, 'newTournament');
  f('newTournament')();
  assert.equal(run(app, 'adminEditing'), null);
  assert.equal(f('adminEditBannerHTML')(), '');
});

test('an event of your own opened from the Events tab is not marked foreign', async () => {
  reset(); app.openTournament = ORIG.openTournament;
  const own = eventWith(); reply('GET /api/tournaments/t_mine', 200, rowOf(own));
  run(app, 'adminState.events = { events: [{ id: "t_mine", tournamentName: "Mine", owner: { id: "adm1", name: "Boss", email: "boss@x.com" } }], total: 1 }');
  assert.equal(await f('adminOpenEvent')('t_mine'), true);
  assert.equal(run(app, 'foreignOpenIds.has("t_mine")'), false);
  assert.equal(f('adminEditBannerHTML')(), '');
});

test('a failed open forgets the foreign mark', async () => {
  reset(); app.openTournament = ORIG.openTournament;
  reply('GET /api/tournaments/t_gone', 404, { error: 'Not found.' });
  run(app, 'adminState.events = { events: [{ id: "t_gone", tournamentName: "G", owner: { id: "o9", name: "Zed", email: "z@x.com" } }], total: 1 }');
  assert.equal(await f('adminOpenEvent')('t_gone'), false);
  assert.equal(run(app, 'foreignOpenIds.has("t_gone")'), false);
  assert.equal(run(app, 'adminEditing'), null);
});

test('deleting or transferring the open foreign event from the Events tab closes it and forgets it', async () => {
  for (const action of ['delete', 'transfer']) {
    await adminOpens();
    run(app, 'adminState.view = "events"');
    reply('POST /api/admin/events/t_f1', 200, action === 'delete' ? { ok: true } : { event: {} });
    reply('GET /api/admin/events?limit=50&offset=0', 200, { events: [], total: 0 });
    assert.equal(await f('adminEventAction')('t_f1', action, action === 'transfer' ? { toOrganizerId: 'o2' } : undefined), true, action);
    assert.equal(run(app, 'state'), null, action);
    assert.equal(run(app, 'adminEditing'), null, action);
    assert.equal(run(app, 'foreignOpenIds.has("t_f1")'), false, action);
    assert.equal(run(app, 'tournamentsCache.t_f1'), undefined, action);
    assert.equal(run(app, 'adminState.view'), 'events', action);          // back on the Events view
  }
});

test('a foreign event is never persisted by viewing: loading it makes no PUT', async () => {
  await adminOpens();
  assert.deepEqual(calls.filter((c) => c.method !== 'GET'), []);
  assert.equal(persisted, 0);
});

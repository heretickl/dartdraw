const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, plain, useState } = require('./lib/helpers');

// The player library in the organiser app (players-ui.js): step 3's picker and pair / team boxes, the entries they make,
// the background sync of names typed while offline, and the Players page. The server is a stand-in (`server`).
const app = loadApp();
const f = (n) => run(app, n);
const T = (k, v) => f('T')(k, v);
const ORIG = {};
['persist', 'render', 'openModal', 'closeModal', 'apiFetch', 'finalizedBlockModal'].forEach((n) => { ORIG[n] = run(app, n); });

let calls, modals, persisted, els, server;
const lib = () => run(app, 'libraryState');
function reset(unit, format, players) {
  Object.keys(ORIG).forEach((n) => { app[n] = ORIG[n]; });
  calls = []; modals = []; persisted = 0; els = {};
  server = (url, body) => (url === '/api/players/list' ? { status: 200, body: { players: LIB.map((p) => Object.assign({}, p)) } } : { status: 200, body: { players: (body && body.players || []).map((p, i) => ({ id: 'p_new' + calls.length + '_' + i, name: p.name, club: p.club || '', created: true })) } });
  app.openModal = (m) => { modals.push(m); };
  app.closeModal = () => {};
  app.persist = () => { persisted++; };
  app.render = () => {};
  app.finalizedBlockModal = (what) => { modals.push({ title: 'finalized', what }); };
  app.apiFetch = async (url, o) => {
    const body = o && o.body ? JSON.parse(o.body) : null;
    calls.push({ url, body });
    const r = server(url, body);
    if (r === 'offline') throw new TypeError('Failed to fetch');
    return { ok: r.status < 400, status: r.status, json: async () => r.body };
  };
  app.document = { getElementById: (id) => els[id] || null, querySelector: () => null, createElement: () => ({}), body: {} };
  const t = f('blankTournament')();
  t.id = 't_pl'; t.eventCreation.saved = true; t.eventCreation.competitionUnit = unit || 'Singles';
  t.eventCreation.tournamentName = 'Kejohanan'; t.eventCreation.eventName = 'Open';
  t.format.saved = true; t.format.formatType = format || 'roundrobin';
  useState(app, t);
  app.__lib = { players: players === undefined ? LIB.map((p) => Object.assign({}, p)) : players, status: 'ready', syncBlocked: false };
  run(app, 'libraryState = __lib; foreignOpenIds.clear(); lockedIds.clear(); tournamentsCache = {}; pickerState = { q: "", club: "" }; plDialog = null; librarySyncBusy = false');
  return t;
}
const LIB = [
  { id: 'p1', name: 'Ahmad Faiz', club: 'Kelab Novus', eventsPlayed: 3, lastPlayed: '2026-10-20T10:00:00.000Z' },
  { id: 'p2', name: 'Hakim', club: 'Kelab Novus', eventsPlayed: 0, lastPlayed: null },
  { id: 'p3', name: 'Iskandar', club: 'Ipoh Arrows', eventsPlayed: 1, lastPlayed: null },
  { id: 'p4', name: 'José Ramírez', club: '', eventsPlayed: 0, lastPlayed: null },
  { id: 'p5', name: 'M. Zul', club: '', eventsPlayed: 0, lastPlayed: null },
];
const st = () => run(app, 'state');
const tick = () => new Promise((r) => setTimeout(r, 5));
const typeIn = (id, value) => { els[id] = { value, focus() {} }; };

/* ---------- the entry model ---------- */

test('the entry name: Singles is the player, Doubles is "TEAM : A / B" or "A / B", Teams is the team name; the club only when every player shares it', () => {
  reset();
  const name = f('entryDisplayName'), club = f('entryClubFromMembers');
  assert.equal(name('Singles', '', [{ name: '  Ahmad  Faiz ' }]), 'Ahmad Faiz');
  assert.equal(name('Doubles', '', [{ name: 'Ahmad' }, { name: 'Hakim' }]), 'Ahmad / Hakim');
  assert.equal(name('Doubles', ' Ace ', [{ name: 'Ahmad' }, { name: 'Hakim' }]), 'Ace : Ahmad / Hakim');
  assert.equal(name('Teams', 'Ipoh Arrows', [{ name: 'A' }, { name: 'B' }, { name: 'C' }]), 'Ipoh Arrows');
  assert.equal(name('Triples', 'Trio', [{ name: 'A' }]), 'Trio');
  assert.equal(club([{ club: 'Kelab Novus' }, { club: 'kelab  novus' }]), 'Kelab Novus');
  assert.equal(club([{ club: 'Kelab Novus' }, { club: 'Ipoh' }]), '');
  assert.equal(club([{ club: '' }, { club: '' }]), '');
  assert.equal(club([]), '');
});

test('the draw keeps the names of entries made from players: Singles, event-only names and pairs are never renamed "Player A1"', async () => {
  const t = reset('Singles', 'roundrobin');
  f('plChoose')('', 'p1');
  typeIn('pickerBox', 'Nick'); await f('plAddNew')('', true);
  f('buildGroups')(t);
  assert.ok(t.groups.length >= 1);
  assert.deepEqual(plain(t.entriesList.map((e) => e.name)), ['Ahmad Faiz', 'Nick']);
  const d = reset('Doubles', 'roundrobin');
  f('addEntryFromMembers')('Doubles', 'Ace', [{ playerId: 'p1', name: 'Ahmad Faiz' }, { playerId: 'p2', name: 'Hakim' }]);
  f('buildGroups')(d);
  assert.equal(d.entriesList[0].name, 'Ace : Ahmad Faiz / Hakim');
});

test('after a name is added, the search box and club box are empty again for the next player', async () => {
  reset('Singles', 'roundrobin');
  typeIn('pickerBox', 'Nick'); typeIn('pickerClub', 'Kelab');
  await f('plAddNew')('', true);
  assert.equal(els.pickerBox.value, '');
  assert.equal(els.pickerClub.value, '');
  els.pickerResults = { innerHTML: 'old rows' };
  typeIn('pickerBox', 'Ahmad'); f('plChoose')('', 'p1');
  assert.equal(els.pickerBox.value, '');
  assert.ok(!/old rows|Ahmad/.test(els.pickerResults.innerHTML), 'the rows under the box no longer offer the name just added');
});

test('an event drawn before the fix shows its players again: an automatic name over a player entry is put back when the event opens', () => {
  const t = reset('Doubles', 'roundrobin');
  t.entriesList.push({ id: 'a', name: 'Pair A1', members: [{ playerId: null, name: 'Ali', club: '' }, { playerId: null, name: 'Abu', club: '' }], teamName: 'Ace' },
    { id: 'b', name: 'Pasangan B1', members: [{ playerId: null, name: 'Siti', club: '' }, { playerId: null, name: 'Nur', club: '' }] },
    { id: 'c', name: 'Pair C1', autoName: false, members: [{ playerId: null, name: 'Kim', club: '' }, { playerId: null, name: 'Lee', club: '' }] },
    { id: 'd', name: 'Pair D1', autoName: true });
  f('ensureEntries')(t);
  assert.deepEqual(plain(t.entriesList.map((e) => e.name)), ['Ace : Ali / Abu', 'Siti / Nur', 'Pair C1', 'Pair D1'], 'a name the organiser typed, and an old placeholder, are left alone');
});

test('search: every typed word starts a word of the name or club, letter case and accents ignored, at most the limit', () => {
  reset();
  const s = (q, limit) => plain(f('searchLibrary')(q, limit)).map((p) => p.id);
  assert.deepEqual(s('novus', 8), ['p1', 'p2']);
  assert.deepEqual(s('fai nov', 8), ['p1'], 'name and club words together');
  assert.deepEqual(s('jose ramirez', 8), ['p4'], 'accents dropped');
  assert.deepEqual(s('RAMÍ', 8), ['p4']);
  assert.deepEqual(s('zul', 8), ['p5'], 'a word after punctuation');
  assert.deepEqual(s('aiz', 8), [], 'the middle of a word does not match');
  assert.deepEqual(s('novus', 1), ['p1']);
  assert.deepEqual(s('', 8), []);
  assert.equal(s('', 0).length, 5, 'the Players page: no words, every player');
});

test('Singles: a library player picked on step 3 becomes an entry with that player and club; a knockout also gets its seed place', () => {
  const t = reset('Singles', 'knockout');
  f('plChoose')('', 'p1');
  assert.equal(t.entriesList.length, 1);
  const e = t.entriesList[0];
  assert.deepEqual([e.name, e.org, plain(e.members)], ['Ahmad Faiz', 'Kelab Novus', [{ playerId: 'p1', name: 'Ahmad Faiz', club: 'Kelab Novus' }]]);
  assert.equal('teamName' in e, false);
  assert.ok(plain(t.seedOrder).includes(e.id));
  assert.equal(persisted, 1);
  assert.equal(calls.length, 0, 'picking from the list needs no server call');
});

test('a player already in an entry (by library id, or by name; withdrawn entries count) cannot be added again, and the list shows them as taken', () => {
  const t = reset();
  f('plChoose')('', 'p1');
  t.entriesList.push({ id: 'old', name: 'Hakim', org: '', withdrawn: true });      // an older Singles entry: counts by its name
  t.entriesList.push({ id: 'auto', name: 'Entry 3', autoName: true, org: '' });    // an automatic name is nobody
  f('plChoose')('', 'p1');
  assert.equal(modals.pop().title, T('pl.inUseTitle'));
  assert.equal(f('addEntryFromMembers')('Singles', '', [{ playerId: null, name: 'HAKIM' }]), null);
  assert.match(modals.pop().body, /Hakim/);
  assert.ok(f('addEntryFromMembers')('Singles', '', [{ playerId: null, name: 'Entry 3', eventOnly: true }]));
  assert.equal(t.entriesList.length, 4);
  const html = f('plResultsHTML')('novus', '', null);
  assert.match(html, /<div class="pl-row pl-used"><b>Ahmad Faiz<\/b>/, 'taken: not clickable');
  assert.match(html, /<div class="pl-row pl-used"><b>Hakim<\/b>/, 'Hakim too: the older entry has that name');
  assert.doesNotMatch(html, /plChoose\(/);
});

test('entries are added and removed only before the draw, and never on a finalized event', () => {
  let t = reset();
  f('plChoose')('', 'p1'); f('plChoose')('', 'p2');
  const id = t.entriesList[0].id;
  t.seedOrder = [id, t.entriesList[1].id];
  f('removeEntry')(id);
  const m = modals.pop();
  assert.equal(m.title, T('pl.removeTitle'));
  m.onConfirm();
  assert.deepEqual(plain(t.entriesList.map((e) => e.name)), ['Hakim']);
  assert.equal(plain(t.seedOrder).includes(id), false);
  t.groups = [{ id: 'g1', label: 'A', entryIds: [t.entriesList[0].id] }];
  assert.equal(f('addEntryFromMembers')('Singles', '', [{ name: 'Late' }]), null);
  f('removeEntry')(t.entriesList[0].id);
  assert.equal(modals.length, 0);
  assert.equal(f('removeEntryButtonHTML')(t.entriesList[0]), '');
  assert.equal(f('entryPickerHTML')(), '', 'no picker after the draw');
  t = reset();
  f('plChoose')('', 'p1');
  t.finalized = { at: '2026-10-31T20:00:00Z' };
  assert.equal(f('addEntryFromMembers')('Singles', '', [{ name: 'Late' }]), null);
  f('removeEntry')(t.entriesList[0].id);
  assert.equal(modals.pop().title, 'finalized');
  assert.equal(t.entriesList.length, 1);
});

/* ---------- typed new names ---------- */

test('a typed new name "as a new player" is saved to the library first, and the entry carries its id', async () => {
  const t = reset();
  typeIn('pickerBox', '  Nazir  Kamil '); typeIn('pickerClub', 'MPKJ');
  await f('plAddNew')('', false);
  assert.deepEqual(calls.map((c) => [c.url, plain(c.body)]), [['/api/players/ensure', { players: [{ name: 'Nazir Kamil', club: 'MPKJ' }] }]]);
  assert.deepEqual(plain(t.entriesList[0].members), [{ playerId: 'p_new1_0', name: 'Nazir Kamil', club: 'MPKJ' }]);
  assert.equal(t.entriesList[0].org, 'MPKJ');
  assert.ok(lib().players.some((p) => p.id === 'p_new1_0'), 'and is in the list for the next search');
  assert.equal(run(app, 'pickerState.q'), '', 'the box is cleared for the next name');
});

test('the server answers with the stored spelling: a name already in the library is linked, not added twice', async () => {
  const t = reset();
  server = () => ({ status: 200, body: { players: [{ id: 'p2', name: 'Hakim', club: 'Kelab Novus', created: false }] } });
  typeIn('pickerBox', 'hakim'); typeIn('pickerClub', 'kelab novus');
  await f('plAddNew')('', false);
  assert.deepEqual(plain(t.entriesList[0].members), [{ playerId: 'p2', name: 'Hakim', club: 'Kelab Novus' }]);
  assert.equal(lib().players.filter((p) => p.id === 'p2').length, 1);
});

test('"Add to this event only" (a nickname) never reaches the library', async () => {
  const t = reset();
  typeIn('pickerBox', 'Si Kecik');
  await f('plAddNew')('', true);
  assert.equal(calls.length, 0);
  assert.deepEqual(plain(t.entriesList[0].members), [{ playerId: null, name: 'Si Kecik', club: '', eventOnly: true }]);
  assert.deepEqual(plain(f('librarySyncPending')(t)), [], 'and the sync leaves it alone');
});

test('the library out of reach, or not set up: the name is still added (no id yet) and the sync sends it later', async () => {
  let t = reset();
  server = () => 'offline';
  typeIn('pickerBox', 'Faiz');
  await f('plAddNew')('', false);
  assert.deepEqual(plain(t.entriesList[0].members), [{ playerId: null, name: 'Faiz', club: '' }]);
  assert.equal(f('librarySyncPending')(t).length, 1);
  t = reset();
  server = () => ({ status: 503, body: { code: 'library_not_set_up', error: 'The player library is not set up yet.' } });
  typeIn('pickerBox', 'Faiz');
  await f('plAddNew')('', false);
  assert.equal(lib().status, 'not_set_up');
  assert.equal(t.entriesList.length, 1);
  typeIn('pickerBox', 'Amran');
  await f('plAddNew')('', false);
  assert.equal(calls.length, 1, 'not asked again once it is known to be missing');
  assert.match(f('entryPickerHTML')(), new RegExp(T('pl.notSetUpPicker').slice(0, 30).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('a full library (5,000 players): the name is not added, the message says why, and the sync stops asking', async () => {
  const t = reset();
  server = () => ({ status: 409, body: { code: 'player_limit', error: 'You can keep up to 5,000 players.' } });
  typeIn('pickerBox', 'One more');
  await f('plAddNew')('', false);
  assert.equal(t.entriesList.length, 0);
  const m = modals.pop();
  assert.deepEqual([m.title, m.body], [T('pl.limitTitle'), 'You can keep up to 5,000 players.']);
  assert.equal(lib().syncBlocked, true);
  t.entriesList.push({ id: 'e9', name: 'Offline', members: [{ playerId: null, name: 'Offline', club: '' }] });
  calls = [];
  await f('runLibrarySync')();
  assert.equal(calls.length, 0);
});

test('Enter in the search box picks the first free match, else adds the typed name as a new player', async () => {
  const t = reset();
  run(app, 'pickerState.q = "novus"');
  f('pickerKey')({ key: 'Enter', preventDefault() {} });
  run(app, 'pickerState.q = "novus"');
  f('pickerKey')({ key: 'Enter', preventDefault() {} });
  assert.deepEqual(plain(t.entriesList.map((e) => e.name)), ['Ahmad Faiz', 'Hakim']);
  run(app, 'pickerState.q = "Zainal"');
  f('pickerKey')({ key: 'Enter', preventDefault() {} });
  await tick();
  assert.deepEqual(plain(t.entriesList.map((e) => e.name)), ['Ahmad Faiz', 'Hakim', 'Zainal']);
  assert.equal(t.entriesList[2].members[0].playerId, 'p_new1_0');
  f('pickerKey')({ key: 'a', preventDefault() { throw new Error('only Enter'); } });
});

test('the result rows: matches, then "as a new player" (also when the name exists: another club is another player) and "this event only"', () => {
  reset();
  const html = f('plResultsHTML')('Hakim', '', null);
  assert.match(html, /plChoose\('','p2'\)/);
  assert.match(html, /plAddNew\('',false\)/);
  assert.match(html, /plAddNew\('',true\)/);
  assert.match(html, /id="pickerClub"/, 'the club box under the step 3 search');
  assert.doesNotMatch(f('plResultsHTML')('Hakim', 'p1', null), /pickerClub/, 'not in a pair box (it has its own Club field)');
  assert.equal(f('plResultsHTML')('   ', '', null), '');
  assert.doesNotMatch(f('plResultsHTML')('<img src=x onerror=alert(1)>', '', null), /<img/, 'typed text is escaped');
});

test('an Admin with another organiser\'s event open: no library search, names are added to that event only, and no sync', async () => {
  const t = reset();
  run(app, 'foreignOpenIds.set(state.id, true)');
  const html = f('plResultsHTML')('Hakim', '', null);
  assert.doesNotMatch(html, /plChoose|plAddNew\('',false\)/);
  assert.match(html, /plAddNew\('',true\)/);
  assert.match(f('entryPickerHTML')(), new RegExp(T('pl.foreignNote').slice(0, 25).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  typeIn('pickerBox', 'Hakim');
  await f('plAddNew')('', false);
  assert.equal(calls.length, 0);
  assert.equal(t.entriesList[0].members[0].eventOnly, true);
  t.entriesList.push({ id: 'x', name: 'Typed', members: [{ playerId: null, name: 'Typed', club: '' }] });
  await f('runLibrarySync')();
  assert.equal(calls.length, 0);
});

/* ---------- the background sync ---------- */

test('the sync sends names that have no library id yet (at most 200 at a time) and writes the ids back', async () => {
  const t = reset('Doubles');
  t.entriesList = [
    { id: 'e1', name: 'Ali / Abu', members: [{ playerId: null, name: 'Ali', club: 'K' }, { playerId: 'p2', name: 'Hakim', club: '' }] },
    { id: 'e2', name: 'Nick', members: [{ playerId: null, name: 'Nick', club: '', eventOnly: true }] },
  ];
  for (let i = 0; i < 205; i++) t.entriesList.push({ id: 'b' + i, name: 'B' + i, members: [{ playerId: null, name: 'Bulk ' + i, club: '' }] });
  await f('runLibrarySync')();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.players.length, 200);
  assert.deepEqual(plain(calls[0].body.players[0]), { name: 'Ali', club: 'K' });
  assert.equal(t.entriesList[0].members[0].playerId, 'p_new1_0');
  assert.equal(t.entriesList[0].members[1].playerId, 'p2', 'linked members are left as they are');
  assert.equal(t.entriesList[1].members[0].playerId, null, 'event-only stays out');
  assert.equal(persisted, 1);
  assert.equal(f('librarySyncPending')(t).length, 6, 'the rest go next time');
});

test('the sync leaves a name that was edited while the request was out, and never runs for a sample or a finalized event', async () => {
  let t = reset();
  t.entriesList = [{ id: 'e1', name: 'Ali', members: [{ playerId: null, name: 'Ali', club: '' }] }];
  server = (url, body) => { t.entriesList[0].members[0].name = 'Ali Baba'; return { status: 200, body: { players: body.players.map((p) => ({ id: 'p_ali', name: p.name, club: '', created: true })) } }; };
  await f('runLibrarySync')();
  assert.equal(t.entriesList[0].members[0].playerId, null);
  assert.equal(persisted, 0);
  for (const kind of ['sample', 'final', 'notSetUp']) {
    t = reset();
    t.entriesList = [{ id: 'e1', name: 'Ali', members: [{ playerId: null, name: 'Ali', club: '' }] }];
    if (kind === 'sample') t.isSample = true;
    if (kind === 'final') t.finalized = { at: 'x' };
    if (kind === 'notSetUp') lib().status = 'not_set_up';
    await f('runLibrarySync')();
    assert.equal(calls.length, 0, kind);
  }
});

/* ---------- Doubles and Teams boxes ---------- */

test('Add pair: two players (picked or typed), an optional team name, the club filled from the players unless typed', async () => {
  const t = reset('Doubles');
  f('openPairDialog')(null);
  assert.equal(modals[0].title, T('pl.addPair'));
  assert.deepEqual(plain(modals[0].onConfirm()), { error: T('pl.needPair') });
  f('plChoose')('p1', 'p1');
  f('plChoose')('p2', 'p1');          // the same player twice is ignored
  assert.equal(run(app, 'plDialog.members[1]'), null);
  f('plChoose')('p2', 'p2');
  assert.equal(run(app, 'plDialog.club'), 'Kelab Novus');
  run(app, 'plDialog.teamName = "Novus A"');
  assert.equal(modals[0].onConfirm(), undefined);
  await tick();
  const e = t.entriesList[0];
  assert.deepEqual([e.name, e.teamName, e.org, plain(e.members.map((m) => m.playerId))], ['Novus A : Ahmad Faiz / Hakim', 'Novus A', 'Kelab Novus', ['p1', 'p2']]);
  // a typed second player, saved to the library; a typed club wins over the players' club
  f('openPairDialog')(null);
  f('plChoose')('p1', 'p3');
  typeIn('ps_p2', 'Kamil');
  typeIn('plClub', 'Mixed');
  await f('plAddNew')('p2', false);
  run(app, 'plDialog.club = "Mixed"; plDialog.clubTyped = true');
  assert.equal(modals[1].onConfirm(), undefined);
  await tick();
  assert.deepEqual([t.entriesList[1].name, t.entriesList[1].org, t.entriesList[1].members[1].playerId], ['Iskandar / Kamil', 'Mixed', 'p_new1_0']);
});

test('a pair with a player already in another pair is refused in the box, in plain words', () => {
  const t = reset('Doubles');
  t.entriesList.push({ id: 'e1', name: 'A & B', teamName: '<b>A&B</b>', members: [{ playerId: 'p1', name: 'Ahmad Faiz', club: '' }, { playerId: 'p9', name: 'X', club: '' }] });
  f('openPairDialog')(null);
  f('plChoose')('p1', 'p1'); f('plChoose')('p2', 'p2');
  const r = modals[0].onConfirm();
  assert.equal(r.error, T('pl.inUse', { name: 'Ahmad Faiz', entry: '<b>A&B</b>' }), 'not HTML-escaped: the box shows it as text');
  assert.equal(t.entriesList.length, 1);
});

test('editing a pair keeps the entry and updates its players, team name, club and display name', () => {
  const t = reset('Doubles');
  t.entriesList.push({ id: 'e1', name: 'Ahmad Faiz / Hakim', teamName: '', org: 'Kelab Novus', members: [{ playerId: 'p1', name: 'Ahmad Faiz', club: 'Kelab Novus' }, { playerId: 'p2', name: 'Hakim', club: 'Kelab Novus' }] });
  f('openPairDialog')('e1');
  assert.equal(modals[0].title, T('pl.editPair'));
  f('plDialogClear')('p2');
  f('plChoose')('p2', 'p3');
  run(app, 'plDialog.teamName = "Duo"');
  assert.equal(modals[0].onConfirm(), undefined);
  assert.deepEqual([t.entriesList.length, t.entriesList[0].id, t.entriesList[0].name, t.entriesList[0].org], [1, 'e1', 'Duo : Ahmad Faiz / Iskandar', 'Kelab Novus']);
  assert.equal(t.entriesList[0].members[0] !== run(app, 'libraryState.players[0]'), true);
  assert.equal(persisted, 1);
});

test('Add team: a team name and at least one player are needed; Triples events use the team box too', async () => {
  const t = reset('Triples');
  assert.equal(f('plUnit')(), 'Teams');
  assert.match(f('entryPickerHTML')(), /openTeamDialog\(null\)/);
  f('openTeamDialog')(null);
  assert.deepEqual(plain(modals[0].onConfirm()), { error: T('pl.needTeamName') });
  run(app, 'plDialog.teamName = "Ipoh Arrows"');
  assert.deepEqual(plain(modals[0].onConfirm()), { error: T('pl.needTeamPlayer') });
  f('plChoose')('add', 'p3'); f('plChoose')('add', 'p4'); f('plChoose')('add', 'p3');
  assert.equal(run(app, 'plDialog.members.length'), 2);
  f('plDialogDrop')(0);
  f('plChoose')('add', 'p5');
  run(app, 'plDialog.club = "Ipoh"');
  assert.equal(modals[0].onConfirm(), undefined);
  await tick();
  assert.deepEqual([t.entriesList[0].name, t.entriesList[0].org, plain(t.entriesList[0].members.map((m) => m.name))], ['Ipoh Arrows', 'Ipoh', ['José Ramírez', 'M. Zul']]);
});

test('Copy a team from another event opens the team box filled in; the copy is new (editing it leaves the old event alone)', async () => {
  const t = reset('Teams');
  const old = f('blankTournament')(); old.id = 't_old'; old.eventCreation.competitionUnit = 'Teams'; old.eventCreation.tournamentName = 'Liga'; old.eventCreation.eventName = 'Malam';
  old.entriesList = [{ id: 'oe1', name: 'Ipoh Arrows', teamName: 'Ipoh Arrows', org: 'Ipoh', members: [{ playerId: 'p3', name: 'Iskandar', club: 'Ipoh' }] }, { id: 'oe2', name: 'No players', members: [] }];
  app.__old = old; run(app, 'tournamentsCache = { t_old: __old, t_pl: state }');
  f('openCopyTeamDialog')();
  const list = modals.pop().bodyHTML;
  assert.match(list, /copyTeamFrom\('t_old','oe1'\)/);
  assert.doesNotMatch(list, /oe2/, 'a team with no players is not offered');
  assert.match(list, /Liga · Malam/);
  f('copyTeamFrom')('t_old', 'oe1');
  await tick();
  assert.equal(run(app, 'plDialog.teamName'), 'Ipoh Arrows');
  run(app, 'plDialog.members[0].name = "Changed"');
  assert.equal(old.entriesList[0].members[0].name, 'Iskandar');
  void t;
});

/* ---------- loading and the Players page ---------- */

test('loading the list: ready, not set up (the migration has not been run) or offline, each with its own note', async () => {
  reset('Singles', 'roundrobin', null);
  lib().status = 'idle';
  server = () => ({ status: 200, body: { players: [{ id: 'p1', name: 'A', club: '' }] } });
  await f('loadLibrary')();
  assert.deepEqual([lib().status, lib().players.length], ['ready', 1]);
  await f('loadLibrary')();
  assert.equal(calls.length, 1, 'loaded once');
  await f('loadLibrary')(true);
  assert.equal(calls.length, 2, 'force reloads');
  reset('Singles', 'roundrobin', null); lib().status = 'idle';
  server = () => ({ status: 503, body: { code: 'library_not_set_up' } });
  await f('loadLibrary')();
  assert.equal(lib().status, 'not_set_up');
  assert.match(f('playersTableHTML')(), new RegExp(T('pl.notSetUp').slice(0, 25).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  reset('Singles', 'roundrobin', null); lib().status = 'idle';
  server = () => 'offline';
  await f('loadLibrary')();
  assert.equal(lib().status, 'error');
  assert.match(f('playersTableHTML')(), /loadLibrary\(true\)/, 'a Try again button');
  assert.match(f('entryPickerHTML')(), new RegExp(T('pl.offline').slice(0, 25).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('the Players page table: search, events played, last played, 50 at a time, and an empty or no-match note', () => {
  reset();
  let html = f('playersTableHTML')();
  assert.equal((html.match(/<tr>/g) || []).length, 6, 'header + 5');
  assert.match(html, /<td><b>Ahmad Faiz<\/b><\/td><td>Kelab Novus<\/td><td>3<\/td><td>2026-10-20<\/td>/);
  run(app, 'playersPage.q = "arrows"');
  assert.equal((f('playersTableHTML')().match(/<tr>/g) || []).length, 2);
  run(app, 'playersPage.q = "nobody"');
  assert.match(f('playersTableHTML')(), new RegExp(T('pl.noMatch')));
  reset('Singles', 'roundrobin', Array.from({ length: 120 }, (_, i) => ({ id: 'x' + i, name: 'P' + String(i).padStart(3, '0'), club: '' })));
  run(app, 'playersPage.q = ""; playersPage.shown = 50');
  html = f('playersTableHTML')();
  assert.equal((html.match(/<tr>/g) || []).length, 51);
  assert.match(html, /playersMore\(\)/);
  reset('Singles', 'roundrobin', []);
  assert.match(f('playersTableHTML')(), new RegExp(T('pl.empty')));
});

test('Players page actions send the right requests: add, edit, remove, merge (keeping the chosen player)', async () => {
  reset();
  f('playersAdd')();
  typeIn('plFormName', ' New  One '); typeIn('plFormClub', 'K');
  assert.deepEqual(modals[0].onConfirm.call(null) || null, null);
  await tick();
  assert.deepEqual(plain(calls[0].body), { players: [{ name: 'New One', club: 'K' }] });
  typeIn('plFormName', '');
  f('playersAdd')();
  assert.deepEqual(plain(modals[modals.length - 1].onConfirm()), { error: T('pl.needName') });
  calls = []; modals = [];
  server = (url) => (url === '/api/players/list' ? { status: 200, body: { players: LIB.map((p) => Object.assign({}, p)) } } : { status: 200, body: { ok: true } });
  f('playersEdit')('p2');
  typeIn('plFormName', 'Hakim Ali'); typeIn('plFormClub', '');
  modals[0].onConfirm(); await tick();
  assert.deepEqual([calls[0].url, plain(calls[0].body)], ['/api/players/update', { id: 'p2', name: 'Hakim Ali', club: '' }]);
  calls = []; modals = [];
  f('playersRemove')('p3'); modals[0].onConfirm(); await tick();
  assert.deepEqual([calls[0].url, plain(calls[0].body)], ['/api/players/remove', { id: 'p3' }]);
  calls = []; modals = [];
  f('playersTick')('p4', true); f('playersTick')('p5', true); f('playersTick')('gone', true);
  app.document.querySelector = () => ({ value: 'p5' });
  f('playersMerge')();
  modals[0].onConfirm(); await tick();
  assert.deepEqual([calls[0].url, plain(calls[0].body)], ['/api/players/merge', { keepId: 'p5', ids: ['p4'], name: 'M. Zul', club: '' }]);
  assert.deepEqual(plain(run(app, 'playersPage.ticked')), {});
});

test('a failed Players page request says why: the server\'s words (in the screen language), or "already in your players"', async () => {
  reset();
  server = () => ({ status: 409, body: { code: 'player_exists', error: 'A player with that name and club is already in the list.' } });
  f('playersEdit')('p2'); typeIn('plFormName', 'Ahmad Faiz'); typeIn('plFormClub', 'Kelab Novus');
  modals[0].onConfirm(); await tick();
  assert.equal(modals.find((m) => m.title === T('pl.failedTitle')).body, T('pl.existsGeneric'));
  modals = [];
  server = () => ({ status: 404, body: { code: 'player_not_found', error: 'Player not found.' } });
  f('playersRemove')('p2'); modals[0].onConfirm(); await tick();
  assert.equal(modals.find((m) => m.title === T('pl.failedTitle')).body, 'Player not found.');
  const ms = loadApp({ lang: 'ms' });
  assert.equal(run(ms, 'ddApiError')({ code: 'player_not_found', error: 'Player not found.' }, 'x'), 'Pemain tidak dijumpai.');
});

test('players of a past event: entry members (not event-only names), older Singles entries by name, each name and club once; added 200 at a time', async () => {
  reset();
  const ev = f('blankTournament')(); ev.id = 't_past'; ev.eventCreation.competitionUnit = 'Singles';
  ev.entriesList = [
    { id: 'a', name: 'Ahmad', members: [{ playerId: 'p1', name: 'Ahmad', club: 'K' }] },
    { id: 'b', name: 'Nick', members: [{ playerId: null, name: 'Nick', club: '', eventOnly: true }] },
    { id: 'c', name: 'Old Name', org: 'Club', autoName: false },
    { id: 'd', name: 'Entry 4', autoName: true },
    { id: 'e', name: 'ahmad', members: [{ playerId: null, name: 'ahmad', club: 'k' }] },
  ];
  assert.deepEqual(plain(f('plEventPlayers')(ev)), [{ name: 'Ahmad', club: 'K' }, { name: 'Old Name', club: 'Club' }]);
  const dbl = Object.assign(f('blankTournament')(), { entriesList: [{ id: 'x', name: 'A / B' }] }); dbl.eventCreation.competitionUnit = 'Doubles';
  assert.deepEqual(plain(f('plEventPlayers')(dbl)), [], 'an older Doubles entry has no players to take');
  ev.entriesList = Array.from({ length: 450 }, (_, i) => ({ id: 'e' + i, name: 'P' + i, members: [{ playerId: null, name: 'Player ' + i, club: '' }] }));
  app.__ev = ev; run(app, 'tournamentsCache = { t_past: __ev }');
  let n = 0;
  server = (url, body) => (url === '/api/players/list' ? { status: 200, body: { players: [] } }
    : { status: 200, body: { players: body.players.map((p) => ({ id: 'q' + (n++), name: p.name, club: '', created: n % 3 !== 0 })) } });
  await f('playersFromEventGo')('t_past');
  assert.deepEqual(calls.filter((c) => c.url === '/api/players/ensure').map((c) => c.body.players.length), [200, 200, 50]);
  assert.equal(modals.pop().body, T('pl.fromEventDone', { added: 300, skipped: 150 }));
});

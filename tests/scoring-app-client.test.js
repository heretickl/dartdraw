const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { DDApp, txt, tick, memStore, click, submit, typeInto, newRoot, fakeServer, SA } = require('./lib/scoring-app-client');

// The scoring app's start-up and login screens (scoring_app/app.js, account.js, net.js): not logged in, #guest, a wrong
// password, the BM words, the offline copy's file list, and the e-mail links' token leaving the address bar.
const EN = global.DD_CASUAL_EN, MS = global.DD_CASUAL_MS;

function fakeWindow(hash) {
  const l = {};
  const w = {
    location: { pathname: '/', search: '', _h: hash, get hash() { return this._h; }, set hash(v) { this._h = v ? (v[0] === '#' ? v : '#' + v) : ''; w.pushes.push(this._h); (l.hashchange || []).forEach((f) => f()); } },
    history: { replaceState: (a, b, url) => { w.replaced.push(url); w.location._h = ''; } },
    pushes: [], replaced: [], addEventListener: (t, f) => { (l[t] = l[t] || []).push(f); },
    fire: (t) => { (l[t] || []).forEach((f) => f()); }
  };
  return w;
}
async function launch(opts) {
  opts = opts || {};
  const server = fakeServer();
  server.answers['/api/account/me'] = opts.me || [401, { code: 'not_authenticated' }];
  Object.assign(server.answers, opts.answers || {});
  const storage = opts.storage || memStore();
  DDNet.init({ fetch: server.fetch, storage });
  const root = newRoot();
  const app = DDApp.start(root, { storage, window: opts.window });
  await app.ready;
  return { app, server, storage, root, v: () => app.view() };
}
const fire = (s) => submit(s.v().querySelector('form.acc-card'));
const fill = (s, user, pass) => { s.v().querySelector('#accUser').value = user; s.v().querySelector('#accPass').value = pass; };

test('not logged in: the login form with Play as guest', async () => {
  const s = await launch();
  assert.equal(txt(s.v().querySelector('.acc-card h2')), 'Log in');
  assert.ok(s.v().querySelector('#accUser') && s.v().querySelector('#accPass[type="password"]'), 'username and password boxes');
  const guest = s.v().querySelector('.guest');
  assert.equal(txt(guest.querySelector('b')), 'PLAY AS GUEST');
  assert.equal(guest.getAttribute('data-go'), '#guest');
  assert.equal(txt(s.v().querySelector('[data-go="#forgot"]')), 'Forgot password?');
  assert.ok(!s.v().querySelector('.dds'), 'no casual setup behind the login');
  assert.ok(s.v().querySelector('.acc-org').hidden, 'the organiser line waits for a failed login');
});

test('Play as guest: tapping it opens the casual setup', async () => {
  const s = await launch();
  click(s.v().querySelector('.guest'));
  assert.equal(txt(s.v().querySelector('.dds.cs .t2')), 'CASUAL PLAY');
  assert.ok(s.v().querySelector('#csA') && s.v().querySelector('#csB') && s.v().querySelector('[data-cs="start"]'));
});

test('#guest shows the casual setup exactly as the guest site always did', async () => {
  const s = await launch({ window: fakeWindow('#guest') });
  // the same screen the plain casual site draws with the same words and storage
  const plain = newRoot();
  DDCasual.start(plain, { storage: memStore(), words: EN });
  assert.equal(txt(s.v()), txt(plain), 'same words on screen');
  assert.equal(s.v().querySelectorAll('*').length, plain.querySelectorAll('*').length, 'same number of elements');
  assert.ok(s.v().querySelector('#csA') && s.v().querySelector('#csB'), 'two name boxes');
  assert.ok(!s.v().querySelector('.acc') && !s.v().querySelector('.cs.acct'), 'no account parts');
  assert.equal(s.server.calls.filter((c) => c[1] !== '/api/account/me').length, 0, 'nothing sent anywhere for a guest');
});

test('a wrong password shows the bad_credentials words and shakes the card', async () => {
  const s = await launch();
  s.server.answers['/api/account/login'] = [401, { code: 'bad_credentials', error: 'Incorrect email or password.' }];
  fill(s, 'a@b.com', 'nope');
  fire(s); await tick();
  assert.equal(txt(s.v().querySelector('.err')), EN.err_bad_credentials);
  assert.ok(s.v().querySelector('.acc-card').classList.contains('shake'), 'shake class');
  assert.ok(!txt(s.v()).includes('Incorrect email or password.'), 'the server\'s own English is not shown');
  // ruling: every failed login says the same, then the organiser line is shown
  assert.ok(!s.v().querySelector('.acc-org').hidden);
  assert.equal(s.v().querySelector('.acc-org a').getAttribute('href'), 'https://dartdraw.vercel.app/app');
});

test('an empty login shakes and asks for both boxes without calling the server', async () => {
  const s = await launch();
  fire(s);
  assert.equal(txt(s.v().querySelector('.err')), EN.err_login_empty);
  assert.ok(s.v().querySelector('.acc-card').classList.contains('shake'));
  assert.equal(s.server.to('/api/account/login').length, 0);
});

test('every failed-login answer shows our own words, never the server text', async () => {
  for (const [status, code, key] of [[403, 'unverified', 'err_unverified'], [429, 'rate_limited', 'err_rate_limited'], [500, 'server_error', 'err_server']]) {
    const s = await launch();
    s.server.answers['/api/account/login'] = [status, { code, error: 'RAW ENGLISH' }];
    fill(s, 'a@b.com', 'x'); fire(s); await tick();
    assert.equal(txt(s.v().querySelector('.err')), EN[key], code);
  }
  const off = await launch();
  off.server.answers['/api/account/login'] = 'offline';
  fill(off, 'a@b.com', 'x'); fire(off); await tick();
  assert.equal(txt(off.v().querySelector('.err')), EN.err_offline);
});

test('a good login shows the scorecard page and keeps the player on the phone; log out forgets them', async () => {
  const s = await launch();
  s.server.answers['/api/account/login'] = [200, { player: { id: 7, email: 'a@b.com', firstName: 'Aisyah', lastName: 'Rahman', mustChange: false } }];
  s.server.answers['/api/games/scorecard'] = [200, { headline: { x01: {}, cricket: {} }, chart: { x01: [], cricket: [] }, breakdown: { x01: {}, cricket: {} }, summary: { tournament: {}, casual: {} }, recent: [], notices: [] }];
  fill(s, 'a@b.com', 'right-password'); fire(s); await tick(8);
  assert.ok(s.v().querySelector('.sc'), 'the scorecard is drawn');
  assert.equal(JSON.parse(s.storage.getItem('dd-player')).id, 7);
  s.server.answers['/api/account/logout'] = [200, { ok: true }];
  click(s.v().querySelector('[data-acc="logout"]')); await tick(8);
  assert.equal(txt(s.v().querySelector('.acc-card h2')), 'Log in');
  assert.equal(s.storage.getItem('dd-player'), null);
});

test('EN | BM: the words change and the typed e-mail stays', async () => {
  const s = await launch();
  fill(s, 'a@b.com', 'secret');
  click(s.v().querySelector('[data-lang="ms"]'));
  assert.equal(txt(s.v().querySelector('.acc-card h2')), MS.loginTitle);
  assert.notEqual(MS.loginTitle, EN.loginTitle);
  assert.equal(s.storage.getItem('dd-lang'), 'ms');
  assert.equal(s.v().querySelector('#accUser').value, 'a@b.com');
  assert.equal(s.v().querySelector('#accPass').value, '', 'the password is not kept');
});

test('a session that ended: a player kept on the phone but /me says 401 -> the login screen', async () => {
  const storage = memStore({ 'dd-player': JSON.stringify({ id: 9, email: 'e@f.com', firstName: 'Ravi', lastName: 'K' }) });
  const s = await launch({ storage, me: [401, {}] });
  assert.equal(txt(s.v().querySelector('.acc-card h2')), 'Log in');
  assert.equal(storage.getItem('dd-player'), null);
});

test('offline with a kept player: still logged in, no login screen', async () => {
  const storage = memStore({ 'dd-player': JSON.stringify({ id: 9, email: 'e@f.com', firstName: 'Ravi', lastName: 'K' }) });
  const s = await launch({ storage, me: 'offline' });
  assert.ok(!s.v().querySelector('#accUser'), 'not asked to log in');
  assert.ok(s.v().querySelector('.sc'));
});

test('a password that must be changed: every logged-in screen shows only Change password', async () => {
  const s = await launch();
  s.server.answers['/api/account/login'] = [200, { player: { id: 8, email: 'c@d.com', firstName: 'Lim', lastName: 'Wei', mustChange: true } }];
  fill(s, 'c@d.com', 'TEMPPASS10'); fire(s); await tick(8);
  assert.equal(txt(s.v().querySelector('.acc-card h2')), 'Change password');
  assert.ok(!s.v().querySelector('#accCur'), 'no current-password box on the forced screen');
  s.app.ctx.go('#play');
  assert.equal(txt(s.v().querySelector('.acc-card h2')), 'Change password');
});

test('the verify link asks for the password and sends the token; a bad one says so and offers a new link', async () => {
  const s = await launch();
  s.server.answers['/api/account/verify'] = [400, { code: 'invalid_link_or_password' }];
  s.app.ctx.go('#verify=tok123');
  assert.ok(s.v().querySelector('#accPass[type="password"]'), 'asks for the password');
  s.v().querySelector('#accPass').value = 'x'; fire(s); await tick();
  assert.equal(s.server.to('/api/account/verify')[0][2].token, 'tok123');
  assert.equal(txt(s.v().querySelector('.err')), EN.err_invalid_link_or_password);
  assert.ok(!s.v().querySelector('.acc-newlink').hidden);
});

// ---- the token leaves the address ----
test('#reset=<token>: the token is taken off the address (replaceState), kept for redraws, sent on save', async () => {
  const win = fakeWindow('#reset=SECRET123');
  const server = fakeServer();
  server.answers['/api/account/me'] = [401, {}];
  server.answers['/api/account/reset'] = [200, { ok: true }];
  const storage = memStore();
  DDNet.init({ fetch: server.fetch, storage });
  const app = DDApp.start(newRoot(), { storage, window: win }); await app.ready;
  assert.equal(txt(app.view().querySelector('h2')), EN.resetTitle);
  assert.deepEqual(win.replaced, ['/'], 'history.replaceState to the bare path');
  assert.ok(!win.location.hash.includes('SECRET'), 'no token in the address');
  assert.equal(win.pushes.length, 0, 'no history entry added');
  app.ctx.setLang('ms');   // a redraw still has the token
  assert.equal(txt(app.view().querySelector('h2')), MS.resetTitle);
  app.view().querySelector('#accPass').value = 'newpassword1';
  submit(app.view().querySelector('form.acc-card')); await tick();
  assert.equal(server.to('/api/account/reset')[0][2].token, 'SECRET123');
  assert.equal(txt(app.view().querySelector('h2')), MS.loginTitle, 'back at log in');
  assert.ok(!win.pushes.some((p) => p.includes('SECRET')), 'no history entry holds the token');
});

test('#verify=<token>: the token is taken off the address too', async () => {
  const win = fakeWindow('#verify=VTOKEN9');
  const server = fakeServer();
  server.answers['/api/account/me'] = [401, {}];
  server.answers['/api/account/verify'] = [200, { player: { id: 1, email: 'a@b.c', firstName: 'A', lastName: 'B' } }];
  const storage = memStore();
  DDNet.init({ fetch: server.fetch, storage });
  const app = DDApp.start(newRoot(), { storage, window: win }); await app.ready;
  assert.equal(txt(app.view().querySelector('h2')), EN.verifyTitle);
  assert.equal(win.replaced.length, 1);
  assert.ok(!win.location.hash.includes('VTOKEN9'));
  app.view().querySelector('#accPass').value = 'pw';
  submit(app.view().querySelector('form.acc-card')); await tick();
  assert.equal(server.to('/api/account/verify')[0][2].token, 'VTOKEN9');
});

test('a late "me" answer does not redraw over a half-typed login', async () => {
  const server = fakeServer();
  server.answers['/api/account/me'] = [200, { player: { id: 3, email: 'x@y.com', firstName: 'Nur', lastName: 'A' } }];
  let release;
  const storage = memStore();
  DDNet.init({ fetch: (u, r) => (u === '/api/account/me' ? new Promise((res) => { release = () => res(server.fetch(u, r)); }) : server.fetch(u, r)), storage });
  const app = DDApp.start(newRoot(), { storage });
  typeInto(app.view().querySelector('#accUser'), 'typing@');
  await tick(); release(); await app.ready;
  assert.equal(app.view().querySelector('#accUser').value, 'typing@');
});

// ---- words ----
const placeholders = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join(',');

test('every EN key exists in the BM words and every BM key in the EN words, with the same {placeholders}', () => {
  const en = Object.keys(EN), ms = Object.keys(MS);
  assert.deepEqual(en.filter((k) => !(k in MS)), [], 'in EN, missing from BM');
  assert.deepEqual(ms.filter((k) => !(k in EN)), [], 'in BM, missing from EN');
  assert.deepEqual(en.filter((k) => typeof EN[k] === 'string' && placeholders(EN[k]) !== placeholders(MS[k])), [], 'same {placeholders}');
  assert.ok(en.length > 300, 'the file was read');
});

test('no BM word is left empty', () => {
  assert.deepEqual(Object.keys(MS).filter((k) => typeof MS[k] === 'string' && !MS[k].trim()), []);
});

// ---- the offline copy ----
test('sw.js SHELL lists every local file index.html loads, and each exists', () => {
  const html = fs.readFileSync(path.join(SA, 'index.html'), 'utf8');
  const files = [...html.matchAll(/<(?:script src|link rel="stylesheet" href)="([^"]+)"/g)].map((m) => m[1]).filter((u) => !/^https?:/.test(u)).map((u) => '/' + u.replace(/^\.?\//, ''));
  const { SHELL } = require(path.join(SA, 'sw.js'));
  files.forEach((f) => { assert.ok(SHELL.includes(f), f + ' is in SHELL'); assert.ok(fs.existsSync(path.join(SA, f)), f + ' exists'); });
  assert.ok(SHELL.includes('/'));
  ['/net.js', '/account.js', '/app.js', '/scorecard.js', '/opponent.js', '/i18n/casual.ms.js'].forEach((f) => assert.ok(SHELL.includes(f), f));
});

// ---- the save queue (net.js) ----
test('the save queue keeps one entry per game id, and sends only the logged-in player\'s games', async () => {
  const server = fakeServer();
  DDNet.init({ fetch: server.fetch, storage: memStore() });
  DDNet.queue.add({ id: 'g1', player: 1, game: { id: 'g1' } });
  DDNet.queue.add({ id: 'g1', player: 1, game: { id: 'g1', again: true } });
  DDNet.queue.add({ id: 'g2', player: 2, game: { id: 'g2' } });
  assert.equal(DDNet.queue.items().length, 2, 'the same id is stored once');
  server.answers['/api/games/save'] = 'offline';
  assert.equal(await DDNet.queue.flush(1), 0);
  assert.equal(DDNet.queue.items().length, 2, 'no signal: both stay');
  server.answers['/api/games/save'] = [200, { saved: { me: 'saved' } }];
  assert.equal(await DDNet.queue.flush(1), 1);
  assert.deepEqual(DDNet.queue.items().map((i) => i.id), ['g2'], 'player 2\'s game is not sent as player 1');
  assert.equal(server.to('/api/games/save').filter((c) => c[2].id === 'g2').length, 0);
});

test('queue: a refused game (400) is dropped; a lost session (401), a server error (500) or a rate limit (429) keeps it', async () => {
  const server = fakeServer();
  DDNet.init({ fetch: server.fetch, storage: memStore() });
  for (const [st, kept] of [[400, 0], [401, 1], [500, 1], [429, 1]]) {
    DDNet.queue.items().forEach((i) => DDNet.queue.remove(i.id));
    DDNet.queue.add({ id: 'g', player: 1, game: { id: 'g' } });
    server.answers['/api/games/save'] = [st, {}];
    await DDNet.queue.flush(1);
    assert.equal(DDNet.queue.items().length, kept, 'status ' + st);
  }
});

test('api() with no answer gives status 0 and never throws', async () => {
  DDNet.init({ fetch: () => Promise.reject(new Error('offline')), storage: memStore() });
  const r = await DDNet.api('/nowhere');
  assert.equal(r.ok, false);
  assert.equal(r.status, 0);
});

// ---- final review fixes (I2, M3) ----

test('a 429 keeps the game in the queue', async () => {
  const server = fakeServer();
  DDNet.init({ fetch: server.fetch, storage: memStore() });
  DDNet.queue.add({ id: 'g1', player: 1, game: { id: 'g1' } });
  DDNet.queue.add({ id: 'g2', player: 1, game: { id: 'g2' } });
  server.answers['/api/games/save'] = [429, { code: 'too_many', error: 'Too many games saved. Try again later.' }];
  assert.equal(await DDNet.queue.flush(1), 0);
  assert.deepEqual(DDNet.queue.items().map((i) => i.id), ['g1', 'g2'], 'both kept: try later');
  assert.equal(server.to('/api/games/save').length, 1, 'the rest wait instead of being sent into the limit');
  server.answers['/api/games/save'] = [200, { saved: { me: 'saved', friend: null } }];
  assert.equal(await DDNet.queue.flush(1), 2);
  assert.equal(DDNet.queue.items().length, 0);
});

test('offline log out shows the login screen and sends the logout once back online', async () => {
  const RAVI = { id: 9, email: 'e@f.com', firstName: 'Ravi', lastName: 'K' };
  const storage = memStore({ 'dd-player': JSON.stringify(RAVI) });
  const win = fakeWindow('');
  const s = await launch({ storage, me: 'offline', window: win, answers: { '/api/account/logout': 'offline' } });
  DDNet.queue.add({ id: 'g9', player: 9, game: { id: 'g9' } });
  assert.ok(s.v().querySelector('.sc'), 'logged in, offline');
  click(s.v().querySelector('[data-acc="logout"]')); await tick(8);
  assert.equal(txt(s.v().querySelector('.acc-card h2')), 'Log in', 'the login screen at once');
  assert.equal(storage.getItem('dd-player'), null, 'the phone forgets the player');
  assert.equal(s.app.ctx.player, null);
  assert.equal(s.server.to('/api/account/logout').length, 1);
  // back online: the logout goes to the server (the cookie was still valid there), once
  s.server.answers['/api/account/logout'] = [200, { ok: true }];
  s.server.answers['/api/games/save'] = [200, { saved: { me: 'saved', friend: null } }];
  win.fire('online'); await tick(8);
  assert.equal(s.server.to('/api/account/logout').length, 2, 'sent when the signal returns');
  win.fire('online'); await tick(8);
  assert.equal(s.server.to('/api/account/logout').length, 2, 'only once');
  // the player's queued game stays, and is not sent while nobody is logged in as them
  assert.deepEqual(DDNet.queue.items().map((i) => i.id), ['g9']);
  assert.equal(s.server.to('/api/games/save').length, 0);
  assert.equal(txt(s.v().querySelector('.acc-card h2')), 'Log in');

  // The app closed before the signal came back: opened again with a signal, the logout goes first, so the session that
  // is still valid on the server does not log the player back in.
  const storage2 = memStore({ 'dd-player': JSON.stringify(RAVI) });
  const off = await launch({ storage: storage2, me: 'offline', window: fakeWindow(''), answers: { '/api/account/logout': 'offline' } });
  click(off.v().querySelector('[data-acc="logout"]')); await tick(8);
  assert.equal(storage2.getItem('dd-player'), null);
  let out = false;
  const back = await launch({
    storage: storage2, window: fakeWindow(''),
    me: () => (out ? [401, { code: 'not_authenticated' }] : [200, { player: RAVI }]),
    answers: { '/api/account/logout': () => { out = true; return [200, { ok: true }]; } }
  });
  await tick(8);
  assert.equal(back.server.to('/api/account/logout').length, 1, 'the waiting logout is sent at start-up');
  assert.equal(storage2.getItem('dd-player'), null, 'still logged out');
  assert.equal(txt(back.v().querySelector('.acc-card h2')), 'Log in');
});

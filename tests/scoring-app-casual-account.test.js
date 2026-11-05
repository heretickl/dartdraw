const { test } = require('node:test');
const assert = require('node:assert/strict');
const { txt, tick, memStore, click, typeInto, newRoot, fakeServer } = require('./lib/scoring-app-client');

// Casual play when logged in (scoring_app/casual.js, opponent.js renderChoose, net.js queue): Player 1 is the player, an
// opponent is chosen, the finished game is saved once under one id, queued with no signal, never saved when ended early,
// and its turns are locked once it has gone to the server. Guests are untouched.
const C = global.DDCasual, W = global.DD_CASUAL_EN;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const PLAYER = { id: 'p1', email: 'ahmad@example.com', firstName: 'Ahmad', lastName: 'Faiz' };
const FR = [
  { id: 'f1', badge: 'linked', nickname: 'Danny', firstName: 'Daniel', lastName: 'Tan', games: 14, headToHead: { won: 8, lost: 6 } },
  { id: 'f2', badge: 'waiting', nickname: '', firstName: 'Rizal', lastName: 'Hakim', games: 3, headToHead: { won: 2, lost: 1 } },
  { id: 'f3', badge: 'none', nickname: 'Mei', firstName: 'Mei Ling', lastName: 'Soo', games: 0, headToHead: { won: 0, lost: 0 } },
  { id: 'f4', badge: 'linked', nickname: 'ahmad', firstName: 'Ahmad', lastName: 'Zaki', games: 0 }
];
const SAVED_OK = [200, { saved: { me: 'saved', friend: 'saved' } }];

// A logged-in site on its own phone (storage) and server. opts.player false = a guest.
function site(env, opts) {
  opts = opts || {};
  const root = newRoot();
  const ctx = { lang: 'en', words: W, player: opts.guest ? null : PLAYER, api: DDNet.api, setPlayer(p) { ctx.player = p; }, go(h) { ctx.went = h; } };
  const copts = { storage: env.storage, words: W };
  if (!opts.guest) Object.assign(copts, { player: PLAYER, ctx, net: DDNet, onRelogin() { ctx.relogin = true; }, playWith: opts.playWith });
  const h = C.start(root, copts);
  const q = (sel) => root.querySelector(sel);
  const tap = (sel) => { const el = typeof sel === 'string' ? q(sel) : sel; assert.ok(el, 'missing ' + sel); click(el); };
  return { root, h, q, tap, ctx };
}
function env() {
  const server = fakeServer(), storage = memStore(), queueStore = memStore();
  server.answers['/api/friends/list'] = [200, { friends: FR, requests: [] }];
  server.answers['/api/games/list'] = [200, { games: [
    { id: 'x1', opponent: { name: 'Danny', guest: false } }, { id: 'x2', opponent: { name: 'Kumar', guest: true } },
    { id: 'x3', opponent: { name: 'Danny', guest: false } }, { id: 'x4', opponent: { name: 'Rizal Hakim', guest: false } }, { id: 'x5', opponent: { name: 'Gone Friend', guest: false } }] }];
  server.answers['/api/games/save'] = SAVED_OK;
  DDNet.init({ fetch: server.fetch, storage: queueStore });
  server.queueStore = queueStore;
  return { server, storage };
}
const saves = (e) => e.server.to('/api/games/save');
function score(s, n) { if (n === 0) { s.tap('[data-act="digit"][data-v="0"]'); s.tap('[data-act="submit"]'); } else s.tap(`[data-act="quick"][data-v="${n}"]`); }
// a best-of-1 501: A takes 180, B 0, A 180, B 0, then A needs 141 and finishes on a treble 20 .. double
function playToResult(s) {
  s.tap('[data-act="bull"][data-v="a"]');
  [180, 0, 180, 0].forEach((n) => score(s, n));
  s.tap('[data-act="digit"][data-v="1"]'); s.tap('[data-act="digit"][data-v="4"]'); s.tap('[data-act="digit"][data-v="1"]'); s.tap('[data-act="submit"]');
  s.tap('[data-act="finish"][data-v="3"]');
}
// logged in, Danny chosen from Recent, best of 1, started
async function startGameWithDanny(e) {
  const s = site(e);
  s.tap('[data-cs="opp"]'); await tick();
  s.tap(s.root.querySelectorAll('.co-chip')[0]);
  s.tap('[data-cs="best"][data-v="1"]'); s.tap('[data-cs="start"]');
  return s;
}
const queued = () => DDNet.queue.items();

test('logged in: player 1 is the player, named and locked; player 2 is the Choose opponent button', () => {
  const s = site(env());
  assert.equal(txt(s.q('.cs.acct .nm.me b')), 'Ahmad');
  assert.equal(txt(s.q('.nm.me .ini')), 'AF');
  assert.equal(txt(s.q('.nm.me .al')), 'Always counts');
  assert.ok(s.q('.nm.me svg.lk'), 'lock icon');
  assert.ok(!s.q('#csA') && !s.q('#csB'), 'no name boxes to type in');
  assert.equal(txt(s.q('[data-cs="opp"]')), '+ CHOOSE OPPONENT');
  assert.ok(s.q('[data-cs="start"]').hasAttribute('disabled'), 'start waits for an opponent');
  assert.equal(s.root.querySelectorAll('[data-cs="game"]').length, 3);
  assert.equal(s.root.querySelectorAll('[data-cs="best"]').length, 5);
});

test('guest: the setup is the one the guest site always had, and a guest game sends and queues nothing', async () => {
  const e = env();
  const s = site(e, { guest: true });
  assert.ok(s.q('#csA') && s.q('#csB'), 'two name boxes');
  assert.ok(!s.q('.cs.acct') && !s.q('[data-cs="opp"]'), 'no account parts');
  typeInto(s.q('#csA'), 'Ann'); typeInto(s.q('#csB'), 'Bob');
  s.tap('[data-cs="best"][data-v="1"]'); s.tap('[data-cs="start"]');
  playToResult(s); await tick();
  assert.ok(s.q('.sum'), 'the result shows');
  assert.ok(!s.q('.sum .saved'), 'no saved line');
  assert.equal(e.server.calls.length, 0, 'nothing sent');
  assert.equal(queued().length, 0, 'nothing queued');
  const kept = JSON.parse(e.storage.getItem(C.KEY));
  assert.ok(!('owner' in kept) && !('gameId' in kept), 'no account fields kept');
  s.tap('[data-act="back"]');
  assert.ok(s.root.querySelectorAll('.turnsp [data-act="edit"]').length > 0, 'a guest can still edit turns');
  assert.ok(!s.q('.turnsp .subl.locked'));
});

test('Choose opponent: recent chips (each once, a removed friend left out), friends, search, guest', async () => {
  const s = site(env());
  s.tap('[data-cs="opp"]'); await tick();
  assert.equal(txt(s.q('.co-t')), 'CHOOSE OPPONENT');
  assert.equal(s.root.firstChild.classList.contains('dds'), true, 'the sheet is outside the zoomed setup');
  assert.deepEqual(s.root.querySelectorAll('.co-chip b').map(txt), ['Danny', 'Kumar', 'Rizal Hakim']);
  assert.equal(s.root.querySelectorAll('.co-list .fx-row').length, 4);
  assert.ok(txt(s.q('.co-list .fx-row')).includes('Daniel Tan · 14 games · 8–6'));
  assert.equal(txt(s.q('.co-list .fx-row .fx-bdg')), 'LINKED');
  typeInto(s.q('.co-sheet .fx-search'), 'soo');
  assert.equal(txt(s.q('.co-list .fx-row b')), 'Mei');
  assert.ok(txt(s.q('.co-guest')).includes('Nothing saved for them'));
  s.tap('[data-co="guest"]');
  assert.equal(s.q('[data-co="gname"]').getAttribute('maxlength'), '20');
  s.q('.co-gform').dispatchEvent({ type: 'submit', bubbles: true, target: s.q('.co-gform'), preventDefault() {} });
  assert.equal(txt(s.q('.co-sheet .fx-err')), 'Type their first name.');
});

test('choosing a friend shows their name and badge and enables start; the same first name as yours gets a different game name', async () => {
  const e = env();
  const s = site(e);
  s.tap('[data-cs="opp"]'); await tick();
  s.tap(s.root.querySelectorAll('.co-list .fx-row').filter((r) => r.getAttribute('data-fid') === 'f4')[0]);
  assert.equal(txt(s.q('.nm.chosen b')), 'ahmad');
  assert.equal(s.h.data().picks.b, 'Ahmad Zaki', 'the game uses the full name so the two sides differ');
  s.tap('[data-cs="opp"]'); await tick();
  s.tap(s.root.querySelectorAll('.co-chip')[0]);
  assert.equal(txt(s.q('.nm.chosen b')), 'Danny');
  assert.equal(txt(s.q('.nm.chosen .bdg')), 'LINKED');
  assert.ok(!s.q('[data-cs="start"]').hasAttribute('disabled'));
});

test('a guest opponent: nothing saved for them, and the game is sent with sideB.guest', async () => {
  const e = env();
  const s = site(e);
  s.tap('[data-cs="opp"]'); await tick(); s.tap('[data-co="guest"]');
  s.q('[data-co="gname"]').value = 'Kumar';
  s.q('.co-gform').dispatchEvent({ type: 'submit', bubbles: true, target: s.q('.co-gform'), preventDefault() {} });
  assert.equal(txt(s.q('.nm.chosen b')), 'Kumar');
  assert.equal(txt(s.q('.nm.chosen .al')), 'Nothing saved for them');
  e.server.answers['/api/games/save'] = [200, { saved: { me: 'saved', friend: null } }];
  s.tap('[data-cs="best"][data-v="1"]'); s.tap('[data-cs="start"]'); playToResult(s); await tick();
  assert.equal(saves(e)[0][2].sideB.guest, 'Kumar');
  assert.equal(txt(s.q('.sum .saved')), 'Saved to your scorecard');
});

test('a friend\'s "Play" button preselects them as player 2', () => {
  const s = site(env(), { playWith: { friendshipId: 'f2', nickname: 'Rizal Hakim', name: 'Rizal Hakim', badge: 'waiting' } });
  assert.equal(txt(s.q('.nm.chosen b')), 'Rizal Hakim');
  assert.equal(txt(s.q('.nm.chosen .bdg')), 'WAITING');
});

test('match over: the game is saved once, as the player, under a lowercase uuid, and the result says where', async () => {
  const e = env();
  const s = await startGameWithDanny(e);
  const id = s.h.data().gameId;
  assert.match(id, UUID);
  const kept = JSON.parse(e.storage.getItem(C.KEY));
  assert.equal(kept.gameId, id); assert.equal(kept.owner, 'p1');
  playToResult(s); await tick();
  assert.equal(saves(e).length, 1, 'sent once');
  const b = saves(e)[0][2];
  assert.equal(b.id, id);
  assert.equal(b.sideA.me, true);
  assert.equal(b.sideB.friendshipId, 'f1');
  assert.equal(b.format.game, 'x01');
  assert.ok(b.events.length > 0 && typeof b.playedAt === 'string');
  assert.ok(b.events.filter((x) => x.type === 'turn' && x.side === 'a').every((x) => x.player === 'Ahmad'), 'side A turns carry the player\'s name');
  assert.equal(txt(s.q('.sum .saved')), 'Saved to your scorecard and Danny’s');
  assert.equal(queued().length, 0);
});

test('reopening the result of a saved game does not send it again', async () => {
  const e = env();
  const s = await startGameWithDanny(e);
  playToResult(s); await tick();
  assert.equal(saves(e).length, 1);
  const again = site(e); await tick();
  assert.equal(saves(e).length, 1, 'not sent again');
  assert.equal(txt(again.q('.sum .saved')), 'Saved to your scorecard and Danny’s');
});

test('the saved line tells when the friend\'s copy is held, and when only yours was saved', async () => {
  const e = env();
  const s = await startGameWithDanny(e);
  e.server.answers['/api/games/save'] = [200, { saved: { me: 'saved', friend: 'held' } }];
  playToResult(s); await tick();
  assert.equal(txt(s.q('.sum .saved')), 'Saved to yours. Danny’s is held until they accept.');
  e.server.answers['/api/games/save'] = [200, { saved: { me: 'saved', friend: null } }];
  s.tap('[data-act="rematch"]'); playToResult(s); await tick();
  assert.equal(txt(s.q('.sum .saved')), 'Saved to your scorecard');
});

test('a rematch is a new game with a new id', async () => {
  const e = env();
  const s = await startGameWithDanny(e);
  const id1 = s.h.data().gameId;
  playToResult(s); await tick();
  s.tap('[data-act="rematch"]');
  const id2 = s.h.data().gameId;
  assert.match(id2, UUID);
  assert.notEqual(id1, id2);
});

test('offline at match over: queued under the game id, with the back-online line', async () => {
  const e = env();
  const s = await startGameWithDanny(e);
  const id = s.h.data().gameId;
  e.server.answers['/api/games/save'] = 'offline';
  playToResult(s); await tick();
  assert.equal(txt(s.q('.sum .saved')), 'Will be saved when you’re back online');
  assert.equal(queued().length, 1);
  assert.equal(queued()[0].id, id);
  assert.equal(queued()[0].player, 'p1');
  assert.equal(queued()[0].game.id, id);
});

test('back online: the flush sends the same game id again, not a new one, and empties the queue', async () => {
  const e = env();
  const s = await startGameWithDanny(e);
  const id = s.h.data().gameId;
  e.server.answers['/api/games/save'] = 'offline';
  playToResult(s); await tick();
  e.server.answers['/api/games/save'] = SAVED_OK;
  e.server.calls.length = 0;
  assert.equal(await DDNet.queue.flush('p1'), 1);
  assert.equal(saves(e).length, 1);
  assert.equal(saves(e)[0][2].id, id, 'same id');
  assert.equal(queued().length, 0);
});

test('reopening at the result while the game is still queued sends it again with the same id and updates the line', async () => {
  const e = env();
  const s = await startGameWithDanny(e);
  const id = s.h.data().gameId;
  e.server.answers['/api/games/save'] = 'offline';
  playToResult(s); await tick();
  e.server.answers['/api/games/save'] = SAVED_OK;
  e.server.calls.length = 0;
  const again = site(e); await tick();
  assert.equal(saves(e).length, 1);
  assert.equal(saves(e)[0][2].id, id);
  assert.equal(txt(again.q('.sum .saved')), 'Saved to your scorecard and Danny’s');
  assert.equal(queued().length, 0, 'the successful send took it off the queue');
});

test('a lost session at match over: kept, and asks to log in again; LOG IN calls onRelogin', async () => {
  const e = env();
  const s = await startGameWithDanny(e);
  const id = s.h.data().gameId;
  e.server.answers['/api/games/save'] = [401, { code: 'not_authenticated' }];
  playToResult(s); await tick();
  assert.equal(txt(s.q('.sum .saved p')), 'Log in again to save this game.');
  assert.ok(queued().some((i) => i.id === id), 'still queued');
  s.tap('.sum .saved [data-act="relogin"]');
  assert.equal(s.ctx.relogin, true);
});

test('a game the server refuses (400) is dropped and not queued', async () => {
  const e = env();
  const s = await startGameWithDanny(e);
  e.server.answers['/api/games/save'] = [400, { code: 'bad_game' }];
  const warn = console.warn; let warned = 0; console.warn = () => { warned++; };
  try { playToResult(s); await tick(); } finally { console.warn = warn; }
  assert.equal(txt(s.q('.sum .saved')), 'This game could not be saved.', 'said, not silent (final review I1)');
  assert.equal(queued().length, 0);
  assert.equal(warned, 1, 'logged once');
});

test('ending the game early sends nothing and queues nothing, and keeps the opponent', async () => {
  const e = env();
  const s = await startGameWithDanny(e);
  s.tap('[data-act="bull"][data-v="a"]'); score(s, 180); score(s, 60);
  s.tap('[data-act="gear"]'); s.tap('[data-act="gearBtn"][data-v="0"]'); s.tap('[data-act="gearYes"]');
  await tick();
  assert.ok(s.q('.cs'), 'back at the setup');
  assert.equal(saves(e).length, 0);
  assert.equal(queued().length, 0);
  assert.equal(s.h.data().gameId, null, 'no id kept');
  assert.equal(txt(s.q('.nm.chosen b')), 'Danny');
});

test('after the save, the result\'s turns are locked: no edit buttons, and a line says why', async () => {
  const e = env();
  const s = await startGameWithDanny(e);
  playToResult(s); await tick();
  s.tap('[data-act="back"]');
  assert.equal(s.root.querySelectorAll('.turnsp [data-act="edit"]').length, 0);
  assert.equal(txt(s.q('.turnsp .subl.locked')), 'Saved — turns can’t be changed now');
});

test('turns are locked while the save is on its way too, and a rematch finished meanwhile is queued under its own id then sent', async () => {
  const e = env();
  const s = await startGameWithDanny(e);
  e.server.answers['/api/games/save'] = 'hold';
  const idA = s.h.data().gameId;
  playToResult(s); await tick();
  s.tap('[data-act="back"]');
  assert.equal(s.root.querySelectorAll('.turnsp [data-act="edit"]').length, 0, 'locked while sending');
  s.tap('[data-act="closePop"]');
  s.tap('[data-act="rematch"]');
  const idB = s.h.data().gameId;
  playToResult(s); await tick();
  assert.equal(saves(e).length, 1, 'only the first is on its way');
  assert.deepEqual(queued().map((i) => i.id), [idB], 'the second waits under its own id');
  assert.notEqual(idA, idB);
  e.server.answers['/api/games/save'] = SAVED_OK;
  e.server.held.shift()(200, SAVED_OK[1]); await tick(8);
  assert.equal(saves(e).length, 2);
  assert.equal(saves(e)[1][2].id, idB, 'sent with the same id it was queued under');
  assert.equal(queued().length, 0);
});

test('a guest on a phone with a logged-in game left behind gets a fresh setup, not that game', async () => {
  const e = env();
  const s = await startGameWithDanny(e);
  playToResult(s); await tick();
  const guest = site(e, { guest: true });
  assert.ok(guest.q('#csA') && guest.q('#csA').value === '');
  assert.ok(!guest.q('.sum'));
});

test('new game ids are lowercase uuids, even where crypto.randomUUID is missing', () => {
  const rc = globalThis.crypto;
  Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
  let ids;
  try { ids = Array.from({ length: 200 }, () => C.newId()); } finally { Object.defineProperty(globalThis, 'crypto', { value: rc, configurable: true }); }
  assert.ok(ids.every((x) => UUID.test(x)));
  assert.equal(new Set(ids).size, 200);
});

// ---- final review fixes (I1) ----

test('a remembered opponent no longer on the list is cleared', async () => {
  const e = env();
  const s = site(e);
  s.tap('[data-cs="opp"]'); await tick();
  s.tap(s.root.querySelectorAll('.co-chip')[0]);
  assert.equal(txt(s.q('.nm.chosen b')), 'Danny');
  // Danny's entry goes (removed, merged, or Danny removed or blocked the player). With no signal the list is not in
  // hand, so nothing is cleared.
  e.server.answers['/api/friends/list'] = 'offline';
  const off = site(e); await tick();
  assert.equal(txt(off.q('.nm.chosen b')), 'Danny', 'kept while the list cannot be read');
  // the setup opened again with a fresh list: back to Choose opponent
  e.server.answers['/api/friends/list'] = [200, { friends: FR.filter((f) => f.id !== 'f1'), requests: [] }];
  const again = site(e); await tick();
  assert.equal(txt(again.q('[data-cs="opp"]')), '+ CHOOSE OPPONENT');
  assert.equal(again.h.data().opp, null);
  assert.equal(again.h.data().picks.b, '');
  assert.ok(again.q('[data-cs="start"]').hasAttribute('disabled'));
  assert.equal(JSON.parse(e.storage.getItem(C.KEY)).opp, null, 'forgotten on the phone too');
  // the same from Choose opponent's own list: Danny is picked, the list then comes back without him, the panel is closed
  e.server.answers['/api/friends/list'] = [200, { friends: FR, requests: [] }];
  const p = site(e); await tick();
  p.tap('[data-cs="opp"]'); await tick();
  p.tap(p.root.querySelectorAll('.co-list .fx-row').filter((r) => r.getAttribute('data-fid') === 'f1')[0]);
  assert.equal(txt(p.q('.nm.chosen b')), 'Danny');
  e.server.answers['/api/friends/list'] = [200, { friends: FR.filter((f) => f.id !== 'f1'), requests: [] }];
  p.tap('[data-cs="opp"]'); await tick();
  p.tap('.co-x');
  assert.equal(txt(p.q('[data-cs="opp"]')), '+ CHOOSE OPPONENT');
  assert.equal(p.h.data().opp, null);
});

test('a dropped save shows the could-not-be-saved line', async () => {
  const e = env();
  const s = await startGameWithDanny(e);
  e.server.answers['/api/games/save'] = [400, { code: 'bad_opponent' }];
  const warn = console.warn; console.warn = () => {};
  try { playToResult(s); await tick(); } finally { console.warn = warn; }
  assert.equal(txt(s.q('.sum .saved')), 'This game could not be saved.');
  assert.equal(s.h.data().save, 'dropped');
  // still there when the result is reopened, and not sent again
  const again = site(e); await tick();
  assert.equal(txt(again.q('.sum .saved')), 'This game could not be saved.');
  assert.equal(saves(e).length, 1);
  assert.equal(global.DD_CASUAL_MS.saveDropped, 'Permainan ini tidak dapat disimpan.');
});

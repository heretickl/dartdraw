const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parse, txt, tick, sleep, memStore, click, submit, typeInto, fakeServer } = require('./lib/scoring-app-client');

// The Friends tab, the friend card and the Add a friend form (scoring_app/scorecard.js renderFriends, opponent.js).
const SC = global.DDScorecard, W = global.DD_CASUAL_EN;

const side = (avg, mpr) => ({ played: 14, won: 8, x01: { avg3: avg, first9: avg + 8, checkoutPct: 36, n180: 3, highFinish: 124, bestLegDarts: 15, legsPlayed: 20 },
  cricket: { mpr, f9mpr: mpr + 0.3, rounds5: 11, hatTricks: 2, bestLegDarts: 17, legsPlayed: 9 } });
const friends = () => [
  { id: 'f1', badge: 'linked', nickname: 'Danny', firstName: 'Daniel', lastName: 'Tan', games: 14, headToHead: { won: 8, lost: 6 }, lastPlayed: new Date(Date.now() - 2 * 86400000).toISOString(),
    recent: [true, false, true, true, false].map((won, i) => ({ gameId: 'g' + i, playedAt: null, won })), compare: { games: 14, me: side(61.2, 2.6), them: side(58.4, 2.3) } },
  { id: 'f2', badge: 'none', nickname: '', firstName: 'Mei Ling', lastName: '<b>Soo</b>', email: 'mei@example.com', asked: false, nextInviteAt: null, games: 6, headToHead: { won: 3, lost: 3 }, lastPlayed: null, recent: [], compare: { games: 6, me: side(55.5, 2.1), them: null } },
  { id: 'f3', badge: 'waiting', nickname: 'Riz', firstName: 'Rizal', lastName: 'Hakim', games: 0, headToHead: { won: 0, lost: 0 }, lastPlayed: null, recent: [], compare: null, requestedAt: new Date().toISOString(), nextResendAt: null }
];

// The screens keep the view per player (so EN | BM keeps it); a new player id gives each test a clean start.
let seq = 0;
function setup(opts) {
  opts = opts || {};
  const server = fakeServer();
  let FR = opts.friends || friends(), REQ = opts.requests || [];
  server.answers['/api/friends/list'] = () => [200, { friends: FR, requests: REQ }];
  DDNet.init({ fetch: server.fetch, storage: memStore() });
  const doc = parse('<html><body><div class="sc"><div class="sc-tabs"><button data-tab="friends">F<i class="fx-dot" hidden></i></button></div><div id="h"></div><div class="acc-toast"></div></div></body></html>');
  const host = doc.getElementById('h');
  const ctx = { lang: 'en', words: W, player: { id: 'me' + (++seq), email: 'me@example.com', firstName: 'Ahmad', lastName: 'F' }, api: DDNet.api, setPlayer() {}, go(h) { ctx.went = h; } };
  const dots = [];
  // a different player id makes the scorecard forget the last view (filter, open card, search); drawn into a throwaway page
  SC.renderScorecard(parse('<main id="x"></main>').getElementById('x'), Object.assign({}, ctx, { api: async () => ({ ok: false, status: 500, body: null }) }));
  return { server, host, ctx, dots, setFriends: (f) => { FR = f; }, setRequests: (r) => { REQ = r; },
    open: async () => { SC.renderFriends(host, ctx, { onData: (n) => dots.push(n) }); await tick(); } };
}
const tap = (host, sel) => { const el = typeof sel === 'string' ? host.querySelector(sel) : sel; assert.ok(el, String(sel)); click(el); };

test('the list shows every friend with a badge, escapes names, and search finds by real name', async () => {
  const s = await setup(); await s.open();
  const rows = s.host.querySelectorAll('.fx-row');
  assert.equal(rows.length, 3);
  assert.equal(txt(rows[0].querySelector('b')), 'Danny');
  assert.ok(txt(s.host).includes('<b>Soo</b>') && !s.host.querySelector('.fx-row b b'), 'a name with markup is text');
  assert.ok(!/NaN|undefined|null/.test(txt(s.host)));
  const q = s.host.querySelector('.fx-search'); typeInto(q, 'rizal');
  assert.equal(s.host.querySelectorAll('.fx-row').length, 1);
  typeInto(q, 'zzz');
  assert.equal(s.host.querySelectorAll('.fx-row').length, 0);
});

test('accepting a request moves it out of the strip and into the list as Linked', async () => {
  const s = setup({ requests: [{ id: 'r1', firstName: 'Kevin', lastName: 'Lim', requestedAt: new Date().toISOString() }] });
  await s.open();
  assert.equal(txt(s.host.querySelector('.fx-req .t')), '1 FRIEND REQUEST');
  assert.equal(s.dots[0], 1, 'the tab dot is told one request');
  const kevin = { id: 'f9', badge: 'linked', nickname: '', firstName: 'Kevin', lastName: 'Lim', games: 0, headToHead: { won: 0, lost: 0 }, lastPlayed: null, recent: [], compare: null };
  s.server.answers['/api/friends/accept'] = [200, { friend: kevin }];
  s.setFriends([kevin].concat(friends())); s.setRequests([]);
  tap(s.host, '[data-accept]'); await tick();
  assert.ok(!s.host.querySelector('.fx-req'), 'the requests strip is gone');
  const first = txt(s.host.querySelector('.fx-row'));
  assert.ok(first.includes('Kevin Lim') && first.includes('LINKED'), first);
  assert.equal(s.dots[s.dots.length - 1], 0, 'the tab dot is told zero');
  assert.ok(JSON.stringify(s.server.to('/api/friends/accept')[0][2]).includes('r1'), 'the request id was sent');
});

test('the friend card: nickname, real name and badge, head-to-head, 3DA and MPR bars, last 5', async () => {
  const s = setup(); await s.open();
  tap(s.host, '[data-fid="f1"]');
  assert.equal(txt(s.host.querySelector('.fx-card h2')), 'Danny');
  assert.ok(txt(s.host.querySelector('.fx-real')).includes('Daniel Tan') && txt(s.host.querySelector('.fx-real')).includes('LINKED'));
  assert.equal(txt(s.host.querySelector('.fx-h2h')).replace(/\s/g, ''), '8YOU–6Danny');
  const bars = s.host.querySelectorAll('.fx-cmp .fx-cr');
  assert.equal(bars.length, 2);
  assert.ok(txt(bars[0]).includes('61.2') && txt(bars[0]).includes('58.4'), '3DA, both sides');
  assert.ok(txt(bars[1]).includes('2.6') && txt(bars[1]).includes('2.3'), 'MPR, both sides');
  assert.equal(s.host.querySelectorAll('.fx-last span').length, 5);
  tap(s.host, '[data-h2h]');
  assert.ok(s.host.querySelector('.fx-drw').classList.contains('open'));
  assert.equal(s.host.querySelectorAll('.fx-drw .fx-cr').length, 9, 'drawer: 5 rows for 01, 4 for Cricket');
});

test('Block sits behind the ••• menu, and asks before sending anything', async () => {
  const s = setup(); await s.open();
  tap(s.host, '[data-fid="f1"]');
  assert.ok(!txt(s.host.querySelector('.fx-acts')).includes('Block'), 'not among the main buttons');
  assert.ok(s.host.querySelector('.fx-menu').hasAttribute('hidden'), 'menu closed at first');
  assert.ok(txt(s.host.querySelector('.fx-menu')).includes('Block'), 'Block is in the menu');
  tap(s.host, '[data-more]');
  assert.ok(!s.host.querySelector('.fx-menu').hasAttribute('hidden'), '••• opens it');
  s.server.answers['/api/friends/block'] = [200, { ok: true }];
  tap(s.host, '[data-block]');
  assert.equal(txt(s.host.querySelector('.fx-dlg h3')), 'Block Danny?');
  assert.equal(s.server.to('/api/friends/block').length, 0, 'nothing sent before confirming');
  tap(s.host, '[data-d="ok"]'); await tick();
  assert.equal(s.server.to('/api/friends/block')[0][2].friendshipId, 'f1');
});

test('Play <nickname> hands the friend to the casual setup', async () => {
  const s = setup(); await s.open();
  tap(s.host, '[data-fid="f1"]'); tap(s.host, '[data-play]');
  assert.equal(s.ctx.went, '#play');
  assert.equal(s.ctx.playWith.friendshipId, 'f1');
  assert.equal(s.ctx.playWith.nickname, 'Danny');
});

test('a friend with no account: the card shows your own figures, dashes for them, and a note', async () => {
  const s = setup(); await s.open();
  tap(s.host, '[data-fid="f2"]');
  assert.ok(s.host.querySelector('[data-invite]') && s.host.querySelector('[data-edit]'), 'Invite and Edit name or email');
  const one = s.host.querySelector('.fx-cmp.one');
  assert.ok(one, 'a one-sided comparison');
  assert.ok(txt(one).includes('55.5') && txt(one).includes('2.1'), 'own 3DA and MPR');
  assert.ok(txt(one).includes('–'), 'a dash where theirs would be');
  assert.ok(txt(s.host).includes(W.frTheirsLater));
  const fills = s.host.querySelectorAll('.fx-cmp.one .fx-bars i');
  assert.equal(fills.length, 4);
  assert.ok(fills.every((i) => /width:0(\.0)?%/.test(i.getAttribute('style'))), 'their bars are empty');
  assert.ok(!/NaN|undefined|null/.test(txt(s.host)));
});

// ---- the Add a friend form ----
async function form() {
  const s = setup();
  s.server.answers['/api/friends/check'] = (b) => (b.email === 'daniel@example.com' ? [200, { account: true, firstName: 'Daniel', lastName: 'Tan' }] : [200, { account: false }]);
  s.done = 'not called';
  DDOpponent.renderAddFriend(s.host, s.ctx, (d) => { s.done = d; });
  await tick();
  const f = s.host;
  Object.assign(s, { email: f.querySelector('[data-in="email"]'), first: f.querySelector('[data-in="first"]'), last: f.querySelector('[data-in="last"]'), nick: f.querySelector('[data-in="nick"]'), btn: () => f.querySelector('.fx-btn') });
  s.checks = () => s.server.to('/api/friends/check').length;
  return s;
}

test('form: an email with an account locks the names and changes the button', async () => {
  const f = await form();
  typeInto(f.email, 'daniel@exa'); await sleep(650);
  assert.equal(f.checks(), 0, 'no check while the email is incomplete');
  typeInto(f.email, 'daniel@example.com');
  assert.equal(f.checks(), 0, 'no check before the pause');
  await sleep(650); await tick();
  assert.equal(f.checks(), 1, 'one check after the pause');
  assert.ok(f.first.value === 'Daniel' && f.last.value === 'Tan', 'names filled');
  assert.ok(f.first.hasAttribute('readonly') && f.last.hasAttribute('readonly'), 'and locked');
  assert.equal(txt(f.btn()), 'SEND FRIEND REQUEST');
});

test('form: an email with no account unlocks the names, says so, and the button adds the friend', async () => {
  const f = await form();
  typeInto(f.email, 'daniel@example.com'); await sleep(650); await tick();
  typeInto(f.email, 'mei@example.com'); await sleep(650); await tick();
  assert.ok(!f.first.hasAttribute('readonly') && !f.last.hasAttribute('readonly'));
  assert.equal(f.first.value, '', 'the account\'s names are cleared');
  assert.equal(txt(f.host.querySelector('.fx-res')), 'No DartDraw account yet. Their results won’t be saved.');
  assert.equal(txt(f.btn()), 'ADD FRIEND');
});

test('form: the nickname box stops at 12', async () => {
  const f = await form();
  assert.equal(f.nick.getAttribute('maxlength'), '12');
  typeInto(f.nick, 'Dannyboy12345678');
  assert.equal(Array.from(f.nick.value).length, 12);
  typeInto(f.nick, '😀'.repeat(14));
  assert.equal(Array.from(f.nick.value).length, 12, 'an emoji counts as one');
});

test('form: your own e-mail is refused inline, nothing is checked', async () => {
  const f = await form();
  typeInto(f.email, 'me@example.com'); await sleep(650); await tick();
  assert.equal(txt(f.host.querySelector('.fx-res')), 'That is your own email.');
  assert.equal(f.checks(), 0);
});

test('form: matching names offer "Keep your games together", and ticking it sends mergeFrom', async () => {
  const f = await form();
  f.server.answers['/api/friends/add'] = (b) => (b.mergeFrom ? [200, { friend: { id: 'n2', badge: 'none', nickname: '', firstName: 'Mei Ling', lastName: '<b>Soo</b>' } }] : [409, { code: 'already_friends' }]);
  typeInto(f.email, 'meiling2@example.com'); await sleep(650); await tick();
  assert.ok(f.host.querySelector('.fx-merge').hasAttribute('hidden'), 'not offered yet');
  typeInto(f.first, 'mei ling'); typeInto(f.last, '<b>soo</b>');
  assert.ok(!f.host.querySelector('.fx-merge').hasAttribute('hidden'), 'offered when the names match a no-account friend');
  f.host.querySelector('[data-in="merge"]').checked = true;
  submit(f.host.querySelector('form')); await tick();
  assert.equal(f.server.to('/api/friends/add')[0][2].mergeFrom, 'f2');
  assert.equal(f.done.friend.id, 'n2', 'onDone got the new friend');
});

test('form: Cancel closes it with nothing', async () => {
  const f = await form();
  tap(f.host, '[data-cancel]');
  assert.equal(f.done, null);
});

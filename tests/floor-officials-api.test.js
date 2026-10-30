const { test } = require('node:test');
const assert = require('node:assert/strict');

// Floor officials (docs/superpowers/specs/2026-10-30-floor-officials-design.md): api/_lib/officials.js and the
// /api/score/* handlers against an in-memory database (tests/lib/fake-score-db.js), with real events built by the app
// (tests/lib/app-states.js) and the organiser's sign-in replaced by a stand-in.
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-floor-officials';
const { createFakeScoreDb } = require('./lib/fake-score-db');
const { buildStates } = require('./lib/app-states');
const tournaments = {};
const db = createFakeScoreDb({ tournaments });
const dbPath = require.resolve('../api/_lib/db'), authPath = require.resolve('../api/_lib/auth');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { sql: (...a) => db.sql(...a) } };
let who = { id: 'org1', role: 'organizer' };
require.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports: {
  requireAuth: async (req, res) => { if (!who) { res.status(401).json({ code: 'not_authenticated' }); return null; } return who; } } };
const officials = require('../api/_lib/officials');
const router = require('../api/score/[action].js');
const { engine } = require('../api/_lib/engine');

const copy = (x) => JSON.parse(JSON.stringify(x));
const states = buildStates();
const stateOf = (unit, format, phase) => copy(states.find((s) => s.unit === unit && s.format === format && s.phase === phase).data);
const realNow = Date.now;
function at(ms) { Date.now = () => ms; db.setNow(ms); }
const T0 = Date.parse('2026-11-07T02:00:00.000Z');   // the morning of the event date used below (Malaysia time 10:00)

async function call(action, method, body, headers, query, ip) {
  const res = { statusCode: 0, body: undefined, headers: {} };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.end = () => res;
  await router({ method, url: '/api/score/' + action, body, headers: Object.assign({ host: 'dd.test' }, headers || {}), query: query || {}, socket: { remoteAddress: ip || '10.0.0.1' } }, res);
  return res;
}
/* An event on the server, owned by org1, at stamp S. */
function put(id, data) { data.id = id; data.eventCreation.date = '2026-11-07'; tournaments[id] = { data, updated_at: new Date(T0 - 60000).toISOString(), created_by: 'org1' }; return tournaments[id]; }
async function addOfficial(t, name, boards) {
  const r = await call('officials', 'POST', { op: 'create', t, name, boards });
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  return r.body.official;
}
const tokenOf = (o) => o.link.split('/score/')[1];
async function session(o) {
  const r = await call('open', 'POST', { token: tokenOf(o), pin: o.pin });
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  return r.body.session;
}
const H = (s) => ({ 'x-score-session': s });
/* A round robin event whose group boards are known: group i on board i+1. */
function rrEvent(id) {
  const t = stateOf('Singles', 'roundrobin', 'drawn');
  t.groups.forEach((g, i) => { g.boards = [i + 1]; g.gameStarted = true; g.scores = {}; });
  return put(id, t);
}
function majority(t){ return Math.floor((parseInt(t.format.bestOfLegs) || 5) / 2) + 1; }

test('endsAtFor: midnight after the event date, Malaysia time; with no date, the next Malaysia midnight', () => {
  assert.equal(officials.endsAtFor('2026-11-07').toISOString(), '2026-11-07T16:00:00.000Z');
  assert.equal(officials.endsAtFor('', Date.parse('2026-10-30T20:00:00Z')).toISOString(), '2026-10-31T16:00:00.000Z');   // 04:00 on the 31st in KL
  assert.equal(officials.endsAtFor('garbage', Date.parse('2026-10-30T10:00:00Z')).toISOString(), '2026-10-30T16:00:00.000Z');
});

test('the organiser adds, lists, changes, stops and renews officials; the link is this site’s /score/<token> and works out from the secret', async () => {
  at(T0); who = { id: 'org1', role: 'organizer' };
  rrEvent('ev1');
  const o = await addOfficial('ev1', '  Aina  ', [2, 1, 1]);
  assert.equal(o.name, 'Aina'); assert.deepEqual(o.boards, [1, 2]); assert.match(o.pin, /^\d{4}$/);
  assert.match(o.link, /^https:\/\/dd\.test\/score\/[A-Za-z0-9_-]{40,}$/);
  assert.equal('token' in o, false); assert.equal('tokenHash' in o, false);
  const row = db.officials.find((x) => x.id === o.id);
  assert.notEqual(row.token_hash, tokenOf(o), 'only a hash is stored');
  const list = await call('officials', 'GET', null, null, { t: 'ev1' });
  assert.equal(list.body.officials[0].link, o.link, 'the same link again (Copy link later)');
  const ch = await call('officials', 'POST', { op: 'update', id: o.id, boards: [3] });
  assert.deepEqual(ch.body.official.boards, [3]);
  const np = await call('officials', 'POST', { op: 'newPin', id: o.id });
  assert.equal(np.body.official.link, o.link, 'new PIN keeps the link');
  const nl = await call('officials', 'POST', { op: 'newLink', id: o.id });
  assert.notEqual(nl.body.official.link, o.link, 'new link');
  const st = await call('officials', 'POST', { op: 'stop', id: o.id });
  assert.equal(st.body.official.stopped, true);
  // checks
  assert.equal((await call('officials', 'POST', { op: 'create', t: 'ev1', name: '', boards: [1] })).body.code, 'official_invalid_name');
  assert.equal((await call('officials', 'POST', { op: 'create', t: 'ev1', name: 'X', boards: [] })).body.code, 'official_invalid_boards');
  who = { id: 'someone-else', role: 'organizer' };
  assert.equal((await call('officials', 'GET', null, null, { t: 'ev1' })).statusCode, 404, 'not your event');
  assert.equal((await call('officials', 'POST', { op: 'stop', id: o.id })).statusCode, 404);
  who = { id: 'adm', role: 'admin' };
  assert.equal((await call('officials', 'GET', null, null, { t: 'ev1' })).statusCode, 200, 'an Admin manages any event');
  who = null;
  assert.equal((await call('officials', 'GET', null, null, { t: 'ev1' })).statusCode, 401);
  who = { id: 'org1', role: 'organizer' };
});

test('opening a link: a wrong PIN, then 5 tries a minute per link and address (429 for the rest of the minute, never longer), unknown link 404', async () => {
  at(T0 + 1000);
  rrEvent('ev2');
  const o = await addOfficial('ev2', 'Ben', [1]);
  assert.equal((await call('open', 'POST', { token: tokenOf(o), pin: '0000' === o.pin ? '1111' : '0000' })).body.code, 'bad_pin');
  for (let i = 0; i < 4; i++) await call('open', 'POST', { token: tokenOf(o), pin: 'x' });
  const blocked = await call('open', 'POST', { token: tokenOf(o), pin: o.pin });
  assert.equal(blocked.statusCode, 429, 'even the right PIN waits');
  at(T0 + 1000 + 61000);
  const ok = await call('open', 'POST', { token: tokenOf(o), pin: o.pin });
  assert.equal(ok.statusCode, 200);
  assert.deepEqual(ok.body.official, { name: 'Ben', boards: [1] });
  assert.equal(typeof ok.body.session, 'string');
  assert.equal((await call('open', 'POST', { token: 'A'.repeat(43), pin: '1234' })).statusCode, 404);
});

test('matches: only the official’s boards, with names, the legs and what each match is', async () => {
  at(T0 + 100000);
  const t = rrEvent('ev3');
  const o = await addOfficial('ev3', 'Chan', [1]);
  const s = await session(o);
  const r = await call('matches', 'GET', null, H(s));
  assert.equal(r.statusCode, 200);
  const g1 = t.data.groups[0];
  assert.ok(r.body.slots.length > 0);
  assert.ok(r.body.slots.every((x) => x.pos.startsWith('rr:' + g1.id + ':')), 'only group A (board 1)');
  assert.ok(r.body.slots.every((x) => x.state === 'open' && x.board === 1 && x.legs === (parseInt(t.data.format.bestOfLegs) || 5)));
  assert.equal(r.body.entries[r.body.slots[0].a], t.data.entriesList.find((e) => e.id === r.body.slots[0].a).name);
  assert.equal((await call('matches', 'GET', null, {})).statusCode, 401, 'no session');
  assert.equal((await call('matches', 'GET', null, H('garbage'))).statusCode, 401);
});

test('a result: validated like the organiser’s box, stored as the organiser would (with who and when), counted; refused off the official’s boards and recorded', async () => {
  at(T0 + 200000);
  const t = rrEvent('ev4');
  const o = await addOfficial('ev4', 'Dina', [1]);
  const s = await session(o);
  const slots = (await call('matches', 'GET', null, H(s))).body.slots;
  const m = majority(t.data);
  assert.equal((await call('result', 'POST', { pos: slots[0].pos, op: 'score', la: m, lb: m }, H(s))).body.code, 'invalid', 'a draw is not a result');
  assert.equal((await call('result', 'POST', { pos: slots[0].pos, op: 'score', la: m + 1, lb: 0 }, H(s))).body.code, 'invalid');
  const ok = await call('result', 'POST', { pos: slots[0].pos, op: 'score', la: m, lb: 1 }, H(s));
  assert.equal(ok.statusCode, 200, JSON.stringify(ok.body));
  const g = tournaments.ev4.data.groups[0], key = slots[0].pos.split(':').slice(2).join(':');
  const stored = g.scores[key];
  const firstIsA = slots[0].a < slots[0].b;
  assert.equal(firstIsA ? stored.legs1 : stored.legs2, m);
  assert.equal(stored.by, o.id); assert.equal(stored.at, T0 + 200000); assert.equal(stored.rv, 1);
  assert.equal(db.officials.find((x) => x.id === o.id).results, 1);
  assert.equal(tournaments.ev4.data.settingsRev, undefined, 'an official’s result never bumps the settings counter');
  // another group's match (board 2) is not theirs
  const other = 'rr:' + tournaments.ev4.data.groups[1].id + ':' + Object.keys({}).concat([])[0];
  const eng = engine(); const t2 = eng.inside(tournaments.ev4.data);
  const g2pos = eng.resultSlots(t2).find((x) => x.kind === 'rr' && x.group.id === tournaments.ev4.data.groups[1].id).pos;
  void other;
  const off = await call('result', 'POST', { pos: g2pos, op: 'score', la: m, lb: 0 }, H(s));
  assert.equal(off.statusCode, 403); assert.equal(off.body.code, 'not_your_board');
  assert.equal(db.officials.find((x) => x.id === o.id).refused.slice(-1)[0].reason, 'not_your_board', 'listed for the organiser');
});

test('corrections: their own result within 5 minutes; after that, or once the organiser changed it, or another official’s result: refused', async () => {
  at(T0 + 300000);
  const t = rrEvent('ev5');
  const a = await addOfficial('ev5', 'Eli', [1]), b = await addOfficial('ev5', 'Fai', [1]);
  const sa = await session(a), sb = await session(b);
  const slots = (await call('matches', 'GET', null, H(sa))).body.slots;
  const m = majority(t.data);
  await call('result', 'POST', { pos: slots[0].pos, op: 'score', la: m, lb: 0 }, H(sa));
  at(T0 + 300000 + 4 * 60000);
  const fix = await call('result', 'POST', { pos: slots[0].pos, op: 'score', la: m, lb: 1, rv: 1 }, H(sa));
  assert.equal(fix.statusCode, 200, 'within 5 minutes');
  assert.equal(fix.body.slot.rv, 2);
  assert.equal((await call('result', 'POST', { pos: slots[0].pos, op: 'score', la: 0, lb: m, rv: 2 }, H(sb))).body.code, 'taken', 'not someone else’s');
  at(T0 + 300000 + 4 * 60000 + 5 * 60000);
  assert.equal((await call('result', 'POST', { pos: slots[0].pos, op: 'score', la: 1, lb: m, rv: 2 }, H(sa))).body.code, 'too_late');
  // the organiser changes another of their results: it is the organiser's now
  at(T0 + 400000);
  await call('result', 'POST', { pos: slots[1].pos, op: 'score', la: m, lb: 0 }, H(sa));
  const key = slots[1].pos.split(':').slice(2).join(':');
  Object.assign(tournaments.ev5.data.groups[0].scores[key], { by: 'o', rv: 9 });
  tournaments.ev5.updated_at = new Date(db.now() + 5).toISOString();
  assert.equal((await call('result', 'POST', { pos: slots[1].pos, op: 'score', la: m, lb: 1, rv: 1 }, H(sa))).body.code, 'changed_by_organiser');
});

test('two officials post the same open match at once: exactly one result is stored, the other is told it was taken', async () => {
  at(T0 + 500000);
  const t = rrEvent('ev6');
  const a = await addOfficial('ev6', 'Gee', [1]), b = await addOfficial('ev6', 'Hui', [1]);
  const sa = await session(a), sb = await session(b);
  const pos = (await call('matches', 'GET', null, H(sa))).body.slots[0].pos;
  const m = majority(t.data);
  const [ra, rb] = await Promise.all([
    call('result', 'POST', { pos, op: 'score', la: m, lb: 0 }, H(sa)),
    call('result', 'POST', { pos, op: 'score', la: 0, lb: m }, H(sb)),
  ]);
  const codes = [ra.body.ok ? 'ok' : ra.body.code, rb.body.ok ? 'ok' : rb.body.code].sort();
  assert.deepEqual(codes, ['ok', 'taken']);
  const key = pos.split(':').slice(2).join(':');
  const winner = ra.body.ok ? a.id : b.id;
  assert.equal(tournaments.ev6.data.groups[0].scores[key].by, winner);
});

test('a stopped link, a new link, the end time and a finalized event all refuse, with the reason, and keep the result for the organiser', async () => {
  at(T0 + 600000);
  const t = rrEvent('ev7');
  const m = majority(t.data);
  const o = await addOfficial('ev7', 'Ida', [1]);
  let s = await session(o);
  const pos = (await call('matches', 'GET', null, H(s))).body.slots[0].pos;
  await call('officials', 'POST', { op: 'stop', id: o.id });
  let r = await call('result', 'POST', { pos, op: 'score', la: m, lb: 0 }, H(s));
  assert.equal(r.statusCode, 410); assert.equal(r.body.code, 'link_stopped');
  assert.equal(db.officials.find((x) => x.id === o.id).refused.slice(-1)[0].reason, 'stopped');
  // a new link starts them again, and ends the old session
  const nl = (await call('officials', 'POST', { op: 'newLink', id: o.id })).body.official;
  assert.equal((await call('matches', 'GET', null, H(s))).body.code, 'link_replaced');
  s = await session(nl);
  assert.equal((await call('matches', 'GET', null, H(s))).statusCode, 200);
  // the end time
  at(Date.parse('2026-11-07T16:00:01.000Z'));
  r = await call('result', 'POST', { pos, op: 'score', la: m, lb: 0 }, H(s));
  assert.equal(r.body.code, 'link_ended');
  // finalized
  at(T0 + 700000);
  const o2 = await addOfficial('ev7', 'Jo', [1]);
  const s2 = await session(o2);
  tournaments.ev7.data.finalized = { at: 'x' };
  r = await call('result', 'POST', { pos, op: 'score', la: m, lb: 0 }, H(s2));
  assert.equal(r.body.code, 'event_finalized');
  assert.equal(Object.keys(tournaments.ev7.data.groups[0].scores || {}).length, 0, 'nothing was written');
});

test('knockout: a match reaches the official once it has a board; a result moves the winner on; a call; "Neither showed"; a correction that would clear a later result is refused', async () => {
  at(T0 + 800000);
  const t = stateOf('Singles', 'knockout', 'drawn');
  const r0 = t.knockout.rounds[0];
  const open = r0.map((m, i) => ({ m, i })).filter((x) => x.m.aEntryId && x.m.bEntryId && !x.m.bye);
  open[0].m.board = 5; open[1].m.board = 5;
  put('ev8', t);
  const o = await addOfficial('ev8', 'Kai', [5]);
  const s = await session(o);
  const slots = (await call('matches', 'GET', null, H(s))).body.slots;
  assert.deepEqual(slots.map((x) => x.pos), ['ko:knockout:0:' + open[0].i, 'ko:knockout:0:' + open[1].i]);
  assert.equal(slots[0].round.code === 'of' || ['quarter', 'semi', 'final'].indexOf(slots[0].round.code) >= 0, true);
  const legs = slots[0].legs, m = Math.floor(legs / 2) + 1;
  assert.equal((await call('result', 'POST', { pos: slots[1].pos, op: 'call' }, H(s))).statusCode, 200);
  assert.equal(tournaments.ev8.data.knockout.rounds[0][open[1].i].called, true);
  const ok = await call('result', 'POST', { pos: slots[0].pos, op: 'score', la: m, lb: 0 }, H(s));
  assert.equal(ok.statusCode, 200);
  const k = tournaments.ev8.data.knockout;
  assert.equal(k.rounds[0][open[0].i].winnerId, open[0].m.aEntryId);
  const next = k.rounds[1][Math.floor(open[0].i / 2)];
  assert.ok(next.aEntryId === open[0].m.aEntryId || next.bEntryId === open[0].m.aEntryId, 'moved on');
  // "Neither showed" on the second match
  assert.equal((await call('result', 'POST', { pos: slots[1].pos, op: 'void' }, H(s))).statusCode, 200);
  assert.equal(k === tournaments.ev8.data.knockout, false);
  assert.equal(tournaments.ev8.data.knockout.rounds[0][open[1].i].void, true);
  // the organiser scores the next round; the official may no longer change who went through
  const t9 = tournaments.ev8.data, nx = t9.knockout.rounds[1][Math.floor(open[0].i / 2)];
  if (nx.aEntryId && nx.bEntryId) {
    Object.assign(nx, { aLegs: m, bLegs: 0, winnerId: nx.aEntryId, by: 'o', rv: 1 });
    tournaments.ev8.updated_at = new Date(db.now() + 5).toISOString();
    const fix = await call('result', 'POST', { pos: slots[0].pos, op: 'score', la: 0, lb: m, rv: ok.body.slot.rv }, H(s));
    assert.equal(fix.body.code, 'later_played');
  }
});

test('Teams: the total legs are checked as the organiser’s Teams box checks them, and stored the same way', async () => {
  at(T0 + 900000);
  const t = stateOf('Teams', 'roundrobin', 'drawn');
  t.groups.forEach((g, i) => { g.boards = [i + 1]; g.gameStarted = true; g.scores = {}; });
  put('ev9', t);
  const o = await addOfficial('ev9', 'Lee', [1]);
  const s = await session(o);
  const sl = (await call('matches', 'GET', null, H(s))).body.slots[0];
  assert.ok(sl.teamCap > 0);
  assert.equal((await call('result', 'POST', { pos: sl.pos, op: 'score', la: sl.teamCap + 1, lb: 0 }, H(s))).body.code, 'invalid', 'over the cap');
  assert.equal((await call('result', 'POST', { pos: sl.pos, op: 'score', la: 0, lb: 0 }, H(s))).body.code, 'invalid', 'both 0');
  const ok = await call('result', 'POST', { pos: sl.pos, op: 'score', la: 5, lb: 3 }, H(s));
  assert.equal(ok.statusCode, 200, JSON.stringify(ok.body));
  const key = sl.pos.split(':').slice(2).join(':');
  const st = tournaments.ev9.data.groups[0].scores[key];
  assert.deepEqual([st.legs1, st.legs2].sort(), [3, 5]);
});

test('a round robin no-show from an official: walkovers in that player’s unplayed matches, the player marked', async () => {
  at(T0 + 950000);
  const t = rrEvent('ev10');
  const o = await addOfficial('ev10', 'Mo', [1]);
  const s = await session(o);
  const sl = (await call('matches', 'GET', null, H(s))).body.slots[0];
  const r = await call('result', 'POST', { pos: sl.pos, op: 'noShow', side: 'a' }, H(s));
  assert.equal(r.statusCode, 200);
  const d = tournaments.ev10.data;
  assert.equal(d.entriesList.find((e) => e.id === sl.a).noShow, true);
  const wo = Object.values(d.groups[0].scores).filter((x) => x.wo);
  assert.equal(wo.length, d.groups[0].entryIds.length - 1, 'one walkover per opponent');
  void t;
});

test.after(() => { Date.now = realNow; });

test('deploy: the two functions that run the app’s rules on the server ship every file app.html loads (vercel.json includeFiles)', () => {
  const fs = require('fs'), path = require('path');
  const ROOT = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(ROOT, 'app.html'), 'utf8');
  const body = html.slice(html.indexOf('<body'));
  const files = [...body.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]).filter((f) => fs.existsSync(path.join(ROOT, f)));
  const vj = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  for (const fn of ['api/score/[action].js', 'api/tournaments/[id].js']) {
    const inc = vj.functions[fn].includeFiles.replace(/^\{|\}$/g, '').split(',');
    assert.ok(inc.includes('app.html'), fn + ': app.html');
    files.forEach((f) => assert.ok(inc.includes(f), fn + ': ' + f));
  }
});


/* ---------------- final review fixes ---------------- */
test('review 3: a result sent again after its answer was lost (it did get through) is answered as saved, not as changed by the organiser', async () => {
  at(T0 + 2000000);
  const t = rrEvent('rv3');
  const o = await addOfficial('rv3', 'Nur', [1]);
  const s = await session(o);
  const sl = (await call('matches', 'GET', null, H(s))).body.slots[0];
  const m = majority(t.data);
  const first = await call('result', 'POST', { pos: sl.pos, op: 'score', la: m, lb: 1, rv: 0 }, H(s));
  assert.equal(first.statusCode, 200);
  const again = await call('result', 'POST', { pos: sl.pos, op: 'score', la: m, lb: 1, rv: 0 }, H(s));
  assert.equal(again.statusCode, 200, JSON.stringify(again.body));
  assert.equal(again.body.ok, true);
  at(T0 + 2000000 + 6 * 60000);
  const late = await call('result', 'POST', { pos: sl.pos, op: 'score', la: m, lb: 1, rv: 0 }, H(s));
  assert.equal(late.statusCode, 200, 'the same result again, even after 5 minutes, is not a correction');
});

test('review 4: wrong PINs for one link are also counted whatever the address: 20 in 10 minutes block it for a while', async () => {
  at(T0 + 3000000);
  rrEvent('rv4');
  const o = await addOfficial('rv4', 'Ola', [1]);
  const wrong = o.pin === '0000' ? '1111' : '0000';
  for (let i = 0; i < 20; i++) {
    const r = await call('open', 'POST', { token: tokenOf(o), pin: wrong }, null, null, '10.9.' + Math.floor(i / 4) + '.' + i);
    assert.notEqual(r.statusCode, 200);
  }
  const blocked = await call('open', 'POST', { token: tokenOf(o), pin: o.pin }, null, null, '10.99.0.1');
  assert.equal(blocked.statusCode, 429, 'a fresh address is still slowed down');
  at(T0 + 3000000 + 11 * 60000);
  assert.equal((await call('open', 'POST', { token: tokenOf(o), pin: o.pin }, null, null, '10.99.0.1')).statusCode, 200);
});

test('review 5: New PIN signs out phones that opened the link with the old PIN (they are asked for the PIN again)', async () => {
  at(T0 + 4000000);
  rrEvent('rv5');
  const o = await addOfficial('rv5', 'Pak', [1]);
  const s = await session(o);
  assert.equal((await call('matches', 'GET', null, H(s))).statusCode, 200);
  const np = (await call('officials', 'POST', { op: 'newPin', id: o.id })).body.official;
  assert.equal((await call('matches', 'GET', null, H(s))).statusCode, 401, 'old PIN session ends');
  const s2 = await session(np);
  assert.equal((await call('matches', 'GET', null, H(s2))).statusCode, 200);
});

test('review 6: a refused request is kept for the organiser in a small, clean form', async () => {
  at(T0 + 5000000);
  rrEvent('rv6');
  const o = await addOfficial('rv6', 'Qi', [1]);
  const s = await session(o);
  await call('officials', 'POST', { op: 'stop', id: o.id });
  await call('result', 'POST', { pos: 'rr:' + 'x'.repeat(5000), op: 'score', la: 'y'.repeat(5000), lb: { a: 1 }, side: 'zzz' }, H(s));
  const r = db.officials.find((x) => x.id === o.id).refused.slice(-1)[0];
  assert.ok(r.pos.length <= 80, 'pos capped');
  assert.equal(r.la, null); assert.equal(r.lb, null); assert.equal(r.side, 'a');
  assert.ok(JSON.stringify(r).length < 400);
});

test('review 13: once the knockout has been drawn from the round robin, an official’s correction of a group result is refused', async () => {
  at(T0 + 6000000);
  const t = stateOf('Singles', 'rrknockout', 'done');
  assert.ok(t.knockout && t.knockout.rounds, 'the knockout is drawn');
  t.groups.forEach((g, i) => { g.boards = [i + 1]; });
  const ev = put('rv13', t);
  const o = await addOfficial('rv13', 'Rin', [1]);
  const s = await session(o);
  const g = ev.data.groups[0], key = Object.keys(g.scores)[0];
  Object.assign(g.scores[key], { by: o.id, at: T0 + 6000000 - 1000, rv: 1 });   // theirs, a moment ago
  const pos = 'rr:' + g.id + ':' + key;
  const sc = g.scores[key];
  const r = await call('result', 'POST', { pos, op: 'score', la: sc.legs2, lb: sc.legs1, rv: 1 }, H(s));
  assert.equal(r.body.code, 'later_played');
});

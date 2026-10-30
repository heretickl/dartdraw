const { test } = require('node:test');
const assert = require('node:assert/strict');

// Floor officials: the organiser's whole-event save (PUT /api/tournaments/:id) put together, match by match, with
// results floor officials stored meanwhile (results-engine.js mergeResults; api/tournaments/[id].js). Real events
// from tests/lib/app-states.js; the officials' writes are made with the same engine the server uses.
const { buildStates } = require('./lib/app-states');
const dbPath = require.resolve('../api/_lib/db'), authPath = require.resolve('../api/_lib/auth');
let store = {}, stamp = 0, beforeUpdate = null;   // beforeUpdate: another write landing between the PUT's read and its write
const nextIso = () => new Date(Date.parse('2026-11-07T02:00:00.000Z') + (++stamp) * 1000).toISOString();
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { sql: async (strings, ...vals) => {
  const text = strings.join('?').replace(/\s+/g, ' ').trim();
  if (text.startsWith('SELECT id, data, updated_at, created_by FROM tournaments WHERE id = ?')) { const r = store[vals[0]]; return r ? [JSON.parse(JSON.stringify(r))] : []; }
  if (text.startsWith('UPDATE tournaments SET data = ?::jsonb, updated_at = now() WHERE id = ? AND created_by = ?')) {
    if (beforeUpdate) { const h = beforeUpdate; beforeUpdate = null; h(); }
    const [data, id, owner, readIso] = vals; const r = store[id];
    if (!r || r.created_by !== owner || Math.abs(Date.parse(r.updated_at) - Date.parse(readIso)) >= 1) return [];
    r.data = JSON.parse(data); r.updated_at = nextIso(); return [{ id, updated_at: r.updated_at }];
  }
  if (text.startsWith('INSERT INTO tournaments')) { store[vals[0]] = { id: vals[0], data: JSON.parse(vals[1]), updated_at: nextIso(), created_by: vals[2] }; return [{ id: vals[0], updated_at: store[vals[0]].updated_at }]; }
  throw new Error('merge test db: unrecognised SQL: ' + text);
} } };
require.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports: { requireAuth: async () => ({ id: 'org1', tier: 'pro' }) } };
const handler = require('../api/tournaments/[id]');
const { engine } = require('../api/_lib/engine');
const e = engine();

const copy = (x) => JSON.parse(JSON.stringify(x));
const states = buildStates();
const stateOf = (unit, format, phase) => copy(states.find((s) => s.unit === unit && s.format === format && s.phase === phase).data);
async function put(id, body) {
  const res = { statusCode: 0, body: undefined };
  res.status = (c) => { res.statusCode = c; return res; }; res.json = (b) => { res.body = b; return res; }; res.end = () => res;
  await handler({ method: 'PUT', query: { id }, body: copy(body), headers: {} }, res);
  return res;
}
function seed(id, data) { data.id = id; store = {}; store[id] = { id, data: copy(data), updated_at: nextIso(), created_by: 'org1' }; return store[id]; }
/* A floor official's result written straight into the stored copy, as /api/score/result does. */
function officialWrites(id, pos, op, args) {
  const t = e.inside(store[id].data);
  const out = e.applyResult(t, pos, op, args, { by: 'off_1', at: 111 });
  assert.equal(out.ok, true, JSON.stringify(out));
  e.rebuildDerived(t);
  store[id].data = e.plain(t); store[id].updated_at = nextIso();
}
const slotsOf = (d) => e.resultSlots(e.inside(d));
const resultAt = (d, pos) => { const s = slotsOf(d).find((x) => x.pos === pos); return s ? e.plain(s.get()) : undefined; };
function rr() { const t = stateOf('Singles', 'roundrobin', 'drawn'); t.groups.forEach((g, i) => { g.boards = [i + 1]; g.gameStarted = true; g.scores = {}; }); return t; }
const maj = (t) => Math.floor((parseInt(t.format.bestOfLegs) || 5) / 2) + 1;

test('a stale save that changed no result keeps the official’s result stored meanwhile, and the answer carries the merged copy', async () => {
  const base = rr(); const row = seed('m1', base);
  const organiserCopy = copy(row.data), seen = row.updated_at;
  const pos = slotsOf(base).filter((s) => s.kind === 'rr')[0].pos;
  officialWrites('m1', pos, 'score', { la: maj(base), lb: 0 });
  organiserCopy.eventCreation.tournamentName = 'Renamed meanwhile';   // a settings change made in the organiser's window
  const res = await put('m1', { data: organiserCopy, expectedUpdatedAt: seen, dirty: [] });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(resultAt(store.m1.data, pos).by, 'off_1', 'the official’s result stands');
  assert.equal(store.m1.data.eventCreation.tournamentName, 'Renamed meanwhile', 'and the organiser’s change too');
  assert.equal(store.m1.data.settingsRev, 1, 'a settings change bumps the counter');
  assert.equal(res.body.settingsRev, 1);
  assert.equal(resultAt(res.body.data, pos).by, 'off_1', 'the app gets the merged copy');
});

test('the organiser’s changed result wins over the official’s for the same match; other matches keep the official’s', async () => {
  const base = rr(); const row = seed('m2', base);
  const organiserCopy = copy(row.data), seen = row.updated_at, m = maj(base);
  const rrSlots = slotsOf(base).filter((s) => s.kind === 'rr');
  const same = rrSlots[0], other = rrSlots[1];
  officialWrites('m2', same.pos, 'score', { la: m, lb: 0 });
  officialWrites('m2', other.pos, 'score', { la: 0, lb: m });
  // the organiser, in their stale copy, scores `same` the other way
  const g = organiserCopy.groups.find((x) => x.id === same.group.id);
  g.scores[same.key] = { legs1: 0, legs2: m };
  const res = await put('m2', { data: organiserCopy, expectedUpdatedAt: seen, dirty: [same.pos] });
  assert.equal(res.statusCode, 200);
  const won = resultAt(store.m2.data, same.pos);
  assert.equal(won.by, 'o'); assert.equal(won.legs1, 0); assert.equal(won.legs2, m);
  assert.ok(won.rv >= 2, 'a newer version than the official’s');
  assert.equal(resultAt(store.m2.data, other.pos).by, 'off_1');
});

test('knockout: an official’s result moved a winner on; the organiser’s stale copy (old next-round slots) does not undo it, nor the next-round result', async () => {
  const t = stateOf('Singles', 'knockout', 'drawn');
  const row = seed('m3', t);
  const organiserCopy = copy(row.data), seen = row.updated_at;
  const ko = slotsOf(t).filter((s) => s.kind === 'ko' && s.ri === 0 && s.open);
  /* a first-round match whose partner match is a bye: its winner meets the bye's winner in round 2 */
  const a = ko.find((s) => { const p = t.knockout.rounds[0][s.mi ^ 1]; return p && p.bye && p.winnerId; });
  assert.ok(a, 'a played first-round match next to a bye');
  const legs = e.legsFor(e.inside(t), a), m = Math.floor(legs / 2) + 1;
  officialWrites('m3', a.pos, 'score', { la: m, lb: 0 });
  const nextPos = 'ko:knockout:1:' + Math.floor(a.mi / 2);
  const legs2 = e.legsFor(e.inside(store.m3.data), slotsOf(store.m3.data).find((s) => s.pos === nextPos)), m2 = Math.floor(legs2 / 2) + 1;
  officialWrites('m3', nextPos, 'score', { la: m2, lb: 1 });
  // the organiser saves their stale copy with an unrelated settings change
  organiserCopy.format.footerText = 'footer';
  const res = await put('m3', { data: organiserCopy, expectedUpdatedAt: seen, dirty: [] });
  assert.equal(res.statusCode, 200);
  const k = store.m3.data.knockout;
  assert.equal(k.rounds[0][a.mi].winnerId, a.m.aEntryId);
  const nx = k.rounds[1][Math.floor(a.mi / 2)];
  assert.ok(nx.aEntryId && nx.bEntryId, 'both winners in the next round');
  assert.equal(nx.aLegs, m2, 'the next-round result survives');
  assert.equal(nx.by, 'off_1');
  assert.equal(store.m3.data.format.footerText, 'footer');
});

test('a stale save from a window whose settings are older, or from an older app (no dirty list), is still a 409', async () => {
  const base = rr(); const row = seed('m4', base);
  const stale = copy(row.data), seen = row.updated_at;
  // someone else changed a setting since (settingsRev moved on)
  const other = copy(row.data); other.format.footerText = 'other';
  const r1 = await put('m4', { data: other, expectedUpdatedAt: seen, dirty: [] });
  assert.equal(r1.statusCode, 200); assert.equal(store.m4.data.settingsRev, 1);
  const r2 = await put('m4', { data: stale, expectedUpdatedAt: seen, dirty: [] });
  assert.equal(r2.statusCode, 409, 'settings changed elsewhere');
  const r3 = await put('m4', { data: Object.assign(copy(store.m4.data), { a: 1 }), expectedUpdatedAt: seen });
  assert.equal(r3.statusCode, 409, 'no dirty list: an older app keeps the old rule');
});

test('a save that changes only results keeps settingsRev; one that changes a setting bumps it; results are stamped as the organiser’s', async () => {
  const base = rr(); const row = seed('m5', base);
  const c = copy(row.data); const s = slotsOf(base).find((x) => x.kind === 'rr');
  c.groups.find((g) => g.id === s.group.id).scores[s.key] = { legs1: maj(base), legs2: 0 };
  let r = await put('m5', { data: c, expectedUpdatedAt: row.updated_at, dirty: [s.pos] });
  assert.equal(r.statusCode, 200);
  assert.equal(store.m5.data.settingsRev || 0, 0, 'results only');
  assert.equal(resultAt(store.m5.data, s.pos).by, 'o');
  const c2 = copy(store.m5.data); c2.format.footerText = 'x';
  r = await put('m5', { data: c2, expectedUpdatedAt: store.m5.updated_at, dirty: [] });
  assert.equal(store.m5.data.settingsRev, 1);
});

test('no-show flags from an official and from the organiser are both kept', async () => {
  const base = rr(); const row = seed('m6', base);
  const organiserCopy = copy(row.data), seen = row.updated_at;
  const s0 = slotsOf(base).find((x) => x.kind === 'rr');
  officialWrites('m6', s0.pos, 'noShow', { side: 'a' });
  const other = organiserCopy.entriesList.find((x) => x.id !== s0.a && !x.withdrawn);
  other.noShow = true;
  const r = await put('m6', { data: organiserCopy, expectedUpdatedAt: seen, dirty: [] });
  assert.equal(r.statusCode, 200);
  assert.equal(store.m6.data.entriesList.find((x) => x.id === s0.a).noShow, true);
  assert.equal(store.m6.data.entriesList.find((x) => x.id === other.id).noShow, true);
});

test('settingsView ignores results and what follows from them, and sees a change to a setting', () => {
  const t = stateOf('Singles', 'knockout', 'live');
  const done = copy(t);
  const s = slotsOf(done).find((x) => x.open);
  const legs = e.legsFor(e.inside(done), s), m = Math.floor(legs / 2) + 1;
  const tt = e.inside(done); e.applyResult(tt, s.pos, 'score', { la: m, lb: 0 }, { by: 'x', at: 1 });
  assert.equal(e.settingsView(tt), e.settingsView(e.inside(t)));
  const ch = copy(t); ch.format.bestOfLegs = 7;
  assert.notEqual(e.settingsView(e.inside(ch)), e.settingsView(e.inside(t)));
});

test('the organiser app: a save lists the result slots changed since its base copy, and a merged answer is taken in without losing a change made since', () => {
  const { loadApp, run } = require('./lib/load-app');
  const app = loadApp();
  const base = rr(); base.id = 't_app';
  app.__b = JSON.stringify(base);
  run(app, 'state = JSON.parse(__b); tournamentsCache[state.id] = state; setOfflineBase(state.id, state); render = function(){}');
  const rrs = slotsOf(base).filter((s) => s.kind === 'rr');
  const m = maj(base);
  run(app, `state.groups[0].scores[${JSON.stringify(rrs[0].key)}] = { legs1: ${m}, legs2: 0 }`);
  const g0 = base.groups[0].id;
  const dirty = JSON.parse(JSON.stringify(run(app, 'dirtySlots(state.id, state)')));
  assert.deepEqual(dirty, ['rr:' + g0 + ':' + rrs[0].key]);
  const sent = run(app, 'JSON.stringify({ data: state })');
  // the server merged in an official's result for another match; meanwhile this window scored a third match
  const server = JSON.parse(sent).data;
  server.groups[0].scores[rrs[1].key] = { legs1: 0, legs2: m, by: 'off_1', rv: 1, at: 5 };
  server.settingsRev = 3;
  run(app, `state.groups[0].scores[${JSON.stringify(rrs[2].key)}] = { legs1: ${m}, legs2: 1 }`);
  app.__sent = sent; app.__saved = JSON.stringify({ updated_at: 'S2', settingsRev: 3, data: server });
  run(app, 'adoptSaved(state.id, __sent, JSON.parse(__saved))');
  const sc = JSON.parse(run(app, 'JSON.stringify(state.groups[0].scores)'));
  assert.equal(sc[rrs[1].key].by, 'off_1', 'the official’s result is in this window now');
  assert.equal(sc[rrs[2].key].legs2, 1, 'the change made after the save went out is kept');
  assert.equal(sc[rrs[0].key].legs1, m);
  assert.equal(run(app, 'state.settingsRev'), 3);
  assert.deepEqual(JSON.parse(JSON.stringify(run(app, 'dirtySlots(state.id, state)'))), ['rr:' + g0 + ':' + rrs[2].key], 'only the newer change is still to send');
});


/* ---------------- final review fixes ---------------- */
test('review 1: a later-round result an official entered after both its feeders were played survives a stale organiser save (the match had no players in that copy)', async () => {
  const t = stateOf('Singles', 'knockout', 'live');
  const row = seed('r1', t);
  const organiserCopy = copy(row.data), seen = row.updated_at;
  const k = t.knockout, r1 = k.rounds[1];
  const mi = r1.findIndex((x, i) => i % 2 === 0 && x.aEntryId && x.bEntryId && !x.winnerId && r1[i + 1] && r1[i + 1].aEntryId && r1[i + 1].bEntryId && !r1[i + 1].winnerId);
  assert.ok(mi >= 0, 'two open round-2 matches feeding one round-3 match');
  const legsOf = (pos) => e.legsFor(e.inside(store.r1.data), slotsOf(store.r1.data).find((s) => s.pos === pos));
  const win = (pos) => { const l = legsOf(pos), w = Math.floor(l / 2) + 1; officialWrites('r1', pos, 'score', { la: w, lb: 0 }); };
  win('ko:knockout:1:' + mi); win('ko:knockout:1:' + (mi + 1));
  const third = 'ko:knockout:2:' + (mi / 2);
  win(third);
  assert.equal(store.r1.data.knockout.rounds[2][mi / 2].by, 'off_1');
  organiserCopy.format.footerText = 'f';
  const res = await put('r1', { data: organiserCopy, expectedUpdatedAt: seen, dirty: [] });
  assert.equal(res.statusCode, 200);
  const m3 = store.r1.data.knockout.rounds[2][mi / 2];
  assert.ok(m3.winnerId, 'the round-3 result is still there');
  assert.equal(m3.by, 'off_1');
  assert.ok(res.body.data.knockout.rounds[2][mi / 2].winnerId, 'and in the copy the app gets');
});

test('review 2: an official’s write landing between the save’s read and its write is merged again, not answered "Updated elsewhere"', async () => {
  const base = rr(); const row = seed('r2', base);
  const organiserCopy = copy(row.data), seen = row.updated_at, mj = maj(base);
  const rrs = slotsOf(base).filter((s) => s.kind === 'rr');
  organiserCopy.groups.find((g) => g.id === rrs[0].group.id).scores[rrs[0].key] = { legs1: mj, legs2: 0 };
  beforeUpdate = () => officialWrites('r2', rrs[1].pos, 'score', { la: 0, lb: mj });
  const res = await put('r2', { data: organiserCopy, expectedUpdatedAt: seen, dirty: [rrs[0].pos] });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body).slice(0, 200));
  assert.equal(resultAt(store.r2.data, rrs[0].pos).by, 'o');
  assert.equal(resultAt(store.r2.data, rrs[1].pos).by, 'off_1');
});

test('review 9: a stored first-round result is not put onto a match that now has other players (a draw changed in the stale copy)', async () => {
  const t = stateOf('Singles', 'knockout', 'drawn');
  const row = seed('r9', t);
  const organiserCopy = copy(row.data), seen = row.updated_at;
  const a = slotsOf(t).find((s) => s.kind === 'ko' && s.ri === 0 && s.open);
  officialWrites('r9', a.pos, 'score', { la: Math.floor(e.legsFor(e.inside(t), a) / 2) + 1, lb: 0 });
  const om = organiserCopy.knockout.rounds[0][a.mi];
  const other = organiserCopy.entriesList.find((x) => x.id !== om.aEntryId && x.id !== om.bEntryId && !x.withdrawn);
  om.aEntryId = other.id;   // the organiser put someone else in, on a copy that did not show the result yet
  const res = await put('r9', { data: organiserCopy, expectedUpdatedAt: seen, dirty: [] });
  assert.equal(res.statusCode, 200);
  const m0 = store.r9.data.knockout.rounds[0][a.mi];
  assert.equal(m0.aEntryId, other.id);
  assert.equal(m0.winnerId == null || m0.winnerId === undefined, true, 'no result carried onto other players');
});

test('review 7 and 8: the app sends no dirty list without a base copy (so a stale save is refused, not merged over everything), and a failed merge keeps the old base', () => {
  const { loadApp, run } = require('./lib/load-app');
  const app = loadApp();
  const base = rr(); base.id = 't_app2';
  app.__b = JSON.stringify(base);
  run(app, 'state = JSON.parse(__b); tournamentsCache[state.id] = state; render = function(){}');
  assert.equal(run(app, 'dirtySlots(state.id, state)'), null, 'no base: no list');
  run(app, 'setOfflineBase(state.id, state)');
  const before = run(app, 'JSON.stringify(offlineBase[state.id])');
  run(app, 'var __mr = mergeResults; mergeResults = function(){ throw new Error("boom"); }');
  try {
    app.__saved = JSON.stringify({ updated_at: 'S9', settingsRev: 1, data: Object.assign(JSON.parse(app.__b), { note: 'server' }) });
    run(app, 'adoptSaved(state.id, JSON.stringify({ data: state }), JSON.parse(__saved))');
  } finally { run(app, 'mergeResults = __mr'); }
  assert.equal(run(app, 'JSON.stringify(offlineBase[state.id])'), before, 'the base is not moved when the merge failed');
});

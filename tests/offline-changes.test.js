const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, plain, useState } = require('./lib/helpers');
const { buildStates } = require('./lib/app-states');

// Offline scoring: DDOffline.matchChanges (what changed, match by match, from the last server copy) and
// DDOffline.applyMatchChange (putting one change back onto a fresher copy: same / applied / differs / missing).
const app = loadApp();
const O = run(app, 'DDOffline');
const copy = (x) => JSON.parse(JSON.stringify(x));
const states = buildStates();
const live = (unit, format) => copy(states.find((s) => s.unit === unit && s.format === format && s.phase === 'live').data);
const inApp = (t) => { app.__x = t; return run(app, '__x'); };
const changes = (a, b) => plain(O.matchChanges(inApp(copy(a)), inApp(copy(b))));
function firstUnscoredRR(t) {
  for (const g of t.groups) for (const [a, b] of run(app, 'groupMatches')(g)) if (!(g.scores || {})[run(app, 'scoreKey')(a, b)]) return { g, a, b };
  return null;
}
function firstOpenKO(bracket) {
  for (let ri = 0; ri < bracket.rounds.length; ri++) for (let mi = 0; mi < bracket.rounds[ri].length; mi++) {
    const m = bracket.rounds[ri][mi];
    if (m.aEntryId && m.bEntryId && !m.winnerId && !m.bye && !m.void) return { m, ri, mi };
  }
  return null;
}

test('a round robin score, a correction and a clear are each one change, keyed by group and pair, labelled with names', () => {
  const base = live('Singles', 'roundrobin');
  const cur = copy(base);
  const x = firstUnscoredRR(cur);
  const key = 'rr:' + x.g.id + ':' + run(app, 'scoreKey')(x.a, x.b);
  x.g.scores[run(app, 'scoreKey')(x.a, x.b)] = { legs1: 3, legs2: 1 };
  let ch = changes(base, cur);
  assert.equal(ch.length, 1);
  assert.equal(ch[0].key, key); assert.equal(ch[0].kind, 'rr');
  assert.equal(ch[0].before, null); assert.deepEqual(ch[0].after, { legs1: 3, legs2: 1 });
  const nameA = cur.entriesList.find((e) => e.id === x.a).name;
  assert.match(ch[0].label, new RegExp('Group ' + x.g.label + ' — .*' + nameA.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(ch[0].label, /3–1$/);
  // a correction of a result the server already has
  const corrected = copy(cur); corrected.groups.find((g) => g.id === x.g.id).scores[run(app, 'scoreKey')(x.a, x.b)] = { legs1: 1, legs2: 3 };
  ch = changes(cur, corrected);
  assert.equal(ch.length, 1); assert.deepEqual(ch[0].before, { legs1: 3, legs2: 1 }); assert.deepEqual(ch[0].after, { legs1: 1, legs2: 3 });
  // a clear
  const cleared = copy(cur); delete cleared.groups.find((g) => g.id === x.g.id).scores[run(app, 'scoreKey')(x.a, x.b)];
  ch = changes(cur, cleared);
  assert.equal(ch.length, 1); assert.equal(ch[0].after, null);
  assert.equal(changes(cur, copy(cur)).length, 0, 'nothing changed: no changes');
  assert.equal(changes(null, { groups: [] }).length, 0);
});

test('knockout: a winner, a walkover, "neither showed" and a call are changes; a stamp field turning false is not', () => {
  const base = live('Singles', 'knockout');
  const cur = copy(base);
  const k = firstOpenKO(cur.knockout);
  k.m.aLegs = 3; k.m.bLegs = 0; k.m.winnerId = k.m.aEntryId; k.m.wo = true;
  let ch = changes(base, cur);
  assert.equal(ch.length, 1);
  assert.equal(ch[0].key, 'ko:knockout:' + k.m.aEntryId + '|' + k.m.bEntryId);
  assert.equal(ch[0].after.winnerId, k.m.aEntryId); assert.equal(ch[0].after.wo, true);
  // void
  const v = copy(base); const kv = firstOpenKO(v.knockout); kv.m.void = true;
  ch = changes(base, v); assert.equal(ch.length, 1); assert.equal(ch[0].after.void, true);
  assert.match(ch[0].label, /Neither showed/);
  // a call
  const c = copy(base); const kc = firstOpenKO(c.knockout); kc.m.called = true; kc.m.calledAt = 1; kc.m.calledPair = kc.m.aEntryId + '|' + kc.m.bEntryId;
  assert.equal(changes(base, c).length, 1);
  // wo:false where the server had no wo at all is the same thing
  const f = copy(base); firstOpenKO(f.knockout).m.wo = false;
  assert.equal(changes(base, f).length, 0);
});

test('Group Boards: a result inside a group is keyed by that group’s bracket', () => {
  const base = live('Singles', 'podknockout');
  const cur = copy(base);
  const pod = cur.pods.find((p) => p.bracket && firstOpenKO(p.bracket));
  const k = firstOpenKO(pod.bracket);
  k.m.aLegs = 2; k.m.bLegs = 0; k.m.winnerId = k.m.aEntryId;
  const ch = changes(base, cur);
  assert.equal(ch.length, 1);
  assert.equal(ch[0].key, 'ko:pod:' + pod.id + ':' + k.m.aEntryId + '|' + k.m.bEntryId);
  assert.match(ch[0].label, new RegExp('^Group ' + pod.label + ' '));
});

test('applyMatchChange: same, applied, differs (unless forced) and missing, for a round robin score', () => {
  const base = live('Singles', 'roundrobin');
  const cur = copy(base);
  const x = firstUnscoredRR(cur), sk = run(app, 'scoreKey')(x.a, x.b);
  x.g.scores[sk] = { legs1: 3, legs2: 1 };
  const [c] = O.matchChanges(inApp(copy(base)), inApp(copy(cur)));
  const fresh = inApp(copy(base));
  assert.equal(O.applyMatchChange(fresh, c), 'applied');
  assert.deepEqual(plain(fresh.groups.find((g) => g.id === x.g.id).scores[sk]), { legs1: 3, legs2: 1 });
  assert.equal(O.applyMatchChange(fresh, c), 'same');
  const other = inApp(copy(base)); other.groups.find((g) => g.id === x.g.id).scores[sk] = { legs1: 0, legs2: 3 };
  assert.equal(O.applyMatchChange(other, c), 'differs');
  assert.deepEqual(plain(other.groups.find((g) => g.id === x.g.id).scores[sk]), { legs1: 0, legs2: 3 }, 'left as it was');
  assert.equal(O.applyMatchChange(other, c, { force: true }), 'applied');
  assert.deepEqual(plain(other.groups.find((g) => g.id === x.g.id).scores[sk]), { legs1: 3, legs2: 1 });
  // the group was redrawn on the server: the pair is not in it any more
  const redrawn = inApp(copy(base)); const rg = redrawn.groups.find((g) => g.id === x.g.id); rg.entryIds = rg.entryIds.filter((id) => id !== x.a);
  assert.equal(O.applyMatchChange(redrawn, c), 'missing');
  const gone = inApp(copy(base)); gone.groups = gone.groups.filter((g) => g.id !== x.g.id);
  assert.equal(O.applyMatchChange(gone, c), 'missing');
});

test('applyMatchChange on a knockout: the winner moves on; a bracket whose match now has other players takes nothing', () => {
  const base = live('Singles', 'knockout');
  useState(app, inApp(copy(base)));
  const cur = copy(base);
  const k = firstOpenKO(cur.knockout);
  k.m.aLegs = 3; k.m.bLegs = 1; k.m.winnerId = k.m.aEntryId;
  const [c] = O.matchChanges(inApp(copy(base)), inApp(copy(cur)));
  const fresh = inApp(copy(base));
  assert.equal(O.applyMatchChange(fresh, c), 'applied');
  const m = fresh.knockout.rounds[k.ri][k.mi];
  assert.equal(m.winnerId, k.m.aEntryId);
  if (k.ri + 1 < fresh.knockout.rounds.length) {
    const next = fresh.knockout.rounds[k.ri + 1][Math.floor(k.mi / 2)];
    assert.ok(next.aEntryId === k.m.aEntryId || next.bEntryId === k.m.aEntryId, 'the winner moved to the next round');
  }
  assert.equal(O.applyMatchChange(fresh, c), 'same');
  // the server's bracket has someone else in that match (redrawn)
  const reshaped = inApp(copy(base));
  const rm = reshaped.knockout.rounds[k.ri][k.mi];
  rm.aEntryId = 'someone-else';
  assert.equal(O.applyMatchChange(reshaped, c), 'missing');
  // the server already has a different result for that match
  const other = inApp(copy(base)); const om = other.knockout.rounds[k.ri][k.mi];
  om.aLegs = 0; om.bLegs = 3; om.winnerId = om.bEntryId;
  assert.equal(O.applyMatchChange(other, c), 'differs');
});

test('review 5: putting back a knockout result that changes the winner, when later rounds have results, is "differs", never applied quietly', () => {
  const done = copy(states.find((s) => s.unit === 'Singles' && s.format === 'knockout' && s.phase === 'done').data);
  const b = done.knockout;
  let hit = null;
  for (let mi = 0; mi < b.rounds[0].length && !hit; mi++) {
    const m = b.rounds[0][mi], nx = b.rounds[1][Math.floor(mi / 2)];
    if (m.aEntryId && m.bEntryId && m.winnerId && nx.winnerId) hit = { m, mi };
  }
  assert.ok(hit, 'a decided first-round match feeding a decided second-round match');
  const cur = copy(done); const cm = cur.knockout.rounds[0][hit.mi];
  const loser = cm.winnerId === cm.aEntryId ? cm.bEntryId : cm.aEntryId;
  cm.winnerId = loser; const t = cm.aLegs; cm.aLegs = cm.bLegs; cm.bLegs = t;
  const c = O.matchChanges(inApp(copy(done)), inApp(copy(cur))).find((x) => x.key.indexOf(cm.aEntryId + '|' + cm.bEntryId) > 0);
  const fresh = inApp(copy(done));
  const nextBefore = JSON.stringify(fresh.knockout.rounds[1][Math.floor(hit.mi / 2)]);
  assert.equal(O.applyMatchChange(fresh, c), 'differs');
  assert.equal(JSON.stringify(fresh.knockout.rounds[1][Math.floor(hit.mi / 2)]), nextBefore, 'the later result is untouched');
  assert.equal(O.knockoutCascade(fresh, c), true, 'and it says later results would be cleared');
});

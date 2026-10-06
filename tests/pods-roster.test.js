const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, plain, useState, seededRng, makeTournament, play } = require('./lib/helpers');

const app = loadApp();
const f = (name) => run(app, name);
function drawn(n, pods) {
  const t = makeTournament(app, n, { pods }); useState(app, t);
  app.persist = () => {}; app.render = () => {};
  f('generatePods')(t, seededRng(2));
  return t;
}
const addLate = (t, id) => t.entriesList.push({ id, name: 'Late ' + id, org: '', players: [], withdrawn: false });

test('players added after the draw are reported as not in a group', () => {
  const t = drawn(12, 3);
  assert.deepEqual(plain(f('podsUnplaced')(t)), []);
  addLate(t, 'late1'); addLate(t, 'late2');
  assert.deepEqual(plain(f('podsUnplaced')(t)), ['late1', 'late2']);
});

test('removed or withdrawn players still sitting in a group are reported', () => {
  const t = drawn(12, 3);
  t.entriesList[0].withdrawn = true;
  t.entriesList.splice(1, 1);
  assert.deepEqual(plain(f('podsGone')(t)).sort(), ['e0', 'e1']);
});

test('a late player can be placed into an editable group, but not a confirmed one', () => {
  const t = drawn(12, 3);
  addLate(t, 'late1'); addLate(t, 'late2');
  assert.equal(f('podsPlaceLate')(t, 'late1', t.pods[0].id).ok, true);
  assert.ok(t.pods[0].entryIds.includes('late1')); assert.equal(t.pods[0].entryIds.length, 5);
  const inBracket = t.pods[0].bracket.rounds[0].flatMap((m) => [m.aEntryId, m.bEntryId]);
  assert.ok(inBracket.includes('late1'));
  t.pods[1].confirmed = true;
  assert.equal(f('podsPlaceLate')(t, 'late2', t.pods[1].id).ok, false);
  assert.equal(f('podsPlaceLate')(t, 'late1', t.pods[2].id).ok, false);   // already placed
  assert.equal(f('podsPlaceLate')(t, 'late2', 'nope').ok, false);
});

test('removing gone players rebuilds editable groups and reports the ones it could not change', () => {
  const t = drawn(12, 3);
  const a = t.pods[0].entryIds[0], b = t.pods[1].entryIds[0];
  t.entriesList.find((e) => e.id === a).withdrawn = true;
  t.entriesList.find((e) => e.id === b).withdrawn = true;
  t.pods[1].confirmed = true;
  const r = f('podsRemoveGone')(t);
  assert.equal(r.ok, false); assert.deepEqual(plain(r.stuck), [b]);
  assert.ok(!t.pods[0].entryIds.includes(a));
  const inBracket = t.pods[0].bracket.rounds[0].flatMap((m) => [m.aEntryId, m.bEntryId]);
  assert.ok(!inBracket.includes(a));
  assert.ok(t.pods[1].entryIds.includes(b));
});

test('a group is never emptied below 2 players by removing people', () => {
  const t = drawn(6, 3);
  const ids = t.pods[0].entryIds.slice();
  t.entriesList.find((e) => e.id === ids[0]).withdrawn = true;
  const r = f('podsRemoveGone')(t);
  assert.equal(r.ok, false); assert.equal(t.pods[0].entryIds.length, 2);
});

test('stage 3 warns about unplaced and gone players, with a way to place or remove them', () => {
  const t = drawn(12, 3);
  assert.doesNotMatch(f('podsStage3')(), /entry list has changed/);
  addLate(t, 'late1');
  t.entriesList.find((e) => e.id === t.pods[0].entryIds[0]).withdrawn = true;
  const html = f('podsStage3')();
  assert.match(html, /entry list has changed since the draw/);
  assert.match(html, /podsPlaceModal\('late1'\)/); assert.match(html, /podsRemoveGoneClick\(\)/);
});

test('stage 4 shows the same warning, so a late player is not left out silently', () => {
  const t = drawn(12, 3);
  addLate(t, 'late1');
  assert.match(f('podsStage4')(), /entry list has changed since the draw/);
});

test('placing a late player from the screen, and removing gone players from the screen', () => {
  const t = drawn(12, 3);
  addLate(t, 'late1');
  const els = { plTo: { value: '' } };
  let modal = null;
  app.openModal = (o) => { modal = o; };
  app.document = { getElementById: (id) => els[id] || null };
  f('podsPlaceModal')('late1');
  assert.match(modal.bodyHTML, /Group 1/);
  els.plTo.value = t.pods[2].id;
  assert.equal(modal.onConfirm(), undefined);
  assert.ok(t.pods[2].entryIds.includes('late1'));
  const gone = t.pods[0].entryIds[0];
  t.entriesList.find((e) => e.id === gone).withdrawn = true;
  f('podsRemoveGoneClick')();
  assert.ok(!t.pods[0].entryIds.includes(gone));
});

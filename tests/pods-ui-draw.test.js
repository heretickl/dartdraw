const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, plain, useState, seededRng, makeTournament, play } = require('./lib/helpers');

const app = loadApp();
const f = (name) => run(app, name);
function fresh(n, pods, opts) { const t = makeTournament(app, n, Object.assign({ pods }, opts || {})); useState(app, t); app.persist = () => {}; app.render = () => {}; return t; }
function drawn(n, pods, opts) { const t = fresh(n, pods, opts); f('generatePods')(t, seededRng(2)); return t; }

test('before the draw: participants panel, a Draw groups button and no cards', () => {
  fresh(12, 3);
  const html = f('podsStage3')();
  assert.match(html, /Participants/); assert.match(html, /Draw groups/);
  assert.doesNotMatch(html, /Group 1/);
});

test('after the draw: a card per group with players, a boards field and Move buttons', () => {
  const t = drawn(12, 3);
  const html = f('podsStage3')();
  assert.match(html, /Redraw groups/); assert.match(html, /Group 1/); assert.match(html, /Group 3/);
  assert.equal((html.match(/podsMoveModal\(/g) || []).length, 12);
  assert.match(html, /setPodBoards\(/);
  assert.match(html, new RegExp(t.pods[0].entryIds[0] ? 'Player ' : 'x'));
});

test('an invalid number of groups explains the problem and disables the draw', () => {
  fresh(7, 4);
  const html = f('podsStage3')();
  assert.match(html, /Check the number of groups/);
  assert.match(html, /disabled onclick="podsDrawClick\(\)"/);
});

test('once scores exist the groups cannot be redrawn or moved', () => {
  const t = drawn(12, 3);
  play(t.pods[0].bracket.rounds[0].find((m) => m.aEntryId && m.bEntryId), 'a');
  const html = f('podsStage3')();
  assert.match(html, /can't be redrawn/);
  assert.match(html, /disabled onclick="podsDrawClick\(\)"/);
  const firstCard = html.split('Group 2')[0];
  assert.doesNotMatch(firstCard, /podsMoveModal\(/);
});

test('drawing groups from the screen builds them; a bad setting shows a message instead', () => {
  const t = fresh(12, 3);
  f('podsDrawNow')();
  assert.equal(t.pods.length, 3);
  let modal = null; app.openModal = (o) => { modal = o; };
  const bad = fresh(7, 4);
  f('podsDrawNow')();
  assert.equal(bad.pods.length, 0); assert.match(modal.body, /at most 3 groups/);
});

test('redrawing asks first, and does nothing once scores exist', () => {
  const t = drawn(12, 3);
  let modal = null; app.openModal = (o) => { modal = o; };
  f('podsDrawClick')();
  assert.equal(modal.title, 'Redraw groups?');
  const before = plain(t.pods.map((p) => p.id));
  modal.onConfirm();
  assert.notDeepEqual(plain(t.pods.map((p) => p.id)), before);
  modal = null;
  play(t.pods[0].bracket.rounds[0].find((m) => m.aEntryId && m.bEntryId), 'a');
  f('podsDrawClick')();
  assert.equal(modal, null);
});

test('board numbers can be typed per group, blank input is ignored, and boards can change after confirming', () => {
  const t = drawn(12, 3);
  const pod = t.pods[0];
  f('setPodBoards')(pod.id, '4, 2 2');
  assert.deepEqual(plain(pod.boards), [2, 4]);
  f('setPodBoards')(pod.id, '');
  assert.deepEqual(plain(pod.boards), [2, 4]);
  // a board can break mid-event: boards stay editable once the group is confirmed and even once it has scores
  pod.confirmed = true;
  f('setPodBoards')(pod.id, '9');
  assert.deepEqual(plain(pod.boards), [9]);
  play(pod.bracket.rounds[0].find((m) => m.aEntryId && m.bEntryId), 'a');
  f('setPodBoards')(pod.id, '3');
  assert.deepEqual(plain(pod.boards), [3]);
});

test('the boards box on the draw screen stays enabled for a confirmed group', () => {
  const t = drawn(12, 3);
  t.pods[0].confirmed = true;
  const html = f('podsStage3')();
  assert.match(html, /<input type="text"[^>]*onchange="setPodBoards\('/);
  assert.doesNotMatch(html, /disabled onchange="setPodBoards/);
});

test('Move… moves a player, or swaps with the chosen player', () => {
  const t = drawn(12, 3);
  const els = { mvTo: { value: '', innerHTML: '' }, mvSwap: { value: '', innerHTML: '' } };
  let modal = null;
  app.openModal = (o) => { modal = o; };
  app.document = { getElementById: (id) => els[id] || null };
  const mover = t.pods[0].entryIds[0], target = t.pods[1];
  f('podsMoveModal')(mover);
  assert.match(modal.bodyHTML, /Group 2/); assert.doesNotMatch(modal.bodyHTML, /Group 1 \(/);
  els.mvTo.value = target.id; els.mvSwap.value = '';
  assert.equal(modal.onConfirm(), undefined);
  assert.ok(target.entryIds.includes(mover));
  const other = t.pods[2].entryIds[0];
  f('podsMoveModal')(mover);
  els.mvTo.value = t.pods[2].id; els.mvSwap.value = other;
  assert.equal(modal.onConfirm(), undefined);
  assert.ok(t.pods[2].entryIds.includes(mover) && target.entryIds.includes(other));
  els.mvTo.value = target.id; els.mvSwap.value = '';
  t.pods[2].confirmed = true;
  const r = modal.onConfirm();
  assert.ok(r && r.error);
});

test('stage 3 for Group Boards shows the groups screen, not the round-robin one', () => {
  fresh(12, 3);
  const html = f('stage3')();
  assert.match(html, /Draw groups/);
  assert.match(html, /Estimated duration/);
});

test('changing the number of groups after the draw warns that the draw no longer matches', () => {
  const t = drawn(12, 3);
  assert.doesNotMatch(f('podsStage3')(), /no longer matches/);
  t.format.podCount = 4;
  const html = f('podsStage3')();
  assert.match(html, /no longer matches/); assert.match(html, /3 groups/); assert.match(html, /4 groups/);
  assert.match(f('podsStage4')(), /no longer matches/);
});

test('the groups screen has one way forward, not two competing continue buttons', () => {
  drawn(12, 3);
  const html = f('podsStage3')();
  assert.doesNotMatch(html, /Review print pack/);
  assert.equal((html.match(/goStage\(4\)/g) || []).length, 1);
  assert.match(html, /goStage\(2\)">Make changes/);
  assert.doesNotMatch(html, /Generating the bracket happens in the next step/);
});

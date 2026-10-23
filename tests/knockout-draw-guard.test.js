const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, plain, useState } = require('./lib/helpers');

const app = loadApp(); app.persist = () => {}; app.render = () => {};
const f = (n) => run(app, n);
let modals = [];
app.openModal = (o) => { modals.push(o); };

// A round robin + knockout event: 12 entries in 3 groups of 4, all confirmed. Nothing scored yet.
function rrk(opts) {
  opts = opts || {};
  const t = f('blankTournament')(); useState(app, t);
  t.eventCreation.saved = true; t.format.saved = true; t.format.formatType = 'rrknockout';
  t.format.maxPerGroup = 4; t.format.qualifiersPerGroup = 2; t.format.advanceMode = 'seeded';
  t.eventCreation.entries = 12;
  t.entriesList = Array.from({ length: 12 }, (_, i) => ({ id: 'e' + i, name: 'Player ' + (i + 1), org: '', players: [], withdrawn: false }));
  f('buildGroups')(t);
  t.groups.forEach((g) => { g.confirmed = true; });
  modals = [];
  return t;
}
// Scores every match so the entry listed first in the group always wins: no ties anywhere.
function finish(g) {
  g.gameStarted = true;
  const pos = (id) => g.entryIds.indexOf(id);
  f('groupMatches')(g).forEach(([a, b]) => { pos(a) < pos(b) ? f('setScore')(g, a, b, 3, 0) : f('setScore')(g, b, a, 3, 0); });
}
// Leaves one match of the group unscored.
function finishAllButOne(g) {
  finish(g);
  const [a, b] = f('groupMatches')(g)[0];
  delete g.scores[f('scoreKey')(a, b)];
}
const drawEarly = (t) => {   // a bracket as an older version of the app could have drawn it
  app.__q = t.entriesList.slice(0, 4).map((e) => ({ entryId: e.id, org: '' }));
  t.knockout = run(app, 'generateBracket(__q, "Main bracket")');
};
const section = () => f('stage5KnockoutSection')();

test('knockoutDrawBlock: null once every confirmed group is complete', () => {
  const t = rrk(); t.groups.forEach(finish);
  assert.equal(f('knockoutDrawBlock')(t), null);
});

test('knockoutDrawBlock: names the confirmed groups that are not complete', () => {
  const t = rrk(); finish(t.groups[0]); finishAllButOne(t.groups[2]);
  assert.deepEqual(plain(f('knockoutDrawBlock')(t)), { groups: ['B', 'C'] });
  t.groups.forEach(finish);
  assert.equal(f('knockoutDrawBlock')(t), null);
});

test('knockoutDrawBlock: no confirmed groups is its own answer', () => {
  const t = rrk(); t.groups.forEach((g) => { g.confirmed = false; });
  assert.deepEqual(plain(f('knockoutDrawBlock')(t)), { none: true });
  const empty = f('blankTournament')(); useState(app, empty);
  assert.deepEqual(plain(f('knockoutDrawBlock')(empty)), { none: true });
});

test('knockoutDrawBlock: ignores groups that are not confirmed', () => {
  const t = rrk(); finish(t.groups[0]); finish(t.groups[1]);
  t.groups[2].confirmed = false;   // C has nothing scored but is not confirmed
  assert.equal(f('knockoutDrawBlock')(t), null);
});

test('confirmGenerateKnockoutFromRR with an unfinished group shows an information modal and draws nothing', () => {
  const t = rrk(); finish(t.groups[0]); finishAllButOne(t.groups[1]); finish(t.groups[2]);
  f('confirmGenerateKnockoutFromRR')();
  assert.equal(t.knockout, null);
  assert.equal(modals.length, 1);
  const m = modals[0];
  assert.equal(m.title, 'Finish the round robin first');
  assert.match(m.body || m.bodyHTML, /Group B/);
  assert.doesNotMatch(m.body || m.bodyHTML, /Group A|Group C/);
  assert.equal(m.confirmLabel, 'OK');
  assert.doesNotMatch(String(m.confirmLabel), /anyway/i);
  m.onConfirm();                       // pressing OK must not draw either
  assert.equal(t.knockout, null);
  return new Promise((r) => setTimeout(r, 5)).then(() => { assert.equal(t.knockout, null); assert.equal(modals.length, 1); });
});

test('confirmGenerateKnockoutFromRR with no confirmed groups is blocked too', () => {
  const t = rrk(); t.groups.forEach((g) => { g.confirmed = false; });
  f('confirmGenerateKnockoutFromRR')();
  assert.equal(t.knockout, null); assert.equal(modals.length, 1);
  assert.equal(modals[0].title, 'Finish the round robin first');
});

test('confirmGenerateKnockoutFromRR with every group complete draws the bracket', () => {
  const t = rrk(); t.groups.forEach(finish);
  f('confirmGenerateKnockoutFromRR')();
  assert.ok(t.knockout, 'bracket drawn');
  assert.equal(modals.length, 0);
  assert.equal(t.knockout.rounds[0].length, 4);   // 6 qualifiers -> a bracket of 8
  assert.ok(t.rrFinishedAt);
});

test('generateKnockoutFromRR called directly while blocked does not touch the tournament', () => {
  const t = rrk(); finish(t.groups[0]); finishAllButOne(t.groups[1]); finish(t.groups[2]);
  f('generateKnockoutFromRR')();
  assert.equal(t.knockout, null); assert.ok(!t.knockoutLosers); assert.ok(!t.rrFinishedAt);
  drawEarly(t); const before = t.knockout, snap = JSON.stringify(t.knockout);
  f('generateKnockoutFromRR')();
  assert.equal(t.knockout, before); assert.equal(JSON.stringify(t.knockout), snap);
});

test('generateKnockoutFromRRChecked cannot draw early either', () => {
  const t = rrk(); finish(t.groups[0]); finishAllButOne(t.groups[1]); finish(t.groups[2]);
  f('generateKnockoutFromRRChecked')();
  assert.equal(t.knockout, null);
});

test('regenerateKnockoutFromRR while blocked leaves the existing bracket alone and shows the modal', () => {
  const t = rrk(); finish(t.groups[0]); finishAllButOne(t.groups[1]); finish(t.groups[2]);
  drawEarly(t);
  const m0 = t.knockout.rounds[0][0]; m0.aLegs = 3; m0.bLegs = 1; m0.winnerId = m0.aEntryId;
  const before = t.knockout, snap = JSON.stringify(t.knockout);
  f('regenerateKnockoutFromRR')();
  assert.equal(t.knockout, before); assert.equal(JSON.stringify(t.knockout), snap);
  assert.equal(modals.length, 1); assert.equal(modals[0].title, 'Finish the round robin first');
  assert.equal(modals[0].confirmLabel, 'OK');
  modals[0].onConfirm();
  assert.equal(t.knockout, before); assert.equal(m0.winnerId, m0.aEntryId);
});

test('regenerateKnockoutFromRR with every group complete still asks before discarding results', () => {
  const t = rrk(); t.groups.forEach(finish);
  f('confirmGenerateKnockoutFromRR')();
  const m0 = t.knockout.rounds[0].find((m) => m.aEntryId && m.bEntryId); m0.aLegs = 3; m0.bLegs = 1; m0.winnerId = m0.aEntryId;
  modals = [];
  f('regenerateKnockoutFromRR')();
  assert.equal(modals.length, 1); assert.equal(modals[0].title, 'Regenerate bracket?'); assert.equal(modals[0].confirmLabel, 'Regenerate');
});

test('stage 5 before the draw, blocked: disabled button, the rule and the open groups, no old warning', () => {
  const t = rrk(); finish(t.groups[0]); finishAllButOne(t.groups[1]); finishAllButOne(t.groups[2]);
  const html = section();
  assert.match(html, /<button[^>]*disabled[^>]*onclick="confirmGenerateKnockoutFromRR\(\)"[^>]*>Generate knockout bracket|<button[^>]*onclick="confirmGenerateKnockoutFromRR\(\)"[^>]*disabled[^>]*>Generate knockout bracket/);
  assert.match(html, /The knockout can only be drawn once every group is finished\./);
  assert.match(html, /Still to finish: Group B, Group C\./);
  assert.doesNotMatch(html, /Round robin still in progress/); assert.doesNotMatch(html, /Generating now/);
  assert.match(html, /final standings once every group is finished/);
});

test('stage 5 before the draw, no confirmed groups: disabled with the rule but no group list', () => {
  const t = rrk(); t.groups.forEach((g) => { g.confirmed = false; });
  const html = section();
  assert.match(html, /disabled/); assert.match(html, /The knockout can only be drawn once every group is finished\./);
  assert.doesNotMatch(html, /Still to finish/);
});

test('stage 5 escapes the group labels', () => {
  const t = rrk(); t.groups[0].label = '<i>x</i>';
  const html = section();
  assert.match(html, /Still to finish: Group &lt;i&gt;x&lt;\/i&gt;,/);
  assert.doesNotMatch(html, /<i>x<\/i>/);
});

test('stage 5 before the draw, every group complete: enabled button and no warning', () => {
  const t = rrk(); t.groups.forEach(finish);
  const html = section();
  const btn = html.match(/<button[^>]*confirmGenerateKnockoutFromRR\(\)[^>]*>/)[0];
  assert.doesNotMatch(btn, /disabled/);
  assert.doesNotMatch(html, /can only be drawn/); assert.doesNotMatch(html, /Still to finish/);
  assert.doesNotMatch(html, /Round robin still in progress/);
  assert.match(html, /final standings once every group is finished/);
});

test('stage 5 with a bracket drawn but a score since cleared: regenerate is disabled with the rule, the bracket stays', () => {
  const t = rrk(); t.groups.forEach(finish);
  f('confirmGenerateKnockoutFromRR')();
  const bracket = t.knockout;
  let html = section();
  assert.doesNotMatch(/<button[^>]*regenerateKnockoutFromRR\(\)[^>]*>/.exec(html)[0], /disabled/);
  assert.doesNotMatch(html, /can only be drawn/);
  finishAllButOne(t.groups[1]);
  html = section();
  assert.match(/<button[^>]*regenerateKnockoutFromRR\(\)[^>]*>/.exec(html)[0], /disabled/);
  assert.match(html, /The knockout can only be drawn once every group is finished\./);
  assert.match(html, /Still to finish: Group B\./);
  assert.match(html, /mko-artboard-scroll/);   // the bracket is still shown and usable
  assert.equal(t.knockout, bracket);
});

test('a legacy tournament drawn before every group finished keeps its bracket when loaded and shown', () => {
  const t = rrk(); finish(t.groups[0]);
  drawEarly(t);
  const m0 = t.knockout.rounds[0][0]; m0.aLegs = 3; m0.bLegs = 0; m0.winnerId = m0.aEntryId;
  const saved = JSON.stringify(t);
  const loaded = JSON.parse(saved); useState(app, loaded);
  const html = f('stage5')();
  assert.ok(loaded.knockout);
  const stable = (b) => JSON.stringify(b, (k, v) => (k.startsWith('__') ? undefined : v));   // drawing the chart caches seed info on the matches
  assert.equal(stable(loaded.knockout), stable(t.knockout));
  assert.match(html, /mko-artboard-scroll/);
  assert.match(html, /Still to finish: Group B, Group C\./);
  assert.match(/<button[^>]*regenerateKnockoutFromRR\(\)[^>]*>/.exec(html)[0], /disabled/);
});

// ---- groups that feed the bracket even when they are not (or no longer) confirmed ----
const flush = () => new Promise((r) => setTimeout(r, 5));
// Half played: some matches scored, the rest not.
function halfPlayed(g) {
  g.gameStarted = true;
  const ms = f('groupMatches')(g);
  ms.slice(0, 2).forEach(([a, b]) => f('setScore')(g, a, b, 3, 1));
}

test('a half-played group that was unconfirmed still blocks the draw and is named', () => {
  const t = rrk(); finish(t.groups[0]); finish(t.groups[1]); halfPlayed(t.groups[2]);
  t.groups[2].confirmed = false;   // the organiser un-confirmed it (toggleConfirm does exactly this)
  assert.deepEqual(plain(f('knockoutDrawBlock')(t)), { groups: ['C'] });
  f('generateKnockoutFromRR')();
  assert.equal(t.knockout, null); assert.ok(!t.rrFinishedAt);
  f('confirmGenerateKnockoutFromRR')();
  assert.equal(t.knockout, null);
  assert.equal(modals.length, 1); assert.equal(modals[0].title, 'Finish the round robin first');
  assert.match(modals[0].body, /Group C/);
  const html = section();
  assert.match(html, /Still to finish: Group C\./); assert.match(html, /<button[^>]*disabled[^>]*confirmGenerateKnockoutFromRR/);
});

test('toggleConfirm on a half-played group cannot be used to get round the rule', () => {
  const t = rrk(); finish(t.groups[0]); finish(t.groups[1]); halfPlayed(t.groups[2]);
  f('toggleConfirm')(t.groups[2].id);
  assert.equal(t.groups[2].confirmed, false);
  f('confirmGenerateKnockoutFromRR')();
  assert.equal(t.knockout, null); assert.equal(modals.length, 1);
});

test('a roster change that un-confirms a finished group blocks the draw until the new entry has played', () => {
  const t = rrk(); t.groups.forEach(finish); t.groups.forEach((g) => { g.confirmedEntryIds = g.entryIds.slice(); });
  assert.equal(f('knockoutDrawBlock')(t), null);
  // Withdraw itself is refused once the group has started (Release 1, D2): it offers Mark no-show instead.
  const victim = t.groups[1].entryIds[3];
  f('withdrawEntry')(victim);
  assert.equal(modals[modals.length - 1].title, 'Games have started in Group B');
  assert.equal(t.groups[1].entryIds.includes(victim), true);
  assert.equal(t.groups[1].confirmed, true);
  // A roster change made some other way (a stored event edited before this guard existed) still un-confirms the group.
  t.entriesList.find((e) => e.id === victim).withdrawn = true;
  t.groups[1].entryIds = t.groups[1].entryIds.filter((id) => id !== victim);
  t.entriesList.push({ id: 'newcomer', name: 'Newcomer', autoName: false });
  t.groups[1].entryIds.push('newcomer');
  f('reconcileConfirmations')(t);
  const g = t.groups[1];
  assert.equal(g.confirmed, false, 'the app un-confirmed the group itself');
  assert.equal(g.entryIds.length, 4);
  assert.deepEqual(plain(f('knockoutDrawBlock')(t)), { groups: ['B'] });
  modals = [];
  f('generateKnockoutFromRR')(); f('confirmGenerateKnockoutFromRR')();
  assert.equal(t.knockout, null); assert.match(modals[0].body, /Group B/);
});

test('an unconfirmed group that never started is ignored; the others decide', () => {
  const t = rrk(); finish(t.groups[0]); finish(t.groups[1]);
  t.groups[2].confirmed = false;
  assert.equal(t.groups[2].gameStarted, false);
  assert.equal(f('knockoutDrawBlock')(t), null);
  finishAllButOne(t.groups[1]);
  assert.deepEqual(plain(f('knockoutDrawBlock')(t)), { groups: ['B'] });   // C is not named
});

test('a group of one counts as complete, and a no-show walkover lets a group finish', () => {
  const t = rrk(); finish(t.groups[0]); finish(t.groups[1]);
  t.groups[2].entryIds = t.groups[2].entryIds.slice(0, 1);
  assert.deepEqual(plain(f('groupMatches')(t.groups[2])), []);
  assert.equal(f('knockoutDrawBlock')(t), null);
  // a no-show in group B whose matches were never played
  const t2 = rrk(); finish(t2.groups[0]); finish(t2.groups[2]);
  const g = t2.groups[1]; g.gameStarted = true; g.confirmed = true;
  f('setScore')(g, g.entryIds[0], g.entryIds[1], 3, 0);
  assert.deepEqual(plain(f('knockoutDrawBlock')(t2)), { groups: ['B'] });
  f('markGroupNoShow')(g.id, g.entryIds[3]);
  assert.deepEqual(plain(f('knockoutDrawBlock')(t2)), { groups: ['B'] });   // the other pairings are still open
  f('groupMatches')(g).forEach(([a, b]) => { if (!f('getScore')(g, a, b)) f('markGroupNoShow')(g.id, a); });
  assert.equal(f('knockoutDrawBlock')(t2), null);
});

test('with a Plate pool, a blocked draw leaves the Plate bracket alone as well', () => {
  const t = rrk(); t.format.losersPool = true;
  finish(t.groups[0]); finish(t.groups[1]); halfPlayed(t.groups[2]);
  const plate = { sentinel: true }; t.knockoutLosers = plate;
  f('generateKnockoutFromRR')(); f('confirmGenerateKnockoutFromRR')();
  assert.equal(t.knockout, null); assert.equal(t.knockoutLosers, plate);
  finish(t.groups[2]); t.knockoutLosers = null;
  f('confirmGenerateKnockoutFromRR')();
  assert.ok(t.knockout); assert.ok(t.knockoutLosers && t.knockoutLosers.rounds, 'allowed draw still builds the Plate pool');
});

test('the allowed regenerate asks first and, once confirmed, rebuilds the bracket', async () => {
  const t = rrk(); t.groups.forEach(finish);
  f('confirmGenerateKnockoutFromRR')();
  const old = t.knockout;
  const m0 = old.rounds[0].find((m) => m.aEntryId && m.bEntryId); m0.aLegs = 3; m0.bLegs = 1; m0.winnerId = m0.aEntryId;
  modals = [];
  f('regenerateKnockoutFromRR')();
  assert.equal(modals.length, 1); assert.equal(modals[0].title, 'Regenerate bracket?');
  assert.equal(t.knockout, old, 'nothing changes until it is confirmed');
  modals[0].onConfirm(); await flush();
  assert.notEqual(t.knockout, old); assert.ok(t.knockout.rounds);
  assert.ok(t.knockout.rounds.every((r) => r.every((m) => !m.winnerId || m.bye)), 'results were discarded');
  assert.equal(modals.length, 1);
});

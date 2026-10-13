const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, useState, seededRng, makeTournament, play, playOut } = require('./lib/helpers');

const app = loadApp();
const f = (n) => run(app, n);
function ready(n, pods) {
  const t = makeTournament(app, n, { pods, boards: pods }); useState(app, t);
  app.persist = () => {}; app.render = () => {};
  f('generatePods')(t, seededRng(3)); f('podsConfirmAll')(t);
  return t;
}
function plainKo(n) {
  const t = f('blankTournament')(); useState(app, t); app.persist = () => {}; app.render = () => {};
  t.format.formatType = 'knockout';
  t.entriesList = Array.from({ length: n }, (_, i) => ({ id: 'e' + i, name: 'P' + (i + 1), org: '', players: [], withdrawn: false }));
  t.knockout = f('generateBracket')(t.entriesList.map((e) => ({ entryId: e.id, org: '' })), 'Bracket');
  return t;
}
function captureModal() { const box = { modal: null }; app.openModal = (o) => { box.modal = o; }; return box; }

test('the no-show picker offers "Neither showed" as a third choice', () => {
  const t = ready(16, 4);
  const box = captureModal();
  f('openKoNoShowPicker')('pod:' + t.pods[0].id, 0, 0);
  assert.match(box.modal.bodyHTML, /Neither showed/);
  assert.match(box.modal.bodyHTML, new RegExp("markKnockoutVoid\\('pod:" + t.pods[0].id + "',0,0\\)"));
  assert.equal((box.modal.bodyHTML.match(/class="picker-row"/g) || []).length, 3);
});

test('neither showed in a group: the match is void, both players are flagged, and the cascade follows', () => {
  const t = ready(16, 4); const p = t.pods[0], m = p.bracket.rounds[0][0];
  const ids = [m.aEntryId, m.bEntryId];
  f('markKnockoutVoid')('pod:' + p.id, 0, 0);
  assert.equal(m.void, true); assert.equal(m.winnerId, null);
  ids.forEach((id) => assert.equal(t.entriesList.find((e) => e.id === id).noShow, true));
  play(p.bracket.rounds[0][1], 'a'); f('podsApplyResult')(t, p, () => {});
  assert.equal(p.bracket.rounds[1][0].bye, true);
});

test('neither showed in a plain knockout bracket', () => {
  const t = plainKo(8); const R = t.knockout.rounds;
  f('markKnockoutVoid')('knockout', 0, 0);
  assert.equal(R[0][0].void, true);
  play(R[0][1], 'a'); f('propagateByes')(R);
  assert.equal(R[1][0].bye, true);
});

test('a void is refused on a match that is played, a bye, or missing a player; and a called match loses its call', () => {
  const t = ready(16, 4); const p = t.pods[0];
  const played = p.bracket.rounds[0][0]; play(played, 'a'); f('podsApplyResult')(t, p, () => {});
  f('markKnockoutVoid')('pod:' + p.id, 0, 0);
  assert.equal(!!played.void, false);
  f('markKnockoutVoid')('pod:' + p.id, 1, 0);                        // the group final: a player is still missing
  assert.equal(!!p.bracket.rounds[1][0].void, false);
  const q = t.pods[1], m = q.bracket.rounds[0][1]; m.called = true; m.calledAt = 1; m.calledPair = 'x|y';
  f('markKnockoutVoid')('pod:' + q.id, 0, 1);
  assert.equal(m.void, true); assert.equal(m.called, undefined); assert.equal(m.calledAt, undefined); assert.equal(m.calledPair, undefined);
});

test('a single no-show cannot be recorded on a match that is already void', () => {
  const t = ready(16, 4); const p = t.pods[0], m = p.bracket.rounds[0][0];
  f('markKnockoutVoid')('pod:' + p.id, 0, 0);
  f('markKnockoutNoShow')('pod:' + p.id, 0, 0, 'a');
  assert.equal(m.void, true); assert.equal(m.winnerId, null); assert.equal(!!m.wo, false);
  const box = captureModal();
  f('openKoNoShowPicker')('pod:' + p.id, 0, 0);
  assert.equal(box.modal, null);
});

test('reversing a void clears it and what it caused', () => {
  const t = ready(16, 4); const p = t.pods[0], m = p.bracket.rounds[0][0];
  f('markKnockoutVoid')('pod:' + p.id, 0, 0);
  play(p.bracket.rounds[0][1], 'a'); f('podsApplyResult')(t, p, () => {});
  assert.equal(p.bracket.rounds[1][0].bye, true);
  f('reverseKnockoutVoid')('pod:' + p.id, 0, 0);
  assert.equal(m.void, undefined);
  assert.equal(!!p.bracket.rounds[1][0].bye, false); assert.equal(p.bracket.rounds[1][0].winnerId, null);
  const t2 = plainKo(8); const R = t2.knockout.rounds;
  f('markKnockoutVoid')('knockout', 0, 0);
  f('reverseKnockoutVoid')('knockout', 0, 0);
  assert.equal(R[0][0].void, undefined);
});

test('the score dialog on a void match says so, offers Reverse, and a saved score clears the void', () => {
  const t = ready(16, 4); const p = t.pods[0], m = p.bracket.rounds[0][0];
  f('markKnockoutVoid')('pod:' + p.id, 0, 0);
  const box = captureModal();
  f('koMatchScoreModal')('pod:' + p.id, 0, 0);
  assert.match(box.modal.bodyHTML, /Neither player attended/);
  assert.match(box.modal.bodyHTML, /reverseKnockoutVoid\(/);
  assert.match(box.modal.bodyHTML, /id="scA"/);
  const els = { scA: { value: '3' }, scB: { value: '1' } };
  const realDocument = app.document;
  app.document = { getElementById: (id) => els[id] || null };
  try { assert.equal(box.modal.onConfirm(), undefined); } finally { app.document = realDocument; }
  assert.equal(m.void, undefined); assert.equal(m.winnerId, m.aEntryId);
});

test('the list-style bracket tags a void match and offers no single no-show link on it', () => {
  const t = plainKo(8);
  f('markKnockoutVoid')('knockout', 0, 0);
  const html = f('bracketColumnsHTML')(t.knockout, t, { interactive: true, bracketKey: 'knockout' });
  assert.match(html, /NO-SHOW/);
  const slots = html.split('bracket-slot');
  const voidSlot = slots.find((s) => s.includes('NO-SHOW'));
  assert.doesNotMatch(voidSlot, /Mark no-show/);
});

test('entering a score on a void match outside Group Boards clears the slot its bye had filled', () => {
  const t = plainKo(8); const R = t.knockout.rounds;
  f('markKnockoutVoid')('knockout', 0, 0);
  play(R[0][1], 'a'); f('propagateByes')(R);
  assert.equal(R[1][0].bye, true);
  assert.equal(R[2][0].aEntryId, R[0][1].winnerId);
  const box = captureModal();
  f('koMatchScoreModal')('knockout', 0, 0);
  const els = { scA: { value: '3' }, scB: { value: '1' } };
  const realDocument = app.document;
  app.document = { getElementById: (id) => els[id] || null };
  try { assert.equal(box.modal.onConfirm(), undefined); } finally { app.document = realDocument; }
  assert.equal(R[0][0].void, undefined); assert.equal(R[0][0].winnerId, R[0][0].aEntryId);
  assert.equal(!!R[1][0].bye, false);
  assert.equal(R[2][0].aEntryId, null);
});

test('the picker and the dialog close themselves before a handler that may open a refusal', () => {
  const t = ready(16, 4); const p = t.pods[0];
  const box = captureModal();
  f('openKoNoShowPicker')('pod:' + p.id, 0, 0);
  const rows = box.modal.bodyHTML.match(/<div class="picker-row"[^>]*>/g);
  assert.equal(rows.length, 3);
  assert.ok(rows[2].includes("closeModal();markKnockoutVoid('pod:" + p.id + "',0,0)"));
  f('markKnockoutVoid')('pod:' + p.id, 0, 0);
  f('koMatchScoreModal')('pod:' + p.id, 0, 0);
  assert.ok(box.modal.bodyHTML.includes("closeModal();reverseKnockoutVoid('pod:" + p.id + "',0,0)"));
});

test('a refused reversal shows the refusal modal', () => {
  const t = ready(16, 4); const A = t.pods[0];
  const partner = t.pods.find((x) => { const m = t.knockout.rounds[0].find((k) => k.aFromPod === A.id || k.bFromPod === A.id); return x.id === (m.aFromPod === A.id ? m.bFromPod : m.aFromPod); });
  f('markKnockoutVoid')('pod:' + A.id, 0, 0); f('markKnockoutVoid')('pod:' + A.id, 0, 1);
  t.pods.filter((x) => x !== A).forEach((x) => playOut(app, x.bracket, () => 'a'));
  f('podsApplyResult')(t, partner, () => {});
  const R = t.knockout.rounds;
  R[0].forEach((m) => { if (m.aEntryId && m.bEntryId && !m.bye && !m.void && !m.winnerId) play(m, 'a'); });
  f('propagateByes')(R);
  const fin = R[R.length - 1][0];
  assert.ok(fin.aEntryId && fin.bEntryId); play(fin, 'a');
  const box = captureModal();
  f('reverseKnockoutVoid')('pod:' + A.id, 0, 0);
  assert.ok(box.modal); assert.equal(box.modal.title, "Can't change this result");
  assert.equal(A.bracket.rounds[0][0].void, true);
});

test('the list-style bracket shows no NO-SHOW tag on a match made void by its feeders (no players)', () => {
  const t = ready(16, 4); const p = t.pods[0];
  f('markKnockoutVoid')('pod:' + p.id, 0, 0); f('markKnockoutVoid')('pod:' + p.id, 0, 1);
  assert.equal(p.bracket.rounds[1][0].void, true);
  const html = f('bracketColumnsHTML')(p.bracket, t, { interactive: true, bracketKey: 'pod:' + p.id });
  assert.equal((html.match(/NO-SHOW/g) || []).length, 2);              // the two semifinals only, not the empty final
});

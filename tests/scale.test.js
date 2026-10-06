const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, useState, seededRng, makeTournament, playOut } = require('./lib/helpers');
const { toPublicView } = require('../viewer/api/_lib/publicView');

const app = loadApp();
const f = (name) => run(app, name);
const ms = (fn) => { const t0 = Date.now(); const r = fn(); return { r, took: Date.now() - t0 }; };

test('a 540-player, 64-group event: draw, confirm, play everything, and every screen builds quickly', () => {
  const t = makeTournament(app, 540, { pods: 64, seeding: true, numSeeds: 64, orgSplit: true, orgOf: (i) => 'club' + (i % 40), boards: 64 });
  useState(app, t); app.persist = () => {}; app.render = () => {};

  const draw = ms(() => f('generatePods')(t, seededRng(11)));
  assert.equal(draw.r.ok, true); assert.ok(draw.took < 3000, 'draw took ' + draw.took + 'ms');
  assert.equal(t.pods.length, 64);

  f('podsConfirmAll')(t);
  assert.equal(t.knockout.size, 64);

  const s3 = ms(() => f('podsStage3')()), s5 = ms(() => f('podsStage5')());
  assert.ok(s3.took < 2000, 'stage 3 took ' + s3.took + 'ms');
  assert.ok(s5.took < 1000, 'stage 5 took ' + s5.took + 'ms');
  assert.equal((s5.r.match(/podsSelect\('/g) || []).length >= 64, true);

  t.pods.forEach((p) => { playOut(app, p.bracket, () => 'a'); f('syncFinalsFromPods')(t); });
  playOut(app, t.knockout, () => 'a');
  assert.ok(f('bracketChampion')(t.knockout));

  let real = 0;
  t.pods.forEach((p) => p.bracket.rounds.forEach((r) => r.forEach((m) => { if (!m.bye && m.winnerId) real++; })));
  t.knockout.rounds.forEach((r) => r.forEach((m) => { if (!m.bye && m.winnerId) real++; }));
  assert.equal(real, 539);   // 540 players: 476 group matches + 63 Finals matches

  const view = JSON.stringify(toPublicView(JSON.parse(JSON.stringify(t))));
  assert.ok(view.length < 400 * 1024, 'public view is ' + Math.round(view.length / 1024) + ' KB');
  assert.doesNotThrow(() => { f('podsStage6')(); f('podsStage7')(); });
});

test('club separation at 540 players stays under a second and leaves no avoidable same-club pairs', () => {
  [40, 150].forEach((clubs) => {
    const t = makeTournament(app, 540, { pods: 64, seeding: true, numSeeds: 64, orgSplit: true, orgOf: (i) => 'club' + (i % clubs), boards: 64 });
    useState(app, t);
    const draw = ms(() => f('generatePods')(t, seededRng(11)));
    assert.equal(draw.r.ok, true);
    assert.ok(draw.took < 1000, clubs + ' clubs: draw took ' + draw.took + 'ms');
    const pairs = t.pods.reduce((s, p) => s + f('podsClashPairs')(t, p.entryIds), 0);
    assert.equal(pairs, 0, clubs + ' clubs: ' + pairs + ' same-club pairs left');
  });
});

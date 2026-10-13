const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, plain, useState, seededRng, makeTournament, play, playOut } = require('./lib/helpers');
const lv = require('../viewer/api/_lib/listView');
const cfg = require('../viewer/api/_lib/listConfig');
const { toPublicView } = require('../viewer/api/_lib/publicView');

const app = loadApp(); app.persist = () => {}; app.render = () => {};
const NOW = Date.UTC(2026, 9, 13, 12, 0, 0), HOUR = 3600000, DAY = 86400000;
const ITEM_KEYS = ['date', 'entries', 'event', 'format', 'slug', 'start', 'tournament', 'unit', 'updatedAt'];

const row = (t, ageMs, slug) => ({ slug: slug || 'abcdefgh1234', data: plain(t), updated_at: new Date(NOW - (ageMs || 0)).toISOString() });
function decorate(t, o) {
  o = o || {};
  t.published = true; t.listed = o.listed !== false; t.publicSlug = 'abcdefgh1234';
  t.eventCreation.tournamentName = o.tournament || 'Sample Open'; t.eventCreation.eventName = o.event || 'Sample Singles';
  t.eventCreation.date = o.date === undefined ? '2026-10-13' : o.date; t.eventCreation.competitionUnit = 'Singles';
  return t;
}
function blank(type, n) {
  const t = run(app, 'blankTournament')(); useState(app, t);
  t.format.formatType = type; t.format.bestOfLegs = 5;
  t.entriesList = Array.from({ length: n }, (_, i) => ({ id: 'e' + i, name: 'Player ' + (i + 1), org: '', players: [], withdrawn: false }));
  return decorate(t);
}
function knockoutEvent(n, type) {
  const t = blank(type || 'knockout', n);
  t.knockout = run(app, 'generateBracket')(t.entriesList.map((e) => ({ entryId: e.id, org: '' })), 'Bracket');
  return t;
}
function rrEvent(n) {
  const t = blank('roundrobin', n); t.format.maxPerGroup = 4;
  run(app, 'buildGroups')(t); t.groups.forEach((g) => { g.confirmed = true; });
  return t;
}
function podEvent(n, pods) {
  const t = makeTournament(app, n, { pods, boards: pods }); useState(app, t);
  run(app, 'generatePods')(t, seededRng(3)); run(app, 'podsConfirmAll')(t);
  return decorate(t);
}
function playAll(g) { g.gameStarted = true; run(app, 'groupMatches')(g).forEach(([a, b]) => run(app, 'setScore')(g, a, b, 3, 1)); }

test('an unstarted event with a date today is upcoming, with only the allow-listed keys', () => {
  const t = knockoutEvent(8); t.format.anticipatedStartTime = '19:00';
  t.eventCreation.contact = 'SECRET CONTACT'; t.incidents = [{ description: 'SECRET INCIDENT' }]; t.entriesList.forEach((e) => { e.phone = 'SECRET PHONE'; });
  const r = lv.describe(row(t), NOW);
  assert.equal(r.status, 'upcoming');
  assert.deepEqual(Object.keys(r.item).sort(), ITEM_KEYS);
  assert.equal(r.item.slug, 'abcdefgh1234'); assert.equal(r.item.event, 'Sample Singles'); assert.equal(r.item.tournament, 'Sample Open');
  assert.equal(r.item.date, '2026-10-13'); assert.equal(r.item.start, '19:00'); assert.equal(r.item.format, 'knockout');
  assert.equal(r.item.unit, 'Singles'); assert.equal(r.item.entries, 8);
  assert.ok(!JSON.stringify(r.item).includes('SECRET'));
});

test('a start time that is not HH:MM, a bad date and an unknown unit are dropped, not passed through', () => {
  const t = knockoutEvent(8); t.format.anticipatedStartTime = '25:99'; t.eventCreation.date = 'next Tuesday'; t.eventCreation.competitionUnit = '<b>x</b>';
  const r = lv.describe(row(t), NOW);
  assert.equal(r.item.start, ''); assert.equal(r.item.date, ''); assert.equal(r.item.unit, 'Singles');
});

test('withdrawn entries are not counted; names are trimmed and capped; hostile names stay plain text', () => {
  const t = knockoutEvent(8); t.entriesList[0].withdrawn = true;
  t.eventCreation.eventName = '  <script>alert(1)</script>' + 'x'.repeat(300); t.eventCreation.tournamentName = '';
  const r = lv.describe(row(t), NOW);
  assert.equal(r.item.entries, 7);
  assert.equal(r.item.event.length, 120); assert.ok(r.item.event.startsWith('<script>'));
  assert.equal(r.item.tournament, '');
  t.eventCreation.eventName = ''; assert.equal(lv.describe(row(t), NOW).item.event, 'Untitled event');
});

test('every format is live once a result exists and results once it has finished, with the winner where there is one', () => {
  // knockout
  let t = knockoutEvent(8); play(t.knockout.rounds[0][0], 'a');
  assert.equal(lv.describe(row(t), NOW).status, 'live');
  playOut(app, t.knockout, () => 'a');
  const champName = (b) => t.entriesList.find((e) => e.id === b.rounds[b.rounds.length - 1][0].winnerId).name;
  let r = lv.describe(row(t), NOW);
  assert.equal(r.status, 'results'); assert.ok(champName(t.knockout)); assert.equal(r.item.winner, champName(t.knockout));
  assert.deepEqual(Object.keys(r.item).sort(), ITEM_KEYS.concat('winner').sort());
  // round robin then knockout: the main bracket decides
  t = knockoutEvent(8, 'rrknockout'); play(t.knockout.rounds[0][0], 'a');
  assert.equal(lv.describe(row(t), NOW).status, 'live');
  playOut(app, t.knockout, () => 'a');
  assert.equal(lv.describe(row(t), NOW).status, 'results'); assert.equal(lv.describe(row(t), NOW).item.winner, champName(t.knockout));
  // round robin: finished when every confirmed group is complete, never a winner line
  t = rrEvent(8); run(app, 'setScore')(t.groups[0], t.groups[0].entryIds[0], t.groups[0].entryIds[1], 3, 0);
  assert.equal(lv.describe(row(t), NOW).status, 'live');
  t.groups.forEach(playAll);
  r = lv.describe(row(t), NOW); assert.equal(r.status, 'results'); assert.equal(r.item.winner, '');
  // Group Boards: the Finals decide
  t = podEvent(12, 3); play(t.pods[0].bracket.rounds[0][0], 'a');
  assert.equal(lv.describe(row(t), NOW).status, 'live');
});

test('an event with groups but no result yet is upcoming, and a round robin with all groups unconfirmed is not live', () => {
  const t = rrEvent(8); assert.equal(lv.describe(row(t), NOW).status, 'upcoming');
  t.groups.forEach((g) => { g.confirmed = false; });
  assert.equal(lv.describe(row(t), NOW).status, 'upcoming');
});

test('a Group Boards Finals with no champion or a void final counts as finished', () => {
  const t = podEvent(12, 3);
  t.knockout.rounds[t.knockout.rounds.length - 1][0].void = true;
  assert.equal(lv.describe(row(t), NOW).status, 'results');
  assert.equal(lv.describe(row(t), NOW).item.winner, '');
});

test('time boundaries: live 48 hours, results 7 days, upcoming yesterday, undated 8 days', () => {
  const live = knockoutEvent(8); play(live.knockout.rounds[0][0], 'a');
  assert.equal(lv.describe(row(live, cfg.LIVE_STALE_HOURS * HOUR), NOW).status, 'live');
  assert.equal(lv.describe(row(live, cfg.LIVE_STALE_HOURS * HOUR + 1000), NOW).status, null);
  const done = knockoutEvent(8); playOut(app, done.knockout, () => 'a');
  assert.equal(lv.describe(row(done, cfg.RESULTS_DAYS * DAY), NOW).status, 'results');
  assert.equal(lv.describe(row(done, cfg.RESULTS_DAYS * DAY + 1000), NOW).status, null);
  const soon = knockoutEvent(8);
  soon.eventCreation.date = '2026-10-12'; assert.equal(lv.describe(row(soon), NOW).status, 'upcoming');   // yesterday
  soon.eventCreation.date = '2026-10-11'; assert.equal(lv.describe(row(soon), NOW).status, null);          // the day before
  soon.eventCreation.date = '2026-12-25'; assert.equal(lv.describe(row(soon), NOW).status, 'upcoming');
  soon.eventCreation.date = '';
  assert.equal(lv.describe(row(soon, 7 * DAY), NOW).status, 'upcoming');
  assert.equal(lv.describe(row(soon, 9 * DAY), NOW).status, null);
});

test('describe refuses anything not listed, an unusable slug, an unknown format, and a bad timestamp', () => {
  const t = knockoutEvent(8);
  t.listed = false; assert.equal(lv.describe(row(t), NOW).status, null);
  t.listed = 'true'; assert.equal(lv.describe(row(t), NOW).status, 'upcoming');          // a string 'true' (as jsonb text) is accepted
  delete t.listed; assert.equal(lv.describe(row(t), NOW).status, null);
  t.listed = true;
  assert.equal(lv.describe(row(t, 0, 'bad slug!'), NOW).status, null);
  assert.equal(lv.describe(row(t, 0, 'short'), NOW).status, null);
  t.format.formatType = 'darts-bingo'; assert.equal(lv.describe(row(t), NOW).status, null);
  t.format.formatType = 'knockout';
  const r = row(t); r.updated_at = 'garbage'; assert.equal(lv.describe(r, NOW).status, null);
  assert.equal(lv.describe(null, NOW).status, null); assert.equal(lv.describe({ slug: 'abcdefgh1234' }, NOW).status, null);
});

test('buildList sorts, caps and stamps the time; the public view never carries the flag', () => {
  const rows = [];
  for (let i = 0; i < 3; i++) { const t = knockoutEvent(8); t.eventCreation.eventName = 'Live ' + i; play(t.knockout.rounds[0][0], 'a'); rows.push(row(t, (3 - i) * HOUR, 'livelive000' + i)); }
  [['2026-10-20', '', 'B'], ['2026-10-20', '09:00', 'A'], ['2026-10-14', '', 'C'], ['', '', 'Z']].forEach(([date, start, name], i) => {
    const t = knockoutEvent(8); t.eventCreation.date = date; t.eventCreation.eventName = name; t.format.anticipatedStartTime = start; rows.push(row(t, 0, 'soonsoon000' + i));
  });
  const out = lv.buildList(rows, NOW);
  assert.equal(out.generatedAt, new Date(NOW).toISOString());
  assert.deepEqual(out.live.map((x) => x.event), ['Live 2', 'Live 1', 'Live 0']);                 // newest save first
  assert.deepEqual(out.upcoming.map((x) => x.event), ['C', 'A', 'B', 'Z']);                         // date, then start time, then name; undated last
  assert.deepEqual(out.results, []);
  const many = Array.from({ length: cfg.MAX_PER_LIST + 5 }, (_, i) => row(knockoutEvent(8), 0, 'many' + String(i).padStart(8, '0')));
  assert.equal(lv.buildList(many, NOW).upcoming.length, cfg.MAX_PER_LIST);
  assert.deepEqual(lv.buildList([], NOW), { generatedAt: new Date(NOW).toISOString(), live: [], upcoming: [], results: [] });
  assert.deepEqual(lv.buildList(null, NOW).live, []);
  assert.ok(!('listed' in toPublicView(JSON.parse(JSON.stringify(knockoutEvent(8))))));
});

const progressOf = (t) => lv.describe(row(t), NOW).item.progress;

test('progress: round robin counts every match of every confirmed group', () => {
  const t = rrEvent(12);
  run(app, 'setScore')(t.groups[0], t.groups[0].entryIds[0], t.groups[0].entryIds[1], 3, 0);
  run(app, 'setScore')(t.groups[1], t.groups[1].entryIds[0], t.groups[1].entryIds[1], 3, 0);
  assert.deepEqual(plain(progressOf(t)), { stage: 'Group stage', done: 2, total: 18 });
  t.groups[2].confirmed = false;
  assert.deepEqual(plain(progressOf(t)), { stage: 'Group stage', done: 2, total: 12 });
});

test('progress: a knockout shows its current round, and moves to the next round only when this one is done', () => {
  const t = knockoutEvent(8);
  play(t.knockout.rounds[0][0], 'a'); play(t.knockout.rounds[0][1], 'a');
  assert.deepEqual(plain(progressOf(t)), { stage: 'Quarterfinals', done: 2, total: 4 });
  play(t.knockout.rounds[0][2], 'a'); play(t.knockout.rounds[0][3], 'a'); run(app, 'propagateByes')(t.knockout.rounds);
  assert.deepEqual(plain(progressOf(t)), { stage: 'Semifinals', done: 0, total: 2 });
  const big = knockoutEvent(16); play(big.knockout.rounds[0][0], 'a');
  assert.deepEqual(plain(progressOf(big)), { stage: 'Round of 16', done: 1, total: 8 });
});

test('progress: byes and void matches are not counted, and a bracket of 6 has two byes', () => {
  const t = knockoutEvent(6);
  const real = t.knockout.rounds[0].filter((m) => !m.bye).length;
  play(t.knockout.rounds[0].find((m) => !m.bye), 'a');
  assert.deepEqual(plain(progressOf(t)), { stage: 'Quarterfinals', done: 1, total: real });
  const v = knockoutEvent(8); v.knockout.rounds[0][0].void = true; run(app, 'propagateByes')(v.knockout.rounds);
  assert.equal(progressOf(v).total, 3);
});

test('progress: round robin then knockout stays in the group stage until every group is complete', () => {
  const t = rrEvent(8); t.format.formatType = 'rrknockout';
  run(app, 'setScore')(t.groups[0], t.groups[0].entryIds[0], t.groups[0].entryIds[1], 3, 0);
  assert.deepEqual(plain(progressOf(t)), { stage: 'Group stage', done: 1, total: 12 });
  t.groups.forEach(playAll);
  t.knockout = run(app, 'generateBracket')(t.entriesList.slice(0, 4).map((e) => ({ entryId: e.id, org: '' })), 'Bracket');
  play(t.knockout.rounds[0][0], 'a');
  assert.deepEqual(plain(progressOf(t)), { stage: 'Semifinals', done: 1, total: 2 });
  const noBracket = rrEvent(8); noBracket.format.formatType = 'rrknockout'; noBracket.groups.forEach(playAll);   // groups done, bracket not made yet
  assert.deepEqual(plain(progressOf(noBracket)), { stage: 'Group stage', done: 12, total: 12 });
});

test('progress: Group Boards shows the group stage, then the Finals once every group is finished or the Finals has started', () => {
  const t = podEvent(12, 3);
  play(t.pods[0].bracket.rounds[0][0], 'a');
  assert.deepEqual(plain(progressOf(t)), { stage: 'Group stage', done: 1, total: 9 });
  t.pods.forEach((p) => { playOut(app, p.bracket, () => 'a'); });
  run(app, 'syncFinalsFromPods')(t);
  const p = progressOf(t);
  assert.ok(p.stage.startsWith('Finals · '), p.stage);
  assert.ok(p.done <= p.total && p.total > 0);
});

test('progress: groups of one or two, an empty group and a bracket with nothing real give null or sensible counts, never NaN or negatives', () => {
  const t = rrEvent(5);                       // groups of 3 and 2
  t.groups[0].gameStarted = true; run(app, 'setScore')(t.groups[0], t.groups[0].entryIds[0], t.groups[0].entryIds[1], 3, 0);
  const p = progressOf(t); assert.ok(p.total >= p.done && p.done >= 0 && Number.isFinite(p.total));
  const empty = rrEvent(8); empty.groups.forEach((g) => { g.entryIds = []; g.scores = {}; });
  assert.equal(lv.describe(row(empty), NOW).status, 'upcoming');            // nothing started, nothing to count
});

test('only live events carry progress, and the counts never go backwards within a stage', () => {
  const up = knockoutEvent(8); assert.ok(!('progress' in lv.describe(row(up), NOW).item));
  const done = knockoutEvent(8); playOut(app, done.knockout, () => 'a'); assert.ok(!('progress' in lv.describe(row(done), NOW).item));
  const t = knockoutEvent(16); let last = -1;
  t.knockout.rounds[0].forEach((m) => { play(m, 'a'); const p = progressOf(t); if (p.stage === 'Round of 16') { assert.ok(p.done > last); last = p.done; } });
});

test('describe only accepts real strings for the date, start time and slug', () => {
  const t = knockoutEvent(8);
  t.eventCreation.date = ['2026-10-13']; t.format.anticipatedStartTime = ['19:00'];
  const r = lv.describe(row(t), NOW);
  assert.equal(r.status, 'upcoming'); assert.equal(r.item.date, ''); assert.equal(r.item.start, '');
  t.eventCreation.date = '2026-10-13';
  const bad = row(t); bad.slug = ['abcdefgh1234'];
  assert.equal(lv.describe(bad, NOW).status, null);
});

test('one malformed row does not break the whole list', () => {
  const bad = knockoutEvent(8); bad.entriesList = 'oops'; bad.groups = 5;
  const good = knockoutEvent(8); good.eventCreation.eventName = 'Good one';
  assert.throws(() => lv.describe(row(bad), NOW));            // the bad row really does throw in describe
  const out = lv.buildList([row(bad, 0, 'badbadbad000'), row(good, 0, 'goodgood0000')], NOW);
  assert.deepEqual(out.upcoming.map((x) => x.event), ['Good one']);
});

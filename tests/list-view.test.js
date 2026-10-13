const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, plain, useState, seededRng, makeTournament, play, playOut } = require('./lib/helpers');
const lv = require('../viewer/api/_lib/listView');
const cfg = require('../viewer/api/_lib/listConfig');
const { toPublicView } = require('../viewer/api/_lib/publicView');

const app = loadApp(); app.persist = () => {}; app.render = () => {};
const NOW = Date.UTC(2026, 9, 13, 12, 0, 0), HOUR = 3600000, DAY = 86400000;
const ITEM_KEYS = ['date', 'entries', 'event', 'format', 'slug', 'stages', 'start', 'tournament', 'unit', 'updatedAt'];

// Results need the organiser's finalize: a finished event is only a result once data.finalized.at is set (an hour before NOW unless told).
const fin = (t, agoMs) => { t.finalized = { at: new Date(NOW - (agoMs === undefined ? HOUR : agoMs)).toISOString() }; return t; };
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
  assert.equal(lv.describe(row(t), NOW).status, 'live');   // every match played, but not finalized: still live
  fin(t);
  const champName = (b) => t.entriesList.find((e) => e.id === b.rounds[b.rounds.length - 1][0].winnerId).name;
  let r = lv.describe(row(t), NOW);
  assert.equal(r.status, 'results'); assert.ok(champName(t.knockout)); assert.equal(r.item.winner, champName(t.knockout));
  assert.deepEqual(Object.keys(r.item).sort(), ITEM_KEYS.concat('winner').sort());
  // round robin then knockout: the main bracket decides
  t = knockoutEvent(8, 'rrknockout'); play(t.knockout.rounds[0][0], 'a');
  assert.equal(lv.describe(row(t), NOW).status, 'live');
  playOut(app, t.knockout, () => 'a'); fin(t);
  assert.equal(lv.describe(row(t), NOW).status, 'results'); assert.equal(lv.describe(row(t), NOW).item.winner, champName(t.knockout));
  // round robin: finished when every confirmed group is complete, never a winner line
  t = rrEvent(8); run(app, 'setScore')(t.groups[0], t.groups[0].entryIds[0], t.groups[0].entryIds[1], 3, 0);
  assert.equal(lv.describe(row(t), NOW).status, 'live');
  t.groups.forEach(playAll); fin(t);
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
  assert.equal(lv.describe(row(t), NOW).status, 'live');
  fin(t);
  assert.equal(lv.describe(row(t), NOW).status, 'results');
  assert.equal(lv.describe(row(t), NOW).item.winner, '');
});

test('time boundaries: live 48 hours, results 7 days, upcoming yesterday, undated 8 days', () => {
  const live = knockoutEvent(8); play(live.knockout.rounds[0][0], 'a');
  assert.equal(lv.describe(row(live, cfg.LIVE_STALE_HOURS * HOUR), NOW).status, 'live');
  assert.equal(lv.describe(row(live, cfg.LIVE_STALE_HOURS * HOUR + 1000), NOW).status, null);
  const done = knockoutEvent(8); playOut(app, done.knockout, () => 'a');
  fin(done, cfg.RESULTS_DAYS * DAY);                                                  // results are timed from finalizing, not from the last save
  assert.equal(lv.describe(row(done), NOW).status, 'results');
  fin(done, cfg.RESULTS_DAYS * DAY + 1000);
  assert.equal(lv.describe(row(done), NOW).status, null);
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
  assert.deepEqual(plain(progressOf(noBracket)), { stage: 'Group stage', done: 12, total: 12, next: 'Knockout draw next' });   // the gap before the draw says what comes next
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

test('progress: "next" appears only between stages: every group played and no knockout draw, or every pod finished and no Finals', () => {
  const rr = rrEvent(8); rr.format.formatType = 'rrknockout';
  run(app, 'setScore')(rr.groups[0], rr.groups[0].entryIds[0], rr.groups[0].entryIds[1], 3, 0);
  assert.ok(!('next' in progressOf(rr)));                                        // groups still being played
  rr.groups.forEach(playAll);
  assert.deepEqual(plain(progressOf(rr)), { stage: 'Group stage', done: 12, total: 12, next: 'Knockout draw next' });
  rr.knockout = run(app, 'generateBracket')(rr.entriesList.slice(0, 4).map((e) => ({ entryId: e.id, org: '' })), 'Bracket');
  assert.ok(!('next' in progressOf(rr)));                                        // bracket drawn: no longer in the gap
  play(rr.knockout.rounds[0][0], 'a');
  assert.ok(!('next' in progressOf(rr)));
  const plainRr = rrEvent(8); plainRr.groups.forEach(playAll);                   // round robin alone: all played is not a result until finalized
  assert.equal(lv.describe(row(plainRr), NOW).status, 'live');
  assert.equal(lv.describe(row(fin(plainRr)), NOW).status, 'results');
  const t = podEvent(12, 3);
  play(t.pods[0].bracket.rounds[0][0], 'a');
  assert.ok(!('next' in progressOf(t)));
  const finals = t.knockout; t.knockout = null;                                   // the Finals bracket is not built yet
  t.pods.forEach((p) => { playOut(app, p.bracket, () => 'a'); });                // every group finished
  assert.equal(lv.describe(row(t), NOW).status, 'live');
  assert.deepEqual(plain(progressOf(t)), { stage: 'Group stage', done: 9, total: 9, next: 'Finals next' });
  assert.deepEqual(Object.keys(lv.describe(row(t), NOW).item).sort(), ITEM_KEYS.concat('progress').sort());     // the item's own keys do not change; only progress may carry next
  assert.deepEqual(Object.keys(progressOf(t)).sort(), ['done', 'next', 'stage', 'total']);
  t.knockout = finals; run(app, 'syncFinalsFromPods')(t);                        // Finals built
  assert.ok(!('next' in progressOf(t)));
  const k = knockoutEvent(8); play(k.knockout.rounds[0][0], 'a');
  assert.ok(!('next' in progressOf(k)));
  assert.deepEqual(Object.keys(progressOf(k)).sort(), ['done', 'stage', 'total']);
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

// ---- stages: one entry per stage of the event, with fixed enum states and integer counts ----
const stagesOf = (t, ageMs) => plain(lv.describe(row(t, ageMs), NOW).item.stages);
const STAGE_KEYS = ['advance', 'done', 'groups', 'key', 'round', 'state', 'total'];
const STAGE_STATES = { groups: ['notstarted', 'live', 'done'], knockout: ['waiting', 'next', 'ready', 'live', 'done'], finals: ['waiting', 'next', 'ready', 'live', 'done'] };
function checkStages(list) {
  assert.ok(Array.isArray(list) && list.length >= 1 && list.length <= 2);
  list.forEach((s) => {
    Object.keys(s).forEach((k) => assert.ok(STAGE_KEYS.includes(k), 'unexpected key ' + k));
    assert.ok(Object.keys(STAGE_STATES).includes(s.key)); assert.ok(STAGE_STATES[s.key].includes(s.state), s.key + ' ' + s.state);
    ['done', 'total'].forEach((k) => assert.ok(Number.isInteger(s[k]) && s[k] >= 0, k));
    assert.ok(s.done <= s.total, 'done <= total');
    if ('groups' in s) { assert.equal(s.key, 'groups'); assert.ok(Number.isInteger(s.groups) && s.groups >= 0); }
    if ('round' in s) { assert.equal(s.state, 'live'); assert.notEqual(s.key, 'groups'); assert.equal(typeof s.round, 'string'); }
    if ('advance' in s) { assert.equal(s.key, 'knockout'); assert.ok(['waiting', 'next'].includes(s.state)); assert.ok(Number.isInteger(s.advance) && s.advance > 0); }
  });
}
const rrk = (n) => { const t = rrEvent(n); t.format.formatType = 'rrknockout'; return t; };
const bracketOf = (t, n) => run(app, 'generateBracket')(t.entriesList.slice(0, n).map((e) => ({ entryId: e.id, org: '' })), 'Bracket');

test('stages: the item key allow-list now includes stages, for all three statuses', () => {
  const up = lv.describe(row(knockoutEvent(8)), NOW);
  assert.deepEqual(Object.keys(up.item).sort(), ITEM_KEYS.slice().sort());
  const live = knockoutEvent(8); play(live.knockout.rounds[0][0], 'a');
  assert.deepEqual(Object.keys(lv.describe(row(live), NOW).item).sort(), ITEM_KEYS.concat('progress').sort());
  const done = knockoutEvent(8); playOut(app, done.knockout, () => 'a'); fin(done);
  assert.deepEqual(Object.keys(lv.describe(row(done), NOW).item).sort(), ITEM_KEYS.concat('winner').sort());
  assert.equal(lv.describe(row(live), NOW).item.progress.stage, 'Quarterfinals');   // progress is untouched
});

test('stages: a plain round robin has one groups stage: notstarted, live, done', () => {
  const t = rrEvent(12);
  let s = stagesOf(t); checkStages(s);
  assert.deepEqual(s, [{ key: 'groups', state: 'notstarted', done: 0, total: 18, groups: 3 }]);
  run(app, 'setScore')(t.groups[0], t.groups[0].entryIds[0], t.groups[0].entryIds[1], 3, 0);
  s = stagesOf(t); checkStages(s);
  assert.deepEqual(s, [{ key: 'groups', state: 'live', done: 1, total: 18, groups: 3 }]);
  t.groups[2].confirmed = false;
  assert.deepEqual(stagesOf(t), [{ key: 'groups', state: 'live', done: 1, total: 12, groups: 2 }]);
  t.groups[2].confirmed = true; t.groups.forEach(playAll);
  s = stagesOf(t); checkStages(s);
  assert.deepEqual(s, [{ key: 'groups', state: 'done', done: 18, total: 18, groups: 3 }]);
});

test('stages: a plain knockout has one stage: next with no bracket, ready, live with its round, done', () => {
  const t = knockoutEvent(8);
  const bracket = t.knockout; t.knockout = null;
  assert.deepEqual(stagesOf(t), [{ key: 'knockout', state: 'next', done: 0, total: 0 }]);
  t.knockout = bracket;
  let s = stagesOf(t); checkStages(s);
  assert.deepEqual(s, [{ key: 'knockout', state: 'ready', done: 0, total: 0 }]);
  play(t.knockout.rounds[0][0], 'a'); play(t.knockout.rounds[0][1], 'a');
  s = stagesOf(t); checkStages(s);
  assert.deepEqual(s, [{ key: 'knockout', state: 'live', done: 2, total: 4, round: 'Quarterfinals' }]);
  playOut(app, t.knockout, () => 'a');
  s = stagesOf(t); checkStages(s);
  assert.deepEqual(s, [{ key: 'knockout', state: 'done', done: 7, total: 7 }]);
  const six = knockoutEvent(6); playOut(app, six.knockout, () => 'a');          // byes are not counted
  assert.deepEqual(stagesOf(six), [{ key: 'knockout', state: 'done', done: 5, total: 5 }]);
});

test('stages: a knockout whose current round moves on reports that round', () => {
  const t = knockoutEvent(8);
  t.knockout.rounds[0].forEach((m) => play(m, 'a')); run(app, 'propagateByes')(t.knockout.rounds);
  assert.deepEqual(stagesOf(t), [{ key: 'knockout', state: 'live', done: 0, total: 2, round: 'Semifinals' }]);
});

test('stages: round robin then knockout goes waiting, next, ready, live, done', () => {
  const t = rrk(8);
  let s = stagesOf(t); checkStages(s);
  assert.deepEqual(s, [{ key: 'groups', state: 'notstarted', done: 0, total: 12, groups: 2 }, { key: 'knockout', state: 'waiting', done: 0, total: 0, advance: 4 }]);
  t.format.qualifiersPerGroup = '3'; assert.equal(stagesOf(t)[1].advance, 6);
  t.format.qualifiersPerGroup = 9; assert.equal(stagesOf(t)[1].advance, 8);           // never more than the group holds
  t.format.qualifiersPerGroup = 'junk'; assert.equal(stagesOf(t)[1].advance, 4);      // default 2 per group
  t.format.qualifiersPerGroup = 0; assert.equal(stagesOf(t)[1].advance, 4);           // 0 is not a number the organiser can mean: default
  t.format.qualifiersPerGroup = -3; assert.equal(stagesOf(t)[1].advance, 2);          // at least 1 per group
  t.format.qualifiersPerGroup = 2;
  run(app, 'setScore')(t.groups[0], t.groups[0].entryIds[0], t.groups[0].entryIds[1], 3, 0);
  s = stagesOf(t); checkStages(s);
  assert.deepEqual(s, [{ key: 'groups', state: 'live', done: 1, total: 12, groups: 2 }, { key: 'knockout', state: 'waiting', done: 0, total: 0, advance: 4 }]);
  t.groups.forEach(playAll);
  s = stagesOf(t); checkStages(s);
  assert.deepEqual(s, [{ key: 'groups', state: 'done', done: 12, total: 12, groups: 2 }, { key: 'knockout', state: 'next', done: 0, total: 0, advance: 4 }]);
  t.knockout = bracketOf(t, 4);                                                       // drawn, untouched
  s = stagesOf(t); checkStages(s);
  assert.deepEqual(s, [{ key: 'groups', state: 'done', done: 12, total: 12, groups: 2 }, { key: 'knockout', state: 'ready', done: 0, total: 0 }]);
  play(t.knockout.rounds[0][0], 'a');
  s = stagesOf(t); checkStages(s);
  assert.deepEqual(s[1], { key: 'knockout', state: 'live', done: 1, total: 2, round: 'Semifinals' });
  playOut(app, t.knockout, () => 'a');
  s = stagesOf(t); checkStages(s);
  assert.deepEqual(s, [{ key: 'groups', state: 'done', done: 12, total: 12, groups: 2 }, { key: 'knockout', state: 'done', done: 3, total: 3 }]);
});

test('stages: Group Boards goes groups live with finals waiting, finals next, finals live, finals done', () => {
  const t = podEvent(12, 3);
  const finals = t.knockout; t.knockout = null;
  let s = stagesOf(t); checkStages(s);
  assert.deepEqual(s, [{ key: 'groups', state: 'notstarted', done: 0, total: 9, groups: 3 }, { key: 'finals', state: 'waiting', done: 0, total: 0 }]);
  play(t.pods[0].bracket.rounds[0][0], 'a');
  s = stagesOf(t); checkStages(s);
  assert.deepEqual(s, [{ key: 'groups', state: 'live', done: 1, total: 9, groups: 3 }, { key: 'finals', state: 'waiting', done: 0, total: 0 }]);
  t.pods.forEach((p) => { playOut(app, p.bracket, () => 'a'); });
  s = stagesOf(t); checkStages(s);
  assert.deepEqual(s, [{ key: 'groups', state: 'done', done: 9, total: 9, groups: 3 }, { key: 'finals', state: 'next', done: 0, total: 0 }]);
  t.knockout = finals; run(app, 'syncFinalsFromPods')(t);                             // built, no result yet
  s = stagesOf(t); checkStages(s);
  assert.equal(s[1].state, 'next');
  const m = t.knockout.rounds[0].find((x) => x.aEntryId && x.bEntryId && !x.bye); play(m, 'a');
  s = stagesOf(t); checkStages(s);
  assert.equal(s[0].state, 'done'); assert.equal(s[1].state, 'live'); assert.equal(s[1].key, 'finals');
  assert.equal(typeof s[1].round, 'string'); assert.ok(s[1].total > 0 && s[1].done < s[1].total);
  playOut(app, t.knockout, () => 'a');
  s = stagesOf(t); checkStages(s);
  assert.equal(s[1].state, 'done'); assert.equal(s[1].done, s[1].total); assert.ok(s[1].total > 0);
});

test('stages: the Group Boards groups stage counts only confirmed pods', () => {
  const t = podEvent(12, 3);
  t.pods[2].confirmed = false;
  const s = stagesOf(t); checkStages(s);
  assert.equal(s[0].groups, 2); assert.equal(s[0].total, 6);
});

test('stages: nothing in a stage comes from tournament text', () => {
  const t = rrk(8); t.eventCreation.eventName = 'SECRET-NAME'; t.entriesList.forEach((e) => { e.name = 'SECRET-PLAYER'; });
  t.knockout = bracketOf(t, 4); play(t.knockout.rounds[0][0], 'a');
  assert.ok(!JSON.stringify(stagesOf(t)).includes('SECRET'));
});

test('stages: degenerate events give sensible stages, never NaN, negatives or a throw', () => {
  const empty = rrk(8); empty.groups.forEach((g) => { g.entryIds = []; g.scores = {}; });
  let s = stagesOf(empty); checkStages(s);
  assert.deepEqual(s, [{ key: 'groups', state: 'notstarted', done: 0, total: 0, groups: 2 }, { key: 'knockout', state: 'waiting', done: 0, total: 0 }]);
  const none = knockoutEvent(8, 'rrknockout'); none.entriesList = [];
  s = stagesOf(none); checkStages(s); assert.equal(s[0].groups, 0);
  const noGroups = rrEvent(8); noGroups.groups.forEach((g) => { g.confirmed = false; });
  s = stagesOf(noGroups); checkStages(s); assert.deepEqual(s, [{ key: 'groups', state: 'notstarted', done: 0, total: 0, groups: 0 }]);
  const pod = podEvent(12, 3); pod.pods.forEach((p) => { p.bracket = { rounds: [] }; }); pod.knockout = null;
  s = stagesOf(pod); checkStages(s);
  assert.deepEqual(s, [{ key: 'groups', state: 'notstarted', done: 0, total: 0, groups: 3 }, { key: 'finals', state: 'waiting', done: 0, total: 0 }]);
  pod.pods.forEach((p) => { p.confirmed = false; });
  assert.deepEqual(stagesOf(pod), [{ key: 'groups', state: 'notstarted', done: 0, total: 0, groups: 0 }, { key: 'finals', state: 'waiting', done: 0, total: 0 }]);
  const emptyKo = knockoutEvent(8); emptyKo.knockout = { rounds: [] };
  assert.deepEqual(stagesOf(emptyKo), [{ key: 'knockout', state: 'next', done: 0, total: 0 }]);
  // odd shapes handed straight to stagesOf
  assert.doesNotThrow(() => lv.stagesOf({ groups: [], pods: [], format: null }, { type: 'rrknockout', groups: [], groupsDone: false, pods: [], main: null }, 'upcoming'));
  const odd = lv.stagesOf({}, { type: 'knockout', groups: [], pods: [], main: { rounds: [null, 5, [null]] } }, 'live');
  checkStages(plain(odd));
});

test('stages: the overall status is decided as before for a round robin then knockout', () => {
  const t = rrk(8); assert.equal(lv.describe(row(t), NOW).status, 'upcoming');
  t.groups.forEach(playAll); assert.equal(lv.describe(row(t), NOW).status, 'live');       // groups played, knockout not drawn
  t.knockout = bracketOf(t, 4); playOut(app, t.knockout, () => 'a');
  assert.equal(lv.describe(row(t), NOW).status, 'live');                                     // all played, not finalized
  fin(t); assert.equal(lv.describe(row(t), NOW).status, 'results');
  assert.equal(lv.describe(row(fin(t, 8 * DAY)), NOW).status, null);                         // finalized too long ago: not listed at all
});

// ---- a later stage that has results means the groups stage is over, whatever the group scores say ----
test('stages: a knockout drawn early (a group result missing) forces the groups stage to done, with honest counts', () => {
  const t = rrk(8); t.groups.forEach(playAll);
  delete t.groups[1].scores[Object.keys(t.groups[1].scores)[0]];                        // one match never entered
  let s = stagesOf(t); checkStages(s);
  assert.deepEqual(s[0], { key: 'groups', state: 'live', done: 11, total: 12, groups: 2 });   // no bracket yet: still live
  t.knockout = bracketOf(t, 4);
  s = stagesOf(t); checkStages(s);
  assert.equal(s[1].state, 'ready'); assert.equal(s[0].state, 'live');                  // a bracket with no result changes nothing
  play(t.knockout.rounds[0][0], 'a');
  s = stagesOf(t); checkStages(s);
  assert.deepEqual(s, [{ key: 'groups', state: 'done', done: 11, total: 12, groups: 2 }, { key: 'knockout', state: 'live', done: 1, total: 2, round: 'Semifinals' }]);
  playOut(app, t.knockout, () => 'a'); fin(t);
  assert.equal(lv.describe(row(t), NOW).status, 'results');
  s = stagesOf(t); checkStages(s);
  assert.deepEqual(s, [{ key: 'groups', state: 'done', done: 11, total: 12, groups: 2 }, { key: 'knockout', state: 'done', done: 3, total: 3 }]);
});

test('stages: a live knockout with no group result at all still shows the groups stage as done', () => {
  const t = rrk(8); t.knockout = bracketOf(t, 4); play(t.knockout.rounds[0][0], 'a');
  const s = stagesOf(t); checkStages(s);
  assert.deepEqual(s[0], { key: 'groups', state: 'done', done: 0, total: 12, groups: 2 });
  assert.equal(s[1].state, 'live');
});

test('stages: Group Boards with the Finals live and a pod unfinished shows the groups as done', () => {
  const t = podEvent(12, 3);
  assert.ok(t.knockout && t.knockout.podFinals);                                        // the Finals skeleton is present all along
  play(t.pods[0].bracket.rounds[0][0], 'a');                                            // pods not finished
  let s = stagesOf(t); checkStages(s);
  assert.deepEqual(s.map((x) => x.state), ['live', 'waiting']);                         // skeleton + unfinished pods: finals waiting
  const m = t.knockout.rounds[0].find((x) => !x.bye); m.aEntryId = 'e0'; m.bEntryId = 'e1'; play(m, 'a');
  s = stagesOf(t); checkStages(s);
  assert.equal(s[0].state, 'done'); assert.equal(s[0].groups, 3); assert.equal(s[0].total, 9); assert.equal(s[0].done, 1);
  assert.equal(s[1].key, 'finals'); assert.equal(s[1].state, 'live');
});

test('stages: Group Boards with the Finals skeleton present and the pods unfinished has finals waiting', () => {
  const t = podEvent(12, 3);
  assert.ok(t.knockout && t.knockout.podFinals);
  assert.deepEqual(stagesOf(t), [{ key: 'groups', state: 'notstarted', done: 0, total: 9, groups: 3 }, { key: 'finals', state: 'waiting', done: 0, total: 0 }]);
  t.pods.slice(0, 2).forEach((p) => { playOut(app, p.bracket, () => 'a'); });
  assert.equal(stagesOf(t)[1].state, 'waiting');                                         // two of three pods finished
  t.pods.forEach((p) => { playOut(app, p.bracket, () => 'a'); });
  assert.equal(stagesOf(t)[1].state, 'next');
});

test('stages: a void final is done, with no winner and done equal to total', () => {
  const t = knockoutEvent(8); play(t.knockout.rounds[0][0], 'a');
  t.knockout.rounds[t.knockout.rounds.length - 1][0].void = true; fin(t);
  const r = lv.describe(row(t), NOW);
  assert.equal(r.status, 'results'); assert.equal(r.item.winner, '');
  const s = plain(r.item.stages); checkStages(s);
  assert.equal(s.length, 1); assert.equal(s[0].state, 'done'); assert.equal(s[0].done, s[0].total); assert.ok(!('round' in s[0]));
});

test('stages: a group of one entry has no matches, never a negative or NaN, and still counts as a group', () => {
  const t = rrk(8); t.groups[0].entryIds = [t.groups[0].entryIds[0]]; t.groups[0].scores = {};
  let s = stagesOf(t); checkStages(s);
  assert.deepEqual(s, [{ key: 'groups', state: 'notstarted', done: 0, total: 6, groups: 2 }, { key: 'knockout', state: 'waiting', done: 0, total: 0, advance: 3 }]);
  playAll(t.groups[1]);
  s = stagesOf(t); checkStages(s);
  assert.deepEqual(s[0], { key: 'groups', state: 'done', done: 6, total: 6, groups: 2 });
  assert.equal(s[1].state, 'next');
});

// ---- a void in the Finals skeleton (a pod final voided by a double no-show) is not a Finals result ----
// The pod that feeds a seeded-bye Finals match plays its semifinals, then its final is voided (neither showed): that pod has no winner,
// so the Finals match it feeds is voided in the Finals skeleton. (A pod's final cannot be voided before its players are known.)
function voidPodFinal(t) {
  const fm = t.knockout.rounds[0].find((m) => !m.aFromPod !== !m.bFromPod), pod = t.pods.find((x) => x.id === (fm.aFromPod || fm.bFromPod));
  pod.bracket.rounds[0].forEach((m) => { if (!m.bye) play(m, 'a'); }); run(app, 'podsApplyResult')(t, pod, () => {});
  const last = pod.bracket.rounds[pod.bracket.rounds.length - 1][0];
  const r = run(app, 'podsApplyResult')(t, pod, () => { last.void = true; last.aLegs = null; last.bLegs = null; last.winnerId = null; last.wo = false; });
  assert.equal(r.ok, true); assert.ok(lv.finished(pod.bracket));
  return pod;
}

const finalsVoids = (t) => t.knockout.rounds.reduce((n, r) => n + r.filter((m) => m && m.void).length, 0);
const podsTotal = (t) => t.pods.reduce((n, p) => n + lv.counts(p.bracket).total, 0);
const podsDone = (t) => t.pods.reduce((n, p) => n + lv.counts(p.bracket).done, 0);

test('stages: a voided pod final alone does not make the Finals live or the groups done (12 players, 3 pods)', () => {
  const t = podEvent(12, 3);
  voidPodFinal(t);
  assert.ok(finalsVoids(t) > 0, 'the Finals skeleton now carries a void');
  const s = stagesOf(t); checkStages(s);
  assert.equal(s[0].state, 'live'); assert.equal(s[0].groups, 3); assert.equal(s[0].total, podsTotal(t)); assert.equal(s[0].done, podsDone(t)); assert.ok(s[0].done < s[0].total);
  assert.deepEqual(s[1], { key: 'finals', state: 'waiting', done: 0, total: 0 });
});

test('stages: a voided pod final alone does not make the Finals live or the groups done (20 players, 5 pods)', () => {
  const t = podEvent(20, 5);
  voidPodFinal(t);
  assert.ok(finalsVoids(t) > 0);
  const s = stagesOf(t); checkStages(s);
  assert.equal(s[0].state, 'live'); assert.equal(s[0].groups, 5); assert.ok(s[0].done < s[0].total);
  assert.deepEqual(s[1], { key: 'finals', state: 'waiting', done: 0, total: 0 });
});

test('stages: one real Finals result while a pod is unfinished makes the Finals live and the groups done', () => {
  const t = podEvent(12, 3);
  voidPodFinal(t);
  const m = t.knockout.rounds[0].find((x) => !x.bye && !x.void); m.aEntryId = 'e0'; m.bEntryId = 'e1'; play(m, 'a');
  const s = stagesOf(t); checkStages(s);
  assert.equal(s[0].state, 'done'); assert.equal(s[0].done, podsDone(t)); assert.equal(s[0].total, podsTotal(t));
  assert.equal(s[1].key, 'finals'); assert.equal(s[1].state, 'live');
});

test('stages: every pod finished with a void in the Finals but no real result gives Finals next and the groups done', () => {
  const t = podEvent(12, 3);
  const voided = voidPodFinal(t);
  t.pods.filter((p) => p !== voided).forEach((p) => { playOut(app, p.bracket, () => 'a'); run(app, 'podsApplyResult')(t, p, () => {}); });
  assert.ok(t.pods.every((p) => lv.finished(p.bracket))); assert.ok(finalsVoids(t) > 0);
  assert.ok(!t.knockout.rounds.some((r) => r.some((m) => m && m.winnerId && !m.bye)), 'no real Finals result yet');
  const s = stagesOf(t); checkStages(s);
  assert.equal(s[0].state, 'done');
  assert.deepEqual(s[1], { key: 'finals', state: 'next', done: 0, total: 0 });
});

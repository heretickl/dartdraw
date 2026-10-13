# Public home page and event list Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the viewer's bare address into a branded home page that lists the events organisers have opted in, with Live / Upcoming / Results tabs and a search box that also takes an event code.

**Architecture:** The opt-in flag is a `listed` boolean inside the tournament JSON, set by a new checkbox on the organiser's Public results card. A new read-only endpoint `GET /api/events` on the viewer project reads the existing `public_tournaments` view, classifies each listed event with pure functions (`listView.js`) and returns only an allow-listed summary. The home page is the viewer's `index.html` in its no-event state: it loads `home.js`/`home.css` and calls `showHome()` when there is no slug. No database migration, no new route, no change to existing event links.

**Tech Stack:** Node >=20 CommonJS (viewer API and tests, `node:test`), classic browser scripts and plain CSS (viewer), the single-file organiser `index.html`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-13-public-home-event-list-design.md` (read it first; the mockup it describes was approved by the user).

## Global Constraints

- **No commits and no pushes while executing.** The user commits only when asked, and splits organiser commits from viewer commits. Leave all changes in the working tree. `.claude/` stays untracked.
- **No real DartConnect player or event names anywhere in the repo.** Use made-up names in tests and fixtures.
- **No new dependencies, no database migration, no new grants.** The endpoint reads only `public_tournaments`, never the `tournaments` table.
- **Allow-list only.** The list item has exactly these keys and no others: `slug, event, tournament, date, start, format, unit, entries, updatedAt`, plus `progress` (live only) and `winner` (results only).
- **Cache header is exactly** `public, s-maxage=30` (no stale-while-revalidate).
- **Limits live only in `viewer/api/_lib/listConfig.js`:** `RESULTS_DAYS=7`, `LIVE_STALE_HOURS=48`, `UPCOMING_GRACE_DAYS=1`, `QUERY_DAYS=8`, `MAX_PER_LIST=100`, `MAX_ROWS=300`.
- **Viewer code style:** `var` and function declarations, no modules, strings built with `hmEsc()` for everything shown. Organiser code style: match the surrounding `index.html` (`const`, arrow functions, `escapeHtml`).
- **Line endings:** repo files are CRLF. Edit with the Edit tool, or with a script that converts to `\n` and back, as `tests/lib` scripts in earlier work did. Never leave a file with mixed endings.
- **Existing behaviour is unchanged:** `/live/:slug`, deep links, printed QR codes, event pages and the golden snapshot. `npm test` and `npm run check-viewer` must pass at the end of every task.
- **Spec amendments agreed while planning** (applied to the spec file in Task 7): (a) a round-robin event never shows a winner line (the server has no standings code); (b) an undated unstarted event is upcoming only while saved within `QUERY_DAYS`; (c) the footer has no organiser link (the viewer does not know the organiser's address); (d) the organiser's card link to the home page reads "All events ↗" (the spec called it "View public page").

## Review Focus

The inputs the spec implies but the task tests might miss. Each has a test in the task that owns the code:

1. **A listed event that is then unpublished or unlisted** leaves the list within the cache window: the query filters on `listed`, and `describe` refuses anything whose `listed` is not true (Task 1, Task 3).
2. **A seeded event full of private data**: nothing beyond the allow-list reaches the response, including keys added later (Task 1).
3. **Boundary times**: live just inside and just outside 48 hours, results just inside and outside 7 days, an event dated yesterday and the day before, an undated event at 7 and 9 days (Task 1).
4. **A hostile event name, winner name or pasted "code"**: shown as text, never as markup; the open link is built only from the validated code and a restricted hash (Task 4).
5. **A multi-stage event across its stages**: within a stage the counts never decrease, a new stage starts again, and the ring never shows 100% while live (Task 2, Task 4).
6. **Degenerate brackets and groups**: a group of one or two, a bracket with byes, a void final, a void match, withdrawn entries: no division by zero, no negative counts (Task 2).

## File Structure

| File | Create / Modify | Responsibility |
|---|---|---|
| `viewer/api/_lib/listConfig.js` | create | The limits |
| `viewer/api/_lib/listView.js` | create | Pure list logic: `analyse`, `progressOf`, `describe`, `buildList` |
| `viewer/api/events.js` | create | `GET /api/events`: the query, the cache header, errors |
| `viewer/home.js` | create | Home page client: pure HTML builders and `showHome()` |
| `viewer/home.css` | create | Home page styles (cards, tabs, header, themes) |
| `viewer/index.html` | modify | Load `home.css`/`home.js`, call `showHome()` with no slug, "See all events" on the not-available message |
| `index.html` (organiser) | modify | `setListed`, the checkbox and the "All events" link on the Public results card, `setPublished` clears `listed` |
| `README.md` | modify | "Public home page" section |
| `docs/superpowers/specs/2026-10-13-public-home-event-list-design.md` | modify | The three amendments |
| `tests/list-view.test.js` | create | Task 1 and 2 tests |
| `tests/list-endpoint.test.js` | create | Task 3 tests |
| `tests/viewer-home.test.js` | create | Task 4 and 5 tests |
| `tests/organiser-listed.test.js` | create | Task 6 tests |
| `tests/lib/load-viewer.js` | modify | Also load `home.js`; export `loadHome` |

---

### Task 1: List logic — facts, classification and the allow-listed item

**Files:**
- Create: `viewer/api/_lib/listConfig.js`
- Create: `viewer/api/_lib/listView.js`
- Test: `tests/list-view.test.js`

**Interfaces:**
- Consumes: `SLUG_RE` from `viewer/api/_lib/publicView.js`.
- Produces (used by Tasks 2, 3): `analyse(d)` returning `{ type, started, finished, winnerId, groups, groupsDone, pods, fin, main }` (`groups` = array of `{done,total}` per confirmed group; `pods` = confirmed pods with a bracket; `fin` = the Group Boards Finals bracket or null; `main` = the main bracket or null); `describe(row, now)` returning `{ status: 'live'|'upcoming'|'results'|null, item|null }`; `buildList(rows, now)` returning `{ generatedAt, live, upcoming, results }`; `roundsOf`, `counts`, `currentRound`, `finished`, `started` helpers exported for Task 2 and tests. `row` is `{ slug, data, updated_at }` (the view's columns; `updated_at` may be a `Date` or an ISO string); `now` is epoch milliseconds.

- [ ] **Step 1: Write the limits file**

Create `viewer/api/_lib/listConfig.js`:

```js
// Limits for the public event list. This is the one place to change them; an admin setting could replace it later.
module.exports = {
  RESULTS_DAYS: 7,          // a finished event stays listed this long after its last save
  LIVE_STALE_HOURS: 48,     // a started, unfinished event not saved for this long drops off the list
  UPCOMING_GRACE_DAYS: 1,   // an unstarted event stays upcoming until its date is this many days past (time zones)
  QUERY_DAYS: 8,            // rows saved within this many days are read; an undated unstarted event is upcoming this long
  MAX_PER_LIST: 100,        // most events returned in each of live, upcoming and results
  MAX_ROWS: 300,            // most rows read from the database
};
```

- [ ] **Step 2: Write the failing tests**

Create `tests/list-view.test.js`:

```js
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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test tests/list-view.test.js`
Expected: FAIL (`Cannot find module '../viewer/api/_lib/listView'`).

- [ ] **Step 4: Write `listView.js` (without progress yet)**

Create `viewer/api/_lib/listView.js`:

```js
// Pure logic for the public event list: which events are live, upcoming or finished, and the small allow-listed
// summary of each. No database, no DOM. The endpoint (api/events.js) feeds it rows of the public_tournaments view.
// Only the fields copied in describe() ever leave this file; anything added to a tournament later stays private.

const cfg = require('./listConfig');
const { SLUG_RE } = require('./publicView');

const DAY = 86400000, HOUR = 3600000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/, TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const FORMATS = ['roundrobin', 'knockout', 'rrknockout', 'podknockout'];
const UNITS = ['Singles', 'Doubles', 'Triples', 'Teams'];

const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

// ---- brackets ----
function roundsOf(b) { return b && Array.isArray(b.rounds) ? b.rounds.filter(Array.isArray) : []; }
const isReal = (m) => !!m && !m.bye && !m.void;
function champion(b) {
  const r = roundsOf(b);
  if (!r.length) return null;
  const last = r[r.length - 1], m = last[0];
  return last.length === 1 && m && m.winnerId && !m.void ? m.winnerId : null;
}
function voidFinal(b) {
  const r = roundsOf(b);
  if (!r.length) return false;
  const m = r[r.length - 1][0];
  return !!(m && m.void);
}
const finished = (b) => !!(champion(b) || voidFinal(b));
const started = (b) => roundsOf(b).some((round) => round.some((m) => m && ((m.winnerId && !m.bye) || m.void)));
function counts(b) {
  let done = 0, total = 0;
  roundsOf(b).forEach((round) => round.forEach((m) => { if (isReal(m)) { total++; if (m.winnerId) done++; } }));
  return { done, total };
}
function roundName(b, idx) {
  const r = roundsOf(b), fromEnd = r.length - idx;
  if (fromEnd === 1) return 'Final';
  if (fromEnd === 2) return 'Semifinals';
  if (fromEnd === 3) return 'Quarterfinals';
  return 'Round of ' + r[idx].length * 2;
}
// The first round that still has a real match to play, with how many of that round's real matches are done.
function currentRound(b) {
  const r = roundsOf(b);
  for (let i = 0; i < r.length; i++) {
    const real = r[i].filter(isReal);
    if (real.some((m) => !m.winnerId)) return { name: roundName(b, i), done: real.filter((m) => m.winnerId).length, total: real.length };
  }
  return null;
}

// ---- round-robin groups ----
const pairKey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
function groupCounts(g) {
  const ids = Array.isArray(g.entryIds) ? g.entryIds : [];
  const sc = g.scores && typeof g.scores === 'object' ? g.scores : {};
  let total = 0, done = 0;
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    total++;
    const s = sc[pairKey(ids[i], ids[j])];
    if (s && typeof s === 'object') done++;
  }
  return { done, total };
}

// What the event looks like: its format, whether play has started or finished, and the champion if there is one.
function analyse(d) {
  const type = d.format && d.format.formatType;
  const groups = (d.groups || []).filter((g) => g && g.confirmed).map(groupCounts);
  const groupsDone = groups.some((c) => c.total > 0) && groups.every((c) => c.done === c.total);
  const groupsStarted = groups.some((c) => c.done > 0);
  const pods = (d.pods || []).filter((p) => p && p.confirmed && p.bracket);
  const fin = d.knockout && d.knockout.podFinals ? d.knockout : null;
  const main = d.knockout || null;
  const out = { type, started: false, finished: false, winnerId: null, groups, groupsDone, pods, fin, main };
  if (type === 'roundrobin') { out.started = groupsStarted; out.finished = groupsDone; }
  else if (type === 'knockout') { out.started = started(main); out.finished = finished(main); out.winnerId = champion(main); }
  else if (type === 'rrknockout') { out.started = groupsStarted || started(main); out.finished = finished(main); out.winnerId = champion(main); }
  else if (type === 'podknockout') { out.started = pods.some((p) => started(p.bracket)) || started(fin); out.finished = finished(fin); out.winnerId = champion(fin); }
  return out;
}

// One row of the public_tournaments view -> { status, item }. status is 'live', 'upcoming', 'results' or null (not listed now).
function describe(row, now) {
  const none = { status: null, item: null };
  const d = row && row.data;
  if (!d || typeof d !== 'object' || !SLUG_RE.test(String(row.slug || ''))) return none;
  if (String(d.listed) !== 'true') return none;
  const a = analyse(d);
  if (FORMATS.indexOf(a.type) === -1) return none;
  const updated = new Date(row.updated_at).getTime();
  if (!isFinite(updated)) return none;
  const ec = d.eventCreation || {}, fmt = d.format || {};
  const date = DATE_RE.test(ec.date) ? ec.date : '';
  const age = now - updated;
  let status = null;
  if (a.finished) { if (age <= cfg.RESULTS_DAYS * DAY) status = 'results'; }
  else if (a.started) { if (age <= cfg.LIVE_STALE_HOURS * HOUR) status = 'live'; }
  else if (date) { if (date >= isoDay(now - cfg.UPCOMING_GRACE_DAYS * DAY)) status = 'upcoming'; }
  else if (age <= cfg.QUERY_DAYS * DAY) status = 'upcoming';
  if (!status) return none;
  const event = clean(ec.eventName, 120), tournament = clean(ec.tournamentName, 120);
  const item = {
    slug: row.slug,
    event: event || tournament || 'Untitled event',
    tournament,
    date,
    start: TIME_RE.test(fmt.anticipatedStartTime) ? fmt.anticipatedStartTime : '',
    format: a.type,
    unit: UNITS.indexOf(ec.competitionUnit) !== -1 ? ec.competitionUnit : 'Singles',
    entries: (d.entriesList || []).filter((e) => e && !e.withdrawn).length,
    updatedAt: new Date(updated).toISOString(),
  };
  if (status === 'results') {
    const w = a.winnerId ? (d.entriesList || []).find((e) => e && e.id === a.winnerId) : null;
    item.winner = w ? clean(w.name, 120) : '';
  }
  return { status, item };
}

function buildList(rows, now) {
  const out = { live: [], upcoming: [], results: [] };
  (rows || []).forEach((row) => { const r = describe(row, now); if (r.status) out[r.status].push(r.item); });
  const newest = (x, y) => (x.updatedAt < y.updatedAt ? 1 : x.updatedAt > y.updatedAt ? -1 : 0);
  out.live.sort(newest); out.results.sort(newest);
  out.upcoming.sort((x, y) => (x.date || '9999').localeCompare(y.date || '9999') || (x.start || '99:99').localeCompare(y.start || '99:99') || x.event.localeCompare(y.event));
  return {
    generatedAt: new Date(now).toISOString(),
    live: out.live.slice(0, cfg.MAX_PER_LIST),
    upcoming: out.upcoming.slice(0, cfg.MAX_PER_LIST),
    results: out.results.slice(0, cfg.MAX_PER_LIST),
  };
}

module.exports = { analyse, describe, buildList, roundsOf, counts, currentRound, finished, started };
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test tests/list-view.test.js`
Expected: PASS (9 tests).

- [ ] **Step 6: Run the whole suite**

Run: `npm test` then `npm run check-viewer`
Expected: all tests pass (263 existing plus the new ones); `ok render.js`, `ok render.css`.

---

### Task 2: List logic — progress for live events

**Files:**
- Modify: `viewer/api/_lib/listView.js`
- Test: `tests/list-view.test.js` (append)

**Interfaces:**
- Consumes (from Task 1): `analyse`, `counts`, `currentRound`, `finished`, `started`, the `describe` function.
- Produces: `progressOf(d, a)` returning `{ stage, done, total }` or `null`; `describe` now adds `item.progress` to live items.

- [ ] **Step 1: Write the failing tests**

Append to `tests/list-view.test.js`:

```js
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
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/list-view.test.js`
Expected: FAIL (`progressOf` rows undefined: `Cannot read properties of undefined`), the 9 Task 1 tests still pass.

- [ ] **Step 3: Add `progressOf` and use it in `describe`**

In `viewer/api/_lib/listView.js`, add this before `// One row of the public_tournaments view`:

```js
// The matches of the stage the event is in, so the ring never drops because a later stage is generated.
function progressOf(d, a) {
  a = a || analyse(d);
  const sum = (list) => list.reduce((s, c) => ({ done: s.done + c.done, total: s.total + c.total }), { done: 0, total: 0 });
  const group = (c) => (c.total > 0 ? { stage: 'Group stage', done: c.done, total: c.total } : null);
  const ko = (b, prefix) => { const c = currentRound(b); return c ? { stage: (prefix || '') + c.name, done: c.done, total: c.total } : null; };
  if (a.type === 'roundrobin') return group(sum(a.groups));
  if (a.type === 'knockout') return ko(a.main);
  if (a.type === 'rrknockout') return a.groupsDone && a.main ? (ko(a.main) || group(sum(a.groups))) : group(sum(a.groups));
  if (a.type === 'podknockout') {
    const podsDone = a.pods.length > 0 && a.pods.every((p) => finished(p.bracket));
    if (a.fin && (podsDone || started(a.fin))) return ko(a.fin, 'Finals · ');
    return group(sum(a.pods.map((p) => counts(p.bracket))));
  }
  return null;
}
```

In `describe`, add after the `if (status === 'results') { ... }` block:

```js
  if (status === 'live') {
    const p = progressOf(d, a);
    if (p) item.progress = p;
  }
```

Export it: change the last line to `module.exports = { analyse, progressOf, describe, buildList, roundsOf, counts, currentRound, finished, started };`

- [ ] **Step 4: Run to verify they pass**

Run: `node --test tests/list-view.test.js`
Expected: PASS (16 tests). If the 6-player bracket test fails because `knockoutEvent(6)` has a different number of round-1 byes than expected, the test computes `real` from the bracket itself, so check that `play` was applied to a non-bye match.

- [ ] **Step 5: Run the whole suite**

Run: `npm test` then `npm run check-viewer`
Expected: all pass.

---

### Task 3: The `GET /api/events` endpoint

**Files:**
- Create: `viewer/api/events.js`
- Test: `tests/list-endpoint.test.js`

**Interfaces:**
- Consumes: `buildList` from `listView.js`, `cfg` from `listConfig.js`, `sql` from `viewer/api/_lib/db.js` (`sql\`...\`` tagged template returning rows `{slug, data, updated_at}`).
- Produces: the module exports one `async (req, res)` handler for Vercel; responds `200 { generatedAt, live, upcoming, results }`, `405` for non-GET, `500 { error: 'Could not load events.' }` on a database error.

- [ ] **Step 1: Write the failing tests**

Create `tests/list-endpoint.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

// A fake database in place of viewer/api/_lib/db.js, so the handler can be run without Neon.
const dbPath = require.resolve('../viewer/api/_lib/db');
let calls = [], rows = [], failWith = null;
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
  sql: async (strings, ...vals) => { calls.push({ text: strings.join('?'), vals }); if (failWith) throw failWith; return rows; },
} };
const handler = require('../viewer/api/events');
const cfg = require('../viewer/api/_lib/listConfig');

function call(method) {
  const res = { statusCode: 0, headers: {}, body: undefined };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { res.body = o; return res; };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  return handler({ method: method || 'GET' }, res).then(() => res);
}
const sample = (over) => ({ slug: 'abcdefgh1234', updated_at: new Date().toISOString(), data: Object.assign({
  listed: true, published: true,
  eventCreation: { tournamentName: 'Sample Open', eventName: 'Sample Singles', date: '2999-01-01', competitionUnit: 'Singles' },
  format: { formatType: 'knockout' }, entriesList: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
  knockout: { rounds: [[{ aEntryId: 'a', bEntryId: 'b', winnerId: null }]] },
}, over || {}) });

test('answers GET with the classified list and a 30 second shared cache, nothing stale', async () => {
  calls = []; rows = [sample()]; failWith = null;
  const res = await call('GET');
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['Cache-Control'], 'public, s-maxage=30');
  assert.deepEqual(Object.keys(res.body).sort(), ['generatedAt', 'live', 'results', 'upcoming']);
  assert.equal(res.body.upcoming.length, 1); assert.equal(res.body.upcoming[0].slug, 'abcdefgh1234');
});

test('answers only GET', async () => {
  for (const m of ['POST', 'PUT', 'DELETE', 'PATCH']) { const res = await call(m); assert.equal(res.statusCode, 405, m); }
});

test('reads only the public view, only listed rows, with bounded windows and a row cap', async () => {
  calls = []; rows = []; failWith = null;
  await call('GET');
  assert.equal(calls.length, 1);
  const q = calls[0].text.replace(/\s+/g, ' ');
  assert.match(q, /FROM public_tournaments/);
  assert.doesNotMatch(q, /FROM tournaments/i); assert.doesNotMatch(q, /organizers/i);
  assert.match(q, /data->>'listed' = 'true'/);
  assert.match(q, /ORDER BY updated_at DESC/); assert.match(q, /LIMIT/);
  const vals = calls[0].vals;
  assert.ok(vals.includes(cfg.MAX_ROWS), 'row cap passed as a value');
  const iso = vals.filter((v) => typeof v === 'string');
  assert.ok(iso.some((v) => /^\d{4}-\d{2}-\d{2}$/.test(v)), 'yesterday as a date');
  assert.ok(iso.some((v) => /^\d{4}-\d{2}-\d{2}T/.test(v)), 'the saved-since cutoff as a timestamp');
});

test('a database error is a 500 with a plain message, and nothing is cached', async () => {
  failWith = new Error('connection refused: postgres://secret'); rows = [];
  const res = await call('GET');
  failWith = null;
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Could not load events.' });
  assert.ok(!JSON.stringify(res.body).includes('secret'));
  assert.equal(res.headers['Cache-Control'], undefined);
});

test('an unlisted row that somehow came back is dropped, and nothing outside the allow-list is returned', async () => {
  failWith = null;
  rows = [sample({ listed: false }), sample({ eventCreation: { tournamentName: 'T', eventName: 'E', date: '2999-01-01', contact: 'SECRET CONTACT' }, incidents: [{ description: 'SECRET INCIDENT' }] })];
  const res = await call('GET');
  assert.equal(res.body.upcoming.length, 1);
  assert.ok(!JSON.stringify(res.body).includes('SECRET'));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/list-endpoint.test.js`
Expected: FAIL (`Cannot find module '../viewer/api/events'`).

- [ ] **Step 3: Write the endpoint**

Create `viewer/api/events.js`:

```js
const { sql } = require('./_lib/db');
const { buildList } = require('./_lib/listView');
const cfg = require('./_lib/listConfig');

// GET /api/events -> { generatedAt, live, upcoming, results }
// Read-only: it answers GET and nothing else, and queries the public_tournaments view (see sql/readonly.sql), which only
// holds tournaments the organiser has published. Of those it reads only the ones the organiser also chose to list, and
// only rows that could still appear (saved recently, or dated yesterday or later). What it returns is the allow-listed
// summary from listView.js; scores, players and notes are never part of it.
const DAY = 86400000;

module.exports = async (req, res) => {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
  try {
    const now = Date.now();
    const yesterday = new Date(now - cfg.UPCOMING_GRACE_DAYS * DAY).toISOString().slice(0, 10);
    const since = new Date(now - cfg.QUERY_DAYS * DAY).toISOString();
    const rows = await sql`
      SELECT slug, data, updated_at FROM public_tournaments
      WHERE data->>'listed' = 'true'
        AND (updated_at > ${since}::timestamptz OR data->'eventCreation'->>'date' >= ${yesterday})
      ORDER BY updated_at DESC
      LIMIT ${cfg.MAX_ROWS}
    `;
    // Short shared cache: many visitors cost about one query per window.
    // No stale-while-revalidate: an event that is unpublished or unlisted must disappear promptly.
    res.setHeader('Cache-Control', 'public, s-maxage=30');
    res.status(200).json(buildList(rows, now));
  } catch (e) {
    res.status(500).json({ error: 'Could not load events.' });
  }
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/list-endpoint.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Run the whole suite**

Run: `npm test` then `npm run check-viewer`
Expected: all pass.

---

### Task 4: Home page client — pure HTML builders

**Files:**
- Create: `viewer/home.js` (pure functions only in this task; `showHome()` comes in Task 5)
- Modify: `tests/lib/load-viewer.js`
- Test: `tests/viewer-home.test.js`

**Interfaces:**
- Consumes: the `/api/events` item shape from Task 1/2.
- Produces (all global functions, classic script): `hmEsc(s)`, `hmFormatLabel(f)`, `hmEntriesHTML(item)`, `hmCodeFrom(text)` → `{code, hash}` or `null`, `hmFilter(items, q)`, `hmGroup(items)`, `hmDefaultTab(data)`, `hmTabFromHash(hash)`, `hmToday(d)`, `hmDateLabel(date, today)`, `hmTimeLabel(hhmm)`, `hmTile(date)`, `hmCardHTML(kind, item)`, `hmListHTML(kind, items, q, today)`, `hmTabsHTML(data, tab)`, `hmOpenHTML(q)`, `hmUpdatedText(okAt, failed, now)`, `hmHomeLinkHTML()`. `kind` is `'live' | 'upcoming' | 'results'`; `data` is `{live:[], upcoming:[], results:[]}`.
- `tests/lib/load-viewer.js` gains `loadHome()` (a vm with only `home.js`) and `loadViewer()` runs `home.js` too.

- [ ] **Step 1: Extend the test loader**

In `tests/lib/load-viewer.js`, replace the line

```js
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'viewer', 'render.js'), 'utf8'), ctx, { filename: 'viewer/render.js' });
```

with

```js
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'viewer', 'render.js'), 'utf8'), ctx, { filename: 'viewer/render.js' });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'viewer', 'home.js'), 'utf8'), ctx, { filename: 'viewer/home.js' });
```

and add, above `module.exports`, a loader for `home.js` alone:

```js
// Loads just the home page script (pure builders and state) into a bare context.
function loadHome() {
  const ctx = { console, Math, JSON, Date, Array, Object, String, Number, parseInt, parseFloat, isNaN, encodeURIComponent, decodeURIComponent,
    setTimeout: () => 0, clearTimeout: () => {}, document: stubDocument, window: {}, location: { hash: '' }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'viewer', 'home.js'), 'utf8'), ctx, { filename: 'viewer/home.js' });
  return ctx;
}
```

and change the export to `module.exports = { loadViewer, loadHome, setViewerState, runViewer };`.

(The existing viewer tests will fail until `home.js` exists; that is expected until Step 4.)

- [ ] **Step 2: Write the failing tests**

Create `tests/viewer-home.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadHome, runViewer: rv } = require('./lib/load-viewer');
const { plain } = require('./lib/helpers');

const home = loadHome();
const h = (code) => rv(home, code);
const item = (o) => Object.assign({ slug: 'abcdefgh1234', event: "Men's Singles", tournament: 'Riverside Open', date: '2026-10-13', start: '', format: 'knockout', unit: 'Singles', entries: 24, updatedAt: '2026-10-13T10:00:00.000Z' }, o || {});
const call = (fn, ...args) => { home.__a = args; return h(fn + '(...__a)'); };

test('escaping: every shown string is escaped', () => {
  assert.equal(call('hmEsc', '<img src=x onerror="a">&\''), '&lt;img src=x onerror=&quot;a&quot;&gt;&amp;&#39;');
  assert.equal(call('hmEsc', null), '');
});

test('format labels and entry wording follow the unit and the count', () => {
  assert.equal(call('hmFormatLabel', 'podknockout'), 'Group Boards');
  assert.equal(call('hmFormatLabel', 'rrknockout'), 'Round robin + knockout');
  assert.equal(call('hmFormatLabel', 'unknown'), '');
  assert.equal(call('hmEntriesHTML', item({ entries: 24 })), '<b>24</b> players');
  assert.equal(call('hmEntriesHTML', item({ entries: 1 })), '<b>1</b> player');
  assert.equal(call('hmEntriesHTML', item({ entries: 16, unit: 'Doubles' })), '<b>16</b> pairs');
  assert.equal(call('hmEntriesHTML', item({ entries: 8, unit: 'Teams' })), '<b>8</b> teams');
  assert.equal(call('hmEntriesHTML', item({ entries: 0 })), '');
});

test('the code box: a code, a pasted link and a deep link are accepted; anything else is not', () => {
  assert.deepEqual(plain(call('hmCodeFrom', 'kk21jhmalqem')), { code: 'kk21jhmalqem', hash: '' });
  assert.deepEqual(plain(call('hmCodeFrom', '  KK21JHMALQEM  ')), { code: 'kk21jhmalqem', hash: '' });
  assert.deepEqual(plain(call('hmCodeFrom', 'https://dartdraw-viewer.vercel.app/live/kk21jhmalqem')), { code: 'kk21jhmalqem', hash: '' });
  assert.deepEqual(plain(call('hmCodeFrom', 'https://dartdraw-viewer.vercel.app/live/kk21jhmalqem#/groups/B')), { code: 'kk21jhmalqem', hash: '#/groups/B' });
  assert.deepEqual(plain(call('hmCodeFrom', 'dartdraw-viewer.vercel.app/live/kk21jhmalqem?x=1#/bracket/finals')), { code: 'kk21jhmalqem', hash: '#/bracket/finals' });
  ['', 'short', 'men singles', 'has space1234', 'x'.repeat(41), 'javascript:alert(1)', '/live/', 'https://evil.example/live/abc'].forEach((bad) => assert.equal(call('hmCodeFrom', bad), null, bad));
  assert.equal(call('hmCodeFrom', 'https://x.test/live/kk21jhmalqem#"><script>alert(1)</script>'), null, 'a hash with unsafe characters is refused, not trimmed');
});

test('the open button is built only from the validated code and hash', () => {
  const html = call('hmOpenHTML', 'https://x.test/live/kk21jhmalqem#/groups/B');
  assert.match(html, /href="\/live\/kk21jhmalqem#\/groups\/B"/); assert.match(html, /Open event/);
  assert.equal(call('hmOpenHTML', 'men singles'), '');
});

test('filtering ignores case and looks at the event, tournament, format and winner', () => {
  const items = [item({ event: 'Open Doubles', tournament: 'Northfield Club' }), item({ event: "Men's Singles", tournament: 'Riverside Open', winner: 'Alex Doe', format: 'podknockout' })];
  assert.equal(call('hmFilter', items, '').length, 2);
  assert.equal(call('hmFilter', items, 'DOUBLES').length, 1);
  assert.equal(call('hmFilter', items, 'ampang').length, 1);
  assert.equal(call('hmFilter', items, 'aiden').length, 1);
  assert.equal(call('hmFilter', items, 'group boards').length, 1);
  assert.equal(call('hmFilter', items, 'nothing like this').length, 0);
});

test('events are grouped under their tournament and date, in first-seen order', () => {
  const g = plain(call('hmGroup', [item({ event: 'A', tournament: 'Riverside Open' }), item({ event: 'B', tournament: 'Northfield', date: '2026-10-18' }), item({ event: 'C', tournament: 'kl open' }), item({ event: 'D', tournament: 'Riverside Open', date: '2026-10-14' }), item({ event: 'E', tournament: '' })]));
  assert.deepEqual(g.map((x) => [x.tournament, x.date, x.items.map((i) => i.event).join('')]), [['Riverside Open', '2026-10-13', 'AC'], ['Northfield', '2026-10-18', 'B'], ['Riverside Open', '2026-10-14', 'D'], ['', '2026-10-13', 'E']]);
});

test('the first tab is Live if it has events, else Upcoming if it has, else Results; the hash can choose', () => {
  assert.equal(call('hmDefaultTab', { live: [1], upcoming: [1], results: [1] }), 'live');
  assert.equal(call('hmDefaultTab', { live: [], upcoming: [1], results: [1] }), 'upcoming');
  assert.equal(call('hmDefaultTab', { live: [], upcoming: [], results: [1] }), 'results');
  assert.equal(call('hmDefaultTab', { live: [], upcoming: [], results: [] }), 'live');
  assert.equal(call('hmTabFromHash', '#/upcoming'), 'upcoming'); assert.equal(call('hmTabFromHash', '#/results'), 'results');
  assert.equal(call('hmTabFromHash', '#/nope'), null); assert.equal(call('hmTabFromHash', ''), null);
});

test('dates: Today, weekday and month, the 12-hour time, and no crash on a missing date', () => {
  assert.equal(call('hmToday', new Date(2026, 9, 13, 23, 30)), '2026-10-13');
  assert.equal(call('hmDateLabel', '2026-10-13', '2026-10-13'), 'Today');
  assert.equal(call('hmDateLabel', '2026-10-18', '2026-10-13'), 'Sun 18 Oct');
  assert.equal(call('hmDateLabel', '', '2026-10-13'), '');
  assert.equal(call('hmTimeLabel', '19:00'), '7:00 pm'); assert.equal(call('hmTimeLabel', '09:05'), '9:05 am');
  assert.equal(call('hmTimeLabel', '00:30'), '12:30 am'); assert.equal(call('hmTimeLabel', '12:00'), '12:00 pm'); assert.equal(call('hmTimeLabel', ''), '');
  assert.match(call('hmTile', '2026-10-18'), /Oct[\s\S]*18[\s\S]*Sun/); assert.match(call('hmTile', ''), /TBA/);
});

test('a live card links to its event, shows the ring (never 100%) and the stage line', () => {
  const html = call('hmCardHTML', 'live', item({ progress: { stage: 'Group stage', done: 11, total: 24 } }));
  assert.match(html, /^<a class="hm-ev hm-live" href="\/live\/abcdefgh1234">/);
  assert.match(html, /--p:45/); assert.match(html, /Group stage · 11 of 24 matches played/); assert.match(html, /Men's Singles|Men&#39;s Singles/);
  assert.match(call('hmCardHTML', 'live', item({ progress: { stage: 'Final', done: 99, total: 100 } })), /--p:99/);
  assert.match(call('hmCardHTML', 'live', item({ progress: { stage: 'Final', done: 1, total: 1 } })), /--p:99/);
  assert.match(call('hmCardHTML', 'live', item()), /hm-livedot/);                 // no progress: a dot, not a ring
  assert.match(call('hmCardHTML', 'live', item({ progress: { stage: 'X', done: 0, total: 0 } })), /hm-livedot|--p:0/);
});

test('an upcoming card shows the calendar tile, the time, format and entries; a results card the winner', () => {
  const up = call('hmCardHTML', 'upcoming', item({ date: '2026-10-18', start: '19:00', format: 'knockout', entries: 16, unit: 'Doubles' }));
  assert.match(up, /hm-tile/); assert.match(up, /7:00 pm/); assert.match(up, /Knockout/); assert.match(up, /<b>16<\/b> pairs/); assert.doesNotMatch(up, /hm-live/);
  const done = call('hmCardHTML', 'results', item({ winner: 'Alex Doe' }));
  assert.match(done, /hm-trophy/); assert.match(done, /Winner <b>Alex Doe<\/b>/);
  assert.doesNotMatch(call('hmCardHTML', 'results', item({ winner: '' })), /Winner/);
});

test('hostile names are shown as text, never as markup', () => {
  const bad = '<img src=x onerror=alert(1)>';
  const html = call('hmListHTML', 'results', [item({ event: bad, tournament: bad, winner: bad })], '', '2026-10-13');
  assert.ok(!html.includes('<img'), html); assert.match(html, /&lt;img/);
  const slugHtml = call('hmCardHTML', 'upcoming', item({ slug: 'a"><script>x</script>' }));
  assert.ok(!slugHtml.includes('<script>'));
});

test('the list shows tournament headings with the date, and the right empty message', () => {
  const html = call('hmListHTML', 'upcoming', [item({ event: 'A' }), item({ event: 'B' })], '', '2026-10-13');
  assert.equal((html.match(/<section class="hm-group">/g) || []).length, 1);
  assert.match(html, /Riverside Open/); assert.match(html, /Today/);
  assert.match(call('hmListHTML', 'live', [], '', '2026-10-13'), /Nothing is live right now/);
  assert.match(call('hmListHTML', 'live', [], '', '2026-10-13'), /data-hm-tab="upcoming"/);
  assert.match(call('hmListHTML', 'upcoming', [], '', '2026-10-13'), /No upcoming events listed/);
  assert.match(call('hmListHTML', 'results', [], '', '2026-10-13'), /No recent results/);
  const none = call('hmListHTML', 'upcoming', [item()], 'zzz<b>', '2026-10-13');
  assert.match(none, /No events match/); assert.ok(!none.includes('<b>') || none.includes('&lt;b&gt;'));
});

test('tabs show their counts, a red dot only when something is live, and which one is selected', () => {
  const html = call('hmTabsHTML', { live: [1, 2], upcoming: [1], results: [] }, 'upcoming');
  assert.match(html, /data-hm-tab="live"[^>]*aria-selected="false"/); assert.match(html, /data-hm-tab="upcoming"[^>]*aria-selected="true"/);
  assert.match(html, /hm-dot/); assert.match(html, />2</); assert.match(html, />0</);
  assert.doesNotMatch(call('hmTabsHTML', { live: [], upcoming: [], results: [] }, 'live'), /hm-dot/);
});

test('the update line says loading, just now, minutes ago, or that a refresh failed', () => {
  assert.equal(call('hmUpdatedText', 0, false, 1000), 'Loading events…');
  assert.equal(call('hmUpdatedText', 1000, false, 5000), 'Updated just now');
  assert.equal(call('hmUpdatedText', 1000, false, 1000 + 125000), 'Updated 2 min ago');
  assert.equal(call('hmUpdatedText', 1000, true, 5000), "Can't refresh right now. Retrying…");
  assert.equal(call('hmUpdatedText', 0, true, 5000), "Can't refresh right now. Retrying…");
});

test('the not-available page gets a link back to the home page', () => {
  assert.match(h('hmHomeLinkHTML()'), /href="\/"/); assert.match(h('hmHomeLinkHTML()'), /See all events/);
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `node --test tests/viewer-home.test.js`
Expected: FAIL (`ENOENT ... viewer/home.js`).

- [ ] **Step 4: Write `viewer/home.js` (pure builders)**

Create `viewer/home.js`:

```js
/* The public home page: shown at the bare address (no event link). A branded list of the events organisers have chosen
   to list, fetched from /api/events. Read-only; nothing here can change a tournament. Everything that builds HTML is a
   plain function (hm...) so it can be tested without a browser; showHome() (further down) is the only part that touches
   the page. Everything shown is escaped with hmEsc. */

var HM_FORMAT = { roundrobin:'Round robin', knockout:'Knockout', rrknockout:'Round robin + knockout', podknockout:'Group Boards' };
var HM_NOUN = { Singles:['player','players'], Doubles:['pair','pairs'], Triples:['triple','triples'], Teams:['team','teams'] };
var HM_EMPTY = { live:'Nothing is live right now.', upcoming:'No upcoming events listed.', results:'No recent results.' };
var HM_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
var HM_DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
var HM_TABS = ['live', 'upcoming', 'results'];
var HM_TAB_LABEL = { live:'Live', upcoming:'Upcoming', results:'Results' };

function hmEsc(s){
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function hmFormatLabel(f){ return HM_FORMAT[f] || ''; }
function hmEntriesHTML(it){
  var n = (it.entries | 0);
  if(n <= 0) return '';
  var w = HM_NOUN[it.unit] || ['entry', 'entries'];
  return '<b>' + n + '</b> ' + (n === 1 ? w[0] : w[1]);
}

/* A code or an event link typed or pasted into the search box. Only a lowercase code (8 to 40 letters and digits) and a
   hash made of safe characters get through, and the open address is built from those two parts alone. */
function hmCodeFrom(text){
  var t = String(text == null ? '' : text).trim();
  var m = /^([a-z0-9]{8,40})$/i.exec(t);
  if(m) return { code: m[1].toLowerCase(), hash: '' };
  m = /\/live\/([a-z0-9]{8,40})\/?(?:\?[^#\s]*)?(#[A-Za-z0-9\/_.%~-]*)?$/i.exec(t);
  if(m) return { code: m[1].toLowerCase(), hash: m[2] || '' };
  return null;
}
function hmOpenHTML(q){
  var c = hmCodeFrom(q);
  if(!c) return '';
  return '<a class="hm-open" href="/live/' + hmEsc(c.code + c.hash) + '"><span>Open event <b>' + hmEsc(c.code) + '</b></span><span aria-hidden="true">›</span></a>';
}

function hmFilter(items, q){
  var s = String(q || '').trim().toLowerCase();
  if(!s) return items.slice();
  return items.filter(function(it){
    return [it.event, it.tournament, hmFormatLabel(it.format), it.winner].join(' ').toLowerCase().indexOf(s) !== -1;
  });
}
/* Events with the same tournament name (ignoring case) and the same date share a heading. */
function hmGroup(items){
  var out = [], index = {};
  items.forEach(function(it){
    var key = String(it.tournament || '').toLowerCase() + '|' + (it.date || '');
    if(!index[key]){ index[key] = { tournament: it.tournament || '', date: it.date || '', items: [] }; out.push(index[key]); }
    index[key].items.push(it);
  });
  return out;
}
function hmDefaultTab(data){
  if(data.live.length) return 'live';
  if(data.upcoming.length) return 'upcoming';
  if(data.results.length) return 'results';
  return 'live';
}
function hmTabFromHash(hash){
  var m = /^#\/?(live|upcoming|results)$/.exec(String(hash || ''));
  return m ? m[1] : null;
}

/* ---- dates and times (local, from the event's own YYYY-MM-DD) ---- */
function hmToday(d){
  d = d || new Date();
  function p(n){ return (n < 10 ? '0' : '') + n; }
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function hmParts(s){
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if(!m) return null;
  var y = +m[1], mo = +m[2], d = +m[3];
  return { y: y, m: mo, d: d, wd: new Date(y, mo - 1, d).getDay() };
}
function hmDateLabel(date, today){
  if(!date) return '';
  if(date === today) return 'Today';
  var p = hmParts(date);
  return p ? HM_DAYS[p.wd] + ' ' + p.d + ' ' + HM_MONTHS[p.m - 1] : '';
}
function hmTimeLabel(t){
  var m = /^(\d{2}):(\d{2})$/.exec(String(t || ''));
  if(!m) return '';
  var h = +m[1], ap = h >= 12 ? 'pm' : 'am';
  h = h % 12; if(h === 0) h = 12;
  return h + ':' + m[2] + ' ' + ap;
}
function hmTile(date){
  var p = hmParts(date);
  if(!p) return '<div class="hm-tile hm-tba"><b>TBA</b></div>';
  return '<div class="hm-tile"><s>' + HM_MONTHS[p.m - 1] + '</s><b>' + p.d + '</b><s>' + HM_DAYS[p.wd] + '</s></div>';
}

/* ---- cards and lists ---- */
function hmCardHTML(kind, it){
  var href = '/live/' + encodeURIComponent(it.slug);
  var fmt = hmFormatLabel(it.format), tag = fmt ? '<span class="hm-fmt">' + hmEsc(fmt) + '</span>' : '';
  var ent = hmEntriesHTML(it), entHTML = ent ? '<span>' + ent + '</span>' : '';
  var lead = '', lines = '';
  if(kind === 'live'){
    var p = it.progress, pct = p && p.total > 0 ? Math.min(99, Math.floor(100 * p.done / p.total)) : null;
    lead = pct == null ? '<div class="hm-livedot" aria-hidden="true"></div>'
      : '<div class="hm-ring" style="--p:' + pct + '" role="img" aria-label="' + pct + ' percent played"><span>' + pct + '%</span></div>';
    lines = '<div class="hm-sub">' + tag + entHTML + '</div>' +
      (p ? '<div class="hm-sub">' + hmEsc(p.stage) + ' · ' + (p.done | 0) + ' of ' + (p.total | 0) + ' matches played</div>' : '');
  } else if(kind === 'upcoming'){
    var time = hmTimeLabel(it.start);
    lead = hmTile(it.date);
    lines = '<div class="hm-sub">' + (time ? '<b>' + hmEsc(time) + '</b>' : '') + tag + entHTML + '</div>';
  } else {
    lead = '<div class="hm-trophy" aria-hidden="true">🏆</div>';
    lines = (it.winner ? '<div class="hm-sub">Winner <b>' + hmEsc(it.winner) + '</b></div>' : '') + '<div class="hm-sub">' + tag + entHTML + '</div>';
  }
  return '<a class="hm-ev' + (kind === 'live' ? ' hm-live' : '') + '" href="' + hmEsc(href) + '"><div class="hm-lead">' + lead + '</div>' +
    '<div class="hm-main"><div class="hm-name">' + hmEsc(it.event) + '</div>' + lines + '</div><span class="hm-chev" aria-hidden="true">›</span></a>';
}
function hmListHTML(kind, items, q, today){
  if(!items.length){
    return '<p class="hm-none">' + HM_EMPTY[kind] + '</p>' +
      (kind === 'live' ? '<p class="hm-none"><button type="button" class="hm-btn" data-hm-tab="upcoming">See upcoming events</button></p>' : '');
  }
  var shown = hmFilter(items, q);
  if(!shown.length) return '<p class="hm-none">No events match “' + hmEsc(q) + '”.<br>Have a link or code? Paste it in the search box.</p>';
  return hmGroup(shown).map(function(g){
    return '<section class="hm-group"><h2>' + hmEsc(g.tournament || 'Other events') + '<span>' + hmEsc(hmDateLabel(g.date, today)) + '</span></h2>' +
      '<div class="hm-list">' + g.items.map(function(it){ return hmCardHTML(kind, it); }).join('') + '</div></section>';
  }).join('');
}
function hmTabsHTML(data, tab){
  return HM_TABS.map(function(k){
    var n = data[k].length;
    return '<button type="button" role="tab" id="hm-t-' + k + '" data-hm-tab="' + k + '" aria-selected="' + (k === tab ? 'true' : 'false') + '" aria-controls="hmList" tabindex="' + (k === tab ? '0' : '-1') + '">' +
      (k === 'live' && n ? '<span class="hm-dot"></span>' : '') + HM_TAB_LABEL[k] + '<span class="hm-c">' + n + '</span></button>';
  }).join('');
}
function hmUpdatedText(okAt, failed, now){
  if(failed) return 'Can\'t refresh right now. Retrying…';
  if(!okAt) return 'Loading events…';
  var mins = Math.floor((now - okAt) / 60000);
  return mins < 1 ? 'Updated just now' : 'Updated ' + mins + ' min ago';
}
function hmHomeLinkHTML(){ return '<p><a class="hm-btn" href="/">See all events</a></p>'; }
```

- [ ] **Step 5: Run to verify they pass**

Run: `node --test tests/viewer-home.test.js`
Expected: PASS (15 tests). If `hmCodeFrom('https://x.test/live/kk21jhmalqem#"><script>…')` fails (returns a code), the hash character class is too loose: it must contain only `A-Za-z0-9/_.%~-` and the match must be anchored with `$`.

- [ ] **Step 6: Run the whole suite**

Run: `npm test` then `npm run check-viewer`
Expected: all pass. The existing viewer tests (`viewer-boards`, `viewer-pods`, `viewer-deeplink`, `void-viewer`, `public-view`) still load the viewer, now with `home.js` before the inline scripts.

---

### Task 5: Home page — styles, `showHome()` and the `index.html` hook

**Files:**
- Create: `viewer/home.css`
- Modify: `viewer/home.js` (append `showHome()` and its helpers)
- Modify: `viewer/index.html`
- Test: `tests/viewer-home.test.js` (append two tests)

**Interfaces:**
- Consumes: every `hm...` builder from Task 4.
- Produces: `showHome()` (idempotent; builds the page into `<div id="home">`), and the viewer's `load()` calls it when there is no slug.

- [ ] **Step 1: Write `viewer/home.css`**

Create `viewer/home.css`:

```css
/* The public home page (viewer/home.js). Uses the viewer's theme tokens (theme.css) in dark and light. */
:root{--hm-line:rgba(255,255,255,.22);--hm-top:#1a2a3e;--hm-bot:#0f1823;
  --hm-sh:0 1px 0 rgba(255,255,255,.07) inset,0 8px 22px rgba(0,0,0,.55);--hm-sh-hover:0 1px 0 rgba(255,255,255,.1) inset,0 12px 28px rgba(0,0,0,.65)}
:root[data-theme="light"]{--hm-line:rgba(13,27,42,.28);--hm-top:#ffffff;--hm-bot:#eef3f9;
  --hm-sh:0 1px 0 #fff inset,0 2px 4px rgba(13,27,42,.08),0 8px 20px rgba(13,27,42,.12);--hm-sh-hover:0 1px 0 #fff inset,0 4px 8px rgba(13,27,42,.1),0 14px 28px rgba(13,27,42,.18)}
@media (prefers-color-scheme:light){:root:not([data-theme="dark"]){--hm-line:rgba(13,27,42,.28);--hm-top:#ffffff;--hm-bot:#eef3f9;
  --hm-sh:0 1px 0 #fff inset,0 2px 4px rgba(13,27,42,.08),0 8px 20px rgba(13,27,42,.12);--hm-sh-hover:0 1px 0 #fff inset,0 4px 8px rgba(13,27,42,.1),0 14px 28px rgba(13,27,42,.18)}}

.hm{padding-bottom:40px}
.hm-wrap{max-width:860px;margin:0 auto;padding:0 16px}
/* sticky top: brand row, one smart search field, status tabs */
.hm-top{position:sticky;top:0;z-index:5;background:linear-gradient(180deg,#10233e 0%,#0a1624 100%);color:#f3f7fb;border-bottom:1px solid var(--line)}
.hm-top .hm-wrap{padding-top:10px}
.hm-row1{display:flex;align-items:center;justify-content:space-between;gap:12px;height:44px}
.hm-brand{display:flex;align-items:center;gap:10px;text-decoration:none;color:inherit}
.hm-mark{width:31px;height:31px;border:3px solid #d9ad45;border-radius:50%;display:grid;place-items:center;font:800 15px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,Arial,sans-serif;color:#d9ad45;flex:0 0 auto}
.hm-brand b{font:800 20px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,Arial,sans-serif;letter-spacing:.3px}
.hm-brand i{font-style:normal;font-family:var(--display);font-weight:600;font-size:12px;letter-spacing:.2em;color:#8fa1b6;text-transform:uppercase;margin-left:2px}
.hm-ibtn{width:38px;height:38px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#dbe5f1;font-size:17px;cursor:pointer;display:grid;place-items:center}
.hm-ibtn:focus-visible,.hm-seg button:focus-visible,.hm-ev:focus-visible,.hm-find input:focus-visible,.hm-open:focus-visible,.hm-btn:focus-visible{outline:2px solid var(--blue);outline-offset:2px}
.hm-find{position:relative;margin:12px 0 0;display:block}
.hm-find svg{position:absolute;left:14px;top:50%;transform:translateY(-50%);width:18px;height:18px;opacity:.7}
.hm-find input{width:100%;height:46px;font:inherit;font-size:16px;padding:0 14px 0 42px;border:1px solid rgba(255,255,255,.26);border-radius:14px;background:rgba(255,255,255,.08);color:#f3f7fb;outline:none}
.hm-find input::placeholder{color:#9fb0c4}
.hm-open{display:flex;margin:8px 0 0;padding:11px 14px;border-radius:12px;background:var(--gold);color:#251a00;font-family:var(--display);font-weight:700;font-size:16px;letter-spacing:.06em;text-transform:uppercase;align-items:center;justify-content:space-between;text-decoration:none}
.hm-seg{display:flex;gap:4px;margin-top:10px}
.hm-seg button{flex:1;min-height:46px;border:0;border-bottom:3px solid transparent;background:none;color:#9fb0c4;font-family:var(--display);font-weight:600;font-size:16px;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px}
.hm-seg button .hm-c{font-size:13px;min-width:22px;padding:1px 6px;border-radius:99px;background:rgba(255,255,255,.12);color:#dbe5f1}
.hm-seg button[aria-selected="true"]{color:#fff;border-bottom-color:var(--blue)}
.hm-dot{width:8px;height:8px;border-radius:50%;background:#ff4b57;animation:hm-pulse 1.6s ease-in-out infinite}
@keyframes hm-pulse{0%,100%{opacity:1}50%{opacity:.35}}
@media (prefers-reduced-motion:reduce){.hm-dot{animation:none}}
/* list */
.hm-body .hm-wrap{padding-top:6px}
.hm-upd{display:flex;align-items:center;gap:8px;margin:14px 2px 0;font-size:13px;color:var(--muted)}
.hm-upd i{width:8px;height:8px;border-radius:50%;background:var(--green)}
.hm-upd.hm-bad i{background:var(--gold)}
.hm-group{margin-top:22px}
.hm-group h2{margin:0 2px 8px;display:flex;align-items:baseline;justify-content:space-between;gap:10px;font-family:var(--display);font-weight:600;font-size:14px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted)}
.hm-group h2 span{font-weight:500;letter-spacing:.08em}
.hm-list{display:grid;gap:12px}
.hm-ev{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:14px;padding:14px 16px 14px 14px;min-height:76px;text-decoration:none;color:inherit;position:relative;
  background:linear-gradient(180deg,var(--hm-top),var(--hm-bot));border:1.5px solid var(--hm-line);border-radius:16px;box-shadow:var(--hm-sh);transition:transform .12s ease,box-shadow .12s ease,border-color .12s ease}
.hm-ev:hover{transform:translateY(-2px);box-shadow:var(--hm-sh-hover);border-color:var(--blue)}
.hm-ev:active{transform:translateY(0)}
@media (prefers-reduced-motion:reduce){.hm-ev{transition:none}.hm-ev:hover{transform:none}}
.hm-ev.hm-live{border-color:rgba(224,34,47,.55)}
.hm-ev.hm-live::before{content:"";position:absolute;left:-1.5px;top:14px;bottom:14px;width:5px;border-radius:0 5px 5px 0;background:var(--live)}
.hm-lead{width:52px;display:grid;place-items:center}
.hm-tile{width:52px;border:1px solid var(--line-strong);border-radius:12px;text-align:center;padding:5px 0 6px;font-family:var(--display);line-height:1}
.hm-tile s{display:block;text-decoration:none;font-size:11px;font-weight:600;letter-spacing:.14em;color:var(--muted);text-transform:uppercase}
.hm-tile b{display:block;font-size:24px;font-weight:700;margin:2px 0}
.hm-tba b{font-size:15px;margin:11px 0;letter-spacing:.08em;color:var(--muted)}
.hm-ring{--p:0;width:48px;height:48px;border-radius:50%;background:conic-gradient(var(--blue) calc(var(--p)*1%),var(--line) 0);display:grid;place-items:center}
.hm-ring span{width:38px;height:38px;border-radius:50%;background:var(--hm-bot);display:grid;place-items:center;font-family:var(--display);font-weight:700;font-size:14px}
.hm-livedot{width:14px;height:14px;border-radius:50%;background:var(--live)}
.hm-trophy{width:48px;height:48px;border-radius:50%;background:var(--green-tint);display:grid;place-items:center;font-size:21px}
.hm-name{font-family:var(--display);font-weight:700;font-size:21px;letter-spacing:.03em;text-transform:uppercase;line-height:1.1;overflow-wrap:anywhere}
.hm-sub{margin-top:5px;font-size:14px;color:var(--muted);display:flex;gap:4px 10px;flex-wrap:wrap;align-items:center}
.hm-sub b{color:var(--ink);font-weight:600}
.hm-fmt{font-family:var(--display);font-weight:600;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);border:1px solid var(--line-strong);border-radius:99px;padding:0 8px}
.hm-chev{color:var(--on-blue);font-size:24px;line-height:1}
.hm-none{padding:26px 8px 0;text-align:center;color:var(--muted)}
.hm-btn{display:inline-block;font-family:var(--display);font-weight:600;font-size:15px;letter-spacing:.08em;text-transform:uppercase;min-height:44px;padding:10px 18px;border:1px solid var(--blue);border-radius:99px;background:var(--blue-tint);color:var(--on-blue);cursor:pointer;text-decoration:none}
.hm-foot{text-align:center;color:var(--muted);font-size:13px;padding:30px 16px 10px;line-height:1.7}
@media (min-width:860px){
  .hm-row1{height:46px}
  .hm-brand b{font-size:22px}
  .hm-ev{padding:16px 20px 16px 16px;min-height:80px}
  .hm-name{font-size:23px}
  .hm-sub{font-size:15px}
}
```

- [ ] **Step 2: Append `showHome()` to `viewer/home.js`**

Append to `viewer/home.js`:

```js

/* ---------- The page itself (the only part that touches the document) ---------- */
var HM_THEME_KEY = 'dartdraw.viewer.theme';   // the same stored choice the event page uses
var HM_THEME_ICON = { auto:'◐', light:'☀', dark:'☾' };
var HM = { shown:false, data:{ live:[], upcoming:[], results:[] }, tab:null, q:'', okAt:0, failed:false, timer:null, theme:'auto' };

function hmHeaderHTML(){
  return '<header class="hm-top"><div class="hm-wrap">' +
    '<div class="hm-row1"><a class="hm-brand" href="/"><span class="hm-mark" aria-hidden="true">D</span><b>DartDraw</b><i>Live</i></a>' +
    '<button class="hm-ibtn" id="hmTheme" type="button" aria-label="Colour theme: auto. Tap to change">' + HM_THEME_ICON.auto + '</button></div>' +
    '<label class="hm-find"><svg viewBox="0 0 24 24" fill="none" stroke="#dbe5f1" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>' +
    '<input id="hmQ" type="search" placeholder="Search events or paste a code" aria-label="Search events, or paste an event link or code" autocomplete="off" autocapitalize="off" spellcheck="false"></label>' +
    '<div id="hmOpen"></div>' +
    '<div class="hm-seg" role="tablist" aria-label="Events" id="hmTabs"></div>' +
    '</div></header>';
}
function hmSavedTheme(){ try{ var t = localStorage.getItem(HM_THEME_KEY); return (t === 'light' || t === 'dark') ? t : 'auto'; }catch(e){ return 'auto'; } }
function hmApplyTheme(t){
  HM.theme = t;
  var root = document.documentElement;
  if(t === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', t);
  try{ if(t === 'auto') localStorage.removeItem(HM_THEME_KEY); else localStorage.setItem(HM_THEME_KEY, t); }catch(e){}
  var b = document.getElementById('hmTheme');
  if(b){ b.textContent = HM_THEME_ICON[t]; b.setAttribute('aria-label', 'Colour theme: ' + t + '. Tap to change'); }
}
/* Redraws what depends on the data or the tab. The search box itself is left alone so typing is never interrupted. */
function hmView(){
  var tab = HM.tab || hmDefaultTab(HM.data);
  document.getElementById('hmTabs').innerHTML = hmTabsHTML(HM.data, tab);
  document.getElementById('hmOpen').innerHTML = hmOpenHTML(HM.q);
  var loading = !HM.okAt && !HM.failed;
  document.getElementById('hmList').innerHTML = loading ? '<p class="hm-none">Loading events…</p>' : hmListHTML(tab, HM.data[tab], HM.q, hmToday());
  hmStatus();
}
function hmStatus(){
  var u = document.getElementById('hmUpd');
  if(!u) return;
  u.className = 'hm-upd' + (HM.failed ? ' hm-bad' : '');
  u.innerHTML = '<i></i>' + hmEsc(hmUpdatedText(HM.okAt, HM.failed, Date.now())) + (HM.failed ? '' : ' · refreshes automatically');
}
async function hmLoad(){
  try{
    var res = await fetch('/api/events', { cache:'no-store' });
    if(!res.ok) throw new Error('HTTP ' + res.status);
    var body = await res.json();
    HM.data = { live: body.live || [], upcoming: body.upcoming || [], results: body.results || [] };
    HM.okAt = Date.now(); HM.failed = false;
    if(!HM.tab) HM.tab = hmTabFromHash(location.hash) || hmDefaultTab(HM.data);
  }catch(e){ HM.failed = true; }
  hmView();
}
function hmTick(){ hmLoad().then(function(){ HM.timer = setTimeout(hmTick, 30000); }); }
function hmSetTab(tab){ HM.tab = tab; hmView(); }

function showHome(){
  if(HM.shown) return;
  HM.shown = true;
  ['head', 'nav', 'finderWrap'].forEach(function(id){ var e = document.getElementById(id); if(e) e.hidden = true; });
  var main = document.querySelector('main'), foot = document.querySelector('footer');
  if(main) main.hidden = true;
  if(foot) foot.hidden = true;
  document.title = 'DartDraw Live';
  var root = document.createElement('div');
  root.id = 'home'; root.className = 'hm';
  root.innerHTML = hmHeaderHTML() +
    '<main class="hm-body"><div class="hm-wrap"><div class="hm-upd" id="hmUpd" aria-live="polite"></div>' +
    '<div id="hmList" role="tabpanel"></div>' +
    '<p class="hm-foot">Results update automatically · Powered by DartDraw</p></div></main>';
  document.body.insertBefore(root, document.body.firstChild);
  hmApplyTheme(hmSavedTheme());
  HM.tab = hmTabFromHash(location.hash);
  hmView();

  root.addEventListener('click', function(e){
    var t = e.target && e.target.closest ? e.target.closest('[data-hm-tab]') : null;
    if(t){ var k = t.getAttribute('data-hm-tab'); location.hash = '#/' + k; hmSetTab(k); }
  });
  root.addEventListener('keydown', function(e){
    if((e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') || !e.target || !e.target.closest || !e.target.closest('#hmTabs')) return;
    var i = HM_TABS.indexOf(HM.tab || hmDefaultTab(HM.data)), k = HM_TABS[(i + (e.key === 'ArrowRight' ? 1 : HM_TABS.length - 1)) % HM_TABS.length];
    location.hash = '#/' + k; hmSetTab(k);
    var b = document.getElementById('hm-t-' + k); if(b) b.focus();
  });
  document.getElementById('hmQ').addEventListener('input', function(e){ HM.q = e.target.value; hmView(); });
  document.getElementById('hmTheme').addEventListener('click', function(){ hmApplyTheme({ auto:'light', light:'dark', dark:'auto' }[HM.theme]); });
  window.addEventListener('hashchange', function(){ var k = hmTabFromHash(location.hash); if(k && k !== HM.tab) hmSetTab(k); });
  document.addEventListener('visibilitychange', function(){ if(!document.hidden){ clearTimeout(HM.timer); hmTick(); } });
  setInterval(hmStatus, 15000);
  hmTick();
}
```

- [ ] **Step 3: Hook it into `viewer/index.html`**

Make these four edits (use the Edit tool; the file has CRLF endings):

1. In `<head>`, after the line `<link rel="stylesheet" href="/theme.css">`, add `<link rel="stylesheet" href="/home.css">`.
2. After the line `<script src="/render.js"></script>`, add `<script src="/home.js"></script>`.
3. Replace the line

```js
  if(!SLUG){ showMessage('No results link', 'Open the link the organiser shared with you.'); return false; }
```

with

```js
  if(!SLUG){ showHome(); return false; }                  // the bare address: the home page (home.js)
```

4. Replace the function `showMessage` and the not-available call so the message gets a way back. Replace

```js
function showMessage(title, text){
  el('head').hidden = true; el('nav').hidden = true; el('finderWrap').hidden = true;
  el('app').innerHTML = '<div class="msg"><h1>'+title+'</h1><p class="empty">'+text+'</p></div>';
}
```

with

```js
function showMessage(title, text, extraHTML){
  el('head').hidden = true; el('nav').hidden = true; el('finderWrap').hidden = true;
  el('app').innerHTML = '<div class="msg"><h1>'+title+'</h1><p class="empty">'+text+'</p>'+(extraHTML || '')+'</div>';
}
```

and replace

```js
      showMessage('Results not available', 'This link isn\'t valid, or the organiser has taken the results offline.');
```

with

```js
      showMessage('Results not available', 'This link isn\'t valid, or the organiser has taken the results offline.', hmHomeLinkHTML());
```

- [ ] **Step 4: Write the two extra tests and run everything**

Append to `tests/viewer-home.test.js`:

```js
const fs = require('fs'), path = require('path');
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'index.html'), 'utf8');

test('the event page loads the home styles and script, and the bare address shows the home page', () => {
  assert.match(indexHtml, /<link rel="stylesheet" href="\/home\.css">/);
  assert.match(indexHtml, /<script src="\/home\.js"><\/script>/);
  assert.match(indexHtml, /if\(!SLUG\)\{ showHome\(\); return false; \}/);
  assert.doesNotMatch(indexHtml, /No results link/);
});

test('an unknown or withdrawn link keeps its message and gains the way back to the home page', () => {
  assert.match(indexHtml, /Results not available[\s\S]{0,200}hmHomeLinkHTML\(\)/);
  const { loadViewer, runViewer } = require('./lib/load-viewer');
  const v = loadViewer();
  assert.match(runViewer(v, 'hmHomeLinkHTML()'), /See all events/);
  assert.equal(runViewer(v, 'typeof showHome'), 'function');
});

test('the home script is self-contained: it needs nothing from the event page or the organiser, and only reads /api/events', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'home.js'), 'utf8');
  assert.doesNotMatch(src, /\bstate\b\.|applyTheme\(|savedTheme\(|escapeHtml\(/);
  assert.deepEqual([...src.matchAll(/fetch\('([^']+)'/g)].map((m) => m[1]), ['/api/events']);
  assert.doesNotMatch(src, /innerHTML\s*=\s*[^;]*\b(location|document\.referrer|navigator)\b/);
});
```

Run: `node --test tests/viewer-home.test.js` then `npm test` then `npm run check-viewer`
Expected: all pass.

- [ ] **Step 5: Look at it in a browser (the controller does this, not a subagent)**

Serve the viewer folder plus a stub `/api/events` and check the page at phone width (375px) and desktop in both themes: tabs switch, search filters, a pasted code shows the gold "Open event" button, cards match the approved mockup, the dark theme shows outlines and shadows. The scratch server `home-server.js` in the session scratchpad serves the static mockup and is a starting point; a new throwaway server that serves `viewer/` and returns `buildList(...)` for a few seeded rows at `/api/events` is simplest. Do not add that server to the repo.

---

### Task 6: Organiser — the "List on the public page" switch

**Files:**
- Modify: `index.html` (organiser): `setPublished`, new `setListed`, `publicResultsCardHTML`
- Test: `tests/organiser-listed.test.js`

**Interfaces:**
- Consumes: existing `state`, `currentOrganizer`, `persist`, `render`, `escapeHtml`, `publicResultsUrl()`.
- Produces: `setListed(on)`; `state.listed` (boolean, stored in the tournament JSON); the card shows a `#listToggle` checkbox and an "All events" link.

- [ ] **Step 1: Write the failing tests**

Create `tests/organiser-listed.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, useState } = require('./lib/helpers');

const app = loadApp(); app.persist = () => {}; app.render = () => {};
const f = (n) => run(app, n);
function fresh(opts) {
  opts = opts || {};
  const t = f('blankTournament')(); useState(app, t);
  t.published = !!opts.published; t.publicSlug = opts.published ? 'mx24oh2j14ei' : null; if (opts.listed !== undefined) t.listed = opts.listed;
  app.__org = opts.viewerUrl === null ? { viewerUrl: '' } : { viewerUrl: 'https://dartdraw-viewer.vercel.app' };
  run(app, 'currentOrganizer = __org');
  return t;
}
const card = () => f('publicResultsCardHTML')();

test('the checkbox is there, unchecked and disabled, while Public results is off', () => {
  fresh();
  const html = card();
  assert.match(html, /id="listToggle"/); assert.match(html, /List on the public page/);
  assert.match(html, /id="listToggle" disabled/); assert.doesNotMatch(html, /id="listToggle" checked/);   // (the onchange text contains the word "checked", so match the attribute order)
  assert.match(html, /Turn on Public results first/);
});

test('once Public results is on the checkbox is enabled and off by default, and an old tournament without the flag is unlisted', () => {
  const t = fresh({ published: true });
  assert.equal(t.listed, undefined);
  const html = card();
  assert.doesNotMatch(html, /id="listToggle" (?:checked )?disabled/); assert.doesNotMatch(html, /id="listToggle" checked/);
  assert.match(html, /home page: its name, date, format, number of entries and, once finished, the winner/);
  assert.match(html, /Your private link keeps working either way/);
});

test('setListed turns the flag on and off while published, and saves', () => {
  const t = fresh({ published: true });
  let saves = 0; app.persist = () => { saves++; };
  f('setListed')(true); assert.equal(t.listed, true); assert.match(card(), /id="listToggle" checked/);
  f('setListed')(false); assert.equal(t.listed, false); assert.doesNotMatch(card(), /id="listToggle" checked/);
  assert.equal(saves, 2);
  app.persist = () => {};
});

test('setListed cannot list an event whose results are not published', () => {
  const t = fresh({ published: false });
  f('setListed')(true); assert.equal(!!t.listed, false);
});

test('turning Public results off also turns the listing off, and turning it back on does not relist', () => {
  const t = fresh({ published: true, listed: true });
  f('setPublished')(false); assert.equal(t.listed, false); assert.equal(t.published, false);
  f('setPublished')(true); assert.equal(t.published, true); assert.equal(!!t.listed, false);
  assert.doesNotMatch(card(), /id="listToggle" checked/);
});

test('without a viewer address the switch is disabled with its own explanation, and there is no All events link', () => {
  fresh({ published: true, viewerUrl: null });
  const html = card();
  assert.match(html, /id="listToggle" disabled/); assert.match(html, /address of the public site isn't set up yet/); assert.doesNotMatch(html, /All events/);
});

test('with a viewer address the card links to the home page', () => {
  fresh({ published: true });
  assert.match(card(), /href="https:\/\/dartdraw-viewer\.vercel\.app"[^>]*>All events/);
});

test('the flag is stored in the tournament data like any setting, and no other part of the card changed', () => {
  const t = fresh({ published: true });
  f('setListed')(true);
  assert.equal(JSON.parse(JSON.stringify(t)).listed, true);
  const html = card();
  assert.match(html, /id="publishToggle"/); assert.match(html, /Copy link/); assert.match(html, /Open ↗/);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/organiser-listed.test.js`
Expected: FAIL (no `listToggle`, `setListed` is not defined).

- [ ] **Step 3: Implement**

In `index.html` (organiser), replace

```js
function setPublished(on){
  state.published = !!on;
  if(on && !state.publicSlug) state.publicSlug = newPublicSlug();
  persist(); render();
}
```

with

```js
function setPublished(on){
  state.published = !!on;
  if(on && !state.publicSlug) state.publicSlug = newPublicSlug();
  if(!on) state.listed = false;      // taking results offline also takes the event off the public list, so turning them on again never relists it by surprise
  persist(); render();
}
/* "List on the public page": opt-in, only while results are published. The viewer's home page lists events with listed:true. */
function setListed(on){
  state.listed = !!on && !!state.published;
  persist(); render();
}
```

In `publicResultsCardHTML`, add this after the `publishToggle` row (that is, directly after the line that ends `<label for="publishToggle">Publish results</label></div>'+`):

```js
    listToggleHTML()+
```

and add this function directly above `publicResultsCardHTML`:

```js
function listToggleHTML(){
  const base = currentOrganizer && currentOrganizer.viewerUrl;
  const can = !!(state.published && base);
  const note = !state.published ? 'Turn on Public results first.'
    : !base ? 'The address of the public site isn\'t set up yet.'
    : 'Shows this event on the DartDraw Live home page: its name, date, format, number of entries and, once finished, the winner. Your private link keeps working either way.';
  return '<div class="toggle-row"'+(can?'':' style="opacity:.55"')+'><input type="checkbox" id="listToggle" '+(state.listed && state.published?'checked ':'')+(can?'':'disabled ')+'onchange="setListed(this.checked)"> <label for="listToggle">List on the public page</label></div>'+
    '<p class="intro" style="margin:4px 0 0;font-size:11px">'+note+'</p>';
}
```

and in the link row (the `<div style="display:flex;gap:8px...">` containing `Copy link` and `Open ↗`), add after the `Open ↗` anchor:

```js
        '<a class="btn ghost" href="'+escapeHtml(currentOrganizer.viewerUrl)+'" target="_blank" rel="noopener">All events ↗</a>'+
```

(`url` is non-empty there only when `currentOrganizer.viewerUrl` is set, so this is safe.)

- [ ] **Step 4: Run to verify they pass**

Run: `node --test tests/organiser-listed.test.js`
Expected: PASS (8 tests). If "no other part of the card changed" fails on `Open ↗`, the existing anchor's text uses the `↗` character; copy it exactly from the source.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: all pass, including the golden snapshot (no draw or scoring code was touched).

---

### Task 7: Documentation, spec amendments and the final check

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-10-13-public-home-event-list-design.md`

- [ ] **Step 1: README**

Add a section after the existing "Public results" description (find it with `grep -n "Public results" README.md`) titled `### Public home page`:

```markdown
### Public home page

The viewer's bare address (for example `https://dartdraw-viewer.vercel.app/`) is a branded home page with a list of events, in three tabs: **Live**, **Upcoming** and **Results**, with a search box that also takes an event code or link.

- **Opt-in.** An event appears only when its organiser ticks **List on the public page** on the Public results card (it is off by default, and turning Public results off turns it off too). Events that are only published keep working through their private link and are never listed.
- **What it shows.** Event and tournament name, date, start time, format, number of entries, a progress ring while live, and the winner once finished. Scores, other players, clubs and notes are never part of the list (`viewer/api/_lib/listView.js` is the allow-list).
- **Rules.** Live means play has started and the event was saved within 48 hours. Upcoming means not started and dated yesterday or later. Results stay for 7 days after the last save. An unstarted event with no date is upcoming while it was saved within 8 days. A round robin shows no winner line.
- **Where the limits live.** `viewer/api/_lib/listConfig.js`. They are plain constants for now; an admin setting could replace them later.
- **How it is served.** `GET /api/events` reads the existing `public_tournaments` view through the existing read-only role (no migration, no new grant) and is cached for 30 seconds, so an unlisted or unpublished event disappears within about half a minute.
```

- [ ] **Step 2: Apply the four amendments to the spec**

In `docs/superpowers/specs/2026-10-13-public-home-event-list-design.md`:

1. In "What a visitor sees", under the **Results** card bullet, change `"Winner <name>" when there is exactly one champion` to `"Winner <name>" when the event has a champion (knockout, round robin then knockout, Group Boards); a round robin never shows a winner line`.
2. In "Classifying an event", under **Upcoming**, after the sentence ending `or no date.`, replace `or no date.` with `or no date and saved within the last 8 days.`
3. In "Home page", the **Footer** bullet: replace the text with `**Footer:** "Results update automatically · Powered by DartDraw".` (delete the organiser link and its clause).

4. In "What the organiser sees", change `A "View public page" link next to the existing link` to `An "All events ↗" link next to the existing link`.

Also in the Review focus / Edge cases, change "An event with no date: upcoming only if unstarted; live and results use the last save." to "An event with no date: upcoming only if unstarted and saved within the last 8 days; live and results use the last save."

- [ ] **Step 3: Full verification**

Run, in order:

```
npm test
npm run check-viewer
git status --short
```

Expected: every test passes (the 263 existing plus the new ones from Tasks 1 to 6); `ok render.js`, `ok render.css`; `git status` shows only: modified `index.html`, `README.md`, `viewer/index.html`, `tests/lib/load-viewer.js`, the spec; new `viewer/api/_lib/listConfig.js`, `viewer/api/_lib/listView.js`, `viewer/api/events.js`, `viewer/home.js`, `viewer/home.css`, `tests/list-view.test.js`, `tests/list-endpoint.test.js`, `tests/viewer-home.test.js`, `tests/organiser-listed.test.js`, `docs/superpowers/plans/2026-10-13-public-home-event-list.md`, plus the earlier untracked CSV export spec and `.claude/`. No other file may be modified.

- [ ] **Step 4: Handoff notes for the controller (do not commit)**

Report to the user: what is ready, and the commits the user will want, split as they asked:
- **Viewer commit:** `viewer/api/_lib/listConfig.js`, `viewer/api/_lib/listView.js`, `viewer/api/events.js`, `viewer/home.js`, `viewer/home.css`, `viewer/index.html`, `tests/list-view.test.js`, `tests/list-endpoint.test.js`, `tests/viewer-home.test.js`, `tests/lib/load-viewer.js`.
- **Organiser commit:** `index.html`, `tests/organiser-listed.test.js`, `README.md`, and the spec and plan documents.
- **Deploy order:** push the viewer first (it ignores events that are not listed, so nothing changes yet), then the organiser (the switch appears). The home page stays empty until an organiser lists an event.
- A reminder that an event only shows once its organiser ticks **List on the public page**, and that the Admin tab and retention setting remain parked.

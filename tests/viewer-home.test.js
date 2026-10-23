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
  assert.equal(call('hmFilter', items, 'northfield').length, 1);
  assert.equal(call('hmFilter', items, 'alex').length, 1);
  assert.equal(call('hmFilter', items, 'group boards').length, 1);
  assert.equal(call('hmFilter', items, 'nothing like this').length, 0);
});

test('events are grouped under their tournament and date, in first-seen order', () => {
  const g = plain(call('hmGroup', [item({ event: 'A', tournament: 'Riverside Open' }), item({ event: 'B', tournament: 'Northfield', date: '2026-10-18' }), item({ event: 'C', tournament: 'riverside open' }), item({ event: 'D', tournament: 'Riverside Open', date: '2026-10-14' }), item({ event: 'E', tournament: '' })]));
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

test('between stages a live card shows a full ring with a check mark and "<stage> complete · <next>"', () => {
  const html = call('hmCardHTML', 'live', item({ progress: { stage: 'Group stage', done: 30, total: 30, next: 'Knockout draw next' } }));
  assert.match(html, /--p:100/); assert.match(html, /<span class="hm-tick">✓<\/span>/); assert.match(html, /aria-label="stage complete"/);
  assert.match(html, /Group stage complete · Knockout draw next/);
  assert.doesNotMatch(html, /99/); assert.doesNotMatch(html, /matches played/); assert.doesNotMatch(html, /--p:99/);
  const fin = call('hmCardHTML', 'live', item({ format: 'podknockout', progress: { stage: 'Group stage', done: 9, total: 9, next: 'Finals next' } }));
  assert.match(fin, /Group stage complete · Finals next/); assert.match(fin, /--p:100/);
  const odd = call('hmCardHTML', 'live', item({ progress: { stage: 'Group stage', done: 0, total: 0, next: 'Finals next' } }));   // counts do not matter once next is present
  assert.match(odd, /--p:100/);
});

test('a hostile next or stage is shown as text on the between-stages card', () => {
  const bad = '<img src=x onerror=alert(1)>';
  const html = call('hmCardHTML', 'live', item({ progress: { stage: bad, done: 1, total: 1, next: bad } }));
  assert.ok(!html.includes('<img'), html); assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt; complete · &lt;img/);
});

test('without next a live card is unchanged: the percentage, the cap at 99 and the matches played line', () => {
  const html = call('hmCardHTML', 'live', item({ progress: { stage: 'Group stage', done: 30, total: 30 } }));
  assert.match(html, /--p:99/); assert.match(html, /<span>99%<\/span>/); assert.match(html, /aria-label="99 percent played"/);
  assert.match(html, /Group stage · 30 of 30 matches played/);
  assert.doesNotMatch(html, /✓/); assert.doesNotMatch(html, /complete/);
  assert.doesNotMatch(call('hmCardHTML', 'live', item({ progress: { stage: 'Group stage', done: 3, total: 4, next: '' } })), /✓/);   // an empty next is no next
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

test('first load failed: the list says it cannot load (with a Try again button), not "Nothing is live", and the tabs show no 0 counts', () => {
  const html = call('hmLoadFailedHTML');
  assert.match(html, /Can.t load events right now/); assert.match(html, /We.ll keep trying/);
  assert.match(html, /<button type="button" class="hm-btn" data-hm-retry>Try again<\/button>/);
  assert.doesNotMatch(html, /Nothing is live/);
  const bare = call('hmTabsHTML', { live: [], upcoming: [], results: [] }, 'live', true);
  assert.doesNotMatch(bare, /hm-c|hm-dot/); assert.match(bare, />Live</);
  // the page paints the failure only while nothing has ever loaded; after a good load a later failure keeps the list
  const painted = {}; const els = {};
  const doc = { getElementById: (id) => els[id] || (els[id] = { id, contains: () => false, setAttribute() {}, removeAttribute() {}, set innerHTML(v) { painted[id] = v; } }), activeElement: null, body: {} };
  const ctx = loadHomeWith(doc);
  vm.runInContext('HM.failed = true; hmView()', ctx);
  assert.match(painted.hmList, /Can.t load events right now/); assert.doesNotMatch(painted.hmList, /Nothing is live/); assert.doesNotMatch(painted.hmTabs, /hm-c/);
  vm.runInContext("HM.okAt = Date.now(); HM.data = { live: [], upcoming: [], results: [] }; hmView()", ctx);
  assert.match(painted.hmList, /Nothing is live right now/); assert.match(painted.hmTabs, /hm-c/);
  vm.runInContext('HM.failed = true; hmView()', ctx);
  assert.match(painted.hmList, /Nothing is live right now/, 'after a successful load a later failure only changes the small status line');
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

const fs = require('fs'), path = require('path');
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'index.html'), 'utf8');

test('the event page loads the home styles and script, and the bare address shows the home page', () => {
  assert.match(indexHtml, /<link rel="stylesheet" href="\/home\.css">/);
  assert.match(indexHtml, /<script src="\/home\.js"><\/script>/);
  assert.match(indexHtml, /if\(!SLUG\)\{[\s\S]{0,200}if\(typeof showHome === 'function'\) showHome\(\);[\s\S]{0,200}return false;/);   // no slug: the home page
  assert.match(indexHtml, /else showMessage\('No results link'/);   // the old message survives only as the fallback when home.js did not load
  assert.equal(indexHtml.split("showMessage('No results link'").length, 2);
});

test('an unknown or withdrawn link keeps its message and gains the way back to the home page', () => {
  assert.match(indexHtml, /Results not available[\s\S]{0,200}hmHomeLinkHTML\(\)/);
  assert.match(indexHtml, /typeof hmHomeLinkHTML === 'function' \? hmHomeLinkHTML\(\) : ''/);   // the event page does not depend on home.js loading
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

test('a very long pasted string is refused at once (it cannot make the link match slow), a valid code still works', () => {
  const long = '/live/abcdefgh?'.repeat(6667);
  assert.ok(long.length > 2000);
  const t0 = Date.now();
  assert.equal(call('hmCodeFrom', long), null);
  assert.ok(Date.now() - t0 < 500);
  assert.deepEqual(plain(call('hmCodeFrom', 'kk21jhmalqem')), { code: 'kk21jhmalqem', hash: '' });
});

test('names that are inherited object keys are not taken for a format or a unit', () => {
  ['constructor', '__proto__', 'toString', 'hasOwnProperty'].forEach((k) => assert.equal(call('hmFormatLabel', k), '', k));
  ['constructor', '__proto__', 'toString'].forEach((k) => assert.equal(call('hmEntriesHTML', item({ entries: 3, unit: k })), '<b>3</b> entries', k));
  assert.equal(call('hmEntriesHTML', item({ entries: 1, unit: 'constructor' })), '<b>1</b> entry');
});

test('a date with a month outside 01-12 or a day outside 01-31, or a time outside 00:00-23:59, is not shown', () => {
  assert.equal(call('hmDateLabel', '2026-13-45', '2026-10-13'), '');
  assert.equal(call('hmDateLabel', '2026-00-10', '2026-10-13'), '');
  assert.equal(call('hmDateLabel', '2026-10-32', '2026-10-13'), '');
  assert.equal(call('hmDateLabel', '2026-10-00', '2026-10-13'), '');
  assert.equal(call('hmDateLabel', '2026-10-18', '2026-10-13'), 'Sun 18 Oct');
  assert.match(call('hmTile', '2026-13-45'), /TBA/);
  assert.equal(call('hmTimeLabel', '24:00'), '');
  assert.equal(call('hmTimeLabel', '99:99'), '');
  assert.equal(call('hmTimeLabel', '12:60'), '');
  assert.equal(call('hmTimeLabel', '23:59'), '11:59 pm');
  assert.equal(call('hmTimeLabel', '19:00'), '7:00 pm');
});

test('home.js is pure ASCII (non-ASCII text is written as escapes) and the runtime text is unchanged', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'home.js'), 'utf8');
  const bad = [...src].filter((c) => c.charCodeAt(0) > 127);
  assert.deepEqual(bad, []);
  assert.match(call('hmCardHTML', 'results', item()), /🏆/);
  assert.match(call('hmCardHTML', 'upcoming', item()), /›<\/span>/);
  assert.match(call('hmListHTML', 'upcoming', [item()], 'zzz', '2026-10-13'), /“zzz”/);
  assert.match(call('hmOpenHTML', 'kk21jhmalqem'), /›/);
  assert.match(call('hmCardHTML', 'live', item({ progress: { stage: 'Final', done: 1, total: 2 } })), /Final · 1 of 2/);
  assert.equal(call('hmUpdatedText', 0, false, 1), 'Loading events…');
  assert.deepEqual(plain(h('HM_THEME_ICON')), { auto: '◐', light: '☀', dark: '☾' });
});

// ---- refreshing: one chain, never stopped, never overwritten by an older answer ----
const vm = require('vm');
function deferred() { let resolve, reject; const p = new Promise((a, b) => { resolve = a; reject = b; }); return { p, resolve, reject }; }
function pollerRig(over) {
  const timers = new Map(); let nextId = 1; const applied = []; const log = { fails: 0, renders: 0 };
  const loads = [];
  const deps = Object.assign({
    fetch: () => { const d = deferred(); loads.push(d); return d.p; },
    apply: (x) => applied.push(x), fail: () => { log.fails++; }, render: () => { log.renders++; }, every: 30000,
    setT: (fn) => { const id = nextId++; timers.set(id, fn); return id; }, clearT: (id) => { timers.delete(id); },
  }, over || {});
  home.__d = deps;
  const P = h('hmPoller(__d)');
  return { P, timers, applied, log, loads };
}
const settle = () => new Promise((r) => setImmediate(r));

test('refreshing: a redraw that throws does not stop the next refresh being scheduled', async () => {
  const r = pollerRig({ render: () => { throw new Error('boom'); } });
  r.P.start(); r.loads[0].resolve('d1'); await settle();
  assert.deepEqual(r.applied, ['d1']);
  assert.equal(r.timers.size, 1);
});

test('refreshing: a failed load, or an apply that throws, still schedules the next refresh', async () => {
  const r = pollerRig();
  r.P.start(); r.loads[0].reject(new Error('net')); await settle();
  assert.equal(r.log.fails, 1); assert.equal(r.timers.size, 1);
  const r2 = pollerRig({ apply: () => { throw new Error('bad body'); }, fail: () => { throw new Error('also bad'); } });
  r2.P.start(); r2.loads[0].resolve('x'); await settle();
  assert.equal(r2.timers.size, 1);
  const r3 = pollerRig({ fetch: () => { throw new Error('sync throw'); } });
  r3.P.start(); await settle();
  assert.equal(r3.log.fails, 1); assert.equal(r3.timers.size, 1);
});

test('refreshing: when two loads overlap only the newest answer is applied, even if the older one arrives last', async () => {
  const r = pollerRig();
  r.P.start(); r.P.start();
  r.loads[1].resolve('new'); await settle();
  r.loads[0].resolve('old'); await settle();
  assert.deepEqual(r.applied, ['new']);
  assert.equal(r.timers.size, 1);
  const r2 = pollerRig();
  r2.P.start(); r2.P.start();
  r2.loads[0].reject(new Error('late failure')); await settle();
  assert.equal(r2.log.fails, 0, 'a superseded load cannot mark the page as failed');
});

test('refreshing: a visibility flip during a load in flight leaves a single timer chain', async () => {
  const r = pollerRig();
  r.P.start();                                  // the first load is still in flight
  r.P.start(); r.P.start();                     // the tab is shown again, twice
  assert.equal(r.timers.size, 0);               // nothing is scheduled while loads are pending
  r.loads[0].resolve('a'); r.loads[1].resolve('b'); await settle(); assert.equal(r.timers.size, 0);
  r.loads[2].resolve('c'); await settle();
  assert.deepEqual(r.applied, ['c']); assert.equal(r.timers.size, 1);
  // the timer fires: the chain goes on with exactly one timer
  const [fn] = [...r.timers.values()]; r.timers.clear(); fn(); r.loads[3].resolve('d'); await settle();
  assert.equal(r.timers.size, 1); assert.deepEqual(r.applied, ['c', 'd']);
  // a flip while the timer is waiting replaces it, never adds one
  r.P.start(); assert.equal(r.timers.size, 0); r.loads[4].resolve('e'); await settle(); assert.equal(r.timers.size, 1);
});

// ---- focus survives a redraw ----
test('an unchanged region is not rewritten', () => {
  assert.equal(call('hmShouldWrite', undefined, '<p>x</p>'), true);
  assert.equal(call('hmShouldWrite', '<p>x</p>', '<p>x</p>'), false);
  assert.equal(call('hmShouldWrite', '<p>x</p>', '<p>y</p>'), true);
  assert.equal(call('hmShouldWrite', '', ''), false);
});

function focusRig() {
  const byId = {}; const doc = { activeElement: null, body: { tag: 'body' } };
  const mkRegion = (id) => {
    const r = { id, writes: 0, kids: [], _html: '', get innerHTML() { return this._html; }, set innerHTML(v) { this._html = v; this.writes++; this.kids = (this.render ? this.render(v) : []); },
      contains(n) { return !!n && n.parent === this; }, querySelectorAll() { return this.kids.filter((k) => k.tag === 'a'); } };
    byId[id] = r; return r;
  };
  const mkKid = (parent, o) => { const k = Object.assign({ parent, getAttribute(n) { return this.attrs[n]; }, focus() { doc.activeElement = this; } }, o); if (k.id) byId[k.id] = k; return k; };
  doc.getElementById = (id) => byId[id] || null;
  return { doc, mkRegion, mkKid, byId };
}
function loadHomeWith(doc) {
  const ctx = { console, Math, JSON, Date, Array, Object, String, Number, parseInt, parseFloat, isNaN, encodeURIComponent, setTimeout: () => 0, clearTimeout() {}, document: doc, window: {}, location: { hash: '' }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
  vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'viewer', 'home.js'), 'utf8'), ctx); return ctx;
}

test('redrawing a region writes only when its HTML changed, and keeps keyboard focus on a tab (by id)', () => {
  const f = focusRig(); const tabs = f.mkRegion('hmTabs');
  tabs.render = () => { delete f.byId['hm-t-live']; f.mkKid(tabs, { id: 'hm-t-live', tag: 'button', attrs: {} }); return []; };
  const ctx = loadHomeWith(f.doc);
  vm.runInContext("hmPaint('hmTabs', '<b>one</b>')", ctx);
  assert.equal(tabs.writes, 1);
  f.doc.activeElement = f.byId['hm-t-live']; const before = f.byId['hm-t-live'];
  vm.runInContext("hmPaint('hmTabs', '<b>one</b>')", ctx);
  assert.equal(tabs.writes, 1, 'same HTML: not rewritten');
  assert.equal(f.doc.activeElement, before, 'focus untouched');
  vm.runInContext("hmPaint('hmTabs', '<b>two</b>')", ctx);
  assert.equal(tabs.writes, 2);
  assert.notEqual(f.byId['hm-t-live'], before, 'the button was rebuilt');
  assert.equal(f.doc.activeElement, f.byId['hm-t-live'], 'focus put back on the new tab button');
});

test('a focused card or link is found again by its address after a rewrite; focus elsewhere is left alone', () => {
  const f = focusRig(); const list = f.mkRegion('hmList'); const search = { tag: 'input', id: 'hmQ', getAttribute() {}, focus() { f.doc.activeElement = this; } };
  list.render = () => [f.mkKid(list, { tag: 'a', attrs: { href: '/live/aaaaaaaa1111' } }), f.mkKid(list, { tag: 'a', attrs: { href: '/live/bbbbbbbb2222' } })];
  const ctx = loadHomeWith(f.doc);
  vm.runInContext("hmPaint('hmList', 'v1')", ctx);
  f.doc.activeElement = list.kids[1];
  vm.runInContext("hmPaint('hmList', 'v2')", ctx);
  assert.equal(f.doc.activeElement.attrs.href, '/live/bbbbbbbb2222'); assert.equal(f.doc.activeElement.parent, list);
  assert.equal(list.kids.includes(f.doc.activeElement), true, 'the new element, not the stale one');
  f.doc.activeElement = search; vm.runInContext("hmPaint('hmList', 'v3')", ctx);
  assert.equal(f.doc.activeElement, search, 'focus outside the region is not moved');
  f.doc.activeElement = list.kids[0]; list.render = () => [];       // the card is gone: nothing to restore, no crash
  vm.runInContext("hmPaint('hmList', 'v4')", ctx);
});

// ---- styles: theme.css styles bare header/main elements ----
test('home.css cancels the padding theme.css puts on header and main', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'home.css'), 'utf8');
  const rule = (sel) => { const m = css.match(new RegExp('(?:^|\\})\\s*' + sel.replace(/[.]/g, '\\.') + '\\s*\\{([^}]*)\\}', 'm')); return m ? m[1] : ''; };
  assert.match(rule('.hm-top'), /(^|;)\s*padding:\s*0\s*(;|$)/);
  assert.match(rule('.hm-body'), /(^|;)\s*padding:\s*0\s*(;|$)/);
  assert.match(rule('.hm-top'), /(^|;)\s*margin:\s*0\s*(;|$)/);
});

// ---- final-review wave ----
test('refreshing: no timer is scheduled while the page is hidden; coming back starts one chain', async () => {
  let hidden = true;
  const r = pollerRig({ hidden: () => hidden });
  r.P.start(); r.loads[0].resolve('a'); await settle();
  assert.deepEqual(r.applied, ['a']);
  assert.equal(r.timers.size, 0, 'hidden: the load completed but nothing was scheduled');
  hidden = false;                                 // the visibilitychange handler calls start() when the tab returns
  r.P.start(); r.loads[1].resolve('b'); await settle();
  assert.equal(r.timers.size, 1, 'visible: one timer');
  const [fn] = [...r.timers.values()]; r.timers.clear(); hidden = true; fn(); r.loads[2].resolve('c'); await settle();
  assert.equal(r.timers.size, 0, 'the tab was hidden while the timer was waiting: the chain stops there');
  const v = pollerRig({ hidden: () => false });
  v.P.start(); v.loads[0].resolve('x'); await settle();
  assert.equal(v.timers.size, 1);
  const bad = pollerRig({ hidden: () => { throw new Error('no document'); } });
  bad.P.start(); bad.loads[0].resolve('x'); await settle();
  assert.equal(bad.timers.size, 1, 'a throwing hidden() counts as visible');
});

test('the status line: only the failure announces itself', () => {
  const ok = plain(call('hmStatusState', Date.now() - 125000, false, Date.now()));
  assert.equal(ok.live, null); assert.equal(ok.cls, 'hm-upd'); assert.match(ok.html, /Updated 2 min ago/);
  const bad = plain(call('hmStatusState', 0, true, Date.now()));
  assert.equal(bad.live, 'polite'); assert.equal(bad.cls, 'hm-upd hm-bad'); assert.match(bad.html, /Can&#39;t refresh right now/);
  assert.equal(plain(call('hmStatusState', 0, false, Date.now())).live, null);
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '..', 'viewer', 'home.js'), 'utf8'), /id="hmUpd"[^>]*aria-live/);
});

test('the status line is rewritten only when its text or class changed, and aria-live is set only for the failure', () => {
  const f = focusRig();
  const el = { id: 'hmUpd', className: '', attrs: {}, writes: 0, _h: '', get innerHTML() { return this._h; }, set innerHTML(v) { this._h = v; this.writes++; },
    setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; } };
  f.byId.hmUpd = el;
  const ctx = loadHomeWith(f.doc);
  vm.runInContext('hmStatus()', ctx); vm.runInContext('hmStatus()', ctx); vm.runInContext('hmStatus()', ctx);
  assert.equal(el.writes, 1, 'unchanged: written once'); assert.equal(el.attrs['aria-live'], undefined);
  vm.runInContext('HM.okAt = Date.now() - 125000', ctx); vm.runInContext('hmStatus()', ctx);
  assert.equal(el.writes, 2); assert.match(el.innerHTML, /2 min ago/); assert.equal(el.attrs['aria-live'], undefined);
  vm.runInContext('hmStatus()', ctx); assert.equal(el.writes, 2);
  vm.runInContext('HM.failed = true', ctx); vm.runInContext('hmStatus()', ctx);
  assert.equal(el.writes, 3); assert.equal(el.attrs['aria-live'], 'polite'); assert.match(el.className, /hm-bad/);
  vm.runInContext('hmStatus()', ctx); assert.equal(el.writes, 3);
  vm.runInContext('HM.failed = false', ctx); vm.runInContext('hmStatus()', ctx);
  assert.equal(el.writes, 4); assert.equal(el.attrs['aria-live'], undefined);
});

test('the code box accepts a pasted TV link (query characters in the hash), and still refuses unsafe hashes', () => {
  assert.deepEqual(plain(call('hmCodeFrom', 'https://x.test/live/kk21jhmalqem#/boards?tv=1')), { code: 'kk21jhmalqem', hash: '#/boards?tv=1' });
  assert.deepEqual(plain(call('hmCodeFrom', 'https://x.test/live/kk21jhmalqem#/bracket?tv=1&x=2')), { code: 'kk21jhmalqem', hash: '#/bracket?tv=1&x=2' });
  assert.equal(call('hmCodeFrom', 'https://x.test/live/kk21jhmalqem#"><script>alert(1)</script>'), null);
  assert.equal(call('hmCodeFrom', 'https://x.test/live/kk21jhmalqem#a b'), null);
  assert.equal(call('hmCodeFrom', "https://x.test/live/kk21jhmalqem#a'b"), null);
  assert.equal(call('hmCodeFrom', 'https://x.test/live/kk21jhmalqem#a`b'), null);
  assert.equal(call('hmCodeFrom', 'https://x.test/live/kk21jhmalqem#a<b'), null);
  const html = call('hmOpenHTML', 'https://x.test/live/kk21jhmalqem#/boards?tv=1&x=2');
  assert.match(html, /href="\/live\/kk21jhmalqem#\/boards\?tv=1&amp;x=2"/);
});

test('Enter in the search box opens the address of the Open button (the helper returns it, or null)', () => {
  assert.equal(call('hmOpenHref', 'KK21JHMALQEM'), '/live/kk21jhmalqem');
  assert.equal(call('hmOpenHref', 'https://x.test/live/kk21jhmalqem#/groups/B'), '/live/kk21jhmalqem#/groups/B');
  assert.equal(call('hmOpenHref', 'men singles'), null);
  assert.equal(call('hmOpenHref', ''), null);
  assert.equal(call('hmOpenHref', 'javascript:alert(1)'), null);
  const src = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'home.js'), 'utf8');
  assert.match(src, /e\.key !== 'Enter'[\s\S]{0,120}hmOpenHref\(HM\.q\)[\s\S]{0,80}location\.href = href/);   // the DOM wiring itself needs a browser
});

// ---- stage subcards: one subcard per stage inside the one event card ----
const stg = (o) => Object.assign({ key: 'groups', state: 'live', done: 10, total: 30, groups: 8 }, o);
const subs = (html) => html.split(/<div class="hm-stage(?=[ "])/).slice(1).map((s) => '<div class="hm-stage' + s);
const txt = (html, cls) => { const m = new RegExp('<div class="' + cls + '">([^<]*)</div>').exec(html); return m ? m[1] : null; };
const rrkItem = (stages, o) => item(Object.assign({ format: 'rrknockout', unit: 'Doubles', entries: 26, stages }, o || {}));

test('stage subcards: a live round robin then knockout card has the main parts and two subcards', () => {
  const html = call('hmCardHTML', 'live', rrkItem([stg(), { key: 'knockout', state: 'waiting', done: 0, total: 0, advance: 24 }]));
  assert.match(html, /^<a class="hm-ev hm-multi hm-live" href="\/live\/abcdefgh1234"><div class="hm-head">/);
  assert.match(html, /<div class="hm-name">Men(&#39;|')s Singles<\/div>/);
  assert.match(html, /<span class="hm-fmt">Round robin \+ knockout<\/span><span><b>26<\/b> pairs<\/span>/);
  assert.match(html, /<span class="hm-chev" aria-hidden="true">›<\/span><\/div><div class="hm-stages">/);
  assert.doesNotMatch(html, /hm-tile/); assert.doesNotMatch(html, /hm-livedot/); assert.doesNotMatch(html, /matches played<\/div><\/div><span/);
  const s = subs(html); assert.equal(s.length, 2);
  assert.match(s[0], /^<div class="hm-stage is-live"><div class="hm-lead"><div class="hm-ring" style="--p:33" role="img" aria-label="33 percent played"><span>33%<\/span><\/div><\/div>/);
  assert.equal(txt(s[0], 'k'), 'Round robin'); assert.equal(txt(s[0], 'v'), 'In progress'); assert.equal(txt(s[0], 's'), '10 of 30 matches · 8 groups');
  assert.match(s[1], /^<div class="hm-stage is-wait"><div class="hm-lead"><div class="hm-pip">2<\/div><\/div>/);
  assert.equal(txt(s[1], 'k'), 'Knockout'); assert.equal(txt(s[1], 'v'), 'Waiting for groups'); assert.equal(txt(s[1], 's'), 'Starts when every group is done');
});

test('stage subcards: groups done and the knockout draw next, with how many advance', () => {
  const s = subs(call('hmCardHTML', 'live', rrkItem([stg({ state: 'done', done: 30 }), { key: 'knockout', state: 'next', done: 0, total: 0, advance: 24 }])));
  assert.match(s[0], /^<div class="hm-stage is-done"><div class="hm-lead"><div class="hm-pip done"[^>]*>✓<\/div>/);
  assert.equal(txt(s[0], 'v'), 'Complete'); assert.equal(txt(s[0], 's'), '30 of 30 matches · 8 groups');
  assert.match(s[1], /^<div class="hm-stage"><div class="hm-lead"><div class="hm-pip draw"[^>]*>…<\/div>/);
  assert.equal(txt(s[1], 'k'), 'Knockout'); assert.equal(txt(s[1], 'v'), 'Draw next'); assert.equal(txt(s[1], 's'), '24 pairs advance');
  const one = subs(call('hmCardHTML', 'live', rrkItem([stg({ state: 'done', done: 30 }), { key: 'knockout', state: 'next', done: 0, total: 0, advance: 1 }], { unit: 'Singles' })));
  assert.equal(txt(one[1], 's'), '1 player advances');
  const none = subs(call('hmCardHTML', 'live', rrkItem([stg({ state: 'done', done: 30 }), { key: 'knockout', state: 'next', done: 0, total: 0 }])));
  assert.equal(txt(none[1], 's'), '');
  const teams = subs(call('hmCardHTML', 'live', rrkItem([stg({ state: 'done', done: 30 }), { key: 'knockout', state: 'next', done: 0, total: 0, advance: 8 }], { unit: 'Teams' })));
  assert.equal(txt(teams[1], 's'), '8 teams advance');
});

test('stage subcards: a live knockout shows its round and the ring; the ring never shows 100', () => {
  const s = subs(call('hmCardHTML', 'live', rrkItem([stg({ state: 'done', done: 30 }), { key: 'knockout', state: 'live', done: 3, total: 8, round: 'Round of 16' }])));
  assert.match(s[1], /^<div class="hm-stage is-live"><div class="hm-lead"><div class="hm-ring" style="--p:37" role="img" aria-label="37 percent played"><span>37%<\/span>/);
  assert.equal(txt(s[1], 'v'), 'Round of 16'); assert.equal(txt(s[1], 's'), '3 of 8 matches played');
  const full = call('hmCardHTML', 'live', rrkItem([stg({ done: 30 })]));
  assert.match(full, /--p:99/); assert.match(full, /<span>99%<\/span>/); assert.doesNotMatch(full, /100%|--p:100/);
  const zero = call('hmCardHTML', 'live', rrkItem([stg({ done: 0, total: 0 })]));
  assert.match(zero, /--p:0/);
  const noRound = subs(call('hmCardHTML', 'live', item({ stages: [{ key: 'knockout', state: 'live', done: 1, total: 4 }] })));
  assert.equal(txt(noRound[0], 'v'), 'In progress');
});

test('stage subcards: a plain round robin has one subcard, and a plain knockout one', () => {
  const rr = call('hmCardHTML', 'live', item({ format: 'roundrobin', stages: [stg({ groups: 3, done: 1, total: 18 })] }));
  assert.equal(subs(rr).length, 1); assert.equal(txt(rr, 'k'), 'Round robin'); assert.equal(txt(rr, 's'), '1 of 18 matches · 3 groups');
  const one = call('hmCardHTML', 'live', item({ format: 'roundrobin', stages: [stg({ groups: 1 })] }));
  assert.equal(txt(one, 's'), '10 of 30 matches · 1 group');
  const up = call('hmCardHTML', 'upcoming', item({ format: 'roundrobin', stages: [stg({ state: 'notstarted', done: 0, total: 18, groups: 3 })] }));
  assert.match(up, /<div class="hm-stage is-wait"><div class="hm-lead"><div class="hm-pip dot" aria-hidden="true"><\/div><\/div>/);   // one stage: no stage number, a small dot instead
  assert.equal(txt(up, 'v'), 'Not started'); assert.equal(txt(up, 's'), '3 groups');
  const nog = call('hmCardHTML', 'upcoming', item({ format: 'roundrobin', stages: [stg({ state: 'notstarted', done: 0, total: 0, groups: 0 })] }));
  assert.equal(txt(nog, 's'), '');
  const ko = (st) => call('hmCardHTML', 'upcoming', item({ format: 'knockout', stages: [st] }));
  assert.equal(subs(ko({ key: 'knockout', state: 'next', done: 0, total: 0 })).length, 1);
  assert.equal(txt(ko({ key: 'knockout', state: 'next', done: 0, total: 0 }), 'v'), 'Draw next');
  const ready = ko({ key: 'knockout', state: 'ready', done: 0, total: 0 });
  assert.equal(txt(ready, 'v'), 'Draw made'); assert.equal(txt(ready, 's'), 'Not started yet'); assert.doesNotMatch(ready, /is-wait/); assert.match(ready, /<div class="hm-stage"><div class="hm-lead"><div class="hm-pip dot" aria-hidden="true"><\/div>/);   // drawn: no more dimmed than "Draw next"
});

test('stage subcards: Group Boards says Groups and Finals', () => {
  const g = (state, o) => call('hmCardHTML', 'live', item({ format: 'podknockout', stages: [stg({ groups: 4, total: 12 }), Object.assign({ key: 'finals', state, done: 0, total: 0 }, o)] }));
  let s = subs(g('waiting'));
  assert.equal(s.length, 2); assert.equal(txt(s[0], 'k'), 'Groups'); assert.equal(txt(s[1], 'k'), 'Finals'); assert.equal(txt(s[1], 'v'), 'Waiting for groups');
  s = subs(g('next')); assert.equal(txt(s[1], 'v'), 'Up next'); assert.equal(txt(s[1], 's'), ''); assert.match(s[1], /hm-pip draw/);
  s = subs(g('live', { done: 1, total: 2, round: 'Semifinals' })); assert.equal(txt(s[1], 'v'), 'Semifinals'); assert.equal(txt(s[1], 's'), '1 of 2 matches played'); assert.match(s[1], /--p:50/);
});

test('stage subcards: an upcoming card keeps the date tile and the time, and is not marked live', () => {
  const html = call('hmCardHTML', 'upcoming', rrkItem([stg({ state: 'notstarted', done: 0, total: 30 }), { key: 'knockout', state: 'waiting', done: 0, total: 0, advance: 24 }], { date: '2026-10-18', start: '19:00' }));
  assert.match(html, /^<a class="hm-ev hm-multi" href="\/live\/abcdefgh1234"><div class="hm-head"><div class="hm-lead"><div class="hm-tile">/);
  assert.match(html, /<b>7:00 pm<\/b><span class="hm-fmt">Round robin \+ knockout<\/span><span><b>26<\/b> pairs<\/span>/);
  assert.doesNotMatch(html, /hm-live/);
  const s = subs(html); assert.equal(s.length, 2);
  assert.match(s[0], /hm-stage is-wait/); assert.match(s[0], /<div class="hm-pip">1<\/div>/); assert.match(s[1], /<div class="hm-pip">2<\/div>/);
  assert.equal(txt(s[0], 'v'), 'Not started'); assert.equal(txt(s[0], 's'), '8 groups');
  const tba = call('hmCardHTML', 'upcoming', rrkItem([stg({ state: 'notstarted' })], { date: '' }));
  assert.match(tba, /hm-tile hm-tba/);
});

test('stage subcards: a results card shows the winner only in the last knockout or finals subcard', () => {
  const done = (o) => [stg({ state: 'done', done: 30 }), { key: 'knockout', state: 'done', done: 23, total: 23 }].concat(o || []);
  const html = call('hmCardHTML', 'results', rrkItem(done(), { winner: 'Alex Doe' }));
  const s = subs(html); assert.equal(s.length, 2);
  assert.match(html, /^<a class="hm-ev hm-multi" /); assert.doesNotMatch(html, /hm-live/);
  assert.match(s[0], /hm-pip done/); assert.doesNotMatch(s[0], /Winner|Alex|trophy/);
  assert.match(s[1], /^<div class="hm-stage is-done"><div class="hm-lead"><div class="hm-pip trophy"[^>]*>🏆<\/div>/);
  assert.equal(txt(s[1], 'k'), 'Knockout'); assert.equal(txt(s[1], 'v'), 'Winner Alex Doe'); assert.equal(txt(s[1], 's'), 'Complete · 23 of 23 matches');
  assert.equal(html.split('Alex Doe').length, 2);                             // once, and not in the head
  assert.equal(txt(s[0], 's'), '30 of 30 matches · 8 groups');
  // Group Boards: the finals subcard
  const pod = subs(call('hmCardHTML', 'results', item({ format: 'podknockout', winner: 'Sam Roe', stages: [stg({ state: 'done', done: 12, total: 12, groups: 4 }), { key: 'finals', state: 'done', done: 7, total: 7 }] })));
  assert.equal(txt(pod[1], 'v'), 'Winner Sam Roe'); assert.equal(txt(pod[1], 'k'), 'Finals');
  // no winner (void final): a check mark; round robin: no winner line anywhere
  const nw = subs(call('hmCardHTML', 'results', rrkItem(done(), { winner: '' })));
  assert.equal(txt(nw[1], 'v'), 'Complete'); assert.equal(txt(nw[1], 's'), '23 of 23 matches'); assert.match(nw[1], /hm-pip done/); assert.doesNotMatch(nw[1], /trophy/);
  const rr = call('hmCardHTML', 'results', item({ format: 'roundrobin', winner: 'Nobody Special', stages: [stg({ state: 'done', done: 18, total: 18, groups: 3 })] }));
  assert.doesNotMatch(rr, /Winner|Nobody|trophy/); assert.equal(txt(rr, 'v'), 'Complete');
  // the winner is not shown on a live or upcoming card even if one is sent
  assert.doesNotMatch(call('hmCardHTML', 'live', rrkItem(done(), { winner: 'Alex Doe' })), /Alex Doe/);
});

// ---- a finished event that the organiser has not finalized yet: progress carries next = 'Awaiting final results' ----
const AWAIT = 'Awaiting final results';
test('awaiting final results: the single-stage card shows a full ring with a check and "<stage> complete - Awaiting final results" for every format', () => {
  [['roundrobin', 'Group stage', 30], ['knockout', 'Knockout', 7], ['rrknockout', 'Knockout', 23], ['podknockout', 'Finals', 7]].forEach(([format, stage, total]) => {
    const html = call('hmCardHTML', 'live', item({ format, progress: { stage, done: total, total, next: AWAIT } }));
    assert.match(html, /--p:100/, format); assert.match(html, /<span class="hm-tick">✓<\/span>/, format); assert.match(html, /aria-label="stage complete"/, format);
    assert.ok(html.includes(stage + ' complete · ' + AWAIT), html);
    assert.doesNotMatch(html, /matches played|--p:99|99%/, format);
    const other = ['Group stage', 'Knockout', 'Finals'].filter((x) => x !== stage);
    other.forEach((x) => assert.ok(!html.includes(x), format + ' must not mention ' + x));
  });
  const void0 = call('hmCardHTML', 'live', item({ format: 'knockout', progress: { stage: 'Knockout', done: 0, total: 0, next: AWAIT } }));   // a bracket whose only match was voided: still sensible
  assert.match(void0, /Knockout complete · Awaiting final results/); assert.doesNotMatch(void0, /NaN|undefined/);
});

test('awaiting final results: the multi-stage card says it on the last (done) stage only, and only on a live card', () => {
  const rrk = (extra) => rrkItem([stg({ state: 'done', done: 30, total: 30 }), { key: 'knockout', state: 'done', done: 23, total: 23 }], extra);
  const s = subs(call('hmCardHTML', 'live', rrk({ progress: { stage: 'Knockout', done: 23, total: 23, next: AWAIT } })));
  assert.equal(s.length, 2);
  assert.equal(txt(s[1], 'k'), 'Knockout'); assert.equal(txt(s[1], 'v'), 'Complete'); assert.equal(txt(s[1], 's'), '23 of 23 matches · ' + AWAIT);
  assert.equal(txt(s[0], 's'), '30 of 30 matches · 8 groups');                      // the groups subcard is unchanged
  const plainLive = subs(call('hmCardHTML', 'live', rrk()));
  assert.equal(txt(plainLive[1], 's'), '23 of 23 matches');                          // no progress.next: unchanged
  const res = subs(call('hmCardHTML', 'results', rrk({ winner: 'Alex Doe', progress: { stage: 'Knockout', done: 23, total: 23, next: AWAIT } })));
  assert.equal(txt(res[1], 's'), 'Complete · 23 of 23 matches');                     // Results cards never show it
  const rr = subs(call('hmCardHTML', 'live', item({ format: 'roundrobin', stages: [stg({ state: 'done', done: 18, total: 18, groups: 3 })], progress: { stage: 'Group stage', done: 18, total: 18, next: AWAIT } })));
  assert.equal(txt(rr[0], 's'), '18 of 18 matches · 3 groups · ' + AWAIT);
  const pod = subs(call('hmCardHTML', 'live', item({ format: 'podknockout', stages: [stg({ state: 'done', done: 12, total: 12, groups: 4 }), { key: 'finals', state: 'done', done: 7, total: 7 }], progress: { stage: 'Finals', done: 7, total: 7, next: AWAIT } })));
  assert.equal(txt(pod[1], 's'), '7 of 7 matches · ' + AWAIT); assert.equal(txt(pod[0], 's'), '12 of 12 matches · 4 groups');
  const gap = subs(call('hmCardHTML', 'live', rrkItem([stg({ state: 'done', done: 30, total: 30 }), { key: 'knockout', state: 'next', done: 0, total: 0, advance: 24 }], { progress: { stage: 'Group stage', done: 30, total: 30, next: 'Knockout draw next' } })));
  assert.equal(txt(gap[0], 's'), '30 of 30 matches · 8 groups'); assert.equal(txt(gap[1], 's'), '24 pairs advance');   // the draw gap is not touched
});

test('awaiting final results: a hostile or odd next is escaped or ignored on the multi-stage card', () => {
  const bad = '<img src=x onerror=alert(1)>';
  const stages = [stg({ state: 'done', done: 30, total: 30 }), { key: 'knockout', state: 'done', done: 3, total: 3 }];
  const html = call('hmCardHTML', 'live', rrkItem(stages, { progress: { stage: 'Knockout', done: 3, total: 3, next: bad } }));
  assert.ok(!html.includes('<img'), html); assert.match(html, /3 of 3 matches · &lt;img/);
  [null, 5, {}, [], ''].forEach((n) => {
    const out = call('hmCardHTML', 'live', rrkItem(stages, { progress: { stage: 'Knockout', done: 3, total: 3, next: n } }));
    assert.doesNotMatch(out, /NaN|undefined|null|\[object/); assert.equal(txt(subs(out)[1], 's'), '3 of 3 matches');
  });
  assert.doesNotMatch(call('hmCardHTML', 'live', rrkItem(stages, { progress: null })), /undefined|null/);
});

test('stage subcards: hostile round, winner, names and numbers are escaped or coerced', () => {
  const bad = '<img src=x onerror=alert(1)>';
  const live = call('hmCardHTML', 'live', rrkItem([stg(), { key: 'knockout', state: 'live', done: 1, total: 2, round: bad }], { event: bad }));
  assert.ok(!live.includes('<img'), live); assert.match(live, /<div class="v">&lt;img src=x onerror=alert\(1\)&gt;<\/div>/);
  const res = call('hmCardHTML', 'results', rrkItem([stg({ state: 'done' }), { key: 'knockout', state: 'done', done: 3, total: 3 }], { winner: bad }));
  assert.ok(!res.includes('<img'), res); assert.match(res, /Winner &lt;img/);
  const nums = call('hmCardHTML', 'live', rrkItem([stg({ done: '<script>', total: '<b>', groups: '"><x>' }), { key: 'knockout', state: 'next', done: 0, total: 0, advance: '<i>' }]));
  assert.ok(!nums.includes('<script>') && !nums.includes('<x>') && !nums.includes('<i>'), nums);
  assert.doesNotMatch(nums, /NaN|undefined|null/);
  const odd = call('hmCardHTML', 'live', rrkItem([stg({ done: -5, total: 10 })]));
  assert.doesNotMatch(odd, /NaN|--p:-/);
});

test('stage subcards: unknown stages are skipped, and with none left the old card is shown', () => {
  const html = call('hmCardHTML', 'live', rrkItem([{ key: 'bogus', state: 'live' }, null, stg({ state: 'weird' }), stg()]));
  assert.equal(subs(html).length, 1); assert.equal(txt(html, 'k'), 'Round robin');
  const fallback = call('hmCardHTML', 'live', item({ stages: [{ key: 'bogus', state: 'live' }], progress: { stage: 'Group stage', done: 11, total: 24 } }));
  assert.match(fallback, /^<a class="hm-ev hm-live" /); assert.match(fallback, /Group stage · 11 of 24 matches played/);
});

test('stage subcards: an item without stages (or with an empty list) still renders the old card', () => {
  const old = call('hmCardHTML', 'live', item({ progress: { stage: 'Group stage', done: 11, total: 24 } }));
  assert.match(old, /^<a class="hm-ev hm-live" /); assert.doesNotMatch(old, /hm-multi|hm-stage/);
  const empty = call('hmCardHTML', 'live', item({ stages: [], progress: { stage: 'Group stage', done: 11, total: 24 } }));
  assert.equal(empty, old);
  const notList = call('hmCardHTML', 'live', item({ stages: 'x', progress: { stage: 'Group stage', done: 11, total: 24 } }));
  assert.equal(notList, old);
  assert.match(call('hmCardHTML', 'results', item({ winner: 'Alex Doe' })), /hm-trophy/);
  assert.match(call('hmCardHTML', 'upcoming', item()), /hm-tile/);
});

test('stage subcards: the list shows them on every tab', () => {
  const out = call('hmListHTML', 'live', [rrkItem([stg(), { key: 'knockout', state: 'waiting', done: 0, total: 0 }])], '', '2026-10-13');
  assert.match(out, /<div class="hm-list"><a class="hm-ev hm-multi hm-live"/);
});

test('home.css has the stage grid and the two-column media query at 640px', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'home.css'), 'utf8');
  assert.match(css, /\.hm-stages\{[^}]*display:grid[^}]*grid-template-columns:1fr[;}]/);
  assert.match(css, /@media \(min-width:640px\)\{\.hm-stages\{grid-template-columns:1fr 1fr\}\}/);
  ['.hm-ev.hm-multi', '.hm-head', '.hm-stage', '.hm-stage.is-done', '.hm-stage.is-wait', '.hm-stage.is-live', '.hm-pip', '.hm-pip.done', '.hm-pip.trophy', '.hm-pip.draw'].forEach((sel) => assert.ok(css.includes(sel + '{') || css.includes(sel + ','), sel));
});

test('stage subcards: a groups stage forced to done by a later stage says the real number of matches played', () => {
  const s = subs(call('hmCardHTML', 'results', rrkItem([stg({ state: 'done', done: 28, total: 30 }), { key: 'knockout', state: 'done', done: 23, total: 23 }], { winner: 'Alex Doe' })));
  assert.equal(txt(s[0], 'v'), 'Complete'); assert.equal(txt(s[0], 's'), '28 of 30 matches \u00B7 8 groups'); assert.match(s[0], /hm-stage is-done/);
  assert.equal(txt(s[1], 's'), 'Complete \u00B7 23 of 23 matches');
  const none = subs(call('hmCardHTML', 'live', rrkItem([stg({ state: 'done', done: 0, total: 12, groups: 2 }), { key: 'knockout', state: 'live', done: 1, total: 4, round: 'Quarterfinals' }])));
  assert.equal(txt(none[0], 's'), '0 of 12 matches \u00B7 2 groups');
  const normal = subs(call('hmCardHTML', 'live', rrkItem([stg({ state: 'done', done: 30, total: 30 }), { key: 'knockout', state: 'next', done: 0, total: 0 }])));
  assert.equal(txt(normal[0], 's'), '30 of 30 matches \u00B7 8 groups');
});

test('stage subcards: a single-stage card shows a small dot, a two-stage card the stage numbers', () => {
  const one = call('hmCardHTML', 'upcoming', item({ format: 'knockout', stages: [{ key: 'knockout', state: 'ready', done: 0, total: 0 }] }));
  assert.match(one, /<div class="hm-pip dot" aria-hidden="true"><\/div>/);
  const two = call('hmCardHTML', 'upcoming', rrkItem([stg({ state: 'notstarted' }), { key: 'knockout', state: 'waiting', done: 0, total: 0 }]));
  assert.doesNotMatch(two, /hm-pip dot/); assert.match(two, /<div class="hm-pip">1<\/div>/);
});

test('stage subcards: a ready stage is not dimmed like a waiting one', () => {
  const s = subs(call('hmCardHTML', 'live', rrkItem([stg({ state: 'done', done: 30 }), { key: 'knockout', state: 'ready', done: 0, total: 0 }])));
  assert.doesNotMatch(s[1], /is-wait/);
  const w = subs(call('hmCardHTML', 'live', rrkItem([stg({ state: 'done', done: 30 }), { key: 'knockout', state: 'waiting', done: 0, total: 0 }])));
  assert.match(w[1], /is-wait/);
});

test('home.css: a single subcard spans the whole row, and a waiting subcard is not dimmed with opacity', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'home.css'), 'utf8');
  assert.match(css, /\.hm-stage:only-child\{grid-column:1\/-1\}/);
  const wait = /\.hm-stage\.is-wait\{([^}]*)\}/.exec(css);
  assert.ok(wait); assert.doesNotMatch(wait[1], /opacity/);
  assert.match(css, /\.hm-stage\.is-wait \.v\{[^}]*color:var\(--muted\)/);
  assert.match(css, /\.hm-pip\.dot::after\{/);
});

test('stage subcards: a done stage with no matches does not say "0 of 0 matches"', () => {
  const ko = subs(call('hmCardHTML', 'results', item({ format: 'knockout', winner: 'Alex Doe', stages: [{ key: 'knockout', state: 'done', done: 0, total: 0 }] })));
  assert.equal(txt(ko[0], 'v'), 'Winner Alex Doe'); assert.equal(txt(ko[0], 's'), 'Complete');
  const noWin = subs(call('hmCardHTML', 'results', item({ format: 'knockout', winner: '', stages: [{ key: 'knockout', state: 'done', done: 0, total: 0 }] })));
  assert.equal(txt(noWin[0], 'v'), 'Complete'); assert.equal(txt(noWin[0], 's'), '');
  const forced = subs(call('hmCardHTML', 'live', rrkItem([stg({ state: 'done', done: 0, total: 0, groups: 2 }), { key: 'knockout', state: 'live', done: 1, total: 4, round: 'Quarterfinals' }])));
  assert.equal(txt(forced[0], 'v'), 'Complete'); assert.equal(txt(forced[0], 's'), '2 groups');
  const empty = subs(call('hmCardHTML', 'live', rrkItem([stg({ state: 'done', done: 0, total: 0, groups: 0 }), { key: 'knockout', state: 'live', done: 1, total: 4, round: 'Quarterfinals' }])));
  assert.equal(txt(empty[0], 's'), '');
  const fin = subs(call('hmCardHTML', 'results', item({ format: 'podknockout', winner: 'Sam Roe', stages: [stg({ state: 'done', done: 0, total: 0, groups: 0 }), { key: 'finals', state: 'done', done: 0, total: 0 }] })));
  assert.equal(txt(fin[1], 'v'), 'Winner Sam Roe'); assert.equal(txt(fin[1], 's'), 'Complete');
  assert.doesNotMatch(fin.join(''), /0 of 0/);
});

/* ---------- Release 5: the "New here?" card (kb-review E2) ---------- */
function store(entries, opts) {
  const m = new Map(Object.entries(entries || {}));
  return { get length() { if (opts && opts.throws) throw new Error('blocked'); return m.size; }, key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => { if (opts && opts.throws) throw new Error('blocked'); return m.has(k) ? m.get(k) : null; }, setItem: (k, v) => { if (opts && opts.throws) throw new Error('blocked'); m.set(k, String(v)); }, map: m };
}
test('Start card: shown to a first-time visitor; hidden after Got it, or for someone who already follows or set Me; works without storage', () => {
  h('HM_START.done = false');
  home.__s = store({ 'dartdraw.viewer.theme': 'dark', 'dartdraw.viewer.bracketView': 'rounds', 'dartdraw.viewer.abcdefgh1234': '{"me":null,"follow":[]}' });
  assert.equal(h('hmStartWanted(__s)'), true, 'plain words and empty prefs are not a returning follower');
  home.__s = store({ 'dartdraw.viewer.abcdefgh1234': '{"me":null,"follow":["e1"]}' });
  assert.equal(h('hmStartWanted(__s)'), false, 'follows a player');
  home.__s = store({ 'dartdraw.viewer.abcdefgh1234': '{"me":"e2","follow":[]}' });
  assert.equal(h('hmStartWanted(__s)'), false, 'set Me');
  home.__s = store({});
  assert.equal(h('hmStartWanted(__s)'), true);
  h('hmStartDismiss(__s)');
  assert.equal(home.__s.map.get('dartdraw.viewer.seenStart'), '1', 'Got it is remembered on this device');
  h('HM_START.done = false');
  assert.equal(h('hmStartWanted(__s)'), false);
  // storage blocked: shown, and Got it still hides it for this page view
  home.__s = store({}, { throws: true });
  assert.equal(h('hmStartWanted(__s)'), true);
  assert.doesNotThrow(() => h('hmStartDismiss(__s)'));
  assert.equal(h('hmStartWanted(__s)'), false);
  h('HM_START.done = false');
  assert.equal(h('hmStartWanted(null)'), true);
});
test('Start card: three short points, a Got it button and a link to the glossary; Teams wording on a Teams event page', () => {
  const homeCard = call('hmStartHTML', 'home');
  assert.match(homeCard, /<section class="hm-start" aria-labelledby="hmStartH"><h2 id="hmStartH">New here\? Three things to know<\/h2>/);
  assert.equal((homeCard.match(/<li>/g) || []).length, 3);
  assert.match(homeCard, /<b>Live<\/b> is being played now, <b>Upcoming<\/b> hasn’t started yet, <b>Results<\/b> are finished/);
  assert.match(homeCard, /<button type="button" class="hm-btn" data-start-ok>Got it<\/button>/);
  assert.match(homeCard, /href="\/help#glossary">Words you will see<\/a>/);
  // an event page: a slim one-line bar that opens the same three points in place, with an × that closes it for good
  const ev = call('hmStartBarHTML', { help: '/help?from=abcdefgh1234', team: true });
  assert.match(ev, /<button type="button" class="hm-sbtoggle" data-start-toggle aria-expanded="false" aria-controls="hmStartMore"><span class="hm-sbtext"><b>New here\?<\/b> What the colours and columns mean<\/span>/);
  assert.match(ev, /<button type="button" class="hm-sbx" data-start-ok aria-label="[^"]+"/);
  assert.match(ev, /<div class="hm-sbbody" id="hmStartMore" hidden><ol>/);
  assert.equal((ev.match(/<li>/g) || []).length, 3);
  assert.match(ev, /opens on the part of the event being played now/);
  assert.match(ev, /Find your team with the search box/);
  assert.match(ev, /Blue marks you, gold the teams you follow/);
  assert.match(ev, /href="\/help\?from=abcdefgh1234#glossary"/);
  assert.match(ev, /<p class="hm-sbmore"><a href="\/help\?from=abcdefgh1234">More help/);
  const open = call('hmStartBarHTML', { open: true });
  assert.match(open, /aria-expanded="true"/); assert.match(open, /id="hmStartMore"><ol>/); assert.match(open, /gold the players you follow/);
  assert.doesNotMatch(homeCard + ev, /\b(plan|tier|Basic|Pro)\b|@/);
});

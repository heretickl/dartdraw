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

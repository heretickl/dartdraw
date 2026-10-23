const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), vm = require('vm'), path = require('path');

const VIEWER = path.join(__dirname, '..', 'viewer');
const read = (f) => fs.readFileSync(path.join(VIEWER, f), 'utf8');
const HELP = read('help.html');
const INDEX = read('index.html');
const HOME = read('home.js');
const VERCEL = JSON.parse(read('vercel.json'));

test('help page: exists with a title, one h1 "Help", and the viewer theme', () => {
  assert.match(HELP, /<title>[^<]*Help[^<]*<\/title>/);
  assert.equal((HELP.match(/<h1[\s>]/g) || []).length, 1);
  assert.match(HELP, /<h1>Help<\/h1>/);
  assert.match(HELP, /Follow a darts tournament live/);
  assert.match(HELP, /<link rel="stylesheet" href="\/theme\.css">/);
  assert.match(HELP, /name="viewport"/);
  assert.ok(fs.existsSync(path.join(VIEWER, 'help.css')));
  assert.match(HELP, /<link rel="stylesheet" href="\/help\.css">/);
});

test('help page: supports auto / light / dark like the other viewer pages', () => {
  assert.match(HELP, /localStorage\.getItem\('dartdraw\.viewer\.theme'\)/);
  ['auto', 'light', 'dark'].forEach((t) => assert.match(HELP, new RegExp('data-theme-set="' + t + '"')));
  assert.match(HELP, /<meta name="color-scheme" content="dark light">/);
});

test('help page: links back to all events at /', () => {
  assert.match(HELP, /<a class="allevents" href="\/">[\s\S]*?All events<\/a>/);
});

test('help page: plenty of questions, each <details> has exactly one <summary>, ids are unique', () => {
  const details = HELP.match(/<details\b[\s\S]*?<\/details>/g) || [];
  assert.ok(details.length >= 30, 'questions: ' + details.length);
  details.forEach((d) => {
    assert.equal((d.match(/<summary>/g) || []).length, 1, d.slice(0, 80));
    assert.ok(d.indexOf('<summary>') < d.indexOf('class="a"'), 'summary comes before the answer');
  });
  const ids = [...HELP.matchAll(/<details class="q" id="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(ids.length, details.length, 'every question has an id');
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
});

test('help page: covers the agreed topics', () => {
  const t = HELP.replace(/<[^>]+>/g, ' ');
  ['Live', 'Upcoming', 'Results', 'Final results', 'Groups', 'Bracket', 'Rounds', 'Chart', 'Find a player', 'This is me', 'Follow',
    'MP', 'MW', 'ML', 'LW', '+/-', 'Pts', 'TB', 'H2H', '3-way LD', 'Bye', 'Neither attended', 'WO', 'Group 3', 'Board', 'pair name',
    'Teams', 'Find a team', 'segments', 'tie-breaker', 'total legs', 'QR', 'Auto / Light / Dark', 'No. You can look', 'about every 20 seconds', 'We can', 'Results not available'].forEach((w) => assert.ok(t.includes(w), 'mentions ' + w));
});

test('help page: no plan names, no exact retention numbers, no accounts or admin talk', () => {
  const t = HELP.replace(/<[^>]+>/g, ' ');
  assert.ok(!/\bBasic\b/.test(t));
  assert.ok(!/\bPro\b/.test(t));
  assert.ok(!/\bplan\b/i.test(t.replace(/board plan/gi, '')));
  assert.ok(!/\b\d+\s*(hours?|days?)\b/i.test(t), 'no exact hours or days');
  assert.ok(!/\badmin/i.test(t));
});

test('help page: with no JavaScript every question is visible (the search box starts hidden and only the script shows it)', () => {
  assert.match(HELP, /id="faqFind" hidden/);
  const open = HELP.match(/<details\b[^>]*>/g);
  open.forEach((tag) => assert.ok(!/\bhidden\b/.test(tag), tag));
  assert.match(HELP, /find\.hidden = false/);
});

const answer = (id) => {
  const m = HELP.match(new RegExp('<details class="q" id="' + id + '">[\\s\\S]*?</details>'));
  assert.ok(m, id);
  return m[0].replace(/<[^>]+>/g, ' ').replace(/&rsquo;/g, "'").replace(/\s+/g, ' ');
};

test('claims checked against the viewer code: doubles show the pair name only, and search matches name or club', () => {
  const a = answer('q-doubles');
  assert.ok(!/Name\/Name/.test(a) && !/either name/i.test(a) && !/both names are shown/i.test(a));
  assert.match(a, /pair name the organiser gave/);
  assert.match(a, /pair name or the club/);
  // what the code really does: the finder looks at name and org only
  assert.match(INDEX, /\(e\.name\|\|''\)\.toLowerCase\(\)\.indexOf\(q\)!==-1 \|\| \(e\.org\|\|''\)/);
});

test('claims checked against the viewer code: the Teams answers match what the page does', () => {
  const find = answer('q-teams-find'), header = answer('q-teams-header'), total = answer('q-teams-total');
  // the finder box: the code says "Find a team" for a Teams event and the search still looks at name and club
  assert.ok(INDEX.includes("function unitWord(plural){ return isTeamsEvent() ? (plural ? 'teams' : 'team')"));
  assert.ok(INDEX.includes("el('finder').placeholder = 'Find a '+unitWord()"));
  assert.match(find, /Find a team/); assert.match(find, /team name, or its club/);
  // the header line: the same words the code builds, and it replaces "best of legs" only for Teams
  assert.ok(INDEX.includes('if(isTeamsEvent(s)) return teamsParts(f);'));
  assert.ok(INDEX.includes("' per match'")); assert.ok(INDEX.includes("' + tie-breaker'"));
  assert.ok(header.includes('5 segments + tie-breaker per match')); assert.ok(header.includes('Round robin: 5 segments per match'));
  assert.match(header, /Group Boards events the groups and the Finals use the knockout setting/);
  // a result is the plain total of legs (the same fields every other match uses)
  assert.match(total, /total legs each team won across all its segments/);
  assert.ok(!/\bplan\b/i.test(find + header + total));
});

test('claims checked against the list rules: a finished but unfinalized event can drop off Live', () => {
  const a = answer('q-results-final');
  assert.ok(!/stays in Live, even if/.test(a));
  assert.match(a, /while the organiser is still updating it/);
  assert.match(a, /goes quiet for a while/);
  assert.match(a, /drops off the home page/);
  assert.ok(!/\b\d+\s*(hours?|days?)\b/i.test(a));
  const LV = read('api/_lib/listView.js');
  assert.match(LV, /else if \(a\.started\) \{ if \(age <= keep\.liveHours \* HOUR\) status = 'live'; \}/);
});

test('claims checked against index.html and render.js: Rounds/Chart defaults, NO-SHOW in the chart, polling, grid shading', () => {
  const a = answer('q-rounds-chart');
  assert.ok(!/always/i.test(a));
  assert.match(a, /32 or more\) open in Rounds unless you have chosen Chart/);
  assert.match(INDEX, /bracketPref!=='auto'\) return bracketPref;/);
  assert.match(INDEX, /b\.size>=32/);
  const labels = answer('q-match-labels');
  assert.match(labels, /Chart view a match nobody attended shows NO-SHOW beside both names/);
  assert.ok(read('render.js').includes('>NO-SHOW</span>'));
  assert.match(answer('q-grid'), /Shaded square/);
  assert.ok(!/Dark square/.test(HELP));
  assert.ok(!/small updates|only fetches/i.test(answer('q-slow')));
  assert.ok(!/paused publishing/.test(answer('q-stuck-scores')));
  assert.match(answer('q-refresh'), /about every 20 seconds/);
  assert.match(INDEX, /var POLL_MS = 20000;/);
});

test('Release 2 spectator answers: when and where, scores last changed, and the home page that cannot load', () => {
  const ids = [...HELP.matchAll(/<details class="q" id="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(ids.indexOf('q-when-where'), ids.indexOf('q-find-player') - 1, 'first in Finding a player');
  const w = answer('q-when-where');
  assert.match(w, /Group Boards events have a Boards tab/); assert.match(w, /Knockout events show a match as soon as both sides are known/);
  assert.match(w, /organiser calls each match at the venue/); assert.match(w, /ask at the organiser.s desk/);
  assert.ok(!/\bplan\b/i.test(w.replace(/board plan/gi, '')));
  assert.match(INDEX, /Board and time for each match are announced at the venue\. <a href="\/help#q-when-where">More<\/a>/);
  const stuck = answer('q-stuck-scores');
  assert.match(stuck, /Scores last changed/); assert.ok(!/you are up to date/.test(stuck)); assert.ok(!/\bUpdated\b/.test(stuck + answer('q-status-pill') + answer('q-refresh')));
  assert.match(answer('q-offline'), /Last checked/);
  assert.match(answer('q-home-cant-load'), /Try again/); assert.match(answer('q-home-cant-load'), /does not mean nothing is on/);
  assert.match(INDEX, /Scores last changed/); assert.ok(!/Updated '/.test(INDEX));
});

test('vercel.json: /help rewrites to /help.html and the event rewrite is still there', () => {
  const rw = VERCEL.rewrites;
  assert.ok(rw.some((r) => r.source === '/help' && r.destination === '/help.html'));
  assert.ok(rw.some((r) => r.source === '/live/:slug' && r.destination === '/index.html'));
  assert.deepEqual(VERCEL.regions, ['sin1']);
});

test('the event page and the home page link to /help', () => {
  assert.match(INDEX, /<footer>[^<]*<a href="\/help">Help<\/a><\/footer>/);
  assert.match(HOME, /<a class="hm-help" href="\/help">Help<\/a>/);
  assert.match(HOME, /class="hm-foot">[^']*<a href="\/help">Help<\/a>/);
});

test('the home page header still has its brand, search, tabs and theme button after adding Help', () => {
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(HOME, ctx, { filename: 'viewer/home.js' });
  const html = vm.runInContext('hmHeaderHTML()', ctx);
  ['hm-brand', 'id="hmTheme"', 'id="hmQ"', 'id="hmTabs"', 'id="hmOpen"', 'href="/help"'].forEach((s) => assert.ok(html.includes(s), s));
  assert.equal((html.match(/<div/g) || []).length, (html.match(/<\/div>/g) || []).length, 'divs are balanced');
});

// ---- the search filter ----
const script = HELP.match(/<script id="faq-filter">([\s\S]*?)<\/script>/);
test('help page: the search script is present', () => assert.ok(script));

const load = () => { const ctx = {}; vm.createContext(ctx); vm.runInContext(script[1], ctx, { filename: 'help.html#filter' }); return ctx; };
const node = () => ({ hidden: false, open: false });
const make = () => {
  const g1 = { node: node(), items: [{ node: node(), text: 'What do Live, Upcoming and Results mean?' }, { node: node(), text: 'How do I find a player? Type a name' }] };
  const g2 = { node: node(), items: [{ node: node(), text: 'The Bracket: Rounds and Chart views' }] };
  return [g1, g2];
};

test('search: an empty query shows every question and leaves the open ones as they are', () => {
  const f = load().faqFilter, groups = make();
  groups[0].items[0].node.open = true; groups[0].items[0].node.hidden = true;
  assert.equal(f(groups, ''), 3);
  groups.forEach((g) => { assert.equal(g.node.hidden, false); g.items.forEach((i) => { assert.equal(i.node.hidden, false); }); });
  assert.equal(groups[0].items[0].node.open, true, 'opened by the reader, so it stays open');
  assert.equal(f(groups, '   '), 3);
  assert.equal(f(groups, null), 3);
});

test('search: matches ignore case, need every word, and open the matching questions', () => {
  const f = load().faqFilter, groups = make();
  assert.equal(f(groups, 'BRACKET'), 1);
  assert.equal(groups[0].node.hidden, true, 'a group with no match is hidden');
  assert.equal(groups[1].node.hidden, false);
  assert.equal(groups[1].items[0].node.open, true);
  assert.equal(f(groups, 'find name'), 1);
  assert.equal(groups[0].items[0].node.hidden, true);
  assert.equal(groups[0].items[1].node.hidden, false);
  assert.equal(groups[1].node.hidden, true);
  assert.equal(f(groups, 'find bracket'), 0, 'both words must be in the same question');
  assert.equal(groups[0].node.hidden, true); assert.equal(groups[1].node.hidden, true);
  assert.equal(f(groups, 'zzzz'), 0);
});

test('search: clearing the box closes only what the search opened, not what the reader opened', () => {
  const f = load().faqFilter, groups = make();
  const mine = groups[1].items[0];
  mine.node.open = true;                       // the reader opened this one by hand
  f(groups, 'find');                           // opens the player question; the bracket one is hidden but stays open
  assert.equal(groups[0].items[1].node.open, true);
  assert.equal(mine.node.open, true);
  f(groups, 'bracket');                        // the player question stops matching: the search closes what it opened
  assert.equal(groups[0].items[1].node.open, false);
  assert.equal(mine.node.open, true, 'already open, so the search does not own it');
  f(groups, '');
  assert.equal(mine.node.open, true, 'still open after clearing');
  f(groups, 'live');                           // opens the first question
  assert.equal(groups[0].items[0].node.open, true);
  f(groups, '');
  assert.equal(groups[0].items[0].node.open, false, 'opened by the search, closed when it is cleared');
});

test('search: clearing the box brings everything back', () => {
  const f = load().faqFilter, groups = make();
  f(groups, 'zzzz');
  assert.equal(f(groups, ''), 3);
  groups.forEach((g) => { assert.equal(g.node.hidden, false); g.items.forEach((i) => assert.equal(i.node.hidden, false)); });
});

test('search: the page wiring shows the box, filters as you type, and shows the no-match message', () => {
  const els = {}, listeners = {};
  const el = (id) => (els[id] = els[id] || { id, hidden: true, textContent: '', value: '', addEventListener: (ev, fn) => { listeners[id + ':' + ev] = fn; } });
  const q = (text) => ({ hidden: false, open: false, textContent: text, tagName: 'DETAILS' });
  const d1 = q('Scores not moving'), d2 = q('Light and dark switch'), d3 = q('Bracket rounds');
  const grp = (items) => ({ hidden: false, querySelectorAll: () => items });
  const g1 = grp([d1, d2]), g2 = grp([d3]);
  ['faqSearch', 'faqFind', 'faqStatus', 'faqNone'].forEach(el);
  els.faqNone.hidden = true;
  const toggles = [], winL = {};
  [d1, d2, d3].forEach((d) => { d.addEventListener = (ev, fn) => { if (ev === 'toggle') toggles.push([d, fn]); }; });
  els.q3 = d3; d3.closest = () => g2;
  const doc = { getElementById: (id) => els[id] || null, querySelectorAll: (sel) => (sel === '.help-grp' ? [g1, g2] : []) };
  const ctx = { document: doc, location: { hash: '' }, window: { addEventListener: (ev, fn) => { winL[ev] = fn; } }, decodeURIComponent, Array, String };
  vm.createContext(ctx);
  vm.runInContext(script[1], ctx);
  assert.equal(els.faqFind.hidden, false, 'search box is shown once the script runs');
  els.faqSearch.value = 'bracket'; listeners['faqSearch:input']();
  assert.equal(d3.hidden, false); assert.equal(d1.hidden, true); assert.equal(g1.hidden, true);
  assert.equal(els.faqStatus.textContent, '1 question matches'); assert.equal(els.faqNone.hidden, true);
  els.faqSearch.value = 'nothing here'; listeners['faqSearch:input']();
  assert.equal(els.faqNone.hidden, false); assert.equal(els.faqStatus.hidden, true);
  els.faqSearch.value = ''; listeners['faqSearch:input']();
  assert.equal(d1.hidden, false); assert.equal(g1.hidden, false); assert.equal(els.faqNone.hidden, true);
  // the reader touches a question that a search had opened: the toggle listener takes it out of the search's hands
  els.faqSearch.value = 'scores'; listeners['faqSearch:input']();
  assert.equal(d1.open, true);
  const fire = (d) => toggles.forEach(([x, fn]) => { if (x === d) fn(); });
  fire(d1);                                  // the script's own change: nothing happens
  d1.open = false; fire(d1);                 // the reader closed it
  d1.open = true; fire(d1);                  // and opened it again themselves
  els.faqSearch.value = ''; listeners['faqSearch:input']();
  assert.equal(d1.open, true, 'a question the reader touched stays open when the search is cleared');
  // an address like /help#q3 opens that question, also when the address changes later
  assert.equal(typeof winL.hashchange, 'function');
  g2.hidden = true; d3.hidden = true; d3.open = false; ctx.location.hash = '#q3'; winL.hashchange();
  assert.equal(d3.open, true); assert.equal(d3.hidden, false); assert.equal(g2.hidden, false);
});

test('help page: the theme script uses the same stored key as the event and home pages', () => {
  assert.match(HELP, /<script id="faq-theme">[\s\S]*?var KEY = 'dartdraw\.viewer\.theme'/);
  assert.match(INDEX, /var THEME_KEY = 'dartdraw\.viewer\.theme'/);
  assert.match(HOME, /HM_THEME_KEY = 'dartdraw\.viewer\.theme'/);
});

test('the Teams help states the level rules the organiser app enforces: a draw in a round robin without a tie-breaker, never in a knockout', () => {
  assert.match(HELP, /a level result is a draw in a round robin/);
  assert.match(HELP, /a knockout match is not allowed to end level/);
  assert.match(HELP, /best of a set number of legs/);
  assert.match(HELP, /when that stage uses a tie-breaker \(it is only played if the totals are level\)/);
});

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
    'Teams', 'Find a team', 'segments', 'tie-breaker', 'total legs', 'QR', 'Auto / Light / Dark', 'No. You can look', 'about every 20 seconds', 'We can', 'Results not available',
    // Release 4 and 5: the glossary, the keys, who goes through, walkovers in full, the Plate pool, Start here and Quick answers
    'Words you will see', 'What do the columns mean?', 'What do the labels mean?', 'Top 2 in each group go through to the knockout', 'by walkover',
    'Plate pool', 'New here? Three things to know', 'Quick answers', 'Back to the event', 'opens on the part of the event being played now'].forEach((w) => assert.ok(t.includes(w), 'mentions ' + w));
});

test('Release 5 outline (kb-review F2): groups in order, Quick answers and Start here first, every old anchor still on the page', () => {
  const groups = [...HELP.matchAll(/<section class="help-grp" id="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(groups, ['g-players', 'g-fresh', 'g-results', 'g-kinds', 'g-home', 'g-trouble', 'g-glossary', 'g-privacy']);
  const pg = loadHelp('spectator');
  // the 40 ids of the old outline, and its group ids, still resolve (as questions, or as headings inside the new groups)
  ['q-live-upcoming-results', 'q-missing-event', 'q-results-final', 'q-search-events', 'q-home-cant-load', 'q-tabs', 'q-status-pill', 'q-refresh',
    'q-stages', 'q-when-where', 'q-find-player', 'q-me-following', 'q-player-status', 'q-columns', 'q-points', 'q-ties', 'q-tb-badges', 'q-grid',
    'q-green-bar', 'q-rounds-chart', 'q-match-labels', 'q-winner', 'q-group-boards', 'q-boards-tab', 'q-group-picker', 'q-doubles', 'q-teams-match',
    'q-teams-total', 'q-teams-find', 'q-teams-header', 'q-qr', 'q-share', 'q-theme', 'q-account', 'q-saved', 'q-what-shown', 'q-stuck-scores',
    'q-offline', 'q-not-available', 'q-no-player', 'q-no-name', 'q-slow',
    'g-home', 'g-event', 'g-players', 'g-tables', 'g-brackets', 'g-boards', 'g-doubles', 'g-teams', 'g-links', 'g-look', 'g-privacy', 'g-trouble'].forEach((id) => assert.ok(pg.byId(id), id));
  // the new answers
  ['q-come-back', 'q-ties-three', 'q-plate', 'q-wrong-score', 'q-glossary'].forEach((id) => assert.ok(pg.byId(id) && pg.byId(id).tagName.toLowerCase() === 'details', id));
  // Start here and Quick answers come before the first group, and step aside while a search shows results
  assert.ok(HELP.indexOf('id="start"') < HELP.indexOf('id="quick"') && HELP.indexOf('id="quick"') < HELP.indexOf('id="g-players"'));
  const qa = pg.byId('quick').querySelectorAll('a').map((a) => a.getAttribute('href'));
  assert.deepEqual(qa, ['#q-find-player', '#q-status-pill', '#q-columns']);
  ['Where is my player?', 'Is it live?', 'What do the columns mean?'].forEach((w) => assert.ok(pg.byId('quick').textContent.includes(w), w));
  pg.type('bracket');
  assert.equal(pg.byId('start').hidden, true); assert.equal(pg.byId('quick').hidden, true);
  pg.type('');
  assert.equal(pg.byId('start').hidden, false); assert.equal(pg.byId('quick').hidden, false);
});

test('glossary: one entry per word with its own anchor, linked from the answers that use the words; #glossary opens it', () => {
  const g = answer('q-glossary');
  ['Leg', 'Best of', 'Seed', 'A1, B2', 'Match codes', 'Bye', 'Walkover (WO)', 'No-show', 'Board', 'MP, MW, ML', 'TB, tie-break, tie-breaker', 'H2H', '3-way LD',
    'Qualify', 'Plate pool', 'Group Boards', 'Final results', 'Segment', 'Pair'].forEach((w) => assert.ok(g.includes(w), w));
  ['glossary-leg', 'glossary-seed', 'glossary-match-codes', 'glossary-wo', 'glossary-tb', 'glossary-3way', 'glossary-qualify', 'glossary-segment', 'glossary-pair'].forEach((id) => assert.match(HELP, new RegExp('<h4 id="' + id + '">')));
  assert.match(g, /Won 2&ndash;0 by walkover/); assert.match(g, /G2&middot;1-1/);
  // linked from answers that use the words, and from the event page's keys and Start card
  assert.match(HELP, /href="#glossary-match-codes"/); assert.match(HELP, /href="#glossary-seed"/); assert.match(HELP, /href="#glossary"/);
  assert.match(INDEX, /helpHref\('glossary'\)/); assert.match(HOME, /#glossary/);
  const pg = loadHelp('spectator', { hash: '#glossary-wo' });
  assert.equal(pg.byId('q-glossary').open, true);
  const pg2 = loadHelp('spectator', { hash: '#glossary' });
  assert.equal(pg2.byId('q-glossary').open, true);
  // the TB badge and the Teams tie-breaker are told apart; 3-way LD is what render.js badges
  assert.match(g, /TB in a group table is the tie-break badge/); assert.match(g, /tie-breaker in a Teams event is different/);
  assert.ok(read('render.js').includes("(st.tieSize>2?st.tieSize+'-way ':'')"));
});

test('"Back to the event": Help shows it only for a valid ?from= code and builds the link from that code alone', () => {
  const script = HELP.match(/<script id="faq-from">([\s\S]*?)<\/script>/)[1];
  const run = (search) => {
    const links = { helpBack: { hidden: true, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } }, helpBackEnd: { hidden: true, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } } };
    const ctx = { document: { getElementById: (id) => links[id] || null }, location: { search }, decodeURIComponent };
    vm.createContext(ctx); vm.runInContext(script, ctx);
    return links;
  };
  const ok = run('?from=chrsopensing1');
  assert.equal(ok.helpBack.hidden, false); assert.equal(ok.helpBack.attrs.href, '/live/chrsopensing1');
  assert.equal(ok.helpBackEnd.hidden, false);
  ['', '?from=', '?from=short', '?from=UPPERCASEslug1', '?from=%22%3E%3Cscript%3E', '?from=javascript:alert(1)', '?from=abc/../../x12345', '?from=%E0%A4%A'].forEach((s) => {
    const l = run(s);
    assert.equal(l.helpBack.hidden, true, s); assert.equal(l.helpBack.attrs.href, undefined, s);
  });
  assert.match(HELP, /<a class="help-back" id="helpBack" href="\/" hidden>/);
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
  assert.match(HELP, /id="faqFind"[^>]* hidden>/);
  const open = HELP.match(/<details\b[^>]*>/g);
  open.forEach((tag) => assert.ok(!/\bhidden\b/.test(tag), tag));
  assert.match(HELP, /reveal: document\.getElementById\('faqFind'\)/);
});

const answer = (id) => {
  const m = HELP.match(new RegExp('<details class="q" id="' + id + '"[^>]*>[\\s\\S]*?</details>'));
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
  assert.match(INDEX, /Board and time for each match are announced at the venue\. <a href="'\+escapeHtml\(helpHref\('q-when-where'\)\)\+'">More<\/a>/);
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

// ---- the search ----
// The page runs the shared module (viewer/help-search.js, a synced copy of the root help-search.js) and a small script
// that hands it the questions. tests/lib/help-pages.js loads the real page into a small DOM and runs both.
const { loadHelp } = require('./lib/help-pages');
const shownQ = (pg) => pg.doc.querySelectorAll('details.q').filter((d) => !d.hidden).map((d) => d.id);
const shownG = (pg) => pg.doc.querySelectorAll('.help-grp').filter((g) => !g.hidden).map((g) => g.id);
const links = (pg) => pg.byId('faqResults').querySelectorAll('a').filter((a) => a.getAttribute('data-id'));
const ALLQ = (HELP.match(/<details class="q" /g) || []).length;

test('help page: the search loads the shared module, the page data, then the script that wires them; the old filter is gone', () => {
  const i = HELP.indexOf('<script src="/help-search.js"></script>'), j = HELP.indexOf('<script type="application/json" id="helpSearchData">'), k = HELP.indexOf('<script id="faq-search">');
  assert.ok(i > 0 && i < j && j < k, 'module, data, page script, in that order');
  assert.ok(!/faqFilter|id="faq-filter"/.test(HELP), 'the substring filter is gone');
  const data = JSON.parse(HELP.match(/<script type="application\/json" id="helpSearchData">([\s\S]*?)<\/script>/)[1]);
  assert.ok(data.synonyms.length >= 20 && data.noAnswer.length >= 3);
  assert.ok(data.synonyms.some((g) => g.includes('son') && g.includes('find a player')), 'where is my son');
  assert.ok(data.synonyms.some((g) => g.includes('wo') && g.includes('walkover')));
  assert.ok(fs.readFileSync(path.join(VIEWER, 'help-search.js')).equals(fs.readFileSync(path.join(VIEWER, '..', 'help-search.js'))), 'the viewer copy is current');
  // every question carries keywords, plain words only
  const kw = [...HELP.matchAll(/<details class="q" id="[^"]+" data-keywords="([^"]*)">/g)];
  assert.equal(kw.length, ALLQ);
  kw.forEach((m) => assert.match(m[1], /^[a-z0-9 ]+$/));
});

test('search: the box appears once the script runs; with nothing typed every question shows and nothing else', () => {
  const pg = loadHelp('spectator');
  assert.equal(pg.byId('faqFind').hidden, false);
  assert.equal(shownQ(pg).length, ALLQ);
  assert.equal(pg.byId('faqResults').hidden, true);
  assert.equal(pg.byId('faqNone').hidden, true);
  assert.equal(pg.byId('faqStatus').hidden, true);
});

test('search: "where is my son" lists the finding answers first; a list of titles with snippets, not every answer opened', () => {
  const pg = loadHelp('spectator');
  pg.type('where is my son');
  const ls = links(pg);
  assert.ok(ls.length >= 2);
  assert.equal(ls[0].getAttribute('href'), '#q-find-player');
  assert.equal(ls[0].querySelector('.hs-title').textContent, 'How do I find a player?');
  assert.ok(ls[0].querySelector('.hs-snip').textContent.length > 20);
  assert.equal(pg.byId('faqStatus').hidden, false);
  const total = pg.controller.search('where is my son').results.length;
  assert.equal(pg.byId('faqStatus').textContent, total + ' questions match');
  assert.equal(ls.length, Math.min(total, 8), 'at most 8 at first');
  assert.ok(pg.doc.querySelectorAll('details.q').every((d) => !d.open), 'nothing is opened when no answer is clearly best');
});

test('search: "WO" finds the walkover answers only, not "two" or "would"; the labels answer first, then the glossary word, and a pick opens with WO marked', () => {
  const pg = loadHelp('spectator');
  pg.type('WO');
  const ls = links(pg), ids = ls.map((a) => a.getAttribute('data-id'));
  assert.deepEqual(ids.slice(0, 2), ['q-match-labels', 'q-glossary']);
  assert.equal(ls[1].getAttribute('href'), '#glossary-wo', 'the glossary result lands on its WO entry');
  assert.ok(!ids.includes('q-stages') && !ids.includes('q-qr'), ids.join());
  pg.click(ls[0]);
  const top = pg.byId('q-match-labels');
  assert.deepEqual(shownQ(pg), ['q-match-labels']);
  assert.equal(top.open, true);
  const marks = top.querySelectorAll('mark').map((m) => m.textContent);
  assert.ok(marks.includes('WO'), marks.join());
  assert.ok(!marks.some((m) => /two|would/i.test(m)));
  assert.deepEqual(shownG(pg), ['g-results'], 'only its group shows');
});

test('search: clearing closes only what the search opened, not what the reader opened, and keeps a chosen answer open', () => {
  const pg = loadHelp('spectator');
  const mine = pg.byId('q-theme');
  mine.open = true; pg.doc.flush();               // opened by hand
  pg.type('refresh');                             // opens q-refresh by itself
  assert.equal(pg.byId('q-refresh').open, true);
  pg.type('');
  assert.equal(pg.byId('q-refresh').open, false, 'opened by the search, closed when it is cleared');
  assert.equal(mine.open, true, 'the reader’s own stays open');
  assert.equal(shownQ(pg).length, ALLQ);
  assert.equal(shownG(pg).length, pg.doc.querySelectorAll('.help-grp').length);
  // a question the reader picks from the list is theirs
  pg.type('team');
  const pick = links(pg).find((a) => a.getAttribute('data-id') === 'q-teams-total');
  pg.click(pick);
  assert.deepEqual(shownQ(pg), ['q-teams-total']);
  assert.equal(pg.byId('q-teams-total').open, true);
  pg.key('Escape');
  assert.equal(pg.input.value, '');
  assert.equal(pg.byId('q-teams-total').open, true, 'chosen by the reader, so it stays open');
  assert.equal(pg.doc.querySelectorAll('mark').length, 0);
  // the reader closing and reopening a question the search opened takes it out of the search's hands
  pg.type('refresh');
  const r = pg.byId('q-refresh');
  r.open = false; pg.doc.flush(); r.open = true; pg.doc.flush();
  pg.type('');
  assert.equal(r.open, true);
});

test('search: no answer shows what was typed, the honest line when the Help knows it has none, and popular questions', () => {
  const pg = loadHelp('spectator');
  pg.type('<i>zzz</i>');
  assert.equal(pg.byId('faqNone').hidden, false);
  assert.equal(pg.byId('faqNoneQ').textContent, '<i>zzz</i>', 'text, never HTML');
  assert.equal(pg.byId('faqSay').hidden, true);
  assert.equal(pg.byId('faqStatus').textContent, '0 questions match');
  assert.deepEqual(shownQ(pg), []);
  const hrefs = pg.byId('faqNone').querySelectorAll('a').map((a) => a.getAttribute('href'));
  assert.ok(hrefs.length >= 3 && hrefs.length <= 5);
  hrefs.forEach((h) => assert.ok(pg.byId(h.slice(1)), h + ' exists'));
  assert.match(pg.byId('faqNone').textContent, /Try fewer words/);
  assert.match(pg.byId('faqNone').textContent, /Ask the organiser at the venue desk/);
  pg.type('notify');
  assert.equal(pg.byId('faqSay').hidden, false);
  assert.match(pg.byId('faqSay').textContent, /can.t send notifications/);
  pg.type('language');
  assert.match(pg.byId('faqSay').textContent, /English only/);
  pg.type('');
  assert.equal(pg.byId('faqNone').hidden, true);
});

test('search: a group title counts ("privacy" finds the Privacy questions), and a typo still finds a close match', () => {
  const pg = loadHelp('spectator');
  const p = pg.controller.search('privacy').results.map((r) => r.id);
  ['q-account', 'q-saved', 'q-what-shown'].forEach((id) => assert.ok(p.slice(0, 3).includes(id), id));
  const t = pg.controller.search('walkovr');
  assert.equal(t.results[0].id, 'q-match-labels');
  assert.equal(t.clear, false, 'a guessed spelling is offered, not opened');
});

test('search: an address like /help#q-ties opens that question, on load and when the address changes, even mid-search', () => {
  const pg = loadHelp('spectator', { hash: '#q-ties' });
  assert.equal(pg.byId('q-ties').open, true);
  pg.type('qr');
  assert.deepEqual(shownQ(pg), ['q-qr']);
  pg.goTo('#q-tb-badges');                         // not a result: the search is cleared so it can show
  assert.equal(pg.input.value, '');
  assert.equal(pg.byId('q-tb-badges').open, true);
  assert.equal(pg.byId('q-tb-badges').hidden, false);
  assert.equal(pg.byId('g-tables').hidden, false);
});

test('search: Enter opens the top result, ArrowDown moves into the list and ArrowUp back to the box', () => {
  const pg = loadHelp('spectator');
  pg.type('who plays next');
  const e = pg.key('Enter');
  assert.equal(e.defaultPrevented, true);
  assert.equal(pg.hash, '#q-player-status');
  assert.equal(pg.byId('q-player-status').open, true);
  pg.type('bracket');
  pg.key('ArrowDown');
  const ls = links(pg);
  assert.equal(pg.doc.activeElement, ls[0]);
  const down = { type: 'keydown', key: 'ArrowDown', preventDefault() {} };
  pg.byId('faqResults').dispatchEvent(Object.assign(down, { target: ls[0] }));
  assert.equal(pg.doc.activeElement, ls[1]);
  pg.byId('faqResults').dispatchEvent({ type: 'keydown', key: 'ArrowUp', target: ls[1], preventDefault() {} });
  pg.byId('faqResults').dispatchEvent({ type: 'keydown', key: 'ArrowUp', target: ls[0], preventDefault() {} });
  assert.equal(pg.doc.activeElement, pg.input);
});

test('help.css: results, marks and the no-answer box are styled; result rows are big enough to tap', () => {
  const css = read('help.css');
  ['.hs-link{', '.hs-title{', '.hs-snip{', 'mark.hs-mark{', '.none-list{', '.help-results{'].forEach((s) => assert.ok(css.includes(s), s));
  assert.match(css, /\.hs-link\{[^}]*padding:12px/);
  assert.match(css, /\.hs-link\{[^}]*overflow-wrap:anywhere/);
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

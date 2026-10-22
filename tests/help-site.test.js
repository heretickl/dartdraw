const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The public Help page (/help): an organiser guide and FAQ. The words are in scripts/help-content.js, the layout in
// scripts/build-landing.js, and help.html is generated (npm run build-landing). This file checks the page is in step with
// its sources, that every header and footer links to it, that the app links to it, that the contents list and anchors
// work, that the search filter works (the page script runs in a vm with a stub browser), that nothing forbidden is
// said, and that the exact button and message names the guide quotes still exist in app.html.
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const { render } = require('../scripts/build-landing');
const content = require('../scripts/help-content');

const PUBLIC_PAGES = ['index.html', 'features.html', 'how-it-works.html', 'help.html'];
const help = read('help.html');
const app = read('app.html');
const markup = (s) => s.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
const scripts = (s) => [...s.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const text = (s) => markup(s).replace(/<\/?(p|li|ul|ol|div|dd|dt|dl|h[1-6]|summary|details|article|section|br|nav|form|label|input|header|footer|main)\b[^>]*>/g, ' ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&ndash;/g, '\u2013').replace(/&amp;/g, '&').replace(/&lsquo;/g, '\u2018').replace(/&rsquo;/g, '\u2019').replace(/&ldquo;|&rdquo;/g, '"').replace(/&mdash;/g, '—').replace(/&hellip;/g, '…').replace(/&rarr;/g, '→').replace(/&#8599;/g, '↗').replace(/\s+/g, ' ');
const ids = (s) => [...markup(s).matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);

// ---------- the page is generated from its sources ----------
test('help.html is in the repo, and is exactly what the generator makes from scripts/help-content.js', () => {
  assert.ok(fs.existsSync(path.join(root, 'help.html')), 'help.html exists');
  assert.equal(help, render()['help.html'], 'help.html differs from the generator output; run: npm run build-landing');
});

test('help-content.js is plain data: sections of items, each with a unique id, a title and a body', () => {
  assert.ok(Array.isArray(content.sections) && content.sections.length >= 2);
  const seen = new Set(['top', 'helpSearch', 'helpQ', 'helpCount', 'helpEmpty', 'helpEmptyQ', 'helpToc', 'main', 'loginDlg', 'loginFrame', 'closeH', 'helpH']);
  content.sections.forEach((sec) => {
    assert.match(sec.id, /^[a-z][a-z0-9-]*$/, 'section id ' + sec.id);
    assert.ok(['guide', 'faq'].includes(sec.kind), sec.id + ' kind');
    assert.ok(sec.title && sec.items.length > 0, sec.id);
    assert.ok(!seen.has(sec.id), 'duplicate id ' + sec.id);
    seen.add(sec.id);
    sec.items.forEach((it) => {
      assert.match(it.id, /^[a-z][a-z0-9-]*$/, 'item id ' + it.id);
      assert.ok(!seen.has(it.id), 'duplicate id ' + it.id);
      seen.add(it.id);
      assert.ok(String(it.title).trim().length > 3, it.id + ' title');
      assert.ok(String(it.body).replace(/<[^>]+>/g, '').trim().length > 40, it.id + ' body');
      assert.doesNotMatch(it.body + it.title, /<script|<style|<iframe|\son\w+=/i, it.id + ' has active content');
    });
  });
});

test('the page is a complete document with the shared header, footer and login dialog, and the Help link is the current page', () => {
  assert.match(help, /^<!doctype html>/i);
  assert.match(help, /<title>[^<]*Help[^<]*DartDraw[^<]*<\/title>/);
  assert.match(help, /<h1 id="helpH">Help for organisers<\/h1>/);
  assert.match(help, /<nav class="nav-links" aria-label="Main">[\s\S]*<a href="\/help" aria-current="page">Help<\/a>[\s\S]*<\/nav>/);
  assert.match(help, /<dialog id="loginDlg"/);
  assert.match(help, /<a class="btn[^"]*" href="\/login\.html" data-login>/);
  // the sign-in pop-up script stays the LAST script, as on every other public page
  const js = scripts(help);
  assert.match(js[js.length - 1], /getElementById\('loginDlg'\)/);
});

// ---------- links to Help everywhere ----------
test('every public page has a Help link in its header nav and in its footer nav', () => {
  PUBLIC_PAGES.forEach((p) => {
    const h = read(p);
    const header = (h.match(/<nav class="nav-links"[^>]*>([\s\S]*?)<\/nav>/) || [])[1] || '';
    const footer = (h.match(/<nav class="foot-nav"[^>]*>([\s\S]*?)<\/nav>/) || [])[1] || '';
    assert.match(header, /<a href="\/help"[^>]*>Help<\/a>/, p + ' header');
    assert.match(footer, /<a href="\/help">Help<\/a>/, p + ' footer');
    // the other links are still there
    assert.match(header, /href="\/features"/, p);
    assert.match(header, /href="\/how-it-works"/, p);
    assert.match(footer, /href="\/features"/, p);
    assert.match(footer, /href="\/how-it-works"/, p);
  });
});

test('only the Help page marks Help as the current page', () => {
  PUBLIC_PAGES.forEach((p) => {
    const marked = /<a href="\/help" aria-current="page">/.test(read(p));
    assert.equal(marked, p === 'help.html', p);
  });
});

test('vercel.json rewrites /help to help.html', () => {
  const cfg = JSON.parse(read('vercel.json'));
  const r = cfg.rewrites.find((x) => x.source === '/help');
  assert.ok(r, 'rewrite for /help');
  assert.equal(r.destination, '/help.html');
  assert.ok(fs.existsSync(path.join(root, 'help.html')));
});

test('the organiser app has a Help link in its top bar that opens /help in a new tab, safely', () => {
  const topbar = (app.match(/<div class="topbar">([\s\S]*?)<div id="stageArea">/) || [])[1] || '';
  const link = topbar.match(/<a [^>]*href="\/help"[^>]*>([^<]*)<\/a>/);
  assert.ok(link, 'a link to /help in the top bar');
  assert.equal(link[1], 'Help');
  assert.match(link[0], /target="_blank"/);
  assert.match(link[0], /rel="noopener"/);
  // it sits outside the area a finalized event locks, and the full-page window (which hides the top bar) does not need it
  assert.ok(!/id="stageArea"/.test(topbar));
});

// ---------- the contents list and the anchors ----------
test('every in-page link on the Help page points at an element that exists, and ids are unique', () => {
  const all = ids(help);
  assert.equal(new Set(all).size, all.length, 'duplicate ids: ' + all.filter((x, i) => all.indexOf(x) !== i));
  const hrefs = [...markup(help).matchAll(/href="#([^"]*)"/g)].map((m) => m[1]);
  assert.ok(hrefs.length > 40);
  hrefs.forEach((h) => assert.ok(all.includes(h), 'href="#' + h + '" has no target'));
  assert.ok(all.includes('top'), 'Back to top target');
  assert.ok((markup(help).match(/href="#top"/g) || []).length >= content.sections[0].items.length, 'a Back to top link after every guide article');
});

test('the contents list has a link for every guide article and for the questions, and each data-toc points at a real item', () => {
  const toc = (help.match(/<nav class="help-toc"[\s\S]*?<\/nav>/) || [])[0];
  assert.ok(toc, 'contents nav');
  const guide = content.sections.find((s) => s.kind === 'guide');
  guide.items.forEach((it) => {
    assert.ok(toc.includes('<li data-toc="' + it.id + '"><a href="#' + it.id + '">'), it.id + ' in contents');
    assert.match(help, new RegExp('<article class="harticle" id="' + it.id + '" data-item'), it.id + ' article');
  });
  const faq = content.sections.find((s) => s.kind === 'faq');
  assert.ok(toc.includes('<li data-toc="faq"><a href="#faq">'), 'questions in contents');
  [...toc.matchAll(/data-toc="([^"]+)"/g)].forEach((m) => assert.ok(ids(help).includes(m[1]), 'data-toc ' + m[1]));
  assert.match(help, /<h2 class="hgroup" id="faq" data-group-head="faq">/);
  assert.equal(faq.id, 'faq');
});

test('the contents list is a folding list that is open without JavaScript, and the search box is hidden without it', () => {
  assert.match(help, /<details id="helpToc" open>\s*<summary>/);
  assert.match(help, /<form class="hsearch" id="helpSearch" role="search" hidden>/);
  // every searchable item is in the HTML as written: with no script, nothing is hidden
  assert.doesNotMatch(markup(help), /<(article|details)[^>]*\shidden/);
  assert.doesNotMatch(markup(help), /<li data-toc[^>]*\shidden/);
});

// ---------- FAQ ----------
test('the FAQ is a list of <details> accordions, each with a <summary> and an answer, at least 15 of them', () => {
  const faq = [...help.matchAll(/<details class="faq"[^>]*>([\s\S]*?)<\/details>/g)];
  assert.ok(faq.length >= 15, 'only ' + faq.length + ' questions');
  assert.equal(faq.length, content.sections.find((s) => s.kind === 'faq').items.length);
  faq.forEach((m, i) => {
    assert.match(m[1].trim(), /^<summary>[\s\S]+?<\/summary>\s*<div class="faq-body">[\s\S]{30,}<\/div>$/, 'question ' + (i + 1));
  });
  // every <details> on the page (the contents list too) starts with a summary
  const all = [...markup(help).matchAll(/<details\b[^>]*>\s*(<[a-z]+)/g)];
  assert.ok(all.length >= 16);
  all.forEach((m) => assert.equal(m[1], '<summary', 'a <details> without a <summary>'));
  const titles = faq.map((m) => text(m[1].match(/<summary>([\s\S]*?)<\/summary>/)[1]));
  titles.forEach((t) => assert.match(t, /\?$|^[A-Z]/));
  assert.ok(titles.some((t) => /two events at once/.test(t)));
  assert.ok(titles.some((t) => /offline/.test(t)));
  assert.ok(titles.some((t) => /after the event is finalized/.test(t)));
  assert.ok(titles.some((t) => /names of players in a pair/.test(t)));
  assert.ok(titles.some((t) => /result of a team match/.test(t)));
  assert.ok(titles.some((t) => /not on the public home page/.test(t)));
  assert.ok(titles.some((t) => /tie-breaks/.test(t)));
});

// ---------- the guide ----------
test('the guide covers the topics organisers need, each as an anchored article', () => {
  const need = {
    'getting-started': ['Forgot password?', 'Change password', 'Event creation', 'Format & branding', 'Chart details', 'Confirm & Print Bracket', 'Manage Tournament', 'Finalize Standings', 'Print Final Chart', 'Basic setup', 'Advanced setup', 'Saved', 'Updated elsewhere', 'Couldn’t save'],
    'creating-an-event': ['Singles', 'Doubles', 'Teams', 'pair', 'Team name', 'Number of entries', 'Tournament date'],
    'choosing-a-format': ['Round robin', 'Knockout', 'Knockout type', 'Single bracket', 'Group Boards, then finals', 'not offered with the round robin formats', 'Plate pool', 'Best of legs', 'Optional'.toLowerCase()],
    'entries-and-check-in': ['Check-in', 'Withdraw', 'Mark no-show', 'Neither showed', 'Organisation', 'Seed', 'whether or not one of the tick boxes is on', 'keeping entries from the same group apart comes first', 'about a second of work at most'],
    'draws-and-printing': ['Random draw', 'Print bracket pack', 'rules', 'sponsor', 'QR'],
    'managing-the-tournament': ['Start all games', 'Save score', 'Boards', 'incident'],
    'full-page-window': ['Open in new window', 'F11', 'pop-up'],
    'publishing-results': ['Publish results', 'List on the public page', 'every 20 seconds', 'entry names'],
    'teams': ['segment', 'Team match segments (played in order)', '+ Add segment', 'Singles', 'Doubles', 'Trios', 'Foursome', '301', '1001', 'A tie-breaker might be needed', 'Save score', 'at most 10 legs', '9, or 10 in a stage that uses the tie-breaker', 'draw', 'refused', 'never changes what you typed', 'Use a tie-breaker in round robin matches', 'Use a tie-breaker in knockout matches', 'locked', 'at most 8', 'Save format & branding', 'lineup', 'TOTAL POINTS', 'TIE-BREAKER', 'Basic and Advanced', 'one board', 'Start round', 'called to its board', 'never off', 'drawn result', 'deciding leg', 'must be odd', 'competition type (step 1) of a Teams event', 'when it is used', 'large space for the captain'],
    'finishing-the-event': ['Accept & finalize', 'Final results', 'Only an Admin can reopen'],
    'troubleshooting': ['Save as PDF', 'pop-up', 'Updated elsewhere']
  };
  Object.keys(need).forEach((id) => {
    const m = help.match(new RegExp('<article class="harticle" id="' + id + '"[\\s\\S]*?</article>'));
    assert.ok(m, 'article ' + id);
    const t = text(m[0]).toLowerCase();
    need[id].forEach((w) => assert.ok(t.includes(w.toLowerCase()), id + ' should mention "' + w + '"'));
  });
});

test('the full-page window section explains when, how, pop-ups, scoring, keeping windows in step and the empty states', () => {
  const sec = (help.match(/<article class="harticle" id="full-page-window"[\s\S]*?<\/article>/) || [])[0];
  assert.ok(sec, 'full-page-window article');
  const t = text(sec);
  assert.match(t, /Open in new window/);
  ['Round robin ↗', 'Winners bracket ↗', 'Plate pool ↗'].forEach((b) => assert.ok(t.includes(b), b));
  assert.match(t, /no left-hand menu and no top bar/);
  assert.match(t, /second monitor/);
  assert.match(t, /projector/);
  assert.match(t, /pop-ups?/);
  assert.match(t, /Your browser blocked the new window — allow pop-ups for this site, then click the button again\./, 'quotes the blocked pop-up message');
  assert.match(fnBody(app, 'openInNewWindow'), /if\(!win\) popupBlockedModal\(\)/, 'and the app shows it when window.open gives nothing');
  assert.ok(app.includes("POPUP_BLOCKED_MSG = 'Your browser blocked the new window — allow pop-ups for this site, then click the button again.'"));
  // its header has the save status and Print
  assert.match(t, /the save status \(such as Saved\) and a Print button/);
  assert.match(fnBody(app, 'popoutToolsHTML'), /id="popoutSaveStatus"/);
  assert.match(t, /F11/);
  assert.match(t, /do not update each other/);
  assert.match(t, /F5/);
  assert.match(t, /No bracket yet — generate one in Confirm & Print Bracket, then reopen this window\./);
  assert.match(t, /No confirmed charts yet — confirm at least one group in Confirm & Print Bracket, then reopen this window\./);
  assert.match(t, /This event is finalized\. Your change was not saved; only an Admin can change it\./);
  assert.match(t, /Group Boards events do not have this window/);
  // it never claims the windows sync, and the guide's TOC links to it
  assert.doesNotMatch(t, /updates? (itself|automatically)|stay in sync|synchron/i);
  assert.match(help, /<li data-toc="full-page-window"><a href="#full-page-window">/);
});

test('the guide links to the spectators’ help page on the public results site (the address used elsewhere in the repo)', () => {
  assert.equal(content.VIEWER_HELP_URL, content.VIEWER_URL + '/help');
  assert.ok(read('README.md').includes(content.VIEWER_URL), 'the same viewer address appears in the README');
  const link = markup(help).match(new RegExp('<a href="' + content.VIEWER_HELP_URL.replace(/[.]/g, '\\.') + '"[^>]*>'));
  assert.ok(link, 'link to the spectators’ help');
  assert.match(link[0], /target="_blank"/);
  assert.match(link[0], /rel="noopener"/);
});

// ---------- what may not be said ----------
test('the Help page says nothing about plans or tiers, Triples, rosters, rubbers, team handouts, contact emails or real names', () => {
  const t = text(help);
  assert.doesNotMatch(t, /\bBasic (plan|mode|tier|account)\b|\bPro (plan|mode|tier|account)\b/i);
  assert.doesNotMatch(t, /\b(plans?|tiers?|pricing|subscription|upgrade|upgraded|free trial)\b/i);
  assert.doesNotMatch(t, /\bPro\b/);
  assert.doesNotMatch(t, /\bTriples?\b/i);
  assert.doesNotMatch(t, /when you have turned that option on/, 'organisations are separated whenever one is filled in');
  assert.match(t, /A bracket holds at most 128 entries/);
  assert.match(t, /holds at most 128 \(a group is one knockout bracket\)/, 'Group Boards: the per-group limit');
  assert.match(t, /up to 128 groups of 2 to 128 players each/);
  assert.doesNotMatch(t, /\b(rosters?|rubbers?|handouts?)\b|Players per team|Player 1|Player 2/i);
  assert.doesNotMatch(t, /DartConnect/i);
  assert.doesNotMatch(markup(help).replace(/<link[^>]*>/g, ''), /mailto:|@/);
  assert.doesNotMatch(t, /[\w.+-]+\s?@\s?[\w-]+\.[a-z]{2,}/i);
  assert.doesNotMatch(markup(help), />\s*(Basic|Pro)\s*</);
  // Basic and Advanced are called "setup"
  assert.match(t, /Basic setup/);
  assert.match(t, /Advanced setup/);
});

test('the Help page makes no promise the app does not keep: no live sync of windows, no stated hours or days', () => {
  const t = text(help);
  assert.doesNotMatch(t, /\b\d+\s*(hours?|days?)\b/i, 'no retention numbers');
  assert.doesNotMatch(t, /works? offline|available offline/i);
  // the entry-limit message is phrased generically
  assert.match(t, /allows up to a certain number of entries per event, contact your admin/);
});

// ---------- the guide quotes the app: those names must still exist there ----------
test('the buttons, labels and messages the guide quotes still exist in app.html (so the guide cannot drift from the app)', () => {
  const appText = app.replace(/&amp;/g, '&').replace(/\\'/g, "'");
  const quoted = [
    'Event creation', 'Format & branding', 'Chart details', 'Confirm & Print Bracket', 'Manage Tournament', 'Finalize Standings', 'Print Final Chart',
    '+ New tournament', 'Saved tournaments', 'Setup mode', 'Tournament name', 'Event name', 'Event category', 'Competition type', 'Tournament date', 'Number of entries',
    'Save event creation', 'Save format & branding', 'Discard / New tournament',
    'Competition format', 'Maximum entries per group', 'Entries per group (advance to knockout)', 'How entries are placed into the bracket', 'Seeded by group standing (recommended)', 'Random draw',
    'Also run a Plate pool knockout bracket for entries that don\'t advance', 'Plate entries per group', 'Number of groups', 'Best of legs inside each group',
    'Early rounds', 'Quarterfinal', 'Semifinal', 'Edit scheduling settings', 'Number of boards available', 'Level of play', 'Anticipated start time',
    'Tournament logo', 'Sponsor logos', 'Optional print rules / footer text', 'Walkover, conduct & other rules', 'Tie-break order', 'Switch to Advanced',
    'Organisation (optional)', 'Avoid same-organisation clashes', 'Track organisation (avoid same-organisation matchups in the first round)',
    'Participants & Seeding', 'Seed this bracket', 'Number of seeds', 'Check in all', 'Only show who hasn\'t checked in yet', 'Not everyone is checked in',
    'Withdraw', 'Swap with…', 'Mark no-show…', 'Neither showed', 'Reverse it', 'Adjust positions…', 'Reset all', 'Un-confirmed automatically',
    'Flat list', 'Grouped view', 'Confirm this chart', 'Generate bracket', 'Regenerate bracket', 'Print bracket pack',
    'Include the rules & format sheet as the first page of the pack', 'Include sponsor footer on printed charts',
    'Team match segments (played in order)', '+ Add segment', 'A tie-breaker might be needed', 'A team can win at most ', 'Use a tie-breaker in round robin matches', 'Use a tie-breaker in knockout matches', 'Games have started, so the segments are locked', 'Games have started, so the format of this Teams event can', 'play one more deciding leg and include it in the totals', 'Use an odd best of', 'Start round',
    'Knockout type', 'Single bracket', 'Group Boards, then finals', 'This is a knockout match — it can\'t end level', 'Level totals are a draw (1 point each).',
    'Also print a lineup/scorecard sheet for each fixture, for captains to fill in on the day', 'TOTAL POINTS', 'Team name', 'Pair name',
    'Knockout bracket paper size', 'Players A–Z', 'Draw groups', 'Move…', 'Winner of Group', 'no winner',
    'Print all ready lineup sheets', 'Print lineup', 'Print again', 'Print empty lineup sheet', 'Lineup sheets', '>Printed<', ' (recommended)', 'Split over ', ' A4 sheets', 'Keep ',
    'The names may be too small to read when printed. Recommended: ', '8 pt or more is easier to read.',
    'Start all games', 'Go print the pack first', 'Start without printing', 'Scores are locked', 'Save score', 'Generate knockout bracket', 'Regenerate from current standings', 'Start round',
    'The knockout can only be drawn once every group is finished', 'Resolve ties before continuing', 'Call', 'Uncall', 'Enter result', 'Finals boards', '+ Log incident',
    'Open in new window ↗', 'Round robin ↗', 'Winners bracket ↗', 'Plate pool ↗',
    'No bracket yet — generate one in Confirm & Print Bracket, then reopen this window.',
    'No confirmed charts yet — confirm at least one group in Confirm & Print Bracket, then reopen this window.',
    'No tournament open.', 'This event is finalized. Your change was not saved; only an Admin can change it.',
    'Public results', 'Publish results', 'List on the public page', 'Copy link', 'Open ↗', 'All events ↗',
    'Accept results & finalize', 'Accept & finalize', 'Accept results as final?', 'Available once every match is played', 'Not finalized', 'Final results',
    'Print final chart — Save high-res A4 PDF', 'Back to manage tournament',
    'Saving…', 'Saved', 'Couldn’t save — click to retry', 'Updated elsewhere — click to reload', 'Finalizing…', 'This event is finalized — only an Admin can change it',
    'Change password', 'Log out', 'Current password', 'New password', 'Rename', 'Duplicate', 'Delete',
    'Updated elsewhere — reload to get the latest', '>Reload<', 'Please rotate your device to landscape to use DartDraw.', 'DartDraw works best on a tablet, laptop or desktop.',
    'Your browser blocked the new window — allow pop-ups for this site, then click the button again.', '>Print<'
  ];
  const missing = quoted.filter((q) => !appText.includes(q) && !read('pods-ui.js').includes(q) && !read('boardplan-ui.js').includes(q) && !read('render.js').includes(q));
  assert.deepEqual(missing, [], 'quoted in the guide but not in the app');
  // the one name that is the public site's, not the organiser app's
  assert.ok(read('viewer/index.html').includes('Neither attended'));
  assert.ok(text(help).includes('Neither attended'));
  // and the guide really does quote them (so this list does not rot into checking nothing)
  const t = text(help);
  ['Open in new window ↗', 'Start all games', 'Accept & finalize', 'Publish results', 'List on the public page', 'Mark no-show…', 'Adjust positions…', 'Neither showed', 'Random draw', 'Save as PDF'].forEach((q) => assert.ok(t.includes(q), 'guide should quote ' + q));
});

test('the login page still has the Forgot password? link the guide tells people to click', () => {
  assert.match(read('login.html'), /<a href="\/forgot\.html">Forgot password\?<\/a>/);
  assert.match(text(help), /Forgot password\?/);
});

// ---------- phones ----------
test('the Help page has its own phone layout: one column, wrapping, no fixed wide boxes', () => {
  const css = (help.match(/<style>([\s\S]*?)<\/style>/) || [])[1];
  assert.match(css, /\.help-layout\{display:grid;grid-template-columns:270px minmax\(0,1fr\)/, 'desktop: contents column plus a shrinkable main column');
  assert.match(css, /@media \(max-width:960px\)\{\s*\.help-layout\{grid-template-columns:minmax\(0,1fr\)/, 'tablet and phone: one column');
  assert.match(css, /\.help-toc\{position:sticky;/, 'sticky contents on desktop');
  assert.match(css, /\.help-toc\{position:static;/, 'in-page list on phones');
  assert.match(css, /\.help-main\{min-width:0\}/);
  assert.match(css, /overflow-wrap:anywhere/);
  assert.match(css, /\[hidden\]\{display:none!important\}/, 'hidden wins over display rules');
  assert.doesNotMatch(markup(help), /style="[^"]*width:\s*\d{3,}px/);
  // controls are finger-sized
  assert.match(css, /details\.faq summary\{[^}]*min-height:52px/);
  assert.match(css, /\.help-toc summary\{[^}]*min-height:44px/);
});

// ---------- the search ----------
function stubDom({ hash = '', desktop = true } = {}) {
  const calls = { hashchange: [], mqChange: [] };
  const el = (id, attrs, txt) => {
    const e = {
      id, _a: Object.assign({}, attrs), textContent: txt || '', hidden: false, open: false, parentNode: null, value: '', handlers: {}, clicks: 0,
      getAttribute(k) { return k === 'id' ? this.id : (k in this._a ? this._a[k] : null); },
      addEventListener(t, fn) { this.handlers[t] = fn; },
      scrollIntoView() { calls.scrolled = (calls.scrolled || 0) + 1; }
    };
    return e;
  };
  const item = (id, kind, group, txt) => el(id, { 'data-item': '', 'data-group': group, 'data-kind': kind }, txt);
  const items = [
    item('getting-started', 'guide', 'guide', 'Getting started Signing in Click Log in then Sign in. Forgot password? Change password.'),
    item('troubleshooting', 'guide', 'guide', 'Printing tips and troubleshooting. Nothing opens when I click Open in new window: your browser blocked the pop-up.'),
    item('full-page-window', 'guide', 'guide', 'Full-page window for a second screen. Mark no-show works in a bracket window.'),
    item('faq-two-events', 'faq', 'faq', 'Can I run two events at once? Yes. Each event is separate.'),
    item('faq-no-show', 'faq', 'faq', 'Someone did not turn up. What do I do? Use Mark no-show to give a walkover.'),
    item('faq-offline', 'faq', 'faq', 'Can I use DartDraw offline? No, you need a connection.')
  ];
  const heads = [el('guide', { 'data-group-head': 'guide' }, 'Guide'), el('faq', { 'data-group-head': 'faq' }, 'Frequently asked questions')];
  const toc = [
    el('t1', { 'data-toc': 'getting-started' }), el('t2', { 'data-toc': 'troubleshooting' }), el('t3', { 'data-toc': 'full-page-window' }), el('t4', { 'data-toc': 'faq' })
  ];
  const byId = {};
  items.concat(heads).forEach((e) => { byId[e.id] = e; });
  const form = el('helpSearch', {}, ''); form.hidden = true;
  const input = el('helpQ', {}, '');
  const count = el('helpCount', {}, '');
  const empty = el('helpEmpty', {}, ''); empty.hidden = true;
  const emptyQ = el('helpEmptyQ', {}, '');
  const tocBox = el('helpToc', {}, ''); tocBox.open = true;
  const summary = el('sum', {}, '');
  tocBox.querySelector = (s) => (s === 'summary' ? summary : null);
  byId.helpSearch = form; byId.helpQ = input; byId.helpCount = count; byId.helpEmpty = empty; byId.helpEmptyQ = emptyQ; byId.helpToc = tocBox;
  const mq = { matches: desktop, addEventListener(t, fn) { calls.mqChange.push(fn); } };
  const lists = { '[data-item]': items, '[data-group-head]': heads, '[data-toc]': toc };
  const win = { addEventListener: (t, fn) => { win.handlers[t] = fn; }, handlers: {}, matchMedia: () => mq };
  const ctx = {
    document: { getElementById: (id) => byId[id] || null, querySelectorAll: (s) => lists[s] || [] },
    window: win,
    location: { hash }
  };
  vm.createContext(ctx);
  vm.runInContext(scripts(help)[0], ctx);
  const type = (q) => { input.value = q; input.handlers.input(); };
  return { ctx, items, heads, toc, form, input, count, empty, emptyQ, tocBox, summary, mq, win, calls, type, byId };
}
const shown = (els) => els.filter((e) => !e.hidden).map((e) => e.id);

test('search: the box appears once the script runs; with nothing typed everything shows', () => {
  const d = stubDom();
  assert.equal(d.form.hidden, false, 'the search form is revealed by the script');
  assert.equal(shown(d.items).length, 6);
  assert.deepEqual(shown(d.heads), ['guide', 'faq']);
  assert.equal(d.toc.every((l) => !l.hidden), true);
  assert.equal(d.count.textContent, '');
  assert.equal(d.empty.hidden, true);
});

test('search: typing filters guide articles and questions together, case-insensitively', () => {
  const d = stubDom();
  d.type('NO-SHOW');
  assert.deepEqual(shown(d.items), ['full-page-window', 'faq-no-show']);
  assert.equal(d.count.textContent, '2 results');
  // the contents list follows: only matching articles, and the questions entry while any question matches
  assert.deepEqual(d.toc.filter((l) => !l.hidden).map((l) => l.getAttribute('data-toc')), ['full-page-window', 'faq']);
  d.type('pop-up');
  assert.deepEqual(shown(d.items), ['troubleshooting']);
  assert.equal(d.count.textContent, '1 result');
  assert.deepEqual(d.toc.filter((l) => !l.hidden).map((l) => l.getAttribute('data-toc')), ['troubleshooting']);
});

test('search: every word must match (in any order); a group heading hides when nothing in it matches', () => {
  const d = stubDom();
  d.type('window open');
  assert.deepEqual(shown(d.items), ['troubleshooting']);
  d.type('walkover show');
  assert.deepEqual(shown(d.items), ['faq-no-show']);
  assert.deepEqual(shown(d.heads), ['faq'], 'the Guide heading is hidden when no guide article matches');
  assert.equal(d.toc.find((l) => l.getAttribute('data-toc') === 'getting-started').hidden, true);
  d.type('   ');
  assert.equal(shown(d.items).length, 6, 'spaces alone are not a search');
  assert.equal(d.count.textContent, '');
});

test('search: no match shows the empty message with what was typed (as text), and clearing brings everything back', () => {
  const d = stubDom();
  d.type('  <b>zzz</b> ');
  assert.equal(shown(d.items).length, 0);
  assert.deepEqual(shown(d.heads), []);
  assert.equal(d.empty.hidden, false);
  assert.equal(d.emptyQ.textContent, '<b>zzz</b>', 'set with textContent, never parsed as HTML');
  assert.equal(d.count.textContent, '0 results');
  assert.equal(d.toc.every((l) => l.hidden), true);
  d.type('');
  assert.equal(shown(d.items).length, 6);
  assert.deepEqual(shown(d.heads), ['guide', 'faq']);
  assert.equal(d.empty.hidden, true);
  assert.equal(d.toc.every((l) => !l.hidden), true);
});

test('search: matching questions open to show their answer, and close again when the search is cleared (but not ones you opened yourself)', () => {
  const d = stubDom();
  const mine = d.byId['faq-offline'];
  mine.open = true;                       // the visitor opened this one
  d.type('offline');
  assert.equal(mine.open, true);
  d.type('turn up');
  assert.equal(d.byId['faq-no-show'].open, true, 'a match opens');
  assert.equal(mine.open, true, 'still open: it was the visitor’s own');
  d.type('');
  assert.equal(d.byId['faq-no-show'].open, false, 'closed again');
  assert.equal(mine.open, true);
  assert.equal(d.byId['getting-started'].open, false);
});

test('search: Escape clears the box', () => {
  const d = stubDom();
  d.type('print');
  assert.ok(shown(d.items).length < 6);
  d.input.handlers.keydown({ key: 'Enter' });
  assert.ok(shown(d.items).length < 6);
  d.input.handlers.keydown({ key: 'Escape' });
  assert.equal(d.input.value, '');
  assert.equal(shown(d.items).length, 6);
  let prevented = false;
  d.form.handlers.submit({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true, 'pressing Enter does not reload the page');
});

test('anchors: a link to a hidden item clears the search; a link to a question opens it', () => {
  const d = stubDom();
  d.type('offline');
  assert.equal(d.byId['getting-started'].hidden, true);
  d.ctx.location.hash = '#getting-started';
  d.win.handlers.hashchange();
  assert.equal(d.input.value, '', 'the search was cleared so the target can show');
  assert.equal(d.byId['getting-started'].hidden, false);
  assert.ok(d.calls.scrolled >= 1, 'and scrolled to');
  d.ctx.location.hash = '#faq-two-events';
  d.win.handlers.hashchange();
  assert.equal(d.byId['faq-two-events'].open, true);
  const direct = stubDom({ hash: '#faq-offline' });
  assert.equal(direct.byId['faq-offline'].open, true, 'opening the page at a question’s address shows its answer');
});

test('contents list: open and fixed on a wide screen, folded on a phone and folding up again after a jump', () => {
  const wide = stubDom({ desktop: true });
  assert.equal(wide.tocBox.open, true);
  let prevented = false;
  wide.summary.handlers.click({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true, 'it cannot be folded away on a wide screen');

  const phone = stubDom({ desktop: false });
  assert.equal(phone.tocBox.open, false, 'folded away on a phone');
  prevented = false;
  phone.summary.handlers.click({ preventDefault() { prevented = true; } });
  assert.equal(prevented, false, 'the summary toggles it as normal');
  phone.tocBox.open = true;
  phone.tocBox.handlers.click({ target: { tagName: 'SPAN' } });
  assert.equal(phone.tocBox.open, true, 'a click that is not on a link leaves it open');
  phone.tocBox.handlers.click({ target: { tagName: 'A' } });
  assert.equal(phone.tocBox.open, false, 'choosing a topic folds the list away');
  // widening the window opens it again
  phone.mq.matches = true;
  phone.calls.mqChange.forEach((fn) => fn());
  assert.equal(phone.tocBox.open, true);
});

test('the page script runs even where matchMedia and the hash are missing', () => {
  const d = stubDom();
  const src = scripts(help)[0];
  const ctx = vm.createContext({
    document: { getElementById: (id) => d.byId[id] || null, querySelectorAll: (s) => ({ '[data-item]': d.items, '[data-group-head]': d.heads, '[data-toc]': d.toc }[s] || []) },
    window: { addEventListener() {} }
  });
  assert.doesNotThrow(() => vm.runInContext(src, ctx));
});

// ---------- placement and context: the guide says WHERE things are, so check the code agrees ----------
// The label check above only proves a name exists somewhere. These read the function that builds each screen.
const fnBody = (src, name) => {
  const start = src.search(new RegExp('(^|\\n)(async )?function ' + name + '\\('));
  assert.ok(start >= 0, 'function ' + name + ' not found');
  const rest = src.slice(start + 1);
  const next = rest.search(/\n(async )?function [A-Za-z_$]/);
  return next < 0 ? rest : rest.slice(0, next);
};
const articleText = (id) => text((help.match(new RegExp('<article class="harticle" id="' + id + '"[\\s\\S]*?</article>')) || [''])[0]);
const faqText = (id) => text((help.match(new RegExp('<details class="faq" id="' + id + '"[\\s\\S]*?</details>')) || [''])[0]);
const podsUi = read('pods-ui.js'), bpUi = read('boardplan-ui.js');

test('QR codes: only the sheets the guide names carry one, and the guide says the rest do not (and that the public address must be set)', () => {
  [fnBody(app, 'chartSheetHTML'), fnBody(app, 'knockoutBracketSheetHTML'), fnBody(bpUi, 'bpSheetShell')].forEach((b) => assert.match(b, /printQrBlockHTML\(/));
  ['rulesSheetHTML', 'runningOrderSheetHTML', 'lineupCardHTML'].forEach((n) => assert.doesNotMatch(fnBody(app, n), /printQrBlockHTML\(|qrSvg\(/, n + ' has no QR code'));
  assert.match(fnBody(app, 'liveResultsUrl'), /currentOrganizer\.viewerUrl/, 'the public address matters too');
  const t = articleText('draws-and-printing');
  assert.match(t, /Only some sheets carry a QR code/);
  assert.match(t, /group charts, the knockout and Finals bracket sheets, the Group Boards group sheets, and in Group Boards the Boards and Players A–Z sheets/);
  assert.match(t, /The rules sheet and the running order do not have one/);
  assert.match(t, /address of the public site is set up/);
  assert.doesNotMatch(t, /each printed sheet has a QR/i);
});

test('Basic / Advanced: the labels on step 1 are Basic and Advanced, and the guide quotes them as such', () => {
  const s1 = fnBody(app, 'stage1');
  assert.match(s1, /<strong>Basic<\/strong>/);
  assert.match(s1, /<strong>Advanced<\/strong>/);
  assert.match(s1, /<label>Setup mode<\/label>/);
  assert.match(articleText('getting-started'), /under Setup mode, you choose "Basic" or "Advanced"/);
  assert.match(text(help), /Setup mode: "Basic" or "Advanced"/);
});

test('Organisation box: always there in a round robin, only after ticking Track organisation in Knockout and Group Boards (and the guide says so)', () => {
  assert.match(fnBody(app, 'stage3Knockout'), /entryFieldsHTML\(ent, orgOn\)/, 'knockout rows hide the box until orgOn');
  assert.match(fnBody(app, 'entryFieldsHTML'), /showOrg===undefined\) showOrg = true/);
  assert.match(fnBody(app, 'flatEntriesRowsHTML'), /entryFieldsHTML\(ent\)/, 'round robin rows always show it');
  assert.match(fnBody(podsUi, 'podsStage3'), /stage3Knockout\(/, 'Group Boards uses the knockout panel');
  const t = articleText('entries-and-check-in');
  assert.match(t, /Round robin: the Organisation \(optional\) box is always there on step 3/);
  assert.match(t, /Knockout and Group Boards: the Organisation \(optional\) box is hidden at first\. It appears once you tick Track organisation/);
});

test('Group Boards check-in: the card is on step 4, the "Withdraw the N not checked in" button is on step 3 before the draw (and the guide says so)', () => {
  assert.match(fnBody(podsUi, 'podsStage4'), /checkInCardHTML\(\)/);
  assert.match(fnBody(podsUi, 'podsStage3'), /pods\.length \? podsCountWarningHTML\(\) \+ podsRosterWarningHTML\(\) : podsCheckInBoxHTML\(\)/, 'only before the draw');
  assert.match(fnBody(podsUi, 'podsCheckInBoxHTML'), /Withdraw the '\+s\.missing\.length\+' not checked in/);
  assert.match(fnBody(podsUi, 'podsCheckInBoxHTML'), /if\(!s\.checked\) return ''/, 'only once someone is ticked');
  assert.match(articleText('entries-and-check-in'), /tick people in on step 4\. Then, on step 3, before you click Draw groups, a Withdraw the N not checked in button/);
});

test('Neither showed: knockout and Group Boards only. The round robin no-show picker has no such choice, and the guide and FAQ say so', () => {
  assert.doesNotMatch(fnBody(app, 'openNoShowPicker'), /Neither showed/);
  assert.match(fnBody(app, 'openKoNoShowPicker'), /Neither showed/);
  assert.match(articleText('entries-and-check-in'), /This is for knockout and Group Boards matches only; a round robin has no such choice/);
  assert.match(faqText('faq-no-show'), /If both are missing in a knockout or Group Boards match, choose Neither showed \(a round robin does not have that choice\)/);
  assert.match(read('viewer/index.html'), /NO-SHOW|Neither attended/);
  assert.match(articleText('entries-and-check-in'), /Neither attended", or NO-SHOW in the bracket Chart view/);
});

test('printing: the full-page window’s Print prints the chart it shows through the pack’s own sheets; the full pack comes from the main window', () => {
  // the app: the pop-out Print fills #printSheets (the only thing the print CSS shows) with the pack's sheet builders
  assert.match(fnBody(app, 'popoutToolsHTML'), /onclick="popoutPrint\(\)">Print<\/button>/);
  assert.match(fnBody(app, 'popoutPrintSheetsHTML'), /knockoutBracketSheetHTML\(bracket\)/);
  assert.match(fnBody(app, 'popoutPrintSheetsHTML'), /chartSheetHTML\(g, true\)/);
  assert.match(fnBody(app, 'popoutPrint'), /getElementById\('printSheets'\)\.innerHTML = html[\s\S]*window\.print\(\)/);
  assert.doesNotMatch(app, /onclick="window\.print\(\)"/, 'no bare window.print() button is left (it printed a blank page)');
  // the guide says the same
  const fpw = articleText('full-page-window');
  assert.match(fpw, /The Print button in the full-page window prints just what that window shows: the bracket sheet, or the round robin group charts/);
  assert.match(fpw, /For the whole pack \(rules sheet, running order and every chart\), print from the main window, on step 4 \(Print bracket pack\) or step 7/);
  assert.doesNotMatch(text(help), /not reliable/);
  assert.match(articleText('troubleshooting'), /Print the full pack from the main window: Print bracket pack on step 4/);
  assert.match(articleText('troubleshooting'), /The Print button in the full-page window prints only the chart that window shows/);
});

test('stale windows: the guide says the last change is not saved, to Reload before entering anything, and that the window saves nothing until then (as the app does)', () => {
  const t = text(help);
  assert.doesNotMatch(t, /(will|would|is|are) not (be )?kept|will be gone|nothing is lost|no harm|harmless|safe to ignore|will not be lost/i);
  assert.doesNotMatch(t, /the change you were making/i);
  // the old warning is gone: since the stale lock, an out-of-date window cannot write over newer results
  assert.doesNotMatch(t, /can write over newer (results|ones|scores)/);
  // the app does what the guide says (tests/save-stale.test.js and tests/save-round2.test.js cover it in depth)
  assert.match(app, /<b>Updated elsewhere — reload to get the latest\.<\/b>[^<]*Your last change here was not saved\.[^<]*<\/span>\s*<button class="btn" onclick="reloadStale\(\)">Reload<\/button>/);
  // the guide
  const gs = articleText('getting-started');
  assert.match(gs, /A red banner also appears at the top of the page: "Updated elsewhere — reload to get the latest\."/);
  assert.match(gs, /Your last change in this window was not saved, and from now on this window saves nothing for this event, so it cannot write over the newer results/);
  assert.match(gs, /Click Reload on the banner \(or click the message\) to load the latest copy\. Then check it and enter your last change again/);
  const sync = articleText('full-page-window');
  assert.match(sync, /If you score in a window that is out of date, that score is not saved/);
  assert.match(sync, /the full-page window too/);
  assert.match(sync, /click Reload before you enter anything else/);
  assert.match(sync, /one window per event at a time/);
  assert.match(sync, /one device only/);
  assert.match(sync, /The full-page window shows its save status in the header/);
  assert.doesNotMatch(sync, /does not show the save status/);
  assert.match(articleText('troubleshooting'), /Your last change in this window was not saved[\s\S]*Click Reload before you enter anything else, then enter your last change again/);
  assert.match(faqText('faq-two-devices'), /is not saved[\s\S]*before you enter anything else/);
  assert.match(faqText('faq-two-events'), /is not saved[\s\S]*before you enter anything else/);
  assert.match(faqText('faq-window-sync'), /An out-of-date window cannot write over newer scores: its save is refused[\s\S]*the score you entered there is not saved/);
});

test('stale windows, by behaviour: after a refused save (409) the window sends nothing more, even when renaming or closing; Reload ends it', async () => {
  const { loadApp, run, useState } = require('./lib/helpers');
  const a = loadApp();
  const t = run(a, 'blankTournament')(); t.id = 't_h'; t.eventCreation.saved = true;
  useState(a, t);
  run(a, 'tournamentsCache = {}; tournamentsCache.t_h = state; dbUpdatedAtCache = { t_h: "S1" }; lockedIds.clear(); staleIds.clear()');
  a.render = () => {}; a.renderSavedList = () => {};
  const modals = []; a.openModal = (o) => modals.push(o);
  const server = { data: Object.assign(JSON.parse(JSON.stringify(t)), { otherScore: 1 }), updated_at: 'S2' };   // another window saved: the server is ahead
  const puts = [];
  const handle = async (url, o) => {
    if (o && o.method === 'PUT') { const b = JSON.parse(o.body); puts.push(b); return b.expectedUpdatedAt === server.updated_at ? { ok: true, status: 200, json: async () => ({ updated_at: 'S3' }) } : { ok: false, status: 409, json: async () => ({ current: { data: JSON.parse(JSON.stringify(server.data)), updated_at: server.updated_at } }) }; }
    return { ok: true, status: 200, json: async () => ({ data: JSON.parse(JSON.stringify(server.data)), updated_at: server.updated_at }) };
  };
  a.apiFetch = handle; a.fetch = handle;
  run(a, 'persist(); clearTimeout(saveTimer); saveTimer = null');
  assert.equal(await run(a, 'flushSave')(), false);
  assert.equal(puts.length, 1);
  run(a, 'persist(); clearTimeout(saveTimer); saveTimer = null; savePending = true');
  await run(a, 'flushSave')();
  run(a, 'flushSaveNow')();
  a.document = new Proxy(a.document, { get: (x, k) => (k === 'getElementById' ? (id) => (id === 'renameInput' ? { value: 'New name' } : null) : x[k]) });
  run(a, 'renameTournament')('t_h', { stopPropagation() {} });
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
  assert.equal(puts.length, 1, 'nothing more was sent');
  assert.equal(modals[0].title, 'Updated elsewhere', 'rename explains instead');
  await run(a, 'reloadStale')();
  assert.equal(run(a, 'staleIds.has("t_h")'), false);
  assert.equal(run(a, 'dbUpdatedAtCache.t_h'), 'S2');
});

test('silent refresh and the phone menu: the guide describes what the app does', () => {
  assert.match(fnBody(app, 'silentRefresh'), /showInfoToast\('Updated with the latest scores'\)/);
  const sync = articleText('full-page-window');
  assert.match(sync, /The windows do not update each other while you look at them/);
  assert.match(sync, /When you switch to a window \(click into it, or bring it back on screen\), it checks for a newer copy of the event\. If there is one, it loads it, stays on the same step and shows "Updated with the latest scores"/);
  assert.match(sync, /It skips this while a change of yours is still being saved, while a box is open, while you are typing in a box or have typed something not yet saved, and on steps 1 to 3/);
  assert.match(fnBody(app, 'silentRefreshBlocked'), /stageFormDirty\(\)/);
  assert.match(fnBody(app, 'silentRefreshBlocked'), /currentStage>=1 && currentStage<=3/);
  // a switch is refused while the last change is unsaved, and the guide says so
  assert.match(fnBody(app, 'switchBlocked'), /Last change not saved yet/);
  assert.match(fnBody(app, 'switchBlocked'), /Leave without saving/);
  assert.match(articleText('getting-started'), /Until then DartDraw will not open another event or start a new one: it keeps you on this one and says "Last change not saved yet"\. You can choose Leave without saving, but that change is then gone/);
  assert.match(faqText('faq-offline'), /wait for Saved before you open another event/);
  // round 4: leaving, logging out, being signed out, deleted elsewhere, and the refresh limits in the FAQ
  assert.match(articleText('getting-started'), /Log out waits for it the same way, and if you close or reload the page meanwhile, your browser asks you first/);
  assert.match(fnBody(app, 'onBeforeUnload'), /e\.returnValue = ''/);
  assert.match(fnBody(app, 'logout'), /logoutBlocked\(\)/);
  assert.match(articleText('getting-started'), /Deleted elsewhere — this event is no longer saved/);
  assert.ok(app.includes("'Deleted elsewhere — this event is no longer saved'"));
  assert.match(articleText('troubleshooting'), /If a change had not been saved yet, DartDraw keeps it in this browser and, after you sign in again, asks whether to restore it\. It can only be restored if the event has not changed in the meantime/);
  assert.match(fnBody(app, 'offerRecoveredChanges'), /Restore your unsaved change\?/);
  const wsync = faqText('faq-window-sync');
  assert.match(wsync, /not on steps 1 to 3/);
  assert.match(wsync, /not while you have typed something not yet saved/);
  assert.match(wsync, /Windows in the same browser tell each other when they save/);
  assert.match(wsync, /at most every few seconds/);
  assert.match(app, /new BroadcastChannel\('dartdraw-saves'\)/);
  assert.doesNotMatch(text(help), /every 20 seconds\.?\s*It checks|at most about every 20 seconds/);
  assert.match(faqText('faq-window-sync'), /Not while you are looking at it\.[\s\S]*Updated with the latest scores/);
  assert.match(articleText('getting-started'), /on a phone or a narrow window, tap the step name in the bar at the top, then Change password/);
  assert.match(articleText('getting-started'), /Rename, Duplicate and Delete for the open event, and Change password/);
  assert.match(fnBody(app, 'compactMenuHTML'), /Change password/);
});

test('phones and tablets: the guide explains the landscape rule, the phone note and the top bar, as the app does', () => {
  // the app
  assert.match(app, /Please rotate your device to landscape to use DartDraw\./);
  assert.match(app, /<span>DartDraw works best on a tablet, laptop or desktop\.<\/span>/);
  assert.match(fnBody(app, 'deviceGateState'), /if\(!\(o\.coarse && o\.hoverNone\)\) return 'none';/, 'laptops and desktops never see it');
  // the guide
  const gs = articleText('getting-started');
  assert.match(gs, /On a tablet or phone, hold it sideways \(landscape\)\. Held upright, DartDraw covers the screen with "Please rotate your device to landscape to use DartDraw\."/);
  assert.match(gs, /A phone on its side works too, with a note that DartDraw works best on a tablet, laptop or desktop/);
  assert.match(gs, /the left-hand menu becomes a bar at the top\. Tap the step name there for the steps, your events/);
  const faq = faqText('faq-phone');
  assert.match(faq, /Can I use my phone\?/);
  assert.match(faq, /Yes, held sideways \(landscape\), but DartDraw works best on a tablet, laptop or desktop/);
  assert.match(faq, /Please rotate your device to landscape to use DartDraw\./);
  assert.match(articleText('troubleshooting'), /On a tablet or phone, DartDraw only works held sideways/);
  assert.doesNotMatch(text(help), /On a narrow phone screen the left-hand menu is hidden, so use a wider screen/);
});

test('the guide does not promise what the app does not do: logo trimming, email-only reset', () => {
  assert.doesNotMatch(text(help), /trims/i);
  assert.match(fnBody(app, 'resizeImageFile'), /canvas/);
  assert.match(text(help), /surest way is to ask your admin for a reset link/);
  assert.match(faqText('faq-forgot-password'), /Ask your admin for a reset link/);
});

// ---------- accessibility: small gold text must be readable ----------
const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
test('contrast: the contents headings, placeholder and # links meet 4.5:1 on white, and the chip text on the soft gold', () => {
  const css = (help.match(/<style>([\s\S]*?)<\/style>/) || [])[1];
  const colorOf = (selector) => {
    const esc = selector.replace(/[.[\]*+?^${}()|\\:]/g, '\\$&');
    const m = css.match(new RegExp(esc + '\\{(?:[^}]*;)?color:(#[0-9a-fA-F]{6})'));
    assert.ok(m, 'colour for ' + selector);
    return m[1];
  };
  ['.toc-h', '.hsearch input::placeholder', '.hhead .anchor'].forEach((sel) => {
    const ratio = contrast(colorOf(sel), '#ffffff');
    assert.ok(ratio >= 4.5, sel + ' is ' + ratio.toFixed(2) + ':1');
  });
  assert.ok(contrast('#7a5600', '#fbf1d6') >= 4.5, 'chip text on the soft gold');
});

test('the # link is beside each article heading, not inside it, so the heading’s name is just its title', () => {
  const heads = [...help.matchAll(/<h3>([\s\S]*?)<\/h3>/g)].map((m) => m[1]);
  assert.ok(heads.length >= 10);
  heads.forEach((h) => assert.doesNotMatch(h, /<a\b/, h));
  assert.match(help, /<div class="hhead"><h3>Getting started<\/h3><a class="anchor" href="#getting-started" aria-label="Link to this section">#<\/a><\/div>/);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync, spawnSync } = require('node:child_process');

// The shared Help search (help-search.js): the pure parts, run in node. The page behaviour is tested against the real
// pages in help-site.test.js and viewer-help.test.js, and the walkthrough phrases in help-search-fixtures.test.js.
const ROOT = path.join(__dirname, '..');
const HS = require('../help-search.js');

const doc = (id, title, body, more) => Object.assign({ id, title, keywords: '', summary: '', group: '', parts: [{ id, head: '', text: body || '' }] }, more || {});
const ids = (res) => res.results.map((r) => r.id);

test('normalise: lower case, no accents, curly and straight apostrophes are the same, dashes and punctuation are spaces', () => {
  assert.equal(HS.normalize('Couldn’t SAVE'), 'couldnt save');
  assert.equal(HS.normalize("Couldn't save"), 'couldnt save');
  assert.equal(HS.normalize('didn‘t turn up'), 'didnt turn up');
  assert.equal(HS.normalize('no-show'), 'no show');
  assert.equal(HS.normalize('no–show — now'), 'no show now');
  assert.equal(HS.normalize('Farid Pérez Ñoño'), 'farid perez nono');
  assert.equal(HS.normalize('  “Final   results”… '), 'final results');
  assert.equal(HS.normalize('+/- and ?'), 'and');
  assert.equal(HS.normalize(null), '');
  assert.deepEqual(HS.tokenize('Mark no-show…'), ['mark', 'no', 'show']);
});

test('stemming is light and the same on both sides: plurals, -ing, -ed, a final e', () => {
  const same = (a, b) => assert.equal(HS.stem(a), HS.stem(b), a + ' / ' + b);
  same('print', 'printing'); same('print', 'prints'); same('print', 'printed');
  same('entry', 'entries'); same('score', 'scores'); same('score', 'scoring'); same('score', 'scored');
  same('leave', 'leaving'); same('leave', 'leaves'); same('match', 'matches'); same('run', 'running');
  same('finalize', 'finalized'); same('seed', 'seeding'); same('seed', 'seeded'); same('bye', 'byes'); same('play', 'played');
  same('call', 'called'); same('miss', 'missing');
  // short words and numbers are left alone, and it never shrinks a word to nothing
  ['wo', 'ld', 'me', 'qr', 'tb', 'h2h', 'a1', '180', 'seed', 'need', 'status', 'this'].forEach((w) => assert.equal(HS.stem(w), w, w));
  assert.notEqual(HS.stem('seed'), HS.stem('sea'));
});

test('whole words, not substrings: "wo" no longer finds "two" or "would", "ld" not "world", "me" not "name"', () => {
  const ix = HS.createIndex([
    doc('a', 'Can I run two events at once?', 'It would work, as you know.'),
    doc('b', 'Match labels', 'A small WO next to a player means a walkover.'),
    doc('c', 'The world', 'Type your name.'),
    doc('d', 'Badges', 'LD means leg difference. Me is you.')
  ]);
  assert.deepEqual(ids(ix.search('WO')), ['b']);
  assert.deepEqual(ids(ix.search('wo')), ['b']);
  assert.deepEqual(ids(ix.search('LD')), ['d']);
  assert.deepEqual(ids(ix.search('me')), ['d']);
  assert.deepEqual(ids(ix.search('what does WO mean')), ['b'], 'the stop words do not count');
});

test('prefix matching: a typed start of a word (3 letters or more) finds the word; 2 letters must be the whole word', () => {
  const ix = HS.createIndex([doc('w', 'Withdrawals', 'Click Withdraw next to the entry.'), doc('p', 'Printing', 'Print the pack.'), doc('x', 'Other', 'wobbly words')]);
  assert.deepEqual(ids(ix.search('withdr')), ['w']);
  assert.deepEqual(ids(ix.search('prin')), ['p']);
  assert.deepEqual(ids(ix.search('wob')), ['x']);
  assert.deepEqual(ids(ix.search('wo')), [], '"wo" is not a prefix search');
});

test('apostrophes: a straight apostrophe finds the curly one in the text and back', () => {
  const ix = HS.createIndex([doc('s', 'Saving', 'Couldn’t save — click to retry.'), doc('t', 'No-shows', "Someone didn't turn up.")]);
  assert.deepEqual(ids(ix.search("couldn't save")), ['s']);
  assert.deepEqual(ids(ix.search('couldnt save')), ['s']);
  assert.deepEqual(ids(ix.search('didn’t turn up')), ['t']);
  assert.deepEqual(ids(ix.search('noshow')), ['t'], 'two words written as one also match ("no show" = "noshow")');
});

test('typo tolerance: one letter off, words of 5 letters or more, only when the word finds nothing, and never opened by itself', () => {
  const ix = HS.createIndex([doc('f', 'Finishing the event', 'Accept and finalize the results.'), doc('w', 'Labels', 'A walkover is shown as WO.'), doc('r', 'Rounds', 'The rounds view.')]);
  let r = ix.search('finalise');
  assert.deepEqual(ids(r), ['f']);
  assert.equal(r.clear, false, 'a guessed spelling is a close match, not a sure answer');
  assert.equal(r.suggest, true);
  assert.deepEqual(ids(ix.search('walkovr')), ['w']);
  assert.deepEqual(ids(ix.search('wlakover')), ['w'], 'two letters swapped');
  assert.deepEqual(ids(ix.search('roun')), ['r'], 'a prefix is an exact hit, so no typo search');
  assert.deepEqual(ids(ix.search('wlk')), [], 'short words get no typo search');
  // an exact hit wins: no typo alternatives are added
  const ix2 = HS.createIndex([doc('a', 'Seed', 'seed'), doc('b', 'Need', 'need')]);
  assert.deepEqual(ids(ix2.search('seed')), ['a']);
});

test('ranking: a match in the title or keywords beats one in the body; items with all the words come first; ties keep page order', () => {
  const ix = HS.createIndex([
    doc('body', 'Something else', 'You can correct a score here. Score score.'),
    doc('kw', 'Fixing things', 'Nothing.', { keywords: 'score' }),
    doc('title', 'Correcting a score', 'Click it.'),
    doc('both', 'Other', 'Wrong score? Correct it.'),
    doc('late', 'Later', 'score')
  ]);
  const r = ix.search('score');
  assert.equal(r.results[0].id, 'title');
  assert.equal(r.results[1].id, 'kw');
  assert.ok(ids(r).indexOf('body') > ids(r).indexOf('kw'));
  assert.ok(ids(r).indexOf('both') < ids(r).indexOf('late'), 'same score: page order');
  const two = ix.search('correct score');
  assert.ok(two.results.every((x) => x.coverage === 2), 'only items with both words are listed');
  assert.deepEqual(ids(two).sort(), ['body', 'both', 'title']);
  assert.equal(two.results[0].id, 'title');
  for (let i = 1; i < r.results.length; i++) assert.ok(r.results[i - 1].score >= r.results[i].score, 'sorted by score');
});

test('a result points at the section (h4) that matched best, and the top hit opens only when it is clearly best', () => {
  const ix = HS.createIndex([
    { id: 'art', title: 'Entries', keywords: '', summary: '', group: '', parts: [{ id: 'art', head: '', text: 'Intro.' }, { id: 'seeds', head: 'Seeds', text: 'Tick Seed this bracket.' }, { id: 'checkin', head: 'Check-in', text: 'Tick each entry.' }] },
    doc('other', 'Printing', 'Print the pack.'),
    doc('o2', 'Tick boxes', 'Tick it.')
  ]);
  const r = ix.search('seed');
  assert.equal(r.results[0].anchor, 'seeds');
  assert.equal(r.results[0].head, 'Seeds');
  assert.equal(r.clear, true, 'one strong result: open it');
  const two = HS.createIndex([doc('pack', 'Print the blank pack', 'Click Print.'), doc('final', 'Print the final chart', 'Click Print.')]).search('print');
  assert.equal(two.results.length, 2);
  assert.equal(two.clear, false, 'two equally good results: the reader chooses');
});

test('synonyms are page data: any phrase of a group finds the others, the longest phrase wins, and symbols work', () => {
  const data = { synonyms: [['login', 'log in', 'sign in'], ['typo', 'mistake', 'wrong score', 'correct'], ['quit', 'player quit', 'leaves'], ['h2h', '?']] };
  const ix = HS.createIndex([
    doc('in', 'Signing in', 'Click Sign in.'),
    doc('fix', 'Correcting a result', 'To correct it, save again.'),
    doc('leave', 'A player leaves part-way', 'What to do.'),
    doc('tb', 'Badges', 'H2H means head-to-head.'),
    doc('players', 'Players', 'A player plays.')
  ], data);
  assert.equal(ids(ix.search('login'))[0], 'in');
  assert.equal(ids(ix.search('typo'))[0], 'fix');
  assert.equal(ids(ix.search('wrong score'))[0], 'fix');
  assert.equal(ids(ix.search('player quit'))[0], 'leave', '"player quit" is one phrase, not "player" and "quit"');
  assert.equal(ids(ix.search('?'))[0], 'tb');
  // without the data none of this is known: the module has no words of its own
  const bare = HS.createIndex([doc('in', 'Signing in', 'Click Sign in.')]);
  assert.deepEqual(ids(bare.search('login')), []);
});

test('no answer: a topic the page says it does not cover gives the honest sentence and the suggestions, with no noise', () => {
  const ix = HS.createIndex([doc('a', 'Free text box', 'The rules box is free text.')], { noAnswer: [{ terms: ['free', 'price', 'add to home screen'], say: 'Not covered here.' }] });
  for (const q of ['free', 'Price', 'add to home screen', 'add home screen']) {
    const r = ix.search(q);
    assert.equal(r.suggest, true, q); assert.equal(r.say, 'Not covered here.', q); assert.deepEqual(r.results, [], q);
  }
  assert.equal(ix.search('free text').suggest, false, 'only when every word is about that topic');
  const none = ix.search('zzzz');
  assert.equal(none.suggest, true); assert.equal(none.say, ''); assert.deepEqual(none.results, []);
  const weak = HS.createIndex([doc('a', 'Rules', 'The box is free text.')]).search('box');
  assert.equal(weak.suggest, true, 'a match in the body only is offered as a close match, with the suggestions');
  assert.equal(weak.results.length, 1);
  assert.deepEqual(HS.createIndex([doc('a', 'x', 'y')]).search('   ').results, []);
  assert.equal(HS.createIndex([doc('a', 'x', 'y')]).search('').suggest, false, 'an empty box is not a failed search');
});

test('highlighting: whole matched words get a range, never a part of a word; snippets show the matching part', () => {
  const ix = HS.createIndex([doc('a', 'Labels', 'Long text about other things first, and more words here to push it along. Then a small WO means a walkover, and two players would know.')]);
  const r = ix.search('wo');
  const text = 'A WO means two would know. wo!';
  const marked = HS.markRanges(text, r.hl).map(([s, e]) => text.slice(s, e));
  assert.deepEqual(marked, ['WO', 'wo']);
  const sn = ix.snippet(r.results[0], r, 80);
  assert.match(sn.text, /^… /, 'cut to the match');
  assert.ok(sn.ranges.length >= 1);
  assert.equal(sn.text.slice(sn.ranges[0][0], sn.ranges[0][1]), 'WO');
  const p = ix.search('walk');
  assert.deepEqual(HS.markRanges('a walkover, walking', p.hl).map(([s, e]) => 'a walkover, walking'.slice(s, e)), ['walkover', 'walking'], 'a typed start marks the words it starts');
  assert.deepEqual(HS.markRanges('players’ names', HS.createIndex([doc('x', 'Players', '')]).search('player').hl), [[0, 7]], 'no trailing apostrophe in the mark');
});

test('the module is plain ES5 with no dependencies, and runs in a page (vm) as window.HelpSearch', () => {
  const src = fs.readFileSync(path.join(ROOT, 'help-search.js'), 'utf8');
  assert.doesNotMatch(src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''), /\b(let|const|class|import|require)\b|=>|`/, 'ES5 only');
  const ctx = {}; vm.createContext(ctx); vm.runInContext(src, ctx);
  assert.equal(typeof ctx.HelpSearch.createIndex, 'function');
  assert.equal(typeof ctx.HelpSearch.attach, 'function');
  assert.equal(ctx.HelpSearch.normalize('No-Show'), 'no show');
  // the synonyms are not in the module: they are page data
  assert.doesNotMatch(src, /'login'|'walkover'|'typo'/);
});

// ---------- the viewer's copy (a separate Vercel project) ----------
test('sync: help-search.js is in the sync list, the viewer copy is identical, and check-viewer passes', () => {
  const sync = fs.readFileSync(path.join(ROOT, 'scripts', 'sync-viewer.js'), 'utf8');
  assert.match(sync, /const FILES = \['render\.js', 'render\.css', 'help-search\.js', 'i18n\/render\.ms\.js'\];/);
  ['render.js', 'render.css', 'help-search.js', 'i18n/render.ms.js'].forEach((f) => assert.ok(fs.readFileSync(path.join(ROOT, f)).equals(fs.readFileSync(path.join(ROOT, 'viewer', f))), 'viewer/' + f + ' is a copy of ' + f));
  const out = execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'sync-viewer.js'), '--check'], { encoding: 'utf8' });
  assert.match(out, /ok\s+render\.js/); assert.match(out, /ok\s+render\.css/); assert.match(out, /ok\s+help-search\.js/);
  // both Help pages load their own copy from their own site root
  assert.match(fs.readFileSync(path.join(ROOT, 'help.html'), 'utf8'), /<script src="\/help-search\.js"><\/script>/);
  assert.match(fs.readFileSync(path.join(ROOT, 'viewer', 'help.html'), 'utf8'), /<script src="\/help-search\.js"><\/script>/);
});

test('sync: --check fails (exit 1) when the viewer copy differs, and names the file', () => {
  const tmp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'dd-sync-'));
  fs.mkdirSync(path.join(tmp, 'scripts')); fs.mkdirSync(path.join(tmp, 'viewer'));
  fs.copyFileSync(path.join(ROOT, 'scripts', 'sync-viewer.js'), path.join(tmp, 'scripts', 'sync-viewer.js'));
  fs.mkdirSync(path.join(tmp, 'i18n')); fs.mkdirSync(path.join(tmp, 'viewer', 'i18n'));
  ['render.js', 'render.css', 'help-search.js', 'i18n/render.ms.js'].forEach((f) => { fs.copyFileSync(path.join(ROOT, f), path.join(tmp, f)); fs.copyFileSync(path.join(ROOT, f), path.join(tmp, 'viewer', f)); });
  fs.appendFileSync(path.join(tmp, 'help-search.js'), '\n// changed\n');
  const r = spawnSync(process.execPath, [path.join(tmp, 'scripts', 'sync-viewer.js'), '--check'], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /STALE\s+viewer\/help-search\.js/);
  const fix = spawnSync(process.execPath, [path.join(tmp, 'scripts', 'sync-viewer.js')], { encoding: 'utf8' });
  assert.equal(fix.status, 0);
  assert.ok(fs.readFileSync(path.join(tmp, 'help-search.js')).equals(fs.readFileSync(path.join(tmp, 'viewer', 'help-search.js'))));
  fs.rmSync(tmp, { recursive: true, force: true });
});

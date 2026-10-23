const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp, run, plain, useState, playOut } = require('./lib/helpers');
const content = require('../scripts/help-content');

/* Help claims that are tied to behaviour, not only to words (kb review G1.1). A Help item lists the statements it
   makes about the app as `claims: [...]`; every tag must have a check below that RUNS the app and finds the
   statement true, and the words the statement quotes must be in the Help item and in the app. Add a tag and its
   check together. (help-site.test.js checks the page is generated, the anchors, search and forbidden words.) */
const root = path.join(__dirname, '..');
const appHtml = fs.readFileSync(path.join(root, 'app.html'), 'utf8');
const appText = appHtml.replace(/&amp;/g, '&').replace(/\\'/g, "'").replace(/&hellip;/g, '…');
const plainText = (h) => String(h || '').replace(/<\/?(b|em|strong|a|code)\b[^>]*>/g, '').replace(/<[^>]+>/g, ' ').replace(/&ldquo;|&rdquo;/g, '"').replace(/&rsquo;/g, '’').replace(/&hellip;/g, '…').replace(/&amp;/g, '&').replace(/&ndash;/g, '–').replace(/\s+/g, ' ').trim();
const items = {};
content.sections.forEach((s) => s.items.forEach((it) => { items[it.id] = it; }));
const say = (id) => plainText(items[id].body);
const fnBody = (src, name) => { const i = src.indexOf('function ' + name + '('); assert.ok(i >= 0, name); return src.slice(i, src.indexOf('\nfunction ', i + 10)); };

const app = loadApp();
const f = (n) => run(app, n);
const DOC = app.document;
let modals;
function reset() {
  modals = [];
  app.openModal = (m) => { modals.push(m); };
  app.persist = () => {}; app.render = () => {}; app.renderSavedList = () => {}; app.setSaveStatus = () => {};
  app.document = DOC;
  app.__org = { name: 'Sam', email: 's@x.com', tier: 'pro', entryLimit: null, viewerUrl: '' };
  run(app, 'currentOrganizer = __org; lockedIds.clear(); popoutMode = false');
}
const typedDoc = (v) => ({ getElementById: (id) => ({ value: v[id] !== undefined ? String(v[id]) : '', classList: { add() {}, remove() {} }, style: {} }), createElement: DOC.createElement, body: DOC.body });
function save(key, ri, mi, a, b) {
  f('koMatchScoreModal')(key, ri, mi);
  const dlg = modals.pop();
  app.document = typedDoc({ scA: a, scB: b });
  try { return dlg.onConfirm(); } finally { app.document = DOC; }
}
function ko(n) {
  const t = f('blankTournament')(); useState(app, t);
  Object.assign(t.eventCreation, { saved: true, entries: n }); Object.assign(t.format, { saved: true, formatType: 'knockout', bestOfLegs: 5 });
  t.entriesList = Array.from({ length: n }, (_, i) => ({ id: 'k' + String(i).padStart(2, '0'), name: 'K' + i, org: '', withdrawn: false, checkedIn: true }));
  app.__o = t.entriesList.map((e) => ({ entryId: e.id, org: '' }));
  t.knockout = run(app, 'generateBracket(__o, "Bracket")');
  return t;
}
function rr(opts) {
  opts = opts || {};
  const t = f('blankTournament')(); useState(app, t);
  Object.assign(t.eventCreation, { saved: true, entries: 8 });
  Object.assign(t.format, { saved: true, formatType: 'rrknockout', qualifiersPerGroup: 2, advanceMode: 'seeded', bestOfLegs: 5 });
  t.entriesList = []; let k = 0;
  t.groups = [0, 1].map((gi) => {
    const ids = [0, 1, 2, 3].map(() => { const id = 'q' + k++; t.entriesList.push({ id, name: 'Q' + id, org: '', withdrawn: false, checkedIn: !opts.unchecked }); return id; });
    return { id: 'g' + gi, label: 'AB'[gi], entryIds: ids, boards: [gi + 1], confirmed: true, confirmedEntryIds: ids.slice(), scores: {}, gameStarted: !opts.notStarted };
  });
  if (opts.played) t.groups.forEach((g) => f('groupMatches')(g).forEach(([x, y]) => { const first = g.entryIds.indexOf(x) < g.entryIds.indexOf(y); f('setScore')(g, x, y, first ? 3 : 0, first ? 0 : 3); }));
  return t;
}

const CHECKS = {
  'ko-cascade': () => {
    const t = say('managing-the-tournament');
    assert.match(t, /if you change who won a match, or clear it, every later match that the old winner had reached is cleared as well, right up to the final, and so is the champion/);
    assert.match(t, /Changing this result will clear 2 later results, and you will need to enter them again/);
    assert.match(t, /Click Change result to go ahead, or Cancel to leave everything as it was/);
    assert.match(t, /Correcting only the score, with the same winner, changes nothing later and asks nothing/);
    assert.match(say('faq-correct-result'), /you choose Change result or Cancel/);
    reset(); const ev = ko(8); const b = ev.knockout;
    playOut(app, b, () => 'a');
    const oldW = b.rounds[0][0].winnerId;
    const before = plain(b.rounds);
    assert.deepEqual(plain(save('knockout', 0, 0, 1, 3)), { keepOpen: true });
    const q = modals[modals.length - 1];
    assert.match(plainText(q.bodyHTML), /^Changing this result will clear 2 later results, and you will need to enter them again:/, 'the dialog says what the Help quotes');
    assert.equal(q.confirmLabel, 'Change result');
    assert.deepEqual(plain(b.rounds), before, 'Cancel (not answering) changes nothing');
    q.onConfirm();
    b.rounds.slice(1).forEach((r) => r.forEach((m) => assert.ok(m.aEntryId !== oldW && m.bEntryId !== oldW)));
    assert.equal(f('bracketChampion')(b), null);
    const later = plain(b.rounds.slice(1));
    assert.equal(save('knockout', 0, 1, 3, 2), undefined, 'same winner: no question');
    assert.deepEqual(plain(b.rounds.slice(1)), later);
  },
  'clear-result': () => {
    const t = say('managing-the-tournament');
    assert.match(t, /click it and choose Clear result\. DartDraw asks "Clear this result\?" first: click Clear result again, or Cancel\. The match goes back to not played, and the round robin standings are worked out again/);
    assert.match(t, /A match marked Neither showed has Reverse it instead/);
    reset(); const ev = rr({ played: true }); const g = ev.groups[0]; const [a, b2] = g.entryIds;
    f('promptScore')(g.id, a, b2, 'x', 'y');
    const dlg = modals.pop();
    assert.equal(dlg.secondaryLabel, 'Clear result');
    dlg.onSecondary();
    const q = modals.pop();
    assert.equal(q.title, 'Clear this result?'); assert.equal(q.confirmLabel, 'Clear result');
    q.onConfirm();
    assert.ok(!f('getScore')(g, a, b2));
    reset(); const k = ko(4); f('markKnockoutVoid')('knockout', 0, 0);
    f('koMatchScoreModal')('knockout', 0, 0);
    const v = modals.pop(); assert.equal(v.secondaryLabel, ''); assert.match(v.bodyHTML, />Reverse it</);
    void k;
  },
  'rr-clear-after-draw': () => {
    assert.match(say('managing-the-tournament'), /After the knockout has been drawn from a round robin, a group result can still be corrected with Save score, but it can no longer be cleared/);
    reset(); const ev = rr({ played: true }); f('generateKnockoutFromRR')(); assert.ok(ev.knockout);
    const g = ev.groups[0];
    f('promptScore')(g.id, g.entryIds[0], g.entryIds[1], 'x', 'y');
    const dlg = modals.pop();
    assert.match(dlg.onSecondary().error, /can no longer be cleared/);
    app.document = typedDoc({ scA: 3, scB: 1 });
    try { assert.equal(dlg.onConfirm(), undefined, 'Save score still works'); } finally { app.document = DOC; }
  },
  'withdraw-guard': () => {
    const t = say('player-leaves');   // Release 5: withdrawals moved into "No-shows and players who leave"
    assert.match(t, /click Withdraw next to the entry on step 3\. You can do this until their group starts/);
    assert.match(t, /Once their group has started \(after Start all games\), once they have a result, or once a drawn bracket holds them, Withdraw is no longer possible/);
    assert.match(t, /offers Mark no-show instead/);
    assert.match(say('player-leaves'), /Do not use Withdraw: once the group has started it is refused/);
    reset(); const before = rr({ notStarted: true });
    f('withdrawEntry')(before.groups[0].entryIds[0]);
    assert.equal(modals.pop().confirmLabel, 'Withdraw', 'before the start it is the Withdraw box');
    reset(); const ev = rr();
    f('withdrawEntry')(ev.groups[0].entryIds[0]);
    const d = modals.pop();
    assert.equal(d.title, 'Games have started in Group A'); assert.equal(d.confirmLabel, 'Mark no-show instead');
    assert.doesNotMatch(f('flatEntriesRowsHTML')(f('flatEntriesData')()), />Withdraw<\/button>/, 'the button is gone after the start');
  },
  'no-show-route': () => {
    const t = say('player-leaves');
    assert.match(t, /Every match they have not played in that group becomes a walkover loss, tagged WO, so their opponents get the points/);
    assert.match(t, /Their opponent goes through by a walkover, tagged WO/);
    reset(); const ev = rr(); const g = ev.groups[0]; const v = g.entryIds[1];
    f('withdrawEntry')(v); modals.pop().onConfirm();
    f('groupMatches')(g).filter(([a, b]) => a === v || b === v).forEach(([a, b]) => assert.equal(f('getScore')(g, a, b).wo, true));
    reset(); const k = ko(8); const m = k.knockout.rounds[0][0];
    f('withdrawEntry')(m.aEntryId); modals.pop().onConfirm();
    assert.equal(m.winnerId, m.bEntryId); assert.equal(m.wo, true);
    assert.equal(k.knockout.rounds[1][0].aEntryId, m.bEntryId);
  },
  'roster-lock': () => {
    const faq = say('faq-entries-locked');
    assert.match(faq, /DartDraw refuses anything that would move or remove those entries, and says why: Withdraw, Swap with… and Random draw on step 3, and lowering Number of entries on step 1 when that would remove someone who is playing\. Before the games start all of these work as usual/);
    assert.match(say('creating-an-event'), /DartDraw refuses with "These entries are already playing" and saves nothing/);
    assert.match(say('draw-the-groups'), /Once any group has started, Random draw is greyed out and Swap with… is no longer offered for entries in a started group/);
    assert.match(say('player-leaves'), /Until the knockout is drawn from the groups, the same box has an undo link\. After that a no-show can no longer be undone/);
    // started: every one of them is refused, nothing changes
    reset(); const ev = rr(); const before = plain({ g: ev.groups, l: ev.entriesList });
    app.document = typedDoc({ f_entries: 6, f_tname: 'n' });
    try { f('saveStage1')(); } finally { app.document = DOC; }
    assert.equal(modals.pop().title, 'These entries are already playing');
    f('performSwap')(ev.groups[0].entryIds[0], ev.groups[1].id, 0); assert.equal(modals.pop().title, 'Entries can no longer be swapped');
    f('confirmShuffleGroups')(); assert.equal(modals.pop().title, 'The groups can no longer be redrawn');
    assert.deepEqual(plain({ g: ev.groups, l: ev.entriesList }), before);
    assert.match(f('entriesPanel')(), /disabled onclick="confirmShuffleGroups\(\)"/);
    // before the start: all work
    reset(); const pre = rr({ notStarted: true });
    f('performSwap')(pre.groups[0].entryIds[0], pre.groups[1].id, 0); assert.equal(modals.length, 0);
    f('confirmShuffleGroups')(); assert.equal(modals.pop().title, 'Random draw?');
    app.document = typedDoc({ f_entries: 6, f_tname: 'n' });
    try { f('saveStage1')(); } finally { app.document = DOC; }
    assert.equal(pre.entriesList.length, 6);
    // the undo link goes once the knockout is drawn
    reset(); const k = rr({ played: true }); f('generateKnockoutFromRR')(); k.entriesList[0].noShow = true;
    f('openNoShowPicker')(k.groups[0].id); assert.doesNotMatch(modals.pop().bodyHTML, /undoGroupNoShow/);
  },
  'checkin-warning': () => {
    const t = say('check-in-and-start');
    assert.match(t, /"Not everyone is checked in" when you click Start all games, when you click Generate bracket or Regenerate bracket in a Knockout, and when you draw or confirm Group Boards groups/);
    assert.match(t, /Drawing the knockout after a round robin \(Generate knockout bracket\) does not warn/);
    // Start all games
    reset(); rr({ notStarted: true, unchecked: true }); f('startAllGames')();
    assert.match(modals.pop().bodyHTML, /Not everyone is checked in/);
    // Generate bracket in a Knockout
    reset(); const k = ko(8); k.knockout = null; k.entriesList[0].checkedIn = false; f('regenerateKnockoutBracket')();
    assert.match(modals.pop().bodyHTML, /Not everyone is checked in/);
    // Generate knockout bracket after a round robin: no warning, it just draws
    reset(); const ev = rr({ played: true, unchecked: true }); f('confirmGenerateKnockoutFromRR')();
    assert.equal(modals.length, 0); assert.ok(ev.knockout);
    // Group Boards: drawing and confirming check it (pods-ui.js)
    const pods = fs.readFileSync(path.join(root, 'pods-ui.js'), 'utf8');
    assert.match(fnBody(pods, 'podsDrawClick'), /noShowWarningHTML\(missing\)/);
    assert.match(fnBody(pods, 'podsCheckInGuard'), /noShowWarningHTML\(missing\)/);
  },
  'phone-bar': () => {
    const t = say('limits-and-facts');
    assert.match(t, /The bar is used on every phone \(a touch screen less than 600 pixels on its short side, whichever way you hold it\) and in any window narrower than about 700 pixels\. A tablet, and a laptop or desktop window that is wider than that, keep the menu at the side, even when the window is short/);
    // a phone on its side, even a wide one (812 x 375), is a phone: the compact bar replaces the menu
    const phone = { coarse: true, hoverNone: true, shortSide: 375, devicePortrait: false, viewportPortrait: false };
    assert.equal(f('isPhoneDevice')(phone), true);
    assert.equal(f('deviceGateState')(phone), 'phone-banner');
    assert.equal(f('isPhoneDevice')(Object.assign({}, phone, { shortSide: 768 })), false, 'a tablet is not');
    assert.equal(f('isPhoneDevice')({ coarse: false, hoverNone: false, shortSide: 375 }), false, 'a short laptop window is not');
    assert.match(fnBody(appHtml, 'isPhoneDevice'), /o\.shortSide<600/);
    assert.match(appHtml, /@media \(max-width:700px\)\{\s*\.app\{display:block\}\s*\.sidebar\{display:none\}\s*\.compact-bar\{display:flex\}/);
    assert.match(appHtml, /body\.is-phone:not\(\.mko-popout\) \.sidebar\{display:none\}/);
    assert.match(appHtml, /body\.is-phone:not\(\.mko-popout\) \.compact-bar\{display:flex\}/);
    assert.match(fnBody(appHtml, 'applyDeviceGate'), /classList\.toggle\('is-phone', phone\)/);
    assert.match(say('troubleshooting'), /You are on a phone, or the window is narrower than about 700 pixels, so the menu is replaced by a bar at the top/);
  },
  'finalized-sidebar': () => {
    const t = say('finishing-the-event');
    assert.match(t, /The Rename and Delete buttons under the event in Saved tournaments look the same as before, but they are locked too: clicking one only explains why, for example "Finalized events can only be renamed by an Admin\."/);
    assert.match(t, /Duplicate still works and makes a new copy you can edit/);
    reset(); const ev = ko(4); ev.id = 't_fin'; ev.finalized = { at: '2026-10-23T10:00:00.000Z' };
    app.__ev = ev; run(app, 'tournamentsCache = {}; tournamentsCache.t_fin = __ev');
    f('renameTournament')('t_fin', { stopPropagation() {} });
    assert.equal(modals.pop().body, 'Finalized events can only be renamed by an Admin.');
    f('deleteTournament')('t_fin', { stopPropagation() {} });
    assert.equal(modals.pop().body, 'Finalized events can only be deleted by an Admin.');
    assert.doesNotMatch(fnBody(appHtml, 'duplicateTournament'), /isFinalizedId|finalizedBlockModal/, 'Duplicate is not blocked');
    assert.match(fnBody(appHtml, 'renderSavedList'), /onclick="renameTournament\(/, 'the sidebar buttons are ordinary buttons (not greyed)');
  },
  'print-order': () => {
    const t = say('draws-and-printing');
    assert.match(t, /can include, in this order: the rules & format sheet, always the first page when it is ticked/);
    assert.match(t, /a master running order, straight after the rules sheet \(or first, if you leave the rules sheet out\)/);
    assert.match(appText, /A master running order sheet \(board-by-board match list\) is added automatically, straight after the rules & format sheet \(or as the first page when that sheet is left out\)\./);
    assert.doesNotMatch(appText, /generated automatically as the first page of the pack/, 'the old second "first page" is gone');
    reset(); const ev = rr({ notStarted: true });
    const mount = { innerHTML: '' };
    app.document = { getElementById: () => mount, createElement: DOC.createElement, body: DOC.body };
    try {
      const confirmed = ev.groups;
      ev.printSettings.rulesSheetEnabled = true; f('printPackNow')(confirmed);
      const rules = f('rulesSheetHTML')(), order = f('runningOrderSheetHTML')(confirmed);
      assert.equal(mount.innerHTML.indexOf(rules), 0, 'the rules sheet is the first page');
      assert.equal(mount.innerHTML.indexOf(order), rules.length, 'the running order comes straight after it');
      ev.printSettings.rulesSheetEnabled = false; f('printPackNow')(confirmed);
      assert.equal(mount.innerHTML.indexOf(order), 0, 'without the rules sheet the running order is first');
    } finally { app.document = DOC; }
  },
};

test('every claims tag in the Help has a behaviour check, and every check belongs to a tag that is used', () => {
  const used = new Set();
  Object.values(items).forEach((it) => (it.claims || []).forEach((c) => used.add(c)));
  assert.deepEqual([...used].filter((c) => !CHECKS[c]), [], 'tags with no check');
  assert.deepEqual(Object.keys(CHECKS).filter((c) => !used.has(c)), [], 'checks with no tag');
  Object.values(items).forEach((it) => { if (it.claims) assert.ok(Array.isArray(it.claims) && it.claims.every((c) => /^[a-z][a-z0-9-]*$/.test(c)), it.id); });
});
Object.keys(CHECKS).forEach((tag) => test('Help claim "' + tag + '" is what the app does', CHECKS[tag]));

test('the button and box names the new Help quotes exist in the app', () => {
  ['Clear result', 'Change result', 'Clear this result?', 'This changes who goes through', 'Mark no-show instead', 'Games have started in Group ',
    'The knockout has been drawn', 'Reverse it', 'Mark no-show…', 'Regenerate from current standings', 'Generate knockout bracket', 'Generate bracket', 'Regenerate bracket',
    'Finalized events can only be ', ' later result', 'will be cleared too.', 'goes back to not played'].forEach((q) => assert.ok(appText.includes(q), q));
  const all = Object.values(items).map((it) => plainText(it.body)).join(' ');
  ['Clear result', 'Change result', 'Clear this result?', 'Mark no-show instead', 'Reverse it'].forEach((q) => assert.ok(all.includes(q), 'Help quotes ' + q));
});

test('the old untrue sentences are gone from the Help', () => {
  const all = Object.values(items).map((it) => plainText(it.body + ' ' + (it.summary || ''))).join(' ');
  assert.doesNotMatch(all, /later matches that depended on it are cleared/);
  assert.doesNotMatch(all, /when you start games, generate a bracket or confirm Group Boards groups/);
  assert.doesNotMatch(all, /Controls are greyed out\. That includes/);
  assert.doesNotMatch(all, /Your screen is narrow or short/);
  assert.doesNotMatch(all, /Before play, in a round robin you can Withdraw them/);
});

test('the article "No-shows and players who leave" holds the no-show topics, sits in "On the day", and covers every stage step by step', () => {
  const day = content.sections.find((s) => s.id === 'on-the-day').items.map((i) => i.id);
  assert.ok(day.includes('player-leaves'), 'in On the day');
  assert.equal(day.indexOf('player-leaves'), day.indexOf('managing-the-tournament') + 1, 'right after entering scores');
  const body = items['player-leaves'].body;
  ['leaves-before', 'leaves-groups', 'leaves-knockout', 'leaves-finalized', 'no-shows', 'neither-showed', 'withdrawals'].forEach((id) => assert.match(body, new RegExp('<h4 id="' + id + '">')));
  assert.ok((body.match(/<ol>/g) || []).length >= 3, 'numbered steps');
  const help = fs.readFileSync(path.join(root, 'help.html'), 'utf8');
  assert.match(help, /<article class="harticle" id="player-leaves" data-item/);
  assert.match(help, /href="#player-leaves"/);
});

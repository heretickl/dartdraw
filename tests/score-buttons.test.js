const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), vm = require('vm');
const { loadApp, run, useState } = require('./lib/helpers');

/* Tap-to-score (owner, 2026-11-02): the floor officials' phone form (score.js) offers every valid result as a button under
   the player who won, then a check screen; Teams get counters. The organiser's result boxes (app.html) offer the same
   buttons above the leg boxes, which stay for the keyboard. */

/* ---------- the phone page, on a small stand-in page ----------
   score.js only sets innerHTML, finds elements by id or by [data-k] / [data-c], and sets onclick / textContent. */
function phone(data) {
  const els = {};
  const el = (id) => els[id] || (els[id] = makeEl(id));
  function makeEl(id) {
    const e = { id, textContent: '', value: '', hidden: false, className: '', style: {}, onclick: null, _html: '', _kids: {},
      setAttribute() {}, getAttribute(k) { return this['_' + k]; } };
    Object.defineProperty(e, 'innerHTML', { get() { return this._html; }, set(h) {
      this._html = h; this._kids = {};
      for (const m of h.matchAll(/<(\w+)([^>]*)>([^<]*)/g)) {
        const attrs = m[2], idm = /\bid="([^"]+)"/.exec(attrs);
        const cls = (/\bclass="([^"]*)"/.exec(attrs) || [])[1] || '';
        if (idm) { const c = el(idm[1]); c.textContent = m[3]; c.className = cls; c.onclick = null; c._html = ''; }
        for (const d of ['k', 'c', 'pos']) { const dm = new RegExp('data-' + d + '="([^"]+)"').exec(attrs); if (dm) this._kids[d + ':' + dm[1]] = { ['_data-' + d]: dm[1], className: cls, textContent: m[3], onclick: null, getAttribute(k) { return this['_' + k]; } }; }
      }
    } });
    e.querySelectorAll = function (sel) { const d = (/\[data-(\w+)\]/.exec(sel) || [])[1]; return Object.keys(this._kids).filter((k) => k.startsWith(d + ':')).map((k) => this._kids[k]); };
    return e;
  }
  const ctx = { window: {}, document: { getElementById: el, documentElement: {}, querySelectorAll: () => [], addEventListener() {}, visibilityState: 'visible' },
    localStorage: { getItem: () => null, setItem() {} }, location: { pathname: '/score/x', search: '' }, navigator: {},
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, fetch: () => new Promise(() => {}), Promise, Date, Math, JSON, Object, Array, String, Number,
    DDOffline: new Proxy({}, { get: () => () => Promise.resolve(null) }),
    history: { depth: 0, state: null, pushState(st) { this.depth++; this.state = st; }, back() { this.depth--; this.state = null; } } };
  const fetches = []; ctx.fetch = (url) => { fetches.push(String(url)); return new Promise(() => {}); };
  ctx.window.window = ctx.window; ctx.window.__DD_SCORE_NO_BOOT = true; vm.createContext(ctx);
  const src = fs.readFileSync(require.resolve('../score.js'), 'utf8')
    .replace("if(typeof window !== 'undefined') window.__ddScore = {", "if(typeof window !== 'undefined') window.__ddScore = { openForm: openForm, render: render, showBoard: showBoard, onPopState: onPopState, setView: function(v){ view = v; }, setData: function(d){ data = d; view = 'list'; },");
  vm.runInContext(fs.readFileSync(require.resolve('../i18n/score.en.js'), 'utf8'), ctx); vm.runInContext(src, ctx);
  const S = ctx.window.__ddScore; S.setData(data);
  const box = el('sheetBox');
  return {
    S, box, el, ctx, fetches,
    tap(kind, key) { const b = box._kids[kind + ':' + key]; assert.ok(b, 'button ' + kind + ':' + key + ' in ' + Object.keys(box._kids)); b.onclick(); },
    click(id) { assert.ok(el(id).onclick, id + ' has a handler'); el(id).onclick(); },
    keys(kind) { return Object.keys(box._kids).filter((k) => k.startsWith(kind + ':')).map((k) => k.slice(kind.length + 1)); },
    last() { return S.state().queue.slice(-1)[0]; },
  };
}
const rrSlot = (o) => Object.assign({ pos: 'rr:gA:e0|e3', kind: 'rr', a: 'e0', b: 'e3', board: 1, state: 'open', legs: 5, rv: 0, info: { matchNo: 1, posA: 2, posB: 1, flip: true } }, o || {});
const names = { e0: 'Ali', e3: 'Abu', t0: 'Ipoh Arrows', t1: 'KL Darts' };

test('phone: each valid result is a button under the player who won, in the paper’s order; a tap opens the check, Save sends it for the right player', () => {
  const P = phone({ entries: names, format: { competitionUnit: 'Singles' }, slots: [rrSlot()] });
  P.S.openForm('rr:gA:e0|e3');
  assert.deepEqual(P.keys('k'), ['b:0', 'b:1', 'b:2', 'a:0', 'a:1', 'a:2'], 'Abu (printed first) first, then Ali');
  assert.match(P.box.innerHTML, /<span>Abu won<\/span>[\s\S]*<span>Ali won<\/span>/);
  assert.doesNotMatch(P.box.innerHTML, /<input/, 'no keyboard');
  P.tap('k', 'b:1');
  assert.match(P.box.innerHTML, /Check, then save/);
  assert.match(P.box.innerHTML, /<p class="big">Abu 3–1<\/p>/);
  assert.match(P.box.innerHTML, /Abu beat Ali/);
  P.click('cSave');
  const q = P.last();
  assert.equal(q.pos, 'rr:gA:e0|e3', 'sent for this match'); assert.equal(q.op, 'score'); assert.equal(q.la, 1, 'la is slot.a’s (Ali’s) legs'); assert.equal(q.lb, 3);
});

test('phone: Change goes back to the buttons; the buttons follow the round’s best-of; a saved result shows lit', () => {
  const P = phone({ entries: names, format: { competitionUnit: 'Singles' }, slots: [rrSlot({ legs: 7, info: { flip: false } }), rrSlot({ pos: 'rr:gA:x', state: 'done', result: { legs1: 2, legs2: 3 }, info: {} })] });
  P.S.openForm('rr:gA:e0|e3');
  assert.deepEqual(P.keys('k'), ['a:0', 'a:1', 'a:2', 'a:3', 'b:0', 'b:1', 'b:2', 'b:3']);
  assert.match(P.box.innerHTML, />4–3</);
  P.tap('k', 'a:3'); P.click('cBack');
  assert.equal(P.keys('k').length, 8, 'back on the buttons');
  P.S.openForm('rr:gA:x');
  assert.match(P.box.innerHTML, /class="btn ghost sc on" data-k="b:2"/, 'the saved 3–2 for Abu (slot b) is lit');
});

test('phone: a knockout match offers Winner only, which sends the winner alone; walkover and Neither showed stay', () => {
  const P = phone({ entries: names, format: { competitionUnit: 'Singles' }, slots: [{ pos: 'ko:knockout:0:0', kind: 'ko', a: 'e0', b: 'e3', board: 1, state: 'open', legs: 5, rv: 0, info: { matchNo: '1-1' } }] });
  P.S.openForm('ko:knockout:0:0');
  assert.ok(P.keys('k').includes('a:win') && P.keys('k').includes('b:win'));
  assert.ok(P.el('fNsA').onclick && P.el('fVoid').onclick && P.el('fCall').onclick, 'the other actions are there');
  P.tap('k', 'a:win');
  assert.match(P.box.innerHTML, /<p class="big">Ali won<\/p>/);
  P.click('cSave');
  const q = P.last(); assert.equal(q.pos, 'ko:knockout:0:0'); assert.equal(q.op, 'win'); assert.equal(q.side, 'a');
});

test('phone, Teams: a – / + counter per team (0 to the cap), Next checks the totals, then the same check screen', () => {
  const P = phone({ entries: names, format: { competitionUnit: 'Teams' }, slots: [{ pos: 'rr:gA:t0|t1', kind: 'rr', a: 't0', b: 't1', board: 1, state: 'open', legs: 5, teamCap: 10, rv: 0, info: {} }] });
  P.S.openForm('rr:gA:t0|t1');
  assert.deepEqual(P.keys('k'), [], 'no score buttons for Teams');
  P.click('fNext');
  assert.match(P.el('formErr').textContent, /not both 0/);
  for (let i = 0; i < 12; i++) P.tap('c', 'a:1');
  assert.equal(P.el('ct_a').textContent, 10, 'held at the cap');
  P.tap('c', 'a:-1'); P.tap('c', 'b:1'); P.tap('c', 'b:1'); P.tap('c', 'b:-1'); P.tap('c', 'b:-1'); P.tap('c', 'b:-1');
  assert.equal(P.el('ct_b').textContent, 0, 'never under 0');
  P.tap('c', 'b:1'); P.tap('c', 'b:1');
  P.click('fNext');
  assert.match(P.box.innerHTML, /<p class="big">Ipoh Arrows 9–2<\/p>/);
  P.click('cSave');
  const q = P.last(); assert.equal(q.pos, 'rr:gA:t0|t1'); assert.equal(q.la, 9); assert.equal(q.lb, 2);
});

/* ---------- the organiser's result boxes ---------- */
const app = loadApp();
const f = (n) => run(app, n);
function organiser() {
  const els = {};
  const mk = (id, extra) => (els[id] = Object.assign({ id, value: '', textContent: '', _a: {}, getAttribute(k) { return this._a[k]; }, setAttribute(k, v) { this._a[k] = String(v); },
    classList: { _s: new Set(), toggle(c, on) { if (on) this._s.add(c); else this._s.delete(c); }, contains(c) { return this._s.has(c); } }, dispatchEvent() {} }, extra || {}));
  let box = null;
  app.openModal = (o) => {
    box = o; Object.keys(els).forEach((k) => delete els[k]);
    const h = o.bodyHTML || '';
    const sp = /<div class="sp" id="scorePick" data-m="(\d+)" data-a="([^"]*)" data-b="([^"]*)">/.exec(h);
    const btns = [...h.matchAll(/class="sp-btn[^"]*" data-sp="([^"]+)"[^>]*>([^<]*)</g)].map((m) => mk('btn:' + m[1], { _a: { 'data-sp': m[1] }, label: m[2] }));
    if (sp) mk('scorePick', { _a: { 'data-m': sp[1], 'data-a': sp[2], 'data-b': sp[3] }, querySelectorAll: () => btns });
    const val = (id) => (new RegExp('id="' + id + '"[^>]*value="([^"]*)"').exec(h) || [])[1];
    mk('scA', { value: val('scA') || '', _a: { max: (/id="scA"[^>]*max="(\d+)"/.exec(h) || [])[1] } });
    mk('scB', { value: val('scB') || '', _a: { max: (/id="scB"[^>]*max="(\d+)"/.exec(h) || [])[1] } });
    mk('spSum');
    if (/id="koWin"/.test(h)) mk('koWin', { value: (/id="koWin" value="([ab]?)"/.exec(h) || [])[1] || '' });
  };
  app.document = { getElementById: (id) => els[id] || null };
  app.setTimeout = (fn) => fn(); app.Event = function Event(type) { this.type = type; };
  return { els, body: () => box.bodyHTML, confirm: () => box.onConfirm(), lit: () => Object.keys(els).filter((k) => k.startsWith('btn:') && els[k].classList.contains('on')).map((k) => k.slice(4)) };
}
function rrEvent(bestOf, unit) {
  const t = f('blankTournament')(); useState(app, t); app.persist = () => {}; app.render = () => {};
  t.format.formatType = 'roundrobin'; t.format.bestOfLegs = bestOf; t.eventCreation.competitionUnit = unit || 'Singles';
  t.entriesList = ['Abu', 'Hakim', 'Siti', 'Ali'].map((n, i) => ({ id: 'e' + i, name: n, org: '', players: [], withdrawn: false }));
  t.groups = [{ id: 'gA', label: 'A', entryIds: ['e0', 'e1', 'e2', 'e3'], boards: [1], confirmed: true, gameStarted: true, scores: {} }];
  return t;
}

test('organiser, round robin: a button per valid result above the leg boxes; a click fills the boxes, lights the button and says the result', () => {
  const t = rrEvent(5), O = organiser();
  f('promptScore')('gA', 'e0', 'e1', 'Abu', 'Hakim');
  assert.deepEqual(Object.keys(O.els).filter((k) => k.startsWith('btn:')).map((k) => O.els[k].label), ['3–0', '3–1', '3–2', '3–0', '3–1', '3–2']);
  assert.match(O.body(), /Abu won[\s\S]*Hakim won[\s\S]*Or type the legs[\s\S]*id="scA"/);
  f('scorePick')('b', 3, 1);
  assert.equal(O.els.scA.value, 1); assert.equal(O.els.scB.value, 3);
  assert.deepEqual(O.lit(), ['b:1']);
  assert.equal(O.els.spSum.textContent, 'Hakim 3–1 Abu');
  O.confirm();
  const sc = t.groups[0].scores['e0|e1'];
  assert.deepEqual([Number(sc.legs1), Number(sc.legs2)], [1, 3]);
});

test('organiser: typing a valid score lights its button, anything else lights none; a saved result opens lit; best of 7 offers 4–0 to 4–3', () => {
  const t = rrEvent(5), O = organiser();
  f('promptScore')('gA', 'e0', 'e1', 'Abu', 'Hakim');
  O.els.scA.value = '3'; O.els.scB.value = '2'; f('scorePickSync')();
  assert.deepEqual(O.lit(), ['a:2']); assert.equal(O.els.spSum.textContent, 'Abu 3–2 Hakim');
  O.els.scB.value = '3'; f('scorePickSync')();
  assert.deepEqual(O.lit(), []); assert.equal(O.els.spSum.textContent, '');
  f('setScore')(t.groups[0], 'e0', 'e1', 0, 3);
  f('promptScore')('gA', 'e0', 'e1', 'Abu', 'Hakim');
  assert.deepEqual(O.lit(), ['b:0'], 'opens with the saved 3–0 for Hakim lit');
  rrEvent(7); f('promptScore')('gA', 'e0', 'e1', 'Abu', 'Hakim');
  assert.deepEqual(Object.keys(O.els).filter((k) => k.startsWith('btn:a')).map((k) => O.els[k].label), ['4–0', '4–1', '4–2', '4–3']);
});

test('organiser, knockout: Winner only clears the legs and saves the winner alone; a score button sets the winner from the legs', () => {
  const t = f('blankTournament')(); useState(app, t); app.persist = () => {}; app.render = () => {};
  t.format.formatType = 'knockout';
  t.entriesList = Array.from({ length: 4 }, (_, i) => ({ id: 'e' + i, name: 'P' + i, org: '', players: [], withdrawn: false }));
  t.knockout = f('generateBracket')(t.entriesList.map((e) => ({ entryId: e.id, org: '' })), 'Main bracket');
  const O = organiser(), m = t.knockout.rounds[0][0];
  f('koMatchScoreModal')('knockout', 0, 0);
  assert.ok(Object.keys(O.els).includes('btn:a:win') && Object.keys(O.els).includes('btn:b:2'));
  f('scorePick')('a', 3, 2);
  assert.equal(O.els.koWin.value, 'a');
  f('scorePickWinner')('b');
  assert.equal(O.els.scA.value, ''); assert.equal(O.els.koWin.value, 'b');
  assert.deepEqual(O.lit(), ['b:win']);
  O.confirm();
  assert.equal(m.winnerId, m.bEntryId); assert.equal(m.aLegs, null);
});

test('organiser, Teams: no score buttons in the round robin, – / + beside the totals, held between 0 and the cap', () => {
  rrEvent(5, 'Teams'); const O = organiser();
  f('promptScore')('gA', 'e0', 'e1', 'Abu', 'Hakim');
  assert.doesNotMatch(O.body(), /class="sp-btn/);
  assert.match(O.body(), /scStep\('scA',-1\)[\s\S]*scStep\('scA',1\)/);
  const cap = Number(O.els.scA.getAttribute('max'));
  O.els.scA.value = String(cap); f('scStep')('scA', 1); assert.equal(Number(O.els.scA.value), cap);
  O.els.scA.value = '0'; f('scStep')('scA', -1); assert.equal(Number(O.els.scA.value), 0);
  f('scStep')('scA', 1); assert.equal(Number(O.els.scA.value), 1);
});

test('every new word is there in English and Bahasa Malaysia', () => {
  const read = (p) => fs.readFileSync(require.resolve('../' + p), 'utf8');
  ['sp.won', 'sp.winnerOnly', 'sp.orType', 'sp.sum', 'pop.back'].forEach((k) => { assert.ok(read('i18n/app.en.js').includes("'" + k + "'"), k); assert.ok(read('i18n/app.ms.js').includes("'" + k + "'"), 'ms ' + k); });
  ['form.pickHint', 'form.winOnly', 'form.check', 'form.line', 'form.beat', 'form.level', 'form.saveResult', 'form.change', 'form.next'].forEach((k) => {
    assert.ok(read('i18n/score.en.js').includes("'" + k + "'"), k); assert.ok(read('i18n/score.ms.js').includes("'" + k + "'"), 'ms ' + k);
  });
});

test('phone: More options holds the no-shows and the call, each sent for this match; the sheet has a close button and position badges', () => {
  const P = phone({ entries: names, format: { competitionUnit: 'Singles' }, slots: [{ pos: 'ko:knockout:0:0', kind: 'ko', a: 'e0', b: 'e3', board: 1, state: 'open', legs: 5, rv: 0, info: { matchNo: '1-1' } }, rrSlot()] });
  P.S.openForm('rr:gA:e0|e3');
  assert.match(P.box.innerHTML, /id="fClose"/);
  assert.match(P.box.innerHTML, /<span class="bd">1<\/span><span>Abu won<\/span>[\s\S]*<span class="bd">2<\/span><span>Ali won<\/span>/, 'the chart positions, as on the paper');
  assert.match(P.box.innerHTML, /id="fMoreBox" hidden/);
  P.S.openForm('ko:knockout:0:0');
  P.click('fCall');
  const q = P.last(); assert.equal(q.pos, 'ko:knockout:0:0'); assert.equal(q.op, 'call');
});

test('phone: one board at a time, a button per board with its count to play; only the chosen board’s matches show', () => {
  const s1 = rrSlot({ pos: 'rr:gA:1', board: 1 }), s2 = rrSlot({ pos: 'rr:gA:2', board: 1, state: 'done', result: { legs1: 3, legs2: 0 } }), s3 = rrSlot({ pos: 'rr:gB:1', board: 2 }), s4 = rrSlot({ pos: 'rr:gB:2', board: 2, state: 'called' });
  const P = phone({ entries: names, format: { competitionUnit: 'Singles' }, slots: [s1, s2, s3, s4] });
  const main = P.el('main');
  P.S.render();
  assert.match(main.innerHTML, /data-tab="1" aria-pressed="true">Board 1 <span class="cnt">1<\/span>/);
  assert.match(main.innerHTML, /data-tab="2" aria-pressed="false">Board 2 <span class="cnt">2<\/span>/);
  assert.ok(main.innerHTML.includes('data-pos="rr:gA:1"') && !main.innerHTML.includes('data-pos="rr:gB:1"'), 'board 1 only');
  P.S.showBoard('2');
  assert.ok(main.innerHTML.includes('data-pos="rr:gB:1"') && !main.innerHTML.includes('data-pos="rr:gA:1"'), 'board 2 only');
  assert.ok(main.innerHTML.indexOf('rr:gB:2') < main.innerHTML.indexOf('rr:gB:1'), 'the called match first');
  P.S.render();
  assert.match(main.innerHTML, /data-tab="2" aria-pressed="true"/, 'a refresh keeps the board');
});

test('phone: with nothing called, the first match to play is marked Next (and moves on); a called match takes its place', () => {
  const a = rrSlot({ pos: 'rr:gA:1', board: 1 }), b = rrSlot({ pos: 'rr:gA:2', board: 1 }), c = rrSlot({ pos: 'rr:gA:3', board: 1 });
  const P = phone({ entries: names, format: { competitionUnit: 'Singles' }, slots: [a, b, c] }), main = P.el('main');
  P.S.render();
  assert.match(main.innerHTML, /class="mrow next" data-pos="rr:gA:1"/);
  assert.equal((main.innerHTML.match(/class="go"/g) || []).length, 1, 'one Enter button');
  a.state = 'done'; a.result = { legs1: 3, legs2: 0 }; P.S.render();
  assert.match(main.innerHTML, /class="mrow next" data-pos="rr:gA:2"/, 'Next moves on after a result');
  c.state = 'called'; P.S.render();
  assert.match(main.innerHTML, /class="mrow called" data-pos="rr:gA:3"/);
  assert.doesNotMatch(main.innerHTML, /mrow next/, 'a call wins over Next');
});

test('phone: knockout badges read A and B (never colour alone); the page has a dark theme the browser will use', () => {
  const P = phone({ entries: names, format: { competitionUnit: 'Singles' }, slots: [{ pos: 'ko:knockout:0:0', kind: 'ko', a: 'e0', b: 'e3', board: 1, state: 'open', legs: 5, rv: 0, info: { matchNo: '1-1' } }] });
  P.S.openForm('ko:knockout:0:0');
  assert.match(P.box.innerHTML, /<span class="bd">A<\/span><span>Ali won<\/span>[\s\S]*<span class="bd">B<\/span><span>Abu won<\/span>/);
  const html = fs.readFileSync(require.resolve('../score.html'), 'utf8');
  assert.match(html, /<meta name="color-scheme" content="light dark">/);
  assert.match(html, /@media \(prefers-color-scheme: dark\)\{:root\{/);
  const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
  const rules = css.replace(/:root\{[^}]*\}/g, '').replace(/@media[^{]*\{:root\{[^}]*\}\}/g, '');
  assert.deepEqual((rules.match(/#[0-9a-fA-F]{3,6}\b/g) || []).filter((c) => !['#fff', '#3b536f', '#cbd8e6', '#ffd27a'].includes(c)), [], 'every colour outside the header is a token');
});

test('review: Cancel on a no-show confirmation takes the sheet’s Back step away again (one Back press then leaves the list, not two)', () => {
  const P = phone({ entries: names, format: { competitionUnit: 'Singles' }, slots: [rrSlot()] });
  P.el('sheet').hidden = true;   // as the page starts
  P.S.openForm('rr:gA:e0|e3');
  assert.equal(P.ctx.history.depth, 1, 'opening the sheet adds one Back step');
  P.click('fNsA'); P.el('cNo').onclick({ type: 'click' });
  assert.equal(P.ctx.history.depth, 0, 'Cancel removed it');
  P.S.openForm('rr:gA:e0|e3'); P.click('fClose');
  assert.equal(P.ctx.history.depth, 0, 'the close button too');
});

test('review: the PIN is sent once, however many times the 4th digit, Go or Enter fire while it is being checked', () => {
  const P = phone({ entries: names, format: { competitionUnit: 'Singles' }, slots: [] });
  P.S.setView('pin'); P.S.render();
  const pin = P.el('pin'); pin.value = '1234';
  pin.oninput(); pin.oninput(); pin.onkeydown({ key: 'Enter' }); P.el('pinGo').onclick();
  assert.equal(P.fetches.filter((u) => u.includes('/api/score/open')).length, 1);
});

test('leftovers: a walkover reopened on the phone lights no score (its legs were not played)', () => {
  const P = phone({ entries: names, format: { competitionUnit: 'Singles' }, slots: [rrSlot({ state: 'done', canCorrect: true, result: { legs1: 0, legs2: 3, wo: true }, info: { flip: false } })] });
  P.S.openForm('rr:gA:e0|e3');
  assert.doesNotMatch(P.box.innerHTML, /sc on/);
});

test('leftovers: a match opened right after closing another keeps its sheet; its Back step is added once the page\u2019s own Back has arrived', () => {
  const P = phone({ entries: names, format: { competitionUnit: 'Singles' }, slots: [rrSlot(), rrSlot({ pos: 'rr:gA:2' })] });
  const sh = P.el('sheet'); sh.hidden = true;
  P.S.openForm('rr:gA:e0|e3'); assert.equal(P.ctx.history.depth, 1);
  P.click('fClose');                       // the page goes Back (still on its way)...
  P.S.openForm('rr:gA:2');                 // ...and the next match is opened at once
  assert.equal(sh.hidden, false);
  assert.equal(P.ctx.history.depth, 0, 'no step added while the Back is on its way');
  P.S.onPopState();                        // the Back arrives
  assert.equal(sh.hidden, false, 'the new sheet stays open');
  assert.equal(P.ctx.history.depth, 1, 'and now has its own Back step');
  P.S.onPopState();                        // the phone's Back
  assert.equal(sh.hidden, true);
});

test('leftovers: best of 7 puts its four score buttons on one row', () => {
  const P = phone({ entries: names, format: { competitionUnit: 'Singles' }, slots: [rrSlot({ legs: 7 })] });
  P.S.openForm('rr:gA:e0|e3');
  assert.match(P.box.innerHTML, /<div class="scores" style="grid-template-columns:repeat\(4,1fr\)">/);
});

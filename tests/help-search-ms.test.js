const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const HS = require('../help-search');
const { loadHelp, ROOT } = require('./lib/help-pages');

// The Bahasa Malaysia search (i18n step 1): help-search.js with page data lang "ms" (no English stemming, BM stop words,
// repeated words folded, chat short forms), the sentences from the page data, and "alias" on the English pages (a BM
// word typed there searches for its English meaning). The English behaviour is covered, unchanged, by
// help-search.test.js and help-search-fixtures.test.js.
const doc = (id, title, text, extra) => Object.assign({ id, title, keywords: '', summary: '', group: '', parts: [{ id, head: '', text }] }, extra || {});

test('ms: words are not stemmed (undi / undian / mengundi stay apart), while English keeps its stemmer', () => {
  const docs = [doc('draw', 'Membuat undian kumpulan', 'Klik Undian rawak.'), doc('vote', 'Lain', 'Mereka mengundi.')];
  const ms = HS.createIndex(docs, { lang: 'ms' });
  assert.deepEqual(ms.search('undian').results.map((r) => r.id), ['draw'], '"undian" is the draw, never "mengundi"');
  assert.deepEqual(ms.search('mengundi').results.map((r) => r.id), ['vote']);
  // "cetak" still finds the start of "cetakan" (prefix), but not "mencetak" (no affix cutting)
  const p = HS.createIndex([doc('a', 'Set cetakan', 'x'), doc('b', 'Lain', 'Anda mencetak.')], { lang: 'ms' });
  assert.deepEqual(p.search('cetak').results.map((r) => r.id), ['a']);
  // English pages: the same module, the stemmer as before
  const en = HS.createIndex([doc('p', 'Printing', 'Prints the pack.')]);
  assert.equal(en.search('printed').results[0].id, 'p');
  const msNoStem = HS.createIndex([doc('p', 'Printing', 'Prints the pack.')], { lang: 'ms' });
  assert.equal(msNoStem.search('printed').results.length, 0, 'no English stemming on the BM page');
});

test('ms: BM question words are stop words, short forms are read in full, a repeated word counts once', () => {
  const ix = HS.createIndex([doc('a', 'Ketidakhadiran', 'Jika pemain tidak hadir, tandakan tidak hadir.'), doc('b', 'Cetak', 'Cetak set kosong.')],
    { lang: 'ms', synonyms: [['tidak hadir', 'tak hadir', 'no show']] });
  const pq = ix.parse('bagaimana saya nak cetak');
  assert.deepEqual(pq.concepts.map((c) => c.label), ['cetak'], 'only the topic word is left');
  assert.equal(ix.search('macam mana nak cetak').results[0].id, 'b');
  assert.equal(ix.search('pemain tk hadir').results[0].id, 'a', '"tk" is read as "tidak", so the phrase "tidak hadir" matches');
  assert.equal(ix.search('no show').results[0].id, 'a', 'the English words in a BM synonym group find the BM text');
  assert.deepEqual(HS.createIndex([doc('k', 'Kumpulan', 'x')], { lang: 'ms' }).parse('kumpulan-kumpulan').concepts.map((c) => c.label), ['kumpulan']);
  assert.ok(HS.STOP_MS.includes('bagaimana') && HS.STOP_MS.includes('nak') && !HS.STOP_MS.includes('cetak'));
  assert.equal(HS.SHORT_MS.utk, 'untuk');
});

test('ms: marks in snippets follow the same unstemmed words', () => {
  const ix = HS.createIndex([doc('a', 'Undian', 'Klik Undian rawak untuk membuat undian kumpulan.')], { lang: 'ms' });
  const r = ix.search('undian');
  const text = 'Klik Undian rawak untuk membuat undian kumpulan.';
  assert.deepEqual(HS.markRanges(text, r.hl).map(([s, e]) => text.slice(s, e)), ['Undian', 'undian']);
});

test('alias: a BM word typed on the English page searches for its English meaning; English queries are untouched', () => {
  const docs = [doc('print', 'Printing the blank pack', 'Click Print bracket pack.'), doc('noshow', 'No-shows', 'Mark no-show.')];
  const plain = HS.createIndex(docs, {}), withAlias = HS.createIndex(docs, { alias: [['cetak', 'print'], ['tidak hadir', 'no show'], ['macam mana', ''], ['tidak', '']] });
  assert.equal(withAlias.search('macam mana nak cetak').results[0].id, 'print');
  assert.equal(withAlias.search('pemain tidak hadir').results[0].id, 'noshow', 'the longest phrase wins over the single word');
  ['print', 'no show', 'printing pack', 'mark no-show'].forEach((q) => assert.deepEqual(withAlias.search(q).results, plain.search(q).results, q));
  assert.equal(withAlias.search('cetak').query, 'cetak', 'the result keeps what the person typed');
});

test('page strings: counts, close matches, the near label and Show all come from the page data, in either form', () => {
  const docs = []; for (let i = 0; i < 12; i++) docs.push(doc('d' + i, 'Cetak ' + i, 'cetak'));
  const { parse } = require('./lib/mini-dom');
  const page = (strings) => {
    const d = parse('<input id="q"><p id="s"></p><div id="r"></div>' + docs.map((x) => `<details class="q" id="${x.id}"><summary>${x.title}</summary><div class="a">${x.parts[0].text}</div></details>`).join(''));
    const c = HS.attach({ document: d, input: d.getElementById('q'), status: d.getElementById('s'), results: d.getElementById('r'), items: d.querySelectorAll('details.q'), data: { lang: 'ms', strings } });
    return { d, c };
  };
  const { d } = page({ count: '{n} hasil', near: 'Tiada jawapan tepat. {n} padanan yang hampir', nearLabel: 'Padanan paling hampir:', showAll: 'Tunjukkan kesemua {n} hasil' });
  const input = d.getElementById('q');
  input.value = 'cetak'; input.dispatchEvent({ type: 'input' }); d.flush();
  assert.equal(d.getElementById('s').textContent, '12 hasil');
  assert.equal(d.getElementById('r').querySelectorAll('button')[0].textContent, 'Tunjukkan kesemua 12 hasil');
  input.value = 'zzzzz'; input.dispatchEvent({ type: 'input' }); d.flush();
  assert.equal(d.getElementById('s').textContent, '0 hasil');
  const en = page({ count: { one: '1 result', other: '{n} results' } });
  const i2 = en.d.getElementById('q'); i2.value = 'cetak 3'; i2.dispatchEvent({ type: 'input' }); en.d.flush();
  assert.match(en.d.getElementById('s').textContent, /^\d+ results?$/);
});

const SETS = {
  'organiser-ms': require('./fixtures/help-search-ms-organiser.json'),
  'spectator-ms': require('./fixtures/help-search-ms-spectator.json')
};
for (const which of Object.keys(SETS)) {
  const fx = SETS[which];
  const page = loadHelp(which);
  test(which + ' fixture: at least 40 BM and mixed phrases, each expected anchor on the page, the page data says lang ms', () => {
    assert.ok(fx.phrases.filter((p) => !p.none).length >= 40, 'phrases: ' + fx.phrases.length);
    const seen = new Set();
    fx.phrases.forEach((p) => {
      assert.ok(!seen.has(p.q), 'duplicate ' + p.q); seen.add(p.q);
      (p.expect || []).forEach((id) => assert.ok(page.byId(id), p.q + ': #' + id + ' is not on the page'));
    });
    const data = JSON.parse(page.html.match(/<script type="application\/json" id="helpSearchData">([\s\S]*?)<\/script>/)[1]);
    assert.equal(data.lang, 'ms');
    assert.ok(data.strings && data.strings.count && data.strings.near && data.strings.showAll && data.strings.nearLabel);
  });
  test(which + ' fixture: every answerable phrase has an expected anchor in the top 3', () => {
    const misses = [];
    fx.phrases.filter((p) => !p.none).forEach((p) => {
      const top = page.controller.search(p.q).results.slice(0, 3);
      if (!top.some((r) => p.expect.includes(r.id) || p.expect.includes(r.anchor))) misses.push(p.q + ' -> ' + top.map((r) => r.anchor).join(', '));
    });
    assert.deepEqual(misses, []);
  });
  test(which + ' fixture: a phrase the Help cannot answer shows the suggestions and an honest BM line, never a confident answer', () => {
    const wrong = [];
    fx.phrases.filter((p) => p.none).forEach((p) => {
      const r = page.controller.search(p.q);
      if (!r.suggest || r.clear || !r.say) wrong.push(p.q + ' -> ' + (r.say || r.results.slice(0, 3).map((x) => x.anchor).join(', ')));
    });
    assert.deepEqual(wrong, []);
    page.type(fx.phrases.find((p) => p.none).q);
    const status = page.byId(which === 'organiser-ms' ? 'helpCount' : 'faqStatus').textContent;
    assert.doesNotMatch(status, /result|question|match|answer/i, 'the status line is in BM: ' + status);
    page.type('');
  });
}

test('cross-language: BM searches on the ENGLISH Help pages find the English answer (through "alias")', () => {
  const org = loadHelp('organiser'), spec = loadHelp('spectator');
  const top3 = (pg, q) => pg.controller.search(q).results.slice(0, 3).flatMap((r) => [r.id, r.anchor]);
  [['cetak bracket', ['print-pack', 'bracket-sheets', 'draws-and-printing']], ['lupa kata laluan', ['faq-forgot-password', 'signing-in', 'getting-started']],
    ['pemain tidak hadir', ['no-shows', 'faq-no-show', 'player-leaves']], ['macam mana nak terbitkan keputusan', ['publish', 'publishing-results']],
    ['tarik diri', ['withdrawals', 'player-leaves', 'leaves-before']], ['kod qr', ['qr-codes', 'draws-and-printing']]]
    .forEach(([q, want]) => assert.ok(top3(org, q).some((x) => want.includes(x)), 'organiser EN: ' + q + ' -> ' + top3(org, q)));
  [['mana anak saya', ['q-find-player', 'q-when-where']], ['skor salah', ['q-wrong-score']], ['mod gelap', ['q-theme']], ['kod qr', ['q-qr']]]
    .forEach(([q, want]) => assert.ok(top3(spec, q).some((x) => want.includes(x)), 'spectator EN: ' + q + ' -> ' + top3(spec, q)));
  // asking for the language: the organiser Helps answer with their article on the EN | BM switch, the printed sheets
  // language and the e-mails (the app is in both languages now); the spectator Help keeps its line pointing at the switch
  const lang = (pg, q) => pg.controller.search(q);
  [[org, 'bahasa malaysia'], [org, 'language'], [loadHelp('organiser-ms'), 'bahasa inggeris'], [loadHelp('organiser-ms'), 'tukar bahasa']].forEach(([pg, q]) => {
    const r = lang(pg, q);
    assert.equal(r.say, '', q + ': no "not covered" line');
    assert.ok(r.results.slice(0, 3).some((x) => ['languages', 'language-switch', 'sheet-language'].includes(x.anchor || x.id)), q);
  });
  ['organiser', 'organiser-ms'].forEach((p) => assert.doesNotMatch(JSON.stringify(require('./lib/help-pages').loadHelp(p).controller.search('bahasa')), /in English for now|bahasa Inggeris buat masa ini/));
  assert.match(loadHelp('spectator-ms').controller.search('english').say, /ketik EN/);
});

test('the viewer copy of help-search.js is the root file (npm run check-viewer)', () => {
  assert.ok(fs.readFileSync(path.join(ROOT, 'viewer', 'help-search.js')).equals(fs.readFileSync(path.join(ROOT, 'help-search.js'))));
});

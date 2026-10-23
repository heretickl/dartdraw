const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadHelp } = require('./lib/help-pages');

// The walkthrough phrases as a regression suite (kb-expert-review C3 point 10, G1 point 2): every phrase a novice typed
// in the organiser and spectator walkthroughs. A phrase the Help answers must have one of its expected anchors in the
// top 3 results; a phrase the Help does not answer must show the suggestions (never a confident wrong answer).
// Each search runs on the real page, through the same code the browser runs (tests/lib/help-pages.js).
const SETS = {
  organiser: require('./fixtures/help-search-organiser.json'),
  spectator: require('./fixtures/help-search-spectator.json')
};

for (const which of Object.keys(SETS)) {
  const fx = SETS[which];
  const page = loadHelp(which);

  test(which + ' fixture: the phrase list is complete and every expected anchor exists on the page', () => {
    assert.ok(fx.phrases.length >= (which === 'organiser' ? 86 : 148), 'phrases: ' + fx.phrases.length);
    const seen = new Set();
    fx.phrases.forEach((p) => {
      assert.ok(!seen.has(p.q), 'duplicate phrase ' + p.q); seen.add(p.q);
      assert.ok(p.none === true ? !p.expect : Array.isArray(p.expect) && p.expect.length, p.q + ': expect or none');
      (p.expect || []).forEach((id) => assert.ok(page.byId(id), p.q + ': anchor #' + id + ' is not on the page'));
    });
    assert.equal(page.controller.index().size, page.doc.querySelectorAll(which === 'organiser' ? '[data-item]' : 'details.q').length, 'every item is indexed');
  });

  test(which + ' fixture: every answerable phrase has an expected anchor in the top 3', () => {
    const misses = [];
    fx.phrases.filter((p) => !p.none).forEach((p) => {
      const top = page.controller.search(p.q).results.slice(0, 3);
      if (!top.some((r) => p.expect.includes(r.id) || p.expect.includes(r.anchor))) misses.push(p.q + ' -> ' + top.map((r) => r.anchor).join(', '));
    });
    assert.deepEqual(misses, []);
  });

  test(which + ' fixture: every phrase the Help cannot answer shows the suggestions, and nothing opens by itself', () => {
    const wrong = [];
    fx.phrases.filter((p) => p.none).forEach((p) => {
      const r = page.controller.search(p.q);
      if (!r.suggest || r.clear) wrong.push(p.q + ' -> ' + r.results.slice(0, 3).map((x) => x.anchor).join(', '));
    });
    assert.deepEqual(wrong, []);
    // and on the page itself: the no-answer box with the typed words, the popular topics, and the honest line when there is one
    const one = fx.phrases.find((p) => p.none);
    page.type(one.q);
    const empty = page.byId(which === 'organiser' ? 'helpEmpty' : 'faqNone');
    assert.equal(empty.hidden, false);
    assert.equal(page.byId(which === 'organiser' ? 'helpEmptyQ' : 'faqNoneQ').textContent, one.q);
    assert.ok(empty.querySelectorAll('a').filter((a) => /^#./.test(a.getAttribute('href'))).length >= 3, 'popular topics offered');
    page.type('');
    assert.equal(empty.hidden, true);
  });
}

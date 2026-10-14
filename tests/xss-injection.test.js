const { test } = require('node:test');
const assert = require('node:assert/strict');
const { KINDS, build, makeInjector, callAll, parseLeaks, RETURNS_HTML } = require('./lib/xss-harness');

// Stored event data is untrusted (an Admin opens other organisers' events in their own session), so every place the organiser app
// builds HTML must escape it. For each event format this builds a complete tournament, puts a payload into EVERY field (first all
// the text fields; then every number/boolean replaced by a payload string), calls every screen, print builder and modal, and checks
// that none of the HTML that was produced contains an ACTIVE payload: an injected tag, an event-handler attribute, a javascript: URL,
// script or style content, a break-out of an attribute or of a quoted string inside an onclick. Escaped text is fine. A crash caused
// by hostile data is tolerated (it is not a leak); the sinks are still exercised because the HTML is captured before and after.
//
// If this fails, the message names the field that leaked and the function that wrote it. Fix the builder (escText / escJs / imgSrc in
// index.html, escapeHtml elsewhere), not the test.

function leaksFor(kind, mode, part, parts) {
  const { app, t } = build(kind);
  const { inject, fieldOf } = makeInjector(part, parts);
  inject(t, kind, mode, 0);
  const { captured, errors, calls } = callAll(app, t, kind, { htmlReturn: (label) => RETURNS_HTML.test(label.replace(/#\d$/, '')) });
  const found = {};
  for (const c of captured) {
    for (const l of parseLeaks(c.html)) {
      const field = (fieldOf[l.n] || '?' + l.n).replace(/^\w+/, '');
      const key = l.kind + ' <- ' + field;
      (found[key] = found[key] || new Set()).add(c.src.replace(/^\w+:/, '').replace(/#\d /, ' '));
    }
  }
  return { found, outputs: captured.length, errors: Object.keys(errors).length, calls };
}
const report = (found) => Object.keys(found).sort().map((k) => '  ' + k + '\n      written by ' + [...found[k]].slice(0, 6).join('; ')).join('\n');

// Text fields: one pass over every format. Number fields: three interleaved passes (every third field per pass), so that one hostile
// value that crashes a builder cannot hide the sinks of the other fields; run time is a few seconds per format.
const NUMBER_PASSES = 3;
for (const kind of KINDS) {
  test('no injected payload becomes active HTML: ' + kind + ', text in every text field', () => {
    const r = leaksFor(kind, 'strings');
    assert.ok(r.outputs > 100, 'the renderers must actually produce HTML (' + r.outputs + ' outputs)');
    assert.equal(Object.keys(r.found).length, 0, 'active payloads in the HTML:\n' + report(r.found));
  });
}
for (const kind of KINDS.filter((k) => k !== 'rrtie' && k !== 'doubles')) {   // rrtie and doubles only differ from rr / rrko in text, covered above
  test('no injected payload becomes active HTML: ' + kind + ', text in every number field', () => {
    const all = {};
    for (let part = 0; part < NUMBER_PASSES; part++) {
      const r = leaksFor(kind, 'numbers', part, NUMBER_PASSES);
      assert.ok(r.outputs > 100, 'the renderers must actually produce HTML (' + r.outputs + ' outputs)');
      Object.assign(all, r.found);
    }
    assert.equal(Object.keys(all).length, 0, 'active payloads in the HTML:\n' + report(all));
  });
}

test('the leak detector itself: it catches an unescaped payload and lets an escaped one through', () => {
  const evil = '"><img src=x onerror=alert(7)>';
  assert.ok(parseLeaks('<div title="' + evil + '">x</div>').length > 0);
  assert.ok(parseLeaks('<div onclick="go(\'' + "');alert(7);('" + '\')">x</div>').length > 0);
  assert.ok(parseLeaks('<a href="javascript:alert(7)">x</a>').length > 0);
  assert.ok(parseLeaks('<input value="a" x="\' onmouseover=alert(7) x=\'">').length > 0 || parseLeaks('<p onmouseover=alert(7)>x</p>').length > 0);
  assert.equal(parseLeaks('<div title="&quot;&gt;&lt;img src=x onerror=alert(7)&gt;">&lt;img src=x onerror=alert(7)&gt;</div>').length, 0);
  assert.equal(parseLeaks('<div onclick="go(\'it\\&#39;s\')">ok</div>').length, 0);
});

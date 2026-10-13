const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, useState } = require('./lib/helpers');

const app = loadApp(); app.persist = () => {}; app.render = () => {};
const f = (n) => run(app, n);
function fresh(opts) {
  opts = opts || {};
  const t = f('blankTournament')(); useState(app, t);
  t.published = !!opts.published; t.publicSlug = opts.published ? 'mx24oh2j14ei' : null; if (opts.listed !== undefined) t.listed = opts.listed;
  app.__org = opts.viewerUrl === null ? { viewerUrl: '' } : { viewerUrl: 'https://dartdraw-viewer.vercel.app' };
  run(app, 'currentOrganizer = __org');
  return t;
}
const card = () => f('publicResultsCardHTML')();

test('the checkbox is there, unchecked and disabled, while Public results is off', () => {
  fresh();
  const html = card();
  assert.match(html, /id="listToggle"/); assert.match(html, /List on the public page/);
  assert.match(html, /id="listToggle" disabled/); assert.doesNotMatch(html, /id="listToggle" checked/);   // (the onchange text contains the word "checked", so match the attribute order)
  assert.match(html, /Turn on Public results first/);
});

test('once Public results is on the checkbox is enabled and off by default, and an old tournament without the flag is unlisted', () => {
  const t = fresh({ published: true });
  assert.equal(t.listed, undefined);
  const html = card();
  assert.doesNotMatch(html, /id="listToggle" (?:checked )?disabled/); assert.doesNotMatch(html, /id="listToggle" checked/);
  assert.match(html, /home page: its name, date, format, number of entries and, once finished, the winner/);
  assert.match(html, /Your private link keeps working either way/);
});

test('setListed turns the flag on and off while published, and saves', () => {
  const t = fresh({ published: true });
  let saves = 0; app.persist = () => { saves++; };
  f('setListed')(true); assert.equal(t.listed, true); assert.match(card(), /id="listToggle" checked/);
  f('setListed')(false); assert.equal(t.listed, false); assert.doesNotMatch(card(), /id="listToggle" checked/);
  assert.equal(saves, 2);
  app.persist = () => {};
});

test('setListed cannot list an event whose results are not published', () => {
  const t = fresh({ published: false });
  f('setListed')(true); assert.equal(!!t.listed, false);
});

test('turning Public results off also turns the listing off, and turning it back on does not relist', () => {
  const t = fresh({ published: true, listed: true });
  f('setPublished')(false); assert.equal(t.listed, false); assert.equal(t.published, false);
  f('setPublished')(true); assert.equal(t.published, true); assert.equal(!!t.listed, false);
  assert.doesNotMatch(card(), /id="listToggle" checked/);
});

test('without a viewer address the switch is disabled with its own explanation, and there is no All events link', () => {
  fresh({ published: true, viewerUrl: null });
  const html = card();
  assert.match(html, /id="listToggle" disabled/); assert.match(html, /address of the public site isn't set up yet/); assert.doesNotMatch(html, /All events/);
});

test('with a viewer address the card links to the home page', () => {
  fresh({ published: true });
  assert.match(card(), /href="https:\/\/dartdraw-viewer\.vercel\.app"[^>]*>All events/);
});

test('the flag is stored in the tournament data like any setting, and no other part of the card changed', () => {
  const t = fresh({ published: true });
  f('setListed')(true);
  assert.equal(JSON.parse(JSON.stringify(t)).listed, true);
  const html = card();
  assert.match(html, /id="publishToggle"/); assert.match(html, /Copy link/); assert.match(html, /Open ↗/);
});

test('a duplicated tournament is never listed, even if the original was', async () => {
  const src = fresh({ published: true, listed: true });
  src.id = 'src_test1'; src.eventCreation.tournamentName = 'Test Open';
  app.__src = src; run(app, 'tournamentsCache = { src_test1: __src }; dbUpdatedAtCache = {}');
  let sent = null, opened = null;
  const realFetch = app.apiFetch, realOpen = app.openTournament;
  app.apiFetch = async (url, opts) => { sent = JSON.parse(opts.body).data; return { ok: true, json: async () => ({ updated_at: 'x' }) }; };   // stub: no server in the test
  app.openTournament = async (id) => { opened = id; };
  try { await f('duplicateTournament')('src_test1', { stopPropagation() {} }); }
  finally { app.apiFetch = realFetch; app.openTournament = realOpen; }
  assert.ok(sent && opened === sent.id && sent.id !== 'src_test1');
  assert.equal(sent.listed, false); assert.equal(sent.published, false); assert.equal(sent.publicSlug, undefined);
  assert.equal(src.listed, true);   // the original is untouched
  // turning Public results on for the copy does not list it
  useState(app, sent); f('setPublished')(true);
  assert.equal(sent.listed, false);
});

test('a stale listed flag on an unpublished tournament is cleared when Public results is switched on', () => {
  const t = fresh({ published: false, listed: true });
  f('setPublished')(true);
  assert.equal(t.published, true); assert.equal(t.listed, false);
  assert.doesNotMatch(card(), /id="listToggle" checked/);
});

test('switching Public results on again while it is already on leaves the listing alone', () => {
  const t = fresh({ published: true, listed: true });
  f('setPublished')(true);
  assert.equal(t.published, true); assert.equal(t.listed, true);
  assert.match(card(), /id="listToggle" checked/);
});

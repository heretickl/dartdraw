const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp, run, useState } = require('./lib/helpers');

// Touch phones and tablets: landscape only. Laptops and desktops: never a message. See deviceGateState() in app.html.
const app = loadApp();
const f = (n) => run(app, n);
// the words of the static markup as English source (i18n step 3 added data-i18n attributes; tests/lib/app-source.js)
const src = require('./lib/app-source').englishSource('app.html');
const gate = (o) => f('deviceGateState')(o);

const PHONE = { coarse: true, hoverNone: true, shortSide: 390 };
const TABLET = { coarse: true, hoverNone: true, shortSide: 768 };
const LAPTOP = { coarse: false, hoverNone: false, shortSide: 900 };

test('laptops and desktops never get a message, whatever the window shape', () => {
  [true, false].forEach((portrait) => [300, 390, 900].forEach((shortSide) => [false, true].forEach((popout) => {
    assert.equal(gate({ coarse: false, hoverNone: false, shortSide, portrait, popout }), 'none');
    // a touch laptop: the main pointer is fine and it can hover
    assert.equal(gate({ coarse: false, hoverNone: true, shortSide, portrait, popout }), 'none');
    assert.equal(gate({ coarse: true, hoverNone: false, shortSide, portrait, popout }), 'none');
  })));
  assert.equal(gate(), 'none');
  assert.equal(gate({}), 'none');
});

test('a touch phone: upright asks to rotate (and says a bigger screen is best); on its side it opens with the banner', () => {
  assert.equal(gate(Object.assign({ portrait: true }, PHONE)), 'rotate-phone');
  assert.equal(gate(Object.assign({ portrait: false }, PHONE)), 'phone-banner');
  assert.equal(gate(Object.assign({ portrait: false, shortSide: 599 }, PHONE)), 'phone-banner');
});

test('a touch tablet: upright asks to rotate; on its side, no message', () => {
  assert.equal(gate(Object.assign({ portrait: true }, TABLET)), 'rotate-tablet');
  assert.equal(gate(Object.assign({ portrait: false }, TABLET)), 'none');
  assert.equal(gate({ coarse: true, hoverNone: true, shortSide: 600, portrait: false }), 'none', '600 is a tablet');
});

test('a full-page window never shows the banner, but still asks to rotate when upright', () => {
  assert.equal(gate(Object.assign({ portrait: false, popout: true }, PHONE)), 'none');
  assert.equal(gate(Object.assign({ portrait: true, popout: true }, PHONE)), 'rotate-phone');
  assert.equal(gate(Object.assign({ portrait: true, popout: true }, TABLET)), 'rotate-tablet');
  assert.equal(gate(Object.assign({ portrait: false, popout: true }, LAPTOP)), 'none');
});

// ---------- wiring to the page ----------
function makeEl() { return { hidden: true, classes: new Set(), classList: { toggle(n, on) { if (on) this._s.add(n); else this._s.delete(n); }, _s: null } }; }
function dom() {
  const els = { deviceGate: makeEl(), deviceGatePhone: makeEl(), phoneBanner: makeEl() };
  const body = makeEl(); body.classList._s = body.classes;
  Object.values(els).forEach((e) => { e.classList._s = e.classes; });
  app.document = { getElementById: (id) => els[id] || null, body };
  return { els, body };
}
function storage() {
  const m = {};
  return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, m };
}

test('the overlay and the banner follow the state; the app underneath is untouched', () => {
  const DOC = app.document;
  try {
    const { els, body } = dom();
    app.window = { sessionStorage: storage() };
    run(app, 'phoneBannerDismissedHere = false');
    f('applyDeviceGate')('rotate-phone');
    assert.equal(els.deviceGate.hidden, false);
    assert.equal(els.deviceGatePhone.hidden, false, 'the phone note shows');
    assert.equal(els.phoneBanner.hidden, true);
    assert.equal(body.classes.has('device-gate-on'), true);
    f('applyDeviceGate')('rotate-tablet');
    assert.equal(els.deviceGate.hidden, false);
    assert.equal(els.deviceGatePhone.hidden, true, 'no phone note on a tablet');
    f('applyDeviceGate')('phone-banner');           // rotated: the overlay goes by itself
    assert.equal(els.deviceGate.hidden, true);
    assert.equal(els.phoneBanner.hidden, false);
    assert.equal(body.classes.has('device-gate-on'), false);
    f('applyDeviceGate')('none');
    assert.equal(els.deviceGate.hidden, true);
    assert.equal(els.phoneBanner.hidden, true);
  } finally { app.document = DOC; }
});

test('dismissing the banner is remembered for the session, and works even where storage throws', () => {
  const DOC = app.document, WIN = app.window;
  try {
    const { els } = dom();
    const st = storage();
    app.window = { sessionStorage: st, matchMedia: () => ({ matches: true }), innerWidth: 844, innerHeight: 390, screen: { width: 390, height: 844 } };
    run(app, 'phoneBannerDismissedHere = false');
    assert.equal(f('applyDeviceGate')(), 'phone-banner', 'read from the real media queries and screen size');
    assert.equal(els.phoneBanner.hidden, false);
    f('dismissPhoneBanner')();
    assert.equal(els.phoneBanner.hidden, true);
    assert.equal(st.m['dartdraw.phoneBannerDismissed'], '1');
    // a new page load in the same session (fresh flag, same storage) keeps it dismissed
    run(app, 'phoneBannerDismissedHere = false');
    f('applyDeviceGate')('phone-banner');
    assert.equal(els.phoneBanner.hidden, true);
    // storage blocked: dismissing still hides it for this page
    app.window = { get sessionStorage() { throw new Error('blocked'); } };
    run(app, 'phoneBannerDismissedHere = false');
    f('applyDeviceGate')('phone-banner');
    assert.equal(els.phoneBanner.hidden, false);
    assert.doesNotThrow(() => f('dismissPhoneBanner')());
    f('applyDeviceGate')('phone-banner');
    assert.equal(els.phoneBanner.hidden, true);
  } finally { app.document = DOC; app.window = WIN; run(app, 'phoneBannerDismissedHere = false'); }
});

test('the inputs come from matchMedia and the screen size, never the user agent', () => {
  const WIN = app.window;
  try {
    const mq = { '(pointer: coarse)': true, '(hover: none)': true };
    app.window = { matchMedia: (q) => ({ matches: !!mq[q] }), innerWidth: 768, innerHeight: 1024, screen: { width: 768, height: 1024 } };
    let i = f('readDeviceGateInputs')();
    assert.equal(i.coarse, true); assert.equal(i.hoverNone, true); assert.equal(i.shortSide, 768); assert.equal(i.portrait, true);
    assert.equal(gate(i), 'rotate-tablet');
    mq['(pointer: coarse)'] = false; mq['(hover: none)'] = false;
    i = f('readDeviceGateInputs')();
    assert.equal(gate(i), 'none');
  } finally { app.window = WIN; }
  const body = src.slice(src.indexOf('function deviceGateState('), src.indexOf('function initDeviceGate('));
  assert.doesNotMatch(body, /userAgent|navigator\./);
  // it re-checks on rotation and resizing
  const init = src.slice(src.indexOf('function initDeviceGate('), src.indexOf('try{ initDeviceGate(); }'));
  assert.match(init, /addEventListener\('resize'/);
  assert.match(init, /orientationchange/);
  assert.match(init, /\(orientation: portrait\)/);
});

test('the page has the overlay text, the phone note and the banner, all hidden until the script decides', () => {
  assert.match(src, /<div class="device-gate" id="deviceGate"[^>]*hidden>[\s\S]*?Please rotate your device to landscape to use DartDraw\.[\s\S]*?<p class="device-gate-phone" id="deviceGatePhone" hidden>DartDraw works best on a tablet, laptop or desktop\.<\/p>/);
  assert.match(src, /<div class="phone-banner" id="phoneBanner" hidden><span>DartDraw works best on a tablet, laptop or desktop\.<\/span><button[^>]*onclick="dismissPhoneBanner\(\)"/);
  // the overlay sits above modals, and none of it prints
  assert.match(src, /\.device-gate\{position:fixed;inset:0;z-index:10000/);
  assert.match(src, /@media print\{[\s\S]*\.stale-banner,\.phone-banner,\.device-gate,\.compact-bar,\.fin-toast\{display:none !important\}/);
});

// ---------- compact top bar ----------
test('the compact bar replaces the sidebar on narrow windows and on phones (by screen size, never by window height)', () => {
  assert.match(src, /@media \(max-width:700px\)\{\s*\.app\{display:block\}\s*\.sidebar\{display:none\}\s*\.compact-bar\{display:flex\}/);
  assert.match(src, /body\.is-phone:not\(\.mko-popout\) \.app\{display:block\}\s*body\.is-phone:not\(\.mko-popout\) \.sidebar\{display:none\}\s*body\.is-phone:not\(\.mko-popout\) \.compact-bar\{display:flex\}/);
  assert.match(src, /body\.is-phone:not\(\.mko-popout\) \.main\{padding:14px 16px 28px\}/, 'the full-page window keeps its own edge-to-edge layout on a phone');
  assert.doesNotMatch(src, /\(pointer:coarse\) and \(max-height/, 'an on-screen keyboard shrinking a tablet window never flips the layout');
  assert.match(src, /\.compact-bar\{display:none;/, 'hidden by default (desktop and tablet keep the sidebar)');
  assert.match(src, /body\.mko-popout \.compact-bar\{display:none !important\}/);
  const bar = (src.match(/<header class="compact-bar" id="compactBar">([\s\S]*?)<\/header>/) || [])[1] || '';
  assert.match(bar, /id="compactStageName"/);
  assert.match(bar, /id="saveStatusCompact"/);
  assert.match(bar, /<a class="compact-link" href="\/help" target="_blank" rel="noopener">Help<\/a>/);
  assert.match(bar, /onclick="logout\(\)">Log out<\/button>/);
});

test('the step menu lists all seven steps and only lets you open the ones goStage allows', () => {
  const t = f('blankTournament')(); t.id = 't_cm1'; t.eventCreation.tournamentName = 'Cup <b>';
  useState(app, t);
  run(app, 'tournamentsCache = {}; tournamentsCache.t_cm1 = state; currentStage = 1');
  const count = (html, re) => (html.match(re) || []).length;
  let html = f('compactMenuHTML')();
  assert.equal(count(html, /class="compact-item[^"]*"[^>]*>\d\. /g), 7, 'seven steps');
  assert.match(html, /onclick="compactGo\(1\)">1\. Event creation/);
  assert.equal(count(html, /disabled>\d\. /g), 6, 'only step 1 before anything is saved');
  t.eventCreation.saved = true;
  html = f('compactMenuHTML')();
  assert.equal(count(html, /disabled>\d\. /g), 5);
  t.format.saved = true; t.entriesList = [{ id: 'e1', name: 'A' }];
  html = f('compactMenuHTML')();
  assert.equal(count(html, /disabled>\d\. /g), 0);
  for (let n = 1; n <= 7; n++) assert.equal(f('stageReachable')(n), true);
  // the event list escapes names, and the current step is marked
  assert.match(html, /Cup &lt;b&gt;/);
  assert.match(html, /class="compact-item active" aria-current="step" onclick="compactGo\(1\)"/);
  assert.match(html, /onclick="compactNewTournament\(\)">\+ New tournament/);
  // without an open event there are no steps to pick
  run(app, 'state = null');
  assert.doesNotMatch(f('compactMenuHTML')(), /compactGo/);
  assert.equal(f('stageReachable')(1), false);
});

test('the compact bar names the current step', () => {
  const DOC = app.document;
  try {
    const name = { textContent: '' }; const title = { textContent: 'Admin' };
    app.document = { getElementById: (id) => (id === 'compactStageName' ? name : id === 'pageTitle' ? title : null) };
    const t = f('blankTournament')(); useState(app, t); run(app, 'currentStage = 5');
    f('renderCompactBar')();
    assert.equal(name.textContent, '5. Manage Tournament');
    run(app, 'state = null'); title.textContent = 'Welcome to DartDraw';
    f('renderCompactBar')();
    assert.equal(name.textContent, 'Welcome to DartDraw');
  } finally { app.document = DOC; }
});

// ---------- pop-ups ----------
test('a blocked pop-up says so instead of doing nothing', () => {
  const t = f('blankTournament')(); t.id = 't_pop'; useState(app, t);
  const WIN = app.window, OM = run(app, 'openModal');
  const shown = [];
  try {
    app.openModal = (o) => shown.push(o);
    app.location = { origin: 'http://x', pathname: '/app' };
    app.window = { open: () => null };
    f('openInNewWindow')('knockout');
    assert.equal(shown.length, 1);
    assert.match(shown[0].body, /Your browser blocked the new window — allow pop-ups for this site/);
    app.window = { open: () => ({}) };
    f('openInNewWindow')('knockout');
    assert.equal(shown.length, 1, 'no message when the window opened');
  } finally { app.window = WIN; app.openModal = OM; }
});

test('copy: step 1 no longer claims no login or internet is needed, names the three competition types, and no rubber lineups are advertised', () => {
  const s1 = f('stage1');
  const t = f('blankTournament')(); useState(app, t);
  const html = s1();
  assert.match(html, /For singles, doubles or teams events\./);
  assert.doesNotMatch(html, /No login|internet connection/i);
  assert.doesNotMatch(src, /custom team (rubber )?lineups/);
});

// ---------- round 2: device orientation, phone class, inert overlay, menu focus and contents ----------
test('M4: upright means the DEVICE is upright: a tall window on a tablet held sideways (Slide Over, Split View) is not trapped', () => {
  const WIN = app.window;
  const mq = { '(pointer: coarse)': true, '(hover: none)': true };
  const win = (o) => Object.assign({ matchMedia: (q) => ({ matches: !!mq[q] }), innerWidth: 320, innerHeight: 1000, screen: { width: 1366, height: 1024 } }, o);
  try {
    // iPad on its side, app in a narrow Slide Over window
    app.window = win({ screen: { width: 1366, height: 1024, orientation: { type: 'landscape-primary' } } });
    const i = f('readDeviceGateInputs')();
    assert.equal(i.portrait, false);
    assert.equal(gate(i), 'none', 'no rotate notice');
    // the same tablet really held upright
    app.window = win({ innerWidth: 1024, innerHeight: 1366, screen: { width: 1024, height: 1366, orientation: { type: 'portrait-primary' } } });
    assert.equal(gate(f('readDeviceGateInputs')()), 'rotate-tablet');
    // old iOS: only window.orientation (90 = on its side, 0 = upright)
    app.window = win({ orientation: 90 });
    assert.equal(f('readDeviceGateInputs')().portrait, false);
    app.window = win({ orientation: 0, innerWidth: 1000, innerHeight: 320 });
    assert.equal(f('readDeviceGateInputs')().portrait, true);
    // neither API: the window's shape
    app.window = win({});
    assert.equal(f('readDeviceGateInputs')().portrait, true);
    app.window = win({ innerWidth: 1000, innerHeight: 320 });
    assert.equal(f('readDeviceGateInputs')().portrait, false);
  } finally { app.window = WIN; }
  // it also listens to screen.orientation changes, and there is no "Continue anyway"
  assert.match(src, /window\.screen\.orientation\.addEventListener\('change', update\)/);
  assert.doesNotMatch(src, /Continue anyway/i);
});

test('L2: the phone class comes from the screen size (the same test as the banner); a tablet with the keyboard up stays a tablet', () => {
  const DOC = app.document, WIN = app.window;
  try {
    const { body } = dom();
    const mq = { '(pointer: coarse)': true, '(hover: none)': true };
    app.window = { matchMedia: (q) => ({ matches: !!mq[q] }), innerWidth: 844, innerHeight: 390, screen: { width: 390, height: 844, orientation: { type: 'landscape-primary' } }, sessionStorage: storage() };
    f('applyDeviceGate')();
    assert.equal(body.classes.has('is-phone'), true, 'a phone on its side');
    // a tablet whose on-screen keyboard shrank the window to 1180x420
    app.window = { matchMedia: (q) => ({ matches: !!mq[q] }), innerWidth: 1180, innerHeight: 420, screen: { width: 1180, height: 820, orientation: { type: 'landscape-primary' } }, sessionStorage: storage() };
    f('applyDeviceGate')();
    assert.equal(body.classes.has('is-phone'), false);
    // a laptop never
    mq['(pointer: coarse)'] = false; mq['(hover: none)'] = false;
    app.window = { matchMedia: (q) => ({ matches: !!mq[q] }), innerWidth: 500, innerHeight: 400, screen: { width: 500, height: 400 } };
    f('applyDeviceGate')();
    assert.equal(body.classes.has('is-phone'), false);
    assert.equal(f('isPhoneDevice')({ coarse: true, hoverNone: true, shortSide: 599 }), true);
    assert.equal(f('isPhoneDevice')({ coarse: true, hoverNone: true, shortSide: 600 }), false);
  } finally { app.document = DOC; app.window = WIN; }
});

test('L3: while the rotate notice shows, the app behind it is inert and focus is in the notice; both undone when it goes', () => {
  const DOC = app.document;
  try {
    const mk = (id) => ({ id, inert: false, attrs: {}, hidden: true, focused: 0, setAttribute(k) { this.attrs[k] = ''; }, removeAttribute(k) { delete this.attrs[k]; }, focus() { this.focused++; }, classList: { toggle() {} } });
    const els = {}; ['deviceGate', 'deviceGatePhone', 'phoneBanner', 'compactBar', 'staleBanner', 'modalBackdrop', 'previewModalBackdrop', 'printSheets', 'deviceGateLogout'].forEach((id) => { els[id] = mk(id); });
    const appEl = mk('app');
    const body = { classList: { toggle() {} } };
    app.document = { getElementById: (id) => els[id] || null, querySelector: (s) => (s === '.app' ? appEl : null), body };
    run(app, 'gateInertOn = false');
    f('applyDeviceGate')('rotate-tablet');
    assert.equal(appEl.inert, true); assert.ok('inert' in appEl.attrs);
    ['compactBar', 'staleBanner', 'phoneBanner', 'modalBackdrop'].forEach((id) => assert.equal(els[id].inert, true, id));
    assert.equal(els.deviceGateLogout.focused, 1, 'focus moved into the notice');
    f('applyDeviceGate')('rotate-tablet');
    assert.equal(els.deviceGateLogout.focused, 1, 'not refocused on every resize');
    f('applyDeviceGate')('none');
    assert.equal(appEl.inert, false); assert.ok(!('inert' in appEl.attrs));
    assert.equal(els.compactBar.inert, false);
  } finally { app.document = DOC; run(app, 'gateInertOn = false'); }
});

test('L4: the menu is a plain disclosure: focus goes to the first usable item, Escape gives it back, and it fits on screen', () => {
  const DOC = app.document, WIN = app.window;
  try {
    const first = { focused: 0, focus() { this.focused++; } };
    const menu = { hidden: true, innerHTML: '', style: {}, getBoundingClientRect: () => ({ top: 108 }), querySelector: (s) => (/compact-item:not\(\[disabled\]\)/.test(s) ? first : null) };
    const btn = { attrs: {}, focused: 0, setAttribute(k, v) { this.attrs[k] = v; }, focus() { this.focused++; } };
    app.document = { getElementById: (id) => (id === 'compactMenu' ? menu : id === 'compactStageBtn' ? btn : null) };
    app.window = { innerHeight: 360, scrollTo() {} };
    const t = f('blankTournament')(); useState(app, t);
    f('toggleCompactMenu')();
    assert.equal(menu.hidden, false);
    assert.equal(btn.attrs['aria-expanded'], 'true');
    assert.equal(first.focused, 1);
    assert.equal(menu.style.maxHeight, '244px', 'what is left of a 360px-high screen below the bar');
    f('setCompactMenu')(false, true);       // what Escape does
    assert.equal(menu.hidden, true);
    assert.equal(btn.attrs['aria-expanded'], 'false');
    assert.equal(btn.focused, 1, 'focus back on the step button');
  } finally { app.document = DOC; app.window = WIN; }
  assert.doesNotMatch(src, /id="compactStageBtn"[^>]*aria-haspopup/, 'not announced as a menu it is not');
  assert.match(src, /max-height:calc\(100vh - 70px\);max-height:calc\(100dvh - 70px\)/);
  assert.match(src, /max-height:calc\(100vh - 16px\);max-height:calc\(100dvh - 16px\)/);
});

test('L6: the compact menu has Change password, and Rename / Duplicate / Delete for the open event (the sidebar functions)', () => {
  const t = f('blankTournament')(); t.id = 't_cm6'; useState(app, t);
  run(app, 'tournamentsCache = {}; tournamentsCache.t_cm6 = state; currentOrganizer = { name: "O", role: "organizer", tier: "pro" }');
  const html = f('compactMenuHTML')();
  assert.match(html, /onclick="compactChangePassword\(\)">Change password</);
  assert.match(html, /onclick="compactEventAction\('rename'\)">Rename</);
  assert.match(html, /onclick="compactEventAction\('duplicate'\)">Duplicate</);
  assert.match(html, /onclick="compactEventAction\('delete'\)">Delete</);
  const seen = [];
  const keep = {}; ['renameTournament', 'duplicateTournament', 'deleteTournament', 'openChangePassword', 'setCompactMenu'].forEach((n) => { keep[n] = run(app, n); });
  try {
    app.setCompactMenu = () => {};
    app.renameTournament = (id, ev) => { ev.stopPropagation(); seen.push('rename:' + id); };
    app.duplicateTournament = (id) => seen.push('duplicate:' + id);
    app.deleteTournament = (id) => seen.push('delete:' + id);
    app.openChangePassword = () => seen.push('password');
    ['rename', 'duplicate', 'delete'].forEach((a) => f('compactEventAction')(a));
    f('compactChangePassword')();
    assert.deepEqual(seen, ['rename:t_cm6', 'duplicate:t_cm6', 'delete:t_cm6', 'password']);
  } finally { Object.keys(keep).forEach((n) => { app[n] = keep[n]; }); run(app, 'currentOrganizer = null'); }
  // public mode has no password to change; an event not saved yet has nothing to rename
  run(app, 'currentOrganizer = { publicMode: true }; tournamentsCache = {}');
  const h2 = f('compactMenuHTML')();
  assert.doesNotMatch(h2, /Change password|compactEventAction/);
  run(app, 'currentOrganizer = null');
});

// ---------- round 5: phones decide by the window's shape, tablets by the device ----------
test('phones: a misreported orientation is ignored, the window’s shape decides', () => {
  const WIN = app.window;
  const mq = { '(pointer: coarse)': true, '(hover: none)': true };
  try {
    // a phone held upright whose browser says "landscape-primary"
    app.window = { matchMedia: (q) => ({ matches: q === '(orientation: portrait)' ? true : !!mq[q] }), innerWidth: 375, innerHeight: 812, screen: { width: 375, height: 812, orientation: { type: 'landscape-primary', angle: 0 } } };
    let i = f('readDeviceGateInputs')();
    assert.equal(i.devicePortrait, false, 'what the browser claims');
    assert.equal(i.viewportPortrait, true);
    assert.equal(gate(i), 'rotate-phone');
    // a phone on its side whose browser says "portrait-primary": no rotate notice, just the banner
    app.window = { matchMedia: (q) => ({ matches: q === '(orientation: portrait)' ? false : !!mq[q] }), innerWidth: 812, innerHeight: 375, screen: { width: 375, height: 812, orientation: { type: 'portrait-primary', angle: 0 } } };
    i = f('readDeviceGateInputs')();
    assert.equal(gate(i), 'phone-banner');
    // old iOS phone (only window.orientation, saying upright) on its side: the shape wins
    app.window = { matchMedia: (q) => ({ matches: !!mq[q] }), innerWidth: 812, innerHeight: 375, orientation: 0, screen: { width: 375, height: 812 } };
    assert.equal(gate(f('readDeviceGateInputs')()), 'phone-banner');
    // no size known: matchMedia('(orientation: portrait)') decides
    app.window = { matchMedia: (q) => ({ matches: q === '(orientation: portrait)' ? true : !!mq[q] }), innerWidth: 0, innerHeight: 0, screen: { width: 390, height: 844 } };
    assert.equal(gate(f('readDeviceGateInputs')()), 'rotate-phone');
  } finally { app.window = WIN; }
});

test('tablets: the device decides, so a split or Slide Over window on a tablet held sideways is never trapped; a real upright tablet is', () => {
  const WIN = app.window;
  const mq = { '(pointer: coarse)': true, '(hover: none)': true };
  try {
    app.window = { matchMedia: (q) => ({ matches: q === '(orientation: portrait)' ? true : !!mq[q] }), innerWidth: 400, innerHeight: 1024, screen: { width: 1366, height: 1024, orientation: { type: 'landscape-primary' } } };
    assert.equal(gate(f('readDeviceGateInputs')()), 'none', 'portrait-shaped split window, landscape device');
    app.window = { matchMedia: (q) => ({ matches: q === '(orientation: portrait)' ? true : !!mq[q] }), innerWidth: 1024, innerHeight: 1366, screen: { width: 1024, height: 1366, orientation: { type: 'portrait-primary' } } };
    assert.equal(gate(f('readDeviceGateInputs')()), 'rotate-tablet');
    // and the pure function, given both answers
    assert.equal(gate({ coarse: true, hoverNone: true, shortSide: 768, devicePortrait: false, viewportPortrait: true }), 'none');
    assert.equal(gate({ coarse: true, hoverNone: true, shortSide: 768, devicePortrait: true, viewportPortrait: false }), 'rotate-tablet');
    assert.equal(gate({ coarse: true, hoverNone: true, shortSide: 390, devicePortrait: false, viewportPortrait: true }), 'rotate-phone');
    assert.equal(gate({ coarse: true, hoverNone: true, shortSide: 390, devicePortrait: true, viewportPortrait: false }), 'phone-banner');
  } finally { app.window = WIN; }
});

test('laptops and desktops with a touch screen are never gated, whatever any orientation says', () => {
  const WIN = app.window;
  try {
    for (const [coarse, hoverNone] of [[false, false], [false, true], [true, false]]) {
      const mq = { '(pointer: coarse)': coarse, '(hover: none)': hoverNone, '(orientation: portrait)': true };
      app.window = { matchMedia: (q) => ({ matches: !!mq[q] }), innerWidth: 500, innerHeight: 900, screen: { width: 500, height: 900, orientation: { type: 'portrait-primary' } } };
      assert.equal(gate(f('readDeviceGateInputs')()), 'none', coarse + '/' + hoverNone);
    }
  } finally { app.window = WIN; }
});

test('a phone on its side with the keyboard up (a very short window) is still on its side, a square window is not upright', () => {
  const WIN = app.window;
  const read = (innerWidth, innerHeight, screenW, screenH, orient) => {
    const mq = { '(pointer: coarse)': true, '(hover: none)': true, '(orientation: portrait)': innerHeight > innerWidth };
    app.window = { matchMedia: (q) => ({ matches: !!mq[q] }), innerWidth, innerHeight, screen: { width: screenW, height: screenH, orientation: { type: orient } } };
    return gate(f('readDeviceGateInputs')());
  };
  try {
    assert.equal(read(800, 150, 390, 844, 'landscape-primary'), 'phone-banner');   // keyboard up, phone on its side
    assert.equal(read(800, 150, 390, 844, 'portrait-primary'), 'phone-banner');    // even if the browser misreports it
    assert.equal(read(500, 500, 390, 844, 'landscape-primary'), 'phone-banner');   // square: not taller than wide
    assert.equal(read(390, 844, 390, 844, 'landscape-primary'), 'rotate-phone');   // upright, misreported
  } finally { app.window = WIN; }
});

test('the phone / tablet line is a screen short side of exactly 600: 599 is a phone (window shape), 600 is a tablet (device orientation)', () => {
  const WIN = app.window;
  const read = (shortSide, innerWidth, innerHeight, orient) => {
    const mq = { '(pointer: coarse)': true, '(hover: none)': true, '(orientation: portrait)': innerHeight > innerWidth };
    app.window = { matchMedia: (q) => ({ matches: !!mq[q] }), innerWidth, innerHeight, screen: { width: shortSide, height: 1000, orientation: { type: orient } } };
    return gate(f('readDeviceGateInputs')());
  };
  try {
    // a tall window while the device reports landscape: a phone is told to rotate, a tablet (split screen) is left alone
    assert.equal(read(599, 400, 900, 'landscape-primary'), 'rotate-phone');
    assert.equal(read(600, 400, 900, 'landscape-primary'), 'none');
  } finally { app.window = WIN; }
});

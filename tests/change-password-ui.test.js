const fs = require('fs');
const path = require('path');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, useState } = require('./lib/helpers');

// The "Change password" button in the account bar and its modal (app.html). The endpoint is tested in
// change-password.test.js; here apiFetch is stubbed and the exact request and the screen behaviour are checked.
const app = loadApp();
const f = (n) => run(app, n);
const tick = () => new Promise((r) => setImmediate(r));

const USER = { id: 'org1', name: 'Sam', email: 's@x.com', role: 'organizer', tier: 'basic', entryLimit: 64 };
const ADMIN = { id: 'adm1', name: 'Boss', email: 'boss@x.com', role: 'admin', tier: 'pro', entryLimit: null };
const EVIL = '<img src=x onerror=alert(1)>';
const SUCCESS_TEXT = /other devices and browsers have been signed out/;

const ORIG = {};
['openModal', 'closeModal', 'apiFetch', 'document'].forEach((n) => { ORIG[n] = run(app, n); });
let modals, closed, calls, els, reply, hold;

function field(value) { return { value: value === undefined ? '' : value, focused: false, focus() { this.focused = true; } }; }
function reset(user) {
  Object.keys(ORIG).forEach((n) => { app[n] = ORIG[n]; });
  modals = []; closed = 0; calls = []; reply = { status: 200, body: { ok: true } }; hold = null;
  els = {
    organizerBar: { innerHTML: '' }, adminNav: { innerHTML: '' },
    cpCurrent: field('old password 1'), cpNew: field('a brand new password'), cpRepeat: field('a brand new password'),
    modalErr: { textContent: '', style: { display: 'none' } },
    modalConfirmBtn: { disabled: false, onclick: null },
  };
  app.openModal = (m) => { modals.push(m); };
  app.closeModal = () => { closed++; };
  app.apiFetch = async (url, opts) => {
    calls.push({ url, method: opts && opts.method, body: opts && opts.body ? JSON.parse(opts.body) : undefined, raw: opts && opts.body });
    if (hold) await hold;
    const r = reply;
    if (r.reject) throw new Error('network down');
    return { ok: r.status < 400, status: r.status, json: async () => { if (r.body === undefined) throw new Error('no body'); return r.body; } };
  };
  app.document = { getElementById: (id) => (id in els ? els[id] : null), body: { classList: { toggle() {} } } };
  app.__u = user === undefined ? USER : user;
  run(app, 'currentOrganizer = __u; changePasswordBusy = false; state = null; lockedIds.clear()');
}
const barHTML = () => { f('renderOrganizerBar')(); return els.organizerBar.innerHTML; };
const err = () => els.modalErr.style.display === 'block' ? els.modalErr.textContent : '';
// Opens the modal and returns what the confirm button would do when clicked.
function open() { f('openChangePassword')(); return els.modalConfirmBtn.onclick; }

/* ---------- the button ---------- */
test('a normal organiser sees a Change password button next to Log out', () => {
  reset();
  const html = barHTML();
  assert.match(html, /<button onclick="openChangePassword\(\)">Change password<\/button>/);
  assert.match(html, /<button onclick="logout\(\)">Log out<\/button>/);
  assert.ok(html.indexOf('Change password') < html.indexOf('Log out'), 'sits before Log out, in the same bar');
  assert.match(html, /Sam/);
});

test('an admin gets the button too', () => {
  reset(ADMIN);
  assert.match(barHTML(), /openChangePassword\(\)">Change password<\/button>/);
});

test('no button in public mode (the shared account has no password)', () => {
  reset({ publicMode: true, name: 'Public' });
  const html = barHTML();
  assert.doesNotMatch(html, /Change password/);
  assert.doesNotMatch(html, /openChangePassword/);
  // and calling the opener directly does nothing there
  f('openChangePassword')();
  assert.equal(modals.length, 0);
});

test('the account name in the bar is still escaped next to the new button', () => {
  reset(Object.assign({}, USER, { name: EVIL }));
  const html = barHTML();
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img/);
  assert.match(html, /Change password/);
});

/* ---------- the modal ---------- */
test('the modal has three labelled password fields with the right autocomplete hints', () => {
  reset(); open();
  assert.equal(modals.length, 1);
  assert.equal(modals[0].title, 'Change password');
  const html = modals[0].bodyHTML;
  const input = (id) => (html.match(new RegExp('<input[^>]*id="' + id + '"[^>]*>')) || [''])[0];
  assert.match(input('cpCurrent'), /type="password"/); assert.match(input('cpCurrent'), /autocomplete="current-password"/);
  assert.match(input('cpNew'), /type="password"/); assert.match(input('cpNew'), /autocomplete="new-password"/);
  assert.match(input('cpRepeat'), /type="password"/); assert.match(input('cpRepeat'), /autocomplete="new-password"/);
  assert.match(html, /<label for="cpCurrent">Current password<\/label>/);
  assert.match(html, /<label for="cpNew">New password<\/label>/);
  assert.match(html, /<label for="cpRepeat">Repeat new password<\/label>/);
  assert.equal((html.match(/<input/g) || []).length, 3);
  assert.equal(modals[0].confirmLabel, 'Change password');
});

test('opening the modal focuses the first field and takes over the confirm button', () => {
  reset(); const click = open();
  assert.equal(els.cpCurrent.focused, true);
  assert.equal(click, f('submitChangePassword'));
});

test('the real openModal renders the form and the wired button submits it', async () => {
  reset();
  const box = { innerHTML: '' }, backdrop = { classList: { add() {}, remove() {} } };
  els.modalBox = box; els.modalBackdrop = backdrop;
  app.openModal = ORIG.openModal; app.closeModal = ORIG.closeModal;
  f('openChangePassword')();
  assert.match(box.innerHTML, /<h3>Change password<\/h3>/);
  assert.match(box.innerHTML, /id="cpCurrent"[^>]*autocomplete="current-password"/);
  assert.match(box.innerHTML, /id="modalErr"/);
  assert.match(box.innerHTML, /onclick="closeModal\(\)">Cancel</);
  els.modalConfirmBtn.onclick();      // the button openModal found, re-wired by openChangePassword
  await tick(); await tick();
  assert.equal(calls.length, 1);
});

/* ---------- client checks ---------- */
test('client checks: each problem shows an inline message and sends nothing', async () => {
  const cases = [
    [{ cpCurrent: '', cpNew: 'longenough1', cpRepeat: 'longenough1' }, 'Fill in all three fields.'],
    [{ cpCurrent: 'old password 1', cpNew: '', cpRepeat: '' }, 'Fill in all three fields.'],
    [{ cpCurrent: 'old password 1', cpNew: 'longenough1', cpRepeat: '' }, 'Fill in all three fields.'],
    [{ cpCurrent: 'old password 1', cpNew: 'short', cpRepeat: 'short' }, 'The new password must be at least 8 characters.'],
    [{ cpCurrent: 'old password 1', cpNew: 'x'.repeat(201), cpRepeat: 'x'.repeat(201) }, 'The new password must be at most 200 characters.'],
    [{ cpCurrent: 'old password 1', cpNew: 'longenough1', cpRepeat: 'longenough2' }, 'The new passwords do not match.'],
    [{ cpCurrent: 'old password 1', cpNew: 'old password 1', cpRepeat: 'old password 1' }, 'Choose a new password that is different from the current one.'],
  ];
  for (const [vals, msg] of cases) {
    reset(); const click = open();
    Object.keys(vals).forEach((k) => { els[k].value = vals[k]; });
    await click();
    assert.equal(err(), msg, JSON.stringify(vals));
    assert.equal(calls.length, 0, 'nothing sent: ' + msg);
    assert.equal(closed, 0, 'modal stays open');
    assert.equal(els.modalConfirmBtn.disabled, false);
  }
});

test('changePasswordCheck: the rules in one place (8 is enough, 200 is the most)', () => {
  const check = f('changePasswordCheck');
  assert.equal(check('old', '12345678', '12345678'), '');
  assert.equal(check('old', 'z'.repeat(200), 'z'.repeat(200)), '');
  assert.notEqual(check('old', '1234567', '1234567'), '');
  assert.notEqual(check('12345678', '12345678', '12345678'), '');
});

test('a fixed client error is cleared by the next attempt', async () => {
  reset(); const click = open();
  els.cpRepeat.value = 'different';
  await click();
  assert.equal(err(), 'The new passwords do not match.');
  els.cpRepeat.value = els.cpNew.value;
  await click();
  assert.equal(err(), '');
});

/* ---------- the request ---------- */
test('submit: POSTs { currentPassword, newPassword } as JSON to /api/auth/change-password, and nothing else', async () => {
  reset(); const click = open();
  await click();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/auth/change-password');
  assert.equal(calls[0].method, 'POST');
  assert.deepEqual(calls[0].body, { currentPassword: 'old password 1', newPassword: 'a brand new password' });
  assert.deepEqual(Object.keys(calls[0].body).sort(), ['currentPassword', 'newPassword']);   // the repeat box is not sent
});

test('submit: the passwords are sent as typed (not trimmed)', async () => {
  reset(); const click = open();
  els.cpCurrent.value = '  old with spaces '; els.cpNew.value = ' new with spaces  '; els.cpRepeat.value = ' new with spaces  ';
  await click();
  assert.deepEqual(calls[0].body, { currentPassword: '  old with spaces ', newPassword: ' new with spaces  ' });
});

test('success: the form closes and a confirmation says the other devices were signed out', async () => {
  reset(); const click = open();
  await click();
  assert.equal(closed, 1);
  assert.equal(modals.length, 2);
  assert.equal(modals[1].title, 'Password changed');
  assert.match(modals[1].body, SUCCESS_TEXT);
  assert.match(modals[1].body, /this one stays signed in/);
  assert.equal(modals[1].confirmLabel, 'OK');
  assert.equal(typeof modals[1].onConfirm, 'function');
  assert.equal(err(), '');
});

test('success: the confirmation contains no password text', async () => {
  reset(); const click = open();
  await click();
  const text = JSON.stringify(modals[1]);
  assert.ok(!text.includes('old password 1') && !text.includes('a brand new password'));
});

test('server error: shown inline, modal stays open, button usable again, fields kept', async () => {
  reset(); const click = open();
  reply = { status: 400, body: { error: 'The current password is incorrect.' } };
  await click();
  assert.equal(err(), 'The current password is incorrect.');
  assert.equal(closed, 0);
  assert.equal(modals.length, 1);
  assert.equal(els.modalConfirmBtn.disabled, false);
  assert.equal(els.cpCurrent.value, 'old password 1');
  // and it can be tried again
  reply = { status: 200, body: { ok: true } };
  await click();
  assert.equal(calls.length, 2);
  assert.equal(modals[1].title, 'Password changed');
});

test('server error: 429 and 403 messages are shown too', async () => {
  for (const [status, msg] of [[429, 'Too many attempts. Try again later.'], [403, 'Changing the password is not available for this account.']]) {
    reset(); const click = open();
    reply = { status, body: { error: msg } };
    await click();
    assert.equal(err(), msg);
    assert.equal(closed, 0);
  }
});

test('server text is never parsed as HTML (written with textContent, not innerHTML)', async () => {
  reset(); const click = open();
  reply = { status: 400, body: { error: EVIL } };
  els.modalErr.innerHTML = 'untouched';
  await click();
  assert.equal(els.modalErr.textContent, EVIL);        // shown as text
  assert.equal(els.modalErr.innerHTML, 'untouched');   // never assigned as markup
  const src = fs.readFileSync(path.join(__dirname, '..', 'app.html'), 'utf8');
  const fn = src.slice(src.indexOf('function changePasswordShowError'), src.indexOf('async function submitChangePassword'));
  assert.doesNotMatch(fn, /innerHTML/);
});

test('server error without a usable body gets a plain fallback message', async () => {
  reset(); const click = open();
  reply = { status: 500, body: undefined };
  await click();
  assert.equal(err(), 'Could not change the password. Please try again.');
  reply = { status: 500, body: { error: 42 } };
  await click();
  assert.equal(err(), 'Could not change the password. Please try again.');
  assert.equal(els.modalConfirmBtn.disabled, false);
});

test('network failure: inline message, modal stays open, button usable again', async () => {
  reset(); const click = open();
  reply = { reject: true };
  await click();
  assert.match(err(), /Could not change the password/);
  assert.equal(closed, 0);
  assert.equal(els.modalConfirmBtn.disabled, false);
  assert.equal(f('changePasswordBusy'), false);
});

test('a 200 without ok:true is not treated as success', async () => {
  reset(); const click = open();
  reply = { status: 200, body: {} };
  await click();
  assert.equal(closed, 0);
  assert.equal(modals.length, 1);
  assert.ok(err());
});

/* ---------- double clicks ---------- */
test('double click while the request runs sends exactly one request and disables the button', async () => {
  reset(); const click = open();
  let release; hold = new Promise((r) => { release = r; });
  const first = click();
  const second = click();
  const third = f('submitChangePassword')();
  await tick();
  assert.equal(calls.length, 1);
  assert.equal(els.modalConfirmBtn.disabled, true);
  assert.equal(f('changePasswordBusy'), true);
  release();
  await Promise.all([first, second, third]);
  assert.equal(calls.length, 1);
  assert.equal(closed, 1);
  assert.equal(modals.length, 2);   // one confirmation, not three
  assert.equal(f('changePasswordBusy'), false);
});

test('pressing Enter in a field submits once; other keys do nothing', async () => {
  reset(); open();
  let prevented = 0;
  f('changePasswordKey')({ key: 'a', preventDefault() { prevented++; } });
  assert.equal(calls.length, 0);
  f('changePasswordKey')({ key: 'Enter', preventDefault() { prevented++; } });
  f('changePasswordKey')({ key: 'Enter', preventDefault() { prevented++; } });
  await tick(); await tick();
  assert.equal(calls.length, 1);
  assert.equal(prevented, 2);
});

test('if the modal was closed while the request ran, a failure does not write into whatever is open now', async () => {
  reset(); const click = open();
  let release; hold = new Promise((r) => { release = r; });
  reply = { status: 400, body: { error: 'The current password is incorrect.' } };
  const p = click();
  delete els.cpCurrent; delete els.cpNew; delete els.cpRepeat;   // the user closed it / another dialog replaced it
  els.modalErr.textContent = 'other dialog text';
  release(); await p;
  assert.equal(els.modalErr.textContent, 'other dialog text');
  assert.equal(f('changePasswordBusy'), false);
});

/* ---------- finalized events ---------- */
test('the finalized-lock allow-list lets the Change password handler through', () => {
  const allowed = f('finalizedActionAllowed');
  assert.equal(allowed('openChangePassword()'), true);
  assert.equal(allowed('openChangePassword();startAllGames()'), false);
  assert.ok(f('FINALIZED_ALLOWED_ACTIONS').includes('openChangePassword'));
});

function el(tag, attrs) {
  const a = Object.assign({}, attrs), classes = new Set();
  return { tagName: tag.toUpperCase(), disabled: false, attrs: a, classes,
    classList: { add: (c) => classes.add(c), contains: (c) => classes.has(c) },
    getAttribute: (n) => (n in a ? a[n] : null), hasAttribute: (n) => n in a, removeAttribute: (n) => { delete a[n]; } };
}

test('on a finalized event the real Change password button stays enabled and clickable, even if a lock swept over it', () => {
  reset();
  const t = f('blankTournament')(); useState(app, t);
  t.finalized = { at: '2026-10-10T10:00:00.000Z' };
  assert.equal(f('isLocked')(t), true);
  const html = barHTML();
  const onclick = html.match(/<button onclick="([^"]*)">Change password<\/button>/)[1];
  assert.equal(onclick, 'openChangePassword()');
  const button = el('button', { onclick });
  f('applyFinalizedLock')({ querySelectorAll: () => [button] });
  assert.equal(button.disabled, false);
  assert.equal(button.getAttribute('onclick'), 'openChangePassword()');
  assert.ok(!button.classList.contains('fin-locked'));
  // the button still works: it opens the modal
  f('openChangePassword')();
  assert.equal(modals.length, 1);
  assert.equal(modals[0].title, 'Change password');
});

test('the account bar is outside the stage area, so a finalized event never locks it', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app.html'), 'utf8');
  const bar = src.indexOf('id="organizerBar"');
  const aside = src.indexOf('<aside class="sidebar">');
  const asideEnd = src.indexOf('</aside>');
  const stage = src.indexOf('id="stageArea"');
  assert.ok(aside < bar && bar < asideEnd, 'the bar is in the sidebar');
  assert.ok(bar < stage, 'and before the stage area');
  // every lock call is aimed at the stage area or a modal backdrop, never at the bar or the whole page
  const targets = [...src.matchAll(/applyFinalizedLock\(([^)]*)\)/g)].map((m) => m[1]).filter((x) => x && x !== 'area');
  assert.ok(targets.length > 0);
  for (const target of targets) assert.doesNotMatch(target, /organizerBar|document\.body|sidebar|documentElement/, target);
});

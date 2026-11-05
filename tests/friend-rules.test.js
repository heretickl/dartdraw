const { test } = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../friend-rules.js');

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const t0 = Date.parse('2026-01-01T00:00:00.000Z');
const at = (ms) => new Date(ms).toISOString();

test('cleanNickname cuts at 12', () => {
  assert.equal(rules.cleanNickname('  The Big Dartsman Bob '), 'The Big Dart');
  assert.equal(rules.cleanNickname('abcdefghijklmnop').length, 12);
  assert.equal(rules.cleanNickname('a\n\tb   c'), 'a b c');
  assert.equal(rules.cleanNickname(42), '');
  // an emoji counts as one character and is never cut in half
  assert.equal(Array.from(rules.cleanNickname('🎯'.repeat(15))).length, 12);
});

test('canResend false at 6 days 23 h, true at 7 days', () => {
  assert.equal(rules.canResend(at(t0), t0 + 6 * DAY + 23 * HOUR), false);
  assert.equal(rules.canResend(at(t0), t0 + 7 * DAY), true);
  assert.equal(rules.canResend(null, t0), true);   // never asked
  assert.equal(rules.nextResendAt(at(t0), t0 + DAY), at(t0 + 7 * DAY));
  assert.equal(rules.nextResendAt(at(t0), t0 + 7 * DAY), null);
});

test('heldExpired: 29 days no, 30 days yes', () => {
  assert.equal(rules.heldExpired(at(t0), t0 + 29 * DAY), false);
  assert.equal(rules.heldExpired(at(t0), t0 + 30 * DAY), true);
  assert.equal(rules.heldExpired(null, t0 + 365 * DAY), false);
});

test('badge: linked, waiting, and a waiting entry past 30 days reads as none', () => {
  assert.equal(rules.badge({ status: 'linked' }, t0), 'linked');
  assert.equal(rules.badge({ status: 'waiting', requested_at: at(t0) }, t0 + DAY), 'waiting');
  assert.equal(rules.badge({ status: 'waiting', requested_at: at(t0) }, t0 + 30 * DAY), 'none');
  assert.equal(rules.badge({ status: 'none' }, t0), 'none');
  assert.equal(rules.badge(null, t0), 'none');
});

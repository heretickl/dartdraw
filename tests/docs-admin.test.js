// The README documents the Admin tab and its rollout: the two SQL files, the settings defaults, the Reopen button
// (with the old SQL kept as a fallback) and how to hand over invite and reset links without an email domain.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');
const section = (readme.split(/^### Admin tab\s*$/m)[1] || '').split(/^#{1,3} /m)[0];

test('README has an Admin tab section', () => {
  assert.ok(section.length > 200, 'expected a "### Admin tab" section');
  for (const word of ['Organisers', 'Events', 'Settings', 'Pro']) assert.ok(section.includes(word), word);
});

test('README gives the rollout order with both SQL files that exist', () => {
  const a = section.indexOf('migrations/2026-10-14-admin.sql');
  const b = section.indexOf('viewer/sql/settings.sql');
  assert.ok(a >= 0 && b > a, 'migration first, then viewer SQL');
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'migrations', '2026-10-14-admin.sql')));
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'viewer', 'sql', 'settings.sql')));
  assert.match(section, /14 days/);
  assert.match(section, /48 hours/);
});

test('README explains Reopen, keeps the SQL fallback, and covers link hand-over', () => {
  assert.match(section, /Reopen/);
  assert.match(section, /UPDATE tournaments SET data = data - 'finalized'/);
  assert.match(section, /invite/i);
  assert.match(section, /reset link/i);
  assert.match(section, /7 days/);
  assert.ok(!/until the Admin panel exists/i.test(readme), 'stale "until the Admin panel exists" wording removed');
  assert.ok(!/Admin tab itself is a later project/i.test(readme), 'stale "later project" wording removed');
});

const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { createFakeDb } = require('./lib/fake-db');
const { createAdmin, parseArgs, main, PUBLIC_EMAIL } = require('../scripts/create-admin');

const PASSWORD = 'a long enough secret';
let HASH;
before(() => { HASH = bcrypt.hashSync(PASSWORD, 4); });

function seedDb(extra) {
  return createFakeDb(Object.assign({
    organizers: [
      { id: 'pub', email: PUBLIC_EMAIL, name: 'Public', password_hash: 'disabled' },
      { id: 'bob', email: 'bob@example.com', name: 'Bob', password_hash: 'x', tier: 'pro', email_verified_at: new Date('2026-01-01') },
    ],
    tournaments: [
      { id: 't1', created_by: 'pub', data: { name: 'One' } },
      { id: 't2', created_by: 'pub', data: { name: 'Two', finalized: true } },
      { id: 't3', created_by: 'bob', data: { name: 'Bobs' } },
    ],
  }, extra));
}

test('creates a new account as a verified admin on the pro tier', async () => {
  const db = seedDb();
  const r = await createAdmin({ sql: db.sql, email: ' Owner@Example.com ', name: 'The Owner', passwordHash: HASH });
  assert.equal(r.moved, 0);
  const row = db.tables.organizers.find((o) => o.id === r.adminId);
  assert.equal(row.email, 'owner@example.com');
  assert.equal(row.name, 'The Owner');
  assert.equal(row.role, 'admin');
  assert.equal(row.tier, 'pro');
  assert.equal(row.suspended, false);
  assert.ok(row.email_verified_at);
  assert.equal(row.password_hash, HASH);
  assert.ok(await bcrypt.compare(PASSWORD, row.password_hash));
  // Without --adopt-public nothing is moved.
  assert.deepEqual(db.tables.tournaments.map((t) => t.created_by), ['pub', 'pub', 'bob']);
});

test('promotes an existing account: admin, pro, verified, unsuspended, new password, sessions invalidated', async () => {
  const db = seedDb({
    organizers: [
      { id: 'pub', email: PUBLIC_EMAIL, name: 'Public', password_hash: 'disabled' },
      { id: 'al', email: 'al@example.com', name: 'Al', password_hash: 'old', tier: 'basic', suspended: true, email_verified_at: null, token_version: 3 },
    ],
  });
  const r = await createAdmin({ sql: db.sql, email: 'al@example.com', passwordHash: HASH });
  assert.equal(r.adminId, 'al');
  const row = db.tables.organizers.find((o) => o.id === 'al');
  assert.equal(row.role, 'admin');
  assert.equal(row.tier, 'pro');
  assert.equal(row.suspended, false);
  assert.ok(row.email_verified_at);
  assert.equal(row.password_hash, HASH);
  assert.equal(row.token_version, 4);
  assert.equal(row.name, 'Al'); // no --name given: the existing name is kept
  assert.equal(db.tables.organizers.length, 2);
});

test('an existing name is replaced only when --name is given; a verified date is kept', async () => {
  const when = new Date('2026-02-02T00:00:00Z');
  const db = seedDb({
    organizers: [{ id: 'al', email: 'al@example.com', name: 'Al', password_hash: 'old', email_verified_at: when }],
  });
  await createAdmin({ sql: db.sql, email: 'al@example.com', name: 'Alan', passwordHash: HASH });
  const row = db.tables.organizers[0];
  assert.equal(row.name, 'Alan');
  assert.equal(row.email_verified_at.getTime(), when.getTime());
});

test('--adopt-public moves exactly the Public tournaments (finalized included) and no one else\'s', async () => {
  const db = seedDb();
  const r = await createAdmin({ sql: db.sql, email: 'owner@example.com', name: 'Owner', passwordHash: HASH, adoptPublic: true });
  assert.equal(r.moved, 2);
  const owner = r.adminId;
  assert.equal(db.tables.tournaments.find((t) => t.id === 't1').created_by, owner);
  assert.equal(db.tables.tournaments.find((t) => t.id === 't2').created_by, owner);
  assert.equal(db.tables.tournaments.find((t) => t.id === 't3').created_by, 'bob');
  // The finalized marker and the data are untouched.
  assert.equal(db.tables.tournaments.find((t) => t.id === 't2').data.finalized, true);
});

test('second run moves nothing and creates no second account', async () => {
  const db = seedDb();
  const first = await createAdmin({ sql: db.sql, email: 'owner@example.com', name: 'Owner', passwordHash: HASH, adoptPublic: true });
  const second = await createAdmin({ sql: db.sql, email: 'owner@example.com', name: 'Owner', passwordHash: HASH, adoptPublic: true });
  assert.equal(first.moved, 2);
  assert.equal(second.moved, 0);
  assert.equal(second.adminId, first.adminId);
  assert.equal(db.tables.organizers.filter((o) => o.email === 'owner@example.com').length, 1);
  assert.equal(db.tables.tournaments.filter((t) => t.created_by === first.adminId).length, 2);
});

test('adopt-public with no Public organiser row moves 0 without error', async () => {
  const db = seedDb({ organizers: [], tournaments: [] });
  const r = await createAdmin({ sql: db.sql, email: 'owner@example.com', passwordHash: HASH, adoptPublic: true });
  assert.equal(r.moved, 0);
});

test('the Public organiser row is never modified', async () => {
  const db = seedDb();
  const before = JSON.stringify(db.tables.organizers.find((o) => o.id === 'pub'));
  await createAdmin({ sql: db.sql, email: 'owner@example.com', name: 'Owner', passwordHash: HASH, adoptPublic: true });
  assert.equal(JSON.stringify(db.tables.organizers.find((o) => o.id === 'pub')), before);
  assert.equal(db.tables.organizers.find((o) => o.id === 'pub').password_hash, 'disabled');
});

test('refuses to turn the Public account itself into an admin', async () => {
  const db = seedDb();
  await assert.rejects(() => createAdmin({ sql: db.sql, email: PUBLIC_EMAIL, passwordHash: HASH, adoptPublic: true }), /Public/i);
  assert.equal(db.calls.length, 0);
  assert.notEqual(db.tables.organizers.find((o) => o.id === 'pub').role, 'admin');
});

test('creating and moving is a single SQL statement, so it cannot half-apply', async () => {
  const db = seedDb();
  await createAdmin({ sql: db.sql, email: 'owner@example.com', name: 'Owner', passwordHash: HASH, adoptPublic: true });
  assert.equal(db.calls.length, 1);
  assert.match(db.calls[0].text, /UPDATE tournaments/);
  assert.match(db.calls[0].text, /INSERT INTO organizers/);
});

test('the plain password is never sent to the database; a non-bcrypt value is refused', async () => {
  const db = seedDb();
  await createAdmin({ sql: db.sql, email: 'owner@example.com', passwordHash: HASH });
  for (const c of db.calls) {
    assert.ok(!c.vals.includes(PASSWORD));
    assert.ok(!c.text.includes(PASSWORD));
  }
  const db2 = seedDb();
  await assert.rejects(() => createAdmin({ sql: db2.sql, email: 'owner@example.com', passwordHash: PASSWORD }), /hash/i);
  assert.equal(db2.calls.length, 0);
});

test('rejects a missing or malformed email', async () => {
  const db = seedDb();
  await assert.rejects(() => createAdmin({ sql: db.sql, email: '', passwordHash: HASH }), /email/i);
  await assert.rejects(() => createAdmin({ sql: db.sql, email: 'not-an-email', passwordHash: HASH }), /email/i);
  assert.equal(db.calls.length, 0);
});

test('parseArgs reads --email, --name and --adopt-public', () => {
  assert.deepEqual(parseArgs(['--email', 'a@b.co', '--name', 'A B', '--adopt-public']), { email: 'a@b.co', name: 'A B', adoptPublic: true });
  assert.deepEqual(parseArgs(['--email=a@b.co']), { email: 'a@b.co', name: '', adoptPublic: false });
  assert.throws(() => parseArgs(['--email']), /--email/);
  assert.throws(() => parseArgs(['--password', 'x']), /Unknown/);
});

function cli(over) {
  const out = [];
  const err = [];
  const db = seedDb();
  const opts = Object.assign({
    argv: ['--email', 'owner@example.com', '--name', 'Owner', '--adopt-public'],
    env: { DATABASE_URL: 'postgres://fake', ADMIN_PASSWORD: PASSWORD },
    sql: db.sql,
    readPassword: async () => { throw new Error('should not prompt'); },
    log: (m) => out.push(String(m)),
    error: (m) => err.push(String(m)),
    rounds: 4,
  }, over);
  return { db, out, err, run: () => main(opts) };
}

test('CLI: success prints the count, never the password or the hash', async () => {
  const c = cli();
  const code = await c.run();
  assert.equal(code, 0);
  const all = c.out.concat(c.err).join('\n');
  assert.match(all, /2 tournament/);
  assert.ok(!all.includes(PASSWORD));
  const stored = c.db.tables.organizers.find((o) => o.email === 'owner@example.com').password_hash;
  assert.ok(!all.includes(stored));
  assert.ok(await bcrypt.compare(PASSWORD, stored));
});

test('CLI: prompts when ADMIN_PASSWORD is unset', async () => {
  let prompted = 0;
  const c = cli({ env: { DATABASE_URL: 'postgres://fake' }, readPassword: async () => { prompted++; return PASSWORD; } });
  assert.equal(await c.run(), 0);
  assert.equal(prompted, 1);
});

test('CLI: a password shorter than 8 is refused before any database work', async () => {
  const c = cli({ env: { DATABASE_URL: 'postgres://fake', ADMIN_PASSWORD: 'short' } });
  assert.equal(await c.run(), 1);
  assert.equal(c.db.calls.length, 0);
  assert.match(c.err.join('\n'), /at least 8/);
  assert.ok(!c.err.concat(c.out).join('\n').includes('short'));
});

test('CLI: missing DATABASE_URL or --email is a clear error, no database work', async () => {
  const c1 = cli({ env: { ADMIN_PASSWORD: PASSWORD } });
  assert.equal(await c1.run(), 1);
  assert.match(c1.err.join('\n'), /DATABASE_URL/);
  const c2 = cli({ argv: [] });
  assert.equal(await c2.run(), 1);
  assert.match(c2.err.join('\n'), /--email/);
  assert.equal(c1.db.calls.length + c2.db.calls.length, 0);
});

test('CLI: a database error is reported without leaking the password', async () => {
  const c = cli({ sql: async () => { throw new Error('connection refused'); } });
  assert.equal(await c.run(), 1);
  const all = c.err.join('\n');
  assert.match(all, /connection refused/);
  assert.ok(!all.includes(PASSWORD));
});

// ---- password prompt on a piped stdin ----

const { PassThrough } = require('node:stream');
function fakeStdin(chunks) {
  const s = new PassThrough();   // isTTY is undefined, like a pipe
  (async () => { for (const c of chunks) { s.write(c); await new Promise((r) => setImmediate(r)); } s.end(); })();
  return s;
}
const sink = () => { const lines = []; return { lines, write: (t) => { lines.push(String(t)); return true; } }; };

test('CLI: piped stdin - two lines (password, repeat) in one chunk are both read', async () => {
  const stderr = sink();
  const c = cli({ env: { DATABASE_URL: 'postgres://fake' }, readPassword: undefined, stdin: fakeStdin([PASSWORD + '\n' + PASSWORD + '\n']), stderr });
  assert.equal(await c.run(), 0);
  const stored = c.db.tables.organizers.find((o) => o.email === 'owner@example.com').password_hash;
  assert.ok(await bcrypt.compare(PASSWORD, stored));
  const shown = stderr.lines.concat(c.out, c.err).join('\n');
  assert.ok(!shown.includes(PASSWORD), 'the password is never echoed or logged');
  assert.match(stderr.lines.join(''), /Password for owner@example\.com/);
  assert.match(stderr.lines.join(''), /Repeat password/);
});

test('CLI: piped stdin - lines arriving separately, with CRLF, work too', async () => {
  const c = cli({ env: { DATABASE_URL: 'postgres://fake' }, readPassword: undefined, stdin: fakeStdin([PASSWORD, '\r\n', PASSWORD + '\r\n']), stderr: sink() });
  assert.equal(await c.run(), 0);
  const stored = c.db.tables.organizers.find((o) => o.email === 'owner@example.com').password_hash;
  assert.ok(await bcrypt.compare(PASSWORD, stored));
});

test('CLI: piped stdin - mismatched lines, a missing second line, or empty input is refused without database work', async () => {
  const mismatch = cli({ env: { DATABASE_URL: 'postgres://fake' }, readPassword: undefined, stdin: fakeStdin([PASSWORD + '\nsomething else entirely\n']), stderr: sink() });
  assert.equal(await mismatch.run(), 1);
  assert.match(mismatch.err.join('\n'), /do not match/);
  assert.ok(!mismatch.err.join('\n').includes(PASSWORD));
  const one = cli({ env: { DATABASE_URL: 'postgres://fake' }, readPassword: undefined, stdin: fakeStdin([PASSWORD + '\n']), stderr: sink() });
  assert.equal(await one.run(), 1);
  const none = cli({ env: { DATABASE_URL: 'postgres://fake' }, readPassword: undefined, stdin: fakeStdin([]), stderr: sink() });
  assert.equal(await none.run(), 1);
  assert.equal(mismatch.db.calls.length + one.db.calls.length + none.db.calls.length, 0);
});

test('CLI: hashes with the same bcrypt cost as the rest of the app (10) unless a test overrides it', async () => {
  const { BCRYPT_COST } = require('../api/_lib/accounts');
  assert.equal(BCRYPT_COST, 10);
  const c = cli({ rounds: undefined });
  assert.equal(await c.run(), 0);
  const stored = c.db.tables.organizers.find((o) => o.email === 'owner@example.com').password_hash;
  assert.equal(bcrypt.getRounds(stored), BCRYPT_COST);
});

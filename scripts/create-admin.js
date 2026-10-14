// Create (or promote) the Admin account, and optionally move the tournaments of
// the old shared "Public" organiser to it. Run locally, straight against the
// database, so it works before any email service exists.
//
//   DATABASE_URL=postgresql://... node scripts/create-admin.js --email you@example.com [--name "Your Name"] [--adopt-public]
//
// The password is read from the ADMIN_PASSWORD environment variable or, when
// that is unset, typed at a prompt (not echoed). It is never accepted as a
// command-line argument and never printed. Safe to run again.
const bcrypt = require('bcryptjs');
const { normalizeEmail, BCRYPT_COST } = require('../api/_lib/accounts');

const PUBLIC_EMAIL = 'public@dartdraw.local';
const MIN_PASSWORD = 8;

// One SQL statement does everything, so it cannot half-apply: Postgres runs a
// single statement (including its data-modifying CTEs) as one atomic unit.
//   acct  - create the admin, or promote the existing row with that email
//           (role admin, tier pro, verified, unsuspended, new password, and
//           token_version + 1 so any old session stops working)
//   moved - re-point every tournament owned by the Public organiser to it
//           (only when adopting; the guard ${adoptPublic} makes it a no-op
//           otherwise). A second run finds nothing left to move. updated_at is
//           deliberately left alone so the public home page's "saved within 48
//           hours" Live rule is unaffected.
// The Public organiser row itself is only ever read.
async function createAdmin({ sql, email, name, passwordHash, adoptPublic }) {
  const addr = normalizeEmail(email);
  if (!/^[^\s@]+@[^\s@]+$/.test(addr)) throw new Error('A valid --email is required.');
  if (addr === PUBLIC_EMAIL) throw new Error('The shared Public account cannot be made an admin.');
  if (typeof passwordHash !== 'string' || !/^\$2[aby]\$\d\d\$/.test(passwordHash)) {
    throw new Error('passwordHash must be a bcrypt hash.');
  }
  const hasName = !!(name && String(name).trim());
  const displayName = hasName ? String(name).trim() : addr.split('@')[0];

  const rows = await sql`
    WITH acct AS (
      INSERT INTO organizers (email, password_hash, name, role, tier, email_verified_at)
      VALUES (${addr}, ${passwordHash}, ${displayName}, 'admin', 'pro', now())
      ON CONFLICT (email) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        name = CASE WHEN ${hasName}::boolean THEN EXCLUDED.name ELSE organizers.name END,
        role = 'admin',
        tier = 'pro',
        suspended = false,
        email_verified_at = COALESCE(organizers.email_verified_at, now()),
        token_version = organizers.token_version + 1
      RETURNING id
    ), moved AS (
      UPDATE tournaments SET created_by = (SELECT id FROM acct)
      WHERE ${!!adoptPublic}::boolean
        AND created_by = (SELECT id FROM organizers WHERE email = 'public@dartdraw.local')
      RETURNING id
    )
    SELECT (SELECT id FROM acct) AS admin_id, (SELECT count(*) FROM moved)::int AS moved
  `;
  return { adminId: rows[0].admin_id, moved: Number(rows[0].moved) };
}

function parseArgs(argv) {
  const out = { email: '', name: '', adoptPublic: false };
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    let inline;
    const eq = a.indexOf('=');
    if (a.startsWith('--') && eq > 0) { inline = a.slice(eq + 1); a = a.slice(0, eq); }
    const value = () => {
      if (inline !== undefined) return inline;
      if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) throw new Error(a + ' needs a value.');
      return argv[++i];
    };
    if (a === '--email') out.email = value();
    else if (a === '--name') out.name = value();
    else if (a === '--adopt-public') out.adoptPublic = true;
    else throw new Error('Unknown option: ' + a);
  }
  return out;
}

// One buffered line reader per piped stdin, so that reading the password and
// then the confirmation from the same pipe (two lines, possibly arriving in a
// single chunk) does not lose the second line.
const pipedReaders = new WeakMap();
function pipedReader(stdin) {
  let reader = pipedReaders.get(stdin);
  if (reader) return reader;
  let buf = '';
  let ended = false;
  const waiting = [];
  const settle = () => {
    while (waiting.length) {
      const nl = buf.indexOf('\n');
      if (nl >= 0) {
        const line = buf.slice(0, nl).replace(/\r$/, '');
        buf = buf.slice(nl + 1);
        waiting.shift().resolve(line);
      } else if (ended) {
        if (!buf) {
          waiting.shift().reject(new Error('No password was supplied on stdin.'));
        } else {
          const line = buf.replace(/\r$/, '');
          buf = '';
          waiting.shift().resolve(line);
        }
      } else {
        break;
      }
    }
  };
  stdin.setEncoding('utf8');
  stdin.on('data', (d) => { buf += d; settle(); });
  stdin.on('end', () => { ended = true; settle(); });
  reader = { next: () => new Promise((resolve, reject) => { waiting.push({ resolve, reject }); settle(); }) };
  pipedReaders.set(stdin, reader);
  return reader;
}

// Read a line from the terminal without echoing it. When stdin is not a
// terminal (a pipe), read the next line from it instead. The password is never
// written anywhere: only the question goes to stderr.
function readSecret(question, io) {
  const stdin = (io && io.stdin) || process.stdin;
  const stderr = (io && io.stderr) || process.stderr;
  return new Promise((resolve, reject) => {
    stderr.write(question);
    if (!stdin.isTTY) {
      pipedReader(stdin).next().then((line) => { stderr.write('\n'); resolve(line); }, reject);
      return;
    }
    let value = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n' || ch === '\u0004') {
          stdin.setRawMode(false); stdin.pause(); stdin.removeListener('data', onData);
          stderr.write('\n');
          return resolve(value);
        }
        if (ch === '\u0003') {
          stdin.setRawMode(false); stdin.pause(); stdin.removeListener('data', onData);
          stderr.write('\n');
          return reject(new Error('Cancelled.'));
        }
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on('data', onData);
  });
}

// Everything the CLI does, with its inputs injectable for tests. Returns the exit code.
async function main(opts) {
  const argv = opts.argv;
  const env = opts.env;
  const log = opts.log || console.log;
  const error = opts.error || console.error;
  try {
    const args = parseArgs(argv);
    if (!args.email) throw new Error('Usage: node scripts/create-admin.js --email you@example.com [--name "Your Name"] [--adopt-public]\n--email is required.');
    if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set.');

    let password = env.ADMIN_PASSWORD;
    if (!password) {
      const read = opts.readPassword || ((question) => readSecret(question, { stdin: opts.stdin, stderr: opts.stderr }));
      password = await read('Password for ' + normalizeEmail(args.email) + ': ');
      if (!opts.readPassword) {
        const again = await read('Repeat password: ');
        if (again !== password) throw new Error('The two passwords do not match.');
      }
    }
    if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
      throw new Error('The password must be at least ' + MIN_PASSWORD + ' characters.');
    }
    const passwordHash = await bcrypt.hash(password, opts.rounds || BCRYPT_COST);

    const sql = opts.sql || require('@neondatabase/serverless').neon(env.DATABASE_URL);
    const r = await createAdmin({ sql, email: args.email, name: args.name, passwordHash, adoptPublic: args.adoptPublic });
    log('Admin account ready: ' + normalizeEmail(args.email) + ' (role admin, tier pro, verified).');
    if (args.adoptPublic) log('Moved ' + r.moved + ' tournament' + (r.moved === 1 ? '' : 's') + ' from the Public account.');
    return 0;
  } catch (e) {
    error('create-admin: ' + (e && e.message ? e.message : e));
    return 1;
  }
}

module.exports = { createAdmin, parseArgs, main, readSecret, PUBLIC_EMAIL };

if (require.main === module) {
  main({ argv: process.argv.slice(2), env: process.env }).then((code) => { process.exit(code); });
}

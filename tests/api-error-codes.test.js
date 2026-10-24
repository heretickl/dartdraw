const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// i18n step 5: every error answer from api/** carries a stable `code` next to the English `error` (unchanged), and the
// pages translate the code (i18n/errors.en.js lists every code, i18n/errors.ms.js has BM for every code that organisers
// and people signing in can see; Admin-only codes stay English). A static scan of the source, so a new error answer
// without a code fails here.
const root = path.join(__dirname, '..');
const API = path.join(root, 'api');
const { DD_ERR_EN, DD_ERR_ADMIN_ONLY } = require('../i18n/errors.en.js');
const { DD_ERR_MS } = require('../i18n/errors.ms.js');

function files(dir) {
  let out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out = out.concat(files(p)); else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}
// The code without comments: line comments first (only where they start a line or follow whitespace, so "https://"
// survives, and a "/*" inside a line comment such as "organizers/*" cannot open a block), then block comments.
const strip = (s) => s.replace(/(^|\s)\/\/.*$/gm, '$1').replace(/\/\*[\s\S]*?\*\//g, '');
const SRC = files(API).map((f) => ({ file: path.relative(root, f).split(path.sep).join('/'), code: strip(fs.readFileSync(f, 'utf8')) }));

// The object literal around position i: from the nearest unmatched "{" before it to its matching "}".
function enclosingObject(s, i) {
  let depth = 0, start = -1;
  for (let k = i; k >= 0; k--) {
    if (s[k] === '}') depth++;
    else if (s[k] === '{') { if (depth === 0) { start = k; break; } depth--; }
  }
  if (start < 0) return null;
  depth = 0;
  for (let k = start; k < s.length; k++) {
    if (s[k] === '{') depth++;
    else if (s[k] === '}') { depth--; if (depth === 0) return s.slice(start, k + 1); }
  }
  return null;
}
// Top-level keys of an object literal's text (nested objects skipped).
function topKeys(obj) {
  const keys = [];
  let depth = 0, quote = null;
  for (let i = 0; i < obj.length; i++) {
    const ch = obj[i];
    if (quote) { if (ch === '\\') i++; else if (ch === quote) quote = null; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '{' || ch === '[' || ch === '(') { depth++; } else if (ch === '}' || ch === ']' || ch === ')') { depth--; }
    if (depth === 1 && (ch === '{' || ch === ',')) {
      const m = /^\s*([A-Za-z_$][\w$]*)\s*:/.exec(obj.slice(i + 1));
      if (m) keys.push(m[1]);
    }
  }
  return keys;
}

// Every { ..., error: ... } object in api/** (each error answer, and the validators' { ok: false, error } results).
const ERROR_OBJECTS = [];
SRC.forEach(({ file, code }) => {
  const re = /\berror\s*:/g;
  let m;
  while ((m = re.exec(code))) {
    const obj = enclosingObject(code, m.index);
    if (obj && topKeys(obj).includes('error')) ERROR_OBJECTS.push({ file, obj });
  }
});
const codeOf = (obj) => { const m = obj.match(/\bcode:\s*'([a-z_]+)'/); return m ? m[1] : null; };

test('the scan sees the error answers (sanity: dozens of them, in auth, tournaments and admin)', () => {
  assert.ok(ERROR_OBJECTS.length >= 60, 'found ' + ERROR_OBJECTS.length);
  ['api/_routes/auth/login.js', 'api/tournaments/[id].js', 'api/_routes/admin/organizers/[id].js', 'api/_lib/auth.js'].forEach((f) => {
    assert.ok(ERROR_OBJECTS.some((o) => o.file === f), f);
  });
});

test('every error object in api/** has a code next to its error', () => {
  const missing = ERROR_OBJECTS.filter((o) => !topKeys(o.obj).includes('code'));
  assert.deepEqual(missing.map((o) => o.file + ': ' + o.obj.replace(/\s+/g, ' ').slice(0, 120)), []);
});

test('every res.status(4xx/5xx).json(...) answer is an object with a code, or a named one that has a code', () => {
  const problems = [];
  SRC.forEach(({ file, code }) => {
    const re = /\.status\(\s*(\d{3}|status)\s*\)\.json\(\s*([^)]*?)\s*\)\s*;/g;
    let m;
    while ((m = re.exec(code))) {
      const status = m[1], arg = m[2];
      if (status !== 'status' && Number(status) < 400) continue;
      if (arg.startsWith('{')) {
        const obj = enclosingObject(code, code.indexOf(arg, m.index) + 1);
        if (!obj || !topKeys(obj).includes('code')) problems.push(file + ': ' + arg.slice(0, 80));
        continue;
      }
      if (status === 'status' && arg === 'result') {
        // register / forgot / resend: result is the generic { ok: true, message } or an error object (checked above)
        assert.match(code, /let result = \{ ok: true, message: [A-Z_]+ \};/, file);
        continue;
      }
      // a named constant defined in the same file
      const def = new RegExp('const ' + arg.replace(/[$]/g, '\\$') + '\\s*=\\s*\\{[^;]*\\}').exec(code);
      if (!def || !/\bcode:\s*'/.test(def[0])) problems.push(file + ': ' + arg);
    }
  });
  assert.deepEqual(problems, []);
});

test('the error text stays as it was: every code the server sends is in errors.en.js with the same English', () => {
  const used = new Map();
  ERROR_OBJECTS.forEach(({ file, obj }) => {
    const c = codeOf(obj);
    if (!c) return;
    const lit = obj.match(/\berror:\s*'((?:[^'\\]|\\.)*)'\s*[,}]/);
    if (!used.has(c)) used.set(c, []);
    used.get(c).push({ file, text: lit ? lit[1] : null });
  });
  // codes with a computed text: the checked dynamic messages
  used.set('checked', []);
  const missing = [...used.keys()].filter((c) => c !== 'checked' && !Object.prototype.hasOwnProperty.call(DD_ERR_EN, 'err.' + c));
  assert.deepEqual(missing, [], 'codes sent by the server but missing from i18n/errors.en.js');
  // where the server's text is a plain literal, the table has the same words (one code may have two wordings:
  // invalid_email is "Please enter a valid email address." on the sign-up pages and "Enter a valid email address." in Admin)
  const SECOND_WORDING = { invalid_email: ['Enter a valid email address.'] };
  for (const [c, sites] of used) {
    sites.forEach(({ file, text }) => {
      if (text == null) return;
      const ok = DD_ERR_EN['err.' + c] === text || (SECOND_WORDING[c] || []).includes(text);
      assert.ok(ok, file + ': ' + c + ' says "' + text + '" but errors.en.js says "' + DD_ERR_EN['err.' + c] + '"');
    });
  }
  // and every code in the table is still sent by someone (no stale codes)
  const all = SRC.map((s) => s.code).join('\n');
  Object.keys(DD_ERR_EN).forEach((k) => {
    const c = k.slice(4);
    assert.ok(all.includes("code: '" + c + "'") || (c === 'unverified' || c === 'suspended' || c === 'entry_limit') && all.includes("'" + c + "'"), 'stale code ' + c);
  });
});

test('the texts with numbers match the server constants (8, 200 and the contact line limit)', () => {
  const flow = require('../api/_lib/authflow');
  assert.equal(flow.MIN_PASSWORD, 8);
  assert.ok(DD_ERR_EN['err.password_too_short'].includes(' ' + flow.MIN_PASSWORD + ' '));
  assert.ok(DD_ERR_MS['err.password_too_short'].includes(' ' + flow.MIN_PASSWORD + ' '));
  assert.ok(DD_ERR_MS['err.new_password_too_short'].includes(' ' + flow.MIN_PASSWORD + ' '));
  assert.match(fs.readFileSync(path.join(API, '_routes/auth/change-password.js'), 'utf8'), /MAX_NEW_PASSWORD = 200;/);
  assert.ok(DD_ERR_MS['err.new_password_too_long'].includes('200'));
  assert.match(fs.readFileSync(path.join(API, '_routes/auth/register.js'), 'utf8'), /name\.length > 80/);
  assert.ok(DD_ERR_MS['err.name_too_long'].includes('80'));
  assert.match(fs.readFileSync(path.join(API, '_lib/settings.js'), 'utf8'), /CONTACT_MAX_LENGTH = 200/);
});

test('BM covers every code people can see; the Admin-only codes stay English (and are only sent by Admin endpoints)', () => {
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const admin = new Set(DD_ERR_ADMIN_ONLY);
  DD_ERR_ADMIN_ONLY.forEach((c) => assert.ok(has(DD_ERR_EN, 'err.' + c), 'admin code not in the English table: ' + c));
  Object.keys(DD_ERR_EN).forEach((k) => {
    const c = k.slice(4);
    if (admin.has(c)) assert.ok(!has(DD_ERR_MS, k), 'Admin-only code translated: ' + c);
    else assert.ok(has(DD_ERR_MS, k) && DD_ERR_MS[k].trim(), 'no BM for ' + c);
  });
  Object.keys(DD_ERR_MS).forEach((k) => assert.ok(has(DD_ERR_EN, k), 'BM key without English: ' + k));
  // the same {placeholders}
  const ph = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join(',');
  Object.keys(DD_ERR_MS).forEach((k) => assert.equal(ph(DD_ERR_MS[k]), ph(DD_ERR_EN[k]), k));
  // Admin-only codes appear only in the Admin endpoints and their helpers
  const ADMIN_FILES = /^api\/(_routes\/admin\/|_routes\/adminRouter\.js|_lib\/(adminOrganizers|adminEvents|settings)\.js)/;
  SRC.forEach(({ file, code }) => {
    DD_ERR_ADMIN_ONLY.forEach((c) => {
      if (code.includes("code: '" + c + "'")) assert.match(file, ADMIN_FILES, c + ' is sent by ' + file);
    });
  });
});

test('the answers really carry the code at run time (sign-in router 404, a 405, the finalized lock body)', async () => {
  const { callHandler } = require('./lib/call-handler');
  const router = require('../api/auth/[action]');
  const r = await callHandler(router, { method: 'POST', url: '/api/auth/nope' });
  assert.deepEqual(r.body, { code: 'not_found', error: 'Not found.' });
  const login = require('../api/_routes/auth/login');
  const g = await callHandler(login, { method: 'GET' });
  assert.deepEqual(g.body, { code: 'method_not_allowed', error: 'Method not allowed' });
  const t = fs.readFileSync(path.join(API, 'tournaments/[id].js'), 'utf8');
  assert.match(t, /const FINALIZED_BODY = \{ code: 'finalized', error: 'This event is finalized\. Only an Admin can change it\.', finalized: true \};/);
});

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const { createFakeDb } = require('./lib/fake-db');
const { callHandler } = require('./lib/call-handler');

// i18n step 5: the account e-mails are bilingual, English first and then Bahasa Malaysia, in one message with a text
// and an HTML part (api/_lib/emails.js). No language is stored on the account. Checked here: both languages, the link
// intact in both, the expiry wording, text/HTML parity, escaping, subject length, and that nothing new is logged.
const dbPath = require.resolve('../api/_lib/db');
let db;
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { sql: (...args) => db.sql(...args) } };

const emails = require('../api/_lib/emails');
const mail = require('../api/_lib/mail');
const registerHandler = require('../api/_routes/auth/register');
const forgotHandler = require('../api/_routes/auth/forgot');
const resendHandler = require('../api/_routes/auth/resend-verification');

const ENV_KEYS = ['SESSION_SECRET', 'REQUIRE_LOGIN', 'SIGNUP_OPEN', 'MAIL_PROVIDER', 'RESEND_API_KEY', 'MAIL_FROM', 'APP_URL', 'AUTH_MIN_RESPONSE_MS'];
let savedEnv;
const LINK = 'https://app.example.test/verify.html?token=' + 'a'.repeat(64);

// The HTML part as text: tags out, entities decoded, one paragraph per block.
function htmlParagraphs(html) {
  const body = html.replace(/^[\s\S]*<body[^>]*>/, '').replace(/<\/body>[\s\S]*$/, '');
  return body.split(/<\/p>|<hr[^>]*>/).map((p) => p.replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').trim()).filter(Boolean);
}
const textParagraphs = (text) => text.split(/\n\n|\n/).map((s) => s.trim()).filter((s) => s && s !== emails.DIVIDER);

beforeEach(() => {
  savedEnv = {}; ENV_KEYS.forEach((k) => { savedEnv[k] = process.env[k]; delete process.env[k]; });
  process.env.SESSION_SECRET = 'test-secret-for-emails';
  process.env.MAIL_PROVIDER = 'console';
  process.env.SIGNUP_OPEN = 'true';
  process.env.APP_URL = 'https://app.example.test';
  process.env.AUTH_MIN_RESPONSE_MS = '0';
  db = createFakeDb({ organizers: [{ id: 'org1', email: 'a@example.com', name: 'Alice', password_hash: bcrypt.hashSync('longenough', 4),
    role: 'organizer', tier: 'basic', suspended: false, email_verified_at: null, token_version: 0 }] });
  mail.sendMail.outbox.length = 0;
  console._log = console._log || console.log;
  console.log = () => {};
});
afterEach(() => {
  console.log = console._log;
  ENV_KEYS.forEach((k) => { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; });
});

test('every template: English first, then Bahasa Malaysia, the link in both, and a subject "English / BM" of at most 78 characters', () => {
  Object.keys(emails.TEMPLATES).forEach((kind) => {
    const m = emails.buildEmail(kind, { link: LINK, name: 'Aminah' });
    const tpl = emails.TEMPLATES[kind];
    assert.equal(m.subject, tpl.subject[0] + ' / ' + tpl.subject[1], kind);
    assert.ok(m.subject.length <= 78, kind + ' subject is ' + m.subject.length + ' characters');
    const en = m.text.indexOf(tpl.en.intro), div = m.text.indexOf(emails.DIVIDER), ms = m.text.indexOf(tpl.ms.intro);
    assert.ok(en >= 0 && div > en && ms > div, kind + ': English, divider, BM in that order');
    assert.equal(m.text.split(LINK).length - 1, 2, kind + ': the link once in each language');
    assert.ok(m.text.includes('\n' + LINK + '\n'), kind + ': the link on a line of its own');
    if (tpl.en.outro) { assert.ok(m.text.includes(tpl.en.outro)); assert.ok(m.text.includes(tpl.ms.outro)); }
  });
});

test('the expiry wording is in both languages: 24 hours, 1 hour, 7 days', () => {
  const t = (k) => emails.buildEmail(k, { link: LINK }).text;
  assert.match(t('verify'), /24 hours/); assert.match(t('verify'), /24 jam/);
  assert.match(t('reset'), /1 hour\b/); assert.match(t('reset'), /1 jam/);
  assert.match(t('adminReset'), /1 hour\b/); assert.match(t('adminReset'), /1 jam/);
  assert.match(t('invite'), /7 days/); assert.match(t('invite'), /7 hari/);
});

test('text and HTML say the same thing, paragraph by paragraph, and the HTML marks each language', () => {
  Object.keys(emails.TEMPLATES).forEach((kind) => {
    const m = emails.buildEmail(kind, { link: LINK, name: 'Aminah' });
    const fromText = textParagraphs(m.text);
    assert.deepEqual(htmlParagraphs(m.html), fromText, kind);
    assert.match(m.html, /<div lang="en">[\s\S]*<\/div>[\s\S]*<div lang="ms">/, kind);
    assert.ok(m.html.includes('<a href="' + LINK + '">' + LINK + '</a>'), kind + ': the link is a real link');
  });
});

test('escaping: the name (invite only) and the link can never become markup; the name is one clean line', () => {
  const evil = '<script>alert(1)</script> & "Bob" \'x\'';
  const m = emails.buildEmail('invite', { link: 'https://x.test/reset.html?token=abc&x="><img src=x onerror=alert(2)>', name: evil });
  assert.doesNotMatch(m.html, /<script|<img/i);
  assert.ok(m.html.includes('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;Bob&quot; &#39;x&#39;'));
  assert.ok(m.html.includes('href="https://x.test/reset.html?token=abc&amp;x=&quot;&gt;&lt;img'));
  assert.ok(m.text.includes('Hello ' + evil + ','), 'plain text keeps the name as typed');
  assert.ok(m.text.includes('Salam sejahtera ' + evil + ','));
  const injected = emails.buildEmail('invite', { link: LINK, name: 'Pat\r\nBcc: x@evil.test\u0007' });
  assert.ok(injected.text.includes('Hello Pat Bcc: x@evil.test,'), 'control characters and line breaks become spaces');
  assert.equal(emails.buildEmail('invite', { link: LINK, name: 'x'.repeat(200) }).text.split('\n')[0], 'Hello ' + 'x'.repeat(80) + ',');
  assert.ok(!emails.buildEmail('invite', { link: LINK }).text.includes('Hello'), 'no name, no greeting');
  // replacement patterns in a name are inserted literally, never expanded ("$&" = the match, "$'" = the rest, "$`", "$$")
  const dollar = "Ali $' $& $` $$ $1 <b>";
  const dm = emails.buildEmail('invite', { link: LINK, name: dollar });
  assert.equal(dm.text.split('\n')[0], 'Hello ' + dollar + ',');
  assert.ok(dm.text.includes('Salam sejahtera ' + dollar + ','));
  assert.ok(dm.html.includes('Ali $&#39; $&amp; $` $$ $1 &lt;b&gt;'), 'escaped once, nothing expanded');
  assert.ok(!dm.text.includes('{name}'));
  // the self-service mails never carry a name (the sign-up form's name is typed by whoever registers)
  ['verify', 'reset', 'alreadyRegistered'].forEach((k) => assert.ok(!emails.TEMPLATES[k].en.greeting, k));
});

test('sign-up mails a bilingual verify message through the fake mailer, with the link intact in text and HTML', async () => {
  const r = await callHandler(registerHandler, { method: 'POST', body: { name: '<b>Bob</b>', email: 'bob@example.com', password: 'longenough' } });
  assert.equal(r.statusCode, 200);
  const msg = mail.sendMail.outbox[0];
  assert.equal(msg.subject, 'Verify your DartDraw email / Sahkan e-mel DartDraw anda');
  const links = msg.text.match(/https:\/\/\S+/g);
  assert.equal(links.length, 2);
  assert.equal(links[0], links[1]);
  assert.match(links[0], /^https:\/\/app\.example\.test\/verify\.html\?token=[0-9a-f]{64}$/);
  assert.ok(msg.html.includes('href="' + links[0] + '"'));
  assert.ok(msg.text.includes('Welcome to DartDraw.') && msg.text.includes('Selamat datang ke DartDraw.'));
  assert.ok(!msg.text.includes('Bob') && !msg.html.includes('Bob'), 'the typed name is not put in the e-mail');
});

test('forgot and resend send the bilingual reset and verify messages', async () => {
  db.tables.organizers[0].email_verified_at = null;
  await callHandler(resendHandler, { method: 'POST', body: { email: 'a@example.com' } });
  db.tables.organizers[0].email_verified_at = new Date();
  await callHandler(forgotHandler, { method: 'POST', body: { email: 'a@example.com' } });
  const [verify, reset] = mail.sendMail.outbox;
  assert.match(verify.subject, /^Verify your DartDraw email \/ Sahkan e-mel DartDraw anda$/);
  assert.match(reset.subject, /^Reset your DartDraw password \/ Tetapkan semula kata laluan DartDraw anda$/);
  assert.match(reset.text, /reset\.html\?token=[0-9a-f]{64}\n[\s\S]*Bahasa Malaysia[\s\S]*reset\.html\?token=[0-9a-f]{64}\n/);
  assert.ok(reset.html.includes('<div lang="ms">'));
});

test('mail: html goes to the provider when given and is left out otherwise; the console provider still logs only the text', async () => {
  const logged = [];
  console.log = (s) => logged.push(String(s));
  await mail.sendMail({ to: 'x@example.com', subject: 'S', text: 'T', html: '<p>H</p>' });
  assert.deepEqual(mail.sendMail.outbox[0], { to: 'x@example.com', subject: 'S', text: 'T', html: '<p>H</p>' });
  assert.ok(!logged.join('\n').includes('<p>H</p>'), 'the HTML part is not logged');
  process.env.MAIL_PROVIDER = 'resend'; process.env.RESEND_API_KEY = 'k'; process.env.MAIL_FROM = 'f@x.test';
  const sent = [];
  const realFetch = global.fetch;
  global.fetch = async (url, opts) => { sent.push(JSON.parse(opts.body)); return { ok: true }; };
  try {
    await mail.sendMail({ to: 'x@example.com', subject: 'S', text: 'T', html: '<p>H</p>' });
    await mail.sendMail({ to: 'x@example.com', subject: 'S', text: 'T' });
  } finally { global.fetch = realFetch; }
  assert.equal(sent[0].html, '<p>H</p>');
  assert.ok(!('html' in sent[1]));
});

test('no secrets in logs: the e-mail builder logs nothing, and BM words follow the glossary', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'api', '_lib', 'emails.js'), 'utf8');
  assert.doesNotMatch(src, /console\./);
  const ms = Object.values(emails.TEMPLATES).map((t) => Object.values(t.ms).join(' ') + ' ' + t.subject[1]).join(' ');
  assert.match(ms, /e-mel/); assert.match(ms, /kata laluan/);
  assert.doesNotMatch(ms, /\b(email|password|surel|kata sandi|unduh)\b/i);
});

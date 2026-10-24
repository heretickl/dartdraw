// Shared pieces of the sign-up / verify / resend / forgot / reset endpoints.
const { clientIp, hit } = require('./throttle');
const { sendMail, appUrl } = require('./mail');
const { issueToken } = require('./tokens');
const { buildEmail } = require('./emails');

const WINDOW_MS = 60 * 60 * 1000; // register, resend and forgot: 5 per hour
const LIMIT = 5;
const VERIFY_WINDOW_MS = 15 * 60 * 1000; // verify attempts: 10 per 15 minutes per address
const VERIFY_LIMIT = 10;

// The generic answer each endpoint gives for every well-formed request,
// whether or not the email has an account.
const REGISTER_MESSAGE = 'If that email can be registered, we have sent a link to verify it.';
const FORGOT_MESSAGE = 'If an account exists for that email, we have sent a link to reset your password.';
const RESEND_MESSAGE = 'If that account can be verified, we have sent a new verification link.';
const INVALID_LINK = 'This link is invalid or has expired.';
const VERIFY_FAILED = 'This link is invalid, has expired, or the password is incorrect.';
const TOO_MANY = 'Too many attempts. Try again later.';
const MIN_PASSWORD = 8;

function isValidEmail(email) {
  return typeof email === 'string' && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// True when the request must be refused (429). Each request is counted
// atomically against both the client address and the email (keys such as
// "forgot:ip:1.2.3.4" and "forgot:email:a@b.com") and refused once either
// counter is past the limit. Both are always counted, so the answer does not
// depend on which one tripped.
async function throttled(scope, req, email) {
  const ipOver = await hit(scope + ':ip:' + clientIp(req), LIMIT, WINDOW_MS);
  const emailOver = await hit(scope + ':email:' + email, LIMIT, WINDOW_MS);
  return ipOver || emailOver;
}

// verify: 10 attempts per 15 minutes per client address.
async function verifyThrottled(req) {
  return hit('verify:ip:' + clientIp(req), VERIFY_LIMIT, VERIFY_WINDOW_MS);
}

// Handlers whose answer could reveal whether an account exists (register,
// forgot, resend) wait until at least this long has passed since they started,
// on every path, so the response time says nothing either. AUTH_MIN_RESPONSE_MS
// overrides it (tests use 0 or a small number).
const DEFAULT_MIN_RESPONSE_MS = 1500;
function minResponseMs() {
  const raw = process.env.AUTH_MIN_RESPONSE_MS;
  if (raw === undefined || raw === '') return DEFAULT_MIN_RESPONSE_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_MIN_RESPONSE_MS;
}

// Resolves once `minMs` has passed since `startMs` (immediately if it already has).
async function padTo(startMs, minMs) {
  let wait = startMs + minMs - Date.now();
  while (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
    wait = startMs + minMs - Date.now(); // timers can fire a millisecond early
  }
}

// Accounts that must never receive account mail: the shared Public row
// (password_hash 'disabled') and suspended accounts.
function canMail(row) {
  return !!row && row.password_hash !== 'disabled' && !row.suspended;
}

// The three account e-mails are bilingual (English, then Bahasa Malaysia) with a text and an HTML part: api/_lib/emails.js.
// None of them carries a name: the sign-up form's name is typed by whoever registers, who may not own the address.
async function sendVerifyEmail(req, organizerId, to) {
  const raw = await issueToken(organizerId, 'verify');
  await sendMail(Object.assign({ to }, buildEmail('verify', { link: appUrl(req) + '/verify.html?token=' + raw })));
}

async function sendResetEmail(req, organizerId, to) {
  const raw = await issueToken(organizerId, 'reset');
  await sendMail(Object.assign({ to }, buildEmail('reset', { link: appUrl(req) + '/reset.html?token=' + raw })));
}

async function sendAlreadyRegisteredEmail(req, to) {
  await sendMail(Object.assign({ to }, buildEmail('alreadyRegistered', { link: appUrl(req) + '/forgot.html' })));
}

module.exports = {
  REGISTER_MESSAGE, FORGOT_MESSAGE, RESEND_MESSAGE, INVALID_LINK, VERIFY_FAILED, TOO_MANY, MIN_PASSWORD,
  isValidEmail, throttled, verifyThrottled, minResponseMs, padTo, canMail,
  sendVerifyEmail, sendResetEmail, sendAlreadyRegisteredEmail
};

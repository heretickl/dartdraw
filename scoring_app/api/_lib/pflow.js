// Shared pieces of the player sign-up / confirm / resend / forgot / reset endpoints. A copy of the organiser app's
// api/_lib/authflow.js patterns (generic answers, throttling, a minimum response time), with every rate-limit key
// prefixed "p:" so player and organiser counters in the shared auth_throttle table never mix.
const { clientIp, hit } = require('./throttle');
const { sendMail, appUrl } = require('./mail');
const { issueToken } = require('./ptokens');
const { buildPlayerEmail } = require('./pmail');

const WINDOW_MS = 60 * 60 * 1000; // register, resend and forgot: 5 per hour
const LIMIT = 5;
const VERIFY_WINDOW_MS = 15 * 60 * 1000; // confirm attempts: 10 per 15 minutes per address
const VERIFY_LIMIT = 10;

// The generic answer each endpoint gives for every well-formed request, whether or not the email has an account.
const REGISTER_MESSAGE = 'If that email can be registered, we have sent a link to confirm it.';
const FORGOT_MESSAGE = 'If an account exists for that email, we have sent a link to reset your password.';
const RESEND_MESSAGE = 'If that account still needs confirming, we have sent a new link.';
const INVALID_LINK = 'This link is invalid or has expired.';
const VERIFY_FAILED = 'This link is invalid, has expired, or the password is incorrect.';
const TOO_MANY = 'Too many attempts. Try again later.';
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 200;   // bcrypt-safe upper bound for what we accept as a new password
const MAX_NAME = 40;

function isValidEmail(email) {
  return typeof email === 'string' && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function pickLang(v) {
  return v === 'ms' ? 'ms' : 'en';
}

// One line, no control characters, single spaces.
function cleanNamePart(v) {
  if (typeof v !== 'string') return '';
  return v.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// { firstName, lastName } or { status, code, error } for the 400 answer. Names are 1-40 characters after trimming.
function checkNames(body) {
  const firstName = cleanNamePart(body && body.firstName);
  const lastName = cleanNamePart(body && body.lastName);
  if (!firstName) return { status: 400, code: 'first_name_required', error: 'Please enter your first name.' };
  if (!lastName) return { status: 400, code: 'last_name_required', error: 'Please enter your last name.' };
  if (firstName.length > MAX_NAME || lastName.length > MAX_NAME) {
    return { status: 400, code: 'name_too_long', error: 'Names must be ' + MAX_NAME + ' characters or fewer.' };
  }
  return { firstName, lastName };
}

// Null when the new password is acceptable, else { code, error } for a 400.
function checkNewPassword(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
    return { code: 'password_too_short', error: 'Password must be at least ' + MIN_PASSWORD + ' characters.' };
  }
  if (password.length > MAX_PASSWORD) {
    return { code: 'password_too_long', error: 'Password must be at most ' + MAX_PASSWORD + ' characters.' };
  }
  return null;
}

// True when the request must be refused (429). Each request is counted atomically against both the client address and
// the email (keys such as "p:forgot:ip:1.2.3.4" and "p:forgot:email:a@b.com"). Both are always counted, so the answer
// does not depend on which one tripped.
async function throttled(scope, req, email) {
  const ipOver = await hit('p:' + scope + ':ip:' + clientIp(req), LIMIT, WINDOW_MS);
  const emailOver = await hit('p:' + scope + ':email:' + email, LIMIT, WINDOW_MS);
  return ipOver || emailOver;
}

// confirm: 10 attempts per 15 minutes per client address.
async function verifyThrottled(req) {
  return hit('p:verify:ip:' + clientIp(req), VERIFY_LIMIT, VERIFY_WINDOW_MS);
}

// Handlers whose answer could reveal whether an account exists (register, forgot, resend) wait until at least this
// long has passed since they started, on every path. AUTH_MIN_RESPONSE_MS overrides it (tests use 0).
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

// The confirm mail carries no name: the sign-up form's name is typed by whoever registers, who may not own the address.
async function sendVerifyEmail(req, playerId, to, lang) {
  const raw = await issueToken(playerId, 'verify');
  await sendMail(Object.assign({ to }, buildPlayerEmail('verify', pickLang(lang), { link: appUrl(req) + '/#verify=' + raw })));
}

// firstName only for a confirmed account (see pmail.js).
async function sendResetEmail(req, playerId, to, lang, firstName) {
  const raw = await issueToken(playerId, 'reset');
  await sendMail(Object.assign({ to }, buildPlayerEmail('reset', pickLang(lang), { link: appUrl(req) + '/#reset=' + raw, firstName })));
}

module.exports = {
  REGISTER_MESSAGE, FORGOT_MESSAGE, RESEND_MESSAGE, INVALID_LINK, VERIFY_FAILED, TOO_MANY, MIN_PASSWORD, MAX_PASSWORD, MAX_NAME,
  isValidEmail, pickLang, checkNames, checkNewPassword, throttled, verifyThrottled, minResponseMs, padTo,
  sendVerifyEmail, sendResetEmail
};

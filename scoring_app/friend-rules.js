/* The small friends-list rules shared by the scoring app's server and its pages (spec section 8): how long a nickname
   may be, when a request can be sent again, when an unanswered request counts as declined, and which badge an entry
   shows. No DOM, no network, no clock of its own: callers pass the time in, so the server and the page agree. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DDFriendRules = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var DAY_MS = 24 * 60 * 60 * 1000;
  var NICKNAME_MAX = 12;
  var RESEND_MS = 7 * DAY_MS;     // a request (and an invite email) at most once a week
  var HELD_MS = 30 * DAY_MS;      // no answer in 30 days = declined

  function toTime(v) {
    if (v === null || v === undefined || v === '') return NaN;
    var t = v instanceof Date ? v.getTime() : new Date(v).getTime();
    return isFinite(t) ? t : NaN;
  }

  /* One line, no control characters, single spaces, at most 12 characters (counted as the eye sees them, so an emoji
     is not cut in half). */
  function cleanNickname(s) {
    if (typeof s !== 'string') return '';
    var one = s.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
    return Array.from(one).slice(0, NICKNAME_MAX).join('').trim();
  }

  /* True once a week has passed since the last request (or there never was one). */
  function canResend(requestedAt, now) {
    var t = toTime(requestedAt);
    return !isFinite(t) || toTime(now) - t >= RESEND_MS;
  }

  /* The first moment canResend turns true, as an ISO string (null when it already is). */
  function nextResendAt(requestedAt, now) {
    if (canResend(requestedAt, now)) return null;
    return new Date(toTime(requestedAt) + RESEND_MS).toISOString();
  }

  /* True when a request (and the games held for it) has waited 30 days or more without an answer. */
  function heldExpired(requestedAt, now) {
    var t = toTime(requestedAt);
    return isFinite(t) && toTime(now) - t >= HELD_MS;
  }

  /* 'linked' | 'waiting' | 'none'. A waiting entry past its 30 days reads as none, the same as a declined one. */
  function badge(row, now) {
    if (!row) return 'none';
    if (row.status === 'linked') return 'linked';
    if (row.status === 'waiting' && !heldExpired(row.requested_at, now === undefined ? Date.now() : now)) return 'waiting';
    return 'none';
  }

  return { NICKNAME_MAX: NICKNAME_MAX, RESEND_MS: RESEND_MS, HELD_MS: HELD_MS,
    cleanNickname: cleanNickname, canResend: canResend, nextResendAt: nextResendAt, heldExpired: heldExpired, badge: badge };
});

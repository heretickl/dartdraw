// Site-wide settings kept in the site_settings table (key text, value jsonb): how long the public home page keeps events,
// and the contact line on the sign-in page. The Admin tab edits them (api/_routes/admin/settings.js); the public viewer
// reads the two numbers through the public_settings view; the sign-in page reads the contact line through /api/auth/config.
const { sql } = require('./db');

// resultsDays: how many days a finalized event stays under Results.
// liveHours: how many hours a started but unfinished event stays under Live now.
const DEFAULT_SETTINGS = Object.freeze({ resultsDays: 14, liveHours: 48 });
const SETTING_LIMITS = Object.freeze({
  resultsDays: Object.freeze([1, 90]),
  liveHours: Object.freeze([1, 168])
});

const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

function inRange(key, value) {
  const [lo, hi] = SETTING_LIMITS[key];
  return Number.isInteger(value) && value >= lo && value <= hi;
}

// The current settings. A missing table, a missing row, a junk or out-of-range value, or a database error
// all give the default for that setting: this never throws, so the Admin screen and callers keep working
// before the migration has been run.
async function getSettings() {
  const out = Object.assign({}, DEFAULT_SETTINGS);
  try {
    const rows = await sql`SELECT key, value FROM site_settings WHERE key IN ('resultsDays', 'liveHours')`;
    if (Array.isArray(rows)) {
      for (const r of rows) {
        if (r && typeof r.key === 'string' && has(SETTING_LIMITS, r.key) && inRange(r.key, r.value)) out[r.key] = r.value;
      }
    }
  } catch (e) { /* defaults */ }
  return out;
}

// adminContact: one line of plain text the sign-in page shows under "No account yet?" (for example who to ask, and how).
// It is the ONLY setting the organiser site shows to the public (GET /api/auth/config); the public viewer never sees it
// (its public_settings view exposes the two numbers only). Plain text: the sign-in page sets it with textContent, and
// the server also refuses < and >, strips control and direction-changing characters, and keeps it to one line.
const CONTACT_MAX_LENGTH = 200;
// C0/C1 controls, zero-width and direction marks/overrides/isolates, line/paragraph separators and the BOM.
const CONTACT_STRIP = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2060-\u2069\uFEFF]/g;

// The text as it would be stored: unsafe characters become spaces, runs of spaces become one, trimmed. null for a non-string.
function cleanContactLine(v) {
  if (typeof v !== 'string') return null;
  return v.replace(CONTACT_STRIP, ' ').replace(/\s+/g, ' ').trim();
}

// { ok: true, value } with the cleaned text ('' clears it; null counts as ''), or { ok: false, error }.
function validateContactLine(v) {
  if (v === null) return { ok: true, value: '' };
  const clean = cleanContactLine(v);
  if (clean === null) return { ok: false, error: 'adminContact must be text.' };
  if (clean.length > CONTACT_MAX_LENGTH) return { ok: false, error: 'The contact line must be ' + CONTACT_MAX_LENGTH + ' characters or fewer.' };
  if (/[<>]/.test(clean)) return { ok: false, error: 'The contact line must be plain text, without < or >.' };
  return { ok: true, value: clean };
}

// The stored contact line, or '' when there is none, it is not valid text, or anything fails. Never throws.
async function getContactLine() {
  try {
    const rows = await sql`SELECT value FROM site_settings WHERE key = 'adminContact'`;
    const r = Array.isArray(rows) ? rows[0] : null;
    if (!r || typeof r.value !== 'string') return '';
    const checked = validateContactLine(r.value);
    return checked.ok ? checked.value : '';
  } catch (e) {
    return '';
  }
}

// { ok: true, value: { resultsDays, liveHours[, adminContact] } } or { ok: false, error }. Both numbers are required
// integers inside the limits. adminContact is optional: when it is left out of the body it is left out of the value
// (and the stored line is kept as it is).
function validateSettings(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'Send resultsDays and liveHours.' };
  const value = {};
  for (const key of Object.keys(SETTING_LIMITS)) {
    const v = body[key];
    const [lo, hi] = SETTING_LIMITS[key];
    if (!Number.isInteger(v) || !inRange(key, v)) {
      return { ok: false, error: key + ' must be a whole number from ' + lo + ' to ' + hi + '.' };
    }
    value[key] = v;
  }
  if (has(body, 'adminContact') && body.adminContact !== undefined) {
    const c = validateContactLine(body.adminContact);
    if (!c.ok) return c;
    value.adminContact = c.value;
  }
  return { ok: true, value };
}

module.exports = {
  DEFAULT_SETTINGS, SETTING_LIMITS, CONTACT_MAX_LENGTH,
  getSettings, validateSettings, cleanContactLine, validateContactLine, getContactLine
};

// Site-wide settings kept in the site_settings table (key text, value jsonb): how long the public home page keeps events.
// The Admin tab edits them (api/admin/settings.js); the public viewer reads them through the public_settings view.
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

// { ok: true, value: { resultsDays, liveHours } } or { ok: false, error }. Both numbers are required integers inside the limits.
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
  return { ok: true, value };
}

module.exports = { DEFAULT_SETTINGS, SETTING_LIMITS, getSettings, validateSettings };

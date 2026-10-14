// The public retention settings, read from the public_settings view (see sql/settings.sql), which holds two rows:
// resultsDays (days a finalized event stays under Results) and liveHours (hours an unfinished event stays under Live now).
// The values are JSON numbers written by the organiser's Admin tab. Anything missing or malformed gives the default from
// listConfig.js, so the public site keeps working before the SQL has been run. This file does not import from the
// organiser's api/ folder (the viewer is a separate project), so it carries its own clamping from listConfig.js.
const cfg = require('./listConfig');

const DEFAULTS = { resultsDays: cfg.RESULTS_DAYS, liveHours: cfg.LIVE_STALE_HOURS };

// A whole number is clamped into the allowed range; anything else (string, fraction, null, NaN, ...) is the default.
function clampSetting(key, value) {
  if (typeof value !== 'number' || !Number.isInteger(value)) return DEFAULTS[key];
  const range = cfg.LIMITS[key];
  return Math.min(range[1], Math.max(range[0], value));
}

// sql is the viewer's tagged-template query function. Never throws.
async function loadSettings(sql) {
  const out = { resultsDays: DEFAULTS.resultsDays, liveHours: DEFAULTS.liveHours };
  try {
    const rows = await sql`SELECT key, value FROM public_settings`;
    if (Array.isArray(rows)) {
      for (const r of rows) {
        if (r && typeof r === 'object' && (r.key === 'resultsDays' || r.key === 'liveHours')) out[r.key] = clampSetting(r.key, r.value);
      }
    }
  } catch (e) { /* the view is missing or the query failed: defaults */ }
  return out;
}

module.exports = { loadSettings, clampSetting };

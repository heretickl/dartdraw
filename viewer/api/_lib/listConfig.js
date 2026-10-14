// Limits for the public event list. RESULTS_DAYS and LIVE_STALE_HOURS are only the defaults: the Admin tab stores the
// real values (read by siteSettings.js and clamped to LIMITS, which match the organiser's own limits in api/_lib/settings.js).
module.exports = {
  RESULTS_DAYS: 14,         // a finalized event stays listed this long after it was finalized
  LIVE_STALE_HOURS: 48,     // a started, unfinished event not saved for this long drops off the list
  LIMITS: { resultsDays: [1, 90], liveHours: [1, 168] },   // allowed range of those two settings, [min, max]
  UPCOMING_GRACE_DAYS: 1,   // an unstarted event stays upcoming until its date is this many days past (time zones)
  QUERY_DAYS: 8,            // rows saved within this many days are read; an undated unstarted event is upcoming this long
  MAX_PER_LIST: 100,        // most events returned in each of live, upcoming and results
  MAX_ROWS: 300,            // most rows read from the database
};

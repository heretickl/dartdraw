// Limits for the public event list. This is the one place to change them; an admin setting could replace it later.
module.exports = {
  RESULTS_DAYS: 7,          // a finished event stays listed this long after its last save
  LIVE_STALE_HOURS: 48,     // a started, unfinished event not saved for this long drops off the list
  UPCOMING_GRACE_DAYS: 1,   // an unstarted event stays upcoming until its date is this many days past (time zones)
  QUERY_DAYS: 8,            // rows saved within this many days are read; an undated unstarted event is upcoming this long
  MAX_PER_LIST: 100,        // most events returned in each of live, upcoming and results
  MAX_ROWS: 300,            // most rows read from the database
};

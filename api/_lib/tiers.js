// Access levels. Basic organisers are limited in how many entries an event may
// hold; Pro is unlimited. Everything else about the two levels is identical.
const ENTRY_LIMITS = { basic: 64, pro: null };

// Number or null (null = unlimited). A missing or unknown tier is treated as
// 'basic', so a bad value can never grant more than the default.
function entryLimitFor(tier) {
  if (typeof tier === 'string' && Object.prototype.hasOwnProperty.call(ENTRY_LIMITS, tier)) return ENTRY_LIMITS[tier];
  return ENTRY_LIMITS.basic;
}

// Active (non-withdrawn) entries in an event's data. Tolerant of junk.
function countActiveEntries(data) {
  const list = data && typeof data === 'object' ? data.entriesList : null;
  if (!Array.isArray(list)) return 0;
  let n = 0;
  for (const e of list) {
    if (e && typeof e === 'object' && !Array.isArray(e) && !e.withdrawn) n++;
  }
  return n;
}

// null when the save is allowed, else { limit, count }. A save is refused only
// if it is over the limit AND bigger than what is already stored, so lowering
// someone to Basic never locks them out of an existing larger event.
function checkEntryLimit(tier, newData, oldData) {
  const limit = entryLimitFor(tier);
  if (limit === null) return null;
  const count = countActiveEntries(newData);
  if (count > limit && count > countActiveEntries(oldData)) return { limit, count };
  return null;
}

module.exports = { ENTRY_LIMITS, entryLimitFor, countActiveEntries, checkEntryLimit };

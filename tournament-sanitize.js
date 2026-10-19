/* Cleans a tournament object (the `data` of a saved event) of values that could turn into script when the organiser app
   builds HTML from them. One file, two users: api/tournaments/[id].js runs it on every save (so nothing hostile is stored),
   and app.html runs it on every event it loads (so an Admin who opens another organiser's event is protected even from
   rows saved before the server rule existed). It strips, it never rejects, and legitimate data passes through unchanged:
   names and other text are NOT rewritten (they are escaped where the page is built; see escText / escJs / imgSrc in app.html).

   What it does:
   - format.logo must be a base64 image data URI (png, jpeg, gif, webp), otherwise it is removed.
   - format.sponsors: items (a string, or an object with src) whose image is not such a data URI are dropped.
   - publicSlug must be letters, digits, _ or - (up to 64), otherwise it is removed.
   - every value stored under a key named id, or ending in Id / Ids (entry, group, pod and match ids, and lists of them), is
     reduced to letters, digits and _ . | : - (other characters become _), because those values are put into onclick handlers.
   - lists stored under the key boards (group and pod board numbers) keep only numbers.
   - the well-known number fields (entries, boards, best-of legs, group sizes, seeds, qualifiers, the knockout legs) that hold
     a string which is not a number are replaced by a sane default. Real numbers and numeric strings are left alone.
   - the start time and break times must look like a time (HH:MM), otherwise they are emptied. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TournamentSanitize = factory();
})(this, function () {
  var IMAGE_RE = /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+\/=]+$/;
  var SLUG_RE = /^[A-Za-z0-9_-]{1,64}$/;
  var ROUTE_ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
  var TIME_RE = /^\d{1,2}:\d{2}(:\d{2})?$/;
  var BAD_ID_CHARS = /[^A-Za-z0-9_.|:-]/g;
  var MAX_DEPTH = 40;

  // [key, default] for the number fields. null = no default (the field is removed).
  var EVENT_NUMBERS = [['entries', 8], ['boards', 4]];
  var FORMAT_NUMBERS = [['bestOfLegs', 5], ['podLegs', 5], ['maxPerGroup', 4], ['numSeeds', 8], ['podCount', 8], ['teamSize', 4], ['qualifiersPerGroup', 2], ['plateQualifiersPerGroup', null]];
  var KO_LEG_NUMBERS = [['early', 5], ['quarterfinal', 5], ['semifinal', 5], ['final', 5], ['flatLegs', 5]];

  function isImage(v) { return typeof v === 'string' && IMAGE_RE.test(v); }
  function isId(key) { return key === 'id' || /Ids?$/.test(key); }
  function cleanId(v) { return v.replace(BAD_ID_CHARS, '_'); }
  function isPlain(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  // A string that is not a number ('abc', '5x', 'NaN') is replaced; '' is left alone (an empty box), as are numbers and '12'.
  function fixNumbers(obj, list) {
    if (!isPlain(obj)) return;
    list.forEach(function (p) {
      var v = obj[p[0]];
      if (typeof v === 'string' && v.trim() !== '' && !isFinite(Number(v))) {
        if (p[1] === null) delete obj[p[0]]; else obj[p[0]] = p[1];
      }
    });
  }

  // A time of day (from a time box) is HH:MM; anything else is emptied.
  function fixTime(obj, key) {
    if (isPlain(obj) && typeof obj[key] === 'string' && obj[key] !== '' && !TIME_RE.test(obj[key])) obj[key] = '';
  }

  function walk(node, depth) {
    if (depth > MAX_DEPTH) return;
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length; i++) if (node[i] && typeof node[i] === 'object') walk(node[i], depth + 1);
      return;
    }
    Object.keys(node).forEach(function (k) {
      var v = node[k];
      if (typeof v === 'string') {
        if (isId(k)) node[k] = cleanId(v);
        else if (k === 'boards' && v.trim() !== '' && !isFinite(Number(v))) delete node[k];   // a group or pod without boards is filled in on load
      } else if (Array.isArray(v) && k === 'boards') {
        node[k] = v.map(function (x) { return typeof x === 'number' ? x : parseInt(x, 10); }).filter(function (n) { return isFinite(n); });   // board numbers go into HTML as they are
      } else if (Array.isArray(v) && isId(k)) {
        node[k] = v.map(function (x) { return typeof x === 'string' ? cleanId(x) : x; });
      } else if (v && typeof v === 'object') {
        walk(v, depth + 1);
      }
    });
  }

  // Mutates and returns `data`.
  function sanitizeTournamentData(data) {
    if (!isPlain(data)) return data;
    var f = data.format;
    if (isPlain(f)) {
      if ('logo' in f && f.logo != null && !isImage(f.logo)) delete f.logo;
      if ('sponsors' in f) {
        if (!Array.isArray(f.sponsors)) f.sponsors = [];
        else f.sponsors = f.sponsors.filter(function (s) { return typeof s === 'string' ? isImage(s) : !!(s && typeof s === 'object' && isImage(s.src)); });
      }
      fixNumbers(f, FORMAT_NUMBERS);
      if (isPlain(f.knockoutLegs)) { fixNumbers(f.knockoutLegs.main, KO_LEG_NUMBERS); fixNumbers(f.knockoutLegs.plate, KO_LEG_NUMBERS); }
      if (Array.isArray(f.mixedRubbers)) f.mixedRubbers.forEach(function (r) { fixNumbers(r, [['startingScore', 501], ['legs', 3]]); });
      if (isPlain(f.breaks)) Object.keys(f.breaks).forEach(function (k) { fixNumbers(f.breaks[k], [['minutes', 30]]); fixTime(f.breaks[k], 'time'); });
      fixTime(f, 'anticipatedStartTime');
    }
    fixNumbers(data.eventCreation, EVENT_NUMBERS);
    if ('publicSlug' in data && data.publicSlug != null && !(typeof data.publicSlug === 'string' && SLUG_RE.test(data.publicSlug))) delete data.publicSlug;
    walk(data, 0);
    return data;
  }

  return { sanitizeTournamentData: sanitizeTournamentData, isImage: isImage, isRouteId: function (id) { return typeof id === 'string' && ROUTE_ID_RE.test(id); } };
});

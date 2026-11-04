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
   - the start time and break times must look like a time (HH:MM), otherwise they are emptied.
   - the Teams segments (format.teamSegments, format.teamTieBreaker) keep only a known type and whole numbers, plus a game
     (x01 or cricket) and an in/out (DIDO or SIDO) when they hold one (cleanTeamSegments).
   - the Live scoring settings (format.scoring, format.games) keep only known keys with known values (cleanLiveSettings).
   - the print settings of the knockout bracket sheets and the printed knockout lineup sheets keep only known values (cleanPrinting). */
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

  // Teams segments: format.teamSegments = [{type, startingScore, legs}],
  // format.teamTieBreaker = {type, startingScore, legs, inRoundRobin, inKnockout} (the tie-breaker is chosen per stage).
  // The type is one of the four segment types (an older 'triples' is 'trios'; anything else becomes 'singles'), the numbers are
  // whole numbers (starting score 1 to 10000, else 501 (above 10000 becomes 10000); legs 1 to 99, else 3) and the two ticks are
  // true or false. A tie-breaker saved with one `enabled` tick (before the per-stage ticks) gets that value for both stages.
  // Other keys are dropped, and at most 50 segments are kept. The same rules as the app's cleanSegment / cleanTieBreaker.
  // A list that is not a list, or holds no segment, is removed (the app fills in the defaults); so is a tie-breaker that is not an object.
  var SEGMENT_TYPES = ['singles', 'doubles', 'trios', 'foursome'];
  function cleanSegment(s) {
    var type = s.type === 'triples' ? 'trios' : s.type;
    var start = parseInt(s.startingScore, 10), legs = parseInt(s.legs, 10);
    var out = {
      type: SEGMENT_TYPES.indexOf(type) !== -1 ? type : 'singles',
      startingScore: start >= 1 ? Math.min(start, 10000) : 501,
      legs: legs >= 1 ? Math.min(legs, 99) : 3
    };
    if (s.game === 'x01' || s.game === 'cricket') out.game = s.game;
    if (s.inOut === 'DIDO' || s.inOut === 'SIDO') out.inOut = s.inOut;
    return out;
  }
  function cleanTeamSegments(f) {
    if ('teamSegments' in f) {
      var list = Array.isArray(f.teamSegments) ? f.teamSegments.filter(isPlain).slice(0, 50).map(cleanSegment) : [];
      if (list.length) f.teamSegments = list; else delete f.teamSegments;
    }
    if ('teamTieBreaker' in f) {
      var raw = f.teamTieBreaker;
      if (isPlain(raw)) {
        var tb = cleanSegment(raw);
        var legacy = !('inRoundRobin' in raw) && !('inKnockout' in raw);
        tb.inRoundRobin = legacy ? raw.enabled === true : raw.inRoundRobin === true;
        tb.inKnockout = legacy ? raw.enabled === true : raw.inKnockout === true;
        f.teamTieBreaker = tb;
      } else delete f.teamTieBreaker;
    }
  }

  // Live scoring (live-settings.js reads these with the same rules). format.scoring = { mode: 'manual' | 'live', markerCheckIn,
  // checkoutHints, officialsApprove, publicStats (true / false), orderRule: 'everyLeg' | 'carryOver' }. format.games = { rr, pod,
  // finals, knockout: { main, plate } }, each { game, inOut, bull, decider } (+ byRound: [partial | null] on a knockout bracket).
  // Only known keys with known values are kept (a bad value is removed, which reads as the default); nothing is filled in,
  // and an object left empty is removed, so an event without Live scoring stays as it was. At most 12 rounds in byRound.
  var SINGLE_GAMES = ['301', '501', '701', '1001', 'cricket'];
  function singleGame(v) { if (typeof v === 'number') v = String(v); return typeof v === 'string' && SINGLE_GAMES.indexOf(v) !== -1 ? v : null; }
  function cleanGameValue(v) {
    var one = singleGame(v);
    if (one) return one;
    if (!isPlain(v) || !Array.isArray(v.pattern) || v.pattern.length < 2 || v.pattern.length > 8) return null;
    var list = [], x01 = null;
    for (var i = 0; i < v.pattern.length; i++) {
      var g = singleGame(v.pattern[i]);
      if (!g) return null;
      if (g !== 'cricket') { if (x01 !== null && x01 !== g) return null; x01 = g; }
      list.push(g);
    }
    return { pattern: list };
  }
  function cleanGameKeys(raw) {
    var out = {};
    if (!isPlain(raw)) return out;
    var g = cleanGameValue(raw.game);
    if (g !== null) out.game = g;
    if (raw.inOut === 'DIDO' || raw.inOut === 'SIDO') out.inOut = raw.inOut;
    if (raw.bull === 'coin' || raw.bull === 'first') out.bull = raw.bull;
    if (raw.decider === 'alternate' || raw.decider === 'bull' || raw.decider === 'choice') out.decider = raw.decider;
    return out;
  }
  function isEmpty(o) { return Object.keys(o).length === 0; }
  function cleanLiveSettings(f) {
    if ('scoring' in f) {
      var raw = f.scoring, sc = {};
      if (isPlain(raw)) {
        if (raw.mode === 'manual' || raw.mode === 'live') sc.mode = raw.mode;
        ['markerCheckIn', 'checkoutHints', 'officialsApprove', 'publicStats'].forEach(function (k) { if (typeof raw[k] === 'boolean') sc[k] = raw[k]; });
        if (raw.orderRule === 'everyLeg' || raw.orderRule === 'carryOver') sc.orderRule = raw.orderRule;
      }
      if (isEmpty(sc)) delete f.scoring; else f.scoring = sc;
    }
    if ('games' in f) {
      var g = f.games, out = {};
      if (isPlain(g)) {
        ['rr', 'pod', 'finals'].forEach(function (k) { var c = cleanGameKeys(g[k]); if (!isEmpty(c)) out[k] = c; });
        if (isPlain(g.knockout)) {
          var ko = {};
          ['main', 'plate'].forEach(function (k) {
            var raw = g.knockout[k];
            if (!isPlain(raw)) return;
            var c = cleanGameKeys(raw);
            if (Array.isArray(raw.byRound)) {
              var rounds = raw.byRound.slice(0, 12).map(function (r) { var rc = cleanGameKeys(r); return isEmpty(rc) ? null : rc; });
              while (rounds.length && rounds[rounds.length - 1] === null) rounds.pop();
              if (rounds.length) c.byRound = rounds;
            }
            if (!isEmpty(c)) ko[k] = c;
          });
          if (!isEmpty(ko)) out.knockout = ko;
        }
      }
      if (isEmpty(out)) delete f.games; else f.games = out;
    }
  }

  // Printing: printSettings.koPaperSize is one of the four paper sizes (else A4); printSettings.koPaperChoice (the answer of
  // the paper dialog) is { mode: 'shrink' | 'split', paper, rec } with paper sizes, else removed; lineupPrinted (which
  // knockout lineup sheets were printed) maps "<knockout | knockoutLosers | pod:id>:<round>-<match>" to "<id>|<id>",
  // anything else in it is dropped (at most 2000 entries). printSettings.sheetLang (the language every printed sheet of
  // the event uses, i18n step 4) is 'en' or 'ms'; any other value becomes 'en' (an event without it prints in English).
  var PAPER_KEYS = ['A4', 'A3', 'A2', 'A1'];
  var LINEUP_KEY_RE = /^(knockout|knockoutLosers|pod:[A-Za-z0-9_.|-]{1,80}):\d{1,3}-\d{1,4}$/;
  function cleanPrinting(data) {
    var ps = data.printSettings;
    if (isPlain(ps)) {
      if ('koPaperSize' in ps && PAPER_KEYS.indexOf(ps.koPaperSize) === -1) ps.koPaperSize = 'A4';
      if ('sheetLang' in ps && ps.sheetLang !== 'en' && ps.sheetLang !== 'ms') ps.sheetLang = 'en';
      if ('koPaperChoice' in ps) {
        var c = ps.koPaperChoice;
        if (isPlain(c) && (c.mode === 'shrink' || c.mode === 'split') && PAPER_KEYS.indexOf(c.paper) !== -1 && PAPER_KEYS.indexOf(c.rec) !== -1) ps.koPaperChoice = { mode: c.mode, paper: c.paper, rec: c.rec };
        else delete ps.koPaperChoice;
      }
    }
    if ('lineupPrinted' in data) {
      var lp = data.lineupPrinted, out = {}, n = 0;
      if (isPlain(lp)) Object.keys(lp).forEach(function (k) {
        var v = lp[k];
        if (n < 2000 && LINEUP_KEY_RE.test(k) && typeof v === 'string' && v.length <= 200) { out[k] = cleanId(v); n++; }
      });
      data.lineupPrinted = out;
    }
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
      cleanTeamSegments(f);
      cleanLiveSettings(f);
      if (isPlain(f.breaks)) Object.keys(f.breaks).forEach(function (k) { fixNumbers(f.breaks[k], [['minutes', 30]]); fixTime(f.breaks[k], 'time'); });
      fixTime(f, 'anticipatedStartTime');
    }
    fixNumbers(data.eventCreation, EVENT_NUMBERS);
    cleanPrinting(data);
    /* board groups on a drawn bracket: an even split (2, 4, 8 or 16 groups) with one board per group, or nothing */
    ['knockout', 'knockoutLosers'].forEach(function (k) {
      var b = data[k];
      if (!isPlain(b) || !('boardGroups' in b)) return;
      var g = b.boardGroups;
      var ok = isPlain(g) && [2, 4, 8, 16].indexOf(g.count) !== -1 && Array.isArray(g.boards) && g.boards.length === g.count &&
        g.boards.every(function (x) { var n = typeof x === 'number' ? x : parseInt(x, 10); return n > 0 && n <= 9999; });
      if (ok) b.boardGroups = { count: g.count, boards: g.boards.map(function (x) { return typeof x === 'number' ? x : parseInt(x, 10); }) };
      else delete b.boardGroups;
    });
    if ('publicSlug' in data && data.publicSlug != null && !(typeof data.publicSlug === 'string' && SLUG_RE.test(data.publicSlug))) delete data.publicSlug;
    walk(data, 0);
    return data;
  }

  return { sanitizeTournamentData: sanitizeTournamentData, isImage: isImage, isRouteId: function (id) { return typeof id === 'string' && ROUTE_ID_RE.test(id); } };
});

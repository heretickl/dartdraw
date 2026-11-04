/* DartDraw live-scoring settings: what an event's Live scoring switch and per-stage game boxes mean, in one place.
   One file, many users: the organiser app (app.html loads it before results-engine.js), the server (the floor officials' API
   and the live match API) and the scoring app read an event's settings through scoringOf / gameOf / isLive, so a missing or
   hostile value is read the same way everywhere. Reading never changes the event and never creates a key: an event saved
   before Live scoring existed has no format.scoring and no format.games, and it reads as Manual with 501 SIDO.
   (docs/superpowers/specs/2026-11-04-online-organizer-design.md, sections 4 and 5.)

   Stored data:
     format.scoring = { mode:'manual'|'live', markerCheckIn, checkoutHints, officialsApprove, publicStats (true/false),
                        orderRule:'everyLeg'|'carryOver' }
     format.games   = { rr: G, pod: G, finals: G, knockout: { main: G, plate: G } }
       G = { game, inOut:'DIDO'|'SIDO', bull:'coin'|'first', decider:'alternate'|'bull'|'choice' }
       game = '301' | '501' | '701' | '1001' | 'cricket' | { pattern:[game, ...] }   (a mixed match: one x01 at most)
       knockout.main and knockout.plate may also hold byRound: [partial G | null, ...] (the "set by round" override, round index
       0 = first round; a partial G holds only the keys it changes, null = the bracket's own value)
     format.teamSegments[i] and format.teamTieBreaker may hold game:'x01'|'cricket' and inOut:'DIDO'|'SIDO' beside
       type / startingScore / legs (a Teams match plays its segments in order; the segment's starting score is its x01).
   Stage keys: 'rr', 'knockout.main', 'knockout.plate', 'pod', 'finals', 'team:<index>', 'team:tiebreak'.
   Missing or unknown values read as: 501, Single-In Double-Out (Double-In Double-Out for 301), coin flip for the bull,
   the deciding leg alternates. A game setting never changes how many legs win a match. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LiveSettings = factory();
})(this, function () {
  var SINGLE_GAMES = ['301', '501', '701', '1001', 'cricket'];
  var IN_OUTS = ['DIDO', 'SIDO'];
  var BULLS = ['coin', 'first'];
  var DECIDERS = ['alternate', 'bull', 'choice'];
  var ORDER_RULES = ['everyLeg', 'carryOver'];
  var MODES = ['manual', 'live'];
  var BOOLEAN_SETTINGS = ['markerCheckIn', 'checkoutHints', 'officialsApprove', 'publicStats'];
  var MAX_PATTERN = 8;
  var MAX_ROUNDS = 12;

  function isPlain(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function has(list, v) { return list.indexOf(v) !== -1; }
  function formatOf(t) { return t && isPlain(t.format) ? t.format : null; }

  /* ---------- Scoring ---------- */
  function defaultScoring() {
    return { mode: 'manual', markerCheckIn: false, checkoutHints: false, orderRule: 'everyLeg', officialsApprove: false, publicStats: false };
  }
  // A clean, complete copy of a stored format.scoring (anything wrong becomes the default).
  function cleanScoring(raw) {
    var out = defaultScoring();
    if (!isPlain(raw)) return out;
    if (has(MODES, raw.mode)) out.mode = raw.mode;
    BOOLEAN_SETTINGS.forEach(function (k) { if (raw[k] === true) out[k] = true; });
    if (has(ORDER_RULES, raw.orderRule)) out.orderRule = raw.orderRule;
    return out;
  }
  function scoringOf(t) {
    var f = formatOf(t);
    return cleanScoring(f ? f.scoring : null);
  }
  function isLive(t) { return scoringOf(t).mode === 'live'; }

  /* ---------- Games ---------- */
  // '501' for 501 or '501'; null for anything that is not one of the five games.
  function singleGame(v) {
    if (typeof v === 'number') v = String(v);
    return typeof v === 'string' && has(SINGLE_GAMES, v) ? v : null;
  }
  // A game value: a single game, or { pattern } of 2 to 8 single games with at most one x01 among them. Null when not valid.
  function cleanGameValue(v) {
    var one = singleGame(v);
    if (one) return one;
    if (!isPlain(v) || !Array.isArray(v.pattern) || v.pattern.length < 2 || v.pattern.length > MAX_PATTERN) return null;
    var list = [], x01 = null;
    for (var i = 0; i < v.pattern.length; i++) {
      var g = singleGame(v.pattern[i]);
      if (!g) return null;
      if (g !== 'cricket') { if (x01 !== null && x01 !== g) return null; x01 = g; }
      list.push(g);
    }
    return { pattern: list };
  }
  // The x01 a game uses ('501' ...), or null for pure Cricket.
  function x01Of(game) {
    var list = isPlain(game) ? game.pattern : [game];
    for (var i = 0; i < list.length; i++) if (list[i] !== 'cricket') return list[i];
    return null;
  }
  // Double-In Double-Out for 301, Single-In Double-Out for the others (spec section 5).
  function defaultInOut(game) { return x01Of(game) === '301' ? 'DIDO' : 'SIDO'; }

  // Only the valid keys of a stored game object (a partial setting): used for the "by round" overrides.
  function validKeys(raw) {
    var out = {};
    if (!isPlain(raw)) return out;
    var g = cleanGameValue(raw.game);
    if (g !== null) out.game = g;
    if (has(IN_OUTS, raw.inOut)) out.inOut = raw.inOut;
    if (has(BULLS, raw.bull)) out.bull = raw.bull;
    if (has(DECIDERS, raw.decider)) out.decider = raw.decider;
    return out;
  }
  // A complete game setting: `over` (valid keys) laid over `base` (a complete setting, or null for the defaults).
  // A game chosen without an in/out gets that game's default in/out, not the base's.
  function complete(over, base) {
    var game = 'game' in over ? over.game : (base ? base.game : '501');
    var inOut = 'inOut' in over ? over.inOut : (base && !('game' in over) ? base.inOut : defaultInOut(game));
    return {
      game: typeof game === 'string' ? game : { pattern: game.pattern.slice() },
      inOut: inOut,
      bull: 'bull' in over ? over.bull : (base ? base.bull : 'coin'),
      decider: 'decider' in over ? over.decider : (base ? base.decider : 'alternate')
    };
  }
  function cleanGame(raw) { return complete(validKeys(raw), null); }
  function defaultGame() { return cleanGame(null); }

  // The stored value of a stage's game settings, or undefined.
  function storedGame(f, stageKey) {
    var g = isPlain(f.games) ? f.games : null;
    if (!g) return undefined;
    if (stageKey === 'rr' || stageKey === 'pod' || stageKey === 'finals') return g[stageKey];
    if (stageKey === 'knockout.main' || stageKey === 'knockout.plate') return isPlain(g.knockout) ? g.knockout[stageKey.slice(9)] : undefined;
    return undefined;
  }
  // A Teams segment (or the tie-breaker) as a game setting: x01 is its starting score (301, 501, 701 or 1001, else 501).
  function segmentGame(seg) {
    if (!isPlain(seg)) return defaultGame();
    var game = '501';
    if (seg.game === 'cricket') game = 'cricket';
    else {
      var s = singleGame(parseInt(seg.startingScore, 10));
      if (s && s !== 'cricket') game = s;
    }
    return complete({ game: game, inOut: has(IN_OUTS, seg.inOut) ? seg.inOut : defaultInOut(game) }, null);
  }

  /* The game setting for a stage: { game, inOut, bull, decider }, always complete and always a fresh object.
     ri (the round index, 0 = first round) matters only for the knockout stages, where a "by round" override beats the bracket's value. */
  function gameOf(t, stageKey, ri) {
    var f = formatOf(t);
    if (!f || typeof stageKey !== 'string') return defaultGame();
    var m = /^team:(\d+)$/.exec(stageKey);
    if (m) return segmentGame(Array.isArray(f.teamSegments) ? f.teamSegments[parseInt(m[1], 10)] : null);
    if (stageKey === 'team:tiebreak') return segmentGame(f.teamTieBreaker);
    var stored = storedGame(f, stageKey);
    var base = cleanGame(stored);
    if ((stageKey === 'knockout.main' || stageKey === 'knockout.plate') && isPlain(stored) && Array.isArray(stored.byRound) && typeof ri === 'number' && ri >= 0 && ri < MAX_ROUNDS) {
      var over = validKeys(stored.byRound[ri]);
      return complete(over, base);
    }
    return base;
  }

  return {
    scoringOf: scoringOf, gameOf: gameOf, isLive: isLive,
    cleanScoring: cleanScoring, cleanGame: cleanGame, cleanGameValue: cleanGameValue, cleanGameKeys: validKeys,
    defaultInOut: defaultInOut, MAX_ROUNDS: MAX_ROUNDS
  };
});

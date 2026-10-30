/* DartDraw results engine: the rules a result follows, shared by the organiser app (app.html loads this file after
   render.js) and the server (api/_lib/engine.js runs it with pods.js, boardplan.js and render.js in a sandbox), so a
   result entered by a floor official is stored exactly as the organiser's own screens would store it.
     - Teams: segments, tie-breakers and the checks on a Teams result (moved here unchanged from app.html).
     - Knockout: winners moving on, "Neither showed" (moved here unchanged from app.html).
     - Result slots, versions and the settings view (floor officials, docs/superpowers/specs/2026-10-30-floor-officials-design.md).
   T() is the app's word lookup; on the server it is a stand-in that returns the key. */
/* ---------- Teams: a team match is made of segments ----------
   An entry of any competition type is just its name (no roster: an older event's stored `players` lists are kept in
   the data but never shown or used). A Teams match is a list of segments played in order on one board, each with its
   own type, starting score and best-of legs. The organiser records ONE plain result per match: the total legs each
   team won across all its segments. That total goes into the same legs fields every other match uses, so standings,
   brackets, the public page and finalizing need nothing special. Data:
     format.teamSegments   = [{type:'singles'|'doubles'|'trios'|'foursome', startingScore, legs}]   (1 to 8 of them)
     format.teamTieBreaker = {type, startingScore, legs, inRoundRobin, inKnockout}
   The tie-breaker is one more segment, chosen per stage: inRoundRobin for round robin matches, inKnockout for knockout
   matches (the Plate pool, Group Boards groups and finals included). In a stage that uses it, a level total cannot be
   saved: the tie-breaker is played and its legs counted. In a stage without it, a level total is a draw in a round
   robin, and refused in a knockout (a knockout needs a winner). "stage" below is 'rr' or 'ko'.
   "Trios" is the name for three players (an older event's 'triples' segment is migrated to 'trios'). */
const DEFAULT_TIE_BREAK_ORDER = ['Legs won','Leg difference','Head-to-head result','Organiser decision / playoff'];
const OLD_DEFAULT_TIE_BREAK_ORDER = ['Head-to-head result','Leg difference','Legs won','Organiser decision / playoff'];   // the default before Oct 2026
const TEAM_SEGMENT_TYPES = [['singles','Singles'],['doubles','Doubles'],['trios','Trios'],['foursome','Foursome']];
const TEAM_SEGMENT_PLAYERS = { singles:1, doubles:2, trios:3, foursome:4 };
const TEAM_STARTING_SCORES = [301,501,701,1001];
const TEAM_MAX_SEGMENTS = 8;   // so the lineup sheet always fits one A4 page
function evenLegsWarning(){ return T('legs.evenWarning'); }
function defaultTeamSegments(){
  return [
    { type:'foursome', startingScore:1001, legs:1 },
    { type:'singles', startingScore:501, legs:3 },
    { type:'doubles', startingScore:501, legs:3 },
    { type:'singles', startingScore:501, legs:3 },
    { type:'doubles', startingScore:501, legs:3 }
  ];
}
function defaultTeamTieBreaker(){ return { type:'foursome', startingScore:1001, legs:1, inRoundRobin:true, inKnockout:true }; }
function isTeamsEvent(t){ return !!(t && t.eventCreation && t.eventCreation.competitionUnit==='Teams'); }
function isPlainObj(v){ return !!v && typeof v==='object' && !Array.isArray(v); }
function segmentTypeKey(v){ v = v==='triples' ? 'trios' : v; return TEAM_SEGMENT_PLAYERS[v] ? v : 'singles'; }
function segmentTypeLabel(v){ return T('seg.type.'+segmentTypeKey(v)); }
function segmentLegs(s){ const n = parseInt(s && s.legs); return n>=1 ? Math.min(n, 99) : 3; }
function segmentStart(s){ const n = parseInt(s && s.startingScore); return n>=1 ? Math.min(n, 10000) : 501; }
/* A clean copy of one segment (never the stored object), whatever the stored data holds. */
function cleanSegment(s){ return { type: segmentTypeKey(s && s.type), startingScore: segmentStart(s), legs: segmentLegs(s) }; }
function teamSegmentsOf(t){
  const list = (t && t.format && Array.isArray(t.format.teamSegments)) ? t.format.teamSegments.filter(isPlainObj) : [];
  return (list.length ? list : defaultTeamSegments()).map(cleanSegment);
}
/* The tie-breaker definition with its two stage ticks (an object saved before the ticks existed had one `enabled`). */
function cleanTieBreaker(tb){
  if(!isPlainObj(tb)) return Object.assign(defaultTeamTieBreaker(), { inRoundRobin:false, inKnockout:false });
  const legacy = !('inRoundRobin' in tb) && !('inKnockout' in tb);
  const on = (k)=> legacy ? tb.enabled===true : tb[k]===true;
  return Object.assign(cleanSegment(tb), { inRoundRobin:on('inRoundRobin'), inKnockout:on('inKnockout') });
}
function teamTieBreakerDef(t){ return cleanTieBreaker(t && t.format && t.format.teamTieBreaker); }
/* Which stages an event's format has: a round robin, a knockout (Group Boards is a knockout), or both. */
function formatHasStage(t, stage){
  const ft = t && t.format && t.format.formatType;
  return stage==='rr' ? (ft==='roundrobin' || ft==='rrknockout') : (ft==='knockout' || ft==='podknockout' || ft==='rrknockout');
}
/* The tie-breaker segment for a stage's matches, or null when that stage does not use one. */
function teamTieBreakerFor(t, stage){
  const tb = teamTieBreakerDef(t);
  const on = stage==='rr' ? (tb.inRoundRobin || teamRrTieBreakerForced(t)) : tb.inKnockout;
  return (on && formatHasStage(t, stage)) ? cleanSegment(tb) : null;
}
/* The most legs one side can win in a segment: a majority of its best-of. */
function segmentMaxLegs(s){ return Math.floor(segmentLegs(s)/2)+1; }
/* The most legs one team can win in a match of that stage: every main segment, plus the tie-breaker when the stage uses it. */
function teamMatchCap(t, stage){
  const tb = teamTieBreakerFor(t, stage);
  return teamSegmentsOf(t).reduce((sum,s)=> sum+segmentMaxLegs(s), 0) + (tb ? segmentMaxLegs(tb) : 0);
}
/* A walkover: the winner is given every main segment (no tie-breaker is needed when one side does not play). */
function teamWalkoverLegs(t){ return teamSegmentsOf(t).reduce((sum,s)=> sum+segmentMaxLegs(s), 0); }
/* Every leg a match of that stage can take, the tie-breaker's included when the stage uses it: the time estimate. */
function teamMatchTotalLegs(t, stage){
  const tb = teamTieBreakerFor(t, stage);
  return teamSegmentsOf(t).reduce((sum,s)=> sum+segmentLegs(s), 0) + (tb ? segmentLegs(tb) : 0);
}
function segmentDescription(s){ return T('seg.desc', {type: segmentTypeLabel(s.type), start: segmentStart(s), legs: segmentLegs(s)}); }
/* "5 segments + tie-breaker": the short description used in sheet headers and summaries. With a stage it describes
   that stage's matches; without one, the whole event ("+ tie-breaker (knockout)" when only one of two stages uses it). */
function teamMatchShortLabel(t, stage){
  const n = teamSegmentsOf(t).length;
  if(stage) return T(teamTieBreakerFor(t, stage) ? 'seg.short.tb' : 'seg.short', {n});
  const stages = ['rr','ko'].filter(s=> formatHasStage(t, s));
  const using = stages.filter(s=> teamTieBreakerFor(t, s));
  if(!using.length) return T('seg.short', {n});
  if(using.length===stages.length) return T('seg.short.tb', {n});
  return T(using[0]==='rr' ? 'seg.short.tbRr' : 'seg.short.tbKo', {n});
}
/* Segment label on the lineup sheet: "<Type> <n>", numbered per type (Singles 1, Doubles 1, Singles 2, ...). */
function teamSegmentLabels(segs){
  const seen = {};
  return segs.map(s=>{ const k = segmentTypeKey(s.type); seen[k] = (seen[k]||0)+1; return T('seg.numbered', {type: segmentTypeLabel(k), n: seen[k]}); });
}
/* The note under the two result boxes of a Teams match of that stage. */
function teamResultHintHTML(t, stage){
  const n = teamSegmentsOf(t).length, tb = teamTieBreakerFor(t, stage), cap = teamMatchCap(t, stage);
  const level = T(tb ? 'team.level.tb' : stage==='rr' ? 'team.level.rr' : 'team.level.ko');
  return '<p style="font-size:11px;color:#8a97a5">'+T(tb ? 'team.hint.tb' : 'team.hint', {n, cap, level})+'</p>';
}
/* The attributes of a Teams result box: whole numbers of 0 or more; a total above the cap is NOT changed to the cap
   (the organiser would save a number nobody typed) but refused with a message on Save (teamResultError). */
function teamResultBoxAttr(cap){
  return 'min="0" max="'+cap+'" step="1" oninput="this.value=this.value===\'\'?\'\':Math.max(parseInt(this.value)||0,0)"';
}
/* The result already stored for a match, as {a,b}, only when both sides hold a real number (a blank or missing leg
   count, e.g. in an older record, is not a result: then null, and the typed totals get every check). */
function teamStoredResult(a, b){
  const num = v=> v!=='' && v!=null && !isNaN(parseInt(v));
  return (num(a) && num(b)) ? { a:parseInt(a), b:parseInt(b) } : null;
}
/* Checks one Teams result (the two box values as typed) for a match of that stage. `stored` ({a,b}, from
   teamStoredResult) is the result already saved for this match: saving it again unchanged is always allowed, even if
   the cap is lower now (an older event's result). Returns the message to show, or null when it can be saved. */
function teamResultError(t, va, vb, stage, stored){
  const la = parseInt(va), lb = parseInt(vb);
  if(va===''||vb===''||isNaN(la)||isNaN(lb)||la<0||lb<0) return T('team.err.enter');
  if(stored && la===stored.a && lb===stored.b) return null;
  const cap = teamMatchCap(t, stage);
  if(la>cap || lb>cap) return T('team.err.cap', {cap, what: teamMatchShortLabel(t, stage)});
  if(la===0 && lb===0) return T('team.err.zero');
  if(la===lb){
    if(teamTieBreakerFor(t, stage)) return T(stage==='rr' ? 'team.err.levelTbRr' : 'team.err.levelTbKo');
    if(stage!=='rr'){
      /* A level total is always at most cap-1, so one more deciding leg always fits within the cap. */
      return T(teamTieBreakerTickChange(t, 'ko').canTurnOn ? 'team.err.koLevelTick' : 'team.err.koLevel');
    }
  }
  return null;
}
/* Has a stage of the event begun? Round robin: a group started or holding a score. Knockout (the Plate pool, Group
   Boards groups and the Finals included): a round started (Start round), a match called to a board, or any result
   (legs, a winner other than a bye, a walkover, "neither showed"). */
function teamStageStarted(t, stage){
  if(stage==='rr') return (t.groups||[]).some(g=> g.gameStarted || (g.scores && Object.keys(g.scores).length));
  const begun = b=> !!(b && b.rounds && ((b.roundStartedAt||[]).some(Boolean) ||
    b.rounds.some(r=> r.some(m=> m.called || m.aLegs!=null || m.bLegs!=null || m.void || m.wo || (m.winnerId && !m.bye)))));
  return [t.knockout, t.knockoutLosers].some(begun) || (t.pods||[]).some(p=> begun(p.bracket));
}
/* The segments are locked once either stage has begun, like a group's lineup: every match of the event is played with
   the same segments. */
function teamSegmentsLocked(t){ return teamStageStarted(t, 'rr') || teamStageStarted(t, 'ko'); }
/* No draws: a round robin team match is always settled, so its tie-breaker is always played when the totals are level.
   Only an event that already holds a drawn round robin result (saved before draws were removed) keeps playing without. */
function teamRrTieBreakerForced(t){ return formatHasStage(t, 'rr') && !teamRoundRobinHasLevel(t); }
/* A round robin result stored level (a draw): the round robin tie-breaker can't be switched on any more. */
function teamRoundRobinHasLevel(t){
  return (t.groups||[]).some(g=> Object.keys(g.scores||{}).some(k=>{ const s = g.scores[k]; const r = s && teamStoredResult(s.legs1, s.legs2); return !!(r && r.a===r.b); }));
}
/* What may be done with a stage's tie-breaker tick: before that stage has begun, anything. After: switching it OFF
   never (results were saved with it), switching it ON for the knockout always (no stored knockout result is level and
   the cap only rises), and for the round robin only while no level (drawn) result is stored. */
function teamTieBreakerTickChange(t, stage){
  if(!formatHasStage(t, stage)) return { locked:true, canTurnOn:false, canTurnOff:false };
  if(!teamStageStarted(t, stage)) return { locked:false, canTurnOn:true, canTurnOff:true };
  const on = stage==='rr' ? teamTieBreakerDef(t).inRoundRobin : teamTieBreakerDef(t).inKnockout;
  const canTurnOn = !on && (stage==='ko' || !teamRoundRobinHasLevel(t));
  return { locked:true, canTurnOn:canTurnOn, canTurnOff:false };
}
/* The tie-breaker's own type, starting score and best of can change only while no begun stage uses it. */
function teamTieBreakerDefEditable(t){
  return !teamTieBreakerStages(t).some(s=> teamStageStarted(t, s) && teamTieBreakerFor(t, s));
}
/* An older Teams event used either one "foursome" match (format.bestOfLegs) or a list of rubbers
   (format.mixedRubbers, one of them possibly flagged as the tie-breaker). Both become segments, once, the first time
   the event is opened; the old fields stay in the data untouched. A legacy tie-breaker rubber is used in both stages.
   A Teams event with neither (no stored team setup at all) and any other event just get the defaults. Never runs
   again once format.teamSegments exists; a tie-breaker saved with one `enabled` tick gets the two stage ticks. */
function migrateTeamSegments(t){
  const f = t.format;
  if(Array.isArray(f.teamSegments) && f.teamSegments.length){
    f.teamTieBreaker = cleanTieBreaker(f.teamTieBreaker);
    return;
  }
  const off = cleanTieBreaker(null);
  const both = (s)=> Object.assign(cleanSegment(s), { inRoundRobin:true, inKnockout:true });
  const legacyLegs = (r)=> (r && r.legs!==undefined) ? r.legs : (parseInt(f.bestOfLegs)||3);
  const rubbers = Array.isArray(f.mixedRubbers) ? f.mixedRubbers.filter(isPlainObj) : [];
  /* Very old events never stored a team format: they played the foursome. */
  const foursome = f.teamMatchFormat==='foursome' || (f.teamMatchFormat===undefined && f.qualifiersPerGroup===undefined);
  if(!isTeamsEvent(t) || !(foursome || (f.teamMatchFormat==='mixed' && rubbers.length))){
    f.teamSegments = defaultTeamSegments(); f.teamTieBreaker = defaultTeamTieBreaker(); return;
  }
  if(f.teamMatchFormat==='mixed'){
    const tbIdx = rubbers.findIndex(r=> r.isTieBreaker===true);
    let main = rubbers.filter((r,i)=> i!==tbIdx);
    let tb = tbIdx>=0 ? rubbers[tbIdx] : null;
    if(!main.length){ main = [tb]; tb = null; }   // a lone rubber flagged tie-breaker is the match itself
    f.teamSegments = main.map(r=> cleanSegment({ type:r.type, startingScore:r.startingScore, legs:legacyLegs(r) }));
    f.teamTieBreaker = tb ? both({ type:tb.type, startingScore:tb.startingScore, legs:legacyLegs(tb) }) : off;
  } else {
    f.teamSegments = [ cleanSegment({ type:'foursome', startingScore:501, legs:parseInt(f.bestOfLegs)||5 }) ];
    f.teamTieBreaker = off;
  }
}

/* Pushes any already-known winners (from round-1 byes) forward into the next
   round's slots — called after generation and after every score is saved. */
function propagateByes(rounds){
  propagateByesCore(rounds);
  settleVoids(rounds);
}
/* Round by round, every next-round slot takes its feeder's winner (or nobody, when the feeder has no winner). A slot
   that changes resets that match's result, and because the rounds are walked in order the reset carries on through
   every later round: correcting or clearing an early result never leaves the old winner (or a stale score, or a
   stale champion) further on. A slot that already holds the right entry is left alone, so a score-only correction
   (same winner) changes nothing later. */
function propagateByesCore(rounds){
  for(let r=0; r<rounds.length-1; r++){
    const nextRound = rounds[r+1];
    rounds[r].forEach((m, i)=>{
      const next = nextRound[Math.floor(i/2)], slot = i%2===0 ? 'aEntryId' : 'bEntryId', want = m.winnerId || null;
      if(next[slot] === want) return;
      next[slot] = want;
      next.winnerId = null; next.aLegs = null; next.bLegs = null; next.wo = false; next.bye = false; delete next.void;
    });
  }
}
/* "Neither showed": a void match has no winner and nobody advances from it. The next-round match is resolved from its
   two feeders — both void: void too; one void and the other won: a bye for that winner; one void and the other still
   open: it waits. Runs on its own only when the bracket already holds a void or a bye made by one (so ordinary
   brackets are untouched); `force` runs it regardless (group brackets, the Finals, and the void handlers).
   It also pushes winners forward and clears a slot whose feeder no longer has that winner, round by round. */
function settleVoids(rounds, force){
  const hasVoidState = rounds.some((round, r)=> round.some(m=> m.void || (r>0 && m.bye)));
  if(!force && !hasVoidState) return;
  for(let r=0; r<rounds.length-1; r++){
    const nextRound = rounds[r+1];
    rounds[r].forEach((m, i)=>{
      const next = nextRound[Math.floor(i/2)], slot = i%2===0 ? 'aEntryId' : 'bEntryId', want = m.winnerId || null;
      if(next[slot] === want) return;
      next[slot] = want;
      next.winnerId = null; next.aLegs = null; next.bLegs = null; next.wo = false; next.bye = false; delete next.void;
    });
    nextRound.forEach((n, i)=>{
      const f0 = rounds[r][2*i], f1 = rounds[r][2*i+1];
      if(f0.void && f1.void){
        n.void = true; n.aEntryId = null; n.bEntryId = null; n.winnerId = null; n.aLegs = null; n.bLegs = null; n.wo = false; n.bye = false;
      } else if(f0.void || f1.void){
        const other = f0.void ? f1 : f0;
        delete n.void;
        if(other.winnerId){ n.bye = true; n.winnerId = other.winnerId; n.aLegs = null; n.bLegs = null; n.wo = false; }
        else { n.bye = false; n.winnerId = null; }
      } else {
        if(n.void && !n.aEntryId && !n.bEntryId) delete n.void;      // a void made by feeders that are no longer void
        if(n.bye){ n.bye = false; n.winnerId = null; n.aLegs = null; n.bLegs = null; }   // a bye made by a void feeder (rounds after the first only)
      }
    });
  }
}

/* ---------- Result slots (floor officials) ----------
   A slot is one match that takes a result, found by its POSITION (who plays may change as winners move on):
     rr:<groupId>:<scoreKey(a,b)>      a round robin match        result = g.scores[key] ({legs1, legs2, wo?})
     ko:<bracketKey>:<ri>:<mi>         a knockout match           result = the RESULT_FIELDS_KO of the match
   bracketKey is knockout, knockoutLosers (the Plate) or pod:<id> (a Group Boards group; its Finals is `knockout`).
   Every stored result also carries rv (its version: the server adds 1 on each change), by ('o' = the organiser, or a
   floor official's id) and at (when, server clock). The organiser app removes rv from a result it changed, which is
   how the server knows the organiser changed it (api/tournaments/[id].js). */
var RESULT_FIELDS_KO = ['aLegs', 'bLegs', 'winnerId', 'void', 'wo', 'called', 'calledAt', 'calledPair'];
var RESULT_META = ['rv', 'by', 'at'];
function reBrackets(t){
  var out = [];
  ['knockout', 'knockoutLosers'].forEach(function(k){ if(t[k] && Array.isArray(t[k].rounds)) out.push({ key: k, bracket: t[k], pod: null }); });
  (Array.isArray(t.pods) ? t.pods : []).forEach(function(p){ if(p && p.bracket && Array.isArray(p.bracket.rounds)) out.push({ key: 'pod:' + p.id, bracket: p.bracket, pod: p }); });
  return out;
}
function koResultOf(m){
  var o = {};
  RESULT_FIELDS_KO.concat(RESULT_META).forEach(function(f){ if(m[f] !== undefined && m[f] !== null && m[f] !== false) o[f] = m[f]; });
  return o;
}
/* Every match of t that takes a result, with where it is played. board: the boards it may be played on (a group's or a
   Group Boards group's boards, or the board the organiser gave a knockout match). open: it can be scored now. */
function resultSlots(t){
  var out = [];
  (Array.isArray(t.groups) ? t.groups : []).forEach(function(g){
    if(!g || !g.id || !g.confirmed) return;
    groupMatches(g).forEach(function(pair){
      var k = scoreKey(pair[0], pair[1]);
      out.push({ pos: 'rr:' + g.id + ':' + k, kind: 'rr', stage: 'rr', group: g, key: k, a: pair[0] < pair[1] ? pair[0] : pair[1], b: pair[0] < pair[1] ? pair[1] : pair[0],
        boards: (g.boards || []).slice(), open: !!g.gameStarted && !(g.scores && g.scores[k]),
        get: function(){ return g.scores && g.scores[k] ? g.scores[k] : null; },
        set: function(r){ if(!g.scores) g.scores = {}; if(r == null) delete g.scores[k]; else g.scores[k] = r; } });
    });
  });
  reBrackets(t).forEach(function(b){
    if(b.pod && !b.pod.confirmed) return;
    b.bracket.rounds.forEach(function(round, ri){
      (round || []).forEach(function(m, mi){
        if(!m || (!m.aEntryId && !m.bEntryId)) return;
        out.push({ pos: 'ko:' + b.key + ':' + ri + ':' + mi, kind: 'ko', stage: 'ko', bracketKey: b.key, bracket: b.bracket, pod: b.pod, ri: ri, mi: mi, m: m, a: m.aEntryId, b: m.bEntryId,
          boards: b.pod ? (b.pod.boards || []).slice() : (m.board ? [m.board] : []),
          open: !!(m.aEntryId && m.bEntryId && !m.winnerId && !m.bye && !m.void),
          get: function(){ var r = koResultOf(m); return Object.keys(r).length ? r : null; },
          set: null });
      });
    });
  });
  return out;
}
function slotByPos(t, pos){ var all = resultSlots(t); for(var i = 0; i < all.length; i++) if(all[i].pos === pos) return all[i]; return null; }
/* The event without its results, as canonical JSON: two copies with the same settingsView differ only in results (and
   in what follows from them: who moved on, group winners, no-show flags, the board plan, done stamps). */
function settingsView(t){
  var c = JSON.parse(JSON.stringify(t || {}));
  (c.groups || []).forEach(function(g){ delete g.scores; });
  reBrackets(c).forEach(function(b){
    var finals = b.key === 'knockout' && b.bracket.podFinals;
    b.bracket.rounds.forEach(function(round, ri){ (round || []).forEach(function(m){
      RESULT_FIELDS_KO.concat(RESULT_META, ['doneAt']).forEach(function(f){ delete m[f]; });
      if(ri > 0 || finals){ delete m.aEntryId; delete m.bEntryId; delete m.bye; }
    }); });
    if(b.pod) delete b.pod.winnerId;
  });
  (c.entriesList || []).forEach(function(e){ delete e.noShow; });
  ['boardPlan', 'updatedAt', 'settingsRev'].forEach(function(f){ delete c[f]; });
  return JSON.stringify(c, function(k, v){
    if(v && typeof v === 'object' && !Array.isArray(v)){ var o = {}; Object.keys(v).sort().forEach(function(x){ o[x] = v[x]; }); return o; }
    return v;
  });
}
/* Legs check for one result, as the organiser's score boxes check it. Returns null when it may be saved, else a reason. */
function resultError(t, s, la, lb){
  if(isTeamsEvent(t)){
    var stored = null;
    var cur = s.get();
    if(cur) stored = s.kind === 'rr' ? teamStoredResult(cur.legs1, cur.legs2) : teamStoredResult(cur.aLegs, cur.bLegs);
    return teamResultError(t, String(la), String(lb), s.stage, stored) ? 'invalid' : null;
  }
  if(!(la >= 0 && lb >= 0) || la !== Math.floor(la) || lb !== Math.floor(lb)) return 'invalid';
  var bestOf = s.kind === 'rr' ? (parseInt(t.format.bestOfLegs) || 5) : legsForKnockoutRound(t, s.bracketKey, s.bracket.rounds.length, s.ri);
  var majority = Math.floor(bestOf / 2) + 1, w = Math.max(la, lb), l = Math.min(la, lb);
  return (w !== majority || l >= majority) ? 'invalid' : null;
}
/* Applies one floor-official (or organiser) action to t, the way the organiser's screens do, and stamps the version on
   every result it changed (winners moving on included). op: 'score' {la, lb} (a = slot.a's legs), 'noShow' {side:'a'|'b'},
   'void' (knockout "Neither showed"), 'call' / 'uncall'. meta: { by, at }. Returns { ok:true, changed:[pos] } or
   { ok:false, code: 'missing' | 'invalid' | 'blocked' }. */
function applyResult(t, pos, op, args, meta){
  args = args || {}; meta = meta || {};
  var s = slotByPos(t, pos);
  if(!s) return { ok: false, code: 'missing' };
  var before = {}, beforeRv = {};
  resultSlots(t).forEach(function(x){ var r = x.get(); before[x.pos] = JSON.stringify(r); beforeRv[x.pos] = r && r.rv || 0; });   // a version only counts up, even when a result is written afresh (setScore)
  var entry = function(id){ return (t.entriesList || []).find(function(e){ return e.id === id; }); };
  if(s.kind === 'rr'){
    var g = s.group;
    if(op === 'score'){
      var la = Number(args.la), lb = Number(args.lb);
      if(resultError(t, s, la, lb)) return { ok: false, code: 'invalid' };
      setScore(g, s.a, s.b, la, lb);
    } else if(op === 'noShow'){
      var gone = args.side === 'b' ? s.b : s.a, maj = isTeamsEvent(t) ? teamWalkoverLegs(t) : Math.floor((parseInt(t.format.bestOfLegs) || 5) / 2) + 1;
      var ent = entry(gone); if(ent) ent.noShow = true;
      groupMatches(g).forEach(function(p){
        if(p[0] !== gone && p[1] !== gone) return;
        if(getScore(g, p[0], p[1])) return;
        var opp = p[0] === gone ? p[1] : p[0];
        setScore(g, gone, opp, 0, maj); g.scores[scoreKey(gone, opp)].wo = true;
      });
    } else return { ok: false, code: 'invalid' };
  } else {
    var m = s.m, b = s.bracket;
    var apply;
    if(op === 'score'){
      var ka = Number(args.la), kb = Number(args.lb);
      if(resultError(t, s, ka, kb)) return { ok: false, code: 'invalid' };
      apply = function(){ m.aLegs = ka; m.bLegs = kb; m.winnerId = ka > kb ? m.aEntryId : m.bEntryId; m.wo = false; delete m.void; };
    } else if(op === 'noShow'){
      var maj2 = koWalkoverLegs(t, s.bracketKey, b.rounds.length, s.ri), loserA = args.side === 'a';
      apply = function(){ m.aLegs = loserA ? 0 : maj2; m.bLegs = loserA ? maj2 : 0; m.winnerId = loserA ? m.bEntryId : m.aEntryId; m.wo = true; };
      var le = entry(loserA ? m.aEntryId : m.bEntryId); if(le) le.noShow = true;
    } else if(op === 'void'){
      apply = function(){ m.void = true; m.aLegs = null; m.bLegs = null; m.winnerId = null; m.wo = false; delete m.called; delete m.calledAt; delete m.calledPair; };
      [m.aEntryId, m.bEntryId].forEach(function(id){ var e = entry(id); if(e) e.noShow = true; });
    } else if(op === 'call' || op === 'uncall'){
      if(op === 'call'){ if(m.winnerId || m.bye || m.void || !m.aEntryId || !m.bEntryId) return { ok: false, code: 'invalid' }; m.called = true; m.calledAt = meta.at || Date.now(); m.calledPair = m.aEntryId + '|' + m.bEntryId; }
      else { delete m.called; delete m.calledAt; delete m.calledPair; }
      apply = null;
    } else return { ok: false, code: 'invalid' };
    if(apply){
      if(s.pod){ var res = podsApplyResult(t, s.pod, apply); if(res && res.ok === false) return { ok: false, code: 'blocked' }; }
      else { apply(); propagateByes(b.rounds); if(op === 'void') settleVoids(b.rounds, true); }
    }
  }
  var changed = [];
  resultSlots(t).forEach(function(x){
    var now = x.get();
    if(JSON.stringify(now) === before[x.pos]) return;
    changed.push(x.pos);
    if(!now) return;
    now = x.kind === 'rr' ? x.group.scores[x.key] : x.m;
    now.rv = Math.max(beforeRv[x.pos] || 0, now.rv || 0) + 1; now.by = meta.by || 'o'; now.at = meta.at || Date.now();
  });
  return { ok: true, changed: changed };
}
/* What a save computes from the results (done stamps, the Group Boards board plan): normalizeForSave without updatedAt. */
function rebuildDerived(t){
  if(t.format && t.format.formatType === 'podknockout'){ stampDoneTimes(t); t.boardPlan = buildBoardPlan(t); }
  else if('boardPlan' in t) delete t.boardPlan;
  if(t.eventCreation && Array.isArray(t.entriesList)) t.eventCreation.entries = t.entriesList.filter(function(e){ return !e.withdrawn; }).length;
}
/* A whole-event save that was based on an older copy, put together with what is stored now, match by match (the
   floor officials' results that arrived meanwhile). Only for two copies with the same settings (settingsRev). For each
   result slot: one the organiser changed (in `dirty`) takes the incoming result; every other takes the stored one,
   including who plays it in later rounds (moved there by a stored result). No-show flags: either copy's. Then winners
   move on again and the derived parts are rebuilt. Every result that ends up different from the stored one is stamped
   as the organiser's. Returns the merged copy (incoming, changed in place). */
function mergeResults(stored, incoming, dirty, now){
  var dirtySet = {}; (dirty || []).forEach(function(p){ dirtySet[p] = true; });
  var storedSlots = {}; resultSlots(stored).forEach(function(s){ storedSlots[s.pos] = s; });
  resultSlots(incoming).forEach(function(s){
    if(s.kind !== 'rr' || dirtySet[s.pos]) return;
    var st = storedSlots[s.pos], r = st ? st.get() : null;
    s.set(r ? JSON.parse(JSON.stringify(r)) : null);
  });
  /* Knockout: every match by its position, including one with nobody in it in the incoming copy (its feeders were
     played since that copy was made): the stored result and, after the first round (and in a Group Boards Finals),
     who plays it. A first-round match whose players differ in the incoming copy (the draw was changed there) keeps
     no stored result: it was for other players. */
  var storedBr = {}; reBrackets(stored).forEach(function(b){ storedBr[b.key] = b; });
  reBrackets(incoming).forEach(function(b){
    var sb = storedBr[b.key]; if(!sb) return;
    var derivedEntrants = b.key === 'knockout' && !!b.bracket.podFinals;
    b.bracket.rounds.forEach(function(round, ri){ (round || []).forEach(function(m, mi){
      var sm = sb.bracket.rounds[ri] && sb.bracket.rounds[ri][mi];
      if(!m || !sm || dirtySet['ko:' + b.key + ':' + ri + ':' + mi]) return;
      if(ri === 0 && !derivedEntrants && ((m.aEntryId || null) !== (sm.aEntryId || null) || (m.bEntryId || null) !== (sm.bEntryId || null))) return;
      RESULT_FIELDS_KO.concat(RESULT_META, ['doneAt']).forEach(function(f){ if(sm[f] === undefined) delete m[f]; else m[f] = sm[f]; });
      if(ri > 0 || derivedEntrants){ m.aEntryId = sm.aEntryId; m.bEntryId = sm.bEntryId; m.bye = sm.bye; }
    }); });
  });
  var noShow = {}; (stored.entriesList || []).forEach(function(e){ if(e && e.noShow) noShow[e.id] = true; });
  (incoming.entriesList || []).forEach(function(e){ if(e && noShow[e.id]) e.noShow = true; });
  (incoming.pods || []).forEach(function(p){ if(p.bracket && p.bracket.rounds) podsPropagate(p.bracket.rounds); });
  if(incoming.knockout && incoming.knockout.podFinals && typeof syncFinalsFromPods === 'function') syncFinalsFromPods(incoming);
  ['knockout', 'knockoutLosers'].forEach(function(k){ if(incoming[k] && incoming[k].rounds) propagateByes(incoming[k].rounds); });
  stampOrganiserResults(stored, incoming, now);
  rebuildDerived(incoming);
  return incoming;
}
function bareResult(r){
  if(!r) return 'null';
  var o = {};
  Object.keys(r).sort().forEach(function(k){ if(RESULT_META.indexOf(k) < 0 && k !== 'doneAt') o[k] = r[k]; });
  return JSON.stringify(o);
}
/* Every result of `next` that differs from `prev` (prev may be null: a new event) is the organiser's: by 'o', the time,
   and the next version. */
function stampOrganiserResults(prev, next, now){
  var old = {}; if(prev) resultSlots(prev).forEach(function(s){ old[s.pos] = s.get(); });
  resultSlots(next).forEach(function(s){
    var r = s.get(), was = old[s.pos] || null;
    if(!r || bareResult(r) === bareResult(was)) return;
    var target = s.kind === 'rr' ? s.group.scores[s.key] : s.m;
    target.rv = ((was && was.rv) || 0) + 1; target.by = 'o'; target.at = now || Date.now();
  });
}
/* The slots whose result differs between `base` (the copy an edit started from) and `cur`: what the organiser changed. */
function changedSlots(base, cur){
  var old = {}; if(base) resultSlots(base).forEach(function(s){ old[s.pos] = s.get(); });
  return resultSlots(cur).filter(function(s){ return bareResult(s.get()) !== bareResult(old[s.pos] || null); }).map(function(s){ return s.pos; });
}
if (typeof module !== 'undefined' && module.exports) module.exports = { resultSlots: resultSlots, settingsView: settingsView, applyResult: applyResult, rebuildDerived: rebuildDerived };

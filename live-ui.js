/* Live scoring screens of the organiser app: the "Live scoring" section on step 2 (Format & branding), the game boxes of each
   stage, the Teams segment game / in-out boxes, and the card that lists entries with a missing player name (steps 3 and 4).
   What the settings mean and how they are read and cleaned is live-settings.js (LiveSettings): this file only shows them
   and edits them. Needs globals from app.html (state, render, openModal, collapsibleSectionHTML, formSectionCollapsed,
   teamDraft, isTeamsEvent, nearestBracket, recommendGroups, koRoundName, ...) and T() from i18n/app-i18n.js (every word comes
   from i18n/app.en.js and app.ms.js, keys "live.*"). Only called while rendering or on a click.
   (docs/superpowers/specs/2026-11-04-online-organizer-design.md, sections 4, 5 and 6.)

   Every edit goes into a DRAFT (liveDraft), like the Teams segments (teamSegDraft): it is copied into the event only by
   Save format & branding (readLiveSettingsFromForm, called by saveStage2), and dropped when step 2 is left without Save.
   Nothing is created in the event by looking: format.scoring and format.games are written only when a setting differs from
   what is saved. A Manual event draws exactly what it drew before this file existed (the game boxes are empty strings). */
var liveDraft = null;   // { id, scoring, games, open: { 'knockout.main': true|false } }

function liveIsPlain(v){ return !!v && typeof v === 'object' && !Array.isArray(v); }
function liveCopy(v){ return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }

/* The unsaved edits to the Live scoring settings: the saved values (copied) until something is changed. */
function liveDraftGet(){
  if(!liveDraft || liveDraft.id !== state.id){
    var f = state.format;
    liveDraft = { id: state.id, scoring: LiveSettings.scoringOf(state), games: liveIsPlain(f.games) ? liveCopy(f.games) : {}, open: {} };
  }
  return liveDraft;
}
function liveDraftDrop(){ liveDraft = null; }
function liveDraftIsLive(){ return !!state && !!state.eventCreation && state.eventCreation.saved && liveDraftGet().scoring.mode === 'live'; }
/* The event as it would be with the draft saved: what LiveSettings reads the game boxes from (Teams: the segment draft). */
function liveDraftEvent(){
  var d = liveDraftGet(), f = { scoring: d.scoring, games: d.games };
  if(isTeamsEvent(state)){ var td = teamDraft(); f.teamSegments = td.segments; f.teamTieBreaker = td.tieBreaker; }
  return { format: f };
}
/* Has the organiser changed any Live scoring setting that is not saved yet? (step 2 asks before it is left.) */
function liveDraftChanged(){
  if(!liveDraft || !state || liveDraft.id !== state.id) return false;
  return JSON.stringify(liveDraft.scoring) !== JSON.stringify(LiveSettings.scoringOf(state))
    || JSON.stringify(liveDraft.games) !== JSON.stringify(liveIsPlain(state.format.games) ? state.format.games : {});
}
/* Save format & branding: what the draft holds, as { scoring, games }. A part that equals what is saved is left out (null), so
   an event is never given a setting nobody changed; null altogether when the section was never drawn (no draft). */
function readLiveSettingsFromForm(){
  if(!liveDraft || !state || liveDraft.id !== state.id) return null;
  var d = liveDraft, f = state.format;
  var scoring = JSON.stringify(d.scoring) !== JSON.stringify(LiveSettings.scoringOf(state)) ? LiveSettings.cleanScoring(d.scoring) : null;
  liveGamesPrune(d.games);
  var games = JSON.stringify(d.games) !== JSON.stringify(liveIsPlain(f.games) ? f.games : {}) ? liveCopy(d.games) : null;
  return { scoring: scoring, games: games };
}
/* Copies what readLiveSettingsFromForm returned into the event, then drops the draft. */
function applyLiveSettings(read){
  if(read && read.scoring) state.format.scoring = read.scoring;
  if(read && read.games) state.format.games = read.games;
  liveDraft = null;
}
/* Empty objects left behind by an edit are removed (nothing is stored for a stage that holds nothing). */
function liveGamesPrune(g){
  if(!liveIsPlain(g)) return;
  if(liveIsPlain(g.knockout)){
    ['main', 'plate'].forEach(function(k){ if(liveIsPlain(g.knockout[k]) && !Object.keys(g.knockout[k]).length) delete g.knockout[k]; });
    if(!Object.keys(g.knockout).length) delete g.knockout;
  }
  ['rr', 'pod', 'finals'].forEach(function(k){ if(liveIsPlain(g[k]) && !Object.keys(g[k]).length) delete g[k]; });
}

/* Switching back to Manual is refused while a match is being scored on a device. The live match records come with the server
   (a later task); until then nothing is ever playing, so this allows it. */
function liveHasPlayingMatch(t){
  return typeof liveMatchesPlaying === 'function' ? !!liveMatchesPlaying(t) : false;
}

/* Runs fn (a draw of the page) and puts back what was typed in the boxes that have an id, so a switch that redraws the
   whole step does not lose the other, unsaved fields. */
function liveKeepFields(fn){
  var kept = {};
  try{
    var area = document.getElementById('stageArea');
    if(area && area.querySelectorAll) area.querySelectorAll('input[id], select[id], textarea[id]').forEach(function(el){
      if(el.type === 'file') return;
      kept[el.id] = (el.type === 'checkbox' || el.type === 'radio') ? el.checked : el.value;
    });
  }catch(e){}
  fn();
  try{
    Object.keys(kept).forEach(function(id){
      var el = document.getElementById(id);
      if(!el) return;
      if(el.type === 'checkbox' || el.type === 'radio') el.checked = kept[id]; else el.value = kept[id];
    });
  }catch(e){}
}

/* ---------- the Live scoring section ---------- */
function liveOption(v, cur, label){ return '<option value="' + escText(v) + '"' + (String(v) === String(cur) ? ' selected' : '') + '>' + label + '</option>'; }
function liveCheckRow(id, on, labelKey, hintKey, key){
  return '<div class="toggle-row" style="margin:8px 0 2px"><input type="checkbox" id="' + id + '" ' + (on ? 'checked' : '') +
      ' onchange="liveSetBool(\'' + key + '\',this.checked)"> <label for="' + id + '">' + T(labelKey) + '</label></div>' +
    '<div class="hint" style="margin:0 0 8px 32px">' + T(hintKey) + '</div>';
}
function liveSettingsBodyHTML(){
  var d = liveDraftGet(), s = d.scoring, live = s.mode === 'live';
  var unit = state.eventCreation.competitionUnit;
  var groups = unit === 'Doubles' || unit === 'Trios' || unit === 'Quads' || unit === 'Teams';
  var card = function(mode, titleKey, textKey){
    return '<div class="choice' + (s.mode === mode ? ' selected' : '') + '" onclick="liveSetMode(\'' + mode + '\')"><strong>' + T(titleKey) + '</strong><small>' + T(textKey) + '</small></div>';
  };
  return '<p class="intro" style="margin-top:0">' + T('live.intro') + '</p>' +
    '<div class="field"><label>' + T('live.mode') + '</label><div class="options">' +
      card('manual', 'live.manual', 'live.manualText') + card('live', 'live.liveOpt', 'live.liveText') +
    '</div></div>' +
    (live ?
      liveCheckRow('f_live_marker', s.markerCheckIn, 'live.set.marker', 'live.set.markerHint', 'markerCheckIn') +
      liveCheckRow('f_live_checkout', s.checkoutHints, 'live.set.checkout', 'live.set.checkoutHint', 'checkoutHints') +
      (groups ? '<div class="field" style="margin-top:8px;max-width:420px"><label>' + T('live.set.order') + '</label><select id="f_live_order" onchange="liveSetOrder(this.value)">' +
        liveOption('everyLeg', s.orderRule, T('live.order.everyLeg')) + liveOption('carryOver', s.orderRule, T('live.order.carryOver')) +
        '</select></div>' : '') +
      liveCheckRow('f_live_approve', s.officialsApprove, 'live.set.approve', 'live.set.approveHint', 'officialsApprove') +
      liveCheckRow('f_live_stats', s.publicStats, 'live.set.stats', 'live.set.statsHint', 'publicStats') +
      '<div class="hint" style="margin-top:10px">' + T('live.namesNote') + '</div>' +
      '<div class="hint">' + T('live.gameNote') + '</div>'
      : '');
}
/* The section itself: only on a saved event (step 2 is reached after step 1 is saved), collapsed by default like the others. */
function liveSettingsSectionHTML(){
  if(!state || !state.eventCreation || !state.eventCreation.saved) return '';
  return collapsibleSectionHTML('live', T('live.title'), '', liveSettingsBodyHTML());
}
function liveSetBool(key, v){
  var s = liveDraftGet().scoring;
  if(key in s && typeof s[key] === 'boolean') s[key] = !!v;
}
function liveSetOrder(v){
  var s = liveDraftGet().scoring;
  if(v === 'everyLeg' || v === 'carryOver') s.orderRule = v;
}
function liveSetMode(mode){
  var d = liveDraftGet();
  mode = mode === 'live' ? 'live' : 'manual';
  if(d.scoring.mode === mode) return;
  if(mode === 'manual' && LiveSettings.isLive(state) && liveHasPlayingMatch(state)){
    openModal({ title: T('live.backRefusedTitle'), body: T('live.backRefused'), confirmLabel: T('m.ok'), confirmClass: 'primary', onConfirm: function(){} });
    return;
  }
  d.scoring.mode = mode;
  liveKeepFields(render);
}

/* ---------- game boxes, one per stage (spec section 5) ---------- */
var LIVE_GAME_LIST = ['301', '501', '701', '1001', 'cricket'];
function liveGameLabel(g){ return g === 'cricket' ? T('live.game.cricket') : g; }
function liveHasX01(game){
  var list = liveIsPlain(game) ? game.pattern : [game];
  return list.some(function(g){ return g !== 'cricket'; });
}
function liveStoredBox(key, create){
  var g = liveDraftGet().games;
  if(key === 'knockout.main' || key === 'knockout.plate'){
    var sub = key.slice(9);
    if(!liveIsPlain(g.knockout)){ if(!create) return undefined; g.knockout = {}; }
    if(!liveIsPlain(g.knockout[sub])){ if(!create) return undefined; g.knockout[sub] = {}; }
    return g.knockout[sub];
  }
  if(!liveIsPlain(g[key])){ if(!create) return undefined; g[key] = {}; }
  return g[key];
}
/* "knockout.main" -> { key, ri: null }; "knockout.main@2" -> { key, ri: 2 } (the third round's own override). */
function liveParseTarget(t){
  var m = /^([^@]+)(?:@(\d+))?$/.exec(String(t));
  return { key: m ? m[1] : '', ri: m && m[2] != null ? parseInt(m[2], 10) : null };
}
function liveEffective(key, ri){ return LiveSettings.gameOf(liveDraftEvent(), key, ri === null ? undefined : ri); }
/* The in/out that goes with a newly chosen game: the new game's default if the old one was on its own default, else kept. */
function liveInOutAfter(eff, game){
  return eff.inOut === LiveSettings.defaultInOut(eff.game) ? LiveSettings.defaultInOut(game) : eff.inOut;
}
function liveRedrawBox(key){
  var el = document.querySelector ? document.querySelector('.live-game-box[data-stage="' + key + '"]') : null;
  if(el) el.innerHTML = liveGameBoxInnerHTML(key);
  if(typeof updateStage2Timing === 'function') updateStage2Timing();
}
/* Writes one field of a stage's game (always a complete game: in/out is explicit). field: game | inOut | bull | decider. */
function liveSetStage(key, field, value){
  var cur = liveEffective(key, null), n = { game: cur.game, inOut: cur.inOut, bull: cur.bull, decider: cur.decider };
  if(field === 'game'){ n.inOut = liveInOutAfter(cur, value); n.game = value; }
  else n[field] = value;
  var c = LiveSettings.cleanGame(n), box = liveStoredBox(key, true);
  box.game = c.game; box.inOut = c.inOut; box.bull = c.bull; box.decider = c.decider;
  liveRedrawBox(key);
}
/* Writes one field of one round's override of a knockout bracket. An empty value takes the field back to "same as the bracket".
   A game chosen for a round always comes with an explicit in/out (a game without one would fall back to that game's default). */
function liveSetRound(key, ri, field, value){
  if(!(ri >= 0 && ri < LiveSettings.MAX_ROUNDS)) return;
  var box = liveStoredBox(key, true);
  var arr = Array.isArray(box.byRound) ? box.byRound.slice() : [];
  while(arr.length <= ri) arr.push(null);
  var part = liveIsPlain(arr[ri]) ? Object.assign({}, arr[ri]) : {};
  var eff = liveEffective(key, ri);
  if(field === 'game'){
    if(value === ''){ delete part.game; delete part.inOut; }   // the in/out went with the game
    else { part.inOut = liveInOutAfter(eff, value); part.game = value; }
  } else if(value === '') delete part[field];
  else part[field] = value;
  var c = LiveSettings.cleanGameKeys(part);
  arr[ri] = Object.keys(c).length ? c : null;
  while(arr.length && arr[arr.length - 1] === null) arr.pop();
  if(arr.length) box.byRound = arr; else delete box.byRound;
  liveRedrawBox(key);
}
function liveWrite(target, field, value){
  var t = liveParseTarget(target);
  if(t.ri === null) liveSetStage(t.key, field, value); else liveSetRound(t.key, t.ri, field, value);
}
/* The game picker chose: a single game, "mixed" (a pattern; starts with the current x01 and Cricket) or, for a round, "" (the bracket's). */
function liveGameChosen(target, v){
  var t = liveParseTarget(target);
  if(v === 'mixed'){
    var cur = liveEffective(t.key, t.ri);
    var x = typeof cur.game === 'string' ? cur.game : null;
    v = { pattern: x && x !== 'cricket' ? [x, 'cricket'] : ['501', 'cricket'] };
  }
  liveWrite(target, 'game', v);
}
/* A change in a mixed pattern. op: set (slot i becomes v) | add | del (slot i). A mixed match uses one x01 only, so choosing
   another x01 in one slot changes every x01 slot to it. */
function liveGamePattern(target, op, i, v){
  var t = liveParseTarget(target), cur = liveEffective(t.key, t.ri);
  var list = liveIsPlain(cur.game) ? cur.game.pattern.slice() : [cur.game, 'cricket'];
  if(op === 'set' && LIVE_GAME_LIST.indexOf(v) >= 0 && i >= 0 && i < list.length){
    list[i] = v;
    if(v !== 'cricket') list = list.map(function(g){ return g === 'cricket' ? g : v; });
  } else if(op === 'add' && list.length < 8) list.push('cricket');
  else if(op === 'del' && list.length > 2 && i >= 0 && i < list.length) list.splice(i, 1);
  else return;
  liveWrite(target, 'game', { pattern: list });
}
function liveToggleByRound(key){
  var d = liveDraftGet(), box = liveStoredBox(key, false);
  var has = !!(box && Array.isArray(box.byRound) && box.byRound.length);
  d.open[key] = !(d.open[key] === undefined ? has : d.open[key]);
  liveRedrawBox(key);
}

/* The pickers. target: a stage key, or "key@round" for a round's own override. */
function liveGameSelectHTML(target, game, withSame){
  var mixed = liveIsPlain(game), cur = game === undefined ? '' : (mixed ? 'mixed' : game);
  return '<select style="width:auto" aria-label="' + T('live.game') + '" onchange="liveGameChosen(\'' + target + '\',this.value)">' +
    (withSame ? liveOption('', cur, T('live.sameAsBracket')) : '') +
    LIVE_GAME_LIST.map(function(g){ return liveOption(g, cur, liveGameLabel(g)); }).join('') +
    liveOption('mixed', cur, T('live.game.mixed')) + '</select>';
}
function livePatternHTML(target, game){
  var list = game.pattern;
  return '<div class="live-pattern" style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:6px 0 2px">' +
    '<span style="font-size:11px;color:var(--muted)">' + T('live.pattern') + '</span>' +
    list.map(function(g, i){
      return '<select style="width:auto" aria-label="' + T('live.patternGame', { n: i + 1 }) + '" onchange="liveGamePattern(\'' + target + '\',\'set\',' + i + ',this.value)">' +
        LIVE_GAME_LIST.map(function(x){ return liveOption(x, g, liveGameLabel(x)); }).join('') + '</select>' +
        '<button type="button" class="btn danger team-seg-btn" ' + (list.length <= 2 ? 'disabled ' : '') + 'onclick="liveGamePattern(\'' + target + '\',\'del\',' + i + ')" aria-label="' + T('live.patternDel', { n: i + 1 }) + '">✕</button>';
    }).join('') +
    '<button type="button" class="btn ghost" ' + (list.length >= 8 ? 'disabled ' : '') + 'onclick="liveGamePattern(\'' + target + '\',\'add\')">' + T('live.patternAdd') + '</button>' +
  '</div><div class="hint" style="margin:0 0 6px">' + T('live.patternHint') + '</div>';
}
function liveInOutSelectHTML(target, inOut, withSame){
  return '<select style="width:auto" aria-label="' + T('live.inOut') + '" onchange="liveWrite(\'' + target + '\',\'inOut\',this.value)">' +
    (withSame ? liveOption('', inOut === undefined ? '' : inOut, T('live.sameAsBracket')) : '') +
    liveOption('DIDO', inOut, T('live.inOut.DIDO')) + liveOption('SIDO', inOut, T('live.inOut.SIDO')) + '</select>';
}
function liveDeciderSelectHTML(target, v, withSame){
  return '<select style="width:auto" aria-label="' + T('live.decider') + '" onchange="liveWrite(\'' + target + '\',\'decider\',this.value)">' +
    (withSame ? liveOption('', v === undefined ? '' : v, T('live.sameAsBracket')) : '') +
    ['alternate', 'bull', 'choice'].map(function(x){ return liveOption(x, v, T('live.decider.' + x)); }).join('') + '</select>';
}

/* How many rounds a knockout bracket has (or will have): the drawn bracket's, else worked out from the entries. At most 12. */
function liveRoundCount(key){
  var br = key === 'knockout.main' ? state.knockout : state.knockoutLosers;
  if(br && Array.isArray(br.rounds) && br.rounds.length) return Math.min(br.rounds.length, LiveSettings.MAX_ROUNDS);
  var f = state.format, n = state.entriesList.filter(function(e){ return !e.withdrawn; }).length || parseInt(state.eventCreation.entries) || 0, count = n;
  if(f.formatType === 'rrknockout'){
    var qEl = document.getElementById ? document.getElementById('f_qualifiers') : null;
    var q = Math.max(1, parseInt(qEl && qEl.value != null && qEl.value !== '' ? qEl.value : f.qualifiersPerGroup, 10) || 2);
    var groups = state.groups.length || recommendGroups(n).groups;
    var main = Math.min(n, groups * q);
    if(key === 'knockout.main') count = main;
    else {
      var pq = parseInt(f.plateQualifiersPerGroup, 10);
      count = pq > 0 ? Math.min(n - main, groups * pq) : n - main;
    }
  }
  var size = nearestBracket(Math.max(2, count)).size;
  return Math.max(1, Math.min(LiveSettings.MAX_ROUNDS, Math.round(Math.log(size) / Math.LN2)));
}
function liveRoundName(rounds, ri){
  var fake = []; for(var i = 0; i < rounds; i++) fake.push(new Array(Math.pow(2, rounds - i - 1)));
  return koRoundName({ rounds: fake }, ri);
}
/* The "set by round" table of a knockout bracket (D19): a game, in/out and deciding leg per round, each "same as the bracket" until set. */
function liveByRoundHTML(key){
  var box = liveStoredBox(key, false), over = box && Array.isArray(box.byRound) ? box.byRound : [];
  var real = liveRoundCount(key), rounds = Math.max(real, Math.min(over.length, LiveSettings.MAX_ROUNDS));
  var rows = '';
  for(var ri = 0; ri < rounds; ri++){
    var part = LiveSettings.cleanGameKeys(over[ri]), target = key + '@' + ri;
    var name = ri < real ? liveRoundName(real, ri) : T('live.round', { n: ri + 1 });
    var lab = function(k){ return '<span style="font-size:11px;color:var(--muted)">' + T(k) + '</span>'; };
    rows += '<div style="padding:8px 12px;' + (ri ? 'border-top:1px solid var(--line)' : '') + '">' +
      '<div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px"><b style="font-size:12px;min-width:110px">' + escText(name) + '</b>' +
        lab('live.game') + liveGameSelectHTML(target, part.game, true) + lab('live.inOut') +
        ('game' in part ? liveInOutSelectHTML(target, part.inOut !== undefined ? part.inOut : LiveSettings.defaultInOut(part.game), false) : liveInOutSelectHTML(target, part.inOut, true)) +
        lab('live.decider') + liveDeciderSelectHTML(target, part.decider, true) +
      '</div>' + (liveIsPlain(part.game) ? livePatternHTML(target, part.game) : '') + '</div>';
  }
  return '<div style="border:1px solid var(--line);border-radius:8px;overflow:hidden;margin-top:8px">' + rows + '</div>' +
    '<div class="hint" style="margin-top:6px">' + T('live.byRoundHint') + '</div>';
}
function liveGameBoxInnerHTML(key){
  var g = liveEffective(key, null), ko = key === 'knockout.main' || key === 'knockout.plate';
  var box = liveStoredBox(key, false), has = !!(box && Array.isArray(box.byRound) && box.byRound.length);
  var open = ko && (liveDraftGet().open[key] === undefined ? has : liveDraftGet().open[key]);
  var x01 = liveHasX01(g.game);
  return '<div style="font-size:12px;font-weight:800;margin-bottom:6px">' + T('live.stage.' + key) + '</div>' +
    '<div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px">' +
      '<span style="font-size:11px;color:var(--muted)">' + T('live.game') + '</span>' + liveGameSelectHTML(key, g.game, false) +
      (x01 ? '<span style="font-size:11px;color:var(--muted)">' + T('live.inOut') + '</span>' + liveInOutSelectHTML(key, g.inOut, false) : '') +
      '<span style="font-size:11px;color:var(--muted)">' + T('live.bull') + '</span>' +
      '<select style="width:auto" aria-label="' + T('live.bull') + '" onchange="liveWrite(\'' + key + '\',\'bull\',this.value)">' + liveOption('coin', g.bull, T('live.bull.coin')) + liveOption('first', g.bull, T('live.bull.first')) + '</select>' +
      '<span style="font-size:11px;color:var(--muted)">' + T('live.decider') + '</span>' + liveDeciderSelectHTML(key, g.decider, false) +
    '</div>' +
    (liveIsPlain(g.game) ? livePatternHTML(key, g.game) : '') +
    (ko ? '<div style="margin-top:8px"><a style="font-size:12px;text-decoration:underline;cursor:pointer;color:var(--muted)" onclick="liveToggleByRound(\'' + key + '\')">' +
        T(open ? 'live.byRoundHide' : 'live.byRound') + '</a></div>' + (open ? liveByRoundHTML(key) : '') : '');
}
/* A stage's game boxes: empty on a Manual event (and on Teams, whose segments carry the game), so those screens are unchanged.
   stageKey: rr | knockout.main | knockout.plate | pod | finals. */
function gameFieldsHTML(stageKey){
  if(!liveDraftIsLive() || isTeamsEvent(state)) return '';
  return '<div class="field live-game-box" data-stage="' + stageKey + '" style="margin-top:10px;padding:10px 12px;border:1px solid var(--line);border-radius:8px">' + liveGameBoxInnerHTML(stageKey) + '</div>';
}

/* ---------- Teams: a game and an in/out on each segment (and the tie-breaker) ---------- */
/* key: a segment's index, or 'tb'. Empty on a Manual event. */
function liveSegmentFieldsHTML(seg, key, name){
  if(!liveDraftIsLive()) return '';
  var ev = { format: key === 'tb' ? { teamTieBreaker: seg } : { teamSegments: [seg] } };
  var g = LiveSettings.gameOf(ev, key === 'tb' ? 'team:tiebreak' : 'team:0');
  var arg = key === 'tb' ? '\'tb\'' : String(key);
  var cricket = g.game === 'cricket';
  var dis = (key === 'tb' ? !teamTieBreakerDefEditable(state) : teamSegmentsLocked(state)) ? ' disabled' : '';
  return '<select style="width:auto"' + dis + ' aria-label="' + T('live.seg.game', { name: name }) + '" onchange="liveSetSegmentGame(' + arg + ',this.value)">' +
      liveOption('x01', cricket ? 'cricket' : 'x01', T('live.seg.x01')) + liveOption('cricket', cricket ? 'cricket' : 'x01', T('live.game.cricket')) + '</select>' +
    (cricket ? '' : '<select style="width:auto"' + dis + ' aria-label="' + T('live.seg.inOut', { name: name }) + '" onchange="liveSetSegmentInOut(' + arg + ',this.value)">' +
      liveOption('DIDO', g.inOut, T('live.inOut.DIDO')) + liveOption('SIDO', g.inOut, T('live.inOut.SIDO')) + '</select>');
}
function liveSegmentOf(key){
  var d = teamDraft();
  return key === 'tb' ? d.tieBreaker : d.segments[key];
}
function liveSetSegmentGame(key, v){
  if(key === 'tb' ? !teamTieBreakerDefEditable(state) : teamSegmentsLocked(state)) return;
  var seg = liveSegmentOf(key);
  if(!seg) return;
  seg.game = v === 'cricket' ? 'cricket' : 'x01';
  redrawTeamSegEditor();
}
function liveSetSegmentInOut(key, v){
  if(key === 'tb' ? !teamTieBreakerDefEditable(state) : teamSegmentsLocked(state)) return;
  var seg = liveSegmentOf(key);
  if(seg && (v === 'DIDO' || v === 'SIDO')) seg.inOut = v;
}

/* ---------- names checklist (steps 3 and 4, Live events only; spec section 6) ---------- */
/* How many player names an entry has, and how many it needs: Singles 1, Doubles 2, Trios 3, Quads 4 (Teams have no roster). */
function liveNamesNeeded(unit){ return unit === 'Singles' ? 1 : (typeof plGroupSize === 'function' ? plGroupSize(unit) : 0); }
function liveNamesHave(e, unit){
  if(Array.isArray(e.members)) return e.members.filter(function(m){ return !!libCleanName(m && m.name); }).length;
  if(unit !== 'Singles') return 0;
  var name = libCleanName(e.name);
  /* an older Singles entry is its name; a placeholder ("Player A1") is not a player */
  return name && e.autoName !== true && !(e.autoName !== false && AUTO_NAME_RE.test(name)) ? 1 : 0;
}
function liveEntriesMissingNames(t){
  var unit = t.eventCreation.competitionUnit, need = liveNamesNeeded(unit), out = [];
  if(!need) return out;
  (t.entriesList || []).forEach(function(e){
    if(!e || e.withdrawn) return;
    var have = liveNamesHave(e, unit);
    if(have < need) out.push({ entry: e, have: have, need: need });
  });
  return out;
}
function liveNamesChecklistHTML(){
  if(!state || !LiveSettings.isLive(state)) return '';
  var missing = liveEntriesMissingNames(state);
  if(!missing.length) return '';
  var unit = state.eventCreation.competitionUnit, canEdit = !!liveNamesNeeded(unit) && unit !== 'Singles' && !isLocked(state) && !libDrawExists(state);
  return '<div class="card"><h2>' + T('live.names.title') + '</h2><p class="intro">' + T('live.names.intro') + '</p>' +
    '<div class="checkin-list">' + missing.map(function(m){
      return '<div style="display:flex;align-items:center;gap:9px;padding:7px 4px;border-top:1px solid var(--line)">' +
        '<span style="flex:1"><b>' + escText(m.entry.name || T('live.names.unnamed')) + '</b></span>' +
        '<span class="hint" style="margin:0">' + T('live.names.row', { have: m.have, need: m.need }) + '</span>' +
        (canEdit ? '<button class="btn ghost" style="padding:5px 10px;font-size:11px" onclick="openPairDialog(\'' + escJs(m.entry.id) + '\')">' + T('pl.edit') + '</button>' : '') +
      '</div>';
    }).join('') + '</div></div>';
}

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

/* Switching back to Manual is refused while a match is being scored on a device (spec 4). The count comes from the Boards panel's
   server (a fresh read each time: step 5's copy is not kept up to date while this step is open). Resolves to the number of matches
   in progress, 0 when Live scoring was never set up (nothing can be playing), or -1 when that could not be found out. */
function liveFetchPlayingCount(){
  if(!state || !state.id) return Promise.resolve(0);
  return apiFetch(LIVE_PANEL_API + '?t=' + encodeURIComponent(state.id)).then(function(r){
    return r.json().catch(function(){ return {}; }).then(function(b){
      if(r.ok) return b && b.playingCount > 0 ? b.playingCount : 0;
      return b && b.code === 'live_not_set_up' ? 0 : -1;
    });
  }).catch(function(){ return -1; });
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
  if(mode === 'manual' && LiveSettings.isLive(state)){
    var id = state.id;
    liveFetchPlayingCount().then(function(n){
      if(!state || state.id !== id || currentStage !== 2) return;
      if(n !== 0){
        openModal({ title: T('live.backRefusedTitle'), body: n > 0 ? T('live.backRefusedN', { n: n }) : T('live.backCheckFailed'), confirmLabel: T('m.ok'), confirmClass: 'primary', onConfirm: function(){}, help: false });
        return;
      }
      liveDraftGet().scoring.mode = mode;
      liveKeepFields(render);
    });
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

/* ---------- the Boards panel (step 5, Live events only; spec section 7) ----------
   The card under Floor officials: the event's one scoring login, the boards (what is playing, what waits, which devices), the
   devices signed in, lending a board and logging a device out. Everything comes from /api/live/panel (organiser session); the
   card reads it with loadLive and redraws only itself, so nothing typed elsewhere on step 5 is disturbed. It refreshes every 10 s
   while step 5 is on screen and the page is visible (liveSyncPolling, called after each draw), and the timer is gone as soon as
   either stops being true. The take-over inbox sits above the boards: each waiting request from a tablet, with Allow / Deny (op
   'takeover'). While another step is open the Stage 5 tab in the sidebar still shows how many requests wait (a small number):
   a light poll (/api/live/panel?brief=1, every 20 s, only while the page is visible and the event is Live and step 5 is NOT on
   screen; one timer, stopped by the same checks). Match history (spec 7.5; a block under the boards, a History button on a board's
   playing match; a modal per match with every turn and correction, Restore, the Disputed flag and the take-over log) and Close event
   (spec 7.6; the last block: a modal that first lists what stands in the way, then closes). A closed event shows a "Closed" note and
   keeps only the history. Knockout boards (spec section 9, D7): a block under the boards lists each knockout round that has matches
   ready (both players known) but no board, with a suggested board per match (LiveBoards.suggestKnockoutBoards: the board of the match's
   feeder, else the group's board, else the board idle longest; a board is free when no match is playing or held on it) in a box the
   organiser can change; Confirm round writes the chosen boards into the event itself (the same m.board the Board box of a knockout
   match edits) with the normal persist() and render(). Nothing is written before that. "Scored on paper" (spec 10.5, D16): a switch
   in the result windows (livePaperRowHTML), op 'paper' on the same route. */
var liveState = { id: null, data: null, loading: false, error: '', shown: false };   // shown: the password is on screen
var LIVE_PANEL_API = '/api/live/panel';
var liveTimer = null;
var liveBadge = { id: null, n: 0, busy: false, offId: null };   // waiting take-over requests of the open event (the Stage 5 tab's number)
var liveBriefTimer = null, LIVE_BRIEF_MS = 20000;
var liveAnswering = {};   // take-over requests being answered right now (a double tap answers once)

/* The card is for a saved, Live event that is not the sample. A FINALISED event keeps it in a reduced "closing" mode (spec 7.6: finalising
   does not log devices out, so the organiser must still be able to close the event): the devices (read only), Close event and the
   history (read only). Nothing else on it can be changed after finalising (the server answers 403 finalized to every other op). */
function liveBoardsOn(){
  return !!state && !state.isSample && !!state.id && !!state.eventCreation && !!state.eventCreation.saved && LiveSettings.isLive(state);
}
function loadLive(force){
  if(!liveBoardsOn()) return;
  if(!force && liveState.id === state.id && (liveState.data || liveState.loading || liveState.error)) return;
  if(liveState.id !== state.id){ liveState.data = null; liveState.error = ''; liveState.shown = false; }
  liveState.id = state.id; liveState.loading = true;
  var id = state.id;
  apiFetch(LIVE_PANEL_API + '?t=' + encodeURIComponent(id)).then(function(r){ return r.json().catch(function(){ return {}; }).then(function(b){ return { r: r, b: b }; }); }).then(function(x){
    if(liveState.id !== id) return;
    liveState.loading = false;
    if(x.r.ok){
      liveState.data = x.b; liveState.error = '';
      liveBadgeSet(id, (x.b && x.b.takeovers || []).length);   // on step 5 this card's own poll keeps the tab's number current
      liveRedraw();   // every poll: "seen 20 s ago" and the red late flag come from the clock, so a quiet device must age on screen (the card is small and the redraw is only the card)
    } else { liveState.error = (x.b && x.b.code) || 'request_failed'; liveRedraw(); }
  }).catch(function(){ if(liveState.id === id){ liveState.loading = false; liveState.error = 'offline'; liveRedraw(); } });
}
/* Draws the card again where it is (or the whole page when it is not there yet and step 5 is open). */
function liveRedraw(){
  if(!state || currentStage !== 5 || popoutMode) return;
  var el = typeof document !== 'undefined' && document.getElementById ? document.getElementById('liveBoards') : null;
  if(el && liveBoardsOn() && liveState.id === state.id){
    /* never swap the card out from under a box someone is typing in or choosing from (an input, select or textarea inside it) */
    var ae = document.activeElement;
    if(ae && el.contains && el.contains(ae) && /^(INPUT|SELECT|TEXTAREA)$/.test(String(ae.tagName || '').toUpperCase())) return;
    el.outerHTML = liveBoardsHTML();
  } else render();
}
function liveWantsPolling(){
  return liveBoardsOn() && currentStage === 5 && !popoutMode && typeof document !== 'undefined' && !document.hidden &&
    !!(document.getElementById && document.getElementById('liveBoards'));
}
function liveStopPolling(){ if(liveTimer){ clearInterval(liveTimer); liveTimer = null; } }
function liveTick(){
  if(!liveWantsPolling()){ liveStopPolling(); return; }
  if(netOffline || liveState.loading) return;
  loadLive(true);
}
/* Starts or stops the 10 s refresh (step 5) and the 20 s light poll (any other step): after every draw of the page, and when the page is shown or hidden. */
function liveSyncPolling(){
  if(typeof setInterval !== 'function') return;   // the server's copy of the app has no timers
  if(!liveWantsPolling()) liveStopPolling();
  else if(!liveTimer){ liveTimer = setInterval(liveTick, 10000); liveTick(); }   // coming back to step 5 shows what is current, not what was last seen
  if(!liveBriefWants()){ liveBriefStop(); return; }
  if(!liveBriefTimer){ liveBriefTimer = setInterval(liveBriefTick, LIVE_BRIEF_MS); liveBriefTick(); }
}

/* ---------- the Stage 5 tab's number (waiting take-over requests) ---------- */
function liveBadgeCount(){ return liveBoardsOn() && !isLocked(state) && liveBadge.id === state.id ? liveBadge.n : 0; }
function liveBadgeSet(id, n){
  liveBadge.id = id; liveBadge.n = n > 0 ? n : 0;
  liveBadgeRender();
}
function liveBadgeTitle(n){ return T('lb.tk.badge', { n: n }); }
/* The number as markup, for a list that is built as text (the compact menu's step 5 line); empty when nothing waits. */
function liveBadgeHTML(){
  var n = liveBadgeCount();
  return n ? ' <span class="live-badge live-badge-inline" title="' + escapeHtml(liveBadgeTitle(n)) + '">' + n + '</span>' : '';
}
/* Writes the number into the sidebar's tab (#navbadge5) and any copy of it in the compact menu. */
function liveBadgeRender(){
  if(typeof document === 'undefined' || !document.getElementById) return;
  try{
    var n = liveBadgeCount();
    var el = document.getElementById('navbadge5');
    if(el){
      el.textContent = n ? String(n) : '';
      el.hidden = !n;
      if(n) el.setAttribute('title', liveBadgeTitle(n)); else el.removeAttribute('title');
    }
    if(document.querySelectorAll) Array.prototype.forEach.call(document.querySelectorAll('.compact-item .live-badge-inline'), function(x){
      if(n){ x.textContent = String(n); x.setAttribute('title', liveBadgeTitle(n)); } else if(x.parentNode) x.parentNode.removeChild(x);
    });
  }catch(e){}
}
/* The light poll runs only for an open, saved, Live, unfinalized event, on a step other than 5 (step 5's card has its own poll), while
   the page is visible and the Live tables exist. */
function liveBriefWants(){
  return liveBoardsOn() && !isLocked(state) && currentStage !== 5 && !popoutMode && typeof document !== 'undefined' && !document.hidden && liveBadge.offId !== state.id;
}
function liveBriefStop(){ if(liveBriefTimer){ clearInterval(liveBriefTimer); liveBriefTimer = null; } }
function liveBriefTick(){
  if(!liveBriefWants()){ liveBriefStop(); return; }
  if(netOffline || liveBadge.busy) return;
  var id = state.id;
  liveBadge.busy = true;
  apiFetch(LIVE_PANEL_API + '?t=' + encodeURIComponent(id) + '&brief=1').then(function(r){
    return r.json().catch(function(){ return {}; }).then(function(b){
      liveBadge.busy = false;
      if(!state || state.id !== id) return;
      if(r.ok) liveBadgeSet(id, b && b.takeovers > 0 ? Math.floor(b.takeovers) : 0);
      else if(b && b.code === 'live_not_set_up'){ liveBadge.offId = id; liveBadgeSet(id, 0); }   // nothing can be waiting: stop asking
    });
  }).catch(function(){ liveBadge.busy = false; });
}
if(typeof document !== 'undefined' && typeof document.addEventListener === 'function'){
  document.addEventListener('visibilitychange', function(){
    liveSyncPolling();
    if(liveTimer && !document.hidden) liveTick();   // back on the page: bring the card up to date at once
    if(liveBriefTimer && !document.hidden) liveBriefTick();
  });
}

/* One call that changes something; the answer is the whole panel again. Returns it, or null after saying what went wrong (in a
   box of its own, or, when onError is given, by calling onError(text): the history window says it inside itself). */
async function liveCall(body, onError){
  if(needsConnection()) return null;
  var id = state.id, r = null, b = {};
  try{ r = await apiFetch(LIVE_PANEL_API, { method: 'POST', body: JSON.stringify(Object.assign({ t: id }, body)) }); b = await r.json().catch(function(){ return {}; }); }catch(e){ r = null; }
  if(!r || !r.ok){
    if(onError){ onError(ddApiError(b, T('lb.err.request'))); loadLive(true); return null; }
    openModal({ title: T('lb.title'), body: escapeHtml(ddApiError(b, T('lb.err.request'))), confirmLabel: T('m.ok'), confirmClass: 'primary', onConfirm: function(){}, help: false });
    loadLive(true);   // what the refusal was about may be out of date here
    return null;
  }
  if(state && state.id === id){ liveState.id = id; liveState.data = b; liveState.error = ''; liveBadgeSet(id, (b && b.takeovers || []).length); liveRedraw(); }
  return b;
}
/* Allow or deny a waiting take-over request (the answer is final: the first answer, from here or from a floor official, wins). */
function liveTakeover(id, answer){
  if(liveAnswering[id]) return;
  liveAnswering[id] = true;
  liveCall({ op: 'takeover', id: id, answer: answer }).then(function(){ delete liveAnswering[id]; }, function(){ delete liveAnswering[id]; });
}
function liveEnable(){ liveCall({ op: 'enable' }); }
function liveTogglePassword(){ liveState.shown = !liveState.shown; liveRedraw(); }
function liveCopyLogin(){
  var lg = liveState.data && liveState.data.login;
  if(!lg) return;
  var ec = state.eventCreation || {};
  var text = T('lb.loginMsg', { event: [ec.tournamentName, ec.eventName].filter(Boolean).join(' — '), user: lg.username, pass: lg.password });
  var ok = function(){ openModal({ title: T('lb.title'), body: escapeHtml(T('lb.copied')), confirmLabel: T('m.ok'), confirmClass: 'primary', onConfirm: function(){}, help: false }); };
  if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, function(){ window.prompt(T('pub.copyThis'), text); });
  else window.prompt(T('pub.copyThis'), text);
}
function liveNewPasswordModal(){
  var n = liveState.data ? liveState.data.playingCount || 0 : 0;
  openModal({ title: T('lb.newPassword'), body: escapeHtml(T('lb.newPasswordBody')) + (n ? '</p><p>' + escapeHtml(T('lb.newPasswordPlaying', { n: n })) : ''),
    confirmLabel: T('lb.newPassword'), confirmClass: 'danger', help: false,
    onConfirm: function(){ liveCall({ op: 'newPassword' }); } });
}
/* A device's name on screen: its place in the event's list of devices ("Device 3"), as the server lists them. */
function liveDeviceName(id){
  var list = (liveState.data && liveState.data.devices) || [];
  for(var i = 0; i < list.length; i++) if(list[i].id === id) return T('lb.deviceN', { n: i + 1 });
  return T('lb.deviceN', { n: '?' });
}
function liveLogoutModal(id){
  var name = escapeHtml(liveDeviceName(id));
  openModal({ title: T('lb.logoutTitle', { name: name }), body: escapeHtml(T('lb.logoutBody')), confirmLabel: T('lb.logout'), confirmClass: 'danger', help: false,
    onConfirm: function(){ liveCall({ op: 'logout', deviceId: id }); } });
}
function liveEndLend(id){ liveCall({ op: 'endLend', id: id }); }
function liveLendModal(from){
  var d = liveState.data; if(!d) return;
  var opts = d.boards.filter(function(b){ return b.n !== from && b.waiting > 0; });
  if(!opts.length){
    openModal({ title: T('lb.lendTitle', { n: from }), body: escapeHtml(T('lb.lendNone')), confirmLabel: T('m.ok'), confirmClass: 'primary', onConfirm: function(){}, help: false });
    return;
  }
  openModal({ title: T('lb.lendTitle', { n: from }), help: false, bodyHTML:
    '<p>' + escapeHtml(T('lb.lendBody', { n: from })) + '</p>' +
    '<div class="field"><label for="liveLendTo">' + T('lb.lendPick') + '</label><select id="liveLendTo">' +
      opts.map(function(b){ return '<option value="' + b.n + '">' + escapeHtml(T('lb.lendOption', { n: b.n, w: b.waiting })) + '</option>'; }).join('') + '</select></div>',
    confirmLabel: T('lb.lendBtn'), confirmClass: 'primary',
    onConfirm: function(){ var to = parseInt(document.getElementById('liveLendTo').value, 10); if(to > 0) liveCall({ op: 'lend', from: from, to: to }); } });
}

/* How long ago, in words: "just now", "40 s ago", "3 min ago", "2 h ago". */
function liveAgo(iso, now){
  var t = iso ? Date.parse(iso) : NaN;
  if(isNaN(t)) return T('lb.neverSeen');
  var s = Math.max(0, Math.round(((now || Date.now()) - t) / 1000));
  var txt = s < 15 ? T('lb.ago.now') : s < 60 ? T('lb.ago.s', { n: s }) : s < 3600 ? T('lb.ago.m', { n: Math.floor(s / 60) }) : T('lb.ago.h', { n: Math.floor(s / 3600) });
  return T('lb.seen', { ago: txt });
}
function liveDeviceLine(dv, now){
  var seen = liveAgo(dv.lastSeenAt, now);
  var late = dv.lastSeenAt && (now - Date.parse(dv.lastSeenAt)) > 120000;
  return '<span class="hint" style="margin:0' + (late ? ';color:var(--red)' : '') + '">' + escapeHtml(seen) + '</span>' +
    (dv.unsent > 0 ? ' <span class="hint" style="margin:0;color:var(--red);font-weight:700">' + escapeHtml(T('lb.unsent', { n: dv.unsent })) + '</span>' : '');
}
function liveBoardRowHTML(b, d){
  var byId = {};
  d.devices.forEach(function(x){ byId[x.id] = x; });
  var group = b.group ? T('grp.label', { g: escText(b.group) }) : '';
  if(b.ko) group += (group ? ' · ' : '') + T('lb.ko');
  var play = '<span class="hint" style="margin:0">' + T('lb.nothing') + '</span>';
  if(b.playing){
    var p = b.playing, no = p.info && p.info.matchNo != null && p.info.matchNo !== '' ? T('lb.match', { n: escText(p.info.matchNo) }) : '';
    var st = p.state === 'awaitingConfirm' ? T('lb.st.awaitingConfirm') : p.state === 'checkedIn' ? T('lb.st.checkedIn') : '';
    play = '<b>' + escText(p.a) + '</b> v <b>' + escText(p.b) + '</b>' + ((no || st) ? '<div class="hint" style="margin:0">' + [no, st].filter(Boolean).join(' · ') + '</div>' : '') +
      (p.disputed ? '<div style="margin:2px 0 0">' + liveDisputedBadge() + '</div>' : '') +
      '<div style="margin:3px 0 0"><button class="btn ghost fo-btn" onclick="liveHistoryOpen(\'' + escJs(p.pos) + '\')">' + T('lb.history.btn') + '</button></div>';
  }
  var devs = b.devices.length ? b.devices.map(function(id){
    var dv = byId[id];
    return dv ? '<div>' + escapeHtml(liveDeviceName(id)) + ' ' + liveDeviceLine(dv, d.now) + '</div>' : '';
  }).join('') : '<span class="hint" style="margin:0">' + T('lb.noDevice') + '</span>';
  var lendOut = d.lends.filter(function(l){ return l.from === b.n; })[0];
  var lendIn = d.lends.filter(function(l){ return l.to === b.n; });
  var lendTxt = (lendOut ? '<div class="hint" style="margin:2px 0 0">' + T('lb.lentTo', { n: lendOut.to }) + '</div>' : '') +
    lendIn.map(function(l){ return '<div class="hint" style="margin:2px 0 0">' + T('lb.lentFrom', { n: l.from }) + '</div>'; }).join('');
  var btns = d.closedAt ? '' : ((b.devices.length && !lendOut && !b.playing ? '<button class="btn ghost fo-btn" onclick="liveLendModal(' + b.n + ')">' + T('lb.lendTo') + '</button> ' : '') +
    d.lends.filter(function(l){ return l.from === b.n || l.to === b.n; }).map(function(l){
      return '<button class="btn ghost fo-btn" onclick="liveEndLend(\'' + escJs(l.id) + '\')">' + T('lb.endLend') + '</button>';
    }).join(' '));
  return '<tr><td><b>' + b.n + '</b></td><td>' + (group || '<span class="hint" style="margin:0">—</span>') + '</td><td>' + play + '</td><td>' + b.waiting + '</td><td>' + devs + lendTxt + '</td><td>' + btns + '</td></tr>';
}
/* The take-over inbox: a tablet asks for a match another tablet is scoring. "Board 5 tablet wants to take over Match 12 (Board 3)". Nothing
   is drawn while no request waits. */
function liveInboxHTML(d){
  var list = d.takeovers || [];
  if(!list.length) return '';
  return '<div class="lb-inbox" style="padding:10px 0;border-top:1px solid var(--line)"><b>' + T('lb.tk.title') + '</b> <span class="live-badge live-badge-inline">' + list.length + '</span>' +
    '<div class="hint" style="margin:4px 0 6px">' + T('lb.tk.hint') + '</div>' +
    list.map(function(x){
      var who = x.toBoard != null ? T('lb.tk.tablet', { b: x.toBoard }) : T('lb.tk.noBoard');
      var no = x.info && x.info.matchNo != null && x.info.matchNo !== '' ? T('lb.match', { n: escText(x.info.matchNo) }) : T('lb.tk.aMatch');
      var from = x.fromBoard != null ? T('lb.boardN', { n: x.fromBoard }) : T('lb.tk.fromUnknown');
      return '<div class="fo-row" style="padding:6px 0;display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span style="flex:1;min-width:200px">' +
        T('lb.tk.text', { who: '<b>' + escText(who) + '</b>', match: '<b>' + no + '</b>', from: escText(from) }) + '</span>' +
        '<button class="btn primary fo-btn" onclick="liveTakeover(\'' + escJs(x.id) + '\',\'allow\')">' + T('lb.tk.allow') + '</button> ' +
        '<button class="btn ghost fo-btn" onclick="liveTakeover(\'' + escJs(x.id) + '\',\'deny\')">' + T('lb.tk.deny') + '</button></div>';
    }).join('') + '</div>';
}
function liveLoginHTML(d){
  var lg = d.login;
  return '<div style="padding:10px 0;border-top:1px solid var(--line)"><b>' + T('lb.login') + '</b>' +
    '<div style="margin:6px 0">' + T('lb.username') + ': <span class="lb-pass">' + escText(lg.username) + '</span></div>' +
    '<div style="margin:6px 0">' + T('lb.password') + ': <span class="lb-pass">' + (liveState.shown ? escText(lg.password) : '••••••••••••••••') + '</span></div>' +
    '<div class="buttonrow" style="margin:4px 0 0">' +
      '<button class="btn ghost fo-btn" onclick="liveTogglePassword()">' + T(liveState.shown ? 'lb.hide' : 'lb.show') + '</button>' +
      '<button class="btn ghost fo-btn" onclick="liveCopyLogin()">' + T('lb.copy') + '</button>' +
      '<button class="btn ghost fo-btn" style="color:var(--red)" onclick="liveNewPasswordModal()">' + T('lb.newPassword') + '</button>' +
    '</div></div>';
}
function liveBoardsHTML(){
  if(!liveBoardsOn()) return '';
  loadLive(false);
  var d = liveState.data;
  var html = '<div class="card" id="liveBoards"><h2 style="margin:0 0 6px">' + T('lb.title') + '</h2><p class="intro">' + T('lb.intro') + '</p>';
  if(liveState.error === 'live_not_set_up') return html + '<p class="hint">' + T('lb.notSetUp') + '</p></div>';
  if(liveState.error && !d) return html + '<p class="hint">' + T('lb.err.load') + ' <a href="javascript:void(0)" onclick="loadLive(true)">' + T('fo.retry') + '</a></p></div>';
  if(!d) return html + '<p class="hint">' + T('fo.loading') + '</p></div>';
  var fin = isLocked(state);
  if(!d.login && fin) return '';   // finalised before Live scoring was ever turned on: nothing to close
  if(!d.login) return html + '<button class="btn primary" onclick="liveEnable()">' + T('lb.enable') + '</button><p class="hint">' + T('lb.enableHint') + '</p></div>';
  var active = d.devices.filter(function(x){ return !x.loggedOut; }), closed = !!d.closedAt;
  if(closed) html += liveClosedNoteHTML(d);
  else if(fin) html += '<div class="confirm-box finalized-note" style="margin:8px 0">' + T('lb.finalized.note') + '</div>';
  else html += liveLoginHTML(d) + liveInboxHTML(d);
  if(!fin) html += '<div style="padding:10px 0;border-top:1px solid var(--line)"><b>' + T('lb.boards') + '</b>' +
    '<div class="lb-wrap"><table class="lb-table"><thead><tr><th>' + T('lb.col.board') + '</th><th>' + T('lb.col.group') + '</th><th>' + T('lb.col.playing') + '</th><th>' + T('lb.col.waiting') + '</th><th>' + T('lb.col.devices') + '</th><th></th></tr></thead><tbody>' +
    d.boards.map(function(b){ return liveBoardRowHTML(b, d); }).join('') + '</tbody></table></div></div>';
  if(!fin && !closed) html += liveKoBlockHTML(d);
  html += liveHistoryBlockHTML(d);
  if(closed) return html + '</div>';
  html += '<div style="padding:10px 0;border-top:1px solid var(--line)"><b>' + T('lb.devices') + '</b>';
  if(!active.length) html += '<p class="hint">' + T('lb.none') + '</p>';
  else html += active.map(function(dv){
    var i = d.devices.indexOf(dv);
    return '<div class="fo-row" style="padding:6px 0;display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span style="flex:1;min-width:200px"><b>' + escapeHtml(T('lb.deviceN', { n: i + 1 })) + '</b> · ' +
      (dv.board != null ? T('lb.boardN', { n: dv.board }) : '<span class="hint" style="margin:0">' + T('lb.noBoardYet') + '</span>') + ' ' + liveDeviceLine(dv, d.now) + '</span>' +
      (fin ? '' : '<button class="btn ghost fo-btn" style="color:var(--red)" onclick="liveLogoutModal(\'' + escJs(dv.id) + '\')">' + T('lb.logout') + '</button>') + '</div>';
  }).join('');
  html += '</div>';
  html += '<div style="padding:10px 0;border-top:1px solid var(--line)"><b>' + T('lb.close.title') + '</b><div class="hint" style="margin:4px 0 6px">' + T('lb.close.hint') + '</div>' +
    '<button class="btn ghost fo-btn" style="color:var(--red)" onclick="liveCloseModal()">' + T('lb.close.btn') + '</button></div>';
  return html + '</div>';
}

/* ---------- knockout boards (spec 9, D7) ---------- */
var liveKoPick = {};   // pos -> the board the organiser chose in a box (0 = none), kept over the card's redraws until Confirm round
/* The rounds with matches ready and no board: [{ key, ri, bracket, items: [{ pos, mi, m, sug }] }], sug = { board, why } | null.
   A board is free when no match is playing on it and no device holds a match on it. */
function liveKoRounds(){
  var d = liveState.data, out = [];
  if(!state || !d || !d.boards) return out;
  var free = [], idle = {};
  d.boards.forEach(function(b){ if(!b.playing && !b.held) free.push(b.n); idle[b.n] = b.idleSince; });
  [['knockout', state.knockout], ['knockoutLosers', state.knockoutLosers]].forEach(function(x){
    var br = x[1];
    if(!br || !Array.isArray(br.rounds)) return;
    br.rounds.forEach(function(round, ri){
      var rd = { bracketKey: x[0], ri: ri }, ready = LiveBoards.readyKnockoutMatches(state, rd);
      if(!ready.length) return;
      var sug = {};
      LiveBoards.suggestKnockoutBoards(state, rd, free, {}, idle).forEach(function(s){ sug[s.pos] = s; });
      out.push({ key: x[0], ri: ri, bracket: br, items: ready.map(function(r){ return { pos: r.pos, mi: r.mi, m: round[r.mi], sug: sug[r.pos] || null }; }) });
    });
  });
  return out;
}
function liveKoBracketName(key, br){
  return key === 'knockoutLosers' ? T('bg.plate') : (br && br.podFinals ? T('lb.kob.finals') : T('bg.main'));
}
function liveKoBlockHTML(d){
  var rounds = liveKoRounds();
  if(!rounds.length) return '';
  var n = d.boards.length;
  return '<div id="liveKoBlock" style="padding:10px 0;border-top:1px solid var(--line)"><b>' + T('lb.kob.title') + '</b>' +
    '<div class="hint" style="margin:4px 0 6px">' + T('lb.kob.hint') + '</div>' +
    rounds.map(function(r){
      var tag = r.key + ':' + r.ri;
      return '<div class="lb-ko-round" style="margin:8px 0 12px"><div style="font-weight:800;font-size:12px;border-bottom:1px solid var(--line);margin-bottom:2px">' +
        escText(T('lb.kob.round', { bracket: liveKoBracketName(r.key, r.bracket), round: koRoundName(r.bracket, r.ri) })) + '</div>' +
        r.items.map(function(it){
          var picked = liveKoPick[it.pos] !== undefined;
          var chosen = picked ? liveKoPick[it.pos] : (it.sug ? it.sug.board : 0);
          var why = picked ? '' : (it.sug ? T('lb.kob.why.' + it.sug.why) : T('lb.kob.why.none'));
          var opts = '<option value="0"' + (!chosen ? ' selected' : '') + '>' + T('lb.kob.none') + '</option>';
          for(var i = 1; i <= n; i++) opts += '<option value="' + i + '"' + (chosen === i ? ' selected' : '') + '>' + T('lb.boardN', { n: i }) + '</option>';
          return '<div class="fo-row" style="padding:5px 0;display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span style="flex:1;min-width:200px"><b>' +
            escText(bracketEntryName(state, it.m.aEntryId)) + '</b> v <b>' + escText(bracketEntryName(state, it.m.bEntryId)) + '</b> <span class="hint" style="margin:0">' +
            escText(T('lb.match', { n: koMatchTag(r.bracket, state, r.ri, it.mi) })) + '</span></span>' +
            '<select style="width:auto" data-ko="' + escText(tag) + '" data-pos="' + escText(it.pos) + '" aria-label="' + escText(T('fo.koBoard')) + '" onchange="liveKoSet(\'' + escJs(it.pos) + '\',this.value)">' + opts + '</select>' +
            '<span class="hint" style="margin:0;min-width:150px">' + escText(why) + '</span></div>';
        }).join('') +
        '<div class="buttonrow" style="margin:6px 0 0"><button class="btn primary fo-btn" onclick="liveKoConfirm(\'' + escJs(r.key) + '\',' + r.ri + ')">' + T('lb.kob.confirm') + '</button></div></div>';
    }).join('') + '</div>';
}
function liveKoSet(pos, v){ liveKoPick[pos] = parseInt(v, 10) || 0; }
/* Confirm round: the boards in the round's boxes, as they are on screen, become the matches' own boards; one save. */
function liveKoConfirm(key, ri){
  if(!state || isLocked(state)){ if(typeof finalizedBlockModal === 'function') finalizedBlockModal('changed'); return; }
  var br = bracketByKey(state, key), round = br && br.rounds && br.rounds[ri], d = liveState.data;
  if(!round || !d || !d.boards) return;
  var n = d.boards.length, changed = 0, boxes = document.querySelectorAll('#liveKoBlock select[data-ko="' + key + ':' + ri + '"]');
  Array.prototype.forEach.call(boxes, function(sel){
    var pos = sel.getAttribute('data-pos'), mi = parseInt(String(pos).split(':')[3], 10), b = parseInt(sel.value, 10) || 0, m = round[mi];
    delete liveKoPick[pos];
    if(!m || !(b >= 1 && b <= n) || !m.aEntryId || !m.bEntryId || m.winnerId || m.bye || m.void || parseInt(m.board, 10) > 0) return;
    m.board = b; changed++;
  });
  if(!changed){ liveRedraw(); return; }
  persist(); render();
  loadLive(true);
}

/* ---------- Scored on paper (spec 10.5, D16) ---------- */
/* The switch line inside a result window (a round robin or knockout score box) of a Live event; hidden until the server has said where the
   match stands (livePaperLoad). pos: the match's place in the event (rr:<group>:<key> or ko:<bracket>:<round>:<match>). */
function livePaperRowHTML(pos){
  if(!liveBoardsOn() || isLocked(state)) return '';
  return '<div class="live-paper" id="livePaper" data-pos="' + escText(pos) + '" style="display:none;margin:10px 0 0"></div>';
}
function livePaperLoad(pos){
  if(!state || !state.id || !liveBoardsOn() || isLocked(state) || typeof document === 'undefined' || !document.getElementById('livePaper')) return;
  liveMatchLookup(pos).then(function(b){
    var el = document.getElementById('livePaper');
    if(b && el && el.getAttribute('data-pos') === pos) livePaperDraw(b.state === 'paper', '', false);
  });
}
/* The one lookup of a match's live picture (the match history call: GET panel?t=&history=<pos>, which writes nothing). Resolves to
   { state, board, info, a, b, ... } or null when it could not be found out (no signal, not set up, any refusal): a caller then acts as if
   it knew nothing. Used by the paper switch above and by the two result rules below. */
function liveMatchLookup(pos){
  var id = state && state.id;
  if(!id) return Promise.resolve(null);
  return apiFetch(LIVE_PANEL_API + '?t=' + encodeURIComponent(id) + '&history=' + encodeURIComponent(pos)).then(function(r){
    return r.json().catch(function(){ return {}; }).then(function(b){ return r.ok && b ? b : null; });
  }).catch(function(){ return null; });
}
function liveWithin(p, ms){
  return new Promise(function(resolve){
    var done = false, tm = setTimeout(function(){ if(!done){ done = true; resolve(null); } }, ms);
    p.then(function(v){ if(!done){ done = true; clearTimeout(tm); resolve(v); } });
  });
}

/* ---------- the organiser enters a result: a tablet may hold the match (D18), a later match may be under way (D9) ---------- */
/* Live events only (a Manual event never gets either box, and neither does a finalised or offline one). Both rules look first and ask
   in a box; if the look fails nothing is asked (the server still marks the live rows, so a tablet's next call is refused). A tablet
   holds a match from its check-in until the match is over. */
var LIVE_HELD_STATES = ['checkedIn', 'playing', 'awaitingConfirm'];
var liveGuardSeq = 0;
function liveGuardOn(){ return liveBoardsOn() && !isLocked(state) && !netOffline; }
function liveModalOpen(){ var b = document.getElementById('modalBackdrop'); return !!b && b.classList.contains('show'); }
/* What openModal does with the value its Save handler returns, for a handler that was run later (after a look). */
function liveSettleModal(r){
  if(r && r.error){
    var el = document.getElementById('modalErr'), ok = document.getElementById('modalConfirmBtn');
    if(el){ el.textContent = r.error; el.style.display = 'block'; }
    if(ok) ok.disabled = false;
    return;
  }
  if(r && r.keepOpen) return;
  closeModal();
}
/* Before an entered result is saved: if a tablet holds one of these matches (positions), ask first. commit() is the save, run at once
   when nothing is held; the answer is what openModal's handler expects ({keepOpen} while the look is on). Cancel keeps the result as it was.
   bare: not called from a result window's Save (a no-show picked from a list, "neither showed"): no window to keep waiting in or to settle. */
function liveHeldGuard(positions, commit, bare){
  if(!positions.length || !liveGuardOn()) return commit();
  var seq = ++liveGuardSeq, id = state.id, ok = bare ? null : document.getElementById('modalConfirmBtn');
  if(ok) ok.disabled = true;
  Promise.all(positions.map(function(p){ return liveWithin(liveMatchLookup(p), 4000); })).then(function(list){
    if(seq !== liveGuardSeq || !state || state.id !== id || (!bare && !liveModalOpen())) return;   // the window was closed (or another opened) meanwhile
    var held = null;
    list.forEach(function(b){ if(!held && b && LIVE_HELD_STATES.indexOf(b.state) >= 0) held = b; });
    if(!held){ if(bare) commit(); else liveSettleModal(commit()); return; }
    var no = held.info && held.info.matchNo != null && held.info.matchNo !== '' ? T('lb.match', { n: escText(held.info.matchNo) }) : T('lb.ovr.thisMatch');
    openModal({ title: T('lb.ovr.title'), help: false, confirmLabel: T('lb.ovr.enter'), confirmClass: 'danger',
      bodyHTML: '<p>' + (held.board != null ? T('lb.ovr.text', { match: no, b: escText(held.board) }) : T('lb.ovr.textNb', { match: no })) + '</p>',
      onConfirm: function(){ if(isLocked(state)) return { error: T('fin.onlyAdmin') }; return commit(); } });
  });
  return { keepOpen: true };
}
/* Before a knockout result is changed: if that changes the winner of a match that already has one, and the match the winner went to has
   started (lateCorrectionBlock, results-engine.js), nothing is saved; a box says to deal with that match first. 'Done' is known from the
   event itself; 'being played on a tablet' needs a look (liveMatchLookup of the next match). commit() is the original save. */
function liveLateGuard(bracketKey, ri, mi, newWinnerId, commit){
  if(!liveGuardOn()) return commit();
  var pos = 'ko:' + bracketKey + ':' + ri + ':' + mi, bracket = bracketByKey(state, bracketKey), m = bracket && bracket.rounds[ri] && bracket.rounds[ri][mi];
  if(!m || !m.winnerId || (newWinnerId || null) === m.winnerId) return commit();
  var now = lateCorrectionBlock(state, pos, newWinnerId, null);
  if(now){ liveLateModal(bracketKey, ri, mi, now); return { keepOpen: true }; }
  var nx = lateNextOf(state, pos);
  if(!nx) return commit();
  var seq = ++liveGuardSeq, id = state.id, ok = document.getElementById('modalConfirmBtn');
  if(ok) ok.disabled = true;
  liveWithin(liveMatchLookup(nx.pos), 4000).then(function(b){
    if(seq !== liveGuardSeq || !state || state.id !== id || !liveModalOpen()) return;
    var states = {}; if(b && b.state) states[nx.pos] = b.state;
    var block = lateCorrectionBlock(state, pos, newWinnerId, states);
    if(block){ liveLateModal(bracketKey, ri, mi, block); return; }
    liveSettleModal(commit());
  });
  return { keepOpen: true };
}
/* "Ali has already started Match 2-1": who advanced from the match being changed, and the next match's number. */
function liveLateModal(bracketKey, ri, mi, block){
  var m = bracketByKey(state, bracketKey).rounds[ri][mi], mm = /^ko:(.+):(\d+):(\d+)$/.exec(block.pos), nb = mm ? bracketByKey(state, mm[1]) : null;
  var tag = nb ? koMatchTag(nb, state, parseInt(mm[2], 10), parseInt(mm[3], 10)) : '';
  var who = escapeHtml(bracketEntryName(state, m.winnerId) || '');
  openModal({ title: T('lb.late.title'), help: false, confirmLabel: T('m.ok'), confirmClass: 'primary',
    bodyHTML: '<p>' + T(block.state === 'done' ? 'lb.late.done' : 'lb.late.playing', { name: who, match: T('lb.match', { n: escText(tag) }) }) + '</p>',
    onConfirm: function(){} });
  var cancel = document.querySelector('#modalBox .buttonrow .btn.secondary');
  if(cancel) cancel.style.display = 'none';   // one button: OK
}
/* ask: the match is held by a tablet and the server wants a yes before taking it off. */
function livePaperDraw(on, msg, ask){
  var el = document.getElementById('livePaper');
  if(!el) return;
  el.style.display = '';
  if(ask){
    el.innerHTML = '<div class="confirm-box" style="margin:0;text-align:left"><b>' + T('lb.paper.held') + '</b><div class="buttonrow" style="margin:8px 0 0">' +
      '<button type="button" class="btn primary fo-btn" onclick="livePaperSet(true,true)">' + T('lb.paper.takeOff') + '</button>' +
      '<button type="button" class="btn ghost fo-btn" onclick="livePaperDraw(false,\'\',false)">' + T('lb.paper.keep') + '</button></div></div>';
    return;
  }
  el.innerHTML = '<div class="toggle-row" style="margin:0"><input type="checkbox" id="livePaperBox" ' + (on ? 'checked' : '') + ' onchange="livePaperSet(this.checked,false)"> <label for="livePaperBox">' + T('lb.paper.label') + '</label></div>' +
    '<div class="hint" style="margin:2px 0 0 32px">' + T('lb.paper.hint') + '</div>' +
    (msg ? '<div style="color:var(--red);font-size:12px;margin:4px 0 0 32px">' + escText(msg) + '</div>' : '');
}
var livePaperBusy = false;
async function livePaperSet(on, confirm){
  var el = document.getElementById('livePaper');
  if(!el || !state || livePaperBusy) return;
  var pos = el.getAttribute('data-pos'), id = state.id, r = null, b = {};
  if(netOffline){ livePaperDraw(!on, T('off.needsBody'), false); return; }
  livePaperBusy = true;
  try{
    r = await apiFetch(LIVE_PANEL_API, { method: 'POST', body: JSON.stringify({ t: id, op: 'paper', pos: pos, on: !!on, confirm: confirm ? true : undefined }) });
    b = await r.json().catch(function(){ return {}; });
  }catch(e){ r = null; }
  livePaperBusy = false;
  if(!document.getElementById('livePaper') || !state || state.id !== id) return;   // the window was closed meanwhile
  if(r && r.ok){ livePaperDraw(!!on, '', false); if(currentStage === 5) loadLive(true); return; }
  if(r && r.status === 409 && b && b.code === 'needs_confirm'){ livePaperDraw(false, '', true); return; }
  livePaperDraw(!on, ddApiError(b || {}, T('lb.paper.err')), false);
}

/* ---------- blockers: what stands in the way of Close event, and of a tidy Finalise (spec 7.6) ---------- */
/* Resolves to the list [{ device, deviceNo, board, unsent, matches: [{ pos, info }] }] (empty: nothing in the way), or null when it
   could not be found out (no signal, not set up, any refusal). Reads only. */
function liveFetchBlockers(id){
  return apiFetch(LIVE_PANEL_API + '?t=' + encodeURIComponent(id) + '&blockers=1').then(function(r){
    return r.json().catch(function(){ return {}; }).then(function(b){ return r.ok && b && Array.isArray(b.blockers) ? b.blockers : null; });
  }).catch(function(){ return null; });
}
/* "Board 4 tablet: Match 18 not confirmed, 3 turns not sent" (as markup: the parts are escaped). */
function liveBlockerLine(b){
  var who = b.board != null ? T('lb.tk.tablet', { b: b.board }) : T('lb.deviceN', { n: b.deviceNo || '?' });
  var parts = [];
  (b.matches || []).forEach(function(m){
    var no = m.info && m.info.matchNo != null && m.info.matchNo !== '' ? m.info.matchNo : null;
    parts.push(no != null ? T('lb.bl.match', { match: T('lb.match', { n: escText(no) }) }) : T('lb.bl.aMatch'));
  });
  if(b.unsent > 0) parts.push(T('lb.unsent', { n: b.unsent }));
  return '<span style="font-weight:700">' + escText(who) + '</span>: ' + parts.join(', ');
}
function liveBlockersHTML(list){
  return '<ul class="lb-blockers" style="margin:8px 0 10px 18px;padding:0">' + list.map(function(b){ return '<li style="margin:3px 0">' + liveBlockerLine(b) + '</li>'; }).join('') + '</ul>';
}
/* The warning in the Finalise confirm (app.html finalizeResults): the same list, and what finalising does and does not do. */
function liveFinalizeWarnHTML(list){
  return '<div class="confirm-box" style="margin:10px 0 0;text-align:left"><b>' + T('fin.liveWarnTitle') + '</b>' + liveBlockersHTML(list) +
    '<div class="hint" style="margin:0">' + T('fin.liveWarnHint') + '</div></div>';
}

/* ---------- Close event ---------- */
function liveClosedNoteHTML(d){
  var when = d.closedAt ? new Date(d.closedAt) : null;
  var txt = when && !isNaN(when) ? when.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '';
  return '<div class="confirm-box finalized-note" style="margin:8px 0"><b>' + T('lb.closed.at', { when: escText(txt) }) + '</b> ' + T('lb.closed.note') + '</div>';
}
/* The modal looks first (nothing is written), then offers: no blockers, a plain confirm; blockers, the list and a clearly worded
   "Close anyway" (the main button stays off). If the look fails nothing can be closed from here. */
function liveCloseModal(){
  if(!state || !state.id) return;
  var id = state.id;
  openModal({ title: T('lb.close.title'), help: false, bodyHTML: '<div id="liveCloseBody"><p>' + T('lb.close.checking') + '</p></div>',
    confirmLabel: T('lb.close.confirm'), confirmClass: 'danger', secondaryLabel: T('lb.close.anyway'), secondaryClass: 'danger',
    onConfirm: function(){ liveCloseDo(false); }, onSecondary: function(){ liveCloseDo(true); } });
  var ok = document.getElementById('modalConfirmBtn'), any = document.getElementById('modalSecondaryBtn');
  if(ok) ok.disabled = true;
  if(any) any.style.display = 'none';
  liveFetchBlockers(id).then(function(list){
    var el = document.getElementById('liveCloseBody');
    if(!el || !state || state.id !== id) return;   // the window was closed meanwhile
    if(list === null){ el.innerHTML = '<p>' + T('lb.close.checkFailed') + '</p>'; return; }
    if(list.length){ el.innerHTML = '<p>' + T('lb.close.blocked') + '</p>' + liveBlockersHTML(list); if(any) any.style.display = ''; return; }
    el.innerHTML = '<p>' + T('lb.close.clear') + '</p>';
    if(ok) ok.disabled = false;
  });
}
/* force: close although devices still hold something (the server lists it again and refuses when force is not given). */
async function liveCloseDo(force){
  if(needsConnection() || !state) return;
  var id = state.id, r = null, b = {};
  try{ r = await apiFetch(LIVE_PANEL_API, { method: 'POST', body: JSON.stringify({ t: id, op: 'close', force: !!force }) }); b = await r.json().catch(function(){ return {}; }); }catch(e){ r = null; }
  if(!state || state.id !== id) return;
  if(r && r.status === 409 && b && b.code === 'close_blocked'){ liveCloseModal(); return; }   // a device started something meanwhile: look again
  if(!r || !r.ok) openModal({ title: T('lb.close.title'), body: escapeHtml(ddApiError(b, T('lb.err.request'))), confirmLabel: T('m.ok'), confirmClass: 'primary', onConfirm: function(){}, help: false });
  loadLive(true);
}

/* ---------- match history (spec 7.5) ---------- */
var liveHist = { pos: null, data: null, error: '', msg: '', last: '' };   // the open window: the match, what the server said, a message to show inside it
var liveHistTimer = null;
function liveDisputedBadge(){
  return '<span style="display:inline-block;background:var(--red);color:#fff;border-radius:8px;padding:1px 8px;font-size:11px;font-weight:700">' + T('lb.disputed') + '</span>';
}
/* A window that only shows something: no Confirm button, and Cancel reads "Done". */
function liveModalDone(label){
  var ok = document.getElementById('modalConfirmBtn');
  if(ok) ok.style.display = 'none';
  var box = document.getElementById('modalBox'), first = box && box.querySelector ? box.querySelector('.buttonrow .btn') : null;
  if(first && first !== ok) first.textContent = label;
}
/* The "Match history" block: one button, which lists the matches that have a history to open. */
function liveHistoryBlockHTML(d){
  return '<div style="padding:10px 0;border-top:1px solid var(--line)"><b>' + T('lb.history') + '</b>' +
    '<div class="hint" style="margin:4px 0 6px">' + T(isLocked(state) ? 'lb.history.hintRo' : 'lb.history.hint') + '</div>' +
    '<button class="btn ghost fo-btn" onclick="liveHistoryPick()">' + T('lb.history.open') + '</button></div>';
}
function liveHistoryPick(){
  var list = (liveState.data && liveState.data.matches) || [];
  var live = ['checkedIn', 'playing', 'awaitingConfirm'];
  var sorted = list.filter(function(m){ return live.indexOf(m.state) >= 0; }).concat(list.filter(function(m){ return live.indexOf(m.state) < 0; }));
  var body = !sorted.length ? '<p>' + T('lb.hist.pickNone') + '</p>' : '<div style="max-height:60vh;overflow:auto">' + sorted.map(function(m){
    var no = m.info && m.info.matchNo != null && m.info.matchNo !== '' ? T('lb.match', { n: escText(m.info.matchNo) }) : '';
    return '<div class="fo-row" style="padding:7px 0;border-top:1px solid var(--line);display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span style="flex:1;min-width:200px"><b>' +
      escText(m.a) + '</b> v <b>' + escText(m.b) + '</b><div class="hint" style="margin:0">' + [no, escText(TC('lb.st.', m.state))].filter(Boolean).join(' · ') + '</div>' +
      (m.disputed ? '<div style="margin:2px 0 0">' + liveDisputedBadge() + '</div>' : '') + '</span>' +
      '<button class="btn ghost fo-btn" onclick="liveHistoryOpen(\'' + escJs(m.pos) + '\')">' + T('lb.history.btn') + '</button></div>';
  }).join('') + '</div>';
  openModal({ title: T('lb.history'), help: false, bodyHTML: body, confirmLabel: T('lb.hist.done'), confirmClass: 'primary', onConfirm: function(){} });
  liveModalDone(T('lb.hist.done'));
}
function liveHistoryOpen(pos){
  if(!state || !state.id) return;
  liveHist = { pos: pos, data: null, error: '', msg: '', last: '' };
  openModal({ title: T('lb.hist.title'), help: false, bodyHTML: '<div id="liveHistBody" style="max-height:64vh;overflow:auto">' + liveHistBodyHTML() + '</div>',
    confirmLabel: T('lb.hist.done'), confirmClass: 'primary', onConfirm: function(){} });
  liveModalDone(T('lb.hist.done'));
  liveHistFetch();
  if(!liveHistTimer && typeof setInterval === 'function') liveHistTimer = setInterval(liveHistTick, 10000);   // turns keep arriving while it is open
}
function liveHistTick(){
  if(!document.getElementById('liveHistBody') || !liveHist.pos){ clearInterval(liveHistTimer); liveHistTimer = null; return; }
  if(document.hidden || netOffline) return;
  liveHistFetch();
}
function liveHistFetch(){
  var pos = liveHist.pos, id = state && state.id;
  if(!pos || !id) return Promise.resolve();
  return apiFetch(LIVE_PANEL_API + '?t=' + encodeURIComponent(id) + '&history=' + encodeURIComponent(pos)).then(function(r){
    return r.json().catch(function(){ return {}; }).then(function(b){
      if(liveHist.pos !== pos || !state || state.id !== id) return;
      if(r.ok){ var key = JSON.stringify(b); if(key === liveHist.last && !liveHist.error) return; liveHist.last = key; liveHist.data = b; liveHist.error = ''; }
      else if(!liveHist.data) liveHist.error = 'load';
      liveHistDraw();
    });
  }).catch(function(){ if(liveHist.pos === pos && !liveHist.data){ liveHist.error = 'load'; liveHistDraw(); } });
}
function liveHistDraw(){
  var el = document.getElementById('liveHistBody');
  if(!el) return;
  var top = el.scrollTop;
  el.innerHTML = liveHistBodyHTML();
  el.scrollTop = top;
}
/* Groups the turns into rows: a chain of corrections is ONE row (its versions oldest first), an ignored turn its own greyed row. */
function liveHistRows(turns){
  var byId = {}, at = {}, kids = {}, placed = {}, rows = [];
  turns.forEach(function(t, i){ byId[t.id] = t; at[t.id] = i; });
  var counting = function(id){ return !!byId[id] && !byId[id].ignored; };
  turns.forEach(function(t){ if(!t.ignored && t.supersedes && counting(t.supersedes)) (kids[t.supersedes] = kids[t.supersedes] || []).push(t); });
  var chainFrom = function(t){
    var chain = [], todo = [t];
    while(todo.length){ var x = todo.shift(); if(placed[x.id]) continue; placed[x.id] = true; chain.push(x); (kids[x.id] || []).forEach(function(k){ todo.push(k); }); }
    return chain.sort(function(p, q){ return at[p.id] - at[q.id]; });
  };
  turns.forEach(function(t){
    if(placed[t.id]) return;
    if(t.ignored){ placed[t.id] = true; rows.push({ ignored: t, leg: t.leg }); return; }
    if(t.supersedes && counting(t.supersedes)) return;   // placed with the turn it corrects
    rows.push({ chain: chainFrom(t), leg: t.leg });
  });
  turns.forEach(function(t){ if(!placed[t.id]){ rows.push({ chain: chainFrom(t), leg: t.leg }); } });   // a loop of corrections no device makes: still shown
  return rows;
}
function liveHistScore(t){
  var e = t.entered || {};
  if(e.game === 'cricket') return T('lb.hist.marks', { n: e.marks != null ? e.marks : 0 }) + ', ' + T('lb.hist.points', { n: e.score != null ? e.score : 0 });
  return e.bust ? T('lb.hist.bust') : String(e.score != null ? e.score : 0);
}
function liveHistWho(t){ return t.byOrganiser ? T('lb.hist.organiser') : T('lb.deviceN', { n: t.deviceNo || '?' }); }
function liveHistClock(iso){
  var d = iso ? new Date(iso) : null;
  return d && !isNaN(d) ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
}
/* "10:02:11 · Device 2 · 441 left" */
function liveHistMeta(t){
  var parts = [liveHistClock(t.at), liveHistWho(t)];
  if(t.left != null) parts.push(T('lb.hist.left', { n: t.left }));
  return escText(parts.filter(Boolean).join(' · '));
}
function liveHistBodyHTML(){
  var h = liveHist.data;
  if(liveHist.error && !h) return '<p>' + T('lb.hist.err') + ' <a href="javascript:void(0)" onclick="liveHist.error=\'\';liveHistDraw();liveHistFetch()">' + T('fo.retry') + '</a></p>';
  if(!h) return '<p class="hint">' + T('fo.loading') + '</p>';
  var over = ['confirmed', 'retired', 'voided'].indexOf(h.state) >= 0, fin = isLocked(state), ro = over || fin;   // fin: the event is finalised, the history is only read
  var no = h.info && h.info.matchNo != null && h.info.matchNo !== '' ? T('lb.match', { n: escText(h.info.matchNo) }) : '';
  var sm = h.summary && h.summary.legs && h.summary.legs.length === 2 ? T('lb.hist.legs', { a: h.summary.legs[0], b: h.summary.legs[1] }) : '';
  var html = '<div style="margin-bottom:8px"><b>' + escText(h.a) + '</b> v <b>' + escText(h.b) + '</b>' +
    '<div class="hint" style="margin:0">' + [no, escText(TC('lb.st.', h.state)), sm].filter(Boolean).join(' · ') + '</div>' +
    (h.disputed ? '<div style="margin:3px 0 0">' + liveDisputedBadge() + '</div>' : '') + '</div>' +
    (fin ? '' : '<div class="buttonrow" style="margin:0 0 4px"><button class="btn ghost fo-btn" onclick="liveHistDispute(' + (h.disputed ? 'false' : 'true') + ')">' + T(h.disputed ? 'lb.hist.clearDisputed' : 'lb.hist.markDisputed') + '</button></div>' +
      '<div class="hint" style="margin:0 0 8px">' + T('lb.hist.disputedHint') + '</div>') +
    (liveHist.msg ? '<div style="color:var(--red);font-size:12px;margin:0 0 8px">' + escText(liveHist.msg) + '</div>' : '');
  if(!h.turns.length) html += '<p class="hint">' + T('lb.hist.noTurns') + '</p>';
  else {
    html += '<div class="hint" style="margin:0 0 6px">' + T(fin ? 'lb.hist.finalHint' : over ? 'lb.hist.overHint' : 'lb.hist.restoreHint') + '</div>';
    var rows = liveHistRows(h.turns), legs = [];
    rows.forEach(function(r){ if(legs.indexOf(r.leg) < 0) legs.push(r.leg); });
    legs.sort(function(p, q){ return p - q; });
    legs.forEach(function(leg){
      html += '<div style="font-weight:800;font-size:12px;margin:10px 0 2px;border-bottom:1px solid var(--line)">' + T('lb.hist.leg', { n: leg }) + '</div>';
      rows.filter(function(r){ return r.leg === leg; }).forEach(function(r){ html += liveHistRowHTML(r, h, ro); });
    });
  }
  var tks = h.takeovers || [];
  if(tks.length){
    html += '<div style="font-weight:800;font-size:12px;margin:14px 0 2px;border-bottom:1px solid var(--line)">' + T('lb.hist.tkTitle') + '</div>' + tks.map(function(k){
      var ask = T('lb.hist.tk', { to: escText(T('lb.deviceN', { n: k.toNo || '?' })), from: escText(T('lb.deviceN', { n: k.fromNo || '?' })), time: escText(liveHistClock(k.requestedAt)) });
      var done = k.answer ? T('lb.hist.tk.done', { answer: T('lb.hist.tk.' + k.answer), by: k.decidedBy ? T('lb.hist.by.' + k.decidedBy) : '', time: escText(liveHistClock(k.decidedAt)) }) : T('lb.hist.tk.waiting');
      return '<div style="margin:4px 0;font-size:12px">' + ask + ' ' + done + '</div>';
    }).join('');
  }
  return html;
}
function liveHistRowHTML(r, h, over){
  var name = function(t){ return escText(t.player || (t.side === 'b' ? h.b : h.a)); };
  if(r.ignored){
    var t = r.ignored;
    return '<div style="margin:5px 0;opacity:.55"><b>' + name(t) + '</b> ' + escText(liveHistScore(t)) + ' <span class="hint" style="margin:0">' + liveHistMeta(t) + ' · ' +
      T('lb.hist.notCounted', { why: escText(TC('lb.hist.why.', t.ignoredReason || '')) }) + '</span></div>';
  }
  var chain = r.chain;
  if(chain.length === 1){
    return '<div style="margin:5px 0"><b>' + name(chain[0]) + '</b> ' + escText(liveHistScore(chain[0])) + ' <span class="hint" style="margin:0">' + liveHistMeta(chain[0]) + '</span></div>';
  }
  var arrow = chain.map(function(t){ return escText(liveHistScore(t)) + (t.current ? ' ' + T('lb.hist.now') : ''); }).join(' → ');
  return '<div style="margin:6px 0"><b>' + name(chain[0]) + '</b> ' + arrow +
    chain.map(function(t){
      return '<div style="margin:2px 0 0 14px;display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span>' + escText(liveHistScore(t)) + (t.current ? ' ' + T('lb.hist.now') : '') +
        ' <span class="hint" style="margin:0">' + liveHistMeta(t) + '</span></span>' +
        (!t.current && !over ? '<button class="btn ghost fo-btn" onclick="liveHistRestore(\'' + escJs(t.id) + '\')">' + T('lb.hist.restore') + '</button>' : '') + '</div>';
    }).join('') + '</div>';
}
/* Restore and the Disputed flag: the answer is the panel again; the window shows the new state (or the reason, inside itself). */
var liveHistBusy = false;
function liveHistAct(body){
  if(liveHistBusy || !liveHist.pos || isLocked(state)) return;
  liveHistBusy = true; liveHist.msg = '';
  var pos = liveHist.pos;
  liveCall(Object.assign({ pos: pos }, body), function(text){ if(liveHist.pos === pos){ liveHist.msg = text; liveHistDraw(); } }).then(function(){
    liveHistBusy = false;
    if(liveHist.pos === pos){ liveHist.last = ''; liveHistFetch(); }
  }, function(){ liveHistBusy = false; });
}
function liveHistRestore(turnId){ liveHistAct({ op: 'restore', turnId: turnId }); }
function liveHistDispute(on){ liveHistAct({ op: 'dispute', on: !!on }); }

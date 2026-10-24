/* Group Boards screens: builds HTML strings and handles clicks for stages 2 to 7. All game logic lives in
   pods.js. Organisers see "Group"; the internal name is "pods" (state.pods) so it never clashes with the
   round-robin state.groups. Needs globals from app.html (state, persist, render, openModal, escapeHtml,
   nearestBracket, knockoutLegsFieldsHTML, ...) and T() from i18n/app-i18n.js (every word comes from the
   organiser's table, i18n/app.*.js). Only called while rendering or on a click. */

/* What a Group Boards entry is called: players, or pairs / teams in a Doubles or Teams event (unitKeyFor in app.html). */
function podsNoun(n){
  var k = (typeof unitKeyFor === 'function' && state && state.eventCreation) ? unitKeyFor(state.eventCreation.competitionUnit) : 'player';
  if(k === 'entry') k = 'player';
  return T('noun.' + k, { n: n });
}
function podsNounCap(){ var w = podsNoun(2); return w.charAt(0).toUpperCase() + w.slice(1); }

/* ---------- Stage 2: format settings ---------- */
function podsSummaryHTML(n, p){
  var v = podsValidateCount(n, p);
  if(!p) return T('pods.chooseHow', { nouns: podsNounCap() });
  if(!v.ok) return '<b style="color:#c0392b">'+escapeHtml(v.message)+'</b>';
  var sizes = podSizes(n, p), min = sizes[sizes.length-1], max = sizes[0], fin = nearestBracket(p);
  return T('pods.summary'+(fin.size===8 ? 'An' : '')+(fin.byes ? 'Byes' : ''), { p: p, sizes: (min===max ? min : T('pods.range', { a: min, b: max })), nouns: podsNoun(2), size: escText(fin.size), n: fin.byes });
}
function podsFormatFieldsHTML(){
  var f = state.format, n = podsPlayerCount(state), p = parseInt(f.podCount) || 0, advanced = !!state.eventCreation.advancedMode;
  /* Teams: the segments (below) set every match's legs, in the groups and the Finals alike. */
  if(isTeamsEvent(state)){
    return '<div class="grid2">'+
        '<div class="field"><label>'+T('pods.count')+'</label><input id="f_podcount" type="number" min="2" max="'+PODS_MAX+'" value="'+(p || '')+'" oninput="podsPreviewSettings()"></div><div></div>'+
      '</div>'+
      '<div class="recommend" id="podsSummary">'+podsSummaryHTML(n, p)+'</div>';
  }
  return '<div class="grid2">'+
      '<div class="field"><label>'+T('pods.bestOfFinals')+'</label><input id="f_bestof" type="number" min="1" step="2" value="'+escText(f.bestOfLegs)+'" oninput="warnBestOf(this);updateStage2Timing()"><div class="hint" id="bestOfHint"></div></div>'+
      '<div class="field"><label>'+T('pods.count')+'</label><input id="f_podcount" type="number" min="2" max="'+PODS_MAX+'" value="'+(p || '')+'" oninput="podsPreviewSettings()"></div>'+
    '</div>'+
    '<div class="grid2"><div class="field"><label>'+T('pods.bestOfGroups')+'</label><input id="f_podlegs" type="number" min="1" step="2" value="'+(parseInt(f.podLegs) || parseInt(f.bestOfLegs) || 5)+'"></div><div></div></div>'+
    '<div class="recommend" id="podsSummary">'+podsSummaryHTML(n, p)+'</div>'+
    (advanced ? knockoutLegsFieldsHTML('main', f.knockoutLegs.main, T('pods.finalsLegs')) : '');
}
function podsPreviewSettings(){
  var el = document.getElementById('f_podcount'), box = document.getElementById('podsSummary');
  if(!el || !box) return;
  box.innerHTML = podsSummaryHTML(podsPlayerCount(state), parseInt(el.value) || 0);
}
/* Reads the Stage 2 fields (each only if it is on the page) into the format object. */
function podsReadFormat(f){
  var pc = document.getElementById('f_podcount');
  if(pc) f.podCount = parseInt(pc.value) || 0;   // not clamped: Save checks it and tells the organiser what is wrong
  var pl = document.getElementById('f_podlegs');
  if(pl) f.podLegs = Math.max(1, parseInt(pl.value) || parseInt(f.bestOfLegs) || 5);
}

/* ---------- Stage 3: chart details (participants, seeding, drawing the groups) ---------- */
function podsSeedBadge(id, seeds){ return seeds[id] ? '<span class="num" style="margin-right:6px">'+seeds[id]+'</span>' : ''; }

function podsCardsHTML(pods){
  var seeds = podsOverallSeeds(state);
  return '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;margin-top:14px">'+
    pods.map(function(p){
      var editable = podsCanEdit(p);
      var rows = p.entryIds.map(function(id){
        var e = state.entriesList.find(function(x){ return x.id === id; }) || {};
        return '<div style="display:flex;justify-content:space-between;align-items:center;gap:6px;padding:3px 0;font-size:13px">'+
          '<span>'+podsSeedBadge(id, seeds)+escapeHtml(e.name || '')+(e.org ? ' <small style="color:var(--muted)">'+escapeHtml(e.org)+'</small>' : '')+'</span>'+
          (editable ? '<button class="btn ghost" style="padding:2px 8px;font-size:11px" onclick="podsMoveModal(\''+escJs(id)+'\')">'+T('pods.moveBtn')+'</button>' : '')+'</div>';
      }).join('');
      return '<div style="border:1px solid var(--line);border-radius:10px;padding:10px 12px">'+
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px"><strong>'+T('grp.label', { g: escapeHtml(p.label) })+'</strong>'+
          '<span class="hint" style="margin:0">'+T('pods.countOf', { n: p.entryIds.length, nouns: podsNoun(p.entryIds.length) })+'</span></div>'+
        '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;font-size:12px"><label style="margin:0">'+T('pods.boardsLabel', { n: p.boards.length })+'</label>'+
          '<input type="text" style="width:90px;height:28px;font-size:12px" value="'+escText(p.boards.join(', '))+'" onchange="setPodBoards(\''+escJs(p.id)+'\',this.value)"></div>'+
        rows+'</div>';
    }).join('')+'</div>';
}

/* Shown on Stage 3 and 4 when the entry list no longer matches the drawn groups. */
function podsRosterWarningHTML(){
  var t = state, unplaced = podsUnplaced(t), gone = podsGone(t);
  if(!unplaced.length && !gone.length) return '';
  function name(id){ return escapeHtml((t.entriesList.find(function(e){ return e.id === id; }) || {}).name || T('r.unknown')); }
  return '<div class="confirm-box" style="background:#fff8e5;border-color:#e8c86e;color:#65501d"><b>'+T('pods.rosterChanged')+'</b>'+
    (unplaced.length ? '<div>'+T('pods.unplaced', { n: unplaced.length, list: unplaced.map(function(id){ return name(id)+' <a href="javascript:void(0)" style="font-size:11px" onclick="podsPlaceModal(\''+escJs(id)+'\')">'+T('pods.placeLink')+'</a>'; }).join(', ') })+'</div>' : '')+
    (gone.length ? '<div>'+T('pods.gone', { n: gone.length, list: gone.map(name).join(', ') })+' <a href="javascript:void(0)" style="font-size:11px" onclick="podsRemoveGoneClick()">'+T('pods.removeThem')+'</a></div>' : '')+
  '</div>';
}
/* Shown on Stage 3 and 4 when the number of groups in Format & branding no longer matches the drawn groups. */
function podsCountWarningHTML(){
  var drawn = podsList(state).length, want = parseInt(state.format.podCount) || 0;
  if(!drawn || drawn === want) return '';
  return '<div class="confirm-box" style="background:#fff8e5;border-color:#e8c86e;color:#65501d"><b>'+T('pods.mismatch')+'</b>'+
    T('pods.mismatchText', { want: want, drawn: drawn })+' '+
    T(podsAnyScores(state) ? 'pods.mismatchScored' : 'pods.mismatchRedraw', { drawn: drawn })+'</div>';
}
function podsPlaceModal(entryId){
  var name = (state.entriesList.find(function(e){ return e.id === entryId; }) || {}).name || '';
  var opts = podsList(state).filter(podsCanEdit).map(function(p){ return '<option value="'+escText(p.id)+'">'+T('pods.groupOpt', { g: escapeHtml(p.label), n: p.entryIds.length, nouns: podsNoun(p.entryIds.length) })+'</option>'; }).join('');
  openModal({
    title:T('pods.placeTitle', { name: escapeHtml(name) }),
    bodyHTML: opts ? '<div class="field"><label>'+T('pods.intoGroup')+'</label><select id="plTo">'+opts+'</select></div>'
                   : '<p>'+T('pods.noOpenGroup')+'</p>',
    confirmLabel:T('pods.place'), confirmClass:'primary',
    onConfirm:function(){
      var to = document.getElementById('plTo');
      if(!to) return;
      var r = podsPlaceLate(state, entryId, to.value);
      if(!r.ok) return { error: r.message };
      persist(); render();
    }
  });
}
function podsRemoveGoneClick(){
  var r = podsRemoveGone(state);
  if(!r.ok) openModal({ title:T('pods.stillIn'), body:r.message, confirmLabel:T('m.ok'), confirmClass:'primary', onConfirm:function(){} });
  persist(); render();
}

/* ---------- Check-in on the draw and confirm screens ----------
   It only matters once check-in is in use (someone is ticked off): a tournament that never uses it must not be
   warned about every player. ids limits the check to some entries (the players of the groups being confirmed). */
function podsCheckInStatus(ids){
  var active = state.entriesList.filter(function(e){ return !e.withdrawn; });
  var checked = active.filter(function(e){ return e.checkedIn; }).length;
  return { total:active.length, checked:checked, missing:checked > 0 ? notCheckedInEntries(ids) : [] };
}
function podsCheckInBoxHTML(){
  var s = podsCheckInStatus();
  if(!s.checked) return '';
  var html = '<div class="hint" style="margin:0 0 8px">'+T('pods.checkedIn', { done: s.checked, n: s.total })+'</div>';
  if(!s.missing.length) return html;
  return html + noShowWarningHTML(s.missing)+
    '<div class="buttonrow" style="margin:0 0 12px"><button class="btn secondary" onclick="podsWithdrawUncheckedClick()">'+T('pods.withdrawMissing', { n: s.missing.length })+'</button>'+
    '<button class="btn ghost" onclick="checkInAll()">'+T('pods.checkEveryone')+'</button></div>';
}
/* Before the draw only: once players are in groups, withdraw them one at a time from their group. */
function podsWithdrawUncheckedClick(){
  if(podsList(state).length) return;
  var missing = podsCheckInStatus().missing;
  if(!missing.length) return;
  openModal({
    title:T('pods.withdrawTitle', { n: missing.length }),
    bodyHTML:'<p>'+T('pods.withdrawText')+'</p><p>'+missing.map(function(e){ return escapeHtml(e.name); }).join(', ')+'</p>',
    confirmLabel:T('wd.btn'), confirmClass:'danger',
    onConfirm:function(){ missing.forEach(function(e){ e.withdrawn = true; }); persist(); render(); }
  });
}
/* Runs go() at once, or after the organiser agrees when someone in these groups has not checked in. */
function podsCheckInGuard(podIds, go){
  var ids = [];
  podsList(state).forEach(function(p){ if(podIds.indexOf(p.id) !== -1) ids = ids.concat(p.entryIds); });
  var missing = podsCheckInStatus(ids).missing;
  if(!missing.length){ go(); return; }
  openModal({ title:T('pods.confirmWithout'), bodyHTML:noShowWarningHTML(missing), confirmLabel:T('pods.confirmAnyway'), confirmClass:'primary', onConfirm:go });
}

function podsStage3(){
  var t = state, pods = podsList(t), v = podsValidate(t), scored = podsAnyScores(t);
  var html = stage3Knockout({ noControls:true, intro:T('pods.drawBelow') });   // the Participants & Seeding panel, same as the knockout format
  html += '<div class="card"><h2>'+T('pods.groups')+'</h2><p class="intro">'+
    (pods.length ? T('pods.checkDraw')
                 : T('pods.dealText', { noun: podsNoun(1), n: (parseInt(t.format.podCount) || 0) }))+'</p>'+
    (!v.ok ? '<div class="confirm-box" style="background:#fff8e5;border-color:#e8c86e;color:#65501d"><b>'+T('s2.checkGroups')+'</b>'+escapeHtml(v.message)+' <span style="text-decoration:underline;cursor:pointer" onclick="goStage(2)">'+T('pods.changeIt')+'</span></div>' : '')+
    (pods.length ? podsCountWarningHTML() + podsRosterWarningHTML() : podsCheckInBoxHTML())+
    '<div class="buttonrow"><button class="btn '+(pods.length ? 'secondary' : 'primary')+'" '+(v.ok && !scored ? '' : 'disabled ')+'onclick="podsDrawClick()">'+T(pods.length ? 'pods.redraw' : 'pods.draw')+'</button>'+
      '<button class="btn secondary" onclick="goStage(2)">'+T('s3.makeChanges')+'</button>'+
      (pods.length ? '<button class="btn primary" onclick="goStage(4)">'+T('pods.continueConfirm')+'</button>' : '')+'</div>'+
    (scored ? '<div class="hint">'+T('pods.noRedraw')+'</div>' : '')+
    (pods.length ? podsCardsHTML(pods) : '')+'</div>';
  return html;
}

function podsDrawNow(){
  var r = generatePods(state);
  if(!r.ok){ openModal({ title:T('pods.cantDraw'), body:r.message, confirmLabel:T('m.ok'), confirmClass:'primary', onConfirm:function(){} }); return; }
  persist(); render();
}
function podsDrawClick(){
  if(podsAnyScores(state)) return;
  if(!podsList(state).length){
    var missing = podsCheckInStatus().missing;
    if(!missing.length){ podsDrawNow(); return; }
    openModal({ title:T('pods.drawWithout'),
      bodyHTML:noShowWarningHTML(missing)+'<p>'+T('pods.drawWithoutText')+'</p>',
      confirmLabel:T('pods.drawAnyway'), confirmClass:'primary', onConfirm:function(){ podsDrawNow(); } });
    return;
  }
  openModal({ title:T('pods.redrawTitle'), body:T('pods.redrawText'),
    confirmLabel:T('pods.redrawBtn'), confirmClass:'danger', onConfirm:function(){ podsDrawNow(); } });
}

/* Board numbers typed as "2, 4" or "2 4". Blank or invalid input leaves the boards as they were. Boards never affect
   results, so they stay editable after a group is confirmed or scored (a board can break mid-event). */
function setPodBoards(podId, text){
  var pod = podsList(state).find(function(p){ return p.id === podId; });
  if(!pod) return;
  var nums = String(text).split(/[\s,]+/).map(function(x){ return parseInt(x); }).filter(function(n){ return n > 0 && n <= 9999; });
  if(!nums.length){ render(); return; }
  pod.boards = nums.filter(function(n, i){ return nums.indexOf(n) === i; }).sort(function(a, b){ return a - b; });
  persist(); render();
}

function podsMoveFillSwap(){
  var to = document.getElementById('mvTo'), sw = document.getElementById('mvSwap');
  if(!to || !sw) return;
  var pod = podsList(state).find(function(p){ return p.id === to.value; });
  sw.innerHTML = '<option value="">'+T('pods.noSwap')+'</option>'+(pod ? pod.entryIds.map(function(id){
    return '<option value="'+escText(id)+'">'+escapeHtml((state.entriesList.find(function(e){ return e.id === id; }) || {}).name || '')+'</option>';
  }).join('') : '');
}
function podsMoveModal(entryId){
  var from = podsFindOf(state, entryId);
  if(!from) return;
  var name = (state.entriesList.find(function(e){ return e.id === entryId; }) || {}).name || '';
  var opts = podsList(state).filter(function(p){ return p.id !== from.id && podsCanEdit(p); }).map(function(p){
    return '<option value="'+escText(p.id)+'">'+T('pods.groupOpt', { g: escapeHtml(p.label), n: p.entryIds.length, nouns: podsNoun(p.entryIds.length) })+'</option>';
  }).join('');
  openModal({
    title:T('pods.moveTitle', { name: escapeHtml(name) }),
    bodyHTML: opts
      ? '<div class="field"><label>'+T('pods.toGroup')+'</label><select id="mvTo" onchange="podsMoveFillSwap()">'+opts+'</select></div>'+
        '<div class="field"><label>'+T('pods.swapWith')+'</label><select id="mvSwap"></select></div>'+
        '<div class="hint">'+T('pods.moveHint')+'</div>'
      : '<p>'+T('pods.noOtherGroup')+'</p>',
    confirmLabel:T('pods.move'), confirmClass:'primary',
    onConfirm:function(){
      var to = document.getElementById('mvTo'), sw = document.getElementById('mvSwap');
      if(!to) return;
      var r = sw && sw.value ? podsSwapPlayers(state, entryId, sw.value) : podsMovePlayer(state, entryId, to.value);
      if(!r.ok) return { error: r.message };
      persist(); render();
    }
  });
  podsMoveFillSwap();
}

/* ---------- Stage 4: confirm the groups, build the Finals ---------- */
function podsStage4(){
  var t = state, pods = podsList(t), prog = podsProgress(t);
  var html = competitionDurationSummaryHTML(t) + checkInCardHTML() + (pods.length ? podsCountWarningHTML() + podsRosterWarningHTML() : '');
  if(!pods.length){
    return html + '<div class="card"><h2>'+T('pods.confirmGroups')+'</h2><p class="intro">'+T('pods.drawFirst')+'</p><div class="buttonrow"><button class="btn primary" onclick="goStage(3)">'+T('pods.goDetails')+'</button></div></div>';
  }
  html += '<div class="card"><h2>'+T('pods.confirmTitle')+'</h2>'+
    '<p class="intro">'+T('pods.confirmIntro')+'</p>'+
    '<div class="summary-grid" style="margin-bottom:12px"><div><label>'+T('pods.groupsConfirmed')+'</label><strong>'+T('s4.chartsOf', { a: prog.confirmed, n: prog.total })+'</strong></div>'+
      '<div><label>'+T('br.finals')+'</label><strong>'+(podsFinals(t) ? T('pods.finalsBuilt', { size: escText(podsFinals(t).size) }) : T('pods.notBuilt'))+'</strong></div></div>'+
    (podsFinals(t) && typeof publishForQrNoteHTML === 'function' ? publishForQrNoteHTML() : '')+
    '<div class="buttonrow"><button class="btn primary" '+(prog.confirmed === prog.total ? 'disabled ' : '')+'onclick="podsConfirmAllClick()">'+T('pods.confirmAll')+'</button>'+
      (podsFinals(t) ? '<button class="btn secondary" onclick="doFinalPrint()">'+T('s4.printPack')+'</button><button class="btn primary" onclick="goStage(5)">'+T('s4.continue')+'</button>' : '')+'</div>'+
    sheetLangRowHTML()+lineupSheetToggleHTML()+
    '<div class="printlist">'+pods.map(function(p){
      return '<div><span>'+T('pods.row', { g: escapeHtml(p.label), n: p.entryIds.length, nouns: podsNoun(p.entryIds.length), boards: podBoardLabel(p) })+'</span><span>'+
        (p.confirmed
          ? '<b style="color:#1d8a4a">'+T('chart.confirmed')+'</b> <a href="javascript:void(0)" style="font-size:11px" onclick="podsUnconfirmClick(\''+escJs(p.id)+'\')">'+T('pods.unconfirm')+'</a>'
          : '<b style="color:#c0392b">'+T('chart.notConfirmed')+'</b> <a href="javascript:void(0)" style="font-size:11px" onclick="podsConfirmClick(\''+escJs(p.id)+'\')">'+T('pods.confirm')+'</a>')+'</span></div>';
    }).join('')+'</div></div>';
  if(podsFinals(t)) html += '<div class="card"><h3 style="margin:0 0 10px">'+T('br.finals')+'</h3><div class="mko-artboard-scroll">'+mirroredChartHTML(podsFinals(t), t, {interactive:false})+'</div></div>';
  return html;
}
function podsConfirmClick(id){ podsCheckInGuard([id], function(){ podsConfirm(state, id); persist(); render(); }); }
function podsConfirmAllClick(){
  var open = podsList(state).filter(function(p){ return !p.confirmed; }).map(function(p){ return p.id; });
  podsCheckInGuard(open, function(){ podsConfirmAll(state); persist(); render(); });
}
function podsUnconfirmClick(id){
  var r = podsUnconfirm(state, id);
  if(!r.ok){ openModal({ title:T('pods.cantUnconfirm'), body:r.message, confirmLabel:T('m.ok'), confirmClass:'primary', onConfirm:function(){} }); return; }
  persist(); render();
}

/* ---------- Stage 5: manage the tournament ---------- */
var podsManageSel = 'grid';     // 'grid' | 'finals' | a group id
var podsManageFilter = 'all';   // 'all' | 'open' | 'done'
function podsSelect(v){ podsManageSel = v; render(); }
function podsSetFilter(v){ podsManageFilter = v; render(); }

function podStatusText(p){
  if(!p.confirmed) return { text:T('chart.notConfirmed'), color:'#c0392b' };
  var c = podMatchCounts(p), w = podChampion(p);
  if(w) return { text:T('pods.winner', { name: ((state.entriesList.find(function(e){ return e.id === w; }) || {}).name || '') }), color:'#1d8a4a' };
  if(podNoWinner(p)) return { text:T('pods.noWinner'), color:'#b7791f' };
  if(!c.done) return { text:T('grp.notStarted'), color:'var(--muted)' };
  return { text:T('pods.inProgress', { done: c.done, n: c.total }), color:'#b7791f' };
}
function podsFilterBarHTML(){
  function b(v, label){ return '<button class="btn '+(podsManageFilter === v ? 'primary' : 'ghost')+'" style="padding:6px 12px;font-size:12px" onclick="podsSetFilter(\''+v+'\')">'+label+'</button>'; }
  return '<div class="buttonrow" style="margin:0 0 10px">'+b('all', T('pods.all'))+b('open', T('pods.unfinished'))+b('done', T('pods.finished'))+'</div>';
}
function podsGridHTML(pods){
  var list = pods.filter(function(p){ return podsManageFilter === 'all' || (podsManageFilter === 'done') === podIsFinished(p); });
  if(!list.length) return '<p class="intro">'+T('pods.noneToShow')+'</p>';
  return '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px">'+list.map(function(p){
    var st = podStatusText(p);
    return '<div onclick="podsSelect(\''+escJs(p.id)+'\')" style="cursor:pointer;border:1px solid var(--line);border-radius:10px;padding:10px 12px">'+
      '<div style="display:flex;justify-content:space-between"><strong>'+T('grp.label', { g: escapeHtml(p.label) })+'</strong><span class="hint" style="margin:0">'+podBoardLabel(p)+'</span></div>'+
      '<div style="font-size:12px;color:'+st.color+';margin-top:4px">'+escapeHtml(st.text)+'</div></div>';
  }).join('')+'</div>';
}
function podsStage5(){
  var t = state, pods = podsList(t);
  if(!pods.some(function(p){ return p.confirmed; })){
    return '<div class="card"><h2>'+T('s5.title')+'</h2>'+competitionDurationSummaryHTML(t)+'<p class="intro">'+T('pods.confirmFirst')+'</p><div class="buttonrow"><button class="btn primary" onclick="goStage(4)">'+T('pods.confirmGroups')+'</button></div></div>';
  }
  var prog = podsProgress(t), sel = podsManageSel;
  var selPod = pods.find(function(p){ return p.id === sel; });
  if(sel !== 'grid' && sel !== 'finals' && !selPod) sel = podsManageSel = 'grid';
  if(sel === 'finals' && !podsFinals(t)) sel = podsManageSel = 'grid';
  var html = '<div class="card"><div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap"><h2 style="margin:0">'+T('s5.title')+'</h2>'+
    '<span class="hint" style="margin:0">'+T('pods.finishedOf', { done: prog.finished, n: prog.total })+'</span></div>'+
    '<p class="intro">'+T('pods.manageIntro')+'</p>'+competitionDurationSummaryHTML(t)+
    '<div class="buttonrow" style="margin-bottom:10px">'+
      '<button class="btn '+(sel === 'grid' ? 'primary' : 'secondary')+'" onclick="podsSelect(\'grid\')">'+T('pods.allGroups')+'</button>'+
      (podsFinals(t) ? '<button class="btn '+(sel === 'finals' ? 'primary' : 'secondary')+'" onclick="podsSelect(\'finals\')">'+T('br.finals')+'</button>'
                  : '<span class="hint" style="margin:0 0 0 6px">'+T('pods.finalsLater')+'</span>')+
    '</div>';
  if(sel === 'grid'){
    html += podsFilterBarHTML() + podsGridHTML(pods);
  } else if(sel === 'finals'){
    html += '<div class="mko-artboard-scroll">'+mirroredChartHTML(podsFinals(t), t, {interactive:true, bracketKey:'knockout'})+'</div>';
  } else {
    html += '<div class="buttonrow" style="margin-bottom:10px"><button class="btn ghost" onclick="podsSelect(\'grid\')">'+T('pods.backAll')+'</button></div>'+
      '<h3 style="margin:0 0 8px">'+T('grp.withBoards', { g: escapeHtml(selPod.label), boards: podBoardLabel(selPod) })+'</h3>'+
      '<div style="display:flex;align-items:center;gap:6px;margin-bottom:10px;font-size:12px"><label style="margin:0">'+T('pods.changeBoards', { n: selPod.boards.length })+'</label>'+
        '<input type="text" style="width:100px;height:28px;font-size:12px" value="'+escText(selPod.boards.join(', '))+'" onchange="setPodBoards(\''+escJs(selPod.id)+'\',this.value)"></div>'+
      (selPod.confirmed ? '' : '<div class="confirm-box">'+T('pods.confirmThisFirst')+'</div>')+
      '<div class="mko-artboard-scroll">'+mirroredChartHTML(selPod.bracket, t, {interactive:selPod.confirmed, bracketKey:podBracketKey(selPod)})+'</div>';
  }
  html += '</div>';
  html += lineupReadyCardHTML();   // Teams: the knockout lineup sheets that are ready, and the empty sheet
  html += bpPanelHTML();
  html += publicResultsCardHTML();
  html += incidentLogCardHTML();
  return html;
}

/* ---------- Stage 6: results ---------- */
function podsStage6(){
  var t = state, pods = podsList(t);
  if(!pods.length) return '<div class="card"><p class="intro" style="margin:0">'+T('pods.noGroupsYet')+'</p></div>';
  function name(id){ return id ? ((t.entriesList.find(function(e){ return e.id === id; }) || {}).name || '—') : '—'; }
  var rows = pods.map(function(p){
    var w = podChampion(p), r = w ? bracketRunnerUp(p.bracket) : null;
    return '<tr><td class="l">'+escapeHtml(p.label)+'</td><td class="l">'+escapeHtml(w ? name(w) : (podNoWinner(p) ? T('pods.noWinner') : '—'))+'</td><td class="l">'+escapeHtml(name(r))+'</td><td class="dim">'+podBoardLabel(p)+'</td></tr>';
  }).join('');
  var pointer = typeof finishPointerHTML === 'function' ? finishPointerHTML() : '';
  var html = '<div class="card"><h2>'+T('s6.title')+'</h2><p class="intro">'+T('pods.s6intro')+'</p>'+pointer+'</div>'+
    '<div class="card"><h3 style="margin:0 0 10px;font-size:15px">'+T('pods.winners')+'</h3><div style="overflow-x:auto"><table class="std-table"><thead><tr><th class="l">'+T('cc.group')+'</th><th class="l">'+T('pods.thWinner')+'</th><th class="l">'+T('pods.thRunnerUp')+'</th><th>'+T('cc.board')+'</th></tr></thead><tbody>'+rows+'</tbody></table></div></div>';
  if(podsFinals(t)) html += knockoutPlacementsCard(podsFinals(t), 'Finals');
  html += '<div class="print-controls"><button class="btn secondary" onclick="goStage(5)">'+T('s6.back')+'</button><button class="btn primary" onclick="goStage(7)">'+T('s6.continue')+'</button></div>';
  return html;
}

/* ---------- Stage 7: print ---------- */
function podsStage7(){
  var t = state, pods = podsList(t), built = !!podsFinals(t);
  return '<div class="card"><h2>'+T('s7.title')+'</h2><p class="intro">'+T('pods.s7intro')+'</p>'+(typeof finishPointerHTML === 'function' ? finishPointerHTML() : '')+
    '<div class="summary-grid" style="margin-bottom:12px"><div><label>'+T('pods.groupSheets')+'</label><strong>'+pods.length+'</strong></div>'+
      '<div><label>'+T('br.finals')+'</label><strong>'+T(built ? 'pods.included' : 'pods.notBuilt')+'</strong></div></div>'+
    '<div class="toggle-row"><input type="checkbox" id="sponsorToggle" '+(t.printSettings.sponsorFooterEnabled ? 'checked' : '')+' onchange="toggleSponsorFooter(this.checked)"> <label for="sponsorToggle">'+T('s4.includeSponsor')+'</label></div>'+
    rulesSheetToggleHTML()+playersSheetToggleHTML()+boardsSheetToggleHTML()+sheetLangRowHTML()+lineupSheetToggleHTML()+(built ? koPaperSizeSelectHTML() : '')+
    '<div class="buttonrow"><button class="btn secondary" onclick="goStage(6)">'+T('s7.back')+'</button>'+
      '<button class="btn '+(pods.length ? 'primary' : 'secondary')+'" '+(pods.length ? '' : 'disabled ')+'onclick="doFinalPrint()">'+T('s7.print')+'</button></div></div>';
}
function podsPrintClick(){
  if(typeof sheetsLangReady === 'function' && !sheetsLangReady()) return;   // BM sheets on a page without the BM words yet
  var t = state, pods = podsList(t);
  if(!pods.length){ openModal({ title:T('pods.noGroupsTitle'), body:T('pods.drawFirstShort'), confirmLabel:T('m.ok'), confirmClass:'primary', onConfirm:function(){} }); return; }
  if(!(typeof isLocked === 'function' && isLocked(t))){   // printing a finalized event changes nothing
    t.printedPack = true;
    if(t.printSettings.lineupSheetEnabled) markLineupsPrinted(lineupReadyMatches(t, true));   // the pack prints every ready knockout lineup sheet
    persist();
  }
  /* the sheets are drawn in the event's print language (printSettings.sheetLang), whatever the screen shows */
  var html = ddWithLang(ddPrintLang(), function(){
    var h = '';
    if(t.printSettings.rulesSheetEnabled) h += rulesSheetHTML();
    if(t.printSettings.playersSheetEnabled !== false) h += bpPlayersSheetsHTML(t);
    if(t.printSettings.boardsSheetEnabled !== false) h += bpBoardsSheetHTML(t);
    pods.forEach(function(p){ h += knockoutBracketSheetHTML(p.bracket, { podLegs:true, stage:T('grp.label', {g: p.label})+' · '+podBoardLabel(p), qrPath:'bracket/group-'+encodeURIComponent(p.label) }); });
    if(podsFinals(t)) h += knockoutBracketSheetHTML(podsFinals(t), { qrPath:'bracket/finals' });
    if(t.printSettings.lineupSheetEnabled) h += knockoutLineupSheetsHTML();   // Teams only: '' otherwise
    return h;
  });
  document.getElementById('printSheets').innerHTML = html;
  setTimeout(function(){ window.print(); }, 60);
}

/* Group Boards screens: builds HTML strings and handles clicks for stages 2 to 7. All game logic lives in
   pods.js. Organisers see "Group"; the internal name is "pods" (state.pods) so it never clashes with the
   round-robin state.groups. Needs globals from index.html (state, persist, render, openModal, escapeHtml,
   nearestBracket, knockoutLegsFieldsHTML, ...). Only called while rendering or on a click. */

/* ---------- Stage 2: format settings ---------- */
function podsSummaryHTML(n, p){
  var v = podsValidateCount(n, p);
  if(!p) return '<b>Choose how many groups.</b> Players are dealt into this many small knockouts, and each group winner goes through to the Finals.';
  if(!v.ok) return '<b style="color:#c0392b">'+escapeHtml(v.message)+'</b>';
  var sizes = podSizes(n, p), min = sizes[sizes.length-1], max = sizes[0], fin = nearestBracket(p);
  return '<b>'+p+' groups of '+(min===max ? min : min+' to '+max)+' players.</b> Finals: '+(fin.size===8 ? 'an ' : 'a ')+fin.size+'-slot chart for '+p+' group winners'+
    (fin.byes ? ' ('+fin.byes+' bye'+(fin.byes===1?'':'s')+' for the strongest groups)' : '')+'.';
}
function podsFormatFieldsHTML(){
  var f = state.format, n = podsPlayerCount(state), p = parseInt(f.podCount) || 0, advanced = !!state.eventCreation.advancedMode;
  return '<div class="grid2">'+
      '<div class="field"><label>Best of legs (the Finals, and groups unless set below)</label><input id="f_bestof" type="number" min="1" step="2" value="'+f.bestOfLegs+'" oninput="warnBestOf(this);updateStage2Timing()"><div class="hint" id="bestOfHint"></div></div>'+
      '<div class="field"><label>Number of groups</label><input id="f_podcount" type="number" min="2" max="'+PODS_MAX+'" value="'+(p || '')+'" oninput="podsPreviewSettings()"></div>'+
    '</div>'+
    '<div class="grid2"><div class="field"><label>Best of legs inside each group</label><input id="f_podlegs" type="number" min="1" step="2" value="'+(parseInt(f.podLegs) || parseInt(f.bestOfLegs) || 5)+'"></div><div></div></div>'+
    '<div class="recommend" id="podsSummary">'+podsSummaryHTML(n, p)+'</div>'+
    (advanced ? knockoutLegsFieldsHTML('main', f.knockoutLegs.main, 'Finals: increase legs at each stage (early rounds, quarterfinal, semifinal, final)') : '');
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
          (editable ? '<button class="btn ghost" style="padding:2px 8px;font-size:11px" onclick="podsMoveModal(\''+id+'\')">Move…</button>' : '')+'</div>';
      }).join('');
      return '<div style="border:1px solid var(--line);border-radius:10px;padding:10px 12px">'+
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px"><strong>Group '+escapeHtml(p.label)+'</strong>'+
          '<span class="hint" style="margin:0">'+p.entryIds.length+' players</span></div>'+
        '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;font-size:12px"><label style="margin:0">Board'+(p.boards.length === 1 ? '' : 's')+'</label>'+
          '<input type="text" style="width:90px;height:28px;font-size:12px" value="'+p.boards.join(', ')+'" onchange="setPodBoards(\''+p.id+'\',this.value)"></div>'+
        rows+'</div>';
    }).join('')+'</div>';
}

/* Shown on Stage 3 and 4 when the entry list no longer matches the drawn groups. */
function podsRosterWarningHTML(){
  var t = state, unplaced = podsUnplaced(t), gone = podsGone(t);
  if(!unplaced.length && !gone.length) return '';
  function name(id){ return escapeHtml((t.entriesList.find(function(e){ return e.id === id; }) || {}).name || 'Unknown'); }
  return '<div class="confirm-box" style="background:#fff8e5;border-color:#e8c86e;color:#65501d"><b>The entry list has changed since the draw</b>'+
    (unplaced.length ? '<div>'+unplaced.length+' player'+(unplaced.length === 1 ? ' isn\'t' : 's aren\'t')+' in a group: '+
      unplaced.map(function(id){ return name(id)+' <a href="javascript:void(0)" style="font-size:11px" onclick="podsPlaceModal(\''+id+'\')">Place…</a>'; }).join(', ')+'</div>' : '')+
    (gone.length ? '<div>'+gone.length+' player'+(gone.length === 1 ? ' was' : 's were')+' removed or withdrawn but still '+(gone.length === 1 ? 'sits' : 'sit')+' in a group: '+
      gone.map(name).join(', ')+' <a href="javascript:void(0)" style="font-size:11px" onclick="podsRemoveGoneClick()">Remove them</a></div>' : '')+
  '</div>';
}
/* Shown on Stage 3 and 4 when the number of groups in Format & branding no longer matches the drawn groups. */
function podsCountWarningHTML(){
  var drawn = podsList(state).length, want = parseInt(state.format.podCount) || 0;
  if(!drawn || drawn === want) return '';
  return '<div class="confirm-box" style="background:#fff8e5;border-color:#e8c86e;color:#65501d"><b>The draw no longer matches your settings</b>'+
    'The format asks for '+want+' groups but '+drawn+' groups are drawn. Time estimates follow the groups as drawn. '+
    (podsAnyScores(state) ? 'Groups can\'t be redrawn once scores have been entered, so set it back to '+drawn+' in Format &amp; branding.'
                          : 'Redraw the groups on the Groups step, or set it back to '+drawn+' in Format &amp; branding.')+'</div>';
}
function podsPlaceModal(entryId){
  var name = (state.entriesList.find(function(e){ return e.id === entryId; }) || {}).name || '';
  var opts = podsList(state).filter(podsCanEdit).map(function(p){ return '<option value="'+p.id+'">Group '+escapeHtml(p.label)+' ('+p.entryIds.length+' players)</option>'; }).join('');
  openModal({
    title:'Place '+name,
    bodyHTML: opts ? '<div class="field"><label>Into group</label><select id="plTo">'+opts+'</select></div>'
                   : '<p>Every group is confirmed or has scores. Unconfirm a group first.</p>',
    confirmLabel:'Place', confirmClass:'primary',
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
  if(!r.ok) openModal({ title:'Some players are still in a group', body:r.message, confirmLabel:'OK', confirmClass:'primary', onConfirm:function(){} });
  persist(); render();
}

function podsStage3(){
  var t = state, pods = podsList(t), v = podsValidate(t), scored = podsAnyScores(t);
  var html = stage3Knockout({ noControls:true, intro:'Draw the groups below.' });   // the Participants & Seeding panel, same as the knockout format
  html += '<div class="card"><h2>Groups</h2><p class="intro">'+
    (pods.length ? 'Check the draw below. Use Move… to move or swap a player before you confirm the groups.'
                 : 'Deals every player into '+(parseInt(t.format.podCount) || 0)+' groups, one board each. Seeded players are spread across the groups, one per group.')+'</p>'+
    (!v.ok ? '<div class="confirm-box" style="background:#fff8e5;border-color:#e8c86e;color:#65501d"><b>Check the number of groups</b>'+escapeHtml(v.message)+' <span style="text-decoration:underline;cursor:pointer" onclick="goStage(2)">Change it in Format &amp; branding</span></div>' : '')+
    (pods.length ? podsCountWarningHTML() + podsRosterWarningHTML() : '')+
    '<div class="buttonrow"><button class="btn '+(pods.length ? 'secondary' : 'primary')+'" '+(v.ok && !scored ? '' : 'disabled ')+'onclick="podsDrawClick()">'+(pods.length ? 'Redraw groups' : 'Draw groups')+'</button>'+
      '<button class="btn secondary" onclick="goStage(2)">Make changes</button>'+
      (pods.length ? '<button class="btn primary" onclick="goStage(4)">Continue to confirm →</button>' : '')+'</div>'+
    (scored ? '<div class="hint">Groups can\'t be redrawn once scores have been entered.</div>' : '')+
    (pods.length ? podsCardsHTML(pods) : '')+'</div>';
  return html;
}

function podsDrawNow(){
  var r = generatePods(state);
  if(!r.ok){ openModal({ title:'Can\'t draw the groups', body:r.message, confirmLabel:'OK', confirmClass:'primary', onConfirm:function(){} }); return; }
  persist(); render();
}
function podsDrawClick(){
  if(podsAnyScores(state)) return;
  if(!podsList(state).length){ podsDrawNow(); return; }
  openModal({ title:'Redraw groups?', body:'Everyone is dealt again from the current seed order. Moves you made by hand, and any confirmed groups, are discarded.',
    confirmLabel:'Redraw', confirmClass:'danger', onConfirm:function(){ podsDrawNow(); } });
}

/* Board numbers typed as "2, 4" or "2 4". Blank or invalid input leaves the boards as they were. Boards never affect
   results, so they stay editable after a group is confirmed or scored (a board can break mid-event). */
function setPodBoards(podId, text){
  var pod = podsList(state).find(function(p){ return p.id === podId; });
  if(!pod) return;
  var nums = String(text).split(/[\s,]+/).map(function(x){ return parseInt(x); }).filter(function(n){ return n > 0; });
  if(!nums.length){ render(); return; }
  pod.boards = nums.filter(function(n, i){ return nums.indexOf(n) === i; }).sort(function(a, b){ return a - b; });
  persist(); render();
}

function podsMoveFillSwap(){
  var to = document.getElementById('mvTo'), sw = document.getElementById('mvSwap');
  if(!to || !sw) return;
  var pod = podsList(state).find(function(p){ return p.id === to.value; });
  sw.innerHTML = '<option value="">No swap</option>'+(pod ? pod.entryIds.map(function(id){
    return '<option value="'+id+'">'+escapeHtml((state.entriesList.find(function(e){ return e.id === id; }) || {}).name || '')+'</option>';
  }).join('') : '');
}
function podsMoveModal(entryId){
  var from = podsFindOf(state, entryId);
  if(!from) return;
  var name = (state.entriesList.find(function(e){ return e.id === entryId; }) || {}).name || '';
  var opts = podsList(state).filter(function(p){ return p.id !== from.id && podsCanEdit(p); }).map(function(p){
    return '<option value="'+p.id+'">Group '+escapeHtml(p.label)+' ('+p.entryIds.length+' players)</option>';
  }).join('');
  openModal({
    title:'Move '+name,
    bodyHTML: opts
      ? '<div class="field"><label>To group</label><select id="mvTo" onchange="podsMoveFillSwap()">'+opts+'</select></div>'+
        '<div class="field"><label>Swap with (optional)</label><select id="mvSwap"></select></div>'+
        '<div class="hint">Leave "No swap" to just move the player. The other group then has one more player.</div>'
      : '<p>There is no other group that can be changed. Unconfirm a group first.</p>',
    confirmLabel:'Move', confirmClass:'primary',
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
    return html + '<div class="card"><h2>Confirm groups</h2><p class="intro">Draw the groups in Chart details first.</p><div class="buttonrow"><button class="btn primary" onclick="goStage(3)">Go to chart details</button></div></div>';
  }
  html += '<div class="card"><h2>Confirm groups &amp; build the Finals</h2>'+
    '<p class="intro">Confirm each group once its draw is right. When the last group is confirmed, the Finals chart is built with "Winner of Group N" placeholders. A group with scores can\'t be unconfirmed.</p>'+
    '<div class="summary-grid" style="margin-bottom:12px"><div><label>Groups confirmed</label><strong>'+prog.confirmed+' of '+prog.total+'</strong></div>'+
      '<div><label>Finals</label><strong>'+(podsFinals(t) ? podsFinals(t).size+'-slot chart built' : 'Not built yet')+'</strong></div></div>'+
    '<div class="buttonrow"><button class="btn primary" '+(prog.confirmed === prog.total ? 'disabled ' : '')+'onclick="podsConfirmAllClick()">Confirm all groups</button>'+
      (podsFinals(t) ? '<button class="btn secondary" onclick="doFinalPrint()">Print bracket pack</button><button class="btn primary" onclick="goStage(5)">Continue to manage tournament →</button>' : '')+'</div>'+
    '<div class="printlist">'+pods.map(function(p){
      return '<div><span>Group '+escapeHtml(p.label)+' — '+p.entryIds.length+' players · '+podBoardLabel(p)+'</span><span>'+
        (p.confirmed
          ? '<b style="color:#1d8a4a">Confirmed</b> <a href="javascript:void(0)" style="font-size:11px" onclick="podsUnconfirmClick(\''+p.id+'\')">Unconfirm</a>'
          : '<b style="color:#c0392b">Not confirmed</b> <a href="javascript:void(0)" style="font-size:11px" onclick="podsConfirmClick(\''+p.id+'\')">Confirm</a>')+'</span></div>';
    }).join('')+'</div></div>';
  if(podsFinals(t)) html += '<div class="card"><h3 style="margin:0 0 10px">Finals</h3><div class="mko-artboard-scroll">'+mirroredChartHTML(podsFinals(t), t, {interactive:false})+'</div></div>';
  return html;
}
function podsConfirmClick(id){ podsConfirm(state, id); persist(); render(); }
function podsConfirmAllClick(){ podsConfirmAll(state); persist(); render(); }
function podsUnconfirmClick(id){
  var r = podsUnconfirm(state, id);
  if(!r.ok){ openModal({ title:'Can\'t unconfirm', body:r.message, confirmLabel:'OK', confirmClass:'primary', onConfirm:function(){} }); return; }
  persist(); render();
}

/* ---------- Stage 5: manage the tournament ---------- */
var podsManageSel = 'grid';     // 'grid' | 'finals' | a group id
var podsManageFilter = 'all';   // 'all' | 'open' | 'done'
function podsSelect(v){ podsManageSel = v; render(); }
function podsSetFilter(v){ podsManageFilter = v; render(); }

function podStatusText(p){
  if(!p.confirmed) return { text:'Not confirmed', color:'#c0392b' };
  var c = podMatchCounts(p), w = podChampion(p);
  if(w) return { text:'Winner: '+((state.entriesList.find(function(e){ return e.id === w; }) || {}).name || ''), color:'#1d8a4a' };
  if(!c.done) return { text:'Not started', color:'var(--muted)' };
  return { text:'In progress · '+c.done+' of '+c.total+' matches', color:'#b7791f' };
}
function podsFilterBarHTML(){
  function b(v, label){ return '<button class="btn '+(podsManageFilter === v ? 'primary' : 'ghost')+'" style="padding:6px 12px;font-size:12px" onclick="podsSetFilter(\''+v+'\')">'+label+'</button>'; }
  return '<div class="buttonrow" style="margin:0 0 10px">'+b('all', 'All')+b('open', 'Unfinished')+b('done', 'Finished')+'</div>';
}
function podsGridHTML(pods){
  var list = pods.filter(function(p){ return podsManageFilter === 'all' || (podsManageFilter === 'done') === podIsFinished(p); });
  if(!list.length) return '<p class="intro">No groups to show.</p>';
  return '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px">'+list.map(function(p){
    var st = podStatusText(p);
    return '<div onclick="podsSelect(\''+p.id+'\')" style="cursor:pointer;border:1px solid var(--line);border-radius:10px;padding:10px 12px">'+
      '<div style="display:flex;justify-content:space-between"><strong>Group '+escapeHtml(p.label)+'</strong><span class="hint" style="margin:0">'+podBoardLabel(p)+'</span></div>'+
      '<div style="font-size:12px;color:'+st.color+';margin-top:4px">'+escapeHtml(st.text)+'</div></div>';
  }).join('')+'</div>';
}
function podsStage5(){
  var t = state, pods = podsList(t);
  if(!pods.some(function(p){ return p.confirmed; })){
    return '<div class="card"><h2>Manage tournament</h2>'+competitionDurationSummaryHTML(t)+'<p class="intro">Confirm the groups in Confirm &amp; Print Bracket before you can enter results here.</p><div class="buttonrow"><button class="btn primary" onclick="goStage(4)">Confirm groups</button></div></div>';
  }
  var prog = podsProgress(t), sel = podsManageSel;
  var selPod = pods.find(function(p){ return p.id === sel; });
  if(sel !== 'grid' && sel !== 'finals' && !selPod) sel = podsManageSel = 'grid';
  if(sel === 'finals' && !podsFinals(t)) sel = podsManageSel = 'grid';
  var html = '<div class="card"><div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap"><h2 style="margin:0">Manage tournament</h2>'+
    '<span class="hint" style="margin:0"><b>'+prog.finished+' of '+prog.total+'</b> groups finished</span></div>'+
    '<p class="intro">Open a group to enter its results. Each group winner moves into the Finals automatically.</p>'+competitionDurationSummaryHTML(t)+
    '<div class="buttonrow" style="margin-bottom:10px">'+
      '<button class="btn '+(sel === 'grid' ? 'primary' : 'secondary')+'" onclick="podsSelect(\'grid\')">All groups</button>'+
      (podsFinals(t) ? '<button class="btn '+(sel === 'finals' ? 'primary' : 'secondary')+'" onclick="podsSelect(\'finals\')">Finals</button>'
                  : '<span class="hint" style="margin:0 0 0 6px">The Finals is built once every group is confirmed.</span>')+
    '</div>';
  if(sel === 'grid'){
    html += podsFilterBarHTML() + podsGridHTML(pods);
  } else if(sel === 'finals'){
    html += '<div class="mko-artboard-scroll">'+mirroredChartHTML(podsFinals(t), t, {interactive:true, bracketKey:'knockout'})+'</div>';
  } else {
    html += '<div class="buttonrow" style="margin-bottom:10px"><button class="btn ghost" onclick="podsSelect(\'grid\')">← All groups</button></div>'+
      '<h3 style="margin:0 0 8px">Group '+escapeHtml(selPod.label)+' · '+podBoardLabel(selPod)+'</h3>'+
      '<div style="display:flex;align-items:center;gap:6px;margin-bottom:10px;font-size:12px"><label style="margin:0">Change board'+(selPod.boards.length === 1 ? '' : 's')+'</label>'+
        '<input type="text" style="width:100px;height:28px;font-size:12px" value="'+selPod.boards.join(', ')+'" onchange="setPodBoards(\''+selPod.id+'\',this.value)"></div>'+
      (selPod.confirmed ? '' : '<div class="confirm-box">Confirm this group in Confirm &amp; Print Bracket before entering results.</div>')+
      '<div class="mko-artboard-scroll">'+mirroredChartHTML(selPod.bracket, t, {interactive:selPod.confirmed, bracketKey:podBracketKey(selPod)})+'</div>';
  }
  html += '</div>';
  html += publicResultsCardHTML();
  html += incidentLogCardHTML();
  return html;
}

/* ---------- Stage 6: results ---------- */
function podsStage6(){
  var t = state, pods = podsList(t);
  if(!pods.length) return '<div class="card"><p class="intro" style="margin:0">No groups yet. Draw them in Chart details.</p></div>';
  function name(id){ return id ? ((t.entriesList.find(function(e){ return e.id === id; }) || {}).name || '—') : '—'; }
  var rows = pods.map(function(p){
    var w = podChampion(p), r = w ? bracketRunnerUp(p.bracket) : null;
    return '<tr><td class="l">'+escapeHtml(p.label)+'</td><td class="l">'+escapeHtml(name(w))+'</td><td class="l">'+escapeHtml(name(r))+'</td><td class="dim">'+podBoardLabel(p)+'</td></tr>';
  }).join('');
  var html = '<div class="card"><h2>Finalize standings</h2><p class="intro">Group winners and Finals placings. Read-only: fix a result in Manage Tournament if needed.</p></div>'+
    '<div class="card"><h3 style="margin:0 0 10px;font-size:15px">Group winners</h3><div style="overflow-x:auto"><table class="std-table"><thead><tr><th class="l">Group</th><th class="l">Winner</th><th class="l">Runner-up</th><th>Board</th></tr></thead><tbody>'+rows+'</tbody></table></div></div>';
  if(podsFinals(t)) html += knockoutPlacementsCard(podsFinals(t), 'Finals');
  html += '<div class="print-controls"><button class="btn secondary" onclick="goStage(5)">Back to manage tournament</button><button class="btn primary" onclick="goStage(7)">Continue to print →</button></div>';
  return html;
}

/* ---------- Stage 7: print ---------- */
function podsStage7(){
  var t = state, pods = podsList(t), built = !!podsFinals(t);
  return '<div class="card"><h2>Print final chart</h2><p class="intro">Prints one sheet per group, then the Finals, with results filled in, as a high-resolution A4 landscape PDF.</p>'+
    '<div class="summary-grid" style="margin-bottom:12px"><div><label>Group sheets</label><strong>'+pods.length+'</strong></div>'+
      '<div><label>Finals</label><strong>'+(built ? 'Included' : 'Not built yet')+'</strong></div></div>'+
    '<div class="toggle-row"><input type="checkbox" id="sponsorToggle" '+(t.printSettings.sponsorFooterEnabled ? 'checked' : '')+' onchange="toggleSponsorFooter(this.checked)"> <label for="sponsorToggle">Include sponsor footer on printed charts</label></div>'+
    rulesSheetToggleHTML()+(built ? koPaperSizeSelectHTML() : '')+
    '<div class="buttonrow"><button class="btn secondary" onclick="goStage(6)">Back to standings</button>'+
      '<button class="btn '+(pods.length ? 'primary' : 'secondary')+'" '+(pods.length ? '' : 'disabled ')+'onclick="doFinalPrint()">Print final chart — Save high-res A4 PDF</button></div></div>';
}
function podsPrintClick(){
  var t = state, pods = podsList(t);
  if(!pods.length){ openModal({ title:'No groups yet', body:'Draw the groups first.', confirmLabel:'OK', confirmClass:'primary', onConfirm:function(){} }); return; }
  t.printedPack = true; persist();
  var html = '';
  if(t.printSettings.rulesSheetEnabled) html += rulesSheetHTML();
  pods.forEach(function(p){ html += knockoutBracketSheetHTML(p.bracket, { podLegs:true, stage:'Group '+p.label+' · '+podBoardLabel(p) }); });
  if(podsFinals(t)) html += knockoutBracketSheetHTML(podsFinals(t));
  document.getElementById('printSheets').innerHTML = html;
  setTimeout(function(){ window.print(); }, 60);
}

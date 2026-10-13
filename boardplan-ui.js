/* Board schedule screens for Group Boards: the organiser's Boards panel and the two print sheets. The plan itself
   comes from boardplan.js. Needs globals from index.html (state, persist, render, escapeHtml, goStage, koRoundName,
   epochClockLabel, koMatchScoreModal, openKoNoShowPicker, ...). Only called while rendering or on a click. */

/* ---------- Boards panel (Stage 5) ---------- */
/* Plan entries call the Finals 'ko'; the organiser's own bracket key for it is 'knockout'. */
function bpOrgKey(key){ return key === 'ko' ? 'knockout' : key; }
function bpMatchOf(t, e){ var b = bpBracket(t, e.key); return b && b.rounds[e.ri] ? b.rounds[e.ri][e.mi] : null; }
function bpSlotName(t, m, side){
  var id = m[side+'EntryId'], from = m[side+'FromPod'];
  if(id) return (t.entriesList.find(function(e){ return e.id === id; }) || {}).name || 'Unknown';
  if(from){ var p = podsList(t).find(function(x){ return x.id === from; }); return p && podNoWinner(p) ? 'Group '+p.label+': no winner' : 'Winner of Group '+(p ? p.label : '?'); }
  return 'To be decided';
}
function bpWhere(t, e){
  var b = bpBracket(t, e.key), round = b ? koRoundName(b, e.ri) : '';
  if(e.key === 'ko') return 'Finals · '+round;
  var p = podByKey(t, e.key);
  return 'Group '+(p ? p.label : '?')+' · '+round;
}
function bpEntryRowHTML(t, e, label){
  var m = bpMatchOf(t, e);
  if(!m) return '';
  var args = "'"+bpOrgKey(e.key)+"',"+e.ri+','+e.mi, btn = 'style="padding:3px 9px;font-size:11px"';
  var buttons = e.ready
    ? '<button class="btn ghost" '+btn+' onclick="bpToggleCall('+args+')">'+(m.called ? 'Uncall' : 'Call')+'</button>'+
      '<button class="btn ghost" '+btn+' onclick="koMatchScoreModal('+args+')">Enter result</button>'+
      '<button class="btn ghost" '+btn+' onclick="openKoNoShowPicker('+args+')">No-show</button>'
    : '';
  return '<div style="padding:8px 0;border-top:1px solid var(--line)">'+
    '<div style="font-size:12px"><b>'+(m.called ? 'Called' : label)+'</b> · '+escapeHtml(bpWhere(t, e))+(e.estMs != null ? ' · ~'+escapeHtml(epochClockLabel(e.estMs)) : '')+'</div>'+
    '<div style="font-size:13px;margin:2px 0 6px">'+escapeHtml(bpSlotName(t, m, 'a'))+' v '+escapeHtml(bpSlotName(t, m, 'b'))+(e.ready ? '' : ' <span class="hint" style="margin:0">· waiting for an earlier match</span>')+'</div>'+
    (buttons ? '<div class="buttonrow" style="margin:0">'+buttons+'</div>' : '')+'</div>';
}
function bpPanelHTML(){
  var t = state, plan = buildBoardPlan(t);
  var boards = Object.keys(plan.boards).sort(function(a, b){ return a - b; });
  if(!boards.length) return '';
  var cards = boards.map(function(b){
    var pending = plan.boards[b].filter(function(e){ return e.status !== 'done'; });
    var shown = pending.slice(0, 2), more = pending.length - shown.length;
    return '<div style="border:1px solid var(--line);border-radius:10px;padding:10px 12px">'+
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px"><strong>Board '+b+'</strong><span class="hint" style="margin:0">'+(pending.length ? pending.length+' to play' : 'Finished')+'</span></div>'+
      shown.map(function(e){ return bpEntryRowHTML(t, e, e.status === 'up' ? 'Up now' : 'Next'); }).join('')+
      (more > 0 ? '<div class="hint" style="margin:6px 0 0">'+more+' more after these</div>' : '')+'</div>';
  }).join('');
  return '<div class="card"><h2>Boards</h2><p class="intro">What is on each board now and next. Call a match to tell the players, on the public results page, to go to their board.</p>'+
    (plan.hasTimes ? '' : '<div class="hint" style="margin-bottom:8px">Estimated times are off. Set an anticipated start time in <a href="javascript:void(0)" onclick="goStage(2)">Format &amp; branding</a> to switch them on.</div>')+
    '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;margin-top:10px">'+cards+'</div>'+
    bpFinalsBoardsHTML(t, plan)+'</div>';
}
/* Every Finals match with a board box, so the final can be moved to a feature board. Blank means automatic. */
function bpFinalsBoardsHTML(t, plan){
  var fin = podsFinals(t);
  if(!fin) return '';
  var auto = {};
  Object.keys(plan.boards).forEach(function(b){ plan.boards[b].forEach(function(e){ if(e.key === 'ko') auto[e.ri+'|'+e.mi] = b; }); });
  var rows = '';
  fin.rounds.forEach(function(round, ri){ round.forEach(function(m, mi){
    if(m.bye || m.void) return;
    rows += '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:5px 0;font-size:12px"><span>'+
      escapeHtml(koRoundName(fin, ri))+' · '+escapeHtml(bpSlotName(t, m, 'a'))+' v '+escapeHtml(bpSlotName(t, m, 'b'))+'</span>'+
      '<span>Board <input type="text" inputmode="numeric" style="width:54px;height:26px;font-size:12px" value="'+escapeHtml(String(m.board || ''))+'" placeholder="'+escapeHtml(String(auto[ri+'|'+mi] || ''))+'" onchange="bpSetFinalsBoard('+ri+','+mi+',this.value)"></span></div>';
  }); });
  return '<details style="margin-top:12px"><summary style="cursor:pointer;font-weight:600">Finals boards</summary>'+
    '<p class="hint" style="margin:6px 0">Leave a box blank to let the app choose. A number puts that match on that board.</p>'+rows+'</details>';
}
function bpToggleCall(bracketKey, ri, mi){
  var b = bracketByKey(state, bracketKey), m = b && b.rounds[ri] && b.rounds[ri][mi];
  if(!m) return;
  if(m.called){ delete m.called; delete m.calledAt; delete m.calledPair; }  // a call can always be cleared
  else if(m.winnerId || m.bye || m.void || !m.aEntryId || !m.bEntryId) return;       // but only a playable match can be called
  else { m.called = true; m.calledAt = Date.now(); m.calledPair = m.aEntryId + '|' + m.bEntryId; }
  persist(); render();
}
function bpSetFinalsBoard(ri, mi, text){
  var fin = podsFinals(state), m = fin && fin.rounds[ri] && fin.rounds[ri][mi];
  if(!m) return;
  var n = parseInt(text);
  if(n > 0 && n <= 9999) m.board = n; else delete m.board;
  persist(); render();
}

/* ---------- Print sheets (Stage 7) ---------- */
function bpClock(ms){ return ms == null ? '' : '~'+epochClockLabel(ms); }

/* One row per active player who is in a confirmed group, alphabetical (ignoring case). startMs is when the
   player's group is expected to start (null when no start time is set). */
function bpPlayerRows(t){
  var plan = buildBoardPlan(t, { starts:true }), first = {};
  Object.keys(plan.boards).forEach(function(b){ plan.boards[b].forEach(function(e){
    if(e.key === 'ko' || e.startMs == null) return;
    if(first[e.key] == null || e.startMs < first[e.key]) first[e.key] = e.startMs;
  }); });
  var active = {};
  t.entriesList.forEach(function(e){ if(!e.withdrawn) active[e.id] = e; });
  var rows = [];
  podsList(t).filter(function(p){ return p.confirmed; }).forEach(function(p){
    p.entryIds.forEach(function(id){
      var e = active[id];
      if(!e) return;
      rows.push({ name:e.name || '', org:e.org || '', group:p.label, boards:p.boards.join(', '), startMs:first['pod:'+p.id] == null ? null : first['pod:'+p.id] });
    });
  });
  rows.sort(function(a, b){ return a.name.toLowerCase().localeCompare(b.name.toLowerCase()); });
  return rows;
}
/* The header and footer every sheet in the pack shares (same pattern as the rules sheet). */
function bpSheetShell(t, title, subtitle, inner){
  var qr = printQrBlockHTML(t);
  return '<div class="print-sheet ro-sheet">'+
    '<div class="sheet-top"'+printQrHeaderAttr(qr)+'>'+mainLogoBoxHTML()+
      '<div><div class="title-overline">'+escapeHtml(t.eventCreation.tournamentName)+'</div><div class="sheet-title">'+escapeHtml(t.eventCreation.eventName)+'</div>'+
      '<div class="sheet-sub">'+escapeHtml(t.eventCreation.eventType)+' '+escapeHtml(t.eventCreation.competitionUnit)+' · '+escapeHtml(t.eventCreation.date||'')+'</div></div>'+
      '<div class="group-label"><strong>'+escapeHtml(title)+'</strong><span>'+escapeHtml(subtitle)+'</span></div>'+qr+
    '</div>'+inner+
    '<div class="footer" style="margin-top:14px"><small>'+(t.format.footerText ? escapeHtml(t.format.footerText) : '')+'</small><div class="footer-right">'+DD_CREDIT_HTML+'</div></div>'+
  '</div>';
}
var BP_ROWS_PER_SHEET = 36, BP_BOARDS_PER_SHEET = 14;   /* what fits on one fixed-height sheet */
function bpPlayersSheetsHTML(t){
  var rows = bpPlayerRows(t);
  if(!rows.length) return '';
  var sheets = Math.ceil(rows.length / BP_ROWS_PER_SHEET), html = '';
  for(var s = 0; s < sheets; s++){
    var chunk = rows.slice(s * BP_ROWS_PER_SHEET, (s + 1) * BP_ROWS_PER_SHEET);
    var body = '<div style="column-count:2;column-gap:28px;margin-top:10px">'+chunk.map(function(r){
      return '<div style="break-inside:avoid;display:flex;justify-content:space-between;gap:8px;padding:5px 0;border-bottom:1px solid #d7dce1;font-size:12px">'+
        '<span><b>'+escapeHtml(r.name)+'</b>'+(r.org ? ' <small style="color:#6f7c8b">'+escapeHtml(r.org)+'</small>' : '')+'</span>'+
        '<span style="white-space:nowrap">Group '+escapeHtml(r.group)+' · Board '+escapeHtml(r.boards)+(r.startMs != null ? ' · '+escapeHtml(bpClock(r.startMs)) : '')+'</span></div>';
    }).join('')+'</div>';
    html += bpSheetShell(t, 'PLAYERS A–Z', 'Find your group and board'+(sheets > 1 ? ' · Sheet '+(s + 1)+' of '+sheets : ''), body);
  }
  return html;
}
function bpBoardsSheetHTML(t){
  var plan = buildBoardPlan(t, { starts:true });
  var boards = Object.keys(plan.boards).sort(function(a, b){ return a - b; });
  if(!boards.length) return '';
  var rows = boards.map(function(b){
    var seen = {}, parts = [], finals = 0;
    plan.boards[b].forEach(function(e){
      if(e.key === 'ko'){ finals++; return; }
      if(seen[e.key]) return;
      seen[e.key] = true;
      var p = podByKey(t, e.key);
      parts.push('Group '+escapeHtml(p ? p.label : '?')+(e.startMs != null ? ' <small>('+escapeHtml(bpClock(e.startMs))+')</small>' : ''));
    });
    if(finals) parts.push('Finals ('+finals+' match'+(finals === 1 ? '' : 'es')+')');
    return '<div style="display:flex;gap:14px;padding:8px 0;border-bottom:1px solid #d7dce1;font-size:13px"><b style="min-width:70px">Board '+escapeHtml(b)+'</b><span>'+parts.join(' → ')+'</span></div>';
  });
  var sheets = Math.ceil(rows.length / BP_BOARDS_PER_SHEET), html = '';
  for(var s = 0; s < sheets; s++){
    html += bpSheetShell(t, 'BOARDS', 'Groups in the order they play'+(sheets > 1 ? ' · Sheet '+(s + 1)+' of '+sheets : ''),
      '<div style="margin-top:10px">'+rows.slice(s * BP_BOARDS_PER_SHEET, (s + 1) * BP_BOARDS_PER_SHEET).join('')+'</div>');
  }
  return html;
}
function playersSheetToggleHTML(){
  return '<div class="toggle-row"><input type="checkbox" id="playersSheetToggle" '+(state.printSettings.playersSheetEnabled !== false ? 'checked' : '')+' onchange="togglePlayersSheet(this.checked)"> <label for="playersSheetToggle">Include the Players A–Z sheet (name, group and board, for the wall)</label></div>';
}
function boardsSheetToggleHTML(){
  return '<div class="toggle-row"><input type="checkbox" id="boardsSheetToggle" '+(state.printSettings.boardsSheetEnabled !== false ? 'checked' : '')+' onchange="toggleBoardsSheet(this.checked)"> <label for="boardsSheetToggle">Include the Boards sheet (which groups play on each board)</label></div>';
}
function togglePlayersSheet(v){ state.printSettings.playersSheetEnabled = v; persist(); render(); }
function toggleBoardsSheet(v){ state.printSettings.boardsSheetEnabled = v; persist(); render(); }

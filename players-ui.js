/* Player library in the organiser app (spec: docs/superpowers/specs/2026-10-29-player-library-design.md).
   - The organiser's players are loaded once (GET /api/players/list) into libraryState and searched here as you type.
   - Step 3 builds the entries: a search box for Singles, "Add pair" for Doubles, "Add team" for Teams (and Triples).
     A typed new name is either saved to the library ("Add ... as a new player") or kept in this event only
     ("Add to this event only", e.g. a nickname: member.eventOnly, never sent to the library).
   - An entry keeps its own copies: entry.members = [{ playerId, name, club, eventOnly? }], entry.teamName (Doubles:
     optional, Teams: required) and entry.name, the display name (entryDisplayName), which is all that render, print
     and the public viewer use. Changing the library never changes an event.
   - Names added while the library could not be reached keep playerId null; scheduleLibrarySync() (called after every
     persist and when the browser is back online) sends them to /api/players/ensure and writes the ids back.
   - The Players page (sidebar) lists, searches, adds, edits, removes and merges players, and adds the players of a
     past event.
   Needs globals from app.html: state, currentOrganizer, tournamentsCache, apiFetch, persist, render, openModal,
   closeModal, T, escText, escJs, escapeHtml, uid, isLocked, entryGrowthBlocked, showEntryLimitModal, entryLimit,
   ensureSeedOrder, ddDateNum. Only called while rendering or on a click. */

var libraryState = { players: null, status: 'idle', syncBlocked: false };   // status: idle | loading | ready | not_set_up | error; syncBlocked: the list is full (no retries until it is loaded again)
var PL_SEARCH_MAX = 8;

/* ---------- loading and searching ---------- */
async function loadLibrary(force){
  if(libraryState.status === 'loading' || (libraryState.status === 'ready' && !force)) return;
  libraryState.status = 'loading';
  try{
    var res = await apiFetch('/api/players/list');
    var data = await res.json().catch(function(){ return {}; });
    if(res.ok && data && Array.isArray(data.players)){ libraryState.players = data.players; libraryState.status = 'ready'; libraryState.syncBlocked = false; }
    else libraryState.status = (data && data.code === 'library_not_set_up') ? 'not_set_up' : 'error';
  }catch(e){ libraryState.status = 'error'; }
  if(playersPage.open) render();
  else plRefreshPicker();
}
/* Lower case, accents dropped, spaces collapsed: "  Ahmád  " and "ahmad" compare equal. */
function libFold(s){
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
function libCleanName(s){ return String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80).trim(); }
/* Players whose name or club has a word starting with every word typed. limit 0 = all. */
function searchLibrary(q, limit){
  var list = libraryState.players || [];
  var words = libFold(q).split(' ').filter(Boolean);
  if(!words.length) return limit ? [] : list.slice();
  var out = [];
  for(var i = 0; i < list.length; i++){
    var p = list[i];
    var hay = (' ' + libFold(p.name) + ' ' + libFold(p.club)).replace(/[^\p{L}\p{N} ]/gu, ' ');
    if(words.every(function(w){ return hay.indexOf(' ' + w.replace(/[^\p{L}\p{N}]/gu, '')) >= 0; })){
      out.push(p);
      if(limit && out.length >= limit) break;
    }
  }
  return out;
}
function libraryPlayer(id){ return (libraryState.players || []).find(function(p){ return p.id === id; }) || null; }
/* Saves names to the library (or finds them there). -> [{ id, name, club, created }] in the same order, or null when
   the library cannot be reached or is not set up (the caller carries on without ids). */
async function libraryEnsure(items){
  if(libraryState.status === 'not_set_up' || !items.length) return null;
  try{
    var res = await apiFetch('/api/players/ensure', { method: 'POST', body: JSON.stringify({ players: items }) });
    var data = await res.json().catch(function(){ return {}; });
    if(!res.ok){
      if(data && data.code === 'library_not_set_up') libraryState.status = 'not_set_up';
      if(data && data.code === 'player_limit'){ libraryState.syncBlocked = true; return { error: data.error }; }
      return null;
    }
    var list = libraryState.players || (libraryState.players = []);
    data.players.forEach(function(p){
      if(!list.some(function(x){ return x.id === p.id; })) list.push({ id: p.id, name: p.name, club: p.club, eventsPlayed: 0, lastPlayed: null });
    });
    list.sort(function(a, b){ return libFold(a.name).localeCompare(libFold(b.name)) || libFold(a.club).localeCompare(libFold(b.club)); });
    return data.players;
  }catch(e){ return null; }
}

/* True while an Admin has another organiser's event open (admin-ui.js foreignOpenIds): the Admin's own player list must
   not be searched or added to for it, so names are added to that event only. */
function plForeign(t){ t = t || state; return !!(t && typeof foreignOpenIds !== 'undefined' && foreignOpenIds.has(t.id)); }
function plOwnEventIds(){ return Object.keys(tournamentsCache || {}).filter(function(id){ return !(typeof foreignOpenIds !== 'undefined' && foreignOpenIds.has(id)); }); }

/* ---------- background sync: names typed while the library was unreachable ---------- */
var librarySyncTimer = null, librarySyncBusy = false;
function scheduleLibrarySync(){
  if(librarySyncTimer) clearTimeout(librarySyncTimer);
  librarySyncTimer = setTimeout(runLibrarySync, 2000);
}
function librarySyncPending(t){
  var out = [];
  ((t && t.entriesList) || []).forEach(function(e){
    (e.members || []).forEach(function(m){ if(m && !m.playerId && !m.eventOnly && libCleanName(m.name)) out.push(m); });
  });
  return out;
}
async function runLibrarySync(){
  librarySyncTimer = null;
  var t = state;
  if(librarySyncBusy || !t || t.isSample || isLocked(t) || libraryState.status === 'not_set_up' || libraryState.syncBlocked) return;
  if(plForeign(t)) return;   // an Admin viewing someone else's event
  var pending = librarySyncPending(t).slice(0, 200);
  if(!pending.length) return;
  librarySyncBusy = true;
  try{
    var sent = pending.map(function(m){ return { name: libCleanName(m.name), club: libCleanName(m.club) }; });
    var got = await libraryEnsure(sent);
    if(!got || got.error || state !== t) return;
    var linked = 0;
    pending.forEach(function(m, i){
      /* renamed (or edited) while the request was out: the id belongs to the old name, so leave it for the next sync */
      if(m.playerId || !got[i] || m.eventOnly || libCleanName(m.name) !== sent[i].name || libCleanName(m.club) !== sent[i].club) return;
      m.playerId = got[i].id; linked++;
    });
    if(linked) persist();
  } finally { librarySyncBusy = false; }
}
if(typeof window !== 'undefined' && window.addEventListener) window.addEventListener('online', function(){ scheduleLibrarySync(); });

/* ---------- the entry model ---------- */
function plUnit(t){ var u = (t || state).eventCreation.competitionUnit; return u === 'Triples' ? 'Teams' : (u || 'Singles'); }
function entryDisplayName(unit, teamName, members){
  var names = (members || []).map(function(m){ return libCleanName(m && m.name); }).filter(Boolean);
  var team = libCleanName(teamName);
  if(unit === 'Doubles') return team ? team + ' : ' + names.join(' / ') : names.join(' / ');
  if(unit === 'Teams' || unit === 'Triples') return team;
  return names[0] || '';
}
function entryClubFromMembers(members){
  var clubs = (members || []).map(function(m){ return libCleanName(m && m.club); });
  return clubs.length && clubs[0] && clubs.every(function(c){ return libFold(c) === libFold(clubs[0]); }) ? clubs[0] : '';
}
/* True once groups, a bracket or pods exist: entries are then withdrawn, not removed. */
function libDrawExists(t){ t = t || state; return !!((t.groups && t.groups.length) || t.knockout || (t.pods && t.pods.length)); }
function activeEntryCount(t){ return ((t || state).entriesList || []).filter(function(e){ return !e.withdrawn; }).length; }
/* The entry (withdrawn ones included) that already has this player, or null. By library id, else by name. */
function memberInUse(t, m, exceptEntryId){
  var fold = libFold(m && m.name);
  return (t.entriesList || []).find(function(e){
    if(e.id === exceptEntryId) return false;
    var members = e.members || (e.autoName ? [] : [{ name: e.name }]);   // an older Singles entry counts by its name
    if(e.members === undefined && plUnit(t) !== 'Singles') members = [];
    return members.some(function(x){
      if(!x) return false;
      if(m.playerId && x.playerId) return x.playerId === m.playerId;
      return fold && libFold(x.name) === fold;
    });
  }) || null;
}
/* Why these members cannot be added ('' when they can). plain: text for a box's error line (not HTML). */
function plInUseMessage(t, members, exceptEntryId, plain){
  var esc = plain ? function(v){ return String(v == null ? '' : v); } : escText;
  for(var i = 0; i < members.length; i++){
    var hit = memberInUse(t, members[i], exceptEntryId);
    if(hit) return T('pl.inUse', { name: esc(members[i].name), entry: esc(hit.teamName || hit.name) });
  }
  for(var j = 0; j < members.length; j++){
    for(var k = j + 1; k < members.length; k++){
      var a = members[j], b = members[k];
      if((a.playerId && a.playerId === b.playerId) || libFold(a.name) === libFold(b.name)) return T('pl.twice', { name: esc(a.name) });
    }
  }
  return '';
}
function plCleanMember(m){
  var out = { playerId: m.playerId || null, name: libCleanName(m.name), club: libCleanName(m.club) };
  if(m.eventOnly) out.eventOnly = true;
  return out;
}
/* Adds an entry made of these members. -> the entry, or null when refused (limit, a player already in an entry). */
function addEntryFromMembers(unit, teamName, members, club){
  if(isLocked(state) || libDrawExists(state)) return null;
  var active = activeEntryCount(state);
  if(entryGrowthBlocked(active + 1, active)){ showEntryLimitModal(); return null; }
  members = members.map(plCleanMember);
  var clash = plInUseMessage(state, members, null);
  if(clash){ openModal({ title: T('pl.inUseTitle'), body: clash, confirmLabel: T('m.ok'), confirmClass: 'primary', onConfirm: function(){} }); return null; }
  var e = { id: uid('e'), name: entryDisplayName(unit, teamName, members), org: club !== undefined ? libCleanName(club) : entryClubFromMembers(members),
    members: members, checkedIn: false, noShow: false };
  if(unit !== 'Singles') e.teamName = libCleanName(teamName);
  state.entriesList.push(e);
  if(state.format.formatType === 'knockout' || state.format.formatType === 'rrknockout') ensureSeedOrder(state);
  persist(); render();
  return e;
}
/* Takes an entry out of the event (only before the draw). */
function removeEntry(id){
  if(isLocked(state)){ finalizedBlockModal('changed'); return; }
  var ent = state.entriesList.find(function(e){ return e.id === id; });
  if(!ent || libDrawExists(state)) return;
  openModal({
    title: T('pl.removeTitle'), body: T('pl.removeConfirm', { name: escText(ent.name) }),
    confirmLabel: T('pl.remove'), confirmClass: 'danger',
    onConfirm: function(){
      if(libDrawExists(state)) return;
      state.entriesList = state.entriesList.filter(function(e){ return e.id !== id; });
      if(state.seedOrder) state.seedOrder = state.seedOrder.filter(function(x){ return x !== id; });
      persist(); render();
    }
  });
}
function needTwoEntriesModal(){ openModal({ title: T('pl.addTitle'), body: T('pl.needTwo'), confirmLabel: T('m.ok'), confirmClass: 'primary', onConfirm: function(){} }); }
function removeEntryButtonHTML(ent){
  if(libDrawExists(state) || isLocked(state)) return '';
  return '<button class="btn ghost" style="padding:6px 9px;font-size:10px" onclick="removeEntry(\'' + escJs(ent.id) + '\')">' + T('pl.remove') + '</button>';
}

/* ---------- step 3: the picker ---------- */
var pickerState = { q: '', club: '' };
function libraryNoteHTML(){
  if(plForeign()) return '<div class="hint">' + T('pl.foreignNote') + '</div>';
  if(libraryState.status === 'not_set_up') return '<div class="hint">' + T('pl.notSetUpPicker') + '</div>';
  if(libraryState.status === 'error') return '<div class="hint">' + T('pl.offline') + '</div>';
  return '';
}
function entryPickerHintHTML(){
  var n = activeEntryCount(state), lim = entryLimit();
  return '<div class="hint" style="margin-top:6px">' + T('pl.count', { n: n }) + (lim !== null ? ' · ' + T('limit.hint', { n: lim }) : '') +
    (n < 2 ? ' · ' + T('pl.needTwo') : '') + '</div>';
}
function entryPickerHTML(){
  if(!state || isLocked(state) || libDrawExists(state)) return '';
  if(libraryState.status === 'idle') loadLibrary();
  var unit = plUnit();
  var box;
  if(unit === 'Doubles'){
    box = '<div class="buttonrow" style="margin:0"><button class="btn primary" onclick="openPairDialog(null)">' + T('pl.addPair') + '</button></div>';
  } else if(unit === 'Teams'){
    box = '<div class="buttonrow" style="margin:0"><button class="btn primary" onclick="openTeamDialog(null)">' + T('pl.addTeam') + '</button>' +
      (plForeign() ? '' : '<button class="btn secondary" onclick="openCopyTeamDialog()">' + T('pl.copyTeam') + '</button>') + '</div>';
  } else {
    box = '<div class="field" style="margin:0;position:relative"><input type="text" id="pickerBox" autocomplete="off" placeholder="' + T('pl.searchPh') + '" value="' + escText(pickerState.q) + '" oninput="pickerInput(this.value)" onkeydown="pickerKey(event)">' +
      '<div id="pickerResults">' + pickerResultsHTML() + '</div></div>';
  }
  return '<div class="entries-panel" id="entryPicker"><h2>' + T('pl.addTitle') + '</h2><p class="intro">' + T(unit === 'Singles' ? 'pl.addIntro' : unit === 'Doubles' ? 'pl.addIntroPair' : 'pl.addIntroTeam') + '</p>' +
    box + libraryNoteHTML() + entryPickerHintHTML() + '</div>';
}
/* The rows under a search box: library matches, then "Add as a new player" and "Add to this event only".
   slot: '' for the step 3 Singles box, else the dialog slot ('p1', 'p2', 'add'). */
function plResultsHTML(q, slot, exceptEntryId, taken){
  q = libCleanName(q);
  if(!q) return '';
  var foreign = plForeign();
  var matches = foreign ? [] : searchLibrary(q, PL_SEARCH_MAX);
  var rows = matches.map(function(p){
    var used = memberInUse(state, { playerId: p.id, name: p.name }, exceptEntryId) || (taken || []).some(function(m){ return m && m.playerId === p.id; });
    var label = '<b>' + escText(p.name) + '</b>' + (p.club ? ' <span style="color:var(--muted)">· ' + escText(p.club) + '</span>' : '');
    if(used) return '<div class="pl-row pl-used">' + label + ' <span style="color:var(--muted)">' + (used.name ? T('pl.inUseShort', { entry: escText(used.teamName || used.name) }) : '') + '</span></div>';
    return '<div class="pl-row" onclick="plChoose(\'' + escJs(slot) + '\',\'' + escJs(p.id) + '\')">' + label + '</div>';
  });
  /* Always offered, also when a player of that name exists: the same name with another club is another player. */
  if(!foreign) rows.push('<div class="pl-row pl-new" onclick="plAddNew(\'' + escJs(slot) + '\',false)">' + T('pl.addNew', { name: escText(q) }) + '</div>');
  rows.push('<div class="pl-row pl-new" onclick="plAddNew(\'' + escJs(slot) + '\',true)">' + T('pl.addEventOnly') + '</div>');
  if(!slot) rows.push('<div class="pl-club"><input type="text" id="pickerClub" autocomplete="off" placeholder="' + T('pl.clubOpt') + '" value="' + escText(pickerState.club) + '" oninput="pickerState.club=this.value"></div>');
  return '<div class="pl-results">' + rows.join('') + '</div>';
}
function pickerResultsHTML(){ return plResultsHTML(pickerState.q, '', null); }
function plRefreshPicker(){
  var el = document.getElementById('pickerResults');
  if(el) el.innerHTML = pickerResultsHTML();
}
function pickerInput(v){ pickerState.q = v; plRefreshPicker(); }
function pickerKey(ev){
  if(ev.key !== 'Enter') return;
  ev.preventDefault();
  var q = libCleanName(pickerState.q);
  if(!q) return;
  var first = (plForeign() ? [] : searchLibrary(q, PL_SEARCH_MAX)).find(function(p){ return !memberInUse(state, { playerId: p.id, name: p.name }, null); });
  if(first) plChoose('', first.id); else plAddNew('', plForeign());
}
function pickerReset(){
  pickerState.q = ''; pickerState.club = '';
  setTimeout(function(){ var b = document.getElementById('pickerBox'); if(b) b.focus(); }, 0);
}
/* A library player picked from a result row. */
function plChoose(slot, playerId){
  var p = libraryPlayer(playerId);
  if(!p) return;
  var m = { playerId: p.id, name: p.name, club: p.club };
  if(slot){ plDialogSet(slot, m); return; }
  if(addEntryFromMembers('Singles', '', [m])) pickerReset();
}
/* A typed new name: saved to the library (eventOnly false) or kept in this event only. */
async function plAddNew(slot, eventOnly){
  var input = document.getElementById(slot ? 'ps_' + slot : 'pickerBox');
  var name = libCleanName(input ? input.value : pickerState.q);
  if(!name) return;
  var club = libCleanName(slot ? plDialogClub() : (document.getElementById('pickerClub') || {}).value || pickerState.club);
  var m = { playerId: null, name: name, club: club };
  if(eventOnly || plForeign()) m.eventOnly = true;
  else {
    var got = await libraryEnsure([{ name: name, club: club }]);
    if(got && got.error){ openModal({ title: T('pl.limitTitle'), body: escText(got.error), confirmLabel: T('m.ok'), confirmClass: 'primary', onConfirm: function(){} }); return; }
    if(got && got[0]){ m.playerId = got[0].id; m.name = got[0].name; m.club = got[0].club; }
  }
  if(slot){ plDialogSet(slot, m); return; }
  if(addEntryFromMembers('Singles', '', [m])) pickerReset();
}

/* ---------- Doubles and Teams: the pair / team box ---------- */
var plDialog = null;   // { kind: 'pair'|'team', entryId, teamName, club, clubTyped, members: [] }
function plDialogClub(){ var el = document.getElementById('plClub'); return el ? el.value : (plDialog ? plDialog.club : ''); }
function plSlotHTML(slot, label){
  var m = plDialog.kind === 'pair' ? plDialog.members[slot === 'p1' ? 0 : 1] : null;
  if(m) return '<div class="field"><label>' + label + '</label><div class="pl-chosen"><b>' + escText(m.name) + '</b>' + (m.club ? ' · ' + escText(m.club) : '') +
    (m.eventOnly ? ' <span style="color:var(--muted)">(' + T('pl.eventOnlyTag') + ')</span>' : '') +
    ' <button type="button" class="btn ghost" style="padding:3px 8px;font-size:10px" onclick="plDialogClear(\'' + slot + '\')">' + T('pl.change') + '</button></div></div>';
  return '<div class="field"><label>' + label + '</label><input type="text" id="ps_' + slot + '" autocomplete="off" placeholder="' + T('pl.searchPh') + '" oninput="plSlotInput(\'' + slot + '\',this.value)">' +
    '<div id="psr_' + slot + '"></div></div>';
}
function plDialogInnerHTML(){
  var d = plDialog;
  var head = '<div class="field"><label>' + T(d.kind === 'pair' ? 'pl.teamNameOpt' : 'pl.teamNameReq') + '</label><input type="text" id="plTeamName" maxlength="80" value="' + escText(d.teamName) + '" oninput="plDialog.teamName=this.value"></div>' +
    '<div class="field"><label>' + T('pl.club') + '</label><input type="text" id="plClub" maxlength="80" value="' + escText(d.club) + '" oninput="plDialog.club=this.value;plDialog.clubTyped=true"></div>';
  if(d.kind === 'pair') return head + plSlotHTML('p1', T('pl.player1')) + plSlotHTML('p2', T('pl.player2'));
  var list = d.members.map(function(m, i){
    return '<div class="pl-chosen" style="margin-bottom:4px"><span class="num">' + (i + 1) + '</span> <b>' + escText(m.name) + '</b>' + (m.club ? ' · ' + escText(m.club) : '') +
      (m.eventOnly ? ' <span style="color:var(--muted)">(' + T('pl.eventOnlyTag') + ')</span>' : '') +
      ' <button type="button" class="btn ghost" style="padding:3px 8px;font-size:10px" onclick="plDialogDrop(' + i + ')">✕</button></div>';
  }).join('');
  return head + '<div class="field"><label>' + T('pl.teamPlayers', { n: d.members.length }) + '</label>' + (list || '<div class="hint">' + T('pl.noPlayersYet') + '</div>') + '</div>' +
    '<div class="field"><input type="text" id="ps_add" autocomplete="off" placeholder="' + T('pl.addPlayerPh') + '" oninput="plSlotInput(\'add\',this.value)"><div id="psr_add"></div></div>';
}
function plDialogRedraw(focusSlot){
  var el = document.getElementById('plDialog');
  if(!el || !plDialog) return;
  el.innerHTML = plDialogInnerHTML();
  if(focusSlot){ var box = document.getElementById('ps_' + focusSlot); if(box) box.focus(); }
}
function plSlotInput(slot, v){
  var el = document.getElementById('psr_' + slot);
  if(el) el.innerHTML = plResultsHTML(v, slot, plDialog && plDialog.entryId, plDialog && plDialog.members);
}
function plDialogSet(slot, m){
  if(!plDialog) return;
  if(plDialog.members.some(function(x){ return x && ((m.playerId && x.playerId === m.playerId) || libFold(x.name) === libFold(m.name)); })) return;
  if(slot === 'add') plDialog.members.push(m);
  else plDialog.members[slot === 'p1' ? 0 : 1] = m;
  if(plDialog.kind === 'pair' && !plDialog.clubTyped) plDialog.club = entryClubFromMembers(plDialog.members.filter(Boolean));
  plDialogRedraw(slot === 'add' ? 'add' : (plDialog.members[1] ? null : 'p2'));
}
function plDialogClear(slot){ if(plDialog){ plDialog.members[slot === 'p1' ? 0 : 1] = null; plDialogRedraw(slot); } }
function plDialogDrop(i){ if(plDialog){ plDialog.members.splice(i, 1); plDialogRedraw('add'); } }
function plOpenDialog(kind, entryId, preset){
  if(isLocked(state) || libDrawExists(state)) return;
  if(libraryState.status === 'idle') loadLibrary();
  var ent = entryId ? state.entriesList.find(function(e){ return e.id === entryId; }) : null;
  var src = preset || ent;
  plDialog = {
    kind: kind, entryId: ent ? ent.id : null,
    teamName: src ? (src.teamName || '') : '', club: src ? (src.org || '') : '', clubTyped: !!(src && src.org),
    members: src && src.members ? src.members.map(function(m){ return Object.assign({}, m); }) : []
  };
  if(kind === 'pair') while(plDialog.members.length < 2) plDialog.members.push(null);
  openModal({
    title: T(kind === 'pair' ? (ent ? 'pl.editPair' : 'pl.addPair') : (ent ? 'pl.editTeam' : 'pl.addTeam')),
    bodyHTML: '<div id="plDialog">' + plDialogInnerHTML() + '</div>',
    confirmLabel: T('pl.save'), confirmClass: 'primary', help: false,
    onConfirm: function(){ return plDialogSave(); }
  });
}
function openPairDialog(entryId){ plOpenDialog('pair', entryId); }
function openTeamDialog(entryId){ plOpenDialog('team', entryId); }
function plDialogSave(){
  var d = plDialog;
  if(!d) return;
  var team = libCleanName(d.teamName), members = d.members.filter(Boolean).map(plCleanMember);
  if(d.kind === 'pair' && members.length < 2) return { error: T('pl.needPair') };
  if(d.kind === 'team' && !team) return { error: T('pl.needTeamName') };
  if(d.kind === 'team' && !members.length) return { error: T('pl.needTeamPlayer') };
  var unit = d.kind === 'pair' ? 'Doubles' : 'Teams';
  var club = libCleanName(d.club);
  if(!d.entryId){
    var active = activeEntryCount(state);
    if(entryGrowthBlocked(active + 1, active)) return { error: T('limit.message', { n: entryLimit() }) };
    var clash = plInUseMessage(state, members, null, true);
    if(clash) return { error: clash };
    plDialog = null;
    setTimeout(function(){ addEntryFromMembers(unit, team, members, club); }, 0);
    return;
  }
  var ent = state.entriesList.find(function(e){ return e.id === d.entryId; });
  if(!ent || libDrawExists(state)) return;
  var clash2 = plInUseMessage(state, members, ent.id, true);
  if(clash2) return { error: clash2 };
  ent.members = members; ent.teamName = team; ent.org = club;
  ent.name = entryDisplayName(unit, team, members); ent.autoName = false;
  plDialog = null;
  persist(); render();
}
/* Teams: a team (name, club, players) from one of the organiser's other events, opened in the Add team box. */
function openCopyTeamDialog(){
  var rows = [];
  plOwnEventIds().forEach(function(id){
    var t = tournamentsCache[id];
    if(!t || id === state.id || !t.eventCreation || plUnit(t) !== 'Teams') return;
    (t.entriesList || []).forEach(function(e){
      if(e && Array.isArray(e.members) && e.members.length) rows.push({ tid: id, eid: e.id, label: e.name, event: plEventLabel(t), n: e.members.length });
    });
  });
  var body = rows.length ? '<div class="pl-results" style="max-height:320px;overflow:auto">' + rows.map(function(r){
    return '<div class="pl-row" onclick="copyTeamFrom(\'' + escJs(r.tid) + '\',\'' + escJs(r.eid) + '\')"><b>' + escText(r.label) + '</b> <span style="color:var(--muted)">· ' +
      T('pl.nPlayers', { n: r.n }) + ' · ' + escText(r.event) + '</span></div>';
  }).join('') + '</div>' : '<p>' + T('pl.noPastTeams') + '</p>';
  openModal({ title: T('pl.copyTeam'), bodyHTML: body, confirmLabel: T('m.cancel'), confirmClass: 'secondary', help: false, onConfirm: function(){} });
}
function copyTeamFrom(tid, eid){
  var t = tournamentsCache[tid];
  var e = t && (t.entriesList || []).find(function(x){ return x.id === eid; });
  if(!e) return;
  closeModal();
  setTimeout(function(){ plOpenDialog('team', null, { teamName: e.teamName || e.name, org: e.org || '', members: e.members }); }, 0);
}

/* ---------- the Players page ---------- */
var playersPage = { open: false, q: '', shown: 50, ticked: {} };
function showPlayersPage(){
  playersPage.open = true; playersPage.q = ''; playersPage.shown = 50; playersPage.ticked = {};
  if(typeof adminState !== 'undefined') adminState.view = null;
  loadLibrary(true);
  render();
}
function closePlayersPage(){ playersPage.open = false; render(); }
function playersSearch(q){
  playersPage.q = q; playersPage.shown = 50;
  var el = document.getElementById('playersTable');
  if(el) el.innerHTML = playersTableHTML();
}
function playersMore(){ playersPage.shown += 50; var el = document.getElementById('playersTable'); if(el) el.innerHTML = playersTableHTML(); }
function playersTick(id, on){
  if(on) playersPage.ticked[id] = true; else delete playersPage.ticked[id];
  var b = document.getElementById('playersMergeBtn');
  if(b) b.disabled = Object.keys(playersPage.ticked).length < 2;
}
function playersTableHTML(){
  if(libraryState.status === 'not_set_up') return '<p class="intro">' + T('pl.notSetUp') + '</p>';
  if(libraryState.status === 'error' && !libraryState.players) return '<p class="intro">' + T('pl.loadFailed') + '</p><button class="btn secondary" onclick="loadLibrary(true)">' + T('pl.tryAgain') + '</button>';
  if(!libraryState.players) return '<p class="intro">' + T('pl.loading') + '</p>';
  var all = searchLibrary(playersPage.q, 0);
  if(!all.length) return '<p class="intro">' + T(libraryState.players.length ? 'pl.noMatch' : 'pl.empty') + '</p>';
  var rows = all.slice(0, playersPage.shown).map(function(p){
    return '<tr><td><input type="checkbox" style="width:auto;height:auto"' + (playersPage.ticked[p.id] ? ' checked' : '') + ' onchange="playersTick(\'' + escJs(p.id) + '\',this.checked)"></td>' +
      '<td><b>' + escText(p.name) + '</b></td><td>' + escText(p.club || '—') + '</td><td>' + (p.eventsPlayed || 0) + '</td>' +
      '<td>' + (p.lastPlayed ? escText(ddDateNum(p.lastPlayed.slice(0, 10))) : '—') + '</td>' +
      '<td style="white-space:nowrap"><button class="btn ghost" style="padding:5px 9px;font-size:10px" onclick="playersEdit(\'' + escJs(p.id) + '\')">' + T('pl.edit') + '</button> ' +
      '<button class="btn ghost" style="padding:5px 9px;font-size:10px" onclick="playersRemove(\'' + escJs(p.id) + '\')">' + T('pl.remove') + '</button></td></tr>';
  }).join('');
  return '<div class="hint" style="margin:0 0 8px">' + T('pl.shown', { n: Math.min(all.length, playersPage.shown), total: all.length }) + '</div>' +
    '<div style="overflow-x:auto"><table class="pl-table"><thead><tr><th></th><th>' + T('pl.col.name') + '</th><th>' + T('pl.col.club') + '</th><th>' + T('pl.col.events') + '</th><th>' + T('pl.col.last') + '</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
    (all.length > playersPage.shown ? '<div class="buttonrow"><button class="btn secondary" onclick="playersMore()">' + T('pl.showMore') + '</button></div>' : '');
}
function renderPlayersPage(){
  document.getElementById('pageTitle').textContent = T('pl.page.title');
  document.getElementById('pageSub').textContent = T('pl.page.sub');
  document.getElementById('stageArea').innerHTML =
    '<div class="entries-panel"><div class="buttonrow" style="margin:0 0 12px;flex-wrap:wrap">' +
      '<button class="btn primary" onclick="playersAdd()">' + T('pl.addPlayer') + '</button>' +
      '<button class="btn secondary" id="playersMergeBtn" disabled onclick="playersMerge()">' + T('pl.merge') + '</button>' +
      '<button class="btn secondary" onclick="playersFromEvent()">' + T('pl.fromEvent') + '</button>' +
      '<button class="btn ghost" onclick="closePlayersPage()">' + T('pl.back') + '</button></div>' +
      '<div class="field"><input type="text" id="playersSearchBox" autocomplete="off" placeholder="' + T('pl.pageSearchPh') + '" value="' + escText(playersPage.q) + '" oninput="playersSearch(this.value)"></div>' +
      '<div id="playersTable">' + playersTableHTML() + '</div></div>';
  playersTick('', false);
}
async function playersCall(url, body){
  try{
    var res = await apiFetch(url, { method: 'POST', body: JSON.stringify(body) });
    var data = await res.json().catch(function(){ return {}; });
    return { ok: res.ok, data: data };
  }catch(e){ return { ok: false, data: {} }; }
}
function playersFail(r){
  var msg = r && r.data && r.data.code === 'player_exists' ? T('pl.existsGeneric') : (r && r.data && r.data.error) || T('pl.failed');
  openModal({ title: T('pl.failedTitle'), body: escText(msg), confirmLabel: T('m.ok'), confirmClass: 'primary', onConfirm: function(){} });
}
function plNameClubForm(name, club){
  return '<div class="field"><label>' + T('pl.col.name') + '</label><input type="text" id="plFormName" maxlength="80" value="' + escText(name || '') + '"></div>' +
    '<div class="field"><label>' + T('pl.clubOpt') + '</label><input type="text" id="plFormClub" maxlength="80" value="' + escText(club || '') + '"></div>';
}
function plFormValues(){ return { name: libCleanName(document.getElementById('plFormName').value), club: libCleanName(document.getElementById('plFormClub').value) }; }
function playersAdd(){
  openModal({ title: T('pl.addPlayer'), bodyHTML: plNameClubForm('', ''), confirmLabel: T('pl.add'), confirmClass: 'primary', help: false,
    onConfirm: function(){
      var v = plFormValues();
      if(!v.name) return { error: T('pl.needName') };
      libraryEnsure([v]).then(function(got){
        if(!got){ playersFail(null); return; }
        if(got.error){ playersFail({ data: { error: got.error } }); return; }
        if(!got[0].created) openModal({ title: T('pl.addPlayer'), body: T('pl.exists', { name: escText(got[0].name), club: escText(got[0].club || '—') }), confirmLabel: T('m.ok'), confirmClass: 'primary', onConfirm: function(){} });
        loadLibrary(true);
      });
    } });
}
function playersEdit(id){
  var p = libraryPlayer(id);
  if(!p) return;
  openModal({ title: T('pl.editPlayer'), bodyHTML: plNameClubForm(p.name, p.club) + '<div class="hint">' + T('pl.editHint') + '</div>', confirmLabel: T('pl.save'), confirmClass: 'primary', help: false,
    onConfirm: function(){
      var v = plFormValues();
      if(!v.name) return { error: T('pl.needName') };
      playersCall('/api/players/update', { id: id, name: v.name, club: v.club }).then(function(r){ if(!r.ok) playersFail(r); loadLibrary(true); });
    } });
}
function playersRemove(id){
  var p = libraryPlayer(id);
  if(!p) return;
  openModal({ title: T('pl.removeLibTitle'), body: T('pl.removeLib', { name: escText(p.name) }), confirmLabel: T('pl.remove'), confirmClass: 'danger', help: false,
    onConfirm: function(){
      delete playersPage.ticked[id];
      playersCall('/api/players/remove', { id: id }).then(function(r){ if(!r.ok) playersFail(r); loadLibrary(true); });
    } });
}
function playersMerge(){
  var ids = Object.keys(playersPage.ticked).filter(libraryPlayer);
  if(ids.length < 2) return;
  var body = '<p>' + T('pl.mergeIntro') + '</p>' + ids.map(function(id, i){
    var p = libraryPlayer(id);
    return '<label style="display:flex;gap:8px;align-items:center;margin-bottom:6px;font-size:13px"><input type="radio" name="plKeep" value="' + escText(id) + '" style="width:auto;height:auto"' + (i === 0 ? ' checked' : '') + '> <b>' + escText(p.name) + '</b> · ' + escText(p.club || '—') + ' <span style="color:var(--muted)">(' + T('pl.nEvents', { n: p.eventsPlayed || 0 }) + ')</span></label>';
  }).join('');
  openModal({ title: T('pl.mergeTitle'), bodyHTML: body, confirmLabel: T('pl.merge'), confirmClass: 'primary', help: false,
    onConfirm: function(){
      var pick = document.querySelector('input[name="plKeep"]:checked');
      var keep = libraryPlayer(pick ? pick.value : ids[0]);
      if(!keep) return;
      playersCall('/api/players/merge', { keepId: keep.id, ids: ids.filter(function(x){ return x !== keep.id; }), name: keep.name, club: keep.club }).then(function(r){
        if(!r.ok) playersFail(r);
        playersPage.ticked = {};
        loadLibrary(true);
      });
    } });
}
/* The names and clubs of an event's players: entry members (event-only names left out), and older Singles entries by name. */
function plEventPlayers(t){
  var out = [], seen = {};
  var add = function(name, club){
    name = libCleanName(name); club = libCleanName(club);
    var k = libFold(name) + '|' + libFold(club);
    if(name && !seen[k]){ seen[k] = true; out.push({ name: name, club: club }); }
  };
  (t.entriesList || []).forEach(function(e){
    if(!e) return;
    if(Array.isArray(e.members)) e.members.forEach(function(m){ if(m && !m.eventOnly) add(m.name, m.club); });
    else if(plUnit(t) === 'Singles' && !e.autoName) add(e.name, e.org);
  });
  return out;
}
/* "Tournament · Event" (either may be blank). */
function plEventLabel(t){ return [t.eventCreation.tournamentName, t.eventCreation.eventName].map(libCleanName).filter(Boolean).join(' · '); }
function playersFromEvent(){
  var ids = plOwnEventIds().filter(function(id){ var t = tournamentsCache[id]; return t && t.eventCreation && plEventPlayers(t).length; });
  var body = ids.length ? '<div class="pl-results" style="max-height:320px;overflow:auto">' + ids.map(function(id){
    var t = tournamentsCache[id];
    return '<div class="pl-row" onclick="playersFromEventGo(\'' + escJs(id) + '\')"><b>' + escText(plEventLabel(t)) + '</b>' +
      ' <span style="color:var(--muted)">· ' + T('pl.nPlayers', { n: plEventPlayers(t).length }) + '</span></div>';
  }).join('') + '</div>' : '<p>' + T('pl.noPastEvents') + '</p>';
  openModal({ title: T('pl.fromEvent'), bodyHTML: body, confirmLabel: T('m.cancel'), confirmClass: 'secondary', help: false, onConfirm: function(){} });
}
async function playersFromEventGo(id){
  closeModal();
  var list = plEventPlayers(tournamentsCache[id] || {});
  var added = 0, skipped = 0;
  for(var i = 0; i < list.length; i += 200){
    var got = await libraryEnsure(list.slice(i, i + 200));
    if(!got || got.error){ playersFail(got && got.error ? { data: { error: got.error } } : null); break; }
    got.forEach(function(p){ if(p.created) added++; else skipped++; });
  }
  await loadLibrary(true);
  if(added || skipped) openModal({ title: T('pl.fromEvent'), body: T('pl.fromEventDone', { added: added, skipped: skipped }), confirmLabel: T('m.ok'), confirmClass: 'primary', onConfirm: function(){} });
}

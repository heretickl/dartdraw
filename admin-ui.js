/* Admin screens (organiser app): Organisers, Events and Settings, drawn into #stageArea while adminState.view is
   set (render() in app.html hands over to renderAdminView()). Only an account with role 'admin' sees any of this;
   the server checks the role again on every /api/admin/* call, so hiding things here is a convenience, not the
   protection. Every function that acts or draws refuses to run when !isAdminUser(). All text that comes from the
   server (names, emails, event names, error messages) goes through escapeHtml before it is put into HTML.
   Needs globals from app.html: currentOrganizer, state, currentStage, lockedIds, tournamentsCache, dbUpdatedAtCache,
   apiFetch, openModal, render, renderSavedList, openTournament, escapeHtml. Only called while rendering or on a click. */

var adminState = {
  view: null,            // null (normal editor) | 'organizers' | 'events' | 'players' | 'settings'
  organizers: null,      // GET /api/admin/organizers -> organizers
  events: null,          // GET /api/admin/events -> { events, total }
  settings: null,        // GET /api/admin/settings -> { resultsDays, liveHours, limits }
  filters: { q: '', owner: '', offset: 0, limit: 50 },
  players: null,         // GET /api/admin/players -> { players, total }
  playerFilters: { q: '', owner: '', offset: 0, limit: 50 },
  playersTicked: {},     // player id -> its organiser id (a merge stays within one organiser)
  loading: false, error: '', notice: '', seq: 0
};
/* Events the Admin opened that belong to someone else: id -> { ownerId, ownerName }. They are loaded cleaned (see
   tournament-sanitize.js) but with their text untouched, never written by viewing, hidden from the Admin's own sidebar list and refused by its
   Rename / Duplicate / Delete buttons, and they get the "Editing ...'s event as Admin" banner whenever they are open. */
var foreignOpenIds = new Map();
/* The record of the foreign event opened last ({ id, ownerId, ownerName }), or null. Cleared when an own event is opened or a new one started. */
var adminEditing = null;

var ADMIN_VIEWS = ['organizers', 'events', 'players', 'settings'];
var ADMIN_FORMATS = { roundrobin: 'Round Robin', knockout: 'Knockout', rrknockout: 'Round Robin → Knockout', podknockout: 'Group Boards' };
var ADMIN_DEFAULT_LIMITS = { resultsDays: [1, 90], liveHours: [1, 168] };
var ADMIN_CONTACT_MAX = 200;   // the sign-in page contact line (api/_lib/settings.js CONTACT_MAX_LENGTH)

function isAdminUser(){ return !!(currentOrganizer && currentOrganizer.role === 'admin'); }
function adminViewActive(){ return !!adminState.view && isAdminUser(); }

/* ---------- small helpers ---------- */
function adminEsc(v){ return escapeHtml(v == null ? '' : String(v)); }
/* A value for use inside an onclick="..." attribute: a JS string literal whose content is escaped for JS, then for HTML. */
function adminArg(v){ return "'" + adminEsc(String(v == null ? '' : v).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/[\r\n]+/g, ' ')) + "'"; }
function adminWhen(iso, dateOnly){
  if(!iso) return '';
  var d = new Date(iso);
  if(isNaN(d)) return '';
  return dateOnly ? d.toLocaleDateString() : d.toLocaleString();
}
function adminOwnerLabel(o){ return o ? (o.name || o.email || 'Unknown') : 'Unknown'; }
/* A small button. opts.cls: extra class, opts.off: disabled, opts.title: tooltip. A disabled button carries no handler. */
function adminBtn(label, onclick, opts){
  opts = opts || {};
  return '<button class="btn ' + (opts.cls || 'secondary') + ' adm-btn"' + (opts.off ? ' disabled' : ' onclick="' + onclick + '"') + (opts.title ? ' title="' + adminEsc(opts.title) + '"' : '') + '>' + adminEsc(label) + '</button>';
}
function adminFindOrganizer(id){
  var list = adminState.organizers || [];
  for(var i = 0; i < list.length; i++) if(list[i].id === id) return list[i];
  return null;
}
function adminFindEvent(id){
  var list = (adminState.events && adminState.events.events) || [];
  for(var i = 0; i < list.length; i++) if(list[i].id === id) return list[i];
  return null;
}
function adminIsMe(id){ return !!(currentOrganizer && currentOrganizer.id && currentOrganizer.id === id); }

/* ---------- server calls and messages ---------- */
/* Resolves to { ok, status, data } and never throws (a network failure becomes ok:false with a message). */
async function adminCall(url, method, body){
  try{
    var opts = {};
    if(method && method !== 'GET') opts.method = method;
    if(body !== undefined) opts.body = JSON.stringify(body);
    var res = await apiFetch(url, opts);
    var data = null;
    try{ data = await res.json(); }catch(e){}
    return { ok: !!res.ok, status: res.status, data: data };
  }catch(e){
    return { ok: false, status: 0, data: { error: 'Could not reach the server. Check your connection and try again.' } };
  }
}
function adminErrorText(r, fallback){ return (r && r.data && typeof r.data.error === 'string' && r.data.error) || fallback; }
function adminInfo(title, message){
  openModal({ title: title, body: adminEsc(message), confirmLabel: 'OK', confirmClass: 'primary', onConfirm: function(){} });
}
function adminFail(r, fallback){ adminInfo('That did not work', adminErrorText(r, fallback)); }
/* A confirm step: bodyHTML must already be escaped. fn runs when the Admin confirms and may be async. */
function adminConfirm(title, bodyHTML, label, cls, fn){
  openModal({ title: title, body: bodyHTML, confirmLabel: label, confirmClass: cls, onConfirm: function(){ return fn(); } });
}

/* ---------- builders (pure: return HTML strings) ---------- */
function adminStatusOf(o){ return o.suspended ? 'Suspended' : !o.verified ? 'Unverified' : 'Active'; }
function adminTierBadge(o){
  if(o.role === 'admin') return '<span class="tier-badge pro">Pro (via Admin)</span>';
  return o.tier === 'pro' ? '<span class="tier-badge pro">Pro</span>' : '<span class="tier-badge">Basic</span>';
}
function adminOrganizerActions(o){
  if(adminIsMe(o.id)) return '<span class="adm-you">You</span>';   // no demote, suspend or delete on your own row
  var id = adminArg(o.id), b = [];
  if(o.role !== 'admin') b.push(adminBtn(o.tier === 'pro' ? 'Make Basic' : 'Make Pro', 'adminSetTier(' + id + ',' + adminArg(o.tier === 'pro' ? 'basic' : 'pro') + ')'));
  b.push(adminBtn(o.suspended ? 'Reactivate' : 'Suspend', 'adminToggleSuspend(' + id + ',' + (o.suspended ? 'false' : 'true') + ')'));
  if(o.role === 'admin') b.push(adminBtn('Remove admin', 'adminSetRole(' + id + ",'organizer')"));
  else if(!o.verified) b.push(adminBtn('Make admin', '', { off: true, title: 'Only a verified account can be made an admin.' }));
  else b.push(adminBtn('Make admin', 'adminSetRole(' + id + ",'admin')"));
  if(o.suspended) b.push(adminBtn('Reset link', '', { off: true, title: 'Reactivate this account first.' }));
  else b.push(adminBtn('Reset link', 'adminResetLink(' + id + ')'));
  if(o.eventCount > 0) b.push(adminBtn('Transfer events', 'adminTransferOrganizer(' + id + ')'));
  if(o.eventCount > 0) b.push(adminBtn('Delete', '', { cls: 'danger', off: true, title: 'Transfer or delete their events first.' }));
  else b.push(adminBtn('Delete', 'adminDeleteOrganizer(' + id + ')', { cls: 'danger' }));
  return b.join('');
}
function adminOrganizersHTML(list){
  list = Array.isArray(list) ? list : [];
  var rows = list.map(function(o){
    return '<tr>' +
      '<td><strong>' + adminEsc(o.name) + '</strong></td>' +
      '<td>' + adminEsc(o.email) + '</td>' +
      '<td>' + adminTierBadge(o) + '</td>' +
      '<td>' + (o.role === 'admin' ? 'Admin' : 'Organiser') + '</td>' +
      '<td><span class="adm-status ' + adminStatusOf(o).toLowerCase() + '">' + adminStatusOf(o) + '</span></td>' +
      '<td>' + (Number(o.eventCount) || 0) + '</td>' +
      '<td>' + adminEsc(adminWhen(o.createdAt, true)) + '</td>' +
      '<td class="adm-actions">' + adminOrganizerActions(o) + '</td>' +
    '</tr>';
  }).join('');
  return '<div class="adm-head"><div><h2>Organisers</h2><p class="intro" style="margin:0">Everyone who can sign in to DartDraw. An Admin has Pro access whatever tier is stored.</p></div>' +
      '<button class="btn primary" onclick="adminCreateOrganizer()">Add organiser</button></div>' +
    (list.length
      ? '<div class="adm-scroll"><table class="adm-table"><thead><tr><th>Name</th><th>Email</th><th>Tier</th><th>Role</th><th>Status</th><th>Events</th><th>Created</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
      : '<p class="intro">No organisers yet.</p>');
}

function adminEventChips(e){
  var c = [];
  if(e.finalizedAt) c.push('<span class="adm-chip fin">Finalized</span>');
  if(e.published) c.push('<span class="adm-chip">Published</span>');
  if(e.listed) c.push('<span class="adm-chip">Listed</span>');
  return c.join(' ');
}
function adminEventActions(e){
  var id = adminArg(e.id), b = [adminBtn('Open', 'adminOpenEvent(' + id + ')', { cls: 'primary' })];
  if(e.finalizedAt) b.push(adminBtn('Reopen', 'adminEventAction(' + id + ",'reopen')"));
  if(e.published) b.push(adminBtn('Unpublish', 'adminEventAction(' + id + ",'unpublish')"));
  if(e.listed) b.push(adminBtn('Unlist', 'adminEventAction(' + id + ",'unlist')"));
  b.push(adminBtn('Transfer', 'adminEventTransfer(' + id + ')'));
  b.push(adminBtn('Delete', 'adminEventDelete(' + id + ')', { cls: 'danger' }));
  return b.join('');
}
function adminEventsHTML(result, filters, organizers){
  var events = (result && Array.isArray(result.events)) ? result.events : [];
  var total = (result && Number(result.total)) || 0;
  filters = filters || {};
  var limit = Number(filters.limit) || 50, offset = Number(filters.offset) || 0;
  var owners = (Array.isArray(organizers) ? organizers : []).map(function(o){
    return '<option value="' + adminEsc(o.id) + '"' + (o.id === filters.owner ? ' selected' : '') + '>' + adminEsc(o.name) + ' (' + adminEsc(o.email) + ')</option>';
  }).join('');
  var rows = events.map(function(e){
    var owner = e.owner || {};
    return '<tr>' +
      '<td><strong>' + adminEsc(e.tournamentName || 'Untitled tournament') + '</strong>' + (e.eventName ? '<br><span class="adm-sub">' + adminEsc(e.eventName) + '</span>' : '') + '</td>' +
      '<td>' + adminEsc(owner.name) + '<br><span class="adm-sub">' + adminEsc(owner.email) + '</span></td>' +
      '<td>' + adminEsc(ADMIN_FORMATS[e.format] || '') + '</td>' +
      '<td>' + adminEsc(e.date) + '</td>' +
      '<td>' + adminEventChips(e) + '</td>' +
      '<td>' + adminEsc(adminWhen(e.updatedAt)) + '</td>' +
      '<td class="adm-actions">' + adminEventActions(e) + '</td>' +
    '</tr>';
  }).join('');
  var from = events.length ? offset + 1 : 0, to = offset + events.length;
  var pager = total
    ? '<div class="adm-pager"><span>' + from + '–' + to + ' of ' + total + '</span>' +
        (offset > 0 ? '<button class="btn secondary adm-btn" onclick="adminEventsPage(-1)">Previous</button>' : '') +
        (offset + limit < total ? '<button class="btn secondary adm-btn" onclick="adminEventsPage(1)">Next</button>' : '') + '</div>'
    : '';
  return '<div class="adm-head"><div><h2>Events</h2><p class="intro" style="margin:0">Every organiser\'s events, newest first. Open one to edit it as if it were yours.</p></div></div>' +
    '<div class="adm-filter"><input id="adminEvQ" type="text" placeholder="Search event, tournament, organiser" value="' + adminEsc(filters.q) + '" onkeydown="if(event.key===\'Enter\')adminEventsSearch()">' +
      '<select id="adminEvOwner" onchange="adminEventsSearch()"><option value="">All organisers</option>' + owners + '</select>' +
      '<button class="btn secondary" onclick="adminEventsSearch()">Search</button></div>' +
    (events.length
      ? '<div class="adm-scroll"><table class="adm-table"><thead><tr><th>Event</th><th>Owner</th><th>Format</th><th>Date</th><th>Status</th><th>Last saved</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
      : '<p class="intro">No events match.</p>') + pager;
}

/* Players tab: every organiser's player library (api/_routes/admin/players/*). Full control: add (for the organiser
   chosen in the filter), edit, remove, and merge ticked players of one organiser. */
function adminPlayersHTML(result, filters, organizers){
  var players = (result && Array.isArray(result.players)) ? result.players : [];
  var total = (result && Number(result.total)) || 0;
  filters = filters || {};
  var limit = Number(filters.limit) || 50, offset = Number(filters.offset) || 0;
  var owners = (Array.isArray(organizers) ? organizers : []).map(function(o){
    return '<option value="' + adminEsc(o.id) + '"' + (o.id === filters.owner ? ' selected' : '') + '>' + adminEsc(o.name) + ' (' + adminEsc(o.email) + ')</option>';
  }).join('');
  var ticked = adminState.playersTicked || {};
  var rows = players.map(function(p){
    var owner = p.owner || {}, id = adminArg(p.id);
    return '<tr>' +
      '<td><input type="checkbox" style="width:auto;height:auto"' + (ticked[p.id] ? ' checked' : '') + ' onchange="adminPlayersTick(' + id + ',this.checked)"></td>' +
      '<td><strong>' + adminEsc(p.name) + '</strong></td>' +
      '<td>' + adminEsc(p.club || '—') + '</td>' +
      '<td>' + adminEsc(owner.name) + '<br><span class="adm-sub">' + adminEsc(owner.email) + '</span></td>' +
      '<td>' + (Number(p.eventsPlayed) || 0) + '</td>' +
      '<td>' + adminEsc(p.lastPlayed ? adminWhen(p.lastPlayed, true) : '—') + '</td>' +
      '<td class="adm-actions">' + adminBtn('Edit', 'adminPlayerEdit(' + id + ')') + adminBtn('Remove', 'adminPlayerRemove(' + id + ')', { cls: 'danger' }) + '</td>' +
    '</tr>';
  }).join('');
  var from = players.length ? offset + 1 : 0, to = offset + players.length;
  var pager = total
    ? '<div class="adm-pager"><span>' + from + '–' + to + ' of ' + total + '</span>' +
        (offset > 0 ? '<button class="btn secondary adm-btn" onclick="adminPlayersPage(-1)">Previous</button>' : '') +
        (offset + limit < total ? '<button class="btn secondary adm-btn" onclick="adminPlayersPage(1)">Next</button>' : '') + '</div>'
    : '';
  var nTicked = Object.keys(ticked).length;
  return '<div class="adm-head"><div><h2>Players</h2><p class="intro" style="margin:0">Every organiser\'s player library. Past events keep the names they used.</p></div>' +
      '<div class="buttonrow" style="margin:0">' + adminBtn('Merge ticked (' + nTicked + ')', 'adminPlayersMerge()', { off: nTicked < 2 }) +
      adminBtn('Add player', 'adminPlayerAdd()', { cls: 'primary', off: !filters.owner, title: filters.owner ? '' : 'Choose an organiser in the filter first.' }) + '</div></div>' +
    '<div class="adm-filter"><input id="adminPlQ" type="text" placeholder="Search player or club" value="' + adminEsc(filters.q) + '" onkeydown="if(event.key===\'Enter\')adminPlayersSearch()">' +
      '<select id="adminPlOwner" onchange="adminPlayersSearch()"><option value="">All organisers</option>' + owners + '</select>' +
      '<button class="btn secondary" onclick="adminPlayersSearch()">Search</button></div>' +
    (players.length
      ? '<div class="adm-scroll"><table class="adm-table"><thead><tr><th></th><th>Player</th><th>Club</th><th>Organiser</th><th>Events played</th><th>Last played</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
      : '<p class="intro">No players match.</p>') + pager;
}

function adminSettingsHTML(settings){
  settings = settings || {};
  var lim = settings.limits || ADMIN_DEFAULT_LIMITS;
  var rd = lim.resultsDays || ADMIN_DEFAULT_LIMITS.resultsDays, lh = lim.liveHours || ADMIN_DEFAULT_LIMITS.liveHours;
  var maxC = settings.contactMaxLength || ADMIN_CONTACT_MAX;
  return '<div class="adm-head"><div><h2>Settings</h2><p class="intro" style="margin:0">How long events stay on the public home page, and who to ask for an account.</p></div></div>' +
    '<div class="grid2" style="max-width:640px">' +
      '<div class="field"><label>Days a finalized event stays under Results</label><input id="adminSetResults" type="number" min="' + adminEsc(rd[0]) + '" max="' + adminEsc(rd[1]) + '" step="1" value="' + adminEsc(settings.resultsDays) + '"><div class="hint">Whole days, ' + adminEsc(rd[0]) + ' to ' + adminEsc(rd[1]) + '.</div></div>' +
      '<div class="field"><label>Hours a started event stays under Live now</label><input id="adminSetLive" type="number" min="' + adminEsc(lh[0]) + '" max="' + adminEsc(lh[1]) + '" step="1" value="' + adminEsc(settings.liveHours) + '"><div class="hint">Whole hours, ' + adminEsc(lh[0]) + ' to ' + adminEsc(lh[1]) + '. After this with no new score, an unfinished event drops off.</div></div>' +
    '</div>' +
    '<div class="field" style="max-width:640px"><label for="adminSetContact">Contact line on the sign-in page</label><input id="adminSetContact" type="text" maxlength="' + adminEsc(maxC) + '" value="' + adminEsc(typeof settings.adminContact === 'string' ? settings.adminContact : '') + '" placeholder="e.g. Ask the club secretary at the bar, or phone 012-345 6789.">' +
      '<div class="hint">Shown under &ldquo;No account yet? Accounts are created by the site admin.&rdquo; on the sign-in page, for anyone to read. One line of plain text, up to ' + adminEsc(maxC) + ' characters (no &lt; or &gt;). Leave it empty to show only that sentence.</div></div>' +
    '<div class="buttonrow"><button class="btn primary" onclick="adminSaveSettings()">Save</button></div>';
}

/* kind: 'invite' (7 days) or 'reset' (1 hour), matching the lifetimes the server gives those links. */
function adminInviteLinkModalHTML(link, email, kind){
  var howLong = kind === 'reset' ? '1 hour' : '7 days';
  return '<p>' + (email ? 'Link for <b>' + adminEsc(email) + '</b>. ' : '') + 'Send this link to the organiser. It works for ' + howLong + '.</p>' +
    '<div class="field"><input id="adminLinkBox" type="text" readonly value="' + adminEsc(link) + '" onclick="this.select()"></div>' +
    '<button class="btn secondary" id="adminCopyBtn" onclick="adminCopyLink()">Copy</button>';
}

/* ---------- sidebar entry, banner, Reopen button ---------- */
function adminNavHTML(){
  if(!isAdminUser()) return '';
  return '<button class="admin-nav-btn' + (adminState.view ? ' active' : '') + '" onclick="adminShow(\'organizers\')">Admin</button>';
}
function renderAdminNav(){
  var el = document.getElementById('adminNav');
  if(el) el.innerHTML = adminNavHTML();
}
function adminEditBannerHTML(){
  if(!isAdminUser() || !state || !foreignOpenIds.has(state.id)) return '';
  var rec = foreignOpenIds.get(state.id);
  var who = rec && rec.ownerName ? adminEsc(rec.ownerName) + "'s" : "another organiser's";
  return '<div class="card"><div class="confirm-box" style="margin:0"><b>Editing ' + who + ' event as Admin</b>Changes you save stay on their account.</div></div>';
}
function adminReopenButtonHTML(){
  if(!isAdminUser() || !state || !state.id) return '';
  return '<div class="buttonrow" style="margin-top:10px"><button class="btn primary" onclick="adminReopenCurrent()">Reopen to edit</button></div>';
}

/* ---------- drawing ---------- */
function adminTabsHTML(){
  var tabs = [['organizers', 'Organisers'], ['events', 'Events'], ['players', 'Players'], ['settings', 'Settings']];
  return '<div class="adm-tabs">' + tabs.map(function(t){
    return '<button class="adm-tab' + (adminState.view === t[0] ? ' active' : '') + '" onclick="adminShow(\'' + t[0] + '\')">' + t[1] + '</button>';
  }).join('') + '<a class="adm-back" onclick="adminBack()">← Back to my events</a></div>';
}
function adminBodyHTML(){
  if(adminState.error) return '<p class="intro" style="color:#c0392b">' + adminEsc(adminState.error) + '</p><button class="btn secondary" onclick="adminLoad()">Try again</button>';
  if(adminState.loading) return '<p class="intro">Loading…</p>';
  var v = adminState.view;
  if(v === 'organizers') return adminOrganizersHTML(adminState.organizers);
  if(v === 'events') return adminEventsHTML(adminState.events, adminState.filters, adminState.organizers);
  if(v === 'players') return adminPlayersHTML(adminState.players, adminState.playerFilters, adminState.organizers);
  if(v === 'settings') return adminSettingsHTML(adminState.settings);
  return '';
}
function renderAdminView(){
  if(!adminViewActive()) return;
  var subs = {
    organizers: 'Add organisers, change tiers, suspend, reset passwords and move events.',
    events: 'See and edit any organiser\'s events, and control what is public.',
    players: 'See and manage every organiser\'s players.',
    settings: 'Choose how long events stay on the public home page, and what the sign-in page says about getting an account.'
  };
  document.getElementById('pageTitle').textContent = 'Admin';
  document.getElementById('pageSub').textContent = subs[adminState.view] || '';
  document.getElementById('stageArea').innerHTML = adminTabsHTML() +
    (adminState.notice ? '<div class="confirm-box finalized-note" style="max-width:820px">' + adminEsc(adminState.notice) + '</div>' : '') +
    '<div class="adm-card">' + adminBodyHTML() + '</div>';
  renderAdminNav();
  renderSavedList();
}

/* ---------- loading and navigation ---------- */
async function adminShow(view){
  if(!isAdminUser() || ADMIN_VIEWS.indexOf(view) < 0) return;
  adminState.view = view; adminState.notice = '';
  if(typeof playersPage !== 'undefined') playersPage.open = false;
  await adminLoad();
}
async function adminLoad(){
  if(!isAdminUser() || !adminState.view) return;
  var view = adminState.view, seq = ++adminState.seq, err = '';
  adminState.loading = true; adminState.error = '';
  render();
  if(view === 'organizers' || ((view === 'events' || view === 'players') && !adminState.organizers)){
    var o = await adminCall('/api/admin/organizers');
    if(o.ok && o.data && Array.isArray(o.data.organizers)) adminState.organizers = o.data.organizers;
    else if(view === 'organizers') err = adminErrorText(o, 'Could not load the organisers.');
  }
  if(!err && view === 'events'){
    var f = adminState.filters, q = [];
    if(f.q) q.push('q=' + encodeURIComponent(f.q));
    if(f.owner) q.push('owner=' + encodeURIComponent(f.owner));
    q.push('limit=' + f.limit, 'offset=' + f.offset);
    var e = await adminCall('/api/admin/events?' + q.join('&'));
    if(e.ok && e.data && Array.isArray(e.data.events)) adminState.events = e.data;
    else err = adminErrorText(e, 'Could not load the events.');
  }
  if(!err && view === 'players'){
    var pf = adminState.playerFilters, pq = [];
    if(pf.q) pq.push('q=' + encodeURIComponent(pf.q));
    if(pf.owner) pq.push('owner=' + encodeURIComponent(pf.owner));
    pq.push('limit=' + pf.limit, 'offset=' + pf.offset);
    var pl = await adminCall('/api/admin/players?' + pq.join('&'));
    if(pl.ok && pl.data && Array.isArray(pl.data.players)) adminState.players = pl.data;
    else err = adminErrorText(pl, 'Could not load the players.');
  }
  if(!err && view === 'settings'){
    var s = await adminCall('/api/admin/settings');
    if(s.ok && s.data) adminState.settings = s.data;
    else err = adminErrorText(s, 'Could not load the settings.');
  }
  if(seq !== adminState.seq) return;   // a newer load took over
  adminState.loading = false; adminState.error = err;
  render();
}
function adminBack(){
  if(!isAdminUser()) return;
  adminState.view = null;
  render();
}
async function adminEventsSearch(){
  if(!isAdminUser()) return;
  var q = document.getElementById('adminEvQ'), o = document.getElementById('adminEvOwner');
  adminState.filters.q = q ? String(q.value || '').trim() : adminState.filters.q;
  adminState.filters.owner = o ? String(o.value || '') : adminState.filters.owner;
  adminState.filters.offset = 0;
  await adminLoad();
}
async function adminEventsPage(delta){
  if(!isAdminUser()) return;
  var f = adminState.filters, total = (adminState.events && Number(adminState.events.total)) || 0;
  var next = f.offset + delta * f.limit;
  if(next < 0 || next >= total) return;
  f.offset = next;
  await adminLoad();
}

/* ---------- player actions ---------- */
function adminFindPlayer(id){
  var list = (adminState.players && adminState.players.players) || [];
  for(var i = 0; i < list.length; i++) if(list[i].id === id) return list[i];
  return null;
}
async function adminPlayersSearch(){
  if(!isAdminUser()) return;
  var q = document.getElementById('adminPlQ'), o = document.getElementById('adminPlOwner');
  adminState.playerFilters.q = q ? String(q.value || '').trim() : adminState.playerFilters.q;
  adminState.playerFilters.owner = o ? String(o.value || '') : adminState.playerFilters.owner;
  adminState.playerFilters.offset = 0;
  adminState.playersTicked = {};
  await adminLoad();
}
async function adminPlayersPage(delta){
  if(!isAdminUser()) return;
  var f = adminState.playerFilters, total = (adminState.players && Number(adminState.players.total)) || 0;
  var next = f.offset + delta * f.limit;
  if(next < 0 || next >= total) return;
  f.offset = next;
  await adminLoad();
}
function adminPlayersTick(id, on){
  if(!isAdminUser()) return;
  var p = adminFindPlayer(id);
  if(on && p) adminState.playersTicked[id] = p.owner ? p.owner.id : ''; else delete adminState.playersTicked[id];
  render();
}
/* The name and club boxes of the add / edit / merge boxes. */
function adminPlayerFormHTML(name, club){
  return '<div class="field"><label>Name</label><input type="text" id="admPlName" maxlength="80" value="' + adminEsc(name) + '"></div>' +
    '<div class="field"><label>Club (optional)</label><input type="text" id="admPlClub" maxlength="80" value="' + adminEsc(club) + '"></div>';
}
function adminPlayerFormValues(){
  return { name: String(document.getElementById('admPlName').value || '').trim(), club: String(document.getElementById('admPlClub').value || '').trim() };
}
function adminPlayerAdd(){
  if(!isAdminUser()) return;
  var owner = adminFindOrganizer(adminState.playerFilters.owner);
  if(!owner) return;
  openModal({ title: 'Add player for ' + adminEsc(owner.name), bodyHTML: adminPlayerFormHTML('', ''), confirmLabel: 'Add', confirmClass: 'primary', help: false,
    onConfirm: function(){
      var v = adminPlayerFormValues();
      if(!v.name) return { error: 'Enter a name.' };
      adminCall('/api/admin/players', 'POST', { organizerId: owner.id, name: v.name, club: v.club }).then(function(r){
        if(!r.ok){ adminFail(r, 'Could not add that player.'); return; }
        if(r.data && r.data.player && r.data.player.created === false) adminInfo('Already there', v.name + ' is already in ' + owner.name + '\'s players.');
        adminLoad();
      });
    } });
}
function adminPlayerEdit(id){
  if(!isAdminUser()) return;
  var p = adminFindPlayer(id);
  if(!p) return;
  openModal({ title: 'Edit player', bodyHTML: adminPlayerFormHTML(p.name, p.club) + '<div class="hint">Past events keep the names they used.</div>', confirmLabel: 'Save', confirmClass: 'primary', help: false,
    onConfirm: function(){
      var v = adminPlayerFormValues();
      if(!v.name) return { error: 'Enter a name.' };
      adminCall('/api/admin/players/' + encodeURIComponent(id), 'PATCH', v).then(function(r){
        if(!r.ok){ adminFail(r, 'Could not save that player.'); return; }
        adminLoad();
      });
    } });
}
function adminPlayerRemove(id){
  if(!isAdminUser()) return;
  var p = adminFindPlayer(id);
  if(!p) return;
  adminConfirm('Remove player?', 'Remove <b>' + adminEsc(p.name) + '</b> from ' + adminEsc((p.owner && p.owner.name) || 'their') + '\'s players? Past events keep showing them.', 'Remove', 'danger', async function(){
    var r = await adminCall('/api/admin/players/' + encodeURIComponent(id), 'DELETE');
    if(!r.ok){ adminFail(r, 'Could not remove that player.'); return; }
    delete adminState.playersTicked[id];
    await adminLoad();
  });
}
function adminPlayersMerge(){
  if(!isAdminUser()) return;
  var ids = Object.keys(adminState.playersTicked || {}).filter(adminFindPlayer);
  if(ids.length < 2) return;
  var owners = {};
  ids.forEach(function(id){ owners[adminState.playersTicked[id]] = true; });
  if(Object.keys(owners).length > 1){ adminInfo('Merge players', 'Merge players from one organiser at a time.'); return; }
  var body = '<p class="intro">Choose the name and club to keep. The others are folded into it and their events count for it.</p>' + ids.map(function(id, i){
    var p = adminFindPlayer(id);
    return '<label style="display:flex;gap:8px;align-items:center;margin-bottom:6px;font-size:13px"><input type="radio" name="admKeep" value="' + adminEsc(id) + '" style="width:auto;height:auto"' + (i === 0 ? ' checked' : '') + '> <b>' + adminEsc(p.name) + '</b> · ' + adminEsc(p.club || '—') + ' <span class="adm-sub">(' + (Number(p.eventsPlayed) || 0) + ' events)</span></label>';
  }).join('');
  openModal({ title: 'Merge players', bodyHTML: body, confirmLabel: 'Merge', confirmClass: 'primary', help: false,
    onConfirm: function(){
      var pick = document.querySelector('input[name="admKeep"]:checked');
      var keep = adminFindPlayer(pick ? pick.value : ids[0]);
      if(!keep) return;
      adminCall('/api/admin/players/' + encodeURIComponent(keep.id) + '/merge', 'POST', { ids: ids.filter(function(x){ return x !== keep.id; }), name: keep.name, club: keep.club }).then(function(r){
        if(!r.ok){ adminFail(r, 'Could not merge those players.'); return; }
        adminState.playersTicked = {};
        adminLoad();
      });
    } });
}

/* ---------- organiser actions ---------- */
async function adminPatchOrganizer(id, body){
  var r = await adminCall('/api/admin/organizers/' + encodeURIComponent(id), 'PATCH', body);
  if(!r.ok){ adminFail(r, 'Could not update that account.'); return false; }
  await adminLoad();
  return true;
}
async function adminSetTier(id, tier){
  if(!isAdminUser() || (tier !== 'basic' && tier !== 'pro')) return false;
  return adminPatchOrganizer(id, { tier: tier });
}
/* suspended = the value to set (true suspends, false reactivates). Suspending signs the person out, so it asks first. */
async function adminToggleSuspend(id, suspended){
  if(!isAdminUser() || adminIsMe(id) || typeof suspended !== 'boolean') return false;
  if(!suspended) return adminPatchOrganizer(id, { suspended: false });
  var o = adminFindOrganizer(id);
  adminConfirm('Suspend this account?', '<b>' + adminEsc(adminOwnerLabel(o)) + '</b> is signed out at once and cannot sign in until you reactivate the account. Their events stay as they are.',
    'Suspend', 'danger', function(){ return adminPatchOrganizer(id, { suspended: true }); });
  return true;
}
async function adminSetRole(id, role){
  if(!isAdminUser() || adminIsMe(id) || (role !== 'organizer' && role !== 'admin')) return false;
  var o = adminFindOrganizer(id), name = '<b>' + adminEsc(adminOwnerLabel(o)) + '</b>';
  adminConfirm(role === 'admin' ? 'Make this person an admin?' : 'Remove admin access?',
    role === 'admin' ? name + ' will be able to manage every account and event.' : name + ' will become a normal organiser again.',
    role === 'admin' ? 'Make admin' : 'Remove admin', 'primary', function(){ return adminPatchOrganizer(id, { role: role }); });
  return true;
}
async function adminResetLink(id){
  if(!isAdminUser()) return false;
  var r = await adminCall('/api/admin/organizers/' + encodeURIComponent(id) + '/reset-link', 'POST');
  if(!r.ok || !r.data || !r.data.link){ adminFail(r, 'Could not make a reset link.'); return false; }
  var o = adminFindOrganizer(id);
  adminShowLink(r.data.link, o ? o.email : '', 'reset');
  return true;
}
function adminShowLink(link, email, kind){
  openModal({ title: kind === 'reset' ? 'Password reset link' : 'Invite link', bodyHTML: adminInviteLinkModalHTML(link, email, kind), confirmLabel: 'Done', confirmClass: 'primary', onConfirm: function(){} });
}
function adminCopyLink(){
  if(!isAdminUser()) return;
  var el = document.getElementById('adminLinkBox');
  if(!el) return;
  try{ el.focus(); el.select(); }catch(e){}
  try{
    if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(el.value);
    else document.execCommand('copy');
  }catch(e){}
  var b = document.getElementById('adminCopyBtn');
  if(b) b.textContent = 'Copied';
}
async function adminCreateOrganizer(){
  if(!isAdminUser()) return;
  openModal({
    title: 'Add organiser',
    bodyHTML: '<div class="field"><label>Name</label><input id="adminNewName" type="text" maxlength="80"></div>' +
      '<div class="field"><label>Email</label><input id="adminNewEmail" type="email"></div>' +
      '<div class="field"><label>Tier</label><select id="adminNewTier"><option value="basic">Basic</option><option value="pro">Pro</option></select></div>' +
      '<p class="hint">You get a one-time link to send them so they can choose a password.</p>',
    confirmLabel: 'Create', confirmClass: 'primary',
    onConfirm: function(){
      var name = String(document.getElementById('adminNewName').value || '').trim();
      var email = String(document.getElementById('adminNewEmail').value || '').trim();
      var tier = document.getElementById('adminNewTier').value === 'pro' ? 'pro' : 'basic';
      if(!name) return { error: 'Enter a name.' };
      if(name.length > 80) return { error: 'The name can be at most 80 characters.' };
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return { error: 'Enter a valid email address.' };
      return adminDoCreate(name, email, tier);
    }
  });
}
async function adminDoCreate(name, email, tier){
  if(!isAdminUser()) return false;
  var r = await adminCall('/api/admin/organizers', 'POST', { name: name, email: email, tier: tier });
  if(!r.ok || !r.data || !r.data.link){ adminFail(r, 'Could not create that account.'); return false; }
  adminShowLink(r.data.link, email, 'invite');
  await adminLoad();
  return true;
}
/* Who an organiser's (or event's) things can be moved to: active accounts other than `exceptId`. */
function adminTransferOptionsHTML(exceptId){
  return (adminState.organizers || []).filter(function(o){ return o.id !== exceptId && !o.suspended; }).map(function(o){
    return '<option value="' + adminEsc(o.id) + '">' + adminEsc(o.name) + ' (' + adminEsc(o.email) + ')</option>';
  }).join('');
}
function adminTransferModal(title, intro, exceptId, onPick){
  var opts = adminTransferOptionsHTML(exceptId);
  if(!opts){ adminInfo('Nobody to move them to', 'There is no other active organiser. Add one first.'); return; }
  openModal({
    title: title,
    bodyHTML: '<p>' + intro + '</p><div class="field"><label>Move to</label><select id="adminTransferTo"><option value="">Choose an organiser</option>' + opts + '</select></div>',
    confirmLabel: 'Move', confirmClass: 'primary',
    onConfirm: function(){
      var to = String(document.getElementById('adminTransferTo').value || '');
      if(!to) return { error: 'Choose an organiser.' };
      return onPick(to);
    }
  });
}
async function adminTransferOrganizer(id){
  if(!isAdminUser()) return;
  var o = adminFindOrganizer(id);
  adminTransferModal('Transfer events',
    'Move all ' + (o ? Number(o.eventCount) || 0 : '') + ' events owned by <b>' + adminEsc(adminOwnerLabel(o)) + '</b>. Finalized events stay finalized.', id,
    function(to){ return adminDoTransfer(id, to); });
}
async function adminDoTransfer(id, toId){
  if(!isAdminUser()) return false;
  var r = await adminCall('/api/admin/organizers/' + encodeURIComponent(id) + '/transfer', 'POST', { toOrganizerId: toId });
  if(!r.ok){ adminFail(r, 'Could not move the events.'); return false; }
  var n = Number(r.data && r.data.moved) || 0;
  adminInfo('Events moved', 'Moved ' + n + ' event' + (n === 1 ? '' : 's') + '.');
  await adminLoad();
  return true;
}
async function adminDeleteOrganizer(id){
  if(!isAdminUser() || adminIsMe(id)) return;
  var o = adminFindOrganizer(id);
  if(o && o.eventCount > 0){ adminInfo('Cannot delete yet', 'Transfer or delete their events first.'); return; }
  adminConfirm('Delete this account?', 'This permanently removes <b>' + adminEsc(adminOwnerLabel(o)) + '</b>. This cannot be undone.', 'Delete', 'danger', async function(){
    var r = await adminCall('/api/admin/organizers/' + encodeURIComponent(id), 'DELETE');
    if(!r.ok){ adminFail(r, 'Could not delete that account.'); return false; }
    await adminLoad();
    return true;
  });
}

/* ---------- event actions ---------- */
/* Opens any organiser's event in the normal editor (the server lets an Admin GET it). The owner is remembered for the banner. */
async function adminOpenEvent(id){
  if(!isAdminUser()) return false;
  var row = adminFindEvent(id), owner = row && row.owner;
  var foreign = !(owner && adminIsMe(owner.id));   // an event whose owner is not known counts as someone else's
  var hadForeign = foreignOpenIds.has(id), prevForeign = foreignOpenIds.get(id), prevEditing = adminEditing;
  if(foreign){
    foreignOpenIds.set(id, { ownerId: owner ? owner.id : null, ownerName: owner ? adminOwnerLabel(owner) : '' });
    adminEditing = { id: id, ownerId: owner ? owner.id : null, ownerName: owner ? adminOwnerLabel(owner) : '' };
  } else foreignOpenIds.delete(id);
  var ok = false;
  try{ ok = await openTournament(id, function(){ adminOpenEvent(id); }); }catch(e){ ok = false; }
  if(!ok && typeof lastOpenBlocked!=='undefined' && lastOpenBlocked){
    /* Refused because a change to the open event is still waiting (its own message is showing, with Leave without
       saving, which comes back here): nothing changes meanwhile, so the previous foreign marks are put back. */
    if(hadForeign) foreignOpenIds.set(id, prevForeign); else foreignOpenIds.delete(id);
    adminEditing = prevEditing;
    return false;
  }
  if(!ok){
    foreignOpenIds.delete(id);
    adminEditing = null;
    adminInfo('Could not open that event', 'It may have been deleted. Refresh the list and try again.');
    return false;
  }
  return true;
}
/* Re-reads the event open in the editor (after a reopen) and keeps whichever Admin view was showing. */
async function adminReloadOpenEvent(id){
  var view = adminState.view;
  try{ await openTournament(id); }catch(e){}
  adminState.view = view;
  if(view) render();
}
async function adminEventAction(id, action, extra){
  if(!isAdminUser()) return false;
  var body = { action: action };
  Object.keys(extra || {}).forEach(function(k){ body[k] = extra[k]; });
  var r = await adminCall('/api/admin/events/' + encodeURIComponent(id), 'POST', body);
  if(!r.ok){ adminFail(r, 'That did not work.'); return false; }
  if(action === 'delete' || action === 'transfer'){
    /* The event is gone from (or no longer belongs to) where this editor got it: close it and forget it. */
    if(state && state.id === id){ state = null; currentStage = 1; }
    delete tournamentsCache[id]; delete dbUpdatedAtCache[id]; lockedIds.delete(id);
    foreignOpenIds.delete(id);
    if(adminEditing && adminEditing.id === id) adminEditing = null;
  } else if(action === 'reopen' && state && state.id === id){
    await adminReloadOpenEvent(id);
  }
  adminState.organizers = null;   // event counts changed
  if(adminState.view === 'events') await adminLoad();
  return true;
}
async function adminEventDelete(id){
  if(!isAdminUser()) return;
  var e = adminFindEvent(id), name = e ? (e.tournamentName || 'Untitled tournament') + (e.eventName ? ' / ' + e.eventName : '') : 'this event';
  adminConfirm('Delete this event?',
    'This permanently deletes <b>' + adminEsc(name) + '</b>' + (e && e.finalizedAt ? ' (it is finalized)' : '') + ' for everyone, including its public page. This cannot be undone.',
    'Delete', 'danger', function(){ return adminEventAction(id, 'delete'); });
}
async function adminEventTransfer(id){
  if(!isAdminUser()) return;
  var e = adminFindEvent(id);
  adminTransferModal('Transfer event', 'Give <b>' + adminEsc(e ? e.tournamentName || 'this event' : 'this event') + '</b> to another organiser.', e && e.owner ? e.owner.id : '',
    function(to){ return adminEventAction(id, 'transfer', { toOrganizerId: to }); });
}
/* The "Reopen to edit" button on a finalized event: reopen it on the server, then reload it unlocked. */
async function adminReopenCurrent(){
  if(!isAdminUser() || !state || !state.id) return false;
  return adminEventAction(state.id, 'reopen');
}

/* ---------- settings ---------- */
function adminWholeNumber(el, range){
  var s = String(el && el.value != null ? el.value : '').trim();
  if(!/^\d+$/.test(s)) return null;
  var n = parseInt(s, 10);
  return (n >= range[0] && n <= range[1]) ? n : null;
}
async function adminSaveSettings(){
  if(!isAdminUser()) return false;
  var lim = (adminState.settings && adminState.settings.limits) || ADMIN_DEFAULT_LIMITS;
  var rd = lim.resultsDays || ADMIN_DEFAULT_LIMITS.resultsDays, lh = lim.liveHours || ADMIN_DEFAULT_LIMITS.liveHours;
  var days = adminWholeNumber(document.getElementById('adminSetResults'), rd);
  var hours = adminWholeNumber(document.getElementById('adminSetLive'), lh);
  if(days === null){ adminInfo('Check the numbers', 'Days under Results must be a whole number from ' + rd[0] + ' to ' + rd[1] + '.'); return false; }
  if(hours === null){ adminInfo('Check the numbers', 'Hours under Live now must be a whole number from ' + lh[0] + ' to ' + lh[1] + '.'); return false; }
  var body = { resultsDays: days, liveHours: hours };
  var contactEl = document.getElementById('adminSetContact');
  if(contactEl){
    var maxC = (adminState.settings && adminState.settings.contactMaxLength) || ADMIN_CONTACT_MAX;
    var contact = String(contactEl.value == null ? '' : contactEl.value).replace(/\s+/g, ' ').trim();
    if(contact.length > maxC){ adminInfo('Check the contact line', 'The contact line must be ' + maxC + ' characters or fewer.'); return false; }
    if(/[<>]/.test(contact)){ adminInfo('Check the contact line', 'The contact line must be plain text, without < or >.'); return false; }
    body.adminContact = contact;
  }
  var r = await adminCall('/api/admin/settings', 'PUT', body);
  if(!r.ok){ adminFail(r, 'Could not save the settings.'); return false; }
  adminState.settings = r.data;
  adminState.notice = contactEl ? 'Saved. The public home page and the sign-in page use these settings from now on.' : 'Saved. The public home page uses these numbers from now on.';
  render();
  return true;
}

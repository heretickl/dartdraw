/* Organiser events at every point of their life, built through the app's own functions (the way scripts/sim plays an
   event, smaller): Singles, Doubles and Teams x Knockout, Round robin -> Knockout, Group Boards and Round robin, each
   'setup' (steps 1-2 saved, names typed), 'drawn' (drawn and confirmed, not started), 'live' (started, about half the
   results in), 'done' (every result in) and 'final' (done and finalized). Plus a few special ones: a 64-entry knockout
   (its bracket needs bigger paper: the paper-size dialog), an unresolved round robin tie, a knockout with a no-show and a
   "neither showed", and an event with a Plate pool and variable knockout legs.
   buildStates() returns plain JSON copies ({ id, unit, format, phase, data }); they are built once per process (about
   2 s) and are the same in every run (the app's Math.random is seeded by load-app.js; results come from scripts/sim's
   seeded generator). The events are built in English: the data is language-free apart from the organiser's own text. */
const path = require('path');
const { createApp, run } = require('../../scripts/sim/lib/appvm');
const { makePlayer } = require('../../scripts/sim/lib/play');

const UNITS = ['Singles', 'Doubles', 'Teams'];
const FORMATS = ['knockout', 'rrknockout', 'podknockout', 'roundrobin'];
const PHASES = ['setup', 'drawn', 'live', 'done', 'final'];
const NAME = { Singles: 'Ahmad', Doubles: 'Hakim / Iskandar', Teams: 'Ipoh Arrows' };
const copy = (x) => JSON.parse(JSON.stringify(x));

function oneEvent(unit, formatType, entries, opts) {
  opts = opts || {};
  const sim = createApp();
  const { app, f } = sim;
  const call = (name, ...args) => { app.__args = args; return run(app, name + '(...__args)'); };
  const isTeams = unit === 'Teams';
  const key = unit.toLowerCase() + '-' + formatType;
  const player = makePlayer('i18n|' + key + '|' + entries);
  const out = {};
  const snap = (phase) => { out[phase] = copy(sim.state()); };
  const t = f('blankTournament')(); sim.setState(t);
  t.id = 't_' + key + (opts.tag ? '_' + opts.tag : '');
  t.createdAt = t.updatedAt = Date.UTC(2026, 9, 6, 9);
  sim.withDoc({ f_tname: 'Kejohanan Dart Terbuka Selangor 2026', f_ename: unit + ' ' + formatType, f_etype: opts.etype || 'Open', f_unit: unit, f_date: '2026-11-07', f_entries: String(entries) }, () => f('saveStage1')());
  const boards = formatType === 'podknockout' ? 3 : 4;
  sim.withDoc({ f_boards: String(boards), f_level: 'amateur', f_starttime: opts.start || '' }, () => f('saveSchedulingModal')());
  if (opts.advanced) t.eventCreation.advancedMode = true;
  f('setFormatType')(formatType);
  const boxes = {};
  if (!isTeams) boxes.f_bestof = '5';
  if (formatType === 'roundrobin' || formatType === 'rrknockout') boxes.f_maxgroup = '4';
  if (formatType === 'rrknockout') { boxes.f_qualifiers = '2'; boxes.f_advancemode = 'seeded'; if (opts.plate) { boxes.f_loserspool = true; } }
  if (formatType === 'podknockout') { boxes.f_podcount = '3'; if (!isTeams) boxes.f_podlegs = '3'; }
  sim.withDoc(boxes, () => f('saveStage2')());
  if (opts.variableLegs) Object.assign(t.format.knockoutLegs.main, { variable: true, early: 3, quarterfinal: 5, semifinal: 5, final: 7 });
  sim.state().entriesList.filter((e) => !e.withdrawn).forEach((e, i) => call('renameEntry', e.id, NAME[unit] + ' ' + String(i + 1).padStart(2, '0')));
  sim.state().entriesList.forEach((e, i) => { if (i % 4 === 1) e.org = 'Kelab ' + 'ABC'[i % 3]; });
  if (formatType === 'knockout' || formatType === 'podknockout') { call('setSeedingEnabled', true); call('setNumSeeds', 4); }
  if (isTeams) call('toggleLineupSheet', true);
  call('setPublished', true);
  sim.state().publicSlug = 'i18n' + Math.abs(key.split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)).toString(36).slice(0, 6);
  snap('setup');
  if (opts.setupOnly) return out;

  /* the draw (everyone checked in), then two entries are un-ticked so the check-in warnings show */
  const confirmAll = () => { for (let i = 0; i < 5 && sim.modals.length; i++) { const m = sim.modals.shift(); if (m.onConfirm) m.onConfirm(); } sim.modals.length = 0; };
  f('checkInAll')();
  if (formatType === 'knockout') { f('regenerateKnockoutBracket')(); confirmAll(); }
  else if (formatType === 'podknockout') { f('podsDrawClick')(); confirmAll(); f('podsConfirmAllClick')(); confirmAll(); }
  else { f('confirmShuffleGroups')(); confirmAll(); f('confirmAllCharts')(); confirmAll(); }
  sim.state().entriesList.forEach((e, i) => { if (!e.withdrawn && i < 2) e.checkedIn = false; });
  snap('drawn');

  const S = () => sim.state();
  const segs = () => call('teamSegmentsOf', S());
  const enter = (modal, a, b, what) => { const err = sim.enterScore(modal, a, b); if (err) throw new Error('result refused (' + what + '): ' + err); };
  let budget = Infinity;
  const playGroups = () => {
    const bestOf = parseInt(S().format.bestOfLegs) || 5;
    S().groups.forEach((g) => call('groupMatches', g).forEach((pair) => {
      if (budget-- <= 0) return;
      const a = pair[0], b = pair[1];
      call('promptScore', g.id, a, b, 'A', 'B');
      const modal = sim.popModal();
      let r;
      if (isTeams) { const x = player.team(a, b, segs(), call('teamTieBreakerFor', S(), 'rr'), 'rr'); r = [x.a, x.b]; } else r = player.plain(a, b, bestOf);
      if (opts.tie && g === S().groups[0]) r = pair[0] === g.entryIds[0] || pair[1] === g.entryIds[0] ? [3, 0] : [3, 0];   // a level ring: an unresolved tie
      enter(modal, r[0], r[1], 'group');
    }));
  };
  const resolveTies = () => {
    for (let guard = 0; guard < 200; guard++) {
      const runs = call('unresolvedTieRuns', S());
      if (!runs.length) return;
      const r = runs[0];
      const standings = call('computeStandings', r.group);
      call('openPositionOverridePicker', r.group.id);
      const modal = sim.popModal();
      const vals = {};
      standings.forEach((s) => { vals['posov_' + s.id] = s.manualOverride ? String(s.position) : ''; });
      r.ids.forEach((id, i) => { vals['posov_' + id] = String(r.first + i); });
      app.document = { getElementById: (id) => (id in vals ? { value: vals[id] } : null), createElement: sim.DOC.createElement, body: sim.DOC.body };
      try { modal.onConfirm(); } finally { app.document = sim.DOC; }
    }
  };
  const playBracket = (bk, stopAfter) => {
    const bracket = () => call('bracketByKey', S(), bk);
    const total = bracket().rounds.length;
    for (let ri = 0; ri < total; ri++) {
      if ((bk === 'knockout' || bk === 'knockoutLosers') && call('nextEligibleKnockoutRound', bracket()) === ri) call('startKnockoutRound', bk, ri);
      for (let mi = 0; mi < bracket().rounds[ri].length; mi++) {
        if (budget-- <= 0) return;
        const m = bracket().rounds[ri][mi];
        if (!m.aEntryId || !m.bEntryId || m.bye || m.winnerId || m.void) continue;
        call('koMatchScoreModal', bk, ri, mi);
        const modal = sim.popModal();
        let r;
        if (isTeams) { const x = player.team(m.aEntryId, m.bEntryId, segs(), call('teamTieBreakerFor', S(), 'ko'), 'ko'); r = [x.a, x.b]; }
        else r = player.plain(m.aEntryId, m.bEntryId, call('legsForKnockoutRound', S(), bk, total, ri));
        enter(modal, r[0], r[1], bk);
      }
      if (stopAfter != null && ri >= stopAfter) return;
    }
  };
  const playAll = () => {
    if (formatType === 'roundrobin' || formatType === 'rrknockout') {
      f('startAllGames')(); const m = sim.popModal(); m.onConfirm(); sim.modals.length = 0;
      playGroups(); if (!opts.tie) resolveTies();
      if (formatType === 'rrknockout' && budget > 0 && !opts.tie) {
        f('confirmGenerateKnockoutFromRR')(); sim.modals.length = 0;
        if (S().knockout) playBracket('knockout');
        if (S().knockoutLosers) playBracket('knockoutLosers');
      }
    } else if (formatType === 'knockout') playBracket('knockout');
    else { S().pods.forEach((p) => playBracket('pod:' + p.id)); if (budget > 0 && S().knockout) playBracket('knockout'); }
  };
  /* live: about half the matches; a called match on the Group Boards plan */
  const total = (() => { const st = copy(S()); let n = 0; (st.groups || []).forEach((g) => { n += g.entryIds.length * (g.entryIds.length - 1) / 2; }); (st.pods || []).forEach((p) => { n += p.entryIds.length; }); if (st.knockout) n += st.knockout.size; return n; })();
  budget = Math.max(2, Math.floor(total / 2));
  playAll();
  sim.modals.length = 0;
  if (formatType === 'podknockout') { const b = S().pods[S().pods.length - 1].bracket; const m = b.rounds[0].find((x) => x.aEntryId && x.bEntryId && !x.winnerId); if (m) { m.called = true; m.calledAt = Date.UTC(2026, 9, 6, 10); m.calledPair = m.aEntryId + '|' + m.bEntryId; } }
  snap('live');
  if (opts.liveOnly) return out;
  if (opts.voids && S().knockout) {   // a walkover and a "neither showed" in the first open matches
    const b = S().knockout, open = b.rounds[0].map((m, mi) => [m, mi]).filter(([m]) => m.aEntryId && m.bEntryId && !m.winnerId && !m.bye);
    if (open[0]) call('markKnockoutNoShow', 'knockout', 0, open[0][1], 'a');
    if (open[1]) call('markKnockoutVoid', 'knockout', 0, open[1][1]);
  }
  budget = Infinity;
  playAll();
  sim.modals.length = 0;
  snap('done');
  const fin = copy(S()); fin.finalized = { at: '2026-11-07T14:30:00.000Z', by: 'org' };
  out.final = fin;
  return out;
}

let CACHE = null;
function buildStates() {
  if (CACHE) return CACHE;
  const list = [];
  UNITS.forEach((unit) => FORMATS.forEach((format) => {
    const n = format === 'podknockout' ? 12 : unit === 'Teams' ? 9 : 11;
    const ev = oneEvent(unit, format, n, { advanced: unit === 'Singles', start: unit === 'Doubles' ? '19:00' : '' });
    PHASES.forEach((phase) => { if (ev[phase]) list.push({ id: unit + '/' + format + '/' + phase, unit, format, phase, data: ev[phase] }); });
  }));
  const extra = (id, unit, format, n, opts, phase) => { const ev = oneEvent(unit, format, n, opts); list.push({ id, unit, format, phase, data: ev[phase] }); };
  extra('Singles/knockout-64/drawn', 'Singles', 'knockout', 64, { setupOnly: false, liveOnly: true }, 'drawn');
  extra('Singles/rr-tie/live', 'Singles', 'roundrobin', 8, { tie: true, liveOnly: true, start: '10:00' }, 'live');
  extra('Doubles/knockout-voids/done', 'Doubles', 'knockout', 10, { voids: true }, 'done');
  extra('Singles/rrknockout-plate/done', 'Singles', 'rrknockout', 14, { advanced: true, plate: true, variableLegs: true, start: '09:30', etype: 'Women' }, 'done');
  extra('Teams/rrknockout-plate/live', 'Teams', 'rrknockout', 10, { advanced: true, plate: true, etype: 'Youth' }, 'live');
  CACHE = list.filter((s) => s.data);
  return CACHE;
}

module.exports = { buildStates, UNITS, FORMATS, PHASES };

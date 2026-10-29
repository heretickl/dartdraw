/* Simulates ONE event end to end with the app's real functions (see README.md) and writes
   docs/design/simulation/<type>-<format>/{pre-game.html, completed.html, facts.json}.
   usage: node scripts/sim/run-event.js <Singles|Doubles|Teams> <knockout|rrknockout|podknockout|roundrobin> [outRoot] [en|ms]
   The last argument is the event's Printed sheets language (i18n step 4; default English). The screens stay English. */
const fs = require('fs');
const path = require('path');
const { createApp, run, ROOT } = require('./lib/appvm');
const { makePlayer } = require('./lib/play');
const { splitSheets, classify, writePage } = require('./lib/pack');

const ENTRIES = 67;
const FORMATS = {
  knockout: { slug: 'knockout', short: 'Knockout', label: 'Knockout - single bracket' },
  rrknockout: { slug: 'rr-knockout', short: 'Round Robin then Knockout', label: 'Round robin to Knockout (groups of up to 4, top 2, seeded)' },
  podknockout: { slug: 'group-boards', short: 'Group Boards', label: 'Knockout - Group Boards, then finals' },
  roundrobin: { slug: 'round-robin', short: 'Round Robin', label: 'Round robin only (groups of up to 4)' },
};
const NAME_PREFIX = { Singles: 'Singles', Doubles: 'Pair', Teams: 'Team' };
const POD_COUNT = 8;        // Group Boards: 67 entries into 8 groups of 8 or 9, one board each
const TIME_CAP_MS = 60000;

function pad2(n) { return String(n).padStart(2, '0'); }

function runEvent(unit, formatType, outRoot, lang) {
  const fmt = FORMATS[formatType];
  if (!fmt) throw new Error('unknown format ' + formatType);
  const key = unit.toLowerCase() + '-' + fmt.slug;
  const outDir = path.join(outRoot, key);
  const t0 = process.hrtime.bigint();
  const elapsed = () => Number((process.hrtime.bigint() - t0) / 1000000n);
  const phases = [];
  const phase = (name) => { phases.push({ name, ms: elapsed() }); if (elapsed() > TIME_CAP_MS * 3) throw new Error('event is taking far too long (' + elapsed() + ' ms) at ' + name); };

  const sim = createApp();
  const { app, f } = sim;
  const call = (name, ...args) => { app.__args = args; return run(app, name + '(...__args)'); };
  const isTeams = unit === 'Teams';
  const boards = formatType === 'podknockout' ? POD_COUNT : 4;
  const player = makePlayer('sim|' + key);
  const facts = { key, unit, formatType, formatLabel: fmt.label, entries: ENTRIES, boards, errors: [], notes: [] };
  if (lang === 'ms') facts.sheetLang = 'ms';
  const name = (id) => { const e = sim.state().entriesList.find((x) => x.id === id); return e ? e.name : '?'; };

  /* ---------- 1. set the event up exactly as the screens do ---------- */
  const t = f('blankTournament')(); sim.setState(t);
  t.id = 't_sim_' + key;
  if (lang === 'ms') t.printSettings.sheetLang = 'ms';   // i18n step 4: every sheet of this event prints in Bahasa Malaysia
  /* Step 1: event details, then Save */
  sim.withDoc({ f_tname: 'DartDraw Simulation Open', f_ename: unit + ' ' + fmt.short, f_etype: 'Open', f_unit: unit, f_date: '2026-11-07', f_entries: String(ENTRIES) }, () => f('saveStage1')());
  /* Scheduling box: the number of boards */
  sim.withDoc({ f_boards: String(boards) }, () => f('saveSchedulingModal')());
  /* Step 2: choose the format, then Save format and branding with the boxes the screen shows for it */
  f('setFormatType')(formatType);
  const boxes = {};
  if (!isTeams) boxes.f_bestof = '5';
  if (formatType === 'roundrobin' || formatType === 'rrknockout') boxes.f_maxgroup = '4';
  if (formatType === 'rrknockout') { boxes.f_qualifiers = '2'; boxes.f_advancemode = 'seeded'; }
  if (formatType === 'podknockout') { boxes.f_podcount = String(POD_COUNT); if (!isTeams) boxes.f_podlegs = '5'; }
  sim.withDoc(boxes, () => f('saveStage2')());
  if (!t.format.saved || !t.eventCreation.saved) throw new Error('setup did not save');
  /* Step 3: the entries, added one at a time as on the screen (event-only names: the simulator has no player library) */
  const active = () => sim.state().entriesList.filter((e) => !e.withdrawn);
  for (let i = 0; i < ENTRIES; i++) {
    const nm = NAME_PREFIX[unit] + ' ' + pad2(i + 1);
    const members = unit === 'Doubles' ? [{ name: nm + 'a', eventOnly: true }, { name: nm + 'b', eventOnly: true }] : isTeams ? [] : [{ name: nm, eventOnly: true }];
    if (!call('addEntryFromMembers', unit, unit === 'Singles' ? '' : nm, members)) throw new Error('entry ' + (i + 1) + ' was refused');
  }
  active().forEach((e, i) => call('renameEntry', e.id, NAME_PREFIX[unit] + ' ' + pad2(i + 1)));
  /* Knockout and Group Boards are seeded (the top 8 carry a seed number) so the seed badges show on the sheets */
  if (formatType === 'knockout' || formatType === 'podknockout') { call('setSeedingEnabled', true); call('setNumSeeds', 8); }
  if (isTeams) call('toggleLineupSheet', true);      // the tick-box "also print a lineup sheet for each fixture"
  call('setPublished', true);                        // Public results on, so the QR code shows in the sheet headers
  sim.state().publicSlug = 'sim' + require('./lib/play').hashString(key).toString(36).padStart(9, '0').slice(0, 9);   // the app picks a random slug; a fixed one keeps every run identical
  phase('setup');

  /* Check-in, draw, confirm */
  f('checkInAll')();
  if (formatType === 'knockout') {
    f('regenerateKnockoutBracket')();
  } else if (formatType === 'podknockout') {
    f('podsDrawClick')();
    f('podsConfirmAllClick')();
  } else {
    f('confirmShuffleGroups')();                     // the first draw runs at once
    f('confirmAllCharts')();
  }
  if (sim.modals.length) throw new Error('unexpected modal during the draw: ' + sim.modals.map((m) => m.title).join(' | '));
  phase('draw');

  /* ---------- what was drawn ---------- */
  const st = sim.state();
  if (st.groups.length) {
    facts.groups = st.groups.map((g) => g.entryIds.length);
    facts.groupCount = st.groups.length;
    facts.groupSizes = [...new Set(facts.groups)].sort();
    facts.groupMatches = st.groups.reduce((n, g) => n + g.entryIds.length * (g.entryIds.length - 1) / 2, 0);
  }
  if (st.pods && st.pods.length) {
    facts.groupCount = st.pods.length;
    facts.groups = st.pods.map((p) => p.entryIds.length);
    facts.groupSizes = [...new Set(facts.groups)].sort();
    facts.groupBracketSizes = st.pods.map((p) => p.bracket.size);
  }
  const bracketInfo = (label, b) => {
    /* a Group Boards Finals slot holds "Winner of Group N" (aFromPod / bFromPod) until the group is played */
    const entries = new Set(); b.rounds[0].forEach((m) => { ['a', 'b'].forEach((s) => { const k = m[s + 'EntryId'] || m[s + 'FromPod']; if (k) entries.add(k); }); });
    const byes = b.rounds[0].filter((m) => m.bye).length;
    return { label, slots: b.size, entries: entries.size, byes, rounds: b.rounds.length, plannedMatches: entries.size - 1 };
  };
  const bracketsNow = () => {
    const s = sim.state(), out = [];
    if (s.knockout) out.push(bracketInfo(s.knockout.podFinals ? 'Finals' : (s.knockout.label || 'Bracket'), s.knockout));
    if (s.knockoutLosers) out.push(bracketInfo('Plate pool', s.knockoutLosers));
    (s.pods || []).forEach((p) => out.push(bracketInfo('Group ' + p.label, p.bracket)));
    return out;
  };

  /* ---------- 2. PRE-GAME print pack: the real "Print bracket pack" button ---------- */
  /* The print button. A bracket that is not legible on the chosen paper opens the paper dialog first; the harness records it
     and answers it the way most organisers would, with the recommended size (the default option), which the dialog then prints. */
  facts.paperDialogs = [];
  const printNow = (stageName) => sim.capture(() => {
    f('doFinalPrint')();
    const i = sim.modals.findIndex((m) => /needs .* paper$/.test(m.title));
    if (i < 0) return;
    const m = sim.modals.splice(i, 1)[0];
    facts.paperDialogs.push({ stage: stageName, title: m.title, options: [...m.bodyHTML.matchAll(/<strong>([^<]*)<\/strong><small>/g)].map((x) => x[1]), answer: 'use (recommended)' });
    m.onConfirm();
  });
  const packSections = (html, lineupSamples) => {
    const sheets = splitSheets(html).map((h) => Object.assign({ html: h }, classify(h)));
    const byType = {}; sheets.forEach((s) => { byType[s.type] = (byType[s.type] || 0) + 1; });
    const sections = [];
    let lineupSeen = 0;
    sheets.forEach((s) => {
      if (s.type === 'lineup') { lineupSeen++; return; }
      if (s.type === 'bracket') s.label = s.label + ' | ' + s.subtitle;
      const last = sections[sections.length - 1];
      if (last && last.type === s.type) last.sheets.push(s); else sections.push({ type: s.type, sheets: [s] });
    });
    if (lineupSeen && lineupSamples && lineupSamples.length) {
      sections.push({ type: 'lineup', sheets: lineupSamples.map((x) => ({ html: x.html, label: x.label, type: 'lineup' })), shownCount: lineupSamples.length,
        title: 'Teams lineup sheets - samples (the pack holds ' + lineupSeen + ')',
        note: 'The real pack prints one lineup sheet per fixture (' + lineupSeen + ' here). Only the sheets named below are shown, to keep this page small; every lineup sheet has the same layout. The empty (emergency) lineup sheet and the knockout sheets printed as they become ready are in their own sections below.' });
    }
    return { sheets, byType, sections, total: sheets.length };
  };
  const lineupSample = (listHtml, which, caption) => {
    const parts = splitSheets(listHtml); if (!parts.length) return null;
    const h = parts[which === 'last' ? parts.length - 1 : 0];
    return { html: h, label: caption + ' - ' + classify(h).label.replace('Lineup sheet · ', ''), total: parts.length };
  };

  const pre = {};
  const preHtml = printNow('pre-game');
  if (!preHtml) throw new Error('the print button produced no sheets');
  if (sim.modals.length) throw new Error('print button opened a modal: ' + sim.modals.map((m) => m.title + ': ' + (m.body || '')).join(' | '));
  const preSamples = [];
  if (isTeams) {
    const rrL = lineupSample(f('teamLineupSheetsHTML')(), 'first', 'Round robin fixture (first)');
    if (rrL) preSamples.push(rrL);
    const koL = lineupSample(f('knockoutLineupSheetsHTML')(), 'first', 'First knockout fixture that is ready');
    if (koL) preSamples.push(koL); else if (formatType === 'rrknockout') facts.notes.push('No knockout lineup sheet is ready before play: the bracket is drawn after the round robin.');
    pre.lineupSheets = { roundRobin: rrL ? rrL.total : 0, knockout: koL ? koL.total : 0 };
  }
  const prePack = packSections(preHtml, preSamples);
  pre.sheetsTotal = prePack.total; pre.byType = prePack.byType;
  pre.brackets = bracketsNow();
  if (formatType === 'rrknockout') {
    const q = f('projectedQualifierEntries')(sim.state());
    const size = f('nearestBracket')(Math.max(q.length, 2));
    pre.projected = { qualifiers: q.length, slots: size.size, byes: size.byes, matches: q.length - 1 };
  }
  /* Teams: the knockout lineup sheets that are ready (the Manage Tournament card's "Print all ready lineup sheets") and the
     empty emergency sheet ("Print empty lineup sheet"), printed through the real buttons */
  const sheetSection = (html, title, note, max) => {
    const parts = splitSheets(html);
    return parts.length ? { type: 'lineup', title, note, shownCount: Math.min(parts.length, max || parts.length), sheets: parts.slice(0, max || parts.length).map((h) => Object.assign({ html: h }, classify(h))) } : null;
  };
  facts.lineupReady = [];
  const printReady = (when) => {
    const html = sim.capture(() => f('printReadyLineups')());
    const n = splitSheets(html).length;
    sim.modals = sim.modals.filter((m) => m.title !== 'No lineup sheets waiting');
    facts.lineupReady.push({ when, printed: n, rememberedPrinted: Object.keys(sim.state().lineupPrinted || {}).length });
    return html;
  };
  if (isTeams) {
    if (formatType !== 'roundrobin' && formatType !== 'rrknockout') {
      /* the pack above printed every ready knockout sheet (the lineup tick is on), so the app already counts them as printed:
         "Print all ready lineup sheets" has nothing left, and "Print lineup" on a match reprints it */
      printReady('before play (after the pack)');
      const ready = call('lineupReadyMatches', sim.state());
      pre.lineupReadyBeforePlay = { ready: ready.length, printed: ready.filter((x) => x.printed).length };
      const s = ready.length ? sheetSection(sim.capture(() => f('printLineupFor')(ready[0].key)), 'Knockout lineup sheet of match ' + ready[0].tag + ' ("Print lineup" on that match in Manage Tournament)',
        ready.length + ' knockout matches have both teams known before play; ' + pre.lineupReadyBeforePlay.printed + ' are already marked printed by the pack, so "Print all ready lineup sheets" printed none, and "Print lineup" reprints one.', 1) : null;
      if (s) prePack.sections.push(s);
    }
    const empty = sheetSection(sim.capture(() => f('printEmptyLineups')(2)), 'Empty lineup sheet ("Print empty lineup sheet", 2 copies asked for, 1 shown)',
      'Every box blank: Group, Board, Fixture, Game No. and the team name; the segments and the tie-breaker bar as set up, TOTAL POINTS and the signature space.', 1);
    if (empty) { prePack.sections.push(empty); pre.emptyLineupCopies = splitSheets(sim.capture(() => f('printEmptyLineups')(2))).length; }
  }
  phase('pre-game print');

  /* The paper choice. The pre-game print above asked (when the bracket was not legible on A4) and took the recommended size.
     For the single knockout (the 128-slot case) the same bracket is also printed the other two ways the dialog offers, kept on A4
     and shrunk, and split over A4 sheets, and on the bigger sizes, so the page shows every answer. */
  let paperSections = null;
  if (formatType === 'knockout') {
    paperSections = [];
    const ps = sim.state().printSettings, chosen = ps.koPaperSize;
    const adv = call('koPaperAdvice', call('koPrintModels', sim.state()), 'A4');
    const variants = [
      ['A4 kept (the dialog\'s "Keep A4": shrunk to one sheet)', 'A4', { mode: 'shrink', paper: 'A4', rec: adv.rec }],
      ['Split over A4 sheets (the dialog\'s "Split over N A4 sheets")', 'A4', { mode: 'split', paper: 'A4', rec: adv.rec }],
    ].concat(['A3', 'A2', 'A1'].map((p) => [p + (p === adv.rec ? ' (recommended)' : ''), p, null]));
    facts.paperSizes = [];
    variants.forEach(([title, size, choice]) => {
      ps.koPaperSize = size; if (choice) ps.koPaperChoice = choice; else delete ps.koPaperChoice;
      const sheets = splitSheets(call('knockoutBracketSheetHTML', sim.state().knockout)).map((h) => Object.assign({ html: h }, classify(h), { type: 'bracket' }));
      paperSections.push({ type: 'bracket', title: 'Pre-game bracket: ' + title, note: 'Same bracket, "Knockout bracket paper size" ' + size + (choice ? ', answer "' + choice.mode + '" remembered' : '') + '.', sheets });
      facts.paperSizes.push({ size: title, sheets: sheets.length });
    });
    ps.koPaperSize = chosen; delete ps.koPaperChoice;
    facts.paperAdvice = { a4NamePt: +adv.minPt.toFixed(2), recommended: adv.rec, splitSheets: adv.split ? adv.split.sheets : null };
  }
  /* Round robin to Knockout: the projected brackets of a much bigger event (200 entries, groups of 4, top 2, Plate pool on)
     on the paper the app recommends for them, to check the small text (round labels, Plate match numbers) at that size. */
  if (formatType === 'rrknockout') {
    const keep = sim.state();
    const big = f('blankTournament')(); sim.setState(big);
    Object.assign(big.eventCreation, { saved: true, tournamentName: 'DartDraw Simulation Open', eventName: unit + ' 200', eventType: 'Open', competitionUnit: unit, entries: 200, boards: 8 });
    Object.assign(big.format, { saved: true, formatType: 'rrknockout', maxPerGroup: 4, qualifiersPerGroup: 2, advanceMode: 'seeded', losersPool: true, bestOfLegs: 5 });
    big.entriesList = Array.from({ length: 200 }, (_, i) => ({ id: 'b' + i, name: NAME_PREFIX[unit] + ' ' + String(i + 1).padStart(3, '0'), org: '', players: [], withdrawn: false }));
    f('buildGroups')(big); big.groups.forEach((g) => { g.confirmed = true; });
    const models = call('koPrintModels', big), advB = call('koPaperAdvice', models, 'A4');
    big.printSettings.koPaperSize = advB.rec;
    const html = call('projectedPrintList', big).map((x) => call('projectedBracketSheetHTML', x.entries, x.title)).join('');
    const sheets = splitSheets(html).map((h) => Object.assign({ html: h }, classify(h)));
    paperSections = [{ type: 'projected', title: 'Projected brackets of a 200-entry event on ' + advB.rec + ' (recommended)', note: '50 groups of 4, top 2 to the main bracket, the rest to the Plate pool: 100 + 100 projected entries in 128-slot draws.', sheets }];
    facts.paperSizes = [{ size: '200-entry projected on ' + advB.rec, sheets: sheets.length }];
    facts.paperAdvice = { a4NamePt: +advB.minPt.toFixed(2), recommended: advB.rec, splitSheets: advB.split ? advB.split.sheets : null };
    sim.setState(keep);
  }

  /* ---------- 3. start the games ---------- */
  if (formatType === 'roundrobin' || formatType === 'rrknockout') {
    f('startAllGames')();
    const m = sim.popModal(); m.onConfirm();
    if (!sim.state().groups.every((g) => g.gameStarted)) throw new Error('games did not start');
  }
  /* knockout rounds are started with "Start round" as each becomes eligible (below); Group Boards has no start button */
  phase('start');

  /* ---------- 4. play it ---------- */
  const S = () => sim.state();
  const segs = () => call('teamSegmentsOf', S());
  let results = 0;
  const enter = (modal, a, b, what) => { const err = sim.enterScore(modal, a, b); if (err) throw new Error('result refused (' + what + '): ' + err); results++; };

  const playGroups = () => {
    const bestOf = parseInt(S().format.bestOfLegs) || 5;
    S().groups.forEach((g) => {
      call('groupMatches', g).forEach((pair) => {
        const a = pair[0], b = pair[1];
        call('promptScore', g.id, a, b, name(a), name(b));
        const modal = sim.popModal();
        let r;
        if (isTeams) { const x = player.team(a, b, segs(), call('teamTieBreakerFor', S(), 'rr'), 'rr'); r = [x.a, x.b]; } else r = player.plain(a, b, bestOf);
        enter(modal, r[0], r[1], 'group ' + g.label + ' ' + name(a) + ' v ' + name(b));
      });
    });
  };
  const resolveTies = () => {
    let guard = 0;
    for (;;) {
      const runs = call('unresolvedTieRuns', S());
      if (!runs.length) break;
      if (++guard > 500) throw new Error('could not settle the ties');
      const r = runs[0];
      const standings = call('computeStandings', r.group);
      f('openPositionOverridePicker') && call('openPositionOverridePicker', r.group.id);
      const modal = sim.popModal();
      const vals = {};
      standings.forEach((s) => { vals['posov_' + s.id] = s.manualOverride ? String(s.position) : ''; });
      r.ids.forEach((id, i) => { vals['posov_' + id] = String(r.first + i); });
      app.document = { getElementById: (id) => (id in vals ? { value: vals[id] } : null), createElement: sim.DOC.createElement, body: sim.DOC.body };
      try { modal.onConfirm(); } finally { app.document = sim.DOC; }
      facts.tiesSettledByOrganiser = (facts.tiesSettledByOrganiser || 0) + 1;
    }
  };
  /* A knockout bracket (or a Group Boards group, or the Finals), round by round. */
  const playBracket = (key) => {
    const bracket = () => call('bracketByKey', S(), key);
    const stage = 'ko';
    const total = bracket().rounds.length;
    for (let ri = 0; ri < total; ri++) {
      if (key === 'knockout' || key === 'knockoutLosers') {
        if (call('nextEligibleKnockoutRound', bracket()) === ri) call('startKnockoutRound', key, ri);   // the "Start round" button
      }
      for (let mi = 0; mi < bracket().rounds[ri].length; mi++) {
        const m = bracket().rounds[ri][mi];
        if (!m.aEntryId || !m.bEntryId || m.bye || m.winnerId || m.void) continue;
        call('koMatchScoreModal', key, ri, mi);
        const modal = sim.popModal();
        let r;
        if (isTeams) { const x = player.team(m.aEntryId, m.bEntryId, segs(), call('teamTieBreakerFor', S(), stage), stage); r = [x.a, x.b]; }
        else r = player.plain(m.aEntryId, m.bEntryId, call('legsForKnockoutRound', S(), key, total, ri));
        enter(modal, r[0], r[1], key + ' round ' + (ri + 1) + ' match ' + (mi + 1));
      }
      /* Teams: as each round finishes, the next round's lineup sheets become ready; print them with the real button */
      if (isTeams && ri < total - 1) {
        const pod = /^pod:/.test(key) ? S().pods.find((p) => 'pod:' + p.id === key) : null;
        const name = pod ? 'Group ' + pod.label : key === 'knockout' ? (S().knockout.podFinals ? 'Finals' : 'Main bracket') : 'Plate pool';
        const html = printReady(name + ' after ' + call('koRoundName', bracket(), ri));
        if (!koReadyLater && splitSheets(html).length) koReadyLater = { html, when: name + ', after ' + call('koRoundName', bracket(), ri) };
      }
    }
    if (!call('bracketIsComplete', bracket())) throw new Error(key + ' did not finish');
  };

  /* what the first knockout lineup sheet looks like the moment it is ready (Teams) */
  let koLineupWhenReady = null, koReadyLater = null;
  const grabKoLineup = () => { if (isTeams && !koLineupWhenReady) koLineupWhenReady = lineupSample(f('knockoutLineupSheetsHTML')(), 'first', 'First knockout fixture that was ready'); };

  if (formatType === 'knockout') {
    grabKoLineup();
    playBracket('knockout');
  } else if (formatType === 'roundrobin') {
    playGroups(); resolveTies();
  } else if (formatType === 'rrknockout') {
    playGroups(); resolveTies();
    phase('round robin played');
    f('confirmGenerateKnockoutFromRR')();
    if (sim.modals.length) throw new Error('could not draw the knockout: ' + sim.modals.map((m) => m.title + ': ' + (m.body || m.bodyHTML || '')).join(' | '));
    if (!S().knockout) throw new Error('no knockout was drawn');
    facts.knockoutDrawn = bracketInfo('Main bracket', S().knockout);
    grabKoLineup();
    playBracket('knockout');
    if (S().knockoutLosers) playBracket('knockoutLosers');
  } else if (formatType === 'podknockout') {
    S().pods.forEach((p) => playBracket('pod:' + p.id));
    phase('groups played');
    if (!call('podsFinals', S())) throw new Error('no Finals were built');
    playBracket('knockout');
  }
  phase('played');

  /* ---------- 5. verify ---------- */
  const fin = S();
  facts.resultsEntered = results;
  facts.eventComplete = !!call('eventComplete', fin);
  const champ = (b) => { const id = call('bracketChampion', b); return id ? name(id) : null; };
  if (formatType === 'knockout' || formatType === 'rrknockout' || formatType === 'podknockout') {
    facts.champion = champ(fin.knockout);
    if (fin.knockoutLosers) facts.plateChampion = champ(fin.knockoutLosers);
  } else {
    facts.groupWinners = fin.groups.map((g) => name(call('computeStandings', g)[0].id));
    facts.champion = null;
    facts.notes.push('Round robin only has no single champion: each of the ' + fin.groups.length + ' groups has its own winner (listed).');
  }
  if (fin.pods && fin.pods.length) facts.groupWinners = fin.pods.map((p) => name(call('podChampion', p)));
  if (!facts.eventComplete) facts.errors.push('eventComplete() is false at the end');
  if (formatType !== 'roundrobin' && !facts.champion) facts.errors.push('no champion');
  const played = (b) => b.rounds.reduce((n, r) => n + r.filter((m) => m.winnerId && !m.bye).length, 0);
  facts.brackets = [];
  if (fin.knockout) facts.brackets.push(Object.assign(bracketInfo(fin.knockout.podFinals ? 'Finals' : (fin.knockout.label || 'Bracket'), fin.knockout), { playedMatches: played(fin.knockout) }));
  if (fin.knockoutLosers) facts.brackets.push(Object.assign(bracketInfo('Plate pool', fin.knockoutLosers), { playedMatches: played(fin.knockoutLosers) }));
  (fin.pods || []).forEach((p) => facts.brackets.push(Object.assign(bracketInfo('Group ' + p.label, p.bracket), { playedMatches: played(p.bracket) })));
  if (formatType === 'roundrobin' || formatType === 'rrknockout') facts.roundRobinMatchesPlayed = fin.groups.reduce((n, g) => n + call('groupMatches', g).length, 0);
  phase('verified');

  /* ---------- 6. COMPLETED print pack: the same real button, now with every result in ---------- */
  const doneHtml = printNow('completed');
  const doneSamples = [];
  if (isTeams) {
    const first = koLineupWhenReady || lineupSample(f('teamLineupSheetsHTML')(), 'first', 'Round robin fixture (first)');
    if (first) doneSamples.push(first);
    const last = lineupSample(f('knockoutLineupSheetsHTML')(), 'last', 'Last knockout fixture (the final)');
    if (last) doneSamples.push(last);
  }
  const donePack = packSections(doneHtml, doneSamples);
  if (koReadyLater) {
    const s = sheetSection(koReadyLater.html, 'Knockout lineup sheets that became ready during play (' + koReadyLater.when + ', "Print all ready lineup sheets")',
      'Printed the moment both teams of the next match were known; the round\'s tie-breaker bar follows the knockout setting (sheet 1 shown). Printed counts per round: ' +
      facts.lineupReady.map((x) => x.when + ' ' + x.printed).join('; ') + '.', 1);
    if (s) donePack.sections.push(s);
  }
  const completed = { sheetsTotal: donePack.total, byType: donePack.byType };
  phase('completed print');

  /* ---------- 7. write the two pages ---------- */
  const brText = (list) => list.map((b) => b.label + ': ' + b.slots + ' slots, ' + b.entries + ' entries, ' + b.byes + ' byes, ' + b.plannedMatches + ' matches').join('; ');
  const common = [
    ['Competition type', unit], ['Format', fmt.label], ['Entries', ENTRIES + ' (' + NAME_PREFIX[unit] + ' 01 to ' + NAME_PREFIX[unit] + ' ' + ENTRIES + ')'], ['Boards', boards],
  ];
  if (facts.groupCount) common.push([formatType === 'podknockout' ? 'Groups (Group Boards)' : 'Round robin groups', facts.groupCount + ' (sizes ' + facts.groupSizes.join(' / ') + ')']);
  if (isTeams) common.push(['Team match', call('teamMatchShortLabel', S(), null)]);
  writePage(path.join(outDir, 'pre-game.html'), { lang,
    title: unit + ' ' + fmt.slug + ' pre-game', heading: unit + ' - ' + fmt.label + ' - PRE-GAME print pack', stageName: 'Pre-game print pack (before any game)',
    facts: common.concat([['Sheets in the pack', pre.sheetsTotal + ' (' + Object.keys(pre.byType).map((k) => k + ' ' + pre.byType[k]).join(', ') + ')'],
      ['Brackets', pre.brackets.length ? brText(pre.brackets) : (pre.projected ? 'projected only: ' + pre.projected.qualifiers + ' qualifiers in a ' + pre.projected.slots + '-slot bracket, ' + pre.projected.byes + ' byes, ' + pre.projected.matches + ' matches' : 'none')]]),
    sections: prePack.sections, backLink: '../index.html',
  });
  writePage(path.join(outDir, 'completed.html'), { lang,
    title: unit + ' ' + fmt.slug + ' completed', heading: unit + ' - ' + fmt.label + ' - COMPLETED print pack', stageName: 'Completed (every result entered)',
    facts: common.concat([['Sheets in the pack', completed.sheetsTotal + ' (' + Object.keys(completed.byType).map((k) => k + ' ' + completed.byType[k]).join(', ') + ')'],
      ['Result', facts.champion ? 'Champion: ' + facts.champion : (facts.groupWinners ? 'Group winners: ' + facts.groupWinners.length : '')], ['Event complete (app check)', String(facts.eventComplete)], ['Results typed in', results]]),
    sections: donePack.sections, backLink: '../index.html',
  });

  if (paperSections) {
    writePage(path.join(outDir, 'paper-sizes.html'), { lang,
      title: unit + ' ' + fmt.slug + ' paper sizes', heading: unit + ' - ' + fmt.label + (formatType === 'rrknockout' ? ' - the projected brackets of a 200-entry event on the recommended paper' : ' - the same bracket: kept on A4, split over A4, and on A3, A2, A1'), stageName: formatType === 'rrknockout' ? 'Projected brackets, 200 entries' : 'Paper choices (pre-game bracket)',
      facts: common.concat([['Paper dialog on the pre-game print', facts.paperDialogs.length ? facts.paperDialogs[0].title + ' | options: ' + facts.paperDialogs[0].options.join(' / ') + ' | answered: ' + facts.paperDialogs[0].answer : 'not shown (legible on A4)'],
        ['On A4', 'names ' + facts.paperAdvice.a4NamePt + ' pt; recommended ' + facts.paperAdvice.recommended + (facts.paperAdvice.splitSheets ? '; split: ' + facts.paperAdvice.splitSheets + ' A4 sheets' : '')],
        ['Sheets per choice', facts.paperSizes.map((p) => p.size + ': ' + p.sheets).join(', ')]]),
      sections: paperSections, backLink: '../index.html',
    });
  }
  facts.pre = pre; facts.completed = completed;
  facts.elapsedMs = elapsed(); facts.phases = phases; facts.exceeded60s = facts.elapsedMs > TIME_CAP_MS;
  fs.writeFileSync(path.join(outDir, 'facts.json'), JSON.stringify(facts, null, 2));
  return facts;
}

if (require.main === module) {
  const [unit, formatType, outRoot, lang] = process.argv.slice(2);
  const out = outRoot || path.join(ROOT, 'docs', 'design', 'simulation');
  let facts;
  try { facts = runEvent(unit, formatType, out, lang); } catch (e) {
    const key = unit.toLowerCase() + '-' + (FORMATS[formatType] || { slug: formatType }).slug;
    fs.mkdirSync(path.join(out, key), { recursive: true });
    fs.writeFileSync(path.join(out, key, 'facts.json'), JSON.stringify({ key, unit, formatType, errors: [String(e && e.stack || e)], failed: true }, null, 2));
    console.error('FAILED ' + key + ': ' + (e && e.stack || e));
    process.exit(1);
  }
  console.log('ok ' + facts.key + ' ' + facts.elapsedMs + ' ms, complete=' + facts.eventComplete + ', champion=' + facts.champion + ', pre sheets=' + facts.pre.sheetsTotal + ', done sheets=' + facts.completed.sheetsTotal);
}

module.exports = { runEvent, FORMATS };

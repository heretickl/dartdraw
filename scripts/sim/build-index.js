/* Builds docs/design/simulation/index.html and FINDINGS.md from the facts.json of every event and audit.json (the layout audit).
   Hand-written reviewer notes (scripts/sim/findings-notes.js), if present, are placed at the top of FINDINGS.md.
   usage: node scripts/sim/build-index.js [outRoot] */
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./lib/appvm');

const ORDER = [];
['Singles', 'Doubles', 'Teams'].forEach((u) => ['knockout', 'rr-knockout', 'group-boards', 'round-robin'].forEach((f) => ORDER.push(u.toLowerCase() + '-' + f)));
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');

/* ---- reduce one stage's audit to the numbers the index and findings use ---- */
function reduce(a) {
  if (!a || a.error || !a.sheets) return null;
  const sheets = a.sheets;
  const br = sheets.filter((s) => s.boxes);
  const r = {
    sheets: sheets.length, bracketSheets: br.length, error: null,
    overlapPairs: br.reduce((n, s) => n + s.boxes.overlaps, 0), overlapSheets: br.filter((s) => s.boxes.overlaps > 0).length,
    touchPairs: br.reduce((n, s) => n + s.boxes.touches, 0), touchSheets: br.filter((s) => s.boxes.touches > 0).length,
    minGapPx: null, minGapMm: null, clippedTexts: br.reduce((n, s) => n + (s.text ? s.text.clipped : 0), 0), clippedSheets: br.filter((s) => s.text && s.text.clipped > 0).length,
    clipSamples: [].concat(...br.map((s) => (s.text ? s.text.samples : []))).slice(0, 5),
    overflow: sheets.filter((s) => s.overflow.any).map((s) => ({ idx: s.idx, type: s.type, label: s.label, px: Math.max(s.overflow.scrollY, s.overflow.spillBottomPx, s.overflow.scrollX, s.overflow.spillRightPx) })),
    frameClip: sheets.filter((s) => s.artboardClipPx > 1).map((s) => ({ idx: s.idx, label: s.label, px: s.artboardClipPx })),
    lineupOverflow: sheets.filter((s) => s.lineupCardsOverflowing > 0).length,
    shapes: [...new Set(br.map((s) => s.shape))],
    paper: [...new Set(sheets.map((s) => s.type + ' ' + s.paperMm.w + 'x' + s.paperMm.h + 'mm'))],
    bracketPaper: [...new Set(sheets.filter((s) => s.type === 'bracket' || s.type === 'projected').map((s) => s.paperMm.w + 'x' + s.paperMm.h + 'mm'))],
    minFontPt: null, minBoxHeightPx: null, kinds: { named: 0, bye: 0, placeholder: 0, empty: 0 }, scale: null, userAgent: a.userAgent, fonts: a.fonts,
    mostlyBlank: 0,
  };
  const gaps = br.map((s) => s.boxes.minGapPx).filter((g) => g !== null);
  if (gaps.length) { r.minGapPx = Math.min.apply(null, gaps); r.minGapMm = Math.round(r.minGapPx * 25.4 / 96 * 10) / 10; }
  const fonts = br.map((s) => s.text && s.text.minEffectiveFontPt).filter((x) => x != null);
  if (fonts.length) r.minFontPt = Math.min.apply(null, fonts);
  const hs = br.map((s) => s.boxes.minBoxHeightPx).filter((x) => x != null);
  if (hs.length) r.minBoxHeightPx = Math.min.apply(null, hs);
  br.forEach((s) => { if (s.boxes.kinds) { Object.keys(r.kinds).forEach((k) => { r.kinds[k] += s.boxes.kinds[k] || 0; }); if (s.boxes.kinds.named === 0 && s.boxes.kinds.placeholder === 0) r.mostlyBlank++; } });
  const sc = br.map((s) => s.scale).filter((x) => x); if (sc.length) r.scale = [Math.min.apply(null, sc), Math.max.apply(null, sc)];
  const kb = sheets.filter((s) => s.kb);
  const mn = (a) => (a.length ? Math.min.apply(null, a) : null), mx = (a) => (a.length ? Math.max.apply(null, a) : null);
  r.kb = kb.length ? {
    sheets: kb.length, overlaps: kb.reduce((n, s) => n + s.kb.overlaps, 0), touching: kb.reduce((n, s) => n + s.kb.touching, 0), outside: kb.reduce((n, s) => n + s.kb.outside, 0),
    clipped: kb.reduce((n, s) => n + s.kb.clipped, 0), clipSamples: [].concat(...kb.map((s) => s.kb.clipList)).slice(0, 5), overlapSamples: [].concat(...kb.map((s) => s.kb.overlapList)).slice(0, 5),
    minGapMm: mn(kb.map((s) => s.kb.minGapMm).filter((x) => x !== null)), minGapInMatchMm: mn(kb.map((s) => s.kb.minGapInMatchMm).filter((x) => x !== null)), minGapBetweenMm: mn(kb.map((s) => s.kb.minGapBetweenMm).filter((x) => x !== null)),
    minNamePt: mn(kb.map((s) => s.kb.minNamePt).filter((x) => x !== null)), maxNamePt: mx(kb.map((s) => s.kb.maxNamePt).filter((x) => x !== null)),
    belowFloor: kb.filter((s) => s.kb.legible && s.kb.minNamePt !== null && s.kb.minNamePt < 6.95).length, textUnderFloor: kb.reduce((n, s) => n + (s.kb.textUnderFloor || 0), 0), minTextPt: mn(kb.map((s) => s.kb.minTextPt).filter((x) => x != null)), shrunk: kb.filter((s) => !s.kb.legible).length, notUniform: kb.filter((s) => s.kb.boxHeightsMm.length > 1).length,
    shapes: [...new Set(kb.map((s) => s.kb.shape))], papers: [...new Set(kb.map((s) => s.kb.paper))], scales: kb.map((s) => s.kb.scale), sections: kb.filter((s) => s.kb.kind === 'wing').length,
  } : null;
  if (r.kb) { r.shapes = [...new Set(r.shapes.concat(r.kb.shapes))]; r.scale = [mn(r.kb.scales.concat(r.scale ? [r.scale[0]] : [])), mx(r.kb.scales.concat(r.scale ? [r.scale[1]] : []))]; }
  const ro = sheets.filter((s) => s.runningOrder);
  r.runningOrder = ro.length ? { sheets: ro.length, columns: mx(ro.map((s) => s.runningOrder.columns)), groups: ro.reduce((n, s) => n + s.runningOrder.groups, 0), matches: ro.reduce((n, s) => n + s.runningOrder.matches, 0), bad: ro.filter((s) => s.runningOrder.outside || s.runningOrder.clipped).length } : null;
  r.wings = sheets.filter((s) => s.type === 'bracket' && /Section [LR]\d/.test(s.label)).length;
  r.finalsSheets = sheets.filter((s) => s.type === 'bracket' && /\| .*Finals$/.test(s.label)).length;
  return r;
}

/* the paper-size comparison page: one summary per paper size (the sheets are told apart by their paper dimensions) */
function paperReduce(a) {
  if (!a || a.error || !a.sheets) return null;
  const names = { 281: 'A4', 404: 'A3', 578: 'A2', 825: 'A1' };
  const by = {};
  a.sheets.forEach((s) => { const k = (names[s.paperMm.w] || (s.paperMm.w + 'mm')) + (/Section|Finals sheet/.test(s.label) ? ' split' : s.kb && !s.kb.legible ? ' kept (shrunk)' : ''); (by[k] = by[k] || []).push(s); });
  return Object.keys(by).sort().map((k) => {
    const list = by[k], br = list.filter((s) => s.boxes), gaps = br.map((s) => s.boxes.minGapPx).filter((g) => g !== null), fonts = br.map((s) => s.text && s.text.minEffectiveFontPt).filter((x) => x != null);
    const kb = list.filter((s) => s.kb);
    if (kb.length) return { paper: k, sheets: list.length, scale: Math.min.apply(null, kb.map((s) => s.kb.scale)), minNamePt: Math.min.apply(null, kb.map((s) => s.kb.minNamePt).filter((x) => x !== null)), minGapMm: Math.min.apply(null, kb.map((s) => s.kb.minGapMm).filter((x) => x !== null)),
      overlapPairs: kb.reduce((n, s) => n + s.kb.overlaps, 0), touchPairs: kb.reduce((n, s) => n + s.kb.touching, 0), clipped: kb.reduce((n, s) => n + s.kb.clipped, 0), overflow: kb.reduce((n, s) => n + s.kb.outside, 0) + list.filter((s) => s.overflow.any).length, kb: true };
    return { paper: k, sheets: list.length, touchPairs: br.reduce((n, s) => n + s.boxes.touches, 0), overlapPairs: br.reduce((n, s) => n + s.boxes.overlaps, 0), minGapPx: gaps.length ? Math.min.apply(null, gaps) : null,
      minFontPt: fonts.length ? Math.min.apply(null, fonts) : null, clipped: br.reduce((n, s) => n + (s.text ? s.text.clipped : 0), 0), overflow: list.filter((s) => s.overflow.any).length, scale: (br.find((s) => s.scale) || {}).scale || null };
  });
}

function shapeText(r) {
  if (!r || !r.shapes.length) return 'no bracket drawn';
  return r.shapes.map((s) => (s === 'two-sided' ? 'two-sided chart (left half | Final in the centre | right half)' : s === 'one half (section sheet)' ? 'split section sheets (one half each)' : s === 'final only' ? 'final only' : 'one-sided left-to-right tree (all rounds in columns, Final at the right)')).join(' + ');
}

/* severity of each finding: HIGH = unusable or wrong print, MEDIUM = cramped or hard to read, LOW = note */
function findingsFor(ev) {
  const out = [];
  ['pre', 'done'].forEach((stage) => {
    const r = ev[stage === 'pre' ? 'preAudit' : 'doneAudit'], label = stage === 'pre' ? 'Pre-game' : 'Completed';
    if (!r) return;
    r.overflow.forEach((o) => {
      const big = o.px > 8;
      out.push({ sev: big ? 'HIGH' : 'MEDIUM', stage: label, text: 'Sheet #' + o.idx + ' (' + o.type + ': ' + o.label + ') overflows its paper box by ' + Math.round(o.px) + ' px (' + Math.round(o.px * 25.4 / 96) + ' mm); in print this content runs past the page.' });
    });
    r.frameClip.forEach((o) => out.push({ sev: 'HIGH', stage: label, text: 'Sheet #' + o.idx + ' (' + o.label + '): the bracket is clipped by its frame by ' + Math.round(o.px) + ' px.' }));
    if (r.overlapPairs) out.push({ sev: 'HIGH', stage: label, text: r.overlapPairs + ' pair(s) of name boxes overlap on ' + plural(r.overlapSheets, 'bracket sheet') + '.' });
    if (r.clippedTexts) out.push({ sev: 'HIGH', stage: label, text: r.clippedTexts + ' name(s) are clipped or truncated on ' + plural(r.clippedSheets, 'bracket sheet') + (r.clipSamples.length ? ' (e.g. ' + r.clipSamples.map((s) => '"' + s + '"').join(', ') + ')' : '') + '.' });
    if (r.touchPairs) out.push({ sev: (r.minGapPx !== null && r.minGapPx < 2) ? 'HIGH' : 'MEDIUM', stage: label, text: r.touchPairs + ' pair(s) of name boxes are closer than 4 px on ' + plural(r.touchSheets, 'bracket sheet') + ' of ' + r.bracketSheets + '; smallest gap ' + r.minGapPx + ' px (' + r.minGapMm + ' mm) on the printed sheet.' });
    if (r.bracketSheets && r.minFontPt !== null && r.minFontPt < 7) out.push({ sev: 'MEDIUM', stage: label, text: 'Names print as small as ' + r.minFontPt + ' pt (the app keeps a 9 px floor); box height down to ' + r.minBoxHeightPx + ' px.' });
    if (r.lineupOverflow) out.push({ sev: 'HIGH', stage: label, text: r.lineupOverflow + ' lineup sheet(s) overflow a card.' });
    if (r.kb) {
      if (r.kb.overlaps) out.push({ sev: 'HIGH', stage: label, text: r.kb.overlaps + ' overlapping printed item(s) on the two-sided bracket sheets (' + r.kb.overlapSamples.join('; ') + ').' });
      if (r.kb.touching) out.push({ sev: 'HIGH', stage: label, text: r.kb.touching + ' pair(s) of bracket boxes closer than the gap floors.' });
      if (r.kb.outside) out.push({ sev: 'HIGH', stage: label, text: r.kb.outside + ' item(s) off the bracket sheet.' });
      if (r.kb.clipped) out.push({ sev: 'HIGH', stage: label, text: r.kb.clipped + ' clipped text(s) on the bracket sheets (' + r.kb.clipSamples.join('; ') + ').' });
      if (r.kb.belowFloor) out.push({ sev: 'HIGH', stage: label, text: r.kb.belowFloor + ' legible bracket sheet(s) with names under 7 pt.' });
      if (r.kb.textUnderFloor) out.push({ sev: 'HIGH', stage: label, text: r.kb.textUnderFloor + ' text(s) on the bracket sheets under the 4.6 pt floor.' });
      if (r.kb.notUniform) out.push({ sev: 'MEDIUM', stage: label, text: r.kb.notUniform + ' bracket sheet(s) with more than one box height.' });
    }
    if (r.runningOrder && r.runningOrder.bad) out.push({ sev: 'HIGH', stage: label, text: r.runningOrder.bad + ' running order sheet(s) with content off the sheet or clipped.' });
  });
  return out;
}

function build(outRoot) {
  const audit = fs.existsSync(path.join(outRoot, 'audit.json')) ? JSON.parse(fs.readFileSync(path.join(outRoot, 'audit.json'), 'utf8')) : null;
  const events = ORDER.map((key) => {
    const p = path.join(outRoot, key, 'facts.json');
    if (!fs.existsSync(p)) return { key, missing: true };
    const facts = JSON.parse(fs.readFileSync(p, 'utf8'));
    const aud = audit && audit.events && audit.events[key];
    return Object.assign(facts, { key, preAudit: reduce(aud && aud['pre-game']), doneAudit: reduce(aud && aud.completed), paperAudit: paperReduce(aud && aud['paper-sizes']), auditError: aud && ((aud['pre-game'] || {}).error || (aud.completed || {}).error) });
  });
  const notes = fs.existsSync(path.join(__dirname, 'findings-notes.js')) ? require('./findings-notes.js') : '';
  writeIndex(outRoot, events, audit);
  writeFindings(outRoot, events, audit, notes);
  return events;
}

const bracketLine = (ev) => {
  if (ev.failed || ev.missing) return 'n/a';
  const list = (ev.brackets || []);
  if (!list.length) return '';
  const main = list.filter((b) => !/^Group /.test(b.label));
  const pods = list.filter((b) => /^Group /.test(b.label));
  const parts = main.map((b) => b.label + ': ' + b.slots + ' slots, ' + b.entries + ' entries, ' + b.byes + ' byes, ' + b.plannedMatches + ' matches');
  if (pods.length) parts.push(pods.length + ' group brackets (' + [...new Set(pods.map((b) => b.slots))].sort((a, b) => a - b).join('/') + ' slots; ' + pods.reduce((n, b) => n + b.byes, 0) + ' byes, ' + pods.reduce((n, b) => n + b.plannedMatches, 0) + ' matches)');
  return parts.join('; ');
};
const auditCell = (r) => {
  if (!r) return '<span class="dim">not run</span>';
  const bad = [];
  if (r.overlapPairs) bad.push('<b class="hi">' + r.overlapPairs + ' overlaps</b>');
  if (r.touchPairs) bad.push('<b class="med">' + r.touchPairs + ' touching (min ' + r.minGapPx + ' px)</b>');
  if (r.clippedTexts) bad.push('<b class="hi">' + r.clippedTexts + ' clipped</b>');
  if (r.overflow.length) bad.push('<b class="hi">' + r.overflow.length + ' sheet(s) overflow</b>');
  if (r.frameClip.length) bad.push('<b class="hi">' + r.frameClip.length + ' clipped by frame</b>');
  if (r.lineupOverflow) bad.push('<b class="hi">' + r.lineupOverflow + ' lineup overflow</b>');
  if (r.kb && (r.kb.overlaps || r.kb.touching || r.kb.outside || r.kb.clipped || r.kb.belowFloor || r.kb.textUnderFloor)) bad.push('<b class="hi">bracket: ' + r.kb.overlaps + ' overlaps, ' + r.kb.touching + ' under floor, ' + r.kb.outside + ' off sheet, ' + r.kb.clipped + ' clipped</b>');
  if (r.runningOrder && r.runningOrder.bad) bad.push('<b class="hi">running order overflows</b>');
  const kbTxt = r.kb ? '<br>bracket: names ' + r.kb.minNamePt + '&ndash;' + r.kb.maxNamePt + ' pt, gap &ge; ' + r.kb.minGapMm + ' mm' + (r.kb.shrunk ? ', ' + r.kb.shrunk + ' shrunk on purpose' : '') : '';
  return bad.length ? bad.join('<br>') : '<span class="ok">clean</span>' + (r.minGapPx !== null ? ' <span class="dim">(Group Boards min gap ' + r.minGapPx + ' px)</span>' : '') + kbTxt;
};

function writeIndex(outRoot, events, audit) {
  const rows = events.map((ev) => {
    if (ev.missing || ev.failed) return '<tr><td>' + esc(ev.key) + '</td><td colspan="9" class="hi">' + (ev.missing ? 'not generated' : 'FAILED: ' + esc((ev.errors || [''])[0].split('\n')[0])) + '</td></tr>';
    const res = ev.champion ? 'Champion: ' + esc(ev.champion) : 'Group winners: ' + (ev.groupWinners ? ev.groupWinners.length : 0);
    const shape = ev.preAudit || ev.doneAudit ? esc(shapeText(ev.doneAudit && ev.doneAudit.shapes.length ? ev.doneAudit : ev.preAudit)) : '<span class="dim">n/a</span>';
    const paper = ev.doneAudit || ev.preAudit ? esc(((ev.doneAudit && ev.doneAudit.bracketPaper.length ? ev.doneAudit : ev.preAudit) || { bracketPaper: [] }).bracketPaper.join(', ')) : '';
    return '<tr><td><b>' + esc(ev.unit) + '</b><br>' + esc(ev.formatLabel) + '</td>' +
      '<td><a href="' + ev.key + '/pre-game.html">pre-game</a><br><a href="' + ev.key + '/completed.html">completed</a>' + (ev.paperSizes ? '<br><a href="' + ev.key + '/paper-sizes.html">' + (ev.formatType === 'rrknockout' ? 'projected, 200 entries' : 'paper choices') + '</a>' : '') + '</td>' +
      '<td>' + ev.pre.sheetsTotal + ' / ' + ev.completed.sheetsTotal + '<div class="small">' + esc(Object.keys(ev.completed.byType).map((k) => k + ' ' + ev.completed.byType[k]).join(', ')) + '</div></td>' +
      '<td class="small">' + esc(bracketLine(ev) || (ev.pre.projected ? 'Projected before play: ' + ev.pre.projected.qualifiers + ' qualifiers, ' + ev.pre.projected.slots + ' slots, ' + ev.pre.projected.byes + ' byes, ' + ev.pre.projected.matches + ' matches' : (ev.groupCount ? ev.groupCount + ' round robin groups, ' + ev.groupMatches + ' matches' : ''))) +
        (ev.formatType === 'rrknockout' ? '<br>Round robin: ' + ev.groupCount + ' groups (sizes ' + ev.groupSizes.join('/') + '), ' + ev.groupMatches + ' matches' : '') + '</td>' +
      '<td class="small">' + res + '<br>complete: ' + (ev.eventComplete ? '<span class="ok">yes</span>' : '<b class="hi">NO</b>') + '<br>' + ev.resultsEntered + ' results typed</td>' +
      '<td class="small">' + shape + '<br><span class="dim">' + paper + '</span></td>' +
      '<td class="small"><b>Pre-game</b><br>' + auditCell(ev.preAudit) + '</td><td class="small"><b>Completed</b><br>' + auditCell(ev.doneAudit) + '</td>' +
      '<td class="small">' + (ev.elapsedMs / 1000).toFixed(2) + ' s' + (ev.exceeded60s ? ' <b class="hi">over 60 s</b>' : '') + '</td></tr>';
  }).join('\n');
  const done = events.filter((e) => !e.missing && !e.failed);
  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DartDraw simulation: 12 events</title><style>' +
    'body{font:14px/1.5 Segoe UI,Arial,sans-serif;margin:0;background:#f4f6f9;color:#142133}main{max-width:1500px;margin:0 auto;padding:20px}h1{margin:0 0 4px;color:#10233e}' +
    'table{border-collapse:collapse;background:#fff;width:100%;font-size:13px}th,td{border:1px solid #cfd6de;padding:6px 8px;vertical-align:top;text-align:left}th{background:#10233e;color:#fff;position:sticky;top:0}' +
    '.small{font-size:12px;color:#34465a}.dim{color:#8a97a5}.ok{color:#1d8a4a;font-weight:700}.hi{color:#c0392b}.med{color:#b7791f}.box{background:#fff;border:1px solid #cfd6de;padding:10px 14px;margin:12px 0}a{color:#1f6feb}code{background:#eef1f3;padding:1px 4px}' +
    '</style></head><body><main><h1>DartDraw simulation: 12 events, 67 entries each</h1>' +
    '<p>Singles, Doubles and Teams, each as Knockout (single bracket), Round robin &rarr; Knockout, Knockout with Group Boards, and Round robin only. Every event was set up, drawn, printed, played to the end and printed again by the app\'s own functions (<code>node scripts/sim/run-simulation.js</code> regenerates everything). Results are random but deterministic. ' +
    '<a href="FINDINGS.md">FINDINGS.md</a> lists what the layout audit found.</p>' +
    '<div class="box"><b>' + done.length + ' of 12 events ran; ' + done.filter((e) => e.eventComplete && !e.errors.length).length + ' reached eventComplete = true with no errors.</b> ' +
    (audit && audit.browser ? 'Layout audit measured in headless ' + esc(audit.browser) + '.' : '<span class="hi">Layout audit not run' + (audit && audit.skipped ? ': ' + esc(audit.skipped) : '') + '.</span> Open a page to run it live.') +
    '<div class="small">Audit: every sheet is laid out at 100% in a real browser. Two-sided bracket sheets: every printed item against every other (overlap), boxes in a column against the gap floors (1.6 mm inside a match, 3.0 mm between matches, times the scale on a sheet shrunk on purpose), items off the sheet, clipped text, the 7 pt floor on legible sheets, one box height. Group Boards charts: name boxes closer than 4 px count as touching. A sheet whose content runs past its paper box overflows. "Sheets" is pre-game / completed pack (all lineup sheets counted, but only samples are drawn in the pages).</div></div>' +
    '<table><thead><tr><th>Event</th><th>Pages</th><th>Sheets pre / completed</th><th>Bracket facts</th><th>Result</th><th>Bracket shape / paper</th><th colspan="2">Layout audit</th><th>Run time</th></tr></thead><tbody>' + rows + '</tbody></table></main></body></html>';
  fs.writeFileSync(path.join(outRoot, 'index.html'), html);
}

function writeFindings(outRoot, events, audit, notes) {
  const L = [];
  L.push('# Simulation findings');
  L.push('');
  L.push('Generated by `node scripts/sim/run-simulation.js` from the real app functions (67 entries per event, deterministic random results). The layout audit measures every printed sheet in ' + ((audit && audit.browser) || 'no browser (not run)') + '. Severity: HIGH = unusable or wrong print, MEDIUM = cramped or hard to read, LOW = note.');
  L.push('');
  if (notes) { L.push(notes.trim()); L.push(''); }
  const done = events.filter((e) => !e.missing && !e.failed);
  L.push('## Run summary');
  L.push('');
  L.push('| Event | Complete | Champion / winners | Sheets pre / done | Run time |');
  L.push('|---|---|---|---|---|');
  events.forEach((ev) => {
    if (ev.missing || ev.failed) { L.push('| ' + ev.key + ' | FAILED | ' + String((ev.errors || [''])[0]).split('\n')[0] + ' | | |'); return; }
    L.push('| ' + ev.key + ' | ' + (ev.eventComplete ? 'yes' : 'NO') + ' | ' + (ev.champion || (ev.groupWinners ? ev.groupWinners.length + ' group winners' : '')) + ' | ' + ev.pre.sheetsTotal + ' / ' + ev.completed.sheetsTotal + ' | ' + (ev.elapsedMs / 1000).toFixed(2) + ' s' + (ev.exceeded60s ? ' (OVER 60 s)' : '') + ' |');
  });
  L.push('');
  L.push('No event exceeded 60 s: ' + (done.every((e) => !e.exceeded60s) ? 'true (slowest ' + (Math.max.apply(null, done.map((e) => e.elapsedMs)) / 1000).toFixed(2) + ' s)' : 'FALSE, see the table'));
  L.push('');
  L.push('## Per event');
  events.forEach((ev) => {
    L.push('');
    L.push('### ' + ev.key + (ev.formatLabel ? ' (' + ev.unit + ', ' + ev.formatLabel + ')' : ''));
    if (ev.missing || ev.failed) { L.push('- **FAILED**: ' + String((ev.errors || ['not generated'])[0]).split('\n')[0]); return; }
    L.push('- Pack: ' + ev.pre.sheetsTotal + ' sheets pre-game (' + Object.keys(ev.pre.byType).map((k) => k + ' ' + ev.pre.byType[k]).join(', ') + '), ' + ev.completed.sheetsTotal + ' completed (' + Object.keys(ev.completed.byType).map((k) => k + ' ' + ev.completed.byType[k]).join(', ') + ').');
    const bl = bracketLine(ev);
    if (bl) L.push('- Brackets: ' + bl + '.');
    if (ev.pre.projected) L.push('- Before the round robin the pack prints a projected bracket: ' + ev.pre.projected.qualifiers + ' qualifiers in ' + ev.pre.projected.slots + ' slots, ' + ev.pre.projected.byes + ' byes, ' + ev.pre.projected.matches + ' matches.');
    if (ev.groupCount && ev.formatType !== 'podknockout') L.push('- Round robin: ' + ev.groupCount + ' groups (sizes ' + ev.groupSizes.join(' / ') + '), ' + ev.groupMatches + ' matches' + (ev.tiesSettledByOrganiser ? ', ' + ev.tiesSettledByOrganiser + ' unresolved tie(s) settled with Adjust positions' : '') + '.');
    if (ev.formatType === 'podknockout') L.push('- Group Boards: ' + ev.groupCount + ' groups (sizes ' + ev.groupSizes.join(' / ') + '), ' + ev.boards + ' boards, one per group; Finals ' + (ev.brackets.find((b) => b.label === 'Finals') || {}).slots + ' slots.');
    L.push('- Result: ' + (ev.champion ? 'champion ' + ev.champion : ev.groupWinners ? 'group winners ' + ev.groupWinners.length : 'none') + '; eventComplete = ' + ev.eventComplete + '; ' + ev.resultsEntered + ' results typed through the real result boxes; errors: ' + (ev.errors.length ? ev.errors.join('; ') : 'none') + '.');
    (ev.notes || []).forEach((n) => L.push('- Note: ' + n));
    const a = ev.doneAudit || ev.preAudit;
    if (a) {
      L.push('- Bracket shape: ' + shapeText(a) + (a.wings ? '; split into ' + a.wings + ' wing sheets' + (a.finalsSheets ? ' + ' + a.finalsSheets + ' Finals sheet' : '') : '') + '. Paper: ' + (a.bracketPaper.join(', ') || 'n/a') + (a.scale ? '; bracket scale ' + a.scale[0] + (a.scale[1] !== a.scale[0] ? ' to ' + a.scale[1] : '') : '') + '.');
      if (a.kinds && (a.kinds.named || a.kinds.bye)) L.push('- Name boxes on the bracket sheets (completed pack): ' + a.kinds.named + ' with a name, ' + a.kinds.bye + ' BYE, ' + a.kinds.placeholder + ' placeholders, ' + a.kinds.empty + ' empty' + (a.mostlyBlank ? '; ' + a.mostlyBlank + ' of ' + a.bracketSheets + ' bracket sheets have no names on them at all' : '') + '.');
    }
    if (a && a.kb) L.push('- Two-sided bracket sheets (completed pack): ' + a.kb.sheets + ' sheet(s) on ' + a.kb.papers.join('/') + ', scale ' + Math.min.apply(null, a.kb.scales).toFixed(2) + (a.kb.scales.length > 1 ? ' to ' + Math.max.apply(null, a.kb.scales).toFixed(2) : '') + '; names ' + a.kb.minNamePt + ' to ' + a.kb.maxNamePt + ' pt; smallest gap ' + a.kb.minGapMm + ' mm (in a match ' + a.kb.minGapInMatchMm + ', between matches ' + a.kb.minGapBetweenMm + '); smallest other text ' + a.kb.minTextPt + ' pt (' + a.kb.textUnderFloor + ' under 4.6 pt); ' + a.kb.overlaps + ' overlaps, ' + a.kb.touching + ' under the floors, ' + a.kb.outside + ' off the sheet, ' + a.kb.clipped + ' clipped.');
    const pa = ev.preAudit;
    if (pa && pa.kb && pa !== a) L.push('- Two-sided bracket sheets (pre-game pack): ' + pa.kb.sheets + ' sheet(s) on ' + pa.kb.papers.join('/') + ', names ' + pa.kb.minNamePt + ' to ' + pa.kb.maxNamePt + ' pt, smallest gap ' + pa.kb.minGapMm + ' mm, ' + pa.kb.overlaps + ' overlaps, ' + pa.kb.touching + ' under the floors, ' + pa.kb.outside + ' off the sheet, ' + pa.kb.clipped + ' clipped.');
    if (pa && pa.runningOrder) L.push('- Running order (pre-game): ' + pa.runningOrder.sheets + ' sheet(s), ' + pa.runningOrder.columns + ' board columns, ' + pa.runningOrder.matches + ' matches listed, ' + (pa.runningOrder.bad ? pa.runningOrder.bad + ' sheet(s) overflow' : 'nothing off the sheet or clipped') + '.');
    (ev.paperDialogs || []).forEach((d) => L.push('- Paper dialog (' + d.stage + ' print): "' + d.title + '"; options: ' + d.options.join(' / ') + '; answered ' + d.answer + '.'));
    if (ev.lineupReady && ev.lineupReady.length) L.push('- Knockout lineup sheets printed with "Print all ready lineup sheets": ' + ev.lineupReady.map((x) => x.when + ' ' + x.printed).join('; ') + ' (remembered as printed at the end: ' + ev.lineupReady[ev.lineupReady.length - 1].rememberedPrinted + ').');
    if (ev.pre && ev.pre.emptyLineupCopies) L.push('- Empty lineup sheet: "Print empty lineup sheet" with 2 copies printed ' + ev.pre.emptyLineupCopies + ' blank sheets.');
    if (ev.paperAudit) L.push((ev.formatType === 'rrknockout' ? '- Projected brackets of a 200-entry event (Main and Plate pool, 100 entries each, on the recommended paper): ' : '- Same bracket, every paper answer (pre-game): ') + ev.paperAudit.map((p) => p.paper + ': ' + p.sheets + ' sheet(s)' + (p.kb ? ', scale ' + (+p.scale).toFixed(2) + ', names from ' + p.minNamePt + ' pt, smallest gap ' + p.minGapMm + ' mm, ' + p.overlapPairs + ' overlaps, ' + p.touchPairs + ' under the floors, ' + p.clipped + ' clipped, ' + p.overflow + ' off the sheet' : (p.scale ? ', scale ' + p.scale : '') + ', smallest box gap ' + p.minGapPx + ' px, ' + p.touchPairs + ' touching pairs, smallest name ' + p.minFontPt + ' pt, ' + p.clipped + ' clipped' + (p.overflow ? ', ' + p.overflow + ' overflow' : ''))).join('; ') + '.');
    const fs2 = findingsFor(ev);
    if (!ev.preAudit && !ev.doneAudit) L.push('- Layout audit: not run' + (ev.auditError ? ' (' + ev.auditError + ')' : '') + '.');
    else if (!fs2.length) L.push('- Layout audit: no overlap, touching, clipping or overflow found in either pack.');
    ['HIGH', 'MEDIUM', 'LOW'].forEach((sev) => fs2.filter((f) => f.sev === sev).forEach((f) => L.push('- **' + sev + '** (' + f.stage + '): ' + f.text)));
  });
  L.push('');
  L.push('## Lineup sheets (Teams)');
  L.push('');
  L.push('- The pack prints one lineup sheet per fixture: all round robin fixtures, then every knockout fixture whose two teams are known. The pages show samples only (captioned).');
  const appSrc = fs.readFileSync(path.join(ROOT, 'app.html'), 'utf8');
  const callers = (appSrc.match(/lineupSheetHTML\(/g) || []).length - 1;   // minus the definition
  L.push(/emptyLineupSheetHTML/.test(appSrc)
    ? '- The empty (emergency) lineup sheet exists: "Print empty lineup sheet" (1 to 10 copies) on the print steps and in Manage Tournament; each Teams pre-game page shows one. Knockout lineup sheets can be printed as they become ready ("Print lineup" / "Print all ready lineup sheets"), and the app remembers which were printed.'
    : callers === 2 && !/blank lineup|emptyLineup|emergency lineup/i.test(appSrc)
    ? '- There is no empty (blank) emergency lineup sheet yet: `lineupSheetHTML(entryA, entryB, meta)` needs two named teams and is called only for the round robin fixtures and the known knockout fixtures. A captain who needs a sheet for a fixture that is not printed, or a rematch, cannot get one.'
    : '- Re-check: app.html now has ' + callers + ' callers of lineupSheetHTML (this report was written when there were 2, both printing fixtures); an empty lineup sheet may exist now.');
  L.push('- Lineup sheets overflowing a card: ' + (events.some((e) => (e.preAudit && e.preAudit.lineupOverflow) || (e.doneAudit && e.doneAudit.lineupOverflow)) ? 'YES, see the events above' : 'none'));
  fs.writeFileSync(path.join(outRoot, 'FINDINGS.md'), L.join('\n') + '\n');
}

if (require.main === module) {
  const outRoot = process.argv[2] || path.join(ROOT, 'docs', 'design', 'simulation');
  build(outRoot);
  console.log('wrote index.html and FINDINGS.md');
}
module.exports = { build, reduce };

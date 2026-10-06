/* Shared rendering code — loaded by both the organiser app (index.html) and the
   public results viewer (live.html). Everything here is pure display logic that
   reads the global `state` (the tournament JSON) and builds HTML strings; it has
   no editing, saving or login behaviour. Keep it that way. */

function bracketEntryName(t, entryId){
  if(!entryId) return null;
  const e = t.entriesList.find(x=>x.id===entryId);
  return e ? e.name : 'Unknown';
}

function bracketIsComplete(bracket){
  const finalRound = bracket.rounds[bracket.rounds.length-1];
  return finalRound.length===1 && !!finalRound[0].winnerId;
}

function bracketChampion(bracket){
  if(!bracketIsComplete(bracket)) return null;
  return bracket.rounds[bracket.rounds.length-1][0].winnerId;
}

function bracketRunnerUp(bracket){
  const finalRound = bracket.rounds[bracket.rounds.length-1];
  if(!finalRound.length || !finalRound[0].winnerId) return null;
  const m = finalRound[0];
  return m.winnerId===m.aEntryId ? m.bEntryId : m.aEntryId;
}

function koRoundName(bracket, idx){
  const total = bracket.rounds.length;
  const fromEnd = total-idx;
  if(fromEnd===1) return 'Final';
  if(fromEnd===2) return 'Semifinal';
  if(fromEnd===3) return 'Quarterfinal';
  return 'Round of '+(bracket.rounds[idx].length*2);
}

/* bracket.seeds ranks every entry 1..N for slot-placement purposes (byes,
   clash avoidance) — that's not the same as being an officially seeded
   entry. Pure knockout events have an organiser-set cutoff
   (format.numSeeds, from the Seeding screen) for how many of those ranks
   actually count as "seeded" for display; round-robin+knockout brackets
   don't have that concept (every qualifier's rank comes from group
   finishing position), so every qualifier there still shows a label —
   but as its group+position identity (e.g. "A1"), never the bare 1..N
   rank, since groups aren't ranked against each other (a group's winner
   isn't "better seeded" than another group's winner just because
   generateBracket happened to number them differently internally). */
function bracketSeedForDisplay(t, seedsMap, seedLabelsMap, entryId){
  if(!seedsMap) return null;
  const rank = seedsMap[entryId];
  if(!rank) return null;
  if(t.format.formatType==='knockout') return (t.format.seedingEnabled && rank<=(t.format.numSeeds||8)) ? rank : null;
  return (seedLabelsMap && seedLabelsMap[entryId]) || rank;
}

/* ---- Mirrored knockout chart — pixel-precise implementation of
   design_handoff_knockout_brackets/README.md, reading real
   bracket.rounds[][] / koRoundName() / bracketEntryName() / escapeHtml()
   above unchanged, in a new .mko-* namespace so it doesn't collide with
   the existing single-direction .bracket-* chart used everywhere else
   (interactive Manage Tournament views keep using bracketColumnsHTML;
   only the PRINTED chart sheet below uses this). Validated as a
   standalone prototype before merging in; see mko_precise.js /
   mko_paper.js in that prototype for the original build notes.

   Colour/font tokens are the app's real chart tokens (var(--navy),
   var(--muted), var(--line), the #eaf7ee winner-green already used by
   .bracket-side.win) and the app's real body font, so this chart matches
   the round-robin chart and the existing linear knockout chart instead
   of introducing its own look. ---- */
// ROW[2] and ROW[4] are never a real bracket.size on their own via the
// seeds policy (minimum draw is 4) except a genuine 4-entry tournament —
// they're mostly used as mkoPaginate()'s synthetic "remainder" geometry
// once splitting has whittled a bracket down to just the Final(+
// Semifinal). Kept equal to ROW[32] (52) rather than a big, roomy value:
// that's high enough that fontSize still hits its 15px cap (so this
// remainder is never LESS legible than whatever the rest of the pages
// are showing), while keeping the champion block's fixed spacing
// overhead small enough that even the smallest paper size (A4) can
// always fit it — see MKO_CHROME_HEIGHT_MM / mkoPaginate's derivation.
const ROW = { 2: 52, 4: 52, 8: 110, 16: 72, 32: 52, 64: 34, 128: 26, 256: 24, 512: 22 };

// Bracket size policy, as specified for the "Number of seeds" organiser
// control: seeds is a dropdown limited to 4/8/16/32/64 only, and the
// bracket is always fixed at 2x whatever seed count is chosen — so 128
// slots is the largest knockout draw this app is ever meant to produce.
// nearestBracket() already enforces this on the GENERATION side (falls
// back to 128 for anything bigger); this is the same rule enforced
// explicitly on the CHART side too.
const MAX_SEEDS = 64;

const MAX_BRACKET_SIZE = MAX_SEEDS * 2; // 128

// Per-round match-box / connector-zone widths. Trimmed slightly from the
// design-handoff spec's original 140/44 (184 total) so a standard 32-
// entry bracket clears the 9px floor on A4 in one sheet again — the
// original values left it just 1.4% short (a pure width constraint, not
// a font/legibility issue), which meant needlessly splitting into
// several sheets for a size that printed fine on one page before this
// chart existed. Every dimension below is derived from these two
// numbers so trimming stays consistent everywhere it's used.
const MKO_BOX_W = 126;

const MKO_CONN_W = 36;

const MKO_COL_W = MKO_BOX_W + MKO_CONN_W; // 174

const MKO_CENTRE_W = 2*MKO_BOX_W + MKO_CONN_W; // 308

function mkoValidateBracketSize(size){
  if(size > MAX_BRACKET_SIZE){
    return { ok:false, message:'Bracket size '+size+' exceeds the '+MAX_BRACKET_SIZE+'-slot maximum for this chart (organiser can select at most '+MAX_SEEDS+' seeds, and the bracket is fixed at 2× that count).' };
  }
  return { ok:true };
}

function mkoGeom(n, showChampion){
  if(showChampion==null) showChampion = true;
  const cc = Math.log2(n) - 1;
  const boxHeight = Math.round(ROW[n] * 0.78);
  const fontSize = Math.min(15, Math.max(8, Math.round(ROW[n] * 0.30)));
  const finalBoxH = Math.max(44, boxHeight * 1.5);
  // The champion block's own space only needs to be budgeted when it's
  // actually going to be drawn — a blank pre-tournament chart passes
  // showChampion:false and shouldn't pay for vertical room it never uses.
  const belowMid = showChampion ? (finalBoxH/2 + 56 + 15 + 12 + finalBoxH + 10) : (finalBoxH/2 + 56);
  const bodyHeight = Math.max((n/2) * ROW[n], belowMid * 2);
  const artW = 2 * (cc * MKO_COL_W) + MKO_CENTRE_W;
  const artH = bodyHeight + 44;
  return { cc, boxHeight, fontSize, finalBoxH, bodyHeight, artW, artH };
}

/* Auto-shrink instead of ellipsis truncation: find the longest name/seed/
   legs actually in this bracket's data, measure for real (canvas, not a
   character-count guess) at the base font size using the heaviest
   weight in play (winner = 800), and — only if that wouldn't fit a slot
   at the base size — scale the whole bracket's font down uniformly. */
var __mkoMeasureCtx = document.createElement('canvas').getContext('2d');

function mkoFitFontSize(bracket, t, baseFontSize, slotWidth){
  var names = {}, legsSet = {}, maxSeed = 0;
  bracket.rounds.forEach(function(round){
    round.forEach(function(m){
      ['a','b'].forEach(function(side){
        var id = m[side+'EntryId'];
        if(id) names[bracketEntryName(t, id) || ''] = true;
        var legs = m[side+'Legs'];
        if(legs != null) legsSet[String(legs)] = true;
      });
    });
  });
  if(bracket.seeds) Object.keys(bracket.seeds).forEach(function(k){ if(bracket.seeds[k] > maxSeed) maxSeed = bracket.seeds[k]; });
  var nameList = Object.keys(names); if(!nameList.length) nameList = ['Player 88'];
  var legsList = Object.keys(legsSet); if(!legsList.length) legsList = ['0'];
  var seedStr = maxSeed ? String(maxSeed) : '';

  var ctx = __mkoMeasureCtx;
  var availW = slotWidth - 12 - 10;
  ctx.font = '700 ' + (baseFontSize*0.78) + 'px Inter,Segoe UI,Arial,sans-serif';
  var seedW = seedStr ? ctx.measureText(seedStr).width : 0;
  ctx.font = '800 ' + baseFontSize + 'px Inter,Segoe UI,Arial,sans-serif';
  var nameW = Math.max.apply(null, nameList.map(function(nm){ return ctx.measureText(nm).width; }));
  var legsW = Math.max.apply(null, legsList.map(function(lg){ return ctx.measureText(lg).width; }));
  var totalW = seedW + nameW + legsW;
  if(totalW <= availW) return baseFontSize;
  return Math.max(6, Math.floor(baseFontSize * (availW/totalW)));
}

function mkoSlot(m, side, t, ri, tokens){
  const id = m[side+'EntryId'];
  const legs = m[side+'Legs'];
  const isWin = !!(m.winnerId && m.winnerId===id);
  if(!id){
    const fromPod = m[side+'FromPod'];
    if(fromPod){
      const pod = (t.pods||[]).find(p=>p.id===fromPod);
      return { text:'Winner of Group '+escapeHtml(pod ? pod.label : '?'), seed:'', legs:'', fw:400, color:tokens.muted, bg:(tokens.boxBg||'#fff'), border:'1px solid '+tokens.line, wo:false };
    }
    if(m.bye) return { text:'BYE', seed:'', legs:'', fw:600, color:tokens.muted, bg:(tokens.boxBg||'#fff'), border:'1px solid '+tokens.line, wo:false };
    return { text:'', seed:'', legs:'', fw:400, color:tokens.ink, bg:(tokens.boxBg||'#fff'), border:'1px solid '+tokens.line, wo:false };
  }
  const name = escapeHtml(bracketEntryName(t, id) || 'Unknown');
  const seed = (ri===0 && m.__seeds) ? (bracketSeedForDisplay(t, m.__seeds, m.__seedLabels, id) || '') : '';
  return {
    text: name, seed: String(seed), legs: legs!=null ? String(legs) : '',
    fw: isWin ? 800 : 400, color: tokens.ink, bg: isWin ? tokens.winBg : (tokens.boxBg||'#fff'),
    border: '1px solid '+tokens.line,
    wo: !!(m.wo && m.winnerId && !isWin) // this side is the one who no-showed
  };
}

/* Match ID in round-slot style (round number, then position in the round —
   "2-1" is the first match of round 2), the same way DartConnect labels
   bracket matches. The Plate pool gets a "P" prefix so its IDs can't be
   confused with the main bracket's when both are on screen. */
function koMatchTag(bracket, t, ri, mi){
  if(bracket.podLabel) return 'G'+bracket.podLabel+'·'+(ri+1)+'-'+(mi+1);
  return (bracket===t.knockoutLosers ? 'P' : '') + (ri+1) + '-' + (mi+1);
}

/* Small pill straddling the top-left corner of a match's top box. It sits
   outside the box (which clips its own overflow) so it can hang over the
   border, and counter-flips on the mirrored side so the text reads
   normally. Always lands at the visual left on both sides of the bracket. */
function mkoTagHTML(tag, fontSize, mirrored){
  const fs = Math.max(6, fontSize*0.6);
  return '<span class="mko-tag" style="position:absolute;top:-'+Math.round(fs*0.6)+'px;'+(mirrored?'right':'left')+':5px;z-index:1;pointer-events:none;'+
    'font-size:'+fs.toFixed(1)+'px;font-weight:700;line-height:1.25;color:var(--muted);background:var(--paper);border:1px solid var(--line);border-radius:3px;padding:0 3px;'+
    (mirrored?'transform:scaleX(-1);':'')+'">'+escapeHtml(tag)+'</span>';
}

function mkoBoxHTML(slot, boxHeight, fontSize, mirrored){
  const rowDir = mirrored ? 'row-reverse' : 'row';
  const textAlign = mirrored ? 'text-align:right;' : '';
  const flip = mirrored ? 'transform:scaleX(-1);' : '';
  return '<div style="width:100%;height:'+boxHeight+'px;background:'+slot.bg+';border:'+slot.border+';border-radius:6px;'+
    'display:flex;flex-direction:'+rowDir+';align-items:center;gap:5px;padding:0 6px;box-sizing:border-box;overflow:hidden;'+flip+'">'+
    '<span style="flex:0 0 auto;font-size:'+(fontSize*0.78).toFixed(1)+'px;font-weight:700;color:var(--muted);">'+slot.seed+'</span>'+
    '<span style="flex:1;min-width:0;'+textAlign+'font-size:'+fontSize+'px;color:'+slot.color+';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:'+slot.fw+';">'+slot.text+'</span>'+
    (slot.wo ? '<span style="flex:0 0 auto;font-size:'+(fontSize*0.68).toFixed(1)+'px;font-weight:700;color:var(--muted);">WO</span>' : '')+
    '<span style="flex:0 0 auto;font-size:'+fontSize+'px;color:'+slot.color+';font-weight:'+slot.fw+';">'+slot.legs+'</span>'+
    '</div>';
}

/* winSide ('a'|'b'|null) is which entry of this match has won so far —
   the connector's two arms (top = a's path, bottom = b's path, same top/
   bottom mapping mkoSlot uses regardless of mirroring) are colored
   independently so a decided match's winning arm (and the stub feeding
   the next round) turns green, while the other arm stays the default
   line color. Splitting what used to be one bordered box into two
   (each covering half the original's height, meeting at the same
   vertical center) reproduces the exact same shape when both arms
   share a color, but lets them diverge when they don't. */
function mkoConnectorHTML(vsText, mirrored, lineColor, winColor, winSide){
  const vsTransform = mirrored ? 'translateY(-50%) scaleX(-1)' : 'translateY(-50%)';
  const topColor = winSide==='a' ? winColor : lineColor;
  const botColor = winSide==='b' ? winColor : lineColor;
  const stubColor = winSide ? winColor : lineColor;
  return '<div style="flex:1;position:relative;">'+
    '<div style="position:absolute;left:15px;right:11px;top:25%;height:25%;border:1.5px solid '+topColor+';border-left:none;border-bottom:none;border-radius:0 4px 0 0;box-sizing:border-box;"></div>'+
    '<div style="position:absolute;left:15px;right:11px;top:50%;height:25%;border:1.5px solid '+botColor+';border-left:none;border-top:none;border-radius:0 0 4px 0;box-sizing:border-box;"></div>'+
    '<div style="position:absolute;right:0;width:11px;top:50%;border-top:1.5px solid '+stubColor+';"></div>'+
    '<div style="position:absolute;left:0;width:15px;text-align:center;top:50%;transform:'+vsTransform+';font-size:9px;font-weight:700;letter-spacing:0.06em;color:var(--muted);">'+vsText+'</div>'+
    '</div>';
}

function mkoSideHTML(bracket, t, mirror, geom, tokens, showVs, slice, interactive, bracketKey){
  slice = slice || {};
  const roundStart = slice.roundStart || 0;
  const roundEnd = slice.roundEnd != null ? slice.roundEnd : geom.cc;
  const boxHeight = geom.boxHeight, fontSize = geom.fontSize;
  const outerTransform = mirror===-1 ? 'transform:scaleX(-1);' : '';
  let cols = '';
  for(let ri=roundStart; ri<roundEnd; ri++){
    const round = bracket.rounds[ri];
    const half = round.length/2;
    // Real index of this side's first match within bracket.rounds[ri] —
    // needed so a click can call koMatchScoreModal(bracketKey, ri, mi)
    // with the actual match position, not the position within whatever
    // local slice (side half, then wing) this round got sliced down to.
    let matchOffset = mirror===1 ? 0 : half;
    const sideMatches = mirror===1 ? round.slice(0, half) : round.slice(half);
    // `half` is already THIS round's own match count (it halves every
    // round on its own via bracket.rounds), so dividing it by wingCount
    // directly gives the right per-wing count at any round — this also
    // works unmodified for roundStart>0 (a second splitting level).
    let matches = sideMatches;
    if(slice.wingCount != null){
      const perWingHere = Math.max(1, half / slice.wingCount);
      const start = Math.round(slice.wingIndex * perWingHere);
      const end = Math.round((slice.wingIndex+1) * perWingHere);
      matches = sideMatches.slice(start, end);
      matchOffset += start;
    }
    const label = koRoundName(bracket, ri);
    const labelFlip = mirror===-1 ? 'transform:scaleX(-1);' : '';

    let groupsHtml = '', connectorsHtml = '';
    matches.forEach(function(m, localIdx){
      const mi = matchOffset + localIdx;
      const aSlot = mkoSlot(m, 'a', t, ri, tokens);
      const bSlot = mkoSlot(m, 'b', t, ri, tokens);
      const clickable = interactive && m.aEntryId && m.bEntryId && !m.bye;
      const clickAttr = clickable ? ' class="mko-clickable" onclick="koMatchScoreModal(\''+bracketKey+'\','+ri+','+mi+')"' : '';
      const woLink = clickable ? '<div style="flex:0 0 auto;text-align:center;font-size:'+Math.max(7,fontSize*0.6).toFixed(1)+'px;color:var(--blue);text-decoration:underline;cursor:pointer;padding:1px 0 0;'+(mirror===-1?'transform:scaleX(-1);':'')+'" onclick="event.stopPropagation();openKoNoShowPicker(\''+bracketKey+'\','+ri+','+mi+')">Mark no-show…</div>' : '';
      groupsHtml += '<div style="flex:1;display:flex;flex-direction:column;"'+clickAttr+'>'+
        '<div style="flex:1;display:flex;align-items:center;"><div style="position:relative;width:100%;">'+mkoBoxHTML(aSlot, boxHeight, fontSize, mirror===-1)+(m.bye ? '' : mkoTagHTML(koMatchTag(bracket, t, ri, mi), fontSize, mirror===-1))+'</div></div>'+
        '<div style="flex:1;display:flex;align-items:center;">'+mkoBoxHTML(bSlot, boxHeight, fontSize, mirror===-1)+'</div>'+
        woLink+
        '</div>';
      const winSide = m.winnerId ? (m.winnerId===m.aEntryId ? 'a' : 'b') : null;
      connectorsHtml += mkoConnectorHTML(showVs ? 'VS' : '', mirror===-1, tokens.line, tokens.winLine, winSide);
    });

    cols += '<div style="display:flex;align-items:stretch;width:'+MKO_COL_W+'px;">'+
      '<div style="width:'+MKO_BOX_W+'px;display:flex;flex-direction:column;">'+
      '<div style="height:44px;display:flex;align-items:flex-end;justify-content:center;padding-bottom:9px;box-sizing:border-box;font-size:11px;font-weight:800;letter-spacing:0.06em;color:var(--muted);white-space:nowrap;text-transform:uppercase;'+labelFlip+'">'+escapeHtml(label)+'</div>'+
      '<div style="flex:1;display:flex;flex-direction:column;">'+groupsHtml+'</div>'+
      '</div>'+
      '<div style="width:'+MKO_CONN_W+'px;display:flex;flex-direction:column;">'+
      '<div style="height:44px;"></div>'+
      '<div style="flex:1;display:flex;flex-direction:column;">'+connectorsHtml+'</div>'+
      '</div>'+
      '</div>';
  }
  return '<div style="display:flex;align-items:stretch;'+outerTransform+'">'+cols+'</div>';
}

function mkoCentreHTML(bracket, t, geom, tokens, showVs, showChampion, interactive, bracketKey){
  const finalRi = bracket.rounds.length-1;
  const finalMatch = bracket.rounds[finalRi][0];
  const aSlot = mkoSlot(finalMatch, 'a', t, finalRi, tokens);
  const bSlot = mkoSlot(finalMatch, 'b', t, finalRi, tokens);
  const finalBoxH = geom.finalBoxH;
  const championId = bracketIsComplete(bracket) ? bracketChampion(bracket) : null;
  const championName = championId ? escapeHtml(bracketEntryName(t, championId)) : '';
  const clickable = interactive && finalMatch.aEntryId && finalMatch.bEntryId && !finalMatch.bye;
  const clickAttr = clickable ? ' class="mko-clickable" onclick="koMatchScoreModal(\''+bracketKey+'\','+finalRi+',0)"' : '';

  let championHtml = '';
  if(showChampion){
    championHtml = '<div style="position:absolute;left:0;right:0;top:calc(100% + 56px);display:flex;flex-direction:column;align-items:center;">'+
      '<div style="font-size:15px;font-weight:800;letter-spacing:0.1em;color:var(--green);">CHAMPION</div>'+
      '<div style="width:150px;height:'+finalBoxH+'px;margin-top:12px;background:var(--win-bg,#eaf7ee);border:3px solid var(--green);box-sizing:border-box;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:'+geom.fontSize+'px;font-weight:800;color:var(--ink);">'+championName+'</div>'+
      '</div>';
  }

  return '<div style="width:'+MKO_CENTRE_W+'px;display:flex;flex-direction:column;">'+
    '<div style="height:44px;"></div>'+
    '<div style="flex:1;position:relative;">'+
    '<div style="position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);display:flex;justify-content:center;">'+
    '<div style="position:relative;display:flex;flex-direction:column;align-items:center;">'+
    '<div style="position:absolute;left:0;right:0;bottom:calc(100% + 14px);text-align:center;font-size:22px;font-weight:800;letter-spacing:0.03em;color:var(--final-ink,var(--navy));">FINAL</div>'+
    '<div style="display:flex;align-items:center;"'+clickAttr+'>'+
    '<div style="position:relative;width:'+MKO_BOX_W+'px;height:'+finalBoxH+'px;">'+mkoTagHTML(koMatchTag(bracket, t, finalRi, 0), geom.fontSize, false)+
    '<div style="width:100%;height:100%;background:'+aSlot.bg+';border:'+aSlot.border+';border-radius:6px;box-sizing:border-box;display:flex;align-items:center;gap:5px;padding:0 8px;overflow:hidden;">'+
    '<span style="flex:1;min-width:0;font-size:'+geom.fontSize+'px;font-weight:'+aSlot.fw+';color:'+aSlot.color+';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+aSlot.text+'</span>'+
    (aSlot.wo ? '<span style="flex:0 0 auto;font-size:'+(geom.fontSize*0.68).toFixed(1)+'px;font-weight:700;color:var(--muted);">WO</span>' : '')+
    '<span style="flex:0 0 auto;font-size:'+geom.fontSize+'px;font-weight:'+aSlot.fw+';color:'+aSlot.color+';">'+aSlot.legs+'</span></div></div>'+
    '<div style="width:'+MKO_CONN_W+'px;text-align:center;font-size:10px;font-weight:700;letter-spacing:0.06em;color:var(--muted);">'+(showVs ? 'VS' : '')+'</div>'+
    '<div style="width:'+MKO_BOX_W+'px;height:'+finalBoxH+'px;background:'+bSlot.bg+';border:'+bSlot.border+';border-radius:6px;box-sizing:border-box;display:flex;align-items:center;gap:5px;padding:0 8px;overflow:hidden;">'+
    '<span style="flex:1;min-width:0;font-size:'+geom.fontSize+'px;font-weight:'+bSlot.fw+';color:'+bSlot.color+';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+bSlot.text+'</span>'+
    (bSlot.wo ? '<span style="flex:0 0 auto;font-size:'+(geom.fontSize*0.68).toFixed(1)+'px;font-weight:700;color:var(--muted);">WO</span>' : '')+
    '<span style="flex:0 0 auto;font-size:'+geom.fontSize+'px;font-weight:'+bSlot.fw+';color:'+bSlot.color+';">'+bSlot.legs+'</span></div>'+
    '</div>'+
    (clickable ? '<div style="font-size:11px;color:var(--blue);text-decoration:underline;cursor:pointer;margin-top:4px;" onclick="event.stopPropagation();openKoNoShowPicker(\''+bracketKey+'\','+finalRi+',0)">Mark no-show…</div>' : '')+
    championHtml+
    '</div></div></div></div>';
}

function mirroredChartHTML(bracket, t, opts){
  opts = opts || {};
  const n = bracket.size;
  const sizeCheck = mkoValidateBracketSize(n);
  if(!sizeCheck.ok){
    return '<div class="mko-artboard mko-size-error" style="padding:20px 24px;max-width:520px;font-family:Inter,Segoe UI,Arial,sans-serif;font-size:13px;line-height:1.5;color:var(--red);background:#fdeceb;border:1px solid #f3c6c2;border-radius:8px;">'+escapeHtml(sizeCheck.message)+'</div>';
  }
  /* A page can restyle the chart (the public viewer's dark theme) by defining
     --box-bg, --win-bg, --final-ink and --chart-line; without them these are the original colours. */
  const tokens = { line:'var(--chart-line,var(--line))', muted:'var(--muted)', ink:'var(--ink)', navy:'var(--final-ink,var(--navy))', winBg:'var(--win-bg,#eaf7ee)', boxBg:'var(--box-bg,#fff)', winLine:'var(--green)' };
  const showVs = opts.showVs !== false;
  const showChampion = opts.showChampion !== false;
  // interactive: used by Manage Tournament (on-screen, click-to-score) —
  // opts.bracketKey identifies which of state.knockout/state.knockoutLosers
  // this is, same convention bracketColumnsHTML already uses. Never set
  // from the print path (knockoutBracketSheetHTML), which stays static.
  const interactive = !!opts.interactive;
  const bracketKey = opts.bracketKey || (bracket===t.knockoutLosers ? 'knockoutLosers' : 'knockout');
  const geom = mkoGeom(n, showChampion);
  geom.fontSize = mkoFitFontSize(bracket, t, geom.fontSize, MKO_BOX_W);

  bracket.rounds[0].forEach(function(m){ m.__seeds = bracket.seeds; m.__seedLabels = bracket.seedLabels; });

  const left = mkoSideHTML(bracket, t, 1, geom, tokens, showVs, null, interactive, bracketKey);
  const centre = mkoCentreHTML(bracket, t, geom, tokens, showVs, showChampion, interactive, bracketKey);
  const right = mkoSideHTML(bracket, t, -1, geom, tokens, showVs, null, interactive, bracketKey);

  return '<div class="mko-artboard" style="position:relative;width:'+geom.artW+'px;height:'+geom.artH+'px;display:flex;align-items:stretch;background:var(--paper);font-family:Inter,Segoe UI,Arial,sans-serif;">'+
    left + centre + right +
    '</div>';
}

function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

/* ---------- Match / standings logic ---------- */
/* Circle method: every pair still appears exactly once (same total match
   count as before), but ordered round by round so no entry's matches are
   clustered at one end of the list — the naive i<j enumeration this
   replaced always front-loaded entry 1's matches and back-loaded the last
   entry's. Odd entry counts get a phantom "bye" seat that rotates through
   the circle with everyone else; whichever real entry lands opposite it in
   a given round sits that round out, same as classic round-robin
   scheduling. A useful side effect: within any single round, every match
   involves a different entry, so distributing a round's matches across
   several boards (matchBoardFor) never needs the same player in two
   places at once *within that round* — rounds bleeding into each other
   when boards don't evenly divide a round is a separate, not-yet-handled
   concern. */
function groupMatches(g){
  const real = g.entryIds;
  const n = real.length;
  if(n<2) return [];
  const hasBye = n%2===1;
  /* Seeded so the very first pair the rotation produces (circle[0] vs
     circle[last]) is always position 1 vs position 2 — best practice is
     the opening match is always 1v2, not whoever the raw rotation
     happens to start with. Entry 2 (and, for odd groups, the phantom bye
     seat) is moved to the far end of the initial circle to make that so;
     everyone else keeps their relative order. The rotate-and-pair
     process afterwards is unchanged, so the no-repeat/no-back-to-back
     guarantees still hold — this only changes where the circle starts,
     not how it turns. */
  const withoutSecond = real.slice(2);
  let circle = hasBye ? [real[0], null].concat(withoutSecond, [real[1]]) : [real[0]].concat(withoutSecond, [real[1]]);
  const size = circle.length, half = size/2, rounds = size-1;
  const matches = [];
  for(let r=0;r<rounds;r++){
    for(let i=0;i<half;i++){
      const a = circle[i], b = circle[size-1-i];
      if(a!=null && b!=null) matches.push([a,b]);
    }
    const fixed = circle[0];
    const rest = circle.slice(1);
    rest.unshift(rest.pop());
    circle = [fixed].concat(rest);
  }
  return matches;
}

function scoreKey(a,b){ return a<b ? a+'|'+b : b+'|'+a; }

function getScore(g,a,b){
  const key = scoreKey(a,b);
  return (g.scores && g.scores[key]) || null;
}

/* True once every match in the group has a real score (a no-show's
   walkover counts, since markGroupNoShow writes one via setScore).
   Withdrawn entries are already gone from g.entryIds, so groupMatches
   never lists a match for them and they can't block this. */
function groupIsComplete(g){
  return groupMatches(g).every(([a,b])=> !!getScore(g,a,b));
}

function computeStandings(g){
  const table = {};
  const results = []; // every scored match as {a,b,la,lb}, for the tie-break mini-tables
  g.entryIds.forEach(id=> table[id] = {id, pts:0, played:0, legsFor:0, legsAgainst:0, wins:0, losses:0, draws:0, h2h:{}} );
  groupMatches(g).forEach(([a,b])=>{
    const key = scoreKey(a,b);
    const sc = g.scores && g.scores[key];
    if(!sc) return;
    const firstIsA = a<b;
    const legsA = firstIsA? sc.legs1 : sc.legs2;
    const legsB = firstIsA? sc.legs2 : sc.legs1;
    if(legsA===undefined || legsB===undefined || legsA===''||legsB==='') return;
    const la=parseInt(legsA), lb=parseInt(legsB);
    if(isNaN(la)||isNaN(lb)) return;
    results.push({a, b, la, lb});
    table[a].played++; table[b].played++;
    table[a].legsFor+=la; table[a].legsAgainst+=lb;
    table[b].legsFor+=lb; table[b].legsAgainst+=la;
    if(la>lb){ table[a].pts+=2; table[a].wins++; table[b].losses++; table[a].h2h[b]='W'; table[b].h2h[a]='L'; }
    else if(lb>la){ table[b].pts+=2; table[b].wins++; table[a].losses++; table[b].h2h[a]='W'; table[a].h2h[b]='L'; }
    else { table[a].pts+=1; table[b].pts+=1; table[a].draws++; table[b].draws++; table[a].h2h[b]='D'; table[b].h2h[a]='D'; }
  });
  const order = (state && state.tieBreakOrder) || ['Head-to-head result','Leg difference','Legs won','Organiser decision / playoff'];
  /* Ranking: points first, then ties on points are resolved per cluster.
     - Two level: the usual rules in order (head-to-head, then overall leg
       difference, then overall legs won).
     - Three or more level: a mini-table built only from the matches the
       tied players played against each other, ranked by the same rules
       (head-to-head = mini points, leg difference and legs won within the
       mini-table). If a rule splits only some of them, the players still
       level go through the rules again using only their own matches. A
       cluster no rule can split stays level (ranked by list order, flagged
       for the organiser). Pairwise comparison can't be used for 3+: results
       can go in a circle (A beat B, B beat C, C beat A). */
  const miniStats = ids=>{
    const ms = {};
    ids.forEach(id=> ms[id] = {mp:0, mpts:0, lf:0, la:0, w:0});
    results.forEach(r=>{
      if(!ms[r.a] || !ms[r.b]) return;
      ms[r.a].mp++; ms[r.b].mp++;
      ms[r.a].lf+=r.la; ms[r.a].la+=r.lb; ms[r.b].lf+=r.lb; ms[r.b].la+=r.la;
      if(r.la>r.lb){ ms[r.a].mpts+=2; ms[r.a].w++; } else if(r.lb>r.la){ ms[r.b].mpts+=2; ms[r.b].w++; } else { ms[r.a].mpts++; ms[r.b].mpts++; }
    });
    ids.forEach(id=> ms[id].ld = ms[id].lf - ms[id].la);
    return ms;
  };
  // Returns {ids: final order, splits:[{hi,lo,rule,size,hiMini,loMini}]} — one split per adjacent pair.
  const resolveCluster = ids=>{
    if(ids.length===1) return {ids:ids.slice(), splits:[]};
    if(ids.length===2){
      const x = table[ids[0]], y = table[ids[1]];
      for(const rule of order){
        const c = compareByRule(rule, x, y);
        if(c!==0){
          const [hi, lo] = c<0 ? [x,y] : [y,x];
          return {ids:[hi.id, lo.id], splits:[{hi:hi.id, lo:lo.id, rule, size:2}]};
        }
      }
      return {ids:ids.slice(), splits:[{hi:ids[0], lo:ids[1], rule:null, size:2}]};
    }
    const ms = miniStats(ids);
    const keyFor = {'Head-to-head result': id=>ms[id].mpts, 'Leg difference': id=>ms[id].ld, 'Legs won': id=>ms[id].lf};
    for(const rule of order){
      const key = keyFor[rule];
      if(!key) continue; // e.g. organiser decision — nothing automatic
      if(new Set(ids.map(key)).size===1) continue;
      const sorted = ids.slice().sort((p,q)=> key(q)-key(p)); // stable: ties keep list order
      const groups = [];
      sorted.forEach(id=>{ const last = groups[groups.length-1]; if(last && key(last[0])===key(id)) last.push(id); else groups.push([id]); });
      const parts = groups.map(resolveCluster);
      const out = {ids:[], splits:[]};
      parts.forEach((p,i)=>{
        if(i>0){
          const hi = out.ids[out.ids.length-1], lo = p.ids[0];
          out.splits.push({hi, lo, rule, size:ids.length, hiMini:ms[hi], loMini:ms[lo]});
        }
        out.ids = out.ids.concat(p.ids);
        out.splits = out.splits.concat(p.splits);
      });
      return out;
    }
    const splits = [];
    for(let i=1;i<ids.length;i++) splits.push({hi:ids[i-1], lo:ids[i], rule:null, size:ids.length});
    return {ids:ids.slice(), splits};
  };
  const byPts = Object.values(table).sort((x,y)=> y.pts-x.pts); // stable: list order within equal points
  const arr = [];
  const tieNotes = [], tieClusters = [];
  for(let s=0;s<byPts.length;){
    let e = s; while(e<byPts.length && byPts[e].pts===byPts[s].pts) e++;
    const ids = byPts.slice(s,e).map(r=>r.id);
    if(ids.length===1){ arr.push(table[ids[0]]); }
    // Nobody in this cluster has played yet (e.g. a group that has just started):
    // level because there's nothing to compare, not a tie — keep list order, no notes.
    else if(ids.every(id=> table[id].played===0)){ ids.forEach(id=> arr.push(table[id])); }
    else {
      const res = resolveCluster(ids);
      res.ids.forEach(id=> arr.push(table[id]));
      res.splits.forEach(sp=> tieNotes.push(Object.assign({pts:byPts[s].pts}, sp)));
      if(ids.length>=3) tieClusters.push({ids:res.ids, pts:byPts[s].pts, mini:miniStats(ids)});
    }
    s = e;
  }
  arr.forEach((r,i)=> r.autoPosition = i+1);
  /* Rows get tieRule/tieSize so the table can badge them — taken from the
     split with the row above when it has one, otherwise the split with the
     row below. tieNotes are from the automatic order only (before manual
     overrides); rule:null means every rule leaves that pair level. */
  arr.forEach(r=>{ r.tieRule = null; r.tieSize = 0; });
  tieNotes.forEach(n=>{
    const hi = table[n.hi], lo = table[n.lo], label = n.rule || 'LEVEL';
    lo.tieRule = label; lo.tieSize = n.size;
    if(hi.tieRule===null){ hi.tieRule = label; hi.tieSize = n.size; }
  });
  arr.tieNotes = tieNotes;
  arr.tieClusters = tieClusters;
  const overrides = g.positionOverrides || {};
  arr.forEach(r=>{
    const ov = overrides[r.id];
    if(ov!==undefined && ov!==null && ov!==''){ r.position = parseInt(ov); r.manualOverride = true; }
    else { r.position = r.autoPosition; r.manualOverride = false; }
  });
  arr.sort((x,y)=> (x.position-y.position) || (x.autoPosition-y.autoPosition));
  return arr;
}

/* ---------- Standings table + tie-break explanation ---------- */
var TIE_RULE_SHORT = {'Head-to-head result':'H2H','Leg difference':'LD','Legs won':'LW'};

function fmtLegDiff(n){ return n>0 ? '+'+n : String(n); }

function standingsTableHTML(g, standings){
  standings = standings || computeStandings(g);
  const t = state;
  const showDraws = standings.some(s=> s.draws>0);
  const anyTie = standings.some(s=> s.tieRule);
  const rows = standings.map(st=>{
    const ent = t.entriesList.find(e=>e.id===st.id);
    const diff = st.legsFor - st.legsAgainst;
    let tb = '';
    if(st.tieRule==='LEVEL') tb = '<span class="tb-badge level" title="Level on points after every tie-break rule">?</span>';
    else if(st.tieRule) tb = '<span class="tb-badge" title="Separated from the entry beside it on points by: '+escapeHtml(st.tieRule)+(st.tieSize>2?' (mini-table of the '+st.tieSize+' tied entries)':'')+'">'+(st.tieSize>2?st.tieSize+'-way ':'')+(TIE_RULE_SHORT[st.tieRule]||escapeHtml(st.tieRule))+'</span>';
    return '<tr>'+
      '<td class="pos">'+st.position+(st.manualOverride?'*':'')+'</td>'+
      '<td class="l">'+escapeHtml(ent?ent.name:'—')+'</td>'+
      '<td class="dim">'+st.played+'</td>'+
      '<td>'+st.wins+'</td>'+
      '<td class="dim">'+st.losses+'</td>'+
      (showDraws?'<td class="dim">'+st.draws+'</td>':'')+
      '<td>'+st.legsFor+'</td>'+
      '<td class="'+(diff<0?'neg':'')+'">'+fmtLegDiff(diff)+'</td>'+
      '<td class="pts">'+st.pts+'</td>'+
      (anyTie?'<td>'+tb+'</td>':'')+
    '</tr>';
  }).join('');
  return '<table class="std-table"><thead><tr>'+
    '<th class="l">Pos.</th><th class="l">Entry</th><th title="Matches played">MP</th><th title="Matches won">MW</th><th title="Matches lost">ML</th>'+
    (showDraws?'<th title="Matches drawn">MD</th>':'')+
    '<th title="Legs won">LW</th><th title="Leg difference (legs won minus legs lost)">+/-</th><th title="Points">Pts</th>'+
    (anyTie?'<th title="Tie-break that separated this entry from the one beside it">TB</th>':'')+
  '</tr></thead><tbody>'+rows+'</tbody></table>';
}

// opts.public: wording for spectators (no organiser instructions like "use Adjust positions").
function tieNotesHTML(g, standings, opts){
  const forPublic = !!(opts && opts.public);
  standings = standings || computeStandings(g);
  const t = state;
  const notes = standings.tieNotes || [];
  const byId = {}; standings.forEach(s=> byId[s.id]=s);
  const nm = id=>{ const e = t.entriesList.find(x=>x.id===id); return '<b>'+escapeHtml(e?e.name:'—')+'</b>'; };
  const complete = groupIsComplete(g);
  const lines = [];
  let levelRun = null; // consecutive still-level entries, reported as one line
  const flushLevel = ()=>{
    if(!levelRun) return;
    lines.push('<div class="warn">'+levelRun.ids.map(nm).join(', ').replace(/, ([^,]*)$/, ' and $1')+' are still level on '+levelRun.pts+' pts after every tie-break rule'+' — needs an organiser decision or a playoff'+(forPublic ? '.' : ' (use Adjust positions).')+'</div>');
    levelRun = null;
  };
  notes.forEach(n=>{
    const hi = byId[n.hi], lo = byId[n.lo];
    // Positions involving a manual override are explained by the asterisk note instead.
    if(hi.manualOverride || lo.manualOverride) return;
    if(!n.rule && complete){
      if(levelRun && levelRun.ids[levelRun.ids.length-1]===n.hi){ levelRun.ids.push(n.lo); }
      else { flushLevel(); levelRun = {ids:[n.hi, n.lo], pts:n.pts}; }
      return;
    }
    flushLevel();
    // 3+ tied: the figures compared come from the mini-table (matches between the tied entries only).
    const mini = n.hiMini && n.loMini;
    const among = mini ? ' among the tied entries' : '';
    if(n.rule==='Head-to-head result'){
      lines.push('<div>'+nm(n.hi)+' ahead of '+nm(n.lo)+' — level on '+n.pts+' pts, separated by head-to-head'+(mini ? among+' (mini-table points '+n.hiMini.mpts+' vs '+n.loMini.mpts+')' : ' (won their match)')+'.</div>');
    } else if(n.rule==='Leg difference'){
      const a = mini ? n.hiMini.ld : hi.legsFor-hi.legsAgainst, b = mini ? n.loMini.ld : lo.legsFor-lo.legsAgainst;
      lines.push('<div>'+nm(n.hi)+' ahead of '+nm(n.lo)+' — level on '+n.pts+' pts, separated by leg difference'+among+' ('+fmtLegDiff(a)+' vs '+fmtLegDiff(b)+').</div>');
    } else if(n.rule==='Legs won'){
      const a = mini ? n.hiMini.lf : hi.legsFor, b = mini ? n.loMini.lf : lo.legsFor;
      lines.push('<div>'+nm(n.hi)+' ahead of '+nm(n.lo)+' — level on '+n.pts+' pts, separated by legs won'+among+' ('+a+' vs '+b+').</div>');
    } else if(n.rule){
      lines.push('<div>'+nm(n.hi)+' ahead of '+nm(n.lo)+' — level on '+n.pts+' pts, separated by '+escapeHtml(n.rule)+'.</div>');
    }
  });
  flushLevel();
  if(groupHasPositionOverrides(g)) lines.push('<div><b>*</b> Position set manually by the organiser.</div>');
  // Mini-tables behind any 3+ way tie, so the organiser can see exactly what was compared.
  const minis = (standings.tieClusters||[]).filter(c=> !c.ids.some(id=> byId[id].manualOverride)).map(c=>{
    const names = c.ids.map(id=>{ const e = t.entriesList.find(x=>x.id===id); return '<b>'+escapeHtml(e?e.name:'—')+'</b>'; });
    const rows = c.ids.map(id=>{
      const m = c.mini[id];
      return '<tr><td class="l">'+nm(id)+'</td><td class="dim">'+m.mp+'</td><td>'+m.w+'</td><td>'+m.mpts+'</td><td>'+m.lf+'–'+m.la+'</td><td class="'+(m.ld<0?'neg':'')+'">'+fmtLegDiff(m.ld)+'</td></tr>';
    }).join('');
    return '<div style="margin-top:10px"><div>Mini-table: '+names.join(', ').replace(/, ([^,]*)$/, ' and $1')+' — level on '+c.pts+' pts, only the matches between them count.</div>'+
      '<table class="std-table" style="margin-top:4px;font-size:12px"><thead><tr><th class="l">Entry</th><th title="Matches played between these entries">MP</th><th title="Matches won">MW</th><th title="Points from these matches">Pts</th><th title="Legs won–lost in these matches">Legs</th><th>+/-</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
  }).join('');
  if(!lines.length && !minis) return '';
  const hdr = complete ? '' : '<div>Provisional — ties may change as the remaining matches are played.</div>';
  return '<div class="tie-notes">'+(notes.length&&!complete?hdr:'')+lines.join('')+minis+'</div>';
}

function groupHasPositionOverrides(g){
  const ov = g.positionOverrides || {};
  return Object.keys(ov).some(k=> ov[k]!==undefined && ov[k]!==null && ov[k]!=='');
}

function compareByRule(rule, x, y){
  if(rule==='Head-to-head result'){
    const h = x.h2h[y.id];
    if(h==='W') return -1;
    if(h==='L') return 1;
    return 0;
  }
  if(rule==='Leg difference'){
    const xd = x.legsFor-x.legsAgainst, yd = y.legsFor-y.legsAgainst;
    return yd-xd;
  }
  if(rule==='Legs won'){ return y.legsFor-x.legsFor; }
  return 0; // Organiser decision / playoff — no automatic ordering
}

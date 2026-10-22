/* Printed knockout brackets (organiser app only; the public viewer does not load this file).

   One layout engine for every two-sided bracket sheet: the main bracket, the Plate pool and the projected bracket printed
   before the round robin, for Singles, Doubles and Teams (Group Boards keeps its own chart in app.html). Design:
   docs/superpowers/specs/2026-10-22-printed-brackets-design.md and the mockups in docs/design/bracket-redesign/.

   Every length is in millimetres. A chart is laid out in "design units" (du): millimetres at scale s = 1, which is the
   legibility floor (7 pt names, 4.8 mm boxes, 1.6 mm between the two boxes of a match, 3.0 mm between matches). It is then
   printed at ONE uniform scale s = min(fit width, fit height, 2), so boxes, text and gaps scale together and the shape is
   never distorted. s >= 1 means the chart is legible on that paper.

   - The left half runs left to right, the right half right to left, and they meet at the Final in the centre column
     (finalists stacked, Champion box below, the title block above, sponsors and the live-results code below).
   - Byes are collapsed: an entry with a first-round bye starts in round 2 with a small BYE tag (and its seed beside it).
   - Box width comes from the widest name measured at bold weight in Barlow Semi Condensed (embedded in app.html, used only
     on these sheets). In a browser the text is measured with a canvas and the embedded font; where there is no real canvas
     (the tests run the app in a Node vm) the same font's advance widths below are used, which are within about 1 % of the
     browser (kerning only ever makes the real text narrower).
   - Names up to 24 characters print in full; longer ones are cut with an ellipsis and a footnote number, and the full name
     is printed in the footer.

   KBP.layout() returns plain positioned items (so tests can check the geometry without a browser), KBP.sheetHTML() turns
   them into the printed sheet, KBP.verify() checks a layout (gaps, overlaps, overflow, font floors). */
var KBP = (function(){
  'use strict';
  var PT = 25.4/72;                 // mm per point
  var PAPERS = { A4:{w:297,h:210}, A3:{w:420,h:297}, A2:{w:594,h:420}, A1:{w:841,h:594} };
  var ORDER = ['A4','A3','A2','A1'];
  var MARGIN = 8;                   // the app's @page margin
  var FOOTER = 7;                   // legend + full names + credit strip under the chart (fixed mm, never scaled)
  var WING_HEAD = 9;                // the title strip on a split section sheet
  var S_MAX = 2;                    // names never grow past 14 pt
  var NAME_CAP = 24;                // characters printed in full
  var SOFT_PT = 8;                  // the soft recommendation: names of 8 pt or more are easier to read
  var BASE = {
    font: 7, seedFont: 5.5, tagFont: 5, byeFont: 4.6, markFont: 4.6, roundFont: 6.5,
    H1: 4.8, H2: 7.4, g: 1.6, G: 3.0, C: 4.8, barOff: 2.4,
    padL: 0.9, padR: 0.6, legs: 4.2, legsMax: 8.4,
    gutter: 3.0, headRow: 5.5, Nmin: 12, NminLabel: 8, border: 0.75, finalK: 1.09
  };
  var FAMILY = '"Barlow Semi Condensed"';
  var SANS = 'Inter,"Segoe UI",Arial,sans-serif';

  /* ---------- text measurement ---------- */
  var WCH = "0123456789 !\"#$%&'()*+,-./:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~\u00a0\u00a1\u00a2\u00a3\u00a4\u00a5\u00a6\u00a7\u00a8\u00a9\u00aa\u00ab\u00ac\u00ad\u00ae\u00af\u00b0\u00b1\u00b2\u00b3\u00b4\u00b5\u00b6\u00b7\u00b8\u00b9\u00ba\u00bb\u00bc\u00bd\u00be\u00bf\u00c0\u00c1\u00c2\u00c3\u00c4\u00c5\u00c6\u00c7\u00c8\u00c9\u00ca\u00cb\u00cc\u00cd\u00ce\u00cf\u00d0\u00d1\u00d2\u00d3\u00d4\u00d5\u00d6\u00d7\u00d8\u00d9\u00da\u00db\u00dc\u00dd\u00de\u00df\u00e0\u00e1\u00e2\u00e3\u00e4\u00e5\u00e6\u00e7\u00e8\u00e9\u00ea\u00eb\u00ec\u00ed\u00ee\u00ef\u00f0\u00f1\u00f2\u00f3\u00f4\u00f5\u00f6\u00f7\u00f8\u00f9\u00fa\u00fb\u00fc\u00fd\u00fe\u00ff\u2018\u2019\u201c\u201d\u2013\u2014\u2026\u2022\u0152\u0153\u0141\u0142\u015a\u015b\u0106\u0107\u0179\u017a\u017b\u017c\u0104\u0105\u0118\u0119\u0143\u0144\u0160\u0161\u017d\u017e\u010c\u010d\u0158\u0159\u011e\u011f\u0130\u0131\u015e\u015f\u0150\u0151\u0170\u0171";
  var W500 = '507,309,480,471,505,471,472,431,478,463,200,295,286,634,495,808,619,141,272,272,379,468,227,360,238,395,291,260,468,468,468,438,791,533,540,530,544,515,487,535,560,240,507,541,488,623,587,542,522,516,533,507,507,559,529,762,526,514,476,355,395,355,432,445,202,471,492,470,492,478,326,483,487,233,227,467,213,742,487,490,497,497,341,437,322,485,445,659,449,432,408,313,169,313,492,200,295,470,558,536,607,169,436,344,835,307,498,468,0,443,357,369,468,292,296,202,492,540,213,141,169,321,498,748,736,830,438,533,533,533,533,533,533,827,530,515,515,515,515,240,240,240,240,593,587,542,542,542,542,542,405,593,559,559,559,559,514,511,502,470,470,470,470,470,470,749,470,477,477,477,477,199,199,199,199,488,487,483,483,483,483,483,468,489,487,487,487,487,432,485,432,155,155,294,294,417,634,735,305,806,766,532,350,507,440,530,470,476,408,476,408,533,470,515,477,587,487,507,440,476,408,530,470,533,337,535,483,240,199,507,440,542,483,559,487';
  var W700 = '511,319,499,487,544,488,488,451,490,482,200,311,352,651,508,795,654,169,329,329,380,462,238,370,247,444,319,274,462,462,462,479,786,577,545,536,547,511,490,540,554,246,518,558,499,631,590,547,531,527,543,520,526,554,555,783,553,546,485,381,444,381,448,472,226,487,505,486,505,492,342,498,497,237,235,491,227,755,497,503,508,508,354,457,335,496,478,698,488,464,416,360,194,360,512,200,311,486,565,570,608,194,466,382,804,311,484,462,0,439,315,367,462,305,303,226,501,569,230,160,175,326,484,771,747,855,479,577,577,577,577,577,577,858,536,511,511,511,511,246,246,246,246,588,590,547,547,547,547,547,422,584,554,554,554,554,546,523,518,486,486,486,486,486,486,762,486,490,490,490,490,213,213,213,213,500,497,496,496,496,496,496,462,504,497,497,497,497,463,496,463,196,196,358,358,428,626,780,311,811,781,569,411,520,458,536,486,485,416,485,416,577,486,511,490,590,497,520,458,485,416,536,486,543,354,539,498,246,213,520,458,547,496,554,497';
  var WT = { 500:{}, 700:{} };
  (function(){ var a = W500.split(','), b = W700.split(','); for(var i=0;i<WCH.length;i++){ WT[500][WCH[i]] = +a[i]; WT[700][WCH[i]] = +b[i]; } })();
  var AVG = { 500: 470, 700: 485 };
  var STACK = FAMILY+',"Arial Narrow",Arial,sans-serif';   // the same stack as the printed names (app.html .kb-nm)
  function browser(){ return typeof FontFace==='function' && typeof document!=='undefined' && !!document.fonts && typeof document.fonts.check==='function'; }
  var ctx = null, loading = null;
  /* True when both weights of the print font are loaded (checked each time: a face can be dropped and loaded again). */
  function fontReady(){
    if(!browser()) return false;
    try{ return document.fonts.check('500 10px '+FAMILY) && document.fonts.check('700 10px '+FAMILY); }catch(e){ return false; }
  }
  function loadFonts(){
    if(!browser()) return null;
    try{ loading = Promise.all([document.fonts.load('500 10px '+FAMILY), document.fonts.load('700 10px '+FAMILY)]); }
    catch(e){ loading = null; }
    return loading;
  }
  /* Runs cb once both weights of the print font are loaded, at once where there is no browser font API (the tests). The
     loads are awaited, then checked again (and asked for once more if a face is still missing). If the font can not be
     had, cb still runs: the browser then measures with the fallback face it will really print in (see textMM), so the
     layout stays right, only wider. */
  function whenReady(cb){
    if(!browser() || fontReady()){ cb(); return; }
    var done = false; var go = function(){ if(!done){ done = true; cb(); } };
    var settle = function(){ return document.fonts.ready.then(function(){}, function(){}); };
    var p = loadFonts();
    (p || Promise.resolve()).then(settle, settle).then(function(){
      if(fontReady()) return go();
      var q = loadFonts();
      (q || Promise.resolve()).then(settle, settle).then(go, go);
    }, go);
    setTimeout(go, 2500);      // never wait on a font for ever
  }
  function canvas(){ if(!ctx){ try{ ctx = document.createElement('canvas').getContext('2d'); }catch(e){ ctx = null; } } return ctx; }
  /* Width in mm of `text` in the print font at `pt` points (weight 500 or 700). In a browser the canvas measures with the
     printed names' own font stack, so a missing face is measured as the fallback that will print. Without a browser (the
     tests) the print font's advance widths below are used. */
  function textMM(text, pt, weight){
    var w = weight>=600 ? 700 : 500; text = String(text==null ? '' : text);
    if(browser() && canvas()){ ctx.font = w+' 100px '+STACK; return ctx.measureText(text).width/100*pt*PT; }
    var em = 0; for(var i=0;i<text.length;i++){ var c = WT[w][text[i]]; em += c==null ? AVG[w] : c; }
    return em/1000*pt*PT;
  }
  /* Other faces on the sheet (title block, labels, footer): the canvas in a browser; elsewhere a generous estimate per
     kind of character (k = [capitals, small letters and digits, spaces, other]), a little wider than Segoe UI / Inter
     and Georgia really are, so a label fitted by it always fits the printed page. */
  function faceMM(text, pt, css, k){
    text = String(text==null ? '' : text);
    if(browser() && canvas()){ ctx.font = css.replace('{px}', '100px'); return ctx.measureText(text).width/100*pt*PT; }
    var em = 0;
    for(var i=0;i<text.length;i++){ var ch = text[i]; em += /[A-Z]/.test(ch) ? k[0] : /[a-z0-9]/.test(ch) ? k[1] : ch===' ' ? k[2] : k[3]; }
    return em*pt*PT;
  }
  function serifBold(text, pt){ return faceMM(text, pt, '700 {px} Georgia,serif', [0.8, 0.62, 0.27, 0.45]); }
  function sans(text, pt, w){ return faceMM(text, pt, (w||400)+' {px} '+SANS, w>=700 ? [0.76, 0.6, 0.27, 0.45] : [0.68, 0.55, 0.26, 0.4]); }
  function ready(){ loadFonts(); return fontReady(); }
  /* The spec's floor for secondary text (match numbers, BYE, seeds, round labels, the Final and Champion labels, the title
     block, the footer): 4.6 pt on a legible sheet; on a sheet shrunk on purpose the chart's text shrinks with it. */
  var SEC_PT = 4.6;
  function secFloor(s){ return SEC_PT*Math.min(1, s); }
  /* Width (mm) of a one-line label at pt; ls = letter spacing in em. */
  function labelMM(text, pt, w, ls){ return sans(text, pt, w) + String(text).length*(ls||0)*pt*PT; }
  /* The largest size up to maxPt at which a one-line label fits width (mm), never under the floor. */
  function fitSans(text, maxPt, width, w, ls, floor){
    var at = labelMM(text, maxPt, w, ls);
    var fs = at <= width*0.94 || !at ? maxPt : maxPt*width*0.94/at;
    return Math.max(fs, floor || 0);
  }
  /* A round name that fits its column at or above the floor: the full name, else a short one ("R128", "QF", "SF"). */
  var SHORT_ROUND = { 'Final':'F', 'Semifinal':'SF', 'Quarterfinal':'QF' };
  function shortRound(name){ var m = /^Round of (\d+)$/.exec(name); return m ? 'R'+m[1] : (SHORT_ROUND[name] || name); }
  function roundLabel(name, s, width){
    var max = BASE.roundFont*s, floor = secFloor(s);
    if(labelMM(name, floor, 700) <= width*0.94) return { txt:name, fs: fitSans(name, max, width, 700, 0, floor) };
    var sh = shortRound(name);
    return { txt:sh, fs: fitSans(sh, max, width, 700, 0, floor) };
  }
  /* 'Final' (Georgia) and its match number pill side by side, fitted to the Final box width but never under the floor
     (then the label is wider than the box, centred over it). */
  function flWidth(label, tag, s, fs){ return serifBold(label, fs) + (tag ? textMM(tag, BASE.tagFont*s, 500) + 3.4*s : 0); }
  function flFont(label, tag, s, width){
    var fs = 10*s, need = flWidth(label, tag, s, fs);
    return need <= width*0.94 ? fs : Math.max(secFloor(s)*1.3, fs*width*0.94/need);
  }

  /* ---------- names ---------- */
  function displayName(name, notes){
    name = String(name||'');
    if(name.length <= NAME_CAP) return { text:name, note:null };
    var n = notes.length+1; notes.push({ n:n, full:name });
    return { text: name.slice(0, NAME_CAP-1).replace(/\s+$/,'')+'\u2026', note:n };
  }
  /* Narrowest line width that wraps a text onto at most two lines (a break at a space, or after a '/'). */
  function twoLineMM(text, pt){
    var full = textMM(text, pt, 700), best = full;
    for(var i=1;i<text.length;i++){
      var ch = text[i-1];
      if(ch===' ' || ch==='/'){
        var w = Math.max(textMM(text.slice(0,i).replace(/\s+$/,''), pt, 700), textMM(text.slice(i).replace(/^\s+/,''), pt, 700));
        if(w < best) best = w;
      }
    }
    return best;
  }
  function noteText(d){ return d.text + (d.note ? ' '+d.note : ''); }

  /* ---------- the model ----------
     { R, kind:'main'|'projected', noLegs, rounds:[[{ a:side, b:side, bye, decided, win:'a'|'b'|null, tag }]], roundNames, champion }
     side = { name, seed, legs, win, lose, mark:'WO'|'NO-SHOW'|'', muted, ph } (ph: grey placeholder text for an empty box) */
  function fromBracket(bracket, t, opts){
    opts = opts || {};
    var projected = !!opts.projected;
    var R = bracket.rounds.length;
    function nameOf(id){ if(!id) return ''; if(projected) return (bracket.seedLabels && bracket.seedLabels[id]) || ''; return bracketEntryName(t, id) || ''; }
    function seedOf(id){ if(projected || !id) return ''; var s = bracketSeedForDisplay(t, bracket.seeds, bracket.seedLabels, id); return s ? String(s) : ''; }
    var rounds = bracket.rounds.map(function(round, ri){
      return round.map(function(m, mi){
        var collapsed = ri===0 && !!m.bye && ((m.aEntryId?1:0)+(m.bEntryId?1:0))<=1;
        var decided = !projected && !!m.winnerId && m.aLegs!=null && m.bLegs!=null && !m.bye;
        var winSide = decided ? (m.winnerId===m.aEntryId ? 'a' : 'b') : null;
        function side(s){
          var id = m[s+'EntryId'];
          var o = { name: nameOf(id), seed: ri===0 ? seedOf(id) : '', legs: (!projected && id && m[s+'Legs']!=null) ? String(m[s+'Legs']) : '',
            win: decided && winSide===s, lose: decided && winSide!==s && !!id, mark:'', muted:false, ph:'' };
          if(!id && m.bye && ri>0) o.ph = 'BYE';
          if(id && m.wo && m.winnerId && m.winnerId!==id) o.mark = 'WO';
          if(id && m.void){ o.mark = 'NO-SHOW'; o.muted = true; }
          return o;
        }
        var tag = projected ? (opts.tagPrefix||'')+(ri+1)+'-'+(mi+1) : koMatchTag(bracket, t, ri, mi);
        return { a:side('a'), b:side('b'), bye:collapsed, decided:decided, win:winSide, tag:tag };
      });
    });
    var champId = projected ? null : bracketChampion(bracket);
    return { R:R, kind: projected ? 'projected' : 'main', noLegs: projected, rounds:rounds,
      roundNames: bracket.rounds.map(function(r, ri){ return koRoundName(bracket, ri); }),
      champion: champId ? (bracketEntryName(t, champId) || '') : '' };
  }

  function sidesOf(model){ var out = []; model.rounds.forEach(function(round){ round.forEach(function(M){ out.push(M.a, M.b); }); }); return out; }
  /* Name area width (du) for one-line and two-line boxes, from the names actually in the bracket. */
  function nameWidths(model){
    var notes = [], seen = {}, w1 = 0, w2 = 0, mk = 0;
    sidesOf(model).forEach(function(sd){
      if(sd.mark) mk = Math.max(mk, textMM(sd.mark, BASE.markFont, 700) + 0.8);
      var nm = sd.name || sd.ph; if(!nm || seen[nm]) return; seen[nm] = 1;
      var d = displayName(nm, notes), tx = noteText(d);
      w1 = Math.max(w1, textMM(tx, BASE.font, 700)); w2 = Math.max(w2, twoLineMM(tx, BASE.font));
    });
    var min = model.kind==='projected' ? BASE.NminLabel : BASE.Nmin;
    return { N1: Math.max(min, w1 + mk + 0.5), N2: Math.max(min*0.75, Math.max(w2, mk) + 0.5) };
  }
  function seedWidth(model){
    var w = 0; model.rounds[0].forEach(function(M){ ['a','b'].forEach(function(s){ if(M[s].seed) w = Math.max(w, textMM(M[s].seed, BASE.seedFont, 700)); }); });
    return w;
  }
  function gutterFor(model){ return Math.max(BASE.gutter, seedWidth(model) + 1.1); }

  /* ---------- one half of the bracket ---------- */
  /* Places the leaves of the subtrees `roots` (default: the half's semifinal) top to bottom, each later box at the midpoint of
     the two that feed it. g/G are the gaps inside a match / between matches (times K, the spare-height spread). */
  function layoutSide(model, side, H, K, pad, roots){
    var g = BASE.g*K, G = BASE.G*K;
    var boxes = [], matches = [], cursor = pad, prev = null, nLeaves = 0, nSmall = 0, nBig = 0;
    function leaf(col, r, m, slot, byeLeaf){
      var gap = 0;
      if(prev){ if(prev.r===r && prev.m===m && prev.col===col){ gap = g; nSmall++; } else { gap = G; nBig++; } }
      var top = cursor + gap; cursor = top + H; nLeaves++;
      var b = { col:col, r:r, m:m, slot:slot, y: top + H/2, leaf:true, byeLeaf:byeLeaf, side:side };
      prev = b; boxes.push(b); return b;
    }
    function place(r, m){
      var M = model.rounds[r][m], res = {};
      ['a','b'].forEach(function(slot){
        if(r===0){ res[slot] = leaf(0, 0, m, slot, false); return; }
        var fm = 2*m + (slot==='b' ? 1 : 0), F = model.rounds[r-1][fm];
        if(r-1===0 && F.bye){ res[slot] = leaf(r, r, m, slot, true); return; }
        var fr = place(r-1, fm);
        var b = { col:r, r:r, m:m, slot:slot, y:(fr.a.y+fr.b.y)/2, leaf:false, side:side };
        boxes.push(b); res[slot] = b;
      });
      matches.push({ r:r, m:m, M:M, a:res.a, b:res.b, side:side });
      return res;
    }
    (roots || [{ r:model.R-2, m:side }]).forEach(function(rt){
      if(rt.r < 0) return;
      if(rt.r===0 && model.rounds[0][rt.m].bye) return;     // a collapsed bye has no boxes of its own
      place(rt.r, rt.m);
    });
    return { boxes:boxes, matches:matches, height: cursor + pad, nLeaves:nLeaves, nSmall:nSmall, nBig:nBig };
  }

  /* ---------- the fit decision for one paper size ---------- */
  function avail(paper){ var p = PAPERS[paper]; return { w: p.w - 2*MARGIN, h: p.h - 2*MARGIN - FOOTER, pw: p.w, ph: p.h }; }
  function centreMin(H){ var Hf = 1.3*H; return 2*(9 + 2*Hf) + 24; }   // Final, Champion and room for the title block and sponsors
  function geom(model, mode, N, legs, gutter){
    var H = mode===2 ? BASE.H2 : BASE.H1;
    var B = BASE.padL + N + BASE.padR + legs + BASE.border, Bc = B*BASE.finalK, k = model.R - 1;
    var W = 2*gutter + 2*k*(B + BASE.C) + Bc;
    var L = layoutSide(model, 0, H, 1, 0), Rr = layoutSide(model, 1, H, 1, 0);
    var sideH = Math.max(L.height, Rr.height);
    return { mode:mode, H:H, B:B, Bc:Bc, legs:legs, N:N, k:k, W:W, gutter:gutter, Hn: Math.max(BASE.headRow + sideH, centreMin(H)), sideH:sideH, nLeaves: Math.max(L.nLeaves, Rr.nLeaves) };
  }
  function plan(model, paper, opts){
    opts = opts || {};
    var nw = nameWidths(model), av = avail(paper), gut = gutterFor(model);
    var legs = model.noLegs ? 0 : BASE.legs;
    var cands = [1,2].map(function(mode){
      var g = geom(model, mode, mode===1 ? nw.N1 : nw.N2, legs, gut);
      g.sw = av.w/g.W; g.sh = av.h/g.Hn; g.s = Math.min(g.sw, g.sh, S_MAX);
      return g;
    });
    var pick = cands[0];
    if(opts.mode!==1 && cands[0].s < 1 && cands[1].s > cands[0].s) pick = cands[1];
    /* the results cell grows into spare width (small brackets); a chart limited by width keeps the minimum */
    if(legs){
      var spare = av.w/pick.s - pick.W;
      if(spare > 0.05){
        var extra = Math.min(spare/(2*pick.k + BASE.finalK), BASE.legsMax - legs);
        var g2 = geom(model, pick.mode, pick.N, legs + extra, gut);
        g2.sw = av.w/g2.W; g2.sh = av.h/g2.Hn; g2.s = Math.min(g2.sw, g2.sh, S_MAX);
        if(g2.s >= pick.s - 1e-9) pick = g2;
      }
    }
    return Object.assign({ paper:paper, av:av, fits: pick.s >= 0.999, namePt: +(BASE.font*pick.s).toFixed(1) }, pick);
  }
  /* The smallest paper on which every model is legible (A1 when none is). */
  function recommend(models, opts){
    models = [].concat(models);
    var plans = {}; ORDER.forEach(function(p){ plans[p] = models.map(function(m){ return plan(m, p, opts); }); });
    var rec = ORDER.find(function(p){ return plans[p].every(function(x){ return x.fits; }); }) || 'A1';
    var soft = ORDER.find(function(p){ return plans[p].every(function(x){ return x.s*BASE.font >= SOFT_PT - 0.05; }); }) || null;
    return { plans:plans, rec:rec, soft:soft };
  }

  /* ---------- the sheet layout ---------- */
  function rect(k, x, y, w, h, extra){ var o = { k:k, x:x, y:y, w:w, h:h }; if(extra) Object.keys(extra).forEach(function(n){ o[n] = extra[n]; }); return o; }
  function crownLines(chrome){ var c = chrome || {}; return { ov:(c.overline||'').toUpperCase(), tt:c.title||'', sb:c.sub||'', bl:c.label||'', dt:c.detail||'' }; }
  /* Height (mm) of the title block at size factor cs, and whether its lines fit `width`. */
  function crownSize(chrome, cs, width, noLogo){
    var L = crownLines(chrome), hasLogo = !!(chrome && chrome.logo) && !noLogo;
    var tw = serifBold(L.tt, 14*cs), lines = tw <= width ? 1 : 2;
    var titleFits = lines===1 || tw/2 <= width*0.92;
    /* the small lines keep the title's size where they fit, else shrink on their own, never under the 4.6 pt floor; a
       line still too wide at the floor goes onto two lines (as does the bracket label with its detail) */
    var small = function(w, base){ var k = w <= width*0.96 ? 1 : width*0.96/w; k = Math.max(k, SEC_PT/(base*cs)); return { k:k, lines: w*k <= width*0.96 ? 1 : 2 }; };
    var ov = small(sans(L.ov, 6*cs, 700) + L.ov.length*0.18*6*cs*PT, 6), sb = small(sans(L.sb, 6.5*cs, 400), 6.5);
    var blOne = sans(L.bl+'  '+L.dt, 7*cs, 700) <= width*0.96;
    var bl = blOne ? { k:1, lines:1 } : small(Math.max(sans(L.bl, 7*cs, 700), sans(L.dt, 7*cs, 500)), 7), blLines = blOne || !L.dt ? 1 : 2;
    if(!blOne && bl.lines > 1) blLines = L.dt ? 3 : 2;
    var tk = Math.max(1, SEC_PT/(14*cs));
    var h = (hasLogo ? 12.4*cs : 0) + ov.lines*6*cs*ov.k*PT*1.3 + lines*14*cs*tk*PT*1.12 + 1.6*cs + sb.lines*6.5*cs*sb.k*PT*1.3 + 3.7*cs + blLines*7*cs*bl.k*PT*1.3;
    return { h:h, lines:lines, titleFits:titleFits, logoH: hasLogo ? 11*cs : 0, ovK:ov.k, sbK:sb.k, blK:bl.k, ovLines:ov.lines, sbLines:sb.lines, blLines:blLines,
      minPt: Math.min(6*cs*ov.k, 6.5*cs*sb.k, 7*cs*bl.k, 14*cs*tk) };
  }

  /* Emits the boxes, connectors, match numbers, seeds and BYE tags of one placed half. */
  function drawSide(out, model, L, sd, oy, X, s, dims, disp, opts){
    var H = dims.H, B = dims.B, C = BASE.C;
    var S = function(v){ return v*s; };
    L.boxes.forEach(function(b){
      var x = X(b.col), y = oy + b.y - H/2, M = model.rounds[b.r][b.m], side = M[b.slot];
      out.items.push(rect('box', S(x), S(y), S(B), S(H), { sd:sd, side:side, disp: side.name ? disp[side.name] : null, col:b.col, r:b.r, m:b.m, slot:b.slot }));
      if(b.r===model.R-2){ out.sfTop = Math.min(out.sfTop, S(y)); out.sfBot = Math.max(out.sfBot, S(y+H)); }
      var seed = '';
      if(b.byeLeaf){ var F = model.rounds[0][2*b.m + (b.slot==='b' ? 1 : 0)]; seed = F.a.seed || F.b.seed || ''; }
      else if(b.r===0) seed = side.seed;
      if(b.byeLeaf){
        var tw = 4.2, th = 2.4;
        var tx = sd===0 ? x - C/2 - tw/2 : x + B + C/2 - tw/2;
        out.items.push(rect('bye', S(tx), S(oy + b.y - th/2), S(tw), S(th), { fs: BASE.byeFont*s }));
        if(seed){
          var sw = Math.max(3.4, textMM(seed, BASE.seedFont, 700) + 0.2);
          var sx = sd===0 ? tx - sw - 0.6 : tx + tw + 0.6;
          out.items.push(rect('seed', S(sx), S(oy + b.y - 1.4), S(sw), S(2.8), { txt:seed, fs: BASE.seedFont*s, al: sd===0 ? 'r' : 'l' }));
        }
      } else if(b.r===0 && seed){
        var gw = dims.gutter - 0.6, gx = sd===0 ? x - gw - 0.5 : x + B + 0.5;
        out.items.push(rect('seed', S(gx), S(oy + b.y - 1.4), S(gw), S(2.8), { txt:seed, fs: BASE.seedFont*s, al: sd===0 ? 'r' : 'l' }));
        if(opts.entryMarks){ var mx = sd===0 ? S(gx) - 2.2 : S(gx + gw) + 2.2; if(mx >= 1.8 && mx <= opts.width - 1.8) out.marks.push({ x: mx, y: S(oy + b.y) }); }
      }
    });
    var tagH = 2.5;
    L.matches.forEach(function(mt){
      var x = X(mt.r), ya = oy + mt.a.y, yb = oy + mt.b.y, yExit;
      if(opts.toFinal && mt.r===model.R-2) yExit = opts.yMid + (sd===0 ? -1 : 1)*(H*1.3 + 2.4)/2;
      else yExit = (ya + yb)/2;
      var x0 = sd===0 ? x + B : x, xb = sd===0 ? x + B + BASE.barOff : x - BASE.barOff, x1 = sd===0 ? x + B + C : x - C;
      var M = mt.M, winA = M.decided && M.win==='a', winB = M.decided && M.win==='b';
      out.paths.push({ d:[[x0,ya],[xb,ya],[xb,yExit]], win:winA }, { d:[[x0,yb],[xb,yb],[xb,yExit]], win:winB }, { d:[[xb,yExit],[x1,yExit]], win:M.decided });
      var t = M.tag || '', fs = BASE.tagFont, tw = Math.max(3.0, textMM(t, fs, 500) + 0.9);
      if(tw > C - 0.2){ fs = Math.max(SEC_PT*Math.min(1, s)/s, fs*(C - 1.1)/(tw - 0.9)); tw = Math.max(3.0, textMM(t, fs, 500) + 0.9); }   // never under the 4.6 pt floor
      out.items.push(rect('tag', S(xb - tw/2), S(yExit - tagH/2), S(tw), S(tagH), { txt:t, fs: fs*s }));
      if(opts.exits && mt.r===opts.exitRound){
        var dest = 'to Finals ' + ((model.rounds[mt.r+1] && model.rounds[mt.r+1][mt.m>>1].tag) || 'sheet');
        var label = sd===0 ? dest+' \u00bb' : '\u00ab '+dest, ew = textMM(label, BASE.tagFont, 700) + 1.8;
        var ex = sd===0 ? x1 + 0.4 : x1 - 0.4 - ew;
        out.items.push(rect('exit', S(ex), S(yExit - 1.4), S(ew), S(2.8), { txt:label, fs: BASE.tagFont*s, sd:sd }));
        out.marks.push({ x: S(sd===0 ? ex + ew + 1.4 : ex - 1.4), y: S(yExit) });
      }
    });
  }

  function displayMap(model, notes, only){
    var disp = {};
    sidesOf(model).forEach(function(sd){ if(sd.name && !disp[sd.name] && (!only || only[sd.name])) disp[sd.name] = displayName(sd.name, notes); });
    return disp;
  }

  /* The whole two-sided chart on one sheet. opts: chrome (title block text, logo, sponsors, qr), mode (force one-line names). */
  function layout(model, paper, opts){
    opts = opts || {};
    var chrome = opts.chrome || {};
    var pl = plan(model, paper, opts), s = opts.scale ? Math.min(pl.s, opts.scale) : pl.s, av = pl.av;
    var H = pl.H, B = pl.B, Bc = pl.Bc, C = BASE.C, k = pl.k;
    var notes = [], disp = displayMap(model, notes);
    var out = { kind:'two-sided', paper:paper, pw:av.pw, ph:av.ph, w:av.w, h:av.h + FOOTER, chartH:av.h, s:s, plan:pl, mode:pl.mode, items:[], paths:[], marks:[], notes:notes, sfTop:Infinity, sfBot:-Infinity, chrome:chrome, model:model };
    var S = function(v){ return v*s; };
    var Wdu = av.w/s, Hdu = av.h/s, offX = (Wdu - pl.W)/2, hb = Hdu - BASE.headRow;
    var nat = [0,1].map(function(sd){ return layoutSide(model, sd, H, 1, 0); });
    var Ks = nat.map(function(L){ var gaps = L.nSmall*BASE.g + L.nBig*BASE.G + BASE.G; return Math.max(1, (hb - L.nLeaves*H)/gaps); });
    var K = Math.min(10, Ks[0], Ks[1]); out.K = K;
    var sides = [0,1].map(function(sd){ return layoutSide(model, sd, H, K, K>1 ? BASE.G*K/2 : 0); });
    var sideOff = sides.map(function(L){ return BASE.headRow + (hb - L.height)/2; });
    var X = function(sd){ return function(col){ return sd===0 ? offX + pl.gutter + col*(B+C) : offX + pl.W - pl.gutter - col*(B+C) - B; }; };
    var Xc = offX + pl.gutter + k*(B+C), yMid = BASE.headRow + hb/2;
    var dims = { H:H, B:B, gutter:pl.gutter };
    sides.forEach(function(L, sd){ drawSide(out, model, L, sd, sideOff[sd], X(sd), s, dims, disp, { toFinal:true, yMid:yMid, entryMarks: !!opts.entryMarks, width: av.w }); });
    /* round names over the outer columns; "Semifinal" over the top semifinal box of each half */
    [0,1].forEach(function(sd){
      for(var c=0;c<k-1;c++) out.items.push(rect('rl', S(X(sd)(c)), 0, S(B), S(BASE.headRow-1.2), roundLabel(model.roundNames[c] || '', s, S(B))));
      var top = sides[sd].boxes.filter(function(b){ return b.r===model.R-2; }).sort(function(a,b){ return a.y-b.y; })[0];
      if(top && k>=1){
        var y = sideOff[sd] + top.y - H/2;
        out.items.push(rect('rl', S(X(sd)(k-1)), S(y-4.2), S(B), S(3.4), roundLabel(model.roundNames[model.R-2] || 'Semifinal', s, S(B))));
        out.sfTop = Math.min(out.sfTop, S(y-4.2));
      }
    });
    /* the Final (finalists stacked in the centre column) and the Champion */
    var F = model.rounds[model.R-1][0], Hf = H*1.3;
    var fTop = yMid - 1.2 - Hf, fBot = yMid + 1.2;
    out.items.push(rect('box', S(Xc), S(fTop), S(Bc), S(Hf), { sd:0, fin:true, side:F.a, disp: F.a.name ? disp[F.a.name] : null, r:model.R-1, m:0, slot:'a' }));
    out.items.push(rect('box', S(Xc), S(fBot), S(Bc), S(Hf), { sd:1, fin:true, side:F.b, disp: F.b.name ? disp[F.b.name] : null, r:model.R-1, m:0, slot:'b' }));
    [0,1].forEach(function(sd){ if(!sides[sd].boxes.length && sides[1-sd].boxes.length){ var y = sd===0 ? fTop : fBot; out.items.push(rect('bye', S(sd===0 ? Xc - C/2 - 2.1 : Xc + Bc + C/2 - 2.1), S(y + Hf/2 - 1.2), S(4.2), S(2.4), { fs: BASE.byeFont*s })); } });
    var flTxt = model.roundNames[model.R-1] || 'Final', flFs = flFont(flTxt, F.tag || '', s, S(Bc)), flW = Math.max(S(Bc), flWidth(flTxt, F.tag || '', s, flFs)/0.94);
    out.items.push(rect('fl', S(Xc) + S(Bc)/2 - flW/2, S(fTop-6.2), flW, S(4.6), { txt: flTxt, tag: F.tag || '', fs: flFs, tfs: BASE.tagFont*s }));
    var champBottom = S(fBot + Hf);
    if(opts.champion !== false){
      var cy = fBot + Hf + 4.2;
      var clFs = fitSans('CHAMPION', 6*s, S(Bc), 800, 0.08, secFloor(s)), clW = Math.max(S(Bc), labelMM('CHAMPION', clFs, 800, 0.08)/0.94);
      out.items.push(rect('cl', S(Xc) + S(Bc)/2 - clW/2, S(cy), clW, S(2.8), { fs: clFs }));
      var cd = model.champion ? (disp[model.champion] || displayName(model.champion, [])) : null;   // a cut name keeps its footnote number
      out.items.push(rect('champ', S(Xc), S(cy+3.6), S(Bc), S(Hf), { txt: cd ? cd.text : '', note: cd ? cd.note : null, fs: BASE.font*BASE.finalK*s, two: !!cd && textMM(noteText(cd), BASE.font*BASE.finalK*s, 700) > S(Bc) - 2.2 }));
      champBottom = S(cy + 3.6 + Hf);
    }
    /* the title block, centred over the Final and spanning the semifinal columns */
    var crownW = k>=1 ? S(2*B + 2*C + Bc) : av.w;
    var crownX = k>=1 ? S(Xc) + S(Bc)/2 - crownW/2 : 0;
    var flTop = S(fTop-6.2);
    var crownAvailH = Math.min(out.sfTop, flTop) - 2;
    var cs = Math.min(1.6, Math.max(1, av.pw/297)), cz;
    var noLogo = false;
    for(var it=0; it<40; it++){
      cz = crownSize(chrome, cs, crownW, noLogo);
      if(cz.h <= crownAvailH && cz.titleFits) break;
      if(cs < 0.45){ if(!noLogo && chrome.logo){ noLogo = true; cs = Math.min(1.6, Math.max(1, av.pw/297)); continue; } break; }   // no room: drop the logo before going smaller
      cs *= 0.93;
    }
    out.crown = rect('crown', crownX, Math.max(0, (Math.min(crownAvailH, cz.h*1.6) - cz.h)/2), crownW, cz.h, { cs:cs, lines:cz.lines, logoH:cz.logoH, ovK:cz.ovK, sbK:cz.sbK, blK:cz.blK, ovLines:cz.ovLines, sbLines:cz.sbLines, blLines:cz.blLines, minPt:cz.minPt, fitsAbove: cz.h <= crownAvailH + 0.01 });
    out.items.push(out.crown);
    /* sponsors and the live-results code: below the Champion and the lower semifinal */
    var zoneTop = Math.max(champBottom, out.sfBot) + 2.5, zoneH = av.h - zoneTop;
    var sp = chrome.sponsors || [], qr = !!chrome.qrHTML;
    if((sp.length || qr) && zoneH > 4){
      var spW = sp.reduce(function(a, x){ return a + (x.shape==='square' ? 8 : 17); }, 0) + Math.max(0, sp.length-1)*2;
      var rows = sp.length ? Math.max(1, Math.ceil(spW/Math.max(20, crownW))) : 0;
      var spH = rows ? rows*8 + (rows-1)*2 : 0;
      var qrW = 62, qrH = 20;
      var natH = (qr ? qrH : 0) + spH + (qr && rows ? 2.5 : 0), natW = Math.max(qr ? qrW : 0, rows ? Math.min(spW, Math.max(20, crownW)) : 0);
      var z = Math.min(1, (zoneH - 1)/natH, crownW/natW);
      if(qr && z*qrH < 9 && rows){ rows = 0; spH = 0; natH = qrH; natW = qrW; z = Math.min(1, (zoneH-1)/natH, crownW/natW); }   // no room for both: the code is kept
      var caption = true;
      if(qr && z < QR_CAPTION_MIN_Z){   // the caption would print under 4.6 pt: the code alone
        caption = false; qrW = qrH; natW = Math.max(qrW, rows ? Math.min(spW, Math.max(20, crownW)) : 0); z = Math.min(1, (zoneH - 1)/natH, crownW/natW);
      }
      if(z*Math.max(qr ? qrH : 8, 1) >= 5){
        var zh = natH*z, zy = av.h - zh;
        out.zone = rect('zone', crownX, zy, crownW, zh, { z:z, qr:qr, caption:caption, rows:rows, qrH:qrH*z, qrW:qrW*z, spH:spH*z });
        out.items.push(out.zone);
      }
    }
    out.items.push(rect('foot', 0, av.h, av.w, FOOTER, { fs: footFont(chrome, notes, av.w) }));
    return out;
  }

  /* ---------- split over several A4 sheets ---------- */
  /* du kept beyond the last column's connector lane of a section: the "to Finals 5-1" label and the cross mark */
  function exitW(model, c){
    var w = 0; (model.rounds[c] || []).forEach(function(M){ w = Math.max(w, textMM('to Finals '+M.tag+' \u00bb', BASE.tagFont, 700)); });
    return 0.4 + w + 1.8 + 3.4;
  }
  function subModel(model, c, fromLabels){
    var rounds = model.rounds.slice(c).map(function(round, ri){
      return round.map(function(M, mi){
        var copy = { a:Object.assign({}, M.a), b:Object.assign({}, M.b), bye:false, decided:M.decided, win:M.win, tag:M.tag };
        if(ri===0){ copy.a.seed = fromLabels[mi*2] || ''; copy.b.seed = fromLabels[mi*2+1] || ''; }
        return copy;
      });
    });
    return { R: model.R - c, kind: model.kind, noLegs: model.noLegs, rounds: rounds, roundNames: model.roundNames.slice(c), champion: model.champion };
  }
  /* Plans the split: the halves are cut at column c; the subtrees left of the cut go onto section sheets (as many as fit
     one A4 sheet at the legible scale), the rest of the chart onto one Finals sheet. null when no cut fits. */
  function splitPlan(model){
    if(model.R < 3) return null;
    var av = avail('A4'), nw = nameWidths(model), gut = gutterFor(model), legs = model.noLegs ? 0 : BASE.legs;
    var dims = geom(model, 1, nw.N1, legs, gut), k = model.R - 1, best = null;
    var capH = av.h - WING_HEAD - BASE.headRow;
    for(var c=1; c<=k-1; c++){
      var wingW = gut + c*(dims.B + BASE.C) + exitW(model, c);
      if(wingW > av.w) break;
      var half = model.rounds[c-1].length/2, ok = true, sheets = [], from = [];
      [0,1].forEach(function(sd){
        var cur = null, n = 0;
        for(var j=0;j<half;j++){
          var m = sd*half + j, L = layoutSide(model, sd, dims.H, 1, 0, [{ r:c-1, m:m }]);
          if(!L.boxes.length){ from[m] = (c-1===0 && model.rounds[0][m].bye) ? 'BYE' : ''; continue; }
          if(L.height > capH){ ok = false; return; }
          if(!cur || cur.h + BASE.G + L.height > capH){ n++; cur = { sd:sd, idx:n, roots:[], h:-BASE.G }; sheets.push(cur); }
          cur.roots.push({ r:c-1, m:m }); cur.h += BASE.G + L.height;
          from[m] = (sd===0 ? 'L' : 'R') + n + ' \u00b7 ' + model.rounds[c-1][m].tag;   // the section, and the match whose winner fills the box
        }
      });
      if(!ok) continue;
      var sub = subModel(model, c, from), fp = plan(sub, 'A4');
      if(!fp.fits) continue;
      var total = sheets.length + 1;
      if(!best || total < best.total || (total===best.total && fp.s > best.finals.s)) best = { c:c, sheets:sheets, sub:sub, finals:fp, total:total, dims:dims, wingW:wingW };
    }
    if(!best) return null;
    var counts = [0,1].map(function(sd){ return best.sheets.filter(function(x){ return x.sd===sd; }).length; });
    best.sheets.forEach(function(x){ x.of = counts[x.sd]; x.id = (x.sd===0 ? 'L' : 'R') + x.idx; });
    /* one scale for every sheet of the split, sections and Finals alike (both are legible by construction) */
    best.s = Math.min(S_MAX, av.w/best.wingW, best.finals.s, Math.min.apply(null, best.sheets.map(function(x){ return (av.h - WING_HEAD)/(x.h + BASE.headRow); })));
    return best;
  }
  /* One section sheet of a split chart: columns 0..c-1 of some subtrees of one half, at the plan's common scale. */
  function wingLayout(model, sp, sheet, opts){
    opts = opts || {};
    var av = avail('A4'), s = sp.s, dims = sp.dims, c = sp.c, sd = sheet.sd, C = BASE.C, B = dims.B, H = dims.H;
    var notes = [], disp;
    var out = { kind:'wing', paper:'A4', pw:av.pw, ph:av.ph, w:av.w, h:av.h + FOOTER, chartH:av.h, s:s, mode:1, items:[], paths:[], marks:[], notes:notes, sfTop:Infinity, sfBot:-Infinity, chrome: opts.chrome || {}, sheet:sheet, model:model };
    var Wdu = av.w/s, bodyTop = WING_HEAD/s, hb = (av.h - WING_HEAD)/s - BASE.headRow;
    var nat = layoutSide(model, sd, H, 1, 0, sheet.roots);
    var K = Math.min(4, Math.max(1, (hb - nat.nLeaves*H)/(nat.nSmall*BASE.g + nat.nBig*BASE.G + BASE.G)));
    var L = layoutSide(model, sd, H, K, K>1 ? BASE.G*K/2 : 0, sheet.roots);
    var only = {}; L.boxes.forEach(function(b){ var x = model.rounds[b.r][b.m][b.slot]; if(x.name) only[x.name] = 1; });
    disp = displayMap(model, notes, only);      // footnotes only for the names on this sheet
    var oy = bodyTop + BASE.headRow + (hb - L.height)/2;
    var offX = (Wdu - sp.wingW)/2;
    var X = function(col){ return sd===0 ? offX + dims.gutter + col*(B+C) : offX + sp.wingW - dims.gutter - col*(B+C) - B; };
    drawSide(out, model, L, sd, oy, X, s, dims, disp, { exits:true, exitRound:c-1, exitLabel:'to Finals sheet' });
    for(var col=0; col<c; col++) out.items.push(rect('rl', X(col)*s, bodyTop*s, B*s, (BASE.headRow-1.2)*s, roundLabel(model.roundNames[col] || '', s, B*s)));
    out.items.push(rect('head', 0, 0, av.w, WING_HEAD - 1.5, {}));
    out.items.push(rect('foot', 0, av.h, av.w, FOOTER, { fs: footFont(out.chrome, notes, av.w) }));
    return out;
  }

  /* ---------- checks (geometry only; the browser audit measures the printed page itself) ---------- */
  function boxText(it){
    if(it.disp) return noteText(it.disp);
    return it.side ? (it.side.ph || '') : '';
  }
  function nameArea(it, lay){
    var s = lay.s, fk = it.fin ? BASE.finalK : 1, legs = lay.model && lay.model.noLegs ? 0 : (lay.plan ? lay.plan.legs : BASE.legs);
    return it.w - (BASE.padL + BASE.padR)*s*fk - legs*s*fk - BASE.border*s;
  }
  function verify(lay){
    var boxes = lay.items.filter(function(i){ return i.k==='box'; });
    var inks = lay.items.filter(function(i){ return i.k!=='foot' && i.k!=='head'; });
    var res = { kind: lay.kind, scale: lay.s, boxes: boxes.length, minGap: Infinity, minGapSameMatch: Infinity, minGapBetween: Infinity, touching: 0, overlaps: 0, overlapList: [], overflow: 0, clipped: 0, minNamePt: Infinity, maxNamePt: 0, minBoxH: Infinity, heights: {}, twoSided: false };
    var floorIn = BASE.g*lay.s - 0.01, floorBetween = BASE.G*lay.s - 0.01;
    for(var i=0;i<boxes.length;i++){
      var a = boxes[i];
      res.minBoxH = Math.min(res.minBoxH, a.h); if(!a.fin) res.heights[a.h.toFixed(3)] = 1;
      for(var j=i+1;j<boxes.length;j++){
        var b = boxes[j];
        var hov = Math.min(a.x+a.w, b.x+b.w) - Math.max(a.x, b.x);
        if(hov <= 0.01) continue;
        var gap = Math.max(b.y - (a.y+a.h), a.y - (b.y+b.h));
        res.minGap = Math.min(res.minGap, gap);
        var same = a.r===b.r && a.m===b.m;   // the two finalists are one match too
        if(same) res.minGapSameMatch = Math.min(res.minGapSameMatch, gap); else res.minGapBetween = Math.min(res.minGapBetween, gap);
        if(gap < (same ? floorIn : floorBetween)) res.touching++;
      }
    }
    for(i=0;i<inks.length;i++) for(j=i+1;j<inks.length;j++){
      var p = inks[i], q = inks[j];
      var ox = Math.min(p.x+p.w, q.x+q.w) - Math.max(p.x, q.x), oy = Math.min(p.y+p.h, q.y+q.h) - Math.max(p.y, q.y);
      if(ox > 0.05 && oy > 0.05){ res.overlaps++; if(res.overlapList.length < 8) res.overlapList.push(p.k+'/'+q.k); }
    }
    lay.items.forEach(function(it){ if(it.x < -0.05 || it.y < -0.05 || it.x+it.w > lay.w+0.05 || it.y+it.h > lay.h+0.05) res.overflow++; });
    lay.paths.forEach(function(p){ p.d.forEach(function(pt){ var x = pt[0]*lay.s, y = pt[1]*lay.s; if(x < -0.05 || y < -0.05 || x > lay.w+0.05 || y > lay.chartH+0.05) res.overflow++; }); });
    boxes.forEach(function(it){
      var tx = boxText(it); if(!tx) return;
      var pt = BASE.font*lay.s*(it.fin ? BASE.finalK : 1);
      if(it.disp){ res.minNamePt = Math.min(res.minNamePt, pt); res.maxNamePt = Math.max(res.maxNamePt, pt); }
      var mk = it.side && it.side.mark ? textMM(it.side.mark, BASE.markFont*lay.s, 700) + 0.8*lay.s : 0;
      var need = (lay.mode===2 ? twoLineMM(tx, pt) : textMM(tx, pt, 700)) + mk;
      if(need > nameArea(it, lay) + 0.01) res.clipped++;
    });
    lay.items.filter(function(i){ return i.k==='champ' && i.txt; }).forEach(function(it){
      var need = it.two ? twoLineMM(it.txt, it.fs) : textMM(it.txt, it.fs, 700);
      if(need > it.w - 2 - 1.2 + 0.01) res.clipped++;
    });
    /* every other printed text: match numbers, BYE, seeds, round labels, Final and Champion labels, section exits, the title
       block, the footer, the code's caption. Floor 4.6 pt on a legible sheet; the chart's own text (not the title block or
       the footer, which are never shrunk) scales with a sheet shrunk on purpose. */
    res.minTextPt = Infinity; res.textUnderFloor = 0; res.textList = [];
    var chartFloor = secFloor(lay.s) - 0.005, fixedFloor = SEC_PT - 0.005;
    var note = function(pt, floor, what){ res.minTextPt = Math.min(res.minTextPt, pt); if(pt < floor){ res.textUnderFloor++; if(res.textList.length < 6) res.textList.push(what+' '+pt.toFixed(2)+' pt'); } };
    lay.items.forEach(function(it){
      if(it.k==='tag' || it.k==='bye' || it.k==='seed' || it.k==='rl' || it.k==='cl' || it.k==='exit') note(it.fs, chartFloor, it.k+(it.txt ? ' "'+it.txt+'"' : ''));
      else if(it.k==='fl'){ note(it.fs, chartFloor, 'Final label'); if(it.tag) note(it.tfs, chartFloor, 'Final match number'); }
      else if(it.k==='crown') note(it.minPt, fixedFloor, 'title block');
      else if(it.k==='foot') note(it.fs || 6, fixedFloor, 'footer');
      else if(it.k==='zone' && it.qr && it.caption) note(6.75*it.z, fixedFloor, 'code caption');
      if((it.k==='rl' || it.k==='cl' || it.k==='fl') && labelMM(it.txt || 'CHAMPION', it.fs, it.k==='cl' ? 800 : 700, it.k==='cl' ? 0.08 : 0) > it.w + 0.01 && it.k!=='fl') res.clipped++;
    });
    if(lay.crown && lay.crown.fitsAbove===false) res.overflow++;
    res.twoSided = boxes.some(function(b){ return !b.fin && b.sd===0; }) && boxes.some(function(b){ return !b.fin && b.sd===1; });
    res.heights = Object.keys(res.heights).length;
    return res;
  }

  /* ---------- HTML ---------- */
  function esc(v){ return String(v==null ? '' : v).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function mm(v){ return (+v).toFixed(3)+'mm'; }
  function pos(it){ return 'left:'+mm(it.x)+';top:'+mm(it.y)+';width:'+mm(it.w)+';height:'+mm(it.h)+';'; }
  function boxHTML(it, lay){
    var s = lay.s, side = it.side || {}, fk = it.fin ? BASE.finalK : 1, sd = it.sd;
    var legs = lay.model && lay.model.noLegs ? 0 : (lay.plan ? lay.plan.legs : BASE.legs);
    var cls = 'kb-ink kb-bx'+(sd===1 ? ' r' : '')+(lay.mode===2 ? ' two' : '')+(side.win ? ' win' : '')+(side.lose ? ' lose' : '')+(side.muted ? ' muted' : '')+(it.fin ? ' fin' : '')+(lay.model && lay.model.kind==='projected' ? ' lbl' : '')+(!side.name ? ' blank' : '');
    var pad = sd===1 ? '0 '+mm(BASE.padL*s*fk)+' 0 '+mm(BASE.padR*s*fk) : '0 '+mm(BASE.padR*s*fk)+' 0 '+mm(BASE.padL*s*fk);
    var d = it.disp, fs = (BASE.font*s*fk).toFixed(2);
    var shown = d ? esc(d.text) : '';
    if(shown && lay.mode===2) shown = shown.replace(/\//g, '/&#8203;');      // a pair name may break after its "/"
    var text = d ? shown+(d.note ? '<sup>'+d.note+'</sup>' : '') : (side.ph ? '<span class="kb-ph">'+esc(side.ph)+'</span>' : '');
    var html = '<span class="kb-nm"'+(d && d.note ? ' data-trunc="1"' : '')+(side.name ? ' title="'+esc(side.name)+'"' : '')+' style="padding:'+pad+';font-size:'+fs+'pt">'+text+'</span>';
    if(side.mark) html += '<span class="kb-mk" style="font-size:'+(BASE.markFont*s).toFixed(2)+'pt;padding:0 '+mm(0.4*s)+'">'+esc(side.mark)+'</span>';
    if(legs) html += '<span class="kb-lg" style="width:'+mm(legs*s*fk)+';font-size:'+fs+'pt">'+esc(side.legs||'')+'</span>';
    return '<div class="'+cls+'" data-r="'+it.r+'" data-m="'+it.m+'" data-s="'+it.slot+'" style="'+pos(it)+'">'+html+'</div>';
  }
  function crownHTML(it, lay){
    var cs = it.cs, c = lay.chrome || {}, L = crownLines(c);
    var logo = '';
    if(c.logo && it.logoH){ var lh = it.logoH, lw = Math.min(lh*(c.logo.aspect||1), lh*2.6); logo = '<div class="kb-logo" style="width:'+mm(lw)+';height:'+mm(lh)+';margin-bottom:'+mm(1.4*cs)+'"><img src="'+c.logo.src+'" alt=""></div>'; }
    var blFs = (7*cs*(it.blK||1)).toFixed(2), two = function(n){ return n > 1 ? ' two' : ''; };
    var bl = it.blLines > 1 && L.dt
      ? '<div class="kb-bl" style="font-size:'+blFs+'pt">'+esc(L.bl)+'</div><div class="kb-bl'+two(it.blLines-1)+'" style="font-size:'+blFs+'pt"><span>'+esc(L.dt)+'</span></div>'
      : '<div class="kb-bl'+two(it.blLines)+'" style="font-size:'+blFs+'pt">'+esc(L.bl)+(L.dt ? ' <span>'+esc(L.dt)+'</span>' : '')+'</div>';
    return '<div class="kb-ink kb-crown" style="'+pos(it)+'">'+logo+
      '<div class="kb-ov'+two(it.ovLines)+'" style="font-size:'+(6*cs*(it.ovK||1)).toFixed(2)+'pt">'+esc(L.ov)+'</div>'+
      '<div class="kb-tt'+(it.lines>1 ? ' two' : '')+'" style="font-size:'+(Math.max(14*cs, SEC_PT)).toFixed(2)+'pt;margin:'+mm(0.8*cs)+' 0">'+esc(L.tt)+'</div>'+
      '<div class="kb-sb'+two(it.sbLines)+'" style="font-size:'+(6.5*cs*(it.sbK||1)).toFixed(2)+'pt">'+esc(L.sb)+'</div>'+
      '<div class="kb-rule" style="margin:'+mm(1.6*cs)+' 0 '+mm(1.4*cs)+';height:'+mm(0.7*cs)+'"></div>'+bl+'</div>';
  }
  /* The live-results code: with its caption ("Live results / Scan, or go to ...") when the caption still prints at 4.6 pt
     or more (its text is 9 px = 6.75 pt at full size), else the code alone. */
  var QR_CAPTION_MIN_Z = SEC_PT/6.75;
  function zoneHTML(it, lay){
    var c = lay.chrome || {}, z = it.z, h = '';
    if(it.qr){
      if(it.caption) h += '<div class="kb-qr" style="width:'+mm(it.qrW)+';height:'+mm(it.qrH)+'"><div style="width:62mm;height:20mm;transform:scale('+z.toFixed(4)+');transform-origin:0 0">'+c.qrHTML+'</div></div>';
      else { var svg = (/<svg[\s\S]*<\/svg>/.exec(c.qrHTML || '') || [''])[0]; h += '<div class="kb-qr" style="width:'+mm(it.qrH)+';height:'+mm(it.qrH)+'"><div style="width:20mm;height:20mm;transform:scale('+z.toFixed(4)+');transform-origin:0 0">'+svg+'</div></div>'; }
    }
    if(it.rows) h += '<div class="kb-sps" style="gap:'+mm(2*z)+';margin-top:'+mm(it.qr ? 2.5*z : 0)+'">'+(c.sponsors||[]).map(function(x){ var sq = x.shape==='square'; return '<div class="kb-sp" style="width:'+mm((sq ? 8 : 17)*z)+';height:'+mm(8*z)+'"><img src="'+x.src+'" alt=""></div>'; }).join('')+'</div>';
    return '<div class="kb-ink kb-zone" style="'+pos(it)+'">'+h+'</div>';
  }
  function footText(chrome, notes){
    var fn = notes.length ? ' <b>Full names:</b> '+notes.map(function(n){ return '<sup>'+n.n+'</sup> '+esc(n.full); }).join('; ')+'.' : '';
    return ((chrome || {}).legend || '') + fn;
  }
  /* The footer's font: 6 pt, smaller for a long legend, never under the 4.6 pt floor (the strip clips what is left). */
  function footFont(chrome, notes, width){
    var plain = footText(chrome, notes).replace(/<[^>]*>/g, ''), room = width - 36, fs = 6;
    while(fs > SEC_PT + 0.05 && sans(plain, fs, 400)/room > Math.floor((FOOTER - 1.2)/(fs*PT*1.22))) fs -= 0.2;
    return Math.max(SEC_PT, fs);
  }
  function footHTML(it, lay){
    var c = lay.chrome || {};
    return '<div class="kb-foot" style="'+pos(it)+'"><div class="kb-fn" style="font-size:'+(it.fs || 6).toFixed(1)+'pt">'+footText(c, lay.notes)+'</div>'+(c.credit || '')+'</div>';
  }
  function pathsSVG(lay){
    var s = lay.s, lineW = Math.max(0.22, 0.3*s), winW = Math.max(0.3, 0.45*s);
    var d0 = [], d1 = [];
    lay.paths.forEach(function(p){ var d = p.d.map(function(pt, i){ return (i ? 'L' : 'M')+(pt[0]*s).toFixed(3)+' '+(pt[1]*s).toFixed(3); }).join(''); (p.win ? d1 : d0).push(d); });
    var marks = lay.marks.map(function(m){ return 'M'+(m.x-1.6).toFixed(3)+' '+m.y.toFixed(3)+'H'+(m.x+1.6).toFixed(3)+'M'+m.x.toFixed(3)+' '+(m.y-1.6).toFixed(3)+'V'+(m.y+1.6).toFixed(3); }).join('');
    return '<svg class="kb-conn" width="'+mm(lay.w)+'" height="'+mm(lay.chartH)+'" viewBox="0 0 '+lay.w.toFixed(3)+' '+lay.chartH.toFixed(3)+'" aria-hidden="true">'+
      (d0.length ? '<path d="'+d0.join('')+'" fill="none" stroke="#8e9db0" stroke-width="'+lineW.toFixed(3)+'" stroke-linejoin="round"/>' : '')+
      (d1.length ? '<path d="'+d1.join('')+'" fill="none" stroke="#1d8a4a" stroke-width="'+winW.toFixed(3)+'" stroke-linejoin="round"/>' : '')+
      (marks ? '<path class="kb-mark" d="'+marks+'" fill="none" stroke="#10233e" stroke-width="0.25"/>' : '')+'</svg>';
  }
  /* The printed sheet. chrome: overline/title/sub/label/detail, logo {src, aspect}, sponsors [{src, shape}], qrHTML, legend,
     credit, cls (extra classes), data (data-* attributes for the sheet). Image sources must already be safe (the app passes
     imgSrc() values). */
  function sheetHTML(lay){
    var c = lay.chrome || {}, s = lay.s;
    var html = '';
    lay.items.forEach(function(it){
      switch(it.k){
        case 'box': html += boxHTML(it, lay); break;
        case 'tag': html += '<div class="kb-ink kb-tag" style="'+pos(it)+'font-size:'+it.fs.toFixed(2)+'pt">'+esc(it.txt)+'</div>'; break;
        case 'exit': html += '<div class="kb-ink kb-exit" style="'+pos(it)+'font-size:'+it.fs.toFixed(2)+'pt">'+esc(it.txt)+'</div>'; break;
        case 'bye': html += '<div class="kb-ink kb-bye" style="'+pos(it)+'font-size:'+it.fs.toFixed(2)+'pt">BYE</div>'; break;
        case 'seed': html += '<div class="kb-ink kb-seed '+(it.al==='r' ? 'r' : 'l')+'" style="'+pos(it)+'font-size:'+it.fs.toFixed(2)+'pt">'+esc(it.txt)+'</div>'; break;
        case 'rl': html += '<div class="kb-ink kb-rl" style="'+pos(it)+'font-size:'+it.fs.toFixed(2)+'pt">'+esc(it.txt)+'</div>'; break;
        case 'fl': html += '<div class="kb-ink kb-fl" style="'+pos(it)+'font-size:'+it.fs.toFixed(2)+'pt">'+esc(it.txt)+(it.tag ? ' <span class="kb-ftag" style="font-size:'+it.tfs.toFixed(2)+'pt">'+esc(it.tag)+'</span>' : '')+'</div>'; break;
        case 'cl': html += '<div class="kb-ink kb-cl" style="'+pos(it)+'font-size:'+it.fs.toFixed(2)+'pt">CHAMPION</div>'; break;
        case 'champ': html += '<div class="kb-ink kb-champ'+(it.two ? ' two' : '')+'" style="'+pos(it)+'font-size:'+it.fs.toFixed(2)+'pt"><span class="kb-nm">'+esc(it.txt)+(it.note ? '<sup>'+it.note+'</sup>' : '')+'</span></div>'; break;
        case 'crown': html += crownHTML(it, lay); break;
        case 'zone': html += zoneHTML(it, lay); break;
        case 'foot': html += footHTML(it, lay); break;
        case 'head': html += '<div class="kb-head" style="'+pos(it)+'"><span>'+(c.headLeft||'')+'</span><span>'+(c.headRight||'')+'</span></div>'; break;
      }
    });
    html += pathsSVG(lay);      // last in the page, painted under the boxes (z-index): a QR code in the sheet stays its first image
    var data = c.data || {};
    var attrs = Object.keys(data).map(function(k){ return ' data-'+k+'="'+esc(data[k])+'"'; }).join('');
    return '<div class="print-sheet mko-print-sheet kb-sheet mko-paper-'+lay.paper+(c.cls ? ' '+c.cls : '')+'" data-kb="'+lay.kind+'" data-paper="'+lay.paper+'" data-scale="'+s.toFixed(4)+'" data-mode="'+lay.mode+'"'+attrs+
      ' style="width:'+mm(lay.w)+';height:'+mm(lay.h)+'">'+html+'</div>';
  }

  if(browser()) loadFonts();
  return { PT:PT, PAPERS:PAPERS, ORDER:ORDER, MARGIN:MARGIN, FOOTER:FOOTER, WING_HEAD:WING_HEAD, S_MAX:S_MAX, NAME_CAP:NAME_CAP, SOFT_PT:SOFT_PT, BASE:BASE,
    ready:ready, whenReady:whenReady, textMM:textMM, twoLineMM:twoLineMM, displayName:displayName,
    fromBracket:fromBracket, nameWidths:nameWidths, layoutSide:layoutSide, geom:geom, plan:plan, recommend:recommend,
    layout:layout, splitPlan:splitPlan, wingLayout:wingLayout, subModel:subModel, verify:verify, sheetHTML:sheetHTML, esc:esc };
})();

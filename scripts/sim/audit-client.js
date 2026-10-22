/* Layout audit, embedded in every simulation page. It measures the sheets as the browser lays them out (at 100%: the screen
   zoom wrapper is switched to 1 while measuring) and writes a short report at the top of the page. With ?audit=1 in the address
   it also replaces the page with the report as base64 JSON, which scripts/sim/run-audit.js reads from a headless browser. */
(function () {
  var MM = 25.4 / 96, TOUCH_PX = 4;
  function R(el) { var r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; }
  function r1(x) { return Math.round(x * 10) / 10; }
  function paperMm(sheet) { var w = sheet.offsetWidth * MM, h = sheet.offsetHeight * MM; return { w: Math.round(w), h: Math.round(h) }; }

  /* Name boxes of the mirrored bracket chart (and the final/champion boxes), or the match cards of the one-sided projected chart. */
  function boxesOf(sheet) {
    var mko = sheet.querySelectorAll('.mko-artboard div[style*="border-radius:6px"]');
    var list = [];
    Array.prototype.forEach.call(mko, function (el) { if (!el.querySelector('div[style*="border-radius:6px"]')) list.push(el); });
    if (list.length) return { kind: 'mko', list: list };
    var proj = sheet.querySelectorAll('.bracket-match');
    return { kind: proj.length ? 'projected' : 'none', list: Array.prototype.slice.call(proj) };
  }

  function pairs(rects) {
    var minGap = null, overlaps = 0, touches = 0, worstOverlap = 0;
    var order = rects.map(function (r, i) { return i; }).sort(function (a, b) { return rects[a].l - rects[b].l; });
    for (var i = 0; i < order.length; i++) {
      var a = rects[order[i]];
      for (var j = i + 1; j < order.length; j++) {
        var b = rects[order[j]];
        if (b.l - a.r > 40) break;   // sorted by left edge: nothing further right can be near
        var dx = Math.max(a.l - b.r, b.l - a.r), dy = Math.max(a.t - b.b, b.t - a.b);
        if (dx < -0.5 && dy < -0.5) { overlaps++; worstOverlap = Math.max(worstOverlap, Math.min(-dx, -dy)); continue; }
        if (dx >= 0 && dy >= 0) continue;                  // only diagonal neighbours
        var gap = dx < 0 ? dy : dx;                        // the distance along the axis where they do not overlap
        if (minGap === null || gap < minGap) minGap = gap;
        if (gap < TOUCH_PX) touches++;
      }
    }
    return { minGap: minGap, overlaps: overlaps, touches: touches, worstOverlap: worstOverlap };
  }

  /* The two-sided bracket sheets of bracket-print.js (class kb-sheet): every printed item is an absolutely placed .kb-ink.
     Checks, in mm: no two printed items overlap; boxes sharing a column keep the floors (1.6 mm inside a match, 3.0 mm
     between matches, both times the print scale when the chart was shrunk on purpose); nothing leaves the sheet; no name is
     clipped; the name size (7 pt floor when the sheet is legible); one box height (uniform scale); both halves present. */
  function auditKb(sheet, out) {
    var sr = R(sheet), toMm = function (r) { return { l: (r.l - sr.l) * MM, t: (r.t - sr.t) * MM, r: (r.r - sr.l) * MM, b: (r.b - sr.t) * MM, w: r.w * MM, h: r.h * MM }; };
    var scale = parseFloat(sheet.getAttribute('data-scale')) || 1, legible = scale >= 0.999;
    var inks = Array.prototype.map.call(sheet.querySelectorAll('.kb-ink, .kb-foot, .kb-head'), function (e) { return { e: e, m: toMm(R(e)) }; });
    var boxes = inks.filter(function (o) { return o.e.classList.contains('kb-bx'); });
    var k = { kind: sheet.getAttribute('data-kb'), paper: sheet.getAttribute('data-paper'), scale: scale, legible: legible, boxes: boxes.length,
      overlaps: 0, overlapList: [], touching: 0, minGapMm: null, minGapInMatchMm: null, minGapBetweenMm: null, outside: 0, clipped: 0, clipList: [], minNamePt: null, maxNamePt: null, boxHeightsMm: [] };
    var fIn = 1.6 * Math.min(1, scale) - 0.05, fBetween = 3.0 * Math.min(1, scale) - 0.05;
    for (var i = 0; i < inks.length; i++) for (var j = i + 1; j < inks.length; j++) {
      var a = inks[i].m, b = inks[j].m;
      var ox = Math.min(a.r, b.r) - Math.max(a.l, b.l), oy = Math.min(a.b, b.b) - Math.max(a.t, b.t);
      if (ox > 0.05 && oy > 0.05) { k.overlaps++; if (k.overlapList.length < 6) k.overlapList.push(inks[i].e.className.replace('kb-ink ', '') + ' x ' + inks[j].e.className.replace('kb-ink ', '') + ' "' + (inks[i].e.textContent || '').slice(0, 16) + '"/"' + (inks[j].e.textContent || '').slice(0, 16) + '"'); }
    }
    var mins = function (cur, v) { return cur === null || v < cur ? v : cur; };
    for (i = 0; i < boxes.length; i++) for (j = i + 1; j < boxes.length; j++) {
      var p = boxes[i], q = boxes[j], pm = p.m, qm = q.m;
      if (Math.min(pm.r, qm.r) - Math.max(pm.l, qm.l) <= 0.05) continue;
      var gap = Math.max(qm.t - pm.b, pm.t - qm.b);
      var same = p.e.getAttribute('data-r') === q.e.getAttribute('data-r') && p.e.getAttribute('data-m') === q.e.getAttribute('data-m');
      k.minGapMm = mins(k.minGapMm, gap);
      if (same) k.minGapInMatchMm = mins(k.minGapInMatchMm, gap); else k.minGapBetweenMm = mins(k.minGapBetweenMm, gap);
      if (gap < (same ? fIn : fBetween)) k.touching++;
    }
    var W = sr.w * MM, H = sr.h * MM;   // not offsetWidth: it is rounded to whole pixels
    inks.forEach(function (o) { var m = o.m; if (m.l < -0.05 || m.t < -0.05 || m.r > W + 0.05 || m.b > H + 0.05) k.outside++; });
    var heights = {};
    boxes.forEach(function (o) {
      if (!o.e.classList.contains('fin')) heights[o.m.h.toFixed(2)] = 1;
      var nm = o.e.querySelector('.kb-nm'); if (!nm || !nm.textContent.trim()) return;
      var pt = parseFloat(getComputedStyle(nm).fontSize) * 0.75;
      if (o.e.querySelector('.kb-nm sup') || nm.title) { k.minNamePt = mins(k.minNamePt, pt); k.maxNamePt = k.maxNamePt === null || pt > k.maxNamePt ? pt : k.maxNamePt; }
      if (nm.scrollWidth > nm.clientWidth + 0.5 || nm.scrollHeight > nm.clientHeight + 1) { k.clipped++; if (k.clipList.length < 5) k.clipList.push(nm.textContent); }
    });
    sheet.querySelectorAll('.kb-tag, .kb-rl, .kb-fl, .kb-cl, .kb-seed, .kb-exit, .kb-ov, .kb-tt, .kb-sb, .kb-bl').forEach(function (e) {
      if (e.scrollWidth > e.clientWidth + 0.5) { k.clipped++; if (k.clipList.length < 5) k.clipList.push('[' + e.className + '] ' + e.textContent.slice(0, 24)); }
    });
    k.boxHeightsMm = Object.keys(heights);
    /* every printed text against the spec's floor for secondary text: 4.6 pt (times the scale for the chart's own text on a
       sheet shrunk on purpose; the title block, footer and header strip are never shrunk). The QR code's caption is scaled
       with a transform and checked by the layout itself. */
    k.minTextPt = null; k.textUnderFloor = 0; k.textList = [];
    Array.prototype.forEach.call(sheet.querySelectorAll('.kb-ink, .kb-ink *, .kb-foot, .kb-foot *, .kb-head, .kb-head *'), function (e) {
      if (e.closest('.kb-qr')) return;
      var own = Array.prototype.some.call(e.childNodes, function (n) { return n.nodeType === 3 && n.textContent.trim(); });
      if (!own) return;
      var pt = parseFloat(getComputedStyle(e).fontSize) * 0.75;
      var fixed = !!e.closest('.kb-crown, .kb-foot, .kb-head');
      var floor = fixed ? 4.6 : 4.6 * Math.min(1, scale);
      k.minTextPt = mins(k.minTextPt, pt);
      if (pt < floor - 0.01) { k.textUnderFloor++; if (k.textList.length < 5) k.textList.push((e.className || e.tagName) + ' "' + e.textContent.trim().slice(0, 16) + '" ' + pt.toFixed(2) + 'pt'); }
    });
    var left = boxes.some(function (o) { return !o.e.classList.contains('fin') && !o.e.classList.contains('r'); });
    var right = boxes.some(function (o) { return !o.e.classList.contains('fin') && o.e.classList.contains('r'); });
    k.shape = left && right ? 'two-sided' : (left || right ? 'one half (section sheet)' : 'final only');
    ['minGapMm', 'minGapInMatchMm', 'minGapBetweenMm', 'minNamePt', 'maxNamePt', 'minTextPt'].forEach(function (n) { if (k[n] !== null) k[n] = Math.round(k[n] * 100) / 100; });
    k.ok = k.overlaps === 0 && k.touching === 0 && k.outside === 0 && k.clipped === 0 && k.textUnderFloor === 0 && (!legible || k.minNamePt === null || k.minNamePt >= 6.95) && k.boxHeightsMm.length <= 1;
    out.kb = k;
    out.shape = k.shape;
    out.scale = scale;
  }

  function auditSheet(w, idx) {
    var sheet = w.querySelector('.print-sheet');
    var sr = R(sheet), type = w.getAttribute('data-type'), label = w.getAttribute('data-label');
    var out = { idx: idx + 1, type: type, label: label, paperMm: paperMm(sheet) };
    /* does the sheet's content stay on the paper? */
    var sx = sheet.scrollWidth - sheet.clientWidth, sy = sheet.scrollHeight - sheet.clientHeight;
    var maxB = sr.t, maxR = sr.l;
    Array.prototype.forEach.call(sheet.querySelectorAll('*'), function (el) {
      var r = el.getBoundingClientRect(); if (!r.width && !r.height) return;
      if (r.bottom > maxB) maxB = r.bottom; if (r.right > maxR) maxR = r.right;
    });
    var cs = getComputedStyle(sheet), padB = parseFloat(cs.paddingBottom) || 0, padR = parseFloat(cs.paddingRight) || 0;
    out.overflow = {
      scrollX: r1(Math.max(0, sx)), scrollY: r1(Math.max(0, sy)),
      spillBottomPx: r1(Math.max(0, maxB - sr.b)), spillRightPx: r1(Math.max(0, maxR - sr.r)),
      intoPaddingBottomPx: r1(Math.max(0, maxB - (sr.b - padB))),
    };
    out.overflow.any = out.overflow.scrollX > 1 || out.overflow.scrollY > 1 || out.overflow.spillBottomPx > 1 || out.overflow.spillRightPx > 1;
    if (sheet.classList.contains('kb-sheet')) { auditKb(sheet, out); return out; }
    /* running order: every board column and group inside the sheet, nothing clipped */
    if (sheet.classList.contains('ro-sheet') && sheet.querySelector('.ro-col')) {
      var rr = R(sheet), outside = 0, clip = 0;
      Array.prototype.forEach.call(sheet.querySelectorAll('.ro-col, .ro-grp, .ro-m, .footer'), function (e) { var r = R(e); if (r.b > rr.b + 0.5 || r.r > rr.r + 0.5) outside++; });
      Array.prototype.forEach.call(sheet.querySelectorAll('.ro-m, .ro-grp-h b, .ro-col-h b'), function (e) { if (e.scrollWidth > e.clientWidth + 0.5) clip++; });
      var cols = sheet.querySelectorAll('.ro-col'), lastBottom = 0;
      Array.prototype.forEach.call(cols, function (c) { var last = c.lastElementChild; if (last && R(last).b > R(c).b + 0.5) outside++; lastBottom = Math.max(lastBottom, R(c).b); });
      var foot = sheet.querySelector('.footer'); if (foot && lastBottom > R(foot).t + 0.5) outside++;
      out.runningOrder = { columns: cols.length, groups: sheet.querySelectorAll('.ro-grp:not(.ro-empty)').length, matches: sheet.querySelectorAll('.ro-m').length, outside: outside, clipped: clip };
      return out;
    }
    /* the bracket */
    var body = sheet.querySelector('.mko-sheet-body');
    if (body && body.firstElementChild) {
      var b = R(body), a = R(body.firstElementChild);
      out.artboardClipPx = r1(Math.max(0, a.r - b.r, b.l - a.l, a.b - b.b, b.t - a.t));
    }
    var bx = boxesOf(sheet);
    if (bx.kind === 'mko') {
      out.shape = 'two-sided';
      var art = sheet.querySelector('.mko-artboard'); var scale = art ? art.getBoundingClientRect().width / art.offsetWidth : 1;
      out.scale = Math.round(scale * 1000) / 1000;
    } else if (bx.kind === 'projected') {
      out.shape = 'one-sided';
      out.columns = sheet.querySelectorAll('.bracket-col').length;
    }
    if (bx.kind !== 'none') {
      var rects = bx.list.map(R);
      var p = pairs(rects);
      out.boxes = { kind: bx.kind, count: bx.list.length, minGapPx: p.minGap === null ? null : r1(p.minGap), minGapMm: p.minGap === null ? null : r1(p.minGap * MM), overlaps: p.overlaps, touches: p.touches, worstOverlapPx: r1(p.worstOverlap) };
      var minH = rects.reduce(function (m, r) { return Math.min(m, r.h); }, 1e9);
      out.boxes.minBoxHeightPx = r1(minH);
      var kinds = { named: 0, bye: 0, placeholder: 0, empty: 0 };
      bx.list.forEach(function (box) {
        var nm = box.querySelector('span[style*="flex:1"]');
        var tx = (nm ? nm.textContent : box.textContent).trim();
        if (bx.kind === 'projected') { kinds.placeholder++; return; }
        if (!tx) kinds.empty++; else if (tx === 'BYE') kinds.bye++; else if (/^Winner of\s*Group|no winner$|^Gp \S+ (winner|: none)/.test(tx)) kinds.placeholder++; else kinds.named++;
      });
      out.boxes.kinds = kinds;
      /* text that does not fit: ellipsis or line clamp truncation, or content wider than its box */
      var clipped = 0, samples = [], minFont = null, texts = 0;
      bx.list.forEach(function (box) {
        var spans = box.querySelectorAll('span');
        Array.prototype.forEach.call(spans, function (s) {
          if (!s.textContent) return;
          var st = s.getAttribute('style') || '';
          var isName = /text-overflow:ellipsis|line-clamp/.test(st) || s.parentNode === box && /flex:1/.test(st);
          if (isName) {
            texts++;
            var fs = parseFloat(getComputedStyle(s).fontSize);
            var sc = out.scale || 1;
            if (fs) { var eff = fs * sc; if (minFont === null || eff < minFont) minFont = eff; }
            if (s.scrollWidth > s.clientWidth + 1 || s.scrollHeight > s.clientHeight + 2) { clipped++; if (samples.length < 6) samples.push(s.textContent); }
          }
        });
        if (box.scrollWidth > box.clientWidth + 1) { if (samples.length < 6 && samples.indexOf('[box] ' + box.textContent) < 0) samples.push('[box] ' + box.textContent.slice(0, 30)); clipped++; }
      });
      out.text = { names: texts, clipped: clipped, samples: samples, minEffectiveFontPx: minFont === null ? null : r1(minFont), minEffectiveFontPt: minFont === null ? null : r1(minFont * 0.75) };
    }
    /* lineup cards */
    if (type === 'lineup') {
      var cardOver = 0;
      Array.prototype.forEach.call(sheet.querySelectorAll('.lineup-card'), function (c) { if (c.scrollHeight > c.clientHeight + 1) cardOver++; });
      out.lineupCardsOverflowing = cardOver;
    }
    return out;
  }

  function summarise(res) {
    var br = res.sheets.filter(function (s) { return s.boxes; });
    var o = { sheets: res.sheets.length, bracketSheets: br.length,
      overlapSheets: br.filter(function (s) { return s.boxes.overlaps > 0; }).length,
      touchSheets: br.filter(function (s) { return s.boxes.touches > 0; }).length,
      clippedSheets: br.filter(function (s) { return s.text && s.text.clipped > 0; }).length,
      overflowSheets: res.sheets.filter(function (s) { return s.overflow.any; }).length,
      artboardClipSheets: res.sheets.filter(function (s) { return s.artboardClipPx > 1; }).length,
      lineupOverflow: res.sheets.filter(function (s) { return s.lineupCardsOverflowing > 0; }).length };
    var gaps = br.map(function (s) { return s.boxes.minGapPx; }).filter(function (g) { return g !== null; });
    o.minGapPx = gaps.length ? Math.min.apply(null, gaps) : null;
    var kb = res.sheets.filter(function (s) { return s.kb; });
    o.kbSheets = kb.length;
    o.kbOverlaps = kb.reduce(function (n, s) { return n + s.kb.overlaps; }, 0);
    o.kbTouching = kb.reduce(function (n, s) { return n + s.kb.touching; }, 0);
    o.kbOutside = kb.reduce(function (n, s) { return n + s.kb.outside; }, 0);
    o.kbClipped = kb.reduce(function (n, s) { return n + s.kb.clipped; }, 0);
    o.kbBelowFloor = kb.filter(function (s) { return s.kb.legible && s.kb.minNamePt !== null && s.kb.minNamePt < 6.95; }).length;
    o.kbNotUniform = kb.filter(function (s) { return s.kb.boxHeightsMm.length > 1; }).length;
    o.kbTextUnderFloor = kb.reduce(function (n, s) { return n + s.kb.textUnderFloor; }, 0);
    var kt = kb.map(function (s) { return s.kb.minTextPt; }).filter(function (g) { return g !== null; });
    o.kbMinTextPt = kt.length ? Math.min.apply(null, kt) : null;
    o.kbShrunk = kb.filter(function (s) { return !s.kb.legible; }).length;
    var kg = kb.map(function (s) { return s.kb.minGapMm; }).filter(function (g) { return g !== null; });
    o.kbMinGapMm = kg.length ? Math.min.apply(null, kg) : null;
    var kp = kb.map(function (s) { return s.kb.minNamePt; }).filter(function (g) { return g !== null; });
    o.kbMinNamePt = kp.length ? Math.min.apply(null, kp) : null;
    var ro = res.sheets.filter(function (s) { return s.runningOrder; });
    o.runningOrderSheets = ro.length;
    o.runningOrderBad = ro.filter(function (s) { return s.runningOrder.outside || s.runningOrder.clipped; }).length;
    return o;
  }

  function show(res) {
    var el = document.getElementById('sim-audit'); if (!el) return;
    var s = res.summary;
    var bad = s.overlapSheets || s.touchSheets || s.clippedSheets || s.overflowSheets || s.artboardClipSheets || s.lineupOverflow ||
      s.kbOverlaps || s.kbTouching || s.kbOutside || s.kbClipped || s.kbBelowFloor || s.kbNotUniform || s.kbTextUnderFloor || s.runningOrderBad;
    el.className = 'sim-audit' + (bad ? ' bad' : '');
    var lines = ['Layout audit (measured in this browser at 100%, fonts: ' + res.fonts.split(',')[0] + '): ' + s.sheets + ' sheets, ' + s.bracketSheets + ' with Group Boards bracket boxes, ' + s.kbSheets + ' two-sided bracket sheets.'];
    if (s.kbSheets) lines.push('Two-sided bracket sheets: overlapping items ' + s.kbOverlaps + ' | boxes closer than the floors ' + s.kbTouching + ' | smallest box gap ' + (s.kbMinGapMm === null ? 'n/a' : s.kbMinGapMm + ' mm') +
      ' | items off the sheet ' + s.kbOutside + ' | clipped text ' + s.kbClipped + ' | smallest name ' + (s.kbMinNamePt === null ? 'n/a' : s.kbMinNamePt + ' pt') + ' | legible sheets under 7 pt ' + s.kbBelowFloor + ' | shrunk on purpose ' + s.kbShrunk + ' | mixed box heights ' + s.kbNotUniform + ' | text under 4.6 pt ' + s.kbTextUnderFloor + ' | smallest text ' + (s.kbMinTextPt === null ? 'n/a' : s.kbMinTextPt + ' pt'));
    if (s.runningOrderSheets) lines.push('Running order: ' + s.runningOrderSheets + ' sheet(s), ' + s.runningOrderBad + ' with content off the sheet or clipped.');
    if (s.bracketSheets) lines.push('Group Boards charts: name boxes overlapping ' + s.overlapSheets + ' sheet(s) | touching (gap under ' + TOUCH_PX + 'px): ' + s.touchSheets + ' sheet(s) | smallest gap ' + (s.minGapPx === null ? 'n/a' : s.minGapPx + 'px') +
      ' | clipped or truncated text: ' + s.clippedSheets + ' sheet(s)');
    lines.push('Sheets whose content leaves the paper: ' + s.overflowSheets + ' | bracket clipped by its frame: ' + s.artboardClipSheets + ' | lineup cards overflowing: ' + s.lineupOverflow);
    res.sheets.forEach(function (x) {
      var flags = [];
      if (x.kb) {
        if (x.kb.overlaps) flags.push(x.kb.overlaps + ' overlapping items (' + x.kb.overlapList.join('; ') + ')');
        if (x.kb.touching) flags.push(x.kb.touching + ' box pairs under the floor');
        if (x.kb.outside) flags.push(x.kb.outside + ' items off the sheet');
        if (x.kb.clipped) flags.push(x.kb.clipped + ' clipped (' + x.kb.clipList.join('; ') + ')');
        if (x.kb.legible && x.kb.minNamePt !== null && x.kb.minNamePt < 6.95) flags.push('names ' + x.kb.minNamePt + ' pt');
        if (x.kb.boxHeightsMm.length > 1) flags.push('box heights ' + x.kb.boxHeightsMm.join('/'));
        if (x.kb.textUnderFloor) flags.push(x.kb.textUnderFloor + ' text(s) under 4.6 pt (' + x.kb.textList.join('; ') + ')');
      }
      if (x.runningOrder && (x.runningOrder.outside || x.runningOrder.clipped)) flags.push('running order: ' + x.runningOrder.outside + ' off the sheet, ' + x.runningOrder.clipped + ' clipped');
      if (x.boxes && x.boxes.overlaps) flags.push(x.boxes.overlaps + ' overlaps');
      if (x.boxes && x.boxes.touches) flags.push(x.boxes.touches + ' touching');
      if (x.text && x.text.clipped) flags.push(x.text.clipped + ' clipped');
      if (x.overflow.any) flags.push('overflow ' + Math.max(x.overflow.scrollY, x.overflow.spillBottomPx, x.overflow.scrollX, x.overflow.spillRightPx) + 'px');
      if (x.artboardClipPx > 1) flags.push('frame clip ' + x.artboardClipPx + 'px');
      if (x.lineupCardsOverflowing) flags.push('lineup card overflows');
      if (flags.length) lines.push('#' + x.idx + ' ' + x.type + ' "' + x.label + '": ' + flags.join(', '));
    });
    el.innerHTML = '';
    var pre = document.createElement('pre'); pre.textContent = lines.join('\n'); el.appendChild(pre);
  }

  function runAudit() {
    var root = document.documentElement, old = root.style.getPropertyValue('--sim-zoom');
    root.style.setProperty('--sim-zoom', '1');
    var wraps = Array.prototype.slice.call(document.querySelectorAll('.sim-sheet'));
    var res = { fonts: getComputedStyle(document.body).fontFamily || '', userAgent: navigator.userAgent, sheets: wraps.map(auditSheet) };
    res.summary = summarise(res);
    /* a sheet whose content runs off the paper: leave room on this page so the next sheet is not drawn over it */
    res.sheets.forEach(function (x, i) { if (x.overflow.spillBottomPx > 1) wraps[i].style.paddingBottom = Math.ceil(x.overflow.spillBottomPx + 10) + 'px'; });
    if (old) root.style.setProperty('--sim-zoom', old); else root.style.removeProperty('--sim-zoom');
    window.__simAudit = res;
    show(res);
    if (/[?&]audit=1/.test(location.search)) {
      var json = JSON.stringify(res), b64 = btoa(unescape(encodeURIComponent(json)));
      document.body.innerHTML = '<pre id="audit-json">' + b64 + '</pre>';
    }
  }

  /* zoom slider (screen only) */
  var range = document.getElementById('sim-zoom-range'), val = document.getElementById('sim-zoom-val');
  function setZoom(z) { document.documentElement.style.setProperty('--sim-zoom', z); if (val) val.textContent = Math.round(z * 100) + '%'; }
  if (range) range.addEventListener('input', function () { setZoom(range.value); });
  if (/[?&]audit=1/.test(location.search)) { /* measured at 100% */ } else { try { setZoom(parseFloat(range ? range.value : '.55')); } catch (e) { /* ignore */ } }

  function start() { try { runAudit(); } catch (e) { var el = document.getElementById('sim-audit'); if (el) el.textContent = 'Layout audit failed: ' + e.message; if (/[?&]audit=1/.test(location.search)) document.body.innerHTML = '<pre id="audit-json">ERROR ' + e.message + '</pre>'; } }
  function go() { setTimeout(start, 50); }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(go); else window.addEventListener('load', go);
})();

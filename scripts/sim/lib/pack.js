/* Turns the HTML a print button writes into #printSheets into a standalone page: the app's own CSS inlined, every sheet at the
   paper size the app prints it at, a caption per sheet type, and a screen-only zoom wrapper that does not change a sheet. */
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./appvm');

/* The sheets are plain sibling <div>s, so a depth count over the div tags splits them (no div tag appears inside an attribute or text). */
function splitSheets(html) {
  const out = []; let depth = 0, start = -1; const re = /<(\/?)div\b[^>]*>/g; let m;
  while ((m = re.exec(html))) {
    if (!m[1]) { if (depth === 0) start = m.index; depth++; } else { depth--; if (depth === 0) out.push(html.slice(start, re.lastIndex)); }
  }
  return out;
}
const decode = (s) => String(s).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const strip = (s) => decode(String(s).replace(/<[^>]*>/g, ''));

/* type: rules | running-order | players | boards | chart | bracket | projected | lineup | other. label: the sheet's own heading. */
function classify(sheet) {
  const gl = /<div class="group-label"><strong>([\s\S]*?)<\/strong><span>([\s\S]*?)<\/span>/.exec(sheet);
  const head = gl ? decode(strip(gl[1])) : '', sub = gl ? decode(strip(gl[2])) : '';
  const sub2 = (/<div class="sheet-sub">([\s\S]*?)<\/div>/.exec(sheet) || [])[1] || '';
  let type = 'other';
  const kb = /^<div class="print-sheet mko-print-sheet kb-sheet[^"]*"[^>]*>/.exec(sheet);
  if (kb) {
    /* the two-sided bracket sheets (bracket-print.js) name themselves in data attributes */
    const attr = (n) => decode((new RegExp(' data-' + n + '="([^"]*)"').exec(kb[0]) || [])[1] || '');
    const sec = attr('section'), paper = attr('paper'), scale = parseFloat(attr('scale'));
    const lbl = attr('label') + (sec ? (sec === 'finals' ? ' · Finals sheet' : ' · Section ' + sec) : '') + ' · ' + paper + ' · scale ' + scale.toFixed(2) + (scale < 0.999 ? ' (shrunk to fit)' : '');
    return { type: /kb-projected/.test(kb[0]) ? 'projected' : 'bracket', label: lbl, subtitle: attr('sub') };
  }
  if (/class="print-sheet lineup-sheet/.test(sheet)) type = 'lineup';
  else if (/mko-print-sheet/.test(sheet)) type = 'bracket';
  else if (/Projected Knockout Placement/.test(sheet)) type = 'projected';
  else if (/^RULES/.test(head)) type = 'rules';
  else if (/^RUNNING ORDER/.test(head)) type = 'running-order';
  else if (/^PLAYERS/.test(head)) type = 'players';
  else if (/^BOARDS/.test(head)) type = 'boards';
  else if (/^GROUP /.test(head) && /class="chart"/.test(sheet)) type = 'chart';
  let label = head ? head + (sub ? ' · ' + sub : '') : (type === 'lineup' ? 'Lineup sheet' : 'Sheet');
  if (type === 'lineup' && /lineup-blank/.test(sheet)) return { type, label: 'Empty lineup sheet (every box blank)', subtitle: '' };
  if (type === 'lineup') {
    const fx =[...sheet.matchAll(/<div class="bar">Fixture<\/div><div class="box">([\s\S]*?)<\/div>/g)].map((m) => decode(m[1]));
    const team = [...sheet.matchAll(/<span class="tag">Team Name<\/span>([\s\S]*?)<\/div>/g)].map((m) => decode(strip(m[1])));
    label = 'Lineup sheet · ' + (team[0] || '?') + ' ' + (fx[0] || '') + ' | ' + (team[1] || '?') + ' ' + (fx[1] || '');
  }
  return { type, label, subtitle: strip(sub2) };
}

const TYPE_TITLE = {
  rules: 'Rules and format sheet', 'running-order': 'Running order sheet', players: 'Players A-Z sheet', boards: 'Boards sheet',
  chart: 'Round robin group charts', bracket: 'Knockout bracket sheets (two-sided chart, one sheet per bracket)', projected: 'Projected bracket sheet (printed before the round robin is played)',
  lineup: 'Teams lineup sheets', other: 'Other sheets',
};

function appCss() {
  const html = fs.readFileSync(path.join(ROOT, 'app.html'), 'utf8');
  const render = fs.readFileSync(path.join(ROOT, 'render.css'), 'utf8');
  const blocks = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
  return render + '\n' + blocks;
}

/* The print rules of the app (its @media print block) written without the media query, so the page shows each sheet at the
   size it prints at. The sheet is the same box; only a screen shadow is added around it. */
const PAPER_CSS = `
body{display:block!important;background:#cfd6de;margin:0;padding:0 0 40px}
#sim-wrap .print-sheet{box-shadow:0 2px 12px rgba(0,0,0,.28);border:none;width:277mm;height:190mm;aspect-ratio:auto;margin:0}
#sim-wrap .lineup-sheet{width:190mm;height:277mm}
#sim-wrap .mko-print-sheet{aspect-ratio:auto;overflow:hidden}
#sim-wrap .mko-print-sheet.mko-paper-A4{width:281mm;height:194mm}
#sim-wrap .mko-print-sheet.mko-paper-A3{width:404mm;height:281mm}
#sim-wrap .mko-print-sheet.mko-paper-A2{width:578mm;height:404mm}
#sim-wrap .mko-print-sheet.mko-paper-A1{width:825mm;height:578mm}
#sim-wrap .print-sheet.kb-sheet{padding:0}
#sim-wrap .bracket-cols{overflow-x:visible}
#sim-wrap .bracket-col{min-width:0;flex:1 1 0}
#sim-wrap *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
`;
const SIM_CSS = `
.sim-bar{position:sticky;top:0;z-index:50;background:#10233e;color:#fff;font:13px/1.4 Segoe UI,Arial,sans-serif;padding:8px 16px;display:flex;gap:16px;align-items:center;flex-wrap:wrap}
.sim-bar a{color:#9cc4ff}
.sim-bar input[type=range]{width:160px}
.sim-head{font:14px/1.5 Segoe UI,Arial,sans-serif;background:#fff;margin:0;padding:14px 20px;border-bottom:1px solid #b5bdc5}
.sim-head h1{margin:0 0 4px;font-size:20px;color:#10233e}
.sim-head table{border-collapse:collapse;margin-top:8px;font-size:12px}
.sim-head td,.sim-head th{border:1px solid #cfd6de;padding:3px 8px;text-align:left}
.sim-sec{margin:0;padding:18px 20px 6px}
.sim-cap{font:700 15px/1.3 Segoe UI,Arial,sans-serif;color:#10233e;background:#e8eef6;border-left:5px solid #d9ad45;padding:8px 12px;margin:0 0 10px}
.sim-cap small{font-weight:400;color:#53606f;margin-left:8px}
.sim-sheet{margin:0 0 14px;width:max-content}
.sim-label{font:11px/1.3 Segoe UI,Arial,sans-serif;color:#53606f;margin:0 0 3px}
.sim-zoom{zoom:var(--sim-zoom,.55)}
.sim-audit{font:12px/1.45 Segoe UI,Arial,sans-serif;background:#fffbe6;border:1px solid #e8c86e;margin:10px 20px;padding:8px 12px}
.sim-audit.bad{background:#fdeceb;border-color:#f3c6c2}
.sim-audit pre{margin:4px 0 0;white-space:pre-wrap}
.sim-note{font:12px/1.45 Segoe UI,Arial,sans-serif;color:#53606f;margin:0 20px 10px}
@media print{ .sim-bar,.sim-head,.sim-cap,.sim-label,.sim-audit,.sim-note{display:none!important} .sim-zoom{zoom:1} .sim-sheet{margin:0;page-break-after:always} body{background:#fff!important;padding:0} #sim-wrap .print-sheet{box-shadow:none} }
`;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* sections: [{ type, title?, note?, sheets: [{ html, label }] }] (consecutive sheets of one type share a section). */
function writePage(file, opts) {
  const { title, heading, facts, sections, stageName, backLink } = opts;
  const auditJs = fs.readFileSync(path.join(__dirname, '..', 'audit-client.js'), 'utf8');
  let n = 0;
  const body = sections.map((sec) => {
    const count = sec.sheets.length;
    const shown = sec.shownCount != null ? ' (showing ' + sec.shownCount + ')' : '';
    return '<section class="sim-sec" data-sec-type="' + esc(sec.type) + '"><h2 class="sim-cap">' + esc(sec.title || TYPE_TITLE[sec.type] || sec.type) +
      '<small>' + count + ' sheet' + (count === 1 ? '' : 's') + shown + '</small></h2>' + (sec.note ? '<p class="sim-note">' + esc(sec.note) + '</p>' : '') +
      '<div class="sim-zoom">' + sec.sheets.map((s) => { n++; return '<div class="sim-sheet" data-type="' + esc(s.type || sec.type) + '" data-label="' + esc(s.label) + '"><div class="sim-label">#' + n + ' · ' + esc(s.label) + '</div>' + s.html + '</div>'; }).join('') + '</div></section>';
  }).join('\n');
  const factRows = (facts || []).map(([k, v]) => '<tr><th>' + esc(k) + '</th><td>' + esc(v) + '</td></tr>').join('');
  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(title) + '</title>' +
    '<style>' + appCss() + '\n' + PAPER_CSS + '\n' + SIM_CSS + '</style></head><body>' +
    '<div class="sim-bar"><a href="' + esc(backLink || '../index.html') + '">&larr; All 12 events</a><b>' + esc(stageName) + '</b>' +
    '<label>Screen zoom <input id="sim-zoom-range" type="range" min="0.25" max="1.25" step="0.05" value="0.55"> <span id="sim-zoom-val">55%</span></label>' +
    '<span>Zoom is screen only: the sheets keep their paper size (printing resets it to 100%).</span></div>' +
    '<div class="sim-head"><h1>' + esc(heading) + '</h1><table>' + factRows + '</table></div>' +
    '<div id="sim-audit" class="sim-audit">Layout audit: running...</div>' +
    '<div id="sim-wrap">' + body + '</div>' +
    '<script>' + auditJs + '</script></body></html>';
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
  return Buffer.byteLength(html);
}

module.exports = { splitSheets, classify, writePage, TYPE_TITLE };

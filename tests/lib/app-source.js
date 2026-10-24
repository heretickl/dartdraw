// The organiser app's source as the English reader of the code saw it before i18n step 3: every T('key', {vars}) call
// is written back as the English string it draws, with its placeholders as the expressions that fill them, joined
// to the literals around it, and the data-i18n / data-help attributes of the static markup are dropped. Tests that
// check words or markup in app.html (help-site, help-claims, device-gate...) read this instead of the raw file, so
// they keep checking that the app says what the Help says, now that the words live in i18n/app.en.js.
//   englishSource('app.html')  or  englishSource('pods-ui.js')
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');

function table() {
  const EN = require('../../i18n/app.en.js');
  const vm = require('vm');
  const c = { document: { createElement: () => ({ getContext: () => ({}) }) } };
  vm.createContext(c);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'render.js'), 'utf8') + ';this.__r = DD_RENDER_EN;', c);
  return Object.assign({}, c.__r, EN, require('../../i18n/print.en.js'));   // i18n step 4: the printed sheets' words
}
/* { a: expr, b: x ? y : z } -> { a: 'expr', b: 'x ? y : z' } (split on commas outside brackets and quotes) */
function parseVars(src) {
  const out = {}; let depth = 0, cur = '', q = null;
  const parts = [];
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) { cur += ch; if (ch === '\\') { cur += src[++i]; continue; } if (ch === q) q = null; continue; }
    if (ch === '\'' || ch === '"' || ch === '`') { q = ch; cur += ch; continue; }
    if ('([{'.includes(ch)) depth++;
    if (')]}'.includes(ch)) depth--;
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  parts.forEach((p) => {
    const m = /^\s*([A-Za-z_$][\w$]*)\s*(?::\s*([\s\S]*))?$/.exec(p);
    if (m) out[m[1]] = (m[2] == null ? m[1] : m[2]).trim();
  });
  return out;
}
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
function englishSource(file) {
  const EN = table();
  let s = fs.readFileSync(path.join(ROOT, file || 'app.html'), 'utf8');
  s = s.replace(/ data-i18n(?:-html|-attr)?="[^"]*"| data-help="[^"]*"/g, '');
  // T('key') / T('key', {vars}) with a literal key; the vars object may hold one level of nested brackets
  s = s.replace(/\bT\('([\w.]+)'(?:,\s*(\{(?:[^{}]|\{[^{}]*\})*\}))?\)/g, (m, key, vars) => {
    if (!Object.prototype.hasOwnProperty.call(EN, key)) return m;
    let v = EN[key];
    if (v && typeof v === 'object') v = v.other;
    const ex = vars ? parseVars(vars.slice(1, -1)) : {};
    const filled = esc(v).replace(/\{(\w+)\}/g, (h, k) => (Object.prototype.hasOwnProperty.call(ex, k) ? '\'+' + ex[k] + '+\'' : h));
    return '\'' + filled + '\'';
  });
  // '...'+'...' -> '...' (repeat until stable)
  for (let i = 0; i < 6; i++) s = s.replace(/'((?:[^'\\\n]|\\.)*)'\+'((?:[^'\\\n]|\\.)*)'/g, '\'$1$2\'');
  // and every English value, quoted, at the end (a word chosen by a condition, T(x ? 'a' : 'b'), is found there)
  const all = [];
  Object.keys(EN).forEach((k) => { const v = EN[k]; (v && typeof v === 'object' ? [v.one, v.other] : [v]).forEach((x) => all.push('\'' + esc(x) + '\'')); });
  return s + '\n/* i18n/app.en.js */\n' + all.join('\n') + '\n';
}
module.exports = { englishSource };

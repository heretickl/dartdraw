/* Lists the string literals of the organiser app's scripts that look like words a person reads (the i18n coverage
   check, step 3). A small tokenizer: comments, '...', "...", `...` and regular expressions are told apart well enough
   for this code base. Used two ways:
     node scripts/i18n/scan-strings.js [--all]   prints every English-looking literal left, with file:line and function
     require('./scan-strings').scan(file)        the same list, for tests/app-i18n.test.js (the coverage test)
   A literal is "English-looking" when it holds a word of 3+ letters and either a space between words or a capital
   letter (so ids, CSS, event names like 'click' and codes like 'roundrobin' are left out). */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');

function literals(src) {
  const out = [];
  let i = 0, line = 1, last = '';   // last: the last significant character (to tell a regex from a division)
  const n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '\n') { line++; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') line++; i++; } i += 2; continue; }
    if (c === '\'' || c === '"' || c === '`') {
      const q = c, start = line; let s = ''; i++;
      while (i < n && src[i] !== q) {
        if (src[i] === '\\') { s += src[i + 1] === 'n' ? '\n' : src[i + 1]; if (src[i + 1] === '\n') line++; i += 2; continue; }
        if (q === '`' && src[i] === '$' && src[i + 1] === '{') { let depth = 1; s += '${'; i += 2; while (i < n && depth) { if (src[i] === '{') depth++; else if (src[i] === '}') depth--; if (src[i] === '\n') line++; if (depth) s += src[i]; i++; } s += '}'; continue; }
        if (src[i] === '\n') line++;
        s += src[i]; i++;
      }
      i++;
      out.push({ line: start, str: s });
      last = 'a';
      continue;
    }
    if (c === '/' && (last === '' || /[=(,:[!&|?{};+\-*%<>~^]/.test(last) || /\b(return|typeof|case|in|of)$/.test(src.slice(Math.max(0, i - 7), i).trimEnd()))) {
      i++; let cls = false;
      while (i < n && (cls || src[i] !== '/')) { if (src[i] === '\\') { i += 2; continue; } if (src[i] === '[') cls = true; else if (src[i] === ']') cls = false; if (src[i] === '\n') { line++; break; } i++; }
      i++; while (i < n && /[a-z]/.test(src[i])) i++;
      last = 'a';
      continue;
    }
    last = c; i++;
  }
  return out;
}

/* Words a reader sees. */
function wordy(s) {
  if (/^[a-z][A-Za-z0-9]*(.[A-Za-z0-9]+)+$/.test(s)) return false;   // a table key: T('s2.title')
  if (/^[A-Z]+$/.test(s) && /^(INPUT|SELECT|TEXTAREA|BUTTON|PUT|POST|GET|DELETE|DIV|SPAN)$/.test(s)) return false;   // tag names, HTTP verbs
  const attrs = [...s.matchAll(/(?:placeholder|title|aria-label|alt)="([^"]+)"/g)].map((m) => m[1]).join(' ');
  let t = s.replace(/<[^>]*>/g, ' ').replace(/<[^>]*$/, ' ').replace(/^[^<>]*>/, ' ')     // whole tags, a tag left open at the end, the end of one at the start
    .replace(/[w:-]+="[^"]*"?/g, ' ').replace(/[w.]+([^)]*)?;?/g, ' ').replace(/[w-]+:[^;"]*;/g, ' ');   // attributes, calls, inline CSS
  t = (t + ' ' + attrs).replace(/&[a-z#0-9]+;/gi, ' ').replace(/${[^}]*}/g, ' ').trim();
  if (!/[A-Za-z]{3,}/.test(t)) return false;
  if (/^[a-z][a-zA-Z0-9_]*$/.test(t)) return false;                                      // an identifier or a code
  if (/^[a-z0-9_-]+(?: [a-z0-9_-]+)*$/.test(t) && !/ (the|a|to|of|and|or|in|is|on|for|with|no)/.test(' ' + t)) return false;   // class lists
  return /[a-z] [a-z]|[A-Z][a-z]|^[A-Z]{3,}|[a-z]{3,}[.!?…]|^[A-Za-z]{3,}$/.test(t);
}

function funcAt(src) {   // line -> the function it is in (the nearest "function name(" above)
  const names = []; let cur = '';
  src.split('\n').forEach((l) => { const m = /\bfunction\s+([A-Za-z0-9_$]+)\s*\(/.exec(l); if (m) cur = m[1]; names.push(cur); });
  return (line) => names[line - 1] || '';
}

/* The scripts of a file: app.html's inline scripts (with their line offsets), or a whole .js file. */
function scriptsOf(file) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  if (!/\.html$/.test(file)) return [{ code: src, offset: 0, whole: src }];
  const out = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g; let m;
  while ((m = re.exec(src))) out.push({ code: m[1], offset: src.slice(0, m.index + m[0].indexOf('>') + 1).split('\n').length - 1, whole: src });
  return out;
}

function scan(file, opts) {
  opts = opts || {};
  const res = [];
  scriptsOf(file).forEach((s) => {
    const fn = funcAt(s.whole);
    literals(s.code).forEach((l) => {
      if (!opts.all && !wordy(l.str)) return;
      const line = l.line + s.offset;
      res.push({ file, line, fn: fn(line), str: l.str });
    });
  });
  return res;
}

module.exports = { scan, literals, wordy };

if (require.main === module) {
  const all = process.argv.includes('--all');
  const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  (files.length ? files : ['app.html', 'pods-ui.js', 'boardplan-ui.js']).forEach((f) => {
    scan(f, { all }).forEach((x) => console.log(f + ':' + x.line + ' [' + x.fn + '] ' + JSON.stringify(x.str).slice(0, 220)));
  });
}

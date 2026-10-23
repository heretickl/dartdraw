// A very small DOM for the Help search tests: parses the real help pages (well-formed HTML written by us) and offers the
// part of the DOM API that help-search.js and the page scripts use. Not a browser: no layout, no CSS, no innerHTML.
//   const { parse } = require('./lib/mini-dom');  const doc = parse(html);  doc.getElementById('helpQ')
// Setting .open on <details> queues a 'toggle' event, delivered by doc.flush() (browsers fire it later, too).

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RAW = new Set(['script', 'style', 'textarea', 'title']);
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”',
  ndash: '–', mdash: '—', hellip: '…', rarr: '→', larr: '←', uarr: '↑', darr: '↓', times: '×', middot: '·',
  lsaquo: '‹', rsaquo: '›', laquo: '«', raquo: '»', minus: '−', bull: '•', copy: '©', deg: '°', eacute: 'é' };
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  return Object.prototype.hasOwnProperty.call(ENT, e) ? ENT[e] : m;
});

class Node {
  constructor(doc) { this.ownerDocument = doc; this.parentNode = null; this.childNodes = []; this._l = {}; }
  get firstChild() { return this.childNodes[0] || null; }
  get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; }
  get nextSibling() { const p = this.parentNode; if (!p) return null; const i = p.childNodes.indexOf(this); return p.childNodes[i + 1] || null; }
  appendChild(n) {
    if (n.nodeType === 11) { n.childNodes.slice().forEach((c) => this.appendChild(c)); return n; }
    if (n.parentNode) n.parentNode.removeChild(n);
    n.parentNode = this; this.childNodes.push(n); return n;
  }
  insertBefore(n, ref) {
    if (!ref) return this.appendChild(n);
    if (n.nodeType === 11) { n.childNodes.slice().forEach((c) => this.insertBefore(c, ref)); return n; }
    if (n.parentNode) n.parentNode.removeChild(n);
    const i = this.childNodes.indexOf(ref); n.parentNode = this; this.childNodes.splice(i, 0, n); return n;
  }
  removeChild(n) { const i = this.childNodes.indexOf(n); if (i >= 0) { this.childNodes.splice(i, 1); n.parentNode = null; } return n; }
  replaceChild(n, old) { this.insertBefore(n, old); this.removeChild(old); return old; }
  normalize() {
    const out = [];
    this.childNodes.forEach((c) => {
      if (c.nodeType === 3) { if (!c.nodeValue) return; const prev = out[out.length - 1]; if (prev && prev.nodeType === 3) { prev.nodeValue += c.nodeValue; return; } }
      else if (c.normalize) c.normalize();
      out.push(c);
    });
    this.childNodes = out;
  }
  addEventListener(t, fn) { (this._l[t] = this._l[t] || []).push(fn); }
  removeEventListener(t, fn) { this._l[t] = (this._l[t] || []).filter((f) => f !== fn); }
  dispatchEvent(ev) {
    ev.target = ev.target || this;
    let n = this;
    while (n && !ev._stop) { (n._l[ev.type] || []).slice().forEach((fn) => fn.call(n, ev)); if (ev.bubbles === false) break; n = n.parentNode; }
    return !ev.defaultPrevented;
  }
}
class Text extends Node {
  constructor(doc, v) { super(doc); this.nodeType = 3; this.nodeValue = v; }
  get textContent() { return this.nodeValue; }
  set textContent(v) { this.nodeValue = String(v); }
}
class Fragment extends Node { constructor(doc) { super(doc); this.nodeType = 11; } }
class Element extends Node {
  constructor(doc, tag) { super(doc); this.nodeType = 1; this.tagName = tag.toUpperCase(); this.attrs = {}; this._value = null; }
  getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  removeAttribute(k) { delete this.attrs[k]; }
  hasAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k); }
  get id() { return this.getAttribute('id') || ''; }
  set id(v) { this.setAttribute('id', v); }
  get className() { return this.getAttribute('class') || ''; }
  set className(v) { this.setAttribute('class', v); }
  get hidden() { return this.hasAttribute('hidden'); }
  set hidden(v) { if (v) this.setAttribute('hidden', ''); else this.removeAttribute('hidden'); }
  get open() { return this.hasAttribute('open'); }
  set open(v) {
    const was = this.open;
    if (v) this.setAttribute('open', ''); else this.removeAttribute('open');
    if (was !== !!v && this.tagName === 'DETAILS') this.ownerDocument._queue.push(this);
  }
  get value() { return this._value != null ? this._value : (this.getAttribute('value') || ''); }
  set value(v) { this._value = String(v); }
  get children() { return this.childNodes.filter((c) => c.nodeType === 1); }
  get textContent() { return this.childNodes.map((c) => c.textContent).join(''); }
  set textContent(v) { this.childNodes.forEach((c) => { c.parentNode = null; }); this.childNodes = []; if (String(v)) this.appendChild(new Text(this.ownerDocument, String(v))); }
  get classList() {
    const self = this, list = () => self.className.split(/\s+/).filter(Boolean);
    return { contains: (c) => list().includes(c), add: (c) => { if (!list().includes(c)) self.className = list().concat(c).join(' '); }, remove: (c) => { self.className = list().filter((x) => x !== c).join(' '); } };
  }
  focus() { this.ownerDocument.activeElement = this; }
  scrollIntoView() { this.ownerDocument.scrolled.push(this.id || this.tagName); }
  matches(sel) { return parseSel(sel).some((cx) => matchComplex(this, cx)); }
  closest(sel) { let n = this; while (n && n.nodeType === 1) { if (n.matches(sel)) return n; n = n.parentNode; } return null; }
  querySelectorAll(sel) { const cxs = parseSel(sel), out = []; walk(this, (e) => { if (e !== this && cxs.some((cx) => matchComplex(e, cx))) out.push(e); }); return out; }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  get outerText() { return this.textContent; }
}
function walk(n, fn) { n.childNodes.forEach((c) => { if (c.nodeType === 1) { fn(c); walk(c, fn); } }); }

// selectors: compound parts (tag, #id, .class, [attr], [attr="v"]) joined by spaces (descendant) or '>' (child), comma lists
function parseSel(sel) {
  return sel.split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
    const toks = s.replace(/\s*>\s*/g, ' > ').split(/\s+/);
    const out = []; let rel = ' ';
    toks.forEach((t) => { if (t === '>') { rel = '>'; return; } out.push({ rel, c: parseCompound(t) }); rel = ' '; });
    return out;
  });
}
function parseCompound(t) {
  const c = { tag: null, id: null, cls: [], attrs: [] };
  const re = /([a-zA-Z][\w-]*)|#([\w-]+)|\.([\w-]+)|\[([\w-]+)(?:="([^"]*)")?\]/g; let m;
  while ((m = re.exec(t))) {
    if (m[1]) c.tag = m[1].toUpperCase(); else if (m[2]) c.id = m[2]; else if (m[3]) c.cls.push(m[3]); else c.attrs.push([m[4], m[5]]);
  }
  return c;
}
function matchCompound(e, c) {
  if (c.tag && e.tagName !== c.tag) return false;
  if (c.id && e.id !== c.id) return false;
  const cl = e.className.split(/\s+/);
  if (c.cls.some((x) => !cl.includes(x))) return false;
  return c.attrs.every(([k, v]) => e.hasAttribute(k) && (v === undefined || e.getAttribute(k) === v));
}
function matchComplex(e, parts, i = parts.length - 1) {
  if (!matchCompound(e, parts[i].c)) return false;
  if (i === 0) return true;
  const rel = parts[i].rel;
  let p = e.parentNode;
  if (rel === '>') return !!(p && p.nodeType === 1 && matchComplex(p, parts, i - 1));
  while (p && p.nodeType === 1) { if (matchComplex(p, parts, i - 1)) return true; p = p.parentNode; }
  return false;
}

class Document extends Element {
  constructor() { super(null, '#document'); this.ownerDocument = this; this._queue = []; this.scrolled = []; this.activeElement = null; }
  createElement(t) { return new Element(this, t); }
  createTextNode(v) { return new Text(this, String(v)); }
  createDocumentFragment() { return new Fragment(this); }
  getElementById(id) { let f = null; walk(this, (e) => { if (!f && e.id === id) f = e; }); return f; }
  get body() { return this.querySelector('body') || this; }
  // deliver queued 'toggle' events, as a browser does after the current task
  flush() { const q = this._queue.splice(0); q.forEach((d) => d.dispatchEvent({ type: 'toggle', bubbles: false, preventDefault() {} })); }
}

function parse(html) {
  const doc = new Document();
  const stack = [doc];
  const top = () => stack[stack.length - 1];
  const re = /<!--[\s\S]*?-->|<!doctype[^>]*>|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/gi;
  let at = 0, m;
  const text = (s) => { if (s) top().appendChild(new Text(doc, decode(s))); };
  while ((m = re.exec(html))) {
    text(html.slice(at, m.index));
    at = re.lastIndex;
    if (m[0].startsWith('<!')) continue;
    if (m[1]) {                                    // closing tag: pop to the matching element
      const tag = m[1].toUpperCase();
      for (let i = stack.length - 1; i > 0; i--) if (stack[i].tagName === tag) { stack.length = i; break; }
      continue;
    }
    const tag = m[2].toLowerCase(), el = new Element(doc, tag);
    const ar = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g; let a;
    while ((a = ar.exec(m[3] || ''))) el.attrs[a[1].toLowerCase()] = decode(a[2] != null ? a[2] : a[3] != null ? a[3] : a[4] != null ? a[4] : '');
    top().appendChild(el);
    if (RAW.has(tag)) {
      const end = html.toLowerCase().indexOf('</' + tag, at);
      const body = html.slice(at, end < 0 ? html.length : end);
      if (body) el.appendChild(new Text(doc, tag === 'title' || tag === 'textarea' ? decode(body) : body));
      at = end < 0 ? html.length : end;
      re.lastIndex = at;
      continue;
    }
    if (!VOID.has(tag) && !m[4]) stack.push(el);
  }
  text(html.slice(at));
  return doc;
}

module.exports = { parse, decode };

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), vm = require('vm'), path = require('path');

// qr.js is a pure classic script: load it alone into a vm context.
const ctx = vm.createContext({ unescape, encodeURIComponent, String, Math, Array });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'qr.js'), 'utf8'), ctx, { filename: 'qr.js' });
const matrix = (text) => { const m = vm.runInContext('qrMatrix(' + JSON.stringify(text) + ')', ctx); return m && JSON.parse(JSON.stringify(m)); };   // plain arrays (the vm has its own Array)
const svg = (text, opts) => vm.runInContext('qrSvg(' + JSON.stringify(text) + ',' + JSON.stringify(opts || {}) + ')', ctx);
const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, 'lib', 'qr-fixtures.json'), 'utf8'));
const bit = (m, x, y) => m[y][x];

test('the version, and so the size, follows the text length (level M, byte mode)', () => {
  assert.equal(matrix('a').length, 21);                    // version 1
  assert.equal(matrix('x'.repeat(14)).length, 21);         // the most version 1 holds
  assert.equal(matrix('x'.repeat(15)).length, 25);         // version 2
  assert.equal(matrix('x'.repeat(213)).length, 57);        // version 10, the most this generator holds
  assert.equal(matrix('x'.repeat(214)), null);             // too long
});

test('every code has the three finder patterns, the timing lines and the dark module', () => {
  [1, 20, 60, 160].forEach((len) => {
    const m = matrix('q'.repeat(len)), n = m.length;
    [[0, 0], [n - 7, 0], [0, n - 7]].forEach(([ox, oy]) => {
      for (let dy = 0; dy < 7; dy++) for (let dx = 0; dx < 7; dx++) {
        const edge = dx === 0 || dx === 6 || dy === 0 || dy === 6, core = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
        assert.equal(bit(m, ox + dx, oy + dy), edge || core ? 1 : 0, 'finder at ' + ox + ',' + oy + ' len ' + len);
      }
    });
    for (let i = 8; i <= n - 9; i++) { assert.equal(bit(m, i, 6), i % 2 === 0 ? 1 : 0); assert.equal(bit(m, 6, i), i % 2 === 0 ? 1 : 0); }
    assert.equal(bit(m, 8, n - 8), 1);
  });
});

// The 15 format bits are stored twice and must agree, carry error correction level M (00), and be a valid BCH codeword.
function readFormat(m) {
  const n = m.length, a = [], b = [];
  for (let k = 0; k <= 5; k++) a[k] = bit(m, 8, k);
  a[6] = bit(m, 8, 7); a[7] = bit(m, 8, 8); a[8] = bit(m, 7, 8);
  for (let k = 9; k < 15; k++) a[k] = bit(m, 14 - k, 8);
  for (let k = 0; k < 8; k++) b[k] = bit(m, n - 1 - k, 8);
  for (let k = 8; k < 15; k++) b[k] = bit(m, 8, n - 15 + k);
  const val = (arr) => arr.reduce((v, x, k) => v | (x << k), 0);
  return [val(a), val(b)];
}
test('the format information is stored twice, says level M, and is a valid code word', () => {
  ['a', 'https://dartdraw-viewer.vercel.app/live/mx24oh2j14ei', 'z'.repeat(150)].forEach((text) => {
    const [a, b] = readFormat(matrix(text));
    assert.equal(a, b);
    const bits = a ^ 0x5412;
    assert.equal(bits >>> 13, 0);                         // error correction level M is bits 00
    let rem = bits;
    for (let i = 14; i >= 10; i--) if ((rem >>> i) & 1) rem ^= 0x537 << (i - 10);
    assert.equal(rem, 0);                                 // divisible by the BCH generator
  });
});

test('versions 7 and up carry their version information, twice', () => {
  const m = matrix('z'.repeat(150)), n = m.length;            // 150 bytes is version 8
  assert.equal(n, 49);
  let v1 = 0, v2 = 0;
  for (let k = 0; k < 18; k++) {
    v1 |= bit(m, n - 11 + (k % 3), Math.floor(k / 3)) << k;
    v2 |= bit(m, Math.floor(k / 3), n - 11 + (k % 3)) << k;
  }
  assert.equal(v1, v2);
  assert.equal(v1 >>> 12, 8);
  let rem = v1;
  for (let i = 17; i >= 12; i--) if ((rem >>> i) & 1) rem ^= 0x1F25 << (i - 12);
  assert.equal(rem, 0);
});

test('known inputs give exactly the codes that an independent decoder read back correctly (fixtures)', () => {
  Object.keys(fixtures).forEach((k) => {
    const f = fixtures[k], m = matrix(f.text);
    assert.equal(m.length, f.size, k);
    assert.deepEqual(m.map((row) => row.join('')), f.rows, k);
  });
});

test('text is encoded as UTF-8 bytes', () => {
  const plain = matrix('e'.repeat(14)), accented = matrix('é'.repeat(14));    // 14 bytes versus 28 bytes
  assert.equal(plain.length, 21); assert.equal(accented.length, 29);        // version 1 versus version 3
});

test('the SVG has the quiet zone, one path, no text from the input, and is empty for text that is too long', () => {
  const m = matrix('https://example.com/x'), s = svg('https://example.com/x', { size: '25mm' });
  const n = m.length + 8;
  assert.match(s, new RegExp('viewBox="0 0 ' + n + ' ' + n + '"'));
  assert.match(s, /width="25mm" height="25mm"/);
  assert.equal((s.match(/<path /g) || []).length, 1);
  assert.ok(!s.includes('example.com'));
  assert.equal(svg('x'.repeat(300)), '');
  const hostile = svg('"><script>alert(1)</script>');
  assert.ok(!hostile.includes('<script'));
});

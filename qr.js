/* QR code generator: pure logic, no DOM, no dependencies. Byte mode, error correction level M, versions 1 to 10
   (up to 213 bytes of text, enough for a results link). qrMatrix(text) returns the modules as an array of rows of
   0/1, or null when the text does not fit; qrSvg(text, opts) draws them as an inline SVG with the required quiet zone.
   The encoding follows ISO/IEC 18004: data and Reed-Solomon codewords interleaved, the 8 mask patterns scored with
   the standard penalty rules, format and version information added. Loaded before the main script in app.html. */

/* Level M by version: [error-correction codewords per block, [[blocks, data codewords per block], ...]] */
var QR_M_BLOCKS = {
  1:[10, [[1, 16]]], 2:[16, [[1, 28]]], 3:[26, [[1, 44]]], 4:[18, [[2, 32]]], 5:[24, [[2, 43]]],
  6:[16, [[4, 27]]], 7:[18, [[4, 31]]], 8:[22, [[2, 38], [2, 39]]], 9:[22, [[3, 36], [2, 37]]], 10:[26, [[4, 43], [1, 44]]]
};
var QR_ALIGN = { 1:[], 2:[6, 18], 3:[6, 22], 4:[6, 26], 5:[6, 30], 6:[6, 34], 7:[6, 22, 38], 8:[6, 24, 42], 9:[6, 26, 46], 10:[6, 28, 50] };
var QR_REMAINDER_BITS = { 1:0, 2:7, 3:7, 4:7, 5:7, 6:7, 7:0, 8:0, 9:0, 10:0 };

function qrGfMul(x, y){
  var z = 0;
  for(var i = 7; i >= 0; i--){ z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; }
  return z;
}
function qrRsDivisor(degree){
  var result = [], i, j, root = 1;
  for(i = 0; i < degree - 1; i++) result.push(0);
  result.push(1);
  for(i = 0; i < degree; i++){
    for(j = 0; j < result.length; j++){ result[j] = qrGfMul(result[j], root); if(j + 1 < result.length) result[j] ^= result[j + 1]; }
    root = qrGfMul(root, 0x02);
  }
  return result;
}
function qrRsRemainder(data, divisor){
  var result = divisor.map(function(){ return 0; });
  data.forEach(function(b){
    var factor = b ^ result.shift();
    result.push(0);
    divisor.forEach(function(coef, i){ result[i] ^= qrGfMul(coef, factor); });
  });
  return result;
}
function qrDataCodewords(version){ return QR_M_BLOCKS[version][1].reduce(function(sum, g){ return sum + g[0] * g[1]; }, 0); }
function qrUtf8Bytes(text){
  var s = unescape(encodeURIComponent(String(text))), out = [];
  for(var i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
  return out;
}

/* The data codewords for the text at this version: mode, length, bytes, terminator, padding. */
function qrBuildData(bytes, version){
  var bits = [];
  function put(value, count){ for(var i = count - 1; i >= 0; i--) bits.push((value >>> i) & 1); }
  put(0x4, 4);
  put(bytes.length, version >= 10 ? 16 : 8);
  bytes.forEach(function(b){ put(b, 8); });
  var capacityBits = qrDataCodewords(version) * 8;
  put(0, Math.min(4, capacityBits - bits.length));
  while(bits.length % 8) bits.push(0);
  var codewords = [], i;
  for(i = 0; i < bits.length; i += 8){
    var v = 0;
    for(var k = 0; k < 8; k++) v = (v << 1) | bits[i + k];
    codewords.push(v);
  }
  for(var pad = 0xEC; codewords.length < qrDataCodewords(version); pad ^= 0xEC ^ 0x11) codewords.push(pad);
  return codewords;
}
/* Splits the data into blocks, adds each block's error correction, and interleaves everything. */
function qrInterleave(data, version){
  var spec = QR_M_BLOCKS[version], divisor = qrRsDivisor(spec[0]), blocks = [], pos = 0;
  spec[1].forEach(function(g){
    for(var n = 0; n < g[0]; n++){
      var d = data.slice(pos, pos + g[1]); pos += g[1];
      blocks.push({ data:d, ec:qrRsRemainder(d, divisor) });
    }
  });
  var out = [], i, maxData = Math.max.apply(null, blocks.map(function(b){ return b.data.length; }));
  for(i = 0; i < maxData; i++) blocks.forEach(function(b){ if(i < b.data.length) out.push(b.data[i]); });
  for(i = 0; i < spec[0]; i++) blocks.forEach(function(b){ out.push(b.ec[i]); });
  return out;
}

/* BCH(15,5) format bits for error correction M (bits 00) and a mask, and BCH(18,6) version bits. */
function qrFormatBits(mask){
  var data = (0 << 3) | mask, rem = data;
  for(var i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}
function qrVersionBits(version){
  var rem = version;
  for(var i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
  return (version << 12) | rem;
}

/* Draws the fixed patterns, places the codewords, picks the lowest-penalty mask. */
function qrLayout(version, codewords){
  var size = version * 4 + 17, mods = [], fn = [], r, c;
  for(r = 0; r < size; r++){ mods.push([]); fn.push([]); for(c = 0; c < size; c++){ mods[r].push(0); fn[r].push(false); } }
  function setFn(x, y, dark){ if(x < 0 || y < 0 || x >= size || y >= size) return; mods[y][x] = dark ? 1 : 0; fn[y][x] = true; }
  function finder(cx, cy){
    for(var dy = -4; dy <= 4; dy++) for(var dx = -4; dx <= 4; dx++){
      var dist = Math.max(Math.abs(dx), Math.abs(dy));
      setFn(cx + dx, cy + dy, dist !== 2 && dist !== 4);
    }
  }
  function alignment(cx, cy){
    for(var dy = -2; dy <= 2; dy++) for(var dx = -2; dx <= 2; dx++) setFn(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  for(var i = 0; i < size; i++){ setFn(6, i, i % 2 === 0); setFn(i, 6, i % 2 === 0); }
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  var pos = QR_ALIGN[version], n = pos.length;
  for(var a = 0; a < n; a++) for(var b = 0; b < n; b++){
    if((a === 0 && b === 0) || (a === 0 && b === n - 1) || (a === n - 1 && b === 0)) continue;
    alignment(pos[a], pos[b]);
  }
  function drawFormat(mask){
    var bits = qrFormatBits(mask), k;
    for(k = 0; k <= 5; k++) setFn(8, k, ((bits >>> k) & 1) !== 0);
    setFn(8, 7, ((bits >>> 6) & 1) !== 0); setFn(8, 8, ((bits >>> 7) & 1) !== 0); setFn(7, 8, ((bits >>> 8) & 1) !== 0);
    for(k = 9; k < 15; k++) setFn(14 - k, 8, ((bits >>> k) & 1) !== 0);
    for(k = 0; k < 8; k++) setFn(size - 1 - k, 8, ((bits >>> k) & 1) !== 0);
    for(k = 8; k < 15; k++) setFn(8, size - 15 + k, ((bits >>> k) & 1) !== 0);
    setFn(8, size - 8, true);
  }
  drawFormat(0);                                           // reserves the format area; redrawn with the chosen mask
  if(version >= 7){
    var vb = qrVersionBits(version);
    for(var k = 0; k < 18; k++){
      var dark = ((vb >>> k) & 1) !== 0, ra = size - 11 + k % 3, rb = Math.floor(k / 3);
      setFn(ra, rb, dark); setFn(rb, ra, dark);
    }
  }
  // codewords, two columns at a time from the bottom right, skipping the vertical timing column
  var bitsOut = [];
  codewords.forEach(function(cw){ for(var k = 7; k >= 0; k--) bitsOut.push((cw >>> k) & 1); });
  for(var rem = 0; rem < QR_REMAINDER_BITS[version]; rem++) bitsOut.push(0);
  var bi = 0;
  for(var right = size - 1; right >= 1; right -= 2){
    if(right === 6) right = 5;
    for(var vert = 0; vert < size; vert++) for(var j = 0; j < 2; j++){
      var x = right - j, upward = ((right + 1) & 2) === 0, y = upward ? size - 1 - vert : vert;
      if(!fn[y][x] && bi < bitsOut.length){ mods[y][x] = bitsOut[bi]; bi++; }
    }
  }
  function applyMask(mask){
    for(var y = 0; y < size; y++) for(var x = 0; x < size; x++){
      var inv;
      switch(mask){
        case 0: inv = (x + y) % 2 === 0; break;
        case 1: inv = y % 2 === 0; break;
        case 2: inv = x % 3 === 0; break;
        case 3: inv = (x + y) % 3 === 0; break;
        case 4: inv = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
        case 5: inv = x * y % 2 + x * y % 3 === 0; break;
        case 6: inv = (x * y % 2 + x * y % 3) % 2 === 0; break;
        default: inv = ((x + y) % 2 + x * y % 3) % 2 === 0;
      }
      if(!fn[y][x] && inv) mods[y][x] ^= 1;
    }
  }
  function penalty(){
    var score = 0, y, x, run, dark = 0, line;
    function runs(get){
      var s = 0;
      for(var p = 0; p < size; p++){
        var q = 0, prev = -1, len = 0, str = '';
        for(q = 0; q < size; q++){
          var v = get(p, q);
          str += v;
          if(v === prev) len++; else { if(len >= 5) s += 3 + len - 5; prev = v; len = 1; }
        }
        if(len >= 5) s += 3 + len - 5;
        var idx = -1;
        while((idx = str.indexOf('10111010000', idx + 1)) !== -1) s += 40;
        idx = -1;
        while((idx = str.indexOf('00001011101', idx + 1)) !== -1) s += 40;
      }
      return s;
    }
    score += runs(function(p, q){ return mods[p][q]; });
    score += runs(function(p, q){ return mods[q][p]; });
    for(y = 0; y < size - 1; y++) for(x = 0; x < size - 1; x++){
      var v = mods[y][x];
      if(v === mods[y][x + 1] && v === mods[y + 1][x] && v === mods[y + 1][x + 1]) score += 3;
    }
    for(y = 0; y < size; y++) for(x = 0; x < size; x++) dark += mods[y][x];
    var total = size * size, k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    return score + (k > 0 ? k * 10 : 0);
  }
  var best = -1, bestScore = Infinity, snapshot = null, m;
  for(m = 0; m < 8; m++){
    applyMask(m); drawFormat(m);
    var s = penalty();
    if(s < bestScore){ bestScore = s; best = m; snapshot = mods.map(function(row){ return row.slice(); }); }
    applyMask(m);                                           // masking twice restores the data modules
  }
  return snapshot;
}

function qrMatrix(text){
  var bytes = qrUtf8Bytes(text), version = 0, v;
  for(v = 1; v <= 10; v++){
    if(4 + (v >= 10 ? 16 : 8) + bytes.length * 8 <= qrDataCodewords(v) * 8){ version = v; break; }
  }
  if(!version) return null;
  return qrLayout(version, qrInterleave(qrBuildData(bytes, version), version));
}

/* An inline SVG of the code with a 4-module quiet zone. `size` is the CSS width (and height) it is drawn at. */
function qrSvg(text, opts){
  var m = qrMatrix(text);
  if(!m) return '';
  var quiet = 4, n = m.length + quiet * 2, size = (opts && opts.size) || '30mm', d = '';
  m.forEach(function(row, y){
    var x = 0;
    while(x < row.length){
      if(!row[x]){ x++; continue; }
      var start = x;
      while(x < row.length && row[x]) x++;
      d += 'M'+(start + quiet)+' '+(y + quiet)+'h'+(x - start)+'v1h-'+(x - start)+'z';
    }
  });
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+n+' '+n+'" width="'+size+'" height="'+size+'" shape-rendering="crispEdges" role="img" aria-label="QR code for the live results link">'+
    '<rect width="'+n+'" height="'+n+'" fill="#fff"/><path d="'+d+'" fill="#000"/></svg>';
}

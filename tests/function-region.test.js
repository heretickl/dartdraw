const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// The Neon database is in Singapore (AWS ap-southeast-1). Vercel runs functions in Washington D.C. (iad1) unless a
// region is set, which made every database query cross the Pacific (about 220 ms each, 3 per save). Both projects pin
// their functions to Singapore (sin1), next to the database. If the database ever moves, change both together.
const REGION = 'sin1';
const read = (p) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', p), 'utf8'));

test('the organiser project runs its functions in the same region as the database', () => {
  assert.deepEqual(read('vercel.json').regions, [REGION]);
});

test('the public viewer project runs its functions in the same region as the database', () => {
  assert.deepEqual(read('viewer/vercel.json').regions, [REGION]);
});

test('the existing redirects, headers and rewrites are untouched', () => {
  const org = read('vercel.json');
  assert.ok(org.redirects.some((r) => r.source === '/viewer/:path*'));
  assert.ok(org.headers.some((h) => h.source === '/verify.html') && org.headers.some((h) => h.source === '/reset.html'));
  assert.ok(read('viewer/vercel.json').rewrites.some((r) => r.source === '/live/:slug'));
});

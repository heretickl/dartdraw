const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// Vercel's Hobby plan allows 12 Serverless Functions per deployment, and every .js file under api/ counts as one,
// except a file or directory whose name starts with an underscore (api/_lib, api/_routes). The handlers live under
// api/_routes and are reached through the routers api/auth/[action].js, api/players/[action].js and the three api/admin/[a].js route files (a catch-all
// file name was tried first and Vercel only matched one path segment with it, so multi-segment admin paths returned the platform's 404). This test keeps
// new files from silently pushing a deployment over the limit.
const API = path.join(__dirname, '..', 'api');
const MAX_FUNCTIONS = 8;   // headroom under the plan limit of 12

function deployedFunctions(dir, rel) {
  let out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('_')) continue;
    const relPath = rel ? rel + '/' + entry.name : entry.name;
    if (entry.isDirectory()) out = out.concat(deployedFunctions(path.join(dir, entry.name), relPath));
    else if (entry.name.endsWith('.js')) out.push('api/' + relPath);
  }
  return out;
}

test('api/ deploys at most ' + MAX_FUNCTIONS + ' serverless functions (plan limit 12)', () => {
  const list = deployedFunctions(API, '').sort();
  assert.ok(list.length <= MAX_FUNCTIONS,
    list.length + ' functions would be deployed (max ' + MAX_FUNCTIONS + '):\n  ' + list.join('\n  '));
});

test('the function counter sees the routers and skips underscore folders', () => {
  const list = deployedFunctions(API, '');
  assert.ok(list.includes('api/auth/[action].js'));
  ['api/admin/[a].js', 'api/admin/[a]/[b].js', 'api/admin/[a]/[b]/[c].js'].forEach((f) => assert.ok(list.includes(f), f + ' is missing'));
  assert.ok(!list.some((f) => f.includes('...')), 'a catch-all route file only matches one segment on Vercel here: use [a]/[b]/[c] files');
  assert.ok(list.includes('api/tournaments/index.js'));
  assert.ok(!list.some((p) => p.split('/').some((s) => s.startsWith('_'))));
});

test('the three admin route files all expose the one shared dispatcher, one directory level deeper each', () => {
  const dispatcher = require('../api/_routes/adminRouter');
  assert.equal(require('../api/admin/[a]'), dispatcher);
  assert.equal(require('../api/admin/[a]/[b]'), dispatcher);
  assert.equal(require('../api/admin/[a]/[b]/[c]'), dispatcher);
});

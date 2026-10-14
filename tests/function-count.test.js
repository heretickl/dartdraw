const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// Vercel's Hobby plan allows 12 Serverless Functions per deployment, and every .js file under api/ counts as one,
// except a file or directory whose name starts with an underscore (api/_lib, api/_routes). The handlers live under
// api/_routes and are reached through the routers api/auth/[action].js and api/admin/[...route].js. This test keeps
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
  assert.ok(list.includes('api/admin/[...route].js'));
  assert.ok(list.includes('api/tournaments/index.js'));
  assert.ok(!list.some((p) => p.split('/').some((s) => s.startsWith('_'))));
});

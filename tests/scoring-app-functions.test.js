const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// The scoring app is its own Vercel project (scoring_app/), on the Hobby plan: every .js file under scoring_app/api/
// counts as one Serverless Function, except files and folders whose name starts with an underscore (_lib, _routes).
// The account, friends and games endpoints sit behind one router each, so new handlers never add a function.
const API = path.join(__dirname, '..', 'scoring_app', 'api');
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

test('scoring_app/api deploys at most ' + MAX_FUNCTIONS + ' serverless functions', () => {
  const list = deployedFunctions(API, '').sort();
  assert.ok(list.length <= MAX_FUNCTIONS, list.length + ' functions would be deployed:\n  ' + list.join('\n  '));
});

test('the three routers are deployed and nothing under an underscore folder is', () => {
  const list = deployedFunctions(API, '');
  ['api/account/[action].js', 'api/friends/[action].js', 'api/games/[action].js'].forEach((f) => assert.ok(list.includes(f), f + ' is missing'));
  assert.ok(!list.some((p) => p.split('/').some((s) => s.startsWith('_'))));
});

test('every router answers 404 not_found for an unknown action', async () => {
  const { callHandler } = require('./lib/call-handler');
  for (const name of ['account', 'friends', 'games']) {
    const router = require('../scoring_app/api/' + name + '/[action].js');
    const r = await callHandler(router, { method: 'POST', url: '/api/' + name + '/nope' });
    assert.equal(r.statusCode, 404, name);
    assert.deepEqual(r.body, { code: 'not_found', error: 'Not found.' });
  }
});

test('API answers are never cached (vercel.json headers)', () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'scoring_app', 'vercel.json'), 'utf8'));
  const rule = (cfg.headers || []).find((h) => h.source === '/api/(.*)');
  assert.ok(rule, 'no header rule for /api/');
  assert.ok(rule.headers.some((h) => h.key === 'Cache-Control' && h.value === 'no-store'));
});

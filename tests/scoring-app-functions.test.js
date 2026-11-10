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

// Player accounts stay off on a site until PLAYER_ACCOUNTS=on (owner 2026-11-10: the live site waits for e-mail).
// Off: account/config says so and every other account, friends and games call answers 404 accounts_off.
test('accounts are off unless PLAYER_ACCOUNTS=on', async () => {
  const { callHandler } = require('./lib/call-handler');
  const saved = process.env.PLAYER_ACCOUNTS;
  try {
    delete process.env.PLAYER_ACCOUNTS;
    const account = require('../scoring_app/api/account/[action].js');
    let r = await callHandler(account, { method: 'GET', url: '/api/account/config' });
    assert.equal(r.statusCode, 200); assert.deepEqual(r.body, { accounts: false });
    for (const [name, action] of [['account', 'login'], ['account', 'register'], ['account', 'me'], ['friends', 'list'], ['games', 'save']]) {
      const router = require('../scoring_app/api/' + name + '/[action].js');
      r = await callHandler(router, { method: 'POST', url: '/api/' + name + '/' + action });
      assert.equal(r.statusCode, 404, name + '/' + action);
      assert.equal(r.body.code, 'accounts_off', name + '/' + action);
    }
    process.env.PLAYER_ACCOUNTS = 'on';
    r = await callHandler(account, { method: 'GET', url: '/api/account/config' });
    assert.deepEqual(r.body, { accounts: true });
  } finally {
    if (saved === undefined) delete process.env.PLAYER_ACCOUNTS; else process.env.PLAYER_ACCOUNTS = saved;
  }
});

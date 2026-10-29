const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, run, plain } = require('./lib/helpers');

// Offline scoring (docs/superpowers/specs/2026-10-29-offline-scoring-design.md): DDOffline's store (offline.js), here on
// its memory backend (there is no IndexedDB in Node). Every organiser's copies and queues are kept apart.
const app = loadApp();
const O = run(app, 'DDOffline');
O.useBackend('memory');

test('profile, list, event copies and queues round-trip per organiser, and the last organiser is remembered', async () => {
  await O.putProfile('o1', { id: 'o1', name: 'One' });
  await O.putProfile('o2', { id: 'o2', name: 'Two' });
  assert.equal(await O.getLastOrganizerId(), 'o2');
  assert.deepEqual(plain(await O.getProfile('o1')), { id: 'o1', name: 'One' });
  await O.putList('o1', [{ id: 't1', data: { a: 1 }, updated_at: 'S1' }]);
  assert.equal((await O.getList('o1'))[0].updated_at, 'S1');
  assert.equal(await O.getList('o2'), null);
  await O.putEvent('o1', 't1', { data: { a: 1 }, updated_at: 'S1' });
  assert.equal((await O.getEvent('o1', 't1')).updated_at, 'S1');
  assert.equal(await O.getEvent('o2', 't1'), null, 'another organiser never sees it');
  await O.putQueue('o1', 't1', { data: { a: 2 } });
  await O.putQueue('o1', 't2', { data: { b: 2 } });
  await O.putQueue('o2', 't1', { data: { c: 3 } });
  assert.deepEqual(plain(await O.listQueue('o1')).map((x) => x.id).sort(), ['t1', 't2']);
  assert.deepEqual(plain(await O.listQueue('o2')).map((x) => x.entry.data), [{ c: 3 }]);
  await O.deleteQueue('o1', 't2');
  assert.deepEqual(plain(await O.listQueue('o1')).map((x) => x.id), ['t1']);
});

test('what is stored is a copy: changing the object afterwards does not change the stored one', async () => {
  const d = { a: 1 };
  await O.putQueue('o3', 't1', { data: d });
  d.a = 99;
  assert.equal((await O.getQueue('o3', 't1')).data.a, 1);
  const got = await O.getQueue('o3', 't1'); got.data.a = 5;
  assert.equal((await O.getQueue('o3', 't1')).data.a, 1);
});

test('clearOrganizer removes only that organiser (not one whose id starts the same), and forgets them as the last one', async () => {
  await O.putProfile('ab', { id: 'ab' }); await O.putQueue('ab', 't1', { data: {} }); await O.putEvent('ab', 't1', { data: {} }); await O.putList('ab', []);
  await O.putProfile('abc', { id: 'abc' }); await O.putQueue('abc', 't1', { data: {} }); await O.putEvent('abc', 't1', { data: {} });
  await O.putProfile('ab', { id: 'ab' });   // ab is the last one again
  await O.clearOrganizer('ab');
  assert.equal(await O.getProfile('ab'), null);
  assert.equal(await O.getList('ab'), null);
  assert.equal(await O.getEvent('ab', 't1'), null);
  assert.equal((await O.listQueue('ab')).length, 0);
  assert.ok(await O.getProfile('abc'));
  assert.ok(await O.getEvent('abc', 't1'));
  assert.equal((await O.listQueue('abc')).length, 1);
  assert.equal(await O.getLastOrganizerId(), null);
});

test('writes land in the order they were made, even when not awaited', async () => {
  for (let i = 0; i < 20; i++) O.putQueue('o4', 't1', { data: { n: i } });
  O.deleteQueue('o4', 't1');
  O.putQueue('o4', 't1', { data: { n: 'last' } });
  await O.putQueue('o4', 'tx', { data: {} });
  assert.equal((await O.getQueue('o4', 't1')).data.n, 'last');
});

test('requestPersist asks the browser to keep the storage where it can, and resolves false where it cannot', async () => {
  let asked = 0;
  const yes = run(loadApp({ globals: { navigator: { storage: { persist: async () => { asked++; return true; } } } } }), 'DDOffline');
  assert.equal(await yes.requestPersist(), true);
  assert.equal(asked, 1);
  const no = run(loadApp({ globals: { navigator: {} } }), 'DDOffline');
  assert.equal(await no.requestPersist(), false);
});

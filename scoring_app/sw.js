/* Casual play: a copy of the site on the phone, so a game goes on with no signal. Network first (TIMEOUT_MS at most),
   the fresh copy kept; no answer: the kept copy. Only the site's own files (SHELL) are answered here; the fonts and
   everything else go to the network untouched; so do the server's answers (/api/...), which are never kept here.
   VERSION: bump it when SHELL changes (a file added or removed); it only clears the old caches. SHELL must list the page
   and every file it loads (tests/casual.test.js checks). */
var VERSION = '2026-11-07.7';
var CACHE = 'dd-casual-' + VERSION;
var SHELL = [
  '/',
  '/scoring.css', '/casual.css', '/account.css', '/scorecard.css', '/friends.css',
  '/i18n/casual.en.js', '/i18n/casual.ms.js', '/match-engine.js', '/scoring-model.js', '/scoring-screens.js', '/casual.js',
  '/net.js', '/account.js', '/opponent.js', '/scorecard.js', '/app.js'
];
var TIMEOUT_MS = 6000;

var SW = typeof self !== 'undefined' && self.addEventListener ? self : { addEventListener: function () {} };   // Node tests: no worker
SW.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
SW.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('dd-casual-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
function shellKey(url) {
  var u = new URL(url);
  if (u.origin !== self.location.origin) return null;
  var p = u.pathname === '/index.html' ? '/' : u.pathname;
  return SHELL.indexOf(p) >= 0 ? p : null;
}
SW.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var key = shellKey(e.request.url);
  if (!key) return;
  e.respondWith(new Promise(function (resolve) {
    var done = false;
    function kept() { return caches.open(CACHE).then(function (c) { return c.match(key); }); }
    var timer = setTimeout(function () { kept().then(function (r) { if (r && !done) { done = true; resolve(r); } }); }, TIMEOUT_MS);
    fetch(e.request).then(function (res) {
      if (res && res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { return c.put(key, copy); }); }
      if (!done) { done = true; clearTimeout(timer); resolve(res); }
    }).catch(function () {
      clearTimeout(timer);
      kept().then(function (r) { if (!done) { done = true; resolve(r || Response.error()); } });
    });
  }));
});
if (typeof module !== 'undefined' && module.exports) module.exports = { SHELL: SHELL, VERSION: VERSION };

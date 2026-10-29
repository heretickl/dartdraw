/* DartDraw organiser app: a copy of the app on the phone, so /app opens with no signal (offline scoring,
   docs/superpowers/specs/2026-10-29-offline-scoring-design.md). Registered by app.html with scope /app.
   Only the app's own files (SHELL) and the /app page are answered here, and a page's files always come from the same
   place as the page, so old and new files are never mixed:
     the /app page   network first (TIMEOUT_MS at most), the fresh copy kept; no answer: the kept copy;
     its files       a page that came from the network: the network, however slow (the fresh copy kept), the kept copy
                     only if the request fails; a page that came from the kept copy: the kept copies. Everything else, every /api/* request included, goes to the network
   untouched, and the landing site, Help and sign-in pages are outside the scope.
   VERSION: bump it when SHELL changes (a file added or removed). Network first already serves new files after a deploy;
   the bump only clears the old caches. SHELL must list every <script src> of app.html, render.css and DD_MS_FILES. */
var VERSION = '2026-10-29.1';
var CACHE = 'dd-app-' + VERSION;
var SHELL = [
  '/app',
  '/render.css',
  '/render.js',
  '/i18n/app.en.js', '/i18n/print.en.js', '/i18n/errors.en.js',
  '/i18n/render.ms.js', '/i18n/app.ms.js', '/i18n/print.ms.js', '/i18n/errors.ms.js',
  '/i18n/app-i18n.js',
  '/bracket-print.js', '/tournament-sanitize.js', '/offline.js', '/pods.js', '/pods-ui.js', '/admin-ui.js', '/players-ui.js',
  '/qr.js', '/boardplan.js', '/boardplan-ui.js'
];
var TIMEOUT_MS = 8000;
var keptPages = new Set();   // ids of the pages (clients) opened from the kept copy

var SW = typeof self !== 'undefined' && self.addEventListener ? self : { addEventListener: function(){} };   // required by Node tests: no worker there
SW.addEventListener('install', function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){
    /* all at once and forgiving: a file that fails now is cached the next time it loads */
    return Promise.all(SHELL.map(function(u){ return fetch(u, { cache: 'no-cache' }).then(function(r){ if(r && r.ok) return c.put(u, r); }).catch(function(){}); }));
  }).then(function(){ return self.skipWaiting(); }));
});
SW.addEventListener('activate', function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(k){ return k.indexOf('dd-app-') === 0 && k !== CACHE; }).map(function(k){ return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});
/* The cache key for a request this worker answers, or null to leave it to the network. */
function shellKey(req){
  if(req.method !== 'GET') return null;
  var url = new URL(req.url);
  if(url.origin !== self.location.origin) return null;
  var p = url.pathname;
  if(p.indexOf('/api/') === 0) return null;
  if(req.mode === 'navigate') return (p === '/app' || p === '/app.html') ? '/app' : null;
  if(p === '/app.html') return '/app';
  return SHELL.indexOf(p) >= 0 ? p : null;
}
SW.addEventListener('fetch', function(e){
  var key = shellKey(e.request);
  if(!key) return;
  var page = e.request.mode === 'navigate';
  e.respondWith(caches.open(CACHE).then(function(c){
    var fromNet = function(){
      return fetch(e.request, { cache: 'no-cache' }).then(function(r){
        if(r && r.ok && r.type !== 'opaqueredirect') c.put(key, r.clone()).catch(function(){});
        return r;
      });
    };
    if(!page){
      if(e.clientId && keptPages.has(e.clientId)) return c.match(key).then(function(hit){ return hit || fromNet(); });
      return fromNet().catch(function(err){ return c.match(key).then(function(hit){ if(hit) return hit; throw err; }); });
    }
    var net = fromNet();
    var timeout = new Promise(function(resolve){ setTimeout(function(){ resolve(null); }, TIMEOUT_MS); });
    return Promise.race([net.catch(function(){ return null; }), timeout]).then(function(r){
      if(r) return r;
      return c.match(key).then(function(hit){
        if(!hit) return net;   // nothing kept: wait for the network after all
        if(e.resultingClientId) keptPages.add(e.resultingClientId);
        return hit;
      });
    });
  }));
});
if (typeof module !== 'undefined' && module.exports) module.exports = { SHELL: SHELL, shellKey: shellKey, VERSION: VERSION };

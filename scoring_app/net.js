/* The scoring app's line to its server (scoring_app/api/), and the phone's queue of finished games waiting to be saved.

   api(path, { method, body }) never throws: it answers { ok, status, body }, with status 0 when there is no answer at
   all (no signal, the page opened from a file), so a screen only ever checks numbers. The session is an httpOnly cookie
   the server sets, so requests go same-origin with credentials and the page never sees it. Answers are never cached here
   (the server says no-store, and sw.js only answers the site's own files).

   The queue (key dd-save-queue) keeps a logged-in player's finished games that could not be saved (offline, or the
   server failing), to send again later: at start-up and when the phone is back online. An item is { id, player, game }:
   game is the body of POST /api/games/save, id the game's id (adding the same id again replaces it, and the server stores
   an id once, so a game sent twice is saved once), player the account it belongs to, so a phone shared by two players
   never saves one player's game to the other. Guests' games are never queued. Storage that throws (private mode) keeps
   nothing: the game is simply not saved. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DDNet = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var QUEUE_KEY = 'dd-save-queue', SAVE_PATH = '/api/games/save';
  var cfg = { fetch: null, storage: null };

  /* Node tests and the start-up hand in their own fetch and storage; the page uses the browser's. */
  function init(o) {
    o = o || {};
    if (o.fetch) cfg.fetch = o.fetch;
    if (o.storage) cfg.storage = o.storage;
  }
  function fetcher() {
    if (cfg.fetch) return cfg.fetch;
    return typeof fetch === 'function' ? fetch : null;
  }
  function store() {
    if (cfg.storage) return cfg.storage;
    try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; }
  }

  function api(path, opts) {
    opts = opts || {};
    var f = fetcher();
    if (!f) return Promise.resolve({ ok: false, status: 0, body: null });
    var hasBody = opts.body !== undefined;
    var req = { method: opts.method || (hasBody ? 'POST' : 'GET'), credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } };
    if (hasBody) { req.headers['Content-Type'] = 'application/json'; req.body = JSON.stringify(opts.body); }
    return Promise.resolve().then(function () { return f(path, req); }).then(function (res) {
      // A proxy's HTML error page has no JSON: the status still says what happened.
      var done = function (body) { return { ok: !!res.ok, status: res.status || 0, body: body }; };
      if (!res.text) return done(null);
      return res.text().then(function (t) {
        var body = null;
        try { body = t ? JSON.parse(t) : null; } catch (e) { body = null; }
        return done(body);
      }, function () { return done(null); });
    }, function () { return { ok: false, status: 0, body: null }; });
  }

  /* ---------- the save queue ---------- */

  function readQueue() {
    var s = store();
    if (!s) return [];
    try {
      var q = JSON.parse(s.getItem(QUEUE_KEY));
      return Array.isArray(q) ? q.filter(function (it) { return it && typeof it === 'object' && it.game; }) : [];
    } catch (e) { return []; }
  }
  function writeQueue(q) {
    var s = store();
    if (!s) return;
    try { if (q.length) s.setItem(QUEUE_KEY, JSON.stringify(q)); else s.removeItem(QUEUE_KEY); } catch (e) { /* private mode */ }
  }

  var flushing = null;
  var queue = {
    /* Adds a game to send later; the same id replaces the one already waiting. Answers how many are waiting. */
    add: function (item) {
      if (!item || !item.game) return readQueue().length;
      var id = item.id || (item.game && item.game.id);
      var q = readQueue().filter(function (it) { return !id || (it.id || it.game.id) !== id; });
      q.push({ id: id, player: item.player == null ? null : item.player, game: item.game });
      writeQueue(q);
      return q.length;
    },
    items: function () { return readQueue(); },
    /* Takes a game off the queue (sent some other way, e.g. by the result screen itself). Answers how many are waiting. */
    remove: function (id) {
      var q = readQueue(), left = q.filter(function (it) { return (it.id || it.game.id) !== id; });
      if (left.length !== q.length) writeQueue(left);
      return left.length;
    },
    /* Sends the waiting games of this player (all of them when player is left out), oldest first, one at a time.
       Saved, or refused for good (a 4xx such as bad_game: the server will never take it) -> off the queue. No answer, a
       5xx, a lost session (401/403) or a rate limit (429) -> it stays, and the rest wait too. Answers how many were saved.
       A second flush while one runs gets the running one. */
    flush: function (player) {
      if (flushing) return flushing;
      var saved = 0;
      function mine(it) { return player == null || it.player == null || it.player === player; }
      function next() {
        var it = readQueue().filter(mine)[0];
        if (!it) return Promise.resolve(saved);
        return api(SAVE_PATH, { method: 'POST', body: it.game }).then(function (r) {
          var keep = r.status === 0 || r.status >= 500 || r.status === 401 || r.status === 403 || r.status === 429;
          if (keep) return saved;
          if (r.ok) saved++;
          var id = it.id || it.game.id;
          writeQueue(readQueue().filter(function (x) { return (x.id || x.game.id) !== id; }));
          return next();
        });
      }
      flushing = next().then(function (n) { flushing = null; return n; }, function () { flushing = null; return saved; });
      return flushing;
    }
  };

  return { init: init, api: api, queue: queue, QUEUE_KEY: QUEUE_KEY };
});

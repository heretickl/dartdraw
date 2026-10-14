// The dispatcher behind every /api/admin/* endpoint. It is NOT a function itself (api/_routes is not deployed): three tiny
// route files expose it, because Vercel's catch-all file name only matched ONE path segment in this project, so
// /api/admin/events/<id> and the other multi-segment paths were answered with the platform's own 404:
//   api/admin/[a].js            -> /api/admin/<a>                (organizers, events, settings)
//   api/admin/[a]/[b].js        -> /api/admin/<a>/<b>            (organizers/:id, events/:id)
//   api/admin/[a]/[b]/[c].js    -> /api/admin/<a>/<b>/<c>        (organizers/:id/reset-link, organizers/:id/transfer)
// Each handler is called unchanged with (req, res) and still starts with requireAdmin; method checks and error bodies
// stay inside the handlers.
//
//   organizers                        -> organizers/index
//   organizers/:id                    -> organizers/[id]               (req.query.id = :id)
//   organizers/:id/reset-link         -> organizers/[id]/reset-link    (req.query.id = :id)
//   organizers/:id/transfer           -> organizers/[id]/transfer      (req.query.id = :id)
//   events                            -> events/index                  (?q= &owner= &limit= &offset= kept in req.query)
//   events/:id                        -> events/[id]                   (req.query.id = :id)
//   settings                          -> settings
//
// The route is read from req.url, not from the platform's query, and :id is decoded with decodeURIComponent (a bad
// escape or an empty id is a 404). Anything else answers 404 { error: 'Not found.' }.
const H = {
  organizersIndex: () => require('./admin/organizers/index'),
  organizerItem: () => require('./admin/organizers/[id]'),
  organizerResetLink: () => require('./admin/organizers/[id]/reset-link'),
  organizerTransfer: () => require('./admin/organizers/[id]/transfer'),
  eventsIndex: () => require('./admin/events/index'),
  eventItem: () => require('./admin/events/[id]'),
  settings: () => require('./admin/settings')
};

// -> { load, id } or null
function match(pathname) {
  const m = /^\/api\/admin\/(.+?)\/?$/.exec(pathname);
  if (!m) return null;
  const parts = m[1].split('/');
  if (parts.some((p) => p === '')) return null;
  let id;
  if (parts.length > 1) {
    try { id = decodeURIComponent(parts[1]); } catch (e) { return null; }
    if (!id) return null;
  }
  if (parts[0] === 'organizers') {
    if (parts.length === 1) return { load: H.organizersIndex };
    if (parts.length === 2) return { load: H.organizerItem, id };
    if (parts.length === 3 && parts[2] === 'reset-link') return { load: H.organizerResetLink, id };
    if (parts.length === 3 && parts[2] === 'transfer') return { load: H.organizerTransfer, id };
    return null;
  }
  if (parts[0] === 'events') {
    if (parts.length === 1) return { load: H.eventsIndex };
    if (parts.length === 2) return { load: H.eventItem, id };
    return null;
  }
  if (parts[0] === 'settings' && parts.length === 1) return { load: H.settings };
  return null;
}

module.exports = async (req, res) => {
  let url;
  try { url = new URL(String(req.url || ''), 'http://x'); } catch (e) { url = null; }
  const hit = url && match(url.pathname);
  if (!hit) {
    res.status(404).json({ error: 'Not found.' });
    return;
  }
  if (!req.query) req.query = {};
  // The platform adds the path segments as query.a / b / c (and the old catch-all as query.route); the handlers never saw them.
  delete req.query.route; delete req.query.a; delete req.query.b; delete req.query.c;
  // Keep the query-string params (events list: q, owner, limit, offset); repeated names become arrays.
  url.searchParams.forEach((value, key) => {
    if (key === 'id' && hit.id !== undefined) return;
    if (Object.prototype.hasOwnProperty.call(req.query, key)) return;
    const all = url.searchParams.getAll(key);
    req.query[key] = all.length > 1 ? all : value;
  });
  if (hit.id !== undefined) req.query.id = hit.id;
  return hit.load()(req, res);
};

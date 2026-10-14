// One serverless function for every /api/admin/* endpoint (Vercel's Hobby plan allows 12 functions per deployment,
// so the handlers live in api/_routes/admin/ - folders starting with "_" are not deployed as functions - and this
// router picks one from the path after /api/admin/). Each handler is called unchanged with (req, res) and still
// starts with requireAdmin; method checks and error bodies stay inside the handlers.
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
  organizersIndex: () => require('../_routes/admin/organizers/index'),
  organizerItem: () => require('../_routes/admin/organizers/[id]'),
  organizerResetLink: () => require('../_routes/admin/organizers/[id]/reset-link'),
  organizerTransfer: () => require('../_routes/admin/organizers/[id]/transfer'),
  eventsIndex: () => require('../_routes/admin/events/index'),
  eventItem: () => require('../_routes/admin/events/[id]'),
  settings: () => require('../_routes/admin/settings')
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
  // The platform adds the catch-all as query.route; the handlers never saw it before.
  delete req.query.route;
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

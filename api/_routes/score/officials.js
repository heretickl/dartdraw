// /api/score/officials: the organiser's Floor officials panel (signed in; an Admin may manage any event).
//   GET  ?t=<event id>                                   -> { officials: [...] } (each with its link)
//   POST { t, op:'create', name, boards }                -> { official }
//   POST { op:'update', id, name?, boards? }             -> { official }
//   POST { op:'stop' | 'newPin' | 'newLink' | 'dismiss', id } -> { official }
// Every official in an answer carries `link` (this site's /score/<token>) and its PIN.
const { requireAuth } = require('../../_lib/auth');
const { sendError, bodyObject, methodNotAllowed, officials } = require('./common');

function linkBase(req) {
  if (process.env.APP_URL) return String(process.env.APP_URL).replace(/\/+$/, '');
  const host = req.headers && (req.headers['x-forwarded-host'] || req.headers.host);
  const proto = (req.headers && req.headers['x-forwarded-proto']) || (/^(localhost|127\.0\.0\.1)(:|$)/.test(String(host || '')) ? 'http' : 'https');
  return host ? proto + '://' + host : '';
}
function withLink(req, o) {
  const out = Object.assign({}, o, { link: linkBase(req) + '/score/' + o.token });
  delete out.token; delete out.tokenHash; delete out.tournamentId;
  return out;
}

module.exports = async (req, res) => {
  const organizer = await requireAuth(req, res);
  if (!organizer) return;
  try {
    if (req.method === 'GET') {
      const t = req.query && req.query.t;
      if (!t || typeof t !== 'string') { res.status(400).json({ code: 'missing_id', error: 'Missing id.' }); return; }
      const list = await officials.listOfficials(organizer, t);
      res.status(200).json({ officials: list.map((o) => withLink(req, o)) });
      return;
    }
    if (req.method !== 'POST') { methodNotAllowed(res); return; }
    const b = bodyObject(req);
    let official;
    if (b.op === 'create') {
      if (!b.t || typeof b.t !== 'string') { res.status(400).json({ code: 'missing_id', error: 'Missing id.' }); return; }
      official = (await officials.createOfficial(organizer, b.t, b)).official;
    } else if (typeof b.id !== 'string' || !b.id) {
      res.status(400).json({ code: 'missing_id', error: 'Missing id.' }); return;
    } else if (b.op === 'update') official = await officials.updateOfficial(organizer, b.id, b);
    else if (b.op === 'stop') official = await officials.stopOfficial(organizer, b.id);
    else if (b.op === 'newPin') official = await officials.renewPin(organizer, b.id);
    else if (b.op === 'newLink') official = (await officials.renewLink(organizer, b.id)).official;
    else if (b.op === 'dismiss') official = await officials.dismissRefused(organizer, b.id);
    else { res.status(400).json({ code: 'invalid_op', error: 'Unknown action.' }); return; }
    res.status(200).json({ official: withLink(req, official) });
  } catch (e) { sendError(res, e); }
};

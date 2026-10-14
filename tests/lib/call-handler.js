// Builds the req/res doubles used by the endpoint tests and runs a handler.
//
//   const r = await callHandler(handler, { method: 'POST', body: {...}, cookies: {...} });
//   r.statusCode, r.body, r.headers (lower-cased names; Set-Cookie as set)
//
// Other options: query, headers, ip (sets req.socket.remoteAddress).

async function callHandler(handler, opts) {
  opts = opts || {};
  const headers = {};
  Object.keys(opts.headers || {}).forEach((k) => { headers[k.toLowerCase()] = opts.headers[k]; });
  const req = {
    method: opts.method || 'GET',
    body: opts.body,
    query: opts.query || {},
    headers,
    cookies: opts.cookies || {},
    socket: { remoteAddress: opts.ip || '127.0.0.1' },
  };
  const out = { statusCode: 200, body: undefined, headers: {}, ended: false };
  const res = {
    status(code) { out.statusCode = code; return res; },
    json(obj) { out.body = obj; return res; },
    send(text) { out.body = text; return res; },
    setHeader(name, value) { out.headers[String(name).toLowerCase()] = value; return res; },
    getHeader(name) { return out.headers[String(name).toLowerCase()]; },
    end() { out.ended = true; return res; },
  };
  Object.defineProperty(res, 'statusCode', { get: () => out.statusCode, set: (v) => { out.statusCode = v; } });
  await handler(req, res);
  return out;
}

module.exports = { callHandler };

const crypto = require('crypto');
const { sql } = require('./db');

// Single-use emailed tokens. The raw token only ever exists in the email link;
// the database stores its SHA-256 hash.
const LIFETIMES_MS = {
  verify: 24 * 60 * 60 * 1000,
  reset: 60 * 60 * 1000,
  invite: 7 * 24 * 60 * 60 * 1000
};

function hashToken(raw) {
  return crypto.createHash('sha256').update(String(raw)).digest('hex');
}

// Returns the raw token. Earlier unused tokens of the same kind for this
// organiser stop working.
async function issueToken(organizerId, kind) {
  if (!Object.prototype.hasOwnProperty.call(LIFETIMES_MS, kind)) throw new Error('Unknown token kind: ' + kind);
  const raw = crypto.randomBytes(32).toString('hex');
  await sql`
    UPDATE auth_tokens SET used_at = now()
    WHERE organizer_id = ${organizerId} AND kind = ${kind} AND used_at IS NULL
  `;
  await sql`
    INSERT INTO auth_tokens (organizer_id, kind, token_hash, expires_at)
    VALUES (${organizerId}, ${kind}, ${hashToken(raw)}, now() + (${LIFETIMES_MS[kind]}::double precision * interval '1 millisecond'))
  `;
  return raw;
}

// Same check as consumeToken but changes nothing: lets a caller look at whose
// token this is (e.g. to check a password first) before spending it. Always
// follow it with consumeToken, which is the only thing that claims the token.
async function peekToken(raw, kinds) {
  if (typeof raw !== 'string' || !raw) return null;
  const rows = await sql`
    SELECT organizer_id, kind FROM auth_tokens
    WHERE token_hash = ${hashToken(raw)} AND kind = ANY(${kinds}::text[])
      AND used_at IS NULL AND expires_at > now()
  `;
  if (!rows.length) return null;
  return { organizerId: rows[0].organizer_id, kind: rows[0].kind };
}

// { organizerId, kind } if the token exists, is of an allowed kind, is unused
// and unexpired - and marks it used in the same statement, so two concurrent
// requests cannot both succeed. Otherwise null.
async function consumeToken(raw, kinds) {
  if (typeof raw !== 'string' || !raw) return null;
  const rows = await sql`
    UPDATE auth_tokens SET used_at = now()
    WHERE token_hash = ${hashToken(raw)} AND kind = ANY(${kinds}::text[])
      AND used_at IS NULL AND expires_at > now()
    RETURNING organizer_id, kind
  `;
  if (!rows.length) return null;
  return { organizerId: rows[0].organizer_id, kind: rows[0].kind };
}

module.exports = { hashToken, LIFETIMES_MS, issueToken, peekToken, consumeToken };

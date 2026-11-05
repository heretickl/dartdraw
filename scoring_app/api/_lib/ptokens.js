// Single-use e-mailed links for player accounts (the player_tokens table). Same contract as the organiser app's
// api/_lib/tokens.js: the raw token only ever exists in the e-mail link; the database stores its SHA-256 hash.
const crypto = require('crypto');
const { sql } = require('./db');

const LIFETIMES_MS = {
  verify: 24 * 60 * 60 * 1000,
  reset: 60 * 60 * 1000
};

function hashToken(raw) {
  return crypto.createHash('sha256').update(String(raw)).digest('hex');
}

// Returns the raw token. Earlier unused tokens of the same kind for this player stop working.
async function issueToken(playerId, kind) {
  if (!Object.prototype.hasOwnProperty.call(LIFETIMES_MS, kind)) throw new Error('Unknown token kind: ' + kind);
  const raw = crypto.randomBytes(32).toString('hex');
  await sql`
    UPDATE player_tokens SET used_at = now()
    WHERE player_id = ${playerId} AND kind = ${kind} AND used_at IS NULL
  `;
  await sql`
    INSERT INTO player_tokens (player_id, kind, token_hash, expires_at)
    VALUES (${playerId}, ${kind}, ${hashToken(raw)}, now() + (${LIFETIMES_MS[kind]}::double precision * interval '1 millisecond'))
  `;
  return raw;
}

// Same check as consumeToken but changes nothing. Always follow it with consumeToken, the only thing that claims a token.
async function peekToken(raw, kinds) {
  if (typeof raw !== 'string' || !raw) return null;
  const rows = await sql`
    SELECT player_id, kind FROM player_tokens
    WHERE token_hash = ${hashToken(raw)} AND kind = ANY(${kinds}::text[])
      AND used_at IS NULL AND expires_at > now()
  `;
  if (!rows.length) return null;
  return { playerId: rows[0].player_id, kind: rows[0].kind };
}

// { playerId, kind } if the token exists, is of an allowed kind, is unused and unexpired - and marks it used in the
// same statement, so two concurrent requests cannot both succeed. Otherwise null.
async function consumeToken(raw, kinds) {
  if (typeof raw !== 'string' || !raw) return null;
  const rows = await sql`
    UPDATE player_tokens SET used_at = now()
    WHERE token_hash = ${hashToken(raw)} AND kind = ANY(${kinds}::text[])
      AND used_at IS NULL AND expires_at > now()
    RETURNING player_id, kind
  `;
  if (!rows.length) return null;
  return { playerId: rows[0].player_id, kind: rows[0].kind };
}

module.exports = { hashToken, LIFETIMES_MS, issueToken, peekToken, consumeToken };

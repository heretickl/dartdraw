const crypto = require('crypto');

// Temporary passwords the Admin hands to a player. No 0/O, 1/I/L look-alikes, so one can be read out or typed from a
// phone screen without mistakes. crypto.randomInt (never Math.random) picks every character.
const TEMP_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const TEMP_LENGTH = 10;

function makeTempPassword() {
  let out = '';
  for (let i = 0; i < TEMP_LENGTH; i++) out += TEMP_ALPHABET[crypto.randomInt(TEMP_ALPHABET.length)];
  return out;
}

// Trimmed, inner spaces collapsed, control characters dropped. '' when nothing is left.
function cleanName(s) {
  if (typeof s !== 'string') return '';
  return s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
}

const NAME_MAX = 40;

function toAccount(row) {
  return {
    id: row.id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    confirmed: !!row.email_verified_at,
    createdByAdmin: row.created_by_admin || null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null
  };
}

module.exports = { TEMP_ALPHABET, TEMP_LENGTH, NAME_MAX, makeTempPassword, cleanName, toAccount };

// Shared pieces of the player library endpoints (organiser: api/_routes/players/*, Admin: api/_routes/admin/players/*).
const { LibraryError } = require('../../_lib/players');

const ERRORS = {
  not_set_up: [503, { code: 'library_not_set_up', error: 'The player library is not set up yet.' }],
  invalid_name: [400, { code: 'invalid_name', error: 'Enter a name (up to 80 characters).' }],
  limit: [409, { code: 'player_limit', error: 'You can keep up to 5,000 players.' }],
  duplicate: [409, { code: 'player_exists', error: 'A player with that name and club is already in the list.' }],
  not_found: [404, { code: 'not_found', error: 'Player not found.' }]
};

function bodyObject(req) {
  const b = req.body;
  return b && typeof b === 'object' && !Array.isArray(b) ? b : {};
}

// Answers a LibraryError with its status and body, anything else with 500.
function sendError(res, e) {
  const hit = e instanceof LibraryError && ERRORS[e.code];
  if (hit) { res.status(hit[0]).json(hit[1]); return; }
  res.status(500).json({ code: 'request_failed', error: 'Could not complete that request.' });
}

function methodNotAllowed(res) {
  res.status(405).json({ code: 'method_not_allowed', error: 'Method not allowed' });
}

module.exports = { ERRORS, bodyObject, sendError, methodNotAllowed };

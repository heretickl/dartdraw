const { loadApp, run } = require('./load-app');

function seededRng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

function makeTournament(app, n, opts) {
  opts = opts || {};
  const t = run(app, 'blankTournament')();
  t.eventCreation.saved = true; t.format.saved = true;
  t.format.formatType = 'podknockout'; t.format.podCount = opts.pods || 4; t.format.bestOfLegs = 5;
  t.format.seedingEnabled = !!opts.seeding; t.format.numSeeds = opts.numSeeds || 8; t.format.orgSplit = !!opts.orgSplit;
  t.eventCreation.boards = opts.boards || 64; t.eventCreation.entries = n;
  t.entriesList = Array.from({ length: n }, (_, i) => ({ id: 'e' + i, name: 'Player ' + (i + 1), org: opts.orgOf ? opts.orgOf(i) : '', players: [], withdrawn: false }));
  return t;
}
// Best of 5 means first to 3 legs.
function play(m, side) {
  m.aLegs = side === 'a' ? 3 : 1; m.bLegs = side === 'a' ? 1 : 3; m.winnerId = side === 'a' ? m.aEntryId : m.bEntryId;
}
// Plays every playable match round by round, pushing winners forward.
function playOut(app, bracket, pick) {
  const propagate = run(app, 'propagateByes');
  bracket.rounds.forEach((round) => {
    round.forEach((m) => { if (m.aEntryId && m.bEntryId && !m.winnerId) play(m, pick ? pick(m) : 'a'); });
    propagate(bracket.rounds);
  });
}
// Objects built inside the sandbox have different prototypes, so strict deep-equality needs plain copies.
const plain = (x) => JSON.parse(JSON.stringify(x));
// Makes `t` the app's current tournament (the global `state`).
function useState(app, t) { app.__t = t; run(app, 'state = __t'); }
module.exports = { loadApp, run, plain, useState, seededRng, makeTournament, play, playOut };

// Builds a Group Boards event with the real organiser code and writes its public view for the local viewer:
//   node tests/dev/make-sample-view.js [players=40] [groups=8] [finishedGroups=3]
const fs = require('fs'), path = require('path');
const { loadApp, run } = require('../lib/load-app');
const { toPublicView } = require('../../viewer/api/_lib/publicView');

const players = parseInt(process.argv[2]) || 40, groups = parseInt(process.argv[3]) || 8, finished = parseInt(process.argv[4]);
const app = loadApp();
const t = run(app, 'blankTournament')();
t.eventCreation.tournamentName = 'Sample Open'; t.eventCreation.eventName = 'Group Boards sample'; t.eventCreation.boards = Math.max(groups, 8);
t.format.formatType = 'podknockout'; t.format.podCount = groups; t.format.bestOfLegs = 5; t.format.seedingEnabled = true; t.format.numSeeds = Math.min(16, groups);
t.entriesList = Array.from({ length: players }, (_, i) => ({ id: 'e' + i, name: 'Player ' + (i + 1), org: 'Club ' + (i % 6), players: [], withdrawn: false }));
run(app, 'generatePods')(t); run(app, 'podsConfirmAll')(t);
const propagate = run(app, 'propagateByes');
t.pods.slice(0, Number.isNaN(finished) ? 3 : finished).forEach((p) => {
  p.bracket.rounds.forEach((r) => { r.forEach((m) => { if (m.aEntryId && m.bEntryId && !m.winnerId) { m.aLegs = 3; m.bLegs = 1; m.winnerId = m.aEntryId; } }); propagate(p.bracket.rounds); });
  run(app, 'syncFinalsFromPods')(t);
});
t.publicSlug = 'testslug12'; t.published = true;
const out = path.join(__dirname, 'out');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'view.json'), JSON.stringify(toPublicView(JSON.parse(JSON.stringify(t)))));
console.log('wrote tests/dev/out/view.json for', players, 'players in', groups, 'groups');

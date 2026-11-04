// A Live event for the local viewer (dev tooling only): the raw tournament `data` as the server stores it, plus the rows of the
// live_public view. tests/dev/mock-viewer.js --live serves it through the REAL handler (viewer/api/public/[slug].js) with a fake
// database, so the page gets exactly what production would send. Two slugs: livetest01 (Live: scoring.mode 'live') and manualtst1
// (the same event as a Manual one: no scoring, never any live rows).
//   Group A  e1-e4: e1-e2, e1-e3, e2-e3 played with device stamps (x01); e1-e4 LIVE on a lent board (Board 3, played on Board 7);
//            e2-e4 LIVE cricket (no remaining score); e3-e4 not started
//   Group B  e5-e7: a three-way tie on points, legs won and leg difference (a tie the 3-dart average rule can separate); e8 not played
//   Knockout of 8 (quarters): e1 beat e8; e4-e5 LIVE; e2-e7 LIVE cricket; e3-e6 not started
const NAMES = ['Aiden Tan', 'Brandon Lee', 'Chloe Wong', 'Daniel Lim', 'Elena Cruz', 'Farid Hassan', 'Grace Ong', 'Hari Nair'];
const x = (as, ad, bs, bd) => ({ a: { s: as, d: ad }, b: { s: bs, d: bd } });
const dev = (extra) => Object.assign({ by: 'dev', rv: 2 }, extra);

function makeData(opts) {
  opts = opts || {};
  const live = opts.live !== false;
  const entriesList = NAMES.map((n, i) => ({ id: 'e' + (i + 1), name: n, org: ['Cheras DC', 'Ampang DA', 'KL Eagles'][i % 3] }));
  const m = (id, a, b, aL, bL, win) => ({ id, aEntryId: a, bEntryId: b, aLegs: aL, bLegs: bL, winnerId: win || null, bye: false });
  const stampsKo = (o) => (live ? dev({ x01: o }) : {});
  const rounds = [
    [
      Object.assign(m('km1', 'e1', 'e8', 3, 1, 'e1'), stampsKo(x(1503, 90, 1202, 90))),
      m('km2', 'e4', 'e5', null, null),
      m('km3', 'e2', 'e7', null, null),
      m('km4', 'e3', 'e6', null, null),
    ],
    [m('km5', 'e1', null, null, null), m('km6', null, null, null, null)],
    [m('km7', null, null, null, null)],
  ];
  const data = {
    eventCreation: { tournamentName: 'Sample Open', eventName: 'Live scoring sample', eventType: 'Open', competitionUnit: 'Singles', date: '2026-11-04' },
    format: Object.assign({ formatType: 'rrknockout', bestOfLegs: 5, qualifiersPerGroup: 2, advanceMode: 'seeded', losersPool: false, knockoutLegs: {} },
      live ? { scoring: { mode: 'live', publicStats: !!opts.stats, checkoutHints: !!opts.hints } } : {}),
    tieBreakOrder: opts.rule ? ['3-dart average', 'Head-to-head result', 'Leg difference', 'Legs won', 'Organiser decision / playoff']
      : ['Legs won', 'Leg difference', 'Head-to-head result', 'Organiser decision / playoff'],
    entriesList,
    groups: [
      { id: 'g_a', label: 'A', entryIds: ['e1', 'e2', 'e3', 'e4'], boards: [3], confirmed: true, gameStarted: true, positionOverrides: {},
        scores: {
          'e1|e2': Object.assign({ legs1: 3, legs2: 1 }, live ? dev({ x01: x(1500, 90, 1230, 90) }) : {}),
          'e1|e3': Object.assign({ legs1: 3, legs2: 2 }, live ? dev({ x01: x(2100, 120, 1980, 120) }) : {}),
          'e2|e3': Object.assign({ legs1: 3, legs2: 0 }, live ? dev({ x01: x(1203, 66, 810, 66) }) : {}),
        } },
      { id: 'g_b', label: 'B', entryIds: ['e5', 'e6', 'e7', 'e8'], boards: [4], confirmed: true, gameStarted: true, positionOverrides: {},
        scores: {
          'e5|e6': Object.assign({ legs1: 3, legs2: 1 }, live ? dev({ x01: x(1800, 105, 1500, 105) }) : {}),
          'e6|e7': Object.assign({ legs1: 3, legs2: 1 }, live ? dev({ x01: x(1620, 90, 1400, 90) }) : {}),
          'e5|e7': Object.assign({ legs1: 1, legs2: 3 }, live ? dev({ x01: x(1100, 80, 1650, 80) }) : {}),
        } },
    ],
    pods: [],
    knockout: { id: 'kb1', label: 'Bracket', size: 8, seeds: ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8'], seedLabels: null, rounds },
    published: true, publicSlug: 'livetest01',
  };
  return data;
}

// rows of live_public: { pos, state, board, played_on_board, summary }
function makeRows() {
  return [
    // knockout quarter 2: e4 v e5, on Board 3 but lent to Board 7; e4 (side a) is throwing; legs 1-1, 141 v 60 left
    { pos: 'ko:knockout:0:1', state: 'playing', board: 3, played_on_board: 7,
      summary: { legs: [1, 1], remaining: [141, 60], thrower: 'a',
        last: [{ leg: 2, side: 'a', score: 100, left: 401 }, { leg: 2, side: 'b', score: 180, left: 321 }, { leg: 2, side: 'a', score: 140, left: 261 },
          { leg: 2, side: 'b', score: 140, left: 181 }, { leg: 2, side: 'a', score: 120, left: 141 + 0 }, { leg: 2, side: 'b', score: 121, left: 60 }],
        tot: x(2310, 123, 2160, 120) } },
    // knockout quarter 3: cricket (no remaining score)
    { pos: 'ko:knockout:0:2', state: 'playing', board: 5, played_on_board: 5,
      summary: { legs: [0, 1], remaining: null, thrower: 'b', last: [], tot: null } },
    // round robin Group A: e1 v e4 on Board 3, lent to Board 7 (side a = e1, the first id of the key)
    { pos: 'rr:g_a:e1|e4', state: 'playing', board: 3, played_on_board: 7,
      summary: { legs: [2, 0], remaining: [201, 456], thrower: 'a',
        last: [{ leg: 1, side: 'a', score: 100, left: 401 }, { leg: 1, side: 'b', score: 60, left: 441 }, { leg: 1, side: 'a', score: 100, left: 301 }, { leg: 1, side: 'b', score: 41, left: 400 },
          { leg: 2, side: 'a', score: 180, left: 321 }, { leg: 2, side: 'b', score: 45, left: 456 }],
        tot: x(870, 18, 600, 18) } },
    // round robin Group A: e2 v e4, cricket
    { pos: 'rr:g_a:e2|e4', state: 'awaitingConfirm', board: 4, played_on_board: 4,
      summary: { legs: [3, 2], remaining: null, thrower: null, last: [], tot: null } },
  ];
}

module.exports = { makeData, makeRows, NAMES };

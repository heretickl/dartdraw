// The English words of the public pages: landing (/), Features (/features), How it works (/how-it-works) and the frame of
// the Help page (/help). DATA only: scripts/build-landing.js lays them out. The Bahasa Malaysia twin is
// scripts/i18n/ms/landing.js, with exactly the same keys (tests/i18n-pages.test.js checks it).
// The organiser Help articles themselves are in scripts/help-content.js (BM: scripts/i18n/ms/help-content.js).
// Strings may hold the small inline HTML they always had (<em>, <br>, &mdash;); never <script> or attributes.
module.exports = {
  lang: 'en',
  // <title> and <meta name="description"> of each page
  meta: {
    landing: { title: 'DartDraw – Your tournament. Every draw, organised.', desc: 'Create draws, organise groups and prepare branded darts tournament charts – all in one place.' },
    features: { title: 'Features – DartDraw', desc: 'Round robin, knockout, group boards, live results and branded A4 charts – everything you need to run a darts draw.' },
    how: { title: 'How it works – DartDraw', desc: 'Seven steps from event setup to the final chart: create the event, choose a format, add entries, print, run the day and accept the results, review, print the final chart.' },
    help: { title: 'Help for organisers – DartDraw', desc: 'Step-by-step guides and answers to common questions for DartDraw organisers: setting up an event, running the day, printing, live results and finishing.' }
  },
  // header, closing band, login pop-up and the language switch (every page)
  common: {
    skip: 'Skip to content',
    homeLabel: 'DartDraw home',
    mainNav: 'Main',
    features: 'Features',
    how: 'How it works',
    help: 'Help',
    logIn: 'Log in',
    footerNav: 'Footer',
    tagline: 'Tournament charts, made simple.',
    dialogLabel: 'Log in to DartDraw',
    close: 'Close',
    headlineShared: 'Less time on charts. <em>More time on the oche.</em>',
    headlineNext: 'Ready to run your <em>next draw?</em>'
  },
  landing: {
    eyebrow: 'Built for tournament organisers',
    h1: 'Your tournament.<br>Every draw, <em>organised.</em>',
    lede: 'Create draws, organise groups and prepare branded tournament charts &mdash; all in one place.',
    explore: 'Explore the features',
    ctaNote: 'No account yet? Accounts are created by the site admin.',
    typesLabel: 'Competition types',
    types: ['Singles', 'Doubles', 'Teams'],
    // the decorative app preview (aria-hidden)
    preview: {
      workspace: 'Tournament workspace',
      menu: ['Overview', 'Charts &amp; print', 'Groups', 'Knockout', 'Players', 'Event settings'],
      tabs: ['Round robin', 'Knockout', 'Charts', 'Branding', 'Event details'],
      sub: 'Round Robin &middot; Best of 3',
      pill: 'A4 print preview',
      group: 'GROUP A<small>BOARD 01</small>',
      heads: ['#', 'Player', '1', '2', '3', '4', 'Won', 'Legs', 'Position'],
      matchOrder: 'MATCH ORDER',
      orderText: '1. 1 v 2 &nbsp; 3. 1 v 3 &nbsp; 5. 1 v 4<br>2. 3 v 4 &nbsp; 4. 2 v 4 &nbsp; 6. 2 v 3',
      logo: 'YOUR LOGO HERE',
      sponsor: 'SPONSOR LOGO HERE'
    },
    stripLabel: 'What DartDraw covers',
    stripH: 'One workspace.<br>Every stage of your draw.',
    strip: ['Round robin', 'Knockout', 'Custom branding', 'A4 PDF charts'],
    stepsH: 'From event setup to the first throw.',
    steps: [
      { h: 'Set up your event', p: 'Add tournament details, event type and entries.' },
      { h: 'Build your charts', p: 'Choose your format, groups and board numbers.' },
      { h: 'Review. Save. Print.', p: 'Confirm your layout and prepare your A4 charts.' }
    ],
    detail: 'See how it works in detail'
  },
  features: {
    eyebrow: 'Features',
    h1: 'Everything you need to <em>run the draw.</em>',
    lede: 'From the first group to the final chart, DartDraw handles the sums, the boards and the paperwork.',
    fmtH: 'Three ways to run an event',
    formats: [
      { h: 'Round robin', p: 'Everyone plays within their group, with live standings as scores go in.' },
      { h: 'Knockout', p: 'A straight elimination bracket, with byes added for you. Or Group Boards first: small knockout groups, then a finals bracket.' },
      { h: 'Round robin &rarr; Knockout', p: 'Group stage first, then the top finishers go through to a bracket. Entries that don&rsquo;t advance can play a Plate pool.' }
    ],
    moreH: 'Built around how a tournament day really runs',
    cards: [
      { h: 'A champion for every group &mdash; Group Boards', p: 'Want a group champion before the finals? Choose Knockout, then Group Boards: the field is split into small knockout groups, each on its own boards. Every group crowns a champion, and the champions meet in a Finals bracket.', chip: 'Optional' },
      { h: 'Fair draws, built for you', li: ['Groups are built and balanced automatically', 'Keep entries from the same organisation apart, in a group or in the first knockout round', 'Seeded or random placement into the bracket, with board numbers for each group'] },
      { h: 'Scoring that does the sums', li: ['Enter scores straight onto the chart; standings update as you go', 'Tie-breaks by head-to-head, leg difference, legs won, then your decision &mdash; and DartDraw flags any tie that needs one', 'No-shows, walkovers, withdrawals and check-in'] },
      { h: 'Legs your way', p: 'Set best-of legs for the whole event, or vary them by knockout round: early rounds, quarter-finals, semi-finals and the final.' },
      { h: 'Singles, doubles and teams', p: 'Run singles, doubles or team events. A pair or a team is simply its name on the charts, results and live page. A team match is made of segments (singles, doubles, trios or a foursome, with an optional tie-breaker), and you enter one result: the total legs each team won.' },
      { h: 'Your branding, ready to print', li: ['Your logo, sponsor logos and a rules or footer line', 'An A4 pack of blank charts before the day, and the final chart with every result afterwards', 'A QR code on the group charts and bracket sheets that opens the live page, once results are published'] },
      { h: 'Live results for everyone', li: ['Share one link: players see their group, their next match and the bracket, and can follow friends', 'The page refreshes by itself, and shows &ldquo;Final results&rdquo; when it&rsquo;s done', 'Events can also appear on a public home page'] },
      { h: 'Tools for the day', li: ['Estimated start times, breaks and a board plan', 'Open the round robin and the knockout in separate windows for several screens', 'A private incident log, and accepted results lock the final standings'] },
      { h: 'Safe, and always with you', p: 'Sign in from any device and your events are saved to your account. Only you and the Admin can change them.' }
    ]
  },
  how: {
    eyebrow: 'How it works',
    h1: 'From event setup to <em>the first throw.</em>',
    lede: 'Seven steps, in the order you&rsquo;ll do them. The app guides you through each one.',
    stepsLabel: 'The seven steps',
    steps: [
      { h: 'Event creation', p: 'Name it, choose the category and Singles, Doubles or Teams, set the date and the number of entries: players, pairs or teams.' },
      { h: 'Format &amp; branding', p: 'Pick the format and best-of legs, including a knockout with Group Boards if you want a champion for every group before the finals. Add your logo, sponsors and footer. Basic setup keeps things simple; Advanced adds scheduling, per-round legs and the Plate pool.' },
      { h: 'Chart details', p: 'Add your entries. DartDraw builds balanced groups and gives each its boards, and you can adjust anything by hand.' },
      { h: 'Confirm &amp; Print Bracket', p: 'Check each chart, confirm it, and print the blank A4 pack. Want QR codes on the sheets? Publish the results first: this step offers a button for it.' },
      { h: 'Manage Tournament', p: 'Run the day: start the games, enter scores and watch standings update. When the groups are done, draw the knockout. Share the live link so players can follow along. When the final is in, click Accept &amp; finalize at the bottom of this step: the live page then shows &ldquo;Final results&rdquo;.' },
      { h: 'Finalize Standings', p: 'Review the final tables and placings. This step is read-only: to fix a score, go back to Manage Tournament.' },
      { h: 'Print Final Chart', p: 'Print the completed chart with every result, or save it as a PDF.' }
    ],
    gtkH: 'Good to know',
    notes: [
      { b: 'Saved as you go', p: 'Everything saves to your account, so you can pick up on any device.' },
      { b: 'Live pages update themselves', p: 'Players don&rsquo;t need to refresh to see new results.' },
      { b: 'Accepted results are locked', p: 'Once you accept them with Accept &amp; finalize, only the Admin can reopen them.' }
    ]
  },
  // the frame of the Help page around the articles, and the search box
  helpPage: {
    eyebrow: 'Help',
    searchLabel: 'Search the help',
    placeholder: 'Try &ldquo;no-show&rdquo;, &ldquo;wrong score&rdquo; or &ldquo;print&rdquo;',
    articlesLabel: 'Help articles and questions',
    contentsLabel: 'Help contents',
    contents: 'Contents',
    jump: 'Jump to a topic',
    quickAnswers: 'Quick answers',
    start: 'New to DartDraw? Start with the <a href="#quick-start">Quick start</a>. Not sure what a word means? See <a href="#glossary">Words you will see</a>. Something not working? See <a href="#troubleshooting">When something goes wrong</a>.',
    spectatorBefore: 'Following an event as a spectator? The public results site has its own ',
    spectatorLink: 'help page for spectators',
    spectatorAfter: '.',
    logInTo: 'Log in to DartDraw',
    noAnswerBefore: 'No answer for &ldquo;',
    noAnswerAfter: '&rdquo;.',
    tryFewer: 'Try fewer words, or a different word. Or start with one of these:',
    linkToSection: 'Link to this section',
    backToTop: 'Back to top &uarr;',
    // what the search itself says ({n} is a number); given to help-search.js as page data
    search: {
      count: { one: '1 result', other: '{n} results' },
      near: { one: 'No direct answer. 1 close match', other: 'No direct answer. {n} close matches' },
      nearLabel: 'Closest matches:',
      showAll: 'Show all {n} results'
    }
  },
  // the EN | BM switch and the "Bahasa Malaysia tersedia" note (same words on both language versions)
  switcher: {
    group: 'Language / Bahasa',
    en: 'English',
    ms: 'Bahasa Malaysia'
  }
};

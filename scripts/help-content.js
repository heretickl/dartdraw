// The words on the public Help page (/help): the organiser guide and the FAQ.
// This file is DATA only. scripts/build-landing.js turns it into help.html (npm run build-landing).
//
// How to edit
//   - A section has an id, a title, a kind ('guide' or 'faq') and a list of items. The guide is several sections
//     (Start here, Set up an event, On the day, ...), each with its own heading in the contents list.
//   - aliases (on a section or an item): old ids that must keep working as #anchors after a move. Each becomes an
//     empty element with that id at the top of the section or item. Never delete an alias someone may have linked.
//   - The organiser app links straight to some ids (helpHref in app.html: the ? links and "Learn more" in messages);
//     tests/help-site.test.js checks every one of them exists here.
//   - Every item has an id (used as the #anchor, so keep it short, lower case, with dashes and never change one that
//     is already linked), a title (the heading, or the question) and a body (HTML).
//   - Guide items may also have a summary: one sentence shown under the heading.
//   - Any item may have keywords: extra words the search box matches (synonyms people type, such as 'login' or 'pairs').
//     They are not shown on the page.
//   - An item may list claims: ['ko-cascade', ...]. Each tag names a statement about what the app does, and
//     tests/help-claims.test.js runs the app to check it. Add a tag (and its test) when you write such a sentence.
//   - Use the exact button and label names from the app, in <b>bold</b>. Use <h4> for sub-headings inside a guide item.
//   - Link to another item with <a href="#its-id">. Do not add <script>, email addresses or the words that
//     tests/help-site.test.js forbids. Run: npm run build-landing, then npm test.
//   - Write what the app really does. When in doubt, read app.html.

/* The address of the public results site (its own Vercel project). It is only used for the link to the spectators' help page. */
const VIEWER_URL = 'https://dartdraw-viewer.vercel.app';
const VIEWER_HELP_URL = VIEWER_URL + '/help';

const sections = [
  {
    id: 'start-here',
    title: 'Start here',
    kind: 'guide',
    aliases: ['guide'],
    items: [
      {
        id: 'quick-start',
        title: 'Quick start: run your first event in about 10 minutes',
        summary: 'Seven steps for a first event: 24 players, singles, 4 dartboards, groups then a knockout.',
        keywords: 'tutorial walkthrough example first new beginner begin start set up setup how to quickstart players first event new event 24 players sample practice try',
        body: `
<p>The example: 24 players, one evening, 4 dartboards. Everyone plays in groups of 4, then the top 2 of each group play a knockout. Work down the steps in the left-hand menu. Each one opens when the one before is saved. New words are explained in <a href="#glossary">Words you will see</a>.</p>
<ol class="qsteps">
<li id="quick-start-step-1"><b>Create the event.</b> Click <b>+ New tournament</b>. Type a <b>Tournament name</b> and an <b>Event name</b>, and leave <b>Competition type</b> on <b>Singles</b>. Set the <b>Tournament date</b> and type 24 in <b>Number of entries</b>. Click <b>Save event creation &rarr;</b>.
<span class="see">You should see: step 2, <b>Format &amp; branding</b>. More: <a href="#creating-an-event">Create the event</a>.</span></li>
<li id="quick-start-step-2"><b>Choose the format.</b> Click <b>Format</b> to open it, choose <b>Round robin &rarr; Knockout</b> and set <b>Best of legs</b> to 3. Leave <b>Maximum entries per group</b> at 4 and <b>Entries per group (advance to knockout)</b> at 2. Under <b>Scheduling</b>, check it says 4 boards (new events start with 4; <b>Edit scheduling settings</b> changes it). Then click <b>Save format &amp; branding &rarr;</b>.
<span class="see">You should see: step 3, <b>Chart details</b>, with 24 entries called &ldquo;Entry 1&rdquo; to &ldquo;Entry 24&rdquo;. The blue box may suggest a different split; it is only a suggestion. More: <a href="#choosing-a-format">Choose a format</a>.</span></li>
<li id="quick-start-step-3"><b>Type the names and draw the groups.</b> Type each player&rsquo;s name over &ldquo;Entry 1&rdquo;, &ldquo;Entry 2&rdquo; and so on, then click <b>Random draw</b>. Click <b>Review print pack &rarr;</b>.
<span class="see">You should see: six groups, A to F, of 4 players each, each with a board. Groups that share a board play one after another. More: <a href="#draw">Drawing the groups</a>.</span></li>
<li id="quick-start-step-4"><b>Confirm, publish, print.</b> On step 4, click <b>Confirm all 6 charts</b>. If spectators will follow on their phones, click <b>Publish results now</b> in the note above the print button <em>first</em>, so the QR codes print. Then click <b>Print bracket pack</b> and choose a printer or <b>Save as PDF</b>.
<span class="see">You should see: your browser&rsquo;s print window with the running order and one chart for each group. More: <a href="#print-pack">Printing the blank pack</a> and <a href="#qr-codes">QR codes</a>.</span></li>
<li id="quick-start-step-5"><b>Play the groups.</b> On step 5, <b>Manage Tournament</b>, click <b>Start all games</b> and confirm in the box. Then click the box where two players meet, type the legs each won (for example 2 and 1) and click <b>Save score</b>.
<span class="see">You should see: the standings under that chart update at once. More: <a href="#enter-scores">Entering scores</a>.</span></li>
<li id="quick-start-step-6"><b>Run the knockout.</b> When every group is finished, click <b>Generate knockout bracket</b> in the <b>Knockout stage</b> card. Enter each knockout match the same way: click it, type the legs and click <b>Save score</b>.
<span class="see">You should see: the top 2 of each group, 12 players, in the bracket. Four of them start in round 2 (a bye). Each winner moves on by itself. More: <a href="#rr-knockout-draw">Drawing the knockout from a round robin</a>.</span></li>
<li id="quick-start-step-7"><b>Finish.</b> When the final is in, go to the bottom of step 5 and click <b>Accept &amp; finalize</b>. Then click <b>Accept &amp; finalize</b> again in the box &ldquo;Accept results as final?&rdquo;. You cannot undo this; only an Admin can reopen the event.
<span class="see">You should see: &ldquo;Results finalized&rdquo;, and the public page says <b>Final results</b>. Step 7, <b>Print Final Chart</b>, prints the results. More: <a href="#finishing-the-event">Finish the event</a>.</span></li>
</ol>
<h4 id="sample-event">Try it first with a sample event</h4>
<p>While you have no saved events, the welcome screen shows a <b>Get started</b> card with these seven steps. Its <b>Try a sample event</b> button opens a practice event: 12 players, round robin then knockout, with the names already typed. You can change anything in it. A banner says &ldquo;This is a sample event. Nothing is saved.&rdquo;</p>
<ul>
<li><b>Save as my event</b> keeps it: from then on it is an ordinary event in <b>Saved tournaments</b>.</li>
<li><b>Close sample</b> throws it away. So does opening another event, starting a new one or logging out.</li>
</ul>
<p>A sample event cannot be published, finalized or opened in a full-page window until you save it as your event.</p>
<p>Stuck? See <a href="#troubleshooting">When something goes wrong</a>, <a href="#glossary">Words you will see</a> or the <a href="#faq">questions</a>. No account yet? See <a href="#no-account">No account yet?</a></p>
`
      },
      {
        id: 'getting-started',
        title: 'No account yet? Signing in and passwords',
        summary: 'How to get an account, sign in, and change or reset your password.',
        keywords: 'login log in signin sign up signup register registration account invite invitation admin password cant sign in log on getting started',
        body: `
<h4 id="no-account">No account yet?</h4>
<p>Accounts are created by the site admin, usually the person who runs DartDraw for your club or league. Unless the sign-in box shows a <b>Sign up</b> link, you cannot make one yourself: ask your admin to create it. You then get a link to choose your password, and you sign in as below.</p>
<p>The sign-in page and the account emails are in English and Bahasa Malaysia: see <a href="#languages">English or Bahasa Malaysia</a>.</p>
<p>The sign-in box says the same under <b>Sign in</b>: &ldquo;No account yet? Accounts are created by the site admin.&rdquo; Your admin can add a line under it saying who to ask and how. If your club has no admin yet, the person who set up DartDraw for you can create one. See also <a href="#faq-admin">Who is the Admin, and how do I reach them?</a></p>

<h4 id="signing-in">Signing in</h4>
<p>Your site admin creates your account and sends you a link to choose a password. After that:</p>
<ol>
<li>Click <b>Log in</b> at the top of any public page.</li>
<li>Type your email and password, then click <b>Sign in</b>.</li>
<li>You land in the organiser app, where all your events live. New to it? Start with the <a href="#quick-start">Quick start</a>.</li>
</ol>
<p>Forgot your password? The surest way is to ask your admin for a reset link. You can also click <b>Forgot password?</b> under the sign-in form and type your email. If a link arrives, follow it. If nothing arrives, ask your admin.</p>
<p>To change your password while you are signed in, click <b>Change password</b> next to <b>Log out</b> in the left-hand menu. On a phone or a narrow window, tap the step name in the bar at the top, then <b>Change password</b>. Type your <b>Current password</b>, then your <b>New password</b> twice. It must be at least 8 characters. Changing it signs you out on your other devices, but not on the one you are using.</p>
`
      },
      {
        id: 'how-dartdraw-works',
        title: 'How DartDraw works: the seven steps and saving',
        summary: 'The seven steps in the left-hand menu, Basic or Advanced setup, and what the save messages mean.',
        keywords: 'steps seven steps overview menu basic advanced setup mode save saving saved autosave getting started',
        body: `
<h4 id="seven-steps">The seven steps</h4>
<p>The left-hand menu lists seven steps. Work down the list. You cannot skip ahead: step 2 opens once step 1 is saved, and step 3 opens once step 2 is saved. Each step&rsquo;s title has a small <b>?</b> beside it that opens the matching part of this Help.</p>
<ol>
<li><b>Event creation</b>: name the event and say how many entries play.</li>
<li><b>Format &amp; branding</b>: choose the format, legs, boards, logos and rules.</li>
<li><b>Chart details</b>: names, seeds, organisations and the draw.</li>
<li><b>Confirm &amp; Print Bracket</b>: check each chart, confirm it and print the blank pack.</li>
<li><b>Manage Tournament</b>: start the games, enter scores, share live results and finish the event with <b>Accept &amp; finalize</b> at the bottom.</li>
<li><b>Finalize Standings</b>: a read-only look at the final standings. It does not close the event.</li>
<li><b>Print Final Chart</b>: print the pack with every result filled in.</li>
</ol>

<h4 id="setup-mode">Basic or Advanced setup</h4>
<p>At the top of step 1, under <b>Setup mode</b>, you choose &ldquo;Basic&rdquo; or &ldquo;Advanced&rdquo;. In this guide they are called Basic setup and Advanced setup.</p>
<ul>
<li>&ldquo;Basic&rdquo; is the essentials: format, groups and scores. New events start here.</li>
<li>&ldquo;Advanced&rdquo; adds scheduling details (level of play, start time and breaks) and different best-of-legs for each knockout round. It also adds the Plate pool, sponsor logos with a footer line, and your own tie-break order.</li>
</ul>
<p>You can switch at any time, on step 1 or with the <b>Switch to Advanced</b> link at the top of step 2. Switching never deletes anything you have already set.</p>

<h4 id="autosave">Saving your work</h4>
<p>On steps 1 and 2, what you type is saved when you click the button at the bottom of the form: <b>Save event creation &rarr;</b> or <b>Save format &amp; branding &rarr;</b>. After that, every change is saved to your account by itself, a moment after you make it. Names save when you click or tab out of the box.</p>
<p>The save status sits in the left-hand menu, under your name. On a narrow screen it is in the bar at the top, and in the full-page window it is in the header. It can say:</p>
<dl class="msgs">
<dt>Saving&hellip;</dt>
<dd>Your change is on its way to your account.</dd>
<dt>Saved</dt>
<dd>All good. Your change is stored, and any device you sign in on will see it.</dd>
<dt>Couldn&rsquo;t save &mdash; click to retry</dt>
<dd>The change did not reach the server, usually because the connection dropped. Check your internet, then click the message to try again. Keep the page open until it says <b>Saved</b>. Until then DartDraw will not open another event or start a new one: it keeps you on this one and says &ldquo;Last change not saved yet&rdquo;. You can choose <b>Leave without saving</b>, but that change is then gone. <b>Log out</b> waits for it the same way, and if you close or reload the page meanwhile, your browser asks you first.</dd>
<dt>Updated elsewhere &mdash; click to reload</dt>
<dd>A newer copy of this event was saved in another tab, window or device, so the copy on your screen is out of date. A red banner also appears at the top of the page: &ldquo;Updated elsewhere &mdash; reload to get the latest.&rdquo; Your last change in this window was not saved, and from now on this window saves nothing for this event, so it cannot write over the newer results. Click <b>Reload</b> on the banner (or click the message) to load the latest copy. Then check it and enter your last change again.</dd>
<dt>Deleted elsewhere &mdash; this event is no longer saved</dt>
<dd>The event was deleted (or moved to another organiser) in another window or device. Nothing you change here can be saved. Open another event.</dd>
<dt>Finalizing&hellip;</dt>
<dd>You accepted the results and DartDraw is closing the event. Wait for it to finish.</dd>
<dt>This event is finalized &mdash; only an Admin can change it</dt>
<dd>The event is closed. See <a href="#finishing-the-event">Finish the event</a>.</dd>
</dl>
<p>A sample event is never saved, so it shows no save status. See <a href="#sample-event">Try it first with a sample event</a>.</p>
`
      },
      {
        id: 'languages',
        title: 'English or Bahasa Malaysia: screens, printed sheets and emails',
        summary: 'The EN | BM switch, the language each event prints in, and why account emails come in both languages.',
        claims: ['language-switch', 'sheet-language'],
        keywords: 'language languages english bahasa malaysia bahasa melayu malay melayu bm en translate translation translated switch change language screen language print language printed sheets language sheet language paper language print in malay print in english email emails bilingual two languages both languages',
        body: `
<h4 id="language-switch">The EN | BM switch</h4>
<p>DartDraw is in English and in Bahasa Malaysia. In the organiser app the EN | BM switch is at the top right, next to <b>Help</b>. On a narrow screen it is in the bar at the top, or in the menu that opens from the step name, under &ldquo;Bahasa:&rdquo;. The public pages and the sign-in page have the same switch at the top (the sign-in box that opens over a public page follows that page).</p>
<p>A click changes every word on the screen at once. Switching saves nothing and changes nothing in your event: you stay on the same step, an open box stays open, and what you typed stays in its box.</p>
<p>DartDraw remembers your choice in this browser. The organiser app, the public pages (this Help too) and the sign-in page share it: choose BM on one and the others open in BM as well. The <b>Help</b> link and the <b>?</b> links open this Help in the language on your screen. The public results site, where spectators follow your event, has its own EN | BM switch and remembers its own choice: it does not change the language of your screens, and your choice does not change theirs.</p>

<h4 id="sheet-language">Printed sheets language</h4>
<p>The language of the paper is a setting of each event, separate from the language on your screen. <b>Printed sheets language</b> sits with the other print settings on step 4, <b>Confirm &amp; Print Bracket</b>, and on step 7, <b>Print Final Chart</b>: choose <b>English</b> or <b>Bahasa Malaysia</b>.</p>
<ul>
<li>Every sheet of the event uses it: the charts and brackets, the running order, the rules sheet, the lineup sheets, the Players A&ndash;Z and Boards sheets, and the print previews on steps 4 and 7.</li>
<li>It belongs to the event, so the paper is the same whoever prints it and whatever language their screen shows. For example, your screens can be in BM while the sheets print in English.</li>
<li>A new event starts with the language your screen shows when you create it. Events made before this setting existed print in English. A duplicated event keeps the setting.</li>
<li>Names, and everything you typed (the event name, the rules, the sponsor footer), print as you typed them. Automatic names such as &ldquo;Player A1&rdquo; are stored in the language of the screen when they were made.</li>
<li>On a finalized event the setting is locked, like the other print settings.</li>
</ul>

<h4 id="bilingual-emails">Emails in both languages</h4>
<p>DartDraw does not know which language you read when it emails you, so every account email is in both languages: English first, then Bahasa Malaysia, in the same message, with both in the subject line. That includes the email to verify your email address, the one with a link to reset your password, and the one you get when an admin creates your account or sends you a new password link. The link is the same in both halves.</p>
`
      }
    ]
  },
  {
    id: 'set-up',
    title: 'Set up an event',
    kind: 'guide',
    items: [
      {
        id: 'creating-an-event',
        title: 'Create the event (step 1)',
        summary: 'Name it, choose Singles, Doubles or Teams, set the date and the number of entries (players, pairs or teams).',
        keywords: 'players pairs teams people entries how many new event new tournament add players date dartboard dartboards number of boards creating an event',
        body: `
<p>Click <b>+ New tournament</b> at the top of the left-hand menu. Step 1 is called <b>Event creation</b>. Fill in:</p>
<ol>
<li><b>Setup mode</b>: &ldquo;Basic&rdquo; or &ldquo;Advanced&rdquo;. See <a href="#setup-mode">Basic or Advanced setup</a>.</li>
<li><b>Tournament name</b>: the day or competition, for example Spring Open 2026. It is printed on every sheet.</li>
<li><b>Event name</b>: this competition inside it, for example Open Singles.</li>
<li><b>Event category</b>: <b>Open</b>, <b>Women</b> or <b>Youth</b>. It is printed on the charts.</li>
<li><b>Competition type</b>: <b>Singles</b>, <b>Doubles</b> or <b>Teams</b>.</li>
<li><b>Tournament date</b>: shown on the charts. The public home page also uses it to list upcoming events.</li>
<li><b>Number of entries</b>: at least 2. An entry is a player in Singles, a pair in Doubles and a team in Teams. The box says so: in a Doubles event it is called <b>Number of pairs</b>, and in a Teams event <b>Number of teams</b>.</li>
</ol>
<p>Click <b>Save event creation &rarr;</b> to move on to step 2.</p>

<h4 id="singles-or-doubles">Singles, Doubles or Teams</h4>
<p>In <b>Singles</b>, one entry is one player.</p>
<p>In <b>Doubles</b>, one entry is a <b>pair</b> of two players. The number of entries is the number of pairs, so 24 players make 12 pairs: type 12 in <b>Number of pairs</b>. In step 3 each pair has one box, the <b>Pair name</b>. Charts, results and the public page show the pair name, so choose something both players recognise, such as both surnames together.</p>
<p>In <b>Teams</b>, one entry is a <b>team</b>, and in step 3 it has one box, the <b>Team name</b>. There is no list of players to fill in: captains write their line-up on the day. A team match is made of segments that you set on step 2. See <a href="#teams">Set up a Teams event</a>.</p>

<h4 id="boards-and-entries">Boards and the number of entries</h4>
<p>There is no boards box on step 1. You set the number of boards on step 2, under Scheduling.</p>
<p>You can change the number of entries later: click <b>Edit</b> on the summary card at the top of a step, change the number and save. Raising it adds blank entries such as &ldquo;Entry 9&rdquo;. Lowering it removes entries from the end of the list, so do that before you type names or draw groups.</p>
<p>Once one of those entries is playing (their group has started, they have a result, or they are in the drawn knockout), DartDraw refuses with &ldquo;These entries are already playing&rdquo; and saves nothing. Doing it would delete results already played. See <a href="#faq-entries-locked">Why can&rsquo;t I change the entries after the games start?</a></p>
<p>If you see a message that your account allows up to a certain number of entries per event, contact your admin.</p>

<h4 id="your-events">Your saved events</h4>
<p>Your events are listed under <b>Saved tournaments</b> in the left-hand menu. Click one to open it. Each has three small buttons:</p>
<ul>
<li><b>Rename</b> changes the tournament name.</li>
<li><b>Duplicate</b> makes a copy called &ldquo;&hellip; (copy)&rdquo; with everything in it. The copy is not published, not listed and not finalized, so you can edit it.</li>
<li><b>Delete</b> removes the event from your account for good. It cannot be undone.</li>
</ul>
<p>On step 1, <b>Discard / New tournament</b> throws away the form and starts a fresh event. A finalized event cannot be renamed or deleted by you.</p>
`
      },
      {
        id: 'choosing-a-format',
        title: 'Choose a format (step 2)',
        summary: 'Which format suits your field, then round robin, knockout (one bracket, or Group Boards then finals) or round robin then knockout, plus legs, boards, branding and rules.',
        keywords: 'format which format round robin knockout legs best of boards group stage choosing a format decide how many players',
        body: `
<p>Step 2 is <b>Format &amp; branding</b>. It has four sections: <b>Format</b>, <b>Scheduling</b>, <b>Branding &amp; print</b> and <b>Rules</b>. Click a section heading to open or close it. Click <b>Save format &amp; branding &rarr;</b> when you are done.</p>

<h4 id="which-format">Which format should I choose?</h4>
<dl class="msgs">
<dt>A small field, and time for everyone to play everyone in their group</dt>
<dd><b>Round robin</b>. Everyone gets the same number of matches, and the tables decide the places.</dd>
<dt>A big field and little time</dt>
<dd><b>Knockout</b>, <b>Single bracket</b>. It has the fewest matches: lose once and you are out.</dd>
<dt>One evening, everyone plays a few matches, then a final</dt>
<dd><b>Round robin &rarr; Knockout</b>. Groups first, then the top of each group play a knockout. The <a href="#quick-start">Quick start</a> uses it for 24 players.</dd>
<dt>A very big field, with many boards</dt>
<dd><b>Knockout</b>, then <b>Group Boards, then finals</b>. Each group of players has its own board and its own little bracket, and the group champions meet in the Finals.</dd>
<dt>Teams of players</dt>
<dd>Choose <b>Teams</b> as the <b>Competition type</b> on step 1, then any of the formats above. See <a href="#teams">Set up a Teams event</a>.</dd>
</dl>
<p>Not sure how long it takes? With a start time set (Advanced setup), DartDraw estimates it for you. See <a href="#scheduling">Scheduling</a>.</p>

<h4 id="format-types">The formats</h4>
<p>Under <b>Competition format</b> pick one of three:</p>
<ul>
<li><b>Round robin</b>: entries play within their groups. Everyone in a group plays everyone else in it once.</li>
<li><b>Knockout</b>: direct elimination. Lose and you are out. Under <b>Knockout type</b> choose one of two:
<ul>
<li><b>Single bracket</b>: the usual choice. It is one bracket. If the number of entries does not fill it, the app adds byes in round 1 and gives them to the best seeds.</li>
<li><b>Group Boards, then finals</b>: small knockout groups first, each on its own board, so every group has a champion before the finals. See below.</li>
</ul></li>
<li><b>Round robin &rarr; Knockout</b>: a group stage first, then the top finishers go into a bracket.</li>
</ul>

<h4 id="legs">Best of legs</h4>
<p>The <b>Best of legs</b> box sets how long a match is. A leg is one game of darts. Odd numbers are best. Best of 5 means the first to 3 legs wins. When you enter a result, the winner must have exactly that many legs and the loser fewer. An even number shows a warning, because it can end level.</p>
<p>A Teams event has no <b>Best of legs</b> box: each segment of a team match has its own. See <a href="#teams">Set up a Teams event</a>.</p>

<h4 id="round-robin-setup">Round robin</h4>
<p>Choose <b>Maximum entries per group</b> (3 to 6). A blue box under it shows the split DartDraw recommends, for example how many groups and how many matches each group plays. DartDraw balances the groups when it draws them.</p>

<h4 id="rr-ko-setup">Round robin &rarr; Knockout</h4>
<ul>
<li><b>Entries per group (advance to knockout)</b>: how many from each group go into the bracket.</li>
<li><b>How entries are placed into the bracket</b>: <b>Seeded by group standing (recommended)</b> puts group winners ahead of runners-up. It also keeps entries from the same group apart for as long as possible. <b>Random draw</b> mixes them up.</li>
<li><b>Plate pool</b> (Advanced setup): tick <b>Also run a Plate pool knockout bracket for entries that don&rsquo;t advance</b>. Leave <b>Plate entries per group</b> empty to send everyone who does not advance to the Plate pool. Type a number to cap it, so anyone ranked below that is out.</li>
</ul>
<p>The bracket is not drawn until every group has finished. You draw it in step 5. See <a href="#running-the-knockout">Run the knockout</a>.</p>

<h4 id="group-boards">Group Boards, then finals (a Knockout option)</h4>
<p>Choose <b>Knockout</b>, then <b>Group Boards, then finals</b>. It suits big fields and anyone who wants a group champion before the finals. Instead of one big bracket you choose a number of small groups, and each group is a little knockout on its own board. Every group ends with a champion, and the champions meet in a <b>Finals</b> bracket. You do not have to use it, and it is not offered with the round robin formats.</p>
<ul>
<li><b>Number of groups</b>: at least 2, at most 128. Each group needs at least 2 players and holds at most 128 (a group is one knockout bracket). DartDraw tells you if the numbers do not fit. Moving a player or placing a late entry into a group that already has 128 players is refused; swap two players instead.</li>
<li><b>Best of legs inside each group</b> can differ from the Finals. The Finals uses <b>Best of legs</b> (or your knockout leg settings in Advanced setup).</li>
<li>In step 3 you click <b>Draw groups</b>. Seeded players are spread one per group, and the groups can be changed by hand until you confirm them.</li>
<li>The Finals chart is built as soon as the last group is confirmed, with slots such as &ldquo;Winner of Group 3&rdquo;.</li>
</ul>

<h4 id="knockout-legs">More legs in later rounds</h4>
<p>In Advanced setup a knockout has a tick box that raises the legs in later rounds. (A Teams event does not have it: every round uses the same segments.) Tick it and you can set <b>Early rounds</b>, <b>Quarterfinal</b>, <b>Semifinal</b> and <b>Final</b> separately. Every round before the quarterfinal uses <b>Early rounds</b>. The Plate pool has its own, independent settings.</p>

<h4 id="scheduling">Scheduling</h4>
<p>Click <b>Edit scheduling settings</b>. <b>Number of boards available</b> sets the board choices later on. In Advanced setup you can also set <b>Level of play</b> (Professional, Amateur or Novice), an <b>Anticipated start time</b> and breaks. DartDraw uses these to estimate how long the event takes and to show &ldquo;On schedule&rdquo; or &ldquo;Running behind&rdquo; while you play. These are rough guides. They are never printed.</p>

<h4 id="branding-and-rules">Branding and rules</h4>
<ul>
<li><b>Tournament logo</b>: best as a square or near-square PNG. DartDraw resizes it for you.</li>
<li><b>Sponsor logos</b> and <b>Optional print rules / footer text</b> (Advanced setup): sponsor logos print in the chart footer. Pick a rectangle or a square for each one.</li>
<li><b>Walkover, conduct &amp; other rules</b>: free text printed on the rules sheet.</li>
<li><b>Tie-break order</b> (Advanced setup): move the rules up or down. See <a href="#faq-tie-breaks">How do tie-breaks work?</a></li>
</ul>
`
      },
      {
        id: 'entries-and-check-in',
        title: 'Add entries, seeds and organisations (step 3)',
        summary: 'Naming entries (players, pairs or teams), organisations and seeding.',
        keywords: 'players names add players player names seed seeding seeds clubs club organisation organization entries',
        body: `
<p>Looking for check-in, withdrawals or no-shows? See <a href="#check-in-and-start">Check people in and start the games</a> and <a href="#player-leaves">No-shows and players who leave</a>.</p>

<h4 id="naming-entries">Naming entries</h4>
<p>Entries start with placeholder names such as &ldquo;Entry 1&rdquo;. Once groups are drawn, entries without a name of your own are labelled by position, for example &ldquo;Player A1&rdquo; or &ldquo;Pair A1&rdquo;. Type a name in the box and it stays.</p>
<p>A pair or a team is just its name: there are no boxes for the players in it. Put what you want people to see on charts and the public page in that name, for example both surnames for a pair.</p>

<h4 id="organisations">Organisations</h4>
<p>Use the <b>Organisation (optional)</b> box for a club or organisation name. Then tick the box that keeps them apart:</p>
<ul>
<li><b>Round robin:</b> the <b>Organisation (optional)</b> box is always there on step 3. Tick <b>Avoid same-organisation clashes</b>. It also reshuffles existing clashes where it can. In Advanced setup the same option is under Rules on step 2.</li>
<li><b>Knockout and Group Boards:</b> the <b>Organisation (optional)</b> box is hidden at first. It appears once you tick <b>Track organisation (avoid same-organisation matchups in the first round)</b> on step 3.</li>
</ul>
<p>It is a best effort. If there is no safe swap anywhere, a clash is left in place.</p>
<p>In every knockout bracket, entries whose organisation is filled in are kept apart as long as possible, whether or not one of the tick boxes is on. That means a knockout, the knockout after a round robin, the Plate pool and Group Boards groups. When the bracket comes from a round robin, keeping entries from the same group apart comes first, and the same organisation second.</p>
<p>Each draw is given about a second of work at most. In a big bracket (from about 30 entries) with many entries from one or two organisations, the result is the best DartDraw found in that time. Entries are still spread out, but a little less evenly than a much longer search could manage. Now and then a pair meets a round earlier than it might. So the projected bracket printed before the round robin can differ from the real draw when organisations are filled in.</p>

<h4 id="seeds">Seeds</h4>
<p>In a <b>Knockout</b>, step 3 shows <b>Participants &amp; Seeding</b>. Seeding is off by default, which means a fresh random draw every time you generate the bracket. Tick <b>Seed this bracket</b>, then use the up and down arrows to put entries in order. <b>Number of seeds</b> (4, 8, 16, 32 or 64) sets how many of the top entries show a seed number on the printed chart. Everyone is still placed using your order. Seeds 1 and 2 can only meet in the final, and the best seeds get any byes.</p>
<p>In <b>Round robin &rarr; Knockout</b>, seeds come from the group results. Entries show labels like &ldquo;A1&rdquo; (group A, first place). In <b>Group Boards</b>, the same seed list is used and seeds are spread one per group.</p>
`
      },
      {
        id: 'draw-the-groups',
        title: 'Draw the groups or the bracket (step 3)',
        summary: 'Random draw, swaps, boards for each group, and where a knockout or Group Boards draw happens.',
        claims: ['roster-lock'],
        keywords: 'draw random draw groups group swap move redraw board boards shuffle',
        body: `
<h4 id="draw">Drawing the groups</h4>
<p>In a round robin, step 3 is called <b>Draw &amp; groups</b>. Entries stay as &ldquo;Not drawn&rdquo; until you click <b>Random draw</b>. Click it again to deal everyone out afresh; DartDraw asks first because it discards your manual swaps. Once any group has started, <b>Random draw</b> is greyed out and <b>Swap with&hellip;</b> is no longer offered for entries in a started group. Moving entries then would leave results with people who did not play them.</p>
<ul>
<li>Switch between <b>Flat list</b> and <b>Grouped view</b>. The flat list has a search box for name or organisation.</li>
<li><b>Swap with&hellip;</b> opens a list of groups and positions. Pick one. If it is occupied the two entries swap. If it is blank the entry moves there.</li>
<li>Each group has a board. In the Grouped view you tick <b>Board(s)</b>. Groups on the same board play one after another. Tick more than one board to share a group&rsquo;s matches across them.</li>
</ul>
<p>The first match on every chart is 1 v 2. Each chart also lists the match order and suggests a marker for every match, chosen from the other entries in the group. A Teams event has no markers: each team scores its own match on the lineup sheet.</p>

<h4 id="draw-knockout">Drawing a knockout bracket</h4>
<p>A <b>Knockout</b> has no groups to draw. Set the seeds on step 3 if you want them (see <a href="#seeds">Seeds</a>), then click <b>Generate bracket</b> on step 4. Byes go to the best seeds; see <a href="#faq-byes">How are byes decided in a knockout?</a></p>
<p>In <b>Group Boards</b>, click <b>Draw groups</b> on step 3. See <a href="#group-boards">Group Boards, then finals</a>.</p>
`
      },
      {
        id: 'draws-and-printing',
        title: 'Check and print the blank pack (step 4)',
        summary: 'Confirm the charts, then print the blank pack: charts, rules sheet, logos and QR codes.',
        claims: ['print-order'],
        keywords: 'print printing blank pack qr marker confirm draws and printing',
        body: `
<h4 id="confirm">Confirming</h4>
<p>Step 4 is <b>Confirm &amp; Print Bracket</b>. Check each group, then click <b>Confirm this chart</b>, or <b>Confirm all N charts</b>. The confirm box warns you about problems such as a missing entry or two identical names. If you later change who is in a confirmed group, it is un-confirmed for you with the note &ldquo;Un-confirmed automatically&rdquo;. Confirm it again.</p>
<p>For a Knockout, step 4 has <b>Generate bracket</b> (or <b>Regenerate bracket</b>). Regenerating after results exist wipes them, and asks first.</p>

<h4 id="print-pack">Printing the blank pack</h4>
<p>Click <b>Print bracket pack</b>. The pack is A4 landscape and can include, in this order:</p>
<ul>
<li>the rules &amp; format sheet, always the first page when it is ticked (tick box on the same screen);</li>
<li>a master running order, straight after the rules sheet (or first, if you leave the rules sheet out). It has one column per board (up to 8 on a sheet) and lists each board&rsquo;s groups in playing order, with a tick box for each match. A board with more groups than fit continues on the next sheet. A group is never split;</li>
<li>one chart for each confirmed group;</li>
<li>the knockout bracket, or a projected bracket with labels like A1 before the groups are played;</li>
<li>in Group Boards, a <b>Players A&ndash;Z</b> sheet, a <b>Boards</b> sheet, one sheet for each group and the Finals;</li>
<li>in a Teams event, a lineup sheet for each fixture if you tick the box for it. See <a href="#lineup-sheet">The lineup sheet</a>.</li>
</ul>
<p>Your browser&rsquo;s print window opens. Choose a printer, or choose <b>Save as PDF</b> to make a file. Print the blank pack before you start games; DartDraw suggests it when you start.</p>
<p class="callout"><b>Want QR codes on the sheets?</b> Publish before you print. While publishing is off, step 4 shows a note above the print button: &ldquo;Publishing is off, so these sheets will have no QR code&rdquo;. Click <b>Publish results now</b> in it (the same as ticking <b>Publish results</b> on step 5), then print. Sheets printed earlier have no QR code; print them again after publishing to get them.</p>

<h4 id="bracket-sheets">Knockout bracket sheets and paper size</h4>
<p>Every knockout bracket prints as one two-sided chart on one sheet: the main bracket, the Plate pool and the projected bracket. The left half and the right half run towards the Final in the middle, with the title above it and the Champion box below. An entry with a first-round bye starts in round 2 with a small BYE tag. Names up to 24 characters print in full. A longer name is cut with a small number, and the full name is printed at the foot of the sheet. Group Boards keeps its own chart.</p>
<p>Pick the <b>Knockout bracket paper size</b> (A4, A3, A2 or A1) on step 4 or step 7. Under it, a fit check shows how big the names print on each size. Names are readable from 7 pt. When they would print between 7 and 8 pt, a note suggests the size that gives 8 pt or more, with a button to switch the event to it. It never stops you printing.</p>
<p>When a bracket is too big to print readably on the size you chose, printing first asks what to do:</p>
<ul>
<li><b>Use A3 (recommended)</b> (or whichever size it needs): the event&rsquo;s saved paper size changes to that size and the bracket prints on one sheet of it. Set the printer to the same size.</li>
<li><b>Split over N A4 sheets</b>, where the bracket can be split. The outer rounds of each half print as sections on A4 sheets: L1, L2 &hellip; for the left half and R1, R2 &hellip; for the right, numbered top to bottom. A Finals sheet holds the last rounds. All of them use the same readable scale. Each section shows where its winners go (&ldquo;to Finals 5-1&rdquo;). Each first box on the Finals sheet shows where its entry comes from: &ldquo;L1 &middot; 4-1&rdquo; is the winner of match 4-1 on section L1. Small + marks show where winners leave a section and enter the Finals sheet. On an ordinary office printer, this is usually the one to choose.</li>
<li><b>Keep A4</b> (your size): the whole chart is shrunk to fit one sheet, keeping its shape. The names may be too small to read when printed, so a note on the print screen says so and offers the recommended size. The note is never printed.</li>
</ul>
<p>If no paper size up to A1 holds the bracket at 7 pt, the box says that even A1 needs to shrink it. It then offers only the split and the shrink.</p>
<p>Your answer is remembered for the event. You are asked again when it no longer fits: when you pick a different paper size, or after another draw that needs a different size.</p>

<h4 id="logos-and-rules">Logos, sponsors and the rules sheet</h4>
<p>Your tournament logo goes in every sheet header. Sponsor logos (Advanced setup) print in the footer when <b>Include sponsor footer on printed charts</b> is ticked. The rules sheet is written for you from your settings: the format, scoring, how many go through and the tie-break order. It adds anything you typed in <b>Walkover, conduct &amp; other rules</b>.</p>

<h4 id="qr-codes">QR codes</h4>
<p>Only some sheets carry a QR code, with the live address beside it: the round robin group charts, the knockout and Finals bracket sheets, the Group Boards group sheets, and in Group Boards the <b>Boards</b> and <b>Players A&ndash;Z</b> sheets. It is in the header, except on a two-sided knockout bracket, where it sits below the Champion box. The rules sheet and the running order do not have one.</p>
<p>Each code opens that sheet&rsquo;s own page. A group chart opens that group, a bracket sheet opens the bracket, the Boards sheet opens the Boards tab, and Players A&ndash;Z opens the event. The codes are made in your browser, so printing does not need extra internet.</p>
<p>They only appear when <b>Publish results</b> is on <em>and</em> the address of the public site is set up. Publishing lives on step 5, after the print on step 4. So step 4 reminds you: while publishing is off, a note above the print button says the sheets will have no QR code. It has a <b>Publish results now</b> button: click it before you print. If the note says instead that the address of the public results site isn&rsquo;t set up yet, ask your admin. The sheets then print without QR codes.</p>
`
      },
      {
        id: 'publishing-results',
        title: 'Share live results with spectators',
        summary: 'Publish results, list the event on the public home page, and know what spectators see.',
        keywords: 'share link spectators spectator public live results qr publish phones sharing',
        body: `
<h4 id="publish">Publishing</h4>
<p>At the bottom of step 5 is the <b>Public results</b> card.</p>
<ol>
<li>Tick <b>Publish results</b>.</li>
<li>A link appears. Click <b>Copy link</b> to share it, <b>Open &#8599;</b> to look at it, or <b>All events &#8599;</b> for the public home page.</li>
<li>Untick <b>Publish results</b> any time to take the page offline.</li>
</ol>
<p>You can also publish from step 4. While publishing is off, a note above the print button has a <b>Publish results now</b> button, so the QR codes print on the blank pack. It does the same as ticking the box here.</p>
<p>If the card says the address of the public site is not set up yet, tell your admin.</p>

<h4 id="listing">Listing on the home page</h4>
<p>The public results site (DartDraw Live) has a home page that lists events. Yours is only on it if you tick <b>List on the public page</b>, under <b>Publish results</b>. It is off by default. The list shows the event and tournament name, the date, the format, the number of entries and, when finished, the winner. Your private link keeps working either way.</p>
<ul>
<li>Unticking <b>Publish results</b> also removes the listing, and ticking it again does not bring the listing back.</li>
<li>A duplicated event starts unpublished and unlisted.</li>
<li>The home page has three tabs. <b>Live</b> is for events being played, <b>Upcoming</b> for events that have not started, and <b>Results</b> for finalized events.</li>
</ul>

<h4 id="what-spectators-see">What spectators see</h4>
<p>Anyone with the link sees the standings, results and bracket, and can look up a player. Group Boards events also have a <b>Boards</b> tab. They see entry names (a pair&rsquo;s or a team&rsquo;s name) and organisations. They never see your notes, the incident log, check-in details, or your logo and sponsors.</p>
<p>Spectators have their own help page at <a href="${VIEWER_HELP_URL}" target="_blank" rel="noopener">the public results site</a>. Send it to anyone who asks how to follow the event.</p>

<h4 id="how-fast">How fast it updates</h4>
<p>The event page refreshes itself about every 20 seconds and picks up scores shortly after they are saved. Changes to the home page list can take about half a minute to appear.</p>

<h4 id="before-finalizing">Before you finalize</h4>
<p>Set <b>Publish results</b> and <b>List on the public page</b> the way you want them first. They cannot be changed once the event is finalized.</p>
`
      }
    ]
  },
  {
    id: 'on-the-day',
    title: 'On the day',
    kind: 'guide',
    items: [
      {
        id: 'check-in-and-start',
        title: 'Check people in and start the games',
        summary: 'Tick people off as they arrive, then start the games (round robin) or just play (knockout).',
        claims: ['checkin-warning'],
        keywords: 'check in checkin checked in arrived arrival start games start all games begin play locked scores',
        body: `
<h4 id="check-in">Check-in</h4>
<p>On step 4 there is a <b>Check-in</b> card. Tick each entry as they arrive, or click <b>Check in all</b>. Use the search box, or tick <b>Only show who hasn&rsquo;t checked in yet</b>.</p>
<p>Check-in is just a record for you. It never stops you confirming, printing or starting. You get a yellow warning &ldquo;Not everyone is checked in&rdquo; when you click <b>Start all games</b>, when you click <b>Generate bracket</b> or <b>Regenerate bracket</b> in a Knockout, and when you draw or confirm Group Boards groups. You can carry on. Drawing the knockout after a round robin (<b>Generate knockout bracket</b>) does not warn, because by then everyone has played in the groups.</p>
<p>In Group Boards, tick people in on step 4. Then, on step 3, before you click <b>Draw groups</b>, a <b>Withdraw the N not checked in</b> button (N is a number) removes everyone who is not ticked. It only appears once at least one person is ticked, and only before the draw.</p>

<h4 id="start-games">Start all games</h4>
<p>In a round robin or Round robin &rarr; Knockout, scores are locked until you click <b>Start all games</b> on step 5. All confirmed charts start together; you cannot start them one by one. Before you start, the score boxes are hatched and clicking one says &ldquo;Scores are locked&rdquo;. A knockout has no start button: click a match when it is played.</p>
<p>The box that opens may say <b>Suggestion: print the pack first</b>. You can choose <b>Go print the pack first</b> or <b>Start without printing</b>. It also names anyone who is not checked in.</p>
`
      },
      {
        id: 'managing-the-tournament',
        title: 'Enter and correct scores (step 5)',
        summary: 'Enter scores, correct or clear a result, read the standings, adjust positions and keep a private incident log.',
        claims: ['ko-cascade', 'clear-result', 'rr-clear-after-draw'],
        keywords: 'scores score enter scores results match day typo mistake wrong score winner managing the tournament manage',
        body: `
<p>Step 5 is <b>Manage Tournament</b>. This is where you spend match day. To start the games, see <a href="#start-games">Start all games</a>.</p>

<h4 id="enter-scores">Entering scores</h4>
<p><b>Round robin:</b> click the box where two entries meet. Type each side&rsquo;s legs and click <b>Save score</b>. The winner must have exactly the legs needed for your best-of, and the loser fewer. Positions, points and leg totals update at once in the standings under each chart.</p>
<p><b>Knockout:</b> click a match, type the legs and click <b>Save score</b>. There are no draws. The winner moves to the next round.</p>
<p><b>Teams:</b> type the total legs each team won across the whole match. See <a href="#teams-results">Entering a team result</a>.</p>

<h4 id="correct-a-result">Correcting or clearing a result</h4>
<ul>
<li><b>To correct a score</b>, click it again, type the right legs and click <b>Save score</b>.</li>
<li><b>To clear a result</b>, for example a score typed on the wrong match, click it and choose <b>Clear result</b>. DartDraw asks &ldquo;Clear this result?&rdquo; first: click <b>Clear result</b> again, or <b>Cancel</b>. The match goes back to not played, and the round robin standings are worked out again. A walkover can be cleared the same way. A match marked <b>Neither showed</b> has <b>Reverse it</b> instead.</li>
<li><b>In a knockout</b>, if you change who won a match, or clear it, every later match that the old winner had reached is cleared as well, right up to the final, and so is the champion. You then enter those results again. If any of those later matches already has a result, DartDraw asks you first and lists them. For example: &ldquo;Changing this result will clear 2 later results, and you will need to enter them again&rdquo;, plus the champion if there is one. Click <b>Change result</b> to go ahead, or <b>Cancel</b> to leave everything as it was. Correcting only the score, with the same winner, changes nothing later and asks nothing. This works the same in the Plate pool, a Teams knockout, the Group Boards Finals and the full-page window. Inside a Group Boards group, a new winner clears the later matches of that group in the same way without asking. It is refused if a Finals match that depends on it already has a score.</li>
<li><b>After the knockout has been drawn from a round robin</b>, a group result can still be corrected with <b>Save score</b>, but it can no longer be cleared. The group would be unfinished, and the knockout is only drawn from finished groups. If a correction changes who goes through, use <b>Regenerate from current standings</b> (it discards any knockout results, and asks first).</li>
<li>A finalized event cannot be changed. See <a href="#reopening">Changing a finalized event</a>.</li>
</ul>

<h4 id="standings">Standings</h4>
<p>The standings table shows <b>MP</b> (matches played), <b>MW</b> (won), <b>ML</b> (lost), <b>LW</b> (legs won), <b>+/-</b> (leg difference) and <b>Pts</b>. A small <b>TB</b> badge shows which tie-break separated two entries. A <b>?</b> means they are still level. The small <b>?</b> link beside the word Standings opens <a href="#glossary-tables">the table words</a>. See also <a href="#faq-tie-breaks">How do tie-breaks work?</a></p>

<h4 id="adjust-positions">Adjusting positions</h4>
<p>If a round robin tie needs your decision, click <b>Adjust positions&hellip;</b> on the group in Manage Tournament. Type the position you want for each entry and click <b>Save</b>. Manual positions get an asterisk (*) on the chart. <b>Reset all</b> brings back the automatic order.</p>

<h4 id="incident-log">Incident log</h4>
<p>At the bottom of step 5, <b>+ Log incident</b> records a warning, dispute or other event: the entry, what happened and the action taken. It is for you only. It is never printed and never shown on the public page.</p>

<h4 id="finishing-up">When play is over</h4>
<p>Use the <b>Accept results &amp; finalize</b> card at the bottom of step 5. See <a href="#finishing-the-event">Finish the event</a>. To use a second screen while you play, see <a href="#full-page-window">Second screen or projector</a>.</p>
`
      },
      {
        id: 'player-leaves',
        title: 'No-shows and players who leave',
        summary: 'What to do when an entry does not turn up or has to stop: before their group starts, during the groups, during the knockout, and after the event is finalized.',
        claims: ['withdraw-guard', 'no-show-route'],
        keywords: 'quit quits player quit leaves leave left leaving retire retired injured injury drop out dropped out pulled out stops gave up midway halfway part way a player leaves part-way no show noshow walkover withdraw',
        body: `
<p>Whatever stage you are at, results already played are never removed. What you click depends on how far the event has gone.</p>

<h4 id="leaves-before">Before the draw, or before their group starts</h4>
<ol>
<li>Go to step 3, <b>Chart details</b>.</li>
<li>Click <b>Withdraw</b> next to the entry.</li>
<li>Before the draw they are simply removed. After the draw, type a replacement name to fill the slot, or leave the box blank for a bye, then click <b>Withdraw</b>.</li>
<li>If their group was confirmed, it is un-confirmed. Check it on step 4 and click <b>Confirm this chart</b> again.</li>
</ol>
<p>A Knockout or Group Boards event has no Withdraw button on step 3. Once the bracket is drawn, use the knockout steps below.</p>

<h4 id="leaves-groups">During the round robin</h4>
<p>Do not use Withdraw: once the group has started it is refused, because it would remove results already played. Instead:</p>
<ol>
<li>On step 5, <b>Manage Tournament</b>, click <b>Mark no-show&hellip;</b> on their group&rsquo;s chart.</li>
<li>Choose the entry.</li>
</ol>
<p>Every match they have not played in that group becomes a walkover loss, tagged <b>WO</b>, so their opponents get the points. You can also start from step 3: click <b>Mark no-show&hellip;</b> beside their name, then <b>Mark no-show instead</b>. To take it back, use the <b>undo</b> link in the no-show box. That link is there only until the knockout is drawn from the groups; after that, enter the real score over a WO box instead.</p>

<h4 id="leaves-knockout">During the knockout</h4>
<ol>
<li>Find their next match in the bracket on step 5 (or in the full-page window).</li>
<li>Click <b>Mark no-show&hellip;</b> under the match and choose them.</li>
</ol>
<p>Their opponent goes through by a walkover, tagged <b>WO</b>. If their next match has no opponent yet, wait until it has one, then do the same. After a round robin, <b>Mark no-show&hellip;</b> beside their name on step 3 does this for you when the match is ready. The group results stay as they are and the knockout is not drawn again. In Group Boards it works the same way inside each group and in the Finals.</p>

<h4 id="leaves-finalized">After the event is finalized</h4>
<p>Nothing can be changed any more. Only an Admin can reopen the event. See <a href="#reopening">Changing a finalized event</a>.</p>

<h4 id="no-shows">No-shows and walkovers</h4>
<p>In a <b>round robin</b>, once the games have started, click <b>Mark no-show&hellip;</b> on the group&rsquo;s chart and choose the entry. Every match they have not yet played in that group is filled in as a walkover loss and tagged <b>WO</b>. A walkover is a win by the majority of legs to nil, and it counts as a played match. Real results you already entered are never overwritten. Until the knockout is drawn from the groups, the same box has an <b>undo</b> link. After that a no-show can no longer be undone (it would leave the group unfinished). Entering a real score over a WO box still replaces it.</p>
<p>In a <b>knockout</b> or <b>Group Boards</b> match, click <b>Mark no-show&hellip;</b> under the match and choose who did not show. The other side wins by a walkover and goes through, tagged <b>WO</b>.</p>

<h4 id="neither-showed">Neither showed</h4>
<p>This is for knockout and Group Boards matches only; a round robin has no such choice. If neither side turns up, choose <b>Neither showed</b> in the same box. Nobody advances and the next opponent gets a bye. If the match is a group&rsquo;s final in Group Boards, that group finishes with no winner. Its Finals slot reads &ldquo;Group N: no winner&rdquo;, which becomes a bye. To undo it, open the match and click <b>Reverse it</b>, or just enter a score. On the public page the match reads &ldquo;Neither attended&rdquo;, or NO-SHOW in the bracket Chart view.</p>

<h4 id="withdrawals">Withdraw: when it works and when it is refused</h4>
<p>In a round robin, click <b>Withdraw</b> next to the entry on step 3. You can do this until their group starts. Before the draw it simply removes them. After the draw you can type a replacement name to fill the slot, or leave it blank for a bye. A group whose entries changed is un-confirmed so you can check it again.</p>
<p>Once their group has started (after <b>Start all games</b>), once they have a result, or once a drawn bracket holds them, Withdraw is no longer possible. It would remove results that are already in and change the table. On step 3 the <b>Withdraw</b> button is then replaced by <b>Mark no-show&hellip;</b>. Once they are marked it shows a <b>No-show</b> tag instead, and nothing when they have no match left to play. Click it and DartDraw explains why and offers <b>Mark no-show instead</b>. In a group, their remaining matches become walkover losses. In the knockout, they lose their next match by a walkover and the opponent goes through. Results already played stay.</p>
<p>The Knockout list on step 3 has no Withdraw button. If someone is not coming, use <b>Mark no-show&hellip;</b> on their match once the bracket is drawn.</p>
`
      },
      {
        id: 'running-the-knockout',
        title: 'Run the knockout',
        summary: 'Draw the knockout from the groups, start rounds, and run the groups and Finals of a big knockout on the day.',
        keywords: 'knockout bracket draw knockout generate knockout bracket finals call uncall start round regenerate',
        body: `
<h4 id="rr-knockout-draw">Drawing the knockout from a round robin</h4>
<p>In Round robin &rarr; Knockout, the <b>Knockout stage</b> card has <b>Generate knockout bracket</b>. It stays greyed out until every group is complete, and says &ldquo;The knockout can only be drawn once every group is finished&rdquo;. If a tie sits on the cut-off line, you also have to settle it first with <b>Adjust positions&hellip;</b>. <b>Regenerate from current standings</b> rebuilds the bracket. If knockout results are already in, they are discarded, so it asks first. The Plate pool bracket is drawn at the same time.</p>
<p>Click <b>Start round</b> when a round begins if you want DartDraw to compare the clock with its estimates.</p>

<h4 id="group-boards-day">Group Boards</h4>
<p>Group Boards shows <b>All groups</b> as cards (filter with <b>All</b>, <b>Unfinished</b> and <b>Finished</b>). Click a group to open its bracket and enter results. Each group winner moves into the Finals by itself. When the Finals is built a <b>Finals</b> button appears.</p>
<p>The <b>Boards</b> card shows, for every board, what is on now and what is next. <b>Call</b> tells players on the public results page to go to their board (<b>Uncall</b> clears it). <b>Enter result</b> and <b>No-show</b> are there too. <b>Finals boards</b> lets you put a Finals match on a feature board.</p>
`
      },
      {
        id: 'full-page-window',
        title: 'Second screen or projector (full-page window)',
        summary: 'Open Round robin, the Winners bracket or the Plate pool in its own window for a projector or second monitor, and keep scoring.',
        keywords: 'second screen projector monitor tv pop out window full screen full-page window',
        body: `
<h4 id="fpw-what">What it is</h4>
<p>It is Manage Tournament with everything else taken away. There is no left-hand menu and no top bar. The window has a header with your logo (if you added one), the tournament name, the event name, and the bracket name with its status (&ldquo;In progress&rdquo; or &ldquo;Champion: &hellip;&rdquo;). It also shows your sponsor logos, the save status (such as <b>Saved</b>) and a <b>Print</b> button. The round robin window shows &ldquo;Round robin&rdquo; and the number of charts instead. Under that is the chart.</p>
<ul>
<li>A <b>bracket</b> is scaled to fit your screen, and re-fits if you resize the window.</li>
<li>The <b>round robin</b> shows one card for every confirmed group, each with its chart and standings. It scrolls.</li>
</ul>
<p>It is interactive. You can enter scores right there.</p>

<h4 id="fpw-when">When to use it</h4>
<p>Use it for a second monitor, a projector or a TV that players look at while you work on your laptop. You can also give the round robin, the Winners bracket and the Plate pool a screen each.</p>

<h4 id="fpw-open">How to open it</h4>
<p>Go to step 5, <b>Manage Tournament</b>. The buttons are at the top right of the Manage tournament card.</p>
<ul>
<li><b>Round robin</b>: <b>Open in new window &#8599;</b></li>
<li><b>Knockout</b>: <b>Open in new window &#8599;</b>. It appears once the bracket has been generated.</li>
<li><b>Round robin &rarr; Knockout</b>: up to three buttons. <b>Round robin &#8599;</b> and <b>Winners bracket &#8599;</b>, plus <b>Plate pool &#8599;</b> if the event has a Plate pool and its bracket exists.</li>
</ul>
<p>Group Boards events do not have this window. Use the Boards card instead, and the Boards tab with its TV view on the public page.</p>
<p>The window opens as a new browser tab or window. Drag it onto the other screen if you need to. For a truly full screen, press <b>F11</b> in most browsers. That is a browser feature, not part of DartDraw.</p>

<h4 id="fpw-popups">If nothing happens</h4>
<p>DartDraw opens the window through your browser, and browsers can block that. When it is blocked, DartDraw says &ldquo;Your browser blocked the new window &mdash; allow pop-ups for this site, then click the button again.&rdquo; Look for a &ldquo;pop-up blocked&rdquo; icon in the address bar, choose to allow pop-ups for this site, then click the button again. Some browsers block it without telling DartDraw; if nothing opens and no message appears, do the same.</p>

<h4 id="fpw-scores">Entering scores there</h4>
<p>Click a score box or a match exactly as you would in the main window. In a bracket window, <b>Mark no-show&hellip;</b> works too. Be careful before you score there: read <a href="#fpw-sync">Keeping the windows in step</a> first. A few things only exist in the main window:</p>
<ul>
<li><b>Start all games</b> (the round robin boxes are locked until you press it there);</li>
<li><b>Mark no-show&hellip;</b> and <b>Adjust positions&hellip;</b> for round robin groups;</li>
<li>publishing and finalizing.</li>
</ul>

<h4 id="fpw-print">Printing</h4>
<p>The <b>Print</b> button in the full-page window prints just what that window shows: the bracket sheet, or the round robin group charts. They are the same sheets as in the full pack, with the same paper check (see <a href="#bracket-sheets">Knockout bracket sheets and paper size</a>). In a Teams event the bracket window also has a <b>Lineup sheets</b> button for the knockout lineup sheets that are ready and the empty sheet. For the whole pack (rules sheet, running order and every chart), print from the main window, on step 4 (<b>Print bracket pack</b>) or step 7 (<b>Print final chart &mdash; Save high-res A4 PDF</b>).</p>
`
      },
      {
        id: 'full-page-window-sync',
        title: 'Full-page window: keeping windows in step, and its messages',
        summary: 'Windows do not update each other while you look at them. Score in one window at a time, and know what the window says when something is missing.',
        keywords: 'two windows second window out of date reload refresh sync update windows f5 full page window finalized missing',
        body: `
<h4 id="fpw-sync">Keeping the windows in step</h4>
<p>This matters, so read it once.</p>
<ul>
<li>Each window loads your saved event when it opens, and saves what you do in it to your account.</li>
<li><b>The windows do not update each other while you look at them.</b> A score you enter in one does not appear in the other straight away.</li>
<li>When you switch to a window (click into it, or bring it back on screen), it checks for a newer copy of the event. If there is one, it loads it, stays on the same step and shows &ldquo;Updated with the latest scores&rdquo;. It skips this while a change of yours is still being saved, while a box is open, while you are typing in a box or have typed something not yet saved, and on steps 1 to 3. So check the scores before you enter the next one. Windows in the same browser tell each other when they save, so the window you switch to picks up the other one&rsquo;s score straight away. Otherwise (for example a change made on another device) it checks at most every few seconds.</li>
<li>If you score in a window that is out of date, that score is <b>not saved</b>. DartDraw refuses it so it cannot write over the newer results. The red banner &ldquo;Updated elsewhere &mdash; reload to get the latest&rdquo; appears in that window (the full-page window too). Until you reload, that window saves nothing.</li>
<li>When you see the banner, click <b>Reload</b> <b>before you enter anything else</b>. Then check the scores and enter your last one again.</li>
<li>So run <b>one window per event at a time</b> for entering scores, and use the other only to look at. Keep the full-page window on <b>one device</b> only. Do not open the same event on a second device or in a second tab and score there as well.</li>
<li>If you are not sure a window is up to date, press <b>F5</b> in it before you score. In the main window you can also click the event in <b>Saved tournaments</b>.</li>
<li>The full-page window shows its save status in the header. After you enter a score there, check that it says <b>Saved</b>. If it says &ldquo;Couldn&rsquo;t save &mdash; click to retry&rdquo;, check your connection and click it.</li>
</ul>
<p>The simplest habit: score in one window, and use the other for showing.</p>

<h4 id="fpw-empty">When it says something is missing</h4>
<ul>
<li>&ldquo;No bracket yet &mdash; generate one in Confirm &amp; Print Bracket, then reopen this window.&rdquo; Generate the bracket in the main window, then open the window again or reload it.</li>
<li>&ldquo;No confirmed charts yet &mdash; confirm at least one group in Confirm &amp; Print Bracket, then reopen this window.&rdquo; The round robin window needs at least one confirmed group.</li>
<li>&ldquo;No tournament open.&rdquo; There is no event to show. Close the window and open it again from Manage Tournament.</li>
</ul>

<h4 id="fpw-finalized">Finalized events</h4>
<p>A finalized event opens view-only. Score boxes and matches do nothing. Sometimes a window that did not know the event was finalized tries to save a change. A notice then appears at the top: &ldquo;This event is finalized. Your change was not saved; only an Admin can change it.&rdquo;</p>
`
      }
    ]
  },
  {
    id: 'finish',
    title: 'Finish',
    kind: 'guide',
    items: [
      {
        id: 'finishing-the-event',
        title: 'Finish the event: finalize, print the final chart, reuse it',
        summary: 'Review the final standings, print the final chart, accept the results, and copy the event for next time.',
        claims: ['finalized-sidebar'],
        keywords: 'finish finished end close complete lock accept finalise finalize winner champion who won final standings pdf final chart finishing the event reuse next time',
        body: `
<h4 id="review">Review and print</h4>
<p>Step 6, <b>Finalize Standings</b>, is a read-only look at the final tables or placings. If you spot a mistake, click <b>Back to manage tournament</b> and correct the score. Step 7, <b>Print Final Chart</b>, prints the pack with every result. Neither step closes the event: both say &ldquo;To finish the event, use Accept &amp; finalize at the bottom of step 5&rdquo;, with a <b>Go there</b> link. Click <b>Print final chart &mdash; Save high-res A4 PDF</b>, and choose <b>Save as PDF</b> in the print window if you want a file.</p>
<p>If two entries are still level after every tie-break rule, a box called &ldquo;Resolve ties before continuing&rdquo; stops you at steps 6 and 7. Settle the tie, then use <b>Adjust positions&hellip;</b>.</p>

<h4 id="accept">Accepting the results</h4>
<p>At the bottom of step 5, the <b>Accept results &amp; finalize</b> card says &ldquo;Available once every match is played&rdquo; until the last result is in. Then:</p>
<ol>
<li>Click <b>Accept &amp; finalize</b>.</li>
<li>Read the box &ldquo;Accept results as final?&rdquo; and click <b>Accept &amp; finalize</b> again.</li>
</ol>
<p>If something goes wrong, a box says <b>Not finalized</b> and tells you why. For example, the last save did not go through, or the event was changed elsewhere. Fix that and try again.</p>

<h4 id="what-it-locks">What it locks</h4>
<ul>
<li>The public page shows <b>Final results</b>, and the event moves to <b>Results</b> on the home page if it is listed.</li>
<li>Nothing in the event can be edited, renamed or deleted from the organiser app. The controls on the steps are greyed out, including the publishing and listing settings.</li>
<li>The <b>Rename</b> and <b>Delete</b> buttons under the event in <b>Saved tournaments</b> look the same as before, but they are locked too: clicking one only explains why, for example &ldquo;Finalized events can only be renamed by an Admin.&rdquo; <b>Duplicate</b> still works and makes a new copy you can edit.</li>
<li>You can still look through every step, print, copy the public link, open other events and change your password.</li>
</ul>

<h4 id="reopening">Changing a finalized event</h4>
<p><b>Only an Admin can reopen or edit a finalized event.</b> Ask your admin. Once it is reopened, reload the event, make your change, and accept the results again.</p>
<p>Finalized events stay on the home page&rsquo;s Results tab for a limited time, which your admin sets. After that they leave the list. The event stays in your account.</p>

<h4 id="reuse">Reusing the event next time</h4>
<p>Click <b>Duplicate</b> under the event in <b>Saved tournaments</b>. The copy keeps the entries, settings and any scores, and it starts unpublished, unlisted and open for editing. See <a href="#faq-duplicate">Can I reuse an event for next time?</a></p>
`
      }
    ]
  },
  {
    id: 'teams-events',
    title: 'Teams events',
    kind: 'guide',
    items: [
      {
        id: 'teams',
        title: 'Set up a Teams event',
        summary: 'Set up a team match as segments, and choose where a tie-breaker is used.',
        keywords: 'team league segment segments captain tie breaker team match teams events setup',
        body: `
<p>In a Teams event every match between two teams is made of <b>segments</b>, played one after another. For example: a foursome, then singles and doubles games. You set the segments once, on step 2. Every match in the event uses them: in the groups, every knockout round, the Plate pool and Group Boards alike. A team is just its name. DartDraw keeps no list of players. To enter results and print lineup sheets, see <a href="#teams-scoring">How a team match is scored</a>.</p>

<h4 id="team-segments">Setting up the segments</h4>
<p>Open the <b>Format</b> section of step 2. Under <b>Team match segments (played in order)</b> each row is one segment, with:</p>
<ul>
<li>a type: <b>Singles</b>, <b>Doubles</b>, <b>Trios</b> or <b>Foursome</b>;</li>
<li>a starting score: <b>301</b>, <b>501</b>, <b>701</b> or <b>1001</b>;</li>
<li>a <b>best of</b> number of legs. It must be odd (1, 3, 5&hellip;). An even number shows a warning, and <b>Save format &amp; branding &rarr;</b> refuses it, because it could end level. The same goes for the tie-breaker when it is used.</li>
</ul>
<p>Click <b>+ Add segment</b> for another row. Use the arrows to move a segment up or down, and <b>&#10005;</b> to remove one. There is always at least one, and at most 8, so the lineup sheet fits on one page. The editor is there in Basic and Advanced setup. A Teams event has no <b>Best of legs</b> box and no extra legs for later rounds, because each segment sets its own.</p>
<p>Like every other setting on step 2, your changes count only when you click <b>Save format &amp; branding &rarr;</b>. Leave the step without saving and the segments stay as they were.</p>
<p>Once games have started, the segments are locked and shown read-only. Games have started after <b>Start all games</b> or <b>Start round</b>, once a match is called to its board, or once any result is in. From then on the format and the competition type (step 1) of a Teams event can&rsquo;t change any more either, because every match of the event must be played the same way.</p>
<p>A new Teams event starts with five segments:</p>
<ul>
<li>Foursome 1001, best of 1;</li>
<li>Singles 501, best of 3;</li>
<li>Doubles 501, best of 3;</li>
<li>Singles 501, best of 3;</li>
<li>Doubles 501, best of 3.</li>
</ul>
<p>Change them to suit your league.</p>

<h4 id="team-tie-breaker">The tie-breaker</h4>
<p>Under <b>A tie-breaker might be needed</b> you choose where a tie-breaker is used: <b>Use a tie-breaker in round robin matches</b>, <b>Use a tie-breaker in knockout matches</b>, or both. Only the ticks that fit your format are shown. A round robin has the first, a knockout (Group Boards included) the second, and Round robin &rarr; Knockout both. When one is ticked, a <b>Tie-breaker</b> row appears at the end with its own type, starting score and best of. It is played only when the two teams have won the same number of legs after the main segments. A new event has both ticked, with a Foursome 1001, best of 1.</p>
<p>Each tick is locked once its own stage has begun, not before. In Round robin &rarr; Knockout you can still choose the knockout tie-breaker while the groups are being played. Even after a stage has begun you can switch its tie-breaker <b>on</b> (never off again): the knockout one at any time, and the round robin one as long as no drawn result is saved. The tie-breaker&rsquo;s type, starting score and best of can change while no stage that has begun uses it.</p>
`
      },
      {
        id: 'teams-scoring',
        title: 'How a team match is scored, and lineup sheets',
        summary: 'Enter one result per team match, know the most a team can win and what happens when totals are level, and print lineup sheets.',
        keywords: 'team result team score lineup lineups scorecard captain sheet total legs level draw tie breaker fixture',
        body: `
<h4 id="teams-results">Entering a team result</h4>
<p>You enter one result for the whole match, not one for each segment. Click the match as usual. In each box, type the <b>total legs that team won across all the segments</b>, adding the tie-breaker&rsquo;s legs if it was played. Then click <b>Save score</b>. Standings, leg difference and the bracket all use those totals.</p>
<p>For example, take the five default segments. One team wins the foursome (1 leg) and one singles 2&ndash;1, and loses the other three segments 1&ndash;2. It has 1 + 2 + 1 + 1 + 1 = 6 legs, and the other team has 0 + 1 + 2 + 2 + 2 = 7.</p>

<h4 id="teams-cap">The most a team can win</h4>
<p>In each segment a team can win at most the legs it needs to take it: 1 in a best of 1, 2 in a best of 3, 3 in a best of 5. Added up over the segments, that is the most a team can have in one match. With the five default segments it is 9, or 10 in a stage that uses the tie-breaker. The result box says &ldquo;A team can win at most 10 legs.&rdquo; It refuses a bigger number with a message: it never changes what you typed. A result saved earlier can always be saved again unchanged.</p>

<h4 id="teams-level">When the totals are level</h4>
<ul>
<li><b>Where the tie-breaker is used</b>, a level total can&rsquo;t be saved. Play the tie-breaker and include its legs in the totals.</li>
<li><b>A round robin without the tie-breaker</b> (also the group stage of Round robin &rarr; Knockout): a level total is allowed. It is a draw, 1 point each.</li>
<li><b>A knockout without the tie-breaker</b> (Group Boards included): a level total is still refused (&ldquo;This is a knockout match &mdash; it can&rsquo;t end level.&rdquo;), because a knockout needs a winner. The message suggests ticking <b>Use a tie-breaker in knockout matches</b> (possible at any time). Or play one more deciding leg and include it in the totals. One more leg always fits: a level total is always below the most a team can win.</li>
</ul>
<p>A no-show works as in any event: <b>Mark no-show&hellip;</b> gives the other team every main segment, which is 9&ndash;0 with the defaults.</p>

<h4 id="lineup-sheet">The lineup sheet</h4>
<p>On step 4 or step 7, tick <b>Also print a lineup/scorecard sheet for each fixture, for captains to fill in on the day</b>. A fixture is one team match: one team against another. The pack then gets one page for each fixture whose teams are known, with both teams side by side. Each side has:</p>
<ul>
<li>a dark bar for every segment, such as <b>Singles 1</b>, with its starting score, its legs and a Points box. Singles bars are half the height of the others;</li>
<li>numbered lines for the players&rsquo; names: one for singles, two for doubles, three for trios, four for a foursome;</li>
<li>the <b>TIE-BREAKER</b> bar, when that fixture uses one;</li>
<li>a compact <b>TOTAL POINTS</b> box for everything, the tie-breaker included;</li>
<li>and, on the rest of the page, a large space for the captain&rsquo;s signature.</li>
</ul>
<p>In a knockout, print again as rounds finish to get the next fixtures&rsquo; sheets.</p>
<p>The lineup sheet shows the <b>TIE-BREAKER</b> bar only for fixtures of a stage that uses it. The rules &amp; format sheet lists the segments and says where the tie-breaker is used. The time estimate counts every leg of every segment, the tie-breaker&rsquo;s too in a stage that uses it. Each team match is one fixture on one board: its segments are played one after another and are never scheduled apart.</p>

<h4 id="ready-lineups">Knockout lineup sheets as the rounds go on</h4>
<p>In the knockout, a match&rsquo;s lineup sheet is ready as soon as both of its teams are known. That is the first round when the bracket is drawn, and a later match the moment both of its teams have won through. On step 5 (<b>Manage Tournament</b>) the <b>Lineup sheets</b> card lists every match that is ready and not yet played. Click <b>Print lineup</b> on one match, or <b>Print all ready lineup sheets</b> to print every ready sheet you have not printed yet. DartDraw remembers which sheets were printed and marks them <b>Printed</b>. (A sheet counts as printed for the two teams it was printed with.) <b>Print again</b> reprints one. The full-page window of the bracket has the same list behind its <b>Lineup sheets</b> button. Round robin fixtures keep their sheets in the pack.</p>
<p>For a fixture added on the day, or a spoiled sheet, <b>Print empty lineup sheet</b> prints a blank one. It has the event&rsquo;s name and logo, the segments, the tie-breaker bar as set up, <b>TOTAL POINTS</b> and the signature space. The Group, Board, Fixture, Game No. and team name boxes are left empty. Pick 1 to 10 copies beside the button. It is on the print steps (4 and 7) and in Manage Tournament, and works before anything is drawn.</p>
`
      }
    ]
  },
  {
    id: 'something-wrong',
    title: 'When something goes wrong',
    kind: 'guide',
    items: [
      {
        id: 'troubleshooting',
        title: 'When something goes wrong',
        summary: 'Start from what you see: each problem says what to do and where to read more. Then saving, printing and the other messages.',
        keywords: 'problem problems not working error stuck reprint print again fix pdf save as pdf download export troubleshooting symptom wrong cant cannot missing broken printing tips',
        body: `
<h4 id="symptoms">What you see, and what to do</h4>
<dl class="msgs">
<dt>I can&rsquo;t find the finalize button</dt>
<dd>It is at the bottom of step 5, <b>Manage Tournament</b>: <b>Accept &amp; finalize</b>. Steps 6 and 7 only review and print; they say where it is, with a <b>Go there</b> link. More: <a href="#accept">Accepting the results</a>.</dd>
<dt>No QR codes on my printed sheets</dt>
<dd>Publishing was off when you printed. Click <b>Publish results now</b> on step 4 (or tick <b>Publish results</b> on step 5), then print again. If step 4 says the address of the public results site isn&rsquo;t set up yet, ask your admin. More: <a href="#qr-codes">QR codes</a>.</dd>
<dt>The wrong player is in the final (or a later round)</dt>
<dd>An earlier result is wrong. Open that match and save the right score, or click <b>Clear result</b>. DartDraw clears every later match the old winner reached, asks first if any has a result, and you enter those again. After a round robin, a corrected group result does not redraw the knockout: use <b>Regenerate from current standings</b>. More: <a href="#correct-a-result">Correcting or clearing a result</a>.</dd>
<dt>I typed a score on the wrong match</dt>
<dd>Click the match and choose <b>Clear result</b>, then put the score where it belongs. More: <a href="#correct-a-result">Correcting or clearing a result</a>.</dd>
<dt>A player has left, or did not turn up</dt>
<dd>Use <b>Mark no-show&hellip;</b> once their group or match has started. Use <b>Withdraw</b> only before their group starts. More: <a href="#player-leaves">No-shows and players who leave</a>.</dd>
<dt>I can&rsquo;t change the entries, swap or redraw after the games start</dt>
<dd>That is on purpose: results belong to the entries who played them. Use <b>Mark no-show&hellip;</b> to take someone out. More: <a href="#faq-entries-locked">Why can&rsquo;t I change the entries after the games start?</a></dd>
<dt>Red &ldquo;Updated elsewhere&rdquo; banner</dt>
<dd>The event was changed in another window, tab or device. Click <b>Reload</b>, then enter your last change again. More: <a href="#troubleshooting-save">Saving and &ldquo;Updated elsewhere&rdquo;</a>.</dd>
<dt>&ldquo;Couldn&rsquo;t save &mdash; click to retry&rdquo;</dt>
<dd>Check your internet connection and click the message. Do not close the page until it says <b>Saved</b>.</dd>
<dt>Results are not on the public page</dt>
<dd>Tick <b>Publish results</b> on step 5. To be on the public home page too, also tick <b>List on the public page</b>. The event page refreshes about every 20 seconds. More: <a href="#faq-not-on-home-page">Why is my event not on the public home page?</a></dd>
<dt>The printed sheet is too small, too big or cut off</dt>
<dd>Set the printer to the paper size DartDraw prints for (A4 landscape, or the bracket&rsquo;s paper size) and keep the scale on its default. For a big bracket on an ordinary printer, choose <b>Split over N A4 sheets</b> when DartDraw asks. More: <a href="#bracket-sheets">Knockout bracket sheets and paper size</a>.</dd>
<dt>&ldquo;This bracket needs A3 paper&rdquo; (or A2, A1)</dt>
<dd>The bracket is too big to print readably on your paper. Choose the bigger paper, <b>Split over N A4 sheets</b>, or keep your size and shrink it. More: <a href="#bracket-sheets">Knockout bracket sheets and paper size</a>.</dd>
<dt>My phone or tablet shows &ldquo;Please rotate your device to landscape to use DartDraw.&rdquo;</dt>
<dd>On a tablet or phone, DartDraw only works held sideways. Turn the device; the message goes by itself and nothing you did is lost. More: <a href="#screen-size">Phones, tablets and screen size</a>.</dd>
<dt>I click a step and nothing happens</dt>
<dd>Steps open in order. Save the step you are on first: step 2 opens once step 1 is saved, step 3 once step 2 is saved.</dd>
<dt>A chart says &ldquo;Un-confirmed automatically&rdquo;</dt>
<dd>Its entries changed after you confirmed it. Check it on step 4 and click <b>Confirm this chart</b> again.</dd>
<dt>A <b>?</b> next to an entry in the standings</dt>
<dd>They are still level after every tie-break rule. Settle it (a playoff or your decision), then use <b>Adjust positions&hellip;</b>. More: <a href="#faq-tie-breaks">How do tie-breaks work?</a></dd>
<dt>&ldquo;Try a sample event&rdquo; is not on my screen</dt>
<dd>The <b>Get started</b> card only shows while you have no saved events, and you can hide it. More: <a href="#sample-event">Try it first with a sample event</a>.</dd>
<dt>The sign-in page won&rsquo;t let me in</dt>
<dd>Use <b>Forgot password?</b>, or ask your admin for a reset link. More: <a href="#signing-in">Signing in</a>.</dd>
</dl>

<h4 id="troubleshooting-save">Saving and &ldquo;Updated elsewhere&rdquo;</h4>
<p>DartDraw saves every change to your account a moment after you make it. The save status says what is happening; see <a href="#autosave">Saving your work</a> for every message.</p>
<dl class="msgs">
<dt>&ldquo;Updated elsewhere &mdash; click to reload&rdquo;</dt>
<dd>The same event was changed on another device, tab or window. The red banner at the top says &ldquo;Updated elsewhere &mdash; reload to get the latest&rdquo;. Your last change in this window was not saved, and this window saves nothing more for the event until you reload. That way it cannot write over the newer results. Click <b>Reload</b> before you enter anything else, then enter your last change again. To avoid it, work on each event in one window at a time. See <a href="#fpw-sync">Keeping the windows in step</a>.</dd>
<dt>&ldquo;Couldn&rsquo;t save &mdash; click to retry&rdquo;</dt>
<dd>Check your internet connection and click the message. Do not close the page until it says <b>Saved</b>.</dd>
<dt>I was sent back to the sign-in box</dt>
<dd>Your session ended. Sessions do not last for ever, and they also end if your password was changed or your account was suspended. Sign in again. If a change had not been saved yet, DartDraw keeps it in this browser and, after you sign in again, asks whether to restore it. It can only be restored if the event has not changed in the meantime; otherwise it says so, and you enter the change again.</dd>
<dt>The page looks out of date</dt>
<dd>Press <b>F5</b> to reload. The saved copy is always the truth.</dd>
</dl>

<h4 id="printing-tips">Printing problems</h4>
<ul>
<li>Printing uses your browser&rsquo;s print window. To make a PDF, pick <b>Save as PDF</b> as the printer.</li>
<li>Sheets are A4 landscape, apart from knockout brackets. Those follow the <b>Knockout bracket paper size</b> you chose (or are split over A4 sheets, if you chose that). Set the printer to the same paper size, or the bracket is shrunk again by the printer.</li>
<li>Look at the preview before printing. If the page is cut off, check the paper size and that the scale is on its default setting.</li>
<li>Print the blank pack <em>before</em> you start the games. You can print again at any time.</li>
<li>Publish before you print if you want QR codes on the group charts and bracket sheets. Click <b>Publish results now</b> in the note on step 4, or tick <b>Publish results</b> on step 5.</li>
<li>Print the full pack from the main window: <b>Print bracket pack</b> on step 4, <b>Print final chart &mdash; Save high-res A4 PDF</b> on step 7. The <b>Print</b> button in the full-page window prints only the chart that window shows.</li>
</ul>

<h4 id="fixes">Other messages</h4>
<dl class="msgs">
<dt>Nothing opens when I click Open in new window</dt>
<dd>Your browser blocked the pop-up. DartDraw usually says so: &ldquo;Your browser blocked the new window &mdash; allow pop-ups for this site, then click the button again.&rdquo; Allow pop-ups for this site and click again. See <a href="#full-page-window">Second screen or projector</a>.</dd>
<dt>&ldquo;Scores are locked&rdquo;</dt>
<dd>Games have not started. Go to Manage Tournament and click <b>Start all games</b>.</dd>
<dt>Start all games or Print is greyed out</dt>
<dd>You have no confirmed chart yet. Confirm at least one in Confirm &amp; Print Bracket.</dd>
<dt>&ldquo;The knockout can only be drawn once every group is finished&rdquo;</dt>
<dd>Finish every group first. If entries are level on the cut-off line, settle them with <b>Adjust positions&hellip;</b>.</dd>
<dt>Withdraw has gone, and Mark no-show&hellip; is there instead</dt>
<dd>The entry&rsquo;s group has started, or the knockout has been drawn. Withdrawing now would remove results already in, so use <b>Mark no-show instead</b>. See <a href="#player-leaves">No-shows and players who leave</a>.</dd>
<dt>&ldquo;Resolve ties before continuing&rdquo;</dt>
<dd>Two or more entries are level after every tie-break rule. Decide the order (a playoff or your decision) and set it with <b>Adjust positions&hellip;</b>.</dd>
<dt>The left-hand menu is missing</dt>
<dd>You are on a phone, or the window is narrower than about 700 pixels, so the menu is replaced by a bar at the top. Tap the step name in that bar to choose a step or another event. For more room, use a laptop, desktop or tablet, or widen the window.</dd>
</dl>
`
      }
    ]
  },
  {
    id: 'reference',
    title: 'Reference',
    kind: 'guide',
    items: [
      {
        id: 'glossary',
        title: 'Words you will see',
        summary: 'Every word and short label the app shows, in plain words, with an example of where you see it.',
        keywords: 'glossary words terms term meaning meanings jargon abbreviation abbreviations definition definitions what does mean explain explained key legend label labels',
        body: `
<p>Grouped by topic. Each word says what it means, then where you see it, in grey.</p>

<h4 id="glossary-entries">Entries and the draw</h4>
<dl class="glossary">
<dt id="glossary-entry">Entry (player, pair or team)</dt>
<dd>One side in the event: a player in Singles, a pair in Doubles, a team in Teams. &ldquo;24 entries&rdquo; in Doubles means 24 pairs. <span class="eg">Step 1: <b>Number of entries</b>, <b>Number of pairs</b> or <b>Number of teams</b>; step 3: &ldquo;Entry 1&rdquo;, <b>Pair name</b>, <b>Team name</b>.</span></dd>
<dt id="glossary-group">Group</dt>
<dd>A small set of entries who all play each other (a round robin). Each group prints as one chart. In Group Boards a group is a small knockout instead. <span class="eg">&ldquo;Group A &middot; Board 2&rdquo; on step 4 and step 5.</span></dd>
<dt id="glossary-board">Board</dt>
<dd>A dartboard. Each group plays on its own board or boards; groups that share a board play one after another. <span class="eg">Step 2: <b>Number of boards available</b>; step 3: <b>Board(s)</b>.</span></dd>
<dt id="glossary-draw">Draw</dt>
<dd>Who goes in which group, or who meets whom in a bracket. <span class="eg">Step 3: <b>Random draw</b>, &ldquo;Not drawn&rdquo;, <b>Draw groups</b>.</span></dd>
<dt id="glossary-seed">Seed</dt>
<dd>A strong entry placed so that the strongest do not meet early. Seeds 1 and 2 can only meet in the final. <span class="eg">Step 3: <b>Seed this bracket</b>, <b>Number of seeds</b>.</span></dd>
<dt id="glossary-labels">A1, B2 and other position labels</dt>
<dd>A letter and a number: the group, then the place in it. &ldquo;A1&rdquo; is the winner of Group A, and &ldquo;A2&rdquo; its runner-up. Before a draw, an unnamed entry can read &ldquo;Player A1&rdquo;. <span class="eg">The projected bracket, and the knockout drawn from a round robin.</span></dd>
<dt id="glossary-bye">Bye</dt>
<dd>A free pass into the next round, because there is no opponent. It happens when the number of entries does not fill the bracket (4, 8, 16, 32, 64 or 128). <span class="eg">Step 2: &ldquo;Bracket size (auto)&rdquo; with the number of byes; a small BYE tag on printed brackets.</span></dd>
<dt id="glossary-check-in">Check-in</dt>
<dd>A tick for each entry who has arrived. It is only a record for you. <span class="eg">Step 4: the <b>Check-in</b> card, <b>Check in all</b>, &ldquo;10 of 12 checked in&rdquo;.</span></dd>
<dt id="glossary-withdraw">Withdraw</dt>
<dd>Take an entry out before their group starts, with or without a replacement. <span class="eg">Step 3: <b>Withdraw</b>.</span></dd>
<dt id="glossary-confirm">Confirm</dt>
<dd>You checked a chart and it is ready to print and play. <span class="eg">Step 4: <b>Confirm this chart</b>, &ldquo;Un-confirmed automatically&rdquo;.</span></dd>
</dl>

<h4 id="glossary-matches">Matches and results</h4>
<dl class="glossary">
<dt id="glossary-leg">Leg, and best of</dt>
<dd>A leg is one game of darts. A match is &ldquo;best of&rdquo; a number of legs: in a best of 5 the first to win 3 legs wins. You type the legs each side won, for example 3 and 1. <span class="eg">Step 2: <b>Best of legs</b>; printed charts: &ldquo;Best of 5 Legs&rdquo;.</span></dd>
<dt id="glossary-marker">Marker</dt>
<dd>The person who keeps score at the board for a match, usually another entry from the same group who is not playing. DartDraw suggests one for every match; Teams events have none. <span class="eg">The match list on each chart: &ldquo;Match 1 &middot; 1 v 2 &middot; Marker: 3&rdquo; (the numbers are places in the group).</span></dd>
<dt id="glossary-start">Start all games, Start round</dt>
<dd><b>Start all games</b> opens scoring for every confirmed group at once. <b>Start round</b> in a knockout tells DartDraw when a round began, so it can compare the clock with its estimate. In a Teams event, starting also locks the segments. <span class="eg">Step 5.</span></dd>
<dt id="glossary-walkover">Walkover (WO)</dt>
<dd>A win given because the opponent did not turn up. It counts as a played match. <span class="eg">A WO tag on the chart or bracket.</span></dd>
<dt id="glossary-no-show">No-show</dt>
<dd>An entry who did not turn up or has left. Marking them gives walkovers to their opponents. <span class="eg"><b>Mark no-show&hellip;</b> on step 5; a <b>No-show</b> tag on step 3.</span></dd>
<dt id="glossary-neither">Neither showed</dt>
<dd>Neither side of a knockout match turned up. Nobody goes through from it. <span class="eg">The <b>Mark no-show&hellip;</b> box; the public page says &ldquo;Neither attended&rdquo;.</span></dd>
<dt id="glossary-codes">Match codes: 2-1, P2-1, G3&middot;1-2</dt>
<dd>Which match in a bracket: the round, then the match in that round. &ldquo;2-1&rdquo; is round 2, match 1. A &ldquo;P&rdquo; in front is the Plate pool; &ldquo;G3&middot;&rdquo; in front is Group 3 of Group Boards. <span class="eg">The small tag on each bracket match; split sheets say &ldquo;to Finals 5-1&rdquo;.</span></dd>
<dt id="glossary-rounds">Round names</dt>
<dd>Knockout rounds are named from the end: Final, Semifinal, Quarterfinal, and before that &ldquo;Round of 16&rdquo;, &ldquo;Round of 32&rdquo; and so on (how many places the round has, byes included). <span class="eg">Bracket headings; step 2 knockout legs.</span></dd>
<dt id="glossary-call">Call to a board</dt>
<dd>In Group Boards, tell the players on the public results page to go to their board now. <span class="eg">The <b>Boards</b> card: <b>Call</b>, <b>Uncall</b>, &ldquo;Called&rdquo;.</span></dd>
</dl>

<h4 id="glossary-tables">Tables and tie-breaks</h4>
<dl class="glossary">
<dt id="glossary-standings">Standings</dt>
<dd>The table under each group chart: who is where, worked out from the results. <span class="eg">Step 5: &ldquo;Standings&rdquo;; step 6: <b>Finalize Standings</b>.</span></dd>
<dt id="glossary-columns">Pos., MP, MW, ML, MD, LW, +/-, Pts</dt>
<dd>Position; matches played; matches won; matches lost; matches drawn (shown only for a draw saved in an older event: there are no draws now); legs won; leg difference (legs won minus legs lost); points. A win is 1 point and a loss 0. <span class="eg">The standings table; printed charts: &ldquo;Points: Win 1 &middot; Loss 0&rdquo;.</span></dd>
<dt id="glossary-tb">TB, H2H, LD, LW and ?</dt>
<dd>The TB column shows which tie-break separated two entries level on points: H2H (head-to-head: the match between them), LD (leg difference) or LW (legs won). &ldquo;3-way&rdquo; means three entries were level. A <b>?</b> means they are still level after every rule: you decide. <span class="eg">The TB column of the standings table.</span></dd>
<dt id="glossary-tie-break">Tie-break order</dt>
<dd>The order of those rules. You can change it in Advanced setup. <span class="eg">Step 2: <b>Tie-break order</b>; printed charts: &ldquo;Tie-break: 1) Legs won&hellip;&rdquo;.</span></dd>
<dt id="glossary-manual">* (asterisk)</dt>
<dd>A position you set by hand. <span class="eg"><b>Adjust positions&hellip;</b>; printed charts: &ldquo;* Position set manually by organiser&rdquo;.</span></dd>
<dt id="glossary-qualifier">Qualifier, goes through</dt>
<dd>An entry that finished high enough in its group to go into the knockout. <span class="eg">Step 2: <b>Entries per group (advance to knockout)</b>; the projected bracket: &ldquo;12 qualifiers&rdquo;.</span></dd>
</dl>

<h4 id="glossary-formats">Formats and stages</h4>
<dl class="glossary">
<dt id="glossary-round-robin">Round robin</dt>
<dd>Everyone in a group plays everyone else in that group once. <span class="eg">Step 2: <b>Round robin</b>, <b>Round robin &rarr; Knockout</b>.</span></dd>
<dt id="glossary-knockout">Knockout, bracket</dt>
<dd>Lose once and you are out. The bracket is the chart of who meets whom, round by round, up to the Champion. <span class="eg">Step 2: <b>Knockout</b>, <b>Single bracket</b>; step 5: <b>Knockout stage</b>.</span></dd>
<dt id="glossary-projected">Projected bracket</dt>
<dd>The knockout as it will look, printed before the groups are played, with position labels like A1 instead of names. <span class="eg">The print pack: &ldquo;Main bracket (projected)&rdquo;.</span></dd>
<dt id="glossary-plate">Plate pool</dt>
<dd>A second knockout for the entries who did not go through from the groups, so they keep playing. It has its own winner. <span class="eg">Step 2 (Advanced setup): <b>Plate pool</b>; match codes starting with P.</span></dd>
<dt id="glossary-group-boards">Group Boards, Finals</dt>
<dd>A knockout for a big field: small knockout groups, each on its own board, then the group champions meet in a Finals bracket. <span class="eg">Step 2: <b>Group Boards, then finals</b>; &ldquo;Winner of Group 3&rdquo; in the Finals.</span></dd>
</dl>

<h4 id="glossary-teams">Teams</h4>
<dl class="glossary">
<dt id="glossary-segment">Segment</dt>
<dd>One part of a team match, for example &ldquo;Singles 1&rdquo; or a foursome. The team&rsquo;s result is the total legs from all the segments. <span class="eg">Step 2: <b>Team match segments (played in order)</b>.</span></dd>
<dt id="glossary-foursome">Singles, Doubles, Trios, Foursome</dt>
<dd>A segment for one, two, three or four players from each team. <span class="eg">The segment type on step 2.</span></dd>
<dt id="glossary-tie-breaker">Tie-breaker (Teams)</dt>
<dd>An extra segment, played only when the team totals are level. <span class="eg">Step 2: <b>A tie-breaker might be needed</b>; the lineup sheet: TIE-BREAKER.</span></dd>
<dt id="glossary-fixture">Fixture</dt>
<dd>One team match: one team against another, on one board. <span class="eg">The Fixture box on the lineup sheet.</span></dd>
<dt id="glossary-lineup">Lineup sheet</dt>
<dd>A page for each fixture where the captains write who plays each segment, and the points. <span class="eg">Step 4 or 7: <b>Also print a lineup/scorecard sheet for each fixture, for captains to fill in on the day</b>.</span></dd>
</dl>

<h4 id="glossary-sharing">Printing, sharing and finishing</h4>
<dl class="glossary">
<dt id="glossary-pack">Blank pack, running order, rules sheet</dt>
<dd>What you print before play: the charts with no scores, a master running order (board by board, every match with a tick box) and a rules &amp; format sheet. <span class="eg">Step 4: <b>Print bracket pack</b>.</span></dd>
<dt id="glossary-sheet-language">Printed sheets language</dt>
<dd>The language every printed sheet of the event uses, English or Bahasa Malaysia, whatever language your screen shows. See <a href="#sheet-language">Printed sheets language</a>. <span class="eg">Steps 4 and 7: <b>Printed sheets language</b>.</span></dd>
<dt id="glossary-language">EN | BM</dt>
<dd>The language switch: the words on your screen in English or Bahasa Malaysia. It changes only the words, never your event. See <a href="#language-switch">The EN | BM switch</a>. <span class="eg">The top bar, next to <b>Help</b>.</span></dd>
<dt id="glossary-publish">Publish, list</dt>
<dd>Publish puts the results on a public page that anyone with the link can see. List also shows the event on the public home page. <span class="eg">Step 5: <b>Publish results</b>, <b>List on the public page</b>.</span></dd>
<dt id="glossary-qr">QR code</dt>
<dd>A square code printed on charts and bracket sheets. Phones scan it to open the live results. It only prints while the event is published. <span class="eg">Printed sheets: &ldquo;Live results &middot; Scan, or go to&rdquo; and the address.</span></dd>
<dt id="glossary-full-page">Full-page window</dt>
<dd>Manage Tournament in its own window, for a second screen or projector. <span class="eg">Step 5: <b>Open in new window &#8599;</b>.</span></dd>
<dt id="glossary-finalize">Finalize</dt>
<dd>Accept the results as final. The public page then says <b>Final results</b>, and only an Admin can reopen the event. <span class="eg">The bottom of step 5: <b>Accept &amp; finalize</b>.</span></dd>
<dt id="glossary-incident">Incident log</dt>
<dd>Your private notes about warnings or disputes. Never printed or shown. <span class="eg">Step 5: <b>+ Log incident</b>.</span></dd>
<dt id="glossary-sample">Sample event</dt>
<dd>A practice event that is never saved unless you click <b>Save as my event</b>. <span class="eg">The welcome screen: <b>Try a sample event</b>.</span></dd>
</dl>
`
      },
      {
        id: 'limits-and-facts',
        title: 'Limits and facts: entries, brackets, screens and connection',
        summary: 'How big an event can be, which screens work, and why you need a connection.',
        claims: ['phone-bar'],
        keywords: 'limit limits maximum how many size big screen screens phone tablet laptop desktop landscape portrait rotate offline internet connection facts',
        body: `
<h4 id="limits">How big an event can be</h4>
<ul>
<li>A round robin has no fixed limit.</li>
<li>A knockout bracket holds up to 128 slots (4, 8, 16, 32, 64 or 128).</li>
<li>Group Boards allows up to 128 groups of 2 to 128 players each.</li>
<li>A Teams match has 1 to 8 segments.</li>
</ul>
<p>If you see a message that your account allows up to a certain number of entries per event, contact your admin. See <a href="#faq-how-many-entries">How many entries can I have?</a></p>

<h4 id="screen-size">Phones, tablets and screen size</h4>
<p class="callout"><b>Screen size.</b> The organiser app is made for a laptop, desktop or tablet. On a tablet or phone, hold it sideways (landscape). Held upright, DartDraw covers the screen with &ldquo;Please rotate your device to landscape to use DartDraw.&rdquo; Turn the device and your work is still there. A phone on its side works too, with a note that DartDraw works best on a tablet, laptop or desktop: the left-hand menu becomes a bar at the top. Tap the step name there for the steps, your events, <b>Rename</b>, <b>Duplicate</b> and <b>Delete</b> for the open event, and <b>Change password</b>. The bar is used on every phone (a touch screen less than 600 pixels on its short side, whichever way you hold it) and in any window narrower than about 700 pixels. A tablet, and a laptop or desktop window that is wider than that, keep the menu at the side, even when the window is short. See <a href="#faq-phone">Can I use my phone?</a></p>

<h4 id="connection">Connection</h4>
<p>Your events are saved to your account on the internet, so you need a connection to sign in and to save. Print the blank pack before play in case the venue wifi is poor. See <a href="#faq-offline">Can I use DartDraw offline?</a></p>
`
      }
    ]
  },

  {
    id: 'faq',
    title: 'Frequently asked questions',
    kind: 'faq',
    items: [
      {
        id: 'faq-two-events',
        title: 'Can I run two events at once?',
        keywords: 'two events same time several events',
        body: `<p>Yes. Each event is separate. Click <b>+ New tournament</b> for the second one, or open it from <b>Saved tournaments</b>. Open the app in a second browser tab if you want to look at both together. Just do not open the <em>same</em> event in two places and score in both. A score entered in a window that is out of date is not saved. If you see &ldquo;Updated elsewhere&rdquo;, click <b>Reload</b> before you enter anything else, then enter your last change again.</p>`
      },
      {
        id: 'faq-offline',
        title: 'Can I use DartDraw offline?',
        keywords: 'wifi internet connection no signal',
        body: `<p>No. Your events are saved to your account on the internet, so you need a connection to sign in and to save. If the connection drops, DartDraw shows <b>Couldn&rsquo;t save &mdash; click to retry</b>. Keep the page open, get back online and click the message, and wait for <b>Saved</b> before you open another event (DartDraw keeps you on the event until then). It is a good idea to print the blank pack before play in case the venue wifi is poor.</p>`
      },
      {
        id: 'faq-how-many-entries',
        title: 'How many entries can I have?',
        keywords: 'how many players maximum limit size big',
        body: `<p>There is no fixed limit for a round robin. A knockout bracket holds up to 128 slots. For big fields, use Group Boards, which allows up to 128 groups of 2 to 128 players each. If you see a message that your account allows up to a certain number of entries per event, contact your admin.</p>`
      },
      {
        id: 'faq-change-after-finalized',
        title: 'How do I change a score after the event is finalized?',
        keywords: 'reopen change after finalize',
        body: `<p>You cannot. Only an Admin can reopen a finalized event, so ask your admin. Once it is reopened, reload the event, fix the score and accept the results again. Before you finalize, you can correct any score by clicking it and saving a new result. See <a href="#finishing-the-event">Finishing the event</a> and <a href="#correct-a-result">Correcting or clearing a result</a>.</p>`
      },
      {
        id: 'faq-correct-result',
        title: 'How do I correct or clear a result?',
        claims: ['ko-cascade', 'clear-result'],
        keywords: 'typo mistake wrong score undo change score fix correct clear delete score wrong match',
        body: `<p>Click the match. To correct it, type the right legs and click <b>Save score</b>. To empty it, click <b>Clear result</b>, then <b>Clear result</b> again in the box that asks &ldquo;Clear this result?&rdquo;. The match goes back to not played. In a knockout, a new winner (or a cleared match) also clears every later match the old winner had reached, and the champion. When any of those already has a result, DartDraw lists them first and you choose <b>Change result</b> or <b>Cancel</b>. A new score with the same winner changes nothing later. Once the knockout has been drawn from a round robin, group results can be corrected but not cleared. See <a href="#correct-a-result">Correcting or clearing a result</a>.</p>`
      },
      {
        id: 'faq-pair-names',
        title: 'Can spectators see the names of players in a pair?',
        keywords: 'pair names doubles partner',
        body: `<p>They see the <b>pair name</b> you type, and the organisation if you gave one. There are no separate boxes for the two players, so if you want both names to show, put both in the pair name, such as both surnames together. A team is shown by its team name in the same way.</p>`
      },
      {
        id: 'faq-not-on-home-page',
        title: 'Why is my event not on the public home page?',
        keywords: 'home page listed missing event not showing',
        body: `
<p>Go through this list:</p>
<ol>
<li>Is <b>Publish results</b> ticked on the Public results card (bottom of step 5)?</li>
<li>Is <b>List on the public page</b> ticked? It is off by default, and unticking Publish results turns it off.</li>
<li>Wait about half a minute and refresh the home page.</li>
<li>Look at the right tab. <b>Live</b> needs play to have started and the event not finalized. <b>Upcoming</b> is for events that have not started and have a date of yesterday or later. <b>Results</b> is for finalized events, and only for a limited time.</li>
<li>If the card says the address of the public site is not set up, tell your admin.</li>
</ol>
<p>A duplicated event starts unpublished and unlisted, so tick both again.</p>`
      },
      {
        id: 'faq-tie-breaks',
        title: 'How do tie-breaks work?',
        keywords: 'tie tied level h2h head to head tiebreak tie break level on points',
        body: `
<p>Entries are ranked by points first. A win is 1 point and a loss 0. There are no draws: a score must have a winner, and in a Teams round robin a level total goes to the tie-breaker.</p>
<p>When entries have the same points, DartDraw uses your <b>Tie-break order</b>. The default is:</p>
<ol>
<li><b>Legs won</b>: the most legs won over the whole group.</li>
<li><b>Leg difference</b>: legs won minus legs lost over the whole group.</li>
<li><b>Head-to-head result</b>: whoever won the match between them goes ahead.</li>
<li><b>Organiser decision / playoff</b>: nothing automatic. It is down to you.</li>
</ol>
<p>With three or more entries level, head-to-head, leg difference and legs won use only the matches those entries played against each other. If a rule separates some of them, the entries still level are sorted again by the rules, in order.</p>
<p>If every rule leaves two entries level, a <b>?</b> badge appears and a warning says they need an organiser decision or a playoff. Settle it, then set the order with <b>Adjust positions&hellip;</b>. Steps 6 and 7, and drawing the knockout when the tie is on the cut-off line, stay locked until you do. In Advanced setup you can reorder the rules under Rules on step 2.</p>`
      },
      {
        id: 'faq-legs',
        title: 'What does &ldquo;best of 5&rdquo; mean when I enter a score?',
        keywords: 'leg legs what is a leg best of',
        body: `<p>The first to win most of the legs wins the match. In a best of 5 that is 3 legs. The score box accepts only finished results: the winner must have exactly 3, and the loser 0, 1 or 2. In a best of 3 the winner needs 2, and so on.</p>`
      },
      {
        id: 'faq-team-result',
        title: 'How do I enter the result of a team match?',
        keywords: 'team score team result',
        body: `<p>As one result: the total legs each team won across all the segments, including the tie-breaker if it was played. A team cannot have more than the most it could win (9 with the default segments, 10 where the tie-breaker is used). Where the tie-breaker is used, the totals can&rsquo;t be level. Without it, level totals are a draw in a round robin, and are refused in a knockout. See <a href="#teams-results">Entering a team result</a>.</p>`
      },
      {
        id: 'faq-byes',
        title: 'How are byes decided in a knockout?',
        keywords: 'bye byes',
        body: `<p>The bracket size is the next one up from your entries (4, 8, 16, 32, 64 or 128). The empty places are byes in round 1. They go to the best seeds. With seeding off, the draw is random. Entries from the same organisation are kept apart as long as possible whenever an organisation is filled in. After a round robin, entries from the same group come first, then the same organisation. Each draw takes about a second at most. In a big bracket with many entries from one organisation, the spread is the best DartDraw finds in that time, which can be slightly less even than possible. A bracket holds at most 128 entries: DartDraw refuses a bigger one and says which setting to change.</p>`
      },
      {
        id: 'faq-basic-advanced',
        title: 'What is the difference between Basic and Advanced setup?',
        keywords: 'basic advanced setup mode',
        body: `<p>Basic setup shows only the essentials. Advanced setup adds scheduling (level of play, start time, breaks), different best-of-legs for later knockout rounds, the Plate pool, sponsor logos with a footer line, and your own tie-break order. You can switch whenever you like and nothing you set is lost. See <a href="#setup-mode">Basic or Advanced setup</a>.</p>`
      },
      {
        id: 'faq-plate',
        title: 'What is a Plate pool?',
        keywords: 'consolation losers second chance plate',
        body: `<p>In Round robin &rarr; Knockout, entries that do not advance can play their own knockout, called the Plate pool, so they still get matches. Turn it on in Advanced setup on step 2. You can limit how many enter with <b>Plate entries per group</b>. See <a href="#rr-ko-setup">Round robin &rarr; Knockout</a>.</p>`
      },
      {
        id: 'faq-group-boards',
        title: 'What is Group Boards, and do I have to use it?',
        keywords: 'group boards',
        body: `<p>No, it is optional. It is a kind of Knockout: choose <b>Knockout</b>, then <b>Group Boards, then finals</b>. It splits a big field into small knockout groups. Each group has its own board and ends with a champion, and the champions play a Finals bracket. It suits large events. For a normal-sized field, a round robin or a knockout is usually simpler. See <a href="#group-boards">Group Boards</a>.</p>`
      },
      {
        id: 'faq-change-format',
        title: 'Can I change the format after I have started?',
        keywords: 'change format',
        body: `<p>Change the format before you start the games. Go back to step 2, make the change and save. Round robin groups adjust to fit. Group Boards cannot be redrawn once scores are in. Once scores are entered it is safest to leave the format alone.</p>`
      },
      {
        id: 'faq-entries-locked',
        title: 'Why can’t I change the entries, swap or redraw after the games start?',
        claims: ['roster-lock'],
        keywords: 'locked swap redraw',
        body: `<p>Because results already played belong to the entries who played them. Once a group has started (after <b>Start all games</b>), has a result, or the knockout has been drawn, DartDraw refuses anything that would move or remove those entries, and says why: <b>Withdraw</b>, <b>Swap with&hellip;</b> and <b>Random draw</b> on step 3, and lowering <b>Number of entries</b> on step 1 when that would remove someone who is playing. Before the games start all of these work as usual. To take someone out once play has begun, use <b>Mark no-show&hellip;</b>. See <a href="#player-leaves">A player leaves part-way</a>.</p>`
      },
      {
        id: 'faq-move-player',
        title: 'Can I move a player to another group?',
        keywords: 'move player swap',
        body: `<p>Yes, on step 3. In a round robin use <b>Swap with&hellip;</b>. In Group Boards use <b>Move&hellip;</b> before you confirm the groups. A confirmed group whose entries change is un-confirmed for you. Do this before games start: once a group has started, DartDraw refuses to swap or move its entries. See <a href="#faq-entries-locked">Why can&rsquo;t I change the entries after the games start?</a></p>`
      },
      {
        id: 'faq-no-show',
        title: 'Someone did not turn up. What do I do?',
        keywords: 'no show noshow absent did not turn up missing walkover',
        body: `<p>Once play has started, use <b>Mark no-show&hellip;</b>. In a round robin it fills their unplayed matches with walkover losses. In a knockout it gives the opponent a walkover win. If both are missing in a knockout or Group Boards match, choose <b>Neither showed</b> (a round robin does not have that choice). Before their group starts, in a round robin you can <b>Withdraw</b> them; once it has started, Withdraw is refused and offers <b>Mark no-show instead</b>. See <a href="#no-shows">No-shows and walkovers</a> and <a href="#player-leaves">A player leaves part-way</a>.</p>`
      },
      {
        id: 'faq-admin',
        title: 'Who is the Admin, and how do I reach them?',
        keywords: 'contact support admin administrator reach',
        body: `<p>The Admin is the person who runs your DartDraw site. They create organiser accounts, can send a password reset link, and are the only person who can reopen a finalized event. Contact them the way you normally would. DartDraw has no built-in way to message them.</p>`
      },
      {
        id: 'faq-forgot-password',
        title: 'I forgot my password',
        keywords: 'reset password forgot password cant sign in locked out email',
        body: `<p>Ask your admin for a reset link. You can also click <b>Forgot password?</b> on the sign-in form and type your email; if a link arrives, follow it, and if nothing arrives, ask your admin. Using a reset link signs you out on every device.</p>`
      },
      {
        id: 'faq-paper-size',
        title: 'Can I print on A3 or bigger?',
        keywords: 'paper size a3 a2 a1 big paper',
        body: `<p>Knockout brackets can be printed on A4, A3, A2 or A1. Pick the <b>Knockout bracket paper size</b> on the print screen; the fit check under it shows how big the names print on each size. If a bracket is too big for the size you chose, DartDraw asks whether to use the size it recommends, split the bracket over A4 sheets, or keep your size and shrink it. Round robin charts and other sheets are A4 landscape. See <a href="#bracket-sheets">Knockout bracket sheets and paper size</a>.</p>`
      },
      {
        id: 'faq-update-speed',
        title: 'How quickly do spectators see new scores?',
        keywords: 'spectators delay how fast',
        body: `<p>Their page refreshes itself about every 20 seconds, and picks up scores shortly after you save them. The home page list can take about half a minute to catch up.</p>`
      },
      {
        id: 'faq-duplicate',
        title: 'Can I reuse an event for next time?',
        keywords: 'copy reuse template next time',
        body: `<p>Yes. Click <b>Duplicate</b> under the event in <b>Saved tournaments</b>. You get a copy with &ldquo;(copy)&rdquo; added to the name. It is open for editing, not published and not listed. The copy keeps the entries, settings and any scores, so change what you need.</p>`
      },
      {
        id: 'faq-incident-log',
        title: 'Is the incident log public?',
        keywords: 'incident log dispute',
        body: `<p>No. It is only for you. It is never printed and never appears on the public results page.</p>`
      },
      {
        id: 'faq-two-devices',
        title: 'Can I use the same account on two devices?',
        keywords: 'updated elsewhere two tabs two windows second device',
        body: `<p>Yes. Sign in on both. Your events are the same on each. Just score each event on one device at a time. A score entered on a device that is out of date is not saved. If you see &ldquo;Updated elsewhere &mdash; click to reload&rdquo;, click <b>Reload</b> on the red banner before you enter anything else, then check your latest scores and enter your last change again.</p>`
      },
      {
        id: 'faq-unconfirmed',
        title: 'Why did a chart say &ldquo;Un-confirmed automatically&rdquo;?',
        keywords: 'unconfirmed un confirmed',
        body: `<p>You changed who is in that group after confirming it, for example by swapping or withdrawing an entry. DartDraw un-confirms it so you check it again. Click <b>Confirm this chart</b> once it is right.</p>`
      },
      {
        id: 'faq-window-sync',
        title: 'Does the full-page window update by itself?',
        keywords: 'full page window update',
        body: `<p>Not while you are looking at it. Each window loads the saved event when it opens. When you switch to a window, it checks for a newer copy and loads it, with the note &ldquo;Updated with the latest scores&rdquo; (not on steps 1 to 3, not while one of your changes is still saving or a box is open, and not while you have typed something not yet saved). Windows in the same browser tell each other when they save, so this works straight away; for a change made on another device it checks at most every few seconds. An out-of-date window cannot write over newer scores: its save is refused and it shows &ldquo;Updated elsewhere &mdash; reload to get the latest&rdquo;, but the score you entered there is not saved. Press <b>F5</b> to bring a window up to date, and score in one window at a time. See <a href="#fpw-sync">Keeping the windows in step</a>.</p>`
      },
      {
        id: 'faq-phone',
        title: 'Can I use my phone?',
        keywords: 'phone mobile tablet ipad iphone android portrait landscape rotate',
        body: `<p>Yes, held sideways (landscape), but DartDraw works best on a tablet, laptop or desktop. Held upright, a phone or tablet shows &ldquo;Please rotate your device to landscape to use DartDraw.&rdquo; Turn it and the app is back as you left it. On a phone on its side, a slim note says DartDraw works best on a bigger screen (tap &times; to hide it). The left-hand menu becomes a bar at the top: tap the step name to change step, open another event, rename, duplicate or delete this one, or change your password. Setting up an event is easier on a bigger screen; a phone is fine for checking and entering scores.</p>`
      },
      {
        id: 'faq-delete',
        title: 'Can I delete or rename an event?',
        keywords: 'rename delete remove event edit name',
        body: `<p>Yes, with <b>Rename</b> and <b>Delete</b> under the event in <b>Saved tournaments</b>. Deleting removes it from your account for good. You cannot rename or delete a finalized event. Ask your admin.</p>`
      }
    ]
  }
];

/* The search box (help-search.js, shared with the spectators' Help). Plain data; build-landing.js puts it in the page.
   - synonyms: groups of words and phrases that mean the same to someone searching. Typing any of them searches for all of
     them. Built from what novice organisers typed in the 2026-10-22 walkthrough (tests/fixtures/help-search-organiser.json
     checks every one of those phrases). Add a group, or a word to a group, when a real search finds nothing useful.
   - noAnswer: things this Help does not cover. The search then says so in one honest line instead of showing noise.
   - popular: the links offered when nothing matches. Use ids that exist on the page. */
const search = {
  synonyms: [
    ['login', 'log in', 'logon', 'log on', 'sign in', 'signin', 'sign on', 'signing in', 'logging in'],
    ['register', 'registration', 'sign up', 'signup', 'create account', 'new account', 'get an account', 'no account', 'account', 'invite', 'invitation'],
    ['password', 'forgot password', 'forgotten password', 'lost password', 'reset password', 'change password'],
    ['typo', 'mistake', 'wrong score', 'wrong result', 'wrong match', 'wrong', 'undo', 'change score', 'change a score', 'change result', 'edit score',
      'correct', 'correction', 'correct a result', 'fix score', 'fix a score', 'clear result', 'clear a result', 'clear score', 'delete score', 'remove score'],
    ['quit', 'player quit', 'leaves', 'player leaves', 'leave', 'leaving', 'drop out', 'dropped out', 'drops out', 'retire', 'retired', 'injured',
      'injury', 'gave up', 'give up', 'pull out', 'pulled out', 'leaves part way', 'leaves midway'],
    ['no show', 'noshow', 'didnt turn up', 'did not turn up', 'didnt show', 'did not show', 'didnt come', 'absent', 'not turned up', 'walkover', 'walk over', 'wo'],
    ['withdraw', 'withdrawal', 'withdrawals', 'remove player', 'remove entry', 'scratch'],
    ['download', 'export', 'pdf', 'save as pdf', 'save pdf', 'print to pdf'],
    ['qr', 'qr code', 'qr codes', 'barcode', 'scan'],
    ['share', 'share link', 'link', 'public link', 'live link', 'live results', 'live page', 'public page', 'spectator', 'spectators', 'audience', 'viewers', 'fans'],
    ['board', 'boards', 'oche', 'dartboard', 'dartboards', 'lane', 'lanes'],
    ['draw', 'redraw', 'random draw', 'random', 'shuffle', 'seed', 'seeds', 'seeding', 'seeded'],
    ['finalise', 'finalize', 'finalised', 'finalized', 'finish', 'finished', 'finishing', 'close event', 'end event', 'complete', 'accept', 'accept results', 'lock results', 'sign off'],
    ['players', 'player', 'people', 'entrants', 'participants', 'competitors', 'names', 'entry', 'entries', 'pair', 'pairs', 'team', 'teams'],
    ['tie', 'tied', 'ties', 'tie break', 'tie breaks', 'tiebreak', 'tie breaker', 'tiebreaker', 'level on points', 'h2h', 'head to head', 'playoff', 'play off'],
    ['leg', 'legs', 'best of', 'what is a leg'],
    ['bye', 'byes', 'free pass'],
    ['rename', 'edit name', 'change name', 'rename event'],
    ['phone', 'mobile', 'tablet', 'ipad', 'iphone', 'android', 'portrait', 'landscape', 'rotate', 'sideways'],
    ['offline', 'no internet', 'no wifi', 'wifi', 'connection', 'no signal', 'internet'],
    ['couldnt save', 'not saving', 'wont save', 'save failed', 'not saved', 'cant save'],
    ['updated elsewhere', 'two windows', 'two tabs', 'another device', 'second device', 'out of date'],
    ['paper size', 'paper', 'a3', 'a2', 'a1', 'big paper', 'bigger paper', 'poster'],
    ['reprint', 'print again', 'reprinting'],
    ['winner', 'champion', 'who won', 'won', 'final standings', 'placings'],
    ['begin', 'get started', 'getting started', 'first event', 'tutorial', 'beginner', 'quick start', 'quickstart'],
    ['contact', 'support', 'helpdesk', 'help desk', 'admin', 'administrator'],
    ['marker', 'markers', 'scorer', 'chalker', 'referee'],
    ['plate', 'plate pool', 'consolation', 'losers bracket', 'second chance'],
    ['duplicate', 'copy', 'reuse', 'template', 'next time'],
    ['check in', 'checkin', 'checked in', 'arrived', 'attendance'],
    ['segment', 'segments', 'team match'],
    ['glossary', 'words', 'terms', 'jargon', 'abbreviation', 'abbreviations', 'meaning', 'definition', 'definitions', 'what does it mean'],
    ['standings', 'table', 'tables', 'columns', 'mp', 'mw', 'ml', 'lw', 'pts'],
    ['qualifier', 'qualifiers', 'qualify', 'go through', 'goes through', 'advance', 'advances', 'advancing'],
    ['sample', 'sample event', 'practice', 'demo', 'try it', 'test event'],
    ['problem', 'problems', 'troubleshooting', 'not working', 'broken', 'something wrong', 'gone wrong'],
    ['language', 'languages', 'bahasa', 'bahasa malaysia', 'bahasa melayu', 'malay', 'melayu', 'bm', 'translate', 'translation', 'translated', 'english'],
    ['email', 'emails', 'e-mail', 'e-mails', 'mail', 'inbox'],
    ['sheet language', 'sheets language', 'printed sheets language', 'print language', 'paper language', 'print in malay', 'print in english']
  ],
  noAnswer: [
    { terms: ['free', 'cost', 'costs', 'price', 'prices', 'refund', 'pay', 'payment', 'paid', 'fee', 'fees', 'money', 'charge'],
      say: 'This Help does not cover costs or payments. Ask your DartDraw admin.' },
    { terms: ['180', '180s', 'checkout', 'checkouts', 'double out', 'average', 'averages', 'darts thrown', 'high score'],
      say: 'DartDraw records each match result in legs. It does not keep the darts thrown, so there are no 180s, checkouts or averages.' },
    { terms: ['trophy', 'trophies', 'prize', 'prizes', 'medal', 'medals'],
      say: 'DartDraw does not keep track of prizes or trophies.' },
    { terms: ['text message', 'text messages', 'sms', 'phone number', 'phone numbers', 'whatsapp', 'message players', 'email players', 'notify', 'notification', 'notifications'],
      say: 'DartDraw cannot send messages to players. Share the live link or the QR codes instead.' },
    { terms: ['csv', 'excel', 'spreadsheet', 'xlsx'],
      say: 'There is no spreadsheet export yet. You can print any chart, or save it as a PDF.' },
    { terms: ['video', 'videos', 'live stream', 'livestream', 'stream', 'streaming', 'broadcast', 'youtube', 'watch video'],
      say: 'DartDraw shows scores, not video: it cannot stream or record the matches.' }
  ],
  popular: [
    { id: 'quick-start', label: 'Quick start' },
    { id: 'no-account', label: 'No account yet?' },
    { id: 'correct-a-result', label: 'Correcting or clearing a result' },
    { id: 'player-leaves', label: 'No-shows and players who leave' },
    { id: 'troubleshooting', label: 'When something goes wrong' },
    { id: 'glossary', label: 'Words you will see' }
  ],
  stuck: 'Still stuck? Ask your DartDraw admin.'
};

module.exports = {
  VIEWER_URL,
  VIEWER_HELP_URL,
  title: 'Help for organisers',
  lede: 'Short, step-by-step guides for running an event in DartDraw, and quick answers to the questions organisers ask most.',
  sections,
  search
};

// The words on the public Help page (/help): the organiser guide and the FAQ.
// This file is DATA only. scripts/build-landing.js turns it into help.html (npm run build-landing).
//
// How to edit
//   - A section has an id, a title, a kind ('guide' or 'faq') and a list of items.
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
    id: 'guide',
    title: 'Guide',
    kind: 'guide',
    items: [
      {
        id: 'quick-start',
        title: 'Quick start: run your first event in about 10 minutes',
        summary: 'Seven steps for a first event: 24 players, singles, 4 dartboards, groups then a knockout.',
        keywords: 'tutorial walkthrough example first new beginner begin start set up setup how to quickstart players',
        body: `
<p>The example: 24 players, one evening, 4 dartboards. Everyone plays in groups of 4, then the top 2 of each group play a knockout. Work down the steps in the left-hand menu; each one opens when the one before is saved.</p>
<ol class="qsteps">
<li id="quick-start-step-1"><b>Create the event.</b> Click <b>+ New tournament</b>, type a <b>Tournament name</b> and an <b>Event name</b>, leave <b>Competition type</b> on <b>Singles</b>, set the <b>Tournament date</b> and type 24 in <b>Number of entries</b>. Click <b>Save event creation &rarr;</b>.
<span class="see">You should see: step 2, <b>Format &amp; branding</b>. More: <a href="#creating-an-event">Creating an event</a>.</span></li>
<li id="quick-start-step-2"><b>Choose the format.</b> Click <b>Format</b> to open it, choose <b>Round robin &rarr; Knockout</b> and set <b>Best of legs</b> to 3; leave <b>Maximum entries per group</b> at 4 and <b>Entries per group (advance to knockout)</b> at 2. Under <b>Scheduling</b>, check it says 4 boards (new events start with 4; <b>Edit scheduling settings</b> changes it), then click <b>Save format &amp; branding &rarr;</b>.
<span class="see">You should see: step 3, <b>Chart details</b>, with 24 entries called &ldquo;Entry 1&rdquo; to &ldquo;Entry 24&rdquo;. The blue box may suggest a different split; it is only a suggestion. More: <a href="#choosing-a-format">Choosing a format</a>.</span></li>
<li id="quick-start-step-3"><b>Type the names and draw the groups.</b> Type each player&rsquo;s name over &ldquo;Entry 1&rdquo;, &ldquo;Entry 2&rdquo; and so on, then click <b>Random draw</b>. Click <b>Review print pack &rarr;</b>.
<span class="see">You should see: six groups, A to F, of 4 players each, each with a board; groups that share a board play one after another. More: <a href="#draw">Drawing the groups</a>.</span></li>
<li id="quick-start-step-4"><b>Confirm, publish, print.</b> On step 4, click <b>Confirm all 6 charts</b>. If spectators will follow on their phones, click <b>Publish results now</b> in the note above the print button <em>first</em>, so the QR codes print; then click <b>Print bracket pack</b> and choose a printer or <b>Save as PDF</b>.
<span class="see">You should see: your browser&rsquo;s print window with the running order and one chart for each group. More: <a href="#print-pack">Printing the blank pack</a> and <a href="#qr-codes">QR codes</a>.</span></li>
<li id="quick-start-step-5"><b>Play the groups.</b> On step 5, <b>Manage Tournament</b>, click <b>Start all games</b> and confirm in the box. Then click the box where two players meet, type the legs each won (for example 2 and 1) and click <b>Save score</b>.
<span class="see">You should see: the standings under that chart update at once. More: <a href="#enter-scores">Entering scores</a>.</span></li>
<li id="quick-start-step-6"><b>Run the knockout.</b> When every group is finished, click <b>Generate knockout bracket</b> in the <b>Knockout stage</b> card. Enter each knockout match the same way: click it, type the legs and click <b>Save score</b>.
<span class="see">You should see: the top 2 of each group, 12 players, in the bracket, with 4 of them starting in round 2 (a bye); each winner moves on by itself. More: <a href="#rr-knockout-draw">Drawing the knockout from a round robin</a>.</span></li>
<li id="quick-start-step-7"><b>Finish.</b> When the final is in, go to the bottom of step 5 and click <b>Accept &amp; finalize</b>, then <b>Accept &amp; finalize</b> again in the box &ldquo;Accept results as final?&rdquo;. You cannot undo this; only an Admin can reopen the event.
<span class="see">You should see: &ldquo;Results finalized&rdquo;, and the public page says <b>Final results</b>. Step 7, <b>Print Final Chart</b>, prints the results. More: <a href="#finishing-the-event">Finishing the event</a>.</span></li>
</ol>
<p>Stuck? See <a href="#troubleshooting">Printing tips and troubleshooting</a> or the <a href="#faq">questions</a>. No account yet? See <a href="#no-account">No account yet?</a></p>
`
      },
      {
        id: 'getting-started',
        title: 'Getting started',
        summary: 'Get an account, sign in, learn the seven steps, choose Basic or Advanced setup, and know what the save messages mean.',
        claims: ['phone-bar'],
        keywords: 'login log in signin sign up signup register registration account invite invitation admin password',
        body: `
<h4 id="no-account">No account yet?</h4>
<p>Accounts are created by the site admin, usually the person who runs DartDraw for your club or league. Unless the sign-in box shows a <b>Sign up</b> link, you cannot make one yourself: ask your admin to create it. You then get a link to choose your password, and you sign in as below.</p>
<p>The sign-in box says the same under <b>Sign in</b>: &ldquo;No account yet? Accounts are created by the site admin.&rdquo; Your admin can add a line under it saying who to ask and how. If your club has no admin yet, the person who set up DartDraw for you can create one. See also <a href="#faq-admin">Who is the Admin, and how do I reach them?</a></p>

<h4 id="signing-in">Signing in</h4>
<p>Your site admin creates your account and sends you a link to choose a password. After that:</p>
<ol>
<li>Click <b>Log in</b> at the top of any public page.</li>
<li>Type your email and password, then click <b>Sign in</b>.</li>
<li>You land in the organiser app, where all your events live.</li>
</ol>
<p>Forgot your password? The surest way is to ask your admin for a reset link. You can also click <b>Forgot password?</b> under the sign-in form and type your email. If a link arrives, follow it. If nothing arrives, ask your admin.</p>
<p>To change your password while you are signed in, click <b>Change password</b> next to <b>Log out</b> in the left-hand menu (on a phone or a narrow window, tap the step name in the bar at the top, then <b>Change password</b>). Type your <b>Current password</b>, then your <b>New password</b> twice. It must be at least 8 characters. Changing it signs you out on your other devices, but not on the one you are using.</p>
<p class="callout"><b>Screen size.</b> The organiser app is made for a laptop, desktop or tablet. On a tablet or phone, hold it sideways (landscape). Held upright, DartDraw covers the screen with &ldquo;Please rotate your device to landscape to use DartDraw.&rdquo; Turn the device and your work is still there. A phone on its side works too, with a note that DartDraw works best on a tablet, laptop or desktop: the left-hand menu becomes a bar at the top. Tap the step name there for the steps, your events, <b>Rename</b>, <b>Duplicate</b> and <b>Delete</b> for the open event, and <b>Change password</b>. The bar is used on every phone (a touch screen less than 600 pixels on its short side, whichever way you hold it) and in any window narrower than about 700 pixels. A tablet, and a laptop or desktop window that is wider than that, keep the menu at the side, even when the window is short. See <a href="#faq-phone">Can I use my phone?</a></p>

<h4 id="seven-steps">The seven steps</h4>
<p>The left-hand menu lists seven steps. Work down the list. You cannot skip ahead: step 2 opens once step 1 is saved, and step 3 opens once step 2 is saved.</p>
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
<li>&ldquo;Advanced&rdquo; adds scheduling details (level of play, start time and breaks), different best-of-legs for each knockout round, the Plate pool, sponsor logos with a footer line, and your own tie-break order.</li>
</ul>
<p>You can switch at any time, on step 1 or with the <b>Switch to Advanced</b> link at the top of step 2. Switching never deletes anything you have already set.</p>

<h4 id="autosave">Saving your work</h4>
<p>On steps 1 and 2, what you type is saved when you click the button at the bottom of the form (<b>Save event creation &rarr;</b> or <b>Save format &amp; branding &rarr;</b>). After that, every change is saved to your account by itself, a moment after you make it. Names save when you click or tab out of the box.</p>
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
<dd>The event was deleted (or moved to another organiser) in another window or device, so nothing you change here can be saved. Open another event.</dd>
<dt>Finalizing&hellip;</dt>
<dd>You accepted the results and DartDraw is closing the event. Wait for it to finish.</dd>
<dt>This event is finalized &mdash; only an Admin can change it</dt>
<dd>The event is closed. See <a href="#finishing-the-event">Finishing the event</a>.</dd>
</dl>
`
      },
      {
        id: 'creating-an-event',
        title: 'Creating an event (step 1)',
        summary: 'Name it, choose Singles, Doubles or Teams, set the date and the number of entries (players, pairs or teams).',
        keywords: 'players pairs teams people entries how many',
        body: `
<p>Click <b>+ New tournament</b> at the top of the left-hand menu. Step 1 is called <b>Event creation</b>. Fill in:</p>
<ol>
<li><b>Setup mode</b>: &ldquo;Basic&rdquo; or &ldquo;Advanced&rdquo;. See <a href="#setup-mode">Basic or Advanced setup</a>.</li>
<li><b>Tournament name</b>: the day or competition, for example Spring Open 2026. It is printed on every sheet.</li>
<li><b>Event name</b>: this competition inside it, for example Open Singles.</li>
<li><b>Event category</b>: <b>Open</b>, <b>Women</b> or <b>Youth</b>. It is printed on the charts.</li>
<li><b>Competition type</b>: <b>Singles</b>, <b>Doubles</b> or <b>Teams</b>.</li>
<li><b>Tournament date</b>: shown on the charts. The public home page also uses it to list upcoming events.</li>
<li><b>Number of entries</b>: at least 2. An entry is a player in Singles, a pair in Doubles and a team in Teams, and the box says so: in a Doubles event it is called <b>Number of pairs</b>, and in a Teams event <b>Number of teams</b>.</li>
</ol>
<p>Click <b>Save event creation &rarr;</b> to move on to step 2.</p>

<h4 id="singles-or-doubles">Singles, Doubles or Teams</h4>
<p>In <b>Singles</b>, one entry is one player.</p>
<p>In <b>Doubles</b>, one entry is a <b>pair</b> of two players. The number of entries is the number of pairs, so 24 players make 12 pairs: type 12 in <b>Number of pairs</b>. In step 3 each pair has one box, the <b>Pair name</b>. Charts, results and the public page show the pair name, so choose something both players recognise, such as both surnames together.</p>
<p>In <b>Teams</b>, one entry is a <b>team</b>, and in step 3 it has one box, the <b>Team name</b>. There is no list of players to fill in: captains write their line-up on the day. A team match is made of segments that you set on step 2. See <a href="#teams">Teams events</a>.</p>

<h4 id="boards-and-entries">Boards and the number of entries</h4>
<p>There is no boards box on step 1. You set the number of boards on step 2, under Scheduling.</p>
<p>You can change the number of entries later: click <b>Edit</b> on the summary card at the top of a step, change the number and save. Raising it adds blank entries such as &ldquo;Entry 9&rdquo;. Lowering it removes entries from the end of the list, so do that before you type names or draw groups. Once one of those entries is playing (their group has started, they have a result, or they are in the drawn knockout), DartDraw refuses with &ldquo;These entries are already playing&rdquo; and saves nothing, because it would delete results already played. See <a href="#faq-entries-locked">Why can&rsquo;t I change the entries after the games start?</a></p>
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
        title: 'Choosing a format (step 2)',
        summary: 'Round robin, knockout (one bracket, or Group Boards then finals) or round robin then knockout, plus legs, boards, branding and rules.',
        body: `
<p>Step 2 is <b>Format &amp; branding</b>. It has four sections: <b>Format</b>, <b>Scheduling</b>, <b>Branding &amp; print</b> and <b>Rules</b>. Click a section heading to open or close it. Click <b>Save format &amp; branding &rarr;</b> when you are done.</p>

<h4 id="format-types">The formats</h4>
<p>Under <b>Competition format</b> pick one of three:</p>
<ul>
<li><b>Round robin</b>: entries play within their groups. Everyone in a group plays everyone else in it once.</li>
<li><b>Knockout</b>: direct elimination. Lose and you are out. Under <b>Knockout type</b> choose <b>Single bracket</b> (the usual choice: one bracket, and if the number of entries does not fill it, the app adds byes in round 1 and gives them to the best seeds) or <b>Group Boards, then finals</b> (small knockout groups first, each on its own board, so every group has a champion before the finals; see below).</li>
<li><b>Round robin &rarr; Knockout</b>: a group stage first, then the top finishers go into a bracket.</li>
</ul>

<h4 id="legs">Best of legs</h4>
<p>The <b>Best of legs</b> box sets how long a match is. Odd numbers are best. Best of 5 means the first to 3 legs wins. When you enter a result, the winner must have exactly that many legs and the loser fewer. An even number shows a warning, because it can end level.</p>
<p>A Teams event has no <b>Best of legs</b> box: each segment of a team match has its own. See <a href="#teams">Teams events</a>.</p>

<h4 id="round-robin-setup">Round robin</h4>
<p>Choose <b>Maximum entries per group</b> (3 to 6). A blue box under it shows the split DartDraw recommends, for example how many groups and how many matches each group plays. DartDraw balances the groups when it draws them.</p>

<h4 id="rr-ko-setup">Round robin &rarr; Knockout</h4>
<ul>
<li><b>Entries per group (advance to knockout)</b>: how many from each group go into the bracket.</li>
<li><b>How entries are placed into the bracket</b>: <b>Seeded by group standing (recommended)</b> puts group winners ahead of runners-up and keeps entries from the same group apart for as long as possible. <b>Random draw</b> mixes them up.</li>
<li><b>Plate pool</b> (Advanced setup): tick <b>Also run a Plate pool knockout bracket for entries that don&rsquo;t advance</b>. Leave <b>Plate entries per group</b> empty to send everyone who does not advance to the Plate pool. Type a number to cap it, so anyone ranked below that is out.</li>
</ul>
<p>The bracket is not drawn until every group has finished. You draw it in step 5. See <a href="#managing-the-tournament">Managing the tournament</a>.</p>

<h4 id="group-boards">Group Boards, then finals (a Knockout option)</h4>
<p>Choose <b>Knockout</b>, then <b>Group Boards, then finals</b>. It suits big fields and anyone who wants a group champion before the finals. Instead of one big bracket you choose a number of small groups, and each group is a little knockout on its own board. Every group ends with a champion, and the champions meet in a <b>Finals</b> bracket. You do not have to use it, and it is not offered with the round robin formats.</p>
<ul>
<li><b>Number of groups</b>: at least 2, at most 128. Each group needs at least 2 players and holds at most 128 (a group is one knockout bracket). DartDraw tells you if the numbers do not fit. Moving a player or placing a late entry into a group that already has 128 players is refused; swap two players instead.</li>
<li><b>Best of legs inside each group</b> can differ from the Finals. The Finals uses <b>Best of legs</b> (or your knockout leg settings in Advanced setup).</li>
<li>In step 3 you click <b>Draw groups</b>. Seeded players are spread one per group, and the groups can be changed by hand until you confirm them.</li>
<li>The Finals chart is built as soon as the last group is confirmed, with slots such as &ldquo;Winner of Group 3&rdquo;.</li>
</ul>

<h4 id="knockout-legs">More legs in later rounds</h4>
<p>In Advanced setup a knockout has a tick box that raises the legs in later rounds (not in a Teams event, where every round uses the same segments). Tick it and you can set <b>Early rounds</b>, <b>Quarterfinal</b>, <b>Semifinal</b> and <b>Final</b> separately. Every round before the quarterfinal uses <b>Early rounds</b>. The Plate pool has its own, independent settings.</p>

<h4 id="scheduling">Scheduling</h4>
<p>Click <b>Edit scheduling settings</b>. <b>Number of boards available</b> sets the board choices later on. In Advanced setup you can also set <b>Level of play</b> (Professional, Amateur or Novice), an <b>Anticipated start time</b> and breaks. DartDraw uses these to estimate how long the event takes and to show &ldquo;On schedule&rdquo; or &ldquo;Running behind&rdquo; while you play. These are rough guides. They are never printed.</p>

<h4 id="branding-and-rules">Branding and rules</h4>
<ul>
<li><b>Tournament logo</b>: best as a square or near-square PNG. DartDraw resizes it for you.</li>
<li><b>Sponsor logos</b> and <b>Optional print rules / footer text</b> (Advanced setup): sponsor logos print in the chart footer as a rectangle or a square, whichever you pick for each one.</li>
<li><b>Walkover, conduct &amp; other rules</b>: free text printed on the rules sheet.</li>
<li><b>Tie-break order</b> (Advanced setup): move the rules up or down. See <a href="#faq-tie-breaks">How do tie-breaks work?</a></li>
</ul>
`
      },
      {
        id: 'teams',
        title: 'Teams events',
        summary: 'Set up a team match as segments, add a tie-breaker, enter one result per match and print lineup sheets.',
        body: `
<p>In a Teams event every match between two teams is made of <b>segments</b>, played one after another: for example a foursome, then singles and doubles games. You set the segments once, on step 2, and every match in the event uses them, in the groups, every knockout round, the Plate pool and Group Boards alike. A team is just its name. DartDraw keeps no list of players.</p>

<h4 id="team-segments">Setting up the segments</h4>
<p>Open the <b>Format</b> section of step 2. Under <b>Team match segments (played in order)</b> each row is one segment, with:</p>
<ul>
<li>a type: <b>Singles</b>, <b>Doubles</b>, <b>Trios</b> or <b>Foursome</b>;</li>
<li>a starting score: <b>301</b>, <b>501</b>, <b>701</b> or <b>1001</b>;</li>
<li>a <b>best of</b> number of legs. It must be odd (1, 3, 5&hellip;): an even number shows a warning, and <b>Save format &amp; branding &rarr;</b> refuses it, because it could end level. The same goes for the tie-breaker when it is used.</li>
</ul>
<p>Click <b>+ Add segment</b> for another row. Use the arrows to move a segment up or down, and <b>&#10005;</b> to remove one. There is always at least one, and at most 8, so the lineup sheet fits on one page. The editor is there in Basic and Advanced setup. A Teams event has no <b>Best of legs</b> box and no extra legs for later rounds, because each segment sets its own.</p>
<p>Like every other setting on step 2, your changes count only when you click <b>Save format &amp; branding &rarr;</b>. Leave the step without saving and the segments stay as they were. Once games have started (after <b>Start all games</b> or <b>Start round</b>, once a match is called to its board, or once any result is in), the segments are locked and shown read-only, and the format and the competition type (step 1) of a Teams event can&rsquo;t change any more, because every match of the event must be played the same way.</p>
<p>A new Teams event starts with five segments: Foursome 1001, best of 1; Singles 501, best of 3; Doubles 501, best of 3; Singles 501, best of 3; Doubles 501, best of 3. Change them to suit your league.</p>

<h4 id="team-tie-breaker">The tie-breaker</h4>
<p>Under <b>A tie-breaker might be needed</b> you choose where a tie-breaker is used: <b>Use a tie-breaker in round robin matches</b>, <b>Use a tie-breaker in knockout matches</b>, or both. Only the ticks that fit your format are shown: a round robin has the first, a knockout (Group Boards included) the second, and Round robin &rarr; Knockout both. When one is ticked, a <b>Tie-breaker</b> row appears at the end with its own type, starting score and best of. It is played only when the two teams have won the same number of legs after the main segments. A new event has both ticked, with a Foursome 1001, best of 1.</p>
<p>Each tick is locked once its own stage has begun, not before: in Round robin &rarr; Knockout you can still choose the knockout tie-breaker while the groups are being played. Even after a stage has begun you can switch its tie-breaker <b>on</b> (never off again): the knockout one at any time, and the round robin one as long as no drawn result is saved. The tie-breaker&rsquo;s type, starting score and best of can change while no stage that has begun uses it.</p>

<h4 id="teams-results">Entering a team result</h4>
<p>You enter one result for the whole match, not one for each segment. Click the match as usual and type, in each box, the <b>total legs that team won across all the segments</b>, adding the tie-breaker&rsquo;s legs if it was played. Then click <b>Save score</b>. Standings, leg difference and the bracket all use those totals.</p>
<p>For example, with the five default segments, a team that wins the foursome (1 leg), one singles 2&ndash;1 and loses the other three segments 1&ndash;2 has 1 + 2 + 1 + 1 + 1 = 6 legs, and the other team has 0 + 1 + 2 + 2 + 2 = 7.</p>

<h4 id="teams-cap">The most a team can win</h4>
<p>In each segment a team can win at most the legs it needs to take it: 1 in a best of 1, 2 in a best of 3, 3 in a best of 5. Added up over the segments, that is the most a team can have in one match. With the five default segments it is 9, or 10 in a stage that uses the tie-breaker. The result box says &ldquo;A team can win at most 10 legs.&rdquo; and refuses a bigger number with a message: it never changes what you typed. A result saved earlier can always be saved again unchanged.</p>

<h4 id="teams-level">When the totals are level</h4>
<ul>
<li><b>Where the tie-breaker is used</b>, a level total can&rsquo;t be saved: play the tie-breaker and include its legs in the totals.</li>
<li><b>A round robin without the tie-breaker</b> (also the group stage of Round robin &rarr; Knockout): a level total is allowed. It is a draw, 1 point each.</li>
<li><b>A knockout without the tie-breaker</b> (Group Boards included): a level total is still refused (&ldquo;This is a knockout match &mdash; it can&rsquo;t end level.&rdquo;), because a knockout needs a winner. The message suggests ticking <b>Use a tie-breaker in knockout matches</b> (possible at any time), or playing one more deciding leg and including it in the totals. One more leg always fits: a level total is always below the most a team can win.</li>
</ul>
<p>A no-show works as in any event: <b>Mark no-show&hellip;</b> gives the other team every main segment, which is 9&ndash;0 with the defaults.</p>

<h4 id="lineup-sheet">The lineup sheet</h4>
<p>On step 4 or step 7, tick <b>Also print a lineup/scorecard sheet for each fixture, for captains to fill in on the day</b>. The pack then gets one page for each fixture whose teams are known, with both teams side by side. Each side has a dark bar for every segment, such as <b>Singles 1</b>, with its starting score and legs and a Points box, numbered lines for the players&rsquo; names (one for singles, two for doubles, three for trios, four for a foursome), the <b>TIE-BREAKER</b> bar when that fixture uses one, then a compact <b>TOTAL POINTS</b> box for everything including the tie-breaker, and the rest of the page as a large space for the captain&rsquo;s signature. Singles bars are half the height of the others. In a knockout, print again as rounds finish to get the next fixtures&rsquo; sheets.</p>
<p>The lineup sheet shows the <b>TIE-BREAKER</b> bar only for fixtures of a stage that uses it. The rules &amp; format sheet lists the segments and says where the tie-breaker is used, and the time estimate counts every leg of every segment, the tie-breaker&rsquo;s too in a stage that uses it. Each team match is one fixture on one board: its segments are played one after another and are never scheduled apart.</p>
<h4 id="ready-lineups">Knockout lineup sheets as the rounds go on</h4>
<p>In the knockout, a match&rsquo;s lineup sheet is ready as soon as both of its teams are known: the first round when the bracket is drawn, a later match the moment both of its teams have won through. On step 5 (<b>Manage Tournament</b>) the <b>Lineup sheets</b> card lists every match that is ready and not yet played. Click <b>Print lineup</b> on one match, or <b>Print all ready lineup sheets</b> to print every ready sheet you have not printed yet. DartDraw remembers which sheets were printed (a sheet counts as printed for the two teams it was printed with) and marks them <b>Printed</b>; <b>Print again</b> reprints one. The full-page window of the bracket has the same list behind its <b>Lineup sheets</b> button. Round robin fixtures keep their sheets in the pack.</p>
<p>For a fixture added on the day or a spoiled sheet, <b>Print empty lineup sheet</b> prints a blank one: the event&rsquo;s name and logo, the segments and the tie-breaker bar as set up, <b>TOTAL POINTS</b> and the signature space, with the Group, Board, Fixture, Game No. and team name boxes left empty. Pick 1 to 10 copies beside the button. It is on the print steps (4 and 7) and in Manage Tournament, and works before anything is drawn.</p>
`
      },
      {
        id: 'entries-and-check-in',
        title: 'Entries, seeds, check-in and no-shows',
        summary: 'Naming entries, organisations, seeding, check-in, withdrawals, walkovers and matches nobody played.',
        claims: ['withdraw-guard', 'checkin-warning'],
        body: `
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
<p>In every knockout bracket (a knockout, the knockout after a round robin, the Plate pool and Group Boards groups), entries whose organisation is filled in are kept apart as long as possible, whether or not one of the tick boxes is on. When the bracket comes from a round robin, keeping entries from the same group apart comes first, and the same organisation second. Each draw is given about a second of work at most, so in a big bracket (from about 30 entries) with many entries from one or two organisations, the result is the best DartDraw found in that time: entries are still spread out, but a little less evenly than a much longer search could manage, and now and then a pair meets a round earlier than it might. So the projected bracket printed before the round robin can differ from the real draw when organisations are filled in.</p>

<h4 id="seeds">Seeds</h4>
<p>In a <b>Knockout</b>, step 3 shows <b>Participants &amp; Seeding</b>. Seeding is off by default, which means a fresh random draw every time you generate the bracket. Tick <b>Seed this bracket</b>, then use the up and down arrows to put entries in order. <b>Number of seeds</b> (4, 8, 16, 32 or 64) sets how many of the top entries show a seed number on the printed chart. Everyone is still placed using your order. Seeds 1 and 2 can only meet in the final, and the best seeds get any byes.</p>
<p>In <b>Round robin &rarr; Knockout</b>, seeds come from the group results. Entries show labels like &ldquo;A1&rdquo; (group A, first place). In <b>Group Boards</b>, the same seed list is used and seeds are spread one per group.</p>

<h4 id="check-in">Check-in</h4>
<p>On step 4 there is a <b>Check-in</b> card. Tick each entry as they arrive, or click <b>Check in all</b>. Use the search box, or tick <b>Only show who hasn&rsquo;t checked in yet</b>.</p>
<p>Check-in is just a record for you. It never stops you confirming, printing or starting. You get a yellow warning &ldquo;Not everyone is checked in&rdquo; when you click <b>Start all games</b>, when you click <b>Generate bracket</b> or <b>Regenerate bracket</b> in a Knockout, and when you draw or confirm Group Boards groups. You can carry on. Drawing the knockout after a round robin (<b>Generate knockout bracket</b>) does not warn, because by then everyone has played in the groups. In Group Boards, tick people in on step 4. Then, on step 3, before you click <b>Draw groups</b>, a <b>Withdraw the N not checked in</b> button (N is a number) removes everyone who is not ticked. It only appears once at least one person is ticked, and only before the draw.</p>

<h4 id="withdrawals">Withdrawals</h4>
<p>In a round robin, click <b>Withdraw</b> next to the entry on step 3. You can do this until their group starts. Before the draw it simply removes them. After the draw you can type a replacement name to fill the slot, or leave it blank for a bye. A group whose entries changed is un-confirmed so you can check it again.</p>
<p>Once their group has started (after <b>Start all games</b>), once they have a result, or once a drawn bracket holds them, Withdraw is no longer possible, because it would remove results that are already in and change the table. On step 3 the <b>Withdraw</b> button is then replaced by <b>Mark no-show&hellip;</b> (by a <b>No-show</b> tag once they are marked, and by nothing when they have no match left to play). Click it and DartDraw explains why and offers <b>Mark no-show instead</b>: in a group, their remaining matches become walkover losses; in the knockout, they lose their next match by a walkover and the opponent goes through. Results already played stay. See <a href="#player-leaves">A player leaves part-way</a>.</p>
<p>The Knockout list on step 3 has no Withdraw button. If someone is not coming, use <b>Mark no-show&hellip;</b> on their match once the bracket is drawn.</p>

<h4 id="no-shows">No-shows and walkovers</h4>
<p>In a <b>round robin</b>, once the games have started, click <b>Mark no-show&hellip;</b> on the group&rsquo;s chart and choose the entry. Every match they have not yet played in that group is filled in as a walkover loss (a win by the majority of legs to nil) and tagged <b>WO</b>. Real results you already entered are never overwritten. Until the knockout is drawn from the groups, the same box has an <b>undo</b> link. After that a no-show can no longer be undone (it would leave the group unfinished), but entering a real score over a WO box still replaces it.</p>
<p>In a <b>knockout</b> or <b>Group Boards</b> match, click <b>Mark no-show&hellip;</b> under the match and choose who did not show. The other side wins by a walkover and goes through, tagged <b>WO</b>.</p>

<h4 id="neither-showed">Neither showed</h4>
<p>This is for knockout and Group Boards matches only; a round robin has no such choice. If neither side turns up, choose <b>Neither showed</b> in the same box. Nobody advances and the next opponent gets a bye. If the match is a group&rsquo;s final in Group Boards, that group finishes with no winner and its Finals slot reads &ldquo;Group N: no winner&rdquo;, which becomes a bye. To undo it, open the match and click <b>Reverse it</b>, or just enter a score. On the public page the match reads &ldquo;Neither attended&rdquo;, or NO-SHOW in the bracket Chart view.</p>

<h4 id="adjust-positions">Adjusting positions</h4>
<p>If a round robin tie needs your decision, click <b>Adjust positions&hellip;</b> on the group in Manage Tournament, type the position you want for each entry and click <b>Save</b>. Manual positions get an asterisk (*) on the chart. <b>Reset all</b> brings back the automatic order.</p>
`
      },
      {
        id: 'player-leaves',
        title: 'A player leaves part-way',
        summary: 'What to do when an entry has to stop: before their group starts, during the groups, during the knockout, and after the event is finalized.',
        claims: ['withdraw-guard', 'no-show-route'],
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
`
      },
      {
        id: 'draws-and-printing',
        title: 'Groups, draws and printing (steps 3 and 4)',
        summary: 'Draw and confirm the groups, then print the blank pack: charts, rules sheet, logos and QR codes.',
        claims: ['print-order', 'roster-lock'],
        body: `
<h4 id="draw">Drawing the groups</h4>
<p>In a round robin, step 3 is called <b>Draw &amp; groups</b>. Entries stay as &ldquo;Not drawn&rdquo; until you click <b>Random draw</b>. Click it again to deal everyone out afresh; DartDraw asks first because it discards your manual swaps. Once any group has started, <b>Random draw</b> is greyed out and <b>Swap with&hellip;</b> is no longer offered for entries in a started group: moving entries then would leave results with people who did not play them.</p>
<ul>
<li>Switch between <b>Flat list</b> and <b>Grouped view</b>. The flat list has a search box for name or organisation.</li>
<li><b>Swap with&hellip;</b> opens a list of groups and positions. Pick one. If it is occupied the two entries swap. If it is blank the entry moves there.</li>
<li>Each group has a board. In the Grouped view you tick <b>Board(s)</b>. Groups on the same board play one after another. Tick more than one board to share a group&rsquo;s matches across them.</li>
</ul>
<p>The first match on every chart is 1 v 2. Each chart also lists the match order and suggests a marker for every match, chosen from the other entries in the group. A Teams event has no markers: each team scores its own match on the lineup sheet.</p>

<h4 id="confirm">Confirming</h4>
<p>Step 4 is <b>Confirm &amp; Print Bracket</b>. Check each group, then click <b>Confirm this chart</b>, or <b>Confirm all N charts</b>. The confirm box warns you about problems such as a missing entry or two identical names. If you later change who is in a confirmed group, it is un-confirmed for you with the note &ldquo;Un-confirmed automatically&rdquo;. Confirm it again.</p>
<p>For a Knockout, step 4 has <b>Generate bracket</b> (or <b>Regenerate bracket</b>). Regenerating after results exist wipes them, and asks first.</p>

<h4 id="print-pack">Printing the blank pack</h4>
<p>Click <b>Print bracket pack</b>. The pack is A4 landscape and can include, in this order:</p>
<ul>
<li>the rules &amp; format sheet, always the first page when it is ticked (tick box on the same screen);</li>
<li>a master running order, straight after the rules sheet (or first, if you leave the rules sheet out): one column per board (up to 8 on a sheet), each board&rsquo;s groups in the order they play, and each group&rsquo;s matches with a tick box. A board with more groups than fit continues on the next sheet; a group is never split;</li>
<li>one chart for each confirmed group;</li>
<li>the knockout bracket, or a projected bracket with labels like A1 before the groups are played;</li>
<li>in Group Boards, a <b>Players A&ndash;Z</b> sheet, a <b>Boards</b> sheet, one sheet for each group and the Finals;</li>
<li>in a Teams event, a lineup sheet for each fixture if you tick the box for it. See <a href="#lineup-sheet">The lineup sheet</a>.</li>
</ul>
<h4 id="bracket-sheets">Knockout bracket sheets and paper size</h4>
<p>Every knockout bracket (the main bracket, the Plate pool and the projected bracket) prints as one two-sided chart on one sheet: the left half and the right half run towards the Final in the middle, with the title above it and the Champion box below. An entry with a first-round bye starts in round 2 with a small BYE tag. Names up to 24 characters print in full; a longer name is cut with a small number, and the full name is printed at the foot of the sheet. Group Boards keeps its own chart.</p>
<p>Pick the <b>Knockout bracket paper size</b> (A4, A3, A2 or A1) on step 4 or step 7. Under it, a fit check shows how big the names print on each size. Names are readable from 7 pt. When they would print between 7 and 8 pt, a note suggests the size that gives 8 pt or more, with a button to switch the event to it; it never stops you printing.</p>
<p>When a bracket is too big to print readably on the size you chose, printing first asks what to do:</p>
<ul>
<li><b>Use A3 (recommended)</b> (or whichever size it needs): the event&rsquo;s saved paper size changes to that size and the bracket prints on one sheet of it. Set the printer to the same size.</li>
<li><b>Split over N A4 sheets</b>, where the bracket can be split: the outer rounds of each half are printed as sections on A4 sheets (L1, L2 &hellip; for the left half and R1, R2 &hellip; for the right, numbered top to bottom), then a Finals sheet for the last rounds, all at the same readable scale. Each section shows where its winners go (&ldquo;to Finals 5-1&rdquo;), and each first box on the Finals sheet shows where its entry comes from (&ldquo;L1 &middot; 4-1&rdquo; is the winner of match 4-1 on section L1). Small + marks show where winners leave a section and enter the Finals sheet.</li>
<li><b>Keep A4</b> (your size): the whole chart is shrunk to fit one sheet, keeping its shape. The names may be too small to read when printed, so a note on the print screen says so and offers the recommended size. The note is never printed.</li>
</ul>
<p>If no paper size up to A1 holds the bracket at 7 pt, the box says that even A1 needs to shrink it and offers only the split and the shrink.</p>
<p>Your answer is remembered for the event. You are asked again when it no longer fits: when you pick a different paper size, or after another draw that needs a different size.</p>
<p>Your browser&rsquo;s print window opens. Choose a printer, or choose <b>Save as PDF</b> to make a file. Print the blank pack before you start games; DartDraw suggests it when you start.</p>
<p class="callout"><b>Want QR codes on the sheets?</b> Publish before you print. While publishing is off, step 4 shows a note above the print button: &ldquo;Publishing is off, so these sheets will have no QR code&rdquo;. Click <b>Publish results now</b> in it (the same as ticking <b>Publish results</b> on step 5), then print. Sheets printed earlier have no QR code; print them again after publishing to get them.</p>

<h4 id="logos-and-rules">Logos, sponsors and the rules sheet</h4>
<p>Your tournament logo goes in every sheet header. Sponsor logos (Advanced setup) print in the footer when <b>Include sponsor footer on printed charts</b> is ticked. The rules sheet is written for you from your settings: the format, scoring, how many go through, tie-break order, plus anything you typed in <b>Walkover, conduct &amp; other rules</b>.</p>

<h4 id="qr-codes">QR codes</h4>
<p>Only some sheets carry a QR code, with the live address beside it: the round robin group charts, the knockout and Finals bracket sheets, the Group Boards group sheets, and in Group Boards the <b>Boards</b> and <b>Players A&ndash;Z</b> sheets. It is in the header, except on a two-sided knockout bracket, where it sits below the Champion box. The rules sheet and the running order do not have one.</p>
<p>Each code opens that sheet&rsquo;s own page: a group chart opens that group, a bracket sheet opens the bracket, the Boards sheet opens the Boards tab, and Players A&ndash;Z opens the event. The codes are made in your browser, so printing does not need extra internet.</p>
<p>They only appear when <b>Publish results</b> is on <em>and</em> the address of the public site is set up. Publishing lives on step 5, after the print on step 4, so step 4 reminds you: while publishing is off, a note above the print button says the sheets will have no QR code, with a <b>Publish results now</b> button. Click it before you print. If the note says instead that the address of the public results site isn&rsquo;t set up yet, ask your admin; the sheets then print without QR codes.</p>
`
      },
      {
        id: 'managing-the-tournament',
        title: 'Managing the tournament (step 5)',
        summary: 'Start the games, enter scores, correct or clear a result, run the knockout and Group Boards, and keep a private incident log.',
        claims: ['ko-cascade', 'clear-result', 'rr-clear-after-draw'],
        body: `
<p>Step 5 is <b>Manage Tournament</b>. This is where you spend match day.</p>

<h4 id="start-games">Start all games</h4>
<p>In a round robin or Round robin &rarr; Knockout, scores are locked until you click <b>Start all games</b>. All confirmed charts start together; you cannot start them one by one. Before you start, the score boxes are hatched and clicking one says &ldquo;Scores are locked&rdquo;. A knockout has no start button: click a match when it is played.</p>
<p>The box that opens may say <b>Suggestion: print the pack first</b>. You can choose <b>Go print the pack first</b> or <b>Start without printing</b>. It also names anyone who is not checked in.</p>

<h4 id="enter-scores">Entering scores</h4>
<p><b>Round robin:</b> click the box where two entries meet. Type each side&rsquo;s legs and click <b>Save score</b>. The winner must have exactly the legs needed for your best-of, and the loser fewer. Positions, points and leg totals update at once in the standings under each chart.</p>
<p><b>Knockout:</b> click a match, type the legs and click <b>Save score</b>. There are no draws. The winner moves to the next round.</p>
<p><b>Teams:</b> type the total legs each team won across the whole match. See <a href="#teams-results">Entering a team result</a>.</p>

<h4 id="correct-a-result">Correcting or clearing a result</h4>
<ul>
<li><b>To correct a score</b>, click it again, type the right legs and click <b>Save score</b>.</li>
<li><b>To clear a result</b>, for example a score typed on the wrong match, click it and choose <b>Clear result</b>. DartDraw asks &ldquo;Clear this result?&rdquo; first: click <b>Clear result</b> again, or <b>Cancel</b>. The match goes back to not played, and the round robin standings are worked out again. A walkover can be cleared the same way. A match marked <b>Neither showed</b> has <b>Reverse it</b> instead.</li>
<li><b>In a knockout</b>, if you change who won a match, or clear it, every later match that the old winner had reached is cleared as well, right up to the final, and so is the champion. You then enter those results again. If any of those later matches already has a result, DartDraw asks you first and lists them, for example &ldquo;Changing this result will clear 2 later results, and you will need to enter them again&rdquo;, with the champion if there is one. Click <b>Change result</b> to go ahead, or <b>Cancel</b> to leave everything as it was. Correcting only the score, with the same winner, changes nothing later and asks nothing. This works the same in the Plate pool, a Teams knockout, the Group Boards Finals and the full-page window. Inside a Group Boards group, a new winner clears the later matches of that group in the same way without asking; it is refused if a Finals match that depends on it already has a score.</li>
<li><b>After the knockout has been drawn from a round robin</b>, a group result can still be corrected with <b>Save score</b>, but it can no longer be cleared: the group would be unfinished, and the knockout is only drawn from finished groups. If a correction changes who goes through, use <b>Regenerate from current standings</b> (it discards any knockout results, and asks first).</li>
<li>A finalized event cannot be changed. See <a href="#reopening">Changing a finalized event</a>.</li>
</ul>

<h4 id="standings">Standings</h4>
<p>The standings table shows <b>MP</b> (matches played), <b>MW</b> (won), <b>ML</b> (lost), <b>LW</b> (legs won), <b>+/-</b> (leg difference) and <b>Pts</b>. A small <b>TB</b> badge shows which tie-break separated two entries. A <b>?</b> means they are still level. See <a href="#faq-tie-breaks">How do tie-breaks work?</a></p>

<h4 id="rr-knockout-draw">Drawing the knockout from a round robin</h4>
<p>In Round robin &rarr; Knockout, the <b>Knockout stage</b> card has <b>Generate knockout bracket</b>. It stays greyed out, and says &ldquo;The knockout can only be drawn once every group is finished&rdquo;, until every group is complete. If a tie sits on the cut-off line, you also have to settle it first with <b>Adjust positions&hellip;</b>. <b>Regenerate from current standings</b> rebuilds the bracket. If knockout results are already in, they are discarded, so it asks first. The Plate pool bracket is drawn at the same time.</p>
<p>Click <b>Start round</b> when a round begins if you want DartDraw to compare the clock with its estimates.</p>

<h4 id="group-boards-day">Group Boards</h4>
<p>Group Boards shows <b>All groups</b> as cards (filter with <b>All</b>, <b>Unfinished</b> and <b>Finished</b>). Click a group to open its bracket and enter results. Each group winner moves into the Finals by itself. When the Finals is built a <b>Finals</b> button appears.</p>
<p>The <b>Boards</b> card shows, for every board, what is on now and what is next. <b>Call</b> tells players on the public results page to go to their board (<b>Uncall</b> clears it). <b>Enter result</b> and <b>No-show</b> are there too. <b>Finals boards</b> lets you put a Finals match on a feature board.</p>

<h4 id="incident-log">Incident log</h4>
<p>At the bottom of step 5, <b>+ Log incident</b> records a warning, dispute or other event with the entry, what happened and the action taken. It is for you only. It is never printed and never shown on the public page.</p>

<h4 id="finishing-up">When play is over</h4>
<p>Use the <b>Accept results &amp; finalize</b> card at the bottom of step 5. See <a href="#finishing-the-event">Finishing the event</a>. To use a second screen while you play, see <a href="#full-page-window">Full-page window for a second screen</a>.</p>
`
      },
      {
        id: 'full-page-window',
        title: 'Full-page window for a second screen',
        summary: 'Open Round robin, the Winners bracket or the Plate pool in its own window for a projector or second monitor, and keep scoring.',
        body: `
<h4 id="fpw-what">What it is</h4>
<p>It is Manage Tournament with everything else taken away. There is no left-hand menu and no top bar. The window has a header with your logo (if you added one), the tournament name, the event name and the bracket name with its status (&ldquo;In progress&rdquo; or &ldquo;Champion: &hellip;&rdquo;), your sponsor logos, the save status (such as <b>Saved</b>) and a <b>Print</b> button. The round robin window shows &ldquo;Round robin&rdquo; and the number of charts instead. Under that is the chart.</p>
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
<li><b>Round robin &rarr; Knockout</b>: three buttons, <b>Round robin &#8599;</b>, <b>Winners bracket &#8599;</b> and, if the event has a Plate pool and its bracket exists, <b>Plate pool &#8599;</b>.</li>
</ul>
<p>Group Boards events do not have this window. Use the Boards card instead, and the Boards tab with its TV view on the public page.</p>
<p>The window opens as a new browser tab or window. Drag it onto the other screen if you need to. For a truly full screen, press <b>F11</b> in most browsers. That is a browser feature, not part of DartDraw.</p>

<h4 id="fpw-popups">If nothing happens</h4>
<p>DartDraw opens the window through your browser, and browsers can block that. When it is blocked, DartDraw says &ldquo;Your browser blocked the new window &mdash; allow pop-ups for this site, then click the button again.&rdquo; Look for a &ldquo;pop-up blocked&rdquo; icon in the address bar, choose to allow pop-ups for this site, then click the button again. Some browsers block it without telling DartDraw; if nothing opens and no message appears, do the same.</p>

<h4 id="fpw-scores">Entering scores there</h4>
<p>Click a score box or a match exactly as you would in the main window. In a bracket window, <b>Mark no-show&hellip;</b> works too. Be careful before you score there: read <a href="#fpw-sync">Keeping the windows in step</a> first. A few things only exist in the main window: <b>Start all games</b> (the round robin boxes are locked until you press it there), <b>Mark no-show&hellip;</b> and <b>Adjust positions&hellip;</b> for round robin groups, publishing and finalizing.</p>

<h4 id="fpw-sync">Keeping the windows in step</h4>
<p>This matters, so read it once.</p>
<ul>
<li>Each window loads your saved event when it opens, and saves what you do in it to your account.</li>
<li><b>The windows do not update each other while you look at them.</b> A score you enter in one does not appear in the other straight away.</li>
<li>When you switch to a window (click into it, or bring it back on screen), it checks for a newer copy of the event. If there is one, it loads it, stays on the same step and shows &ldquo;Updated with the latest scores&rdquo;. It skips this while a change of yours is still being saved, while a box is open, while you are typing in a box or have typed something not yet saved, and on steps 1 to 3, so check the scores before you enter the next one. Windows in the same browser tell each other when they save, so the window you switch to picks up the other one's score straight away. Otherwise (for example a change made on another device) it checks at most every few seconds.</li>
<li>If you score in a window that is out of date, that score is <b>not saved</b>. DartDraw refuses it so it cannot write over the newer results, and the red banner &ldquo;Updated elsewhere &mdash; reload to get the latest&rdquo; appears in that window (the full-page window too). Until you reload, that window saves nothing.</li>
<li>When you see the banner, click <b>Reload</b> <b>before you enter anything else</b>. Then check the scores and enter your last one again.</li>
<li>So run <b>one window per event at a time</b> for entering scores, and use the other only to look at. Keep the full-page window on <b>one device</b> only. Do not open the same event on a second device or in a second tab and score there as well.</li>
<li>If you are not sure a window is up to date, press <b>F5</b> in it before you score. In the main window you can also click the event in <b>Saved tournaments</b>.</li>
<li>The full-page window shows its save status in the header. After you enter a score there, check that it says <b>Saved</b>. If it says &ldquo;Couldn&rsquo;t save &mdash; click to retry&rdquo;, check your connection and click it.</li>
</ul>
<p>The simplest habit: score in one window, and use the other for showing.</p>

<h4 id="fpw-print">Printing</h4>
<p>The <b>Print</b> button in the full-page window prints just what that window shows: the bracket sheet, or the round robin group charts, the same sheets as in the full pack, with the same paper check (see <a href="#bracket-sheets">Knockout bracket sheets and paper size</a>). In a Teams event the bracket window also has a <b>Lineup sheets</b> button for the knockout lineup sheets that are ready and the empty sheet. For the whole pack (rules sheet, running order and every chart), print from the main window, on step 4 (<b>Print bracket pack</b>) or step 7 (<b>Print final chart &mdash; Save high-res A4 PDF</b>).</p>

<h4 id="fpw-empty">When it says something is missing</h4>
<ul>
<li>&ldquo;No bracket yet &mdash; generate one in Confirm &amp; Print Bracket, then reopen this window.&rdquo; Generate the bracket in the main window, then open the window again or reload it.</li>
<li>&ldquo;No confirmed charts yet &mdash; confirm at least one group in Confirm &amp; Print Bracket, then reopen this window.&rdquo; The round robin window needs at least one confirmed group.</li>
<li>&ldquo;No tournament open.&rdquo; There is no event to show. Close the window and open it again from Manage Tournament.</li>
</ul>

<h4 id="fpw-finalized">Finalized events</h4>
<p>A finalized event opens view-only. Score boxes and matches do nothing. If a window that did not know the event was finalized tries to save a change, a notice appears at the top: &ldquo;This event is finalized. Your change was not saved; only an Admin can change it.&rdquo;</p>
`
      },
      {
        id: 'publishing-results',
        title: 'Sharing live results',
        summary: 'Publish results, list the event on the public home page, and know what spectators see.',
        body: `
<h4 id="publish">Publishing</h4>
<p>At the bottom of step 5 is the <b>Public results</b> card.</p>
<ol>
<li>Tick <b>Publish results</b>.</li>
<li>A link appears. Click <b>Copy link</b> to share it, <b>Open &#8599;</b> to look at it, or <b>All events &#8599;</b> for the public home page.</li>
<li>Untick <b>Publish results</b> any time to take the page offline.</li>
</ol>
<p>You can also publish from step 4: while publishing is off, a note above the print button has a <b>Publish results now</b> button, so the QR codes print on the blank pack. It does the same as ticking the box here.</p>
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
      },
      {
        id: 'finishing-the-event',
        title: 'Finishing the event',
        summary: 'Review the final standings, print the final chart, then accept the results.',
        claims: ['finalized-sidebar'],
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
<p>If something goes wrong, a box says <b>Not finalized</b> and tells you why, for example that the last save did not go through or that the event was changed elsewhere. Fix that and try again.</p>

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
`
      },
      {
        id: 'troubleshooting',
        title: 'Printing tips and troubleshooting',
        summary: 'Fixes for the things that go wrong most often: printing, pop-ups, locked scores, expired sign-in and clashing windows.',
        body: `
<h4 id="printing-tips">Printing tips</h4>
<ul>
<li>Printing uses your browser&rsquo;s print window. To make a PDF, pick <b>Save as PDF</b> as the printer.</li>
<li>Sheets are A4 landscape, apart from knockout brackets, which follow the <b>Knockout bracket paper size</b> you chose (or are split over A4 sheets, if you chose that). Set the printer to the same paper size, or the bracket is shrunk again by the printer.</li>
<li>Look at the preview before printing. If the page is cut off, check the paper size and that the scale is on its default setting.</li>
<li>Print the blank pack <em>before</em> you start the games. You can print again at any time.</li>
<li>Publish before you print if you want QR codes on the group charts and bracket sheets: click <b>Publish results now</b> in the note on step 4, or tick <b>Publish results</b> on step 5.</li>
<li>Print the full pack from the main window: <b>Print bracket pack</b> on step 4, <b>Print final chart &mdash; Save high-res A4 PDF</b> on step 7. The <b>Print</b> button in the full-page window prints only the chart that window shows.</li>
</ul>

<h4 id="fixes">Common problems</h4>
<dl class="msgs">
<dt>No QR codes on my printed sheets</dt>
<dd>Publishing was off when you printed. Click <b>Publish results now</b> on step 4 (or tick <b>Publish results</b> on step 5), then print again. If step 4 says the address of the public results site isn&rsquo;t set up yet, ask your admin.</dd>
<dt>I can&rsquo;t find the finalize button</dt>
<dd>It is at the bottom of step 5, <b>Manage Tournament</b>: <b>Accept &amp; finalize</b>. Steps 6 and 7 only review and print; they say where it is, with a <b>Go there</b> link.</dd>
<dt>Nothing opens when I click Open in new window</dt>
<dd>Your browser blocked the pop-up. DartDraw usually says so: &ldquo;Your browser blocked the new window &mdash; allow pop-ups for this site, then click the button again.&rdquo; Allow pop-ups for this site and click again. See <a href="#full-page-window">Full-page window for a second screen</a>.</dd>
<dt>&ldquo;Scores are locked&rdquo;</dt>
<dd>Games have not started. Go to Manage Tournament and click <b>Start all games</b>.</dd>
<dt>Start all games or Print is greyed out</dt>
<dd>You have no confirmed chart yet. Confirm at least one in Confirm &amp; Print Bracket.</dd>
<dt>&ldquo;The knockout can only be drawn once every group is finished&rdquo;</dt>
<dd>Finish every group first. If entries are level on the cut-off line, settle them with <b>Adjust positions&hellip;</b>.</dd>
<dt>I typed a score on the wrong match</dt>
<dd>Click the match and choose <b>Clear result</b>, then put the score where it belongs. See <a href="#correct-a-result">Correcting or clearing a result</a>.</dd>
<dt>Withdraw has gone, and Mark no-show&hellip; is there instead</dt>
<dd>The entry&rsquo;s group has started, or the knockout has been drawn. Withdrawing now would remove results already in, so use <b>Mark no-show instead</b>. See <a href="#player-leaves">A player leaves part-way</a>.</dd>
<dt>&ldquo;Resolve ties before continuing&rdquo;</dt>
<dd>Two or more entries are level after every tie-break rule. Decide the order (a playoff or your decision) and set it with <b>Adjust positions&hellip;</b>.</dd>
<dt>I was sent back to the sign-in box</dt>
<dd>Your session ended. Sessions do not last for ever, and they also end if your password was changed or your account was suspended. Sign in again. If a change had not been saved yet, DartDraw keeps it in this browser and, after you sign in again, asks whether to restore it. It can only be restored if the event has not changed in the meantime; otherwise it says so, and you enter the change again.</dd>
<dt>&ldquo;Updated elsewhere &mdash; click to reload&rdquo;</dt>
<dd>The same event was changed on another device, tab or window. The red banner at the top says &ldquo;Updated elsewhere &mdash; reload to get the latest&rdquo;. Your last change in this window was not saved, and this window saves nothing more for the event until you reload, so it cannot write over the newer results. Click <b>Reload</b> before you enter anything else, then enter your last change again. To avoid it, work on each event in one window at a time.</dd>
<dt>&ldquo;Couldn&rsquo;t save &mdash; click to retry&rdquo;</dt>
<dd>Check your internet connection and click the message. Do not close the page until it says <b>Saved</b>.</dd>
<dt>The page looks out of date</dt>
<dd>Press <b>F5</b> to reload. The saved copy is always the truth.</dd>
<dt>The left-hand menu is missing</dt>
<dd>You are on a phone, or the window is narrower than about 700 pixels, so the menu is replaced by a bar at the top. Tap the step name in that bar to choose a step or another event. For more room, use a laptop, desktop or tablet, or widen the window.</dd>
<dt>&ldquo;Please rotate your device to landscape to use DartDraw.&rdquo;</dt>
<dd>On a tablet or phone, DartDraw only works held sideways. Turn the device; the message goes by itself and nothing you did is lost.</dd>
</dl>
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
        body: `<p>Yes. Each event is separate. Click <b>+ New tournament</b> for the second one, or open it from <b>Saved tournaments</b>. Open the app in a second browser tab if you want to look at both together. Just do not open the <em>same</em> event in two places and score in both. A score entered in a window that is out of date is not saved. If you see &ldquo;Updated elsewhere&rdquo;, click <b>Reload</b> before you enter anything else, then enter your last change again.</p>`
      },
      {
        id: 'faq-offline',
        title: 'Can I use DartDraw offline?',
        body: `<p>No. Your events are saved to your account on the internet, so you need a connection to sign in and to save. If the connection drops, DartDraw shows <b>Couldn&rsquo;t save &mdash; click to retry</b>. Keep the page open, get back online and click the message, and wait for <b>Saved</b> before you open another event (DartDraw keeps you on the event until then). It is a good idea to print the blank pack before play in case the venue wifi is poor.</p>`
      },
      {
        id: 'faq-how-many-entries',
        title: 'How many entries can I have?',
        body: `<p>There is no fixed limit for a round robin. A knockout bracket holds up to 128 slots. For big fields, use Group Boards, which allows up to 128 groups of 2 to 128 players each. If you see a message that your account allows up to a certain number of entries per event, contact your admin.</p>`
      },
      {
        id: 'faq-change-after-finalized',
        title: 'How do I change a score after the event is finalized?',
        body: `<p>You cannot. Only an Admin can reopen a finalized event, so ask your admin. Once it is reopened, reload the event, fix the score and accept the results again. Before you finalize, you can correct any score by clicking it and saving a new result. See <a href="#finishing-the-event">Finishing the event</a> and <a href="#correct-a-result">Correcting or clearing a result</a>.</p>`
      },
      {
        id: 'faq-correct-result',
        title: 'How do I correct or clear a result?',
        claims: ['ko-cascade', 'clear-result'],
        body: `<p>Click the match. To correct it, type the right legs and click <b>Save score</b>. To empty it, click <b>Clear result</b>, then <b>Clear result</b> again in the box that asks &ldquo;Clear this result?&rdquo;. The match goes back to not played. In a knockout, a new winner (or a cleared match) also clears every later match the old winner had reached, and the champion. When any of those already has a result, DartDraw lists them first and you choose <b>Change result</b> or <b>Cancel</b>. A new score with the same winner changes nothing later. Once the knockout has been drawn from a round robin, group results can be corrected but not cleared. See <a href="#correct-a-result">Correcting or clearing a result</a>.</p>`
      },
      {
        id: 'faq-pair-names',
        title: 'Can spectators see the names of players in a pair?',
        body: `<p>They see the <b>pair name</b> you type, and the organisation if you gave one. There are no separate boxes for the two players, so if you want both names to show, put both in the pair name, such as both surnames together. A team is shown by its team name in the same way.</p>`
      },
      {
        id: 'faq-not-on-home-page',
        title: 'Why is my event not on the public home page?',
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
        body: `
<p>Entries are ranked by points first. A win is 2 points, a draw 1 and a loss 0. Results are entered as finished matches, so there is always a winner, except in a Teams round robin without a tie-breaker, where a level total is a draw.</p>
<p>When entries have the same points, DartDraw uses your <b>Tie-break order</b>. The default is:</p>
<ol>
<li><b>Head-to-head result</b>: whoever won the match between them goes ahead.</li>
<li><b>Leg difference</b>: legs won minus legs lost over the whole group.</li>
<li><b>Legs won</b>: the most legs won over the whole group.</li>
<li><b>Organiser decision / playoff</b>: nothing automatic. It is down to you.</li>
</ol>
<p>With three or more entries level, head-to-head, leg difference and legs won use only the matches those entries played against each other. If a rule separates some of them, the entries still level are sorted again by the rules, in order.</p>
<p>If every rule leaves two entries level, a <b>?</b> badge appears and a warning says they need an organiser decision or a playoff. Settle it, then set the order with <b>Adjust positions&hellip;</b>. Steps 6 and 7, and drawing the knockout when the tie is on the cut-off line, stay locked until you do. In Advanced setup you can reorder the rules under Rules on step 2.</p>`
      },
      {
        id: 'faq-legs',
        title: 'What does &ldquo;best of 5&rdquo; mean when I enter a score?',
        body: `<p>The first to win most of the legs wins the match. In a best of 5 that is 3 legs. The score box accepts only finished results: the winner must have exactly 3, and the loser 0, 1 or 2. In a best of 3 the winner needs 2, and so on.</p>`
      },
      {
        id: 'faq-team-result',
        title: 'How do I enter the result of a team match?',
        body: `<p>As one result: the total legs each team won across all the segments, including the tie-breaker if it was played. A team cannot have more than the most it could win (9 with the default segments, 10 where the tie-breaker is used). Where the tie-breaker is used, the totals can&rsquo;t be level. Without it, level totals are a draw in a round robin, and are refused in a knockout. See <a href="#teams-results">Entering a team result</a>.</p>`
      },
      {
        id: 'faq-byes',
        title: 'How are byes decided in a knockout?',
        body: `<p>The bracket size is the next one up from your entries (4, 8, 16, 32, 64 or 128). The empty places are byes in round 1. They go to the best seeds. With seeding off, the draw is random. Entries from the same organisation are kept apart as long as possible whenever an organisation is filled in. After a round robin, entries from the same group come first, then the same organisation. Each draw takes about a second at most, so a big bracket with many entries from one organisation is spread as well as DartDraw manages in that time, which can be slightly less even than possible. A bracket holds at most 128 entries: DartDraw refuses a bigger one and says which setting to change.</p>`
      },
      {
        id: 'faq-basic-advanced',
        title: 'What is the difference between Basic and Advanced setup?',
        body: `<p>Basic setup shows only the essentials. Advanced setup adds scheduling (level of play, start time, breaks), different best-of-legs for later knockout rounds, the Plate pool, sponsor logos with a footer line, and your own tie-break order. You can switch whenever you like and nothing you set is lost. See <a href="#setup-mode">Basic or Advanced setup</a>.</p>`
      },
      {
        id: 'faq-plate',
        title: 'What is a Plate pool?',
        body: `<p>In Round robin &rarr; Knockout, entries that do not advance can play their own knockout, called the Plate pool, so they still get matches. Turn it on in Advanced setup on step 2. You can limit how many enter with <b>Plate entries per group</b>. See <a href="#rr-ko-setup">Round robin &rarr; Knockout</a>.</p>`
      },
      {
        id: 'faq-group-boards',
        title: 'What is Group Boards, and do I have to use it?',
        body: `<p>No, it is optional. It is a kind of Knockout: choose <b>Knockout</b>, then <b>Group Boards, then finals</b>. It splits a big field into small knockout groups. Each group has its own board and ends with a champion, and the champions play a Finals bracket. It suits large events. For a normal-sized field, a round robin or a knockout is usually simpler. See <a href="#group-boards">Group Boards</a>.</p>`
      },
      {
        id: 'faq-change-format',
        title: 'Can I change the format after I have started?',
        body: `<p>Change the format before you start the games. Go back to step 2, make the change and save. Round robin groups adjust to fit. Group Boards cannot be redrawn once scores are in. Once scores are entered it is safest to leave the format alone.</p>`
      },
      {
        id: 'faq-entries-locked',
        title: 'Why can’t I change the entries, swap or redraw after the games start?',
        claims: ['roster-lock'],
        body: `<p>Because results already played belong to the entries who played them. Once a group has started (after <b>Start all games</b>), has a result, or the knockout has been drawn, DartDraw refuses anything that would move or remove those entries, and says why: <b>Withdraw</b>, <b>Swap with&hellip;</b> and <b>Random draw</b> on step 3, and lowering <b>Number of entries</b> on step 1 when that would remove someone who is playing. Before the games start all of these work as usual. To take someone out once play has begun, use <b>Mark no-show&hellip;</b>. See <a href="#player-leaves">A player leaves part-way</a>.</p>`
      },
      {
        id: 'faq-move-player',
        title: 'Can I move a player to another group?',
        body: `<p>Yes, on step 3. In a round robin use <b>Swap with&hellip;</b>. In Group Boards use <b>Move&hellip;</b> before you confirm the groups. A confirmed group whose entries change is un-confirmed for you. Do this before games start: once a group has started, DartDraw refuses to swap or move its entries. See <a href="#faq-entries-locked">Why can&rsquo;t I change the entries after the games start?</a></p>`
      },
      {
        id: 'faq-no-show',
        title: 'Someone did not turn up. What do I do?',
        body: `<p>Once play has started, use <b>Mark no-show&hellip;</b>. In a round robin it fills their unplayed matches with walkover losses. In a knockout it gives the opponent a walkover win. If both are missing in a knockout or Group Boards match, choose <b>Neither showed</b> (a round robin does not have that choice). Before their group starts, in a round robin you can <b>Withdraw</b> them; once it has started, Withdraw is refused and offers <b>Mark no-show instead</b>. See <a href="#no-shows">No-shows and walkovers</a> and <a href="#player-leaves">A player leaves part-way</a>.</p>`
      },
      {
        id: 'faq-admin',
        title: 'Who is the Admin, and how do I reach them?',
        body: `<p>The Admin is the person who runs your DartDraw site. They create organiser accounts, can send a password reset link, and are the only person who can reopen a finalized event. Contact them the way you normally would. DartDraw has no built-in way to message them.</p>`
      },
      {
        id: 'faq-forgot-password',
        title: 'I forgot my password',
        body: `<p>Ask your admin for a reset link. You can also click <b>Forgot password?</b> on the sign-in form and type your email; if a link arrives, follow it, and if nothing arrives, ask your admin. Using a reset link signs you out on every device.</p>`
      },
      {
        id: 'faq-paper-size',
        title: 'Can I print on A3 or bigger?',
        body: `<p>Knockout brackets can be printed on A4, A3, A2 or A1. Pick the <b>Knockout bracket paper size</b> on the print screen; the fit check under it shows how big the names print on each size. If a bracket is too big for the size you chose, DartDraw asks whether to use the size it recommends, split the bracket over A4 sheets, or keep your size and shrink it. Round robin charts and other sheets are A4 landscape. See <a href="#bracket-sheets">Knockout bracket sheets and paper size</a>.</p>`
      },
      {
        id: 'faq-update-speed',
        title: 'How quickly do spectators see new scores?',
        body: `<p>Their page refreshes itself about every 20 seconds, and picks up scores shortly after you save them. The home page list can take about half a minute to catch up.</p>`
      },
      {
        id: 'faq-duplicate',
        title: 'Can I reuse an event for next time?',
        body: `<p>Yes. Click <b>Duplicate</b> under the event in <b>Saved tournaments</b>. You get a copy with &ldquo;(copy)&rdquo; added to the name. It is open for editing, not published and not listed. The copy keeps the entries, settings and any scores, so change what you need.</p>`
      },
      {
        id: 'faq-incident-log',
        title: 'Is the incident log public?',
        body: `<p>No. It is only for you. It is never printed and never appears on the public results page.</p>`
      },
      {
        id: 'faq-two-devices',
        title: 'Can I use the same account on two devices?',
        body: `<p>Yes. Sign in on both. Your events are the same on each. Just score each event on one device at a time. A score entered on a device that is out of date is not saved. If you see &ldquo;Updated elsewhere &mdash; click to reload&rdquo;, click <b>Reload</b> on the red banner before you enter anything else, then check your latest scores and enter your last change again.</p>`
      },
      {
        id: 'faq-unconfirmed',
        title: 'Why did a chart say &ldquo;Un-confirmed automatically&rdquo;?',
        body: `<p>You changed who is in that group after confirming it, for example by swapping or withdrawing an entry. DartDraw un-confirms it so you check it again. Click <b>Confirm this chart</b> once it is right.</p>`
      },
      {
        id: 'faq-window-sync',
        title: 'Does the full-page window update by itself?',
        body: `<p>Not while you are looking at it. Each window loads the saved event when it opens. When you switch to a window, it checks for a newer copy and loads it, with the note &ldquo;Updated with the latest scores&rdquo; (not on steps 1 to 3, not while one of your changes is still saving or a box is open, and not while you have typed something not yet saved). Windows in the same browser tell each other when they save, so this works straight away; for a change made on another device it checks at most every few seconds. An out-of-date window cannot write over newer scores: its save is refused and it shows &ldquo;Updated elsewhere &mdash; reload to get the latest&rdquo;, but the score you entered there is not saved. Press <b>F5</b> to bring a window up to date, and score in one window at a time. See <a href="#fpw-sync">Keeping the windows in step</a>.</p>`
      },
      {
        id: 'faq-phone',
        title: 'Can I use my phone?',
        body: `<p>Yes, held sideways (landscape), but DartDraw works best on a tablet, laptop or desktop. Held upright, a phone or tablet shows &ldquo;Please rotate your device to landscape to use DartDraw.&rdquo; Turn it and the app is back as you left it. On a phone on its side, a slim note says DartDraw works best on a bigger screen (tap &times; to hide it), and the left-hand menu becomes a bar at the top: tap the step name to change step, open another event, rename, duplicate or delete this one, or change your password. Setting up an event is easier on a bigger screen; a phone is fine for checking and entering scores.</p>`
      },
      {
        id: 'faq-delete',
        title: 'Can I delete or rename an event?',
        body: `<p>Yes, with <b>Rename</b> and <b>Delete</b> under the event in <b>Saved tournaments</b>. Deleting removes it from your account for good. You cannot rename or delete a finalized event. Ask your admin.</p>`
      }
    ]
  }
];

module.exports = {
  VIEWER_URL,
  VIEWER_HELP_URL,
  title: 'Help for organisers',
  lede: 'Short, step-by-step guides for running an event in DartDraw, and quick answers to the questions organisers ask most.',
  sections
};

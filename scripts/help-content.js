// The words on the public Help page (/help): the organiser guide and the FAQ.
// This file is DATA only. scripts/build-landing.js turns it into help.html (npm run build-landing).
//
// How to edit
//   - A section has an id, a title, a kind ('guide' or 'faq') and a list of items.
//   - Every item has an id (used as the #anchor, so keep it short, lower case, with dashes and never change one that
//     is already linked), a title (the heading, or the question) and a body (HTML).
//   - Guide items may also have a summary: one sentence shown under the heading.
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
        id: 'getting-started',
        title: 'Getting started',
        summary: 'Sign in, learn the seven steps, choose Basic or Advanced setup, and know what the save messages mean.',
        body: `
<h4 id="signing-in">Signing in</h4>
<p>Your site admin creates your account and sends you a link to choose a password. After that:</p>
<ol>
<li>Click <b>Log in</b> at the top of any public page.</li>
<li>Type your email and password, then click <b>Sign in</b>.</li>
<li>You land in the organiser app, where all your events live.</li>
</ol>
<p>Forgot your password? The surest way is to ask your admin for a reset link. You can also click <b>Forgot password?</b> under the sign-in form and type your email. If a link arrives, follow it. If nothing arrives, ask your admin.</p>
<p>To change your password while you are signed in, click <b>Change password</b> next to <b>Log out</b> in the left-hand menu (on a phone or a narrow window, tap the step name in the bar at the top, then <b>Change password</b>). Type your <b>Current password</b>, then your <b>New password</b> twice. It must be at least 8 characters. Changing it signs you out on your other devices, but not on the one you are using.</p>
<p class="callout"><b>Screen size.</b> The organiser app is made for a laptop, desktop or tablet. On a tablet or phone, hold it sideways (landscape). Held upright, DartDraw covers the screen with &ldquo;Please rotate your device to landscape to use DartDraw.&rdquo; Turn the device and your work is still there. A phone on its side works too, with a note that DartDraw works best on a tablet, laptop or desktop: the left-hand menu becomes a bar at the top. Tap the step name there for the steps, your events, <b>Rename</b>, <b>Duplicate</b> and <b>Delete</b> for the open event, and <b>Change password</b>. See <a href="#faq-phone">Can I use my phone?</a></p>

<h4 id="seven-steps">The seven steps</h4>
<p>The left-hand menu lists seven steps. Work down the list. You cannot skip ahead: step 2 opens once step 1 is saved, and step 3 opens once step 2 is saved.</p>
<ol>
<li><b>Event creation</b>: name the event and say how many entries play.</li>
<li><b>Format &amp; branding</b>: choose the format, legs, boards, logos and rules.</li>
<li><b>Chart details</b>: names, seeds, organisations and the draw.</li>
<li><b>Confirm &amp; Print Bracket</b>: check each chart, confirm it and print the blank pack.</li>
<li><b>Manage Tournament</b>: start the games, enter scores, share live results and finish the event.</li>
<li><b>Finalize Standings</b>: a read-only look at the final standings.</li>
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
        summary: 'Name it, choose Singles or Doubles, set the date and the number of entries.',
        body: `
<p>Click <b>+ New tournament</b> at the top of the left-hand menu. Step 1 is called <b>Event creation</b>. Fill in:</p>
<ol>
<li><b>Setup mode</b>: &ldquo;Basic&rdquo; or &ldquo;Advanced&rdquo;. See <a href="#setup-mode">Basic or Advanced setup</a>.</li>
<li><b>Tournament name</b>: the day or competition, for example Spring Open 2026. It is printed on every sheet.</li>
<li><b>Event name</b>: this competition inside it, for example Open Singles.</li>
<li><b>Event category</b>: <b>Open</b>, <b>Women</b> or <b>Youth</b>. It is printed on the charts.</li>
<li><b>Competition type</b>: <b>Singles</b> or <b>Doubles</b>.</li>
<li><b>Tournament date</b>: shown on the charts. The public home page also uses it to list upcoming events.</li>
<li><b>Number of entries</b>: at least 2.</li>
</ol>
<p>Click <b>Save event creation &rarr;</b> to move on to step 2.</p>

<h4 id="singles-or-doubles">Singles or Doubles</h4>
<p>In <b>Singles</b>, one entry is one player.</p>
<p>In <b>Doubles</b>, one entry is a <b>pair</b> of two named players. The number of entries is the number of pairs, so 24 players make 12 entries. In step 3 each pair gets a <b>Pair name</b> plus boxes for <b>Player 1</b> and <b>Player 2</b>. Charts, results and the public page show the pair name, so choose something both players recognise, such as both surnames together.</p>

<h4 id="boards-and-entries">Boards and the number of entries</h4>
<p>There is no boards box on step 1. You set the number of boards on step 2, under Scheduling.</p>
<p>You can change the number of entries later: click <b>Edit</b> on the summary card at the top of a step, change the number and save. Raising it adds blank entries such as &ldquo;Entry 9&rdquo;. Lowering it removes entries from the end of the list, so do that before you type names or draw groups.</p>
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
        summary: 'Round robin, knockout, round robin then knockout, or Group Boards, plus legs, boards, branding and rules.',
        body: `
<p>Step 2 is <b>Format &amp; branding</b>. It has four sections: <b>Format</b>, <b>Scheduling</b>, <b>Branding &amp; print</b> and <b>Rules</b>. Click a section heading to open or close it. Click <b>Save format &amp; branding &rarr;</b> when you are done.</p>

<h4 id="format-types">The formats</h4>
<p>Under <b>Competition format</b> pick one:</p>
<ul>
<li><b>Round robin</b>: entries play within their groups. Everyone in a group plays everyone else in it once.</li>
<li><b>Knockout</b>: a direct elimination bracket. Lose and you are out. If the number of entries does not fill the bracket, the app adds byes in round 1 and gives them to the best seeds.</li>
<li><b>Round robin &rarr; Knockout</b>: a group stage first, then the top finishers go into a bracket.</li>
<li><b>Group Boards</b>: small knockout groups, each on its own board, then a Finals bracket for the group winners. It is optional and made for big fields. See below.</li>
</ul>

<h4 id="legs">Best of legs</h4>
<p>The <b>Best of legs</b> box sets how long a match is. Odd numbers are best. Best of 5 means the first to 3 legs wins. When you enter a result, the winner must have exactly that many legs and the loser fewer. An even number shows a warning, because it can end level.</p>

<h4 id="round-robin-setup">Round robin</h4>
<p>Choose <b>Maximum entries per group</b> (3 to 6). A blue box under it shows the split DartDraw recommends, for example how many groups and how many matches each group plays. DartDraw balances the groups when it draws them.</p>

<h4 id="rr-ko-setup">Round robin &rarr; Knockout</h4>
<ul>
<li><b>Entries per group (advance to knockout)</b>: how many from each group go into the bracket.</li>
<li><b>How entries are placed into the bracket</b>: <b>Seeded by group standing (recommended)</b> puts group winners ahead of runners-up and keeps entries from the same group apart for as long as possible. <b>Random draw</b> mixes them up.</li>
<li><b>Plate pool</b> (Advanced setup): tick <b>Also run a Plate pool knockout bracket for entries that don&rsquo;t advance</b>. Leave <b>Plate entries per group</b> empty to send everyone who does not advance to the Plate pool. Type a number to cap it, so anyone ranked below that is out.</li>
</ul>
<p>The bracket is not drawn until every group has finished. You draw it in step 5. See <a href="#managing-the-tournament">Managing the tournament</a>.</p>

<h4 id="group-boards">Group Boards (optional)</h4>
<p>Group Boards suits big fields. Instead of a few big groups you choose a number of small groups, and each group is a little knockout on its own board. Every group ends with a champion, and the champions meet in a <b>Finals</b> bracket. You do not have to use it.</p>
<ul>
<li><b>Number of groups</b>: at least 2, at most 128, and each group needs at least 2 players. DartDraw tells you if the numbers do not fit.</li>
<li><b>Best of legs inside each group</b> can differ from the Finals. The Finals uses <b>Best of legs</b> (or your knockout leg settings in Advanced setup).</li>
<li>In step 3 you click <b>Draw groups</b>. Seeded players are spread one per group, and the groups can be changed by hand until you confirm them.</li>
<li>The Finals chart is built as soon as the last group is confirmed, with slots such as &ldquo;Winner of Group 3&rdquo;.</li>
</ul>

<h4 id="knockout-legs">More legs in later rounds</h4>
<p>In Advanced setup a knockout has a tick box that raises the legs in later rounds. Tick it and you can set <b>Early rounds</b>, <b>Quarterfinal</b>, <b>Semifinal</b> and <b>Final</b> separately. Every round before the quarterfinal uses <b>Early rounds</b>. The Plate pool has its own, independent settings.</p>

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
        id: 'entries-and-check-in',
        title: 'Entries, seeds, check-in and no-shows',
        summary: 'Naming entries, organisations, seeding, check-in, withdrawals, walkovers and matches nobody played.',
        body: `
<h4 id="naming-entries">Naming entries</h4>
<p>Entries start with placeholder names such as &ldquo;Entry 1&rdquo;. Once groups are drawn, entries without a name of your own are labelled by position, for example &ldquo;Player A1&rdquo; or &ldquo;Pair A1&rdquo;. Type a name in the box and it stays.</p>
<p>In Doubles, each entry also has <b>Player 1</b> and <b>Player 2</b> boxes. Fill in both, and put what you want people to see on charts and the public page in the pair name.</p>

<h4 id="organisations">Organisations</h4>
<p>Use the <b>Organisation (optional)</b> box for a club or organisation name. Then tick the box that keeps them apart:</p>
<ul>
<li><b>Round robin:</b> the <b>Organisation (optional)</b> box is always there on step 3. Tick <b>Avoid same-organisation clashes</b>. It also reshuffles existing clashes where it can. In Advanced setup the same option is under Rules on step 2.</li>
<li><b>Knockout and Group Boards:</b> the <b>Organisation (optional)</b> box is hidden at first. It appears once you tick <b>Track organisation (avoid same-organisation matchups in the first round)</b> on step 3.</li>
</ul>
<p>It is a best effort. If there is no safe swap anywhere, a clash is left in place.</p>

<h4 id="seeds">Seeds</h4>
<p>In a <b>Knockout</b>, step 3 shows <b>Participants &amp; Seeding</b>. Seeding is off by default, which means a fresh random draw every time you generate the bracket. Tick <b>Seed this bracket</b>, then use the up and down arrows to put entries in order. <b>Number of seeds</b> (4, 8, 16, 32 or 64) sets how many of the top entries show a seed number on the printed chart. Everyone is still placed using your order. Seeds 1 and 2 can only meet in the final, and the best seeds get any byes.</p>
<p>In <b>Round robin &rarr; Knockout</b>, seeds come from the group results. Entries show labels like &ldquo;A1&rdquo; (group A, first place). In <b>Group Boards</b>, the same seed list is used and seeds are spread one per group.</p>

<h4 id="check-in">Check-in</h4>
<p>On step 4 there is a <b>Check-in</b> card. Tick each entry as they arrive, or click <b>Check in all</b>. Use the search box, or tick <b>Only show who hasn&rsquo;t checked in yet</b>.</p>
<p>Check-in is just a record for you. It never stops you confirming, printing or starting. You get a yellow warning &ldquo;Not everyone is checked in&rdquo; when you start games, generate a bracket or confirm Group Boards groups, and you can carry on. In Group Boards, tick people in on step 4. Then, on step 3, before you click <b>Draw groups</b>, a <b>Withdraw the N not checked in</b> button (N is a number) removes everyone who is not ticked. It only appears once at least one person is ticked, and only before the draw.</p>

<h4 id="withdrawals">Withdrawals</h4>
<p>In a round robin, click <b>Withdraw</b> next to the entry on step 3. Before the draw it simply removes them. After the draw you can type a replacement name to fill the slot, or leave it blank for a bye. A group whose entries changed is un-confirmed so you can check it again.</p>
<p>The Knockout list on step 3 has no Withdraw button. If someone is not coming, use <b>Mark no-show&hellip;</b> on their match once the bracket is drawn.</p>

<h4 id="no-shows">No-shows and walkovers</h4>
<p>In a <b>round robin</b>, once the games have started, click <b>Mark no-show&hellip;</b> on the group&rsquo;s chart and choose the entry. Every match they have not yet played in that group is filled in as a walkover loss (a win by the majority of legs to nil) and tagged <b>WO</b>. Real results you already entered are never overwritten. The same box has an <b>undo</b> link. Entering a real score over a WO box replaces it.</p>
<p>In a <b>knockout</b> or <b>Group Boards</b> match, click <b>Mark no-show&hellip;</b> under the match and choose who did not show. The other side wins by a walkover and goes through, tagged <b>WO</b>.</p>

<h4 id="neither-showed">Neither showed</h4>
<p>This is for knockout and Group Boards matches only; a round robin has no such choice. If neither side turns up, choose <b>Neither showed</b> in the same box. Nobody advances and the next opponent gets a bye. If the match is a group&rsquo;s final in Group Boards, that group finishes with no winner and its Finals slot reads &ldquo;Group N: no winner&rdquo;, which becomes a bye. To undo it, open the match and click <b>Reverse it</b>, or just enter a score. On the public page the match reads &ldquo;Neither attended&rdquo;, or NO-SHOW in the bracket Chart view.</p>

<h4 id="adjust-positions">Adjusting positions</h4>
<p>If a round robin tie needs your decision, click <b>Adjust positions&hellip;</b> on the group in Manage Tournament, type the position you want for each entry and click <b>Save</b>. Manual positions get an asterisk (*) on the chart. <b>Reset all</b> brings back the automatic order.</p>
`
      },
      {
        id: 'draws-and-printing',
        title: 'Groups, draws and printing (steps 3 and 4)',
        summary: 'Draw and confirm the groups, then print the blank pack: charts, rules sheet, logos and QR codes.',
        body: `
<h4 id="draw">Drawing the groups</h4>
<p>In a round robin, step 3 is called <b>Draw &amp; groups</b>. Entries stay as &ldquo;Not drawn&rdquo; until you click <b>Random draw</b>. Click it again to deal everyone out afresh; DartDraw asks first because it discards your manual swaps.</p>
<ul>
<li>Switch between <b>Flat list</b> and <b>Grouped view</b>. The flat list has a search box for name or organisation.</li>
<li><b>Swap with&hellip;</b> opens a list of groups and positions. Pick one. If it is occupied the two entries swap. If it is blank the entry moves there.</li>
<li>Each group has a board. In the Grouped view you tick <b>Board(s)</b>. Groups on the same board play one after another. Tick more than one board to share a group&rsquo;s matches across them.</li>
</ul>
<p>The first match on every chart is 1 v 2. Each chart also lists the match order and suggests a marker for every match, chosen from the other entries in the group.</p>

<h4 id="confirm">Confirming</h4>
<p>Step 4 is <b>Confirm &amp; Print Bracket</b>. Check each group, then click <b>Confirm this chart</b>, or <b>Confirm all N charts</b>. The confirm box warns you about problems such as a missing entry or two identical names. If you later change who is in a confirmed group, it is un-confirmed for you with the note &ldquo;Un-confirmed automatically&rdquo;. Confirm it again.</p>
<p>For a Knockout, step 4 has <b>Generate bracket</b> (or <b>Regenerate bracket</b>). Regenerating after results exist wipes them, and asks first.</p>

<h4 id="print-pack">Printing the blank pack</h4>
<p>Click <b>Print bracket pack</b>. The pack is A4 landscape and can include:</p>
<ul>
<li>the rules &amp; format sheet as the first page (tick box on the same screen);</li>
<li>a master running order, board by board;</li>
<li>one chart for each confirmed group;</li>
<li>the knockout bracket, or a projected bracket with labels like A1 before the groups are played;</li>
<li>in Group Boards, a <b>Players A&ndash;Z</b> sheet, a <b>Boards</b> sheet, one sheet for each group and the Finals.</li>
</ul>
<p>Knockout brackets have a <b>Knockout bracket paper size</b> (A4, A3, A2 or A1). A very large bracket is split over several sheets so the writing stays readable.</p>
<p>Your browser&rsquo;s print window opens. Choose a printer, or choose <b>Save as PDF</b> to make a file. Print the blank pack before you start games; DartDraw suggests it when you start.</p>

<h4 id="logos-and-rules">Logos, sponsors and the rules sheet</h4>
<p>Your tournament logo goes in every sheet header. Sponsor logos (Advanced setup) print in the footer when <b>Include sponsor footer on printed charts</b> is ticked. The rules sheet is written for you from your settings: the format, scoring, how many go through, tie-break order, plus anything you typed in <b>Walkover, conduct &amp; other rules</b>.</p>

<h4 id="qr-codes">QR codes</h4>
<p>Only some sheets carry a QR code, with the live address beside it in the header: the round robin group charts, the knockout and Finals bracket sheets, the Group Boards group sheets, and in Group Boards the <b>Boards</b> and <b>Players A&ndash;Z</b> sheets. The rules sheet and the running order do not have one.</p>
<p>Each code opens that sheet&rsquo;s own page: a group chart opens that group, a bracket sheet opens the bracket, the Boards sheet opens the Boards tab, and Players A&ndash;Z opens the event. The codes are made in your browser, so printing does not need extra internet.</p>
<p>They only appear when <b>Publish results</b> is on <em>and</em> the address of the public site is set up (if the Public results card says it is not, tell your admin). Switch publishing on before you print, or the codes will not be there.</p>
`
      },
      {
        id: 'managing-the-tournament',
        title: 'Managing the tournament (step 5)',
        summary: 'Start the games, enter scores, run the knockout and Group Boards, and keep a private incident log.',
        body: `
<p>Step 5 is <b>Manage Tournament</b>. This is where you spend match day.</p>

<h4 id="start-games">Start all games</h4>
<p>In a round robin or Round robin &rarr; Knockout, scores are locked until you click <b>Start all games</b>. All confirmed charts start together; you cannot start them one by one. Before you start, the score boxes are hatched and clicking one says &ldquo;Scores are locked&rdquo;. A knockout has no start button: click a match when it is played.</p>
<p>The box that opens may say <b>Suggestion: print the pack first</b>. You can choose <b>Go print the pack first</b> or <b>Start without printing</b>. It also names anyone who is not checked in.</p>

<h4 id="enter-scores">Entering scores</h4>
<p><b>Round robin:</b> click the box where two entries meet. Type each side&rsquo;s legs and click <b>Save score</b>. The winner must have exactly the legs needed for your best-of, and the loser fewer. Positions, points and leg totals update at once in the standings under each chart.</p>
<p><b>Knockout:</b> click a match, type the legs and click <b>Save score</b>. There are no draws. The winner moves to the next round. If you change who won a match, later matches that depended on it are cleared.</p>
<p>To correct a score, click it again and save the new result.</p>

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
<p>The <b>Print</b> button in the full-page window prints just what that window shows: the bracket sheet, or the round robin group charts, the same sheets as in the full pack. For the whole pack (rules sheet, running order and every chart), print from the main window, on step 4 (<b>Print bracket pack</b>) or step 7 (<b>Print final chart &mdash; Save high-res A4 PDF</b>).</p>

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
<p>If the card says the address of the public site is not set up yet, tell your admin.</p>

<h4 id="listing">Listing on the home page</h4>
<p>The public results site (DartDraw Live) has a home page that lists events. Yours is only on it if you tick <b>List on the public page</b>, under <b>Publish results</b>. It is off by default. The list shows the event and tournament name, the date, the format, the number of entries and, when finished, the winner. Your private link keeps working either way.</p>
<ul>
<li>Unticking <b>Publish results</b> also removes the listing, and ticking it again does not bring the listing back.</li>
<li>A duplicated event starts unpublished and unlisted.</li>
<li>The home page has three tabs. <b>Live</b> is for events being played, <b>Upcoming</b> for events that have not started, and <b>Results</b> for finalized events.</li>
</ul>

<h4 id="what-spectators-see">What spectators see</h4>
<p>Anyone with the link sees the standings, results and bracket, and can look up a player. Group Boards events also have a <b>Boards</b> tab. They see entry names and organisations. They never see your notes, the incident log, the individual names typed into <b>Player 1</b> and <b>Player 2</b>, check-in details, or your logo and sponsors.</p>
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
        body: `
<h4 id="review">Review and print</h4>
<p>Step 6, <b>Finalize Standings</b>, is a read-only look at the final tables or placings. If you spot a mistake, click <b>Back to manage tournament</b> and correct the score. Step 7, <b>Print Final Chart</b>, prints the pack with every result. Click <b>Print final chart &mdash; Save high-res A4 PDF</b>, and choose <b>Save as PDF</b> in the print window if you want a file.</p>
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
<li>Nothing in the event can be edited, renamed or deleted from the organiser app. Controls are greyed out. That includes the publishing and listing settings.</li>
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
<li>Sheets are A4 landscape, apart from knockout brackets, which follow the <b>Knockout bracket paper size</b> you chose.</li>
<li>Look at the preview before printing. If the page is cut off, check the paper size and that the scale is on its default setting.</li>
<li>Print the blank pack <em>before</em> you start the games. You can print again at any time.</li>
<li>Switch <b>Publish results</b> on before you print if you want QR codes on the group charts and bracket sheets.</li>
<li>Print the full pack from the main window: <b>Print bracket pack</b> on step 4, <b>Print final chart &mdash; Save high-res A4 PDF</b> on step 7. The <b>Print</b> button in the full-page window prints only the chart that window shows.</li>
</ul>

<h4 id="fixes">Common problems</h4>
<dl class="msgs">
<dt>Nothing opens when I click Open in new window</dt>
<dd>Your browser blocked the pop-up. DartDraw usually says so: &ldquo;Your browser blocked the new window &mdash; allow pop-ups for this site, then click the button again.&rdquo; Allow pop-ups for this site and click again. See <a href="#full-page-window">Full-page window for a second screen</a>.</dd>
<dt>&ldquo;Scores are locked&rdquo;</dt>
<dd>Games have not started. Go to Manage Tournament and click <b>Start all games</b>.</dd>
<dt>Start all games or Print is greyed out</dt>
<dd>You have no confirmed chart yet. Confirm at least one in Confirm &amp; Print Bracket.</dd>
<dt>&ldquo;The knockout can only be drawn once every group is finished&rdquo;</dt>
<dd>Finish every group first. If entries are level on the cut-off line, settle them with <b>Adjust positions&hellip;</b>.</dd>
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
<dd>Your screen is narrow or short (a phone on its side, for example), so the menu is replaced by a bar at the top. Tap the step name in that bar to choose a step or another event. For more room, use a laptop, desktop or tablet, or widen the window.</dd>
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
        body: `<p>There is no fixed limit for a round robin. A knockout bracket holds up to 128 slots. For big fields, use Group Boards, which allows up to 128 groups of at least 2 players each. If you see a message that your account allows up to a certain number of entries per event, contact your admin.</p>`
      },
      {
        id: 'faq-change-after-finalized',
        title: 'How do I change a score after the event is finalized?',
        body: `<p>You cannot. Only an Admin can reopen a finalized event, so ask your admin. Once it is reopened, reload the event, fix the score and accept the results again. Before you finalize, you can correct any score by clicking it and saving a new result. See <a href="#finishing-the-event">Finishing the event</a>.</p>`
      },
      {
        id: 'faq-pair-names',
        title: 'Can spectators see the names of players in a pair?',
        body: `<p>They see the <b>pair name</b> you type, and the organisation if you gave one. They do not see what you typed in the <b>Player 1</b> and <b>Player 2</b> boxes. If you want both names to show, put both names in the pair name.</p>`
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
<p>Entries are ranked by points first. A win is 2 points and a loss 0. Results are entered as finished matches, so there is always a winner.</p>
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
        id: 'faq-byes',
        title: 'How are byes decided in a knockout?',
        body: `<p>The bracket size is the next one up from your entries (4, 8, 16, 32, 64 or 128). The empty places are byes in round 1. They go to the best seeds. With seeding off, the draw is random. Entries from the same organisation are kept apart as long as possible when you have turned that option on.</p>`
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
        body: `<p>No, it is optional. Group Boards splits a big field into small knockout groups. Each group has its own board and ends with a champion, and the champions play a Finals bracket. It suits large events. For a normal-sized field, a round robin or a knockout is usually simpler. See <a href="#group-boards">Group Boards</a>.</p>`
      },
      {
        id: 'faq-change-format',
        title: 'Can I change the format after I have started?',
        body: `<p>Change the format before you start the games. Go back to step 2, make the change and save. Round robin groups adjust to fit. Group Boards cannot be redrawn once scores are in. Once scores are entered it is safest to leave the format alone.</p>`
      },
      {
        id: 'faq-move-player',
        title: 'Can I move a player to another group?',
        body: `<p>Yes, on step 3. In a round robin use <b>Swap with&hellip;</b>. In Group Boards use <b>Move&hellip;</b> before you confirm the groups. A confirmed group whose entries change is un-confirmed for you. Do this before games start. Moving players around after scores are in will confuse the results.</p>`
      },
      {
        id: 'faq-no-show',
        title: 'Someone did not turn up. What do I do?',
        body: `<p>Once play has started, use <b>Mark no-show&hellip;</b>. In a round robin it fills their unplayed matches with walkover losses. In a knockout it gives the opponent a walkover win. If both are missing in a knockout or Group Boards match, choose <b>Neither showed</b> (a round robin does not have that choice). Before play, in a round robin you can <b>Withdraw</b> them. See <a href="#no-shows">No-shows and walkovers</a>.</p>`
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
        body: `<p>Knockout brackets can be printed on A4, A3, A2 or A1. Pick the <b>Knockout bracket paper size</b> on the print screen. Round robin charts and other sheets are A4 landscape.</p>`
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

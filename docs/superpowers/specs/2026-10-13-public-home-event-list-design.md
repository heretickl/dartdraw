# Public home page and event list — design

Date: 2026-10-13
Status: draft for review
Builds on: `2026-10-07-board-schedule-design.md` (the viewer's tabs and theme)

## Purpose

The public viewer's address, `dartdraw-viewer.vercel.app`, shows a bare grey message ("No results link") to anyone who opens it without an event link. Every event is reachable only through its private random link, so there is no way to find an event on the day, and nothing that says what the site is.

This turns the bare address into a branded home page with a list of events, in the manner of tv.dartconnect.com: what is live now, what is coming up and what has just finished, with search and a box for an event code.

### Success looks like

- A visitor to the bare address sees the DartDraw brand and, in one screen on a phone, the events that are on right now.
- Only events whose organiser has switched on a new **List on the public page** option appear. Everything else stays reachable only by its private link, exactly as today.
- One search box finds an event by name, or takes a pasted event link or code and offers to open it.
- Live, Upcoming and Results are separate tabs with counts, grouped under their tournament, in cards with an outline and shading, in dark and light themes.
- The list is cheap to serve (cached), reveals only the allow-listed fields below, and cannot expose a private or unpublished event.
- Existing event links, the QR codes already printed, the event pages and the organiser's other screens behave exactly as before.

### Not in this spec

- **An Admin tab, and anything an admin controls** (retention period, removing events from the list). Parked. The retention period and the other limits are named constants in one file, so an admin setting can replace them later.
- Grouping by country, venue or club; a nation filter. Events carry no such field.
- Push alerts, accounts, favourites on the home page.
- Event images or logos, pagination beyond the caps below, analytics, a sitemap.
- Changes to the organiser's draw, scoring, printing or the event page itself, beyond one switch and one link on the Public results card.

## Decisions already made

- **Opt-in per event.** A new switch, off by default. Public results alone never lists an event.
- **No admin yet.** Retention is fixed at 7 days, as constants.
- **No database migration.** The flag lives in the tournament's JSON (`listed`), the list reads the existing `public_tournaments` view through the existing read-only role, and no new grant is needed.
- **Same page, same file.** The home page is the viewer's `index.html` in its no-event state, not a new route, so `vercel.json`, the rewrites and the printed QR links are untouched.
- **Design.** One compact sticky header (logo, one smart search box, three tabs), tournament headings, and one card per event. The mockup is the reference. The logo is the existing DartDraw mark: a gold ring with a "D" and a bold "DartDraw" wordmark, in the organiser's gold `#d9ad45` and navy.

## What a visitor sees

### Home page (the bare address)

- **Header:** logo and "Live", a single button that cycles Auto / Light / Dark (the same stored choice the event page uses), then the search box, then the three tabs. The header is sticky.
- **Search box:** placeholder `Search events or paste a code`.
  - Typing filters the current tab's events by event name, tournament name, format and winner's name, ignoring case.
  - If the text looks like a code (8 to 40 lowercase letters and digits) or contains `/live/` followed by one, a gold **Open event** button appears under the box and goes to `/live/<code>`. A pasted full link keeps its `#…` part, so a deep link from a QR code still works. The list keeps filtering as usual, so a word that merely looks like a code does no harm.
  - With nothing matching: "No events match “…”. Have a link or code? Paste it in the search box."
- **Tabs:** Live, Upcoming, Results, each with a count; a red dot on Live when there are any, pulsing unless reduced motion is requested. The first tab shown is Live if it has events, otherwise Upcoming if it has events, otherwise Results. The tab is kept in the address after `#/` (`#/live`, `#/upcoming`, `#/results`).
- **Tournament headings:** events are grouped under their tournament name with the date on the right, in the order of the list. Events with the same tournament name and the same date share a heading.
- **Cards:** one per event, a link to `/live/<slug>`, holding one **subcard** per stage (one for a round robin or a knockout, two for round robin then knockout and for Group Boards). The card's header has the event name, then the format tag and the entries ("24 players", "12 pairs", "8 teams"), and a chevron; on Upcoming it starts with the calendar tile (month, day, weekday) and shows the start time, if the organiser set one, in bold before the tag. Live cards have a red outline and a red bar down the left edge. Subcards sit side by side from 640px wide and stack on a phone. Each subcard shows the status of its own stage:
  - **Round robin** (**Groups** on Group Boards): "Not started" with the group count; "In progress" with a ring and "10 of 30 matches · 8 groups"; "Complete" with a check mark.
  - **Knockout** (**Finals** on Group Boards): "Waiting for groups" (starts when every group is done); "Draw next" ("Up next" for Finals) with how many entries advance; "Draw made" (not started yet); the current round's name with a ring and "3 of 8 matches played"; "Complete" with a check mark.
  - A ring never reads 100%. On **Results**, the last knockout or Finals subcard shows a trophy and "Winner <name>" with "Complete · 23 of 23 matches". The winner is shown nowhere else on the card, and a round robin never shows one.
  - A server that does not send `stages` gets the older single card (ring and `progress` line, calendar tile, or trophy and winner); `progress` is still sent for that reason.
  - Every card has an outline, a soft gradient and a shadow; it lifts slightly on hover unless reduced motion is requested. Tap targets are at least 72px tall.
- **Footer:** "Results update automatically · Powered by DartDraw".
- **Refresh:** the list reloads every 30 seconds while the page is visible, and when it becomes visible again. A failed reload keeps the last good list and shows "Can't refresh right now. Retrying…" under the header's update line. The update line reads "Updated just now" / "Updated 2 min ago".
- **Empty states:** Live "Nothing is live right now" with a button to Upcoming; Upcoming "No upcoming events listed"; Results "No recent results". Nothing at all (and the first load): the tabs show 0 and the Live empty state, never an error.

### Other pages

- A link that names an event that does not exist or is unpublished still shows the existing "Results not available" message, now with an extra button, **See all events**, to the home page.
- The event page, its tabs, theme and polling are unchanged.

## What the organiser sees

On the **Public results** card (Manage Tournament and Finalize Standings, where it is today), under the existing switch:

- A checkbox **List on the public page**, off by default, with the line: "Shows this event on the DartDraw Live home page: its name, date, format, number of entries and, once finished, the winner. Your private link keeps working either way."
- It is disabled, with "Turn on Public results first.", while Public results is off or the viewer address is not set.
- Turning Public results off also turns **List on the public page** off, so turning it back on later never lists the event again by surprise. A duplicated event is never listed.
- An "All events ↗" link next to the existing link, to the viewer's address, when it is known.

The flag is stored as `listed: true|false` in the tournament data, saved like every other setting. Tournaments saved before this have no `listed` and are unlisted.

## The list service

`GET /api/events` on the viewer project. Read-only, answers GET only, like the event endpoint.

### What it reads

The `public_tournaments` view, rows whose `data->>'listed'` is `'true'`, and only the ones that could appear: updated within the last 8 days, or with an event date from yesterday onwards. At most 300 rows are read. The viewer's database role is unchanged.

### What it returns

```
{ "generatedAt": "<ISO time>",
  "live":     [ item, … ],
  "upcoming": [ item, … ],
  "results":  [ item, … ] }
```

One `item` per event, and nothing else from the event's data:

| Field | Content |
|---|---|
| `slug` | The event's public slug |
| `event` | Event name |
| `tournament` | Tournament name |
| `date` | Event date `YYYY-MM-DD`, or `""` |
| `start` | Start time `HH:MM` if set, else `""` |
| `format` | `roundrobin`, `knockout`, `rrknockout` or `podknockout` |
| `unit` | `Singles`, `Doubles`, `Triples` or `Teams` |
| `entries` | Number of entries that have not withdrawn |
| `updatedAt` | Time of the last save |
| `progress` | Live only: `{ stage, done, total }`, plus `next` between two stages (see below). Still sent for older clients |
| `stages` | Every item: one object per stage of the event (see "Stages" below) |
| `winner` | Results only: the champion's name, or `""` |

Scores, players' names (other than the champion's), clubs, notes, board plans and the tournament's other settings are never returned.

### Classifying an event

- **Started:** any match has a result (a group score, or a bracket match with a winner that is not a bye).
- **Finished:** by format: knockout: the main bracket has a champion or a void final; round-robin then knockout: the main bracket likewise; Group Boards: the Finals likewise; round robin: every confirmed group is complete.
- **Live:** started, not finished, and saved within the last 48 hours. (An abandoned half-played event drops off the list rather than staying live for ever.)
- **Upcoming:** not started, with a date of yesterday or later, or no date and saved within the last 8 days. (Yesterday allows for time zones, since the server compares dates in UTC.) An unstarted event whose date has passed drops off the list.
- **Results:** finished and saved within the last 7 days.
- Anything else is not returned.
- **Order:** live and results by last save, newest first; upcoming by date, then start time, then name. At most 100 per list.

### Progress

For a live event, the matches of the current stage only, so the ring never drops because a later stage is generated. It restarts at 0 when a new stage begins:

- Round robin: stage "Group stage", matches played of all matches in the confirmed groups.
- Knockout: stage is the name of the first round with an unplayed match ("Quarterfinals", "Semifinals", "Final", "Round of 16"), counting that round's real matches, not byes or void ones.
- Round robin then knockout: "Group stage" with group matches until every group is complete, then the knockout as above.
- Group Boards: "Group stage" with the matches of all group brackets until they are all complete, then "Finals" and its round as above.

`done` and `total` are plain counts. The ring shows `done / total`, and never shows a 100% percentage while the event is live.

Between two stages `progress` also carries `next`, one of two fixed strings, and nothing else ever has it: `"Knockout draw next"` for round robin then knockout when every group is complete and the knockout is not generated yet, and `"Finals next"` for Group Boards when every confirmed group is finished and the Finals is not built yet. The counts are the finished stage's (for example 30 of 30). The card then shows a full ring with a check mark instead of a percentage, and the line "<stage> complete · <next>" (for example "Group stage complete · Knockout draw next") in place of the matches-played line.

### Stages

`stages` is a list with one object per stage: `roundrobin` has `[groups]`, `knockout` `[knockout]`, `rrknockout` `[groups, knockout]` and `podknockout` (Group Boards) `[groups, finals]`. Each object has only these keys, and every value is a fixed string or a count, never tournament text:

- `key`: `groups`, `knockout` or `finals`.
- `state`: `groups`: `notstarted`, `live` or `done` (done when every confirmed group is complete). `knockout` and `finals`: `waiting` (the stage before is not complete; a Group Boards Finals skeleton may already exist), `next` (the stage before is complete and there is no bracket or Finals result yet; a plain knockout with no bracket is always `next`, "draw next"), `ready` (a plain knockout or a knockout after groups has been drawn and has no result yet), `live` or `done`.
- `done`, `total`: whole numbers. `groups`: matches played of all matches in the confirmed groups. `knockout` and `finals` while `live`: the current round's real matches; when `done`: every real match of the bracket; otherwise 0 and 0.
- `groups` (groups stage only): how many confirmed groups there are.
- `round` (a live knockout or finals only): the current round's name, from the same fixed set as `progress.stage`.
- `advance` (the knockout of round robin then knockout, while `waiting` or `next`, when above 0): how many entries go through, the sum over confirmed groups of the smaller of the group's size and the qualifiers per group (2 when unset).

Once the knockout or Finals is `live` or `done`, the groups stage is always reported as `done`, even if a group result was never entered (a bracket drawn early from the standings, a withdrawn player); its `done` and `total` stay the real counts, so the card can honestly say "28 of 30 matches". A `ready`, `next` or `waiting` later stage changes nothing. The organiser app no longer allows the knockout to be drawn before every group is finished, so this rule only matters for tournaments drawn before that change (and for Group Boards, whose Finals skeleton exists early).

The overall status (live, upcoming, results) is decided exactly as above.

### Caching

`Cache-Control: public, s-maxage=30`. No stale-while-revalidate: an event that is unpublished or unlisted must disappear promptly, the same rule the event endpoint follows.

## Structure

| Piece | File | Role |
|---|---|---|
| Limits | new `viewer/api/_lib/listConfig.js` | `RESULTS_DAYS = 7`, `LIVE_STALE_HOURS = 48`, `UPCOMING_GRACE_DAYS = 1`, `MAX_PER_LIST = 100`, `MAX_ROWS = 300`. The one place an admin setting would plug in later |
| Pure list logic | new `viewer/api/_lib/listView.js` | `toListItem(row)`, `classify(item, now)`, `buildList(rows, now)`: allow-listed items, status, progress, ordering. No database or DOM |
| Endpoint | new `viewer/api/events.js` | The query, the cache header, errors |
| Home page | new `viewer/home.js` + `viewer/home.css` | Client: `showHome()`, rendering, search, tabs, refresh. A classic script loaded by `index.html` |
| Hook | `viewer/index.html` | The script and style tags, the no-event branch calls `showHome()`, and the "See all events" button on the not-available message |
| Organiser switch | `index.html` | The checkbox, `setListed`, and the Public results card text |
| Docs | `README.md` | A short "Public home page" section |

`home.js` needs no code from the event page except the theme storage key (`dartdraw.viewer.theme`) and the escaping helper, which it carries itself so it works alone.

## Privacy and security

- Opt-in, and only while published: the view already hides unpublished events; the new filter hides unlisted ones.
- The allow-list is the single place the list's fields are chosen. A test fails if any other key of the event reaches the response.
- Every string shown on the home page (event, tournament, winner) is escaped; the code box accepts only the code shape and builds the address from it, never from the raw text.
- The list reveals slugs of listed events. That is the point of listing.
- The champion's name is public data the event page already shows.

## Edge cases

- No events, or the database unreachable: an empty list (and an error notice on a failed refresh), never a broken page.
- Same tournament name across organisers: they share a heading only if the date matches too.
- An event with no date: upcoming only if unstarted and saved within the last 8 days; live and results use the last save.
- A very long name wraps, never overflows; a name with HTML or script is shown as text.
- A tournament with no entries, no groups or no bracket yet: upcoming, entries omitted if zero.
- A bracket of one, a void final, a group of two, a withdrawn entry: no division by zero, no negative counts.
- Two events with identical names: both listed.
- The browser's reduced-motion and dark/light settings are respected.

## Testing

- `listView`: allow-list (a seeded event full of private fields leaks none of them), classification of live, upcoming, results, stale and unlisted for each format, the 48 hour and 7 day edges, date with and without a start time, ordering and the caps, progress for every format and stage (including a void match and a bye), and the winner for each format (none for a round robin).
- `events` endpoint: GET only, the exact query shape (reads only `public_tournaments`, never the base table), the cache header, a database error.
- `stages`: every format and moment (including a bracket drawn early, a void final, a Group Boards Finals skeleton with unfinished pods, a one-entry group and degenerate data); the subcard markup, wording, rings, pips and escaping; the stage CSS (two columns from 640px, a single subcard across the row).
- `home.js`: tab choice and counts, grouping under tournament headings, each card type, search filtering and the code box (code, pasted link, pasted deep link, junk), escaping of hostile names, empty and error states, refresh keeps the last good list.
- Organiser: the checkbox, disabled when Public results is off or the viewer address is unset, turning Public results off clears it, an old tournament without the flag is unlisted.
- The existing viewer, public-view and golden tests still pass; `check-viewer` still passes.

## Review focus

1. An event that is listed, then unpublished: it must leave the list within the cache window.
2. A seeded event full of private data: nothing beyond the allow-list in the response.
3. Boundary times: live just inside and just outside 48 hours, results just inside and outside 7 days, an event dated yesterday and the day before.
4. A hostile event name or winner name, and a hostile pasted "code".
5. A multi-stage event across its stages: within a stage the progress never moves backwards, a new stage starts the ring again from 0, and it never reads 100% while live (between stages it shows the check mark instead).

## Documentation

A short "Public home page" section in the README: what the home page shows, the opt-in switch, the 7-day and 48-hour rules, and where the limits live.

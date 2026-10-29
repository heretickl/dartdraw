# DartDraw

Web app for creating, managing, and printing darts tournament charts — built for the Kuala Lumpur Darts Association (KLDA). Tournaments are stored centrally (Neon Postgres), so a tournament is accessible from any device.

## Usage

Open the deployed URL for the public site, then log in (or go straight to `/app`) and use the app as normal — the print-ready chart still updates as you work, exactly as before. Login is off until you switch it on (see "Organiser accounts and login" below).

### Site structure

| Address | File | What it is |
| --- | --- | --- |
| `/` | `index.html` | Public landing page. A visitor who is already signed in is sent on to `/app`. |
| `/features` | `features.html` | Public features page. |
| `/how-it-works` | `how-it-works.html` | Public how-it-works page. |
| `/help` | `help.html` | Public Help page for organisers: a step-by-step guide and an FAQ, with search. The public results site has its own, separate help for spectators at its `/help`. |
| `/app` | `app.html` | The organiser app (the tournament editor). Signed-out visitors are sent to `/?login=1`. |
| `/ms`, `/ms/features`, `/ms/how-it-works`, `/ms/help` | `ms/index.html`, `ms/features.html`, `ms/how-it-works.html`, `ms/help.html` | The same four public pages in Bahasa Malaysia (see [Languages](#languages-english-and-bahasa-malaysia)). |
| (pop-up) | `login.html` | The sign-in form. The public pages show it in a pop-up (`login.html?embed=1` in an iframe); `/?login=1` or `/#login` opens that pop-up. `login.html` may only be framed by this site. |

The clean URLs are rewrites in `vercel.json`. The eight public pages (four in English, their BM twins under `ms/`) are **generated** by `scripts/build-landing.js`
(shared styles, header, footer links, closing band and login pop-up live there). Do not edit `index.html`, `features.html`,
`how-it-works.html` or `help.html` by hand: change the script (or, for Help, the content file below) and regenerate with
`npm run build-landing`. The pages are committed, so Vercel still has no build step, and `npm test` fails if they are out of
step with their sources. The register, verify, forgot and reset pages link back to the pop-up with `/?login=1`.

The header and footer of every public page link to `/help`, and the organiser app has a **Help** link in its top bar that opens
`/help` in a new tab.

#### Editing the Help page

The words of the Help page are **data** in `scripts/help-content.js`: sections (`guide` and `faq`), each with items that have an
`id` (the `#anchor`; do not change one that is already linked), a `title` (the heading or the question), a `body` (HTML) and, for
guide items, a `summary`. `scripts/build-landing.js` lays them out (search box, contents list, accordions) and writes
`help.html`. To change the Help page: edit `scripts/help-content.js`, run `npm run build-landing`, then `npm test`.
`tests/help-site.test.js` checks, among other things, that every anchor resolves, that there are at least 15 questions, that the
guide quotes the app's real button and message names (a quoted name that no longer exists in `app.html` fails the test, so update
the guide when you rename a button), and that the page says nothing about plans or tiers, other competition types or contact
emails. The link to the spectators' help is built from `VIEWER_URL` at the top of `scripts/help-content.js`.

### Languages: English and Bahasa Malaysia

The public pages (landing, Features, How it works, the organiser Help), the spectators' Help and the public results site's
home and event pages (see [Viewer languages](#viewer-languages-en--bm)) and the organiser app (see
[Organiser languages](#organiser-languages-en--bm)) exist in English and in Bahasa Malaysia (BM), and so do the sign-in and
account pages, the server's error messages and the account e-mails (see
[Sign-in pages, server messages and e-mails](#sign-in-pages-server-messages-and-e-mails-en--bm)). The Admin panel stays
English. Printed sheets use each event's own **Printed sheets language** (see
[Printed sheets language](#printed-sheets-language-en--bm)).

| What | English | Bahasa Malaysia |
| --- | --- | --- |
| Landing, Features, How it works, the Help page frame (words) | `scripts/i18n/en/landing.js` | `scripts/i18n/ms/landing.js` |
| Organiser Help articles and FAQ | `scripts/help-content.js` | `scripts/i18n/ms/help-content.js` |
| Generated organiser-site pages | `index.html`, `features.html`, `how-it-works.html`, `help.html` | `ms/index.html`, `ms/features.html`, `ms/how-it-works.html`, `ms/help.html` |
| Spectators' Help (public results site, hand-written) | `viewer/help.html` (`/help`) | `viewer/ms/help.html` (`/ms/help`, rewrite in `viewer/vercel.json`) |
| Public results site: home and event pages | `viewer/i18n/en.js` | `viewer/i18n/ms.js` |
| Standings, tie notes and charts (`render.js`, shared) | `DD_RENDER_EN` inside `render.js` | `i18n/render.ms.js` (copied to `viewer/i18n/` by `npm run sync-viewer`) |

**The switch.** Every one of these pages has an **EN | BM** control in its header: two plain links (they work without
JavaScript) to the same page in the other language, keeping the `?query` and `#anchor`. A click also saves the choice in
`localStorage["dartdraw.lang"]` (`en` or `ms`, inside try/catch). The public site and the organiser app share one saved
choice; the results site is another origin and keeps its own. Rules (the `dd-lang` script in the head, written by
`langHead` in `scripts/build-landing.js`; the two viewer Help pages carry the same script, and a test keeps the copies equal):

- `?lang=ms` or `?lang=en` on any page saves that choice and opens that language's version of the page.
- A saved choice sends a page to its twin with `location.replace` only when the address has no `#anchor` (a shared link to a
  section stays where it points). Exception: `/help#anchor` with `ms` saved goes to `/ms/help#anchor`, so the organiser app's
  **?** links (which open `/help#...`) land on the same section in BM.
- The browser language never redirects anyone. When nothing is saved and `navigator.languages[0]` starts with `ms`, the English
  pages show a small note, "Bahasa Malaysia tersedia — Tukar ke BM", that can be closed (remembered as `dartdraw.lang.note`).
- The viewer's home and event pages switch in place (no reload, see below); their Help links open `/ms/help` in BM
  (`hmLangHref` in `viewer/home.js`, used by `helpHref` in `viewer/index.html`), keeping `?from=` so Help can go back.
- Each page has `<html lang>`, its own title and description, a canonical link and `hreflang` en / ms / x-default links. The
  full addresses come from `SITE_URL` in `scripts/build-landing.js` (change it when the site gets its own domain) and
  `VIEWER_URL` in `scripts/help-content.js`.

**Editing or translating.** Change the English and the BM in the same commit. The two files of a pair have the same keys,
the same section and item ids, the same `<h4 id>` anchors, aliases and `#links` (`tests/i18n-pages.test.js` fails otherwise);
then run `npm run build-landing` and `npm test`. For the spectators' Help, edit both `viewer/help.html` and
`viewer/ms/help.html`. BM follows `docs/i18n/glossary.md` (terms, register, dates) and `docs/i18n/style-rules.md` (the
proofreader's 13 rules and the owner's bracket / board decisions). The test also rejects the glossary's forbidden words
(*bagan*, *papan*, *mengundi*, *dua belah*, *keputusan seri* for a tie and others) and any paragraph that is still English.
Mark a sentence you are unsure of with a `// PROOFREAD:` comment next to the item, for the BM proofreader.

**Button and label names.** When the Help quotes a button in `<b>`, the BM Help uses that label's BM from
`docs/i18n/ui-strings-ms.js` (the UI string table, the draft for the app step); the test checks every one. A label the table
does not have yet: add it to the "Added in i18n step 1" block of that file and list it in `docs/i18n/ui-strings-needed.md`.
Since step 3 the organiser Help's BM quotes are also checked against the real app strings (`i18n/app.ms.js`,
`tests/app-i18n.test.js`), so a quoted label must be exactly what the BM app shows.
The spectators' BM Help is checked against the real viewer strings instead (`viewer/i18n/ms.js`, `i18n/render.ms.js` and the
BM screens: `tests/viewer-i18n.test.js`), so a quoted label must be exactly what the BM viewer shows.

#### Viewer languages (EN | BM)

The public results site (`viewer/`) draws its home page, event pages, tables, grids and brackets in English or BM.

- **The choice.** `?lang=ms` or `?lang=en` wins, is saved and is taken out of the address (`history.replaceState`, the
  `#route` stays). Otherwise the saved `localStorage["dartdraw.lang"]` (the same key the viewer's Help switch saves; the
  results site is its own origin, so its own choice), otherwise English. Never chosen from the browser language: a browser
  whose first language is `ms` with nothing saved gets the closable "Bahasa Malaysia tersedia — Tukar ke BM" note on the
  home and event pages (`#langBar`, closed for good as `dartdraw.lang.note`). QR codes stay language-neutral.
- **The switch.** Event page: an **EN | BM** pair left of the Auto / Light / Dark pill (at 480 px and below the header's top
  row wraps: the tournament name gets the whole line). Home page: the pair from 481 px; on a phone one button showing the
  other language. A switch sets `<html lang>`, the title and every word at once, with no reload: the tab, the `#route`,
  the group or player shown, open keys, the bracket view and round, Me / Following and the scroll position stay.
- **The code.** `viewer/i18n/i18n.js` holds `T(key, vars)` (English fallback plus one console warning per missing key),
  `TU(key, team, vars)` for sentences with a Teams twin (`key.team` / `key.player`), `ddOrdinal`, `ddClock` and
  `ddDateNum` (`Intl.DateTimeFormat` `ms-MY` / `en-GB`: `7:10 PTG` / `7:10 pm`; dates `dd/mm/yyyy` in BM, while the English
  page keeps the stored date as it always showed it), the switch and the note. Static markup carries `data-i18n="key"` or
  `data-i18n-attr="placeholder:key;aria-label:key"`; everything built in JavaScript calls `T()`. Pages register their redraw
  with `ddOnLang(fn)` (`relang()` in `viewer/index.html`, `hmRelang()` in `viewer/home.js`).
- **render.js** is shared with the organiser app. Its words have stable keys (`r.*`): the English table `DD_RENDER_EN` is
  inside `render.js`, so the organiser (which defines no `DD_T`) draws byte-identical English (`tests/golden/render-en.json`);
  the viewer defines `DD_T` and gets BM from `i18n/render.ms.js`. Round names wider than any English one (BM
  *Pusingan 16 terakhir*) may wrap onto two lines in the chart header; "LWN" is drawn a little smaller than "VS".
- **The server sends codes, not words.** `viewer/api/_lib/listView.js` sends `progress.stage` (`groups` | `knockout` |
  `finals`), `round` (`final` | `semifinals` | `quarterfinals` | `r<N>`), `next` (`awaiting` | `knockout` | `finals`), and
  `event: ''` for an unnamed event; `viewer/home.js` turns them into words. Stored values (`eventType`, `competitionUnit`,
  `formatType`, tie-break rule ids) stay English codes and are shown through the tables (`cat.Open`, `unit.Singles`,
  `fmt.knockout`, `r.rule.h2h`). The organiser's own text (names) is never translated.

**Adding or changing a viewer string.** Never glue pieces: a sentence is one key with `{placeholders}` (`'{a} v {b}'` /
`'{a} lwn {b}'`, `'{unit} {cat}'` in BM, `'Round of {n}'` / `'Pusingan {n} terakhir'`, `'{n} of {m}'` counters, ordinals
`ke-{n}`). English plurals are `{ one, other }` (picked by `n`); BM has one string. Add the key to `viewer/i18n/en.js` and
`viewer/i18n/ms.js` (or, for `render.js`, to `DD_RENDER_EN` and `i18n/render.ms.js`, then `npm run sync-viewer`), and use
`T('key', {...})` in the code, escaping the values you fill in (`escapeHtml` / `hmEsc`). `tests/viewer-i18n.test.js` checks:
the same keys and placeholders in both tables (a value deliberately the same in both goes in its `SAME` list), no English on
any BM screen of the mock events (`tests/lib/viewer-events.js`, rendered by `tests/lib/viewer-screens.js`), the English
screens unchanged (`tests/golden/viewer-en.json`; after an intended English change rerun with `UPDATE_GOLDEN=1`), the BM
Help quotes, the switch, dates and plurals. List new BM labels for the proofreader in `docs/i18n/ui-strings-needed.md`.

#### Organiser languages (EN | BM)

The organiser app (`/app`: `app.html`, `pods-ui.js`, `boardplan-ui.js`, messages in `pods.js`) draws every stage, box and
message in English or BM. The Admin panel stays English; printed sheets follow the event's Printed sheets language (below).

- **The choice.** `?lang=ms` / `?lang=en` wins, is saved and is taken out of the address (other parameters and the `#hash`
  stay). Otherwise the saved `localStorage["dartdraw.lang"]` (shared with the public pages: the Help switch and the app
  switch save the same choice), otherwise English. Never chosen from the browser language: a first browser language `ms`
  with nothing saved shows the closable "Bahasa Malaysia tersedia" note under the top bar (`#langBar`, closed for good as
  `dartdraw.lang.note`).
- **The switch.** An **EN | BM** pair (`aria-pressed`, `lang` on each button, one group labelled "Language / Bahasa") before
  **Help** in the top bar and in the compact bar (wider than 680 px); below that the compact menu has a "Bahasa: EN | BM"
  row. A switch sets `<html lang>`, the title and every word with no reload, through `ddOnLang(appRelang)`: the event, the
  stage, the scroll position, an open box, typed but unsaved fields and the sample event all stay; nothing is saved and
  nothing is marked unsaved. Help links open `/help#...` or `/ms/help#...`; the viewer links (**Open ↗**, **All events ↗**)
  carry `?lang=` so spectators' pages open in the same language.
- **The code.** `i18n/app-i18n.js` holds `T(key, vars)` (English fallback plus one console warning per missing key, plurals
  `{ one, other }` picked by `n`), `DD_T` (so `render.js` draws BM from `i18n/render.ms.js`), `ddOrdinal`, `ddList`,
  `ddClockMs` / `ddDateTime` / `ddDateNum` (`Intl` `ms-MY` / `en-GB`; BM dates dd/mm/yyyy, times `7:10 PTG`, durations
  `3 jam 30 min`; English keeps what it showed), `ddHelpPath`, the switch and the note. Static markup carries
  `data-i18n="key"`, `data-i18n-html` or `data-i18n-attr="aria-label:key"`. Stored values (`eventType`, `competitionUnit`,
  `formatType`, tie-break rule ids) stay English codes shown through `cat.*`, `unit.*`, `fmt.*`; names are never translated.
  Automatic entry names ("Player A1" / "Pemain A1") are made in the screen language and never renamed by a switch.
- **Print language.** Every print builder runs inside `ddWithLang(ddPrintLang(), ...)`: the paper is in the event's Printed
  sheets language whatever the screen shows (see [Printed sheets language](#printed-sheets-language-en--bm)).
- **Adding a string.** Add the key to `i18n/app.en.js` and `i18n/app.ms.js` (the English value is exactly what the screen
  showed, HTML included), use `T('key', {...})` and escape the values you fill in. `tests/app-i18n.test.js` checks the two
  tables (keys, placeholders, tags, glossary), no English on any BM screen, box or message of the mock events
  (`tests/lib/app-states.js`, drawn by `tests/lib/app-screens.js`), the English output unchanged per call
  (`tests/golden/app-en.json`; rerun with `UPDATE_GOLDEN=1` after an intended English change), print sheets identical in both
  screen languages, the switch, the BM Help quotes against `i18n/app.ms.js`, XSS in BM and the coverage scan
  (`node scripts/i18n/scan-strings.js app.html` lists English literals left outside `T()`). List coined BM labels in
  `docs/i18n/ui-strings-needed.md`.

#### Printed sheets language (EN | BM)

Every printed sheet (rules & format, running order, group charts, bracket sheets and their split / shrunk forms, projected
brackets, Group Boards charts, Players A–Z and Boards, Teams lineup sheets and the empty emergency sheet, the QR caption,
the sponsor footer and the "Generated with DartDraw" credit) is printed in the event's own language, not the screen's.

- **The setting.** `printSettings.sheetLang` (`'en'` | `'ms'`), shown as **Printed sheets language** (*Bahasa helaian
  bercetak*) with the other print settings of steps 4 and 7 (every format, `sheetLangRowHTML`). A new event gets the
  organiser's screen language (`blankTournament`); Duplicate keeps it; `tournament-sanitize.js` turns any other value into
  `'en'`; an event saved before the setting existed has no field and prints in English, byte for byte as before. A finalized
  event's setting is locked like its other print settings (`setSheetLang` refuses, `applyFinalizedLock` disables the box).
  Changing it redraws the print previews of steps 3 and 4 (`chartPreviewHTML`), which show the paper as it will print; the
  score grids of Manage Tournament stay in the screen language. A tournament's paper never changes language because a
  different person prints it, and switching the screen language never changes the setting.
- **The words.** The sheets' own words are in `i18n/print.en.js` / `i18n/print.ms.js` (keys `pr.*`, merged into the same
  `T()` table by `i18n/app-i18n.js`); words the sheets share with the screens stay in `i18n/app.*.js` (`sheet.*`,
  `grp.label`, `noun.*`, `seg.*`, `credit`, `qr.block`) and `render.js` (round names, BYE, CHAMPION). Dates print
  dd/mm/yyyy and times 12-hour (`7:00 PTG`) in BM; English keeps the stored date. Stored labels (`Bracket`, `Main bracket`,
  `Plate pool`, `Finals`, a Group Boards group's `Group N`) are printed through the table (`printBracketLabel`).
- **Automatic entry names** ("Player A1" / "Pemain A1", "Entry 3") are stored in the language the screen had when they
  were made and print as stored: they are the event's data, also on the public page, and are never translated on paper.
- **bracket-print.js** takes its words (BYE, JUARA, the WO / TIDAK HADIR marks, the section exits, "Nama penuh:", short
  round names) from the table in the print language (`model.words`). Round labels shrink to their box, never under 4.6 pt;
  English then falls back to R128 / QF / SF as before, BM (no abbreviations: glossary) first wraps the label onto two lines
  ("Pusingan 128 / terakhir") and only then uses the approved short form P128. A word never widens the layout beyond the
  English one (TIDAK HADIR stacks on two lines, the exits are measured against the English width), so the paper
  recommendation and the split are the same in both languages.
- **Tests.** `tests/print-i18n.test.js` (tables, the setting, independence from the screen, no English on any BM sheet of
  the mock events drawn by `tests/lib/print-sheets.js`, English byte-identical to the app before step 4:
  `tests/golden/print-en.json`, made with `UPDATE_GOLDEN=1 GOLDEN_PRINT_DIR=<copy of the app before step 4>`; round labels
  at A4 / A3 for 8–128 slots, the same paper recommendation, the print font's glyphs, XSS). `node scripts/sim/run-simulation.js`
  makes the 12 simulated events twice, with English sheets (`docs/design/simulation/`) and BM sheets
  (`docs/design/simulation-ms/`), and audits both (`--lang en|ms` for one).

#### Sign-in pages, server messages and e-mails (EN | BM)

- **The pages.** `login.html` (also the pop-up, `login.html?embed=1`), `forgot.html`, `register.html`, `reset.html` and
  `verify.html` load `i18n/auth.en.js`, `i18n/auth.ms.js`, `i18n/errors.en.js`, `i18n/errors.ms.js` and `i18n/auth-i18n.js`
  before their own script. The choice works as in the app: `?lang=` wins, is saved and leaves the address (a `?token=`
  stays), then the saved `dartdraw.lang`, otherwise English (never the browser language). On its own each page has a
  compact **EN | BM** pair in the card's top row (`aria-pressed`, `lang` on each button, group "Language / Bahasa"); a press
  redraws every word, the title and `<html lang>` with no reload and keeps what was typed. In BM the **Sign in** links go to
  `/ms?login=1` and the links between the account pages carry `?lang=ms`.
- **The pop-up** has no switch: the dialog's close button sits where it would go. It follows the page around it: the BM
  public pages frame `login.html?embed=1&lang=ms` (`scripts/build-landing.js`; the English pages are unchanged), otherwise it
  reads the parent page's `<html lang>`.
- **The words.** Static markup carries `data-i18n="key"`; the page scripts keep their English sentences and show them through
  `I18N.put(el, english, { code, vars, after })`, which maps the English to its key and shows the current language. The
  Admin's contact line under "No account yet?" is shown as the Admin wrote it.
- **Server messages.** Every error answer in `api/**` is `{ code, error }` (plus fields such as `limit` or `finalized`):
  `error` is the English text exactly as before, `code` is stable. `i18n/errors.en.js` lists every code; `i18n/errors.ms.js`
  has BM for every code people can see (Admin-only codes, listed in `DD_ERR_ADMIN_ONLY`, stay English). A BM page shows
  `err.<code>` filled from the answer's own fields and falls back to the English `error`; an English page shows `error` as
  sent. The organiser app does the same through `ddApiError(body, fallback)` in `i18n/app-i18n.js` (the error tables
  are merged into its `T()` tables); today only Change password shows a server text. A new error answer needs a code: `tests/api-error-codes.test.js` scans `api/**` and fails without one, and checks the
  code is in both tables (or in the Admin-only list).
- **E-mails.** The verify, reset and "already have an account" e-mails (`api/_lib/authflow.js`) and the Admin's invite and
  reset-link e-mails are bilingual, English first and then BM, in one message with a plain-text and an HTML part
  (`api/_lib/emails.js`; subjects such as "Verify your DartDraw email / Sahkan e-mel DartDraw anda"). No language is stored
  on the account. Only the invite greets by name (the name the Admin typed, escaped in the HTML); self-service e-mails carry
  no name, because whoever fills in the sign-up form chooses it.
- **Tests.** `tests/auth-i18n.test.js` (tables, no English left on the five pages in BM, the switch, `?lang`, the pop-up, the
  links, codes shown in BM, XSS), `tests/api-error-codes.test.js` and `tests/auth-emails.test.js`.

**Search.** `help-search.js` takes the page's language from its data: `lang: "ms"` switches English stemming off (BM affixes
change the meaning), uses BM stop words and reads chat short forms (`tak`, `utk`). Every sentence the search shows comes from
the page data (`strings`), so a language's wording goes there, not in the module. The BM synonym groups (`search.synonyms` in
`scripts/i18n/ms/help-content.js`, the JSON block in `viewer/ms/help.html`) list each form people type, in BM and in the English
they mix in; `search.toEnglish` (and `alias` in `viewer/help.html`) lets a BM word typed on the English Help search for its
English meaning. Real BM phrases are regression-tested in `tests/fixtures/help-search-ms-*.json`.

## Offline scoring

The organiser app keeps a copy of itself on the device (`sw.js`, a service worker for `/app` only) and every unsent change
(`offline.js`, IndexedDB), so scoring on Manage Tournament carries on with no signal. When you add, remove or rename a
file the app loads, update `SHELL` in `sw.js` and bump its `VERSION` (network first already serves changed files after
a deploy; the bump clears old caches). Locally, `node tests/dev/mock-organiser.js` and `/__offline?on=1` (no API) or
`on=2` (no network at all) pretend the signal is gone.

## Deployment

Hosted on Vercel with a Neon Postgres database.

1. **Neon**: create a project, open the SQL Editor and run `schema.sql` once to
   create the `organizers`, `tournaments` and sign-in tables (a database that already exists is upgraded with `migrations/2026-10-13-accounts.sql`, see below). Copy the **pooled**
   connection string.
2. **Vercel**: import this repo as a new project (Framework Preset "Other" —
   zero config, no build step). Add two Environment Variables:
   - `DATABASE_URL` — the Neon pooled connection string from step 1.
   - `SESSION_SECRET` — a long random string (see `.env.example` for how to
     generate one).
3. Deploy.

Local development: copy `.env.example` to `.env` (or `.env.local`), fill in
the values, and run `vercel dev`.

### Organiser accounts and login

Each organiser has their own account and sees only their own tournaments. Two
access levels exist, and they differ in one thing only:

| Level | Entries per event |
|-------|-------------------|
| **Basic** (the default for new sign-ups) | up to 64 |
| **Pro** | unlimited |

Entries are counted without withdrawn ones, and a doubles pair counts as one.
The server enforces the limit, so it cannot be bypassed from the browser. A
Basic organiser whose event is already larger than 64 (for example after being
moved down from Pro) can keep editing it but cannot add entries. One account is
the **Admin** (the project owner). Only `scripts/create-admin.js` can create an
admin; sign-up never can. The Admin runs the service from the Admin tab (see "Admin tab" below).

Login stays **off** until you switch it on, so nothing changes for a running
site until step 3 below. Use these steps in this order:

1. **Run the migration (once).** Open the Neon SQL Editor and run
   `migrations/2026-10-13-accounts.sql`. It adds the account columns and the
   `auth_tokens` and `auth_throttle` tables, marks every existing real account as
   verified and Pro, and is safe to run again. (A fresh install already gets all
   of this from `schema.sql`.)
2. **Create the Admin and adopt the existing tournaments.** On your own computer,
   with the Neon **pooled** connection string:

   ```
   DATABASE_URL="postgresql://..." node scripts/create-admin.js --email you@example.com --name "Your Name" --adopt-public
   ```

   It asks for a password (at least 8 characters, not shown as you type). To avoid
   the prompt you can set `ADMIN_PASSWORD` in the environment instead; the password
   is never accepted as a command-line argument and never printed. The script
   creates the account, or if that email already exists, promotes it to Admin /
   Pro / verified, sets the new password and signs out its old sessions.
   `--adopt-public` moves every tournament of the old shared "Public" account
   (finalized ones included) to your account in a single database statement, so it
   either all happens or none of it does, and prints how many were moved. Running
   it again moves nothing. Tournaments owned by other accounts are never touched,
   and the Public account itself can never sign in.
3. **Switch login on.** In Vercel set `REQUIRE_LOGIN` = `true` and `APP_URL` = the
   app's public address (no trailing slash), then redeploy. Sign in as the Admin;
   your existing tournaments are there. Setting `REQUIRE_LOGIN` back to `false`
   (or removing it) is an emergency fallback that re-opens the shared Public
   account, which after the move shows an empty list.
4. **Later, when you have a domain: open sign-up.** Verify the domain with
   [Resend](https://resend.com), then set `RESEND_API_KEY`, `MAIL_FROM` (for
   example `DartDraw <noreply@your-domain>`), keep `APP_URL`, set
   `SIGNUP_OPEN` = `true`, and redeploy. Sign-up opens, and the login page shows
   the Sign up link. People verify their email by opening a link and entering the password they chose at sign-up, and Forgot password
   works. Until then sign-up stays closed (the endpoint answers 403 and the link
   is hidden) and no email is sent.
5. **The old `SIGNUP_CODE` setting is retired.** Sign-up no longer reads it; you
   can delete it from Vercel.

Environment variables (see `.env.example`):

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Neon pooled connection string. |
| `SESSION_SECRET` | Long random string that signs session cookies. |
| `REQUIRE_LOGIN` | `true` to require sign-in. Anything else keeps the shared Public account. |
| `APP_URL` | Public address of the app, no trailing slash. Used for the links in emails. Required in production. |
| `SIGNUP_OPEN` | `true` to allow open sign-up. It only opens if email is also configured. |
| `MAIL_PROVIDER` | `resend` (default) or `console`. `console` writes each message and its link to the server log, for development only. |
| `RESEND_API_KEY` | Resend API key (needed for `resend`). |
| `MAIL_FROM` | Sender address on a domain verified in Resend (needed for `resend`). |
| `VIEWER_URL` | Address of the public results site. |

Without a domain the Admin can still sign in (step 2 needs no email), but
sign-up, email verification and Forgot password are unavailable. The Admin tab
covers that gap: accounts the Admin creates, and password resets, are handed over
as a one-time link to share by hand (see "Admin tab" below).
Sign-up and password reset links are single use and expire (verify 24 hours,
reset 1 hour, invite 7 days). A password reset, or suspending an account, signs
that account out everywhere immediately. Sign-in, sign-up, forgot and resend are
rate limited.

**Change password.** Anyone signed in (organisers and the Admin) can change their own
password with the **Change password** button next to **Log out** in the account bar. It asks for
the current password, the new one (8 to 200 characters, different from the current one) and the
new one again. A change signs out every other device and browser on that account; the one you
changed it in stays signed in. It does not need email, so it works without a domain. The server
limits it to 5 attempts per account and 20 per address every 15 minutes (a wrong current
password counts), and it is not offered in public mode (`REQUIRE_LOGIN` not `true`). The button stays usable on a finalized event.

### Admin tab

The Admin account sees an **Admin** entry (gold) in the organiser sidebar, below the account bar; **Back to my events** returns to the normal screens. The server checks the Admin role on every Admin call, so the entry being hidden for other people is a convenience, not the protection. An Admin has **Pro access** whatever tier is stored on the account (no entry limit), plus the Admin tab. It has three views:

- **Organisers.** List everyone with tier, role, status (Active, Suspended, Unverified) and event count. Add an organiser (name, email, tier), change a tier, suspend or reactivate, make or remove an Admin, copy a password reset link, transfer all of someone's events to another organiser, and delete an organiser. Guards: you cannot change your own role, suspend yourself or delete yourself; the last active Admin cannot be demoted, suspended or deleted; an organiser who still owns events cannot be deleted (transfer the events first); suspending or demoting someone signs them out everywhere.
- **Events.** Search every organiser's events and filter by owner. **Open** loads an event in the normal editor with an "Editing ...'s event as Admin" banner, and saving keeps the original owner. Per event: **Reopen** (finalized events only), **Unpublish** (turns off Public results and the public listing), **Unlist** (removes it from the public home page but keeps its private link), **Transfer** to another organiser, and **Delete**. A finalized event stays locked, even for the Admin, until it is reopened; an Admin who opens one gets a **Reopen to edit** button.
- **Settings.** How long events stay on the public home page: Results days (1 to 90, default 14) and Live hours (1 to 168, default 48). See "Retention" under "Public home page". Also the **contact line on the sign-in page**: one line of plain text (at most 200 characters, no `<` or `>`) shown under "No account yet? Accounts are created by the site admin.", for example who to ask for an account and how. It is stored in `site_settings` (key `adminContact`), is the only stored setting that `GET /api/auth/config` returns to the public, and is never in the viewer's `public_settings` view. Empty means the sign-in page shows only that sentence.

An Admin changes their own password like anyone else, with **Change password** in the account bar; there is no Admin-tab action for your own account.

**Rolling it out.** Do these in order:

1. In the Neon SQL Editor run `migrations/2026-10-14-admin.sql` (creates the `site_settings` table; safe to run again).
2. In the Neon SQL Editor run `viewer/sql/settings.sql` (creates the `public_settings` view the public site reads, and grants it to `viewer_ro`).
3. Deploy the organiser project and the viewer project (each deploys from `main`).

Until step 2 is done the public site simply uses 14 days and 48 hours, so deploying first does not break anything; the Settings numbers just have no effect on the public site until the view exists.

**Reopening a finalized event.** Once an organiser accepts the results the event is closed: the organiser app refuses every save and delete for it, and the public pages show **Final results**. The Admin reopens it with the **Reopen** button on the Events view (or **Reopen to edit** on the event itself). That removes the finalized marker, so the event goes back to Live (or wherever its progress puts it) and the organiser can edit again; an organiser who still has the event open gets the normal "changed elsewhere" message and needs to reload it. This replaces the old manual step. If the Admin tab is ever unavailable, the same thing can be done in the Neon SQL Editor:

```sql
UPDATE tournaments SET data = data - 'finalized', updated_at = now() WHERE id = '<tournament id>';
```

**Handing over links without an email domain.** Until Resend is set up (step 4 above) no email is sent, so the Admin passes links on by hand:

- **New organiser.** Add organiser shows an invite link with a Copy button. Send it to them yourself (WhatsApp, text, anything). The link works once and for 7 days, and opens the page where they choose their password. The account is already verified.
- **Forgotten password.** Open the organiser's row and use the reset link action, copy the link and send it to them. It works once and for 1 hour. Using it signs them out everywhere. Never ask an organiser to tell you their password.
- Treat these links like passwords: anyone holding an unused link can set the password for that account. Issuing a new reset link cancels the previous unused reset link, so if one went to the wrong place, make a new one. An unused invite link is a separate kind and is not cancelled by a reset link; if an invite went astray, delete the new account (allowed while it owns no events) and add the organiser again.

Once email is configured, the same actions also email the link, and the link is still shown to the Admin.

## Public results site (separate Vercel project)

Turn on **Public results** in Manage Tournament to get a read-only link
(`<viewer site>/live/<code>`) that shows live group standings, results and the
bracket. It's meant for players and spectators: no editing, saving or login, and
it refreshes itself every 20 seconds.

The public site lives in the `viewer/` folder and is deployed as its **own
Vercel project** — separate URL, separate deployment, separate environment
variables, and its own **read-only** database login. The organiser app never
serves it, and the viewer has no way to reach organiser accounts or unpublished
tournaments. The two only meet through the database: the organiser app sets
`published` and a random `publicSlug` on a tournament; the viewer reads
published ones.

### Setting it up (once)

1. **Neon** — open the SQL Editor and run `viewer/sql/readonly.sql` (change the
   password first). This creates a `public_tournaments` view (published
   tournaments only) and a `viewer_ro` login that can read nothing but that view.
2. **Vercel** — *Add New → Project*, import this same repo again, and set
   **Root Directory** to `viewer`. Framework Preset "Other", no build step.
   Add one Environment Variable: `DATABASE_URL` = the Neon pooled connection
   string with the `viewer_ro` user and password (see `viewer/.env.example`).
   Give it its own name/domain, e.g. `dartdraw-results`.
3. **Organiser project** — add `VIEWER_URL` = the viewer's address (e.g.
   `https://dartdraw-results.vercel.app`, no trailing slash) and redeploy. The
   Public results card uses it to show the shareable link.

### Keeping the shared display code in step

The standings and bracket drawing (`render.js`, `render.css`, and render.js's BM words
`i18n/render.ms.js`) are used by both sites. The copies in the repo root are the source of truth. After changing
them, run `npm run sync-viewer` to copy them into `viewer/`, and commit both.
`npm run check-viewer` fails if the copies differ. Keep that code display-only.

The Help search (`help-search.js`) is shared the same way: the organiser Help
(`help.html`) and the spectators' Help (`viewer/help.html`) both load it, and
`npm run sync-viewer` copies it into `viewer/`. Each page keeps its own words
for it: the organiser synonyms and "no answer" topics are in
`scripts/help-content.js` (`search`), the spectator ones in the JSON block in
`viewer/help.html`. `tests/fixtures/help-search-*.json` holds the phrases real
novices typed; `npm test` checks every one still finds its answer.

### What the public site can see

`viewer/api/public/[slug].js` answers GET only, for published tournaments only,
with an allow-listed copy of the data — entry names, scores, standings and
brackets. Notes, the incident log, check-in details, the Teams segment setup,
any player lists stored by older events, logos and sponsors are never included. To share more, add the field in
`viewer/api/_lib/publicView.js`. An unpublished or unknown code returns 404.

### Public home page

The viewer's bare address (for example `https://dartdraw-viewer.vercel.app/`) is a branded home page with a list of events, in three tabs: **Live**, **Upcoming** and **Results**, with a search box that also takes an event code or link.

- **Opt-in.** An event appears only when its organiser ticks **List on the public page** on the Public results card (it is off by default, and turning Public results off turns it off too). Events that are only published keep working through their private link and are never listed. A duplicated tournament starts unlisted, and turning Public results on never brings back an old listed flag.
- **What it shows.** Event and tournament name, date, start time, format, number of entries, a progress ring while live, and the winner once finished. Scores, other players, clubs and notes are never part of the list (`viewer/api/_lib/listView.js` is the allow-list).
- **Rules.** Live means play has started, the organiser has not finalized the event, and it was saved within 48 hours (the default; see "Retention" below; an event with every match played stays Live until it is finalized). Upcoming means not started and dated yesterday or later. Results are events the organiser has finalized with **Accept results & finalize**, and stay for 14 days after finalizing (the default; see "Retention" below). The event page shows **Final results** only for a finalized event. An unstarted event with no date is upcoming while it was saved within 8 days. A round robin shows no winner line.
- **Retention.** How long a finalized event stays under Results (1 to 90 days, default 14) and how long an unfinished event stays under Live now (1 to 168 hours, default 48) are set by the Admin in the Admin tab, Settings. To let the public site read them, run `viewer/sql/settings.sql` once in the Neon SQL Editor (after `migrations/2026-10-14-admin.sql`, which creates the `site_settings` table). It creates the `public_settings` view, which exposes only those two values, and grants it to `viewer_ro`. Until that is run, or if the view is missing or holds a bad value, the public site uses the defaults (14 days, 48 hours); out-of-range numbers are clamped. The built-in defaults and ranges live in `viewer/api/_lib/listConfig.js`.
- **How it is served.** `GET /api/events` reads the `public_tournaments` view and the `public_settings` view through the read-only role and is cached for 30 seconds, so an unlisted or unpublished event disappears within about half a minute. The page itself is `viewer/home.js` and `viewer/home.css`, in the viewer project.

## Teams events

New events can be **Singles**, **Doubles** or **Teams** (an existing Triples event keeps its type). No competition
type has a roster: an entry is just its name. Older events' stored `players` lists are kept in the data, untouched,
but never shown or used.

A Teams match is a list of **segments**, set once per event on Format & branding (Basic and Advanced setup) and
used by every round and format: `format.teamSegments = [{type, startingScore, legs}]`, with `type` one of
`singles`, `doubles`, `trios`, `foursome` and `startingScore` 301 / 501 / 701 / 1001, plus an optional tie-breaker
segment chosen per stage, `format.teamTieBreaker = {type, startingScore, legs, inRoundRobin, inKnockout}` (Group Boards
and the Plate pool are knockout), played only when the totals are level.
The organiser enters **one result per match**: the total legs each team won across all its segments. It is stored
like any other leg score, so standings, brackets, finalizing and the public page need nothing special.

- **Cap.** A team's total is at most the sum, over the main segments, of `floor(bestOf/2)+1`, plus the tie-breaker's
  when that match's stage uses it (9 with the defaults, 10 with the tie-breaker). A total above it is refused, never
  changed to the cap; a stored result can always be saved again unchanged. A walkover gives the winner every main segment.
- **Level totals** can't be saved in a stage that uses the tie-breaker. Without it they are a draw in a round robin
  (1 point each) and still refused in a knockout.
- **Editing.** At most 8 segments (the lineup sheet fits one A4 page). Edits are a draft applied only by Save format &
  branding, which refuses an even best of for a segment, and for the tie-breaker while a stage would use it and its
  settings can still change.
- **Locks.** A stage begins with Start all games or a score (round robin), or with Start round, a match called to
  its board, or any result, walkover or "neither showed" (knockout, Plate pool, Group Boards groups and Finals; byes
  don't count). Once either stage has begun, the segments are locked, and so are a Teams event's format cards,
  Knockout type and competition type (step 1). Each stage's tie-breaker tick locks only when that stage begins; after
  that it is never switched off, the knockout one can always be switched on, and the round robin one while no drawn
  result is stored. The tie-breaker's own settings (shared by both stages) lock once a begun stage uses it. A tick for
  a stage the format lacks is stored off.
- Teams has no event-wide **Best of legs** and no knockout leg progression; the time estimate sums every segment's
  legs (the tie-breaker's too when ticked).
- An older Teams event is migrated once on load (`migrateTeamSegments` in `app.html`): rubbers become segments
  (`triples` becomes `trios`, the rubber flagged tie-breaker becomes the tie-breaker); a foursome event becomes one
  Foursome segment with its best-of. The old fields stay in the data. `tournament-sanitize.js` cleans both new fields.
- The lineup/scorecard sheet (Teams only) prints one page per fixture from the segments: fixed-height segment bars
  (Singles half height), the tie-breaker bar when that fixture's stage uses it, then a compact TOTAL POINTS block, and
  the rest of the page as a Captain/Manager signature area; 8 segments plus a tie-breaker still fit one A4 page.

Spec: `docs/superpowers/specs/2026-10-20-teams-segments-design.md`.

## Knockout draw (generateBracket)

Every knockout bracket (pure knockout, the knockout after a round robin, the Plate pool, Group Boards groups) is
placed by `generateBracket` in `app.html`:

- **Seeds and byes.** Standard seeding; byes go to the best seeds. After a round robin, group winners are seeded
  ahead of runners-up, and so on.
- **Clash pairs.** Entries from the same round robin group, and entries with the same organisation (whenever an
  organisation is filled in, whatever the tick boxes say), are kept apart as long as possible. Same group comes first:
  a final step (`improveGroupSeparation`) runs only when some group is short of its last possible stage, and may move a
  same-organisation pair earlier if that keeps a group apart, never making the worst-first separation of all pairs
  worse. It works out each swap's group shortfall from the same-group pairs alone first and builds the full histogram
  only for swaps that can be chosen (the same choice as a full scan, much faster with whole clubs), so it normally
  finishes well inside its cap; a group can still be left short where every fix would make some other pair worse.
- **Limits.** A bracket holds at most 128 entries. The draws refuse a bigger one with a message (`BRACKET_MAX_ENTRIES`),
  `generateBracket` throws, Group Boards refuses groups over 128 (`podsValidateCount`; `podsMovePlayer` and
  `podsPlaceLate` refuse a full group before changing anything, `PODS_GROUP_MAX`), and the print pack prints a
  one-line note instead of the projected bracket (saying what to change; with the Plate pool on and the main bracket
  too big, that the Plate is not projected either). The swap search and the final step have fixed work caps (`SEARCH_WORK_CAP` 8M,
  `IMPROVE_WORK_CAP` 6M; every trial swap and each pass counts, so the cap bounds the time): a 128-entry draw takes
  about 1 to 1.5 s at most on a laptop, whatever the clubs. The cap is not only for odd cases: with organisations
  filled in it is reached in many ordinary inter-club events from about 30 entries in one or two clubs, and in almost
  every one from 64 entries (also in a few big events with no clubs, with no loss in separation there). Below the cap
  the result is the same as without it; at the cap the search stops and keeps the best arrangement it has seen, so a
  big club event can be slightly less well spread than an unlimited search would give. `BRACKET_DRAW_STATS` says
  whether the last draw reached a cap (for the tests; never saved).
- **Projected bracket.** Before the round robin, the print pack runs the same engine on placeholder entries ("A1",
  "B2", …), so the projected sheet shows the real placement, except that organisations are not known then.
- Tests: `tests/bracket-engine.test.js` (integrity, speed, the earlier engines in `tests/lib/bracket-reference.js` and
  `tests/lib/bracket-round6.js` as references) and `tests/projected-bracket.test.js`.

## Printed brackets (bracket-print.js)

Every knockout bracket except Group Boards (the main bracket, the Plate pool and the projected bracket printed before the
round robin, for Singles, Doubles and Teams) prints as **one two-sided sheet at one scale**. `bracket-print.js` is the
layout engine (`KBP`, loaded by `app.html` after `render.js` and by `tests/lib/load-app.js`); `app.html` builds the model
from the bracket (`KBP.fromBracket`) and the sheet chrome (`knockoutBracketSheetHTML`, `projectedBracketSheetHTML`).
The public viewer does not use it.

- **Geometry.** Laid out in millimetres at the legibility floor (7 pt names, 4.8 mm boxes, 1.6 mm inside a match, 3.0 mm
  between matches), then printed at one uniform scale `s = min(fit width, fit height, 2)`; `s >= 1` is legible. Every other
  text (match numbers, BYE, seeds, round labels, Final and Champion labels, title block, footer, the code's caption) stays at
  4.6 pt or more on a legible sheet: labels shrink to fit down to that, round names shorten ("R128", "QF"), and wider labels
  are centred over their box. Left and right halves run to the Final in the centre (finalists stacked, the gold Champion
  box under them, the title block above, sponsors and the QR code below, a 7 mm footer). Byes are collapsed (the entry
  starts in round 2 with a BYE tag); match numbers sit on the bracket joints and seeds outside the boxes. Box width comes
  from the widest name at bold weight; names over 24 characters are cut with a footnote (also in the Champion box) and
  printed in full in the footer; names wrap onto two lines when the sheet is short of width but not of height. The
  results cell is at least 4.2 x 4.8 mm and widens on spare width. `KBP.verify` checks a layout (overlaps, gap floors,
  items off the sheet, clipped text, the name and secondary-text floors).
- **Print font.** Barlow Semi Condensed (Copyright 2017 The Barlow Project Authors, SIL Open Font License 1.1; licence
  text in `docs/third-party/Barlow-OFL.txt`), Latin subset, weights 500 and 700, embedded in `app.html` as base64
  woff2 (about 61 KB) and used only on these sheets. Printing waits until both weights are loaded (`KBP.whenReady`:
  loads, waits, checks again). In a browser text is measured with a canvas in the names' own font stack, so a face that
  could not load is measured as the fallback that prints; in the test vm (no canvas) with the font's advance widths stored
  in `bracket-print.js` (within about 1 %).
- **Paper rule.** Recommended paper = the smallest of A4, A3, A2, A1 on which every two-sided bracket of the event is
  legible (`KBP.recommend`, worked out over all of them, so the pack and a bracket's full-page window share one answer).
  When a bracket being printed is not legible on the chosen size (`printSettings.koPaperSize`), printing (`runPrintPack`,
  `popoutPrint`) goes through `koPaperGate`, which opens a dialog: use the recommended size (this changes the event's
  saved paper size), split over N A4 sheets, or keep the size and shrink the chart to fit one sheet. When no size holds it
  at 7 pt (even A1 must shrink), the dialog says so and offers only Split and Shrink. Split (`KBP.splitPlan`): the outer
  rounds of each half in sections (L1, L2 ... left, R1 ... right, top to bottom) plus a Finals sheet, all at one scale; each
  section exit names its Finals match ("to Finals 5-1") and each first Finals box names its source ("L1 · 4-1"), with +
  marks where winners leave and enter. The answer is stored as
  `printSettings.koPaperChoice = {mode:'shrink'|'split', paper, rec}` and asked again when it no longer fits: another paper
  size (`setKoPaperSize` clears it), a different recommended size, or no split possible. The print stages show the fit
  check, a note for a shrunk or split chart, and a soft suggestion when names would print between 7 and 8 pt
  (`koPaperPanelHTML`; never printed).
- **Teams.** No markers on Teams round robin charts. In the knockout, `lineupReadyMatches` lists the matches whose two
  teams are known; Manage Tournament (and the full-page window's **Lineup sheets**) prints one or all ready sheets, and
  the printed state is kept in `lineupPrinted` (`"<bracket key>:<round>-<match>" -> "<teamA id>|<teamB id>"`). An
  empty lineup sheet (1 to 10 copies) is on the print stages and in Manage Tournament.
- **Other sheets.** The running order is one column per board (up to 8 on a sheet, groups in playing order, a tick box
  per match, a full column continues on the next sheet, a group is never split). The Group Boards Finals sheet keeps its
  layout and prints "Winner of" over "Group N" (`gbPlaceholderHTML`).
- `tournament-sanitize.js` cleans `koPaperSize`, `koPaperChoice` and `lineupPrinted`.
- Tests: `tests/printed-brackets.test.js`. The 67-entry simulation (`node scripts/sim/run-simulation.js`) prints every
  format before and after play and audits the pages in a headless browser (`docs/design/simulation/`).

Spec: `docs/superpowers/specs/2026-10-22-printed-brackets-design.md`.

## Group Boards format

For big fields, choose **Knockout**, then **Group Boards, then finals**, at Format & branding (it is a Knockout option, stored
as `formatType: 'podknockout'`, and never offered with the round robin formats). Players are dealt into a chosen number of
**groups** (for example 64 groups for 540 players). Each group is a small knockout on its own board, and every
group winner goes through to a **Finals** bracket whose chart exists, with "Winner of Group N" slots, before any
group finishes. Seeds are spread one per group, club-mates are kept apart where possible, and players can be
moved between groups by hand until the groups are confirmed. The public results page gets a group picker (Finals,
all groups, or one group).

The logic is in `pods.js` (internally "pods", so it never clashes with the round-robin `state.groups`) and the
screens in `pods-ui.js`. Spec: `docs/superpowers/specs/2026-10-06-group-boards-design.md`.

### Board schedule

For Group Boards events the organiser keeps a board plan (`boardplan.js`): each board's
queue of matches, groups in order and then the Finals, with who is **up now** and **next**.
Set an **anticipated start time** in Format & branding to add estimated times; they are
labelled "~", rounded to 5 minutes, and re-based on when results were really entered.

- **Manage tournament → Boards:** per-board cards with **Call**, **Enter result** and
  **No-show**, and a Finals boards box so the final can go on a feature board.
- **Public results:** a **Boards** tab (and a TV view at `<viewer>/live/<code>#/boards?tv=1`
  that pages through six boards at a time), a "Board 3 · 2 matches ahead · ~7:40 pm" line on
  player pages, and a start time on each group.
- **Print:** optional **Players A–Z** and **Boards** sheets for the wall (toggles in Print).
  While **Public results** is on (and the viewer address is set), both sheets carry a QR code and the
  link to the live results page in their header, so players can scan it and follow their own board.
  Every sheet in the pack and every group and knockout chart sheet carries one, and each code opens that sheet's own
  screen: a round-robin group sheet opens that group, a Group Boards group sheet opens that group's bracket, the Finals
  sheet opens the Finals, the Boards sheet opens the Boards tab, and the Players sheet opens the event. The address
  printed beside the code is always the short event link.
  The code is made by `qr.js`, a small built-in generator, so printing needs no internet connection.

The plan is rebuilt on every save and stored with the tournament; the viewer only displays it.
Deploy the organiser first, then the viewer (each deploys from `main`). An older tournament
gets its plan on its next save, and the viewer hides the Boards tab until then.

### Neither showed

If both players in a match fail to turn up, open the no-show picker on that match (or its
score dialog) and choose **Neither showed**. Nobody advances; the next opponent gets a bye. A
group whose final is void finishes with no winner, and its Finals slot reads "Group N: no
winner" and becomes a bye for the opponent. It works in every bracket (plain knockout, the
Plate, group brackets and the Finals) and can be reversed from the match's score dialog. Both
players are flagged as no-shows; reversing leaves those flags, as a corrected single no-show
does. The public results page shows "Neither attended" for such a match.

### Tests and local servers

- `npm test` runs every test (Node's built-in runner, no dependencies). `tests/golden/existing-formats.json`
  snapshots how the three older formats render; if you change them on purpose, regenerate it with
  `UPDATE_GOLDEN=1 npm test`.
- `node tests/dev/mock-organiser.js` serves the organiser app (`app.html`) at http://localhost:5393 (or `/app`) with
  in-memory storage and no login, for trying the screens in a browser.
- `npm run build-landing` regenerates the public pages (`index.html`, `features.html`, `how-it-works.html`, `help.html`, and their BM twins in `ms/`).
- `node tests/dev/make-sample-view.js 40 8 3` then `node tests/dev/mock-viewer.js` serves the public page for a
  sample Group Boards event at http://localhost:5392/live/testslug12.

## Features

- Round robin, knockout, and round robin → knockout tournament formats
- Winner pool / plate pool with configurable qualifier and plate cutoffs
- Singles, Doubles and Teams events; a Teams match is a list of segments (singles, doubles, trios, foursome) with an optional tie-breaker, scored as total legs
- Check-in tracking and no-show / walkover handling
- Disciplinary / incident log
- Printable draw sheets, chart sheets, rules sheets, and lineup/scorecard sheets for Teams

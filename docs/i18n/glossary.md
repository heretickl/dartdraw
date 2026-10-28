# DartDraw English to Bahasa Malaysia glossary (living reference)

Status: in use (i18n step 1, 2026-10-24). Copied from the proofread preview glossary
(`docs/design/i18n-preview/glossary.md`, final after the BM proofread of 2026-10-23 and two owner decisions the same day:
**bracket** (not *bagan*) and **board** / **Group Boards** (not *papan* / *Papan Kumpulan*)). This copy is the one to keep
up to date: every BM text on the site (the public pages, both Help pages, and later the apps) follows it. Section 6 gives
the final decision on each item the first translator marked **CHECK**. The style rules are in `style-rules.md`.

## 1. Register and style

- **Register:** polite and neutral, as on Malaysian government and bank websites. Address the reader as **anda**, in lower case
  ("akaun anda"). No *kamu*, *awak*, *korang* or *engkau*, no spoken forms (*beres*, *Ikut jadual*, bare *guna/pecahkan* in
  running text) and no Indonesian forms (*kata sandi*, *unduh*, *masuk log*, *surel*, *klik ganda*, *peringkat* for a
  ranking table).
- **Buttons and menus** use the bare or *-kan* imperative (Simpan, Cetak, Tambah, Padam, Log masuk, Tunjukkan, Catat
  insiden), like Malaysian apps (Maybank2u, MySejahtera, Google ms-MY). *Sila* only in full-sentence instructions and
  alerts ("Sila putarkan peranti anda..."), never on buttons.
- **Statements** in hints and Help use the full *meN-* verb ("anda boleh menggunakan A3"), and the passive where it reads
  naturally ("Skor disimpan…", "anda akan dilog keluar…").
- **"never" as a rule of the system** is *tidak akan* ("tidak akan dicetak"), not *tidak pernah* (which reads "has never
  happened").
- **"for you" / "by itself"** is *secara automatik* (not *untuk anda*), except in marketing headlines.
- **Spelling** follows DBP: *e-mel*, *kata laluan*, *muat turun*, *muat semula*, *dikemas kini*, *tetingkap timbul*,
  *pelayar*, *kod QR*, *PDF*, *Wi-Fi*, *log masuk / log keluar / dilog keluar*.
- **Capitals:** sentence case, as in the English UI. Stage names keep their capitals wherever they are named, also inside
  buttons ("Kembali ke Urus Kejohanan"). Feature names keep capitals: *Group Boards* (kept in English), *Peringkat Akhir*, *Plate*.
- **Classifiers:** an entry is *setiap/satu peserta*, never *seorang peserta* when the entry is a pair or a team.
- **Names in examples:** Malaysian. Malay names have no surname, so pair names are "gabungan nama mereka (contohnya
  Hakim / Iskandar)", never *nama keluarga*.

## 2. Dates, times and numbers

| Item | Convention | Reason |
|---|---|---|
| Date (numeric) | **dd/mm/yyyy**, e.g. 07/11/2026 | The Malaysian standard on forms, receipts and MyKad. `Intl.DateTimeFormat('ms-MY')` gives `23/10/2026`. |
| Date (in text) | **7 Nov 2026** / **7 November 2026**; weekday short forms Isn, Sel, Rab, Kha, Jum, Sab, Ahd | Month names: Januari, Februari, Mac, April, Mei, Jun, Julai, Ogos, September, Oktober, November, Disember (short: Jan, Feb, Mac, Apr, Mei, Jun, Jul, Ogo, Sep, Okt, Nov, Dis, as ms-MY). |
| Time (UI) | **12-hour, `7:10 PTG` / `9:30 PG`** from `Intl` ms-MY | This is what Malaysian phones set to BM show, and Malaysians read event times in 12-hour form. Do not build it by hand. |
| Time (prose) | **7.10 malam**, **9.30 pagi**, **2.15 petang** | DBP written style (full stop, period word). PTG covers every PM on screen; in prose, 7 pm onward is *malam*. |
| 24-hour | Only in `<input type=time>` (follows the device) | |
| Numbers | Decimal point ".", thousands "," (1,250) | Same as English in Malaysia. |
| Scores | "3–1", "7–3" unchanged; nil = *sifar* in prose | |
| Ordinals | "ke-1", "ke-2", "tempat ke-3"; "Pusingan 1" | |
| Paper | A4, A3, A2, A1; *melintang* (landscape), *menegak* (portrait) | |
| Durations | "~3 jam 30 min" | |

The English screens (viewer and organiser app) still show a stored date the way they always did (`2026-11-07`, the device's
time format): changing English to dd/mm/yyyy needs the owner's approval, so only BM uses the conventions above
(`ddDateNum`, `ddClock` / `ddClockMs` in the i18n runtimes).

## 3. Darts words that stay in English

Malaysian darts players and organisers say these in English, even in BM. Write them in lower case inside BM sentences,
no italics, no plural ("5 leg", "2 bye"):

**leg, set, bye, seed, walkover (WO), bullseye/bull, oche, double, treble, checkout, 501/301/701/1001, round robin, Plate, H2H, TB, bracket, board** (owner decision 2026-10-23 for **bracket** and **board**; the feature name **Group Boards** also stays English)

- Give a short BM gloss on first use in Help only: *seed* "(seed ialah peserta pilihan)", *bracket* "bracket (carta kalah mati)"
  on its first running-text mention in every Help article, viewer Help question and public page, *pencatat skor* "(marker)", *borang barisan* "(lineup sheet)", head-to-head after *keputusan perlawanan sesama
  mereka*. Not in the UI.
- *seed* as a verb takes BM affixes around the loan: *diberi seed*, *seed ditetapkan*, *Gunakan seed untuk bracket ini*.
  Never "seed mengikut…" or "Seed bracket ini".

## 4. Terms

| English | Bahasa Malaysia | Notes |
|---|---|---|
| tournament | **kejohanan** | "Nama kejohanan" |
| event | **acara** | |
| entry / entries | **peserta** | The competing unit (player, pair or team). "Number of entries" = *Bilangan peserta*; "Entry 9" = *Peserta 9*. "big field" = *peserta ramai* (not *penyertaan yang besar*). |
| player / pair / team | **pemain / pasangan / pasukan** | |
| Singles / Doubles / Teams (competition type) | **Perseorangan / Beregu / Berpasukan** | |
| Singles / Doubles / Trios / Foursome (segments) | **Perseorangan / Beregu / Trio / Berempat** | |
| Open / Women / Youth | **Terbuka / Wanita / Belia** | |
| organiser / spectator / Admin | **penganjur / penonton / Pentadbir** | |
| organisation / club | **organisasi / kelab** | "same-organisation clashes" = *pertembungan sesama organisasi*; "Track organisation" = *Rekodkan organisasi* |
| round robin | **round robin** | |
| knockout | **kalah mati** | |
| bracket | **bracket** (UI, labels, sheet titles); **bracket (carta kalah mati)** on first mention in running text, then *bracket* (or *carta kalah mati* where a full sentence reads better) | Owner decision: *bagan* rejected. "Bracket size" = *Saiz bracket*; "Nearest bracket:" = *Saiz bracket terdekat:*; "16-entry bracket" = *Bracket 16 slot*; "Main bracket" = *Bracket utama*; "Winners bracket" = *Bracket pemenang*; "Single bracket" = *Satu bracket*; "knockout bracket" = *bracket kalah mati*; "Print bracket pack" = *Cetak set bracket*; "Generate bracket" = *Jana bracket* |
| chart (group sheet) | **carta** | |
| two-sided chart (left and right halves) | **bracket kalah mati dua bahagian** / *carta dua bahagian* | Never *dua belah* (= duplex printing) |
| draw (making the draw) | **undian** (noun); **membuat undian** (active verb); **diundi** (passive only) | Never active *mengundi* (= to vote). "Draw groups" = *Buat undian kumpulan*; "Redraw groups" = *Buat undian semula*; "Random draw" = *Undian rawak*; "the draw is out" = *undian telah dibuat* |
| draw (a level match) | **seri** / **keputusan seri** | ONLY a drawn match |
| tie / level on points (standings) | **sama mata** / **kedudukan sama mata** | Never *keputusan seri*. "Resolve ties" = *Selesaikan kedudukan sama mata*; "the tie on the cut-off line" = *peserta yang sama mata pada garisan kelayakan* |
| group / board | **kumpulan / board** | Owner decision: *papan* rejected; Malaysian players say "board". No plural: "Board 3", "bilangan board", "setiap board", "di board mana", "Bilangan board tersedia"; "feature board" = *board utama*; "Finals boards" = *Board Peringkat Akhir*; Boards tab/card/sheet = *Board* |
| Group Boards (feature) | **Group Boards** | Owner decision: the English feature name stays ("Acara Group Boards", "kumpulan Group Boards") |
| round / Round of 16 / R16 | **pusingan / Pusingan 16 terakhir / P16** | |
| quarterfinal / semifinal / final | **suku akhir / separuh akhir / akhir** | No abbreviations (S/Akhir is ambiguous); fix the boxes instead |
| Finals (Group Boards finals) | **Peringkat Akhir** | |
| champion / runner-up / winner | **juara / naib juara / pemenang** | |
| best of 5 (legs) | **terbaik daripada 5 leg** | Field label: **Leg (terbaik daripada)**; "first to 3" = *pemenang memerlukan 3 leg*; "set best-of legs" = *tetapkan bilangan leg (terbaik daripada)*; "knockout leg progression" = *leg mengikut pusingan kalah mati* |
| leg / legs won / leg difference / legs lost | **leg / leg dimenangi / beza leg / leg kalah** | Never *leg dikalahkan* |
| match / game / fixture | **perlawanan** | Lineup header "Game No." = **Bil.** |
| score / result / scoring | **skor / keputusan / sistem mata** | Not *pemarkahan* (school marks) |
| seed / Number of seeds / Seeded by group standing | **seed / Bilangan seed / Seed ikut kedudukan kumpulan** | |
| bye / walkover | **bye / walkover (WO)** | "walkover loss" = *kalah walkover* |
| no-show / Mark no-show… / Neither showed | **tidak hadir / Tandakan tidak hadir… / Kedua-dua tidak hadir** | Tag NO-SHOW = **TIDAK HADIR**; noun *ketidakhadiran* |
| withdraw / withdrawn / Withdraw the N not checked in | **Tarik diri / Menarik diri / Keluarkan N yang belum daftar masuk** | *tarik diri* never takes an object |
| check-in / Check in all | **daftar masuk / Daftar masuk semua** | |
| confirm / un-confirm | **sahkan / Batal pengesahan** | |
| finalize / finalized / Final results | **muktamadkan / dimuktamadkan / Keputusan muktamad** | |
| standings / position | **kedudukan** | |
| points / Pts | **mata / Mata** | |
| MP / MW / ML / MD / LW / +/- / Pts | **Main / M / K / S / LM / +/- / Mata** | |
| head-to-head (rule) / H2H badge | **Keputusan pertemuan (head-to-head) / H2H** | Never *bersemuka*. Owner chose this on 2026-10-29 (was *Keputusan perlawanan sesama mereka*) |
| TB / LD / LW badges / 3-way LD | **TB / BL / LM / BL 3 hala** | |
| tie-break order / tie-breaker | **susunan pemecah seri / pemecah seri** | Bar TIE-BREAKER = **PEMECAH SERI** |
| Provisional | **Sementara** | |
| segment | **segmen** | |
| lineup sheet / Print lineup | **borang barisan / Cetak borang** | |
| marker (scorer) | **pencatat skor** (sheet: *Pencatat*) | |
| Plate pool | **saingan Plate** | |
| qualifiers / advance | **yang layak / mara** | |
| running order | **susunan perlawanan** | |
| rules sheet / pack | **helaian peraturan / set cetakan** | |
| footer / Sponsor footer | **kaki halaman / Kaki halaman penaja** | Never *kaki penaja* (kaki = fan) |
| publish / List on the public page | **Terbitkan / Senaraikan di halaman awam** | "the listing" = *penyenaraian* |
| take offline | **jadikan … luar talian** | |
| live / Upcoming / Results | **Langsung / Mendatang / Keputusan** | |
| On schedule / Running behind | **Menepati jadual / Ketinggalan jadual** | |
| Starting soon / Offline / Reconnecting | **Akan bermula / Luar talian / Menyambung semula** | |
| QR code / link / Copy link | **kod QR / pautan / Salin pautan** | |
| Me / Following / Follow / This is me | **Saya / Diikuti / Ikuti / Ini saya** | |
| log in / log out / sign in / signs you out | **log masuk / log keluar / log masuk / anda akan dilog keluar** | Never *melog keluar anda* |
| password / email | **kata laluan / e-mel** | |
| Need an account? / Sign up | **Belum ada akaun? / Daftar** | |
| save / Saved / Saved tournaments | **simpan / Disimpan / Kejohanan yang disimpan** | |
| Fetching… / Loading… | **Memuatkan…** | |
| incident log / Log incident | **log insiden / Catat insiden** | "Log" is a noun only |
| print / Save as PDF / download | **cetak / Simpan sebagai PDF / muat turun** | |
| pop-up / browser / window / tab | **tetingkap timbul / pelayar / tetingkap / tab** | |
| full-page window / re-fits | **tetingkap skrin penuh / dilaraskan semula** | not *dimuatkan semula* (= reloaded) |
| Flat list / Grouped view | **Senarai penuh / Paparan kumpulan** | |
| Setup mode: Basic / Advanced | **Mod persediaan: Asas / Lanjutan** | |
| Edit / Rename / Duplicate / Delete | **Edit / Namakan semula / Salin / Padam** | |
| Undo / Reverse it / Reset all | **buat asal / Batalkan / Set semula semua** | |
| branding / logo / sponsor | **penjenamaan / logo / penaja** | |
| Help / Features / How it works | **Bantuan / Ciri-ciri / Cara guna** | |

## 5. Stage names (sidebar, compact bar, Help)

| # | English | BM |
|---|---|---|
| 1 | Event creation | Cipta acara |
| 2 | Format & branding | Format & penjenamaan |
| 3 | Chart details | Butiran carta |
| 4 | Confirm & Print Bracket | Sahkan & Cetak Bracket |
| 5 | Manage Tournament | Urus Kejohanan |
| 6 | Finalize Standings | Muktamadkan Kedudukan |
| 7 | Print Final Chart | Cetak Carta Akhir |

The UI string table is `ui-strings-ms.js` (in this folder; the BM of every on-screen label, the draft for the app step).
Labels the Help needed that the table did not have are in `ui-strings-needed.md`. Layout findings from the preview:
`docs/design/i18n-preview/layout-check.md`.

## 6. Final decisions on the items marked CHECK

| # | Item | Decision | Reason (and what players say) |
|---|---|---|---|
| 1 | seed | **Keep "seed"**; gloss once in Help "(seed ialah peserta pilihan)"; verb forms *diberi seed*, *Gunakan seed untuk bracket ini* | Players and organisers say "seed"; the press word *pilihan* already means "choice/optional" all over this UI. |
| 2 | round robin | **Keep "round robin"** | It is what Malaysian darts leagues call the format; *liga* means a season-long league, *pusingan kumpulan* hides the everyone-plays-everyone rule. Help already explains it. |
| 3 | bracket / chart | **bracket / carta**; first running-text mention "bracket (carta kalah mati)" | **Owner decision (2026-10-23): *bagan* rejected**, because Malaysian players say "bracket". The proofreader had kept *bagan* (DBP-correct, but not everyday usage). *carta* stays for group charts; *undian* for the act of drawing. |
| 4 | Final results | **Keputusan muktamad** | Pairs with *muktamadkan*; *akhir* clashes with the Final and *kedudukan akhir*; *rasmi* implies a governing body's sanction. |
| 5 | Group Boards | **Group Boards** (English feature name) | **Owner decision (2026-10-23)**, together with *board* for every dartboard (*papan* rejected) because Malaysian players say "board". |
| 6 | Plate pool | **saingan Plate** | "Plate" is the familiar consolation name; *saingan* (competition) is clear. |
| 7 | Table headings | **Main / M / K / S / LM / +/- / Mata**; badges **H2H, BL, LM, BL 3 hala** | Malaysian football tables use *Main, Menang, Seri, Kalah, Mata*; *3 hala* is short and clear. |
| 8 | head-to-head | **Keputusan pertemuan (head-to-head)** (badge H2H; owner 2026-10-29, was *Keputusan perlawanan sesama mereka*) | *bersemuka* means meeting in person; Malaysian competition rules write "keputusan perlawanan sesama pasukan terbabit". Players say "head-to-head". |
| 9 | marker | **pencatat skor** (sheet: *Pencatat*), gloss "(marker)" once | Correct BM, clear to everyone; clubs say "marker". |
| 10 | Trios / Foursome | **Trio / Berempat** | *Trio* is BM (DBP); *Berempat* follows *Beregu*. |
| 11 | Upcoming | **Mendatang** | Standard ("acara mendatang") and one word on a 390 px phone. |
| 12 | Round of 16 / R16 / Quarters / Semis | **Pusingan 16 terakhir / P16 / Suku akhir / Separuh akhir** | Malaysian press form. No short forms for quarter/semi; the printed label and the viewer buttons need the layout fix (layout-check #1, #2). |
| 13 | Game No. (lineup sheet) | **Bil.** | Standard Malaysian form heading for a number; fits the 73 px box; *No. Permainan* touched both edges and repeats the Fixture box (*Perlawanan*). |
| 14 | Save event creation → | **Simpan butiran acara →** | Natural; *Simpan cipta acara* is ungrammatical. |
| 15 | Stage names | **As in section 5** (step 4 = *Sahkan & Cetak Bracket*) | Fit every bar measured; capitals follow the English. |
| 16 | Running behind / On schedule | **Ketinggalan jadual / Menepati jadual** | The set Malaysian phrases; *Ikut jadual* is spoken style. |
| 17 | Novice / Disqualification / Synced | **Novis / Hilang kelayakan / Diselaraskan dengan akaun anda** | DBP *novis*; *hilang kelayakan* is the Malaysian sports-news phrase; synced is fine. |
| 18 | v (versus) | **lwn** | Standard Malaysian fixtures ("Malaysia lwn Thailand"). |
| 19 | Time style | **7:10 PTG / 9:30 PG** on screen (Intl ms-MY); **7.10 malam** in prose | Matches Malaysian phones in BM; prose follows DBP. No 24-hour for spectators. |
| 20 | entry | **peserta** | Shorter and clearer; *penyertaan* = registration. Classifier *setiap/satu peserta*. |
| 21 | Headline with "oche" | **"Kurang masa menyediakan carta. Lebih masa di oche."** | Darts players know "oche"; it is the payoff of the line. "pada carta" was literal. |
| 22 | walkover / no-show / Neither showed | **walkover (WO) / tidak hadir / Kedua-dua tidak hadir** | As Malaysian football ("menang walkover"). |

## 7. Decisions from the step 1 proofread (2026-10-24, `PROOFREAD-STEP1.md`)

| English | Bahasa Malaysia | Notes |
|---|---|---|
| later (matches/results after this one) | **berikutnya** | Never *kemudian* as an adjective ("2 keputusan berikutnya", "setiap perlawanan berikutnya") |
| by itself / on its own (pages, messages) | **secara automatik** | Never *… sendiri* ("dimuat semula secara automatik", "hilang secara automatik") |
| … instead (button) | **… sebagai gantinya** | "Tandakan tidak hadir sebagai gantinya"; in prose *sebaliknya* only for "on the contrary" |
| one after another (groups sharing a board / segments) | **secara bergilir-gilir** / **berturut-turut** | *satu demi satu* only for "one by one" actions |
| table (standings) | **jadual kedudukan** | Bare *jadual* reads "schedule" |
| keep (a window on one device) | **buka / biarkan** | Never *Simpan* (= save) |
| Won 2–0 by walkover / Lost 0–2 by walkover | **Menang walkover 2–0 / Kalah walkover 0–2** | As Malaysian sports reports |
| N match(es) ahead | **selepas N perlawanan** | Neutral: the page is about any player |
| Scores last changed / Last checked | **Perubahan skor terakhir / Semakan terakhir** | "Skor terakhir" alone reads "the last score" |
| Words you will see | **Istilah yang akan anda lihat** | Aspect word before the pronoun |
| fixture (Teams) | **perlawanan** (gloss "(fixture)" once) | |

## 8. Decisions from the steps 2-5 proofread (2026-10-25, `PROOFREAD-STEPS-2-5.md`)

These cover the viewer, the organiser app, the printed sheets, the sign-in pages, the server messages and the e-mails.

| English | Bahasa Malaysia | Notes |
|---|---|---|
| level on N pts (tie notes, ties box) | **sama mata dengan N mata** | Malaysian sports style ("sama mata dengan 10 mata"). Never *sama N mata*, which is a calque |
| won their match (head-to-head note) | **menang dalam perlawanan antara mereka** | *menang perlawanan itu* left unclear which match |
| Draw next / Knockout draw next (home stage cards) | **Menunggu undian / Menunggu undian kalah mati** | *Undian seterusnya* reads "the next draw" |
| Finals next | **Seterusnya: Peringkat Akhir** | *Peringkat Akhir seterusnya* reads "the next Finals" |
| all matches played (status line) | **semua perlawanan telah dimainkan** | A finished state takes *telah* |
| Where they finished in their group (seed key) | **Kedudukan akhir mereka dalam kumpulan** | |
| the organiser's ranking (seed key) | **kedudukan yang ditetapkan oleh penganjur** | |
| Finals sheet / to Finals 5-1 » (split brackets) | **helaian Akhir / ke Akhir 5-1 »** | One name in the paper dialog, on the sheets and in Help. *Peringkat Akhir* stays for the Group Boards Finals. The exit label must not be wider than the English |
| section / left half / right half (split sheets) | **seksyen / bahagian kiri / bahagian kanan** | Help uses the same words as the sheet heads |
| Gp 3 winner / Gp 3: none (one-line Group Boards box) | **Pemenang K3 / K3: tiada** | Kept for width; CHECK with an organiser (fallback *Kump. 3* if it fits) |
| Players / seeded by group finishing position (rules sheet) | **diberi seed mengikut kedudukan akhir dalam kumpulan** | The verb form from section 3 |
| Show (button) | **Tunjukkan** | Buttons take *-kan* |
| table (in prose: "tap a name in a table") | **jadual kedudukan** | As section 7 |
| Withdraw {name}? (dialog title) | **{name} menarik diri?** | *tarik diri* never takes an object |
| Withdrawing now would… | **Jika {name} menarik diri sekarang, …** | Says who withdraws |
| When (incident log column) | **Masa** | *Bila* is a question word |
| an event (fallback name) | **satu acara** | Classifier: not *sebuah* |
| asterisk | **tanda bintang** | |
| master running order sheet | **helaian induk susunan perlawanan** | |
| Could not change the password (app and server) | **Kata laluan anda tidak dapat ditukar. Sila cuba lagi.** | One sentence for both the app fallback and the server's 500 answer |
| must be at most N characters | **tidak boleh melebihi N aksara** | Not *mesti tidak melebihi*; also for the name limit (80) |
| Sign-up is not open yet | **Pendaftaran masih ditutup.** | Avoids *dibuka* twice next to "Akaun dibuka oleh pentadbir laman." |
| Too many attempts. Try again later. | **Terlalu banyak percubaan. Sila cuba lagi kemudian.** | *kemudian* as an adverb ("later") is correct BM; only the adjective use is a calque (section 7) |
| changed … from somewhere else | **ditukar di tempat lain** | Same as "Dikemas kini di tempat lain" |
| Missing id / Missing tournament data | **ID tidak diberikan / Data kejohanan tidak diberikan** | |
| e-mail subjects | **"English / BM"**, BM halves: *Sahkan e-mel DartDraw anda*, *Tetapkan semula kata laluan DartDraw anda*, *Akaun DartDraw anda* | Confirmed unchanged |
| Hello {name}, (invite) | **Salam sejahtera {name},** | Confirmed |
| TBA (home date tile) | **TBA** | Kept: Malaysian event posters use it and no BM word fits the 52 px tile |
| "own" (on their own boards) | **di board sendiri / masing-masing** | *sendiri* meaning "own" is correct; the section 7 rule is only about "by itself" |

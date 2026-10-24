# BM UI strings the Help needed (final after the BM proofread of 2026-10-24)

i18n step 1 (2026-10-24) translated the public pages and both Help pages. Where the English Help names an on-screen
button, label or message, the BM Help uses the string from `ui-strings-ms.js`. These labels were not in the proofread
table (the preview's 31 screens did not show them), so they were coined for the Help, following `glossary.md`, and added
to `ui-strings-ms.js` in the block "Added in i18n step 1". The BM proofread of 2026-10-24
(`PROOFREAD-STEP1.md`) gave every one a **final** form. When the organiser app and the viewer are translated, use
exactly these strings (or change them here, in `ui-strings-ms.js` and in the BM Help together: the Help quotes them
word for word, and `tests/i18n-pages.test.js` checks the organiser Help against `ui-strings-ms.js`).

Status: **final** = decided by the proofread (the note says what changed, if anything); **fixed** = a straight form of a
word already in the glossary.

| English (as in the app) | BM (final) | Where | Status / proofread note |
|---|---|---|---|
| Publish results now | Terbitkan keputusan sekarang | step 4 note above the print button | final (unchanged) |
| Publishing is off, so these sheets will have no QR code | Penerbitan dimatikan, jadi kod QR tidak akan dicetak pada helaian ini | step 4 note | final (was "...helaian ini tidak akan mempunyai kod QR": says plainly what the organiser loses) |
| Get started | Bermula | welcome-screen card heading | final (unchanged; the Microsoft ms-MY term for "Get started") |
| Try a sample event | Cuba acara contoh | Get started card | final (unchanged) |
| Save as my event | Simpan sebagai acara saya | sample-event banner | final (unchanged) |
| Close sample | Tutup acara contoh | sample-event banner | final (was "Tutup contoh": "contoh" alone reads "close the example") |
| This is a sample event. Nothing is saved. | Ini acara contoh. Tiada apa-apa yang akan disimpan. | sample-event banner | final (was "...yang disimpan": "nothing has been saved"; the system rule needs *akan*) |
| Results finalized | Keputusan dimuktamadkan | after Accept & finalize | final (unchanged) |
| No account yet? Accounts are created by the site admin. | Belum ada akaun? Akaun dibuka oleh pentadbir laman. | sign-in box, landing page | final (unchanged; *buka akaun* is the everyday Malaysian phrase) |
| Sign in / Log in / Sign up / Forgot password? | Log masuk / Log masuk / Daftar / Lupa kata laluan? | sign-in box (from the preview's pop-up) | fixed |
| Number of pairs / Number of teams | Bilangan pasangan / Bilangan pasukan | step 1 | fixed |
| Pair name / Team name | Nama pasangan / Nama pasukan | step 3 | fixed |
| Best of legs | Leg (terbaik daripada) | step 2 (the table had only the long label) | fixed |
| These entries are already playing | Peserta ini sudah mula bermain | step 1, lowering the number of entries | final (was "sudah bermain", which also reads "have already played") |
| Board(s) | Board | step 3 grouped view | fixed |
| Players A–Z | Pemain A–Z | Group Boards print sheet | fixed |
| Confirm all N charts / Split over N A4 sheets / Withdraw the N not checked in | Sahkan kesemua N carta / Pecahkan kepada N helaian A4 / Keluarkan N yang belum daftar masuk | (patterns in the table) | fixed |
| Clear result | Kosongkan keputusan | score box | final (unchanged; *Padam* would suggest the match is deleted) |
| Clear this result? | Kosongkan keputusan ini? | confirm box | final (unchanged) |
| Change result | Tukar keputusan | knockout cascade box | final (unchanged) |
| Changing this result will clear 2 later results, and you will need to enter them again | Menukar keputusan ini akan mengosongkan 2 keputusan berikutnya, dan anda perlu memasukkannya semula | knockout cascade box | final (was "2 keputusan kemudian", a calque of "later results") |
| Neither showed | Kedua-dua tidak hadir | no-show box | fixed (glossary) |
| Mark no-show instead | Tandakan tidak hadir sebagai gantinya | Withdraw refusal box | final (was "...sebagai ganti": *ganti* after a verb phrase needs *-nya*) |
| undo | buat asal | no-show box link | fixed (glossary) |
| Go there | Pergi ke sana | steps 6 and 7 | final (unchanged) |
| To finish the event, use Accept & finalize at the bottom of step 5 | Untuk menamatkan acara, gunakan Terima & muktamadkan di bahagian bawah langkah 5 | steps 6 and 7 | final (unchanged) |
| Finalized events can only be renamed by an Admin. | Acara yang telah dimuktamadkan hanya boleh dinamakan semula oleh Pentadbir. | Saved tournaments | final (unchanged) |
| This is a knockout match — it can't end level. | Ini perlawanan kalah mati — ia tidak boleh berakhir seri. | Teams result box (from the preview Help) | fixed |
| Singles 1 (lineup bar) | Perseorangan 1 | lineup sheet | fixed |
| Print all ready lineup sheets | Cetak semua borang barisan yang sedia | Lineup sheets card (pattern in the table) | fixed |
| * Position set manually by organiser | * Kedudukan ditetapkan secara manual oleh penganjur | printed chart footnote | final (unchanged) |
| Main bracket (projected) | Bracket utama (unjuran) | print pack | fixed |
| Called / Called — go to Board N | Dipanggil / Dipanggil — pergi ke Board N | Boards card, viewer Boards tab | final (unchanged) |
| Scores last changed / Last checked | Perubahan skor terakhir / Semakan terakhir | viewer event header | final (was "Skor terakhir diubah / Kali terakhir disemak": "skor terakhir" reads "the last score"; two parallel noun labels before a time) |
| What do the columns mean? / What do the labels mean? | Apakah maksud lajur? / Apakah maksud label? | viewer keys under tables and brackets | final (unchanged) |
| Try again | Cuba lagi | viewer home failure state | fixed |
| Got it | Faham | viewer New here? card | final (unchanged) |
| Back to the event | Kembali ke acara | viewer Help | final (unchanged) |
| New here? Three things to know | Baru di sini? Tiga perkara yang perlu diketahui | viewer home and Help | final (unchanged) |
| Top 2 in each group go through to the knockout | 2 teratas setiap kumpulan mara ke peringkat kalah mati | viewer line above group tables | final (added *peringkat*: "mara ke kalah mati" is clipped) |
| opponent not decided yet / did not show / Winner of | lawan belum ditentukan / tidak hadir / Pemenang | viewer player page, bracket | final (unchanged) |
| Won 2–0 by walkover / Lost 0–2 by walkover | Menang walkover 2–0 / Kalah walkover 0–2 | viewer player page | final (was "Menang 2–0 melalui walkover": Malaysians say *menang walkover*, glossary #22) |
| Board 2 · 1 match ahead · ~7:50 pm | Board 2 · selepas 1 perlawanan · ~7:50 PTG | viewer player page | final (was "1 perlawanan sebelum anda": the page is about any player, not the reader) |
| Next: Semifinal (3-1) vs Leo Ahmad | Seterusnya: Separuh akhir (3-1) lwn Leo Ahmad | viewer player page | final (unchanged) |
| Knockout: best of 3 legs, final best of 5 | Kalah mati: terbaik daripada 3 leg, perlawanan akhir terbaik daripada 5 | viewer header legs line | final (bare *akhir* is ambiguous) |
| EN / BM switch: Language / Bahasa, English, Bahasa Malaysia | (the same in both languages) | every public page and Help page | fixed |
| Bahasa Malaysia tersedia — Tukar ke BM (title: Switch to Bahasa Malaysia) | (BM on the English pages) | note on the English pages | final (unchanged) |

## Help headings and running labels (not app strings, decided in the same proofread)

| English | BM (final) | Note |
|---|---|---|
| Quick start | Mula pantas | as Malaysian product manuals ("Panduan Mula Pantas") |
| Words you will see | Istilah yang akan anda lihat | was "...yang anda akan lihat": the aspect word goes before the pronoun (DBP) |
| When something goes wrong | Apabila berlaku masalah | unchanged |
| Start here | Mula di sini | unchanged |
| Stuck? | Ada masalah? | unchanged |

Not translated in step 1 (still English on the BM pages, by design of the step): the sign-in pop-up (`login.html`), the
organiser app, the viewer's home and event pages, printed sheets and server messages. The BM Help names their BM labels
above, so until those steps ship a BM reader sees English buttons with BM names in the Help: see the interim
recommendation in `PROOFREAD-STEP1.md`.

## i18n step 2 (2026-10-24): the public viewer's screens

The viewer's home and event pages are now translated. Their strings live in `viewer/i18n/en.js` / `viewer/i18n/ms.js` (stable
keys, `{placeholders}`), and the words `render.js` draws (tables, tie notes, charts) in `DD_RENDER_EN` (inside `render.js`) /
`i18n/render.ms.js`. Every label above that the viewer shows is used **exactly** (`tests/viewer-i18n.test.js` checks each quoted
label of `viewer/ms/help.html` against the BM screens). The labels below were **coined in step 2** (the preview had not
captured them) and need the BM proofreader. Keys in brackets.

| English (as on the page) | BM (coined) | Note |
|---|---|---|
| No results link / Open the link the organiser shared with you. | Tiada pautan keputusan / Buka pautan yang dikongsi oleh penganjur kepada anda. | (ev.msg.noLink*) fallback page only |
| This link isn't valid, or the organiser has taken the results offline. | Pautan ini tidak sah, atau penganjur telah menjadikan keputusan luar talian. | (ev.msg.goneText) the Help answer uses the same words |
| Check your connection — this page will keep trying. | Semak sambungan anda — halaman ini akan terus mencuba. | (ev.msg.failText) |
| The draw hasn't been made yet. Check back soon. | Undian belum dibuat. Sila semak semula sebentar lagi. | (ev.noDraw) *Sila* in a full-sentence instruction |
| Can't refresh right now. Trying again… / Retrying… | Tidak dapat memuat semula sekarang. Mencuba lagi… | (ev.offlineMsg, hm.retrying) |
| 2:32 pm (just now) / (4 min ago) | 2:32 PTG (sebentar tadi) / (4 min lalu) | (ev.chg.*) after *Perubahan skor terakhir* |
| Board and time for each match are announced at the venue. More | Board dan masa setiap perlawanan diumumkan di tempat kejohanan. Lagi | (ev.venue, ev.venueMore) |
| Out in the Semifinal · lost to X / … of Group 3 / … of the Finals | Tersingkir: Separuh akhir · kalah kepada X / Tersingkir: Separuh akhir, Kumpulan 3 · … / …, Peringkat Akhir · … | (ev.st.lost*) a colon avoids a case clash with the round name |
| … · neither player attended | … · kedua-dua pemain tidak hadir (pasukan in Teams) | (ev.st.outVoid*) |
| Won Group 3 · through to the Finals / Winner of the Main bracket | Menang Kumpulan 3 · mara ke Peringkat Akhir / Pemenang Bracket utama | (ev.st.wonPod, ev.st.winnerOf) |
| Won the Quarterfinal · waiting for the next round / Bye in the … | Menang: Suku akhir · menunggu pusingan seterusnya / Bye: Suku akhir · … | (ev.st.won, ev.st.bye) |
| Group A · not started yet / Group A: to play X, Y and 2 more | Kumpulan A · belum bermula / Kumpulan A: masih perlu menentang X, Y dan 2 lagi | (ev.st.*) the Help says "siapa yang masih perlu ditentang" |
| Group A: all matches played · 2nd place / · currently 2nd / · not in the knockout | Kumpulan A: semua perlawanan dimainkan · tempat ke-2 / · kini di tempat ke-2 / · tidak mara ke peringkat kalah mati | (ev.st.allPlayed*) |
| In this group: A, B. / No matches yet. | Dalam kumpulan ini: A, B. / Belum ada perlawanan. | |
| We can't find that player. They may have been taken out of the draw. | Kami tidak dapat mencari pemain itu. Pemain itu mungkin telah dikeluarkan daripada undian. | (ev.notFound.*) starts with the Help's quote |
| Are you playing? / Search for your name above and tap **This is me**. … | Adakah anda bermain? / Cari nama anda di atas dan ketik **Ini saya**. … | (ev.me.*) |
| Follow players to keep them all in one place. … / Stop following X / No player with that name. | Ikuti pemain untuk menyimpan mereka semua di satu tempat. … / Berhenti mengikuti X / Tiada pemain dengan nama itu. | (ev.fol.*, ev.find.none.*) |
| Top 2 in each group went through to the knockout. / The winner of each group goes through … | 2 teratas setiap kumpulan telah mara ke peringkat kalah mati. / Pemenang setiap kumpulan mara ke peringkat kalah mati. | (ev.q.*) the present form is the Help's quote |
| Places 3–4 play in the Plate pool; anyone below that is out. / Everyone else plays in the Plate pool. | Tempat ke-3 hingga ke-4 bermain dalam saingan Plate; yang di bawahnya tersingkir. / Semua yang lain bermain dalam saingan Plate. | (ev.q.plate*) |
| The green bar marks the places that go through. / Everyone in this group goes through. | Bar hijau menandakan tempat yang mara. / Semua dalam kumpulan ini mara. | (ev.q.key, ev.q.all) |
| Keys: Leg difference: legs won minus legs lost / Points: 2 for a win, 1 for a draw / Tie-break: why two players … / Read across from a player's row … | Beza leg: leg dimenangi tolak leg kalah / Mata: 2 untuk menang, 1 untuk seri / Pemecah seri: sebab dua pemain yang sama mata … / Baca ke kanan dari baris pemain … | (ev.key.*) "3-way" = **3 hala**, as in the Help |
| Match code: round 1, match 2 / Group 3's bracket, … / P for the Plate pool, then … | Kod perlawanan: pusingan 1, perlawanan 2 / bracket Kumpulan 3, … / P untuk saingan Plate, kemudian … | (ev.key.code*) |
| Filled in when that earlier match is played / … that group finishes / No opponent this round: straight through | Diisi apabila perlawanan sebelumnya dimainkan / … kumpulan itu selesai / Tiada lawan dalam pusingan ini: terus mara | |
| 4 to play / All matches on this board are finished. / The board schedule isn't available yet. / Page 1 of 2 | 4 belum dimainkan / Semua perlawanan di board ini telah selesai. / Jadual board belum tersedia. / Halaman 1 daripada 2 | (ev.bd.*) |
| Up now on Board 2 / Board 2 · waiting for an earlier match / starts ~7:10 pm | Sekarang di Board 2 / Board 2 · menunggu perlawanan sebelumnya / mula ~7:10 PTG | |
| Semifinal · 1 of 2 finished · current round | Separuh akhir · 1 daripada 2 selesai · pusingan semasa | (ev.doneOf, ev.rd.current) |
| Home: Nothing is live right now. / No upcoming events listed. / See upcoming events | Tiada acara langsung sekarang. / Tiada acara mendatang disenaraikan. / Lihat acara mendatang | (hm.empty.*) |
| No events match "x". Have a link or code? Paste it in the search box. / Other events / Untitled event | Tiada acara sepadan dengan "x". Ada pautan atau kod? Tampalkannya dalam kotak carian. / Acara lain / Acara tanpa nama | |
| Group stage / Knockout draw next / Finals next / stage complete / 45 percent played | Peringkat kumpulan / Undian kalah mati seterusnya / Peringkat Akhir seterusnya / peringkat selesai / 45 peratus dimainkan | (hm.prog.*, hm.next.*) |
| Draw next / Up next / Draw made / Not started yet / Today | Undian seterusnya / Seterusnya / Undian telah dibuat / Belum bermula / Hari ini | stage subcards, date heading |
| TBA (an upcoming event with no date) | TBA (kept) | **Proofreader**: keep, or a BM form that fits the 52 px date tile? |
| Can't load events right now. / Check your connection. We'll keep trying. | Tidak dapat memuatkan acara sekarang. / Semak sambungan anda. Kami akan terus mencuba. | home failure state |
| The New here? tips (3 home, 3 event), More help, What the colours and columns mean, Close this tip (it will not come back) | see hm.tip.*; Bantuan lanjut; Maksud warna dan lajur; Tutup petua ini (ia tidak akan dipaparkan lagi) | |
| render.js: Level on points after every tie-break rule / Mini-table: … only the matches between them count / Legs (mini-table) / Unknown | Masih sama mata selepas setiap peraturan pemecah seri / Jadual mini: … hanya perlawanan sesama mereka dikira / Leg / Tidak diketahui | (r.*) |
| render.js: A and B are still level on 4 pts after every tie-break rule — needs an organiser decision or a playoff. | A dan B masih sama 4 mata selepas setiap peraturan pemecah seri — memerlukan keputusan penganjur atau perlawanan penentuan. | (r.tie.levelPublic) |
| Chart: VS / FINAL / CHAMPION | LWN / AKHIR / JUARA | from the preview table; "LWN" is drawn at 7 px to fit its 15 px gap |

Known gap: the spectator Help (both languages) mentions "Reconnecting" / *Menyambung semula*, which the viewer never shows
(the page says Offline / *Luar talian*); left for a Help edit.

## i18n step 3 (2026-10-24): the organiser app

The organiser app (`/app`: `app.html`, `pods-ui.js`, `boardplan-ui.js`, `pods.js`) is now translated; its strings live in
`i18n/app.en.js` / `i18n/app.ms.js` (1020 keys). 400 BM values are the labels decided above or the viewer's / `render.js`'s
(so the organiser Help quotes them exactly: `tests/app-i18n.test.js`), 26 are the same in both languages on purpose
(Round robin, Board N, OK, Pro, Format, Logo, patterns). The **594 values below were coined in step 3** and need the BM
proofreader. Wording rules followed: `glossary.md` and `style-rules.md` (polite *anda*, bare-verb buttons, *lwn*, *ke-N*,
*sama mata*, *membuat undian*, *Keputusan muktamad*, *pencatat skor (marker)*, *peserta*). English plurals show the plural form;
`{name}` marks a value filled in. Not translated in step 3: the Admin panel (stays English), printed sheets (step 4), the
sign-in pop-up (step 5), server messages.

### Group Boards (92)

| English | BM (coined) | Key |
|---|---|---|
| A group can hold at most {n} players. | Satu kumpulan boleh memuatkan paling banyak {n} pemain. | `pods.groupFull` |
| Choose at least 2 groups. | Pilih sekurang-kurangnya 2 kumpulan. | `pods.min2` |
| Choose at most {n} groups. | Pilih paling banyak {n} kumpulan. | `pods.max` |
| Each group needs at least 2 players. {n} players can fill at most {m} groups. | Setiap kumpulan memerlukan sekurang-kurangnya 2 pemain. {n} pemain boleh mengisi paling banyak {m} kumpulan. | `pods.each2` |
| {full} {n} players need at least {m} groups. | {full} {n} pemain memerlukan sekurang-kurangnya {m} kumpulan. | `pods.tooBig` |
| Pick a different group. | Pilih kumpulan lain. | `pods.pickOther` |
| Both groups must be unconfirmed with no scores. | Kedua-dua kumpulan mesti belum disahkan dan tiada skor. | `pods.bothOpen` |
| A group needs at least 2 players. | Satu kumpulan memerlukan sekurang-kurangnya 2 pemain. | `pods.need2` |
| Pick players from two different groups. | Pilih pemain daripada dua kumpulan yang berbeza. | `pods.pickTwo` |
| This result would change who reaches the Finals, but a Finals match that depends on it already has a score. | Keputusan ini akan mengubah siapa yang mara ke Peringkat Akhir, tetapi perlawanan Peringkat Akhir yang bergantung padanya sudah mempunyai skor. | `pods.finalsScored` |
| Unknown group. | Kumpulan tidak diketahui. | `pods.unknown` |
| This group already has scores. | Kumpulan ini sudah mempunyai skor. | `pods.hasScores` |
| The Finals already has scores. | Peringkat Akhir sudah mempunyai skor. | `pods.finalsHasScores` |
| Pick a group. | Pilih kumpulan. | `pods.pickGroup` |
| That player is already in a group. | Pemain itu sudah berada dalam kumpulan. | `pods.alreadyIn` |
| That group is confirmed or already has scores. | Kumpulan itu telah disahkan atau sudah mempunyai skor. | `pods.locked` |
| Some players could not be removed: their group is confirmed, has scores, or would drop below 2 players. | Sesetengah pemain tidak dapat dikeluarkan: kumpulan mereka telah disahkan, mempunyai skor, atau akan menjadi kurang daripada 2 pemain. | `pods.stuck` |
| Choose how many groups. {nouns} are dealt into this many small knockouts, and each group winner goes through to the Finals. | Pilih bilangan kumpulan. {nouns} diagihkan kepada kumpulan kalah mati kecil mengikut bilangan ini, dan setiap pemenang kumpulan mara ke Peringkat Akhir. | `pods.chooseHow` |
| {p} groups of {sizes} {nouns}. Finals: a {size}-slot chart for {p} group winners. | {p} kumpulan berisi {sizes} {nouns}. Peringkat Akhir: carta {size} slot untuk {p} pemenang kumpulan. | `pods.summary` |
| {p} groups of {sizes} {nouns}. Finals: an {size}-slot chart for {p} group winners. | {p} kumpulan berisi {sizes} {nouns}. Peringkat Akhir: carta {size} slot untuk {p} pemenang kumpulan. | `pods.summaryAn` |
| {p} groups of {sizes} {nouns}. Finals: a {size}-slot chart for {p} group winners ({n} byes for the strongest groups). | {p} kumpulan berisi {sizes} {nouns}. Peringkat Akhir: carta {size} slot untuk {p} pemenang kumpulan ({n} bye untuk kumpulan terkuat). | `pods.summaryByes` |
| {p} groups of {sizes} {nouns}. Finals: an {size}-slot chart for {p} group winners ({n} byes for the strongest groups). | {p} kumpulan berisi {sizes} {nouns}. Peringkat Akhir: carta {size} slot untuk {p} pemenang kumpulan ({n} bye untuk kumpulan terkuat). | `pods.summaryAnByes` |
| {a} to {b} | {a} hingga {b} | `pods.range` |
| Finals: increase legs at each stage (early rounds, quarterfinal, semifinal, final) | Peringkat Akhir: tambah leg pada setiap peringkat (pusingan awal, suku akhir, separuh akhir, akhir) | `pods.finalsLegs` |
| The entry list has changed since the draw | Senarai peserta telah berubah sejak undian | `pods.rosterChanged` |
| {n} players aren't in a group: {list} | {n} pemain tiada dalam kumpulan: {list} | `pods.unplaced` |
| Place… | Letakkan… | `pods.placeLink` |
| {n} players were removed or withdrawn but still sit in a group: {list} | {n} pemain telah dikeluarkan atau menarik diri tetapi masih berada dalam kumpulan: {list} | `pods.gone` |
| Remove them | Keluarkan mereka | `pods.removeThem` |
| The draw no longer matches your settings | Undian tidak lagi sepadan dengan tetapan anda | `pods.mismatch` |
| The format asks for {want} groups but {drawn} groups are drawn. Time estimates follow the groups as drawn. | Format menetapkan {want} kumpulan tetapi {drawn} kumpulan telah diundi. Anggaran masa mengikut kumpulan yang diundi. | `pods.mismatchText` |
| Groups can't be redrawn once scores have been entered, so set it back to {drawn} in Format & branding. | Kumpulan tidak boleh diundi semula selepas skor dimasukkan, jadi tetapkan semula kepada {drawn} dalam Format & penjenamaan. | `pods.mismatchScored` |
| Redraw the groups on the Groups step, or set it back to {drawn} in Format & branding. | Buat undian semula kumpulan pada langkah Kumpulan, atau tetapkan semula kepada {drawn} dalam Format & penjenamaan. | `pods.mismatchRedraw` |
| Group {g} ({n} {nouns}) | Kumpulan {g} ({n} {nouns}) | `pods.groupOpt` |
| Place {name} | Letakkan {name} | `pods.placeTitle` |
| Into group | Ke dalam kumpulan | `pods.intoGroup` |
| Every group is confirmed or has scores. Unconfirm a group first. | Setiap kumpulan telah disahkan atau mempunyai skor. Batalkan pengesahan satu kumpulan dahulu. | `pods.noOpenGroup` |
| Place | Letakkan | `pods.place` |
| Some players are still in a group | Sesetengah pemain masih berada dalam kumpulan | `pods.stillIn` |
| {done} of {n} checked in. | {done} daripada {n} telah daftar masuk. | `pods.checkedIn` |
| Withdraw the {n} not checked in | Keluarkan {n} yang belum daftar masuk | `pods.withdrawMissing` |
| Withdraw {n} players? | Keluarkan {n} peserta? | `pods.withdrawTitle` |
| Removes them from the entry list before the groups are drawn: | Mengeluarkan mereka daripada senarai peserta sebelum undian kumpulan dibuat: | `pods.withdrawText` |
| Confirm without everyone? | Sahkan tanpa semua peserta? | `pods.confirmWithout` |
| Confirm anyway | Sahkan juga | `pods.confirmAnyway` |
| Draw the groups below. | Buat undian kumpulan di bawah. | `pods.drawBelow` |
| Check the draw below. Use Move… to move or swap a player before you confirm the groups. | Semak undian di bawah. Gunakan Pindah… untuk memindahkan atau menukar pemain sebelum anda mengesahkan kumpulan. | `pods.checkDraw` |
| Deals every {noun} into {n} groups, one board each. Seeded players are spread across the groups, one per group. | Mengagihkan setiap {noun} ke dalam {n} kumpulan, satu board setiap kumpulan. Pemain yang diberi seed disebarkan ke semua kumpulan, seorang setiap kumpulan. | `pods.dealText` |
| Change it in Format & branding | Tukar dalam Format & penjenamaan | `pods.changeIt` |
| Continue to confirm → | Teruskan untuk mengesahkan → | `pods.continueConfirm` |
| Groups can't be redrawn once scores have been entered. | Kumpulan tidak boleh diundi semula selepas skor dimasukkan. | `pods.noRedraw` |
| Can't draw the groups | Undian kumpulan tidak dapat dibuat | `pods.cantDraw` |
| Draw without everyone? | Buat undian tanpa semua peserta? | `pods.drawWithout` |
| They are dealt into groups like everyone else. Withdraw them first if they are not coming. | Mereka diagihkan ke dalam kumpulan seperti peserta lain. Keluarkan mereka dahulu jika mereka tidak datang. | `pods.drawWithoutText` |
| Draw anyway | Buat undian juga | `pods.drawAnyway` |
| Redraw groups? | Buat undian semula kumpulan? | `pods.redrawTitle` |
| Everyone is dealt again from the current seed order. Moves you made by hand, and any confirmed groups, are discarded. | Semua peserta diagihkan semula daripada susunan seed semasa. Pemindahan yang anda buat secara manual, dan sebarang kumpulan yang telah disahkan, akan dibuang. | `pods.redrawText` |
| No swap | Tiada pertukaran | `pods.noSwap` |
| Move {name} | Pindahkan {name} | `pods.moveTitle` |
| To group | Ke kumpulan | `pods.toGroup` |
| Swap with (optional) | Tukar dengan (pilihan) | `pods.swapWith` |
| Leave "No swap" to just move the player. The other group then has one more player. | Biarkan "Tiada pertukaran" untuk memindahkan pemain sahaja. Kumpulan yang dituju akan mendapat seorang pemain tambahan. | `pods.moveHint` |
| There is no other group that can be changed. Unconfirm a group first. | Tiada kumpulan lain yang boleh diubah. Batalkan pengesahan satu kumpulan dahulu. | `pods.noOtherGroup` |
| Move | Pindahkan | `pods.move` |
| Confirm groups | Sahkan kumpulan | `pods.confirmGroups` |
| Draw the groups in Chart details first. | Buat undian kumpulan dalam Butiran carta dahulu. | `pods.drawFirst` |
| Go to chart details | Pergi ke Butiran carta | `pods.goDetails` |
| Confirm groups & build the Finals | Sahkan kumpulan & bina Peringkat Akhir | `pods.confirmTitle` |
| Confirm each group once its draw is right. When the last group is confirmed, the Finals chart is built with "Winner of Group N" placeholders. A group with scores can't be unconfirmed. | Sahkan setiap kumpulan apabila undiannya betul. Apabila kumpulan terakhir disahkan, carta Peringkat Akhir dibina dengan ruang "Pemenang Kumpulan N". Pengesahan kumpulan yang mempunyai skor tidak boleh dibatalkan. | `pods.confirmIntro` |
| Groups confirmed | Kumpulan disahkan | `pods.groupsConfirmed` |
| {size}-slot chart built | Carta {size} slot dibina | `pods.finalsBuilt` |
| Not built yet | Belum dibina | `pods.notBuilt` |
| Confirm all groups | Sahkan semua kumpulan | `pods.confirmAll` |
| Group {g} — {n} {nouns} · {boards} | Kumpulan {g} — {n} {nouns} · {boards} | `pods.row` |
| Confirm | Sahkan | `pods.confirm` |
| Can't unconfirm | Pengesahan tidak boleh dibatalkan | `pods.cantUnconfirm` |
| In progress · {done} of {n} matches | Sedang berlangsung · {done} daripada {n} perlawanan | `pods.inProgress` |
| No groups to show. | Tiada kumpulan untuk dipaparkan. | `pods.noneToShow` |
| Confirm the groups in Confirm & Print Bracket before you can enter results here. | Sahkan kumpulan dalam Sahkan & Cetak Bracket sebelum anda boleh memasukkan keputusan di sini. | `pods.confirmFirst` |
| {done} of {n} groups finished | {done} daripada {n} kumpulan selesai | `pods.finishedOf` |
| The Finals is built once every group is confirmed. | Peringkat Akhir dibina selepas semua kumpulan disahkan. | `pods.finalsLater` |
| Change boards | Tukar board | `pods.changeBoards` |
| Confirm this group in Confirm & Print Bracket before entering results. | Sahkan kumpulan ini dalam Sahkan & Cetak Bracket sebelum memasukkan keputusan. | `pods.confirmThisFirst` |
| No groups yet. Draw them in Chart details. | Belum ada kumpulan. Buat undian dalam Butiran carta. | `pods.noGroupsYet` |
| Group winners and Finals placings. Read-only: fix a result in Manage Tournament if needed. | Pemenang kumpulan dan kedudukan Peringkat Akhir. Baca sahaja: betulkan keputusan dalam Urus Kejohanan jika perlu. | `pods.s6intro` |
| Group winners | Pemenang kumpulan | `pods.winners` |
| Runner-up | Naib juara | `pods.thRunnerUp` |
| Prints one sheet per group, then the Finals, with results filled in, as a high-resolution A4 landscape PDF. | Mencetak satu helaian setiap kumpulan, kemudian Peringkat Akhir, dengan keputusan diisi, sebagai PDF A4 melintang beresolusi tinggi. | `pods.s7intro` |
| Group sheets | Helaian kumpulan | `pods.groupSheets` |
| Included | Disertakan | `pods.included` |
| No groups yet | Belum ada kumpulan | `pods.noGroupsTitle` |
| Draw the groups first. | Buat undian kumpulan dahulu. | `pods.drawFirstShort` |

### paper.* (32)

| English | BM (coined) | Key |
|---|---|---|
| {paper} · names {pt} pt · {fit} | {paper} · nama {pt} pt · {fit} | `paper.thumb` |
| No paper size fits this bracket at 7 pt | Tiada saiz kertas yang memuatkan bracket ini pada 7 pt | `paper.t.none` |
| No paper size fits these brackets at 7 pt | Tiada saiz kertas yang memuatkan bracket ini pada 7 pt | `paper.t.noneMany` |
| This bracket needs {rec} paper | Bracket ini memerlukan kertas {rec} | `paper.t.need` |
| These brackets need {rec} paper | Bracket ini memerlukan kertas {rec} | `paper.t.needMany` |
| Split over {n} A4 sheets | Pecahkan kepada {n} helaian A4 | `paper.o.split` |
| Even A1 needs to shrink the {what}: names would print at {a1} pt on A1 and {pt} pt on {paper}, under the 7 pt minimum. | A1 pun perlu mengecilkan {what}: nama akan dicetak pada {a1} pt pada A1 dan {pt} pt pada {paper}, di bawah minimum 7 pt. | `paper.d.none` |
| Split over A4 sheets keeps every name at 7 pt or more. | Jika dipecahkan kepada helaian A4, setiap nama kekal pada 7 pt atau lebih. | `paper.d.splitKeeps` |
| Shrink to fit {paper} | Kecilkan supaya muat {paper} | `paper.o.shrink` |
| Shrinks the whole chart to fit one {paper} sheet, keeping its shape (names {pt} pt). | Mengecilkan seluruh carta supaya muat pada satu helaian {paper} tanpa mengubah bentuknya (nama {pt} pt). | `paper.o.shrinkText` |
| On A1 the names would print at {pt} pt. | Pada A1 nama akan dicetak pada {pt} pt. | `paper.o.onA1` |
| If you shrink it: The names may be too small to read when printed. No paper size up to A1 prints them at 7 pt. | Jika anda mengecilkannya: Nama mungkin terlalu kecil untuk dibaca apabila dicetak. Tiada saiz kertas hingga A1 yang mencetaknya pada 7 pt. | `paper.d.warnShrink` |
| On {paper} the {what} only fits on one sheet if it is shrunk to {pc}%. Names would print at {pt} pt. On {rec} they print at {rpt} pt. | Pada {paper}, {what} hanya muat pada satu helaian jika dikecilkan kepada {pc}%. Nama akan dicetak pada {pt} pt. Pada {rec} nama dicetak pada {rpt} pt. | `paper.d.onlyFits` |
| On {paper} the {what} only fits on one sheet if it is shrunk to {pc}%. Names would print at {pt} pt. On {rec} they print at {rpt} pt, above the 7 pt minimum. | Pada {paper}, {what} hanya muat pada satu helaian jika dikecilkan kepada {pc}%. Nama akan dicetak pada {pt} pt. Pada {rec} nama dicetak pada {rpt} pt, melebihi minimum 7 pt. | `paper.d.onlyFitsAbove` |
| Use {rec} (recommended) | Guna {rec} (disyorkan) | `paper.o.use` |
| Prints the bracket on one {rec} sheet, names {pt} pt. This changes the event&rsquo;s saved paper size to {rec}; set the printer to {rec} too. | Mencetak bracket pada satu helaian {rec}, nama {pt} pt. Ini menukar saiz kertas yang disimpan untuk acara kepada {rec}; tetapkan pencetak kepada {rec} juga. | `paper.o.useText` |
| Prints each bracket on one {rec} sheet, names {pt} pt. This changes the event&rsquo;s saved paper size to {rec}; set the printer to {rec} too. | Mencetak setiap bracket pada satu helaian {rec}, nama {pt} pt. Ini menukar saiz kertas yang disimpan untuk acara kepada {rec}; tetapkan pencetak kepada {rec} juga. | `paper.o.useTextMany` |
| Keep {paper} | Kekalkan {paper} | `paper.o.keep` |
| If you keep {paper}: The names may be too small to read when printed. Recommended: {rec}. | Jika anda mengekalkan {paper}: Nama mungkin terlalu kecil untuk dibaca apabila dicetak. Disyorkan: {rec}. | `paper.d.warnKeep` |
| Switch this event to {p} | Tukar acara ini ke {p} | `paper.switchTo` |
| (the button changes this event&rsquo;s saved paper size) | (butang ini menukar saiz kertas yang disimpan untuk acara ini) | `paper.saved` |
| {names} split over {s} A4 sheets (names 7 pt or more, plus a Finals sheet). No paper size up to A1 holds it whole at 7 pt. | {names} dipecahkan kepada {s} helaian A4 (nama 7 pt atau lebih, serta satu helaian Akhir). Tiada saiz kertas hingga A1 yang memuatkannya sepenuhnya pada 7 pt. | `paper.p.noneSplit` |
| {names} shrunk to fit {paper} (names {pt} pt). The names may be too small to read when printed. No paper size up to A1 holds it at 7 pt (even A1 needs to shrink it). | {names} dikecilkan supaya muat {paper} (nama {pt} pt). Nama mungkin terlalu kecil untuk dibaca apabila dicetak. Tiada saiz kertas hingga A1 yang memuatkannya pada 7 pt (A1 pun perlu mengecilkannya). | `paper.p.noneShrink` |
| No paper size holds the {namesMid} at 7 pt: even A1 needs to shrink it. When you print you can shrink it to fit {paper}. | Tiada saiz kertas yang memuatkan {namesMid} pada 7 pt: A1 pun perlu mengecilkannya. Semasa mencetak, anda boleh mengecilkannya supaya muat {paper}. | `paper.p.noneAsk` |
| No paper size holds the {namesMid} at 7 pt: even A1 needs to shrink it. When you print you can split it over {s} A4 sheets or shrink it to fit {paper}. | Tiada saiz kertas yang memuatkan {namesMid} pada 7 pt: A1 pun perlu mengecilkannya. Semasa mencetak, anda boleh memecahkannya kepada {s} helaian A4 atau mengecilkannya supaya muat {paper}. | `paper.p.noneAskSplit` |
| {names} shrunk to fit {paper} (names {pt} pt). The names may be too small to read when printed. Recommended: {rec}{saved}. | {names} dikecilkan supaya muat {paper} (nama {pt} pt). Nama mungkin terlalu kecil untuk dibaca apabila dicetak. Disyorkan: {rec}{saved}. | `paper.p.shrink` |
| {names} split over {s} A4 sheets (names 7 pt or more, plus a Finals sheet). One {rec} sheet would hold it whole{saved}. | {names} dipecahkan kepada {s} helaian A4 (nama 7 pt atau lebih, serta satu helaian Akhir). Satu helaian {rec} boleh memuatkannya sepenuhnya{saved}. | `paper.p.split` |
| {names} need {rec} paper for names of 7 pt or more. On {paper} names would print at {pt} pt. When you print you can use {rec} or keep {paper} and shrink it{saved}. | {names} memerlukan kertas {rec} untuk nama 7 pt atau lebih. Pada {paper} nama akan dicetak pada {pt} pt. Semasa mencetak, anda boleh menggunakan {rec} atau mengekalkan {paper} dan mengecilkannya{saved}. | `paper.p.need` |
| {names} need {rec} paper for names of 7 pt or more. On {paper} names would print at {pt} pt. When you print you can use {rec}, split it over {s} A4 sheets or keep {paper} and shrink it{saved}. | {names} memerlukan kertas {rec} untuk nama 7 pt atau lebih. Pada {paper} nama akan dicetak pada {pt} pt. Semasa mencetak, anda boleh menggunakan {rec}, memecahkannya kepada {s} helaian A4 atau mengekalkan {paper} dan mengecilkannya{saved}. | `paper.p.needSplit` |
| Names print at {pt} pt; 8 pt or more is easier to read. {soft} would give that{saved}. | Nama dicetak pada {pt} pt; saiz 8 pt ke atas lebih mudah dibaca. {soft} boleh memberikan saiz itu{saved}. | `paper.p.soft` |
| Fit check: {list} (minimum 7 pt). | Semakan muat: {list} (minimum 7 pt). | `paper.fit` |
| Fit check ({name}): {list} (minimum 7 pt). | Semakan muat ({name}): {list} (minimum 7 pt). | `paper.fitOf` |

### Stage 2 Format & branding (30)

| English | BM (coined) | Key |
|---|---|---|
| Use an odd best of | Gunakan bilangan leg ganjil | `s2.oddTitle` |
| Tie-break order (used only when points are equal — final position on each chart is calculated automatically from this) | Susunan pemecah seri (digunakan hanya apabila mata sama — kedudukan akhir pada setiap carta dikira secara automatik daripada susunan ini) | `s2.tbOrder` |
| Suggested default order shown. Reorder to match your rules — the printed footer and standings both follow this order. | Susunan lalai yang dicadangkan dipaparkan. Susun semula mengikut peraturan anda — kaki halaman cetakan dan kedudukan kedua-duanya mengikut susunan ini. | `s2.tbOrderHint` |
| Games have started, so the format of this Teams event can't change. | Perlawanan telah bermula, jadi format acara Berpasukan ini tidak boleh diubah. | `s2.teamsLocked` |
| Which format should I choose? | Format manakah yang patut saya pilih? | `s2.whichFormat` |
| What is Group Boards? | Apakah Group Boards? | `s2.whatPods` |
| legs and best of | leg dan terbaik daripada | `s2.legsHelp` |
| {n} entries | {n} peserta | `s2.nEntries` |
| Increase legs at each knockout stage (like WDF: early rounds → quarterfinal → semifinal → final) | Tambah leg pada setiap peringkat kalah mati (seperti WDF: pusingan awal → suku akhir → separuh akhir → akhir) | `s2.koLegs` |
| what a Plate pool is | apakah saingan Plate | `s2.plateHelp` |
| (optional — only applies when the Plate pool is on) | (pilihan — hanya terpakai apabila saingan Plate dihidupkan) | `s2.plateQOpt` |
| Rest of group | Baki kumpulan | `s2.plateQPh` |
| Seeded placement keeps top finishers apart for as long as possible, and spreads same-group entries across the bracket where the numbers allow it. Leave Plate entries blank to send everyone who doesn't advance to the main bracket into the Plate pool (today's default); set a number to cap the Plate pool too, e.g. top 2 → winner bracket, next 2 → Plate pool, anyone below that eliminated. You'll generate the actual bracket once the round robin stage is confirmed. | Penempatan mengikut seed memisahkan peserta teratas selama mungkin, dan menyebarkan peserta dari kumpulan yang sama ke seluruh bracket jika bilangan membenarkan. Biarkan Peserta Plate kosong untuk menghantar semua yang tidak mara ke bracket utama ke saingan Plate (tetapan lalai); tetapkan nombor untuk mengehadkan saingan Plate juga, cth. 2 teratas → bracket pemenang, 2 seterusnya → saingan Plate, yang di bawahnya tersingkir. Anda akan menjana bracket sebenar selepas peringkat round robin disahkan. | `s2.plateHint` |
| Plate pool: also increase legs by stage (independent of the winner bracket above) | Saingan Plate: tambah juga leg mengikut peringkat (berasingan daripada bracket pemenang di atas) | `s2.plateLegs` |
| how byes are decided | cara bye ditentukan | `s2.byesHelp` |
| {size} ({n} byes) | {size} ({n} bye) | `s2.bracketSizeValue` |
| Nearest bracket: {size}-entry bracket for {entries} entries — {n} byes required in round 1. | Saiz bracket terdekat: Bracket {size} slot untuk {entries} peserta — {n} bye diperlukan dalam pusingan 1. | `s2.nearest` |
| NOLOGO | TIADALOGO | `s2.noLogo` |
| Remove | Buang | `s2.remove` |
| Click to remove | Klik untuk membuang | `s2.clickRemove` |
| ▭ Rect | ▭ Segi empat tepat | `s2.rect` |
| ▢ Square | ▢ Segi empat sama | `s2.square` |
| {n} logos added. Click a thumbnail to remove it, or pick rectangle/square for how it displays on the chart footer. Auto-resized either way — no need to pre-crop. | {n} logo ditambah. Klik imej kecil untuk membuangnya, atau pilih segi empat tepat/segi empat sama untuk cara ia dipaparkan pada kaki halaman carta. Saiznya dilaraskan secara automatik — tidak perlu dipangkas terlebih dahulu. | `s2.sponsorsHint` |
| Avoid placing entries from the same organisation together (same round robin group, or facing off in the first knockout round) | Elakkan meletakkan peserta dari organisasi yang sama bersama-sama (kumpulan round robin yang sama, atau bertemu dalam pusingan kalah mati pertama) | `s2.orgSplit` |
| Walkover, conduct & other rules | Walkover, tatakelakuan & peraturan lain | `s2.rules` |
| (optional — printed on its own rules & format sheet, see below) | (pilihan — dicetak pada helaian peraturan & format tersendiri, lihat di bawah) | `s2.rulesOpt` |
| e.g. A no-show forfeits after 10 minutes past the scheduled start. Players must check in at the desk before their first game. Unsporting conduct may result in disqualification at the organiser’s discretion. | cth. Peserta yang tidak hadir kalah walkover selepas 10 minit dari masa mula yang dijadualkan. Pemain mesti mendaftar masuk di meja urus setia sebelum perlawanan pertama. Kelakuan tidak sportif boleh menyebabkan hilang kelayakan mengikut budi bicara penganjur. | `s2.rulesPh` |
| Using Basic setup. Switch to Advanced for a live on-schedule indicator, knockout leg progression, the Plate pool, and more. | Menggunakan persediaan Asas. Tukar ke Lanjutan untuk penunjuk jadual secara langsung, leg mengikut pusingan kalah mati, saingan Plate dan banyak lagi. | `s2.usingBasic` |
| Board count is used for group-to-board assignment for Round Robin, and to predict the schedule. Level of play, start time and breaks are optional and power a live on-schedule indicator in Manage Tournament — never printed. | Bilangan board digunakan untuk menetapkan board bagi setiap kumpulan Round Robin, dan untuk meramal jadual. Tahap permainan, masa mula dan rehat tidak wajib; ia digunakan untuk penunjuk jadual secara langsung dalam Urus Kejohanan dan tidak akan dicetak. | `s2.schedSubAdv` |
| Check the number of groups | Semak bilangan kumpulan | `s2.checkGroups` |

### ko.* (23)

| English | BM (coined) | Key |
|---|---|---|
| {round} · Best of {n} | {round} · Terbaik daripada {n} | `ko.colBestOf` |
| {a} v {b} (neither attended) | {a} lwn {b} (kedua-dua tidak hadir) | `ko.cl.void` |
| The group winner ({name}) will be cleared too, and their place in the Finals with it. | Pemenang kumpulan ({name}) juga akan dikosongkan, bersama tempatnya di Peringkat Akhir. | `ko.cl.podWinner` |
| The champion ({name}) will be cleared too. | Juara ({name}) juga akan dikosongkan. | `ko.cl.champion` |
| Changing this result will clear {n} later results, and you will need to enter them again: | Menukar keputusan ini akan mengosongkan {n} keputusan berikutnya, dan anda perlu memasukkannya semula: | `ko.cascade.change` |
| Clearing this result will clear {n} later results, and you will need to enter them again: | Mengosongkan keputusan ini akan turut mengosongkan {n} keputusan berikutnya, dan anda perlu memasukkannya semula: | `ko.cascade.clear` |
| Reversing this result will clear {n} later results, and you will need to enter them again: | Membatalkan keputusan ini akan mengosongkan {n} keputusan berikutnya, dan anda perlu memasukkannya semula: | `ko.cascade.reverse` |
| Continue? | Teruskan? | `ko.cascade.continue` |
| This match is no longer in the bracket. | Perlawanan ini tiada lagi dalam bracket. | `ko.gone` |
| {a} v {b} ({round} {tag}) goes back to not played. | {a} lwn {b} ({round} {tag}) kembali kepada belum dimainkan. | `ko.clr.plain` |
| {a} v {b} ({round} {tag}) goes back to not played, and {winner} is taken out of the next round. | {a} lwn {b} ({round} {tag}) kembali kepada belum dimainkan, dan {winner} dikeluarkan daripada pusingan seterusnya. | `ko.clr.next` |
| {a} v {b} ({round} {tag}) goes back to not played, and the champion is cleared. | {a} lwn {b} ({round} {tag}) kembali kepada belum dimainkan, dan juara dikosongkan. | `ko.clr.champion` |
| {a} v {b} ({round} {tag}) goes back to not played, and the group winner is cleared, with their place in the Finals. | {a} lwn {b} ({round} {tag}) kembali kepada belum dimainkan, dan pemenang kumpulan dikosongkan, bersama tempatnya di Peringkat Akhir. | `ko.clr.podWinner` |
| This changes who goes through | Ini mengubah siapa yang mara | `ko.change.title` |
| Neither player attended | Kedua-dua pemain tidak hadir | `ko.void.player` |
| Neither pair attended | Kedua-dua pasangan tidak hadir | `ko.void.pair` |
| Neither team attended | Kedua-dua pasukan tidak hadir | `ko.void.team` |
| This match was marked as not played. Enter a score to play it instead, or {btn} | Perlawanan ini telah ditanda sebagai tidak dimainkan. Jika perlawanan ini dimainkan juga, masukkan skornya, atau {btn} | `ko.void.text` |
| Match {tag} · {round} | Perlawanan {tag} · {round} | `ko.matchTag` |
| Best of {n} legs — a side can score at most {m}. Knockout matches can't end in a draw. | Terbaik daripada {n} leg — satu pihak boleh mendapat paling banyak {m}. Perlawanan kalah mati tidak boleh berakhir seri. | `ko.score.hint` |
| This is a knockout match — it can't end in a draw. One side must win. | Ini perlawanan kalah mati — ia tidak boleh berakhir seri. Satu pihak mesti menang. | `ko.score.err.draw` |
| Not a valid finished result for best of {n} legs — the winner must have exactly {m} legs, and the loser fewer. | Keputusan ini tidak sah bagi perlawanan terbaik daripada {n} leg — pemenang mesti mempunyai tepat {m} leg, dan yang kalah kurang daripada itu. | `ko.score.err.invalid` |
| Can't change this result | Keputusan ini tidak boleh diubah | `ko.cantChange` |

### wd.* (19)

| English | BM (coined) | Key |
|---|---|---|
| Games have started in Group {g} | Perlawanan telah bermula dalam Kumpulan {g} | `wd.startedTitle` |
| The knockout has been drawn | Undian kalah mati telah dibuat | `wd.koDrawn` |
| The groups have been drawn | Undian kumpulan telah dibuat | `wd.groupsDrawn` |
| Withdraw {name}? | {name} menarik diri? | `wd.title` |
| Removes them from the entry list before groups are drawn. | Mengeluarkan mereka daripada senarai peserta sebelum undian kumpulan dibuat. | `wd.preDraw` |
| Play has begun since this box opened, so Withdraw is no longer possible. Click Cancel, then use Mark no-show… instead. | Permainan telah bermula sejak kotak ini dibuka, jadi Tarik diri tidak boleh dibuat lagi. Klik Batal, kemudian gunakan Tandakan tidak hadir… sebagai gantinya. | `wd.tooLate` |
| The Group Boards groups have been drawn and {name} is in one. Withdrawing now would leave {name} in the bracket and change results that are already in. | Undian kumpulan Group Boards telah dibuat dan {name} berada dalam salah satunya. Jika {name} menarik diri sekarang, {name} akan kekal dalam bracket dan keputusan yang sudah dimasukkan akan berubah. | `wd.headPods` |
| The knockout has been drawn and {name} is in it. Withdrawing now would leave {name} in the bracket and change results that are already in. | Undian kalah mati telah dibuat dan {name} berada di dalamnya. Jika {name} menarik diri sekarang, {name} akan kekal dalam bracket dan keputusan yang sudah dimasukkan akan berubah. | `wd.headKo` |
| To take {name} out of the rest of the event, use Mark no-show instead: {name} loses {tag} by a walkover, and {opp} goes through. Results already played stay. | Untuk mengeluarkan {name} daripada baki acara, gunakan Tandakan tidak hadir sebagai gantinya: {name} kalah walkover dalam {tag}, dan {opp} mara. Keputusan yang telah dimainkan kekal. | `wd.mark` |
| {name}&rsquo;s next match ({round} {tag}) has no opponent yet. When it has, click Mark no-show… on that match: the opponent goes through by a walkover. | Perlawanan seterusnya {name} ({round} {tag}) belum mempunyai lawan. Apabila ada, klik Tandakan tidak hadir… pada perlawanan itu: lawan mara dengan walkover. | `wd.later` |
| {name} has no knockout match left to play, so there is nothing to change. Their results stay as they are. | {name} tidak mempunyai perlawanan kalah mati lagi untuk dimainkan, jadi tiada apa-apa yang perlu diubah. Keputusan mereka kekal seperti sedia ada. | `wd.noneLeft` |
| Withdrawing now would remove {name}&rsquo;s played results from Group {g} and change the table. | Jika {name} menarik diri sekarang, keputusan {name} yang telah dimainkan akan dibuang daripada Kumpulan {g} dan jadual kedudukan akan berubah. | `wd.headGroup` |
| {name} is already marked as a no-show: their remaining matches are walkover losses. Nothing else to do. | {name} telah ditanda tidak hadir: baki perlawanan mereka ialah kalah walkover. Tiada apa-apa lagi yang perlu dibuat. | `wd.alreadyNoShow` |
| {name} has played every match in the group, so there is nothing to mark. Their results stay as they are. | {name} telah memainkan semua perlawanan dalam kumpulan, jadi tiada apa-apa untuk ditanda. Keputusan mereka kekal seperti sedia ada. | `wd.allPlayed` |
| To take {name} out of the rest of the event, use Mark no-show instead: {name}&rsquo;s {n} remaining matches become walkover losses, so the opponents get the points. Results already played stay. | Untuk mengeluarkan {name} daripada baki acara, gunakan Tandakan tidak hadir sebagai gantinya: {n} baki perlawanan {name} menjadi kalah walkover, jadi lawan mendapat mata. Keputusan yang telah dimainkan kekal. | `wd.markGroup` |
| Games have started: Withdraw is no longer possible | Perlawanan telah bermula: Tarik diri tidak boleh dibuat lagi | `wd.startedTip` |
| Removes them from Group {g}. Either name a replacement to fill the slot, or leave it as a bye. | Mengeluarkan mereka daripada Kumpulan {g}. Namakan pengganti untuk mengisi tempat itu, atau biarkan sebagai bye. | `wd.fromGroup` |
| Replacement name (optional) | Nama pengganti (pilihan) | `wd.replacement` |
| Leave blank for a bye | Biarkan kosong untuk bye | `wd.replacementPh` |

### seg.* (16)

| English | BM (coined) | Key |
|---|---|---|
| {type} ({start}, best of {legs}) | {type} ({start}, terbaik daripada {legs}) | `seg.desc` |
| {n} segments | {n} segmen | `seg.short` |
| {n} segments + tie-breaker | {n} segmen + pemecah seri | `seg.short.tb` |
| {n} segments + tie-breaker (round robin) | {n} segmen + pemecah seri (round robin) | `seg.short.tbRr` |
| {n} segments + tie-breaker (knockout) | {n} segmen + pemecah seri (kalah mati) | `seg.short.tbKo` |
| Segment {n} | Segmen {n} | `seg.name` |
| {name} type | Jenis {name} | `seg.typeLabel` |
| {name} starting score | Skor permulaan {name} | `seg.startLabel` |
| {name} legs (best of) | Leg {name} (terbaik daripada) | `seg.legsLabel` |
| Move segment {n} up | Gerakkan segmen {n} ke atas | `seg.up` |
| Move segment {n} down | Gerakkan segmen {n} ke bawah | `seg.down` |
| Remove segment {n} | Buang segmen {n} | `seg.remove` |
| Games have started, so the segments are locked: every match of the event is played with the same ones. | Perlawanan telah bermula, jadi segmen dikunci: setiap perlawanan dalam acara ini dimainkan dengan segmen yang sama. | `seg.locked` |
| Up to {n} segments, so the lineup sheet fits on one page. | Sehingga {n} segmen, supaya borang barisan muat pada satu halaman. | `seg.max` |
| Segment {n} is best of {legs}. Every segment needs an odd best of (1, 3, 5…), so it can't end level. Change it, then save. | Segmen {n} ialah terbaik daripada {legs}. Setiap segmen mesti terbaik daripada nombor ganjil (1, 3, 5…) supaya tidak berakhir seri. Tukar, kemudian simpan. | `seg.oddErr` |
| The tie-breaker is best of {legs}. It needs an odd best of (1, 3, 5…), so it can't end level and always settles the match. Change it, then save. | Pemecah seri ialah terbaik daripada {legs}. Ia mesti terbaik daripada nombor ganjil (1, 3, 5…) supaya tidak berakhir seri dan sentiasa menentukan keputusan perlawanan. Tukar, kemudian simpan. | `seg.oddErrTb` |

### team.* (16)

| English | BM (coined) | Key |
|---|---|---|
| The totals can't be level: if they are level after the main segments, play the tie-breaker and include its legs. | Jumlahnya tidak boleh sama: jika sama selepas segmen utama, mainkan pemecah seri dan masukkan legnya. | `team.level.tb` |
| Level totals are a draw (1 point each). | Jumlah yang sama dikira seri (1 mata setiap pasukan). | `team.level.rr` |
| Knockout matches can't end level. | Perlawanan kalah mati tidak boleh berakhir seri. | `team.level.ko` |
| Enter the total legs each team won across all {n} segments. A team can win at most {cap} legs. {level} | Masukkan jumlah leg yang dimenangi setiap pasukan dalam kesemua {n} segmen. Satu pasukan boleh memenangi paling banyak {cap} leg. {level} | `team.hint` |
| Enter the total legs each team won across all {n} segments, including the tie-breaker if it was played. A team can win at most {cap} legs. {level} | Masukkan jumlah leg yang dimenangi setiap pasukan dalam kesemua {n} segmen, termasuk pemecah seri jika dimainkan. Satu pasukan boleh memenangi paling banyak {cap} leg. {level} | `team.hint.tb` |
| Enter the total legs each team won (0 or more). | Masukkan jumlah leg yang dimenangi setiap pasukan (0 atau lebih). | `team.err.enter` |
| A team can win at most {cap} legs in this match ({what}). Check the totals. | Satu pasukan boleh memenangi paling banyak {cap} leg dalam perlawanan ini ({what}). Semak jumlahnya. | `team.err.cap` |
| Enter the legs each team won: both totals can't be 0. | Masukkan leg yang dimenangi setiap pasukan: kedua-dua jumlah tidak boleh 0. | `team.err.zero` |
| The totals can't be level: this round robin match uses the tie-breaker. Play it and include its legs in the totals. | Jumlahnya tidak boleh sama: perlawanan round robin ini menggunakan pemecah seri. Mainkan pemecah seri dan masukkan legnya dalam jumlah. | `team.err.levelTbRr` |
| The totals can't be level: this knockout match uses the tie-breaker. Play it and include its legs in the totals. | Jumlahnya tidak boleh sama: perlawanan kalah mati ini menggunakan pemecah seri. Mainkan pemecah seri dan masukkan legnya dalam jumlah. | `team.err.levelTbKo` |
| This is a knockout match — it can't end level. One team must have more legs: tick "Use a tie-breaker in knockout matches" in Format & branding to play the tie-breaker, or play one more deciding leg and include it in the totals. | Ini perlawanan kalah mati — ia tidak boleh berakhir seri. Satu pasukan mesti mempunyai lebih banyak leg: tandakan "Gunakan pemecah seri dalam perlawanan kalah mati" dalam Format & penjenamaan untuk memainkan pemecah seri, atau mainkan satu leg penentu lagi dan masukkannya dalam jumlah. | `team.err.koLevelTick` |
| This is a knockout match — it can't end level. One team must have more legs: play one more deciding leg and include it in the totals. | Ini perlawanan kalah mati — ia tidak boleh berakhir seri. Satu pasukan mesti mempunyai lebih banyak leg: mainkan satu leg penentu lagi dan masukkannya dalam jumlah. | `team.err.koLevel` |
| {rr} legs in a round robin match and {ko} in a knockout match | {rr} leg dalam perlawanan round robin dan {ko} dalam perlawanan kalah mati | `team.capBoth` |
| {n} legs in a match | {n} leg dalam satu perlawanan | `team.capOne` |
| A team can win at most {cap}. Enter each result as the total legs each team won across all its segments. | Satu pasukan boleh memenangi paling banyak {cap}. Masukkan setiap keputusan sebagai jumlah leg yang dimenangi setiap pasukan dalam semua segmennya. | `team.summary` |
| A team can win at most {cap}. Enter each result as the total legs each team won across all its segments, the tie-breaker's included when it was played. | Satu pasukan boleh memenangi paling banyak {cap}. Masukkan setiap keputusan sebagai jumlah leg yang dimenangi setiap pasukan dalam semua segmennya, termasuk pemecah seri jika dimainkan. | `team.summaryTb` |

### fin.* (16)

| English | BM (coined) | Key |
|---|---|---|
| This event is finalized. Only an Admin can change it. | Acara ini telah dimuktamadkan. Hanya Pentadbir boleh mengubahnya. | `fin.onlyAdmin` |
| Results finalized on {when} | Keputusan dimuktamadkan pada {when} | `fin.doneOn` |
| Only an Admin can change or reopen this event. You can still look through every step, print, and copy the public link. | Hanya Pentadbir boleh mengubah atau membuka semula acara ini. Anda masih boleh melihat setiap langkah, mencetak dan menyalin pautan awam. | `fin.bannerText` |
| Event is finalized | Acara telah dimuktamadkan | `fin.blockTitle` |
| Finalized events can only be changed by an Admin. | Acara yang telah dimuktamadkan hanya boleh diubah oleh Pentadbir. | `fin.block.changed` |
| Finalized events can only be deleted by an Admin. | Acara yang telah dimuktamadkan hanya boleh dipadam oleh Pentadbir. | `fin.block.deleted` |
| This event is finalized. Your change was not saved; only an Admin can change it. | Acara ini telah dimuktamadkan. Perubahan anda tidak disimpan; hanya Pentadbir boleh mengubahnya. | `fin.lockedToast` |
| Accept results & finalize | Terima keputusan & muktamadkan | `fin.cardTitle` |
| Only an Admin can reopen or edit this event. | Hanya Pentadbir boleh membuka semula atau mengedit acara ini. | `fin.cardDone` |
| {when}. Only an Admin can reopen or edit this event. | {when}. Hanya Pentadbir boleh membuka semula atau mengedit acara ini. | `fin.cardDoneWhen` |
| Accept & finalize | Terima & muktamadkan | `fin.acceptBtn` |
| This event was changed elsewhere. It has been reloaded; check it and try again. | Acara ini telah diubah di tempat lain. Ia telah dimuat semula; semak dan cuba lagi. | `fin.staleMsg` |
| Could not finalize: try again. | Acara tidak dapat dimuktamadkan. Cuba lagi. | `fin.failedMsg` |
| The last save did not go through, so this copy may be out of date. Click the status message at the top (to reload or retry), check the event, then try again. | Simpanan terakhir tidak berjaya, jadi salinan ini mungkin tidak terkini. Klik mesej status di bahagian atas (untuk muat semula atau cuba lagi), semak acara, kemudian cuba lagi. | `fin.saveFirst` |
| This event was already finalized elsewhere. It has been reloaded. | Acara ini telah dimuktamadkan di tempat lain. Ia telah dimuat semula. | `fin.already` |
| To finish the event, use Accept & finalize at the bottom of step 5 (Manage Tournament). | Untuk menamatkan acara, gunakan Terima & muktamadkan di bahagian bawah langkah 5 (Urus Kejohanan). | `fin.pointer` |

### Stage 3 Chart details (14)

| English | BM (coined) | Key |
|---|---|---|
| Groups {labels} have started, so the groups can no longer be redrawn and entries in a started group can no longer be swapped: that would leave results with entries who did not play them. Use Mark no-show… to take someone out. | Kumpulan {labels} telah bermula, jadi kumpulan tidak boleh diundi semula dan peserta dalam kumpulan yang telah bermula tidak boleh ditukar lagi: keputusan akan berada pada peserta yang tidak memainkannya. Gunakan Tandakan tidak hadir… untuk mengeluarkan seseorang. | `s3.busy` |
| Random draw re-deals who's in which group, avoiding same-organisation clashes where possible. | Undian rawak mengagihkan semula peserta ke dalam kumpulan, dengan mengelakkan pertembungan sesama organisasi jika boleh. | `s3.redealOrg` |
| Entries aren't assigned to a group yet — click Random draw to deal them in. | Peserta belum diagihkan ke kumpulan — klik Undian rawak untuk mengagihkan mereka. | `s3.notDrawn` |
| Entries aren't assigned to a group yet — click Random draw to deal them in, avoiding same-organisation clashes where possible. | Peserta belum diagihkan ke kumpulan — klik Undian rawak untuk mengagihkan mereka, dengan mengelakkan pertembungan sesama organisasi jika boleh. | `s3.notDrawnOrg` |
| Edit entry names, withdraw, or swap entries between groups/positions, and set each group's board(s). Groups sharing a board queue one after another; tick more than one board for a group to split its matches across them instead. Confirming charts and printing the bracket happens in the next step. | Edit nama peserta, keluarkan peserta yang menarik diri, atau tukar peserta antara kumpulan/kedudukan, dan tetapkan board setiap kumpulan. Kumpulan yang berkongsi board bermain secara bergilir-gilir; tandakan lebih daripada satu board untuk membahagikan perlawanan kumpulan itu antara board tersebut. Pengesahan carta dan pencetakan bracket dibuat dalam langkah seterusnya. | `s3.drawIntro` |
| Only the top {n} shown below get a seed number on the printed chart — everyone is still placed using this order either way. | Hanya {n} teratas di bawah mendapat nombor seed pada carta bercetak — semua peserta tetap diletakkan mengikut susunan ini. | `s3.seedHint` |
| No seeding — entries will be randomly drawn into the bracket each time it's generated. | Tiada seed — peserta akan diundi secara rawak ke dalam bracket setiap kali bracket dijana. | `s3.noSeeding` |
| Participants & Seeding | Peserta & Seed | `s3.partSeed` |
| Edit entry details, then optionally seed the bracket. {next} | Edit butiran peserta, kemudian gunakan seed untuk bracket jika mahu. {next} | `s3.partSeedIntro` |
| Generating the bracket happens in the next step. | Bracket dijana dalam langkah seterusnya. | `s3.nextStep` |
| Seeding | Seed | `s3.seeding` |
| {n} / {max} entries | {n} / {max} peserta | `s3.groupCount` |
| (tick more than one to split this group's matches across them) | (tandakan lebih daripada satu untuk membahagikan perlawanan kumpulan ini antara board tersebut) | `s3.boardsHint` |
| No matching name or organisation. | Tiada nama atau organisasi yang sepadan. | `s3.noMatch` |

### gs.* (14)

| English | BM (coined) | Key |
|---|---|---|
| Your first event in seven steps. Each &ldquo;How?&rdquo; opens that step of the Quick start in Help, in a new tab. | Acara pertama anda dalam tujuh langkah. Setiap &ldquo;Bagaimana?&rdquo; membuka langkah itu dalam Mula pantas di Bantuan, dalam tab baharu. | `gs.intro` |
| Create the event. Click + New tournament, give it a name, choose Singles, Doubles or Teams and the number of entries. | Cipta acara. Klik + Kejohanan baharu, beri nama, pilih Perseorangan, Beregu atau Berpasukan dan bilangan peserta. | `gs.step1` |
| Choose the format. Round robin, knockout, or groups then a knockout; the best of legs and the number of boards. | Pilih format. Round robin, kalah mati, atau peringkat kumpulan diikuti kalah mati; bilangan leg (terbaik daripada) dan bilangan board. | `gs.step2` |
| Type the names and draw the groups with Random draw. | Taip nama dan buat undian kumpulan dengan Undian rawak. | `gs.step3` |
| Confirm the charts and print the blank pack. If spectators will follow on their phones, publish first so the QR codes print. | Sahkan carta dan cetak set kosong. Jika penonton akan mengikuti acara melalui telefon, terbitkan dahulu supaya kod QR turut dicetak. | `gs.step4` |
| Start all games and click a match to enter its score. | Mulakan semua perlawanan dan klik perlawanan untuk memasukkan skornya. | `gs.step5` |
| Run the knockout once every group is finished. | Kendalikan kalah mati selepas semua kumpulan selesai. | `gs.step6` |
| Finish with Accept & finalize at the bottom of step 5. | Tamatkan dengan Terima & muktamadkan di bahagian bawah langkah 5. | `gs.step7` |
| How? Step {n} in the Quick start (opens in a new tab) | Bagaimana? Langkah {n} dalam Mula pantas (dibuka dalam tab baharu) | `gs.howLabel` |
| How? | Bagaimana? | `gs.how` |
| Read the Quick start ↗ | Baca Mula pantas ↗ | `gs.read` |
| The sample is a practice event with 12 players, groups then a knockout. Nothing in it is saved unless you choose to keep it. | Acara contoh ialah acara latihan dengan 12 pemain: peringkat kumpulan diikuti kalah mati. Tiada apa-apa di dalamnya yang akan disimpan melainkan anda memilih untuk menyimpannya. | `gs.sampleHint` |
| Hide this card | Sembunyikan kad ini | `gs.hide` |
| Show the Get started steps | Tunjukkan langkah Bermula | `gs.show` |

### sched.* (13)

| English | BM (coined) | Key |
|---|---|---|
| Not scheduled yet | Belum dijadualkan | `sched.notYet` |
| Due to start ~{time} | Dijangka mula ~{time} | `sched.due` |
| Running behind — planned {time} | Ketinggalan jadual — dirancang {time} | `sched.behind` |
| On schedule | Menepati jadual | `sched.onTime` |
| Estimated duration: ~{dur} (set an anticipated start time above to see an estimated finish time). Rough planning estimate only — once boards/bracket are set up, Manage Tournament shows a live schedule instead (not printed). | Anggaran tempoh: ~{dur} (tetapkan jangkaan masa mula di atas untuk melihat anggaran masa tamat). Anggaran kasar sahaja — selepas board/bracket ditetapkan, Urus Kejohanan memaparkan jadual langsung (tidak dicetak). | `sched.est` |
| Estimated duration: ~{dur} — finishing around {end}. Rough planning estimate only — once boards/bracket are set up, Manage Tournament shows a live schedule instead (not printed). | Anggaran tempoh: ~{dur} — dijangka tamat sekitar {end}. Anggaran kasar sahaja — selepas board/bracket ditetapkan, Urus Kejohanan memaparkan jadual langsung (tidak dicetak). | `sched.estEnd` |
| {n} boards | {n} board | `sched.boards` |
| Level: {level} | Tahap: {level} | `sched.level` |
| Starts {time} | Mula {time} | `sched.starts` |
| No start time set | Masa mula belum ditetapkan | `sched.noStart` |
| Level of play, start time and breaks are available in Advanced setup. | Tahap permainan, masa mula dan rehat tersedia dalam persediaan Lanjutan. | `sched.advancedOnly` |
| Started {time} | Bermula {time} | `sched.started` |
| · planned {time} | · dirancang {time} | `sched.planned` |

### rrko.* (13)

| English | BM (coined) | Key |
|---|---|---|
| Not enough entries | Tidak cukup peserta | `rrko.notEnough` |
| At least 2 entries need to advance — check group standings and the entries-per-group setting in Format & branding. | Sekurang-kurangnya 2 peserta perlu mara — semak kedudukan kumpulan dan tetapan peserta setiap kumpulan dalam Format & penjenamaan. | `rrko.notEnoughText` |
| Finish the round robin first | Selesaikan round robin dahulu | `rrko.finishFirst` |
| Still to finish: {list}. | Belum selesai: {list}. | `rrko.stillToFinish` |
| There are no confirmed groups yet. | Belum ada kumpulan yang disahkan. | `rrko.noConfirmed` |
| drawing the knockout from the groups | membuat undian kalah mati daripada kumpulan | `rrko.helpLabel` |
| Draws the knockout bracket from each group's final standings once every group is finished ({n} entries per group, {how}{plate}). | Menjana bracket kalah mati daripada kedudukan akhir setiap kumpulan selepas semua kumpulan selesai ({n} peserta setiap kumpulan, {how}{plate}). | `rrko.drawIntro` |
| seeded by group position | diberi seed mengikut kedudukan kumpulan | `rrko.seeded` |
| random draw | undian rawak | `rrko.random` |
| , next {n} per group to the Plate pool, anyone below that eliminated | , {n} seterusnya setiap kumpulan ke saingan Plate, yang di bawahnya tersingkir | `rrko.plateNext` |
| , everyone else to the Plate pool | , semua yang lain ke saingan Plate | `rrko.plateRest` |
| Main and Plate pool run on their own exclusive boards — {main} for Main, {plate} for Plate pool. | Bracket utama dan saingan Plate dimainkan di board masing-masing — {main} untuk Utama, {plate} untuk saingan Plate. | `rrko.boardsSplit` |
| This discards all knockout results entered so far and rebuilds from current group standings. | Ini membuang semua keputusan kalah mati yang telah dimasukkan dan membina semula daripada kedudukan kumpulan semasa. | `rrko.regenText` |

### sample.* (11)

| English | BM (coined) | Key |
|---|---|---|
| Sample tournament | Kejohanan contoh | `sample.tournament` |
| Sample Singles | Perseorangan contoh | `sample.event` |
| Sample player {n} | Pemain contoh {n} | `sample.player` |
| Saved as your event. It is in Saved tournaments. | Disimpan sebagai acara anda. Ia ada dalam Kejohanan yang disimpan. | `sample.savedToast` |
| Try every step. Keep it with Save as my event, or throw it away with Close sample. | Cuba setiap langkah. Untuk menyimpannya, klik Simpan sebagai acara saya; untuk membuangnya, klik Tutup acara contoh. | `sample.bannerText` |
| the sample event | acara contoh | `sample.helpLabel` |
| This is a sample event | Ini acara contoh | `sample.blockTitle` |
| A sample event is never saved, so you can&rsquo;t publish it. Click Save as my event to keep it as one of your events first. | Acara contoh tidak akan disimpan, jadi anda tidak boleh menerbitkannya. Klik Simpan sebagai acara saya untuk menyimpannya sebagai salah satu acara anda dahulu. | `sample.block.publish` |
| A sample event is never saved, so you can&rsquo;t list it on the public page. Click Save as my event to keep it as one of your events first. | Acara contoh tidak akan disimpan, jadi anda tidak boleh menyenaraikannya di halaman awam. Klik Simpan sebagai acara saya untuk menyimpannya sebagai salah satu acara anda dahulu. | `sample.block.list` |
| A sample event is never saved, so you can&rsquo;t finalize it. Click Save as my event to keep it as one of your events first. | Acara contoh tidak akan disimpan, jadi anda tidak boleh memuktamadkannya. Klik Simpan sebagai acara saya untuk menyimpannya sebagai salah satu acara anda dahulu. | `sample.block.finalize` |
| A sample event is never saved, so you can&rsquo;t open it in a new window. Click Save as my event to keep it as one of your events first. | Acara contoh tidak akan disimpan, jadi anda tidak boleh membukanya dalam tetingkap baharu. Klik Simpan sebagai acara saya untuk menyimpannya sebagai salah satu acara anda dahulu. | `sample.block.window` |

### tb.* (11)

| English | BM (coined) | Key |
|---|---|---|
| Use a tie-breaker in knockout matches (the groups and the finals) | Gunakan pemecah seri dalam perlawanan kalah mati (kumpulan dan peringkat akhir) | `tb.useKoPods` |
| Use a tie-breaker in knockout matches (the Plate pool too) | Gunakan pemecah seri dalam perlawanan kalah mati (termasuk saingan Plate) | `tb.useKoPlate` |
| (this stage has begun: it can be switched on, and once saved it stays on) | (peringkat ini telah bermula: ia boleh dihidupkan, dan selepas disimpan ia kekal hidup) | `tb.begunCanOn` |
| Round robin matches: tie-breaker {desc} (this stage has begun with it, so it stays on) | Perlawanan round robin: pemecah seri {desc} (peringkat ini telah bermula dengannya, jadi ia kekal hidup) | `tb.stateRrOn` |
| Knockout matches: tie-breaker {desc} (this stage has begun with it, so it stays on) | Perlawanan kalah mati: pemecah seri {desc} (peringkat ini telah bermula dengannya, jadi ia kekal hidup) | `tb.stateKoOn` |
| Round robin matches: no tie-breaker (a drawn result is already saved, so it can't be switched on: level matches stay draws) | Perlawanan round robin: tiada pemecah seri (keputusan seri telah disimpan, jadi ia tidak boleh dihidupkan: perlawanan yang sama kekal seri) | `tb.stateRrOff` |
| Knockout matches: no tie-breaker (a drawn result is already saved, so it can't be switched on: level matches stay draws) | Perlawanan kalah mati: tiada pemecah seri (keputusan seri telah disimpan, jadi ia tidak boleh dihidupkan: perlawanan yang sama kekal seri) | `tb.stateKoOff` |
| Tie-breaker: {desc} (locked: matches were played with it) | Pemecah seri: {desc} (dikunci: perlawanan telah dimainkan dengannya) | `tb.lockedDef` |
| The tie-breaker is one more segment at the end, played only when the total legs are level after the main segments. Where it is used, a level total can't be saved: play it and count its legs. Every best of must be an odd number. | Pemecah seri ialah satu segmen tambahan di hujung, dimainkan hanya apabila jumlah leg sama selepas segmen utama. Jika ia digunakan, jumlah leg yang sama tidak boleh disimpan: mainkannya dan kira legnya. Setiap nilai terbaik daripada mesti nombor ganjil. | `tb.explain` |
| The tie-breaker is one more segment at the end, played only when the total legs are level after the main segments. Where it is used, a level total can't be saved: play it and count its legs. Without it, a level round robin match is a draw. Every best of must be an odd number. | Pemecah seri ialah satu segmen tambahan di hujung, dimainkan hanya apabila jumlah leg sama selepas segmen utama. Jika ia digunakan, jumlah leg yang sama tidak boleh disimpan: mainkannya dan kira legnya. Tanpanya, perlawanan round robin yang jumlah legnya sama dikira seri. Setiap nilai terbaik daripada mesti nombor ganjil. | `tb.explainRr` |
| The tie-breaker is one more segment at the end, played only when the total legs are level after the main segments. Where it is used, a level total can't be saved: play it and count its legs. A knockout match always needs a winner. Every best of must be an odd number. | Pemecah seri ialah satu segmen tambahan di hujung, dimainkan hanya apabila jumlah leg sama selepas segmen utama. Jika ia digunakan, jumlah leg yang sama tidak boleh disimpan: mainkannya dan kira legnya. Perlawanan kalah mati sentiasa memerlukan pemenang. Setiap nilai terbaik daripada mesti nombor ganjil. | `tb.explainKo` |

### Stage 4 Confirm & Print Bracket (11)

| English | BM (coined) | Key |
|---|---|---|
| Each chart&rsquo;s match list suggests a Marker, the person who keeps score. | Senarai perlawanan setiap carta mencadangkan seorang Pencatat, iaitu orang yang mencatat skor. | `s4.markerNote` |
| what a Marker is | apakah pencatat skor (marker) | `s4.markerHelp` |
| Confirm all {n} charts | Sahkan kesemua {n} carta | `s4.confirmAll` |
| Confirm selected ({n}) | Sahkan yang dipilih ({n}) | `s4.confirmSelected` |
| · planned start {time} | · jangkaan mula {time} | `s4.plannedStart` |
| printing the blank pack | mencetak set kosong | `s4.printHelp` |
| {a} of {n} | {a} daripada {n} | `s4.chartsOf` |
| Disabled | Dimatikan | `s4.disabled` |
| A master running order sheet (board-by-board match list) is added automatically, straight after the rules & format sheet (or as the first page when that sheet is left out). | Helaian induk susunan perlawanan (senarai perlawanan mengikut board) ditambah secara automatik, sejurus selepas helaian peraturan & format (atau sebagai halaman pertama jika helaian itu tidak disertakan). | `s4.runningOrder` |
| Group {g} — {boards} | Kumpulan {g} — {boards} | `s4.groupBoard` |
| Include the rules & format sheet as the first page of the pack | Sertakan helaian peraturan & format sebagai halaman pertama set | `s4.includeRules` |

### dur.* (10)

| English | BM (coined) | Key |
|---|---|---|
| {h}h {m}m | {h} jam {m} min | `dur.hm` |
| {h}h | {h} jam | `dur.h` |
| {m}m | {m} min | `dur.m` |
| {label} ~{dur} — finishing around {end} | {label} ~{dur} — dijangka tamat sekitar {end} | `dur.lineEnd` |
| Choose a valid number of groups to estimate duration. | Pilih bilangan kumpulan yang sah untuk mendapatkan anggaran tempoh. | `dur.noPods` |
| Not enough entries yet to estimate duration. | Belum cukup peserta untuk membuat anggaran tempoh. | `dur.noKo` |
| Add entries in Chart details to estimate duration. | Tambah peserta dalam Butiran carta untuk mendapatkan anggaran tempoh. | `dur.noRr` |
| Knockout (Main): | Kalah mati (Utama): | `dur.koMain` |
| Knockout (Plate pool): | Kalah mati (saingan Plate): | `dur.koPlate` |
| Knockout (Plate pool): not enough entries advancing yet to estimate. | Kalah mati (saingan Plate): belum cukup peserta yang mara untuk membuat anggaran. | `dur.koPlateNone` |

### pw.* (10)

| English | BM (coined) | Key |
|---|---|---|
| Fill in all three fields. | Isi ketiga-tiga ruangan. | `pw.err.fill` |
| The new password must be at least {n} characters. | Kata laluan baharu mesti sekurang-kurangnya {n} aksara. | `pw.err.min` |
| The new password must be at most {n} characters. | Kata laluan baharu tidak boleh melebihi {n} aksara. | `pw.err.max` |
| The new passwords do not match. | Kata laluan baharu tidak sepadan. | `pw.err.match` |
| Choose a new password that is different from the current one. | Pilih kata laluan baharu yang berbeza daripada kata laluan semasa. | `pw.err.same` |
| At least {n} characters. Changing it signs you out on your other devices. | Sekurang-kurangnya {n} aksara. Selepas kata laluan ditukar, anda akan dilog keluar pada peranti lain. | `pw.hint` |
| Password changed | Kata laluan ditukar | `pw.changed` |
| Your password has been changed. Your other devices and browsers have been signed out; this one stays signed in. | Kata laluan anda telah ditukar. Anda telah dilog keluar pada peranti dan pelayar lain; anda kekal log masuk dalam pelayar ini. | `pw.changedText` |
| Could not change the password. Please try again. | Kata laluan anda tidak dapat ditukar. Sila cuba lagi. | `pw.err.failed` |
| Could not change the password. Check your connection and try again. | Kata laluan anda tidak dapat ditukar. Semak sambungan anda dan cuba lagi. | `pw.err.offline` |

### cc.* (10)

| English | BM (coined) | Key |
|---|---|---|
| This chart only has {n} entries — it can't be played as-is. | Carta ini hanya mempunyai {n} peserta — ia tidak boleh dimainkan seperti ini. | `cc.tooFew` |
| This group has {have} of {max} possible entries — the remaining slots will print blank. | Kumpulan ini mempunyai {have} daripada {max} peserta yang boleh dimuatkan — tempat yang selebihnya akan dicetak kosong. | `cc.blankSlots` |
| Two or more entries in this group share the same name — double-check they're not duplicates. | Dua atau lebih peserta dalam kumpulan ini mempunyai nama yang sama — pastikan mereka bukan pendua. | `cc.dupNames` |
| Please check before confirming | Sila semak sebelum mengesahkan | `cc.check` |
| Looks good | Semuanya baik | `cc.good` |
| No issues found with this chart. | Tiada masalah ditemui pada carta ini. | `cc.goodText` |
| Planned start | Jangkaan mula | `cc.start` |
| Entries ({n}) | Peserta ({n}) | `cc.entries` |
| No entries assigned yet | Belum ada peserta diagihkan | `cc.none` |
| Confirm Group {g} chart? | Sahkan carta Kumpulan {g}? | `cc.title` |

### Stage 4 (knockout) (10)

| English | BM (coined) | Key |
|---|---|---|
| Generate & confirm bracket | Jana & sahkan bracket | `s4k.title` |
| Builds the knockout bracket from the seed order set in Chart details. You can regenerate it any time before you start entering results. | Membina bracket kalah mati daripada susunan seed yang ditetapkan dalam Butiran carta. Anda boleh menjana semula pada bila-bila masa sebelum mula memasukkan keputusan. | `s4k.introSeeded` |
| This discards all results entered so far and rebuilds a fresh blank bracket from the current seed order. | Ini membuang semua keputusan yang telah dimasukkan dan membina semula bracket kosong baharu daripada susunan seed semasa. | `s4k.discardSeeded` |
| This discards all results entered so far and rebuilds a fresh blank bracket from a new random draw. | Ini membuang semua keputusan yang telah dimasukkan dan membina semula bracket kosong baharu daripada undian rawak baharu. | `s4k.discardRandom` |
| Builds the knockout bracket from the current seed order. | Membina bracket kalah mati daripada susunan seed semasa. | `s4k.buildSeeded` |
| Builds the knockout bracket from a fresh random draw. | Membina bracket kalah mati daripada undian rawak baharu. | `s4k.buildRandom` |
| Regenerate bracket? | Jana semula bracket? | `s4k.regenTitle` |
| Generate bracket? | Jana bracket? | `s4k.genTitle` |
| Regenerate | Jana semula | `s4k.regenBtn` |
| Generate | Jana | `s4k.genBtn` |

### lineup.* (10)

| English | BM (coined) | Key |
|---|---|---|
| {n} copies | {n} salinan | `lineup.copies` |
| Print all ready lineup sheets ({n}) | Cetak semua borang barisan yang sedia ({n}) | `lineup.printAllN` |
| No knockout match has both teams known yet. | Belum ada perlawanan kalah mati yang kedua-dua pasukannya diketahui. | `lineup.noneReady` |
| For a fixture added on the day or a spoiled sheet, print an empty lineup sheet. | Untuk perlawanan yang ditambah pada hari kejohanan atau borang yang rosak, cetak borang barisan kosong. | `lineup.introRr` |
| Round robin lineup sheets are in the print pack: tick the lineup sheet box on the print step. | Borang barisan round robin ada dalam set cetakan: tandakan kotak borang barisan pada langkah cetak. | `lineup.rrInPack` |
| No knockout yet. | Belum ada kalah mati. | `lineup.noKo` |
| Lineup sheet not ready | Borang barisan belum sedia | `lineup.notReady` |
| Both teams of this match must be known before its lineup sheet can be printed. | Kedua-dua pasukan perlawanan ini mesti diketahui sebelum borang barisannya boleh dicetak. | `lineup.notReadyText` |
| No lineup sheets waiting | Tiada borang barisan yang menunggu | `lineup.noneWaiting` |
| Every knockout match whose two teams are known already has its lineup sheet printed. Use Print lineup on a match to print one again. | Setiap perlawanan kalah mati yang kedua-dua pasukannya diketahui sudah dicetak borang barisannya. Gunakan Cetak borang pada perlawanan untuk mencetaknya semula. | `lineup.noneWaitingText` |

### tooMany.* (9)

| English | BM (coined) | Key |
|---|---|---|
| {n} entries would go into one bracket, but the largest bracket holds {max}. | {n} peserta akan dimasukkan ke dalam satu bracket, tetapi bracket terbesar hanya memuatkan {max}. | `tooMany.one` |
| {n} entries would go into this knockout, but the largest bracket holds {max}. | {n} peserta akan dimasukkan ke dalam kalah mati ini, tetapi bracket terbesar hanya memuatkan {max}. | `tooMany.ko` |
| {n} entries would go into the main bracket, but the largest bracket holds {max}. | {n} peserta akan dimasukkan ke dalam bracket utama, tetapi bracket terbesar hanya memuatkan {max}. | `tooMany.main` |
| {n} entries would go into the Plate pool, but the largest bracket holds {max}. | {n} peserta akan dimasukkan ke dalam saingan Plate, tetapi bracket terbesar hanya memuatkan {max}. | `tooMany.plate` |
| Use fewer groups (only each group winner goes through already). | Gunakan lebih sedikit kumpulan (sekarang pun hanya pemenang setiap kumpulan yang mara). | `tooMany.mainHintOne` |
| Lower "Entries per group (advance to knockout)" in Format & branding. | Kurangkan "Peserta setiap kumpulan (mara ke kalah mati)" dalam Format & penjenamaan. | `tooMany.mainHint` |
| Set or lower "Plate entries per group" in Format & branding, or turn the Plate pool off. | Tetapkan atau kurangkan "Peserta Plate setiap kumpulan" dalam Format & penjenamaan, atau matikan saingan Plate. | `tooMany.plateHint` |
| Too many entries for one bracket | Terlalu ramai peserta untuk satu bracket | `tooMany.title` |
| {msg} Use Group Boards (Knockout type) for a field this big, or lower the number of entries. | {msg} Gunakan Group Boards (Jenis kalah mati) untuk bilangan peserta seramai ini, atau kurangkan bilangan peserta. | `tooMany.koText` |

### start.* (9)

| English | BM (coined) | Key |
|---|---|---|
| Start this game? | Mulakan perlawanan ini? | `start.oneTitle` |
| Group {g} will unlock for score entry, and positions will start being calculated from results as they come in. You can still edit or reprint the chart afterwards. | Kumpulan {g} akan dibuka untuk kemasukan skor, dan kedudukan akan mula dikira daripada keputusan yang masuk. Anda masih boleh mengedit atau mencetak semula carta selepas itu. | `start.oneText` |
| Start game | Mulakan perlawanan | `start.oneBtn` |
| No confirmed charts | Tiada carta disahkan | `start.noCharts` |
| Confirm at least one group chart in Confirm & Print Bracket before starting games. | Sahkan sekurang-kurangnya satu carta kumpulan dalam Sahkan & Cetak Bracket sebelum memulakan perlawanan. | `start.noChartsText` |
| Already started | Sudah bermula | `start.already` |
| All confirmed charts already have their game started. | Perlawanan dalam semua carta yang disahkan sudah bermula. | `start.alreadyText` |
| Suggestion: print the pack firstYou haven't printed this pack yet. It's best to print the blank charts before starting, so boards/times are locked in on paper before scores start coming in. You can still start now without printing if you prefer. | Cadangan: cetak set dahuluAnda belum mencetak set ini. Sebaik-baiknya cetak carta kosong sebelum bermula, supaya board/masa tercatat di atas kertas sebelum skor mula masuk. Anda masih boleh bermula sekarang tanpa mencetak jika mahu. | `start.suggest` |
| This starts the game for all {n} confirmed charts at once — unlocking score entry and position calculation for every one of them. Games can't be started individually, only all together like this. | Ini memulakan perlawanan bagi kesemua {n} carta yang disahkan sekali gus — membuka kemasukan skor dan pengiraan kedudukan bagi setiap carta. Perlawanan tidak boleh dimulakan satu demi satu, hanya serentak seperti ini. | `start.text` |

### recover.* (8)

| English | BM (coined) | Key |
|---|---|---|
| an event | satu acara | `recover.anEvent` |
| Unsaved change not restored | Perubahan yang belum disimpan tidak dipulihkan | `recover.notTitle` |
| When you were signed out, a change to {name} had not been saved yet. The event has been changed since, so it was not restored. Check it and enter the change again. | Semasa anda dilog keluar, satu perubahan pada {name} belum disimpan. Acara itu telah diubah sejak itu, jadi perubahan tersebut tidak dipulihkan. Semak acara itu dan masukkan perubahan itu semula. | `recover.changed` |
| Restore your unsaved change? | Pulihkan perubahan anda yang belum disimpan? | `recover.title` |
| When you were signed out, a change to {name} had not been saved yet. DartDraw kept it in this browser. Restore it now? | Semasa anda dilog keluar, satu perubahan pada {name} belum disimpan. DartDraw menyimpannya dalam pelayar ini. Pulihkan sekarang? | `recover.text` |
| Restore | Pulihkan | `recover.restore` |
| The change could not be restored. Check the event and enter the change again. | Perubahan itu tidak dapat dipulihkan. Semak acara itu dan masukkan perubahan itu semula. | `recover.failed` |
| The change could not be restored: the event was changed in the meantime. Check the event and enter the change again. | Perubahan itu tidak dapat dipulihkan: acara itu telah diubah sementara itu. Semak acara itu dan masukkan perubahan itu semula. | `recover.failed409` |

### swap.* (8)

| English | BM (coined) | Key |
|---|---|---|
| Position {n} | Kedudukan {n} | `swap.position` |
| {name} — currently here | {name} — kini di sini | `swap.here` |
| {name} — this group has started | {name} — kumpulan ini telah bermula | `swap.started` |
| blank — moves here | kosong — pindah ke sini | `swap.blank` |
| Swap {name} with… | Tukar {name} dengan… | `swap.title` |
| Pick a Group + Position. If it's occupied, the two swap places; if blank, {name} moves there. | Pilih Kumpulan + Kedudukan. Jika sudah diisi, kedua-duanya bertukar tempat; jika kosong, {name} berpindah ke situ. | `swap.text` |
| Uneven groups | Kumpulan tidak seimbang | `swap.uneven` |
| After that move, group sizes now range from {a} to {b} entries. Still fine to proceed — just flagging it. | Selepas pemindahan itu, saiz kumpulan kini antara {a} hingga {b} peserta. Anda masih boleh meneruskan — ini sekadar makluman. | `swap.unevenText` |

### sheet.* (8)

| English | BM (coined) | Key |
|---|---|---|
| (Bd {n}) | (Board {n}) | `sheet.bd` |
| · Marker: {n} | · Pencatat: {n} | `sheet.marker` |
| Match {i}{bd} · {a} v {b}{marker} | Perlawanan {i}{bd} · {a} lwn {b}{marker} | `sheet.match` |
| {catUnit} · Round Robin Stage · {legs} · {date} | {catUnit} · Peringkat Round Robin · {legs} · {date} | `sheet.rrSub` |
| Best of {n} Legs | Terbaik daripada {n} Leg | `sheet.bestOfLegs` |
| GROUP {g} | KUMPULAN {g} | `sheet.group` |
| Points: Win 2 · Draw 1 · Loss 0 | Tie-break: {list} | Mata: Menang 2 · Seri 1 · Kalah 0 | Pemecah seri: {list} | `sheet.footer` |
| | * Position set manually by organiser | | * Kedudukan ditetapkan secara manual oleh penganjur | `sheet.override` |

### noshow.* (7)

| English | BM (coined) | Key |
|---|---|---|
| Mark a no-show | Tandakan tidak hadir | `noshow.koTitle` |
| Choose who didn't show up. The other side is advanced as a {m}–0 walkover win, tagged WO. If neither showed, nobody advances and the next opponent gets a bye. | Pilih siapa yang tidak hadir. Pihak lawan mara dengan menang walkover {m}–0, ditanda WO. Jika kedua-dua tidak hadir, tiada sesiapa yang mara dan lawan seterusnya mendapat bye. | `noshow.koText` |
| This no-show can no longer be undone | Ketidakhadiran ini tidak boleh dibuat asal lagi | `noshow.undoGone` |
| Mark no-show… | Tandakan tidak hadir… | `noshow.markBtn` |
| marked WO | ditanda WO | `noshow.marked` |
| Mark a no-show — Group {g} | Tandakan tidak hadir — Kumpulan {g} | `noshow.groupTitle` |
| Choose who didn't show up. Their remaining unscored matches in this group are filled in as a {m}–0 walkover loss, tagged WO. | Pilih siapa yang tidak hadir. Baki perlawanan mereka yang belum ada skor dalam kumpulan ini diisi sebagai kalah walkover {m}–0, ditanda WO. | `noshow.groupText` |

### pop.* (7)

| English | BM (coined) | Key |
|---|---|---|
| Nothing to print yet | Belum ada apa-apa untuk dicetak | `pop.nothing` |
| There is no chart in this window to print. | Tiada carta dalam tetingkap ini untuk dicetak. | `pop.nothingText` |
| No tournament open. | Tiada kejohanan dibuka. | `pop.noTournament` |
| No bracket yet — generate one in Confirm & Print Bracket, then reopen this window. | Belum ada bracket — jana bracket dalam Sahkan & Cetak Bracket, kemudian buka semula tetingkap ini. | `pop.noBracket` |
| Champion: {name} | Juara: {name} | `pop.champion` |
| No confirmed charts yet — confirm at least one group in Confirm & Print Bracket, then reopen this window. | Belum ada carta disahkan — sahkan sekurang-kurangnya satu kumpulan dalam Sahkan & Cetak Bracket, kemudian buka semula tetingkap ini. | `pop.noCharts` |
| {name} · Round robin · {n} charts | {name} · Round robin · {n} carta | `pop.rrSub` |

### Stage 1 Event creation (7)

| English | BM (coined) | Key |
|---|---|---|
| Each entry is a pair of two players: 24 players make 12 pairs. | Setiap peserta ialah sepasang pemain: 24 pemain menjadi 12 pasangan. | `s1.nPairsHint` |
| Each entry is one team. Captains write their line-up on the day. | Setiap peserta ialah satu pasukan. Kapten menulis barisan pemain pada hari kejohanan. | `s1.nTeamsHint` |
| {unit} (existing event) | {unit} (acara sedia ada) | `s1.existingUnit` |
| Games have started, so a Teams event stays Teams. | Perlawanan telah bermula, jadi acara Berpasukan kekal Berpasukan. | `s1.teamsLocked` |
| Number of boards is set in Scheduling (Format & branding, next step). | Bilangan board ditetapkan dalam Penjadualan (Format & penjenamaan, langkah seterusnya). | `s1.boardsHint` |
| Lowering the number of entries to {requested} would remove the last {m} from the list, and {names} are already playing: their group has started, they have a result, or they are in the drawn knockout. Removing them would delete results already played. | Mengurangkan bilangan peserta kepada {requested} akan membuang {m} peserta terakhir daripada senarai, dan {names} sudah mula bermain: kumpulan mereka telah bermula, mereka mempunyai keputusan, atau mereka berada dalam undian kalah mati. Membuang mereka akan memadam keputusan yang telah dimainkan. | `s1.inPlayText` |
| Nothing has been saved: change the number back to {active}. To take someone out of the rest of the event, use Mark no-show… instead. | Tiada apa-apa yang disimpan: tukar semula bilangan itu kepada {active}. Untuk mengeluarkan seseorang daripada baki acara, gunakan Tandakan tidak hadir… sebagai gantinya. | `s1.inPlayText2` |

### ctx.* (7)

| English | BM (coined) | Key |
|---|---|---|
| {what} per match | {what} setiap perlawanan | `ctx.perMatch` |
| best of {n} legs | terbaik daripada {n} leg | `ctx.bestOf` |
| {size}-entry bracket ({n} byes) | bracket {size} slot ({n} bye) | `ctx.bracket` |
| {n} groups, then a {size}-slot Finals | {n} kumpulan, kemudian Peringkat Akhir {size} slot | `ctx.pods` |
| {n} matches each | {n} perlawanan setiap satu | `ctx.matchesEach` |
| {n} groups of {size} ({matches}) | {n} kumpulan berisi {size} ({matches}) | `ctx.groupsEven` |
| {n} groups — {a} of {size} entries ({m1} matches), {r} of {size1} entries ({m2} matches) | {n} kumpulan — {a} kumpulan berisi {size} peserta ({m1} perlawanan), {r} kumpulan berisi {size1} peserta ({m2} perlawanan) | `ctx.groupsUneven` |

### rr.* (7)

| English | BM (coined) | Key |
|---|---|---|
| The knockout has already been drawn from the group standings, so a result in Group {g} can no longer be cleared: the group would be unfinished, and the knockout can only be drawn from finished groups. To fix a wrong score, enter the right score and click Save score. If that changes who goes through, use Regenerate from current standings (it discards any knockout results, and asks first). | Undian kalah mati telah dibuat daripada kedudukan kumpulan, jadi keputusan dalam Kumpulan {g} tidak boleh dikosongkan lagi: kumpulan itu akan menjadi belum selesai, dan undian kalah mati hanya boleh dibuat daripada kumpulan yang telah selesai. Untuk membetulkan skor yang salah, masukkan skor yang betul dan klik Simpan skor. Jika itu mengubah siapa yang mara, gunakan Jana semula daripada kedudukan semasa (ia membuang semua keputusan kalah mati, dan bertanya dahulu). | `rr.clearBlocked` |
| The knockout has already been drawn from the group standings, so a no-show in Group {g} can no longer be undone: undoing it would remove its walkover results and leave the group unfinished, and the knockout can only be drawn from finished groups. If they did play a match after all, enter the real score over the WO box and click Save score. | Undian kalah mati telah dibuat daripada kedudukan kumpulan, jadi ketidakhadiran dalam Kumpulan {g} tidak boleh dibuat asal lagi: membuat asal akan membuang keputusan walkovernya dan menjadikan kumpulan belum selesai, dan undian kalah mati hanya boleh dibuat daripada kumpulan yang telah selesai. Jika perlawanan itu sebenarnya dimainkan, masukkan skor sebenar pada kotak WO dan klik Simpan skor. | `rr.undoBlocked` |
| This group no longer exists. | Kumpulan ini tiada lagi. | `rr.noGroup` |
| a walkover | walkover | `rr.aWalkover` |
| {a} v {b} ({shown}) goes back to not played. The Group {g} standings are worked out again. | {a} lwn {b} ({shown}) kembali kepada belum dimainkan. Kedudukan Kumpulan {g} dikira semula. | `rr.clearText` |
| Best of {n} legs — a side can score at most {m}. | Terbaik daripada {n} leg — satu pihak boleh mendapat paling banyak {m}. | `rr.score.hint` |
| Not a valid finished result for best of {n} legs — the winner must have exactly {m} legs, and the loser fewer. (e.g. {m}–0 up to {m}–{m1}). | Keputusan ini tidak sah bagi perlawanan terbaik daripada {n} leg — pemenang mesti mempunyai tepat {m} leg, dan yang kalah kurang daripada itu (cth. {m}–0 hingga {m}–{m1}). | `rr.score.err.invalid` |

### ties.* (7)

| English | BM (coined) | Key |
|---|---|---|
| Group {g}: {who} are level on {pts} pts for places {a}–{b} and no tie-break rule separates them. | Kumpulan {g}: {who} sama mata dengan {pts} mata untuk tempat {a}–{b} dan tiada peraturan pemecah seri yang memisahkan mereka. | `ties.item` |
| Finalize standings and Print stay locked until every tie is resolved. Settle them (a playoff or organiser decision), then use Adjust positions… on the group in Manage Tournament to set the order. | Muktamadkan Kedudukan dan Cetak kekal dikunci sehingga setiap kedudukan sama mata diselesaikan. Selesaikannya (perlawanan penentuan atau keputusan penganjur), kemudian gunakan Laraskan kedudukan… pada kumpulan itu dalam Urus Kejohanan untuk menetapkan susunan. | `ties.locked` |
| Go to Manage Tournament | Pergi ke Urus Kejohanan | `ties.goManage` |
| Group {g}: {who} are level on {pts} pts for places {a}–{b} and no tie-break rule separates them. The cut-off for {cuts} falls inside that tie, so who gets through can't be decided automatically. | Kumpulan {g}: {who} sama mata dengan {pts} mata untuk tempat {a}–{b} dan tiada peraturan pemecah seri yang memisahkan mereka. Garisan kelayakan untuk {cuts} jatuh dalam kedudukan sama mata itu, jadi siapa yang mara tidak boleh ditentukan secara automatik. | `ties.cutItem` |
| advancing to the main bracket | mara ke bracket utama | `ties.cutMain` |
| making the Plate pool | layak ke saingan Plate | `ties.cutPlate` |
| The knockout can't be generated until these are resolved. Settle them (a playoff or organiser decision), then use Adjust positions… on the group in Manage Tournament to set the order and generate again. | Bracket kalah mati tidak boleh dijana sehingga semua ini diselesaikan. Selesaikannya (perlawanan penentuan atau keputusan penganjur), kemudian gunakan Laraskan kedudukan… pada kumpulan itu dalam Urus Kejohanan untuk menetapkan susunan dan jana semula. | `ties.cutLocked` |

### Stage 7 Print Final Chart (7)

| English | BM (coined) | Key |
|---|---|---|
| Export the completed pack with entered scores and final standings, as a high-resolution A4 landscape PDF. | Eksport set lengkap dengan skor yang dimasukkan dan kedudukan akhir, sebagai PDF A4 melintang beresolusi tinggi. | `s7.intro` |
| Resolution | Resolusi | `s7.resolution` |
| High-resolution | Resolusi tinggi | `s7.highRes` |
| Games started | Perlawanan telah bermula | `s7.gamesStarted` |
| Some games haven't started | Ada perlawanan yang belum bermula | `s7.someNot` |
| {n} confirmed charts will print with scores still locked/blank. Go to Manage Tournament to start them first if that's not intended. | {n} carta yang disahkan akan dicetak dengan skor yang masih dikunci/kosong. Pergi ke Urus Kejohanan untuk memulakannya dahulu jika itu bukan yang anda mahukan. | `s7.someNotText` |
| The knockout bracket (and Plate pool, if enabled) prints as extra pages after the group charts. | Bracket kalah mati (dan saingan Plate, jika dihidupkan) dicetak sebagai halaman tambahan selepas carta kumpulan. | `s7.koExtra` |

### help.* (6)

| English | BM (coined) | Key |
|---|---|---|
| Help for this step (opens in a new tab) | Bantuan untuk langkah ini (dibuka dalam tab baharu) | `help.forStep` |
| What does this mean? | Apakah maksudnya? | `help.whatMeans` |
| Help: {label} (opens in a new tab) | Bantuan: {label} (dibuka dalam tab baharu) | `help.qLabel` |
| Help: {label} | Bantuan: {label} | `help.qTitle` |
| Help: step {n}, {title} (opens in a new tab) | Bantuan: langkah {n}, {title} (dibuka dalam tab baharu) | `help.stepLabel` |
| Learn more in Help | Ketahui lebih lanjut dalam Bantuan | `help.learnMore` |

### checkin.* (6)

| English | BM (coined) | Key |
|---|---|---|
| check-in | daftar masuk | `checkin.helpLabel` |
| Tick off each {unit} as they arrive on the day. This is just a record for you — it doesn't stop you confirming, printing or starting. | Tandakan setiap {unit} apabila mereka tiba pada hari kejohanan. Ini hanyalah rekod untuk anda — ia tidak menghalang anda daripada mengesahkan, mencetak atau memulakan. | `checkin.intro` |
| {done} of {n} checked in | {done} daripada {n} telah daftar masuk | `checkin.count` |
| Search {unit} name… | Cari nama {unit}… | `checkin.search` |
| No matching name. | Tiada nama yang sepadan. | `checkin.noMatch` |
| {n} entries not yet checked in: {names}. You can still proceed. | {n} peserta belum daftar masuk: {names}. Anda masih boleh meneruskan. | `checkin.warn` |

### prev.* (6)

| English | BM (coined) | Key |
|---|---|---|
| ← Previous | ← Sebelumnya | `prev.previous` |
| Next → | Seterusnya → | `prev.next` |
| · Confirmed | · Disahkan | `prev.confirmed` |
| · Not confirmed | · Belum disahkan | `prev.notConfirmed` |
| · Game started | · Perlawanan telah bermula | `prev.started` |
| · Not started | · Belum bermula | `prev.notStarted` |

### qr.* (6)

| English | BM (coined) | Key |
|---|---|---|
| A sample event prints without QR codesIt cannot be published. Save it as your event to publish it. | Acara contoh dicetak tanpa kod QRIa tidak boleh diterbitkan. Simpan sebagai acara anda untuk menerbitkannya. | `qr.sample` |
| These sheets will print without QR codesThe address of the public results site isn't set up yet, so no QR code can be printed. Ask your admin. Everything else prints as normal. | Helaian ini akan dicetak tanpa kod QRAlamat laman keputusan awam belum ditetapkan, jadi kod QR tidak boleh dicetak. Tanya pentadbir anda. Semua yang lain dicetak seperti biasa. | `qr.noSite` |
| Publishing is off, so these sheets will have no QR codeQR codes only print while Publish results is on (on Manage Tournament, step 5). If spectators will follow on their phones, publish first, then print. Anyone with the link can then see the draw and, later, the scores. | Penerbitan dimatikan, jadi kod QR tidak akan dicetak pada helaian iniKod QR hanya dicetak semasa Terbitkan keputusan dihidupkan (dalam Urus Kejohanan, langkah 5). Jika penonton akan mengikuti acara melalui telefon, terbitkan dahulu, kemudian cetak. Sesiapa yang mempunyai pautan akan dapat melihat undian, dan kemudiannya skor. | `qr.off` |
| QR codes on printed sheets | kod QR pada helaian bercetak | `qr.helpLabel` |
| Publishing… print the pack once the status says Saved, so the QR codes work. | Menerbitkan… cetak set selepas status menunjukkan Disimpan, supaya kod QR berfungsi. | `qr.publishing` |
| Live resultsScan, or go to | Keputusan langsungImbas, atau layari | `qr.block` |

### Stage 6 Finalize Standings (6)

| English | BM (coined) | Key |
|---|---|---|
| Review each group's final standings before printing. This page is read-only — if you spot an issue, go back to Manage Tournament to fix a score. | Semak kedudukan akhir setiap kumpulan sebelum mencetak. Halaman ini untuk bacaan sahaja — jika anda menemui masalah, kembali ke Urus Kejohanan untuk membetulkan skor. | `s6.intro` |
| No confirmed charts yet. | Belum ada carta disahkan. | `s6.none` |
| Game hasn't started yet — standings will appear here once scores are entered in Manage Tournament. | Perlawanan belum bermula — kedudukan akan dipaparkan di sini selepas skor dimasukkan dalam Urus Kejohanan. | `s6.notStarted` |
| 🏆 Winner: {name} | 🏆 Pemenang: {name} | `s6.winner` |
| No championThe final was marked "neither showed". | Tiada juaraPerlawanan akhir ditanda "kedua-dua tidak hadir". | `s6.noChampion` |
| Not complete yet. | Belum selesai. | `s6.notComplete` |

### autoName.* (5)

| English | BM (coined) | Key |
|---|---|---|
| Entry {label} | Peserta {label} | `autoName.entry` |
| Player {label} | Pemain {label} | `autoName.player` |
| Pair {label} | Pasangan {label} | `autoName.pair` |
| Triple {label} | Trio {label} | `autoName.triple` |
| Team {label} | Pasukan {label} | `autoName.team` |

### kolabel.* (5)

| English | BM (coined) | Key |
|---|---|---|
| Main bracket | bracket utama | `kolabel.mainMid` |
| Plate pool | saingan Plate | `kolabel.plateMid` |
| Main bracket (projected) | bracket utama (unjuran) | `kolabel.mainProjMid` |
| Plate pool (projected) | Saingan Plate (unjuran) | `kolabel.plateProj` |
| Plate pool (projected) | saingan Plate (unjuran) | `kolabel.plateProjMid` |

### roster.* (5)

| English | BM (coined) | Key |
|---|---|---|
| The groups can no longer be redrawn | Kumpulan tidak boleh diundi semula lagi | `roster.redraw.title` |
| Entries can no longer be swapped | Peserta tidak boleh ditukar lagi | `roster.swap.title` |
| Groups {labels} have started, so a new draw would leave results already played with entries who did not play them, and change the table. | Kumpulan {labels} telah bermula, jadi undian baharu akan menyebabkan keputusan yang telah dimainkan berada pada peserta yang tidak memainkannya, dan mengubah jadual kedudukan. | `roster.redraw.text` |
| Groups {labels} have started, so swapping or moving an entry would leave results already played with entries who did not play them, and change the table. | Kumpulan {labels} telah bermula, jadi menukar atau memindahkan peserta akan menyebabkan keputusan yang telah dimainkan berada pada peserta yang tidak memainkannya, dan mengubah jadual kedudukan. | `roster.swap.text` |
| To take someone out of the rest of the event, use Mark no-show… instead: their remaining matches become walkover losses. | Untuk mengeluarkan seseorang daripada baki acara, gunakan Tandakan tidak hadir… sebagai gantinya: baki perlawanan mereka menjadi kalah walkover. | `roster.noShowHint` |

### pub.* (5)

| English | BM (coined) | Key |
|---|---|---|
| Copy this link: | Salin pautan ini: | `pub.copyThis` |
| The address of the public site isn't set up yet. | Alamat laman awam belum ditetapkan. | `pub.noSite` |
| A sample event can&rsquo;t be published. Click Save as my event at the top to keep it; you can then publish it here. | Acara contoh tidak boleh diterbitkan. Klik Simpan sebagai acara saya di bahagian atas untuk menyimpannya; anda kemudian boleh menerbitkannya di sini. | `pub.sample` |
| Results are published, but the address of the public site isn't set up yet. Add the VIEWER_URL environment variable to this project (see the README), redeploy, and the link will appear here. | Keputusan telah diterbitkan, tetapi alamat laman awam belum ditetapkan. Tambah pemboleh ubah persekitaran VIEWER_URL pada projek ini (lihat README), lakukan deploy semula, dan pautan akan dipaparkan di sini. | `pub.noSiteLong` |
| Your code is {code}. | Kod anda ialah {code}. | `pub.code` |

### Stage 5 Manage Tournament (5)

| English | BM (coined) | Key |
|---|---|---|
| {a} of {n} confirmed charts started. | {a} daripada {n} carta yang disahkan telah bermula. | `s5.startedOf` |
| Want live on-schedule tracking here? Set an anticipated start time in Format & Branding and each board will show whether it's on schedule as play happens. Go to Format & Branding | Mahu penjejakan jadual secara langsung di sini? Tetapkan jangkaan masa mula dalam Format & penjenamaan dan setiap board akan menunjukkan sama ada ia menepati jadual semasa permainan berlangsung. Pergi ke Format & penjenamaan | `s5.wantTracking` |
| Positions manually adjusted | Kedudukan dilaraskan secara manual | `s5.adjusted` |
| Round robin charts ({n}) | Carta round robin ({n}) | `s5.rrCharts` |
| Knockout bracket generated from these standings — click to review or adjust a score. | Bracket kalah mati dijana daripada kedudukan ini — klik untuk menyemak atau melaraskan skor. | `s5.rrChartsHint` |

### Board plan (5)

| English | BM (coined) | Key |
|---|---|---|
| Group {g} · {round} | Kumpulan {g} · {round} | `bp.whereGroup` |
| · waiting for an earlier match | · menunggu perlawanan sebelumnya | `bp.waiting` |
| Estimated times are off. Set an anticipated start time in Format & branding to switch them on. | Anggaran masa dimatikan. Tetapkan jangkaan masa mula dalam Format & penjenamaan untuk menghidupkannya. | `bp.timesOff` |
| Include the Players A–Z sheet (name, group and board, for the wall) | Sertakan helaian Pemain A–Z (nama, kumpulan dan board, untuk ditampal di dinding) | `bp.playersSheet` |
| Include the Boards sheet (which groups play on each board) | Sertakan helaian Board (kumpulan yang bermain di setiap board) | `bp.boardsSheet` |

### draw.* (4)

| English | BM (coined) | Key |
|---|---|---|
| Random draw? | Undian rawak? | `draw.title` |
| Randomly re-deals every entry into a new group. This discards any manual swaps you've made, and un-confirms any chart whose entries change. | Mengagihkan semula setiap peserta secara rawak ke kumpulan baharu. Ini membuang sebarang pertukaran manual yang telah anda buat, dan membatalkan pengesahan mana-mana carta yang pesertanya berubah. | `draw.text` |
| Randomly re-deals every entry into a new group (still avoiding same-organisation clashes where possible). This discards any manual swaps you've made, and un-confirms any chart whose entries change. | Mengagihkan semula setiap peserta secara rawak ke kumpulan baharu (masih mengelakkan pertembungan sesama organisasi jika boleh). Ini membuang sebarang pertukaran manual yang telah anda buat, dan membatalkan pengesahan mana-mana carta yang pesertanya berubah. | `draw.textOrg` |
| Draw | Buat undian | `draw.confirm` |

### welcome.* (4)

| English | BM (coined) | Key |
|---|---|---|
| Welcome to DartDraw | Selamat datang ke DartDraw | `welcome.title` |
| Start a new tournament or open a saved one from the left. | Mulakan kejohanan baharu atau buka kejohanan yang disimpan di sebelah kiri. | `welcome.sub` |
| No tournament open | Tiada kejohanan dibuka | `welcome.none` |
| Click "New tournament" in the sidebar to begin, or choose a saved tournament. | Klik "Kejohanan baharu" di bar sisi untuk bermula, atau pilih kejohanan yang disimpan. | `welcome.text` |

### pos.* (4)

| English | BM (coined) | Key |
|---|---|---|
| {pts} pts | {pts} mata | `pos.pts` |
| {pts} pts · auto pos. {auto} | {pts} mata · ked. automatik {auto} | `pos.ptsAuto` |
| Reset | Set semula | `pos.reset` |
| Adjust positions — Group {g} | Laraskan kedudukan — Kumpulan {g} | `pos.title` |

### stale.* (3)

| English | BM (coined) | Key |
|---|---|---|
| Updated elsewhere — reload to get the latest. This event was changed in another window, tab or device. Your last change here was not saved. Reload, then enter it again if it is missing. | Dikemas kini di tempat lain — muat semula untuk mendapatkan versi terkini. Acara ini telah diubah dalam tetingkap, tab atau peranti lain. Perubahan terakhir anda di sini tidak disimpan. Muat semula, kemudian masukkan perubahan itu semula jika ia hilang. | `stale.banner` |
| Updated elsewhere | Dikemas kini di tempat lain | `stale.title` |
| This event was changed in another window, tab or device. Reload it to get the latest copy first. | Acara ini telah diubah dalam tetingkap, tab atau peranti lain. Muat semula dahulu untuk mendapatkan versi terkini. | `stale.reloadFirst` |

### limit.* (3)

| English | BM (coined) | Key |
|---|---|---|
| Basic accounts allow up to {n} entries per event. Ask the Admin to upgrade you to Pro. | Akaun Asas membenarkan sehingga {n} peserta bagi setiap acara. Minta Pentadbir menaik taraf akaun anda ke Pro. | `limit.message` |
| Entry limit reached | Had peserta dicapai | `limit.title` |
| Basic: up to {n} entries per event. | Asas: sehingga {n} peserta bagi setiap acara. | `limit.hint` |

### switch.* (3)

| English | BM (coined) | Key |
|---|---|---|
| Your last change to {name} was not saved: this event was changed in another window, tab or device. You are still on it. Click Reload to get the latest copy and enter your change again, or leave without it. | Perubahan terakhir anda pada {name} tidak disimpan: acara ini telah diubah dalam tetingkap, tab atau peranti lain. Anda masih berada pada acara ini. Klik Muat semula untuk mendapatkan versi terkini dan masukkan perubahan anda semula, atau keluar tanpanya. | `switch.stale` |
| Leave without it | Keluar tanpanya | `switch.leaveWithout` |
| Your last change to {name} has not been saved yet (check your connection), so you are still on it. Click "Couldn’t save — click to retry" until it says Saved, then try again. Or leave without it. | Perubahan terakhir anda pada {name} belum disimpan (semak sambungan anda), jadi anda masih berada pada acara ini. Klik "Gagal disimpan — klik untuk cuba lagi" sehingga tertera Disimpan, kemudian cuba lagi. Atau keluar tanpanya. | `switch.notSaved` |

### org.* (3)

| English | BM (coined) | Key |
|---|---|---|
| Public mode — no login required | Mod awam — tidak perlu log masuk | `org.publicMode` |
| Up to {n} entries per event | Sehingga {n} peserta bagi setiap acara | `org.tierTitle` |
| Admin | Pentadbir | `org.admin` |

### nw.* (3)

| English | BM (coined) | Key |
|---|---|---|
| Save first | Simpan dahulu | `nw.saveFirst` |
| Save this tournament (Event Creation → Save) before opening it in a new window. | Simpan kejohanan ini (Cipta acara → Simpan) sebelum membukanya dalam tetingkap baharu. | `nw.saveFirstText` |
| New window blocked | Tetingkap baharu disekat | `nw.blocked` |

### saved.* (3)

| English | BM (coined) | Key |
|---|---|---|
| · Finalized | · Dimuktamadkan | `saved.finalized` |
| No saved tournaments yet. | Belum ada kejohanan yang disimpan. | `saved.none` |
| {n} group charts | {n} carta kumpulan | `saved.charts` |

### sum.* (3)

| English | BM (coined) | Key |
|---|---|---|
| Varies by stage | Berbeza mengikut peringkat | `sum.varies` |
| {n} legs | {n} leg | `sum.legs` |
| Uploaded | Dimuat naik | `sum.uploaded` |

### inc.* (3)

| English | BM (coined) | Key |
|---|---|---|
| When | Masa | `inc.when` |
| e.g. Disputed a scoring call on board 3... | cth. Pertikaian keputusan skor di board 3... | `inc.whatPh` |
| Describe what happened. | Terangkan apa yang berlaku. | `inc.describe` |

### print.* (3)

| English | BM (coined) | Key |
|---|---|---|
| No bracket yet | Belum ada bracket | `print.noBracket` |
| Generate the bracket first. | Jana bracket dahulu. | `print.noBracketText` |
| Confirm at least one group chart in Confirm & Print Bracket before exporting. | Sahkan sekurang-kurangnya satu carta kumpulan dalam Sahkan & Cetak Bracket sebelum mengeksport. | `print.noChartsText` |

### noun.* (2)

| English | BM (coined) | Key |
|---|---|---|
| triples | trio | `noun.triple` |
| entries | peserta | `noun.entry` |

### rec.* (2)

| English | BM (coined) | Key |
|---|---|---|
| Recommended: {n} groups of {s} entries each ({total} entries total). Each group plays {m} matches. Change "Maximum entries per group" above if you prefer a different split. | Disyorkan: {n} kumpulan berisi {s} peserta setiap satu ({total} peserta semuanya). Setiap kumpulan bermain {m} perlawanan. Tukar "Maksimum peserta setiap kumpulan" di atas jika anda mahukan pembahagian lain. | `rec.groupsEven` |
| Recommended: {n} groups — {sc} of {ss} entries, {bc} of {bs} entries ({total} entries total). Each group plays {m} matches. Change "Maximum entries per group" above if you prefer a different split. | Disyorkan: {n} kumpulan — {sc} kumpulan berisi {ss} peserta, {bc} kumpulan berisi {bs} peserta ({total} peserta semuanya). Setiap kumpulan bermain {m} perlawanan. Tukar "Maksimum peserta setiap kumpulan" di atas jika anda mahukan pembahagian lain. | `rec.groupsUneven` |

### score.* (2)

| English | BM (coined) | Key |
|---|---|---|
| {name} legs | Leg {name} | `score.legsOf` |
| Enter a leg count for both sides (0 or more). | Masukkan bilangan leg bagi kedua-dua pihak (0 atau lebih). | `score.err.enter` |

### del.* (2)

| English | BM (coined) | Key |
|---|---|---|
| Delete tournament? | Padam kejohanan? | `del.title` |
| This removes it permanently from your account. This cannot be undone. | Kejohanan ini akan dibuang secara kekal daripada akaun anda. Tindakan ini tidak boleh dibuat asal. | `del.text` |

### kol.* (2)

| English | BM (coined) | Key |
|---|---|---|
| Every round before the quarterfinal uses "Early rounds". Odd numbers recommended so a round can't end level. | Setiap pusingan sebelum suku akhir menggunakan "Pusingan awal". Nombor ganjil disyorkan supaya perlawanan tidak berakhir seri. | `kol.hint` |
| Uses the tournament's "Best of legs" value (above) for every knockout round. | Menggunakan nilai "Leg (terbaik daripada)" kejohanan (di atas) untuk setiap pusingan kalah mati. | `kol.flatHint` |

### Stage 5 (knockout) (2)

| English | BM (coined) | Key |
|---|---|---|
| Want live on-schedule tracking here? Set an anticipated start time in Format & Branding and each round will show whether it's on schedule as play happens. Go to Format & Branding | Mahu penjejakan jadual secara langsung di sini? Tetapkan jangkaan masa mula dalam Format & penjenamaan dan setiap pusingan akan menunjukkan sama ada ia menepati jadual semasa permainan berlangsung. Pergi ke Format & penjenamaan | `s5k.wantTracking` |
| Generate the bracket in Confirm & Print Bracket before you can enter results here. | Jana bracket dalam Sahkan & Cetak Bracket sebelum anda boleh memasukkan keputusan di sini. | `s5k.generateFirst` |

### legs.* (1)

| English | BM (coined) | Key |
|---|---|---|
| Even numbers can end in a tie — an odd number is recommended. | Bilangan leg genap boleh menyebabkan keputusan seri — nombor ganjil disyorkan. | `legs.evenWarning` |

### pending.* (1)

| English | BM (coined) | Key |
|---|---|---|
| this event | acara ini | `pending.thisEvent` |

### cw.* (1)

| English | BM (coined) | Key |
|---|---|---|
| {unit} · {format} · Advanced | {unit} · {format} · Lanjutan | `cw.subAdvanced` |

### ren.* (1)

| English | BM (coined) | Key |
|---|---|---|
| Rename tournament | Namakan semula kejohanan | `ren.title` |

### dup.* (1)

| English | BM (coined) | Key |
|---|---|---|
| {name} (copy) | {name} (salinan) | `dup.name` |

### grp.* (1)

| English | BM (coined) | Key |
|---|---|---|
| Group {g} · {boards} | Kumpulan {g} · {boards} | `grp.withBoards` |

### boards.* (1)

| English | BM (coined) | Key |
|---|---|---|
| Board {b}: {n} matches | Board {b}: {n} perlawanan | `boards.split` |

### std.* (1)

| English | BM (coined) | Key |
|---|---|---|
| the standings columns MP, MW, ML, LW, +/-, Pts and TB | lajur kedudukan Main, M, K, LM, +/-, Mata dan TB | `std.helpLabel` |

### locked.* (1)

| English | BM (coined) | Key |
|---|---|---|
| Group {g} hasn't started yet. All games start together, not individually — go to Manage Tournament and click "Start all games" to unlock score entry for every confirmed chart at once. | Kumpulan {g} belum bermula. Semua perlawanan bermula serentak, bukan satu demi satu — pergi ke Urus Kejohanan dan klik "Mulakan semua perlawanan" untuk membuka kemasukan skor bagi semua carta yang disahkan sekali gus. | `locked.text` |

### Stage 6 (knockout) (1)

| English | BM (coined) | Key |
|---|---|---|
| No bracket yet — generate one in Confirm & Print Bracket. | Belum ada bracket — jana bracket dalam Sahkan & Cetak Bracket. | `s6k.none` |

### Stage 7 (knockout) (1)

| English | BM (coined) | Key |
|---|---|---|
| No bracket generated yet — go to Confirm & Print Bracket first. | Belum ada bracket dijana — pergi ke Sahkan & Cetak Bracket dahulu. | `s7k.none` |

## i18n step 5 (2026-10-24): the sign-in and account pages, server messages and e-mails

Tables: `i18n/auth.en.js` / `i18n/auth.ms.js` (the five pages) and `i18n/errors.en.js` / `i18n/errors.ms.js` (the API
error codes, `err.<code>`), e-mails in `api/_lib/emails.js`. Status: **proofread** = the preview's pop-up words the BM
proofread already approved; **final** = decided in an earlier proofread; **coined** = new in step 5, for the proofreader.

### The five pages (46)

| English | BM | Key | Status |
|---|---|---|---|
| Email | E-mel | `auth.email` | proofread (preview pop-up) |
| Password | Kata laluan | `auth.password` | proofread (preview pop-up) |
| Sign in | Log masuk | `auth.signIn` | proofread (preview pop-up) |
| At least 8 characters. | Sekurang-kurangnya 8 aksara. | `auth.pwHint` | coined |
| Could not reach the server. Check your connection and try again. | Tidak dapat menghubungi pelayan. Semak sambungan anda dan cuba lagi. | `auth.offline` | proofread (preview pop-up) |
| Sign in - DartDraw | Log masuk - DartDraw | `login.title` | coined |
| Sign in to manage your tournaments. | Log masuk untuk mengurus kejohanan anda. | `login.sub` | proofread (preview pop-up) |
| Resend verification email | Hantar semula e-mel pengesahan | `login.resend` | coined |
| Signing in… | Sedang log masuk… | `login.signingIn` | coined |
| Forgot password? | Lupa kata laluan? | `login.forgot` | proofread (preview pop-up) |
| Need an account? | Belum ada akaun? | `login.needAccount` | proofread (preview pop-up) |
| Sign up | Daftar | `login.signUp` | proofread (preview pop-up) |
| No account yet? | Belum ada akaun? | `login.noAccount` | final (step 1, landing ctaNote) |
| Accounts are created by the site admin. | Akaun dibuka oleh pentadbir laman. | `login.adminCreates` | final (step 1, landing ctaNote) |
| If that account can be verified, we have sent a new verification link. | Jika akaun itu boleh disahkan, kami telah menghantar pautan pengesahan baharu. | `login.resent` | coined |
| Forgot password - DartDraw | Lupa kata laluan - DartDraw | `forgot.title` | coined |
| Enter your email and we will send you a link to choose a new password. | Masukkan e-mel anda dan kami akan menghantar pautan untuk memilih kata laluan baharu. | `forgot.sub` | coined |
| Send reset link | Hantar pautan set semula | `forgot.send` | coined |
| Sending… | Sedang menghantar… | `forgot.sending` | coined |
| If an account exists for that email, we have sent a link to reset your password. | Jika akaun wujud untuk e-mel itu, kami telah menghantar pautan untuk menetapkan semula kata laluan anda. | `forgot.sent` | coined |
| Back to sign in | Kembali ke log masuk | `forgot.back` | coined |
| Sign up - DartDraw | Daftar - DartDraw | `register.title` | coined |
| Create an organizer account. | Buka akaun penganjur. | `register.intro` | coined |
| Name | Nama | `register.name` | coined |
| Create account | Buka akaun | `register.create` | coined |
| Creating account… | Sedang membuka akaun… | `register.creating` | coined |
| Already have an account? | Sudah ada akaun? | `register.haveAccount` | coined |
| Sign-up is not open yet. Accounts are created by the site admin. | Pendaftaran masih ditutup. Akaun dibuka oleh pentadbir laman. | `register.closed` | coined |
| Check your email to verify your account. | Semak e-mel anda untuk mengesahkan akaun anda. | `register.done` | coined |
| Almost done. | Hampir selesai. | `register.almost` | coined |
| If that email can be registered, we have sent a link to verify it. | Jika e-mel itu boleh didaftarkan, kami telah menghantar pautan untuk mengesahkannya. | `register.sent` | coined |
| Choose a new password - DartDraw | Pilih kata laluan baharu - DartDraw | `reset.title` | coined |
| Choose a new password. | Pilih kata laluan baharu. | `reset.sub` | coined |
| New password | Kata laluan baharu | `reset.new` | coined |
| Confirm new password | Sahkan kata laluan baharu | `reset.confirm` | coined |
| Set new password | Tetapkan kata laluan baharu | `reset.set` | coined |
| Saving… | Sedang menyimpan… | `reset.saving` | coined |
| Request a new link | Minta pautan baharu | `reset.newLink` | coined |
| The two passwords do not match. | Kedua-dua kata laluan tidak sepadan. | `reset.mismatch` | coined |
| Your password has been changed. You can now sign in. | Kata laluan anda telah ditukar. Anda kini boleh log masuk. | `reset.done` | coined |
| Verify email - DartDraw | Sahkan e-mel - DartDraw | `verify.title` | coined |
| Email verification | Pengesahan e-mel | `verify.sub` | coined |
| Enter the password you chose when you signed up. | Masukkan kata laluan yang anda pilih semasa mendaftar. | `verify.pwHint` | coined |
| Verify email | Sahkan e-mel | `verify.submit` | coined |
| Verifying… | Sedang mengesahkan… | `verify.verifying` | coined |
| Your email is verified. You can now sign in. | E-mel anda telah disahkan. Anda kini boleh log masuk. | `verify.done` | coined |

The switch keeps "Language / Bahasa", "English" and "Bahasa Malaysia" in both languages (as on the public pages).

### Server error messages people can see (40)

| English (the server's `error`) | BM | Code | Status |
|---|---|---|---|
| Method not allowed | Kaedah tidak dibenarkan | `method_not_allowed` | coined |
| Not found. | Tidak dijumpai. | `not_found` | coined |
| Missing id. | ID tiada. | `missing_id` | coined |
| Not authenticated | Anda belum log masuk atau sesi anda telah tamat. | `not_authenticated` | coined |
| Could not resolve public account. | Tidak dapat mencari akaun awam. | `public_account_failed` | coined |
| Could not verify your session. | Tidak dapat mengesahkan sesi anda. | `session_check_failed` | coined |
| Admin only. | Untuk Pentadbir sahaja. | `admin_only` | coined |
| Email and password are required. | E-mel dan kata laluan diperlukan. | `email_password_required` | coined |
| Too many attempts. Try again later. | Terlalu banyak percubaan. Cuba lagi kemudian. | `rate_limited` | coined |
| Incorrect email or password. | E-mel atau kata laluan tidak betul. | `bad_credentials` | coined |
| Please verify your email first. | Sila sahkan e-mel anda dahulu. | `unverified` | coined |
| This account has been suspended. | Akaun ini telah digantung. | `suspended` | coined |
| Could not sign in. | Tidak dapat log masuk. | `login_failed` | coined |
| Sign-up is not open yet. | Pendaftaran belum dibuka. | `signup_closed` | coined |
| Please enter your name. | Sila masukkan nama anda. | `name_required` | coined |
| Name must be 80 characters or fewer. | Nama mesti 80 aksara atau kurang. | `name_too_long` | coined |
| Please enter a valid email address. | Sila masukkan alamat e-mel yang sah. | `invalid_email` | coined |
| Password must be at least 8 characters. | Kata laluan mesti sekurang-kurangnya 8 aksara. | `password_too_short` | coined |
| Could not create account. | Tidak dapat membuka akaun. | `register_failed` | coined |
| Could not send the email. | Tidak dapat menghantar e-mel. | `mail_failed` | coined |
| This link is invalid or has expired. | Pautan ini tidak sah atau telah tamat tempoh. | `invalid_link` | coined |
| This link is invalid, has expired, or the password is incorrect. | Pautan ini tidak sah, telah tamat tempoh atau kata laluan tidak betul. | `invalid_link_or_password` | coined |
| Could not verify your email. | Tidak dapat mengesahkan e-mel anda. | `verify_failed` | coined |
| Could not reset your password. | Tidak dapat menetapkan semula kata laluan anda. | `reset_failed` | coined |
| Changing the password is not available for this account. | Kata laluan akaun ini tidak boleh ditukar. | `password_change_unavailable` | coined |
| Enter your current password and a new password. | Masukkan kata laluan semasa dan kata laluan baharu anda. | `passwords_required` | coined |
| The new password must be at least 8 characters. | Kata laluan baharu mesti sekurang-kurangnya 8 aksara. | `new_password_too_short` | from the app table (pw.err.min) |
| The new password must be at most 200 characters. | Kata laluan baharu mesti tidak melebihi 200 aksara. | `new_password_too_long` | from the app table (pw.err.max) |
| Choose a new password that is different from the current one. | Pilih kata laluan baharu yang berbeza daripada kata laluan semasa. | `new_password_same` | from the app table (pw.err.same) |
| The current password is incorrect. | Kata laluan semasa tidak betul. | `current_password_incorrect` | coined |
| Your password was changed just now from somewhere else. Please try again. | Kata laluan anda baru sahaja ditukar dari tempat lain. Sila cuba lagi. | `password_changed_elsewhere` | coined |
| Could not change your password. | Tidak dapat menukar kata laluan anda. | `password_change_failed` | coined |
| Could not load tournaments. | Tidak dapat memuatkan senarai kejohanan. | `load_list_failed` | coined |
| Could not load tournament. | Tidak dapat memuatkan kejohanan. | `load_failed` | coined |
| Invalid tournament id. | ID kejohanan tidak sah. | `invalid_id` | coined |
| Missing tournament data. | Data kejohanan tiada. | `missing_data` | coined |
| This event is finalized. Only an Admin can change it. | Acara ini telah dimuktamadkan. Hanya Pentadbir boleh mengubahnya. | `finalized` | from the app table (fin.onlyAdmin) |
| Basic accounts allow up to {limit} entries per event. | Akaun Asas membenarkan sehingga {limit} peserta bagi setiap acara. | `entry_limit` | from the app table (limit.message (first sentence)) |
| Tournament changed elsewhere. | Kejohanan telah diubah di tempat lain. | `changed_elsewhere` | coined |
| Could not save tournament. | Tidak dapat menyimpan kejohanan. | `save_failed` | coined |

Admin-only codes (English on purpose, no BM): `request_failed`, `load_events_failed`, `event_not_found`, `unknown_action`, `not_finalized`, `transfer_target_gone`, `transfer_target_missing`, `transfer_target_same`, `transfer_target_not_found`, `transfer_target_suspended`, `email_exists`, `invalid_name`, `invalid_tier`, `organiser_not_found`, `account_suspended_reactivate`, `last_admin`, `nothing_to_change`, `invalid_role`, `invalid_suspended`, `own_role`, `suspend_self`, `admin_needs_verified`, `delete_self`, `has_events`, `invalid_contact`, `contact_too_long`, `contact_not_plain`, `settings_missing`, `invalid_setting_number`, `settings_table_missing`.

### The e-mails (English first, then BM, in one message)

| Template | Subject | BM text | Status |
|---|---|---|---|
| `verify` | Verify your DartDraw email / Sahkan e-mel DartDraw anda | Selamat datang ke DartDraw. Untuk mengesahkan alamat e-mel anda, buka pautan ini dan masukkan kata laluan yang anda pilih semasa mendaftar (pautan ini sah selama 24 jam): / Jika anda tidak mendaftar untuk DartDraw, anda boleh mengabaikan mesej ini. | coined |
| `reset` | Reset your DartDraw password / Tetapkan semula kata laluan DartDraw anda | Buka pautan ini untuk memilih kata laluan DartDraw yang baharu (pautan ini sah selama 1 jam): / Jika anda tidak meminta untuk menetapkan semula kata laluan anda, anda boleh mengabaikan mesej ini. | coined |
| `alreadyRegistered` | Your DartDraw account / Akaun DartDraw anda | Seseorang cuba mendaftar untuk DartDraw dengan alamat e-mel ini, tetapi anda sudah mempunyai akaun. Jika anda terlupa kata laluan anda, gunakan "Lupa kata laluan?" untuk menetapkannya semula: / Jika itu bukan anda, anda boleh mengabaikan mesej ini. | coined |
| `invite` | Your DartDraw account / Akaun DartDraw anda | Salam sejahtera {name}, / Pentadbir telah membuka akaun DartDraw untuk anda. Buka pautan ini untuk memilih kata laluan anda (pautan ini sah selama 7 hari): | coined |
| `adminReset` | Reset your DartDraw password / Tetapkan semula kata laluan DartDraw anda | Pentadbir telah mengeluarkan pautan untuk anda memilih kata laluan DartDraw yang baharu (pautan ini sah selama 1 jam): | coined |

Points for the proofreader:
- **Buka akaun** for "Create account" (button) and "Create an organizer account." (*Buka akaun penganjur.*), to match the
  approved "Akaun dibuka oleh pentadbir laman"; the 500 answer "Could not create account." is *Tidak dapat membuka akaun.*
  The register page's closed note reads "Pendaftaran belum dibuka. Akaun dibuka oleh pentadbir laman." (*dibuka* twice, in
  two senses): rephrase if it jars.
- **Sedang …** for the busy button labels ("Signing in…" = *Sedang log masuk…*, "Saving…" = *Sedang menyimpan…*).
- **Hantar pautan set semula** for "Send reset link" (Help already says *pautan set semula*); "Reset your password" in the
  e-mail subject is *Tetapkan semula kata laluan … anda* (the full verb).
- **Not authenticated** (the server's 401, normally never shown: the app sends people to sign in) is translated by meaning:
  *Anda belum log masuk atau sesi anda telah tamat.*
- **Salam sejahtera {name},** greets in the Admin's invite e-mail (English "Hello {name},"); the self-service e-mails have
  no greeting.
- The alreadyRegistered e-mail quotes the link label as *"Lupa kata laluan?"* (English: "use Forgot password to reset it").

### Follow-up for the organiser app: **done** (2026-10-25, after step 4 finished)

Items 1 to 3 are merged: `app.html` loads the two error tables before `i18n/app-i18n.js`, `DD_TABLES` includes `err.*`,
`ddApiError(body, fallback)` is in `i18n/app-i18n.js` (in BM the code's text filled from the answer's plain string/number
fields; otherwise the server's English `error`, else the fallback), and `submitChangePassword()` uses it. Tests:
`tests/change-password-ui.test.js` (every change-password code shown in BM with no English, unknown code and no-body
fallbacks, values only as text, English byte-identical, the script order and no other `body.error` on screen). The plan as
it was written:

The app shows a server `error` text on screen in one place only; every other server answer is handled by status or code
and already shows the app's own BM (`fin.*`, `limit.*`, `stale.*`, `recover.*`). To merge:
1. `app.html`: load `i18n/errors.en.js` and `i18n/errors.ms.js` right before `i18n/app-i18n.js`.
2. `i18n/app-i18n.js`: add `DD_ERR_EN` / `DD_ERR_MS` to the `DD_TABLES` merge, and a helper
   `ddApiError(body, fallback)`: in BM with `body.code` and a table entry, `T('err.' + body.code, body)`; otherwise
   `body.error` when it is a non-empty string, else `fallback`.
3. `app.html`, `submitChangePassword()`: replace
   `message = (body && typeof body.error==='string' && body.error) ? body.error : T('pw.err.failed');` with
   `message = ddApiError(body, T('pw.err.failed'));` (English stays byte-identical, so `tests/change-password-ui.test.js`
   keeps passing; add a BM case: `{ code: 'current_password_incorrect' }` shows *Kata laluan semasa tidak betul.*).
4. Nothing else in `app.html` needs it today: `apiFetch` (401 → `/?login=1`; the landing page sends a saved BM choice on
   to `/ms?login=1`), the save, rename, delete, duplicate and finalize paths (403 `finalized` / `entry_limit`, 404, 409)
   branch on status and code. If a later screen shows `body.error`, use `ddApiError` there too.
5. `admin-ui.js` stays English (`adminErrorText` shows `error`); its answers carry codes too if it is ever translated.

## i18n step 4 (2026-10-24): printed sheets

Every printed sheet now prints in the event's **Printed sheets language** (`printSettings.sheetLang`, set with the print
settings of steps 4 and 7; README "Printed sheets language"). The sheets' own words are in `i18n/print.en.js` /
`i18n/print.ms.js` (125 keys, `pr.*`); the words they share with the screens (sheet.*, grp.label, noun.*, seg.*,
credit, qr.block, render.js round names) were already in the step 2 and 3 tables. 48 BM values are the proofread print
captures of the preview (RULES & FORMAT, RUNNING ORDER, the lineup sheet with **Bil.**, the projected-bracket notes, the
bracket legend) or straight glossary forms. The **77 values below were coined in step 4** and need the BM proofreader.
Decisions to confirm: the split-bracket "Finals sheet" is *helaian Akhir* and its exit label *ke Akhir 5-1 »* (kept no
wider than the English label, so the layout and the paper choice never change with the language); the Group Boards
one-line placeholder *Pemenang K3*; the TIDAK HADIR mark prints on two lines (TIDAK / HADIR) in the bracket boxes; a BM
round label that does not fit its box wraps onto two lines (*Pusingan 128 / terakhir*), never *S/Akhir* or *SF*.
Automatic entry names ("Player A1" / "Pemain A1") are not translated on paper: they are stored data.

| English | BM (coined) | Key | Note |
|---|---|---|---|
| Printed sheets language | Bahasa helaian bercetak | `pr.set.label` | IMPLEMENTATION-NOTES 4 named it "Bahasa helaian bercetak" |
| Every printed sheet of this event uses this language, whoever prints it. | Setiap helaian bercetak acara ini menggunakan bahasa ini, sesiapa pun yang mencetaknya. | `pr.set.hint` |  |
|  · sheet {i} of {n} |  · helaian {i} daripada {n} | `pr.sheetOf` |  |
|  · Sheet {i} of {n} |  · Helaian {i} daripada {n} | `pr.SheetOf` |  |
| {n} groups | {n} kumpulan | `pr.groups` |  |
| {n} boards | {n} board | `pr.boards` |  |
| {n} matches | {n} perlawanan | `pr.matches` |  |
| Board {b}, continued | Board {b}, sambungan | `pr.ro.boardCont` | a board column continued on the next running-order sheet |
| No more groups on this board. | Tiada lagi kumpulan di board ini. | `pr.ro.empty` |  |
| Every match: {label}. | Setiap perlawanan: {label}. | `pr.ro.everyTeams` |  |
| Format: Round robin — every entry in a group plays every other entry in that group once. | Format: Round robin — setiap peserta dalam kumpulan bermain sekali dengan setiap peserta lain dalam kumpulan itu. | `pr.f.rr` |  |
| Scoring: Win = 2 points, Draw = 1 point, Loss = 0 points. Each match is best of {n} legs (first to {m}). | Sistem mata: Menang = 2 mata, Seri = 1 mata, Kalah = 0 mata. Setiap perlawanan ialah terbaik daripada {n} leg (pemenang memerlukan {m} leg). | `pr.f.rrScoring` |  |
| Legs increase by round: early rounds best of {e}, quarterfinal best of {q}, semifinal best of {s}, final best of {f}. Knockout matches cannot end in a draw. | Leg bertambah mengikut pusingan: pusingan awal terbaik daripada {e}, suku akhir terbaik daripada {q}, separuh akhir terbaik daripada {s}, akhir terbaik daripada {f}. Perlawanan kalah mati tidak boleh berakhir seri. | `pr.f.koVar` |  |
| Format: Knockout, Group Boards then finals — players are drawn into {p} groups. Each group is a small knockout on its own board, and every group winner goes through to a Finals bracket. | Format: Kalah mati, Group Boards kemudian peringkat akhir — pemain diundi ke dalam {p} kumpulan. Setiap kumpulan ialah kalah mati kecil di board sendiri, dan setiap pemenang kumpulan mara ke bracket Peringkat Akhir. | `pr.f.pod` |  |
| Group matches are best of {pn} legs (first to {pm}). Finals matches are best of {n} legs (first to {m}) unless legs increase by stage. Knockout matches cannot end in a draw. | Perlawanan kumpulan ialah terbaik daripada {pn} leg (pemenang memerlukan {pm} leg). Perlawanan Peringkat Akhir ialah terbaik daripada {n} leg (pemenang memerlukan {m} leg) kecuali leg bertambah mengikut peringkat. Perlawanan kalah mati tidak boleh berakhir seri. | `pr.f.podLegs` |  |
| Knockout stage legs increase by round: early rounds best of {e}, quarterfinal best of {q}, semifinal best of {s}, final best of {f}. Cannot end in a draw. | Leg peringkat kalah mati bertambah mengikut pusingan: pusingan awal terbaik daripada {e}, suku akhir terbaik daripada {q}, separuh akhir terbaik daripada {s}, akhir terbaik daripada {f}. Tidak boleh berakhir seri. | `pr.f.rrkoVar` |  |
| Plate pool legs increase by round: early rounds best of {e}, quarterfinal best of {q}, semifinal best of {s}, final best of {f}. | Leg saingan Plate bertambah mengikut pusingan: pusingan awal terbaik daripada {e}, suku akhir terbaik daripada {q}, separuh akhir terbaik daripada {s}, akhir terbaik daripada {f}. | `pr.f.plateVar` |  |
| Plate pool matches are best of {n} legs. | Perlawanan saingan Plate ialah terbaik daripada {n} leg. | `pr.f.plateFlat` |  |
| Each entry is a pair of 2 players. | Setiap peserta ialah pasangan 2 pemain. | `pr.f.pair` |  |
| Each entry is a team of 3 players. | Setiap peserta ialah pasukan 3 pemain. | `pr.f.triple` |  |
| Entries from the same organisation are kept apart where possible, both in round robin groups and in the first knockout round. | Peserta dari organisasi yang sama dipisahkan jika boleh, dalam kumpulan round robin dan dalam pusingan kalah mati pertama. | `pr.f.org` |  |
| Advancing to the knockout: top {n} entries from each group, {how}.{plate} | Mara ke kalah mati: {n} peserta teratas dari setiap kumpulan, {how}.{plate} | `pr.f.advance` |  |
| seeded by group finishing position | diberi seed mengikut kedudukan akhir dalam kumpulan | `pr.f.seeded` | glossary: "Seeded by group standing" = *Seed ikut kedudukan kumpulan* |
| drawn at random | diundi secara rawak | `pr.f.random` |  |
|  Entries who don't advance go into a separate Plate pool knockout bracket{which}. |  Peserta yang tidak mara bermain dalam bracket kalah mati saingan Plate yang berasingan{which}. | `pr.f.plate` |  |
|  (next {n} entries per group; anyone ranked below that is eliminated) |  ({n} peserta berikutnya dari setiap kumpulan; peserta di bawah kedudukan itu tersingkir) | `pr.f.plateNext` |  |
|  (everyone who doesn't advance to the main bracket) |  (semua peserta yang tidak mara ke bracket utama) | `pr.f.plateAll` |  |
| Format: Knockout, Group Boards then finals — teams are drawn into {p} groups. Each group is a small knockout on its own board, and every group winner goes through to a Finals bracket. | Format: Kalah mati, Group Boards kemudian peringkat akhir — pasukan diundi ke dalam {p} kumpulan. Setiap kumpulan ialah kalah mati kecil di board sendiri, dan setiap pemenang kumpulan mara ke bracket Peringkat Akhir. | `pr.t.pod` |  |
| Win = 2 points, Draw = 1 point, Loss = 0 points. Every match is decided by the total legs each team wins across its segments; level totals are a draw. | Menang = 2 mata, Seri = 1 mata, Kalah = 0 mata. Setiap perlawanan ditentukan oleh jumlah leg yang dimenangi setiap pasukan dalam semua segmennya; jumlah yang sama dikira seri. | `pr.t.rr` |  |
| Win = 2 points, Loss = 0 points. Every match is decided by the total legs each team wins across its segments; level totals go to the tie-breaker, so there are no draws. | Menang = 2 mata, Kalah = 0 mata. Setiap perlawanan ditentukan oleh jumlah leg yang dimenangi setiap pasukan dalam semua segmennya; jumlah yang sama diputuskan oleh pemecah seri, jadi tiada keputusan seri. | `pr.t.rrTb` |  |
| Scoring: {rule} | Sistem mata: {rule} | `pr.t.scoring` |  |
| Group stage scoring: {rule} | Sistem mata peringkat kumpulan: {rule} | `pr.t.gsScoring` |  |
| Every match is decided by the total legs each team wins across its segments. Knockout matches cannot end level. | Setiap perlawanan ditentukan oleh jumlah leg yang dimenangi setiap pasukan dalam semua segmennya. Perlawanan kalah mati tidak boleh berakhir seri. | `pr.t.ko` |  |
| Every match is decided by the total legs each team wins across its segments. Knockout matches cannot end level: level totals go to the tie-breaker. | Setiap perlawanan ditentukan oleh jumlah leg yang dimenangi setiap pasukan dalam semua segmennya. Perlawanan kalah mati tidak boleh berakhir seri: jumlah yang sama diputuskan oleh pemecah seri. | `pr.t.koTb` |  |
| Every match is decided by the total legs each team wins across its segments, in the groups and the Finals alike. Knockout matches cannot end level. | Setiap perlawanan ditentukan oleh jumlah leg yang dimenangi setiap pasukan dalam semua segmennya, dalam kumpulan dan Peringkat Akhir. Perlawanan kalah mati tidak boleh berakhir seri. | `pr.t.podLegs` |  |
| Every match is decided by the total legs each team wins across its segments, in the groups and the Finals alike. Knockout matches cannot end level: level totals go to the tie-breaker. | Setiap perlawanan ditentukan oleh jumlah leg yang dimenangi setiap pasukan dalam semua segmennya, dalam kumpulan dan Peringkat Akhir. Perlawanan kalah mati tidak boleh berakhir seri: jumlah yang sama diputuskan oleh pemecah seri. | `pr.t.podLegsTb` |  |
| Knockout stage matches use the same segments and cannot end level. | Perlawanan peringkat kalah mati menggunakan segmen yang sama dan tidak boleh berakhir seri. | `pr.t.rrkoKo` |  |
| Knockout stage matches use the same segments and cannot end level: level totals go to the tie-breaker. | Perlawanan peringkat kalah mati menggunakan segmen yang sama dan tidak boleh berakhir seri: jumlah yang sama diputuskan oleh pemecah seri. | `pr.t.rrkoKoTb` |  |
| Knockout stage matches (and the Plate pool) use the same segments and cannot end level. | Perlawanan peringkat kalah mati (dan saingan Plate) menggunakan segmen yang sama dan tidak boleh berakhir seri. | `pr.t.rrkoKoPlate` |  |
| Knockout stage matches (and the Plate pool) use the same segments and cannot end level: level totals go to the tie-breaker. | Perlawanan peringkat kalah mati (dan saingan Plate) menggunakan segmen yang sama dan tidak boleh berakhir seri: jumlah yang sama diputuskan oleh pemecah seri. | `pr.t.rrkoKoPlateTb` |  |
| Each match has {n} segments: {list}. | Setiap perlawanan mempunyai {n} segmen: {list}. | `pr.t.segs` |  |
|  Tie-breaker if the totals are level: {desc}. |  Pemecah seri jika jumlah leg sama: {desc}. | `pr.t.tb` |  |
|  Tie-breaker in round robin matches if the totals are level: {desc}. |  Pemecah seri dalam perlawanan round robin jika jumlah leg sama: {desc}. | `pr.t.tbRr` |  |
|  Tie-breaker in knockout matches if the totals are level: {desc}. |  Pemecah seri dalam perlawanan kalah mati jika jumlah leg sama: {desc}. | `pr.t.tbKo` |  |
|  The team with more total legs wins. |  Pasukan dengan jumlah leg yang lebih banyak menang. | `pr.t.more` |  |
| Each match: {label}. Write each team's total legs — no draws, the team with more legs wins. | Setiap perlawanan: {label}. Tulis jumlah leg setiap pasukan — tiada seri, pasukan dengan leg yang lebih banyak menang. | `pr.ko.legsTeams` |  |
| Legs per match increase by knockout stage: {summary}. | Leg setiap perlawanan bertambah mengikut peringkat kalah mati: {summary}. | `pr.ko.legsVar` |  |
| early rounds best of {e}, quarterfinal best of {q}, semifinal best of {s}, final best of {f} | pusingan awal terbaik daripada {e}, suku akhir terbaik daripada {q}, separuh akhir terbaik daripada {s}, akhir terbaik daripada {f} | `pr.ko.legsSummary` |  |
| to Finals {tag} » | ke Akhir {tag} » | `pr.kb.exitL` | the exit label of a split section sheet; kept no wider than the English (it must fit the same box): *Akhir* here is the Finals sheet |
| « to Finals {tag} | « ke Akhir {tag} | `pr.kb.exitR` | as above, right half |
| sheet | helaian | `pr.kb.exitSheet` |  |
| Full names: | Nama penuh: | `pr.kb.fullNames` |  |
| {a} to {b} | {a} hingga {b} | `pr.sp.to` |  |
| left half | bahagian kiri | `pr.sp.left` | the two halves of a two-sided bracket (glossary: *carta dua bahagian*) |
| right half | bahagian kanan | `pr.sp.right` |  |
| {l} on the left half, {r} on the right half | {l} di bahagian kiri, {r} di bahagian kanan | `pr.sp.both` |  |
| {x} on the right half | {x} di bahagian kanan | `pr.sp.one` |  |
| Sheets 1 to {last} are the sections ({ranges}; numbered top to bottom), sheet {total} is the Finals sheet. Every sheet prints at the same scale. | Helaian 1 hingga {last} ialah seksyen ({ranges}; bernombor dari atas ke bawah), helaian {total} ialah helaian Akhir. Setiap helaian dicetak pada skala yang sama. | `pr.sp.order` | "Finals sheet" = *helaian Akhir* (short, matches the exit label); section = *seksyen* |
| Section {id} ({half}, {i} of {n}) · {rounds} · sheet {k} of {total} | Seksyen {id} ({half}, {i} daripada {n}) · {rounds} · helaian {k} daripada {total} | `pr.sp.head` |  |
| Section {id} of the {label}. {order} Each winner here goes on to the Finals sheet: the label at each exit names the Finals match, and on the Finals sheet the box marked "{id} · match number" takes the winner of that match. The + marks show where winners leave this section. | Seksyen {id} bagi {label}. {order} Setiap pemenang di sini mara ke helaian Akhir: label di setiap titik keluar menamakan perlawanan di helaian Akhir, dan pada helaian Akhir kotak bertanda "{id} · nombor perlawanan" diisi oleh pemenang perlawanan itu. Tanda + menunjukkan tempat pemenang keluar dari seksyen ini. | `pr.sp.legend` |  |
| Finals sheet, {i} of {n} | Helaian Akhir, {i} daripada {n} | `pr.sp.finDetail` |  |
| Finals sheet. {order} Each first box here is filled from a section: "{ex}" means the winner of match {m} on section {s} (+ marks where it enters).  | Helaian Akhir. {order} Setiap kotak pertama di sini diisi dari satu seksyen: "{ex}" bermaksud pemenang perlawanan {m} di seksyen {s} (+ menandakan tempat ia masuk).  | `pr.sp.finLegend` |  |
| not projected | tiada unjuran | `pr.proj.none` |  |
|  Do this before the knockout is drawn. |  Lakukan ini sebelum undian kalah mati dibuat. | `pr.proj.doBefore` |  |
|  The Plate pool is not projected either: the real draw makes neither bracket until this is fixed. |  Saingan Plate juga tidak diunjurkan: undian sebenar tidak akan menjana mana-mana bracket sehingga perkara ini dibetulkan. | `pr.proj.plateToo` |  |
| Legs per match increase by knockout stage — see each round's heading above. | Leg setiap perlawanan bertambah mengikut peringkat kalah mati — lihat tajuk setiap pusingan di atas. | `pr.gb.legsVar` |  |
| Full chart | Carta penuh | `pr.gb.full` |  |
| Section {side}{i} of {n} | Seksyen {side}{i} daripada {n} | `pr.gb.section` |  |
| Winner of | Pemenang | `pr.gb.winnerOf` |  |
| no winner | tiada pemenang | `pr.gb.noWinner` |  |
| Gp {g} winner | Pemenang K{g} | `pr.gb.short` | only when a Group Boards Finals box is too low for two lines; *K{g}* = Kumpulan {g} (no room for the full word): proofreader, is *Kump.* better? |
| Gp {g}: none | K{g}: tiada | `pr.gb.shortNone` | as above |
| Find your group and board | Cari kumpulan dan board anda | `pr.bp.find` |  |
| Group {g} · Board {b} | Kumpulan {g} · Board {b} | `pr.bp.row` |  |
| BOARDS | BOARD | `pr.bp.boards` | Boards sheet title: *Board* has no plural (glossary) |
| Groups in the order they play | Kumpulan mengikut susunan bermain | `pr.bp.order` |  |
| Finals ({n} matches) | Peringkat Akhir ({n} perlawanan) | `pr.bp.finals` |  |

Layout (simulation audit, 12 events x pre-game / completed, English and BM sheets): every BM sheet fits. Fixed for BM in step 4:
the lineup header boxes Kumpulan / Board (a long round name such as *Pusingan 16 terakhir*) and Perlawanan (*lwn <team>*)
wrap onto two lines instead of being cut; round labels on the bracket shrink, then wrap. Paper recommendation: identical
in both languages for every event and for 8 to 128 slots (tests/print-i18n.test.js).

## Review fixes (2026-10-25): new BM sentences for the proofreader

The independent review of steps 1 to 5 found that both organiser Helps still said the app was English only, and that
neither explained the EN | BM switch, the per-event **Printed sheets language** or the two-language e-mails. These BM
sentences are new and **wait for the BM proofreader** (the English is in `scripts/help-content.js`, same ids). They follow
`glossary.md` and `style-rules.md` (polite *anda*; *bracket (carta kalah mati)* on first mention; *board* kept; *sendiri*
only for "own"; no *sebaliknya* for "the other way round").

| English | BM (coined) | Where | Note |
|---|---|---|---|
| The Bahasa Malaysia words for this event's printed sheets have not loaded yet. Check your connection, then print again. | Perkataan Bahasa Malaysia untuk helaian bercetak acara ini belum dimuatkan. Semak sambungan anda, kemudian cetak sekali lagi. | `pr.set.wait` (app note when Print is pressed before the BM sheet words have arrived, or offline) | *kemudian* as an adverb ("then"), as glossary section 8 allows |
| English or Bahasa Malaysia: screens, printed sheets and emails | Bahasa Inggeris atau Bahasa Malaysia: skrin, helaian bercetak dan e-mel | organiser Help, new article `#languages` (title) | |
| The EN \| BM switch, the language each event prints in, and why account emails come in both languages. | Suis EN \| BM, bahasa cetakan setiap acara, dan sebab e-mel akaun ditulis dalam kedua-dua bahasa. | `#languages` summary | |
| The EN \| BM switch | Suis EN \| BM | `#language-switch` heading | |
| (three paragraphs: where the switch is, that a switch changes only the words, that the choice is remembered and shared by the app, the public pages and the sign-in page, and that the public results site has its own) | see `scripts/i18n/ms/help-content.js`, `#language-switch` | `#language-switch` | "menu yang dibuka daripada nama langkah" for the compact bar's step menu |
| Printed sheets language (heading and five points: what it covers, that it belongs to the event, the default, typed names, locked when finalized) | see `#sheet-language` | `#sheet-language` | quotes the app's *Bahasa helaian bercetak*, *Sahkan & Cetak Bracket*, *Cetak Carta Akhir* |
| Emails in both languages (one paragraph) | E-mel dalam kedua-dua bahasa (see `#bilingual-emails`) | `#bilingual-emails` | wording matches `api/_lib/emails.js` (*Pentadbir telah membuka akaun…*) |
| The sign-in page and the account emails are in English and Bahasa Malaysia: see English or Bahasa Malaysia. | Halaman log masuk dan e-mel akaun ditulis dalam bahasa Inggeris dan Bahasa Malaysia: lihat Bahasa Inggeris atau Bahasa Malaysia. | `#getting-started` / `#no-account` | |
| Printed sheets language — The language every printed sheet of the event uses… | Bahasa helaian bercetak — Bahasa yang digunakan oleh setiap helaian bercetak acara itu… | glossary `#glossary-sheet-language` | |
| EN \| BM — The language switch… | EN \| BM — Suis bahasa: perkataan pada skrin anda dalam bahasa Inggeris atau Bahasa Malaysia… | glossary `#glossary-language` | |
| This site remembers your choice on this device. | Laman ini mengingati pilihan anda pada peranti ini. | spectator Help search line (viewer/help.html, viewer/ms/help.html) | added to the existing language line |

The old search lines "The organiser app itself is in English for now." / "Aplikasi penganjur masih dalam bahasa Inggeris
buat masa ini." are gone: a search for the language now opens the `#languages` article (tests/fixtures/help-search-*.json).

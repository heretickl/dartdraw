# BM proofread of i18n step 1 (2026-10-24)

Scope: every BM text a reader sees after i18n step 1. That covers the public pages (`scripts/i18n/ms/landing.js` and the
banner/switch strings in `scripts/build-landing.js`), the organiser Help (`scripts/i18n/ms/help-content.js` and its
search data), the spectator Help (`viewer/ms/help.html` and its search data), and the UI label docs
(`docs/i18n/ui-strings-ms.js`, `docs/i18n/ui-strings-needed.md`). I checked against `glossary.md` and `style-rules.md`.

Method: I read all of the BM text once in full. Most attention went to the text added since the 2026-10-23 preview
proofread: Quick start, sample event, No account yet?, Which format, player-leaves, correct/clear result, entries-locked,
Teams split, Full-page window split, troubleshooting, the glossary, the spectator Start here / Quick answers / glossary /
legend / home failure text, and the noAnswer lines. I sample-checked the reused text against the English and corrected it
where needed.

All corrections are applied. `npm run build-landing` was run, `viewer/ms/help.html` was edited by hand, and
`npm run check-viewer` passes. `npm test` gives 1636 pass, 0 fail, with 10 new BM search phrases added to the fixtures. No
English content, app code or search logic was changed. The English `help.html` rebuilt with its data only (the extra
`alias` entries).

## 1. Quality

**Good to very good.** The translation is accurate, polite and neutral (*anda*), and follows DBP spelling (*e-mel,
kata laluan, muat semula, dikemas kini, tetingkap timbul*). It keeps the owner decisions consistently: *bracket (carta
kalah mati)* on first mention, *board*, *Group Boards*, *sama mata*, *membuat undian*, *Keputusan muktamad*, *pencatat
skor (marker)*, *Mendatang*, *peserta*. I found no Indonesianisms, no untranslated English paragraphs and no spelling
errors.

The weaknesses were all of one kind: English structure showing through. Examples:
- *kemudian* used as an adjective for "later results"
- *… sendiri* for "by itself"
- *sebagai ganti* after a verb
- *di mana* used as a relative pronoun
- the word order *yang anda akan lihat*

A handful of word choices changed the meaning or made it ambiguous:
- *jadual* for a standings table (it reads "schedule")
- *Simpan* for "keep" (it reads "save")
- *dikira* for "take effect" (it reads "are calculated")
- *sudah bermain* for "already playing" (it also reads "have already played")
- *Skor terakhir diubah* (it reads "the last score was changed")

The safety-critical instructions (finalize, withdraw vs no-show, clear result, knockout cascade, walkover, paper size,
publish before print) were correct in substance. Four of them are now clearer: the cascade, the walkover definition,
"keep the full-page window on one device", and the QR note.

## 2. Corrections by category and area

Counts are distinct corrections. The number in brackets is the number of places changed where one correction was applied
more than once.

| Area | Meaning | Terminology | Register / grammar | Naturalness | Spelling | Punctuation | Layout | Total |
|---|---|---|---|---|---|---|---|---|
| Organiser Help (help-content.js) | 14 | 8 (21) | 9 (12) | 16 (19) | 0 | 0 | 0 | 47 |
| Spectator Help (viewer/ms/help.html) | 10 | 5 (14) | 9 (10) | 10 | 0 | 2 | 0 | 36 |
| Public pages (landing.js) | 0 | 1 | 3 | 1 | 0 | 0 | 0 | 5 |
| UI label table (ui-strings-ms.js) | 6 | 6 | 2 | 0 | 0 | 0 | 0 | 14 |
| **Total** | **30** | **20** | **23** | **27** | **0** | **2** | **0** | **102** |

Search data (shown to nobody):
- Organiser: 24 synonym groups gained about 75 phrases people really type, 5 entries were added to `toEnglish`, and 1
  noAnswer sentence was reordered.
- Spectator: 9 groups gained 28 phrases, and 1 noAnswer sentence was corrected.
- Fixtures: 10 new BM test phrases were added (6 organiser, 4 spectator).

The added phrases are Manglish and chat forms: *tak boleh login, lupa password, score salah, salah key in, player tak
datang, player balik awal, print balik, skor live, braket, tutup event, key in markah, cabut undi, x datang, pukul brp,
skor tak keluar*. Each one was checked to reach the right answer in the top 3.

Layout: I made no layout fixes, because this step changed text only. The longer labels are listed in section 5 as risks.

## 3. The 15 most important corrections

| # | Where | Before | After | Why |
|---|---|---|---|---|
| 1 | Correcting a result, troubleshooting, FAQ (knockout cascade) | *setiap perlawanan kemudian … begitu juga juara*; *tidak mengubah apa-apa kemudian* | *setiap perlawanan berikutnya … termasuk juara*; *tidak mengubah perlawanan berikutnya* | Safety-critical: "later" is *berikutnya*. *begitu juga juara* read "likewise the champion" and left unclear whether the champion is cleared. |
| 2 | Cascade box label | *2 keputusan kemudian* | *2 keputusan berikutnya* | Same calque, in an on-screen warning. |
| 3 | Full-page window sync | *Simpan tetingkap skrin penuh pada satu peranti sahaja* | *Buka tetingkap … pada satu peranti sahaja* | *Simpan* means "save", but the English says keep. |
| 4 | Which format | *jadual menentukan kedudukan* | *jadual kedudukan menentukan tempat setiap peserta* | *jadual* alone reads "the schedule decides". |
| 5 | Teams segments | *perubahan anda hanya dikira apabila…* | *…hanya disimpan apabila…* | *dikira* reads "are calculated". The English means "only take effect once saved". |
| 6 | No-shows (walkover) | *kemenangan dengan majoriti leg berbanding sifar* | *kemenangan dengan leg yang cukup untuk menang berbanding sifar (contohnya 2–0 dalam terbaik daripada 3)* | "majority of legs" was a calque and unclear; the example makes it concrete. |
| 7 | Withdraw refusal button (4 places) | *Tandakan tidak hadir sebagai ganti* | *Tandakan tidak hadir sebagai gantinya* | *ganti* after a verb phrase needs *-nya*. |
| 8 | Lowering entries (refusal message) | *Peserta ini sudah bermain* | *Peserta ini sudah mula bermain* | The old wording also reads "have already played". |
| 9 | Step 4 QR note | *…helaian ini tidak akan mempunyai kod QR* | *…jadi kod QR tidak akan dicetak pada helaian ini* | Says plainly what will not print. This is the publish-before-print warning. |
| 10 | Viewer header | *Skor terakhir diubah* / *Kali terakhir disemak* | *Perubahan skor terakhir* / *Semakan terakhir* | *skor terakhir* = "the last score". Two parallel noun labels before a time read cleanly. |
| 11 | Viewer player page | *1 perlawanan sebelum anda* | *selepas 1 perlawanan* | The page is about any player, often not the reader. |
| 12 | Viewer walkover lines | *Menang 2–0 melalui walkover* | *Menang walkover 2–0* | This is how Malaysians say it (glossary #22). |
| 13 | Viewer "When and where" | *baca "pasukan" bagi "pemain"* | *baca "pemain" sebagai "pasukan"* | *bagi* here reads "for the sake of", which makes the instruction ambiguous or backwards. |
| 14 | Glossary title (12 places) | *Istilah yang anda akan lihat* | *Istilah yang akan anda lihat* | DBP word order: the aspect word goes before the pronoun in this passive. |
| 15 | Style rule 3, both Helps and landing (11 places) | *dimuat semula sendiri*, *dikemas kini sendiri*, *diisi sendiri*, *mencuba sendiri*, *hilang sendiri* | *… secara automatik* | Glossary rule: "by itself" is *secara automatik*; *sendiri* reads "on its own / alone". |

Other notable corrections:
- *Pasukan pemain* → *Pertandingan berpasukan*.
- *Pemain telah pergi* → *Pemain meninggalkan acara*.
- The bye gloss *Laluan terus …* → *Mara terus ke pusingan seterusnya tanpa bermain*.
- The fixture definition is no longer circular.
- *di mana* as a relative pronoun → *kerana dalam format itu*.
- *seorang peserta* → *satu peserta* (classifier rule).
- *Kepada siapa saya perlu beritahu?* → *Siapa yang perlu saya beritahu?*
- *keputusan boleh berpusing* → *membentuk kitaran*.
- *2 teratas … mara ke kalah mati* → *… ke peringkat kalah mati*.
- *Tutup contoh* → *Tutup acara contoh*.
- *Tiada apa-apa yang disimpan* → *yang akan disimpan* (a system rule).
- *Kalah mati: … akhir terbaik daripada 5* → *perlawanan akhir terbaik daripada 5*.

## 4. Final decisions for every coined label

The full table, with a note on each label, is in `ui-strings-needed.md`. `ui-strings-ms.js` and both Helps now use these
strings exactly; the organiser Help is test-checked against them.

| English | Final BM |
|---|---|
| Publish results now | Terbitkan keputusan sekarang |
| Publishing is off, so these sheets will have no QR code | Penerbitan dimatikan, jadi kod QR tidak akan dicetak pada helaian ini |
| Get started (card) | Bermula |
| Try a sample event / Save as my event / Close sample | Cuba acara contoh / Simpan sebagai acara saya / Tutup acara contoh |
| This is a sample event. Nothing is saved. | Ini acara contoh. Tiada apa-apa yang akan disimpan. |
| Results finalized | Keputusan dimuktamadkan |
| No account yet? Accounts are created by the site admin. | Belum ada akaun? Akaun dibuka oleh pentadbir laman. |
| These entries are already playing | Peserta ini sudah mula bermain |
| Clear result / Clear this result? / Change result | Kosongkan keputusan / Kosongkan keputusan ini? / Tukar keputusan |
| Changing this result will clear 2 later results… | Menukar keputusan ini akan mengosongkan 2 keputusan berikutnya, dan anda perlu memasukkannya semula |
| Mark no-show instead | Tandakan tidak hadir sebagai gantinya |
| Go there | Pergi ke sana |
| To finish the event, use Accept & finalize at the bottom of step 5 | Untuk menamatkan acara, gunakan Terima & muktamadkan di bahagian bawah langkah 5 |
| Finalized events can only be renamed by an Admin. | Acara yang telah dimuktamadkan hanya boleh dinamakan semula oleh Pentadbir. |
| * Position set manually by organiser | * Kedudukan ditetapkan secara manual oleh penganjur |
| Called / Called — go to Board N | Dipanggil / Dipanggil — pergi ke Board N |
| Scores last changed / Last checked | Perubahan skor terakhir / Semakan terakhir |
| What do the columns mean? / What do the labels mean? | Apakah maksud lajur? / Apakah maksud label? |
| Got it / Back to the event | Faham / Kembali ke acara |
| New here? Three things to know | Baru di sini? Tiga perkara yang perlu diketahui |
| Top 2 in each group go through to the knockout | 2 teratas setiap kumpulan mara ke peringkat kalah mati |
| opponent not decided yet / did not show / Winner of | lawan belum ditentukan / tidak hadir / Pemenang |
| Won 2–0 by walkover / Lost 0–2 by walkover | Menang walkover 2–0 / Kalah walkover 0–2 |
| Board 2 · 1 match ahead · ~7:50 pm | Board 2 · selepas 1 perlawanan · ~7:50 PTG |
| Next: Semifinal (3-1) vs Leo Ahmad | Seterusnya: Separuh akhir (3-1) lwn Leo Ahmad |
| Knockout: best of 3 legs, final best of 5 | Kalah mati: terbaik daripada 3 leg, perlawanan akhir terbaik daripada 5 |
| Bahasa Malaysia tersedia — Tukar ke BM | unchanged |
| Help titles: Quick start / Words you will see / When something goes wrong / Start here / Stuck? | Mula pantas / Istilah yang akan anda lihat / Apabila berlaku masalah / Mula di sini / Ada masalah? |

The `fixed` rows (sign-in labels, Number of pairs/teams, Best of legs, Neither showed, undo, Singles 1, lineup and A–Z
sheets, patterns) are confirmed unchanged.

I also corrected one older table string to follow rule 3: the Publish hint *Halaman dimuat semula sendiri setiap 20 saat*
became *…secara automatik…*. New RX patterns cover the walkover lines, "N match(es) ahead" and the knockout legs line, for
the app step.

## 5. Residual risks

1. **The BM Help names BM buttons that are still English on screen** (organiser app, sign-in pop-up, viewer home and
   event pages, printed sheets) until steps 2 and 3. See section 7.
2. **Long labels to measure in the app step:**
   - *Tandakan tidak hadir sebagai gantinya* (37 characters against 20 in English): a dialog button that may wrap.
   - *2 teratas setiap kumpulan mara ke peringkat kalah mati*: the line above the viewer's group tables, which will wrap on
     a 360 px phone.
   - *Perubahan skor terakhir* (23 against 19): the viewer header row.
   - *Penerbitan dimatikan, jadi kod QR tidak akan dicetak pada helaian ini*: the step 4 note.
3. **Two hand-maintained spectator Help files.** The parity tests check structure only, so a future English edit must be
   mirrored in BM by hand. The same applies to the new glossary decisions (section 7 of `glossary.md`).
4. **Printed-sheet quotes in the BM glossary** (*\* Kedudukan ditetapkan secara manual oleh penganjur*, *Bracket utama
   (unjuran)*, *Terbaik daripada 5 Leg*, *Mata: Menang 2 · Seri 1 · Kalah 0*) describe sheets that still print in English.
5. **Search phrases that depend on chat spelling** (*x datang*, *pukul brp*, *braket*) are data, so they need no code.
   Very short forms the engine does not expand (*x* = *tak*, *brp* = *berapa*) only work inside the listed phrases.
6. **Examples mix naming styles.** *Leo Ahmad* and *Aiden Tan* are kept from the English. They are plausible Malaysian
   names, but a reviewer may prefer *Hakim / Iskandar* style throughout.

## 6. For a native Malaysian darts organiser to confirm

- **Mula pantas** (Quick start) and the **Bermula** card heading. *Cara bermula* is the fallback if *Bermula* reads like
  a bare verb.
- **Perubahan skor terakhir / Semakan terakhir** in the viewer header.
- **selepas 1 perlawanan** on the player page. Would players rather see *1 perlawanan lagi*?
- **Menang walkover 2–0 / Kalah walkover 0–2**, and **WO** as the tag.
- **Tandakan tidak hadir sebagai gantinya**: is the length acceptable, or would they prefer just *Tandakan tidak hadir*
  in that dialog?
- **Kosongkan keputusan** (against *Padam keputusan*). I chose *Kosongkan* because the match itself stays.
- **pencatat skor (marker)**, **borang barisan (lineup sheet)** and **kad skor**: do club captains say "marker" and
  "lineup" even in BM?
- **Pemecah seri** as the name of the Teams tie-breaker *segment*. Players may just say "tie-breaker".
- **Berempat** (Foursome) and **Trio** segment names.
- **board utama (feature board)** and **Board Peringkat Akhir**.
- **Akaun dibuka oleh pentadbir laman**: would they say *admin* rather than *pentadbir laman*?
- The Manglish search phrases: list any other things club members really type (for example *nak tengok result*, *grup*).

## 7. Interim approach while the app is still English (recommendation)

**Do not hold the BM Help back.** It is accurate and useful now: concepts, rules, safety steps and the spectator answers do
not depend on the button language. But a BM reader should never be told to click a word that is not on the screen.
**Recommendation: ship step 1 with the English on-screen label in brackets after each quoted BM label, plus one line
explaining why. Switch both off in the same commit that translates the screens.**

Concrete proposal:

1. **Build-time flag, no hand edits.** In `scripts/build-landing.js`, add `const SHOW_EN_UI = true` (BM pages only).
   While it is on, each `<b>BM label</b>` in the BM organiser Help that is a value in `docs/i18n/ui-strings-ms.js` `D` is
   rendered as `<b>BM label</b> <span class="ui-en" lang="en">(English label)</span>`.
   - The English label comes from the reverse of the `D` table, or from the RX patterns for numbered ones.
   - Example: *Klik **Mulakan semua perlawanan** (Start all games)*.
   - The `<b>` text stays exactly the BM string, so the label-parity test still passes.
   - Add a test that, with the flag on, every BM label quoted in the Help has its English twin, and that the flag is off
     once `app.html` ships BM.
2. **One notice at the top of `/ms/help`**, in the `hintro` box: *"Aplikasi penganjur masih dalam bahasa Inggeris buat masa
   ini. Nama butang dalam bahasa Inggeris ditunjukkan dalam kurungan, contohnya **Simpan skor** (Save score)."* This
   matches the existing noAnswer line about the app still being in English.
3. **Spectator Help (hand-maintained):** add the same `<span class="ui-en" lang="en">(…)</span>` after the labels the
   viewer actually shows, which is a short list:
   - *☆ Ikuti* (Follow) and *Ini saya* (This is me)
   - *Saya / Diikuti* (Me / Following)
   - *Perubahan skor terakhir* (Scores last changed) and *Semakan terakhir* (Last checked)
   - *Apakah maksud lajur?* (What do the columns mean?)
   - *Cuba lagi* (Try again) and *Faham* (Got it)
   - *Lihat semua acara* (See all events)
   - the Pusingan / Carta / Muat skrin buttons

   Add one line under *Baru di sini?*: *"Halaman acara masih dalam bahasa Inggeris; nama butang dalam bahasa Inggeris
   ditunjukkan dalam kurungan."*
4. **Search:** nothing to change. The English words are already in every BM synonym group, so typing what is on the
   screen ("start all games") already finds the BM answer.
5. **When steps 2 and 3 ship**, set `SHOW_EN_UI = false`, delete the two notice lines and the viewer spans, and keep
   `ui-strings-needed.md` as the record.

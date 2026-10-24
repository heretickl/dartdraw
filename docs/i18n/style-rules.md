# Style rules for Bahasa Malaysia (living reference)

Copied 2026-10-24 from the BM proofread (`docs/design/i18n-preview/PROOFREAD-REPORT.md`, sections 6 and 8). Apply them to
every BM text: the public pages, both Help pages, and later the apps and the printed sheets. Vocabulary: `glossary.md`.

## The 13 rules

1. Translate the **concept**, not the word: *tie* (standings) = *sama mata*; *draw* (match) = *seri*; *draw* (lots) =
   *undian / membuat undian*. Never active *mengundi*.
2. **Buttons:** bare or *-kan* imperative (*Simpan, Tunjukkan, Catat insiden*). Never an English verb used as a BM verb
   (*Log*, *Seed*).
3. **Statements:** full *meN-* verbs; the passive where natural; *tidak akan* for system guarantees; *secara automatik* for
   "for you / by itself".
4. **Intransitive verbs take no object:** *tarik diri*, *log keluar* (so: *anda dilog keluar*, *Keluarkan peserta*).
5. **Classifiers:** *setiap/satu peserta*; *seorang* only for persons.
6. **"ia" is never an object after a verb:** *Seret tetingkap itu*, *bawanya*.
7. **Same English term, same BM term**, and Help quotes UI labels **exactly** (`tests/i18n-pages.test.js` checks the
   labels against `ui-strings-ms.js`).
8. **Stage and feature names keep their capitals everywhere** (Urus Kejohanan, Group Boards, Peringkat Akhir).
9. **Malaysian examples and names:** local events (Terbuka Selangor), pair names from given names (Hakim / Iskandar), no
   seasons, no surnames.
10. **No invented abbreviations** (S/Akhir, SA, drp). Fix the layout, or use a standard form (*Bil.*, *cth.*, *P16*).
11. **Dates and times from Intl ms-MY** in the UI (dd/mm/yyyy, 7:10 PTG); DBP prose style (*7.10 malam*) in Help.
12. **Darts loanwords** (leg, bye, seed, walkover, round robin, Plate, oche, bracket, board) stay lower-case English, with
    no plural, and are glossed once in Help.
13. **Never leave a joined string half translated:** every piece of a " · " subtitle needs a key, including title-case
    variants ("Best of 5 Legs").

## Owner decisions (2026-10-23)

- **No *bagan*: use *bracket*.** Labels, buttons, step names and sheet titles say *bracket* ("Sahkan & Cetak Bracket",
  "Jana bracket"). Running text writes "bracket (carta kalah mati)" on the first mention in each Help article, each
  spectator Help question and each public page, then *bracket*.
- **No *papan* for a dartboard: use *board*; the feature is *Group Boards*** ("Board 3", "setiap board", "Board Peringkat
  Akhir").

## Words that must not appear in BM text (checked by `tests/i18n-pages.test.js`)

*bagan*, *papan* (except inside the organiser's own data), *mengundi* (to vote) and *undi kumpulan*, *dua belah*
(double-sided printing), *keputusan seri* for a tie on points, *kaki penaja*, *bersemuka*, *melog keluar*, *kata sandi*,
*unduh*, *surel*, *pemarkahan*. Search synonyms may list them (people type them), because those are never shown.

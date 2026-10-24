# BM proofread of i18n steps 2 to 5 (2026-10-25)

Scope: every BM text a reader sees after i18n steps 2 to 5.

- **Step 2, viewer:** `viewer/i18n/ms.js` (348 keys) and the shared drawing-code table `i18n/render.ms.js` (61 keys, copied to
  `viewer/i18n/render.ms.js`).
- **Step 3, organiser app:** `i18n/app.ms.js` (1,020 keys, 594 coined in step 3).
- **Step 4, printed sheets:** `i18n/print.ms.js` (125 keys, 77 coined).
- **Step 5:** the sign-in and account pages (`i18n/auth.ms.js`), the server error table (`i18n/errors.ms.js`, 40 BM codes)
  and the bilingual e-mails (`api/_lib/emails.js`).
- The quoted labels in both BM Help pages.

I checked against `glossary.md`, `style-rules.md`, `PROOFREAD-STEP1.md` and the four builders' reports.

Method: I read every coined string of steps 2 to 5 next to its English (one dump per table, key / EN / BM). For the reused,
already proofread strings I read the viewer table in full and sampled the app table. I checked:
- meaning, terminology across screens, sheets, Help and e-mails, register and grammar (DBP)
- placeholder order and grammar around `{n}` / `{name}`
- the safety-critical texts (finalize, withdraw, no-show, clear result, publish, paper size, password and account messages)
- label length

I applied all corrections, ran `npm run sync-viewer` and `npm run build-landing`, and then:
- `npm run check-viewer`: ok.
- `npm test`: **1719 pass, 0 fail** (the same count as before; no test was removed or weakened).

I changed no English text, no app logic, no layout code and nothing in `docs/design/i18n-preview`.

## 1. Quality

**Good.** The builders kept the glossary decisions throughout: *bracket, board, Group Boards, sama mata, membuat undian /
diundi, Keputusan muktamad, pencatat skor, peserta, Perseorangan / Beregu / Berpasukan, lwn, ke-N, 7:10 PTG,
dd/mm/yyyy*. The register is consistently polite and neutral (*anda*). I found no Indonesian forms and no spelling errors.
The forbidden-word tests already passed, and the safety-critical messages were correct in substance:
- the knockout cascade (*keputusan berikutnya*, *turut mengosongkan*)
- withdraw versus no-show
- finalize being Admin-only
- publish before print
- "nothing is saved" in the sample event
- the paper-size consequences

The faults were mostly of the step 1 kind, English structure showing through:
- *Tarik diri {name}?* gives the intransitive *tarik diri* an object.
- *Menarik diri sekarang akan…* does not say who withdraws.
- *sama {pts} mata* is a calque of "level on 4 pts".
- *kemudian* is used for "later on".
- *adalah pilihan*.
- *mesti tidak melebihi*.
- *Bracket-bracket* is a plural of a loanword.
- *sebuah acara* uses the wrong classifier.
- The app said *helaian Peringkat Akhir* while the sheet and its exit labels say *helaian Akhir* / *ke Akhir 5-1 »*. The
  organiser Help even quoted *"ke Peringkat Akhir 5-1"*, which no sheet prints.

The few meaning faults were in coined explanatory sentences:
- *Undian seterusnya* for "Draw next" reads "the next draw".
- *Bukan keputusan akhir yang sah* reads "not a valid final result".
- *(hanya pemenang setiap kumpulan yang mara sekarang)* turns "already" into "now".
- *Nombor genap boleh berakhir seri* says a number can end level.
- *Semua carta… sudah memulakan perlawanannya* says the charts start the games.

The e-mails are good: correct BM halves, clear expiry wording (*pautan ini sah selama 24 jam*), the correct *Lupa kata
laluan?* quote, *Salam sejahtera {name},*. They needed no change.

## 2. Corrections by area and category

Counts are distinct corrections. The number in brackets is the number of strings changed when one correction applied to
several keys.

| Area | Meaning | Terminology / consistency | Register / grammar | Naturalness | Spelling | Punctuation | Layout | Total |
|---|---|---|---|---|---|---|---|---|
| Viewer (`viewer/i18n/ms.js`) | 4 (5) | 2 (6) | 4 (6) | 6 (10) | 0 | 0 | 0 | **16 (27)** |
| Shared drawing code (`render.ms.js`) | 1 | 0 | 0 | 1 (10) | 0 | 0 | 0 | **2 (10)** |
| Organiser app (`app.ms.js`) | 12 (15) | 8 (12) | 13 (14) | 16 (17) | 0 | 1 | 0 | **50 (59)** |
| Printed sheets (`print.ms.js` + Help) | 1 | 2 (4) | 0 | 2 | 0 | 0 | 0 | **5 (7)** |
| Sign-in, server errors, e-mails | 1 | 1 | 5 (6) | 1 (2) | 0 | 0 | 0 | **8 (10)** (e-mails: 0) |
| **Total** | **19** | **13** | **22** | **26** | **0** | **1** | **0** | **81 (113)** |

Kept in step with the corrections:
- **Organiser Help:** the split-sheet paragraph and the glossary entry now use *seksyen*, *bahagian kiri / kanan*,
  *helaian Akhir* and *"ke Akhir 5-1"*, as printed.
- **Label docs:** `docs/i18n/ui-strings-ms.js` (9 entries) and `docs/i18n/ui-strings-needed.md` (56 rows) now hold the
  final strings.
- **Tests:** eight pinned BM values were updated to the corrected text, with the same assertions:
  - `tests/app-i18n.test.js` and `tests/viewer-i18n.test.js`: *sama mata dengan {pts} mata*
  - `tests/print-i18n.test.js`: *diberi seed mengikut…*
  - `tests/auth-i18n.test.js` (×4): *Pendaftaran masih ditutup*, *Sila cuba lagi kemudian*
  - `tests/change-password-ui.test.js`: *Kata laluan anda tidak dapat ditukar*

Layout: I changed no code. Long labels are listed in section 5.

## 3. The 20 most important corrections

| # | Where (key) | Before | After | Why |
|---|---|---|---|---|
| 1 | Withdraw dialog title (`wd.title`) | *Tarik diri {name}?* | *{name} menarik diri?* | Style rule 4: *tarik diri* never takes an object. Safety dialog. |
| 2 | Withdraw refusals (`wd.headPods`, `wd.headKo`, `wd.headGroup`) | *Menarik diri sekarang akan meninggalkan {name} dalam bracket…* | *Jika {name} menarik diri sekarang, {name} akan kekal dalam bracket dan keputusan yang sudah dimasukkan akan berubah.* | The old sentence had no subject, so it read as if the organiser withdraws. It now says plainly what goes wrong. |
| 3 | Split brackets: paper dialog (`paper.o.splitText`, `paper.p.split`, `paper.p.noneSplit`) and organiser Help | *helaian Peringkat Akhir*; Help *"ke Peringkat Akhir 5-1"*, *bahagian L1*, *separuh kiri* | *helaian Akhir*; *"ke Akhir 5-1"*, *seksyen L1*, *bahagian kiri* | One name in the dialog, on the paper and in Help. The Help quoted an exit label that no sheet prints. |
| 4 | Tie notes and ties box (`r.tie.*` ×10, `ties.item`, `ties.cutItem`) | *{hi} di hadapan {lo} — sama {pts} mata* | *… — sama mata dengan {pts} mata* | A calque of "level on 4 pts". The new form is the Malaysian sports phrase, and it keeps the glossary's *sama mata*. |
| 5 | Score error (`ko.score.err.invalid`, `rr.score.err.invalid`) | *Bukan keputusan akhir yang sah untuk terbaik daripada {n} leg* | *Keputusan ini tidak sah bagi perlawanan terbaik daripada {n} leg* | *keputusan akhir* reads "final result", next to *perlawanan akhir* (the Final). The stray ". (cth." was fixed too. |
| 6 | Home stage cards (`hm.drawNext`, `hm.next.knockout`, `hm.next.finals`) | *Undian seterusnya*, *Undian kalah mati seterusnya*, *Peringkat Akhir seterusnya* | *Menunggu undian*, *Menunggu undian kalah mati*, *Seterusnya: Peringkat Akhir* | The old forms read "the next draw" and "the next Finals". |
| 7 | Password change failure (app `pw.err.failed` / `pw.err.offline`, server `err.password_change_failed`) | *Kata laluan tidak dapat ditukar. Sila cuba lagi.* / *Tidak dapat menukar kata laluan anda.* | both *Kata laluan anda tidak dapat ditukar. Sila cuba lagi.* (offline: *… Semak sambungan anda dan cuba lagi.*) | One sentence, as briefed. |
| 8 | Password length limits (`pw.err.max`, `err.new_password_too_long`, `err.name_too_long`) | *mesti tidak melebihi 200 aksara*; *Nama mesti 80 aksara atau kurang* | *tidak boleh melebihi 200 aksara*; *Nama tidak boleh melebihi 80 aksara* | The standard form-validation wording. |
| 9 | Password changed (`pw.changedText`) | *…; pelayar ini kekal log masuk.* | *…; anda kekal log masuk dalam pelayar ini.* | A browser does not "stay signed in"; the user does. This is a security text. |
| 10 | Sign-up closed (`register.closed`, `err.signup_closed`) | *Pendaftaran belum dibuka. Akaun dibuka oleh pentadbir laman.* | *Pendaftaran masih ditutup. Akaun dibuka oleh pentadbir laman.* | *dibuka* twice in two short sentences, with two meanings. The step 1 sentence is kept. |
| 11 | Even legs warning (`legs.evenWarning`) | *Nombor genap boleh berakhir seri* | *Bilangan leg genap boleh menyebabkan keputusan seri — nombor ganjil disyorkan.* | A number cannot "end level"; a match can. |
| 12 | Too many in the bracket (`tooMany.mainHintOne`) | *(hanya pemenang setiap kumpulan yang mara sekarang)* | *(sekarang pun hanya pemenang setiap kumpulan yang mara)* | "already" had become "now", which confused the advice. |
| 13 | Void match (`ko.void.text`) | *Masukkan skor untuk memainkannya, atau [Batalkan]* | *Jika perlawanan ini dimainkan juga, masukkan skornya, atau [Batalkan]* | Entering a score does not "play" a match. |
| 14 | Undo a no-show (`rr.undoBlocked`) | *Jika mereka sebenarnya bermain sesuatu perlawanan* | *Jika perlawanan itu sebenarnya dimainkan* | Vague *sesuatu*. The instruction is about that WO match. |
| 15 | Finalize (`fin.intro`, `fin.askText`) | *acara berpindah ke Keputusan* | *acara berpindah ke tab Keputusan* | Bare *Keputusan* reads "the event moves to results". This is the Results tab of the public home. |
| 16 | Group Boards draw (`pods.chooseHow`, `pods.moveHint`) | *diagihkan ke dalam sebanyak itu kalah mati kecil*; *Kumpulan yang satu lagi kemudian mempunyai…* | *diagihkan kepada kumpulan kalah mati kecil mengikut bilangan ini*; *Kumpulan yang dituju akan mendapat seorang pemain tambahan.* | Garbled word order, and the *kemudian* calque. |
| 17 | Start all games (`start.alreadyText`) | *Semua carta yang disahkan sudah memulakan perlawanannya.* | *Perlawanan dalam semua carta yang disahkan sudah bermula.* | Charts do not start games. |
| 18 | Viewer Me tab (`ev.me.empty.*`) | *Kedudukan kumpulan dan perlawanan seterusnya anda* | *Kedudukan anda dalam kumpulan dan perlawanan anda yang seterusnya* | *seterusnya anda* could also read "next, you…". |
| 19 | Viewer tips and Following (`ev.fol.empty.*`, `hm.tip.event3.*`, `hm.tip.home3`) | *menyimpan mereka semua*; *di bawah jadual* | *supaya semuanya berada di satu tempat*; *di bawah jadual kedudukan* | Glossary section 7: *jadual* alone reads "schedule"; *menyimpan* = save. |
| 20 | Rules sheet (`pr.f.seeded`) and projection note (`pr.proj.plateToo`) | *seed ikut kedudukan akhir dalam kumpulan*; *tidak akan membuat kedua-dua bracket* | *diberi seed mengikut kedudukan akhir dalam kumpulan*; *tidak akan menjana mana-mana bracket* | The glossary verb form, and "neither" (not "both") on the printed note. |

Other notable corrections:
- *Bracket-bracket ini* → *Bracket ini* (no plural for a loanword).
- *sebuah acara* → *satu acara*.
- *adalah pilihan* → *tidak wajib*.
- *Jika anda kekalkan* → *Jika anda mengekalkan*.
- *8 pt atau lebih lebih mudah dibaca* → *saiz 8 pt ke atas lebih mudah dibaca*.
- *supaya aplikasi memilih sendiri* → *… secara automatik*.
- *ditanda dengan bintang* → *tanda bintang*.
- *Bila* (column) → *Masa*.
- *Tunjuk* → *Tunjukkan*.
- *Halaman ini baca sahaja* → *untuk bacaan sahaja*.
- *Sila cuba lagi kemudian*.
- *ditukar dari tempat lain* → *di tempat lain*.
- *ID tiada* → *ID tidak diberikan*.

## 4. Final decisions on the main coined labels and the open CHECK items

| Item | Decision |
|---|---|
| Split "Finals sheet" / exit label | **helaian Akhir / ke Akhir 5-1 »** (kept: it must be no wider than "to Finals 5-1 »"). The app dialog and Help now say the same. *Peringkat Akhir* stays only for the Group Boards Finals. |
| Section / halves | **Seksyen L1 / bahagian kiri / bahagian kanan** (Help aligned) |
| Group Boards one-line placeholder | **Pemenang K3 / K3: tiada** kept for width (the box shows only one nowrap line, as wide as "Gp 3 winner"). It is an exception to rule 10. The full *Pemenang / Kumpulan 3* is used wherever two lines fit. CHECK: *Kump. 3* if a later layout pass shows it fits. |
| TIDAK HADIR on two lines in bracket boxes | **Accepted** (TIDAK / HADIR, never wider than NO-SHOW) |
| Bahasa helaian bercetak | **Accepted** |
| Board N, sambungan / BOARD (sheet title) / Bil. / Nama Pasukan / JUMLAH MATA / Tandatangan Kapten/Pengurus / PEMECAH SERI | **Accepted** |
| QR caption *Keputusan langsung — Imbas, atau layari* | **Accepted** |
| TBA on the home date tile | **Keep "TBA"** (Malaysian posters use it; no BM word fits 52 px) |
| "Reconnecting" / *Menyambung semula* in the spectator Help | The viewer never shows it. **Left as a known gap**: the English Help has the same sentence, and English is out of scope. Fix both Helps together. |
| Tandakan tidak hadir sebagai gantinya (37 characters) | **Kept** (step 1 decision, pinned in Help and tests). The builder made BM buttons wrap. CHECK on a 360 px phone if it ever shows there (the app is landscape-only). |
| Stage cards | **Menunggu undian / Menunggu undian kalah mati / Seterusnya: Peringkat Akhir / Undian telah dibuat / Menunggu kumpulan** |
| Sign-in coined labels | **Accepted:** *Buka akaun*, *Sudah ada akaun?*, *Hampir selesai.*, *Hantar semula e-mel pengesahan*, *Hantar pautan set semula*, *Kembali ke log masuk*, *Sahkan / Tetapkan kata laluan baharu*, *Minta pautan baharu*, *Sedang log masuk…* |
| *Anda belum log masuk atau sesi anda telah tamat.* (`not_authenticated`) | **Accepted** (translated by meaning) |
| E-mail subjects "English / BM" | **Accepted unchanged** (all 78 characters or fewer). English keeps "email". |
| *sama mata dengan {pts} mata* | **New rule** (glossary section 8) |

## 5. Residual risks

1. **Long BM labels** (no layout code changed). The builders measured no overflow at their widths, but these are the
   ones to watch:
   - *Tandakan tidak hadir sebagai gantinya* (37)
   - *Cetak semua borang barisan yang sedia* (37, quoted in Help)
   - *Gagal disimpan — klik untuk cuba lagi* (37, status pill)
   - *Buka dalam tetingkap baharu ↗* (29)
   - *Simpan format & penjenamaan →* (29)
   - *Tetapkan kata laluan baharu* on a 320 px sign-in card (fixed by the builder with less padding)
2. **The longer tie notes.** *sama mata dengan {pts} mata* adds 10 characters to every tie note under a table. They wrap
   as prose, but check one viewer screen at 360 px.
3. **"K3"** is a short form a first-time reader may not decode. It appears only when the Finals box is too low for two
   lines.
4. **Auto entry names** (*Pemain A1*) are stored data in the language of creation and print as stored (builder decision,
   step 4). An English sheet from a BM-created event shows BM auto names.
5. **Admin-only server messages stay English** on BM pages (as decided). The viewer's own API answers ("Not found.") are
   handled by status, so they are never shown.
6. **The reused strings of `app.ms.js` were sampled, not re-read word by word.** Their source, `ui-strings-ms.js`, was
   proofread twice before.

## 6. For a native Malaysian darts organiser to confirm

- **helaian Akhir / ke Akhir 5-1 »** on split A4 brackets, and **Seksyen L1**.
- **Pemenang K3** (or *Pemenang Kump. 3*) in a cramped Group Boards Finals box.
- **Menunggu undian** on the home page stage cards.
- **sama mata dengan 4 mata** in the tie notes.
- **{name} menarik diri?** as the Withdraw dialog title (or *Keluarkan {name} (tarik diri)?*).
- **Buka akaun** (sign-up button) against *Daftar akaun* / *Cipta akaun*.
- **TBA** on the home tile, against *Akan diumumkan*.
- **Tandakan tidak hadir sebagai gantinya**: acceptable, or would *Tandakan tidak hadir* alone be clearer?
- **Bil.**, **Pencatat**, **Tandatangan Kapten/Pengurus** on the lineup sheet; **BOARD** as the Boards sheet title.
- **Dikuasakan oleh DartDraw** (viewer footer), against *Dibina dengan DartDraw*.

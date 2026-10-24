// Bahasa Malaysia words of the public pages (/ms, /ms/features, /ms/how-it-works and the frame of /ms/help).
// The twin of scripts/i18n/en/landing.js: the same keys, the same order. Terms follow docs/i18n/glossary.md
// (polite "anda", bracket / board / seed / bye / leg kept in English, stage names as in the app's BM table).
// Proofread draft: docs/design/i18n-preview/src/landing.ms.js (2026-10-23); the lines marked NEW were translated
// after Releases 1 to 5 and were proofread on 2026-10-24 (docs/i18n/PROOFREAD-STEP1.md) (README.md, "Languages: English and Bahasa Malaysia").
module.exports = {
  lang: 'ms',
  meta: {
    landing: { title: 'DartDraw – Kejohanan anda. Setiap undian, tersusun.', desc: 'Buat undian, susun kumpulan dan sediakan carta kejohanan dart berjenama – semuanya di satu tempat.' },
    features: { title: 'Ciri-ciri – DartDraw', desc: 'Round robin, kalah mati, Group Boards, keputusan langsung dan carta A4 berjenama – semua yang anda perlukan untuk mengendalikan undian dart.' },
    // NEW
    how: { title: 'Cara guna – DartDraw', desc: 'Tujuh langkah daripada persediaan acara hingga carta akhir: cipta acara, pilih format, tambah peserta, cetak, kendalikan hari kejohanan dan terima keputusan, semak, cetak carta akhir.' },
    help: { title: 'Bantuan untuk penganjur – DartDraw', desc: 'Panduan langkah demi langkah dan jawapan kepada soalan lazim untuk penganjur DartDraw: menyediakan acara, mengendalikan hari kejohanan, mencetak, keputusan langsung dan menamatkan acara.' }
  },
  common: {
    skip: 'Langkau ke kandungan',
    homeLabel: 'Laman utama DartDraw',
    mainNav: 'Utama',
    features: 'Ciri-ciri',
    how: 'Cara guna',
    help: 'Bantuan',
    logIn: 'Log masuk',
    footerNav: 'Kaki halaman',
    tagline: 'Carta kejohanan, dipermudah.',
    dialogLabel: 'Log masuk ke DartDraw',
    close: 'Tutup',
    headlineShared: 'Kurang masa menyediakan carta. <em>Lebih masa di oche.</em>',
    headlineNext: 'Sedia untuk <em>undian seterusnya?</em>'
  },
  landing: {
    eyebrow: 'Dibina untuk penganjur kejohanan',
    h1: 'Kejohanan anda.<br>Setiap undian, <em>tersusun.</em>',
    lede: 'Buat undian, susun kumpulan dan sediakan carta kejohanan berjenama &mdash; semuanya di satu tempat.',
    explore: 'Terokai ciri-ciri',
    // NEW (same sentence as the sign-in box's "No account yet?" line)
    ctaNote: 'Belum ada akaun? Akaun dibuka oleh pentadbir laman.',
    typesLabel: 'Jenis pertandingan',
    types: ['Perseorangan', 'Beregu', 'Berpasukan'],
    preview: {
      workspace: 'Ruang kerja kejohanan',
      menu: ['Ringkasan', 'Carta &amp; cetakan', 'Kumpulan', 'Kalah mati', 'Pemain', 'Tetapan acara'],
      tabs: ['Round robin', 'Kalah mati', 'Carta', 'Penjenamaan', 'Butiran acara'],
      sub: 'Round Robin &middot; Terbaik daripada 3',
      pill: 'Pratonton cetakan A4',
      group: 'KUMPULAN A<small>BOARD 01</small>',
      heads: ['#', 'Pemain', '1', '2', '3', '4', 'Menang', 'Leg', 'Kedudukan'],
      matchOrder: 'SUSUNAN PERLAWANAN',
      orderText: '1. 1 lwn 2 &nbsp; 3. 1 lwn 3 &nbsp; 5. 1 lwn 4<br>2. 3 lwn 4 &nbsp; 4. 2 lwn 4 &nbsp; 6. 2 lwn 3',
      logo: 'LOGO ANDA DI SINI',
      sponsor: 'LOGO PENAJA DI SINI'
    },
    stripLabel: 'Perkara yang diliputi DartDraw',
    stripH: 'Satu ruang kerja.<br>Setiap peringkat undian anda.',
    strip: ['Round robin', 'Kalah mati', 'Penjenamaan tersuai', 'Carta PDF A4'],
    stepsH: 'Daripada persediaan acara hingga balingan pertama.',
    steps: [
      { h: 'Sediakan acara anda', p: 'Tambah butiran kejohanan, jenis acara dan peserta.' },
      { h: 'Bina carta anda', p: 'Pilih format, kumpulan dan nombor board.' },
      { h: 'Semak. Simpan. Cetak.', p: 'Sahkan susun atur dan sediakan carta A4 anda.' }
    ],
    detail: 'Lihat cara guna secara terperinci'
  },
  features: {
    eyebrow: 'Ciri-ciri',
    h1: 'Semua yang anda perlukan untuk <em>mengendalikan undian.</em>',
    lede: 'Daripada kumpulan pertama hingga carta akhir, DartDraw menguruskan pengiraan, board dan kertas kerja.',
    fmtH: 'Tiga cara menjalankan acara',
    formats: [
      { h: 'Round robin', p: 'Semua bermain dalam kumpulan masing-masing, dengan kedudukan langsung sebaik sahaja skor dimasukkan.' },
      { h: 'Kalah mati', p: 'Penyingkiran terus dalam satu bracket (carta kalah mati), dengan bye ditambah secara automatik. Atau Group Boards dahulu: kumpulan kalah mati kecil, kemudian bracket peringkat akhir.' },
      { h: 'Round robin &rarr; Kalah mati', p: 'Peringkat kumpulan dahulu, kemudian peserta teratas mara ke bracket. Peserta yang tidak mara boleh bermain dalam saingan Plate.' }
    ],
    moreH: 'Dibina mengikut cara sebenar hari kejohanan berjalan',
    cards: [
      { h: 'Juara bagi setiap kumpulan &mdash; Group Boards', p: 'Mahukan juara kumpulan sebelum peringkat akhir? Pilih Kalah mati, kemudian Group Boards: peserta dibahagikan kepada kumpulan kalah mati kecil, setiap satu di board sendiri. Setiap kumpulan menobatkan juara, dan para juara bertemu dalam bracket Peringkat Akhir.', chip: 'Pilihan' },
      { h: 'Undian adil, dibina untuk anda', li: ['Kumpulan dibina dan diimbangkan secara automatik', 'Pisahkan peserta dari organisasi yang sama, dalam kumpulan atau dalam pusingan kalah mati pertama', 'Penempatan dalam bracket mengikut seed atau secara rawak, dengan nombor board bagi setiap kumpulan'] },
      { h: 'Skor dikira untuk anda', li: ['Masukkan skor terus pada carta; kedudukan dikemas kini serta-merta', 'Pemecah seri mengikut keputusan perlawanan sesama mereka, beza leg, leg dimenangi, kemudian keputusan anda &mdash; dan DartDraw menandakan setiap kedudukan sama mata yang memerlukan keputusan anda', 'Ketidakhadiran, walkover, tarik diri dan daftar masuk'] },
      { h: 'Leg mengikut kehendak anda', p: 'Tetapkan bilangan leg (terbaik daripada) untuk seluruh acara, atau ubah mengikut pusingan kalah mati: pusingan awal, suku akhir, separuh akhir dan akhir.' },
      { h: 'Perseorangan, beregu dan berpasukan', p: 'Jalankan acara perseorangan, beregu atau berpasukan. Pasangan atau pasukan dipaparkan dengan namanya sahaja pada carta, keputusan dan halaman langsung. Perlawanan pasukan terdiri daripada segmen (perseorangan, beregu, trio atau berempat, dengan pemecah seri pilihan), dan anda memasukkan satu keputusan: jumlah leg yang dimenangi setiap pasukan.' },
      // NEW: the third point (the QR code is only on the group charts and bracket sheets, once published)
      { h: 'Penjenamaan anda, sedia untuk dicetak', li: ['Logo anda, logo penaja dan baris peraturan atau kaki halaman', 'Set carta kosong A4 sebelum hari kejohanan, dan carta akhir dengan semua keputusan selepasnya', 'Kod QR pada carta kumpulan dan helaian bracket yang membuka halaman langsung, sebaik sahaja keputusan diterbitkan'] },
      { h: 'Keputusan langsung untuk semua', li: ['Kongsi satu pautan: pemain melihat kumpulan mereka, perlawanan seterusnya dan bracket, serta boleh mengikuti rakan', 'Halaman dimuat semula secara automatik, dan memaparkan &ldquo;Keputusan muktamad&rdquo; apabila selesai', 'Acara juga boleh dipaparkan di halaman utama awam'] },
      { h: 'Alatan untuk hari kejohanan', li: ['Anggaran masa mula, waktu rehat dan pelan board', 'Buka round robin dan kalah mati dalam tetingkap berasingan untuk beberapa skrin', 'Log insiden peribadi, dan keputusan yang diterima mengunci kedudukan akhir'] },
      { h: 'Selamat, dan sentiasa bersama anda', p: 'Log masuk dari mana-mana peranti dan acara anda disimpan ke akaun anda. Hanya anda dan Pentadbir boleh mengubahnya.' }
    ]
  },
  how: {
    eyebrow: 'Cara guna',
    h1: 'Daripada persediaan acara hingga <em>balingan pertama.</em>',
    lede: 'Tujuh langkah, mengikut urutan anda melakukannya. Aplikasi membimbing anda melalui setiap satu.',
    stepsLabel: 'Tujuh langkah',
    // NEW: the step titles are now the app's stage names, and steps 1, 4, 5, 6 and 7 say more
    steps: [
      { h: 'Cipta acara', p: 'Namakan acara, pilih kategori dan Perseorangan, Beregu atau Berpasukan, tetapkan tarikh dan bilangan peserta: pemain, pasangan atau pasukan.' },
      { h: 'Format &amp; penjenamaan', p: 'Pilih format dan bilangan leg (terbaik daripada), termasuk kalah mati dengan Group Boards jika anda mahukan juara bagi setiap kumpulan sebelum peringkat akhir. Tambah logo, penaja dan kaki halaman anda. Persediaan Asas memudahkan urusan; Lanjutan menambah penjadualan, leg bagi setiap pusingan dan saingan Plate.' },
      { h: 'Butiran carta', p: 'Tambah peserta anda. DartDraw membina kumpulan yang seimbang dan memberikan board kepada setiap kumpulan, dan anda boleh melaraskan apa-apa secara manual.' },
      { h: 'Sahkan &amp; Cetak Bracket', p: 'Semak setiap carta, sahkan, dan cetak set A4 kosong. Mahukan kod QR pada helaian? Terbitkan keputusan dahulu: langkah ini menyediakan butang untuknya.' },
      { h: 'Urus Kejohanan', p: 'Kendalikan hari kejohanan: mulakan perlawanan, masukkan skor dan lihat kedudukan dikemas kini. Apabila kumpulan selesai, buat undian kalah mati. Kongsi pautan langsung supaya pemain boleh mengikutinya. Apabila keputusan perlawanan akhir sudah dimasukkan, klik Terima &amp; muktamadkan di bahagian bawah langkah ini: halaman langsung kemudian memaparkan &ldquo;Keputusan muktamad&rdquo;.' },
      { h: 'Muktamadkan Kedudukan', p: 'Semak jadual dan kedudukan akhir. Langkah ini baca sahaja: untuk membetulkan skor, kembali ke Urus Kejohanan.' },
      { h: 'Cetak Carta Akhir', p: 'Cetak carta lengkap dengan semua keputusan, atau simpan sebagai PDF.' }
    ],
    gtkH: 'Perlu diketahui',
    notes: [
      { b: 'Disimpan secara automatik', p: 'Semuanya disimpan ke akaun anda, jadi anda boleh menyambung pada mana-mana peranti.' },
      { b: 'Halaman langsung dikemas kini secara automatik', p: 'Pemain tidak perlu memuat semula untuk melihat keputusan baharu.' },
      // NEW: "with Accept & finalize"
      { b: 'Keputusan yang diterima dikunci', p: 'Selepas anda menerimanya dengan Terima &amp; muktamadkan, hanya Pentadbir boleh membukanya semula.' }
    ]
  },
  helpPage: {
    eyebrow: 'Bantuan',
    searchLabel: 'Cari dalam bantuan',
    // NEW (the English example changed to "wrong score")
    placeholder: 'Cuba &ldquo;tidak hadir&rdquo;, &ldquo;skor salah&rdquo; atau &ldquo;cetak&rdquo;',
    articlesLabel: 'Artikel dan soalan bantuan',
    contentsLabel: 'Kandungan bantuan',
    contents: 'Kandungan',
    jump: 'Pergi ke topik',
    quickAnswers: 'Jawapan pantas',
    // NEW
    start: 'Baru menggunakan DartDraw? Mulakan dengan <a href="#quick-start">Mula pantas</a>. Tidak pasti maksud sesuatu perkataan? Lihat <a href="#glossary">Istilah yang akan anda lihat</a>. Ada yang tidak berfungsi? Lihat <a href="#troubleshooting">Apabila berlaku masalah</a>.',
    spectatorBefore: 'Mengikuti acara sebagai penonton? Laman keputusan awam mempunyai ',
    spectatorLink: 'halaman bantuan untuk penonton',
    spectatorAfter: ' sendiri.',
    logInTo: 'Log masuk ke DartDraw',
    // NEW: the no-answer box
    noAnswerBefore: 'Tiada jawapan untuk &ldquo;',
    noAnswerAfter: '&rdquo;.',
    tryFewer: 'Cuba kurangkan perkataan, atau gunakan perkataan lain. Atau mulakan dengan salah satu daripada yang berikut:',
    linkToSection: 'Pautan ke bahagian ini',
    backToTop: 'Kembali ke atas &uarr;',
    // NEW: BM has one form for every number
    search: {
      count: '{n} hasil',
      near: 'Tiada jawapan tepat. {n} padanan yang hampir',
      nearLabel: 'Padanan paling hampir:',
      showAll: 'Tunjukkan kesemua {n} hasil'
    }
  },
  switcher: {
    group: 'Language / Bahasa',
    en: 'English',
    ms: 'Bahasa Malaysia'
  }
};

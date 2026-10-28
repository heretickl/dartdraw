/* Bahasa Malaysia words for render.js (the standings tables, tie-break notes and knockout charts shared by the organiser
   app and the public viewer). The English table is DD_RENDER_EN at the top of render.js; the keys and {placeholders} here
   must match it (tests/viewer-i18n.test.js). Terms follow docs/i18n/glossary.md.
   This root copy is the source: npm run sync-viewer copies it to viewer/i18n/render.ms.js (checked by npm run check-viewer).
   The organiser app does not load it yet (i18n step 3); the viewer does. */
var DD_RENDER_MS = {
  'r.unknown': 'Tidak diketahui',
  'r.sizeError': 'Saiz bracket {size} melebihi maksimum {max} slot untuk carta ini (penganjur boleh memilih paling banyak {seeds} seed, dan bracket ditetapkan pada 2× bilangan itu).',
  'r.round.final': 'Akhir', 'r.round.semi': 'Separuh akhir', 'r.round.quarter': 'Suku akhir', 'r.round.of': 'Pusingan {n} terakhir',
  'r.podNoWinner': 'Kumpulan {g}: tiada pemenang', 'r.podWinner': 'Pemenang Kumpulan {g}',
  'r.bye': 'BYE', 'r.wo': 'WO', 'r.noShow': 'TIDAK HADIR', 'r.vs': 'LWN', 'r.final': 'AKHIR', 'r.champion': 'JUARA',
  'r.markNoShow': 'Tandakan tidak hadir…',
  'r.th.pos': 'Ked.', 'r.th.entry': 'Peserta', 'r.th.mp': 'Main', 'r.th.mw': 'M', 'r.th.ml': 'K', 'r.th.md': 'S', 'r.th.lw': 'LM',
  'r.th.diff': '+/-', 'r.th.pts': 'Mata', 'r.th.tb': 'TB', 'r.th.legs': 'Leg',
  'r.tt.mp': 'Perlawanan dimainkan', 'r.tt.mw': 'Perlawanan dimenangi', 'r.tt.ml': 'Perlawanan kalah', 'r.tt.md': 'Perlawanan seri', 'r.tt.lw': 'Leg dimenangi',
  'r.tt.diff': 'Beza leg (leg dimenangi tolak leg kalah)', 'r.tt.pts': 'Mata', 'r.tt.tb': 'Pemecah seri yang memisahkan peserta ini daripada peserta di sebelahnya',
  'r.tt.miniMp': 'Perlawanan dimainkan sesama peserta ini', 'r.tt.miniPts': 'Mata daripada perlawanan ini', 'r.tt.miniLegs': 'Leg menang–kalah dalam perlawanan ini',
  'r.tb.level': 'Masih sama mata selepas setiap peraturan pemecah seri',
  'r.tb.sep': 'Dipisahkan daripada peserta di sebelahnya yang sama mata melalui: {rule}',
  'r.tb.sepMini': 'Dipisahkan daripada peserta di sebelahnya yang sama mata melalui: {rule} (jadual mini {n} peserta yang sama mata)',
  'r.tb.way': '{badge} {n} hala',
  'r.rule.h2h': 'Keputusan pertemuan (head-to-head)', 'r.rule.ld': 'Beza leg', 'r.rule.lw': 'Leg dimenangi', 'r.rule.org': 'Keputusan penganjur / perlawanan penentuan',
  'r.badge.h2h': 'H2H', 'r.badge.ld': 'BL', 'r.badge.lw': 'LM',
  'r.list.and': ' dan {last}',
  'r.tie.levelPublic': '{names} masih sama mata dengan {pts} mata selepas setiap peraturan pemecah seri — memerlukan keputusan penganjur atau perlawanan penentuan.',
  'r.tie.levelOrg': '{names} masih sama mata dengan {pts} mata selepas setiap peraturan pemecah seri — memerlukan keputusan penganjur atau perlawanan penentuan (gunakan Laraskan kedudukan).',
  'r.tie.h2h': '{hi} di hadapan {lo} — sama mata dengan {pts} mata, dipisahkan oleh keputusan pertemuan (head-to-head), iaitu menang dalam perlawanan antara mereka.',
  'r.tie.h2hMini': '{hi} di hadapan {lo} — sama mata dengan {pts} mata, dipisahkan oleh keputusan pertemuan (head-to-head) antara peserta yang sama mata (mata jadual mini {a} lwn {b}).',
  'r.tie.ld': '{hi} di hadapan {lo} — sama mata dengan {pts} mata, dipisahkan oleh beza leg ({a} lwn {b}).',
  'r.tie.ldMini': '{hi} di hadapan {lo} — sama mata dengan {pts} mata, dipisahkan oleh beza leg sesama peserta yang sama mata ({a} lwn {b}).',
  'r.tie.lw': '{hi} di hadapan {lo} — sama mata dengan {pts} mata, dipisahkan oleh leg dimenangi ({a} lwn {b}).',
  'r.tie.lwMini': '{hi} di hadapan {lo} — sama mata dengan {pts} mata, dipisahkan oleh leg dimenangi sesama peserta yang sama mata ({a} lwn {b}).',
  'r.tie.other': '{hi} di hadapan {lo} — sama mata dengan {pts} mata, dipisahkan oleh {rule}.',
  'r.tie.manual': 'Kedudukan ditetapkan secara manual oleh penganjur.',
  'r.tie.mini': 'Jadual mini: {names} — sama mata dengan {pts} mata, hanya perlawanan sesama mereka dikira.',
  'r.tie.provisional': 'Sementara — kedudukan sama mata mungkin berubah apabila baki perlawanan dimainkan.'
};
if (typeof module !== 'undefined' && module.exports) module.exports = DD_RENDER_MS;

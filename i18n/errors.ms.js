/* API error codes in Bahasa Malaysia (i18n step 5): the answers that organisers and people signing in can see. Same
   keys and {placeholders} as errors.en.js; the Admin-only codes (DD_ERR_ADMIN_ONLY there) are left out on purpose, so a
   BM page shows their English text. Vocabulary: docs/i18n/glossary.md (e-mel, kata laluan, pautan, log masuk, Pentadbir,
   acara, kejohanan, peserta, dimuktamadkan); "mesti", as in the organiser app's own password messages. */
var DD_ERR_MS = {
  /* every endpoint */
  'err.method_not_allowed': 'Kaedah tidak dibenarkan',
  'err.not_found': 'Tidak dijumpai.',
  'err.missing_id': 'ID tidak diberikan.',
  /* session */
  'err.not_authenticated': 'Anda belum log masuk atau sesi anda telah tamat.',
  'err.public_account_failed': 'Akaun awam tidak dapat dikenal pasti.',
  'err.session_check_failed': 'Tidak dapat mengesahkan sesi anda.',
  'err.admin_only': 'Untuk Pentadbir sahaja.',
  /* sign in */
  'err.email_password_required': 'E-mel dan kata laluan diperlukan.',
  'err.rate_limited': 'Terlalu banyak percubaan. Sila cuba lagi kemudian.',
  'err.bad_credentials': 'E-mel atau kata laluan tidak betul.',
  'err.unverified': 'Sila sahkan e-mel anda dahulu.',
  'err.suspended': 'Akaun ini telah digantung.',
  'err.login_failed': 'Tidak dapat log masuk.',
  /* sign up, verify, forgot, reset */
  'err.signup_closed': 'Pendaftaran masih ditutup.',
  'err.name_required': 'Sila masukkan nama anda.',
  'err.name_too_long': 'Nama tidak boleh melebihi 80 aksara.',
  'err.invalid_email': 'Sila masukkan alamat e-mel yang sah.',
  'err.password_too_short': 'Kata laluan mesti sekurang-kurangnya 8 aksara.',
  'err.register_failed': 'Tidak dapat membuka akaun.',
  'err.mail_failed': 'Tidak dapat menghantar e-mel.',
  'err.invalid_link': 'Pautan ini tidak sah atau telah tamat tempoh.',
  'err.invalid_link_or_password': 'Pautan ini tidak sah, telah tamat tempoh atau kata laluan tidak betul.',
  'err.verify_failed': 'Tidak dapat mengesahkan e-mel anda.',
  'err.reset_failed': 'Tidak dapat menetapkan semula kata laluan anda.',
  /* change password (organiser app) */
  'err.password_change_unavailable': 'Kata laluan akaun ini tidak boleh ditukar.',
  'err.passwords_required': 'Masukkan kata laluan semasa dan kata laluan baharu anda.',
  'err.new_password_too_short': 'Kata laluan baharu mesti sekurang-kurangnya 8 aksara.',
  'err.new_password_too_long': 'Kata laluan baharu tidak boleh melebihi 200 aksara.',
  'err.new_password_same': 'Pilih kata laluan baharu yang berbeza daripada kata laluan semasa.',
  'err.current_password_incorrect': 'Kata laluan semasa tidak betul.',
  'err.password_changed_elsewhere': 'Kata laluan anda baru sahaja ditukar di tempat lain. Sila cuba lagi.',
  'err.password_change_failed': 'Kata laluan anda tidak dapat ditukar. Sila cuba lagi.',
  /* events */
  'err.load_list_failed': 'Tidak dapat memuatkan senarai kejohanan.',
  'err.load_failed': 'Tidak dapat memuatkan kejohanan.',
  'err.invalid_id': 'ID kejohanan tidak sah.',
  'err.missing_data': 'Data kejohanan tidak diberikan.',
  'err.finalized': 'Acara ini telah dimuktamadkan. Hanya Pentadbir boleh mengubahnya.',
  'err.entry_limit': 'Akaun Asas membenarkan sehingga {limit} peserta bagi setiap acara.',
  'err.changed_elsewhere': 'Kejohanan telah diubah di tempat lain.',
  'err.save_failed': 'Tidak dapat menyimpan kejohanan.'
};
if (typeof module !== 'undefined' && module.exports) module.exports = { DD_ERR_MS: DD_ERR_MS };

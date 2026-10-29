/* API error codes (i18n step 5): every error answer from api/** is { code, error } (and sometimes more fields, such as
   limit or finalized). `error` is the English text, unchanged since before the codes existed; `code` is stable and is what
   a page translates: t('err.' + code), filled from the answer's own fields ({limit}), falling back to the English `error`.
   This file is the English list of every code (tests/api-error-codes.test.js checks that each code the server sends is
   here and that the text matches the server's). The Bahasa Malaysia table is errors.ms.js.
   Loaded by the sign-in and account pages (login, forgot, register, reset, verify) through i18n/auth-i18n.js; the
   organiser app can merge both tables into its own (see docs/i18n/ui-strings-needed.md, "Step 5").
   Codes in DD_ERR_ADMIN_ONLY answer Admin-only requests (the Admin panel stays in English): they have no BM text on
   purpose, and a BM page shows their English `error`. */
var DD_ERR_EN = {
  /* every endpoint */
  'err.method_not_allowed': 'Method not allowed',
  'err.not_found': 'Not found.',
  'err.missing_id': 'Missing id.',
  /* session (api/_lib/auth.js) */
  'err.not_authenticated': 'Not authenticated',
  'err.public_account_failed': 'Could not resolve public account.',
  'err.session_check_failed': 'Could not verify your session.',
  'err.admin_only': 'Admin only.',
  /* sign in */
  'err.email_password_required': 'Email and password are required.',
  'err.rate_limited': 'Too many attempts. Try again later.',
  'err.bad_credentials': 'Incorrect email or password.',
  'err.unverified': 'Please verify your email first.',
  'err.suspended': 'This account has been suspended.',
  'err.login_failed': 'Could not sign in.',
  /* sign up, verify, forgot, reset */
  'err.signup_closed': 'Sign-up is not open yet.',
  'err.name_required': 'Please enter your name.',
  'err.name_too_long': 'Name must be 80 characters or fewer.',
  'err.invalid_email': 'Please enter a valid email address.',
  'err.password_too_short': 'Password must be at least 8 characters.',
  'err.register_failed': 'Could not create account.',
  'err.mail_failed': 'Could not send the email.',
  'err.invalid_link': 'This link is invalid or has expired.',
  'err.invalid_link_or_password': 'This link is invalid, has expired, or the password is incorrect.',
  'err.verify_failed': 'Could not verify your email.',
  'err.reset_failed': 'Could not reset your password.',
  /* change password (organiser app) */
  'err.password_change_unavailable': 'Changing the password is not available for this account.',
  'err.passwords_required': 'Enter your current password and a new password.',
  'err.new_password_too_short': 'The new password must be at least 8 characters.',
  'err.new_password_too_long': 'The new password must be at most 200 characters.',
  'err.new_password_same': 'Choose a new password that is different from the current one.',
  'err.current_password_incorrect': 'The current password is incorrect.',
  'err.password_changed_elsewhere': 'Your password was changed just now from somewhere else. Please try again.',
  'err.password_change_failed': 'Could not change your password.',
  /* events (api/tournaments) */
  'err.load_list_failed': 'Could not load tournaments.',
  'err.load_failed': 'Could not load tournament.',
  'err.invalid_id': 'Invalid tournament id.',
  'err.missing_data': 'Missing tournament data.',
  'err.finalized': 'This event is finalized. Only an Admin can change it.',
  'err.entry_limit': 'Basic accounts allow up to {limit} entries per event.',
  'err.changed_elsewhere': 'Tournament changed elsewhere.',
  'err.save_failed': 'Could not save tournament.',
  /* player library */
  'err.library_not_set_up': 'The player library is not set up yet.',
  'err.player_limit': 'You can keep up to 5,000 players.',
  'err.player_exists': 'A player with that name and club is already in the list.',
  'err.invalid_player_name': 'Enter a name (up to 80 characters).',
  'err.player_not_found': 'Player not found.',
  /* Admin panel only (English on purpose) */
  'err.request_failed': 'Could not complete that request.',
  'err.load_events_failed': 'Could not load events.',
  'err.event_not_found': 'Event not found.',
  'err.unknown_action': 'Unknown action.',
  'err.not_finalized': 'Event is not finalized.',
  'err.transfer_target_gone': 'That organiser no longer exists. Nothing was moved.',
  'err.transfer_target_missing': 'Choose an organiser to receive the events.',
  'err.transfer_target_same': 'Choose a different organiser to receive the events.',
  'err.transfer_target_not_found': 'The organiser to receive the events was not found.',
  'err.transfer_target_suspended': 'That organiser is suspended. Choose an active organiser.',
  'err.email_exists': 'An account with that email already exists.',
  'err.invalid_name': 'Name must be 1 to 80 characters.',
  'err.invalid_tier': 'Tier must be basic or pro.',
  'err.organiser_not_found': 'Organiser not found.',
  'err.account_suspended_reactivate': 'This account is suspended. Reactivate it first.',
  'err.last_admin': 'There must always be at least one active admin.',
  'err.nothing_to_change': 'Nothing to change.',
  'err.invalid_role': 'Role must be organizer or admin.',
  'err.invalid_suspended': 'Suspended must be true or false.',
  'err.own_role': 'You cannot change your own role.',
  'err.suspend_self': 'You cannot suspend yourself.',
  'err.admin_needs_verified': 'Only a verified account can be made an admin.',
  'err.delete_self': 'You cannot delete your own account.',
  'err.has_events': 'Transfer or delete their events first.',
  'err.invalid_contact': 'adminContact must be text.',
  'err.contact_too_long': 'The contact line must be 200 characters or fewer.',
  'err.contact_not_plain': 'The contact line must be plain text, without < or >.',
  'err.settings_missing': 'Send resultsDays and liveHours.',
  'err.invalid_setting_number': '{key} must be a whole number from {lo} to {hi}.',
  'err.settings_table_missing': 'The settings table does not exist yet. Run migrations/2026-10-14-admin.sql in Neon, then try again.'
};
/* Answers only the Admin panel shows (admin-ui.js, English only): no BM text. */
var DD_ERR_ADMIN_ONLY = [
  'load_events_failed', 'event_not_found', 'unknown_action', 'not_finalized', 'transfer_target_gone',
  'transfer_target_missing', 'transfer_target_same', 'transfer_target_not_found', 'transfer_target_suspended', 'email_exists',
  'invalid_name', 'invalid_tier', 'organiser_not_found', 'account_suspended_reactivate', 'last_admin', 'nothing_to_change',
  'invalid_role', 'invalid_suspended', 'own_role', 'suspend_self', 'admin_needs_verified', 'delete_self', 'has_events',
  'invalid_contact', 'contact_too_long', 'contact_not_plain', 'settings_missing', 'invalid_setting_number',
  'settings_table_missing'
];
if (typeof module !== 'undefined' && module.exports) module.exports = { DD_ERR_EN: DD_ERR_EN, DD_ERR_ADMIN_ONLY: DD_ERR_ADMIN_ONLY };

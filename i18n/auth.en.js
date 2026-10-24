/* The sign-in and account pages (login.html, forgot.html, register.html, reset.html, verify.html), English (i18n step 5).
   Flat key -> text, with {placeholders}; the BM table (auth.ms.js) has the same keys. The words in the pages' markup and
   scripts are these English texts: i18n/auth-i18n.js puts the current language's text in their place (static markup by
   data-i18n="key", messages by their English text, which this table maps to a key). The server's error answers are in
   errors.en.js / errors.ms.js ("err.<code>"). The Admin's contact line under "No account yet?" is the Admin's own text
   and is never translated. */
var DD_AUTH_EN = {
  /* the EN | BM switch (the same words in both languages, so either reader understands it) */
  'auth.switch.group': 'Language / Bahasa',
  'auth.switch.en': 'English',
  'auth.switch.ms': 'Bahasa Malaysia',
  /* shared by several pages */
  'auth.email': 'Email',
  'auth.password': 'Password',
  'auth.signIn': 'Sign in',
  'auth.pwHint': 'At least 8 characters.',
  'auth.offline': 'Could not reach the server. Check your connection and try again.',
  /* login.html (also the pop-up on the public pages: login.html?embed=1) */
  'login.title': 'Sign in - DartDraw',
  'login.sub': 'Sign in to manage your tournaments.',
  'login.resend': 'Resend verification email',
  'login.signingIn': 'Signing in…',
  'login.forgot': 'Forgot password?',
  'login.needAccount': 'Need an account?',
  'login.signUp': 'Sign up',
  'login.noAccount': 'No account yet?',
  'login.adminCreates': 'Accounts are created by the site admin.',
  'login.resent': 'If that account can be verified, we have sent a new verification link.',
  /* forgot.html */
  'forgot.title': 'Forgot password - DartDraw',
  'forgot.sub': 'Enter your email and we will send you a link to choose a new password.',
  'forgot.send': 'Send reset link',
  'forgot.sending': 'Sending…',
  'forgot.sent': 'If an account exists for that email, we have sent a link to reset your password.',
  'forgot.back': 'Back to sign in',
  /* register.html */
  'register.title': 'Sign up - DartDraw',
  'register.intro': 'Create an organizer account.',
  'register.name': 'Name',
  'register.create': 'Create account',
  'register.creating': 'Creating account…',
  'register.haveAccount': 'Already have an account?',
  'register.closed': 'Sign-up is not open yet. Accounts are created by the site admin.',
  'register.done': 'Check your email to verify your account.',
  'register.almost': 'Almost done.',
  'register.sent': 'If that email can be registered, we have sent a link to verify it.',
  /* reset.html */
  'reset.title': 'Choose a new password - DartDraw',
  'reset.sub': 'Choose a new password.',
  'reset.new': 'New password',
  'reset.confirm': 'Confirm new password',
  'reset.set': 'Set new password',
  'reset.saving': 'Saving…',
  'reset.newLink': 'Request a new link',
  'reset.mismatch': 'The two passwords do not match.',
  'reset.done': 'Your password has been changed. You can now sign in.',
  /* verify.html */
  'verify.title': 'Verify email - DartDraw',
  'verify.sub': 'Email verification',
  'verify.pwHint': 'Enter the password you chose when you signed up.',
  'verify.submit': 'Verify email',
  'verify.verifying': 'Verifying…',
  'verify.done': 'Your email is verified. You can now sign in.'
};
if (typeof module !== 'undefined' && module.exports) module.exports = { DD_AUTH_EN: DD_AUTH_EN };

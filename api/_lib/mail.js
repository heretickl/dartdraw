// Outgoing email. Providers, chosen by MAIL_PROVIDER:
//   resend  (default) - Resend's HTTP API; needs RESEND_API_KEY, MAIL_FROM and APP_URL.
//   console           - writes the message (including its link) to the server
//                       log and to sendMail.outbox; for development and tests.

function provider() {
  return process.env.MAIL_PROVIDER || 'resend';
}

function isMailConfigured() {
  const p = provider();
  if (p === 'console') return true;
  // APP_URL is required too: without it the links would be built from the
  // request's Host header, which an attacker can set.
  if (p === 'resend') return !!(process.env.RESEND_API_KEY && process.env.MAIL_FROM && process.env.APP_URL);
  return false;
}

// Never throws. { ok: true } when handed to the provider, else { ok: false }. html is optional: the account e-mails
// (api/_lib/emails.js) send the same words as text and as HTML; the console provider logs only the text, as before.
async function sendMail({ to, subject, text, html }) {
  try {
    if (!isMailConfigured()) return { ok: false };
    if (provider() === 'console') {
      sendMail.outbox.push(html === undefined ? { to, subject, text } : { to, subject, text, html });
      console.log('[mail] To: ' + to + '\n[mail] Subject: ' + subject + '\n' + text);
      return { ok: true };
    }
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + process.env.RESEND_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(Object.assign({ from: process.env.MAIL_FROM, to: [to], subject, text }, html === undefined ? {} : { html }))
    });
    return { ok: !!(resp && resp.ok) };
  } catch (e) {
    return { ok: false };
  }
}
sendMail.outbox = [];

// Base address for links in emails: APP_URL, else this request's own host.
function appUrl(req) {
  const configured = process.env.APP_URL;
  if (configured) return configured.replace(/\/+$/, '');
  const host = req && req.headers && req.headers.host;
  return 'https://' + (host || 'localhost');
}

module.exports = { isMailConfigured, sendMail, appUrl };

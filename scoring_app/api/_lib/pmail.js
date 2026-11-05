// The player-account e-mails, in one language each (the player picks EN or BM in the scoring app, and the page sends it
// along). Each message has a plain-text part and an HTML part with the same words and the same link, as the organiser
// app's api/_lib/emails.js.
//   verify  sign-up and "Resend": <app>/#verify=..., works for 24 hours
//   reset   "Forgot password?": <app>/#reset=..., works for 1 hour
//   invite  "Invite to DartDraw" from a friends list: <app>/ (the sign-up page), with the inviter's first name
// The link and the first name are the only values put in; the HTML part escapes both. Nothing here logs anything.
// The first name is the reader's own in verify/reset and the inviter's in invite. The invite carries nothing else the
// inviter typed (not the names they gave the friend), so it cannot be used to send someone words of their choosing.
// BM vocabulary follows docs/i18n/glossary.md (e-mel, kata laluan, pautan). The BM words are not proofread yet.

const TEMPLATES = {
  verify: {
    en: {
      subject: 'Confirm your DartDraw email',
      greeting: 'Hello {name},',
      intro: 'Welcome to DartDraw. Open this link to confirm your email address (it works for 24 hours):',
      outro: 'If you did not sign up for DartDraw, you can ignore this message.'
    },
    ms: {
      subject: 'Sahkan e-mel DartDraw anda',
      greeting: 'Salam sejahtera {name},',
      intro: 'Selamat datang ke DartDraw. Buka pautan ini untuk mengesahkan alamat e-mel anda (pautan ini sah selama 24 jam):',
      outro: 'Jika anda tidak mendaftar untuk DartDraw, anda boleh mengabaikan mesej ini.'
    }
  },
  reset: {
    en: {
      subject: 'Reset your DartDraw password',
      greeting: 'Hello {name},',
      intro: 'Open this link to choose a new DartDraw password (it works for 1 hour):',
      outro: 'If you did not ask to reset your password, you can ignore this message.'
    },
    ms: {
      subject: 'Tetapkan semula kata laluan DartDraw anda',
      greeting: 'Salam sejahtera {name},',
      intro: 'Buka pautan ini untuk memilih kata laluan DartDraw yang baharu (pautan ini sah selama 1 jam):',
      outro: 'Jika anda tidak meminta untuk menetapkan semula kata laluan anda, anda boleh mengabaikan mesej ini.'
    }
  },
  // A player added this email to their friends list and pressed "Invite to DartDraw" (at most once a week per entry).
  // {name} is the inviter's first name; "someone" stands in if there is none.
  invite: {
    en: {
      subject: '{name} invited you to DartDraw',
      greeting: 'Hello,',
      intro: '{name} plays darts with you and added you as a friend on DartDraw, the darts scoring app. Sign up with this email address and the games you play together will be saved on your own scorecard too:',
      outro: 'If you do not know {name}, you can ignore this message.',
      someone: 'A friend'
    },
    ms: {
      subject: '{name} menjemput anda ke DartDraw',
      greeting: 'Salam sejahtera,',
      intro: '{name} bermain dart dengan anda dan telah menambah anda sebagai rakan di DartDraw, aplikasi pengiraan mata dart. Daftar dengan alamat e-mel ini dan permainan anda bersama akan disimpan dalam kad skor anda juga:',
      outro: 'Jika anda tidak mengenali {name}, anda boleh mengabaikan mesej ini.',
      someone: 'Seorang rakan'
    }
  }
};
const LANGS = ['en', 'ms'];

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// A name for the greeting: one line, no control characters, at most 40 characters (the account limit). '' leaves the
// greeting out.
function cleanName(name) {
  if (typeof name !== 'string') return '';
  return name.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
}

// { subject, text, html }. lang 'en' | 'ms' (anything else is English). vars: { link, firstName? }.
// Callers pass firstName only when the name is trustworthy (a confirmed account or one an admin made): a sign-up's name
// is typed by whoever registers, who may not own the address.
function buildPlayerEmail(kind, lang, vars) {
  const tpl = TEMPLATES[kind];
  if (!tpl) throw new Error('unknown or unfinished player email ' + kind);
  const w = tpl[LANGS.includes(lang) ? lang : 'en'];
  const link = String(vars && vars.link || '');
  const name = cleanName(vars && vars.firstName);

  // The replacement is a function so "$&" in a name stays as typed. A greeting with {name} is left out when there is no
  // name (verify); anywhere else a missing name reads as the template's "someone" words (invite).
  const fill = (s) => s.replace(/\{name\}/g, () => name || w.someone || '');
  const paragraphs = [];
  if (w.greeting && (name || w.greeting.indexOf('{name}') < 0)) paragraphs.push({ text: fill(w.greeting) });
  paragraphs.push({ text: fill(w.intro) });
  paragraphs.push({ link: true });
  if (w.outro) paragraphs.push({ text: fill(w.outro) });
  const subject = fill(w.subject);

  const text = paragraphs.map((p) => (p.link ? link : p.text)).join('\n\n') + '\n';
  const htmlLang = lang === 'ms' ? 'ms' : 'en';
  const html = '<!doctype html><html lang="' + htmlLang + '"><head><meta charset="utf-8"><title>' + escapeHtml(subject) + '</title></head>'
    + '<body style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#142133">'
    + paragraphs.map((p) => (p.link
      ? '<p><a href="' + escapeHtml(link) + '">' + escapeHtml(link) + '</a></p>'
      : '<p>' + escapeHtml(p.text) + '</p>')).join('')
    + '</body></html>';
  return { subject, text, html };
}

module.exports = { TEMPLATES, LANGS, buildPlayerEmail, escapeHtml, cleanName };

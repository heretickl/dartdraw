// The account e-mails, in both languages in one message: English first, then Bahasa Malaysia (the server does not know
// which language a person reads, and no language is stored on the account). Each message has a plain-text part and an
// HTML part with the same words and the same link (tests/auth-emails.test.js checks they match).
//   verify            sign-up and "Resend verification email": verify.html?token=..., works for 24 hours
//   reset             "Forgot password?": reset.html?token=..., works for 1 hour
//   alreadyRegistered someone signed up with an address that already has an account: a link to forgot.html
//   invite            an Admin created the account: reset.html?token=..., works for 7 days (greets by the name the Admin typed)
//   adminReset        an Admin issued a reset link: reset.html?token=..., works for 1 hour
// The link and the name are the only values put in; the HTML part escapes both. Nothing here logs anything.
// BM vocabulary follows docs/i18n/glossary.md (e-mel, kata laluan, pautan, log masuk, pentadbir).

const TEMPLATES = {
  verify: {
    subject: ['Verify your DartDraw email', 'Sahkan e-mel DartDraw anda'],
    en: {
      intro: 'Welcome to DartDraw. To verify your email address, open this link and enter the password you chose when you signed up (the link works for 24 hours):',
      outro: 'If you did not sign up for DartDraw, you can ignore this message.'
    },
    ms: {
      intro: 'Selamat datang ke DartDraw. Untuk mengesahkan alamat e-mel anda, buka pautan ini dan masukkan kata laluan yang anda pilih semasa mendaftar (pautan ini sah selama 24 jam):',
      outro: 'Jika anda tidak mendaftar untuk DartDraw, anda boleh mengabaikan mesej ini.'
    }
  },
  reset: {
    subject: ['Reset your DartDraw password', 'Tetapkan semula kata laluan DartDraw anda'],
    en: {
      intro: 'Open this link to choose a new DartDraw password (it works for 1 hour):',
      outro: 'If you did not ask to reset your password, you can ignore this message.'
    },
    ms: {
      intro: 'Buka pautan ini untuk memilih kata laluan DartDraw yang baharu (pautan ini sah selama 1 jam):',
      outro: 'Jika anda tidak meminta untuk menetapkan semula kata laluan anda, anda boleh mengabaikan mesej ini.'
    }
  },
  alreadyRegistered: {
    subject: ['Your DartDraw account', 'Akaun DartDraw anda'],
    en: {
      intro: 'Someone tried to sign up for DartDraw with this email address, but you already have an account. If you forgot your password, use Forgot password to reset it:',
      outro: 'If this was not you, you can ignore this message.'
    },
    ms: {
      intro: 'Seseorang cuba mendaftar untuk DartDraw dengan alamat e-mel ini, tetapi anda sudah mempunyai akaun. Jika anda terlupa kata laluan anda, gunakan "Lupa kata laluan?" untuk menetapkannya semula:',
      outro: 'Jika itu bukan anda, anda boleh mengabaikan mesej ini.'
    }
  },
  invite: {
    subject: ['Your DartDraw account', 'Akaun DartDraw anda'],
    en: {
      greeting: 'Hello {name},',
      intro: 'An administrator has created a DartDraw account for you. Open this link to choose your password (it works for 7 days):'
    },
    ms: {
      greeting: 'Salam sejahtera {name},',
      intro: 'Pentadbir telah membuka akaun DartDraw untuk anda. Buka pautan ini untuk memilih kata laluan anda (pautan ini sah selama 7 hari):'
    }
  },
  adminReset: {
    subject: ['Reset your DartDraw password', 'Tetapkan semula kata laluan DartDraw anda'],
    en: {
      intro: 'An administrator has issued a link for you to choose a new DartDraw password (it works for 1 hour):'
    },
    ms: {
      intro: 'Pentadbir telah mengeluarkan pautan untuk anda memilih kata laluan DartDraw yang baharu (pautan ini sah selama 1 jam):'
    }
  }
};
const LANGS = ['en', 'ms'];
const DIVIDER = '----------';
const MS_HEADING = 'Bahasa Malaysia';

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
// A name for the greeting: one line, no control characters, at most 80 characters (the account limit). '' leaves the
// greeting out.
function cleanName(name) {
  if (typeof name !== 'string') return '';
  return name.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}

// { subject, text, html } for one template. vars: { link, name? }.
function buildEmail(kind, vars) {
  const tpl = TEMPLATES[kind];
  if (!tpl) throw new Error('unknown email ' + kind);
  const link = String(vars && vars.link || '');
  const name = cleanName(vars && vars.name);
  const subject = tpl.subject.join(' / ');
  // each language: [greeting?, intro, LINK, outro?] as paragraphs
  const paragraphs = (l) => {
    const w = tpl[l];
    const out = [];
    if (w.greeting && name) out.push({ text: w.greeting.replace('{name}', () => name) });   // a function: "$&" or "$'" in a name stay as typed
    out.push({ text: w.intro });
    out.push({ link: true });
    if (w.outro) out.push({ text: w.outro });
    return out;
  };
  const textOf = (l) => paragraphs(l).map((p) => (p.link ? link : p.text)).join('\n\n');
  const text = textOf('en') + '\n\n' + DIVIDER + '\n' + MS_HEADING + '\n\n' + textOf('ms') + '\n';

  const htmlBlock = (l) => '<div lang="' + l + '">'
    + paragraphs(l).map((p) => (p.link
      ? '<p><a href="' + escapeHtml(link) + '">' + escapeHtml(link) + '</a></p>'
      : '<p>' + escapeHtml(p.text) + '</p>')).join('')
    + '</div>';
  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>' + escapeHtml(subject) + '</title></head>'
    + '<body style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#142133">'
    + htmlBlock('en')
    + '<hr style="border:0;border-top:1px solid #dbe2ea;margin:20px 0">'
    + '<p lang="ms"><strong>' + MS_HEADING + '</strong></p>'
    + htmlBlock('ms')
    + '</body></html>';
  return { subject, text, html };
}

module.exports = { TEMPLATES, LANGS, DIVIDER, MS_HEADING, buildEmail, escapeHtml, cleanName };

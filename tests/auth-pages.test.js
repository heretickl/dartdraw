const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Static checks on the account pages: which endpoints they call, which fields they have,
// how they treat tokens, and the Referrer-Policy header rule. Browser behaviour is checked by hand.
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const PAGES = ['login.html', 'register.html', 'verify.html', 'forgot.html', 'reset.html'];
const html = {};
PAGES.forEach((p) => { html[p] = read(p); });

// Collapse a page to its markup without the script/style so field checks only see the document.
const markup = (s) => s.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
const script = (s) => (s.match(/<script>([\s\S]*?)<\/script>/) || [])[1] || '';
function fieldTag(page, id) {
  const m = markup(html[page]).match(new RegExp('<input[^>]*\\bid="' + id + '"[^>]*>'));
  return m && m[0];
}
function hasLabelFor(page, id) {
  return new RegExp('<label[^>]*\\bfor="' + id + '"').test(markup(html[page]));
}
// A JSON POST to the given endpoint: the endpoint string, method POST and a JSON content type in the script.
function postsJson(page, endpoint) {
  const js = script(html[page]);
  return js.includes("'" + endpoint + "'") && /method:\s*'POST'/.test(js) && /'Content-Type':\s*'application\/json'/.test(js) && /JSON\.stringify/.test(js);
}

test('every page exists, is a complete document and has the shared card look', () => {
  PAGES.forEach((p) => {
    const h = html[p];
    assert.match(h, /^<!doctype html>/i, p);
    assert.match(h, /<html lang="en">/, p);
    assert.match(h, /<meta name="viewport" content="width=device-width, initial-scale=1">/, p);
    assert.match(h, /class="card"/, p);
    assert.match(h, /class="brand"/, p);
    assert.match(h, /--navy:#10233e/, p);
  });
});

test('no page loads anything from another host', () => {
  PAGES.forEach((p) => {
    const h = html[p];
    // The only absolute URL-ish things allowed are same-origin paths.
    assert.doesNotMatch(h, /(src|href|action)\s*=\s*["']\s*(https?:)?\/\//i, p + ' has an external src/href');
    assert.doesNotMatch(h, /url\(\s*["']?\s*(https?:)?\/\//i, p + ' has an external css url()');
    assert.doesNotMatch(h, /@import/i, p);
    assert.doesNotMatch(h, /fetch\(\s*["'`]\s*(https?:)?\/\//i, p + ' fetches an external url');
    assert.doesNotMatch(h, /https?:\/\//i, p + ' mentions an absolute url');
  });
});

test('every page is accessible in the basics: labelled fields, a live message area, visible focus', () => {
  PAGES.forEach((p) => {
    const h = html[p];
    assert.match(markup(h), /id="msg"[^>]*aria-live="polite"|aria-live="polite"[^>]*id="msg"/, p + ' needs an aria-live message area');
    assert.match(h, /:focus-visible/, p + ' needs a visible focus style');
    const inputs = markup(h).match(/<input\b[^>]*>/g) || [];
    inputs.forEach((tag) => {
      const id = (tag.match(/\bid="([^"]+)"/) || [])[1];
      assert.ok(id, p + ' input without an id: ' + tag);
      assert.ok(hasLabelFor(p, id), p + ' input #' + id + ' has no <label for>');
    });
  });
});

test('touch targets: inputs and buttons are at least 44px tall', () => {
  PAGES.forEach((p) => {
    const h = html[p];
    if (/<input\b/.test(markup(h))) assert.match(h, /input\{[^}]*height:44px/, p + ' inputs');
    assert.match(h, /\.btn\{[^}]*min-height:44px/, p + ' buttons');
  });
});

test('pages that carry or take a token say so to the browser as well: no-referrer meta', () => {
  ['verify.html', 'reset.html'].forEach((p) => {
    assert.match(html[p], /<meta name="referrer" content="no-referrer">/, p);
  });
});

// Every fetch goes to a fixed endpoint literal, so the token cannot end up in a URL.
function assertTokenOnlyInBody(js) {
  const calls = js.match(/fetch\(/g) || [];
  const literal = js.match(/fetch\('\/api\/auth\/[a-z-]+'/g) || [];
  assert.equal(literal.length, calls.length, 'every fetch uses a fixed endpoint literal');
}

// ---------- login ----------
test('login: signs in via POST /api/auth/login with autocomplete values', () => {
  assert.ok(postsJson('login.html', '/api/auth/login'));
  assert.match(fieldTag('login.html', 'email'), /type="email"/);
  assert.match(fieldTag('login.html', 'email'), /autocomplete="username"/);
  assert.match(fieldTag('login.html', 'password'), /type="password"/);
  assert.match(fieldTag('login.html', 'password'), /autocomplete="current-password"/);
});

test('login: has a Forgot password link', () => {
  assert.match(markup(html['login.html']), /<a[^>]*href="\/forgot\.html"[^>]*>Forgot password\?<\/a>/);
});

test('login: the Sign up link is hidden until /api/auth/config says signupOpen', () => {
  const m = markup(html['login.html']);
  assert.match(m, /<a[^>]*href="\/register\.html"/);
  // The link (or its wrapper) starts hidden.
  assert.match(m, /id="signupFoot"[^>]*\bhidden\b|\bhidden\b[^>]*id="signupFoot"/);
  const js = script(html['login.html']);
  assert.match(js, /fetch\('\/api\/auth\/config'/);
  assert.match(js, /signupOpen/);
  assert.match(js, /signupFoot/);
});

test('login: handles unverified (with resend), suspended and 429', () => {
  const js = script(html['login.html']);
  assert.match(js, /'unverified'/);
  assert.match(js, /'suspended'/);
  assert.match(js, /429/);
  assert.match(js, /Please verify your email first\./);
  assert.ok(markup(html['login.html']).includes('Resend verification email'));
  assert.ok(postsJson('login.html', '/api/auth/resend-verification'));
  // The server's message is what we show for the other failures.
  assert.match(js, /body\.error/);
  // The resend confirmation is the resend endpoint's own wording, not the sign-up one.
  assert.ok(html['login.html'].includes('If that account can be verified, we have sent a new verification link.'));
  assert.doesNotMatch(html['login.html'], /If that email can be registered/);
});

test('login: does not store or echo the password', () => {
  const js = script(html['login.html']);
  assert.doesNotMatch(js, /localStorage|sessionStorage|document\.cookie/);
});

// ---------- register ----------
test('register: name, email, password (min 8, new-password) and no access code', () => {
  const h = html['register.html'];
  assert.ok(postsJson('register.html', '/api/auth/register'));
  assert.match(fieldTag('register.html', 'name'), /autocomplete="name"/);
  assert.match(fieldTag('register.html', 'email'), /type="email"/);
  assert.match(fieldTag('register.html', 'email'), /autocomplete="(email|username)"/);
  const pw = fieldTag('register.html', 'password');
  assert.match(pw, /type="password"/);
  assert.match(pw, /autocomplete="new-password"/);
  assert.match(pw, /minlength="8"/);
  assert.doesNotMatch(h, /access\s*code|accessCode|access-code/i);
});

test('register: success replaces the form, closed sign-up shows a message and no form', () => {
  const js = script(html['register.html']);
  assert.ok(html['register.html'].includes('Check your email to verify your account.'));
  assert.ok(html['register.html'].includes('Sign-up is not open yet.'));
  // After success (or when closed) the "Create an organizer account." intro no longer sits above the message.
  assert.match(markup(html['register.html']), /<p class="sub" id="intro">Create an organizer account\.<\/p>/);
  assert.match(js, /introEl\.hidden\s*=\s*true/);
  assert.match(js, /closeForm\('Check your email to verify your account\.', 'ok', '[^']+'\)/);
  assert.match(js, /fetch\('\/api\/auth\/config'/);
  assert.match(js, /signupOpen\s*===\s*false/);
  assert.match(js, /403/);
  // The form is hidden (not just the message shown) when closed or done.
  assert.match(js, /registerForm/);
  assert.match(js, /\.hidden\s*=\s*true/);
});

// ---------- verify ----------
test('verify: reads ?token=, asks for the sign-up password, and POSTs token + password in the body only', () => {
  const js = script(html['verify.html']);
  assert.ok(postsJson('verify.html', '/api/auth/verify'));
  assert.match(js, /URLSearchParams\(location\.search\)\.get\('token'\)|URLSearchParams\(window\.location\.search\)\.get\('token'\)/);
  assert.match(js, /JSON\.stringify\(\{\s*token,\s*password\s*\}\)/);
  const pw = fieldTag('verify.html', 'password');
  assert.match(pw, /type="password"/);
  assert.match(pw, /autocomplete="current-password"/);
  assert.ok(hasLabelFor('verify.html', 'password'));
  assert.match(markup(html['verify.html']), /<button[^>]*type="submit"[^>]*>Verify email<\/button>/);
  assert.doesNotMatch(js, /localStorage|sessionStorage|document\.cookie/);
  // The token is never put into a URL we call or a link we build.
  assertTokenOnlyInBody(js);
  assert.doesNotMatch(js, /href\s*=\s*[^;]*token/);
  assert.match(markup(html['verify.html']), /href="\/\?login=1"/);
});

test('verify: nothing is sent when the page loads - only the submit handler calls fetch (scanners and prefetch verify nothing)', () => {
  const js = script(html['verify.html']);
  const firstFetch = js.indexOf('fetch(');
  const submitHandler = js.indexOf("addEventListener('submit'");
  assert.ok(submitHandler >= 0, 'has a submit handler');
  assert.ok(firstFetch > submitHandler, 'the only fetch comes after the submit handler starts');
  assert.equal((js.match(/fetch\(/g) || []).length, 1);
  assert.match(js, /e\.preventDefault\(\)/);
  assert.doesNotMatch(js, /DOMContentLoaded|window\.onload|addEventListener\('load'/);
  // the form, not a self-running async function, is what verifies
  assert.doesNotMatch(js, /\(async function|\(async \(\) =>/);
});

test('verify: shows the server error text (invalid link / wrong password) and a success message with a Sign in link', () => {
  const js = script(html['verify.html']);
  assert.match(js, /body\.error/);
  assert.ok(html['verify.html'].includes('Your email is verified. You can now sign in.'));
  assert.match(markup(html['verify.html']), /id="msg"[^>]*aria-live="polite"/);
});

// ---------- forgot ----------
test('forgot: email field, POST /api/auth/forgot, generic confirmation', () => {
  assert.ok(postsJson('forgot.html', '/api/auth/forgot'));
  assert.match(fieldTag('forgot.html', 'email'), /type="email"/);
  assert.match(fieldTag('forgot.html', 'email'), /autocomplete="email"/);
  assert.match(html['forgot.html'], /If an account exists for that email/);
  assert.match(markup(html['forgot.html']), /href="\/\?login=1"/);
});

// ---------- reset ----------
test('reset: reads ?token=, new + confirm password, POST /api/auth/reset', () => {
  const js = script(html['reset.html']);
  assert.ok(postsJson('reset.html', '/api/auth/reset'));
  assert.match(js, /URLSearchParams\((window\.)?location\.search\)\.get\('token'\)/);
  const a = fieldTag('reset.html', 'password');
  const b = fieldTag('reset.html', 'confirm');
  assert.match(a, /autocomplete="new-password"/);
  assert.match(b, /autocomplete="new-password"/);
  assert.match(a, /minlength="8"/);
  assert.match(js, /length\s*<\s*8/);
  assert.match(js, /!==\s*[a-zA-Z.]*confirm|confirm[a-zA-Z.]*\s*!==/);
  assert.match(js, /JSON\.stringify\(\{\s*token,\s*password/);
  assert.doesNotMatch(js, /localStorage|sessionStorage|document\.cookie/);
  assertTokenOnlyInBody(js);
  assert.match(markup(html['reset.html']), /href="\/\?login=1"/);
});

// ---------- vercel.json ----------
test('vercel.json keeps the viewer redirect and sets Referrer-Policy: no-referrer on the token pages', () => {
  const cfg = JSON.parse(read('vercel.json'));
  assert.ok(cfg.redirects.some((r) => r.source === '/viewer/:path*' && r.destination === '/'), 'redirect kept');
  const rules = cfg.headers || [];
  ['/verify.html', '/reset.html'].forEach((src) => {
    const rule = rules.find((r) => r.source === src);
    assert.ok(rule, 'header rule for ' + src);
    assert.ok(rule.headers.some((h) => h.key === 'Referrer-Policy' && h.value === 'no-referrer'), src);
  });
});

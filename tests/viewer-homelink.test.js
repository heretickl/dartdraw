const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'index.html'), 'utf8');
const THEME = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'theme.css'), 'utf8');

const header = () => {
  const m = HTML.match(/<header id="head"[^>]*>([\s\S]*?)<\/header>/);
  assert.ok(m, 'event header exists');
  return m[1];
};

test('event header: exactly one plain "All events" link to / sits before the toprow', () => {
  const h = header();
  // two links: All events, and (Release 4) the Help button beside it
  assert.equal((h.match(/<a\b/g) || []).length, 2);
  assert.match(h, /<div class="headrow"><a class="allevents" href="\/">[\s\S]*?<\/a><a class="evhelp" id="hHelp" href="\/help" data-i18n="nav\.help">Help<\/a><\/div>/);
  assert.equal((HTML.match(/class="allevents"/g) || []).length, 1);
  const m = h.match(/<a class="allevents" href="\/">([\s\S]*?)<\/a>/);
  assert.ok(m, 'link is <a class="allevents" href="/">');
  assert.match(m[1], /<span class="am" aria-hidden="true">D<\/span>/);
  assert.match(m[1], /&lsaquo; <span data-i18n="nav\.allEvents">All events<\/span>/);   // the words come from the tables (EN | BM)
  assert.ok(h.indexOf('class="allevents"') < h.indexOf('class="toprow"'));
  assert.ok(!/<a class="allevents"[^>]*(onclick|target)/.test(h), 'no script or new-tab behaviour');
});

test('event header: the existing markup is still present, in the same order', () => {
  const h = header();
  const ids = ['hOver', 'data-theme-set="auto"', 'data-theme-set="light"', 'data-theme-set="dark"', 'id="hTitle"', 'id="hSub"', 'id="hStatus"', 'id="hProgress"'];
  let last = -1;
  for (const id of ids) {
    const i = h.indexOf(id);
    assert.ok(i > last, id + ' present and in order');
    last = i;
  }
});

test('theme.css styles the All events link, its focus ring, its logo mark, and hides it in TV mode', () => {
  assert.match(THEME, /\.allevents\{[^}]*display:inline-flex[^}]*min-height:40px/);
  assert.match(THEME, /\.allevents\{[^}]*font-family:var\(--display\)/);
  assert.match(THEME, /\.allevents\{[^}]*text-decoration:none/);
  assert.match(THEME, /\.allevents:hover[^{]*\{[^}]*#f3f7fb/);
  assert.match(THEME, /\.allevents:focus-visible\{[^}]*outline:2px solid #8fc2ff;[^}]*outline-offset:2px/);
  assert.match(THEME, /\.allevents \.am\{[^}]*border:2px solid #d9ad45/);
  assert.match(THEME, /body\.tv \.allevents\{display:none\}/);
});

// Generates the public site in two languages, from shared parts (CSS, icon sprite, header, closing band, login pop-up,
// the EN | BM switch):
//   English            index.html (/), features.html (/features), how-it-works.html (/how-it-works), help.html (/help)
//   Bahasa Malaysia    ms/index.html (/ms), ms/features.html (/ms/features), ms/how-it-works.html, ms/help.html
// This file lays the pages out; the words are data:
//   scripts/i18n/en/landing.js and scripts/i18n/ms/landing.js       landing, Features, How it works, the Help frame
//   scripts/help-content.js and scripts/i18n/ms/help-content.js     the organiser Help articles and FAQ
// Both languages have the same keys, item ids and anchors (tests/i18n-pages.test.js). Vocabulary: docs/i18n/glossary.md.
//   node scripts/build-landing.js     writes the eight pages (ms/ is created if needed)
//   npm run build-landing             same
// Do not edit the generated pages by hand: tests/landing-site.test.js fails when they differ from this script's output.
// The organiser app itself is app.html (served at /app); the sign-in form is login.html, shown in the pop-up.
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, '..');
const HELP = { en: require('./help-content'), ms: require('./i18n/ms/help-content') };
const WORDS = { en: require('./i18n/en/landing'), ms: require('./i18n/ms/landing') };
const LANGS = ['en', 'ms'];

/* The address of this site, for the canonical and hreflang links (search engines want full addresses there). Change it
   here when the site gets its own domain. */
const SITE_URL = 'https://dartdraw.vercel.app';
/* Where each page lives in each language: the clean URL (what links and the switch use) and the file it is built into. */
const ROUTES = {
  en: { landing: '/', features: '/features', how: '/how-it-works', help: '/help' },
  ms: { landing: '/ms', features: '/ms/features', how: '/ms/how-it-works', help: '/ms/help' }
};
const FILES = {
  en: { landing: 'index.html', features: 'features.html', how: 'how-it-works.html', help: 'help.html' },
  ms: { landing: 'ms/index.html', features: 'ms/features.html', how: 'ms/how-it-works.html', help: 'ms/help.html' }
};

const CSS = `
:root{--navy:#0f2240;--navy-2:#0a1a33;--ink:#142133;--muted:#566578;--line:#dfe6ee;--bg:#f3f6fb;--white:#fff;--gold:#c8941a;--gold-big:#c08a12;--gold-soft:#fbf1d6;--blue:#1769e0;--blue-d:#1257bd}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;font-family:Inter,"Segoe UI",system-ui,-apple-system,Arial,sans-serif;color:var(--ink);background:#fff;line-height:1.5;-webkit-font-smoothing:antialiased}
a{color:inherit}
.skip{position:absolute;left:-999px;top:8px;background:#fff;color:var(--navy);padding:10px 14px;border-radius:8px;z-index:50;font-weight:700}
.skip:focus{left:8px}
:focus-visible{outline:3px solid var(--blue);outline-offset:3px;border-radius:6px}
.wrap{max-width:1180px;margin:0 auto;padding:0 28px}
/* header */
header.top{position:relative;z-index:5;background:transparent}
.nav{display:flex;align-items:center;gap:36px;height:84px}
.brand{display:flex;align-items:center;gap:10px;text-decoration:none;font-weight:800;font-size:26px;letter-spacing:-.02em;color:var(--navy)}
.mark{width:36px;height:36px;border:3px solid var(--gold);border-radius:50%;display:grid;place-items:center;font-size:17px;font-weight:800;color:var(--gold);background:#fff}
.nav-links{display:flex;gap:28px;margin-left:8px}
.nav-links a{text-decoration:none;font-weight:600;font-size:15px;color:#2b3a50;padding:8px 2px;border-bottom:2px solid transparent}
.nav-links a:hover{color:var(--navy);border-bottom-color:var(--gold)}
.nav-links a[aria-current="page"]{color:var(--navy);border-bottom-color:var(--gold)}
.nav .spacer{flex:1}
.btn{display:inline-flex;align-items:center;gap:10px;border:0;border-radius:10px;background:var(--blue);color:#fff;font:700 16px/1 inherit;font-family:inherit;padding:15px 22px;min-height:48px;cursor:pointer;text-decoration:none;box-shadow:0 6px 16px rgba(23,105,224,.22)}
.btn:hover{background:var(--blue-d)}
.btn.sm{padding:12px 20px;min-height:44px;font-size:15px}
.btn.big{padding:19px 30px;font-size:18px;min-height:58px}
.btn.ghost{background:transparent;color:var(--navy);box-shadow:none;padding-left:6px;padding-right:6px}
.btn.ghost:hover{background:transparent;text-decoration:underline}
.arrow{width:20px;height:20px}
/* Log in controls are links so they work without JavaScript; these two lines keep the look of the buttons they replaced */
a.btn[data-login]{line-height:normal}
.close a.btn[data-login]{font-size:13.333px}
/* hero */
.hero{position:relative;background:linear-gradient(180deg,#f2f6fc 0%,#e9f0f9 100%);overflow:hidden}
.hero:before{content:"";position:absolute;right:-180px;top:-120px;width:900px;height:900px;border-radius:50%;background:repeating-radial-gradient(circle at center,transparent 0 56px,rgba(15,34,64,.045) 57px 58px);pointer-events:none}
.hero-grid{display:grid;grid-template-columns:minmax(0,1.02fr) minmax(0,1fr);gap:40px;align-items:center;padding:34px 0 84px;position:relative}
.eyebrow{font-weight:800;font-size:13.5px;letter-spacing:.16em;color:var(--gold-big);text-transform:uppercase;margin:0 0 22px}
h1{margin:0;font-size:clamp(40px,5.4vw,68px);line-height:1.03;letter-spacing:-.035em;font-weight:800;color:var(--navy)}
h1 em{font-style:normal;color:var(--gold-big)}
.lede{margin:26px 0 34px;font-size:clamp(18px,1.9vw,23px);line-height:1.5;color:#46566a;max-width:520px}
.cta-row{display:flex;flex-wrap:wrap;align-items:center;gap:22px}
.cta-note{margin:14px 0 0;font-size:15px;color:var(--muted)}
.tags{display:flex;flex-wrap:wrap;gap:6px 14px;margin:38px 0 0;padding:0;list-style:none;color:#5b6a7d;font-size:17px}
.tags li+li:before{content:"\\2022";margin-right:14px;color:#9aa8ba}
/* app preview */
.preview{position:relative;min-height:470px}
.win{position:absolute;left:0;top:0;width:100%;max-width:560px;height:440px;background:#fff;border-radius:14px;box-shadow:0 24px 60px rgba(15,34,64,.18);overflow:hidden;display:grid;grid-template-columns:158px 1fr}
.side{background:var(--navy);color:#dbe5f3;padding:16px 0}
.side .logo{display:flex;align-items:center;gap:8px;padding:0 14px 18px;font-weight:800;color:#fff;font-size:17px}
.side .logo i{width:24px;height:24px;border:2px solid var(--gold);border-radius:50%;display:grid;place-items:center;font-style:normal;font-size:11px;color:var(--gold)}
.side small{display:block;padding:0 14px 8px;font-size:9px;letter-spacing:.12em;color:#8ea2bf;text-transform:uppercase}
.side div.it{padding:9px 14px;font-size:12px;border-left:3px solid transparent;color:#cdd9ea}
.side div.on{background:rgba(255,255,255,.1);border-left-color:var(--gold);color:#fff;font-weight:600}
.main-pane{padding:16px 18px;background:#fff}
.main-pane h4{margin:0;font-size:17px;color:var(--navy)}
.main-pane .s{font-size:11px;color:#7a8798;margin-bottom:10px}
.tabs{display:flex;gap:14px;font-size:10.5px;color:#6a7788;border-bottom:1px solid var(--line);margin-bottom:10px}
.tabs span{padding:6px 2px}
.tabs .on{color:var(--navy);font-weight:700;border-bottom:2px solid var(--gold)}
.chart{position:absolute;right:-6px;top:132px;width:min(450px,86%);background:#fffdf8;border-radius:12px;box-shadow:0 20px 50px rgba(15,34,64,.22);padding:18px 20px 16px;border:1px solid #efe9da}
.chart .row1{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
.chart h5{margin:0;font-size:26px;letter-spacing:-.02em;color:var(--navy);line-height:1.1}
.chart .sub{font-size:12.5px;color:#46566a;margin-top:2px}
.pill{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--gold);color:#7a5600;background:#fff;border-radius:8px;padding:6px 10px;font-size:11px;font-weight:700;white-space:nowrap}
.chart .grp{text-align:right;font-weight:800;color:var(--navy);font-size:17px;line-height:1.1;margin-top:8px}
.chart .grp small{display:block;font-weight:600;font-size:9px;letter-spacing:.1em;color:#7a8798}
table.grid{width:100%;border-collapse:collapse;margin-top:12px;font-size:11.5px}
table.grid th{background:#10233e;color:#fff;font-weight:700;padding:7px 4px;border:1px solid #10233e;text-align:center}
table.grid td{border:1px solid #e1e5ea;padding:7px 4px;text-align:center;background:#fff}
table.grid td.n{text-align:left;font-weight:700;padding-left:8px}
table.grid td.x{background:#d9dce1}
.mo{display:flex;gap:18px;align-items:center;margin-top:12px;font-size:10.5px;color:#46566a;flex-wrap:wrap}
.mo b{display:block;font-size:9px;letter-spacing:.1em;color:var(--navy);margin-bottom:3px}
.ph{border:1px dashed #b9c4d3;border-radius:6px;padding:9px 12px;font-size:8.5px;letter-spacing:.08em;color:#8a97a8;text-align:center;background:#fafbfd}
/* strip */
.strip{background:#fff;border-bottom:1px solid var(--line)}
.strip .wrap{display:grid;grid-template-columns:1.1fr repeat(4,1fr);gap:0;align-items:center;padding-top:26px;padding-bottom:26px}
.strip h2{margin:0;font-size:25px;line-height:1.1;letter-spacing:-.025em;color:var(--navy);padding-right:24px}
.strip .it{display:flex;align-items:center;gap:14px;font-size:17px;color:#2a3a50;border-left:1px solid var(--line);padding:6px 18px}
.ico{width:42px;height:42px;flex:none;fill:none;stroke:var(--gold);stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
.ico.sm{width:30px;height:30px}
/* steps */
section.band{padding:64px 0}
section.alt{background:var(--bg)}
h2.sec{margin:0 0 34px;font-size:clamp(28px,3.2vw,40px);letter-spacing:-.03em;color:var(--navy);line-height:1.1}
.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:0}
.step{display:flex;align-items:flex-start;gap:14px;padding:6px 26px 6px 0;margin-right:26px;border-right:1px solid var(--line)}
.step:last-child{border-right:0;margin-right:0}
.num{width:42px;height:42px;border-radius:50%;background:#e8f0fb;color:var(--navy);font-weight:800;display:grid;place-items:center;flex:none;font-size:15px}
.disc{width:66px;height:66px;border-radius:50%;background:var(--gold-soft);display:grid;place-items:center;flex:none}
.step h3{margin:2px 0 4px;font-size:20px;color:var(--navy)}
.step p{margin:0;color:var(--muted);font-size:16px}
/* closing band */
.close{background:radial-gradient(circle at 50% 120%,#16315d 0,var(--navy-2) 60%);color:#fff;text-align:center;padding:48px 0 34px}
.close h2{margin:0 0 20px;font-size:clamp(26px,3.4vw,38px);letter-spacing:-.025em}
.close h2 em{font-style:normal;color:#f0b73a}
.close .foot{display:flex;align-items:center;justify-content:center;gap:16px;margin-top:30px;color:#c4d0e2;font-size:15px;flex-wrap:wrap}
.close .foot .brand{color:#fff;font-size:22px}
.close .foot .mark{background:transparent;color:#f0b73a;border-color:#f0b73a;width:32px;height:32px;font-size:15px}
.close .foot .sep{width:1px;height:26px;background:#4a5f82}
.foot-nav{display:flex;justify-content:center;flex-wrap:wrap;gap:0 26px;margin:30px 0 0}
.foot-nav a{color:#dfe7f3;text-decoration:none;font-weight:600;font-size:15px;padding:12px 2px;border-bottom:2px solid transparent}
.foot-nav a:hover{color:#fff;border-bottom-color:#f0b73a}
.foot-nav+.foot{margin-top:14px}
/* sub-page heroes */
.phero{background:linear-gradient(180deg,#f2f6fc,#e9f0f9);padding:30px 0 56px;position:relative;overflow:hidden}
.phero:before{content:"";position:absolute;right:-220px;top:-260px;width:760px;height:760px;border-radius:50%;background:repeating-radial-gradient(circle at center,transparent 0 56px,rgba(15,34,64,.045) 57px 58px)}
.phero .wrap{position:relative}
.phero h1{font-size:clamp(36px,4.6vw,58px);max-width:780px}
.phero .lede{margin:18px 0 0;max-width:640px}
/* features */
.fmt{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
.card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:24px 22px;box-shadow:0 2px 0 rgba(15,34,64,.03)}
.card h3{margin:14px 0 6px;font-size:19px;color:var(--navy);letter-spacing:-.01em}
.card p{margin:0;color:var(--muted);font-size:15.5px}
.card ul{margin:10px 0 0;padding:0;list-style:none;color:#32435a;font-size:15px}
.card li{position:relative;padding-left:20px;margin:7px 0}
.card li:before{content:"";position:absolute;left:2px;top:.62em;width:7px;height:7px;border-radius:50%;background:var(--gold)}
.fgrid{display:grid;grid-template-columns:repeat(2,1fr);gap:20px}
.fcard{display:grid;grid-template-columns:auto 1fr;gap:18px;align-items:start}
.fcard .disc{width:58px;height:58px}
.fcard h3{margin:2px 0 6px}
.mini{display:inline-flex;gap:6px;flex-wrap:wrap;margin-top:12px}
.chip{font-size:12.5px;font-weight:700;color:#7a5600;background:var(--gold-soft);border-radius:99px;padding:4px 10px}
/* how it works */
.tl{list-style:none;margin:0;padding:0;position:relative}
.tl:before{content:"";position:absolute;left:25px;top:10px;bottom:10px;width:2px;background:linear-gradient(var(--gold),#e7d9b0)}
.tl li{position:relative;display:grid;grid-template-columns:52px 1fr auto;gap:22px;align-items:start;padding:14px 0 26px}
.tl .num{width:52px;height:52px;background:var(--navy);color:#fff;font-size:18px;box-shadow:0 0 0 6px #fff}
.tl h3{margin:4px 0 6px;font-size:23px;color:var(--navy);letter-spacing:-.02em}
.tl p{margin:0;color:var(--muted);font-size:17px;max-width:640px}
.tl .disc{width:60px;height:60px}
.notes{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
.note{display:flex;gap:16px;align-items:flex-start}
.note p{margin:0;font-size:16px;color:#32435a}
.note b{display:block;color:var(--navy);margin-bottom:2px}
/* login pop-up: a native dialog around the real sign-in page (login.html?embed=1) */
dialog{border:0;padding:0;background:transparent;max-width:none;max-height:none;overflow:visible}
dialog::backdrop{background:rgba(10,26,51,.62);backdrop-filter:blur(3px)}
body:has(dialog[open]){overflow:hidden}
.dlg{position:relative;background:#fff;border-radius:16px;width:min(400px,calc(100vw - 28px));box-shadow:0 30px 80px rgba(0,0,0,.4);overflow:hidden}
.dlg .x{position:absolute;right:8px;top:8px;width:44px;height:44px;border:0;background:transparent;border-radius:10px;font-size:26px;color:#5a6879;cursor:pointer;line-height:1;z-index:1}
.dlg .x:hover{background:#eef2f7}
.dlg iframe{display:block;width:100%;height:440px;max-height:calc(100vh - 28px);max-height:calc(100dvh - 28px);border:0;background:#fff}
/* responsive */
@media (max-width:960px){
  .hero-grid{grid-template-columns:minmax(0,1fr);padding-bottom:56px}
  .preview{min-height:440px;max-width:560px;margin:10px auto 0;width:100%}
  .strip .wrap{grid-template-columns:1fr 1fr;gap:18px 0}
  .strip h2{grid-column:1/-1;padding-bottom:6px}
  .strip .it{border-left:0;padding-left:0}
  .steps{grid-template-columns:1fr;gap:20px}
  .step{border-right:0;margin-right:0;padding-right:0}
  .fmt{grid-template-columns:1fr 1fr}
  .fgrid{grid-template-columns:1fr}
  .notes{grid-template-columns:1fr}
  .tl li{grid-template-columns:52px 1fr}
  .tl li .disc{display:none}
}
@media (max-width:640px){
  .wrap{padding:0 18px}
  .nav{height:68px;gap:16px}
  .brand{font-size:22px}.mark{width:32px;height:32px}
  .nav-links{gap:14px;margin-left:0}
  .nav-links a{font-size:14px}
  .nav .btn.sm{padding:10px 14px}
  .win{grid-template-columns:1fr;height:200px}.side{display:none}
  .chart{position:relative;right:auto;top:auto;width:100%;margin-top:-90px}
  .preview{min-height:0}
  .fmt{grid-template-columns:1fr}
  .fcard{grid-template-columns:1fr}
  .cta-row .btn.big{width:100%;justify-content:center}
  .strip .wrap{grid-template-columns:1fr}
}
@media (max-width:480px){.nav{height:auto;flex-wrap:wrap;gap:0 12px;padding-top:10px;padding-bottom:2px}.nav-links{order:3;flex:0 0 100%;margin:0;gap:22px}.nav-links a{padding:10px 2px}}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
`;

/* The EN | BM switch in the header (two links, so it works without JavaScript) and the "Bahasa Malaysia tersedia" note.
   Phone widths: at 400 px and below the logo shrinks so logo, switch and Log in stay on one row ("Log masuk" is wider
   than "Log in"); below 375 px the switch moves to the end of the row of page links, and at 340 px and below those
   links tighten a little so the switch still fits on that row. Checked at 320, 360, 375 and 390. */
const LANG_CSS = `
.langsw{display:inline-flex;align-items:center;gap:2px;padding:2px;border:1.5px solid #c3cfdf;border-radius:11px;background:#fff;flex:none}
.langsw a{display:inline-flex;align-items:center;justify-content:center;min-width:44px;min-height:38px;padding:0 10px;border-radius:8px;color:#2b3a50;font:700 14px/1 Inter,"Segoe UI",system-ui,Arial,sans-serif;letter-spacing:.04em;text-decoration:none}
.langsw a:hover{background:#eef3fa;color:var(--navy)}
.langsw a[aria-current="true"]{background:var(--navy);color:#fff}
.nav .langsw{margin-right:-18px}
.vh{position:absolute!important;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.langbar{background:var(--gold-soft);border-bottom:1px solid #ecd9a4;color:#3b2c06;font-size:15px}
.langbar .wrap{display:flex;align-items:center;gap:10px;min-height:48px;padding-top:4px;padding-bottom:4px}
.langbar p{margin:0;flex:1 1 auto;min-width:0}
.langbar a{display:inline-block;padding:8px 2px;font-weight:700;color:var(--blue-d)}
.langbar-x{flex:none;width:44px;height:44px;border:0;border-radius:10px;background:transparent;color:#5a4a1c;font-size:24px;line-height:1;cursor:pointer}
.langbar-x:hover{background:#f5e3b3}
@media (max-width:640px){.nav .langsw{margin-right:-6px}.langsw a{min-width:40px;padding:0 8px}}
@media (max-width:480px){.nav .langsw{margin:0}.langsw a{min-width:34px;min-height:36px;padding:0 6px;font-size:13px}.nav .btn.sm{padding:10px 12px}}
@media (max-width:400px){.brand{font-size:20px;gap:8px}.mark{width:30px;height:30px;font-size:15px}.nav{gap:0 8px}}
@media (max-width:374px){.nav-links{flex:1 1 auto;gap:14px}.nav .langsw{order:4;margin-left:auto}}
@media (max-width:340px){.nav-links{gap:10px}.nav-links a{font-size:13px}}
@media print{.langbar,.langsw{display:none!important}}
`;

const ICONS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>
<symbol id="i-users" viewBox="0 0 48 48"><circle cx="24" cy="15" r="6"/><circle cx="11" cy="19" r="4.5"/><circle cx="37" cy="19" r="4.5"/><path d="M13 38c0-7 5-11 11-11s11 4 11 11"/><path d="M3 35c0-5 3-8 8-8M45 35c0-5-3-8-8-8"/></symbol>
<symbol id="i-trophy" viewBox="0 0 48 48"><path d="M14 8h20v10c0 6-4 10-10 10s-10-4-10-10z"/><path d="M14 11H7c0 6 3 9 8 9M34 11h7c0 6-3 9-8 9"/><path d="M24 28v8M16 41h16M19 36h10"/></symbol>
<symbol id="i-image" viewBox="0 0 48 48"><rect x="7" y="9" width="34" height="30" rx="3"/><circle cx="17" cy="19" r="3"/><path d="M8 35l10-10 8 8 6-6 9 9"/></symbol>
<symbol id="i-doc" viewBox="0 0 48 48"><path d="M13 6h16l8 8v28H13z"/><path d="M29 6v8h8M19 24h12M19 30h12M19 36h8"/></symbol>
<symbol id="i-printer" viewBox="0 0 48 48"><path d="M14 17V7h20v10"/><rect x="7" y="17" width="34" height="17" rx="3"/><rect x="14" y="28" width="20" height="13"/><path d="M33 23h2"/></symbol>
<symbol id="i-grid" viewBox="0 0 48 48"><rect x="8" y="8" width="13" height="13" rx="2"/><rect x="27" y="8" width="13" height="13" rx="2"/><rect x="8" y="27" width="13" height="13" rx="2"/><rect x="27" y="27" width="13" height="13" rx="2"/></symbol>
<symbol id="i-target" viewBox="0 0 48 48"><circle cx="24" cy="24" r="16"/><circle cx="24" cy="24" r="9"/><circle cx="24" cy="24" r="2.5"/><path d="M24 4v6M24 38v6M4 24h6M38 24h6"/></symbol>
<symbol id="i-bracket" viewBox="0 0 48 48"><path d="M6 10h10v8H6zM6 30h10v8H6zM32 20h10v8H32z"/><path d="M16 14h6v10M16 34h6V24M22 24h10"/></symbol>
<symbol id="i-check" viewBox="0 0 48 48"><rect x="8" y="8" width="32" height="32" rx="4"/><path d="M16 25l6 6 11-13"/></symbol>
<symbol id="i-clock" viewBox="0 0 48 48"><circle cx="24" cy="24" r="16"/><path d="M24 14v10l7 4"/></symbol>
<symbol id="i-monitor" viewBox="0 0 48 48"><rect x="6" y="9" width="36" height="25" rx="3"/><path d="M18 41h12M24 34v7"/></symbol>
<symbol id="i-qr" viewBox="0 0 48 48"><rect x="8" y="8" width="12" height="12" rx="1"/><rect x="28" y="8" width="12" height="12" rx="1"/><rect x="8" y="28" width="12" height="12" rx="1"/><path d="M28 28h5v5M40 28v3M28 40h5M37 36h3v4"/></symbol>
<symbol id="i-link" viewBox="0 0 48 48"><path d="M21 27a8 8 0 0 0 11 0l6-6a8 8 0 0 0-11-11l-3 3"/><path d="M27 21a8 8 0 0 0-11 0l-6 6a8 8 0 0 0 11 11l3-3"/></symbol>
<symbol id="i-shield" viewBox="0 0 48 48"><path d="M24 6l15 5v11c0 10-6 17-15 20C15 39 9 32 9 22V11z"/><path d="M17 24l5 5 9-11"/></symbol>
<symbol id="i-flag" viewBox="0 0 48 48"><path d="M12 42V8M12 10h24l-5 8 5 8H12"/></symbol>
<symbol id="i-calendar" viewBox="0 0 48 48"><rect x="7" y="10" width="34" height="30" rx="3"/><path d="M7 19h34M16 6v8M32 6v8"/></symbol>
<symbol id="i-layers" viewBox="0 0 48 48"><path d="M24 7l17 9-17 9-17-9z"/><path d="M7 25l17 9 17-9M7 33l17 9 17-9"/></symbol>
<symbol id="i-edit" viewBox="0 0 48 48"><path d="M10 38l2-9L32 9l7 7-20 20z"/><path d="M28 13l7 7"/></symbol>
<symbol id="i-arrow" viewBox="0 0 24 24"><path d="M4 12h15M13 5l7 7-7 7"/></symbol>
</defs></svg>`;

const ic = (id, cls) => `<svg class="ico${cls ? ' ' + cls : ''}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
const arrow = '<svg class="arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><use href="#i-arrow"/></svg>';

/* ctx: { lang, key (landing | features | how | help), R (this language's routes), twin (the same page in the other
   language) }. The switch is two plain links: the current language is marked aria-current, the other one goes to the
   twin page. A click also saves the choice (the dd-lang-ui script); with no JavaScript the links still work. */
const langSwitch = (T, ctx) => {
  const href = (l) => (l === ctx.lang ? ROUTES[l][ctx.key] : ctx.twin);
  const link = (l, label) => `<a href="${href(l)}" lang="${l}" hreflang="${l}" aria-label="${T.switcher[l]}" data-lang-set="${l}"${l === ctx.lang ? ' aria-current="true"' : ''}>${label}</a>`;
  return `<div class="langsw" role="group" aria-label="${T.switcher.group}">${link('en', 'EN')}${link('ms', 'BM')}</div>`;
};
/* English pages only: shown by the dd-lang-ui script when nothing is saved and the browser's first language is Malay. */
const langBar = (ctx) => ctx.lang !== 'en' ? '' : `
<div class="langbar" id="langBar" lang="ms" hidden><div class="wrap"><p>Bahasa Malaysia tersedia &mdash; <a href="${ctx.twin}" hreflang="ms" data-lang-set="ms" title="Switch to Bahasa Malaysia">Tukar ke BM<span class="vh" lang="en"> (Switch to Bahasa Malaysia)</span></a></p><button class="langbar-x" type="button" data-langbar-close aria-label="Tutup" title="Close">&times;</button></div></div>`;

const header = (T, ctx) => `
<a class="skip" href="#main">${T.common.skip}</a>${langBar(ctx)}
<header class="top"><div class="wrap nav">
  <a class="brand" href="${ctx.R.landing}" aria-label="${T.common.homeLabel}"><span class="mark" aria-hidden="true">D</span>DartDraw</a>
  <nav class="nav-links" aria-label="${T.common.mainNav}">
    <a href="${ctx.R.features}"${ctx.key === 'features' ? ' aria-current="page"' : ''}>${T.common.features}</a>
    <a href="${ctx.R.how}"${ctx.key === 'how' ? ' aria-current="page"' : ''}>${T.common.how}</a>
    <a href="${ctx.R.help}"${ctx.key === 'help' ? ' aria-current="page"' : ''}>${T.common.help}</a>
  </nav>
  <span class="spacer"></span>
  ${langSwitch(T, ctx)}
  <a class="btn sm" href="/login.html" data-login>${T.common.logIn}</a>
</div></header>`;

const closing = (T, ctx, headline) => `
<section class="close" aria-labelledby="closeH"><div class="wrap">
  <h2 id="closeH">${headline}</h2>
  <a class="btn" href="/login.html" data-login>${T.common.logIn} ${arrow}</a>
  <nav class="foot-nav" aria-label="${T.common.footerNav}">
    <a href="${ctx.R.features}">${T.common.features}</a>
    <a href="${ctx.R.how}">${T.common.how}</a>
    <a href="${ctx.R.help}">${T.common.help}</a>
  </nav>
  <div class="foot"><a class="brand" href="${ctx.R.landing}"><span class="mark" aria-hidden="true">D</span>DartDraw</a><span class="sep" aria-hidden="true"></span><span>${T.common.tagline}</span></div>
</div></section>`;

/* The language choice, before the page draws (head). Saved choice: localStorage "dartdraw.lang" ("en" | "ms"), read and
   written inside try/catch, so a browser that blocks storage just stays on the page it opened.
   - ?lang=ms|en on any page: saves that choice, then goes to that language's version of this page (the parameter is
     dropped; the rest of the address, ?from= and #anchor included, is kept).
   - A saved choice that is not this page's language sends the visitor to the twin page with location.replace, but only
     when the address has no #anchor: a shared link to a section stays where it points. The one exception is the
     English Help page with "ms" saved: the organiser app's "?" links open /help#anchor, so they go to /ms/help#anchor.
   - Nothing is ever decided from the browser's language (shared links and search engines must see what the link says);
     that only shows the note on the English pages (dd-lang-ui). */
const langHead = (ctx) => `
<script id="dd-lang">
(function(){
var L=${JSON.stringify(ctx.lang)},TWIN=${JSON.stringify(ctx.twin)},HASHOK=${ctx.lang === 'en' && ctx.key === 'help' ? 'true' : 'false'},KEY='dartdraw.lang';
var q=String(location.search||''),h=String(location.hash||''),m=/[?&]lang=(en|ms)(?=&|$)/.exec(q);
if(m){
  try{localStorage.setItem(KEY,m[1])}catch(e){}
  var rest=q.replace(/([?&])lang=(en|ms)(&|$)/,function(a,b,c,d){return d?b:''}).replace(/[?&]$/,'');
  if(m[1]!==L){location.replace(TWIN+rest+h);return}
  try{history.replaceState(null,'',location.pathname+rest+h)}catch(e){}
  return;
}
var s=null;try{s=localStorage.getItem(KEY)}catch(e){}
if((s==='en'||s==='ms')&&s!==L&&(!h||(HASHOK&&s==='ms')))location.replace(TWIN+q+h);
})();
</script>`;

/* After the page (end of body): a click on EN / BM (or on the note's link) saves the choice and, on the new page, puts
   the focus back on the switch. The links are kept pointing at the same place in the twin page (query and #anchor).
   viewer/help.html and viewer/ms/help.html carry a copy of this script and of langHead (tests/i18n-switch.test.js
   checks the copies stay the same). The note: English pages only, when nothing is saved, the browser's first language
   starts with "ms" and the note was not closed before (dartdraw.lang.note = "closed"). */
const langUi = (ctx) => `
<script id="dd-lang-ui">
(function(){
var KEY='dartdraw.lang',NOTE='dartdraw.lang.note',FOCUS='dartdraw.lang.focus';
function get(k){try{return localStorage.getItem(k)}catch(e){return null}}
function put(k,v){try{localStorage.setItem(k,v)}catch(e){}}
/* the other language's link keeps this address's query (?from=...) and #anchor, so the twin opens at the same place */
function keep(){return String(location.search||'').replace(/([?&])lang=(en|ms)(&|$)/,function(a,b,c,d){return d?b:''}).replace(/[?&]$/,'')+String(location.hash||'')}
function sync(){[].forEach.call(document.querySelectorAll('[data-lang-set]'),function(a){
  if(a.getAttribute('aria-current')==='true')return;
  var b=a.getAttribute('data-base')||String(a.getAttribute('href')||'').split(/[?#]/)[0];
  a.setAttribute('data-base',b);a.setAttribute('href',b+keep());
})}
sync();
window.addEventListener('hashchange',sync);
[].forEach.call(document.querySelectorAll('[data-lang-set]'),function(a){
  a.addEventListener('click',function(e){
    var l=a.getAttribute('data-lang-set');
    put(KEY,l);
    try{sessionStorage.setItem(FOCUS,'1')}catch(x){}
    if(a.getAttribute('aria-current')==='true')e.preventDefault();
  });
});
try{if(sessionStorage.getItem(FOCUS)){sessionStorage.removeItem(FOCUS);var cur=document.querySelector('.langsw [aria-current="true"]');if(cur&&cur.focus)cur.focus()}}catch(e){}
var bar=document.getElementById('langBar');
if(bar){
  var n=String((navigator.languages&&navigator.languages[0])||navigator.language||'');
  var saved=get(KEY);
  if(saved!=='en'&&saved!=='ms'&&/^ms/i.test(n)&&get(NOTE)!=='closed')bar.hidden=false;
  var x=bar.querySelector('[data-langbar-close]');
  if(x)x.addEventListener('click',function(){bar.hidden=true;put(NOTE,'closed')});
}
})();
</script>`;

/* The sign-in pop-up. The BM pages pass their language to the sign-in page (login.html?embed=1&lang=ms, i18n/auth-i18n.js);
   the English pages keep the plain address (the sign-in page follows the page around it). */
const loginSrc = (ctx) => '/login.html?embed=1' + (ctx.lang === 'en' ? '' : '&amp;lang=' + ctx.lang);
const dialog = (T, ctx) => `
<dialog id="loginDlg" aria-label="${T.common.dialogLabel}">
  <div class="dlg">
    <button class="x" type="button" aria-label="${T.common.close}" data-close>&times;</button>
    <iframe id="loginFrame" title="${T.common.dialogLabel}" data-src="${loginSrc(ctx)}"></iframe>
  </div>
</dialog>
<script>
(function(){
var d=document.getElementById('loginDlg'),f=document.getElementById('loginFrame');
if(!d||!f)return;
var ro=null;
function sizeFrame(){try{var b=f.contentDocument&&f.contentDocument.body;if(b)f.style.height=Math.ceil(b.offsetHeight)+'px'}catch(e){}}
function focusEmail(){try{var el=f.contentDocument.getElementById('email');if(el)el.focus()}catch(e){}}
f.addEventListener('load',function(){
  sizeFrame();
  try{if(ro)ro.disconnect();if(window.ResizeObserver){ro=new ResizeObserver(sizeFrame);ro.observe(f.contentDocument.body)}}catch(e){}
  if(d.open)focusEmail();
});
function openLogin(){
  if(d.open)return;
  if(!f.getAttribute('src'))f.setAttribute('src',f.getAttribute('data-src'));
  if(d.showModal)d.showModal();else d.setAttribute('open','');
  focusEmail();
}
function closeLogin(){if(d.close)d.close();else d.removeAttribute('open')}
document.querySelectorAll('[data-login]').forEach(function(b){b.addEventListener('click',function(e){e.preventDefault();openLogin()})});
d.querySelector('[data-close]').addEventListener('click',closeLogin);
d.addEventListener('click',function(e){if(e.target===d)closeLogin()});
/* On close, reload the sign-in page so nothing typed stays in the form. */
d.addEventListener('close',function(){if(f.getAttribute('src'))f.setAttribute('src',f.getAttribute('data-src'))});
/* Back or Forward can restore the page from the browser's cache with the pop-up as it was; reload so it starts clean. */
window.addEventListener('pageshow',function(e){if(e.persisted)location.reload()});
/* Esc pressed inside the sign-in page arrives as a message from it. */
window.addEventListener('message',function(e){
  if(e.origin===location.origin&&e.source===f.contentWindow&&e.data&&e.data.type==='dartdraw-close-login')closeLogin();
});
/* /?login=1 or #login opens the pop-up, then the address is tidied. On the landing page wait for the signed-in check. */
var qp=new URLSearchParams(location.search);
if(qp.get('login')==='1'||location.hash==='#login'){
  qp.delete('login');
  var rest=qp.toString();
  try{history.replaceState(null,'',location.pathname+(rest?'?'+rest:'')+(location.hash==='#login'?'':location.hash))}catch(e){}
  (window.__ddSignedIn||Promise.resolve(false)).then(function(signedIn){if(!signedIn)openLogin()});
}
})();
</script>`;

/* Landing page only: a visitor who is already signed in goes straight to the app. Only a real account counts (publicMode is
   false in the answer: with login switched off everyone gets 200 and nobody is "signed in"); a 401, a network error or
   public mode leaves the page as it is. window.__ddSignedIn lets the pop-up script wait for the answer before it opens. */
const signedInRedirect = `
<script>
(function(){
var p=new URLSearchParams(location.search);p.delete('login');
var rest=p.toString(),target='/app'+(rest?'?'+rest:'')+(location.hash==='#login'?'':location.hash);
window.__ddSignedIn=fetch('/api/auth/me',{credentials:'same-origin',cache:'no-store'}).then(function(r){
  if(!r.ok)return false;
  return r.json().then(function(me){
    if(me&&me.publicMode===false){location.replace(target);return true}
    return false;
  });
}).catch(function(){return false});
})();
</script>`;

/* Canonical and the language versions of this page, for search engines (full addresses, see SITE_URL). */
const hreflang = (ctx) => {
  const url = (l) => SITE_URL + ROUTES[l][ctx.key];
  return `
<link rel="canonical" href="${url(ctx.lang)}">
<link rel="alternate" hreflang="en" href="${url('en')}">
<link rel="alternate" hreflang="ms" href="${url('ms')}">
<link rel="alternate" hreflang="x-default" href="${url('en')}">`;
};

const page = (T, ctx, body, headline, extraCss) => `<!doctype html>
<html lang="${ctx.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${T.meta[ctx.key].title}</title>
<meta name="description" content="${T.meta[ctx.key].desc}">${hreflang(ctx)}${langHead(ctx)}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>${CSS}${LANG_CSS}${extraCss || ''}</style>${ctx.key === 'landing' ? signedInRedirect : ''}
</head>
<body id="top">
${ICONS}
${header(T, ctx)}
<main id="main">
${body}
</main>
${closing(T, ctx, headline)}
${langUi(ctx)}
${dialog(T, ctx)}
</body>
</html>
`;

/* ---------------- landing ---------------- */
const landing = (T, ctx) => {
  const W = T.landing, P = W.preview;
  return `
<section class="hero" aria-labelledby="heroH"><div class="wrap hero-grid">
  <div>
    <p class="eyebrow">${W.eyebrow}</p>
    <h1 id="heroH">${W.h1}</h1>
    <p class="lede">${W.lede}</p>
    <div class="cta-row">
      <a class="btn big" href="/login.html" data-login>${T.common.logIn} ${arrow}</a>
      <a class="btn ghost big" href="${ctx.R.features}">${W.explore}</a>
    </div>
    <p class="cta-note">${W.ctaNote}</p>
    <ul class="tags" aria-label="${W.typesLabel}">${W.types.map((t) => `<li>${t}</li>`).join('')}</ul>
  </div>
  <div class="preview" aria-hidden="true">
    <div class="win">
      <div class="side">
        <div class="logo"><i>D</i>DartDraw</div>
        <small>${P.workspace}</small>
        ${P.menu.map((m, i) => `<div class="it${i === 1 ? ' on' : ''}">${m}</div>`).join('')}
      </div>
      <div class="main-pane">
        <h4>DartDraw Open</h4><div class="s">${P.workspace}</div>
        <div class="tabs">${P.tabs.map((t, i) => `<span${i === 0 ? ' class="on"' : ''}>${t}</span>`).join('')}</div>
      </div>
    </div>
    <div class="chart">
      <div class="row1"><div><h5>DartDraw Open</h5><div class="sub">${P.sub}</div></div><div><span class="pill">${P.pill}</span><div class="grp">${P.group}</div></div></div>
      <table class="grid"><thead><tr>${P.heads.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>
        <tr><td>1</td><td class="n">Alex Turner</td><td class="x"></td><td>2 - 1</td><td>0 - 2</td><td>2 - 0</td><td>2</td><td>4 - 3</td><td>2</td></tr>
        <tr><td>2</td><td class="n">Sam Collins</td><td>1 - 2</td><td class="x"></td><td>2 - 1</td><td>2 - 0</td><td>2</td><td>5 - 3</td><td>1</td></tr>
        <tr><td>3</td><td class="n">Jamie Brooks</td><td>2 - 0</td><td>1 - 2</td><td class="x"></td><td>0 - 2</td><td>1</td><td>3 - 4</td><td>3</td></tr>
        <tr><td>4</td><td class="n">Chris Hall</td><td>0 - 2</td><td>0 - 2</td><td>2 - 0</td><td class="x"></td><td>1</td><td>2 - 4</td><td>4</td></tr>
      </tbody></table>
      <div class="mo"><div><b>${P.matchOrder}</b>${P.orderText}</div><span style="flex:1"></span><span class="ph">${P.logo}</span><span class="ph">${P.sponsor}</span></div>
    </div>
  </div>
</div></section>

<section class="strip" aria-label="${W.stripLabel}"><div class="wrap">
  <h2>${W.stripH}</h2>
  ${['users', 'trophy', 'image', 'doc'].map((icon, i) => `<div class="it">${ic(icon)}${W.strip[i]}</div>`).join('\n  ')}
</div></section>

<section class="band" id="steps" aria-labelledby="stepsH"><div class="wrap">
  <h2 class="sec" id="stepsH">${W.stepsH}</h2>
  <div class="steps">
    ${['edit', 'grid', 'printer'].map((icon, i) => `<div class="step"><span class="num">0${i + 1}</span><span class="disc">${ic(icon, 'sm')}</span><div><h3>${W.steps[i].h}</h3><p>${W.steps[i].p}</p></div></div>`).join('\n    ')}
  </div>
  <p style="margin:34px 0 0"><a class="btn ghost" href="${ctx.R.how}" style="padding-left:0">${W.detail} ${arrow}</a></p>
</div></section>`;
};

/* ---------------- features ---------------- */
const FORMAT_ICONS = ['users', 'bracket', 'layers'];
const CARD_ICONS = ['target', 'shield', 'check', 'target', 'users', 'printer', 'qr', 'clock', 'monitor'];
const features = (T) => {
  const W = T.features;
  const card = (c, i) => `<div class="card fcard"><span class="disc">${ic(CARD_ICONS[i], 'sm')}</span><div><h3>${c.h}</h3>${c.p ? `<p>${c.p}</p>` : ''}${c.li ? `<ul>${c.li.map((x) => `<li>${x}</li>`).join('')}</ul>` : ''}${c.chip ? `<div class="mini"><span class="chip">${c.chip}</span></div>` : ''}</div></div>`;
  return `
<section class="phero" aria-labelledby="fH"><div class="wrap">
  <p class="eyebrow">${W.eyebrow}</p>
  <h1 id="fH">${W.h1}</h1>
  <p class="lede">${W.lede}</p>
</div></section>

<section class="band" aria-labelledby="fmtH"><div class="wrap">
  <h2 class="sec" id="fmtH">${W.fmtH}</h2>
  <div class="fmt">
    ${W.formats.map((f, i) => `<div class="card">${ic(FORMAT_ICONS[i])}<h3>${f.h}</h3><p>${f.p}</p></div>`).join('\n    ')}
  </div>
</div></section>

<section class="band alt" aria-labelledby="moreH"><div class="wrap">
  <h2 class="sec" id="moreH">${W.moreH}</h2>
  <div class="fgrid">
    ${W.cards.map(card).join('\n    ')}
  </div>
</div></section>`;
};

/* ---------------- how it works ---------------- */
const STEP_ICONS = ['edit', 'layers', 'grid', 'printer', 'target', 'check', 'trophy'];
const NOTE_ICONS = ['monitor', 'link', 'shield'];
const how = (T) => {
  const W = T.how;
  return `
<section class="phero" aria-labelledby="hH"><div class="wrap">
  <p class="eyebrow">${W.eyebrow}</p>
  <h1 id="hH">${W.h1}</h1>
  <p class="lede">${W.lede}</p>
</div></section>

<section class="band" aria-label="${W.stepsLabel}"><div class="wrap">
  <ol class="tl">
    ${W.steps.map((s, i) => `<li><span class="num">${i + 1}</span><div><h3>${s.h}</h3><p>${s.p}</p></div><span class="disc">${ic(STEP_ICONS[i], 'sm')}</span></li>`).join('\n    ')}
  </ol>
</div></section>

<section class="band alt" aria-labelledby="gtkH"><div class="wrap">
  <h2 class="sec" id="gtkH">${W.gtkH}</h2>
  <div class="notes">
    ${W.notes.map((n, i) => `<div class="note">${ic(NOTE_ICONS[i], 'sm')}<p><b>${n.b}</b>${n.p}</p></div>`).join('\n    ')}
  </div>
</div></section>`;
};

/* ---------------- help ---------------- */
const HELP_CSS = `
[hidden]{display:none!important}
.phero .hsearch{margin:26px 0 0;max-width:640px}
.hsearch label{display:block;margin:0 0 8px;font-weight:700;font-size:15px;color:var(--navy)}
.hsearch input{display:block;width:100%;font:inherit;font-size:18px;line-height:1.3;padding:14px 18px;min-height:54px;border:1.5px solid #bcc9db;border-radius:12px;background:#fff;color:var(--ink);box-shadow:0 4px 14px rgba(15,34,64,.06);-webkit-appearance:none;appearance:none}
.hsearch input::placeholder{color:#5b6a7f}
.hsearch input:focus{border-color:var(--blue);outline:3px solid rgba(23,105,224,.28);outline-offset:0}
.hcount{margin:8px 0 0;min-height:22px;font-size:14.5px;color:var(--muted)}
section.band.help{padding:36px 0 64px}
.help-layout{display:grid;grid-template-columns:270px minmax(0,1fr);gap:44px;align-items:start}
.help-toc{position:sticky;top:18px;max-height:calc(100vh - 36px);overflow:auto;background:#fff;border:1px solid var(--line);border-radius:14px;padding:6px 8px 10px;box-shadow:0 2px 0 rgba(15,34,64,.03)}
.help-toc summary{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:44px;padding:8px 10px;font-weight:800;font-size:16px;color:var(--navy);cursor:pointer;list-style:none}
.help-toc summary::-webkit-details-marker{display:none}
.help-toc summary:after{content:"\\25BE";display:none;font-size:18px;color:var(--gold-big);transition:transform .15s}
.help-toc[open] summary:after{transform:rotate(180deg)}
.help-toc .s-mob{display:none}
.toc-h{margin:8px 10px 2px;font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#7a5600}
.help-toc ol{list-style:none;margin:0;padding:0}
.help-toc li a{display:block;padding:8px 10px;border-radius:8px;font-size:15px;line-height:1.35;color:#2b3a50;text-decoration:none}
.help-toc li a:hover{background:#eef3fa;color:var(--navy)}
.help-main{min-width:0}
.hgroup{margin:0 0 16px;font-size:clamp(26px,3vw,34px);letter-spacing:-.03em;line-height:1.1;color:var(--navy);scroll-margin-top:18px}
.hgroup:not(:first-child){margin-top:44px}
.hintro{display:flex;flex-wrap:wrap;align-items:center;gap:10px 18px;margin:0 0 24px;padding:16px 18px;background:#fff;border:1px solid var(--line);border-radius:14px}
.hintro p{margin:0;flex:1 1 280px;font-size:16px;color:#32435a}
.hstart{margin-bottom:12px;background:var(--gold-soft);border-color:#ecd9a4}
.hstart a{color:var(--blue-d);font-weight:700}
.hempty{margin:0 0 20px;padding:18px 20px;background:#fff;border:1px dashed #b9c4d3;border-radius:14px;color:#32435a;font-size:16.5px}
.hempty p{margin:0 0 8px}
.hempty .hempty-h{font-weight:700;color:var(--navy)}
.hsuggest{margin:0 0 10px;padding-left:22px}
.hsuggest li{margin:6px 0}
.hsuggest a{color:var(--blue-d);font-weight:600}
.hempty .hempty-end{margin:0;color:var(--muted)}
.hresults{margin:0 0 26px}
.hs-near{margin:0 0 8px;font-weight:700;color:var(--navy)}
.hs-list{list-style:none;margin:0;padding:0}
.hs-item{margin:0 0 8px}
.hs-link{display:block;padding:12px 16px;background:#fff;border:1px solid var(--line);border-radius:12px;text-decoration:none;color:var(--ink);overflow-wrap:anywhere}
.hs-link:hover{border-color:#9fb0c6}
.hs-link[aria-current="true"]{border-color:var(--gold);box-shadow:0 0 0 2px var(--gold-soft)}
.hs-title{display:block;font-weight:700;font-size:16.5px;line-height:1.3;color:var(--navy)}
.hs-head{display:block;margin-top:2px;font-size:14.5px;font-weight:700;color:#7a5600}
.hs-snip{display:block;margin-top:4px;font-size:15px;line-height:1.45;color:#46566a}
mark.hs-mark{background:#ffe08a;color:inherit;border-radius:3px;padding:0 1px}
.hs-more{min-height:44px;padding:10px 18px;font:inherit;font-size:15.5px;font-weight:700;color:var(--blue-d);background:#fff;border:1px solid var(--line);border-radius:10px;cursor:pointer}
.hs-more:hover{border-color:#9fb0c6}
.harticle{margin:0 0 20px;padding:26px 28px;background:#fff;border:1px solid var(--line);border-radius:14px;box-shadow:0 2px 0 rgba(15,34,64,.03);scroll-margin-top:18px;overflow-wrap:anywhere}
.hhead{display:flex;align-items:baseline;gap:8px;margin:0 0 4px}
.harticle h3{margin:0;font-size:clamp(23px,2.5vw,29px);line-height:1.15;letter-spacing:-.02em;color:var(--navy)}
.hhead .anchor{padding:6px 4px;font-weight:700;color:#8a6410;text-decoration:none}
.hhead .anchor:hover,.hhead .anchor:focus{color:var(--navy)}
.harticle .sum{margin:0 0 16px;font-size:16.5px;color:var(--muted)}
.harticle h4{margin:28px 0 8px;font-size:18.5px;line-height:1.25;color:var(--navy);scroll-margin-top:18px}
.hbody>h4:first-child{margin-top:4px}
.harticle p,.harticle li,.harticle dd,.faq-body p,.faq-body li{font-size:16.5px;line-height:1.55;color:#26364b}
.harticle p,.faq-body p{margin:0 0 12px}
.harticle ol,.harticle ul,.faq-body ol,.faq-body ul{margin:0 0 14px;padding-left:24px}
.harticle li,.faq-body li{margin:6px 0}
.harticle b,.faq-body b{color:var(--navy);font-weight:700}
.harticle a,.faq-body a{color:var(--blue-d)}
.callout{margin:14px 0;padding:12px 16px;background:var(--gold-soft);border-left:4px solid var(--gold);border-radius:8px}
.harticle ol.qsteps li{margin:12px 0}
.harticle .see{display:block;margin-top:4px;font-size:15.5px;color:var(--muted)}
.harticle dl.msgs{margin:0 0 12px}
.harticle dl.msgs dt{margin:14px 0 0;padding:6px 12px;background:#f1f5fa;border-radius:8px;font-weight:700;color:var(--navy);font-size:16px;line-height:1.4}
.harticle dl.msgs dd{margin:6px 0 0 12px;font-size:16px}
.harticle dl.glossary{margin:0 0 12px}
.harticle dl.glossary dt{margin:16px 0 0;font-weight:700;color:var(--navy);font-size:16.5px;line-height:1.35;scroll-margin-top:18px}
.harticle dl.glossary dd{margin:4px 0 0;font-size:16px;line-height:1.55;color:#26364b}
.harticle dl.glossary dt:target{background:var(--gold-soft);border-radius:6px;padding:2px 6px}
.harticle .eg{display:block;margin-top:3px;font-size:15px;color:#5b6a7f}
.alias{display:block;height:0;overflow:hidden;scroll-margin-top:18px}
.totop{margin:20px 0 0;font-size:14.5px}
.harticle .totop a,.hgroup-end a{font-weight:600;text-decoration:none;color:var(--blue-d)}
.harticle:target,details.faq:target{box-shadow:0 0 0 3px var(--gold)}
details.faq{margin:0 0 10px;background:#fff;border:1px solid var(--line);border-radius:12px;scroll-margin-top:18px;overflow-wrap:anywhere}
details.faq summary{position:relative;min-height:52px;padding:14px 52px 14px 18px;font-size:17px;font-weight:700;line-height:1.35;color:var(--navy);cursor:pointer;list-style:none}
details.faq summary::-webkit-details-marker{display:none}
details.faq summary:after{content:"+";position:absolute;right:18px;top:50%;margin-top:-14px;width:28px;height:28px;border-radius:50%;background:var(--gold-soft);color:#7a5600;font-size:20px;line-height:28px;text-align:center}
details.faq[open] summary:after{content:"\\2013"}
details.faq[open] summary{border-bottom:1px solid var(--line)}
.faq-body{padding:14px 18px 6px}
.hgroup-end{margin:6px 0 0;font-size:14.5px}
@media (max-width:960px){
  .help-layout{grid-template-columns:minmax(0,1fr);gap:18px}
  .help-toc{position:static;max-height:none;padding:2px 6px}
  .help-toc summary:after{display:inline}
  .help-toc .s-desk{display:none}
  .help-toc .s-mob{display:inline}
}
@media (max-width:640px){
  section.band.help{padding:24px 0 48px}
  .harticle{padding:20px 16px}
  .hsearch input{font-size:17px}
  details.faq summary{padding:13px 50px 13px 14px;font-size:16.5px}
  .faq-body{padding:12px 14px 4px}
  .harticle p,.harticle li,.harticle dd,.faq-body p,.faq-body li{font-size:16px}
}
@media print{
  header.top,.close,.help-toc,.hsearch,.totop,.hgroup-end,.skip,dialog,.hresults,.hempty{display:none!important}
  mark.hs-mark{background:none}
  .phero{padding:0}.phero:before{display:none}
}
`;


/* The search box and the contents list. Without JavaScript the search box stays hidden, everything is shown, and the
   contents list is an ordinary open list of links. With it, the shared search (/help-search.js, the same file the
   spectators' Help uses) shows a ranked list of the matching articles and questions; only a clear winner opens by
   itself. The page data (JSON) holds the synonyms and noAnswer lines of the page's help content, the sentences the
   search shows (T.helpPage.search) and, in BM, lang "ms" (no English stemming; see help-search.js). The English page
   also gets "alias": the BM words people may type there, read as their English meaning (scripts/i18n/ms/help-content.js
   search.toEnglish). On a narrow screen the contents list folds away until it is wanted. */
const json = (o) => JSON.stringify(o).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
const searchData = (T, lang, help) => lang === 'ms'
  ? { lang: 'ms', synonyms: help.search.synonyms, noAnswer: help.search.noAnswer, strings: T.helpPage.search }
  : { synonyms: help.search.synonyms, noAnswer: help.search.noAnswer, strings: T.helpPage.search, alias: HELP.ms.search.toEnglish };
const HELP_SCRIPT = (data) => `
<script src="/help-search.js"></script>
<script type="application/json" id="helpSearchData">${json(data)}</script>
<script>
(function(){
var form=document.getElementById('helpSearch'),input=document.getElementById('helpQ');
if(form&&input&&typeof HelpSearch!=='undefined'){
  var data={};try{data=JSON.parse(document.getElementById('helpSearchData').textContent)}catch(e){}
  var items=[].slice.call(document.querySelectorAll('[data-item]'));
  var idsOf=function(g){return items.filter(function(i){return i.getAttribute('data-group')===g}).map(function(i){return i.id})};
  var groups=[].slice.call(document.querySelectorAll('[data-group-head],[data-group-end]')).map(function(h){return{el:h,ids:idsOf(h.getAttribute('data-group-head')||h.getAttribute('data-group-end'))}});
  var tocs=[].slice.call(document.querySelectorAll('[data-toc]')).map(function(li){var id=li.getAttribute('data-toc'),own=idsOf(id);return{el:li,ids:own.length?own:[id]}});
  HelpSearch.attach({input:input,form:form,reveal:form,status:document.getElementById('helpCount'),results:document.getElementById('helpResults'),
    empty:document.getElementById('helpEmpty'),emptyQ:document.getElementById('helpEmptyQ'),say:document.getElementById('helpSay'),
    items:items,groups:groups,tocs:tocs,data:data});
}
var toc=document.getElementById('helpToc'),mq=window.matchMedia?window.matchMedia('(min-width: 961px)'):null;
if(toc&&mq){
  var sum=toc.querySelector('summary');
  toc.open=mq.matches;
  if(sum)sum.addEventListener('click',function(e){if(mq.matches)e.preventDefault()});
  toc.addEventListener('click',function(e){var t=e.target;if(t&&t.tagName==='A'&&!mq.matches)toc.open=false});
  var sync=function(){if(mq.matches)toc.open=true};
  if(mq.addEventListener)mq.addEventListener('change',sync);else if(mq.addListener)mq.addListener(sync);
}
})();
</script>`;

/* Search keywords: plain words in an attribute (never shown), so they need only the attribute escapes. */
const kwAttr = (it) => it.keywords ? ` data-keywords="${String(it.keywords).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')}"` : '';
/* Old ids that still have to work as #anchors after the outline moved (help-content.js `aliases`): an empty element with
   that id. Inside an article it is the article's first child, so the search script finds the article from it. */
const aliasSpans = (x) => (x.aliases || []).map((id) => `<span class="alias" id="${id}"></span>`).join('');
const helpArticle = (T, sec) => (it) => `
    <article class="harticle" id="${it.id}" data-item data-group="${sec.id}" data-kind="guide"${kwAttr(it)}>${aliasSpans(it)}
      <div class="hhead"><h3>${it.title}</h3><a class="anchor" href="#${it.id}" aria-label="${T.helpPage.linkToSection}">#</a></div>
      ${it.summary ? `<p class="sum">${it.summary}</p>` : ''}
      <div class="hbody">${it.body}</div>
      <p class="totop"><a href="#top">${T.helpPage.backToTop}</a></p>
    </article>`;
const helpQuestion = (sec) => (it) => `
    <details class="faq" id="${it.id}" data-item data-group="${sec.id}" data-kind="faq"${kwAttr(it)}>
      <summary>${it.title}</summary>
      <div class="faq-body">${aliasSpans(it)}${it.body}</div>
    </details>`;

function helpPage(T, ctx) {
  const help = HELP[ctx.lang], H = T.helpPage;
  const guideLinks = (sec) => sec.items.map((it) => `<li data-toc="${it.id}"><a href="#${it.id}">${it.title}</a></li>`).join('\n          ');
  const toc = help.sections.map((sec) => sec.kind === 'guide'
    ? `<p class="toc-h">${sec.title}</p>
        <ol>
          ${guideLinks(sec)}
        </ol>`
    : `<p class="toc-h">${H.quickAnswers}</p>
        <ol>
          <li data-toc="${sec.id}"><a href="#${sec.id}">${sec.title} (${sec.items.length})</a></li>
        </ol>`).join('\n        ');
  const main = help.sections.map((sec) => `
    ${aliasSpans(sec)}<h2 class="hgroup" id="${sec.id}" data-group-head="${sec.id}">${sec.title}</h2>${sec.items.map(sec.kind === 'guide' ? helpArticle(T, sec) : helpQuestion(sec)).join('')}
    ${sec.kind === 'faq' ? `<p class="hgroup-end" data-group-end="${sec.id}"><a href="#top">${H.backToTop}</a></p>` : ''}`).join('\n');
  const titleOf = (id) => { for (const sec of help.sections) for (const it of sec.items) if (it.id === id) return it.title; return ''; };
  const popular = help.search.popular.map((p) => `<li><a href="#${p.id}">${p.label || titleOf(p.id)}</a></li>`).join('');
  return `
<section class="phero" aria-labelledby="helpH"><div class="wrap">
  <p class="eyebrow">${H.eyebrow}</p>
  <h1 id="helpH">${help.title}</h1>
  <p class="lede">${help.lede}</p>
  <form class="hsearch" id="helpSearch" role="search" hidden>
    <label for="helpQ">${H.searchLabel}</label>
    <input id="helpQ" type="search" maxlength="120" placeholder="${H.placeholder}" autocomplete="off" autocapitalize="off" spellcheck="false" aria-describedby="helpCount" aria-controls="helpResults">
    <p class="hcount" id="helpCount" aria-live="polite"></p>
  </form>
</div></section>

<section class="band alt help" aria-label="${H.articlesLabel}"><div class="wrap help-layout">
  <nav class="help-toc" aria-label="${H.contentsLabel}">
    <details id="helpToc" open>
      <summary><span class="s-desk">${H.contents}</span><span class="s-mob">${H.jump}</span></summary>
      <div>
        ${toc}
      </div>
    </details>
  </nav>
  <div class="help-main">
    <div class="hintro hstart">
      <p>${H.start}</p>
    </div>
    <div class="hintro">
      <p>${H.spectatorBefore}<a href="${help.VIEWER_HELP_URL}" target="_blank" rel="noopener">${H.spectatorLink}</a>${H.spectatorAfter}</p>
      <a class="btn sm" href="/login.html" data-login>${H.logInTo}</a>
    </div>
    <div class="hempty" id="helpEmpty" hidden>
      <p class="hempty-h">${H.noAnswerBefore}<span id="helpEmptyQ"></span>${H.noAnswerAfter}</p>
      <p class="hempty-say" id="helpSay" hidden></p>
      <p>${H.tryFewer}</p>
      <ul class="hsuggest">${popular}</ul>
      <p class="hempty-end">${help.search.stuck}</p>
    </div>
    <div class="hresults" id="helpResults" hidden></div>
${main}
  </div>
</div></section>
${HELP_SCRIPT(searchData(T, ctx.lang, help))}`;
}

/* The pages of one language (or both) as { file path: html }, the path relative to the repo root (ms/ for BM).
   Pure: no file access, so the tests can compare it with what is on disk. */
const PAGE_KEYS = ['landing', 'features', 'how', 'help'];
function renderLang(lang) {
  const T = WORDS[lang], other = lang === 'en' ? 'ms' : 'en', out = {};
  PAGE_KEYS.forEach((key) => {
    const ctx = { lang, key, R: ROUTES[lang], twin: ROUTES[other][key] };
    const body = key === 'landing' ? landing(T, ctx) : key === 'features' ? features(T) : key === 'how' ? how(T) : helpPage(T, ctx);
    const headline = key === 'landing' || key === 'features' ? T.common.headlineShared : T.common.headlineNext;
    out[FILES[lang][key]] = page(T, ctx, body, headline, key === 'help' ? HELP_CSS : '');
  });
  return out;
}
function render(lang) {
  if (lang) return renderLang(lang);
  return Object.assign({}, renderLang('en'), renderLang('ms'));
}

module.exports = { render, ROUTES, FILES, SITE_URL, LANGS, langHead, langUi };

if (require.main === module) {
  const pages = render();
  Object.keys(pages).forEach((name) => {
    fs.mkdirSync(path.dirname(path.join(OUT, name)), { recursive: true });
    fs.writeFileSync(path.join(OUT, name), pages[name]);
  });
  console.log('written', Object.keys(pages).join(', '));
}

// Generates the public marketing site: index.html (landing, served at /), features.html (/features) and
// how-it-works.html (/how-it-works), from shared parts (CSS, icon sprite, header, closing band, login pop-up).
//   node scripts/build-landing.js     writes the three pages into the repo root
//   npm run build-landing             same
// Do not edit the generated pages by hand: tests/landing-site.test.js fails when they differ from this script's output.
// The organiser app itself is app.html (served at /app); the sign-in form is login.html, shown in the pop-up.
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, '..');

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

const header = (page) => `
<a class="skip" href="#main">Skip to content</a>
<header class="top"><div class="wrap nav">
  <a class="brand" href="/" aria-label="DartDraw home"><span class="mark" aria-hidden="true">D</span>DartDraw</a>
  <nav class="nav-links" aria-label="Main">
    <a href="/features"${page === 'features' ? ' aria-current="page"' : ''}>Features</a>
    <a href="/how-it-works"${page === 'how' ? ' aria-current="page"' : ''}>How it works</a>
  </nav>
  <span class="spacer"></span>
  <a class="btn sm" href="/login.html" data-login>Log in</a>
</div></header>`;

const closing = (headline) => `
<section class="close" aria-labelledby="closeH"><div class="wrap">
  <h2 id="closeH">${headline}</h2>
  <a class="btn" href="/login.html" data-login>Log in ${arrow}</a>
  <div class="foot"><a class="brand" href="/"><span class="mark" aria-hidden="true">D</span>DartDraw</a><span class="sep" aria-hidden="true"></span><span>Tournament charts, made simple.</span></div>
</div></section>`;

const dialog = `
<dialog id="loginDlg" aria-label="Log in to DartDraw">
  <div class="dlg">
    <button class="x" type="button" aria-label="Close" data-close>&times;</button>
    <iframe id="loginFrame" title="Log in to DartDraw" data-src="/login.html?embed=1"></iframe>
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

const page = (title, desc, pageKey, body, headline) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${desc}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>${CSS}</style>${pageKey === 'landing' ? signedInRedirect : ''}
</head>
<body>
${ICONS}
${header(pageKey)}
<main id="main">
${body}
</main>
${closing(headline)}
${dialog}
</body>
</html>
`;

/* ---------------- landing ---------------- */
const landing = `
<section class="hero" aria-labelledby="heroH"><div class="wrap hero-grid">
  <div>
    <p class="eyebrow">Built for tournament organisers</p>
    <h1 id="heroH">Your tournament.<br>Every draw, <em>organised.</em></h1>
    <p class="lede">Create draws, organise groups and prepare branded tournament charts &mdash; all in one place.</p>
    <div class="cta-row">
      <a class="btn big" href="/login.html" data-login>Log in to get started ${arrow}</a>
      <a class="btn ghost big" href="/features">Explore the features</a>
    </div>
    <ul class="tags" aria-label="Competition types"><li>Singles</li><li>Doubles</li></ul>
  </div>
  <div class="preview" aria-hidden="true">
    <div class="win">
      <div class="side">
        <div class="logo"><i>D</i>DartDraw</div>
        <small>Tournament workspace</small>
        <div class="it">Overview</div><div class="it on">Charts &amp; print</div><div class="it">Groups</div><div class="it">Knockout</div><div class="it">Players</div><div class="it">Event settings</div>
      </div>
      <div class="main-pane">
        <h4>DartDraw Open</h4><div class="s">Tournament workspace</div>
        <div class="tabs"><span class="on">Round robin</span><span>Knockout</span><span>Charts</span><span>Branding</span><span>Event details</span></div>
      </div>
    </div>
    <div class="chart">
      <div class="row1"><div><h5>DartDraw Open</h5><div class="sub">Round Robin &middot; Best of 3</div></div><div><span class="pill">A4 print preview</span><div class="grp">GROUP A<small>BOARD 01</small></div></div></div>
      <table class="grid"><thead><tr><th>#</th><th>Player</th><th>1</th><th>2</th><th>3</th><th>4</th><th>Won</th><th>Legs</th><th>Position</th></tr></thead><tbody>
        <tr><td>1</td><td class="n">Alex Turner</td><td class="x"></td><td>2 - 1</td><td>0 - 2</td><td>2 - 0</td><td>2</td><td>4 - 3</td><td>2</td></tr>
        <tr><td>2</td><td class="n">Sam Collins</td><td>1 - 2</td><td class="x"></td><td>2 - 1</td><td>2 - 0</td><td>2</td><td>5 - 3</td><td>1</td></tr>
        <tr><td>3</td><td class="n">Jamie Brooks</td><td>2 - 0</td><td>1 - 2</td><td class="x"></td><td>0 - 2</td><td>1</td><td>3 - 4</td><td>3</td></tr>
        <tr><td>4</td><td class="n">Chris Hall</td><td>0 - 2</td><td>0 - 2</td><td>2 - 0</td><td class="x"></td><td>1</td><td>2 - 4</td><td>4</td></tr>
      </tbody></table>
      <div class="mo"><div><b>MATCH ORDER</b>1. 1 v 2 &nbsp; 3. 1 v 3 &nbsp; 5. 1 v 4<br>2. 3 v 4 &nbsp; 4. 2 v 4 &nbsp; 6. 2 v 3</div><span style="flex:1"></span><span class="ph">YOUR LOGO HERE</span><span class="ph">SPONSOR LOGO HERE</span></div>
    </div>
  </div>
</div></section>

<section class="strip" aria-label="What DartDraw covers"><div class="wrap">
  <h2>One workspace.<br>Every stage of your draw.</h2>
  <div class="it">${ic('users')}Round robin</div>
  <div class="it">${ic('trophy')}Knockout</div>
  <div class="it">${ic('image')}Custom branding</div>
  <div class="it">${ic('doc')}A4 PDF charts</div>
</div></section>

<section class="band" id="steps" aria-labelledby="stepsH"><div class="wrap">
  <h2 class="sec" id="stepsH">From event setup to the first throw.</h2>
  <div class="steps">
    <div class="step"><span class="num">01</span><span class="disc">${ic('edit', 'sm')}</span><div><h3>Set up your event</h3><p>Add tournament details, event type and entries.</p></div></div>
    <div class="step"><span class="num">02</span><span class="disc">${ic('grid', 'sm')}</span><div><h3>Build your charts</h3><p>Choose your format, groups and board numbers.</p></div></div>
    <div class="step"><span class="num">03</span><span class="disc">${ic('printer', 'sm')}</span><div><h3>Review. Save. Print.</h3><p>Confirm your layout and prepare your A4 charts.</p></div></div>
  </div>
  <p style="margin:34px 0 0"><a class="btn ghost" href="/how-it-works" style="padding-left:0">See how it works in detail ${arrow}</a></p>
</div></section>`;

/* ---------------- features ---------------- */
const features = `
<section class="phero" aria-labelledby="fH"><div class="wrap">
  <p class="eyebrow">Features</p>
  <h1 id="fH">Everything you need to <em>run the draw.</em></h1>
  <p class="lede">From the first group to the final chart, DartDraw handles the sums, the boards and the paperwork.</p>
</div></section>

<section class="band" aria-labelledby="fmtH"><div class="wrap">
  <h2 class="sec" id="fmtH">Three ways to run an event</h2>
  <div class="fmt">
    <div class="card">${ic('users')}<h3>Round robin</h3><p>Everyone plays within their group, with live standings as scores go in.</p></div>
    <div class="card">${ic('bracket')}<h3>Knockout</h3><p>A straight elimination bracket, with byes added for you.</p></div>
    <div class="card">${ic('layers')}<h3>Round robin &rarr; Knockout</h3><p>Group stage first, then the top finishers go through to a bracket. Entries that don&rsquo;t advance can play a Plate pool.</p></div>
  </div>
</div></section>

<section class="band alt" aria-labelledby="moreH"><div class="wrap">
  <h2 class="sec" id="moreH">Built around how a tournament day really runs</h2>
  <div class="fgrid">
    <div class="card fcard"><span class="disc">${ic('target', 'sm')}</span><div><h3>A champion for every group &mdash; Group Boards</h3><p>Want a group champion before the finals? Group Boards splits the field into small knockout groups, each on its own boards. Every group crowns a champion, and the champions meet in a Finals bracket.</p><div class="mini"><span class="chip">Optional</span></div></div></div>
    <div class="card fcard"><span class="disc">${ic('shield', 'sm')}</span><div><h3>Fair draws, built for you</h3><ul><li>Groups are built and balanced automatically</li><li>Keep entries from the same organisation apart, in a group or in the first knockout round</li><li>Seeded or random placement into the bracket, with board numbers for each group</li></ul></div></div>
    <div class="card fcard"><span class="disc">${ic('check', 'sm')}</span><div><h3>Scoring that does the sums</h3><ul><li>Enter scores straight onto the chart; standings update as you go</li><li>Tie-breaks by head-to-head, leg difference, legs won, then your decision &mdash; and DartDraw flags any tie that needs one</li><li>No-shows, walkovers, withdrawals and check-in</li></ul></div></div>
    <div class="card fcard"><span class="disc">${ic('target', 'sm')}</span><div><h3>Legs your way</h3><p>Set best-of legs for the whole event, or vary them by knockout round: early rounds, quarter-finals, semi-finals and the final.</p></div></div>
    <div class="card fcard"><span class="disc">${ic('users', 'sm')}</span><div><h3>Singles and doubles</h3><p>Run singles, or doubles with both players named on each pair. Charts, results and the live page show the pair.</p></div></div>
    <div class="card fcard"><span class="disc">${ic('printer', 'sm')}</span><div><h3>Your branding, ready to print</h3><ul><li>Your logo, sponsor logos and a rules or footer line</li><li>An A4 pack of blank charts before the day, and the final chart with every result afterwards</li><li>A QR code on each printed sheet that opens its live page</li></ul></div></div>
    <div class="card fcard"><span class="disc">${ic('qr', 'sm')}</span><div><h3>Live results for everyone</h3><ul><li>Share one link: players see their group, their next match and the bracket, and can follow friends</li><li>The page refreshes by itself, and shows &ldquo;Final results&rdquo; when it&rsquo;s done</li><li>Events can also appear on a public home page</li></ul></div></div>
    <div class="card fcard"><span class="disc">${ic('clock', 'sm')}</span><div><h3>Tools for the day</h3><ul><li>Estimated start times, breaks and a board plan</li><li>Open the round robin and the knockout in separate windows for several screens</li><li>A private incident log, and accepted results lock the final standings</li></ul></div></div>
    <div class="card fcard"><span class="disc">${ic('monitor', 'sm')}</span><div><h3>Safe, and always with you</h3><p>Sign in from any device and your events are saved to your account. Only you and the Admin can change them.</p></div></div>
  </div>
</div></section>`;

/* ---------------- how it works ---------------- */
const how = `
<section class="phero" aria-labelledby="hH"><div class="wrap">
  <p class="eyebrow">How it works</p>
  <h1 id="hH">From event setup to <em>the first throw.</em></h1>
  <p class="lede">Seven steps, in the order you&rsquo;ll do them. The app guides you through each one.</p>
</div></section>

<section class="band" aria-label="The seven steps"><div class="wrap">
  <ol class="tl">
    <li><span class="num">1</span><div><h3>Create your event</h3><p>Name it, choose the category and Singles or Doubles, set the date and the number of entries.</p></div><span class="disc">${ic('edit', 'sm')}</span></li>
    <li><span class="num">2</span><div><h3>Choose format and branding</h3><p>Pick the format and best-of legs, including Group Boards if you want a champion for every group before the finals. Add your logo, sponsors and footer. Basic setup keeps things simple; Advanced adds scheduling, per-round legs and the Plate pool.</p></div><span class="disc">${ic('layers', 'sm')}</span></li>
    <li><span class="num">3</span><div><h3>Build your charts</h3><p>Add your entries. DartDraw builds balanced groups and gives each its boards, and you can adjust anything by hand.</p></div><span class="disc">${ic('grid', 'sm')}</span></li>
    <li><span class="num">4</span><div><h3>Confirm and print</h3><p>Check each chart, confirm it, and print the blank A4 pack, QR codes included.</p></div><span class="disc">${ic('printer', 'sm')}</span></li>
    <li><span class="num">5</span><div><h3>Run the day</h3><p>Start the games, enter scores and watch standings update. When the groups are done, the knockout is drawn. Share the live link so players can follow along.</p></div><span class="disc">${ic('target', 'sm')}</span></li>
    <li><span class="num">6</span><div><h3>Finalize standings</h3><p>Review the final standings and settle any ties.</p></div><span class="disc">${ic('check', 'sm')}</span></li>
    <li><span class="num">7</span><div><h3>Print and accept</h3><p>Print the completed chart with every result. Then accept the results to publish &ldquo;Final results&rdquo;.</p></div><span class="disc">${ic('trophy', 'sm')}</span></li>
  </ol>
</div></section>

<section class="band alt" aria-labelledby="gtkH"><div class="wrap">
  <h2 class="sec" id="gtkH">Good to know</h2>
  <div class="notes">
    <div class="note">${ic('monitor', 'sm')}<p><b>Saved as you go</b>Everything saves to your account, so you can pick up on any device.</p></div>
    <div class="note">${ic('link', 'sm')}<p><b>Live pages update themselves</b>Players don&rsquo;t need to refresh to see new results.</p></div>
    <div class="note">${ic('shield', 'sm')}<p><b>Accepted results are locked</b>Once you accept them, only the Admin can reopen them.</p></div>
  </div>
</div></section>`;

const SHARED_HEADLINE = 'Less time on charts. <em>More time on the oche.</em>';

/* The three pages as { file name: html }. Pure: no file access, so the tests can compare it with what is on disk. */
function render() {
  return {
    'index.html': page('DartDraw – Your tournament. Every draw, organised.', 'Create draws, organise groups and prepare branded darts tournament charts – all in one place.', 'landing', landing, SHARED_HEADLINE),
    'features.html': page('Features – DartDraw', 'Round robin, knockout, group boards, live results and branded A4 charts – everything you need to run a darts draw.', 'features', features, SHARED_HEADLINE),
    'how-it-works.html': page('How it works – DartDraw', 'Seven steps from event setup to the first throw: create, choose a format, build charts, print, run the day, finalize and accept.', 'how', how, 'Ready to run your <em>next draw?</em>')
  };
}

module.exports = { render };

if (require.main === module) {
  const pages = render();
  Object.keys(pages).forEach((name) => fs.writeFileSync(path.join(OUT, name), pages[name]));
  console.log('written', Object.keys(pages).join(', '));
}

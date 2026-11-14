"""The look of the public site. Nov 2026 redesign ("yard sign").

One idea: every screen reads like a yard sign. Big sign type, flat fields of the three brand colors
(navy, orange, cream), and real gate photos shown as date stamped prints. No glow, no gradients,
no boxes around things you cannot tap.

Type: one family, Archivo, the logo's own typeface. Narrow and heavy for headlines (font-stretch 66 to 74),
a touch narrow for buttons and small headings (86 to 90), and a touch wide for reading text (104).
It is one file, served from /assets/fonts/, not from Google.

parts.py imports every string here. Edit the look in this file, not in parts.py."""
import re


def _min(css):
    css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
    css = re.sub(r'\s*\n\s*', '', css)
    css = re.sub(r'\s*([{};,>])\s*', r'\1', css)
    css = re.sub(r':\s+', ':', css)
    return css.replace(';}', '}').strip()


FONTS = '<link rel="preload" href="/assets/fonts/archivo-var-v1.woff2" as="font" type="font/woff2" crossorigin>'

# The .apw and .apw.dark lines keep their shape on purpose: build/build.mjs reads the dark values out of this string.
BASE_CSS = (
    '@font-face{font-family:"Archivo";font-style:normal;font-display:swap;font-weight:100 900;font-stretch:62% 125%;src:url(/assets/fonts/archivo-var-v1.woff2) format("woff2")}\n'
    '@font-face{font-family:"APW Head Fallback";src:local("Arial Bold"),local("Arial-BoldMT"),local("Arial");size-adjust:74%;ascent-override:118%;descent-override:26%;line-gap-override:0%}\n'
    ':root{--f-text:"Archivo",ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;--f-head:"Archivo","APW Head Fallback","Arial Narrow",Arial,sans-serif}\n'
    'body{margin:0;background:#070B1B}\n'
    '*{box-sizing:border-box}\n'
    '.apw{--bg:#FFFFFF;--bg2:#F6F4EF;--bg3:#E4EEF8;--card:#FFFFFF;--ink:#0E1430;--ink2:#3E4668;--mute:#4A5272;--line:#E2DDD2;--line2:#B9BED3;--field:#8A91B0;--accent:#FF4A1C;--accent-hi:#FF6B42;--accent-ink:#0E1430;--accent-text:#B02A08;--accent-soft:#FFE1D6;--ok:#1E7A52;--ok-soft:#E3F1EA;--band:#0A0F24;--band2:#111936;--shadow:0 14px 34px rgba(10,15,36,.14);font-family:var(--f-text);font-stretch:104%;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}\n'
    '.apw.dark{--bg:#0A0F24;--bg2:#0E1530;--bg3:#101A38;--card:#141D3D;--ink:#F6F4EF;--ink2:#D5DAF0;--mute:#AEB5D8;--line:rgba(255,255,255,.14);--line2:rgba(255,255,255,.3);--field:#6B7398;--accent-text:#FF8A66;--accent-soft:rgba(255,74,28,.16);--ok:#4CC38A;--ok-soft:rgba(76,195,138,.15);--band:#070B1B;--band2:#111936;--shadow:0 18px 40px rgba(0,0,0,.5)}\n'
    + _min(r"""
.apw a{color:var(--accent-text)}
.mono{font-family:var(--f-text);font-stretch:104%;font-variant-numeric:tabular-nums}
.wm{font-family:var(--f-head);font-weight:800;text-transform:uppercase;letter-spacing:.045em;line-height:1}
.eb{margin:0;font-size:15px;font-weight:700;line-height:1.4;color:var(--mute)}
.h1{margin:0;font-family:var(--f-head);font-stretch:68%;font-weight:850;letter-spacing:-.006em;line-height:.92;text-wrap:balance}
.h2{margin:0;font-family:var(--f-head);font-stretch:68%;font-weight:850;font-size:clamp(40px,11vw,50px);letter-spacing:-.006em;line-height:.96;text-wrap:balance}
.lead{margin:14px 0 0;font-size:18px;line-height:1.55;color:var(--ink2)}
.nb{white-space:nowrap}
.btn{display:flex;align-items:center;justify-content:center;gap:10px;min-height:58px;padding:0 26px;border-radius:12px;border:2px solid transparent;font-family:var(--f-head);font-stretch:88%;font-size:20px;font-weight:750;letter-spacing:.004em;line-height:1;cursor:pointer;text-decoration:none;white-space:nowrap}
.btn:disabled{opacity:.45;cursor:not-allowed}
.btn:not(:disabled):active{transform:translateY(1px)}
.apw .btn-dot{background:var(--accent);color:var(--accent-ink)}
.apw .btn-dot:not(:disabled):hover{background:var(--accent-hi);color:var(--accent-ink)}
.apw .btn-ink{background:var(--ink);color:var(--bg)}
.apw .btn-line{background:transparent;color:var(--ink);border-color:var(--line2)}
.apw .btn-line:hover{border-color:var(--ink)}
.apw .btn-line-n{background:transparent;color:#FFFFFF;border-color:rgba(255,255,255,.34)}
.apw .btn-line-n:hover{border-color:#FFFFFF}
.apw .btn-pay{background:#000000;color:#FFFFFF;border-color:#000000}
.apw.dark .btn-pay{border-color:rgba(255,255,255,.4)}
.ibtn{width:48px;height:48px;flex:0 0 48px;display:grid;place-items:center;border-radius:12px;border:2px solid var(--line2);background:transparent;color:var(--ink);cursor:pointer;padding:0;text-decoration:none}
.apw .ibtn-n{border-color:rgba(255,255,255,.3);color:#F6F4EF}
.ldot{display:inline-block;width:9px;height:9px;flex:0 0 9px;border-radius:50%;background:#FF4A1C}
details>summary{list-style:none;cursor:pointer}
details>summary::-webkit-details-marker{display:none}
.chev{transition:transform .2s ease}
details[open]>summary .chev{transform:rotate(45deg)}
input:focus-visible,button:focus-visible,a:focus-visible,summary:focus-visible,textarea:focus-visible,ul:focus-visible{outline:3px solid #FF6B42;outline-offset:2px}
.apw .btn-dot:focus-visible{outline-color:#F6F4EF}
@media (prefers-reduced-motion:reduce){.chev{transition:none}}
"""))

# ---------- small pieces used inside the sections ----------
SITE_CSS = _min(r"""
/* the date stamped print: how every real gate photo is shown */
.apw .print{position:relative;margin:0;padding:10px 10px 0;background:#F6F4EF;color:#0E1430;box-shadow:0 24px 44px -20px rgba(0,0,0,.7)}
.apw .print img{display:block;width:100%;height:auto;object-fit:cover;background:#D9CDB8}
.apw .print p.print-c{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin:0;padding:9px 2px 11px;font-size:16px;line-height:1.1;color:#0E1430}
.apw .print-c b{font-family:var(--f-head);font-stretch:80%;font-weight:700;font-size:17px;letter-spacing:.02em;font-variant-numeric:tabular-nums}
.apw .print-c span{font-family:var(--f-head);font-stretch:104%;font-weight:800;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase}
.apw .stamp{position:absolute;z-index:2;padding:3px;border:2.5px solid #FF4A1C;border-radius:9px;background:rgba(246,244,239,.95);color:#B02A08;transform:rotate(-7deg);font-family:var(--f-head);font-stretch:72%;font-weight:800;font-size:22px;letter-spacing:.05em;line-height:1;text-transform:uppercase;white-space:nowrap}
.apw .stamp>span{display:flex;align-items:baseline;gap:.5em;padding:7px 11px 6px;border:1px solid #FF4A1C;border-radius:5px}
.apw .stamp i{font-style:normal;font-weight:650;font-size:.74em;letter-spacing:.04em}
/* a real photo from the shoot: flat, no frame. Prints are only for gate photos */
.apw .pho{margin:0}
.apw .pho img{display:block;width:100%;height:auto;border-radius:6px;background:#141D3D;object-fit:cover}
.apw .pho figcaption{margin-top:10px;font-size:15px;line-height:1.4;color:var(--mute)}
/* links inside running text: cream words on an orange underline */
.apw .sec p a:not(.btn):not(.tl),.apw .sec li a:not(.btn),.apw .promise p a{color:var(--ink);font-weight:700;text-decoration:underline;text-decoration-thickness:2px;text-underline-offset:4px;text-decoration-color:var(--accent)}
.apw .sec p a:not(.btn):not(.tl):hover,.apw .sec li a:not(.btn):hover{text-decoration-color:currentColor}
/* text link with a bold underline */
.apw .tl{display:inline-flex;align-items:center;min-height:44px;font-size:17px;font-weight:700;color:var(--ink);text-decoration:underline;text-decoration-thickness:2px;text-underline-offset:5px;text-decoration-color:var(--accent)}
.apw .tl:hover{text-decoration-color:currentColor}
/* a text message from us */
.apw .bub{display:inline-block;max-width:100%;margin-top:12px;padding:12px 16px;border-radius:20px 20px 20px 6px;background:var(--card);font-size:16px;line-height:1.45;color:var(--ink)}
/* dogs on the price picker */
.apw .dogrow{display:flex;flex-wrap:wrap;justify-content:center;gap:2px;min-height:44px}
.apw .dogf{display:block;width:44px;height:44px;animation:dogPop .4s cubic-bezier(.3,1.6,.5,1) both}
.apw .dogf svg{display:block;width:100%;height:100%}
@keyframes dogPop{from{transform:scale(.2) rotate(-20deg);opacity:0}to{transform:none;opacity:1}}
/* questions: plain rows that open */
.apw .qcol{min-width:0}
.apw .qa{border-bottom:1px solid var(--line)}
.apw .qcol:first-child{border-top:1px solid var(--line)}
.apw .qa summary{display:flex;align-items:center;gap:16px;min-height:64px;padding:14px 0}
.apw .qb{flex:1;margin:0;font-family:var(--f-head);font-stretch:88%;font-weight:750;font-size:20px;letter-spacing:0;line-height:1.2;color:var(--ink)}
.apw .qa-i{position:relative;flex:0 0 22px;width:22px;height:22px}
.apw .qa-i::before,.apw .qa-i::after{content:"";position:absolute;left:2px;right:2px;top:10px;height:2.5px;border-radius:2px;background:var(--accent)}
.apw .qa-i::after{transform:rotate(90deg);transition:transform .18s ease}
.apw .qa[open] .qa-i::after{transform:none}
.apw .ab p{margin:0;padding:0 38px 20px 0;font-size:17px;line-height:1.55;color:var(--ink2)}
/* a slot that waits for real content (design canvas only) */
.ph{display:grid;place-items:center;text-align:center;border:2px solid var(--field);background:var(--bg3);color:var(--mute);font-size:13px;line-height:1.2}
@media (prefers-reduced-motion:reduce){.apw .dogf{animation:none}.apw .qa-i::after{transition:none}}
""")

# the service map: flat chips, the key line, the coming soon note (the map drawing styles live in truemap.py)
MAP_FIX_CSS = _min(r"""
.apw .map{margin:0 -20px;border:0;background:#141D3D}
.apw .mchips{display:flex;flex-wrap:wrap;gap:8px;margin-top:22px}
.apw .mchip{display:inline-flex;align-items:center;min-height:46px;padding:0 16px;border:2px solid var(--line2);border-radius:12px;background:transparent;color:var(--ink);font-family:var(--f-head);font-stretch:88%;font-size:18px;font-weight:750;cursor:pointer;white-space:nowrap}
.apw .mchip:hover{border-color:var(--ink)}
.apw .mchip[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:#0E1430}
.apw .mkey{display:flex;align-items:center;gap:10px;margin:16px 0 0;font-size:16px;line-height:1.45;color:var(--ink2)}
.apw .mkey-sw{flex:0 0 16px;width:16px;height:16px;border-radius:3px;background:#FF4A1C}
.apw .soon{margin-top:0;padding-top:22px;border-top:1px solid var(--line)}
.apw .soon-h{margin:0;font-family:var(--f-head);font-stretch:84%;font-weight:800;font-size:22px;line-height:1.1;color:var(--ink)}
.apw .soon-l{margin:8px 0 0;font-size:17px;line-height:1.5;color:var(--ink)}
.apw .soon-p{margin:8px 0 0;font-size:16px;line-height:1.5;color:var(--ink2)}
.apw .soon-b{margin-top:16px}
.apw .zipf{margin-top:26px;padding-top:22px;border-top:1px solid var(--line)}
.apw .zipf label{display:block;font-family:var(--f-head);font-stretch:84%;font-weight:800;font-size:22px;line-height:1.1}
.apw .zipf-r{display:flex;gap:10px;margin-top:12px}
.apw .zipf input{flex:1;min-width:0;height:58px;padding:0 16px;border-radius:12px;border:2px solid var(--line2);background:transparent;color:var(--ink);font:inherit;font-size:20px;font-variant-numeric:tabular-nums;letter-spacing:.06em}
.apw .zipf input::placeholder{color:var(--field);letter-spacing:0}
.apw .zipr{margin-top:14px;padding:14px 16px;border-radius:12px;border:2px solid var(--line2);font-size:16px;line-height:1.5;color:var(--ink2)}
.apw .zipr p{margin:0}
.apw .zipr b,.apw .zipr strong{color:var(--ink)}
.apw .zipr-ok{display:flex;gap:12px;align-items:flex-start;border-color:var(--ok)}
.apw .zipr-ok>span{display:grid;place-items:center;flex:0 0 28px;width:28px;height:28px;border-radius:50%;background:var(--ok);color:#0A0F24}
.apw .zipr-ok b{display:block;font-size:18px}
.apw .zipr-ok small{display:block;margin-top:2px;font-size:14px;color:var(--mute)}
.apw .zipr-ok p{margin-top:6px}
.apw .zipe{margin:12px 0 0;font-size:15px;color:var(--accent-text)}
@media (min-width:1024px){.apw .map{margin:0;border-radius:6px}}
""")

# the frame around the animated visit
SCENE_FIX_CSS = _min(r"""
.apw .vsw{border-radius:14px;box-shadow:none;border:2px solid rgba(255,255,255,.18)}
.apw .vs .chipv{font-family:var(--f-text);font-size:14px;font-weight:700;letter-spacing:0;text-transform:none;border-radius:8px}
.apw .vs .capv{border-radius:10px}
.apw .vsw .vtag{font-family:var(--f-text);font-size:14px;font-weight:700;letter-spacing:0;text-transform:none}
.apw .vs .stampv{font-family:var(--f-head);font-stretch:72%;font-weight:800;letter-spacing:.05em}
""")

HDR_CSS = _min(r"""
.apw .hdr{position:sticky;top:0;z-index:20;background:var(--bg);border-bottom:1px solid var(--line)}
.apw .hin{display:flex;align-items:center;gap:8px;max-width:1280px;height:68px;margin:0 auto;padding:0 12px 0 14px}
.apw .hlogo{display:flex;align-items:center;flex:0 0 auto;min-height:48px;text-decoration:none}
.apw .lgo{display:block;width:auto;height:54px}
.apw .hsp{flex:1}
.apw .dnav,.apw .hcall{display:none}
.apw .hbook{min-height:44px;padding:0 14px;border-radius:10px;font-size:17px}
@media (max-width:409px){.apw .hin{gap:6px;padding:0 10px 0 12px}.apw .lgo{height:46px}.apw .hbook{padding:0 12px;font-size:16px}}
@media (max-width:339px){.apw .hbook{display:none}}
@media (max-width:1023px){.has-dk .apw .hbook{display:none}}
@media (min-width:1024px){
.apw .hin{height:88px;padding:0 40px;gap:10px}
.apw .lgo{height:70px}
.apw .dnav{display:flex;align-items:center;gap:2px;margin-left:22px}
.apw .dnav a{display:inline-flex;align-items:center;min-height:44px;padding:0 12px;border-radius:10px;color:var(--ink);font-family:var(--f-head);font-stretch:90%;font-size:18px;font-weight:650;text-decoration:none;white-space:nowrap}
.apw .dnav>a:hover,.apw .dnav .ddt:hover{color:var(--accent-text)}
.apw .hbook{min-height:50px;padding:0 24px;border-radius:12px;font-size:19px}
.apw .mbtn{display:none}
}
@media (min-width:1024px) and (max-width:1239px){.apw .lgo{height:60px}.apw .dnav{margin-left:8px}.apw .dnav a{padding:0 9px;font-size:17px}}
@media (min-width:1240px){.apw .hcall{display:inline-flex;align-items:center;min-height:44px;margin-right:14px;color:var(--ink);font-family:var(--f-head);font-stretch:90%;font-size:20px;font-weight:750;letter-spacing:.01em;text-decoration:none;white-space:nowrap}.apw .hcall:hover{color:var(--accent-text)}}
""")

DD_CSS = _min(r"""
.apw .dd{position:relative;display:flex;align-items:center}
.apw .dnav .ddt{gap:4px}
.apw .ddc{width:14px;height:14px;transition:transform .15s}
.apw .dd:hover .ddc,.apw .dd:focus-within .ddc{transform:rotate(180deg)}
.apw .ddm{position:absolute;top:100%;left:50%;z-index:30;padding-top:8px;opacity:0;visibility:hidden;transform:translate(-50%,4px);transition:opacity .15s,transform .15s,visibility 0s .15s}
.apw .dd:hover .ddm,.apw .dd:focus-within .ddm{opacity:1;visibility:visible;transform:translate(-50%,0);transition:opacity .15s,transform .15s}
.apw .ddp{min-width:280px;padding:8px;border-radius:12px;background:var(--card);border:1px solid var(--line2);box-shadow:var(--shadow)}
.apw .dnav .ddp a{display:grid;gap:2px;min-height:0;padding:10px 12px;border-radius:8px;white-space:normal;font-size:18px}
.apw .dnav .ddp a:hover,.apw .dnav .ddp a:focus-visible{background:rgba(255,255,255,.07);color:var(--ink)}
.apw .ddp b{font-weight:750}
.apw .ddp span{font-family:var(--f-text);font-size:14px;font-weight:400;color:var(--mute)}
.apw .dnav .ddp .dda{margin-top:4px;padding-top:12px;border-top:1px solid var(--line);border-radius:0 0 8px 8px;font-size:17px;font-weight:750;color:var(--accent-text)}
.apw .ddg{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px;width:620px}
.apw .ddh{margin:8px 12px 4px;font-size:14px;font-weight:700;color:var(--mute)}
@media (prefers-reduced-motion:reduce){.apw .ddc,.apw .ddm{transition:none}}
""")
HDR_CSS += DD_CSS

# ---------- page layout: home and town pages ----------
PAGE_CSS = HDR_CSS + _min(r"""
.apw .pg{position:relative;background:var(--bg);overflow-x:clip}
.apw .in{width:100%;max-width:600px;margin-left:auto;margin-right:auto}
.apw .sec{padding:76px 20px 0;background:var(--bg);color:var(--ink)}
.apw .shd{max-width:760px}
.apw .mlink{display:flex;align-items:center;min-height:60px;font-family:var(--f-head);font-stretch:84%;font-size:26px;font-weight:800;color:var(--ink);text-decoration:none;border-bottom:1px solid var(--line)}
.apw .mdlg{position:fixed;inset:0;z-index:40;display:flex;justify-content:flex-end;background:rgba(7,11,27,.7)}
.apw .mpan{width:100%;max-width:440px;height:100%;overflow-y:auto;display:flex;flex-direction:column;padding:0 16px 24px;background:var(--bg);color:var(--ink)}
.apw .mtop{display:flex;align-items:center;gap:10px;height:68px}
.apw .mnav{display:flex;flex-direction:column;margin-top:6px}
.apw .mbk{margin-top:24px}
.apw .mct{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:10px}
.apw .mnum{margin:18px 0 0;text-align:center;font-family:var(--f-head);font-stretch:88%;font-weight:750;font-size:22px;color:var(--ink)}

/* hero */
.apw .hero{position:relative;overflow:hidden;padding:26px 20px 0;background:var(--bg);color:var(--ink)}
.apw .hero-g{display:flex;flex-direction:column}
.apw .hero-h1{font-size:clamp(46px,15.8vw,74px);color:var(--ink)}
.apw .h1-a,.apw .h1-b{display:block}
.apw .h1-b{margin-top:.44em;font-stretch:86%;font-weight:750;font-size:.36em;letter-spacing:0;line-height:1.1;color:var(--ink2);text-wrap:balance}
.apw .hero-cta{order:2;display:flex;flex-direction:column;gap:4px;margin-top:24px}
.apw .hero-call{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:0 .34em;min-height:48px;margin:0;font-size:17px;color:var(--ink2)}
.apw .hero-call a{display:inline-flex;align-items:center;min-height:44px;color:var(--ink);font-weight:700;text-decoration:underline;text-decoration-thickness:2px;text-underline-offset:5px;text-decoration-color:var(--accent)}
.apw .hero-call b{font-family:var(--f-head);font-stretch:90%;font-weight:750;font-size:1.2em;letter-spacing:.01em;color:var(--ink);white-space:nowrap}
.apw .hero-sm{order:3;margin:0;text-align:center;font-size:15px;line-height:1.4;color:var(--mute)}
.apw .hero .grv{order:4}
.apw .hero-p{order:5;margin:24px 0 0;font-size:18px;line-height:1.55;color:var(--ink2)}
.apw .hero-v{order:6;position:relative;display:flex;flex-direction:column;align-items:center;margin:40px 0 0;padding:0 16px 30px}
.apw .sun{position:absolute;left:50%;top:34%;width:min(132%,560px);aspect-ratio:1/1;border-radius:50%;background:var(--accent);transform:translateX(-50%)}
.apw .hero-ph{position:relative;z-index:1;align-self:flex-end;width:min(82%,380px)}
.apw .hero-ph img{display:block;width:100%;height:auto;border-radius:6px;background:#141D3D}
.apw .print-a{position:absolute;z-index:2;left:0;bottom:104px;width:min(46%,200px);padding:6px 6px 0;transform:rotate(-5deg)}
.apw .print-a img{aspect-ratio:1/1}
.apw .print-a .stamp{right:-10px;bottom:32px;padding:2px;border-width:2px;border-radius:7px;font-size:12px}
.apw .print-a .stamp>span{padding:4px 6px 3px;border-radius:4px}
.apw .print-a p.print-c{padding:6px 1px 7px}
.apw .print-a .print-c b{font-size:11.5px;white-space:nowrap}
.apw .print-a .print-c span{display:none}
.apw .hero-v figcaption{position:relative;z-index:1;margin-top:20px;font-size:16px;font-weight:700;line-height:1.3;color:#0E1430;text-align:center}

/* bonded, insured, background checked, family owned */
.apw .seals{position:relative;z-index:1;background:#070B1B;color:#F6F4EF}
.apw .seals-l{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px 12px;max-width:600px;margin:0 auto;padding:24px 20px;list-style:none}
.apw .seals-l li{display:flex;align-items:center;gap:10px;min-width:0}
.apw .seal-i{flex:0 0 42px;width:42px;height:42px;display:block}
.apw .seals-l b{display:block;font-family:var(--f-head);font-stretch:86%;font-weight:800;font-size:18px;line-height:1.05;color:#F6F4EF}
.apw .seals-l small{display:block;margin-top:3px;font-size:14px;line-height:1.25;color:#AEB5D8}
.apw .seals-l .seals-go{grid-column:1 / -1}
.apw .seals-go .tl{font-size:16px;white-space:nowrap}

/* the promise: one orange field, like a sign */
.apw .promise{padding:54px 20px 54px;background:var(--accent);color:#0E1430}
.apw .promise-h{margin:0;font-family:var(--f-head);font-stretch:66%;font-weight:900;font-size:clamp(62px,20vw,92px);letter-spacing:-.01em;line-height:.86;text-wrap:balance}
.apw .promise-t{margin-top:26px}
.apw .promise-t p{max-width:33em;margin:0 0 12px;font-size:18px;font-weight:500;line-height:1.5}
.apw .promise .tl{color:#0E1430;text-decoration-color:#0E1430}
.apw .promise a:focus-visible{outline-color:#0E1430}
.apw .promise-ph{max-width:420px;margin-top:30px}
.apw .promise-ph figcaption{color:#0E1430;font-weight:600;font-size:16px}

/* prices */
.apw .pr-deal{margin-top:28px}
.apw .pr-deal .bfd{margin:0}
.apw .pr-deal:empty{display:none}
.apw .pr-g{display:grid;grid-template-columns:minmax(0,1fr);gap:34px;margin-top:30px}
.apw .dogs{display:flex;align-items:center;gap:10px}
.apw .dogs-m{flex:1;min-width:0;text-align:center}
.apw .dogs-n{margin:6px 0 0;font-family:var(--f-head);font-stretch:86%;font-weight:800;font-size:22px;line-height:1;color:var(--ink)}
.apw .dogs-p{margin:14px 0 0;text-align:center;font-size:16px;line-height:1.45;color:var(--mute)}
.apw .plans{display:grid;gap:10px;margin-top:22px}
.apw .plan{display:grid;grid-template-columns:26px minmax(0,1fr) auto;grid-template-areas:"r n p" "r s p";align-items:center;column-gap:14px;row-gap:3px;width:100%;min-height:86px;padding:14px 18px;border:2px solid var(--line2);border-radius:14px;background:transparent;color:var(--ink);font:inherit;text-align:left;cursor:pointer}
.apw .plan:hover{border-color:var(--ink)}
.apw .plan-r{grid-area:r;width:26px;height:26px;border-radius:50%;border:2px solid var(--field)}
.apw .plan[aria-checked="true"]{border-color:var(--accent);background:rgba(255,74,28,.1)}
.apw .plan[aria-checked="true"] .plan-r{border-color:var(--accent);background:var(--accent);box-shadow:inset 0 0 0 5px #0A0F24}
.apw .plan-n{grid-area:n;align-self:end;font-family:var(--f-head);font-stretch:86%;font-weight:800;font-size:22px;line-height:1.1}
.apw .plan-s{grid-area:s;align-self:start;font-size:15px;line-height:1.3;color:var(--mute)}
.apw .plan-p{grid-area:p;display:flex;flex-direction:column;align-items:flex-end;font-family:var(--f-head);font-stretch:68%;font-weight:850;font-size:42px;line-height:1}
.apw .plan-p small{margin-top:3px;font-family:var(--f-text);font-stretch:104%;font-weight:400;font-size:14px;line-height:1.2;color:var(--mute)}
.apw .pr-line{margin:0;font-size:17px;font-weight:700;color:var(--ink2)}
.apw .pr-total{display:flex;align-items:baseline;gap:10px;margin:8px 0 0;font-size:21px;color:var(--ink2)}
.apw .pr-total b{font-family:var(--f-head);font-stretch:66%;font-weight:900;font-size:108px;letter-spacing:-.01em;line-height:.8;color:var(--ink)}
.apw .pr-ab{align-self:flex-start;margin-top:2px;font-size:17px;font-weight:700;color:var(--ink2)}
.apw .pr-per{margin:14px 0 0;font-size:17px;line-height:1.5;color:var(--ink2)}
.apw .pr-in{margin:20px 0 0;padding:14px 0 0;border-top:1px solid var(--line);font-size:16px;line-height:1.55;color:var(--ink2)}
.apw .pr-in strong{color:var(--ink)}
.apw .pr-sum>.btn{margin-top:22px}
.apw .pr-note{margin:16px 0 0;font-size:15px;line-height:1.55;color:var(--mute)}
.apw .pr-note strong{color:var(--ink)}
.apw .pr-note a{font-weight:700}
.apw .pr-all{margin-top:18px;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.apw .pr-all>summary{display:flex;align-items:center;justify-content:space-between;min-height:58px;font-size:17px;font-weight:700;color:var(--ink)}
.apw .pr-all>summary svg{color:var(--accent)}
.apw .ptab{width:100%;border-collapse:collapse;font-size:16px;color:var(--ink)}
.apw .ptab th,.apw .ptab td{padding:12px 0;border-bottom:1px solid var(--line);text-align:right;font-variant-numeric:tabular-nums}
.apw .ptab thead th{padding-top:4px;font-size:14px;font-weight:700;color:var(--mute)}
.apw .ptab th:first-child{text-align:left}
.apw .ptab tbody th{font-weight:700}
.apw .ptab td b{display:block;font-family:var(--f-head);font-stretch:84%;font-weight:800;font-size:19px;line-height:1.15;white-space:nowrap}
.apw .ptab td small{display:block;margin-top:3px;font-size:14px;line-height:1.2;color:var(--mute);white-space:nowrap}
.apw .ptab-w{margin:12px 0 0;font-size:14px;line-height:1.5;color:var(--mute)}
.apw .ptab td{padding-left:12px}
@media (max-width:379px){.apw .ptab td b{font-size:16px}.apw .ptab td small{font-size:12.5px}.apw .ptab tbody th{font-size:15px}}
.apw .ptab-x{margin:20px 0 0;font-size:14px;font-weight:700;color:var(--mute)}
.apw .ptab-r{display:flex;justify-content:space-between;gap:12px;padding:11px 0;border-bottom:1px solid var(--line);font-size:16px}
.apw .ptab-r b{font-family:var(--f-head);font-stretch:84%;font-weight:800;font-size:18px;color:var(--ink);white-space:nowrap}
.apw .ptab-n{margin:12px 0 18px;font-size:15px;line-height:1.5;color:var(--mute)}

/* how it works */
.apw .how-g{display:grid;grid-template-columns:minmax(0,1fr);gap:34px}
.apw .how-l .vsw{margin-top:26px}
.apw .how-cap{margin:10px 0 0;font-size:15px;line-height:1.4;color:var(--mute)}
.apw .how-ph{margin-top:26px}
.apw .step-ph{max-width:460px;margin:16px 0 4px}
/* three photos in a row. On a phone they slide sideways inside their own strip */
.apw .band{padding:64px 0 0}
.apw .band-l{display:grid;grid-auto-flow:column;grid-auto-columns:74%;gap:12px;margin:0;padding:0 20px 6px;list-style:none;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none}
.apw .band-l::-webkit-scrollbar{display:none}
.apw .band-l li{scroll-snap-align:center}
.apw .band .pho figcaption{margin-top:12px;font-size:16px;color:var(--ink2)}
.apw .band .pho b{display:block;font-family:var(--f-head);font-stretch:86%;font-weight:800;font-size:21px;line-height:1.15;color:var(--ink)}
.apw .band .pho span{display:block;margin-top:3px}
.apw .steps{list-style:none;margin:0;padding:0;counter-reset:s}
.apw .steps>li{display:grid;grid-template-columns:50px minmax(0,1fr);column-gap:14px;padding:22px 0 24px;border-top:1px solid var(--line);counter-increment:s}
.apw .steps>li:last-child{border-bottom:1px solid var(--line)}
.apw .steps>li::before{content:counter(s);font-family:var(--f-head);font-stretch:66%;font-weight:900;font-size:62px;line-height:.8;color:var(--accent)}
.apw .steps h3{margin:0;font-family:var(--f-head);font-stretch:86%;font-weight:800;font-size:24px;line-height:1.1;color:var(--ink)}
.apw .steps p{margin:8px 0 0;font-size:17px;line-height:1.5;color:var(--ink2)}
.apw .steps .bub-c{margin-top:6px;font-size:14px;color:var(--mute)}
.apw .print-b{width:min(100%,420px);margin:18px 0 6px 4px;transform:rotate(-1.4deg)}
.apw .print-b img{aspect-ratio:16/10}
.apw .print-b .stamp{right:-10px;bottom:56px;font-size:18px}

/* what you get with every visit */
.apw .ck-g{display:grid;grid-template-columns:minmax(0,1fr);gap:28px}
.apw .ck{display:grid;margin:0;padding:0;list-style:none;border-top:1px solid var(--line)}
.apw .ck li{display:grid;grid-template-columns:28px minmax(0,1fr);column-gap:14px;align-items:start;padding:16px 0 17px;border-bottom:1px solid var(--line)}
.apw .ck svg{display:block;width:28px;height:28px;color:var(--accent)}
.apw .ck b{display:block;font-family:var(--f-head);font-stretch:86%;font-weight:800;font-size:21px;line-height:1.15;color:var(--ink)}
.apw .ck span{display:block;margin-top:4px;font-size:16px;line-height:1.45;color:var(--ink2)}

/* the owner */
.apw .own{display:grid;grid-template-columns:minmax(0,1fr);gap:22px}
.apw .own-t p{margin:0 0 14px;max-width:34em;font-size:18px;line-height:1.55;color:var(--ink2)}
.apw .own-t p:first-child{color:var(--ink)}
.apw .own-t .tl{margin-top:2px}
.apw .own-ph{max-width:420px}
.apw .own-t .h2{margin-bottom:20px}

/* areas we serve */
.apw .wh{display:grid;grid-template-columns:minmax(0,1fr);gap:26px}
.apw .wh-c .tl{margin-top:18px}

/* questions */
.apw .qs-h .lead{max-width:30em}
.apw .qs-l{margin-top:26px}
.apw .qs-c{margin-top:24px}
.apw .qs-c .btn{display:inline-flex}

/* last call, with the desert at the bottom */
.apw .cta{position:relative;overflow:hidden;padding:92px 20px 0;background:var(--bg);color:var(--ink);text-align:center}
.apw .cta-h{font-size:clamp(56px,17.4vw,84px);color:var(--ink)}
.apw .cta .btn{max-width:420px;margin:28px auto 0}
.apw .cta .hero-call{margin-top:8px}
.apw .cta-s{margin:2px 0 0;font-size:15px;line-height:1.5;color:var(--mute)}
.apw .sky{margin:44px -20px 0}
.apw .sky svg{display:block;width:100%;height:clamp(130px,19vw,240px)}
.apw .cta-ph{max-width:1200px;margin:0 auto 48px}
.apw .cta-ph img{aspect-ratio:16/10;object-position:30% 42%}
.skm1{fill:#2B3468}.skm2{fill:#1E2650}.skg{fill:#2A2F4A}

/* town pages */
.apw .crumb{display:flex;flex-wrap:wrap;gap:4px 8px;margin:0 0 18px;font-size:15px;line-height:1.4;color:var(--mute)}
.apw .crumb a{color:var(--ink2);font-weight:700;text-decoration:none}
.apw .crumb a:hover{text-decoration:underline}
.apw .h1-city{font-size:clamp(44px,14.4vw,64px)}
.apw .hero-m{order:6;margin:34px -20px 0}
.apw .hero-m .map{margin:0}
.apw .hero-m .mkey{margin:14px 20px 0}
.apw .hero-town{padding-bottom:34px}
.apw .cp{margin:14px 0 0;font-size:17px;line-height:1.6;color:var(--ink2)}
.apw .cp strong{color:var(--ink)}
.apw .cov .fold-s{margin-top:22px}
.apw .cpr{display:grid;grid-template-columns:minmax(0,1fr);gap:26px}
.apw .cpr-t{margin-top:0}
.apw .cpr-c .btn{margin-top:22px}
.apw .cfact{display:flex;gap:12px;align-items:flex-start;padding:14px 0;border-top:1px solid var(--line)}
.apw .cfact:last-child{border-bottom:1px solid var(--line)}
.apw .cfact>span{display:flex;flex:0 0 auto;margin-top:2px;color:var(--accent)}
.apw .cfact b{display:block;font-size:17px;color:var(--ink)}
.apw .cfact div span{display:block;margin-top:3px;font-size:16px;line-height:1.55;color:var(--ink2)}
.apw .folds{margin-top:26px;border-top:1px solid var(--line)}
.apw .fold{border-bottom:1px solid var(--line)}
.apw .fold>summary{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:66px;padding:10px 0}
.apw .fold>summary::after{content:"";flex:0 0 10px;width:10px;height:10px;margin-right:6px;border-right:2.5px solid var(--accent);border-bottom:2.5px solid var(--accent);transform:rotate(45deg);transition:transform .2s}
.apw .fold[open]>summary::after{transform:rotate(-135deg)}
.apw .fold-h{margin:0;font-family:var(--f-head);font-stretch:88%;font-weight:750;font-size:21px;line-height:1.2;color:var(--ink)}
.apw .foldb{max-width:820px;padding:4px 0 26px}
.apw .foldb .hcards,.apw .foldb.lfb,.apw .foldb .zipgs,.apw .foldb .inc-l{margin-top:0}
.apw .foldb .hcards{grid-template-columns:minmax(0,1fr)}
.apw .foldb>.cp:first-child{margin-top:0}
.apw .fold-s{border-top:1px solid var(--line)}
.apw .fold-s>summary{min-height:56px;font-size:17px;font-weight:700;color:var(--ink)}
.apw .nb-l{display:grid;gap:10px;margin-top:24px}
.apw .nb-l .btn{justify-content:space-between;padding:0 20px}
.apw .nb-l .btn span{color:var(--accent)}
.apw .nb-n{margin:16px 0 0;font-size:15px;line-height:1.5;color:var(--mute)}

/* footer */
.apw .ftr{padding:56px 20px 44px;background:#070B1B;color:#FFFFFF}
.apw .flogo{display:block;width:240px;max-width:100%;height:auto}
.apw .fg3{display:grid;grid-template-columns:minmax(0,1fr);gap:38px}
.apw .fnav{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.apw .fnav>div{display:flex;flex-direction:column}
.apw .fhd{margin:0 0 10px;font-family:var(--f-head);font-stretch:86%;font-weight:800;font-size:21px;line-height:1.1;color:#FFFFFF}
.apw .flink{display:flex;align-items:center;min-height:44px;color:#D5DAF0;font-size:16px;text-decoration:none}
.apw .flink:hover{color:#FFFFFF;text-decoration:underline}
.apw .fcon{display:grid;gap:2px;margin:22px 0 0;padding:0;list-style:none}
.apw .fcon a,.apw .fcon .fcon-t{display:flex;align-items:center;gap:12px;min-height:44px;color:#F6F4EF;font-size:17px;font-weight:700;text-decoration:none}
.apw .fcon svg{flex:0 0 22px;color:#FF4A1C;stroke:currentColor}
.apw .fcon a:hover span{text-decoration:underline}
.apw .fpay{margin:0;font-size:16px;line-height:1.6;color:#D5DAF0}
.apw .fpay a{color:#F6F4EF;font-weight:700;text-decoration:underline;text-decoration-thickness:2px;text-underline-offset:4px;text-decoration-color:#FF4A1C}
.apw .fhd-2{margin-top:26px}
.apw .fmarks{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.apw .fmarks img{height:38px;width:auto;display:block;border-radius:6px}
.apw .fmarks+.fmarks{margin-top:8px}
.apw .fsoc{display:flex;flex-wrap:wrap;gap:12px;margin-top:22px}
.apw .fsoc a,.apw .fsoc span{display:block}
.apw .fsoc img{width:38px;height:38px;display:block}
.apw .fseals{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px 12px;margin-top:42px;padding-top:30px;border-top:1px solid rgba(255,255,255,.14)}
.apw .fseal{display:flex;align-items:center;gap:10px;margin:0;min-width:0}
.apw .fseal b{display:block;font-family:var(--f-head);font-stretch:86%;font-weight:800;font-size:19px;line-height:1.05;color:#FFFFFF}
.apw .fseal small{display:block;margin-top:3px;font-size:14px;line-height:1.25;color:#AEB5D8}
.apw .fproof{display:flex;align-items:center;margin:0}
.apw .fproof a{display:inline-flex;align-items:center;min-height:44px;color:#F6F4EF;font-size:16px;font-weight:700;text-decoration:underline;text-decoration-thickness:2px;text-underline-offset:5px;text-decoration-color:#FF4A1C}
.apw .ffam{grid-column:1 / -1;display:flex;align-items:center;gap:12px;margin:8px 0 0;font-family:var(--f-head);font-stretch:74%;font-weight:850;font-size:34px;line-height:1;color:#FFFFFF}
.apw .ffam svg{flex:0 0 auto;width:38px;height:38px}
.apw .flegal{display:flex;flex-wrap:wrap;gap:0 20px;margin-top:26px}
.apw .fcopy{margin:14px 0 0;font-size:14px;line-height:1.6;color:#AEB5D8}

@media (max-height:600px) and (max-width:1023px){.apw .hero-h1{font-size:44px}.apw .hero{padding-top:16px}}
@media (min-width:760px){
.apw .band-l{grid-auto-flow:row;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px;max-width:1280px;margin:0 auto;padding:0 20px;overflow:visible}
.apw .ck{grid-template-columns:repeat(2,minmax(0,1fr));column-gap:56px}
.apw .seals-l{grid-template-columns:repeat(4,minmax(0,1fr));max-width:none}
.apw .fseals{grid-template-columns:repeat(4,auto);justify-content:start;gap:22px 40px}
}
@media (min-width:1024px){
.apw .in{max-width:1200px}
.apw .sec{padding:132px 40px 0}
.apw .h2{font-size:clamp(60px,5.6vw,80px)}
.apw .lead{font-size:20px}
.apw .hero{padding:64px 40px 0}
.apw .hero-g{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr);grid-template-areas:"t v" "p v" "c v" "s v" "r v" ". v";grid-template-rows:auto auto auto auto auto 1fr;column-gap:56px}
.apw .hero-h1{grid-area:t;font-size:clamp(84px,8.1vw,118px)}
.apw .hero-p{grid-area:p;max-width:29em;margin-top:30px;font-size:21px}
.apw .hero-cta{grid-area:c;flex-direction:row;align-items:center;gap:24px;margin-top:34px}
.apw .hero-cta .btn{min-height:66px;padding:0 32px;font-size:23px}
.apw .hero-call{justify-content:flex-start;font-size:18px}
.apw .hero-sm{grid-area:s;margin-top:14px;text-align:left}
.apw .hero .grv{grid-area:r}
.apw .hero-v{grid-area:v;align-self:end;margin:0;padding:6px 20px 70px}
.apw .sun{top:26%;width:min(128%,640px)}
.apw .hero-ph{width:min(86%,430px)}
.apw .print-a{left:0;bottom:120px;width:230px;padding:8px 8px 0}
.apw .print-a .stamp{right:-16px;bottom:38px;font-size:15px}
.apw .print-a .print-c b{font-size:13px}
.apw .print-a .print-c span{display:block;font-size:7.5px;letter-spacing:.1em;white-space:nowrap}
.apw .hero-v figcaption{margin-top:24px;font-size:17px}
.apw .seals-l{max-width:1280px;padding:26px 40px;grid-template-columns:repeat(4,auto) 1fr;gap:24px;align-items:center}
.apw .seals-l .seals-go{grid-column:auto;justify-self:end}
.apw .seal-i{flex-basis:46px;width:46px;height:46px}
.apw .seals-l b{font-size:19px}
.apw .promise{padding:96px 40px 100px}
.apw .promise-g{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(0,1fr);column-gap:64px;align-items:end}
.apw .promise-h{font-size:clamp(120px,12.6vw,188px)}
.apw .promise-t{margin:0 0 6px}
.apw .promise-t p{font-size:20px}
.apw .promise-g{grid-template-columns:minmax(0,1fr) minmax(0,400px);grid-template-areas:"h p" "t p";align-items:start;row-gap:34px}
.apw .promise-h{grid-area:h;font-size:clamp(112px,11.4vw,168px)}
.apw .promise-t{grid-area:t}
.apw .promise-ph{grid-area:p;align-self:center;max-width:none;margin:0}
.apw .pr-deal{margin-top:40px}
.apw .pr-g{grid-template-columns:minmax(0,1fr) minmax(0,1fr);column-gap:88px;margin-top:44px;align-items:start}
.apw .pr-total b{font-size:148px}
.apw .pr-sum>.btn{min-height:64px;font-size:22px}
.apw .how-g{grid-template-columns:minmax(0,1fr) minmax(0,1fr);column-gap:88px;align-items:start}
.apw .how-l{position:sticky;top:124px}
.apw .how-l .vsw{margin-top:34px}
.apw .steps>li{grid-template-columns:70px minmax(0,1fr);padding:26px 0 30px}
.apw .steps>li::before{font-size:84px}
.apw .steps h3{font-size:28px}
.apw .steps p{font-size:18px}
.apw .how-ph{margin-top:34px}
.apw .band{padding:120px 0 0}
.apw .band-l{gap:28px;padding:0 40px}
.apw .own{align-items:center}
.apw .own-ph{max-width:none}
.apw .own-t .h2{margin-bottom:26px}
.apw .cta-ph{margin-bottom:84px}
.apw .cta-ph img{aspect-ratio:21/9}
.apw .ck-g,.apw .own{grid-template-columns:minmax(0,.8fr) minmax(0,1.6fr);column-gap:72px;align-items:start}
.apw .own-t p{font-size:20px}
.apw .ck b{font-size:22px}
.apw .wh{grid-template-columns:minmax(0,.86fr) minmax(0,1.14fr);grid-template-areas:"h m" "c m" "c s";grid-template-rows:auto auto 1fr;column-gap:72px;row-gap:0}
.apw .wh-h{grid-area:h}
.apw .wh-c{grid-area:c}
.apw .wh>.map{grid-area:m;align-self:start}
.apw .wh-s{grid-area:s}
.apw .wh-s .soon{margin-top:30px;padding-top:0;border-top:0}
.apw .wh-s .soon-b{display:inline-flex;width:auto;min-width:260px}
.apw .qs-l{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:72px;align-items:start;margin-top:44px}
.apw .qcol{border-top:1px solid var(--line)}
.apw .qb{font-size:21px}
.apw .qs-c{margin-top:34px}
.apw .cta{padding:150px 40px 0}
.apw .cta-h{font-size:clamp(104px,10.4vw,160px)}
.apw .cta .btn{display:inline-flex;min-width:340px;min-height:66px;margin-top:36px;font-size:23px}
.apw .cta .hero-call{justify-content:center;margin-top:12px;font-size:19px}
.apw .sky{margin:64px -40px 0}
.apw .h1-city{font-size:clamp(76px,7.3vw,106px)}
.apw .hero-town{padding-bottom:84px}
.apw .hero-m{grid-area:v;align-self:center;margin:0}
.apw .hero-m .map{border-radius:6px}
.apw .hero-m .mkey{margin:14px 0 0}
.apw .cov{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);column-gap:88px;align-items:start}
.apw .cov .cp{font-size:19px}
.apw .cpr{grid-template-columns:minmax(0,1fr) minmax(0,1fr);column-gap:88px;align-items:start}
.apw .cpr-c .btn{display:inline-flex;min-width:300px}
.apw .near{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);column-gap:88px;align-items:start}
.apw .nb-l{margin-top:0}
.apw .ftr{padding:84px 40px 52px}
.apw .fg3{grid-template-columns:minmax(0,1.1fr) minmax(0,1.2fr) minmax(0,1fr);gap:64px}
.apw .fseals{grid-template-columns:repeat(4,auto);gap:26px 40px;align-items:center}
.apw .ffam{margin:10px 0 0;font-size:44px}
}
@media (min-width:1240px){.apw .seals-l{gap:44px}.apw .seals-l b{font-size:20px}}
@media (prefers-reduced-motion:reduce){.apw .fold>summary::after{transition:none}}
""")

# long form town pages: neighborhood cards, guide sections, sources
LF_CSS = _min(r"""
.apw .hcards{display:grid;grid-template-columns:minmax(0,1fr);margin-top:20px;border-top:1px solid var(--line)}
.apw .hcard{display:flex;flex-direction:column;padding:18px 0 20px;border-bottom:1px solid var(--line)}
.apw .hcard h3{margin:0;font-family:var(--f-head);font-stretch:88%;font-weight:750;font-size:21px;line-height:1.2;color:var(--ink)}
.apw .hcard .hz{align-self:flex-start;margin:6px 0 0;font-size:15px;font-weight:700;color:var(--accent-text)}
.apw .hcard p{margin:10px 0 0;font-size:16px;line-height:1.55;color:var(--ink2)}
.apw .hcard p.hz{margin-top:6px}
.apw .lfb{margin-top:24px}
.apw .lfb h3{margin:30px 0 0;font-family:var(--f-head);font-stretch:88%;font-weight:750;font-size:22px;line-height:1.2;color:var(--ink)}
.apw .lfb h3:first-child{margin-top:0}
.apw .lfb p{margin:10px 0 0;font-size:17px;line-height:1.6;color:var(--ink2)}
.apw .lfb ul{margin:12px 0 0;padding-left:22px;font-size:17px;line-height:1.6;color:var(--ink2)}
.apw .lfb li{margin-top:6px}
.apw .lfb li::marker{color:var(--accent)}
.apw .lfb strong{color:var(--ink)}
.apw .lfb ul.src{font-size:15px;line-height:1.5}
.apw .lfb .upd{margin-top:18px;font-size:14px;color:var(--mute)}
@media (min-width:1024px){.apw .lfb{margin-top:0}.apw .lfb p,.apw .lfb ul{font-size:18px}.apw .lfb ul.src{font-size:15px}}
""")


def seal_svg(cls='seal-i', glyph='check'):
    """The round seal for Bonded, Insured and Background checked: an orange notary style rosette with a navy check."""
    import math
    n, r, rb = 14, 19.2, 4.4
    mark = ('<path d="M24 33.4c-5.6-4-8.8-7-8.8-10.6a5 5 0 0 1 8.8-3.2 5 5 0 0 1 8.8 3.2c0 3.600-3.200 6.600-8.800 10.600z" fill="#0A0F24"></path>' if glyph == 'heart'
            else '<path d="M16.2 24.6l5.4 5.4 10.4-11.2" fill="none" stroke="#0A0F24" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></path>')
    bumps = ''.join('<circle cx="%.2f" cy="%.2f" r="%.1f"></circle>' % (24 + r * math.cos(2 * math.pi * i / n), 24 + r * math.sin(2 * math.pi * i / n), rb) for i in range(n))
    return ('<svg class="%s" viewBox="0 0 48 48" aria-hidden="true"><g fill="#FF4A1C"><circle cx="24" cy="24" r="19.6"></circle>%s</g>'
            '<circle cx="24" cy="24" r="15.4" fill="none" stroke="#0A0F24" stroke-width="1.3" opacity=".5"></circle>'
            '%s</svg>' % (cls, bumps, mark))

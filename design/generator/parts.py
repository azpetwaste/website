"""Shared parts for the v2 boards: theme tokens, the animated visit scene and its timeline logic.
build.py swaps every @@NAME@@ in a template for the matching string here."""

FONTS = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@800&amp;family=IBM+Plex+Mono:wght@400;500;600&amp;family=Schibsted+Grotesk:wght@400;500;600;700;800;900&amp;display=swap">'

BASE_CSS = r"""body{margin:0;background:#070B1B}
*{box-sizing:border-box}
.apw{--bg:#FFFFFF;--bg2:#F6F4EF;--bg3:#E4EEF8;--card:#FFFFFF;--ink:#0E1430;--ink2:#3E4668;--mute:#4A5272;--line:#E2DDD2;--field:#8A91B0;--accent:#FF4A1C;--accent-hi:#FF6B42;--accent-ink:#0E1430;--accent-text:#B02A08;--accent-soft:#FFE1D6;--ok:#1E7A52;--ok-soft:#E3F1EA;--band:#0A0F24;--band2:#111936;--shadow:0 14px 34px rgba(10,15,36,.14);font-family:"Schibsted Grotesk",ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
.apw.dark{--bg:#0A0F24;--bg2:#0E1530;--bg3:#101A38;--card:#141D3D;--ink:#F6F4EF;--ink2:#D5DAF0;--mute:#AEB5D8;--line:rgba(255,255,255,.13);--field:#6B7398;--accent-text:#FF8A66;--accent-soft:rgba(255,74,28,.16);--ok:#4CC38A;--ok-soft:rgba(76,195,138,.15);--band:#070B1B;--band2:#111936;--shadow:0 14px 34px rgba(0,0,0,.45)}
.apw a{color:var(--accent-text)}
.mono{font-family:"IBM Plex Mono",ui-monospace,Consolas,monospace}
.wm{font-family:"Archivo","Arial Black",sans-serif;font-weight:800;text-transform:uppercase;letter-spacing:.045em;line-height:1}
.eb{margin:0;font-family:"IBM Plex Mono",ui-monospace,Consolas,monospace;font-size:13px;font-weight:600;letter-spacing:.09em;text-transform:uppercase;color:var(--accent-text)}
.h1{margin:0;font-weight:800;letter-spacing:-.05em;line-height:.95;text-wrap:balance}
.h2{margin:10px 0 0;font-size:34px;font-weight:800;letter-spacing:-.045em;line-height:1;text-wrap:balance}
.lead{margin:12px 0 0;font-size:17px;line-height:1.55;color:var(--ink2)}
.btn{display:flex;align-items:center;justify-content:center;gap:10px;min-height:56px;padding:0 24px;border-radius:999px;border:1.6px solid transparent;font:inherit;font-size:18px;font-weight:700;line-height:1;cursor:pointer;text-decoration:none;white-space:nowrap}
.btn:disabled{opacity:.45;cursor:not-allowed}
.apw .btn-dot{background:var(--accent);color:var(--accent-ink)}.apw .btn-dot:hover{background:var(--accent-hi);color:var(--accent-ink)}
.apw .btn-ink{background:var(--ink);color:var(--bg)}
.apw .btn-line{background:transparent;color:var(--ink);border-color:var(--field)}
.apw .btn-line-n{background:transparent;color:#FFFFFF;border-color:rgba(255,255,255,.3)}
.apw .btn-pay{background:#000000;color:#FFFFFF;border-color:#000000}
.apw.dark .btn-pay{border-color:rgba(255,255,255,.4)}
.ibtn{width:48px;height:48px;flex:0 0 48px;display:grid;place-items:center;border-radius:50%;border:1.6px solid var(--line);background:transparent;color:var(--ink);cursor:pointer;padding:0;text-decoration:none}
.apw .ibtn-n{border-color:rgba(255,255,255,.24);color:#F6F4EF}
.ldot{display:inline-block;width:9px;height:9px;flex:0 0 9px;border-radius:50%;background:#FF4A1C;animation:apwBlink 1.6s ease-out infinite}
details>summary{list-style:none;cursor:pointer}details>summary::-webkit-details-marker{display:none}
.chev{transition:transform .2s ease}details[open]>summary .chev{transform:rotate(45deg)}
@keyframes apwBlink{0%{box-shadow:0 0 0 0 rgba(255,74,28,.6)}70%{box-shadow:0 0 0 8px rgba(255,74,28,0)}100%{box-shadow:0 0 0 0 rgba(255,74,28,0)}}
@media (prefers-reduced-motion:reduce){.ldot{animation:none}}
input:focus-visible,button:focus-visible,a:focus-visible,summary:focus-visible,textarea:focus-visible,ul:focus-visible{outline:3px solid #FF6B42;outline-offset:2px}"""

# ---------- the visit scene lives in scene.py ----------
import truemap  # noqa: E402
from scene import SCENE, SCENE_CTL, SCENE_CSS, VS_METHODS, VS_STATE, BLOB_LOGO, BLOB_LOGO_DARK, BLOB_MARK, BLOB_MARK_DARK, TRUCK_LOGO  # noqa: E402

ICON_CHECK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"></path></svg>'

# ---------- logic shared by the boards ----------
THEME_METHODS = r"""  _themeFromProps() {
    const pt = this.props.theme || 'light';
    if (pt === 'dark') return true;
    if (pt === 'auto' && typeof window !== 'undefined' && window.matchMedia) return window.matchMedia('(prefers-color-scheme: dark)').matches;
    return false;
  }
  _themeInit() {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    this._mq = window.matchMedia('(prefers-color-scheme: dark)');
    this._mqf = () => { if ((this.props.theme || 'light') === 'auto') this.setState({ dark: this._mq.matches }); };
    if (this._mq.addEventListener) this._mq.addEventListener('change', this._mqf);
  }
  _themeStop() {
    if (this._mq && this._mq.removeEventListener) this._mq.removeEventListener('change', this._mqf);
  }
  componentDidUpdate(prev) {
    if (prev.theme !== this.props.theme) this.setState({ dark: this._themeFromProps() });
  }
  _themeVals() {
    const d = !!this.state.dark;
    return {
      themeClass: d ? 'dark' : 'light',
      isDark: d,
      isLight: !d,
      themeLabel: d ? 'Switch to the light look' : 'Switch to the dark look',
      themeMenuLabel: d ? 'Light look' : 'Dark look',
      toggleTheme: () => this.setState({ dark: !this.state.dark })
    };
  }"""

PRICE_METHODS = r"""  _price(id, dogs) {
    const base = { week: 108, twice: 189, eow: 75 };
    const extra = { week: 13, twice: 13, eow: 9 };
    return base[id] + Math.max(0, dogs - 2) * extra[id];
  }
  _per(id, dogs) {
    const visits = { week: 52 / 12, twice: 104 / 12, eow: 26 / 12 };
    return Math.round(this._price(id, dogs) / visits[id]);
  }
  _cal(id, onBand) {
    const out = [];
    for (let i = 0; i < 28; i++) {
      const d = i % 7;
      const w = Math.floor(i / 7);
      const on = id === 'week' ? d === 2 : id === 'twice' ? (d === 2 || d === 5) : (d === 2 && w % 2 === 0);
      out.push({ bg: on ? '#FF4A1C' : (onBand ? 'rgba(255,255,255,.16)' : 'var(--line)') });
    }
    return out;
  }
  _plans(onBand) {
    const s = this.state;
    const names = { week: 'Every week', twice: 'Twice a week', eow: 'Every other week' };
    return ['week', 'twice', 'eow'].map((id) => {
      const on = s.plan === id;
      return {
        id: id,
        name: names[id],
        price: '$' + this._price(id, s.dogs),
        per: 'About $' + this._per(id, s.dogs) + ' a visit',
        on: on,
        pick: () => this.setState({ plan: id }),
        aria: names[id] + ', $' + this._price(id, s.dogs) + ' a month',
        cal: this._cal(id, onBand),
        border: on ? '#FF4A1C' : (onBand ? 'rgba(255,255,255,.18)' : 'var(--field)'),
        bg: on ? 'rgba(255,74,28,.12)' : 'transparent',
        ring: on ? '#FF4A1C' : (onBand ? '#AEB5D8' : 'var(--mute)'),
        dot: on ? '#FF4A1C' : 'transparent'
      };
    });
  }"""

ICON_SUN = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.5"></circle><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"></path></svg>'
ICON_MOON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"></path></svg>'
THEME_BTN = ('<button type="button" class="ibtn" aria-label="{{ themeLabel }}" onClick="{{ toggleTheme }}">'
             '<sc-if value="{{ isDark }}" hint-placeholder-val="{{ false }}">' + ICON_SUN + '</sc-if>'
             '<sc-if value="{{ isLight }}" hint-placeholder-val="{{ true }}">' + ICON_MOON + '</sc-if></button>')
LOGO_SEAL = ('<sc-if value="{{ isLight }}" hint-placeholder-val="{{ true }}"><img src="' + BLOB_MARK + '" alt="" style="width: 40px; height: 40px; display: block;"></sc-if>'
             '<sc-if value="{{ isDark }}" hint-placeholder-val="{{ false }}"><img src="' + BLOB_MARK_DARK + '" alt="" style="width: 40px; height: 40px; display: block;"></sc-if>')
# the full logo (Arizona state mark with the name beside it) for headers and menus
LOGO_H = ('<sc-if value="{{ isLight }}" hint-placeholder-val="{{ true }}"><img class="lgo" src="' + BLOB_LOGO + '" alt="" width="220" height="67"></sc-if>'
          '<sc-if value="{{ isDark }}" hint-placeholder-val="{{ false }}"><img class="lgo" src="' + BLOB_LOGO_DARK + '" alt="" width="220" height="67"></sc-if>')
ICON_MENU = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"></path></svg>'
ICON_CLOSE = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg>'
ICON_BACK = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6"></path></svg>'
ICON_CHAT = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v11H10l-6 4z"></path></svg>'
ICON_PIN = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11z"></path><circle cx="12" cy="10" r="2.6"></circle></svg>'
ICON_ROWS = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3"></rect><path d="M8.5 12.5l2.5 2.5 5-5.5"></path></svg>'
ICON_SPRAY = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 10h6v10H8z"></path><path d="M9 10V6h4l2 2"></path><path d="M18 5h.01M20.5 7.5h.01M18 10h.01"></path></svg>'
ICON_CAMERA = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"></path><circle cx="12" cy="13" r="3.5"></circle></svg>'
ICON_CHAT22 = ICON_CHAT.replace('width="20" height="20"', 'width="22" height="22"')
ICON_PLUS = '<svg class="chev" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>'
ICON_MINUS20 = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"></path></svg>'
ICON_PLUS20 = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>'
ICON_PHONE = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FF6B42" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h3l2 5-2.5 1.5a11 11 0 0 0 5 5L15 12l5 2v3a2 2 0 0 1-2 2A15 15 0 0 1 4 5a2 2 0 0 1 2-2z"></path></svg>'
ICON_PHONE_INK = ICON_PHONE.replace('stroke="#FF6B42"', 'stroke="currentColor"')
ICON_MAIL = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FF6B42" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18v12H3z"></path><path d="M3 7l9 6 9-6"></path></svg>'
ICON_SMS_O = ICON_CHAT.replace('stroke="currentColor"', 'stroke="#FF6B42"')
ICON_RECEIPT = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"></path><path d="M9 8h6M9 12h6"></path></svg>'
ICON_SHIELD = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"></path><path d="M9 12l2 2 4-4.5"></path></svg>'
ICON_UNLOCK = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V8a4 4 0 0 1 7.5-2"></path></svg>'
ICON_GIFT = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="9" width="16" height="11" rx="1.5"></rect><path d="M12 9v11M4 13h16"></path><path d="M12 9c-2.5 0-4.5-1-4.5-2.7S9.6 4 12 9c2.4-5 4.5-4.4 4.5-2.7S14.5 9 12 9z"></path></svg>'
ICON_HOME = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 11l8-6 8 6v9H4z"></path><path d="M10 20v-5h4v5"></path></svg>'
ICON_ARROW = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"></path></svg>'
STAR = '<svg width="18" height="18" viewBox="0 0 24 24" fill="#FF4A1C" aria-hidden="true"><path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.3L12 17.1l-5.7 3.1 1.2-6.3-4.7-4.4 6.4-.8z"></path></svg>'
STARS = '<span style="display: inline-flex; gap: 2px;" aria-hidden="true">' + STAR * 5 + '</span>'

ICON_LOCK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V8a4 4 0 0 1 8 0v3"></path></svg>'
ICON_CHECK44 = '<svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"></path></svg>'

# ---------- v3 page parts ----------
SITE_CSS = r""".uline{position:relative;white-space:nowrap}
.uline svg{position:absolute;left:-2%;bottom:-.14em;width:104%;height:.32em;overflow:visible}
.uline path{fill:none;stroke:#FF4A1C;stroke-width:4;stroke-linecap:round;stroke-dasharray:320;stroke-dashoffset:320;animation:apwDraw 1s .5s ease-out forwards}
@keyframes apwDraw{to{stroke-dashoffset:0}}
.sticker{position:absolute;z-index:2;display:grid;place-items:center;width:78px;height:78px;border-radius:50%;background:#FF4A1C;color:#0E1430;text-align:center;font-size:13px;font-weight:800;line-height:1.05;text-transform:uppercase;letter-spacing:.02em;box-shadow:0 6px 14px rgba(10,15,36,.22);transform:rotate(9deg);pointer-events:none}
.sticker::after{content:"";position:absolute;inset:5px;border-radius:50%;border:1.5px dashed rgba(14,20,48,.55)}
.route{position:relative;list-style:none;margin:26px 0 0;padding:0}
.route::before{content:"";position:absolute;left:75px;top:10px;bottom:10px;width:2px;background:repeating-linear-gradient(to bottom,#FF4A1C 0 7px,transparent 7px 13px)}
.stop{display:grid;grid-template-columns:64px 24px minmax(0,1fr);align-items:start;padding-bottom:28px}
.stop:last-child{padding-bottom:0}
.stime{padding-top:2px;text-align:right;font-size:13px;font-weight:600;color:var(--accent-text);white-space:nowrap}
.snode{justify-self:center;width:14px;height:14px;margin-top:3px;border-radius:50%;border:3px solid #FF4A1C;position:relative;z-index:1}
.sbody{min-width:0;padding-left:4px}
.sbody h3{margin:0;font-size:19px;font-weight:800;letter-spacing:-.025em;line-height:1.15;color:var(--ink)}
.sbody p{margin:6px 0 0;font-size:16px;line-height:1.5;color:var(--ink2)}
.rdot{position:absolute;left:69px;z-index:2;width:16px;height:16px;margin-top:-8px;border-radius:50%;background:#FF4A1C;box-shadow:0 0 0 3px var(--bg2);transition:top .25s ease-out}
.rdot::after{content:"";position:absolute;inset:-3px;border-radius:50%;border:2px solid #FF4A1C;animation:apwRing 1.8s ease-out infinite}
@keyframes apwRing{0%{transform:scale(1);opacity:.9}100%{transform:scale(2.4);opacity:0}}
.bub{display:inline-block;max-width:100%;margin-top:10px;padding:11px 14px;border-radius:18px 18px 18px 6px;background:var(--card);border:1px solid var(--line);font-size:15px;line-height:1.45;color:var(--ink)}
.minimap{position:relative;margin-top:10px;border-radius:16px;overflow:hidden;border:1px solid var(--line);background:#F3E7D2;aspect-ratio:2/1}
.minimap svg{position:absolute;inset:0;width:100%;height:100%;display:block}
.mmdot{animation:mmDrive 6s ease-in-out infinite}
@keyframes mmDrive{0%{transform:translate(18px,92px)}30%{transform:translate(118px,92px)}55%{transform:translate(118px,40px)}80%,100%{transform:translate(196px,40px)}}
.dogrow{flex:1;min-width:0;display:flex;flex-wrap:wrap;justify-content:center;gap:2px;min-height:44px}
.dogf{display:block;width:40px;height:40px;animation:dogPop .4s cubic-bezier(.3,1.6,.5,1) both}
@keyframes dogPop{from{transform:scale(.2) rotate(-20deg);opacity:0}to{transform:none;opacity:1}}
.cal{display:grid;grid-template-columns:repeat(7,9px);gap:3px}
.cal span{display:block;width:9px;height:9px;border-radius:3px}
.qa{margin-top:10px}
.qa summary{display:flex;justify-content:flex-end}
.qb{margin:0;font-family:inherit;letter-spacing:normal;max-width:86%;padding:12px 16px;border-radius:20px 20px 6px 20px;background:var(--ink);color:var(--bg);font-size:16px;font-weight:600;line-height:1.4}
.qa[open] .qb{background:#FF4A1C;color:#0E1430}
.ab{display:flex;gap:8px;align-items:flex-end;margin-top:8px}
.ab img{width:28px;height:28px;flex:0 0 28px;display:block}
.ab p{margin:0;max-width:86%;padding:12px 16px;border-radius:20px 20px 20px 6px;background:var(--card);border:1px solid var(--line);font-size:16px;line-height:1.5;color:var(--ink)}
.rcpt{position:relative;margin-top:30px;padding:24px 20px 26px;background:#FFFFFF;color:#0E1430}
.rcpt::before,.rcpt::after{content:"";position:absolute;left:0;right:0;height:10px;background-size:14px 10px;background-repeat:repeat-x}
.rcpt::before{top:-10px;background-image:linear-gradient(135deg,transparent 7px,#FFFFFF 7px),linear-gradient(225deg,transparent 7px,#FFFFFF 7px)}
.rcpt::after{bottom:-10px;background-image:linear-gradient(45deg,transparent 7px,#FFFFFF 7px),linear-gradient(315deg,transparent 7px,#FFFFFF 7px)}
.rrow{display:flex;align-items:baseline;gap:8px;padding:9px 0;font-size:16px;font-weight:600}
.rrow i{flex:1;min-width:16px;border-bottom:2px dotted #C9C2B3;transform:translateY(-4px)}
.rrow b{font-family:"IBM Plex Mono",ui-monospace,Consolas,monospace;font-size:14px;font-weight:600;color:#B02A08;white-space:nowrap}
.ph{display:grid;place-items:center;text-align:center;border:1.6px dashed var(--field);background:var(--bg3);color:var(--mute);font-family:"IBM Plex Mono",ui-monospace,Consolas,monospace;font-size:13px;line-height:1.2}
@media (prefers-reduced-motion:reduce){.uline path{animation:none;stroke-dashoffset:0}.rdot::after,.mmdot,.dogf{animation:none}}"""

DOG_SVG = ('<svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">'
           '<ellipse cx="9" cy="17" rx="6" ry="10" fill="currentColor" opacity=".72" transform="rotate(18 9 17)"></ellipse>'
           '<ellipse cx="31" cy="17" rx="6" ry="10" fill="currentColor" opacity=".72" transform="rotate(-18 31 17)"></ellipse>'
           '<circle cx="20" cy="21" r="13" fill="currentColor"></circle>'
           '<ellipse cx="20" cy="27" rx="7.5" ry="5.6" fill="#F6E9D8"></ellipse>'
           '<ellipse cx="20" cy="24.4" rx="3.1" ry="2.2" fill="#1A1414"></ellipse>'
           '<circle cx="14.5" cy="18" r="1.8" fill="#1A1414"></circle><circle cx="25.5" cy="18" r="1.8" fill="#1A1414"></circle>'
           '<path d="M17.4 29.6q2.6 2 5.2 0" stroke="#1A1414" stroke-width="1.4" fill="none" stroke-linecap="round"></path></svg>')

ULINE = '<svg viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden="true"><path vector-effect="non-scaling-stroke" d="M3 8C22 3 44 2 62 5S88 10 97 4"></path></svg>'

MINIMAP = ('<svg viewBox="0 0 220 110" aria-hidden="true">'
           '<g stroke="#FFFFFF" stroke-width="6" fill="none"><path d="M0 92H220M118 0V110M0 40H220M60 0V110M176 0V110"></path></g>'
           '<path d="M18 92H118V40H196" stroke="#FF4A1C" stroke-width="3" fill="none" stroke-dasharray="5 5" stroke-linecap="round"></path>'
           '<g fill="#E8C29A"><rect x="132" y="56" width="16" height="12" rx="2"></rect><rect x="74" y="56" width="18" height="12" rx="2"></rect><rect x="24" y="56" width="16" height="12" rx="2"></rect><rect x="132" y="12" width="18" height="12" rx="2"></rect><rect x="74" y="12" width="18" height="12" rx="2"></rect></g>'
           '<path d="M196 41l-5.5 -8h11z" fill="#0E1430"></path><circle cx="196" cy="29" r="6" fill="#0E1430"></circle><circle cx="196" cy="29" r="2.4" fill="#FFFFFF"></circle>'
           '<g class="mmdot"><circle r="9" fill="#FF4A1C" opacity=".25"></circle><circle r="5" fill="#FF4A1C" stroke="#FFFFFF" stroke-width="2"></circle></g>'
           '</svg>')

SITE_CSS += "\n.routew{position:relative;margin-top:26px}.route{margin:0}\n" + truemap.MAP_CSS

LBS_PER_DOG = '274'

AREA_METHODS = r"""  _zipArea(zip) {
    return ({ '85326': 'buckeye', '85396': 'buckeye', '85338': 'goodyear', '85395': 'goodyear', '85340': 'litchfield', '85355': 'citrus' })[zip] || '';
  }
  _checkZip() {
    this.setState({ zipChecked: true, area: this._zipArea(this.state.zip) });
  }
  _areaVals() {
    const s = this.state;
    const areas = {
      buckeye: { name: 'Buckeye', meta: 'BUCKEYE · ZIP 85326 AND 85396' },
      verrado: { name: 'Verrado', meta: 'VERRADO · BUCKEYE · ZIP 85396' },
      citrus: { name: 'Citrus Park', meta: 'CITRUS PARK · WADDELL · ZIP 85355' },
      goodyear: { name: 'Goodyear', meta: 'GOODYEAR · ZIP 85338 AND 85395' },
      litchfield: { name: 'Litchfield Park', meta: 'LITCHFIELD PARK · ZIP 85340' }
    };
    const pin = (id) => {
      const on = s.area === id;
      return { on: on, bg: on ? 'var(--ink)' : 'var(--card)', fg: on ? 'var(--bg)' : 'var(--ink)', pick: () => this.setState({ area: id, zip: '', zipChecked: false }) };
    };
    const blob = (id) => (s.area === id ? (s.dark ? 'rgba(255,74,28,.58)' : 'rgba(255,74,28,.42)') : 'rgba(255,74,28,0)');
    const a = areas[s.area];
    const byZip = s.zipChecked && !!this._zipArea(s.zip);
    return {
      mB: pin('buckeye'), mV: pin('verrado'), mC: pin('citrus'), mG: pin('goodyear'), mL: pin('litchfield'),
      bB: blob('buckeye'), bV: blob('verrado'), bC: blob('citrus'), bG: blob('goodyear'), bL: blob('litchfield'),
      areaOn: !!a,
      areaName: byZip ? 'ZIP ' + s.zip : (a ? a.name : ''),
      areaMeta: a ? a.meta : '',
      zip: s.zip,
      onZip: (e) => this.setState({ zip: String(e.target.value || '').replace(/\D/g, '').slice(0, 5), zipChecked: false }),
      zipKey: (e) => { if (e.key === 'Enter') this._checkZip(); },
      checkZip: () => this._checkZip(),
      zipNo: s.zipChecked && s.zip.length === 5 && !this._zipArea(s.zip),
      zipShort: s.zipChecked && s.zip.length < 5
    };
  }"""

MAP = truemap.build('mV.pick', 'mC.pick', 'mG.pick', 'mL.pick', 'mB.pick')
SOON_NOTE = ('<div class="soon">'
             '<p class="soon-h mono">COMING SOON</p>'
             '<p class="soon-l">Surprise, Peoria, Glendale, Laveen, the Central and East Valley, Tucson, Flagstaff, Kingman and Lake Havasu City.</p>'
             '<p class="soon-p"><b>We don’t come to you yet?</b> Let us know. Join the waitlist by November 30 with your name, phone and address, and lock in your free month.</p>'
             '<a href="Booking.dc.html" class="btn btn-line soon-b">Join the waitlist</a>'
             '</div>')
SITE_CSS += ('\n.soon{margin-top:18px;padding:16px;border-radius:18px;background:var(--card);border:1.6px dashed var(--field)}'
             '.soon-h{margin:0;font-size:13px;font-weight:600;letter-spacing:.1em;color:var(--accent-text)}'
             '.soon-l{margin:6px 0 0;font-size:16px;font-weight:700;line-height:1.45;color:var(--ink)}'
             '.soon-p{margin:8px 0 0;font-size:15px;line-height:1.5;color:var(--ink2)}'
             '.soon-b{margin-top:14px;width:100%}')
MAP_KEY = truemap.MAP_KEY
MAP_CHIPS = '''  <div class="mchips" role="group" aria-label="Towns we scoop">
    <button type="button" class="mchip" style="background: {{ mB.bg }}; color: {{ mB.fg }};" aria-pressed="{{ mB.on }}" onClick="{{ mB.pick }}"><i></i>Buckeye</button>
    <button type="button" class="mchip" style="background: {{ mG.bg }}; color: {{ mG.fg }};" aria-pressed="{{ mG.on }}" onClick="{{ mG.pick }}"><i></i>Goodyear</button>
    <button type="button" class="mchip" style="background: {{ mL.bg }}; color: {{ mL.fg }};" aria-pressed="{{ mL.on }}" onClick="{{ mL.pick }}"><i></i>Litchfield Park</button>
    <button type="button" class="mchip" style="background: {{ mC.bg }}; color: {{ mC.fg }};" aria-pressed="{{ mC.on }}" onClick="{{ mC.pick }}"><i></i>Citrus Park</button>
    <button type="button" class="mchip" style="background: {{ mV.bg }}; color: {{ mV.fg }};" aria-pressed="{{ mV.on }}" onClick="{{ mV.pick }}"><i></i>Verrado</button>
  </div>'''

from scene import saguaro, agave, barrel  # noqa: E402

FAQ_ITEMS = [
    ('How much does it cost?', 'Weekly pickup is $108 a month for 1 or 2 dogs. That is about $25 a visit. Your first month is free when you sign up for any plan.'),
    ('Is the spray really free?', 'Yes. At every visit, we spray deodorizer on the spots your dogs use most. It costs you nothing.'),
    ('Do you come in the summer heat?', 'Yes. In summer we start early, so your yard is done before the worst heat of the day.'),
    ('What if it storms?', 'Light rain is fine. If there is lightning, we wait until it is safe. We text you if your time changes.'),
    ('Do you clean artificial turf?', 'Yes. We pick up every pile and spray the spots your dogs use most. Turf can smell in the heat. For a deep clean, add a turf odor treatment for $35.'),
    ('Where does the poop go?', '[Pick one: We bag it and take it with us. Or we bag it and put it in your trash can.]'),
    ('Are you licensed and insured?', 'Yes. Arizona Pet Waste is licensed and insured.'),
    ('Do you clean your tools?', 'Yes. We clean our boots and tools before every yard. That keeps germs from going from yard to yard.'),
    ('Can I pick my day?', 'No. We set your day for you. We run set routes, and that keeps our prices down. After you sign up, we reach out to let you know your day and time. Then you get a text the night before each visit with a 30 minute window.'),
    ('Can you come today? We have a party.', 'Yes. Text us and we can come the same day for $49. It goes on your next bill on the 1st.'),
    ('When do you charge my card?', 'On the 1st of each month. Your first month is free. Your first charge only covers the days after your free month, so it is smaller. Then you pay the full price on the 1st of each month.'),
    ('Who sees my gate code?', 'Only your scooper, and only on your day. You add it after you sign up. If you cancel, we delete it.'),
    ('What if a dog in the yard is not safe to be near?', 'We don’t go in. We text you to bring the dog inside. We can come back the same day.'),
    ('Can I skip a week?', 'Yes. You get 4 free skips a year. Tell us 24 hours before. It is one tap in My Yard.'),
    ('Can I pause while we are away?', 'Yes. Pause for up to 120 days in My Yard. You don’t pay while you are paused.'),
    ('How do I cancel?', 'Tap cancel in My Yard. There is no contract and no phone call.'),
    ('My yard is rock, not grass.', 'Rock can hide poop. So we rake rock yards with a wide metal rake.'),
]
_seal28 = ('<sc-if value="{{ isLight }}" hint-placeholder-val="{{ true }}"><img src="' + BLOB_MARK + '" alt=""></sc-if>'
           '<sc-if value="{{ isDark }}" hint-placeholder-val="{{ false }}"><img src="' + BLOB_MARK_DARK + '" alt=""></sc-if>')


def faq(items):
    return '\n    '.join('<details class="qa"><summary><h3 class="qb">%s</h3></summary><div class="ab">%s<p>%s</p></div></details>' % (q, _seal28, a) for q, a in items)


FAQ = faq(FAQ_ITEMS)

TRUCK_STATIC = (
    '<rect x="0" y="176" width="52" height="22" rx="2.5" fill="#FFFFFF" stroke="#0A0F24" stroke-width="1"></rect>'
    '<rect x=".5" y="194" width="51" height="2.4" fill="#FF4A1C"></rect>'
    '<path d="M52 198V178Q52 172 58 172H74Q78 172 80.5 176L87 185 91 186Q93 187 93 190V198Z" fill="#FFFFFF" stroke="#0A0F24" stroke-width="1"></path>'
    '<path d="M58 175H73.5L78.5 184H58Z" fill="#1A2552"></path>'
    + TRUCK_LOGO +
    '<circle cx="15" cy="199.5" r="7" fill="#0A0F24"></circle><circle cx="15" cy="199.5" r="3" fill="#C9C3B6"></circle>'
    '<circle cx="76" cy="199.5" r="7" fill="#0A0F24"></circle><circle cx="76" cy="199.5" r="3" fill="#C9C3B6"></circle>'
)

SKYLINE = ('<svg viewBox="0 0 390 130" aria-hidden="true" style="display: block; width: 100%; height: auto;">'
           '<circle cx="300" cy="58" r="24" fill="#FF4A1C"></circle>'
           '<path class="skm1" d="M0 98L24 84 40 88 58 72 74 80 92 62 108 70 124 58 142 70 160 66 178 78 196 70 214 82 236 74 258 86 282 80 306 92 330 84 352 94 372 88 390 96V130H0Z"></path>'
           '<path class="skm2" d="M0 110L30 104 60 108 96 100 130 106 170 102 210 108 250 102 290 108 330 104 360 108 390 105V130H0Z"></path>'
           '<rect class="skg" x="0" y="112" width="390" height="18"></rect>'
           + saguaro(44, 118, 66) + saguaro(344, 118, 54, .9, True) + saguaro(372, 118, 36, .7) + agave(84, 121) + barrel(312, 121) + agave(258, 121, .8) +
           '<g transform="translate(150 -78)">' + TRUCK_STATIC + '</g>'
           '</svg>')

SITE_CSS += "\n.skm1{fill:#DCD6EA}.dark .skm1{fill:#2B3468}.skm2{fill:#BCB5D6}.dark .skm2{fill:#1E2650}.skg{fill:#EBD9B8}.dark .skg{fill:#2A2F4A}"

_th = 'class="mono" style="padding: 10px 0; text-align: right; font-size: 13px; font-weight: 600; color: #AEB5D8; border-bottom: 1px solid rgba(255,255,255,.16);"'
_td = 'style="padding: 12px 0; text-align: right; border-bottom: 1px solid rgba(255,255,255,.10);"'
_rh = 'scope="row" style="padding: 12px 0; text-align: left; font-weight: 700; border-bottom: 1px solid rgba(255,255,255,.10);"'


def _xrow(a, b, last=False):
    return ('<div style="display: flex; justify-content: space-between; gap: 12px; padding: 11px 0;%s font-size: 15px;"><span>%s</span><span class="mono" style="font-weight: 600; color: #FF8A66; white-space: nowrap;">%s</span></div>'
            % ('' if last else ' border-bottom: 1px solid rgba(255,255,255,.10);', a, b))


PRICE_TABLE = (
    '<table style="width: 100%; border-collapse: collapse; font-size: 15px; color: #FFFFFF;">'
    '<thead><tr><th scope="col" class="mono" style="padding: 10px 0; text-align: left; font-size: 13px; font-weight: 600; color: #AEB5D8; border-bottom: 1px solid rgba(255,255,255,.16);">A MONTH</th>'
    '<th scope="col" ' + _th + '>1 OR 2 DOGS</th><th scope="col" ' + _th + '>3 DOGS</th></tr></thead><tbody>'
    '<tr><th ' + _rh + '>Every week</th><td ' + _td + '>$108</td><td ' + _td + '>$121</td></tr>'
    '<tr><th ' + _rh + '>Twice a week</th><td ' + _td + '>$189</td><td ' + _td + '>$202</td></tr>'
    '<tr><th ' + _rh + '>Every other week</th><td ' + _td + '>$75</td><td ' + _td + '>$84</td></tr>'
    '</tbody></table>'
    '<p class="mono" style="margin: 22px 0 2px; font-size: 13px; font-weight: 600; letter-spacing: .06em; color: #AEB5D8;">EXTRAS</p>'
    + _xrow('Deodorizer spray', 'FREE EVERY VISIT') + _xrow('Turf odor treatment', '$35') + _xrow('Same day pickup', '$49') + _xrow('One time cleanup', '$95', True) +
    '<p style="margin: 12px 0 18px; font-size: 14px; line-height: 1.5; color: #AEB5D8;">Each dog after two adds $13 a month ($9 every other week). Your first month is free on any plan.</p>'
)


# ---------- page chrome shared by the home page, the town pages and the policy pages ----------
# Phones get the one column design. From 1024px wide the same markup becomes a desktop site:
# a top nav with Book now, two column sections, and Book now opens the sign up in a centered window.
HDR_CSS = r""".apw .hdr{position:sticky;top:0;z-index:20;background:var(--bg);border-bottom:1px solid var(--line)}
.apw .hin{display:flex;align-items:center;gap:8px;max-width:1240px;height:80px;margin:0 auto;padding:0 12px 0 14px}
.apw .hlogo{display:flex;align-items:center;flex:0 0 auto;min-height:48px;text-decoration:none}
.apw .lgo{display:block;width:auto;height:67px}
.apw .hsp{flex:1}
.apw .dnav,.apw .hbook{display:none}
@media (min-width:1024px){
.apw .hin{max-width:1224px;height:88px;padding:0 32px;gap:10px}
.apw .lgo{height:73px}
.apw .dnav{display:flex;align-items:center;gap:2px;margin-left:20px}
.apw .dnav a{display:inline-flex;align-items:center;min-height:44px;padding:0 12px;border-radius:999px;color:var(--ink);font-size:16px;font-weight:600;text-decoration:none;white-space:nowrap}
.apw .dnav a:hover{background:var(--bg2)}
.apw .hbook{display:inline-flex;min-height:48px;padding:0 22px;font-size:16px}
.apw .mbtn{display:none}
}
@media (min-width:1024px) and (max-width:1199px){.apw .lgo{height:67px}}
@media (min-width:1024px) and (max-width:1279px){.apw .dnav{margin-left:6px}.apw .dnav a{padding:0 9px;font-size:15px}}"""

PAGE_CSS = HDR_CSS + r"""
.apw .pg{position:relative;background:var(--bg)}
.apw .in{width:100%;max-width:560px;margin-left:auto;margin-right:auto}
.apw .sec{padding:56px 20px}
.apw .subn{margin:12px 0 0;font-size:17px;line-height:1.55;color:#D5DAF0}
.apw .hero{padding:18px 16px 40px;background:var(--bg)}
.apw .hey{display:flex;align-items:center;gap:10px;padding:0 4px}
.apw .h1-hero{margin-top:12px;padding:0 4px;font-size:42px;color:var(--ink)}
.apw .hvid{margin-top:18px}
.apw .hbk{position:relative;margin-top:18px}
.apw .hbk .btn{padding-right:96px}
.apw .hsm{margin:12px 0 0;font-size:13px;color:var(--mute);text-align:center}
.apw .hp{margin:22px 4px 0;font-size:17px;line-height:1.55;color:var(--ink2)}
.apw .prg{margin-top:22px}
.apw .ptot{margin-top:16px}
.apw .pf-a{margin-top:24px}
.apw .pf-b{margin-top:16px}
.apw .qs-l{margin-top:14px}
.apw .qs-c .btn{margin-top:22px}
.apw .pr .rcpt{text-align:left}
.apw .cta{padding:0 0 56px;background:var(--bg);color:var(--ink);text-align:center}
.apw .cta-in{padding:8px 20px 0}
.apw .cta-h{margin-top:0;font-size:40px;color:var(--ink)}
.apw .cta-c{padding-top:56px}
.apw .cta .btn{margin-top:24px}
.apw .chero{padding:0 0 36px;background:var(--bg)}
.apw .cht{padding:4px 20px 0}
.apw .h1-city{margin-top:10px;font-size:40px;color:var(--ink)}
.apw .cfaq{margin-top:14px}
.apw .nb-l{display:flex;flex-direction:column;gap:8px;margin-top:18px}
.apw .inc-l{margin-top:18px}
.apw .ftr{padding:40px 20px 128px;background:#070B1B;color:#FFFFFF}
.apw .flogo{display:block;width:260px;max-width:100%;height:auto}
.apw .fnav{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-top:24px}
.apw .fnav>div{display:flex;flex-direction:column}
.apw .mdlg{position:fixed;inset:0;z-index:40;display:flex;justify-content:flex-end;background:rgba(7,11,27,.6)}
.apw .mpan{width:100%;max-width:440px;height:100%;overflow-y:auto;display:flex;flex-direction:column;padding:0 16px 24px;background:var(--bg);color:var(--ink)}
@media (max-height:600px) and (max-width:1023px){.apw .h1-hero{font-size:34px}.apw .short-hide{display:none !important}.apw .hero{padding-top:14px}.apw .vs{aspect-ratio:16/10}}
@media (min-width:1024px){
.apw .in{max-width:1160px}
.apw .sec{padding:104px 32px}
.apw .h2{font-size:48px}
.apw .lead,.apw .subn{font-size:19px}
.apw .g2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);column-gap:72px;align-items:start}
.apw .stk{position:sticky;top:136px}
.apw .hero{padding:64px 32px 104px}
.apw .hg{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.15fr);grid-template-areas:". v" "e v" "t v" "p v" "b v" "s v" ". v";grid-template-rows:1fr auto auto auto auto auto 1fr;column-gap:72px}
.apw .hey{grid-area:e;padding:0}
.apw .h1-hero{grid-area:t;margin-top:18px;padding:0;font-size:clamp(56px,5.2vw,78px)}
.apw .hp{grid-area:p;margin:24px 0 0;max-width:31em;font-size:20px}
.apw .hbk{grid-area:b;width:fit-content;min-width:340px;margin-top:32px}
.apw .hsm{grid-area:s;margin-top:14px;text-align:left}
.apw .hvid{grid-area:v;align-self:center;margin-top:0}
.apw .shd{max-width:720px}
.apw .prg{grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);margin-top:44px}
.apw .ptot{margin-top:0}
.apw .hw .routew{margin-top:0}
.apw .pf{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);grid-template-areas:"h a" "b a";grid-template-rows:auto 1fr;column-gap:72px}
.apw .pf-h{grid-area:h}
.apw .pf-a{grid-area:a;margin-top:0}
.apw .pf-b{grid-area:b;align-self:start;margin-top:36px}
.apw .wh{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.15fr);grid-template-areas:"h m" "c m";grid-template-rows:auto 1fr;column-gap:72px}
.apw .wh-h{grid-area:h}
.apw .wh-c{grid-area:c}
.apw .wh .map{grid-area:m;align-self:start;margin:0;border:1px solid var(--line);border-radius:24px}
.apw .qs{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);grid-template-areas:"h l" "c l";grid-template-rows:auto 1fr;column-gap:72px}
.apw .qs-h{grid-area:h}
.apw .qs-l{grid-area:l;margin-top:0}
.apw .qs-c{grid-area:c;align-self:start}
.apw .qs-c .btn{display:inline-flex}
.apw .pr{max-width:600px;text-align:center}
.apw .cta{padding:0 32px 104px}
.apw .cta-c{padding-top:104px}
.apw .cta-h{font-size:56px}
.apw .cta .btn{display:inline-flex;min-width:320px}
.apw .sky{max-width:760px;margin:0 auto}
.apw .sky svg{-webkit-mask-image:linear-gradient(90deg,transparent,#000 14%,#000 86%,transparent);mask-image:linear-gradient(90deg,transparent,#000 14%,#000 86%,transparent)}
.apw .chero{padding:56px 32px 96px}
.apw .chg{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.05fr);column-gap:72px;align-items:center}
.apw .csky{order:2;display:flex;align-items:flex-end;aspect-ratio:3/2;border-radius:28px;overflow:hidden;background:linear-gradient(180deg,#CFE6F7,#F3F1EA 82%)}
.apw.dark .csky{background:linear-gradient(180deg,#0B1330,#1B2449 82%)}
.apw .cht{order:1;padding:0}
.apw .h1-city{font-size:clamp(52px,4.8vw,72px)}
.apw .cht .cp{font-size:19px}
.apw .cwhy>:first-child,.apw .cfaq,.apw .nb-l,.apw .inc-l{margin-top:0}
.apw .inc{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);grid-template-areas:"h l" "a l";grid-template-rows:auto 1fr;column-gap:72px}
.apw .inc-h{grid-area:h}
.apw .inc-l{grid-area:l}
.apw .inc-a{grid-area:a;align-self:start}
.apw .cpr{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);grid-template-areas:"h t" "c t";grid-template-rows:auto 1fr;column-gap:72px}
.apw .cpr-h{grid-area:h}
.apw .cpr-t{grid-area:t;margin-top:0 !important}
.apw .cpr-c{grid-area:c}
.apw .cpr-c .btn{display:inline-flex;min-width:300px}
.apw .nb-h .h2{margin-top:0}
.apw .ftr{padding:72px 32px 48px}
.apw .fg{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);column-gap:96px;align-items:start}
.apw .fnav{margin-top:0}
.apw .sbar{display:none !important}
.apw .rv{display:grid !important;grid-template-columns:repeat(3,minmax(0,1fr));margin:14px 0 0 !important;padding:0 !important;overflow:visible !important}
}"""


# long form town pages: neighborhood cards, guide sections, sources
LF_CSS = r""".apw .hcards{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;margin-top:24px}
.apw .hcard{display:flex;flex-direction:column;padding:20px 20px 18px;border-radius:20px;background:var(--card);border:1px solid var(--line)}
.apw .hcard h3{margin:0;font-size:20px;font-weight:800;letter-spacing:-.02em;line-height:1.2;color:var(--ink)}
.apw .hcard .hz{align-self:flex-start;margin:8px 0 0;padding:3px 10px;border-radius:999px;background:var(--accent-soft);color:var(--accent-text);font-size:13px;font-weight:600;letter-spacing:.03em}
.apw .hcard p{margin:10px 0 0;font-size:16px;line-height:1.55;color:var(--ink2)}
.apw .hcard p.hz{margin-top:8px}
.apw .lfb{margin-top:24px}
.apw .lfb h3{margin:30px 0 0;font-size:21px;font-weight:800;letter-spacing:-.02em;line-height:1.2;color:var(--ink)}
.apw .lfb h3:first-child{margin-top:0}
.apw .lfb p{margin:10px 0 0;font-size:17px;line-height:1.6;color:var(--ink2)}
.apw .lfb ul{margin:12px 0 0;padding-left:22px;font-size:17px;line-height:1.6;color:var(--ink2)}
.apw .lfb li{margin-top:6px}
.apw .lfb li::marker{color:var(--accent)}
.apw .lfb strong{color:var(--ink)}
.apw .lfb ul.src{font-size:15px;line-height:1.5}
.apw .lfb .upd{margin-top:18px;font-size:13px;color:var(--mute)}
@media (min-width:700px){.apw .hcards{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (min-width:1024px){.apw .lfb{margin-top:0}.apw .hcards{grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin-top:36px}.apw .lfb p,.apw .lfb ul{font-size:18px}.apw .lfb ul.src{font-size:15px}}"""

# interactive yard on the home page (yard.py)
import yard as _yard  # noqa: E402
_yd = _yard.fill()
YARD_SECTION = _yd['YARD_SECTION'].replace('@@ICON_MINUS20@@', ICON_MINUS20).replace('@@ICON_PLUS20@@', ICON_PLUS20)
YARD_CSS = _yd['YARD_CSS']
YARD_METHODS = _yd['YARD_METHODS']
YARD_STATE = _yd['YARD_STATE']

def _header(home, links):
    nav = ''.join('<a href="%s">%s</a>' % (h, t) for h, t in links)
    return ('<header class="hdr"><div class="hin">\n'
            '  <a href="' + home + '" class="hlogo" aria-label="Arizona Pet Waste, home">' + LOGO_H + '</a>\n'
            '  <nav class="dnav" aria-label="Main">' + nav + '</nav>\n'
            '  <span class="hsp"></span>\n'
            '  ' + THEME_BTN + '\n'
            '  <a href="Booking.dc.html" class="btn btn-dot hbook">Book now</a>\n'
            '  <button type="button" class="ibtn mbtn" aria-label="Open menu" onClick="{{ openMenu }}">' + ICON_MENU + '</button>\n'
            '</div></header>')


def _menu(links):
    nav = ''.join('<a href="%s" class="mlink"%s>%s</a>' % (h, ' onClick="{{ closeMenu }}"' if h.startswith('#') else '', t) for h, t in links)
    return ('<sc-if value="{{ menu }}" hint-placeholder-val="{{ false }}">\n'
            '  <div role="dialog" aria-modal="true" aria-label="Menu" class="mdlg">\n'
            '    <div class="mpan">\n'
            '      <div style="display: flex; align-items: center; gap: 10px; height: 80px;">\n'
            '        ' + LOGO_H + '\n'
            '        <span style="flex: 1;"></span>\n'
            '        <button type="button" class="ibtn" aria-label="Close menu" onClick="{{ closeMenu }}">' + ICON_CLOSE + '</button>\n'
            '      </div>\n'
            '      <nav aria-label="Main" style="display: flex; flex-direction: column; margin-top: 8px;">' + nav + '</nav>\n'
            '      <a href="Booking.dc.html" class="btn btn-dot" style="margin-top: 24px;">Book now</a>\n'
            '      <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 10px;">\n'
            '        <a href="tel:+16233096104" class="btn btn-line">Call</a>\n'
            '        <a href="sms:+16233096104" class="btn btn-line">Text</a>\n'
            '      </div>\n'
            '      <button type="button" class="btn btn-line" onClick="{{ toggleTheme }}" style="width: 100%; margin-top: 10px;">{{ themeMenuLabel }}</button>\n'
            '      <p class="mono" style="margin: 18px 0 0; text-align: center; font-size: 14px; color: var(--mute);">623.309.6104</p>\n'
            '    </div>\n'
            '  </div>\n'
            '</sc-if>')


SBAR = ('<sc-if value="{{ showBar }}" hint-placeholder-val="{{ true }}">\n'
        '  <div class="sbar" style="position: fixed; left: 0; right: 0; bottom: 0; z-index: 30; background: var(--bg); border-top: 1px solid var(--line); box-shadow: 0 -10px 24px rgba(10,15,36,.10);">\n'
        '    <div style="display: flex; gap: 10px; max-width: 560px; margin: 0 auto; padding: 10px 12px 14px;">\n'
        '      <a href="Booking.dc.html" class="btn btn-dot" style="flex: 1;">Book now</a>\n'
        '      <a href="sms:+16233096104" class="btn btn-line" style="padding: 0 18px;">' + ICON_CHAT + 'Text us</a>\n'
        '    </div>\n'
        '  </div>\n'
        '</sc-if>')

_flab = 'class="mono" style="margin: 0 0 4px; font-size: 13px; font-weight: 600; letter-spacing: .09em; color: #AEB5D8;"'
_fcon = 'style="display: flex; align-items: center; gap: 12px; min-height: 56px; color: #FFFFFF; font-size: 17px; font-weight: 700; text-decoration: none; border-bottom: 1px solid rgba(255,255,255,.10);"'
_fsoc = 'class="btn btn-line-n" style="min-height: 44px; padding: 0 16px; font-size: 15px;"'


def _footer(pre):
    """pre is '' on the home page (links stay on the page) and 'Main.dc.html' everywhere else."""
    return ('<footer class="ftr">\n'
            '  <div class="in">\n'
            '  <div class="fg">\n'
            '    <div>\n'
            '      <img class="flogo" src="' + BLOB_LOGO_DARK + '" alt="Arizona Pet Waste" width="260" height="79">\n'
            '      <p class="mono" style="margin: 16px 0 0; font-size: 14px; color: #AEB5D8;">You always know. Or you don’t pay.</p>\n'
            '      <div style="display: flex; flex-direction: column; margin-top: 20px; border-top: 1px solid rgba(255,255,255,.10);">\n'
            '        <a href="tel:+16233096104" ' + _fcon + '>' + ICON_PHONE + '623.309.6104</a>\n'
            '        <a href="sms:+16233096104" ' + _fcon + '>' + ICON_SMS_O + 'Text us</a>\n'
            '        <a href="mailto:info@arizonapetwaste.com" ' + _fcon + '>' + ICON_MAIL + 'info@arizonapetwaste.com</a>\n'
            '      </div>\n'
            '    </div>\n'
            '    <nav class="fnav" aria-label="Footer">\n'
            '      <div>\n'
            '        <p ' + _flab + '>AREAS WE SERVE</p>\n'
            '        <a href="CityBuckeye.dc.html" class="flink">Buckeye</a>\n'
            '        <a href="CityGoodyear.dc.html" class="flink">Goodyear</a>\n'
            '        <a href="CityLitchfieldPark.dc.html" class="flink">Litchfield Park</a>\n'
            '        <a href="CityCitrusPark.dc.html" class="flink">Citrus Park</a>\n'
            '        <a href="CityVerrado.dc.html" class="flink">Verrado</a>\n'
            '        <a href="AreasWeServe.dc.html" class="flink">Every ZIP code</a>\n'
            '      </div>\n'
            '      <div>\n'
            '        <p ' + _flab + '>MORE</p>\n'
            '        <a href="HowItWorks.dc.html" class="flink">How it works</a>\n'
            '        <a href="Pricing.dc.html" class="flink">Pricing</a>\n'
            '        <a href="Commercial.dc.html" class="flink">Commercial</a>\n'
            '        <a href="Faq.dc.html" class="flink">FAQ</a>\n'
            '        <a href="Booking.dc.html" class="flink">Book now</a>\n'
            '      </div>\n'
            '    </nav>\n'
            '  </div>\n'
            '  <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 24px;">\n'
            '    <a href="#reviews" ' + _fsoc + '>Google</a>\n'
            '    <a href="#reviews" ' + _fsoc + '>Facebook</a>\n'
            '    <a href="#reviews" ' + _fsoc + '>Instagram</a>\n'
            '    <a href="#reviews" ' + _fsoc + '>Nextdoor</a>\n'
            '  </div>\n'
            '  <p style="margin: 26px 0 0; font-size: 14px; line-height: 1.6; color: #AEB5D8;">© 2026 Arizona Pet Waste. All rights reserved.</p>\n'
            '  </div>\n'
            '</footer>')


HEADER_MAIN = _header('Main.dc.html', [('HowItWorks.dc.html', 'How it works'), ('Pricing.dc.html', 'Pricing'), ('AreasWeServe.dc.html', 'Areas we serve'), ('Commercial.dc.html', 'Commercial'), ('Faq.dc.html', 'FAQ')])
HEADER_CITY = _header('Main.dc.html', [('HowItWorks.dc.html', 'How it works'), ('Pricing.dc.html', 'Pricing'), ('AreasWeServe.dc.html', 'Areas we serve'), ('Commercial.dc.html', 'Commercial'), ('Faq.dc.html', 'FAQ')])
MENU_MAIN = _menu([('Main.dc.html', 'Home'), ('HowItWorks.dc.html', 'How it works'), ('Pricing.dc.html', 'Pricing'), ('AreasWeServe.dc.html', 'Areas we serve'), ('Commercial.dc.html', 'Commercial'), ('Faq.dc.html', 'FAQ'), ('CityBuckeye.dc.html', 'Buckeye'), ('CityGoodyear.dc.html', 'Goodyear'), ('CityLitchfieldPark.dc.html', 'Litchfield Park'), ('CityCitrusPark.dc.html', 'Citrus Park'), ('CityVerrado.dc.html', 'Verrado')])
MENU_CITY = _menu([('Main.dc.html', 'Home'), ('HowItWorks.dc.html', 'How it works'), ('Pricing.dc.html', 'Pricing'), ('AreasWeServe.dc.html', 'Areas we serve'), ('Commercial.dc.html', 'Commercial'), ('Faq.dc.html', 'FAQ'), ('CityBuckeye.dc.html', 'Buckeye'), ('CityGoodyear.dc.html', 'Goodyear'), ('CityLitchfieldPark.dc.html', 'Litchfield Park'), ('CityCitrusPark.dc.html', 'Citrus Park'), ('CityVerrado.dc.html', 'Verrado')])
FOOTER_MAIN = _footer('')
FOOTER_CITY = _footer('Main.dc.html')


# ---------- Redesign layer (Nov 2026): dark stage heroes, spec ticker, numbered sections, specs grid, motion ----------
TICK_ITEMS = ['Gate photo every visit', 'Free deodorizer spray', 'Live truck map', 'First month $0', 'No contract',
              '4 free skips a year', 'Free return in 24 hours', 'Licensed and insured']
_tick_li = ''.join('<li>%s</li>' % x for x in TICK_ITEMS)
TICKER = ('<div class="tick" role="region" aria-label="What every plan includes">\n'
          '  <input type="checkbox" id="tick-pause" class="tick-p" aria-label="Pause the moving list">\n'
          '  <label for="tick-pause" class="tick-b" aria-hidden="true">'
          '<svg class="i-pause" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1"></rect><rect x="14" y="4" width="4" height="16" rx="1"></rect></svg>'
          '<svg class="i-play" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l12-7.5z"></path></svg></label>\n'
          '  <div class="tick-in"><ul class="tick-l">' + _tick_li + '</ul><ul class="tick-l" aria-hidden="true">' + _tick_li + '</ul></div>\n'
          '</div>')

SPEC_ITEMS = [('30', 'MIN', 'Your time window. We text it the night before.'),
              ('1', 'PHOTO', 'Of your latched gate after every visit.'),
              ('$0', 'SPRAY', 'Deodorizer on the spots your dogs use most.'),
              ('24', 'HOURS', 'We come back free if we miss a pile.'),
              ('4', 'SKIPS', 'Free skips a year. One tap in My Yard.'),
              ('120', 'DAYS', 'Pause while you are away. You pay $0.'),
              ('6', 'ZIP CODES', 'Every home in Buckeye, Goodyear, Litchfield Park and Citrus Park.'),
              ('0', 'CONTRACTS', 'Month to month. Cancel in My Yard.')]
SPECS = ('<section id="specs" class="sec spec">\n  <div class="in">\n'
         '  <p class="eb nx">The specs</p>\n'
         '  <h2 class="h2">Every visit, by the numbers<span style="color: #FF4A1C;">.</span></h2>\n'
         '  <dl class="sgrid">\n' +
         ''.join('    <div class="scell"><dt><b>%s</b><small>%s</small></dt><dd>%s</dd></div>\n' % s for s in SPEC_ITEMS) +
         '  </dl>\n'
         '  <p class="mono sfoot">Licensed and insured · First month free · No sign up fee</p>\n'
         '  </div>\n</section>')

REVAMP_CSS = r"""
.apw{counter-reset:sx}
.apw .hdr{background:color-mix(in srgb,var(--bg) 90%,transparent);-webkit-backdrop-filter:saturate(1.6) blur(14px);backdrop-filter:saturate(1.6) blur(14px)}
.apw .hero,.apw .chero{--bg:#070B1B;--bg2:#0E1530;--bg3:#101A38;--card:#141D3D;--ink:#F6F4EF;--ink2:#D5DAF0;--mute:#AEB5D8;--line:rgba(255,255,255,.13);--field:#6B7398;--accent-text:#FF8A66;position:relative;isolation:isolate;overflow:hidden;background:#070B1B;color:#F6F4EF}
.apw .hero::before,.apw .chero::before,.apw .spec::before{content:"";position:absolute;inset:0;z-index:-2;pointer-events:none;background-image:linear-gradient(rgba(246,244,239,.055) 1px,transparent 1px),linear-gradient(90deg,rgba(246,244,239,.055) 1px,transparent 1px);background-size:44px 44px;-webkit-mask-image:radial-gradient(130% 75% at 50% 35%,#000 35%,transparent 80%);mask-image:radial-gradient(130% 75% at 50% 35%,#000 35%,transparent 80%)}
.apw .hero::after,.apw .chero::after{content:"";position:absolute;z-index:-1;pointer-events:none;width:580px;height:580px;left:50%;top:46%;transform:translate(-50%,-50%);border-radius:50%;background:radial-gradient(circle,rgba(255,106,40,.42) 0%,rgba(255,74,28,.16) 40%,rgba(255,74,28,0) 70%)}
.apw .hero .vsw{position:relative;box-shadow:0 0 0 1px rgba(255,255,255,.1),0 30px 80px -24px rgba(255,74,28,.5),0 24px 60px rgba(0,0,0,.5)}
.apw .chero .skm1{fill:#2B3468}.apw .chero .skm2{fill:#1E2650}.apw .chero .skg{fill:#2A2F4A}
.apw .hspec{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));margin:26px 4px 0;border-top:1px solid rgba(255,255,255,.14)}
.apw .hspec div{min-width:0;padding:14px 8px 0 0}
.apw .hspec div+div{padding-left:12px;border-left:1px solid rgba(255,255,255,.14)}
.apw .hspec dt{display:flex;align-items:baseline;gap:4px;font-family:"Archivo","Arial Black",sans-serif;font-weight:800;font-size:30px;line-height:1;color:#F6F4EF}
.apw .hspec dt small{font-family:"IBM Plex Mono",ui-monospace,Consolas,monospace;font-size:11px;font-weight:600;letter-spacing:.08em;color:#FF8A66}
.apw .hspec dd{margin:7px 0 0;font-size:13px;line-height:1.35;color:#AEB5D8}
.apw .tick{position:relative;overflow:hidden;background:#FF4A1C;color:#0E1430}
.apw .tick-in{display:flex;width:max-content;animation:apwTick 42s linear infinite}
.apw .tick-l{display:flex;margin:0;padding:0;list-style:none}
.apw .tick-l li{display:flex;align-items:center;gap:20px;padding:15px 0 15px 20px;font-family:"IBM Plex Mono",ui-monospace,Consolas,monospace;font-size:14px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap}
.apw .tick-l li::after{content:"";width:7px;height:7px;border-radius:50%;background:#0E1430}
@keyframes apwTick{to{transform:translateX(-50%)}}
.apw .tick:hover .tick-in,.apw .tick-p:checked~.tick-in{animation-play-state:paused}
.apw .tick-p{position:absolute;width:1px;height:1px;margin:0;opacity:0}
.apw .tick-b{position:absolute;z-index:2;right:6px;top:50%;width:38px;height:38px;margin-top:-19px;border-radius:50%;background:#0E1430;color:#FF4A1C;display:grid;place-items:center;cursor:pointer;box-shadow:-14px 0 14px #FF4A1C}
.apw .tick-b .i-play,.apw .tick-p:checked+.tick-b .i-pause{display:none}
.apw .tick-p:checked+.tick-b .i-play{display:block}
.apw .tick-p:focus-visible+.tick-b{outline:3px solid #0E1430;outline-offset:2px}
.apw .eb.nx::before{counter-increment:sx;content:counter(sx,decimal-leading-zero) " / ";opacity:.75}
.apw .spec{position:relative;isolation:isolate;overflow:hidden;background:#070B1B;color:#F6F4EF}
.apw .spec .eb{color:#FF8A66}
.apw .spec .h2{color:#F6F4EF}
.apw .sgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));margin:30px 0 0;border-top:1px solid rgba(255,255,255,.14);border-left:1px solid rgba(255,255,255,.14)}
.apw .scell{min-width:0;padding:18px 14px 20px;border-right:1px solid rgba(255,255,255,.14);border-bottom:1px solid rgba(255,255,255,.14);transition:background-color .2s ease}
.apw .scell:hover{background:rgba(255,74,28,.09)}
.apw .scell dt{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 8px;margin:0}
.apw .scell b{font-family:"Archivo","Arial Black",sans-serif;font-weight:800;font-size:46px;line-height:.95;color:#F6F4EF}
.apw .scell small{font-family:"IBM Plex Mono",ui-monospace,Consolas,monospace;font-size:12px;font-weight:600;letter-spacing:.1em;color:#FF8A66}
.apw .scell dd{margin:10px 0 0;font-size:15px;line-height:1.45;color:#D5DAF0}
.apw .sfoot{margin:18px 0 0;font-size:13px;line-height:1.5;letter-spacing:.08em;text-transform:uppercase;color:#AEB5D8}
.apw .btn{transition:transform .18s cubic-bezier(.3,1.4,.5,1),box-shadow .2s ease,background-color .2s ease}
.apw .btn:not(:disabled):hover{transform:translateY(-2px)}
.apw .btn:not(:disabled):active{transform:translateY(0) scale(.98)}
.apw .btn-dot{box-shadow:0 10px 24px -8px rgba(255,74,28,.6)}
.apw .btn-dot:not(:disabled):hover{box-shadow:0 16px 32px -10px rgba(255,74,28,.75)}
.apw .hbk .btn-dot{position:relative;overflow:hidden;isolation:isolate}
.apw .hbk .btn-dot::after{content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(105deg,transparent 35%,rgba(255,255,255,.5) 50%,transparent 65%);transform:translateX(-130%);animation:apwShine 5s 1.5s ease-in-out infinite}
@keyframes apwShine{0%,72%{transform:translateX(-130%)}100%{transform:translateX(130%)}}
@keyframes apwRise{from{opacity:0;transform:translateY(26px)}to{opacity:1;transform:none}}
@supports (animation-timeline:view()){@media (prefers-reduced-motion:no-preference){
.apw .sec :is(.h2,.scell,.hcard,.rcpt){animation:apwRise linear both;animation-timeline:view();animation-range:entry 5% entry 75%}
}}
@media (min-width:1024px){
.apw .hero::after{left:73%;top:50%;width:860px;height:860px}
.apw .chero::after{left:75%;top:52%;width:760px;height:760px}
.apw .chero .csky{background:linear-gradient(180deg,#0B1330,#1B2449 82%);box-shadow:0 0 0 1px rgba(255,255,255,.1),0 30px 80px -24px rgba(255,74,28,.45)}
.apw .hg{grid-template-areas:". v" "e v" "t v" "p v" "b v" "s v" "x v" ". v";grid-template-rows:1fr auto auto auto auto auto auto 1fr}
.apw .hspec{grid-area:x;max-width:520px;margin:34px 0 0}
.apw .hspec dt{font-size:42px}
.apw .hspec dd{font-size:14px}
.apw .tick-l li{padding:17px 0 17px 24px;gap:24px;font-size:15px}
.apw .wh{grid-template-columns:minmax(0,.9fr) minmax(0,1.4fr)}
.apw .sgrid{grid-template-columns:repeat(4,minmax(0,1fr));margin-top:44px}
.apw .scell{padding:30px 24px 32px}
.apw .scell b{font-size:66px}
}
@media (prefers-reduced-motion:reduce){.apw .tick-in{animation:none}.apw .tick{overflow-x:auto}.apw .tick-b{display:none}.apw .hbk .btn-dot::after{display:none}.apw .btn{transition:none}.apw .btn:not(:disabled):hover,.apw .btn:not(:disabled):active{transform:none}}"""
PAGE_CSS += REVAMP_CSS

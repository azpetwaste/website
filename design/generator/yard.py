"""Interactive yard for the home page: pick dogs and days, piles appear, tap Scoop it and watch a visit.
The scooper walks the yard in rows (the same live dot as the visit map), piles pop as it passes,
then the spray, the gate latch, and the gate photo. Ends on the price card.

Fills @@YARD_SECTION@@, @@YARD_CSS@@, @@YARD_METHODS@@ and @@YARD_STATE@@ in main.tpl.html."""
import json
import math
import random

# ---------- the yard drawing (360 x 400 units, top down) ----------
W, H = 360, 400
TURF = (44, 34, 316, 284)          # x0, y0, x1, y1
PATIO = (110, 296, 250, 330)
CANOPY = (50, 300, 40)
AGAVES = [(330, 302, 15), (24, 150, 13)]
BARREL = (331, 182, 10)
ROWS = [40 + 39 * k for k in range(8)]   # the scooper's rows
X0, X1 = 26, 334
MAX_PILES = 90


def _piles():
    rnd = random.Random(7)
    out = []
    tries = 0
    while len(out) < MAX_PILES and tries < 20000:
        tries += 1
        if rnd.random() < 0.76:
            x, y = rnd.uniform(TURF[0] + 8, TURF[2] - 8), rnd.uniform(TURF[1] + 8, TURF[3] - 8)
        else:
            x, y = rnd.uniform(16, 344), rnd.uniform(16, 322)
        if PATIO[0] - 4 < x < PATIO[2] + 4 and PATIO[1] - 4 < y < 334:
            continue
        if math.hypot(x - CANOPY[0], y - CANOPY[1]) < CANOPY[2] + 4:
            continue
        if any(math.hypot(x - ax, y - ay) < r + 6 for ax, ay, r in AGAVES):
            continue
        if math.hypot(x - BARREL[0], y - BARREL[1]) < BARREL[2] + 6:
            continue
        if 336 < x and 36 < y < 100:   # keep the gate path clear
            continue
        if any(math.hypot(x - px, y - py) < 11 for px, py, _ in out):
            continue
        out.append((round(x, 1), round(y, 1), rnd.randint(0, 179)))
    return out


PILES = _piles()


def _stripes():
    out = []
    for i, y in enumerate(range(TURF[1], TURF[3], 20)):
        if i % 2 == 0:
            out.append('<rect x="%d" y="%d" width="%d" height="20" fill="#7BBF68"></rect>' % (TURF[0], y, TURF[2] - TURF[0]))
    return ''.join(out)


def _agave(x, y, r):
    pts = []
    for i in range(16):
        a = math.pi * 2 * i / 16
        rr = r if i % 2 == 0 else r * 0.38
        pts.append('%.1f,%.1f' % (x + rr * math.cos(a), y + rr * math.sin(a)))
    return '<polygon points="%s" fill="#7FA48C" stroke="#5E836C" stroke-width="1"></polygon>' % ' '.join(pts)


def _trail():
    pts = []
    for k, y in enumerate(ROWS):
        if k % 2 == 0:
            pts += [(X1, y), (X0, y)]
        else:
            pts += [(X0, y), (X1, y)]
    return 'M' + ' L'.join('%d %d' % p for p in pts)


SPRAY = [(96, 70), (262, 150), (128, 246)]

SVG = ('<svg viewBox="0 0 360 400" role="img" aria-label="{{ ydAria }}" style="display: block; width: 100%%; height: auto;">'
       '<defs>'
       '<pattern id="yd-rock" width="14" height="14" patternUnits="userSpaceOnUse"><rect width="14" height="14" fill="#E9D9BD"></rect>'
       '<circle cx="3" cy="4" r="1.4" fill="#D3BF9E"></circle><circle cx="10" cy="9" r="1.1" fill="#F5EAD6"></circle><circle cx="7" cy="12" r="0.9" fill="#CDB792"></circle></pattern>'
       '<pattern id="yd-tile" width="12" height="9" patternUnits="userSpaceOnUse"><rect width="12" height="9" fill="#C8714D"></rect><path d="M0 8.5H12M6 0V4.5" stroke="#A9573A" stroke-width="1"></path></pattern>'
       '<radialGradient id="yd-mist"><stop offset="0" stop-color="#BFE6FF" stop-opacity=".95"></stop><stop offset="1" stop-color="#BFE6FF" stop-opacity="0"></stop></radialGradient>'
       '<clipPath id="yd-turf"><rect x="%d" y="%d" width="%d" height="%d" rx="16"></rect></clipPath>'
       '</defs>' % (TURF[0], TURF[1], TURF[2] - TURF[0], TURF[3] - TURF[1]) +
       '<rect width="360" height="400" fill="url(#yd-rock)"></rect>'
       # turf with mow stripes
       '<g clip-path="url(#yd-turf)"><rect x="%d" y="%d" width="%d" height="%d" fill="#6CB25A"></rect>%s</g>' % (TURF[0], TURF[1], TURF[2] - TURF[0], TURF[3] - TURF[1], _stripes()) +
       # patio, table, chairs
       '<rect x="%d" y="%d" width="%d" height="%d" fill="#D8D3C9"></rect>' % (PATIO[0], PATIO[1], PATIO[2] - PATIO[0], PATIO[3] - PATIO[1]) +
       '<circle cx="152" cy="312" r="8" fill="#B7B0A3"></circle><rect x="136" y="306" width="8" height="12" rx="2" fill="#9E978A"></rect><rect x="160" y="306" width="8" height="12" rx="2" fill="#9E978A"></rect>'
       # the dog napping on the patio (tail wags)
       '<g class="yd-dog"><ellipse cx="214" cy="314" rx="13" ry="7" fill="#D9A066"></ellipse><circle cx="229" cy="311" r="6" fill="#D9A066"></circle>'
       '<ellipse cx="231" cy="306" rx="2.6" ry="3.4" fill="#B5652A"></ellipse><ellipse cx="226" cy="306.5" rx="2.6" ry="3.4" fill="#B5652A"></ellipse>'
       '<path class="yd-tail" d="M201 314 Q193 310 190 304" stroke="#D9A066" stroke-width="3" stroke-linecap="round" fill="none"></path></g>'
       # plants
       + ''.join(_agave(*a) for a in AGAVES) +
       '<circle cx="%d" cy="%d" r="%d" fill="#6E9A57"></circle><path d="M%d %dv16M%d %dl10 10M%d %dl-10 10" stroke="#55804A" stroke-width="1"></path>'
       % (BARREL[0], BARREL[1], BARREL[2], BARREL[0], BARREL[1] - 8, BARREL[0] - 5, BARREL[1] - 5, BARREL[0] + 5, BARREL[1] - 5) +
       '<ellipse cx="196" cy="19" rx="11" ry="6" fill="#BBA98C"></ellipse><ellipse cx="292" cy="22" rx="8" ry="5" fill="#C9B898"></ellipse>'
       # piles
       '<g id="yd-piles"><sc-for list="{{ ydPiles }}" as="p" hint-placeholder-count="20"><g class="ydp" transform="{{ p.t }}">'
       '<ellipse rx="4.8" ry="3.5" fill="#5A3B24"></ellipse><ellipse cx="-0.8" cy="-1.1" rx="2.6" ry="1.8" fill="#7B5537"></ellipse></g></sc-for></g>'
       # the palo verde tree over everything near it
       '<circle cx="%d" cy="%d" r="%d" fill="#A9C24C" opacity=".93"></circle><circle cx="36" cy="290" r="14" fill="#B9CF5E"></circle><circle cx="62" cy="310" r="12" fill="#98B342"></circle>'
       % CANOPY +
       # spray spots
       '<g class="yd-spray">' + ''.join('<circle cx="%d" cy="%d" r="26" fill="url(#yd-mist)"></circle>' % s for s in SPRAY) + '</g>'
       # the path we walk
       '<path id="yd-trail" class="yd-trail" d="%s" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1" fill="none" stroke="#FF4A1C" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></path>' % _trail() +
       # block wall with the gate on the right
       '<path d="M6 330V6H354V40M354 96V330" fill="none" stroke="#D4C1A6" stroke-width="8" stroke-linecap="square"></path>'
       '<path d="M6 330V6H354V40M354 96V330" fill="none" stroke="#BCA88B" stroke-width="1"></path>'
       '<g class="yd-gate"><rect x="350.5" y="40" width="7" height="56" rx="2" fill="#5B4632"></rect></g>'
       '<g class="yd-lock"><circle cx="342" cy="108" r="9" fill="#1E7A52"></circle><path d="M337.6 108.2l3 3 5.4-6" stroke="#FFFFFF" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"></path></g>'
       # house roof
       '<rect x="0" y="334" width="360" height="66" fill="url(#yd-tile)"></rect><rect x="0" y="330" width="360" height="5" fill="#E6DED0"></rect>'
       # the scooper: same live dot as the map
       '<g id="yd-sc" class="yd-sc" transform="translate(372 68)"><circle class="yd-ring" r="9" fill="#FF4A1C" opacity=".35"></circle>'
       '<circle r="7.5" fill="#FF4A1C" stroke="#FFFFFF" stroke-width="2.6"></circle></g>'
       '</svg>')

GATE_PHOTO = ('<svg viewBox="0 0 120 90" aria-hidden="true" style="display: block; width: 100%; height: auto; background: #CFE6F7;">'
              '<rect y="58" width="120" height="32" fill="#E9D9BD"></rect><rect x="0" y="22" width="120" height="40" fill="#E2CFB4"></rect>'
              '<rect x="38" y="20" width="44" height="46" rx="2" fill="#5B4632"></rect>'
              '<path d="M44 24v38M52 24v38M60 24v38M68 24v38M76 24v38" stroke="#46351F" stroke-width="2"></path>'
              '<rect x="78" y="40" width="9" height="6" rx="1.5" fill="#C9C1B4"></rect>'
              '<circle cx="96" cy="18" r="9" fill="#1E7A52"></circle><path d="M91.8 18.2l3 3 5.2-5.8" stroke="#FFFFFF" stroke-width="2" fill="none" stroke-linecap="round"></path></svg>')

SECTION = '''<section id="yard" class="sec" style="background: var(--bg);">
  <div class="in yd">
  <div class="yd-h">
    <p class="eb">Try it</p>
    <h2 class="h2" style="color: var(--ink);">Watch us scoop your yard<span style="color: var(--accent);">.</span></h2>
    <p class="lead">Pick your dogs and how long it has been. Then tap Scoop it.</p>
  </div>
  <div class="yd-c">
    <div class="yd-row">
      <span class="yd-lab">Dogs</span>
      <div style="display: flex; align-items: center; gap: 10px;">
        <button type="button" class="ibtn" aria-label="One less dog" onClick="{{ dogDown }}">@@ICON_MINUS20@@</button>
        <span class="yd-val mono" aria-live="polite">{{ dogLabel }}</span>
        <button type="button" class="ibtn" aria-label="One more dog" onClick="{{ dogUp }}">@@ICON_PLUS20@@</button>
      </div>
    </div>
    <div class="yd-row" style="display: block;">
      <label for="yd-days" class="yd-lab" style="display: flex; justify-content: space-between;"><span>Days since the last pickup</span><span class="yd-val mono">{{ ydDaysLabel }}</span></label>
      <input id="yd-days" class="yd-range" type="range" min="1" max="30" step="1" value="{{ ydDays }}" onChange="{{ ydSetDays }}">
    </div>
    <div class="yd-out">
      <p><span class="yd-n">{{ ydN }}</span><span class="yd-u">{{ ydPileWord }}</span></p>
      <p><span class="yd-n">{{ ydLbs }}</span><span class="yd-u">pounds</span></p>
    </div>
  </div>
  <div class="{{ ydCls }}">
    <div class="ydc">
      <p class="yd-clock mono"><span class="ldot"></span><span id="yd-clock">10:00 AM</span></p>
@@YARD_SVG@@
      <div class="yd-photo" aria-hidden="true"><div class="yd-pol">@@YARD_GATE@@<p class="mono">LATCHED · 10:19 AM</p></div></div>
    </div>
    <p class="yd-st" aria-live="polite">{{ ydStatus }}</p>
    <sc-if value="{{ ydRunning }}" hint-placeholder-val="{{ false }}"><p class="yd-ct mono"><b id="yd-picked">0</b> of {{ ydN }} picked up</p></sc-if>
  </div>
  <div class="yd-a">
    <sc-if value="{{ ydIdle }}" hint-placeholder-val="{{ true }}"><button type="button" class="btn btn-dot yd-go" onClick="{{ ydGo }}">Scoop it</button></sc-if>
    <sc-if value="{{ ydDone }}" hint-placeholder-val="{{ false }}"><div class="yd-end">
      <h3>Clean. Every week.</h3>
      <p>{{ planLine }} is {{ totalLabel }} a month, with the spray and the gate photo included. Your first month is free.</p>
      <a href="Booking.dc.html" class="btn btn-dot">{{ ctaLabel }}</a>
      <button type="button" class="yd-again" onClick="{{ ydAgain }}">Run it again</button>
    </div></sc-if>
  </div>
  </div>
</section>
'''

CSS = r""".apw .yd-c{margin-top:22px;padding:16px 18px;border-radius:22px;background:var(--bg2);border:1px solid var(--line)}
.apw .yd-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 0}
.apw .yd-row+.yd-row{border-top:1px solid var(--line);padding-top:14px}
.apw .yd-lab{font-size:16px;font-weight:700;color:var(--ink)}
.apw .yd-val{font-size:15px;font-weight:600;color:var(--accent-text);min-width:64px;text-align:center}
.apw .yd-range{width:100%;height:44px;margin:4px 0 0;background:transparent;-webkit-appearance:none;appearance:none;cursor:pointer}
.apw .yd-range::-webkit-slider-runnable-track{height:8px;border-radius:99px;background:var(--line)}
.apw .yd-range::-moz-range-track{height:8px;border-radius:99px;background:var(--line)}
.apw .yd-range::-webkit-slider-thumb{-webkit-appearance:none;width:28px;height:28px;margin-top:-10px;border-radius:50%;background:#FF4A1C;border:4px solid #FFFFFF;box-shadow:0 2px 8px rgba(10,15,36,.3)}
.apw .yd-range::-moz-range-thumb{width:22px;height:22px;border-radius:50%;background:#FF4A1C;border:4px solid #FFFFFF}
.apw .yd-out{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px;padding-top:14px;border-top:1px solid var(--line)}
.apw .yd-out p{margin:0;display:flex;align-items:baseline;gap:8px}
.apw .yd-n{font-size:46px;font-weight:800;letter-spacing:-.05em;line-height:1;color:var(--ink)}
.apw .yd-u{font-size:15px;font-weight:600;color:var(--mute)}
.apw .ydw{margin-top:18px}
.apw .ydc{position:relative;border-radius:26px;overflow:hidden;border:1px solid var(--line);box-shadow:var(--shadow);background:#E9D9BD}
.apw .yd-clock{position:absolute;left:12px;top:12px;z-index:2;display:flex;align-items:center;gap:8px;margin:0;padding:7px 12px;border-radius:999px;background:rgba(10,15,36,.86);color:#FFFFFF;font-size:13px;font-weight:600}
.apw .ydp{transition:opacity .25s ease,transform .25s ease}
.apw .ydp.gone{opacity:0}
.apw .yd-sc{opacity:0;transition:opacity .3s ease}
.apw .ydw.run .yd-sc{opacity:1}
.apw .yd-ring{transform-box:fill-box;transform-origin:center;animation:ydPulse 1.4s ease-out infinite}
@keyframes ydPulse{from{transform:scale(1);opacity:.45}to{transform:scale(2.4);opacity:0}}
.apw .yd-trail{opacity:0;transition:opacity .3s ease}
.apw .ydw.run .yd-trail,.apw .ydw.done .yd-trail{opacity:.5}
.apw .yd-gate rect{transform-box:view-box;transform-origin:354px 40px;transition:transform .5s ease}
.apw .ydw.st-enter .yd-gate rect,.apw .ydw.st-exit .yd-gate rect{transform:rotate(80deg)}
.apw .yd-lock{opacity:0;transform-box:fill-box;transform-origin:center;transform:scale(.4);transition:opacity .3s ease,transform .35s cubic-bezier(.3,1.6,.5,1)}
.apw .ydw.st-photo .yd-lock,.apw .ydw.done .yd-lock{opacity:1;transform:none}
.apw .yd-spray circle{opacity:0;transform-box:fill-box;transform-origin:center}
.apw .ydw.st-spray .yd-spray circle{animation:ydMist 1.2s ease-out both}
.apw .ydw.st-spray .yd-spray circle:nth-child(2){animation-delay:.2s}
.apw .ydw.st-spray .yd-spray circle:nth-child(3){animation-delay:.4s}
@keyframes ydMist{0%{opacity:0;transform:scale(.3)}35%{opacity:1}100%{opacity:0;transform:scale(1.5)}}
.apw .yd-tail{transform-box:fill-box;transform-origin:100% 0;animation:ydWag 1.6s ease-in-out infinite}
@keyframes ydWag{0%,100%{transform:rotate(0)}50%{transform:rotate(-24deg)}}
.apw .yd-photo{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;opacity:0;transform:translateY(24px) scale(.92);transition:opacity .4s ease,transform .5s cubic-bezier(.2,1.2,.4,1)}
.apw .ydw.st-photo .yd-photo,.apw .ydw.done .yd-photo{opacity:1;transform:none}
.apw .ydw.done .yd-photo{opacity:0;transition-delay:2.4s}
.apw .yd-pol{width:52%;padding:10px 10px 12px;background:#FFFFFF;border-radius:6px;box-shadow:0 16px 36px rgba(10,15,36,.35);transform:rotate(-4deg)}
.apw .yd-pol p{margin:8px 0 0;font-size:11px;font-weight:600;letter-spacing:.04em;color:#0E1430;text-align:center}
.apw .yd-st{margin:14px 0 0;font-size:17px;font-weight:700;line-height:1.4;color:var(--ink);min-height:48px}
.apw .yd-ct{margin:4px 0 0;font-size:14px;color:var(--mute)}
.apw .yd-ct b{color:var(--accent-text)}
.apw .yd-a{margin-top:16px}
.apw .yd-go{width:100%}
.apw .yd-end{padding:20px;border-radius:22px;background:var(--band);color:#FFFFFF}
.apw .yd-end h3{margin:0;font-size:26px;font-weight:800;letter-spacing:-.03em}
.apw .yd-end p{margin:8px 0 16px;font-size:16px;line-height:1.5;color:#D5DAF0}
.apw .yd-again{display:flex;align-items:center;justify-content:center;width:100%;min-height:48px;margin-top:8px;border:0;background:transparent;color:#FFFFFF;font:inherit;font-size:16px;font-weight:700;text-decoration:underline;text-underline-offset:4px;cursor:pointer}
@media (prefers-reduced-motion:reduce){.apw .yd-ring,.apw .yd-tail{animation:none}}
@media (min-width:1024px){
.apw .yd{display:grid;grid-template-columns:minmax(0,.92fr) minmax(0,1.08fr);grid-template-areas:"h y" "c y" "a y";grid-template-rows:auto auto 1fr;column-gap:72px}
.apw .yd-h{grid-area:h}
.apw .yd-c{grid-area:c}
.apw .ydw{grid-area:y;margin-top:0}
.apw .yd-a{grid-area:a;align-self:start}
.apw .yd-go{width:auto;min-width:300px}
}"""

STATE = "ydDays: 7, ydPhase: 'idle', ydStep: '', ydRunN: 0"

METHODS = r'''  _ydP() {
    return this.__ydp || (this.__ydp = @@YARD_PILES@@);
  }
  _ydN(s) {
    return Math.max(1, s.dogs * s.ydDays * 2);
  }
  _ydVals() {
    const s = this.state;
    const n = s.ydPhase === 'idle' ? this._ydN(s) : s.ydRunN;
    const all = this._ydP();
    const shown = Math.min(n, all.length);
    const lbs = Math.max(1, Math.round(s.dogs * s.ydDays * 0.75));
    const days = s.ydDays === 1 ? '1 day' : s.ydDays + ' days';
    const steps = { enter: 'We shut the gate behind us.', rows: 'We pick up every pile, row by row.', spray: 'We spray the spots your dogs use most. It is free.', exit: 'We latch the gate and pull on it.', photo: 'We send you a photo of your latched gate.' };
    return {
      ydDays: s.ydDays,
      ydDaysLabel: days,
      ydN: n,
      ydLbs: lbs,
      ydPileWord: n === 1 ? 'pile' : 'piles',
      ydPiles: all.slice(0, shown).map((p) => ({ t: 'translate(' + p[0] + ' ' + p[1] + ') rotate(' + p[2] + ')' })),
      ydCls: 'ydw' + (s.ydPhase !== 'idle' ? (s.ydPhase === 'done' ? ' done' : ' run') : '') + (s.ydStep ? ' st-' + s.ydStep : ''),
      ydIdle: s.ydPhase === 'idle',
      ydRunning: s.ydPhase === 'run',
      ydDone: s.ydPhase === 'done',
      ydAria: s.ydPhase === 'done' ? 'The same backyard, clean, with the gate latched.' : 'A backyard from above with ' + n + ' ' + (n === 1 ? 'pile' : 'piles') + ' of dog poop.',
      ydStatus: s.ydPhase === 'done' ? 'All clean. ' + n + ' ' + (n === 1 ? 'pile' : 'piles') + ' gone, and the gate is latched.' : (steps[s.ydStep] || ('This is a yard after ' + days + ' with ' + (s.dogs === 1 ? '1 dog' : s.dogs + ' dogs') + '.')),
      ydSetDays: (e) => {
        const v = Math.max(1, Math.min(30, parseInt(e && e.target ? e.target.value : 7, 10) || 7));
        this._ydReset();
        this.setState({ ydDays: v, ydPhase: 'idle', ydStep: '' });
      },
      ydGo: () => this._ydStart(),
      ydAgain: () => {
        this._ydReset();
        this.setState({ ydPhase: 'idle', ydStep: '' });
      }
    };
  }
  _ydEls() {
    const root = this.__root || document;
    return {
      sc: root.querySelector('#yd-sc'),
      trail: root.querySelector('#yd-trail'),
      clock: root.querySelector('#yd-clock'),
      piles: Array.prototype.slice.call(root.querySelectorAll('#yd-piles .ydp'))
    };
  }
  _ydReset() {
    if (this._ydRaf) cancelAnimationFrame(this._ydRaf);
    this._ydRaf = 0;
    if (typeof document === 'undefined') return;
    const e = this._ydEls();
    e.piles.forEach((p) => p.classList.remove('gone'));
    if (e.trail) e.trail.setAttribute('stroke-dashoffset', '1');
    if (e.sc) e.sc.setAttribute('transform', 'translate(372 68)');
    if (e.clock) e.clock.textContent = '10:00 AM';
  }
  _ydStop() {
    if (this._ydRaf) cancelAnimationFrame(this._ydRaf);
    this._ydRaf = 0;
  }
  _ydStart() {
    if (this.state.ydPhase === 'run') return;
    const n = this._ydN(this.state);
    const reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    this._ydReset();
    this.setState({ ydPhase: 'run', ydRunN: n, ydStep: 'enter' }, () => this._ydRun(n, reduce));
  }
  _ydRun(n, reduce) {
    const e = this._ydEls();
    const all = this._ydP();
    const ROW0 = 40, GAP = 39, X0 = 26, X1 = 334, LEN = X1 - X0, ROWS = 8;
    const rowsLen = ROWS * LEN + (ROWS - 1) * GAP;
    const pts = [[372, 68], [334, 68], [334, 40]];
    for (let k = 0; k < ROWS; k++) {
      const y = ROW0 + GAP * k;
      if (k % 2 === 0) pts.push([X0, y]); else pts.push([X1, y]);
      if (k < ROWS - 1) pts.push([k % 2 === 0 ? X0 : X1, y + GAP]);
    }
    pts.push([334, 68], [372, 68]);
    const seg = [];
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      const d = Math.abs(pts[i][0] - pts[i - 1][0]) + Math.abs(pts[i][1] - pts[i - 1][1]);
      seg.push([total, d, pts[i - 1], pts[i]]);
      total += d;
    }
    const ENTRY = 66, EXIT0 = ENTRY + rowsLen;
    const at = (d) => {
      d = Math.max(0, Math.min(total, d));
      for (let i = 0; i < seg.length; i++) {
        const s = seg[i];
        if (d <= s[0] + s[1] || i === seg.length - 1) {
          const f = s[1] ? (d - s[0]) / s[1] : 0;
          return [s[2][0] + (s[3][0] - s[2][0]) * f, s[2][1] + (s[3][1] - s[2][1]) * f];
        }
      }
      return pts[0];
    };
    const when = e.piles.map((el, i) => {
      const p = all[i] || [0, 0];
      const k = Math.max(0, Math.min(ROWS - 1, Math.round((p[1] - ROW0) / GAP)));
      const x = Math.max(X0, Math.min(X1, p[0]));
      return (k * (LEN + GAP) + (k % 2 === 0 ? X1 - x : x - X0)) / rowsLen;
    });
    const picked = () => this.__root ? this.__root.querySelector('#yd-picked') : document.getElementById('yd-picked');
    const shown = e.piles.length;
    const finish = () => {
      e.piles.forEach((p) => p.classList.add('gone'));
      if (e.trail) e.trail.setAttribute('stroke-dashoffset', '0');
      if (e.clock) e.clock.textContent = '10:19 AM';
      this._ydRaf = 0;
      this.setState({ ydPhase: 'done', ydStep: '' });
    };
    if (reduce) { finish(); return; }
    const T = [['enter', 800], ['rows', 5600], ['spray', 1300], ['exit', 1100], ['photo', 1300]];
    const D = T.reduce((a, b) => a + b[1], 0);
    let step = 'enter', done = 0;
    const t0 = performance.now();
    const frame = (now) => {
      if (this.state.ydPhase !== 'run') return;
      const t = now - t0;
      let acc = 0, cur = T[T.length - 1][0], local = 1;
      for (let i = 0; i < T.length; i++) {
        if (t < acc + T[i][1]) { cur = T[i][0]; local = (t - acc) / T[i][1]; break; }
        acc += T[i][1];
      }
      if (t >= D) { finish(); return; }
      if (cur !== step) { step = cur; this.setState({ ydStep: cur }); }
      let d;
      if (cur === 'enter') d = ENTRY * local;
      else if (cur === 'rows') d = ENTRY + rowsLen * local;
      else if (cur === 'spray') d = EXIT0;
      else if (cur === 'exit') d = EXIT0 + (total - EXIT0) * local;
      else d = total;
      const p = at(d);
      if (e.sc) e.sc.setAttribute('transform', 'translate(' + p[0].toFixed(1) + ' ' + p[1].toFixed(1) + ')');
      const rp = cur === 'enter' ? 0 : cur === 'rows' ? local : 1;
      if (e.trail) e.trail.setAttribute('stroke-dashoffset', (1 - rp).toFixed(4));
      for (let i = 0; i < shown; i++) {
        if (rp >= when[i] && !e.piles[i].classList.contains('gone')) { e.piles[i].classList.add('gone'); done++; }
      }
      const pk = picked();
      if (pk) pk.textContent = String(rp >= 1 ? n : Math.round(done / Math.max(1, shown) * n));
      if (e.clock) {
        const m = Math.min(19, Math.floor(t / D * 20));
        e.clock.textContent = '10:' + (m < 10 ? '0' + m : m) + ' AM';
      }
      this._ydRaf = requestAnimationFrame(frame);
    };
    this._ydRaf = requestAnimationFrame(frame);
  }
'''


def fill():
    return {
        'YARD_SECTION': SECTION.replace('@@YARD_SVG@@', SVG).replace('@@YARD_GATE@@', GATE_PHOTO),
        'YARD_CSS': CSS,
        'YARD_METHODS': METHODS.replace('@@YARD_PILES@@', json.dumps([list(p) for p in PILES], separators=(',', ':'))),
        'YARD_STATE': STATE,
    }

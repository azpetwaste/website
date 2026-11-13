"""The home page map: the whole Phoenix area by ZIP code. Our six ZIP codes are orange; the rest of the Valley is coming soon.
Data from valleydata.json (made by valleygen.py from US Census ZIP shapes)."""
import json
import os

_D = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'valleydata.json')))
W, H = _D['W'], _D['H']
# served town labels sit inside each area; coming soon cities get a small tag under the name
TOWN_LABELS = [('Buckeye', 110, 500), ('Verrado', 140, 352), ('Goodyear', 262, 440), ('Litchfield Park', 268, 300), ('Citrus Park', 236, 252)]


def _overlay(d, hole, pick):
    return '<path class="mplc" d="%s" style="fill: {{ %s }};" onClick="{{ %s }}"></path>' % (d, hole, pick)


def build(pick_v, pick_c, pick_g, pick_l, pick_b):
    town = ''.join('<text class="vtown" x="%d" y="%d" text-anchor="middle">%s</text>' % (x, y, n) for n, x, y in TOWN_LABELS)
    city = ''.join('<text class="vcity" x="%d" y="%d" text-anchor="middle">%s</text><text class="vtag" x="%d" y="%d" text-anchor="middle">COMING SOON</text>'
                   % (x, y, n, x, y + 13) for n, x, y in _D['cities'] if n not in ('Avondale', 'Sun City'))
    return (
        '<svg viewBox="0 0 %d %d" role="img" aria-label="Map of the Phoenix area by ZIP code. Arizona Pet Waste scoops every home in Buckeye, Goodyear, '
        'Litchfield Park and Citrus Park. The rest of the Valley is coming soon.">' % (W, H) +
        '<rect class="vland" x="0" y="0" width="%d" height="%d"></rect>' % (W, H) +
        '<path class="vsoon" d="' + _D['SOON'] + '"></path>'
        '<path class="vserve" d="' + _D['SERVED'] + '"></path>'
        + _overlay(_D['B'], 'bB', pick_b) + _overlay(_D['G'], 'bG', pick_g) + _overlay(_D['L'], 'bL', pick_l)
        + _overlay(_D['CP'], 'bC', pick_c) + _overlay(_D['V'], 'bV', pick_v) +
        '<path class="vline" d="' + _D['LINES'] + '"></path>'
        '<path class="vedge" d="' + _D['EDGE'] + '"></path>'
        '<text class="vbig" x="640" y="600" text-anchor="middle">COMING SOON</text>'
        + city + town +
        '</svg>')


VALLEY_CSS = r"""
.vmap{position:relative;margin:22px -20px 0;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;overscroll-behavior-x:contain;background:#EFE6D6;border-top:1px solid var(--line);border-bottom:1px solid var(--line);scrollbar-width:thin}
.vmap svg{display:block;width:820px;max-width:none;height:auto}
.dark .vmap{background:#0E1530}
.vland{fill:#EFE6D6}.dark .vland{fill:#0E1530}
.vsoon{fill:#D6DAE8}.dark .vsoon{fill:#1A2246}
.vserve{fill:rgba(255,74,28,.32)}.dark .vserve{fill:rgba(255,74,28,.36)}
.vline{fill:none;stroke:#FFFFFF;stroke-width:1.1;stroke-linejoin:round;pointer-events:none}.dark .vline{stroke:#2B3468}
.vedge{fill:none;stroke:#FF4A1C;stroke-width:2.6;stroke-linejoin:round;pointer-events:none}
.vmap .mplc{cursor:pointer;transition:fill .2s ease}
.vtown{font:800 17px "Schibsted Grotesk",system-ui,sans-serif;letter-spacing:-.01em;fill:#0E1430;paint-order:stroke;stroke:#FFFFFF;stroke-width:4px;stroke-linejoin:round;pointer-events:none}
.dark .vtown{fill:#F6F4EF;stroke:#0E1530}
.vcity{font:700 14px "Schibsted Grotesk",system-ui,sans-serif;fill:#3E4668;paint-order:stroke;stroke:#D6DAE8;stroke-width:3px;pointer-events:none}
.dark .vcity{fill:#D5DAF0;stroke:#1A2246}
.vtag{font:600 9px "IBM Plex Mono",ui-monospace,monospace;letter-spacing:.12em;fill:#B02A08;pointer-events:none}
.dark .vtag{fill:#FF8A66}
.vbig{font:800 34px "Archivo","Arial Black",sans-serif;letter-spacing:.2em;fill:rgba(14,20,48,.09);pointer-events:none}
.dark .vbig{fill:rgba(246,244,239,.07)}
.vswipe{display:flex;align-items:center;gap:8px;margin:10px 0 0;font-size:13px;color:var(--mute)}
.vkey{display:flex;flex-direction:column;gap:10px;margin:16px 0 0;padding:0;list-style:none}
.vkey li{display:flex;align-items:flex-start;gap:10px;font-size:15px;line-height:1.45;color:var(--ink2)}
.vkey i{flex:0 0 22px;width:22px;height:16px;margin-top:3px;border-radius:5px}
.vkey .k1{background:rgba(255,74,28,.32);box-shadow:inset 0 0 0 2px #FF4A1C}
.vkey .k2{background:#D6DAE8}.dark .vkey .k2{background:#1A2246;box-shadow:inset 0 0 0 1px #2B3468}
.vkey a{font-weight:700}
@media (min-width:1024px){
.apw .wh.whv{grid-template-columns:minmax(0,1fr) minmax(0,1fr);grid-template-areas:"h c" "m m";grid-template-rows:auto auto;row-gap:40px;align-items:start}
.apw .whv .vmap{grid-area:m;margin:0;overflow:hidden;border:1px solid var(--line);border-radius:24px}
.apw .whv .vmap svg{width:100%}
.vswipe{display:none}
}"""

VALLEY_KEY = ('<p class="vswipe" aria-hidden="true">Swipe the map to see the whole Valley →</p>'
              '<ul class="vkey">'
              '<li><i class="k1"></i><span><b>We scoop here.</b> Every home in 6 ZIP codes: 85326, 85338, 85340, 85355, 85395 and 85396.</span></li>'
              '<li><i class="k2"></i><span><b>Coming soon.</b> The rest of the Valley. <a href="Booking.dc.html">Join the waitlist</a>. We will tell you when we start in your area.</span></li>'
              '</ul>')

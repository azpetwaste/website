"""A true map of the West Valley service area, drawn from OpenStreetMap data pulled Nov 6 2026.
World units: 15 per km. x = (lon + 112.60) * 1392.4, y = (33.60 - lat) * 1658.55.
Boundaries (Verrado, Citrus Park CDP, Goodyear, Litchfield Park, Luke AFB, White Tank and Skyline parks) come from
Nominatim; roads, canals and the Agua Fria come from Overpass. Map data © OpenStreetMap contributors (ODbL).
ZIP code areas (Z_*) are US Census ZCTAs (via OpenDataDE), clipped to the view and simplified."""
import json
import os

_D = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'mapdata.json')))

VIEW = (18, 18, 384, 316)

I10 = ('M-20 287L2 281 6 279 13 276 19 273 23 272 27 271 50 262 61 257 72 253 113 237 120 235 124 233 130 231 134 230 140 229 '
       '145 228 168 228 183 228 192 229 204 230 217 230 252 229 262 229 274 230 300 230 313 232 322 235 344 236 360 236 395 236 401 235 409 233 418 231 430 231')
L303 = 'M253 -20L253 152 252 162 250 177 247 190 245 200 243 210 241 220 240 227 240 238 241 246 241 262'
NPKWY = 'M264 68L296 68 312 68 322 69 336 70 341 72 349 80 359 81 370 81 393 82 430 82'

ART = [
    # north and south
    'M121 165L121 178Q124 215 133 247L133 330', 'M169 129V339', 'M193 20V336', 'M217 20V321', 'M241 20V344', 'M265 20V321',
    'M288 20V104', 'M266 153C270 175 285 190 289 229', 'M289 229V335', 'M312 20V81M312 136V309', 'M336 20V157L331 165V236L337 251V321',
    'M360 20V276', 'M385 20V345', 'M61 255V333', 'M37 273V336', 'M85 273V345', 'M113 273V349',
    # east and west
    'M193 33H384', 'M193 57H430', 'M217 81H430', 'M217 105H294M336 105H430', 'M192 129H385', 'M169 153H430',
    'M123 165Q135 176 150 177H430', 'M217 201H430', 'M133 225H430', 'M169 249H430', 'M19 274H337', 'M13 297H421', 'M-10 322H430',
]

CANALS = [
    'M208 -88L210 -76 206 -73 201 -62 197 -60 198 -53 196 -47 198 -44 199 -28 196 -22 196 -12 184 8 181 18 181 200',
    'M460 224L457 223 457 218 450 218 450 206 444 206 444 188 410 190 398 187 393 187 378 185 371 193 341 189 331 193 315 201 294 202 291 205 289 214 '
    '285 225 265 225 257 227 253 231 242 235 237 237 220 246 213 245 152 273 113 292 95 298 40 310 -3 311 -18 309 -35 315',
    'M392 112L383 122 374 141 373 146 368 153 365 155 356 153 352 158 348 163 342 166 338 170 335 172 331 171 319 169 313 171',
]
RIVERS = [
    'M408 -36L412 -31 413 -26 408 12 406 19 393 38 391 53 395 60 396 76 390 88 389 98 390 106 399 119 402 129 408 136 407 157 404 159 397 174 '
    '393 195 388 213 371 235 373 273 365 297 362 302 353 303 347 307 338 339',
]
RUNWAYS = 'M311 94L281 128M323 88L293 121M325 278L301 308'

# where the truck dot drives: Verrado at I 10, east to Perryville Road, north to Camelback, east to Cotton Lane
TRUCK_KEYS = '0%{transform:translate(133px,229px)}32%{transform:translate(193px,229px)}73%{transform:translate(193px,153px)}92%,100%{transform:translate(241px,153px)}'


ZIPS = ['85326', '85338', '85340', '85355', '85395', '85396']
# label spots inside each ZIP's visible part of the map
ZIP_LABELS = {'85355': (222, 62), '85396': (112, 174), '85326': (96, 299), '85338': (262, 290), '85395': (266, 209), '85340': (346, 186)}


def _shape(d, hole, pick):
    return '<path class="mplc" d="%s" style="fill: {{ %s }};" onClick="{{ %s }}"></path>' % (d, hole, pick)


def _place(key, hole, pick):
    return _shape(_D['P_' + key.upper()], hole, pick)


def _zips(*zips):
    return ''.join(_D['Z_' + z] for z in zips)


def _label(x, y, lines, cls='mplace'):
    return ''.join('<text class="%s" x="%d" y="%d" text-anchor="middle">%s</text>' % (cls, x, y + i * 13, t) for i, t in enumerate(lines))


# neighbors we do not serve yet: a label at the map edge that points toward each one
SOON = [('SURPRISE ↑', 300, 32), ('PEORIA ↗', 370, 32), ('GLENDALE →', 350, 72), ('LAVEEN ↘', 366, 304)]


def _soon():
    return ''.join('<text class="msn" x="%d" y="%d" text-anchor="middle">%s</text><text class="mst" x="%d" y="%d" text-anchor="middle">COMING SOON</text>'
                   % (x, y, n, x, y + 10) for n, x, y in SOON)


def build(pick_v, pick_c, pick_g, pick_l, pick_b):
    return (
        '<svg viewBox="%d %d %d %d" role="img" aria-label="Map of the ZIP codes Arizona Pet Waste scoops: Buckeye 85326 and 85396, '
        'Goodyear 85338 and 85395, Litchfield Park 85340, and Waddell and Citrus Park 85355">' % VIEW +
        '<rect class="mland" x="-20" y="-20" width="460" height="380"></rect>'
        '<path class="mmtn" d="' + _D['MTN'] + '"></path><path class="mridge" d="' + _D['RIDGES'] + '"></path>'
        '<path class="mbase" d="' + _D['LUKE'] + '"></path><path class="mrun" d="' + RUNWAYS + '"></path>'
        + ''.join('<path class="mcanal" d="%s"></path>' % c for c in CANALS)
        + ''.join('<path class="mriver" d="%s"></path>' % r for r in RIVERS)
        + '<path class="mart" d="' + ''.join(ART) + '"></path>'
        + ''.join('<path class="mzipf" d="%s"></path>' % _D['Z_' + z] for z in ZIPS)
        + _shape(_zips('85326', '85396'), 'bB', pick_b) + _shape(_zips('85338', '85395'), 'bG', pick_g)
        + _shape(_zips('85340'), 'bL', pick_l) + _shape(_zips('85355'), 'bC', pick_c) + _place('verrado', 'bV', pick_v)
        + ''.join('<path class="mzipl" d="%s"></path>' % _D['Z_' + z] for z in ZIPS) +
        '<path class="mfwy0" d="' + I10 + L303 + NPKWY + '"></path><path class="mfwy" d="' + I10 + L303 + NPKWY + '"></path>'
        '<g class="mnolook"><rect x="84" y="236" width="22" height="16" rx="4" fill="#2A5DB0"></rect><text x="95" y="248" text-anchor="middle" class="mshield" fill="#FFFFFF">10</text></g>'
        '<g class="mnolook"><rect x="319" y="227" width="22" height="16" rx="4" fill="#2A5DB0"></rect><text x="330" y="239" text-anchor="middle" class="mshield" fill="#FFFFFF">10</text></g>'
        '<g class="mnolook"><rect x="240" y="40" width="26" height="16" rx="8" fill="#FFFFFF" stroke="#0E1430" stroke-width="1.2"></rect><text x="253" y="52" text-anchor="middle" class="mshield" fill="#0E1430">303</text></g>'
        + _label(66, 42, ['WHITE TANK', 'MOUNTAINS'], 'mtxt mtxtm') + _label(318, 106, ['LUKE AFB'], 'mtxt')
        + _label(370, 266, ['PHOENIX →'], 'mtxt')
        + '<text class="mtxt" x="398" y="122" transform="rotate(-90 398 122)">AGUA FRIA</text>'
        + _label(112, 160, ['VERRADO']) + _label(217, 98, ['CITRUS', 'PARK']) + _label(266, 196, ['GOODYEAR']) + _label(346, 160, ['LITCHFIELD', 'PARK'])
        + _label(96, 286, ['BUCKEYE']) + _label(262, 277, ['GOODYEAR']) + _soon()
        + ''.join('<text class="mzipt" x="%d" y="%d" text-anchor="middle">%s</text>' % (x, y, z) for z, (x, y) in ZIP_LABELS.items()) +
        '<g class="mtruck"><circle r="8" fill="#FF4A1C" opacity=".25"></circle><circle r="4.5" fill="#FF4A1C" stroke="#FFFFFF" stroke-width="1.8"></circle></g>'
        '<text class="mattr" x="399" y="331" text-anchor="end">© OpenStreetMap · ZIP areas: US Census</text>'
        '</svg>'
    )


MAP_CSS = (
    '.map{position:relative;overflow:hidden;margin:22px -20px 0;aspect-ratio:%d/%d;background:#F3E7D2;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}' % (VIEW[2], VIEW[3]) +
    r""".map svg{position:absolute;inset:0;width:100%;height:100%;display:block}
.mland{fill:#F3E7D2}.dark .mland{fill:#141D3D}
.mmtn{fill:#D3C1AD}.dark .mmtn{fill:#2D2A4A}
.mridge{fill:none;stroke:#B39E88;stroke-width:1.3;stroke-linecap:round;stroke-linejoin:round}.dark .mridge{stroke:#463F6B}
.mbase{fill:#E4DCCD}.dark .mbase{fill:#1B2449}
.mrun{fill:none;stroke:#CFC5B4;stroke-width:4;stroke-linecap:round}.dark .mrun{stroke:#2C3767}
.mart{fill:none;stroke:#FFFFFF;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.dark .mart{stroke:#28346A}
.mcanal{fill:none;stroke:#8CC4E6;stroke-width:1.4;stroke-linejoin:round}.dark .mcanal{stroke:#3D6E95}
.mriver{fill:none;stroke:#8DBEE0;stroke-width:1.6;stroke-linecap:round;opacity:.7}
.mzipf{fill:rgba(255,74,28,.07);pointer-events:none}.dark .mzipf{fill:rgba(255,74,28,.10)}
.mzipl{fill:none;stroke:#FF4A1C;stroke-width:1;stroke-linejoin:round;opacity:.45;pointer-events:none}
.mzipt{font-family:Archivo,"Arial Narrow",Arial,sans-serif;font-stretch:82%;font-size:10px;font-weight:600;letter-spacing:.04em;fill:#B02A08;paint-order:stroke;stroke:#F3E7D2;stroke-width:3px;stroke-linejoin:round;pointer-events:none}.dark .mzipt{fill:#FF8A66;stroke:#141D3D}
.mplc{cursor:pointer;transition:fill .25s ease}
.mfwy0{fill:none;stroke:#D99A3A;stroke-width:6;stroke-linecap:round;stroke-linejoin:round;pointer-events:none}
.mfwy{fill:none;stroke:#F7C66A;stroke-width:3.8;stroke-linecap:round;stroke-linejoin:round;pointer-events:none}
.dark .mfwy0{stroke:#7A5A26}.dark .mfwy{stroke:#B98B3E}
.mnolook,.mtxt,.mplace,.mattr,.mtruck{pointer-events:none}
.mtxt{font-family:Archivo,"Arial Narrow",Arial,sans-serif;font-stretch:82%;font-size:10px;font-weight:600;letter-spacing:.06em;fill:#7A6F60}.dark .mtxt{fill:#9AA2C8}
.mtxtm{fill:#5E5045}.dark .mtxtm{fill:#C9CEE6}
.mplace{font-family:Archivo,"Arial Black",sans-serif;font-size:11.5px;font-weight:800;letter-spacing:.05em;fill:#0E1430;paint-order:stroke;stroke:#F3E7D2;stroke-width:3.2px;stroke-linejoin:round}
.dark .mplace{fill:#FFFFFF;stroke:#141D3D}
.mshield{font-family:Archivo,"Arial Narrow",Arial,sans-serif;font-stretch:82%;font-size:10px;font-weight:600}
.mattr{font-family:Archivo,"Arial Narrow",Arial,sans-serif;font-stretch:82%;font-size:8px;fill:#8A7F70}.dark .mattr{fill:#7F88B0}
.mtruck{animation:mapDrive 9s ease-in-out infinite}
@keyframes mapDrive{""" + TRUCK_KEYS + r"""}
.mchips{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.mchip{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 15px 0 12px;border-radius:999px;border:1.6px solid var(--ink);font:inherit;font-size:15px;font-weight:700;cursor:pointer;text-decoration:none;white-space:nowrap}
.mchip i{display:block;width:12px;height:12px;border-radius:4px;border:2px solid #FF4A1C}
.mkey{display:flex;align-items:center;gap:10px;margin:12px 0 0;font-size:15px;line-height:1.45;color:var(--ink2)}
.mkey-sw{flex:0 0 16px;width:16px;height:16px;border-radius:5px;background:#FF4A1C}
.msn{font-family:Archivo,"Arial Black",sans-serif;font-size:10px;font-weight:800;letter-spacing:.06em;fill:#4A5272;paint-order:stroke;stroke:#F3E7D2;stroke-width:3px;stroke-linejoin:round;pointer-events:none}
.dark .msn{fill:#AEB5D8;stroke:#141D3D}
.mst{font-family:Archivo,"Arial Narrow",Arial,sans-serif;font-stretch:82%;font-size:7.5px;font-weight:600;letter-spacing:.1em;fill:#B02A08;paint-order:stroke;stroke:#F3E7D2;stroke-width:2.6px;stroke-linejoin:round;pointer-events:none}
.dark .mst{fill:#FF8A66;stroke:#141D3D}
@media (prefers-reduced-motion:reduce){.mtruck{animation:none;transform:translate(193px,190px)}.mplc{transition:none}}""")

MAP_KEY = ('<p class="mkey"><i class="mkey-sw" aria-hidden="true"></i>'
           '<span>We scoop every home inside the orange lines. Every street.</span></p>')

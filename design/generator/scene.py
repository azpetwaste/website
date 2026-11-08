"""The live visit scene, v3: an Arizona street, the logo truck, a camera that follows the truck and
zooms into the backyard, and a drag bar to move through the visit. 24 second loop."""
import random

LOOP = 24.0
# brand files (design canvas asset urls; the website export maps them to /assets/img/...)
BLOB_LOGO = '/_blob/d40859938aad2cb6ad7648561b9a1a69'       # logo-horizontal.svg: Arizona state mark + name, navy
BLOB_LOGO_DARK = '/_blob/1467d93cd9b58ca9dd49fc16c4ec494b'  # logo-horizontal-dark.svg: same, cream for dark backgrounds
BLOB_MARK = '/_blob/ad31f5b41783c555e611fe77885d676a'       # mark-round.svg: state mark in a cream circle
BLOB_MARK_DARK = '/_blob/a7a03153bb6d296b31597e8bc38011c5'  # mark-round-dark.svg: state mark in a navy circle
# the logo on the side of the truck (the box is 52 x 22, the orange stripe starts at y 194)
TRUCK_LOGO = '<image href="' + BLOB_LOGO + '" x="3" y="178.5" width="46" height="14" preserveAspectRatio="xMidYMid meet"></image>'
# camera shots, in world units: screen = translate + scale * world
#   start wide (x -20..340) -> arrival (x 330..690) -> backyard zoom (x 545..745, y 40..190)
#   -> gate check (x 430..687) -> drive off wide (x 480..840)
PICKUPS = [6.919, 7.981, 8.931, 9.994, 11.131, 12.194, 13.373, 14.279]
PILES = [(620, 155, 1.0), (705, 155, 1.0), (725, 147, .95), (640, 147, .95), (605, 139, .9), (690, 139, .9), (725, 131, .85), (670, 131, .85)]
MISTS = [(681, 131), (690, 140), (650, 145), (611, 149)]
SPARKS = [(640, 126), (712, 135), (675, 147)]
CHAPTERS = [3.4, 5.8, 14.8, 17.8, 20.2]


def n(v):
    s = ('%.2f' % v).rstrip('0').rstrip('.')
    return '0' if s in ('-0', '') else s


def pct(t):
    return n(t / LOOP * 100)


def pile_d(cx, cy, k):
    pts = [(-4.6, 1.2), (-4.6, -1.2), (-2.2, -1.6), (-2.4, -3.8), (0, -4.4), (2.4, -3.8), (2.2, -1.6), (4.6, -1.2), (4.6, 1.2)]
    p = [(n(cx + dx * k), n(cy + dy * k)) for dx, dy in pts]
    return ('M%s %s' % p[0] + 'Q%s %s %s %s' % (p[1] + p[2]) + 'Q%s %s %s %s' % (p[3] + p[4]) +
            'Q%s %s %s %s' % (p[5] + p[6]) + 'Q%s %s %s %s' % (p[7] + p[8]) + 'Z')


def spark_d(cx, cy):
    return 'M%s %sl1.3 3.2 3.2 1.3-3.2 1.3-1.3 3.2-1.3-3.2-3.2-1.3 3.2-1.3z' % (n(cx), n(cy - 4.5))


def saguaro(x, y, h, k=1.0, flip=False):
    s = -1 if flip else 1
    w = 7 * k
    la, ra = y - h * 0.42, y - h * 0.6
    out = '<rect x="%s" y="%s" width="%s" height="%s" rx="%s" fill="#5E8B4A"></rect>' % (n(x - w / 2), n(y - h), n(w), n(h), n(w / 2))
    out += ('<path d="M%s %sH%sV%s" stroke="#5E8B4A" stroke-width="%s" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>'
            % (n(x), n(la), n(x - s * 9 * k), n(la - 15 * k), n(5 * k)))
    out += ('<path d="M%s %sH%sV%s" stroke="#5E8B4A" stroke-width="%s" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>'
            % (n(x), n(ra), n(x + s * 8 * k), n(ra - 11 * k), n(4.6 * k)))
    out += '<path d="M%s %sV%s" stroke="#79A35F" stroke-width="1" fill="none"></path>' % (n(x - 1.2 * k), n(y - h + 3), n(y - 2))
    return out


def agave(x, y, k=1.0):
    leaves = [(-9, 0, -8, -7, -4, 0), (-5, 0, -3, -11, 0, 0), (-1, 0, 1, -13, 3, 0), (2, 0, 6, -10, 6, 0), (5, 0, 10, -6, 9, 0)]
    d = ''.join('M%s %sL%s %sL%s %sZ' % (n(x + a * k), n(y + b * k), n(x + c * k), n(y + e * k), n(x + f * k), n(y + g * k)) for a, b, c, e, f, g in leaves)
    return '<path d="%s" fill="#6F9B8C"></path>' % d


def barrel(x, y, k=1.0):
    return ('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="#6E9A4E"></ellipse>' % (n(x), n(y - 5 * k), n(5 * k), n(5.5 * k)) +
            '<path d="M%s %sV%sM%s %sV%s" stroke="#86B266" stroke-width=".8" fill="none"></path>' % (n(x - 2 * k), n(y - 9 * k), n(y - 1 * k), n(x + 2 * k), n(y - 9 * k), n(y - 1 * k)) +
            '<circle cx="%s" cy="%s" r="%s" fill="#F2C94C"></circle>' % (n(x), n(y - 10.4 * k), n(1.4 * k)))


def palo_verde(x, y, k=1.0):
    out = '<path d="M%s %sC%s %s %s %s %s %sM%s %sC%s %s %s %s %s %s" stroke="#8FA65A" stroke-width="%s" fill="none" stroke-linecap="round"></path>' % (
        n(x), n(y), n(x - 1), n(y - 14 * k), n(x - 8 * k), n(y - 20 * k), n(x - 14 * k), n(y - 27 * k),
        n(x), n(y - 10 * k), n(x + 3 * k), n(y - 18 * k), n(x + 10 * k), n(y - 22 * k), n(x + 15 * k), n(y - 29 * k), n(2.2 * k))
    for cx, cy, r, c in [(-14, -31, 9, '#B6C46A'), (-4, -35, 10, '#C3CF77'), (8, -34, 10, '#B6C46A'), (16, -30, 8, '#C3CF77'), (2, -27, 9, '#AEBD62')]:
        out += '<circle cx="%s" cy="%s" r="%s" fill="%s"></circle>' % (n(x + cx * k), n(y + cy * k), n(r * k), c)
    for cx, cy in [(-12, -34), (-2, -39), (9, -37), (15, -31), (3, -30), (-7, -29)]:
        out += '<circle cx="%s" cy="%s" r="%s" fill="#E7CF3E"></circle>' % (n(x + cx * k), n(y + cy * k), n(1.1 * k))
    return out


def scallops(x0, x1, y, step=5.5):
    d = 'M%s %s' % (n(x0), n(y))
    x = x0
    while x + step <= x1 + 0.01:
        d += 'q%s 3.2 %s 0' % (n(step / 2), n(step))
        x += step
    return '<path d="%s" stroke="#A5412A" stroke-width="1.4" fill="none"></path>' % d


def tile_house(x, w, body, roof, eave, top=96):
    """Stucco house with a low red tile roof, garage, window and arched door."""
    out = '<rect x="%s" y="%s" width="%s" height="%s" fill="%s"></rect>' % (n(x), n(top), n(w), n(172 - top), body)
    out += '<path d="M%s %sL%s %s %s %sZ" fill="%s"></path>' % (n(x - 8), n(top + 2), n(x + w / 2), n(top - 26), n(x + w + 8), n(top + 2), roof)
    out += '<rect x="%s" y="%s" width="%s" height="4" fill="%s"></rect>' % (n(x - 10), n(top), n(w + 20), eave)
    out += scallops(x - 9, x + w + 9, top + 4)
    return out


def garage(x, y=130, w=54):
    return ('<rect x="%s" y="%s" width="%s" height="%s" fill="#F6EADA"></rect>' % (n(x), n(y), n(w), n(172 - y)) +
            '<path d="M%s %sH%sM%s %sH%sM%s %sH%s" stroke="#E2D2BC" stroke-width="1" fill="none"></path>' % (
                n(x), n(y + 10), n(x + w), n(x), n(y + 20), n(x + w), n(x), n(y + 31), n(x + w)))


def arch_door(x, color='#7A5236'):
    return '<path d="M%s 172V148a9 9 0 0 1 18 0V172Z" fill="%s"></path><circle cx="%s" cy="160" r=".9" fill="#F2C94C"></circle>' % (n(x), color, n(x + 14))


rng = random.Random(7)
_speck = ''.join('<circle cx="%s" cy="%s" r="%s"></circle>' % (n(rng.uniform(-60, 980)), n(rng.uniform(173, 181)), n(rng.uniform(.5, .9))) for _ in range(46))
_dashes = ''.join('<rect x="%d" y="209" width="16" height="2"></rect>' % x for x in range(-200, 1100, 34))
_piles = ''.join('<path class="pile p%d" d="%s"></path>' % (i + 1, pile_d(*p)) for i, p in enumerate(PILES))
_mists = ''.join('<circle class="mist m%d" cx="%d" cy="%d" r="5"></circle>' % (i + 1, x, y) for i, (x, y) in enumerate(MISTS))
_sparks = ''.join('<path class="spark k%d" d="%s"></path>' % (i + 1, spark_d(x, y)) for i, (x, y) in enumerate(SPARKS))
_turf = ''.join('<rect x="569" y="%d" width="196" height="4"></rect>' % y for y in (126, 134, 142, 150))
_vigas = ''.join('<rect x="%d" y="108" width="7" height="3" rx="1" fill="#7A5236"></rect>' % x for x in range(204, 332, 18))

WORLD = (
    # ground and front yards
    '<rect x="-300" y="112" width="1600" height="80" fill="#E8D2A9"></rect>'
    '<rect x="-300" y="172" width="1600" height="10" fill="#E0C597"></rect>'
    '<g fill="#CDB07E">' + _speck + '</g>'
    # neighbor A: tile roof
    + tile_house(24, 120, '#F0D4AE', '#C4553A', '#A9442D', 100) + garage(34) +
    '<rect x="98" y="110" width="34" height="15" fill="#2A3866"></rect>' + arch_door(112) +
    # neighbor B: flat roof with vigas
    '<path d="M200 172V104H206V99H238V95H296V99H326V104H332V172Z" fill="#E6D8C3"></path>' + _vigas + garage(210, 132, 50) +
    '<rect x="270" y="116" width="30" height="16" fill="#2A3866"></rect>'
    '<rect x="306" y="138" width="17" height="34" fill="#2E9C98"></rect><circle cx="319" cy="156" r=".9" fill="#F2C94C"></circle>'
    # customer house
    + tile_house(410, 135, '#E8C29A', '#C1502E', '#A5412A', 94) + garage(420, 130, 56) + arch_door(486) +
    '<rect x="510" y="106" width="28" height="18" fill="#22305E"></rect>'
    '<g class="dogw"><circle cx="524" cy="117" r="4.6" fill="#B07A4A"></circle>'
    '<ellipse cx="519.6" cy="114.4" rx="1.7" ry="3.2" fill="#7A4E2A"></ellipse><ellipse cx="528.4" cy="114.4" rx="1.7" ry="3.2" fill="#7A4E2A"></ellipse>'
    '<ellipse cx="527" cy="119.2" rx="2.5" ry="1.8" fill="#D9A878"></ellipse><circle cx="528.9" cy="118.6" r=".85" fill="#2A1A10"></circle>'
    '<circle cx="523" cy="116" r=".7" fill="#2A1A10"></circle></g>'
    '<rect x="508" y="124" width="32" height="14" fill="#E8C29A"></rect>'
    '<path d="M510 124H538" stroke="#F6EADA" stroke-width="1.6"></path><path d="M524 106V124" stroke="#F6EADA" stroke-width="1"></path>'
    '<rect x="480" y="150" width="2.2" height="4" rx=".8" fill="#2A2A33"></rect>'
    # customer backyard behind the block wall
    + palo_verde(742, 112, .9) +
    '<rect x="569" y="110" width="196" height="12" fill="#DCC096"></rect><rect x="568" y="108" width="198" height="3" fill="#EDDCBF"></rect>'
    '<rect x="569" y="122" width="196" height="38" fill="#78B456"></rect>'
    '<g fill="#86C062">' + _turf + '</g>'
    '<circle cx="756" cy="129" r="2.3" fill="#FF4A1C"></circle>'
    '<g fill="#5C4B3D">' + _piles + '</g>'
    '<g fill="#BFE8F3">' + _mists + '</g>'
    '<g fill="#FFFFFF">' + _sparks + '</g>'
    # side gate and front wall
    '<rect x="545" y="146" width="3" height="28" fill="#2A2A33"></rect><rect x="566" y="146" width="3" height="28" fill="#2A2A33"></rect>'
    '<g class="gate" fill="#2A2A33"><rect x="548" y="150" width="18" height="2"></rect><rect x="548" y="166" width="18" height="2"></rect>'
    '<rect x="549" y="150" width="1.6" height="22"></rect><rect x="553.2" y="150" width="1.6" height="22"></rect><rect x="557.4" y="150" width="1.6" height="22"></rect><rect x="561.6" y="150" width="1.6" height="22"></rect></g>'
    '<rect x="569" y="160" width="196" height="12" fill="#E3C79C"></rect><rect x="568" y="158" width="198" height="3" fill="#F1E2C6"></rect>'
    '<rect x="761" y="150" width="6" height="22" fill="#D8BB8E"></rect><rect x="760" y="148" width="8" height="3" fill="#F1E2C6"></rect>'
    '<g fill="#D83A8A"><circle cx="546" cy="146" r="3.2"></circle><circle cx="550" cy="143" r="2.6"></circle><circle cx="542" cy="149" r="2.4"></circle><circle cx="571" cy="157" r="2.6"></circle></g>'
    '<g fill="#4F7D3A"><circle cx="548" cy="148" r="1.6"></circle><circle cx="544" cy="144" r="1.4"></circle><circle cx="573" cy="155" r="1.4"></circle></g>'
    # neighbor D
    + tile_house(792, 128, '#EFD2B0', '#B94E33', '#A0442C', 98) + garage(800) +
    '<rect x="868" y="110" width="34" height="16" fill="#2A3866"></rect>' + arch_door(882) +
    # driveways, plants
    '<g fill="#EFE8DC"><rect x="34" y="172" width="54" height="10"></rect><rect x="210" y="172" width="50" height="10"></rect><rect x="420" y="172" width="56" height="10"></rect><rect x="800" y="172" width="54" height="10"></rect></g>'
    + saguaro(168, 178, 64) + palo_verde(352, 178, 1.0) + saguaro(950, 178, 70, 1.05, True) +
    agave(70, 181) + barrel(132, 181) + agave(282, 181, .9) + agave(516, 181) + barrel(536, 181, .9) + agave(866, 181, .95) + barrel(906, 181) +
    # sidewalk and street
    '<rect x="-300" y="182" width="1600" height="8" fill="#ECE4D6"></rect><rect x="-300" y="189" width="1600" height="1.2" fill="#D9CFBF"></rect>'
    '<rect x="-300" y="190" width="1600" height="40" fill="#464C68"></rect>'
    '<g fill="#F4EFE6">' + _dashes + '</g>'
    # roadrunner on the sidewalk
    '<g class="rr"><path d="M7 -6Q1 -10 -4 -7L-9 -11 -8.6 -9 -11.5 -8.6 -9 -7.4Q-7 -4 -2 -3.2Z" fill="#6B5440"></path>'
    '<path d="M6 -6L15 -9.5" stroke="#5A4634" stroke-width="2" stroke-linecap="round"></path>'
    '<path d="M-7.6 -11.6L-6.6 -14 -9 -12" fill="#5A4634"></path><circle cx="-8.4" cy="-9.4" r=".6" fill="#FFFFFF"></circle>'
    '<g class="rrleg"><path d="M0 -3.4L2 0M-2 -3.4L-4 0" stroke="#5A4634" stroke-width="1" stroke-linecap="round"></path></g></g>'
    # truck with the logo
    '<g class="truck">'
    '<rect x="0" y="176" width="52" height="22" rx="2.5" fill="#FFFFFF" stroke="#0A0F24" stroke-width="1"></rect>'
    '<rect x=".5" y="194" width="51" height="2.4" fill="#FF4A1C"></rect>'
    '<path d="M52 198V178Q52 172 58 172H74Q78 172 80.5 176L87 185 91 186Q93 187 93 190V198Z" fill="#FFFFFF" stroke="#0A0F24" stroke-width="1"></path>'
    '<path d="M58 175H73.5L78.5 184H58Z" fill="#1A2552"></path><rect x="61" y="186.5" width="5" height="1.2" rx=".6" fill="#0A0F24"></rect>'
    + TRUCK_LOGO +
    '<circle cx="15" cy="199.5" r="7" fill="#0A0F24"></circle><circle cx="15" cy="199.5" r="3" fill="#C9C3B6"></circle>'
    '<circle cx="76" cy="199.5" r="7" fill="#0A0F24"></circle><circle cx="76" cy="199.5" r="3" fill="#C9C3B6"></circle>'
    '<rect x="90.4" y="188" width="2.4" height="2.2" rx=".6" fill="#FFD27A"></rect>'
    '<g class="tdot"><circle class="ring" cx="66" cy="164" r="3" fill="none" stroke="#FF4A1C" stroke-width="1.2"></circle><circle cx="66" cy="164" r="3" fill="#FF4A1C" stroke="#FFFFFF" stroke-width="1"></circle></g>'
    '</g>'
    # the scooper
    '<g class="tech"><g class="face">'
    '<circle class="ring" cx="0" cy="-31" r="2.6" fill="none" stroke="#FF4A1C" stroke-width="1.1"></circle>'
    '<circle cx="0" cy="-31" r="2.6" fill="#FF4A1C" stroke="#FFFFFF" stroke-width=".9"></circle>'
    '<line class="leg1" x1="-1" y1="-8" x2="-1" y2="0" stroke="#8C7A5B" stroke-width="2.4" stroke-linecap="round"></line>'
    '<line class="leg2" x1="1" y1="-8" x2="1" y2="0" stroke="#8C7A5B" stroke-width="2.4" stroke-linecap="round"></line>'
    '<rect x="-3.6" y="-17" width="7.2" height="10" rx="2" fill="#1A2552"></rect><circle cx="1.5" cy="-14" r=".9" fill="#FF4A1C"></circle>'
    '<rect x="-9" y="-11" width="5" height="6" rx="1" fill="#FFFFFF" stroke="#0A0F24" stroke-width=".5"></rect><rect x="-8.4" y="-12.4" width="3.8" height="1.6" rx=".5" fill="#FF4A1C"></rect>'
    '<line x1="4" y1="-14" x2="9" y2="-1" stroke="#3E4668" stroke-width="1.2" stroke-linecap="round"></line>'
    '<rect x="7.5" y="-2" width="4" height="2.2" rx=".6" fill="#3E4668"></rect>'
    '<circle cx="0" cy="-20" r="3.1" fill="#C98E6A"></circle>'
    '<path d="M-3.3 -21Q0 -25.5 3.3 -21Z" fill="#FF4A1C"></path><rect x="2.5" y="-21.6" width="3.4" height="1.2" rx=".5" fill="#E03A10"></rect>'
    '</g></g>'
)

ICON_PAUSE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M8 5v14M16 5v14"></path></svg>'
ICON_PLAY = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5l11 7-11 7z"></path></svg>'
_check = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"></path></svg>'
_ticks = ''.join('<span class="vtick" style="left: calc(9px + (100%% - 18px) * %s);"></span>' % n(t / LOOP) for t in CHAPTERS)

SCENE = (
    '<svg viewBox="0 -45 360 270" preserveAspectRatio="xMidYMid slice" role="img" aria-label="A sample visit on an Arizona street: our truck pulls up, the scooper picks up every pile in the backyard, sprays free deodorizer, latches the gate and takes a photo, then drives off">'
    '<defs><linearGradient id="@@ID@@sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9FCDEE"></stop><stop offset=".62" stop-color="#E9EEE8"></stop><stop offset="1" stop-color="#F7E1C6"></stop></linearGradient></defs>'
    '<rect x="0" y="-45" width="360" height="270" fill="url(#@@ID@@sky)"></rect>'
    '<circle cx="318" cy="78" r="16" fill="#FF4A1C"></circle>'
    '<path d="M0 120L18 104 30 108 44 92 56 98 70 80 82 88 96 70 108 78 120 66 134 76 148 72 160 84 176 74 192 86 210 78 226 92 244 84 262 98 280 90 300 104 322 96 340 108 360 102V150H0Z" fill="#B7B3D2"></path>'
    '<path d="M0 128L26 120 48 124 72 114 98 122 126 112 150 120 178 116 206 124 238 116 266 126 298 120 330 128 360 124V150H0Z" fill="#9C97C0"></path>'
    '<g class="cam">' + WORLD + '</g>'
    '<rect class="flash" x="0" y="-45" width="360" height="270" fill="#FFFFFF"></rect>'
    '</svg>'
    '<span class="chipv" style="left: 10px;"><span class="ldot"></span>{{ vClock }} · sped up</span>'
    '<span class="chipv" style="right: 10px;">{{ vPiles }}/14 piles</span>'
    '<p class="capv" aria-live="polite">{{ vCaption }}</p>'
    '<div class="stampv" aria-hidden="true"><div style="padding: 5px 10px; border: 1.2px solid #FF4A1C; border-radius: 5px;"><div style="font-size: 15px; font-weight: 600; letter-spacing: .04em;">GATE LATCHED ✓</div><div style="font-size: 13px; font-weight: 500;">10:19:42 AM</div></div></div>'
    '<sc-if value="{{ vsRepOn }}" hint-placeholder-val="{{ false }}"><div class="repv"><img src="' + BLOB_MARK + '" alt="" style="width: 34px; height: 34px; flex: 0 0 34px; display: block;"><div style="flex: 1; min-width: 0;"><p style="margin: 0; font-size: 15px; font-weight: 700;">Proof of Scoop sent</p><p class="mono" style="margin: 2px 0 0; font-size: 13px; color: #4A5272;">14 piles · gate latched</p></div><span style="width: 28px; height: 28px; flex: 0 0 28px; border-radius: 50%; background: #1E7A52; color: #FFFFFF; display: grid; place-items: center;">' + _check + '</span></div></sc-if>'
)

SCENE_CTL = (
    '<div class="ctl">'
    '<button type="button" class="vbtn" aria-label="{{ vsToggleLabel }}" onClick="{{ vsToggle }}"><sc-if value="{{ vsPlaying }}" hint-placeholder-val="{{ true }}">' + ICON_PAUSE + '</sc-if><sc-if value="{{ vsIsPaused }}" hint-placeholder-val="{{ false }}">' + ICON_PLAY + '</sc-if></button>'
    '<div class="vtrack"><input type="range" min="0" max="239" step="1" value="{{ vsT10 }}" onChange="{{ vsScrub }}" aria-label="Drag to move through the visit" aria-valuetext="{{ vsValText }}">' + _ticks + '</div>'
    '<span class="mono vtag">Drag me</span>'
    '</div>'
)

PILE_KEYS = '\n'.join(
    '@keyframes vP%d{0%%{opacity:0;transform:scale(.4)}2%%,%s%%{opacity:1;transform:scale(1)}%s%%,100%%{opacity:0;transform:scale(.15)}}'
    % (i + 1, pct(t - 0.08), pct(t + 0.16)) for i, t in enumerate(PICKUPS))

SCENE_CSS = r""".vsw{border-radius:22px;overflow:hidden;background:#0A0F24;box-shadow:var(--shadow)}
.vs{position:relative;overflow:hidden;background:#BFDDF3;aspect-ratio:4/3;isolation:isolate}
.vs>svg{position:absolute;inset:0;width:100%;height:100%;display:block}
.dark .vs>svg{filter:brightness(.88) saturate(.95)}
.vs .chipv{position:absolute;top:10px;z-index:2;display:inline-flex;align-items:center;gap:7px;padding:6px 10px;border-radius:999px;background:rgba(10,15,36,.86);color:#FFFFFF;font-family:"IBM Plex Mono",ui-monospace,Consolas,monospace;font-size:13px;font-weight:500;letter-spacing:.03em;text-transform:uppercase;white-space:nowrap}
.vs .capv{position:absolute;left:10px;right:10px;top:48px;z-index:2;margin:0;padding:9px 12px;border-radius:14px;background:rgba(10,15,36,.84);color:#FFFFFF;font-size:15px;font-weight:600;line-height:1.35}
.vs .repv{position:absolute;left:10px;right:10px;top:48px;z-index:3;display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:14px;background:#FFFFFF;color:#0E1430;box-shadow:0 10px 24px rgba(10,15,36,.3);animation:vRepIn .45s ease-out both}
.vs .stampv{position:absolute;left:50%;top:46%;z-index:2;padding:3px;border:2.5px solid #FF4A1C;border-radius:8px;background:rgba(255,255,255,.96);color:#B02A08;font-family:"IBM Plex Mono",ui-monospace,Consolas,monospace;text-align:center;opacity:0;animation:vStamp 24s linear infinite}
.vsw .ctl{display:flex;align-items:center;gap:8px;height:52px;padding:0 14px 0 4px;background:#0A0F24;color:#FFFFFF}
.vsw .vtag{flex:0 0 auto;font-size:13px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#AEB5D8}
.vsw .vbtn{width:44px;height:44px;flex:0 0 44px;border-radius:50%;border:0;background:transparent;color:#FFFFFF;display:grid;place-items:center;cursor:pointer;padding:0}
.vsw .vtrack{position:relative;flex:1;min-width:0;height:44px;display:flex;align-items:center}
.vsw .vtrack input{-webkit-appearance:none;appearance:none;width:100%;height:44px;margin:0;background:transparent;cursor:pointer}
.vsw .vtrack input::-webkit-slider-runnable-track{height:4px;border-radius:4px;background:rgba(255,255,255,.38)}
.vsw .vtrack input::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:18px;height:18px;margin-top:-7px;border-radius:50%;background:#FF4A1C;border:2px solid #FFFFFF;box-shadow:0 2px 6px rgba(0,0,0,.3)}
.vsw .vtrack input::-moz-range-track{height:4px;border-radius:4px;background:rgba(255,255,255,.38)}
.vsw .vtrack input::-moz-range-thumb{width:14px;height:14px;border-radius:50%;background:#FF4A1C;border:2px solid #FFFFFF}
.vsw .vtrack input:focus-visible{outline:3px solid #FF6B42;outline-offset:-2px;border-radius:999px}
.vsw .vtick{position:absolute;top:50%;width:6px;height:6px;margin:-3px 0 0 -3px;border-radius:50%;background:#FFFFFF;pointer-events:none}
.vs .cam{transform-box:view-box;transform-origin:0 0;animation:vCam 24s linear infinite}
.vs .truck{animation:vTruck 24s linear infinite}
.vs .tech{animation:vTech 24s linear infinite}
.vs .face{transform-box:fill-box;transform-origin:9px 0;animation:vFace 24s linear infinite}
.vs .leg1,.vs .leg2{transform-box:fill-box;transform-origin:top center;animation:vLeg .45s ease-in-out infinite alternate}
.vs .leg2{animation-direction:alternate-reverse}
.vs .gate{transform-box:fill-box;transform-origin:left center;animation:vGate 24s linear infinite}
.vs .dogw{animation:vDog 24s linear infinite}
.vs .rr{opacity:0;animation:vRR 24s linear infinite}
.vs .rrleg{transform-box:fill-box;transform-origin:top center;animation:vRRleg .12s steps(2) infinite}
.vs .pile,.vs .mist,.vs .spark,.vs .ring{transform-box:fill-box;transform-origin:center}
.vs .p1{animation:vP1 24s linear infinite}.vs .p2{animation:vP2 24s linear infinite}.vs .p3{animation:vP3 24s linear infinite}.vs .p4{animation:vP4 24s linear infinite}
.vs .p5{animation:vP5 24s linear infinite}.vs .p6{animation:vP6 24s linear infinite}.vs .p7{animation:vP7 24s linear infinite}.vs .p8{animation:vP8 24s linear infinite}
.vs .mist{opacity:0}.vs .m1{animation:vM1 24s linear infinite}.vs .m2{animation:vM2 24s linear infinite}.vs .m3{animation:vM3 24s linear infinite}.vs .m4{animation:vM4 24s linear infinite}
.vs .spark{opacity:0}.vs .k1{animation:vK1 24s linear infinite}.vs .k2{animation:vK2 24s linear infinite}.vs .k3{animation:vK3 24s linear infinite}
.vs .flash{opacity:0;animation:vFlash 24s linear infinite}
.vs .tdot{animation:vTdot 24s linear infinite}
.vs .ring{animation:vRing 1.6s ease-out infinite}
.vs.paused *{animation-play-state:paused !important}
@keyframes vCam{0%{transform:translate(20px,0) scale(1);animation-timing-function:cubic-bezier(.25,.6,.3,1)}13.333%{transform:translate(-330px,0) scale(1)}24.167%{transform:translate(-330px,0) scale(1);animation-timing-function:ease-in-out}27.5%{transform:translate(-981px,-117px) scale(1.8)}73.333%{transform:translate(-981px,-117px) scale(1.8);animation-timing-function:ease-in-out}77.5%{transform:translate(-602px,-87px) scale(1.4)}92.5%{transform:translate(-602px,-87px) scale(1.4);animation-timing-function:ease-in-out}100%{transform:translate(-480px,0) scale(1)}}
@keyframes vTruck{0%{transform:translateX(-120px);animation-timing-function:cubic-bezier(.25,.6,.3,1)}13.333%{transform:translateX(440px)}93.333%{transform:translateX(440px);animation-timing-function:cubic-bezier(.6,0,.9,.5)}100%{transform:translateX(900px)}}
@keyframes vTech{0%,14%{transform:translate(500px,190px);opacity:0}14.167%{transform:translate(500px,190px);opacity:1}20.833%{transform:translate(557px,184px)}24.167%{transform:translate(557px,184px)}25.5%{transform:translate(557px,170px)}27.5%{transform:translate(585px,156px)}35.833%{transform:translate(745px,156px)}36.667%{transform:translate(745px,148px)}45%{transform:translate(585px,148px)}45.833%{transform:translate(585px,140px)}54.167%{transform:translate(745px,140px)}55%{transform:translate(745px,132px)}60.833%{transform:translate(660px,132px)}61.667%{transform:translate(660px,132px)}65.833%{transform:translate(700px,146px)}72.5%{transform:translate(610px,156px)}74.167%{transform:translate(585px,160px)}76.667%{transform:translate(557px,170px)}78.333%{transform:translate(557px,184px)}84.167%{transform:translate(557px,184px)}90.833%{transform:translate(500px,190px);opacity:1}91.667%,100%{transform:translate(500px,190px);opacity:0}}
@keyframes vFace{0%,35.6%{transform:scaleX(1)}36.4%,45%{transform:scaleX(-1)}45.8%,54.2%{transform:scaleX(1)}55%,61.4%{transform:scaleX(-1)}62%,65.6%{transform:scaleX(1)}66.2%,100%{transform:scaleX(-1)}}
@keyframes vLeg{from{transform:rotate(-16deg)}to{transform:rotate(16deg)}}
@keyframes vGate{0%,22.5%{transform:scaleX(1)}24.167%,27.5%{transform:scaleX(.18)}29.167%,75%{transform:scaleX(1)}76.667%,78.333%{transform:scaleX(.18)}80%,80.417%{transform:scaleX(1)}81%{transform:scaleX(1) translateX(1.4px)}81.6%{transform:scaleX(1) translateX(-1.4px)}82.083%,100%{transform:scaleX(1)}}
@keyframes vDog{0%,16%{transform:translateY(14px)}18%,93%{transform:translateY(0)}95%,100%{transform:translateY(14px)}}
@keyframes vRR{0%,2%{transform:translate(430px,188px);opacity:0}2.5%{transform:translate(430px,188px);opacity:1}9.2%{transform:translate(110px,188px);opacity:1}9.6%,100%{transform:translate(90px,188px);opacity:0}}
@keyframes vRRleg{from{transform:scaleX(1)}to{transform:scaleX(-1)}}
""" + PILE_KEYS + r"""
@keyframes vM1{0%,63.2%{opacity:0;transform:scale(.3)}63.4%{opacity:.85;transform:scale(.35)}67.5%,100%{opacity:0;transform:scale(2.6)}}
@keyframes vM2{0%,66.1%{opacity:0;transform:scale(.3)}66.3%{opacity:.85;transform:scale(.35)}70.4%,100%{opacity:0;transform:scale(2.6)}}
@keyframes vM3{0%,69%{opacity:0;transform:scale(.3)}69.2%{opacity:.85;transform:scale(.35)}73.3%,100%{opacity:0;transform:scale(2.6)}}
@keyframes vM4{0%,71.9%{opacity:0;transform:scale(.3)}72.1%{opacity:.85;transform:scale(.35)}76.2%,100%{opacity:0;transform:scale(2.6)}}
@keyframes vK1{0%,73%{opacity:0;transform:scale(.2)}74.5%{opacity:1;transform:scale(1)}78%,100%{opacity:0;transform:scale(.6)}}
@keyframes vK2{0%,74%{opacity:0;transform:scale(.2)}75.5%{opacity:1;transform:scale(1)}79%,100%{opacity:0;transform:scale(.6)}}
@keyframes vK3{0%,75%{opacity:0;transform:scale(.2)}76.5%{opacity:1;transform:scale(1)}80%,100%{opacity:0;transform:scale(.6)}}
@keyframes vFlash{0%,82.4%{opacity:0}82.6%{opacity:.85}84.2%,100%{opacity:0}}
@keyframes vTdot{0%,14%{opacity:1}14.5%,91.6%{opacity:0}92%,100%{opacity:1}}
@keyframes vRing{0%{transform:scale(1);opacity:.9}100%{transform:scale(3.2);opacity:0}}
@keyframes vStamp{0%,83%{opacity:0;transform:scale(1.7) rotate(-10deg)}84%,97.5%{opacity:1;transform:scale(1) rotate(-4deg)}99%,100%{opacity:0;transform:scale(1) rotate(-4deg)}}
@keyframes vRepIn{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:none}}"""

VS_METHODS = r"""  _vsInit() {
    this._vsAcc = 0;
    this._vsStart = Date.now();
    this._vsTimer = setInterval(() => this._vsUpdate(), 200);
    if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this._vsSeek(9);
      this._vsAcc = 9000;
      this.setState({ vsPaused: true });
    }
  }
  _vsStop() { clearInterval(this._vsTimer); }
  _vsDerive(t) {
    const pT = [6.92, 7.98, 8.93, 9.99, 11.13, 12.19, 13.37, 14.28];
    const pC = [2, 4, 6, 8, 10, 11, 13, 14];
    let piles = 0;
    for (let i = 0; i < pT.length; i++) { if (t >= pT[i]) piles = pC[i]; }
    const ends = [3.4, 5.8, 14.8, 17.8, 20.2];
    let phase = 0;
    while (phase < 5 && t >= ends[phase]) phase++;
    const sim = 36019 + t * 58.714;
    return { phase: phase, min: Math.floor(sim / 60), piles: piles };
  }
  _vsNow() {
    const run = this.state.vsPaused ? 0 : Date.now() - this._vsStart;
    return ((this._vsAcc + run) / 1000) % 24;
  }
  _vsUpdate() {
    const s = this.state;
    if (s.vsPaused) return;
    const t = this._vsNow();
    const v = this._vsDerive(t);
    const t10 = Math.floor(t * 10);
    if (t10 !== s.vsT10 || v.phase !== s.vsPhase || v.min !== s.vsMin || v.piles !== s.vsPiles) this.setState({ vsT10: t10, vsPhase: v.phase, vsMin: v.min, vsPiles: v.piles });
  }
  _vsSeek(t) {
    this._vsAcc = t * 1000;
    this._vsStart = Date.now();
    const el = typeof document !== 'undefined' ? document.querySelector('.vs') : null;
    if (el && el.getAnimations) {
      el.getAnimations({ subtree: true }).forEach((a) => { try { a.currentTime = t * 1000; } catch (err) { } });
    }
    const v = this._vsDerive(t);
    this.setState({ vsT10: Math.floor(t * 10), vsPhase: v.phase, vsMin: v.min, vsPiles: v.piles });
  }
  _vsToggle() {
    if (this.state.vsPaused) {
      this._vsStart = Date.now();
      this.setState({ vsPaused: false });
    } else {
      this._vsAcc += Date.now() - this._vsStart;
      this.setState({ vsPaused: true });
    }
  }
  _vsVals() {
    const s = this.state;
    const caps = [
      'We pull up. We texted you when we were close.',
      'Your scooper walks to your gate.',
      'We shut the gate. Then we pick up every pile, front to back.',
      'We spray deodorizer where your dogs go most. It’s free!',
      'We latch the gate, pull on it, and take a photo.',
      'Your report goes to your phone. See you next week!'
    ];
    const h = Math.floor(s.vsMin / 60);
    const m = s.vsMin % 60;
    const h12 = h > 12 ? h - 12 : h;
    const clock = h12 + ':' + (m < 10 ? '0' : '') + m + (h >= 12 ? ' PM' : ' AM');
    return {
      vsClass: 'vs' + (s.vsPaused ? ' paused' : ''),
      vClock: clock,
      vPiles: s.vsPiles,
      vCaption: caps[s.vsPhase] || caps[0],
      vsRepOn: s.vsPhase >= 5,
      vsPlaying: !s.vsPaused,
      vsIsPaused: !!s.vsPaused,
      vsToggleLabel: s.vsPaused ? 'Play the visit' : 'Pause the visit',
      vsToggle: () => this._vsToggle(),
      vsT10: s.vsT10,
      vsValText: clock + ', ' + (caps[s.vsPhase] || caps[0]),
      vsScrub: (e) => { const t = Math.max(0, Math.min(23.9, Number(e.target.value) / 10)); this._vsSeek(t); }
    };
  }"""

VS_STATE = "vsPaused: false, vsPhase: 0, vsMin: 600, vsPiles: 0, vsT10: 0"

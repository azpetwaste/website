"""Shared parts for the boards: markup pieces, icons, copy and the page logic.
export_site.py and build.py swap every @@NAME@@ in a template for the matching string here.
The look (fonts, colors, layout CSS) lives in look.py."""

import look  # noqa: E402  the look of the site lives in look.py

FONTS = look.FONTS
BASE_CSS = look.BASE_CSS

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

# ---------- prices ----------
# One file holds the prices (Joe, Nov 18, 2026): src/prices.json. Dollars a month for 1 to 6 dogs on each plan.
# Every price on a page comes from it: the page logic below, the price card, and the words in the questions.
# The server, Stripe and the office read the same file (see build/prices.mjs). Never type a price into a page.
import json as _json  # noqa: E402
import math as _math  # noqa: E402
import os as _os  # noqa: E402

PRICES = _json.load(open(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), '..', '..', 'src', 'prices.json'), encoding='utf8'))
PLAN_IDS = ('week', 'twice', 'eow')


def month(plan, dogs=2):
    """What a plan costs a month, in dollars."""
    return PRICES['month'][plan][min(6, max(1, dogs)) - 1]


def week(plan, dogs=2):
    """The month price spread over the year, to the nearest dollar (the same rounding the pages use)."""
    return int(_math.floor(month(plan, dogs) * 12 / 52.0 + .5))


def usd(n):
    return '$%d' % n if float(n) == int(float(n)) else '$%.2f' % float(n)


PRICE_METHODS = r"""  _price(id, dogs) {
    // src/prices.json, written into the page when it is built: dollars a month for 1 to 6 dogs.
    const t = __PRICE_TABLE__;
    return t[id][Math.min(6, Math.max(1, dogs)) - 1];
  }
  _per(id, dogs) {
    const visits = { week: 52 / 12, twice: 104 / 12, eow: 26 / 12 };
    return Math.round(this._price(id, dogs) / visits[id]);
  }
  _week(id, dogs) {
    return Math.round(this._price(id, dogs) * 12 / 52);
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
  _plans(onBand, google) {
    const s = this.state;
    // google = true: the plan names on our Google profile (the home page). The sign up form keeps the short names, since it must match the opt in screenshots on /texts/.
    const names = google ? { week: 'Weekly pickup', twice: 'Twice a week pickup', eow: 'Every other week pickup' } : { week: 'Every week', twice: 'Twice a week', eow: 'Every other week' };
    return ['week', 'twice', 'eow'].map((id) => {
      const on = s.plan === id;
      return {
        id: id,
        name: names[id],
        price: '$' + this._price(id, s.dogs),
        per: 'About $' + this._per(id, s.dogs) + ' a visit',
        week: '$' + this._week(id, s.dogs),
        month: '$' + this._price(id, s.dogs) + ' a month',
        on: on,
        pick: () => this.setState({ plan: id }),
        aria: names[id] + ', about $' + this._week(id, s.dogs) + ' a week, billed $' + this._price(id, s.dogs) + ' a month',
        cal: this._cal(id, onBand),
        border: on ? '#FF4A1C' : (onBand ? 'rgba(255,255,255,.18)' : 'var(--field)'),
        bg: on ? 'rgba(255,74,28,.12)' : 'transparent',
        ring: on ? '#FF4A1C' : (onBand ? '#AEB5D8' : 'var(--mute)'),
        dot: on ? '#FF4A1C' : 'transparent'
      };
    });
  }""".replace('__PRICE_TABLE__', _json.dumps({k: PRICES['month'][k] for k in PLAN_IDS}, separators=(', ', ': ')))

ICON_SUN = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.5"></circle><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"></path></svg>'
ICON_MOON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"></path></svg>'
THEME_BTN = ''  # dark look only since Nov 2026
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

# ---------- page parts ----------
SITE_CSS = look.SITE_CSS + '\n' + truemap.MAP_CSS + '\n' + look.MAP_FIX_CSS + '\n' + look.SCENE_FIX_CSS

DOG_SVG = ('<svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">'
           '<ellipse cx="9" cy="17" rx="6" ry="10" fill="currentColor" opacity=".72" transform="rotate(18 9 17)"></ellipse>'
           '<ellipse cx="31" cy="17" rx="6" ry="10" fill="currentColor" opacity=".72" transform="rotate(-18 31 17)"></ellipse>'
           '<circle cx="20" cy="21" r="13" fill="currentColor"></circle>'
           '<ellipse cx="20" cy="27" rx="7.5" ry="5.6" fill="#F6E9D8"></ellipse>'
           '<ellipse cx="20" cy="24.4" rx="3.1" ry="2.2" fill="#1A1414"></ellipse>'
           '<circle cx="14.5" cy="18" r="1.8" fill="#1A1414"></circle><circle cx="25.5" cy="18" r="1.8" fill="#1A1414"></circle>'
           '<path d="M17.4 29.6q2.6 2 5.2 0" stroke="#1A1414" stroke-width="1.4" fill="none" stroke-linecap="round"></path></svg>')

LBS_PER_DOG = '274'

AREA_METHODS = r"""  _zipArea(zip) {
    return ({ '85326': 'buckeye', '85396': 'buckeye', '85338': 'goodyear', '85395': 'goodyear', '85340': 'litchfield', '85355': 'waddell' })[zip] || '';
  }
  _checkZip() {
    this.setState({ zipChecked: true, area: this._zipArea(this.state.zip) });
  }
  _areaVals() {
    const s = this.state;
    const areas = {
      buckeye: { name: 'Buckeye', meta: 'Buckeye, ZIP 85326 and 85396' },
      verrado: { name: 'Verrado', meta: 'Verrado, in Buckeye, ZIP 85396' },
      citrus: { name: 'Citrus Park', meta: 'Citrus Park, in Waddell ZIP 85355' },
      waddell: { name: 'Waddell', meta: 'Waddell and Citrus Park, ZIP 85355' },
      goodyear: { name: 'Goodyear', meta: 'Goodyear, ZIP 85338 and 85395' },
      litchfield: { name: 'Litchfield Park', meta: 'Litchfield Park, ZIP 85340' }
    };
    const pin = (id) => {
      const on = s.area === id;
      return { on: on, bg: on ? 'var(--ink)' : 'var(--card)', fg: on ? 'var(--bg)' : 'var(--ink)', pick: () => this.setState({ area: id, zip: '', zipChecked: false }) };
    };
    const blob = (id) => (s.area === id ? (s.dark ? 'rgba(255,74,28,.58)' : 'rgba(255,74,28,.42)') : 'rgba(255,74,28,0)');
    const a = areas[s.area];
    const byZip = s.zipChecked && !!this._zipArea(s.zip);
    return {
      mB: pin('buckeye'), mV: pin('verrado'), mC: pin('citrus'), mW: pin('waddell'), mG: pin('goodyear'), mL: pin('litchfield'),
      bB: blob('buckeye'), bV: blob('verrado'), bC: blob('citrus'), bW: blob('waddell'), bG: blob('goodyear'), bL: blob('litchfield'),
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

# Joe, Nov 16 2026: Verrado is part of Buckeye. Every map labels ZIP 85396 BUCKEYE and has no Verrado shape,
# except the Verrado page's own map (MAP_V), which still lights Verrado.
MAP = truemap.build('mV.pick', 'mC.pick', 'mG.pick', 'mL.pick', 'mB.pick', 'mW.pick', verrado=False)
MAP_V = truemap.build('mV.pick', 'mC.pick', 'mG.pick', 'mL.pick', 'mB.pick', 'mW.pick')
SOON_NOTE = ('<div class="soon">'
             '<p class="soon-h">Coming soon</p>'
             '<p class="soon-l">Surprise, Peoria, Glendale and Laveen.</p>'
             '<a href="Booking.dc.html" class="btn btn-line soon-b">Join the waitlist</a>'
             '</div>')
MAP_KEY = truemap.MAP_KEY
MAP_CHIPS = '''  <div class="mchips" role="group" aria-label="Towns we scoop">
    <button type="button" class="mchip" aria-pressed="{{ mB.on }}" onClick="{{ mB.pick }}">Buckeye</button>
    <button type="button" class="mchip" aria-pressed="{{ mG.on }}" onClick="{{ mG.pick }}">Goodyear</button>
    <button type="button" class="mchip" aria-pressed="{{ mL.on }}" onClick="{{ mL.pick }}">Litchfield Park</button>
    <button type="button" class="mchip" aria-pressed="{{ mC.on }}" onClick="{{ mC.pick }}">Citrus Park</button>
    <button type="button" class="mchip" aria-pressed="{{ mW.on }}" onClick="{{ mW.pick }}">Waddell</button>
  </div>'''

from scene import saguaro, agave, barrel  # noqa: E402

# The price in one breath. Used wherever a page says what weekly pickup costs, so the words and the numbers never drift.
SAY_PRICE = 'Weekly pickup is about %s a week for 2 dogs. We bill it once a month: %s. One dog is %s a month.' % (
    usd(week('week', 2)), usd(month('week', 2)), usd(month('week', 1)))

# The first cleanup on a new plan (Joe, Nov 18, 2026: "normally it starts at $99", "depending on job size as well").
# It is not charged in the card form. We tell the customer the price before we start.
FIRST_FROM = usd(PRICES['first']['from'])
FIRST_LINE = 'Your first cleanup starts at %s, %s.' % (FIRST_FROM, PRICES['first']['words'])
FIRST_SAY = FIRST_LINE + ' We tell you the price before we start.'

FAQ_ITEMS = [
    ('[[bf:What is the Black Friday sale?||How do I sign up?]]', '[[bf:Sign up by November 30 and your first month is free. The sale ends at midnight on November 30.||Tap Book now. Pick your city, your dogs and your plan, then add your card. It takes about 2 minutes.]]'),
    ('How much does it cost?', SAY_PRICE + ' Three dogs are %s a month. ' % usd(month('week', 3)) + FIRST_LINE + '[[bf: Black Friday sale: sign up by November 30 and your first month is free.||]]'),
    ('Is there a first cleanup fee?', 'Yes. ' + FIRST_SAY + ' It is a one time fee for your first visit. We charge it to the card you signed up with.'),
    ('Is the spray really free?', 'Yes. Deodorizing is included free with every visit, on rock and turf yards alike. We spray the spots your dogs use most. It costs you nothing.'),
    ('Do you come in the summer heat?', 'Yes. In summer we start early, so your yard is done before the worst heat of the day.'),
    ('What if it storms?', 'Light rain is fine. If there is lightning, we wait until it is safe. We text you if your time changes.'),
    ('Do you clean artificial turf?', 'Yes. We pick up every pile and deodorize for free at every visit, on rock and turf yards alike. Turf can still smell in the heat. The deodorizing is already included, at no charge.'),
    ('Where does the poop go?', 'We haul it away. We bag it, tie it shut and take it with us. It does not go in your trash can.'),
    ('Do you background check your team?', 'Yes. Every team member must pass a background check before they work in a yard. Your safety and our safety come first.'),
    ('Are you bonded and insured?', 'Yes. We are insured and bonded. We carry a $50,000 business service bond and $1,000,000 in general liability insurance. See the details on our bond and insurance page.'),
    ('Do you clean your tools?', 'Yes. We clean our boots and tools after every yard. That keeps germs from going from yard to yard.'),
    ('Can I pick my day?', 'No. We set your day for you. We run set routes, and that keeps our prices down. After you sign up, we reach out to let you know your day and time. Then you get a text the night before each visit with a 30 minute window.'),
    ('Can you come today? We have a party.', 'Yes, when we have a spot. Text us as early as you can. A one time pickup starts at %s. A big job gets a quote first.' % usd(PRICES['once'])),
    ('When do you charge my card?', 'Once a month, on your bill day. [[bf:With the Black Friday sale, your first month is free. We save your card and you pay $0 that day. Your free month runs one month from the day you sign up. The day it ends is your bill day.||Your bill day is the day you sign up.]] We charge the month price that day, and on that day each month. We do not charge for part of a month.'),
    ('Who sees my gate code?', 'Only your scooper, and only on your day. You add it after you sign up. If you cancel, we delete it.'),
    ('What if a dog in the yard is not safe to be near?', 'We don’t go in. We text you to bring the dog inside. We can come back the same day.'),
    ('Can I skip a week?', 'Yes. You get 4 free skips a year. Sign in to My Yard and tap Skip next to the visit, up to 24 hours before. No phone call.'),
    ('Can I pause while we are away?', 'Yes. After your first 60 days, you can pause for up to 120 days in My Yard. You don’t pay while you are paused. Before then, use a free skip.'),
    ('How do I cancel?', '[[self:Tap cancel in My Yard. There is no long term contract and no phone call.||Call or text 623.309.6104 and we cancel it for you. There is no long term contract and no fee to cancel.]]'),
    ('What if I get another dog?', 'Text us, or we will see on our next visit. We update your plan to match and email you the new price. It starts with your next bill. On the weekly plan, 3 dogs are %s a month. Every price is on our pricing page.' % usd(month('week', 3))),
    ('What is My Yard?', 'My Yard is your account on our site. Sign in with your email and a 6 digit code. No password. [[self:You can see your next visits, skip a visit, pause, see your bills and gate photos, change your card, or cancel.||You can see your next visits and gate photos, skip a visit, or pause. On your visit day, tap See our truck. To change your card or cancel, call or text 623.309.6104.]]'),
    ('Is my card safe?', 'Yes. You pay through Stripe, the same checkout big stores use. Stripe keeps your card. We never see or store your card number.'),
    ('How do I see my bills?', '[[self:Sign in to My Yard. Every bill is there, and you can open or save each one.||Call or text 623.309.6104 and we send you any bill.]]'),
    ('My yard is rock, not grass.', 'Rock can hide poop. So we rake rock yards with a wide metal rake.'),
]


def faq(items):
    """Questions as plain rows that open. Two columns on a computer, one on a phone. Every answer is in the page for Google and AI search."""
    def one(q, a):
        return '<details class="qa"><summary><h3 class="qb">%s</h3><span class="qa-i" aria-hidden="true"></span></summary><div class="ab"><p>%s</p></div></details>' % (q, a)
    items = list(items)
    half = (len(items) + 1) // 2
    return ('<div class="qcol">' + ''.join(one(q, a) for q, a in items[:half]) + '</div>\n    '
            '<div class="qcol">' + ''.join(one(q, a) for q, a in items[half:]) + '</div>')


FAQ = faq(FAQ_ITEMS)

# The home page shows six questions and links to the rest (Joe, Nov 18, 2026: "minimalist feel, keep it short, direct, simple").
# Every question stays on /faq/ and in llms.txt (FAQ_ITEMS). The words are picked from FAQ_ITEMS, so an answer is written once.
_HOME_Q = ['How much does it cost?', 'When do you charge my card?', 'How do I cancel?',
           'Can I pick my day?', 'Where does the poop go?', 'Are you bonded and insured?']
FAQ_HOME = [x for q in _HOME_Q for x in FAQ_ITEMS if x[0] == q]
assert len(FAQ_HOME) == len(_HOME_Q), 'a home page question is not in FAQ_ITEMS'
FAQ_HOME_HTML = faq(FAQ_HOME)

TRUCK_STATIC = (
    '<rect x="0" y="176" width="52" height="22" rx="2.5" fill="#FFFFFF" stroke="#0A0F24" stroke-width="1"></rect>'
    '<rect x=".5" y="194" width="51" height="2.4" fill="#FF4A1C"></rect>'
    '<path d="M52 198V178Q52 172 58 172H74Q78 172 80.5 176L87 185 91 186Q93 187 93 190V198Z" fill="#FFFFFF" stroke="#0A0F24" stroke-width="1"></path>'
    '<path d="M58 175H73.5L78.5 184H58Z" fill="#1A2552"></path>'
    + TRUCK_LOGO +
    '<circle cx="15" cy="199.5" r="7" fill="#0A0F24"></circle><circle cx="15" cy="199.5" r="3" fill="#C9C3B6"></circle>'
    '<circle cx="76" cy="199.5" r="7" fill="#0A0F24"></circle><circle cx="76" cy="199.5" r="3" fill="#C9C3B6"></circle>'
)

# The desert at the bottom of the page: sun, two ridge lines, cactus and our truck.
# It is three tiles wide. A phone shows the middle tile, a computer shows more of it (xMidYMax slice).
_RIDGE1 = 'M0 98L24 84 40 88 58 72 74 80 92 62 108 70 124 58 142 70 160 66 178 78 196 70 214 82 236 74 258 86 282 80 306 92 330 84 352 94 372 88 390 96V130H0Z'
_RIDGE2 = 'M0 110L30 104 60 108 96 100 130 106 170 102 210 108 250 102 290 108 330 104 360 108 390 105V130H0Z'
_tiles = ''.join('<g transform="%s"><path class="skm1" d="%s"></path></g>' % (t, _RIDGE1) for t in ('translate(390 0) scale(-1 1)', 'translate(390 0)', 'translate(1170 0) scale(-1 1)'))
_tiles += ''.join('<g transform="%s"><path class="skm2" d="%s"></path></g>' % (t, _RIDGE2) for t in ('translate(390 0) scale(-1 1)', 'translate(390 0)', 'translate(1170 0) scale(-1 1)'))
SKYLINE = ('<svg viewBox="0 0 1170 130" preserveAspectRatio="xMidYMax slice" aria-hidden="true">'
           '<circle cx="690" cy="58" r="24" fill="#FF4A1C"></circle>'
           + _tiles +
           '<rect class="skg" x="0" y="112" width="1170" height="18"></rect>'
           + saguaro(434, 118, 66) + saguaro(734, 118, 54, .9, True) + saguaro(762, 118, 36, .7) + agave(474, 121) + barrel(702, 121) + agave(648, 121, .8)
           + saguaro(96, 118, 58, .9) + saguaro(236, 118, 40, .8, True) + agave(170, 121) + barrel(318, 121, .9) + agave(40, 121, .8)
           + saguaro(868, 118, 62, 1, True) + saguaro(1012, 118, 44, .8) + agave(944, 121) + saguaro(1118, 118, 56, .9) + barrel(1066, 121)
           + '<g transform="translate(540 -78)">' + TRUCK_STATIC + '</g>'
           '</svg>')


# ---------- the price card (Joe, Nov 18, 2026) ----------
# "There's something off there... less is more of anything." One printed card holds it all: how many dogs, three
# prices, the free deodorizing line and one Book now button. The home page, every town page and /pricing/ show the same
# card. It is plain HTML with the prices for 2 dogs. The whole price table rides along in data-rc, and a few lines in
# src/runtime/apw.js (priceCard) move the prices, the dog pictures and the Book now link when a dog is added or taken off.
# The week price is the big number and the month price sits right next to it, as always.

# The deodorizing line (Joe, Nov 18, 2026): shown wherever prices show. The crossed out price, the $0, the FREE tag and
# the words under it are his, and they live in src/prices.json ("deodorizing"). The slash through the old price is red.
_DZ = PRICES['deodorizing']
# Before the tag: a thin space, then a normal space. On one line the tag keeps its gap. When the tag drops to the next
# line, the line breaks at the normal space, so the tag starts flush with the words above it.
DEODOR = ('<div class="dz"><p class="dz-n">Deodorizing treatment&#8201; <span class="dz-tag">%s</span></p>'
          '<p class="dz-p"><del class="dz-was"><span class="vh">Crossed out price: </span>%s</del> <ins class="dz-now">%s</ins></p>'
          '<p class="dz-l">%s</p></div>' % (_DZ['tag'], usd(float(_DZ['was'])), usd(float(_DZ['now'])), _DZ['label']))

# The first cleanup as a line of the bill in sign up, under the deodorizing line (plan step and pay step).
BK_FIRST = ('<div class="fc"><p class="fc-n">First cleanup</p><p class="fc-p"><small>from</small> %s</p>'
            '<p class="fc-l">One time, %s. We tell you the price before we start.</p></div>' % (FIRST_FROM, PRICES['first']['words']))

RC_NAMES = (('week', 'Weekly pickup'), ('twice', 'Twice a week pickup'), ('eow', 'Every other week pickup'))
RC_FURS = ('#C98A45', '#5B3F2C', '#D9B98A', '#2A2422', '#B5652A', '#8C8F98')


def _rc_row(plan, name, dogs=2):
    return ('<li class="rc-r"><div class="rc-l"><h3 class="rc-name">%s</h3><p class="rc-bill" data-rc-mo="%s">We bill %s once a month.</p></div>'
            '<p class="rc-p"><small>About</small><span><b data-rc-wk="%s">%s</b> <small>a week</small></span></p></li>' % (
                name, plan, usd(month(plan, dogs)), plan, usd(week(plan, dogs))))


PRICE_CARD = (
    '<div class="rc" data-rc=\'' + _json.dumps({k: PRICES['month'][k] for k in PLAN_IDS}, separators=(',', ':')) + '\' data-rc-n="2">'
    '<p class="rc-q" id="rc-q">How many dogs?</p>'
    '<div class="rc-step" role="group" aria-labelledby="rc-q">'
    '<button type="button" class="rc-b" data-rc-step="-1" aria-label="One less dog">' + ICON_MINUS20 + '</button>'
    '<div class="rc-m"><div class="rc-dogs" data-rc-dogs data-furs="' + ','.join(RC_FURS) + '" aria-hidden="true">'
    + ''.join('<span class="dogf" style="color: %s;">%s</span>' % (c, DOG_SVG) for c in RC_FURS[:2]) +
    '</div><p class="rc-n" data-rc-label aria-live="polite">2 dogs</p></div>'
    '<button type="button" class="rc-b" data-rc-step="1" aria-label="One more dog">' + ICON_PLUS20 + '</button>'
    '</div>'
    '<ul class="rc-rows">' + ''.join(_rc_row(k, n) for k, n in RC_NAMES) + '</ul>'
    + DEODOR +
    '<a href="Booking.dc.html?dogs=2" class="btn btn-dot rc-go" data-rc-book>Book now</a>'
    '<p class="rc-fine">[[bf:<strong>Black Friday sale: your first month is free.</strong> ||]]' + FIRST_LINE + ' [[bf:No long term contract.||No contract.]]</p>'
    '</div>')

# The price line in the last call on the home page.
CTA_PRICE = 'About <b>%s</b> a week for 2 dogs. <span>We bill %s once a month.</span>' % (usd(week('week', 2)), usd(month('week', 2)))
# The same line sits on the first screen of the home page, one step down in size (class hero-pr): what it is, where,
# how much, one button. Joe, Nov 18, 2026: "as soon as you land on it, you know exactly what it is... easy to click, easy to join."

# Under the card: the one time pickup and the way to every price.
PRICE_MORE = ('<div class="pr-x"><p class="pr-once"><strong>Need one pickup?</strong> A <a href="/one-time-dog-poop-cleanup/">one time pickup</a> starts at %s.</p>'
              '<div class="pr-xl"><a href="sms:+16233096104" class="tl">Text us for one pickup</a><a href="Pricing.dc.html" class="tl">See every price</a></div></div>' % usd(PRICES['once']))

# Every price in plain lines, for /pricing/, Terms and llms.txt. The weekly plan has its own price for each number of dogs.
def price_lines():
    w = PRICES['month']['week']
    out = ['<strong>Weekly pickup:</strong> ' + ' '.join('%d %s %s a month.' % (i + 1, 'dog' if i == 0 else 'dogs', usd(n)) for i, n in enumerate(w))]
    for plan, name in (('twice', 'Twice a week pickup'), ('eow', 'Every other week pickup')):
        t = PRICES['month'][plan]
        step = t[2] - t[1]
        same = t[0] == t[1] and all(t[i] - t[i - 1] == step for i in range(2, 6))
        out.append('<strong>%s:</strong> ' % name + ('1 or 2 dogs %s a month. Each dog after two adds %s a month.' % (usd(t[1]), usd(step)) if same
                                                    else ' '.join('%d %s %s a month.' % (i + 1, 'dog' if i == 0 else 'dogs', usd(n)) for i, n in enumerate(t))))
    return out


PRICE_LINES = ''.join('<li>%s</li>' % x for x in price_lines())


# ---------- page chrome shared by the home page, the town pages and the policy pages ----------
HDR_CSS = look.HDR_CSS
PAGE_CSS = look.PAGE_CSS
DZ_CSS = look.DZ_CSS  # the deodorizing line, for the sign up form (the pages get it inside PAGE_CSS)
LF_CSS = look.LF_CSS

# interactive yard game (archived Nov 2026, see design/archive). The parts stay here so it can come back.
import yard as _yard  # noqa: E402
_yd = _yard.fill()
YARD_SECTION = _yd['YARD_SECTION'].replace('@@ICON_MINUS20@@', ICON_MINUS20).replace('@@ICON_PLUS20@@', ICON_PLUS20)
YARD_CSS = _yd['YARD_CSS']
YARD_METHODS = _yd['YARD_METHODS']
YARD_STATE = _yd['YARD_STATE']

DD_CHEV = '<svg class="ddc" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
DD_AREAS = ('<div class="ddp">'
    '<a href="CityBuckeye.dc.html"><b>Buckeye</b></a>'
    '<a href="CityGoodyear.dc.html"><b>Goodyear</b></a>'
    '<a href="CityLitchfieldPark.dc.html"><b>Litchfield Park</b></a>'
    '<a href="CityCitrusPark.dc.html"><b>Citrus Park</b></a>'
    '<a href="CityWaddell.dc.html"><b>Waddell</b></a>'
    '<a href="AreasWeServe.dc.html" class="dda">See all service areas</a></div>')
DD_COMM = ('<div class="ddp ddg"><div><p class="ddh">Services</p>'
    '<a href="CommercialHoa.dc.html"><b>HOA common areas</b><span>Greenbelts, trails and parks</span></a>'
    '<a href="CommercialApartments.dc.html"><b>Apartments</b><span>Pet relief areas and dog runs</span></a>'
    '<a href="CommercialDogParks.dc.html"><b>Dog parks</b><span>HOA and private parks</span></a>'
    '<a href="CommercialStations.dc.html"><b>Pet waste stations</b><span>Empty, restock and repair</span></a>'
    '<a href="CommercialEvents.dc.html"><b>Events</b><span>Loaner stations and cleanup</span></a></div>'
    '<div><p class="ddh">Areas</p>'
    '<a href="CommercialBuckeye.dc.html"><b>Buckeye</b><span>Verrado, Sundance, Tartesso</span></a>'
    '<a href="CommercialGoodyear.dc.html"><b>Goodyear</b><span>Estrella, PebbleCreek, Palm Valley</span></a>'
    '<a href="CommercialLitchfield.dc.html"><b>Litchfield Park</b><span>HOAs, condos, resorts</span></a>'
    '<a href="CommercialCitrus.dc.html"><b>Citrus Park and Waddell</b><span>New communities, kennels</span></a>'
    '<a href="Commercial.dc.html" class="dda">Commercial overview</a></div></div>')
DD = {'Areas we serve': DD_AREAS, 'Commercial': DD_COMM}


def _navlink(h, t):
    if t in DD:
        return ('<div class="dd"><a href="%s" class="ddt">%s%s</a><div class="ddm">%s</div></div>' % (h, t, DD_CHEV, DD[t]))
    return '<a href="%s">%s</a>' % (h, t)


def _header(home, links):
    nav = ''.join(_navlink(h, t) for h, t in links)
    return ('<header class="hdr"><div class="hin">\n'
            '  <a href="' + home + '" class="hlogo" aria-label="Arizona Pet Waste, home">' + LOGO_H + '</a>\n'
            '  <nav class="dnav" aria-label="Main">' + nav + '</nav>\n'
            '  <span class="hsp"></span>\n'
            '  ' + THEME_BTN + '\n'
            '  <a href="tel:+16233096104" class="hcall" aria-label="Call 623.309.6104">623.309.6104</a>\n'
            '  <a href="Booking.dc.html" class="btn btn-dot hbook">Book now</a>\n'
            '  <button type="button" class="ibtn mbtn" aria-label="Open menu" onClick="{{ openMenu }}">' + ICON_MENU + '</button>\n'
            '</div></header>')


def _menu(links):
    nav = ''.join('<a href="%s" class="mlink"%s>%s</a>' % (h, ' onClick="{{ closeMenu }}"' if h.startswith('#') else '', t) for h, t in links)
    return ('<sc-if value="{{ menu }}" hint-placeholder-val="{{ false }}">\n'
            '  <div role="dialog" aria-modal="true" aria-label="Menu" class="mdlg">\n'
            '    <div class="mpan">\n'
            '      <div class="mtop">\n'
            '        ' + LOGO_H + '\n'
            '        <span style="flex: 1;"></span>\n'
            '        <button type="button" class="ibtn" aria-label="Close menu" onClick="{{ closeMenu }}">' + ICON_CLOSE + '</button>\n'
            '      </div>\n'
            '      <nav aria-label="Main" class="mnav">' + nav + '</nav>\n'
            '      <a href="Booking.dc.html" class="btn btn-dot mbk">Book now</a>\n'
            '      <div class="mct">\n'
            '        <a href="tel:+16233096104" class="btn btn-line">Call</a>\n'
            '        <a href="sms:+16233096104" class="btn btn-line">Text</a>\n'
            '      </div>\n'
            '      <p class="mnum">623.309.6104</p>\n'
            '    </div>\n'
            '  </div>\n'
            '</sc-if>')


# The Book, Call, Text bar is one piece for every page now. It lives in build/build.mjs (DOCK).
SBAR = ''

F_CLOCK = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></svg>'
F_GLOBE = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M3 12h18"></path><path d="M12 3c2.6 2.8 2.6 15.2 0 18c-2.600-2.800-2.600-15.200 0-18z"></path></svg>'
SEAL = look.seal_svg()
SEAL_FAM = look.seal_svg(glyph='heart')
SEALS = [('Bonded', '$50,000 bond'), ('Insured', '$1,000,000 liability'), ('Background checked', 'Every team member')]
SEALS_ARIA = 'Bonded, insured and background checked. Family owned and operated.'
# One plain line by every sign up button. Joe, Nov 16, 2026, night: the "keep your plan 60 days" rule is off the site.
# It made the free month confusing. The offer is first month free, and that is all it says.
NO_CONTRACT = '[[bf:No long term contract.||No contract.]]'
# Joe, Nov 16, 2026: the insurance is in force. The claim is in the present tense and has no start date: "Insured and bonded."
COVERED = 'Insured and bonded.'
_F_PHONE = ICON_PHONE.replace('stroke="#FF6B42"', 'stroke="currentColor"')
_F_SMS = ICON_CHAT
_F_MAIL = ICON_MAIL.replace('stroke="#FF6B42"', 'stroke="currentColor"')


def _footer(pre):
    """Layout (Nov 2026, Joe's pick): brand and contact, quick links, payment options. Then the seals row and family owned."""
    return ('<footer class="ftr">\n'
            '  <div class="in">\n'
            '  <div class="fg3">\n'
            '    <div class="fcol">\n'
            '      <img class="flogo" src="' + BLOB_LOGO_DARK + '" alt="Arizona Pet Waste" width="240" height="73">\n'
            '      <ul class="fcon">\n'
            '        <li><a href="tel:+16233096104" aria-label="Call us at 623.309.6104">' + _F_PHONE + '<span>Call 623.309.6104</span></a></li>\n'
            '        <li><a href="sms:+16233096104" aria-label="Text us at 623.309.6104">' + _F_SMS + '<span>Text 623.309.6104</span></a></li>\n'
            '        <li><a href="mailto:info@arizonapetwaste.com">' + _F_MAIL + '<span>info@arizonapetwaste.com</span></a></li>\n'
            '        <li><span class="fcon-t">' + F_CLOCK + '<span>Open 8 am to 5 pm, every day</span></span></li>\n'
            '        <li><a href="Main.dc.html">' + F_GLOBE + '<span>arizonapetwaste.com</span></a></li>\n'
            '        <!--GOOGLE-->\n'
            '      </ul>\n'
            '      <!--SOCIAL-->\n'
            '    </div>\n'
            '    <nav class="fnav" aria-label="Footer">\n'
            '      <div>\n'
            '        <p class="fhd">Quick links</p>\n'
            '        <a href="HowItWorks.dc.html" class="flink">How it works</a>\n'
            '        <a href="Pricing.dc.html" class="flink">Pricing</a>\n'
            '        <a href="AreasWeServe.dc.html" class="flink">Areas we serve</a>\n'
            '        <a href="CityBuckeye.dc.html" class="flink">Buckeye</a>\n'
            '        <a href="CityGoodyear.dc.html" class="flink">Goodyear</a>\n'
            '        <a href="CityLitchfieldPark.dc.html" class="flink">Litchfield Park</a>\n'
            '        <a href="CityCitrusPark.dc.html" class="flink">Citrus Park</a>\n'
            '        <a href="CityWaddell.dc.html" class="flink">Waddell</a>\n'
            '        <a href="Commercial.dc.html" class="flink">Commercial</a>\n'
            '      </div>\n'
            '      <div>\n'
            '        <p class="fhd" aria-hidden="true">&nbsp;</p>\n'
            '        <a href="About.dc.html" class="flink">About us</a>\n'
            '        <a href="Promise.dc.html" class="flink">Our promise</a>\n'
            '        <a href="Faq.dc.html" class="flink">FAQ</a>\n'
            '        <a href="Blog.dc.html" class="flink">Blog</a>\n'
            '        <a href="Contact.dc.html" class="flink">Contact</a>\n'
            '        <a href="MyYard.dc.html" class="flink">My Yard sign in</a>\n'
            '        <a href="/privacy/" class="flink">Privacy Policy</a>\n'
            '        <a href="/terms/" class="flink">Terms of Service</a>\n'
            '        <a href="Booking.dc.html" class="flink">Book now</a>\n'
            '      </div>\n'
            '    </nav>\n'
            '    <div class="fcol">\n'
            '      <p class="fhd">Payment options</p>\n'
            '      <p class="fpay">We take all major credit cards, Apple Pay and Google Pay. We do not take cash, Venmo, Cash App or Zelle.</p>\n'
            '      <!--PAYMARKS-->\n'
            '      <p class="fhd fhd-2">Your info is safe</p>\n'
            '      <p class="fpay">Stripe keeps your card. We never see the number. We never sell your info. <a href="/privacy/">Read our Privacy Policy</a>.</p>\n'
            '    </div>\n'
            '  </div>\n'
            '  <div class="fseals" role="group" aria-label="' + SEALS_ARIA + '">\n'
            + ''.join('    <p class="fseal">' + SEAL + '<span><b>%s</b><small>%s</small></span></p>\n' % x for x in SEALS) +
            '    <p class="fproof"><a href="/bonded-and-insured/">See our coverage</a></p>\n'
            '    <p class="ffam">' + SEAL_FAM.replace('class="seal-i"', 'class="seal-i ffam-i"') + '<span>Family owned and operated</span></p>\n'
            '  </div>\n'
            '  <!--MEMBERS-->\n'
            '  <p class="fcopy">© 2026 Arizona Pet Waste. All rights reserved.</p>\n'
            '  </div>\n'
            '</footer>')


_NAV = [('HowItWorks.dc.html', 'How it works'), ('Pricing.dc.html', 'Pricing'), ('AreasWeServe.dc.html', 'Areas we serve'), ('Commercial.dc.html', 'Commercial'), ('Faq.dc.html', 'FAQ')]
_MNAV = [('Main.dc.html', 'Home'), ('HowItWorks.dc.html', 'How it works'), ('Pricing.dc.html', 'Pricing'), ('AreasWeServe.dc.html', 'Areas we serve'), ('Commercial.dc.html', 'Commercial'), ('Faq.dc.html', 'FAQ'), ('Blog.dc.html', 'Blog'),
         ('CityBuckeye.dc.html', 'Buckeye'), ('CityGoodyear.dc.html', 'Goodyear'), ('CityLitchfieldPark.dc.html', 'Litchfield Park'), ('CityCitrusPark.dc.html', 'Citrus Park'), ('CityWaddell.dc.html', 'Waddell')]
HEADER_MAIN = _header('Main.dc.html', _NAV)
HEADER_CITY = _header('Main.dc.html', _NAV)
MENU_MAIN = _menu(_MNAV)
MENU_CITY = _menu(_MNAV)
FOOTER_MAIN = _footer('')
FOOTER_CITY = _footer('Main.dc.html')


# ---------- the seals strip under every hero: bonded, insured, background checked, family owned ----------
TICKER = ('<div class="seals" role="region" aria-label="' + SEALS_ARIA + '">\n'
          '  <ul class="seals-l">'
          + ''.join('<li>' + SEAL + '<span><b>%s</b><small>%s</small></span></li>' % x for x in SEALS)
          + '<li>' + SEAL_FAM + '<span><b>Family owned</b><small>and operated</small></span></li>'
          + '<li class="seals-go"><a class="tl" href="/bonded-and-insured/">See our coverage</a></li>'
          + '</ul>\n</div>')

# ---------- what every plan comes with (was "Every visit, by the numbers") ----------
CK_SVG = '<svg viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 15l6 6L23 8"></path></svg>'
CK_ITEMS = [('A 30 minute time window', 'We text it to you the night before.'),
            ('A photo of your latched gate', 'After every visit. No photo? That visit is free.'),
            ('We haul the poop away', 'We bag it and take it with us. Nothing goes in your trash can.'),
            ('Deodorizing included free', 'With every visit, on rock and turf yards alike.'),
            ('A free return within 24 hours', 'If we miss a pile.'),
            ('4 free skips a year', 'One tap in My Yard. After your first 60 days, you can pause for up to 120 days too.'),
            ('Every home in 6 ZIP codes', 'Buckeye, Goodyear, Litchfield Park, Citrus Park and Waddell.'),
            ('[[bf:No long term contract||No contract]]', 'Month to month. [[self:Cancel in My Yard.||Cancel any time with one call or text.]]')]
SPECS = ('<section id="specs" class="sec">\n  <div class="in ck-g">\n'
         '  <div class="shd">\n'
         '    <h2 class="h2">What you get with every visit</h2>\n'
         '    <p class="lead">Every plan comes with all of this.</p>\n'
         '  </div>\n'
         '  <ul class="ck">\n' +
         ''.join('    <li>%s<div><b>%s</b><span>%s</span></div></li>\n' % (CK_SVG, a, b) for a, b in CK_ITEMS) +
         '  </ul>\n'
         '  </div>\n</section>')

# The Black Friday coupon. The countdown is filled in by src/runtime/apw.js, and the whole block goes away when the sale ends.
BF_DEAL = ('[[bf:<div class="bfd" data-deal-end="2026-12-01T06:59:59Z"><div class="bfd-in">'
  '<div><p class="bfd-tag">Black Friday sale</p>'
  '<p class="bfd-h">Your first month is free</p>'
  '<p class="bfd-p">Sign up by November 30. After that, the sale is over.</p></div>'
  '<div><div class="bfd-when"><p class="bfd-ends">Sale ends Monday, November 30</p>'
  '<p class="bfd-clock" aria-hidden="true"><span><b data-u="d">00</b><i>days</i></span><span><b data-u="h">00</b><i>hrs</i></span><span><b data-u="m">00</b><i>min</i></span><span><b data-u="s">00</b><i>sec</i></span></p></div>'
  '<p class="bfd-fine">No long term contract.</p></div>'
  '</div></div>||]]')


# ---------- real photos from the Nov 2026 shoot (static/assets/img/photos, cut by the sizes below) ----------
# Wide photos are 3:2 (640, 960, 1440 wide). Tall ones end in "-tall" or are the portrait, 4:5 (480, 720, 1000 wide).
def pic(name, alt, sizes, lazy=True, cls=''):
    tall = name.endswith('-tall') or name == 'team-portrait'
    ws = (480, 720, 1000) if tall else (640, 960, 1440)
    w, h = (1000, 1250) if tall else (1440, 960)
    return ('<img%s src="/assets/img/photos/%s.jpg" srcset="%s" sizes="%s" width="%d" height="%d" %s alt="%s">' % (
        ' class="%s"' % cls if cls else '', name,
        ', '.join('/assets/img/photos/%s-%d.webp %dw' % (name, x, x) for x in ws), sizes, w, h,
        'loading="lazy" decoding="async"' if lazy else 'fetchpriority="high"', alt))


PH_HERO = pic('team-portrait', 'An Arizona Pet Waste scooper in a navy company shirt and work gloves, smiling in a side yard',
              '(min-width: 1024px) 430px, (min-width: 480px) 380px, 80vw', lazy=False)
PH_STEP_SCOOP = pic('scoop-side-yard', 'Our scooper picks up dog poop in a gravel side yard with a rake and a lined bin',
                    '(min-width: 1024px) 460px, 76vw')
PH_STEP_SPRAY = pic('spray-turf', 'Our scooper sprays deodorizer on artificial turf in a back yard',
                    '(min-width: 1024px) 460px, 76vw')
PH_OWNER = pic('at-gate-tall', 'Juan Gonzalez, owner of Arizona Pet Waste, holds a side gate open and smiles, with his rake and bin',
               '(min-width: 1024px) 400px, (min-width: 600px) 420px, 88vw')
PH_CTA = pic('shirt-qr', 'The back of our company shirt, with arizonapetwaste.com and a QR code, as our scooper shuts a steel gate',
             '(min-width: 1024px) 560px, 100vw')
_BAND = [('scoop-turf-tall', 'Our scooper picks up dog poop on artificial turf', 'Turf yards', 'We scoop it, then spray it.'),
         ('scoop-rock-tall', 'Our scooper rakes dog poop out of a rock yard', 'Rock yards', 'We rake every pile out of the rock.'),
         ('spray-turf-tall', 'Our scooper sprays deodorizer on a turf yard', 'Free spray', 'Deodorizer at every visit.')]
PHOTO_BAND = ('<section class="band" aria-label="Photos of our work">\n  <ul class="band-l">\n' +
              ''.join('    <li><figure class="pho">%s<figcaption><b>%s</b><span>%s</span></figcaption></figure></li>\n' % (
                  pic(n, a, '(min-width: 1024px) 380px, (min-width: 600px) 31vw, 78vw'), t, s) for n, a, t, s in _BAND) +
              '  </ul>\n</section>')


# ---------- the phone with our videos (home page, How it works). Real video from the Nov 2026 shoot ----------
# Files: static/assets/video. NAME-sale-v1.mp4 is the ad as Joe sent it, with the Black Friday "first month free" captions.
# NAME-v1.mp4 is the same clip with those captions and the offer line on the closing card cut out, for December on.
# The build picks the file with the sale tag, and src/runtime/reel.js switches at the same moment even with no new build.
# The still (NAME.jpg, NAME-360.webp, NAME-540.webp) is the first frame of the web file, so nothing jumps when the video starts.
# How the files are made: docs/video/README.md.
REEL_CSS = look.REEL_CSS
HV_CSS = look.HV_CSS
REEL_END = '2026-12-01T06:59:59Z'  # the sale ends. Same moment as DEAL_END in build/build.mjs and END in src/runtime/reel.js
_RL_PLAY = '<path d="M8 5v14l11-7z" fill="currentColor"></path>'
_RL_PAUSE = '<path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor"></path>'
# file name, name on the chip, one line under it, length in the sale, length after, what the still shows, sale only
_REEL = [
    ('dog-poop-pickup', 'We pick it up', 'Your dog poops every day. We scoop it all up.', '0:10', '0:07',
     'Our scooper walks up to a wood side gate to start a visit', False),
    ('gate-photo', 'Gate photo', 'No photo? That visit is free.', '0:15', '0:10',
     'Our scooper picks up dog poop on a turf yard with a rake and a lined bin', False),
    ('free-spray', 'Free spray', 'Yard smells like a kennel? We spray it for free.', '0:15', '0:10',
     'Our scooper shuts a wood side gate with a gloved hand', False),
    ('black-friday', 'Black Friday sale', 'Sign up by November 30. Your first month is free.', '0:15', '',
     'Our scooper sprays deodorizer on a turf yard', True),
]


def _reel():
    v = '/assets/video/'

    def file(name, sale_only=False):
        return v + name + '-sale-v1.mp4' if sale_only else '[[bf:%s%s-sale-v1.mp4||%s%s-v1.mp4]]' % (v, name, v, name)

    rows = ''
    for n, (name, chip, line, d_sale, d_after, alt, sale_only) in enumerate(_REEL):
        row = ('<a class="rl-i" href="%s"%s data-po="%s%s" data-alt="%s"%s>'
               '<span class="rl-ic" aria-hidden="true"><svg viewBox="0 0 24 24">%s</svg></span>'
               '<span class="rl-t">%s</span><span class="rl-s">%s</span><span class="rl-d">%s</span></a>' % (
                   file(name, sale_only), ' data-deal-end="%s"' % REEL_END if sale_only else ' data-after="%s%s-v1.mp4"' % (v, name),
                   v, name, alt, ' aria-current="true"' if n == 0 else '', _RL_PLAY, chip, line,
                   d_sale if sale_only else '[[bf:%s||%s]]' % (d_sale, d_after)))
        rows += '\n        ' + ('[[bf:' + row + '||]]' if sale_only else row)
    name, alt = _REEL[0][0], _REEL[0][5]
    return ('<div class="rl" data-reel>\n'
            '      <div class="rl-ph">\n'
            '        <div class="rl-scr">\n'
            '          <img class="rl-po" src="%s%s.jpg" srcset="%s%s-360.webp 360w, %s%s-540.webp 540w" sizes="276px" width="540" height="960" loading="lazy" decoding="async" alt="%s">\n'
            '          <video class="rl-v" src="%s" width="540" height="960" preload="none" muted playsinline controls disableremoteplayback aria-label="Video of our scooper at work in a real yard"></video>\n'
            '          <div class="rl-bars" aria-hidden="true"></div>\n'
            '          <button type="button" class="rl-pp" aria-label="Play the video"><svg class="rl-pl" viewBox="0 0 24 24" aria-hidden="true">%s</svg><svg class="rl-pa" viewBox="0 0 24 24" aria-hidden="true">%s</svg></button>\n'
            '        </div>\n'
            '      </div>\n'
            '      <div class="rl-l" role="group" aria-label="Our videos. Pick one to play it.">%s\n'
            '      </div>\n'
            '    </div>' % (v, name, v, name, v, name, alt, file(name), _RL_PLAY, _RL_PAUSE, rows))


REEL = _reel()

"""Export the design boards as production templates for the website build (/home/claude/apw-site).

Same parts and copy as the canvas boards, plus the launch changes:
real URLs, real image files, no placeholder blocks (owner story, reviews),
legal links in the footer, and slots the site build fills (badges, social links, neighborhoods)."""
import json
import os
import re
import sys

import parts

# capture the raw FAQ items so the site can publish FAQPage data that matches the page
_captured = []
_orig_faq = parts.faq


def _cap(items):
    _captured.append(list(items))
    return _orig_faq(items)


parts.faq = _cap
import cities
import longform  # noqa: E402  (imports the patched faq)

OUT = '/home/claude/apw-site/src/boards/'
os.makedirs(OUT, exist_ok=True)

POOP_GOES = 'We bag it and put it in your trash can.'
LINKS = {
    'Booking.dc.html': '/book/',
    'Main.dc.html': '/',
    'CityVerrado.dc.html': '/pooper-scooper/verrado-az/',
    'CityCitrusPark.dc.html': '/pooper-scooper/citrus-park-az/',
    'CityGoodyear.dc.html': '/pooper-scooper/goodyear-az/',
    'CityLitchfieldPark.dc.html': '/pooper-scooper/litchfield-park-az/',
    'MyYard.dc.html': '/account/',
    'CityBuckeye.dc.html': '/pooper-scooper/buckeye-az/',
    'AreasWeServe.dc.html': '/pooper-scooper/',
    'HowItWorks.dc.html': '/how-it-works/',
    'Pricing.dc.html': '/pricing/',
    'Faq.dc.html': '/faq/',
}
BLOBS = {
    'd40859938aad2cb6ad7648561b9a1a69': '/assets/img/logo-horizontal.svg',
    '1467d93cd9b58ca9dd49fc16c4ec494b': '/assets/img/logo-horizontal-dark.svg',
    'ad31f5b41783c555e611fe77885d676a': '/assets/img/mark-round.svg',
    'a7a03153bb6d296b31597e8bc38011c5': '/assets/img/mark-round-dark.svg',
    '5eaa35b6f87df2e6c7c19d16e9370468': '/assets/img/gate-photo.jpg',
    '1414015c2e51423c09fa3ca2ffa8f0c2': '/assets/img/gate-scene.jpg',
}
LEGAL = ('<nav aria-label="Policies" style="display: flex; flex-wrap: wrap; gap: 0 18px; margin-top: 22px;">'
         '<a href="/privacy/" class="flink">Privacy</a><a href="/terms/" class="flink">Terms</a>'
         '<a href="/texts/" class="flink">Text terms</a><a href="/accessibility/" class="flink">Accessibility</a></nav>'
         '<!--BADGES-->\n  ')
COPY_LINE = '<p style="margin: 26px 0 0; font-size: 14px; line-height: 1.6; color: #AEB5D8;">© 2026 Arizona Pet Waste. All rights reserved.</p>'


def fill(tpl, board_id, extra=None):
    out = tpl
    for name in dir(parts):
        val = getattr(parts, name)
        if name.isupper() and isinstance(val, str):
            if name == 'SCENE':
                val = val.replace('@@ID@@', board_id)
            out = out.replace('@@%s@@' % name, val)
    for k, v in (extra or {}).items():
        out = out.replace('@@%s@@' % k, v)
    left = re.findall(r'@@[A-Z0-9_]+@@', out)
    if left:
        sys.exit('unfilled placeholders: %s' % sorted(set(left)))
    return out


def must(html, old, new, count=1, label=''):
    n = html.count(old)
    if n < count:
        sys.exit('production change not found (%s): %r' % (label, old[:80]))
    return html.replace(old, new)


def cut_section_with(html, marker):
    i = html.find(marker)
    if i < 0:
        sys.exit('marker not found: %r' % marker)
    a = html.rfind('<section', 0, i)
    b = html.find('</section>', i) + len('</section>')
    return html[:a] + html[b:]


def common(html):
    for k, v in LINKS.items():
        html = html.replace('href="%s' % k, 'href="%s' % v)
    html = html.replace('href="/#', 'href="/#')
    html = html.replace('https://arizonapetwaste.com/start/login', '/account/')
    for k, v in BLOBS.items():
        html = html.replace('/_blob/' + k, v)
    html = html.replace(parts.FAQ_ITEMS[5][1], POOP_GOES)
    if '/_blob/' in html:
        sys.exit('a design image is not mapped: %s' % re.findall(r'/_blob/\w+', html)[:3])
    if COPY_LINE in html:
        html = html.replace(COPY_LINE, LEGAL + COPY_LINE)
    # placeholder social buttons in the footer become a slot the site fills from site.config.json
    html = re.sub(r'<div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 24px;">\s*<a href="#reviews"[\s\S]*?</div>', '<!--SOCIAL-->', html)
    return html


def main_prod(html):
    # placeholders that wait for real content: the owner story and customer reviews
    html = cut_section_with(html, '[Owner<br>photo]')
    html = cut_section_with(html, '>[5.0]</p>')
    return html


def city_prod(html):
    # the ZIP list for the town goes right under the map chip
    html = must(html, ': WE SET YOUR DAY BY ROUTE</p>', ': WE SET YOUR DAY BY ROUTE</p>\n<!--HOODS-->', label='map chip')
    a = html.find('<p class="eb" style="color: #FF8A66;">Reviews</p>')
    b_tag = '<p style="margin: 26px 0 0; font-size: 16px; font-weight: 700;">We also scoop near you</p>'
    b = html.find(b_tag)
    if a < 0 or b < 0:
        sys.exit('city reviews block not found')
    html = html[:a] + '<h2 class="h2" style="color: #FFFFFF;">We also scoop near you<span style="color: #FF4A1C;">.</span></h2>' + html[b + len(b_tag):]
    return html


def doc_shell(city_html):
    """The location page frame (header, menu, footer, sticky bar) around a slot for policy text."""
    a = city_html.find('<section')
    b = city_html.find('<footer')
    shell = city_html[:a] + '<main id="main" class="doc">@@DOC@@</main>\n\n' + city_html[b:]
    # the town page header points at its own sections; policy pages point at the home page instead
    return re.sub(r'href="#(?!top")', 'href="/#', shell)


def split(html):
    m = re.search(r'<helmet>([\s\S]*?)</helmet>', html)
    helmet = m.group(1)
    fonts = re.search(r'<link[^>]+fonts\.googleapis[^>]+>', helmet).group(0)
    css = re.search(r'<style>([\s\S]*?)</style>', helmet).group(1)
    markup = html[m.end():html.index('</x-dc>')].strip()
    script = re.search(r'<script type="text/x-dc"[^>]*>([\s\S]*?)</script>', html).group(1).strip()
    title = re.search(r'<title>([\s\S]*?)</title>', html).group(1)
    return {'fonts': fonts, 'css': css, 'markup': markup, 'script': script, 'title': title}


def strip_tags(s):
    s = re.sub(r'<[^>]+>', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()


def write(board_id, html):
    data = split(html)
    data['id'] = board_id
    json.dump(data, open(OUT + board_id + '.json', 'w'), ensure_ascii=False)
    print('%-16s %7d bytes markup' % (board_id, len(data['markup'].encode('utf-8'))))


def prod_faq(items):
    out = []
    for q, a in items:
        a = a.replace(parts.FAQ_ITEMS[5][1], POOP_GOES)
        if '[' in a:
            sys.exit('placeholder left in FAQ: %s' % a)
        out.append({'q': strip_tags(q), 'a': strip_tags(a)})
    return out


# ---------- boards ----------
main = common(main_prod(fill(open('main.tpl.html').read(), 'm', {'MAIN_H': '13200', 'PREVIEW_W': '390'})))
if '#reviews' in main or 'id="reviews"' in main:
    sys.exit('a reviews link is left on the home page')
write('main', main)
write('book', common(fill(open('book.prod.tpl.html').read(), 'b')))
write('account', common(fill(open('account.prod.tpl.html').read(), 'a')))

content = {'faq': {'main': prod_faq(parts.FAQ_ITEMS), 'common': prod_faq(longform.faq_common('the West Valley'))}, 'cities': {}, 'base_css': parts.BASE_CSS}
shell = None
for i, cdef in enumerate(cities.CITIES):
    tpl = open('city.tpl.html').read()
    vals = {'C_NAME': cdef['name'], 'C_NAME_CAPS': cdef['name'].upper(), 'C_AREA': cdef['area'], 'C_EYEBROW': cdef['eyebrow'],
            'C_INTRO': cdef['intro'], 'C_MAP_H2': cdef['map_h2'], 'C_WHERE': cdef['where'], 'C_WHY_H2': cdef['why_h2'],
            'C_WHY': cdef['why'], 'C_FAQ_H2': cdef['faq_h2'], 'C_FAQ': cdef['faq'], 'C_NEARBY': cdef['nearby'], 'C_H': cdef['h']}
    vals.update(longform.render(cdef['area'], cdef['name']))
    for k, v in vals.items():
        tpl = tpl.replace('@@%s@@' % k, v)
    html = common(city_prod(fill(tpl, cdef['id'])))
    slug = cdef['area']
    write('city-' + slug, html)
    content['cities'][slug] = {
        'name': cdef['name'], 'eyebrow': strip_tags(cdef['eyebrow']), 'intro': strip_tags(cdef['intro']),
        'where': strip_tags(cdef['where']), 'faq': prod_faq(_captured[i]), 'zips': longform.zip_groups(slug)
    }
    if shell is None:
        shell = doc_shell(html)
write('doc', shell)
json.dump(content, open(OUT + 'content.json', 'w'), ensure_ascii=False, indent=1)
print('content.json written')

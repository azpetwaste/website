"""Assemble the v2 boards from the templates and parts.py, then write them into the canvas folder."""
import re
import sys
from html.parser import HTMLParser

import parts

OUT = '/mnt/user-data/outputs/artifacts/8dafc584-80d3-4012-9f0b-08999c8b7441/project/'
BOARDS = [('main.tpl.html', 'Main.dc.html', 'm', {'MAIN_H': '11200', 'PREVIEW_W': '390'}),
          ('main.tpl.html', 'MainDesktop.dc.html', 'w', {'MAIN_H': '@@DESK_H@@', 'PREVIEW_W': '1440'}),
          ('duo.tpl.html', 'DuoOpen.dc.html', 'd', {}), ('booking.tpl.html', 'Booking.dc.html', 'b', {}), ('myyard.tpl.html', 'MyYard.dc.html', 'y', {})]
DESK_H = '9900'

VOID = {'meta', 'link', 'img', 'input', 'br', 'hr', 'source', 'col', 'area', 'base', 'wbr', 'embed', 'param', 'track'}
SVG_SELF = {'path', 'rect', 'circle', 'ellipse', 'line', 'stop', 'polyline', 'polygon'}


class Check(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack, self.errors, self.text, self.skip = [], [], [], 0

    def handle_starttag(self, tag, attrs):
        if tag in VOID:
            return
        self.stack.append((tag, self.getpos()))
        if tag in ('style', 'script', 'svg'):
            self.skip += 1

    def handle_startendtag(self, tag, attrs):
        if tag not in VOID and tag not in SVG_SELF:
            self.errors.append('self closed <%s> at %s' % (tag, self.getpos()))

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        if not self.stack or self.stack[-1][0] != tag:
            self.errors.append('</%s> at %s does not match %s' % (tag, self.getpos(), self.stack[-1] if self.stack else None))
            return
        self.stack.pop()
        if tag in ('style', 'script', 'svg'):
            self.skip -= 1

    def handle_data(self, data):
        if not self.skip and data.strip():
            self.text.append(data.strip())


def fill(tpl, board_id, extra):
    out = tpl
    for name in dir(parts):
        val = getattr(parts, name)
        if name.isupper() and isinstance(val, str):
            if name == 'SCENE':
                val = val.replace('@@ID@@', board_id)
            out = out.replace('@@%s@@' % name, val)
    for k, v in extra.items():
        out = out.replace('@@%s@@' % k, v.replace('@@DESK_H@@', DESK_H))
    left = re.findall(r'@@[A-Z0-9_]+@@', out)
    if left:
        sys.exit('unfilled placeholders: %s' % sorted(set(left)))
    return out


import cities
import longform

JOBS = [(open(src).read(), dst, bid, extra) for src, dst, bid, extra in BOARDS]
for cdef in cities.CITIES:
    tpl = open('city.tpl.html').read()
    vals = {'C_NAME': cdef['name'], 'C_NAME_CAPS': cdef['name'].upper(), 'C_AREA': cdef['area'], 'C_EYEBROW': cdef['eyebrow'],
            'C_INTRO': cdef['intro'], 'C_MAP_H2': cdef['map_h2'], 'C_WHERE': cdef['where'], 'C_WHY_H2': cdef['why_h2'],
            'C_WHY': cdef['why'], 'C_FAQ_H2': cdef['faq_h2'], 'C_FAQ': cdef['faq'], 'C_NEARBY': cdef['nearby'], 'C_H': cdef['h']}
    vals.update(longform.render(cdef['area'], cdef['name']))
    for k, v in vals.items():
        tpl = tpl.replace('@@%s@@' % k, v)
    JOBS.append((tpl, cdef['file'], cdef['id'], {}))

for tpl, dst, bid, extra in JOBS:
    html = fill(tpl, bid, extra)
    c = Check()
    c.feed(html)
    if c.stack:
        c.errors.append('left open: %s' % c.stack)
    copy = ' '.join(c.text)
    dashes = [m.group(0) for m in re.finditer(r'.{0,24}[\-‐-―−].{0,24}', copy)]
    # attribute copy people hear or see (alt, aria-label, placeholder) must be dash free too
    for a in re.findall(r'(?:alt|aria-label|placeholder)="([^"]*)"', html):
        if re.search(r'[\-‐-―−]', a):
            dashes.append(a)
    if c.errors or dashes:
        print(dst, 'ERRORS', c.errors[:8], 'DASHES', dashes[:8])
        sys.exit(1)
    open(OUT + dst, 'w').write(html)
    print('%-18s %6d bytes, tags balanced, copy dash free' % (dst, len(html.encode('utf-8'))))

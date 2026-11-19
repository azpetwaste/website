"""Makes static/assets/img/share-logo.png, the picture that shows when someone shares a link to the site.

Joe, Nov 19, 2026: "maybe we change it to just the logo on social media so its clean." Facebook cuts the picture to a
square in a comment, and the old one (words, a photo and a gate print, og.jpg) lost its left half there. So the picture
is the logo and nothing else, stacked in the middle: the whole logo sits inside the middle square (630 by 630) of the
1200 by 630 picture, and it reads the same wide or square.

The shapes are the ones in static/assets/img/logo-horizontal-dark.svg. Nothing is redrawn: the mark and the two lines
of the name are moved, not changed.

    python3 design/share/make_og.py            # the logo picture, share-logo.png
    python3 design/share/make_og.py --photo    # the old picture with Juan and the gate print, og.jpg (run npm run build first)

A picture under /assets/ is kept by browsers for a year, and Facebook keeps a picture by its address. If the picture
ever changes, give it a new file name (OUT here and SHARE_IMG in build/build.mjs). og.jpg stays in the folder: old
shares, the business data and the blog posts still point at it. It is made from og.html, as before.
"""
import http.server, os, re, shutil, socketserver, sys, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LOGO = os.path.join(ROOT, 'static', 'assets', 'img', 'logo-horizontal-dark.svg')
OUT = os.path.join(ROOT, 'static', 'assets', 'img', 'share-logo.png')
W, H = 1200, 630
BG = '#0A0F24'
MARK_H = 330      # how tall the mark is
GAP = 40          # between the mark and the name
K = 0.18          # the size of the name (505 px wide)

if '--photo' in sys.argv:
    DIST = os.path.join(ROOT, 'dist')
    PHOTO = os.path.join(ROOT, 'static', 'assets', 'img', 'og.jpg')
    if not os.path.isdir(DIST):
        sys.exit('Run npm run build first.')
    shutil.copy(os.path.join(ROOT, 'design', 'share', 'og.html'), os.path.join(DIST, '_og.html'))

    class Quiet(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **k):
            super().__init__(*a, directory=DIST, **k)

        def log_message(self, *a):
            pass

    with socketserver.TCPServer(('127.0.0.1', 0), Quiet) as srv:
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        with sync_playwright() as p:
            b = p.chromium.launch()
            page = b.new_page(viewport={'width': W, 'height': H}, device_scale_factor=1)
            page.goto('http://127.0.0.1:%d/_og.html' % srv.server_address[1], wait_until='networkidle')
            page.evaluate('document.fonts.ready')
            page.wait_for_timeout(300)
            page.screenshot(path=PHOTO, type='jpeg', quality=88)
            b.close()
        srv.shutdown()
    os.remove(os.path.join(DIST, '_og.html'))
    print('wrote', PHOTO, os.path.getsize(PHOTO), 'bytes')
    sys.exit(0)

svg = open(LOGO, encoding='utf8').read()
m = re.search(r'<g [^>]*>(.*?)</g>(<path [^>]*/>)(<path [^>]*/>)', svg, re.S)
if not m:
    sys.exit('The logo file does not look the way this script expects (one group for the mark, then two paths for the name).')
mark, line1, line2 = m.group(1), m.group(2), m.group(3)

with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(viewport={'width': W, 'height': H}, device_scale_factor=1)
    # measure the three pieces as they sit in the logo file
    page.set_content('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><g id="m">%s</g><g id="a">%s</g><g id="b">%s</g></svg>' % (mark, line1, line2))
    box = page.evaluate("() => Object.fromEntries(['m','a','b'].map((i) => { const r = document.getElementById(i).getBBox(); return [i, [r.x, r.y, r.width, r.height]]; }))")
    mx, my, mw, mh = box['m']
    ax, ay, aw, ah = box['a']
    bx, by, bw, bh = box['b']
    s = MARK_H / mh
    name_h = (by + bh - ay) * K
    top = (H - (MARK_H + GAP + name_h)) / 2
    name_y = top + MARK_H + GAP
    parts = (
        '<g transform="translate(%.2f %.2f) scale(%.5f) translate(%.2f %.2f)">%s</g>' % (W / 2 - mw * s / 2, top, s, -mx, -my, mark) +
        '<g transform="translate(%.2f %.2f) scale(%.5f) translate(%.2f %.2f)">%s</g>' % (W / 2 - aw * K / 2, name_y, K, -ax, -ay, line1) +
        '<g transform="translate(%.2f %.2f) scale(%.5f) translate(%.2f %.2f)">%s</g>' % (W / 2 - bw * K / 2, name_y + (by - ay) * K, K, -bx, -by, line2))
    page.set_content('<html><body style="margin:0;background:%s"><svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d" style="display:block"><rect width="%d" height="%d" fill="%s"/>%s</svg></body></html>' % (BG, W, H, W, H, W, H, BG, parts))
    page.screenshot(path=OUT, type='png')
    b.close()

widest = max(mw * s, aw * K, bw * K)
print('wrote', OUT, os.path.getsize(OUT), 'bytes. The logo is %d px wide and %d px tall, so the middle square (630) has %d px to spare on each side.' % (widest, MARK_H + GAP + name_h, (630 - widest) / 2))

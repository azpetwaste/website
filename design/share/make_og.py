"""Makes static/assets/img/og.jpg, the picture that shows when someone shares a link to the site.

Run it after `npm run build` (it reads the font, logo and photos from dist):
    python3 design/share/make_og.py
"""
import http.server, os, shutil, socketserver, sys, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DIST = os.path.join(ROOT, 'dist')
OUT = os.path.join(ROOT, 'static', 'assets', 'img', 'og.jpg')

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
        page = b.new_page(viewport={'width': 1200, 'height': 630}, device_scale_factor=1)
        page.goto('http://127.0.0.1:%d/_og.html' % srv.server_address[1], wait_until='networkidle')
        page.evaluate('document.fonts.ready')
        page.wait_for_timeout(300)
        page.screenshot(path=OUT, type='jpeg', quality=88)
        b.close()
    srv.shutdown()
os.remove(os.path.join(DIST, '_og.html'))
print('wrote', OUT, os.path.getsize(OUT), 'bytes')

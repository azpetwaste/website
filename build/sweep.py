"""Open every page of the built site at phone, folding phone, tablet and computer sizes and look for three things:
a page that scrolls sideways, words under 15 px, and things to tap that are under 44 px.

Joe, Nov 17 and 18, 2026: "We're treating 70 year olds", and every screen has to be easy on a phone, a tablet and a
folding phone. Run this after a change to the look of a public page:
    npm run build && python3 build/sweep.py
    python3 build/sweep.py / /pricing/        only these pages
    SIZES=all python3 build/sweep.py          fifteen sizes in place of five (slow: about a minute a page)

It fails (exit 1) when a page scrolls sideways or a script on a page throws. Small words and small tap targets are
printed for a person to judge. Known and left on purpose: the "staff" link in the footer (11 px, it is not for
customers), the labels inside the sample report picture on the commercial pages, the words Call and text in a "Call or
text" line (44 px tall, as wide as the word), and the town shapes on the areas map (each town also has a full size link
under the map).
Sign up is not a page of its own here: it is checked by build/optin-shots.py and by hand. Needs Python Playwright and Chrome."""
import functools
import http.server
import os
import re
import sys
import threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, 'dist')
PORT = 8767
FIVE = [(320, 568), (390, 844), (466, 678), (890, 626), (1280, 900)]
ALL = [(320, 568), (360, 740), (375, 667), (390, 844), (412, 915), (430, 932), (466, 678), (600, 960), (768, 1024),
       (820, 1180), (890, 626), (1024, 768), (1180, 820), (1280, 900), (1440, 900)]
SIZES = ALL if os.environ.get('SIZES') == 'all' else FIVE

JS = """() => {
  const vw = document.documentElement.clientWidth, out = { sw: document.documentElement.scrollWidth, vw, small: new Set(), taps: new Set() };
  const vis = (el) => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !el.closest('#book-dock') && !el.closest('[hidden]') && !el.closest('.vh'); };
  for (const el of document.querySelectorAll('body *')) {
    if (!vis(el)) continue;
    const t = [...el.childNodes].filter((x) => x.nodeType === 3 && x.textContent.trim().length > 1).map((x) => x.textContent.trim()).join(' ');
    if (t && !el.closest('svg') && !el.closest('.stamp') && !el.closest('.print-c') && !el.closest('.map') && !el.closest('[aria-hidden=true]')) {
      const fs = parseFloat(getComputedStyle(el).fontSize); if (fs < 15) out.small.add(fs + 'px "' + t.slice(0, 30) + '"'); }
  }
  for (const el of document.querySelectorAll('a[href], button, input, select, summary')) {
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect();
    // a link inside a line of words is left out: it cannot be 44 px on both sides, and the accessibility rules leave it out too
    const inline = el.tagName === 'A' && getComputedStyle(el).display === 'inline' && el.parentElement && el.parentElement.textContent.trim().length > el.textContent.trim().length + 12;
    if (!inline && (r.height < 44 || r.width < 44)) out.taps.add(Math.round(r.width) + 'x' + Math.round(r.height) + ' "' + (el.textContent.trim() || el.getAttribute('aria-label') || el.tagName).slice(0, 26) + '"');
  }
  return { sw: out.sw, vw, small: [...out.small].slice(0, 12), taps: [...out.taps].slice(0, 14) }; }"""


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def pages():
    if len(sys.argv) > 1:
        return sys.argv[1:]
    xml = open(os.path.join(DIST, 'sitemap.xml'), encoding='utf8').read()
    return [re.sub(r'^https?://[^/]+', '', u) for u in re.findall(r'<loc>([^<]+)</loc>', xml)]


def main():
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Quiet, directory=DIST))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    bad = 0
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        for path in pages():
            seen = {}
            lines = []
            for w, h in SIZES:
                ctx = browser.new_context(viewport={'width': w, 'height': h}, has_touch=w < 1024, is_mobile=w < 1024)
                ctx.route('https://**', lambda r: r.abort())  # no tags, no outside calls
                page = ctx.new_page()
                errs = []
                page.on('pageerror', lambda e: errs.append(str(e)))
                page.goto('http://127.0.0.1:%d%s' % (PORT, path), wait_until='load')
                page.wait_for_timeout(600)
                r = page.evaluate(JS)
                ctx.close()
                if r['sw'] > r['vw']:
                    bad += 1
                    lines.append('  FAIL %d wide: the page scrolls sideways (%d px of page in a %d px screen)' % (w, r['sw'], r['vw']))
                if errs:
                    bad += 1
                    lines.append('  FAIL %d wide: a script threw: %s' % (w, errs[0][:160]))
                key = (tuple(r['small']), tuple(r['taps']))
                if key not in seen and (r['small'] or r['taps']):
                    seen[key] = w
                    if r['small']:
                        lines.append('  %d wide, words under 15 px: %s' % (w, ', '.join(r['small'])))
                    if r['taps']:
                        lines.append('  %d wide, under 44 px to tap: %s' % (w, ', '.join(r['taps'])))
            print(path)
            for line in lines:
                print(line)
        browser.close()
    print('\n%d pages at %d sizes. %s' % (len(pages()), len(SIZES), 'No page scrolls sideways.' if not bad else '%d problems.' % bad))
    sys.exit(1 if bad else 0)


main()

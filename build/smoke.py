"""Smoke test the built site in a real browser: phone and desktop screenshots, console errors, and the demo sign up flow."""
import os
import sys
import threading
import functools
import http.server
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, os.environ.get('OUT_DIR', 'dist'))
SHOTS = os.path.join(ROOT, 'shots')
os.makedirs(SHOTS, exist_ok=True)
PORT = 8765


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Quiet, directory=DIST))
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = 'http://127.0.0.1:%d' % PORT
errors = []


def watch(page, label):
    page.on('console', lambda m: errors.append('%s console %s: %s' % (label, m.type, m.text)) if m.type in ('error', 'warning') and 'fonts.g' not in m.text and 'api/config' not in m.text and '404' not in m.text else None)
    page.on('pageerror', lambda e: errors.append('%s pageerror: %s' % (label, e)))


def shot(page, name, full=False):
    page.screenshot(path=os.path.join(SHOTS, name + '.png'), full_page=full)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    phone = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    page = phone.new_page()
    watch(page, 'phone')
    page.route('https://fonts.googleapis.com/**', lambda r: r.abort())
    page.goto(BASE + '/', wait_until='networkidle')
    page.wait_for_timeout(600)
    shot(page, 'm_home_top')
    # open the sign up sheet from the hero
    page.locator('#app a[href="/book/"], #app a[href$="book/index.html"]').first.click()
    page.wait_for_timeout(400)
    assert page.evaluate("document.documentElement.classList.contains('book-open')"), 'sheet did not open'
    shot(page, 'm_book_0')
    page.fill('#b-zip', '85396')
    page.wait_for_timeout(150)
    dock = page.locator('#book-dock')
    dock.get_by_role('button', name='Continue').click()
    page.wait_for_timeout(200)
    shot(page, 'm_book_1')
    dock.get_by_role('radio', name='3 dogs').click()
    dock.get_by_role('button', name='Continue').click()
    page.wait_for_timeout(200)
    shot(page, 'm_book_2')
    dock.get_by_role('button', name='Continue').click()
    page.wait_for_timeout(200)
    dock.get_by_role('button', name='Continue').click()
    page.wait_for_timeout(200)
    shot(page, 'm_book_3_errors')
    page.fill('#b-name', 'Test Person')
    page.fill('#b-phone', '623 555 0100')
    page.fill('#b-email', 'test@example.com')
    page.fill('#b-addr', '123 W Test St')
    page.check('#b-tv')
    shot(page, 'm_book_3')
    dock.get_by_role('button', name='Continue').click()
    page.wait_for_timeout(250)
    shot(page, 'm_book_4')
    page.fill('#b-code', '123456')
    page.wait_for_timeout(400)
    shot(page, 'm_book_5')
    dock.get_by_role('button', name='Finish demo booking').click()
    page.wait_for_timeout(300)
    shot(page, 'm_book_6')
    # close the sheet with the phone back button
    page.go_back()
    page.wait_for_timeout(300)
    assert not page.evaluate("document.documentElement.classList.contains('book-open')"), 'back did not close the sheet'
    page.goto(BASE + '/', wait_until='networkidle')
    page.wait_for_timeout(500)
    shot(page, 'm_home_full', full=True)

    for route, name in [('/verrado/', 'm_verrado'), ('/goodyear/', 'm_goodyear'), ('/privacy/', 'm_privacy'), ('/texts/', 'm_texts'), ('/book/', 'm_bookpage'), ('/account/', 'm_account'), ('/404.html', 'm_404')]:
        pg = phone.new_page()
        watch(pg, name)
        pg.route('https://fonts.googleapis.com/**', lambda r: r.abort())
        pg.goto(BASE + route, wait_until='networkidle')
        pg.wait_for_timeout(500)
        shot(pg, name)
        if route == '/verrado/':
            shot(pg, 'm_verrado_full', full=True)
        if route == '/account/':
            pg.fill('#a-email', 'test@example.com')
            pg.get_by_role('button', name='Send my code').click()
            pg.wait_for_timeout(200)
            pg.fill('#a-code', '123456')
            pg.wait_for_timeout(400)
            shot(pg, 'm_account_in', full=True)
        pg.close()

    desk = browser.new_context(viewport={'width': 1440, 'height': 900})
    dp = desk.new_page()
    watch(dp, 'desk')
    dp.route('https://fonts.googleapis.com/**', lambda r: r.abort())
    dp.goto(BASE + '/', wait_until='networkidle')
    dp.wait_for_timeout(600)
    shot(dp, 'd_home')
    dp.mouse.wheel(0, 2600)
    dp.wait_for_timeout(500)
    shot(dp, 'd_home_scrolled')
    dp.goto(BASE + '/litchfield-park/', wait_until='networkidle')
    dp.wait_for_timeout(500)
    shot(dp, 'd_litchfield')
    dp.goto(BASE + '/terms/', wait_until='networkidle')
    dp.wait_for_timeout(300)
    shot(dp, 'd_terms')
    dp.goto(BASE + '/book/', wait_until='networkidle')
    dp.wait_for_timeout(300)
    shot(dp, 'd_bookpage')
    browser.close()

srv.shutdown()
print('\n'.join(errors) if errors else 'no console errors')
print('screenshots in', SHOTS)

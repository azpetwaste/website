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
    page.locator('#app .hero .hbk a').first.click()
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
    # the interactive yard: change the days, run a visit, check it ends clean with the price card
    yd = page.locator('#yard')
    yd.scroll_into_view_if_needed()
    page.fill('#yd-days', '12') if False else page.evaluate("(() => { const r = document.getElementById('yd-days'); r.value = '12'; r.dispatchEvent(new Event('input', { bubbles: true })); })()")
    page.wait_for_timeout(300)
    assert '12 days' in yd.inner_text(), 'days slider did not update'
    piles = page.locator('#yd-piles .ydp').count()
    assert piles >= 40, 'piles did not appear: %d' % piles
    shot(page, 'm_yard_before', full=False)
    page.locator('#yard .yd-go').click()
    page.wait_for_timeout(3500)
    gone = page.locator('#yd-piles .ydp.gone').count()
    assert 0 < gone < piles, 'scooper is not picking up piles: %d of %d' % (gone, piles)
    page.locator('#yard .ydc').scroll_into_view_if_needed()
    shot(page, 'm_yard_mid', full=False)
    page.wait_for_timeout(8000)
    assert page.locator('#yard .yd-end').count() == 1, 'yard run did not finish'
    assert page.locator('#yd-piles .ydp.gone').count() == piles, 'piles left after the run'
    yd.scroll_into_view_if_needed()
    shot(page, 'm_yard_done', full=False)
    page.locator('#yard .yd-again').click()
    page.wait_for_timeout(300)
    assert page.locator('#yd-piles .ydp.gone').count() == 0, 'run it again did not reset the yard'

    for route, name in [('/buckeye/', 'm_buckeye'), ('/areas-we-serve/', 'm_areas'), ('/verrado/', 'm_verrado'), ('/goodyear/', 'm_goodyear'), ('/privacy/', 'm_privacy'), ('/texts/', 'm_texts'), ('/book/', 'm_bookpage'), ('/account/', 'm_account'), ('/404.html', 'm_404')]:
        pg = phone.new_page()
        watch(pg, name)
        pg.route('https://fonts.googleapis.com/**', lambda r: r.abort())
        pg.goto(BASE + route, wait_until='networkidle')
        pg.wait_for_timeout(500)
        shot(pg, name)
        if route == '/verrado/':
            shot(pg, 'm_verrado_full', full=True)
        if route in ('/buckeye/', '/areas-we-serve/'):
            shot(pg, name + '_full', full=True)
        if route == '/buckeye/':
            q = pg.locator('#questions details.qa').first
            q.locator('summary').click()
            pg.wait_for_timeout(200)
            assert q.evaluate('d => d.open'), 'FAQ question did not open'
            q.scroll_into_view_if_needed()
            shot(pg, 'm_buckeye_faq')
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
    assert dp.evaluate("getComputedStyle(document.getElementById('book-dock')).display") == 'none', 'sign up form shows on desktop before Book now'
    # Book now in the header opens the centered window; Escape and a click outside close it
    dp.locator('#app header a.hbook').click()
    dp.wait_for_timeout(400)
    assert dp.evaluate("document.documentElement.classList.contains('book-open')"), 'desktop window did not open'
    shot(dp, 'd_book_open')
    dp.keyboard.press('Escape')
    dp.wait_for_timeout(300)
    assert not dp.evaluate("document.documentElement.classList.contains('book-open')"), 'Escape did not close the window'
    dp.locator('#app header a.hbook').click()
    dp.wait_for_timeout(300)
    dp.mouse.click(60, 450)
    dp.wait_for_timeout(300)
    assert not dp.evaluate("document.documentElement.classList.contains('book-open')"), 'clicking outside did not close the window'
    shot(dp, 'd_home_full', full=True)
    dp.locator('#yard').scroll_into_view_if_needed()
    dp.wait_for_timeout(300)
    shot(dp, 'd_yard')
    dp.goto(BASE + '/litchfield-park/', wait_until='networkidle')
    dp.wait_for_timeout(500)
    shot(dp, 'd_litchfield')
    shot(dp, 'd_litchfield_full', full=True)
    dp.goto(BASE + '/buckeye/', wait_until='networkidle')
    dp.wait_for_timeout(500)
    shot(dp, 'd_buckeye_full', full=True)
    dp.goto(BASE + '/areas-we-serve/', wait_until='networkidle')
    dp.wait_for_timeout(400)
    shot(dp, 'd_areas')
    shot(dp, 'd_areas_full', full=True)
    dp.goto(BASE + '/terms/', wait_until='networkidle')
    dp.wait_for_timeout(300)
    shot(dp, 'd_terms')
    dp.goto(BASE + '/account/', wait_until='networkidle')
    dp.wait_for_timeout(300)
    shot(dp, 'd_account')
    dp.goto(BASE + '/book/', wait_until='networkidle')
    dp.wait_for_timeout(300)
    shot(dp, 'd_bookpage')
    for w, h in [(1024, 768), (1280, 800)]:
        c = browser.new_context(viewport={'width': w, 'height': h})
        pg = c.new_page()
        watch(pg, 'w%d' % w)
        pg.route('https://fonts.googleapis.com/**', lambda r: r.abort())
        pg.goto(BASE + '/', wait_until='networkidle')
        pg.wait_for_timeout(500)
        shot(pg, 'd%d_home' % w)
        c.close()
    tab = browser.new_context(viewport={'width': 820, 'height': 1180}, device_scale_factor=1, is_mobile=True, has_touch=True)
    tp = tab.new_page()
    watch(tp, 'tablet')
    tp.route('https://fonts.googleapis.com/**', lambda r: r.abort())
    tp.goto(BASE + '/', wait_until='networkidle')
    tp.wait_for_timeout(500)
    shot(tp, 't_home')
    shot(tp, 't_home_full', full=True)
    browser.close()

srv.shutdown()
print('\n'.join(errors) if errors else 'no console errors')
print('screenshots in', SHOTS)

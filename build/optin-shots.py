"""Retake the two text opt in screenshots shown on /texts/ (the proof Twilio and the carriers ask for).

They must match the live sign up form. Run this after ANY change to the look or the words of the sign up form:
    npm run build && python3 build/optin-shots.py && npm run build
Then check that the words quoted in content/policies/texts.html still match, and change the "Captured" dates there.

Writes static/assets/img/sms-optin-form.png (step 3 of 4, the one visit text box unchecked),
static/assets/img/sms-optin-waitlist.png (the waitlist form, box unchecked) and
static/assets/img/sms-optin-myyard.png (the one My Yard text box, unchecked). Nothing is typed and nothing is sent."""
import os
import threading
import functools
import http.server
from playwright.sync_api import sync_playwright
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, 'dist')
OUT = os.path.join(ROOT, 'static', 'assets', 'img')
PORT = 8766


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Quiet, directory=DIST))
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = 'http://127.0.0.1:%d' % PORT


def phone(browser, height):
    ctx = browser.new_context(viewport={'width': 430, 'height': height}, device_scale_factor=2, is_mobile=True, has_touch=True)
    ctx.route('https://**', lambda r: r.abort())  # no tags, no outside calls
    return ctx


def save(page, name):
    path = os.path.join(OUT, name)
    page.evaluate('document.activeElement && document.activeElement.blur()')
    page.screenshot(path=path)
    Image.open(path).convert('RGB').save(path, 'PNG', optimize=True)  # same pixels, smaller file, no extra data
    print(name, Image.open(path).size, os.path.getsize(path), 'bytes')


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])

    # Step 3 of 4: tap a city with two ZIP codes, then Continue. Tall screen so the whole step shows.
    ctx = phone(browser, 1210)
    page = ctx.new_page()
    page.goto(BASE + '/book/', wait_until='networkidle')
    page.get_by_role('radio', name='Goodyear').click()
    page.wait_for_timeout(300)
    page.get_by_role('button', name='Continue').click()
    page.wait_for_timeout(500)
    assert 'Step 3 of 4' in page.inner_text('#app'), 'the text box is no longer on step 3 of 4: fix /texts/ too'
    assert page.evaluate("[document.querySelector('#b-tv').checked, !!document.querySelector('#b-td')]") == [False, False], 'the text box starts checked, or there are two boxes again'
    assert page.evaluate("(() => { const b = document.querySelector('.bk-body'); return b.scrollHeight - b.clientHeight; })()") <= 0, 'the step no longer fits: make the screen taller'
    save(page, 'sms-optin-form.png')
    ctx.close()

    # Waitlist form: step 1, "My city is not here".
    ctx = phone(browser, 1040)
    page = ctx.new_page()
    page.goto(BASE + '/book/', wait_until='networkidle')
    page.get_by_role('button', name='My city is not here').click()
    page.wait_for_timeout(500)
    assert page.evaluate("document.querySelector('#w-tx').checked") is False, 'the waitlist text box starts checked'
    fits = page.evaluate("""() => { const b = document.querySelector('.bk-body'); const card = document.querySelector('#w-city').closest('div[aria-live]');
      b.scrollTop = 0; b.scrollTop = card.getBoundingClientRect().top - b.getBoundingClientRect().top - 10;
      return card.getBoundingClientRect().bottom <= b.getBoundingClientRect().bottom; }""")
    assert fits, 'the waitlist form no longer fits: make the screen taller'
    page.wait_for_timeout(200)
    save(page, 'sms-optin-waitlist.png')
    ctx.close()

    # My Yard: one box, for visit texts, unchecked (Joe, Nov 17, 2026: the deals box came out). No screen asks for
    # deals texts. If a deals box ever comes back it must be its own box (Twilio error 30913).
    # With no server the page runs as a sample account, so nothing real is shown.
    ctx = phone(browser, 2600)
    ctx.add_init_script("try { sessionStorage.setItem('apw.demoIn', '1'); } catch (e) { }")
    page = ctx.new_page()
    page.goto(BASE + '/account/', wait_until='networkidle')
    page.wait_for_selector('#a-tv')
    if page.evaluate("document.querySelector('#a-tv').checked"):
        page.locator('#a-tv').uncheck()
    page.wait_for_timeout(300)
    assert page.evaluate("document.querySelector('#a-tv').checked") is False, 'the My Yard text box is checked'
    assert page.evaluate("document.querySelector('#a-td')") is None, 'My Yard has a deals box again: bring back its proof on /texts/'
    page.evaluate('document.activeElement && document.activeElement.blur()')
    clip = page.evaluate("""() => { const h = [...document.querySelectorAll('.yh2')].find((x) => /Texts from us/.test(x.textContent));
      const b = [...document.querySelectorAll('button')].find((x) => /Save my yard/.test(x.textContent));
      const t = h.getBoundingClientRect().top + scrollY - 20, e = b.getBoundingClientRect().bottom + scrollY + 20;
      return { x: 0, y: Math.round(t), width: 430, height: Math.round(e - t) }; }""")
    path = os.path.join(OUT, 'sms-optin-myyard.png')
    page.screenshot(path=path, clip=clip, full_page=True)
    Image.open(path).convert('RGB').save(path, 'PNG', optimize=True)
    print('sms-optin-myyard.png', Image.open(path).size, os.path.getsize(path), 'bytes', 'height for texts.html:', clip['height'])
    ctx.close()
    browser.close()

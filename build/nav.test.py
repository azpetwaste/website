"""Back buttons and the script rule in the crew app, in a real browser, under the same headers the live site sends.

    npm run build && python3 build/nav.test.py

It starts build/serve.mjs itself (dist/ with _headers, _redirects and the server). No keys and no database are needed:
the office is walked in /crew/?demo, and the scooper screen is walked with a made up sign in answered by this test.
"""
import json
import os
import subprocess
import sys
import time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(os.environ.get('PORT', '8791'))
BASE = 'http://127.0.0.1:%d' % PORT
srv = subprocess.Popen(['node', os.path.join(ROOT, 'build/serve.mjs')], env=dict(os.environ, PORT=str(PORT)), stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
srv.stdout.readline()
passed = failed = 0
problems = []


def ok(label, cond, extra=None):
    global passed, failed
    if cond:
        passed += 1
    else:
        failed += 1
    print(('  ok   ' if cond else '  FAIL ') + label + ('  ' + json.dumps(extra)[:200] if extra is not None else ''))


def watch(page, label):
    def on_console(m):
        t = m.text
        if m.type == 'error' and ('Content Security Policy' in t or 'Refused to' in t):
            problems.append(label + ': ' + t[:200])
    page.on('console', on_console)
    page.on('pageerror', lambda e: problems.append(label + ' crash: ' + str(e)[:200]))


def state(page):
    return page.evaluate("""() => ({
        h2: (document.querySelector('.daynav h2') || {}).textContent || '',
        tab: (document.querySelector('.tab.on') || {}).textContent || '',
        back: !!document.getElementById('bk'),
        drawer: !!document.querySelector('.drawer'), sheet: !!document.querySelector('.sheet'),
        plan: /Plan the week|Back to the schedule/i.test((document.querySelector('.wrap') || document.body).innerText) && !document.querySelector('.wk'),
        wide: document.documentElement.scrollWidth > window.innerWidth + 1,
        toast: (document.querySelector('.toast') || {}).textContent || '', url: location.pathname + location.search + location.hash })""")


def tab(page, name):
    page.click('.tab:has-text("%s")' % name)
    page.wait_for_timeout(350)


try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=os.environ.get('CHROME', '/usr/bin/google-chrome'), args=['--no-sandbox'])
        for size, w, hgt in (('phone', 375, 812), ('computer', 1280, 800)):
            print('\nOffice, %s size' % size)
            ctx = browser.new_context(viewport={'width': w, 'height': hgt})
            page = ctx.new_page()
            watch(page, size)
            page.goto(BASE + '/crew/?demo')
            page.wait_for_selector('.wk')
            page.wait_for_timeout(500)
            s = state(page)
            ok('opens on the Schedule with no Back button, since it is the home screen', s['tab'].startswith('Schedule') and not s['back'], s)
            home_day = s['h2']
            for name in ('Customers', 'Leads', 'Texts', 'Team', 'Money', 'Health'):
                tab(page, name)
                s = state(page)
                shown = s['tab'].startswith(name) and s['back'] and not s['wide']
                page.click('#bk')
                page.wait_for_timeout(350)
                s2 = state(page)
                ok('%s shows Back, and Back lands on the Schedule' % name, shown and s2['tab'].startswith('Schedule') and not s2['back'] and s2['h2'] == home_day, [s['tab'], s['back'], s['wide'], s2['tab']])
            tab(page, 'Leads'); tab(page, 'Customers'); tab(page, 'Money')
            page.go_back(); page.wait_for_timeout(350)
            s = state(page)
            ok('after three tabs in a row, one press of the phone or browser back button is the Schedule', s['tab'].startswith('Schedule') and not s['back'], s['tab'])
            page.go_forward(); page.wait_for_timeout(350)
            ok('the forward button goes back to the tab that was open', state(page)['tab'].startswith('Money'))
            page.click('#hm'); page.wait_for_timeout(350)
            ok('the logo is a home button', state(page)['tab'].startswith('Schedule'))

            tab(page, 'Customers')
            page.wait_for_selector('[data-cust]')
            page.click('[data-cust]'); page.wait_for_selector('.drawer')
            page.go_back(); page.wait_for_timeout(350)
            s = state(page)
            ok('with a customer open, the back button closes the customer and stays on Customers', not s['drawer'] and s['tab'].startswith('Customers'), s)
            page.click('[data-cust]'); page.wait_for_selector('.drawer')
            page.click('#dx'); page.wait_for_timeout(200)
            ok('the customer panel has its own Back button, top left', not state(page)['drawer'])
            page.click('[data-cust]'); page.wait_for_selector('.drawer')
            page.keyboard.press('Escape'); page.wait_for_timeout(200)
            ok('the Esc key closes it too', not state(page)['drawer'])
            page.go_back(); page.wait_for_timeout(350)
            ok('and the next back press is the Schedule', state(page)['tab'].startswith('Schedule'))

            page.click('[data-plan="1"]'); page.wait_for_timeout(500)
            s = state(page)
            ok('Plan the week shows Back', s['back'] and not page.query_selector('.wk'), s)
            page.click('#bk'); page.wait_for_timeout(400)
            ok('Back from Plan the week is the Schedule', page.query_selector('.wk') is not None and not state(page)['back'])
            page.click('[data-plan="1"]'); page.wait_for_timeout(400)
            page.go_back(); page.wait_for_timeout(400)
            ok('so is the phone back button', page.query_selector('.wk') is not None)
            page.click('[data-plan="1"]'); page.wait_for_timeout(400)
            tab(page, 'Leads')
            page.go_back(); page.wait_for_timeout(400)
            ok('Plan the week, then Leads, then back: the Schedule, not the planner', page.query_selector('.wk') is not None and state(page)['tab'].startswith('Schedule'))

            page.click('#so'); page.wait_for_selector('.sheet')
            page.go_back(); page.wait_for_timeout(300)
            s = state(page)
            ok('with a pop up open, back closes the pop up and nothing else', not s['sheet'] and s['tab'].startswith('Schedule'), s)

            page.click('.arrow[data-day="7"]'); page.wait_for_timeout(400)
            other = state(page)['h2']
            tab(page, 'Money'); page.click('#bk'); page.wait_for_timeout(400)
            ok('Back keeps the day that was open on the Schedule', state(page)['h2'] == other and other != home_day, [other, home_day])
            tab(page, 'Money'); page.click('#hm'); page.wait_for_timeout(500)
            ok('the logo goes to today', state(page)['h2'] == home_day, state(page)['h2'])

            page.go_back(); page.wait_for_timeout(300)
            s = state(page)
            ok('back on the home screen does not drop out of the app: it says to tap again', '/crew/' in s['url'] and 'back again' in s['toast'].lower() and s['tab'].startswith('Schedule'), s)
            page.wait_for_timeout(3000)
            tab(page, 'Leads'); page.go_back(); page.wait_for_timeout(350)
            ok('and after that the back button works as before', state(page)['tab'].startswith('Schedule') and '/crew/' in state(page)['url'])
            ok('the address stays clean: no # is added', state(page)['url'] == '/crew/?demo', state(page)['url'])

            tab(page, 'Health'); page.reload(); page.wait_for_selector('.tab.on'); page.wait_for_timeout(600)
            s = state(page)
            ok('a reload on Health comes back on Health with Back showing', s['tab'].startswith('Health') and s['back'], s)
            page.click('#bk'); page.wait_for_timeout(400)
            ok('and Back still lands on the Schedule', state(page)['tab'].startswith('Schedule'))
            if size == 'phone':
                tab(page, 'Health')
                vis = page.evaluate("""() => { var t = document.querySelector('.tab.on').getBoundingClientRect(); return t.left >= 0 && t.right <= window.innerWidth; }""")
                ok('on a phone the open tab is slid into view in the tab strip', vis)
                page.click('#bk'); page.wait_for_timeout(300)

            # My route inside the office: a full yard still works with the new header.
            tab(page, 'My route'); page.wait_for_timeout(500)
            page.click('[data-a="start"]'); page.wait_for_timeout(700)
            if page.query_selector('.sheet #qy'):
                page.click('#qy'); page.wait_for_timeout(600)
            page.click('[data-a="arrive"]'); page.wait_for_timeout(500)
            for k in page.evaluate("() => [...document.querySelectorAll('[data-ck]')].map(b => b.dataset.ck)"):
                page.click('[data-ck="%s"]' % k); page.wait_for_timeout(120)
            page.click('[data-a="photo"]'); page.wait_for_timeout(1800)
            page.wait_for_timeout(1500)
            txt = page.inner_text('#app')
            ok('a yard still runs start to photo to the next yard', 'YARD 2 OF' in txt.upper(), txt[100:260])
            page.go_back(); page.wait_for_timeout(350)
            ok('back from My route is the Schedule, and the route is not lost', state(page)['tab'].startswith('Schedule'))

            real = list(problems)
            ok('the app itself breaks no security rule and has no crash', not real, real[:3])
            # The script rule. A script slipped into the page must not run. (The app's own script just ran all of the above.)
            hacked = page.evaluate("""async () => {
              document.body.insertAdjacentHTML('beforeend', '<img src="/nope.png" onerror="window.__in1 = 1">');
              document.body.insertAdjacentHTML('beforeend', '<svg onload="window.__in2 = 1"></svg><iframe srcdoc="<script>parent.__in2 = 1<\\/script>" style="display:none"></iframe>');
              var a = document.createElement('a'); a.href = 'javascript:window.__in3=1'; document.body.appendChild(a); a.click();
              await new Promise(r => setTimeout(r, 500));
              return [window.__in1 || 0, window.__in2 || 0, window.__in3 || 0]; }""")
            ok('a script slipped into the page (image, picture, frame and link tricks) does not run', hacked == [0, 0, 0], hacked)
            ok('and the browser says it blocked them', len(problems) >= 3, len(problems))
            del problems[:]
            ctx.close()

        print('\nScooper screen (made up sign in, answered by this test)')
        ctx = browser.new_context(viewport={'width': 375, 'height': 812})
        page = ctx.new_page()
        watch(page, 'scooper')
        stops = [{'id': i + 1, 'position': i + 1, 'status': 'scheduled', 'code': 'AAAAA%d' % i, 'photo_path': None, 'no_photo': False,
                  'customer': {'id': 'c%d' % i, 'name': 'Test Yard %d' % (i + 1), 'phone': '6235550100', 'address': '%d W Main St' % (100 + i), 'zip': '85326', 'dogs': 2, 'gate_code': '1234', 'lat': None, 'lng': None}} for i in range(3)]
        today = {'day': '2026-11-20', 'dayName': 'Friday', 'route': {'id': 1, 'status': 'planned'}, 'stops': stops, 'texts': [], 'me': {'name': 'Juan', 'role': 'scooper'}}

        def answer(route):
            u = route.request.url
            if u.endswith('/api/staff/me'):
                return route.fulfill(status=200, content_type='application/json', body=json.dumps({'staff': {'name': 'Juan', 'role': 'scooper', 'email': 'j@example.com'}}))
            if '/api/crew/' in u:
                return route.fulfill(status=200, content_type='application/json', body=json.dumps(today))
            if u.endswith('/api/staff/code'):
                return route.fulfill(status=200, content_type='application/json', body=json.dumps({'ok': True, 'message': 'If that email is on the team, a 6 digit code is on its way.'}))
            return route.continue_()
        page.route('**/api/**', answer)
        page.goto(BASE + '/crew/')
        page.wait_for_selector('#em')
        page.fill('#em', 'j@example.com'); page.click('#go'); page.wait_for_selector('#cd')
        page.go_back(); page.wait_for_timeout(300)
        ok('sign in: back from the code step is the email step, with the email still there', page.query_selector('#em') is not None and page.input_value('#em') == 'j@example.com')
        page.click('#go'); page.wait_for_selector('#cd'); page.click('#back'); page.wait_for_timeout(300)
        ok('"Use a different email" does the same', page.query_selector('#em') is not None)
        page.evaluate("() => localStorage.setItem('apw.staff', JSON.stringify({ access_token: 'x', refresh_token: 'y', expires_at: Math.floor(Date.now() / 1000) + 3600, role: 'scooper', name: 'Juan' }))")
        page.goto(BASE + '/crew/')
        page.wait_for_selector('[data-a="start"]')
        page.go_back(); page.wait_for_timeout(300)
        s = state(page)
        ok('scooper: a back press by mistake does not leave the route', '/crew/' in s['url'] and page.query_selector('[data-a="start"]') is not None and 'back again' in s['toast'].lower(), s)
        ok('scooper: the route screen has no office tabs and no Back button to get lost with', page.query_selector('.tab') is None and not s['back'])
        ok('scooper screen breaks no security rule and has no crash', not problems, problems[:3])
        ctx.close()
        browser.close()
finally:
    srv.terminate()

print('\n%d passed, %d failed' % (passed, failed))
sys.exit(1 if failed else 0)

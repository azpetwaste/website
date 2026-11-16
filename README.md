# arizonapetwaste.com

The Arizona Pet Waste website: home page with sign up built in, six town pages, policies, sign in (email code), Stripe checkout with the first month free, and My Yard.

Hosting: Cloudflare Pages. Accounts and data: Supabase. Payments: Stripe. Email: Resend.
Everything is under info@arizonapetwaste.com.

## Pages

| URL | What it is | Google |
|---|---|---|
| `/` | Home page with the sign up sheet (phone) or sign up panel (computer) | indexed |
| `/pooper-scooper/buckeye-az/` `/pooper-scooper/buckeye-az/verrado/` `/pooper-scooper/goodyear-az/` `/pooper-scooper/litchfield-park-az/` `/pooper-scooper/citrus-park-az/` `/pooper-scooper/waddell-az/` | Town pages with map, neighborhoods, local questions. Short links like `/verrado/` and `/waddell/` forward to them | indexed |
| `/privacy/` `/terms/` `/texts/` `/accessibility/` | Policies | indexed |
| `/book/` | Sign up on its own page (for QR codes, yard signs, texts) | not indexed |
| `/account/` | My Yard: sign in, gate code, dog names, texts, card and cancel | not indexed |
| `/sitemap.xml` `/robots.txt` `/llms.txt` | For Google and AI search | |
| `/crew/` | Field desk: staff sign in, crew route, office (tiny "staff" link under the footer) | not indexed |
| `/t/CODE` | Customer truck link for one visit. Ends 2 hours after the visit | not indexed |

Deep links for flyers and QR codes: `/book/?zip=85396&plan=week&dogs=2`

## How it is built

- `src/boards/*.json` are the design boards exported from the design canvas (do not hand edit; they are regenerated).
- `src/runtime/dc.js` renders the boards. The build renders every page to real HTML for Google, then the same code runs in the browser.
- `src/runtime/apw.js` runs sign in, the sign up sheet, Stripe and the light or dark look.
- The look (font, colors, layout) is `design/generator/look.py`. The site uses one font, Archivo, from `static/assets/fonts/` (our own file, nothing from Google Fonts). See `design/README.md`.
- `src/worker/worker.js` is the server. It ships as `dist/_worker.js` and answers `/api/*` only.
- `content/policies/` holds the policy text. `src/site.config.json` holds the phone, email, first visit date, and the BBB, Chamber and social links (fill in `sameAs`, `badges`, `social` once you have them).

```
npm install
npm run build      # makes dist/
npm run check      # one H1 per page, titles, no dashes in copy, links, structured data
```

## Server settings (Cloudflare Pages > Settings > Variables and Secrets)

| Name | Where to get it | Type |
|---|---|---|
| `SUPABASE_URL` | Supabase > Project Settings > API | text |
| `SUPABASE_ANON_KEY` | Supabase publishable key (or legacy anon key) | text |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase secret key (or legacy service role key) | secret |
| `STRIPE_PUBLISHABLE_KEY` | Stripe > Developers > API keys (`pk_test_` first, `pk_live_` to take real cards) | text |
| `STRIPE_SECRET_KEY` | Stripe > Developers > API keys (`sk_test_` first, `sk_live_` to take real cards) | secret |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook for `https://arizonapetwaste.com/api/stripe-webhook` | secret |
| `RESEND_API_KEY` | Resend > API Keys (booking emails to you and the customer) | secret |
| `MAIL_FROM` | `Arizona Pet Waste <info@arizonapetwaste.com>` | text |
| `NOTIFY_EMAIL` | `info@arizonapetwaste.com` | text |
| `SITE_URL` | `https://arizonapetwaste.com` | text |
| `FIRST_VISIT_FROM` | `2026-11-20` (first day people can pick) | text |
| `NODE_VERSION` | `22` | text |

Until the Supabase and Stripe keys are set, the site runs in demo mode: the whole sign up works, nothing is saved and no card is charged.
Check the server any time at `/api/health`. It shows if the keys are in (`live`), which Stripe mode they are for (`keys`: test, live or mixed), and if the webhook secret (`hook`) and the mail key (`mail`) are set. It never shows a key.

## Stripe webhook events

`checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`, `customer.updated`

How billing works: the card form saves a card and charges $0 (Checkout in setup mode). The server then starts the plan (`startPlan`): free until the free month ends, a part month that day for the days left up to the 1st, then the full price on the 1st of each month. A failed payment puts visits on hold until the bill is paid. `GO_LIVE.md` part 5 has the Stripe settings and part 8 has every Cloudflare setting.

Prices are created in Stripe on the first sign up (lookup keys `apw_week_base`, `apw_week_extra`, `apw_twice_base`, `apw_twice_extra`, `apw_eow_base`, `apw_eow_extra`). To change a price later, make a new price in Stripe and move the lookup key to it.

## Test cards (test mode)

`4242 4242 4242 4242`, any future date, any 3 numbers, any ZIP.

## Database

Run `supabase/schema.sql` once in Supabase > SQL Editor. The `route_sheet` view lists every booked yard by first visit day.

## Field desk (crew app, office, truck link)

One staff entrance: `arizonapetwaste.com/crew`. Staff type their email and get a 6 digit code. Only emails on the Team list get a code, so customers and strangers cannot get in. No passwords.

- Scoopers see today's route with one big button: Start route, Arrived, checklist, Gate photo, Done. Can't service has a reason. GPS goes out every 15 seconds while the route is live and the screen stays awake. Arrived fires on its own within about 50 meters of a pinned yard.
- Owner and office see Today, My route, Customers, Leads, Texts, Team and Money.
- Every booking on the website lands in Customers on its own (the Stripe webhook marks it paid, pins the address with the free US Census lookup, and gives it the area's service day). Waitlist and sign up requests land in Leads. Cancel or pause takes them off routes that have not happened yet.
- Texts never send from here. Until Twilio is approved, each text waits in Texts. Tap Open on the business phone, send it, tap Sent.
- The truck link shows only that visit: status, arrival time, miles away while we head there, the scooper's first name, and the gate photo when done. While we head to that yard it shows a live Google map: the truck gliding along the road line to their home, with a traffic based arrival time. It never shows other homes.
- Photos sit in the private `gate-photos` bucket and go out only by links that expire in 2 hours.

Setup: run `supabase/crm.sql` once in Supabase > SQL Editor (after `schema.sql`). It adds the owner row for `info@arizonapetwaste.com`. Sign in at `/crew`, add the team, and set a service day for each area under Team.

Live map: add `GOOGLE_MAPS_BROWSER_KEY` (Maps JavaScript API, HTTP referrer locked to arizonapetwaste.com) and `GOOGLE_MAPS_SERVER_KEY` (Routes API only, type Secret) in Cloudflare. Without them the link shows the arrival time and a simple progress line.

Optional: `CRON_SECRET` (16+ characters) lets an outside scheduler call `POST /api/office/night-before` with header `x-cron-secret`. Until then, press "Queue tomorrow's texts" on Today.

Test: `node build/worker.test.mjs` (site server). `DATABASE_URL=postgres://... node build/desk.test.mjs` runs the field desk end to end against a real Postgres (needs the `pg` package).

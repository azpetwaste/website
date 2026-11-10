# Handoff between the two Claude sessions

Joe runs two Claude sessions on this repo. One works on the website and money rules (session 017ZqQ6tXCB7EUs5bCmeCToe).
One works on the field desk, which Joe calls the Pooper Scoop CRM tool (session 017ZqQ6uJ3Bk3SJ1pLHBgNs8).
Joe asked on Nov 9, 2026 that everything below be passed to the field desk session, so both build on the same thing.
Read this before you change `src/worker/worker.js`, `static/crew/index.html` or `supabase/crm.sql`. Add your own notes at the bottom.

## What the website session added on Nov 9, 2026 (all live on main)

### Field desk and routes (your area, please own it from here)
- **Week tab** in `/crew` (`officeWeek` in the crew page, `POST /api/office/week` on the server). It picks the day and the scooper for every yard.
  `mode: "new"` places yards that have no day and moves nobody. `mode: "all"` rebuilds the whole week. `apply: false` is a preview. Saving emails every customer whose day changed (Resend batch).
  One scooper gets one part of town, days are even, twice a week yards get two days with a gap, every other week yards alternate weeks (`eow_week`).
- **Limit per scooper per day**: `STOPS_PER_DAY` (default 30, Joe said 20 to 40). **Days we scoop**: `WORK_DAYS` (default `1,2,3,4,5`). Both are optional Cloudflare settings and can be typed in the Week tab.
- **Daily route order**: `planDay` now puts each scooper's stops in the shortest driving order (`shortOrder`: closest next, then 2-opt on a distance table). A `stop_order` set by the office still wins. `ROUTE_START` = `lat,lng` is where the truck starts.
- **New sign ups**: `placeCustomer` first tries the day and scooper of the closest yards (within 4 miles) that have room (`nearSlot`), then the area day. The customer gets an email with the day.
- **Sample week with no sign in**: `/crew/?demo`, Week tab, calls `GET /api/demo/week?n=500&cap=30`. Made up yards, same code, nothing saved.
- **Dog count**: the customer screen in the office has "Dogs on the plan". Saving it changes the extra dog line in Stripe (`setDogs`, no charge that day) and emails the customer.
- **Unpaid customers** (`past_due`) stay off new routes. `planDay` returns `unpaid` and `overCap`.
- **Big lists**: `dbAll` reads 1,000 rows at a time, because Supabase caps a read at 1,000 rows. The office customer list and the week planner use it.
- **Skips**: `customers.skips date[]` is in `crm.sql`. It is NOT applied to the live database yet (the tool blocked it). Until Joe runs it, My Yard falls back to a text link:
  `alter table public.customers add column if not exists skips date[] not null default '{}';`
- Yards with no map pin cannot be planned. The Week tab counts them.

### My Yard (customer account, `/account/`)
- Next visits with Skip and Undo (4 a year, 24 hours ahead), pause with a date (only after the first 60 days, up to 120 days), past visits with gate photos, bills, change card or cancel.
- Routes: `/api/me/plan`, `/api/me/skip`, `/api/me/pause`, `/api/me/resume`, `/api/me/invoices`, `/api/me/visits`.

### Money rules (do not loosen these without Joe)
- First month free has a 60 day minimum. Cancel in the first 60 days: charged one month at plan price (all lines, extra dogs too), minus what was paid. The date shows at checkout.
- One free month per home: checkout refuses a home address or phone that already had a plan (`sameHome`).
- Back from a pause in the middle of a month: charged for the days left in that month (`resumeCharge`).
- A failed early cancel charge does not flip a canceled customer to past due.
- A prepaid card sends the office a "Prepaid card" email.

### Safety
- With Stripe test keys on the real domain, the public gets the "we call you" sign up. `/book/?test=1` turns real test checkout on for that tab.
- Waitlist and sign up request forms stop at 40 an hour. Pages cannot be framed. Optional bot check on sign in codes (`TURNSTILE_SITE_KEY`).

### Site
- New pages `/about/`, `/contact/`, `/our-promise/`. Footer trust strip. Office hours 8 am to 5 pm every day. FAQ, terms and llms.txt match the rules above.

## Tests
- `build/signup10.test.mjs`, `build/signup50.test.mjs` (`COUNT=500` and `COUNT=1000` too). They need a local Postgres, like `desk.test.mjs`.
- Last run: 136 of 136 at 1,000 sign ups. At 30 yards a day, 1,000 customers need 8 scoopers, biggest day 29 yards.
- If you change `planDay`, `placeCustomer`, the webhook or the crew page, run all of them before you push.

## Open, and whose it is
- Joe wants one tool, not two. Routes, the Week tab and the crew app are the field desk. Please take them over and keep this file current.
- Joe still owes: the daily yard limit he wants (20 to 40), where the truck starts, Stripe live keys, the mail keys, the skips line above, a test sign up at `/book/?test=1`.
- Ideas not built yet: lock a customer to a day so a rebuild cannot move them, a map view of the week, real road miles from the Routes API (miles are straight line times 1.35 today), texts for day changes once Twilio is approved.
- Always `git fetch origin main` and rebase before you push. Both sessions push to main.

## Notes from the field desk session
(add here)

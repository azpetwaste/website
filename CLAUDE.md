# Arizona Pet Waste: website and field desk

Read this first. New to the field desk (Joe calls it the Field App)? Read `docs/FIELD_APP.md`. Then read `docs/HANDOFF.md`: two Claude sessions push to this repo, and that file says what the other one changed and what Joe asked for. `README.md` has how the site is built. `GO_LIVE.md` has account setup.

## What is here
- The public site (Cloudflare Pages, boards in `src/boards`, do not hand edit those).
- The server: `src/worker/worker.js`. It answers `/api/*` only. Sign up, Stripe, My Yard, and the field desk.
- The field desk: `static/crew/index.html` (staff), `static/t/index.html` (customer truck link), `supabase/crm.sql` (tables).
- Demo, no sign in: `/crew/?demo` (made up yards, lives in the browser tab only) and `/t/DEMO01` (a made up visit that loops every 3 minutes, served by `trackDemo`).
- Crash log: server errors and crashes in the crew app or on a truck link go to the `errors` table. The office reads them on the Health tab (`/api/office/health`).
- Staff training page: `static/staff-73d752e4/` (video and steps). Not indexed, not in the sitemap, not linked from any page. Keep it out of `robots.txt` too, since listing it there would show the address.
- One Supabase database for everything. The Stripe webhook keeps `customers` in sync, so every sign up shows up in the office on its own.

## Rules
- Never paste or commit a key, token or password. Keys live in Cloudflare and Supabase settings only.
- Do not send texts or place calls. Twilio is not approved. Texts wait in the `messages` table as `queued` and staff send them by hand.
- Do not create Stripe products, prices, webhooks or charges by hand. Prices are made by the site from lookup keys.
- Do not invent the missed photo credit amount. A visit with no gate photo is flagged `no_photo` for the office.
- Keep `623.309.6104` as the call and text line on the site.
- The truck link map is Google Maps Platform: Maps JavaScript API in the browser, Routes API on the server for the road line and traffic arrival time. Do not switch to Mapbox (its terms need a separate license for apps used in vehicles) or OpenStreetMap tiles.
- The scooper agrees to location sharing once, on the first Start route (`staff.location_ok_at`). Keep that step.
- Copy rules: no dashes in copy, short plain words, one h1 per page. `npm run check` enforces this.

- Week plan rules (`weekPlan`): no scooper day goes over the limit, days are cut at the long hops between towns so a day stays in one part of town when it can, a week only gets another day when that saves more than `DAY_COST` road miles, and no day is smaller than `DAY_MIN` yards. A sign up only takes a day that has room. Past the limit it waits under "New sign ups with no day yet".
- Week plan: the Schedule tab in `/crew` has Plan the week (`/api/office/week`). It picks the day and scooper for every yard. Yards per scooper per day and the days we scoop are saved from that screen (`/api/office/settings`, table `settings`) and win over the optional Cloudflare settings `STOPS_PER_DAY` and `WORK_DAYS`. `ROUTE_START` (`lat,lng`) is where the truck starts. `/crew/?demo` plans made up yards with the same code (`/api/demo/week`) and saves nothing.
- Bot check on sign in codes: set `TURNSTILE_SITE_KEY` in Cloudflare Pages and put the Turnstile secret in Supabase (Auth, Bot and Abuse Protection, Turnstile). Set the site key first. Test customer and staff sign in right after.

## Checks
```
npm install
npm run build
npm run check
node build/worker.test.mjs
node build/week.test.mjs   # week planner: town days, the daily limit, 300 random weeks. No database needed
DATABASE_URL=postgres://... node build/desk.test.mjs   # needs a local Postgres and the pg package
DATABASE_URL=postgres://... node build/signup10.test.mjs   # ten sign ups, the CRM list, the route order and the crew app
DATABASE_URL=postgres://... node build/signup50.test.mjs   # fifty sign ups at once (COUNT=500 for five hundred), theft and break in attempts, money rules, routes per service day
```

## Still open (needs Joe)
State on Nov 9, 2026. Supabase keys, Google Maps keys and Stripe test mode keys are in Cloudflare. Supabase sign in email sends through Resend.
1. Test mode sign up, run by a person: `/book/?test=1` (while Stripe test keys are in, the public gets the "we call you" sign up and leads land in the office; `?test=1` turns real checkout on for that browser tab) with a real inbox for the 6 digit code and Stripe test card 4242 4242 4242 4242. Then check the customer shows in `/crew` with status Free month.
2. Mail from the site: `RESEND_API_KEY`, `MAIL_FROM`, `NOTIFY_EMAIL` in Cloudflare Pages. Until then no sign up notice reaches the office inbox.
3. Stripe live mode keys and live webhook, after the phone test passes.
4. Twilio: EIN, brand and campaign registration, then wire sending into `queueText`.
5. Phone road test of the crew app on the scooper's real phone (iPhone and Android).
6. The Cursor field desk code: push it to GitHub so it can be compared and anything worth keeping moved here.

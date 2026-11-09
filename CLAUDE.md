# Arizona Pet Waste: website and field desk

Read this first. `README.md` has how the site is built. `GO_LIVE.md` has account setup.

## What is here
- The public site (Cloudflare Pages, boards in `src/boards`, do not hand edit those).
- The server: `src/worker/worker.js`. It answers `/api/*` only. Sign up, Stripe, My Yard, and the field desk.
- The field desk: `static/crew/index.html` (staff), `static/t/index.html` (customer truck link), `supabase/crm.sql` (tables).
- Demo, no sign in: `/crew/?demo` (made up yards, lives in the browser tab only) and `/t/DEMO01` (a made up visit that loops every 3 minutes, served by `trackDemo`).
- Crash log: server errors and crashes in the crew app or on a truck link go to the `errors` table. The office reads them on the Health tab (`/api/office/health`).
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

## Checks
```
npm install
npm run build
npm run check
node build/worker.test.mjs
DATABASE_URL=postgres://... node build/desk.test.mjs   # needs a local Postgres and the pg package
```

## Still open (needs Joe)
1. Supabase project `arizonapetwaste` exists and both SQL files are applied. Still to do: Auth email template with the 6 digit code, custom SMTP through Resend, and the Supabase keys in Cloudflare.
2. Twilio: EIN, brand and campaign registration, then wire sending into `queueText`.
3. Google Cloud project with billing, Maps JavaScript API and Routes API on, two keys in Cloudflare: GOOGLE_MAPS_BROWSER_KEY (locked to arizonapetwaste.com) and GOOGLE_MAPS_SERVER_KEY.
4. Phone road test of the crew app on the scooper's real phone (iPhone and Android).
5. The Cursor field desk code: push it to GitHub so it can be compared and anything worth keeping moved here.

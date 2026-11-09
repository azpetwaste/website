# Arizona Pet Waste: website and field desk

Read this first. `README.md` has how the site is built. `GO_LIVE.md` has account setup.

## What is here
- The public site (Cloudflare Pages, boards in `src/boards`, do not hand edit those).
- The server: `src/worker/worker.js`. It answers `/api/*` only. Sign up, Stripe, My Yard, and the field desk.
- The field desk: `static/crew/index.html` (staff), `static/t/index.html` (customer truck link), `supabase/crm.sql` (tables).
- One Supabase database for everything. The Stripe webhook keeps `customers` in sync, so every sign up shows up in the office on its own.

## Rules
- Never paste or commit a key, token or password. Keys live in Cloudflare and Supabase settings only.
- Do not send texts or place calls. Twilio is not approved. Texts wait in the `messages` table as `queued` and staff send them by hand.
- Do not create Stripe products, prices, webhooks or charges by hand. Prices are made by the site from lookup keys.
- Do not invent the missed photo credit amount. A visit with no gate photo is flagged `no_photo` for the office.
- Keep `623.309.6104` as the call and text line on the site.
- No map on the truck link until Joe decides on Mapbox (including its vehicle tracking terms).
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
1. Run `supabase/crm.sql` in Supabase. Add the team at /crew > Team. Set each area's service day.
2. Twilio: EIN, brand and campaign registration, then wire sending into `queueText`.
3. Mapbox yes or no for the truck link map.
4. Phone road test of the crew app on the scooper's real phone (iPhone and Android).
5. The Cursor field desk code: push it to GitHub so it can be compared and anything worth keeping moved here.

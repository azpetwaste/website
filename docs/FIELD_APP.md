# Field App: start here

Joe calls the Arizona Pet Waste field desk the **Field App**. This file is the handoff for any new Claude chat that picks it up. Written Nov 9, 2026.
Read `CLAUDE.md` and `docs/HANDOFF.md` after this.

## What it is
One tool for a dog poop scooping company in the West Valley, Arizona. First visits are Nov 20, 2026.
- **Staff app:** arizonapetwaste.com/crew. Scoopers run their route. The office sees every route, customers, leads, texts, team, money and health.
- **Customer truck link:** arizonapetwaste.com/t/CODE. Live map, minutes away, gate photo. No app, no login.
- **Demo, no sign in:** arizonapetwaste.com/crew/?demo (500 made up yards) and arizonapetwaste.com/t/DEMO01.
- **Staff training page:** arizonapetwaste.com/staff-73d752e4/ (video and steps, not indexed, not linked).
- **Visit day protocol doc:** https://claude.ai/artifact/VG2yTne8FPhP4UDH7xrrck

## Where the code is
- GitHub `azpetwaste/website`, branch `main`. Cloudflare Pages deploys every push in about 80 seconds.
- Server `src/worker/worker.js`. Staff app `static/crew/index.html`. Truck link `static/t/index.html`. Tables `supabase/crm.sql`.
- Supabase project `arizonapetwaste`, id `iqfdplhcfwvrmndqaglj`.
- A second Claude chat does the website and AEO and pushes to the same branch. Always `git fetch origin main` and rebase before a push.

## How Joe wants the work done
- Do everything for him. Only hand him a task when you truly cannot do it. Atlas, his other agent, does sign ins, billing and secret keys.
- Direct answers. No dashes. Plain words. Customer copy at a third grade level.
- Design: SpaceX simple. Black, one orange accent, big type, few buttons. Phone first.
- Never call something tested until it has been run. Say what passed, what failed and what was not run.

## Hard rules
- Never type, paste or commit a key, token, password or sign in code.
- No texts or calls go out by code. Twilio is not approved. Texts wait in `messages` and a person sends them.
- No Stripe products, prices, webhooks or charges by hand.
- Google Maps only for the truck map.
- Keep the scooper's one time location OK on the first Start route.
- Do not loosen the money rules without asking Joe: 60 day minimum on the free month, one free month per home, pause rules.
- Do not invent the missed gate photo credit amount.

## State on Nov 9, 2026
Built and live:
- Schedule tab: seven day strip, the day's routes, tap a yard for one plain menu, and **Plan the week** (day and scooper for every yard).
- Yards per scooper per day: buttons for 20, 25, 30, 35, 40, saved in the `settings` table. Joe's range is 20 to 40.
- Plan the week makes town days (a Buckeye day, a Litchfield Park day) and never puts a scooper over the daily limit. A sign up only takes a day with room. Past the limit it waits for the office.
- Routes build themselves in the shortest driving order when the scooper opens the app.
- One tap texts: Send opens Messages with the text filled in and marks it sent.
- Truck link with a full screen map and a minutes away card.
- Crash log and Health tab.
- Stripe is in test mode. The public gets the "we call you" sign up. `/book/?test=1` turns on test checkout.
- Supabase sign in emails send through Resend. A real code email arrived on Nov 9.

Tests on the last commit: desk 64, ten sign ups 35, fifty sign ups 101, five hundred sign ups 116. All pass. Commands are in `CLAUDE.md`.
Later the same night the week planner changed (town days, truck start, teams of 3 and 4). Counts are now: week 74 (`build/week.test.mjs`), desk 68, ten sign ups 35, fifty 102, five hundred 117, one thousand 137. All pass.
Run again by the new Field App chat on Nov 9 at night, on a fresh clone: same counts, all pass. The demo was also walked at phone size (all tabs, Plan the week, a full stop with a gate photo, the truck link map). Details are at the bottom of `docs/HANDOFF.md`.

Not run yet:
- The real signed in staff app with real data.
- A test mode sign up by a person, start to finish.
- A real phone road test with a scooper driving.

## Open items
1. Staff test: someone signs in at /crew inside the Claude browser pane, then Claude runs a test yard through a route. A test customer "TEST Yard (delete me)" sits in the live database for this. Delete it after.
2. Test sign up at `/book/?test=1` with card 4242 4242 4242 4242.
3. Atlas: `RESEND_API_KEY`, `MAIL_FROM`, `NOTIFY_EMAIL` in Cloudflare Pages. Stripe live keys after the road test.
4. Truck start: type it once in Plan the week, "Where the truck starts each day" (saved in `settings`, no Cloudflare step). Joe said "208 East East View Way". That exact address was not found, so it is not set yet.
5. The `skips` column is not on the live database yet. Claude's database tool blocks this line (tried twice), so a person runs it in the Supabase SQL Editor: `alter table public.customers add column if not exists skips date[] not null default '{}';`
6. Twilio approval, then wire sending into `queueText`.
7. The training video shows the older Today screen. Re-record when the screens settle.

## Decided, do not reopen without Joe
- Location needs the crew app open and on screen. Joe chose to wait on background tracking until about 50 houses. Then: the Traccar Client app first, a real App Store app later.
- Joe wants to sell this tool to other companies later. It is single company today. Making it multi company is a database rebuild, planned for after launch.
- A scooper can send the customer texts from the route screen. Those come from the scooper's own number unless they carry the business phone, 623.309.6104.

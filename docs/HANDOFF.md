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

## Website and AEO: where things stand (Nov 9, 2026)

This lane is website edits and AEO (showing up in Google and in AI answers). It does not touch route code, the crew app or `crm.sql`.

### Live now
- 38 indexed pages. Sitemap, robots.txt (AI bots welcome) and llms.txt are current.
- Schema: WebSite, LocalBusiness (with office hours 8 to 5 every day), Service, FAQPage, BreadcrumbList, BlogPosting.
- Pages: home, 5 town pages, areas, how it works, pricing, FAQ, about, contact, our promise, commercial hub with 5 service pages and 4 town pages, blog, policies.
- Black Friday deal: first month free through Monday, November 30, 2026. The bar, deal panel and chips hide on their own at the deadline.
- Search Console on Nov 9: commercial pages and areas page are on Google. Indexing was requested for `/faq/` and `/blog/`. Not requested yet: `/about/`, `/contact/`, `/our-promise/`.

### Open
1. December 1: Joe decided the free month ends with the deal on November 30. The switch is not built yet, see the night note below.
2. About page: owner story is live. Photos, video and reviews are coming from Joe.
3. Schema `sameAs` and the footer social buttons wait on real profile links: Google Business Profile, Bing Places, Yelp, Apple Maps, BBB, Nextdoor, Facebook, Instagram. The footer buttons point at the home page reviews section until then.
4. Reviews: no review schema until real reviews exist. Never write a review.
5. The live truck link demo (`/t/DEMO01`) is not linked from the site yet. Link it from How it works once it looks good on a phone.
6. Request indexing for `/about/`, `/contact/`, `/our-promise/`.
7. Ideas not started: more blog posts for AI answers (cost, how often, turf smell, HOA rules by town), a page for each ZIP, a comparison page against the big chains using only facts from their own sites.

### Added Nov 9, 2026, evening (website and AEO chat)
- Three new blog posts, 41 indexed pages now: `/blog/how-often-to-pick-up-dog-poop/`, `/blog/dog-poop-laws-west-valley-az/`, `/blog/pooper-scooper-service-cost-arizona/`. All have FAQ schema and a sources list.
- The laws post only states what we could read in a city, county or state source. Where we found no rule (yard pickup schedule in Buckeye and in the county) it says so. The Goodyear code site itself (`goodyear.municipal.codes`) was not read, the city's Code Compliance page was.
- The cost post names Pet Butler ($11.99 a week for one dog) and POOP 911 Buckeye ($19.95 weekly, with a note mark), both from their own sites, checked Nov 2026. Recheck these numbers every few months or pull the two lines.
- Still open from the list above: 1, 2, 3, 4, 5 (the demo could not be tested on a phone from this chat) and 6 (Search Console needs Joe's sign in). Request indexing for the three new posts too.
- Not started: a turf smell post with its own sources, a page for each ZIP, the chain comparison page.

### Added Nov 9, 2026, night (website and AEO chat), on Joe's word
- **Dark look only.** The light look and the sun and moon button are gone (`THEME_BTN` is empty, `storedTheme` always returns dark, the build renders dark).
- **Licensed, Bonded, Insured badges.** The moving ticker on home and town pages is now a three badge strip (`TICKER` in `parts.py`, class `tb`). Commercial heroes have three badge chips (`bxbadges` in `biz.mjs`).
- **Less decoration.** No numbers on section labels, no grid lines behind the home and town heroes, softer glow.
- **About page.** Owner is Juan Gonzalez (Verrado, wife and six kids, grew up in California). Joe was unsure about saying Juan was once homeless, so the page only says things were not easy. `founder` is in the LocalBusiness schema and llms.txt.
- **Free month is a Black Friday deal only, ends November 30, 2026. Joe decided.** FAQ, pricing, terms lead and llms.txt now tie the free month to the deal. NOT done yet: the switch for December 1. About 60 lines and buttons still say free month ("Start your free month", town meta descriptions, book flow, terms section), and checkout in `worker.js` still gives every new sign up a free month. Needs Joe: what a new customer pays at sign up after the deal. Then build one `DEAL_ON` flag for copy and checkout, with the sign up tests.

- **Search Console, Nov 9 night:** indexing requested for `/about/`, `/contact/`, `/our-promise/`. Google's daily limit hit after that. Still to request: the three new blog posts.
- **Truck demo:** `/t/DEMO01` checked at phone size (map, arrival time, miles all show) and linked from How it works, step 4. The demo drive is set in Surprise, which is not a town we serve yet.

### Rules for this lane
- Copy: no dashes, short plain words, third grade for customers, seventh grade for SEO pages, one h1 per page. `npm run check` enforces it.
- Do not claim what we cannot prove. "No one in the industry offers this" stays off the site. The line in use is "The big chains give you one free cleanup or $25 off. We give you a whole month."
- Edit the generator in `design/generator` and content in `content/`, never the boards in `src/boards`. `export_site.py` writes to a path set at the top of the file (`OUT`): point it at this repo's `src/boards/` for the run, then put it back.
- Before every push: `npm run build`, `npm run check`, `node build/worker.test.mjs`, then `git fetch origin main` and rebase.

## Notes from the field desk session

### Nov 9, 2026, evening. The field desk session owns routes, the week planner and the crew app from here.
- **One flow for the week.** The Week tab is gone. The first tab is now **Schedule** (key is still `today` in the code). It has a strip of seven days to pick a day, the day's routes, and one button, **Plan the week**, that opens the planner (`officeWeek`, same `POST /api/office/week`). "Back to the schedule" returns. `S.plan` holds which of the two is showing.
- **Yards per scooper per day is a saved setting.** Chips for 20, 25, 30, 35, 40 in the planner, and Monday to Friday or Monday to Saturday. A tap saves it (`GET` and `POST /api/office/settings`, table `public.settings`, keys `stops_per_day` and `work_days`). `withSettings(env)` lays the saved values over `STOPS_PER_DAY` and `WORK_DAYS`, so `planDay`, `placeCustomer` and the planner all use them. The table is applied to the live database.
- **Schedule tab rows.** Each route folds open. Tap a yard for one menu in plain words: see what the customer sees, copy the customer's link, open customer details, skip this visit, put this visit back, move earlier, move later, give this yard to another scooper. The old Link, Skip, Undo, arrow and Move controls are gone.
- **Texts are one tap.** Send opens Messages with the text filled in and marks it sent. The scooper gets the same Send bar at the top of the route screen (one at a time, "Send 1 of 3").
- **The route builds itself.** `crewToday` runs `planDay` when the scooper has no route yet today.
- **Demo.** `/crew/?demo` has 500 made up yards and three scoopers. `/t/DEMO01` is a made up visit that loops.
- **Crash log and Health tab.** Table `errors`, `POST /api/log`, `GET /api/office/health`.
- **Staff training page.** `/staff-73d752e4/`, not indexed, not linked. The video still shows the older Today screen.
- **Money rules were not touched.**
- Tests on this commit: desk 64, signup10 35, signup50 101, signup50 at COUNT=500 116. All pass.
- Still not run: the real signed in crew app with real data, and a real phone road test.
- A test customer "TEST Yard (delete me)" is in the live database, tied to the info@ login. Delete it after the staff test.

### Nov 9, 2026, night. A new chat owns the Field App now (project "APW (Field Tool/App)").
The chat that built the field desk has stopped. This chat picked it up from `docs/FIELD_APP.md`. No code changed in this pass.
- Tests run again on a fresh clone at `ae16f9b`: build and `npm run check` pass, `worker.test.mjs` exits clean, desk 64, signup10 35, signup50 101, signup50 at COUNT=500 116. All pass.
- Live checks at phone size (375 wide) in the demo: `/api/health` says live and desk are on. All eight tabs in `/crew/?demo` load with no errors and no sideways scroll. Plan the week ran at 20 a day (6 scoopers, biggest day 20) and 40 a day (3 scoopers, biggest day 38). The scooper flow ran: Start route, Arrived, checklist, gate photo (a 3000 wide photo shrank to 1600), Done, next yard loaded with its text prompt. `/t/DEMO01` drew the Google map, the road line, the truck and the house.
- Live database, read only: 1 customer ("TEST Yard (delete me)"), 1 staff row, 0 rows in `errors`, `settings` is empty (so the limit is the default 30 a day), and `customers.skips` is still missing.
- The `skips` line was tried again and the tool blocked it again as a production change. It still needs a person: Supabase, SQL Editor, run the one line in `docs/FIELD_APP.md` item 5.
- Still not run: the signed in staff test (needs a person to sign in at `/crew` in the Claude browser pane), the test sign up at `/book/?test=1` (the page loads, the rest needs a person for the code and the card), and the phone road test.
- Small things seen, not changed: the Money tab phone links and the Leads status chips are under 36 px tall on a phone. "No photo" and other confirms use the browser's own confirm box.

### Nov 9, 2026, late night. Week planner now makes town days, and sign ups cannot overload a day.
Joe asked for this: "if you have 20 houses in Buckeye, today is a Buckeye day", best routes for gas, and never overload a scooper.
- **Town days.** `weekPlan` used to deal a scooper's yards into even days. With 20 Buckeye yards and 10 Litchfield Park yards it put all 30 on Monday, 53 road miles. Now it cuts the days at the long hops between towns: a Litchfield Park day and a Buckeye day, 39 miles. Each cell in Plan the week shows the towns for that day (`slots[].towns`).
- **How it picks.** For each scooper it tries every number of days from the fewest that fit up to all work days, and keeps the cheapest. An extra day must save more than `DAY_COST` (6 road miles). A day needs `DAY_MIN` (5) yards. Twice a week yards get a second pass that moves them to the two days whose yards are closest. If the cut cannot fit everyone it falls back to the old even deal.
- **Miles on the mixed sample at 30 a day:** 250 yards 308 to 279, 500 yards 437 to 400, 1,000 yards 689 to 604. Same scooper counts. No day over the limit in any run.
- **Sign ups cannot overfill the area day.** `placeCustomer` used to drop a sign up on the area's day with no limit check when no close day had room. Now the area day is used only while it has room. Past that the yard waits in "New sign ups with no day yet" and gets no day email until the office picks.
- **Known gap:** two sign ups in the same instant both see the day before either is saved, so a day can pass the limit by those. Closing that needs a database lock, which is a `crm.sql` change a person has to run. The Schedule tab now flags it: a route with more stops than the limit shows "Over the limit of N" (`officeDay` returns `cap`).
- **New test file:** `node build/week.test.mjs`, 47 checks, no database. Run it with the others before a push.
- `signup50.test.mjs` changed: "all N got a service day" is now "all got a day" up to 120 sign ups, and "sign ups past the limit wait for the office" above that.
- Not run: these planner changes on real signed in data. The live database has one test yard.

### Nov 9, 2026, 7 pm. Truck start, more than one scooper, same instant sign ups, logo.
- **Truck start is a saved setting now.** Plan the week has "Where the truck starts each day". The office types the address, the server finds the pin (Census lookup) and saves `route_start` and `route_start_label` in `settings`. It wins over the Cloudflare `ROUTE_START`. Day routes start there, and the week plan counts the drive out and the drive home in each day's miles. Joe said the start is "208 East East View Way". That exact address was not found. Eastview Way is in Buckeye 85396 (Verrado) with numbers like 20800 W. The start is NOT set yet. Joe or the office types it once in Plan the week.
- **Town days beat one mixed day.** New `MIX_COST` (8 road miles): a day that mixes two towns has to save that much to be picked over town days.
- **Same instant sign ups are closed in code.** `placeCustomer` looks again after it saves the day. If the day is over the limit it takes the yard back off and the yard waits for the office. The 50 at once test now holds every day at 30 or under. No database change was needed.
- **More than one scooper is tested.** `week.test.mjs` plans 250 to 500 yards for teams of 3 and 4: even work, each scooper in one part of town, one route a scooper a day, no day over 30. With 40 yards and 3 on the team only the first scooper (Juan) is used. With 400 yards and only Juan the plan opens extra routes and says to hire.
- **Demo:** giving a yard to someone with no route that day now makes the route (the real server already did).
- **Crew header shows the logo** in place of "APW", and the sign in screen shows it too. Phone links, the lead status picker and chips are at least 40 px tall.
- Tests: week 74, desk 68, signup10 35, signup50 102, at 500 117, at 1,000 137. All pass.
- Still open: the `skips` line, the signed in staff test, the test sign up, the phone road test, real road miles (today straight line times 1.35; the Routes API would cost money per plan, ask Joe), and the browser confirm boxes.

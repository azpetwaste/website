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

### Black Friday sale switch (Nov 9, 2026, late). Read before you write any offer copy.
- Joe's rule: the free month is the **Black Friday sale only**, through November 30, 2026. From midnight Phoenix time on December 1 the offer is **"Your first cleanup is free. Book now."**
- How it works: copy that changes is written as `[[bf:sale text||after sale text]]` in the generator, in `content/` and in `build/build.mjs`. `bfx()` at the top of `build.mjs` fills every file the build writes. The date is `DEAL_END`. Test either side with `DEAL_ON=1 npm run build` or `DEAL_ON=0 npm run build`. Both pass `npm run check`.
- The flip needs a fresh build after midnight. Two things push one: `.github/workflows/sale-switch.yml` (empty commit at 07:03 and 07:33 UTC on December 1) and a scheduled Claude task for the same night. If neither runs, push any commit on December 1.
- New copy that mentions the free month must use the tag. Never write "first month free" as plain text.
- **NOT switched yet: the sign up flow and checkout.** `book.prod.tpl.html`, `account.prod.tpl.html` and checkout in `worker.js` still give and describe a free month with no end date. Joe is choosing how billing works after the sale (see the options sent to him Nov 9). Build that before November 30, with the sign up tests.
- Terms now say "Black Friday free month" and read true before and after the sale.

### Nov 9, 2026, late night: competitor research and new pages (website and AEO chat)
- Joe chose **monthly billing on the 1st** to stay. Still open: what a new customer pays at sign up after the sale (see the sale switch note). Sign up flow and checkout still give a free month.
- **Sign up step 1 is a city pick now** (Joe asked): tap Buckeye, Verrado, Goodyear, Litchfield Park or Citrus Park and it goes to the next step. No ZIP box, no links to town pages. Buckeye and Goodyear have two ZIP codes, so the address step asks which one (the server needs the right ZIP for the map pin). "My city is not here" opens the waitlist with a city field. `?zip=` links still work.
- **New pages (45 indexed now):** `/one-time-dog-poop-cleanup/`, `/turf-odor-treatment/`, `/same-day-dog-poop-pickup/`, `/blog/how-to-choose-a-pooper-scooper-service/`. Pricing links to the three service pages.
- **What the research showed (DataForSEO, Nov 9):**
  - Google for "pooper scooper service goodyear az" and "dog poop pickup service buckeye az": the map pack wins. In it: Doggie Doodie Services (4.9, 31 reviews), Elite Pooper Scoopers (5.0, 188), Poopy Doo (4.8, 161), The Poop Fairy (5.0, 86). Under the map it is Facebook groups, MapQuest, Yelp, Nextdoor and a few small sites (cleanpaw.com, dawgpoopremoval.com, gotpoopaz.com, doodycalls.com). No strong local site owns these searches.
  - ChatGPT and Perplexity with web search, asked for the best service in Goodyear, Buckeye, Litchfield Park and Verrado: neither named Arizona Pet Waste. They named Dawg Poop Removal, Scoop Soldiers, Pawpaw G's, Number 2 Club, Dog Gone Duty, Arrowhead Pooper Scoopers, POOP 911, K9 Poop Busters, West Valley Pooper Scoopers. Their sources: company city pages, pricing pages, BBB, Yelp, Yellow Pages, PetWorks, BringFido, pooper-scooper.com directory, Facebook groups.
  - So the two biggest levers are off the site: a Google Business Profile with real reviews, and listings on BBB, Yelp, Yellow Pages, MapQuest, Nextdoor, PetWorks, BringFido and the pooper-scooper.com directory. Joe is doing the profiles. When he sends links, fill `sameAs` and the footer.
- Not built: neighborhood pages (Estrella, PebbleCreek, Palm Valley, Tartesso, Sundance), the chain comparison page, a page for each ZIP.

### Home page pass with Joe, Nov 9, 2026, 8:30 pm
- **H1 is now the search phrase:** "Dog Poop Pickup Service in Buckeye, Goodyear and Litchfield Park, AZ". "Dog poop pickup you can watch" moved to the small line above it.
- **H2s:** "Dog poop pickup prices", "How our dog poop pickup works", "No photo? That visit is free", "Areas we serve in the West Valley, AZ".
- **Photo promise is the headline promise** (Joe wants it like the old pizza delivery promise): an orange band under the badges on the home page, the proof section heading, step 6 of how it works and the footer. It only holds if the crew app always gets the gate photo, so the Field App chat must keep that tested.
- **How it works** is six plain numbered steps. No clock times, no mini map, no report card.
- **Yard game and the promise receipt are off the home page** and saved: see `design/archive/README.md`. The promise is one line under the prices with a link to `/our-promise/`.
- **Footer:** big Licensed, Bonded, Insured boxes and an orange "Family owned and operated" bar on every page. Social names (Facebook, Instagram, TikTok, YouTube, Nextdoor, Google, Yelp) show as plain labels, not links, until Joe sends the links. Put real links in `src/site.config.json` `social` and they become links. Chamber, BBB and Yelp badges wait on Joe.

### Footer rebuild, Nov 9, 2026, 9 pm (Joe: "the footer makes the website")
- Modeled on a footer Joe likes: three columns (logo and contact with hours and web address, quick links, payment options), then a seal row.
- Seals are solid orange shields with a check for Licensed, Bonded, Insured. No boxes. "Family owned and operated" is plain bold text with a small house icon, so it does not look like a button. The old tagline "You always know. Or you don't pay." is gone.
- Payment options: all major credit cards, Apple Pay and Google Pay. No cash, Venmo or Cash App (Joe's rule). Apple Pay and Google Pay must be on in Stripe for this to be true.
- **Logos:** Joe wants real brand logos in color for Facebook, Instagram, TikTok and Nextdoor (Yelp later), plus card marks. They are slots filled from files in `static/assets/img/brands/` (see the README there). Use the official files only, never redraw one. Nothing shows until the files are in.
- Not on the site and why: HSA and FSA (this is not a health service), LegitScript, BBB and Trustpilot (wait for the real listings).

### Bonded and insured, Nov 10, 2026. Read before you write any trust copy.
- **Do not say "licensed."** Joe confirmed Nov 10 the business license is still in progress. Every "Licensed, bonded and insured" on the site is now "Bonded and insured". Put "licensed" back only when Joe sends the license.
- **Facts from the documents Joe sent (bond papers and insurance card):**
  - Bond: business service bond, $50,000, American Contractors Indemnity Company (Tokio Marine HCC), November 9, 2026 to November 9, 2027. It pays a customer back for theft or fraud by the company or an employee, and it needs a conviction.
  - Insurance: general liability $1,000,000 / $2,000,000, broadened property damage $10,000 / $25,000, Certain Underwriters at Lloyd's, London, through Pet Care Insurance, November 16, 2026 to November 16, 2027.
- **Insurance is not in force until November 16.** Copy that depends on it uses `[[ins:before||after]]` (same idea as the sale tag, `INS_START` in `build.mjs`, test with `INS_WAIT=1` or `0`). The GitHub job pushes a rebuild that morning.
- **Never publish the bond number, the insurance certificate number, or the documents.** They are not in the repo on purpose. The site shows who backs us, amounts and dates, and says to ask for the certificate.
- Joe had the "starts Nov 16" note taken off the footer seal (Nov 10): no customers are served before that day. The proof page still shows the exact dates and the FAQ answers still carry the note until the 16th.
- **Background checks (Joe, Nov 10):** the site now says every team member must pass a background check before working in a yard (footer seal, home strip, FAQ, promise, proof page, llms.txt). Joe has to make this true before the first visit and keep a record for each hire.
- **Card marks:** the plain name tiles are gone (Joe did not like them). Payment marks only show when official logo files are in `static/assets/img/brands/`. Joe sent an Adobe Stock preview link as the look he wants. Do not hotlink or copy that preview: it needs a license or the official brand files.
- New page `/bonded-and-insured/` (46 indexed pages). The footer seals (Bonded, $50,000 bond. Insured, $1,000,000 liability) link to it. Home strip is Bonded, Insured, Family owned.

### Google Tag Manager, Nov 10, 2026
- Joe asked for Google Tag Manager `GTM-T8GX2H6D` for Google Ads. It is in `build/build.mjs` (`GTM_ID`, `gtmHead`, `gtmBody`): Google's standard container script high in the head and the noscript frame right after the body tag, on every built page except My Yard (`/account/`). The crew app, truck links and staff page do not load it.
- The privacy policy used to say "No ad trackers." It now says we use Google Tag Manager and Google Ads, what Google gets, and how to opt out. Keep the policy true if more tags are added in the container (for example remarketing or a Meta pixel).
- Never push a name, address, gate code or card detail into `dataLayer`. Sign up conversion events are not wired yet: the container only sees page views until an event is added on the sign up done step.

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

### Nov 9, 2026, 7:30 pm. Photo step, pop up, planner steps, security pass.
- "No photo" asks in our own sheet now (`sheetAsk`). No browser pop up is left in the crew app or the truck link.
- Gate photo: a picture the phone cannot open now shows "That photo did not open. Take it again." The camera field is cleared after each shot so Retake always fires.
- Plan the week has four plain steps at the top.
- Security pass, all read only on the live site: 30 staff, office and customer addresses refuse a visitor with no sign in. Every table has row security on with no public policy. The gate photo bucket is private and photo links last 2 hours. Truck link codes are 6 characters from 30 (729 million) and stop working 2 hours after the visit. A scooper can only touch stops on their own route today. The staff code form gives the same answer for any email. The crash log takes 60 rows an hour at most. No keys in the repo.
- Not done, needs Joe: real road miles (Google Routes API on every plan costs money, and saving the number needs a new column a person has to add), and the `skips` column.

### Nov 9, 2026, 8 pm. Plan the week has a map.
- Under the table there is a Google map. Whole week: every yard is a dot colored by its day. Tap a box in the table: that one day, numbered in driving order with the road line, and the list of yards under it. "Show the whole week" goes back. Works in `/crew/?demo` and in the real planner.
- The plan answer now carries `slots[].pts` ([lat, lng, words] in driving order), `mapsKey` (the browser Maps key the truck link already uses) and `start`.
- The demo planner opens at 100 sample yards. Joe asked for 100 test yards. No fake yards were put in the live database. The demo covers it.

### Nov 9, 2026, 8:30 pm. The route is one flow now, and the scooper sees a map.
Joe ran the demo and could not tell how to get to the next yard after Arrived.
- **The gate photo is the last tap.** Arrived, tap each box, Take gate photo. When the photo saves, the yard is marked done and the next yard opens on its own (`photoDone`). The old extra Done tap is gone. "Done, next yard" only shows if a photo is already saved and the finish did not go through. A line under the checklist says what to do.
- **Demo:** Take gate photo uses a sample photo, since a computer has no camera, then moves on the same way.
- **Route map for the scooper.** "Ready to roll" shows a Google map with every yard numbered in driving order (`routeMap`, `crewToday` now sends `mapsKey`).
- Maps are built once and kept across screen refreshes (`keepMap`), so a refresh does not load a new map.
- Every browser pop up is gone from the crew app: sign out, the one time location OK, lead note, new lead and the copy link fallback all use our own sheets (`sheetAsk`, `sheetForm`). The location OK step itself is unchanged.

### Nov 9, 2026, 9 pm. Move a group of yards to another day.
Joe asked for one button to take, say, 10 of Juan's 30 Monday yards and send them to Tuesday.
- **Schedule tab, open a route, "Move yards to another day".** Tap yards, or use Last 5, Last 10, Last 20, All. Then "Move N yards to another day" opens a sheet with the next days. Each day shows how many yards it has now and after the move, red if that passes the limit. Choose "Just this visit" or "Every week from now on".
- Server: `POST /api/office/move-day` (`{ ids, to, forever }`) and `GET /api/office/loads?from=&staff=` (yards on each of the next 7 days for one scooper). Office only.
- How a move is stored: the old stop stays on its day as `skipped` with the note "Moved to Tuesday" (shows a Moved tag), so the day builder does not put the yard back. A new stop is made on the new day with a new link, and that route is put back in driving order (`reorderRoute`). "Every week" also changes `service_day` (or `service_day2`), drops later built visits, and emails the new day.
- A stop's identity column cannot be written, so position updates upsert on (day, customer_id).
- `crewToday` now tops up any route that has not started, not only a missing one. A day the office built early still picks up late sign ups.
- Cancel and the week rebuild now clear future `skipped` stops too, so no Moved markers are left behind.
- Demo supports all of it. Other days in the demo start empty.
- Tests: desk is now 80 (13 new for the group move).

### Nov 9, 2026, 9:30 pm. Every move shows what it costs. New yards slot into the driving order.
Joe: "our brain on this app needs to always be optimizing routes." A move must ask "are you sure, this adds X".
- **Move yards sheet.** Each day now shows the extra miles and drive minutes the picked yards would add (`loads` takes `ids`, returns `addMiles`, `addMinutes`, `saves` for the day they leave, and `best`). The day that adds the least and stays under the limit is tagged Best fit. After a day is picked an "Are you sure?" box says: yards added, miles and minutes added, the new count, over the limit or not, how much shorter the old day gets, and a better day if there is one. The button reads "Yes, move to ...".
- Minutes are driving only, at 25 mph on straight line miles times 1.35. Time in the yard is not counted. Joe has not given a minutes per yard number.
- **New customers.** A sign up still just gets added. When the day builder adds a yard to a route that already has yards and has not started, the whole waiting route is put back in the best order (`reorderRoute` from `planDay`), so the new yard is not tacked on the end. A yard with an office set stop order keeps it and goes first. A live route is left alone.
- Tests: desk 82, signup10 38 (3 new for the late yard: 31.9 miles in order against 41.5 tacked on the end).

### Nov 9, 2026, 10 pm. Time rules, the photo cannot be lost, video on the sign in screen.
- **Joe's time rules:** 30 mph on neighborhood roads, 10 minutes in a yard, 20 minutes for a first service (`MPH`, `YARD_MIN`, `FIRST_MIN` in the worker). The move sheet shows total time added (driving plus yard time, first visits counted at 20). Plan the week shows time for each day. The truck link fallback arrival time uses 30 mph too.
- **No gate photo means the visit is free.** Joe: we do not charge it, the refund is $22 to $25 depending on the plan. It is done by hand by the office. No code refunds anyone. Do not hard code an amount.
- **The photo is the one thing that must work.** Joe wants one photo for now, not two.
  - Phone: the picture is kept on the phone (`localStorage` key `apw_photo_wait`) until the server confirms it. Three tries on its own. If it still fails the picture stays on screen with a red "Photo not sent" box and "Send photo again". It survives a reload. Only when it is saved does the yard finish.
  - Server (`crewPhoto`): saves, tries once more if the save fails, then proves the file is in storage by asking for a signed link. Only then is `photo_path` set. If not, it answers 502 and writes a row in the crash log.
  - Test hook: `/crew/?demo&photofail=4` makes the first 4 photo saves fail.
  - Live storage on Nov 9: bucket `gate-photos` is private, 3 MB limit, jpeg, png and webp only. It holds 0 files. No real photo has ever been uploaded on the live site. The first real proof is the signed in staff test.
- **Video before sign in.** The `/crew` sign in screen has "Watch how it works, 2 minutes" (`static/crew/how-it-works.mp4`, narrated with a computer voice, built from live demo screens).
- The open sample week address keeps each answer in memory, so it cannot be used to make the server plan 1,000 yards over and over.
- Tests: desk 92 (10 new for the photo).
- The narrated video was rebuilt (2 min 15 s) with the "Are you sure?" screen and the photo safety screen. The same file is on the crew sign in screen (`static/crew/how-it-works.mp4`) and on the staff training page (`training.mp4`, now phone shaped). The old training video with the old screens is gone. The written steps on the training page were updated for the photo as the last tap.
- Security pass on Nov 9 at night, live site, no sign in: every new address (`loads`, `move-day`, `settings`, `photo`, `done`, `team`) answers 401. A made up token answers 401. Odd input in link codes and filters answers 404 or 401. A bad Stripe signature answers 400. Package audit is clean, no keys in the repo. For Atlas: turn on the Turnstile bot check for sign in codes, set the Supabase email code to expire in 10 minutes, and add a Cloudflare rate limit on `/api/*`.

### Nov 9, 2026, 10:30 pm. Upload a photo, time stamps, a brake on guessing.
- **Upload a photo.** Backup for when the in app camera or the app itself does not work. The scooper's yard screen has "Or upload a photo from this phone" under Take gate photo. The office has "Upload a gate photo" in the yard menu on the Schedule tab, for visits from the last 14 days (`POST /api/office/photo`). An office upload on a visit that was never tapped done finishes it at the photo's time.
- **Every photo is time stamped.** The time is burned into the picture (Arizona time, bottom strip) and saved in the file name (`-t<seconds>`, plus `m` when a person typed it), so no table change was needed (`photoWhen`, `photoTime`). In app camera: the time is now, set by the app. Upload: a sheet asks "What time was this photo taken?", filled in from the time saved in the photo file. The person can change it.
- **Honest by design (Joe: "we're all about transparency").** A typed time is marked. The picture says "(time entered by staff)", the truck link says "Our scooper typed this time in by hand", and the office sees `timeTyped`. A time in the future or from another day is not believed: the server clock is used.
- The server now checks the first bytes of the file, so a file only labeled as a picture is refused.
- **Brake on guessing (`hitLimit`).** Per visitor address, in memory: 8 code requests and 10 code tries per 10 minutes, 120 truck link lookups a minute, 400 requests a minute over all. It is a first line. Atlas still needs the Cloudflare rate limit rule, the Turnstile bot check and a 10 minute code life in Supabase.
- Tests: desk 107.
- The training video was rebuilt again (2 min 33 s) with the upload, time stamp and photo safety screens, and pushed to both places. The narration is in `docs/video/lines.json`. Joe's rule is in `CLAUDE.md`: rebuild the video with every change a scooper or the office can see.
- A photo kept on the phone from another day is dropped, and the demo starts with none kept.

### Nov 10, 2026, 11 am. Book, Call, Text bar, simpler town pages, CTA pass (website and AEO chat), on Joe's word
- **One bottom bar on every public page** (`DOCK` and `DOCK_CSS` in `build/build.mjs`). Phones and tablets, there from the first paint: Book now (with the sale line under it, on the sale tag), Call, Text, and the number. Hidden while the sign up sheet is open, on `/book/` and `/account/`, and on computers (the header has Book now). The old scroll in bar is gone (`SBAR` in `parts.py` is empty).
- **Hero button** on home and town pages reads "Get the Black Friday deal" during the sale and "Book now" after. The round sale sticker on the button is gone.
- **Town pages are short now** (Buckeye went from about 18,000 to 7,000 pixels on a phone). Order: hero, "We cover all of TOWN" with the map, prices, questions, then "More about TOWN" where the why, what a visit includes, neighborhoods and local guide sections sit folded shut (`details.fold`). The words are all still in the page for Google and AI. The neighborhood list under the map is folded too.
- **No dashed lines.** ZIP outlines on the map are thin solid lines, the key reads "We scoop every home in the orange area. Every street.", the town chips and the "we set your day by route" chip are off the town pages. Joe did not like the dashed line key.
- **Google review slot.** `reviews` and `googleProfile` in `src/site.config.json`. When a real review is typed in (name, town, stars, text, link to it on Google) a star row shows under the hero button on home and town pages. It is empty today, so nothing shows. Joe asked for a 5 star review up front before one exists. Not done: the rule above stands, never write a review, and a made up Google review breaks Google's and the FTC's rules. Joe plans to sign up and leave a real one. He builds the site, so if he has a stake in the company his own review needs to say so or come off.
- Joe gave his home street as an example of the area we cover. Do not put it on the site.

### Nov 10, 2026, 11:30 am. Joe looked at it: bar on town pages only, and a pass on tight boxes
- **The bottom bar is on the town pages only now** (`dockOn` in `build/build.mjs`: routes under `/pooper-scooper/`). Joe did not like it on the rest of the site. It is three plain buttons, Book now, Call, Text. No small print in it.
- **Home page on a phone:** the Book button sits right under the H1, above the yard scene, so it shows on first load on every phone size (checked 320 to 430 wide).
- **Tight boxes fixed** (Joe: words too close to the inside of the box): plan choices on a phone are three full width rows (name, per visit, price), the sale clock no longer runs out of its box at 320 wide, more room in the specs grid, the sale chip in sign up, and the town price table header.
- No dashed borders left in the sign up flow or the coming soon box. Map key reads "We scoop every home inside the orange lines."
- Phone sizes checked with no sideways scroll: 320, 360, 375, 390, 412, 430 wide, on home, a town page, the areas page and sign up.

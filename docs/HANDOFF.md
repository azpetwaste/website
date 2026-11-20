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
- First month free has a 60 day minimum. Cancel in the first 60 days: charged one month at plan price (all lines, extra dogs too), minus what was paid. The date shows at checkout. **Off since Nov 16, 2026 (the 9:45 pm note at the end): nobody is charged for canceling early, and no page says the rule.**
- One free month per home: checkout refuses a home address or phone that already had a plan (`sameHome`).
- Back from a pause: nothing is charged, and the next bill is the next bill day. The part month charge (`resumeCharge`) was taken out on Nov 16, 2026 with Joe's "no part month charges anywhere". This opens a hole that needs his call, see the Nov 16, 11 pm note at the end.
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
- Joe chose **monthly billing on the 1st** to stay. (Changed Nov 16, 2026: every customer has their own bill day, see the 11 pm note at the end.) Still open: what a new customer pays at sign up after the sale (see the sale switch note). Sign up flow and checkout still give a free month.
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
- **The insurance is in force (Joe, Nov 16, 2026).** The claim is in the present tense with no start date: "Insured and bonded." The `[[ins:before||after]]` tag, `INS_START` and `INS_WAIT` are retired and no file uses the tag. See the Nov 16 note at the end of this file.
- **Never publish the bond number, the insurance certificate number, or the documents.** They are not in the repo on purpose. The site shows who backs us, amounts and dates, and says to ask for the certificate.
- Joe had the "starts Nov 16" note taken off the footer seal (Nov 10): no customers are served before that day. The proof page still shows the exact dates and the FAQ answers still carry the note until the 16th.
- **Background checks (Joe, Nov 10):** the site now says every team member must pass a background check before working in a yard (footer seal, home strip, FAQ, promise, proof page, llms.txt). Joe has to make this true before the first visit and keep a record for each hire.
- **Card marks:** the plain name tiles are gone (Joe did not like them). Payment marks only show when official logo files are in `static/assets/img/brands/`. Joe sent an Adobe Stock preview link as the look he wants. Do not hotlink or copy that preview: it needs a license or the official brand files.
- New page `/bonded-and-insured/` (46 indexed pages). The footer seals (Bonded, $50,000 bond. Insured, $1,000,000 liability) link to it. Home strip is Bonded, Insured, Family owned.

### Google Tag Manager, Nov 10, 2026
- Joe asked for Google Tag Manager `GTM-T8GX2H6D` for Google Ads. It is in `build/build.mjs` (`GTM_ID`, `gtmHead`, `gtmBody`): Google's standard container script high in the head and the noscript frame right after the body tag, on every built page except My Yard (`/account/`). The crew app, truck links and staff page do not load it.
- The privacy policy used to say "No ad trackers." It now says we use Google Tag Manager and Google Ads, what Google gets, and how to opt out. Keep the policy true if more tags are added in the container (for example remarketing or a Meta pixel).
- Never push a name, address, gate code or card detail into `dataLayer`. Sign up conversion events are not wired yet: the container only sees page views until an event is added on the sign up done step.
- Nov 16, 2026 (Joe): ONE container now, `GTM-KPDVN8FQ`, the one his Google Analytics made (its live code carries GA4 `G-E2N3R204ZH`). `GTM-T8GX2H6D` is off the site for good. The install code is Google's current one, exactly as Joe sent it (one async `gtm.js` script and `gtag('js', new Date())`, no noscript part), in `gtmHead` in `build/build.mjs`. `npm run check` fails a public page that loads it other than once, loads any other container or a `gtag/js` Google tag, or a My Yard page that loads it. Google Ads goes inside that container, never on the page.
- Events (Nov 16, 2026): `APW.track(step, data)` in `src/runtime/apw.js` pushes them to `dataLayer` and the Meta Pixel. Never a name, email, phone, address or gate code. dataLayer events: `begin_checkout` (city picked on sign up), `add_payment_info` (card step opened), `sign_up` (booked: `value` = month price, `currency` USD, `plan`, `dogs`, `event_id` `bk_<card form id>`), `generate_lead` (`lead_type` waitlist or request), `contact` (`method` phone or text, any tel: or sms: tap). Each has `event_id` and `apw_step`. GTM needs a trigger per event for GA4 and Google Ads. `sign_up` is the booking conversion.
- Meta (Nov 16, 2026): pixel `1982997959354953` ("metaPixel" in `src/site.config.json`) loads on the same pages as GTM. Events: PageView, InitiateCheckout, AddPaymentInfo, StartTrial (the booking, worth the month price), Lead, Contact. The server sends StartTrial (from `booked`, once per sign up) and Lead (waitlist, request) to Meta's Conversions API with the same `event_id`, so Meta counts each once. It is off until `META_CAPI_TOKEN` is in Cloudflare (Evie is adding it). `META_TEST_CODE` sends to Events Manager's Test events tab. Meta gets a SHA 256 email, city, state, ZIP and customer id, the IP and browser line, and `_fbp` and `_fbc`. Never the phone (the text terms promise that), the name or the street. `/api/checkout` keeps `ad_fbp`, `ad_fbc`, `ad_ip`, `ad_ua` in the card form metadata only while Meta is on. The privacy policy names Meta through `[[meta:..||..]]`, which shows only while "metaPixel" is set. In Events Manager keep automatic advanced matching off for phone.
- The container (set up Nov 16, 2026, version 2, published by info@arizonapetwaste.com). It is edited inside Google Analytics: Admin, Data streams, My Website, Configure tag settings (the Google account is info@arizonapetwaste.com, not the OMG login). Tags: the Google tag `G-E2N3R204ZH` (Initialization, all pages) and `GA4 site events` (GA4 Event, event name `{{Event}}`, parameters value, currency USD, plan, dogs, lead_type, method from `DLV` data layer variables), fired by the custom event trigger `Site events (sign up, leads, contact)`, regex `^(begin_checkout|add_payment_info|sign_up|generate_lead|contact)$`. User provided data: automatic detection keeps email only (phone and name and address are off, the privacy policy promises Google never gets them). Checked live on Nov 16: a city tap on /book/ sent GA4 `begin_checkout` with value 108 and Meta `InitiateCheckout` with the same event id. Still to do once the first real ones arrive: star `sign_up` and `generate_lead` as key events in GA4 (Admin, Events), then import `sign_up` into Google Ads as the booking conversion. Meta Events Manager: automatic website matching is off, keep it off (it would send phone numbers); do not press Conversions API with Meta "Connect now", our server already sends those events.

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
- **Hero button** on home and town pages reads "Get the Black Friday deal" during the sale and "Book now" after. The round sale sticker on the button is gone. (Since November 19, 2026 it reads "Start your free month" during the sale. See that day.)
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

### Nov 10, 2026, 3 pm. Simple pass on the whole Field App (Joe: "simplicity is more", a high school graduate must know what to do)
- **Every yard is three steps, shown at the top: 1 Drive, 2 Scoop, 3 Photo.** One line under it says what to do now. "Stop 1 / 33" is "Yard 1 of 30".
- **New words on the route screen.** Navigate is Directions. Arrived is I'm here. Can't service is I can't do this yard (tag reads Not done). Gate is Gate code, Spots is Watch for, Office is From the office. End route is End my route. Checklist box 3 is "Closed and latched the gate".
- **Photo step has one big button.** "No photo" is no longer a link next to it. "Photo trouble?" opens a sheet: upload first, "I have no photo at all" last. The no photo check now makes "Go back and take the photo" the orange button (`sheetAsk` has a `safe` flag). The rule is the same: no photo still means the visit is free and is flagged `no_photo`.
- **After I'm here the screen scrolls to the gate code and the boxes.** Before, the sticky button hid two of the three boxes on a phone.
- **Old on the way texts drop off.** When a yard is done or can not be done, a queued on the way text for that yard is marked `skipped` (`dropOnWayText`). The scooper used to be asked to text the last customer "on the way" while standing at the next yard. The orange bar reads "Tell Alex the yard is done · Send text".
- **Schedule tab.** Yards still to do carry no tag (every row used to say Scheduled). Planned is Not started, Live is On the road, Here is At the yard. "Add missing yards" is "Add new sign ups to this day". The route header wraps on a phone, it ran off the side when a truck was live.
- **Yard menu is in groups:** Customer, Gate photo, This visit, Give this yard to (names as chips).
- **Sign in.** One plain line says how it works, the button is "Email me a code". Fixed: the sign in screen had no side padding on a phone (`.signin` wiped out the `.narrow` padding).
- **Demo** has 30 yards a route, so it no longer opens with three red "Over the limit" tags.
- Texts tab intro and "Add a lead" are in plain words. No money rule, route rule or photo safety rule changed.
- **Training page steps and the video were rebuilt** (2 min 41 s) with the new words. Ten clips are frames kept from the last video (planner, maps, move sheet, truck link, title cards). Eight are new screenshots from a local build. The route map on "The scooper's route" clip is the map picture from the last video set into the new screen, because the build machine can not reach Google Maps. Done Nov 10, 5 pm: that map is now a capture of the live demo map for the 30 yard route, and the video was pushed again.
- Tests: build and check pass, worker test clean, week 76, desk 108 (one check rewritten for the dropped text, one added), signup10 38, signup50 102, at 500 117, at 1,000 137. All pass.
- Walked at phone size (375 by 812) in a headless Chrome on a local build: sign in, Schedule, open route, yard menu, Texts, Leads, My route, Start, I can't do this yard, I'm here, boxes, Photo trouble, no photo check, photo, next yard, and the photo fail path with `photofail=4`. No page errors, no sideways scroll.
- Not run: the live site with this code, a real phone, the signed in app with real data.

### Nov 12, 2026, 9 am. No pound sign in the address bar (website and AEO chat), on Joe's word
- Joe saw `#` in the address bar after tapping links and wants clean URLs only. `src/runtime/apw.js`: a jump link (`#proof`, the policy contents lists, Skip to content, `/commercial-pet-waste-removal/#businesses`) still scrolls to its spot, but the `#` is never left in the URL (`cleanUrl`, `jumpTo`, `landed`). A link that lands on a page with a `#` scrolls, then drops it. `/#start` still opens sign up, then drops it.
- A `#` that is not a spot on the page is left alone (sign in tokens). The truck link and the crew app were not touched.
- Checked on the build: all 46 sitemap URLs have a page, a matching canonical and og:url, `index, follow`, a trailing slash, lower case, and no `#` or `?`. No page marked noindex is in the sitemap, no indexable page is missing from it, and no internal link is broken. The `#` inside schema `@id` values is a name for the item, not a link, and stays.

### Nov 12, 2026, 5 pm. First real gate photos on the site (website and AEO chat), on Joe's word
- Joe sent two phone photos of a wood and black steel side gate. They are in `static/assets/img/` as `gate-latched-close.jpg` (square, close up) and `gate-latched-side-yard.jpg` (wide, down the side yard). Cut to size, phone location data removed, a gas meter and a soda can cut out of frame.
- Where they show: home step 5 "We latch your gate and take a photo" (side yard), home Proof of Scoop sample card (close up, the frame is square now, still marked SAMPLE), `/how-it-works/` step 6 (side yard), `/our-promise/` gate photo section (close up). The caption is "This is the kind of photo you get." Do not call it a customer's gate, we have no word that it is one.
- The drawn pictures `gate-photo.jpg` and `gate-scene.jpg` stay in the repo because the crew demo and the truck link demo still use `gate-photo.jpg`. Field App chat: swap those to a real photo when you next rebuild the video.
- Joe says many more photos are coming. New ones go in the same folder, with location data removed, and get added to `BLOBS` in `export_site.py` or straight into `content/`.

### Nov 12, 2026, evening. Full redesign of the public site (website and AEO chat), on Joe's word
Joe asked for a full pass so the site does not look vibe coded: "make it more like a designer actually built this", stick to the colors, and know what it is the second you land. No copy rule, price, promise or money rule changed. No route code, crew app, truck link or `crm.sql` was touched.

- **The idea: every screen reads like a yard sign.** Big sign type, flat fields of the three brand colors (navy, orange, cream), and the real gate photos shown as date stamped prints (cream border, time strip, orange GATE LATCHED stamp). Cream is only used for paper things: the photo prints, the Black Friday coupon and the commercial visit report.
- **One font, our own file.** Archivo, the logo's own typeface, for everything: narrow and heavy for headlines, a touch wide for reading text. It is served from `/assets/fonts/archivo-var-v1.woff2` and preloaded. Nothing loads from Google Fonts on the public site now. Schibsted Grotesk and IBM Plex Mono are gone from it.
- **The look lives in one file: `design/generator/look.py`.** `parts.py` imports it. The old stacked `REVAMP_CSS` layers are gone. Commercial page styles are in `build/biz.mjs` (`RAW_CSS`), text page styles in `build/build.mjs` (`SITE_CSS`, `BF_CSS`, `DOCK_CSS`).
- **Things that are gone on purpose. Do not bring them back:** the small mono caps label above headings, the orange period after headings, the big number tiles (30 MIN, 1 PHOTO, the 8 box specs grid), glow and shine on buttons, round pill buttons, rounded cards with thin borders around things you cannot tap, fade in on scroll, chat bubble questions, dashed lines, the middle dot between words. `npm run check` now fails a public page that loads a Google font, names an old font, or has a colored period after a heading.
- **Home page order now:** hero (H1 in two sizes, button, call or text, the gate photo print in front of the orange sun), seals strip (Bonded, Insured, Background checked, Family owned), the promise as one orange sign ("No photo? That visit is free."), prices, how it works, what you get with every visit, areas, questions, last call with the desert, footer.
  - The H1 is one `h1` set in two sizes so the service reads first and the towns second. The text gained Verrado later the same night (see the next note).
  - **The animated visit moved** from the hero to How it works, next to the six steps. The hero picture is the real gate photo now.
  - The old Proof of Scoop sample card and the "Your bill" box were folded into the orange promise section (`id="proof"` still works). The made up numbers on that card (14 piles, 13 minutes) are off the home page.
  - "Every visit, by the numbers" is now "What you get with every visit", a plain check list with the same facts (`CK_ITEMS` in `parts.py`, `id="specs"` kept).
  - Questions are plain rows that open, in two columns on a computer. All 23 answers are still in the page and in the FAQ data. The H2 is "Dog poop pickup questions". The line "questions neighbors text us most" is gone, since we have no customers yet.
  - Phones: a small Book now button sits in the top bar on every page (hidden under 340 px wide, and on town pages, where the bottom bar already has it).
- **Town pages:** the map is the hero picture with the town lit up. Then seals, "We cover all of TOWN", prices (H2 is now "Pooper scooper prices in TOWN"), questions, More about TOWN (same folded H2s), nearby towns, last call. The bottom Book, Call, Text bar is unchanged.
- **Text pages** (pricing, how it works, FAQ, about, promise, blog, policies): a real breadcrumb row (Home › Page) replaced the "Arizona Pet Waste" label. It matches the BreadcrumbList data. Gate photos on `/how-it-works/` and `/our-promise/` are prints now.
- **Commercial pages and the areas hub:** same sections and words, new look. The sample report is a paper slip. The hero facts ("1 day. Written quote...") are a plain list. The map key said "Dashed lines" while the lines were solid, fixed to "The orange lines are the ZIP codes we serve."
- **Content files:** 239 orange period spans and 89 small labels (`bxk`) were taken out of `content/`. Table headers typed in capitals are sentence case now.
- **Sign up and My Yard** got the new type and shapes only. No step, word or rule changed.
- **Speed (same test machine, home page, phone):** page weight 830 KB to 604 KB, largest paint 5.7 s to 4.2 s, Lighthouse performance 76 to 85, SEO 100, layout shift 0. Gate photos have lighter WebP sizes (`gate-latched-*-480/720/1000.webp`, `srcset`). New photos should get the same sizes.
- **How to run the generator now:** `cd design/generator && APW_BOARDS=../../src/boards/ python3 export_site.py`, then `npm run build && npm run check`. No more editing the `OUT` path by hand.
- Removed from the home template: the owner story and reviews placeholder sections (they were cut at export anyway) and the dead yard game code. The game is still in `design/archive` and `yard.py`.
- Checked: build and check pass with the sale on and off (`DEAL_ON=0`, `INS_WAIT=0`), `worker.test.mjs` clean, `week.test.mjs` 76. No sideways scroll at 320, 360, 390, 430, 768, 1024, 1280 and 1440 wide on home, town, areas, commercial, pricing, how it works, FAQ, about, promise, proof, blog, policy, sign up and My Yard pages. The sign up steps were walked on a phone size screen.
- **For the Field App chat:** the customer truck link (`static/t/index.html`) and the crew app still load Schibsted Grotesk and IBM Plex Mono from Google. A customer goes from the new site to the truck link, so the truck link should pick up the new look when you next touch it: Archivo from `/assets/fonts/archivo-var-v1.woff2`, 12 px corners, no mono caps labels. See the top of `design/generator/look.py`.
- **Still open, not part of this pass:** the share picture `static/assets/img/og.png` says "First month free" and does not switch on December 1. The sign up flow and checkout still say and give a free month with no end date (see the sale switch note above). Both need a call from Joe before November 30.

### Nov 12, 2026, night. Juan's site review, prices by the week, "we haul it away" (website and AEO chat), on Joe's word
Juan (the owner) read the live site and sent a review. Joe said do the edits, cover us, say we haul the poop away (a permit is on the way), and make $108 a month feel smaller. All of it is copy and layout. No price changed.
- **Prices lead with the week price now. The bill is still monthly.** Home plan rows, the big total, the town price tables, `/pricing/`, the sign up plan step and the FAQ show "about $25 a week" first, with "$108 a month" right next to it and "We bill the month price on the 1st". The week price is the month price times 12, over 52, to the nearest dollar (`_week()` in `PRICE_METHODS`, `PRICE_ROWS` and `WEEK_NOTE` in `parts.py`). Week prices: $25, $44, $17 for 1 or 2 dogs. Stripe, checkout, the schema offers and the sticky bar in sign up still use the month price. **Never show a week price without the month price beside it.** Terms say the same thing in one line under Plans and prices.
- **"We haul the poop away."** Every line that said we put it in your trash can now says we bag it and take it with us: hero, steps, check list, FAQ, town pages, pricing, how it works, one time cleanup, five blog posts, terms and llms.txt. General tips for dog owners (bag it, trash cart, never the recycle cart) are unchanged. **This claim needs the haul away permit in hand by the first visit. If the permit is late, these lines must come back out.** Commercial pages still say the bag goes to the customer's dumpster. Joe has not said to change that.
- **Insurance starts November 16.** Until then every quick claim says so: hero small line ("Bonded. Insurance starts November 16."), the seals strip and footer ("Insurance. $1,000,000, starts Nov 16"), commercial hero badges, FAQ, about, promise, the business description and llms.txt. All use `[[ins:before||after]]`, so the Nov 16 rebuild flips them to "Bonded and insured". New shared strings in `parts.py`: `COVERED`, `NO_CONTRACT`, `SEALS_ARIA`.
- **"See the proof" is "See our coverage".** `/bonded-and-insured/` is now titled "Our bond and insurance" and calls itself a summary. The certificate is sent when someone asks. The address did not change. Juan asked for a certificate with the numbers blacked out on the page after Nov 16. The standing rule says no documents on the site, so that waits for Joe.
- **"No contract" never stands alone during the sale.** By every sign up button it reads "No long term contract. Keep your plan 60 days and your free month stays free." After the sale it goes back to "No contract." (`NO_CONTRACT`). Terms now say "no long term contract" too. Commercial copy says month to month with 30 days notice.
- **Verrado is in the H1:** "Dog Poop Pickup Service in Verrado, Buckeye, Goodyear and Litchfield Park, AZ". Verrado and Waddell are in the service area line of the check list and the home meta description.
- **New home section, "Meet Juan, the owner"** (`id="owner"`), between the check list and the areas. Words only, all from `/about/`. When the photo shoot is done, a photo of Juan goes in the left column as a `.print`.
- **Coming soon is four towns:** Surprise, Peoria, Glendale and Laveen. Tucson, Flagstaff, Kingman, Lake Havasu City and "Central and East Valley" are gone. **The waitlist no longer promises a free month or a free cleanup.** It only says we will tell them when we start. `WAIT_OFFER` in `worker.js` (one line of text in the office email) now says no offer was shown. People who joined the waitlist before tonight saw the old offer.
- **Small fixes from the review:** the truck in the sample visit starts fully inside the picture (it used to slide in half cut off). Town pages link to the sample truck link (`/t/DEMO01`) and not the home page. The pause line says "after your first 60 days" everywhere. The check list merged skips and pause to make room for haul away.
- **Not changed, needs Joe and Juan:** the weekly price itself (Juan notes Scoop Soldiers lists $22.99 a visit with haul away), every other week ($75, about $35 a visit), and the one time cleanup ($95, an older draft had $49 light and $79 heavy). A background check provider is not named anywhere. Real photos of Juan, the truck and a yard wait for the shoot.
- Checked: build and check pass with the sale on and off and insurance before and after (`DEAL_ON`, `INS_WAIT`). `worker.test.mjs` clean, `week.test.mjs` 76. No sideways scroll at 320, 390, 768, 1024 and 1440 on home, town, areas, pricing, coverage, about, commercial and sign up. ZIP check, plan picker and the sign up plan step were run in a browser.

### Nov 13, 2026, night. Real photos from the shoot on every page (website and AEO chat), on Joe's word
Joe sent 18 photos from the shoot (one man in the navy company shirt: scooping turf, rock and a gravel side yard, spraying turf, latching a wood gate, at a steel gate, the shirt back with the web address and QR code). He asked for real pictures on everything before the Monday launch, and nothing that looks AI made. No copy rule, price or promise changed. No route code, crew app, truck link or `crm.sql` was touched.
- **Files:** `static/assets/img/photos/`. Each photo has a JPG and three WebP sizes. Wide ones are 3:2 (640, 960, 1440). Names ending in `-tall`, and `team-portrait`, are 4:5 (480, 720, 1000). Camera and location data is removed. The camera originals are not in the repo.
- **One helper each side:** `pic()` in `design/generator/parts.py` (home and town templates, strings `PH_*` and `PHOTO_BAND`) and `photo()` in `build/build.mjs` (FAQ and blog index). Text pages in `content/` carry the same markup by hand.
- **Look:** a real photo is flat, 6 px corners, no frame (`.pho`). The cream print with the GATE LATCHED stamp is still only for gate photos. Do not name a class `.ph`, that one is the old placeholder box.
- **Home:** the hero is the portrait in front of the orange sun with the small gate print tucked over its corner. The orange promise section has the gate photo as a print, with no person in it (Joe's word). How it works keeps the animated visit, and steps 3 and 4 have photos. A three photo row (turf, rock, spray) sits above "What you get". Meet Juan has a photo. A wide photo of the shirt back sits above the last call.
- **The animated visit stays on the home page for now.** Joe said keep it. He is sending video on Nov 14 and may swap it then.
- **Town pages:** the three photo row sits above the prices. On a phone it slides sideways inside its own strip, the page does not scroll sideways.
- **Text pages:** photos sit in the empty right side on a computer (`.pho-r`, floats at 1140 px and up) and in the text flow on a phone. Done: about, how it works, pricing, our promise, coverage, contact, FAQ, blog index, four blog posts, one time cleanup, same day, turf odor, and one photo on the commercial hub.
- **Schema:** LocalBusiness `image` now lists five real photos with the share picture.
- **Needs Joe:** (1) Joe confirmed the man in the photos is Juan Gonzalez, the owner. The Meet Juan photo on the home page and on `/about/` is the one where he looks at the camera, with the caption "Juan Gonzalez, owner". Other alt text says "our scooper". (2) No photo names a town or calls a yard a customer's yard, we have no word on either. (3) Still drawn, no real photo yet: the truck, the desert strip above the footer, the sample report pictures on the commercial pages (stations, trail, dog park), and the share picture `og.png`.
- Checked: build and check pass with the sale on and off and insurance before and after. `worker.test.mjs` clean, `week.test.mjs` 76. No sideways scroll at 390 and 1280 on home, town, about, how it works, pricing, FAQ, blog and the service pages.

### Nov 15, 2026. Text opt in proof for Twilio (website and AEO chat), on Joe's word
Twilio turned the A2P 10DLC campaign down with error 30909: the reviewer could not check how customers agree to texts, because the text boxes sit on step 3 of 5 of `/book/`. Joe asked for public proof on the site so he can send it in again. No route code, crew app, truck link, `crm.sql` or `worker.js` was touched. No Stripe, billing or key was touched.
- **Public proof on `/texts/`.** New part at the end of How you opt in: `id="opt-in-form"` ("What the sign up boxes look like") with a screenshot of step 3 of 5, the exact words, and the steps. After it: the waitlist box (`id="waitlist-form"`, picture folded shut) and the My Yard boxes (words only, it is behind sign in). A link that lands on `/texts/#opt-in-form` scrolls there, then the `#` is dropped as on every page.
- **Screenshots:** `static/assets/img/sms-optin-form.png` and `sms-optin-waitlist.png`. `python3 build/optin-shots.py` retakes both from `dist/` (nothing typed, nothing sent, and it stops if a box starts checked or the step number moves). Joe sent a screenshot from before the Nov 12 redesign (old fonts, round button). The one on the site is a fresh capture of the same step, so it matches the live form. The old `docs/optin-screenshot.png` (step 4 of 6, old words) is gone.
- **Rule: the proof must match the live form.** If the words or the look of the sign up step, the waitlist form or the My Yard text boxes change: retake the pictures, fix the quotes in `content/policies/texts.html`, fix the opt in description in `GO_LIVE.md` part 10, and change the Captured dates. Browsers keep `/assets/` files for a year, so add `?v=2` to the picture `src` in `texts.html` when a picture changes. The plain address stays the one Twilio has.
- **Waitlist text box** (`book.prod.tpl.html`, step 1, My city is not here). The line under it now names Arizona Pet Waste and says one text, message and data rates, STOP, HELP, with links to Text Terms and Privacy Policy. Before, it only had rates and STOP. Only words changed. `booking.tpl.html` (the canvas copy) was left alone.
- **`/terms/` and `/privacy/`**, Text messages: program name, what we send, how often, rates, STOP, HELP, carriers, and "We never share your mobile number or your text opt in consent with any third party or affiliate for marketing or promotional purposes." Keep that true (see the Google tag note below).
- **Policy pages:** the date and the lead come first, then On this page (`build.mjs`, policies loop). New text page styles in `SITE_CSS`: `.facts` (rows with thin rules, add `.facts-2` for two columns from 600 px) and `.shot` (a framed screenshot you can tap, floats right from 1140 px). A heading reached by a jump link no longer shows a focus box on text pages.
- **Needs Joe: the Google tag.** The live Google Ads tag (`AW-18567619964`, loaded by `GTM-T8GX2H6D`) has "user provided data" set to automatic for email, phone and address, with no exclusions. That is Google's enhanced conversions. When a conversion fires it can send a scrambled copy of the phone number and address typed into sign up to Google Ads. That clashes with the promise above and with the privacy line "We do not send Google your name, your address...". No conversion event was in the tag on Nov 15. The fix is in the Google tag settings, not in this repo: turn automatic detection off, or at least Phone and Name and address.
- **For whoever next works in `worker.js`:** `CONSENT` (saved as `text_shown` in `consent_log`) is a little shorter than the words on the form. It lacks "You can skip this one." and "No texts? We email you instead." My Yard also uses its own shorter words. Make the saved text match what each screen shows.
- `build/smoke.py` is out of date. It stops at its first step (the hero button it looks for is gone since the redesign). It was like that before this change.
- Checked: build and check pass with the sale on and off and insurance before and after. `worker.test.mjs` clean, `week.test.mjs` 76. Sign up and the waitlist were walked in a browser at phone and computer sizes on a local build (demo mode). The live `/book/` step 3 was read in a browser on Nov 15: two separate boxes, both unchecked, not required, words as quoted on `/texts/`. No sideways scroll at 320, 360, 390, 430, 768, 1024, 1280 and 1440 on the four policy pages.

### Nov 15, 2026, night. Real video in a phone on the home page, Juan's own words on About, lazy images fixed (website and AEO chat), on Joe's word
Joe sent four ad videos (real video of Juan at work, cut tall for phones, 183 MB in all) and asked for them on the site without slowing it down, "maybe inside of a phone". The same night he sent new About page words from Juan, asked for the ZIP codes to come out of the Areas we serve drop-down, and for "starts Nov 16" to come off the Insurance seals. No route code, crew app, truck link, `crm.sql` or `worker.js` was touched. No price, promise or money rule changed.
- **The phone with our videos is in How it works on the home page, where the animated visit was.** One flat orange phone. The four clips play one after the other. On a computer the clip names are a list beside it and the phone stays on screen while the six steps scroll by. On a phone the names are chips under it. Markup is `REEL` in `parts.py` (the clip list is `_REEL`), the look is `REEL_CSS` in `look.py`, the behavior is `src/runtime/reel.js`. The build adds that script only to pages that hold a phone (`data-reel`).
- **The animated visit is off the page and saved.** Joe had said keep it until video came. How to bring it back is in `design/archive/README.md`. Ask Joe before you do.
- **Video files:** `static/assets/video/`. Made with `python3 docs/video/make_reel.py <folder with the originals>` (see `docs/video/README.md`). 540 by 960, no sound track, 1 to 1.8 MB each. The originals are not in the repo. Never commit one. A changed file needs a new name (`-v2`), browsers keep `/assets/` for a year.
- **Speed rules for the phone, keep them:** nothing from a video is fetched when the page loads. The first bytes come when the phone is within 300 px of the screen. Only the clip that is showing is fetched. It plays with no sound when half the phone shows and stops when it leaves the screen, the tab is hidden, or sign up opens. No autoplay for less motion, data saver or a slow link: those get the still and a play button. With no script the video keeps the browser's own controls and every clip name is a plain link to its file.
- **The sale switch covers the videos.** Three ads end with "FIRST MONTH FREE" burned into the picture and one is all about Black Friday. `NAME-sale-v1.mp4` (the ad as sent) plays through November 30. From December 1 the page uses `NAME-v1.mp4`: the same ad cut right before the free month caption, then the closing card with the offer line taken out. The Black Friday clip goes away. The build does this with the sale tag, and `reel.js` does it on its own at the same moment if no build has run. The line under the phone names the sale and the 60 day rule while the sale is on, because the Black Friday ad says "NO CONTRACT" by itself.
- **Search data:** a `VideoObject` for each clip in the home page data (`VIDEOS` in `build.mjs`), and a Videos part in `llms.txt`. Google only gives video results to a page where one video is the main thing, so do not expect video results from the home page. Search Console may list the home page under "video is not the main content of the page". That is normal.
- **Found and fixed: no image on the site was lazy in Chrome.** `dc.js` copied each page template into the page with `importNode`. When the same `loading="lazy"` image is already in the server HTML, Chrome then fetches every one of them at once. So every photo on a page was fetched on load, however far down. The fix is one line: `block.proto.cloneNode(true)` in `Instance`. Do not change it back. Checked: the server HTML of every page is byte for byte the same, and 30 scripted steps (home, sign up, waitlist, town page, My Yard, About) give the same page HTML, form values and focus with the old and the new line.
- **Speed, home page, same machine, Lighthouse phone test, four runs each:** score 79 to 84, largest paint 5.1 s to 4.0 s, page weight 1,158 KB to 623 KB, layout shift 0. A phone with a sharp screen fetched 1,741 KB on load before and 736 KB now. Home page HTML went from 178 KB to 156 KB and its page script from 112 KB to 86 KB, because the drawn scene is gone. Town pages and About got lighter too (lazy images).
- **About page:** Meet Juan is now Juan's own words, in first person. "Three rules Juan works by" is now "The standards we stand behind" (do what you say you're going to do, take pride in the details, never stop improving), then "Proud to serve our community". The line about growing up in California and the old three rules are gone. The rest of the page is the same. "long-term" is written "long term" (no dashes in copy), and the headings are sentence case like the rest of the site. The home page Meet Juan line and `llms.txt` name the same three standards.
- **Areas we serve drop-down:** town names only. The ZIP codes under each town are gone (`DD_AREAS`). The commercial drop-down still has its small lines.
- **Insurance: no "starts November 16" by the hero or on the seals.** It is gone from under Insurance in the strip under the hero, the footer and the commercial badges (`SEALS`, `bxbadges`), which read "Insurance, $1,000,000 liability" until the insurance date and "Insured, $1,000,000 liability" after. The small line under the hero button on home and town pages (`COVERED`) reads "Bonded." until the date and "Bonded and insured." after. Full sentences in the FAQ, About, promise, coverage page and one blog post still give the start date until midnight on November 15 (the `ins` tag). The GitHub job rebuilds at 07:05 UTC on November 16.
- **Needs Joe:** (1) Sound. The ads have music only, no voice. The site files have no sound track, since we do not know if the music may be used on a website. If it may, see `docs/video/README.md`. (2) The Black Friday ad says "NO CONTRACT" with nothing after it. The site rule is that those words never stand alone during the sale. The page covers it with the line under the phone, but the ad itself runs elsewhere with no such line. (3) December: new ads with the first cleanup offer, or keep the cuts. (4) If he wants the animated visit back.
- **For the Field App chat:** the one line in `dc.js` is the only shared file touched. The sign up form's look and words did not change, so the text opt in screenshots on `/texts/` still match.
- Checked: build and check pass with the sale on and off and insurance before and after. `worker.test.mjs` clean, `week.test.mjs` 76. The phone was run in a browser: plays when it scrolls in, rolls to the next clip, pause, clip names, keyboard, stops off screen and while sign up is open, less motion, the December switch with no new build, and no script. No sideways scroll and the phone fits at 320, 360, 375, 382 by 580 (iPhone Duo closed), 390, 412, 430, 669 by 825 (Duo open), 768, 951 by 543 (Duo open sideways), 1024, 1280, 1366, 1440 and 1920 wide. Not run: a real iPhone or Android phone. The test browser was Chrome.

### Nov 15, 2026, late night. Launch eve search check, Bing set up, new share picture (website and AEO chat), on Joe's word
Joe asked for one deep search check (Google, Bing, AI answers, local), one more look pass, and for sign up to be ready for his own test tonight.

What the check found (live pulls, Nov 15):
- Google has about 10 of our 46 pages. The home page is not one of them, so a search for our own name shows the Google profile and Facebook, not the site. Nothing on the site blocks it (200, index tag, canonical, sitemap all right). It needs Search Console: verify, send the sitemap, ask for indexing on the home page and the five town pages. That takes Joe's or Atlas's Google sign in.
- Bing has zero pages. ChatGPT search leans on Bing, and ChatGPT could not find the site even by its address. Fixed from our side with IndexNow (below). Bing Webmaster Tools still needs a sign in.
- ChatGPT and Perplexity, asked who picks up dog poop in Verrado and Buckeye, name Dog Gone Duty, Number 2 Club, Scoop Soldiers, Poopsie Daisy, POOP 911, West Valley Pooper Scoopers and Elite. Not us yet. They read Bing, BBB, LinkedIn, PetWorks and the company sites.
- On the pages: every page has one H1, headings in order, a title of 62 letters or less, a description of 110 to 165, schema, and clean HTML. Town copy reads at grade 3.

What changed:
- IndexNow. `src/site.config.json` has `indexNowKey` (a public value, not a secret). The build writes `/<key>.txt`. `.github/workflows/indexnow.yml` runs after each push to main that touches the site, waits for Cloudflare, reads the live sitemap and sends Bing every page address. Run it by hand from the Actions tab any time.
- `src/site.config.json` has `verify.google` and `verify.bing`. Paste the code from Search Console or Bing Webmaster Tools there and the tag goes on every page.
- Schema: the slogan is "No photo? That visit is free." (the old tagline was still there). The business has an address of town, state and ZIP only (Buckeye, AZ 85396). No street, on purpose.
- Share picture: `static/assets/img/og.jpg` (was `og.png` with "First month free" on it). Navy, Archivo, Juan, the gate print, no offer and no date. Made by `design/share/make_og.py` from `design/share/og.html` after a build. Twitter tags added.
- Town page H1s end in ", AZ" ("Pooper scooper service in Buckeye, AZ"). Two town descriptions trimmed to fit.
- The promise page opens with "No photo? That visit is free." The small "staff" link at the page bottom has enough contrast now.
- `docs/NEW_TOWN.md`: every place a new town has to be added, and what to rethink when we leave the West Valley (Phoenix, East Valley, Tucson, Flagstaff, Kingman). Boulder City is in Nevada and needs a call from Joe.

Sign up, as of tonight:
- All 130 booking buttons on 45 pages go to `/book/`. The form opens and checks each field in plain words.
- Cloudflare still has Stripe test keys (`pk_test`) and no mail key (`/api/config` says `mail: false`). So the public gets the "we call you" form and the lead lands in the office (3 leads there, last one Nov 13, no server errors in 3 days). Real cards need the live keys and a live webhook. That is Joe's or Atlas's to set. This chat must not handle keys.
- Field desk session, one for you: the live `customers` table has no `skips` column yet. It is in `supabase/crm.sql` (line 42) but was not run on the live database. Until it is, a skip from My Yard falls back to a text. I did not run it: the database is your lane.

### Nov 15, 2026, 9:30 pm. Header video on the home page (website and AEO chat), on Joe's word
Joe sent a 16 second film of a real visit (4K, 127 MB) and asked for it as the website header, working on phones, tablets and computers, with no lag, and with the buttons on it see through so nothing covers the film.
- The home hero is now `hero-hv`: the film plays behind the H1 and behind the top bar. One flat navy layer at 58 percent sits over it. The portrait and gate print left the hero (the promise sign right under it still has the print).
- See through: the hero Book button and the top bar Book button are an orange outline with cream words while they sit on the film. Scroll down and the top bar turns solid navy with the orange button, as before. `html.hv-top` is set in the page head for pages with the film and kept by `src/runtime/hv.js`.
- Speed: the page loads a still picture only (16 KB on a phone, 50 KB on a computer). The film is fetched after the page has loaded and the browser is idle. A phone held upright gets `header-tall-v1.mp4` (540 by 864, 1.0 MB), everything else gets `header-wide-v1.mp4` (1280 by 720, 1.9 MB). No sound track. It stops off screen, in a hidden tab and when sign up opens. No film for less motion, data saver or a slow link. A round button pauses and plays it. Lab scores did not move: phone 86 to 87 (was 84), computer 100.
- Files: `docs/video/make_header.py /path/to/original.mp4` makes the four files in `static/assets/video`. The original is not in the repo.
- Tested with a script: 23 checks (load order, which file, pause, scroll, sign up, less motion, no script) at 1440, 1280, 1024, 768, 390 wide and a phone held sideways.
- Other pages are unchanged. Town pages keep the map in the hero.

### Nov 15, 2026, 11 pm. Live Stripe billing: card saved at sign up, part month, then the 1st (website and money rules chat), asked by Atlas for Joe
**Replaced on Nov 16, 2026, 11 pm: no part month and no bills on the 1st any more. The card form, `startPlan`, the holds and `checkPlan` below still stand. The billing day and the part month do not. See the note at the end.**
Atlas is putting the live Stripe keys, the live webhook and the mail settings into Cloudflare. This change makes the code ready. No key was touched or asked for. Read this before you change anything near Stripe in `worker.js`.
- **The billing model Joe approved.** First month free with the card on file. The day the free month ends, Stripe charges the days left up to the 1st (a part month). Then the full price on the 1st of each month, for the month ahead. A free month that ends on a 1st has no part month. The free month is still one month and one week from the soonest start day (`firstCharge`), and the 60 day rule is unchanged.
- **Why the card form changed.** Stripe Checkout cannot start a plan that has both a free trial and a fixed billing day ("Checkout doesn't support combining a trial with the billing cycle anchor", Stripe billing cycle docs). So `/api/checkout` now makes a Checkout Session in **setup mode**: it only saves the card and shows $0. The plan is started by the server in `startPlan` with `POST /v1/subscriptions`: `trial_end` is the end of the free month, `billing_cycle_anchor` is the 1st after it, `proration_behavior=create_prorations` makes Stripe charge the part month. The old way (trial to the 1st, then a negative invoice item credit) is gone, and so is `metadata.credit`.
- **Two callers, one plan.** `startPlan` runs from the webhook (`checkout.session.completed`, `mode=setup`) and from the new `POST /api/checkout/done`, which the sign up page calls when the card form says done. So a sign up still finishes if the webhook is late or its secret is wrong. It looks for a plan on the Stripe customer first, uses the idempotency key `apw-plan-<session id>`, and `booked` moves the row from `checkout` with a compare and set, so there is one plan, one "New booking" email and one "You are booked" email. Stripe's own `customer.subscription.created` can land first: it goes through `booked` too.
- **If Stripe refuses to start the plan** after the card is saved, the office gets "ACTION NEEDED: card saved but the plan did not start" with the customer and the reason (`planAlert`), and the server error lands on the Health tab. The webhook answers 500 so Stripe sends it again.
- **The card lives on the Stripe customer** (`invoice_settings.default_payment_method`), not on the subscription. A card changed on Stripe's billing page then counts for every later bill and for Stripe's retries. Do not set `default_payment_method` on the subscription.
- **A payment fails** (`cardFailed`): the row goes to `past_due` once, with a compare and set from `trialing` or `active`. Only that first move emails the customer ("Your card did not work", with the Stripe bill link and My Yard), queues one text in `messages` (`kind = card_failed`, `stop_id` null, only when `texts_visit` is on), emails the office and deletes stops after today. Stripe's retries send nothing more. `planDay` already skips `past_due`.
- **The bill gets paid** (`backOn`): from `invoice.paid` when the plan is in good standing in Stripe (`billPaid`), or from `customer.subscription.updated` when the status went from `past_due` to `active`. The row comes off hold once, the customer gets "Your payment went through", the office gets "Paid", and a `card_failed` text nobody sent is marked `skipped`. Any other plan update leaves a `past_due` row alone (`status=neq.past_due` on that PATCH).
- **A new card while on hold** (`newCard`, event `customer.updated`): open bills are tried on the new card right away with `POST /v1/invoices/{id}/pay`.
- **Field desk session, three things touch your side.** (1) The office Texts tab now can show a `card failed` text. It is drawn by the code that draws every queued text, and the crew route sheet ignores it (no stop). No screen changed, so the training video was not rebuilt. If you list the kinds of texts in the written steps, add this one. (2) `build/desk.test.mjs`: the one sign up in it now arrives as `customer.subscription.created`, since `checkout.session.completed` in subscription mode is no longer ours. Nothing else in that file changed. (3) `planView` returns `hold: true` and no next visits for `past_due` and `unpaid`.
- **Sign up page** (`book.prod.tpl.html`): still 5 steps and still "Step 3 of 5" for the text boxes, on purpose: the Twilio proof on `/texts/`, its screenshot and the text Atlas sent to Twilio all say step 3 of 5. Do not change the step count while that review is open. The pay step now has a plain money table: plan and price, Today $0.00, Free until, the part month with its day, then the 1st. Under it: cancel anytime in My Yard and the 60 day rule with the real date. `_bill` is the same math as `firstCharge`, in Arizona time. The old line "Cancel before X and you pay $0" was wrong against the 60 day rule and is gone.
- **My Yard** (`account.prod.tpl.html`): a notice box when the card failed, with "Change my card". An open bill in the list says "Pay bill".
- **Wallets.** The header `Permissions-Policy` only let `js.stripe.com` use the browser pay sheet. The card form is a frame from `checkout.stripe.com`, so Chrome would have blocked Google Pay in it. Both hosts are allowed now (`build.mjs`). Apple Pay and Google Pay also need the domain added in Stripe (GO_LIVE part 5, step 6).
- **Copy.** Terms (Billing) and Pricing say the first charge is on the day the free month ends, with the same December 27 example. The FAQ answer "When do you charge my card?" and the facts file say the same.
- **Tests.** `build/worker.test.mjs` was rewritten: 121 checks with a pretend Supabase and a pretend Stripe that keeps state (dates, part month by line, both callers in both orders, retries, holds, new card, the 60 day rule, live keys making prices). Run it with `STRIPE_SPEC=/path/to/spec3.json` (the public file from github.com/stripe/openapi) and every Stripe request is also checked against Stripe's own field list. `build/stripe.fake.mjs` is the Stripe stand in shared by `signup10` and `signup50`. On a local Postgres: desk 108 pass, signup10 39 pass, signup50 115 pass and 1 fail. That one fail ("only Monday to Friday is used") fails the same way on the code before this change when the test is run on a Sunday: the test sets area days from today's weekday. It is yours to look at, it is not a billing bug.
- **Not tested, and it matters.** No request in this repo has ever reached the real Stripe. The field names are checked against Stripe's published spec and docs, but nobody has run a sign up with real test keys. GO_LIVE part 7 is that test, with a failed payment drill. Run it before the live keys go in. The one number to compare by hand: Stripe's "Upcoming invoice" for the test customer against the part month the pay step showed. The server rounds each line of the plan on its own, which is what Stripe's docs describe, but a one cent gap on plans with two or more extra dogs would show up there.
- **Needs Joe.** (1) The site says "cancel anytime" next to the 60 day rule. Both are true, and the rule is printed with its date right under it. If Joe wants cancel anytime with no charge, the 60 day rule has to go, and that is his call. (2) From December 1 the ads say "first cleanup free" but checkout still gives a free month. Still open from before.

### Nov 15, 2026, 11:30 pm. Live Stripe billing, second pass after a review (website and money rules chat)
A second reviewer read the commit above line by line and ran the tests. It found no bug in the plain sign up, hold and paid paths. It did find rare cases that would hurt with real cards. They are closed in this commit. Read this before you touch `webhook`, `startPlan` or the two one time charges.
- **Stripe sends old news.** Stripe does not promise the order of its events, and it sends an event again for up to three days when it got no answer. So before a hold is set or lifted, the server asks Stripe where things stand right now. `invoice.payment_failed`: `GET /v1/invoices/{id}` must still be `open` with money owed. A plan event that says `past_due`, or that says the plan came back from `past_due`: `GET /v1/subscriptions/{id}` must say the same status. If Stripe says something else, the event is dropped (a newer event has the truth). Before this, a late "payment failed" for a bill that was already paid put a paid customer back on hold, with a second "Your card did not work" email, and nothing lifted it until the next month.
- **A canceled plan stays canceled.** The plan PATCH has one more filter: `or=(status.neq.canceled,stripe_subscription_id.is.null,stripe_subscription_id.neq.<this plan>)`. A late "active" or "paused" for the plan the row already shows as canceled changes nothing. A new plan with a new id still brings the customer back, which is how the office starts a returning customer in Stripe.
- **A cancel is for one plan.** A cancel event only cancels the row that holds that plan: `or=(stripe_subscription_id.is.null,stripe_subscription_id.eq.<this plan>)`. So when the office has started a returning customer on a new plan, a late or resent cancel of the old plan no longer wipes the gate code and pulls them off the routes. Both filters were tried against the live Supabase REST API with the public key (it answers 200 for them and 400 for a broken one).
- **One sign up, one plan, ever.** `startPlan` reads the row first and only starts a plan for a row that is waiting at `checkout`. It also looks at every plan the Stripe customer has had (`status=all`, up to 100): if the plan from this sign up (`metadata.session`) was canceled, no second one is made. Before this, the sign up page or a resent event could start a new plan for a customer who had canceled, once Stripe had forgotten the idempotency key (it keeps keys for one day). The dates are checked before anything is written to Stripe.
- **Stripe says "busy".** When the webhook and the sign up page start the same plan in the same second, one gets a 409. It now asks again with the same key (up to 3 more times, a few seconds in all) and gets the plan the other one made. It used to wait once and then alert the office.
- **The ACTION NEEDED email changed.** It no longer says "start it by hand in Stripe". The next retry usually starts the plan, and a plan made by hand on top of that would bill the customer twice. It now says: wait for the "New booking" email, look in Stripe before doing anything, never start a second plan. One email an hour for one sign up. The Health tab line starts with "Card saved but the plan did not start (cs_...)".
- **Every new plan is checked against Stripe (`checkPlan`).** Right after a plan is made, the server asks Stripe for the first bill (`POST /v1/invoices/create_preview`, it changes nothing) and holds three things up against what the customer saw at the card step: the day the free month ends, that bills line up on the 1st, and the first charge (2 cents of slack for rounding). If one is off, the office gets "CHECK BILLING: Stripe does not match what <name> was told" and the Health tab gets a line. Nothing is charged for weeks at that point, so there is time to fix it. It runs in the background and can never stop a sign up. It is queued the moment the plan exists, before the row is updated. This is the safety net for the fact below: no request from this code had reached the real Stripe when it shipped. Two things to know. If `create_preview` ever answers in a way this code did not expect, every sign up would get the email: the email says so, and the first test sign up shows it. And it is the only guard on a free month that ends on a 1st, where no billing day is sent: the first such sign ups are on November 24, 2026 (free until January 1), then December 24.
- **The two one time charges cannot double.** The early cancel bill carries `metadata.early_cancel = <plan id>` and the back from pause bill carries `metadata.resume = <plan id>-<month>`. Before charging, `billedBefore` looks through the customer's bills for that tag. The line on the bill carries the same tag (`chargeLine`): if an earlier try made the line and then failed before the bill, the waiting line is used and no second one is added. The idempotency keys are still there for the first day. Side effect, and it is on purpose: a customer who pauses and comes back twice inside one month is charged for the rest of that month once, not twice. Nothing in the money rules was loosened.
- **Two card forms open.** `booked` now writes `plan` and `dogs` from the plan Stripe made, so the row always matches what is billed, even when the customer had the card step open twice with two choices and finished the older one.
- **A wrong webhook secret shows up.** An event with a fresh, well formed signature that does not match `STRIPE_WEBHOOK_SECRET` writes one line an hour to the Health tab. Junk and old replays write nothing. While the secret is wrong, sign ups still work (the page reports them), but cancels, failed payments and paid bills do not arrive. That line is how you find out.
- **Snapshot events only.** Stripe's Dashboard now offers "thin" events first when you add a webhook. A thin event has no object in it, so this server cannot act on one. It answers 400 ("This webhook needs snapshot events") and writes one Health line an hour, so a webhook set up the wrong way fails where people can see it. GO_LIVE part 5 step 7 says to pick Snapshot.
- **`/api/health` says more.** `keys` is `test`, `live`, `mixed` (one test key and one live key, which cannot work) or `none`. `hook` is true when a webhook secret is set. `mail` is true when the Resend key is set. No key is shown.
- **What Stripe's docs say, checked Nov 15, 2026.** (1) "The default value is either the subscription creation date or the trial end date (if you're using a trial period)": so a free month that ends on a 1st needs no billing day, and `checkPlan` would catch it if that were ever not so. (2) "You can combine trials with billing_cycle_anchor, resulting in a free period followed by a prorated period, leading into a fixed billing period": that is the plan we make. (3) API version `2026-10-28.endive` is real and is the newest one. From `2025-09-30.clover` on, new plans are in flexible billing mode. (4) The 2026-09-30 change to the format of `billing_cycle_anchor` is for update, resume and preview. Create still takes a time stamp. (5) `payment_method_types` is gone from Checkout. `allowed_payment_method_types` is what we send.
- **Stripe remembers failed answers too.** For one day Stripe hands back the first answer it gave for an idempotency key, a failure included (the reply carries the header `Idempotent-Replayed: true`), and it refuses the same key with other fields. Two things follow. (1) If the fields of the plan request in `startPlan` ever change, change `PLAN_KEY` in the same commit, or sign ups that failed under the old fields stay stuck for a day. (2) A sign up whose plan failed after Stripe began work on it will not fix itself by waiting: when a retry gets that repeated answer, the office gets one more ACTION NEEDED email that says so, also on an old event. The code does not move on to a new key on its own: Stripe's own advice after a 500 is to find out what happened first, and a second key is how a second plan gets made. The customer can also sign up again, which makes a new card form and a new key.
- **Known and left.** Two card forms finished in the same second by one person could make two plans (each has its own key). A person cannot do that by hand. After an outage Stripe says it may finish failed work on its own later, which in theory could add a plan: there is no "two plans on one customer" alarm yet, and it would be a good one to add. A hold is only lifted by an event from Stripe, so if events are lost for more than three days (a wrong webhook secret left in place), a paid customer stays on hold until the next paid bill: a nightly look at `past_due` rows against Stripe would close that. A one cent rounding gap on plans with extra dogs is inside the 2 cent slack. If Stripe ever refuses `allowed_payment_method_types`, the card form falls back to every way to pay that is on in the Dashboard, so GO_LIVE says to turn the others off.
- **Field desk session.** No screen changed, so the training video was not rebuilt. The Health tab can show three new kinds of lines: "Card saved but the plan did not start", "Stripe does not match what a new customer was told about their first bill" and "A Stripe event was refused: its signature does not match STRIPE_WEBHOOK_SECRET".
- **A third reviewer pass** went over the second commit and found nothing blocking. Its four smaller points are in: the cancel filter above, the tagged line, the repeated failure email, and the first bill check queued before the row update.
- **Tests.** `build/worker.test.mjs`: 180 checks, 182 with `STRIPE_SPEC`. The check against Stripe's field list had a hole: it only looked at the requests of the last test case, because the request log is emptied between cases. It now looks at all 322 Stripe requests of the run: 81 kinds of field on 23 kinds of request, none refused. `VERBOSE=1` prints the kinds of request. New: late and out of order events, old sign ups reported again, busy answers, the first bill check, two card forms, the tagged one time charges, the webhook secret note, the health check. `build/stripe.fake.mjs` now works out the first bill the way Stripe does (by the second, line by line), so `signup10` and `signup50` check the server's part month against a second way of doing the sum. Local Postgres: desk 108 pass, signup10 40 pass, signup50 122 pass and the same 1 weekend only fail as before.


### Nov 16, 2026, 1 am. Deodorizing is included free with every visit, and "Insured and bonded" (website and AEO chat), on Joe's word
Joe, November 16: Arizona Pet Waste is insured and bonded as of today, and deodorizing is included free with every visit. Read this before you write any price, extra or trust copy.
- **There is no paid turf odor treatment.** The $35 extra is gone from every page, the price tables, Terms, the schema and `llms.txt`. Do not bring it back, and do not write "for a deep clean" or "a deeper treatment". The line to use is "Deodorizing is included free with every visit." As a label: "Deodorizing included free with every visit".
- **Where it says so now:** the FAQ (`FAQ_ITEMS` in `parts.py`, `ask` and `faq_common` in `longform.py`), the home price box (`main.tpl.html`), the "See every price" table (`PRICE_TABLE`, the row reads "Deodorizing with every visit, Included free"), "What you get with every visit" (`CK_ITEMS`), the town price note and tile (`city.tpl.html`), the plan step of sign up (`book.prod.tpl.html`), `/pricing/`, `/about/`, Terms and `llms.txt`.
- **Schema:** each plan Offer says it in its description. The offer list has one free line in place of the $35 one: name "Deodorizing included free with every visit", price `0.00`, item "Yard deodorizing" (`SPRAY` and `OFFERS` in `build.mjs`). "Artificial turf odor treatment" is out of `knowsAbout`. The plan offers on `/pricing/` carry the same line.
- **`/turf-odor-treatment/` kept its address.** It is now the free deodorizing page (title "Free Turf Deodorizing With Every Visit", h1 "Free deodorizing with every visit", service "Yard deodorizing"). Its front matter has a new key, `offer` (a name and a price), that `build.mjs` writes into the page's Service schema: here the price is `0.00`. `/pricing/` and the smell blog post link to it. If Joe wants the address gone, add a 301 in `_redirects` in `build.mjs` and delete the file.
- **Other prices did not change.** Same day pickup is $49 and a one time cleanup is $95. Plans are $108, $189 and $75.
- **Insurance wording.** Every line that said the insurance "starts November 16, 2026" is now in the present tense: "Insured and bonded." (hero small line `COVERED`, the plan step of sign up, about, our promise, the bond page, the blog post on how to choose a service, the commercial FAQs, the business description in the schema, `llms.txt`). The seals still read Bonded, Insured, Background checked, the question "Are you bonded and insured?" keeps its words (people search it that way), and the page address `/bonded-and-insured/` stays. Still do not say "licensed".
- **The `[[ins:before||after]]` tag is retired.** `INS_START` and `INS_WAIT` are gone from `build.mjs`. If the tag ever shows up in a file again, the build writes only its second half. The spent November 16 line in `.github/workflows/sale-switch.yml` was left alone. It fires once a year and only pushes an empty rebuild.
- **`npm run check` guards both.** It fails if a page sells a turf odor treatment for a price or says the insurance starts on a date.
- **Commercial pages were left as they are.** They say we "can add deodorizer spray" with no price, because commercial work is quoted. Joe has not said if the free deodorizing covers commercial sites.
- **Twilio sample text 4 in `GO_LIVE.md` changed.** It offered the $35 treatment. It now offers same day pickup for $49. If the old sample is already in the Twilio campaign, swap it on the next edit.
- **Field desk session.** No screen in `/crew`, `/t` or My Yard changed, and the server did not change, so the training video was not rebuilt.
- Checked: build and check pass with the sale on and off. `worker.test.mjs` 180, `week.test.mjs` 76. Every sentence of the old and new builds was compared: no other price moved. No sideways scroll at 320, 390 and 1280 on home, a town page, pricing, the deodorizing page, the bond page, about, Terms, FAQ and commercial.

### Nov 16, 2026, 2 am. The site now says what the Google profile says (website and AEO chat), Joe's list from the profile audit
Joe sent a seven part list from the audit of our Google Business Profile. All of it is in. Read this before you write a town list, a plan name or any schema.
- **The turf page is gone.** This replaces the line in the note above that says it kept its address. `content/site/turf-odor-treatment.html` is deleted. `/turf-odor-treatment/` sends people to `/pricing/` with a 301 (`_redirects` in `build.mjs`). It is out of the sitemap (45 pages now) and no page links to it. The `offer` key in page front matter went with it.
- **The deodorizing sentence** is now "Deodorizing is included free with every visit, on rock and turf yards alike." (`SPRAY` in `build.mjs`). The two turf answers in the FAQ are the list's own words. One semicolon in them became a period, to keep sentences short. Terms list same day pickup ($49 when we have a spot) next to the one time cleanup under Extras.
- **Six names, one order: Buckeye, Verrado, Goodyear, Litchfield Park, Citrus Park and Waddell** (`SIX` and `SIX_TEXT` in `build.mjs`). They are in the schema `areaServed` (six City entries, then the six ZIP codes as before), the home and sign up descriptions, the contact page, the Areas we serve page, the service pages, the blog closers and `llms.txt`.
- **Waddell is its own name everywhere a town is listed:** the header menu, the phone menu, the footer, a chip and a label on the map (`truemap.py`, the 85355 number moved under it), and a card on Areas we serve. Waddell has no page. Every Waddell link opens `/pooper-scooper/citrus-park-az/`, whose headline now reads "Pooper scooper service in Citrus Park and Waddell, AZ" (`h1` in `cities.py`). `/pooper-scooper/waddell-az/` and `/waddell/` forward there. A real Waddell page is the next step if Joe wants one: follow `docs/NEW_TOWN.md`.
- **Left alone on purpose:** the home page H1 still leads with Verrado and names four towns (Joe and Juan, Nov 12), and the share picture `og.jpg` shows the same four. The commercial pages and the commercial menu keep their own four area pages.
- **Plan names match the profile**, without dashes: Weekly pickup, Twice a week pickup, Every other week pickup, One time cleanup, Same day pickup, Deodorizing (free every visit). They are on the home plan cards (`_plans(onBand, google)` in `parts.py`, the second flag picks the names), the price tables, `/pricing/`, Terms, the schema and `llms.txt`. The sign up form, My Yard, the crew app and the emails keep Every week, Twice a week, Every other week. The form did not change by one word, so the opt in screenshots on `/texts/` still match it. No price changed.
- **Schema.** The business node has a new description, `makesOffer` with the six offers (it used `hasOfferCatalog`), the six towns, `hasMap` and `sameAs`, and the payment line without debit, to match the footer. The founder, the photos and the ZIP code places stayed, though the list's sample left them out. The plan offers point to `/book/`. One time and same day point to their own pages, because the sign up form cannot book them. The `/pricing/` page lists the same six offers. No street address anywhere.
- **Find us on Google is live.** The list said to hold the link until the real one was known. It is known: a live Google search from Buckeye shows our panel with the same ID, and the link opens "Arizona Pet Waste" with our phone, our site, our hours and no street address. It is one setting, `googleProfile` in `src/site.config.json`. Empty turns off the footer line, the contact line, the line on Areas we serve, `hasMap` and `sameAs` in one go. The profile also has an old twin: a closed "Arizona Pet Waste" in Vail, AZ with another ID. Never link that one.
- **`/book/`** keeps `noindex` and now has its own canonical and a small WebPage and LocalBusiness note, since the profile's Book button opens it.
- **Field desk session.** Nothing in `/crew`, `/t` or the server changed. The sign up form and My Yard got the same shared code with one new flag and look the same. The training video was not rebuilt.
- Checked: build and check pass with the sale on and off. `worker.test.mjs` 180, `week.test.mjs` 76. Town pages read at grade 2.9 to 3.2. Every visible dollar amount was compared page by page with the build before: the only change is the $49 line added to Terms. No sideways scroll at 320, 390 and 1280 on 15 pages. The sign up form was clicked through to step 3: same names, same two empty boxes.

### Nov 16, 2026, 2:30 am. Waddell has its own town page (website and AEO chat), Joe's ask
Joe asked for a real Waddell page, built like the other five town pages, with its own copy. It is live at `/pooper-scooper/waddell-az/`. This replaces the line in the note above that says Waddell has no page.
- **The page** comes from the same template as the others (`city.tpl.html`): `cities.py` (area `waddell`, page name `CityWaddell.dc.html`) and `longform.py` `TOWNS['waddell']`. Title "Pooper Scooper in Waddell, AZ | Arizona Pet Waste", one h1 "Pooper scooper service in Waddell, AZ", FAQPage (17 questions), a breadcrumb, and a Service with `areaServed` Waddell, ZIP 85355 and nine neighborhoods. It is in the sitemap (46 pages) and `llms.txt`.
- **The copy is its own.** It was written from sources, not copied from Citrus Park. Every fact and where it came from is in `research/waddell-sources.md`. Add no Waddell fact without a source. Reading grade 2.9.
- **Two facts to keep straight.** Waddell is a place name and a mailing address, not a city. Most of it is county land. Zanjero Pass is inside the City of Glendale (annexed), and Glendale city code says animal waste must be cleaned out of yards at least twice a week. So the old line "Waddell sits outside city limits" now reads "most of Waddell" on the commercial page and in the dog poop laws post, and that post names the Glendale rule and links both town pages.
- **Citrus Park is Citrus Park again.** Its h1 is back to "Pooper scooper service in Citrus Park, AZ". The six Waddell neighborhoods and the two Waddell questions moved to the Waddell page, so the two pages do not say the same thing. Citrus Park kept Clearwater Farms, Tara Estates, Russell Ranch and Savannah, and gained Montana Farms (it was already in `research/neighborhoods.json`).
- **Dropped from the old shared page, because no source backed them:** "Cortessa is a gated neighborhood" (only Laureate at Cortessa is confirmed as gated) and "some lots are a full acre".
- **Every Waddell link opens the new page:** the header menu, the phone menu, the footer, the 404 list, the card and the ZIP table on Areas we serve (85355 now lists both pages), the About page, the one time cleanup page, `llms.txt`, and a new "Waddell" button in "We also scoop near you" on the other five town pages. The home page has a new line under the map, "Read about your town", with a link to each of the six. `/waddell` and `/waddell-az` forward to the new page. The two redirects that started at `/pooper-scooper/waddell-az` are gone.
- **The map has six shapes now** (`truemap.build` takes six picks). Waddell is all of ZIP 85355. Citrus Park is its own shape on top, the same way Verrado sits on Buckeye. A town page lights only its own shape. Typing 85355 on the home page lights Waddell. On Areas we serve, the two shapes open the two pages. The commercial maps still have five shapes, because one commercial page covers both (`static_map` in `export_site.py` leaves the Citrus Park shape out there).
- **Left alone on purpose:** the commercial page stays one page for Citrus Park and Waddell. The sign up form did not change by one word (its town list still reads "Citrus Park and Waddell"), so the opt in screenshots on `/texts/` still match. `worker.js` did not change: 85355 was already served. No price changed. No street address. No "licensed".
- **Field desk session.** Nothing in `/crew`, `/t`, My Yard or the server changed, so the training video was not rebuilt.
- Checked: build and check pass with the sale on and off. `worker.test.mjs` 180, `week.test.mjs` 76. Every sentence and every dollar amount was compared with the build before. No sideways scroll at 320, 390 and 1280 on the new page, the other five town pages, home, Areas we serve, the commercial page and seven more.

## Nov 16, 2026: Verrado hidden in the home page Areas section (website session)
- Joe: Verrado is Buckeye, Buckeye is the main city. The home Areas section now names Buckeye, Goodyear, Litchfield Park, Citrus Park and Waddell (lead line, chips, Read about your town). The home map labels 85396 BUCKEYE and has no Verrado shape (`MAP_HOME`, `verrado=False`).
- Not changed: the Verrado page, its links in the header, phone menu, footer, Areas we serve, sitemap and llms.txt, the home page H1, the share picture, and every other map.

## Nov 16, 2026, later: five towns everywhere (website session)
- Joe: Buckeye, Goodyear, Litchfield Park, Citrus Park and Waddell are the towns. Verrado is in Buckeye. Every town list, menu, footer, schema town list, Areas card, blog line and map now uses five. `SIX` in `build/build.mjs` is now `AREA_TOWNS` / `TOWNS_TEXT`.
- The Verrado page stays live and linked (Buckeye page, 85396 ZIP row, About, one time cleanup, sitemap, llms.txt). Not changed: home H1, share picture, sign up form city buttons.

### Nov 16, 2026, 9:15 pm. One time pickup, from $99 (website and AEO chat), Joe's word
- Same day pickup ($49) and one time cleanup ($95) are merged into one service: **One time pickup, from $99**. A big job (a yard not cleaned in a long time, or a lot of dogs) gets a quote first: the customer texts a photo and we send the price before we come. Same day is the same service when we have a spot, at the same price.
- `content/site/same-day-dog-poop-pickup.html` is deleted. `/same-day-dog-poop-pickup/` sends people to `/one-time-dog-poop-cleanup/` with a 301. The one time page keeps its address, its title and h1 now say pickup, and it has a "Need it today?" section. Sitemap is 45 pages.
- Changed: pricing extras, the home and town price tables (`PRICE_TABLE`), the home FAQ, the town FAQs (`longform.py`), Terms, the schema (`makesOffer` has five offers, the one time offer has `minPrice` 99), the business description and `llms.txt`. `npm run check` fails on the old prices next to same day or one time.
- No checkout, server or crew app code sold these two, so nothing in `/crew`, `/t` or the worker changed. Every dollar amount in the old and new builds was compared: only the $49 and $95 lines moved.
- Joe still has to change the Google profile services: drop Same day pickup and One time cleanup, add One time pickup from $99.

### Nov 16, 2026, 9:20 pm. Gate photo by email when there are no visit texts (website chat, Joe's word)
- `doneMail` in `worker.js`: when a visit turns done with a photo, a customer who did not say yes to visit texts (or has no mobile number) gets an email with the `/t/CODE` link to the gate photo and a link to My Yard. Customers with visit texts get the queued text as before. Called from `crewDone` and from `officePhotoUpload` when that finishes a visit. Sent once, since both only run when the visit first turns done.
- `myStop` and `officePhotoUpload` now read the customer's email.
- `desk.test.mjs`: two new checks (no email for a texts customer, one email and no second text for a customer without texts). 111 of 111 pass. `worker.test.mjs` 180 of 180.
- Field desk session: nothing a scooper sees changed, so the training video was not rebuilt.

## Nov 16, 2026, 9 pm. Back buttons in the crew app, and a security pass with a patch (Field App chat), Joe's ask
Joe: "Say I click Leads, Customers. Is there a way to go back?" and "I just don't want anyone to be able to come in there and hack it. Don't overdo it."

### Back and home (`static/crew/index.html`, "moving around")
- **Back button, top left**, on every office screen that is not the Schedule. It always lands on the Schedule, on the day that was open. The Schedule is home, so it has no Back button.
- **The logo is a home button.** It opens the Schedule on today.
- **The phone's back button, the back swipe and the browser's back arrow all work.** Before this, one press left the app. Each screen is one step in the browser history on the same clean address (no `#`, no `?`).
- **The trail is short on purpose.** Any tab is one step from the Schedule. Leads, then Customers, then Money, then Back: the Schedule, not Customers. Plan the week is a step too.
- **A pop up or the customer panel closes first.** Back (or Esc on a computer) closes the top one and the screen under it stays put. The customer panel's Close button is now "Back", top left.
- **A back press by mistake does not drop a scooper out of a route.** On the first screen, Back shows "Tap back again to leave the app." A second press inside 3 seconds leaves.
- **Sign in:** back from the code step is the email step, with the email still typed.
- **A reload stays on the tab that was open.** On a phone the open tab slides into view in the tab strip.
- The scooper's own screen has no tabs and no Back button: nothing to get lost in.
- Code: `nav(tab, plan)` opens a screen, `goHome(keepDay)`, `goBack()`, `closeOverlay()`, one `popstate` listener. `go(t)` still works and calls `nav`. A new pop up needs a close button with one of the ids in `closeOverlay` (`#qn #fn #pn #cx #tx #hb #mx #dx` or `data-k="x"`), or Back removes it without running its close code.

### Security pass: what was checked and found clean
- Live database, read with the public key from outside: `customers`, `staff`, `leads` and `route_sheet` all answer with no rows (they hold 1, 1 and 3 rows). Row level security is on for every table. One policy in all: a signed in customer may read their own row. The gate photo bucket is private, 3 MB, pictures only. Supabase's own security check lists nothing but "no policies" notes (that is how we want it) and a password note (see the password hole below).
- Server, read line by line: every `/api/staff`, `/api/crew` and `/api/office` address checks the sign in on the server. A scooper can only touch a stop on their own route today. Office addresses refuse a scooper. Only the owner can change the team. Every value from a request that goes into a database address is a number, a checked date, a checked id or is escaped. The Stripe webhook checks the signature and its age. No cookies are used, so another site cannot ride a signed in session.
- Pages: every value from the database is escaped before it is drawn, in the crew app and on the truck link.
- Repo: no key in any file or in history that is on the server (`git grep` for Stripe, Supabase, Resend, Google, Twilio and GitHub key shapes). `npm audit`: 0. The two GitHub workflows take no outside input.

### What was found and patched (all in this commit)
1. **A password could get around the emailed code.** Supabase lets anyone set a password on an email that has not signed in yet. A stranger could do that to a new hire's or a new customer's email, wait for the real person to sign in with a code (that makes the account real), then walk in with the password. The owner's account also has a password set in Supabase. Fix: `signedIn` refuses any sign in that came from a password (`passwordSession` reads the `amr` list in the token), for staff and for My Yard. Nobody here signs in with a password, so nothing breaks.
2. **Code guessing from many addresses.** The brake from Nov 9 counts per visitor address in one server's memory. New: a lock per staff email kept in the database (table `auth_tries`): 5 wrong codes in 15 minutes and that email waits, from any address, on every server. Code emails for one staff email stop at 3 in 15 minutes and 15 a day, so nobody can flood an inbox. The answer to "email me a code" stays the same either way. A good sign in clears the count. The nightly job clears old rows. If the table is missing, a count in memory takes its place and sign in still works.
3. **A script slipped into the page could have run.** `/crew/` now sends a script rule (`Content-Security-Policy`, built in `build.mjs` as `CREW_CSP`): only the app's own script may run, named by its hash, which the build works out on each run. A script hidden in a customer name, a lead or a note cannot run, so it cannot take a session. Google Maps and the Cloudflare bot check still load, because the app's own script loads them. **If you add a second `<script>` tag to the crew page, the build picks it up. Never load a script from another site with a tag, and never add `onclick=` and the like in the page: they will not run.**
4. **No size cap on what a request may send.** Now 100 KB for forms, 1 MB for Stripe, 6 MB for a gate photo (`maxBody`, `readText`). Checked by the stated size and again while reading.
5. **Second lock on the tables.** The two public keys had every table right and only row level security stood in the way. `crm.sql` now takes the rights away (customers keep the one read their policy needs) and new tables start closed. Belt and suspenders.
6. Small: the cron secret is compared in a way that does not leak timing. The Health tab has two new rows: "Lock on wrong sign in codes" and "Bot check on sign in".

### The patch file is on the live database (Nov 16, 9:40 pm)
- Joe told Claude to run it, and this time the database tool took it (migration `security_patch_2026_11_16`). Checked after: `auth_tries` is there with row level security on, the two public keys hold one table right in all (signed in customers may read `customers`), `customers.skips` is there, and the Health tab reads "Lock on wrong sign in codes: On". So My Yard skips no longer fall back to a text. `supabase/patch-2026-11-16.sql` stays in the repo as the record. Nobody needs to run it again.

### Dashboards, done Nov 16, 10 pm (Joe signed in to Cloudflare and Supabase in Chrome, Claude did the clicks)
- **Cloudflare rate limit rule is live.** Security, Security rules, Rate limiting rules: "API flood brake". Match: `(starts_with(http.request.uri.path, "/api/") and http.request.uri.path ne "/api/stripe-webhook")`. One visitor address, over 100 requests in 10 seconds: blocked for 10 seconds. The free plan allows one rule and only the 10 second period. The Stripe webhook is left out on purpose, so a billing day with many events from one Stripe address is never blocked. Tested from Joe's computer: bursts of 80 requests got 429 on the second burst, and the site answered again 14 seconds later. The rule showed 12 events. Normal use is far under the line: the truck link asks every 15 seconds, the crew app every 15 to 30.
- **Sign in code life is 10 minutes** (Supabase, Sign In / Providers, Email, "Email OTP expiration" 600, it was 3600). Code length is still 6 digits. Both email templates (Confirm sign up, Magic link or OTP) now say "It works for 10 minutes." `GO_LIVE.md` matches.
- **Supabase token verification limit:** 30 per 5 minutes for each address. Left as is.

### NOT done, needs a person
- **Captcha in Supabase is OFF** (Authentication, Attack Protection, "Enable Captcha protection"). The site key is in Cloudflare, so the bot check shows on our sign in screens, but Supabase does not ask for it yet, so it stops nobody. Turning it on means pasting the Turnstile secret key, and Claude does not type keys. Steps for a person: Cloudflare, Turnstile, open the widget for arizonapetwaste.com, copy the secret key. Supabase, Authentication, Attack Protection: turn on Captcha, pick Turnstile, paste the key, Save. Then sign in once at `/crew` and once at `/account/` right away. If no code email comes, turn the switch back off. The Health tab row was reworded so it no longer claims more than is true.
- When someone leaves the company: Team tab, tap Off next to their name. Their phone is signed out on its next tap. There is no other step.

### Left alone on purpose
- No script rule on the public pages, My Yard or the truck link. Those pages have many small scripts and Google Tag Manager, and no staff session lives there. Doing them is a bigger job with real risk to sign up, days before first visits.
- Truck link codes stay at 6 letters (729 million). A guess from one address stops at 120 a minute.

### Tests
- New: `build/nav.test.py` (68 checks in a real browser at phone and computer size: every tab and Back, the phone back button, pop ups, Plan the week, sign in, the scooper screen, a full yard, and four ways to slip a script in, all blocked). It runs the built site through the new `build/serve.mjs`, which serves `dist/` with `_headers`, `_redirects` and the server the way Cloudflare does. **Restart `serve.mjs` after each build: it reads the headers once, and an old script hash blocks the app.**
- `desk.test.mjs`: 134 pass after the rebase on the website chat's gate photo email commit (23 new: the lock, the code email cap, the size cap, password sessions, table rights, the patch file run twice, the lock table missing).
- Also run and passing: `npm run build`, `npm run check`, `worker.test.mjs` 180, `week.test.mjs` 76, `signup10` 40, `signup50` 123, `signup50` at 500 sign ups 138.
- Not run: the new code with a real staff sign in on the live site (it needs a code from the info@ inbox).

### Checked on the live site after the push (Nov 16, 9:45 pm, in the Claude browser pane)
- `/crew/?demo` at phone size: every tab shows Back, Back and the phone back button land on the Schedule, the customer panel closes on back, the logo goes home, Plan the week shows Back, no sideways scroll.
- The pane was already signed in as staff, so the real app was checked too, reading only: Schedule, Health, Back, Leads and the phone back button all work. Health reads Field desk On, Online sign up On, Live truck map On, Bot check On, Lock on wrong sign in codes Off at that moment (it reads On since the patch ran at 9:40 pm).
- The Google map in Plan the week draws under the new script rule. Scripts slipped into the page three ways did not run. Six staff, office and My Yard addresses answer 401 with no sign in. A made up password token answers 401. A 150 KB form post answers 413.
- One thing the script rule blocks on `/crew/` that is not ours: Cloudflare's own visitor counter (`static.cloudflareinsights.com/beacon.min.js`), which Cloudflare adds to pages by itself. It shows as one red line in the browser console and nothing else. The staff app does not need it. The public pages still get counted.
- Not proven: a fresh staff sign in with the bot check under the new rule. The bot check script loads and nothing is blocked, and Cloudflare's own page says it needs only `script-src` and `frame-src` for `challenges.cloudflare.com` and works with `strict-dynamic`, which is what we send. But the bot check gave no token in the Claude browser pane, with or without the rule (it wants a person). **Next time a person signs in at `/crew` with a code, that is the proof. If no code email comes, this rule is the first place to look: take the `Content-Security-Policy` line out of `/crew/*` in `build.mjs` and push.**

### Training video
- Rebuilt, 2 min 51 s, in both places. New clip after the Schedule: "Back is top left". The new header (Back button) is on every screen that has it. Made with `docs/video/patch_header.py`: old screens and voice lines kept, new header pasted in, because this chat cannot reach the live site or Google to retake the map screens. `lines.json` has the new line. The training page has a new office step and two new Help rows.

### Nov 16, 2026, 9:45 pm. Sign up rebuilt on Joe's word (website chat). Field desk session: read this, the server changed.
Joe asked for five things in a row. All are live.
1. **One text box.** Sign up step 3 and My Yard have one box, "Text me about my visits." with a red "* Recommended". The small words name visit texts and deals. Checking it saves both `texts_visit` and `texts_deals` (two `consent_log` rows as before, both with the new words). It is optional and never checked for the customer. Joe first asked for it to be a must click. It cannot be: text consent cannot be a condition of buying (TCPA) and Twilio refuses a required box. He picked the optional red star version. In My Yard, a customer who said yes to visit texts only (two box days) keeps that until they tick the box again themselves.
2. **Gate photo by email** (earlier note above): a customer with no visit texts gets the photo link by email, so "no photo, that visit is free" still holds.
3. **No email code at sign up, 4 steps.** A new customer goes city, dogs and plan, about you, card. `checkout` with no sign in makes the account (`newAccount`: Supabase admin create user, no session) and opens the card form. `checkoutDone` with no sign in takes the Stripe card form id as proof. The page never gets a session. The welcome email has a 7 day My Yard link (`yardLink`: customer id, expiry, HMAC with the service key; `/api/me/link` checks it, asks Supabase for a one time email token with the admin API (`generate_link`, nothing is emailed) and trades it for a session with `/verify`, so the sign in is an email token and passes the field desk session's new rule that refuses password sign ins. No password is set on any account. The session is thrown away unless it is for that very customer). `/account/?k=...` uses it. An email with a plan (any status), a staff email, or an account with no sign up row gets `use_code` and the old 6 digit code screen. The done screen says "Check your email" for the link. A sign up that never finished (row at `checkout`, no plan) is picked back up by email with no sign in: the row is rewritten with what was typed, nothing is handed back.
4. **The 60 day rule is off.** No page, email or card form says "keep your plan 60 days". `freeMonthCharge` returns at once unless `EARLY_CANCEL` is `on`, so nobody is charged for canceling early. New plans carry `pause_from` (the same date) and no `min_end` or `min_label`. `minEndOf` reads `pause_from` first, so pausing still opens after the first 60 days. Terms lost the two early cancel paragraphs. `npm run check` fails on the old wording.
5. **Street address suggestions.** `/api/address?q=&s=` and `/api/address/pick?id=&s=` call Google Places API (New) with `GOOGLE_MAPS_SERVER_KEY`, kept to a box around our towns, 150 calls per visitor per 10 minutes. Picking fills the street and the ZIP (and skips the "which ZIP" question). An address outside our ZIP codes is not taken and points to the waitlist. If Google refuses the key, the list is empty and one note goes to the Health tab.
- Also live from earlier tonight: One time pickup from $99 (same day and one time merged).
- New optional Cloudflare settings: `TURNSTILE_SECRET_KEY` (bot check on the card step; the page only runs the check when both Turnstile keys are set, `botCheck` in `/api/config`), `EARLY_CANCEL` (leave unset).
- Rebased on the field desk session's 9 pm security push. Its size cap, password rule and code lock are all kept. `worker.test.mjs` fails if this server ever sets a password or signs in with one.
- Twilio: the opt in proof changed (one box, step 3 of 4). `/texts/`, both screenshots, privacy and `GO_LIVE.md` part 10 match the new form. The campaign has to be sent in again with the new text.
- Crew app, truck link, week planner: no screen changed, so the training video was not rebuilt. The office "New booking" email is the same.
- Checked: `worker.test.mjs` 210, `desk.test.mjs` 134, `signup10` 40, `signup50` 125, `week.test.mjs` 76, build and check with the sale on and off. A real browser at phone size clicked through both paths (new email: no code, card, done; known email: code, card, done), the address list, an out of area address, and the My Yard link (28 and 8 checks).
- Not checked, needs live keys: the Supabase admin calls and the Places call against the real services. After the push: run one `/book/?test=1` sign up with a new email, tap the link in the welcome email, and type a street on step 3.
- Left alone: privacy still lists Google Fonts and Mapbox, which the site no longer uses. Fix on the next privacy edit.

### Nov 16, 2026, 10:15 pm. Deals texts are out of the sign up box (website chat). This replaces point 1 of the note above.
- Twilio turns a campaign down when one box covers visit texts and deals: error 30913, "Marketing and informational consent must be separate" (https://www.twilio.com/docs/api/errors/30913). Joe asked for one merged box. That would have failed the campaign he is waiting on, so the merge was taken back within the hour.
- **Sign up: one box, visit texts only**, "Text me about my visits." with the red "* Recommended". `checkout` saves `texts_deals: false` no matter what a page sends, and the consent record for deals says it was not asked.
- **My Yard: two separate boxes again**, visits (Recommended) and "Text me deals too." Both unchecked for a new customer. The welcome email has one line that points to the deals box.
- `/texts/`, privacy, `CONSENT`, `GO_LIVE.md` part 10 and three screenshots match (new: `sms-optin-myyard.png`, made by `build/optin-shots.py` from the sample account).
- Checked: `worker.test.mjs` 212, `desk` 134, `signup10` 40, `signup50` 125, build and check with the sale on and off, the two browser flows (28 and 8).

## Nov 18, 2026, 10:30 am. The dog picker is back on the home page, above the price list (website and AEO chat), Joe's ask

Joe, after the plain price list went live: "I like the update on the poop thing, but I need the slider for the dogs still. They need to be able to pick how many dogs they have. Put that back."

- The minus and plus buttons with the dog faces are back, under a plain question: "How many dogs do you have?" 1 to 6 dogs, 2 to start.
- The three plan rows on the home page follow the dog count: 3 dogs reads $28 a week and "We bill $121 once a month." for weekly, $47 and $202 for twice a week, $19 and $84 for every other week. Same prices as before, nothing changed.
- Book now opens sign up with that row's plan and that many dogs (checked: twice a week with 3 dogs).
- The rows on the home page are drawn by the page (`plans` in `main.tpl.html`). `/pricing/` keeps the fixed list for 1 or 2 dogs (`PRICE_LIST`). The one time row is one piece for both (`PRICE_ROW_ONCE`). If a line of words changes, change it in both places.
- **Do not take the dog picker off the home page.**
- `npm run check` passes with the sale on and off, `worker.test.mjs` 505 pass, looked at in a real browser at 320, 390 and 1280 wide.

## Nov 18, 2026, 10:15 am. A plain price list, four main cities in the H1, payment marks in the footer (website and AEO chat), Joe's asks

Joe looked at a competitor's services page (a name, one line, a price, a Book button for each service) and said: "don't change the pricing. Just look at our prices, and I want to have shit like that", "It's simplicity, simple", "it still seems confusing". Then: "let's take Verado out in the front. Do Citrus Park, Buckeye, Goodyear, and Litchfield Park. Those are the four main cities." Then: payment icons under Payment options, and "We don't do cash, Venmo, Cash App, Zelle".

### The price list
- The home page price section is one plain list now: Weekly pickup, Twice a week pickup, Every other week pickup, One time pickup. Each row has the name, one line ("We come once a week."), the price ("About $25 a week", "We bill $108 once a month.") and a button. The dog picker, the plan picker and the big number are gone from the home page. **No price changed.**
- `/pricing/` shows the same list in place of its two tables (`<!--PRICE_LIST-->` in `content/pages/pricing.html`, filled from `content.pricelist`). The list is written once: `PRICE_LIST` in `parts.py`.
- A Book now button opens sign up on that row's plan. The link is `/book/?plan=week`, `twice` or `eow`. On a page with the sign up sheet, `apw.js` reads the plan off the link. With no script the link opens `/book/` on that plan, as it always could.
- One time pickup: "From $99", button "Text us" (it is booked by text).
- One line under the list: the sale, the price of each dog after two, no sign up fee, no long term contract.
- Left off on purpose, Joe's words: "Limited service areas", "Restrictions may apply", "Deposit required". And no joke services.
- Deodorizing: it is in the lead above the list ("Deodorizing is included free with every visit, on rock and turf yards alike."), since the competitor sells it. No separate sanitize treatment.
- `/pricing/` has one new line: "Coming in December: a disinfectant treatment." Joe said it is coming. It has no price yet and nothing sells it.
- **Not done, needs Joe:** "Some yards may require an initial cleanup fee." The site says "No sign up fee" and tells people to ask other companies about a first cleanup fee, and checkout has no such charge. Adding the line would add a fee. He has to say yes and name the amount, and then the words, checkout and the office all change together.

### The H1 and the share picture
- Home page H1: "Dog Poop Pickup Service in Buckeye, Goodyear, Litchfield Park and Citrus Park, AZ". Verrado is out. Joe said the four cities with Citrus Park first. They are written in the order the site uses everywhere (Buckeye first, it is the main city).
- The share picture (`static/assets/img/og.jpg`, made again with `design/share/make_og.py`) and its alt text say the same four.
- Town lists everywhere else still name five, with Waddell. The sign up form city buttons are unchanged (Twilio screenshot).

### Payment marks
- Footer, under Payment options, every page: Visa, Mastercard, American Express, Discover, Apple Pay and Google Pay, each on a small white tile, three to a row. `PAY_MARKS` and `payHtml` in `build/build.mjs`, `.fmarks` in `look.py`. The files are from the same open logo library as the Google G (`static/assets/img/brands/README.txt`).
- The line above them now ends "We do not take cash, Venmo, Cash App or Zelle."
- Joe sent a screenshot link (gyazo) as the model. It could not be opened from the build machine, so the layout is the plain one. If his picture shows something else, change `.fmarks`.

### Tests
- `npm run check` passes with the sale on and off. `worker.test.mjs`: 505 pass.
- In a real browser at 320, 390 and 1280 wide: no sideways scroll on the home page or `/pricing/`. Each Book now button opens sign up on its own plan (week, twice, eow). `/book/?plan=twice` opens on twice a week.
- Nothing changed in the crew app, the office, My Yard, the truck link or the sign up form.

## Nov 18, 2026, 10 am. Social buttons in the footer and the Google G by the stars (website and AEO chat), Joe's ask

Joe sent a Google G and the links: "please put social media buttons on the bottom too, give them their color: Facebook, Instagram, Yelp", "the footer needs to be legit and clean".

- **Footer, every page:** three buttons under the contact list, 48 px, 12 px corners: Facebook (white mark on Facebook blue), Instagram (its full color mark), Yelp (white mark on Yelp red). Each opens our profile in a new tab. `socialHtml` and `SOCIAL` in `build/build.mjs`, `.fsoc` in `look.py`. A button shows when its logo file is in `static/assets/img/brands/` AND its link is in `"social"` in `src/site.config.json`. TikTok and Nextdoor are wired the same way and wait for a file and a link.
- **The links:** `https://www.facebook.com/people/Arizona-Pet-Waste/61596094812133/`, `https://www.instagram.com/azpetwaste/`, `https://www.yelp.com/biz/arizona-pet-waste-buckeye`. The same three are in `"sameAs"`, so the business data on every page names them (with the Google profile first).
- **The G:** `static/assets/img/brands/google.svg` shows in front of the stars in the home page hero.
- **Where the logo files came from:** Joe's link to the G (a picture site) could not be opened from the build machine, so all four are from open logo libraries on npm, written out by a script with no change to the shapes. `static/assets/img/brands/README.txt` lists each file, its package and its license. Nobody drew a logo. A file from the company's own brand page can replace any of them under the same name.
- **Footer contact lines:** the two lines that both read 623.309.6104 now read "Call 623.309.6104" and "Text 623.309.6104".
- **Not checked:** Yelp and Facebook refuse automated readers, so nobody has looked at those two pages from here. The rule is never link a page that shows a street address. **Joe or Atlas: open the Yelp listing and the Facebook page and make sure neither shows the street address.** If one does, hide it there (Yelp for Business, Business information, hide address).
- **Tests:** `npm run check` passes with the sale on and off, `worker.test.mjs` 505 pass. Footer looked at in a real browser at 320, 390 and 1280 wide on the home page and a town page.
- Nothing changed in the crew app, the office, My Yard or the truck link.

## Nov 18, 2026, 9 am. The home page is cut to about half, and a 5 star Google line is in the hero (website and AEO chat), Joe's ask

Joe looked at a ten year old competitor's site (poodini.com: 315 words on the home page, 550 Google reviews) and said: "Condense it: minimalist feel, keep it short, direct, simple. FAQ questions are great, but it needs to be simpler. There's just too much going on." And: "put 5 stars with a little Google sign for reviews."

### What changed on the home page
- Words a visitor reads on a phone: about 1,270 before, about 725 now. The page is a third shorter on a phone (14,700 px to 9,900 px).
- Hero: the paragraph is two short lines. Under "Insured and bonded." there is one new line: five stars and "5.0 on Google", a link to our Google profile.
- The promise sign: one paragraph, not two.
- Prices: the picker, the big week price, the bill line, the button, the "In every price" line and a link, "See every price", to `/pricing/`. Gone from the home page: the Black Friday coupon with its clock (the orange bar at the top of every page still has the clock), the pounds of poop line, the two small notes and the fold out price table.
- How it works: three steps, not six, with no step photos (the phone with our videos shows the work). A link, "See every step", opens `/how-it-works/`.
- Gone from the home page: the three photo row and "What you get with every visit". Town pages keep their photo row.
- Meet Juan: two lines and the link.
- Areas: the map, the five town buttons, the links. The ZIP box is gone from the home page (sign up asks for the city). "Coming soon" is one line and the waitlist button.
- Questions: six, not 23. "See all questions" opens `/faq/`. The six: cost, when the card is charged, how to cancel, picking a day, where the poop goes, bonded and insured.
- "Black Friday" is on the page 8 times now, not about 12.

### Nothing was lost for Google or AI search
- `/faq/` and `llms.txt` still carry every question (33). They read `FAQ_ITEMS`, which did not change.
- The home page FAQPage data lists the six questions the page shows, so the data matches the page (`content.faq.home`).
- The H1, the title, the description and every H2 that stayed are unchanged. Left alone on purpose: the H1 still names Verrado and three towns (Joe's open call).

### Where it lives
- `design/generator/main.tpl.html` (the page), `parts.py` (`FAQ_HOME`, picked from `FAQ_ITEMS` by the question, so an answer is written once, and `SOON_NOTE`), `look.py` (two small rules), `export_site.py` (`faq.home`).
- The star line: `ratingHtml` in `build/build.mjs`, fed by `"googleRating"` in `src/site.config.json` (`stars`, `count`, `checked`). It is typed in by hand from the live Google profile: 5.0 with 2 reviews on November 18, 2026. **Update it when the profile changes, and never type a rating the profile does not show.** The count is written on the page from 5 reviews up. The older quote block (`"reviews"`) still works and takes the slot when a real review is typed in.
- The "little Google sign": not on the page yet. The repo rule is official logo files only, never redrawn, and there is no Google file in `static/assets/img/brands/`. Drop Google's own "G" file there as `google.svg` (or .png, .webp) and it shows next to the stars on the next build. Until then the line says the word Google.

### Tests
- `npm run check` passes with the sale on and off. `node build/worker.test.mjs`: 505 pass.
- Looked at in a real browser at 320, 390 and 1280 wide: no sideways scroll, a question opens, a town button lights the map, the plan picker and the dog buttons change the price, Book now opens the sign up sheet.

### Field desk session
- Nothing changed in the crew app, the office, My Yard or the truck link, so the training video was not rebuilt.

## Nov 17, 2026, 10 am. My Yard: no deals box, card and cancel go through the office, a truck button on visit day (website chat), Joe's ask after he signed up himself

Joe signed up as a customer and looked at My Yard. His words: take out "Text me deals too". Skip a visit is fine, keep it. Pause is fine. Bills and card: "Call the office, and we can cancel that for you or change a card out. I don't want to give them the opportunity to do this yet." Then: "It needs to be so easy for the older population. We're treating 70 year olds." And he asked how a customer sees the truck.

- **Deals box out.** My Yard has one text box, the same visit box as sign up. No screen asks for deals texts. `meSave` no longer reads `texts_deals`, so a save never changes it. The welcome email lost its deals line. `/texts/`, Privacy and Terms say we do not send deals texts. New `sms-optin-myyard.png` (one box), linked with `?v=2`. `GO_LIVE.md` part 10 has a new opt in text (service texts only) and new samples: the old sample 4 was a deals text and must come out of the Twilio campaign. Atlas has to send the campaign in again with that text.
- **Card, bills and cancel: call or text the office.** One switch, off: `SELF_SERVE` in `worker.js` and `"selfServe"` in `src/site.config.json` (a test holds them together). Off means: My Yard shows "Call or text us. We change your card, send you a bill, or cancel for you." with Call and Text buttons, `portal` answers 403 with that line, `meInvoices` answers an empty list. Every page that said "cancel in My Yard" or "no phone call" now says "Cancel anytime. Call or text 623.309.6104." through a new copy tag, `[[self:on||off]]` (see `CLAUDE.md`). That is the pay step, Stripe's note (`cancelText`), the welcome email, the FAQ, Terms, Privacy, Our promise, About, Contact, one blog post and `llms.txt`. The button in a failed card email (`/api/card`) is untouched: it opens the card page only.
- **Truck button.** `/api/me/visits` now also answers `today: { code, status }` for the customer's own stop today, or null. My Yard shows "We come today." or "We are on the way." with one big See our truck button to `/t/CODE`. After the visit: "Your yard is done." and See my gate photo. One read of `stops` by `customer_id` and `day`, nothing written.
- **Bigger words in My Yard.** Form labels 17 px, fields 18 px, box words 18 and 16 px, small print 15 px, buttons 48 px tall.
- Checked: `worker.test.mjs` 505 (new: the closed routes, the two switches match, a save never touches deals, the truck link is the customer's own), build and check with the sale on and off and with self serve on and off, My Yard in a real browser at 320 and 390 wide with no sideways scroll.

**Field App chat, these are for you. Joe wants the two chats to talk, so answer here.**
1. How a customer finds the truck today: the "on the way" text (`textBody`, `queueText`) carries `/t/CODE`. It only goes to customers who checked the visit text box, and it waits in the office Texts tab until a person sends it, because Twilio is not approved. A customer with no texts got nothing until the done email. Now My Yard has the button too. Nothing in `/crew`, `/t` or `crm.sql` changed.
2. Joe's question was "Does that text from Field Tool?" Yes: `advance` queues it when the scooper starts driving to that yard. If the office does not send queued texts fast, the "on the way" text is late or never goes. Worth a look on your side: can the office Texts tab make that one harder to miss on visit day?
3. The office now takes every cancel and card change by phone, and the office app has no button for either. Today that is the Stripe dashboard (cancel at the end of the period, or add a card on the customer and make it the default). A "Send card link" button on the customer screen (it would email the customer the same `/api/card` link the failed card email uses) and a "Cancel at end of month" button would keep the dispatcher out of Stripe. Your lane, Joe's call.
4. Joe's rule for every customer screen: easy for a 70 year old. Big words, big buttons, one job per screen. Please hold the truck link page (`/t`) to that too.
5. The site says in a few places: Tap "Something's off" in My Yard. My Yard has no such button and neither does `/t`. Not changed here. If you have it planned, say so, or the words come off the site.

## Nov 17, 2026, 9:15 am. A real sign up failed with "Checkout did not load". A Stripe customer that was deleted is now replaced (website and money rules chat), Atlas's report

### What happened
- 8:45 am, live site. A person typed their details, reached the card step and got "Checkout did not load. Something went wrong on our side." The Health tab line was `stripe 400 No such customer: 'cus_...'`.
- They had opened the card step the night before (November 16, 9:17 pm), so their row was waiting at `checkout` and held a Stripe customer id. That Stripe customer was deleted in the Stripe dashboard in between. When they came back with the same email, `newAccount` handed their row back (that is right), and `checkout` asked Stripe to update the saved customer.
- Stripe answered with HTTP 400 and the code `resource_missing`. `checkout` only took a 404 for "this customer is gone", so it threw, and the page got a 500.
- Nothing was charged and no plan was made. Their row is still at `checkout`. When they try again, it works.

### The fix (`src/worker/worker.js`)
- **`stripeGone(e, param)`**: one test for "Stripe no longer has this id". True for a 404, and for any status with the code `resource_missing`. With `param` (for a request that names the id in a field, like `customer`), only a "missing" about that field counts. Use this, never a bare 404.
- **`checkout`**: the update of the saved customer now reads all three answers as gone: a 404, a 400 `resource_missing`, and a 200 with `deleted: true`. Then one new Stripe customer is made with the same name, email, phone and address, the row takes its id, and the Health tab gets one line ("A sign up's saved Stripe customer was gone, so a new one was made", three an hour at most, "Nothing to do").
- **A second net in `checkout`** (`custGone`, `remake`): if the update goes through and Stripe only says "No such customer" at a later step (the list of plans in a pay today sign up, or the card form itself), a new customer is made there, the row takes its id, and that step is asked for again. Once per try. This chat has no Stripe key, so it cannot see which of Stripe's answers a deleted customer gets on each call. Both are covered.
- Any other refusal from Stripe is still an error and never makes a second customer (test: a refused email).

### Every place that asks Stripe about a saved id
| Place | Before | Now |
| --- | --- | --- |
| `checkout`, update of the saved customer | 404 only, else a 500 | replaced by a new customer |
| `checkout`, list of plans and the card form | a 500 | replaced by a new customer, asked again |
| `checkoutDone`, the card form id | 404 only | a 400 `resource_missing` is "Something was missing" too |
| `portal` (Change card in My Yard) | a 500 | "We could not find a card on file. Call or text 623.309.6104 and we will help." and one Health line |
| `meInvoices` (bills in My Yard) | a 500 | an empty list |
| `mePause`, `meResume` (the saved plan id) | a 500 | "We could not pause this plan." or "We could not start this plan again.", with our number, and nothing is changed |
| `product` (price setup) | 404 only | `stripeGone` |
| `cardGo` (the link in a failed card email) | already safe | lands on My Yard sign in |
| `planInfo` (My Yard) | already safe | My Yard loads without it |

### Left alone on purpose
- **The webhook.** Every Stripe call it makes uses the id that came in the event, not one read from a row. A customer deleted in Stripe has their plans canceled by Stripe, and that arrives as `customer.subscription.deleted`, which already sets the row to `canceled`.
- **`billPaid`** reads the saved plan id with no catch. A plan Stripe canceled stays readable, so this only fails for an id from other keys. If it ever does, the webhook answers 500, Stripe sends the event again and the Health tab shows it. Guessing a status there would be worse than failing out loud.
- **`setDogs`** (the office changes the dog count) is the same and is field desk code. Field desk session: if you want it to say something kinder than an error, `stripeGone(e)` is there to use.
- No new webhook event. `customer.deleted` is not one of the seven, and the fix does not need it.

### For the people who work in Stripe
- Deleting a customer in the Stripe dashboard is safe for sign up now: the next visit makes a new customer. It still cancels that customer's plans in Stripe, at once and for good, so only delete one that should lose service.
- A row at `checkout` whose Stripe customer was deleted needs nothing. It heals on the next visit.
- Never make a plan by hand in Stripe for someone the site lost. They sign up again on the site.

### Tests
- `build/worker.test.mjs`: 499 checks, 501 with `STRIPE_SPEC` (102 kinds of field on 27 kinds of request, 727 requests, none refused). 91 are new.
- New section "A saved Stripe customer that Stripe no longer has": the pretend Stripe now answers the way the real one did (`S.lost`: `r400`, `r404`, `deleted`, and `ghost` for a customer Stripe only disowns at the next step). A deleted customer gets a 200 with a `clientSecret`, one new customer, the old id is asked for once and never again, one Health line, one plan. The same for pay today. A refused email is still a 500 with no second customer. Change card, bills, the card link, pause, start again and an unknown card form id.
- New section "Abandoned checkout": the same email comes back the next morning with no sign in. Three cases (the saved customer is still there, it was deleted, the old card form has expired), each for the free month and for pay today. Each gets a card form that works, one row, one account, one Stripe customer in use, one plan, one welcome email. Finishing the old card form as well starts no second plan. One more visit after booking gets the code and makes nothing.
- The new checks were run against the server as it was live (`2991a64`): the deleted customer case fails there with the same line the Health tab showed.
- `week.test.mjs` 76, `signup10` 40, `signup50` 131, `desk` 134, `nav.test.py` 68, `npm run check` passes.
- **Not run against the real Stripe.** This chat holds no Stripe key. The proof on live is the next person who comes back to a row whose customer was deleted: they get the card form, and the Health tab shows the "was gone" line.

### Field desk session
- No screen changed in the crew app, the office or the truck link, so the training video was not rebuilt.
- The Health tab can show two new lines: "A sign up's saved Stripe customer was gone, so a new one was made" (nothing to do) and "A customer tapped Change card, and Stripe no longer has their customer".

## Nov 17, 2026, 1:30 am. Pause charges the full month on the return day, and a branded failed card flow (website and money rules chat), Joe's decisions through Atlas
Joe's decisions, passed on by Atlas at 10:49 pm on Nov 16: (1) leave the free month deal and the December 1 switch as they are, no copy changes before then. (2) Bill the full price on the same day of the next month after sign up, no proration, no 1st of the month. That shipped as `ffdc9c5` (the 11:45 pm note below). (3) "Pause: when a paused customer comes back, charge the full month on the day they return, and that becomes their new billing date. No proration." (4) A branded failed payment flow: a friendly email to the customer with a link to update their card, an alert to info@ for every failed try (name, address, amount, try number), "PAUSE SERVICE" to info@ after the last retry, Stripe Smart Retries plus our webhook, and no automatic cancel. (5) Referral reward and Google Search are on hold.

### Pause
- **The rule as built.** No bill goes out while paused, and nothing is prorated. A pause that ends before the next bill day changes nothing about money: Stripe's own pause (`pause_collection`), and the bill day stays. A pause that runs to or past the bill day skips that bill, Stripe charges the full month on the day they come back, and that day is the bill day from then on.
- **How Stripe is told.** For a pause that skips a bill, `mePause` sets `trial_end` to noon Arizona time on the return day with `proration_behavior: none`, and keeps `pause_until` and `paid_until` on the plan. This is the recipe in Stripe's own billing cycle guide ("change the billing period using a trial period"): the old bill day is not billed, the full period is billed at the trial end, and that day is the new anchor. No `billing_cycle_anchor`, no proration. Stripe shows such a plan as Trialing, so `planStatus` is what tells a pause from a free month: every place that reads a plan's status goes through it.
- **Back early.** `meResume`: before the month they paid for runs out, `trial_end` goes back to the old bill day and nothing is charged. After it, `trial_end: now` charges the full month that day. When Stripe ends the pause on its own (the return day comes), the webhook books them back in (`pauseOver`).
- **What the customer is told, before it happens.** My Yard's pause panel says it in plain words with their bill day and price. Pausing sends "Your visits are paused until (day)" with what happens to the bill. Coming back sends "Welcome back" with what was or was not charged. The office gets "Paused" and "Back from pause" emails with the same facts.
- **One call made here.** Joe said "charge the full month on the day they return". A customer who is back before their bill day is NOT charged that day: they already paid for those days, and a second full month a week later would bill the same days twice. Say the word and it charges on every return.
- **Statement line.** Stripe adds "* TRIAL OVER" to the card statement on the first charge after a trial. For a return charge the server sets the statement line to ARIZONA PET WASTE on the bill while it is a draft (`pauseTidy`).
- **Know this.** If Stripe's trial reminder email is on, a customer whose pause skips a bill gets it 7 days before the return day. The date and amount are right. The words say "trial".
- **Nobody can pause before January 19, 2027** (pausing opens 60 days after the soonest start day). The path has only been run against a pretend Stripe. `GO_LIVE.md` part 5 has a test clock run for a person.

### Failed card
- **Stripe retries, the site tells.** Smart Retries do the retrying. The server never cancels a plan over a failed payment.
- **Customer.** First failed try: on hold (`past_due`), off new routes, a branded email "Your card did not go through" with an Update my card button, and one queued text. While Stripe keeps trying: a reminder at most every 5 days. When Stripe stops: "Last notice: your visits are on hold". If Stripe canceled the plan: "Your plan has ended", with no button. Paid: "Your payment went through".
- **The button.** `cardLink` makes `/api/card?k=` (the customer id, an end time 30 days out, and a signature). `cardGo` checks it and sends the browser to a Stripe customer portal session that opens straight on the card page (`flow_data: payment_method_update`). No sign in. The new card becomes the default, and the `customer.updated` event that follows pays the open bill on it. A bad or old link lands on `/account/?card=old`, which says so.
- **Office.** Every failed try: "Card failed: name, address ($amount, try N)" with the facts, when Stripe tries again, and what the customer was sent. When Stripe stops: "PAUSE SERVICE: name, address ($amount unpaid after N tries)" with what to do.
- **The last try.** It is the try after which the bill has no next try. With plain retry settings Stripe sets the next try before it sends the event. Stripe's page on retries says an account on automations gets it a moment later, in `invoice.updated`. So when the bill shows no next try the server looks two more times, 2.5 seconds apart, before calling it the last: a wrong last notice on a first failed try would scare a customer for nothing. A plan that Stripe marks unpaid, pauses, or cancels over the payment counts as the last try too.
- **Told once.** What was told is kept on the Stripe bill (`apw_try`, `apw_mail`, `apw_final`, `apw_gone`), written with an idempotency key for that try. A late or repeated event, or two events at once, tells nobody twice. If the note cannot be saved the alert still goes out, and the Health tab says it may come twice.
- **The look.** `brandMail`: navy header with our logo (`static/assets/img/email-logo.png`, made from `logo-horizontal-dark.svg`), white card, orange button, navy footer with 623.309.6104. Plain text rides along for mail programs that do not show HTML. `MAIL_OUT=/path/file.json node build/worker.test.mjs` writes every email the tests sent, to look at the branded ones in a browser.
- **Needs a person (Atlas), Stripe settings.** Retries, "If all retries for a payment fail": "Mark the subscription as unpaid". Today it is most likely still "Cancel the subscription" (that was the old rule in `GO_LIVE.md`), and then Stripe cancels the plan after the last try: the PAUSE SERVICE email says so and names the setting. Stripe's own failed payment emails off. The customer portal saved with "update payment method" on.
- **For Joe.** His note reads as if the office decides when to pause a customer. The site already takes them off new routes at the first failed try (that rule was here before). The alerts say so. If he wants visits to keep going until PAUSE SERVICE, that is one line to change in `cardFailed`.

### Also in this push
- For the Field App chat: `desk.test.mjs` fails 4 photo time checks when it runs in the first 20 minutes after midnight Arizona time. The test types a photo time of "20 minutes ago", which is then yesterday, and the server rightly does not believe a time from another day. It passed at 11:55 pm and again at 12:21 am. Nothing is wrong in the app.
- The sign up page shows the price line the server sends back with the card form (`line` from `/api/checkout`), so a sign up that crosses midnight reads the day Stripe will charge.
- The waitlist email subject named an empty ZIP ("Waitlist: name, ZIP"), because that form asks for a city. It names the city now.
- Terms, Skips and pauses: the new pause rule in plain words.

### End to end check for the ads going live (run on the live site, Nov 17, 12:00 to 12:10 am)
- Pass: `/api/health` reads live keys, hook, mail, meta. The sign up form walks to the card step with live keys: account made, Stripe customer made, card form shows cards and Apple Pay only, and both the page and Stripe's note read "$0 today. Then $108 a month starting Dec 17." for a sign up on November 17. The waitlist form saves a lead. The pixel fires PageView, InitiateCheckout, AddPaymentInfo and Lead with no name, phone or address, and the Lead used the same event id the server was sent. The week planner, crew demo and truck link answer.
- Needs a person: one real sign up with a real card ($0 charged), which is the only proof of card saved, webhook, plan made and welcome email. On Nov 17 at 12:10 am the database held three sign ups started and none finished. A look in the info@ inbox for the test waitlist email of 12:04 am. A look in Meta Events Manager that the 12:04 am Lead reads Browser and Server.
- The site has no contact form and no quote form. Contact, Pricing, One time cleanup and Commercial use an email link to info@ and call and text links to 623.309.6104.
- Still off: address suggestions (Places API (New) is not switched on for the Google key).
- Test data left on live, safe to delete: lead "TEST Claude site check" (waitlist), customer "TEST Claude site check" at the card step with its empty Stripe customer, and one Health line about `META_APP_SECRET` from 12:02 am.

## Nov 17, 2026, 12:30 am. Facebook lead forms reach the office: `/api/meta/leadgen` (website and money rules chat), Atlas's ask
Atlas at 11:29 pm on Nov 16: Meta ads go live tonight. The Instant Form (form 1537873488145115 on the Arizona Pet Waste Page) has to reach info@ every time, and `/api/meta/leadgen` answered 404. It is built now. The Meta side still needs a person, see "Needs a person".
- **What it is.** A lead form on Facebook or Instagram never touches the site. Meta keeps the answers and sends the site a short signed notice with the lead id. `GET /api/meta/leadgen` is Meta's one time check of the address (the verify token comes back, the number is said back as plain text). `POST /api/meta/leadgen` is the notice. The server reads the lead from the Graph API (`v26.0`, the same version the Conversions API uses), emails every answer to `NOTIFY_EMAIL`, and saves it in `leads`.
- **Settings in Cloudflare (all three needed, all Secret).** `META_APP_SECRET`, `META_VERIFY_TOKEN`, `META_PAGE_TOKEN`. Optional `META_PAGE_ID`. `/api/health` has a new field: `"leads":true` when the three are in. The steps on the Meta side are `GO_LIVE.md` part 11, checked against Meta's own pages on Nov 16, 2026 (Webhooks for Leads, Retrieving leads, Marketing API use cases, the Page `subscribed_apps` reference).
- **How a lead is saved.** One row in `leads`, kind `signup_request` (the table's check allows four kinds and the office app names four, and this is the closest: someone asked us to reach out and sign them up). Name, email, mobile as 10 numbers, street and city, ZIP in their own columns. The details read "Facebook lead ad." or "Instagram lead ad.", then the form's other answers, the form, the ad and the campaign, and end with `Meta lead id` and the id. The office app shows it under Leads with no change to the app. `crm.sql` and the crew app were not touched.
- **Never lost, never twice.** The row is looked up by its Meta lead id before anything is emailed, so a notice Meta sends again does nothing. A lead that cannot be read (no token yet, a token that ended, lead access taken away, Meta down) is still emailed to the office with its id and the reason ("New Facebook lead: open Leads Center to read it"), saved as "Facebook lead, not read yet", and answered with a 503. Meta then sends it again for 36 hours, and the first try that works fills in the row and sends the full email. A row still unread after that is tried again when a later lead is read fine (`metaLeadHeal`). An email that does not send leaves the row marked "email not sent" and also answers 503. Two notices for one lead at the same moment end as one row and one email (`leadTwin`). More than five leads in one notice are worked off five at a time.
- **Trust.** A notice counts only when `X-Hub-Signature-256` matches `META_APP_SECRET` over the exact bytes Meta sent. With no app secret set the notice is refused with a 503 and the Health tab says so. No token, app secret or verify word is ever put in an email, a row, a log line or an answer. The token rides in the Graph API address the way Meta's examples do, and that address is never logged.
- **Less to do by hand.** The token in Cloudflare can be the Page's own token or a system user's token: the server asks Meta for the Page's token itself. When Meta checks the address, the server also sets the Page to send its leads to the app (`subscribed_apps`, keeping the fields the app already listens for) and emails the office "Facebook leads are connected to the site" or what is still missing. `/api/meta/leadgen?check=` plus the verify word shows the same in a browser.
- **Tests.** `worker.test.mjs` has a pretend Graph API and 62 new checks: the address check, signatures, a full lead, Instagram, the testing tool's lead, the Test button, a system user token, a token with no ad rights, no token, a dead token, Meta down, no lead access, mail down, the table down, the same lead twice at once, seven leads in one notice. 344 pass.
- **Needs a person (Atlas).** Everything in `GO_LIVE.md` part 11: the Meta app with the use case "Capture & manage ad leads with Marketing API", published. The three settings in Cloudflare and a redeploy. The app's Webhooks page pointed at `https://arizonapetwaste.com/api/meta/leadgen`. One test lead from the Lead Ads Testing Tool. Until then leads are only in Meta Business Suite, Leads Center. Meta has no email of its own for each new lead.
- **Not done, on purpose.** No reply goes to the lead (no email, no text). The privacy policy was left as it is while Twilio reviews it.

## Nov 16, 2026, 11:45 pm. The free month is one month from the sign up day (website and AEO chat), Joe's ask
Joe at 11:25 pm, after seeing the pay step: "if somebody signs up today, 11/16, it should be 12/16. Why does it say starting December 27? ... it has to be correlated to what the date is today ... We cannot lose any extra money." This answers call 1 under "Calls made here, for Joe to change if he wants" in the 11 pm note below. Everything else in that note stands.
- **The rule now.** The free month ends exactly one month after the sign up day, at noon Arizona time (`plusMonth(noonAZ(azToday()))` in `firstCharge`). Sign up November 16, first bill December 16, then the 16th of each month. January 31 runs to the last day of February. Before this it ran one month from the soonest first visit day (November 20) plus 7 days for setting the visit, which is where December 27 came from: 11 more free days than Joe wants to give.
- **What did not change.** `trial_end` is still the only date sent to Stripe, the first bill is still one full month, `checkPlan` still holds every new plan up against Stripe. `FIRST_VISIT_FROM` still sets the soonest first visit and the day pausing opens (`pause_from`, 60 days after it). `SCHEDULE_DAYS` no longer touches money. `/api/config` still sends both.
- **Same rule in the form.** `_bill` in `design/generator/book.prod.tpl.html` (and the design copy in `booking.tpl.html`). Checked in a browser at phone size: step 4 reads "$0 today. Then $108 a month starting Dec 16."
- **A card form opened before this change** carries December 27 in its metadata, and its plan starts with December 27. That is the date that customer saw at the card step, so it is left alone. Do not move a bill day on a plan by hand.
- **Words.** Terms (free month, billing and cancel examples), Pricing, the FAQ answer "When do you charge my card?" and `llms.txt` say the free month runs one month from the day you sign up, with a November 16 to December 16 example.
- **Worth knowing.** The first visit is set after sign up, so a customer has fewer than a full month of visits before the first bill (sign ups before November 20 wait for the first service day). Joe's call. The pay step shows the date before the card goes in.
- **Tests.** `worker.test.mjs` holds the sign up day still (`quote(today, ..., at)`) and has Joe's own case: November 16 at 11:25 pm gives December 16. 282 pass. `signup10` and `signup50` checked `trial_end` was more than 30 days out. A one month free period can be 28 to 31 days, so they now check 27 to 32. Run against a local Postgres: `signup10` 40, `signup50` 125, `desk` 134, all pass.

## Nov 16, 2026, 11 pm. Billing: every customer has their own bill day, no part months (website and money rules chat), Joe's ask
Joe's ask at 9:34 pm: take out the billing day on the 1st and all proration. When the free month ends, charge the full plan price, and that day is their bill day from then on. With no free month (after the Black Friday sale), charge the full price at sign up, and that day is their bill day. No partial or prorated charges anywhere. The pay step says it in one plain line. Link off in the card form, no Bank tab, cards and Apple Pay and Google Pay only. The cancel text in one line. This was built at the same time as the 9:45 pm sign up rebuild above and is merged with it (4 steps, no email code, the 60 day rule off). Read this before you change anything near Stripe in `worker.js`.

### What changed
- **Free month sign ups (now, through November 30).** Same card form as before (Checkout in setup mode) and the server still starts the plan (`startPlan`). The plan request now carries only `trial_end`. No `billing_cycle_anchor`, no `proration_behavior`. Stripe then bills one full month the day the free month ends and on that day of each month. `firstCharge` returns the full month price as the first charge. The free month is still one month and one week from the soonest start day, so a sign up on Nov 16 is free until Dec 27. That is the date in Joe's own example.
- **The "only once" key is `apw-plan2-<session id>`** (`PLAN_KEY`). The plan request changed, and Stripe refuses an old key with new fields.
- **A card form opened before this change** still carries a part month amount and a billing day in its metadata. Its plan is started by the new rule, with the full month price saved on the plan. `checkPlan` then emails the office "CHECK BILLING: They were told $17.42. Stripe plans to charge $108." so a person knows what that customer saw. On Nov 16 at about 10 pm the database had two rows waiting at `checkout` and no row with a plan id, so the site had not made a plan yet and no plan had to be changed.
- **No free month (from December 1).** `freeMonth(env)` in `worker.js` ends the free month at `FREE_MONTH_UNTIL` (`2026-12-01T06:59:59Z`, the same moment as `DEAL_END` in `build/build.mjs`, and a test holds the two together). From then on `/api/checkout` makes Stripe's own plan checkout (Checkout in subscription mode, embedded, with the two prices as `line_items` and the plan metadata in `subscription_data`). Stripe shows the price, charges the first month in the form and starts the plan at that moment. No trial, no billing day, no proration is sent. New function `paidPlan` runs from `checkout.session.completed` (mode `subscription`) and from `/api/checkout/done`: it moves the card from the plan onto the customer (`cardToCustomer`, customer first, then off the plan) and calls `booked`. So the rule "the card lives on the Stripe customer" still holds for every plan. It works with the new no sign in sign up: `newAccount` makes the account, and the card form id is the proof at `/api/checkout/done`.
- **Why not save the card first and charge after, like the free month path.** A card form in setup mode shows no amount, the Apple Pay sheet would read $0, and a refused card would come back after the customer had already seen "You are booked!". Stripe's plan checkout fixes all three.
- **A plan that is not paid yet never touches the row.** Stripe's plan checkout can leave a plan `incomplete` (card refused) and later `incomplete_expired`. The webhook now ignores plan events in those two states, also the `deleted` one. Before this an `incomplete` event would have moved the row off `checkout`, and the sign up could never have been booked. `startPlan` does not count an `incomplete` plan as "their plan" either.
- **One plan for one customer on the paid path.** Before a new card form is made, the server looks at the customer's plans in Stripe (a plan that is going means "you already have a plan") and closes any card form still open from before (`POST /v1/checkout/sessions/{id}/expire`), so two tabs cannot both be paid.
- **Home rule.** "One free month per home" only runs when there is a free month to give. With no free month, a home that had a plan before can sign up online and pay.
- **The 60 day rule stays off** (the 9:45 pm note). What this change adds for the day someone switches it on: a plan with no free month is marked `no_free` and `freeMonthCharge` never charges it (they paid a month at sign up), and the card form only carries `min_end` and `min_label` for a free month plan with `EARLY_CANCEL` on. Every plan carries `pause_from`, so pausing still opens after the first 60 days.
- **Back from a pause charges nothing.** `resumeCharge` is gone. It charged "the days left in this month", which is a part month, and its sum was tied to bills on the 1st.
- **Ways to pay.** The card form is asked for with `allowed_payment_method_types = [card]` and `wallet_options.link.display = never`. Link was in the list before, which is where the Link box, the extra phone field and the Bank tab ("$5 back" is Link's bank offer) came from. Apple Pay and Google Pay ride on cards, so they stay. If Stripe refuses the form, it is asked for again in this order: the same with no currency, cards only, Link off only, then the Dashboard list. The Health tab says which one was used.
- **The pay step** (`book.prod.tpl.html`, step 4 of 4): the money table is gone. It reads: "$0 today. Then $108 a month starting Dec 27." then "Cancel anytime in My Yard, with no phone call." then "Every week, 2 dogs. We reach out to set your first visit." With no free month: "Start your plan." and "$108 today. Then $108 a month starting Dec 16." The page learns which one from `/api/config` (`freeMonth`) and again from `/api/checkout` (`free`), so the line can not say something the card form does not do. The line `stripe.createEmbeddedCheckoutPage || stripe.initEmbeddedCheckout` in `_startPay` is untouched.
- **Staff test switch.** `/book/?nofree=1` turns the free month down for that tab. The page sends `noFree`, and the server makes the pay today card form. It can only turn a free month down. It charges a real card.
- **Same line everywhere.** `billText` and `cancelText` make the note by Stripe's button ("$0 today. Then $108 a month starting Dec 27. Cancel anytime in My Yard."), the welcome email ("Your card is saved. $0 today. Then $108 a month starting Dec 27.") and the office email. A paid sign up reads "Your card was charged. $108 today. Then $108 a month starting Jan 5."
- **Words on the site.** Nothing says "on the 1st" for home plans any more: Terms (Billing, pauses, canceling), Pricing, the FAQ answer "When do you charge my card?", the plan step of the form, the home page bill line, the town page price answers, the one time pickup page, the schema offers and `llms.txt`. Commercial pages still say "one bill on the 1st": that is how commercial accounts are billed, and nobody asked to change it.
- **The older notes above that say "part month" and "the 1st"** (Nov 9 and Nov 15) are history. This note is the rule now.

### What Stripe's docs say, checked Nov 16, 2026
- Trials: "When the trial ends ... we generate an invoice ... Approximately 1 hour later, we attempt to charge that invoice. A new billing period also begins for the customer when the trial ends." https://docs.stripe.com/billing/subscriptions/trials/free-trials
- Billing day: "The default value is either the subscription creation date or the trial end date (if you're using a trial period)." A reset to now on an existing plan is now `billing_cycle_anchor[type]=now`. https://docs.stripe.com/billing/subscriptions/billing-cycle
- `trial_settings.end_behavior.billing_cycle_anchor`: "now (default): Resets the subscription's billing_cycle_anchor to the exact time the trial offer completes. This creates a new billing cycle for the regular price and generates a full-amount invoice with no proration." `unchanged` is the one that makes a prorated bill. We send neither and `checkPlan` flags a plan that reads `unchanged`. https://docs.stripe.com/billing/subscriptions/trials
- Link: "you can disable Link for a session by including link in your wallet_options". https://docs.stripe.com/changelog/basil/2025-04-30/checkout-link-wallet-options
- Stripe's field list (`spec3.json`, API `2026-09-30.endive`): every request of the test run is in it. The count is under Tests.

### Not tested, and it matters
- **Nothing in this change has run against the real Stripe.** This chat holds no Stripe key, and the live site has live keys only. The free month path differs from what was live by two fields taken out of the plan request and two fields changed on the card form. The paid path is new code.
- **Before December 1 a person should run one paid sign up** at `https://arizonapetwaste.com/book/?nofree=1` with a real card, then refund it and cancel the plan in Stripe. What to check is in `CLAUDE.md`, Still open, 8.
- The first free month sign up is the proof for the other path: no "CHECK BILLING" email means Stripe plans one full month on the day the pay step showed. Look at the card form too: no Link box, no phone field, no Bank tab. If one shows, the Health tab says which form was used.

### Calls made here, for Joe to change if he wants
1. The free month keeps its length (one month and one week from the soonest start day). His message says "30-day free trial" and his example says Dec 27, which is the length it already had. **Changed by Joe at 11:25 pm: one month from the sign up day, see the 11:45 pm note above.**
2. The pay step keeps one small line with the plan ("Every week, 2 dogs."), so a customer can see what the price is for.
3. From December 1 the form header reads "Book now" and the pay step reads "Start your plan." A header that said "Start your free month" over "$108 today" would be a false promise. The Twilio screenshot on `/texts/` shows the old header: retake it on December 1 if Twilio is still reviewing (`CLAUDE.md`, Still open, 11).

### Needs Joe
1. **"Your first cleanup is free" against "charge the full price at sign up".** From December 1 the site says the first and checkout does the second. Nothing in the code gives a free cleanup. He has to pick: change the words, or say what the free cleanup is (a credit, an extra visit).
2. **The pause hole.** A customer who pauses over their bill day skips that bill, and the next one is a month later. A two day pause around the bill day would skip a whole month. Nobody can pause before January 19, 2027 (60 days after the first start day), so there is time. The fix that fits his rule: when a bill was skipped during the pause, charge the full month on the day they come back and make that day the bill day. Stripe needs two steps for that in this API version (a billing day reset does not make a bill by itself any more), so it should be built and tried with test keys, not guessed.

### For the session that owns tracking
- The booking still goes to Meta as `StartTrial` and to Google Tag Manager as `sign_up` (`apw.js`, `metaBooked`), also for a sign up that pays today. That is right through November 30. From December 1 there is no trial, so Meta's `Subscribe` may fit better. Not changed here: the browser and the server must send the same name and id, and the tags in the container are keyed on these names.
- `metaBooked` got one small change: when a plan event books a paid sign up before the card form event, it finds the card form with `GET /v1/checkout/sessions?subscription=`, so the event id is still `bk_<card form id>`.

### Field desk session
- No screen changed in the crew app, the office or the truck link, so the training video was not rebuilt.
- The Health tab can show new lines: "Stripe refused the list of ways to pay, so the card form was made another way", "An older card form of this customer could not be closed", "The card of a new plan could not be moved onto the customer", "Paid at sign up but not booked yet (cs_...)". The line "Stripe does not match what a new customer was told about their first bill" stays.
- A new office email: "ACTION NEEDED: paid at sign up but not booked yet". It says they were charged and nobody may charge them or start a plan again.
- `build/signup10.test.mjs`, `build/signup50.test.mjs` and `build/stripe.fake.mjs` changed: the free month is pinned on (`FREE_MONTH_UNTIL` in their env, so they still pass after the sale), the first bill must be one full month, and the pause test now expects no charge. `desk.test.mjs` was not touched.

### Tests
- `build/worker.test.mjs`: 277 checks, 279 with `STRIPE_SPEC` (94 kinds of field on 26 kinds of request, 470 requests, none refused). New: the one line note, cards only and Link off, no billing day on any plan request, the keep the old day flag, a card form from before the change, the four fallbacks of the card form, back from a pause, and the whole paid path (the card form, a refused card, the webhook, the page, a new email with no sign in, the plan event first, the card move, two tabs, the home rule, the office alert, the sale switch, `noFree`).
- Local Postgres: `signup10` 40, `signup50` 125, `desk` 134. `week.test.mjs` 76. `nav.test.py` 68. `npm run check` passes with the sale on and off.
- `build/smoke.py` still stops at its first step (known since the redesign). Its pay step line was updated so it is right when someone fixes the rest.
- The pay step was walked in a real browser in demo mode, on the 4 step form, at 320, 390 and 1280 wide, with and without `?nofree=1`. The price line and the cancel line each sit on one line at every width from 320 up (the cancel line steps down to 13px under 375 wide to do it).
- `GO_LIVE.md` part 7 and part 8 were brought in line with the 4 step form and the 60 day rule being off (no code for a new email, the My Yard link, nothing charged for canceling).

## Nov 18, 2026, morning. Field desk: lead times, a Health list in plain words, Money, Team, and an owner who scoops (Field App chat), Joe's ask
Joe at 9:35 am: put the time on every lead "so we know I'm hitting them instantly", explain and clean up the Health errors ("Stripe 400, no such customer"), make Money easier, make Team right for Juan Gonzalez as a second owner, and make everything dummy proof.

### What Joe saw on Health, and what it was
- 31 lines of "stripe 400 No such customer" on November 17, 8:45 to 9:09 am, all on `/api/checkout`. They were staff test sign ups (emails at arizonapetwaste.com, names "Atlas Diag" and "APW Checkout Test") whose Stripe customers had been deleted in the Stripe dashboard. The fix (`stripeGone`) went live at 9:17 am that day. No row of a real outside customer was involved, and a brand new customer could not hit it: it needs a saved Stripe id that Stripe no longer has.
- Still open on that list: address suggestions on the sign up form are off, Google refuses the Places call (last seen November 17, 10:54 pm). People can still type their address. Atlas: Places API (New) for the server key (`CLAUDE.md`, Still open, 9).
- Three Stripe events were refused for a wrong signature on November 16, 11:01 pm to 12:02 am. None since. This chat could not open `/api/health` on the live site to read `hook`, so that is not checked.

### What changed
- **Leads** (`officeLeads` in the crew page, `officeLead` on the server). Cards in place of a table, so a phone shows what the lead asked for. Each card: name, date and time in (Arizona), kind, phone, address, details, note, then Call, Text, I reached them, the status list and Note. A new lead shows "Waiting 9 hr" in red. The first move off New saves `leads.contacted_at` once, and the card shows "Reached in 6 min". The Text button opens Messages with an empty text to the lead's number. Nothing is sent by code.
- **Health** (`officeHealth`, `plainErr`, `healthGroups`, `WHERE`). "Crash log" is now "What went wrong". Same problem, one card, with the first and last time and a count. `POST /api/office/health/clear` (owner and office) saves `health_cleared_at` in `settings`. The server then lists errors after that time, up to 200. No row is deleted.
- **Money** (`officeMoney`). The server also answers `freeMonth.list` and `startedList` (names, 50 at most). The screen is four blocks of one number and one sentence.
- **Team** (`officeTeam`, `teamList`). Cards. Roles read Owner, Office, Scooper. `staff.scoops` and "Runs a route". "Has signed in" comes from `user_id`, which is never sent to the page. Edit name and mobile. A mobile number that is not 10 digits is refused. The list is in the order people were added.
- **Who gets the yards** (`runsRoute`). See `CLAUDE.md`. `/api/staff/me` now also answers `id` and `scoops`, and the Schedule shows "My route today: N yards" to a signed in owner or office person who has a route that day.
- **Database.** `supabase/patch-2026-11-18.sql`, also in `crm.sql`: `staff.scoops boolean not null default false` and `leads.contacted_at timestamptz`. Applied to the live database on November 18 before the push. Juan Gonzalez was set to `scoops = true` there.

### Seen on the live database on November 18, for Joe
- Three real leads sat at New: one from November 12 and two Instagram leads from the night of November 17.
- The one live customer has no service day and no scooper, and `settings` is empty (no truck start, no yard limit saved). Nothing is on a route for November 20 until someone opens Plan the week and saves it, or picks a day on the customer.
- Four rows wait at the card step and all four are staff tests. One test customer is canceled. Two test leads are in Leads. None were deleted.

### Tests
- `build/desk.test.mjs`: 150 pass (134 before, 16 new: the Team list, an owner who scoops gets the week, taken off routes it falls back, the mobile check, the lead clock, Clear the list, the Money lists).
- `build/worker.test.mjs` 505, `build/week.test.mjs` 76, `build/signup10.test.mjs` 40, `build/signup50.test.mjs` 131, `build/nav.test.py` 68, `npm run check`. All pass, on a local Postgres 16.
- The four screens and the Schedule were opened in a real browser at 390 and 1280 wide with made up answers shaped like the live ones (46 error rows, two owners, four leads): no script error, no sideways scroll. I reached them, Edit name and mobile and Clear the list were tapped there. The demo was opened on the same four screens.
- Not run: the signed in app against the live database, and a real phone.

### Training video
Not rebuilt. It shows the Schedule, Plan the week, the scooper screens and the truck link. None of its screens changed (the demo has no "My route today" button, because nobody is signed in there), and every line in `docs/video/lines.json` is still true.

## Nov 18, 2026, midday. One price file, new weekly prices, the price card, the deodorizing line, four city buttons, a bigger sign up form (website chat), Joe's ask
Joe, 10:16 to 10:22 am, four messages: weekly is $89 for 1 dog, $99 for 2 dogs (was $108) and $115 for 3 dogs (was $121). Twice a week $189 and every other week $75 did not change. "Set it in the single pricing config, and these stay fixed going forward." "No discounts of any kind." The Black Friday free month through November 30 stays. "Don't change any existing customer's price; the current weekly subscriber stays at $108." Show deodorizing as a line wherever prices show: "Deodorizing treatment", $39.99 with a red slash, $0, a FREE tag, and "$0 when you sign up for service. Limited time only." Before that he asked for four city buttons on sign up ("we cover all ZIP codes, every single one of them"), a new look for the prices and the last section of the home page ("less is more of anything"), and a site that is easy on every phone, tablet and folding phone, for older people too.

### Prices: one file
- `src/prices.json` is the only place a price is typed. `month` is dollars a month for 1 to 6 dogs on each plan: weekly 89, 99, 115, 134, 147, 160. Twice a week 189, 189, 202, 215, 228, 241. Every other week 75, 75, 84, 93, 102, 111. `once` is 99. `deodorizing` holds Joe's words and numbers for that line. `kept` holds the plans that keep an older price and the table from before.
- `build/prices.mjs` reads the file, refuses numbers that cannot be prices (not a number, under $20, over $2,000, a price that goes down as dogs go up) and writes a copy into `src/worker/worker.js` between the `PRICES:START` and `PRICES:END` marks. `npm run build` runs it first. `node build/prices.mjs --check` only looks. `worker.test.mjs` fails if the copy and the file differ.
- The pages: `design/generator/parts.py` loads the file (`PRICES`, `month()`, `week()`, `usd()`), and `longform.py` and `cities.py` use those. `build/build.mjs` reads the same file for the schema offers, the page descriptions and `llms.txt`. Words in `content/` use tags the build fills in: `[[price:week:2]]`, `[[week:week:2]]`, `[[price:once]]`. Copy made in Python cannot carry a tag (the export stops on one), so it uses the numbers from `parts.py`.
- The week price is the month price times 12, over 52, to the nearest dollar: $21, $23 and $27 for 1, 2 and 3 dogs on weekly.
- `/api/config` answers `prices` (the `month` table), so any screen can show a price without typing one.

### Prices: Stripe
- Before: a base price for 1 or 2 dogs plus an "extra dog" price times the dogs over two. One dog now costs less than two, so that shape no longer fits.
- Now: one Stripe price for each plan and dog count. The key is `apw_<plan>_<dogs>_<cents>`, for example `apw_week_2_9900`. The product is `apw_<plan>_<dogs>`, named like "Dog poop pickup, every week, 2 dogs". `priceId(env, plan, dogs)` finds the price by its key and makes it the first time a sign up needs it, the same way the old prices were made. A plan has one line with quantity 1.
- A new number in the file is a new key, so it is a new Stripe price for new sign ups only. Nothing ever edits a price a running plan sits on.
- `PLAN_KEY` is `apw-plan3-` now, because the fields of the plan request changed.
- The old prices (`apw_week_base`, `apw_week_extra` and the four others) stay in Stripe and are never made again. The one live plan bills on them. Do not archive them.
- No Stripe price was made by hand or by this chat. The first real sign up after the push makes `apw_week_2_9900` or whichever it needs. That call has only run against the pretend Stripe and Stripe's own field list (`STRIPE_SPEC`), like every other Stripe path before its first real use.

### The customer from before keeps $108
- The live database on November 18 had one plan: `sub_1UcpCgLoVhhubhCaah7WLt8o`, weekly, 2 dogs, in its free month. It was made at $108. Stripe will bill $108, because its price line was not touched.
- That plan id is in `kept.plans` in the price file, and `kept.month` is the table from before. In the server `rowMonthly(customer)` reads the kept table for a kept plan and the new table for everyone else. `monthly(plan, dogs)` is what a new sign up pays.
- `rowMonthly` is used by the office customer card (`officeCustomer`, the `monthly` field), the Money screen (`officeMoney`), My Yard (`planView`, which now also answers `month`), and every email about a running plan (pause, back from a pause, a new dog count). `booked` reads the real total off the Stripe plan (`planCents`) and falls back to `rowMonthly`.
- `setDogs` on a kept plan still adds or removes the old "extra dog" line (`oldExtraPrice`), so a third dog on that plan is $121. On a new plan it moves the one line to the price for the new dog count. Neither asks Stripe to prorate.
- `customers` has no price column and none was added. No table changed.

### Field desk session, for you
- Changed in the office routes: only the price lookups named above, and `officeMoney` now also reads `stripe_subscription_id`. No route, field name or answer shape changed.
- `static/crew/index.html`, `static/t/index.html` and `supabase/crm.sql` were not touched, so the training video was not rebuilt.
- The made up money in `/crew/?demo` ($80 a month for each yard) is not from the price file. `/api/config` has `prices` if you want the demo to use real numbers.
- Use `rowMonthly(c)` for anything the office or a customer sees about a plan that is running. `monthly(plan, dogs)` is for a new sign up. Mixing them up shows the one customer from before the wrong price.
- `build/stripe.fake.mjs`, `build/desk.test.mjs`, `build/signup10.test.mjs` and `build/signup50.test.mjs` moved to the one line plan and read `src/prices.json`.

### The site
- **Price card** (`PRICE_CARD` in `parts.py`, CSS under `.rc` in `look.py`, `drawCard` in `src/runtime/apw.js`). One cream card on the home page, every town page and `/pricing/`: "How many dogs?" with minus and plus and the dog pictures, the three plans with the week price big and "We bill $X once a month." under the name, the deodorizing line, one Book now button, the sale line. It is plain HTML for 2 dogs with the price table in `data-rc`, so it reads right with no script. Book now carries the dog count into sign up (`/book/?dogs=3`). The old price list, the table on the town pages and the plan picker are gone. `/pricing/` also lists every price in lines (`PRICE_LINES`).
- **Deodorizing line** (`DEODOR` in `parts.py`, `DZ_CSS` in `look.py`). On the card, on the plan step and on the pay step of sign up. Not in the schema, the descriptions or `llms.txt`: those still say deodorizing is included free with every visit. See Still open 14 in `CLAUDE.md` before adding to it.
- **Last section of the home page** (`.cta2`). The shirt photo with "Look for this shirt at your gate.", the headline, "About $23 a week for 2 dogs. We bill $99 once a month." from the price file, one Book now, the phone number, the sale line.
- **Sign up** (`book.prod.tpl.html`). Step 1: Buckeye, Goodyear, Litchfield Park, Citrus Park, then "My city is not here". A tap moves on, so there is no Continue button on step 1, and the step ends with the phone number. Step 3 always asks "Which ZIP code is your home in?" with that city's ZIP codes as buttons (Buckeye 85326, 85396, 85340. Goodyear 85338, 85395, 85340. Litchfield Park 85340. Citrus Park 85355, 85340) and "My ZIP code is not here", which shows all six and the phone number. Step 4 has a small summary: the plan and its price, then the deodorizing line. The server list of ZIP codes (`ZIPS`) did not change.
- **Sizes.** Sign up styles are classes at the top of the template now, not inline. Nothing under 15 px, labels 17 px, typed words 18 px, buttons 48 px or more. A 460 px window in the middle on a tablet held upright and on a computer. Full screen with a 560 px column on a wide, short screen (a phone on its side, an open folding phone, 890 by 626). Public pages: no words under 15 px but the footer staff link, the stamp on a photo print and the labels inside the sample report picture, and links that stand alone are 44 px tall.
- **`build/sweep.py`** is new: every page in the sitemap at five screen sizes (fifteen with `SIZES=all`). It fails on a page that scrolls sideways or a script error and lists small words and small tap targets.
- **Text opt in proof.** The opt in words and the one unchecked box did not change. The form around them did, so `build/optin-shots.py` was run and the form and waitlist pictures on `/texts/` are new (the My Yard one came out the same, pixel for pixel). `content/policies/texts.html` has the new sizes, `?v=3` and "Captured November 18, 2026".
- **One more leftover found and fixed:** the one time pickup page still said weekly was $108 in a question and in its schema. It reads from the price file now.

### Checked
- `node build/worker.test.mjs`: 533 pass with `STRIPE_SPEC` (110 kinds of field on 30 kinds of request, 823 requests, none refused). 24 are new: the copy in the server matches the file, Joe's five numbers, `/api/config`, the new Stripe price and product, the plan from before reads $108 in My Yard, on the office card, on Money and in a pause email, a third dog on it reads $121 through the old extra line, a new plan moves to `apw_week_3_11500`, and nothing asks for a proration.
- Local Postgres 16: `desk` 150, `signup10` 40, `signup50` 131. `week.test.mjs` 76. `nav.test.py` 68. `npm run check` with the sale on and off. `node build/prices.mjs --check`.
- The card was tapped in a real browser on the home page, `/pricing/` and a town page: 1 dog $21 and $89, 2 dogs $23 and $99, 3 dogs $27 and $115 ($47 and $202, $19 and $84), 6 dogs $37 and $160, and Book now opens sign up with that many dogs.
- Every sign up step, for each of the four cities, at 17 screen sizes (320 by 568 up to 1280 by 900, with 466 by 678, 466 by 560, 890 by 626, 890 by 520 and a phone on its side at 844 by 390): no words under 15 px, no button or box under 48 px tall, no sideways scroll, the Continue bar always on the screen, the right ZIP code buttons for each city, all six behind "My ZIP code is not here", and no script error.
- `build/sweep.py` over all 45 pages at 320, 390, 466, 890 and 1280 wide: no page scrolls sideways.
- Chrome only. No Safari or WebKit on this machine, and no real phone. The folding iPhone sizes are from Apple's pixel counts with a 3x screen assumed (466 by 678 closed, 890 by 626 open): Apple does not publish the scale.
- `build/smoke.py` still stops at its first step (known since the redesign). Its city tap and its pay step note were kept right for whoever fixes the rest.

### Not done, and why
- Nothing outside the repo: the Google profile, Google Ads, the Facebook and Instagram ads and any printed piece were not changed. Any of them that shows a price shows the old one.
- Weekly prices for 4, 5 and 6 dogs did not change, because Joe gave none.
- No ZIP code was added to the six the server takes.
- The after sale words ("Your first cleanup is free", from December 1) were left alone. Joe's "No discounts of any kind" points at taking them out. He was asked.
- The open questions are 14 to 18 in `CLAUDE.md`, Still open.

## Nov 18, 2026, afternoon. Member seals in the footer, and a last phone pass on the home page (website chat), Joe's ask
Joe, 2:07 to 2:11 pm: put the aPaws member seal and the two chamber logos "nicely on the bottom of the footer to show more authority", link aPaws to its listing, find the two chamber listings "if u can if not just post em anyway with no link". Then: "maybe we put it in the footer, or maybe we put it up top... I'm going to let you decide." And one more pass on the home page: "as soon as you land on it, you know exactly what it is... easy to click, easy to join", "maybe we can do a small box around the pictures... it clashes just a tiny bit", "a little bit more condensed somehow".

### Member seals (first push, 7701bd7)
- The bottom of the footer of every page reads "Proud member of" with three logos on white tiles, under the bonded and insured row and above the policy links: the aPaws Proud Member seal, the West Valley Regional Chamber, the Buckeye Valley Chamber of Commerce. Same white tiles as the payment marks. Three across on a phone.
- The files are the ones Joe sent (the TIF in the aPaws zip and two PNGs), only trimmed and scaled to 210 px tall, saved as WebP in `static/assets/img/brands/`. `README.txt` there says so.
- The list is `"members"` in `src/site.config.json`. It replaces `"badges"`, which was empty, and the old badge slot is gone. `membersHtml` in `build/build.mjs` builds the row. The look is `.fmem` in `look.py`.
- **Footer or top: footer.** Three logos in three other color sets right under the hero would fight the first screen. In the footer they sit with the other white tiles and are on all 45 pages.
- **No tile is a link yet.**
  - aPaws: the listing Joe gave (`apaws.org/search/adv/details.aspx?id=3038`) is ours and it is real, but it shows the street address. Rule: never link a page that shows one. So the seal shows with no link until the street line is off the listing.
  - West Valley Regional Chamber: the directory at `westvalleyregional.org/directory` lists Arizona Broadway Theatre, Arizona Complete Health, Arizona Rattlers and other A names on its first page, and not Arizona Pet Waste. `westvalleyregional.org/directory/arizona-pet-waste` does not exist.
  - Buckeye Valley Chamber of Commerce: `buckeyevalleychamber.org/directory` fills in by script ("Fetching Member Information"), so it could not be read from here. Its old directory host answers with a redirect loop.
- The business data on every page has `memberOf` for a group only when `"listing"` is filled in: aPaws today. `llms.txt` has one line, "Member of: aPaws...". The two chambers go in when there is a listing to point to.
- To make a tile a link: put our listing page in `"listing"`, open it and look for a street address, then set `"link": true`.

### The home page, last phone pass (second push)
- **First screen.** New line between the cities and the button: "About $23 a week for 2 dogs. We bill $99 once a month." It is `CTA_PRICE`, the same line as the last section, in class `hero-pr`. The first screen now says what, where, how much and has one button. Measured at 320 by 568, 360 by 740, 375 by 667, 412 by 915, 430 by 932, 466 by 678, 890 by 626 and 768 by 1024: the price and the button are on the first screen at every one.
- **Pictures.** Juan's photo and the shirt photo were raw photos on the navy page. Each is a print now: the cream paper frame of the gate photo, with the caption printed on the paper (`pho-pr`). Juan's print is square, cropped from the top so his face and the shirt are in it and the bin is not. Only the gate print is tilted and stamped.
- **Tighter on phones.** `.sec` and the last section start 56 px down (was 76). The promise block has 46 px above and below (was 54) and a smaller print (340 px wide at most, was 400). The seals strip is a little tighter. At 390 wide the part above the footer went from 8,292 px to 8,099 px with the new price line in it. Nothing changed at 1024 and up but the price line and the two prints.
- **Left alone on purpose.** The price card, How it works and Meet Juan (Joe: "love" them). The outline button on the header video (his rule of Nov 15). No Book, Call, Text bar on the home page (his rule of Nov 10). The note under the videos, because it says what "first month free" in the videos means.
- Other pages: every board page gets the tighter phone spacing, because `.sec` is shared. Plain photos on the other pages (`pho pho-r`) were not framed.

### Checked
- `npm run check` with the sale on and off. `python3 build/sweep.py`: 45 pages at five sizes, no page scrolls sideways, no script error.
- Looked at every screen of the home page at 390 by 844, 768 by 1024 and 1280 by 900, and a town page at 390 by 844.
- The server, the crew app and the tables were not touched, so no server tests were run again and the training video did not change.
- Chrome only, as before.

### For Joe (also in `CLAUDE.md`, Still open 19)
- Take the street address off the aPaws listing, or say to link it anyway.
- Send the link to our listing at each chamber when there is one.

## Nov 18, 2026, 4 pm. The member logos: no heading, no boxes (website chat), Joe's ask
Joe, 3:52 pm, after seeing the white tiles live: "take off proud member of on the footer... I just wanted a social proof, like trust proof. Maybe transparent with the website. It looks weird in boxes. I don't like the boxes. Figure out a different way."
- The row is still at the bottom of the footer of every page, under "Family owned and operated" and above the policy links. The "Proud member of" heading is gone and so are the white tiles.
- The three logos sit straight on the dark blue as trust marks. Two of them are dark (the aPaws seal is black, the West Valley wordmark is navy), so each file is now the same logo in one color: white on a see through background. Shapes untouched. `static/assets/img/brands/README.txt` says how each was made.
- `"members"` in `src/site.config.json` has a new `"h"`: how tall each mark shows on a phone (70, 58 and 66 px: the wide one needs less). `.fmem` in `look.py` scales the three together on narrow phones with container units, so they stay on one row from 320 wide up. On a computer they show 1.22 times as big.
- The list has `aria-label="Groups we are a member of"`, since there is no heading to read.
- The white files have new names (`apaws-white.webp` and so on). Everything under `/assets/` is cached for a year (`_headers`), so the white pictures under the old names would have shown the old dark logos, with no tile behind them, to anyone who had been on the site that afternoon. A file whose picture changes always needs a new name.
- Nothing else changed: still no links (Still open 19), and `memberOf` and `llms.txt` still name aPaws only.
- Checked: one row and no sideways scroll at 320, 360, 375, 390, 412, 430, 466, 768, 890, 1024, 1280 and 1440 wide. `npm run check` with the sale on and off.

## Nov 18, 2026, 4:20 pm. The member marks under the trust strip on the home page too (website chat), Joe's ask
Joe, 4:12 pm: "Do you think having those logos at the top of the website shows more proof instantly? Let's see how it looks."
- The home page shows the same three white marks under the Bonded and Insured strip, below the hero (`<!--MEMBERS_TOP-->` in `main.tpl.html`, filled by `membersHtml(true)`, look in `.seals-m`). About 110 px on a phone. The footer row stays on every page. Town pages do not have the top row.
- It is on trial: Joe is looking at it live. If he does not like it, take the one line out of `main.tpl.html`.

## Nov 18, 2026, evening (website session): one time cleanup in Book now

A customer can book a one time cleanup on the website now: Book now, city, dogs, then "One time cleanup" (starts at $99, depending on job size, custom quote). No card is taken. It arrives like a sign up request: an office email "One time cleanup request: name" and a lead row of kind `signup_request` whose details start "One time cleanup". The office texts or calls with the price and a time. If the field desk shows leads by kind, these sit with sign up requests; telling them apart is the details line. (An earlier push that evening put a first cleanup fee on plans by mistake. It was reverted the same night: plans have no sign up fee.)

## Nov 19, 2026, morning (website chat): the share picture, Contact us and Customer login, Joe's asks

Joe, 9:20 am, with a screenshot of a Facebook comment where the link picture was cut in half: "maybe we change it to just the logo on social media so its clean", "a simple contact us at the top of the website please next to FAQ that leads to info@arizonapetwaste.com. the page should be a questions? Need a quote?", "add a customer login button as well. That should lead to my yard. Let's put that button on top too, easy to look at."
- **Share picture.** Every page now names `/assets/img/share-logo.png` as its share picture (`og:image`, `twitter:image`): the logo alone on navy, stacked in the middle so a square cut still shows all of it. `design/share/make_og.py` makes it from the shapes in `logo-horizontal-dark.svg` (nothing is redrawn). `og.jpg` stays for old shares, the business data and the blog posts.
- **Top bar.** Contact us is the sixth link, next to FAQ. Customer login is a new link to `/account/`, next to Book now (words and sizes by screen width are in `CLAUDE.md`). The phone menu has Contact us after FAQ and a Customer login button under Book now. The phone number in the top bar shows from 1560 px wide now.
- **Small phones.** Book now used to leave the top bar under 340 px wide. With a smaller logo it stays at 320. "Log in" leaves the bar under 360 px (it is in the menu).
- **Contact page.** H1 "Questions? Need a quote?". First thing on it: a button that emails info@arizonapetwaste.com. Then what to put in the email for a quote, and the three cases that need no wait (weekly prices are set, one cleanup can be asked for online, commercial has its own page). Title and description changed to match.
- Checked: the top bar at 33 widths from 320 to 1920 on the home page, a town page, `/pricing/`, `/faq/` and `/contact/` (nothing touches, nothing wraps). `npm run check` with the sale on and off. `python3 build/sweep.py`: 45 pages at five sizes, no page scrolls sideways.
- The crew app, the server and the tables were not touched in this push.

### Search Console emails of Nov 19, 1:05 am ("Page with redirect")
Two emails, one for pages in the sitemap and one for all pages. Checked that morning on the live site: all 45 addresses in `sitemap.xml` answer 200 with no redirect, and no link on any built page points at an address that redirects. The likely cause is the two pages that were merged on November 16 (`/same-day-dog-poop-pickup/` and `/turf-odor-treatment/`): both were in the sitemap until then and both now send people on in one step (to `/one-time-dog-poop-cleanup/` and `/pricing/`). That is what "Page with redirect" means, and it needs no fix. Not confirmed in Search Console itself: Google asked the built in browser to sign in again, and a password is Joe's to type.

**Checked again at midday against Google's own results** (a `site:arizonapetwaste.com` search through DataforSEO, November 19). Google still lists `/same-day-dog-poop-pickup/` with its copy of November 11 ("Same day dog poop pickup for $49"). That address forwards to `/one-time-dog-poop-cleanup/` since November 16, so it is one of the pages in the email and the cause is confirmed for it. Google drops a forwarded address by itself. Do not take the redirect off: it is what carries the old page's standing over to the new one.

**What does need doing in Search Console: Google's copies of our pages are old.** Its results that day still showed words the site no longer says:
- `/pricing/`: "about $25 a week ($108 a month)".
- `/faq/` (its copy of Nov 9): "$108 a month" and "a turf odor treatment for $35".
- `/terms/` (Nov 7): "same day for $49", "$108 a month", "One time cleanup: $95".
- `/about/`: "licensed, bonded and insured".
- The home page in one result (its copy of Nov 16): "about $25 a week".
- The Goodyear, Citrus Park and Verrado pages (Nov 8): "about $25 a week" and the $35 treatment.
- `/blog/how-to-choose-a-pooper-scooper-service/` (Nov 9): "$108 a month".

The live pages are right (checked in `dist` that day: no page says $108, $49, $95 or $35, and About says "insured and bonded"). Google has not read them since. The fix is in Search Console and needs the Google sign in: URL inspection, then Request indexing, for `/`, `/pricing/`, `/faq/`, `/terms/`, `/about/`, the five town pages, `/pooper-scooper/buckeye-az/verrado/`, `/one-time-dog-poop-cleanup/`, `/contact/` and the blog post above, in that order. Google stops after about ten a day, so it takes two days. Then Sitemaps, and send `sitemap.xml` again. Bing was told by IndexNow after both pushes of November 19 (both runs passed).

### Search Console and Facebook, done from Joe's Chrome (Nov 19, 11:30 am to 12:15 pm)
Joe, 11:26 am, after he was asked for the Monthly price, the Google sign in and the Facebook refresh: "Yeah, I need you to handle this. Use co-work, use whatever you have to do. You handle this. I need three changes, and tell me exactly what you changed. We're not going to change pricing to duty calls."

**Pricing.** No price changed on November 19. `src/prices.json` was last touched on November 18. His answer on DoodyCalls is a standing rule now: our prices are the ones he set on November 18, and what another company charges does not move them. Monthly stays a custom quote ("We send your price") until he names a number.

**Which browser and which account.** The built in browser cannot get into Google: it asks for the password, and a password is never typed by Claude. Joe's own Chrome (the Claude in Chrome extension) is signed in to four Google accounts. Only one is ours: info@arizonapetwaste.com, which was account slot 2 that day (`https://search.google.com/u/2/search-console?resource_id=sc-domain%3Aarizonapetwaste.com`). Two of the other three are OMG accounts, and Joe's standing rule for this project is never touch OMG accounts. Slot numbers move when he signs in or out, so read the account name at the top right ("Google Account: ... (info@arizonapetwaste.com)") before any click.

**What the Page indexing report said** (its last update was November 15): 40 pages indexed, 11 not.
- Page with redirect: 1 page, `/turf-odor-treatment/`, first seen November 16, crawled November 17. That is the page behind the two emails. It forwards to `/pricing/` on purpose (Joe took the paid turf odor treatment off on November 16). "Validate fix" was not pressed: the page is meant to forward, so that check would fail and send another email.
- Discovered, not indexed: 8. Seven blog posts (`can-dog-poop-make-you-sick`, `dog-poop-smell-in-yard`, `heat-stroke-in-dogs`, `is-dog-poop-good-fertilizer`, `pooper-scooper-service-cost-arizona`, `scorpion-sting-toad-poisoning-dogs`, `why-does-my-dog-eat-poop`) and `/texts/`. Google knows them and has not read them yet. Normal for a site this new.
- Crawled, not indexed: 2. `/bonded-and-insured/` and `/one-time-dog-poop-cleanup/`. The second one is indexed now.
- Search clicks from November 4 to 16: 2. The site is new to Google.

**Request indexing, done for 10 pages** (the date is Google's last read of the page before the request):
1. `/pricing/` (Nov 17, 5:10 am, before the price change)
2. `/faq/` (Nov 9)
3. `/terms/` (Nov 10)
4. `/about/` (Nov 9)
5. `/` (Nov 18, 1:34 pm)
6. `/pooper-scooper/goodyear-az/` (Nov 17)
7. `/pooper-scooper/buckeye-az/` (Nov 17)
8. `/pooper-scooper/citrus-park-az/` (Nov 8)
9. `/pooper-scooper/buckeye-az/verrado/` (Nov 8)
10. `/blog/how-to-choose-a-pooper-scooper-service/` (Nov 11)

Google answered "Quota Exceeded" on the next one. Eleven presses went through, one of them a second press on Goodyear by mistake, so the limit is about ten a day. `/pooper-scooper/litchfield-park-az/` was skipped on purpose: Google read it on November 18 at 8:09 pm, after the price change.

**Left for the next days, in this order:** `/same-day-dog-poop-pickup/` (Google still has it "on Google" from November 11 with the $49 price: asking again makes Google see that it forwards), `/one-time-dog-poop-cleanup/`, `/contact/`, `/pooper-scooper/waddell-az/`, `/pooper-scooper/`, `/bonded-and-insured/`, `/blog/pooper-scooper-service-cost-arizona/`, `/how-it-works/`, `/our-promise/`, `/commercial-pet-waste-removal/`. Then the other six blog posts and `/texts/`.

**Sitemap.** `https://arizonapetwaste.com/sitemap.xml` was sent again. The row reads Submitted November 19, 2026, Success, 45 pages.

**Facebook.** Sharing Debugger (`developers.facebook.com/tools/debug/`), signed in as Joe in the same Chrome. Scrape Again was pressed for `https://arizonapetwaste.com/` and `https://arizonapetwaste.com/book/`. Both answer 200 and show the logo picture now. `/pricing/` had never been shared, so it has no old picture to clear. One thing seen and not explained: the home page's try from about an hour earlier read "Could not connect to server, response code 418". Nothing in this repo answers 418, and the two tries after it answered 200. If previews break again, look at the bot settings in Cloudflare (Security, Bots) first. That is Atlas's sign in.

**Doing it by script, for next time.** The address box at the top of Search Console needs a beat: close the "Indexing requested" notice, wait 2 seconds, click the box, wait 1 second, type the address, press Enter, wait 10 seconds. Then read the address printed under the box before pressing Request indexing. Twice the typed address did not take and the page still showed the one before. The request itself takes about 40 seconds.

## Nov 19, 2026, midday (website chat): Book now rebuilt after the DoodyCalls sign up, Joe's ask

Joe, 9:20 am: "research Duty Calls. They actually have something pretty set up... I like residential community. I actually like that option... How often do you need your yard cleaned? Twice weekly, Weekly, Every other week, Monthly, Just once. I like those options, and we can have those. Really dissect the get a quote and the checkout... it needs to be easy as well for the consumer."
Their sign up was walked end to end with a made up email (ZIP 85338, stopped at the checkout page, nothing paid or agreed to). The write up, with their Phoenix prices that day, is the Project doc `claude/book-now-and-doodycalls-nov-19.md`. The rules are in `CLAUDE.md` (Book now).

### What changed in the form (`design/generator/book.prod.tpl.html`)
- **First screen: "Who is this for?"** Two cards with a picture each: My home, My community. Not counted in the 4 steps. Links that say what they are for skip it (`?dogs=`, `?plan=`, `?zip=`, `?for=home`), and `?for=community` opens the community form. In the pop up, `open(o)` takes `o.who`.
- **"Good news. We scoop in Goodyear."** on the dogs screen, once a city is picked.
- **How often: five rows.** Twice weekly, Weekly (tag: Recommended, picked to start), Every other week, Monthly, Just once. The words changed from Every week, Twice a week, Every other week and One time cleanup. Plan ids did not change, and `month` is new.
- **Just once and Monthly** go: city, dogs and how often, "When was your yard last cleaned?", about you, "Send my request". No card. The old one time path had 3 steps. It has 4 now.
- **My community** is one form: kind of place, name of the place, city, name, phone, email, what they need. Button: "Get my free quote". No text box on it.
- **A missed box** now scrolls into view when Continue is tapped.
- State: `who`, `last`, `reqKind` and the `c...` fields are new. Step numbers 0 to 5 mean what they did. 6 is the community form and 7 is "last cleaned".

### What changed in the server (`src/worker/worker.js`)
- `/api/request` takes `plan: "month"` and `last` (`lt2`, `2to6`, `gt6`). `onceRequest` is now `quoteRequest` for both Just once and Monthly. Subjects: "One time cleanup request: name, town" and "Monthly cleanup request: name, town". The lead is kind `signup_request`, and its details start "One time cleanup, 2 dogs." or "Monthly cleanup, 2 dogs." and carry "Yard last cleaned: 2 to 6 weeks ago." when the form sent it.
- New route `/api/community` (`communityRequest`). Subject: "Community quote request: place, city". The lead is kind `commercial`, with the place and city in `address`, no ZIP, and details that start "Community quote request. HOA: place, city." It never touches texts: no consent row, no queued text.
- `own(map, key)`: anything a form sends is looked up with it. A plain `PLANS[b.plan]` said yes to "constructor". Sign up requests and checkout now turn that down with a 400.
- 8 new tests in `build/worker.test.mjs` (540 pass).

### For the Field App chat
- **Leads the office will see that it did not see before:** kind `commercial` rows made by the website (they used to be typed in by the office only), and `signup_request` rows whose details start "Monthly cleanup". Nothing about the table changed.
- **Monthly is not a plan yet.** There is no price, no Stripe price and no once a month route. If Joe sets a price and wants a card step, the week plan needs a once a month cadence first. The website chat does not touch route code.

### Also in this push
- `/texts/`: the step by step says to tap My home first, the two proof pictures were retaken (`?v=4`), captions say November 19.
- `GO_LIVE.md` part 10: a note that the Twilio opt in words still hold (step 3 of 4 did not change).
- Every commercial page: under Call, Text us and Email, the line reads "Free site walk. Ask for a quote online" and opens the community form (`build/biz.mjs`).
- `/contact/` and `/one-time-dog-poop-cleanup/`: links and words match the new form.
- Ad tracking: a community request sends the same `request` step (`generate_lead`, Meta `Lead`) with `plan: "community"`, and the server sends Meta a `Lead` with `lead_type: "community"`. Monthly sends `lead_type: "monthly"`.

### Checked
- The whole form by a script in Chrome at 320 by 568, 360 by 740, 375 by 667, 390 by 844, 466 by 678, 768 by 1024, 890 by 626 and 1280 by 900: every screen of the home path, the Monthly path, the community path, Back from every screen, and no sideways scroll or script error at any size.
- Every way in: `/book/`, `?plan=once`, `?plan=month`, `?dogs=3`, `?zip=`, `?for=home`, `?for=community`, a made up plan name, the Book now button in the top bar (pop up), the price card button, "Book one cleanup", the contact page link, the commercial page link, and a reload half way through.
- `npm run check` with the sale on and off, `node build/prices.mjs --check`, `node build/worker.test.mjs` (540), `node build/week.test.mjs` (76), `python3 build/nav.test.py` (68), `python3 build/sweep.py` on the nine pages whose words changed.
- Not checked: Safari and a real phone. A real request on the live site (it would email the office).

### For Joe
- **Monthly needs a price.** Until then it is "Custom quote" and the office sends one.
- DoodyCalls asks for the email before it shows a price, asks "How did you hear about us?" and lets people pick a start date. We do none of the three. Say if you want any of them.

## Nov 19, 2026, afternoon (website chat): 1, 2, 3, 4+ dogs, community quotes to info@, and Get a free quote on the commercial pages, Joe's asks

Joe, 12:03 pm: "I kind of want the booking system to be like duty calls, but let's keep it sleek, simple, and easy to understand on mobile and desktop, iPhone dual, and tablets." "If you think it's too much, let's fix that. It needs to be just simple." Then, 12:04 pm, after he looked at the live form: "Actually, it looks like you guys already did that. How many dogs? Let's do 1, 2, 3, and then do 4+. Take out the 5 and 6. Let it be easy. Twice weekly looks good. Recommended. Looks great. Everything looks good here. Okay, perfect. The commercial side: my commercial or my community, anything of that end? Make sure that gets a free quote. Make sure that goes directly to info@arizonapetwaste.com."

So there was no rebuild. Three changes and one fix:

- **How many dogs: 1, 2, 3, 4+.** The six buttons are four. It is what the DoodyCalls quote screen has (looked at again that noon: "How many pups on the property? 1, 2, 3, 4+", and their 4+ opens a box that says "Please specify the exact number of dogs"). Our 4+ opens "How many is that?" with 4 dogs, 5 dogs and 6 dogs, 4 picked to start, and "More than 6 dogs? Text us." moved in there. The form needs the exact number because 4, 5 and 6 dogs each have their own price (`src/prices.json`) and the plan is billed by the count. No price changed: 4 dogs weekly is still $134, 5 is $147, 6 is $160. `book.prod.tpl.html`: `dogOpts`, `dogsMore`, `dogMoreOpts`, `.bk-dmore`. The server did not change (it still takes 1 to 6).
- **The community card says "Free quote."** on a line of its own, in orange, on the "Who is this for?" screen.
- **Community quotes go to info@arizonapetwaste.com.** They already did when `NOTIFY_EMAIL` was unset or was that address. Now it does not depend on the setting: `quoteInbox` in `worker.js` puts info@ first and adds the office inbox only when it is another address. `mail()` takes one more optional value, who a Reply goes to, and the community email uses the email of the person who asked, so the office hits Reply. The first line of the email says "free community quote". Two new tests (542 in all).
- **Commercial pages lead with "Get a free quote".** `ctaButtons` in `build/biz.mjs`: the first button, top and bottom, opens `/book/?for=community`. Call, Text us and Email follow. From a tablet up the four sit two by two (`.bxh-four`), because three in a row left Email alone on a second row. On a phone: the quote button, the call button, then Text us and Email side by side.
- **Fix, my mistake from the morning push.** The small line under the top buttons is shared by the commercial pages and Areas we serve. The morning change added the community link to it everywhere, so `/pooper-scooper/`, a page for homes, read "No sign up fee. No long term contract.. Ask for a quote online" for about two hours. The line is back to how it was, and the link is the first button on the commercial pages.

Checked: `npm run check` with the sale on. `node build/worker.test.mjs` 542 passed. `node build/week.test.mjs` 76. `python3 build/nav.test.py` 68. The dog buttons walked in a real browser at 320, 360, 390, 466, 768 and 1280 wide and on a wide short screen (890 by 466): every button is 56 px tall or more and 64 px wide or more, no words under 15 px, nothing scrolls sideways, the prices in the rows and in the bar match the price file for 1 to 6 dogs, and `/book/?dogs=5` opens on 4+ with 5 dogs picked. The commercial buttons looked at on 390, 768, 1024 and 1280. `build/optin-shots.py` run again: the three proof pictures for Twilio came out the same to the byte, so `/texts/` still matches the form.

The crew app, the tables and the route code were not touched. Nothing here changes what the office app shows.

**One live test, sent on purpose** (Joe: "Make sure that goes directly to info@arizonapetwaste.com"). At 12:23 pm one request was posted to `/api/community` on the live site: place "TEST by Claude, please ignore", Goodyear, name "Test Request", phone 623 555 0100, email test@example.com. It was sent with no event id, so nothing went to Meta and no ad counted a lead. The server answered 200. The email was in the info@arizonapetwaste.com inbox at 12:23 pm with the subject "Community quote request: TEST by Claude, please ignore, Goodyear" (looked up in Joe's Chrome by that subject only, and left unread). The office app has one commercial lead named Test Request from this. Close it.

After the push, on the live site: the form shows 1, 2, 3, 4+, and 4+ opens 4 dogs, 5 dogs, 6 dogs with $134 a month for weekly. "Free quote." is on the community card. The commercial page has the Get a free quote button. Areas we serve reads "No sign up fee. No long term contract."

### For Joe
- 4+ asks for the exact number because 4, 5 and 6 dogs have three prices. If he wants 4+ to be one price, or a quote from the office, he says which and it is a small change.

## Nov 19, 2026, 1 pm (website chat): the audit, and the free month said louder, Joe's ask
Joe, 12:30 pm: "do an audit... make sure people find it easy to book. People haven't booked. We've gotten like 9 leads, so I'm not trying to break the whole thing... emphasize free, first month free." The whole audit, with the numbers, is the Project doc `claude/site-audit-nov-19.md`. Read it before changing the home page or the form again.

### What the numbers say (looked at about 12:45 pm, no names read out)
- **Leads.** 9 rows came from the Facebook and Instagram lead form. 1 is Meta's own test lead, 8 are people. They came in between Nov 17, 6:59 pm and Nov 19, 9:21 am. In the office app all 8 read New, and none has a "Reached in" time (`contacted_at` is empty). If someone called them from their own phone, the app does not know. 2 of the 8 gave a ZIP code outside our six.
- **Sign ups on the website.** 0 from the public. The `customers` table has 6 rows and all 6 are staff tests. No real visitor has opened the card step.
- **Visitors (Google Analytics, about Nov 12 to 18).** 135 people, 172 visits. 83 saw the home page, 44 saw `/book/`. About 1 visit in 3 lands straight on `/book/` from a Facebook ad and stays about 16 seconds. 9 people got past the first question, staff included.
- **Google search.** 2 clicks from search in two weeks. Search is not bringing people yet. Facebook is.
- **Errors.** None since Nov 17. Address suggestions are still off (Places API, Atlas, item 9 in `CLAUDE.md`).
- **Speed.** Home page 98 of 100, `/book/` 99 of 100, accessibility 100 and 98.

### What changed on the site (three small things, sale words only)
1. **The main button** on the home page and the town pages reads "Start your free month" (it was "Get the Black Friday deal"). Same outline look. The form it opens has the same words at the top. `main.tpl.html`, `city.tpl.html`.
2. **The My home card** on "Who is this for?" reads "First month free." in orange, next to "Free quote." on the community card. `book.prod.tpl.html`.
3. **The bar at the bottom of the plan step and the about you step** reads "First month free" and "Then $99 a month" (it was "$99 a month" and "Weekly, 2 dogs"). With no free month it reads as before. `priceShort` and `planShort` in `book.prod.tpl.html`.
- The step 3 proof picture on `/texts/` shows that bar, so it was retaken (`build/optin-shots.py`, `sms-optin-form.png?v=5`). The opt in words and the box did not change. The other two pictures came out the same and were left alone.
- No price, plan, step or server code changed. Checks: `npm run check`, prices, `worker.test.mjs` 542, `nav.test.py` 68, `sweep.py` on the five pages that changed.

### Not changed, and why
- The outline look of the main button (Joe's rule of Nov 15). A solid orange button would be easier to see on the video. It is his call.
- The top bar "Book now" and the price card "Book now" keep their words (`CLAUDE.md` names them).
- "Who is this for?" stays as the first screen. It is one more tap for a home. A Facebook ad can skip it by linking to `/book/?for=home`.

### For Joe, in order
1. Call or text the 8 Facebook leads today and mark each one in the office app. The oldest has waited two days.
2. Facebook ads: limit the audience to the six ZIP codes (2 of 8 leads were outside them), and send ad clicks to the home page or to `/book/?for=home`.
3. Atlas: Places API (address suggestions), and mark `sign_up`, `generate_lead` and `begin_checkout` as key events in Google Analytics so it counts them.
4. His call: a solid orange main button on the home page.

## Nov 19, 2026, 5:15 pm (website chat): the West Valley chamber Proud Member badge, Joe's ask
Joe sent the chamber's badge (WVRC_Proud_Logo.jpg) and wrote: "please add that logo instead on the website; please put at the top + footer and please link it: https://westvalleyregional.org/directory/arizona-pet-waste".
- **The badge replaced the white West Valley chamber logo** in both rows of member marks: under the trust strip on the home page and at the bottom of the footer of every page. It is the chamber's file in its own colors, scaled to 480 px tall, nothing else changed (`static/assets/img/brands/west-valley-regional-chamber-proud-member.webp`). The old white file is out of the folder.
- **It is a link** to our page in the chamber's directory, in a new tab. `src/site.config.json` "members": `"listing"` is filled in and `"link"` is true. It is a little taller than the other two (`"h": 104`): at the old height its words could not be read.
- **The listing shows the street line.** The rule was no link to a page that shows one. Joe asked for this link by its address, so it is linked, and he was told. The chamber can take the street line off the listing if he wants it hidden. No other listing changed: aPaws still has no link for the same reason.
- With a listing on file, the business data (`memberOf`) and `llms.txt` now name the West Valley Regional Chamber, by its home page.
- Also that hour: Joe asked for the full logo (the state and the name). He got `logo-horizontal.svg` and `logo-horizontal-dark.svg` as SVG and as 3000 px PNG files. Nothing on the site changed for that.

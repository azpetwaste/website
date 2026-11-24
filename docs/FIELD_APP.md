# Field App: start here

Joe calls the Arizona Pet Waste field desk the **Field App**. This file is the handoff for any new Claude chat that picks it up. Written Nov 9, 2026.
Read `CLAUDE.md` and `docs/HANDOFF.md` after this.

## What it is
One tool for a dog poop scooping company in the West Valley, Arizona. First visits are Nov 20, 2026.
- **Staff app:** arizonapetwaste.com/crew. Scoopers run their route. The office sees every route, customers, leads, texts, team, money and health.
- **Customer truck link:** arizonapetwaste.com/t/CODE. Live map, minutes away, gate photo. No app, no login.
- **Demo, no sign in:** arizonapetwaste.com/crew/?demo (500 made up yards) and arizonapetwaste.com/t/DEMO01.
- **Joe's practice copy (Nov 22, 2026):** Joe has a private Claude page with the crew app in demo mode and his own six customers, for trying buttons. The link is not kept in this repo. It is rebuilt by hand from `static/crew/index.html`, so it can fall behind the app.
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

## Nov 10, 2026: simple pass
The scooper screen is three steps for every yard: Drive, Scoop, Photo. Buttons read Directions, I'm here, Take gate photo, I can't do this yard. "Photo trouble?" holds the upload and the no photo path. Details and test counts are at the bottom of `docs/HANDOFF.md`.

## Nov 16, 2026: Back buttons and a security pass
Back, top left, on every office screen. The logo is home. The phone's back button works and no longer leaves the app. Sign in is locked after 5 wrong codes, password sign ins are refused, and the crew page only runs its own script. The database patch (`supabase/patch-2026-11-16.sql`) is on the live database, and it added the `skips` column too. The Cloudflare rate limit rule is live and the sign in code now lasts 10 minutes. Still open, for a person: turn on Captcha in Supabase (it needs the Turnstile secret key pasted in). Details, what is left for Atlas and test counts are at the bottom of `docs/HANDOFF.md`.

## Nov 18, 2026: easier office screens, and an owner who scoops
Joe asked for the time on every lead, a Health list he can read, a plainer Money screen and a Team screen that looks right for a second owner (Juan Gonzalez).
- **Leads** are cards now, on a phone too: name, date and time in, what they asked for, Call, Text, I reached them. New leads show how long they have waited. Reached leads show how fast we got to them (`leads.contacted_at`).
- **Health**: "What went wrong" groups the same problem into one card with a count, in plain words, tagged Fixed, To do, Nothing to do or Look at this. Clear the list hides what is there and deletes nothing.
- **Money**: four plain blocks. Coming in every month, Free month now (with names), Card did not go through, Started sign up and did not finish (with names and phones).
- **Team**: one card for each person with role, mobile, Runs a route and whether they have signed in. Edit name and mobile. A mobile number must be 10 digits.
- **An owner who scoops gets the yards.** `staff.scoops` is new. Before this the week plan and new sign ups gave every yard to the first person on the team when nobody had the Scooper role. That was Joe's sign in, not Juan's. Juan is set to run a route on the live database. An owner or office person who runs a route gets a "My route today" button on the Schedule.
- Database: `supabase/patch-2026-11-18.sql` is on the live database (two new columns, nothing removed).
- The training video was not rebuilt: it shows none of these four screens and every line in `docs/video/lines.json` is still true. Details and test counts are at the bottom of `docs/HANDOFF.md`.

## Nov 21, 2026: the post booking flow sends on its own (pull request, not live until Joe tests)
Twilio approved the campaign on November 19. Built on the branch `field-app/auto-texts`:
- Visit texts go through the Twilio Messaging Service: your day and time are set, one visit changed, night before, on our way, yard is done, could not service. The Texts screen is the log and the backup, with Send now and Send by hand.
- Test mode (`SMS_TEST_ALLOWLIST`): texts only go to the listed numbers.
- STOP, START, replies and delivery news come back from Twilio. A reply is emailed to the office.
- **The schedule is a day and a time, set in the Field App, and it is the one trigger** (Joe's core rule, the same day). On the customer card the office sets Service day and Time and saves. That sends the confirmation by email and text. Nothing goes to the customer before both are set: a sign up tells nobody a day, and a house with no time gets no night before and no "on our way" text. Changing the day or the time sends the new schedule. Booked houses that still need one are listed on the Schedule.
- A change for one visit: tap the yard on the Schedule, "Change this visit's time". Or move the yard to another day for this once. The customer is told that visit's new day and time.
- The night before text says the day, the set time and the 30 minute window around it, with the truck link. Routes run in time order.
- The evening run is a GitHub workflow that calls the site at 5:30 PM Arizona time.
- A gate photo text that fails sends the photo by email.
- Customer card: Customer name, My Yard status (invited or last signed in), Resend welcome email, Resend text, each with an "are you sure".
- Database: `supabase/patch-2026-11-21.sql` (adds columns only, the visit times included). It was NOT run on the live database from this chat.
- How a person tests it: `docs/TEST_AUTO_TEXTS.md`. Rules: `CLAUDE.md`, "Texts".
- The hard rule above, "No texts or calls go out by code", is replaced by those rules. Calls are still never placed by code.

## Nov 22, 2026: Preplan my days, and a Schedule that builds itself (live: Joe said "push it live" at 9:02 PM)
Branch `field-app/pre-plan`. Joe asked for it while trying the app with his six customers. The rules are in `CLAUDE.md` under Texts.
- **Preplan my days.** One button on the Schedule, under "Booked houses with no day and time yet". Pick one day or a few, tap "Plan it for me", and every waiting house gets a day, a place in the driving order and a time. Move any house to another day or leave it out. Nothing is saved and nobody is told until Confirm.
- **Lock a house to a day.** Step 3 on the Preplan screen: pick the day for any house that has to be on a certain day, and the app plans everyone else around it. Added the same night after Joe tried the first version.
- **The shortest drive.** A day of up to 12 houses is now the true shortest order, checked against every possible order in the tests. Bigger days are tightened too, about 2 percent shorter on made up days of 20 to 100 houses.
- **Confirm** saves the day and time, builds the days and sends the confirmation by email and text through the usual gate (test mode holds it). If the evening run has already gone by, tomorrow's customers get their night before email and text right then.
- **Night before email.** The evening run emails as well as texts.
- **The Schedule builds itself.** A house shows on its day as soon as it has one. The "Build this day's routes" and "Add new sign ups to this day" buttons are gone. The day strip starts at today.
- **Customers list** says "Not scheduled" in place of "Set day and time".
- The demo (`/crew/?demo`) does all of this with made up yards (`demoBuild`, `demoPre`, `demoNight`).
- No database change.

Tests run on this branch on Nov 22, 2026: week 100 of 100, desk 261 of 261 (and 155 of 155 on a database without the Nov 21 patch), worker 542 of 542, ten sign ups 40 of 40, nav 68 of 68, `npm run check` passes. Fifty sign ups: 130 pass and 1 fails ("only Monday to Friday is used"). That one fails the same way on `main` without this change, so it is not from this branch. It was not looked into.
Walked in a browser at phone size in the demo: plan one day, plan two days, move a house, confirm, the Texts tab, a house set by hand showing on its day, My route.

Not run: the signed in app against the live database. No real customer was scheduled, emailed or texted.
Not done yet: the training video and the training page steps. They still show the Schedule with the old buttons. Rebuild them before this goes live (the standing rule), once Joe is happy with the screens.
Answered Nov 24, 2026 (one text, see below). It was an open question for Joe: a customer planned for tomorrow gets two messages close together when the plan is confirmed in the evening, the confirmation and the night before reminder. Say so if one is enough.

## Nov 23, 2026: a way back into every yard (live the same day on Joe's "fix all that right now")
What happened: on the first real route, Juan marked the first house "I can't do this yard" (gate locked). The customer texted that the gate was open. He did the yard, and the office uploaded the gate photo by hand at 1:10 PM. The visit still read Not done and no done text went out, because the office upload only finished a visit that was still open. The crew app also had no way back into a yard once it was closed, and no way to change a note.
- Fixed by hand that day: stop 4 was set to Done at the photo time (12:33 PM) in the database, and the done text was sent from the Texts screen at 1:40 PM. It was delivered.
- Crew app: a Not done yard has a red box at the top of My route with "Go back and do this yard". Every yard in the list opens and shows its note, with "Add a note" or "Change my note". The open yard shows the note with a Change link, and the day's yards are listed under it.
- Office: a gate photo uploaded on a Not done visit marks it Done and sends the done text (it asks first). "Mark this visit done" shows for a visit that has its photo. "Add a note" or "Change the note" is in the yard menu.
- Tested: `build/desk.test.mjs` (22 new checks: the note, going back, finishing, the office upload, mark done, one done text only), a walk of the demo in a real browser at phone size, `npm run check`, `worker.test.mjs`, `week.test.mjs`, `nav.test.py`. Not run: `sweep.py`, the two sign up load tests, and no test on a real phone.
- One check in `desk.test.mjs` fails on `main` too, before this change: "the plan for one day has every waiting house on it, with a time for each" (Preplan). Two houses get 8:00 AM. Somebody should look at it.
- The training video was NOT rebuilt. The written steps on the training page were updated.

## Nov 24, 2026: one text not two, and no schedule text after 7 PM (live the same day, Joe: "fix number one, and then obviously fix number two")
Joe asked how many texts a customer gets in the whole flow. The answer from the code and the live log: first visit 4 texts (day set, night before, on our way, done) and 2 emails (welcome, night before). Every visit after that 3 texts and 1 email. About 13 texts a month for a weekly customer. Two problems showed in the log.
- **Two texts back to back.** On Nov 23 at 5:30 PM two customers got "your service day is" and "we will be there tomorrow" in the same minute, and a third got them 37 minutes apart. The day texts had been written at 9:13 PM the night before, held, and sent by the evening run together with the night before texts. Now a customer whose next visit is tomorrow gets one text, the night before text. The day email still goes. This also closes the open question from Nov 22 ("a customer planned for tomorrow gets two messages close together").
- **A text at 9:10 PM.** On Nov 22 the day text for the first customer was held at 9:09 PM, as the rule said, and then sent at 9:10 PM by an owner sign in with "Send now" on the Texts screen. That button skipped the hours. Now the hours are 8 AM to 7 PM and no button skips them: "Send now" and "Send the night before text now" say the hours and send nothing.
- Not changed: on our way, done and can't do texts go whenever the crew taps, at any hour.
- The Preplan confirm note and the customer card note say the new rule in plain words. No scooper screen changed, and the training video does not say the text hours, so the video was not rebuilt.
- Tested: `build/desk.test.mjs` 300 of 301 (15 new checks: the 8 to 7 default, one text for a visit tomorrow before and after the evening run, the day email still going, "Send their day and time again", a held day text marked skipped, a held day text for a later visit still going, both buttons refused outside the hours). `week` 100 of 100, `signup10` 40 of 40, `nav` 68 of 68, `npm run check`, `prices --check`.
- Failing on `main` before this change and still failing, not looked at here: `desk` 1 (Preplan: two houses get 8:00 AM), `worker` 1 of 587 (Meta gets the month price), `signup50` 2 of 131 (a prepaid card is flagged to the office, no server crashes logged).
- Not run: a real text to a real phone. Nothing was sent to a customer for this.
- Kill switch: `ONE_TEXT=off` in Cloudflare goes back to both texts. `SMS_HOURS` moves the hours. `/api/health` shows the hours as `textHours`.

## Nov 24, 2026: Directions drives to the house's confirmed pin
Joe: "My tech hit Get Directions, and it was trying to take him on a wild goose chase... I don't even know if we're using the proper tool."
- **What happened.** Juan's third house, 24313 W Grove St in Buckeye, is new. The button sent Google Maps "24313 W Grove St 85396, AZ". Google does not have that house and matched it to W Grove St in Litchfield Park: a 22 minute, 14 mile drive east. The real house was 4 miles south. The truck trail shows him start north at 11:20 and turn around. The exact link was run in a browser and gave the same wrong route. The pin on file for that house was right.
- **All 8 houses were tested the same day.** 1 link went to another town (Grove St). 1 house has no pin (30232 W Columbus Ave: the Census lookup found nothing, so Preplan lists it under "Not on the map"). 1 pin is a quarter mile off (17959 W Townley Ave). The other links land on the right house.
- **The fix that is live.** A finished visit saves where the truck was parked as the house's confirmed pin, and Directions drives to it. A house with no confirmed pin yet gets its full address, now with the city and the state. The button looks the same, so the training video was not rebuilt.
- **Confirmed by hand from the truck trail, Nov 24:** the four houses visited so far (see the database, `pin_at` is set).
- **Is Google Maps the right tool?** Yes. The research is in the Project doc `claude/directions-and-maps-tools-nov-24.md`. A map link is free at any size, and every route and field service app looked at hands off to a map app the same way. No paid tool finds brand new homes better than Google. The thing to buy later is a truck tracker or a real phone app, so the truck link does not freeze when the worker is in Google Maps (26 minutes with no GPS on Nov 24). Joe's standing call on that is to wait until about 50 houses.
- **Still open.** A first visit to a house Google does not have still gets words. Next piece: check each new house before its first visit (compare Google's match with our pin, flag the ones that disagree) and let the office move the pin on a map. That piece changes office screens, so it comes with a video rebuild.
- Tested: `build/desk.test.mjs` 309 of 310 (9 new checks: the full address, the pin saved at a finished visit, the link as a pin, a tap made down the road, a test visit miles away, a visit outside our towns, no GPS, an address typed in full, a new address clearing the pin). The demo was opened in a real browser at phone size and the Directions link read. Not run: the link on Juan's phone.

## Open items
1. Staff test: someone signs in at /crew inside the Claude browser pane, then Claude runs a test yard through a route. A test customer "TEST Yard (delete me)" sits in the live database for this. Delete it after.
2. Test sign up at `/book/?test=1` with card 4242 4242 4242 4242.
3. Atlas: `RESEND_API_KEY`, `MAIL_FROM`, `NOTIFY_EMAIL` in Cloudflare Pages. Stripe live keys after the road test.
4. Truck start: type it once in Plan the week, "Where the truck starts each day" (saved in `settings`, no Cloudflare step). Joe said "208 East East View Way". That exact address was not found, so it is not set yet.
5. Done Nov 16, 2026: the `skips` column is on the live database.
6. Twilio approval, then wire sending into `queueText`.
7. The training video shows the older Today screen. Re-record when the screens settle.

## Decided, do not reopen without Joe
- Location needs the crew app open and on screen. Joe chose to wait on background tracking until about 50 houses. Then: the Traccar Client app first, a real App Store app later.
- Joe wants to sell this tool to other companies later. It is single company today. Making it multi company is a database rebuild, planned for after launch.
- A scooper can send the customer texts from the route screen. Those come from the scooper's own number unless they carry the business phone, 623.309.6104.

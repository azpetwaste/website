# Grokbot: put arizonapetwaste.com live on Cloudflare

Use info@arizonapetwaste.com for every account. Never paste a password, API key or secret into a chat. Keys go only into the settings screens named below. Do everything in TEST mode first. Switch Stripe to live money only after step 7 passes.

## 1. GitHub (where the website code lives)
1. Create a GitHub account with info@arizonapetwaste.com (or use Joe's) and a PRIVATE repository named `arizonapetwaste`. Leave it empty.
2. Joe connects GitHub to Claude: claude.ai > Settings > Connectors > GitHub > Connect, and gives it access to the `arizonapetwaste` repository. Then Joe tells Claude "repo is <owner>/arizonapetwaste" and Claude pushes the code.
3. Backup if step 2 is slow: unzip `arizonapetwaste-site.zip` and upload every file and folder with GitHub > Add file > Upload files.

## 2. Cloudflare (hosting, domain, security)
1. Create a Cloudflare account (Free plan). Add the site `arizonapetwaste.com`.
2. Cloudflare copies the current DNS records. BEFORE changing anything, compare them with the current DNS host and make sure every MX and TXT record for email is copied exactly, so info@arizonapetwaste.com keeps working.
3. At the current registrar (the old partner's account), change the nameservers to the two Cloudflare gives you. Later, transfer the domain itself into Cloudflare Registrar so it sits in Joe's account.
4. Workers & Pages > Create > Pages > Connect to Git > pick `arizonapetwaste`.
   Framework preset: None. Build command: `npm run build`. Build output directory: `dist`. Root directory: leave blank.
   Environment variable: `NODE_VERSION` = `22`. Save and deploy.
5. Pages project > Custom domains: add `arizonapetwaste.com` and `www.arizonapetwaste.com`. Then Rules > Redirect Rules > use the template "Redirect from WWW to root".
6. Pages project > Settings > Variables and Secrets (Production) add these after steps 3 to 5 below give you the values:
   `SUPABASE_URL`, `SUPABASE_ANON_KEY` (Supabase publishable key), `SUPABASE_SERVICE_ROLE_KEY` (Supabase secret key, type Secret),
   `STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY` (Secret), `STRIPE_WEBHOOK_SECRET` (Secret),
   `RESEND_API_KEY` (Secret), `MAIL_FROM` = `Arizona Pet Waste <info@arizonapetwaste.com>`, `NOTIFY_EMAIL` = `info@arizonapetwaste.com`,
   `SITE_URL` = `https://arizonapetwaste.com`, `FIRST_VISIT_FROM` = `2026-11-20`.
   After saving, go to Deployments and redeploy the latest one so the settings load.
7. AI search: in the Cloudflare security or AI Crawl Control settings, do NOT block AI crawlers and leave "managed robots.txt" off. The site's own robots.txt already welcomes Google, Bing, ChatGPT, Claude and Perplexity.
8. Turn on Web Analytics for the Pages project (free, no cookie banner needed).

## 3. Supabase (sign in and customer records)
1. Create a project named `arizonapetwaste` (region: West US). Save the database password in a password manager.
2. SQL Editor > New query > paste all of `supabase/schema.sql` > Run.
3. Authentication > Sign In / Providers > Email: on. Email OTP length: 6. Email OTP expiration: `600` seconds.
4. Authentication > Emails > Templates. In BOTH "Confirm signup" and "Magic link" set:
   Subject: `Your Arizona Pet Waste code`
   Body: `<h2>Your code is {{ .Token }}</h2><p>Type this code on arizonapetwaste.com to sign in. It works for 10 minutes.</p><p>Did not ask for this? You can ignore this email.</p>`
5. Authentication > Emails > SMTP Settings: turn on custom SMTP. Host `smtp.resend.com`, port `465`, username `resend`, password = the Resend API key, sender `info@arizonapetwaste.com`, sender name `Arizona Pet Waste`.
6. Authentication > URL Configuration: Site URL `https://arizonapetwaste.com`. Authentication > Rate Limits: emails per hour 100.
7. Project Settings > API Keys: copy the Project URL, the publishable key and the secret key into Cloudflare (step 2.6).
8. SQL Editor > New query > paste all of `supabase/crm.sql` > Run. This turns on the field desk at arizonapetwaste.com/crew (crew app, office, truck links, private gate photo bucket).
9. Lock the sign in (added Nov 16, 2026, see "Security pass" in `docs/HANDOFF.md`). Our server locks an email after 5 wrong codes, but anyone can also send guesses straight to Supabase with the public key, so these three settings matter:
   - DONE Nov 16, 2026: "Email OTP expiration" is `600` seconds (10 minutes), and both email templates in step 4 say "It works for 10 minutes".
   - NOT DONE, the switch was off on Nov 16, 2026. It needs a person, because it means pasting a secret key. Authentication > Attack Protection (older name: Bot and Abuse Protection): turn on Captcha with Cloudflare Turnstile and paste the Turnstile secret. Put the Turnstile site key in Cloudflare Pages as `TURNSTILE_SITE_KEY` FIRST, or sign in breaks. Test customer and staff sign in right after.
   - Checked Nov 16, 2026: Authentication > Rate Limits has "token verifications" at 30 per 5 minutes for each address. Leave it there or lower.
10. SQL Editor > New query > paste all of `supabase/patch-2026-11-16.sql` > Run. (Already part of `crm.sql` for a new project. Done on the live project on Nov 16, 2026.)

## 4. Resend (email that does not land in spam)
1. Create an account. Domains > Add `arizonapetwaste.com`. Add the DNS records it shows in Cloudflare DNS (set them to DNS only, gray cloud). Wait for Verified.
2. API Keys > Create (sending access). Put it in Supabase SMTP (step 3.5) and in Cloudflare as `RESEND_API_KEY`.

## 5. Stripe (payments, first month free)
Stay in Test mode for now.
1. Settings > Public details: business name Arizona Pet Waste, phone 623.309.6104, support email info@arizonapetwaste.com, website https://arizonapetwaste.com, Terms https://arizonapetwaste.com/terms/, Privacy https://arizonapetwaste.com/privacy/. Set a shortened statement descriptor of 10 letters or less, such as `AZPETWASTE`: on the first charge after a free month Stripe writes over everything past the 10th letter with `* TRIAL OVER`.
2. Settings > Branding: upload the state logo (`static/assets/img/icon-512.png`), accent color `#FF4A1C`, brand color `#0A0F24`.
3. Settings > Billing > Customer portal: turn on. Allow update payment method, view invoices, cancel subscription (at end of billing period). (Since November 17, 2026 customers do not reach this page from My Yard: Joe wants them to call or text the office to change a card or cancel. Keep the portal saved with update payment method on, because the button in a failed card email opens its card page.) Leave "Pause subscription", "Switch plan" and "Update quantities" OFF: pausing is done in My Yard, which holds it back for the first 60 days. Save. The portal is saved one time in test mode and one time in live mode. "Update payment method" has to stay on: the button in our "Your card did not go through" email opens this portal straight on the card page.
4. Settings > Billing > Subscriptions and emails: turn on "Send a reminder email 7 days before a free trial ends" (the card networks ask for this). Leave "Send emails when card payments fail" OFF: the site sends its own branded email the same day, a reminder while Stripe keeps trying and a last notice, and two emails for one failed payment would confuse people. Know this about the trial reminder: a customer whose pause runs past their bill day gets it too, 7 days before the day they come back, because Stripe holds that pause as a free trial. The date and the amount in it are right.
5. Billing > Revenue recovery > Retries: Smart Retries on (new accounts start with up to 8 tries in 2 weeks). "If all retries for a payment fail": pick **Mark the subscription as unpaid** (Joe, November 16, 2026: "Don't cancel subscriptions automatically; we'll handle that"). The plan stays in place, Stripe stops trying, the office gets an email that starts with PAUSE SERVICE, and canceling is the office's call. While a plan is unpaid Stripe still makes a bill each month but leaves it as a draft and does not charge it. If this is left on "Cancel the subscription", Stripe cancels the plan after the last try, and the PAUSE SERVICE email says that it did. Leave both "Pause the subscription" choices off.
6. Settings > Payment methods: cards, Apple Pay and Google Pay on. Turn the others off (bank debits, Cash App Pay, Amazon Pay, pay later). Link can stay on or off here: our card form asks for cards only and switches Link off for each sign up, so it shows no Link box, no extra phone field and no Bank tab. Turning the others off still matters: if Stripe ever refused the way we ask, the card form would fall back to every way to pay that is on here (the Health tab in /crew says so when that happens). Settings > Payment method domains: add `arizonapetwaste.com` and `www.arizonapetwaste.com`. Add them in LIVE mode (that covers test mode too). Apple Pay and Google Pay do not show on our card form until this is done. If Stripe shows a file to put on the site for Apple Pay, hand the file to Claude: it goes in `static/.well-known/`.
7. Developers > Webhooks (or Workbench > Event destinations) > Add endpoint `https://arizonapetwaste.com/api/stripe-webhook`.
   Payload format: pick **Snapshot**. Stripe offers "Thin" first and marks it as the one to use. Do not take it: a thin event carries no details, the site refuses it, and cancels, failed payments and paid bills would not reach the office. (If one is set up as thin by mistake, Stripe shows its deliveries as failed with "This webhook needs snapshot events", and /crew > Health says the same.)
   Events, all seven: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`, `customer.updated`.
   If it asks for an API version, take the newest one. Copy the signing secret into Cloudflare as `STRIPE_WEBHOOK_SECRET`.
8. Developers > API keys: copy the test publishable key and secret key into Cloudflare. Redeploy.
Prices and products are made by the website on the first sign up, in test mode and again in live mode. Nothing to create by hand.

How a plan is billed (Joe, November 16, 2026): every customer has their own bill day, and no bill is ever for a part month.
- With a free month (the Black Friday sale, sign ups through November 30, 2026): sign up saves the card and charges $0. The card form is a Stripe Checkout Session in setup mode. The moment the card is saved, the server starts the plan itself (`startPlan`): free until the free month ends (`trial_end`), and no other day is sent. The day the free month ends, Stripe charges the full month price, and it charges it on that day of each month from then on.
- With no free month (from December 1, 2026): the card form is Stripe's own plan checkout. It charges the full month price in the form, and the sign up day is the bill day. The site books the yard when Stripe says the first month is paid (`paidPlan`).
- The sale end is one date in two places: `FREE_MONTH_UNTIL` in `src/worker/worker.js` (checkout) and `DEAL_END` in `build/build.mjs` (the words on the site). To move it without a new build, set `FREE_MONTH_UNTIL` in Cloudflare Pages to a time like `2026-12-01T06:59:59Z`.
- To try a sign up that pays today while the sale is still on, open `https://arizonapetwaste.com/book/?nofree=1`. It charges a real card. Refund the charge and cancel the plan in Stripe when done.
- A payment fails (Joe, November 16, 2026): Stripe's Smart Retries do the retrying, and the site never cancels a plan over it. On the first failed try the customer comes off new routes and gets a branded email, "Your card did not go through", with an Update my card button. The button opens Stripe's own card page with no sign in, and it works for 30 days. A text waits in the office Texts tab for staff to send. While Stripe keeps trying they get a reminder at most every 5 days. When Stripe stops trying they get a last notice. The office gets an email for every failed try, "Card failed: name, address ($ amount, try N)", and one that starts with PAUSE SERVICE when Stripe stops. When the bill is paid they are back on, they get a thank you, and the office gets "Paid".
- A pause (Joe, November 16, 2026): no bill goes out while a customer is paused and nothing is prorated. Back before their next bill day: nothing changes. Still paused on their bill day: that bill is skipped, the full month is charged on the day they come back, and that day is their bill day from then on. In Stripe a pause that skips a bill shows the plan as Trialing until the return day. That is the pause, not a second free month. Do not change it by hand.
- Try the pause (a person, in a Stripe sandbox, before January 19, 2027). Make a test clock. Put a customer on it with test card 4242 4242 4242 4242 and a monthly plan, and move the clock a few days. Then send the plan the same change My Yard sends for a pause that runs past the bill day. In the Stripe shell (Developers, Shell) that is `stripe subscriptions update sub_XXX -d trial_end=UNIX_TIME -d proration_behavior=none`, with a time a few days after the next bill day. Move the clock past the old bill day: no bill should appear. Move it to the trial end: one bill for the full month, paid, and the next bill one month after that day.
- A customer who changes their card in My Yard while on hold: the open bill is tried on the new card right away (that is what `customer.updated` is for).
- Right after each free month plan is made, the server asks Stripe what the first bill will be and holds it up against what the customer saw (one full month, on the day the free month ends). If they do not match, the office gets an email that starts with "CHECK BILLING". Nothing is charged at that point. Do not change the plan by hand: tell Joe.
- If the plan does not start after the card is saved, the office gets "ACTION NEEDED". The site tries again on its own. Never start a second plan by hand: two plans means two bills.

## 6. Check the setup
Open https://arizonapetwaste.com/api/health. It must say `"live":true`. If it says false, a key is missing in Cloudflare.
The same line shows three more things, and never a key:
- `"keys"`: `"test"` or `"live"` is which Stripe mode both keys are for. `"mixed"` means one key is a test key and the other is a live key. That cannot work: fix it before anyone signs up.
- `"hook"`: true when `STRIPE_WEBHOOK_SECRET` is set.
- `"mail"`: true when `RESEND_API_KEY` is set.
If the webhook secret is set but is the wrong one (the test mode secret with live keys, say), /crew > Health shows the line "A Stripe event was refused: its signature does not match STRIPE_WEBHOOK_SECRET". Sign ups still work then, but cancels, failed payments and paid bills do not reach the office until it is fixed.

## 7. Test on a phone and a computer (Joe)
While the Stripe test keys are in Cloudflare, the public gets the "we call you" sign up. Open `https://arizonapetwaste.com/book/?test=1` to turn real checkout on for that browser tab.
1. Tap your city, pick dogs and how often, fill in your real email, check the visit texts box.
2. A new email gets no code: the card step opens right away (step 4 of 4). An email that has had a plan before, or a staff email, gets the 6 digit code first.
3. Write down the price line the pay step shows ("$0 today. Then $99 a month starting Dec 16." for a weekly plan with 2 dogs and a sign up on November 16: the price comes from `src/prices.json`, and the date is one month from the day you sign up). The line under it reads "Cancel anytime. Call or text 623.309.6104." The card form shows a card box only: no Link box, no extra phone field, no Bank tab. Pay with test card `4242 4242 4242 4242`, any future date, any 3 numbers.
4. You see "You are booked!". You get the booking email at info@arizonapetwaste.com and the customer email, one of each.
5. Supabase > Table Editor > customers shows the row with status `trialing`. In Stripe (test mode) the customer has one subscription, status Trialing. Its trial ends on the day from step 3. Its "Upcoming invoice" is one full month at the plan price on that day, and the bill after it is one month later on the same day of the month. No bill is for a part month. The customer's default payment method is the test card. The server makes this same check on its own for every sign up: no "CHECK BILLING" email at info@arizonapetwaste.com and no such line in /crew > Health means Stripe agreed.
6. Stripe > Developers > Webhooks > the endpoint: every delivery says 200.
7. Tap the My Yard link in the welcome email (it signs you in for 7 days), save a gate code. Since November 17, 2026 My Yard has no "Change card or cancel" button: it says to call or text the office (Joe). The card page is still opened by the button in a "Your card did not go through" email.
8. Failed payment drill (test mode only). In Stripe open the test customer, add test card `4000 0000 0000 0341` and make it the default. Open the subscription > Actions > End trial now. Within about an hour Stripe tries the bill and it fails. Check: the customer email "Your card did not work", the office email "Card failed", a "card failed" text in /crew > Texts, status "Card problem" and the "Your card did not work" box in My Yard. Then make `4242 4242 4242 4242` the default again in "Change my card": the bill is paid right away, the customer gets "Your payment went through", and My Yard is back to normal.

## 8. Live money
1. Delete the test sign ups first: Supabase > Table Editor > customers, remove the rows made in test mode. A row left from test mode blocks that email, phone and address from signing up again (one free month per home) and its Stripe ids mean nothing to the live keys.
2. Switch Stripe to live mode. Repeat Stripe steps 1 and 3 to 7 in live mode: live mode has its own portal settings, its own retry and email settings, its own payment method domains and its own webhook with its own signing secret.
3. Put the live publishable key, live secret key and live webhook secret into Cloudflare (`STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`). Redeploy the latest deployment so the settings load.
4. Open https://arizonapetwaste.com/api/health: `"live":true,"keys":"live","hook":true,"mail":true`. Open /book/ with no `?test=1`: the pay step shows the card form (the live key turns real checkout on for everyone on its own).
5. Do one real sign up with your own card. You are charged $0. Check Stripe live mode the same way as step 5 of the test. Then look at Stripe > Developers > Webhooks: the live deliveries say 200. A 400 there means the webhook secret in Cloudflare is not the live one. Then cancel it in My Yard. Nothing is charged for canceling (the 60 day rule is off since November 16, 2026).

Every setting the live site reads in Cloudflare Pages > Settings > Variables and Secrets:
- Must have: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.
- Mail (without these no email leaves the site: no welcome, no "card did not work", no office notice): `RESEND_API_KEY`, `MAIL_FROM`, `NOTIFY_EMAIL`.
- Ads (Meta Conversions API, the server's copy of each booking and lead): `META_CAPI_TOKEN` (Secret, from Meta Events Manager, Settings, Generate access token for pixel 1982997959354953). `/api/health` reads `"meta":true` once it is in. Optional: `META_TEST_CODE` while testing in Events Manager's Test events tab (take it out after).
- Facebook and Instagram lead forms (part 11): `META_APP_SECRET`, `META_VERIFY_TOKEN`, `META_PAGE_TOKEN` (all three as Secret). `/api/health` reads `"leads":true` once all three are in. Optional: `META_PAGE_ID` when the token can act for more than one Page.
- Good to set: `SITE_URL` (`https://arizonapetwaste.com`), `GOOGLE_MAPS_BROWSER_KEY`, `GOOGLE_MAPS_SERVER_KEY`, `TURNSTILE_SITE_KEY`, `CRON_SECRET`.
- Only to change a default: `FIRST_VISIT_FROM` (2026-11-20), `SCHEDULE_DAYS` (7), `FREE_MONTH_UNTIL` (2026-12-01T06:59:59Z, the last moment a sign up gets a free month), `STOPS_PER_DAY`, `WORK_DAYS`, `ROUTE_START`, `ROUTE_START_LABEL`.
- Build setting: `NODE_VERSION` = `22`.

## 9. Google, Bing, Apple
1. Google Search Console: add a Domain property for arizonapetwaste.com (verify with the TXT record in Cloudflare DNS). Submit `https://arizonapetwaste.com/sitemap.xml`.
2. Bing Webmaster Tools: import the site from Google Search Console (Bing feeds ChatGPT search and Copilot).
3. Google Business Profile: service area business, hide the address, service areas Buckeye, Waddell, Goodyear, Litchfield Park. Website https://arizonapetwaste.com. Phone 623.309.6104.
4. Apple Business Connect: same details.
5. Send Claude the URLs for the Google Business Profile, Facebook, Instagram, Nextdoor, BBB and Chamber pages when they exist. Claude adds them to the site footer and to the business data Google reads.

## 10. Texting (Twilio A2P 10DLC), after the site is live
Brand: Arizona Pet Waste. Website https://arizonapetwaste.com. Use case: it was sent in as Mixed (account notifications and marketing). Since November 17, 2026 the site asks for service texts only (Joe took the deals box out of My Yard), so the campaign must not describe or sample a marketing text. If the campaign is made new, pick a service use case (Account Notification or Customer Care).
Twilio turned the first campaign down (error 30909, Joe passed it on November 15, 2026): the reviewer could not check how customers agree to texts, because the text boxes were on step 3 of 5 of `/book/` (it is one box on step 3 of 4 since November 16, 2026). The fix is public proof on the site. Use the text below when you send it in again.
Proof pages (all public, no sign in):
- Walk through with the exact words: https://arizonapetwaste.com/texts/#opt-in-form
- Screenshot of step 3 of 4: https://arizonapetwaste.com/assets/img/sms-optin-form.png
- Screenshot of the waitlist form: https://arizonapetwaste.com/assets/img/sms-optin-waitlist.png
- Terms: https://arizonapetwaste.com/terms/ (see Text messages). Privacy: https://arizonapetwaste.com/privacy/ (see Text messages). Text terms: https://arizonapetwaste.com/texts/

Opt in description, also called Message flow or Call to action (changed November 17, 2026: service texts only. The sign up form has 4 steps and one box. My Yard has the same one box. No screen asks for deals texts. The limit is 2,048 characters):

> Service texts only. We do not send marketing texts. Customers opt in on our website sign up form at https://arizonapetwaste.com/book/. The form has 4 steps. Step 3 of 4, "Tell us about you", is where the customer types a mobile phone number. On that same step, under the heading "Texts from us", is one optional checkbox, unchecked by default: "Text me about my visits. * Recommended. Setting your day, night before reminders, on the way, and your gate photo. About 2 to 4 texts a visit." Under it: "By checking the box, you agree to get texts from Arizona Pet Waste at the number above. Message and data rates may apply. Reply STOP to stop or HELP for help. You do not have to agree to texts to book. See our Text Terms and Privacy Policy." Text Terms links to https://arizonapetwaste.com/texts/ and Privacy Policy links to https://arizonapetwaste.com/privacy/. Texts are never required to buy: a customer who leaves the box empty books the same way and gets email. The same single checkbox is in the customer's account page (My Yard, https://arizonapetwaste.com/account/), so a customer can turn visit texts on or off later. There is no marketing checkbox on any screen. Public proof, since the box is not on a first screen: screenshot of sign up step 3: https://arizonapetwaste.com/assets/img/sms-optin-form.png. Screenshot of the My Yard box: https://arizonapetwaste.com/assets/img/sms-optin-myyard.png. Exact words and a walk through: https://arizonapetwaste.com/texts/#opt-in-form. To see it live, open /book/, tap a city, then tap Continue. People outside our service area can join a waitlist on step 1 of the same form ("My city is not here"), with one optional unchecked box for one text: https://arizonapetwaste.com/assets/img/sms-optin-waitlist.png. We keep a record of each choice with the date, time and IP address.

November 19, 2026: before step 1 the form now asks "Who is this for?" with two buttons, My home and My community. My home leads to the same 4 steps, and step 3 of 4 and every word on it are as they were, so the description above still holds. A reviewer who walks the form taps My home first (`/texts/` says so in its step by step). My community opens a quote form with no text box: it says "We call or email you about your quote. We do not text you from this form." Just once and Monthly have no card step, so for those two "Tell us about you" is step 4 of 4, with the same box and the same words. The two proof pictures were retaken that day.

If deals texts ever come back: Twilio error 30913, "Marketing and informational consent must be separate". One box that covers both gets the campaign turned down. A deals box must be its own unchecked box, never part of the visit box, and the campaign must be changed to say so before one deals text goes out.

If the words or the look of the sign up form change, run `python3 build/optin-shots.py` and update the quotes in `content/policies/texts.html` and in the text above, so all three still match the live form.

Sample messages (changed November 17, 2026: they now read like the texts the server writes in `textBody`, and the deals sample is gone):
1. Arizona Pet Waste comes tomorrow. Please unlock the gate and keep your dogs inside. Reply STOP to opt out.
2. Arizona Pet Waste: We are on the way. See our truck: arizonapetwaste.com/t/AB12CD
3. Arizona Pet Waste: Your yard is done. See your latched gate: arizonapetwaste.com/t/AB12CD Missed a pile? Reply and we come back within 24 hours.
4. Arizona Pet Waste: We could not service your yard today because the gate was locked. Reply and we will set a time.

The old sample 4 ("Guests coming over? ... from $99") was a deals text. With no deals box there is nobody who agreed to get it, so it must come out of the campaign. If it was already sent to Twilio, swap it on the next edit.

## 11. Facebook and Instagram lead forms (Meta lead ads)
A lead form on Facebook or Instagram (an Instant Form) never touches the website. Meta keeps the answers. To get each lead to info@arizonapetwaste.com and into the office app, Meta has to send the site a notice for every new lead, and the site has to be allowed to read the lead. The site side is built (`/api/meta/leadgen` in `src/worker/worker.js`). The Meta side below needs a person who is an admin of the Arizona Pet Waste business portfolio. Nobody pastes a token into chat, email or GitHub: tokens go from Meta straight into Cloudflare.

Until this is done, new leads sit in Meta only. Read them in Meta Business Suite, Leads Center, or in Ads Manager by opening the form and downloading the leads. Meta has no email of its own for each new lead.

What you put in Cloudflare Pages > Settings > Variables and Secrets (all three as Secret, in Production):
- `META_APP_SECRET`: the Meta app's App secret (step 3).
- `META_PAGE_TOKEN`: a system user token that can read the Page's leads (step 5). The site turns it into the Page's own token by itself.
- `META_VERIFY_TOKEN`: any long word you make up, 20 letters and numbers or more (step 7).

Steps:
1. Go to developers.facebook.com > My Apps > Create app. Pick the use case "Capture & manage ad leads with Marketing API". Connect the app to the business portfolio that owns the Arizona Pet Waste Page. One app is enough. If the business already has an app with that use case, use it.
2. In the app, open Use cases > "Capture & manage ad leads with Marketing API" > Permissions and features. Add every one it lists (`leads_retrieval`, `pages_show_list`, `pages_read_engagement`, `pages_manage_ads`, `ads_management`, `ads_read`, `business_management`) and also the optional one `pages_manage_metadata`. That last one lets the Page send its lead notices to the app.
3. App settings > Basic: press Show next to App secret and put it in Cloudflare as `META_APP_SECRET`. On the same page fill in the privacy policy address (`https://arizonapetwaste.com/privacy/`), the category, an app icon and the user data deletion box (the privacy page address works). Meta asks for those before it lets you publish.
4. Publish the app. Meta's own words: "To receive webhook notifications your app must be published." An app that is still in development only gets test leads from people who have a role on the app. App Review is not needed: we only read leads from our own Page.
5. Make the token. Business settings (business.facebook.com/settings) > Users > System users > Add. Name it `apw-site`, role Admin. Press Assign assets and give it the Page Arizona Pet Waste with full control, and the app from step 1. Press Generate token, pick the app, set the token to never expire, and tick `leads_retrieval`, `pages_show_list`, `pages_read_engagement`, `pages_manage_metadata`, `pages_manage_ads`, `ads_management` and `business_management`. Copy the token and put it in Cloudflare as `META_PAGE_TOKEN`. Meta shows it once.
6. Lead access. Business settings > Integrations > Leads Access > pick the Page. If lead access was never customized there, every Page admin can read leads and there is nothing to do. If it was, add the system user `apw-site` under People and the app under CRMs. Without this Meta refuses to hand over a lead even with a good token.
7. Make up the verify word and put it in Cloudflare as `META_VERIFY_TOKEN`.
8. Redeploy the site in Cloudflare Pages (Deployments > the newest one > Retry deployment). A setting only counts after a new deployment. Then open https://arizonapetwaste.com/api/health: it must read `"leads":true`.
9. Back in the Meta app: Webhooks. Pick Page in the list at the top. Callback URL: `https://arizonapetwaste.com/api/meta/leadgen`. Verify token: the word from step 7. Press Verify and save. Then find `leadgen` in the list of fields and press Subscribe.
   - The moment Meta checks the address, the site sets the Page to send its leads to the app (so there is no Graph API Explorer step) and emails info@ either "Facebook leads are connected to the site" or "Facebook leads: the setup needs one more step" with what is missing.
   - To see the same thing in a browser, open `https://arizonapetwaste.com/api/meta/leadgen?check=` with your verify word after the equals sign. It must read `"ok":true` and `"subscribed":true`. The `note` says what is missing when it does not.
   - Only if the note says the site could not set the Page: do it by hand in Meta's Graph API Explorer. Pick the app, get a Page token for Arizona Pet Waste with `pages_manage_metadata`, switch GET to POST, type `{page-id}/subscribed_apps?subscribed_fields=leadgen` with the Page's id, and press Submit. It answers `"success": true`.
10. Send a test lead. Open developers.facebook.com/tools/lead-ads-testing, pick the Page and the form (the Black Friday form is 1537873488145115), press Create lead. Meta lets you make one test lead per form, so press Delete lead first if one is there. Within a minute info@ gets "Test lead from Facebook: the lead link works" and the lead shows in the office app under Leads. The tool's Track status button shows whether Meta reached the site.

How the site handles a lead:
- Every notice has to be signed with the app secret. An unsigned notice, or one signed with another secret, is refused and nothing is read.
- The lead is read from Meta, saved in the `leads` table as a sign up request (the details start with "Facebook lead ad." or "Instagram lead ad." and end with the Meta lead id), and emailed to `NOTIFY_EMAIL` with every answer, the form, the ad, the campaign and the time.
- A lead is emailed once. Meta sends a notice again when it gets no answer, and the site finds the saved lead by its Meta lead id and skips it.
- If the site cannot read a lead (no token yet, a token that ended, lead access taken away, Meta down), the office still gets an email, "New Facebook lead: open Leads Center to read it", with the lead id and the reason, the lead is saved as "Facebook lead, not read yet", and Meta is told to send the notice again. Meta tries for 36 hours. The first try that works fills in the saved lead and sends the full email. A lead that was still unread after that is tried again whenever a later lead is read fine.
- If the email does not send, the lead is saved with "email not sent" and Meta is asked to send the notice again, so the email goes out on the next try.
- The Test button on the Meta app's Webhooks page sends a made up lead (all fours). The site answers 200, saves nothing, and emails the office that the notice arrived.
- Problems show on the Health tab of the office app: a missing app secret, a signature that does not match, a lead that could not be read, an email that did not send.

If Verify and save fails in step 9, Meta could not reach the address or the word did not match. Check that the site was redeployed after the settings went in (step 8), and that the verify word has no space at either end. If both are right, look in Cloudflare > Security > Events for a request to `/api/meta/leadgen` that Cloudflare blocked, and let it through.

If Meta ever shows the token as ended or the app secret is reset, make a new one the same way, put it in Cloudflare, redeploy, and press Verify and save again in step 9. Leads from the gap are in Leads Center, and Meta keeps them there for 90 days.

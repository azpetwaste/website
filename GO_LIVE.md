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
3. Authentication > Sign In / Providers > Email: on. Email OTP length: 6.
4. Authentication > Emails > Templates. In BOTH "Confirm signup" and "Magic link" set:
   Subject: `Your Arizona Pet Waste code`
   Body: `<h2>Your code is {{ .Token }}</h2><p>Type this code on arizonapetwaste.com to sign in. It works for 1 hour.</p><p>Did not ask for this? You can ignore this email.</p>`
5. Authentication > Emails > SMTP Settings: turn on custom SMTP. Host `smtp.resend.com`, port `465`, username `resend`, password = the Resend API key, sender `info@arizonapetwaste.com`, sender name `Arizona Pet Waste`.
6. Authentication > URL Configuration: Site URL `https://arizonapetwaste.com`. Authentication > Rate Limits: emails per hour 100.
7. Project Settings > API Keys: copy the Project URL, the publishable key and the secret key into Cloudflare (step 2.6).
8. SQL Editor > New query > paste all of `supabase/crm.sql` > Run. This turns on the field desk at arizonapetwaste.com/crew (crew app, office, truck links, private gate photo bucket).

## 4. Resend (email that does not land in spam)
1. Create an account. Domains > Add `arizonapetwaste.com`. Add the DNS records it shows in Cloudflare DNS (set them to DNS only, gray cloud). Wait for Verified.
2. API Keys > Create (sending access). Put it in Supabase SMTP (step 3.5) and in Cloudflare as `RESEND_API_KEY`.

## 5. Stripe (payments, first month free)
Stay in Test mode for now.
1. Settings > Public details: business name Arizona Pet Waste, phone 623.309.6104, support email info@arizonapetwaste.com, website https://arizonapetwaste.com, Terms https://arizonapetwaste.com/terms/, Privacy https://arizonapetwaste.com/privacy/. Set a shortened statement descriptor of 10 letters or less, such as `AZPETWASTE`: on the first charge after a free month Stripe writes over everything past the 10th letter with `* TRIAL OVER`.
2. Settings > Branding: upload the state logo (`static/assets/img/icon-512.png`), accent color `#FF4A1C`, brand color `#0A0F24`.
3. Settings > Billing > Customer portal: turn on. Allow update payment method, view invoices, cancel subscription (at end of billing period). Leave "Pause subscription", "Switch plan" and "Update quantities" OFF: pausing is done in My Yard, which holds it back for the first 60 days. Save. The portal is saved one time in test mode and one time in live mode.
4. Settings > Billing > Subscriptions and emails: turn on "Send a reminder email 7 days before a free trial ends" (the card networks ask for this). Leave "Send emails when card payments fail" OFF: the site sends its own email the same day.
5. Billing > Revenue recovery > Retries: Smart Retries on (new accounts start with up to 8 tries in 2 weeks). "If all retries for a payment fail": Cancel the subscription. Then nobody is billed month after month for visits they are not getting. Leave both "Pause the subscription" choices off.
6. Settings > Payment methods: cards, Apple Pay, Google Pay and Link on. Turn the others off (bank debits, Cash App Pay, Amazon Pay, pay later): our card form only asks for cards and Link, but if Stripe ever refused that list it would show every way to pay that is on here. Settings > Payment method domains: add `arizonapetwaste.com` and `www.arizonapetwaste.com`. Add them in LIVE mode (that covers test mode too). Apple Pay and Google Pay do not show on our card form until this is done. If Stripe shows a file to put on the site for Apple Pay, hand the file to Claude: it goes in `static/.well-known/`.
7. Developers > Webhooks (or Workbench > Event destinations) > Add endpoint `https://arizonapetwaste.com/api/stripe-webhook`.
   Payload format: pick **Snapshot**. Stripe offers "Thin" first and marks it as the one to use. Do not take it: a thin event carries no details, the site refuses it, and cancels, failed payments and paid bills would not reach the office. (If one is set up as thin by mistake, Stripe shows its deliveries as failed with "This webhook needs snapshot events", and /crew > Health says the same.)
   Events, all seven: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`, `customer.updated`.
   If it asks for an API version, take the newest one. Copy the signing secret into Cloudflare as `STRIPE_WEBHOOK_SECRET`.
8. Developers > API keys: copy the test publishable key and secret key into Cloudflare. Redeploy.
Prices and products are made by the website on the first sign up, in test mode and again in live mode. Nothing to create by hand.

How a plan is billed (Joe, November 15, 2026):
- Sign up saves the card and charges $0. The card form is a Stripe Checkout Session in setup mode.
- The moment the card is saved, the server starts the plan itself (`startPlan`): free until the free month ends (`trial_end`), bills lined up on the 1st (`billing_cycle_anchor`), and Stripe charges the days in between as a part month (`proration_behavior=create_prorations`). Stripe Checkout cannot do a free month and a fixed billing day in one step, which is why the server does it.
- The day the free month ends: the part month up to the 1st. Then the full price on the 1st of each month, for the month ahead. A free month that ends on a 1st has no part month.
- A payment fails: the customer is emailed that day, a text waits in the office Texts tab for staff to send, the office is emailed, and the customer stays off new routes until the bill is paid. Stripe keeps retrying. When the bill is paid they are back on and get a thank you.
- A customer who changes their card in My Yard while on hold: the open bill is tried on the new card right away (that is what `customer.updated` is for).
- Right after each plan is made, the server asks Stripe what the first bill will be and holds it up against what the customer saw. If they do not match, the office gets an email that starts with "CHECK BILLING". Nothing is charged at that point. Do not change the plan by hand: tell Joe.
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
2. The 6 digit code arrives by email within a minute. Type it.
3. Write down what the pay step shows: the free until day, the part month amount and its day, and the 60 day date. Pay with test card `4242 4242 4242 4242`, any future date, any 3 numbers.
4. You see "You are booked!". You get the booking email at info@arizonapetwaste.com and the customer email, one of each.
5. Supabase > Table Editor > customers shows the row with status `trialing`. In Stripe (test mode) the customer has one subscription, status Trialing. Its trial ends on the free until day. Its "Upcoming invoice" is the part month amount from step 3, to the cent, and after that the billing day is the 1st. The customer's default payment method is the test card. The server makes this same check on its own for every sign up: no "CHECK BILLING" email at info@arizonapetwaste.com and no such line in /crew > Health means Stripe agreed.
6. Stripe > Developers > Webhooks > the endpoint: every delivery says 200.
7. Open /account/, sign in with the code, save a gate code, tap "Change card or cancel" and see the Stripe page.
8. Failed payment drill (test mode only). In Stripe open the test customer, add test card `4000 0000 0000 0341` and make it the default. Open the subscription > Actions > End trial now. Within about an hour Stripe tries the bill and it fails. Check: the customer email "Your card did not work", the office email "Card failed", a "card failed" text in /crew > Texts, status "Card problem" and the "Your card did not work" box in My Yard. Then make `4242 4242 4242 4242` the default again in "Change my card": the bill is paid right away, the customer gets "Your payment went through", and My Yard is back to normal.

## 8. Live money
1. Delete the test sign ups first: Supabase > Table Editor > customers, remove the rows made in test mode. A row left from test mode blocks that email, phone and address from signing up again (one free month per home) and its Stripe ids mean nothing to the live keys.
2. Switch Stripe to live mode. Repeat Stripe steps 1 and 3 to 7 in live mode: live mode has its own portal settings, its own retry and email settings, its own payment method domains and its own webhook with its own signing secret.
3. Put the live publishable key, live secret key and live webhook secret into Cloudflare (`STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`). Redeploy the latest deployment so the settings load.
4. Open https://arizonapetwaste.com/api/health: `"live":true,"keys":"live","hook":true,"mail":true`. Open /book/ with no `?test=1`: the pay step shows the card form (the live key turns real checkout on for everyone on its own).
5. Do one real sign up with your own card. You are charged $0. Check Stripe live mode the same way as step 5 of the test. Then look at Stripe > Developers > Webhooks: the live deliveries say 200. A 400 there means the webhook secret in Cloudflare is not the live one. Then cancel it in My Yard. A cancel in the first 60 days is charged one month, so cancel it in Stripe and refund yourself if that charge goes through.

Every setting the live site reads in Cloudflare Pages > Settings > Variables and Secrets:
- Must have: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.
- Mail (without these no email leaves the site: no welcome, no "card did not work", no office notice): `RESEND_API_KEY`, `MAIL_FROM`, `NOTIFY_EMAIL`.
- Good to set: `SITE_URL` (`https://arizonapetwaste.com`), `GOOGLE_MAPS_BROWSER_KEY`, `GOOGLE_MAPS_SERVER_KEY`, `TURNSTILE_SITE_KEY`, `CRON_SECRET`.
- Only to change a default: `FIRST_VISIT_FROM` (2026-11-20), `SCHEDULE_DAYS` (7), `STOPS_PER_DAY`, `WORK_DAYS`, `ROUTE_START`, `ROUTE_START_LABEL`.
- Build setting: `NODE_VERSION` = `22`.

## 9. Google, Bing, Apple
1. Google Search Console: add a Domain property for arizonapetwaste.com (verify with the TXT record in Cloudflare DNS). Submit `https://arizonapetwaste.com/sitemap.xml`.
2. Bing Webmaster Tools: import the site from Google Search Console (Bing feeds ChatGPT search and Copilot).
3. Google Business Profile: service area business, hide the address, service areas Buckeye, Waddell, Goodyear, Litchfield Park. Website https://arizonapetwaste.com. Phone 623.309.6104.
4. Apple Business Connect: same details.
5. Send Claude the URLs for the Google Business Profile, Facebook, Instagram, Nextdoor, BBB and Chamber pages when they exist. Claude adds them to the site footer and to the business data Google reads.

## 10. Texting (Twilio A2P 10DLC), after the site is live
Brand: Arizona Pet Waste. Website https://arizonapetwaste.com. Use case: Mixed (account notifications and marketing).
Twilio turned the first campaign down (error 30909, Joe passed it on November 15, 2026): the reviewer could not check how customers agree to texts, because the text boxes are on step 3 of 5 of `/book/`. The fix is public proof on the site. Use the text below when you send it in again.
Proof pages (all public, no sign in):
- Walk through with the exact words: https://arizonapetwaste.com/texts/#opt-in-form
- Screenshot of step 3 of 5: https://arizonapetwaste.com/assets/img/sms-optin-form.png
- Screenshot of the waitlist form: https://arizonapetwaste.com/assets/img/sms-optin-waitlist.png
- Terms: https://arizonapetwaste.com/terms/ (see Text messages). Privacy: https://arizonapetwaste.com/privacy/ (see Text messages). Text terms: https://arizonapetwaste.com/texts/

Opt in description, also called Message flow or Call to action (1741 characters, the limit is 2,048):

> Customers opt in on our website sign up form at https://arizonapetwaste.com/book/. The form has 5 steps. Step 3 of 5, "Tell us about you", is where the customer types a mobile phone number. On that same step, under the heading "Texts from us", are two separate optional checkboxes. Both are unchecked by default. Box 1: "Text me about my visits. Setting your day, night before reminders, on the way, and your gate photo. About 2 to 4 texts a visit." Box 2: "Text me deals too. Up to 4 texts a month. You can skip this one." Right under the boxes: "By checking a box, you agree to get texts from Arizona Pet Waste at the number above. Message and data rates may apply. Reply STOP to stop or HELP for help. You do not have to agree to texts to book. See our Text Terms and Privacy Policy." Text Terms links to https://arizonapetwaste.com/texts/ and Privacy Policy links to https://arizonapetwaste.com/privacy/. Texts are never required to buy. The boxes are on step 3, not on the first screen, so we host public proof. Screenshot of step 3: https://arizonapetwaste.com/assets/img/sms-optin-form.png. Exact words and a step by step walk through: https://arizonapetwaste.com/texts/#opt-in-form. To see it live, open /book/, tap a city, then tap Continue. People outside our service area can join a waitlist on step 1 of the same form ("My city is not here"). It has one optional unchecked box, "Text me when you start in my area", for one text, with the same disclosures. Screenshot: https://arizonapetwaste.com/assets/img/sms-optin-waitlist.png. Customers can change the same two choices later in their account page (My Yard, behind sign in). Its wording is on the texts page. We keep a record of each choice with the date, time and IP address.

If the words or the look of the sign up form change, run `python3 build/optin-shots.py` and update the quotes in `content/policies/texts.html` and in the text above, so all three still match the live form.

Sample messages:
1. Arizona Pet Waste: Hi Sam, we scoop your yard tomorrow between 9:00 and 9:30 AM. Reply STOP to opt out.
2. Arizona Pet Waste: We are on the way. Watch the truck in My Yard: arizonapetwaste.com/account
3. Arizona Pet Waste: All done. Your gate is shut and latched. See the photo in My Yard: arizonapetwaste.com/account. Reply HELP for help.
4. Arizona Pet Waste: Guests coming over? We can scoop your yard the same day when we have a spot, from $99. Text us back to book it. Reply STOP to opt out.

Sample 4 changed on November 16, 2026. It used to offer a turf odor treatment for $35. Joe ended that paid extra: deodorizing is included free with every visit. If the old sample was already sent to Twilio, swap it for this one on the next edit of the campaign.

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

## 4. Resend (email that does not land in spam)
1. Create an account. Domains > Add `arizonapetwaste.com`. Add the DNS records it shows in Cloudflare DNS (set them to DNS only, gray cloud). Wait for Verified.
2. API Keys > Create (sending access). Put it in Supabase SMTP (step 3.5) and in Cloudflare as `RESEND_API_KEY`.

## 5. Stripe (payments, first month free)
Stay in Test mode for now.
1. Settings > Public details: business name Arizona Pet Waste, phone 623.309.6104, support email info@arizonapetwaste.com, website https://arizonapetwaste.com, Terms https://arizonapetwaste.com/terms/, Privacy https://arizonapetwaste.com/privacy/.
2. Settings > Branding: upload the state logo (`static/assets/img/icon-512.png`), accent color `#FF4A1C`, brand color `#0A0F24`.
3. Settings > Billing > Customer portal: turn on. Allow update payment method, view invoices, cancel subscription (at end of billing period). Save.
4. Settings > Billing > Subscriptions and emails: turn on the email reminder before a free trial ends.
5. Settings > Payment methods: cards, Apple Pay, Google Pay and Link on. Payment method domains: add `arizonapetwaste.com`.
6. Developers > Webhooks (or Workbench > Event destinations) > Add endpoint `https://arizonapetwaste.com/api/stripe-webhook`.
   Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`.
   Copy the signing secret into Cloudflare as `STRIPE_WEBHOOK_SECRET`.
7. Developers > API keys: copy the test publishable key and secret key into Cloudflare. Redeploy.
Prices are made by the website on the first sign up. Nothing to create by hand.

## 6. Check the setup
Open https://arizonapetwaste.com/api/health. It must say `"live":true`. If it says false, a key is missing in Cloudflare.

## 7. Test on a phone and a computer (Joe)
1. Tap Book now, use ZIP 85396, pick dogs and a day, fill in your real email, check the visit texts box.
2. The 6 digit code arrives by email within a minute. Type it.
3. Pay with test card `4242 4242 4242 4242`, any future date, any 3 numbers.
4. You see "You are booked!". You get the booking email at info@arizonapetwaste.com and the customer email.
5. Supabase > Table Editor > customers shows the row with status `trialing`. Stripe shows the subscription with the trial ending one month after the first visit.
6. Open /account/, sign in with the code, save a gate code, tap "Manage card or cancel" and see the Stripe page.

## 8. Live money
Switch Stripe to live mode. Repeat Stripe steps 3, 4, 5 and 6 in live mode (live mode has its own portal settings and its own webhook secret). Put the live publishable key, live secret key and live webhook secret into Cloudflare. Redeploy. Do one real sign up with your own card, then cancel it in My Yard.

## 9. Google, Bing, Apple
1. Google Search Console: add a Domain property for arizonapetwaste.com (verify with the TXT record in Cloudflare DNS). Submit `https://arizonapetwaste.com/sitemap.xml`.
2. Bing Webmaster Tools: import the site from Google Search Console (Bing feeds ChatGPT search and Copilot).
3. Google Business Profile: service area business, hide the address, service areas Buckeye, Waddell, Goodyear, Litchfield Park. Website https://arizonapetwaste.com. Phone 623.309.6104.
4. Apple Business Connect: same details.
5. Send Claude the URLs for the Google Business Profile, Facebook, Instagram, Nextdoor, BBB and Chamber pages when they exist. Claude adds them to the site footer and to the business data Google reads.

## 10. Texting (Twilio A2P 10DLC), after the site is live
Brand: Arizona Pet Waste. Website https://arizonapetwaste.com. Use case: Mixed (account notifications and marketing).
Opt in description: "Customers sign up at https://arizonapetwaste.com/book/ or manage texts in My Yard at https://arizonapetwaste.com/account/. They check one or both unchecked boxes: 'Text me about my visits' (reminders, on the way, gate photo) and 'Text me deals too' (offers, up to 4 a month). The text under the boxes names Arizona Pet Waste, says message and data rates may apply, reply STOP to stop and HELP for help, that texts are not required to buy, and links to https://arizonapetwaste.com/texts/ and https://arizonapetwaste.com/privacy/. Every consent is saved with the time, IP address and the exact words shown." Attach the screenshot `docs/optin-screenshot.png`.
Sample messages:
1. Arizona Pet Waste: Hi Sam, we scoop your yard tomorrow between 9:00 and 9:30 AM. Reply STOP to opt out.
2. Arizona Pet Waste: We are on the way. Watch the truck in My Yard: arizonapetwaste.com/account
3. Arizona Pet Waste: All done. Your gate is shut and latched. See the photo in My Yard: arizonapetwaste.com/account. Reply HELP for help.
4. Arizona Pet Waste: Turf smelling in the heat? Add a turf odor treatment to your next visit for $35. Reply STOP to opt out.

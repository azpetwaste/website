# Test script: texts and emails that send on their own

Written November 21, 2026 for the pull request "Automatic post booking flow". Joe tests the whole flow on himself as a customer (the customer row "Joseph Lopez") before any real customer gets a text or an email from it.

## What keeps real customers safe while you test
- **Test mode.** `SMS_TEST_ALLOWLIST` in Cloudflare is a list of mobile numbers. While it is set, texts go to those numbers and to nobody else. Everyone else's texts wait in the Texts tab, the way they do today.
- **Nothing goes out until you set a day AND a time.** A booked house hears nothing about its schedule until the office sets both on the customer card. A day with no time tells nobody.
- **Schedule notices follow the test list.** Setting or changing a day and time sends an email and a text, but in test mode only to a customer whose mobile number is on the list. That covers the customer card, Plan the week, Move yards and a change for one visit.
- **With no Twilio settings, nobody is told a schedule.** The card says so. The done text waits in the Texts tab for a person, as it does today.
- **Off switch.** Delete `TWILIO_MESSAGING_SERVICE_SID` in Cloudflare and redeploy. Every text goes back to waiting in the Texts tab.

## Part A. Set up (Atlas, about 15 minutes)
Do these in order. Steps 1 to 4 are safe to do before the pull request is merged.

1. **Database.** Run `supabase/patch-2026-11-21.sql` in the Supabase SQL Editor (project `arizonapetwaste`). It only adds: three columns to `messages`, three to `customers` (STOP, and the visit time for each service day), one to `stops` (a time for one visit), and two new text states. Claude can run it for you: say "run the patch".
2. **Cloudflare Pages, Production settings** (as secrets):
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN` (the account's main Auth Token. Twilio signs its calls to us with this one, so an API key does not work here.)
   - `TWILIO_MESSAGING_SERVICE_SID` = `MGea4e26fe4b9ff397f3112c124e081ee4`
   - `SMS_TEST_ALLOWLIST` = Joe's mobile number, the same one that is on his customer row. More numbers go after a comma.
   - `CRON_SECRET` = any 16 or more random letters and numbers.
3. **GitHub**, repo `azpetwaste/website`, Settings, Secrets and variables, Actions, New repository secret: `CRON_SECRET` with the same value as step 2.
4. **Twilio Console**, Messaging, Services, the Arizona Pet Waste service, Integration, Incoming Messages: pick "Send a webhook" and set the Request URL to `https://arizonapetwaste.com/api/twilio/inbound` (HTTP POST). Leave Twilio's own opt out handling on. Twilio answers STOP, START and HELP. We send no reply of our own.
5. **Merge the pull request.** Cloudflare deploys it in about 80 seconds.
6. **Check.** Open `https://arizonapetwaste.com/api/health`. It must read `"texts":true,"textsTest":true`.

## Part B. Joe's test, on himself
Use your own phone for the texts and a computer or the phone for the Field App at arizonapetwaste.com/crew.

| # | Do this | You should see |
| --- | --- | --- |
| 1 | Open **Health**. | "Texts send on their own: On. Test mode: only 1 test number gets texts." |
| 2 | Open **Schedule**. | A list "Booked houses with no day and time yet". Joseph Lopez is on it, and so are the three real customers. |
| 3 | Tap **Joseph Lopez**. | The customer card. "My Yard: invited ... Not signed in yet" or "signed in" with a date. Under Route: "Set the day and the time. Saving them is what tells the customer..." |
| 4 | Tap **Resend welcome email**, then **Send email**. | An email "You are booked with Arizona Pet Waste" that starts "Hi Joseph," and has "What happens next" with three steps. The card now reads "invited again". |
| 5 | Tap the My Yard link in that email. | My Yard opens signed in, with no code. Reload the customer card: "My Yard: signed in" with today's time. |
| 6 | **Day with no time.** Set **Service day** to the weekday of tomorrow, leave **Time** on "No time yet", set **Scooper** to Juan Gonzalez, tap **Save**. | A green line: "Saved. Now pick a time. Joseph Lopez is not told until the day and the time are both set." No text. No email. |
| 7 | **Day and time.** Set **Time** to 10:30 AM. Save. | "Saved. Joseph Lopez was told Monday around 10:30 AM by email and text." (with tomorrow's weekday). A text: "Arizona Pet Waste: Your service day is Monday around 10:30 AM. Your next visit is Monday, Nov 23. We text you the night before each visit. Reply STOP to opt out." An email with the same day and time. |
| 8 | **Change it.** Set **Time** to 11:00 AM. Save. | A text and an email: "Your new service day is Monday around 11:00 AM..." Set it back to 10:30 AM if you like: that tells you again. |
| 9 | Tap **Send their day and time again**, then **Send it**. | The same confirmation arrives once more. |
| 10 | Open **Dan Besserer**. Change **Customer name** to "Dan Besserer". Save. | Saved. No green line, no text, no email: a name change tells nobody. |
| 11 | Optional: set a day and time for a real customer now. | "Saved. Test mode is on, so ... was not told." Nothing reaches them. After test mode is off, tap "Send their day and time again" on their card. |
| 12 | **Night before.** Wait for 5:30 PM, or in GitHub open Actions, "Night before texts", Run workflow. | A text: "Arizona Pet Waste: We will be there tomorrow (Monday) around 10:30 AM, between 10:15 and 10:45 AM. Please unlock the gate and keep your dogs inside. Watch the truck on the way: arizonapetwaste.com/t/XXXXXX Reply STOP to opt out." Health reads "Night before texts every evening: On. Last ran ...". |
| 13 | Tap the link in that text. | Your visit page: you are on tomorrow's route. |
| 14 | **A change for one visit.** Schedule, tap tomorrow in the week strip, open Juan's route, tap your yard, **Change this visit's time**, pick 2:00 PM, **Save and tell the customer**. | A text: "Arizona Pet Waste: Your visit is now Monday, Nov 23 around 2:00 PM. This change is for that visit only. Reply STOP to opt out." An email that says the same. On the customer card the usual Time still reads 10:30 AM. |
| 15 | **Visit day**: Juan opens /crew on his phone, My route today, **Start route**. Your yard is his stop, with "Around 2:00 PM" under it. (Do not turn on "Runs a route too" for Joe just for this test: a real sign up that day could land on Joe's route.) | Right away, a text: "Arizona Pet Waste: We are on our way! Here is the truck: ..." The link shows the truck on the map. No orange Send bar in the app: the text already went. |
| 16 | Juan taps **I'm here**, ticks the boxes, **Take gate photo**. | Right away, a text: "Your yard is done. See your latched gate: ..." The link shows the photo. |
| 17 | Reply to any of those texts with "test reply". | The office inbox gets "Text from Joseph Lopez: test reply". It shows in the Texts tab as Reply. |
| 18 | Reply **STOP**. | Twilio's own "you are unsubscribed" text. The office inbox gets "Texts stopped: Joseph Lopez". The card reads "Visit texts: no, they replied STOP". |
| 19 | Reply **START**. | Twilio's "you are subscribed again" text. The card reads "Visit texts: yes". |
| 20 | Reply **HELP**. | Twilio's help text. Nothing changes in the app. |
| 21 | Open **Texts**. | Every text above is in "Sent and received" and reads Delivered. On the customer card, tap **Resend text** on one of them and confirm: the same text arrives again. |
| 22 | **The week after.** Do nothing. | The evening before your next service day, the night before text comes again with 10:30 AM, your usual time. The one time change to 2:00 PM is gone. |

If the "on our way" text comes early: it is sent when your yard becomes Juan's next stop, which is when he taps Start route or finishes the yard before yours. The time you set is when he aims to be there.

Not something you can test by hand: a gate photo text that fails. The automated tests cover it (the photo goes by email, once, and the Texts tab and Health show the reason).

## Part C. Go live for every customer (only after Joe says yes)
1. Atlas deletes `SMS_TEST_ALLOWLIST` in Cloudflare and redeploys. `/api/health` then reads `"texts":true,"textsTest":false`.
2. Set the service day and time for Dan Besserer, Latawnya Cunningham and Taylor Means on their cards. Each save sends their confirmation by email and text. If you already set them during the test, tap "Send their day and time again" on each card.
3. Dan's first welcome email said "Hi Besserer". After his name is fixed (step 10), tap Resend welcome email on his card if you want him to get a corrected one.
4. Tell Claude. The training video and the training page still describe sending texts by hand, and do not show the Time box. They get rebuilt once texts are live for everyone.

## If something looks wrong
- A text did not arrive: open the Texts tab. A failed text is there with the reason in plain words.
- Everything went quiet: Health, "Texts send on their own". If it reads Off, a Twilio setting is missing in Cloudflare.
- Stop everything now: delete `TWILIO_MESSAGING_SERVICE_SID` in Cloudflare and redeploy.

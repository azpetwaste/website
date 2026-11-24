# Try the review request on yourself

Built on November 24, 2026. It is OFF on the live site. No customer gets one until the steps below are done.

## What it does
Two hours after a yard is finished with its gate photo, the customer gets one message that asks for a Google review. Each customer is asked once, ever.

The email:

> Subject: How did we do at your yard?
>
> Hi Joseph,
>
> Thank you for having us at your yard.
>
> Would you tell others how we did? A Google review takes about one minute:
> https://g.page/r/CXY5n8YnkReiEAI/review
>
> Did we miss something? Reply to this email, or call or text 623.309.6104. We come back and make it right.
>
> Arizona Pet Waste

The text (142 letters, one text):

> Arizona Pet Waste: Thank you for having us. Would you leave us a Google review? https://g.page/r/CXY5n8YnkReiEAI/review Reply STOP to opt out.

## The rules it keeps
- Two hours after the yard is done. Never before 8 AM or after 7 PM. One that would land late goes at 9 AM the next day.
- Once for each customer, ever.
- Only for a visit with a gate photo. Never for a visit that was marked "I can't do this yard" first.
- If the customer texts us back, or texts STOP, before it goes out, it is called back and never sent.
- Everyone is asked the same way. No reward for a review. Those are Google's rules.

## Step 1. The email, on yourself (Atlas, then Joe)
1. Atlas: in Cloudflare Pages, Settings, Variables, add `REVIEW_ASK` = `on` and `REVIEW_ONLY` = Joe's mobile number (10 digits). To skip the two hour wait for the test, add `REVIEW_DELAY_MIN` = `16`. Redeploy the newest deployment.
2. Open https://arizonapetwaste.com/api/health. It must read `"reviewAsk":"email","reviewOnly":1`.
3. Joe: run one test yard on your own test customer (the one with your mobile number): Start route, I'm here, take the gate photo, Done.
4. On that customer's card, the log shows a line "Review request" with the time it goes out.
5. The email arrives at that time. Tap the link. It must open the Google review box for Arizona Pet Waste.
6. To try it again: a customer is asked once, ever, so a second test needs the first "Review request" line deleted from the `messages` table. Ask Claude.

## Step 2. Turn the email on for every customer
1. Atlas: delete `REVIEW_ONLY`. Delete `REVIEW_DELAY_MIN` so the wait is two hours again. Redeploy.
2. Health must read `"reviewAsk":"email","reviewOnly":0`.
3. From then on each customer gets the email after their next finished yard, once.

## Step 3. The text (do this only after the three things below)
A customer agreed to texts about "Setting your day, night before reminders, on the way, and your gate photo". A review request is not on that list. Before the text is switched on:
1. The sign up box, My Yard and the text policy page name review requests. Words that fit: "Setting your day, night before reminders, on the way, your gate photo, and one request for a review." This changes `CONSENT` in `worker.js`, `book.prod.tpl.html`, My Yard, `content/policies/texts.html` and the three screenshots on `/texts/`. It is a job for the website session.
2. The Twilio campaign gets the review text as a sample message (Twilio Console, the A2P campaign, Edit). Twilio can stop a campaign that sends a kind of text it was not told about.
3. Customers who signed up before the new words did not agree to it. Joe's call: text only customers who sign up after the change, or email the earlier ones only.
Then Atlas adds `REVIEW_TEXT` = `on` and redeploys. Health reads `"reviewAsk":"email and text"`.

## To turn it all off
Delete `REVIEW_ASK` and redeploy. Messages already handed to Resend or Twilio for a set time still go out: to stop one, text STOP from that phone or ask Claude to call it back.

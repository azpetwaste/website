// Arizona Pet Waste server (Cloudflare Pages advanced mode: this file ships as dist/_worker.js).
// Handles /api/* only. Every other request is a static page served by Cloudflare.
//
// Settings (Cloudflare Pages > Settings > Variables and Secrets):
//   SUPABASE_URL, SUPABASE_ANON_KEY (or the new publishable key), SUPABASE_SERVICE_ROLE_KEY (or the new secret key)
//   STRIPE_PUBLISHABLE_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
//   RESEND_API_KEY: every sign up, sign up request and waitlist form is emailed to NOTIFY_EMAIL (default info@arizonapetwaste.com).
//     Without it, forms tell people to call or text, so no lead is lost silently.
//   Optional: NOTIFY_EMAIL, MAIL_FROM (needs a domain verified in Resend), SITE_URL, FIRST_VISIT_FROM (default 2026-11-20), SCHEDULE_DAYS (default 7)
//   Live map on the truck link: GOOGLE_MAPS_BROWSER_KEY (Maps JavaScript API, locked to arizonapetwaste.com) and
//     GOOGLE_MAPS_SERVER_KEY (Routes API, secret). Without them the link shows arrival time and miles with no map.
//   Ads: META_CAPI_TOKEN (the server's copy of each booking and lead for Meta). Facebook and Instagram lead forms:
//     META_APP_SECRET, META_VERIFY_TOKEN and META_PAGE_TOKEN (see "Facebook and Instagram lead ads" below).
// With the keys missing, /api/config says live: false and the site runs its demo sign up.

const STRIPE_VERSION = '2026-10-28.endive';
const PLANS = {
  week: { name: 'Every week' },
  twice: { name: 'Twice a week' },
  eow: { name: 'Every other week' }
};
// Prices (Joe, Nov 18, 2026). One file holds them for the site, the sign up form, My Yard, the emails, Stripe and the
// office: src/prices.json. This file ships with nothing to load, so it carries a copy between the two marks below.
// `npm run build` writes the copy (build/prices.mjs) and worker.test.mjs fails if it differs from the file.
// Dollars a month for 1 to 6 dogs. `month` is what a new sign up pays. `kept` is for plans that were running before
// the prices changed: they keep the price they signed up at (see rowMonthly).
/* PRICES:START (a copy of src/prices.json, written by build/prices.mjs. Change that file, never this block.) */
const PRICES = {"month":{"week":[89,99,115,134,147,160],"twice":[189,189,202,215,228,241],"eow":[75,75,84,93,102,111]},"once":99,"kept":{"plans":["sub_1UcpCgLoVhhubhCaah7WLt8o"],"month":{"week":[108,108,121,134,147,160],"twice":[189,189,202,215,228,241],"eow":[75,75,84,93,102,111]}}};
/* PRICES:END */
// Every ZIP code in the towns we serve: Buckeye, Goodyear, Litchfield Park and Waddell (Citrus Park).
const ZIPS = {
  '85326': { area: 'buckeye', name: 'Buckeye', city: 'Buckeye' },
  '85396': { area: 'buckeye', name: 'Buckeye', city: 'Buckeye' },
  '85338': { area: 'goodyear', name: 'Goodyear', city: 'Goodyear' },
  '85395': { area: 'goodyear', name: 'Goodyear', city: 'Goodyear' },
  '85340': { area: 'litchfield', name: 'Litchfield Park', city: 'Litchfield Park' },
  '85355': { area: 'citrus', name: 'Citrus Park', city: 'Waddell' }
};
// The exact words shown next to the text boxes. Saved with every consent record.
const CONSENT = {
  // Joe, Nov 16, 2026: sign up has ONE text box, for visit texts, marked Recommended with a red star. It stays optional:
  // texts are never a condition of buying (TCPA), and Twilio refuses a required text box. Deals texts are NOT in that box.
  // Twilio turns a campaign down when one box covers both visit texts and deals (error 30913, "Marketing and informational
  // consent must be separate"). Joe, Nov 17, 2026: the deals box came out of My Yard too, so no screen asks for deals texts
  // and nothing turns texts_deals on. A deals box that ever comes back must be its own unchecked box, never part of the visit box.
  visit: 'Text me about my visits. Setting your day, night before reminders, on the way, and your gate photo. About 2 to 4 texts a visit.',
  deals: 'Text me deals too. Up to 4 texts a month.',
  fine: 'By checking the box, you agree to get texts from Arizona Pet Waste at the number above. Message and data rates may apply. Reply STOP to stop or HELP for help. You do not have to agree to texts to book. See our Text Terms and Privacy Policy.'
};
const CALL_US = 'Call or text 623.309.6104 and we will help.';
// Joe, Nov 17, 2026: customers do not change their card, see bills or cancel by themselves yet. They call or text the
// office and the office does it in Stripe. My Yard shows that line in place of the bills list and the "Change card or
// cancel" button, and the two routes behind them are closed (portal, meInvoices). Skips and pauses stay in My Yard.
// The card link in a "your card did not go through" email (/api/card) stays: it opens Stripe's card page only, with
// no way to cancel, and it is how a failed bill gets paid.
// To give it back: set SELF_SERVE to true here and "selfServe" to true in src/site.config.json in the same commit
// (worker.test.mjs holds the two together). The site copy flips with it ([[self:..||..]] in build.mjs).
const SELF_SERVE = false;
const selfOn = (env) => (env && env.SELF_SERVE ? env.SELF_SERVE === 'on' : SELF_SERVE);
const CALL_BILLING = 'To change your card, see a bill or cancel, call or text 623.309.6104. We do it for you.';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // Customer truck links: arizonapetwaste.com/t/CODE all load the one /t/ page, which reads the code from the address.
    if (/^\/t\/[0-9A-Za-z]{4,10}\/?$/.test(url.pathname)) {
      const page = await env.ASSETS.fetch(new Request(new URL('/t/', url), request));
      const res = new Response(page.body, page);
      res.headers.set('x-robots-tag', 'noindex, nofollow');
      res.headers.set('referrer-policy', 'no-referrer');
      res.headers.set('cache-control', 'no-cache');
      return res;
    }
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    // A simple brake on floods and guessing. It counts per visitor address inside this server. It is a first line:
    // a Cloudflare rate limit rule on /api/* is the real wall.
    const ip = request.headers.get('cf-connecting-ip');
    if (ip) {
      const p = url.pathname;
      const hit = p === '/api/staff/code' ? hitLimit('code|' + ip, 8, 600e3) : p === '/api/staff/verify' ? hitLimit('verify|' + ip, 10, 600e3)
        : p.startsWith('/api/track/') ? hitLimit('track|' + ip, 120, 60e3) : p === '/api/demo/week' ? hitLimit('demo|' + ip, 40, 60e3)
        : p.startsWith('/api/address') ? hitLimit('addr|' + ip, 150, 600e3)
        : p === '/api/checkout' ? hitLimit('checkout|' + ip, 20, 3600e3) : p === '/api/me/link' ? hitLimit('link|' + ip, 20, 600e3) : false;
      if (hit || hitLimit('all|' + ip, 400, 60e3)) return fail(429, 'Too many tries. Wait a minute, then try again.');
    }
    // Nobody needs to send more than this. A sign up form is a few hundred bytes. Only a gate photo is big.
    if (Number(request.headers.get('content-length') || 0) > maxBody(url.pathname)) return fail(413, 'That is too much to send at once.');
    try {
      const res = await route(url.pathname, request, env, ctx);
      res.headers.set('cache-control', 'no-store');
      res.headers.set('x-content-type-options', 'nosniff');
      return res;
    } catch (e) {
      console.error('api error', url.pathname, e && e.stack || e);
      if (ctx && ctx.waitUntil) ctx.waitUntil(logError(env, 'server', url.pathname, e && e.message, e && e.stack));
      return fail(500, 'Something went wrong on our side. ' + CALL_US);
    }
  }
};

async function route(path, request, env, ctx) {
  const m = request.method;
  if (path === '/api/config' && m === 'GET') return config(env);
  if (path === '/api/checkout' && m === 'POST') return checkout(request, env, ctx);
  if (path === '/api/checkout/done' && m === 'POST') return checkoutDone(request, env, ctx);
  if (path === '/api/stripe-webhook' && m === 'POST') return webhook(request, env, ctx);
  if (path === '/api/waitlist' && m === 'POST') return waitlist(request, env, ctx);
  if (path === '/api/request' && m === 'POST') return signupRequest(request, env, ctx);
  if (path === '/api/community' && m === 'POST') return communityRequest(request, env, ctx);
  if (path === '/api/address' && m === 'GET') return addressFind(request, env);
  if (path === '/api/address/pick' && m === 'GET') return addressPick(request, env);
  if (path === '/api/me/link' && m === 'POST') return meLink(request, env);
  if (path === '/api/card' && m === 'GET') return cardGo(request, env, ctx);
  if (path === '/api/me' && m === 'GET') return meGet(request, env);
  if (path === '/api/me' && m === 'POST') return meSave(request, env);
  if (path === '/api/portal' && m === 'POST') return portal(request, env);
  if (path === '/api/me/visits' && m === 'GET') return meVisits(request, env);
  if (path === '/api/me/invoices' && m === 'GET') return meInvoices(request, env);
  if (path === '/api/me/plan' && m === 'GET') return mePlan(request, env);
  if (path === '/api/me/skip' && m === 'POST') return meSkip(request, env, ctx);
  if (path === '/api/me/pause' && m === 'POST') return mePause(request, env, ctx);
  if (path === '/api/me/resume' && m === 'POST') return meResume(request, env, ctx);
  if (path === '/api/demo/week' && m === 'GET') return demoWeek(env, new URL(request.url).searchParams);
  if (path === '/api/health' && m === 'GET') return ok({ ok: true, live: live(env), desk: sbLive(env), keys: keyMode(env), hook: !!env.STRIPE_WEBHOOK_SECRET, mail: !!env.RESEND_API_KEY, meta: metaOn(env), leads: metaLeadsOn(env), texts: smsOn(env), textsTest: testMode(env) });
  if (path === '/api/log' && m === 'POST') return clientLog(request, env);
  if (path === '/api/twilio/status' && m === 'POST') return twilioStatus(request, env, ctx);
  if (path === '/api/twilio/inbound' && m === 'POST') return twilioInbound(request, env, ctx);
  if (path === '/api/meta/leadgen' && m === 'GET') return metaVerify(request, env, ctx);
  if (path === '/api/meta/leadgen' && m === 'POST') return metaLeads(request, env, ctx);
  if (/^\/api\/(staff|crew|office|track)\//.test(path)) return desk(path, request, env, ctx);
  return fail(404, 'Not found.');
}

/* ---------- helpers ---------- */
// Counts requests for a key in a time window. Kept in memory, so it is per server and resets when the server restarts.
const HITS = new Map();
function hitLimit(key, max, windowMs) {
  const now = Date.now();
  let h = HITS.get(key);
  if (!h || now - h.t > windowMs) { h = { t: now, n: 0 }; HITS.set(key, h); }
  h.n++;
  if (HITS.size > 5000) for (const [k, v] of HITS) if (now - v.t > 600e3) HITS.delete(k);
  return h.n > max;
}
function ok(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
}
function fail(status, error, code) { return ok({ error, code }, status); }
function live(env) {
  return !!(env.SUPABASE_URL && env.SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_ROLE_KEY && env.STRIPE_SECRET_KEY && env.STRIPE_PUBLISHABLE_KEY);
}
// The field desk only needs Supabase, so the crew app works before Stripe is live.
function sbLive(env) { return !!(env.SUPABASE_URL && env.SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_ROLE_KEY); }
// Which Stripe mode the two keys are for: test, live, or mixed (one of each, which cannot work). Shown by /api/health
// so a key swap can be checked from a browser. It shows the mode only, never a key.
function keyMode(env) {
  const mode = (k) => (/^[a-z]+_live_/.test(String(k || '')) ? 'live' : /^[a-z]+_test_/.test(String(k || '')) ? 'test' : '');
  const a = mode(env.STRIPE_PUBLISHABLE_KEY), b = mode(env.STRIPE_SECRET_KEY);
  return !a && !b ? 'none' : a === b ? a : 'mixed';
}
const clean = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, n);
const digits = (v) => { let d = String(v || '').replace(/\D/g, ''); if (d.length === 11 && d[0] === '1') d = d.slice(1); return d; };
const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e || '');
// What a choice from a form stands for, or '' when it is not one of ours. A plain map[key] says yes to names every
// object has (like "constructor"), so anything a form sends is looked up with this.
const own = (map, k) => (typeof k === 'string' && Object.prototype.hasOwnProperty.call(map, k) ? map[k] : '');
const base = (env) => String(env.SUPABASE_URL || '').replace(/\/$/, '');
// The most one request may send: a gate photo is up to 3 MB (about 4 MB once it is packed as text), a Stripe event
// is well under 1 MB, and every form is tiny. Checked twice: by the size the sender states, and again while reading,
// because a sender can leave the size off.
function maxBody(path) { return /^\/api\/(crew|office)\/photo$/.test(path) ? 6e6 : path === '/api/stripe-webhook' || path === '/api/meta/leadgen' ? 1e6 : 100e3; }
async function readText(request) {
  const max = maxBody(new URL(request.url).pathname);
  if (!request.body) return '';
  const reader = request.body.getReader(), parts = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { try { await reader.cancel(); } catch (e) { } return null; }
    parts.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const x of parts) { all.set(x, at); at += x.byteLength; }
  return new TextDecoder().decode(all);
}
async function body(request) {
  try { const t = await readText(request); return t ? JSON.parse(t) : null; } catch (e) { return null; }
}
// Compares two secrets without giving away, by how long it takes, how many letters were right.
function sameSecret(a, b) {
  a = String(a || ''); b = String(b || '');
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i % (b.length || 1));
  return diff === 0 && a.length > 0;
}
function sbHeaders(key, extra) {
  const h = Object.assign({ apikey: key, 'content-type': 'application/json' }, extra || {});
  if (String(key).startsWith('eyJ')) h.authorization = 'Bearer ' + key; // legacy JWT keys; new sb_ keys go in apikey only
  return h;
}
async function db(env, method, pathq, data, prefer) {
  const r = await fetch(base(env) + '/rest/v1/' + pathq, {
    method, headers: sbHeaders(env.SUPABASE_SERVICE_ROLE_KEY, prefer ? { prefer } : null), body: data ? JSON.stringify(data) : undefined
  });
  const text = await r.text();
  if (!r.ok) throw new Error('database ' + r.status + ' ' + text.slice(0, 300));
  try { return text ? JSON.parse(text) : null; } catch (e) { return null; }
}
async function signedIn(request, env) {
  const h = request.headers.get('authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) return null;
  // Staff and customers only ever sign in with a code sent to their email. A sign in that came from a password is
  // never one of ours, so it is refused here for every page. See passwordSession.
  if (passwordSession(token)) return null;
  const r = await fetch(base(env) + '/auth/v1/user', { headers: { apikey: env.SUPABASE_ANON_KEY, authorization: 'Bearer ' + token } });
  if (!r.ok) return null;
  const u = await r.json();
  return u && u.id && u.email ? { id: u.id, email: String(u.email).toLowerCase() } : null;
}
/* ---------- street address suggestions on the sign up form (Joe, Nov 16, 2026) ----------
   As the customer types their street, the page asks here and shows up to five matches. Google Places API (New) does the
   matching, with the server key, so no key sits in the page. Only addresses inside our towns are offered. Picking one fills
   the street and the ZIP. If Places is not switched on for the key, this returns an empty list and the form works as before:
   the customer types the whole street. One typing run and its pick share a session token, so Google bills it as one lookup. */
const ADDR_BOX = { low: { latitude: 33.25, longitude: -112.75 }, high: { latitude: 33.62, longitude: -112.30 } };
const tokenOk = (t) => (/^[A-Za-z0-9_-]{8,36}$/.test(String(t || '')) ? String(t) : '');
let placesOff = 0; // when Google last said the key cannot use Places, so we stop asking for ten minutes
async function addressFind(request, env) {
  const q = new URL(request.url).searchParams;
  const input = clean(q.get('q'), 120), token = tokenOk(q.get('s'));
  if (!env.GOOGLE_MAPS_SERVER_KEY || input.length < 3 || !/\d/.test(input) || Date.now() - placesOff < 600e3) return ok({ list: [] });
  try {
    const r = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GOOGLE_MAPS_SERVER_KEY, 'x-goog-fieldmask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat' },
      body: JSON.stringify(Object.assign({ input, includedRegionCodes: ['us'], includedPrimaryTypes: ['street_address', 'premise', 'subpremise'], locationRestriction: { rectangle: ADDR_BOX } }, token ? { sessionToken: token } : {}))
    });
    if (!r.ok) {
      if (r.status === 403 || r.status === 400) { placesOff = Date.now(); await logError(env, 'server', '/api/address', 'Address suggestions are off: Google refused the Places call. Turn on Places API (New) for the server key', r.status + ' ' + clean(await r.text(), 300)).catch(() => {}); }
      return ok({ list: [] });
    }
    const d = await r.json();
    const list = ((d && d.suggestions) || []).map((x) => x.placePrediction).filter((x) => x && x.placeId && x.structuredFormat && x.structuredFormat.mainText)
      .slice(0, 5).map((x) => ({ id: x.placeId, main: clean(x.structuredFormat.mainText.text, 120), sub: clean((x.structuredFormat.secondaryText || {}).text, 120).replace(/, USA$/, '') }));
    return ok({ list });
  } catch (e) { return ok({ list: [] }); }
}
async function addressPick(request, env) {
  const q = new URL(request.url).searchParams;
  const id = String(q.get('id') || ''), token = tokenOk(q.get('s'));
  if (!env.GOOGLE_MAPS_SERVER_KEY || !/^[A-Za-z0-9_-]{10,300}$/.test(id)) return fail(400, 'Please type your street address.');
  try {
    const r = await fetch('https://places.googleapis.com/v1/places/' + id + (token ? '?sessionToken=' + token : ''), {
      headers: { 'x-goog-api-key': env.GOOGLE_MAPS_SERVER_KEY, 'x-goog-fieldmask': 'addressComponents' }
    });
    if (!r.ok) return fail(502, 'Please type your street address.');
    const parts = (await r.json()).addressComponents || [];
    const part = (type, short) => { const c = parts.find((x) => (x.types || []).includes(type)); return c ? clean(short ? c.shortText : c.longText, 80) : ''; };
    const unit = part('subpremise');
    const street = clean([part('street_number'), part('route', true)].filter(Boolean).join(' ') + (unit ? ' ' + (/^\d/.test(unit) ? '#' : '') + unit : ''), 200);
    const zip = part('postal_code');
    if (!street || !/^\d{5}$/.test(zip)) return fail(502, 'Please type your street address.');
    return ok({ street, zip, city: part('locality') || part('sublocality') || part('administrative_area_level_3'), served: !!ZIPS[zip] });
  } catch (e) { return fail(502, 'Please type your street address.'); }
}

/* ---------- sign up with no email code (Joe, Nov 16, 2026: "sign up, we're done") ----------
   A new customer does not type a code and does not make an account first. When the card step opens, the server makes the
   account quietly (newAccount) and the sign up goes on with NO sign in: the page is never handed a session, so typing
   someone's email can never open their account. After the card is saved, the welcome email carries a My Yard link that
   signs them in with one tap (yardLink, meLink). Proof of the email is that link, or the 6 digit code, never the sign up form.
   An email that has ever had a plan, or is on the team, gets the 6 digit code as before ("use_code").
   The bot check guards the card form in place of the code when TURNSTILE_SECRET_KEY is set.
   No password is set on any account, here or anywhere: see passwordSession. */
// The account id for a sign up with no sign in. A brand new email gets a new account. An email with a sign up that was
// never finished (no plan yet) picks that sign up back up. Returns null when the email must use the 6 digit code instead:
// it has had a plan, it is on the team, or it has signed in before without ever starting a sign up.
async function newAccount(env, email) {
  if ((await db(env, 'GET', 'staff?email=eq.' + enc(email) + '&select=id')).length) return null;
  const rows = await db(env, 'GET', 'customers?email=eq.' + enc(email) + '&select=id,status,stripe_subscription_id&limit=5');
  if (rows.length) return rows.length === 1 && !rows[0].stripe_subscription_id && rows[0].status === 'checkout' && uuid(rows[0].id) ? rows[0].id : null;
  const r = await fetch(base(env) + '/auth/v1/admin/users', { method: 'POST', headers: sbHeaders(env.SUPABASE_SERVICE_ROLE_KEY), body: JSON.stringify({ email, email_confirm: true }) });
  if (!r.ok) {
    // 422 means the email already has an account (someone who signed in before). Anything else is logged for the Health tab.
    if (r.status !== 422) await logError(env, 'server', '/api/checkout', 'Could not make an account for a new sign up, so it used the email code', r.status + ' ' + clean(await r.text(), 300)).catch(() => {});
    return null;
  }
  const d = await r.json();
  return uuid(d && d.id) || null;
}
// Cloudflare Turnstile. Off until TURNSTILE_SECRET_KEY is set in Cloudflare Pages (the site key alone turns on the page side).
async function botOk(env, token, ip) {
  if (!env.TURNSTILE_SECRET_KEY) return true;
  if (!token) return false;
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: String(token).slice(0, 2048), remoteip: ip || undefined }) });
    const d = await r.json();
    return !!(d && d.success);
  } catch (e) { return false; }
}
// The one tap My Yard link in the welcome email. Signed with a server secret, good for 7 days, for one customer.
const LINK_DAYS = 7;
async function hmac(env, text) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('apw-yard-link|' + env.SUPABASE_SERVICE_ROLE_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text)));
  return btoa(String.fromCharCode(...sig)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function yardLink(env, uid) {
  const exp = Math.floor(Date.now() / 1000) + LINK_DAYS * 86400;
  return 'https://' + siteHost(env) + '/account/?k=' + uid + '.' + exp + '.' + (await hmac(env, uid + '.' + exp));
}
// The link in a "your card did not go through" email. It opens Stripe's own card page for that one customer, with no
// sign in: a person whose card just failed should not have to find a code first. It is signed like the My Yard link
// but with its own word in the signature, so one kind of link can never be used as the other. It only ever opens the
// card page: it signs nobody in to My Yard. It lasts as long as Stripe keeps trying a card, and then some.
const CARD_LINK_DAYS = 30;
async function cardLink(env, uid) {
  const exp = Math.floor(Date.now() / 1000) + CARD_LINK_DAYS * 86400;
  return 'https://' + siteHost(env) + '/api/card?k=' + uid + '.' + exp + '.' + (await hmac(env, 'card|' + uid + '.' + exp));
}
// Someone tapped that link. Make a fresh Stripe billing page for the customer (Stripe's pages last minutes, which is
// why the email cannot carry Stripe's address itself) and send them there. The page shows one thing: put in a new
// card. Stripe makes it the card on file (invoice_settings.default_payment_method), Stripe tells us (customer.updated),
// and newCard tries the open bill on it right away. A link that is old or made up lands on My Yard's sign in.
async function cardGo(request, env, ctx) {
  const site = String(env.SITE_URL || 'https://' + siteHost(env)).replace(/\/$/, '');
  const go = (to) => new Response(null, { status: 302, headers: { location: to } });
  const m = /^([0-9a-f-]{36})\.(\d{10})\.([A-Za-z0-9_-]{20,})$/.exec(new URL(request.url).searchParams.get('k') || '');
  if (!live(env) || !m || !uuid(m[1]) || Number(m[2]) < Date.now() / 1000 || !sameSecret(await hmac(env, 'card|' + m[1] + '.' + m[2]), m[3])) return go(site + '/account/?card=old');
  if (hitLimit('cardlink|' + m[1], 30, 3600e3)) return go(site + '/account/?card=old');
  try {
    const c = (await db(env, 'GET', 'customers?id=eq.' + m[1] + '&select=stripe_customer_id'))[0];
    if (!c || !c.stripe_customer_id) return go(site + '/account/?card=old');
    const s = await stripe(env, 'POST', 'billing_portal/sessions', {
      customer: c.stripe_customer_id, return_url: site + '/account/',
      flow_data: { type: 'payment_method_update', after_completion: { type: 'hosted_confirmation', hosted_confirmation: { custom_message: 'Thank you. Your new card is saved. If a bill was waiting, we are trying it now and will email you when it goes through.' } } }
    });
    if (!/^https:\/\//.test(s.url || '')) throw new Error('Stripe sent no page');
    return go(s.url);
  } catch (e) {
    if (ctx && ctx.waitUntil) ctx.waitUntil(logError(env, 'server', '/api/card', 'The card link from a "card did not go through" email could not open Stripe\'s card page', clean(e && e.message, 300)));
    return go(site + '/account/?card=old');
  }
}
async function meLink(request, env) {
  if (!sbLive(env)) return fail(503, 'Sign in is not turned on yet.');
  const b = await body(request);
  const m = /^([0-9a-f-]{36})\.(\d{10})\.([A-Za-z0-9_-]{20,})$/.exec(String((b && b.k) || ''));
  const expired = () => fail(410, 'This link has ended. Type your email and we send you a code.', 'link_ended');
  if (!m || !uuid(m[1])) return expired();
  const want = await hmac(env, m[1] + '.' + m[2]);
  if (!sameSecret(want, m[3]) || Number(m[2]) < Date.now() / 1000) return expired();
  const c = (await db(env, 'GET', 'customers?id=eq.' + m[1] + '&select=id,email'))[0];
  if (!c || !c.email) return expired();
  // Never a staff account, even if a customer row shares its email.
  if ((await db(env, 'GET', 'staff?email=eq.' + enc(String(c.email).toLowerCase()) + '&select=id')).length) return expired();
  // Sign them in the way every customer signs in: with a one time email token from Supabase. The server asks Supabase
  // for the token (nothing is emailed) and trades it for a session right away. No password is ever set or used: a sign
  // in that came from a password is refused everywhere (see passwordSession).
  let d = null, why = '';
  try {
    const g = await fetch(base(env) + '/auth/v1/admin/generate_link', { method: 'POST', headers: sbHeaders(env.SUPABASE_SERVICE_ROLE_KEY), body: JSON.stringify({ type: 'magiclink', email: String(c.email).toLowerCase() }) });
    const link = g.ok ? await g.json() : null;
    const hash = link && (link.hashed_token || (link.properties && link.properties.hashed_token));
    if (!hash) why = 'no token ' + g.status;
    else {
      for (const type of ['magiclink', 'email']) {
        const v = await fetch(base(env) + '/auth/v1/verify', { method: 'POST', headers: sbHeaders(env.SUPABASE_ANON_KEY), body: JSON.stringify({ type, token_hash: hash }) });
        if (v.ok) { d = await v.json(); break; }
        why = 'verify ' + v.status;
      }
    }
  } catch (e) { why = clean(e && e.message, 200); }
  // The session must be for this very customer, or it is thrown away.
  if (d && !(d.access_token && d.refresh_token && d.user && d.user.id === c.id)) { why = 'the session was for another account'; d = null; }
  if (!d) { await logError(env, 'server', '/api/me/link', 'A My Yard link from a welcome email could not sign the customer in', why).catch(() => {}); return expired(); }
  return ok({ session: Object.assign(sessionOut(d), { user: { id: c.id, email: String(c.email).toLowerCase() } }) });
}
function form(obj, prefix, out) {
  out = out || [];
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v === undefined || v === null) continue;
    const key = prefix ? prefix + '[' + k + ']' : k;
    if (typeof v === 'object') form(v, key, out);
    else out.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(v)));
  }
  return out.join('&');
}
async function stripe(env, method, path, params, idem) {
  const q = params ? form(params) : '';
  const url = 'https://api.stripe.com/v1/' + path + (method === 'GET' && q ? '?' + q : '');
  const headers = { authorization: 'Bearer ' + env.STRIPE_SECRET_KEY, 'stripe-version': STRIPE_VERSION };
  if (method !== 'GET') headers['content-type'] = 'application/x-www-form-urlencoded';
  if (idem) headers['idempotency-key'] = idem;
  const r = await fetch(url, { method, headers, body: method !== 'GET' ? q : undefined });
  const data = await r.json();
  if (!r.ok) {
    const e = new Error('stripe ' + r.status + ' ' + ((data.error && data.error.message) || ''));
    e.status = r.status;
    e.stripe = data.error;
    // Stripe keeps the answer to a keyed request for a day and hands the same one back, a failure too.
    e.replayed = r.headers.get('idempotent-replayed') === 'true';
    throw e;
  }
  // The same for an answer that worked: `_replayed` says this request was not the first one with its key.
  if (idem && data && typeof data === 'object' && r.headers.get('idempotent-replayed') === 'true') Object.defineProperty(data, '_replayed', { value: true });
  return data;
}
// Stripe has three ways to say that an id we saved is no longer there. A 404. A 400 with the code resource_missing
// ("No such customer: ..."): that is what it answered on Nov 17, 2026 for a customer that had been deleted in the
// Stripe dashboard, and checkout only knew the 404, so a real sign up got "Checkout did not load". And for a deleted
// customer it can answer 200 with deleted: true (see the callers). All three mean gone. Never test a saved Stripe id
// with a bare 404 again: use this.
// `param` is for a request that names the saved id in a field (customer: ...) next to other things. Then only a
// "missing" that is about that field counts, so some other missing thing is never taken for a customer that is gone.
function stripeGone(e, param) {
  if (!e) return false;
  if (e.status === 404) return true;
  const x = e.stripe || {};
  if (x.code !== 'resource_missing') return false;
  if (!param) return true;
  return x.param === param || (!x.param && new RegExp('^No such ' + param + '\\b', 'i').test(String(x.message || '')));
}
function money(cents) { return '$' + (cents / 100).toFixed(cents % 100 ? 2 : 0); }
// A month price in cents from a price table. Past six dogs (the office can count more) each dog adds the last step.
function tableCents(table, plan, dogs) {
  const row = (table && table[plan]) || [];
  const n = Math.max(1, Math.round(Number(dogs)) || 1);
  const dollars = n <= row.length ? row[n - 1] : row[row.length - 1] + (n - row.length) * (row[row.length - 1] - row[row.length - 2]);
  return Math.round((dollars || 0) * 100);
}
// What a NEW sign up pays each month, in cents. Use this for the card step, a new plan and a sign up request only.
function monthly(plan, dogs) { return tableCents(PRICES.month, plan, dogs); }
// What a customer who HAS a plan pays each month, in cents. A plan that was running before the prices changed keeps
// its price (Joe, Nov 18, 2026: "Don't change any existing customer's price"), so the office, My Yard and every email
// about a plan that is already running use this, never monthly(). `dogs` is for a dog count that is about to change.
const keptPlan = (c) => !!(c && c.stripe_subscription_id && PRICES.kept.plans.includes(c.stripe_subscription_id));
function rowMonthly(c, dogs) { return tableCents(keptPlan(c) ? PRICES.kept.month : PRICES.month, c.plan, dogs || c.dogs); }
// What a Stripe plan bills each month, in cents: every price line on it. 0 when the lines carry no amounts.
function planCents(sub) {
  const lines = (sub && sub.items && sub.items.data) || [];
  return lines.reduce((n, i) => n + ((i.price && i.price.unit_amount) || 0) * (i.quantity || 1), 0);
}

// Arizona does not use daylight saving time, so Arizona noon is always 19:00 UTC.
function azToday() { return new Date(Date.now() - 7 * 3600e3).toISOString().slice(0, 10); }
function noonAZ(iso) { return new Date(iso + 'T19:00:00Z'); }
function plusMonth(d) {
  const c = new Date(d.getTime());
  const day = c.getUTCDate();
  c.setUTCDate(1);
  c.setUTCMonth(c.getUTCMonth() + 1);
  const last = new Date(Date.UTC(c.getUTCFullYear(), c.getUTCMonth() + 1, 0)).getUTCDate();
  c.setUTCDate(Math.min(day, last));
  return c;
}
// Customers do not pick a day. We set it by route and reach out to them.
// How a plan is billed (Joe, Nov 16, 2026, night): every customer has their own bill day, and no bill is ever for a
// part month. With a free month (the Black Friday sale), the card is saved at sign up and nothing is charged. The free
// month is exactly one month from the day they sign up, Arizona time: sign up November 16, first bill December 16
// (Joe, Nov 16, 2026, 11:25 pm: "it has to be correlated to what the date is today", "we cannot lose any extra money").
// It no longer starts on the first visit day and no days are added for setting the first visit. The day it ends,
// Stripe charges the full month price, and that day of the month is their bill day from then on. With
// no free month (after the sale), the full month price is charged in the card form at sign up, and the sign up day
// is their bill day. Bills are not lined up on the 1st any more, so nothing is worked out by the day.
// The sign up page uses the same rule (`_bill`) to show these numbers before the card step. Once the card form is
// made, the page shows the line this server sends back with it (`line`), so the page and Stripe always say the same day.
const scheduleDays = (env) => Number(env.SCHEDULE_DAYS) || 7;
const unix = (d) => Math.floor(d.getTime() / 1000);
// The free month is the Black Friday sale: sign ups through November 30, 2026, Arizona time. This is the same moment
// as DEAL_END in build/build.mjs, which switches the words on the site. Change both together. To move the day without
// a new build, set FREE_MONTH_UNTIL in Cloudflare to a time like 2026-12-01T06:59:59Z.
const FREE_MONTH_UNTIL = '2026-12-01T06:59:59Z';
function freeMonth(env) {
  const until = Date.parse(env.FREE_MONTH_UNTIL || '') || Date.parse(FREE_MONTH_UNTIL);
  return Date.now() <= until;
}
function firstCharge(env, plan, dogs, free) {
  const total = monthly(plan, dogs);
  const from = noonAZ(env.FIRST_VISIT_FROM || '2026-11-20');
  const start = new Date(Math.max(noonAZ(azToday()).getTime() + 86400e3, from.getTime()));
  const minEnd = new Date(start.getTime() + MIN_DAYS * 86400e3);
  // The first charge is always one full month: the day the free month ends, or today when there is no free month.
  const out = { free: !!free, total, firstCents: total, minEnd: unix(minEnd), minLabel: dateLabel(minEnd), minShort: dayShort(minEnd) };
  if (!free) return Object.assign(out, { nextShort: dayShort(plusMonth(new Date())) });
  // One month from the sign up day, at noon Arizona time. January 31 runs to the last day of February.
  const freeEnd = plusMonth(noonAZ(azToday()));
  return Object.assign(out, { freeEnd: unix(freeEnd), freeLabel: dateLabel(freeEnd), freeShort: dayShort(freeEnd) });
}
const MIN_DAYS = 60;
// Joe, Nov 16, 2026, night: the "keep your plan 60 days" rule is off. It made the free month confusing, so the site only
// says first month free, and nobody is charged for canceling early: we never bill a fee the customer was not told about.
// The rule comes back only if EARLY_CANCEL is set to "on" in Cloudflare, and then only for sign ups made while it was on
// (their plan carries min_end). The words on the site have to come back in the same change. The 60 day date still decides
// when pausing opens (pause_from), so a pause cannot be used to stretch a free month.
const earlyOn = (env) => env.EARLY_CANCEL === 'on';
function dateLabel(d) { return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'America/Phoenix' }); }
function dayShort(d) { return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Phoenix' }); }
// One plain line, the same words the pay step shows: "$0 today. Then $99 a month starting Dec 16."
function billText(b) {
  if (b.free) return '$0 today. Then ' + money(b.total) + ' a month starting ' + b.freeShort + '.';
  return money(b.total) + ' today. Then ' + money(b.total) + ' a month' + (b.nextShort ? ' starting ' + b.nextShort : '') + '.';
}
// The same line from what was saved on the Stripe plan at sign up. `sub` is the plan itself, for the day its next bill
// comes when there was no free month.
function billFrom(meta, total, sub) {
  meta = meta || {};
  const freeEnd = parseInt(meta.free_end || '', 10);
  if (freeEnd > 0) return billText({ free: true, total, freeShort: dayShort(new Date(freeEnd * 1000)) });
  if (meta.no_free) {
    const from = sub && (sub.billing_cycle_anchor || sub.start_date || sub.created);
    return billText({ free: false, total, nextShort: from > 0 ? dayShort(plusMonth(new Date(from * 1000))) : '' });
  }
  return 'Then ' + money(total) + ' a month, on the same day each month.';
}
const idOf = (x) => (typeof x === 'string' ? x : (x && x.id) || '');
const uuid = (x) => (/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(String(x || '')) ? String(x) : '');

// `html` is optional: the same email with our look (see brandMail). The plain text always goes along.
// `replyTo` is optional too: who a Reply goes to. Left out, a Reply goes to the office.
async function mail(env, to, subject, text, html, replyTo) {
  if (!env.RESEND_API_KEY || !to) return false;
  const from = env.MAIL_FROM || 'Arizona Pet Waste <info@arizonapetwaste.com>';
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + env.RESEND_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify(Object.assign({ from, to: Array.isArray(to) ? to : [to], subject, text, reply_to: replyTo || env.NOTIFY_EMAIL || 'info@arizonapetwaste.com' }, html ? { html } : {}))
    });
    if (!r.ok) { console.error('mail failed', r.status, await r.text()); return false; }
    return true;
  } catch (e) { console.error('mail failed', e); return false; }
}
const owner = (env) => env.NOTIFY_EMAIL || 'info@arizonapetwaste.com';
// A community or commercial quote always lands in info@arizonapetwaste.com (Joe, Nov 19, 2026: "Make sure that gets a free
// quote. Make sure that goes directly to info@arizonapetwaste.com."). If the office inbox (NOTIFY_EMAIL) is ever set to
// another address, that one gets a copy, and info@ still gets the quote.
const QUOTE_INBOX = 'info@arizonapetwaste.com';
const quoteInbox = (env) => { const o = String(owner(env)).trim(); return o.toLowerCase() === QUOTE_INBOX ? [QUOTE_INBOX] : [QUOTE_INBOX, o]; };

/* ---------- customer emails with our look: the logo on navy, one orange button, plain words ---------- */
// One email, two forms. `text` is for mail apps that show words only. `html` is the same words under the logo, with
// the one thing to tap as a big button. `before` and `after` are lists of short paragraphs ('' is left out).
// Colors and the 12px corners are the site's (design/README.md). The font is the phone's own: a mail app will not
// load ours. The logo is a small picture on the site (static/assets/img/email-logo.png).
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
function brandMail(env, heading, before, btn, after) {
  const site = 'https://' + siteHost(env);
  const para = (list) => (list || []).filter((x) => x).map((x) => '<p style="margin:0 0 14px;font-size:16px;line-height:1.55;color:#0E1430;">' + esc(x) + '</p>').join('');
  const button = btn && btn.url ? '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 22px;"><tr><td style="background:#FF4A1C;border-radius:12px;">' +
    '<a href="' + esc(btn.url) + '" style="display:inline-block;padding:15px 28px;font-size:17px;font-weight:bold;color:#0E1430;text-decoration:none;">' + esc(btn.label) + '</a></td></tr></table>' : '';
  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="color-scheme" content="light only"><title>' + esc(heading) + '</title></head>' +
    '<body style="margin:0;padding:0;background:#F6F4EF;font-family:Arial,Helvetica,sans-serif;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F4EF;"><tr><td align="center" style="padding:24px 12px;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;">' +
    '<tr><td style="background:#0A0F24;padding:22px 28px;"><a href="' + site + '/" style="text-decoration:none;"><img src="' + site + '/assets/img/email-logo.png" width="210" alt="Arizona Pet Waste" style="display:block;border:0;width:210px;max-width:100%;height:auto;color:#F6F4EF;font-size:20px;font-weight:bold;"></a></td></tr>' +
    '<tr><td style="padding:28px 28px 14px;">' +
    '<p style="margin:0 0 18px;font-size:25px;line-height:1.2;font-weight:bold;color:#0A0F24;">' + esc(heading) + '</p>' + para(before) + button + para(after) +
    '</td></tr>' +
    '<tr><td style="background:#0A0F24;padding:18px 28px;font-size:14px;line-height:1.6;color:#F6F4EF;">Arizona Pet Waste<br>Call or text <a href="tel:+16233096104" style="color:#F6F4EF;">623.309.6104</a><br>' +
    '<a href="' + site + '/" style="color:#F6F4EF;">' + esc(siteHost(env)) + '</a></td></tr>' +
    '</table></td></tr></table></body></html>';
  const text = (before || []).concat(btn && btn.url ? [btn.label + ': ' + btn.url] : [], after || []).filter((x) => x).join('\n\n') + '\n\nArizona Pet Waste\n623.309.6104';
  return { text, html };
}

/* ---------- prices live in Stripe; made on first use and found by lookup key ---------- */
// One Stripe price for each plan and dog count (Joe, Nov 18, 2026: one dog costs less than two on the weekly plan, so
// "a base price plus extra dogs" no longer fits). The key names the plan, the dogs and the amount in cents:
// apw_week_2_9900 is every week, 2 dogs, $99 a month. Because the amount is in the key, a new number in
// src/prices.json makes a NEW Stripe price for new sign ups. A plan that is already running holds on to the price it
// was made with, so changing a number never changes what a current customer is charged. Only the price that a sign up
// needs is asked for or made, one at a time. Never make these by hand in the Stripe dashboard.
const priceKey = (plan, dogs) => 'apw_' + plan + '_' + dogs + '_' + monthly(plan, dogs);
let priceCache = null;
async function product(env, id, name) {
  try { return (await stripe(env, 'GET', 'products/' + id)).id; } catch (e) { if (!stripeGone(e)) throw e; }
  try { return (await stripe(env, 'POST', 'products', { id, name })).id; } catch (e) { return (await stripe(env, 'GET', 'products/' + id)).id; }
}
async function priceId(env, plan, dogs) {
  const mode = env.STRIPE_SECRET_KEY.slice(-6);
  if (!priceCache || priceCache.key !== mode) priceCache = { key: mode, ids: {} };
  const k = priceKey(plan, dogs);
  if (priceCache.ids[k]) return priceCache.ids[k];
  const res = await stripe(env, 'GET', 'prices', { lookup_keys: [k], active: true, limit: 1 });
  let id = res.data && res.data[0] && res.data[0].id;
  if (!id) {
    const label = PLANS[plan].name + ', ' + dogs + (dogs === 1 ? ' dog' : ' dogs');
    const pid = await product(env, 'apw_' + plan + '_' + dogs, 'Dog poop pickup, ' + label.toLowerCase());
    try {
      id = (await stripe(env, 'POST', 'prices', { currency: 'usd', unit_amount: monthly(plan, dogs), recurring: { interval: 'month' }, product: pid, lookup_key: k, nickname: label })).id;
    } catch (e) {
      const again = await stripe(env, 'GET', 'prices', { lookup_keys: [k], limit: 1 });
      if (!again.data || !again.data[0]) throw e;
      id = again.data[0].id;
    }
  }
  priceCache.ids[k] = id;
  return id;
}
// Plans made before November 18, 2026 have two kinds of lines: a base price for 1 or 2 dogs and an "extra dog" price.
// Those prices are still in Stripe under their old keys. This only finds the extra dog one, for a dog count the
// office changes on such a plan. It never makes a price: nothing new is ever sold at the old numbers.
async function oldExtraPrice(env, plan) {
  const res = await stripe(env, 'GET', 'prices', { lookup_keys: ['apw_' + plan + '_extra'], limit: 1 });
  if (!res.data || !res.data[0]) throw new Error('the older extra dog price for ' + plan + ' is not in Stripe');
  return res.data[0].id;
}

/* ---------- routes ---------- */
function config(env) {
  return ok({
    live: live(env),
    supabaseUrl: live(env) ? base(env) : null,
    supabaseAnonKey: live(env) ? env.SUPABASE_ANON_KEY : null,
    stripeKey: live(env) ? env.STRIPE_PUBLISHABLE_KEY : null,
    firstVisitFrom: env.FIRST_VISIT_FROM || '2026-11-20',
    scheduleDays: scheduleDays(env),
    // The sign up page shows "$0 today" or "$99 today" from this, so it always says what checkout will do.
    freeMonth: freeMonth(env),
    // What a new sign up pays: dollars a month for 1 to 6 dogs on each plan (src/prices.json). The pages are built
    // with the same numbers. This is here for any screen that wants them live, the office included.
    prices: PRICES.month,
    mail: !!env.RESEND_API_KEY,
    turnstileKey: env.TURNSTILE_SITE_KEY || null,
    // true when the card step asks for a bot pass (both Turnstile keys are set). The page only runs the check then.
    botCheck: !!(env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY)
  });
}

async function checkout(request, env, ctx) {
  if (!live(env)) return fail(503, 'Online sign up is not turned on yet. ' + CALL_US);
  let u = await signedIn(request, env);
  const b = await body(request);
  if (!b) return fail(400, 'Something was missing. Please try again.');
  if (!u && !emailOk(clean(b.email, 200).toLowerCase())) return fail(400, 'Type your email, like you@email.com.');
  const zip = String(b.zip || '');
  const z = ZIPS[zip];
  if (!z) return fail(400, 'We do not scoop in that ZIP code yet.');
  if (!own(PLANS, b.plan)) return fail(400, 'Please pick how often we come.');
  const dogs = Math.round(Number(b.dogs));
  if (!(dogs >= 1 && dogs <= 6)) return fail(400, 'Please pick 1 to 6 dogs.');
  const name = clean(b.name, 120), phone = digits(b.phone), address = clean(b.address, 200);
  if (name.length < 2 || phone.length !== 10 || address.length < 5) return fail(400, 'Please fill in your name, mobile number and street address.');
  // No sign in: a new customer. The account is made here with no email code, and the page gets no session.
  if (!u) {
    const email = clean(b.email, 200).toLowerCase();
    if (!(await botOk(env, b.bot, request.headers.get('cf-connecting-ip')))) return fail(403, 'Our bot check did not pass. Please try again.', 'bot');
    const id = await newAccount(env, email);
    if (!id) return fail(409, 'You already have an account with us. We sent a 6 digit code to your email.', 'use_code');
    u = { id, email };
  }

  const rows = await db(env, 'GET', 'customers?id=eq.' + u.id + '&select=*');
  const row = rows && rows[0];
  if (row && row.stripe_subscription_id && ['trialing', 'active', 'past_due', 'paused'].includes(row.status)) return ok({ already: true });

  // The free month is the sale, and the server's clock decides it. `noFree` can only turn a free month down: staff
  // open /book/?nofree=1 to run a sign up that pays today, so that path can be tried while the sale is still on.
  // Nothing a page sends can add a free month.
  const free = freeMonth(env) && !b.noFree;

  // One free month per home. A home or phone that already had a plan has to reach us to start again. With no free
  // month there is nothing to guard: they pay for their first month today like everyone else.
  if (free) {
    const had = row && row.stripe_subscription_id ? [row] : await dbAll(env, 'customers?id=neq.' + u.id + '&stripe_subscription_id=not.is.null&or=(phone.eq.' + phone + ',zip.eq.' + zip + ')&select=phone,address,zip&order=id');
    if (had.some((x) => x === row || x.phone === phone || (x.zip === zip && sameHome(x.address, address)))) {
      return fail(409, 'This home has had a free month with us before. Call or text 623.309.6104 and we will start you again today.', 'had_free_month');
    }
  }

  const cust = {
    email: u.email, name, phone: '+1' + phone,
    address: { line1: address, city: z.city, state: 'AZ', postal_code: zip, country: 'US' },
    metadata: { user_id: u.id }
  };
  let customer = row && row.stripe_customer_id;
  // One line for the Health tab when a saved customer turned out to be gone (three an hour at most).
  const goneNote = (was) => {
    if (!hitLimit('cust-gone', 3, 3600e3)) ctx.waitUntil(logError(env, 'server', '/api/checkout', 'A sign up’s saved Stripe customer was gone, so a new one was made',
      'Stripe no longer has ' + clean(was, 60) + ' (deleted in the Stripe dashboard, or made with other keys). The sign up went on with a new Stripe customer. Nothing to do.'));
  };
  if (customer) {
    // A customer id Stripe no longer has: it was deleted in the Stripe dashboard, or it was made with other keys (test
    // mode, before the switch to live). Start a new one. The row takes the new id a few lines down, so the old id is
    // never asked for again. Stripe says "gone" in three ways (see stripeGone): all three land here.
    let lost = false;
    try {
      const c = await stripe(env, 'POST', 'customers/' + enc(customer), cust);
      lost = !!(c && c.deleted);
    } catch (e) {
      if (!stripeGone(e)) throw e;
      lost = true;
    }
    if (lost) { goneNote(customer); customer = null; }
  }
  if (!customer) customer = (await stripe(env, 'POST', 'customers', cust)).id;
  // A second net under the same hole. If the update above went through and Stripe still says, at a later step of this
  // sign up, that it does not have the customer (a 400 that names the customer), a new one is made there, the row
  // takes its id and that step is asked for again. Once per try, so no customer is ever made for nothing.
  let remade = false;
  const custGone = (e) => !remade && !!(e && e.stripe && e.stripe.code === 'resource_missing' && (e.stripe.param === 'customer' || /^No such customer/i.test(String(e.stripe.message || ''))));
  const remake = async () => {
    remade = true;
    const was = customer;
    customer = (await stripe(env, 'POST', 'customers', cust)).id;
    await db(env, 'PATCH', 'customers?id=eq.' + u.id + '&status=eq.checkout', { stripe_customer_id: customer, updated_at: new Date().toISOString() }, 'return=minimal');
    goneNote(was);
  };

  await db(env, 'POST', 'customers?on_conflict=id', [{
    id: u.id, email: u.email, name, phone, address, zip, area: z.area, plan: b.plan, dogs, first_visit: null,
    texts_visit: !!b.textsVisit, texts_deals: false, status: 'checkout', stripe_customer_id: customer, updated_at: new Date().toISOString()
  }], 'resolution=merge-duplicates,return=minimal');

  const ip = request.headers.get('cf-connecting-ip') || '';
  const ua = clean(request.headers.get('user-agent'), 300);
  const page = clean(b.page, 120);
  await db(env, 'POST', 'consent_log', [
    { user_id: u.id, email: u.email, phone, kind: 'texts_visit', granted: !!b.textsVisit, text_shown: CONSENT.visit + ' ' + CONSENT.fine, page, ip, user_agent: ua },
    { user_id: u.id, email: u.email, phone, kind: 'texts_deals', granted: false, text_shown: 'Not asked at sign up.', page, ip, user_agent: ua }
  ], 'return=minimal');

  // Make sure this sign up's price is in Stripe before the card form shows (the first sign up at a price makes it).
  const price = await priceId(env, b.plan, dogs);
  const bill = firstCharge(env, b.plan, dogs, free);
  // The line under the button in Stripe's form: the same plain words as the pay step.
  const note = billText(bill) + ' ' + cancelText(bill, env);
  // What rides on the card form and then on the plan. pause_from is the day pausing opens (the first 60 days are closed
  // for everyone). The 60 day cancel rule is off, so min_end and min_label only ride along while EARLY_CANCEL is on, and
  // only with a free month (see earlyOn).
  const early = earlyOn(env) && free;
  const meta = {
    user_id: u.id, plan: b.plan, dogs: String(dogs), zip, first_charge: String(bill.firstCents), pause_from: String(bill.minEnd),
    min_end: early ? String(bill.minEnd) : undefined, min_label: early ? bill.minLabel : undefined
  };
  // Meta's browser and click ids, so the booking sent to Meta later (metaBooked) names the ad. Only when that is on.
  // They ride on the card form only, never on the plan.
  const ad = metaOn(env) ? adMeta(b, ip, ua) : {};
  let form;
  if (free) {
    // Free month: the card form only saves the card. Nothing is charged, so the form shows $0. The plan itself is
    // started by startPlan the moment the card is saved. The day the free month ends rides along in metadata, so the
    // customer gets the date they saw.
    form = {
      mode: 'setup',
      ui_mode: 'embedded_page',
      redirect_on_completion: 'never',
      currency: 'usd',
      customer,
      client_reference_id: u.id,
      setup_intent_data: { description: 'Card for ' + PLANS[b.plan].name.toLowerCase() + ' dog poop pickup', metadata: { user_id: u.id } },
      metadata: Object.assign({}, meta, { free_end: String(bill.freeEnd), free_label: bill.freeLabel }, ad),
      custom_text: { submit: { message: note } }
    };
  } else {
    // No free month: Stripe's own plan checkout. The form shows the month price and charges it right there, so a card
    // that is refused gets fixed in the form. Stripe starts the plan at that moment, which makes today the bill day.
    // paidPlan books the yard once the first month is paid.
    // One plan for one customer. A plan Stripe already has for them that is still going is their plan: a second tab
    // that was paid, or a sign up whose booking is still on its way.
    let all;
    try { all = (await stripe(env, 'GET', 'subscriptions', { customer, status: 'all', limit: 100 })).data || []; }
    catch (e) { if (!custGone(e)) throw e; await remake(); all = []; } // a customer that is gone has no plan, and the new one has none yet
    if (all.some((x) => ['trialing', 'active', 'past_due', 'unpaid', 'paused'].includes(x.status))) return ok({ already: true });
    // One open card form for one customer. Two tabs paid one after the other would be two plans and two charges, so a
    // card form left open from before is closed before a new one is made. This never stops a sign up.
    try {
      const open = (await stripe(env, 'GET', 'checkout/sessions', { customer, status: 'open', limit: 10 })).data || [];
      for (const x of open) await stripe(env, 'POST', 'checkout/sessions/' + encodeURIComponent(x.id) + '/expire');
    } catch (e) {
      ctx.waitUntil(logError(env, 'server', '/api/checkout', 'An older card form of this customer could not be closed (the new one still opened)', clean(e && e.message, 300)));
    }
    // One line: the price for this plan and this many dogs.
    const items = [{ price, quantity: 1 }];
    const md = Object.assign({}, meta, { no_free: '1' });
    form = {
      mode: 'subscription',
      ui_mode: 'embedded_page',
      redirect_on_completion: 'never',
      customer,
      client_reference_id: u.id,
      line_items: items,
      subscription_data: {
        description: PLANS[b.plan].name + ', ' + dogs + (dogs === 1 ? ' dog' : ' dogs') + ', ' + z.name + '. We reach out to set the first visit.',
        metadata: md
      },
      metadata: Object.assign({}, md, ad),
      custom_text: { submit: { message: note } }
    };
  }
  // Cards only. Apple Pay and Google Pay ride on cards, so they still show. Link is off: no "save my info" box, no
  // extra phone field and no Bank tab. Nothing else shows either, even if it is switched on in the Stripe Dashboard.
  const cardsOnly = { allowed_payment_method_types: ['card'] }, linkOff = { wallet_options: { link: { display: 'never' } } };
  // If Stripe will not take the card form the way we want it, sign up must still work. So the form is asked for in
  // this order, best first, and the first one Stripe takes is used. A form further down the list may show more ways
  // to pay, and the Health tab then says which one was used and why.
  const noCurrency = Object.assign({}, form); delete noCurrency.currency;
  const ways = [
    ['cards only, Link off', Object.assign({}, form, cardsOnly, linkOff)],
    // Stripe's guide for a card form that only saves a card says to leave the currency out when a list is sent.
    form.currency ? ['cards only, Link off, no currency', Object.assign({}, noCurrency, cardsOnly, linkOff)] : null,
    ['cards only (Link may show)', Object.assign({}, form, cardsOnly)],
    ['Link off (other ways to pay that are on in the Stripe Dashboard may show)', Object.assign({}, form, linkOff)],
    ['every way to pay that is on in the Stripe Dashboard', form]
  ].filter(Boolean);
  let ck, refused = null;
  for (let i = 0; !ck; i++) {
    try { ck = await stripe(env, 'POST', 'checkout/sessions', ways[i][1]); } catch (e) {
      // Stripe does not have the customer after all: make a new one and ask for the card form again, from the top of the list.
      if (custGone(e)) { await remake(); for (const w of ways) w[1].customer = customer; refused = null; i = -1; continue; }
      if (e.status !== 400 || i + 1 >= ways.length) throw e;
      refused = refused || e;
      continue;
    }
    if (refused) {
      ctx.waitUntil(logError(env, 'server', '/api/checkout', 'Stripe refused the list of ways to pay, so the card form was made another way',
        'Used: ' + ways[i][0] + '. Stripe said: ' + clean(refused.message, 300)));
    }
  }
  // `free` tells the page which of the two it got, and `line` is the price line itself, word for word what Stripe's
  // note says. The page shows it, so its price line can never say something else.
  return ok({ clientSecret: ck.client_secret, session: ck.id, free, line: billText(bill) });
}

// The sign up page calls this the moment Stripe says the card form is done. The Stripe webhook does the same job, so
// a sign up still finishes when one of the two is late or down.
async function checkoutDone(request, env, ctx) {
  if (!live(env)) return fail(503, 'Online sign up is not turned on yet. ' + CALL_US);
  const u = await signedIn(request, env);
  const b = await body(request);
  const id = String((b && b.session) || '');
  if (!/^cs_[A-Za-z0-9_]{4,250}$/.test(id)) return fail(400, 'Something was missing. Please try again.');
  // A new customer has no sign in. The card form id is the proof: Stripe makes it, it cannot be guessed, and only the page
  // that opened that card form has it. All this call can do with it is start that one sign up's plan, the same as the webhook.
  let s;
  try { s = await stripe(env, 'GET', 'checkout/sessions/' + id, { expand: ['setup_intent.payment_method'] }); }
  catch (e) { if (stripeGone(e)) return fail(400, 'Something was missing. Please try again.'); throw e; }
  if (u && s.client_reference_id !== u.id) return fail(403, 'That sign up belongs to someone else.');
  if (s.status !== 'complete') return ok({ booked: false });
  try {
    // A saved card (free month) gets its plan started here. A paid first month already has its plan and gets booked.
    const out = s.mode === 'subscription' ? await paidPlan(env, ctx, s) : await startPlan(env, ctx, s);
    return ok({ booked: !!out });
  } catch (e) {
    // Only for a card form that was just finished, so an old sign up asked about again does not email the office.
    await planAlert(env, s, e, Date.now() / 1000 - (s.created || 0) < 3600);
    throw planError(s, e);
  }
}

// How long to wait (times 1, 2, 3) before asking Stripe again when it says the same request is still running.
const PLAN_WAIT = 700;
// The "only once" key for starting a plan is this plus the sign up's session id. Stripe remembers the answer to a
// keyed request for a day, a failed answer too, and it refuses the same key with other fields. So if the fields of
// the plan request in startPlan ever change, change this prefix in the same commit. If not, a sign up that failed
// under the old fields stays stuck until Stripe forgets its key. (apw-plan- was the key while bills were lined up on
// the 1st. apw-plan2- is from November 16, 2026: no billing day is sent any more. apw-plan3- is from November 18,
// 2026: a plan has one price line for its plan and dog count, not a base line and an extra dog line.)
const PLAN_KEY = 'apw-plan3-';
// The card is saved. Start the plan: free until `free_end`, and that is all Stripe is told. With no other day given,
// Stripe charges the full month price the day the free month ends and bills on that day of the month from then on
// (its trial rule: "A new billing period also begins for the customer when the trial ends"). Never send a billing
// day or a proration setting here: that is what made part month bills. Safe to run more than once for one sign up:
// the Stripe webhook and the sign up page both call it, Stripe keeps it to one plan, and `booked` keeps it to one
// welcome.
async function startPlan(env, ctx, s) {
  const md = s.metadata || {};
  const uid = uuid(s.client_reference_id || md.user_id), customer = idOf(s.customer);
  if (s.mode !== 'setup' || !uid || !customer || !PLANS[md.plan]) return null;
  // Only a sign up that is waiting at the card step gets a plan. A finished sign up that is reported again (the
  // page and the webhook both report it, Stripe sends events again, anyone can resend one from the Dashboard) starts
  // nothing. Neither does an old sign up of a customer who has since canceled.
  const rows = await db(env, 'GET', 'customers?id=eq.' + uid + '&select=status,stripe_subscription_id');
  const row = rows && rows[0];
  if (!row || row.status !== 'checkout') {
    return row && row.stripe_subscription_id && ['trialing', 'active', 'past_due', 'paused'].includes(row.status) ? { id: row.stripe_subscription_id, already: true } : null;
  }
  let si = s.setup_intent;
  if (typeof si === 'string') si = await stripe(env, 'GET', 'setup_intents/' + si, { expand: ['payment_method'] });
  let card = si && si.payment_method;
  if (typeof card === 'string') card = await stripe(env, 'GET', 'payment_methods/' + card);
  if (!card || !card.id) throw new Error('sign up ' + s.id + ' has no saved card');
  // Every plan this customer has had. One sign up makes one plan, ever: if the plan from this sign up is there, it is
  // the plan, and if it has been canceled since, no new one is made. Any other live plan is the plan too (a second tab).
  const all = (await stripe(env, 'GET', 'subscriptions', { customer, status: 'all', limit: 100 })).data || [];
  // A plan whose first payment never went through ("incomplete", from a paid sign up that was not finished) is not a plan.
  const alive = (x) => x.status !== 'canceled' && x.status !== 'incomplete_expired' && x.status !== 'incomplete';
  const mine = all.filter((x) => x.metadata && x.metadata.session === s.id)[0];
  if (mine && !alive(mine)) return null;
  let sub = mine || all.filter(alive)[0] || null;
  if (!sub) {
    const freeEnd = parseInt(md.free_end, 10);
    if (!(freeEnd > Date.now() / 1000)) throw new Error('sign up ' + s.id + ' has bad dates');
    const dogs = Math.min(6, Math.max(1, parseInt(md.dogs, 10) || 1));
    // One line: the price for this plan and this many dogs, at today's numbers (src/prices.json).
    const items = [{ price: await priceId(env, md.plan, dogs), quantity: 1 }];
    // The saved card pays every bill. It is set on the Stripe customer, not on the plan, so a card changed later on
    // Stripe's billing page (My Yard, Change card) is the card every later bill and retry uses.
    await stripe(env, 'POST', 'customers/' + customer, { invoice_settings: { default_payment_method: card.id } });
    // The first charge is one full month at plan price, the day the free month ends. It is worked out here from the
    // plan itself, so a card form that was opened before November 16, 2026 (it still carries a part month amount)
    // gets the right number on its plan. checkPlan then holds what Stripe will charge up against what they saw.
    const firstCents = monthly(md.plan, dogs);
    const plan = {
      customer, items,
      // Free until trial_end, and no other day: the first bill is a full month that day, then that day each month.
      trial_end: freeEnd,
      description: PLANS[md.plan].name + ', ' + dogs + (dogs === 1 ? ' dog' : ' dogs') + ', ' + ((ZIPS[md.zip] || {}).name || 'AZ') + '. We reach out to set the first visit.',
      metadata: {
        user_id: uid, plan: md.plan, dogs: String(dogs), zip: md.zip || '', session: s.id, first_charge: String(firstCents),
        free_end: String(freeEnd), pause_from: md.pause_from || md.min_end || '', min_end: md.min_end || '',
        free_label: md.free_label || '', min_label: md.min_label || ''
      }
    };
    for (let tries = 0; !sub; tries++) {
      try { sub = await stripe(env, 'POST', 'subscriptions', plan, PLAN_KEY + s.id); } catch (e) {
        // 409: the other caller (the webhook or the sign up page) is starting this same plan right now. Ask again
        // with the same key: once its request is done, Stripe hands back the plan it made.
        if (e.status !== 409 || tries >= 3) throw e;
        await new Promise((r) => setTimeout(r, PLAN_WAIT * (tries + 1)));
      }
    }
    // Look at the first bill now. Queued before the row is touched, so a row update that fails cannot skip the look.
    ctx.waitUntil(checkPlan(env, s, sub));
  }
  await booked(env, ctx, uid, sub, customer, card, s);
  return sub;
}

// A sign up with no free month. Stripe's checkout made the plan and charged the first month in the form, so there is
// no plan to start here. What is left: the card moves onto the customer, and the yard is booked. Safe to run more
// than once for one sign up: the Stripe webhook and the sign up page both call it, and `booked` keeps it to one welcome.
async function paidPlan(env, ctx, s) {
  const md = s.metadata || {};
  const uid = uuid(s.client_reference_id || md.user_id), customer = idOf(s.customer);
  if (s.mode !== 'subscription' || !uid || !customer || !s.subscription) return null;
  let sub = s.subscription;
  if (typeof sub === 'string') sub = await stripe(env, 'GET', 'subscriptions/' + encodeURIComponent(sub));
  // Only a plan whose first month is paid is booked. A card that was refused leaves the plan "incomplete": the
  // customer is still in the form, and Stripe sends this event again when they finish.
  if (!sub || !sub.id || sub.status !== 'active') return null;
  const card = await cardToCustomer(env, ctx, sub, customer);
  await booked(env, ctx, uid, sub, customer, card, s);
  return sub;
}

// Stripe's checkout puts the card on the plan. We keep it on the customer and take it off the plan, the same as a
// free month sign up, so a card changed later on Stripe's billing page (My Yard, Change card) is the card every later
// bill and retry uses. Run again, it finds nothing on the plan and changes nothing. A failure here never stops a
// booking: the card still pays the plan, and the Health tab says what to look at.
async function cardToCustomer(env, ctx, sub, customer) {
  let card = sub && sub.default_payment_method;
  if (!card) return null;
  try {
    if (typeof card === 'string') card = await stripe(env, 'GET', 'payment_methods/' + encodeURIComponent(card));
    if (!card || !card.id) return null;
    // The customer gets the card first. Only then does it come off the plan, so the plan is never left with no card.
    await stripe(env, 'POST', 'customers/' + customer, { invoice_settings: { default_payment_method: card.id } });
    await stripe(env, 'POST', 'subscriptions/' + encodeURIComponent(sub.id), { default_payment_method: '' });
    return card;
  } catch (e) {
    ctx.waitUntil(logError(env, 'server', '/api/checkout', 'The card of a new plan could not be moved onto the customer (the sign up itself went through)',
      sub.id + '. If they change their card in My Yard later, check in Stripe that the plan uses the new card. ' + clean(e && e.message, 300)));
    return card && card.id ? card : null;
  }
}

// The row leaves "checkout" once. Only the call that moves it puts the yard on a route and sends the welcome emails,
// so a sign up finished by the Stripe webhook and by the sign up page still gets one of each.
async function booked(env, ctx, uid, sub, customer, card, s) {
  const status = planStatus(sub);
  const meta = sub.metadata || {};
  const patch = { status, stripe_subscription_id: sub.id, stripe_customer_id: customer, updated_at: new Date().toISOString() };
  // The plan Stripe bills is the plan. If the card step was open in two tabs with two choices, the row follows the
  // one that was finished.
  const paidDogs = parseInt(meta.dogs, 10);
  if (PLANS[meta.plan] && paidDogs >= 1 && paidDogs <= 6) { patch.plan = meta.plan; patch.dogs = paidDogs; }
  const rows = await db(env, 'PATCH', 'customers?id=eq.' + uid + '&status=eq.checkout', patch, 'return=representation');
  const c = rows && rows[0];
  if (!c) return false;
  if (!card) {
    try { card = (await stripe(env, 'GET', 'customers/' + customer, { expand: ['invoice_settings.default_payment_method'] })).invoice_settings.default_payment_method; } catch (e) { card = null; }
  }
  // A plan paid for in Stripe's checkout can reach this before its card has been moved onto the customer.
  if (!card && typeof sub.default_payment_method === 'string' && sub.default_payment_method) {
    try { card = await stripe(env, 'GET', 'payment_methods/' + encodeURIComponent(sub.default_payment_method)); } catch (e) { card = null; }
  }
  const prepaid = !!(card && card.card && card.card.funding === 'prepaid');
  // What this plan costs a month: the lines Stripe has on it. If they cannot be read, today's price for the plan.
  const total = planCents(sub) || rowMonthly(Object.assign({}, c, { stripe_subscription_id: sub.id }));
  const paidToday = !!meta.no_free;
  const billLine = billFrom(meta, total, sub);
  ctx.waitUntil(placeCustomer(env, c));
  if (prepaid) ctx.waitUntil(mail(env, owner(env), 'Prepaid card: ' + c.name, c.name + ' signed up with a prepaid card. A prepaid card can run out of money, so a later charge may fail. Call them for a credit or debit card before the first visit.\n\nMobile: ' + c.phone + '\nEmail: ' + c.email + '\nStripe customer: ' + customer));
  ctx.waitUntil(mail(env, owner(env), (prepaid ? 'PREPAID CARD. ' : '') + 'New booking: ' + c.name + ', ' + (ZIPS[c.zip] || {}).name, [
    'New customer booked online.', '',
    'Name: ' + c.name, 'Email: ' + c.email, 'Mobile: ' + c.phone, 'Address: ' + c.address + ', ' + c.zip,
    'Plan: ' + PLANS[c.plan].name + ', ' + c.dogs + ' dogs, ' + money(total) + ' a month',
    'To do: reach out to set their day and time.', 'Billing: ' + billLine, 'Visit texts: ' + (c.texts_visit ? 'yes' : 'no') + '. Deals texts: ' + (c.texts_deals ? 'yes' : 'no'),
    'Stripe customer: ' + customer
  ].join('\n')));
  ctx.waitUntil(sendWelcome(env, c, [
    (paidToday ? 'Your card was charged. ' : 'Your card is saved. ') + billLine,
    (selfOn(env) ? 'You can cancel anytime in My Yard.' : 'You can cancel anytime. Call or text 623.309.6104.') + (meta.min_end && !paidToday ? ' ' + freeRule(meta.min_label) : '')
  ]));
  // The booking, sent to Meta once (this is the one call that moved the row), with the page's event id.
  if (metaOn(env)) ctx.waitUntil(metaBooked(env, c, total, meta.session || (s && s.id) || '', s && s.metadata, sub.id));
  return true;
}

// The welcome email. A new booking sends it, and the office can send it again from the customer card with a fresh
// My Yard link (the link in the first one stops working after LINK_DAYS days). `money` is the lines about the card
// and canceling, which only the first email has. Every send is written to `messages`, so the customer card shows
// when someone was invited to My Yard.
function welcomeText(env, c, link, money) {
  const texts = !!(c.texts_visit && c.phone);
  return [
    hi(c.name), '',
    'You are booked.', '',
    ...(money && money.length ? money.flatMap((x) => [x, '']) : []),
    'What happens next:',
    '1. We set your service day and time and send them to you by ' + (texts ? 'text and email.' : 'email.'),
    texts ? '2. The night before each visit, we text you a reminder.' : '2. We come on your service day. You do not need to be home.',
    texts ? '3. On visit day, we text you when we are on the way. When we are done, we text you a photo of your latched gate.' : '3. When we are done, we email you a photo of your latched gate.', '',
    'Next, set up My Yard: add your gate code, your dogs’ names and any problem spots. This link signs you in, no code needed. It works for ' + LINK_DAYS + ' days:',
    link, '',
    'After that, sign in at https://' + siteHost(env) + '/account/ with your email.', '',
    'Questions? Call or text 623.309.6104.', '', 'Arizona Pet Waste'
  ].join('\n');
}
async function sendWelcome(env, c, money, by) {
  if (!c || !c.email) return false;
  const sent = await mail(env, c.email, 'You are booked with Arizona Pet Waste', welcomeText(env, c, await yardLink(env, c.id), money));
  try {
    await db(env, 'POST', 'messages', [Object.assign({ customer_id: c.id, stop_id: null, kind: 'welcome', channel: 'email', to_addr: c.email, body: 'Welcome email with a My Yard link', status: sent ? 'sent' : 'failed', sent_at: new Date().toISOString() }, by ? { sent_by: by } : {})], 'return=minimal');
  } catch (e) { console.error('welcome log', e); }
  return sent;
}

// A saved card with no plan is the one failure that must not sit quiet: the customer thinks they are booked.
// The office is told who it is and what to look at. Only on a fresh try, and once an hour for one sign up, so
// Stripe's retries do not flood the inbox. The email does not say to start a plan by hand: the next retry usually
// starts it, and a plan made by hand on top of that one would bill the customer twice.
async function planAlert(env, s, e, fresh) {
  // Stripe keeps the answer to a keyed request for a day. When it hands back a failure it already gave (or says the
  // key was used with other fields), waiting will not help, and the office must hear that even on a late retry.
  const again = !!(e && (e.replayed || (e.status !== 409 && e.stripe && e.stripe.type === 'idempotency_error')));
  const sid = (s && s.id) || '';
  if (again ? hitLimit('planrepeat|' + sid, 1, 6 * 3600e3) : (fresh === false || hitLimit('planalert|' + sid, 1, 3600e3))) return;
  const md = (s && s.metadata) || {};
  let c = null;
  try { c = (await db(env, 'GET', 'customers?id=eq.' + uuid(s.client_reference_id || md.user_id) + '&select=name,email,phone,address,zip'))[0]; } catch (x) { c = null; }
  // A sign up with no free month paid in Stripe's checkout. Stripe has their plan and their money. What failed is our
  // side of the booking, so the words are different: nobody may charge them or start a plan for them again.
  const paid = !!(s && s.mode === 'subscription');
  await mail(env, owner(env), (paid ? 'ACTION NEEDED: paid at sign up but not booked yet' : 'ACTION NEEDED: card saved but the plan did not start') + (c ? ': ' + c.name : ''), (paid ? [
    'Someone paid for their first month at sign up, but the site could not finish booking them. They were charged, and their plan is in Stripe.', '',
    'The site tries again on its own for up to 3 days, and the next try often works. If a "New booking" email for them shows up, it fixed itself and there is nothing to do.', '',
    'If no "New booking" email comes within one hour:',
    '1. Do not start a plan for them by hand and do not charge them again. They have paid, and two plans means two bills.',
    '2. Call them so they know we have their sign up.',
    '3. Tell Joe today so the booking gets finished the right way.', ''
  ] : [
    'Someone finished sign up and saved a card, but their plan did not start. They were not charged.', '',
    'The site tries again on its own for up to 3 days, and the next try often works. If a "New booking" email for them shows up, it fixed itself and there is nothing to do.', '',
    'If no "New booking" email comes within one hour:',
    '1. Open their customer in Stripe (the id is below) and look at Subscriptions.',
    '2. If a plan is there, do not start a second one. Two plans means two bills.',
    '3. If no plan is there, call them so they know, and tell Joe today so the plan gets started the right way.', ''
  ]).concat([
    c ? 'Name: ' + c.name + '\nMobile: ' + c.phone + '\nEmail: ' + c.email + '\nAddress: ' + c.address + ', ' + c.zip : 'Customer row: not found',
    'Plan: ' + ((PLANS[md.plan] || {}).name || md.plan || 'unknown') + ', ' + (md.dogs || '?') + ' dogs',
    paid ? 'Free month: none. They paid for the first month at sign up.' : 'Free month ends: ' + (md.free_label || 'unknown'),
    'Stripe customer: ' + idOf(s && s.customer),
    'Stripe checkout session: ' + ((s && s.id) || 'unknown'), '',
    'What went wrong: ' + clean(e && e.message, 300),
    again ? 'Stripe is handing back the answer it gave the first time for this sign up, and it will for one day. Waiting will not fix this one. Tell Joe now.' : null
  ]).filter((x) => x !== null).join('\n'));
}
// The same failure, named so the Health tab line makes sense on its own.
function planError(s, e) {
  const x = e instanceof Error ? e : new Error(String(e));
  if (!/^(Card saved|Paid at sign up)/.test(x.message)) {
    x.message = (s && s.mode === 'subscription' ? 'Paid at sign up but not booked yet (' : 'Card saved but the plan did not start (') + ((s && s.id) || 'no session') + '). ' + x.message;
  }
  return x;
}

// The plan was just made. Ask Stripe what it will charge first and hold that up against what the customer was told
// at the card step: one full month, on the day the free month ends. They should always match. If they ever do not,
// the office hears about it the day of the sign up, weeks before the first charge. This only looks: it changes
// nothing in Stripe and it never stops a sign up. It is also what catches a part month: a first bill that is not the
// full month price shows up here as a first charge that does not match.
async function checkPlan(env, s, sub) {
  if (!sub || !sub.id || hitLimit('plancheck|' + sub.id, 1, 3600e3)) return;
  const md = (s && s.metadata) || {};
  const freeEnd = parseInt(md.free_end, 10), told = parseInt(md.first_charge, 10);
  const when = (t) => (t > 0 ? new Date(t * 1000).toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Phoenix' }) : 'no date');
  const off = [];
  try {
    if (sub.trial_end !== freeEnd) off.push('The day the free month ends. They were told ' + when(freeEnd) + '. Stripe has ' + when(sub.trial_end) + '.');
    // The bill day must be the day the free month ends. Stripe moves it there on its own when the free month ends,
    // unless the plan is set to keep an older bill day. That setting is what makes a part month, so it must not be on.
    const end = sub.trial_settings && sub.trial_settings.end_behavior;
    if (end && end.billing_cycle_anchor === 'unchanged') {
      off.push('The bill day. They were told they pay each month from ' + when(freeEnd) + '. In Stripe this plan is set to keep an older bill day when the free month ends, which makes a part month bill.');
    }
    const next = await stripe(env, 'POST', 'invoices/create_preview', { subscription: sub.id });
    if (told > 0 && Math.abs((next.amount_due || 0) - told) > 2) off.push('The first charge. They were told ' + money(told) + '. Stripe plans to charge ' + money(next.amount_due || 0) + '.');
  } catch (e) {
    await logError(env, 'server', '/api/checkout', 'A new plan could not be checked against Stripe (the sign up itself went through)', sub.id + ' ' + clean(e && e.message, 300));
    return;
  }
  if (!off.length) return;
  let c = null;
  try { c = (await db(env, 'GET', 'customers?id=eq.' + uuid(s.client_reference_id || md.user_id) + '&select=name,email,phone'))[0]; } catch (x) { c = null; }
  await logError(env, 'server', '/api/checkout', 'Stripe does not match what a new customer was told about their first bill', sub.id + ' ' + off.join(' '));
  await mail(env, owner(env), 'CHECK BILLING: Stripe does not match what ' + (c ? c.name : 'a new customer') + ' was told', [
    'A new sign up was held up against Stripe, and something does not match what the customer saw at the card step.',
    'Nothing has been charged. The first charge is not until the free month ends, so there is time to fix it.', '',
    'What does not match:'
  ].concat(off.map((x, i) => (i + 1) + '. ' + x), ['',
    c ? 'Name: ' + c.name + '\nMobile: ' + c.phone + '\nEmail: ' + c.email : 'Customer row: not found',
    'Stripe customer: ' + idOf(sub.customer),
    'Stripe plan: ' + sub.id, '',
    'Tell Joe today. Do not change the plan in Stripe by hand.',
    'If every new sign up gets this email, the check is what is off, not the plans. Tell Joe that too.'
  ]).join('\n'));
}

const HOME_WORDS = { street: 'st', avenue: 'ave', road: 'rd', drive: 'dr', lane: 'ln', court: 'ct', place: 'pl', boulevard: 'blvd', circle: 'cir', trail: 'trl', parkway: 'pkwy', north: 'n', south: 's', east: 'e', west: 'w' };
const homeKey = (a) => String(a || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean).map((w) => HOME_WORDS[w] || w).join('');
const sameHome = (a, b) => !!homeKey(a) && homeKey(a) === homeKey(b);

// 'ok' when Stripe signed this with our webhook secret. 'bad' for junk and for old events played back. 'mismatch' when
// it has the shape and the fresh time stamp of a real Stripe event but was signed with some other secret.
async function verifyStripe(payload, header, secret) {
  if (!header) return 'bad';
  let t = null;
  const v1 = [];
  for (const part of header.split(',')) {
    const i = part.indexOf('=');
    const k = part.slice(0, i).trim(), v = part.slice(i + 1).trim();
    if (k === 't') t = v;
    if (k === 'v1') v1.push(v);
  }
  if (!t || !v1.some((s) => /^[0-9a-f]{64}$/.test(s)) || Math.abs(Date.now() / 1000 - Number(t)) > 300) return 'bad';
  if (!secret) return 'mismatch';
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(t + '.' + payload)));
  const hex = Array.from(mac, (x) => x.toString(16).padStart(2, '0')).join('');
  return v1.some((s) => {
    if (s.length !== hex.length) return false;
    let diff = 0;
    for (let i = 0; i < s.length; i++) diff |= s.charCodeAt(i) ^ hex.charCodeAt(i);
    return diff === 0;
  }) ? 'ok' : 'mismatch';
}

async function webhook(request, env, ctx) {
  const payload = await readText(request);
  if (payload == null) return fail(413, 'That is too much to send at once.');
  const signed = await verifyStripe(payload, request.headers.get('stripe-signature'), env.STRIPE_WEBHOOK_SECRET);
  if (signed !== 'ok') {
    // A real looking event signed with another secret is what a wrong STRIPE_WEBHOOK_SECRET looks like. While that is
    // so, cancels, failed payments and paid bills never reach the office, so say it on the Health tab (once an hour).
    if (signed === 'mismatch' && !hitLimit('badsig', 1, 3600e3)) {
      ctx.waitUntil(logError(env, 'server', '/api/stripe-webhook', 'A Stripe event was refused: its signature does not match STRIPE_WEBHOOK_SECRET',
        'If this keeps coming back, the webhook secret in Cloudflare is not the one Stripe shows for this webhook (a test mode secret with live keys does this, and so does a test mode webhook still pointed at the site). Until it is fixed, cancels, failed payments and paid bills from Stripe do not reach the office.'));
    }
    return fail(400, 'Bad signature.');
  }
  const evt = JSON.parse(payload);
  // This site reads full ("snapshot") events. Stripe's newer "thin" events carry no object, so nothing below would act
  // on one, and cancels, failed payments and paid bills would be lost without a sound. Refuse them out loud: Stripe
  // then shows the webhook as failing, and the Health tab says why and what to do.
  if (evt.object === 'v2.core.event' || /^v\d+\./.test(String(evt.type || ''))) {
    if (!hitLimit('thinevent', 1, 3600e3)) {
      ctx.waitUntil(logError(env, 'server', '/api/stripe-webhook', 'Stripe is sending thin events. This webhook must send snapshot events',
        'In Stripe, add a new webhook for /api/stripe-webhook with the payload format set to Snapshot and the seven events listed in GO_LIVE.md. Put its signing secret in Cloudflare as STRIPE_WEBHOOK_SECRET, redeploy, then delete the thin one. Event type seen: ' + clean(evt.type, 80)));
    }
    return fail(400, 'This webhook needs snapshot events, not thin events. See GO_LIVE.md.');
  }
  const o = evt.data && evt.data.object || {};
  const was = (evt.data && evt.data.previous_attributes) || {};
  const now = new Date().toISOString();
  const cust = idOf(o.customer);
  if (evt.type === 'checkout.session.completed') {
    // Sign up: the card form is done. With a free month it saved a card (setup mode), so start the plan. With no
    // free month it charged the first month and Stripe made the plan (subscription mode), so book it. Other kinds of
    // checkout are not ours.
    if ((o.mode === 'setup' || o.mode === 'subscription') && o.status !== 'expired') {
      try { await (o.mode === 'setup' ? startPlan(env, ctx, o) : paidPlan(env, ctx, o)); } catch (e) {
        // Stripe sends this event again for up to three days, and each time the plan is tried again. Tell the office
        // on the first tries only.
        await planAlert(env, o, e, Date.now() / 1000 - (evt.created || 0) < 900);
        throw planError(o, e);
      }
    }
  } else if (evt.type === 'customer.subscription.updated' || evt.type === 'customer.subscription.deleted' || evt.type === 'customer.subscription.created') {
    // A plan whose first payment has not gone through is not a plan yet ("incomplete": the customer is still in the
    // card form, or their card was refused). One that never got paid ends as "incomplete_expired". Neither one may
    // touch the row: it waits at the card step, so the sign up can still be finished and booked.
    if (o.status === 'incomplete' || o.status === 'incomplete_expired') return ok({ received: true });
    const uid = uuid((o.metadata || {}).user_id);
    const gone = evt.type === 'customer.subscription.deleted';
    const status = gone ? 'canceled' : planStatus(o);
    const good = status === 'trialing' || status === 'active';
    const filter = uid ? 'id=eq.' + uid : 'stripe_customer_id=eq.' + encodeURIComponent(cust);
    // This event can land before startPlan or paidPlan has marked the sign up as booked. Book it here then, so the
    // welcome still goes out once (see booked). After that there is nothing left for this event to change.
    if (good && uid && await booked(env, ctx, uid, o, cust, null)) {
      // A plan paid for in Stripe's checkout still has its card on the plan. Move it onto the customer here too, in
      // case the checkout event that does it is late or lost.
      if ((o.metadata || {}).no_free && o.default_payment_method) await cardToCustomer(env, ctx, o, cust);
      return ok({ received: true });
    }
    // Stripe moved the plan to past due (a bill failed) or back from it (the bill got paid), or a pause began or ended.
    // Stripe does not promise the order of its events, and it sends one again for up to three days when we did not
    // answer. A late "past due" for a bill that has since been paid must not put a paid customer back on hold, a
    // late "paid" must not lift a hold that is real, and a late "paused" must not take a customer who is back off
    // the route. So before any of these is acted on, ask Stripe where the plan stands right now. If that is not what
    // this event says, the event is old news: a newer one carries the truth.
    let cur = o;
    const wasHeld = was.status === 'past_due' || was.status === 'unpaid';
    // A pause ended: Stripe took its hold off (pause_collection), or the plan left the "trial" that a pause past the
    // bill day is (see mePause). A free month that ends carries no pause_until, so it is not one of these.
    const wasPaused = !!was.pause_collection || (was.status === 'trialing' && !!(o.metadata || {}).pause_until);
    if (!gone && o.id && (status === 'past_due' || status === 'paused' || (good && (wasHeld || wasPaused)))) {
      cur = await stripe(env, 'GET', 'subscriptions/' + encodeURIComponent(o.id));
      if (planStatus(cur) !== status) return ok({ received: true });
    }
    // A failed bill. "unpaid" is Stripe saying the last try failed. A plan Stripe canceled over a failed card is the
    // same news with the plan gone. (Each failed try also comes as invoice.payment_failed. The bill keeps count, so
    // nobody is told twice.)
    if (cust && (status === 'past_due' || (gone && cardLost(o)))) await cardFailed(env, ctx, cust, idOf(cur.latest_invoice), { last: gone || lastTry(cur), gone });
    if (good && wasHeld) await backOn(env, ctx, filter, status);
    if (good && wasPaused) await pauseOver(env, ctx, filter, cur, !was.pause_collection);
    // The first bill after a pause is named plainly on the card statement (see pauseTidy). This also covers a
    // customer who came back early and kept their old bill day: that plan carries paid_until until the bill day.
    else if (good && !gone && was.status === 'trialing' && (o.metadata || {}).paid_until) ctx.waitUntil(pauseTidy(env, cur));
    const patch = { status, stripe_subscription_id: o.id, updated_at: now };
    if (gone) patch.gate_code = null;
    // A customer on hold for a failed bill only comes off hold through backOn. Other changes to the plan do not lift it.
    // And late news about a plan the row already shows as canceled must not bring that customer back. (A new plan
    // made for a canceled customer has a new id, so that one does bring them back.)
    // The other way round: a cancel is for one plan. If the row has moved on to a newer plan (the office started
    // them again), a late or resent cancel of the old plan must not cancel the new one.
    const old = !o.id ? '' : gone ? '&or=(stripe_subscription_id.is.null,stripe_subscription_id.eq.' + encodeURIComponent(o.id) + ')'
      : '&or=(status.neq.canceled,stripe_subscription_id.is.null,stripe_subscription_id.neq.' + encodeURIComponent(o.id) + ')';
    const rows = await db(env, 'PATCH', 'customers?' + filter + (good ? '&status=neq.past_due' : '') + old, patch, 'return=representation');
    // Canceled or paused: take them off any route that has not happened yet.
    if ((gone || patch.status === 'paused') && rows && rows[0]) {
      await db(env, 'DELETE', 'stops?customer_id=eq.' + rows[0].id + '&status=in.(scheduled,skipped)&day=gte.' + azToday(), null, 'return=minimal').catch((e) => console.error('route cleanup', e));
    }
    if (gone && rows && rows[0]) ctx.waitUntil(mail(env, owner(env), 'Canceled: ' + rows[0].name, (cardLost(o) ? 'Stripe canceled this plan because the card kept failing. See the PAUSE SERVICE email for what to do.' : 'A customer canceled.') + '\n\nName: ' + rows[0].name + '\nAddress: ' + rows[0].address + ', ' + rows[0].zip + '\nMobile: ' + rows[0].phone));
    if (gone) await freeMonthCharge(env, ctx, o, rows && rows[0]);
    // Back from a pause: nothing is charged by this server. When the pause ran past their bill day, Stripe itself
    // charges the full month on the day they come back, and that day is their new bill day (see mePause).
  } else if (evt.type === 'invoice.payment_failed') {
    // One failed try of one bill: the first charge or one of Stripe's retries. cardFailed asks Stripe how the bill
    // stands right now, so a late copy of this event for a bill that has since been paid changes nothing.
    if (cust && o.id) await cardFailed(env, ctx, cust, o.id);
  } else if (evt.type === 'invoice.paid') {
    if (cust) await billPaid(env, ctx, cust, o);
  } else if (evt.type === 'customer.updated') {
    await newCard(env, o, was);
  }
  return ok({ received: true });
}

/* ---------- a payment fails: a friendly email with a link to fix the card, an office alert on every try, PAUSE SERVICE after the last ---------- */
// Joe, Nov 16, 2026 (late). Stripe keeps trying a failed bill on its own (Smart Retries). Every failed try comes here.
//  - The row goes on hold once (`past_due`): off new routes until the bill is paid (planDay skips `past_due`). A visit
//    already on today's route still happens.
//  - The customer gets a clear email with one button that opens Stripe's own card page (cardLink): on the first
//    failed try, a reminder when a later try fails five or more days after their last email, and a last notice when
//    Stripe stops trying. One text waits in the office Texts tab on the first try (staff send texts by hand).
//  - The office gets an alert on EVERY failed try, with the name, address, amount and try number, and one that starts
//    with PAUSE SERVICE after the last try. This server never cancels a plan over a failed card: the office decides.
// Stripe sends events late, twice and out of order, and a failed try can reach us as two events at once (the bill
// and the plan). So the bill itself remembers what was told: its metadata carries the last try we alerted on
// (apw_try), when the customer was last emailed (apw_mail), and whether the last notice went out (apw_final). That
// note is written with a key Stripe keeps to one writer, so the same failed try never tells anybody twice.
const REMIND_DAYS = 5;
const TRY_WAIT = 2500;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const tryWait = (env) => (env.TRY_WAIT_MS != null && env.TRY_WAIT_MS !== '' ? Math.max(0, Number(env.TRY_WAIT_MS) || 0) : TRY_WAIT);
const pauseWhy = (sub) => (sub && sub.status_details && sub.status_details.paused && sub.status_details.paused.subscription && sub.status_details.paused.subscription.type) || '';
// Stripe has stopped trying the card: the plan went "unpaid", or Stripe paused the plan after the last failed try.
// Which one happens is a Stripe setting (Billing, Revenue recovery, Retries). GO_LIVE.md part 5 says which to pick.
const lastTry = (sub) => !!sub && (sub.status === 'unpaid' || (sub.status === 'paused' && pauseWhy(sub) === 'final_payment_failure'));
// Stripe canceled the plan itself because the card kept failing (that same setting, on "cancel the subscription").
const cardLost = (sub) => !!(sub && sub.cancellation_details && sub.cancellation_details.reason === 'payment_failed');
// What the customer row says for a plan in Stripe. It is Stripe's own word, but for three cases:
//  - A pause that runs past the bill day is a plan Stripe shows as "trialing" until the day they come back (mePause).
//    It carries pause_until. Here that is "paused".
//  - A paused customer who came back before their old bill day is "trialing" until that bill day, with paid_until and
//    no pause_until (meResume). Here that is "active": they are back, and they pay on their usual day.
//  - "unpaid" (the last retry failed), and a plan Stripe paused over a failed payment, stay "past_due" here. That is
//    the on hold state the office and My Yard know.
function planStatus(sub) {
  const md = sub.metadata || {};
  if (sub.pause_collection) return 'paused';
  if (sub.status === 'trialing' && md.pause_until) return 'paused';
  if (sub.status === 'trialing' && md.paid_until) return 'active';
  if (sub.status === 'unpaid') return 'past_due';
  if (sub.status === 'paused') return /^(first|final)_payment_failure$/.test(pauseWhy(sub)) ? 'past_due' : 'paused';
  return sub.status;
}
const longDay = (d) => d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Phoenix' });

// The email to the customer. `kind`: first (the first failed try), again (a reminder), last (Stripe stopped trying,
// the plan is still there) or ended (Stripe canceled the plan). Third grade words, one button.
function cardMail(env, kind, c, amount, tries, next, link) {
  const hi = 'Hi ' + (first(c.name) || 'there') + ',';
  const btn = { label: 'Update my card', url: link };
  const safe = 'The button opens our secure card page. Stripe runs it, and we never see your card number.';
  const help = 'Questions? Call or text 623.309.6104.';
  if (kind === 'ended') {
    return Object.assign({ subject: 'Your plan has ended' }, brandMail(env, 'Your plan has ended', [hi,
      'We tried your card ' + tries + (tries === 1 ? ' time' : ' times') + (amount ? ' for ' + amount : '') + '. It did not go through, so your plan has ended and your visits have stopped.',
      'Want to come back? Call or text 623.309.6104 and we will start you again.'], null, []));
  }
  if (kind === 'last') {
    return Object.assign({ subject: 'Last notice: your visits are on hold' }, brandMail(env, 'Your visits are on hold', [hi,
      'We tried your card ' + tries + (tries === 1 ? ' time' : ' times') + (amount ? ' for ' + amount : '') + '. It did not go through, so we have stopped trying.',
      'Your visits stay on hold until the bill is paid. To start again, tap the button and put in a new card. We try it right away.'], btn, [safe, help]));
  }
  if (kind === 'again') {
    return Object.assign({ subject: 'Reminder: your card still did not go through' }, brandMail(env, 'Your card still did not go through', [hi,
      'We tried your card again' + (amount ? ' for ' + amount : '') + '. It still did not go through.',
      'Tap the button to put in a new card. It takes about one minute, and we try it right away.'], btn,
    ['Your visits are still on hold. They start again as soon as the payment goes through.', safe, help]));
  }
  return Object.assign({ subject: 'Your card did not go through' }, brandMail(env, 'Your card did not go through', [hi,
    'We tried to charge your card' + (amount ? ' ' + amount : '') + ' for your dog poop pickup. It did not go through.',
    'This is easy to fix. Tap the button to put in a new card. It takes about one minute, and we try it right away.'], btn,
  ['Is your card fine? Then you do not need to do anything. We will try it again ' + (next ? 'on ' + longDay(next) + '.' : 'in a few days.'),
    'Your visits are on hold until the payment goes through. They start again as soon as it does.', safe, help]));
}

async function cardFailed(env, ctx, cust, invoiceId, opt) {
  opt = opt || {};
  const who = 'stripe_customer_id=eq.' + enc(cust);
  // Only a live plan. A sign up still at the card step is left alone (a card refused in the card form gets fixed in
  // the form), and so is a canceled customer (a failed early cancel charge leaves a canceled customer canceled).
  const before = (await db(env, 'GET', 'customers?' + who + '&status=in.(trialing,active,paused,past_due)&select=*'))[0];
  if (!before) return false;
  // Ask Stripe how the bill stands right now: a late copy of this event for a bill that has since been paid, or that
  // the office voided, must not put the customer on hold or tell anyone.
  let bill = invoiceId ? await stripe(env, 'GET', 'invoices/' + enc(invoiceId)) : null;
  if (bill && (bill.status !== 'open' || !(bill.amount_remaining > 0))) return false;
  let last = !!opt.last, gone = !!opt.gone;
  if (bill && !last && !bill.next_payment_attempt && bill.collection_method !== 'send_invoice') {
    // The bill shows no next try. With plain retry settings Stripe sets the next try before it sends the event. An
    // account that uses Stripe's automations gets it a moment later. So look twice more, a few seconds apart, before
    // calling this the last try: a wrong "last notice" on a first failed try would scare a customer for nothing.
    // Then see if Stripe canceled the plan over it.
    for (let i = 0; i < 2 && !bill.next_payment_attempt; i++) {
      await wait(tryWait(env));
      bill = await stripe(env, 'GET', 'invoices/' + enc(bill.id));
      if (bill.status !== 'open' || !(bill.amount_remaining > 0)) return false;
    }
    if (!bill.next_payment_attempt) {
      last = true;
      if (before.stripe_subscription_id) {
        try { const sub = await stripe(env, 'GET', 'subscriptions/' + enc(before.stripe_subscription_id)); gone = sub.status === 'canceled' && cardLost(sub); } catch (e) { gone = false; }
      }
    }
  }
  // The hold. The row moves once. A paused customer whose first charge back failed goes on hold too. A plan Stripe
  // has canceled is left to the cancel event.
  let c = before, moved = false;
  if (!gone) {
    const rows = await db(env, 'PATCH', 'customers?' + who + '&status=in.(trialing,active,paused)', { status: 'past_due', pause_from: null, pause_until: null, updated_at: new Date().toISOString() }, 'return=representation');
    if (rows && rows[0]) {
      c = rows[0]; moved = true;
      await db(env, 'DELETE', 'stops?customer_id=eq.' + c.id + '&status=in.(scheduled,skipped)&day=gt.' + azToday(), null, 'return=minimal').catch((e) => console.error('route cleanup', e));
    }
  }
  const nowS = Math.floor(Date.now() / 1000);
  const md = (bill && bill.metadata) || {};
  const tries = bill ? Math.max(1, Number(bill.attempt_count) || 1) : 1;
  const told = parseInt(md.apw_try || '0', 10) || 0;
  const mailed = parseInt(md.apw_mail || '0', 10) || 0;
  const newTry = bill ? tries > told : moved; // with no bill to keep the note on, the call that moved the row tells
  const stop = (last && !md.apw_final) || (gone && !md.apw_gone);
  if (!newTry && !stop) return false;
  const kind = stop ? (gone ? 'ended' : 'last') : !mailed ? 'first' : nowS - mailed >= REMIND_DAYS * 86400 ? 'again' : '';
  if (bill) {
    const note = { apw_try: String(Math.max(told, tries)) };
    if (kind) note.apw_mail = String(nowS);
    if (last) note.apw_final = '1';
    if (gone) note.apw_gone = '1';
    try {
      const kept = await stripe(env, 'POST', 'invoices/' + enc(bill.id), { metadata: note }, 'apw-try-' + bill.id + '-' + tries + (last ? '-last' : '') + (gone ? '-gone' : ''));
      // Stripe hands back the answer it gave the first writer: another copy of this event already told this try.
      if (kept && kept._replayed) return false;
    } catch (e) {
      // Another copy of this event is writing the same note right now. It does the telling.
      if (e.status === 409 || (e.stripe && e.stripe.type === 'idempotency_error')) return false;
      // The note could not be kept. Tell everyone anyway: an alert that comes twice is better than one that never comes.
      ctx.waitUntil(logError(env, 'server', '/api/stripe-webhook', 'A failed payment was told, but the note on the bill could not be saved, so this alert may come twice', bill.id + '. ' + clean(e && e.message, 300)));
    }
  }
  const amount = bill ? money(bill.amount_remaining || bill.amount_due || 0) : '';
  const next = bill && bill.next_payment_attempt && !last ? new Date(bill.next_payment_attempt * 1000) : null;
  let emailed = null;
  if (kind) {
    const m = cardMail(env, kind, c, amount, tries, next, kind === 'ended' ? '' : await cardLink(env, c.id));
    emailed = await mail(env, c.email, m.subject, m.text, m.html);
  }
  // The text waits in the office Texts tab like every other text, and staff send it by hand (Twilio is not approved).
  let texted = '';
  if (kind === 'first') {
    texted = 'no';
    if (c.texts_visit && c.phone) {
      try {
        const had = await db(env, 'GET', 'messages?customer_id=eq.' + c.id + '&kind=eq.card_failed&status=eq.queued&select=id');
        if (!(had && had.length)) await db(env, 'POST', 'messages', [{ customer_id: c.id, stop_id: null, kind: 'card_failed', channel: 'sms', to_addr: c.phone, body: CARD_TEXT(env) }], 'return=minimal');
        texted = 'yes';
      } catch (e) { texted = 'failed'; console.error('card text', e); }
    }
  }
  const whoIs = c.name + ', ' + c.address;
  const facts = ['Name: ' + c.name, 'Address: ' + c.address + ', ' + c.zip, 'Amount: ' + (amount || 'not known'), (stop ? 'Tries: ' : 'Try: ') + tries, 'Mobile: ' + c.phone, 'Email: ' + c.email, 'Stripe customer: ' + (c.stripe_customer_id || cust)];
  const toldThem = !kind ? 'No new email went to them today. Their last one went ' + Math.max(1, Math.round((nowS - mailed) / 86400)) + ' days ago, and the next reminder goes after ' + REMIND_DAYS + ' days.'
    : emailed ? (kind === 'first' ? 'We emailed them how to fix it, with a button that opens the card page.' : kind === 'again' ? 'We emailed them a reminder with the same button.' : kind === 'last' ? 'We emailed them a last notice with the button to change their card.' : 'We emailed them that their plan has ended.')
      : 'The email to them did not send. Reach out to them today.';
  if (stop) {
    ctx.waitUntil(mail(env, owner(env), 'PAUSE SERVICE: ' + whoIs + ' (' + (amount || 'bill') + ' unpaid after ' + tries + (tries === 1 ? ' try' : ' tries') + ')', [
      gone ? 'PAUSE SERVICE. Stripe tried their card ' + tries + (tries === 1 ? ' time' : ' times') + ', and then Stripe canceled their plan. ' + (amount || 'The bill') + ' is unpaid.'
        : 'PAUSE SERVICE. Stripe tried their card ' + tries + (tries === 1 ? ' time' : ' times') + ' and has stopped trying. ' + (amount || 'The bill') + ' is unpaid.', '',
      ...facts, '',
      'What to do:',
      '1. Keep them off the route. The site took them off new routes at the first failed try, so only check a route that is already built.',
      gone ? '2. Call them. To come back they sign up again, or you start them again in Stripe.'
        : '2. Call them. If they change their card, the site tries the open bill on it, puts them back on the schedule and emails you "Paid".',
      gone ? '3. Stripe canceled the plan because it is still set to cancel after the last try. To stop that: Stripe, Billing, Revenue recovery, Retries, "If all retries for a payment fail", pick "Mark the subscription as unpaid".'
        : '3. Their plan is not canceled. Canceling is your call. Do it in Stripe when you decide to.', '',
      toldThem
    ].join('\n')));
  } else {
    ctx.waitUntil(mail(env, owner(env), (tries > 1 ? 'Card failed again: ' : 'Card failed: ') + whoIs + ' (' + (amount || 'bill') + ', try ' + tries + ')', [
      'A payment' + (amount ? ' of ' + amount : '') + ' failed. This was try ' + tries + '.',
      next ? 'Stripe will try the card again on ' + longDay(next) + '.' : 'Stripe has not said when it will try again.', '',
      ...facts, '',
      'Their visits are on hold. They stay off new routes until the bill is paid. A visit already on today’s route still happens.',
      toldThem,
      texted === 'yes' ? 'A text to them is waiting in the Texts tab. Send it today.'
        : texted === 'failed' ? 'The text to them could not be saved to the Texts tab. Text or call them today.'
          : texted === 'no' ? 'They did not agree to texts, so no text is waiting. Call them today.' : null,
      'When Stripe stops trying, you get one more email that starts with PAUSE SERVICE.'
    ].filter((x) => x !== null).join('\n')));
  }
  return true;
}
const CARD_TEXT = (env) => 'Arizona Pet Waste: Your card did not work, so your visits are on hold. Fix it at ' + siteHost(env) + '/account or call 623.309.6104. Reply STOP to opt out.';

// "We come on your next Thursday." for an email.
const dayLine = (c) => (c.service_day != null ? 'We come on your next ' + DAYS[c.service_day] + (c.service_day2 != null ? ' or ' + DAYS[c.service_day2] : '') + '.' : 'We will reach out with your day.');
// The bill got paid. The row comes off hold once, and only the call that moves it sends the thank you.
async function backOn(env, ctx, filter, status) {
  const now = new Date().toISOString();
  const rows = await db(env, 'PATCH', 'customers?' + filter + '&status=eq.past_due', { status, updated_at: now }, 'return=representation');
  const c = rows && rows[0];
  if (!c) return false;
  // A "card did not work" text nobody sent yet is old news now, so it leaves the list. A sent one is left alone.
  await db(env, 'PATCH', 'messages?customer_id=eq.' + c.id + '&kind=eq.card_failed&status=eq.queued', { status: 'skipped', sent_at: now }, 'return=minimal').catch((e) => console.error('card text cleanup', e));
  const thanks = brandMail(env, 'Your payment went through', ['Hi ' + (first(c.name) || 'there') + ',',
    'Thank you. Your payment went through, and your visits are back on.', dayLine(c),
    'Questions? Call or text 623.309.6104.'], null, []);
  ctx.waitUntil(mail(env, c.email, 'Your payment went through', thanks.text, thanks.html));
  ctx.waitUntil(mail(env, owner(env), 'Paid: ' + c.name, [
    'Their bill is paid, so they are off hold and back on the schedule.',
    'They go on the next route built for their day. If their day is today or tomorrow and that route is already built, open the Schedule tab for that day and add them.', '',
    'Name: ' + c.name, 'Mobile: ' + c.phone, 'Address: ' + c.address + ', ' + c.zip
  ].join('\n')));
  return true;
}

// A bill was paid. If the customer is on hold, look at the plan in Stripe: when it is in good standing they come off
// hold. A plan that is still past due there has another bill open, so they stay on hold.
async function billPaid(env, ctx, cust, inv) {
  if (!(inv.amount_paid > 0)) return; // the $0 bill that starts a free month
  const rows = await db(env, 'GET', 'customers?stripe_customer_id=eq.' + encodeURIComponent(cust) + '&status=eq.past_due&select=id,stripe_subscription_id');
  const c = rows && rows[0];
  if (!c) return;
  let status = 'active';
  if (c.stripe_subscription_id) {
    const sub = await stripe(env, 'GET', 'subscriptions/' + c.stripe_subscription_id);
    status = planStatus(sub);
  }
  if (status === 'active' || status === 'trialing') await backOn(env, ctx, 'id=eq.' + c.id, status);
}

/* ---------- back from a pause ---------- */
// Joe, Nov 16, 2026 (late): when a paused customer comes back, the full month is charged on the day they come back,
// and that day is their new bill day. No part month. How that is done is in mePause: Stripe does the charging by
// itself on the day, so nothing here has to be awake for it. What is left for this server is to say so.
const nth = (n) => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');
// The emails for a customer who is back. `charged`: the pause ran past their bill day, so Stripe charges the full
// month today and today is the new bill day. If not, they came back inside a month they had paid for: nothing is
// charged and their bill day stays.
function backMails(env, ctx, c, charged) {
  const total = PLANS[c.plan] ? money(rowMonthly(c)) : '';
  const day = nth(Number(azToday().slice(8)));
  const m = brandMail(env, 'Welcome back', ['Hi ' + (first(c.name) || 'there') + ',',
    'Your pause is over, and your visits are back on.', dayLine(c),
    charged ? 'We charge your card ' + (total || 'your month price') + ' today for the month ahead. From now on, the ' + day + ' is your bill day.' : 'Nothing is charged today. Your bill day stays the same.',
    'Questions? Call or text 623.309.6104.'], null, []);
  ctx.waitUntil(mail(env, c.email, 'Welcome back. Your visits are back on', m.text, m.html));
  ctx.waitUntil(mail(env, owner(env), 'Back from pause: ' + c.name, [
    c.name + ' is back from a pause.',
    charged ? 'Stripe charges ' + (total || 'the full month') + ' today. The ' + day + ' is their new bill day.' : 'Nothing is charged today. Their bill day did not change.',
    'They go on the next route built for their day. If their day is today or tomorrow and that route is already built, open the Schedule tab for that day and add them.', '',
    'Name: ' + c.name, 'Mobile: ' + c.phone, 'Address: ' + c.address + ', ' + c.zip
  ].join('\n')));
}
// A pause ended by itself, on the day the customer picked. The row comes off pause once, and only the call that moves
// it tells the customer and the office. (A customer who taps "Start again now" is handled in meResume.)
async function pauseOver(env, ctx, filter, sub, charged) {
  const rows = await db(env, 'PATCH', 'customers?' + filter + '&status=eq.paused', { status: 'active', pause_from: null, pause_until: null, updated_at: new Date().toISOString() }, 'return=representation');
  const c = rows && rows[0];
  if (charged) ctx.waitUntil(pauseTidy(env, sub));
  if (!c) return false;
  backMails(env, ctx, c, charged);
  return true;
}
// After a pause that ran past the bill day: take the pause notes off the plan, and name the first bill back plainly on
// the card statement. Stripe adds "TRIAL OVER" to a statement when a free trial ends, and it runs this kind of pause
// as a trial. A bill that has its own statement words does not get that added (Stripe: "Manage trial text in
// statement descriptors"). It has to be set while the new bill is still a draft, about one hour. If that is missed,
// nothing breaks: the statement reads TRIAL OVER that one time.
const STATEMENT = 'ARIZONA PET WASTE';
async function pauseTidy(env, sub) {
  if (!sub || !sub.id) return;
  const inv = idOf(sub.latest_invoice);
  try { if (inv) await stripe(env, 'POST', 'invoices/' + enc(inv), { statement_descriptor: STATEMENT }); } catch (e) { console.error('statement words', e && e.message); }
  try { await stripe(env, 'POST', 'subscriptions/' + enc(sub.id), { metadata: { pause_until: '', paid_until: '' } }); } catch (e) { console.error('pause notes', e && e.message); }
}

// The customer put a new card on file (My Yard opens Stripe's billing page for that). If they are on hold, try the
// open bills on the new card right now, so they do not wait days for Stripe's next retry.
const NEW_CARD_DAYS = 45;
async function newCard(env, cu, was) {
  const card = idOf(cu.invoice_settings && cu.invoice_settings.default_payment_method);
  if (!card || !cu.id || !was || !was.invoice_settings) return;
  const rows = await db(env, 'GET', 'customers?stripe_customer_id=eq.' + encodeURIComponent(cu.id) + '&status=eq.past_due&select=id');
  if (!(rows && rows[0])) return;
  const open = await stripe(env, 'GET', 'invoices', { customer: cu.id, status: 'open', limit: 10 });
  for (const i of open.data || []) {
    if (!(i.amount_remaining > 0) || i.collection_method !== 'charge_automatically') continue;
    // Only fresh bills. An old open bill is for a time with no visits, so the office decides what to do with it.
    if (i.created && Date.now() / 1000 - i.created > NEW_CARD_DAYS * 86400) continue;
    // A decline here is fine: Stripe reports it as one more failed try and keeps its own retries going.
    try { await stripe(env, 'POST', 'invoices/' + i.id + '/pay', {}, 'apw-newcard-' + i.id + '-' + card); } catch (e) { console.error('pay with new card', e && e.message); }
  }
}

// Has this one time charge been billed before? The bill carries a tag, and the customer's bills are looked through for it.
async function billedBefore(env, customer, tag, value) {
  const list = await stripe(env, 'GET', 'invoices', { customer: idOf(customer), limit: 100 });
  return (list.data || []).some((i) => i.status !== 'void' && i.metadata && i.metadata[tag] === value);
}
// The line for a one time charge, made once. It carries the same tag as its bill. If an earlier try made the line
// and then failed before the bill, the line is still waiting on the customer: use it, do not add a second one.
async function chargeLine(env, customer, tag, value, amount, description, key) {
  const waiting = await stripe(env, 'GET', 'invoiceitems', { customer: idOf(customer), pending: 'true', limit: 100 });
  if ((waiting.data || []).some((i) => i.metadata && i.metadata[tag] === value)) return;
  await stripe(env, 'POST', 'invoiceitems', { customer: idOf(customer), amount, currency: 'usd', description, metadata: { [tag]: value } }, key);
}

// The free month stays free when the customer keeps the plan for 60 days. A cancel requested before that
// (canceled_at is when they asked, even for cancel at period end) brings what they have paid up to one month
// at plan price. Off unless EARLY_CANCEL is "on" (see earlyOn), and then only for a plan that carries min_end.
async function freeMonthCharge(env, ctx, sub, row) {
  if (!earlyOn(env)) return;
  const md = sub.metadata || {};
  // No free month, no early cancel charge, whatever else the plan carries: they paid for their first month at sign up.
  if (md.no_free) return;
  const cutoff = parseInt(md.min_end || '0', 10);
  const askedAt = sub.canceled_at || sub.ended_at || Math.floor(Date.now() / 1000);
  if (!cutoff || askedAt >= cutoff) return;
  // every line on the plan (an older plan has a base price plus any extra dogs)
  const month = planCents(sub) || (row && PLANS[row.plan] ? rowMonthly(Object.assign({ stripe_subscription_id: sub.id }, row)) : 0);
  if (!month) return;
  const who = row ? row.name + ', ' + row.address + ', ' + row.zip : sub.customer;
  let amount = month;
  try {
    // One early cancel charge for one plan, ever. Stripe only remembers the keys below for a day, and it can send
    // the cancel event again after that (it retries for three days, and anyone can resend one from the Dashboard),
    // so the bill itself carries a tag and a plan that already has that bill is not charged again.
    if (await billedBefore(env, sub.customer, 'early_cancel', sub.id)) return;
    if (md.min_end) {
      const paid = await stripe(env, 'GET', 'invoices', { subscription: sub.id, status: 'paid', limit: 24 });
      amount = month - (paid.data || []).reduce((n, i) => n + (i.amount_paid || 0), 0);
      if (amount < 50) return; // already paid a month (Stripe will not charge under 50 cents)
    }
    await chargeLine(env, sub.customer, 'early_cancel', sub.id, amount, 'Early cancel charge: one month at plan price, minus what was paid', 'apw-early-item-' + sub.id);
    const inv = await stripe(env, 'POST', 'invoices', Object.assign({ customer: sub.customer, collection_method: 'charge_automatically',
      auto_advance: 'true', pending_invoice_items_behavior: 'include', description: 'You canceled in your first 60 days, so we charge one month at your plan price, minus anything you paid.',
      metadata: { early_cancel: sub.id } },
      sub.default_payment_method ? { default_payment_method: sub.default_payment_method } : {}), 'apw-early-inv-' + sub.id);
    await stripe(env, 'POST', 'invoices/' + inv.id + '/finalize', {}, 'apw-early-fin-' + sub.id);
    await stripe(env, 'POST', 'invoices/' + inv.id + '/pay', {}, 'apw-early-pay-' + sub.id);
    ctx.waitUntil(mail(env, owner(env), 'Free month charged: ' + who, 'This customer canceled in the first 60 days, so we charged ' + money(amount) + '.\n\nCustomer: ' + who + '\nStripe customer: ' + sub.customer));
  } catch (e) {
    console.error('free month charge failed', e);
    ctx.waitUntil(mail(env, owner(env), 'Check billing: free month charge failed', 'A customer canceled in the first 60 days but the ' + money(amount) + ' charge failed. Check it in Stripe.\n\nCustomer: ' + who + '\nStripe customer: ' + sub.customer));
  }
}

// The 60 day cancel rule in one line, for the day it is ever turned back on (see earlyOn). It is off: nobody is told
// this and nobody is charged it.
const FREE_RULE = 'Cancel in your first 60 days and you pay for one month.';
function freeRule(label) {
  return label ? 'Cancel before ' + label + ' and you pay for one month.' : FREE_RULE;
}
// The cancel line by Stripe's button: one line.
function cancelText(b, env) {
  return (selfOn(env) ? 'Cancel anytime in My Yard.' : 'Cancel anytime. Call or text 623.309.6104.') + (b.free && earlyOn(env) ? ' ' + freeRule(b.minShort) : '');
}
const WAIT_OFFER = 'None. The site only says we will tell them when we start in their area. The free month offer came off the waitlist on November 12, 2026.';
async function waitlist(request, env, ctx) {
  const b = await body(request);
  if (!b) return fail(400, 'Something was missing. Please try again.');
  if (b.website) return ok({ ok: true }); // bots fill the hidden field
  const zip = String(b.zip || '').replace(/\D/g, '').slice(0, 5);
  const name = clean(b.name, 120), phone = digits(b.phone), address = clean(b.address, 200);
  const email = clean(b.email, 200).toLowerCase();
  if (name.length < 2) return fail(400, 'Type your full name.');
  if (phone.length !== 10) return fail(400, 'Type your 10 digit mobile number.');
  if (address.length < 5) return fail(400, 'Type your street address.');
  if (email && !emailOk(email)) return fail(400, 'Type your email, like you@email.com.');
  const texts = !!b.texts;
  if (await tooMany(env, 'waitlist')) return fail(429, 'We are getting a lot of sign ups right now. Text 623.309.6104 with your name, address and ZIP, and we will add you.');
  const stored = live(env) ? await db(env, 'POST', 'waitlist', [{ email: email || null, zip, name, phone, address, texts_ok: texts, ip: request.headers.get('cf-connecting-ip') || '' }], 'return=minimal').then(() => true, () => false) : false;
  if (sbLive(env)) await addLead(env, { kind: 'waitlist', name, email: email || null, phone, address, zip, details: texts ? 'Text when we start there' : null });
  // The waitlist form on the sign up page asks for a city, not a ZIP: the city is the last part of the address.
  const town = zip ? 'ZIP ' + zip : clean(address.includes(',') ? address.split(',').pop() : '', 40);
  const sent = await mail(env, owner(env), 'Waitlist: ' + name + (town ? ', ' + town : ''), [
    'Someone joined the waitlist.', '',
    'Name: ' + name, 'Mobile: ' + phone, 'Address: ' + address + (zip ? ', ' + zip : ''), 'Email: ' + (email || 'none'),
    'Text them when we start there: ' + (texts ? 'yes' : 'no'), '',
    'Offer shown: ' + WAIT_OFFER
  ].join('\n'));
  if (!stored && !sent) return fail(503, 'Our waitlist is not taking sign ups online yet. Text 623.309.6104 with your name, address and ZIP, and we will add you.');
  if (metaOn(env) && ctx && ctx.waitUntil) ctx.waitUntil(metaEvent(env, 'Lead', eventIdOk(b.eid), Object.assign({ email, ip: request.headers.get('cf-connecting-ip') || '', ua: clean(request.headers.get('user-agent'), 300) }, adIds(b.ad)), { lead_type: 'waitlist' }));
  return ok({ ok: true });
}

// Before online checkout is live, the sign up form still works: it emails the details to us and we call to finish.
async function signupRequest(request, env, ctx) {
  const b = await body(request);
  if (!b) return fail(400, 'Something was missing. Please try again.');
  if (b.website) return ok({ ok: true });
  const zip = String(b.zip || '');
  const z = ZIPS[zip];
  if (!z) return fail(400, 'We do not scoop in that ZIP code yet.');
  if (own(QUOTE_PLANS, b.plan)) return quoteRequest(request, env, ctx, b, zip, z);
  if (!own(PLANS, b.plan)) return fail(400, 'Please pick how often we come.');
  const dogs = Math.round(Number(b.dogs));
  if (!(dogs >= 1 && dogs <= 6)) return fail(400, 'Please pick 1 to 6 dogs.');
  const name = clean(b.name, 120), phone = digits(b.phone), address = clean(b.address, 200), email = clean(b.email, 200).toLowerCase();
  if (name.length < 2 || phone.length !== 10 || address.length < 5 || !emailOk(email)) return fail(400, 'Please fill in your name, mobile number, email and street address.');
  if (await tooMany(env, 'signup_request')) return fail(429, 'We are getting a lot of sign ups right now. Call or text 623.309.6104 and we will book you today.');
  const total = monthly(b.plan, dogs);
  const bill = firstCharge(env, b.plan, dogs, freeMonth(env));
  const sent = await mail(env, owner(env), 'New sign up request: ' + name + ', ' + z.name, [
    'Someone signed up on the website. Online checkout is not on yet, so call them to finish and take their card.', '',
    'Name: ' + name, 'Mobile: ' + phone, 'Email: ' + email, 'Address: ' + address + ', ' + z.city + ' ' + zip,
    'Plan: ' + PLANS[b.plan].name + ', ' + dogs + (dogs === 1 ? ' dog, ' : ' dogs, ') + money(total) + ' a month',
    'Billing they saw: ' + billText(bill),
    'Visit texts: ' + (b.textsVisit ? 'yes' : 'no') + '. Deals texts: ' + (b.textsDeals ? 'yes' : 'no'),
    'Text consent shown: ' + CONSENT.visit + ' ' + CONSENT.fine,
    'Page: ' + clean(b.page, 120)
  ].join('\n'));
  const kept = sbLive(env) ? await addLead(env, { kind: 'signup_request', name, email, phone, address, zip,
    details: PLANS[b.plan].name + ', ' + dogs + (dogs === 1 ? ' dog, ' : ' dogs, ') + money(total) + ' a month. Visit texts: ' + (b.textsVisit ? 'yes' : 'no') }) : false;
  if (!sent && !kept) return fail(503, 'Online sign up opens soon. Call or text 623.309.6104 and we will book you today.');
  if (metaOn(env) && ctx && ctx.waitUntil) ctx.waitUntil(metaEvent(env, 'Lead', eventIdOk(b.eid), Object.assign({ email, city: z.city, zip, ip: request.headers.get('cf-connecting-ip') || '', ua: clean(request.headers.get('user-agent'), 300) }, adIds(b.ad)),
    { lead_type: 'request', value: total / 100, currency: 'USD', content_name: b.plan, num_items: dogs }));
  return ok({ ok: true });
}

// Just once and Monthly, asked for on the website. No card is taken for either: the office gets the request, gives the
// price and sets the time. Each is saved as a sign up request (the leads table allows four kinds), and the details start
// with which one it is.
// Just once (Joe, Nov 18, 2026, evening): "a 1 time clean up which starts at $99 and depending on job it'll be a custom quote".
// Monthly (Joe, Nov 19, 2026: "Twice weekly, Weekly, Every other week, Monthly, Just once. I like those options, and we can
// have those"): one visit a month. It has no set price in src/prices.json yet, so the form says we send one. When Joe sets
// it, a card step needs a Stripe price here and a once a month route in the field desk.
// The form also asks both when the yard was last cleaned, since the price depends on the size of the job.
const QUOTE_PLANS = { once: 'One time cleanup', month: 'Monthly cleanup' };
const LAST_CLEANED = { lt2: 'less than 2 weeks ago', '2to6': '2 to 6 weeks ago', gt6: 'more than 6 weeks ago' };
async function quoteRequest(request, env, ctx, b, zip, z) {
  const once = b.plan === 'once';
  const dogs = Math.round(Number(b.dogs));
  if (!(dogs >= 1 && dogs <= 6)) return fail(400, 'Please pick 1 to 6 dogs.');
  const name = clean(b.name, 120), phone = digits(b.phone), address = clean(b.address, 200), email = clean(b.email, 200).toLowerCase();
  if (name.length < 2 || phone.length !== 10 || address.length < 5 || !emailOk(email)) return fail(400, 'Please fill in your name, mobile number, email and street address.');
  if (await tooMany(env, 'signup_request')) return fail(429, 'We are getting a lot of requests right now. Call or text 623.309.6104 and we will set it up today.');
  const count = dogs + (dogs === 1 ? ' dog' : ' dogs');
  const what = once
    ? 'One time cleanup, ' + count + '. Starts at ' + money(PRICES.once * 100) + ', depending on job size. Give them the price before the visit.'
    : 'Monthly cleanup, ' + count + '. One visit a month. Monthly has no set price yet. Give them the price before the first visit.';
  const last = own(LAST_CLEANED, b.last) ? 'Yard last cleaned: ' + own(LAST_CLEANED, b.last) + '.' : '';
  const sent = await mail(env, owner(env), own(QUOTE_PLANS, b.plan) + ' request: ' + name + ', ' + z.name, [
    once ? 'Someone booked a one time cleanup on the website. No card was taken. Text or call them with the price and a time.'
      : 'Someone asked for a monthly cleanup on the website. No card was taken. Text or call them with the price and a day.', '',
    'Name: ' + name, 'Mobile: ' + phone, 'Email: ' + email, 'Address: ' + address + ', ' + z.city + ' ' + zip,
    what
  ].concat(last ? [last] : [], [
    'Visit texts: ' + (b.textsVisit ? 'yes' : 'no'),
    'Text consent shown: ' + CONSENT.visit + ' ' + CONSENT.fine,
    'Page: ' + clean(b.page, 120)
  ]).join('\n'));
  const kept = sbLive(env) ? await addLead(env, { kind: 'signup_request', name, email, phone, address, zip,
    details: what + (last ? ' ' + last : '') + ' Visit texts: ' + (b.textsVisit ? 'yes' : 'no') }) : false;
  if (!sent && !kept) return fail(503, 'Call or text 623.309.6104 and we will set up your cleanup today.');
  if (metaOn(env) && ctx && ctx.waitUntil) ctx.waitUntil(metaEvent(env, 'Lead', eventIdOk(b.eid), Object.assign({ email, city: z.city, zip, ip: request.headers.get('cf-connecting-ip') || '', ua: clean(request.headers.get('user-agent'), 300) }, adIds(b.ad)),
    once ? { lead_type: 'one_time', value: PRICES.once, currency: 'USD', content_name: 'once', num_items: dogs } : { lead_type: 'monthly', content_name: 'month', num_items: dogs }));
  return ok({ ok: true });
}

// A community quote asked for on the website (Joe, Nov 19, 2026, after going through the DoodyCalls sign up: "I like
// residential community. I actually like that option"). Book now asks "Who is this for?" first. My community opens one
// short form and it lands here. No card, and no text box: the form says we call or email, so nobody here agreed to texts.
// It is saved as a commercial lead (the leads table and the office app already have that kind).
const COMMUNITY_KINDS = { hoa: 'HOA', apartments: 'Apartments', park: 'Dog park', business: 'Business', event: 'Event', other: 'Other' };
async function communityRequest(request, env, ctx) {
  const b = await body(request);
  if (!b) return fail(400, 'Something was missing. Please try again.');
  if (b.website) return ok({ ok: true }); // bots fill the hidden field
  const kind = own(COMMUNITY_KINDS, b.kind);
  if (!kind) return fail(400, 'Tap what kind of place it is.');
  const org = clean(b.org, 120), city = clean(b.city, 60), name = clean(b.name, 120), phone = digits(b.phone), email = clean(b.email, 200).toLowerCase(), note = clean(b.note, 500);
  if (org.length < 2) return fail(400, 'Type the name of your community or business.');
  if (city.length < 2) return fail(400, 'Type your city.');
  if (name.length < 2) return fail(400, 'Type your name.');
  if (phone.length !== 10) return fail(400, 'Type your 10 digit phone number.');
  if (!emailOk(email)) return fail(400, 'Type your email, like you@email.com.');
  if (await tooMany(env, 'commercial')) return fail(429, 'We are getting a lot of requests right now. Call or text 623.309.6104 and we will set up your site walk.');
  const what = 'Community quote request. ' + kind + ': ' + org + ', ' + city + '.' + (note ? ' They wrote: ' + note : '');
  // To info@arizonapetwaste.com, always (quoteInbox). A Reply to this email goes to the person who asked.
  const sent = await mail(env, quoteInbox(env), 'Community quote request: ' + org + ', ' + city, [
    'Someone asked for a free community quote on the website. Call or email them to set up the free site walk.',
    'Hit Reply to write to them.', '',
    'Kind of place: ' + kind, 'Community or business: ' + org, 'City: ' + city,
    'Name: ' + name, 'Phone: ' + phone, 'Email: ' + email,
    'What they need: ' + (note || 'not said'),
    'Texts: not asked. The form has no text box, so call or email them.',
    'Page: ' + clean(b.page, 120)
  ].join('\n'), null, email);
  const kept = sbLive(env) ? await addLead(env, { kind: 'commercial', name, email, phone, address: org + ', ' + city, zip: null, details: what }) : false;
  if (!sent && !kept) return fail(503, 'Call or text 623.309.6104 and we will set up your site walk.');
  if (metaOn(env) && ctx && ctx.waitUntil) ctx.waitUntil(metaEvent(env, 'Lead', eventIdOk(b.eid), Object.assign({ email, ip: request.headers.get('cf-connecting-ip') || '', ua: clean(request.headers.get('user-agent'), 300) }, adIds(b.ad)), { lead_type: 'community' }));
  return ok({ ok: true });
}

// A cap on the open forms, so a script cannot flood the office: 40 leads of one kind an hour.
async function tooMany(env, kind) {
  if (!sbLive(env)) return false;
  try { return (await db(env, 'GET', 'leads?kind=eq.' + kind + '&created_at=gte.' + encodeURIComponent(new Date(Date.now() - 3600e3).toISOString()) + '&select=id&limit=40')).length >= 40; } catch (e) { return false; }
}

const ME_FIELDS = 'name,email,phone,address,zip,area,plan,dogs,first_visit,status,gate_code,gate_notes,dog_names,problem_spots,skip_spray,texts_visit,texts_deals';
async function meGet(request, env) {
  if (!live(env)) return fail(503, 'My Yard is not turned on yet. ' + CALL_US);
  const u = await signedIn(request, env);
  if (!u) return fail(401, 'Please sign in again.');
  const rows = await db(env, 'GET', 'customers?id=eq.' + u.id + '&select=' + ME_FIELDS);
  return ok({ customer: (rows && rows[0]) || { email: u.email, status: 'new' } });
}

async function meSave(request, env) {
  if (!live(env)) return fail(503, 'My Yard is not turned on yet. ' + CALL_US);
  const u = await signedIn(request, env);
  if (!u) return fail(401, 'Please sign in again.');
  const b = await body(request);
  if (!b) return fail(400, 'Something was missing. Please try again.');
  const rows = await db(env, 'GET', 'customers?id=eq.' + u.id + '&select=' + ME_FIELDS);
  const before = rows && rows[0];
  if (!before) return fail(404, 'Finish signing up first, then set up your yard.');
  const patch = {
    gate_code: clean(b.gate_code, 60) || null, gate_notes: clean(b.gate_notes, 600), dog_names: clean(b.dog_names, 200),
    problem_spots: clean(b.problem_spots, 600), skip_spray: !!b.skip_spray, texts_visit: !!b.texts_visit,
    updated_at: new Date().toISOString()
  };
  const saved = await db(env, 'PATCH', 'customers?id=eq.' + u.id + '&select=' + ME_FIELDS, patch, 'return=representation');
  const logs = [];
  const ip = request.headers.get('cf-connecting-ip') || '', ua = clean(request.headers.get('user-agent'), 300);
  if (before.texts_visit !== patch.texts_visit) logs.push({ user_id: u.id, email: u.email, phone: before.phone, kind: 'texts_visit', granted: patch.texts_visit, text_shown: CONSENT.visit + ' ' + CONSENT.fine, page: '/account/', ip, user_agent: ua });
  // No deals box in My Yard (Joe, Nov 17, 2026): a save never touches texts_deals, so nobody is opted in or out by it.
  if (logs.length) await db(env, 'POST', 'consent_log', logs, 'return=minimal');
  return ok({ customer: saved && saved[0] });
}

async function portal(request, env) {
  if (!live(env)) return fail(503, 'Billing is not turned on yet. ' + CALL_US);
  const u = await signedIn(request, env);
  if (!u) return fail(401, 'Please sign in again.');
  if (!selfOn(env)) return fail(403, CALL_BILLING, 'call_office');
  const rows = await db(env, 'GET', 'customers?id=eq.' + u.id + '&select=stripe_customer_id');
  const cus = rows && rows[0] && rows[0].stripe_customer_id;
  if (!cus) return fail(404, 'We could not find a card on file. ' + CALL_US);
  const site = env.SITE_URL || new URL(request.url).origin;
  let s;
  try { s = await stripe(env, 'POST', 'billing_portal/sessions', { customer: cus, return_url: site + '/account/' }); }
  catch (e) {
    // Stripe no longer has this customer (deleted in the Stripe dashboard, or made with other keys). There is no card
    // page to open, and a plan cannot be running on a customer that is gone.
    if (!stripeGone(e, 'customer')) throw e;
    if (!hitLimit('portal-gone', 3, 3600e3)) await logError(env, 'server', '/api/portal', 'A customer tapped Change card, and Stripe no longer has their customer',
      'Stripe no longer has ' + clean(cus, 60) + '. They were told to call or text. To start service again they sign up on the site again, which makes a new Stripe customer. Do not make a plan by hand in Stripe.');
    return fail(404, 'We could not find a card on file. ' + CALL_US);
  }
  return ok({ url: s.url });
}

/* =====================================================================================================
   Field desk: staff sign in, crew route, office, and the customer truck link.
   Texts are never sent from here. Until Twilio is approved, each text waits in `messages` as "queued"
   and staff send it from the business phone with one tap, then it is marked sent.
   ===================================================================================================== */
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const PAYING = ['trialing', 'active', 'past_due'];
const LINK_HOURS = 2;
const CODE_ABC = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
const REASONS = { gate_locked: 'the gate was locked', dog_out: 'a dog was in the yard', weather: 'the weather', other: 'something came up' };
const STAFF_FIELDS = 'id,email,name,phone,role,active,scoops,user_id';
// Who runs a route (Joe, Nov 18, 2026: Juan owns the company and scoops). A scooper always does. An owner or an office
// person does when "Runs a route" is on for them (staff.scoops). The week plan and new sign ups only give yards to these people.
const runsRoute = (t) => !!t && (t.role === 'scooper' || t.scoops === true);
// The Team list for the office. It says who has signed in, and never hands out the sign in id itself.
async function teamList(env) {
  const rows = await db(env, 'GET', 'staff?select=' + STAFF_FIELDS + '&order=active.desc,created_at');
  return rows.map((t) => ({ id: t.id, email: t.email, name: t.name, phone: t.phone, role: t.role, active: t.active, scoops: runsRoute(t), signedIn: !!t.user_id }));
}
const enc = encodeURIComponent;
const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));
const weekday = (d) => noonAZ(d).getUTCDay();
const addDays = (d, n) => new Date(noonAZ(d).getTime() + n * 86400e3).toISOString().slice(0, 10);
// Every other week customers go on even or odd weeks, counted from Monday January 5, 2026.
const weekParity = (d) => ((Math.floor((noonAZ(d) - noonAZ('2026-01-05')) / (7 * 86400e3)) % 2) + 2) % 2;
const siteHost = (env) => String(env.SITE_URL || 'https://arizonapetwaste.com').replace(/^https?:\/\//, '').replace(/\/$/, '');
// The first name to greet someone by. "Lopez, Joseph" is Joseph. A title is left out. ALL CAPS and all small letters
// are tidied ("DAN" is Dan). A name typed last name first with no comma ("Besserer Dan") cannot be told apart from a
// real first name, so the office fixes that one on the customer card (Customer name) and sends the welcome email again.
const first = (name) => {
  let n = String(name || '').trim().replace(/\s+/g, ' ');
  if (n.includes(',')) { const after = n.split(',')[1].trim(); if (after) n = after; }
  let w = n.split(' ').filter((x) => !/^(mr|mrs|ms|miss|dr|mx)\.?$/i.test(x))[0] || '';
  if (w.length > 1 && /[a-z]/i.test(w) && (w === w.toUpperCase() || w === w.toLowerCase())) w = w[0].toUpperCase() + w.slice(1).toLowerCase();
  return w;
};
const hi = (name) => (first(name) ? 'Hi ' + first(name) + ',' : 'Hi,');
function newCode() { return Array.from(crypto.getRandomValues(new Uint8Array(6)), (x) => CODE_ABC[x % CODE_ABC.length]).join(''); }
function miles(a, b) {
  const r = (x) => x * Math.PI / 180, R = 3958.8;
  const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
// Joe's numbers (Nov 2026): 30 mph on neighborhood roads, 10 minutes in a yard, 20 minutes the first time we service a yard.
const MPH = 30, YARD_MIN = 10, FIRST_MIN = 20;
const driveMin = (mi) => Math.max(1, Math.round(mi * 1.35 / MPH * 60)); // straight line miles to road minutes
const roadMin = (roadMiles) => roadMiles / MPH * 60; // miles that are already road miles

async function addLead(env, lead) {
  try { await db(env, 'POST', 'leads', [lead], 'return=minimal'); return true; } catch (e) { console.error('lead not saved', e); return false; }
}

// A new booking gets a map pin (free US Census lookup, no key) and its area's service day, so it shows up on routes.
async function geocode(address, zip) {
  if (!address) return null;
  return geocodeLine(address + ', ' + ((ZIPS[zip] || {}).city || '') + ', AZ ' + (zip || ''));
}
// Any full address on one line, such as where the truck starts.
async function geocodeLine(q) {
  try {
    const r = await fetch('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?benchmark=Public_AR_Current&format=json&address=' + enc(q));
    if (!r.ok) return null;
    const m = ((await r.json()).result || {}).addressMatches || [];
    return m[0] ? { lat: m[0].coordinates.y, lng: m[0].coordinates.x } : null;
  } catch (e) { return null; }
}
async function placeCustomer(env, c) {
  env = await withSettings(env);
  try {
    const patch = {};
    if (c.lat == null) { const g = await geocode(c.address, c.zip); if (g) Object.assign(patch, g); }
    if (c.service_day == null) {
      // First choice: the day and scooper of the closest yards that still have room. Then the area's day.
      const pin = patch.lat != null ? patch : (c.lat != null ? c : null);
      const near = pin ? nearSlot(await weekRows(env, '&service_day=not.is.null&lat=not.is.null&id=neq.' + c.id), pin, c.plan, dayCap(env), workDays(env)) : null;
      if (near) Object.assign(patch, near);
      else if (c.area) {
        const a = (await db(env, 'GET', 'area_days?area=eq.' + enc(c.area) + '&select=day'))[0];
        if (a) {
          // The area's day is only used while it has room. A full day stays full: the yard waits in
          // "New sign ups with no day yet" on the Schedule tab and the office picks the day.
          const sid = await defaultScooper(env);
          const there = (await weekRows(env, '&or=(service_day.eq.' + a.day + ',service_day2.eq.' + a.day + ')&id=neq.' + c.id)).filter((x) => !x.scooper_id || x.scooper_id === sid);
          if (weekYards(there.concat([{ plan: c.plan, eow_week: 0 }])) <= dayCap(env)) { patch.service_day = a.day; if (c.plan === 'eow') patch.eow_week = 0; }
        }
      }
    }
    if (Object.keys(patch).length) await db(env, 'PATCH', 'customers?id=eq.' + c.id, patch, 'return=minimal');
    // Look again after saving. Two sign ups in the same instant can both see the last open spot. The one that finds the
    // day over the limit steps back off it and waits for the office, so a day never ends up overloaded.
    if (patch.service_day != null) {
      const sid = patch.scooper_id || null, fallback = sid ? null : await defaultScooper(env);
      for (const d of [patch.service_day, patch.service_day2]) {
        if (d == null) continue;
        const there = (await weekRows(env, '&or=(service_day.eq.' + d + ',service_day2.eq.' + d + ')')).filter((x) => (sid ? x.scooper_id === sid : !x.scooper_id || x.scooper_id === fallback));
        if (weekYards(there) > dayCap(env)) {
          await db(env, 'PATCH', 'customers?id=eq.' + c.id, { service_day: null, service_day2: null, eow_week: null, scooper_id: null }, 'return=minimal');
          patch.service_day = null;
          break;
        }
      }
    }
    // Joe, Nov 21, 2026: nothing goes to the customer here. The day picked above is a first guess for the route.
    // The customer hears their day and time when the office sets both in the Field App (schedNotice).
    if (c.phone) await db(env, 'PATCH', 'leads?phone=eq.' + enc(c.phone) + '&status=in.(new,contacted,quoted)', { status: 'won', updated_at: new Date().toISOString() }, 'return=minimal');
  } catch (e) { console.error('place customer', e); }
}

/* ---------- staff sign in: email code, only for emails on the staff list ---------- */
async function staffFor(env, u) {
  if (!u) return null;
  let s = (await db(env, 'GET', 'staff?user_id=eq.' + u.id + '&active=is.true&select=*'))[0];
  if (!s) {
    s = (await db(env, 'GET', 'staff?email=eq.' + enc(u.email) + '&active=is.true&select=*'))[0];
    if (s && s.user_id && s.user_id !== u.id) return null;
    if (s && !s.user_id) { await db(env, 'PATCH', 'staff?id=eq.' + s.id, { user_id: u.id }, 'return=minimal'); s.user_id = u.id; }
  }
  return s || null;
}
async function auth(env, path, body) {
  const r = await fetch(base(env) + '/auth/v1' + path, { method: 'POST', headers: sbHeaders(env.SUPABASE_ANON_KEY), body: JSON.stringify(body) });
  let data = null;
  try { data = await r.json(); } catch (e) { data = null; }
  return { ok: r.ok, status: r.status, data: data || {} };
}
const sessionOut = (d) => ({ access_token: d.access_token, refresh_token: d.refresh_token, expires_at: d.expires_at || Math.floor(Date.now() / 1000) + (d.expires_in || 3600) });

// A lock on each staff email, kept in the database (table auth_tries). The brake at the top of this file counts per
// visitor address and lives in one server's memory, so someone guessing from a thousand addresses walks around it.
// This count is per email and is the same on every server: 5 code tries in 15 minutes, then that email waits.
// A 6 digit code has a million answers, so 5 tries per 15 minutes is no way in. The same table keeps a flood of
// "email me a code" requests from filling a staff inbox: 3 in 15 minutes and 15 in a day.
// If the table is missing or the database is slow, sign in still works, on a count kept in memory.
const TRY_MIN = 15, TRY_MAX = 5, SEND_MAX = 3, SEND_DAY = 15;
async function tooManyTries(env, email, kind) {
  try {
    await db(env, 'POST', 'auth_tries', [{ email, kind }], 'return=minimal');
    const span = kind === 'send' ? 86400e3 : TRY_MIN * 60e3;
    const rows = await db(env, 'GET', 'auth_tries?email=eq.' + enc(email) + '&kind=eq.' + kind + '&at=gte.' + enc(new Date(Date.now() - span).toISOString()) + '&select=at&order=at.desc&limit=100');
    const recent = rows.filter((r) => Date.now() - Date.parse(r.at) < TRY_MIN * 60e3).length;
    return kind === 'send' ? recent > SEND_MAX || rows.length > SEND_DAY : recent > TRY_MAX;
  } catch (e) {
    // The table is missing or the database did not answer. Sign in must still work, so fall back to a count kept in
    // this server's memory. The Health tab shows the lock as off until the table is there (supabase/patch-2026-11-16.sql).
    console.error('auth_tries', e && e.message);
    return hitLimit(kind + '|' + email, kind === 'send' ? SEND_MAX : TRY_MAX, TRY_MIN * 60e3);
  }
}
async function clearTries(env, email) {
  try { await db(env, 'DELETE', 'auth_tries?email=eq.' + enc(email) + '&kind=eq.try', null, 'return=minimal'); } catch (e) { }
}
// A Supabase sign in token says how the person signed in. Everyone here signs in with a code sent to their email.
// Supabase also lets anyone set a password on an email that has not signed in yet. Without this check, a stranger
// could set a password on a new hire's or a new customer's email, wait for them to sign in with a code (which makes
// the account real), then walk in with that password. A token that came from a password is refused, always.
function passwordSession(token) {
  try {
    const part = String(token || '').split('.')[1];
    if (!part) return false;
    const claims = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    return Array.isArray(claims.amr) && claims.amr.some((x) => (x && x.method) === 'password');
  } catch (e) { return false; }
}

async function staffCode(request, env) {
  const b = await body(request);
  const email = clean(b && b.email, 200).toLowerCase();
  if (!emailOk(email)) return fail(400, 'Type your work email.');
  const s = (await db(env, 'GET', 'staff?email=eq.' + enc(email) + '&active=is.true&select=id'))[0];
  if (s && !(await tooManyTries(env, email, 'send'))) {
    const r = await fetch(base(env) + '/auth/v1/otp', { method: 'POST', headers: sbHeaders(env.SUPABASE_SERVICE_ROLE_KEY), body: JSON.stringify(Object.assign({ email, create_user: true }, b && b.captcha ? { gotrue_meta_security: { captcha_token: clean(b.captcha, 4000) } } : {})) });
    if (r.status === 429) return fail(429, 'Please wait a minute, then try again.');
    if (!r.ok) console.error('staff code', r.status, (await r.text()).slice(0, 200));
  }
  // Same answer either way, so the page never says who is on the team.
  return ok({ ok: true, message: 'If that email is on the team, a 6 digit code is on its way.' });
}
async function staffVerify(request, env) {
  const b = await body(request);
  const email = clean(b && b.email, 200).toLowerCase(), code = String((b && b.code) || '').replace(/\D/g, '');
  if (!emailOk(email) || code.length < 6) return fail(400, 'Type the 6 digit code from your email.');
  const onTeam = (await db(env, 'GET', 'staff?email=eq.' + enc(email) + '&active=is.true&select=id'))[0];
  if (onTeam && (await tooManyTries(env, email, 'try'))) return fail(429, 'Too many wrong codes. Wait ' + TRY_MIN + ' minutes, then ask for a new code.');
  const r = await auth(env, '/verify', { type: 'email', email, token: code });
  if (!r.ok || !r.data.access_token) return fail(400, 'That code did not work. Check it, or send a new one.');
  const u = r.data.user || {};
  const s = await staffFor(env, { id: u.id, email: String(u.email || email).toLowerCase() });
  if (!s) return fail(403, 'This sign in is only for Arizona Pet Waste staff.');
  await clearTries(env, email);
  return ok({ session: sessionOut(r.data), staff: { name: s.name, role: s.role } });
}
async function staffRefresh(request, env) {
  const b = await body(request);
  const t = String((b && b.refresh_token) || '');
  if (!t) return fail(401, 'Please sign in again.');
  const r = await auth(env, '/token?grant_type=refresh_token', { refresh_token: t });
  if (!r.ok || !r.data.access_token) return fail(401, 'Please sign in again.');
  return ok({ session: sessionOut(r.data) });
}

/* ---------- router ---------- */
async function desk(path, request, env, ctx) {
  const m = request.method;
  if (!sbLive(env)) return fail(503, 'The field desk needs the Supabase keys in Cloudflare first.');
  if (path.startsWith('/api/track/') && m === 'GET') return path.slice(11).toUpperCase() === DEMO_CODE ? trackDemo(env) : track(path.slice(11), env);
  if (path === '/api/staff/code' && m === 'POST') return staffCode(request, env);
  if (path === '/api/staff/verify' && m === 'POST') return staffVerify(request, env);
  if (path === '/api/staff/refresh' && m === 'POST') return staffRefresh(request, env);
  if (path === '/api/office/night-before' && m === 'POST' && env.CRON_SECRET && String(env.CRON_SECRET).length >= 16 &&
    sameSecret(request.headers.get('x-cron-secret'), env.CRON_SECRET)) return nightBefore(env, null, true);

  const s = await staffFor(env, await signedIn(request, env));
  if (!s) return fail(401, 'Please sign in again.');
  env = await withSettings(env);
  const b = m === 'POST' ? (await body(request)) || {} : {};
  const q = new URL(request.url).searchParams;
  if (path === '/api/staff/me' && m === 'GET') return ok({ staff: { id: s.id, name: s.name, role: s.role, email: s.email, scoops: runsRoute(s) } });

  // Crew: any signed in staff member, on their own route for today.
  if (path === '/api/crew/today' && m === 'GET') return crewToday(s, env);
  if (path === '/api/crew/start' && m === 'POST') return crewStart(s, env, b);
  if (path === '/api/crew/ping' && m === 'POST') return crewPing(s, env, b);
  if (path === '/api/crew/arrive' && m === 'POST') return crewArrive(s, env, b);
  if (path === '/api/crew/photo' && m === 'POST') return crewPhoto(s, env, b);
  if (path === '/api/crew/done' && m === 'POST') return crewDone(s, env, b);
  if (path === '/api/crew/cant' && m === 'POST') return crewCant(s, env, b);
  if (path === '/api/crew/end' && m === 'POST') return crewEnd(s, env);
  if (path === '/api/crew/text' && m === 'POST') return markText(s, env, b, true);

  // Office: owner and office only.
  if (s.role === 'scooper') return fail(403, 'Only the office can open this.');
  if (path === '/api/office/day' && m === 'GET') return officeDay(env, q.get('date'));
  if (path === '/api/office/week' && m === 'POST') return officeWeek(env, b);
  if (path === '/api/office/settings' && m === 'GET') return officeSettings(env, null);
  if (path === '/api/office/settings' && m === 'POST') return officeSettings(env, b);
  if (path === '/api/office/plan' && m === 'POST') return ok(await planDay(env, isDay(b.date) ? b.date : azToday()));
  if (path === '/api/office/stop' && m === 'POST') return officeStop(env, b);
  if (path === '/api/office/loads' && m === 'GET') return officeLoads(env, q.get('from'), q.get('staff'), q.get('ids'));
  if (path === '/api/office/move-day' && m === 'POST') return officeMoveDay(env, b);
  if (path === '/api/office/customers' && m === 'GET') return officeCustomers(env, q);
  if (path === '/api/office/customer' && m === 'GET') return officeCustomer(env, q.get('id'));
  if (path === '/api/office/customer' && m === 'POST') return officeCustomerSave(env, b, s);
  if (path === '/api/office/photo' && m === 'GET') return officePhoto(env, q.get('stop'));
  if (path === '/api/office/photo' && m === 'POST') return officePhotoUpload(env, b);
  if (path === '/api/office/leads' && m === 'GET') return ok({ leads: await db(env, 'GET', 'leads?select=*&order=created_at.desc&limit=500') });
  if (path === '/api/office/lead' && m === 'POST') return officeLead(env, b);
  if (path === '/api/office/texts' && m === 'GET') return officeTexts(env);
  if (path === '/api/office/text' && m === 'POST') return markText(s, env, b, false);
  if (path === '/api/office/text/send' && m === 'POST') return officeTextSend(s, env, b);
  if (path === '/api/office/customer/welcome' && m === 'POST') return officeWelcome(s, env, b);
  if (path === '/api/office/night-before' && m === 'POST') return nightBefore(env, isDay(b.date) ? b.date : null);
  if (path === '/api/office/money' && m === 'GET') return officeMoney(env);
  if (path === '/api/office/health' && m === 'GET') return officeHealth(env);
  if (path === '/api/office/health/clear' && m === 'POST') return officeHealthClear(env);
  if (path === '/api/office/areas' && m === 'GET') return officeAreas(env);
  if (path === '/api/office/area' && m === 'POST') return officeArea(env, b);
  if (path === '/api/office/team' && m === 'GET') return ok({ team: await teamList(env) });
  if (path === '/api/office/team' && m === 'POST') return s.role === 'owner' ? officeTeam(env, s, b) : fail(403, 'Only the owner can change the team.');
  return fail(404, 'Not found.');
}

/* ---------- texts: sent through Twilio when it is set up. Every text is kept in `messages` ---------- */
// Joe, Nov 21, 2026: Twilio approved the campaign on November 19, so visit texts send on their own.
// How it works:
// - A text is always written to `messages` first (status queued). That table is the log and the backup.
// - With the three Twilio settings in Cloudflare (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_MESSAGING_SERVICE_SID)
//   a visit text is sent right away through the Messaging Service. Without them it waits in the Texts tab and a
//   person sends it by hand, as before.
// - Only a customer who said yes to visit texts gets one (`texts_visit`). A STOP reply turns that off.
// - Test mode: SMS_TEST_ALLOWLIST is a list of mobile numbers. When it is set, texts go to those numbers and no others.
//   Everyone else's texts wait in the Texts tab, as they did before Twilio.
// - Deals texts do not exist. The card problem text (`card_failed`) is not a visit text and is still sent by hand.
const AUTO_KINDS = ['day_set', 'visit_change', 'night_before', 'on_the_way', 'done', 'cant'];
function smsOn(env) { return !!(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_MESSAGING_SERVICE_SID); }
function smsAllow(env) {
  const raw = String(env.SMS_TEST_ALLOWLIST || '').trim();
  if (!raw) return null;
  // Numbers are split by commas (or semicolons, or new lines), so "(623) 555-0100, 623-555-0101" reads as two numbers.
  return new Set(raw.split(/[,;\n]+/).map(digits).filter((x) => x.length === 10));
}
const testMode = (env) => smsAllow(env) !== null;
const smsMay = (env, phone) => { const a = smsAllow(env); return !a || a.has(digits(phone)); };
// Arizona has no daylight saving time, so its clock is always seven hours behind UTC.
const azMinutes = () => { const d = new Date(Date.now() - 7 * 3600e3); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
// A text nobody is waiting for (the day we set, the night before reminder) only goes out from 8 in the morning to 9 at night.
const QUIET_KINDS = ['day_set', 'visit_change', 'night_before'];
// SMS_HOURS (optional, "8-21") moves those hours.
const quietNow = (env) => {
  const h = /^(\d{1,2})-(\d{1,2})$/.exec(String((env && env.SMS_HOURS) || '').trim()), from = h ? Number(h[1]) : 8, to = h ? Number(h[2]) : 21, m = azMinutes();
  return m < from * 60 || m >= to * 60;
};
const TWILIO_WHY = { 21610: 'They replied STOP, so Twilio will not text them.', 21211: 'That is not a real phone number.', 21614: 'That number cannot get texts.', 30003: 'The phone was off or out of reach.',
  30005: 'The number is not in service.', 30006: 'That is a landline or cannot get texts.', 30007: 'The carrier blocked the text.', 30034: 'The number is not on an approved campaign yet.' };
const twilioWhy = (code) => (TWILIO_WHY[code] || 'Twilio could not deliver it.') + ' (Twilio ' + code + ')';

/* ---------- the schedule: a day AND a time (Joe, Nov 21, 2026, the core rule) ----------
   The office sets a booked house's service day and time in the Field App ("Monday 10:30 AM") and can change it later.
   Setting or changing it is what tells the customer. Until both are set, no day text, no night before text and no
   "on our way" text goes out. The gate photo notice after a visit always goes: that promise does not wait on a time.
   customers.service_time is the time for the service day ("10:30"), service_time2 the time for the second day of a twice
   a week plan (empty means the same time). stops.visit_time is a change for that one visit. They come with
   supabase/patch-2026-11-21.sql: until it is run nobody has a time, so nobody is told anything (schedOn). */
const isTime = (v) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v == null ? '' : v));
const toMin = (t) => Number(String(t).slice(0, 2)) * 60 + Number(String(t).slice(3, 5));
const clock12 = (min) => { const h = Math.floor(min / 60) % 24, m = min % 60; return { t: ((h + 11) % 12 + 1) + ':' + String(m).padStart(2, '0'), ap: h < 12 ? 'AM' : 'PM' }; };
const timeSay = (t) => { const c = clock12(toMin(t)); return c.t + ' ' + c.ap; };
// The 30 minute window around a set time: "10:15 and 10:45 AM".
function windowText(t) {
  const m = toMin(t), a = clock12(Math.max(0, m - 15)), b = clock12(Math.min(1439, m + 15));
  return a.t + (a.ap === b.ap ? '' : ' ' + a.ap) + ' and ' + b.t + ' ' + b.ap;
}
// The time a customer is served on a weekday. A one time move to another weekday keeps their usual time.
const timeOn = (c, wd) => (c && c.service_day2 === wd && c.service_day !== wd && isTime(c.service_time2) ? c.service_time2 : (c && isTime(c.service_time) ? c.service_time : null));
const schedSet = (c) => !!(c && c.service_day != null && isTime(c.service_time));
const schedSay = (c) => DAYS[c.service_day] + ' around ' + timeSay(c.service_time) +
  (c.plan === 'twice' && c.service_day2 != null ? ' and ' + DAYS[c.service_day2] + ' around ' + timeSay(timeOn(c, c.service_day2)) : '');
const dateSay = (day) => new Date(day + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });
// The next visit on a schedule, as a date. Today counts while the set time is still ahead.
function nextVisit(c) {
  const today = azToday(), t = timeOn(c, weekday(today));
  return nextVisits(c, t && azMinutes() < toMin(t) ? today : addDays(today, 1), 1)[0] || null;
}
// Are the time columns in the database yet? Asked once and remembered. A no is asked again after a minute.
let SCHED_ON = false, SCHED_AT = 0;
async function schedOn(env) {
  if (SCHED_ON) return true;
  if (Date.now() - SCHED_AT < 60e3) return false;
  SCHED_AT = Date.now();
  try {
    await db(env, 'GET', 'customers?select=service_time,service_time2&limit=1');
    await db(env, 'GET', 'stops?select=visit_time&limit=1');
    SCHED_ON = true;
  } catch (e) { SCHED_ON = false; }
  return SCHED_ON;
}
// The time of each visit in a list of stops ({ id, day, customer_id or customer.id }): { stop id: "10:30" or null }.
// A time set for that one visit wins over the customer's usual time.
async function timesOf(env, stops) {
  const out = {};
  if (!stops || !stops.length || !(await schedOn(env))) return out;
  const cid = (st) => st.customer_id || (st.customer && st.customer.id);
  const ids = [...new Set(stops.map(cid).filter(Boolean))], sids = stops.map((st) => st.id).filter(Boolean);
  const cust = {}, own = {};
  for (let i = 0; i < ids.length; i += 100) for (const r of await db(env, 'GET', 'customers?id=in.(' + ids.slice(i, i + 100).join(',') + ')&select=id,service_day,service_day2,service_time,service_time2')) cust[r.id] = r;
  for (let i = 0; i < sids.length; i += 200) for (const r of await db(env, 'GET', 'stops?id=in.(' + sids.slice(i, i + 200).join(',') + ')&select=id,visit_time')) own[r.id] = r.visit_time;
  for (const st of stops) out[st.id] = isTime(own[st.id]) ? own[st.id] : timeOn(cust[cid(st)], weekday(st.day));
  return out;
}
// Who may be told about a schedule right now. Nobody until texts are on (Twilio settings in Cloudflare). While test
// mode is on, only a customer whose mobile number is on the test list. So no real customer hears a thing until Joe
// takes test mode off.
const tellGate = (env, c) => (!smsOn(env) ? 'off' : (testMode(env) && !smsMay(env, c && c.phone) ? 'test' : ''));

function textBody(env, kind, code, reason, opt) {
  const link = siteHost(env) + '/t/' + code;
  if (kind === 'night_before') {
    const t = opt && isTime(opt.time) ? opt.time : null, when = opt && opt.day ? (opt.day === addDays(azToday(), 1) ? 'tomorrow (' + DAYS[weekday(opt.day)] + ')' : 'on ' + dateSay(opt.day)) : 'tomorrow';
    return 'Arizona Pet Waste: We will be there ' + when + (t ? ' around ' + timeSay(t) + ', between ' + windowText(t) : '') + '. Please unlock the gate and keep your dogs inside. Watch the truck on the way: ' + link + ' Reply STOP to opt out.';
  }
  if (kind === 'on_the_way') return 'Arizona Pet Waste: We are on our way! Here is the truck: ' + link;
  if (kind === 'done') return 'Arizona Pet Waste: Your yard is done. See your latched gate: ' + link + ' Missed a pile? Reply and we come back within 24 hours.';
  if (kind === 'cant') return 'Arizona Pet Waste: We could not service your yard today because ' + (REASONS[reason] || REASONS.other) + '. Reply and we will set a time.';
  if (kind === 'visit_change') return 'Arizona Pet Waste: Your visit is now ' + dateSay(opt.day) + ' around ' + timeSay(opt.time) + '. This change is for that visit only. Reply STOP to opt out.';
  return '';
}
// The words of "your day and time are set". c is a customer row with a full schedule.
function dayText(c, moved) {
  const next = nextVisit(c);
  return 'Arizona Pet Waste: Your ' + (moved ? 'new ' : '') + 'service day is ' + schedSay(c) + '.' + (next ? ' Your next visit is ' + dateSay(next) + '.' : '') + ' We text you the night before each visit. Reply STOP to opt out.';
}
// Sends one row of `messages` through Twilio. Answers: sent, failed, held (test mode, or too late at night),
// off (Twilio is not set up) or taken (another request is already sending it). A row is claimed before Twilio is
// called, so the same text can never go out twice.
async function sendText(env, msg, by, force) {
  if (!smsOn(env)) return 'off';
  if (!msg || msg.channel === 'email' || !smsMay(env, msg.to_addr)) return 'held';
  if (!force && QUIET_KINDS.includes(msg.kind) && quietNow(env)) return 'held';
  const to = digits(msg.to_addr), now = new Date().toISOString();
  const claim = await db(env, 'PATCH', 'messages?id=eq.' + msg.id + '&status=eq.queued', Object.assign({ status: 'sent', sent_at: now }, by ? { sent_by: by } : {}), 'return=representation');
  if (!claim || !claim.length) return 'taken';
  let sid = '', code = 0, err = '';
  if (to.length !== 10) { code = 21211; err = twilioWhy(21211); }
  else {
    try {
      const r = await fetch('https://api.twilio.com/2010-04-01/Accounts/' + enc(env.TWILIO_ACCOUNT_SID) + '/Messages.json', {
        method: 'POST',
        headers: { authorization: 'Basic ' + btoa(env.TWILIO_ACCOUNT_SID + ':' + env.TWILIO_AUTH_TOKEN), 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ To: '+1' + to, MessagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID, Body: msg.body, StatusCallback: 'https://' + siteHost(env) + '/api/twilio/status' }).toString()
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d && d.sid) sid = String(d.sid);
      else { code = Number(d && d.code) || r.status; err = twilioWhy(code); }
    } catch (e) { err = 'Twilio did not answer. The text was not sent.'; }
  }
  // The extra columns come with supabase/patch-2026-11-21.sql. If that has not been run yet, the plain status is still saved.
  const patch = sid ? { provider_id: sid, error: null } : { status: 'failed', error: err };
  try { await db(env, 'PATCH', 'messages?id=eq.' + msg.id, patch, 'return=minimal'); }
  catch (e) { if (!sid) await db(env, 'PATCH', 'messages?id=eq.' + msg.id, { status: 'failed' }, 'return=minimal').catch(() => {}); }
  if (sid) return 'sent';
  if (code === 21610) await textsOff(env, to).catch(() => {});
  await logError(env, 'server', '/texts', 'A text did not send', (msg.kind || '') + ': ' + err).catch(() => {});
  return 'failed';
}
// Queues a visit text and, when texts send on their own, sends it. Answers false when no text is due
// (no yes to texts, no mobile number, or this visit already has this text), else { id, state }.
async function queueText(env, customer, stopId, kind, code, reason, opt) {
  if (!customer || !customer.texts_visit || !customer.phone) return false;
  const had = await db(env, 'GET', 'messages?stop_id=eq.' + stopId + '&kind=eq.' + kind + '&channel=eq.sms&select=id');
  if (had && had.length) return false;
  const rows = await db(env, 'POST', 'messages', [{ customer_id: customer.id, stop_id: stopId, kind, channel: 'sms', to_addr: customer.phone, body: textBody(env, kind, code, reason, opt) }], 'return=representation');
  const msg = rows && rows[0];
  let state = 'queued';
  if (msg && msg.id) { try { state = await sendText(env, msg); } catch (e) { console.error('send text', e); } }
  return { id: msg && msg.id, state };
}
// "Your day and time are set" texts. list: [{ c: a customer row with a full schedule, moved }]. All rows are written in
// one go. The first few are sent right away. The rest wait as queued and the evening run sends them, so a week plan
// that moves hundreds of yards cannot run this server out of time.
const DAY_TEXTS_NOW = 15;
async function dayTexts(env, list) {
  const want = list.filter((x) => x.c && x.c.texts_visit && digits(x.c.phone).length === 10 && schedSet(x.c));
  if (!want.length) return { queued: 0, sent: 0 };
  // The same words as the last day text to that customer, inside ten minutes: one text is enough (a double tap on Save).
  const since = new Date(Date.now() - 10 * 60e3).toISOString();
  let recent = [];
  try { recent = await db(env, 'GET', 'messages?kind=eq.day_set&created_at=gte.' + enc(since) + '&select=customer_id,body&order=id.desc'); } catch (e) { recent = []; }
  // Only the newest day text for a customer counts: a day moved away and back again is real news both times.
  const newest = new Map();
  for (const r of recent) if (!newest.has(r.customer_id)) newest.set(r.customer_id, r.body);
  const seen = new Set([...newest].map(([id, body]) => id + '|' + body));
  const rows = [];
  for (const x of want) {
    const body = dayText(x.c, x.moved), key = x.c.id + '|' + body;
    if (seen.has(key) && !x.again) continue;
    seen.add(key);
    rows.push({ customer_id: x.c.id, stop_id: null, kind: 'day_set', channel: 'sms', to_addr: x.c.phone, body });
  }
  let made = [], sent = 0;
  for (let i = 0; i < rows.length; i += 200) made = made.concat(await db(env, 'POST', 'messages', rows.slice(i, i + 200), 'return=representation') || []);
  for (const msg of made.slice(0, DAY_TEXTS_NOW)) { try { if (await sendText(env, msg) === 'sent') sent++; } catch (e) { console.error('day text', e); } }
  return { queued: made.length, sent };
}
const SCHED_FIELDS = 'id,name,email,phone,texts_visit,status,plan,eow_week,first_visit,service_day,service_day2';
// One customer's day and time were set or changed: the confirmation, by email and by text, right away.
// Answers what happened, for the note on the customer card.
async function schedNotice(env, c, moved, again) {
  if (!schedSet(c)) return { mailed: false, text: 'none', needTime: true };
  const gate = tellGate(env, c);
  if (gate) return { mailed: false, text: 'none', [gate]: true };
  const mailed = c.email ? await mail(env, c.email, (moved ? 'Your new service day is ' : 'Your service day is ') + schedSay(c), dayMail(c, moved)) : false;
  let text = 'none';
  try { const r = await dayTexts(env, [{ c, moved, again }]); text = r.sent ? 'sent' : r.queued ? 'queued' : 'none'; } catch (e) { console.error('day text', e); }
  return { mailed, text, say: schedSay(c) };
}
// Many customers at once (Plan the week, Move yards for good). Only a customer whose day AND time are set is told,
// and only one the gate lets through. movedIds: the customers whose day changed (the rest got a first day).
async function schedNoticeMany(env, ids, movedIds) {
  const out = { emailed: 0, texted: 0 };
  if (!ids.length || !(await schedOn(env)) || !smsOn(env)) return out;
  const moved = new Set(movedIds || []), who = [];
  for (let i = 0; i < ids.length; i += 100) who.push(...await db(env, 'GET', 'customers?id=in.(' + ids.slice(i, i + 100).join(',') + ')&select=' + SCHED_FIELDS + ',service_time,service_time2'));
  const tell = who.filter((c) => schedSet(c) && !tellGate(env, c) && (PAYING.includes(c.status) || c.status === 'paused'));
  out.emailed = await mailMany(env, tell.filter((c) => c.email).map((c) => ({ to: c.email, subject: (moved.has(c.id) ? 'Your new service day is ' : 'Your service day is ') + schedSay(c), text: dayMail(c, moved.has(c.id)) })));
  try { out.texted = (await dayTexts(env, tell.map((c) => ({ c, moved: moved.has(c.id) })))).queued; } catch (e) { console.error('day texts', e); }
  return out;
}
// One visit was moved or given another time, for that visit only: tell the customer, by email and by text.
// A night before text for that visit that has not gone out yet gets the new words.
async function visitNotice(env, st, c, time) {
  await nightFix(env, [st]).catch((e) => console.error('night fix', e));
  if (!c || !isTime(time) || tellGate(env, c)) return false;
  const opt = { day: st.day, time };
  if (c.email) await mail(env, c.email, 'Your visit is now ' + dateSay(st.day) + ' around ' + timeSay(time), [hi(c.name), '',
    'We changed one visit. It is now ' + dateSay(st.day) + ' around ' + timeSay(time) + '.',
    'This change is for that visit only. Your usual day and time stay the same.', '',
    'Questions? Call or text 623.309.6104.', '', 'Arizona Pet Waste'].join('\n'));
  if (!c.texts_visit || digits(c.phone).length !== 10) return true;
  // An older change text for this visit that is still waiting is dropped: only the newest one is news.
  await db(env, 'PATCH', 'messages?stop_id=eq.' + st.id + '&kind=eq.visit_change&status=eq.queued', { status: 'skipped', sent_at: new Date().toISOString() }, 'return=minimal').catch(() => {});
  const rows = await db(env, 'POST', 'messages', [{ customer_id: c.id, stop_id: st.id, kind: 'visit_change', channel: 'sms', to_addr: c.phone, body: textBody(env, 'visit_change', st.code, null, opt) }], 'return=representation');
  if (rows && rows[0]) await sendText(env, rows[0]).catch((e) => console.error('change text', e));
  return true;
}
// Night before texts that are still waiting get the words for the visit's time as it is now.
async function nightFix(env, stops) {
  if (!stops.length) return;
  const wait = await db(env, 'GET', 'messages?kind=eq.night_before&channel=eq.sms&status=eq.queued&stop_id=in.(' + stops.map((x) => x.id).join(',') + ')&select=id,stop_id');
  if (!wait.length) return;
  const times = await timesOf(env, stops), by = Object.fromEntries(stops.map((x) => [x.id, x]));
  for (const m of wait) {
    const st = by[m.stop_id];
    if (times[st.id]) await db(env, 'PATCH', 'messages?id=eq.' + m.id + '&status=eq.queued', { body: textBody(env, 'night_before', st.code, null, { day: st.day, time: times[st.id] }) }, 'return=minimal');
    else await db(env, 'PATCH', 'messages?id=eq.' + m.id + '&status=eq.queued', { status: 'skipped', sent_at: new Date().toISOString() }, 'return=minimal');
  }
}
// A STOP reply, or Twilio saying this number has opted out: no more texts to that number, and what was waiting is dropped.
async function textsOff(env, phone) {
  const now = new Date().toISOString();
  try { await db(env, 'PATCH', 'customers?phone=eq.' + enc(phone), { texts_visit: false, texts_stopped_at: now, updated_at: now }, 'return=minimal'); }
  catch (e) { await db(env, 'PATCH', 'customers?phone=eq.' + enc(phone), { texts_visit: false, updated_at: now }, 'return=minimal'); }
  await db(env, 'PATCH', 'messages?to_addr=eq.' + enc(phone) + '&channel=eq.sms&status=eq.queued', { status: 'skipped', sent_at: now }, 'return=minimal').catch(() => {});
}

/* ---------- Twilio calls us: what happened to a text, and what a customer texted back ---------- */
// Twilio signs every call with the account's auth token: HMAC-SHA1 over the address it called, then every form
// field's name and value in name order. A call that is not signed right is refused, so nobody can fake a STOP,
// a reply or a "delivered".
async function twilioSigned(request, env, params) {
  const sig = request.headers.get('x-twilio-signature') || '';
  if (!env.TWILIO_AUTH_TOKEN || !sig) return false;
  const tail = [...params.keys()].filter((k, i, a) => a.indexOf(k) === i).sort().map((k) => params.getAll(k).map((v) => k + v).join('')).join('');
  const u = new URL(request.url);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.TWILIO_AUTH_TOKEN), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  for (const url of [request.url, 'https://' + siteHost(env) + u.pathname + u.search]) {
    const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(url + tail)));
    if (sameSecret(btoa(String.fromCharCode(...mac)), sig)) return true;
  }
  return false;
}
async function twilioForm(request, env) {
  const raw = await readText(request);
  if (raw == null) return null;
  const params = new URLSearchParams(raw);
  return (await twilioSigned(request, env, params)) ? params : null;
}
const TWIML = () => new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', { status: 200, headers: { 'content-type': 'text/xml; charset=utf-8' } });
// Delivery news for a text we sent. "delivered" is saved. "failed" or "undelivered" is saved with the reason, the
// Health tab gets a line, and if it was the gate photo text the photo goes by email instead.
async function twilioStatus(request, env, ctx) {
  if (!sbLive(env)) return fail(503, 'Not set up.');
  const f = await twilioForm(request, env);
  if (!f) return fail(403, 'Bad signature.');
  const sid = clean(f.get('MessageSid') || f.get('SmsSid'), 64), st = String(f.get('MessageStatus') || f.get('SmsStatus') || '').toLowerCase();
  if (!/^[A-Za-z0-9]{10,64}$/.test(sid) || !['delivered', 'failed', 'undelivered'].includes(st)) return ok({ ok: true });
  const now = new Date().toISOString(), code = Number(f.get('ErrorCode')) || 0;
  const patch = st === 'delivered' ? { status: 'delivered', delivered_at: now } : { status: 'failed', error: twilioWhy(code || 30008) };
  let rows = [];
  for (let i = 0; i < 2 && !rows.length; i++) {
    // Twilio can call before our own save of the message id has landed. Look once more after a moment.
    if (i) await new Promise((r) => setTimeout(r, Number(env.TRY_WAIT_MS) || 1500));
    rows = await db(env, 'PATCH', 'messages?provider_id=eq.' + enc(sid) + '&status=eq.sent', patch, 'return=representation').catch(() => []) || [];
  }
  const msg = rows[0];
  if (msg && st !== 'delivered') {
    if (code === 21610) await textsOff(env, digits(msg.to_addr)).catch(() => {});
    await logError(env, 'server', '/texts', 'A text did not send', (msg.kind || '') + ': ' + twilioWhy(code || 30008)).catch(() => {});
    if (msg.kind === 'done' && msg.stop_id) await doneFallback(env, msg.stop_id).catch((e) => console.error('done fallback', e));
  }
  return ok({ ok: true });
}
// A customer texted our number. STOP turns their texts off here too (Twilio itself answers STOP, START and HELP, so we
// send no reply of our own). START turns them back on for someone who had stopped. Anything else is a real reply:
// it is saved, and the office gets an email so a person can answer.
const STOP_WORDS = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'REVOKE', 'OPTOUT'], START_WORDS = ['START', 'YES', 'UNSTOP'], HELP_WORDS = ['HELP', 'INFO'];
async function twilioInbound(request, env, ctx) {
  if (!sbLive(env)) return fail(503, 'Not set up.');
  const f = await twilioForm(request, env);
  if (!f) return fail(403, 'Bad signature.');
  const from = digits(f.get('From')), text = clean(f.get('Body'), 1000), sid = clean(f.get('MessageSid') || f.get('SmsSid'), 64);
  if (from.length !== 10) return TWIML();
  const word = text.toUpperCase().replace(/[^A-Z]/g, ''), opt = String(f.get('OptOutType') || '').toUpperCase();
  const kind = opt === 'STOP' || STOP_WORDS.includes(word) ? 'stop' : opt === 'START' || START_WORDS.includes(word) ? 'start' : opt === 'HELP' || HELP_WORDS.includes(word) ? 'help' : 'reply';
  const who = await db(env, 'GET', 'customers?phone=eq.' + enc(from) + '&select=id,name,email,status&order=created_at.desc&limit=5').catch(() => []);
  const c = who.find((x) => PAYING.includes(x.status) || x.status === 'paused') || who[0] || null;
  const name = c ? c.name : 'A number we do not know', pretty = '(' + from.slice(0, 3) + ') ' + from.slice(3, 6) + '-' + from.slice(6);
  if (kind === 'stop') {
    await textsOff(env, from);
    await db(env, 'POST', 'consent_log', [{ user_id: c ? c.id : null, email: c ? c.email : null, phone: from, kind: 'visit', granted: false, text_shown: 'Replied ' + (word || 'STOP') + ' by text', page: 'sms' }], 'return=minimal').catch(() => {});
    ctx.waitUntil(mail(env, owner(env), 'Texts stopped: ' + name, name + ' replied STOP. Visit texts are off for ' + pretty + '.\n\nTheir gate photo now goes by email. They can turn texts back on by texting START to our number.'));
  } else if (kind === 'start') {
    let back = [];
    try { back = await db(env, 'PATCH', 'customers?phone=eq.' + enc(from) + '&texts_stopped_at=not.is.null', { texts_visit: true, texts_stopped_at: null, updated_at: new Date().toISOString() }, 'return=representation') || []; } catch (e) { back = []; }
    if (back.length) {
      await db(env, 'POST', 'consent_log', [{ user_id: back[0].id, email: back[0].email, phone: from, kind: 'visit', granted: true, text_shown: 'Replied ' + (word || 'START') + ' by text', page: 'sms' }], 'return=minimal').catch(() => {});
      ctx.waitUntil(mail(env, owner(env), 'Texts back on: ' + name, name + ' replied START. Visit texts are on again for ' + pretty + '.'));
    }
  } else if (kind === 'reply' && text) {
    // Twilio sends a call again when it gets no answer. One reply is saved and emailed once.
    const had = sid ? await db(env, 'GET', 'messages?provider_id=eq.' + enc(sid) + '&select=id').catch(() => []) : [];
    if (!had.length) {
      await db(env, 'POST', 'messages', [{ customer_id: c ? c.id : null, stop_id: null, kind: 'reply', channel: 'sms', to_addr: from, body: text, status: 'received', provider_id: sid || null, sent_at: new Date().toISOString() }], 'return=minimal').catch((e) => console.error('reply save', e));
      ctx.waitUntil(mail(env, owner(env), 'Text from ' + name + ': ' + text.slice(0, 60), name + ' texted us back.\n\n"' + text + '"\n\nFrom: ' + pretty + '\n\nCall or text them from the business phone, 623.309.6104. A reply to this email does not reach them.'));
    }
  }
  return TWIML();
}

// Joe, Nov 16, 2026: the gate photo must always reach the customer, or that visit is free. A customer who did not say yes to
// visit texts (or has no mobile number) gets the done note by email instead, with the same link to the photo of the latched gate.
// A customer with visit texts gets the text. `force` is for a text that failed: then the email goes anyway.
// Sent once: both callers only reach this when the visit first turns done.
async function doneMail(env, customer, code, force) {
  if (!customer || !customer.email || (!force && customer.texts_visit && customer.phone)) return false;
  return mail(env, customer.email, 'Your yard is done. Here is your gate photo.', [
    hi(customer.name),
    '',
    'We picked up your yard today. See the photo of your latched gate here:',
    'https://' + siteHost(env) + '/t/' + code,
    '',
    'Missed a pile? Reply to this email and we come back within 24 hours.',
    'Every gate photo is also in My Yard: https://' + siteHost(env) + '/account/',
    force ? '' : 'Want these by text? Turn on texts in My Yard.',
    '',
    'Arizona Pet Waste',
    '623.309.6104'
  ].filter((x, i, a) => !(x === '' && a[i - 1] === '')).join('\n'));
}
// The gate photo text did not reach the phone (Joe, Nov 21, 2026): send the photo by email. Once for a visit.
async function doneFallback(env, stopId) {
  const st = (await db(env, 'GET', 'stops?id=eq.' + parseInt(stopId, 10) + '&select=id,code,status,photo_path,customer:customers(id,name,email,phone,texts_visit)'))[0];
  if (!st || st.status !== 'done' || !st.photo_path || !st.customer || !st.customer.email) return false;
  const had = await db(env, 'GET', 'messages?stop_id=eq.' + st.id + '&kind=eq.done&channel=eq.email&select=id');
  if (had && had.length) return false;
  const sent = await doneMail(env, st.customer, st.code, true);
  await db(env, 'POST', 'messages', [{ customer_id: st.customer.id, stop_id: st.id, kind: 'done', channel: 'email', to_addr: st.customer.email, body: 'Gate photo by email, because the text did not go through', status: sent ? 'sent' : 'failed', sent_at: new Date().toISOString() }], 'return=minimal').catch(() => {});
  return sent;
}
// The done notice for a visit that just finished: the text, and the email when there is no text or the text failed.
async function doneNotice(env, st) {
  const t = await queueText(env, st.customer, st.id, 'done', st.code);
  if (!st.photo_path) return;
  if (t && t.state === 'failed') await doneFallback(env, st.id).catch(() => false);
  else await doneMail(env, st.customer, st.code).catch(() => false);
}
// The yard is finished. An "on the way" text nobody sent is old news now, so it leaves the list. A sent one is left alone.
async function dropOnWayText(env, stopId) {
  try { await db(env, 'PATCH', 'messages?stop_id=eq.' + stopId + '&kind=eq.on_the_way&status=eq.queued', { status: 'skipped', sent_at: new Date().toISOString() }, 'return=minimal'); } catch (e) { }
}
async function markText(s, env, b, crewOnly) {
  const id = parseInt(b.id, 10);
  if (!id || !['sent', 'skipped'].includes(b.status)) return fail(400, 'Pick sent or skip.');
  if (crewOnly && s.role === 'scooper') {
    const mine = await db(env, 'GET', 'messages?id=eq.' + id + '&select=id,stop:stops(day,route:routes(staff_id))');
    const st = mine && mine[0] && mine[0].stop;
    if (!st || st.day !== azToday() || st.route.staff_id !== s.id) return fail(403, 'That text is not on your route.');
  }
  await db(env, 'PATCH', 'messages?id=eq.' + id + '&status=eq.queued', { status: b.status, sent_by: s.id, sent_at: new Date().toISOString() }, 'return=minimal');
  return ok({ ok: true });
}
// Office: "Send now" on a waiting text, or "Send again" on one that already went (a new copy is made, so the log
// keeps both). It goes through Twilio. The customer must still have texts on, and test mode still holds.
async function officeTextSend(s, env, b) {
  const id = parseInt(b.id, 10);
  const msg = id && (await db(env, 'GET', 'messages?id=eq.' + id + '&select=*,customer:customers(id,phone,texts_visit)'))[0];
  if (!msg || msg.channel !== 'sms' || !AUTO_KINDS.includes(msg.kind)) return fail(400, 'That text cannot be sent from here.');
  if (!smsOn(env)) return fail(400, 'Texts do not send on their own yet. Tap Send by hand on the Texts screen.');
  if (!msg.customer || !msg.customer.texts_visit) return fail(400, 'This customer said no to texts. Call or email them.');
  if (!smsMay(env, msg.to_addr)) return fail(409, 'Test mode is on. Texts only go to the test numbers.');
  let row = msg;
  if (msg.status !== 'queued') {
    const made = await db(env, 'POST', 'messages', [{ customer_id: msg.customer_id, stop_id: null, kind: msg.kind, channel: 'sms', to_addr: msg.customer.phone || msg.to_addr, body: msg.body }], 'return=representation');
    row = made && made[0];
  }
  const state = row ? await sendText(env, row, s.id, true) : 'failed';
  if (state === 'failed') return fail(502, 'Twilio did not take the text. Look at the Texts screen for the reason.');
  return ok({ ok: true, state });
}
// Office: send the welcome email again, with a fresh My Yard link.
async function officeWelcome(s, env, b) {
  if (!uuid(b.id)) return fail(400, 'Bad customer.');
  const c = (await db(env, 'GET', 'customers?id=eq.' + b.id + '&select=id,name,email,phone,status,texts_visit'))[0];
  if (!c) return fail(404, 'Customer not found.');
  if (!c.email) return fail(400, 'This customer has no email.');
  if (!PAYING.includes(c.status) && c.status !== 'paused') return fail(400, 'Only a customer with a plan gets the welcome email.');
  if (!(await sendWelcome(env, c, null, s.id))) return fail(502, 'The email did not send. Try again.');
  return officeCustomer(env, c.id);
}

/* ---------- crew ---------- */
const CREW_STOP = 'id,position,status,reason,note,photo_path,no_photo,code,on_way_at,arrived_at,done_at,' +
  'customer:customers(id,name,phone,address,zip,area,plan,dogs,dog_names,gate_code,gate_notes,problem_spots,skip_spray,texts_visit,lat,lng,office_notes)';
async function myRoute(s, env) {
  return (await db(env, 'GET', 'routes?day=eq.' + azToday() + '&staff_id=eq.' + s.id + '&select=*'))[0] || null;
}
async function crewToday(s, env) {
  const day = azToday();
  let r = await myRoute(s, env);
  // No route yet today: build it now, so nobody has to press Build routes first.
  // A route that has not started is topped up too, so a late sign up or a day the office built early is never short.
  if (!r || r.status === 'planned') { try { await planDay(env, day); r = await myRoute(s, env); } catch (e) { console.error('auto plan', e); } }
  if (!r) return ok({ day, dayName: DAYS[weekday(day)], route: null, stops: [], texts: [], me: { name: s.name, role: s.role } });
  const stops = await db(env, 'GET', 'stops?route_id=eq.' + r.id + '&select=' + CREW_STOP + '&order=position,id');
  const ids = stops.map((x) => x.id);
  const texts = ids.length ? await db(env, 'GET', 'messages?status=eq.queued&stop_id=in.(' + ids.join(',') + ')&select=id,stop_id,kind,to_addr,body&order=created_at') : [];
  const times = await timesOf(env, stops.map((x) => ({ id: x.id, day, customer_id: x.customer && x.customer.id }))).catch(() => ({}));
  return ok(Object.assign({ day, dayName: DAYS[weekday(day)], route: r, stops, texts, times, me: { name: s.name, role: s.role } }, env.GOOGLE_MAPS_BROWSER_KEY ? { mapsKey: env.GOOGLE_MAPS_BROWSER_KEY } : {}));
}
async function myStop(s, env, stopId) {
  const id = parseInt(stopId, 10);
  if (!id) return null;
  const st = (await db(env, 'GET', 'stops?id=eq.' + id + '&select=*,route:routes(id,day,staff_id,status),customer:customers(id,name,email,phone,address,lat,lng,texts_visit)'))[0];
  if (!st || st.route.staff_id !== s.id || st.day !== azToday()) return null;
  return st;
}
async function advance(env, routeId) {
  const busy = await db(env, 'GET', 'stops?route_id=eq.' + routeId + '&status=in.(on_the_way,here)&select=id');
  if (busy.length) return null;
  const next = (await db(env, 'GET', 'stops?route_id=eq.' + routeId + '&status=eq.scheduled&order=position,id&limit=1&select=id,day,code,customer:customers(id,phone,texts_visit)'))[0];
  if (!next) return null;
  await db(env, 'PATCH', 'stops?id=eq.' + next.id, { status: 'on_the_way', on_way_at: new Date().toISOString() }, 'return=minimal');
  // "We are on our way" only goes for a visit whose day and time the office set.
  const t = await timesOf(env, [next]).catch(() => ({}));
  if (t[next.id]) await queueText(env, next.customer, next.id, 'on_the_way', next.code);
  return next.id;
}
async function crewStart(s, env, b) {
  const r = await myRoute(s, env);
  if (!r) return fail(404, 'No route for you today.');
  if (!s.location_ok_at) {
    if (!b || !b.locationOk) return fail(428, 'Starting a route shares this phone\'s location with Arizona Pet Waste and with the customer you are driving to, until the route ends.', 'location_consent');
    await db(env, 'PATCH', 'staff?id=eq.' + s.id, { location_ok_at: new Date().toISOString() }, 'return=minimal');
  }
  if (r.status !== 'live') await db(env, 'PATCH', 'routes?id=eq.' + r.id, { status: 'live', started_at: r.started_at || new Date().toISOString(), ended_at: null }, 'return=minimal');
  await advance(env, r.id);
  return crewToday(s, env);
}
async function crewPing(s, env, b) {
  const lat = Number(b.lat), lng = Number(b.lng);
  if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return fail(400, 'Bad location.');
  const r = await myRoute(s, env);
  if (!r || r.status !== 'live') return ok({ ok: false });
  const n = (v) => (isFinite(Number(v)) ? Number(v) : null);
  await db(env, 'POST', 'positions', [{ route_id: r.id, lat, lng, accuracy: n(b.accuracy), speed: n(b.speed), heading: n(b.heading) }], 'return=minimal');
  return ok({ ok: true });
}
async function crewArrive(s, env, b) {
  const st = await myStop(s, env, b.stopId);
  if (!st) return fail(404, 'That stop is not on your route today.');
  if (['done', 'skipped', 'cant'].includes(st.status)) return crewToday(s, env);
  await db(env, 'PATCH', 'stops?id=eq.' + st.id, { status: 'here', arrived_at: st.arrived_at || new Date().toISOString() }, 'return=minimal');
  const lat = Number(b.lat), lng = Number(b.lng);
  if (st.customer.lat == null && isFinite(lat) && isFinite(lng) && Number(b.accuracy) < 60) {
    await db(env, 'PATCH', 'customers?id=eq.' + st.customer.id, { lat, lng }, 'return=minimal'); // first visit pins the yard
  }
  return crewToday(s, env);
}
async function storage(env, method, path, data, type) {
  const h = sbHeaders(env.SUPABASE_SERVICE_ROLE_KEY);
  if (type) { h['content-type'] = type; h['x-upsert'] = 'true'; }
  const r = await fetch(base(env) + '/storage/v1/' + path, { method, headers: h, body: data });
  const text = await r.text();
  if (!r.ok) throw new Error('storage ' + r.status + ' ' + text.slice(0, 200));
  try { return JSON.parse(text); } catch (e) { return null; }
}
async function photoUrl(env, p) {
  if (!p) return null;
  try {
    const r = await storage(env, 'POST', 'object/sign/gate-photos/' + p, JSON.stringify({ expiresIn: LINK_HOURS * 3600 }));
    const u = r && (r.signedURL || r.signedUrl);
    return u ? base(env) + '/storage/v1' + (u.startsWith('/') ? u : '/' + u) : null;
  } catch (e) { console.error('photo link', e); return null; }
}
async function crewPhoto(s, env, b) {
  const st = await myStop(s, env, b.stopId);
  if (!st) return fail(404, 'That stop is not on your route today.');
  return savePhoto(env, st, b.image, '/api/crew/photo', b.takenAt, b.manual);
}
// One place saves every gate photo, from the scooper's phone or from the office.
// When a photo was taken, read back from its file name. The time is part of the name, so it needs no table change and
// cannot drift from the file. "m" at the end means a person typed the time, and we say so wherever the time is shown.
function photoWhen(path) {
  const m = /-t(\d{9,11})(m?)\.[a-z]+$/.exec(String(path || ''));
  return m ? { at: new Date(Number(m[1]) * 1000).toISOString(), manual: m[2] === 'm' } : null;
}
// Every gate photo gets a time. The app sends the moment it was taken. A typed time is allowed for the backup upload
// (the app was down, the scooper used the phone's own camera) and is marked as typed. A time in the future, or from
// before the day of the visit, is not believed: the server's own clock is used in its place.
function photoTime(st, takenAt, manual) {
  const now = Date.now(), t = Date.parse(String(takenAt || ''));
  const dayStart = Date.parse(st.day + 'T00:00:00-07:00');
  const good = Number.isFinite(t) && t <= now + 5 * 60e3 && t >= dayStart && t < dayStart + 86400e3 + 6 * 3600e3;
  return { sec: Math.floor((good ? t : now) / 1000), manual: !!(good && manual) };
}
async function savePhoto(env, st, image, from, takenAt, manual) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(image || ''));
  if (!m) return fail(400, 'That photo did not come through. Take it again.');
  const bin = Uint8Array.from(atob(m[2]), (ch) => ch.charCodeAt(0));
  if (bin.length > 3 * 1024 * 1024) return fail(400, 'That photo is too big. Take it again.');
  // The file has to really be a picture: check the first bytes, not just the label it came with.
  const sig = (m[1] === 'image/jpeg' && bin[0] === 0xFF && bin[1] === 0xD8) || (m[1] === 'image/png' && bin[0] === 0x89 && bin[1] === 0x50 && bin[2] === 0x4E && bin[3] === 0x47) ||
    (m[1] === 'image/webp' && bin[0] === 0x52 && bin[1] === 0x49 && bin[2] === 0x46 && bin[3] === 0x46);
  if (!sig) return fail(400, 'That file is not a photo. Take it again.');
  const when = photoTime(st, takenAt, manual);
  const path = st.day + '/' + st.id + '-' + newCode().toLowerCase() + '-t' + when.sec + (when.manual ? 'm' : '') + '.' + (m[1] === 'image/png' ? 'png' : m[1] === 'image/webp' ? 'webp' : 'jpg');
  // The gate photo is our proof of the visit. Save it, try once more if the save fails, then prove the file is really
  // there by asking storage for a link to it. Only then is the stop marked as having a photo.
  let saved = false;
  for (let k = 0; k < 2 && !saved; k++) { try { await storage(env, 'POST', 'object/gate-photos/' + path, bin, m[1]); saved = true; } catch (e) { console.error('photo save try ' + (k + 1), e); } }
  const proof = saved ? await photoUrl(env, path) : null;
  if (!proof) { await logError(env, 'server', from, 'Gate photo did not save', 'stop ' + st.id).catch(() => {}); return fail(502, 'The photo did not save. Tap Send photo again.'); }
  await db(env, 'PATCH', 'stops?id=eq.' + st.id, { photo_path: path, no_photo: false }, 'return=minimal');
  return ok({ ok: true, bytes: bin.length, photoAt: new Date(when.sec * 1000).toISOString(), timeTyped: when.manual });
}
// Office: add a gate photo to a visit by hand. This is the backup when the app did not send one from the yard:
// the scooper takes the picture with the phone's own camera and it is uploaded here. Visits up to 14 days back.
async function officePhotoUpload(env, b) {
  const id = parseInt(b.stopId, 10);
  const st = id && (await db(env, 'GET', 'stops?id=eq.' + id + '&select=id,day,status,arrived_at,code,route:routes(id,status),customer:customers(id,name,email,phone,texts_visit)'))[0];
  if (!st) return fail(404, 'Stop not found.');
  if (st.day < addDays(azToday(), -14) || st.day > azToday()) return fail(400, 'A photo can be added for a visit from the last 14 days.');
  if (st.status === 'skipped') return fail(400, 'That visit was skipped. There is no visit to add a photo to.');
  const res = await savePhoto(env, st, b.image, '/api/office/photo', b.takenAt, b.manual);
  if (res.status !== 200) return res;
  // The app was down in the yard, so the visit was never tapped done. The photo proves it: finish the visit at the photo's time.
  if (['scheduled', 'on_the_way', 'here'].includes(st.status)) {
    const at = JSON.parse(await res.text()).photoAt;
    await db(env, 'PATCH', 'stops?id=eq.' + st.id, { status: 'done', done_at: at, arrived_at: st.arrived_at || at, no_photo: false }, 'return=minimal');
    await dropOnWayText(env, st.id);
    // A photo added today finishes today's visit, so the customer hears right away. For an older visit the truck link
    // has ended, so only a customer with no texts gets the email, as before.
    if (st.day === azToday()) await doneNotice(env, Object.assign({}, st, { photo_path: 'saved' })).catch((e) => console.error('done notice', e));
    else await doneMail(env, st.customer, st.code).catch(() => false);
    if (st.route && st.route.status === 'live') await advance(env, st.route.id);
  }
  return officeDay(env, st.day);
}
async function crewDone(s, env, b) {
  const st = await myStop(s, env, b.stopId);
  if (!st) return fail(404, 'That stop is not on your route today.');
  if (st.status === 'done') return crewToday(s, env);
  if (!st.photo_path && !b.noPhoto) return fail(400, 'Take the gate photo first.');
  await db(env, 'PATCH', 'stops?id=eq.' + st.id, {
    status: 'done', done_at: new Date().toISOString(), arrived_at: st.arrived_at || new Date().toISOString(),
    note: clean(b.note, 500) || st.note, no_photo: !st.photo_path
  }, 'return=minimal');
  await dropOnWayText(env, st.id);
  await doneNotice(env, st).catch((e) => console.error('done notice', e));
  await advance(env, st.route.id);
  return crewToday(s, env);
}
async function crewCant(s, env, b) {
  const st = await myStop(s, env, b.stopId);
  if (!st) return fail(404, 'That stop is not on your route today.');
  const reason = REASONS[b.reason] ? b.reason : 'other';
  await db(env, 'PATCH', 'stops?id=eq.' + st.id, { status: 'cant', reason, note: clean(b.note, 500) || null, done_at: new Date().toISOString() }, 'return=minimal');
  await dropOnWayText(env, st.id);
  await queueText(env, st.customer, st.id, 'cant', st.code, reason);
  await advance(env, st.route.id);
  return crewToday(s, env);
}
async function crewEnd(s, env) {
  const r = await myRoute(s, env);
  if (r) await db(env, 'PATCH', 'routes?id=eq.' + r.id, { status: 'done', ended_at: new Date().toISOString() }, 'return=minimal');
  return crewToday(s, env);
}

/* ---------- office ---------- */
/* =====================================================================================================
   Week planner. A day's route is put in driving order by planDay. This part decides WHICH day and WHICH scooper
   each yard gets, so every scooper has a full, tight day and nobody gets more yards than they can do.
   STOPS_PER_DAY (default 30) is how many yards one scooper does in a day. WORK_DAYS (default 1,2,3,4,5) are the days we scoop.
   ===================================================================================================== */
// The office saves the yard limit and the working days in the settings table. Saved values win over the Cloudflare settings.
async function withSettings(env) {
  try {
    const rows = await db(env, 'GET', 'settings?select=key,value');
    const set = Object.fromEntries((rows || []).map((r) => [r.key, r.value]));
    if (!set.stops_per_day && !set.work_days && !set.route_start) return env;
    return Object.assign({}, env, set.stops_per_day ? { STOPS_PER_DAY: set.stops_per_day } : {}, set.work_days ? { WORK_DAYS: set.work_days } : {},
      set.route_start ? { ROUTE_START: set.route_start, ROUTE_START_LABEL: set.route_start_label || '' } : {});
  } catch (e) { return env; }
}
async function officeSettings(env, b) {
  if (b) {
    const rows = [];
    if (b.cap != null) rows.push({ key: 'stops_per_day', value: String(dayCap({}, b.cap)), updated_at: new Date().toISOString() });
    if (b.days != null) rows.push({ key: 'work_days', value: workDays({}, Array.isArray(b.days) ? b.days.join(',') : b.days).join(','), updated_at: new Date().toISOString() });
    // Where the truck starts each day. The office types the address, we save its map pin. Routes and the week plan start there.
    if (b.start != null) {
      const label = clean(b.start, 200);
      const pin = label ? await geocodeLine(/\b(AZ|Arizona)\b/i.test(label) ? label : label + ', AZ') : null;
      if (label && !pin) return fail(400, 'We could not find that address. Type the street, the city and the ZIP.');
      rows.push({ key: 'route_start', value: pin ? pin.lat + ',' + pin.lng : '', updated_at: new Date().toISOString() }, { key: 'route_start_label', value: label, updated_at: new Date().toISOString() });
    }
    if (rows.length) await db(env, 'POST', 'settings?on_conflict=key', rows, 'resolution=merge-duplicates,return=minimal');
    env = await withSettings(Object.assign({}, env, b.start != null ? { ROUTE_START: '', ROUTE_START_LABEL: '' } : {}));
  }
  return ok({ cap: dayCap(env), days: workDays(env).join(','), start: routeStart(env) ? env.ROUTE_START_LABEL || env.ROUTE_START : '' });
}
function dayCap(env, v) { const n = Math.round(Number(v) || Number(env.STOPS_PER_DAY) || 30); return Math.min(80, Math.max(5, n)); }
function workDays(env, v) {
  const d = [...new Set(String(v || env.WORK_DAYS || '1,2,3,4,5').split(',').map((x) => parseInt(x, 10)).filter((x) => x >= 0 && x <= 6))].sort();
  return d.length ? d : [1, 2, 3, 4, 5];
}
// Supabase hands back 1,000 rows at most, so big lists are read a page at a time.
async function dbAll(env, pathq) {
  const out = [];
  for (let off = 0; off < 50000; off += 1000) {
    const rows = await db(env, 'GET', pathq + '&limit=1000&offset=' + off);
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}
const WEEK_FIELDS = 'id,email,name,plan,address,zip,lat,lng,service_day,service_day2,eow_week,scooper_id,status';
const weekRows = (env, more) => dbAll(env, 'customers?status=in.(trialing,active,past_due,paused)&select=' + WEEK_FIELDS + (more || '') + '&order=id');
const visitLoad = (c) => (c.plan === 'eow' ? 0.5 : 1);
// The second day for a twice a week yard: about half a week after the first.
// Yards a scooper really visits on one day: every other week yards only come up on their own week.
const weekYards = (mine) => { const e = mine.filter((c) => c.plan === 'eow'); const odd = e.filter((c) => c.eow_week === 1).length; return mine.length - e.length + Math.max(odd, e.length - odd); };
const pairDay = (days, i) => days[(i + Math.ceil(days.length / 2)) % days.length];

// A new yard joins the closest yards (within 4 miles) whose day still has room.
function nearSlot(others, pin, plan, cap, days) {
  if (!others.length) return null;
  const load = {};
  const key = (d, s) => d + '|' + (s || '');
  for (const o of others) {
    load[key(o.service_day, o.scooper_id)] = (load[key(o.service_day, o.scooper_id)] || 0) + visitLoad(o);
    if (o.service_day2 != null) load[key(o.service_day2, o.scooper_id)] = (load[key(o.service_day2, o.scooper_id)] || 0) + 1;
  }
  const w = plan === 'eow' ? 0.5 : 1;
  const close = others.map((o) => [miles(pin, o), o]).filter((x) => x[0] <= 4).sort((a, b) => a[0] - b[0]);
  const seen = new Set();
  for (const [, o] of close) {
    const k = key(o.service_day, o.scooper_id);
    if (seen.has(k)) continue;
    seen.add(k);
    if ((load[k] || 0) + w > cap) continue;
    const out = { service_day: o.service_day, scooper_id: o.scooper_id || null };
    if (plan === 'eow') { const same = others.filter((x) => x.plan === 'eow' && key(x.service_day, x.scooper_id) === k); out.eow_week = same.filter((x) => !x.eow_week).length <= same.length / 2 ? 0 : 1; }
    if (plan === 'twice' && days.length > 1) {
      const i = days.indexOf(o.service_day);
      out.service_day2 = i < 0 ? days.find((d) => d !== o.service_day) : pairDay(days, i);
      if (out.service_day2 === out.service_day) delete out.service_day2;
    }
    return out;
  }
  return null;
}

// What one more service day costs, in road miles: the drive out and the extra day on the road. A week only gets
// another day when splitting saves more driving than this.
const DAY_COST = 6;
// Joe's rule is town days. A day that mixes two towns has to save at least this many road miles to be picked over town days.
const MIX_COST = 8;
// A day needs at least this many yards to be worth the drive, unless the whole week is smaller than that.
const DAY_MIN = 5;
// One day's yards in driving order, as [lat, lng, id]. The planner screen draws these on the map and lists them.
function slotPts(here, start) { return shortOrder(here, start || null).filter(pinned).map((c) => [Math.round(c.lat * 1e5) / 1e5, Math.round(c.lng * 1e5) / 1e5, c.id]); }
// Swaps each yard id for the words the office reads, and adds what the map needs.
function weekView(env, out, label) {
  for (const x of out.slots) if (x.pts) x.pts = x.pts.map((p) => [p[0], p[1], label[p[2]] || '']);
  if (env.GOOGLE_MAPS_BROWSER_KEY) out.mapsKey = env.GOOGLE_MAPS_BROWSER_KEY;
  out.start = routeStart(env);
  return out;
}
// The towns in a group of yards, biggest first: "Buckeye" or "Buckeye, Goodyear".
function townsOf(list) {
  const n = {};
  for (const c of list) { const z = ZIPS[c.zip]; if (z) n[z.name] = (n[z.name] || 0) + 1; }
  return Object.keys(n).sort((a, b) => n[b] - n[a]).join(', ');
}
// The whole week from scratch.
// 1. One long drive is drawn through every yard.
// 2. That drive is cut into one part of town for each scooper, each with the same amount of work.
// 3. Inside a part of town the yards are dealt out to days, so every day is about the same size and never over `cap`.
// Twice a week yards get two days with a gap (Monday and Thursday, Tuesday and Friday, and so on).
function weekPlan(list, staff, cap, days, start) {
  const pins = list.filter(pinned), noPin = list.filter((c) => !pinned(c));
  const tour = shortOrder(pins, null);
  const D = days.length;
  const need = (c) => (c.plan === 'twice' && D > 1 ? 2 : visitLoad(c));
  const total = pins.reduce((n, c) => n + need(c), 0);
  const techs0 = Math.max(1, Math.ceil(total / Math.max(1, D * cap - 2)));
  const share = total / techs0;
  const lands = [[]];
  let acc = 0;
  for (const c of tour) {
    if (acc + need(c) > share + 1e-9 && lands.length < techs0) { lands.push([]); acc = 0; }
    lands[lands.length - 1].push(c);
    acc += need(c);
  }
  const gap = (a, b) => Math.min(Math.abs(a - b), 7 - Math.abs(a - b));
  const set = {}, slots = [];
  // Road miles for one day. When we know where the truck starts, the drive out and the drive home count too.
  const dayMiles = (here) => {
    const order = shortOrder(here, start || null), pins = order.filter(pinned);
    return pathMiles(order) + (start && pins.length ? (miles(start, pins[0]) + miles(pins[pins.length - 1], start)) * 1.35 : 0);
  };
  // With a known start the real drive out and back prices an extra day, so only a small fixed cost is added on top.
  const extra = start ? 2 : DAY_COST;
  // One try at a scooper's week with `n` days. Twice a week yards go first, on two days with a gap.
  // Then the once a week yards, which sit in driving order, are cut into days. The cuts land on the long hops
  // between towns, so a day stays in one part of town when it can ("today is a Buckeye day"). No day goes over `cap`.
  // `even` is the older way: days of about the same size. It is the fallback when the cut cannot fit everyone.
  const tryDays = (twice, single, work, n, even, pick) => {
    const use = n === 1 ? [days[0]] : Array.from({ length: n }, (_, k) => days[Math.round(k * (D - 1) / (n - 1))]);
    let pairs = [];
    for (let k = 0; k < n; k++) { const a = k, b = (k + Math.ceil(n / 2)) % n; if (a !== b && gap(use[a], use[b]) >= 2 && !pairs.some((p) => (p[0] === b && p[1] === a) || (p[0] === a && p[1] === b))) pairs.push([a, b]); }
    if (!pairs.length && n > 1) pairs = [[0, n - 1]];
    const load = new Array(n).fill(0), puts = [], spill = [];
    const put = (c, a, b) => { load[a] += b == null ? visitLoad(c) : 1; if (b != null) load[b] += 1; puts.push([c, a, b]); };
    twice.forEach((c, k) => { const p = pick ? pick(c, pairs, load) : pairs[Math.min(pairs.length - 1, Math.floor(k * pairs.length / twice.length))]; if (p && load[p[0]] + 1 <= cap && load[p[1]] + 1 <= cap) put(c, p[0], p[1]); else spill.push(c); });
    if (even) {
      const goal = work / n;
      let d = 0;
      for (const c of single) {
        const w = visitLoad(c);
        while (d < n - 1 && load[d] + w > goal + 0.5) d++;
        if (load[d] + w <= cap) { put(c, d, null); continue; }
        const free = load.map((v, k) => [v, k]).sort((x, y) => x[0] - y[0])[0];
        if (free[0] + w <= cap) put(c, free[1], null); else spill.push(c);
      }
    } else {
      const m = single.length, PW = new Float64Array(m + 1), PL = new Float64Array(m + 1);
      for (let i = 0; i < m; i++) { PW[i + 1] = PW[i] + visitLoad(single[i]); PL[i + 1] = i ? PL[i] + miles(single[i - 1], single[i]) * 1.35 : 0; }
      const inner = (j, i) => (i - j >= 2 ? PL[i] - PL[j + 1] : 0); // road miles inside yards j to i-1
      const dp = [], from = [];
      for (let k = 0; k <= n; k++) { dp.push(new Float64Array(m + 1).fill(Infinity)); from.push(new Int32Array(m + 1).fill(-1)); }
      dp[0][0] = 0;
      for (let k = 1; k <= n; k++) for (let i = 0; i <= m; i++) for (let j = i; j >= 0 && PW[i] - PW[j] <= cap - load[k - 1] + 1e-9; j--) {
        if (dp[k - 1][j] === Infinity) continue;
        if (i > j && PW[i] - PW[j] + load[k - 1] < Math.min(DAY_MIN, work) - 1e-9) continue;
        const v = dp[k - 1][j] + inner(j, i) + (i > j || load[k - 1] > 0 ? DAY_COST : 0);
        if (v < dp[k][i] - 1e-9) { dp[k][i] = v; from[k][i] = j; }
      }
      if (dp[n][m] === Infinity) return { spill: single.concat(spill), cost: Infinity };
      const cut = new Array(n + 1).fill(0);
      cut[n] = m;
      for (let k = n; k >= 1; k--) cut[k - 1] = from[k][cut[k]];
      for (let k = 0; k < n; k++) for (let i = cut[k]; i < cut[k + 1]; i++) put(single[i], k, null);
    }
    let cost = 0;
    for (let k = 0; k < n; k++) { const here = puts.filter((x) => x[1] === k || x[2] === k).map((x) => x[0]); if (here.length) cost += dayMiles(here) + extra + MIX_COST * (new Set(here.map((c) => (ZIPS[c.zip] || {}).area || c.zip)).size - 1); }
    return { n, use, puts, spill, cost };
  };
  for (let t = 0; t < lands.length; t++) {
    const mine = lands[t];
    if (!mine.length) continue;
    const work = mine.reduce((n, c) => n + need(c), 0), twice = mine.filter((c) => need(c) === 2), single = mine.filter((c) => need(c) !== 2);
    // The fewest days that fit the work. More days are used only when that saves real driving.
    const least = Math.min(D, Math.max(Math.ceil(work / cap), twice.length ? 2 : 1));
    let best = null;
    for (let n = least; n <= D; n++) {
      let r = tryDays(twice, single, work, n, false);
      if (r.spill.length) continue;
      if (twice.length) {
        // Second pass: each twice a week yard moves to the two days whose other yards are closest to it, then the days are cut again.
        const dayOf = (k) => r.puts.filter((x) => x[2] == null && x[1] === k).map((x) => x[0]);
        const groups = Array.from({ length: n }, (_, k) => dayOf(k));
        const nearTo = (c, g) => (g.length ? g.reduce((m, o) => Math.min(m, miles(c, o)), Infinity) : 3);
        const r2 = tryDays(twice, single, work, n, false, (c, pairs, load) => pairs.filter((p) => load[p[0]] + 1 <= cap && load[p[1]] + 1 <= cap)
          .sort((x, y) => nearTo(c, groups[x[0]]) + nearTo(c, groups[x[1]]) - nearTo(c, groups[y[0]]) - nearTo(c, groups[y[1]]))[0]);
        if (!r2.spill.length && r2.cost < r.cost - 1e-9) r = r2;
      }
      if (!best || r.cost < best.cost - 1e-9) best = r;
    }
    if (!best) best = tryDays(twice, single, work, least, true);
    const { n, use, puts, spill } = best, eow = new Array(n).fill(0);
    for (const [c, a, b] of puts) set[c.id] = { t, a, b, service_day: use[a], service_day2: b == null ? null : use[b], eow_week: c.plan === 'eow' ? (eow[a]++ % 2) : null };
    if (spill.length) lands.push(spill); // more work than this scooper's week holds: it becomes one more route
    for (let k = 0; k < n; k++) {
      const here = mine.filter((c) => set[c.id] && set[c.id].t === t && (set[c.id].a === k || set[c.id].b === k));
      if (!here.length) continue;
      const who = staff[t];
      slots.push({ day: use[k], dayName: DAYS[use[k]], tech: t + 1, staffId: who ? who.id : null, name: who ? who.name : 'Open route ' + (t + 1 - staff.length),
        yards: weekYards(here.map((c) => ({ plan: c.plan, eow_week: set[c.id].eow_week }))), homes: here.length, towns: townsOf(here), miles: Math.round(dayMiles(here) * 10) / 10, minutes: Math.round(roadMin(dayMiles(here)) + weekYards(here.map((c) => ({ plan: c.plan, eow_week: set[c.id].eow_week }))) * YARD_MIN), pts: slotPts(here, start) });
    }
  }
  for (const c of tour) set[c.id].scooper_id = (staff[set[c.id].t] || {}).id || null;
  return { set, slots, techs: lands.filter((x) => x.length).length, noPin: noPin.length, cap, days };
}
function weekSummary(p, staffCount, rows) {
  const most = p.slots.reduce((n, x) => Math.max(n, x.yards), 0);
  return { cap: p.cap, days: p.days.map((d) => DAYS[d]), customers: rows, techsNeeded: p.techs, techsHave: staffCount, hire: Math.max(0, p.techs - staffCount),
    routes: p.slots.length, biggestDay: most, weekMiles: Math.round(p.slots.reduce((n, x) => n + x.miles, 0) * 10) / 10, noPin: p.noPin, slots: p.slots };
}
function dayMail(c, moved) {
  const next = nextVisit(c);
  return [hi(c.name), '',
    (moved ? 'We changed your schedule. Your new service day is ' : 'Your service day is ') + schedSay(c) + '.' + (next ? ' Your next visit is ' + dateSay(next) + '.' : ''),
    'The night before each visit we send you a reminder with a 30 minute window and a link to watch our truck.',
    'You can see your next visits any time in My Yard: https://arizonapetwaste.com/account/', '',
    'Questions? Call or text 623.309.6104.', '', 'Arizona Pet Waste'].join('\n');
}
async function mailMany(env, list) {
  if (!env.RESEND_API_KEY) return 0;
  const from = env.MAIL_FROM || 'Arizona Pet Waste <info@arizonapetwaste.com>';
  let sent = 0;
  for (let i = 0; i < list.length; i += 100) {
    try {
      const r = await fetch('https://api.resend.com/emails/batch', { method: 'POST', headers: { authorization: 'Bearer ' + env.RESEND_API_KEY, 'content-type': 'application/json' },
        body: JSON.stringify(list.slice(i, i + 100).map((x) => ({ from, to: [x.to], subject: x.subject, text: x.text, reply_to: env.NOTIFY_EMAIL || 'info@arizonapetwaste.com' }))) });
      if (r.ok) sent += Math.min(100, list.length - i); else console.error('batch mail failed', r.status);
    } catch (e) { console.error('batch mail failed', e); }
  }
  return sent;
}
// Office: plan the week. mode "new" only places yards that have no day yet (nobody moves). mode "all" rebuilds the whole
// week, which moves people, so every moved customer gets an email with the new day. apply: false only shows the result.
async function officeWeek(env, b) {
  const cap = dayCap(env, b.cap), days = workDays(env, Array.isArray(b.days) ? b.days.join(',') : b.days);
  const all = await weekRows(env);
  const team = await db(env, 'GET', 'staff?active=is.true&select=id,name,role,scoops&order=created_at');
  const staff = team.filter(runsRoute).length ? team.filter(runsRoute) : team.slice(0, 1);
  const placed = all.filter((c) => c.service_day != null && pinned(c));
  const mode = b.mode === 'all' || !placed.length ? 'all' : 'new';
  const change = [];
  let plan;
  if (mode === 'all') {
    plan = weekPlan(all, staff, cap, days, routeStart(env));
    for (const c of all) { const a = plan.set[c.id]; if (a && (a.service_day !== c.service_day || (a.service_day2 ?? null) !== (c.service_day2 ?? null) || (a.scooper_id || null) !== (c.scooper_id || null) || (c.plan === 'eow' && a.eow_week !== c.eow_week))) change.push([c, a]); }
  } else {
    const have = placed.slice();
    for (const c of all.filter((x) => x.service_day == null && pinned(x))) {
      let a = nearSlot(have, c, c.plan, cap, days);
      if (!a) { // no close day has room: open the lightest day for the closest scooper
        const near = have.slice().sort((x, y) => miles(c, x) - miles(c, y))[0];
        const sid = near ? near.scooper_id || null : (staff[0] || {}).id || null;
        const count = (d) => have.filter((x) => (x.scooper_id || null) === sid && (x.service_day === d || x.service_day2 === d)).length;
        const d = days.slice().sort((x, y) => count(x) - count(y))[0];
        a = { service_day: d, scooper_id: sid };
        if (c.plan === 'eow') a.eow_week = 0;
        if (c.plan === 'twice' && days.length > 1) a.service_day2 = pairDay(days, days.indexOf(d));
      }
      change.push([c, a]);
      have.push(Object.assign({}, c, a));
    }
    const final = all.map((c) => { const hit = change.find((x) => x[0].id === c.id); return hit ? Object.assign({}, c, hit[1]) : c; }).filter((c) => c.service_day != null && pinned(c));
    const keys = [...new Set(final.flatMap((c) => [c.service_day + '|' + (c.scooper_id || '')].concat(c.service_day2 != null ? [c.service_day2 + '|' + (c.scooper_id || '')] : [])))];
    const slots = keys.map((k) => { const [d, sid] = k.split('|'); const mine = final.filter((c) => (c.scooper_id || '') === sid && (String(c.service_day) === d || String(c.service_day2) === d)); const who = team.find((t) => t.id === sid);
      return { day: Number(d), dayName: DAYS[Number(d)], staffId: sid || null, name: who ? who.name : 'No scooper yet', yards: weekYards(mine), homes: mine.length, towns: townsOf(mine), pts: slotPts(mine, routeStart(env)), miles: Math.round(pathMiles(shortOrder(mine, null)) * 10) / 10 }; })
      .sort((x, y) => String(x.name).localeCompare(String(y.name)) || x.day - y.day);
    plan = { slots, techs: new Set(slots.map((x) => x.staffId)).size, noPin: all.filter((c) => !pinned(c)).length, cap, days };
  }
  const out = Object.assign(weekSummary(plan, staff.length, all.length), { mode, applied: false, changes: change.length, moved: change.filter((x) => x[0].service_day != null).length, overCap: plan.slots.filter((x) => x.yards > cap).length });
  weekView(env, out, Object.fromEntries(all.map((c) => [c.id, [c.name, c.address].filter(Boolean).join(' · ')])));
  if (!b.apply || !change.length) return ok(out);
  const now = new Date().toISOString();
  for (let i = 0; i < change.length; i += 500) {
    await db(env, 'POST', 'customers?on_conflict=id', change.slice(i, i + 500).map(([c, a]) => ({ id: c.id, email: c.email, service_day: a.service_day, service_day2: a.service_day2 ?? null,
      eow_week: c.plan === 'eow' ? (a.eow_week ?? 0) : null, scooper_id: a.scooper_id || null, stop_order: null, updated_at: now })), 'resolution=merge-duplicates,return=minimal');
  }
  const movedIds = change.filter((x) => x[0].service_day != null).map((x) => x[0].id);
  for (let i = 0; i < movedIds.length; i += 100) await db(env, 'DELETE', 'stops?status=in.(scheduled,skipped)&day=gt.' + azToday() + '&customer_id=in.(' + movedIds.slice(i, i + 100).join(',') + ')', null, 'return=minimal').catch((e) => console.error('week cleanup', e));
  // Joe, Nov 21, 2026: only a customer whose day AND time are set hears about it. A yard that just got its first day
  // here has no time yet, so it hears nothing until the office sets one on the customer card.
  try { const t = await schedNoticeMany(env, change.map((x) => x[0].id), movedIds); out.emailed = t.emailed; out.texted = t.texted; }
  catch (e) { console.error('week notices', e); out.emailed = 0; out.texted = 0; }
  out.applied = true;
  return ok(out);
}
// A sample week anyone can look at: made up yards across our ZIP codes, planned by the same code the office uses. Nothing is saved.
// The sample week is the same every time for the same numbers, so each answer is worked out once and kept. A stranger
// hammering this open address cannot make the server plan a thousand yards over and over.
const demoMemo = new Map();
function demoWeek(env, q) {
  const n = Math.min(1000, Math.max(20, parseInt(q.get('n'), 10) || 500)), cap = dayCap(env, q.get('cap')), days = workDays(env, q.get('days'));
  const memoKey = [n, cap, days.join('')].join('|');
  if (demoMemo.has(memoKey)) return new Response(demoMemo.get(memoKey), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=300' } });
  const BOX = [['85326', 0.30, 33.36, 33.44, -112.62, -112.50], ['85396', 0.16, 33.47, 33.52, -112.54, -112.47], ['85338', 0.20, 33.40, 33.46, -112.42, -112.34],
    ['85395', 0.14, 33.46, 33.50, -112.42, -112.36], ['85340', 0.10, 33.48, 33.52, -112.38, -112.33], ['85355', 0.10, 33.54, 33.60, -112.48, -112.40]];
  let seed = 7;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const list = [];
  for (const [zip, share, la0, la1, lo0, lo1] of BOX) for (let i = 0; i < Math.round(n * share); i++) {
    const k = list.length;
    list.push({ id: 'd' + k, zip, plan: ['week', 'week', 'week', 'eow', 'twice'][k % 5], lat: la0 + rnd() * (la1 - la0), lng: lo0 + rnd() * (lo1 - lo0) });
  }
  const p = weekPlan(list, [], cap, days);
  p.slots.forEach((x) => { x.name = 'Tech ' + x.tech; });
  const oneDay = {};
  for (const c of list) { const a = (ZIPS[c.zip] || {}).area; (oneDay[a] = oneDay[a] || []).push(c); }
  const names = {};
  list.forEach((c, k) => { names[c.id] = 'Yard ' + (k + 1) + ' · ' + ((ZIPS[c.zip] || {}).name || c.zip) + (c.plan === 'twice' ? ' · twice a week' : c.plan === 'eow' ? ' · every other week' : ''); });
  const body = JSON.stringify(Object.assign(weekView(env, weekSummary(p, 0, list.length), names), { sample: true, mode: 'all', oldWay: { biggestDay: Math.max(...Object.values(oneDay).map((x) => x.length)), note: 'One day for each area, one scooper' } }));
  if (demoMemo.size < 60) demoMemo.set(memoKey, body);
  return new Response(body, { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=300' } });
}

async function defaultScooper(env) {
  const team = await db(env, 'GET', 'staff?active=is.true&select=id,role,scoops&order=created_at');
  return (team.find(runsRoute) || team.find((t) => t.role === 'owner') || team[0] || {}).id || null;
}
// Builds the routes for a day from each yard's service day. Safe to press again: it only adds what is missing.
// Shortest driving order for a day's stops: start at the yard (ROUTE_START = "lat,lng") or at one end of the group,
// always go to the closest stop next, then untangle any crossed legs (2-opt). Stops with no map pin go last.
function routeStart(env) {
  const m = /^\s*(-?\d+(\.\d+)?)\s*,\s*(-?\d+(\.\d+)?)\s*$/.exec(String(env.ROUTE_START || ''));
  return m ? { lat: Number(m[1]), lng: Number(m[3]) } : null;
}
const pinned = (c) => c.lat != null && c.lng != null;
function pathMiles(list) {
  const p = list.filter(pinned);
  let n = 0;
  for (let i = 1; i < p.length; i++) n += miles(p[i - 1], p[i]);
  return n * 1.35;
}
function shortOrder(list, start) {
  const pins = list.filter(pinned), rest = list.filter((c) => !pinned(c));
  if (pins.length < 3 && !start) return pins.concat(rest);
  // Point 0 is where the truck starts. Every distance is worked out once, so a day with hundreds of stops still plans fast.
  let from = start;
  if (!from) {
    const mid = { lat: pins.reduce((n, c) => n + c.lat, 0) / pins.length, lng: pins.reduce((n, c) => n + c.lng, 0) / pins.length };
    from = pins.reduce((a, c) => (miles(mid, c) > miles(mid, a) ? c : a), pins[0]);
  }
  const pts = [from].concat(pins.filter((c) => c !== from)), n = pts.length;
  const D = new Float64Array(n * n);
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) D[a * n + b] = D[b * n + a] = miles(pts[a], pts[b]);
  const tour = [0], used = new Uint8Array(n);
  used[0] = 1;
  for (let k = 1; k < n; k++) {
    const at = tour[k - 1];
    let best = -1;
    for (let c = 1; c < n; c++) if (!used[c] && (best < 0 || D[at * n + c] < D[at * n + best])) best = c;
    used[best] = 1;
    tour.push(best);
  }
  // 2-opt: flip a stretch of the route when that makes it shorter. The start stays first and the route does not loop back.
  for (let again = true, pass = 0; again && pass < 60; pass++) {
    again = false;
    for (let i = 1; i < n - 1; i++) for (let j = i + 1; j < n; j++) {
      const a = tour[i - 1], b = tour[i], c = tour[j], d = j + 1 < n ? tour[j + 1] : -1;
      const gain = D[a * n + b] + (d < 0 ? 0 : D[c * n + d]) - D[a * n + c] - (d < 0 ? 0 : D[b * n + d]);
      if (gain > 1e-9) { for (let x = i, y = j; x < y; x++, y--) { const t = tour[x]; tour[x] = tour[y]; tour[y] = t; } again = true; }
    }
  }
  const out = tour.map((k) => pts[k]);
  return (start ? out.slice(1) : out).concat(rest);
}
async function planDay(env, day) {
  const wd = weekday(day);
  const all = await db(env, 'GET', 'customers?status=in.(' + PAYING.join(',') + ')&or=(service_day.eq.' + wd + ',service_day2.eq.' + wd + ')' +
    '&select=id,status,plan,eow_week,scooper_id,stop_order,pause_from,pause_until,first_visit,address,lat,lng');
  // A card that failed keeps the customer off new routes until Stripe gets paid. The office sees how many.
  const rows = all.filter((c) => c.status !== 'past_due');
  const unpaid = all.length - rows.length;
  const skipped = await skippedOn(env, day);
  const due = rows.filter((c) => {
    if (skipped.has(c.id)) return false;
    if (c.plan === 'eow' && weekParity(day) !== (c.eow_week || 0)) return false;
    if (c.pause_from && c.pause_from <= day && (!c.pause_until || c.pause_until >= day)) return false;
    if (c.first_visit && day < c.first_visit) return false;
    return true;
  });
  const fallback = await defaultScooper(env);
  const have = new Set((await db(env, 'GET', 'stops?day=eq.' + day + '&select=customer_id')).map((x) => x.customer_id));
  const todo = due.filter((c) => !have.has(c.id) && (c.scooper_id || fallback));
  if (todo.length && await schedOn(env)) {
    for (let i = 0; i < todo.length; i += 100) {
      const tm = Object.fromEntries((await db(env, 'GET', 'customers?id=in.(' + todo.slice(i, i + 100).map((c) => c.id).join(',') + ')&select=id,service_day,service_day2,service_time,service_time2')).map((r) => [r.id, r]));
      for (const c of todo.slice(i, i + 100)) c._t = timeOn(tm[c.id], wd);
    }
  }
  const staffIds = [...new Set(todo.map((c) => c.scooper_id || fallback))];
  if (staffIds.length) await db(env, 'POST', 'routes?on_conflict=day,staff_id', staffIds.map((id) => ({ day, staff_id: id })), 'resolution=ignore-duplicates,return=minimal');
  const routes = await db(env, 'GET', 'routes?day=eq.' + day + '&select=id,staff_id,status');
  const routeOf = Object.fromEntries(routes.map((r) => [r.staff_id, r.id]));
  // Stops with a stop order set by the office keep it. Every other stop is put in the shortest driving order for its scooper.
  const sorted = [];
  let milesSaved = 0, routeMiles = 0;
  for (const sid of staffIds) {
    const mine = todo.filter((c) => (c.scooper_id || fallback) === sid);
    const fixed = mine.filter((c) => c.stop_order != null).sort((a, b) => a.stop_order - b.stop_order);
    // A yard with a set time goes in time order. A yard with no time yet goes after, in the shortest driving order.
    const timed = mine.filter((c) => c.stop_order == null && c._t).sort((a, b) => toMin(a._t) - toMin(b._t));
    const free = mine.filter((c) => c.stop_order == null && !c._t).sort((a, b) => String(a.address).localeCompare(String(b.address)));
    const best = shortOrder(free, routeStart(env));
    milesSaved += pathMiles(free) - pathMiles(best);
    routeMiles += pathMiles(fixed.concat(timed, best));
    sorted.push(...fixed, ...timed, ...best);
  }
  if (sorted.length) {
    await db(env, 'POST', 'stops?on_conflict=day,customer_id', sorted.map((c, i) => ({
      route_id: routeOf[c.scooper_id || fallback], customer_id: c.id, day, position: (c.stop_order ?? (c._t ? 5000 + toMin(c._t) : 9000 + i)), code: newCode()
    })), 'resolution=ignore-duplicates,return=minimal');
    // A new customer added to a route that already had yards: put the whole waiting route back in the best driving order,
    // so the new yard lands where it belongs and is not tacked on the end. A route that is already live is left alone.
    for (const r of routes) {
      if (r.status && r.status !== 'planned') continue;
      const mine = sorted.filter((c) => routeOf[c.scooper_id || fallback] === r.id).length;
      if (mine && have.size) await reorderRoute(env, r.id).catch((e) => console.error('reorder', e));
    }
  }
  return { ok: true, day, added: sorted.length, due: due.length, noScooper: due.filter((c) => !have.has(c.id) && !c.scooper_id && !fallback).length,
    routeMiles: Math.round(routeMiles * 10) / 10, milesSaved: Math.round(milesSaved * 10) / 10, unpaid,
    overCap: staffIds.filter((sid) => sorted.filter((c) => (c.scooper_id || fallback) === sid).length > dayCap(env)).length };
}
async function lastPings(env, routeIds) {
  const out = {};
  for (const id of routeIds) {
    const p = (await db(env, 'GET', 'positions?route_id=eq.' + id + '&select=lat,lng,at&order=at.desc&limit=1'))[0];
    if (p) out[id] = p;
  }
  return out;
}
async function officeDay(env, date) {
  const day = isDay(date) ? date : azToday();
  const routes = await db(env, 'GET', 'routes?day=eq.' + day + '&select=*,staff:staff(id,name)&order=id');
  const stops = await db(env, 'GET', 'stops?day=eq.' + day + '&select=id,route_id,position,status,reason,note,photo_path,no_photo,code,on_way_at,arrived_at,done_at,' +
    'customer:customers(id,name,phone,address,zip,area,dogs,texts_visit)&order=position,id');
  // Booked houses the office still has to schedule: no day yet, or a day with no time. Nobody is told until both are set.
  const timesOn = await schedOn(env);
  const needDay = await db(env, 'GET', 'customers?status=in.(' + PAYING.join(',') + ')' + (timesOn ? '&or=(service_day.is.null,service_time.is.null)' : '&service_day=is.null') + '&select=id,name,address,zip,area,plan,dogs,service_day,created_at&order=created_at');
  const times = await timesOf(env, stops.map((x) => ({ id: x.id, day, customer_id: x.customer && x.customer.id }))).catch(() => ({}));
  const queued = await db(env, 'GET', 'messages?status=eq.queued&select=id');
  const pings = await lastPings(env, routes.filter((r) => r.status === 'live').map((r) => r.id));
  return ok({ day, dayName: DAYS[weekday(day)], today: azToday(), routes, stops, times, timesOn, needDay, queuedTexts: queued.length, pings, cap: dayCap(await withSettings(env)) });
}
async function renumber(env, routeId) {
  const list = await db(env, 'GET', 'stops?route_id=eq.' + routeId + '&select=id,position&order=position,id');
  for (let i = 0; i < list.length; i++) if (list[i].position !== i + 1) await db(env, 'PATCH', 'stops?id=eq.' + list[i].id, { position: i + 1 }, 'return=minimal');
  return list.map((x, i) => ({ id: x.id, position: i + 1 }));
}
// Puts a route's waiting stops in the shortest driving order again. Stops already started or finished keep their place.
async function reorderRoute(env, routeId) {
  const list = await db(env, 'GET', 'stops?route_id=eq.' + routeId + '&select=id,route_id,customer_id,day,code,status,position,customer:customers(lat,lng,address,stop_order)&order=position,id');
  const fixed = list.filter((x) => x.status !== 'scheduled'), wait = list.filter((x) => x.status === 'scheduled');
  if (!wait.length) return;
  // A yard the office gave a set place (stop order) keeps it and goes first. Everything else is put in the shortest order.
  const set = wait.filter((x) => x.customer && x.customer.stop_order != null).sort((x, y) => x.customer.stop_order - y.customer.stop_order);
  // Then the yards with a set time, in time order. Then everything else in the shortest driving order.
  const times = await timesOf(env, wait).catch(() => ({}));
  const timed = wait.filter((x) => !(x.customer && x.customer.stop_order != null) && times[x.id]).sort((x, y) => toMin(times[x.id]) - toMin(times[y.id]) || x.id - y.id);
  const free = wait.filter((x) => !(x.customer && x.customer.stop_order != null) && !times[x.id]);
  const order = set.concat(timed).map((x) => ({ row: x })).concat(shortOrder(free.map((x) => ({ row: x, lat: x.customer && x.customer.lat, lng: x.customer && x.customer.lng })), routeStart(env)));
  const base = fixed.reduce((n, x) => Math.max(n, x.position < 9000 ? x.position : 0), 0);
  // One write for the whole route. A stop is found by its day and customer, which is unique.
  await db(env, 'POST', 'stops?on_conflict=day,customer_id', order.map((o, i) => ({ route_id: o.row.route_id, customer_id: o.row.customer_id, day: o.row.day, code: o.row.code, position: base + i + 1 })), 'resolution=merge-duplicates,return=minimal');
}
// How many yards each of the next 7 days holds for one scooper, so the office can see where there is room before moving yards.
// A day with routes built counts its stops. A day not built yet counts the yards whose service day it is.
async function officeLoads(env, from, staffId, idList) {
  const start = isDay(from) ? from : azToday(), days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const fallback = await defaultScooper(env), sid = staffId || fallback;
  const stops = await db(env, 'GET', 'stops?day=gte.' + days[0] + '&day=lte.' + days[6] + '&select=id,day,status,customer_id,route:routes(staff_id),customer:customers(lat,lng)');
  const cust = await dbAll(env, 'customers?status=in.(trialing,active)&service_day=not.is.null&select=id,plan,eow_week,scooper_id,service_day,service_day2,pause_from,pause_until,first_visit,lat,lng&order=id');
  // The yards the office is thinking of moving. With these we can say what the move costs in miles and drive time.
  const ids = String(idList || '').split(',').map((x) => parseInt(x, 10)).filter(Boolean).slice(0, 200);
  const picked = ids.length ? await db(env, 'GET', 'stops?id=in.(' + ids.join(',') + ')&select=id,day,customer_id,customer:customers(lat,lng)') : [];
  const movePts = picked.map((x) => ({ id: x.customer_id, lat: x.customer && x.customer.lat, lng: x.customer && x.customer.lng })).filter(pinned);
  const moveSet = new Set(picked.map((x) => x.customer_id)), fromDay = (picked[0] || {}).day || null, home = routeStart(env);
  // Time in the yards being moved: 10 minutes each, 20 for a yard we have never finished a visit at.
  const served = new Set(picked.length ? (await db(env, 'GET', 'stops?status=eq.done&customer_id=in.(' + [...moveSet].join(',') + ')&select=customer_id')).map((x) => x.customer_id) : []);
  const firsts = [...moveSet].filter((id) => !served.has(id)).length, yardMin = (moveSet.size - firsts) * YARD_MIN + firsts * FIRST_MIN;
  // Road miles for one scooper's day, from the truck start and back when we know it.
  const dayMi = (list) => {
    const pins = shortOrder(list.filter(pinned), home).filter(pinned);
    if (!pins.length) return 0;
    return pathMiles(pins) + (home ? (miles(home, pins[0]) + miles(pins[pins.length - 1], home)) * 1.35 : 0);
  };
  let saves = null;
  const out = days.map((d) => {
    const built = stops.filter((x) => x.day === d), have = new Set(built.map((x) => x.customer_id)), wd = weekday(d);
    const due = cust.filter((c) => !have.has(c.id) && (c.scooper_id || fallback) === sid && (c.service_day === wd || c.service_day2 === wd) &&
      !(c.plan === 'eow' && weekParity(d) !== (c.eow_week || 0)) && !(c.pause_from && c.pause_from <= d && (!c.pause_until || c.pause_until >= d)) && !(c.first_visit && d < c.first_visit));
    const mine = built.filter((x) => x.status !== 'skipped' && x.route && x.route.staff_id === sid);
    const row = { day: d, dayName: DAYS[wd], yards: mine.length + due.length, works: workDays(env).includes(wd) };
    if (movePts.length) {
      const pts = mine.map((x) => ({ id: x.customer_id, lat: x.customer && x.customer.lat, lng: x.customer && x.customer.lng })).concat(due.map((c) => ({ id: c.id, lat: c.lat, lng: c.lng })));
      const before = dayMi(pts);
      if (d === fromDay) { const rest = dayMi(pts.filter((x) => !moveSet.has(x.id))); saves = { miles: Math.round((before - rest) * 10) / 10, driveMinutes: Math.round(roadMin(before - rest)), minutes: Math.round(roadMin(before - rest) + yardMin) }; row.miles = Math.round(before * 10) / 10; }
      else { const seen = new Set(pts.map((x) => x.id)), after = dayMi(pts.concat(movePts.filter((x) => !seen.has(x.id)))); row.miles = Math.round(before * 10) / 10; row.addMiles = Math.round((after - before) * 10) / 10; row.driveMinutes = Math.round(roadMin(after - before)); row.yardMinutes = yardMin; row.addMinutes = Math.round(roadMin(after - before) + yardMin); }
    }
    return row;
  });
  // The day that takes these yards for the least extra driving and stays under the limit.
  const fits = out.filter((x) => x.addMiles != null && x.works && x.yards + movePts.length <= dayCap(env)).sort((x, y) => x.addMiles - y.addMiles);
  return ok({ cap: dayCap(env), days: out, saves, best: fits.length ? fits[0].day : null, moving: movePts.length, firsts, yardMinutes: yardMin, rules: { mph: MPH, yard: YARD_MIN, first: FIRST_MIN } });
}
// Office: move a group of yards to another day in one go. "forever" also changes the customer's regular day.
// The old stop stays on its day as skipped with a note, so the day builder does not put the yard back.
async function officeMoveDay(env, b) {
  const ids = [...new Set((Array.isArray(b.ids) ? b.ids : []).map((x) => parseInt(x, 10)).filter(Boolean))].slice(0, 200);
  const to = isDay(b.to) ? b.to : null;
  if (!ids.length) return fail(400, 'Pick the yards to move.');
  if (!to || to < azToday()) return fail(400, 'Pick today or a later day.');
  const found = await db(env, 'GET', 'stops?id=in.(' + ids.join(',') + ')&select=id,day,status,customer_id,route:routes(id,staff_id,status),customer:customers(id,email,name,phone,texts_visit,plan,service_day,service_day2)');
  const from = (found[0] || {}).day;
  const wasTimes = await timesOf(env, found.map((x) => ({ id: x.id, day: x.day, customer_id: x.customer_id }))).catch(() => ({}));
  const list = found.filter((x) => x.status === 'scheduled' && x.day === from && x.day !== to);
  if (!list.length) return fail(400, 'Only yards that have not started can move, and only to a different day.');
  await planDay(env, to); // build the whole target day first, so its own yards are all there
  const there = new Set((await db(env, 'GET', 'stops?day=eq.' + to + '&customer_id=in.(' + list.map((x) => x.customer_id).join(',') + ')&select=customer_id')).map((x) => x.customer_id));
  const move = list.filter((x) => !there.has(x.customer_id));
  const label = DAYS[weekday(to)];
  let over = [];
  if (move.length) {
    const staffIds = [...new Set(move.map((x) => x.route.staff_id))];
    await db(env, 'POST', 'routes?on_conflict=day,staff_id', staffIds.map((id) => ({ day: to, staff_id: id })), 'resolution=ignore-duplicates,return=minimal');
    const routes = await db(env, 'GET', 'routes?day=eq.' + to + '&select=id,staff_id');
    const routeOf = Object.fromEntries(routes.map((r) => [r.staff_id, r.id]));
    await db(env, 'PATCH', 'stops?id=in.(' + move.map((x) => x.id).join(',') + ')', { status: 'skipped', note: 'Moved to ' + label }, 'return=minimal');
    await db(env, 'POST', 'stops?on_conflict=day,customer_id', move.map((x, i) => ({ route_id: routeOf[x.route.staff_id], customer_id: x.customer_id, day: to, position: 9000 + i, code: newCode() })), 'resolution=ignore-duplicates,return=minimal');
    for (const id of staffIds) await reorderRoute(env, routeOf[id]);
    if (b.forever) {
      const oldWd = weekday(from), newWd = weekday(to), now = new Date().toISOString();
      for (const x of move) {
        const c = x.customer, second = c.service_day2 === oldWd && c.service_day !== oldWd;
        if ((second ? c.service_day : c.service_day2) === newWd) continue; // a twice a week yard cannot have both visits on one day
        await db(env, 'PATCH', 'customers?id=eq.' + c.id, Object.assign(second ? { service_day2: newWd } : { service_day: newWd }, { stop_order: null, updated_at: now }), 'return=minimal');
      }
      // Later visits already built on the old day are dropped. The day builder makes them on the new day.
      await db(env, 'DELETE', 'stops?status=eq.scheduled&day=gt.' + to + '&customer_id=in.(' + move.map((x) => x.customer_id).join(',') + ')', null, 'return=minimal').catch((e) => console.error('move cleanup', e));
      await schedNoticeMany(env, move.map((x) => x.customer_id), move.map((x) => x.customer_id)).catch((e) => console.error('move notices', e));
    } else {
      // Moved for this one visit: the customer hears the new day, at the time the visit had. Only when it had a time.
      const made = await db(env, 'GET', 'stops?day=eq.' + to + '&customer_id=in.(' + move.map((x) => x.customer_id).join(',') + ')&select=id,day,code,customer_id');
      for (const x of move) {
        const st = made.find((m) => m.customer_id === x.customer_id), t = wasTimes[x.id];
        if (!st || !t) continue;
        try {
          await db(env, 'PATCH', 'stops?id=eq.' + st.id, { visit_time: t }, 'return=minimal');
          await visitNotice(env, st, x.customer, t);
        } catch (e) { console.error('move notice', e); }
      }
      for (const id of staffIds) await reorderRoute(env, routeOf[id]).catch(() => {});
    }
    const after = await db(env, 'GET', 'stops?day=eq.' + to + '&status=neq.skipped&select=id,route:routes(staff_id)');
    over = staffIds.filter((id) => after.filter((x) => x.route && x.route.staff_id === id).length > dayCap(env));
  }
  const total = (await db(env, 'GET', 'stops?day=eq.' + to + '&status=neq.skipped&select=id')).length;
  return ok({ moved: move.length, already: list.length - move.length, to, toName: label, toYards: total, cap: dayCap(env), over: over.length > 0, forever: !!b.forever, day: JSON.parse(await (await officeDay(env, from)).text()) });
}
async function officeStop(env, b) {
  const id = parseInt(b.id, 10);
  const st = id && (await db(env, 'GET', 'stops?id=eq.' + id + '&select=*,route:routes(id,day,staff_id,status)'))[0];
  if (!st) return fail(404, 'Stop not found.');
  const a = b.action;
  if (a === 'up' || a === 'down') {
    const list = await renumber(env, st.route_id);
    const i = list.findIndex((x) => x.id === st.id), j = a === 'up' ? i - 1 : i + 1;
    if (i >= 0 && j >= 0 && j < list.length) {
      await db(env, 'PATCH', 'stops?id=eq.' + list[i].id, { position: list[j].position }, 'return=minimal');
      await db(env, 'PATCH', 'stops?id=eq.' + list[j].id, { position: list[i].position }, 'return=minimal');
    }
  } else if (a === 'skip') {
    if (!['scheduled', 'on_the_way'].includes(st.status)) return fail(400, 'Only a stop that has not started can be skipped.');
    await db(env, 'PATCH', 'stops?id=eq.' + st.id, { status: 'skipped' }, 'return=minimal');
    if (st.status === 'on_the_way' && st.route.status === 'live') await advance(env, st.route_id);
  } else if (a === 'unskip') {
    if (st.status !== 'skipped') return fail(400, 'That stop is not skipped.');
    await db(env, 'PATCH', 'stops?id=eq.' + st.id, { status: 'scheduled' }, 'return=minimal');
  } else if (a === 'move') {
    if (!['scheduled', 'on_the_way'].includes(st.status)) return fail(400, 'Only a stop that has not started can move.');
    const to = (await db(env, 'GET', 'staff?id=eq.' + enc(b.staffId) + '&active=is.true&select=id'))[0];
    if (!to) return fail(400, 'Pick someone on the team.');
    await db(env, 'POST', 'routes?on_conflict=day,staff_id', [{ day: st.day, staff_id: to.id }], 'resolution=ignore-duplicates,return=minimal');
    const r = (await db(env, 'GET', 'routes?day=eq.' + st.day + '&staff_id=eq.' + to.id + '&select=id,status'))[0];
    // A moved stop gets a new link, so the old one stops working. No text goes out.
    await db(env, 'PATCH', 'stops?id=eq.' + st.id, { route_id: r.id, position: 9999, status: 'scheduled', on_way_at: null, code: newCode() }, 'return=minimal');
    await renumber(env, r.id);
    if (st.status === 'on_the_way' && st.route.status === 'live') await advance(env, st.route_id);
  } else if (a === 'time') {
    // Joe, Nov 21, 2026: a one time change in the Field App. This visit gets another time and the customer is told.
    // An empty time puts the visit back on the customer's usual time.
    if (st.status !== 'scheduled') return fail(400, 'Only a visit that has not started can get a new time.');
    if (!(await schedOn(env))) return fail(409, 'Times are not switched on yet. The database patch has to be run first.');
    const t = b.time === '' || b.time == null ? null : (isTime(b.time) ? String(b.time) : undefined);
    if (t === undefined) return fail(400, 'Pick a time.');
    const before = (await timesOf(env, [st]))[st.id] || null;
    await db(env, 'PATCH', 'stops?id=eq.' + st.id, { visit_time: t }, 'return=minimal');
    const now = (await timesOf(env, [st]))[st.id] || null;
    if (!st.route.status || st.route.status === 'planned') await reorderRoute(env, st.route_id).catch((e) => console.error('reorder', e));
    if (now !== before) {
      const c = (await db(env, 'GET', 'customers?id=eq.' + st.customer_id + '&select=id,name,email,phone,texts_visit'))[0];
      await visitNotice(env, st, c, now).catch((e) => console.error('visit notice', e));
    }
  } else return fail(400, 'Unknown action.');
  return officeDay(env, st.day);
}
const LIST_FIELDS = 'id,name,email,phone,address,zip,area,plan,dogs,status,service_day,service_day2,eow_week,stop_order,scooper_id,pause_from,pause_until,lat,lng,texts_visit,created_at';
async function officeCustomers(env, q) {
  let filter = '';
  const f = q.get('show') || 'current';
  if (f === 'current') filter = '&status=in.(' + PAYING.join(',') + ',paused)';
  if (f === 'started') filter = '&status=in.(new,checkout)';
  if (f === 'canceled') filter = '&status=eq.canceled';
  const term = clean(q.get('q'), 60).replace(/[^A-Za-z0-9 @.\-]/g, '');
  if (term) filter += '&or=(name.ilike.*' + enc(term) + '*,address.ilike.*' + enc(term) + '*,phone.ilike.*' + enc(term.replace(/\D/g, '') || term) + '*,email.ilike.*' + enc(term) + '*)';
  const timesOn = await schedOn(env);
  const customers = await dbAll(env, 'customers?select=' + LIST_FIELDS + (timesOn ? ',service_time' : '') + filter + '&order=service_day.nullsfirst,stop_order.nullslast,name,id');
  return ok({ customers, timesOn });
}
// My Yard for one customer: when they were invited (the welcome email) and when they last signed in. The sign in
// time is Supabase's own. It moves when a person signs in with the link or a code, not on every visit to the page.
async function yardStatus(env, c, notes) {
  const hasPlan = PAYING.includes(c.status) || c.status === 'paused' || c.status === 'canceled';
  const again = (notes || []).find((t) => t.kind === 'welcome' && t.status !== 'failed');
  const out = { invited: hasPlan, invitedAt: again ? again.sent_at || again.created_at : hasPlan ? c.created_at : null, resent: !!again, lastSeenAt: null };
  try {
    const r = await fetch(base(env) + '/auth/v1/admin/users/' + c.id, { headers: sbHeaders(env.SUPABASE_SERVICE_ROLE_KEY) });
    const u = r.ok ? await r.json() : null;
    if (u && u.last_sign_in_at) out.lastSeenAt = u.last_sign_in_at;
  } catch (e) { out.lastSeenAt = null; }
  return out;
}
async function officeCustomer(env, id, told) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id || ''))) return fail(400, 'Bad customer.');
  const c = (await db(env, 'GET', 'customers?id=eq.' + id + '&select=*'))[0];
  if (!c) return fail(404, 'Customer not found.');
  const visits = await db(env, 'GET', 'stops?customer_id=eq.' + id + '&select=id,day,status,reason,note,photo_path,no_photo,done_at&order=day.desc&limit=30');
  // The newer columns come with supabase/patch-2026-11-21.sql. Before it is run, the list still loads without them.
  let texts;
  try { texts = await db(env, 'GET', 'messages?customer_id=eq.' + id + '&select=id,kind,channel,body,status,error,sent_at,delivered_at,created_at&order=created_at.desc&limit=30'); }
  catch (e) { texts = await db(env, 'GET', 'messages?customer_id=eq.' + id + '&select=id,kind,channel,body,status,sent_at,created_at&order=created_at.desc&limit=30'); }
  return ok(Object.assign({ customer: c, visits, texts, monthly: c.plan && c.dogs ? rowMonthly(c) : null, yard: await yardStatus(env, c, texts), twilio: smsOn(env), textsTest: testMode(env), timesOn: await schedOn(env) }, told ? { told } : {}));
}
// The office fixes the dog count when the yard has more or fewer dogs than the plan says. The Stripe plan changes
// to match, with no charge today: the new price starts on the next bill. The customer gets an email.
// A plan has one price line, for its plan and its dog count, so the line moves to the price for the new count.
// A plan made before November 18, 2026 has a base line (1 or 2 dogs) and an "extra dog" line at the prices it signed
// up with. There the extra dog line is what changes, as it always did, so that plan keeps its prices.
async function setDogs(env, c, n) {
  if (!PLANS[c.plan]) return;
  if (live(env) && c.stripe_subscription_id && ['trialing', 'active', 'past_due', 'paused'].includes(c.status)) {
    const sub = await stripe(env, 'GET', 'subscriptions/' + c.stripe_subscription_id);
    const lines = (sub.items && sub.items.data) || [];
    const older = keptPlan(c) || lines.some((i) => /^apw_(week|twice|eow)_(base|extra)$/.test((i.price && i.price.lookup_key) || ''));
    if (older) {
      const extra = await oldExtraPrice(env, c.plan);
      const item = lines.find((i) => i.price && i.price.id === extra);
      const want = Math.max(0, n - 2);
      if (want && item) await stripe(env, 'POST', 'subscription_items/' + item.id, { quantity: want, proration_behavior: 'none' });
      else if (want) await stripe(env, 'POST', 'subscription_items', { subscription: sub.id, price: extra, quantity: want, proration_behavior: 'none' });
      else if (item) await stripe(env, 'DELETE', 'subscription_items/' + item.id, { proration_behavior: 'none' });
    } else {
      const price = await priceId(env, c.plan, n);
      const item = lines[0];
      if (!item) throw new Error('plan ' + sub.id + ' has no price line');
      if (!(item.price && item.price.id === price)) await stripe(env, 'POST', 'subscription_items/' + item.id, { price, quantity: 1, proration_behavior: 'none' });
    }
  }
  await mail(env, c.email, 'We updated your plan to ' + n + (n === 1 ? ' dog' : ' dogs'), [
    'Hi ' + first(c.name) + ',', '',
    'We counted ' + n + (n === 1 ? ' dog' : ' dogs') + ' at your home, so we updated your plan to match.',
    'Your price is now ' + money(rowMonthly(c, n)) + ' a month, starting with your next bill. There is no charge today.', '',
    'Questions? Call or text 623.309.6104.', '', 'Arizona Pet Waste'
  ].join('\n'));
}
async function officeCustomerSave(env, b, s) {
  if (!/^[0-9a-f-]{36}$/i.test(String(b.id || ''))) return fail(400, 'Bad customer.');
  const p = {};
  const timesOn = await schedOn(env);
  const was = (await db(env, 'GET', 'customers?id=eq.' + b.id + '&select=' + SCHED_FIELDS + (timesOn ? ',service_time,service_time2' : '')))[0];
  if (!was) return fail(404, 'Customer not found.');
  // The office can fix a name, for one typed last name first or misspelled. Emails greet people by their first name.
  if ('name' in b && clean(b.name, 120) !== (was.name || '')) { if (clean(b.name, 120).length < 2) return fail(400, 'Type the customer\'s name.'); p.name = clean(b.name, 120); }
  const dayOrNull = (v) => (v === '' || v == null ? null : (Number(v) >= 0 && Number(v) <= 6 ? Math.round(Number(v)) : undefined));
  const dateOrNull = (v) => (v === '' || v == null ? null : (isDay(v) ? v : undefined));
  const set = (k, v) => { if (v !== undefined) p[k] = v; };
  if ('service_day' in b) set('service_day', dayOrNull(b.service_day));
  if ('service_day2' in b) set('service_day2', dayOrNull(b.service_day2));
  // The time of the visit ("10:30"). Day and time together are the schedule, and setting them is what tells the customer.
  for (const k of ['service_time', 'service_time2']) {
    if (!(k in b)) continue;
    const t = b[k] === '' || b[k] == null ? null : (isTime(b[k]) ? String(b[k]) : undefined);
    if (t === undefined) return fail(400, 'Pick a time.');
    if (t === (was[k] ?? null)) continue;
    if (!timesOn) return fail(409, 'Times are not switched on yet. The database patch has to be run first.');
    p[k] = t;
  }
  if ('eow_week' in b) set('eow_week', b.eow_week === '' || b.eow_week == null ? null : (Number(b.eow_week) ? 1 : 0));
  if ('stop_order' in b) set('stop_order', b.stop_order === '' || b.stop_order == null ? null : Math.max(0, Math.round(Number(b.stop_order)) || 0));
  if ('scooper_id' in b) set('scooper_id', b.scooper_id ? String(b.scooper_id) : null);
  if ('pause_from' in b) set('pause_from', dateOrNull(b.pause_from));
  if ('pause_until' in b) set('pause_until', dateOrNull(b.pause_until));
  for (const k of ['office_notes', 'gate_notes', 'problem_spots']) if (k in b) p[k] = clean(b[k], 1000);
  for (const k of ['gate_code', 'dog_names']) if (k in b) p[k] = clean(b[k], 200) || null;
  if ('skip_spray' in b) p.skip_spray = !!b.skip_spray;
  if ('address' in b && clean(b.address, 200).length >= 5) { p.address = clean(b.address, 200); p.lat = null; p.lng = null; }
  if ('phone' in b && digits(b.phone).length === 10) p.phone = digits(b.phone);
  if ('dogs' in b && b.dogs !== '' && b.dogs != null) {
    const n = Math.round(Number(b.dogs));
    if (!(n >= 1 && n <= 6)) return fail(400, 'Pick 1 to 6 dogs.');
    const c = (await db(env, 'GET', 'customers?id=eq.' + b.id + '&select=dogs,plan,name,email,status,stripe_subscription_id'))[0];
    if (c && c.dogs !== n) {
      try { await setDogs(env, c, n); } catch (e) { console.error('dog count', e); return fail(502, 'Stripe did not take the change. Nothing was saved. Try again.'); }
      p.dogs = n;
    }
  }
  if (b.pin) {
    const c = (await db(env, 'GET', 'customers?id=eq.' + b.id + '&select=address,zip'))[0];
    const g = c && await geocode(p.address || c.address, c.zip);
    if (!g) return fail(400, 'We could not find that address on the map. Check the street address.');
    Object.assign(p, g);
  } else if (p.address) {
    const c = (await db(env, 'GET', 'customers?id=eq.' + b.id + '&select=zip'))[0];
    const g = await geocode(p.address, c && c.zip);
    if (g) Object.assign(p, g);
  }
  // "Send their day and time again" on the card saves nothing: it sends the confirmation once more.
  if (!Object.keys(p).length && !b.tell) return fail(400, 'Nothing to save.');
  if (Object.keys(p).length) {
    p.updated_at = new Date().toISOString();
    await db(env, 'PATCH', 'customers?id=eq.' + b.id, p, 'return=minimal');
  }
  // Joe, Nov 21, 2026, the core rule: setting or changing the day and time is what tells the customer. With a day and
  // no time, nothing goes out. Only for a booked house (a customer with a plan), and only when something really changed.
  let told = null;
  const now = Object.assign({}, was, p), keys = ['service_day', 'service_day2', 'service_time', 'service_time2'];
  const changed = keys.some((k) => (now[k] ?? null) !== (was[k] ?? null));
  const booked = PAYING.includes(was.status) || was.status === 'paused';
  if (booked && (changed || b.tell)) {
    if (changed) {
      // Visits already built for later days are dropped when the day moved: the day builder makes them on the new day.
      // A time change keeps the visits and puts each waiting route back in time order.
      try {
        const dayMoved = (now.service_day ?? null) !== (was.service_day ?? null) || (now.service_day2 ?? null) !== (was.service_day2 ?? null);
        if (dayMoved) await db(env, 'DELETE', 'stops?status=eq.scheduled&day=gt.' + azToday() + '&customer_id=eq.' + b.id, null, 'return=minimal');
        else {
          const later = await db(env, 'GET', 'stops?customer_id=eq.' + b.id + '&status=eq.scheduled&day=gte.' + azToday() + '&select=id,day,code,route_id,customer_id,route:routes(status)');
          for (const st of later) if (!st.route || !st.route.status || st.route.status === 'planned') await reorderRoute(env, st.route_id);
          await nightFix(env, later);
        }
      } catch (e) { console.error('schedule cleanup', e); }
    }
    if (now.service_day != null || b.tell) {
      try { told = await schedNotice(env, now, schedSet(was) && changed, !!b.tell && !changed); }
      catch (e) { console.error('day notice', e); told = { mailed: false, text: 'none', error: true }; }
    }
  }
  return officeCustomer(env, b.id, told);
}
async function officePhoto(env, stopId) {
  const id = parseInt(stopId, 10);
  const st = id && (await db(env, 'GET', 'stops?id=eq.' + id + '&select=photo_path'))[0];
  if (!st || !st.photo_path) return fail(404, 'No photo for that visit.');
  const w = photoWhen(st.photo_path);
  return ok({ url: await photoUrl(env, st.photo_path), photoAt: w ? w.at : null, timeTyped: w ? w.manual : false });
}
async function officeLead(env, b) {
  const now = new Date().toISOString();
  if (!b.id) {
    const kind = ['phone', 'commercial'].includes(b.kind) ? b.kind : 'phone';
    const name = clean(b.name, 120), phone = digits(b.phone);
    if (name.length < 2 && phone.length !== 10) return fail(400, 'Type a name or a phone number.');
    await db(env, 'POST', 'leads', [{ kind, name, phone: phone || null, email: clean(b.email, 200) || null, address: clean(b.address, 200) || null, zip: clean(b.zip, 5) || null, details: clean(b.details, 1000) || null, notes: clean(b.notes, 1000) || null }], 'return=minimal');
  } else {
    const p = { updated_at: now };
    if (b.status) { if (!['new', 'contacted', 'quoted', 'won', 'lost'].includes(b.status)) return fail(400, 'Bad status.'); p.status = b.status; }
    if ('notes' in b) p.notes = clean(b.notes, 1000);
    await db(env, 'PATCH', 'leads?id=eq.' + parseInt(b.id, 10), p, 'return=minimal');
    // The first time a lead leaves New, keep the time. The Leads screen shows how fast we reached them (Joe, Nov 18, 2026).
    // It is written once and never moved, so a later note or status cannot make a slow call look fast.
    if (b.status && b.status !== 'new') await db(env, 'PATCH', 'leads?id=eq.' + parseInt(b.id, 10) + '&contacted_at=is.null', { contacted_at: now }, 'return=minimal');
  }
  return ok({ leads: await db(env, 'GET', 'leads?select=*&order=created_at.desc&limit=500') });
}
// The Texts screen: what is waiting for a person, and the log of everything that went out or came in.
async function officeTexts(env) {
  const texts = await db(env, 'GET', 'messages?status=eq.queued&channel=eq.sms&select=id,kind,to_addr,body,created_at,customer:customers(name,texts_visit),stop:stops(day)&order=created_at&limit=300');
  let log = [];
  try { log = await db(env, 'GET', 'messages?status=neq.queued&select=id,kind,channel,to_addr,body,status,error,sent_at,delivered_at,created_at,customer:customers(name)&order=created_at.desc&limit=80'); }
  catch (e) { try { log = await db(env, 'GET', 'messages?status=neq.queued&select=id,kind,channel,to_addr,body,status,sent_at,created_at,customer:customers(name)&order=created_at.desc&limit=80'); } catch (e2) { log = []; } }
  const allow = smsAllow(env);
  return ok({ texts, log, twilio: smsOn(env), test: allow ? allow.size : null, auto: AUTO_KINDS });
}
// Builds tomorrow's routes and sends the night before texts (Joe, Nov 21, 2026: every evening, on its own). Each text
// has the time the office set for the visit, the 30 minute window around it, and the customer's truck link. A visit
// with no time set gets no text. The evening run also sends any day or change text that was held overnight. Also clears GPS points older than 30 days.
// `cron` is true when the scheduler called it. Safe to run twice: a visit only ever gets one night before text.
const NIGHT_BATCH = 10;
async function nightBefore(env, date, cron) {
  env = await withSettings(env);
  const day = date || addDays(azToday(), 1);
  const plan = await planDay(env, day);
  const stops = await db(env, 'GET', 'stops?day=eq.' + day + '&status=eq.scheduled&select=id,day,code,route_id,position,customer:customers(id,phone,texts_visit,lat,lng)&order=route_id,position,id');
  const times = await timesOf(env, stops), ids = stops.map((x) => x.id);
  // One look for the texts these visits already have, one write for the new ones. Then the sending, a few at a time:
  // each call sends up to NIGHT_BATCH texts and says how many are left, and the scheduler calls again until none are.
  const had = new Set((ids.length ? await db(env, 'GET', 'messages?kind=eq.night_before&channel=eq.sms&stop_id=in.(' + ids.join(',') + ')&select=stop_id') : []).map((x) => x.stop_id));
  const fresh = stops.filter((st) => !had.has(st.id) && times[st.id] && st.customer && st.customer.texts_visit && st.customer.phone)
    .map((st) => ({ customer_id: st.customer.id, stop_id: st.id, kind: 'night_before', channel: 'sms', to_addr: st.customer.phone, body: textBody(env, 'night_before', st.code, null, { day, time: times[st.id] }) }));
  if (fresh.length) await db(env, 'POST', 'messages', fresh, 'return=minimal');
  let sent = 0, left = 0;
  if (smsOn(env)) {
    try {
      // What can go now: the night before texts for this day, and day texts from the last day and a half that were held overnight.
      const wait = (ids.length ? await db(env, 'GET', 'messages?status=eq.queued&channel=eq.sms&kind=eq.night_before&stop_id=in.(' + ids.join(',') + ')&select=*&order=id') : [])
        .concat(await db(env, 'GET', 'messages?status=eq.queued&channel=eq.sms&kind=in.(day_set,visit_change)&created_at=gte.' + enc(new Date(Date.now() - 36 * 3600e3).toISOString()) + '&select=*&order=id&limit=200'))
        .filter((m) => smsMay(env, m.to_addr) && !quietNow(env));
      const batch = Math.min(40, Math.max(1, parseInt(env.SMS_BATCH, 10) || NIGHT_BATCH));
      for (const msg of wait.slice(0, batch)) if (await sendText(env, msg) === 'sent') sent++;
      left = Math.max(0, wait.length - batch);
    } catch (e) { console.error('night texts', e); }
  }
  if (cron) {
    await db(env, 'DELETE', 'positions?at=lt.' + enc(new Date(Date.now() - 30 * 86400e3).toISOString()), null, 'return=minimal').catch(() => {});
    await db(env, 'DELETE', 'auth_tries?at=lt.' + enc(new Date(Date.now() - 2 * 86400e3).toISOString()), null, 'return=minimal').catch(() => {});
    await db(env, 'POST', 'settings?on_conflict=key', [{ key: 'night_before_ran_at', value: new Date().toISOString(), updated_at: new Date().toISOString() }], 'resolution=merge-duplicates,return=minimal').catch(() => {});
  } else {
    await db(env, 'DELETE', 'positions?at=lt.' + enc(new Date(Date.now() - 30 * 86400e3).toISOString()), null, 'return=minimal');
    try { await db(env, 'DELETE', 'auth_tries?at=lt.' + enc(new Date(Date.now() - 2 * 86400e3).toISOString()), null, 'return=minimal'); } catch (e) { }
  }
  return ok({ ok: true, day, stops: stops.length, queued: fresh.length, sent, left, timed: stops.filter((st) => times[st.id]).length, added: plan.added });
}
async function officeMoney(env) {
  // stripe_subscription_id is read so a plan that keeps an older price is added up at that price (rowMonthly).
  const rows = await db(env, 'GET', 'customers?select=status,plan,dogs,name,phone,stripe_subscription_id&status=in.(trialing,active,past_due,paused,canceled,checkout)');
  const sum = (list) => list.reduce((t, c) => t + (c.plan && c.dogs ? rowMonthly(c) : 0), 0);
  const by = (st) => rows.filter((c) => c.status === st);
  return ok({
    paying: { count: by('active').length, monthly: sum(by('active')) },
    freeMonth: { count: by('trialing').length, monthly: sum(by('trialing')), list: by('trialing').slice(0, 50).map((c) => ({ name: c.name, monthly: sum([c]) })) },
    pastDue: by('past_due').map((c) => ({ name: c.name, phone: c.phone, monthly: sum([c]) })),
    paused: by('paused').length, canceled: by('canceled').length, started: by('checkout').length,
    startedList: by('checkout').slice(0, 50).map((c) => ({ name: c.name, phone: c.phone }))
  });
}
async function officeAreas(env) {
  const set = await db(env, 'GET', 'area_days?select=area,day');
  const areas = [...new Set(Object.values(ZIPS).map((z) => z.area))].map((a) => ({
    area: a, name: Object.values(ZIPS).find((z) => z.area === a).name, day: (set.find((x) => x.area === a) || {}).day ?? null
  }));
  return ok({ areas });
}
async function officeArea(env, b) {
  const area = String(b.area || '');
  if (!Object.values(ZIPS).some((z) => z.area === area)) return fail(400, 'Unknown area.');
  if (b.day === '' || b.day == null) await db(env, 'DELETE', 'area_days?area=eq.' + enc(area), null, 'return=minimal');
  else {
    const d = Math.round(Number(b.day));
    if (!(d >= 0 && d <= 6)) return fail(400, 'Pick a day.');
    await db(env, 'POST', 'area_days?on_conflict=area', [{ area, day: d, updated_at: new Date().toISOString() }], 'resolution=merge-duplicates,return=minimal');
    // Yards in that area with no day yet get this one.
    await db(env, 'PATCH', 'customers?area=eq.' + enc(area) + '&service_day=is.null&status=in.(' + PAYING.join(',') + ')', { service_day: d }, 'return=minimal');
  }
  return officeAreas(env);
}
async function officeTeam(env, s, b) {
  const email = clean(b.email, 200).toLowerCase(), name = clean(b.name, 80);
  const role = ['owner', 'office', 'scooper'].includes(b.role) ? b.role : 'scooper';
  if (b.id) {
    const p = {};
    if (name) p.name = name;
    if ('phone' in b) p.phone = digits(b.phone) || null;
    if (b.role) p.role = role;
    if ('scoops' in b) p.scoops = !!b.scoops;
    if (b.role === 'scooper') p.scoops = true;
    if ('active' in b) p.active = !!b.active;
    if (b.id === s.id && (p.active === false || (p.role && p.role !== 'owner'))) return fail(400, 'You cannot remove your own owner access.');
    if ('phone' in b && digits(b.phone) && digits(b.phone).length !== 10) return fail(400, 'Type a 10 digit mobile number.');
    if (Object.keys(p).length) await db(env, 'PATCH', 'staff?id=eq.' + enc(b.id), p, 'return=minimal');
  } else {
    if (!emailOk(email) || name.length < 2) return fail(400, 'Type their name and email.');
    if (digits(b.phone) && digits(b.phone).length !== 10) return fail(400, 'Type a 10 digit mobile number.');
    await db(env, 'POST', 'staff?on_conflict=email', [{ email, name, phone: digits(b.phone) || null, role, scoops: role === 'scooper' || !!b.scoops, active: true }], 'resolution=merge-duplicates,return=minimal');
  }
  return ok({ team: await teamList(env) });
}

/* ---------- road route and traffic arrival time (Google Routes API) ---------- */
// Needs GOOGLE_MAPS_SERVER_KEY. Cached on the stop for 60 seconds so a customer watching the link costs about one call a minute.
async function roadRoute(env, st, p, home) {
  if (!env.GOOGLE_MAPS_SERVER_KEY) return null;
  if (st.route_at && Date.now() - Date.parse(st.route_at) < 60e3 && st.eta_at) return { eta: st.eta_at, polyline: st.route_polyline, meters: st.route_meters };
  try {
    const r = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GOOGLE_MAPS_SERVER_KEY, 'x-goog-fieldmask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline' },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: p.lat, longitude: p.lng } } },
        destination: { location: { latLng: { latitude: home.lat, longitude: home.lng } } },
        travelMode: 'DRIVE', routingPreference: 'TRAFFIC_AWARE'
      })
    });
    if (!r.ok) { console.error('routes api', r.status, (await r.text()).slice(0, 200)); return null; }
    const route = ((await r.json()).routes || [])[0];
    if (!route) return null;
    const secs = parseInt(String(route.duration || '0s'), 10) || 0;
    const out = { eta: new Date(Date.now() + secs * 1000).toISOString(), polyline: (route.polyline && route.polyline.encodedPolyline) || null, meters: route.distanceMeters ?? null };
    await db(env, 'PATCH', 'stops?id=eq.' + st.id, { eta_at: out.eta, route_polyline: out.polyline, route_meters: out.meters, route_at: new Date().toISOString() }, 'return=minimal');
    return out;
  } catch (e) { console.error('routes api', e); return null; }
}

/* ---------- customer truck link: arizonapetwaste.com/t/CODE ---------- */
// Shows only this one visit: status, arrival time, how far away, the scooper's first name and, when done, the gate photo.
// It never shows other homes, and it ends 2 hours after the visit.
async function track(raw, env) {
  const code = String(raw || '').toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 8);
  if (code.length !== 6) return fail(404, 'This link is not active.');
  const st = (await db(env, 'GET', 'stops?code=eq.' + code + '&select=id,route_id,day,position,status,reason,photo_path,no_photo,on_way_at,arrived_at,done_at,eta_at,route_polyline,route_at,route_meters,' +
    'customer:customers(lat,lng),route:routes(status,started_at,staff:staff(name))'))[0];
  if (!st) return fail(404, 'This link is not active.');
  const now = Date.now(), today = azToday();
  const ended = st.done_at && now - Date.parse(st.done_at) > LINK_HOURS * 3600e3;
  if (st.day < today || ended || (st.day > addDays(today, 1))) {
    return ok({ expired: true, message: 'This link has ended. See every visit and gate photo in My Yard.' });
  }
  const out = { status: st.status, day: st.day, dayName: DAYS[weekday(st.day)], scooper: first(st.route && st.route.staff && st.route.staff.name), routeLive: st.route.status === 'live' };
  if (st.status === 'scheduled') {
    const ahead = await db(env, 'GET', 'stops?route_id=eq.' + st.route_id + '&status=in.(scheduled,on_the_way,here)&position=lt.' + st.position + '&select=id');
    out.stopsAway = ahead.length + 1;
    if (out.routeLive) out.eta = new Date(now + out.stopsAway * 20 * 60e3).toISOString();
  }
  if (st.status === 'on_the_way') {
    out.stopsAway = 1;
    const home = st.customer && st.customer.lat != null ? { lat: st.customer.lat, lng: st.customer.lng } : null;
    const p = (await db(env, 'GET', 'positions?route_id=eq.' + st.route_id + '&select=lat,lng,heading,at&order=at.desc&limit=1'))[0];
    if (home && p && now - Date.parse(p.at) < 10 * 60e3) {
      const mi = miles(p, home);
      out.miles = Math.round(mi * 10) / 10;
      out.eta = new Date(now + driveMin(mi) * 60e3).toISOString();
      const startP = st.on_way_at && (await db(env, 'GET', 'positions?route_id=eq.' + st.route_id + '&at=gte.' + enc(st.on_way_at) + '&select=lat,lng&order=at&limit=1'))[0];
      const startMi = startP ? miles(startP, home) : mi;
      out.progress = startMi > 0.05 ? Math.max(0, Math.min(1, 1 - mi / startMi)) : 0.9;
      out.seen = p.at;
      // Only while we head to this yard: the truck, this home, and the road route between them.
      out.truck = { lat: p.lat, lng: p.lng, heading: p.heading };
      out.home = home;
      const road = await roadRoute(env, st, p, home);
      if (road) {
        out.eta = road.eta;
        out.polyline = road.polyline;
        if (road.meters != null) out.miles = Math.round(road.meters / 160.934) / 10;
      }
    } else out.eta = new Date(now + 15 * 60e3).toISOString();
    if (env.GOOGLE_MAPS_BROWSER_KEY) out.mapsKey = env.GOOGLE_MAPS_BROWSER_KEY;
  }
  if (st.status === 'here') out.arrivedAt = st.arrived_at;
  if (st.status === 'done') { out.doneAt = st.done_at; out.photo = await photoUrl(env, st.photo_path); out.noPhoto = !!st.no_photo; const w = photoWhen(st.photo_path); if (w) { out.photoAt = w.at; out.timeTyped = w.manual; } }
  if (st.status === 'cant') { out.reason = REASONS[st.reason] || REASONS.other; out.doneAt = st.done_at; }
  return ok(out);
}

/* ---------- demo truck link: arizonapetwaste.com/t/DEMO01 ---------- */
// A made up visit that loops every 3 minutes so anyone can see what a customer sees. No real customer, truck or home.
const DEMO_CODE = 'DEMO01';
const DEMO_FROM = { lat: 33.6387, lng: -112.3331 }, DEMO_HOME = { lat: 33.6292, lng: -112.3955 };
let demoRoute = null;
function decodeLine(str) {
  const pts = []; let i = 0, lat = 0, lng = 0;
  while (i < str.length) {
    for (const k of [0, 1]) {
      let b, shift = 0, res = 0;
      do { b = str.charCodeAt(i++) - 63; res |= (b & 31) << shift; shift += 5; } while (b >= 32);
      const d = res & 1 ? ~(res >> 1) : res >> 1;
      if (k === 0) lat += d; else lng += d;
    }
    pts.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return pts;
}
async function demoRoad(env) {
  if (demoRoute && (demoRoute.polyline || !env.GOOGLE_MAPS_SERVER_KEY || Date.now() - demoRoute.at < 300e3)) return demoRoute;
  let out = { at: Date.now(), polyline: null, pts: [DEMO_FROM, DEMO_HOME], meters: Math.round(miles(DEMO_FROM, DEMO_HOME) * 1609), secs: Math.round(driveMin(miles(DEMO_FROM, DEMO_HOME)) * 60) };
  if (env.GOOGLE_MAPS_SERVER_KEY) {
    try {
      const r = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GOOGLE_MAPS_SERVER_KEY, 'x-goog-fieldmask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline' },
        body: JSON.stringify({ origin: { location: { latLng: { latitude: DEMO_FROM.lat, longitude: DEMO_FROM.lng } } }, destination: { location: { latLng: { latitude: DEMO_HOME.lat, longitude: DEMO_HOME.lng } } }, travelMode: 'DRIVE' })
      });
      const route = r.ok ? ((await r.json()).routes || [])[0] : null;
      const line = route && route.polyline && route.polyline.encodedPolyline;
      if (line) out = { at: Date.now(), polyline: line, pts: decodeLine(line), meters: route.distanceMeters || out.meters, secs: parseInt(String(route.duration || '0s'), 10) || out.secs };
    } catch (e) { console.error('demo route', e); }
  }
  demoRoute = out;
  return out;
}
function along(pts, k) {
  const seg = []; let total = 0;
  for (let i = 1; i < pts.length; i++) { const d = miles(pts[i - 1], pts[i]); seg.push(d); total += d; }
  let want = Math.max(0, Math.min(1, k)) * total;
  for (let i = 0; i < seg.length; i++) {
    if (want <= seg[i] || i === seg.length - 1) {
      const f = seg[i] ? Math.min(1, want / seg[i]) : 0, a = pts[i], b = pts[i + 1];
      const heading = (Math.atan2((b.lng - a.lng) * Math.cos(a.lat * Math.PI / 180), b.lat - a.lat) * 180 / Math.PI + 360) % 360;
      return { lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f, heading: Math.round(heading) };
    }
    want -= seg[i];
  }
  return Object.assign({ heading: 0 }, pts[0]);
}
async function trackDemo(env) {
  const now = Date.now(), t = (now / 1000) % 180, today = azToday();
  const out = { demo: true, poll: 3, day: today, dayName: DAYS[weekday(today)], scooper: 'Sam', routeLive: true };
  if (t < 10) return ok(Object.assign(out, { status: 'scheduled', stopsAway: 1, eta: new Date(now + 20 * 60e3).toISOString() }));
  if (t < 130) {
    const road = await demoRoad(env), k = (t - 10) / 120, left = 1 - k;
    Object.assign(out, { status: 'on_the_way', stopsAway: 1, progress: k, seen: new Date(now).toISOString(), home: DEMO_HOME, truck: along(road.pts, k),
      miles: Math.round(road.meters * left / 160.934) / 10, eta: new Date(now + road.secs * left * 1000).toISOString() });
    if (road.polyline) out.polyline = road.polyline;
    if (env.GOOGLE_MAPS_BROWSER_KEY) out.mapsKey = env.GOOGLE_MAPS_BROWSER_KEY;
    return ok(out);
  }
  if (t < 150) return ok(Object.assign(out, { status: 'here', arrivedAt: new Date(now - (t - 130) * 1000).toISOString() }));
  return ok(Object.assign(out, { status: 'done', doneAt: new Date(now - (t - 150) * 1000).toISOString(), photo: '/assets/img/gate-photo.jpg', noPhoto: false }));
}

/* ---------- crash log and health check ---------- */
// Every server error and every crash in the crew app or on a truck link lands in the errors table. The office reads it on the Health tab.
// ---------- Meta Conversions API ----------
// The page sends the Meta Pixel its events (APW.track in apw.js). The booking and the leads also go to Meta from here,
// with the same event id, so a visitor whose browser blocks the pixel still counts and Meta counts each one once.
// Off until META_CAPI_TOKEN is set in Cloudflare. META_PIXEL_ID can override the pixel id below (a public value).
// What Meta gets: a scrambled (SHA 256) email, city, state, ZIP and customer id, the IP address and browser line, and
// Meta's own browser and click ids. Never the phone number, the name, the street address, the gate code or the card:
// the privacy policy and the text terms promise that. META_TEST_CODE sends to Events Manager's Test events tab.
const META_PIXEL = '1982997959354953';
const META_API = 'v26.0';
function metaOn(env) { return !!(env.META_CAPI_TOKEN && (env.META_PIXEL_ID || META_PIXEL)); }
async function sha256(v) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
// Only values in Meta's own formats get through: fbp is fb.1.<time>.<number>, fbc is fb.1.<time>.<click id>.
function adIds(a) {
  a = a && typeof a === 'object' ? a : {};
  const fbp = String(a.fbp || ''), fbc = String(a.fbc || '');
  return { fbp: /^fb\.\d\.\d{10,16}\.\d{1,30}$/.test(fbp) ? fbp : '', fbc: /^fb\.\d\.\d{10,16}\.[\w-]{10,500}$/.test(fbc) ? fbc : '' };
}
function adMeta(b, ip, ua) {
  const a = adIds(b && b.ad);
  return { ad_fbp: a.fbp || undefined, ad_fbc: a.fbc || undefined, ad_ip: ip || undefined, ad_ua: ua || undefined };
}
function eventIdOk(v) { v = String(v || ''); return /^[a-z]{2,10}_[a-z0-9]{6,40}$/i.test(v) ? v : ''; }
async function metaUser(o) {
  const u = { st: [await sha256('az')], country: [await sha256('us')] };
  if (o.email) u.em = [await sha256(String(o.email).trim().toLowerCase())];
  if (o.city) u.ct = [await sha256(String(o.city).toLowerCase().replace(/[^a-z]/g, ''))];
  if (/^\d{5}/.test(String(o.zip || ''))) u.zp = [await sha256(String(o.zip).slice(0, 5))];
  if (o.uid) u.external_id = [await sha256(String(o.uid))];
  if (o.ip) u.client_ip_address = o.ip;
  if (o.ua) u.client_user_agent = o.ua;
  if (o.fbp) u.fbp = o.fbp;
  if (o.fbc) u.fbc = o.fbc;
  return u;
}
async function metaEvent(env, name, id, user, custom, path) {
  if (!metaOn(env) || !id) return false;
  try {
    const body = { data: [{ event_name: name, event_time: Math.floor(Date.now() / 1000), event_id: id, action_source: 'website',
      event_source_url: 'https://' + siteHost(env) + (path || '/book/'), user_data: await metaUser(user || {}), custom_data: custom || {} }] };
    if (env.META_TEST_CODE) body.test_event_code = String(env.META_TEST_CODE);
    const r = await fetch('https://graph.facebook.com/' + META_API + '/' + encodeURIComponent(env.META_PIXEL_ID || META_PIXEL) + '/events?access_token=' + encodeURIComponent(env.META_CAPI_TOKEN),
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (r.ok) return true;
    await logError(env, 'server', 'meta', 'Meta did not take a ' + name + ' event (' + r.status + '). Check META_CAPI_TOKEN.', (await r.text().catch(() => '')).slice(0, 800));
  } catch (e) { await logError(env, 'server', 'meta', 'Meta ' + name + ' event failed', e && e.message); }
  return false;
}
// The booking: Meta's StartTrial, worth the month price. The ids come from the card form (metadata from /api/checkout).
// A booking the Stripe webhook finished has no card form in hand, so the card form is read once from Stripe.
async function metaBooked(env, c, totalCents, session, md, subId) {
  // A plan paid for in Stripe's own checkout does not carry its card form id. When Stripe's plan event is what books
  // it, the card form is found by the plan, so the event id still matches the one the page sent.
  if (!session && subId) {
    try { const x = ((await stripe(env, 'GET', 'checkout/sessions', { subscription: subId, limit: 1 })).data || [])[0]; if (x && x.id) { session = x.id; md = x.metadata; } } catch (e) { session = ''; }
  }
  if (!session) return false;
  if (!md && /^cs_/.test(session)) { try { md = (await stripe(env, 'GET', 'checkout/sessions/' + session)).metadata; } catch (e) { md = null; } }
  md = md || {};
  return metaEvent(env, 'StartTrial', 'bk_' + session,
    { email: c.email, city: (ZIPS[c.zip] || {}).city, zip: c.zip, uid: c.id, ip: md.ad_ip, ua: md.ad_ua, fbp: md.ad_fbp, fbc: md.ad_fbc },
    { value: totalCents / 100, currency: 'USD', content_name: c.plan, num_items: c.dogs });
}

// ---------- Facebook and Instagram lead ads (Meta Instant Forms) ----------
// A lead form on Facebook or Instagram never touches the website. Meta keeps the answers and sends this server a short
// notice with the lead's id (a "leadgen" webhook, POST /api/meta/leadgen). The server reads the lead from Meta with the
// Page token, emails every answer to the office, and saves it in the leads table, where the office app lists it.
// Settings in Cloudflare, all three are needed (GO_LIVE.md part 11 has the steps):
//   META_APP_SECRET    the Meta app's App Secret. Meta signs every notice with it, and an unsigned notice is refused.
//   META_VERIFY_TOKEN  any long word we make up. It is typed into the Meta app's Webhooks page, and Meta sends it back
//                      once to prove the address is ours (GET /api/meta/leadgen).
//   META_PAGE_TOKEN    a token that can read the Page's leads: the Page's own token, or a system user's token (the
//                      server then asks Meta for the Page's token itself).
//   Optional META_PAGE_ID: only this Page's leads are taken. Needed when the token can act for more than one Page.
// A lead is never dropped without a sound. If it cannot be read (no token yet, a dead token, Meta is down), the office
// still gets an email with the lead id, the row is saved as "not read yet", and Meta is told to send the notice again.
// Meta tries for 36 hours, and the row and the email are finished on the first try that works. A lead is emailed once:
// the row is looked up by its Meta lead id before anything is sent.
const metaLeadsOn = (env) => !!(env.META_APP_SECRET && env.META_VERIFY_TOKEN && env.META_PAGE_TOKEN);
const LEAD_TAG = 'Meta lead id '; // the end of a saved lead's details, and how the lead is found again
const LEADS_A_CALL = 5; // leads handled in one notice. More than that waits for Meta to send the notice again
const LEAD_ALL = 'id,created_time,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,platform,is_organic,field_data,custom_disclaimer_responses';
const LEAD_MIN = 'id,created_time,ad_id,form_id,field_data';
const META_MEM = { page: {}, form: {}, told: new Set() }; // kept in this server only: a Page's own token, the names of lead forms, and the unread leads the office was emailed about
const nap = (ms) => new Promise((r) => setTimeout(r, ms));
const numId = (v) => { v = String(v == null ? '' : v); return /^\d{1,30}$/.test(v) ? v : ''; };
async function metaSigned(payload, header, secret) {
  const m = /^sha256=([0-9a-f]{64})$/i.exec(String(header || '').trim());
  if (!m || !secret) return false;
  const te = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', te.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, te.encode(payload)));
  return sameSecret(m[1].toLowerCase(), Array.from(mac, (x) => x.toString(16).padStart(2, '0')).join(''));
}
// One Graph API call. The token rides in the address, the way Meta's own examples send it, so the address is never
// logged and never put in an error. What comes back on a failure is Meta's own message, which holds no token.
async function graph(path, token, method) {
  const url = 'https://graph.facebook.com/' + META_API + '/' + path + (path.includes('?') ? '&' : '?') + 'access_token=' + encodeURIComponent(token);
  for (let i = 0; i < 2; i++) {
    let r = null, d = null;
    try { r = await fetch(url, { method: method || 'GET', signal: AbortSignal.timeout(7000) }); d = await r.json().catch(() => null); } catch (e) { r = null; }
    if (r && r.ok && d && !d.error) return { ok: true, data: d };
    // Meta being down for a moment is worth one more try. A refusal is not.
    if ((!r || r.status >= 500) && i === 0) { await nap(300); continue; }
    const e = (d && d.error) || {};
    return { ok: false, status: r ? r.status : 0, code: Number(e.code) || 0, sub: Number(e.error_subcode) || 0, err: clean(e.message, 300) || (r ? 'Meta answered ' + r.status + '.' : 'Meta did not answer.') };
  }
}
// Reads one lead. A system user's token, or a person's, cannot read a lead: the Page's own token can, and the first
// token can ask Meta for it. The ad's name needs ad rights the token may not have, so the last try asks for less.
async function metaLeadRead(env, id, pageId) {
  const tok = env.META_PAGE_TOKEN;
  if (!tok) return { ok: false, why: 'token', err: 'META_PAGE_TOKEN is not set in Cloudflare.' };
  let first = null, lead = null;
  const read = async (t, fields) => { const r = await graph(id + '?fields=' + fields, t); if (!r.ok) first = first || r; return r.ok ? r.data : null; };
  let t = (pageId && META_MEM.page[pageId]) || tok;
  lead = await read(t, LEAD_ALL);
  if (!lead && t !== tok) { delete META_MEM.page[pageId]; t = tok; lead = await read(t, LEAD_ALL); }
  if (!lead && pageId) {
    const p = await graph(pageId + '?fields=access_token', tok);
    const pt = p.ok && p.data && typeof p.data.access_token === 'string' ? p.data.access_token : '';
    if (pt && pt !== tok) { t = pt; lead = await read(t, LEAD_ALL); }
  }
  if (!lead) lead = await read(t, LEAD_MIN);
  if (!lead || !Array.isArray(lead.field_data)) return Object.assign({ ok: false, status: 0, code: 0, sub: 0, err: 'Meta sent no answers for this lead.' }, first || {}, { ok: false });
  if (pageId && t !== tok) META_MEM.page[pageId] = t;
  return { ok: true, lead, token: t };
}
async function metaFormName(formId, token) {
  if (!formId) return '';
  if (formId in META_MEM.form) return META_MEM.form[formId];
  const r = await graph(formId + '?fields=name', token);
  return (META_MEM.form[formId] = r.ok ? clean(r.data.name, 120) : '');
}
// Why a lead could not be read, in words the office can act on.
function leadWhy(r) {
  if (r.why === 'token') return 'The Meta token is not in Cloudflare yet (META_PAGE_TOKEN).';
  if (r.code === 190) return 'The Meta token in Cloudflare (META_PAGE_TOKEN) has ended or is not valid. It needs a new one.';
  if (r.code === 10 || r.code === 200 || r.code === 3 || r.code === 100) return 'The Meta token is not allowed to read this lead. It needs the leads_retrieval right, and its person or system user needs lead access on the Page (Business Settings, Integrations, Leads Access).';
  if (r.code === 4 || r.code === 17 || r.code === 32 || r.code === 613) return 'Meta says too many requests were made. That clears on its own.';
  if (!r.status || r.status >= 500) return 'Meta did not answer. It may be down for a moment.';
  return 'Meta refused the request.';
}
const LEAD_LABELS = { full_name: 'Name', name: 'Name', first_name: 'First name', last_name: 'Last name', email: 'Email', work_email: 'Work email', phone_number: 'Mobile', phone: 'Mobile', work_phone_number: 'Work phone',
  street_address: 'Street address', address: 'Street address', city: 'City', state: 'State', province: 'State', zip_code: 'ZIP', zip: 'ZIP', post_code: 'ZIP', postal_code: 'ZIP', country: 'Country' };
// The answers of a lead form. Meta sends each one as a name and a list of values. The names a form uses for its own
// questions are the question in small letters with underscores, so they are turned back into words.
function leadParse(fieldData) {
  const o = { name: '', email: '', phone: '', phoneRaw: '', street: '', city: '', state: '', zip: '', all: [], extra: [], test: false };
  let firstName = '', lastName = '';
  for (const f of Array.isArray(fieldData) ? fieldData.slice(0, 60) : []) {
    const key = clean(f && f.name, 120);
    const val = (Array.isArray(f && f.values) ? f.values : []).map((v) => clean(v, 500)).filter(Boolean).join(', ');
    if (!key || !val) continue;
    const k = key.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const words = clean(key.replace(/_+/g, ' ').replace(/[?:]+\s*$/, ''), 120);
    const label = LEAD_LABELS[k] || (words ? words[0].toUpperCase() + words.slice(1) : 'Answer');
    if (/<test lead:/i.test(val)) o.test = true;
    o.all.push([label, val]);
    if (k === 'full_name' || k === 'name') { if (!o.name) o.name = clean(val, 120); else o.extra.push([label, val]); }
    else if (k === 'first_name') firstName = val;
    else if (k === 'last_name') lastName = val;
    else if (/(^|_)e_?mail(_|$)/.test(k) && !o.email && emailOk(val.toLowerCase())) o.email = clean(val.toLowerCase(), 200);
    else if (/(^|_)(phone|mobile|cell)(_|$)/.test(k) && !o.phoneRaw) { o.phoneRaw = clean(val, 40); if (digits(val).length === 10) o.phone = digits(val); }
    else if (/(^|_)(zip|zipcode|postal|postcode|post_code)(_|$)/.test(k) && !o.zip && /\d{5}/.test(val)) o.zip = /\d{5}/.exec(val)[0];
    else if ((/(^|_)street(_|$)/.test(k) || (/(^|_)address(_|$)/.test(k) && !/mail/.test(k))) && !o.street) o.street = clean(val, 160);
    else if (k === 'city' && !o.city) o.city = clean(val, 60);
    else if ((k === 'state' || k === 'province') && !o.state) o.state = clean(val, 30);
    else o.extra.push([label, val]);
  }
  if (!o.name) o.name = clean((firstName + ' ' + lastName).trim(), 120);
  return o;
}
function leadState(details) {
  const d = String(details || '');
  return /^\w+ lead ad, not read yet\./.test(d) ? 'stub' : /^\w+ lead ad, email not sent\./.test(d) ? 'nomail' : 'done';
}
// The row the office app lists under Leads. It is a sign up request: someone asked us to reach out and sign them up.
// The details end with the Meta lead id, which is how the same lead is never saved or emailed twice.
function leadRow(p, x, state) {
  const bits = [];
  if (p.test) bits.push('Test lead from Meta’s testing tool');
  if (p.phoneRaw && !p.phone) bits.push('Mobile: ' + p.phoneRaw);
  for (const [l, v] of p.extra) bits.push(l + ': ' + v);
  for (const b of x.boxes) bits.push(b);
  if (x.form) bits.push('Form: ' + x.form);
  if (x.ad) bits.push('Ad: ' + x.ad);
  if (x.campaign) bits.push('Campaign: ' + x.campaign);
  const tail = ' ' + LEAD_TAG + x.id;
  const text = x.src + ' lead ad' + (state === 'nomail' ? ', email not sent. ' : '. ') + bits.map((b) => b.replace(/[.\s]+$/, '')).join('. ') + (bits.length ? '.' : '');
  return { kind: 'signup_request', name: p.name || x.src + ' lead', email: p.email || null, phone: p.phone || null,
    address: clean([p.street, p.city, p.state].filter(Boolean).join(', '), 200) || null, zip: p.zip || null, details: clean(text, 1400 - tail.length) + tail };
}
function leadMail(env, p, x) {
  const where = [p.city, p.zip].filter(Boolean).join(' ');
  const lines = [p.test ? 'This is a test lead from Meta’s testing tool. The lead link works.' : 'A new lead came in from ' + (x.src === 'Instagram' ? 'an Instagram' : 'a Facebook') + ' ad form. Call them to sign them up.', ''];
  for (const [l, v] of p.all) lines.push(l + ': ' + v);
  if (!p.all.length) lines.push('The form sent no answers.');
  for (const b of x.boxes) lines.push(b);
  lines.push('', 'Form: ' + (x.form ? x.form + ' (' + x.formId + ')' : x.formId || 'not given'));
  if (x.ad || x.adId) lines.push('Ad: ' + (x.ad || x.adId));
  if (x.adset) lines.push('Ad set: ' + x.adset);
  if (x.campaign) lines.push('Campaign: ' + x.campaign);
  if (x.organic) lines.push('Paid ad: no. It came from a test or a shared link to the form.');
  lines.push('Sent: ' + x.when + ' Arizona time', 'Lead id: ' + x.id, '', 'It is saved in the office app under Leads: https://' + siteHost(env) + '/crew/');
  return { subject: (p.test ? 'Test lead from ' + x.src : 'New ' + x.src + ' lead') + ': ' + (p.test ? 'the lead link works' : (p.name || 'no name') + (where ? ', ' + where : '')), text: lines.join('\n') };
}
// "Nov 16, 11:40 PM". Newer servers put a thin space that mail programs show badly before AM and PM, so it is made a plain one.
const leadWhen = (v) => { const d = new Date(v); return isNaN(d) ? '' : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Phoenix' }).replace(/[\u202f\u00a0]/g, ' '); };
// Two notices for the same lead can land at once (Meta sends a notice again when an answer is slow). The lower row
// wins and the other one is taken back out, so the office gets one row and one email.
async function leadTwin(env, find, myId) {
  try {
    const rows = await find();
    if (rows.length > 1 && rows[0].id !== myId) { await db(env, 'DELETE', 'leads?id=eq.' + myId, null, 'return=minimal'); return true; }
  } catch (e) { console.error('lead twin check', e); }
  return false;
}
// One lead from a notice. Answers 'done' (saved and emailed, now or before) or 'again' (ask Meta to send it again).
async function metaLeadIn(env, n) {
  const tag = LEAD_TAG + n.id;
  const find = () => db(env, 'GET', 'leads?details=ilike.' + enc('*' + tag) + '&select=id,details&order=id.asc&limit=5');
  let dbUp = sbLive(env), rows = [];
  if (dbUp) { try { rows = (await find()) || []; } catch (e) { dbUp = false; console.error('lead lookup', e); } }
  const known = rows[0] || null;
  if (known && leadState(known.details) === 'done') return 'done';
  const now = () => new Date().toISOString();
  const got = await metaLeadRead(env, n.id, n.page);
  if (!got.ok) {
    if (known) return 'again'; // the office was told once. The row waits for a try that works
    const why = leadWhy(got);
    if (dbUp) {
      let mine = null;
      try {
        mine = ((await db(env, 'POST', 'leads', [{ kind: 'signup_request', name: 'Facebook lead, not read yet',
          details: 'Facebook lead ad, not read yet. Open Meta Business Suite, Leads Center, to see it. ' + why + (n.form ? ' Form ' + n.form + '.' : '') + ' ' + tag }], 'return=representation')) || [])[0] || null;
      } catch (e) { console.error('lead not saved', e); }
      if (mine && mine.id && await leadTwin(env, find, mine.id)) return 'again';
    }
    // With no row to look up, the same server at least does not email the same lead twice.
    if (!META_MEM.told.has(n.id)) {
      if (META_MEM.told.size > 2000) META_MEM.told.clear();
      const told = await mail(env, owner(env), 'New Facebook lead: open Leads Center to read it', [
        'A new lead came in from a Facebook or Instagram ad form, but the site could not read the answers from Meta.', '',
        'To see the lead now: open Meta Business Suite and go to Leads Center. Or open Ads Manager, pick the lead form and download the leads.', '',
        'Lead id: ' + n.id, 'Form id: ' + (n.form || 'not given'), 'Sent: ' + (leadWhen((n.at || 0) * 1000 || Date.now())) + ' Arizona time', '',
        'Why the site could not read it: ' + why, 'What Meta said: ' + (got.err || 'nothing') + (got.code ? ' (code ' + got.code + ')' : ''), '',
        'The site keeps trying for 36 hours. When a try works, you get the full lead by email and the lead in the office app fills in.'
      ].join('\n'));
      if (told) META_MEM.told.add(n.id);
    }
    if (!hitLimit('metalead-read', 1, 3600e3)) await logError(env, 'server', '/api/meta/leadgen', 'A Facebook lead could not be read from Meta', why + ' What Meta said: ' + (got.err || 'nothing') + (got.code ? ' (code ' + got.code + ')' : '') + '. Lead id ' + n.id + '. The office was emailed to read it in Leads Center. Meta sends the notice again for 36 hours. GO_LIVE.md part 11 has the token steps.');
    return 'again';
  }
  const lead = got.lead, p = leadParse(lead.field_data);
  const x = { id: n.id, src: String(lead.platform || '').toLowerCase() === 'ig' ? 'Instagram' : 'Facebook', formId: numId(lead.form_id) || n.form, adId: numId(lead.ad_id) || n.ad,
    ad: clean(lead.ad_name, 150), adset: clean(lead.adset_name, 150), campaign: clean(lead.campaign_name, 150), organic: lead.is_organic === true,
    boxes: (Array.isArray(lead.custom_disclaimer_responses) ? lead.custom_disclaimer_responses.slice(0, 10) : []).map((b) => 'Checked the box "' + clean(String(b && b.checkbox_key || '').replace(/_+/g, ' '), 80) + '": ' + (b && (b.is_checked === true || b.is_checked === '1' || b.is_checked === 1) ? 'yes' : 'no')),
    when: leadWhen(lead.created_time) || leadWhen((n.at || 0) * 1000 || Date.now()) };
  x.form = await metaFormName(x.formId, got.token);
  let rowId = known ? known.id : 0;
  if (dbUp) {
    try {
      if (known) await db(env, 'PATCH', 'leads?id=eq.' + known.id, Object.assign(leadRow(p, x, 'nomail'), { updated_at: now() }), 'return=minimal');
      else {
        const made = ((await db(env, 'POST', 'leads', [leadRow(p, x, 'nomail')], 'return=representation')) || [])[0];
        rowId = made && made.id ? made.id : 0;
        if (rowId && await leadTwin(env, find, rowId)) return 'done';
      }
    } catch (e) { dbUp = false; console.error('lead not saved', e); }
  }
  const m = leadMail(env, p, x);
  const sent = await mail(env, owner(env), m.subject, m.text);
  if (!sent) {
    // Saved or not, the office has not been told. Meta sends the notice again, and the email goes out then.
    if (!hitLimit('metalead-mail', 1, 3600e3)) await logError(env, 'server', '/api/meta/leadgen', 'A Facebook lead came in but the email to the office did not send', (dbUp && rowId ? 'The lead is saved in the office app under Leads. ' : 'The lead is NOT saved either. ') + 'Lead id ' + n.id + '. Meta sends the notice again for 36 hours. Check RESEND_API_KEY and the Resend account.');
    return 'again';
  }
  if (dbUp && rowId) {
    try { await db(env, 'PATCH', 'leads?id=eq.' + rowId, { details: leadRow(p, x, 'done').details, updated_at: now() }, 'return=minimal'); } catch (e) { console.error('lead row not finished', e); }
  } else console.error('a Facebook lead was emailed to the office but not saved', n.id);
  return 'done';
}
// A row saved as "not read yet" whose 36 hours with Meta ran out stays that way. So when a lead has just been read,
// which proves the token works, up to two old ones are tried again.
async function metaLeadHeal(env, pageId) {
  try {
    const rows = (await db(env, 'GET', 'leads?details=ilike.' + enc('*lead ad, not read yet.*') + '&created_at=gte.' + enc(new Date(Date.now() - 60 * 86400e3).toISOString()) + '&select=id,details&order=id.desc&limit=2')) || [];
    for (const r of rows) {
      const m = new RegExp(LEAD_TAG + '(\\d{5,30})$').exec(String(r.details || ''));
      if (m) await metaLeadIn(env, { id: m[1], page: pageId, form: '', ad: '', at: 0 });
    }
  } catch (e) { console.error('lead heal', e); }
}
async function metaLeads(request, env, ctx) {
  const payload = await readText(request);
  if (payload == null) return fail(413, 'That is too much to send at once.');
  const later = (p) => { if (ctx && ctx.waitUntil) ctx.waitUntil(p); };
  if (!env.META_APP_SECRET) {
    // Without the app secret a real notice cannot be told from a fake one, so nothing is taken. Meta sends it again.
    if (!hitLimit('metalead-nosecret', 1, 3600e3)) later(logError(env, 'server', '/api/meta/leadgen', 'A Facebook lead notice came in, but META_APP_SECRET is not set',
      'The site cannot tell a real notice from a fake one without the app secret, so it took nothing. Meta sends each notice again for 36 hours. Add META_APP_SECRET in Cloudflare (GO_LIVE.md part 11) and redeploy. Until then, read new leads in Meta Business Suite, Leads Center.'));
    return fail(503, 'Lead ads are not set up yet.');
  }
  if (!(await metaSigned(payload, request.headers.get('x-hub-signature-256'), env.META_APP_SECRET))) {
    if (!hitLimit('metalead-badsig', 1, 3600e3)) later(logError(env, 'server', '/api/meta/leadgen', 'A Facebook lead notice was refused: its signature does not match META_APP_SECRET',
      'If this keeps coming back, the app secret in Cloudflare is not the one the Meta app shows (App settings, Basic, App secret), or it was reset in Meta. Until it is fixed no Facebook lead reaches the office: read them in Meta Business Suite, Leads Center.'));
    return fail(401, 'Bad signature.');
  }
  let evt = null;
  try { evt = JSON.parse(payload); } catch (e) { evt = null; }
  if (!evt || typeof evt !== 'object') return fail(400, 'That is not a notice we can read.');
  if (evt.object !== 'page') return ok({ ok: true, leads: 0 });
  const list = [], seen = new Set();
  let test = false;
  for (const en of Array.isArray(evt.entry) ? evt.entry : []) {
    for (const ch of Array.isArray(en && en.changes) ? en.changes : []) {
      const v = ch && ch.field === 'leadgen' && ch.value && typeof ch.value === 'object' ? ch.value : null;
      const id = v ? numId(v.leadgen_id) : '';
      if (id.length < 5 || seen.has(id)) continue;
      seen.add(id);
      const page = numId(v.page_id) || numId(en.id);
      // The Test button on the Meta app's Webhooks page sends a made up lead, all fours. There is nothing to read.
      if (/^4{9,}$/.test(id)) { test = true; continue; }
      if (env.META_PAGE_ID && page && page !== String(env.META_PAGE_ID)) continue;
      list.push({ id, page, form: numId(v.form_id), ad: numId(v.ad_id), at: Number(v.created_time) || 0 });
    }
  }
  if (test && !hitLimit('metalead-test', 1, 600e3)) {
    later(mail(env, owner(env), 'Facebook leads: Meta’s test notice reached the site', 'Someone pressed Test on the Meta app’s Webhooks page, and the site got the notice. It was signed with the right app secret.\n\nThat test lead is made up, so there is nothing to read or save. To try a real one, make a test lead with Meta’s Lead Ads Testing Tool (developers.facebook.com/tools/lead-ads-testing). A "Test lead from Facebook" email should reach this inbox in about a minute.'));
  }
  // A long notice is worked off a few leads at a time. The ones already finished are found with one look at the table,
  // so each time Meta sends the notice again the next few get done.
  let todo = list, done = 0, page = '';
  if (list.length > LEADS_A_CALL && sbLive(env)) {
    try {
      const rows = (await db(env, 'GET', 'leads?details=ilike.' + enc('*' + LEAD_TAG + '*') + '&created_at=gte.' + enc(new Date(Date.now() - 4 * 86400e3).toISOString()) + '&select=details&order=id.desc&limit=1000')) || [];
      const fin = new Set(rows.filter((r) => leadState(r.details) === 'done').map((r) => (/(\d{5,30})$/.exec(String(r.details || '')) || [])[1]));
      todo = list.filter((n) => !fin.has(n.id));
      done = list.length - todo.length;
    } catch (e) { todo = list; done = 0; }
  }
  let again = todo.length > LEADS_A_CALL;
  for (const n of todo.slice(0, LEADS_A_CALL)) {
    let r = 'again';
    try { r = await metaLeadIn(env, n); } catch (e) { console.error('lead failed', e && e.stack || e); later(logError(env, 'server', '/api/meta/leadgen', 'A Facebook lead could not be handled', (e && e.message) + '. Lead id ' + n.id + '. Meta sends the notice again for 36 hours.')); }
    if (r === 'done') { done++; page = n.page; } else again = true;
  }
  if (done && list.length <= 2 && sbLive(env)) await metaLeadHeal(env, page);
  // Anything but 200 makes Meta send the whole notice again, for 36 hours. Leads that are finished are skipped then.
  return again ? fail(503, 'Some leads are not finished. Send this notice again.') : ok({ ok: true, leads: done });
}
// What the Page and the token look like from here, and the one step the server can do itself: tell Meta that the
// Page sends its new leads to this app. It keeps the other things the app already listens for on the Page.
async function metaSetup(env) {
  const out = { ok: false, appSecret: !!env.META_APP_SECRET, verifyToken: !!env.META_VERIFY_TOKEN, pageToken: !!env.META_PAGE_TOKEN, page: null, app: null, subscribed: false, note: '' };
  const tok = env.META_PAGE_TOKEN;
  if (!tok) { out.note = 'META_PAGE_TOKEN is not set in Cloudflare, so the site cannot read a lead.'; return out; }
  const me = await graph('me?fields=id,name', tok);
  if (!me.ok) { out.note = 'Meta refused META_PAGE_TOKEN. ' + leadWhy(me) + ' What Meta said: ' + me.err; return out; }
  let page = { id: numId(me.data.id), name: clean(me.data.name, 120) }, pageTok = tok;
  // A Page's own token answers "me" with the Page. A person's or a system user's token lists the Pages it can act for.
  const acc = await graph('me/accounts?fields=id,name,access_token&limit=100', tok);
  if (acc.ok && Array.isArray(acc.data.data)) {
    const pages = acc.data.data;
    const pick = (env.META_PAGE_ID && pages.find((x) => String(x.id) === String(env.META_PAGE_ID))) || (pages.length === 1 ? pages[0] : pages.find((x) => /arizona pet waste/i.test(String(x.name || ''))));
    if (!pick) {
      out.note = pages.length ? 'The token can act for ' + pages.length + ' Pages and the site cannot tell which one is ours. Add META_PAGE_ID in Cloudflare with the Page id.'
        : 'The token cannot act for any Page. In Business Settings, give its system user the Arizona Pet Waste Page, then make the token again.';
      return out;
    }
    page = { id: numId(pick.id), name: clean(pick.name, 120) };
    if (typeof pick.access_token === 'string' && pick.access_token) pageTok = pick.access_token;
  }
  if (!page.id) { out.note = 'Meta did not say which Page the token is for.'; return out; }
  out.page = page;
  const app = await graph('app?fields=id,name', tok);
  if (app.ok) out.app = { id: numId(app.data.id), name: clean(app.data.name, 120) };
  const cur = await graph(page.id + '/subscribed_apps', pageTok);
  const mine = cur.ok && out.app && Array.isArray(cur.data.data) ? cur.data.data.find((a) => String(a.id) === out.app.id) : null;
  const fields = mine && Array.isArray(mine.subscribed_fields) ? mine.subscribed_fields.map(String).filter((f) => /^[a-z_]{2,60}$/.test(f)) : [];
  if (fields.includes('leadgen')) out.subscribed = true;
  else {
    const sub = await graph(page.id + '/subscribed_apps?subscribed_fields=' + [...new Set(fields.concat('leadgen'))].join(','), pageTok, 'POST');
    if (!sub.ok) { out.note = 'The site could not set the Page to send its leads here. The token needs the pages_manage_metadata right. What Meta said: ' + sub.err; return out; }
    out.subscribed = true;
  }
  if (!out.appSecret) { out.note = 'META_APP_SECRET is not set in Cloudflare, so the site refuses every lead notice.'; return out; }
  out.ok = true;
  return out;
}
async function metaSetupMail(env) {
  const s = await metaSetup(env);
  const tool = 'Make a test lead with Meta’s Lead Ads Testing Tool (developers.facebook.com/tools/lead-ads-testing). A "Test lead from Facebook" email should reach this inbox in about a minute.';
  if (s.ok) {
    await mail(env, owner(env), 'Facebook leads are connected to the site', [
      'Meta just checked the lead link, and it works.', '',
      'Page: ' + s.page.name + ' (' + s.page.id + ')', 'Meta app: ' + (s.app ? s.app.name : 'not read'), 'The Page is set to send its new leads to the site.', '',
      'Next: ' + tool, '',
      'One thing the site cannot see from here: the Meta app has to be published. An app that is still in development only gets test leads.'
    ].join('\n'));
  } else {
    await mail(env, owner(env), 'Facebook leads: the setup needs one more step', [
      'Meta just checked the lead link and the address is right. One thing is still missing, so leads will not reach this inbox yet.', '',
      'What is missing: ' + s.note, '',
      'The steps are in GO_LIVE.md part 11. After the fix, press Verify and save again on the Meta app’s Webhooks page and a new email comes.', '',
      'Until then, read new leads in Meta Business Suite, Leads Center.'
    ].join('\n'));
    await logError(env, 'server', '/api/meta/leadgen', 'Facebook leads are not fully set up', s.note);
  }
}
// GET /api/meta/leadgen. Meta calls it once when someone saves the address on the Meta app's Webhooks page: the verify
// token has to match, and the number Meta sent is said back. A person can call it too, with ?check= and the verify
// token, to see how the setup stands. Both make sure the Page sends its leads here.
async function metaVerify(request, env, ctx) {
  const q = new URL(request.url).searchParams;
  if (hitLimit('metaverify|' + (request.headers.get('cf-connecting-ip') || ''), 30, 600e3)) return fail(429, 'Too many tries. Wait a minute, then try again.');
  const given = q.get('hub.verify_token') || q.get('check') || '';
  if (!env.META_VERIFY_TOKEN || !sameSecret(given, env.META_VERIFY_TOKEN)) return fail(403, 'Wrong verify token.');
  if (q.get('check')) return ok(await metaSetup(env));
  if (q.get('hub.mode') !== 'subscribe') return fail(400, 'Nothing to do.');
  if (!hitLimit('metasetup', 1, 300e3) && ctx && ctx.waitUntil) ctx.waitUntil(metaSetupMail(env).catch((e) => console.error('meta setup', e)));
  const ch = String(q.get('hub.challenge') || '');
  return new Response(/^[\w.-]{1,200}$/.test(ch) ? ch : '', { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } });
}

async function logError(env, source, path, message, detail) {
  if (!sbLive(env)) return;
  try {
    await db(env, 'POST', 'errors', { source: clean(source, 20), path: clean(path, 200), message: clean(message, 300) || 'Unknown error', detail: String(detail || '').slice(0, 1500) || null }, 'return=minimal');
  } catch (e) { console.error('log error', e); }
}
async function clientLog(request, env) {
  const b = (await body(request)) || {};
  const source = ['crew', 'truck'].includes(b.source) ? b.source : null;
  if (!source || !sbLive(env) || !clean(b.message, 300)) return ok({ ok: true });
  // A cap so a broken phone or a stranger cannot fill the table.
  const recent = await db(env, 'GET', 'errors?at=gte.' + enc(new Date(Date.now() - 3600e3).toISOString()) + '&source=in.(crew,truck)&select=id&limit=60');
  if (recent.length < 60) await logError(env, source, b.path, b.message, b.detail);
  return ok({ ok: true });
}
// "Clear the list" on the Health tab. Nothing is deleted: the time is saved, and the list shows what came in after it.
async function officeHealthClear(env) {
  await db(env, 'POST', 'settings?on_conflict=key', [{ key: 'health_cleared_at', value: new Date().toISOString(), updated_at: new Date().toISOString() }], 'resolution=merge-duplicates,return=minimal');
  return officeHealth(env);
}
async function officeHealth(env) {
  const hour = new Date(Date.now() - 3600e3).toISOString();
  let cleared = null;
  try { const c = (await db(env, 'GET', 'settings?key=eq.health_cleared_at&select=value'))[0]; if (c && Date.parse(c.value)) cleared = new Date(Date.parse(c.value)).toISOString(); } catch (e) { cleared = null; }
  let nightRan = null;
  try { const n = (await db(env, 'GET', 'settings?key=eq.night_before_ran_at&select=value'))[0]; if (n && Date.parse(n.value)) nightRan = n.value; } catch (e) { nightRan = null; }
  const [errors, pings, live1, queued, lock] = await Promise.all([
    db(env, 'GET', 'errors?select=id,at,source,path,message&order=at.desc&limit=200' + (cleared ? '&at=gt.' + enc(cleared) : '')),
    db(env, 'GET', 'positions?select=at&order=at.desc&limit=1'),
    db(env, 'GET', 'routes?day=eq.' + azToday() + '&status=eq.live&select=id'),
    db(env, 'GET', 'messages?status=eq.queued&select=id'),
    db(env, 'GET', 'auth_tries?select=id&limit=1').then(() => true, () => false)
  ]);
  return ok({
    checks: {
      desk: true,
      booking: live(env),
      map: !!(env.GOOGLE_MAPS_BROWSER_KEY && env.GOOGLE_MAPS_SERVER_KEY),
      texts: smsOn(env),
      signLock: lock,
      botCheck: !!env.TURNSTILE_SITE_KEY
    },
    textsTest: smsAllow(env) ? smsAllow(env).size : null, nightRanAt: nightRan, timesOn: await schedOn(env),
    liveRoutes: live1.length, lastPing: pings[0] ? pings[0].at : null, queuedTexts: queued.length,
    errorsLastHour: errors.filter((e) => e.at >= hour).length, errors, cleared
  });
}

/* ---------- My Yard: visit history with gate photos ---------- */
async function meVisits(request, env) {
  if (!sbLive(env)) return fail(503, 'My Yard is not turned on yet. ' + CALL_US);
  const u = await signedIn(request, env);
  if (!u) return fail(401, 'Please sign in again.');
  const rows = await db(env, 'GET', 'stops?customer_id=eq.' + u.id + '&day=lte.' + azToday() + '&status=in.(done,cant,skipped)&select=day,status,reason,note,photo_path,done_at&order=day.desc&limit=12');
  const visits = [];
  for (const r of rows) visits.push({ day: r.day, status: r.status, reason: r.reason ? REASONS[r.reason] : null, note: r.note, doneAt: r.done_at, photo: await photoUrl(env, r.photo_path), photoAt: (photoWhen(r.photo_path) || {}).at || null, timeTyped: !!(photoWhen(r.photo_path) || {}).manual });
  // Today's visit, so My Yard can show one big "See our truck" button on visit day. It is the same truck link the
  // "on the way" text carries (/t/CODE), for this customer's own stop only.
  let today = null;
  try {
    const t = (await db(env, 'GET', 'stops?customer_id=eq.' + u.id + '&day=eq.' + azToday() + '&select=code,status&limit=1'))[0];
    if (t && t.code && ['scheduled', 'on_the_way', 'here', 'done'].includes(t.status)) today = { code: t.code, status: t.status };
  } catch (e) { today = null; }
  return ok({ visits, today });
}

/* =====================================================================================================
   My Yard self service: bills, next visits, skip a visit, pause and start again.
   Skips live in customers.skips (a list of dates). Until that column is added, skip falls back to a text.
   ===================================================================================================== */
const SKIPS_A_YEAR = 4, PAUSE_MAX_DAYS = 120;
async function skippedOn(env, day) {
  try { return new Set((await db(env, 'GET', 'customers?skips=cs.{' + day + '}&select=id')).map((x) => x.id)); } catch (e) { return new Set(); }
}
async function myRow(env, id) {
  const base = 'plan,dogs,status,first_visit,service_day,service_day2,eow_week,pause_from,pause_until,stripe_customer_id,stripe_subscription_id,name,phone,address,zip';
  try { const r = await db(env, 'GET', 'customers?id=eq.' + id + '&select=' + base + ',skips'); return r[0] ? Object.assign(r[0], { skipReady: true, skips: [...new Set((r[0].skips || []).map((d) => String(d).slice(0, 10)))] }) : null; }
  catch (e) { const r = await db(env, 'GET', 'customers?id=eq.' + id + '&select=' + base); return r[0] ? Object.assign(r[0], { skipReady: false, skips: [] }) : null; }
}
function nextVisits(c, from, n) {
  const out = [];
  if (c.service_day == null && c.service_day2 == null) return out;
  for (let i = 0; i < 70 && out.length < n; i++) {
    const d = addDays(from, i), wd = weekday(d);
    if (wd !== c.service_day && wd !== c.service_day2) continue;
    if (c.plan === 'eow' && weekParity(d) !== (c.eow_week || 0)) continue;
    if (c.first_visit && d < c.first_visit) continue;
    out.push(d);
  }
  return out;
}
// The day the month they paid for runs out: their next bill day. Stripe keeps it on each line of the plan.
function paidUntil(sub) {
  const ends = ((sub && sub.items && sub.items.data) || []).map((i) => Number(i.current_period_end) || 0);
  return Math.max(0, Number(sub && sub.current_period_end) || 0, ...ends);
}
// Pausing opens after the first 60 days (pause_from on the plan), so a pause cannot be used to stretch a free month.
const pauseOpens = (sub) => parseInt(((sub && sub.metadata) || {}).pause_from || ((sub && sub.metadata) || {}).min_end || '0', 10) || 0;
// One look at the plan in Stripe for My Yard: when pausing opens, the next bill day, and how a pause that is on ends.
//  billDay: their next bill day, when the plan is running. My Yard names it next to the pause button.
//  back:    the day they come back, when the pause runs past their bill day. The full month is charged that day.
//  keep:    their old bill day, while it is still ahead. Coming back before it keeps it, and nothing is charged early.
async function planInfo(env, c) {
  const out = { minEnd: 0, billDay: 0, back: 0, keep: 0 };
  if (!c.stripe_subscription_id) return out;
  try {
    const sub = await stripe(env, 'GET', 'subscriptions/' + enc(c.stripe_subscription_id));
    const md = sub.metadata || {};
    out.minEnd = pauseOpens(sub);
    if (sub.status === 'trialing' && md.pause_until) { out.back = parseInt(md.pause_until, 10) || 0; out.keep = parseInt(md.paid_until || '0', 10) || 0; }
    else if (sub.status === 'active' && !sub.pause_collection) out.billDay = paidUntil(sub);
  } catch (e) { /* My Yard still loads without it */ }
  return out;
}
function planView(c, info) {
  info = info || {};
  const today = azToday(), nowS = Date.now() / 1000;
  const early = !!info.minEnd && nowS < info.minEnd;
  const paused = c.status === 'paused';
  // A failed bill puts visits on hold until it is paid, so My Yard shows no next visits then.
  const hold = c.status === 'past_due' || c.status === 'unpaid';
  const days = PAYING.includes(c.status) && !hold ? nextVisits(c, addDays(today, 1), 3) : [];
  const used = c.skips.filter((d) => d.slice(0, 4) === today.slice(0, 4)).length;
  const total = PLANS[c.plan] ? money(rowMonthly(c)) : '';
  return {
    dayName: c.service_day != null ? DAYS[c.service_day] + (c.service_day2 != null ? ' and ' + DAYS[c.service_day2] : '') : null,
    next: days.map((d) => ({ day: d, skipped: c.skips.includes(d), canSkip: d >= addDays(today, 2) })),
    skipReady: c.skipReady, skipsLeft: Math.max(0, SKIPS_A_YEAR - used),
    hold, paused, pauseUntil: paused && c.pause_until ? addDays(c.pause_until, 1) : null,
    // What this customer pays a month ("$108"). My Yard shows this, so a plan that keeps an older price reads right.
    month: total || null,
    canPause: !early && ['trialing', 'active'].includes(c.status) && !!c.stripe_subscription_id, pauseMax: addDays(today, PAUSE_MAX_DAYS),
    pauseAfter: early ? dateLabel(new Date(info.minEnd * 1000)) : null,
    // What My Yard says about money next to the pause button. Plain facts only: the page writes the sentences.
    billDay: !paused && info.billDay > nowS ? dateLabel(new Date(info.billDay * 1000)) : null,
    backCharge: paused && info.back ? { amount: total, keepDay: info.keep > nowS ? dateLabel(new Date(info.keep * 1000)) : null } : null
  };
}
async function me2(request, env) {
  if (!live(env)) return { err: fail(503, 'My Yard is not turned on yet. ' + CALL_US) };
  const u = await signedIn(request, env);
  if (!u) return { err: fail(401, 'Please sign in again.') };
  const c = await myRow(env, u.id);
  if (!c) return { err: fail(404, 'Finish signing up first.') };
  return { u, c };
}
async function mePlan(request, env) {
  const x = await me2(request, env);
  return x.err || ok({ plan: planView(x.c, await planInfo(env, x.c)) });
}
async function meInvoices(request, env) {
  const x = await me2(request, env);
  if (x.err) return x.err;
  if (!selfOn(env)) return ok({ invoices: [] }); // bills are not shown in My Yard for now: the office reads them out
  if (!x.c.stripe_customer_id) return ok({ invoices: [] });
  let r;
  try { r = await stripe(env, 'GET', 'invoices', { customer: x.c.stripe_customer_id, limit: 12 }); }
  catch (e) { if (!stripeGone(e, 'customer')) throw e; return ok({ invoices: [] }); } // Stripe no longer has this customer: there are no bills to show
  return ok({ invoices: (r.data || []).filter((i) => i.status !== 'draft' && i.status !== 'void').map((i) => ({
    date: new Date(i.created * 1000).toISOString().slice(0, 10), amount: i.total, status: i.status, url: i.hosted_invoice_url || null })) });
}
async function meSkip(request, env, ctx) {
  const x = await me2(request, env);
  if (x.err) return x.err;
  const c = x.c, b = (await body(request)) || {};
  if (!c.skipReady) return fail(503, 'Skips are not turned on yet. Text 623.309.6104 and we will skip it for you.');
  const day = String(b.date || '');
  const view = planView(c);
  const hit = view.next.find((v) => v.day === day);
  if (!isDay(day) || !hit) return fail(400, 'Pick one of your next visits.');
  let skips;
  if (b.undo) skips = c.skips.filter((d) => d !== day);
  else {
    if (hit.skipped) return ok({ plan: view });
    if (!hit.canSkip) return fail(400, 'That visit is less than 24 hours away. Text 623.309.6104 and we will try.');
    if (view.skipsLeft < 1) return fail(400, 'You have used your 4 free skips this year. Text 623.309.6104 for help.');
    skips = c.skips.concat(day);
  }
  await db(env, 'PATCH', 'customers?id=eq.' + x.u.id, { skips, updated_at: new Date().toISOString() }, 'return=minimal');
  if (!b.undo) await db(env, 'DELETE', 'stops?customer_id=eq.' + x.u.id + '&status=eq.scheduled&day=eq.' + day, null, 'return=minimal').catch((e) => console.error('skip cleanup', e));
  ctx.waitUntil(mail(env, owner(env), (b.undo ? 'Skip undone: ' : 'Skip: ') + c.name + ', ' + day, c.name + (b.undo ? ' wants the visit on ' : ' skipped the visit on ') + day + '.\n\nAddress: ' + c.address + ', ' + c.zip +
    (b.undo ? '\n\nAdd the stop back to the route in the office.' : '')));
  return ok({ plan: planView(Object.assign(c, { skips })) });
}
// Pause (Joe, Nov 16, 2026, late): when a paused customer comes back, the full month is charged on the day they come
// back, and that day is their new bill day. No part month. There are two kinds of pause, told apart by their bill day:
//  1. The pause runs to or past their next bill day. That bill is skipped. In Stripe the plan gets a free time that
//     ends on the day they come back (`trial_end`, with `proration_behavior: none`). On that day Stripe itself makes
//     one bill for the full month and bills on that day of the month from then on. This is Stripe's own way to move a
//     bill day ("Change the billing period using a trial period"), and it needs nothing from this server on the day.
//     Stripe shows such a plan as "trialing". Its metadata says it is a pause (pause_until, paid_until), and
//     planStatus reads it as "paused".
//  2. The pause ends before their next bill day. They are inside a month they already paid for, so billing is left
//     alone: charging them the day they come back would bill the same days twice. Stripe only holds the plan
//     (pause_collection) and lets go on the day, which is what tells this server they are back.
// Never reset the bill day with billing_cycle_anchor here: on these plans (Stripe's flexible billing mode) that
// makes no bill at all, or a bill for part of a month.
async function mePause(request, env, ctx) {
  const x = await me2(request, env);
  if (x.err) return x.err;
  const c = x.c, b = (await body(request)) || {};
  const until = String(b.until || ''), today = azToday();
  if (!['trialing', 'active'].includes(c.status) || !c.stripe_subscription_id) return fail(400, 'We could not pause this plan. ' + CALL_US);
  const id = enc(c.stripe_subscription_id);
  let sub;
  try { sub = await stripe(env, 'GET', 'subscriptions/' + id); }
  catch (e) { if (!stripeGone(e)) throw e; return fail(400, 'We could not pause this plan. ' + CALL_US); }
  const minEnd = pauseOpens(sub);
  if (minEnd && Date.now() / 1000 < minEnd) return fail(400, 'You can pause after ' + dateLabel(new Date(minEnd * 1000)) + '. Need a break before then? Skip a visit, or text 623.309.6104.');
  if (!isDay(until) || until <= today) return fail(400, 'Pick the day you want us to start again.');
  if (until > addDays(today, PAUSE_MAX_DAYS)) return fail(400, 'You can pause for up to 120 days.');
  // Only a plan that is running and paid up. A plan still in its free month is never paused: that would move the
  // day the free month ends. (Pausing opens after the first 60 days, so this is a second lock on the same door.)
  if (sub.status !== 'active' || sub.pause_collection) return fail(400, 'We could not pause this plan. ' + CALL_US);
  const back = unix(noonAZ(until)), paidTo = paidUntil(sub);
  const skips = paidTo > 0 && back >= paidTo;
  if (skips) await stripe(env, 'POST', 'subscriptions/' + id, { trial_end: back, proration_behavior: 'none', metadata: { pause_until: String(back), paid_until: String(paidTo) } });
  else await stripe(env, 'POST', 'subscriptions/' + id, { pause_collection: { behavior: 'void', resumes_at: back } });
  const patch = { status: 'paused', pause_from: today, pause_until: addDays(until, -1), updated_at: new Date().toISOString() };
  await db(env, 'PATCH', 'customers?id=eq.' + x.u.id, patch, 'return=minimal');
  await db(env, 'DELETE', 'stops?customer_id=eq.' + x.u.id + '&status=eq.scheduled&day=gte.' + today + '&day=lt.' + until, null, 'return=minimal').catch((e) => console.error('pause cleanup', e));
  const total = PLANS[c.plan] ? money(rowMonthly(c)) : 'the full month';
  const backDay = dateLabel(noonAZ(until)), billDay = paidTo ? dateLabel(new Date(paidTo * 1000)) : '';
  ctx.waitUntil(mail(env, owner(env), 'Paused: ' + c.name, [
    c.name + ' paused until ' + until + '. No bills go out while paused.',
    skips ? 'Their bill day (' + billDay + ') falls inside the pause, so that bill is skipped. Stripe charges ' + total + ' on ' + backDay + ', the day they come back. That day is their new bill day.'
      : 'Their pause ends before their next bill day' + (billDay ? ' (' + billDay + ')' : '') + ', so their bills do not change.',
    skips ? 'In Stripe this plan reads "Trialing" until ' + backDay + '. That is the pause, not a free month.' : null, '',
    'Address: ' + c.address + ', ' + c.zip
  ].filter((v) => v !== null).join('\n')));
  // The customer hears what the pause does to their bill before it happens: we never bill something they were not told.
  const m = brandMail(env, 'You are paused', ['Hi ' + (first(c.name) || 'there') + ',',
    'Your visits are paused. We start again on ' + longDay(noonAZ(until)) + '.',
    skips ? 'You pay nothing while you are paused. On ' + backDay + ' we charge your card ' + total + ' for the month ahead. From then on, that day of the month is your bill day.'
      : 'Your bill day stays the same.' + (billDay ? ' Your next bill is ' + total + ' on ' + billDay + '.' : ''),
    'Want to come back sooner? Sign in to My Yard and tap Start again now.',
    'Questions? Call or text 623.309.6104.'], null, []);
  if (x.u.email) ctx.waitUntil(mail(env, x.u.email, 'Your visits are paused until ' + backDay, m.text, m.html));
  return ok({ plan: planView(Object.assign(c, patch), { back: skips ? back : 0, keep: skips ? paidTo : 0 }) });
}
// "Start again now" in My Yard, before the day they picked.
async function meResume(request, env, ctx) {
  const x = await me2(request, env);
  if (x.err) return x.err;
  const c = x.c;
  if (c.status !== 'paused' || !c.stripe_subscription_id) return fail(400, 'Your plan is not paused.');
  const id = enc(c.stripe_subscription_id);
  let sub;
  try { sub = await stripe(env, 'GET', 'subscriptions/' + id); }
  catch (e) { if (!stripeGone(e)) throw e; return fail(400, 'We could not start this plan again. ' + CALL_US); }
  const md = sub.metadata || {};
  let s, charged = false;
  if (sub.status === 'trialing' && md.pause_until) {
    // A pause that was set to run past their bill day (kind 1 in mePause).
    const paidTo = parseInt(md.paid_until || '0', 10) || 0;
    if (paidTo > Date.now() / 1000 + 300) {
      // They are back before the month they paid for runs out. Nothing is charged today: their old bill day is put
      // back, and Stripe bills the full month on it as it always did.
      s = await stripe(env, 'POST', 'subscriptions/' + id, { trial_end: paidTo, proration_behavior: 'none', metadata: { pause_until: '' } });
    } else {
      // The month they paid for ran out during the pause. Stripe bills the full month now, and today is the bill day.
      s = await stripe(env, 'POST', 'subscriptions/' + id, { trial_end: 'now', proration_behavior: 'none', metadata: { pause_until: '', paid_until: '' } });
      charged = true;
      ctx.waitUntil(pauseTidy(env, s));
    }
  } else {
    s = await stripe(env, 'POST', 'subscriptions/' + id, { pause_collection: '' });
  }
  const now = planStatus(s || {});
  const patch = { status: !now || now === 'paused' ? 'active' : now, pause_from: null, pause_until: null, updated_at: new Date().toISOString() };
  await db(env, 'PATCH', 'customers?id=eq.' + x.u.id, patch, 'return=minimal');
  backMails(env, ctx, Object.assign({}, c, { email: x.u.email }), charged);
  return ok({ plan: planView(Object.assign(c, patch)), charged });
}


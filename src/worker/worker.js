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
// With the keys missing, /api/config says live: false and the site runs its demo sign up.

const STRIPE_VERSION = '2026-10-28.endive';
const PLANS = {
  week: { name: 'Every week', base: 10800, extra: 1300 },
  twice: { name: 'Twice a week', base: 18900, extra: 1300 },
  eow: { name: 'Every other week', base: 7500, extra: 900 }
};
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
  visit: 'Text me about my visits. Setting your day, night before reminders, on the way, and your gate photo. About 2 to 4 texts a visit.',
  deals: 'Text me deals too. Up to 4 texts a month.',
  fine: 'By checking a box, you agree to get texts from Arizona Pet Waste at the number above. Message and data rates may apply. Reply STOP to stop or HELP for help. You do not have to agree to texts to book. See our Text Terms and Privacy Policy.'
};
const CALL_US = 'Call or text 623.309.6104 and we will help.';

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
  if (path === '/api/stripe-webhook' && m === 'POST') return webhook(request, env, ctx);
  if (path === '/api/waitlist' && m === 'POST') return waitlist(request, env, ctx);
  if (path === '/api/request' && m === 'POST') return signupRequest(request, env, ctx);
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
  if (path === '/api/health' && m === 'GET') return ok({ ok: true, live: live(env), desk: sbLive(env) });
  if (path === '/api/log' && m === 'POST') return clientLog(request, env);
  if (/^\/api\/(staff|crew|office|track)\//.test(path)) return desk(path, request, env, ctx);
  return fail(404, 'Not found.');
}

/* ---------- helpers ---------- */
function ok(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
}
function fail(status, error, code) { return ok({ error, code }, status); }
function live(env) {
  return !!(env.SUPABASE_URL && env.SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_ROLE_KEY && env.STRIPE_SECRET_KEY && env.STRIPE_PUBLISHABLE_KEY);
}
// The field desk only needs Supabase, so the crew app works before Stripe is live.
function sbLive(env) { return !!(env.SUPABASE_URL && env.SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_ROLE_KEY); }
const clean = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, n);
const digits = (v) => { let d = String(v || '').replace(/\D/g, ''); if (d.length === 11 && d[0] === '1') d = d.slice(1); return d; };
const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e || '');
const base = (env) => String(env.SUPABASE_URL || '').replace(/\/$/, '');
async function body(request) {
  try { return await request.json(); } catch (e) { return null; }
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
  const r = await fetch(base(env) + '/auth/v1/user', { headers: { apikey: env.SUPABASE_ANON_KEY, authorization: 'Bearer ' + token } });
  if (!r.ok) return null;
  const u = await r.json();
  return u && u.id && u.email ? { id: u.id, email: String(u.email).toLowerCase() } : null;
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
    throw e;
  }
  return data;
}
function money(cents) { return '$' + (cents / 100).toFixed(cents % 100 ? 2 : 0); }
function monthly(plan, dogs) { const p = PLANS[plan]; return p.base + Math.max(0, dogs - 2) * p.extra; }

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
// Everyone pays on the 1st. The free month runs one month and one week from the soonest start day (that week is our
// window to set the first visit). The first charge is on the 1st of the month the free month ends in, and it only covers
// the days after the free month (Stripe bills the full month and a one time credit takes off the free days).
// Then the full price on every 1st. The sign up page uses the same rule to show these numbers.
function firstCharge(env, totalCents) {
  const from = noonAZ(env.FIRST_VISIT_FROM || '2026-11-20');
  const start = new Date(Math.max(noonAZ(azToday()).getTime() + 86400e3, from.getTime()));
  const freeEnd = plusMonth(start);
  freeEnd.setUTCDate(freeEnd.getUTCDate() + (Number(env.SCHEDULE_DAYS) || 7));
  const first = new Date(Date.UTC(freeEnd.getUTCFullYear(), freeEnd.getUTCMonth(), 1, 19));
  const next = new Date(Date.UTC(freeEnd.getUTCFullYear(), freeEnd.getUTCMonth() + 1, 1, 19));
  const monthDays = Math.round((next - first) / 86400e3);
  const paidDays = Math.round((next - freeEnd) / 86400e3);
  const firstCents = Math.round(totalCents * paidDays / monthDays);
  const minEnd = new Date(start.getTime() + MIN_DAYS * 86400e3);
  return {
    minEnd: Math.floor(minEnd.getTime() / 1000), minLabel: dateLabel(minEnd),
    charge: Math.floor(first.getTime() / 1000), freeEnd: Math.floor(freeEnd.getTime() / 1000), firstCents, creditCents: totalCents - firstCents, full: paidDays === monthDays,
    firstLabel: dateLabel(first), freeLabel: dateLabel(freeEnd), nextLabel: dateLabel(next)
  };
}
const MIN_DAYS = 60;
function dateLabel(d) { return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'America/Phoenix' }); }
function billText(b, totalCents) {
  if (b.full) return 'Your free month runs until ' + b.freeLabel + '. Then we charge ' + money(totalCents) + ' on the 1st of each month, starting ' + b.firstLabel + '.';
  return 'Your free month runs until ' + b.freeLabel + '. On ' + b.firstLabel + ', we charge ' + money(b.firstCents) + ' for ' + b.freeLabel + ' to ' + b.nextLabel +
    '. Then ' + money(totalCents) + ' on the 1st of each month.';
}

async function mail(env, to, subject, text) {
  if (!env.RESEND_API_KEY || !to) return false;
  const from = env.MAIL_FROM || 'Arizona Pet Waste <info@arizonapetwaste.com>';
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + env.RESEND_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to: Array.isArray(to) ? to : [to], subject, text, reply_to: env.NOTIFY_EMAIL || 'info@arizonapetwaste.com' })
    });
    if (!r.ok) { console.error('mail failed', r.status, await r.text()); return false; }
    return true;
  } catch (e) { console.error('mail failed', e); return false; }
}
const owner = (env) => env.NOTIFY_EMAIL || 'info@arizonapetwaste.com';

/* ---------- prices live in Stripe; created on first use and found by lookup key ---------- */
const LOOKUP = {
  apw_week_base: ['week', 'base'], apw_week_extra: ['week', 'extra'],
  apw_twice_base: ['twice', 'base'], apw_twice_extra: ['twice', 'extra'],
  apw_eow_base: ['eow', 'base'], apw_eow_extra: ['eow', 'extra']
};
let priceCache = null;
async function product(env, id, name) {
  try { return (await stripe(env, 'GET', 'products/' + id)).id; } catch (e) { if (e.status !== 404) throw e; }
  try { return (await stripe(env, 'POST', 'products', { id, name })).id; } catch (e) { return (await stripe(env, 'GET', 'products/' + id)).id; }
}
async function prices(env) {
  if (priceCache && priceCache.key === env.STRIPE_SECRET_KEY.slice(-6)) return priceCache.ids;
  const keys = Object.keys(LOOKUP);
  const found = {};
  const res = await stripe(env, 'GET', 'prices', { lookup_keys: keys, active: true, limit: 20 });
  for (const p of res.data) found[p.lookup_key] = p.id;
  for (const k of keys) {
    if (found[k]) continue;
    const [plan, kind] = LOOKUP[k];
    const pid = kind === 'base'
      ? await product(env, 'apw_' + plan, 'Dog poop pickup, ' + PLANS[plan].name.toLowerCase() + ' (1 or 2 dogs)')
      : await product(env, 'apw_extra_dog', 'Extra dog');
    try {
      const p = await stripe(env, 'POST', 'prices', {
        currency: 'usd', unit_amount: PLANS[plan][kind], recurring: { interval: 'month' }, product: pid, lookup_key: k,
        nickname: kind === 'base' ? PLANS[plan].name + ', 1 or 2 dogs' : 'Extra dog, ' + PLANS[plan].name.toLowerCase()
      });
      found[k] = p.id;
    } catch (e) {
      const again = await stripe(env, 'GET', 'prices', { lookup_keys: [k], limit: 1 });
      if (!again.data[0]) throw e;
      found[k] = again.data[0].id;
    }
  }
  priceCache = { key: env.STRIPE_SECRET_KEY.slice(-6), ids: found };
  return found;
}

/* ---------- routes ---------- */
function config(env) {
  return ok({
    live: live(env),
    supabaseUrl: live(env) ? base(env) : null,
    supabaseAnonKey: live(env) ? env.SUPABASE_ANON_KEY : null,
    stripeKey: live(env) ? env.STRIPE_PUBLISHABLE_KEY : null,
    firstVisitFrom: env.FIRST_VISIT_FROM || '2026-11-20',
    mail: !!env.RESEND_API_KEY,
    turnstileKey: env.TURNSTILE_SITE_KEY || null
  });
}

async function checkout(request, env, ctx) {
  if (!live(env)) return fail(503, 'Online sign up is not turned on yet. ' + CALL_US);
  const u = await signedIn(request, env);
  if (!u) return fail(401, 'Please sign in again.');
  const b = await body(request);
  if (!b) return fail(400, 'Something was missing. Please try again.');
  const zip = String(b.zip || '');
  const z = ZIPS[zip];
  if (!z) return fail(400, 'We do not scoop in that ZIP code yet.');
  if (!PLANS[b.plan]) return fail(400, 'Please pick how often we come.');
  const dogs = Math.round(Number(b.dogs));
  if (!(dogs >= 1 && dogs <= 6)) return fail(400, 'Please pick 1 to 6 dogs.');
  const name = clean(b.name, 120), phone = digits(b.phone), address = clean(b.address, 200);
  if (name.length < 2 || phone.length !== 10 || address.length < 5) return fail(400, 'Please fill in your name, mobile number and street address.');

  const rows = await db(env, 'GET', 'customers?id=eq.' + u.id + '&select=*');
  const row = rows && rows[0];
  if (row && row.stripe_subscription_id && ['trialing', 'active', 'past_due', 'paused'].includes(row.status)) return ok({ already: true });

  // One free month per home. A home or phone that already had a plan has to reach us to start again.
  const had = row && row.stripe_subscription_id ? [row] : await dbAll(env, 'customers?id=neq.' + u.id + '&stripe_subscription_id=not.is.null&or=(phone.eq.' + phone + ',zip.eq.' + zip + ')&select=phone,address,zip&order=id');
  if (had.some((x) => x === row || x.phone === phone || (x.zip === zip && sameHome(x.address, address)))) {
    return fail(409, 'This home has had a free month with us before. Call or text 623.309.6104 and we will start you again today.', 'had_free_month');
  }

  const cust = {
    email: u.email, name, phone: '+1' + phone,
    address: { line1: address, city: z.city, state: 'AZ', postal_code: zip, country: 'US' },
    metadata: { user_id: u.id }
  };
  let customer = row && row.stripe_customer_id;
  if (customer) await stripe(env, 'POST', 'customers/' + customer, cust);
  else customer = (await stripe(env, 'POST', 'customers', cust)).id;

  await db(env, 'POST', 'customers?on_conflict=id', [{
    id: u.id, email: u.email, name, phone, address, zip, area: z.area, plan: b.plan, dogs, first_visit: null,
    texts_visit: !!b.textsVisit, texts_deals: !!b.textsDeals, status: 'checkout', stripe_customer_id: customer, updated_at: new Date().toISOString()
  }], 'resolution=merge-duplicates,return=minimal');

  const ip = request.headers.get('cf-connecting-ip') || '';
  const ua = clean(request.headers.get('user-agent'), 300);
  const page = clean(b.page, 120);
  await db(env, 'POST', 'consent_log', [
    { user_id: u.id, email: u.email, phone, kind: 'texts_visit', granted: !!b.textsVisit, text_shown: CONSENT.visit + ' ' + CONSENT.fine, page, ip, user_agent: ua },
    { user_id: u.id, email: u.email, phone, kind: 'texts_deals', granted: !!b.textsDeals, text_shown: CONSENT.deals + ' ' + CONSENT.fine, page, ip, user_agent: ua }
  ], 'return=minimal');

  const ids = await prices(env);
  const items = [{ price: ids['apw_' + b.plan + '_base'], quantity: 1 }];
  if (dogs > 2) items.push({ price: ids['apw_' + b.plan + '_extra'], quantity: dogs - 2 });
  const total = monthly(b.plan, dogs);
  const bill = firstCharge(env, total);
  const session = await stripe(env, 'POST', 'checkout/sessions', {
    mode: 'subscription',
    ui_mode: 'embedded_page',
    redirect_on_completion: 'never',
    customer,
    customer_update: { address: 'auto', name: 'auto' },
    client_reference_id: u.id,
    line_items: items,
    payment_method_collection: 'always',
    subscription_data: {
      trial_end: bill.charge,
      description: PLANS[b.plan].name + ', ' + dogs + (dogs === 1 ? ' dog' : ' dogs') + ', ' + z.name + '. We reach out to set the first visit.',
      metadata: { user_id: u.id, plan: b.plan, dogs: String(dogs), zip, credit: String(bill.creditCents), first_charge: String(bill.firstCents),
        free_label: bill.freeLabel, first_label: bill.firstLabel, next_label: bill.nextLabel, free_end: String(bill.freeEnd), min_end: String(bill.minEnd), min_label: bill.minLabel }
    },
    metadata: { user_id: u.id, plan: b.plan, dogs: String(dogs), zip },
    custom_text: { submit: { message: 'You pay $0 today. ' + billText(bill, total) + ' ' + freeRule(bill.minLabel) } }
  });
  return ok({ clientSecret: session.client_secret });
}

const HOME_WORDS = { street: 'st', avenue: 'ave', road: 'rd', drive: 'dr', lane: 'ln', court: 'ct', place: 'pl', boulevard: 'blvd', circle: 'cir', trail: 'trl', parkway: 'pkwy', north: 'n', south: 's', east: 'e', west: 'w' };
const homeKey = (a) => String(a || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean).map((w) => HOME_WORDS[w] || w).join('');
const sameHome = (a, b) => !!homeKey(a) && homeKey(a) === homeKey(b);

async function verifyStripe(payload, header, secret) {
  if (!secret || !header) return false;
  let t = null;
  const v1 = [];
  for (const part of header.split(',')) {
    const i = part.indexOf('=');
    const k = part.slice(0, i).trim(), v = part.slice(i + 1).trim();
    if (k === 't') t = v;
    if (k === 'v1') v1.push(v);
  }
  if (!t || !v1.length || Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(t + '.' + payload)));
  const hex = Array.from(mac, (x) => x.toString(16).padStart(2, '0')).join('');
  return v1.some((s) => {
    if (s.length !== hex.length) return false;
    let diff = 0;
    for (let i = 0; i < s.length; i++) diff |= s.charCodeAt(i) ^ hex.charCodeAt(i);
    return diff === 0;
  });
}

async function webhook(request, env, ctx) {
  const payload = await request.text();
  if (!(await verifyStripe(payload, request.headers.get('stripe-signature'), env.STRIPE_WEBHOOK_SECRET))) return fail(400, 'Bad signature.');
  const evt = JSON.parse(payload);
  const o = evt.data && evt.data.object || {};
  const now = new Date().toISOString();
  if (evt.type === 'checkout.session.completed' && o.mode === 'subscription') {
    const uid = o.client_reference_id || (o.metadata || {}).user_id;
    let status = 'trialing', meta = {};
    let prepaid = false;
    if (o.subscription) { try { const sub = await stripe(env, 'GET', 'subscriptions/' + o.subscription, { expand: ['default_payment_method'] }); status = sub.status; meta = sub.metadata || {};
      prepaid = !!(sub.default_payment_method && sub.default_payment_method.card && sub.default_payment_method.card.funding === 'prepaid'); } catch (e) { } }
    // The first bill on the 1st is a full month; this one time credit takes off the days still inside the free month.
    const credit = Math.max(0, parseInt(meta.credit || '0', 10) || 0);
    if (o.subscription && credit > 0) {
      try {
        await stripe(env, 'POST', 'invoiceitems', { customer: o.customer, subscription: o.subscription, amount: -credit, currency: 'usd',
          description: 'Free month days (' + (meta.first_label || 'the 1st') + ' to ' + (meta.free_label || 'the end of your free month') + ')' }, 'apw-free-' + o.subscription);
      } catch (e) {
        console.error('free month credit failed', e);
        ctx.waitUntil(mail(env, owner(env), 'Check billing: free month credit failed', 'Add a credit of ' + money(credit) + ' to the first bill of subscription ' + o.subscription + ' in Stripe.'));
      }
    }
    if (uid) {
      const rows = await db(env, 'PATCH', 'customers?id=eq.' + uid, { status, stripe_subscription_id: o.subscription, stripe_customer_id: o.customer, updated_at: now }, 'return=representation');
      const c = rows && rows[0];
      if (c) ctx.waitUntil(placeCustomer(env, c));
      if (c) {
        const total = monthly(c.plan, c.dogs);
        const firstCents = parseInt(meta.first_charge || String(total), 10) || total;
        const billLine = meta.free_label ? billText({ full: firstCents === total, firstCents, freeLabel: meta.free_label, firstLabel: meta.first_label, nextLabel: meta.next_label }, total)
          : 'Your first month is free. Then we charge ' + money(total) + ' on the 1st of each month.';
        if (prepaid) ctx.waitUntil(mail(env, owner(env), 'Prepaid card: ' + c.name, c.name + ' signed up with a prepaid card. A prepaid card can run out of money, so a later charge may fail. Call them for a credit or debit card before the first visit.\n\nMobile: ' + c.phone + '\nEmail: ' + c.email + '\nStripe customer: ' + o.customer));
        ctx.waitUntil(mail(env, owner(env), (prepaid ? 'PREPAID CARD. ' : '') + 'New booking: ' + c.name + ', ' + (ZIPS[c.zip] || {}).name, [
          'New customer booked online.', '',
          'Name: ' + c.name, 'Email: ' + c.email, 'Mobile: ' + c.phone, 'Address: ' + c.address + ', ' + c.zip,
          'Plan: ' + PLANS[c.plan].name + ', ' + c.dogs + ' dogs, ' + money(total) + ' a month',
          'To do: reach out to set their day and time.', 'Billing: ' + billLine, 'Visit texts: ' + (c.texts_visit ? 'yes' : 'no') + '. Deals texts: ' + (c.texts_deals ? 'yes' : 'no'),
          'Stripe customer: ' + o.customer
        ].join('\n')));
        ctx.waitUntil(mail(env, c.email, 'You are booked with Arizona Pet Waste', [
          'Hi ' + String(c.name).split(' ')[0] + ',', '',
          'You are booked. We will reach out to let you know your day and time.',
          billLine + ' ' + freeRule(meta.min_label), '',
          'Next, set up your yard: add your gate code, your dogs’ names and any problem spots.',
          (env.SITE_URL || 'https://arizonapetwaste.com') + '/account/', '',
          'Questions? Call or text 623.309.6104.', '', 'Arizona Pet Waste'
        ].join('\n')));
      }
    }
  } else if (evt.type === 'customer.subscription.updated' || evt.type === 'customer.subscription.deleted' || evt.type === 'customer.subscription.created') {
    const uid = (o.metadata || {}).user_id;
    const gone = evt.type === 'customer.subscription.deleted';
    const patch = { status: gone ? 'canceled' : (o.pause_collection ? 'paused' : o.status), stripe_subscription_id: o.id, updated_at: now };
    if (gone) patch.gate_code = null;
    const filter = uid ? 'id=eq.' + uid : 'stripe_customer_id=eq.' + encodeURIComponent(o.customer);
    const rows = await db(env, 'PATCH', 'customers?' + filter, patch, 'return=representation');
    // Canceled or paused: take them off any route that has not happened yet.
    if ((gone || patch.status === 'paused') && rows && rows[0]) {
      await db(env, 'DELETE', 'stops?customer_id=eq.' + rows[0].id + '&status=in.(scheduled,skipped)&day=gte.' + azToday(), null, 'return=minimal').catch((e) => console.error('route cleanup', e));
    }
    if (gone && rows && rows[0]) ctx.waitUntil(mail(env, owner(env), 'Canceled: ' + rows[0].name, 'A customer canceled.\n\nName: ' + rows[0].name + '\nAddress: ' + rows[0].address + ', ' + rows[0].zip + '\nMobile: ' + rows[0].phone));
    if (gone) await freeMonthCharge(env, ctx, o, rows && rows[0]);
    const was = (evt.data && evt.data.previous_attributes) || {};
    if (!gone && was.pause_collection && !o.pause_collection && o.status === 'active') await resumeCharge(env, ctx, o, rows && rows[0]);
  } else if (evt.type === 'invoice.payment_failed') {
    // Only a live plan goes past due. A failed early cancel charge leaves a canceled customer canceled.
    const rows = await db(env, 'PATCH', 'customers?stripe_customer_id=eq.' + encodeURIComponent(o.customer) + '&status=in.(trialing,active,past_due)', { status: 'past_due', updated_at: now }, 'return=representation');
    if (rows && rows[0]) await db(env, 'DELETE', 'stops?customer_id=eq.' + rows[0].id + '&status=in.(scheduled,skipped)&day=gt.' + azToday(), null, 'return=minimal').catch((e) => console.error('route cleanup', e));
    if (rows && rows[0]) ctx.waitUntil(mail(env, owner(env), 'Card failed: ' + rows[0].name, 'A payment failed. Stripe will retry.\n\nName: ' + rows[0].name + '\nMobile: ' + rows[0].phone + '\nEmail: ' + rows[0].email));
  }
  return ok({ received: true });
}

// The free month stays free when the customer keeps the plan for 60 days. A cancel requested before that
// (canceled_at is when they asked, even for cancel at period end) brings what they have paid up to one month
// at plan price. Subscriptions made before the 60 day rule only have free_end, so they keep the older rule.
async function freeMonthCharge(env, ctx, sub, row) {
  const md = sub.metadata || {};
  const cutoff = parseInt(md.min_end || md.free_end || '0', 10);
  const askedAt = sub.canceled_at || sub.ended_at || Math.floor(Date.now() / 1000);
  if (!cutoff || askedAt >= cutoff) return;
  const item = (sub.items && sub.items.data && sub.items.data[0]) || {};
  // every line on the plan: the base price plus any extra dogs
  const price = item.price && item.price.unit_amount ? sub.items.data.reduce((n, i) => n + ((i.price && i.price.unit_amount) || 0) * (i.quantity || 1), 0) : 0;
  const month = price || (row && PLANS[row.plan] ? monthly(row.plan, row.dogs) : 0);
  if (!month) return;
  const who = row ? row.name + ', ' + row.address + ', ' + row.zip : sub.customer;
  let amount = month;
  try {
    if (md.min_end) {
      const paid = await stripe(env, 'GET', 'invoices', { subscription: sub.id, status: 'paid', limit: 24 });
      amount = month - (paid.data || []).reduce((n, i) => n + (i.amount_paid || 0), 0);
      if (amount < 50) return; // already paid a month (Stripe will not charge under 50 cents)
    }
    await stripe(env, 'POST', 'invoiceitems', { customer: sub.customer, amount, currency: 'usd',
      description: 'Early cancel charge: one month at plan price, minus what was paid' }, 'apw-early-item-' + sub.id);
    const inv = await stripe(env, 'POST', 'invoices', Object.assign({ customer: sub.customer, collection_method: 'charge_automatically',
      auto_advance: 'true', pending_invoice_items_behavior: 'include', description: 'You canceled in your first 60 days, so we charge one month at your plan price, minus anything you paid.' },
      sub.default_payment_method ? { default_payment_method: sub.default_payment_method } : {}), 'apw-early-inv-' + sub.id);
    await stripe(env, 'POST', 'invoices/' + inv.id + '/finalize', {}, 'apw-early-fin-' + sub.id);
    await stripe(env, 'POST', 'invoices/' + inv.id + '/pay', {}, 'apw-early-pay-' + sub.id);
    ctx.waitUntil(mail(env, owner(env), 'Free month charged: ' + who, 'This customer canceled in the first 60 days, so we charged ' + money(amount) + '.\n\nCustomer: ' + who + '\nStripe customer: ' + sub.customer));
  } catch (e) {
    console.error('free month charge failed', e);
    ctx.waitUntil(mail(env, owner(env), 'Check billing: free month charge failed', 'A customer canceled in the first 60 days but the ' + money(amount) + ' charge failed. Check it in Stripe.\n\nCustomer: ' + who + '\nStripe customer: ' + sub.customer));
  }
}

// Back from a pause in the middle of a month: the bill for the 1st was voided while paused, so charge the days left
// in this month. Without this, a short pause over the 1st would make the whole month free.
async function resumeCharge(env, ctx, sub, row) {
  const item = (sub.items && sub.items.data && sub.items.data[0]) || {};
  const month = (item.price && item.price.unit_amount ? (sub.items.data || []).reduce((n, i) => n + (i.price.unit_amount || 0) * (i.quantity || 1), 0) : 0) || (row && PLANS[row.plan] ? monthly(row.plan, row.dogs) : 0);
  if (!month) return;
  const who = row ? row.name + ', ' + row.address + ', ' + row.zip : sub.customer;
  const az = new Date(Date.now() - 7 * 3600e3), tag = az.toISOString().slice(0, 7);
  let amount = 0;
  try {
    const list = await stripe(env, 'GET', 'invoices', { subscription: sub.id, limit: 6 });
    const last = (list.data || []).filter((i) => i.billing_reason === 'subscription_cycle')[0];
    if (!last || last.status !== 'void' || new Date(last.created * 1000 - 7 * 3600e3).toISOString().slice(0, 7) !== tag) return;
    const days = new Date(Date.UTC(az.getUTCFullYear(), az.getUTCMonth() + 1, 0)).getUTCDate();
    amount = Math.round(month * (days - az.getUTCDate() + 1) / days);
    if (amount < 50) return;
    const key = sub.id + '-' + tag;
    await stripe(env, 'POST', 'invoiceitems', { customer: sub.customer, amount, currency: 'usd', description: 'Back from pause: the days left in this month' }, 'apw-resume-item-' + key);
    const inv = await stripe(env, 'POST', 'invoices', Object.assign({ customer: sub.customer, collection_method: 'charge_automatically', auto_advance: 'true', pending_invoice_items_behavior: 'include',
      description: 'You started again in the middle of the month, so this covers the days left in the month.' }, sub.default_payment_method ? { default_payment_method: sub.default_payment_method } : {}), 'apw-resume-inv-' + key);
    await stripe(env, 'POST', 'invoices/' + inv.id + '/finalize', {}, 'apw-resume-fin-' + key);
    await stripe(env, 'POST', 'invoices/' + inv.id + '/pay', {}, 'apw-resume-pay-' + key);
  } catch (e) {
    console.error('resume charge failed', e);
    ctx.waitUntil(mail(env, owner(env), 'Check billing: back from pause charge failed', 'A customer came back from a pause but the ' + money(amount) + ' charge for the rest of this month failed. Check it in Stripe.\n\nCustomer: ' + who + '\nStripe customer: ' + sub.customer));
  }
}

const FREE_RULE = 'Keep your plan for 60 days and your free month stays free. If you cancel in your first 60 days, we charge one month at your plan price, minus anything you have paid.';
function freeRule(label) {
  return label ? 'Keep your plan until ' + label + ' and your free month stays free. If you cancel before ' + label + ', we charge one month at your plan price, minus anything you have paid.' : FREE_RULE;
}
const WAIT_OFFER = 'Join by November 30, 2026 and your first month is free when we start in your area.';
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
  const sent = await mail(env, owner(env), 'Waitlist: ' + name + ', ZIP ' + zip, [
    'Someone joined the waitlist.', '',
    'Name: ' + name, 'Mobile: ' + phone, 'Address: ' + address + ', ' + zip, 'Email: ' + (email || 'none'),
    'Text them when we start there: ' + (texts ? 'yes' : 'no'), '',
    'Offer shown: ' + WAIT_OFFER
  ].join('\n'));
  if (!stored && !sent) return fail(503, 'Our waitlist is not taking sign ups online yet. Text 623.309.6104 with your name, address and ZIP, and we will add you.');
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
  if (!PLANS[b.plan]) return fail(400, 'Please pick how often we come.');
  const dogs = Math.round(Number(b.dogs));
  if (!(dogs >= 1 && dogs <= 6)) return fail(400, 'Please pick 1 to 6 dogs.');
  const name = clean(b.name, 120), phone = digits(b.phone), address = clean(b.address, 200), email = clean(b.email, 200).toLowerCase();
  if (name.length < 2 || phone.length !== 10 || address.length < 5 || !emailOk(email)) return fail(400, 'Please fill in your name, mobile number, email and street address.');
  if (await tooMany(env, 'signup_request')) return fail(429, 'We are getting a lot of sign ups right now. Call or text 623.309.6104 and we will book you today.');
  const total = monthly(b.plan, dogs);
  const bill = firstCharge(env, total);
  const sent = await mail(env, owner(env), 'New sign up request: ' + name + ', ' + z.name, [
    'Someone signed up on the website. Online checkout is not on yet, so call them to finish and take their card.', '',
    'Name: ' + name, 'Mobile: ' + phone, 'Email: ' + email, 'Address: ' + address + ', ' + z.city + ' ' + zip,
    'Plan: ' + PLANS[b.plan].name + ', ' + dogs + (dogs === 1 ? ' dog, ' : ' dogs, ') + money(total) + ' a month',
    'Billing they saw: ' + billText(bill, total),
    'Visit texts: ' + (b.textsVisit ? 'yes' : 'no') + '. Deals texts: ' + (b.textsDeals ? 'yes' : 'no'),
    'Text consent shown: ' + CONSENT.visit + ' ' + CONSENT.fine,
    'Page: ' + clean(b.page, 120)
  ].join('\n'));
  const kept = sbLive(env) ? await addLead(env, { kind: 'signup_request', name, email, phone, address, zip,
    details: PLANS[b.plan].name + ', ' + dogs + (dogs === 1 ? ' dog, ' : ' dogs, ') + money(total) + ' a month. Visit texts: ' + (b.textsVisit ? 'yes' : 'no') }) : false;
  if (!sent && !kept) return fail(503, 'Online sign up opens soon. Call or text 623.309.6104 and we will book you today.');
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
    problem_spots: clean(b.problem_spots, 600), skip_spray: !!b.skip_spray, texts_visit: !!b.texts_visit, texts_deals: !!b.texts_deals,
    updated_at: new Date().toISOString()
  };
  const saved = await db(env, 'PATCH', 'customers?id=eq.' + u.id + '&select=' + ME_FIELDS, patch, 'return=representation');
  const logs = [];
  const ip = request.headers.get('cf-connecting-ip') || '', ua = clean(request.headers.get('user-agent'), 300);
  if (before.texts_visit !== patch.texts_visit) logs.push({ user_id: u.id, email: u.email, phone: before.phone, kind: 'texts_visit', granted: patch.texts_visit, text_shown: CONSENT.visit + ' ' + CONSENT.fine, page: '/account/', ip, user_agent: ua });
  if (before.texts_deals !== patch.texts_deals) logs.push({ user_id: u.id, email: u.email, phone: before.phone, kind: 'texts_deals', granted: patch.texts_deals, text_shown: CONSENT.deals + ' ' + CONSENT.fine, page: '/account/', ip, user_agent: ua });
  if (logs.length) await db(env, 'POST', 'consent_log', logs, 'return=minimal');
  return ok({ customer: saved && saved[0] });
}

async function portal(request, env) {
  if (!live(env)) return fail(503, 'Billing is not turned on yet. ' + CALL_US);
  const u = await signedIn(request, env);
  if (!u) return fail(401, 'Please sign in again.');
  const rows = await db(env, 'GET', 'customers?id=eq.' + u.id + '&select=stripe_customer_id');
  const cus = rows && rows[0] && rows[0].stripe_customer_id;
  if (!cus) return fail(404, 'We could not find a card on file. ' + CALL_US);
  const site = env.SITE_URL || new URL(request.url).origin;
  const s = await stripe(env, 'POST', 'billing_portal/sessions', { customer: cus, return_url: site + '/account/' });
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
const STAFF_FIELDS = 'id,email,name,phone,role,active';
const enc = encodeURIComponent;
const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));
const weekday = (d) => noonAZ(d).getUTCDay();
const addDays = (d, n) => new Date(noonAZ(d).getTime() + n * 86400e3).toISOString().slice(0, 10);
// Every other week customers go on even or odd weeks, counted from Monday January 5, 2026.
const weekParity = (d) => ((Math.floor((noonAZ(d) - noonAZ('2026-01-05')) / (7 * 86400e3)) % 2) + 2) % 2;
const siteHost = (env) => String(env.SITE_URL || 'https://arizonapetwaste.com').replace(/^https?:\/\//, '').replace(/\/$/, '');
const first = (name) => String(name || '').trim().split(/\s+/)[0] || '';
function newCode() { return Array.from(crypto.getRandomValues(new Uint8Array(6)), (x) => CODE_ABC[x % CODE_ABC.length]).join(''); }
function miles(a, b) {
  const r = (x) => x * Math.PI / 180, R = 3958.8;
  const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const driveMin = (mi) => Math.max(1, Math.round(mi * 1.35 / 25 * 60)); // road miles at about 25 mph through neighborhoods

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
    if (patch.service_day != null && c.email) await mail(env, c.email, 'Your service day is ' + DAYS[patch.service_day], dayMail(c.name, patch.service_day, patch.service_day2, false));
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

async function staffCode(request, env) {
  const b = await body(request);
  const email = clean(b && b.email, 200).toLowerCase();
  if (!emailOk(email)) return fail(400, 'Type your work email.');
  const s = (await db(env, 'GET', 'staff?email=eq.' + enc(email) + '&active=is.true&select=id'))[0];
  if (s) {
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
  const r = await auth(env, '/verify', { type: 'email', email, token: code });
  if (!r.ok || !r.data.access_token) return fail(400, 'That code did not work. Check it, or send a new one.');
  const u = r.data.user || {};
  const s = await staffFor(env, { id: u.id, email: String(u.email || email).toLowerCase() });
  if (!s) return fail(403, 'This sign in is only for Arizona Pet Waste staff.');
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
    request.headers.get('x-cron-secret') === env.CRON_SECRET) return nightBefore(env, null);

  const s = await staffFor(env, await signedIn(request, env));
  if (!s) return fail(401, 'Please sign in again.');
  env = await withSettings(env);
  const b = m === 'POST' ? (await body(request)) || {} : {};
  const q = new URL(request.url).searchParams;
  if (path === '/api/staff/me' && m === 'GET') return ok({ staff: { name: s.name, role: s.role, email: s.email } });

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
  if (path === '/api/office/customer' && m === 'POST') return officeCustomerSave(env, b);
  if (path === '/api/office/photo' && m === 'GET') return officePhoto(env, q.get('stop'));
  if (path === '/api/office/leads' && m === 'GET') return ok({ leads: await db(env, 'GET', 'leads?select=*&order=created_at.desc&limit=500') });
  if (path === '/api/office/lead' && m === 'POST') return officeLead(env, b);
  if (path === '/api/office/texts' && m === 'GET') return officeTexts(env);
  if (path === '/api/office/text' && m === 'POST') return markText(s, env, b, false);
  if (path === '/api/office/night-before' && m === 'POST') return nightBefore(env, isDay(b.date) ? b.date : null);
  if (path === '/api/office/money' && m === 'GET') return officeMoney(env);
  if (path === '/api/office/health' && m === 'GET') return officeHealth(env);
  if (path === '/api/office/areas' && m === 'GET') return officeAreas(env);
  if (path === '/api/office/area' && m === 'POST') return officeArea(env, b);
  if (path === '/api/office/team' && m === 'GET') return ok({ team: await db(env, 'GET', 'staff?select=' + STAFF_FIELDS + '&order=active.desc,name') });
  if (path === '/api/office/team' && m === 'POST') return s.role === 'owner' ? officeTeam(env, s, b) : fail(403, 'Only the owner can change the team.');
  return fail(404, 'Not found.');
}

/* ---------- texts (queued until Twilio is approved) ---------- */
function textBody(env, kind, code, reason) {
  const link = siteHost(env) + '/t/' + code;
  if (kind === 'night_before') return 'Arizona Pet Waste comes tomorrow. Please unlock the gate and keep your dogs inside. Reply STOP to opt out.';
  if (kind === 'on_the_way') return 'Arizona Pet Waste: We are on the way. See our truck: ' + link;
  if (kind === 'done') return 'Arizona Pet Waste: Your yard is done. See your latched gate: ' + link + ' Missed a pile? Reply and we come back within 24 hours.';
  if (kind === 'cant') return 'Arizona Pet Waste: We could not service your yard today because ' + (REASONS[reason] || REASONS.other) + '. Reply and we will set a time.';
  return '';
}
async function queueText(env, customer, stopId, kind, code, reason) {
  if (!customer || !customer.texts_visit || !customer.phone) return false;
  const had = await db(env, 'GET', 'messages?stop_id=eq.' + stopId + '&kind=eq.' + kind + '&select=id');
  if (had && had.length) return false;
  await db(env, 'POST', 'messages', [{ customer_id: customer.id, stop_id: stopId, kind, channel: 'sms', to_addr: customer.phone, body: textBody(env, kind, code, reason) }], 'return=minimal');
  return true;
}
async function markText(s, env, b, crewOnly) {
  const id = parseInt(b.id, 10);
  if (!id || !['sent', 'skipped'].includes(b.status)) return fail(400, 'Pick sent or skip.');
  if (crewOnly && s.role === 'scooper') {
    const mine = await db(env, 'GET', 'messages?id=eq.' + id + '&select=id,stop:stops(day,route:routes(staff_id))');
    const st = mine && mine[0] && mine[0].stop;
    if (!st || st.day !== azToday() || st.route.staff_id !== s.id) return fail(403, 'That text is not on your route.');
  }
  await db(env, 'PATCH', 'messages?id=eq.' + id, { status: b.status, sent_by: s.id, sent_at: new Date().toISOString() }, 'return=minimal');
  return ok({ ok: true });
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
  return ok(Object.assign({ day, dayName: DAYS[weekday(day)], route: r, stops, texts, me: { name: s.name, role: s.role } }, env.GOOGLE_MAPS_BROWSER_KEY ? { mapsKey: env.GOOGLE_MAPS_BROWSER_KEY } : {}));
}
async function myStop(s, env, stopId) {
  const id = parseInt(stopId, 10);
  if (!id) return null;
  const st = (await db(env, 'GET', 'stops?id=eq.' + id + '&select=*,route:routes(id,day,staff_id,status),customer:customers(id,name,phone,address,lat,lng,texts_visit)'))[0];
  if (!st || st.route.staff_id !== s.id || st.day !== azToday()) return null;
  return st;
}
async function advance(env, routeId) {
  const busy = await db(env, 'GET', 'stops?route_id=eq.' + routeId + '&status=in.(on_the_way,here)&select=id');
  if (busy.length) return null;
  const next = (await db(env, 'GET', 'stops?route_id=eq.' + routeId + '&status=eq.scheduled&order=position,id&limit=1&select=id,code,customer:customers(id,phone,texts_visit)'))[0];
  if (!next) return null;
  await db(env, 'PATCH', 'stops?id=eq.' + next.id, { status: 'on_the_way', on_way_at: new Date().toISOString() }, 'return=minimal');
  await queueText(env, next.customer, next.id, 'on_the_way', next.code);
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
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(b.image || ''));
  if (!m) return fail(400, 'That photo did not come through. Take it again.');
  const bin = Uint8Array.from(atob(m[2]), (ch) => ch.charCodeAt(0));
  if (bin.length > 3 * 1024 * 1024) return fail(400, 'That photo is too big. Take it again.');
  const path = st.day + '/' + st.id + '-' + newCode().toLowerCase() + '.' + (m[1] === 'image/png' ? 'png' : m[1] === 'image/webp' ? 'webp' : 'jpg');
  await storage(env, 'POST', 'object/gate-photos/' + path, bin, m[1]);
  await db(env, 'PATCH', 'stops?id=eq.' + st.id, { photo_path: path, no_photo: false }, 'return=minimal');
  return ok({ ok: true });
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
  await queueText(env, st.customer, st.id, 'done', st.code);
  await advance(env, st.route.id);
  return crewToday(s, env);
}
async function crewCant(s, env, b) {
  const st = await myStop(s, env, b.stopId);
  if (!st) return fail(404, 'That stop is not on your route today.');
  const reason = REASONS[b.reason] ? b.reason : 'other';
  await db(env, 'PATCH', 'stops?id=eq.' + st.id, { status: 'cant', reason, note: clean(b.note, 500) || null, done_at: new Date().toISOString() }, 'return=minimal');
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
        yards: weekYards(here.map((c) => ({ plan: c.plan, eow_week: set[c.id].eow_week }))), homes: here.length, towns: townsOf(here), miles: Math.round(dayMiles(here) * 10) / 10, pts: slotPts(here, start) });
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
function dayMail(name, d1, d2, moved) {
  return ['Hi ' + first(name) + ',', '',
    (moved ? 'We changed our routes to save drive time. Your new service day is ' : 'Your service day is ') + DAYS[d1] + (d2 != null ? ' and ' + DAYS[d2] : '') + '.',
    'We text you the night before each visit with a 30 minute window.',
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
  const team = await db(env, 'GET', 'staff?active=is.true&select=id,name,role&order=created_at');
  const staff = team.filter((t) => t.role === 'scooper').length ? team.filter((t) => t.role === 'scooper') : team.slice(0, 1);
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
  out.emailed = await mailMany(env, change.filter((x) => x[0].email).map(([c, a]) => ({ to: c.email, subject: (c.service_day != null ? 'Your new service day is ' : 'Your service day is ') + DAYS[a.service_day], text: dayMail(c.name, a.service_day, a.service_day2, c.service_day != null) })));
  out.applied = true;
  return ok(out);
}
// A sample week anyone can look at: made up yards across our ZIP codes, planned by the same code the office uses. Nothing is saved.
function demoWeek(env, q) {
  const n = Math.min(1000, Math.max(20, parseInt(q.get('n'), 10) || 500)), cap = dayCap(env, q.get('cap')), days = workDays(env, q.get('days'));
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
  return ok(Object.assign(weekView(env, weekSummary(p, 0, list.length), names), { sample: true, mode: 'all', oldWay: { biggestDay: Math.max(...Object.values(oneDay).map((x) => x.length)), note: 'One day for each area, one scooper' } }));
}

async function defaultScooper(env) {
  const team = await db(env, 'GET', 'staff?active=is.true&select=id,role&order=created_at');
  return (team.find((t) => t.role === 'scooper') || team.find((t) => t.role === 'owner') || team[0] || {}).id || null;
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
    const free = mine.filter((c) => c.stop_order == null).sort((a, b) => String(a.address).localeCompare(String(b.address)));
    const best = shortOrder(free, routeStart(env));
    milesSaved += pathMiles(free) - pathMiles(best);
    routeMiles += pathMiles(fixed.concat(best));
    sorted.push(...fixed, ...best);
  }
  if (sorted.length) {
    await db(env, 'POST', 'stops?on_conflict=day,customer_id', sorted.map((c, i) => ({
      route_id: routeOf[c.scooper_id || fallback], customer_id: c.id, day, position: (c.stop_order ?? 9000 + i), code: newCode()
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
  const needDay = await db(env, 'GET', 'customers?status=in.(' + PAYING.join(',') + ')&service_day=is.null&select=id,name,address,zip,area,plan,dogs,created_at&order=created_at');
  const queued = await db(env, 'GET', 'messages?status=eq.queued&select=id');
  const pings = await lastPings(env, routes.filter((r) => r.status === 'live').map((r) => r.id));
  return ok({ day, dayName: DAYS[weekday(day)], today: azToday(), routes, stops, needDay, queuedTexts: queued.length, pings, cap: dayCap(await withSettings(env)) });
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
  const free = wait.filter((x) => !(x.customer && x.customer.stop_order != null));
  const order = set.map((x) => ({ row: x })).concat(shortOrder(free.map((x) => ({ row: x, lat: x.customer && x.customer.lat, lng: x.customer && x.customer.lng })), routeStart(env)));
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
      if (d === fromDay) { const rest = dayMi(pts.filter((x) => !moveSet.has(x.id))); saves = { miles: Math.round((before - rest) * 10) / 10, minutes: Math.round((before - rest) / 25 * 60) }; row.miles = Math.round(before * 10) / 10; }
      else { const seen = new Set(pts.map((x) => x.id)), after = dayMi(pts.concat(movePts.filter((x) => !seen.has(x.id)))); row.miles = Math.round(before * 10) / 10; row.addMiles = Math.round((after - before) * 10) / 10; row.addMinutes = Math.round((after - before) / 25 * 60); }
    }
    return row;
  });
  // The day that takes these yards for the least extra driving and stays under the limit.
  const fits = out.filter((x) => x.addMiles != null && x.works && x.yards + movePts.length <= dayCap(env)).sort((x, y) => x.addMiles - y.addMiles);
  return ok({ cap: dayCap(env), days: out, saves, best: fits.length ? fits[0].day : null, moving: movePts.length });
}
// Office: move a group of yards to another day in one go. "forever" also changes the customer's regular day.
// The old stop stays on its day as skipped with a note, so the day builder does not put the yard back.
async function officeMoveDay(env, b) {
  const ids = [...new Set((Array.isArray(b.ids) ? b.ids : []).map((x) => parseInt(x, 10)).filter(Boolean))].slice(0, 200);
  const to = isDay(b.to) ? b.to : null;
  if (!ids.length) return fail(400, 'Pick the yards to move.');
  if (!to || to < azToday()) return fail(400, 'Pick today or a later day.');
  const found = await db(env, 'GET', 'stops?id=in.(' + ids.join(',') + ')&select=id,day,status,customer_id,route:routes(id,staff_id,status),customer:customers(id,email,name,plan,service_day,service_day2)');
  const from = (found[0] || {}).day;
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
      await mailMany(env, move.filter((x) => x.customer.email).map((x) => ({ to: x.customer.email, subject: 'Your new service day is ' + label, text: dayMail(x.customer.name, weekday(to), null, true) })));
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
  const customers = await dbAll(env, 'customers?select=' + LIST_FIELDS + filter + '&order=service_day.nullsfirst,stop_order.nullslast,name,id');
  return ok({ customers });
}
async function officeCustomer(env, id) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id || ''))) return fail(400, 'Bad customer.');
  const c = (await db(env, 'GET', 'customers?id=eq.' + id + '&select=*'))[0];
  if (!c) return fail(404, 'Customer not found.');
  const visits = await db(env, 'GET', 'stops?customer_id=eq.' + id + '&select=id,day,status,reason,note,photo_path,no_photo,done_at&order=day.desc&limit=30');
  const texts = await db(env, 'GET', 'messages?customer_id=eq.' + id + '&select=id,kind,body,status,sent_at,created_at&order=created_at.desc&limit=30');
  return ok({ customer: c, visits, texts, monthly: c.plan && c.dogs ? monthly(c.plan, c.dogs) : null });
}
// The office fixes the dog count when the yard has more or fewer dogs than the plan says. The Stripe plan changes
// to match (extra dogs are their own line), with no charge today: the new price starts on the next bill. The customer gets an email.
async function setDogs(env, c, n) {
  if (!PLANS[c.plan]) return;
  if (live(env) && c.stripe_subscription_id && ['trialing', 'active', 'past_due', 'paused'].includes(c.status)) {
    const sub = await stripe(env, 'GET', 'subscriptions/' + c.stripe_subscription_id);
    const extra = (await prices(env))['apw_' + c.plan + '_extra'];
    const item = ((sub.items && sub.items.data) || []).find((i) => i.price && i.price.id === extra);
    const want = Math.max(0, n - 2);
    if (want && item) await stripe(env, 'POST', 'subscription_items/' + item.id, { quantity: want, proration_behavior: 'none' });
    else if (want) await stripe(env, 'POST', 'subscription_items', { subscription: sub.id, price: extra, quantity: want, proration_behavior: 'none' });
    else if (item) await stripe(env, 'DELETE', 'subscription_items/' + item.id, { proration_behavior: 'none' });
  }
  await mail(env, c.email, 'We updated your plan to ' + n + (n === 1 ? ' dog' : ' dogs'), [
    'Hi ' + first(c.name) + ',', '',
    'We counted ' + n + (n === 1 ? ' dog' : ' dogs') + ' at your home, so we updated your plan to match.',
    'Your price is now ' + money(monthly(c.plan, n)) + ' a month, starting with your next bill. There is no charge today.', '',
    'Questions? Call or text 623.309.6104.', '', 'Arizona Pet Waste'
  ].join('\n'));
}
async function officeCustomerSave(env, b) {
  if (!/^[0-9a-f-]{36}$/i.test(String(b.id || ''))) return fail(400, 'Bad customer.');
  const p = {};
  const dayOrNull = (v) => (v === '' || v == null ? null : (Number(v) >= 0 && Number(v) <= 6 ? Math.round(Number(v)) : undefined));
  const dateOrNull = (v) => (v === '' || v == null ? null : (isDay(v) ? v : undefined));
  const set = (k, v) => { if (v !== undefined) p[k] = v; };
  if ('service_day' in b) set('service_day', dayOrNull(b.service_day));
  if ('service_day2' in b) set('service_day2', dayOrNull(b.service_day2));
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
  if (!Object.keys(p).length) return fail(400, 'Nothing to save.');
  p.updated_at = new Date().toISOString();
  await db(env, 'PATCH', 'customers?id=eq.' + b.id, p, 'return=minimal');
  return officeCustomer(env, b.id);
}
async function officePhoto(env, stopId) {
  const id = parseInt(stopId, 10);
  const st = id && (await db(env, 'GET', 'stops?id=eq.' + id + '&select=photo_path'))[0];
  if (!st || !st.photo_path) return fail(404, 'No photo for that visit.');
  return ok({ url: await photoUrl(env, st.photo_path) });
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
  }
  return ok({ leads: await db(env, 'GET', 'leads?select=*&order=created_at.desc&limit=500') });
}
async function officeTexts(env) {
  const texts = await db(env, 'GET', 'messages?status=eq.queued&select=id,kind,to_addr,body,created_at,customer:customers(name),stop:stops(day)&order=created_at&limit=300');
  return ok({ texts, twilio: false });
}
// Builds tomorrow's routes and queues the night before texts. Also clears GPS points older than 30 days.
async function nightBefore(env, date) {
  const day = date || addDays(azToday(), 1);
  const plan = await planDay(env, day);
  const stops = await db(env, 'GET', 'stops?day=eq.' + day + '&status=eq.scheduled&select=id,code,customer:customers(id,phone,texts_visit)');
  let queued = 0;
  for (const st of stops) if (await queueText(env, st.customer, st.id, 'night_before', st.code)) queued++;
  await db(env, 'DELETE', 'positions?at=lt.' + enc(new Date(Date.now() - 30 * 86400e3).toISOString()), null, 'return=minimal');
  return ok({ ok: true, day, stops: stops.length, queued, added: plan.added });
}
async function officeMoney(env) {
  const rows = await db(env, 'GET', 'customers?select=status,plan,dogs,name,phone&status=in.(trialing,active,past_due,paused,canceled,checkout)');
  const sum = (list) => list.reduce((t, c) => t + (c.plan && c.dogs ? monthly(c.plan, c.dogs) : 0), 0);
  const by = (st) => rows.filter((c) => c.status === st);
  return ok({
    paying: { count: by('active').length, monthly: sum(by('active')) },
    freeMonth: { count: by('trialing').length, monthly: sum(by('trialing')) },
    pastDue: by('past_due').map((c) => ({ name: c.name, phone: c.phone, monthly: sum([c]) })),
    paused: by('paused').length, canceled: by('canceled').length, started: by('checkout').length
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
    if ('active' in b) p.active = !!b.active;
    if (b.id === s.id && (p.active === false || (p.role && p.role !== 'owner'))) return fail(400, 'You cannot remove your own owner access.');
    await db(env, 'PATCH', 'staff?id=eq.' + enc(b.id), p, 'return=minimal');
  } else {
    if (!emailOk(email) || name.length < 2) return fail(400, 'Type their name and email.');
    await db(env, 'POST', 'staff?on_conflict=email', [{ email, name, phone: digits(b.phone) || null, role, active: true }], 'resolution=merge-duplicates,return=minimal');
  }
  return ok({ team: await db(env, 'GET', 'staff?select=' + STAFF_FIELDS + '&order=active.desc,name') });
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
  if (st.status === 'done') { out.doneAt = st.done_at; out.photo = await photoUrl(env, st.photo_path); out.noPhoto = !!st.no_photo; }
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
async function officeHealth(env) {
  const hour = new Date(Date.now() - 3600e3).toISOString();
  const [errors, pings, live1, queued] = await Promise.all([
    db(env, 'GET', 'errors?select=id,at,source,path,message&order=at.desc&limit=50'),
    db(env, 'GET', 'positions?select=at&order=at.desc&limit=1'),
    db(env, 'GET', 'routes?day=eq.' + azToday() + '&status=eq.live&select=id'),
    db(env, 'GET', 'messages?status=eq.queued&select=id')
  ]);
  return ok({
    checks: {
      desk: true,
      booking: live(env),
      map: !!(env.GOOGLE_MAPS_BROWSER_KEY && env.GOOGLE_MAPS_SERVER_KEY),
      texts: false
    },
    liveRoutes: live1.length, lastPing: pings[0] ? pings[0].at : null, queuedTexts: queued.length,
    errorsLastHour: errors.filter((e) => e.at >= hour).length, errors
  });
}

/* ---------- My Yard: visit history with gate photos ---------- */
async function meVisits(request, env) {
  if (!sbLive(env)) return fail(503, 'My Yard is not turned on yet. ' + CALL_US);
  const u = await signedIn(request, env);
  if (!u) return fail(401, 'Please sign in again.');
  const rows = await db(env, 'GET', 'stops?customer_id=eq.' + u.id + '&day=lte.' + azToday() + '&status=in.(done,cant,skipped)&select=day,status,reason,note,photo_path,done_at&order=day.desc&limit=12');
  const visits = [];
  for (const r of rows) visits.push({ day: r.day, status: r.status, reason: r.reason ? REASONS[r.reason] : null, note: r.note, doneAt: r.done_at, photo: await photoUrl(env, r.photo_path) });
  return ok({ visits });
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
  const base = 'plan,status,first_visit,service_day,service_day2,eow_week,pause_from,pause_until,stripe_customer_id,stripe_subscription_id,name,address,zip';
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
// Pausing opens after the 60 day minimum, so a pause cannot be used to sit out the minimum and keep the free month.
async function minEndOf(env, c) {
  if (!c.stripe_subscription_id) return 0;
  try { return parseInt(((await stripe(env, 'GET', 'subscriptions/' + c.stripe_subscription_id)).metadata || {}).min_end || '0', 10) || 0; } catch (e) { return 0; }
}
function planView(c, minEnd) {
  const today = azToday();
  const early = !!minEnd && Date.now() / 1000 < minEnd;
  const paused = c.status === 'paused';
  const days = PAYING.includes(c.status) ? nextVisits(c, addDays(today, 1), 3) : [];
  const used = c.skips.filter((d) => d.slice(0, 4) === today.slice(0, 4)).length;
  return {
    dayName: c.service_day != null ? DAYS[c.service_day] + (c.service_day2 != null ? ' and ' + DAYS[c.service_day2] : '') : null,
    next: days.map((d) => ({ day: d, skipped: c.skips.includes(d), canSkip: d >= addDays(today, 2) })),
    skipReady: c.skipReady, skipsLeft: Math.max(0, SKIPS_A_YEAR - used),
    paused, pauseUntil: paused && c.pause_until ? addDays(c.pause_until, 1) : null,
    canPause: !early && ['trialing', 'active'].includes(c.status) && !!c.stripe_subscription_id, pauseMax: addDays(today, PAUSE_MAX_DAYS),
    pauseAfter: early ? dateLabel(new Date(minEnd * 1000)) : null
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
  return x.err || ok({ plan: planView(x.c, await minEndOf(env, x.c)) });
}
async function meInvoices(request, env) {
  const x = await me2(request, env);
  if (x.err) return x.err;
  if (!x.c.stripe_customer_id) return ok({ invoices: [] });
  const r = await stripe(env, 'GET', 'invoices', { customer: x.c.stripe_customer_id, limit: 12 });
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
async function mePause(request, env, ctx) {
  const x = await me2(request, env);
  if (x.err) return x.err;
  const c = x.c, b = (await body(request)) || {};
  const until = String(b.until || ''), today = azToday();
  if (!['trialing', 'active'].includes(c.status) || !c.stripe_subscription_id) return fail(400, 'We could not pause this plan. ' + CALL_US);
  const minEnd = await minEndOf(env, c);
  if (minEnd && Date.now() / 1000 < minEnd) return fail(400, 'You can pause after ' + dateLabel(new Date(minEnd * 1000)) + '. Need a break before then? Skip a visit, or text 623.309.6104.');
  if (!isDay(until) || until <= today) return fail(400, 'Pick the day you want us to start again.');
  if (until > addDays(today, PAUSE_MAX_DAYS)) return fail(400, 'You can pause for up to 120 days.');
  await stripe(env, 'POST', 'subscriptions/' + c.stripe_subscription_id, { pause_collection: { behavior: 'void', resumes_at: Math.floor(noonAZ(until).getTime() / 1000) } });
  const patch = { status: 'paused', pause_from: today, pause_until: addDays(until, -1), updated_at: new Date().toISOString() };
  await db(env, 'PATCH', 'customers?id=eq.' + x.u.id, patch, 'return=minimal');
  await db(env, 'DELETE', 'stops?customer_id=eq.' + x.u.id + '&status=eq.scheduled&day=gte.' + today + '&day=lt.' + until, null, 'return=minimal').catch((e) => console.error('pause cleanup', e));
  ctx.waitUntil(mail(env, owner(env), 'Paused: ' + c.name, c.name + ' paused until ' + until + '. No bills go out while paused.\n\nAddress: ' + c.address + ', ' + c.zip));
  return ok({ plan: planView(Object.assign(c, patch)) });
}
async function meResume(request, env, ctx) {
  const x = await me2(request, env);
  if (x.err) return x.err;
  const c = x.c;
  if (c.status !== 'paused' || !c.stripe_subscription_id) return fail(400, 'Your plan is not paused.');
  const s = await stripe(env, 'POST', 'subscriptions/' + c.stripe_subscription_id, { pause_collection: '' });
  const patch = { status: s.status || 'active', pause_from: null, pause_until: null, updated_at: new Date().toISOString() };
  await db(env, 'PATCH', 'customers?id=eq.' + x.u.id, patch, 'return=minimal');
  ctx.waitUntil(mail(env, owner(env), 'Back from pause: ' + c.name, c.name + ' started the plan again.\n\nAddress: ' + c.address + ', ' + c.zip));
  return ok({ plan: planView(Object.assign(c, patch)) });
}

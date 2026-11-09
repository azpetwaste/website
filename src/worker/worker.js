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
  if (path === '/api/health' && m === 'GET') return ok({ ok: true, live: live(env), desk: sbLive(env) });
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
  return {
    charge: Math.floor(first.getTime() / 1000), freeEnd: Math.floor(freeEnd.getTime() / 1000), firstCents, creditCents: totalCents - firstCents, full: paidDays === monthDays,
    firstLabel: dateLabel(first), freeLabel: dateLabel(freeEnd), nextLabel: dateLabel(next)
  };
}
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
    mail: !!env.RESEND_API_KEY
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
        free_label: bill.freeLabel, first_label: bill.firstLabel, next_label: bill.nextLabel, free_end: String(bill.freeEnd) }
    },
    metadata: { user_id: u.id, plan: b.plan, dogs: String(dogs), zip },
    custom_text: { submit: { message: 'You pay $0 today. ' + billText(bill, total) + ' ' + FREE_RULE } }
  });
  return ok({ clientSecret: session.client_secret });
}

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
    if (o.subscription) { try { const sub = await stripe(env, 'GET', 'subscriptions/' + o.subscription); status = sub.status; meta = sub.metadata || {}; } catch (e) { } }
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
        ctx.waitUntil(mail(env, owner(env), 'New booking: ' + c.name + ', ' + (ZIPS[c.zip] || {}).name, [
          'New customer booked online.', '',
          'Name: ' + c.name, 'Email: ' + c.email, 'Mobile: ' + c.phone, 'Address: ' + c.address + ', ' + c.zip,
          'Plan: ' + PLANS[c.plan].name + ', ' + c.dogs + ' dogs, ' + money(total) + ' a month',
          'To do: reach out to set their day and time.', 'Billing: ' + billLine, 'Visit texts: ' + (c.texts_visit ? 'yes' : 'no') + '. Deals texts: ' + (c.texts_deals ? 'yes' : 'no'),
          'Stripe customer: ' + o.customer
        ].join('\n')));
        ctx.waitUntil(mail(env, c.email, 'You are booked with Arizona Pet Waste', [
          'Hi ' + String(c.name).split(' ')[0] + ',', '',
          'You are booked. We will reach out to let you know your day and time.',
          billLine + ' ' + FREE_RULE, '',
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
      await db(env, 'DELETE', 'stops?customer_id=eq.' + rows[0].id + '&status=eq.scheduled&day=gte.' + azToday(), null, 'return=minimal').catch((e) => console.error('route cleanup', e));
    }
    if (gone && rows && rows[0]) ctx.waitUntil(mail(env, owner(env), 'Canceled: ' + rows[0].name, 'A customer canceled.\n\nName: ' + rows[0].name + '\nAddress: ' + rows[0].address + ', ' + rows[0].zip + '\nMobile: ' + rows[0].phone));
    if (gone) await freeMonthCharge(env, ctx, o, rows && rows[0]);
  } else if (evt.type === 'invoice.payment_failed') {
    const rows = await db(env, 'PATCH', 'customers?stripe_customer_id=eq.' + encodeURIComponent(o.customer), { status: 'past_due', updated_at: now }, 'return=representation');
    if (rows && rows[0]) ctx.waitUntil(mail(env, owner(env), 'Card failed: ' + rows[0].name, 'A payment failed. Stripe will retry.\n\nName: ' + rows[0].name + '\nMobile: ' + rows[0].phone + '\nEmail: ' + rows[0].email));
  }
  return ok({ received: true });
}

// The free month stays free only when the customer keeps the plan past it. A cancel requested before the
// free month ends (canceled_at is when they asked, even for cancel at period end) gets one month at plan price.
async function freeMonthCharge(env, ctx, sub, row) {
  const freeEnd = parseInt((sub.metadata || {}).free_end || '0', 10);
  const askedAt = sub.canceled_at || sub.ended_at || Math.floor(Date.now() / 1000);
  if (!freeEnd || askedAt >= freeEnd) return;
  const item = (sub.items && sub.items.data && sub.items.data[0]) || {};
  const price = item.price && item.price.unit_amount ? item.price.unit_amount * (item.quantity || 1) : 0;
  const amount = price || (row && PLANS[row.plan] ? monthly(row.plan, row.dogs) : 0);
  if (!amount) return;
  const who = row ? row.name + ', ' + row.address + ', ' + row.zip : sub.customer;
  try {
    await stripe(env, 'POST', 'invoiceitems', { customer: sub.customer, amount, currency: 'usd',
      description: 'Free month charge: canceled during the free month' }, 'apw-early-item-' + sub.id);
    const inv = await stripe(env, 'POST', 'invoices', Object.assign({ customer: sub.customer, collection_method: 'charge_automatically',
      auto_advance: 'true', pending_invoice_items_behavior: 'include', description: 'You canceled during your free month, so this month is charged at your plan price.' },
      sub.default_payment_method ? { default_payment_method: sub.default_payment_method } : {}), 'apw-early-inv-' + sub.id);
    await stripe(env, 'POST', 'invoices/' + inv.id + '/finalize', {}, 'apw-early-fin-' + sub.id);
    await stripe(env, 'POST', 'invoices/' + inv.id + '/pay', {}, 'apw-early-pay-' + sub.id);
    ctx.waitUntil(mail(env, owner(env), 'Free month charged: ' + who, 'This customer canceled during the free month, so we charged ' + money(amount) + ' for the month.\n\nCustomer: ' + who + '\nStripe customer: ' + sub.customer));
  } catch (e) {
    console.error('free month charge failed', e);
    ctx.waitUntil(mail(env, owner(env), 'Check billing: free month charge failed', 'A customer canceled during the free month but the ' + money(amount) + ' charge failed. Charge it in Stripe.\n\nCustomer: ' + who + '\nStripe customer: ' + sub.customer));
  }
}

const FREE_RULE = 'Keep your plan after your free month and it stays free. If you cancel during your free month, we charge one month at your plan price.';
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
  const q = address + ', ' + ((ZIPS[zip] || {}).city || '') + ', AZ ' + (zip || '');
  try {
    const r = await fetch('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?benchmark=Public_AR_Current&format=json&address=' + enc(q));
    if (!r.ok) return null;
    const m = ((await r.json()).result || {}).addressMatches || [];
    return m[0] ? { lat: m[0].coordinates.y, lng: m[0].coordinates.x } : null;
  } catch (e) { return null; }
}
async function placeCustomer(env, c) {
  try {
    const patch = {};
    if (c.lat == null) { const g = await geocode(c.address, c.zip); if (g) Object.assign(patch, g); }
    if (c.service_day == null && c.area) {
      const a = (await db(env, 'GET', 'area_days?area=eq.' + enc(c.area) + '&select=day'))[0];
      if (a) { patch.service_day = a.day; if (c.plan === 'eow') patch.eow_week = 0; }
    }
    if (Object.keys(patch).length) await db(env, 'PATCH', 'customers?id=eq.' + c.id, patch, 'return=minimal');
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
    const r = await fetch(base(env) + '/auth/v1/otp', { method: 'POST', headers: sbHeaders(env.SUPABASE_SERVICE_ROLE_KEY), body: JSON.stringify({ email, create_user: true }) });
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
  if (path.startsWith('/api/track/') && m === 'GET') return track(path.slice(11), env);
  if (path === '/api/staff/code' && m === 'POST') return staffCode(request, env);
  if (path === '/api/staff/verify' && m === 'POST') return staffVerify(request, env);
  if (path === '/api/staff/refresh' && m === 'POST') return staffRefresh(request, env);
  if (path === '/api/office/night-before' && m === 'POST' && env.CRON_SECRET && String(env.CRON_SECRET).length >= 16 &&
    request.headers.get('x-cron-secret') === env.CRON_SECRET) return nightBefore(env, null);

  const s = await staffFor(env, await signedIn(request, env));
  if (!s) return fail(401, 'Please sign in again.');
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
  if (path === '/api/office/plan' && m === 'POST') return ok(await planDay(env, isDay(b.date) ? b.date : azToday()));
  if (path === '/api/office/stop' && m === 'POST') return officeStop(env, b);
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
  const r = await myRoute(s, env);
  if (!r) return ok({ day, dayName: DAYS[weekday(day)], route: null, stops: [], texts: [], me: { name: s.name, role: s.role } });
  const stops = await db(env, 'GET', 'stops?route_id=eq.' + r.id + '&select=' + CREW_STOP + '&order=position,id');
  const ids = stops.map((x) => x.id);
  const texts = ids.length ? await db(env, 'GET', 'messages?status=eq.queued&stop_id=in.(' + ids.join(',') + ')&select=id,stop_id,kind,to_addr,body&order=created_at') : [];
  return ok({ day, dayName: DAYS[weekday(day)], route: r, stops, texts, me: { name: s.name, role: s.role } });
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
async function defaultScooper(env) {
  const team = await db(env, 'GET', 'staff?active=is.true&select=id,role&order=created_at');
  return (team.find((t) => t.role === 'scooper') || team.find((t) => t.role === 'owner') || team[0] || {}).id || null;
}
// Builds the routes for a day from each yard's service day. Safe to press again: it only adds what is missing.
async function planDay(env, day) {
  const wd = weekday(day);
  const rows = await db(env, 'GET', 'customers?status=in.(' + PAYING.join(',') + ')&or=(service_day.eq.' + wd + ',service_day2.eq.' + wd + ')' +
    '&select=id,plan,eow_week,scooper_id,stop_order,pause_from,pause_until,first_visit,address');
  const due = rows.filter((c) => {
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
  const routes = await db(env, 'GET', 'routes?day=eq.' + day + '&select=id,staff_id');
  const routeOf = Object.fromEntries(routes.map((r) => [r.staff_id, r.id]));
  todo.sort((a, b) => (a.stop_order ?? 9999) - (b.stop_order ?? 9999) || String(a.address).localeCompare(String(b.address)));
  if (todo.length) {
    await db(env, 'POST', 'stops?on_conflict=day,customer_id', todo.map((c, i) => ({
      route_id: routeOf[c.scooper_id || fallback], customer_id: c.id, day, position: (c.stop_order ?? 9000 + i), code: newCode()
    })), 'resolution=ignore-duplicates,return=minimal');
  }
  return { ok: true, day, added: todo.length, due: due.length, noScooper: due.filter((c) => !have.has(c.id) && !c.scooper_id && !fallback).length };
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
  return ok({ day, dayName: DAYS[weekday(day)], today: azToday(), routes, stops, needDay, queuedTexts: queued.length, pings });
}
async function renumber(env, routeId) {
  const list = await db(env, 'GET', 'stops?route_id=eq.' + routeId + '&select=id,position&order=position,id');
  for (let i = 0; i < list.length; i++) if (list[i].position !== i + 1) await db(env, 'PATCH', 'stops?id=eq.' + list[i].id, { position: i + 1 }, 'return=minimal');
  return list.map((x, i) => ({ id: x.id, position: i + 1 }));
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
  const customers = await db(env, 'GET', 'customers?select=' + LIST_FIELDS + filter + '&order=service_day.nullsfirst,stop_order.nullslast,name&limit=1000');
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

// Arizona Pet Waste server (Cloudflare Pages advanced mode: this file ships as dist/_worker.js).
// Handles /api/* only. Every other request is a static page served by Cloudflare.
//
// Settings (Cloudflare Pages > Settings > Variables and Secrets):
//   SUPABASE_URL, SUPABASE_ANON_KEY (or the new publishable key), SUPABASE_SERVICE_ROLE_KEY (or the new secret key)
//   STRIPE_PUBLISHABLE_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
//   Optional: RESEND_API_KEY, NOTIFY_EMAIL (default info@arizonapetwaste.com), MAIL_FROM, SITE_URL, FIRST_VISIT_FROM (default 2026-11-20)
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
const NO_VISIT = ['2026-11-26', '2026-11-27', '2026-12-24', '2026-12-25', '2026-12-31', '2027-01-01'];
// The exact words shown next to the text boxes. Saved with every consent record.
const CONSENT = {
  visit: 'Text me about my visits. Night before reminders, on the way, and your gate photo. About 2 to 4 texts a visit.',
  deals: 'Text me deals too. Up to 4 texts a month.',
  fine: 'By checking a box, you agree to get texts from Arizona Pet Waste at the number above. Message and data rates may apply. Reply STOP to stop or HELP for help. You do not have to agree to texts to book. See our Text Terms and Privacy Policy.'
};
const CALL_US = 'Call or text 623.309.6104 and we will help.';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
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
  if (path === '/api/me' && m === 'GET') return meGet(request, env);
  if (path === '/api/me' && m === 'POST') return meSave(request, env);
  if (path === '/api/portal' && m === 'POST') return portal(request, env);
  if (path === '/api/health' && m === 'GET') return ok({ ok: true, live: live(env) });
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
async function stripe(env, method, path, params) {
  const q = params ? form(params) : '';
  const url = 'https://api.stripe.com/v1/' + path + (method === 'GET' && q ? '?' + q : '');
  const headers = { authorization: 'Bearer ' + env.STRIPE_SECRET_KEY, 'stripe-version': STRIPE_VERSION };
  if (method !== 'GET') headers['content-type'] = 'application/x-www-form-urlencoded';
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
function firstVisit(env, iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return null;
  const d = noonAZ(iso);
  if (isNaN(d)) return null;
  const from = noonAZ(env.FIRST_VISIT_FROM || '2026-11-20');
  const soonest = new Date(Math.max(noonAZ(azToday()).getTime() + 86400e3, from.getTime()));
  if (d < soonest || d > new Date(soonest.getTime() + 75 * 86400e3)) return null;
  const w = d.getUTCDay();
  if (w === 0 || w === 6 || NO_VISIT.includes(iso)) return null;
  return dayInfo(iso);
}
function dayInfo(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return null;
  const d = noonAZ(iso);
  const charge = plusMonth(d);
  return {
    iso,
    label: d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Phoenix' }),
    charge: Math.floor(charge.getTime() / 1000),
    chargeLabel: charge.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'America/Phoenix' })
  };
}

async function mail(env, to, subject, text) {
  if (!env.RESEND_API_KEY || !to) return;
  const from = env.MAIL_FROM || 'Arizona Pet Waste <info@arizonapetwaste.com>';
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + env.RESEND_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to: Array.isArray(to) ? to : [to], subject, text, reply_to: env.NOTIFY_EMAIL || 'info@arizonapetwaste.com' })
    });
    if (!r.ok) console.error('mail failed', r.status, await r.text());
  } catch (e) { console.error('mail failed', e); }
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
    firstVisitFrom: env.FIRST_VISIT_FROM || '2026-11-20'
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
  const day = firstVisit(env, b.firstVisit);
  if (!day) return fail(400, 'Please pick a first visit day from the list.');
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
    id: u.id, email: u.email, name, phone, address, zip, area: z.area, plan: b.plan, dogs, first_visit: day.iso,
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
      trial_end: day.charge,
      description: PLANS[b.plan].name + ', ' + dogs + (dogs === 1 ? ' dog' : ' dogs') + ', ' + z.name + '. First visit ' + day.label + '.',
      metadata: { user_id: u.id, plan: b.plan, dogs: String(dogs), zip, first_visit: day.iso }
    },
    metadata: { user_id: u.id, plan: b.plan, dogs: String(dogs), zip, first_visit: day.iso },
    custom_text: { submit: { message: 'You pay $0 today. Your first charge of ' + money(total) + ' is on ' + day.chargeLabel + '. Cancel in My Yard before then and you pay nothing.' } }
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
    let status = 'trialing';
    if (o.subscription) { try { status = (await stripe(env, 'GET', 'subscriptions/' + o.subscription)).status; } catch (e) { } }
    if (uid) {
      const rows = await db(env, 'PATCH', 'customers?id=eq.' + uid, { status, stripe_subscription_id: o.subscription, stripe_customer_id: o.customer, updated_at: now }, 'return=representation');
      const c = rows && rows[0];
      if (c) {
        const day = dayInfo(c.first_visit);
        const total = monthly(c.plan, c.dogs);
        ctx.waitUntil(mail(env, owner(env), 'New booking: ' + c.name + ', ' + (ZIPS[c.zip] || {}).name, [
          'New customer booked online.', '',
          'Name: ' + c.name, 'Email: ' + c.email, 'Mobile: ' + c.phone, 'Address: ' + c.address + ', ' + c.zip,
          'Plan: ' + PLANS[c.plan].name + ', ' + c.dogs + ' dogs, ' + money(total) + ' a month',
          'First visit: ' + (day ? day.label : c.first_visit), 'Visit texts: ' + (c.texts_visit ? 'yes' : 'no') + '. Deals texts: ' + (c.texts_deals ? 'yes' : 'no'),
          'Stripe customer: ' + o.customer
        ].join('\n')));
        ctx.waitUntil(mail(env, c.email, 'You are booked with Arizona Pet Waste', [
          'Hi ' + String(c.name).split(' ')[0] + ',', '',
          'You are booked. Your first visit is ' + (day ? day.label : c.first_visit) + '.',
          'Your first month is free. Your card is charged ' + money(total) + ' on ' + (day ? day.chargeLabel : 'one month after your first visit') + ', then once a month. Cancel before then and you pay $0.', '',
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
    if (gone && rows && rows[0]) ctx.waitUntil(mail(env, owner(env), 'Canceled: ' + rows[0].name, 'A customer canceled.\n\nName: ' + rows[0].name + '\nAddress: ' + rows[0].address + ', ' + rows[0].zip + '\nMobile: ' + rows[0].phone));
  } else if (evt.type === 'invoice.payment_failed') {
    const rows = await db(env, 'PATCH', 'customers?stripe_customer_id=eq.' + encodeURIComponent(o.customer), { status: 'past_due', updated_at: now }, 'return=representation');
    if (rows && rows[0]) ctx.waitUntil(mail(env, owner(env), 'Card failed: ' + rows[0].name, 'A payment failed. Stripe will retry.\n\nName: ' + rows[0].name + '\nMobile: ' + rows[0].phone + '\nEmail: ' + rows[0].email));
  }
  return ok({ received: true });
}

async function waitlist(request, env, ctx) {
  const b = await body(request);
  if (!b) return fail(400, 'Something was missing. Please try again.');
  if (b.website) return ok({ ok: true }); // bots fill the hidden field
  const email = clean(b.email, 200).toLowerCase();
  const zip = String(b.zip || '').replace(/\D/g, '').slice(0, 5);
  if (!emailOk(email)) return fail(400, 'Type your email, like you@email.com.');
  if (!live(env)) return ok({ ok: true, demo: true });
  await db(env, 'POST', 'waitlist', [{ email, zip, ip: request.headers.get('cf-connecting-ip') || '' }], 'return=minimal');
  ctx.waitUntil(mail(env, owner(env), 'Waitlist: ' + zip, email + ' wants service in ZIP ' + zip + '.'));
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

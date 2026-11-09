// Runs the server against fake Supabase and Stripe answers to check every request it builds.
import crypto from 'node:crypto';
import worker from '../src/worker/worker.js';

const SB = 'https://demo.supabase.co';
const env = {
  SUPABASE_URL: SB, SUPABASE_ANON_KEY: 'sb_publishable_test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test',
  STRIPE_SECRET_KEY: 'sk_test_123456', STRIPE_PUBLISHABLE_KEY: 'pk_test_1', STRIPE_WEBHOOK_SECRET: 'whsec_test', RESEND_API_KEY: 're_test',
  ASSETS: { fetch: async () => new Response('static') }
};
const ctx = { waitUntil: (p) => p };
const calls = [];
let stored = null, session = null;
const mails = [];
const credits = [];
let paidSoFar = [];
const subPosts = [];
const reply = (data, status = 200) => new Response(data === '' ? '' : JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
globalThis.fetch = async (url, init = {}) => {
  const m = init.method || 'GET';
  calls.push(m + ' ' + url.replace(SB, '{sb}') + (init.body && !String(url).includes('resend') ? '  ' + String(init.body).slice(0, 400) : ''));
  if (url === SB + '/auth/v1/user') return init.headers.authorization === 'Bearer good' ? reply({ id: 'u1', email: 'Test@Example.com' }) : reply({ msg: 'bad' }, 401);
  if (url.startsWith(SB + '/rest/v1/customers?id=eq.u1&select=') && m === 'GET') return reply(stored ? [stored] : []);
  if (url.startsWith(SB + '/rest/v1/customers?on_conflict=id')) { stored = JSON.parse(init.body)[0]; return reply('', 201); }
  if (url.startsWith(SB + '/rest/v1/customers?id=eq.u1') && m === 'PATCH') { Object.assign(stored, JSON.parse(init.body)); return reply([stored]); }
  if (url.startsWith(SB + '/rest/v1/consent_log')) return reply('', 201);
  if (url.startsWith('https://api.stripe.com/v1/customers')) return reply({ id: 'cus_1' });
  if (url.startsWith('https://api.stripe.com/v1/prices?')) return reply({ data: [{ id: 'price_wb', lookup_key: 'apw_week_base' }] });
  if (url.startsWith('https://api.stripe.com/v1/products/')) return reply({ error: { message: 'No such product' } }, 404);
  if (url === 'https://api.stripe.com/v1/products') return reply({ id: new URLSearchParams(init.body).get('id') });
  if (url === 'https://api.stripe.com/v1/prices') return reply({ id: 'price_' + new URLSearchParams(init.body).get('lookup_key') });
  if (url === 'https://api.stripe.com/v1/checkout/sessions') { session = new URLSearchParams(init.body); return reply({ client_secret: 'cs_test_secret' }); }
  if (url === 'https://api.resend.com/emails') { mails.push(JSON.parse(init.body)); return reply({ id: 'm1' }); }
  if (url === 'https://api.stripe.com/v1/invoiceitems') { credits.push({ body: new URLSearchParams(init.body), idem: init.headers['idempotency-key'] }); return reply({ id: 'ii_1' }); }
  if (url.startsWith('https://api.stripe.com/v1/invoices?subscription=')) return reply({ data: paidSoFar.map((n) => ({ amount_paid: n })) });
  if (url.startsWith('https://api.stripe.com/v1/invoices?customer=')) return reply({ data: [{ created: 1795000000, total: 4290, status: 'paid', hosted_invoice_url: 'https://invoice.stripe.com/i/test' }, { created: 1795000001, total: 100, status: 'draft' }] });
  if (url.startsWith(SB + '/rest/v1/stops?customer_id=eq.u1') && m === 'DELETE') return reply('', 200);
  if (url.startsWith('https://api.stripe.com/v1/subscriptions/sub_1') && m === 'POST') { subPosts.push(String(init.body)); return reply({ id: 'sub_1', status: 'active' }); }
  if (url === 'https://api.stripe.com/v1/invoices') return reply({ id: 'in_1', status: 'draft' });
  if (url === 'https://api.stripe.com/v1/invoices/in_1/finalize') return reply({ id: 'in_1', status: 'open' });
  if (url === 'https://api.stripe.com/v1/invoices/in_1/pay') return reply({ id: 'in_1', status: 'paid' });
  if (url.startsWith('https://api.stripe.com/v1/subscriptions/')) return reply({ status: 'trialing', trial_end: Number(session.get('subscription_data[trial_end]')), metadata: Object.fromEntries([...session.entries()].filter(([k]) => k.startsWith('subscription_data[metadata]')).map(([k, v]) => [k.slice(28, -1), v])) });
  return reply({ error: 'unmocked ' + url }, 500);
};
const call = (path, method = 'GET', body, auth) => worker.fetch(new Request('https://arizonapetwaste.com' + path, {
  method, body: body ? JSON.stringify(body) : undefined, headers: Object.assign({ 'content-type': 'application/json' }, auth ? { authorization: 'Bearer ' + auth } : {})
}), env, ctx);
const show = async (label, res) => console.log(label, res.status, JSON.stringify(await res.json()));

await show('config', await call('/api/config'));
await show('checkout without sign in', await call('/api/checkout', 'POST', {}, null));
const good = { zip: '85396', plan: 'week', dogs: 3, name: 'Test Person', phone: '(623) 555-0100', address: '123 W Test St', textsVisit: true, textsDeals: false, page: '/' };
await show('checkout bad zip', await call('/api/checkout', 'POST', Object.assign({}, good, { zip: '85001' }), 'good'));
await show('checkout ok', await call('/api/checkout', 'POST', good, 'good'));
console.log('first charge:', new Date(Number(session.get('subscription_data[trial_end]')) * 1000).toISOString());
console.log('stripe note:', session.get('subscription_data[description]'));
console.log('credit meta:', session.get('subscription_data[metadata][credit]'), 'first charge cents:', session.get('subscription_data[metadata][first_charge]'));
console.log('pay button note:', session.get('custom_text[submit][message]'));
console.log('\nrequests made:\n  ' + calls.join('\n  '));

const evt = JSON.stringify({ type: 'checkout.session.completed', data: { object: { mode: 'subscription', client_reference_id: 'u1', subscription: 'sub_1', customer: 'cus_1' } } });
const t = Math.floor(Date.now() / 1000);
const sig = crypto.createHmac('sha256', env.STRIPE_WEBHOOK_SECRET).update(t + '.' + evt).digest('hex');
const hook = (s) => worker.fetch(new Request('https://arizonapetwaste.com/api/stripe-webhook', { method: 'POST', body: evt, headers: { 'stripe-signature': s } }), env, ctx);
await show('\nwebhook bad signature', await hook('t=' + t + ',v1=deadbeef'));
await show('webhook good signature', await hook('t=' + t + ',v1=' + sig));
console.log('stored row status after webhook:', stored.status, stored.stripe_subscription_id);
await show('waitlist old form (no name)', await call('/api/waitlist', 'POST', { email: 'nope', zip: '85001' }));
await show('static page passes through', { status: (await call('/')).status, json: async () => 'served by ASSETS' });
for (const m of mails) console.log('\nEMAIL to ' + m.to + ': ' + m.subject + '\n' + m.text);
for (const c of credits) console.log('\nCREDIT', c.body.get('amount'), c.body.get('description'), 'idem:', c.idem);
mails.length = 0;
await show('\nwaitlist missing phone', await call('/api/waitlist', 'POST', { name: 'Wendy Wait', phone: '623', address: '1 W Main St', zip: '85301' }));
await show('waitlist ok', await call('/api/waitlist', 'POST', { name: 'Wendy Wait', phone: '(623) 555-0111', address: '1 W Main St', zip: '85301', texts: true }));
await show('sign up request ok', await call('/api/request', 'POST', Object.assign({}, good, { email: 'req@example.com', textsDeals: true })));
for (const m of mails) console.log('\nEMAIL to ' + m.to + ': ' + m.subject + '\n' + m.text);
const noMail = Object.assign({}, env); delete noMail.RESEND_API_KEY; delete noMail.SUPABASE_URL;
const r = await worker.fetch(new Request('https://arizonapetwaste.com/api/waitlist', { method: 'POST', body: JSON.stringify({ name: 'No Mail', phone: '6235550199', address: '2 W Main St', zip: '85301' }), headers: { 'content-type': 'application/json' } }), noMail, ctx);
console.log('\nwaitlist with no email set up', r.status, JSON.stringify(await r.json()));

// Free month rule: cancel asked before the free month ends is charged one month; after it, nothing.
const now = Math.floor(Date.now() / 1000);
const subEvt = (canceledAt, freeEnd) => JSON.stringify({ type: 'customer.subscription.deleted', data: { object: { id: 'sub_9', customer: 'cus_1', status: 'canceled',
  canceled_at: canceledAt, default_payment_method: 'pm_1', metadata: { user_id: 'u1', free_end: String(freeEnd) }, items: { data: [{ price: { unit_amount: 9900 }, quantity: 1 }] } } } });
const sendEvt = (body) => { const tt = Math.floor(Date.now() / 1000); const sg = crypto.createHmac('sha256', env.STRIPE_WEBHOOK_SECRET).update(tt + '.' + body).digest('hex');
  return worker.fetch(new Request('https://arizonapetwaste.com/api/stripe-webhook', { method: 'POST', body, headers: { 'stripe-signature': 't=' + tt + ',v1=' + sg } }), env, ctx); };
credits.length = 0; calls.length = 0; mails.length = 0;
await show('\ncancel during free month', await sendEvt(subEvt(now, now + 10 * 86400)));
console.log('early charge items:', credits.map((c) => c.body.get('amount') + ' ' + c.idem).join(' | '));
console.log('invoice calls:', calls.filter((c) => c.includes('/v1/invoices')).map((c) => c.split('  ')[0]).join(' | '));
console.log('owner mail:', mails.map((m) => m.subject).join(' | '));
credits.length = 0; calls.length = 0;
await show('cancel after free month', await sendEvt(subEvt(now, now - 86400)));
console.log('charges after free month (should be none):', credits.length, calls.filter((c) => c.includes('/v1/invoices')).length);

// 60 day rule: a cancel in the first 60 days brings what was paid up to one month at plan price.
const subEvt60 = (canceledAt, minEnd) => JSON.stringify({ type: 'customer.subscription.deleted', data: { object: { id: 'sub_60', customer: 'cus_1', status: 'canceled',
  canceled_at: canceledAt, default_payment_method: 'pm_1', metadata: { user_id: 'u1', free_end: String(now - 5 * 86400), min_end: String(minEnd) }, items: { data: [{ price: { unit_amount: 9900 }, quantity: 1 }] } } } });
const charged = () => credits.map((c) => c.body.get('amount')).join(',') || 'none';
credits.length = 0; paidSoFar = [];
await show('\ncancel on day 20, nothing paid', await sendEvt(subEvt60(now, now + 40 * 86400))); console.log('charged (want 9900):', charged());
credits.length = 0; paidSoFar = [4290];
await show('cancel on day 45, paid $42.90', await sendEvt(subEvt60(now, now + 15 * 86400))); console.log('charged (want 5610):', charged());
credits.length = 0; paidSoFar = [4290, 9900];
await show('cancel on day 55, paid over a month', await sendEvt(subEvt60(now, now + 5 * 86400))); console.log('charged (want none):', charged());
credits.length = 0; paidSoFar = [];
await show('cancel on day 61', await sendEvt(subEvt60(now, now - 86400))); console.log('charged (want none):', charged());

// My Yard self service
const az = (n) => new Date(Date.now() - 7 * 3600e3 + n * 86400e3).toISOString().slice(0, 10);
const wd = (d) => new Date(d + 'T19:00:00Z').getUTCDay();
Object.assign(stored, { status: 'active', plan: 'week', stripe_subscription_id: 'sub_1', stripe_customer_id: 'cus_1', service_day: wd(az(3)), service_day2: null, skips: [], first_visit: null, pause_from: null, pause_until: null });
await show('\nbills', await call('/api/me/invoices', 'GET', null, 'good'));
await show('plan', await call('/api/me/plan', 'GET', null, 'good'));
await show('skip next visit', await call('/api/me/skip', 'POST', { date: az(3) }, 'good'));
console.log('stored skips:', JSON.stringify(stored.skips));
await show('skip a day that is not a visit', await call('/api/me/skip', 'POST', { date: az(4) }, 'good'));
await show('undo skip', await call('/api/me/skip', 'POST', { date: az(3), undo: true }, 'good'));
await show('pause too long', await call('/api/me/pause', 'POST', { until: az(200) }, 'good'));
await show('pause 30 days', await call('/api/me/pause', 'POST', { until: az(30) }, 'good'));
console.log('stripe pause call:', decodeURIComponent(subPosts[0] || ''), '| row:', stored.status, stored.pause_from, stored.pause_until);
await show('start again', await call('/api/me/resume', 'POST', {}, 'good'));
console.log('stripe resume call:', decodeURIComponent(subPosts[1] || ''), '| row:', stored.status, stored.pause_until);

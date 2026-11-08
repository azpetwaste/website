// Runs the server against fake Supabase and Stripe answers to check every request it builds.
import crypto from 'node:crypto';
import worker from '../src/worker/worker.js';

const SB = 'https://demo.supabase.co';
const env = {
  SUPABASE_URL: SB, SUPABASE_ANON_KEY: 'sb_publishable_test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test',
  STRIPE_SECRET_KEY: 'sk_test_123456', STRIPE_PUBLISHABLE_KEY: 'pk_test_1', STRIPE_WEBHOOK_SECRET: 'whsec_test',
  ASSETS: { fetch: async () => new Response('static') }
};
const ctx = { waitUntil: (p) => p };
const calls = [];
let stored = null;
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
  if (url === 'https://api.stripe.com/v1/checkout/sessions') return reply({ client_secret: 'cs_test_secret' });
  if (url.startsWith('https://api.stripe.com/v1/subscriptions/')) return reply({ status: 'trialing' });
  return reply({ error: 'unmocked ' + url }, 500);
};
const call = (path, method = 'GET', body, auth) => worker.fetch(new Request('https://arizonapetwaste.com' + path, {
  method, body: body ? JSON.stringify(body) : undefined, headers: Object.assign({ 'content-type': 'application/json' }, auth ? { authorization: 'Bearer ' + auth } : {})
}), env, ctx);
const show = async (label, res) => console.log(label, res.status, JSON.stringify(await res.json()));

await show('config', await call('/api/config'));
await show('checkout without sign in', await call('/api/checkout', 'POST', {}, null));
const good = { zip: '85396', plan: 'week', dogs: 3, firstVisit: '2026-11-20', name: 'Test Person', phone: '(623) 555-0100', address: '123 W Test St', textsVisit: true, textsDeals: false, page: '/' };
await show('checkout bad zip', await call('/api/checkout', 'POST', Object.assign({}, good, { zip: '85001' }), 'good'));
await show('checkout weekend day', await call('/api/checkout', 'POST', Object.assign({}, good, { firstVisit: '2026-11-21' }), 'good'));
await show('checkout ok', await call('/api/checkout', 'POST', good, 'good'));
console.log('\nrequests made:\n  ' + calls.join('\n  '));

const evt = JSON.stringify({ type: 'checkout.session.completed', data: { object: { mode: 'subscription', client_reference_id: 'u1', subscription: 'sub_1', customer: 'cus_1' } } });
const t = Math.floor(Date.now() / 1000);
const sig = crypto.createHmac('sha256', env.STRIPE_WEBHOOK_SECRET).update(t + '.' + evt).digest('hex');
const hook = (s) => worker.fetch(new Request('https://arizonapetwaste.com/api/stripe-webhook', { method: 'POST', body: evt, headers: { 'stripe-signature': s } }), env, ctx);
await show('\nwebhook bad signature', await hook('t=' + t + ',v1=deadbeef'));
await show('webhook good signature', await hook('t=' + t + ',v1=' + sig));
console.log('stored row status after webhook:', stored.status, stored.stripe_subscription_id);
await show('waitlist bad email', await call('/api/waitlist', 'POST', { email: 'nope', zip: '85001' }));
await show('static page passes through', { status: (await call('/')).status, json: async () => 'served by ASSETS' });

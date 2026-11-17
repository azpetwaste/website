// Runs the server against a pretend Supabase and a pretend Stripe, and checks every request it builds.
// No database and no keys. `node build/worker.test.mjs` prints each check and exits 1 if one fails.
//
// Optional: STRIPE_SPEC=/path/to/spec3.json (the public file from github.com/stripe/openapi) also checks every
// Stripe request this server makes against Stripe's own list of fields and allowed values.
import crypto from 'node:crypto';
import fs from 'node:fs';
import worker from '../src/worker/worker.js';

const SB = 'https://demo.supabase.co';
const U1 = '11111111-1111-4111-8111-111111111111', U2 = '22222222-2222-4222-8222-222222222222';
const baseEnv = {
  SUPABASE_URL: SB, SUPABASE_ANON_KEY: 'sb_publishable_test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test',
  STRIPE_SECRET_KEY: 'sk_test_123456', STRIPE_PUBLISHABLE_KEY: 'pk_test_1', STRIPE_WEBHOOK_SECRET: 'whsec_test', RESEND_API_KEY: 're_test',
  ASSETS: { fetch: async () => new Response('static') }
};
let env = Object.assign({}, baseEnv);
const waits = [];
const ctx = { waitUntil: (p) => { waits.push(Promise.resolve(p).catch(() => { })); } };
const settle = async () => { while (waits.length) await Promise.all(waits.splice(0)); };

let pass = 0, failN = 0;
const ok = (label, cond, extra) => {
  if (cond) pass++; else failN++;
  console.log((cond ? '  ok   ' : '  FAIL ') + label + (cond || extra === undefined ? '' : '  ' + JSON.stringify(extra).slice(0, 400)));
};
const head = (t) => console.log('\n' + t);
// The server logs the failures this test causes on purpose. Keep them out of the way unless asked for.
const logged = [];
if (!process.env.VERBOSE) console.error = (...a) => { logged.push(a.map(String).join(' ').slice(0, 200)); };

/* ---------- pretend Supabase: two small tables and the filters this server uses ---------- */
const T = { customers: [], messages: [], consent_log: [], leads: [], stops: [], errors: [], area_days: [], settings: [], staff: [] };
const tokens = { good: { id: U1, email: 'Test@Example.com' }, two: { id: U2, email: 'two@example.com' } };
const deleted = [];
const blip = { patch: 0 };
function match(row, k, expr) {
  const i = expr.indexOf('.'), op = expr.slice(0, i), v = expr.slice(i + 1);
  const x = row[k];
  if (op === 'eq') return String(x) === v;
  if (op === 'neq') return String(x) !== v;
  if (op === 'in') return v.replace(/^\(|\)$/g, '').split(',').includes(String(x));
  if (op === 'not' && v === 'is.null') return x != null;
  if (op === 'is' && v === 'null') return x == null;
  if (op === 'gt') return String(x) > v;
  if (op === 'gte') return String(x) >= v;
  throw new Error('pretend Supabase: no filter ' + op);
}
function restRows(table, qs) {
  const params = [...new URLSearchParams(qs || '')].filter(([k]) => !['select', 'order', 'limit', 'offset', 'on_conflict'].includes(k));
  return T[table].filter((row) => params.every(([k, v]) => {
    if (k === 'or') return v.replace(/^\(|\)$/g, '').split(',').some((p) => { const i = p.indexOf('.'); return match(row, p.slice(0, i), p.slice(i + 1)); });
    return match(row, k, v);
  }));
}
function rest(method, rel, body, prefer) {
  const [table, qs] = rel.split('?');
  if (!T[table]) return reply({ message: 'no table ' + table }, 404);
  if (method === 'GET') return reply(restRows(table, qs).map((r) => Object.assign({}, r)));
  if (method === 'POST') {
    const rows = Array.isArray(body) ? body : [body];
    for (const r of rows) {
      const old = /on_conflict=id/.test(qs || '') && T[table].find((x) => x.id === r.id);
      if (old) Object.assign(old, r); else T[table].push(Object.assign(table === 'messages' ? { id: T.messages.length + 1, status: 'queued' } : {}, r));
    }
    return reply(/return=representation/.test(prefer || '') ? rows : '', 201);
  }
  if (method === 'PATCH') {
    if (table === 'customers' && blip.patch > 0) { blip.patch--; return reply({ message: 'database blip' }, 500); }
    const hit = restRows(table, qs);
    for (const r of hit) Object.assign(r, body);
    return reply(/return=representation/.test(prefer || '') ? hit.map((r) => Object.assign({}, r)) : '');
  }
  if (method === 'DELETE') { deleted.push(rel); return reply(''); }
  return reply({ message: 'bad method' }, 400);
}

/* ---------- pretend Stripe ---------- */
const S = { n: 0, customers: {}, prices: [{ id: 'price_wb', lookup_key: 'apw_week_base' }], sessions: {}, intents: {}, cards: {}, subs: {}, keys: {}, invoices: {}, calls: [], posts: [],
  funding: 'credit', failPlan: null, paidSoFar: [], subMeta: null, subPosts: [], items: [], payCalls: [],
  busy: 0, preview: null, badAnchor: 0, made: [], lines: [], failBill: false, all: [] };
const id = (p) => p + '_' + (++S.n);
const metaOf = (f, prefix) => Object.fromEntries([...f.entries()].filter(([k]) => k.startsWith(prefix + '[')).map(([k, v]) => [k.slice(prefix.length + 1, -1), v]));
function stripeApi(m, url, init) {
  const u = new URL(url), p = u.pathname.slice(4), q = u.searchParams;
  const f = new URLSearchParams(m === 'GET' ? '' : String(init.body || ''));
  const key = init.headers['idempotency-key'] || '';
  S.calls.push({ m, p, q, f, key, version: init.headers['stripe-version'] });
  S.all.push({ m, p, q, f }); // every request of the whole run, for the check against Stripe's field list (S.calls is emptied between cases)
  if (p === 'customers' && m === 'POST') { const c = { id: id('cus'), invoice_settings: { default_payment_method: null } }; S.customers[c.id] = c; return reply(c); }
  if (p.startsWith('customers/')) {
    const c = S.customers[p.slice(10)]; if (!c) return reply({ error: { message: 'No such customer' } }, 404);
    if (m === 'POST' && f.get('invoice_settings[default_payment_method]')) c.invoice_settings.default_payment_method = f.get('invoice_settings[default_payment_method]');
    return reply(Object.assign({}, c, q.get('expand[0]') ? { invoice_settings: { default_payment_method: S.cards[c.invoice_settings.default_payment_method] || null } } : {}));
  }
  if (p === 'prices' && m === 'GET') { const want = [...q.entries()].filter(([k]) => k.startsWith('lookup_keys')).map(([, v]) => v); return reply({ data: S.prices.filter((x) => want.includes(x.lookup_key)) }); }
  if (p.startsWith('products/')) return reply({ error: { message: 'No such product' } }, 404);
  if (p === 'products') return reply({ id: f.get('id') });
  if (p === 'prices') { const pr = { id: 'price_' + f.get('lookup_key'), lookup_key: f.get('lookup_key'), unit_amount: Number(f.get('unit_amount')) }; S.prices.push(pr); return reply(pr); }
  if (p === 'checkout/sessions') {
    if (S.refuseList && f.has('allowed_payment_method_types[0]')) return reply({ error: { message: 'Received unknown parameter: allowed_payment_method_types' } }, 400);
    if (S.refuseAll) return reply({ error: { message: 'Invalid request' } }, 400);
    const card = { id: id('pm'), type: 'card', card: { funding: S.funding } }; S.cards[card.id] = card;
    const si = { id: id('seti'), status: 'succeeded', payment_method: card.id }; S.intents[si.id] = si;
    const s = { id: id('cs_test'), object: 'checkout.session', created: Math.floor(Date.now() / 1000), mode: f.get('mode'), status: 'open', client_reference_id: f.get('client_reference_id'), customer: f.get('customer'), setup_intent: si.id, metadata: metaOf(f, 'metadata'), form: f };
    S.sessions[s.id] = s;
    return reply({ id: s.id, client_secret: s.id + '_secret_abc' });
  }
  if (p.startsWith('checkout/sessions/')) {
    const s = S.sessions[p.slice(18)]; if (!s) return reply({ error: { message: 'No such session' } }, 404);
    const si = S.intents[s.setup_intent];
    return reply(Object.assign({}, s, { form: undefined, setup_intent: Object.assign({}, si, { payment_method: S.cards[si.payment_method] }) }));
  }
  if (p.startsWith('setup_intents/')) { const si = S.intents[p.slice(14)]; return reply(Object.assign({}, si, { payment_method: q.get('expand[0]') ? S.cards[si.payment_method] : si.payment_method })); }
  if (p.startsWith('payment_methods/')) return reply(S.cards[p.slice(16)]);
  if (p === 'subscriptions' && m === 'GET') return reply({ data: Object.values(S.subs).filter((x) => x.customer === q.get('customer')) });
  if (p === 'subscriptions' && m === 'POST') {
    if (S.failPlan) { const r = reply({ error: { message: S.failPlan } }, 400); if (S.replay) r.headers.set('idempotent-replayed', 'true'); return r; }
    if (S.busy > 0) { S.busy--; return reply({ error: { type: 'idempotency_error', message: 'There is currently another in-progress request using this Idempotent Key' } }, 409); }
    if (key && S.keys[key]) return reply(S.keys[key]);
    const sub = { id: id('sub'), object: 'subscription', status: 'trialing', customer: f.get('customer'), trial_end: Number(f.get('trial_end')), billing_cycle_anchor: S.badAnchor || Number(f.get('billing_cycle_anchor') || f.get('trial_end')),
      pause_collection: null, latest_invoice: null, metadata: metaOf(f, 'metadata'), form: f };
    S.subs[sub.id] = sub; if (key) S.keys[key] = sub;
    return reply(sub);
  }
  if (p.startsWith('subscriptions/') && m === 'GET') {
    const sub = S.subs[p.slice(14)];
    if (sub) return reply(Object.assign({}, sub, { form: undefined }));
    return reply({ id: p.slice(14), status: 'active', metadata: S.subMeta || {} });
  }
  if (p.startsWith('subscriptions/') && m === 'POST') { S.subPosts.push(String(init.body)); return reply({ id: p.slice(14), status: 'active' }); }
  if (p === 'invoiceitems' && m === 'GET') return reply({ data: S.lines.filter((l) => l.customer === q.get('customer') && (q.get('pending') !== 'true' || l.pending)) });
  if (p === 'invoiceitems') { S.items.push({ f, key }); S.lines.push({ id: 'ii_' + S.lines.length, customer: f.get('customer'), amount: Number(f.get('amount')), metadata: metaOf(f, 'metadata'), pending: true }); return reply({ id: 'ii_1' }); }
  if (p === 'invoices' && m === 'GET') {
    if (q.get('subscription')) return reply({ data: S.paidSoFar.map((n) => ({ amount_paid: n })) });
    if (q.get('status') === 'open') return reply({ data: Object.values(S.invoices).filter((i) => i.customer === q.get('customer') && i.status === 'open') });
    return reply({ data: S.made.filter((i) => i.customer === q.get('customer')).concat([{ created: 1795000000, total: 4290, status: 'paid', hosted_invoice_url: 'https://invoice.stripe.com/i/test' }, { created: 1795000001, total: 100, status: 'draft' }]) });
  }
  if (p === 'invoices') {
    if (S.failBill) return reply({ error: { message: 'Stripe had a problem making the bill' } }, 500);
    const i = { id: 'in_new', status: 'draft', customer: f.get('customer'), metadata: metaOf(f, 'metadata'), lines: S.lines.filter((l) => l.pending && l.customer === f.get('customer')).map((l) => l.amount) };
    for (const l of S.lines) if (l.customer === f.get('customer')) l.pending = false;
    S.made.push(i); return reply(i);
  }
  if (p === 'invoices/create_preview') {
    const sub = S.subs[f.get('subscription')];
    if (S.preview === 'fail' || !sub) return reply({ error: { message: 'No upcoming invoices for customer' } }, 404);
    return reply({ object: 'invoice', status: 'draft', amount_due: S.preview != null ? S.preview : Number(sub.metadata.first_charge), subscription: sub.id });
  }
  if (/^invoices\/[^/]+\/finalize$/.test(p)) return reply({ id: 'in_new', status: 'open' });
  if (/^invoices\/[^/]+\/pay$/.test(p)) { const i = S.invoices[p.split('/')[1]]; S.payCalls.push({ id: p.split('/')[1], key }); if (i) i.status = 'paid'; return reply({ id: p.split('/')[1], status: 'paid' }); }
  if (p.startsWith('invoices/')) return reply(S.invoices[p.slice(9)] || { error: { message: 'No such invoice' } }, S.invoices[p.slice(9)] ? 200 : 404);
  if (p === 'billing_portal/sessions') return reply({ url: 'https://billing.stripe.com/p/session/test' });
  return reply({ error: { message: 'unmocked stripe ' + m + ' ' + p } }, 500);
}

const mails = [];
const PLACES = { off: false, zip: '85396' }, placeCalls = [];
const AUTH = {}, authCalls = []; // pretend Supabase Auth: email to { id, password }
const reply = (data, status = 200) => new Response(data === '' ? '' : JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  const m = init.method || 'GET';
  if (url === SB + '/auth/v1/user') { const u = tokens[String(init.headers.authorization || '').slice(7)]; return u ? reply(u) : reply({ msg: 'bad' }, 401); }
  if (url.startsWith(SB + '/rest/v1/')) return rest(m, url.slice((SB + '/rest/v1/').length), init.body ? JSON.parse(init.body) : null, init.headers && init.headers.prefer);
  if (url.startsWith('https://api.stripe.com/v1/')) return stripeApi(m, url, init);
  if (url === 'https://api.resend.com/emails') { mails.push(JSON.parse(init.body)); return reply({ id: 'm1' }); }
  if (url === SB + '/auth/v1/admin/users' && m === 'POST') {
    const b = JSON.parse(init.body); authCalls.push('create ' + b.email);
    if (b.password) return reply({ msg: 'this server must never set a password' }, 400);
    if (AUTH[b.email]) return reply({ msg: 'A user with this email address has already been registered' }, 422);
    const id = crypto.randomUUID(); AUTH[b.email] = { id }; return reply({ id, email: b.email });
  }
  if (url.startsWith(SB + '/auth/v1/admin/users/')) return reply({ msg: 'this server must never change an account' }, 400);
  if (url === SB + '/auth/v1/token?grant_type=password') return reply({ msg: 'this server must never sign in with a password' }, 400);
  if (url === SB + '/auth/v1/admin/generate_link') {
    const b = JSON.parse(init.body), a = AUTH[b.email]; authCalls.push('link ' + b.email);
    if (!a || b.type !== 'magiclink' || !/sb_secret/.test(JSON.stringify(init.headers))) return reply({ msg: 'User not found' }, 404);
    a.hash = 'hash_' + crypto.randomBytes(6).toString('hex');
    return reply({ id: AUTH.wrongUser || a.id, email: b.email, action_link: SB + '/auth/v1/verify?token=' + a.hash, email_otp: '123456', hashed_token: a.hash, verification_type: 'magiclink', redirect_to: '' });
  }
  if (url === SB + '/auth/v1/verify') {
    const b = JSON.parse(init.body), e = Object.keys(AUTH).find((k) => AUTH[k] && AUTH[k].hash && AUTH[k].hash === b.token_hash);
    if (!e || b.type !== 'magiclink') return reply({ msg: 'Email link is invalid or has expired' }, 403);
    delete AUTH[e].hash; // one use
    const id = AUTH.wrongUser || AUTH[e].id, t = 'tok_' + crypto.randomBytes(4).toString('hex'); tokens[t] = { id, email: e };
    return reply({ access_token: t, refresh_token: 'r_' + t, expires_in: 3600, user: { id, email: e } });
  }
  if (url === 'https://places.googleapis.com/v1/places:autocomplete') {
    const b = JSON.parse(init.body); placeCalls.push(b);
    if (PLACES.off) return reply({ error: { status: 'PERMISSION_DENIED', message: 'Places API (New) has not been used in project' } }, 403);
    return reply({ suggestions: [{ placePrediction: { placeId: 'ChIJ_test_place_1', structuredFormat: { mainText: { text: '4321 North Verrado Way' }, secondaryText: { text: 'Buckeye, AZ, USA' } } } }, { queryPrediction: { text: { text: 'not a place' } } }] });
  }
  if (url.startsWith('https://places.googleapis.com/v1/places/')) {
    return reply({ addressComponents: [{ longText: '4321', shortText: '4321', types: ['street_number'] }, { longText: 'North Verrado Way', shortText: 'N Verrado Way', types: ['route'] },
      { longText: 'Buckeye', shortText: 'Buckeye', types: ['locality', 'political'] }, { longText: PLACES.zip, shortText: PLACES.zip, types: ['postal_code'] }] });
  }
  if (url === 'https://challenges.cloudflare.com/turnstile/v0/siteverify') return reply({ success: JSON.parse(init.body).response === 'human' });
  return reply({ error: 'unmocked ' + url }, 500); // the Census map pin lookup and the route tables: placeCustomer shrugs these off
};
const call = async (path, method = 'GET', body, auth) => {
  const r = await worker.fetch(new Request('https://arizonapetwaste.com' + path, {
    method, body: body ? JSON.stringify(body) : undefined, headers: Object.assign({ 'content-type': 'application/json' }, auth ? { authorization: 'Bearer ' + auth } : {})
  }), env, ctx);
  let d = null; try { d = await r.json(); } catch (e) { }
  return { status: r.status, d };
};
const hook = async (evt, sig) => {
  const body = JSON.stringify(Object.assign({ created: Math.floor(Date.now() / 1000) }, evt)), t = Math.floor(Date.now() / 1000);
  const s = sig || 't=' + t + ',v1=' + crypto.createHmac('sha256', env.STRIPE_WEBHOOK_SECRET).update(t + '.' + body).digest('hex');
  const r = await worker.fetch(new Request('https://arizonapetwaste.com/api/stripe-webhook', { method: 'POST', body, headers: { 'stripe-signature': s } }), env, ctx);
  await settle();
  return r.status;
};
const row = (uid) => T.customers.find((c) => c.id === uid);
const sent = (re) => mails.filter((m) => re.test(m.subject));
const sessionEvt = (sid) => { const s = S.sessions[sid]; s.status = 'complete'; return { type: 'checkout.session.completed', data: { object: { id: s.id, object: 'checkout.session', mode: s.mode, status: 'complete', client_reference_id: s.client_reference_id, customer: s.customer, setup_intent: s.setup_intent, metadata: s.metadata } } }; };
const subEvt = (type, sub, over, was) => ({ type: 'customer.subscription.' + type, data: { object: Object.assign({}, sub, { form: undefined }, over || {}), previous_attributes: was } });
const reset = () => { mails.length = 0; deleted.length = 0; S.calls.length = 0; S.items.length = 0; S.payCalls.length = 0; };
const good = { zip: '85396', plan: 'week', dogs: 3, name: 'Test Person', phone: '(623) 555-0100', address: '123 W Test St', textsVisit: true, textsDeals: false, page: '/book/' };
const day = (unixSec) => new Date(unixSec * 1000).toISOString().slice(0, 16);

/* ---------- the basics ---------- */
head('Config and sign in');
{ const r = await call('/api/config');
  ok('config says live, with the day settings the sign up page needs', r.d.live === true && r.d.firstVisitFrom === '2026-11-20' && r.d.scheduleDays === 7 && r.d.stripeKey === 'pk_test_1', r.d);
  ok('no secret key in config', !JSON.stringify(r.d).includes('sk_test') && !JSON.stringify(r.d).includes('sb_secret') && !JSON.stringify(r.d).includes('whsec'));
  const h = await call('/api/health');
  ok('the health check says which Stripe mode the keys are for, and if the webhook secret and mail are set', h.d.ok === true && h.d.live === true && h.d.keys === 'test' && h.d.hook === true && h.d.mail === true, h.d);
  ok('the health check shows no key', !/_test_\d|whsec|re_test|sb_/.test(JSON.stringify(h.d)), h.d);
  env = Object.assign({}, baseEnv, { STRIPE_SECRET_KEY: 'sk_live_abcdef' });
  ok('one test key and one live key reads as mixed', (await call('/api/health')).d.keys === 'mixed');
  env = Object.assign({}, baseEnv, { STRIPE_SECRET_KEY: 'rk_live_abcdef', STRIPE_PUBLISHABLE_KEY: 'pk_live_1', STRIPE_WEBHOOK_SECRET: '' });
  { const l = await call('/api/health'); ok('two live keys read as live (a restricted key too), and a missing webhook secret shows', l.d.keys === 'live' && l.d.hook === false, l.d); }
  env = Object.assign({}, baseEnv);
  ok('checkout with no sign in and no email is refused', (await call('/api/checkout', 'POST', good)).status === 400);
  T.customers.length = 0; T.consent_log.length = 0; authCalls.length = 0;
  { // Joe, Nov 16, 2026: no email code for a new customer. The server makes the account, and the page gets NO session.
    const r = await call('/api/checkout', 'POST', Object.assign({}, good, { email: 'New@Example.com' }));
    const id = AUTH['new@example.com'] && AUTH['new@example.com'].id;
    ok('a new email opens the card form with no code and no sign in', r.status === 200 && !!r.d.clientSecret && /^cs_test/.test(r.d.session) && !!id, r.d);
    ok('the page is never handed a session, so typing an email cannot open an account', !r.d.auth && !/tok_|access_token|refresh_token/.test(JSON.stringify(r.d)), r.d);
    ok('the sign up row belongs to that new account', !!T.customers.find((c) => c.id === id && c.email === 'new@example.com' && c.status === 'checkout'));
    { // Deals consent is never taken at sign up, even if a page sends it: Twilio wants it in its own box (error 30913).
      const d = await call('/api/checkout', 'POST', Object.assign({}, good, { email: 'deals@example.com', phone: '6235550166', address: '66 W Deals St', textsVisit: true, textsDeals: true }));
      const rowD = T.customers.find((c) => c.email === 'deals@example.com'), log = T.consent_log.filter((c) => c.email === 'deals@example.com');
      ok('sign up turns visit texts on and never deals texts', d.status === 200 && rowD.texts_visit === true && rowD.texts_deals === false && log.find((c) => c.kind === 'texts_visit').granted === true && log.find((c) => c.kind === 'texts_deals').granted === false, log);
      ok('the saved consent words are the visit box only, with no deals in them', !/deals/i.test(log.find((c) => c.kind === 'texts_visit').text_shown), log.find((c) => c.kind === 'texts_visit').text_shown); }
    const again = await call('/api/checkout', 'POST', Object.assign({}, good, { email: 'new@example.com', address: '99 W Other St' }));
    ok('the same email before a plan starts picks the sign up back up: one account, one row, still no session', again.status === 200 && !again.d.auth && authCalls.filter((x) => x === 'create new@example.com').length === 1 && T.customers.filter((c) => c.email === 'new@example.com').length === 1, again.d);
    // The card is saved. The page has no sign in, so it reports in with the card form id alone.
    S.sessions[again.d.session].status = 'complete';
    const done = await call('/api/checkout/done', 'POST', { session: again.d.session }); await settle();
    ok('the page finishes the sign up with the card form id and no sign in', done.status === 200 && done.d.booked === true && T.customers.find((c) => c.id === id).status === 'trialing', done.d);
    ok('a made up card form id starts nothing', (await call('/api/checkout/done', 'POST', { session: 'cs_test_nope' })).status === 400);
    const booked = await call('/api/checkout', 'POST', Object.assign({}, good, { email: 'new@example.com' }));
    ok('once that email has a plan, sign up with no sign in sends the code, and gives nothing away', booked.status === 409 && booked.d.code === 'use_code' && !booked.d.auth && !booked.d.clientSecret, booked.d);
    T.staff.push({ id: 's1', email: 'maria@arizonapetwaste.com', active: true });
    const staff = await call('/api/checkout', 'POST', Object.assign({}, good, { email: 'Maria@ArizonaPetWaste.com' }));
    ok('a staff email gets the code and no account is made', staff.status === 409 && staff.d.code === 'use_code' && !authCalls.includes('create maria@arizonapetwaste.com'), staff.d);
    T.staff.length = 0;
    AUTH['signedin@example.com'] = { id: crypto.randomUUID() };
    const old = await call('/api/checkout', 'POST', Object.assign({}, good, { email: 'signedin@example.com' }));
    ok('an email that signed in before but never started a sign up gets the code', old.status === 409 && old.d.code === 'use_code', old.d);
    ok('with no bot check keys the page is told not to run one', (await call('/api/config')).d.botCheck === false);
    env = Object.assign({}, baseEnv, { TURNSTILE_SECRET_KEY: 'ts_secret', TURNSTILE_SITE_KEY: 'ts_site' });
    ok('with both keys the page is told to run it', (await call('/api/config')).d.botCheck === true);
    const bot = await call('/api/checkout', 'POST', Object.assign({}, good, { email: 'bot@example.com' }));
    ok('with the bot check on, a new email with no bot pass is refused and no account is made', bot.status === 403 && !AUTH['bot@example.com'], bot.d);
    const human = await call('/api/checkout', 'POST', Object.assign({}, good, { email: 'person@example.com', phone: '6235550177', address: '77 W Human St', bot: 'human' }));
    ok('and with a bot pass it goes through', human.status === 200 && !!human.d.clientSecret, human.d);
    ok('a signed in customer is not asked for a bot pass', (await call('/api/checkout', 'POST', Object.assign({}, good, { phone: '6235550188', address: '88 W Signed St' }), 'two')).status === 200);
    env = Object.assign({}, baseEnv);
    T.customers.length = 0; T.consent_log.length = 0; mails.length = 0; for (const k of Object.keys(S.subs)) delete S.subs[k];
  }
  ok('a ZIP we do not serve cannot check out', (await call('/api/checkout', 'POST', Object.assign({}, good, { zip: '85001' }), 'good')).status === 400);
  T.customers.push({ id: 'other', phone: '0000000000', address: '4321 West Example Street', zip: good.zip, stripe_subscription_id: 'sub_old', status: 'canceled' });
  const again = await call('/api/checkout', 'POST', Object.assign({}, good, { address: '4321 W. Example St' }), 'good');
  ok('a second free month at the same home is blocked', again.status === 409 && again.d.code === 'had_free_month', again);
  T.customers.length = 0; }

head('Street address suggestions');
{ let r = await call('/api/address?q=4321%20N%20Ver&s=abcd1234efgh');
  ok('with no Google key the list is empty and the form still works', r.status === 200 && r.d.list.length === 0 && placeCalls.length === 0, r.d);
  env = Object.assign({}, baseEnv, { GOOGLE_MAPS_SERVER_KEY: 'gk_test' });
  r = await call('/api/address?q=ab');
  ok('too little typed asks Google nothing', r.d.list.length === 0 && placeCalls.length === 0);
  r = await call('/api/address?q=4321%20N%20Ver&s=abcd1234efgh');
  ok('typing a street gives matches, kept inside our towns', r.status === 200 && r.d.list.length === 1 && r.d.list[0].main === '4321 North Verrado Way' && r.d.list[0].sub === 'Buckeye, AZ'
    && placeCalls[0].sessionToken === 'abcd1234efgh' && !!placeCalls[0].locationRestriction && !JSON.stringify(r.d).includes('gk_test'), r.d);
  r = await call('/api/address/pick?id=ChIJ_test_place_1&s=abcd1234efgh');
  ok('picking one fills the street and the ZIP', r.status === 200 && r.d.street === '4321 N Verrado Way' && r.d.zip === '85396' && r.d.served === true, r.d);
  PLACES.zip = '85001';
  r = await call('/api/address/pick?id=ChIJ_test_place_1');
  ok('a pick outside our ZIP codes says so', r.status === 200 && r.d.served === false, r.d);
  PLACES.zip = '85396';
  ok('a made up place id is refused', (await call('/api/address/pick?id=../../x')).status === 400);
  PLACES.off = true; placeCalls.length = 0;
  r = await call('/api/address?q=4321%20N%20Ver');
  const r2 = await call('/api/address?q=4321%20N%20Verr');
  ok('Places not switched on for the key: empty list, one note for the Health tab, and no more calls for a while', r.d.list.length === 0 && r2.d.list.length === 0 && placeCalls.length === 1
    && T.errors.some((e) => /Places API/.test(e.message || '')), { calls: placeCalls.length, errors: T.errors.length });
  PLACES.off = false; T.errors.length = 0; env = Object.assign({}, baseEnv); }

/* ---------- the money dates ---------- */
head('What the customer is told and what Stripe is told (first visit from a set day, so the dates do not move)');
async function quote(from, plan, dogs, token, extraEnv) {
  env = Object.assign({}, baseEnv, { FIRST_VISIT_FROM: from }, extraEnv || {});
  T.customers.length = 0; T.consent_log.length = 0;
  const r = await call('/api/checkout', 'POST', Object.assign({}, good, { plan, dogs }), token || 'good');
  const s = S.sessions[r.d && r.d.session];
  return { r, s, md: s ? s.metadata : {}, note: s ? s.form.get('custom_text[submit][message]') : '' };
}
{ // Start 2027-03-10: one month is April 10, plus the 7 day window is April 17. The 1st after that is May 1.
  const q = await quote('2027-03-10', 'week', 3);
  ok('free month ends April 17 at noon Arizona time', day(Number(q.md.free_end)) === '2027-04-17T19:00', q.md);
  ok('bills line up on May 1 at noon Arizona time', day(Number(q.md.anchor)) === '2027-05-01T19:00', q.md);
  // April has 30 days and 14 are left (April 17 to May 1). Plan $108, one extra dog $13: each line on its own.
  const want = Math.round(10800 * 14 / 30) + Math.round(1300 * 14 / 30);
  ok('part month is worked out line by line: $' + (want / 100).toFixed(2), Number(q.md.first_charge) === want && want === 5647, q.md.first_charge);
  ok('the 60 day rule is off: the sign up carries no early cancel date, only the day pausing opens (May 9)', q.md.min_label === undefined && q.md.min_end === undefined && day(Number(q.md.pause_from)) === '2027-05-09T19:00', q.md);
  ok('the note by the button says $0 today, the part month, the 1st and cancel anytime, with no 60 day rule',
    q.note === 'You pay $0 today. Your free month runs until April 17. That day we charge $56.47 for April 17 to May 1. Then $121 on the 1st of each month. Cancel anytime in My Yard.', q.note);
  ok('the note fits Stripe’s 1200 letter limit', q.note.length < 1200);
  const f = q.s.form;
  ok('the card form only saves a card: setup mode, embedded, never leaves the page', f.get('mode') === 'setup' && f.get('ui_mode') === 'embedded_page' && f.get('redirect_on_completion') === 'never' && f.get('currency') === 'usd');
  ok('cards and Link only (Apple Pay and Google Pay ride on cards)', f.get('allowed_payment_method_types[0]') === 'card' && f.get('allowed_payment_method_types[1]') === 'link' && !f.get('allowed_payment_method_types[2]'));
  ok('no field that Stripe refuses in setup mode', ![...f.keys()].some((k) => /^(payment_method_collection|subscription_data|line_items|payment_method_types|customer_update|success_url|return_url)/.test(k)), [...f.keys()]);
  ok('the session is tied to the signed in person', f.get('client_reference_id') === U1 && q.md.user_id === U1 && f.get('customer') === row(U1).stripe_customer_id);
  ok('the page gets the card form secret and the session id', /^cs_test_\d+_secret_/.test(q.r.d.clientSecret) && q.r.d.session === q.s.id, q.r.d);
  ok('the row waits at "checkout" with the text choices saved', row(U1).status === 'checkout' && row(U1).texts_visit === true && row(U1).texts_deals === false && T.consent_log.length === 2);
}
{ // A free month that ends on a 1st: start 2027-02-22, one month is March 22, plus 7 days is March 29... so use a start that lands on the 1st.
  // Start 2027-03-25: one month is April 25, plus 7 days is May 2. Start 2027-03-24: April 24 plus 7 is May 1.
  const q = await quote('2027-03-24', 'eow', 2);
  ok('free month ends on May 1: no part month, first charge is the full $75', day(Number(q.md.free_end)) === '2027-05-01T19:00' && q.md.anchor === q.md.free_end && q.md.first_charge === '7500', q.md);
  ok('the note says so', /^You pay \$0 today\. Your free month runs until May 1\. That day we charge \$75 for the month ahead\. Then \$75 on the 1st of each month\./.test(q.note), q.note);
}
{ // One day left in the month.
  const q = await quote('2027-06-23', 'twice', 6);
  ok('free month ends July 30: 2 days of a 31 day month', day(Number(q.md.free_end)) === '2027-07-30T19:00' && day(Number(q.md.anchor)) === '2027-08-01T19:00'
    && Number(q.md.first_charge) === Math.round(18900 * 2 / 31) + Math.round(5200 * 2 / 31), q.md);
  // Month ends: January 31 plus a month is the last day of February.
  const w = await quote('2027-01-31', 'week', 1);
  ok('a start on January 31 runs to February 28 plus the window: March 7', day(Number(w.md.free_end)) === '2027-03-07T19:00' && Number(w.md.first_charge) === Math.round(10800 * 25 / 31), w.md);
  // December into January.
  const x = await quote('2027-11-28', 'week', 2);
  ok('a free month can end in the new year: January 4, 2028, bills line up on February 1', day(Number(x.md.free_end)) === '2028-01-04T19:00' && day(Number(x.md.anchor)) === '2028-02-01T19:00' && Number(x.md.first_charge) === Math.round(10800 * 28 / 31), x.md);
  const y = await quote('2027-03-10', 'week', 3, 'good', { SCHEDULE_DAYS: '3' });
  ok('the scheduling window can be changed in Cloudflare (3 days: April 13)', day(Number(y.md.free_end)) === '2027-04-13T19:00', y.md);
  for (const plan of ['week', 'twice', 'eow']) for (let dogs = 1; dogs <= 6; dogs++) {
    const z = await quote('2027-03-10', plan, dogs);
    const base = { week: 10800, twice: 18900, eow: 7500 }[plan], extra = Math.max(0, dogs - 2) * { week: 1300, twice: 1300, eow: 900 }[plan];
    if (Number(z.md.first_charge) !== Math.round(base * 14 / 30) + Math.round(extra * 14 / 30) || Number(z.md.first_charge) < 50) { ok('part month for ' + plan + ' ' + dogs, false, z.md); }
  }
  ok('every plan and dog count gives a part month Stripe can charge (50 cents or more)', true);
}

/* ---------- a sign up, start to finish ---------- */
head('Sign up: the Stripe webhook starts the plan');
let q = await quote('2027-03-10', 'week', 3);
reset();
ok('webhook with a bad signature is refused', (await hook(sessionEvt(q.s.id), 't=1,v1=deadbeef')) === 400 && row(U1).status === 'checkout');
ok('webhook with a good signature is taken', (await hook(sessionEvt(q.s.id))) === 200);
{ const posts = S.calls.filter((c) => c.m === 'POST' && c.p === 'subscriptions');
  const f = posts[0] && posts[0].f;
  ok('one plan is made in Stripe', posts.length === 1 && Object.keys(S.subs).length === 1);
  ok('free until April 17, bills on the 1st from May 1, Stripe charges the days in between',
    f.get('trial_end') === q.md.free_end && f.get('billing_cycle_anchor') === q.md.anchor && f.get('proration_behavior') === 'create_prorations', String(f));
  ok('the plan has the base price and one extra dog', f.get('items[0][price]') === 'price_wb' && f.get('items[0][quantity]') === '1' && f.get('items[1][price]') === 'price_apw_week_extra' && f.get('items[1][quantity]') === '1');
  ok('the plan remembers the dates the customer saw', f.get('metadata[user_id]') === U1 && f.get('metadata[pause_from]') === q.md.pause_from && !f.get('metadata[min_end]') && f.get('metadata[free_label]') === 'April 17' && f.get('metadata[next_label]') === 'May 1' && f.get('metadata[first_charge]') === '5647' && f.get('metadata[session]') === q.s.id);
  ok('Stripe is told to make this plan only once for this sign up', posts[0].key === 'apw-plan-' + q.s.id);
  const cust = S.customers[row(U1).stripe_customer_id];
  ok('the saved card is the card on file for every bill (set on the customer, not on the plan)', cust.invoice_settings.default_payment_method === S.intents[q.s.setup_intent].payment_method && !f.get('default_payment_method'));
  ok('the card is set before the plan is made', S.calls.findIndex((c) => c.m === 'POST' && c.p.startsWith('customers/')) < S.calls.findIndex((c) => c.m === 'POST' && c.p === 'subscriptions'));
  ok('the row is on its free month with the plan id', row(U1).status === 'trialing' && row(U1).stripe_subscription_id === Object.keys(S.subs)[0]);
  ok('the office gets one new booking email', sent(/^New booking: Test Person/).length === 1 && /Billing: Your free month runs until April 17\. That day we charge \$56\.47 for April 17 to May 1\. Then \$121 on the 1st of each month\./.test(sent(/^New booking/)[0].text), mails.map((m) => m.subject));
  const hi = sent(/^You are booked/)[0];
  { // The welcome email signs them in to My Yard with one tap, no code, for 7 days.
    const k = (/\/account\/\?k=([^\s]+)/.exec(hi.text) || [])[1];
    AUTH['test@example.com'] = { id: U1 };
    const r = await call('/api/me/link', 'POST', { k });
    ok('the welcome email has a My Yard link that signs the customer in', !!k && r.status === 200 && r.d.session.user.id === U1 && /^tok_/.test(r.d.session.access_token) && tokens[r.d.session.access_token].id === U1, { k, d: r.d });
    ok('it signs in with a one time email token, never a password', authCalls.includes('link test@example.com') && !AUTH['test@example.com'].hash && !AUTH['test@example.com'].password);
    ok('that session opens My Yard', (await call('/api/me', 'GET', null, r.d.session.access_token)).status === 200);
    const bad = await call('/api/me/link', 'POST', { k: k.slice(0, -2) + (k.slice(-2) === 'AA' ? 'BB' : 'AA') });
    ok('a changed link does nothing', bad.status === 410 && !bad.d.session, bad.d);
    const [uid, exp, sig] = k.split('.');
    const other = await call('/api/me/link', 'POST', { k: U2 + '.' + exp + '.' + sig });
    ok('a link cannot be moved to another customer', other.status === 410, other.d);
    ok('a link with a later end date typed in does nothing', (await call('/api/me/link', 'POST', { k: uid + '.' + (Number(exp) + 999) + '.' + sig })).status === 410);
    T.staff.push({ id: 's1', email: 'test@example.com', active: true });
    ok('a link never signs in a staff account', (await call('/api/me/link', 'POST', { k })).status === 410);
    T.staff.length = 0;
    AUTH.wrongUser = U2;
    const wrong = await call('/api/me/link', 'POST', { k });
    ok('if Supabase ever answers with another account, the session is thrown away', wrong.status === 410 && !wrong.d.session, wrong.d);
    delete AUTH.wrongUser; T.errors.length = 0;
  }
  ok('the customer gets one welcome email with the dates and cancel anytime, and no 60 day rule', sent(/^You are booked/).length === 1 && hi.to[0] === 'test@example.com'
    && /We did not charge it today/.test(hi.text) && /That day we charge \$56\.47/.test(hi.text) && /You can cancel anytime in My Yard\.\n/.test(hi.text) && !/Keep your plan|60 days|charge one month/.test(hi.text), hi && hi.text);
  ok('every Stripe request names the API version', S.calls.every((c) => c.version === '2026-10-28.endive'));
}
head('Sign up: nothing doubles up');
{ const before = mails.length, subsBefore = Object.keys(S.subs).length;
  ok('Stripe sends the same event again: still one plan, no second welcome', (await hook(sessionEvt(q.s.id))) === 200 && Object.keys(S.subs).length === subsBefore && mails.length === before);
  const d = await call('/api/checkout/done', 'POST', { session: q.s.id }, 'good'); await settle();
  ok('the sign up page reports in after the webhook: still one plan, no second welcome', d.status === 200 && d.d.booked === true && Object.keys(S.subs).length === subsBefore && mails.length === before, d);
  const sub = Object.values(S.subs)[0];
  ok('the plan events from Stripe change nothing more', (await hook(subEvt('created', sub))) === 200 && (await hook(subEvt('updated', sub))) === 200 && mails.length === before && row(U1).status === 'trialing');
  ok('a booked customer who opens sign up again is told they have a plan', (await call('/api/checkout', 'POST', good, 'good')).d.already === true);
}
{ // The page gets there first, the webhook second.
  for (const k of Object.keys(S.subs)) delete S.subs[k];
  q = await quote('2027-03-10', 'eow', 1, 'two'); reset();
  S.sessions[q.s.id].status = 'open';
  let d = await call('/api/checkout/done', 'POST', { session: q.s.id }, 'two');
  ok('a card form that is not finished starts nothing', d.status === 200 && d.d.booked === false && Object.keys(S.subs).length === 0 && row(U2).status === 'checkout', d);
  S.sessions[q.s.id].status = 'complete';
  ok('someone else cannot finish this sign up', (await call('/api/checkout/done', 'POST', { session: q.s.id }, 'good')).status === 403);
  ok('a made up session id is refused', (await call('/api/checkout/done', 'POST', { session: 'cs_../../customers' }, 'two')).status === 400);
  d = await call('/api/checkout/done', 'POST', { session: q.s.id }, 'two'); await settle();
  ok('the sign up page starts the plan when the webhook is late', d.status === 200 && d.d.booked === true && Object.keys(S.subs).length === 1 && row(U2).status === 'trialing' && sent(/^You are booked/).length === 1, d);
  const f = S.calls.filter((c) => c.m === 'POST' && c.p === 'subscriptions')[0].f;
  ok('one or two dogs: one line on the plan', f.get('items[0][quantity]') === '1' && !f.get('items[1][price]'));
  ok('then the webhook lands: still one plan, one welcome', (await hook(sessionEvt(q.s.id))) === 200 && Object.keys(S.subs).length === 1 && sent(/^You are booked/).length === 1 && sent(/^New booking/).length === 1);
}
{ // Stripe's "plan created" event can beat startPlan to the row.
  for (const k of Object.keys(S.subs)) delete S.subs[k];
  q = await quote('2027-03-10', 'week', 2); reset();
  const fake = { id: 'sub_early', status: 'trialing', customer: row(U1).stripe_customer_id, pause_collection: null, metadata: { user_id: U1, free_label: 'April 17', next_label: 'May 1', first_charge: '5040', min_label: 'May 9' } };
  S.subs.sub_early = Object.assign({ form: new URLSearchParams() }, fake);
  ok('the plan event books the sign up and sends the welcome', (await hook(subEvt('created', fake))) === 200 && row(U1).status === 'trialing' && row(U1).stripe_subscription_id === 'sub_early' && sent(/^You are booked/).length === 1);
  ok('then the session event finds the plan and adds nothing', (await hook(sessionEvt(q.s.id))) === 200 && Object.keys(S.subs).length === 1 && sent(/^You are booked/).length === 1 && !S.calls.some((c) => c.m === 'POST' && c.p === 'subscriptions'));
}
{ // A free month that ends on a 1st: no anchor is sent, Stripe bills from the day the free month ends.
  for (const k of Object.keys(S.subs)) delete S.subs[k];
  q = await quote('2027-03-24', 'week', 2); reset();
  await hook(sessionEvt(q.s.id));
  const f = S.calls.filter((c) => c.m === 'POST' && c.p === 'subscriptions')[0].f;
  ok('free month ends on a 1st: Stripe gets the free month end and no second date', f.get('trial_end') === q.md.free_end && !f.has('billing_cycle_anchor') && !f.has('proration_behavior'), String(f));
  ok('the welcome says the full price that day', /Your free month runs until May 1\. That day we charge \$108 for the month ahead\. Then \$108 on the 1st of each month\./.test(sent(/^You are booked/)[0].text));
}
{ // A prepaid card is flagged for the office.
  for (const k of Object.keys(S.subs)) delete S.subs[k];
  S.funding = 'prepaid'; q = await quote('2027-03-10', 'week', 2); S.funding = 'credit'; reset();
  await hook(sessionEvt(q.s.id));
  ok('a prepaid card is flagged for the office', sent(/^Prepaid card: Test Person/).length === 1 && sent(/^PREPAID CARD\. New booking/).length === 1);
}
head('Sign up: Stripe refuses to start the plan');
{ for (const k of Object.keys(S.subs)) delete S.subs[k];
  q = await quote('2027-03-10', 'week', 2); reset();
  S.failPlan = 'Something is wrong with this request';
  ok('the webhook answers 500 so Stripe sends it again', (await hook(sessionEvt(q.s.id))) === 500 && row(U1).status === 'checkout');
  const a = sent(/^ACTION NEEDED: card saved but the plan did not start: Test Person/);
  ok('the office is told right away, with who and why', a.length === 1 && /Stripe checkout session: cs_test_/.test(a[0].text) && /Something is wrong with this request/.test(a[0].text) && /Mobile: 6235550100/.test(a[0].text), mails.map((m) => m.subject));
  ok('the email says the site keeps trying and never says to start a plan by hand', /tries again on its own for up to 3 days/.test(a[0].text) && /If a plan is there, do not start a second one\. Two plans means two bills\./.test(a[0].text) && !/Start it by hand/.test(a[0].text), a[0] && a[0].text);
  await settle();
  ok('the Health tab line says what happened in plain words', T.errors.some((e) => e.path === '/api/stripe-webhook' && /^Card saved but the plan did not start \(cs_test_\d+\)\. stripe 400 Something is wrong/.test(e.message)), T.errors.slice(-2));
  mails.length = 0;
  ok('an old retry of that event does not email the office again', (await hook(Object.assign(sessionEvt(q.s.id), { created: Math.floor(Date.now() / 1000) - 7200 }))) === 500 && mails.length === 0);
  const d = await call('/api/checkout/done', 'POST', { session: q.s.id }, 'good'); await settle();
  ok('the sign up page gets an error too', d.status === 500);
  for (let i = 0; i < 3; i++) await call('/api/checkout/done', 'POST', { session: q.s.id }, 'good');
  await settle();
  ok('asking again and again does not email the office again', mails.length === 0);
  ok('a first time failure does not say that waiting is no use', !/Waiting will not fix/.test(a[0].text));
  S.failPlan = null; mails.length = 0;
  ok('once Stripe takes it, the next retry books them', (await hook(sessionEvt(q.s.id))) === 200 && row(U1).status === 'trialing' && sent(/^You are booked/).length === 1);
}

{ // Stripe keeps a failed answer for a day and hands the same one back. Then waiting is no use, and the office must hear that.
  for (const k of Object.keys(S.subs)) delete S.subs[k];
  q = await quote('2027-03-10', 'week', 2); reset();
  S.failPlan = 'Stripe had a problem';
  await hook(sessionEvt(q.s.id));
  ok('the first failure gets the plain notice', sent(/^ACTION NEEDED/).length === 1 && !/Waiting will not fix/.test(sent(/^ACTION NEEDED/)[0].text));
  mails.length = 0; S.replay = true;
  const st = await hook(Object.assign(sessionEvt(q.s.id), { created: Math.floor(Date.now() / 1000) - 7200 }));
  const a2 = sent(/^ACTION NEEDED/)[0];
  ok('a later retry where Stripe repeats that failure tells the office waiting will not fix it, even on an old event', st === 500 && !!a2 && /it will for one day\. Waiting will not fix this one\. Tell Joe now\./.test(a2.text), mails.map((m) => m.subject));
  mails.length = 0;
  await hook(Object.assign(sessionEvt(q.s.id), { created: Math.floor(Date.now() / 1000) - 9000 }));
  ok('and says it once, not on every retry', mails.length === 0);
  S.replay = false; S.failPlan = null;
}
head('Sign up: Stripe is busy with the same request');
{ for (const k of Object.keys(S.subs)) delete S.subs[k];
  q = await quote('2027-03-10', 'week', 3); reset(); T.errors.length = 0;
  S.busy = 2;
  const st = await hook(sessionEvt(q.s.id));
  const posts = S.calls.filter((c) => c.m === 'POST' && c.p === 'subscriptions');
  ok('Stripe says twice that the other caller is still at it: the server asks again with the same key and books them', st === 200 && row(U1).status === 'trialing' && Object.keys(S.subs).length === 1
    && posts.length === 3 && posts.every((c) => c.key === 'apw-plan-' + q.s.id && String(c.f) === String(posts[0].f)) && sent(/^ACTION NEEDED/).length === 0 && sent(/^You are booked/).length === 1, [st, posts.length]);
  for (const k of Object.keys(S.subs)) delete S.subs[k];
  q = await quote('2027-03-10', 'week', 3); reset(); S.busy = 9;
  ok('if Stripe stays busy the webhook gives up with a 500 so Stripe sends the event again', (await hook(sessionEvt(q.s.id))) === 500 && S.calls.filter((c) => c.m === 'POST' && c.p === 'subscriptions').length === 4 && row(U1).status === 'checkout');
  S.busy = 0;
}
head('Sign up: the first bill is checked against Stripe');
{ for (const k of Object.keys(S.subs)) delete S.subs[k];
  q = await quote('2027-03-10', 'week', 3); reset(); T.errors.length = 0;
  await hook(sessionEvt(q.s.id));
  const pv = S.calls.filter((c) => c.p === 'invoices/create_preview');
  ok('a new plan gets one look at its first bill in Stripe, and the look changes nothing', pv.length === 1 && pv[0].m === 'POST' && pv[0].f.get('subscription') === row(U1).stripe_subscription_id && [...pv[0].f.keys()].length === 1, pv.map((c) => String(c.f)));
  ok('Stripe agrees with what the customer was told: nobody is emailed and nothing is logged', sent(/^CHECK BILLING/).length === 0 && T.errors.length === 0, T.errors);
  await hook(sessionEvt(q.s.id)); await call('/api/checkout/done', 'POST', { session: q.s.id }, 'good'); await settle();
  ok('reporting the sign up again does not look again', S.calls.filter((c) => c.p === 'invoices/create_preview').length === 1);

  for (const k of Object.keys(S.subs)) delete S.subs[k];
  q = await quote('2027-03-10', 'week', 3); reset(); T.errors.length = 0;
  S.preview = 12100; // Stripe would charge a full month, the customer was told the part month
  await hook(sessionEvt(q.s.id)); S.preview = null;
  const a = sent(/^CHECK BILLING: Stripe does not match what Test Person was told$/);
  ok('if Stripe would charge something else, the office hears about it that day', a.length === 1 && /1\. The first charge\. They were told \$56\.47\. Stripe plans to charge \$121\./.test(a[0].text) && /Nothing has been charged/.test(a[0].text)
    && /Do not change the plan in Stripe by hand/.test(a[0].text) && a[0].text.includes('Stripe plan: ' + row(U1).stripe_subscription_id), a[0] && a[0].text);
  ok('and it is on the Health tab', T.errors.length === 1 && /does not match what a new customer was told/.test(T.errors[0].message) && /They were told \$56\.47/.test(T.errors[0].detail), T.errors);
  ok('the sign up itself still went through', row(U1).status === 'trialing' && sent(/^You are booked/).length === 1 && sent(/^New booking/).length === 1);

  for (const k of Object.keys(S.subs)) delete S.subs[k];
  q = await quote('2027-03-10', 'week', 3); reset(); T.errors.length = 0;
  S.preview = Number(q.md.first_charge) + 1;
  await hook(sessionEvt(q.s.id)); S.preview = null;
  ok('one cent of rounding is not a mismatch', sent(/^CHECK BILLING/).length === 0 && T.errors.length === 0);

  // A free month that ends on a 1st sends no billing day. If Stripe ever lined the bills up on some other day, we would know.
  for (const k of Object.keys(S.subs)) delete S.subs[k];
  q = await quote('2027-03-24', 'week', 2); reset(); T.errors.length = 0;
  S.badAnchor = Math.floor(Date.UTC(2027, 2, 24, 22, 15) / 1000); // the day of the sign up, not the 1st
  await hook(sessionEvt(q.s.id)); S.badAnchor = 0;
  const b = sent(/^CHECK BILLING/);
  ok('a billing day that is not the 1st is caught', b.length === 1 && /1\. The billing day\. They were told the 1st of each month\. Stripe has day 24 \(March 24, 2027/.test(b[0].text) && !/\d\. The first charge/.test(b[0].text) && !/\d\. The day the free month ends/.test(b[0].text), b[0] && b[0].text);

  for (const k of Object.keys(S.subs)) delete S.subs[k];
  q = await quote('2027-03-10', 'week', 3); reset(); T.errors.length = 0;
  S.preview = 'fail';
  const st = await hook(sessionEvt(q.s.id)); S.preview = null;
  ok('if the look itself fails, the sign up still goes through, the Health tab gets a note and nobody is emailed', st === 200 && row(U1).status === 'trialing' && sent(/^CHECK BILLING/).length === 0 && sent(/^ACTION NEEDED/).length === 0
    && T.errors.length === 1 && /could not be checked against Stripe/.test(T.errors[0].message), T.errors);
}
{ // The plan is made in Stripe, then the database has a blip before the row is updated.
  for (const k of Object.keys(S.subs)) delete S.subs[k];
  q = await quote('2027-03-10', 'week', 3); reset(); T.errors.length = 0;
  blip.patch = 1;
  const st = await hook(sessionEvt(q.s.id));
  ok('the plan is made, the row update fails: Stripe is told to send the event again, and the first bill was still looked at', st === 500 && Object.keys(S.subs).length === 1 && row(U1).status === 'checkout' && S.calls.filter((c) => c.p === 'invoices/create_preview').length === 1);
  ok('the retry books them with the plan that is there: no second plan, no second look', (await hook(sessionEvt(q.s.id))) === 200 && row(U1).status === 'trialing' && Object.keys(S.subs).length === 1
    && S.calls.filter((c) => c.m === 'POST' && c.p === 'subscriptions').length === 1 && S.calls.filter((c) => c.p === 'invoices/create_preview').length === 1 && sent(/^You are booked/).length === 1);
}
head('Sign up: an old sign up reported again starts nothing');
{ // The customer from the last sign up cancels. A day later Stripe has forgotten the "only once" key.
  const sid = q.s.id, plan = row(U1).stripe_subscription_id;
  S.subs[plan].status = 'canceled'; row(U1).status = 'canceled';
  for (const k of Object.keys(S.keys)) delete S.keys[k];
  reset();
  const writes = () => S.calls.filter((c) => c.m === 'POST' && (c.p === 'subscriptions' || c.p.startsWith('customers/'))).length;
  const d = await call('/api/checkout/done', 'POST', { session: sid }, 'good'); await settle();
  ok('the page reports the old sign up of a customer who canceled: no new plan, nothing written to Stripe', d.status === 200 && d.d.booked === false && writes() === 0 && row(U1).status === 'canceled' && mails.length === 0, d);
  ok('Stripe sends the old event again: the same', (await hook(sessionEvt(sid))) === 200 && writes() === 0 && row(U1).status === 'canceled' && Object.values(S.subs).filter((x) => x.status !== 'canceled').length === 0);
  // Even if the row were put back at the card step by hand, the plan from this sign up was canceled: no second one.
  row(U1).status = 'checkout';
  ok('a sign up whose plan was canceled never makes a second plan', (await hook(sessionEvt(sid))) === 200 && writes() === 0 && row(U1).status === 'checkout' && mails.length === 0);
}
{ // The free month end on the sign up has passed (a card form finished very late, or a broken sign up asked about again).
  for (const k of Object.keys(S.subs)) delete S.subs[k];
  q = await quote('2027-03-10', 'week', 2); reset();
  S.sessions[q.s.id].metadata.free_end = String(Math.floor(Date.now() / 1000) - 86400);
  ok('a sign up with dates in the past is refused before anything is written to Stripe', (await hook(sessionEvt(q.s.id))) === 500 && !S.calls.some((c) => c.m === 'POST' && (c.p === 'subscriptions' || c.p.startsWith('customers/')))
    && S.customers[row(U1).stripe_customer_id].invoice_settings.default_payment_method === null && row(U1).status === 'checkout');
}
{ // Two tabs: the row holds the last choice, the customer finishes the older card form.
  for (const k of Object.keys(S.subs)) delete S.subs[k];
  const first = await quote('2027-03-10', 'week', 3);
  const second = await call('/api/checkout', 'POST', Object.assign({}, good, { plan: 'eow', dogs: 1 }), 'good');
  reset();
  ok('two card forms open: the row holds the last choice', row(U1).plan === 'eow' && row(U1).dogs === 1 && second.d.session !== first.s.id);
  await hook(sessionEvt(first.s.id));
  ok('the row follows the plan that was finished, since that is the plan Stripe bills', row(U1).plan === 'week' && row(U1).dogs === 3 && /Plan: Every week, 3 dogs, \$121 a month/.test(sent(/^New booking/)[0].text), [row(U1).plan, row(U1).dogs]);
  ok('the other card form is finished too: still one plan, one welcome', (await hook(sessionEvt(second.d.session))) === 200 && Object.keys(S.subs).length === 1 && sent(/^You are booked/).length === 1 && row(U1).plan === 'week');
}
head('The webhook secret');
{ T.errors.length = 0;
  const evt = JSON.stringify({ type: 'invoice.paid', data: { object: {} } }), t = Math.floor(Date.now() / 1000);
  const other = 't=' + t + ',v1=' + crypto.createHmac('sha256', 'whsec_from_test_mode').update(t + '.' + evt).digest('hex');
  const post = (sig) => worker.fetch(new Request('https://arizonapetwaste.com/api/stripe-webhook', { method: 'POST', body: evt, headers: sig ? { 'stripe-signature': sig } : {} }), env, ctx);
  ok('junk with no signature is refused and not logged', (await post('')).status === 400 && (await post('t=1,v1=deadbeef')).status === 400 && (await settle(), T.errors.length === 0));
  const r1 = await post(other); await settle();
  ok('a real looking event signed with another secret is refused, and the Health tab says the secret does not match', r1.status === 400 && T.errors.length === 1 && /does not match STRIPE_WEBHOOK_SECRET/.test(T.errors[0].message), T.errors);
  for (let i = 0; i < 5; i++) await post(other);
  await settle();
  ok('that note is written once an hour, not once an event', T.errors.length === 1);
  ok('no secret shows in the note', !/whsec_/.test(JSON.stringify(T.errors)));
  // Stripe's Dashboard now offers "thin" events first. They carry no object, so this site cannot use them.
  T.errors.length = 0;
  const thin = { id: 'evt_thin_1', object: 'v2.core.event', type: 'v1.invoice.payment_failed', livemode: true, created: '2026-11-16T07:00:00.000Z', related_object: { id: 'in_fail', type: 'invoice', url: '/v1/invoices/in_fail' } };
  const before = JSON.stringify(T.customers);
  const st = await hook(thin);
  ok('a thin event is refused out loud, so Stripe shows the webhook as failing', st === 400 && JSON.stringify(T.customers) === before, st);
  ok('and the Health tab says to switch the webhook to snapshot events', T.errors.length === 1 && /thin events/.test(T.errors[0].message) && /payload format set to Snapshot/.test(T.errors[0].detail) && /v1\.invoice\.payment_failed/.test(T.errors[0].detail), T.errors);
  await hook(thin); await hook(Object.assign({}, thin, { object: 'event', type: 'v2.core.event_destination.ping' }));
  ok('once an hour, and a v2 ping is refused the same way', T.errors.length === 1);
}

/* ---------- a payment fails ---------- */
head('A payment fails: same day notice, visits on hold');
const cus = row(U1).stripe_customer_id, subId = row(U1).stripe_subscription_id;
const liveSub = S.subs[subId];
const inv = { id: 'in_fail', object: 'invoice', customer: cus, status: 'open', amount_due: 5040, amount_remaining: 5040, amount_paid: 0, attempted: true, attempt_count: 1, collection_method: 'charge_automatically', hosted_invoice_url: 'https://invoice.stripe.com/i/acct_1/test_abc' };
S.invoices.in_fail = inv;
row(U1).service_day = 2;
reset();
ok('failed payment event is taken', (await hook({ type: 'invoice.payment_failed', data: { object: inv } })) === 200);
{ ok('the customer is on hold', row(U1).status === 'past_due');
  ok('visits after today come off the routes', deleted.some((d) => d.startsWith('stops?customer_id=eq.' + U1 + '&status=in.(scheduled,skipped)&day=gt.')), deleted);
  const m = sent(/^Your card did not work$/)[0];
  ok('the customer is emailed the same day: what failed, the hold, and two ways to fix it', !!m && m.to[0] === 'test@example.com' && /We tried to charge your card \$50\.40/.test(m.text) && /Your visits are on hold until this bill is paid/.test(m.text)
    && m.text.includes('1. Pay this bill now: https://invoice.stripe.com/i/acct_1/test_abc') && /2\. Use a new card\. Sign in to My Yard, tap Change my card/.test(m.text) && m.text.includes('https://arizonapetwaste.com/account/') && /623\.309\.6104/.test(m.text), m && m.text);
  const t = T.messages.filter((x) => x.kind === 'card_failed');
  ok('a text waits for staff to send (they said yes to visit texts)', t.length === 1 && t[0].status === 'queued' && t[0].channel === 'sms' && t[0].to_addr === '6235550100' && t[0].stop_id === null && t[0].customer_id === U1, t);
  ok('the text is one text long, names us, and says how to stop', t[0].body.length <= 160 && /^Arizona Pet Waste: /.test(t[0].body) && /Reply STOP to opt out\.$/.test(t[0].body) && t[0].body.includes('arizonapetwaste.com/account') && t[0].body.includes('623.309.6104'), t[0].body + ' (' + t[0].body.length + ')');
  const o = sent(/^Card failed: Test Person$/)[0];
  ok('the office is told, and told to send the text today', !!o && /A payment of \$50\.40 failed/.test(o.text) && /A text to them is waiting in the Texts tab\. Send it today\./.test(o.text) && /Their visits are on hold/.test(o.text), o && o.text);
  const before = mails.length;
  await hook({ type: 'invoice.payment_failed', data: { object: Object.assign({}, inv, { attempt_count: 2 }) } });
  liveSub.status = 'past_due'; liveSub.latest_invoice = 'in_fail';
  ok('before it puts anyone on hold the server asks Stripe about the bill', S.calls.some((c) => c.m === 'GET' && c.p === 'invoices/in_fail'));
  S.calls.length = 0;
  await hook(subEvt('updated', liveSub, {}, { status: 'trialing' }));
  ok('and about the plan', S.calls.some((c) => c.m === 'GET' && c.p === 'subscriptions/' + liveSub.id));
  await hook({ type: 'invoice.payment_failed', data: { object: Object.assign({}, inv, { attempt_count: 3 }) } });
  ok('Stripe’s retries do not email or text again', mails.length === before && T.messages.filter((x) => x.kind === 'card_failed').length === 1 && row(U1).status === 'past_due');
  const p = await call('/api/me/plan', 'GET', null, 'good');
  ok('My Yard shows the hold and no next visits', p.d.plan.hold === true && p.d.plan.next.length === 0 && p.d.plan.canPause === false, p.d);
  await hook(subEvt('updated', liveSub, { status: 'active' }));
  ok('a plan change that is not a payment does not lift the hold', row(U1).status === 'past_due' && mails.length === before);
}
head('The bill gets paid: visits come back');
{ reset();
  liveSub.status = 'past_due';
  await hook({ type: 'invoice.paid', data: { object: Object.assign({}, inv, { id: 'in_other', status: 'paid', amount_paid: 900, amount_remaining: 0 }) } });
  ok('another bill is paid but the plan is still past due in Stripe: still on hold', row(U1).status === 'past_due' && mails.length === 0);
  await hook({ type: 'invoice.paid', data: { object: { id: 'in_zero', customer: cus, status: 'paid', amount_paid: 0 } } });
  ok('a $0 bill changes nothing', row(U1).status === 'past_due' && mails.length === 0);
  liveSub.status = 'active'; inv.status = 'paid';
  ok('paid event is taken', (await hook({ type: 'invoice.paid', data: { object: Object.assign({}, inv, { status: 'paid', amount_paid: 5040, amount_remaining: 0 }) } })) === 200);
  ok('the customer is off hold', row(U1).status === 'active');
  ok('the text nobody sent leaves the list', T.messages.filter((x) => x.kind === 'card_failed')[0].status === 'skipped');
  const m = sent(/^Your payment went through$/)[0];
  ok('the customer is thanked and told their day', !!m && /your visits are back on/.test(m.text) && /We come on your next Tuesday\./.test(m.text), m && m.text);
  ok('the office is told they are back on the schedule', sent(/^Paid: Test Person$/).length === 1);
  const before = mails.length;
  await hook({ type: 'invoice.paid', data: { object: Object.assign({}, inv, { status: 'paid', amount_paid: 5040 }) } });
  await hook(subEvt('updated', liveSub, { status: 'active' }, { status: 'past_due' }));
  ok('the same news twice sends nothing more', mails.length === before && row(U1).status === 'active');
  const p = await call('/api/me/plan', 'GET', null, 'good');
  ok('My Yard shows next visits again', p.d.plan.hold === false && p.d.plan.next.length === 3, p.d);
}
head('The other order, and a customer with no texts');
{ reset(); T.messages.length = 0;
  row(U1).texts_visit = false; inv.status = 'open'; liveSub.status = 'past_due'; liveSub.latest_invoice = 'in_fail';
  await hook(subEvt('updated', liveSub, {}, { status: 'active' }));
  ok('Stripe’s plan event lands first: on hold, emailed with the bill link, no text queued', row(U1).status === 'past_due' && sent(/^Your card did not work$/).length === 1 && sent(/^Your card did not work$/)[0].text.includes('https://invoice.stripe.com/i/acct_1/test_abc') && T.messages.length === 0);
  ok('the office is told to call (no text consent)', /They did not agree to texts, so no text is waiting\. Call them today\./.test(sent(/^Card failed/)[0].text));
  await hook({ type: 'invoice.payment_failed', data: { object: inv } });
  ok('then the bill event lands: nothing more', sent(/^Your card did not work$/).length === 1 && sent(/^Card failed/).length === 1);
  liveSub.status = 'active';
  await hook(subEvt('updated', liveSub, { status: 'active' }, { status: 'past_due' }));
  ok('Stripe says the plan went from past due to paid: off hold, thanked once', row(U1).status === 'active' && sent(/^Your payment went through$/).length === 1);
  row(U1).texts_visit = true;
}
head('A new card while on hold is tried right away');
{ reset(); inv.status = 'open'; liveSub.status = 'past_due';
  await hook({ type: 'invoice.payment_failed', data: { object: inv } });
  const cu = { id: cus, object: 'customer', invoice_settings: { default_payment_method: 'pm_new' } };
  await hook({ type: 'customer.updated', data: { object: cu, previous_attributes: { name: 'Old Name' } } });
  ok('a change that is not the card tries nothing', S.payCalls.length === 0);
  await hook({ type: 'customer.updated', data: { object: cu, previous_attributes: { invoice_settings: { default_payment_method: 'pm_old' } } } });
  ok('a new card on file: the open bill is tried on it, once for that card', S.payCalls.length === 1 && S.payCalls[0].id === 'in_fail' && S.payCalls[0].key === 'apw-newcard-in_fail-pm_new', S.payCalls);
  S.invoices.in_old = Object.assign({}, inv, { id: 'in_old', created: Math.floor(Date.now() / 1000) - 90 * 86400 }); S.payCalls.length = 0; inv.status = 'open'; inv.created = Math.floor(Date.now() / 1000) - 3 * 86400;
  await hook({ type: 'customer.updated', data: { object: Object.assign({}, cu, { invoice_settings: { default_payment_method: 'pm_newer' } }), previous_attributes: { invoice_settings: { default_payment_method: 'pm_new' } } } });
  ok('a bill left open for three months is not charged to the new card on its own', S.payCalls.length === 1 && S.payCalls[0].id === 'in_fail', S.payCalls);
  delete S.invoices.in_old;
  liveSub.status = 'active';
  await hook({ type: 'invoice.paid', data: { object: Object.assign({}, inv, { status: 'paid', amount_paid: 5040 }) } });
  ok('and when it goes through they are off hold', row(U1).status === 'active');
  S.payCalls.length = 0;
  await hook({ type: 'customer.updated', data: { object: cu, previous_attributes: { invoice_settings: { default_payment_method: 'pm_new' } } } });
  ok('a new card when nothing is owed tries nothing', S.payCalls.length === 0);
}
head('Old news from Stripe changes nothing');
{ // Stripe does not promise the order of its events, and it sends one again for up to three days when it got no answer.
  reset(); T.messages.length = 0;
  const failed = () => ({ type: 'invoice.payment_failed', data: { object: Object.assign({}, inv, { status: 'open', amount_remaining: 5040 }) } });
  // The customer is paid up: the plan is active and the bill is paid.
  row(U1).status = 'active'; liveSub.status = 'active'; liveSub.latest_invoice = 'in_fail'; inv.status = 'paid'; inv.amount_remaining = 0;
  ok('a late "payment failed" is answered', (await hook(failed())) === 200);
  ok('a late "payment failed" for a bill that has since been paid: no hold, no email, no text, visits stay', row(U1).status === 'active' && mails.length === 0 && T.messages.length === 0 && deleted.length === 0, [row(U1).status, mails.length, deleted]);
  await hook(subEvt('updated', liveSub, { status: 'past_due' }, { status: 'active' }));
  ok('a late "past due" for a plan Stripe now shows as paid: no hold, no email', row(U1).status === 'active' && mails.length === 0 && deleted.length === 0);
  inv.status = 'void';
  await hook(failed());
  ok('a bill the office voided does not put anyone on hold', row(U1).status === 'active' && mails.length === 0);
  // Now a real failure, then an old "paid" shows up late.
  inv.status = 'open'; inv.amount_remaining = 5040; liveSub.status = 'past_due';
  await hook(failed());
  ok('a bill that is still unpaid in Stripe does put them on hold', row(U1).status === 'past_due' && sent(/^Your card did not work$/).length === 1);
  const before = mails.length;
  await hook(subEvt('updated', liveSub, { status: 'active' }, { status: 'past_due' }));
  ok('a late "paid" while Stripe still shows the plan past due: the hold stays and nobody is thanked', row(U1).status === 'past_due' && mails.length === before);
  S.calls.length = 0;
  await hook(failed()); await hook(failed());
  ok('more failed tries while on hold do not ask Stripe anything', S.calls.length === 0 && mails.length === before);
  liveSub.status = 'active'; inv.status = 'paid'; inv.amount_remaining = 0;
  await hook(subEvt('updated', liveSub, {}, { status: 'past_due' }));
  ok('the real "paid" lifts it', row(U1).status === 'active' && sent(/^Your payment went through$/).length === 1);
}
{ reset();
  T.customers.push({ id: U2, name: 'Gone Person', email: 'two@example.com', phone: '6235550122', status: 'canceled', stripe_customer_id: 'cus_gone', texts_visit: true });
  await hook({ type: 'invoice.payment_failed', data: { object: Object.assign({}, inv, { customer: 'cus_gone' }) } });
  ok('a failed bill for a canceled customer leaves them canceled and sends nothing', row(U2).status === 'canceled' && mails.length === 0);
  ok('an event we do not use is answered and ignored', (await hook({ type: 'charge.succeeded', data: { object: {} } })) === 200 && (await hook({ type: 'checkout.session.completed', data: { object: { mode: 'payment' } } })) === 200);
}

/* ---------- forms that do not need a card ---------- */
head('Waitlist and sign up requests');
env = Object.assign({}, baseEnv, { FIRST_VISIT_FROM: '2027-03-10' });
{ reset();
  ok('waitlist with no name is refused', (await call('/api/waitlist', 'POST', { email: 'nope', zip: '85001' })).status === 400);
  ok('waitlist with a short phone is refused', (await call('/api/waitlist', 'POST', { name: 'Wendy Wait', phone: '623', address: '1 W Main St', zip: '85301' })).status === 400);
  ok('waitlist ok', (await call('/api/waitlist', 'POST', { name: 'Wendy Wait', phone: '(623) 555-0111', address: '1 W Main St', zip: '85301', texts: true })).status === 200 && sent(/^Waitlist: Wendy Wait/).length === 1);
  const r = await call('/api/request', 'POST', Object.assign({}, good, { email: 'req@example.com', textsDeals: true }));
  const m = sent(/^New sign up request: Test Person/)[0];
  ok('a sign up request (checkout closed) emails the office the same billing words', r.status === 200 && !!m && /Billing they saw: Your free month runs until April 17\. That day we charge \$56\.47 for April 17 to May 1\. Then \$121 on the 1st of each month\./.test(m.text), m && m.text);
  const noMail = Object.assign({}, env); delete noMail.RESEND_API_KEY; delete noMail.SUPABASE_URL;
  const x = await worker.fetch(new Request('https://arizonapetwaste.com/api/waitlist', { method: 'POST', body: JSON.stringify({ name: 'No Mail', phone: '6235550199', address: '2 W Main St', zip: '85301' }), headers: { 'content-type': 'application/json' } }), noMail, ctx);
  ok('with no email set up the waitlist says to text us, so no lead is lost quietly', x.status === 503);
  ok('a page that is not /api/ is served as a static page', (await worker.fetch(new Request('https://arizonapetwaste.com/'), env, ctx)).status === 200);
}

/* ---------- the 60 day rule ---------- */
head('The 60 day rule is off (Joe, Nov 16, 2026): canceling early costs nothing');
{ const now = Math.floor(Date.now() / 1000);
  const gone = (meta) => ({ type: 'customer.subscription.deleted', data: { object: { id: 'sub_9', customer: cus, status: 'canceled', canceled_at: now, metadata: Object.assign({ user_id: U1 }, meta), items: { data: [{ price: { unit_amount: 9900 }, quantity: 1 }] } } } });
  for (const [label, meta] of [['a new sign up (no early cancel date)', { pause_from: String(now + 40 * 86400), free_end: String(now + 10 * 86400) }], ['a sign up from when the rule was shown', { min_end: String(now + 40 * 86400) }]]) {
    reset(); S.made.length = 0; S.lines.length = 0; S.paidSoFar = []; row(U1).status = 'active'; row(U1).stripe_subscription_id = 'sub_9';
    await hook(gone(meta));
    ok(label + ' cancels on day 20: no charge, no bill, and the customer is canceled', S.items.length === 0 && S.made.length === 0 && !S.calls.some((c) => c.m === 'POST' && /^invoice/.test(c.p)) && sent(/^Free month charged/).length === 0 && row(U1).status === 'canceled', S.calls.map((c) => c.m + ' ' + c.p));
  }
}
head('The 60 day rule, kept for later: with EARLY_CANCEL on, a cancel in the first 60 days is charged up to one month');
{ const now = Math.floor(Date.now() / 1000);
  env = Object.assign({}, env, { EARLY_CANCEL: 'on' });
  const gone = (canceledAt, meta) => ({ type: 'customer.subscription.deleted', data: { object: { id: 'sub_9', customer: cus, status: 'canceled', canceled_at: canceledAt, metadata: Object.assign({ user_id: U1 }, meta), items: { data: [{ price: { unit_amount: 9900 }, quantity: 1 }] } } } });
  const charged = () => S.items.map((c) => c.f.get('amount')).join(',') || 'none';
  const run = async (label, paid, meta, want) => { reset(); S.made.length = 0; S.lines.length = 0; S.paidSoFar = paid; row(U1).status = 'active'; row(U1).stripe_subscription_id = 'sub_9'; await hook(gone(now, meta)); ok(label + ' (charged ' + want + ')', charged() === want && row(U1).status === 'canceled', charged()); };
  await run('cancel on day 20, nothing paid', [], { min_end: String(now + 40 * 86400) }, '9900');
  ok('the early cancel charge is made once, billed and paid', S.items[0].key === 'apw-early-item-sub_9' && S.calls.filter((c) => /^invoices/.test(c.p) && c.m === 'POST').map((c) => c.p).join(' ') === 'invoices invoices/in_new/finalize invoices/in_new/pay' && sent(/^Free month charged/).length === 1 && sent(/^Canceled: Test Person/).length === 1);
  ok('the line on the bill carries the same tag', S.items.length === 1 && S.items[0].f.get('metadata[early_cancel]') === 'sub_9' && S.made[0].lines.join() === '9900', S.made);
  ok('the bill carries a tag that names the plan', S.made.length === 1 && S.made[0].metadata.early_cancel === 'sub_9' && S.calls.some((c) => c.m === 'GET' && c.p === 'invoices' && c.q.get('customer') === cus && c.q.get('limit') === '100'), S.made);
  { // Days later Stripe has forgotten the "only once" keys and the same cancel event shows up again.
    S.items.length = 0; mails.length = 0; S.calls.length = 0;
    await hook(gone(now, { min_end: String(now + 40 * 86400) }));
    ok('the same cancel event days later does not charge the early cancel fee again', S.items.length === 0 && !S.calls.some((c) => c.m === 'POST' && /^invoice/.test(c.p)) && sent(/^Free month charged/).length === 0 && row(U1).status === 'canceled', S.calls.map((c) => c.m + ' ' + c.p));
  }
  { // The line is made, then Stripe fails on the bill. Days later the event is sent again.
    reset(); S.made.length = 0; S.lines.length = 0; S.paidSoFar = []; row(U1).status = 'active'; row(U1).stripe_subscription_id = 'sub_9';
    S.failBill = true;
    await hook(gone(now, { min_end: String(now + 40 * 86400) })); S.failBill = false;
    ok('the line is made but the bill fails: the office is told to check', S.items.length === 1 && S.made.length === 0 && sent(/^Check billing: free month charge failed/).length === 1);
    await hook(gone(now, { min_end: String(now + 40 * 86400) }));
    ok('the event comes again: the waiting line is used, no second line, one bill for one month', S.items.length === 1 && S.made.length === 1 && S.made[0].lines.join() === '9900' && sent(/^Free month charged/).length === 1, [S.items.length, S.made]);
  }
  await run('cancel on day 45, paid the part month $56.47', [5647], { min_end: String(now + 15 * 86400) }, '4253');
  await run('cancel on day 55, paid over a month', [5647, 9900], { min_end: String(now + 5 * 86400) }, 'none');
  await run('cancel on day 61', [], { min_end: String(now - 86400) }, 'none');
  await run('a plan with no early cancel date (signed up while the rule was off) is never charged', [], { free_end: String(now + 10 * 86400), pause_from: String(now + 40 * 86400) }, 'none');
  delete env.EARLY_CANCEL;
  ok('a canceled customer loses the gate code', row(U1).gate_code === null);
  // Late news about the plan that was canceled must not bring the customer back.
  reset();
  await hook({ type: 'customer.subscription.updated', data: { object: { id: 'sub_9', customer: cus, status: 'active', metadata: { user_id: U1 } } } });
  ok('a late "active" for the canceled plan leaves the customer canceled', row(U1).status === 'canceled' && mails.length === 0);
  await hook({ type: 'customer.subscription.updated', data: { object: { id: 'sub_9', customer: cus, status: 'active', pause_collection: { behavior: 'void' }, metadata: { user_id: U1 } } } });
  await hook({ type: 'customer.subscription.updated', data: { object: { id: 'sub_9', customer: cus, status: 'unpaid', metadata: {} } } });
  ok('so does a late "paused" or "unpaid"', row(U1).status === 'canceled');
  await hook({ type: 'customer.subscription.created', data: { object: { id: 'sub_fresh', customer: cus, status: 'active', metadata: {} } } });
  ok('a new plan the office starts for them in Stripe brings them back', row(U1).status === 'active' && row(U1).stripe_subscription_id === 'sub_fresh');
  // Now the old plan's cancel event is sent again. The customer is on the new plan and must stay on it.
  reset(); row(U1).gate_code = '4411';
  ok('a late cancel event for the old plan is answered', (await hook(gone(now, {}))) === 200);
  ok('it does not cancel the customer who is on a newer plan: status, plan id, gate code and visits all stay', row(U1).status === 'active' && row(U1).stripe_subscription_id === 'sub_fresh' && row(U1).gate_code === '4411' && deleted.length === 0 && sent(/^Canceled/).length === 0, [row(U1).status, deleted]);
  await hook({ type: 'customer.subscription.deleted', data: { object: { id: 'sub_fresh', customer: cus, status: 'canceled', canceled_at: now, metadata: {}, items: { data: [] } } } });
  ok('the cancel event for the plan they are on does cancel them', row(U1).status === 'canceled' && row(U1).gate_code === null && sent(/^Canceled: Test Person/).length === 1);
}

/* ---------- My Yard ---------- */
head('My Yard: bills, skips, pause');
{ const az = (n) => new Date(Date.now() - 7 * 3600e3 + n * 86400e3).toISOString().slice(0, 10);
  const wd = (d) => new Date(d + 'T19:00:00Z').getUTCDay();
  Object.assign(row(U1), { status: 'active', plan: 'week', stripe_subscription_id: 'sub_1', stripe_customer_id: cus, service_day: wd(az(3)), service_day2: null, skips: [], first_visit: null, pause_from: null, pause_until: null });
  let r = await call('/api/me/invoices', 'GET', null, 'good');
  ok('bills list leaves out drafts and links to the bill', r.d.invoices.length === 1 && r.d.invoices[0].amount === 4290 && /^https:\/\/invoice\.stripe\.com\//.test(r.d.invoices[0].url), r.d);
  r = await call('/api/me/plan', 'GET', null, 'good');
  ok('plan shows the day and the next three visits', r.d.plan.next.length === 3 && r.d.plan.next[0].day === az(3) && r.d.plan.hold === false, r.d);
  r = await call('/api/me/skip', 'POST', { date: az(3) }, 'good');
  ok('skip the next visit', r.status === 200 && row(U1).skips.includes(az(3)));
  ok('a day that is not a visit cannot be skipped', (await call('/api/me/skip', 'POST', { date: az(4) }, 'good')).status === 400);
  ok('undo the skip', (await call('/api/me/skip', 'POST', { date: az(3), undo: true }, 'good')).status === 200 && row(U1).skips.length === 0);
  ok('a pause over 120 days is refused', (await call('/api/me/pause', 'POST', { until: az(200) }, 'good')).status === 400);
  S.subMeta = { min_end: String(Math.floor(Date.now() / 1000) + 30 * 86400) };
  ok('a pause inside the first 60 days is blocked', (await call('/api/me/pause', 'POST', { until: az(30) }, 'good')).status === 400);
  r = await call('/api/me/plan', 'GET', null, 'good');
  ok('the plan says when pausing opens', !r.d.plan.canPause && !!r.d.plan.pauseAfter, r.d);
  S.subMeta = { min_end: String(Math.floor(Date.now() / 1000) - 86400) };
  S.subPosts.length = 0;
  r = await call('/api/me/pause', 'POST', { until: az(30) }, 'good');
  ok('pause 30 days: Stripe stops billing until the day picked', r.status === 200 && /^pause_collection%5Bbehavior%5D=void&pause_collection%5Bresumes_at%5D=\d+$/.test(S.subPosts[0]) && row(U1).status === 'paused' && row(U1).pause_until === az(29), S.subPosts[0]);
  r = await call('/api/me/resume', 'POST', {}, 'good');
  ok('start again', r.status === 200 && S.subPosts[1] === 'pause_collection=' && row(U1).status === 'active' && row(U1).pause_until === null, S.subPosts[1]);
  r = await call('/api/portal', 'POST', {}, 'good');
  ok('Change card opens Stripe’s billing page and comes back to My Yard', r.status === 200 && /^https:\/\/billing\.stripe\.com\//.test(r.d.url) && S.calls.filter((c) => c.p === 'billing_portal/sessions')[0].f.get('return_url') === 'https://arizonapetwaste.com/account/');
}

/* ---------- nothing assumes test mode ---------- */
head('Live keys work the same');
{ env = Object.assign({}, baseEnv, { STRIPE_SECRET_KEY: 'sk_live_abcdef', STRIPE_PUBLISHABLE_KEY: 'pk_live_1', FIRST_VISIT_FROM: '2027-03-10' });
  S.prices.length = 0; T.customers.length = 0; for (const k of Object.keys(S.subs)) delete S.subs[k];
  reset();
  const c = await call('/api/config');
  ok('config hands the live publishable key to the page', c.d.live === true && c.d.stripeKey === 'pk_live_1');
  const r = await call('/api/checkout', 'POST', Object.assign({}, good, { plan: 'twice', dogs: 4 }), 'good');
  const made = S.calls.filter((x) => x.m === 'POST' && x.p === 'prices').map((x) => x.f.get('lookup_key') + ' ' + x.f.get('unit_amount') + ' ' + x.f.get('recurring[interval]') + ' ' + x.f.get('product'));
  ok('a new Stripe mode has no prices: the first sign up makes all six, by lookup key', r.status === 200 && made.length === 6 && made.includes('apw_twice_base 18900 month apw_twice') && made.includes('apw_eow_extra 900 month apw_extra_dog') && made.includes('apw_week_base 10800 month apw_week'), made);
  ok('and the four products', S.calls.filter((x) => x.m === 'POST' && x.p === 'products').map((x) => x.f.get('id')).sort().join(',') === 'apw_eow,apw_extra_dog,apw_extra_dog,apw_extra_dog,apw_twice,apw_week', S.calls.filter((x) => x.m === 'POST' && x.p === 'products').map((x) => x.f.get('id')));
  await hook(sessionEvt(r.d.session));
  const f = S.calls.filter((x) => x.m === 'POST' && x.p === 'subscriptions')[0].f;
  ok('the plan uses the prices that were just made', f.get('items[0][price]') === 'price_apw_twice_base' && f.get('items[1][price]') === 'price_apw_twice_extra' && f.get('items[1][quantity]') === '2' && row(U1).status === 'trialing');
  // If Stripe ever refuses the list of allowed ways to pay, the card form still loads, and the office can see why.
  T.customers.length = 0; T.errors.length = 0; S.refuseList = true;
  const loose = await call('/api/checkout', 'POST', good, 'good'); await settle(); S.refuseList = false;
  ok('if Stripe refuses the list of ways to pay, the card form still loads and the Health tab gets a note', loose.status === 200 && !!loose.d.clientSecret && !S.sessions[loose.d.session].form.has('allowed_payment_method_types[0]') && T.errors.length === 1 && /ways to pay/.test(T.errors[0].message), [loose, T.errors]);
  T.customers.length = 0; S.refuseAll = true;
  const broken = await call('/api/checkout', 'POST', good, 'good'); S.refuseAll = false;
  ok('if Stripe refuses the card form outright, the page gets an error, not a blank form', broken.status === 500 && !broken.d.clientSecret, broken);
  // A row left over from test mode: its Stripe customer id means nothing to the live keys.
  T.customers.length = 0; for (const k of Object.keys(S.subs)) delete S.subs[k];
  T.customers.push({ id: U1, email: 'test@example.com', status: 'checkout', stripe_customer_id: 'cus_from_test_mode', stripe_subscription_id: null });
  const again = await call('/api/checkout', 'POST', good, 'good');
  ok('a Stripe customer id from test mode is replaced by a new live one', again.status === 200 && /^cus_\d+$/.test(row(U1).stripe_customer_id) && S.sessions[again.d.session].customer === row(U1).stripe_customer_id, again);
  const src = fs.readFileSync(new URL('../src/worker/worker.js', import.meta.url), 'utf8');
  ok('no key or test mode value is written into the server', !/[sprw]k_(test|live)_[A-Za-z0-9]{6,}/.test(src) && !/whsec_[A-Za-z0-9]{6,}/.test(src) && !/cs_test_/.test(src));
  ok('the webhook lives at /api/stripe-webhook', src.includes("path === '/api/stripe-webhook' && m === 'POST'"));
}

/* ---------- every Stripe request against Stripe's own field list (optional) ---------- */
if (process.env.STRIPE_SPEC) {
  head('Stripe requests checked against ' + process.env.STRIPE_SPEC);
  const spec = JSON.parse(fs.readFileSync(process.env.STRIPE_SPEC, 'utf8'));
  const deref = (s) => { while (s && s.$ref) s = spec.components.schemas[s.$ref.split('/').pop()]; return s; };
  const paths = Object.keys(spec.paths).map((p) => ({ p, re: new RegExp('^' + p.replace(/\{[^}]+\}/g, '[^/]+') + '$'), n: (p.match(/\{/g) || []).length })).sort((a, b) => a.n - b.n);
  const walk = (schema, parts, value) => {
    schema = deref(schema);
    if (!schema) return 'no such field';
    if (schema.anyOf) { const errs = schema.anyOf.map((a) => walk(a, parts, value)); return errs.includes(null) ? null : errs[0]; }
    if (!parts.length) {
      if (schema.type === 'object' || schema.type === 'array') return 'needs more than a plain value';
      if (schema.enum && !schema.enum.includes(value)) return 'value ' + JSON.stringify(value) + ' is not one of ' + schema.enum.slice(0, 12).join(', ');
      if (schema.type === 'integer' && !/^-?\d+$/.test(value)) return 'value ' + JSON.stringify(value) + ' is not a whole number';
      if (schema.type === 'boolean' && !/^(true|false)$/.test(value)) return 'value ' + JSON.stringify(value) + ' is not true or false';
      if (schema.maxLength && value.length > schema.maxLength) return 'value is longer than ' + schema.maxLength;
      return null;
    }
    const [h, ...rest] = parts;
    if (schema.type === 'array') return /^\d+$/.test(h) ? walk(schema.items, rest, value) : 'expected a list';
    if (schema.type === 'object') {
      if (schema.properties && schema.properties[h]) return walk(schema.properties[h], rest, value);
      if (schema.additionalProperties) return rest.length ? 'too deep' : null;
      return 'no such field';
    }
    return 'not a group';
  };
  const seen = new Set(); let bad = 0, checked = 0;
  for (const c of S.all) {
    const hit = paths.find((x) => x.re.test('/v1/' + c.p));
    const op = hit && spec.paths[hit.p][c.m.toLowerCase()];
    if (!op) { bad++; console.log('  FAIL Stripe has no ' + c.m + ' /v1/' + c.p); continue; }
    const pairs = c.m === 'GET' ? [...c.q.entries()] : [...c.f.entries()];
    const top = c.m === 'GET' ? { type: 'object', properties: Object.fromEntries((op.parameters || []).filter((x) => x.in === 'query').map((x) => [x.name, x.schema])) }
      : op.requestBody.content['application/x-www-form-urlencoded'].schema;
    for (const [k, v] of pairs) {
      const tag = c.m + ' ' + hit.p + ' ' + k.replace(/\[\d+\]/g, '[]').replace(/metadata\[[^\]]+\]/, 'metadata[x]') + '=' + (/^(mode|ui_mode|status|proration_behavior|redirect_on_completion|currency|collection_method)$/.test(k) || /allowed_payment_method_types|behavior|interval/.test(k) ? v : '');
      if (seen.has(tag)) continue; seen.add(tag); checked++;
      const err = walk(top, k.match(/[^\[\]]+/g), v);
      if (err) { bad++; console.log('  FAIL ' + c.m + ' ' + hit.p + '  ' + k + ': ' + err); }
    }
  }
  const paths2 = new Set(S.all.map((c) => c.m + ' ' + (paths.find((x) => x.re.test('/v1/' + c.p)) || {}).p));
  ok(checked + ' kinds of Stripe field on ' + paths2.size + ' kinds of request (' + S.all.length + ' requests in all) checked against API version ' + spec.info.version + ', none refused', bad === 0 && checked > 70 && paths2.size > 20, [...paths2]);
  if (process.env.VERBOSE) console.log([...paths2].sort().join("\n"));
  // The checker itself: it must refuse a made up field, a wrong value and a field Stripe took away.
  const cs = spec.paths['/v1/checkout/sessions'].post.requestBody.content['application/x-www-form-urlencoded'].schema;
  ok('the checker refuses a made up field, a wrong value and a removed field', !!walk(cs, ['bogus_field'], '1') && !!walk(cs, ['mode'], 'subscribe') && !!walk(cs, ['subscription_data', 'trial_endd'], '5')
    && !!walk(cs, ['payment_method_types', '0'], 'card') && !walk(cs, ['allowed_payment_method_types', '1'], 'link') && !walk(cs, ['metadata', 'anything'], 'x'));
  failN += bad;
}

console.log('\n' + pass + ' passed, ' + failN + ' failed');
process.exit(failN ? 1 : 0);

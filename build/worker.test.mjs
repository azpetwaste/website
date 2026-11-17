// Runs the server against a pretend Supabase and a pretend Stripe, and checks every request it builds.
// No database and no keys. `node build/worker.test.mjs` prints each check and exits 1 if one fails.
//
// Optional: STRIPE_SPEC=/path/to/spec3.json (the public file from github.com/stripe/openapi) also checks every
// Stripe request this server makes against Stripe's own list of fields and allowed values.
import crypto from 'node:crypto';
import fs from 'node:fs';
import worker from '../src/worker/worker.js';

// A clock the tests can set. The free month ends on the same day of the next month, counted from the sign up day, so
// a test has to say which day it is. `clock('2027-03-10T17:00:00Z')` makes it that moment for the server and the
// test alike, `clock(null)` gives the real time back, and `at(day, fn)` runs one thing at 10 in the morning Arizona
// time on that day.
const RealDate = Date;
let fakeNow = null;
globalThis.Date = class extends RealDate {
  constructor(...a) { if (a.length === 0 && fakeNow != null) super(fakeNow); else super(...a); }
  static now() { return fakeNow != null ? fakeNow : RealDate.now(); }
};
const clock = (iso) => { fakeNow = iso ? RealDate.parse(iso) : null; };
const at = async (dayOrIso, fn) => { clock(/T/.test(dayOrIso) ? dayOrIso : dayOrIso + 'T17:00:00Z'); try { return await fn(); } finally { clock(null); } };

const SB = 'https://demo.supabase.co';
const U1 = '11111111-1111-4111-8111-111111111111', U2 = '22222222-2222-4222-8222-222222222222';
const baseEnv = {
  SUPABASE_URL: SB, SUPABASE_ANON_KEY: 'sb_publishable_test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test',
  STRIPE_SECRET_KEY: 'sk_test_123456', STRIPE_PUBLISHABLE_KEY: 'pk_test_1', STRIPE_WEBHOOK_SECRET: 'whsec_test', RESEND_API_KEY: 're_test',
  // The free month is the sale, and the sale has an end date. These tests pin it on, so they pass after the sale too.
  // The cases with no free month set SALE_OVER.
  FREE_MONTH_UNTIL: '2099-01-01T06:59:59Z',
  // How long the server waits before it looks at a failed bill a second time (2.5 seconds on the live site).
  TRY_WAIT_MS: '1',
  ASSETS: { fetch: async () => new Response('static') }
};
const SALE_OVER = { FREE_MONTH_UNTIL: '2020-01-01T06:59:59Z' };
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
const DBX = { leadId: 0, leadsDown: false }; // leads get an id like the real table, and the table can be switched off
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
  if (op === 'ilike') return new RegExp('^' + v.split('*').map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$', 'i').test(String(x == null ? '' : x));
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
    const rows = Array.isArray(body) ? body : [body], saved = [];
    for (const r of rows) {
      const old = /on_conflict=id/.test(qs || '') && T[table].find((x) => x.id === r.id);
      if (old) Object.assign(old, r);
      else if (table === 'leads') { if (DBX.leadsDown) return reply({ message: 'database is down' }, 500); const made = Object.assign({ id: ++DBX.leadId, status: 'new', created_at: new Date().toISOString() }, r); T.leads.push(made); saved.push(made); }
      else T[table].push(Object.assign(table === 'messages' ? { id: T.messages.length + 1, status: 'queued' } : {}, r));
    }
    return reply(/return=representation/.test(prefer || '') ? (table === 'leads' ? saved.map((r) => Object.assign({}, r)) : rows) : '', 201);
  }
  if (method === 'PATCH') {
    if (table === 'customers' && blip.patch > 0) { blip.patch--; return reply({ message: 'database blip' }, 500); }
    const hit = restRows(table, qs);
    for (const r of hit) Object.assign(r, body);
    return reply(/return=representation/.test(prefer || '') ? hit.map((r) => Object.assign({}, r)) : '');
  }
  if (method === 'DELETE') { deleted.push(rel); if (table === 'leads') { const hit = restRows(table, qs); T.leads = T.leads.filter((r) => !hit.includes(r)); } return reply(''); }
  return reply({ message: 'bad method' }, 400);
}

/* ---------- pretend Stripe ---------- */
const S = { n: 0, customers: {}, prices: [{ id: 'price_wb', lookup_key: 'apw_week_base' }], sessions: {}, intents: {}, cards: {}, subs: {}, keys: {}, invoices: {}, calls: [], posts: [],
  funding: 'credit', failPlan: null, paidSoFar: [], subMeta: null, subPosts: [], items: [], payCalls: [],
  busy: 0, preview: null, keepDay: false, made: [], lines: [], failBill: false, all: [], refuse: [], expired: [], notes: [], blind: false, failNote: false };
// What one unit of a price costs, by its lookup key (the same numbers as PLANS in the server).
const UNIT = { apw_week_base: 10800, apw_week_extra: 1300, apw_twice_base: 18900, apw_twice_extra: 1300, apw_eow_base: 7500, apw_eow_extra: 900 };
const unitOf = (priceId) => UNIT[(S.prices.find((x) => x.id === priceId) || {}).lookup_key] || UNIT[String(priceId).replace(/^price_/, '')] || 0;
// The first bill of a plan, worked out the way Stripe does and not the way the server does: every line at full price
// when only the day the free month ends was sent. If a billing day were ever sent again, it would be a part month.
const firstBill = (f) => {
  let total = 0;
  const end = Number(f.get('trial_end')), day = Number(f.get('billing_cycle_anchor') || 0);
  for (let i = 0; f.get('items[' + i + '][price]'); i++) {
    const amount = unitOf(f.get('items[' + i + '][price]')) * Number(f.get('items[' + i + '][quantity]'));
    total += day > end ? Math.round(amount * (day - end) / (30 * 86400)) : amount;
  }
  return total;
};
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
  if (p === 'checkout/sessions' && m === 'GET') return reply({ data: Object.values(S.sessions).filter((x) => x.customer === q.get('customer') && (!q.get('status') || x.status === q.get('status'))).map((x) => Object.assign({}, x, { form: undefined })) });
  if (p === 'checkout/sessions') {
    // S.refuse lists the fields this pretend Stripe will not take, the way the real one answers: a 400 that names the field.
    for (const bad of S.refuse) {
      if (bad === 'currency+list' ? (f.has('currency') && f.has('allowed_payment_method_types[0]')) : [...f.keys()].some((k) => k === bad || k.startsWith(bad + '['))) {
        return reply({ error: { type: 'invalid_request_error', param: bad, message: 'Received unknown parameter: ' + bad } }, 400);
      }
    }
    if (S.refuseAll) return reply({ error: { message: 'Invalid request' } }, 400);
    const card = { id: id('pm'), type: 'card', card: { funding: S.funding } }; S.cards[card.id] = card;
    const paid = f.get('mode') === 'subscription';
    const si = paid ? null : { id: id('seti'), status: 'succeeded', payment_method: card.id }; if (si) S.intents[si.id] = si;
    const s = { id: id('cs_test'), object: 'checkout.session', created: Math.floor(Date.now() / 1000), mode: f.get('mode'), status: 'open', client_reference_id: f.get('client_reference_id'), customer: f.get('customer'),
      setup_intent: si ? si.id : null, subscription: null, card: card.id, metadata: metaOf(f, 'metadata'), form: f };
    S.sessions[s.id] = s;
    return reply({ id: s.id, client_secret: s.id + '_secret_abc' });
  }
  if (/^checkout\/sessions\/[^/]+\/expire$/.test(p)) {
    const s = S.sessions[p.split('/')[2]]; if (!s) return reply({ error: { message: 'No such session' } }, 404);
    if (S.failExpire) return reply({ error: { message: 'Stripe had a problem' } }, 500);
    s.status = 'expired'; S.expired.push(s.id);
    return reply({ id: s.id, status: 'expired' });
  }
  if (p.startsWith('checkout/sessions/')) {
    const s = S.sessions[p.slice(18)]; if (!s) return reply({ error: { message: 'No such session' } }, 404);
    const si = S.intents[s.setup_intent];
    return reply(Object.assign({}, s, { form: undefined, card: undefined, setup_intent: si ? Object.assign({}, si, { payment_method: S.cards[si.payment_method] }) : null }));
  }
  if (p.startsWith('setup_intents/')) { const si = S.intents[p.slice(14)]; return reply(Object.assign({}, si, { payment_method: q.get('expand[0]') ? S.cards[si.payment_method] : si.payment_method })); }
  if (p.startsWith('payment_methods/')) return reply(S.cards[p.slice(16)]);
  if (p === 'subscriptions' && m === 'GET') return reply({ data: Object.values(S.subs).filter((x) => x.customer === q.get('customer')) });
  if (p === 'subscriptions' && m === 'POST') {
    if (S.failPlan) { const r = reply({ error: { message: S.failPlan } }, 400); if (S.replay) r.headers.set('idempotent-replayed', 'true'); return r; }
    if (S.busy > 0) { S.busy--; return reply({ error: { type: 'idempotency_error', message: 'There is currently another in-progress request using this Idempotent Key' } }, 409); }
    if (key && S.keys[key]) return reply(S.keys[key]);
    // With no billing day sent, Stripe lines the bills up on the day the free month ends ("now", its default).
    const sub = { id: id('sub'), object: 'subscription', status: 'trialing', customer: f.get('customer'), trial_end: Number(f.get('trial_end')), billing_cycle_anchor: Number(f.get('billing_cycle_anchor') || f.get('trial_end')),
      trial_settings: { end_behavior: { billing_cycle_anchor: S.keepDay ? 'unchanged' : 'now', missing_payment_method: 'create_invoice' } },
      default_payment_method: null, pause_collection: null, latest_invoice: null, metadata: metaOf(f, 'metadata'), form: f };
    S.subs[sub.id] = sub; if (key) S.keys[key] = sub;
    return reply(sub);
  }
  if (p.startsWith('subscriptions/') && m === 'GET') {
    const sub = S.subs[p.slice(14)];
    if (sub) return reply(Object.assign({}, sub, { form: undefined }));
    return reply({ id: p.slice(14), status: 'active', metadata: S.subMeta || {} });
  }
  if (p.startsWith('subscriptions/') && m === 'POST') {
    S.subPosts.push(String(init.body));
    const sub = S.subs[p.slice(14)];
    if (sub && f.has('default_payment_method')) {
      if (S.failCardMove) return reply({ error: { message: 'Stripe had a problem' } }, 500);
      sub.default_payment_method = f.get('default_payment_method') || null;
    }
    if (sub) {
      // A change to a plan, the way Stripe does it. Free time until a day ("trial_end") makes the plan "trialing" and
      // moves its bill day to that day. "now" ends it: one bill for the full month is made, and today is the bill day.
      const nowS = Math.floor(Date.now() / 1000);
      for (const [k, v] of Object.entries(metaOf(f, 'metadata'))) { if (v === '') delete sub.metadata[k]; else sub.metadata[k] = v; }
      if (f.get('pause_collection[behavior]')) sub.pause_collection = { behavior: f.get('pause_collection[behavior]'), resumes_at: Number(f.get('pause_collection[resumes_at]')) || null };
      if (f.has('pause_collection') && f.get('pause_collection') === '') sub.pause_collection = null;
      if (f.get('trial_end') === 'now') {
        sub.status = 'active'; sub.trial_end = nowS; sub.billing_cycle_anchor = nowS;
        const bill = { id: id('in_back'), object: 'invoice', customer: sub.customer, status: 'draft', billing_reason: 'subscription_cycle', amount_due: 10800, amount_remaining: 10800, metadata: {} };
        S.invoices[bill.id] = bill; sub.latest_invoice = bill.id;
      } else if (f.get('trial_end')) { sub.status = 'trialing'; sub.trial_end = Number(f.get('trial_end')); sub.billing_cycle_anchor = sub.trial_end; }
    }
    return reply(sub ? Object.assign({}, sub, { form: undefined }) : { id: p.slice(14), status: 'active' });
  }
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
    return reply({ object: 'invoice', status: 'draft', amount_due: S.preview != null ? S.preview : firstBill(sub.form), subscription: sub.id });
  }
  if (/^invoices\/[^/]+\/finalize$/.test(p)) return reply({ id: 'in_new', status: 'open' });
  if (/^invoices\/[^/]+\/pay$/.test(p)) { const i = S.invoices[p.split('/')[1]]; S.payCalls.push({ id: p.split('/')[1], key }); if (i) i.status = 'paid'; return reply({ id: p.split('/')[1], status: 'paid' }); }
  if (p.startsWith('invoices/') && m === 'POST') {
    // A note on a bill (metadata), or its words on the card statement. Stripe keeps a keyed request to one writer:
    // the same key again gets the first answer back, marked as a replay, and nothing is written twice.
    const i = S.invoices[p.slice(9)]; if (!i) return reply({ error: { message: 'No such invoice' } }, 404);
    if (S.failNote) return reply({ error: { message: 'Stripe had a problem' } }, 500);
    if (key && S.keys[key]) return reply(S.keys[key], 200, { 'idempotent-replayed': 'true' });
    if (f.has('statement_descriptor')) { if (i.status !== 'draft') return reply({ error: { message: 'You can only change this on a draft invoice' } }, 400); i.statement_descriptor = f.get('statement_descriptor'); }
    i.metadata = Object.assign({}, i.metadata || {}, metaOf(f, 'metadata'));
    S.notes.push({ id: i.id, key, f });
    if (key) S.keys[key] = Object.assign({}, i);
    return reply(i);
  }
  // S.blind: this reader sees the bill the way it was before another writer's note landed.
  if (p.startsWith('invoices/')) {
    const i = S.invoices[p.slice(9)];
    // S.lateNext: Stripe fills in the next try a moment after the event, the way it does for accounts on automations.
    if (i && S.lateNext && S.lateNext.id === i.id && --S.lateNext.reads <= 0) { i.next_payment_attempt = S.lateNext.at; S.lateNext = null; }
    return reply(i ? Object.assign({}, i, S.blind ? { metadata: {} } : {}) : { error: { message: 'No such invoice' } }, i ? 200 : 404);
  }
  if (p === 'billing_portal/sessions') return reply({ url: 'https://billing.stripe.com/p/session/test' });
  return reply({ error: { message: 'unmocked stripe ' + m + ' ' + p } }, 500);
}

const mails = [];
const META = []; // what the server sends Meta (Conversions API)
const MAIL = { down: false, all: [] }; // MAIL_OUT=/path/file.json writes every email the tests sent, to look at the branded ones in a browser
// Pretend Meta Graph API for lead forms: one Page, one app, lead forms and leads. Two tokens: the Page's own token,
// which can read leads, and a system user's token, which cannot (Meta answers that it wants a Page token).
const G = { calls: [], page: { id: '104000000000001', name: 'Arizona Pet Waste' }, app: { id: '900100200300', name: 'APW site leads' }, pageTok: 'PAGE_TOKEN_abc', userTok: 'SYSUSER_TOKEN_xyz',
  leads: {}, forms: {}, subs: [], subPosts: [], accounts: null, down: false, dead: false, noAds: false, noMeta: false };
function graphApi(m, url) {
  const u = new URL(url), parts = u.pathname.split('/').filter(Boolean), a = parts[1], b = parts[2];
  const tok = u.searchParams.get('access_token'), fields = (u.searchParams.get('fields') || '').split(',').filter(Boolean);
  G.calls.push({ m, version: parts[0], path: parts.slice(1).join('/'), fields: fields.join(','), tok });
  const err = (code, message, status = 400, sub) => reply({ error: { message, type: 'OAuthException', code, error_subcode: sub, fbtrace_id: 'AbCdEf' } }, status);
  if (G.down) return reply({ error: { message: 'An unknown error has occurred.', type: 'OAuthException', code: 1 } }, 500);
  if (G.dead || (tok !== G.pageTok && tok !== G.userTok)) return err(190, 'Error validating access token: Session has expired on Sunday, 15-Nov-26 22:00:00 PST.', 401, 463);
  if (a === 'me' && !b) return reply(tok === G.pageTok ? { id: G.page.id, name: G.page.name } : { id: '122000000000777', name: 'apw site system user' });
  if (a === 'me' && b === 'accounts') return tok === G.pageTok ? err(100, '(#100) Tried accessing nonexisting field (accounts) on node type (Page)') : reply({ data: G.accounts || [{ id: G.page.id, name: G.page.name, access_token: G.pageTok }] });
  if (a === 'app' && !b) return reply({ id: G.app.id, name: G.app.name });
  if (a === G.page.id && b === 'subscribed_apps') {
    if (tok !== G.pageTok) return err(190, '(#190) This method must be called with a Page Access Token');
    if (m === 'GET') return reply({ data: G.subs.map((x) => Object.assign({}, x)) });
    G.subPosts.push(u.searchParams.get('subscribed_fields'));
    if (G.noMeta) return err(200, '(#200) Requires pages_manage_metadata permission to manage the object');
    G.subs = G.subs.filter((x) => x.id !== G.app.id).concat([{ id: G.app.id, name: G.app.name, subscribed_fields: String(u.searchParams.get('subscribed_fields') || '').split(',') }]);
    return reply({ success: true });
  }
  if (a === G.page.id && !b) return fields.includes('access_token') ? reply({ access_token: G.pageTok, id: G.page.id }) : reply({ id: G.page.id, name: G.page.name });
  if (G.forms[a] && !b) return tok === G.pageTok ? reply({ id: a, name: G.forms[a] }) : err(190, '(#190) This method must be called with a Page Access Token');
  const lead = G.leads[a];
  if (lead && !b) {
    if (tok !== G.pageTok) return err(190, '(#190) This method must be called with a Page Access Token');
    if (G.noAds && fields.some((f) => /^(ad_name|adset_|campaign_)/.test(f))) return err(200, '(#200) Requires ads_management permission to read the ad of this lead');
    return reply(Object.fromEntries(Object.entries(lead).filter(([k]) => k === 'id' || fields.includes(k))));
  }
  return err(100, "Unsupported get request. Object with ID '" + a + "' does not exist, cannot be loaded due to missing permissions, or does not support this operation.", 400, 33);
}
const PLACES = { off: false, zip: '85396' }, placeCalls = [];
const AUTH = {}, authCalls = []; // pretend Supabase Auth: email to { id, password }
const reply = (data, status = 200, headers) => new Response(data === '' ? '' : JSON.stringify(data), { status, headers: Object.assign({ 'content-type': 'application/json' }, headers || {}) });
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  const m = init.method || 'GET';
  if (url === SB + '/auth/v1/user') { const u = tokens[String(init.headers.authorization || '').slice(7)]; return u ? reply(u) : reply({ msg: 'bad' }, 401); }
  if (url.startsWith(SB + '/rest/v1/')) return rest(m, url.slice((SB + '/rest/v1/').length), init.body ? JSON.parse(init.body) : null, init.headers && init.headers.prefer);
  if (url.startsWith('https://api.stripe.com/v1/')) return stripeApi(m, url, init);
  if (url === 'https://api.resend.com/emails') { if (MAIL.down) return reply({ message: 'mail is down' }, 500); mails.push(JSON.parse(init.body)); if (process.env.MAIL_OUT) MAIL.all.push(JSON.parse(init.body)); return reply({ id: 'm1' }); }
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
  if (url.startsWith('https://graph.facebook.com/') && !/\/events\?/.test(url)) return graphApi(m, url);
  if (url.startsWith('https://graph.facebook.com/')) { META.push({ url, body: JSON.parse(init.body) }); return reply({ events_received: 1 }); }
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
// No free month: the customer pays in Stripe's own plan checkout. Stripe makes the plan from what rode on the card
// form, charges the first month and puts the card on the plan. `status` is what the plan is left in ('incomplete' is a
// card that was refused).
const payNow = (sid, status) => {
  const s = S.sessions[sid], f = s.form, now = Math.floor(Date.now() / 1000);
  const sub = { id: id('sub'), object: 'subscription', status: status || 'active', customer: s.customer, created: now, start_date: now, billing_cycle_anchor: now, trial_end: null,
    default_payment_method: s.card, pause_collection: null, latest_invoice: 'in_first', metadata: metaOf(f, 'subscription_data[metadata]'), form: f };
  S.subs[sub.id] = sub;
  if (sub.status === 'active') { s.status = 'complete'; s.payment_status = 'paid'; s.subscription = sub.id; }
  return sub;
};
const paidEvt = (sid) => { const s = S.sessions[sid]; return { type: 'checkout.session.completed', data: { object: { id: s.id, object: 'checkout.session', mode: s.mode, status: s.status, payment_status: s.payment_status, client_reference_id: s.client_reference_id, customer: s.customer, setup_intent: null, subscription: s.subscription, metadata: s.metadata } } }; };
const reset = () => { mails.length = 0; deleted.length = 0; S.calls.length = 0; S.items.length = 0; S.payCalls.length = 0; };
const good = { zip: '85396', plan: 'week', dogs: 3, name: 'Test Person', phone: '(623) 555-0100', address: '123 W Test St', textsVisit: true, textsDeals: false, page: '/book/' };
const day = (unixSec) => new Date(unixSec * 1000).toISOString().slice(0, 16);

/* ---------- the basics ---------- */
head('Config and sign in');
{ const r = await call('/api/config');
  ok('config says live, with the day settings the sign up page needs', r.d.live === true && r.d.firstVisitFrom === '2026-11-20' && r.d.scheduleDays === 7 && r.d.stripeKey === 'pk_test_1', r.d);
  ok('config tells the sign up page the free month is on', r.d.freeMonth === true, r.d);
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
head('What the customer is told and what Stripe is told (the sign up day is set, so the dates do not move)');
// Joe, Nov 16, 2026, 11:25 pm: the free month is exactly one month from the sign up day. Sign up Nov 16, first bill Dec 16.
// `today` is the sign up day in Arizona. The server clock is held at `at` that day (Arizona time) while the card form is made.
async function quote(today, plan, dogs, token, extraEnv, at) {
  env = Object.assign({}, baseEnv, extraEnv || {});
  T.customers.length = 0; T.consent_log.length = 0;
  const realNow = Date.now;
  Date.now = () => Date.parse(today + 'T' + (at || '09:30') + ':00-07:00');
  let r;
  try { r = await call('/api/checkout', 'POST', Object.assign({}, good, { plan, dogs }), token || 'good'); } finally { Date.now = realNow; }
  const s = S.sessions[r.d && r.d.session];
  return { r, s, md: s ? s.metadata : {}, note: s ? s.form.get('custom_text[submit][message]') : '' };
}
{ // Joe's own case: sign up November 16, 2026 at 11:25 pm. The first bill is December 16, not December 27.
  const j = await quote('2026-11-16', 'week', 2, 'good', null, '23:25');
  ok('sign up November 16 late at night: the free month ends December 16, and the first charge is the full $108',
    day(Number(j.md.free_end)) === '2026-12-16T19:00' && j.md.free_label === 'December 16' && j.md.first_charge === '10800', j.md);
  ok('the note by the button says December 16', j.note === '$0 today. Then $108 a month starting Dec 16. Cancel anytime in My Yard.', j.note);
  const k = await quote('2026-11-17', 'week', 2, 'good', null, '00:05');
  ok('five minutes after midnight is the next day: December 17', day(Number(k.md.free_end)) === '2026-12-17T19:00' && k.note.startsWith('$0 today. Then $108 a month starting Dec 17. '), [k.md, k.note]);
  const l = await quote('2026-11-30', 'week', 2, 'good', null, '23:50');
  ok('the last night of the sale: November 30 runs to December 30', day(Number(l.md.free_end)) === '2026-12-30T19:00', l.md);
  const m = await quote('2026-11-16', 'week', 2, 'good', { SCHEDULE_DAYS: '7', FIRST_VISIT_FROM: '2026-11-20' });
  ok('the first visit day and the days we take to set it add nothing to the free month', day(Number(m.md.free_end)) === '2026-12-16T19:00', m.md);
}
{ // Sign up 2027-03-10: one month is April 10. That day is the bill day.
  const q = await quote('2027-03-10', 'week', 3);
  ok('free month ends April 10 at noon Arizona time', day(Number(q.md.free_end)) === '2027-04-10T19:00', q.md);
  ok('the first charge is one full month, the extra dog too: $121', q.md.first_charge === '12100', q.md.first_charge);
  ok('no billing day and no part month ride on the card form', !('anchor' in q.md) && !('next_label' in q.md), q.md);
  ok('the 60 day rule is off: the sign up carries no early cancel date, only the day pausing opens (60 days after the soonest first visit, May 10)', q.md.min_label === undefined && q.md.min_end === undefined && day(Number(q.md.pause_from)) === '2027-05-10T19:00', q.md);
  ok('the note by the button is one plain price line and one cancel line, with no 60 day rule',
    q.note === '$0 today. Then $121 a month starting Apr 10. Cancel anytime in My Yard.', q.note);
  ok('the page gets the same price line back, word for word, to show over the card form', q.r.d.line === '$0 today. Then $121 a month starting Apr 10.', q.r.d);
  ok('the note fits Stripe’s 1200 letter limit', q.note.length < 1200);
  const f = q.s.form;
  ok('the card form only saves a card: setup mode, embedded, never leaves the page', f.get('mode') === 'setup' && f.get('ui_mode') === 'embedded_page' && f.get('redirect_on_completion') === 'never' && f.get('currency') === 'usd');
  ok('cards only (Apple Pay and Google Pay ride on cards), and Link is off: no Link box, no phone field, no Bank tab',
    f.get('allowed_payment_method_types[0]') === 'card' && !f.has('allowed_payment_method_types[1]') && f.get('wallet_options[link][display]') === 'never', String(f));
  ok('no field that Stripe refuses in setup mode', ![...f.keys()].some((k) => /^(payment_method_collection|subscription_data|line_items|payment_method_types|customer_update|success_url|return_url)/.test(k)), [...f.keys()]);
  ok('the session is tied to the signed in person', f.get('client_reference_id') === U1 && q.md.user_id === U1 && f.get('customer') === row(U1).stripe_customer_id);
  ok('the page gets the card form secret, the session id, and is told it is a free month card form', /^cs_test_\d+_secret_/.test(q.r.d.clientSecret) && q.r.d.session === q.s.id && q.r.d.free === true, q.r.d);
  ok('the row waits at "checkout" with the text choices saved', row(U1).status === 'checkout' && row(U1).texts_visit === true && row(U1).texts_deals === false && T.consent_log.length === 2);
  const e = await quote('2027-03-10', 'week', 3, 'good', { EARLY_CANCEL: 'on' });
  ok('if the 60 day rule is ever switched back on, the note says it in one line and the date rides on the sign up',
    e.note === '$0 today. Then $121 a month starting Apr 10. Cancel anytime in My Yard. Cancel before May 10 and you pay for one month.' && e.md.min_label === 'May 10' && e.md.min_end === e.md.pause_from, [e.note, e.md]);
}
{ // Joe's own examples (Nov 16, 2026): sign up Nov 25, first charge Dec 25. Sign up Nov 30, first charge Dec 30.
  const a = await quote('2026-11-25', 'week', 2);
  ok('sign up November 25: the full $108 on December 25, and the 25th is the bill day', day(Number(a.md.free_end)) === '2026-12-25T19:00' && a.md.first_charge === '10800'
    && a.note === '$0 today. Then $108 a month starting Dec 25. Cancel anytime in My Yard.', [a.md, a.note]);
  const b = await quote('2026-11-30', 'week', 2);
  ok('sign up November 30: the full $108 on December 30, and the page is sent that same line', day(Number(b.md.free_end)) === '2026-12-30T19:00' && b.md.first_charge === '10800' && b.r.d.line === '$0 today. Then $108 a month starting Dec 30.', [b.md, b.r.d]);
}
{ // The 1st is a day like any other now. Sign up 2027-04-01: the free month ends May 1.
  const q = await quote('2027-04-01', 'eow', 2);
  ok('a free month that ends on May 1: the full $75 that day', day(Number(q.md.free_end)) === '2027-05-01T19:00' && q.md.first_charge === '7500', q.md);
  ok('the note says so', q.note === '$0 today. Then $75 a month starting May 1. Cancel anytime in My Yard.', q.note);
}
{ // A free month that ends two days before a month does: still one full month, not two days.
  const q = await quote('2027-06-30', 'twice', 6);
  ok('free month ends July 30: the first charge is the full $241, not 2 days of July', day(Number(q.md.free_end)) === '2027-07-30T19:00' && Number(q.md.first_charge) === 18900 + 4 * 1300, q.md);
  // Month ends: January 31 plus a month is the last day of February.
  const w = await quote('2027-01-31', 'week', 1);
  ok('a sign up on January 31 runs to the last day of February, the 28th, and the first charge is the full $108', day(Number(w.md.free_end)) === '2027-02-28T19:00' && w.md.first_charge === '10800', w.md);
  // December into January.
  const x = await quote('2027-12-04', 'week', 2);
  ok('a free month can end in the new year: January 4, 2028', day(Number(x.md.free_end)) === '2028-01-04T19:00' && x.md.first_charge === '10800' && x.note.startsWith('$0 today. Then $108 a month starting Jan 4. '), [x.md, x.note]);
  const y = await quote('2027-03-10', 'week', 3, 'good', { SCHEDULE_DAYS: '3' });
  ok('SCHEDULE_DAYS in Cloudflare no longer moves the bill day: still April 10', day(Number(y.md.free_end)) === '2027-04-10T19:00', y.md);
  let allFull = true;
  for (const plan of ['week', 'twice', 'eow']) for (let dogs = 1; dogs <= 6; dogs++) {
    const z = await quote('2027-03-10', plan, dogs);
    const base = { week: 10800, twice: 18900, eow: 7500 }[plan], extra = Math.max(0, dogs - 2) * { week: 1300, twice: 1300, eow: 900 }[plan];
    if (Number(z.md.first_charge) !== base + extra || !z.note.startsWith('$0 today. Then $' + (base + extra) / 100 + ' a month starting Apr 10. ')) { allFull = false; ok('first charge for ' + plan + ' ' + dogs, false, [z.md, z.note]); }
  }
  ok('every plan and dog count is told one full month as the first charge', allFull);
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
  ok('free until April 10 and nothing else: no billing day and no part month setting, so April 10 is the bill day and the first bill is a full month',
    f.get('trial_end') === q.md.free_end && ![...f.keys()].some((k) => /billing_cycle_anchor|proration|trial_settings|trial_period_days/.test(k)), String(f));
  ok('the plan has the base price and one extra dog', f.get('items[0][price]') === 'price_wb' && f.get('items[0][quantity]') === '1' && f.get('items[1][price]') === 'price_apw_week_extra' && f.get('items[1][quantity]') === '1');
  ok('the plan remembers the dates the customer saw', f.get('metadata[user_id]') === U1 && f.get('metadata[pause_from]') === q.md.pause_from && !f.get('metadata[min_end]') && f.get('metadata[free_label]') === 'April 10'
    && f.get('metadata[free_end]') === q.md.free_end && f.get('metadata[first_charge]') === '12100' && f.get('metadata[session]') === q.s.id && !f.has('metadata[anchor]') && !f.has('metadata[next_label]'), String(f));
  ok('Stripe is told to make this plan only once for this sign up', posts[0].key === 'apw-plan2-' + q.s.id, posts[0].key);
  const cust = S.customers[row(U1).stripe_customer_id];
  ok('the saved card is the card on file for every bill (set on the customer, not on the plan)', cust.invoice_settings.default_payment_method === S.intents[q.s.setup_intent].payment_method && !f.get('default_payment_method'));
  ok('the card is set before the plan is made', S.calls.findIndex((c) => c.m === 'POST' && c.p.startsWith('customers/')) < S.calls.findIndex((c) => c.m === 'POST' && c.p === 'subscriptions'));
  ok('the row is on its free month with the plan id', row(U1).status === 'trialing' && row(U1).stripe_subscription_id === Object.keys(S.subs)[0]);
  ok('the office gets one new booking email', sent(/^New booking: Test Person/).length === 1 && /Billing: \$0 today\. Then \$121 a month starting Apr 10\.\n/.test(sent(/^New booking/)[0].text), sent(/^New booking/).map((m) => m.text));
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
  ok('the customer gets one welcome email with the price line and cancel anytime, and no 60 day rule', sent(/^You are booked/).length === 1 && hi.to[0] === 'test@example.com'
    && /Your card is saved\. \$0 today\. Then \$121 a month starting Apr 10\.\n/.test(hi.text) && /You can cancel anytime in My Yard\.\n/.test(hi.text) && !/Keep your plan|60 days|charge one month|you pay for one month/.test(hi.text), hi && hi.text);
  ok('no email says the 1st, a part month or days left', !mails.some((m) => /\b1st\b|part month|days left|part of a month/.test(m.text)), mails.filter((m) => /\b1st\b|part month|days left/.test(m.text)).map((m) => m.subject));
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
  const fake = { id: 'sub_early', status: 'trialing', customer: row(U1).stripe_customer_id, pause_collection: null, metadata: { user_id: U1, free_end: q.md.free_end, free_label: 'April 10', first_charge: '10800', min_label: 'May 9' } };
  S.subs.sub_early = Object.assign({ form: new URLSearchParams() }, fake);
  ok('the plan event books the sign up and sends the welcome', (await hook(subEvt('created', fake))) === 200 && row(U1).status === 'trialing' && row(U1).stripe_subscription_id === 'sub_early' && sent(/^You are booked/).length === 1);
  ok('then the session event finds the plan and adds nothing', (await hook(sessionEvt(q.s.id))) === 200 && Object.keys(S.subs).length === 1 && sent(/^You are booked/).length === 1 && !S.calls.some((c) => c.m === 'POST' && c.p === 'subscriptions'));
}
{ // A free month that ends on a 1st is started the same way as any other day.
  for (const k of Object.keys(S.subs)) delete S.subs[k];
  q = await quote('2027-04-01', 'week', 2); reset();
  await hook(sessionEvt(q.s.id));
  const f = S.calls.filter((c) => c.m === 'POST' && c.p === 'subscriptions')[0].f;
  ok('free month ends on a 1st: Stripe gets the free month end and no second date', f.get('trial_end') === q.md.free_end && !f.has('billing_cycle_anchor') && !f.has('proration_behavior'), String(f));
  ok('the welcome says the full price from that day', /Your card is saved\. \$0 today\. Then \$108 a month starting May 1\./.test(sent(/^You are booked/)[0].text), sent(/^You are booked/)[0].text);
}
{ // A prepaid card is flagged for the office.
  for (const k of Object.keys(S.subs)) delete S.subs[k];
  S.funding = 'prepaid'; q = await quote('2027-03-10', 'week', 2); S.funding = 'credit'; reset();
  await hook(sessionEvt(q.s.id));
  ok('a prepaid card is flagged for the office', sent(/^Prepaid card: Test Person/).length === 1 && sent(/^PREPAID CARD\. New booking/).length === 1);
}
head('Meta: the booking and the leads reach Meta once, scrambled, with no phone number');
{ for (const k of Object.keys(S.subs)) delete S.subs[k];
  const sha = (v) => crypto.createHash('sha256').update(v).digest('hex');
  env = Object.assign({}, baseEnv, { FIRST_VISIT_FROM: '2027-03-10', META_CAPI_TOKEN: 'meta_test_token' });
  T.customers.length = 0; T.consent_log.length = 0; reset(); META.length = 0;
  const fbp = 'fb.1.1763355000000.1234567890', fbc = 'fb.1.1763355000000.IwAR0abcdefghijk';
  const r = await call('/api/checkout', 'POST', Object.assign({}, good, { plan: 'week', dogs: 2, ad: { fbp, fbc: fbc, junk: 'x' } }), 'good');
  const s = S.sessions[r.d && r.d.session];
  ok('the card form carries Meta\'s browser and click ids', !!s && s.metadata.ad_fbp === fbp && s.metadata.ad_fbc === fbc && !('ad_junk' in s.metadata), s && s.metadata);
  ok('a made up Meta id is dropped', (await call('/api/checkout', 'POST', Object.assign({}, good, { plan: 'week', dogs: 2, ad: { fbp: '<script>', fbc: 'x' } }), 'good')).status === 200
    && !Object.values(S.sessions).slice(-1)[0].metadata.ad_fbp && !Object.values(S.sessions).slice(-1)[0].metadata.ad_fbc);
  await hook(sessionEvt(s.id));
  await call('/api/checkout/done', 'POST', { session: s.id }, 'good'); await settle();
  const bk = META.filter((x) => x.body.data[0].event_name === 'StartTrial');
  const e = bk[0] && bk[0].body.data[0];
  ok('one booking sends Meta one StartTrial, with the event id the page uses', bk.length === 1 && e.event_id === 'bk_' + s.id && /\/v\d+\.0\/1982997959354953\/events\?access_token=meta_test_token$/.test(bk[0].url), META);
  ok('Meta gets the month price, a scrambled email, city and ZIP and the ad ids, never the phone, name or street', !!e && e.custom_data.value === 108 && e.custom_data.currency === 'USD'
    && e.user_data.em[0] === sha('test@example.com') && e.user_data.zp[0] === sha('85396') && e.user_data.ct[0] === sha('buckeye') && e.user_data.fbc === fbc && e.user_data.fbp === fbp
    && !/623|555|Test Person|Test St/.test(JSON.stringify(e)), e);
  META.length = 0;
  const w = await call('/api/waitlist', 'POST', { name: 'Wait Person', phone: '6235550199', address: '9 N Far St, Surprise', email: 'wait@example.com', zip: '', texts: false, website: '', eid: 'wl_abc123def', ad: { fbc } }); await settle();
  const l = META[0] && META[0].body.data[0];
  ok('a waitlist sign up sends one Lead with the page\'s event id and no phone, name or street', w.status === 200 && META.length === 1 && l.event_name === 'Lead' && l.event_id === 'wl_abc123def'
    && l.user_data.em[0] === sha('wait@example.com') && !/6235550199|Wait Person|Far St/.test(JSON.stringify(l)), META);
  META.length = 0;
  await call('/api/waitlist', 'POST', { name: 'Wait Odd', phone: '6235550197', address: '9 N Far St, Surprise', email: '', zip: '', texts: false, website: '', eid: '"><img>' }); await settle();
  ok('a lead with no good event id is not sent (Meta could not match it to the page)', META.length === 0);
  env = Object.assign({}, baseEnv, { FIRST_VISIT_FROM: '2027-03-10' });
  await call('/api/waitlist', 'POST', { name: 'Wait Two', phone: '6235550198', address: '9 N Far St, Surprise', email: 'w2@example.com', zip: '', texts: false, website: '', eid: 'wl_abc123xyz' }); await settle();
  ok('with no Meta token nothing goes to Meta', META.length === 0);
  const r2 = await call('/api/checkout', 'POST', Object.assign({}, good, { phone: '6235550111', address: '11 W Other St', ad: { fbp, fbc } }), 'two');
  ok('with no Meta token the card form carries no Meta ids', r2.status === 200 && !Object.keys(S.sessions[r2.d.session].metadata).some((k) => /^ad_/.test(k)), S.sessions[r2.d.session] && S.sessions[r2.d.session].metadata);
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
    && posts.length === 3 && posts.every((c) => c.key === 'apw-plan2-' + q.s.id && String(c.f) === String(posts[0].f)) && sent(/^ACTION NEEDED/).length === 0 && sent(/^You are booked/).length === 1, [st, posts.length]);
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
  S.preview = 5647; // Stripe would charge a part month. The customer was told one full month.
  await hook(sessionEvt(q.s.id)); S.preview = null;
  const a = sent(/^CHECK BILLING: Stripe does not match what Test Person was told$/);
  ok('if Stripe would charge a part month, the office hears about it that day', a.length === 1 && /1\. The first charge\. They were told \$121\. Stripe plans to charge \$56\.47\./.test(a[0].text) && /Nothing has been charged/.test(a[0].text)
    && /Do not change the plan in Stripe by hand/.test(a[0].text) && a[0].text.includes('Stripe plan: ' + row(U1).stripe_subscription_id), a[0] && a[0].text);
  ok('and it is on the Health tab', T.errors.length === 1 && /does not match what a new customer was told/.test(T.errors[0].message) && /They were told \$121/.test(T.errors[0].detail), T.errors);
  ok('the sign up itself still went through', row(U1).status === 'trialing' && sent(/^You are booked/).length === 1 && sent(/^New booking/).length === 1);

  for (const k of Object.keys(S.subs)) delete S.subs[k];
  q = await quote('2027-03-10', 'week', 3); reset(); T.errors.length = 0;
  S.preview = Number(q.md.first_charge) + 1;
  await hook(sessionEvt(q.s.id)); S.preview = null;
  ok('one cent of rounding is not a mismatch', sent(/^CHECK BILLING/).length === 0 && T.errors.length === 0);

  // Stripe moves the bill day to the day the free month ends on its own. If a plan were ever set to keep an older
  // bill day, the bill after the free month would be a part month, and we would know the day of the sign up.
  for (const k of Object.keys(S.subs)) delete S.subs[k];
  q = await quote('2027-04-01', 'week', 2); reset(); T.errors.length = 0;
  S.keepDay = true;
  await hook(sessionEvt(q.s.id)); S.keepDay = false;
  const b = sent(/^CHECK BILLING/);
  ok('a plan set to keep an older bill day is caught', b.length === 1 && /1\. The bill day\. They were told they pay each month from May 1, 2027/.test(b[0].text) && /which makes a part month bill/.test(b[0].text)
    && !/\d\. The first charge/.test(b[0].text) && !/\d\. The day the free month ends/.test(b[0].text), b[0] && b[0].text);

  // A card form that was opened before November 16, 2026 still carries the old numbers: a part month as the first
  // charge and a billing day on the 1st. The plan is started by the new rule, and the office is told what they saw.
  for (const k of Object.keys(S.subs)) delete S.subs[k];
  q = await quote('2027-03-10', 'week', 3); reset(); T.errors.length = 0;
  Object.assign(S.sessions[q.s.id].metadata, { first_charge: '5647', anchor: String(Math.floor(Date.UTC(2027, 4, 1, 19) / 1000)), next_label: 'May 1' });
  await hook(sessionEvt(q.s.id));
  { const f = S.calls.filter((c) => c.m === 'POST' && c.p === 'subscriptions')[0].f, c = sent(/^CHECK BILLING/);
    ok('a card form from before the change: its plan gets no billing day and a full month as the first charge', f.get('trial_end') === q.md.free_end && !f.has('billing_cycle_anchor') && !f.has('proration_behavior') && f.get('metadata[first_charge]') === '12100' && !f.has('metadata[anchor]'), String(f));
    ok('and the office is told what that customer saw', c.length === 1 && /The first charge\. They were told \$56\.47\. Stripe plans to charge \$121\./.test(c[0].text), c[0] && c[0].text); }

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
head('A payment fails: a friendly email with a card link, an office alert with the try number, visits on hold');
const cus = row(U1).stripe_customer_id, subId = row(U1).stripe_subscription_id;
const liveSub = S.subs[subId];
const DAY = 86400;
const nowS = () => Math.floor(Date.now() / 1000);
const later = (days) => new Date((RealDate.now() / 1000 + days * DAY) * 1000).toISOString();
const inv = { id: 'in_fail', object: 'invoice', customer: cus, status: 'open', amount_due: 12100, amount_remaining: 12100, amount_paid: 0, attempted: true, attempt_count: 1, collection_method: 'charge_automatically',
  next_payment_attempt: nowS() + 3 * DAY, metadata: {}, hosted_invoice_url: 'https://invoice.stripe.com/i/acct_1/test_abc' };
S.invoices.in_fail = inv;
row(U1).service_day = 2;
const cardTexts = () => T.messages.filter((x) => x.kind === 'card_failed');
const failedEvt = (over) => ({ type: 'invoice.payment_failed', data: { object: Object.assign({}, inv, over || {}) } });
// A brand new failed bill: try 1, with Stripe's next try three days out, and nothing told yet.
const fresh = (over) => {
  Object.assign(inv, { status: 'open', amount_remaining: 12100, attempt_count: 1, next_payment_attempt: nowS() + 3 * DAY, metadata: {} }, over || {});
  for (const k of Object.keys(S.keys)) if (k.startsWith('apw-try-')) delete S.keys[k];
};
reset();
ok('failed payment event is taken', (await hook(failedEvt())) === 200);
let cardUrl = '';
{ ok('the customer is on hold', row(U1).status === 'past_due');
  ok('visits after today come off the routes', deleted.some((d) => d.startsWith('stops?customer_id=eq.' + U1 + '&status=in.(scheduled,skipped)&day=gt.')), deleted);
  const m = sent(/^Your card did not go through$/)[0];
  cardUrl = (m && (/Update my card: (https:\/\/arizonapetwaste\.com\/api\/card\?k=[^\s]+)/.exec(m.text) || [])[1]) || '';
  ok('the customer is emailed the same day in plain, friendly words: what failed, one link to fix the card, when we try again, and the hold', !!m && m.to[0] === 'test@example.com' && /^Hi Test,/.test(m.text)
    && /We tried to charge your card \$121 for your dog poop pickup\. It did not go through\./.test(m.text) && /This is easy to fix\./.test(m.text) && !!cardUrl && /We will try it again on \w+day, \w+ \d+\./.test(m.text)
    && /Your visits are on hold until the payment goes through\. They start again as soon as it does\./.test(m.text) && /623\.309\.6104/.test(m.text) && !/[–—]| - /.test(m.text), m && m.text);
  ok('the email has our look: the logo on navy, one orange button to the card page, and the same words', !!m && /<img src="https:\/\/arizonapetwaste\.com\/assets\/img\/email-logo\.png"[^>]*alt="Arizona Pet Waste"/.test(m.html)
    && m.html.includes('<a href="' + cardUrl + '"') && />Update my card<\/a>/.test(m.html) && /background:#FF4A1C/.test(m.html) && /background:#0A0F24/.test(m.html) && /We tried to charge your card \$121/.test(m.html)
    && (m.html.match(/>Update my card</g) || []).length === 1 && !/<script|javascript:/i.test(m.html), m && m.html.slice(0, 400));
  const t = cardTexts();
  ok('a text waits for staff to send (they said yes to visit texts)', t.length === 1 && t[0].status === 'queued' && t[0].channel === 'sms' && t[0].to_addr === '6235550100' && t[0].stop_id === null && t[0].customer_id === U1, t);
  ok('the text is one text long, names us, and says how to stop', t[0].body.length <= 160 && /^Arizona Pet Waste: /.test(t[0].body) && /Reply STOP to opt out\.$/.test(t[0].body) && t[0].body.includes('arizonapetwaste.com/account') && t[0].body.includes('623.309.6104'), t[0].body + ' (' + t[0].body.length + ')');
  const o = sent(/^Card failed: /)[0];
  ok('the office gets an alert with the name, address, amount and try number', !!o && o.subject === 'Card failed: Test Person, 123 W Test St ($121, try 1)' && o.to[0] === 'info@arizonapetwaste.com' && !o.html
    && /A payment of \$121 failed\. This was try 1\./.test(o.text) && /Stripe will try the card again on \w+day, \w+ \d+\./.test(o.text) && o.text.includes('Name: Test Person\nAddress: 123 W Test St, 85396\nAmount: $121\nTry: 1\nMobile: 6235550100\nEmail: test@example.com')
    && /Their visits are on hold\. They stay off new routes until the bill is paid\./.test(o.text) && /We emailed them how to fix it/.test(o.text) && /A text to them is waiting in the Texts tab\. Send it today\./.test(o.text) && /PAUSE SERVICE/.test(o.text), o && [o.subject, o.text]);
  ok('the bill itself remembers that try 1 was told, and Stripe is asked to keep that note to one writer', inv.metadata.apw_try === '1' && Number(inv.metadata.apw_mail) > 0 && !inv.metadata.apw_final && S.notes.slice(-1)[0].key === 'apw-try-in_fail-1', [inv.metadata, S.notes.slice(-1)[0] && S.notes.slice(-1)[0].key]);
  ok('this server cancels nothing in Stripe over a failed card', !S.calls.some((c) => c.m === 'DELETE') && !S.calls.some((c) => c.m === 'POST' && /^subscriptions/.test(c.p)));

  // The link in the email opens Stripe's own card page, with no sign in.
  const tap = async (u) => { S.calls.length = 0; const r = await worker.fetch(new Request(u), env, ctx); await settle(); return { status: r.status, to: r.headers.get('location'), stripe: S.calls.filter((c) => c.p === 'billing_portal/sessions') }; };
  const old = (r) => r.status === 302 && r.to === 'https://arizonapetwaste.com/account/?card=old' && r.stripe.length === 0;
  const g = await tap(cardUrl), pf = g.stripe[0] && g.stripe[0].f;
  ok('the link opens Stripe\'s card page for that one customer, with no sign in and nothing else to tap', g.status === 302 && /^https:\/\/billing\.stripe\.com\//.test(g.to) && !!pf && pf.get('customer') === cus
    && pf.get('flow_data[type]') === 'payment_method_update' && pf.get('flow_data[after_completion][type]') === 'hosted_confirmation' && /new card is saved/.test(pf.get('flow_data[after_completion][hosted_confirmation][custom_message]'))
    && pf.get('return_url') === 'https://arizonapetwaste.com/account/', [g.status, g.to, pf && String(pf)]);
  const [uid, exp, sig] = cardUrl.split('k=')[1].split('.');
  ok('a changed link opens nothing', old(await tap(cardUrl.slice(0, -2) + (cardUrl.slice(-2) === 'AA' ? 'BB' : 'AA'))) && old(await tap('https://arizonapetwaste.com/api/card')) && old(await tap('https://arizonapetwaste.com/api/card?k=../../x')));
  ok('a link cannot be moved to another customer or given a later end date', old(await tap('https://arizonapetwaste.com/api/card?k=' + U2 + '.' + exp + '.' + sig)) && old(await tap('https://arizonapetwaste.com/api/card?k=' + uid + '.' + (Number(exp) + 999) + '.' + sig)));
  const yardSig = crypto.createHmac('sha256', 'apw-yard-link|' + env.SUPABASE_SERVICE_ROLE_KEY).update(uid + '.' + exp).digest('base64url');
  ok('a My Yard link cannot be used as a card link, and a card link does not sign anyone in', old(await tap('https://arizonapetwaste.com/api/card?k=' + uid + '.' + exp + '.' + yardSig))
    && (await call('/api/me/link', 'POST', { k: uid + '.' + exp + '.' + sig })).status === 410);
  ok('the link lasts 30 days', Number(exp) - nowS() > 29 * DAY && Number(exp) - nowS() <= 30 * DAY && old(await at(later(31), () => tap(cardUrl))));
  T.errors.length = 0;

  const before = mails.length;
  await hook(failedEvt());
  liveSub.status = 'past_due'; liveSub.latest_invoice = 'in_fail';
  ok('before it puts anyone on hold the server asks Stripe about the bill', S.calls.some((c) => c.m === 'GET' && c.p === 'invoices/in_fail'));
  S.calls.length = 0;
  await hook(subEvt('updated', liveSub, {}, { status: 'trialing' }));
  ok('and about the plan', S.calls.some((c) => c.m === 'GET' && c.p === 'subscriptions/' + liveSub.id));
  ok('the same failed try heard again, as a bill event or as a plan event, tells nobody twice', mails.length === before && cardTexts().length === 1 && row(U1).status === 'past_due', mails.slice(before).map((x) => x.subject));

  // Stripe's retries. Every failed try tells the office. The customer is not emailed on every one.
  inv.attempt_count = 2;
  await at(later(1), () => hook(failedEvt()));
  const o2 = sent(/^Card failed again: /)[0];
  ok('try 2 fails a day later: the office gets a new alert with the try number, and the customer is not emailed again so soon', mails.length === before + 1 && !!o2 && o2.subject === 'Card failed again: Test Person, 123 W Test St ($121, try 2)'
    && /This was try 2\./.test(o2.text) && /\nTry: 2\n/.test(o2.text) && /No new email went to them today\./.test(o2.text) && inv.metadata.apw_try === '2' && cardTexts().length === 1, mails.slice(before).map((x) => [x.subject, x.text]));
  inv.attempt_count = 3;
  await at(later(6), () => hook(failedEvt()));
  const again = sent(/^Reminder: your card still did not go through$/)[0], o3 = sent(/^Card failed again: .*try 3\)$/)[0];
  ok('try 3 fails six days after their last email: the customer gets one reminder with the same button', !!again && again.to[0] === 'test@example.com' && /We tried your card again for \$121\. It still did not go through\./.test(again.text)
    && /Update my card: https:\/\/arizonapetwaste\.com\/api\/card\?k=/.test(again.text) && />Update my card<\/a>/.test(again.html) && /Your visits are still on hold/.test(again.text), again && again.text);
  ok('and the office alert for try 3 says a reminder went out', !!o3 && /This was try 3\./.test(o3.text) && /We emailed them a reminder with the same button\./.test(o3.text) && cardTexts().length === 1, o3 && o3.text);
  const p = await call('/api/me/plan', 'GET', null, 'good');
  ok('My Yard shows the hold and no next visits', p.d.plan.hold === true && p.d.plan.next.length === 0 && p.d.plan.canPause === false, p.d);
  const n = mails.length;
  await hook(subEvt('updated', liveSub, { status: 'active' }));
  ok('a plan change that is not a payment does not lift the hold', row(U1).status === 'past_due' && mails.length === n);
}
head('The bill gets paid: visits come back');
{ reset();
  liveSub.status = 'past_due';
  await hook({ type: 'invoice.paid', data: { object: Object.assign({}, inv, { id: 'in_other', status: 'paid', amount_paid: 900, amount_remaining: 0 }) } });
  ok('another bill is paid but the plan is still past due in Stripe: still on hold', row(U1).status === 'past_due' && mails.length === 0);
  await hook({ type: 'invoice.paid', data: { object: { id: 'in_zero', customer: cus, status: 'paid', amount_paid: 0 } } });
  ok('a $0 bill changes nothing', row(U1).status === 'past_due' && mails.length === 0);
  liveSub.status = 'active'; inv.status = 'paid';
  ok('paid event is taken', (await hook({ type: 'invoice.paid', data: { object: Object.assign({}, inv, { status: 'paid', amount_paid: 12100, amount_remaining: 0 }) } })) === 200);
  ok('the customer is off hold', row(U1).status === 'active');
  ok('the text nobody sent leaves the list', cardTexts()[0].status === 'skipped');
  const m = sent(/^Your payment went through$/)[0];
  ok('the customer is thanked and told their day, in an email with our look', !!m && /your visits are back on/.test(m.text) && /We come on your next Tuesday\./.test(m.text) && /email-logo\.png/.test(m.html) && /your visits are back on/.test(m.html) && !/Update my card/.test(m.html), m && m.text);
  ok('the office is told they are back on the schedule', sent(/^Paid: Test Person$/).length === 1);
  const before = mails.length;
  await hook({ type: 'invoice.paid', data: { object: Object.assign({}, inv, { status: 'paid', amount_paid: 12100 }) } });
  await hook(subEvt('updated', liveSub, { status: 'active' }, { status: 'past_due' }));
  ok('the same news twice sends nothing more', mails.length === before && row(U1).status === 'active');
  const p = await call('/api/me/plan', 'GET', null, 'good');
  ok('My Yard shows next visits again', p.d.plan.hold === false && p.d.plan.next.length === 3, p.d);
}
head('The other order, and a customer with no texts');
{ reset(); T.messages.length = 0; fresh();
  row(U1).texts_visit = false; liveSub.status = 'past_due'; liveSub.latest_invoice = 'in_fail';
  await hook(subEvt('updated', liveSub, {}, { status: 'active' }));
  ok('Stripe’s plan event lands first: on hold, emailed with the card link, no text queued', row(U1).status === 'past_due' && sent(/^Your card did not go through$/).length === 1
    && /Update my card: https:\/\/arizonapetwaste\.com\/api\/card\?k=/.test(sent(/^Your card did not go through$/)[0].text) && /charge your card \$121/.test(sent(/^Your card did not go through$/)[0].text) && T.messages.length === 0);
  ok('the office is told to call (no text consent)', /They did not agree to texts, so no text is waiting\. Call them today\./.test(sent(/^Card failed: /)[0].text));
  await hook(failedEvt());
  ok('then the bill event lands: nothing more', sent(/^Your card did not go through$/).length === 1 && sent(/^Card failed/).length === 1);
  liveSub.status = 'active';
  await hook(subEvt('updated', liveSub, { status: 'active' }, { status: 'past_due' }));
  ok('Stripe says the plan went from past due to paid: off hold, thanked once', row(U1).status === 'active' && sent(/^Your payment went through$/).length === 1);
  row(U1).texts_visit = true;
}
{ // One failed try can reach us as two events at the very same moment: the bill and the plan. Both read the bill
  // before either has written its note. Stripe keeps the note to one writer, and only that one tells.
  reset(); T.messages.length = 0; fresh(); liveSub.status = 'past_due';
  await hook(failedEvt());
  const n = mails.length;
  S.blind = true;
  await hook(subEvt('updated', liveSub, {}, { status: 'active' }));
  await hook(failedEvt());
  S.blind = false;
  ok('one failed try that reaches us twice at the same moment still tells everyone once', n === 2 && mails.length === n && cardTexts().length === 1, mails.map((x) => x.subject));
  // And if Stripe will not keep the note at all, the alert still goes out.
  reset(); T.messages.length = 0; T.errors.length = 0; fresh(); row(U1).status = 'active';
  S.failNote = true;
  await hook(failedEvt());
  S.failNote = false;
  ok('if the note on the bill cannot be saved, everyone is still told, and the Health tab says an alert may come twice', sent(/^Card failed: /).length === 1 && sent(/^Your card did not go through$/).length === 1
    && T.errors.some((e) => /note on the bill could not be saved/.test(e.message)), [mails.map((x) => x.subject), T.errors]);
  T.errors.length = 0; liveSub.status = 'active'; inv.status = 'paid';
  await hook({ type: 'invoice.paid', data: { object: Object.assign({}, inv, { status: 'paid', amount_paid: 12100 }) } });
}
head('A new card while on hold is tried right away');
{ reset(); fresh(); liveSub.status = 'past_due';
  await hook(failedEvt());
  const cu = { id: cus, object: 'customer', invoice_settings: { default_payment_method: 'pm_new' } };
  await hook({ type: 'customer.updated', data: { object: cu, previous_attributes: { name: 'Old Name' } } });
  ok('a change that is not the card tries nothing', S.payCalls.length === 0);
  await hook({ type: 'customer.updated', data: { object: cu, previous_attributes: { invoice_settings: { default_payment_method: 'pm_old' } } } });
  ok('a new card on file (the card link in the email does this): the open bill is tried on it, once for that card', S.payCalls.length === 1 && S.payCalls[0].id === 'in_fail' && S.payCalls[0].key === 'apw-newcard-in_fail-pm_new', S.payCalls);
  S.invoices.in_old = Object.assign({}, inv, { id: 'in_old', created: nowS() - 90 * DAY }); S.payCalls.length = 0; inv.status = 'open'; inv.created = nowS() - 3 * DAY;
  await hook({ type: 'customer.updated', data: { object: Object.assign({}, cu, { invoice_settings: { default_payment_method: 'pm_newer' } }), previous_attributes: { invoice_settings: { default_payment_method: 'pm_new' } } } });
  ok('a bill left open for three months is not charged to the new card on its own', S.payCalls.length === 1 && S.payCalls[0].id === 'in_fail', S.payCalls);
  delete S.invoices.in_old;
  liveSub.status = 'active';
  await hook({ type: 'invoice.paid', data: { object: Object.assign({}, inv, { status: 'paid', amount_paid: 12100 }) } });
  ok('and when it goes through they are off hold', row(U1).status === 'active');
  S.payCalls.length = 0;
  await hook({ type: 'customer.updated', data: { object: cu, previous_attributes: { invoice_settings: { default_payment_method: 'pm_new' } } } });
  ok('a new card when nothing is owed tries nothing', S.payCalls.length === 0);
}
head('A next try that shows up a moment late is not the last try');
{ // With Stripe's automations the bill gets its next try a moment after the event. The first look shows none.
  reset(); fresh({ attempt_count: 1, next_payment_attempt: null, metadata: {} });
  row(U1).status = 'active'; liveSub.status = 'past_due'; liveSub.latest_invoice = 'in_fail';
  S.lateNext = { id: 'in_fail', reads: 3, at: nowS() + 3 * DAY };
  await hook(failedEvt());
  ok('the server looks again, sees the next try, and treats it as an ordinary failed try: a first notice, no last notice, no PAUSE SERVICE', sent(/^Your card did not go through$/).length === 1 && sent(/^Card failed: /).length === 1
    && sent(/^PAUSE SERVICE|^Last notice/).length === 0 && !inv.metadata.apw_final && row(U1).status === 'past_due' && /Stripe will try the card again on /.test(sent(/^Card failed: /)[0].text), mails.map((x) => x.subject));
}
head('The last try fails: PAUSE SERVICE for the office, a last notice for the customer, and the plan is not canceled');
{ // Stripe has tried four times. The bill shows no next try. The plan is still there, past due.
  reset(); fresh({ attempt_count: 4, next_payment_attempt: null, metadata: { apw_try: '3', apw_mail: String(nowS() - DAY) } });
  row(U1).status = 'past_due'; liveSub.status = 'past_due'; liveSub.latest_invoice = 'in_fail';
  await hook(failedEvt());
  const ps = sent(/^PAUSE SERVICE: /);
  ok('the office gets one alert that starts with PAUSE SERVICE, with the name, address, amount and how many tries', ps.length === 1 && ps[0].subject === 'PAUSE SERVICE: Test Person, 123 W Test St ($121 unpaid after 4 tries)' && ps[0].to[0] === 'info@arizonapetwaste.com'
    && /^PAUSE SERVICE\. Stripe tried their card 4 times and has stopped trying\. \$121 is unpaid\./.test(ps[0].text) && ps[0].text.includes('Name: Test Person\nAddress: 123 W Test St, 85396\nAmount: $121\nTries: 4\n'), ps.map((x) => [x.subject, x.text]));
  ok('it says what to do, and that the plan is not canceled', /1\. Keep them off the route\./.test(ps[0].text) && /2\. Call them\./.test(ps[0].text) && /3\. Their plan is not canceled\. Canceling is your call\./.test(ps[0].text) && /We emailed them a last notice/.test(ps[0].text), ps[0].text);
  const l = sent(/^Last notice: your visits are on hold$/)[0];
  ok('the customer gets a last notice with the button to change their card', !!l && /We tried your card 4 times for \$121\. It did not go through, so we have stopped trying\./.test(l.text) && /Your visits stay on hold until the bill is paid\. To start again, tap the button/.test(l.text)
    && /Update my card: https:\/\/arizonapetwaste\.com\/api\/card\?k=/.test(l.text) && />Update my card<\/a>/.test(l.html), l && l.text);
  ok('that is all: no second alert for the same try', mails.length === 2 && sent(/^Card failed/).length === 0, mails.map((x) => x.subject));
  ok('the server looked at the bill three times before calling it the last try, and asked Stripe if the plan was canceled', S.calls.filter((c) => c.m === 'GET' && c.p === 'invoices/in_fail').length === 3 && S.calls.some((c) => c.m === 'GET' && c.p === 'subscriptions/' + liveSub.id));
  ok('nothing is canceled by this server', !S.calls.some((c) => c.m === 'DELETE') && !S.calls.some((c) => c.m === 'POST' && /^subscriptions/.test(c.p)) && row(U1).status === 'past_due');
  ok('the bill remembers the last notice', inv.metadata.apw_final === '1' && inv.metadata.apw_try === '4', inv.metadata);
  // Stripe then marks the plan unpaid (its setting for "if all retries for a payment fail").
  liveSub.status = 'unpaid';
  await hook(subEvt('updated', liveSub, {}, { status: 'past_due' }));
  ok('Stripe marks the plan unpaid: the row stays on hold the way the office knows it (past due), and nobody is told twice', row(U1).status === 'past_due' && mails.length === 2, [row(U1).status, mails.map((x) => x.subject)]);
  await hook(failedEvt());
  ok('the last try heard again tells nobody twice', mails.length === 2);
  // They change their card a week later: the open bill is tried, it goes through, they are back.
  S.payCalls.length = 0;
  await hook({ type: 'customer.updated', data: { object: { id: cus, object: 'customer', invoice_settings: { default_payment_method: 'pm_fix' } }, previous_attributes: { invoice_settings: { default_payment_method: 'pm_new' } } } });
  liveSub.status = 'active';
  await hook(subEvt('updated', liveSub, {}, { status: 'unpaid' }));
  ok('a new card after the last notice still pays the open bill and puts them back on', S.payCalls.length === 1 && S.payCalls[0].id === 'in_fail' && row(U1).status === 'active' && sent(/^Your payment went through$/).length === 1 && sent(/^Paid: /).length === 1, [S.payCalls, row(U1).status]);
}
{ // The other order: Stripe's "unpaid" is what says the last try failed, before the bill shows it.
  reset(); fresh({ attempt_count: 4, metadata: { apw_try: '3', apw_mail: String(nowS() - DAY) } });
  row(U1).status = 'past_due'; liveSub.status = 'unpaid'; liveSub.latest_invoice = 'in_fail';
  await hook(subEvt('updated', liveSub, {}, { status: 'past_due' }));
  ok('"unpaid" from Stripe is the last try: PAUSE SERVICE once and a last notice once', sent(/^PAUSE SERVICE: .*after 4 tries\)$/).length === 1 && sent(/^Last notice/).length === 1 && mails.length === 2 && row(U1).status === 'past_due', mails.map((x) => x.subject));
  inv.next_payment_attempt = null;
  await hook(failedEvt());
  ok('then the bill event for that try lands: nothing more', mails.length === 2);
  // A plan Stripe paused by itself after the last failed try (another Stripe setting) reads the same way.
  reset(); fresh({ attempt_count: 2, metadata: { apw_try: '1', apw_mail: String(nowS() - DAY) } });
  liveSub.status = 'paused'; liveSub.status_details = { paused: { type: 'subscription', transitioned_at: nowS(), subscription: { type: 'final_payment_failure' } } };
  await hook(subEvt('updated', liveSub, {}, { status: 'past_due' }));
  ok('a plan Stripe paused after the last failed try: PAUSE SERVICE, and the row reads past due, not paused', sent(/^PAUSE SERVICE: /).length === 1 && row(U1).status === 'past_due', [mails.map((x) => x.subject), row(U1).status]);
  delete liveSub.status_details;
}
{ // Until the Stripe setting is changed, Stripe cancels the plan after the last try. The office and the customer are
  // told what really happened.
  reset(); fresh({ attempt_count: 4, next_payment_attempt: null, metadata: { apw_try: '3', apw_mail: String(nowS() - DAY) } });
  row(U1).status = 'past_due'; liveSub.status = 'canceled'; liveSub.cancellation_details = { reason: 'payment_failed' }; liveSub.latest_invoice = 'in_fail';
  await hook(failedEvt());
  const ps = sent(/^PAUSE SERVICE: /)[0], end = sent(/^Your plan has ended$/)[0];
  ok('Stripe canceled the plan after the last try: PAUSE SERVICE says so and names the Stripe setting to change', !!ps && /and then Stripe canceled their plan\. \$121 is unpaid\./.test(ps.text) && /"If all retries for a payment fail", pick "Mark the subscription as unpaid"/.test(ps.text)
    && /To come back they sign up again/.test(ps.text) && !/Their plan is not canceled/.test(ps.text), ps && ps.text);
  ok('the customer is told their plan has ended, with no card button that would do nothing', !!end && /your plan has ended and your visits have stopped/.test(end.text) && !/Update my card/.test(end.text) && !/Update my card/.test(end.html) && sent(/^Last notice/).length === 0, end && end.text);
  const n = mails.length;
  await hook(subEvt('deleted', liveSub));
  const gone = sent(/^Canceled: Test Person$/)[0];
  ok('then the cancel event lands: the row is canceled, the office hears Stripe did it, and nobody is told twice', row(U1).status === 'canceled' && mails.length === n + 1 && !!gone && /Stripe canceled this plan because the card kept failing/.test(gone.text), mails.slice(n).map((x) => x.subject));
  // The cancel event alone (the bill event was lost): it still tells both.
  reset(); fresh({ attempt_count: 4, metadata: { apw_try: '3', apw_mail: String(nowS() - DAY) } }); row(U1).status = 'past_due';
  await hook(subEvt('deleted', liveSub));
  ok('the cancel event by itself still sends PAUSE SERVICE and the "plan has ended" email', sent(/^PAUSE SERVICE: /).length === 1 && sent(/^Your plan has ended$/).length === 1 && row(U1).status === 'canceled', mails.map((x) => x.subject));
  // A customer who cancels on their own is not a failed card.
  reset(); row(U1).status = 'active'; liveSub.cancellation_details = { reason: 'cancellation_requested' };
  await hook(subEvt('deleted', liveSub));
  ok('a customer who cancels on their own gets no PAUSE SERVICE', sent(/^PAUSE SERVICE/).length === 0 && /A customer canceled\./.test(sent(/^Canceled: /)[0].text), mails.map((x) => x.subject));
  delete liveSub.cancellation_details; liveSub.status = 'active'; inv.status = 'paid';
  Object.assign(row(U1), { status: 'active', stripe_subscription_id: liveSub.id });
}
head('Old news from Stripe changes nothing');
{ // Stripe does not promise the order of its events, and it sends one again for up to three days when it got no answer.
  reset(); T.messages.length = 0; fresh();
  const failed = () => failedEvt({ status: 'open', amount_remaining: 12100 });
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
  inv.status = 'open'; inv.amount_remaining = 12100; liveSub.status = 'past_due';
  await hook(failed());
  ok('a bill that is still unpaid in Stripe does put them on hold', row(U1).status === 'past_due' && sent(/^Your card did not go through$/).length === 1);
  const before = mails.length;
  await hook(subEvt('updated', liveSub, { status: 'active' }, { status: 'past_due' }));
  ok('a late "paid" while Stripe still shows the plan past due: the hold stays and nobody is thanked', row(U1).status === 'past_due' && mails.length === before);
  S.calls.length = 0;
  await hook(failed()); await hook(failed());
  ok('the same failed try sent again and again only asks Stripe about the bill, and tells nobody', S.calls.every((c) => c.m === 'GET') && mails.length === before, S.calls.map((c) => c.m + ' ' + c.p));
  liveSub.status = 'active'; inv.status = 'paid'; inv.amount_remaining = 0;
  await hook(subEvt('updated', liveSub, {}, { status: 'past_due' }));
  ok('the real "paid" lifts it', row(U1).status === 'active' && sent(/^Your payment went through$/).length === 1);
}
{ reset();
  T.customers.push({ id: U2, name: 'Gone Person', email: 'two@example.com', phone: '6235550122', status: 'canceled', stripe_customer_id: 'cus_gone', texts_visit: true });
  await hook(failedEvt({ customer: 'cus_gone' }));
  ok('a failed bill for a canceled customer leaves them canceled and sends nothing', row(U2).status === 'canceled' && mails.length === 0);
  row(U2).status = 'checkout';
  await hook(failedEvt({ customer: 'cus_gone' }));
  ok('a card refused in the sign up card form is not a failed bill: nobody is emailed', row(U2).status === 'checkout' && mails.length === 0);
  row(U2).status = 'canceled';
  ok('an event we do not use is answered and ignored', (await hook({ type: 'charge.succeeded', data: { object: {} } })) === 200 && (await hook({ type: 'checkout.session.completed', data: { object: { mode: 'payment' } } })) === 200);
}

/* ---------- forms that do not need a card ---------- */
head('Waitlist and sign up requests');
env = Object.assign({}, baseEnv, { FIRST_VISIT_FROM: '2027-03-10' });
{ reset();
  ok('waitlist with no name is refused', (await call('/api/waitlist', 'POST', { email: 'nope', zip: '85001' })).status === 400);
  ok('waitlist with a short phone is refused', (await call('/api/waitlist', 'POST', { name: 'Wendy Wait', phone: '623', address: '1 W Main St', zip: '85301' })).status === 400);
  ok('waitlist ok', (await call('/api/waitlist', 'POST', { name: 'Wendy Wait', phone: '(623) 555-0111', address: '1 W Main St', zip: '85301', texts: true })).status === 200 && sent(/^Waitlist: Wendy Wait, ZIP 85301$/).length === 1);
  // The form on the sign up page asks for a city and sends no ZIP. The office email names the city, not an empty ZIP.
  ok('a waitlist sign up with a city and no ZIP names the city in the subject', (await call('/api/waitlist', 'POST', { name: 'Cory City', phone: '6235550112', address: '9 E Oak St, Surprise', zip: '' })).status === 200
    && sent(/^Waitlist: Cory City, Surprise$/).length === 1 && /Address: 9 E Oak St, Surprise\n/.test(sent(/^Waitlist: Cory City/)[0].text), mails.map((x) => x.subject));
  // The sign up day is held at March 10, 2027, so the free month in the email ends April 10.
  const realNow = Date.now;
  Date.now = () => Date.parse('2027-03-10T09:30:00-07:00');
  let r;
  try { r = await call('/api/request', 'POST', Object.assign({}, good, { email: 'req@example.com', textsDeals: true })); } finally { Date.now = realNow; }
  const m = sent(/^New sign up request: Test Person/)[0];
  ok('a sign up request (checkout closed) emails the office the same billing words', r.status === 200 && !!m && /Billing they saw: \$0 today\. Then \$121 a month starting Apr 10\.\n/.test(m.text), m && m.text);
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
  await run('cancel on day 45, paid one full month', [9900], { min_end: String(now + 15 * 86400) }, 'none');
  await run('cancel on day 45 with only $56.47 paid (a plan from before bills had their own day)', [5647], { min_end: String(now + 15 * 86400) }, '4253');
  await run('cancel on day 55, paid over a month', [5647, 9900], { min_end: String(now + 5 * 86400) }, 'none');
  await run('no free month (they paid at sign up): a cancel in the first 60 days is never charged, even if nothing shows as paid', [], { min_end: String(now + 40 * 86400), no_free: '1' }, 'none');
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
  S.subMeta = null;

  // Joe, Nov 16, 2026 (late): when a paused customer comes back, the full month is charged on the day they come back,
  // and that day is their new bill day. No part month.
  // This customer pays $108 a month (every week, 2 dogs). The month they paid for runs out in 10 days: that is their bill day.
  const noon = (d) => Math.floor(new Date(d + 'T19:00:00Z').getTime() / 1000);
  const label = (unixS) => new Date(unixS * 1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'America/Phoenix' });
  const billDay = noon(az(10));
  const plan1 = () => { S.subs.sub_1 = { id: 'sub_1', object: 'subscription', status: 'active', customer: cus, pause_collection: null, trial_end: null, billing_cycle_anchor: billDay - 30 * 86400, latest_invoice: 'in_paid_1',
    metadata: { user_id: U1, pause_from: String(Math.floor(Date.now() / 1000) - 86400) }, items: { data: [{ current_period_end: billDay, price: { unit_amount: 10800 }, quantity: 1 }] }, form: new URLSearchParams() }; };
  const start = () => { plan1(); Object.assign(row(U1), { status: 'active', dogs: 2, pause_from: null, pause_until: null }); reset(); S.subPosts.length = 0; S.items.length = 0; S.made.length = 0; S.notes.length = 0; };
  const noBillByHand = () => S.items.length === 0 && S.made.length === 0 && !S.calls.some((c) => c.m === 'POST' && /^invoice(item)?s$/.test(c.p)) && !S.subPosts.some((x) => /billing_cycle_anchor|create_prorations|always_invoice/.test(x));
  start();
  r = await call('/api/me/plan', 'GET', null, 'good');
  ok('My Yard knows their next bill day, to say it next to the pause button', r.d.plan.canPause === true && r.d.plan.billDay === label(billDay) && r.d.plan.backCharge === null, r.d.plan);

  head('Pause that ends before the bill day: they are inside a month they paid for, so their bills do not change');
  r = await call('/api/me/pause', 'POST', { until: az(5) }, 'good'); await settle();
  ok('pause 5 days: Stripe only holds the plan until the day picked. No free time, no new bill day', r.status === 200 && S.subPosts.length === 1 && S.subPosts[0] === 'pause_collection%5Bbehavior%5D=void&pause_collection%5Bresumes_at%5D=' + noon(az(5))
    && row(U1).status === 'paused' && row(U1).pause_until === az(4) && r.d.plan.paused === true && r.d.plan.backCharge === null, [S.subPosts, r.d.plan]);
  { const o = sent(/^Paused: Test Person$/)[0], m = sent(/^Your visits are paused until /)[0];
    ok('the office is told their bills do not change', !!o && /Their pause ends before their next bill day \(.+\), so their bills do not change\./.test(o.text) && !/Trialing/.test(o.text), o && o.text);
    ok('the customer is told the same, with their next bill', !!m && m.to[0] === 'test@example.com' && m.subject === 'Your visits are paused until ' + label(noon(az(5))) && /Your bill day stays the same\. Your next bill is \$108 on /.test(m.text)
      && m.text.includes(label(billDay)) && /email-logo\.png/.test(m.html), m && m.text); }
  // Stripe lets go of the plan on the day. That is what tells us they are back.
  reset(); S.subs.sub_1.pause_collection = null;
  const letGo = () => subEvt('updated', S.subs.sub_1, {}, { pause_collection: { behavior: 'void', resumes_at: noon(az(5)) } });
  await hook(letGo());
  ok('the day comes: they are back, nothing is charged, and their bill day stays', row(U1).status === 'active' && row(U1).pause_until === null && noBillByHand() && S.subPosts.length === 1
    && /Nothing is charged today\. Your bill day stays the same\./.test((sent(/^Welcome back/)[0] || {}).text || '') && /Nothing is charged today\. Their bill day did not change\./.test((sent(/^Back from pause: Test Person$/)[0] || {}).text || ''), [row(U1).status, mails.map((x) => x.subject), S.subPosts]);
  { const n = mails.length; await hook(letGo()); ok('Stripe says it twice: nobody is told twice', mails.length === n); }
  // Or they tap "Start again now" first.
  start();
  await call('/api/me/pause', 'POST', { until: az(5) }, 'good'); await settle(); reset();
  r = await call('/api/me/resume', 'POST', {}, 'good'); await settle();
  ok('start again now, before the bill day: Stripe lets go of the plan, and nothing is charged', r.status === 200 && r.d.charged === false && S.subPosts[1] === 'pause_collection=' && row(U1).status === 'active' && row(U1).pause_until === null
    && noBillByHand() && sent(/^Welcome back/).length === 1 && sent(/^Back from pause/).length === 1, [S.subPosts, mails.map((x) => x.subject)]);
  { const n = mails.length; await hook(letGo()); ok('then Stripe’s own news of it lands: nobody is told twice', mails.length === n && row(U1).status === 'active'); }

  head('Pause that runs past the bill day: that bill is skipped, and the full month is charged the day they come back');
  start();
  r = await call('/api/me/pause', 'POST', { until: az(30) }, 'good'); await settle();
  const back = noon(az(30));
  ok('pause 30 days: Stripe is told one thing, free time until the day they come back, with no part month', r.status === 200 && S.subPosts.length === 1
    && S.subPosts[0] === 'trial_end=' + back + '&proration_behavior=none&metadata%5Bpause_until%5D=' + back + '&metadata%5Bpaid_until%5D=' + billDay && row(U1).status === 'paused' && row(U1).pause_until === az(29), S.subPosts);
  ok('Stripe now bills the full month on that day by itself, and it is the bill day from then on', S.subs.sub_1.status === 'trialing' && S.subs.sub_1.trial_end === back && S.subs.sub_1.billing_cycle_anchor === back && noBillByHand());
  ok('My Yard can say what happens when they come back', r.d.plan.paused === true && r.d.plan.backCharge.amount === '$108' && r.d.plan.backCharge.keepDay === label(billDay), r.d.plan);
  { const o = sent(/^Paused: Test Person$/)[0], m = sent(/^Your visits are paused until /)[0];
    ok('the office is told the bill is skipped, what is charged when, and why Stripe reads "Trialing"', !!o && o.text.includes('Their bill day (' + label(billDay) + ') falls inside the pause, so that bill is skipped. Stripe charges $108 on ' + label(back) + ', the day they come back. That day is their new bill day.')
      && o.text.includes('In Stripe this plan reads "Trialing" until ' + label(back) + '. That is the pause, not a free month.'), o && o.text);
    ok('the customer is told before it happens: nothing while paused, the full month on the day they come back, and the new bill day', !!m && m.text.includes('You pay nothing while you are paused. On ' + label(back) + ' we charge your card $108 for the month ahead. From then on, that day of the month is your bill day.')
      && /We start again on \w+day, /.test(m.text) && !/[–—]/.test(m.text), m && m.text); }
  reset();
  await hook(subEvt('updated', S.subs.sub_1, {}, { status: 'active', trial_end: null }));
  ok('Stripe’s news of that pause does not turn them into a free month customer: the row stays paused', row(U1).status === 'paused' && mails.length === 0, row(U1).status);
  r = await call('/api/me/plan', 'GET', null, 'good');
  ok('My Yard still shows the pause and what coming back costs', r.d.plan.paused === true && r.d.plan.canPause === false && r.d.plan.backCharge.amount === '$108', r.d.plan);
  ok('a paused plan cannot be paused again', (await call('/api/me/pause', 'POST', { until: az(40) }, 'good')).status === 400);
  // The day comes. Stripe ends the free time, makes one bill for the full month, and says the plan is active.
  reset(); S.subPosts.length = 0;
  S.invoices.in_back_day = { id: 'in_back_day', object: 'invoice', customer: cus, status: 'draft', billing_reason: 'subscription_cycle', amount_due: 10800, amount_remaining: 10800, metadata: {} };
  Object.assign(S.subs.sub_1, { status: 'active', latest_invoice: 'in_back_day' });
  const dayCame = () => subEvt('updated', S.subs.sub_1, {}, { status: 'trialing', latest_invoice: 'in_paid_1' });
  await at(az(30) + 'T19:00:05Z', () => hook(dayCame()));
  const nthDay = Number(az(30).slice(8)), nthWord = nthDay + (nthDay % 10 === 1 && nthDay !== 11 ? 'st' : nthDay % 10 === 2 && nthDay !== 12 ? 'nd' : nthDay % 10 === 3 && nthDay !== 13 ? 'rd' : 'th');
  ok('the day they come back: the row is active again', row(U1).status === 'active' && row(U1).pause_from === null && row(U1).pause_until === null);
  ok('the customer is told the full month is charged today and which day is their bill day now', /We charge your card \$108 today for the month ahead\. From now on, the \d+(st|nd|rd|th) is your bill day\./.test((sent(/^Welcome back/)[0] || {}).text || '')
    && sent(/^Welcome back/)[0].text.includes('the ' + nthWord + ' is your bill day') && /email-logo\.png/.test(sent(/^Welcome back/)[0].html), sent(/^Welcome back/).map((x) => x.text));
  ok('the office is told the same', (sent(/^Back from pause: Test Person$/)[0] || {}).text.includes('Stripe charges $108 today. The ' + nthWord + ' is their new bill day.'), sent(/^Back from pause/).map((x) => x.text));
  ok('this server charges nothing itself and never resets a bill day: Stripe made the one full month bill', noBillByHand() && !S.subPosts.some((x) => /trial_end|pause_collection/.test(x)), S.subPosts);
  ok('the first bill back is named plainly on the card statement, and the pause notes come off the plan', S.invoices.in_back_day.statement_descriptor === 'ARIZONA PET WASTE' && !S.subs.sub_1.metadata.pause_until && !S.subs.sub_1.metadata.paid_until, [S.invoices.in_back_day, S.subs.sub_1.metadata]);
  { const n = mails.length; S.subs.sub_1.metadata.pause_until = String(back); await hook(dayCame()); delete S.subs.sub_1.metadata.pause_until; ok('Stripe says it twice: nobody is told twice', mails.length === n); }
  // If that first bill back fails, it is a failed bill like any other.
  start(); await call('/api/me/pause', 'POST', { until: az(30) }, 'good'); await settle(); reset(); T.messages.length = 0;
  S.invoices.in_back_fail = { id: 'in_back_fail', object: 'invoice', customer: cus, status: 'open', amount_due: 10800, amount_remaining: 10800, attempt_count: 1, collection_method: 'charge_automatically', next_payment_attempt: Math.floor(Date.now() / 1000) + 3 * 86400, metadata: {} };
  await hook({ type: 'invoice.payment_failed', data: { object: S.invoices.in_back_fail } });
  ok('the first charge back fails: on hold, with the card email and the office alert', row(U1).status === 'past_due' && row(U1).pause_until === null && sent(/^Your card did not go through$/).length === 1 && sent(/^Card failed: Test Person, 123 W Test St \(\$108, try 1\)$/).length === 1, [row(U1).status, mails.map((x) => x.subject)]);
  delete S.invoices.in_back_fail;

  head('Back early from a pause that was set to run past the bill day');
  start(); await call('/api/me/pause', 'POST', { until: az(30) }, 'good'); await settle(); reset();
  r = await call('/api/me/resume', 'POST', {}, 'good'); await settle();
  ok('back before the old bill day: nothing is charged, and the old bill day is put back', r.status === 200 && r.d.charged === false && S.subPosts[1] === 'trial_end=' + billDay + '&proration_behavior=none&metadata%5Bpause_until%5D='
    && row(U1).status === 'active' && S.subs.sub_1.billing_cycle_anchor === billDay && /Nothing is charged today\. Your bill day stays the same\./.test(sent(/^Welcome back/)[0].text) && noBillByHand(), [S.subPosts, row(U1).status]);
  await hook(subEvt('updated', S.subs.sub_1, {}, { trial_end: back }));
  ok('Stripe still reads "trialing" until that bill day, but the row reads active: they are back', S.subs.sub_1.status === 'trialing' && row(U1).status === 'active');
  start(); await call('/api/me/pause', 'POST', { until: az(30) }, 'good'); await settle(); reset();
  r = await at(az(12) + 'T17:00:00Z', () => call('/api/me/resume', 'POST', {}, 'good')); await settle();
  ok('back after the old bill day: Stripe is told to end the free time now, so the full month is charged today and today is the bill day', r.status === 200 && r.d.charged === true
    && S.subPosts[1] === 'trial_end=now&proration_behavior=none&metadata%5Bpause_until%5D=&metadata%5Bpaid_until%5D=' && S.subs.sub_1.status === 'active' && row(U1).status === 'active' && noBillByHand(), [S.subPosts, r.d]);
  ok('and both are told', /We charge your card \$108 today for the month ahead\./.test(sent(/^Welcome back/)[0].text) && /Stripe charges \$108 today\./.test(sent(/^Back from pause/)[0].text), mails.map((x) => x.text));

  head('Pause: the locks');
  start(); S.subs.sub_1.status = 'trialing'; S.subs.sub_1.trial_end = noon(az(20));
  r = await call('/api/me/pause', 'POST', { until: az(30) }, 'good');
  ok('a plan still in its free month is never paused, so a pause cannot move the day a free month ends', r.status === 400 && S.subPosts.length === 0 && row(U1).status === 'active', [r.status, S.subPosts]);
  start(); row(U1).status = 'past_due';
  ok('a customer on hold for a failed card cannot pause', (await call('/api/me/pause', 'POST', { until: az(30) }, 'good')).status === 400 && S.subPosts.length === 0);
  start();
  ok('start again when nothing is paused is refused', (await call('/api/me/resume', 'POST', {}, 'good')).status === 400 && S.subPosts.length === 0);
  delete S.subs.sub_1; Object.assign(row(U1), { status: 'active', pause_from: null, pause_until: null });
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
  // If Stripe ever refuses the way we ask for the card form, it still loads, and the office can see why and what was used.
  const tryForm = async (refuse) => { T.customers.length = 0; T.errors.length = 0; S.refuse = refuse; const r = await call('/api/checkout', 'POST', good, 'good'); await settle(); S.refuse = []; return { r, f: r.d && S.sessions[r.d.session] && S.sessions[r.d.session].form }; };
  let x = await tryForm(['currency+list']);
  ok('if Stripe will not take a currency with the list, the card form is asked for again with no currency: still cards only, Link off', x.r.status === 200 && !x.f.has('currency') && x.f.get('allowed_payment_method_types[0]') === 'card' && x.f.get('wallet_options[link][display]') === 'never'
    && T.errors.length === 1 && /ways to pay/.test(T.errors[0].message) && /^Used: cards only, Link off, no currency\./.test(T.errors[0].detail), [x.r, T.errors]);
  x = await tryForm(['wallet_options']);
  ok('if Stripe refuses the Link switch, the card form is still cards only', x.r.status === 200 && x.f.get('allowed_payment_method_types[0]') === 'card' && !x.f.has('allowed_payment_method_types[1]') && !x.f.has('wallet_options[link][display]') && x.f.get('currency') === 'usd'
    && T.errors.length === 1 && /^Used: cards only \(Link may show\)\./.test(T.errors[0].detail), [x.r, T.errors]);
  x = await tryForm(['allowed_payment_method_types']);
  ok('if Stripe refuses the cards only list, Link is still off', x.r.status === 200 && !!x.r.d.clientSecret && !x.f.has('allowed_payment_method_types[0]') && x.f.get('wallet_options[link][display]') === 'never'
    && T.errors.length === 1 && /ways to pay/.test(T.errors[0].message) && /^Used: Link off/.test(T.errors[0].detail), [x.r, T.errors]);
  x = await tryForm(['allowed_payment_method_types', 'wallet_options']);
  ok('if Stripe refuses both, the card form still loads with the ways to pay that are on in the Dashboard, and the Health tab gets one note', x.r.status === 200 && !!x.r.d.clientSecret && !x.f.has('allowed_payment_method_types[0]') && !x.f.has('wallet_options[link][display]') && x.f.get('currency') === 'usd'
    && T.errors.length === 1 && /^Used: every way to pay that is on in the Stripe Dashboard\. Stripe said: stripe 400 Received unknown parameter/.test(T.errors[0].detail), [x.r, T.errors]);
  T.customers.length = 0; S.refuseAll = true;
  const broken = await call('/api/checkout', 'POST', good, 'good'); S.refuseAll = false;
  ok('if Stripe refuses the card form outright, the page gets an error, not a blank form', broken.status === 500 && !broken.d.clientSecret, broken);
  // A row left over from test mode: its Stripe customer id means nothing to the live keys.
  T.customers.length = 0; for (const k of Object.keys(S.subs)) delete S.subs[k];
  T.customers.push({ id: U1, email: 'test@example.com', status: 'checkout', stripe_customer_id: 'cus_from_test_mode', stripe_subscription_id: null });
  const again = await call('/api/checkout', 'POST', good, 'good');
  ok('a Stripe customer id from test mode is replaced by a new live one', again.status === 200 && /^cus_\d+$/.test(row(U1).stripe_customer_id) && S.sessions[again.d.session].customer === row(U1).stripe_customer_id, again);
  const src = fs.readFileSync(new URL('../src/worker/worker.js', import.meta.url), 'utf8');
  ok('the server never sends Stripe a billing day and never asks for a part month charge', !/billing_cycle_anchor(_config)?\s*:/.test(src) && !/create_prorations|always_invoice/.test(src) && !/trial_period_days/.test(src));
  ok('no key or test mode value is written into the server', !/[sprw]k_(test|live)_[A-Za-z0-9]{6,}/.test(src) && !/whsec_[A-Za-z0-9]{6,}/.test(src) && !/cs_test_/.test(src));
  ok('the webhook lives at /api/stripe-webhook', src.includes("path === '/api/stripe-webhook' && m === 'POST'"));
}

/* ---------- after the sale: no free month ---------- */
head('No free month: the first month is paid in the card form, and that day is the bill day');
{ // One month from now, counted the way Stripe counts a monthly bill (same clock time, last day of a short month).
  const monthOn = (d) => { const c = new Date(d.getTime()), dd = c.getUTCDate(); c.setUTCDate(1); c.setUTCMonth(c.getUTCMonth() + 1); c.setUTCDate(Math.min(dd, new Date(Date.UTC(c.getUTCFullYear(), c.getUTCMonth() + 1, 0)).getUTCDate())); return c; };
  const short = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Phoenix' });
  const nextDay = () => short(monthOn(new Date()));
  const wipe = () => { T.customers.length = 0; T.errors.length = 0; T.consent_log.length = 0; for (const k of Object.keys(S.subs)) delete S.subs[k]; for (const k of Object.keys(S.sessions)) delete S.sessions[k]; S.expired.length = 0; reset(); };
  env = Object.assign({}, baseEnv, SALE_OVER, { FIRST_VISIT_FROM: '2027-03-10' });
  wipe();
  ok('config tells the sign up page there is no free month', (await call('/api/config')).d.freeMonth === false);
  const before = nextDay();
  let r = await call('/api/checkout', 'POST', Object.assign({}, good, { plan: 'week', dogs: 3 }), 'good');
  let s = S.sessions[r.d.session], f = s.form;
  ok('the card form is Stripe’s own plan checkout, so the first month is charged in the form', r.status === 200 && r.d.free === false && f.get('mode') === 'subscription' && f.get('ui_mode') === 'embedded_page' && f.get('redirect_on_completion') === 'never', r);
  ok('the plan and one extra dog are on it at full price', f.get('line_items[0][price]') === 'price_apw_week_base' && f.get('line_items[0][quantity]') === '1' && f.get('line_items[1][price]') === 'price_apw_week_extra' && f.get('line_items[1][quantity]') === '1', String(f));
  ok('no free month, no billing day and no part month setting: Stripe charges the full month today and bills on this day each month', ![...f.keys()].some((k) => /trial|billing_cycle_anchor|proration/.test(k)), [...f.keys()]);
  ok('no field that Stripe refuses in plan checkout', ![...f.keys()].some((k) => /^(setup_intent_data|currency|payment_method_types|success_url|return_url)/.test(k)), [...f.keys()]);
  ok('cards only and Link off here too', f.get('allowed_payment_method_types[0]') === 'card' && !f.has('allowed_payment_method_types[1]') && f.get('wallet_options[link][display]') === 'never');
  ok('the plan will carry who it is for, the full first charge and the day pausing opens, and it is marked as no free month',
    f.get('subscription_data[metadata][user_id]') === U1 && f.get('subscription_data[metadata][no_free]') === '1' && f.get('subscription_data[metadata][first_charge]') === '12100' && f.get('subscription_data[metadata][plan]') === 'week'
    && f.get('subscription_data[metadata][dogs]') === '3' && day(Number(f.get('subscription_data[metadata][pause_from]'))) === '2027-05-09T19:00' && f.get('subscription_data[metadata][pause_from]') === s.metadata.pause_from
    && !f.has('subscription_data[metadata][free_end]') && !f.has('subscription_data[metadata][min_end]') && /Every week, 3 dogs, Buckeye/.test(f.get('subscription_data[description]')), String(f));
  const note = f.get('custom_text[submit][message]');
  ok('the note by the button says the price today, the price each month, and cancel anytime', [before, nextDay()].some((d) => note === '$121 today. Then $121 a month starting ' + d + '. Cancel anytime in My Yard.'), note);
  ok('the session is tied to the signed in person and the row waits at the card step', f.get('client_reference_id') === U1 && f.get('customer') === row(U1).stripe_customer_id && row(U1).status === 'checkout');

  // The card is refused: Stripe has a plan, but its first payment has not gone through.
  const refused = payNow(s.id, 'incomplete');
  ok('a plan whose first payment has not gone through changes nothing', (await hook(subEvt('created', refused))) === 200 && row(U1).status === 'checkout' && row(U1).stripe_subscription_id == null && mails.length === 0);
  ok('the page asking about a card form that is not done starts nothing', (await call('/api/checkout/done', 'POST', { session: s.id }, 'good')).d.booked === false && row(U1).status === 'checkout');
  ok('when that plan runs out unpaid the row still waits at the card step: no cancel, no email, visits untouched',
    (await hook(subEvt('updated', refused, { status: 'incomplete_expired' }))) === 200 && (await hook(subEvt('deleted', refused, { status: 'incomplete_expired' }))) === 200 && row(U1).status === 'checkout' && mails.length === 0 && deleted.length === 0, [row(U1).status, mails.length]);
  delete S.subs[refused.id];

  // The card goes through.
  let sub = payNow(s.id);
  reset();
  ok('Stripe says the card form is done and paid: the webhook books them', (await hook(paidEvt(s.id))) === 200 && row(U1).status === 'active' && row(U1).stripe_subscription_id === sub.id && row(U1).plan === 'week' && row(U1).dogs === 3, row(U1));
  ok('the server makes no plan of its own: Stripe made it in the card form', !S.calls.some((c) => c.m === 'POST' && c.p === 'subscriptions'));
  { const cust = S.customers[row(U1).stripe_customer_id];
    const toCust = S.calls.findIndex((c) => c.m === 'POST' && c.p.startsWith('customers/') && c.f.get('invoice_settings[default_payment_method]') === s.card);
    const offPlan = S.calls.findIndex((c) => c.m === 'POST' && c.p === 'subscriptions/' + sub.id && c.f.has('default_payment_method') && c.f.get('default_payment_method') === '');
    ok('the card moves onto the customer and off the plan, the customer first (so a card changed in My Yard later is the card that pays)', cust.invoice_settings.default_payment_method === s.card && sub.default_payment_method === null && toCust >= 0 && offPlan > toCust, [toCust, offPlan]); }
  { const o = sent(/^New booking: Test Person/), hi = sent(/^You are booked/)[0];
    ok('the office gets one new booking email that says they paid today', o.length === 1 && [before, nextDay()].some((d) => o[0].text.includes('Billing: $121 today. Then $121 a month starting ' + d + '.\n')), o.map((m) => m.text));
    ok('the welcome says the card was charged, when the next bill comes, and cancel anytime', sent(/^You are booked/).length === 1 && [before, nextDay()].some((d) => hi.text.includes('Your card was charged. $121 today. Then $121 a month starting ' + d + '.\n'))
      && hi.text.includes('You can cancel anytime in My Yard.\n') && !/you pay for one month|free month|\$0 today|did not charge/.test(hi.text), hi && hi.text); }
  ok('the first bill is already paid, so there is no first bill to look at', !S.calls.some((c) => c.p === 'invoices/create_preview') && sent(/^CHECK BILLING/).length === 0);
  { const n = mails.length; S.calls.length = 0;
    const d = await call('/api/checkout/done', 'POST', { session: s.id }, 'good'); await settle();
    ok('the same event again, the page reporting in and the plan events change nothing more', (await hook(paidEvt(s.id))) === 200 && d.d.booked === true && (await hook(subEvt('created', sub))) === 200 && (await hook(subEvt('updated', sub))) === 200
      && mails.length === n && row(U1).status === 'active' && !S.calls.some((c) => c.m === 'POST' && (c.p === 'subscriptions' || c.p.startsWith('customers/'))), S.calls.filter((c) => c.m === 'POST').map((c) => c.p));
    ok('someone else cannot finish this sign up', (await call('/api/checkout/done', 'POST', { session: s.id }, 'two')).status === 403);
    ok('a booked customer who opens sign up again is told they have a plan', (await call('/api/checkout', 'POST', good, 'good')).d.already === true); }

  // The other orders: the page first, then the plan event first.
  wipe();
  r = await call('/api/checkout', 'POST', Object.assign({}, good, { plan: 'eow', dogs: 1 }), 'two'); s = S.sessions[r.d.session]; sub = payNow(s.id); reset();
  { const d = await call('/api/checkout/done', 'POST', { session: s.id }, 'two'); await settle();
    ok('the sign up page books them when the webhook is late', d.status === 200 && d.d.booked === true && row(U2).status === 'active' && row(U2).stripe_subscription_id === sub.id && sent(/^You are booked/).length === 1 && sub.default_payment_method === null, d);
    ok('one or two dogs: one line, the full $75', s.form.get('line_items[0][price]') === 'price_apw_eow_base' && !s.form.has('line_items[1][price]') && s.form.get('subscription_data[metadata][first_charge]') === '7500');
    ok('then the webhook lands: still one welcome', (await hook(paidEvt(s.id))) === 200 && sent(/^You are booked/).length === 1 && sent(/^New booking/).length === 1); }
  wipe();
  r = await call('/api/checkout', 'POST', good, 'good'); s = S.sessions[r.d.session]; sub = payNow(s.id); reset();
  ok('Stripe’s plan event can book them first, and the card is moved then too', (await hook(subEvt('updated', sub, {}, { status: 'incomplete' }))) === 200 && row(U1).status === 'active' && row(U1).stripe_subscription_id === sub.id && sent(/^You are booked/).length === 1
    && S.customers[row(U1).stripe_customer_id].invoice_settings.default_payment_method === s.card && sub.default_payment_method === null, [row(U1).status, sub.default_payment_method]);
  ok('then the checkout event adds nothing', (await hook(paidEvt(s.id))) === 200 && sent(/^You are booked/).length === 1 && sent(/^New booking/).length === 1);

  // A prepaid card is still flagged.
  wipe();
  S.funding = 'prepaid'; r = await call('/api/checkout', 'POST', good, 'good'); S.funding = 'credit'; s = S.sessions[r.d.session]; sub = payNow(s.id); reset();
  await hook(paidEvt(s.id));
  ok('a prepaid card is flagged for the office', sent(/^Prepaid card: Test Person/).length === 1 && sent(/^PREPAID CARD\. New booking/).length === 1);

  // A new customer has no sign in (no email code at sign up). The paid path works the same for them.
  wipe(); authCalls.length = 0;
  r = await call('/api/checkout', 'POST', Object.assign({}, good, { email: 'paid@example.com', plan: 'twice', dogs: 2 }));
  { const nid = AUTH['paid@example.com'] && AUTH['paid@example.com'].id;
    s = S.sessions[r.d.session];
    ok('a new email with no sign in gets the pay today card form, and no session', r.status === 200 && r.d.free === false && !r.d.auth && !!nid && s.form.get('mode') === 'subscription' && s.form.get('client_reference_id') === nid
      && s.form.get('line_items[0][price]') === 'price_apw_twice_base' && authCalls.includes('create paid@example.com'), r.d);
    sub = payNow(s.id); reset();
    const d = await call('/api/checkout/done', 'POST', { session: s.id }); await settle();
    const c = T.customers.find((x) => x.id === nid), hi = sent(/^You are booked/)[0];
    ok('the page finishes it with the card form id and no sign in: booked, card on the customer', d.status === 200 && d.d.booked === true && c.status === 'active' && c.stripe_subscription_id === sub.id
      && S.customers[c.stripe_customer_id].invoice_settings.default_payment_method === s.card && sub.default_payment_method === null, [d, c && c.status]);
    ok('their welcome email has the My Yard link and says the card was charged', !!hi && hi.to[0] === 'paid@example.com' && /\/account\/\?k=/.test(hi.text) && /Your card was charged\. \$189 today\. Then \$189 a month starting /.test(hi.text), hi && hi.text); }

  // One plan for one customer.
  wipe();
  const a1 = await call('/api/checkout', 'POST', good, 'good'), a2 = await call('/api/checkout', 'POST', Object.assign({}, good, { plan: 'eow' }), 'good');
  ok('a second card form closes the one before it, so two tabs cannot both be paid', a1.status === 200 && a2.status === 200 && a1.d.session !== a2.d.session && S.sessions[a1.d.session].status === 'expired' && S.sessions[a2.d.session].status === 'open' && S.expired.join() === a1.d.session, S.expired);
  S.failExpire = true; T.errors.length = 0;
  const a3 = await call('/api/checkout', 'POST', good, 'good'); await settle(); S.failExpire = false;
  ok('if the older card form cannot be closed, the new one still opens and the Health tab gets a note', a3.status === 200 && !!a3.d.clientSecret && T.errors.length === 1 && /older card form/.test(T.errors[0].message), [a3, T.errors]);
  payNow(a3.d.session); S.calls.length = 0;
  const a4 = await call('/api/checkout', 'POST', good, 'good');
  ok('a plan that is paid in Stripe but not booked yet is their plan: no second card form', a4.status === 200 && a4.d.already === true && !S.calls.some((c) => c.m === 'POST' && c.p === 'checkout/sessions'), a4);

  // The home rule is about the free month. With no free month, a home that had a plan before can sign up and pay.
  wipe();
  T.customers.push({ id: 'other', phone: '0000000000', address: '4321 West Example Street', zip: good.zip, stripe_subscription_id: 'sub_old', status: 'canceled' });
  r = await call('/api/checkout', 'POST', Object.assign({}, good, { address: '4321 W. Example St' }), 'good');
  ok('a home that had a plan before can sign up again when there is no free month to give', r.status === 200 && r.d.free === false && S.sessions[r.d.session].form.get('mode') === 'subscription', r);

  // Our side fails after they paid: the office gets the right words, and the retry books them.
  wipe();
  r = await call('/api/checkout', 'POST', good, 'good'); s = S.sessions[r.d.session]; sub = payNow(s.id); reset(); T.errors.length = 0;
  blip.patch = 1;
  { const st = await hook(paidEvt(s.id)); const a = sent(/^ACTION NEEDED: paid at sign up but not booked yet: Test Person$/);
    ok('paid, then the database has a blip: Stripe is told to send the event again and the office is told they paid', st === 500 && row(U1).status === 'checkout' && a.length === 1 && /They were charged, and their plan is in Stripe/.test(a[0].text)
      && /do not charge them again/.test(a[0].text) && /Free month: none/.test(a[0].text) && !/They were not charged/.test(a[0].text), mails.map((m) => m.subject));
    await settle();
    ok('the Health tab line says they paid', T.errors.some((e) => /^Paid at sign up but not booked yet \(cs_test_\d+\)\./.test(e.message)), T.errors.slice(-2));
    mails.length = 0;
    ok('the retry books them', (await hook(paidEvt(s.id))) === 200 && row(U1).status === 'active' && sent(/^You are booked/).length === 1 && sent(/^ACTION NEEDED/).length === 0); }
  wipe();
  r = await call('/api/checkout', 'POST', good, 'good'); s = S.sessions[r.d.session]; sub = payNow(s.id); reset(); T.errors.length = 0;
  S.failCardMove = true;
  { const st = await hook(paidEvt(s.id)); await settle(); S.failCardMove = false;
    ok('if the card cannot be taken off the plan the booking still goes through, and the Health tab says what to look at', st === 200 && row(U1).status === 'active' && sent(/^You are booked/).length === 1 && sub.default_payment_method === s.card
      && T.errors.length === 1 && /could not be moved onto the customer/.test(T.errors[0].message), [st, T.errors]); }

  // The sale switch.
  wipe();
  env = Object.assign({}, baseEnv, { FIRST_VISIT_FROM: '2027-03-10' });
  r = await call('/api/checkout', 'POST', Object.assign({}, good, { noFree: true }), 'good');
  ok('while the sale is on, staff can turn the free month down to try the pay today path (/book/?nofree=1)', r.status === 200 && r.d.free === false && S.sessions[r.d.session].form.get('mode') === 'subscription', r);
  wipe();
  env = Object.assign({}, baseEnv, SALE_OVER, { FIRST_VISIT_FROM: '2027-03-10' });
  r = await call('/api/checkout', 'POST', Object.assign({}, good, { noFree: false, free: true, freeMonth: true }), 'good');
  ok('after the sale nothing a page sends brings the free month back', r.status === 200 && r.d.free === false && S.sessions[r.d.session].form.get('mode') === 'subscription' && !S.sessions[r.d.session].form.has('subscription_data[trial_end]'), r);
  { const wsrc = fs.readFileSync(new URL('../src/worker/worker.js', import.meta.url), 'utf8'), bsrc = fs.readFileSync(new URL('./build.mjs', import.meta.url), 'utf8');
    const a = /const FREE_MONTH_UNTIL = '([^']+)'/.exec(wsrc), b = /const DEAL_END = '([^']+)'/.exec(bsrc);
    ok('checkout stops giving the free month at the moment the site stops offering it (DEAL_END in build.mjs)', !!a && !!b && a[1] === b[1], [a && a[1], b && b[1]]);
    env = Object.assign({}, baseEnv); delete env.FREE_MONTH_UNTIL;
    ok('with nothing set in Cloudflare, that date decides', (await call('/api/config')).d.freeMonth === (Date.now() <= Date.parse(a[1])));
    env = Object.assign({}, baseEnv, { FREE_MONTH_UNTIL: 'next tuesday' });
    ok('a date nobody can read is ignored, not taken as "sale over"', (await call('/api/config')).d.freeMonth === (Date.now() <= Date.parse(a[1])));
    env = Object.assign({}, baseEnv, { FREE_MONTH_UNTIL: new Date(Date.now() + 3600e3).toISOString() });
    const on = (await call('/api/config')).d.freeMonth;
    env = Object.assign({}, baseEnv, { FREE_MONTH_UNTIL: new Date(Date.now() - 3600e3).toISOString() });
    ok('the day can be moved in Cloudflare with FREE_MONTH_UNTIL', on === true && (await call('/api/config')).d.freeMonth === false); }
  // A sign up request while checkout is closed says what they would pay.
  env = Object.assign({}, baseEnv, SALE_OVER, { FIRST_VISIT_FROM: '2027-03-10' }); reset();
  { const b4 = nextDay(); await call('/api/request', 'POST', Object.assign({}, good, { email: 'req2@example.com' })); const m = sent(/^New sign up request: Test Person/)[0];
    ok('a sign up request after the sale tells the office the pay today words', !!m && [b4, nextDay()].some((d) => m.text.includes('Billing they saw: $121 today. Then $121 a month starting ' + d + '.\n')), m && m.text); }
  env = Object.assign({}, baseEnv); wipe();
}

/* ---------- Facebook and Instagram lead forms ---------- */
head('Facebook lead forms: Meta checks the address, sends a signed notice, and the lead reaches the office');
{ const FORM = '1537873488145115', L1 = '900000000000001', L2 = '900000000000002', L3 = '900000000000003', L4 = '900000000000004', L5 = '900000000000005';
  const leadEnv = (over) => Object.assign({}, baseEnv, { META_APP_SECRET: 'appsecret_test_1', META_VERIFY_TOKEN: 'verify_word_12345', META_PAGE_TOKEN: G.pageTok }, over || {});
  const sentAt = Math.floor(Date.parse('2026-11-17T06:40:00Z') / 1000);
  const notice = (...ids) => ({ object: 'page', entry: [{ id: G.page.id, time: sentAt, changes: ids.map((id) => ({ field: 'leadgen', value: { leadgen_id: id, page_id: G.page.id, form_id: FORM, adgroup_id: '120200000000000111', ad_id: '120200000000000111', created_time: sentAt } })) }] });
  const leadHook = async (o, opt = {}) => {
    const raw = typeof o === 'string' ? o : JSON.stringify(o);
    const sig = 'sig' in opt ? opt.sig : 'sha256=' + crypto.createHmac('sha256', opt.secret || env.META_APP_SECRET || 'no secret').update(raw).digest('hex');
    const r = await worker.fetch(new Request('https://arizonapetwaste.com/api/meta/leadgen', { method: 'POST', body: raw, headers: Object.assign({ 'content-type': 'application/json' }, sig ? { 'x-hub-signature-256': sig } : {}) }), env, ctx);
    await settle();
    let d = null; try { d = await r.json(); } catch (e) { }
    return { status: r.status, d };
  };
  const raw = async (path) => { const r = await worker.fetch(new Request('https://arizonapetwaste.com' + path), env, ctx); await settle(); return { status: r.status, text: await r.text(), type: r.headers.get('content-type') || '' }; };
  const fbLeads = () => T.leads.filter((l) => /Meta lead id \d+$/.test(l.details || ''));
  const clear = () => { reset(); T.leads.length = 0; T.errors.length = 0; G.calls.length = 0; G.subPosts.length = 0; };
  G.forms[FORM] = 'Free month lead form';
  G.leads[L1] = { id: L1, created_time: '2026-11-17T06:40:12+0000', ad_id: '120200000000000111', ad_name: 'Free month video 1', adset_id: '120200000000000222', adset_name: 'Buckeye homeowners', campaign_id: '120200000000000333', campaign_name: 'Black Friday free month',
    form_id: FORM, platform: 'fb', is_organic: false, custom_disclaimer_responses: [{ checkbox_key: 'ok_to_call_me', is_checked: '1' }],
    field_data: [{ name: 'full_name', values: ['Dana Lopez'] }, { name: 'phone_number', values: ['+16235550142'] }, { name: 'email', values: ['Dana.Lopez@Example.com'] }, { name: 'street_address', values: ['4321 N Verrado Way'] },
      { name: 'city', values: ['Buckeye'] }, { name: 'zip_code', values: ['85396'] }, { name: 'how_many_dogs_do_you_have?', values: ['2'] }, { name: 'how_often_should_we_come?', values: ['Every week'] }] };
  G.leads[L2] = { id: L2, created_time: '2026-11-17T06:41:00+0000', form_id: FORM, platform: 'ig', is_organic: false, ad_id: '120200000000000111', ad_name: 'Free month video 1', campaign_name: 'Black Friday free month',
    field_data: [{ name: 'first_name', values: ['Sam'] }, { name: 'last_name', values: ['Reyes'] }, { name: 'phone_number', values: ['(623) 555-0177'] }, { name: 'email', values: ['sam@example.com'] }, { name: 'what_is_your_zip_code?', values: ['85338'] }] };
  G.leads[L3] = { id: L3, created_time: '2026-11-17T06:42:00+0000', form_id: FORM, platform: 'fb', is_organic: true,
    field_data: [{ name: 'full_name', values: ['<test lead: dummy data for full_name>'] }, { name: 'phone_number', values: ['<test lead: dummy data for phone_number>'] }, { name: 'email', values: ['test@fb.com'] }] };
  G.leads[L4] = { id: L4, created_time: '2026-11-17T06:43:00+0000', form_id: FORM, platform: 'fb', is_organic: false, field_data: [{ name: 'full_name', values: ['Lee Park'] }, { name: 'phone_number', values: ['6235550188'] }] };
  G.leads[L5] = { id: L5, created_time: '2026-11-17T06:44:00+0000', form_id: FORM, platform: 'fb', is_organic: false, field_data: [{ name: 'full_name', values: ['Pat Moss'] }, { name: 'phone_number', values: ['+44 20 7946 0958'] }] };

  // 1. Not set up yet.
  env = Object.assign({}, baseEnv); clear();
  ok('the health check says lead forms are not set up, and shows no token', (await call('/api/health')).d.leads === false);
  ok('with no verify token set, Meta’s check of the address is refused', (await raw('/api/meta/leadgen?hub.mode=subscribe&hub.verify_token=verify_word_12345&hub.challenge=1158201444')).status === 403);
  let r = await leadHook(notice(L1));
  ok('with no app secret a notice is not trusted: 503 so Meta sends it again, nothing saved, nothing emailed, one line for the Health tab', r.status === 503 && fbLeads().length === 0 && mails.length === 0 && G.calls.length === 0
    && T.errors.filter((e) => /META_APP_SECRET is not set/.test(e.message)).length === 1, [r, T.errors]);

  // 2. Meta checks the address.
  env = leadEnv(); clear();
  const h = await call('/api/health');
  ok('with the three settings in, the health check reads leads: true and still shows no secret', h.d.leads === true && !/appsecret_test|verify_word|PAGE_TOKEN_abc/.test(JSON.stringify(h.d)), h.d);
  ok('no lead setting reaches the sign up page', !/appsecret_test|verify_word|PAGE_TOKEN_abc/.test(JSON.stringify((await call('/api/config')).d)));
  r = await raw('/api/meta/leadgen?hub.mode=subscribe&hub.verify_token=wrong_word&hub.challenge=1158201444');
  ok('a wrong verify token is refused', r.status === 403 && !r.text.includes('1158201444'), r);
  r = await raw('/api/meta/leadgen?hub.mode=subscribe&hub.verify_token=verify_word_12345&hub.challenge=1158201444');
  ok('the right verify token gets the number said back as plain text, which is what Meta wants', r.status === 200 && r.text === '1158201444' && /^text\/plain/.test(r.type), r);
  ok('that check also sets the Page to send its leads to this app, and tells the office it is connected', G.subPosts.length === 1 && G.subPosts[0] === 'leadgen' && G.subs[0].subscribed_fields.includes('leadgen')
    && sent(/^Facebook leads are connected to the site$/).length === 1 && /Page: Arizona Pet Waste \(104000000000001\)/.test(sent(/^Facebook leads are connected/)[0].text) && sent(/^Facebook leads are connected/)[0].to[0] === 'info@arizonapetwaste.com', [G.subPosts, mails.map((x) => x.subject)]);
  ok('nothing the office is sent holds a token or the app secret', !/PAGE_TOKEN_abc|SYSUSER_TOKEN|appsecret_test|verify_word/.test(JSON.stringify(mails)));
  r = await raw('/api/meta/leadgen?hub.mode=subscribe&hub.verify_token=verify_word_12345&hub.challenge=%3Cscript%3E');
  ok('a challenge that is not a plain number is not said back', r.status === 200 && r.text === '', r);

  // 3. A person checks the setup from a browser.
  clear();
  r = await call('/api/meta/leadgen?check=verify_word_12345');
  ok('the setup check: all three settings, the Page, the app, and leads switched on', r.status === 200 && r.d.ok === true && r.d.appSecret && r.d.verifyToken && r.d.pageToken && r.d.page.name === 'Arizona Pet Waste' && r.d.app.name === 'APW site leads' && r.d.subscribed === true && r.d.note === '', r.d);
  ok('the Page was already sending leads, so it is not set again', G.subPosts.length === 0, G.subPosts);
  ok('the setup check is refused without the verify token', (await call('/api/meta/leadgen?check=nope')).status === 403 && (await call('/api/meta/leadgen')).status === 403);
  G.subs = [{ id: G.app.id, name: G.app.name, subscribed_fields: ['messages', 'feed'] }, { id: '555', name: 'Some other app', subscribed_fields: ['leadgen'] }];
  r = await call('/api/meta/leadgen?check=verify_word_12345');
  ok('an app that already listens for other things on the Page keeps them: leads are added, nothing is dropped', r.d.ok === true && G.subPosts.length === 1 && G.subPosts[0] === 'messages,feed,leadgen', G.subPosts);
  env = leadEnv({ META_PAGE_TOKEN: G.userTok }); G.subs = []; G.subPosts.length = 0;
  r = await call('/api/meta/leadgen?check=verify_word_12345');
  ok('a system user token works too: the server finds the Page it can act for and uses that Page’s own token', r.d.ok === true && r.d.page.id === G.page.id && G.subPosts.length === 1 && G.subs[0].subscribed_fields.join() === 'leadgen', [r.d, G.subPosts]);
  G.accounts = [{ id: '1', name: 'Other Page', access_token: 'x' }, { id: '2', name: 'Second Page', access_token: 'y' }];
  r = await call('/api/meta/leadgen?check=verify_word_12345');
  ok('a token for several Pages, none of them ours: it says to set META_PAGE_ID and changes nothing', r.d.ok === false && /META_PAGE_ID/.test(r.d.note) && G.subPosts.length === 1, r.d);
  G.accounts = [];
  r = await call('/api/meta/leadgen?check=verify_word_12345');
  ok('a token with no Page says so', r.d.ok === false && /cannot act for any Page/.test(r.d.note), r.d);
  G.accounts = null; G.noMeta = true; G.subs = []; env = leadEnv();
  r = await call('/api/meta/leadgen?check=verify_word_12345');
  ok('a token that may not change the Page says which right is missing', r.d.ok === false && r.d.subscribed === false && /pages_manage_metadata/.test(r.d.note), r.d);
  G.noMeta = false; G.dead = true;
  r = await call('/api/meta/leadgen?check=verify_word_12345');
  ok('a dead token says so in plain words', r.d.ok === false && /has ended or is not valid/.test(r.d.note) && !/PAGE_TOKEN_abc|SYSUSER_TOKEN/.test(JSON.stringify(r.d)), r.d);
  G.dead = false;
  env = leadEnv({ META_PAGE_TOKEN: '' });
  r = await call('/api/meta/leadgen?check=verify_word_12345');
  ok('no token yet says so', r.d.ok === false && r.d.pageToken === false && /META_PAGE_TOKEN is not set/.test(r.d.note), r.d);
  env = leadEnv({ META_APP_SECRET: '' });
  r = await call('/api/meta/leadgen?check=verify_word_12345');
  ok('no app secret yet says so', r.d.ok === false && r.d.appSecret === false && /META_APP_SECRET is not set/.test(r.d.note), r.d);

  // 4. A real lead.
  env = leadEnv(); clear(); G.subs = [{ id: G.app.id, name: G.app.name, subscribed_fields: ['leadgen'] }];
  r = await leadHook(notice(L1), { sig: '' });
  ok('a notice with no signature is refused', r.status === 401 && fbLeads().length === 0 && mails.length === 0 && G.calls.length === 0, r);
  r = await leadHook(notice(L1), { secret: 'some_other_secret' });
  ok('a notice signed with another secret is refused, with one line for the Health tab', r.status === 401 && fbLeads().length === 0 && mails.length === 0 && T.errors.filter((e) => /signature does not match META_APP_SECRET/.test(e.message)).length === 1, [r, T.errors]);
  r = await leadHook('{"object":"page","entry":[', {});
  ok('a signed notice that is not whole is refused', r.status === 400, r);
  r = await leadHook({ object: 'user', entry: [{ id: '1', changes: [{ field: 'leadgen', value: { leadgen_id: L1 } }] }] });
  ok('a signed notice about something that is not a Page is taken and nothing is done', r.status === 200 && r.d.leads === 0 && fbLeads().length === 0 && mails.length === 0, r);
  T.errors.length = 0;
  r = await leadHook(notice(L1));
  const row1 = fbLeads()[0], m1 = sent(/^New Facebook lead: Dana Lopez, Buckeye 85396$/)[0];
  ok('a signed lead notice: 200, and the lead is read from Meta with the Page token and the lead id', r.status === 200 && r.d.leads === 1 && G.calls[0].path === L1 && G.calls[0].tok === G.pageTok && /field_data/.test(G.calls[0].fields) && G.calls[0].version === 'v26.0', [r, G.calls]);
  ok('the office email has every answer, the form, the ad, the campaign, the time in Arizona and the lead id', !!m1 && m1.to[0] === 'info@arizonapetwaste.com'
    && ['Name: Dana Lopez', 'Mobile: +16235550142', 'Email: Dana.Lopez@Example.com', 'Street address: 4321 N Verrado Way', 'City: Buckeye', 'ZIP: 85396', 'How many dogs do you have: 2', 'How often should we come: Every week',
      'Checked the box "ok to call me": yes', 'Form: Free month lead form (' + FORM + ')', 'Ad: Free month video 1', 'Ad set: Buckeye homeowners', 'Campaign: Black Friday free month', 'Sent: Nov 16, 11:40 PM Arizona time', 'Lead id: ' + L1].every((x) => m1.text.includes(x + '\n')), m1 && m1.text);
  ok('the lead is saved for the office app: name, mobile as 10 numbers, email, address, ZIP, and the rest in the details', !!row1 && fbLeads().length === 1 && row1.kind === 'signup_request' && row1.name === 'Dana Lopez' && row1.phone === '6235550142'
    && row1.email === 'dana.lopez@example.com' && row1.address === '4321 N Verrado Way, Buckeye' && row1.zip === '85396' && row1.status === 'new'
    && row1.details === 'Facebook lead ad. How many dogs do you have: 2. How often should we come: Every week. Checked the box "ok to call me": yes. Form: Free month lead form. Ad: Free month video 1. Campaign: Black Friday free month. Meta lead id ' + L1, row1);
  ok('one lead, one email, and nothing for the Health tab', mails.length === 1 && T.errors.length === 0, [mails.map((x) => x.subject), T.errors]);
  ok('no token, secret or verify word is in the row, the email or the answer', !/PAGE_TOKEN_abc|SYSUSER_TOKEN|appsecret_test|verify_word/.test(JSON.stringify([T.leads, mails, r.d])));
  r = await leadHook(notice(L1));
  ok('the same notice again (Meta does that): 200, no second row, no second email, and Meta is not asked again', r.status === 200 && fbLeads().length === 1 && mails.length === 1 && G.calls.filter((c) => c.path === L1).length === 1, [r, mails.length]);

  // 5. Instagram, a split name, a ZIP asked in the form's own words, two leads in one notice, and other Page news.
  clear();
  const two = notice(L2, L4); two.entry[0].changes.splice(1, 0, { field: 'feed', value: { item: 'post', verb: 'add' } }); two.entry[0].changes.push(two.entry[0].changes[0]);
  r = await leadHook(two);
  const row2 = fbLeads().find((l) => l.name === 'Sam Reyes'), row4 = fbLeads().find((l) => l.name === 'Lee Park');
  ok('two leads in one notice, with other Page news and a repeat mixed in: two rows, two emails', r.status === 200 && r.d.leads === 2 && fbLeads().length === 2 && mails.length === 2, [r, fbLeads().length, mails.map((x) => x.subject)]);
  ok('an Instagram lead says Instagram, and first and last name are put together', !!row2 && row2.phone === '6235550177' && row2.zip === '85338' && /^Instagram lead ad\. /.test(row2.details) && sent(/^New Instagram lead: Sam Reyes, 85338$/).length === 1
    && /from an Instagram ad form/.test(sent(/^New Instagram lead/)[0].text), [row2, mails.map((x) => x.subject)]);
  ok('a lead with only a name and a mobile is fine', !!row4 && row4.phone === '6235550188' && row4.email === null && row4.zip === null && sent(/^New Facebook lead: Lee Park$/).length === 1, row4);
  clear();
  r = await leadHook(notice(L5));
  ok('a mobile that is not 10 numbers is kept as typed in the details and the email', r.status === 200 && fbLeads()[0].phone === null && /Mobile: \+44 20 7946 0958\./.test(fbLeads()[0].details) && /Mobile: \+44 20 7946 0958\n/.test(mails[0].text), fbLeads()[0]);

  // 6. Meta's testing tool and the Test button.
  clear();
  r = await leadHook(notice(L3));
  ok('a lead made with Meta’s testing tool is saved and emailed as a test', r.status === 200 && sent(/^Test lead from Facebook: the lead link works$/).length === 1 && /This is a test lead from Meta’s testing tool/.test(mails[0].text) && /Paid ad: no\./.test(mails[0].text)
    && /Test lead from Meta’s testing tool\./.test(fbLeads()[0].details) && fbLeads()[0].phone === null, [mails.map((x) => x.subject), fbLeads()[0]]);
  clear();
  r = await leadHook({ object: 'page', entry: [{ id: '0', time: sentAt, changes: [{ field: 'leadgen', value: { ad_id: '444444444', form_id: '444444444444', leadgen_id: '444444444444', created_time: sentAt, page_id: '444444444444', adgroup_id: '44444444444' } }] }] });
  ok('the Test button on the Meta app’s Webhooks page sends a made up lead: 200, no row, Meta is not asked, and the office is told the notice arrived', r.status === 200 && fbLeads().length === 0 && G.calls.length === 0 && sent(/^Facebook leads: Meta’s test notice reached the site$/).length === 1, [r, mails.map((x) => x.subject)]);

  // 7. A system user token in Cloudflare: the server gets the Page's own token from Meta and reads the lead with it.
  env = leadEnv({ META_PAGE_TOKEN: G.userTok }); clear();
  r = await leadHook(notice(L1));
  ok('with a system user token the lead is still read: the server asks Meta for the Page’s token once', r.status === 200 && fbLeads().length === 1 && fbLeads()[0].name === 'Dana Lopez' && mails.length === 1
    && G.calls.some((c) => c.path === G.page.id && c.fields === 'access_token' && c.tok === G.userTok) && G.calls.some((c) => c.path === L1 && c.tok === G.pageTok), G.calls);
  clear();
  r = await leadHook(notice(L4));
  ok('the next lead goes straight to the Page’s token', r.status === 200 && G.calls[0].path === L4 && G.calls[0].tok === G.pageTok && !G.calls.some((c) => c.fields === 'access_token'), G.calls);

  // 8. The token may not read the ad's name.
  env = leadEnv(); clear(); G.noAds = true;
  r = await leadHook(notice(L1));
  ok('a token with no ad rights still gets the lead: the answers are all there and the ad shows by its id', r.status === 200 && fbLeads().length === 1 && /Name: Dana Lopez\n/.test(mails[0].text) && /Ad: 120200000000000111\n/.test(mails[0].text) && !/Campaign:/.test(mails[0].text), mails[0] && mails[0].text);
  G.noAds = false;

  // 9. The lead cannot be read: no token yet.
  env = leadEnv({ META_PAGE_TOKEN: '' }); clear();
  r = await leadHook(notice(L2));
  const stub = fbLeads()[0], sm = sent(/^New Facebook lead: open Leads Center to read it$/)[0];
  ok('no token yet: the office is still emailed the lead id and where to read the lead, and Meta is told to send it again', r.status === 503 && !!sm && sm.text.includes('Lead id: ' + L2 + '\n') && /Leads Center/.test(sm.text) && /META_PAGE_TOKEN/.test(sm.text) && /keeps trying for 36 hours/.test(sm.text), [r, sm && sm.text]);
  ok('the lead is saved as not read yet, so it shows in the office app', !!stub && stub.name === 'Facebook lead, not read yet' && /^Facebook lead ad, not read yet\. /.test(stub.details) && stub.details.endsWith('Meta lead id ' + L2), stub);
  ok('the Health tab says why', T.errors.filter((e) => /could not be read from Meta/.test(e.message)).length === 1 && /META_PAGE_TOKEN/.test(T.errors[0].detail), T.errors);
  r = await leadHook(notice(L2));
  ok('Meta sends it again with the token still missing: 503 again, and the office is not emailed twice', r.status === 503 && mails.length === 1 && fbLeads().length === 1, [r, mails.length]);
  env = leadEnv();
  r = await leadHook(notice(L2));
  ok('the token is added and Meta sends it again: the row fills in, the full email goes out, and Meta gets 200', r.status === 200 && fbLeads().length === 1 && fbLeads()[0].id === stub.id && fbLeads()[0].name === 'Sam Reyes' && fbLeads()[0].phone === '6235550177'
    && /^Instagram lead ad\. /.test(fbLeads()[0].details) && sent(/^New Instagram lead: Sam Reyes/).length === 1 && mails.length === 2, [r, fbLeads()[0], mails.map((x) => x.subject)]);
  r = await leadHook(notice(L2));
  ok('and once more: nothing new', r.status === 200 && mails.length === 2 && fbLeads().length === 1);

  // 10. A dead token, Meta down, and a lead the token cannot see.
  clear(); G.dead = true;
  r = await leadHook(notice(L4));
  ok('a dead token: the office is told the token has ended, in plain words, with what Meta said', r.status === 503 && /has ended or is not valid/.test(mails[0].text) && /Session has expired/.test(mails[0].text) && /code 190/.test(mails[0].text) && fbLeads().length === 1, mails[0] && mails[0].text);
  G.dead = false; clear(); G.down = true;
  r = await leadHook(notice(L5));
  ok('Meta is down: each call is tried twice, then the office is told and Meta is asked to send it again', r.status === 503 && /Meta did not answer/.test(mails[0].text) && G.calls.filter((c) => c.path === L5 && /campaign_name/.test(c.fields)).length === 2, [mails[0] && mails[0].text, G.calls.length]);
  G.down = false;
  r = await leadHook(notice(L5));
  ok('Meta is back: the same lead is finished', r.status === 200 && fbLeads().length === 1 && fbLeads()[0].name === 'Pat Moss' && mails.length === 2, [r, fbLeads()[0]]);
  clear();
  r = await leadHook(notice('900000000000099'));
  ok('a lead the token cannot see: the office is told it needs lead access', r.status === 503 && /not allowed to read this lead/.test(mails[0].text) && /Leads Access/.test(mails[0].text), mails[0] && mails[0].text);

  // 11. An old unread lead is finished when the next lead proves the token works.
  ok('that unread lead is still waiting', fbLeads().length === 1 && /not read yet/.test(fbLeads()[0].details));
  G.leads['900000000000099'] = { id: '900000000000099', created_time: '2026-11-17T06:50:00+0000', form_id: FORM, platform: 'fb', field_data: [{ name: 'full_name', values: ['Ana Ruiz'] }, { name: 'phone_number', values: ['6235550155'] }] };
  reset();
  r = await leadHook(notice(L4));
  ok('when a later lead is read fine, the waiting one is tried again and finished too', r.status === 200 && fbLeads().length === 2 && fbLeads().every((l) => !/not read yet/.test(l.details)) && sent(/^New Facebook lead: Ana Ruiz$/).length === 1 && sent(/^New Facebook lead: Lee Park$/).length === 1, [fbLeads(), mails.map((x) => x.subject)]);
  delete G.leads['900000000000099'];

  // 12. The email does not send.
  clear(); MAIL.down = true;
  r = await leadHook(notice(L1));
  ok('the mail service is down: the lead is saved, marked email not sent, and Meta is told to send it again', r.status === 503 && fbLeads().length === 1 && /^Facebook lead ad, email not sent\. /.test(fbLeads()[0].details) && fbLeads()[0].name === 'Dana Lopez' && mails.length === 0, [r, fbLeads()[0]]);
  MAIL.down = false;
  ok('the Health tab says the email did not send and that the lead is saved', T.errors.some((e) => /email to the office did not send/.test(e.message) && /is saved in the office app/.test(e.detail)), T.errors);
  r = await leadHook(notice(L1));
  ok('mail is back: one email, the mark comes off, 200', r.status === 200 && mails.length === 1 && fbLeads().length === 1 && /^Facebook lead ad\. /.test(fbLeads()[0].details) && sent(/^New Facebook lead: Dana Lopez/).length === 1, [r, fbLeads()[0]]);

  // 13. The database does not answer.
  clear(); DBX.leadsDown = true;
  r = await leadHook(notice(L4));
  ok('the leads table is down: the lead is still emailed to the office in full', r.status === 200 && fbLeads().length === 0 && sent(/^New Facebook lead: Lee Park$/).length === 1, [r, mails.map((x) => x.subject)]);
  DBX.leadsDown = false;

  // 14. Two notices for one lead at the same moment.
  clear();
  const both = await Promise.all([leadHook(notice(L1)), leadHook(notice(L1))]);
  ok('the same lead twice at once: one row is kept and the office gets one email', fbLeads().length === 1 && sent(/^New Facebook lead: Dana Lopez/).length === 1 && both.every((x) => x.status === 200 || x.status === 503), [both, fbLeads().length, mails.map((x) => x.subject)]);

  // 15. Only our Page, and a big notice.
  env = leadEnv({ META_PAGE_ID: '999' }); clear();
  r = await leadHook(notice(L1));
  ok('with META_PAGE_ID set, a lead from another Page is left alone', r.status === 200 && r.d.leads === 0 && fbLeads().length === 0 && mails.length === 0, r);
  env = leadEnv(); clear();
  const many = ['900000000000011', '900000000000012', '900000000000013', '900000000000014', '900000000000015', '900000000000016', '900000000000017'];
  for (const idm of many) G.leads[idm] = { id: idm, created_time: '2026-11-17T07:00:00+0000', form_id: FORM, platform: 'fb', field_data: [{ name: 'full_name', values: ['Lead ' + idm.slice(-2)] }, { name: 'phone_number', values: ['62355501' + idm.slice(-2)] }] };
  r = await leadHook(notice(...many));
  ok('seven leads in one notice: five are done and Meta is asked to send the notice again', r.status === 503 && fbLeads().length === 5 && mails.length === 5, [r, fbLeads().length]);
  r = await leadHook(notice(...many));
  ok('the second time the last two are done, nobody is emailed twice, and Meta gets 200', r.status === 200 && fbLeads().length === 7 && mails.length === 7 && new Set(mails.map((x) => x.subject)).size === 7, [r, fbLeads().length, mails.length]);
  for (const idm of many) delete G.leads[idm];
  const big = await worker.fetch(new Request('https://arizonapetwaste.com/api/meta/leadgen', { method: 'POST', body: 'x'.repeat(1100000), headers: { 'content-length': '1100000' } }), env, ctx);
  ok('a notice past the size cap is refused', big.status === 413, big.status);
  ok('Facebook leads count as sign up requests in the office app, and the website form still takes its own', (await call('/api/request', 'POST', Object.assign({}, good, { email: 'after-fb@example.com' }))).status === 200);
  clear(); env = Object.assign({}, baseEnv); G.subs = []; }

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
    && !!walk(cs, ['payment_method_types', '0'], 'card') && !walk(cs, ['allowed_payment_method_types', '0'], 'card') && !walk(cs, ['wallet_options', 'link', 'display'], 'never') && !!walk(cs, ['wallet_options', 'link', 'display'], 'off')
    && !walk(cs, ['subscription_data', 'metadata', 'anything'], 'x') && !walk(cs, ['metadata', 'anything'], 'x'));
  failN += bad;
}

if (process.env.MAIL_OUT) fs.writeFileSync(process.env.MAIL_OUT, JSON.stringify(MAIL.all));
console.log('\n' + pass + ' passed, ' + failN + ' failed');
process.exit(failN ? 1 : 0);
